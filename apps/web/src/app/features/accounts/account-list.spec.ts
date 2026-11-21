import { anAccount } from '../../../testing/fixtures';
import { filterAccounts, numberUtilization, sortAccounts } from './account-list';

const accounts = [
  anAccount({
    id: 'acc_mer',
    name: 'Mer Bleue Health',
    plan: 'business',
    status: 'active',
    primaryContact: { name: 'Aïsha Rahman', email: 'aisha@merbleue.example.com' },
    userCount: 28,
    numbersAssigned: 28,
    numbersTotal: 55,
  }),
  anAccount({
    id: 'acc_bytown',
    name: 'Bytown Quill',
    plan: 'essentials',
    status: 'onboarding',
    userCount: 13,
    numbersAssigned: 13,
    numbersTotal: 45,
  }),
  anAccount({
    id: 'acc_lumen',
    name: 'Lumen Ridge',
    plan: 'enterprise',
    status: 'active',
    userCount: 91,
    numbersAssigned: 0,
    numbersTotal: 0,
  }),
];
const ids = (list: readonly { id: string }[]) => list.map((a) => a.id);
const none = { text: '', status: null, plan: null };

describe('filterAccounts', () => {
  it('matches name and contact, ignoring case and accents', () => {
    expect(ids(filterAccounts(accounts, { ...none, text: 'AISHA' }))).toEqual(['acc_mer']);
    expect(ids(filterAccounts(accounts, { ...none, text: ' ridge ' }))).toEqual(['acc_lumen']);
  });

  it('combines text, status and plan', () => {
    expect(ids(filterAccounts(accounts, { ...none, status: 'active' }))).toEqual([
      'acc_mer',
      'acc_lumen',
    ]);
    expect(ids(filterAccounts(accounts, { ...none, status: 'active', plan: 'business' }))).toEqual([
      'acc_mer',
    ]);
    expect(filterAccounts(accounts, { ...none, status: 'suspended' })).toEqual([]);
  });
});

describe('sortAccounts', () => {
  it('sorts by name, numbers or plan tier, in either direction', () => {
    expect(ids(sortAccounts(accounts, 'name', 'asc'))).toEqual([
      'acc_bytown',
      'acc_lumen',
      'acc_mer',
    ]);
    expect(ids(sortAccounts(accounts, 'users', 'desc'))).toEqual([
      'acc_lumen',
      'acc_mer',
      'acc_bytown',
    ]);
    expect(ids(sortAccounts(accounts, 'plan', 'asc'))).toEqual([
      'acc_bytown',
      'acc_mer',
      'acc_lumen',
    ]);
    expect(ids(sortAccounts(accounts, 'numbers', 'desc'))).toEqual([
      'acc_mer',
      'acc_bytown',
      'acc_lumen',
    ]);
  });

  it('breaks ties by name and does not mutate its input', () => {
    const copy = [...accounts];
    expect(ids(sortAccounts(accounts, 'status', 'asc'))).toEqual([
      'acc_bytown',
      'acc_lumen',
      'acc_mer',
    ]);
    expect(accounts).toEqual(copy);
  });
});

describe('numberUtilization', () => {
  it('is 0 for an account without numbers', () => {
    expect(numberUtilization(accounts[2]!)).toBe(0);
    expect(numberUtilization(accounts[1]!)).toBeCloseTo(13 / 45);
  });
});
