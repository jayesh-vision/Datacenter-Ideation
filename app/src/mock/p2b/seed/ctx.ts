/* Seed context for the P2B planner seed (templates, benchmarks, demo plans), over OUR estate: the collections are the adapted
   estate records (adapter.ts), dates are relative to the mock clock, random draws come from a fixed-seed stream, and the people are
   this geography's cast. P2B's demo plans name campuses by key (FRA, ASH, DAL, SIN, SYD, DUB, GRU); `SITE_KEYS` places each key on
   one of our datacenters by position, so the story lands on the same kind of site in every persona and geography. */
import type * as T from '../../../planner/p2b/types';
import { PEOPLE, type Person } from '../../../planner/compat/people';
export { PEOPLE, type Person };
export const CUSTOMER = 'CUST-001';

/** P2B campus key → our datacenter position (1-based, as dcAt): the hero site, the UPS site, the GPU site, a liquid site… */
export const SITE_KEYS: Record<string, number> = { ASH: 1, FRA: 20, DAL: 9, SIN: 3, SYD: 22, DUB: 16, GRU: 5 };

/** The datacenter a campus key lands on in a list of planner datacenters (position, or a live one when that position is only planned). */
export function siteAtKey(dataCenters: T.DataCenter[], code: string): T.DataCenter | undefined {
  const pos = SITE_KEYS[code.slice(0, 3).toUpperCase()];
  const live = dataCenters.filter(d => d.status !== 'Planned');
  return pos ? (dataCenters[pos - 1]?.status !== 'Planned' ? dataCenters[pos - 1] : live[pos % live.length]) : undefined;
}

function mulberry(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

type Coll = Record<string, unknown>[];
export class Seed {
  readonly now: number;
  geo: 'in' | 'us' = 'in';
  private counters: Record<string, number> = {};
  private rnd = mulberry(42);
  dcCampus = new Map<string, string>();
  constructor(now: number, estate: Record<string, Coll>) {
    this.now = now;
    for (const [k, v] of Object.entries(estate)) (this as unknown as Record<string, Coll>)[k] = v;
  }
  /** our datacenter for a P2B campus key (or a DC-code prefix such as 'DAL-HDC1') */
  siteByKey(code: string): T.DataCenter | undefined {
    /* the second Dublin site (CO-1) is a neighbour of the first: another live site in the same region */
    if (code.toUpperCase().startsWith('DUB-CO')) { const a = this.siteByKey('DUB'); const live = this.dataCenters.filter(d => d.status !== 'Planned' && d.id !== a?.id); return live.find(d => d.campusId !== a?.campusId && this.campuses.find(c => c.id === d.campusId)?.regionId === this.campuses.find(c => c.id === a?.campusId)?.regionId) ?? live[0]; }
    return siteAtKey(this.dataCenters, code);
  }

  nid(prefix: string): string { return `${prefix}-${String((this.counters[prefix] = (this.counters[prefix] ?? 0) + 1)).padStart(4, '0')}`; }
  int(min: number, max: number): number { const hi = Math.max(min, max); return min + Math.floor(this.rnd() * (hi - min + 1)); }
  pick<X>(arr: readonly X[]): X { return arr[Math.floor(this.rnd() * arr.length)]; }
  cycle<X>(arr: readonly X[], i: number): X { const n = arr.length; return arr[((i % n) + n) % n]; }
  chance(p: number): boolean { return this.rnd() < p; }
  r1(n: number): number { return Math.round(n * 10) / 10; }
  daysAgo(d: number): string { return new Date(this.now - d * 864e5).toISOString(); }
  daysAhead(d: number): string { return new Date(this.now + d * 864e5).toISOString(); }
  meta(by?: Person): Omit<T.BaseEntity, 'id'> {
    return { customerId: CUSTOMER, createdAt: this.daysAgo(this.int(60, 600)), updatedAt: this.daysAgo(this.int(1, 30)), createdBy: by?.name ?? 'System Seed', createdById: by?.id ?? 'system', isDeleted: false };
  }
  person(i: number): Person { return this.cycle(PEOPLE, i); }
  byRole(role: string): Person { return PEOPLE.find(p => p.role === role) ?? PEOPLE[0]; }
  siteStaff(campusKey: string, i = 0): Person { const local = PEOPLE.filter(p => p.site === campusKey); return local.length ? this.cycle(local, i) : this.person(i); }

  // estate (from the adapter)
  regions: T.Region[] = []; campuses: T.Campus[] = []; dataCenters: T.DataCenter[] = []; buildings: T.Building[] = []; floors: T.Floor[] = []; halls: T.Hall[] = []; rows: T.Row[] = []; racks: T.Rack[] = [];
  rackTypes: T.RackType[] = []; edgeLocations: T.EdgeLocation[] = []; utilityFeeds: T.UtilityFeed[] = []; transformers: T.Transformer[] = []; upsUnits: T.UPS[] = []; generators: T.Generator[] = []; pdus: T.PDU[] = [];
  coolingZones: T.CoolingZone[] = []; cracUnits: T.CRAC[] = []; chillers: T.Chiller[] = []; devices: T.Device[] = []; assetModels: T.AssetModel[] = []; capacityReservations: T.CapacityReservation[] = [];
  customers: T.Customer[] = []; services: T.Service[] = []; providers: T.Provider[] = []; circuits: T.Circuit[] = []; circuitTerminations: T.CircuitTermination[] = []; changeRequests: T.ChangeRequest[] = [];
  subnets: T.Subnet[] = []; vlans: T.VLAN[] = [];
  // records the planner seed writes
  plannerTemplates: T.PlannerTemplate[] = []; plannerBenchmarks: T.PlannerBenchmark[] = []; plannerPlans: T.PlannerPlan[] = []; plannerScenarios: T.PlannerScenario[] = []; plannerFeedback: T.PlannerFeedback[] = [];
  // delivery-side records the governance seed may link (empty here: our Delivery reads executing plans directly)
  programs: T.Program[] = []; projects: T.Project[] = []; boms: T.BOM[] = []; purchaseOrders: T.PurchaseOrder[] = []; contracts: T.Contract[] = []; permits: T.Permit[] = []; designDocuments: T.DesignDocument[] = [];
  maintenanceWindows: T.MaintenanceWindow[] = []; approvalMatrixRules: T.ApprovalMatrixRule[] = []; approvalSteps: T.ApprovalStep[] = []; disposalCertificates: T.DisposalCertificate[] = [];
}
