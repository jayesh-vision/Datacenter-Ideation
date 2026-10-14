/**
 * DCOS — data centre type catalogue.
 *
 * One static, code-owned table transcribed from the DCOS Data Centre Types spec:
 * every type across the enterprise and telco worlds, ordered smallest → largest by
 * footprint, with its typical envelope (racks, facility power, kW/rack), predominant
 * cooling, resilience posture and how well DCOS covers it today.
 *
 * Each entry also carries the *physical* defaults DCOS materialises for a site of
 * that type (rack height, redundancy, containment, cooling plant, utility intake,
 * UPS / battery runtime, WAN posture) and the *build* defaults a greenfield
 * programme of that type starts from. The seed and the onboarding wizard both read
 * these, so a seeded Central Office and one a user onboards look the same.
 *
 * Figures are industry ballparks, not hard limits — they seed defaults and sanity
 * bands, they never block a user from entering something outside them.
 */
import type {
  DcSegment, DcTypeKey, DcTypeCoverage, DcCapabilityGap, DCTier, PowerRedundancy, Containment,
} from './enums';

export type CoolingUnitType = 'CRAC' | 'CRAH' | 'InRow' | 'RDHx' | 'CDU';
export type LiquidCoolingPosture = 'none' | 'optional' | 'standard';
/** WAN connectivity posture — drives how many circuits a site carries and of which kinds. */
export type WanProfile = 'edge' | 'enterprise' | 'colo' | 'telco';

export interface DcTypePhysical {
  /** Rack / UPS redundancy posture materialised on new racks and plant. */
  redundancy: PowerRedundancy;
  containment: Containment;
  rackHeightU: 42 | 45 | 48;
  /** Cooling unit types deployed in this kind of facility (first = predominant). */
  coolingUnits: CoolingUnitType[];
  /** Cooling zones for a representative site. */
  coolingZones: number;
  liquidCooling: LiquidCoolingPosture;
  /** Cooling energy as a fraction of IT load — sets the facility's PUE (1 + overhead + ~7% electrical loss). */
  coolingOverhead: number;
  /** Utility intake voltage (V). */
  feedVoltage: number;
  /** Battery-backed ride-through in minutes [min, max] — telco DC plants run hours, UPS rooms minutes. */
  backupRuntimeMins: [number, number];
  /** Representative building / floor shape. */
  buildings: number;
  floorsPerBuilding: [number, number];
  /** Tenant names for a multi-tenant facility; racks and reservations are owned by one of these. */
  tenants?: string[];
  wan: WanProfile;
  /** Whether a lack of WAN diversity is a real exposure for this type (a server room being single-homed is normal). */
  diversityExpected: boolean;
  /** Circuits a representative site carries. */
  circuits: number;
}

export interface DcTypeBuild {
  /** Programme blueprint a greenfield build of this type runs (see delivery/lib/programBlueprints.ts). */
  blueprintKey: string;
  /** Schedule multiplier applied to that blueprint (1 = the blueprint's own weeks). */
  durationFactor: number;
  /** Default programme budget (USD). */
  defaultBudget: number;
}

/** Capacity policy bands for a type — colo contracts and telco DC plants run conservative, hyperscale and GPU halls run hot. */
export interface DcTypeCapacity {
  /** Rack power utilisation (%) at which the site is flagged on capacity pages. */
  rackPowerWarnPct: number;
  /** Rack power utilisation (%) above which policy blocks a change. */
  rackPowerBlockPct: number;
  /** Minimum cooling-zone headroom (%) before a warning. */
  coolingHeadroomMinPct: number;
}

export interface DcTypeProfile {
  key: DcTypeKey;
  name: string;
  /** Short label used in site names / codes, e.g. "CO", "POP", "GPU". */
  label: string;
  segment: DcSegment;
  /** One-line orientation for pickers and the reference page. */
  description: string;
  /** Typical rack count [min, max]; `null` max = open-ended. */
  typicalRacks: [number, number | null];
  /** Facility power envelope in kW [min, max]; `null` max = open-ended. */
  powerKw: [number, number | null];
  /** Power density band in kW per rack [min, max]; `null` = not rack-based. */
  kwPerRack: [number, number] | null;
  /** Predominant cooling approach. */
  cooling: string;
  /** Typical resilience posture as written in the spec (may be a tier, an N-notation or a DC-plant note). */
  redundancy: string;
  /** Uptime tier the wizard pre-selects for this type. */
  defaultTier: DCTier;
  /** Whether racks are the natural unit of capacity (drives GPU / density seeding). */
  highDensity?: boolean;
  /** Type is served through a −48V DC power plant rather than (or as well as) AC. */
  dcPowerPlant?: boolean;
  /** Multi-tenant commercial facility (colo / interconnect). */
  multiTenant?: boolean;
  coverage: DcTypeCoverage;
  /** Which platform gaps stand between today's coverage and Full. */
  gaps: DcCapabilityGap[];
  physical: DcTypePhysical;
  build: DcTypeBuild;
  capacity: DcTypeCapacity;
  /** PUE this kind of facility should achieve; drives the sustainability scorecard. */
  pueTarget: number;
  /** Representative rack count for a seeded site of this type (prototype-scaled; large types are sampled well below their real footprint). */
  seedRacks: number;
}

const COLO_TENANTS = ['Northwind Bank', 'Contoso Cloud', 'Fabrikam Media', 'Tailspin Games', 'House'];
const CARRIER_TENANTS = ['Lumen', 'Zayo', 'Cogent', 'Telia Carrier', 'AT&T', 'House'];

export const DC_TYPE_CATALOG: readonly DcTypeProfile[] = [
  // ── Enterprise / commercial / IT — small → large ──
  {
    key: 'edge-micro-dc', name: 'Edge micro-DC', label: 'Edge', segment: 'Enterprise',
    description: 'A handful of racks at the network edge, close to users or machines — sealed or free-air cooled.',
    typicalRacks: [1, 5], powerKw: [5, 50], kwPerRack: [3, 10], cooling: 'DX / sealed / free-air', redundancy: 'N or N+1', defaultTier: 'Tier I',
    coverage: 'Partial', gaps: [],
    physical: { redundancy: 'N+1', containment: 'None', rackHeightU: 42, coolingUnits: ['CRAC'], coolingZones: 1, liquidCooling: 'none', coolingOverhead: 0.45, feedVoltage: 400, backupRuntimeMins: [30, 60], buildings: 1, floorsPerBuilding: [1, 1], wan: 'edge', diversityExpected: false, circuits: 1 },
    build: { blueprintKey: 'modular-pod', durationFactor: 1.0, defaultBudget: 2_000_000 }, capacity: { rackPowerWarnPct: 85, rackPowerBlockPct: 95, coolingHeadroomMinPct: 15 }, pueTarget: 1.7, seedRacks: 4,
  },
  {
    key: 'server-room', name: 'Server room / IT closet', label: 'SR', segment: 'Enterprise',
    description: 'An in-building IT room on comfort or CRAC cooling, typically without redundancy.',
    typicalRacks: [1, 10], powerKw: [0, 100], kwPerRack: [2, 6], cooling: 'Comfort / CRAC', redundancy: 'N', defaultTier: 'Tier I',
    coverage: 'Partial', gaps: [],
    physical: { redundancy: 'N', containment: 'None', rackHeightU: 42, coolingUnits: ['CRAC'], coolingZones: 1, liquidCooling: 'none', coolingOverhead: 0.5, feedVoltage: 400, backupRuntimeMins: [10, 20], buildings: 1, floorsPerBuilding: [1, 1], wan: 'edge', diversityExpected: false, circuits: 1 },
    build: { blueprintKey: 'modular-pod', durationFactor: 0.8, defaultBudget: 1_500_000 }, capacity: { rackPowerWarnPct: 85, rackPowerBlockPct: 95, coolingHeadroomMinPct: 15 }, pueTarget: 1.8, seedRacks: 8,
  },
  {
    key: 'modular-pod', name: 'Modular / containerized POD', label: 'POD', segment: 'Enterprise',
    description: 'Prefabricated, self-contained capacity — tens of racks with in-row cooling, dropped on site as a unit.',
    typicalRacks: [10, 60], powerKw: [100, 1000], kwPerRack: [5, 20], cooling: 'In-row; liquid optional', redundancy: 'N+1', defaultTier: 'Tier II',
    coverage: 'Partial', gaps: [],
    physical: { redundancy: 'N+1', containment: 'Cold-Aisle', rackHeightU: 42, coolingUnits: ['InRow'], coolingZones: 1, liquidCooling: 'optional', coolingOverhead: 0.3, feedVoltage: 400, backupRuntimeMins: [10, 20], buildings: 1, floorsPerBuilding: [1, 1], wan: 'edge', diversityExpected: false, circuits: 2 },
    build: { blueprintKey: 'modular-pod', durationFactor: 1.0, defaultBudget: 8_000_000 }, capacity: { rackPowerWarnPct: 85, rackPowerBlockPct: 95, coolingHeadroomMinPct: 10 }, pueTarget: 1.5, seedRacks: 20,
  },
  {
    key: 'enterprise-dc', name: 'Enterprise data centre', label: 'DC', segment: 'Enterprise',
    description: 'A purpose-built facility owned and run by one organisation for its own workloads.',
    typicalRacks: [100, 900], powerKw: [1000, 5000], kwPerRack: [4, 10], cooling: 'CRAH / chilled water', redundancy: 'N+1 – 2N (Tier II–III)', defaultTier: 'Tier III',
    coverage: 'Full', gaps: [],
    physical: { redundancy: 'N+1', containment: 'Cold-Aisle', rackHeightU: 42, coolingUnits: ['CRAH'], coolingZones: 2, liquidCooling: 'optional', coolingOverhead: 0.35, feedVoltage: 11000, backupRuntimeMins: [10, 20], buildings: 1, floorsPerBuilding: [1, 2], wan: 'enterprise', diversityExpected: true, circuits: 3 },
    build: { blueprintKey: 'greenfield-dc', durationFactor: 0.8, defaultBudget: 60_000_000 }, capacity: { rackPowerWarnPct: 85, rackPowerBlockPct: 90, coolingHeadroomMinPct: 10 }, pueTarget: 1.5, seedRacks: 100,
  },
  {
    key: 'retail-colo', name: 'Retail colocation', label: 'COLO', segment: 'Enterprise',
    description: 'Multi-tenant space sold by the rack or cage, with metered power and cross-connects.',
    typicalRacks: [200, 2000], powerKw: [1000, 10000], kwPerRack: [4, 12], cooling: 'Chilled water', redundancy: '2N (Tier III)', defaultTier: 'Tier III',
    multiTenant: true, coverage: 'Partial', gaps: ['multi-tenancy'],
    physical: { redundancy: '2N', containment: 'Cold-Aisle', rackHeightU: 42, coolingUnits: ['CRAH'], coolingZones: 2, liquidCooling: 'none', coolingOverhead: 0.35, feedVoltage: 11000, backupRuntimeMins: [10, 15], buildings: 1, floorsPerBuilding: [2, 3], tenants: COLO_TENANTS, wan: 'colo', diversityExpected: true, circuits: 4 },
    build: { blueprintKey: 'greenfield-dc', durationFactor: 0.9, defaultBudget: 90_000_000 }, capacity: { rackPowerWarnPct: 80, rackPowerBlockPct: 90, coolingHeadroomMinPct: 15 }, pueTarget: 1.45, seedRacks: 110,
  },
  {
    key: 'wholesale-colo', name: 'Wholesale colocation', label: 'WHS', segment: 'Enterprise',
    description: 'Whole halls or suites leased to a few large tenants under long-term power commitments.',
    typicalRacks: [500, 5000], powerKw: [5000, 50000], kwPerRack: [6, 20], cooling: 'Chilled water / liquid', redundancy: 'Tier III–IV', defaultTier: 'Tier III',
    multiTenant: true, coverage: 'Partial', gaps: ['multi-tenancy'],
    physical: { redundancy: '2N', containment: 'Hot-Aisle', rackHeightU: 48, coolingUnits: ['CRAH', 'CDU'], coolingZones: 3, liquidCooling: 'optional', coolingOverhead: 0.3, feedVoltage: 33000, backupRuntimeMins: [10, 15], buildings: 1, floorsPerBuilding: [1, 2], tenants: ['Contoso Cloud', 'Northwind Bank', 'Fabrikam Media'], wan: 'colo', diversityExpected: true, circuits: 4 },
    build: { blueprintKey: 'greenfield-dc', durationFactor: 1.1, defaultBudget: 200_000_000 }, capacity: { rackPowerWarnPct: 80, rackPowerBlockPct: 90, coolingHeadroomMinPct: 15 }, pueTarget: 1.4, seedRacks: 130,
  },
  {
    key: 'carrier-hotel', name: 'Carrier hotel / interconnect', label: 'CH', segment: 'Enterprise',
    description: 'A dense interconnection hub where carriers and networks meet — the value is the cross-connects.',
    typicalRacks: [200, 2000], powerKw: [2000, 20000], kwPerRack: [5, 15], cooling: 'Chilled water', redundancy: 'Tier III', defaultTier: 'Tier III',
    multiTenant: true, coverage: 'Partial', gaps: ['multi-tenancy', 'optical-transport'],
    physical: { redundancy: '2N', containment: 'Cold-Aisle', rackHeightU: 42, coolingUnits: ['CRAH'], coolingZones: 2, liquidCooling: 'none', coolingOverhead: 0.35, feedVoltage: 11000, backupRuntimeMins: [10, 15], buildings: 1, floorsPerBuilding: [3, 4], tenants: CARRIER_TENANTS, wan: 'colo', diversityExpected: true, circuits: 6 },
    build: { blueprintKey: 'greenfield-dc', durationFactor: 1.0, defaultBudget: 120_000_000 }, capacity: { rackPowerWarnPct: 80, rackPowerBlockPct: 90, coolingHeadroomMinPct: 15 }, pueTarget: 1.5, seedRacks: 80,
  },
  {
    key: 'hyperscale-dc', name: 'Hyperscale data centre', label: 'HDC', segment: 'Enterprise',
    description: 'A single very large building run at low PUE with air plus liquid cooling and distributed redundancy.',
    typicalRacks: [2000, 10000], powerKw: [20000, null], kwPerRack: [10, 40], cooling: 'Air + liquid; low PUE', redundancy: 'Distributed N+1', defaultTier: 'Tier III',
    coverage: 'Strong', gaps: [],
    physical: { redundancy: 'N+1', containment: 'Hot-Aisle', rackHeightU: 48, coolingUnits: ['CRAH', 'CDU'], coolingZones: 4, liquidCooling: 'optional', coolingOverhead: 0.15, feedVoltage: 33000, backupRuntimeMins: [8, 12], buildings: 1, floorsPerBuilding: [1, 2], wan: 'enterprise', diversityExpected: true, circuits: 4 },
    build: { blueprintKey: 'greenfield-dc', durationFactor: 1.2, defaultBudget: 400_000_000 }, capacity: { rackPowerWarnPct: 90, rackPowerBlockPct: 97, coolingHeadroomMinPct: 8 }, pueTarget: 1.25, seedRacks: 150,
  },
  {
    key: 'hyperscale-campus', name: 'Hyperscale campus / region', label: 'CMP', segment: 'Enterprise',
    description: 'Multiple buildings forming availability zones — hundreds of MW to gigawatt scale.',
    typicalRacks: [10000, null], powerKw: [100000, null], kwPerRack: [10, 40], cooling: 'Air + liquid', redundancy: 'Concurrently maintainable', defaultTier: 'Tier III',
    coverage: 'Strong', gaps: [],
    physical: { redundancy: 'N+1', containment: 'Hot-Aisle', rackHeightU: 48, coolingUnits: ['CRAH', 'CDU'], coolingZones: 3, liquidCooling: 'optional', coolingOverhead: 0.15, feedVoltage: 132000, backupRuntimeMins: [8, 12], buildings: 3, floorsPerBuilding: [1, 1], wan: 'enterprise', diversityExpected: true, circuits: 5 },
    build: { blueprintKey: 'hyperscale-campus', durationFactor: 1.0, defaultBudget: 900_000_000 }, capacity: { rackPowerWarnPct: 90, rackPowerBlockPct: 97, coolingHeadroomMinPct: 8 }, pueTarget: 1.2, seedRacks: 180,
  },
  {
    key: 'ai-gpu-factory', name: 'AI / HPC GPU factory', label: 'GPU', segment: 'Enterprise',
    description: 'GPU superclusters at 50–130 kW per rack on direct-liquid or immersion cooling.',
    typicalRacks: [200, 5000], powerKw: [10000, 500000], kwPerRack: [50, 130], cooling: 'Direct-liquid / immersion', redundancy: 'N+1, high density', defaultTier: 'Tier III',
    highDensity: true, coverage: 'Strong', gaps: [],
    physical: { redundancy: 'N+1', containment: 'Hot-Aisle', rackHeightU: 48, coolingUnits: ['CDU', 'RDHx'], coolingZones: 3, liquidCooling: 'standard', coolingOverhead: 0.12, feedVoltage: 33000, backupRuntimeMins: [8, 12], buildings: 1, floorsPerBuilding: [1, 1], wan: 'enterprise', diversityExpected: true, circuits: 3 },
    build: { blueprintKey: 'ai-gpu-factory', durationFactor: 1.0, defaultBudget: 350_000_000 }, capacity: { rackPowerWarnPct: 90, rackPowerBlockPct: 95, coolingHeadroomMinPct: 8 }, pueTarget: 1.2, seedRacks: 100,
  },

  // ── Telco network sites — small → large (cell site / street cabinet / far-edge MEC out of scope) ──
  {
    key: 'central-office', name: 'Central Office (CO) / exchange', label: 'CO', segment: 'Telco',
    description: 'The classic telephone exchange: tens to hundreds of racks on −48V DC plant with battery backup.',
    typicalRacks: [10, 500], powerKw: [300, 3000], kwPerRack: [3, 8], cooling: 'CRAC + DC plant', redundancy: '−48V DC + battery', defaultTier: 'Tier II',
    dcPowerPlant: true, coverage: 'Partial', gaps: ['dc-power-plant'],
    physical: { redundancy: 'N+1', containment: 'None', rackHeightU: 45, coolingUnits: ['CRAC'], coolingZones: 1, liquidCooling: 'none', coolingOverhead: 0.4, feedVoltage: 11000, backupRuntimeMins: [240, 480], buildings: 1, floorsPerBuilding: [2, 3], wan: 'telco', diversityExpected: true, circuits: 3 },
    build: { blueprintKey: 'telco-site', durationFactor: 1.0, defaultBudget: 15_000_000 }, capacity: { rackPowerWarnPct: 80, rackPowerBlockPct: 90, coolingHeadroomMinPct: 15 }, pueTarget: 1.6, seedRacks: 48,
  },
  {
    key: 'aggregation-pop', name: 'Aggregation / BNG POP', label: 'AGG', segment: 'Telco',
    description: 'Broadband aggregation point where access networks terminate — tens of racks, mixed −48V and AC.',
    typicalRacks: [10, 60], powerKw: [100, 1000], kwPerRack: [4, 10], cooling: 'CRAC', redundancy: '−48V / AC', defaultTier: 'Tier II',
    dcPowerPlant: true, coverage: 'Partial', gaps: ['dc-power-plant', 'service-inventory'],
    physical: { redundancy: 'N+1', containment: 'None', rackHeightU: 42, coolingUnits: ['CRAC'], coolingZones: 1, liquidCooling: 'none', coolingOverhead: 0.4, feedVoltage: 400, backupRuntimeMins: [180, 360], buildings: 1, floorsPerBuilding: [1, 1], wan: 'telco', diversityExpected: true, circuits: 3 },
    build: { blueprintKey: 'telco-site', durationFactor: 0.7, defaultBudget: 5_000_000 }, capacity: { rackPowerWarnPct: 80, rackPowerBlockPct: 90, coolingHeadroomMinPct: 15 }, pueTarget: 1.6, seedRacks: 16,
  },
  {
    key: 'network-pop', name: 'Network POP (peering / transit)', label: 'POP', segment: 'Telco',
    description: 'A point of presence for peering and transit — routers, optics and A/B feeds in tens of racks.',
    typicalRacks: [10, 60], powerKw: [100, 800], kwPerRack: [4, 10], cooling: 'CRAC', redundancy: 'A/B feeds', defaultTier: 'Tier II',
    coverage: 'Partial', gaps: ['optical-transport'],
    physical: { redundancy: 'N+1', containment: 'None', rackHeightU: 42, coolingUnits: ['CRAC'], coolingZones: 1, liquidCooling: 'none', coolingOverhead: 0.4, feedVoltage: 400, backupRuntimeMins: [30, 60], buildings: 1, floorsPerBuilding: [1, 1], wan: 'telco', diversityExpected: true, circuits: 5 },
    build: { blueprintKey: 'telco-site', durationFactor: 0.6, defaultBudget: 4_000_000 }, capacity: { rackPowerWarnPct: 80, rackPowerBlockPct: 90, coolingHeadroomMinPct: 15 }, pueTarget: 1.6, seedRacks: 12,
  },
  {
    key: 'regional-edge-dc', name: 'Regional / metro edge DC', label: 'MDC', segment: 'Telco',
    description: 'A metro-scale facility hosting edge compute and regional network functions.',
    typicalRacks: [10, 500], powerKw: [1000, 5000], kwPerRack: [5, 15], cooling: 'Chilled water', redundancy: 'Tier II–III', defaultTier: 'Tier III',
    coverage: 'Partial', gaps: ['service-inventory'],
    physical: { redundancy: 'N+1', containment: 'Cold-Aisle', rackHeightU: 42, coolingUnits: ['CRAH'], coolingZones: 2, liquidCooling: 'optional', coolingOverhead: 0.3, feedVoltage: 11000, backupRuntimeMins: [10, 20], buildings: 1, floorsPerBuilding: [1, 2], wan: 'telco', diversityExpected: true, circuits: 3 },
    build: { blueprintKey: 'greenfield-dc', durationFactor: 0.7, defaultBudget: 40_000_000 }, capacity: { rackPowerWarnPct: 85, rackPowerBlockPct: 90, coolingHeadroomMinPct: 10 }, pueTarget: 1.45, seedRacks: 60,
  },
  {
    key: 'mtso', name: 'MTSO / mobile core site', label: 'MTSO', segment: 'Telco',
    description: 'Mobile telephone switching office — the mobile core, on chilled water plus DC plant.',
    typicalRacks: [100, 900], powerKw: [2000, 8000], kwPerRack: [5, 12], cooling: 'Chilled water + DC plant', redundancy: '−48V + AC', defaultTier: 'Tier III',
    dcPowerPlant: true, coverage: 'Partial', gaps: ['dc-power-plant', 'service-inventory'],
    physical: { redundancy: 'N+1', containment: 'Cold-Aisle', rackHeightU: 45, coolingUnits: ['CRAH', 'CRAC'], coolingZones: 2, liquidCooling: 'none', coolingOverhead: 0.35, feedVoltage: 11000, backupRuntimeMins: [120, 240], buildings: 1, floorsPerBuilding: [1, 2], wan: 'telco', diversityExpected: true, circuits: 3 },
    build: { blueprintKey: 'telco-site', durationFactor: 1.3, defaultBudget: 50_000_000 }, capacity: { rackPowerWarnPct: 80, rackPowerBlockPct: 90, coolingHeadroomMinPct: 15 }, pueTarget: 1.5, seedRacks: 100,
  },
  {
    key: 'national-core-nfvi', name: 'National core / telco-cloud (NFVI)', label: 'NC', segment: 'Telco',
    description: 'The national core and NFV infrastructure cloud — hundreds of racks at 2N.',
    typicalRacks: [100, null], powerKw: [5000, 30000], kwPerRack: [6, 20], cooling: 'Chilled water / liquid', redundancy: '2N', defaultTier: 'Tier III',
    coverage: 'Partial', gaps: ['service-inventory', 'optical-transport'],
    physical: { redundancy: '2N', containment: 'Cold-Aisle', rackHeightU: 42, coolingUnits: ['CRAH', 'CDU'], coolingZones: 3, liquidCooling: 'optional', coolingOverhead: 0.25, feedVoltage: 33000, backupRuntimeMins: [10, 20], buildings: 1, floorsPerBuilding: [1, 2], wan: 'telco', diversityExpected: true, circuits: 5 },
    build: { blueprintKey: 'greenfield-dc', durationFactor: 1.0, defaultBudget: 150_000_000 }, capacity: { rackPowerWarnPct: 80, rackPowerBlockPct: 90, coolingHeadroomMinPct: 15 }, pueTarget: 1.4, seedRacks: 100,
  },
  {
    key: 'ixp', name: 'IXP / major carrier hotel', label: 'IXP', segment: 'Telco',
    description: 'A large internet exchange or carrier hotel — interconnection at scale, tens of MW.',
    typicalRacks: [500, 5000], powerKw: [10000, 90000], kwPerRack: [5, 15], cooling: 'Chilled water', redundancy: 'Tier III–IV', defaultTier: 'Tier III',
    multiTenant: true, coverage: 'Partial', gaps: ['multi-tenancy', 'optical-transport'],
    physical: { redundancy: '2N', containment: 'Cold-Aisle', rackHeightU: 42, coolingUnits: ['CRAH'], coolingZones: 3, liquidCooling: 'none', coolingOverhead: 0.3, feedVoltage: 33000, backupRuntimeMins: [10, 15], buildings: 1, floorsPerBuilding: [2, 3], tenants: CARRIER_TENANTS, wan: 'colo', diversityExpected: true, circuits: 8 },
    build: { blueprintKey: 'greenfield-dc', durationFactor: 1.0, defaultBudget: 180_000_000 }, capacity: { rackPowerWarnPct: 80, rackPowerBlockPct: 90, coolingHeadroomMinPct: 15 }, pueTarget: 1.45, seedRacks: 90,
  },
];

const BY_KEY: Record<string, DcTypeProfile> = Object.fromEntries(DC_TYPE_CATALOG.map((t) => [t.key, t]));

export function dcTypeProfile(key?: string | null): DcTypeProfile | undefined {
  return key ? BY_KEY[key] : undefined;
}

/** Resolve a profile from its display name (plan / programme intake stores the name). */
export function dcTypeByName(name?: string | null): DcTypeProfile | undefined {
  return name ? DC_TYPE_CATALOG.find((t) => t.name === name) : undefined;
}

/** Display name for a type key; falls back to the raw key or a dash. */
export function dcTypeName(key?: string | null): string {
  return dcTypeProfile(key)?.name ?? (key || '—');
}

export const DC_TYPES_BY_SEGMENT: Record<DcSegment, DcTypeProfile[]> = {
  Enterprise: DC_TYPE_CATALOG.filter((t) => t.segment === 'Enterprise'),
  Telco: DC_TYPE_CATALOG.filter((t) => t.segment === 'Telco'),
};

export const CAPABILITY_GAP_LABEL: Record<DcCapabilityGap, string> = {
  'multi-tenancy': 'Multi-tenancy (tenants, allocation, metering, cross-connects)',
  'dc-power-plant': '−48V DC power plant (rectifiers, battery strings, BDFB)',
  'optical-transport': 'Optical transport (DWDM / wavelengths / OTN)',
  'service-inventory': 'Service inventory / OSS-BSS',
};

/** Compact "1–5", "100s+", "20 MW+" style range formatting for the reference table and chips. */
export function fmtRange([min, max]: [number, number | null], unit = ''): string {
  const u = unit ? ` ${unit}` : '';
  if (max == null) return `${min.toLocaleString()}${u}+`;
  if (min === 0) return `<${max.toLocaleString()}${u}`;
  return `${min.toLocaleString()}–${max.toLocaleString()}${u}`;
}

/** Facility power as the spec writes it — kW below 1 MW, MW above. */
export function fmtPowerRange([min, max]: [number, number | null]): string {
  const mw = (kw: number) => (kw >= 1000 ? `${Math.round(kw / 100) / 10} MW` : `${kw} kW`);
  if (max == null) return `${mw(min)}+`;
  if (min === 0) return `<${mw(max)}`;
  const sameUnit = (min >= 1000) === (max >= 1000);
  return sameUnit ? `${mw(min).replace(/ (MW|kW)$/, '')}–${mw(max)}` : `${mw(min)}–${mw(max)}`;
}

/** Defaults the onboarding wizard applies when a type is picked. Design power = geometric-ish midpoint of the envelope. */
export function dcTypeDefaults(key: DcTypeKey): { tier: DCTier; designPowerKw: number; kwPerRack: number } {
  const p = BY_KEY[key];
  const [lo, hi] = p.powerKw;
  const mid = hi == null ? lo * 2 : Math.round(Math.sqrt(Math.max(lo, 1) * hi));
  const designPowerKw = Math.max(50, Math.round(mid / 50) * 50);
  const kwPerRack = p.kwPerRack ? Math.round((p.kwPerRack[0] + p.kwPerRack[1]) / 2) : 8;
  return { tier: p.defaultTier, designPowerKw, kwPerRack };
}

/** Chip variant for a coverage rating. */
export function coverageChipColor(c: DcTypeCoverage): string {
  return c === 'Full' ? 'success' : c === 'Strong' ? 'blue' : c === 'Partial' ? 'warning' : 'error';
}

// ── Profile fit: how a real site compares with its type's typical envelope ──
export type FitBand = 'below' | 'within' | 'above' | 'n/a';
export interface DcTypeFit { racks: FitBand; power: FitBand; density: FitBand; }

const band = (v: number, [lo, hi]: [number, number | null]): FitBand => (v < lo ? 'below' : hi != null && v > hi ? 'above' : 'within');

/** Compare a site's actuals with its type band. Power and density are the ones that matter — rack counts in a prototype estate are sampled well below real footprints. */
export function dcTypeFit(p: DcTypeProfile, actual: { racks: number; designPowerKw: number; avgMaxKwPerRack: number }): DcTypeFit {
  return {
    racks: actual.racks > 0 ? band(actual.racks, p.typicalRacks) : 'n/a',
    power: band(actual.designPowerKw, p.powerKw),
    density: p.kwPerRack && actual.avgMaxKwPerRack > 0 ? band(actual.avgMaxKwPerRack, p.kwPerRack) : 'n/a',
  };
}

/** Clamp a design-power figure into the type's envelope, rounded to 50 kW. */
export function clampDesignPower(p: DcTypeProfile, kw: number): number {
  const [lo, hi] = p.powerKw;
  const v = Math.min(Math.max(kw, Math.max(lo, 50)), hi ?? Number.MAX_SAFE_INTEGER);
  return Math.max(50, Math.round(v / 50) * 50);
}

// ── Plant plan: the power chain + cooling a site of this type is materialised with ──
export interface PlantPlan {
  feeds: { name: string; capacityKw: number; voltage: number; role: 'A-side' | 'B-side' }[];
  /** UPS rooms, or −48V DC plants (rectifiers + battery strings) for telco types. */
  backup: { name: string; capacityKw: number; runtimeMins: number; feedIdx: number }[];
  /** PDUs, or BDFBs (battery distribution fuse boards) for DC-plant sites. */
  distribution: { name: string; capacityKw: number; backupIdx: number }[];
  zones: { name: string; units: { name: string; type: CoolingUnitType }[] }[];
}

/**
 * Pure: derive the plant a site of this type needs for a given design power and
 * rack count. Shared by the seed and the onboarding commit so both produce the
 * same shape — A/B utility feeds unless the posture is plain N, UPS count from the
 * redundancy notation, DC-plant naming for telco sites, PDUs sized ~10 racks each,
 * and cooling zones populated with the type's unit mix.
 */
export function plantPlan(p: DcTypeProfile, designPowerKw: number, rackCount: number, rnd: (min: number, max: number) => number): PlantPlan {
  const ph = p.physical;
  const dual = ph.redundancy !== 'N';
  const feeds: PlantPlan['feeds'] = dual
    ? [{ name: 'Utility A-side', capacityKw: Math.round(designPowerKw * 0.7), voltage: ph.feedVoltage, role: 'A-side' }, { name: 'Utility B-side', capacityKw: Math.round(designPowerKw * 0.7), voltage: ph.feedVoltage, role: 'B-side' }]
    : [{ name: 'Utility feed', capacityKw: Math.round(designPowerKw * 1.1), voltage: ph.feedVoltage, role: 'A-side' }];
  const nBackup = ph.redundancy === 'N' ? 1 : ph.redundancy === '2N+1' ? 3 : 2;
  const backup: PlantPlan['backup'] = Array.from({ length: nBackup }, (_, i) => ({
    name: p.dcPowerPlant ? `DC Plant ${i + 1} (−48V rectifiers + battery strings)` : `UPS-${i + 1}`,
    capacityKw: Math.round(designPowerKw * (nBackup === 1 ? 1.0 : 0.6)),
    runtimeMins: rnd(ph.backupRuntimeMins[0], ph.backupRuntimeMins[1]),
    feedIdx: i % feeds.length,
  }));
  const nDist = Math.max(1, Math.round(rackCount / 10));
  const perDist = Math.max(15, Math.round((designPowerKw * 1.2) / nDist / 5) * 5);
  const distribution: PlantPlan['distribution'] = Array.from({ length: nDist }, (_, i) => ({
    name: p.dcPowerPlant ? `BDFB-${i + 1}` : `PDU-${i + 1}`, capacityKw: Math.min(perDist, 250), backupIdx: i % nBackup,
  }));
  const zones: PlantPlan['zones'] = Array.from({ length: ph.coolingZones }, (_, z) => {
    const nUnits = rackCount <= 10 ? 1 : rackCount <= 40 ? 2 : 3;
    return {
      name: ph.coolingZones === 1 ? 'Cooling Zone' : `Cooling Zone ${z + 1}`,
      units: Array.from({ length: nUnits }, (_, u) => { const type = ph.coolingUnits[u % ph.coolingUnits.length]; return { name: `${type}-${z + 1}${u + 1}`, type }; }),
    };
  });
  return { feeds, backup, distribution, zones };
}

/** Capacity bands for a site; untyped sites keep the platform-wide defaults the policies used before types existed. */
export const DEFAULT_CAPACITY: DcTypeCapacity = { rackPowerWarnPct: 85, rackPowerBlockPct: 90, coolingHeadroomMinPct: 10 };
export function capacityThresholds(key?: string | null): DcTypeCapacity {
  return dcTypeProfile(key)?.capacity ?? DEFAULT_CAPACITY;
}

/**
 * PUE for a site: 1 + the type's cooling overhead scaled by how hard the cooling plant is
 * working relative to IT load (bounded 0.6–1.5) + ~7% electrical distribution loss.
 * Shared by the geo map and the sustainability page so both read the same number.
 */
export function pueFor(key: string | null | undefined, itKw: number, coolKw: number): number {
  if (itKw <= 0) return 0;
  const overhead = dcTypeProfile(key)?.physical.coolingOverhead ?? 0.3;
  const coolingWork = Math.min(1.5, Math.max(0.6, coolKw / itKw));
  return Math.round((1 + overhead * coolingWork + 0.07) * 100) / 100;
}

/** PUE target for a type; untyped sites use the classic 1.5 enterprise figure. */
export function pueTargetFor(key?: string | null): number {
  return dcTypeProfile(key)?.pueTarget ?? 1.5;
}
