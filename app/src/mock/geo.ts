/* Geographies (06-Oct-2026): the estate can be modelled in India (the original seed) or the USA.
   A geography supplies the places (regions, states, cities, the 24 datacenter sites), the customer
   locations, the people, the currency and the number/date locale. Everything else — the equipment,
   the alarms, the incidents, the scenario — is shared, and the scenario refers to sites by POSITION
   (`dcAt(1)` is the hero site), so the same story plays out in Pune and in Ashburn.
   Money constants in the generator are written in rupees; `money()` converts them with the
   geography's rate so USD figures land in a realistic range. */

import type { RolloutStatus } from '../api/types';
import { CIRCLES, CITIES, CUSTOMERS, DCS, REGIONS, PEOPLE, ACCOUNT_MANAGERS } from './seed';

export type Geo = 'in' | 'us';
export const isGeo = (v: unknown): v is Geo => v === 'in' || v === 'us';
export type DcRow = [string, string, string, string, RolloutStatus, number, number, number, number, number, 'Central' | 'Regional' | 'Edge', 'Tier II' | 'Tier III' | 'Tier IV'];

export interface GeoDef {
  id: Geo; label: string; short: string; country: string; tagline: string;
  currency: { code: 'INR' | 'USD'; symbol: string; locale: string };
  /* multiplier applied to the generator's rupee-denominated constants */
  fx: number;
  dateStyle: 'dmy' | 'mdy';
  regions: { id: string; name: string }[];
  circles: [string, string, string, number, number, number, number][];
  cities: Record<string, string[]>;
  dcs: DcRow[];
  customers: [string, string, string, string, string, boolean][];
  /* persona customer lists keep their names; their city / state come from here by position */
  customerPlaces: [string, string][];
  renameCustomer: Record<string, string>;
  people: string[]; accountManagers: string[];
  /* names used literally in the scenario (incident owners, change requesters) → this geography's people */
  renamePeople: Record<string, string>;
  map: { bounds: [[number, number], [number, number]]; thumbTile: string };
  /* the demo question Opstral AI suggests ("What is at risk in Pune?") */
  heroCity: string;
}

const IN: GeoDef = {
  id: 'in', label: 'India', short: 'India', country: 'India', tagline: '24 datacenters across 20 circles · ₹',
  currency: { code: 'INR', symbol: '₹', locale: 'en-IN' }, fx: 1, dateStyle: 'dmy',
  regions: REGIONS, circles: CIRCLES, cities: CITIES, dcs: DCS, customers: CUSTOMERS,
  customerPlaces: CUSTOMERS.map(c => [c[2], c[3]]), renameCustomer: {},
  people: PEOPLE, accountManagers: ACCOUNT_MANAGERS, renamePeople: {},
  map: { bounds: [[7.5, 68.5], [34.0, 93.0]], thumbTile: '5/14/22' }, heroCity: 'Pune'
};

/* The USA estate: the same 24 sites by position (status, device counts, category and tier are
   identical, so every persona's scale and every scenario site line up), placed in the main US
   datacenter markets. Site IDs keep the `XX-DC-NNN` shape with the state code. */
const US_DCS: DcRow[] = [
  ['VA-DC-001', 'Ashburn', 'Loudoun Tech Center', 'VA', 'in-progress', 179, 103, 21, 39.043, -77.487, 'Central', 'Tier III'],
  ['VA-DC-002', 'Ashburn', 'Beaumeade Circle', 'VA', 'on-air', 90, 90, 2, 39.018, -77.459, 'Central', 'Tier III'],
  ['VA-DC-003', 'Richmond', 'White Oak Technology Park', 'VA', 'on-air', 114, 114, 4, 37.541, -77.434, 'Central', 'Tier III'],
  ['VA-DC-004', 'Sterling', 'Dulles Technology Park', 'VA', 'on-air', 66, 66, 0, 39.006, -77.429, 'Central', 'Tier II'],
  ['TX-DC-005', 'Dallas', 'Infomart Dallas', 'TX', 'on-air', 140, 140, 3, 32.800, -96.820, 'Central', 'Tier III'],
  ['TX-DC-006', 'San Antonio', 'Westover Hills', 'TX', 'on-air', 110, 110, 1, 29.459, -98.655, 'Central', 'Tier III'],
  ['TX-DC-007', 'Austin', 'MetCenter Business Park', 'TX', 'on-air', 84, 84, 0, 30.212, -97.722, 'Central', 'Tier II'],
  ['CA-DC-008', 'Santa Clara', 'Great America Parkway', 'CA', 'on-air', 144, 144, 5, 37.394, -121.962, 'Central', 'Tier III'],
  ['IL-DC-009', 'Chicago', 'Franklin Street Exchange', 'IL', 'on-air', 168, 168, 6, 41.878, -87.636, 'Central', 'Tier IV'],
  ['AZ-DC-010', 'Phoenix', 'Chandler Tech Corridor', 'AZ', 'on-air', 72, 72, 1, 33.303, -111.874, 'Regional', 'Tier II'],
  ['GA-DC-011', 'Atlanta', 'Alpharetta Data Center Park', 'GA', 'on-air', 126, 126, 3, 34.064, -84.253, 'Central', 'Tier III'],
  ['NJ-DC-012', 'Secaucus', 'Meadowlands Parkway', 'NJ', 'on-air', 64, 64, 0, 40.788, -74.056, 'Regional', 'Tier II'],
  ['WA-DC-013', 'Quincy', 'Port of Quincy Industrial Park', 'WA', 'planned', 48, 0, 0, 47.233, -119.853, 'Central', 'Tier III'],
  ['OR-DC-014', 'Hillsboro', 'Hillsboro Technology Campus', 'OR', 'on-air', 96, 96, 2, 45.531, -122.953, 'Regional', 'Tier III'],
  ['CO-DC-015', 'Denver', 'Centennial Tech Park', 'CO', 'on-air', 70, 70, 1, 39.595, -104.872, 'Regional', 'Tier II'],
  ['OH-DC-016', 'Columbus', 'New Albany Business Park', 'OH', 'on-air', 132, 132, 4, 40.082, -82.802, 'Central', 'Tier III'],
  ['OH-DC-017', 'Columbus', 'Dublin Tech Center', 'OH', 'on-air', 88, 88, 1, 40.099, -83.114, 'Regional', 'Tier II'],
  ['FL-DC-018', 'Miami', 'NAP of the Americas', 'FL', 'on-air', 62, 62, 0, 25.774, -80.191, 'Regional', 'Tier II'],
  ['UT-DC-019', 'Salt Lake City', 'West Jordan Data Campus', 'UT', 'on-air', 58, 58, 1, 40.609, -111.939, 'Edge', 'Tier II'],
  ['CA-DC-020', 'Los Angeles', 'One Wilshire', 'CA', 'on-air', 172, 172, 5, 34.049, -118.258, 'Central', 'Tier IV'],
  ['CA-DC-021', 'San Jose', 'North First Street', 'CA', 'on-air', 118, 118, 2, 37.398, -121.927, 'Central', 'Tier III'],
  ['TX-DC-022', 'Houston', 'Westway Park', 'TX', 'on-air', 150, 150, 3, 29.774, -95.520, 'Central', 'Tier III'],
  ['NC-DC-023', 'Charlotte', 'University Research Park', 'NC', 'on-air', 136, 136, 2, 35.310, -80.743, 'Central', 'Tier III'],
  ['WA-DC-024', 'Seattle', 'Tukwila Data Campus', 'WA', 'in-progress', 72, 40, 3, 47.467, -122.258, 'Regional', 'Tier II']
];
/* [state code, state, region, lat, lng, PoPs, sites] — PoP and site counts match the India rows by position, so estate totals reconcile */
const US_CIRCLES: GeoDef['circles'] = [
  ['VA', 'Virginia', 'northeast', 37.5, -78.8, 32, 212], ['TX', 'Texas', 'central', 31.0, -99.0, 27, 191], ['CA', 'California', 'west', 36.8, -119.4, 26, 182],
  ['IL', 'Illinois', 'central', 40.0, -89.2, 24, 168], ['AZ', 'Arizona', 'west', 34.2, -111.7, 22, 151], ['GA', 'Georgia', 'southeast', 32.7, -83.4, 19, 133],
  ['NJ', 'New Jersey', 'northeast', 40.1, -74.5, 18, 132], ['WA', 'Washington', 'west', 47.4, -120.5, 17, 124], ['OR', 'Oregon', 'west', 44.0, -120.5, 3, 33],
  ['CO', 'Colorado', 'west', 39.0, -105.5, 2, 27], ['OH', 'Ohio', 'central', 40.4, -82.8, 3, 26], ['FL', 'Florida', 'southeast', 28.1, -81.6, 2, 22],
  ['UT', 'Utah', 'west', 39.3, -111.7, 2, 19], ['MN', 'Minnesota', 'central', 46.3, -94.3, 2, 18], ['MA', 'Massachusetts', 'northeast', 42.3, -71.8, 2, 17],
  ['NV', 'Nevada', 'west', 39.3, -116.6, 2, 16], ['NC', 'North Carolina', 'southeast', 35.6, -79.4, 2, 15], ['NY', 'New York', 'northeast', 42.9, -75.5, 2, 13],
  ['PA', 'Pennsylvania', 'northeast', 40.9, -77.8, 2, 12], ['TN', 'Tennessee', 'southeast', 35.8, -86.4, 1, 9]
];
const US_CITIES: Record<string, string[]> = {
  VA: ['Ashburn', 'Richmond', 'Sterling', 'Norfolk', 'Manassas', 'Reston', 'Leesburg', 'Culpeper'], TX: ['Dallas', 'Houston', 'Austin', 'San Antonio', 'Fort Worth', 'Plano', 'El Paso', 'Irving'],
  CA: ['Santa Clara', 'San Jose', 'Los Angeles', 'Sacramento', 'San Diego', 'Fremont'], IL: ['Chicago', 'Elk Grove Village', 'Aurora', 'Naperville', 'Springfield', 'Peoria'],
  AZ: ['Phoenix', 'Chandler', 'Mesa', 'Tempe', 'Tucson'], GA: ['Atlanta', 'Alpharetta', 'Marietta', 'Savannah', 'Augusta'], NJ: ['Secaucus', 'Newark', 'Piscataway', 'Jersey City', 'Princeton'],
  WA: ['Quincy', 'Seattle', 'Tukwila', 'Spokane', 'Tacoma'], OR: ['Hillsboro', 'Portland', 'Prineville', 'Eugene'], CO: ['Denver', 'Aurora', 'Colorado Springs'],
  OH: ['Columbus', 'New Albany', 'Cincinnati', 'Cleveland'], FL: ['Miami', 'Tampa', 'Jacksonville'], UT: ['Salt Lake City', 'West Jordan', 'Provo'], MN: ['Minneapolis', 'Chaska', 'Rochester'],
  NV: ['Reno', 'Las Vegas', 'Henderson'], MA: ['Boston', 'Marlborough', 'Worcester'], NC: ['Charlotte', 'Raleigh', 'Durham'], NY: ['New York', 'Buffalo'], PA: ['Philadelphia', 'Pittsburgh'], TN: ['Nashville', 'Memphis']
};
const US_PLACES: [string, string][] = [
  ['Ashburn', 'Virginia'], ['Dallas', 'Texas'], ['San Jose', 'California'], ['New York', 'New York'], ['Atlanta', 'Georgia'], ['Chicago', 'Illinois'], ['Boston', 'Massachusetts'], ['Seattle', 'Washington'],
  ['Richmond', 'Virginia'], ['Philadelphia', 'Pennsylvania'], ['Charlotte', 'North Carolina'], ['Austin', 'Texas'], ['Phoenix', 'Arizona'], ['Denver', 'Colorado'], ['Miami', 'Florida'], ['Columbus', 'Ohio'],
  ['Los Angeles', 'California'], ['Minneapolis', 'Minnesota'], ['Houston', 'Texas'], ['Newark', 'New Jersey'], ['Nashville', 'Tennessee'], ['Portland', 'Oregon'], ['Salt Lake City', 'Utah'], ['San Francisco', 'California'],
  ['Las Vegas', 'Nevada'], ['Raleigh', 'North Carolina'], ['Tampa', 'Florida'], ['Pittsburgh', 'Pennsylvania'], ['Sacramento', 'California'], ['Kansas City', 'Missouri'], ['Detroit', 'Michigan'], ['San Antonio', 'Texas'],
  ['Cincinnati', 'Ohio'], ['Baltimore', 'Maryland'], ['Indianapolis', 'Indiana'], ['Reno', 'Nevada']
];
const US_RENAME: Record<string, string> = {
  'State Revenue Department': 'State Department of Revenue', 'Smart City Mission': 'Smart City Initiative', 'Cooperative Bank': 'Community Bank', 'Microfinance Bank': 'Federal Credit Union',
  'Port Trust': 'Port Authority', 'Auto Components Ltd': 'Auto Components Inc', 'Textile Exports': 'Apparel Distributors', 'Agri Commodities': 'Agri Commodities Co-op', 'Steel Works': 'Steel Works Inc',
  'Hyperscale Cloud East': 'Hyperscale Cloud US-East', 'University Consortium': 'State University System', 'Metro Transit Authority': 'Metropolitan Transit Authority'
};
const US_PEOPLE = ['Mike Johnson', 'Emily Carter', 'Luis Alvarez', 'Sarah Chen', 'Daniel Brooks', 'Karen Mitchell', 'David Kim', 'Tom Reynolds', 'Grace Patel', 'James Wilson', 'Olivia Turner', 'Marcus Lee'];
const US: GeoDef = {
  id: 'us', label: 'United States', short: 'USA', country: 'United States', tagline: '24 datacenters across 20 states · $',
  currency: { code: 'USD', symbol: '$', locale: 'en-US' }, fx: 0.02, dateStyle: 'mdy',
  regions: [{ id: 'northeast', name: 'Northeast' }, { id: 'southeast', name: 'Southeast' }, { id: 'central', name: 'Central' }, { id: 'west', name: 'West' }],
  circles: US_CIRCLES, cities: US_CITIES, dcs: US_DCS,
  customers: CUSTOMERS.map((c, i) => [US_RENAME[c[0]] ?? c[0], c[1], US_PLACES[i % US_PLACES.length][0], US_PLACES[i % US_PLACES.length][1], c[4], c[5]]),
  customerPlaces: US_PLACES, renameCustomer: US_RENAME,
  people: US_PEOPLE, accountManagers: ['Rachel Adams', 'Brian Foster', 'Monica Reyes', 'Kevin Walsh', 'Laura Bennett'],
  renamePeople: Object.fromEntries(PEOPLE.map((p, i) => [p, US_PEOPLE[i]]).concat(ACCOUNT_MANAGERS.map((p, i) => [p, ['Rachel Adams', 'Brian Foster', 'Monica Reyes', 'Kevin Walsh', 'Laura Bennett'][i]]))),
  map: { bounds: [[24.0, -125.5], [49.5, -66.5]], thumbTile: '5/12/8' }, heroCity: 'Ashburn'
};

export const GEOS: GeoDef[] = [IN, US];
export const GEO_BY_ID: Record<Geo, GeoDef> = { in: IN, us: US };

/* the geography being generated / shown — set by the mock server before generate() */
let active: GeoDef = IN;
export const setActiveGeo = (g: Geo) => { active = GEO_BY_ID[g]; };
export const activeGeo = () => active;
/* the n-th datacenter of the active geography (1-based): dcAt(1) is the hero site */
export const dcAt = (n: number) => active.dcs[n - 1][0];
/* a rupee-denominated constant in the active currency */
export const money = (n: number) => Math.round(n * active.fx);
/* a scenario person (written for India) in the active geography */
export const person = (name: string) => active.renamePeople[name] ?? name;
/* a persona's customer row placed in the active geography */
export const placeCustomer = (row: [string, string, string, string, string, boolean], i: number): [string, string, string, string, string, boolean] =>
  active.id === 'in' ? row : [active.renameCustomer[row[0]] ?? row[0], row[1], active.customerPlaces[i % active.customerPlaces.length][0], active.customerPlaces[i % active.customerPlaces.length][1], row[4], row[5]];
