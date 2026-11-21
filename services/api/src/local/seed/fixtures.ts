import type { AccountPlan, AccountStatus, Address } from '@provisioning/contracts';

/**
 * Demo tenants. Every company is fictional. Numbers come only from the
 * 555-0100..0199 block reserved for fiction, spread over several Canadian
 * area codes so that every number is globally unique.
 */
export interface NumberBlock {
  npa: string;
  /** Inclusive line numbers within 0100..0199. */
  from: number;
  to: number;
}

export interface SiteFixture {
  id: string;
  name: string;
  /** Short name used for shared devices, e.g. "Kanata" for "Boardroom Kanata". */
  shortName: string;
  address: Address;
  timezone: string;
  extensionRange: { start: number; end: number };
  numbers: NumberBlock[];
  users: number;
}

export interface AccountFixture {
  id: string;
  name: string;
  plan: AccountPlan;
  status: AccountStatus;
  domain: string;
  contact: { firstName: string; lastName: string };
  createdDaysAgo: number;
  sites: SiteFixture[];
}

const on = (line1: string, city: string, postalCode: string): Address => ({
  line1,
  city,
  region: 'ON',
  postalCode,
  country: 'CA',
});
const qc = (line1: string, city: string, postalCode: string): Address => ({
  line1,
  city,
  region: 'QC',
  postalCode,
  country: 'CA',
});

export const ACCOUNT_FIXTURES: AccountFixture[] = [
  {
    id: 'acc_lumen-ridge',
    name: 'Lumen Ridge Robotics',
    plan: 'enterprise',
    status: 'active',
    domain: 'lumenridge.example.com',
    contact: { firstName: 'Nadia', lastName: 'Okafor' },
    createdDaysAgo: 420,
    sites: [
      {
        id: 'site_lr-ottawa-hq',
        name: 'Ottawa HQ',
        shortName: 'HQ',
        address: on('410 Laurier Avenue West, Floor 9', 'Ottawa', 'K1R 7T3'),
        timezone: 'America/Toronto',
        extensionRange: { start: 2000, end: 2099 },
        numbers: [{ npa: '613', from: 100, to: 139 }],
        users: 26,
      },
      {
        id: 'site_lr-kanata',
        name: 'Kanata Campus',
        shortName: 'Kanata',
        address: on('4000 Innovation Drive', 'Kanata', 'K2K 3G9'),
        timezone: 'America/Toronto',
        extensionRange: { start: 2100, end: 2299 },
        numbers: [
          { npa: '613', from: 140, to: 199 },
          { npa: '343', from: 100, to: 119 },
        ],
        users: 38,
      },
      {
        id: 'site_lr-gatineau',
        name: 'Gatineau Office',
        shortName: 'Gatineau',
        address: qc('25 rue Laurier, bureau 400', 'Gatineau', 'J8X 4C8'),
        timezone: 'America/Toronto',
        extensionRange: { start: 2300, end: 2399 },
        numbers: [{ npa: '819', from: 100, to: 129 }],
        users: 14,
      },
      {
        id: 'site_lr-toronto',
        name: 'Toronto Lab',
        shortName: 'Toronto',
        address: on('200 King Street West, Suite 1100', 'Toronto', 'M5H 3T4'),
        timezone: 'America/Toronto',
        extensionRange: { start: 2400, end: 2499 },
        numbers: [{ npa: '416', from: 100, to: 124 }],
        users: 10,
      },
    ],
  },
  {
    id: 'acc_carling-pine',
    name: 'Carling Pine Logistics',
    plan: 'business',
    status: 'active',
    domain: 'carlingpine.example.com',
    contact: { firstName: 'Marc', lastName: 'Bélanger' },
    createdDaysAgo: 300,
    sites: [
      {
        id: 'site_cp-ottawa',
        name: 'Ottawa Distribution Centre',
        shortName: 'Ottawa',
        address: on('2150 Walkley Road', 'Ottawa', 'K1G 3P7'),
        timezone: 'America/Toronto',
        extensionRange: { start: 3100, end: 3199 },
        numbers: [{ npa: '343', from: 120, to: 159 }],
        users: 22,
      },
      {
        id: 'site_cp-gatineau',
        name: 'Gatineau Depot',
        shortName: 'Gatineau',
        address: qc('180 boulevard Saint-René Ouest', 'Gatineau', 'J8P 6W5'),
        timezone: 'America/Toronto',
        extensionRange: { start: 3200, end: 3299 },
        numbers: [{ npa: '873', from: 100, to: 124 }],
        users: 12,
      },
      {
        id: 'site_cp-mississauga',
        name: 'Mississauga Yard',
        shortName: 'Mississauga',
        address: on('6900 Airport Road, Unit 12', 'Mississauga', 'L4T 4E5'),
        timezone: 'America/Toronto',
        extensionRange: { start: 3300, end: 3399 },
        numbers: [{ npa: '905', from: 100, to: 129 }],
        users: 15,
      },
    ],
  },
  {
    id: 'acc_mer-bleue',
    name: 'Mer Bleue Health Clinics',
    plan: 'business',
    status: 'active',
    domain: 'merbleue.example.com',
    contact: { firstName: 'Aisha', lastName: 'Rahman' },
    createdDaysAgo: 210,
    sites: [
      {
        id: 'site_mb-orleans',
        name: 'Orléans Clinic',
        shortName: 'Orléans',
        address: on('3100 St. Joseph Boulevard', 'Ottawa', 'K1E 3W6'),
        timezone: 'America/Toronto',
        extensionRange: { start: 4100, end: 4149 },
        numbers: [{ npa: '343', from: 160, to: 189 }],
        users: 16,
      },
      {
        id: 'site_mb-barrhaven',
        name: 'Barrhaven Clinic',
        shortName: 'Barrhaven',
        address: on('3500 Fallowfield Road, Unit 6', 'Nepean', 'K2J 4A7'),
        timezone: 'America/Toronto',
        extensionRange: { start: 4200, end: 4249 },
        numbers: [{ npa: '753', from: 100, to: 124 }],
        users: 12,
      },
    ],
  },
  {
    id: 'acc_bytown-quill',
    name: 'Bytown Quill Legal',
    plan: 'essentials',
    status: 'onboarding',
    domain: 'bytownquill.example.com',
    contact: { firstName: 'Simone', lastName: 'Ouellet' },
    createdDaysAgo: 26,
    sites: [
      {
        id: 'site_bq-ottawa-hq',
        name: 'Ottawa HQ',
        shortName: 'HQ',
        address: on('99 Bank Street, Suite 700', 'Ottawa', 'K1P 6B9'),
        timezone: 'America/Toronto',
        extensionRange: { start: 500, end: 599 },
        numbers: [{ npa: '753', from: 125, to: 149 }],
        users: 9,
      },
      {
        id: 'site_bq-montreal',
        name: 'Montréal Office',
        shortName: 'Montréal',
        address: qc('1250 boulevard René-Lévesque Ouest, bureau 2200', 'Montréal', 'H3B 4W8'),
        timezone: 'America/Toronto',
        extensionRange: { start: 600, end: 699 },
        numbers: [{ npa: '514', from: 100, to: 119 }],
        users: 4,
      },
    ],
  },
  {
    id: 'acc_hogsback',
    name: 'Hogsback Studio Collective',
    plan: 'essentials',
    status: 'suspended',
    domain: 'hogsback.example.com',
    contact: { firstName: 'Theo', lastName: 'Marchetti' },
    createdDaysAgo: 160,
    sites: [
      {
        id: 'site_hb-byward',
        name: 'ByWard Market Studio',
        shortName: 'ByWard',
        address: on('55 York Street, 2nd Floor', 'Ottawa', 'K1N 5T1'),
        timezone: 'America/Toronto',
        extensionRange: { start: 700, end: 749 },
        numbers: [{ npa: '753', from: 150, to: 169 }],
        users: 7,
      },
      {
        id: 'site_hb-gatineau',
        name: 'Gatineau Studio',
        shortName: 'Gatineau',
        address: qc('70 rue Montcalm', 'Gatineau', 'J8X 2L7'),
        timezone: 'America/Toronto',
        extensionRange: { start: 750, end: 799 },
        numbers: [{ npa: '819', from: 130, to: 149 }],
        users: 4,
      },
    ],
  },
];

/**
 * Name pools. "Priya Shah" and "Tom Lee" are deliberately absent: the
 * assistant examples add them, so they must not exist yet.
 */
// prettier-ignore
export const FIRST_NAMES = [
  'Amélie', 'Ananya', 'Ben', 'Camille', 'Chloé', 'Daniel', 'Deepa', 'Diego', 'Elena', 'Émile',
  'Farah', 'Fatima', 'Gabriel', 'Grace', 'Hana', 'Hugo', 'Imani', 'Isaac', 'Jasmine', 'Jean-Luc',
  'Jonah', 'Julia', 'Kai', 'Kateri', 'Leah', 'Liam', 'Lina', 'Lucas', 'Maya', 'Mateo',
  'Mei', 'Mohammed', 'Nathalie', 'Noah', 'Nora', 'Olivia', 'Omar', 'Owen', 'Rafael', 'Rania',
  'Rohan', 'Sam', 'Sara', 'Sébastien', 'Sofia', 'Tariq', 'Thea', 'Valérie', 'Wei', 'Yusuf',
  'Zara', 'Aaron', 'Bianca', 'Connor', 'Dara', 'Ethan', 'Ines', 'Jun', 'Kofi', 'Mira',
];

// prettier-ignore
export const LAST_NAMES = [
  'Adeyemi', 'Anderson', 'Beaulieu', 'Bergeron', 'Bouchard', 'Campbell', 'Chen', 'Côté', 'Das',
  'Dubois', 'Fortin', 'Fraser', 'Gagnon', 'Ghosh', 'Gill', 'Haddad', 'Hassan', 'Ito', 'Kaur',
  'Khan', 'Kim', 'Lachance', 'Lavoie', 'Leblanc', 'MacDonald', 'Martin', 'Mendes', 'Morin',
  'Nguyen', 'Novak', 'Osei', 'Ouellette', 'Park', 'Patel', 'Pelletier', 'Quinn', 'Reyes',
  'Roy', 'Santos', 'Singh', 'Sokolov', 'Tanaka', 'Thompson', 'Tremblay', 'Walsh', 'Wong',
  'Yilmaz', 'Zhang', 'Bianchi', 'Cardinal', 'Delorme', 'Eriksen', 'Fontaine', 'Ibrahim',
  'Jovanovic', 'Larocque', 'Moreau', 'Okoye', 'Rossi', 'Vasquez',
];
