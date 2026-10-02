/* Datacenter personas: the business model the mock estate is generated as.
   One shared physical layer (sites, power, cooling, racks, alarms, incidents);
   the persona decides what fills the racks, who the customer is, what a
   service is sized in, and the words the screens use. */

import type { Incident, Persona, ServiceType, ServiceUnit } from '../api/types';

export interface PersonaVocab {
  customer: string; customers: string; service: string; services: string; equipment: string;
  premium: string; capacityLabel: string; primaryUnit: ServiceUnit; handoff: string; searchHint: string;
}
export interface PersonaServiceType { type: ServiceType; code: string; unit: ServiceUnit; qty: number[]; host: ('Router' | 'Switch' | 'Server' | 'Storage' | 'GPU' | 'Tenant gear')[] }
export interface PersonaDef {
  id: Persona; label: string; short: string; tagline: string;
  vocab: PersonaVocab;
  /* device count vs. the telco seed row (MH-DC-001 = 179 network elements) */
  scale: number;
  /* [name, segment, city, state, plan, premium] */
  customers: [string, string, string, string, string, boolean][];
  serviceTypes: PersonaServiceType[];
  sla: { premium: number; standard: number };
  rooms: { big: { name: string; rooms: string[] }[]; small: { name: string; rooms: string[] }[] };
  /* one multi-storey site per persona: same equipment, spread over 6–7 floors */
  tall: { dcId: string; floors: { name: string; rooms: string[] }[] };
  incidentTitles: Record<Incident['type'], string[]>;
}

const NETWORK: PersonaDef = {
  id: 'network', label: 'Network / Telco DC', short: 'Telco', tagline: 'Connectivity services — routers, switches and DWDM; customers buy circuits',
  vocab: { customer: 'Customer', customers: 'Customers', service: 'Service', services: 'Services', equipment: 'Network equipment', premium: 'Premium', capacityLabel: 'Bandwidth', primaryUnit: 'Mbps', handoff: 'NE · handoff', searchHint: 'Customer, ID, segment' },
  scale: 1,
  customers: [], serviceTypes: [], sla: { premium: 99.9, standard: 99.5 },
  rooms: { big: [{ name: 'Ground', rooms: ['MDF', 'Hall A'] }, { name: '1st floor', rooms: ['Equipment room', 'Hall B'] }], small: [{ name: 'Ground', rooms: ['MDF'] }, { name: '1st floor', rooms: ['Equipment room'] }] },
  tall: { dcId: 'DL-DC-009', floors: [{ name: 'Ground', rooms: ['MDF'] }, { name: '1st floor', rooms: ['Transmission room'] }, { name: '2nd floor', rooms: ['Equipment room A'] }, { name: '3rd floor', rooms: ['Equipment room B'] }, { name: '4th floor', rooms: ['Core room'] }, { name: '5th floor', rooms: ['Hall C'] }, { name: '6th floor', rooms: ['Hall D'] }] },
  incidentTitles: {
    Network: ['Interface flapping on backhaul', 'BGP session reset storm', 'OSPF adjacency loss on AGG pair', 'Optical degradation on uplink', 'Access router unreachable'],
    Power: ['Rectifier module alarm', 'UPS on bypass', 'PDU breaker trip'], Cooling: ['CRAH filter blocked — high return temperature', 'Chiller pump fault'], Capacity: ['Backhaul exhaustion warning', 'Port fill above 90% on leaf'],
    Rack: ['Rack over power budget'], Security: ['RADIUS authentication failures spike']
  }
};

const COLOCATION: PersonaDef = {
  id: 'colocation', label: 'Colocation DC', short: 'Colo', tagline: 'Space, power and interconnection — tenants own the gear in the cabinets',
  vocab: { customer: 'Tenant', customers: 'Tenants', service: 'Contract', services: 'Contracts', equipment: 'Cabinets & plant', premium: 'Anchor', capacityLabel: 'Contracted power', primaryUnit: 'kW', handoff: 'Cabinet · circuit', searchHint: 'Tenant, ID, segment' },
  scale: 0.6,
  customers: [
    ['Hyperscale Cloud East', 'Hyperscaler', 'Mumbai', 'Maharashtra', 'Private cage · 2N', true],
    ['Nimbus Cloud Services', 'Hyperscaler', 'Bengaluru', 'Karnataka', 'Private cage · 2N', true],
    ['Orbital SaaS', 'SaaS', 'Pune', 'Maharashtra', 'Suite · 20 kW', true],
    ['Finance Group', 'BFSI', 'Mumbai', 'Maharashtra', 'Suite · 20 kW', true],
    ['Payments Gateway', 'BFSI', 'Mumbai', 'Maharashtra', 'Cabinets · 8 kW', true],
    ['Stock Broking House', 'BFSI', 'Mumbai', 'Maharashtra', 'Cabinets · 8 kW', true],
    ['Telecom Provider', 'Carrier', 'Chennai', 'Tamil Nadu', 'MMR cabinets', true],
    ['Regional ISP', 'Carrier', 'Indore', 'Madhya Pradesh', 'MMR cabinets', false],
    ['Cloud Exchange', 'Carrier', 'Bengaluru', 'Karnataka', 'MMR cabinets', true],
    ['Media Corporation', 'Media', 'Mumbai', 'Maharashtra', 'Cabinets · 6 kW', false],
    ['Broadcast Network', 'Media', 'New Delhi', 'Delhi NCR', 'Cabinets · 6 kW', false],
    ['Gaming Studio', 'Media', 'Hyderabad', 'Telangana', 'Cabinets · 8 kW', false],
    ['E-commerce Marketplace', 'Enterprise', 'Bengaluru', 'Karnataka', 'Suite · 20 kW', true],
    ['Logistics Partners', 'Enterprise', 'Hyderabad', 'Telangana', 'Cabinets · 6 kW', false],
    ['Pharma Manufacturing', 'Enterprise', 'Ahmedabad', 'Gujarat', 'Cabinets · 4 kW', false],
    ['Auto Components Ltd', 'Enterprise', 'Pune', 'Maharashtra', 'Cabinets · 4 kW', false],
    ['Retail Chain', 'Enterprise', 'Mumbai', 'Maharashtra', 'Cabinets · 6 kW', false],
    ['Hotel Group', 'Enterprise', 'Jaipur', 'Rajasthan', 'Cabinets · 4 kW', false],
    ['State Revenue Department', 'Government', 'Lucknow', 'Uttar Pradesh', 'Suite · 12 kW', true],
    ['Smart City Mission', 'Government', 'Indore', 'Madhya Pradesh', 'Cabinets · 6 kW', false],
    ['Health Network', 'Healthcare', 'New Delhi', 'Delhi NCR', 'Cabinets · 8 kW', true],
    ['Diagnostics Labs', 'Healthcare', 'Kochi', 'Kerala', 'Cabinets · 4 kW', false],
    ['Research Institute', 'Government', 'Bengaluru', 'Karnataka', 'HPC cabinets · 12 kW', false],
    ['Insurance Services', 'BFSI', 'Gurugram', 'Haryana', 'Cabinets · 8 kW', true]
  ],
  serviceTypes: [
    { type: 'Cabinet lease', code: 'CB', unit: 'cabinets', qty: [1, 1, 2, 2, 4, 6], host: ['Tenant gear'] },
    { type: 'Power circuit', code: 'PW', unit: 'kW', qty: [4, 6, 8, 8, 12, 20], host: ['Tenant gear'] },
    { type: 'Cross-connect', code: 'XC', unit: 'Mbps', qty: [1000, 10000, 10000, 100000], host: ['Switch'] },
    { type: 'Remote hands', code: 'RH', unit: 'hours', qty: [10, 20, 40], host: ['Tenant gear'] }
  ],
  sla: { premium: 99.999, standard: 99.99 },
  rooms: { big: [{ name: 'Ground', rooms: ['Meet-me room', 'Hall A'] }, { name: '1st floor', rooms: ['Hall B', 'Hall C'] }], small: [{ name: 'Ground', rooms: ['Meet-me room'] }, { name: '1st floor', rooms: ['Hall A'] }] },
  tall: { dcId: 'KA-DC-020', floors: [{ name: 'Ground', rooms: ['Meet-me room'] }, { name: '1st floor', rooms: ['Hall A'] }, { name: '2nd floor', rooms: ['Hall B'] }, { name: '3rd floor', rooms: ['Hall C'] }, { name: '4th floor', rooms: ['Hall D'] }, { name: '5th floor', rooms: ['Hall E'] }] },
  incidentTitles: {
    Network: ['Cross-connect loss of signal in MMR', 'MMR switch uplink flapping', 'Carrier backhaul optical degradation', 'Tenant VLAN hand-off down'],
    Power: ['Tenant cabinet PDU breaker trip', 'UPS on bypass', 'Rectifier module alarm', 'Tenant draw over contracted kW'], Cooling: ['CRAH filter blocked — hot aisle above 27°C', 'Chiller pump fault'],
    Capacity: ['Hall A contracted power near sold-out', 'Cross-connect panel ports exhausted'], Rack: ['Tenant cabinet over contracted power'], Security: ['Cage access alarm — badge mismatch']
  }
};

const CLOUD: PersonaDef = {
  id: 'cloud', label: 'Cloud DC', short: 'Cloud', tagline: 'Compute and storage at scale — thousands of hosts; accounts run instances',
  vocab: { customer: 'Account', customers: 'Accounts', service: 'Workload', services: 'Workloads', equipment: 'Hosts & fabric', premium: 'Enterprise-tier', capacityLabel: 'vCPU allocated', primaryUnit: 'vCPU', handoff: 'Host · NIC', searchHint: 'Account, ID, segment' },
  scale: 2.5,
  customers: [
    ['ShopSwift Commerce', 'Retail', 'Bengaluru', 'Karnataka', 'Enterprise support', true],
    ['PayNow Fintech', 'BFSI', 'Mumbai', 'Maharashtra', 'Enterprise support', true],
    ['Finance Group', 'BFSI', 'Mumbai', 'Maharashtra', 'Enterprise support', true],
    ['StreamBox Media', 'Media', 'Mumbai', 'Maharashtra', 'Business support', true],
    ['NexGen Gaming', 'Gaming', 'Hyderabad', 'Telangana', 'Business support', false],
    ['EduVerse Learning', 'EdTech', 'Pune', 'Maharashtra', 'Business support', false],
    ['HealthCloud Analytics', 'Healthcare', 'New Delhi', 'Delhi NCR', 'Enterprise support', true],
    ['AgriSense IoT', 'IoT', 'Jaipur', 'Rajasthan', 'Developer', false],
    ['FleetTrack Logistics', 'Logistics', 'Hyderabad', 'Telangana', 'Business support', false],
    ['CityGov Digital', 'Government', 'Lucknow', 'Uttar Pradesh', 'Enterprise support', true],
    ['QuantLedger AI', 'AI / ML', 'Bengaluru', 'Karnataka', 'Enterprise support', true],
    ['VisionLabs ML', 'AI / ML', 'Chennai', 'Tamil Nadu', 'Business support', false],
    ['Media Corporation', 'Media', 'Mumbai', 'Maharashtra', 'Business support', false],
    ['Insurance Services', 'BFSI', 'Gurugram', 'Haryana', 'Enterprise support', true],
    ['Hospital Chain', 'Healthcare', 'Chennai', 'Tamil Nadu', 'Business support', false],
    ['Retail Chain', 'Retail', 'Mumbai', 'Maharashtra', 'Business support', false],
    ['TravelNest Bookings', 'Travel', 'Kochi', 'Kerala', 'Developer', false],
    ['Smart City Mission', 'Government', 'Indore', 'Madhya Pradesh', 'Business support', false],
    ['University Consortium', 'EdTech', 'Prayagraj', 'Uttar Pradesh', 'Developer', false],
    ['Textile Exports', 'Manufacturing', 'Surat', 'Gujarat', 'Developer', false],
    ['Auto Components Ltd', 'Manufacturing', 'Pune', 'Maharashtra', 'Business support', false],
    ['Stock Broking House', 'BFSI', 'Mumbai', 'Maharashtra', 'Enterprise support', true],
    ['Newspaper Group', 'Media', 'Patna', 'Bihar', 'Developer', false],
    ['Airport Operator', 'Transport', 'New Delhi', 'Delhi NCR', 'Enterprise support', true]
  ],
  serviceTypes: [
    { type: 'VM', code: 'VM', unit: 'vCPU', qty: [8, 16, 16, 32, 64, 128], host: ['Server'] },
    { type: 'Kubernetes', code: 'K8', unit: 'vCPU', qty: [64, 128, 256], host: ['Server'] },
    { type: 'Managed DB', code: 'DB', unit: 'vCPU', qty: [16, 32, 64], host: ['Server'] },
    { type: 'Storage volume', code: 'SV', unit: 'TB', qty: [10, 50, 100, 250, 500], host: ['Storage'] },
    { type: 'GPU cluster', code: 'GP', unit: 'GPU', qty: [8, 16, 32, 64], host: ['GPU'] }
  ],
  sla: { premium: 99.99, standard: 99.95 },
  rooms: { big: [{ name: 'Ground', rooms: ['Data hall 1', 'Data hall 2'] }, { name: '1st floor', rooms: ['Data hall 3', 'GPU hall'] }], small: [{ name: 'Ground', rooms: ['Data hall 1'] }, { name: '1st floor', rooms: ['Data hall 2'] }] },
  tall: { dcId: 'TN-DC-022', floors: [{ name: 'Ground', rooms: ['Network core'] }, { name: '1st floor', rooms: ['Data hall 1'] }, { name: '2nd floor', rooms: ['Data hall 2'] }, { name: '3rd floor', rooms: ['Data hall 3'] }, { name: '4th floor', rooms: ['Data hall 4'] }, { name: '5th floor', rooms: ['GPU hall'] }] },
  incidentTitles: {
    Network: ['ToR uplink flapping', 'Spine switch reload', 'Host NIC errors on leaf pair', 'Border router BGP reset'],
    Power: ['PDU breaker trip on compute row', 'UPS on bypass', 'Rectifier module alarm'], Cooling: ['GPU hall above 27°C — CRAH filter blocked', 'Chiller pump fault', 'CDU flow alarm on GPU row'],
    Capacity: ['vCPU pool above 90% in hall', 'GPU cluster capacity exhausted', 'Storage pool above 85%'], Rack: ['GPU rack over power budget'], Security: ['Hypervisor management login failures spike']
  }
};

const ENTERPRISE: PersonaDef = {
  id: 'enterprise', label: 'Enterprise / Private DC', short: 'Enterprise', tagline: 'Runs the firm’s own applications — business units are the customers',
  vocab: { customer: 'Business unit', customers: 'Business units', service: 'Application', services: 'Applications', equipment: 'Servers & fabric', premium: 'Tier-1', capacityLabel: 'Users served', primaryUnit: 'users', handoff: 'Host · cluster', searchHint: 'Business unit, ID, segment' },
  scale: 1.4,
  customers: [
    ['Retail Banking', 'Revenue', 'Mumbai', 'Maharashtra', 'Tier-1 · RTO 15 min', true],
    ['Corporate Banking', 'Revenue', 'Mumbai', 'Maharashtra', 'Tier-1 · RTO 15 min', true],
    ['Cards & Payments', 'Revenue', 'Mumbai', 'Maharashtra', 'Tier-1 · RTO 15 min', true],
    ['Treasury & Markets', 'Revenue', 'Mumbai', 'Maharashtra', 'Tier-1 · RTO 30 min', true],
    ['Digital Channels', 'Revenue', 'Bengaluru', 'Karnataka', 'Tier-1 · RTO 15 min', true],
    ['Wealth Management', 'Revenue', 'Mumbai', 'Maharashtra', 'Tier-2 · RTO 4 h', false],
    ['Insurance', 'Revenue', 'Pune', 'Maharashtra', 'Tier-2 · RTO 4 h', false],
    ['Risk & Compliance', 'Control', 'Mumbai', 'Maharashtra', 'Tier-2 · RTO 4 h', false],
    ['Finance & Controlling', 'Control', 'Mumbai', 'Maharashtra', 'Tier-2 · RTO 4 h', false],
    ['Human Resources', 'Support', 'Pune', 'Maharashtra', 'Tier-3 · RTO 24 h', false],
    ['Operations', 'Support', 'Hyderabad', 'Telangana', 'Tier-2 · RTO 4 h', false],
    ['Marketing', 'Support', 'Mumbai', 'Maharashtra', 'Tier-3 · RTO 24 h', false],
    ['IT & Security', 'Control', 'Bengaluru', 'Karnataka', 'Tier-1 · RTO 30 min', true],
    ['Customer Service', 'Support', 'Chennai', 'Tamil Nadu', 'Tier-2 · RTO 4 h', false]
  ],
  serviceTypes: [
    { type: 'Core application', code: 'AP', unit: 'users', qty: [500, 2000, 5000, 12000], host: ['Server'] },
    { type: 'Collaboration', code: 'CO', unit: 'users', qty: [3000, 8000, 15000], host: ['Server'] },
    { type: 'Analytics', code: 'AN', unit: 'vCPU', qty: [64, 128, 256], host: ['Server', 'GPU'] },
    { type: 'Database', code: 'DB', unit: 'TB', qty: [2, 5, 10, 20], host: ['Storage'] },
    { type: 'Backup & DR', code: 'BK', unit: 'TB', qty: [50, 100, 200], host: ['Storage'] }
  ],
  sla: { premium: 99.9, standard: 99.5 },
  rooms: { big: [{ name: 'Ground', rooms: ['Server hall A', 'Server hall B'] }, { name: '1st floor', rooms: ['Storage hall', 'DR hall'] }], small: [{ name: 'Ground', rooms: ['Server hall A'] }, { name: '1st floor', rooms: ['Storage hall'] }] },
  tall: { dcId: 'HR-DC-011', floors: [{ name: 'Ground', rooms: ['Core network'] }, { name: '1st floor', rooms: ['Server hall A'] }, { name: '2nd floor', rooms: ['Server hall B'] }, { name: '3rd floor', rooms: ['Storage hall'] }, { name: '4th floor', rooms: ['Server hall C'] }, { name: '5th floor', rooms: ['DR hall'] }] },
  incidentTitles: {
    Network: ['Core switch pair failover', 'Hypervisor host unreachable', 'SAN fabric path loss', 'Firewall HA split-brain'],
    Power: ['PDU breaker trip on server row', 'UPS on bypass', 'Rectifier module alarm'], Cooling: ['CRAH filter blocked — high return temperature', 'Chiller pump fault'],
    Capacity: ['Storage pool above 85%', 'Hypervisor cluster memory above 90%', 'Backup window overrun'], Rack: ['Rack over power budget'], Security: ['Privileged login failures spike']
  }
};

export const PERSONAS: PersonaDef[] = [NETWORK, COLOCATION, CLOUD, ENTERPRISE];
export const PERSONA_BY_ID: Record<Persona, PersonaDef> = { network: NETWORK, colocation: COLOCATION, cloud: CLOUD, enterprise: ENTERPRISE };
export const isPersona = (x: unknown): x is Persona => typeof x === 'string' && x in PERSONA_BY_ID;
