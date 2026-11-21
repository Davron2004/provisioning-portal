import { aUser } from '../../../../testing/fixtures';
import { matchUsers } from './user-match';

const users = [
  aUser({
    id: 'u1',
    firstName: 'Priya',
    lastName: 'Shah',
    email: 'priya.shah@x.example.com',
    extension: '2104',
    did: '+16135550142',
  }),
  aUser({
    id: 'u2',
    firstName: 'Zoé',
    lastName: 'Bélanger',
    email: 'zoe.b@x.example.com',
    extension: '2101',
    did: null,
  }),
  aUser({
    id: 'u3',
    firstName: 'Tom',
    lastName: 'Lee',
    email: 'tom.lee@x.example.com',
    extension: '2210',
    did: '+16135550110',
  }),
];
const ids = (query: string) => matchUsers(users, query).map((user) => user.id);

describe('matchUsers', () => {
  it('needs every word in the name or email, ignoring case and accents', () => {
    expect(ids('pri sh')).toEqual(['u1']);
    expect(ids('zoe belanger')).toEqual(['u2']);
    expect(ids('tom.lee@')).toEqual(['u3']);
  });

  it('matches digits against extensions and numbers', () => {
    expect(ids('210')).toEqual(['u2', 'u1', 'u3']);
    expect(ids('555-0142')).toEqual(['u1']);
  });

  it('lists everyone by last name when nothing is typed', () => {
    expect(ids('')).toEqual(['u2', 'u3', 'u1']);
  });
});
