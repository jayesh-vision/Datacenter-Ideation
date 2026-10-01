/* API contract. These are the shapes the UI consumes. Today they are produced
   by the in-memory mock in src/mock/; a REST backend only has to return the
   same shapes from the functions in src/api/index.ts. */

export type LocationKind = 'datacenter' | 'pop' | 'site';
export type RolloutStatus = 'on-air' | 'in-progress' | 'planned' | 'failed';
export type Blocker = 'power' | 'fiber' | 'commissioning' | 'supply' | 'lease' | 'civil' | 'regulatory';

export interface Region { id: string; name: string }
export interface Circle { id: string; name: string; state: string; regionId: string; lat: number; lng: number }

/* Every estate location. PoPs and sites carry inventory as counts only; a
   datacenter additionally has a full Datacenter record. */
export interface Location {
  id: string; name: string; kind: LocationKind; status: RolloutStatus; circleId: string; regionId: string;
  city: string; state: string; lat: number; lng: number; category: 'Central' | 'Regional' | 'Edge';
  neCount: number; discovered: number; roles: Record<string, number>; blocker?: Blocker; blockerNote?: string;
  /* passive + logical counts rolled up to the estate view */
  passive: { fiberSpans: number; odf: number; racks: number; powerPlant: number; splices: number; patchCords: number; ducts: number };
}

export type NeRole = 'Router' | 'Switch' | 'DWDM' | 'Firewall' | 'Access';
export type Discovery = 'verified' | 'drifted' | 'not-discovered';
export type NotDiscoveredReason = 'planned' | 'no-collector' | 'collector-unavailable' | 'not-applicable';
export type Health = 'healthy' | 'degraded' | 'critical' | 'unknown';

export interface PowerFeed { id: string; type: 'AC' | 'DC'; source: string; rating: string; loadKw: number; capacityKw: number; status: 'Normal' | 'Warning' | 'Alarm' }
export interface Rack { id: string; name: string; dcId: string; floor: string; room: string; role: string; heightU: number; usedU: number; drawKw: number; budgetKw: number; ports: number; portsUsed: number; tempC: number }
export interface PortClass { cls: string; total: number; used: number }
export interface UpsUnit { id: string; name: string; capacityKw: number; loadPct: number; redundancy: 'N' | 'N+1' | '2N'; batteryMin: number; state: 'Online' | 'On battery' | 'Bypass' | 'Fault' }
export interface CoolingUnit { id: string; name: string; type: 'CRAH' | 'CRAC' | 'CDU'; zone: string; capacityKw: number; loadPct: number; supplyC: number; returnC: number; status: 'Operational' | 'Maintenance' | 'Failed' }
export interface EnvSensor { id: string; zone: string; tempC: number; humidity: number; smoke: boolean; leak: boolean }
export interface CableCore { port: number; state: 'connected' | 'free' | 'direct'; strand?: string; neId?: string; inIf?: string; outPort?: number; outIf?: string }

export interface Datacenter {
  id: string; locationId: string; name: string; status: RolloutStatus; category: Location['category']; siteType: 'Datacenter';
  regionId: string; circleId: string; zone: string; city: string; state: string; address: string; lat: number; lng: number; tier: 'Tier II' | 'Tier III' | 'Tier IV';
  commissionedOn?: number; collectors: { id: string; name: string; state: 'up' | 'stale' | 'down'; lastSeen: number }[];
  capex: { approved: number; committed: number; spent: number; lines: { item: string; approved: number; committed: number }[] };
  opex: { monthly: number; drivers: { item: string; monthly: number }[] };
  power: { capacityKw: number; acKw: number; dcKw: number; peakKw: number; pue: number; feeds: PowerFeed[]; load24h: number[]; split: { label: string; kw: number }[];
    dg: { kva: number; runtimeH: number; fuelPct: number; lastTest: number; result: 'Pass' | 'Fail' }; battery: { volts: number; ah: number; runtimeH: number; lastTest: number }; ups: UpsUnit[]; history12m: number[] };
  cooling: { capacityKw: number; loadKw: number; redundancy: 'N' | 'N+1' | '2N'; units: CoolingUnit[]; sensors: EnvSensor[] };
  floors: { name: string; rooms: string[] }[];
  racks: Rack[];
  ports: PortClass[];
  cabling: { cable: string; cores: number; ledger: CableCore[] };
  compute: { cpuCores: number; cpuUsed: number; memGb: number; memUsed: number; storageTb: number; storageUsed: number };
  risks: { id: string; domain: 'Inventory' | 'Facility' | 'Network' | 'Security' | 'Supplier' | 'Commissioning'; title: string; detail: string; severity: Severity; owner: string; opened: number }[];
  readiness: { step: string; done: boolean; note?: string }[];
}

export interface NetworkElement {
  id: string; dcId: string; name: string; role: NeRole; layer: 'core' | 'spine' | 'leaf' | 'access'; vendor: string; model: string; os: string; serial: string;
  ip: string; mac: string; rackId: string; u: number; lifecycle: 'Ready' | 'Planned' | 'Maintenance' | 'Decommissioning';
  discovery: Discovery; ndReason?: NotDiscoveredReason; drift?: { attr: string; record: string; observed: string }[]; duplicateSerialOf?: string;
  lastSeen?: number; collector?: string; health: Health; healthScore: number; cpu: number; mem: number; tempC: number; uptimeMin: number; lastReboot: number;
  icmp: { lossPct: number; latencyMs: number; jitterMs: number; availability: number; state: Health; hourly: boolean[] };
  ntp: { offsetMs: number; delayMs: number; jitterMs: number; stratum: number; state: 'Synchronised' | 'Unsynchronised'; primary: string; secondary: string; lastSync: number; hourly: boolean[] };
  radius: { successPct: number; failures24h: number; primary: 'Reachable' | 'Unreachable'; secondary: 'Reachable' | 'Unreachable'; lastAuth: number; state: Health; pri: string; sec: string };
  modules: { slot: string; name: string; serial: string; state: 'OK' | 'Fault' | 'Empty'; tempC: number }[];
  isPe: boolean;
}

export type IfState = 'up' | 'down' | 'admin-down' | 'reserved';
export interface Interface {
  id: string; neId: string; name: string; type: string; speedMbps: number; state: IfState; utilPct: number; inErrors: number; crcErrors: number; flaps24h: number;
  optics?: { model: string; rxDbm: number; txDbm: number; tempC: number }; peer?: { neId: string; ifName: string }; description: string;
}

export type Protocol = 'LLDP' | 'OSPF' | 'BGP' | 'ISIS' | 'LSP';
export type LinkState = 'up' | 'down' | 'init' | 'idle' | 'standby';
export interface Link {
  id: string; protocol: Protocol; aNe: string; aIf: string; zNe: string; zIf: string; dcId: string; capacityMbps: number; utilPct: number;
  state: LinkState; role: 'Fabric' | 'Uplink' | 'Backhaul' | 'Peering' | 'Access'; sessions: number; growthPct: number; history: number[]; physical: { cable: string; strand: string; aPort: string; zPort: string } | null;
}

export type ServiceType = 'IRV' | 'Leased Line' | 'L2VPN' | 'L3VPN' | 'Other';
export type ServiceStatus = 'Active' | 'Degraded' | 'Down' | 'Disabled';
export interface Service {
  id: string; type: ServiceType; customerId: string; dcId: string; neId: string; ifName: string; path: string[]; linkIds: string[];
  bandwidthMbps: number; utilPct: number; status: ServiceStatus; slaTarget: number; uptime30d: number; growthPct: number; revenueMonthly: number; critical: boolean;
}

export interface Customer { id: string; name: string; segment: 'Enterprise' | 'Carrier' | 'Government' | 'BFSI' | 'Healthcare' | 'Media'; city: string; state: string; plan: string; premium: boolean; revenueMonthly: number; accountManager: string }

export type Severity = 'critical' | 'major' | 'minor' | 'warning';
export interface Alert {
  id: string; code: string; neId?: string; dcId: string; ifName?: string; linkId?: string; severity: Severity; title: string; description: string;
  source: 'Interface' | 'CPU' | 'Link' | 'Environment' | 'Power' | 'Cooling' | 'Protocol' | 'Security' | 'Discovery';
  type: string; start: number; state: 'active' | 'acknowledged' | 'cleared'; incidentId?: string; ackBy?: string;
}

export type IncidentStatus = 'Open' | 'Investigating' | 'Mitigated' | 'Resolved' | 'Closed';
export interface Hypothesis { cause: string; confidence: number; evidence: { label: string; ref?: string; at?: number }[]; rejected?: boolean }
export interface ActionStep { id: string; step: string; owner: string; expected: string; rollback: string; verify: string; disruptive: boolean; status: 'pending' | 'awaiting-approval' | 'approved' | 'running' | 'done' | 'rejected' }
export interface Incident {
  id: string; title: string; type: 'Network' | 'Power' | 'Cooling' | 'Rack' | 'Capacity' | 'Security'; sev: 1 | 2 | 3 | 4; pri: 1 | 2 | 3 | 4; status: IncidentStatus;
  owner: string; reportedBy: string; dcId: string; detected: number; acknowledged?: number; resolved?: number; responseSlaMin: number; resolveSlaMin: number;
  alertIds: string[]; affected: { kind: 'NE' | 'Link' | 'Rack' | 'Service' | 'Customer' | 'Facility'; id: string; label: string }[];
  rca: Hypothesis[]; actions: ActionStep[]; changeIds: string[]; worklog: { at: number; who: string; text: string; kind: 'system' | 'human' | 'ai' }[];
  impact: { services: number; customers: number; premium: number; revenueAtRisk: number; summary: string; level: 'High' | 'Medium' | 'Low' };
  similar: { text: string; nodes: string[] } | null; verification: { check: string; ok: boolean | null }[]; feedback?: 'confirmed' | 'rejected';
}

export type ChangeStatus = 'Draft' | 'Pending approval' | 'Approved' | 'In progress' | 'Completed' | 'Rolled back' | 'Rejected';
export interface Change {
  id: string; kind: 'Change' | 'Maintenance'; title: string; dcId: string; scope: string[]; risk: 'Low' | 'Medium' | 'High'; status: ChangeStatus;
  windowStart: number; windowEnd: number; requester: string; approver?: string; rollback: string; created: number; emergency?: boolean; incidentId?: string;
}

export interface ReconTask {
  id: string; dcId: string; neId: string; kind: 'not-discovered' | 'drift' | 'duplicate-serial'; status: 'Open' | 'In progress' | 'Resolved'; assignee?: string; created: number;
  decision?: 'accept-observed' | 'keep-record' | 'retire' | 'collector-assigned' | 'not-applicable';
}
export interface AuditEntry { id: string; at: number; actor: string; object: string; field: string; prev: string; next: string; source: string; note?: string }

export interface CapacityPlan { id: string; dcId: string; dimension: 'Power' | 'Cooling' | 'Space' | 'Ports' | 'Bandwidth'; title: string; amount: number; unit: string; target: number; status: 'Submitted' | 'Approved' | 'Executing' | 'Delivered'; capex: number }

export interface TimelineEvent { at: number; kind: 'commissioning' | 'change' | 'incident' | 'maintenance' | 'capacity' | 'discovery'; title: string; ref?: string }

/* Derived roll-ups returned by the API so screens never re-count. */
export interface DcSummary {
  id: string; name: string; status: RolloutStatus; category: Location['category']; city: string; state: string; regionId: string; circleId: string; address: string; tier: Datacenter['tier'];
  ne: number; discovered: number; verified: number; drifted: number; notDiscovered: number; coveragePct: number; links: number; byRole: Record<string, number>;
  powerKw: number; powerCapKw: number; rackUsedU: number; rackTotalU: number; portsUsed: number; portsTotal: number; activeAlerts: number; critAlerts: number;
  openIncidents: number; services: number; customers: number; healthScore: number; capexCommitted: number; capexApproved: number; opexMonthly: number; pue: number;
}
