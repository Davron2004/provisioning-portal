import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { AbstractControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DeviceModel, PhoneNumber, Site, VoiceUser } from '@provisioning/contracts';
import { AppIcon } from '../../../core/icons/icons';
import { deviceName } from '../../../shared/format/labels';
import { formatPhoneNumber } from '../../../shared/pipes/phone-number.pipe';
import {
  AddUserLine,
  LineAction,
  OrderForm,
  OrderLine,
  isAddLine,
  isChangeLine,
  isRemoveLine,
  pickedUser,
} from '../order-form/order-form';
import { normalizeMac } from '../order-form/mac-address';
import { fieldError, showsFieldError, watchControl } from './field-errors';
import { UserPicker } from './user-picker';

const KINDS: Readonly<Record<LineAction, { label: string; icon: AppIcon }>> = {
  add_user: { label: 'Add user', icon: 'person_add' },
  update_user: { label: 'Change user', icon: 'manage_accounts' },
  remove_user: { label: 'Remove user', icon: 'person_remove' },
};

/** "Priya", "Shah", "example.com" -> "priya.shah@example.com", accents and spaces dropped. */
export function suggestEmail(firstName: string, lastName: string, domain: string): string {
  const part = (name: string) =>
    name
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  const local = [part(firstName), part(lastName)].filter(Boolean).join('.');
  return local && domain ? `${local}@${domain}` : '';
}

/** One line of the order builder: its fields, and buttons to duplicate or remove it. */
@Component({
  selector: 'app-order-line-editor',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
    ReactiveFormsModule,
    UserPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-action]': 'line().controls.action.value',
    '[class.has-error]': 'showsError()',
  },
  templateUrl: './order-line-editor.html',
  styleUrl: './order-line-editor.scss',
})
export class OrderLineEditor {
  readonly line = input.required<OrderLine>();
  readonly index = input.required<number>();
  readonly form = input.required<OrderForm>();
  readonly sites = input.required<readonly Site[]>();
  readonly users = input.required<readonly VoiceUser[]>();
  readonly numbers = input.required<readonly PhoneNumber[]>();
  readonly devices = input.required<readonly DeviceModel[]>();
  /** Numbers and users that other lines already use. */
  readonly takenNumbers = input<ReadonlySet<string>>(new Set());
  readonly takenUsers = input<ReadonlySet<string>>(new Set());
  /** The account's email domain, to suggest addresses for new users. */
  readonly emailDomain = input('');
  readonly canDuplicate = input(true);

  readonly duplicate = output();
  readonly remove = output();

  protected readonly tick = watchControl(this.line);
  protected readonly kind = computed(() => KINDS[this.line().controls.action.value]);
  protected readonly add = computed(() => {
    const line = this.line();
    return isAddLine(line) ? line : null;
  });
  protected readonly change = computed(() => {
    const line = this.line();
    return isChangeLine(line) ? line : null;
  });
  protected readonly removal = computed(() => {
    const line = this.line();
    return isRemoveLine(line) ? line : null;
  });

  protected readonly deviceLine = computed(() => this.add() ?? this.change());
  protected readonly pickerControl = computed(() => {
    const line = this.change() ?? this.removal();
    if (!line) {
      throw new Error('Only change and remove lines pick a user.');
    }
    return line.controls.user;
  });

  /** The user a change or remove line points at, once picked. */
  protected readonly user = computed(() => {
    this.tick();
    const line = this.line();
    return isAddLine(line) ? null : pickedUser(line);
  });

  protected readonly site = computed(() => {
    this.tick();
    const id = this.add()?.controls.siteId.value;
    return this.sites().find((site) => site.id === id);
  });

  /** Free numbers at the line's site that no other line has taken. */
  protected readonly siteNumbers = computed(() => {
    const site = this.site();
    const taken = this.takenNumbers();
    return site ? this.numbers().filter((n) => n.siteId === site.id && !taken.has(n.e164)) : [];
  });

  protected readonly macVisible = computed(() => {
    this.tick();
    const line = this.line();
    return !isRemoveLine(line) && !line.controls.macAddress.disabled;
  });

  /** "Nothing changes" only matters once the person has worked on the line. */
  protected readonly noChanges = computed(() => {
    this.tick();
    const line = this.change();
    return !!line && line.hasError('noChanges') && line.touched;
  });
  protected readonly lineError = computed(() => {
    this.tick();
    return this.form().lineError(this.line());
  });

  /** Any error on the card: the stripe and border switch to the error tone. */
  protected readonly showsError = computed(() => {
    this.tick();
    return this.noChanges() || !!this.lineError() || showsFieldError(this.line());
  });

  protected readonly excludedUsers = computed(() => {
    this.tick();
    const own = this.user()?.id;
    const taken = new Set(this.takenUsers());
    if (own) {
      taken.delete(own);
    }
    return taken;
  });

  protected readonly userSummary = computed(() => {
    const user = this.user();
    if (!user) {
      return null;
    }
    const site = this.sites().find((s) => s.id === user.siteId)?.name;
    const device = deviceName(this.devices(), user.device?.model) ?? 'No device';
    return [
      `Ext ${user.extension}`,
      user.did ? formatPhoneNumber(user.did) : 'No number',
      site,
      `Voicemail ${user.voicemail ? 'on' : 'off'}`,
      device,
    ]
      .filter(Boolean)
      .join(' · ');
  });

  protected readonly formatPhoneNumber = formatPhoneNumber;

  protected error(control: AbstractControl, label: string): string {
    this.tick();
    return fieldError(control, label);
  }

  /** Fills in first.last@domain when the email is still empty. */
  protected suggestEmailFor(line: AddUserLine): void {
    const { firstName, lastName, email } = line.controls;
    if (email.value.trim() || !firstName.value.trim() || !lastName.value.trim()) {
      return;
    }
    const suggestion = suggestEmail(firstName.value, lastName.value, this.emailDomain());
    if (suggestion) {
      email.setValue(suggestion);
    }
  }

  /** Tidies a valid MAC address into the canonical form when the field loses focus. */
  protected tidyMac(control: AbstractControl<string>): void {
    const mac = normalizeMac(control.value);
    if (mac && mac !== control.value) {
      control.setValue(mac);
    }
  }
}
