/* API contract. These are the shapes the UI consumes. Today they are produced
   by the in-memory mock in src/mock/; a REST backend only has to return the
   same shapes from the functions in src/api/index.ts. */

export type LocationKind = 'datacenter' | 'pop' | 'site';
export type RolloutStatus = 'on-air' | 'in-progress' | 'planned' | 'failed';
/* Datacenter persona — the business model the whole estate is modelled as.
   The physical layer (power, cooling, racks, alarms, incidents) is shared;
   what sits in the racks, who the customer is and what a service is change. */
export type Persona = 'network' | 'colocation' | 'cloud' | 'enterprise' | 'neocloud';
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
  /* high-density AI rack (GPU nodes or a tenant AI cage) and how it is cooled */
  density?: 'ai'; liquid?: boolean;
  /* a rack the operator added for its own servers (telco NFV / OSS / management racks, the colocation operator rack; 15-Oct-2026) */
  opServers?: boolean;
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
  /* what an operator server runs (telco NFV hosts, OSS / BSS / IMS, management servers; the colocation operator's DCIM / BMS / CCTV …) */
  purpose?: string;
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
  | 'Core application' | 'Database' | 'Collaboration' | 'Analytics' | 'Backup & DR'        // enterprise
  | 'AI platform'                                                                           // enterprise GPU jobs (charged back per GPU)
  | 'Reserved cluster' | 'On-demand GPUs' | 'CPU instances';                               // neocloud (GPU-as-a-service)
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
  id: string; title: string; type: 'Network' | 'Power' | 'Cooling' | 'Rack' | 'Capacity' | 'Security' | 'GPU'; sev: 1 | 2 | 3 | 4; pri: 1 | 2 | 3 | 4; status: IncidentStatus;
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
  /* raised from DCIM (15-Oct-2026): the change carries DCIM work items (mock/server.ts dcimRun) */
  origin?: 'DCIM';
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
export type RevDomain = 'Power' | 'Cooling' | 'Network' | 'GPU' | 'Device' | 'Capacity';
export const REV_DOMAINS: RevDomain[] = ['Power', 'Cooling', 'Network', 'GPU', 'Device', 'Capacity'];
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

/* ---- AI & GPU infrastructure (05-Oct-2026)
   GPU nodes are NetworkElements with role 'GPU'; this layer adds what an AI operations team watches:
   per-GPU telemetry (DCGM-style), clusters (pods) on a rail-optimised InfiniBand fabric, the jobs running
   on them, liquid cooling, and — for colocation — tenant AI cages the operator sees only as power and cooling. */
/* accelerator models in the fleet — datasheet figures per model in lib/gpuSpec.ts */
export type GpuModel = 'B200 SXM 192 GB' | 'H200 SXM 141 GB' | 'H100 SXM 80 GB' | 'A100 SXM 80 GB' | 'L40S PCIe 48 GB' | 'T4 PCIe 16 GB' | 'Gaudi 3 OAM 128 GB' | 'Max 1550 OAM 128 GB';
export type GpuVendor = 'NVIDIA' | 'Intel';
export type GpuHealth = 'healthy' | 'degraded' | 'failed';
export type GpuThrottle = 'none' | 'thermal' | 'power-cap' | 'hw-slowdown';
export interface GpuXid { code: number; at: number; text: string }
/* One GPU as the NVIDIA DCGM exporter reports it (field names in comments), plus the health we derive from it. */
export interface Gpu {
  idx: number; serial: string;
  util: number;                                   // DCGM_FI_DEV_GPU_UTIL (%)
  smActive: number; smOccupancy: number;          // DCGM_FI_PROF_SM_ACTIVE / SM_OCCUPANCY (%)
  tensorActive: number;                           // DCGM_FI_PROF_PIPE_TENSOR_ACTIVE (%)
  memCopyUtil: number; dramActive: number;        // DCGM_FI_DEV_MEM_COPY_UTIL / DCGM_FI_PROF_DRAM_ACTIVE (%)
  memUsedGb: number; memGb: number;               // DCGM_FI_DEV_FB_USED / FB_TOTAL (GB)
  tempC: number; hbmC: number;                    // DCGM_FI_DEV_GPU_TEMP / MEMORY_TEMP (°C)
  powerW: number; tdpW: number;                   // DCGM_FI_DEV_POWER_USAGE / POWER_MGMT_LIMIT (W)
  energyKwh24: number;                            // DCGM_FI_DEV_TOTAL_ENERGY_CONSUMPTION, last 24 h (kWh)
  clockMhz: number; memClockMhz: number;          // DCGM_FI_DEV_SM_CLOCK / MEM_CLOCK (MHz)
  pstate: 'P0' | 'P2' | 'P8';                     // DCGM_FI_DEV_PSTATE
  fanPct: number;                                 // DCGM_FI_DEV_FAN_SPEED (%; 0 on liquid-cooled nodes)
  throttle: GpuThrottle;                          // DCGM_FI_DEV_CLOCK_THROTTLE_REASONS
  sbe: number; dbe: number;                       // DCGM_FI_DEV_ECC_SBE_VOL_TOTAL / ECC_DBE_VOL_TOTAL
  retiredPages: number; remapPending: boolean;    // DCGM_FI_DEV_RETIRED_* / ROW_REMAP_PENDING
  pcieReplay: number; pcieRxGbs: number; pcieTxGbs: number;   // DCGM_FI_DEV_PCIE_REPLAY_COUNTER / DCGM_FI_PROF_PCIE_RX_BYTES / TX (GB/s)
  nvlinkErr: number; nvlinkRxGbs: number; nvlinkTxGbs: number; // DCGM_FI_DEV_NVLINK_*_ERROR_COUNT_TOTAL / DCGM_FI_PROF_NVLINK_RX_BYTES / TX (GB/s)
  xid: GpuXid | null;                             // DCGM_FI_DEV_XID_ERRORS
  health: GpuHealth;
}
/* in-job: allocated to a running job · idle: healthy spare · drained: cordoned for maintenance · failed: awaiting RMA · burn-in: new or repaired, under test */
export type GpuNodeState = 'in-job' | 'idle' | 'drained' | 'failed' | 'burn-in';
export interface GpuNode {
  neId: string; dcId: string; rackId: string; clusterId: string; model: GpuModel; vendor: GpuVendor; server: string; gpus: Gpu[]; state: GpuNodeState; jobId?: string;
  cooling: 'air' | 'liquid'; driver: string; firmware: string; powerKw: number; health: GpuHealth;
  ib: { rail: number; state: 'up' | 'down' | 'flapping'; errors: number }[]; note?: string; rma?: string;
  /* the last 24 hours, one sample per hour, across the node's 8 GPUs: mean utilisation, hottest GPU, node power */
  series: { util: number[]; tempC: number[]; powerKw: number[] };
}
export interface GpuCluster { id: string; name: string; dcId: string; room: string; scheduler: 'Kubernetes' | 'Slurm'; fabric: string; model: GpuModel; vendor: GpuVendor; cooling: 'air' | 'liquid'; nodes: string[] }
/* running · slowed (a straggler or throttling drags every step) · stalled (a node failed; waiting to restart from checkpoint) · at-risk (a node will need a reset) */
export type GpuJobState = 'running' | 'slowed' | 'stalled' | 'at-risk' | 'idle';
export interface GpuJob {
  id: string; name: string; kind: 'training' | 'fine-tuning' | 'inference'; clusterId: string; dcId: string; customerId: string; nodes: string[]; gpus: number;
  state: GpuJobState; started: number; lastCheckpoint: number; checkpointMin: number; stepMs: number; baselineMs: number; mfu: number;
  since?: number; cause?: string; causeNeId?: string; incidentId?: string; serviceId?: string;
}
/* liquid-cooling loop (coolant distribution unit) feeding a GPU row or tenant AI cages */
export interface Cdu { id: string; dcId: string; name: string; room: string; racks: string[]; capacityKw: number; loadKw: number; supplyC: number; returnC: number; flowLpm: number; flowNominal: number; pump: 'A' | 'B'; state: 'ok' | 'warn' | 'bad'; note?: string }
/* colocation: a tenant's high-density AI cabinet — tenant-owned GPUs, operator-owned power and cooling */
export interface AiCage { rackId: string; dcId: string; name: string; room: string; tenantId: string; contractedKw: number; drawKw: number; cduId: string; inletC: number; state: 'ok' | 'warn' | 'bad'; note?: string }

/* ---- physical last mile (12-Oct-2026, user): how power, cooling and cables reach each device.
   Derived per site by mock/physical.ts from the racks, devices, links, plant and alarms above — never typed in. */
export type PowerSide = 'A' | 'B';
export type PhysState = 'ok' | 'warn' | 'bad' | 'off';
/* one breaker bank of a rack PDU (a phase on a 3-phase unit): a group of outlets behind one breaker */
export interface PduBank { id: string; name: string; from: number; to: number; breakerA: number; loadA: number; state: 'ok' | 'warn' | 'tripped' }
/* rack PDU (AC) or −48 V fuse panel (BDFB, DC) on one side of a cabinet */
export interface RackPdu {
  id: string; dcId: string; rackId: string; name: string; side: PowerSide; kind: 'AC' | 'DC'; model: string; volts: number; phases: 1 | 3; ratingA: number;
  capacityKw: number; outlets: number; loadKw: number; banks: PduBank[];
  /* what feeds it: a UPS module (AC) or the rectifier plant (DC), and the utility feed behind that */
  upstreamId: string; upstreamName: string; feedId: string;
  state: 'ok' | 'warn' | 'tripped' | 'on-battery'; note?: string;
}
/* one power cord: a device power supply plugged into a PDU outlet */
export interface PowerCord { neId: string; psu: string; pduId: string; outlet: number; bankId: string; drawW: number; state: 'live' | 'psu-failed' | 'no-power' | 'on-battery' | 'standby' }
/* air cooling of one floor: the CRAH / CRAC units on a floor share its under-floor plenum, so redundancy is judged per floor;
   a room with a unit down or a sensor above 27°C is listed as a hot room */
export interface CoolingZone {
  id: string; dcId: string; floor: string; rooms: string[]; hotRooms: string[]; unitIds: string[]; cduIds: string[]; rackIds: string[];
  airHeatKw: number; liquidHeatKw: number; installedKw: number; runningKw: number; afterLossKw: number; state: 'n+1' | 'no-redundancy' | 'short';
}
export interface RackCooling { rackId: string; zoneId: string; primaryId: string | null; unitIds: string[]; cduId?: string; liquidPct: number }
export interface PatchPanel { id: string; dcId: string; rackId: string; name: string; kind: 'LC duplex' | 'MPO' | 'RJ45'; role: 'rack' | 'odf'; ports: number; used: number }
/* a permanent trunk cable from a cabinet's patch panel to the site ODF / main distribution rack */
export interface Trunk { id: string; dcId: string; aPanel: string; zPanel: string; aRackId: string; zRackId: string; kind: string; pairs: number; used: number; route: string; lengthM: number; state: PhysState }
export type CableHopKind = 'port' | 'optic' | 'cord' | 'panel' | 'trunk' | 'jumper' | 'osp';
export interface CableHop { kind: CableHopKind; id: string; label: string; sub?: string; where?: string; neId?: string; state: PhysState; note?: string }
/* the physical route of one LLDP link, end to end */
export interface CablePath {
  linkId: string; aNe: string; aIf: string; zNe: string; zIf: string; kind: 'in-rack' | 'structured' | 'inter-site';
  hops: CableHop[]; state: PhysState; suspect: number | null; verdict: string; lengthM: number;
}
export type SpofDomain = 'Power' | 'Cooling' | 'Cabling' | 'Backhaul';
/* a single point of failure: one thing whose loss takes devices, racks or links down */
export interface Spof {
  id: string; dcId: string; domain: SpofDomain; severity: Severity; title: string; detail: string; fix: string;
  assets: string[]; neIds: string[]; rackIds: string[]; services: number; customers: number; to: string;
}
export interface SitePhysical {
  dcId: string; pdus: RackPdu[]; cords: PowerCord[]; zones: CoolingZone[]; rackCooling: RackCooling[]; panels: PatchPanel[]; trunks: Trunk[];
  /* link id → index into the per-link panel ports (cable paths are built on demand) */
  spofs: Spof[];
  totals: { pdus: number; cords: number; dualFed: number; singleFed: number; panels: number; trunks: number; paths: number; inRack: number; structured: number; interSite: number };
}
/* "what loses power / cooling / connectivity if this one thing fails" */
export interface WhatIf {
  assetId: string; label: string; kind: 'feed' | 'ups' | 'rectifier' | 'pdu-side' | 'pdu' | 'cooling' | 'trunk';
  down: string[]; singleFed: string[]; overloaded: string[]; hotRacks: string[]; linksDown: string[]; services: number; customers: number; text: string;
}

/* ---- Phase 2 (12-Oct-2026, user): environment & safety, asset lifecycle, planned plant maintenance.
   Read models derived per site by mock/safety.ts, mock/lifecycle.ts and mock/maintenance.ts; they raise no alarms of their own. */
export interface FireZone {
  id: string; dcId: string; zone: string; detection: 'VESDA aspirating' | 'Point smoke + heat'; detector: 'Normal' | 'Pre-alert' | 'Fire' | 'Fault'; obscurationPct: number;
  suppression: 'Novec 1230 gas' | 'Inert gas (IG-541)' | 'Pre-action sprinkler'; agentPct: number; release: 'Armed (auto)' | 'Manual only' | 'Isolated';
  lastInspection: number; nextInspection: number; state: PhysState; note?: string;
}
export interface LeakZone { id: string; dcId: string; zone: string; covers: string; lengthM: number; state: 'Dry' | 'Leak' | 'Cable fault'; lastTest: number }
export interface AccessPoint {
  id: string; dcId: string; name: string; zone: string; kind: 'Building entry' | 'Data hall door' | 'Cage door' | 'Plant room door' | 'Meet-me room door';
  reader: 'Card + biometric' | 'Card + PIN' | 'Card'; state: 'Secured' | 'Held open' | 'Forced'; events24h: number; denied24h: number;
  last: { at: number; who: string; ok: boolean }; tenantId?: string; note?: string;
}
export interface SiteSafety {
  dcId: string; fire: FireZone[]; leak: LeakZone[]; access: AccessPoint[];
  totals: { fireZones: number; armed: number; inspectionsDue: number; leakZones: number; dry: number; doors: number; secured: number; denied24h: number };
}

/* Physical access & security audit (14-Oct-2026, user): who came in and out of the building in the last 24 h, through which
   door, on whose authority, and what the security team flagged. Derived from the site's access points (SiteSafety.access);
   every door's events24h / denied24h / last is counted from this log. */
export type AccessPersonType = 'Staff' | 'Security' | 'Contractor' | 'Visitor' | 'Tenant' | 'Delivery';
export interface AccessVisit {
  id: string; dcId: string; person: string; company: string; type: AccessPersonType; badge: string; badgeKind: 'Permanent' | 'Contractor' | 'Visitor';
  purpose: string; ref?: string; host?: string; escort?: string; entered: number; exited?: number; zones: string[]; onSite: boolean; where: string;
}
export interface AccessEvent {
  id: string; dcId: string; at: number; doorId: string; door: string; zone: string; dir: 'In' | 'Out'; visitId?: string; person: string; company: string;
  type: AccessPersonType; badge: string; method: AccessPoint['reader']; result: 'Granted' | 'Denied'; reason?: string; ref?: string;
}
export type SecExceptionKind = 'Tailgating' | 'Door forced' | 'Door held open' | 'Anti-passback' | 'Repeated denials' | 'After-hours entry' | 'Unescorted visitor' | 'Overstay' | 'Badge not returned';
export interface SecException {
  id: string; dcId: string; at: number; kind: SecExceptionKind; severity: 'High' | 'Medium' | 'Low'; status: 'Open' | 'Under review' | 'Closed';
  doorId?: string; door?: string; person?: string; company?: string; detail: string; evidence?: string; ref?: string; outcome?: string; owner: string;
}
export interface AccessReview {
  badges: number; byType: { type: AccessPersonType; n: number }[]; unused90: number; expiredActive: number; lastReview: number; nextReview: number; reviewer: string;
  cctvDays: number; logDays: number; findings: { text: string; tone: 'ok' | 'warn' | 'bad' }[];
}
export interface SiteAccess {
  dcId: string; live: boolean; from: number; to: number; visits: AccessVisit[]; events: AccessEvent[]; exceptions: SecException[]; doors: AccessPoint[]; review: AccessReview;
  hourly: { at: number; in: number; out: number; denied: number }[];
  totals: { onSite: number; onSiteByType: Partial<Record<AccessPersonType, number>>; entries24h: number; exits24h: number; denied24h: number; deniedDoors: number; events24h: number;
    open: number; high: number; visitors24h: number; unescorted: number; doors: number; secured: number; heldOpen: number };
}

export type LifeState = 'Covered' | 'Expiring' | 'Out of warranty' | 'End of support' | 'Tenant-owned' | 'Planned';
export interface AssetLife {
  neId: string; dcId: string; vendor: string; model: string; installed: number; warrantyEnd: number; endOfSale: number; endOfSupport: number;
  contract: { id: string; level: '24×7×4' | 'NBD' | '8×5 NBD' | 'None'; expires: number } | null; state: LifeState; note: string;
}
export interface RmaCase {
  id: string; neId: string; dcId: string; part: string; slot: string; vendor: string; opened: number; ref: string;
  status: 'Opened' | 'Part shipped' | 'Engineer booked' | 'Replaced · verifying'; eta: number; spareOnSite: boolean;
}
export interface SparePart { id: string; dcId: string; part: string; fits: string; onHand: number; min: number; reserved: number; state: 'ok' | 'low' | 'out' }
/* rack type, purchase date and condition (mock/vintage.ts): old = the shallow 600 × 1000 type of the first build-out */
export interface RackLife { rackId: string; manufacturer: string; model: string; heightU: number; depthMm: number; mountingDepthMm: number; installed: number; old: boolean; condition: 'Good' | 'Damaged'; note?: string }
export interface SiteLifecycle {
  dcId: string; assets: AssetLife[]; rmas: RmaCase[]; spares: SparePart[]; racks: RackLife[];
  totals: { devices: number; covered: number; expiring: number; outOfWarranty: number; endOfSupport: number; tenant: number; openRma: number; sparesLow: number; oldRacks: number; damagedRacks: number };
}

export type PmState = 'done' | 'upcoming' | 'due' | 'overdue' | 'scheduled' | 'in-progress';
export interface PmTask {
  id: string; dcId: string; assetId: string; asset: string; kind: 'UPS' | 'Battery' | 'Generator' | 'Cooling' | 'CDU' | 'Fire' | 'Electrical';
  task: string; intervalDays: number; lastDone: number; nextDue: number; state: PmState; owner: string; changeId?: string; impact?: string;
}

/* ---- Phase 3 (12-Oct-2026, user): operations process — on-call and escalation, ITSM sync, customer notifications, problem
   records, resilience tests and colocation orders. Read models in mock/ops.ts. */
export type OnCallRole = 'NOC shift lead' | 'Network engineer' | 'Facility engineer' | 'Field technician' | 'Duty manager' | 'AI infrastructure engineer';
export interface OnCall { role: OnCallRole; name: string; tier: 1 | 2 | 3; shift: string; escalateAfterMin: number; covers: string }
export interface IncidentOps {
  incidentId: string;
  itsm: { system: 'ServiceNow'; ref: string; state: string; group: string; synced: number };
  paged: { who: string; role: OnCallRole; at: number; ack?: number; via: 'Phone' | 'SMS' | 'App' }[];
  nextEscalation: { who: string; role: OnCallRole; at: number } | null;
  notices: { at: number; kind: 'Initial notice' | 'Update' | 'Resolution'; channel: 'Email + portal' | 'Portal'; recipients: number; premium: number; state: 'sent' | 'overdue' | 'scheduled'; text: string }[];
  nextUpdate: number | null; updateEveryMin: number; problemId?: string;
}
export interface Problem {
  id: string; title: string; type: Incident['type']; state: 'Investigating' | 'Known error' | 'Fix in change'; incidents: string[]; open: number; sites: string[];
  firstSeen: number; lastSeen: number; workaround: string; fix: string; changeId?: string; owner: string;
}
export interface ResilienceTest {
  id: string; dcId: string; test: 'Generator start + transfer' | 'UPS battery autonomy' | 'ATS transfer' | 'Backhaul failover' | 'Cooling unit failover' | 'Site isolation (DR runbook)';
  last: number | null; result: 'Pass' | 'Partial' | 'Fail' | 'Not run'; next: number; state: 'ok' | 'due' | 'overdue' | 'failed'; note: string;
}
export interface CrossConnectOrder { id: string; dcId: string; customerId: string; from: string; to: string; media: 'SMF LC' | 'MMF LC' | 'Cat6A'; state: 'Requested' | 'Approved' | 'Patched' | 'Tested' | 'Handed over'; ordered: number; due: number; serviceId?: string }
export interface RemoteHandsTicket { id: string; dcId: string; customerId: string; task: string; state: 'Open' | 'In progress' | 'Done'; opened: number; minutes: number; engineer: string }

/* ---- DCIM (13-Oct-2026, user: merge the P2B "Plan to Build" screens, phase 1). The inventory record of the estate: sites →
   floors → halls → rows → racks → devices → ports → cables, the device / module type catalogue and the power distribution
   (panel = a hall's A / B busway → feed = a rack PDU). Derived per data version from the same entities the operations screens
   use (mock/dcim.ts), so every count matches the twin, Facilities and the device pages. */
export type DcimStatus = 'Active' | 'Planned' | 'Reserved' | 'Maintenance' | 'Decommissioning' | 'Tenant-owned';
export type HallKind = 'Data hall' | 'GPU hall' | 'Storage hall' | 'Network room' | 'Meet-me room';
export interface DcimSite {
  id: string; name: string; city: string; state: string; regionId: string; tier: Datacenter['tier']; status: RolloutStatus; type: string; operator: string;
  floors: number; halls: number; rows: number; racks: number; devices: number; plannedDevices: number; cables: number; powerFeeds: number;
  designKw: number; itKw: number; rackBudgetKw: number; usedU: number; totalU: number; coolingKw: number; commissionedOn?: number; lat: number; lng: number;
}
export interface DcimHall {
  id: string; dcId: string; floor: string; floorIdx: number; name: string; kind: HallKind; cooling: 'Air' | 'Liquid' | 'Hybrid';
  gridCols: number; gridRows: number; rows: number; racks: number; devices: number; usedU: number; totalU: number; drawKw: number; budgetKw: number;
  busA: string; busB: string; coolingUnits: string[]; hotAisleContained: boolean;
}
export interface DcimRow { id: string; dcId: string; hallId: string; name: string; racks: string[]; containment: 'Cold aisle' | 'None'; facesRow?: string }
export interface DcimRack {
  id: string; name: string; dcId: string; hallId: string; hallName: string; rowId: string; rowName: string; floor: string; gridX: number; gridY: number;
  role: string; heightU: number; usedU: number; freeU: number; devices: number; plannedDevices: number; drawKw: number; budgetKw: number; powerPct: number;
  density: 'Standard' | 'High' | 'AI'; liquid: boolean; owner: 'operator' | 'tenant'; tenantId?: string; tenantName?: string; status: DcimStatus; tempC: number;
  pdus: number; power: 'A + B' | 'A + B · one side down' | 'B only' | 'A only'; weightKg: number; maxWeightKg: number; ports: number; portsUsed: number; contractedKw?: number;
  /* cabinet type, purchase date and audit condition (asset lifecycle, mock/vintage.ts) */
  model?: string; installed?: number; old?: boolean; condition?: 'Good' | 'Damaged'; conditionNote?: string;
}
export interface DcimDeviceType {
  id: string; manufacturer: string; model: string; role: NeRole; category: NeCategory; uHeight: number; fullDepth: boolean; airflow: 'Front to rear' | 'Rear to front' | 'Side to side';
  weightKg: number; typicalW: number; psus: number; platform: string; ports: { type: string; speedMbps: number; count: number }[]; mgmtPorts: number; consolePorts: number;
  moduleBays: number; devices: number; sites: number; description: string; custom?: boolean;
}
export interface DcimModuleType { id: string; name: string; kind: 'Power supply' | 'Fan' | 'Line card' | 'Routing engine' | 'Accelerator' | 'Storage' | 'Other'; fits: string[]; installed: number; faulty: number; ports?: { type: string; speedMbps: number; count: number }; custom?: boolean }
export interface DcimDevice {
  id: string; name: string; dcId: string; rackId: string; rackName: string; hallId: string; hallName: string; u: number; uHeight: number; typeId: string;
  manufacturer: string; model: string; role: NeRole; category: NeCategory; status: DcimStatus; serial: string; assetTag: string; ip: string; platform: string;
  ports: number; portsUp: number; cables: number; psus: number; powerW: number; tenantId?: string; health: Health;
  /* what an operator server runs (NetworkElement.purpose) */
  purpose?: string;
}
export type DcimComponentKind = 'Interface' | 'Power port' | 'Console' | 'Management' | 'Module bay';
export interface DcimComponent {
  id: string; deviceId: string; kind: DcimComponentKind; name: string; type: string; speedMbps?: number; state: 'Connected' | 'Free' | 'Down' | 'Disabled' | 'Failed' | 'Empty';
  cableId?: string; peer?: { deviceId: string; deviceName: string; port: string }; detail?: string;
}
export interface DcimCable {
  id: string; dcId: string; kind: 'Data' | 'Power'; type: string; aDevice: string; aName: string; aPort: string; aRack: string; zDevice: string; zName: string; zPort: string; zRack: string;
  route: 'In-rack' | 'Structured' | 'Inter-site' | 'Power cord'; via: string; lengthM: number; status: 'Connected' | 'Link down' | 'No power' | 'PSU failed' | 'Planned'; linkId?: string;
}
export interface DcimPowerPanel {
  id: string; dcId: string; hallId: string; hallName: string; name: string; side: PowerSide | 'DC'; source: string; sourceState: 'Online' | 'On battery' | 'Bypass' | 'Fault' | 'Rectifier';
  utility: string; feeds: number; loadKw: number; capacityKw: number; state: 'ok' | 'warn' | 'bad'; manual?: boolean;
}
export interface DcimPowerFeed {
  id: string; dcId: string; panelId: string; rackId: string; rackName: string; hallName: string; name: string; side: PowerSide; kind: 'AC' | 'DC'; volts: number; phases: 1 | 3; amps: number;
  capacityKw: number; loadKw: number; pct: number; outlets: number; cords: number; state: RackPdu['state']; note?: string; manual?: boolean;
}
export interface DcimRackView {
  rack: DcimRack; devices: DcimDevice[]; reserved: { u: number; uHeight: number; label: string; id?: string; by?: string; until?: number }[];
  activity: { id: string; at: number; actor: string; object: string; field: string; prev: string; next: string }[]; panels: PatchPanel[]; feeds: DcimPowerFeed[];
  cords: (PowerCord & { deviceName: string; pduName: string })[]; cables: DcimCable[]; hall: DcimHall; neighbours: { id: string; name: string }[];
}
export interface DcimCatalog { manufacturers: { name: string; types: number; devices: number }[]; roles: { role: NeRole; category: NeCategory; types: number; devices: number }[]; platforms: { name: string; devices: number }[] }

/* ---- IP & Network (13-Oct-2026, P2B merge phase 2): the address plan, derived from the estate (mock/ipam.ts). Management
   addresses are the devices' own; loopbacks and point-to-point /31s follow the routing adjacencies; host production / storage
   addresses follow the halls; per-service VLANs and customer VRFs follow the services. Usage = addresses actually bound. */
export type PrefixRole = 'Management' | 'Loopback' | 'Point-to-point' | 'Production' | 'Storage' | 'Backbone' | 'Public' | 'Customer';
export type PrefixStatus = 'Container' | 'Active' | 'Reserved';
export interface IpPrefix {
  id: string; prefix: string; dcId?: string; hallId?: string; vrf: string; role: PrefixRole; status: PrefixStatus; parentId?: string; vlan?: number; gateway?: string;
  description: string; size: number; used: number; pct: number; children: number; aggregate: string;
  /* forecast (14-Oct-2026): growth = addresses of devices installed in the last 12 months ÷ 12; Consumed ≥ 90%, Committed ≥ 75% or full within 12 months */
  state?: 'Available' | 'Committed' | 'Consumed'; growth?: number; exhaustAt?: number | null; pool?: boolean; manual?: boolean;
}
export type IpAddrStatus = 'Active' | 'Reserved' | 'Gateway' | 'Conflict' | 'Outside plan';
export interface IpAddr {
  id: string; address: string; mask: number; prefixId: string | null; vrf: string; dcId?: string; status: IpAddrStatus;
  use: 'Management' | 'Loopback' | 'Link' | 'Host' | 'Gateway (VIP)' | 'PE–CE' | 'Reserved';
  deviceId?: string; deviceName?: string; iface?: string; dns: string; note?: string;
  primary?: boolean; mac?: string;
}
export interface IpVrf { id: string; name: string; rd: string; scope: 'Site' | 'Estate' | 'Customer'; dcId?: string; customerId?: string; importRt: string[]; exportRt: string[]; prefixes: number; addresses: number; enforceUnique: boolean; description: string }
export interface IpVlan { id: string; vid: number; name: string; dcId: string; group: 'Management' | 'Fabric' | 'Storage' | 'Services'; role: string; prefix?: string; devices: number; status: 'Active' | 'Reserved' | 'Unused'; serviceId?: string; customerId?: string }
export interface IpAsn { id: string; asn: number; kind: 'Public' | 'Private 16-bit' | 'Private 32-bit'; dcId?: string; description: string; devices: number; sessions: number; up: number }
export interface IpAsnRange { id: string; name: string; start: number; end: number; used: number }
export interface IpRange { id: string; dcId: string; prefixId: string; start: string; end: string; size: number; purpose: string; used: number }
export interface IpFhrp { id: string; dcId: string; protocol: 'VRRP' | 'HSRP'; group: number; vip: string; prefixId: string; members: string[]; state: 'ok' | 'degraded' }
export interface IpService { id: string; name: string; protocol: 'TCP' | 'UDP'; ports: number[]; deviceId: string; deviceName: string; dcId: string; address: string }
export interface IpAggregate { id: string; prefix: string; rir: string; description: string; size: number; allocated: number; pct: number }
export interface IpFinding { id: string; severity: Severity; kind: 'Prefix full' | 'Outside plan' | 'Conflict' | 'Unused VLAN' | 'Gateway degraded'; title: string; detail: string; dcId?: string; ref?: string }
export interface IpamView {
  prefixes: IpPrefix[]; addresses: IpAddr[]; vrfs: IpVrf[]; vlans: IpVlan[]; asns: IpAsn[]; asnRanges: IpAsnRange[]; ranges: IpRange[];
  fhrp: IpFhrp[]; services: IpService[]; aggregates: IpAggregate[]; findings: IpFinding[]; registers: IpRegisters;
}
/* reference registers (14-Oct-2026, from P2B's RIR / role / route target / VLAN group / service template pages, derived here) */
export interface IpRegisters {
  rirs: { id: string; name: string; private: boolean; description: string; aggregates: number; asns: number }[];
  roles: { role: PrefixRole; weight: number; description: string; prefixes: number; addresses: number; vlans: number }[];
  routeTargets: { rt: string; importedBy: string[]; exportedBy: string[] }[];
  vlanGroups: { id: string; dcId: string; group: IpVlan['group']; min: number; max: number; used: number }[];
  serviceTemplates: { id: string; name: string; protocol: 'TCP' | 'UDP'; ports: number[]; instances: number; devices: number }[];
}
export interface IpAddrDetail { addr: IpAddr; prefix?: IpPrefix; vlan?: IpVlan; fhrp?: IpFhrp; fhrpRole?: 'Virtual IP' | 'Member'; services: IpService[]; sameDevice: IpAddr[] }
export interface IpIntegration {
  id: string; name: string; system: 'DDI' | 'DNS' | 'DHCP' | 'ITSM'; direction: 'Import' | 'Export' | 'Both'; status: 'Connected' | 'Not connected' | 'Error';
  objects: string; records: number; differences: number; lastSync: number | null; message?: string; history: { at: number; action: string; result: string }[];
}
export interface NewPrefixInput { prefix: string; vrf: string; parentId?: string; role: PrefixRole; dcId?: string; vlan?: number; pool: boolean; description: string }

/* ---- Capacity additions (13-Oct-2026, P2B merge phase 3): what is held against capacity (mock/capacity.ts) */
export type HoldState = 'Requested' | 'Reserved' | 'Committed' | 'Pipeline';
export interface CapacityHold {
  id: string; dcId: string; kind: 'Planned device' | 'Tenant contract' | 'Capacity plan' | 'Planner hold' | 'GPU allocation'; resource: 'Power' | 'Space' | 'GPU' | 'Cooling' | 'Ports' | 'Bandwidth';
  qty: number; unit: string; state: HoldState; label: string; ref?: string; to?: string;
}
export interface GpuCapacity { gpus: number; inJob: number; allocatedIdle: number; free: number; out: number; byModel: { model: string; gpus: number; inJob: number; free: number }[] }
export interface SiteEnergy { id: string; city: string; itKw: number; facilityKw: number; pue: number; coolingKw: number; mwhDay: number; tco2Day: number; liquidRacks: number }

/* ---- Power economics (21-Oct-2026, from the neocloud pitch deck: committed MW, take-or-pay, idle megawatts, cost per sold MW,
   power cost per GPU-hour). Derived per site from the live power split, a tariff table per state and a seeded power contract
   (mock/power-econ.ts). Money is in the geography's currency; tariffs are published industrial averages, marked illustrative. */
export type PowerContractKind = 'utility' | 'colocation';
export interface SitePowerEcon {
  id: string; city: string; state: string; status: RolloutStatus;
  kind: PowerContractKind; supplier: string;
  tariff: number;                 // energy price per kWh (local currency)
  demandRate: number;             // utility: demand charge per kW-month; colocation: all-in rate per committed kW-month
  committedKw: number;            // contracted capacity (utility connection or colocation power block)
  floorPct: number;               // take-or-pay: minimum billed share of the committed kW (colocation = 100)
  floorKw: number;
  escalatorPct: number;           // yearly price escalator in the contract
  termEnd: number;                // contract end
  peakKw: number;                 // highest facility draw today
  nowKw: number;                  // facility draw now
  itKw: number; pue: number;
  headroomKw: number;             // committed − peak
  idleKw: number;                 // kW paid for but not drawn: utility = floor − peak when the floor binds, colocation = committed − peak
  mwhDay: number; energyCostMonth: number; capacityCostMonth: number; idleCostMonth: number; billMonth: number;
  soldKw: number;                 // IT power that is billed to customers now (GPU nodes in a running job, tenant contracted power)
  costPerSoldMwMonth: number | null; costPerItMwMonth: number;
  gpuKw: number;                  // node power of the GPU fleet at the site
}
export interface GpuPodPowerEcon {
  clusterId: string; name: string; dcId: string; model: string; vendor: string; cooling: 'air' | 'liquid';
  gpus: number; inJob: number; nodeKw: number; kwPerGpu: number; pue: number; tariff: number;
  costPerGpuHour: number;         // per installed GPU-hour: kW per GPU × PUE × tariff
  costPerSoldGpuHour: number | null; // the whole pod's power over the GPUs that are earning now
  price: number;                  // price per GPU-hour for the pod's model
  powerSharePct: number | null;   // costPerSoldGpuHour ÷ price
  leftPerGpuHour: number | null;  // price − power cost per sold GPU-hour
  earningDay: number; powerCostDay: number; idlePowerCostDay: number;
}
export interface GpuPowerEcon {
  gpus: number; inJobGpus: number; nodeKw: number; facilityKw: number; powerCostDay: number; idlePowerCostDay: number;
  costPerGpuHour: number; costPerSoldGpuHour: number | null; avgPrice: number; powerSharePct: number | null; earningDay: number;
  deck: { kwPerGpu: number; pue: number; tariff: number; costPerGpuHour: number };  // the deck's slide-16 assumption at this geography's blended tariff
  pods: GpuPodPowerEcon[];
  jobs: GpuJobPowerEcon[]; tenants: GpuTenantPowerEcon[]; placement: PlacementHint[];
  sites: { dcId: string; gpus: number; inJob: number; nodeKw: number; pue: number; tariff: number; costPerGpuHour: number; costPerSoldGpuHour: number | null; powerCostDay: number; earningDay: number }[];
}
/* energy and power cost per job and per tenant (deck item 3) */
export interface GpuJobPowerEcon {
  id: string; name: string; kind: GpuJob['kind']; state: GpuJobState; owner: string; customerId: string; premium: boolean; dcId: string; cluster: string; model: string;
  gpus: number; nodeKw: number; facilityKw: number; kwhDay: number; powerCostDay: number; earningDay: number; costPerGpuHour: number; price: number; powerSharePct: number | null;
  wasted: boolean;                // an idle allocation: billed, drawing power, doing no work
  cappedGpus: number; capSavesKw: number; slowdownCostH: number;   // a power cap: the kW it saves against the GPU time it costs per hour
  incidentId?: string;
}
export interface GpuTenantPowerEcon { customerId: string; name: string; premium: boolean; jobs: number; gpus: number; nodeKw: number; kwhDay: number; powerCostDay: number; earningDay: number; powerSharePct: number | null; idleCostDay: number }
/* a power finding against the contract (deck item 4); the generator raises an alarm for each and an incident for the worst */
export type PowerAnomalyKind = 'block-near-limit' | 'demand-ratchet' | 'unexplained-rise' | 'idle-block';
export interface PowerAnomaly {
  id: string; dcId: string; kind: PowerAnomalyKind; severity: 'major' | 'minor' | 'warning'; title: string; detail: string;
  exposure: number; exposureLabel: string; evidence: { label: string; value: string }[]; alertId?: string; incidentId?: string; to: string;
}
/* where the next job should land (deck item 5): free GPUs with rack, cooling and contracted power headroom, at the lowest marginal power cost */
export interface PlacementHint {
  clusterId: string; name: string; dcId: string; model: string; vendor: string; cooling: 'air' | 'liquid'; scheduler: string;
  freeGpus: number; freeNodes: number; rackHeadroomKw: number; rackLoadPct: number; coolingHeadroomPct: number; coolingState: 'ok' | 'warn' | 'bad';
  siteHeadroomKw: number; paidIdleKw: number; tariff: number; pue: number; marginalCostPerGpuHour: number; fit: 'good' | 'tight' | 'no'; why: string[];
}
export interface PowerEconomics {
  anomalies: PowerAnomaly[];
  sites: SitePowerEcon[];
  totals: { billMonth: number; energyCostMonth: number; capacityCostMonth: number; idleCostMonth: number; committedKw: number; peakKw: number; idleKw: number; soldKw: number; mwhDay: number; blendedTariff: number; costPerSoldMwMonth: number | null; costPerItMwMonth: number; colocationSites: number };
  sources: { tariff: string; demand: string; colocation: string };
  gpu: GpuPowerEcon | null;
}

/* ---- Planner (13-Oct-2026, P2B merge phase 4): design plans sized and checked against the estate (mock/planner.ts) */
export type PlanScope = 'rack-expansion' | 'ai-pod' | 'new-hall' | 'new-site' | 'plant-upgrade' | 'refresh';
export type PlanStatus = 'Draft' | 'In review' | 'Approved' | 'Executing' | 'Delivered' | 'Rejected';
export type PlanRedundancy = 'N' | 'N+1' | '2N';
export type PlanCooling = 'Air' | 'Rear-door' | 'Liquid-to-chip';
export interface PlanInput {
  scope: PlanScope; name: string; dcId: string; hallId?: string; city?: string;
  racks: number; kwPerRack: number; redundancy: PlanRedundancy; tier: Datacenter['tier']; cooling: PlanCooling;
  plant?: 'UPS' | 'Cooling' | 'Generator'; plantKw?: number; refreshTypeId?: string; refreshToTypeId?: string; target: number; owner: string; notes?: string;
}
export interface PlanApproval { step: number; role: string; who: string; decision: 'Pending' | 'Approved' | 'Rejected' | 'Waiting'; at?: number; comment?: string }
export interface PlannerPlan extends PlanInput {
  id: string; status: PlanStatus; created: number; updated: number; approvals: PlanApproval[]; history: { at: number; who: string; text: string }[];
  capacityPlanIds: string[]; createdRacks: string[]; scenario: string; source: 'Capacity plan' | 'Site pressure' | 'Build programme' | 'Planner';
}
export interface PlanCheck { key: string; label: string; need: number; have: number; unit: string; ok: boolean; basis: string; fix?: string }
export interface PlanPlantLine { stage: string; units: number; unitSize: string; redundancy: string; capacity: string; note: string; cost: number }
export interface PlanFinding { severity: Severity; title: string; detail: string }
export interface PlanTask { name: string; weeks: number; start: number; end: number; longLead?: boolean; parallel?: boolean }
export interface PlanEval {
  itKw: number; facilityKw: number; pue: number; liquidKw: number; airKw: number;
  checks: PlanCheck[]; plant: PlanPlantLine[]; space: { racks: number; rows: number; whiteM2: number; grossM2: number; halls: number; freePositions?: number; hallName?: string };
  capex: { line: string; amount: number; basis: string }[]; capexTotal: number; opexYear: { line: string; amount: number; basis: string }[];
  cash: { year: number; capex: number; opex: number; revenue: number; net: number; cum: number }[]; npv: number; irr: number | null; payback: number | null; revenueBasis: string; discount: number;
  tasks: PlanTask[]; finish: number; lateDays: number; findings: PlanFinding[]; verdict: { state: 'ready' | 'warn' | 'blocked'; text: string };
}
export interface PlanScenarioRow { id: string; name: string; note: string; capex: number; pue: number; opex: number; npv: number; finish: number; blocked: number; chosen: boolean }
export interface PlanBenchmark { key: string; group: 'Power' | 'Cooling' | 'Space' | 'Cost' | 'Energy' | 'Schedule' | 'Revenue'; label: string; value: string; source: string }
export interface PlanTemplate { scope: PlanScope; name: string; group: 'Grow in place' | 'Build new' | 'Upgrade & refresh'; description: string; defaults: Partial<PlanInput>; checks: string[]; needsSite: boolean }

/* ---- Delivery (13-Oct-2026, P2B merge phase 5): approved plans become projects (mock/delivery.ts) */
export type DeliveryState = 'Mobilising' | 'In progress' | 'Commissioning' | 'Handover' | 'Delivered';
export interface DeliveryProject {
  id: string; planId: string; name: string; dcId: string; scope: PlanScope; state: DeliveryState; manager: string; start: number; finish: number; target: number;
  progress: number; plannedProgress: number; budget: number; earned: number; actual: number; cpi: number; spi: number; health: 'on track' | 'at risk' | 'late';
  workOrders: number; openWorkOrders: number; poOpen: number; permitsOpen: number; cxLevel: number; snags: number;
  /* 14-Oct-2026 (P2B gap fill): a template project (not from the planner), its programme and the projects it waits on; budget after approved change orders */
  template?: string; programmeId?: string; waitsOn?: string[]; budgetApproved: number; baselineFinish: number;
}
export type RiskCategory = 'Supply' | 'Permit' | 'Cost' | 'Schedule' | 'Quality' | 'Safety' | 'Resource';
export interface ProjectRisk { id: string; projectId: string; title: string; category: RiskCategory; likelihood: number; impact: number; mitigation: string; owner: string; state: 'Open' | 'Mitigating' | 'Closed'; derived: boolean; raised: number }
export interface ChangeOrder { id: string; projectId: string; title: string; reason: string; budgetDelta: number; scheduleDays: number; state: 'Submitted' | 'Approved' | 'Rejected'; approver: string; raisedBy: string; raisedAt: number; decidedBy?: string; decidedAt?: number; note?: string }
export interface CostPoint { t: number; pv: number; ev: number | null; ac: number | null }
export type ProgrammeType = 'Site expansion' | 'Greenfield build' | 'Network modernisation' | 'Refresh wave' | 'Resilience';
export interface Programme { id: string; name: string; type: ProgrammeType; description: string; sponsor: string; manager: string; status: 'Active' | 'On hold' | 'Closed'; created: number; projectIds: string[]; deps: Record<string, string[]>; blueprint?: string }
export interface ProgrammeView {
  programme: Programme; projects: DeliveryProject[]; rag: 'green' | 'amber' | 'red'; completion: number; budget: number; earned: number; actual: number; start: number; baselineFinish: number; forecastFinish: number;
  gates: { projectId: string; waitsOn: string[]; permits: 'granted' | 'pending' | 'none'; design: 'issued' | 'in progress'; ready: boolean }[];
  risks: ProjectRisk[]; materials: { projectId: string; open: number; late: number; inTransit: number; delivered: number; value: number }[]; openWorkOrders: number; changeOrders: ChangeOrder[]; history: { at: number; who: string; text: string }[]; costCurve: CostPoint[];
}
export interface DeliveryTemplate { key: string; name: string; description: string; scope: PlanScope; icon: string; weeks: number; unit?: string; defaultQty?: number; phases: string[]; budgetFrom: number }
export interface DeliveryMilestone { name: string; start: number; end: number; state: 'done' | 'active' | 'next'; longLead?: boolean }
export type WoState = 'Planned' | 'Awaiting change' | 'Ready' | 'In progress' | 'Done' | 'Failed';
export interface WorkOrder { id: string; projectId: string; dcId: string; title: string; kind: 'Install' | 'Cabling' | 'Electrical' | 'Mechanical' | 'Commissioning' | 'Migration' | 'Civil' | 'Decommission'; crew: string; crewKind: 'Own technicians' | 'Contractor'; start: number; end: number; state: WoState; changeId: string; changeState: 'Draft' | 'Pending approval' | 'Approved' | 'Implemented'; rackIds: string[]; kit: 'Ready' | 'Partial' | 'Not ordered' }
export interface PurchaseOrder { id: string; projectId: string; supplier: string; item: string; qty: number; unitCost: number; total: number; ordered: number; due: number; state: 'Draft' | 'Ordered' | 'In transit' | 'Delivered' | 'Late'; leadWeeks: number; /** sourced orders: the vendor's contract and the order lines */ contract?: string; lines?: { item: string; qty: number }[] }
export interface CxTest { level: 1 | 2 | 3 | 4 | 5; name: string; scope: string; due: number; state: 'Passed' | 'Failed' | 'Scheduled' | 'Not started'; witness: string; snags: number }
export interface Permit { id: string; projectId: string; name: string; authority: string; submitted?: number; due: number; state: 'Not needed' | 'To submit' | 'Submitted' | 'Granted' | 'Expired'; owner: string }
export interface DesignDoc { id: string; projectId: string; title: string; kind: 'Design basis' | 'Single-line diagram' | 'Cooling P&ID' | 'Floor layout' | 'Cable schedule' | 'Method statement' | 'As-built'; rev: string; state: 'Draft' | 'In review' | 'Issued for construction' | 'As-built'; updated: number; author: string }
export interface DeliveryProjectView {
  project: DeliveryProject; milestones: DeliveryMilestone[]; workOrders: WorkOrder[]; pos: PurchaseOrder[]; tests: CxTest[]; permits: Permit[]; docs: DesignDoc[];
  history: { at: number; who: string; text: string }[]; plan?: PlannerPlan; canHandover: boolean;
  risks: ProjectRisk[]; changeOrders: ChangeOrder[]; costCurve: CostPoint[];
}

/* ---- Change management (13-Oct-2026, P2B merge phase 6): one register over operations changes, maintenance and delivery change
   requests, with class, approval matrix, freezes, conflicts, policy checks and post-implementation review (mock/changemgmt.ts) */
export type ChangeClass = 'Standard' | 'Normal' | 'Emergency';
export interface ChangeApprovalStep { role: string; who: string; decision: 'Approved' | 'Pending' | 'Waiting' | 'Rejected' | 'Pre-approved'; at?: number }
export interface ChangeViolation { policy: string; enforcement: 'Block' | 'Warn'; text: string }
export interface ChangeRecord {
  id: string; source: 'Operations' | 'Maintenance' | 'Delivery' | 'DCIM'; cls: ChangeClass; kind: Change['kind']; title: string; dcId: string; scope: string[]; risk: Change['risk']; status: ChangeStatus;
  windowStart: number; windowEnd: number; requester: string; approver?: string; rollback: string; created: number; incidentId?: string; projectId?: string; woId?: string;
  template?: string; approvals: ChangeApprovalStep[]; conflicts: string[]; freeze?: string; violations: ChangeViolation[];
  pir: { state: 'Not needed' | 'Due' | 'Done' | 'Overdue'; due?: number }; outcome?: 'Successful' | 'Rolled back' | 'Rejected' | 'Caused an incident'; causedIncident?: string;
}
export interface ChangeFreeze { id: string; scope: 'Estate' | 'Site'; dcId?: string; title: string; reason: string; from: number; to: number | null; allows: 'Emergency only' | 'Standard and emergency'; source: 'Incident' | 'Calendar' }
export interface StandardTemplate { id: string; name: string; description: string; risk: 'Low'; checks: string; uses: number; lastUsed?: number; success: number }
export interface ChangePolicy { id: string; name: string; rule: string; enforcement: 'Block' | 'Warn'; violations: number }
export interface ChangeRegister { changes: ChangeRecord[]; freezes: ChangeFreeze[]; templates: StandardTemplate[]; policies: ChangePolicy[]; weeks: { start: number; standard: number; normal: number; emergency: number; failed: number }[] }

/* ---- Compliance and Customization (13-Oct-2026, P2B merge phase 7; mock/compliance.ts, mock/customization.ts) */
export interface CompliancePolicy { id: string; name: string; rule: string; area: 'Power' | 'Cooling' | 'Network' | 'Lifecycle' | 'Change' | 'Safety' | 'Maintenance'; enforcement: 'Block' | 'Warn'; evaluated: number; violations: number;
  /* policy as code (14-Oct-2026, P2B gap fill): Rego package + source, on / off, the controls it evidences, hand-made ones not evaluated yet */
  pkg: string; rego: string; active: boolean; controlIds: string[]; custom?: boolean; lastRun?: number; trigger: 'Nightly sweep' | 'On change' | 'Change gate' }
export interface ComplianceViolation { id: string; policyId: string; resource: string; resourceName: string; dcId: string; message: string; to: string; outcome: 'Blocked' | 'Warned'; changeId?: string; raised: number }
export interface ComplianceControl { id: string; framework: string; ref: string; title: string; type: 'Automated' | 'Manual'; policyIds: string[]; status: 'Compliant' | 'Partial' | 'Non-compliant' | 'Evidence due' | 'Not assessed'; evidence: string; owner: string; assessed: number; custom?: boolean }
export interface ComplianceFramework { id: string; name: string; description: string; controls: number; compliant: number; version?: string; custom?: boolean }
export interface PolicyDecision { id: string; policyId: string; policyName: string; resource: string; resourceName: string; resourceType: string; dcId: string; decision: 'allow' | 'deny' | 'warn'; at: number; by: ComplianceView['policies'][number]['trigger']; input: Record<string, unknown>; result: string }
export interface ComplianceView { frameworks: ComplianceFramework[]; controls: ComplianceControl[]; policies: CompliancePolicy[]; violations: ComplianceViolation[]; decisions: PolicyDecision[] }
export interface CustomField { key: string; label: string; type: 'Text' | 'Number' | 'Date' | 'Select' | 'Boolean'; appliesTo: string[]; required: boolean; choices?: string[]; filled: number; total: number; description: string; custom?: boolean }
export interface TagDef { slug: string; name: string; color: 'blue' | 'purple' | 'cyan' | 'amber' | 'red' | 'slate' | 'emerald'; description: string; rule: string; count: number; appliesTo: string; custom?: boolean }

/* ---- Work orders and processes (14-Oct-2026, P2B gap fill step B; mock/workflow.ts): P2B's 12 process definitions run over our records */
export interface WfStep { id: string; name: string; lane: string; kind: 'user' | 'auto' | 'decision'; hours: number; branch?: boolean; form?: WfField[] }
export interface WfField { key: string; label: string; type: 'text' | 'select' | 'check' | 'number'; options?: string[]; required?: boolean }
export interface WfProcess { pid: string; key: string; name: string; owner: string; description: string; lanes: string[]; steps: WfStep[]; running: number; completed: number; slaHours: number }
export interface WfEvent { stepId: string; step: string; lane: string; who: string; at: number; tookHours: number; data?: Record<string, string | boolean | number> }
export interface WfInstance {
  id: string; pid: string; key: string; process: string; businessKey: string; title: string; dcId: string; started: number; due: number; ended?: number;
  state: 'Running' | 'Completed' | 'Incident' | 'Cancelled'; stepIndex: number; stepId: string; step: string; lane: string; waitingSince: number; overdue: boolean;
  history: WfEvent[]; link?: string; incidentText?: string;
}
export interface WfTask { id: string; instanceId: string; pid: string; process: string; title: string; step: string; stepId: string; lane: string; candidates: string[]; assignee?: string; created: number; due: number; overdue: boolean; dcId: string; businessKey: string; form: WfField[]; link?: string }
export interface WfKpis {
  perProcess: { pid: string; name: string; completed: number; running: number; avgCycleHours: number; slaPct: number; slaHours: number }[];
  perTask: { pid: string; process: string; step: string; lane: string; n: number; avgWait: number; p90: number; onTimePct: number }[];
  bySite: { dcId: string; running: number; completed: number }[];
  heat: { pid: string; process: string; cells: { step: string; avgWait: number | null }[] }[];
}
export interface WorkOrderDetail {
  wo: WorkOrder; project: DeliveryProject; checklist: { id: string; text: string; done: boolean; by?: string; at?: number }[]; backout: string; technician?: string;
  access: { state: 'Not needed' | 'Not requested' | 'Requested' | 'Approved' | 'Checked in' | 'Checked out'; zones: string; instanceId?: string } ; signoff?: { doneBy: string; confirmedBy: string; witness: boolean; notes: string; at: number };
  failure?: { reason: string; at: number; by: string }; pos: PurchaseOrder[]; process?: WfInstance; change?: { id: string; status: string; cls: string; risk: string } ; history: { at: number; who: string; text: string }[];
}

/* ---- DCIM change control (15-Oct-2026, user: "every DCIM change should be tagged with a CR from Change management").
   Every DCIM edit names its change request: a standard (pre-approved) one for low-risk record work, an open CR at the site (approved = applied
   now, not yet approved = saved as planned work under it), or a new CR raised from DCIM (Pending approval; the work runs once approved). */
export type DcimCr = { standard: true } | { changeId: string } | { raise: { title?: string; windowStart: number; hours: number; rollback: string } };
export type DcimOp = 'createRack' | 'installDevice' | 'setDeviceStatus' | 'connect' | 'disconnect' | 'editInterface' | 'installModule' | 'removeModule' | 'swapModule'
  | 'editRack' | 'retireRack' | 'moveDevice' | 'reserveU' | 'releaseU' | 'createPanel' | 'createFeed';
export interface DcimWorkItem {
  id: string; changeId: string; op: DcimOp; label: string; dcId: string; rackId?: string; neId?: string; hallId?: string; keys: string[];
  state: 'Planned' | 'Done' | 'Failed' | 'Cancelled'; created: number; by: string; doneAt?: number; error?: string; result?: string; args: unknown[];
  /* the CR as it stands (filled by the read functions) */
  cr?: { title: string; status: ChangeStatus; cls: ChangeClass; source: ChangeRecord['source']; windowStart: number; blocked?: string };
}
export interface DcimCrOption { id: string; title: string; status: ChangeStatus; cls: ChangeClass; source: ChangeRecord['source']; windowStart: number; windowEnd: number; applies: 'now' | 'staged'; blocked?: string }
export interface DcimRunResult<T = unknown> { changeId: string; staged: boolean; itemId: string; result?: T }
/* the DCIM Change requests tab: every CR at the site(s) with what it touches in DCIM and its DCIM work */
export interface DcimCrRow {
  id: string; title: string; source: ChangeRecord['source']; cls: ChangeClass; risk: Change['risk']; status: ChangeStatus; dcId: string; windowStart: number; windowEnd: number;
  requester: string; next?: string; blocked?: string; projectId?: string; planId?: string; incidentId?: string;
  racks: { id: string; name: string }[]; devices: number; work: { total: number; done: number; planned: number; failed: number };
  view: 'ready' | 'approval' | 'progress' | 'done' | 'closed';
}
export interface DcimPlanRow { id: string; title: string; status: string; scope: string; dcId: string }
export interface DcimChangeBoard { rows: DcimCrRow[]; plans: DcimPlanRow[]; rackOpen: Record<string, string[]>; ghosts: { hallId: string; changeId: string; label: string; itemId: string }[] }
