/* API contract. These are the shapes the UI consumes. Today they are produced
   by the in-memory mock in src/mock/; a REST backend only has to return the
   same shapes from the functions in src/api/index.ts. */

export type LocationKind = 'datacenter' | 'pop' | 'site';
export type RolloutStatus = 'on-air' | 'in-progress' | 'planned' | 'failed';
/* Datacenter persona — the business model the whole estate is modelled as.
   The physical layer (power, cooling, racks, alarms, incidents) is shared;
   what sits in the racks, who the customer is and what a service is change. */
export type Persona = 'network' | 'colocation' | 'cloud' | 'enterprise';
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

export type NeRole = 'Router' | 'Switch' | 'DWDM' | 'Firewall' | 'Access' | 'Server' | 'Storage' | 'GPU' | 'Tenant gear';
export type NeCategory = 'network' | 'compute' | 'storage' | 'tenant';
export const NE_CATEGORY: Record<NeRole, NeCategory> = { Router: 'network', Switch: 'network', DWDM: 'network', Firewall: 'network', Access: 'network', Server: 'compute', GPU: 'compute', Storage: 'storage', 'Tenant gear': 'tenant' };
export type Discovery = 'verified' | 'drifted' | 'not-discovered';
export type NotDiscoveredReason = 'planned' | 'no-collector' | 'collector-unavailable' | 'not-applicable';
export type Health = 'healthy' | 'degraded' | 'critical' | 'unknown';

export interface PowerFeed { id: string; type: 'AC' | 'DC'; source: string; rating: string; loadKw: number; capacityKw: number; status: 'Normal' | 'Warning' | 'Alarm' }
export interface Rack {
  id: string; name: string; dcId: string; floor: string; room: string; role: string; heightU: number; usedU: number; drawKw: number; budgetKw: number; ports: number; portsUsed: number; tempC: number;
  /* colocation: a cabinet leased to a tenant; the operator sees power and environment only */
  owner?: 'operator' | 'tenant'; tenantId?: string; contractedKw?: number;
}
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
  /* chassis height (rack units); tenant gear = an opaque block of customer equipment */
  uSize?: number; tenantId?: string;
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

export type ServiceType =
  | 'IRV' | 'Leased Line' | 'L2VPN' | 'L3VPN' | 'Other'                                   // network / telco
  | 'Cabinet lease' | 'Power circuit' | 'Cross-connect' | 'Remote hands'                   // colocation
  | 'VM' | 'Storage volume' | 'Managed DB' | 'GPU cluster' | 'Kubernetes'                  // cloud
  | 'Core application' | 'Database' | 'Collaboration' | 'Analytics' | 'Backup & DR';       // enterprise
export type ServiceUnit = 'Mbps' | 'kW' | 'vCPU' | 'TB' | 'GPU' | 'users' | 'cabinets' | 'hours';
export type ServiceStatus = 'Active' | 'Degraded' | 'Down' | 'Disabled';
export interface Service {
  id: string; type: ServiceType; customerId: string; dcId: string; neId: string; ifName: string; path: string[]; linkIds: string[];
  bandwidthMbps: number; utilPct: number; status: ServiceStatus; slaTarget: number; uptime30d: number; growthPct: number; revenueMonthly: number; critical: boolean;
  /* what the service is sized in: Mbps for circuits, kW for a power circuit, vCPU for a VM… */
  qty: number; unit: ServiceUnit;
}

export interface Customer { id: string; name: string; segment: string; city: string; state: string; plan: string; premium: boolean; revenueMonthly: number; accountManager: string }

export type Severity = 'critical' | 'major' | 'minor' | 'warning';
export interface Alert {
  id: string; code: string; neId?: string; dcId: string; ifName?: string; linkId?: string; severity: Severity; title: string; description: string;
  source: 'Interface' | 'CPU' | 'Link' | 'Environment' | 'Power' | 'Cooling' | 'Protocol' | 'Security' | 'Discovery';
  type: string; start: number; state: 'active' | 'acknowledged' | 'cleared'; incidentId?: string; ackBy?: string;
  /* operational scope relative to `dcId` (see AlertScope); `node` names a
     remote (non-datacenter) device when there is no NetworkElement record */
  scope: AlertScope; category: AlertCategory; node?: string; nodeLocation?: string; hops?: number; symptomOf?: string;
  /* rack-level fault (PDU breaker, cabinet power or inlet temperature): hits every service hosted in that rack */
  rackId?: string;
  /* one physical fault seen on several devices (e.g. a shelf midplane under two sleds): same id, shared location */
  fault?: { id: string; where: string };
}

/* What counts as a datacenter issue (operations model):
   site       — inside the site: facility, racked devices, internal links
   edge       — a link leaving the site (backhaul, uplink to a PoP)
   dependency — something the site depends on outside it: the far-end node of
                an edge link as it affects that link, monitoring collectors
   downstream — beyond the edge, depending ON the site; never counted as a
                datacenter issue, only shown as impact when the site is the cause */
/* Operational state of a device (operations view, not inventory):
   in-service — installed and reporting telemetry;
   unmonitored — installed but no telemetry (collector missing or down);
   planned — on record but not installed; holds reserved rack space only;
   tenant-owned — colocation customer equipment: power and environment only. */
export type OpsState = 'in-service' | 'unmonitored' | 'planned' | 'tenant-owned';

export type AlertScope = 'site' | 'edge' | 'dependency' | 'downstream';
export type AlertCategory = 'Facility' | 'Network' | 'Device' | 'Performance';
export const DC_SCOPES: AlertScope[] = ['site', 'edge', 'dependency'];

export interface EdgeStatus { total: number; up: number; down: number; state: 'redundant' | 'redundancy-lost' | 'isolated'; downLinks: string[] }

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

/* Why a service is impacted: an active fault on its path, its links, its rack or the site. */
export interface ImpactCause {
  code: string; title: string; where: string; severity: Severity; kind: 'device' | 'interface' | 'link' | 'rack' | 'site' | 'utilisation'; to: string; related: number;
  /* when the fault began, the open incident tracking it and its operational domain (used by the revenue-impact model) */
  since?: number; incidentId?: string; domain?: RevDomain;
}

/* ---- Revenue impact: what each active datacenter issue is costing.
   A service is `down` or `degraded` (it is losing revenue now) or `exposed` (still running, but riding a
   critical fault such as a UPS on battery). Money per issue:
     rate    — revenue being lost per hour right now (monthly charge ÷ 730 h; degraded counts at 30%)
     lost    — service revenue lost so far (pro-rata for the time each service has been impacted)
     credits — SLA credits the fault has triggered so far (10 / 25 / 50% of the monthly charge by SLA shortfall)
   Exposed revenue costs nothing yet; `potentialRate` / `potentialCredits` say what it costs if the fault worsens. */
export type RevDomain = 'Power' | 'Cooling' | 'Network' | 'Device' | 'Capacity';
export const REV_DOMAINS: RevDomain[] = ['Power', 'Cooling', 'Network', 'Device', 'Capacity'];
export interface RevMoney { mrrDown: number; mrrDegraded: number; mrrExposed: number; rate: number; lost: number; credits: number }
export interface RevCliff { inMin: number; amount: number; services: number }
export interface RevIssue extends RevMoney {
  id: string; kind: 'incident' | 'fault'; title: string; where: string; dcId: string; domain: RevDomain; severity: Severity; to: string;
  incident?: { id: string; sev: number; status: IncidentStatus; owner: string; resolveLeft: number; breaching: boolean };
  since: number; services: number; down: number; degraded: number; exposed: number; customers: number; premium: number;
  /* the next SLA-credit step this issue will trigger if it is not restored */
  nextCliff: RevCliff | null;
  /* total impact (lost + credits) if it runs another 24 h */
  forecast24: number;
  /* exposed revenue: what it costs if the fault takes the services down (per hour, and credits after a 4 h outage) */
  potentialRate: number; potentialCredits: number;
  /* a change completed at the site shortly before the fault */
  changeId?: string;
  /* revenue rank (1 = costing the most) and whether its incident priority looks too low for that */
  rank: number; underPrioritised: boolean;
  top: { id: string; name: string; premium: boolean; services: number; mrr: number; lost: number; credits: number; state: 'down' | 'degraded' | 'exposed' }[];
  /* cumulative impact over time: from the start of the fault to 24 h from now (`potential` = if an exposed issue fails now) */
  curve: { t: number[]; v: number[]; nowIdx: number; potential: boolean };
}
export interface RevCustomer extends RevMoney {
  id: string; name: string; segment: string; premium: boolean; accountManager: string; mrr: number; services: number; down: number; degraded: number; exposed: number;
  /* credits already owed for the last 30 days (earlier incidents), next credit step, weakest SLA position */
  creditsLocked: number; nextCliffMin: number | null; belowSla: number; slaTarget: number; uptime: number; cause: string; issueId: string;
}
/* one open issue as it hits one customer: how many of their services, and what it has cost them */
export interface RevCustomerHit extends RevMoney { issue: RevIssue; services: number; down: number; degraded: number; exposed: number; mrr: number }
export interface RevDc extends RevMoney { id: string; city: string; state: string; tier: string; mrr: number; services: number; customers: number; issues: number; hist30: number; topIssue: string; topIssueId: string }
export interface RevExposure {
  id: string; kind: 'power' | 'cooling' | 'edge' | 'device' | 'rack'; dcId: string; what: string; why: string; mrr: number; rate: number; services: number; customers: number; premium: number; share: number; to: string;
}
export interface RevRack { id: string; name: string; room: string; mrr: number; services: number; customers: number; atRisk: number; state: 'down' | 'degraded' | 'exposed' | 'ok' }
export interface RevenueView {
  dcId?: string; now: number;
  base: { mrr: number; services: number; customers: number };
  total: RevMoney & { forecast24: number; potentialRate: number; potentialCredits: number; services: number; down: number; degraded: number; exposed: number; customers: number; premium: number };
  sla: { withinPct: number; below: number; creditsLocked: number; nextCliff: (RevCliff & { issueId: string; title: string }) | null; cliff60: { services: number; amount: number } };
  issues: RevIssue[];
  byDomain: (RevMoney & { domain: RevDomain; issues: number; services: number; hist30: number })[];
  byDc: RevDc[];
  customers: RevCustomer[];
  /* daily revenue impact for the last 30 days by domain (resolved incidents + what is open today) */
  trend: { days: number[]; series: Record<RevDomain, number[]>; total: number; lost: number; credits: number; incidents: number; avgPerIncident: number; worstDay: { at: number; amount: number } | null };
  exposures: RevExposure[];
  /* revenue by rack inside one datacenter (by device when everything sits in one or two racks) */
  racks: RevRack[]; rackBy: 'rack' | 'device';
  changeInduced: { issues: number; impact: number; share: number };
  method: { degradedFactor: number; tiers: { shortfall: string; credit: number }[]; outageHours: number };
}

/* Derived roll-ups returned by the API so screens never re-count. */
export interface DcSummary {
  id: string; name: string; status: RolloutStatus; category: Location['category']; city: string; state: string; regionId: string; circleId: string; address: string; tier: Datacenter['tier'];
  ne: number; discovered: number; verified: number; drifted: number; notDiscovered: number; coveragePct: number; links: number; byRole: Record<string, number>;
  powerKw: number; powerCapKw: number; rackUsedU: number; rackTotalU: number; portsUsed: number; portsTotal: number; activeAlerts: number; critAlerts: number;
  openIncidents: number; services: number; customers: number; healthScore: number; capexCommitted: number; capexApproved: number; opexMonthly: number; pue: number;
  /* operational roll-ups */
  coolPct: number; worstSev: number; servicesDegraded: number; linksDown: number; unreachable: number; facilityIssues: string[];
  edge: EdgeStatus; byScope: Record<'site' | 'edge' | 'dependency', number>; downstreamExcluded: number;
  installed: number; inService: number; unmonitored: number; planned: number; tenantOwned: number;
  byCategory: Record<NeCategory, number>;
  /* revenue hosted at the site, what is down or degraded, what rides a critical fault, the hourly loss and the impact so far */
  mrr: number; revAtRisk: number; revExposed: number; revRate: number; revImpact: number;
}
