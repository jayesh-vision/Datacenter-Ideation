/**
 * Planner data — every platform collection the planner reads, in one typed bundle.
 *
 * The engine, the scope models, sourcing, impact and execution all take a `PlannerData`
 * so the same code runs in the browser (from MockDB through react-query) and in the smoke
 * scripts (from a seed snapshot). Collections the planner does not read are not loaded.
 */
import { useEntityList } from '../compat/useEntityCRUD';
import type * as T from '../p2b/types';

export interface PlannerData {
  // estate
  regions: T.Region[]; campuses: T.Campus[]; dataCenters: T.DataCenter[]; buildings: T.Building[]; floors: T.Floor[]; halls: T.Hall[]; rows: T.Row[]; racks: T.Rack[]; rackTypes: T.RackType[]; edgeLocations: T.EdgeLocation[];
  // facility plant
  utilityFeeds: T.UtilityFeed[]; transformers: T.Transformer[]; upsUnits: T.UPS[]; generators: T.Generator[]; pdus: T.PDU[]; powerPanels: T.PowerPanel[]; powerFeeds: T.PowerFeed[];
  coolingZones: T.CoolingZone[]; cracUnits: T.CRAC[]; chillers: T.Chiller[];
  // IT and network
  devices: T.Device[]; deviceComponents: T.DeviceComponent[]; cables: T.Cable[]; assetModels: T.AssetModel[]; virtualChassis: T.VirtualChassis[]; interfaces: T.Interface[]; configBackups: T.ConfigBackup[];
  // capacity holds
  capacityReservations: T.CapacityReservation[]; rackReservations: T.RackReservation[];
  // IPAM
  cidrBlocks: T.CIDRBlock[]; subnets: T.Subnet[]; vlans: T.VLAN[]; ipAddresses: T.IPAddress[];
  // services and connectivity
  customers: T.Customer[]; services: T.Service[]; providers: T.Provider[]; circuits: T.Circuit[]; circuitTerminations: T.CircuitTermination[];
  // change and governance
  changeRequests: T.ChangeRequest[]; maintenanceWindows: T.MaintenanceWindow[]; approvalMatrixRules: T.ApprovalMatrixRule[];
  // commercial
  vendors: T.Vendor[]; contracts: T.Contract[]; purchaseOrders: T.PurchaseOrder[];
  // delivery
  programs: T.Program[]; projects: T.Project[]; milestones: T.Milestone[]; permits: T.Permit[]; atps: T.Atp[]; hotos: T.Hoto[]; demandRequests: T.DemandRequest[];
  // planner
  plannerPlans: T.PlannerPlan[]; disposalCertificates: T.DisposalCertificate[];
  /** True once every collection has loaded at least once (hooks only). */
  ready: boolean;
}

export const PLANNER_DATA_KEYS = [
  'regions', 'campuses', 'dataCenters', 'buildings', 'floors', 'halls', 'rows', 'racks', 'rackTypes', 'edgeLocations',
  'utilityFeeds', 'transformers', 'upsUnits', 'generators', 'pdus', 'powerPanels', 'powerFeeds', 'coolingZones', 'cracUnits', 'chillers',
  'devices', 'deviceComponents', 'cables', 'assetModels', 'virtualChassis', 'interfaces', 'configBackups',
  'capacityReservations', 'rackReservations', 'cidrBlocks', 'subnets', 'vlans', 'ipAddresses',
  'customers', 'services', 'providers', 'circuits', 'circuitTerminations',
  'changeRequests', 'maintenanceWindows', 'approvalMatrixRules', 'vendors', 'contracts', 'purchaseOrders',
  'programs', 'projects', 'milestones', 'permits', 'atps', 'hotos', 'demandRequests', 'plannerPlans', 'disposalCertificates',
] as const satisfies readonly (keyof Omit<PlannerData, 'ready'>)[];
export type PlannerDataKey = (typeof PLANNER_DATA_KEYS)[number];

/** Empty bundle (used before anything has loaded, and as a base in tests). */
export function emptyPlannerData(): PlannerData {
  const out = { ready: false } as Record<string, unknown>;
  for (const k of PLANNER_DATA_KEYS) out[k] = [];
  return out as unknown as PlannerData;
}

/** Bundle from a seed snapshot (smoke scripts). Missing collections are empty. */
export function plannerDataFromSnapshot(snap: Record<string, unknown>): PlannerData {
  const out = { ready: true } as Record<string, unknown>;
  for (const k of PLANNER_DATA_KEYS) out[k] = (snap[k] as unknown[] | undefined)?.filter(r => !(r as { isDeleted?: boolean }).isDeleted) ?? [];
  return out as unknown as PlannerData;
}

const BIG = { pageSize: 100000 } as const;
const EMPTY: never[] = [];

/** Every planner collection from MockDB. The bundle keeps its identity until a collection changes, so memoised evaluations stay cached. */
let lastDatas: unknown[] = []; let lastReady = false; let lastBundle: PlannerData | undefined;
export function usePlannerData(): PlannerData {
  // One useEntityList per key, always in PLANNER_DATA_KEYS order.
  const results = PLANNER_DATA_KEYS.map(k => useEntityList(k, BIG)); // eslint-disable-line react-hooks/rules-of-hooks
  const datas = results.map(r => r.data?.data);
  const ready = results.every(r => r.data !== undefined);
  if (lastBundle && ready === lastReady && datas.length === lastDatas.length && datas.every((d, i) => d === lastDatas[i])) return lastBundle;
  const out = { ready } as Record<string, unknown>;
  PLANNER_DATA_KEYS.forEach((k, i) => { out[k] = (datas[i] ?? EMPTY).filter(r => !(r as { isDeleted?: boolean }).isDeleted); });
  lastDatas = datas; lastReady = ready; lastBundle = out as unknown as PlannerData;
  return lastBundle;
}

/** Index helpers built once per bundle. */
const INDEX = new WeakMap<PlannerData, Map<string, Map<string, unknown>>>();
export function byId<K extends PlannerDataKey>(data: PlannerData, key: K, id: string | undefined): PlannerData[K][number] | undefined {
  if (!id) return undefined;
  let idx = INDEX.get(data); if (!idx) { idx = new Map(); INDEX.set(data, idx); }
  let m = idx.get(key);
  if (!m) { m = new Map((data[key] as { id: string }[]).map(r => [r.id, r])); idx.set(key, m); }
  return m.get(id) as PlannerData[K][number] | undefined;
}
/** Group a collection by a field, memoised per bundle. */
const GROUPS = new WeakMap<PlannerData, Map<string, Map<string, unknown[]>>>();
export function groupBy<K extends PlannerDataKey>(data: PlannerData, key: K, field: string): Map<string, PlannerData[K][number][]> {
  let g = GROUPS.get(data); if (!g) { g = new Map(); GROUPS.set(data, g); }
  const gk = `${key}.${field}`;
  let m = g.get(gk);
  if (!m) { m = new Map(); for (const r of data[key] as unknown as Record<string, unknown>[]) { const v = r[field]; if (v === undefined || v === null) continue; const arr = m.get(String(v)) ?? []; arr.push(r); m.set(String(v), arr); } g.set(gk, m); }
  return m as Map<string, PlannerData[K][number][]>;
}
