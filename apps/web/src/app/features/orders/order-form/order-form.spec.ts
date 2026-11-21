import { MAX_ORDER_LINES, OrderDraft } from '@provisioning/contracts';
import { aDevice, aSite, aUser } from '../../../../testing/fixtures';
import { normalizeMac } from './mac-address';
import {
  AddUserLine,
  ChangeUserLine,
  OrderForm,
  OrderFormContext,
  isAddLine,
  isChangeLine,
  isRemoveLine,
} from './order-form';

const kanata = aSite();
const ottawa = aSite({
  id: 'site_ottawa',
  name: 'Ottawa HQ',
  extensionRange: { start: '2000', end: '2099' },
});
const ada = aUser();
const grace = aUser({
  id: 'usr_0002',
  firstName: 'Grace',
  lastName: 'Hopper',
  email: 'grace.hopper@northwind.example.com',
  extension: '2102',
  voicemail: false,
  device: null,
});
const deskPhone = aDevice();
const softphone = aDevice({ id: 'softphone', name: 'Softphone', requiresMac: false });

const context: OrderFormContext = {
  sites: [kanata, ottawa],
  users: [ada, grace],
  devices: [deskPhone, softphone],
};

function fillAdd(line: AddUserLine, overrides: Partial<AddUserLine['value']> = {}): void {
  line.patchValue({
    siteId: 'site_kanata',
    firstName: 'Priya',
    lastName: 'Shah',
    email: 'priya.shah@northwind.example.com',
    ...overrides,
  });
}

describe('normalizeMac', () => {
  it.each([
    ['001a2b3c4d5e', '00:1A:2B:3C:4D:5E'],
    ['00-1a-2b-3c-4d-5e', '00:1A:2B:3C:4D:5E'],
    [' 00:1A:2B:3C:4D:5E ', '00:1A:2B:3C:4D:5E'],
    ['001a.2b3c.4d5e', '00:1A:2B:3C:4D:5E'],
  ])('reads %s as %s', (input, expected) => {
    expect(normalizeMac(input)).toBe(expected);
  });

  it.each(['', '00:1A:2B', 'zz:1A:2B:3C:4D:5E', null])('rejects %s', (input) => {
    expect(normalizeMac(input)).toBeNull();
  });
});

describe('OrderForm', () => {
  let form: OrderForm;

  beforeEach(() => {
    form = new OrderForm(() => context);
  });

  describe('add user lines', () => {
    it('needs a site, names and a valid, unused email', () => {
      const line = form.addUser();
      expect(line.controls.siteId.hasError('required')).toBe(true);
      expect(line.controls.firstName.hasError('required')).toBe(true);

      line.controls.firstName.setValue('   ');
      expect(line.controls.firstName.hasError('required')).toBe(true);

      line.controls.email.setValue('priya@');
      expect(line.controls.email.hasError('email')).toBe(true);

      line.controls.email.setValue('ADA.Lovelace@northwind.example.com');
      expect(line.controls.email.getError('emailTaken')).toEqual({ owner: 'Ada Lovelace' });

      fillAdd(line);
      expect(line.valid).toBe(true);
    });

    it('leaves the extension to the server unless one is typed, then checks it against the site', () => {
      const line = form.addUser();
      fillAdd(line);
      expect(line.controls.extension.valid).toBe(true);

      line.controls.extension.setValue('21a');
      expect(line.controls.extension.hasError('extensionFormat')).toBe(true);

      line.controls.extension.setValue('2050');
      expect(line.controls.extension.getError('extensionRange')).toEqual({
        start: '2100',
        end: '2199',
        site: 'Kanata Campus',
      });

      // Moving the line to another site re-checks the extension against its range.
      line.controls.siteId.setValue('site_ottawa');
      expect(line.controls.extension.valid).toBe(true);

      line.controls.siteId.setValue('site_kanata');
      line.controls.extension.setValue('2101');
      expect(line.controls.extension.getError('extensionTaken')).toEqual({
        owner: 'Ada Lovelace',
      });
    });

    it('forgets a chosen number when the site changes, since numbers belong to a site', () => {
      const line = form.addUser();
      fillAdd(line, { did: '+16135550100' });
      line.controls.siteId.setValue('site_ottawa');
      expect(line.controls.did.value).toBe('');
    });

    it('asks for a MAC address only for hardware that takes one', () => {
      const line = form.addUser();
      fillAdd(line);
      const mac = line.controls.macAddress;
      expect(mac.disabled).toBe(true);

      line.controls.deviceModel.setValue('dev_d200');
      expect(mac.enabled).toBe(true);
      // Optional: the server warns and provisions without device configuration.
      expect(line.valid).toBe(true);

      mac.setValue('not a mac');
      expect(mac.hasError('macAddress')).toBe(true);
      expect(line.valid).toBe(false);

      // Switching to a softphone drops the field, and with it the bad value.
      line.controls.deviceModel.setValue('softphone');
      expect(mac.disabled).toBe(true);
      expect(line.valid).toBe(true);
    });

    it('follows the site of the line above for new lines', () => {
      fillAdd(form.addUser(), { siteId: 'site_ottawa' });
      expect(form.addUser().controls.siteId.value).toBe('site_ottawa');
    });
  });

  describe('change user lines', () => {
    it('starts from the picked user’s settings and must change something', () => {
      const line = form.changeUser();
      expect(line.controls.user.hasError('required')).toBe(true);

      line.controls.user.setValue('Ada');
      expect(line.controls.user.hasError('userNotPicked')).toBe(true);

      line.controls.user.setValue(ada);
      expect(line.getRawValue()).toMatchObject({
        voicemail: true,
        deviceModel: 'dev_d200',
        macAddress: '00:1A:2B:3C:4D:5E',
      });
      expect(line.hasError('noChanges')).toBe(true);

      line.controls.voicemail.setValue(false);
      expect(line.valid).toBe(true);
    });

    it('sends only what differs from the user', () => {
      const line = form.changeUser({ user: grace });
      line.patchValue({ deviceModel: 'dev_d200', macAddress: '00-1a-2b-3c-4d-60' });
      expect(form.toDraft().lines[0]).toEqual({
        action: 'update_user',
        userId: 'usr_0002',
        changes: { deviceModel: 'dev_d200', macAddress: '00:1A:2B:3C:4D:60' },
      });

      line.patchValue({ deviceModel: null });
      line.controls.voicemail.setValue(true);
      expect(form.toDraft().lines[0]).toEqual({
        action: 'update_user',
        userId: 'usr_0002',
        changes: { voicemail: true },
      });
    });
  });

  describe('lines', () => {
    it('adds, duplicates below, and removes lines of each kind', () => {
      fillAdd(form.addUser(), { voicemail: false, deviceModel: 'softphone' });
      form.changeUser({ user: ada, voicemail: false });
      form.removeUser(grace);

      const copy = form.duplicate(0) as AddUserLine;
      expect(form.lines.controls.map((line) => line.controls.action.value)).toEqual([
        'add_user',
        'add_user',
        'update_user',
        'remove_user',
      ]);
      // Settings carry over; the identity must be unique, so it starts blank.
      expect(copy.getRawValue()).toMatchObject({
        siteId: 'site_kanata',
        voicemail: false,
        deviceModel: 'softphone',
        firstName: '',
        email: '',
      });

      expect(isChangeLine(form.duplicate(2))).toBe(true);
      expect(isRemoveLine(form.duplicate(4))).toBe(true);

      form.remove(0);
      expect(form.length).toBe(5);
      expect(isAddLine(form.lines.at(0))).toBe(true);
    });

    it('is invalid with no lines and stops at the order limit', () => {
      expect(form.lines.valid).toBe(false);
      for (let i = 0; i < MAX_ORDER_LINES; i++) {
        form.removeUser(ada);
      }
      expect(form.full).toBe(true);
    });
  });

  describe('drafts', () => {
    it('turns the lines into a draft, leaving out what the server should assign', () => {
      fillAdd(form.addUser(), {
        firstName: ' Priya ',
        deviceModel: 'dev_d200',
        macAddress: '001a2b3c4d99',
      });
      fillAdd(form.addUser(), {
        firstName: 'Tom',
        lastName: 'Lee',
        email: 'tom.lee@northwind.example.com',
        extension: '2150',
        did: '+16135550111',
        voicemail: false,
      });
      form.removeUser(grace);

      const draft = form.toDraft();
      expect(draft.lines[0]).toEqual({
        action: 'add_user',
        siteId: 'site_kanata',
        firstName: 'Priya',
        lastName: 'Shah',
        email: 'priya.shah@northwind.example.com',
        voicemail: true,
        deviceModel: 'dev_d200',
        macAddress: '00:1A:2B:3C:4D:99',
      });
      expect(draft.lines[1]).toMatchObject({ extension: '2150', did: '+16135550111' });
      expect(draft.lines[2]).toEqual({ action: 'remove_user', userId: 'usr_0002' });
    });

    it('loads a draft, e.g. from the assistant, resolving users by id', () => {
      const draft: OrderDraft = {
        lines: [
          {
            action: 'add_user',
            siteId: 'site_kanata',
            firstName: 'New',
            lastName: 'User 01',
            email: 'new.user.kanata.01@northwind.example.com',
            voicemail: true,
            deviceModel: null,
            macAddress: null,
          },
          { action: 'update_user', userId: 'usr_0001', changes: { voicemail: false } },
          { action: 'remove_user', userId: 'usr_0002' },
        ],
      };
      fillAdd(form.addUser());
      form.load(draft);

      expect(form.length).toBe(3);
      const change = form.lines.at(1) as ChangeUserLine;
      expect(change.controls.user.value).toBe(ada);
      expect(change.controls.voicemail.value).toBe(false);
      expect(change.controls.deviceModel.value).toBe('dev_d200');
      expect(form.lines.valid).toBe(true);
      expect(form.toDraft()).toEqual(draft);
    });
  });

  describe('server issues', () => {
    it('puts errors on the field they name, or on the whole line, until it is edited', () => {
      const add = form.addUser();
      fillAdd(add);
      const change = form.changeUser({ user: ada, voicemail: false });

      form.applyIssues([
        {
          lineIndex: 0,
          field: 'user.did',
          code: 'no_numbers_available',
          message: 'Kanata Campus has no available numbers left for this user',
          severity: 'error',
        },
        {
          lineIndex: 1,
          field: 'before',
          code: 'user_locked',
          message: 'Another order is changing Ada Lovelace',
          severity: 'error',
        },
        { lineIndex: 1, field: 'after', code: 'x', message: 'Whole line', severity: 'error' },
        {
          lineIndex: 0,
          field: 'user.macAddress',
          code: 'mac_missing',
          message: 'Just a warning',
          severity: 'warning',
        },
      ]);

      expect(add.controls.did.getError('server')).toMatch(/no available numbers/);
      expect(add.controls.did.touched).toBe(true);
      expect(change.controls.user.getError('server')).toMatch(/Another order/);
      expect(form.lineError(change)).toBe('Whole line');
      expect(add.controls.macAddress.errors).toBeNull();

      add.controls.did.setValue('+16135550100');
      expect(add.controls.did.errors).toBeNull();
      change.controls.voicemail.setValue(true);
      change.controls.voicemail.setValue(false);
      expect(form.lineError(change)).toBeNull();
    });
  });
});
