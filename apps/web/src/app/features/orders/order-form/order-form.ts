import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import {
  DeviceModel,
  DraftLine,
  MAX_ORDER_LINES,
  OrderDraft,
  Site,
  UserChanges,
  ValidationIssue,
  VoiceUser,
} from '@provisioning/contracts';
import { normalizeMac } from './mac-address';

/**
 * The typed reactive form behind the order builder: a FormArray with one group per
 * order line, the validators the client can check before asking the server, and the
 * conversions to and from the contract's OrderDraft.
 *
 * The server stays the authority: whatever passes here is still previewed and
 * re-validated by the API, and its findings are put back on the lines (applyIssues).
 */

export type LineAction = DraftLine['action'];

/** A user picked in an autocomplete; plain text while the person is still typing. */
export type UserChoice = VoiceUser | string | null;

export type AddUserLine = FormGroup<{
  action: FormControl<'add_user'>;
  siteId: FormControl<string>;
  firstName: FormControl<string>;
  lastName: FormControl<string>;
  email: FormControl<string>;
  /** Empty means "assign the next free extension". */
  extension: FormControl<string>;
  /** Empty means "assign the next available number at the site". */
  did: FormControl<string>;
  voicemail: FormControl<boolean>;
  deviceModel: FormControl<string | null>;
  /** Enabled only for devices that take a MAC address. */
  macAddress: FormControl<string>;
}>;

export type ChangeUserLine = FormGroup<{
  action: FormControl<'update_user'>;
  user: FormControl<UserChoice>;
  voicemail: FormControl<boolean>;
  deviceModel: FormControl<string | null>;
  macAddress: FormControl<string>;
}>;

export type RemoveUserLine = FormGroup<{
  action: FormControl<'remove_user'>;
  user: FormControl<UserChoice>;
}>;

export type OrderLine = AddUserLine | ChangeUserLine | RemoveUserLine;

/** What the validators need to know about the account. Read lazily, so it can load later. */
export interface OrderFormContext {
  readonly sites: readonly Site[];
  readonly users: readonly VoiceUser[];
  readonly devices: readonly DeviceModel[];
}

export interface AddUserValues {
  readonly siteId?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly email?: string;
  readonly extension?: string;
  readonly did?: string;
  readonly voicemail?: boolean;
  readonly deviceModel?: string | null;
  readonly macAddress?: string | null;
}

export interface ChangeUserValues {
  readonly user?: VoiceUser | null;
  readonly voicemail?: boolean;
  readonly deviceModel?: string | null;
  readonly macAddress?: string | null;
}

export const isAddLine = (line: OrderLine): line is AddUserLine =>
  line.controls.action.value === 'add_user';
export const isChangeLine = (line: OrderLine): line is ChangeUserLine =>
  line.controls.action.value === 'update_user';
export const isRemoveLine = (line: OrderLine): line is RemoveUserLine =>
  line.controls.action.value === 'remove_user';

/** The selected user of a change or remove line, once one is picked from the list. */
export function pickedUser(line: ChangeUserLine | RemoveUserLine): VoiceUser | null {
  const value = line.controls.user.value;
  return value !== null && typeof value === 'object' ? value : null;
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

const EXTENSION = /^\d{3,6}$/;
// Close to what the API accepts (zod's email), strict enough to catch typos early.
const EMAIL = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Required, and not just spaces. */
export const requiredText: ValidatorFn = (control) =>
  typeof control.value === 'string' && control.value.trim() === '' ? { required: true } : null;

export const emailAddress: ValidatorFn = (control) =>
  control.value && !EMAIL.test(String(control.value).trim()) ? { email: true } : null;

export const macAddress: ValidatorFn = (control) =>
  control.value && normalizeMac(String(control.value)) === null ? { macAddress: true } : null;

/** A change or remove line needs a user chosen from the list, not just typed text. */
export const userPicked: ValidatorFn = (control) => {
  const value = control.value as UserChoice;
  if (value === null || value === '') {
    return { required: true };
  }
  return typeof value === 'string' ? { userNotPicked: true } : null;
};

/** Extension format, inside the chosen site's range, and not already someone's. */
export function extensionValidator(context: () => OrderFormContext): ValidatorFn {
  return (control) => {
    const extension = String(control.value ?? '').trim();
    if (!extension) {
      return null;
    }
    if (!EXTENSION.test(extension)) {
      return { extensionFormat: true };
    }
    const siteId = control.parent?.get('siteId')?.value as string | undefined;
    const site = context().sites.find((s) => s.id === siteId);
    if (site) {
      const { start, end } = site.extensionRange;
      const n = Number(extension);
      if (n < Number(start) || n > Number(end)) {
        return { extensionRange: { start, end, site: site.name } };
      }
    }
    const owner = context().users.find((user) => user.extension === extension);
    return owner ? { extensionTaken: { owner: `${owner.firstName} ${owner.lastName}` } } : null;
  };
}

/** Email addresses are unique within an account. */
export function emailAvailableValidator(context: () => OrderFormContext): ValidatorFn {
  return (control) => {
    const email = String(control.value ?? '');
    const owner = email ? context().users.find((user) => sameText(user.email, email)) : undefined;
    return owner ? { emailTaken: { owner: `${owner.firstName} ${owner.lastName}` } } : null;
  };
}

/** Angular's minLength ignores empty arrays; an order needs at least one line. */
export const atLeastOneLine: ValidatorFn = (control) =>
  (control as FormArray).length === 0 ? { required: true } : null;

/** A change line must change something about the user it picked. */
export const changesSomething: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const line = group as ChangeUserLine;
  const user = pickedUser(line);
  return user && Object.keys(changesFor(line, user)).length === 0 ? { noChanges: true } : null;
};

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

const text = (value = '') => new FormControl(value, { nonNullable: true });

/**
 * The order being built: a typed FormArray plus the operations the builder offers.
 * Plain class over Angular forms (no DI), so it is easy to test on its own.
 */
export class OrderForm {
  readonly lines = new FormArray<OrderLine>([], {
    validators: [atLeastOneLine, Validators.maxLength(MAX_ORDER_LINES)],
  });

  constructor(private readonly context: () => OrderFormContext) {}

  get length(): number {
    return this.lines.length;
  }

  get full(): boolean {
    return this.lines.length >= MAX_ORDER_LINES;
  }

  addUser(values: AddUserValues = {}, at = this.lines.length): AddUserLine {
    const line: AddUserLine = new FormGroup({
      action: new FormControl('add_user' as const, { nonNullable: true }),
      siteId: new FormControl(values.siteId ?? this.defaultSiteId(), {
        nonNullable: true,
        validators: Validators.required,
      }),
      firstName: new FormControl(values.firstName ?? '', {
        nonNullable: true,
        validators: [requiredText, Validators.maxLength(60)],
      }),
      lastName: new FormControl(values.lastName ?? '', {
        nonNullable: true,
        validators: [requiredText, Validators.maxLength(60)],
      }),
      email: new FormControl(values.email ?? '', {
        nonNullable: true,
        validators: [
          requiredText,
          emailAddress,
          Validators.maxLength(254),
          emailAvailableValidator(this.context),
        ],
      }),
      extension: new FormControl(values.extension ?? '', {
        nonNullable: true,
        validators: extensionValidator(this.context),
      }),
      did: text(values.did),
      voicemail: new FormControl(values.voicemail ?? true, { nonNullable: true }),
      deviceModel: new FormControl<string | null>(values.deviceModel ?? null),
      macAddress: new FormControl(values.macAddress ?? '', {
        nonNullable: true,
        validators: macAddress,
      }),
    });
    // The extension range and the free numbers depend on the site.
    line.controls.siteId.valueChanges.subscribe(() => {
      line.controls.extension.updateValueAndValidity({ emitEvent: false });
      line.controls.did.setValue('');
    });
    this.syncMacAddress(line);
    this.lines.insert(at, line);
    return line;
  }

  changeUser(values: ChangeUserValues = {}, at = this.lines.length): ChangeUserLine {
    const user = values.user ?? null;
    const line: ChangeUserLine = new FormGroup(
      {
        action: new FormControl('update_user' as const, { nonNullable: true }),
        user: new FormControl<UserChoice>(user, { validators: userPicked }),
        voicemail: new FormControl(values.voicemail ?? user?.voicemail ?? false, {
          nonNullable: true,
        }),
        deviceModel: new FormControl<string | null>(
          values.deviceModel !== undefined ? values.deviceModel : (user?.device?.model ?? null),
        ),
        macAddress: new FormControl(
          values.macAddress !== undefined
            ? (values.macAddress ?? '')
            : (user?.device?.macAddress ?? ''),
          { nonNullable: true, validators: macAddress },
        ),
      },
      { validators: changesSomething },
    );
    // Picking a user starts from their current settings.
    let previous = user;
    line.controls.user.valueChanges.subscribe((choice) => {
      const picked = choice !== null && typeof choice === 'object' ? choice : null;
      if (picked && picked !== previous) {
        line.patchValue({
          voicemail: picked.voicemail,
          deviceModel: picked.device?.model ?? null,
          macAddress: picked.device?.macAddress ?? '',
        });
      }
      previous = picked;
    });
    this.syncMacAddress(line);
    this.lines.insert(at, line);
    return line;
  }

  removeUser(user: VoiceUser | null = null, at = this.lines.length): RemoveUserLine {
    const line: RemoveUserLine = new FormGroup({
      action: new FormControl('remove_user' as const, { nonNullable: true }),
      user: new FormControl<UserChoice>(user, { validators: userPicked }),
    });
    this.lines.insert(at, line);
    return line;
  }

  /** Copies a line just below itself. A new user gets blank identity fields, since those must be unique. */
  duplicate(index: number): OrderLine {
    const line = this.lines.at(index);
    if (isAddLine(line)) {
      const { siteId, voicemail, deviceModel } = line.getRawValue();
      return this.addUser({ siteId, voicemail, deviceModel }, index + 1);
    }
    if (isChangeLine(line)) {
      const { voicemail, deviceModel } = line.getRawValue();
      return this.changeUser({ voicemail, deviceModel, user: null }, index + 1);
    }
    return this.removeUser(null, index + 1);
  }

  remove(index: number): void {
    this.lines.removeAt(index);
  }

  clear(): void {
    this.lines.clear();
  }

  /** Replaces every line with the lines of a draft, e.g. one the assistant produced. */
  load(draft: OrderDraft): void {
    this.lines.clear();
    const users = new Map(this.context().users.map((user) => [user.id, user]));
    for (const line of draft.lines) {
      if (line.action === 'add_user') {
        this.addUser({
          ...line,
          extension: line.extension ?? '',
          did: line.did ?? '',
          macAddress: line.macAddress ?? '',
        });
      } else if (line.action === 'update_user') {
        const user = users.get(line.userId) ?? null;
        const { changes } = line;
        this.changeUser({
          user,
          voicemail: changes.voicemail,
          deviceModel: changes.deviceModel,
          macAddress: changes.macAddress,
        });
      } else {
        this.removeUser(users.get(line.userId) ?? null);
      }
    }
  }

  /** The draft to preview. Call only when the form is valid. */
  toDraft(): OrderDraft {
    return { lines: this.lines.controls.map((line) => this.toDraftLine(line)) };
  }

  /**
   * Puts the server's error-severity findings on the lines they belong to: on the
   * field when there is one (shown under it), otherwise on the whole line. Either
   * clears as soon as the person edits it. Warnings stay on the review.
   */
  applyIssues(issues: readonly ValidationIssue[]): void {
    for (const issue of issues) {
      if (issue.severity !== 'error' || issue.lineIndex === null) {
        continue;
      }
      const line = this.lines.at(issue.lineIndex) as OrderLine | undefined;
      if (!line) {
        continue;
      }
      const control = controlForField(line, issue.field);
      const target: AbstractControl = control ?? line;
      target.setErrors({ ...target.errors, server: issue.message });
      target.markAsTouched();
    }
  }

  /** A server message about a whole line rather than one field. */
  lineError(line: OrderLine): string | null {
    const server = line.errors?.['server'];
    return typeof server === 'string' ? server : null;
  }

  requiresMac(deviceId: string | null): boolean {
    return !!deviceId && !!this.context().devices.find((d) => d.id === deviceId)?.requiresMac;
  }

  private toDraftLine(line: OrderLine): DraftLine {
    if (isAddLine(line)) {
      const value = line.getRawValue();
      const extension = value.extension.trim();
      const mac = this.requiresMac(value.deviceModel) ? normalizeMac(value.macAddress) : null;
      return {
        action: 'add_user',
        siteId: value.siteId,
        firstName: value.firstName.trim(),
        lastName: value.lastName.trim(),
        email: value.email.trim(),
        ...(extension ? { extension } : {}),
        ...(value.did ? { did: value.did } : {}),
        voicemail: value.voicemail,
        deviceModel: value.deviceModel,
        macAddress: mac,
      };
    }
    const user = pickedUser(line);
    if (!user) {
      throw new Error('Every change and remove line needs a user before it can be previewed.');
    }
    if (isRemoveLine(line)) {
      return { action: 'remove_user', userId: user.id };
    }
    return { action: 'update_user', userId: user.id, changes: changesFor(line, user) };
  }

  private defaultSiteId(): string {
    // New lines follow the site of the line above, or the account's only site.
    const previous = [...this.lines.controls].reverse().find(isAddLine);
    if (previous) {
      return previous.controls.siteId.value;
    }
    const sites = this.context().sites;
    return sites.length === 1 ? (sites[0]?.id ?? '') : '';
  }

  /** The MAC field only exists for hardware that takes one; disabled controls skip validation. */
  private syncMacAddress(line: AddUserLine | ChangeUserLine): void {
    const apply = (deviceId: string | null) => {
      const mac = line.controls.macAddress;
      if (this.requiresMac(deviceId)) {
        mac.enable({ emitEvent: false });
      } else {
        mac.disable({ emitEvent: false });
      }
    };
    apply(line.controls.deviceModel.value);
    line.controls.deviceModel.valueChanges.subscribe((deviceId) => {
      apply(deviceId);
      line.updateValueAndValidity({ emitEvent: false });
    });
  }
}

/** What a change line changes, compared with the user's current settings. */
export function changesFor(line: ChangeUserLine, user: VoiceUser): UserChanges {
  const { voicemail, deviceModel, macAddress } = line.getRawValue();
  const currentDevice = user.device?.model ?? null;
  const currentMac = user.device?.macAddress ?? null;
  const changes: { voicemail?: boolean; deviceModel?: string | null; macAddress?: string | null } =
    {};
  if (voicemail !== user.voicemail) {
    changes.voicemail = voicemail;
  }
  if (deviceModel !== currentDevice) {
    changes.deviceModel = deviceModel;
  }
  if (deviceModel !== null && !line.controls.macAddress.disabled) {
    const mac = normalizeMac(macAddress);
    if (mac !== currentMac && (mac !== null || deviceModel === currentDevice)) {
      changes.macAddress = mac;
    }
  }
  return changes as UserChanges;
}

/** The control an API issue's `field` points at, e.g. "user.extension" -> extension. */
function controlForField(line: OrderLine, field: string | null): AbstractControl | null {
  if (!field) {
    return null;
  }
  const group: AbstractControl = line;
  if (field === 'userId' || field === 'before') {
    return group.get('user');
  }
  return group.get(field.replace(/^(user|after|changes)\./, ''));
}
