import { aUser } from '../../../../../testing/fixtures';
import { filterUsers } from './user-filter';

const users = [
  aUser({
    id: 'u1',
    firstName: 'Émile',
    lastName: 'Gagnon',
    email: 'emile@x.example.com',
    extension: '2300',
    did: '+18195550129',
  }),
  aUser({
    id: 'u2',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@x.example.com',
    extension: '2101',
    did: null,
  }),
];
const ids = (query: string) => filterUsers(users, query).map((u) => u.id);

describe('filterUsers', () => {
  it('returns everyone for a blank query', () => {
    expect(ids('  ')).toEqual(['u1', 'u2']);
  });

  it('matches full names and emails without accents', () => {
    expect(ids('emile gag')).toEqual(['u1']);
    expect(ids('ADA@')).toEqual(['u2']);
  });

  it('matches extensions and phone numbers however they are typed', () => {
    expect(ids('2101')).toEqual(['u2']);
    expect(ids('(819) 555-0129')).toEqual(['u1']);
    expect(ids('555 0129')).toEqual(['u1']);
  });
});
