/* The mock "backend": synchronous queries, derived roll-ups and mutations over
   one in-memory estate. Only src/api/index.ts talks to this module. */

import { sevLabel } from '../lib/vocab';
import type {
  ActionStep, Alert, AlertScope, EdgeStatus, OpsState, AuditEntry, CapacityPlan, Change, ChangeStatus, Datacenter, DcSummary, Incident, IncidentStatus, Interface, Link, Location,
  ImpactCause, NetworkElement, NeRole, Persona, PlanInput, PrefixRole, ReconTask, RevDomain, RevIssue, RevenueView, RolloutStatus, Service, Severity, TimelineEvent
} from '../api/types';
import { NE_CATEGORY } from '../api/types';
import { generate, finaliseHealth, type Db } from './generate';
import { edgeId, isPersona } from './personas';
import { PLANE_SHORT, planeOf, type Plane } from '../lib/fabric';
import { GEO_BY_ID, dcAt, isGeo, setActiveGeo, type Geo } from './geo';
import { defaultPersona, overrideGeo, overridePersona } from './override';
import { fmtNum, setMoneyLocale } from '../lib/format';
import { mulberry32 } from '../lib/rng';
import { impactOf, isOpen, RESOLVE_SLA, RESPONSE_SLA } from './incidents';
import { DAY, HOUR, MIN } from './seed';
import { buildRevenue, customerHits, revenueView, type RevModel } from './revenue';
import { gpuView, type GpuView } from './gpu-view';
import { siteSafety as siteSafety_, clearSafety } from './safety';
import { siteLifecycle as siteLifecycle_, clearLifecycle } from './lifecycle';
import { sitePm as sitePm_, clearMaintenance } from './maintenance';
import { clearOps, colocationOrders as colocationOrders_, incidentOps as incidentOps_, onCall as onCall_, problems as problems_, resilienceTests as resilienceTests_ } from './ops';
import { cablePath as cablePath_, clearPhysical, devicePhysical as devicePhysical_, sitePhysicalPublic, whatIf as whatIf_ } from './physical';
import { addCustomType, clearDcim, dcimCatalog as dcimCatalog_, dcimComponents as dcimComponents_, dcimModel, dcimRackView as dcimRackView_, freeSlots, resetDcimCustom } from './dcim';
import { carvePrefix, clearIpam, ipamModel, reserveNextIp, resetIpamOverlay } from './ipam';
import { capacityHolds, gpuCapacity, siteEnergy } from './capacity';
import { benchmarks as planBench, chooseScenario as planChoose, createPlan as planCreate, decidePlan as planDecide, evaluate as planEval, executionLines, freePositions, planOf, plans as planList, resetPlanner, scenarios as planScenarios, submitPlan as planSubmit, TEMPLATES as PLAN_TEMPLATES, updatePlan as planUpdate } from './planner';
import { advanceWorkOrder, deliveryProject as deliveryProject_, deliveryProjects, handover as handover_, receivePo, resetDelivery, runTest as runTest_ } from './delivery';
import { approveStep, changeRegister, clearChangeMgmt, resetChangeMgmt, stepsApproved } from './changemgmt';
import { clearCompliance, complianceView } from './compliance';
import { addField as addField_, addTag as addTag_, customization as customization_, resetCustomization } from './customization';
import { monthsTo, dateAfterMonths, WARN, CRIT } from '../lib/forecast';

/* Persona: which business model the estate is generated as. Switching it rebuilds
   the whole mock estate (same sites, different racks, customers and services) and
   notifies every subscriber, so each screen refetches. Remembered per browser. */
/* Geography (06-Oct-2026): India or the USA — places, customers, people, currency and locale.
   ?geo=in|us in a link wins and is remembered; the estate is regenerated on change. */
const requestedGeo = (): Geo => {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('geo') : null;
    if (isGeo(q)) { try { localStorage.setItem('dco.geo', q); } catch { /* storage blocked */ } return q; }
    const v = localStorage.getItem('dco.geo'); return isGeo(v) ? v : 'in';
  } catch { return 'in'; }
};
/* a deployment override (VITE_GEO_OVERRIDE, mock/override.ts) wins over the URL and the saved choice */
const loadGeo = (): Geo => { const r = requestedGeo(); const o = overrideGeo(r); return isGeo(o) ? o : r; };
let geo: Geo = loadGeo();
const applyGeo = () => { setActiveGeo(geo); const g = GEO_BY_ID[geo]; setMoneyLocale({ currency: g.currency.code, locale: g.currency.locale, dateStyle: g.dateStyle }); };
applyGeo();
export const getGeo = () => geo;
export const geoDef = () => GEO_BY_ID[geo];
export function setGeo(g: Geo) {
  if (g === geo) return;
  geo = g;
  try { localStorage.setItem('dco.geo', g); } catch { /* storage blocked */ }
  applyGeo();
  rebuild();
}
/* the hero site of the active geography (the first row): the default for Facilities, Topology and new changes */
export const heroDcId = () => dcAt(1);
/* the hero WAN-edge router (flapping backhaul story): MH-DC-001-PE-T4-01, or BDR-01 in a GPU cloud */
export const heroNeId = () => edgeId(persona, dcAt(1), 1);

/* a link may carry ?persona=… (demo playbook deep links): it wins and is remembered. With neither a link
   nor a saved choice the deployment default applies (VITE_PERSONA_DEFAULT, mock/override.ts; else network).
   A saved choice made under an earlier default is dropped once, so a new default reaches returning viewers. */
const requestedPersona = (): Persona => {
  const d = defaultPersona(); const fallback: Persona = isPersona(d) ? d : 'network';
  try {
    const prev = localStorage.getItem('dco.persona.default') ?? 'network';   // before the marker existed the default was network
    if (prev !== fallback) localStorage.removeItem('dco.persona');
    localStorage.setItem('dco.persona.default', fallback);
  } catch { /* storage blocked */ }
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('persona') : null;
    if (isPersona(q)) { try { localStorage.setItem('dco.persona', q); } catch { /* storage blocked */ } return q; }
    const v = localStorage.getItem('dco.persona'); return isPersona(v) ? v : fallback;
  } catch { return fallback; }
};
/* a deployment override (VITE_PERSONA_OVERRIDE, mock/override.ts) wins over the URL and the saved choice */
const loadPersona = (): Persona => { const r = requestedPersona(); const o = overridePersona(r, geo); return isPersona(o) ? o : r; };
let persona: Persona = loadPersona();
let db: Db = generate(persona);
let version = 0;
const listeners = new Set<() => void>();
export const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
const changed = () => { version++; clearPhysical(); clearDcim(); clearIpam(); clearChangeMgmt(); clearCompliance(); clearSafety(); clearLifecycle(); clearMaintenance(); clearOps(); finaliseHealth(db); summaryCache.clear(); revModel = null; revViews.clear(); listeners.forEach(f => f()); };
export const getVersion = () => version;
const rebuild = () => { db = generate(persona); edgeCache.clear(); resetDcimCustom(); resetIpamOverlay(); resetPlanner(); resetDelivery(); resetChangeMgmt(); resetCustomization(); changed(); };
export const reset = () => rebuild();
export const getPersona = () => persona;
export function setPersona(p: Persona) {
  if (p === persona) return;
  persona = p;
  try { localStorage.setItem('dco.persona', p); } catch { /* storage blocked */ }
  rebuild();
}
export const now = () => db.now;
/* colocation tenant equipment: on record, powered and cooled, but never polled */
const isOpaque = (n: NetworkElement) => n.role === 'Tenant gear';

/* ------------------------------------------------------------ roll-ups */

const summaryCache = new Map<string, DcSummary>();
/* revenue-impact model: built once per data version, viewed per scope (estate or one datacenter) */
let revModel: RevModel | null = null;
const revViews = new Map<string, RevenueView>();
const revenueModel = () => (revModel ??= buildRevenue(db, causeIndex()));
export function revenue(q: { dcId?: string } = {}): RevenueView {
  const k = q.dcId ?? '*';
  let v = revViews.get(k);
  if (!v) { v = revenueView(db, revenueModel(), q.dcId, id => edgeStatus(id).state); revViews.set(k, v); }
  return v;
}
/* AI & GPU read model (estate or one datacenter) and one node's detail */
const gpuViews = new Map<string, GpuView>();
export function gpu(q: { dcId?: string } = {}): GpuView {
  const k = `${version}|${q.dcId ?? '*'}`;
  let v = gpuViews.get(k);
  if (!v) { if (gpuViews.size > 40) gpuViews.clear(); v = gpuView(db, persona, q.dcId); gpuViews.set(k, v); }
  return v;
}
export function gpuNode(neId: string) {
  const n = db.gpu?.nodes.get(neId); if (!n) return null;
  const row = gpu({ dcId: n.dcId }).nodes.find(x => x.neId === neId)!;
  const job = n.jobId ? gpu({ dcId: n.dcId }).jobs.find(j => j.id === n.jobId) : undefined;
  const alerts = db.alerts.filter(a => a.neId === neId && a.state !== 'cleared');
  const spare = job ? [...db.gpu!.nodes.values()].find(x => x.clusterId === n.clusterId && x.state === 'idle' && x.health === 'healthy')?.neId : undefined;
  return { node: row, job, alerts, spare, ne: db.neById.get(neId)! };
}
/* does this estate (or site) have GPU infrastructure the operator runs or hosts? */
export const hasGpu = (dcId?: string) => !!db.gpu && ([...db.gpu.nodes.values()].some(n => !dcId || n.dcId === dcId) || db.gpu.cages.some(c => !dcId || c.dcId === dcId));

/* the revenue issue behind an incident (null when the incident touches no revenue) */
export const revenueOfIncident = (id: string): RevIssue | null => revenue().issues.find(i => i.id === id) ?? null;
/* Datacenter operations scope. Downstream alarms (remote PoPs / sites that
   depend on a datacenter) never count as datacenter issues. */
const liveAlerts = () => db.alerts.filter(a => a.state !== 'cleared' && a.scope !== 'downstream');

export const opsStateOf = (n: NetworkElement): OpsState => isOpaque(n) ? 'tenant-owned' : n.discovery !== 'not-discovered' ? 'in-service' : n.ndReason === 'planned' ? 'planned' : 'unmonitored';

/* Edge links of a site: LLDP links with exactly one end inside it. */
const edgeCache = new Map<string, Link[]>();
function edgeLinks(dcId: string): Link[] {
  const hit = edgeCache.get(dcId); if (hit) return hit;
  const ls = db.links.filter(l => l.protocol === 'LLDP' && (db.neById.get(l.aNe)!.dcId === dcId) !== (db.neById.get(l.zNe)!.dcId === dcId));
  edgeCache.set(dcId, ls); return ls;
}
export function edgeStatus(dcId: string): EdgeStatus {
  const ls = edgeLinks(dcId);
  const down = ls.filter(l => l.state === 'down');
  const up = ls.length - down.length;
  return { total: ls.length, up, down: down.length, state: ls.length && up === 0 ? 'isolated' : down.length ? 'redundancy-lost' : 'redundant', downLinks: down.map(l => l.id) };
}
/* How an alert relates to a given datacenter, or null when it is out of scope.
   Edge links count for both ends; a far-end node counts as a dependency only
   for what it does to the link toward this site. */
export function scopeFor(a: Alert, dcId: string): AlertScope | null {
  if (a.dcId === dcId) return a.scope;
  if (a.scope === 'downstream') return null;
  const edges = edgeLinks(dcId);
  const touches = (l: Link) => (l.aNe === a.neId && l.aIf === a.ifName) || (l.zNe === a.neId && l.zIf === a.ifName);
  if (a.linkId && edges.some(l => l.id === a.linkId)) return 'edge';
  if (a.neId && a.ifName && edges.some(touches)) return 'edge';
  if (a.neId && (a.title === 'Device Unreachable') && edges.some(l => l.aNe === a.neId || l.zNe === a.neId)) return 'dependency';
  return null;
}
export function alertsInScope(dcId: string, includeDownstream = false) {
  return db.alerts.filter(a => a.state !== 'cleared').map(a => ({ a, sc: scopeFor(a, dcId) })).filter(x => x.sc && (includeDownstream || x.sc !== 'downstream')).map(x => ({ ...x.a, scope: x.sc! }));
}

export function summarize(dc: Datacenter): DcSummary {
  const hit = summaryCache.get(dc.id); if (hit) return hit;
  const nes = db.nes.filter(n => n.dcId === dc.id);
  const discovered = nes.filter(n => n.discovery !== 'not-discovered').length;
  const verified = nes.filter(n => n.discovery === 'verified').length;
  const drifted = nes.filter(n => n.discovery === 'drifted').length;
  const links = db.links.filter(l => db.neById.get(l.aNe)!.dcId === dc.id || db.neById.get(l.zNe)!.dcId === dc.id).length;
  const byRole = nes.reduce<Record<string, number>>((a, n) => { a[n.role] = (a[n.role] ?? 0) + 1; return a; }, {});
  const al = alertsInScope(dc.id);
  const downstreamExcluded = db.alerts.filter(a => a.state !== 'cleared' && a.dcId === dc.id && a.scope === 'downstream').length;
  const svcs = db.services.filter(s => s.dcId === dc.id);
  const live = nes.filter(n => n.discovery !== 'not-discovered' && !isOpaque(n));
  const powerKw = Math.round(dc.power.split.reduce((a, s) => a + s.kw, 0) * 10) / 10;
  const byCategory = nes.reduce((a, n) => { a[NE_CATEGORY[n.role]]++; return a; }, { network: 0, compute: 0, storage: 0, tenant: 0 });
  const rv = revenue().byDc.find(d => d.id === dc.id);
  const s: DcSummary = {
    id: dc.id, name: dc.name, status: dc.status, category: dc.category, city: dc.city, state: dc.state, regionId: dc.regionId, circleId: dc.circleId, address: dc.address, tier: dc.tier,
    ne: nes.length, discovered, verified, drifted, notDiscovered: nes.length - discovered, coveragePct: nes.length ? Math.round((discovered / nes.length) * 100) : 0, links, byRole,
    powerKw, powerCapKw: dc.power.capacityKw, rackUsedU: dc.racks.reduce((a, r) => a + r.usedU, 0), rackTotalU: dc.racks.reduce((a, r) => a + r.heightU, 0),
    portsUsed: dc.ports.reduce((a, p) => a + p.used, 0), portsTotal: dc.ports.reduce((a, p) => a + p.total, 0), activeAlerts: al.length, critAlerts: al.filter(a => a.severity === 'critical').length,
    openIncidents: db.incidents.filter(i => i.dcId === dc.id && isOpen(i)).length, services: svcs.length, customers: new Set(svcs.map(s => s.customerId)).size,
    healthScore: live.length ? Math.round(live.reduce((a, n) => a + n.healthScore, 0) / live.length) : 0,
    capexCommitted: dc.capex.committed, capexApproved: dc.capex.approved, opexMonthly: dc.opex.monthly, pue: dc.power.pue,
    coolPct: dc.cooling.capacityKw ? Math.round((dc.cooling.loadKw / dc.cooling.capacityKw) * 100) : 0,
    worstSev: Math.min(9, ...db.incidents.filter(i => i.dcId === dc.id && isOpen(i)).map(i => i.sev)) % 9,
    servicesDegraded: svcs.filter(x => x.status === 'Degraded' || x.status === 'Down').length,
    linksDown: db.links.filter(l => l.protocol === 'LLDP' && l.state === 'down' && (db.neById.get(l.aNe)!.dcId === dc.id || db.neById.get(l.zNe)!.dcId === dc.id)).length,
    unreachable: live.filter(n => n.icmp.state === 'critical').length,
    installed: nes.filter(n => opsStateOf(n) !== 'planned').length, inService: nes.filter(n => opsStateOf(n) === 'in-service').length, unmonitored: nes.filter(n => opsStateOf(n) === 'unmonitored').length, planned: nes.filter(n => opsStateOf(n) === 'planned').length,
    tenantOwned: nes.filter(n => opsStateOf(n) === 'tenant-owned').length, byCategory,
    edge: edgeStatus(dc.id), byScope: { site: al.filter(a => a.scope === 'site').length, edge: al.filter(a => a.scope === 'edge').length, dependency: al.filter(a => a.scope === 'dependency').length }, downstreamExcluded,
    mrr: rv?.mrr ?? 0, revAtRisk: (rv?.mrrDown ?? 0) + (rv?.mrrDegraded ?? 0), revExposed: rv?.mrrExposed ?? 0, revRate: rv?.rate ?? 0, revImpact: (rv?.lost ?? 0) + (rv?.credits ?? 0),
    facilityIssues: [...dc.power.ups.filter(u => u.state !== 'Online').map(u => `${u.name} ${u.state.toLowerCase()}`), ...dc.cooling.units.filter(u => u.status === 'Failed').map(u => `${u.name} failed`), ...dc.power.feeds.filter(f => f.status === 'Alarm').map(f => `${f.source} lost`)]
  };
  summaryCache.set(dc.id, s);
  return s;
}

const dcOf = (id: string) => db.datacenters.find(d => d.id === id);

export function datacenters() { return db.datacenters.map(summarize); }

export function datacenter(id: string) {
  const dc = dcOf(id); if (!dc) return null;
  const s = summarize(dc);
  return { dc, summary: s, timeline: timeline(id), plans: db.plans.filter(p => p.dcId === id) };
}

function timeline(dcId: string): TimelineEvent[] {
  const ev: TimelineEvent[] = [];
  const dc = dcOf(dcId)!;
  if (dc.commissionedOn) ev.push({ at: dc.commissionedOn, kind: 'commissioning', title: 'Site moved to on-air' });
  db.incidents.filter(i => i.dcId === dcId).forEach(i => { ev.push({ at: i.detected, kind: 'incident', title: `${i.id} opened — ${i.title}`, ref: i.id }); if (i.resolved) ev.push({ at: i.resolved, kind: 'incident', title: `${i.id} resolved`, ref: i.id }); });
  db.changes.filter(c => c.dcId === dcId).forEach(c => ev.push({ at: c.windowStart, kind: c.kind === 'Maintenance' ? 'maintenance' : 'change', title: `${c.id} ${c.status.toLowerCase()} — ${c.title}`, ref: c.id }));
  db.plans.filter(p => p.dcId === dcId).forEach(p => ev.push({ at: p.target, kind: 'capacity', title: `${p.id} ${p.title} (${p.status})`, ref: p.id }));
  dc.collectors.filter(c => c.state !== 'up').forEach(c => ev.push({ at: c.lastSeen, kind: 'discovery', title: `${c.name} stopped reporting` }));
  return ev.sort((a, b) => b.at - a.at);
}

/* ------------------------------------------------------------- estate */

export function estate() {
  const L = db.locations;
  const by = (k: Location['kind']) => L.filter(l => l.kind === k);
  const statusCount = (xs: Location[]) => ({ 'on-air': xs.filter(x => x.status === 'on-air').length, 'in-progress': xs.filter(x => x.status === 'in-progress').length, planned: xs.filter(x => x.status === 'planned').length, failed: xs.filter(x => x.status === 'failed').length } as Record<RolloutStatus, number>);
  const kinds = (['datacenter', 'pop', 'site'] as const).map(k => ({ kind: k, total: by(k).length, status: statusCount(by(k)) }));
  /* DC NE counts come from the live NE table, not the location seed */
  const dcNe = (id: string) => summarize(dcOf(id)!);
  const roles: Record<string, number> = {};
  let neTotal = 0, discTotal = 0;
  for (const l of L) {
    if (l.kind === 'datacenter') { const s = dcNe(l.id); Object.entries(s.byRole).forEach(([k, v]) => { roles[k] = (roles[k] ?? 0) + v; }); neTotal += s.ne; discTotal += s.discovered; }
    else { Object.entries(l.roles).forEach(([k, v]) => { roles[k] = (roles[k] ?? 0) + v; }); neTotal += l.neCount; discTotal += l.discovered; }
  }
  const proto: Record<string, number> = {};
  db.links.forEach(l => { proto[l.protocol] = (proto[l.protocol] ?? 0) + 1; });
  const svcTypes: Record<string, number> = {};
  db.services.forEach(s => { svcTypes[s.type] = (svcTypes[s.type] ?? 0) + 1; });
  const passive = L.reduce((a, l) => { (Object.keys(l.passive) as (keyof Location['passive'])[]).forEach(k => { a[k] = (a[k] ?? 0) + l.passive[k]; }); return a; }, {} as Record<string, number>);
  const circles = db.circles.map(c => {
    const xs = L.filter(l => l.circleId === c.id);
    const st = statusCount(xs);
    const blockers: Record<string, number> = {};
    xs.filter(x => x.blocker).forEach(x => { blockers[x.blocker!] = (blockers[x.blocker!] ?? 0) + 1; });
    const ne = xs.reduce((a, l) => a + (l.kind === 'datacenter' ? dcNe(l.id).ne : l.neCount), 0);
    const disc = xs.reduce((a, l) => a + (l.kind === 'datacenter' ? dcNe(l.id).discovered : l.discovered), 0);
    return { id: c.id, name: c.name, regionId: c.regionId, lat: c.lat, lng: c.lng, dc: xs.filter(x => x.kind === 'datacenter').length, pop: xs.filter(x => x.kind === 'pop').length, sites: xs.filter(x => x.kind === 'site').length, total: xs.length, status: st,
      onAirPct: Math.round((st['on-air'] / xs.length) * 100), blockers, ne, discovered: disc, passive: xs.reduce((a, l) => a + Object.values(l.passive).reduce((x, y) => x + y, 0), 0) };
  }).sort((a, b) => b.total - a.total);
  const regions = db.regions.map(r => {
    const dcs = db.datacenters.filter(d => d.regionId === r.id);
    return { id: r.id, name: r.name, locations: dcs.length, status: statusCount(dcs.map(d => L.find(l => l.id === d.id)!)) };
  });
  return { kinds, total: L.length, statusAll: statusCount(L), roles, neTotal, discTotal, proto, svcTypes, services: db.services.length, passive, circles, regions };
}

export function locations(q: { kind?: string; status?: string; circle?: string; region?: string; blocker?: string; search?: string }) {
  return db.locations.filter(l => (!q.kind || l.kind === q.kind) && (!q.status || l.status === q.status) && (!q.circle || l.circleId === q.circle) && (!q.region || l.regionId === q.region) && (!q.blocker || l.blocker === q.blocker)
    && (!q.search || `${l.name} ${l.city} ${l.state}`.toLowerCase().includes(q.search.toLowerCase())))
    .map(l => (l.kind === 'datacenter' ? { ...l, neCount: summarize(dcOf(l.id)!).ne, discovered: summarize(dcOf(l.id)!).discovered } : l));
}

/* ------------------------------------------------------- network elements */

/* one-line GPU summary of a node (equipment list, device page) */
export function gpuSummary(neId: string) {
  const n = db.gpu?.nodes.get(neId); if (!n) return undefined;
  const job = n.jobId ? db.gpu!.jobs.find(j => j.id === n.jobId) : undefined;
  return { state: n.state, health: n.health, util: Math.round(n.gpus.reduce((a, g) => a + g.util, 0) / 8), maxTemp: Math.max(...n.gpus.map(g => g.tempC)), powerKw: n.powerKw, cooling: n.cooling, model: n.model, job: job?.name, jobState: job?.state, cells: n.gpus.map(g => ({ h: g.health, u: g.util, t: g.tempC, th: g.throttle })) };
}
export function networkElements(q: { dcId?: string; discovery?: string; role?: string }) {
  const al = liveAlerts();
  return db.nes.filter(n => (!q.dcId || n.dcId === q.dcId) && (!q.discovery || n.discovery === q.discovery) && (!q.role || n.role === q.role)).map(n => ({
    ...n, alarms: al.filter(a => a.neId === n.id).length, rack: n.rackId.split('-').slice(-1)[0], opsState: opsStateOf(n), category: NE_CATEGORY[n.role], tenant: n.tenantId ? db.customers.find(c => c.id === n.tenantId)?.name : undefined,
    /* GPU nodes: what the 8 GPUs are doing, for the equipment list */
    gpu: gpuSummary(n.id)
  }));
}

export function networkElement(id: string) {
  const ne = db.neById.get(id); if (!ne) return null;
  const ifs = db.ifaces.get(id)!;
  const links = linksOf({ neId: id });
  const alerts = db.alerts.filter(a => a.neId === id);
  const dc = dcOf(ne.dcId)!;
  const rack = dc.racks.find(r => r.id === ne.rackId)!;
  const recon = db.recon.find(t => t.neId === id && t.status !== 'Resolved');
  /* everything else in the same cabinet, for the device twin's rack view */
  const live = liveAlerts();
  const rackNes = db.nes.filter(n => n.rackId === ne.rackId).map(n => ({ id: n.id, name: n.name, role: n.role, u: n.u, uSize: n.uSize ?? 1, vendor: n.vendor, model: n.model, opsState: opsStateOf(n),
    worst: live.filter(a => a.neId === n.id).reduce<string | null>((w, a) => (a.severity === 'critical' || w === 'critical' ? 'critical' : a.severity === 'major' || w === 'major' ? 'major' : w ?? 'minor'), null), reachable: n.icmp.state !== 'critical' }));
  return { ne, rackNes, interfaces: ifs, links, alerts, rack, dc: summarize(dc), recon, services: servicesOf({ neId: id }), incidents: db.incidents.filter(i => i.affected.some(a => a.id === id) || i.alertIds.some(aid => alerts.some(a => a.id === aid))), changes: db.changes.filter(c => c.scope.includes(id)) };
}

export function interfacesOf(neId: string): Interface[] { return db.ifaces.get(neId) ?? []; }

export function linksOf(q: { neId?: string; dcId?: string; protocol?: string }): (Link & { forecastMonths: number; forecastDate: number | null; critMonths: number })[] {
  return db.links.filter(l => (!q.neId || l.aNe === q.neId || l.zNe === q.neId) && (!q.dcId || db.neById.get(l.aNe)!.dcId === q.dcId || db.neById.get(l.zNe)!.dcId === q.dcId) && (!q.protocol || l.protocol === q.protocol))
    .map(l => {
      const m = monthsTo(l.utilPct, l.growthPct, WARN), c = monthsTo(l.utilPct, l.growthPct, CRIT);
      return { ...l, forecastMonths: m, forecastDate: Number.isFinite(m) ? dateAfterMonths(db.now, m) : null, critMonths: c };
    });
}

export function link(id: string) {
  const l = linksOf({}).find(x => x.id === id); if (!l) return null;
  const a = db.neById.get(l.aNe)!, z = db.neById.get(l.zNe)!;
  const siblings = db.links.filter(x => x.aNe === l.aNe && x.aIf === l.aIf && x.zNe === l.zNe);
  const lldp = siblings.find(x => x.protocol === 'LLDP');
  const svcs = db.services.filter(s => s.linkIds.includes(lldp?.id ?? l.id));
  return { link: l, a, z, aIf: db.ifaces.get(a.id)!.find(i => i.name === l.aIf), zIf: db.ifaces.get(z.id)!.find(i => i.name === l.zIf), siblings, services: svcs.map(s => ({ ...s, customer: db.customers.find(c => c.id === s.customerId)! })), alerts: db.alerts.filter(al => al.linkId === l.id || (al.neId === a.id && al.ifName === l.aIf) || (al.neId === z.id && al.ifName === l.zIf)) };
}

/* ------------------------------------------------------- services/customers */

export function servicesOf(q: { dcId?: string; neId?: string; customerId?: string; linkId?: string }) {
  const list = db.services.filter(s => (!q.dcId || s.dcId === q.dcId) && (!q.neId || s.neId === q.neId) && (!q.customerId || s.customerId === q.customerId) && (!q.linkId || s.linkIds.includes(q.linkId)));
  const why = causeIndex();
  return list.map(s => ({ ...s, customer: db.customers.find(c => c.id === s.customerId)!, causes: why(s) }));
}

/* Why a service is impacted. A fault counts against a service only when it sits on
   that service's own path: an alarm on one of its links, an interface alarm on its
   hand-off or link ports, a major/critical device alarm on a device in its path, a
   rack-level fault in a rack hosting its devices, or a critical site-wide facility
   alarm. Healthy neighbours in the same rack are not implicated. */
const SEV_W: Record<Severity, number> = { critical: 0, major: 1, minor: 2, warning: 3 };
/* the operational domain of a fault — what kind of datacenter issue it is */
export function domainOf(a: Alert): RevDomain {
  const t = a.title;
  if (/Utilisation|Over Power Budget|Capacity|Exhaust/i.test(t)) return 'Capacity';
  /* GPU hardware faults (Xid, ECC, NVLink) are their own kind of issue; GPU heat is a cooling problem */
  if (/Xid|NVLink|GPU (Fallen|Uncorrectable)/.test(t)) return 'GPU';
  if (a.linkId || a.ifName || a.source === 'Link' || a.source === 'Protocol' || /Link|Optical|Cross-connect|BGP|OSPF|Flap/i.test(t)) return 'Network';
  if (a.source === 'Cooling' || /Temperature|Thermal|Cooling|CRAH|CRAC|Chiller/i.test(t)) return 'Cooling';
  if (a.source === 'Power' || /UPS|PDU|PSU|Power|Breaker|Rectifier|Battery/i.test(t)) return 'Power';
  return 'Device';
}
function causeIndex() {
  const al = liveAlerts();
  const byLink = new Map<string, Alert[]>(), byNe = new Map<string, Alert[]>(), byRack = new Map<string, Alert[]>(), siteCrit = new Map<string, Alert[]>();
  const add = (m: Map<string, Alert[]>, k: string, a: Alert) => m.set(k, [...(m.get(k) ?? []), a]);
  for (const a of al) {
    if (a.linkId) add(byLink, a.linkId, a);
    if (a.neId) add(byNe, a.neId, a);
    if (a.rackId) add(byRack, a.rackId, a);
    else if (!a.neId && a.severity === 'critical' && a.scope === 'site' && (a.source === 'Power' || a.source === 'Cooling')) add(siteCrit, a.dcId, a);
  }
  const linkById = new Map(db.links.map(l => [l.id, l]));
  const openInc = new Set(db.incidents.filter(isOpen).map(i => i.id));
  const shortOf = (id: string) => id.replace(/^[A-Z]{2}-DC-\d{3}-/, '');
  return (s: Service): ImpactCause[] => {
    const out = new Map<string, ImpactCause>();
    /* one entry per physical fault: a shared fault id, or one port for all its interface alarms */
    const put = (a: Alert, kind: ImpactCause['kind'], where: string, to: string, key = a.fault?.id ?? a.code) => {
      const e = out.get(key);
      const incId = a.incidentId && openInc.has(a.incidentId) ? a.incidentId : undefined;
      if (!e) { out.set(key, { code: key, title: a.title, where: a.fault?.where ?? where, severity: a.severity, kind, to, related: 0, since: a.start, incidentId: incId, domain: domainOf(a) }); return; }
      e.since = Math.min(e.since ?? a.start, a.start); e.incidentId ??= incId;
      if (e.title === a.title) return;
      e.related++;
      if (SEV_W[a.severity] < SEV_W[e.severity]) { e.title = a.title; e.severity = a.severity; }
    };
    const ports = new Set<string>([`${s.neId}:${s.ifName}`]);
    for (const id of s.linkIds) { const l = linkById.get(id); if (!l) continue; ports.add(`${l.aNe}:${l.aIf}`); ports.add(`${l.zNe}:${l.zIf}`); (byLink.get(id) ?? []).forEach(a => put(a, 'link', `${shortOf(l.aNe)} ${l.aIf} ↔ ${shortOf(l.zNe)}`, `/alerts?q=${a.code}`, a.fault?.id ?? (a.neId && a.ifName ? `${a.neId}:${a.ifName}` : a.code))); }
    const nes = [...new Set([s.neId, ...s.path])];
    const racks = new Set<string>();
    for (const id of nes) {
      const n = db.neById.get(id); if (!n) continue;
      racks.add(n.rackId);
      for (const a of byNe.get(id) ?? []) {
        if (a.ifName) { if (ports.has(`${id}:${a.ifName}`)) put(a, 'interface', `${shortOf(id)} ${a.ifName}`, `/ne/${id}?tab=alerts`, a.fault?.id ?? `${id}:${a.ifName}`); }
        /* device-level: hardware, power or reachability faults only — load (CPU) and config drift do not break a service */
        else if ((a.severity === 'critical' || a.severity === 'major') && a.category !== 'Performance' && a.source !== 'Discovery') put(a, 'device', `${shortOf(id)} · ${shortOf(n.rackId)} U${n.u}`, `/ne/${id}?tab=alerts`);
      }
    }
    for (const r of racks) for (const a of byRack.get(r) ?? []) put(a, 'rack', shortOf(r), `/datacenters/${s.dcId}?tab=attention`);
    for (const a of siteCrit.get(s.dcId) ?? []) put(a, 'site', s.dcId, `/facilities?dc=${s.dcId}`);
    const list = [...out.values()].sort((a, b) => SEV_W[a.severity] - SEV_W[b.severity]);
    if (!list.length && s.status === 'Degraded' && s.utilPct >= 90) list.push({ code: `${s.id}-UTIL`, title: s.unit === 'kW' ? `Drawing ${Math.round(s.utilPct)}% of contracted power` : s.unit === 'cabinets' ? `Cabinet space ${Math.round(s.utilPct)}% used` : s.unit === 'hours' ? `Remote-hands allowance ${Math.round(s.utilPct)}% used` : s.unit === 'Mbps' ? `Utilisation ${Math.round(s.utilPct)}% of ${s.qty >= 1000 ? `${s.qty / 1000} Gbps` : `${s.qty} Mbps`}` : `Running at ${Math.round(s.utilPct)}% of its size`, where: shortOf(s.neId), severity: 'warning', kind: 'utilisation', to: `/services/${s.id}`, related: 0, since: db.now - (4 + (s.id.charCodeAt(s.id.length - 1) + s.id.charCodeAt(s.id.length - 2)) % 20) * HOUR, domain: 'Capacity' });
    return list;
  };
}

export function service(id: string) {
  const s = db.services.find(x => x.id === id); if (!s) return null;
  const customer = db.customers.find(c => c.id === s.customerId)!;
  const ne = db.neById.get(s.neId)!;
  const dc = dcOf(s.dcId)!;
  const handoff = db.ifaces.get(ne.id)!.find(i => i.name === s.ifName);
  const links = s.linkIds.map(id => linksOf({}).find(l => l.id === id)!).filter(Boolean);
  const pathNes = s.path.map(id => db.neById.get(id)!);
  const alerts = liveAlerts().filter(a => s.path.includes(a.neId ?? '') || s.linkIds.includes(a.linkId ?? '') || (a.neId === ne.id && (a.ifName === s.ifName || links.some(l => l.aIf === a.ifName || l.zIf === a.ifName))));
  const incidents = db.incidents.filter(i => isOpen(i) && (i.alertIds.some(x => alerts.some(a => a.id === x)) || i.affected.some(a => s.linkIds.includes(a.id) || a.id === ne.id)));
  return { service: s, customer, ne, dc: summarize(dc), rack: dc.racks.find(r => r.id === ne.rackId)!, handoff, links, pathNes, alerts, incidents };
}

export function customers() {
  return db.customers.map(c => {
    const s = db.services.filter(x => x.customerId === c.id);
    const exposed = s.filter(x => x.status === 'Degraded' || x.status === 'Down' || db.incidents.some(i => isOpen(i) && i.affected.some(a => x.linkIds.includes(a.id) || a.id === x.neId)));
    return { ...c, services: s.length, dcs: new Set(s.map(x => x.dcId)).size, avgUtil: s.length ? Math.round(s.reduce((a, x) => a + x.utilPct, 0) / s.length) : 0, minUptime: s.length ? Math.min(...s.map(x => x.uptime30d)) : 100, exposed: exposed.length };
  });
}
export function customer(id: string) {
  const c = customers().find(x => x.id === id); if (!c) return null;
  const svcs = servicesOf({ customerId: id });
  const incs = db.incidents.filter(i => isOpen(i) && svcs.some(s => i.affected.some(a => s.linkIds.includes(a.id) || a.id === s.neId) || impactOf(db, { linkIds: i.affected.filter(a => a.kind === 'Link').map(a => a.id) }).services.some(x => x.id === s.id)));
  /* money view of the same customer: their row in the revenue model and the open issues hitting them */
  const rv = revenue();
  const issueById = new Map(rv.issues.map(i => [i.id, i]));
  return { customer: c, services: svcs, incidents: incs, revenue: rv.customers.find(x => x.id === id) ?? null, hits: customerHits(db, revenueModel(), id, k => issueById.get(k)) };
}

/* ---------------------------------------------------------------- alerts */

export function alerts(q: { dcId?: string; neId?: string; severity?: string; state?: string; source?: string; scope?: 'dc' | 'downstream' | 'all' }) {
  const sc = q.scope ?? 'dc';
  const pool = q.dcId ? (q.state === 'cleared' ? db.alerts.filter(a => a.dcId === q.dcId) : alertsInScope(q.dcId, true)) : db.alerts;
  return pool.filter(a => (sc === 'all' || (sc === 'downstream' ? a.scope === 'downstream' : a.scope !== 'downstream')) && (!q.neId || a.neId === q.neId) && (!q.severity || a.severity === q.severity) && (!q.state || (q.state === 'open' ? a.state !== 'cleared' : a.state === q.state)) && (!q.source || a.source === q.source))
    .sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || b.start - a.start);
}
const sevRank = (s: Severity) => ({ critical: 0, major: 1, minor: 2, warning: 3 })[s];

/* ------------------------------------------------------------- incidents */

export function slaState(i: Incident) {
  const n = db.now;
  const respUsed = ((i.acknowledged ?? n) - i.detected) / MIN;
  const resUsed = ((i.resolved ?? n) - i.detected) / MIN;
  return {
    responseBreached: respUsed > i.responseSlaMin, responseMin: Math.round(respUsed), responseLeft: Math.round(i.responseSlaMin - respUsed),
    resolveBreached: resUsed > i.resolveSlaMin, resolveLeft: Math.round(i.resolveSlaMin - resUsed), breaching: isOpen(i) && (resUsed > i.resolveSlaMin || (!i.acknowledged && respUsed > i.responseSlaMin) || (!!i.acknowledged && respUsed > i.responseSlaMin))
  };
}
export function incidents(q: { dcId?: string; status?: string }) {
  const rev = new Map(revenue().issues.map(x => [x.id, x]));
  const money = (id: string) => { const x = rev.get(id); return x ? { rank: x.rank, rate: x.rate, impact: x.lost + x.credits, atRisk: x.mrrDown + x.mrrDegraded, exposed: x.mrrExposed, potentialRate: x.potentialRate, cliffMin: x.nextCliff?.inMin ?? null, underPrioritised: x.underPrioritised } : null; };
  return db.incidents.filter(i => (!q.dcId || i.dcId === q.dcId) && (!q.status || (q.status === 'open' ? isOpen(i) : i.status === q.status))).map(i => ({ ...i, sla: slaState(i), revenue: money(i.id) })).sort((a, b) => Number(b.id.slice(4)) - Number(a.id.slice(4)));
}
export function incident(id: string) {
  const i = db.incidents.find(x => x.id === id); if (!i) return null;
  const al = i.alertIds.map(a => db.alerts.find(x => x.id === a)!).filter(Boolean);
  const neIds = i.affected.filter(a => a.kind === 'NE').map(a => a.id), linkIds = i.affected.filter(a => a.kind === 'Link').map(a => a.id);
  const gpuInc = i.reportedBy.startsWith('DCGM');
  const im = impactOf(db, { neIds: i.type === 'Network' && linkIds.length ? [] : gpuInc ? [] : neIds, linkIds, dcIds: i.type === 'Power' && i.sev === 1 ? [i.dcId] : [], pathIds: gpuInc ? neIds : [] });
  const recentChanges = db.changes.filter(c => c.dcId === i.dcId && c.windowEnd <= i.detected && c.windowEnd > i.detected - 3 * DAY);
  const changes = [...new Map([...i.changeIds.map(c => db.changes.find(x => x.id === c)!), ...recentChanges].filter(Boolean).map(c => [c.id, c])).values()];
  const codes = new Set(al.map(a => a.code));
  const symptoms = db.alerts.filter(a => a.symptomOf && codes.has(a.symptomOf));
  return { incident: { ...i, sla: slaState(i) }, alerts: al, symptoms, services: im.services.map(s => ({ ...s, customer: db.customers.find(c => c.id === s.customerId)! })), customers: im.customers, changes, dc: summarize(dcOf(i.dcId)!), similar: i.similar ? i.similar.nodes.map(n => db.neById.get(n)!).filter(Boolean) : [], revenue: revenueOfIncident(i.id) };
}

/* ---------------------------------------------------------------- changes */

export function changes(q: { dcId?: string; status?: string }) {
  return db.changes.filter(c => (!q.dcId || c.dcId === q.dcId) && (!q.status || c.status === q.status)).sort((a, b) => b.windowStart - a.windowStart);
}
export function changeImpact(scope: string[], dcId: string, excludeId?: string) {
  const neIds = scope.filter(s => db.neById.has(s));
  const linkIds = db.links.filter(l => l.protocol === 'LLDP' && (neIds.includes(l.aNe) || neIds.includes(l.zNe))).map(l => l.id);
  const im = impactOf(db, { neIds, linkIds });
  const premium = im.premium.length;
  const conflicts = db.changes.filter(c => c.id !== excludeId && c.dcId === dcId && ['Approved', 'In progress', 'Pending approval'].includes(c.status) && c.scope.some(s => scope.includes(s)));
  const openInc = db.incidents.filter(i => isOpen(i) && i.affected.some(a => scope.includes(a.id)));
  const score = Math.min(100, neIds.length * 6 + im.services.length * 3 + premium * 8 + conflicts.length * 10 + openInc.length * 15);
  return { nes: neIds.length, links: linkIds.length, services: im.services.length, customers: im.customers.length, premium, revenue: im.revenue, conflicts, openInc, score, risk: (score >= 55 ? 'High' : score >= 25 ? 'Medium' : 'Low') as Change['risk'] };
}

/* ------------------------------------------------------- reconciliation */

export function recon(q: { dcId?: string; kind?: string; status?: string }) {
  return db.recon.filter(t => (!q.dcId || t.dcId === q.dcId) && (!q.kind || t.kind === q.kind) && (!q.status || t.status === q.status)).map(t => ({ ...t, ne: db.neById.get(t.neId)! }));
}
export function audit(object?: string) { return db.audit.filter(a => !object || a.object === object).sort((a, b) => b.at - a.at); }

/* --------------------------------------------------------------- capacity */

export function capacity(dcId?: string) {
  const dcs = db.datacenters.filter(d => (!dcId || d.id === dcId) && d.status !== 'planned');
  const sum = (f: (d: Datacenter) => number) => Math.round(dcs.reduce((a, d) => a + f(d), 0) * 10) / 10;
  const powerCap = sum(d => d.power.capacityKw), powerUse = sum(d => d.power.split.reduce((a, s) => a + s.kw, 0));
  const coolCap = sum(d => d.cooling.capacityKw), coolUse = sum(d => d.cooling.loadKw);
  const uCap = sum(d => d.racks.reduce((a, r) => a + r.heightU, 0)), uUse = sum(d => d.racks.reduce((a, r) => a + r.usedU, 0));
  const pCap = sum(d => d.ports.reduce((a, p) => a + p.total, 0)), pUse = sum(d => d.ports.reduce((a, p) => a + p.used, 0));
  const bh = linksOf({}).filter(l => l.protocol === 'LLDP' && (l.role === 'Backhaul' || l.role === 'Uplink') && (!dcId || db.neById.get(l.aNe)!.dcId === dcId || db.neById.get(l.zNe)!.dcId === dcId));
  const bwCap = bh.reduce((a, l) => a + l.capacityMbps, 0) / 1000, bwUse = bh.reduce((a, l) => a + l.capacityMbps * l.utilPct / 100, 0) / 1000;
  const cpu = [sum(d => d.compute.cpuCores), sum(d => d.compute.cpuUsed)], mem = [sum(d => d.compute.memGb), sum(d => d.compute.memUsed)], sto = [sum(d => d.compute.storageTb), sum(d => d.compute.storageUsed)];
  const plans = db.plans.filter(p => !dcId || p.dcId === dcId);
  const pipeline = (dim: CapacityPlan['dimension']) => plans.filter(p => p.dimension === dim && (p.status === 'Approved' || p.status === 'Executing')).reduce((a, p) => a + p.amount, 0);
  const growth = { Power: 1.6, Cooling: 1.4, Space: 0.9, Ports: 1.2, Bandwidth: 3.4 } as const;
  const dim = (name: keyof typeof growth, cap: number, use: number, unit: string) => {
    const pct = cap ? (use / cap) * 100 : 0;
    const m = monthsTo(pct, growth[name], WARN);
    return { name, cap, use, unit, pct: Math.round(pct), headroom: Math.round((cap - use) * 10) / 10, growth: growth[name], pipeline: pipeline(name), monthsToWarn: m, warnDate: Number.isFinite(m) ? dateAfterMonths(db.now, m) : null };
  };
  const dims = [dim('Power', powerCap, powerUse, 'kW'), dim('Cooling', coolCap, coolUse, 'kW'), dim('Space', uCap, uUse, 'U'), dim('Ports', pCap, pUse, 'ports'), dim('Bandwidth', Math.round(bwCap), Math.round(bwUse), 'Gbps')];
  const racks = dcs.flatMap(d => d.racks.map(r => ({ ...r, dcName: d.name })));
  return {
    dims, compute: { cpu, mem, sto }, plans, racks, ups: dcs.flatMap(d => d.power.ups.map(u => ({ ...u, dcId: d.id }))), cooling: dcs.flatMap(d => d.cooling.units.map(u => ({ ...u, dcId: d.id }))),
    zones: dcs.flatMap(d => d.cooling.sensors.map(s => ({ ...s, dcId: d.id }))), hotLinks: bh.filter(l => l.utilPct >= 75).sort((a, b) => a.forecastMonths - b.forecastMonths),
    perDc: dcs.map(d => ({ id: d.id, s: summarize(d), power: d.power, coolPct: Math.round((d.cooling.loadKw / d.cooling.capacityKw) * 100) })),
    powerHistory: Array.from({ length: 12 }, (_, i) => Math.round(dcs.reduce((a, d) => a + d.power.history12m[i], 0))),
    /* P2B merge phase 3: holds against capacity, GPU headroom, energy (mock/capacity.ts); halls from DCIM */
    holds: capacityHolds(db, dcs), gpu: gpuCapacity(db, dcs), energy: siteEnergy(dcs),
    halls: dcimModel(db).halls.filter(h => dcs.some(d => d.id === h.dcId))
  };
}

/* ---------------------------------------------------------- command center */

export function commandCenter() {
  const s = datacenters();
  const live = db.nes.filter(n => n.discovery !== 'not-discovered' && !isOpaque(n));
  const al = liveAlerts();
  const open = incidents({ status: 'open' });
  const breaching = open.filter(i => i.sla.breaching);
  const resolved30 = db.incidents.filter(i => i.resolved && i.resolved > db.now - 30 * DAY);
  const mttr = resolved30.length ? resolved30.reduce((a, i) => a + (i.resolved! - i.detected), 0) / resolved30.length / MIN : 0;
  const slaMet = resolved30.filter(i => (i.resolved! - i.detected) / MIN <= i.resolveSlaMin).length;
  const cap = capacity();
  const pw = cap.dims[0];
  const lldp = db.links.filter(l => l.protocol === 'LLDP');
  const linksDown = lldp.filter(l => l.state === 'down');
  const degraded = db.services.filter(x => x.status === 'Degraded' || x.status === 'Down');
  const ups = db.datacenters.flatMap(d => d.power.ups);
  const coolingN1 = db.datacenters.filter(d => d.status !== 'planned' && d.cooling.units.every(u => u.status === 'Operational')).length;
  const rollout = db.locations.filter(l => l.status !== 'on-air');
  const pendingChg = db.changes.filter(c => c.status === 'Pending approval');
  const reconOpen = db.recon.filter(t => t.status !== 'Resolved');
  const overRacks = cap.racks.filter(r => r.drawKw / r.budgetKw >= 0.85);
  const stale = db.datacenters.filter(d => d.collectors.some(c => c.state !== 'up'));
  const exhaust = cap.hotLinks.filter(l => l.forecastMonths > 0 && l.forecastMonths <= 6);
  const overWarn = cap.hotLinks.filter(l => l.utilPct >= 85);
  const health = live.length ? Math.round(live.reduce((a, n) => a + n.healthScore, 0) / live.length) : 0;
  /* Four operations health areas a shift lead acts on. Each score is a plain
     percentage of things in a good state; the detail names what is not. */
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 100);
  const n1 = open.filter(i => i.sev === 1).length;
  const liveDcs = db.datacenters.filter(d => d.status !== 'planned');
  const unreachable = live.filter(n => n.icmp.state === 'critical');
  const upsAll = liveDcs.flatMap(d => d.power.ups.map(u => ({ ...u, dc: d.id })));
  const upsBad = upsAll.filter(u => u.state !== 'Online');
  const feeds = liveDcs.flatMap(d => d.power.feeds.filter(f => f.type === 'AC').map(f => ({ ...f, dc: d.id })));
  const feedsBad = feeds.filter(f => f.status === 'Alarm');
  const units = liveDcs.flatMap(d => d.cooling.units.map(u => ({ ...u, dc: d.id })));
  const unitsFailed = units.filter(u => u.status === 'Failed'), unitsMaint = units.filter(u => u.status === 'Maintenance');
  const zones = liveDcs.flatMap(d => d.cooling.sensors.map(z => ({ ...z, dc: d.id })));
  const zonesHot = zones.filter(z => z.tempC > 27);
  const edgeAll = liveDcs.map(d => ({ id: d.id, e: edgeStatus(d.id) }));
  const edgeLost = edgeAll.filter(x => x.e.state === 'redundancy-lost'), edgeIsolated = edgeAll.filter(x => x.e.state === 'isolated');
  const join = (xs: string[], none: string) => (xs.length ? xs.join(' · ') : none);
  /* a GPU cloud reads its network as planes: InfiniBand, Ethernet front-end, management (the area is still called Network, user 12-Oct-2026) */
  const neo = persona === 'neocloud';
  const downBy = (pl: Plane) => linksDown.filter(l => planeOf(l) === pl).length;
  const netDetail = neo
    ? `IB ${downBy('ib')} · Eth ${downBy('eth')} · OOB ${downBy('mgmt')} down · ${unreachable.length} unreachable`
    : `${linksDown.length} links down · ${unreachable.length} unreachable · ${edgeLost.length} site${edgeLost.length === 1 ? '' : 's'} lost edge redundancy`;
  /* Which datacenters carry each area's issues (12-Oct-2026, user: "if more than one incident on power, how do we show
     the datacenter names?"): one chip per site, critical first, with a note of what is wrong there and a deep link. */
  const siteList = (xs: { id: string; crit?: boolean; note: string }[], to: (id: string) => string): AreaSite[] => {
    const m = new Map<string, { crit: boolean; notes: Map<string, number> }>();
    xs.forEach(x => { const e = m.get(x.id) ?? { crit: false, notes: new Map() }; e.crit ||= !!x.crit; e.notes.set(x.note, (e.notes.get(x.note) ?? 0) + 1); m.set(x.id, e); });
    return [...m].map(([id, e]) => ({ id, state: e.crit ? 'critical' as const : 'attention' as const, to: to(id), n: [...e.notes.values()].reduce((a, c) => a + c, 0),
      note: [...e.notes].map(([t, n]) => (n > 1 ? `${n} × ${t}` : t)).join(' · ') }))
      .sort((a, b) => (a.state !== b.state ? (a.state === 'critical' ? -1 : 1) : b.n - a.n || a.id.localeCompare(b.id)));
  };
  const domains = [
    { key: 'response', label: 'Incident response', unit: 'in SLA · estate', value: pct(open.length - breaching.length, open.length), measure: 'Open incidents still within their resolution SLA',
      detail: `${breaching.length} of ${open.length} open incidents past SLA${n1 ? ` · ${n1} critical` : ''}`, to: '/incidents?view=breaching', state: (breaching.some(i => i.sev === 1) ? 'critical' : breaching.length ? 'attention' : 'ok') as AreaState,
      sites: siteList(breaching.map(i => ({ id: i.dcId, crit: i.sev === 1, note: `${i.id} ${sevLabel(i.sev)} past SLA` })), id => `/incidents?view=breaching&dc=${id}`) },
    { key: 'network', label: 'Network', unit: 'estate healthy', value: pct(lldp.length - linksDown.length + live.length - unreachable.length, lldp.length + live.length), measure: neo ? 'Network cables up (InfiniBand, Ethernet, OOB) and nodes reachable' : 'Physical links up and devices reachable',
      detail: netDetail, to: '/datacenters?view=edge', state: (edgeIsolated.length ? 'critical' : linksDown.length || unreachable.length || edgeLost.length ? 'attention' : 'ok') as AreaState,
      sites: siteList([...linksDown.map(l => ({ id: l.dcId, note: neo ? `${PLANE_SHORT[planeOf(l)]} cable down` : 'link down' })), ...unreachable.map(n => ({ id: n.dcId, note: 'device unreachable' })),
        ...edgeLost.map(x => ({ id: x.id, note: 'edge redundancy lost' })), ...edgeIsolated.map(x => ({ id: x.id, crit: true, note: 'isolated — no edge link up' }))], id => `/datacenters/${id}?tab=topology`) },
    { key: 'power', label: 'Power', unit: 'estate healthy', value: pct(upsAll.length - upsBad.length + feeds.length - feedsBad.length, upsAll.length + feeds.length), measure: 'UPS units online and utility feeds normal',
      detail: join([...upsBad.map(u => `${u.name} ${u.state.toLowerCase()}`), ...(feedsBad.length ? [`${feedsBad.length} utility feed${feedsBad.length > 1 ? 's' : ''} lost`] : [])], `All ${upsAll.length} UPS online · all feeds normal`),
      to: upsBad[0] ? `/facilities?dc=${upsBad[0].dc}` : '/facilities', state: (upsBad.some(u => u.state === 'On battery' || u.state === 'Fault') ? 'critical' : upsBad.length || feedsBad.length ? 'attention' : 'ok') as AreaState,
      sites: siteList([...upsBad.map(u => ({ id: u.dc, crit: u.state === 'On battery' || u.state === 'Fault', note: `${u.name} ${u.state.toLowerCase()}` })), ...feedsBad.map(f => ({ id: f.dc, note: `${f.source.replace(/^Utility/, 'utility')} lost` }))], id => `/facilities?dc=${id}`) },
    { key: 'cooling', label: 'Cooling & environment', unit: 'estate healthy', value: pct(units.length - unitsFailed.length + zones.length - zonesHot.length, units.length + zones.length), measure: 'Cooling units running and zones within 27°C',
      detail: join([...unitsFailed.map(u => `${u.name} failed`), ...(zonesHot.length ? [`${zonesHot.length} zone${zonesHot.length > 1 ? 's' : ''} >27°C`] : []), ...(unitsMaint.length ? [`${unitsMaint.length} in maint.`] : [])], 'All cooling units running · all zones in range'),
      to: unitsFailed[0] ? `/facilities?dc=${unitsFailed[0].dc}&tab=cooling` : '/facilities?tab=cooling', state: (unitsFailed.length || zonesHot.length ? 'attention' : 'ok') as AreaState,
      sites: siteList([...unitsFailed.map(u => ({ id: u.dc, note: `${u.name} failed` })), ...zonesHot.map(z => ({ id: z.dc, note: `${z.zone} ${z.tempC}°C` }))], id => `/facilities?dc=${id}&tab=cooling`) }
  ];
  /* what the % counts and why the status word is what it is (12-Oct-2026, user: "97.7% and Critical — healthy or at risk?").
     The % is the share of items in a good state (higher is better); the status follows the worst single issue, so one UPS on
     battery makes Power Critical even when 98% of the plant is fine. */
  const plantUps = upsBad.filter(u => u.state === 'On battery' || u.state === 'Fault');
  const explain: Record<string, { good: number; total: number; items: string; why: string }> = {
    response: { good: open.length - breaching.length, total: open.length, items: 'open incidents within their resolution SLA',
      why: breaching.some(i => i.sev === 1) ? 'Critical because a Critical incident is past its SLA.' : breaching.length ? `Attention because ${breaching.length} incident${breaching.length === 1 ? ' is' : 's are'} past SLA.` : 'Normal: every open incident is within SLA.' },
    network: { good: lldp.length - linksDown.length + live.length - unreachable.length, total: lldp.length + live.length, items: `${neo ? 'cables' : 'physical links'} up and devices reachable (${fmtNum(lldp.length)} ${neo ? 'cables' : 'links'} + ${fmtNum(live.length)} devices)`,
      why: edgeIsolated.length ? `Critical because ${edgeIsolated.map(x => x.id).join(', ')} has no edge link up.` : linksDown.length || unreachable.length || edgeLost.length ? `Attention because ${[linksDown.length && `${linksDown.length} ${neo ? 'cables' : 'links'} are down`, unreachable.length && `${unreachable.length} devices are unreachable`, edgeLost.length && `${edgeLost.length} site${edgeLost.length === 1 ? ' has' : 's have'} lost edge redundancy`].filter(Boolean).join(', ')}.` : 'Normal: every link is up and every device reachable.' },
    power: { good: upsAll.length - upsBad.length + feeds.length - feedsBad.length, total: upsAll.length + feeds.length, items: `UPS units online and utility feeds normal (${upsAll.length} UPS + ${feeds.length} feeds)`,
      why: plantUps.length ? `Critical because ${plantUps.map(u => `${u.name} at ${u.dc} is ${u.state.toLowerCase()}`).join(', ')} — that load is running on limited battery time.` : upsBad.length || feedsBad.length ? 'Attention because a UPS or a utility feed is not normal; the load is still protected.' : 'Normal: every UPS is online and every feed normal.' },
    cooling: { good: units.length - unitsFailed.length + zones.length - zonesHot.length, total: units.length + zones.length, items: `cooling units running and zones within 27°C (${units.length} units + ${zones.length} zones)`,
      why: unitsFailed.length || zonesHot.length ? `Attention because ${[unitsFailed.length && `${unitsFailed.length} cooling unit${unitsFailed.length === 1 ? '' : 's'} failed`, zonesHot.length && `${zonesHot.length} zone${zonesHot.length === 1 ? ' is' : 's are'} above 27°C`].filter(Boolean).join(' and ')}.` : 'Normal: every cooling unit is running and every zone in range.' }
  };
  const areas = domains.map(d => ({ ...d, ...explain[d.key] }));
  const facilityAlarms = al.filter(a => !a.neId && (a.source === 'Power' || a.source === 'Cooling' || a.source === 'Environment')).length;
  const activeChanges = db.changes.filter(c => c.status === 'In progress' || (c.status === 'Approved' && c.windowStart <= db.now && c.windowEnd >= db.now));
  const shi = Math.round(domains.reduce((a, d) => a + d.value, 0) / domains.length);
  const weakest = [...domains].sort((a, b) => a.value - b.value)[0];
  const attention = [
    { key: 'breaching', n: breaching.length, label: 'incident(s) breaching SLA', to: '/incidents?view=breaching', tone: 'error' },
    { key: 'sev1', n: open.filter(i => i.sev === 1).length, label: 'critical incident(s) open', to: '/incidents?view=sev1', tone: 'error' },
    { key: 'links', n: linksDown.length, label: 'physical link(s) down', to: '/alerts?q=Link%20Down', tone: 'error' },
    { key: 'crit', n: al.filter(a => a.severity === 'critical' || a.severity === 'major').length, label: 'critical/major alarm(s) active', to: '/alerts?sev=critical', tone: 'warning' },
    { key: 'svc', n: degraded.length, label: 'service(s) degraded', to: '/incidents', tone: 'warning' },
    { key: 'stale', n: stale.length, label: 'site(s) with a stale collector', to: '/datacenters', tone: 'warning' },
    { key: 'overwarn', n: overWarn.length, label: 'uplink(s) above 85% utilisation now', to: '/alerts?q=Utilisation', tone: 'warning' },
    { key: 'racks', n: overRacks.length, label: 'rack(s) over 85% of power budget', to: '/facilities?tab=power', tone: 'warning' },
    { key: 'chg', n: pendingChg.length, label: 'change(s) awaiting approval', to: '/changes?status=Pending%20approval', tone: 'info' },
  ].filter(a => a.n > 0);
  const activity = [
    ...db.alerts.filter(a => a.state !== 'cleared').sort((a, b) => b.start - a.start).slice(0, 6).map(a => ({ at: a.start, kind: 'alert', text: `${a.code} ${a.title}`, sub: `${a.neId ?? a.dcId}`, to: a.neId ? `/ne/${a.neId}?tab=alerts` : `/datacenters/${a.dcId}?tab=attention` })),
    ...db.changes.filter(c => c.windowStart <= db.now).sort((a, b) => b.windowStart - a.windowStart).slice(0, 4).map(c => ({ at: c.windowStart, kind: 'change', text: `${c.id} ${c.status.toLowerCase()}`, sub: c.title, to: `/changes?id=${c.id}` }))
  ].sort((a, b) => b.at - a.at).slice(0, 10);
  const powerPct = pw.pct;
  const insights = [
    `Operations health ${shi}/100 — weakest area is ${weakest.label} at ${weakest.value}%.`,
    `${stale.length} site${stale.length === 1 ? ' has' : 's have'} a stale discovery collector; ${reconOpen.length} inventory records await reconciliation.`,
    exhaust[0] ? `${exhaust[0].aNe} ${exhaust[0].aIf} is forecast to cross 85% in ${Math.max(1, Math.round(exhaust[0].forecastMonths))} month${Math.max(1, Math.round(exhaust[0].forecastMonths)) === 1 ? '' : 's'} at ${exhaust[0].growthPct}%/mo growth.` : 'No backhaul link crosses 85% inside six months.',
    `Estate power at ${powerPct}% of capacity with ${fmtNum(Math.round(pw.headroom))} kW headroom; ${pw.pipeline} kW committed in approved plans.`
  ];
  /* ---- situation-room payload */
  const sevRankI = (i: Incident) => i.sev;
  const topIncidents = [...open].sort((a, b) => sevRankI(a) - sevRankI(b) || b.impact.premium - a.impact.premium || b.impact.revenueAtRisk - a.impact.revenueAtRisk || (a.sla.breaching ? -1 : 0) - (b.sla.breaching ? -1 : 0))
    .slice(0, 10).map(i => ({ id: i.id, title: i.title, sev: i.sev, status: i.status, dcId: i.dcId, city: dcOf(i.dcId)!.city, owner: i.owner, detected: i.detected, sla: i.sla, resolveSlaMin: i.resolveSlaMin, impact: i.impact, type: i.type }));
  const svcStatus = { Active: 0, Degraded: 0, Down: 0, Disabled: 0 } as Record<string, number>;
  db.services.forEach(x => { svcStatus[x.status]++; });
  const exposedSvc = db.services.filter(x => x.status === 'Degraded' || x.status === 'Down');
  const custMap = new Map<string, { services: number; revenue: number; minSla: number }>();
  exposedSvc.forEach(x => { const e = custMap.get(x.customerId) ?? { services: 0, revenue: 0, minSla: 100 }; e.services++; e.revenue += x.revenueMonthly; e.minSla = Math.min(e.minSla, x.slaTarget); custMap.set(x.customerId, e); });
  const exposedCustomers = [...custMap.entries()].map(([id, e]) => ({ ...db.customers.find(c => c.id === id)!, ...e })).sort((a, b) => Number(b.premium) - Number(a.premium) || b.revenue - a.revenue);
  const family = (i: Incident): string => {
    const t = `${i.title} ${i.rca[0]?.cause ?? ''}`.toLowerCase();
    if (/optical|flapp|sfp|rx power/.test(t)) return 'Optical / physical layer';
    if (/unreachable|hang|power-cycle/.test(t)) return 'Device unreachable';
    if (/link down|links down|cable|patch/.test(t)) return 'Physical link failure';
    if (/ups|feed|psu|power supply|rectifier/.test(t)) return 'Power chain';
    if (/crah|cooling|compressor/.test(t)) return 'Cooling';
    if (/exhaust|budget|capacity|utilis/.test(t)) return 'Capacity pressure';
    if (/collector|discovery/.test(t)) return 'Discovery / tooling';
    return 'Other';
  };
  const causeMap = new Map<string, { n: number; sev1: number; conf: number; ids: string[] }>();
  open.forEach(i => { const f = family(i); const e = causeMap.get(f) ?? { n: 0, sev1: 0, conf: 0, ids: [] }; e.n++; if (i.sev <= 2) e.sev1++; e.conf += i.rca[0]?.confidence ?? 0; e.ids.push(i.id); causeMap.set(f, e); });
  const causes = [...causeMap.entries()].map(([label, e]) => ({ label, n: e.n, hot: e.sev1, confidence: Math.round(e.conf / e.n), ids: e.ids.slice(0, 3) })).sort((a, b) => b.n - a.n);
  const changeImplicated = open.filter(i => db.changes.some(c => c.dcId === i.dcId && c.windowEnd <= i.detected && c.windowEnd > i.detected - 3 * DAY)).map(i => i.id);
  type Rec = { rank: number; kind: 'approve' | 'run' | 'plan' | 'rma' | 'discover' | 'change'; title: string; why: string; benefit: string; to: string; ref: string };
  const recs: Rec[] = [];
  open.filter(i => i.sev <= 2).forEach(i => i.actions.filter(a => a.status === 'pending' || a.status === 'awaiting-approval').slice(0, 1).forEach(a => recs.push({ rank: i.sev === 1 ? 1 : 2, kind: a.disruptive ? 'approve' : 'run', title: a.step, why: `${i.id} · ${i.title}`, benefit: a.expected, to: `/incidents/${i.id}`, ref: i.id })));
  pendingChg.forEach(c => recs.push({ rank: c.emergency ? 1 : 3, kind: 'change', title: `Approve ${c.id}: ${c.title}`, why: `${c.risk} risk · window ${fmtWhenShort(c.windowStart)} · requested by ${c.requester}`, benefit: c.rollback ? `Rollback: ${c.rollback}` : '', to: `/changes?id=${c.id}`, ref: c.id }));
  const inc1 = open.find(i => i.similar);
  if (inc1) recs.push({ rank: 2, kind: 'rma', title: `Batch RMA for ${inc1.similar!.nodes.length + 1} nodes on the same optics lot`, why: inc1.similar!.text, benefit: 'Pre-empts the same failure on four PEs', to: `/incidents/${inc1.id}`, ref: inc1.id });
  const seen = new Set<string>();
  const recommendations = recs.sort((a, b) => a.rank - b.rank).filter(r => { const k = r.title.slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 5);
  /* next 7 days */
  const horizon = db.now + 7 * DAY;
  type Ev = { at: number; kind: 'deadline' | 'maintenance' | 'change' | 'test' | 'plan' | 'forecast'; label: string; sub: string; to: string; tone: string; overdue?: boolean };
  const upcoming: Ev[] = [];
  open.forEach(i => { const due = i.detected + i.resolveSlaMin * MIN; if (due <= horizon) upcoming.push({ at: Math.max(due, db.now - 6 * HOUR), kind: 'deadline', label: `${i.id} resolution due`, sub: `${sevLabel(i.sev)} · ${i.dcId} · ${i.title}`, to: `/incidents/${i.id}`, tone: due < db.now ? 'error' : 'warning', overdue: due < db.now }); });
  db.changes.filter(c => c.windowStart >= db.now - 6 * HOUR && c.windowStart <= horizon && !['Completed', 'Rolled back', 'Rejected'].includes(c.status)).forEach(c => upcoming.push({ at: c.windowStart, kind: c.kind === 'Maintenance' ? 'maintenance' : 'change', label: `${c.id} · ${c.kind === 'Maintenance' ? 'maintenance' : 'change'} window`, sub: `${c.dcId} · ${c.title} · ${c.status}`, to: `/changes?id=${c.id}`, tone: c.status === 'Pending approval' ? 'warning' : 'info' }));
  db.datacenters.filter(d => d.status !== 'planned').forEach(d => { const due = d.power.dg.lastTest + 30 * DAY; if (due >= db.now - 6 * HOUR && due <= horizon) upcoming.push({ at: due, kind: 'test', label: `${d.id} DG monthly test due`, sub: `${d.power.dg.kva} kVA · last ${fmtWhenShort(d.power.dg.lastTest)} · ${d.power.dg.result}`, to: `/facilities?dc=${d.id}`, tone: 'neutral' }); });
  upcoming.sort((a, b) => a.at - b.at);
  const dcMap = db.datacenters.filter(d => d.status !== 'planned').map(d => {
    const sm = summarize(d); const inc = open.filter(i => i.dcId === d.id);
    /* same rule as the Datacenters list / site page status */
    const condition: 'critical' | 'attention' | 'normal' = sm.worstSev === 1 || sm.facilityIssues.some(f => /on battery|fault/i.test(f)) || sm.edge.state === 'isolated' ? 'critical'
      : sm.openIncidents || sm.critAlerts || sm.linksDown || sm.unreachable || sm.facilityIssues.length || sm.edge.state !== 'redundant' ? 'attention' : 'normal';
    return { id: d.id, city: d.city, stateName: d.state, lat: d.lat, lng: d.lng, status: d.status, health: sm.healthScore, ne: sm.ne, coveragePct: sm.coveragePct, incidents: inc.length, worstSev: inc.length ? Math.min(...inc.map(i => i.sev)) : 0, breaching: inc.filter(i => i.sla.breaching).length, alerts: sm.activeAlerts, critAlerts: sm.critAlerts, powerPct: sm.powerCapKw ? Math.round((sm.powerKw / sm.powerCapKw) * 100) : 0, coolPct: Math.round((d.cooling.loadKw / d.cooling.capacityKw) * 100), facilityIssue: d.power.ups.some(u => u.state !== 'Online') || d.cooling.units.some(u => u.status === 'Failed'), services: sm.services, regionId: d.regionId, tier: d.tier, pue: sm.pue, load24h: d.power.load24h,
      /* for the command center's datacenter column (one DcCard per site) */
      condition, servicesDegraded: sm.servicesDegraded, customers: sm.customers, linksDown: sm.linksDown, unreachable: sm.unreachable, edge: sm.edge, facilityIssues: sm.facilityIssues };
  });
  /* inter-datacenter backhaul, one row per site pair (for the estate map) */
  const pairMap = new Map<string, { a: string; z: string; n: number; down: number }>();
  for (const l of lldp) {
    const da = db.neById.get(l.aNe)!.dcId, dz = db.neById.get(l.zNe)!.dcId;
    if (da === dz) continue;
    const [x, y] = da < dz ? [da, dz] : [dz, da];
    const e = pairMap.get(`${x}|${y}`) ?? { a: x, z: y, n: 0, down: 0 };
    e.n++; if (l.state === 'down') e.down++;
    pairMap.set(`${x}|${y}`, e);
  }
  const dcLinks = [...pairMap.values()];
  const regions = db.regions.map(r => { const ds = dcMap.filter(d => d.regionId === r.id); return { id: r.id, name: r.name, dcs: ds.length, onAir: ds.length, alerts: ds.reduce((a, d) => a + d.alerts, 0), incidents: ds.reduce((a, d) => a + d.incidents, 0), health: ds.length ? Math.round(ds.filter(d => d.status !== 'planned').reduce((a, d) => a + d.health, 0) / Math.max(1, ds.filter(d => d.status !== 'planned').length)) : 0, worstSev: ds.reduce((a, d) => (d.worstSev && (!a || d.worstSev < a) ? d.worstSev : a), 0) }; });
  const critical = open.filter(i => i.sev <= 2).sort((a, b) => a.sev - b.sev || Number(b.sla.breaching) - Number(a.sla.breaching) || a.sla.resolveLeft - b.sla.resolveLeft)
    .map(i => ({ id: i.id, title: i.title, sev: i.sev, status: i.status, type: i.type, dcId: i.dcId, city: dcOf(i.dcId)!.city, state: dcOf(i.dcId)!.state, tier: dcOf(i.dcId)!.tier, siteOpen: open.filter(x => x.dcId === i.dcId).length, siteHealth: summarize(dcOf(i.dcId)!).healthScore, owner: i.owner, detected: i.detected, acknowledged: i.acknowledged,
      sla: i.sla, resolveSlaMin: i.resolveSlaMin, impact: i.impact, cause: i.rca[0]?.cause ?? '', confidence: i.rca[0]?.confidence ?? 0,
      nextAction: i.actions.find(a => a.status !== 'done' && a.status !== 'rejected')?.step ?? null, awaitingApproval: i.actions.filter(a => a.disruptive && (a.status === 'pending' || a.status === 'awaiting-approval')).length }));
  const headline = (() => {
    const bits: string[] = [];
    const n1 = open.filter(i => i.sev === 1), n2 = open.filter(i => i.sev === 2);
    const sites = new Set([...n1, ...n2].map(i => i.dcId)).size;
    if (n1.length || n2.length) bits.push(`${[n1.length ? `${n1.length} critical` : '', n2.length ? `${n2.length} high` : ''].filter(Boolean).join(' and ')} incidents open across ${sites} datacenter${sites === 1 ? '' : 's'}`);
    if (breaching.length) bits.push(`${breaching.length} incidents past SLA`);
    if (exposedCustomers.filter(c => c.premium).length) bits.push(`${exposedCustomers.filter(c => c.premium).length} premium customers exposed`);
    if (overWarn.length) bits.push(`${overWarn.length} uplinks above 85%`);
    return bits.slice(0, 3).join(' · ') || 'No active operational risk';
  })();
  const revenueAtRisk = exposedSvc.reduce((a, x) => a + x.revenueMonthly, 0);

  return {
    /* 24 h hourly trends ending at the current value (deterministic mock telemetry history) */
    trends: (() => {
      const walk = (seed: number, end: number, spread: number, floor = 0) => { const r = mulberry32(seed); const out: number[] = []; let v = end; for (let h = 0; h < 24; h++) { out.unshift(Math.round(Math.max(floor, v) * 100) / 100); v = v + (r() - 0.55) * spread; } out[23] = end; return out; };
      const powerSum = Array.from({ length: 24 }, (_, h) => Math.round(liveDcs.reduce((a, d) => a + (d.power.load24h[h] ?? 0), 0)));
      return {
        open: walk(11, open.length, 2.2, 8), critMajor: walk(12, al.filter(a => a.severity === 'critical' || a.severity === 'major').length, 4, 15),
        linksDown: walk(13, linksDown.length, 1.6, 4), services: walk(14, degraded.length, 1.8, 3),
        availability: walk(15, Math.round((live.reduce((a, n) => a + n.icmp.availability, 0) / live.length) * 100) / 100, 0.03, 99.7).map(v => Math.min(100, v)),
        powerKw: powerSum
      };
    })(),
    situation: { n1: open.filter(i => i.sev === 1).length, n2: open.filter(i => i.sev === 2).length, critSites: new Set(open.filter(i => i.sev <= 2).map(i => i.dcId)).size, critBySite: [...open.filter(i => i.sev <= 2).reduce((m, i) => m.set(i.dcId, [...(m.get(i.dcId) ?? []), i.sev]), new Map<string, number[]>())].map(([id, sevs]) => ({ id, n1: sevs.filter(v => v === 1).length, n2: sevs.filter(v => v === 2).length })).sort((a, b) => b.n1 - a.n1 || (b.n1 + b.n2) - (a.n1 + a.n2) || a.id.localeCompare(b.id)), exposedServices: exposedSvc.length, headline, band: shi >= 85 && breaching.length === 0 ? 'Healthy' : shi >= 60 ? 'Watch' : 'Degraded', weakest, revenueAtRisk, exposedPremium: exposedCustomers.filter(c => c.premium).length, services: db.services.length, customers: db.customers.length, lldp: lldp.length },
    topIncidents, critical, svcStatus, exposedCustomers: exposedCustomers.slice(0, 12), exposedCustomerCount: exposedCustomers.length, causes, changeImplicated, recommendations, upcoming, dcMap, dcLinks, regions,
    pulse: { facilityAlarms, activeChanges: activeChanges.length, unreachable: unreachable.length, health, open: open.length, breaching: breaching.length, critMajor: al.filter(a => a.severity === 'critical' || a.severity === 'major').length, powerHeadroom: pw.headroom, linksDown: linksDown.length, servicesDegraded: degraded.length,
      pue: Math.round((s.filter(x => x.status !== 'planned').reduce((a, x) => a + x.pue, 0) / s.filter(x => x.status !== 'planned').length) * 100) / 100,
      availability: Math.round((live.reduce((a, n) => a + n.icmp.availability, 0) / live.length) * 100) / 100, mttrMin: Math.round(mttr), slaPct: resolved30.length ? Math.round((slaMet / resolved30.length) * 100) : 100,
      opexMonthly: s.reduce((a, x) => a + x.opexMonthly, 0), capexCommitted: s.reduce((a, x) => a + x.capexCommitted, 0), capexApproved: s.reduce((a, x) => a + x.capexApproved, 0),
      upsOk: ups.filter(u => u.state === 'Online').length, upsTotal: ups.length, coolingN1, liveDcs: db.datacenters.filter(d => d.status !== 'planned').length, rollout: rollout.length },
    domains: areas, shi, insights, attention, activity, estate: s, cap, exhaust,
    /* money view of the same situation: what is being lost, what is at stake, the next credit step */
    revenue: (() => { const r = revenue(); const losing = r.issues.filter(i => i.lost + i.credits + i.rate > 0), stake = [...r.issues].filter(i => i.mrrExposed > 0).sort((a, b) => b.mrrExposed - a.mrrExposed);
      return { base: r.base.mrr, total: r.total, sla: r.sla, issues: r.issues.length, top: losing[0] ?? null, stake: stake[0] ?? null, byDomain: r.byDomain.map(d => ({ domain: d.domain, impact: d.lost + d.credits, exposed: d.mrrExposed })) }; })()
  };
}

type AreaState = 'ok' | 'attention' | 'critical';
/* a datacenter carrying one of an area's issues: chip on the Command center's area row */
type AreaSite = { id: string; state: 'critical' | 'attention'; note: string; to: string; n: number };
const fmtWhenShort = (t: number) => { const d = new Date(t); const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return `${String(d.getDate()).padStart(2, '0')}-${M[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/* ---------------------------------------------------------------- topology */

/* The layered map shows the network fabric; hosts hang off their ToR and are
   counted, not drawn (a cloud hall would be hundreds of identical nodes). */
export function topology(dcId: string) {
  const all = db.nes.filter(n => n.dcId === dcId && n.discovery !== 'not-discovered');
  const nes = all.filter(n => NE_CATEGORY[n.role] === 'network');
  const ids = new Set(nes.map(n => n.id));
  const al = liveAlerts();
  const edges = db.links.filter(l => l.protocol === 'LLDP' && ids.has(l.aNe) && ids.has(l.zNe)).map(l => ({ id: l.id, a: l.aNe, z: l.zNe, state: l.state, util: l.utilPct }));
  const other = (l: Link) => (ids.has(l.aNe) ? l.zNe : l.aNe);
  const external = db.links.filter(l => l.protocol === 'LLDP' && (ids.has(l.aNe) !== ids.has(l.zNe)) && db.neById.get(other(l))!.dcId !== dcId).map(l => ({ id: l.id, local: ids.has(l.aNe) ? l.aNe : l.zNe, remote: other(l), state: l.state, util: l.utilPct }));
  const hostsOf = new Map<string, number>();
  for (const l of db.links) if (l.protocol === 'LLDP' && ids.has(l.aNe) !== ids.has(l.zNe)) { const h = db.neById.get(other(l))!; if (h.dcId === dcId && NE_CATEGORY[h.role] !== 'network') { const t = ids.has(l.aNe) ? l.aNe : l.zNe; hostsOf.set(t, (hostsOf.get(t) ?? 0) + 1); } }
  return { nodes: nes.map(n => ({ id: n.id, name: n.name, layer: n.layer, role: n.role, health: n.healthScore, reach: n.icmp.state !== 'critical', alarms: al.filter(a => a.neId === n.id).length, util: Math.max(0, ...(db.ifaces.get(n.id) ?? []).map(i => i.utilPct)), hosts: Math.round((hostsOf.get(n.id) ?? 0) / 2) })), edges, external, hosts: all.length - nes.length, tenantGear: all.filter(isOpaque).length };
}

/* ------------------------------------------------------------- mutations */

const audit_ = (e: Omit<AuditEntry, 'id' | 'at'>) => db.audit.push({ ...e, id: `AUD-${++db.seq.aud}`, at: db.now });
export const ME = 'Jayesh Verma';

export function ackAlert(id: string) { const a = db.alerts.find(x => x.id === id); if (a && a.state === 'active') { a.state = 'acknowledged'; a.ackBy = ME; audit_({ actor: ME, object: a.code, field: 'State', prev: 'active', next: 'acknowledged', source: 'Alerts console' }); changed(); } }

export function createIncidentFromAlerts(alertIds: string[]) {
  const as = alertIds.map(id => db.alerts.find(a => a.id === id)!).filter(Boolean);
  if (!as.length) return null;
  const top = as.reduce((a, b) => (sevRank(a.severity) <= sevRank(b.severity) ? a : b));
  const sev = top.severity === 'critical' ? 2 : top.severity === 'major' ? 3 : 4;
  const id = `INC-${String(++db.seq.inc).padStart(4, '0')}`;
  const neIds = [...new Set(as.map(a => a.neId).filter(Boolean))] as string[];
  const linkIds = [...new Set(as.map(a => a.linkId).filter(Boolean))] as string[];
  const im = impactOf(db, { neIds, linkIds });
  const inc: Incident = {
    id, title: `${top.title} — ${top.neId ?? top.dcId}`, type: top.source === 'Power' ? 'Power' : top.source === 'Cooling' ? 'Cooling' : 'Network', sev: sev as Incident['sev'], pri: sev as Incident['pri'], status: 'Open', owner: ME, reportedBy: ME, dcId: top.dcId,
    detected: db.now, acknowledged: db.now, responseSlaMin: RESPONSE_SLA[sev as 2], resolveSlaMin: RESOLVE_SLA[sev as 2], alertIds: as.map(a => a.id),
    affected: [...neIds.map(n => ({ kind: 'NE' as const, id: n, label: n })), ...linkIds.map(l => ({ kind: 'Link' as const, id: l, label: l }))],
    rca: [{ cause: `${top.title} on ${top.neId ?? top.dcId}${top.ifName ? ` ${top.ifName}` : ''} is the earliest correlated event`, confidence: 61, evidence: as.map(a => ({ label: `${a.code}: ${a.description}`, ref: a.id, at: a.start })) }, { cause: 'Upstream dependency fault', confidence: 39, evidence: [{ label: 'Not yet ruled out — check upstream links', ref: top.neId }] }],
    actions: [{ id: 'A1', step: 'Run diagnostics bundle (interfaces, optics, logs)', owner: 'NOC', expected: 'Evidence for RCA', rollback: 'n/a', verify: 'Bundle attached', disruptive: false, status: 'pending' }],
    changeIds: [], worklog: [{ at: db.now, who: ME, text: `Created from ${as.length} alert(s).`, kind: 'human' }], similar: null,
    impact: { services: im.services.length, customers: im.customers.length, premium: im.premium.length, revenueAtRisk: im.revenue, level: im.premium.length ? 'High' : im.services.length ? 'Medium' : 'Low', summary: im.services.length ? `${im.services.length} services on the affected scope.` : 'No customer service on the affected scope.' },
    verification: [{ check: 'All correlated alarms cleared', ok: null }, { check: 'Health checks green for 15 minutes', ok: null }, { check: 'Affected services back within SLA', ok: null }]
  };
  db.incidents.push(inc); as.forEach(a => { a.incidentId = id; if (a.state === 'active') a.state = 'acknowledged'; });
  changed();
  return id;
}

const FLOW: IncidentStatus[] = ['Open', 'Investigating', 'Mitigated', 'Resolved', 'Closed'];
export function advanceIncident(id: string) {
  const i = db.incidents.find(x => x.id === id); if (!i) return;
  const nx = FLOW[Math.min(FLOW.indexOf(i.status) + 1, FLOW.length - 1)];
  if (nx === 'Resolved' && i.verification.some(v => v.ok !== true)) return;
  if (!i.acknowledged) i.acknowledged = db.now;
  i.status = nx; if (nx === 'Resolved') i.resolved = db.now;
  i.worklog.push({ at: db.now, who: ME, text: `Status → ${nx}.`, kind: 'human' }); changed();
}
export function addWorklog(id: string, text: string) { const i = db.incidents.find(x => x.id === id); if (i && text.trim()) { i.worklog.push({ at: db.now, who: ME, text: text.trim(), kind: 'human' }); changed(); } }
export function setAction(incId: string, stepId: string, to: ActionStep['status']) {
  const i = db.incidents.find(x => x.id === incId); const s = i?.actions.find(a => a.id === stepId); if (!i || !s) return;
  s.status = to;
  i.worklog.push({ at: db.now, who: to === 'awaiting-approval' ? 'Opstral AI' : ME, text: `${s.step} — ${to.replace('-', ' ')}.`, kind: to === 'awaiting-approval' ? 'ai' : 'human' });
  if (to === 'done' && i.actions.every(a => a.status === 'done' || a.status === 'rejected')) i.worklog.push({ at: db.now, who: 'Opstral AI', text: 'All actions complete — run closure checks before resolving.', kind: 'ai' });
  changed();
}
export function runVerification(incId: string) {
  const i = db.incidents.find(x => x.id === incId); if (!i) return;
  const done = i.actions.length > 0 && i.actions.filter(a => a.status !== 'rejected').every(a => a.status === 'done');
  i.verification = i.verification.map((v, k) => ({ ...v, ok: done ? true : k === 2 ? false : v.ok === null ? (k === 1) : v.ok }));
  if (done) i.alertIds.forEach(aid => { const a = db.alerts.find(x => x.id === aid); if (a) a.state = 'cleared'; });
  i.worklog.push({ at: db.now, who: 'Closure check', text: done ? 'All post-action checks passed.' : 'Checks incomplete — actions still open.', kind: 'system' });
  changed();
}
export function hypothesisFeedback(incId: string, idx: number, ok: boolean) {
  const i = db.incidents.find(x => x.id === incId); if (!i) return;
  i.rca = i.rca.map((h, k) => (k === idx ? { ...h, rejected: !ok } : h)); i.feedback = ok ? 'confirmed' : 'rejected';
  i.worklog.push({ at: db.now, who: ME, text: `${ok ? 'Confirmed' : 'Rejected'} hypothesis: ${i.rca[idx].cause.slice(0, 80)}`, kind: 'human' }); changed();
}
export function raiseEmergencyChange(incId: string) {
  const i = db.incidents.find(x => x.id === incId)!;
  const id = `CHG-${++db.seq.chg}`;
  const scope = i.affected.filter(a => a.kind === 'NE').map(a => a.id);
  db.changes.push({ id, kind: 'Change', title: `Emergency: ${i.actions.find(a => a.disruptive)?.step ?? i.title}`, dcId: i.dcId, scope, risk: 'High', status: 'Pending approval', windowStart: db.now + 30 * MIN, windowEnd: db.now + 2 * HOUR, requester: ME, rollback: i.actions.find(a => a.disruptive)?.rollback ?? 'Per runbook', created: db.now, emergency: true, incidentId: incId });
  i.changeIds.push(id); i.worklog.push({ at: db.now, who: ME, text: `Raised emergency change ${id}.`, kind: 'human' }); changed();
  return id;
}

export function createChange(c: Omit<Change, 'id' | 'created' | 'status' | 'risk' | 'requester'>) {
  const id = `CHG-${++db.seq.chg}`;
  const im = changeImpact(c.scope, c.dcId);
  db.changes.push({ ...c, id, created: db.now, status: 'Pending approval', risk: im.risk, requester: ME }); changed(); return id;
}
const CFLOW: ChangeStatus[] = ['Draft', 'Pending approval', 'Approved', 'In progress', 'Completed'];
export function setChangeStatus(id: string, to?: ChangeStatus) {
  const c = db.changes.find(x => x.id === id); if (!c) return;
  const prev = c.status;
  c.status = to ?? CFLOW[Math.min(CFLOW.indexOf(c.status) + 1, CFLOW.length - 1)];
  if (c.status === 'Approved') c.approver = ME;
  audit_({ actor: ME, object: c.id, field: 'Status', prev, next: c.status, source: 'Change management' }); changed();
}

export function resolveRecon(taskId: string, decision: NonNullable<ReconTask['decision']>) {
  const t = db.recon.find(x => x.id === taskId); if (!t) return;
  const ne = db.neById.get(t.neId)!;
  const prev = ne.discovery;
  if (decision === 'accept-observed' && ne.drift) { ne.drift.forEach(d => { audit_({ actor: ME, object: ne.id, field: d.attr, prev: d.record, next: d.observed, source: 'Discovery', note: 'Accepted observed value' }); if (d.attr === 'OS version') ne.os = d.observed; if (d.attr === 'Serial number') ne.serial = d.observed; }); ne.drift = undefined; ne.duplicateSerialOf = undefined; ne.discovery = 'verified'; }
  else if (decision === 'keep-record' && ne.drift) { ne.drift.forEach(d => audit_({ actor: ME, object: ne.id, field: d.attr, prev: d.observed, next: d.record, source: 'Inventory record', note: 'Kept record; device to be corrected in the field' })); ne.drift = undefined; ne.duplicateSerialOf = undefined; ne.discovery = 'verified'; }
  else if (decision === 'collector-assigned') { ne.discovery = 'verified'; ne.ndReason = undefined; ne.lifecycle = 'Ready'; ne.lastSeen = db.now; audit_({ actor: ME, object: ne.id, field: 'Discovery', prev: 'not-discovered', next: 'verified', source: 'Collector assignment' }); seedTelemetry(ne); }
  else if (decision === 'not-applicable') { ne.ndReason = 'not-applicable'; audit_({ actor: ME, object: ne.id, field: 'Discovery reason', prev: 'planned', next: 'not applicable', source: 'Reconciliation' }); }
  else if (decision === 'retire') { ne.lifecycle = 'Decommissioning'; audit_({ actor: ME, object: ne.id, field: 'Lifecycle', prev: 'Planned', next: 'Decommissioning', source: 'Reconciliation', note: 'Record retired — asset not on site' }); }
  t.status = 'Resolved'; t.decision = decision; t.assignee = t.assignee ?? ME;
  void prev; changed();
}
function seedTelemetry(ne: NetworkElement) {
  ne.cpu = 22; ne.mem = 41; ne.tempC = 38; ne.uptimeMin = 3 * 1440; ne.lastReboot = db.now - 3 * DAY; ne.collector = `COL-${ne.dcId}-1`;
  ne.icmp = { lossPct: 0, latencyMs: 0.8, jitterMs: 0.2, availability: 100, state: 'healthy', hourly: Array(24).fill(true) };
  ne.ntp = { ...ne.ntp, offsetMs: 0.3, delayMs: 0.7, jitterMs: 0.4, lastSync: db.now - 5 * MIN, hourly: Array(24).fill(true) };
  ne.radius = { ...ne.radius, successPct: 100, failures24h: 0, lastAuth: db.now - 20 * MIN };
}
export function assignRecon(taskIds: string[], who: string) { db.recon.filter(t => taskIds.includes(t.id)).forEach(t => { t.assignee = who; if (t.status === 'Open') t.status = 'In progress'; }); changed(); }

export function runDiscovery(dcId: string) {
  /* mock collector sweep: devices waiting only on a collector are found */
  const found = db.nes.filter(n => n.dcId === dcId && n.discovery === 'not-discovered' && (n.ndReason === 'no-collector' || n.ndReason === 'collector-unavailable')).slice(0, 6);
  found.forEach(n => { const t = db.recon.find(x => x.neId === n.id && x.status !== 'Resolved'); if (t) resolveRecon(t.id, 'collector-assigned'); });
  const dc = dcOf(dcId); dc?.collectors.forEach(c => { c.state = 'up'; c.lastSeen = db.now; });
  db.alerts.filter(a => a.dcId === dcId && a.title === 'Collector Stale').forEach(a => { a.state = 'cleared'; });
  changed();
  return found.length;
}

export function createPlan(p: Omit<CapacityPlan, 'id' | 'status'>) { const id = `CAP-${String(++db.seq.plan).padStart(3, '0')}`; db.plans.push({ ...p, id, status: 'Submitted' }); changed(); return id; }

/* ------------------------------------------------------------ search */
export function search(q: string) {
  const s = q.trim().toLowerCase(); if (s.length < 2) return [];
  const out: { kind: string; id: string; label: string; sub: string; to: string }[] = [];
  db.datacenters.forEach(d => { if (`${d.id} ${d.city} ${d.address}`.toLowerCase().includes(s)) out.push({ kind: 'Datacenter', id: d.id, label: d.id, sub: `${d.city} · ${d.address}`, to: `/datacenters/${d.id}` }); });
  for (const n of db.nes) { if (out.length > 40) break; if (`${n.id} ${n.ip} ${n.serial}`.toLowerCase().includes(s)) out.push({ kind: 'Device', id: n.id, label: n.id, sub: `${n.role} · ${n.vendor} ${n.model}${n.ip ? ` · ${n.ip}` : ''}`, to: `/ne/${n.id}` }); }
  db.services.forEach(x => { if (x.id.toLowerCase().includes(s)) out.push({ kind: 'Service', id: x.id, label: x.id, sub: `${x.type} · ${db.customers.find(c => c.id === x.customerId)!.name}`, to: `/services/${x.id}` }); });
  db.customers.forEach(c => { if (`${c.id} ${c.name}`.toLowerCase().includes(s)) out.push({ kind: 'Customer', id: c.id, label: c.name, sub: `${c.id} · ${c.segment}`, to: `/customers/${c.id}` }); });
  db.incidents.forEach(i => { if (`${i.id} ${i.title}`.toLowerCase().includes(s)) out.push({ kind: 'Incident', id: i.id, label: i.id, sub: i.title, to: `/incidents/${i.id}` }); });
  db.alerts.forEach(a => { if (a.code.toLowerCase().includes(s)) out.push({ kind: 'Alert', id: a.id, label: a.code, sub: `${a.title} · ${a.neId ?? a.dcId}`, to: a.neId ? `/ne/${a.neId}?tab=alerts` : `/alerts?q=${a.code}` }); });
  db.changes.forEach(c => { if (`${c.id} ${c.title}`.toLowerCase().includes(s)) out.push({ kind: 'Change', id: c.id, label: c.id, sub: c.title, to: `/changes?id=${c.id}` }); });
  return out.slice(0, 30);
}

/* used by the Sentinel copilot */
/* physical last mile: rack PDUs + power cords, cooling coverage, structured cabling, single points of failure (mock/physical.ts) */
export const sitePhysical = (dcId: string) => sitePhysicalPublic(db, dcId);
export const devicePhysical = (neId: string) => devicePhysical_(db, neId);
export const cablePath = (linkId: string) => cablePath_(db, linkId);
export const whatIf = (dcId: string, assetId: string) => whatIf_(db, dcId, assetId);

/* Phase 2: environment & safety, asset lifecycle + RMA + spares, planned plant maintenance */
export const siteSafety = (dcId: string) => siteSafety_(db, dcId);
export const siteLifecycle = (dcId: string) => siteLifecycle_(db, dcId);
export const sitePm = (dcId: string) => sitePm_(db, dcId);
export function deviceLifecycle(neId: string) {
  const ne = db.neById.get(neId); if (!ne) return null;
  const s = siteLifecycle_(db, ne.dcId)!;
  return { life: s.assets.find(a => a.neId === neId)!, rmas: s.rmas.filter(r => r.neId === neId), spares: s.spares.filter(x => s.rmas.some(r => r.neId === neId && (x.part === r.part || x.part === `${r.vendor} power supply` && /Power supply/.test(r.part)))) };
}

/* Phase 3: operations process */
export const onCall = (dcId: string) => onCall_(db, dcId);
export const incidentOps = (id: string) => incidentOps_(db, id);
export const problems = () => problems_(db);
export const resilienceTests = (dcId: string) => resilienceTests_(db, dcId, edgeStatus(dcId));
export const colocationOrders = (q: { dcId?: string; customerId?: string } = {}) => colocationOrders_(db, q);

export function raw() { return db; }
export { isOpen, impactOf };
export type { Alert, Service };

/* ---- DCIM (P2B merge, phase 1): the inventory record, derived from the same entities (mock/dcim.ts) */
const dm = () => dcimModel(db);
export function dcim(q: { dcId?: string } = {}) {
  const m = dm(); const f = <T extends { dcId: string }>(xs: T[]) => (q.dcId ? xs.filter(x => x.dcId === q.dcId) : xs);
  return { sites: q.dcId ? m.sites.filter(x => x.id === q.dcId) : m.sites, halls: f(m.halls), rows: f(m.rows), racks: f(m.racks), panels: f(m.panels), feeds: f(m.feeds) };
}
export const dcimDevices = (q: { dcId?: string; rackId?: string; typeId?: string } = {}) => dm().devices.filter(d => (!q.dcId || d.dcId === q.dcId) && (!q.rackId || d.rackId === q.rackId) && (!q.typeId || d.typeId === q.typeId));
export const dcimCables = (q: { dcId?: string; kind?: 'Data' | 'Power'; deviceId?: string } = {}) => dm().cables.filter(c => (!q.dcId || c.dcId === q.dcId) && (!q.kind || c.kind === q.kind) && (!q.deviceId || c.aDevice === q.deviceId || c.zDevice === q.deviceId));
export const dcimTypes = () => ({ types: dm().types, modules: dm().modules, catalog: dcimCatalog_(db) });
export const dcimType = (id: string) => { const m = dm(); const t = m.typeById.get(id); if (!t) return null; const ne = db.nes.find(n => `${n.vendor} ${n.model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') === id); return { type: t, devices: m.devices.filter(d => d.typeId === id), modules: m.modules.filter(x => ne && x.fits.includes(ne.model)), sample: ne ? dcimComponents_(db, ne.id) : [] }; };
export const dcimRack = (id: string) => dcimRackView_(db, id);
export const dcimDevice = (id: string) => { const d = dm().deviceById.get(id); return d ? { device: d, components: dcimComponents_(db, id) } : null; };
export const dcimFreeSlots = (rackId: string) => freeSlots(db, rackId);

export function dcimCreateRack(x: { dcId: string; hallId: string; name: string; heightU: number; budgetKw: number; role: string }) {
  const dc = dcOf(x.dcId); const hall = dm().hallById.get(x.hallId);
  if (!dc || !hall) throw new Error('Unknown datacenter or hall');
  const name = x.name.trim().toUpperCase();
  if (!name) throw new Error('Give the rack a name');
  if (dc.racks.some(r => r.name === name)) throw new Error(`${name} already exists in ${dc.id}`);
  if (x.heightU < 20 || x.heightU > 52) throw new Error('Height must be 20–52 U');
  if (x.budgetKw <= 0 || x.budgetKw > 150) throw new Error('Power budget must be above 0 and at most 150 kW');
  const id = `${dc.id}-${name}`;
  dc.racks.push({ id, name, dcId: dc.id, floor: hall.floor, room: hall.name, role: x.role, heightU: x.heightU, usedU: 0, drawKw: 0, budgetKw: x.budgetKw, ports: 0, portsUsed: 0, tempC: dc.racks.find(r => r.room === hall.name)?.tempC ?? 23, owner: 'operator' });
  audit_({ actor: ME, object: id, field: 'rack', prev: '—', next: `created in ${hall.name} (${x.heightU}U, ${x.budgetKw} kW)`, source: 'DCIM' });
  changed();
  return id;
}

let plannedSeq = 0;
export function dcimInstallDevice(x: { rackId: string; typeId: string; name: string; u: number }) {
  const dc = db.datacenters.find(d => d.racks.some(r => r.id === x.rackId)); if (!dc) throw new Error('Unknown rack');
  const rk = dc.racks.find(r => r.id === x.rackId)!;
  const t = dm().typeById.get(x.typeId); if (!t) throw new Error('Unknown device type');
  const name = x.name.trim(); if (!name) throw new Error('Give the device a name');
  const id = `${dc.id}-${name.toUpperCase().replace(/[^A-Z0-9-]+/g, '-')}`;
  if (db.neById.has(id)) throw new Error(`${id} already exists`);
  const top = x.u + t.uHeight - 1;
  if (x.u < 1 || top > rk.heightU) throw new Error(`U${x.u}–U${top} does not fit a ${rk.heightU}U rack`);
  const slot = freeSlots(db, rk.id).find(s => x.u >= s.from && top <= s.to);
  if (!slot) throw new Error(`U${x.u}–U${top} is not free in ${rk.name}`);
  const slug = (n: NetworkElement) => `${n.vendor} ${n.model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const tpl = db.nes.find(n => slug(n) === x.typeId) ?? db.nes.find(n => n.role === t.role);
  if (!tpl) throw new Error('No template device for this type');
  const ne: NetworkElement = { ...structuredClone(tpl), id, name, dcId: dc.id, rackId: rk.id, u: x.u, uSize: t.uHeight, vendor: t.manufacturer, model: t.model,
    serial: `PLN${String(++plannedSeq).padStart(6, '0')}`, ip: '', mac: '', lifecycle: 'Planned', discovery: 'not-discovered', ndReason: 'planned', drift: undefined, duplicateSerialOf: undefined,
    lastSeen: undefined, collector: undefined, health: 'unknown', healthScore: 0, cpu: 0, mem: 0, tempC: 0, uptimeMin: 0, isPe: false, tenantId: undefined,
    modules: (slug(tpl) === x.typeId ? tpl.modules : []).map(m => ({ ...m, serial: '', state: 'OK' as const, tempC: 0 })) };
  db.nes.push(ne); db.neById.set(id, ne);
  db.ifaces.set(id, (slug(tpl) === x.typeId ? db.ifaces.get(tpl.id) ?? [] : []).map(i => ({ ...i, id: `${id}:${i.name}`, neId: id, state: 'reserved' as const, utilPct: 0, inErrors: 0, crcErrors: 0, flaps24h: 0, peer: undefined, optics: undefined, description: 'Planned' })));
  rk.usedU += t.uHeight;
  audit_({ actor: ME, object: id, field: 'device', prev: '—', next: `planned in ${rk.name} U${x.u} (${t.manufacturer} ${t.model})`, source: 'DCIM' });
  changed();
  return id;
}

export function dcimSetDeviceStatus(id: string, to: 'Active' | 'Maintenance' | 'Decommissioning') {
  const n = db.neById.get(id); if (!n) throw new Error('Unknown device');
  if (n.role === 'Tenant gear') throw new Error('Tenant equipment is managed by the tenant');
  const prev = n.lifecycle;
  n.lifecycle = to === 'Active' ? 'Ready' : to;
  audit_({ actor: ME, object: id, field: 'lifecycle', prev, next: n.lifecycle, source: 'DCIM' });
  changed();
}

export function dcimAddType(x: { manufacturer: string; model: string; role: NeRole; uHeight: number; psus: number; ports: { type: string; speedMbps: number; count: number }[] }) {
  const id = `${x.manufacturer} ${x.model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!x.manufacturer.trim() || !x.model.trim()) throw new Error('Manufacturer and model are required');
  if (dm().typeById.has(id)) throw new Error('This device type already exists');
  if (x.uHeight < 1 || x.uHeight > 20) throw new Error('Height must be 1–20 U');
  addCustomType({ id, manufacturer: x.manufacturer.trim(), model: x.model.trim(), role: x.role, category: NE_CATEGORY[x.role], uHeight: x.uHeight, fullDepth: x.uHeight >= 2 || NE_CATEGORY[x.role] !== 'network',
    airflow: 'Front to rear', weightKg: 0, typicalW: 0, psus: x.psus, platform: '—', ports: x.ports, mgmtPorts: 1, consolePorts: NE_CATEGORY[x.role] === 'network' ? 1 : 0, moduleBays: 0, devices: 0, sites: 0,
    description: `${x.uHeight}U ${x.role.toLowerCase()} · added to the catalogue`, custom: true });
  audit_({ actor: ME, object: id, field: 'device type', prev: '—', next: 'added', source: 'DCIM' });
  changed();
  return id;
}

/* ---- IP & Network (P2B merge, phase 2): the address plan derived from the estate (mock/ipam.ts) */
export function ipam(q: { dcId?: string } = {}) {
  const m = ipamModel(db);
  if (!q.dcId) return m;
  const f = <T extends { dcId?: string }>(xs: T[]) => xs.filter(x => x.dcId === q.dcId);
  const vrfIds = new Set(f(m.addresses).map(a => a.vrf));
  return { ...m, prefixes: f(m.prefixes), addresses: f(m.addresses), vrfs: m.vrfs.filter(v => v.dcId === q.dcId || (!v.dcId && vrfIds.has(v.id))), vlans: f(m.vlans), asns: m.asns.filter(a => !a.dcId || a.dcId === q.dcId),
    ranges: f(m.ranges), fhrp: f(m.fhrp), services: f(m.services), findings: f(m.findings) };
}
export const ipamOfDevice = (neId: string) => { const m = ipamModel(db); return { addresses: m.addresses.filter(a => a.deviceId === neId), services: m.services.filter(s => s.deviceId === neId), vlans: m.vlans.filter(v => v.serviceId && db.services.find(s => s.id === v.serviceId)?.neId === neId) }; };
export function ipamReserve(prefixId: string, note: string) { const a = reserveNextIp(db, prefixId, note); audit_({ actor: ME, object: a.address, field: 'ip', prev: '—', next: `reserved in ${a.vrf}${note ? ` (${note})` : ''}`, source: 'IPAM' }); changed(); return a; }
export function ipamCarve(parentId: string, mask: number, role: PrefixRole, description: string) { const p = carvePrefix(db, parentId, mask, role, description); audit_({ actor: ME, object: p.prefix, field: 'prefix', prev: '—', next: `reserved in ${p.vrf} (${role})`, source: 'IPAM' }); changed(); return p; }

/* ---- Planner (P2B merge, phase 4): design plans sized and checked against the estate (mock/planner.ts) */
export function planner() {
  const ps = planList(db);
  return { plans: ps.map(p => ({ ...p, eval: planEval(db, p) })), templates: PLAN_TEMPLATES, benchmarks: planBench() };
}
export function plannerPlan(id: string) {
  const p = planOf(db, id); if (!p) return null;
  return { plan: p, eval: planEval(db, p), scenarios: planScenarios(db, p), template: PLAN_TEMPLATES.find(t => t.scope === p.scope)!, capacityPlans: db.plans.filter(c => p.capacityPlanIds.includes(c.id)) };
}
export const plannerPreview = (x: PlanInput) => planEval(db, x);
export const plannerHalls = (dcId: string) => dcimModel(db).halls.filter(h => h.dcId === dcId).map(h => ({ ...h, free: freePositions(db, h.id) }));
export function plannerCreate(x: PlanInput) { const p = planCreate(db, x, ME); audit_({ actor: ME, object: p.id, field: 'plan', prev: '—', next: `created: ${p.name}`, source: 'Planner' }); changed(); return p.id; }
export function plannerUpdate(id: string, patch: Partial<PlanInput>) { planUpdate(db, id, patch, ME); changed(); }
export function plannerChoose(id: string, scen: string) { planChoose(db, id, scen, ME); changed(); }
export function plannerSubmit(id: string) { planSubmit(db, id, ME); audit_({ actor: ME, object: id, field: 'status', prev: 'Draft', next: 'In review', source: 'Planner' }); changed(); }
export function plannerDecide(id: string, approve: boolean, comment: string) { const p = planDecide(db, id, approve, ME, comment); audit_({ actor: ME, object: id, field: 'approval', prev: 'In review', next: p.status, source: 'Planner' }); changed(); }
export function plannerExecute(id: string) {
  const p = planOf(db, id); if (!p) throw new Error('Unknown plan');
  if (p.status !== 'Approved') throw new Error('Only an approved plan can be executed');
  const target = p.target;
  for (const l of executionLines(db, p)) {
    const cid = `CAP-${String(++db.seq.plan).padStart(3, '0')}`;
    db.plans.push({ id: cid, dcId: p.dcId, dimension: l.dimension, title: l.title, amount: l.amount, unit: l.unit, target, status: 'Executing', capex: l.capex });
    p.capacityPlanIds.push(cid);
  }
  /* racks of a rack expansion / AI pod are created in DCIM as empty cabinets in the hall */
  if ((p.scope === 'rack-expansion' || p.scope === 'ai-pod') && p.hallId) {
    const dc = dcOf(p.dcId)!;
    for (let i = 0; i < p.racks; i++) {
      const taken = new Set(dc.racks.map(r => r.name));
      let k = 0, name = '';
      do { name = `RACK-P${String(++k).padStart(2, '0')}`; } while (taken.has(name));
      const rid = dcimCreateRack({ dcId: p.dcId, hallId: p.hallId, name, heightU: 42, budgetKw: p.kwPerRack, role: p.scope === 'ai-pod' ? 'GPU' : 'Compute' });
      const rk = dc.racks.find(r => r.id === rid)!; if (p.cooling !== 'Air') { rk.liquid = true; if (p.scope === 'ai-pod') rk.density = 'ai'; }
      p.createdRacks.push(rid);
    }
  }
  p.status = 'Executing'; p.updated = db.now;
  p.history.push({ at: db.now, who: ME, text: `Execution started: ${p.capacityPlanIds.length} capacity plan${p.capacityPlanIds.length === 1 ? '' : 's'} raised${p.createdRacks.length ? `, ${p.createdRacks.length} racks created in DCIM` : ''}` });
  audit_({ actor: ME, object: id, field: 'status', prev: 'Approved', next: 'Executing', source: 'Planner' });
  changed();
}

/* ---- Delivery (P2B merge, phase 5): approved plans as projects (mock/delivery.ts) */
export function delivery() {
  const vs = deliveryProjects(db);
  return { projects: vs.map(v => v.project), workOrders: vs.flatMap(v => v.workOrders), pos: vs.flatMap(v => v.pos), tests: vs.flatMap(v => v.tests.map(t => ({ ...t, projectId: v.project.id, dcId: v.project.dcId, projectName: v.project.name }))),
    permits: vs.flatMap(v => v.permits), docs: vs.flatMap(v => v.docs), me: ME };
}
export const deliveryProject = (id: string) => deliveryProject_(db, id);
export function deliveryAdvanceWo(id: string) { const st = advanceWorkOrder(db, id, ME); audit_({ actor: ME, object: id, field: 'work order', prev: '—', next: st, source: 'Delivery' }); changed(); return st; }
export function deliveryRunTest(projectId: string, level: number) { runTest_(db, projectId, level, ME); audit_({ actor: ME, object: projectId, field: `L${level}`, prev: '—', next: 'Passed', source: 'Delivery' }); changed(); }
export function deliveryHandover(projectId: string) { handover_(db, projectId, ME); audit_({ actor: ME, object: projectId, field: 'handover', prev: 'Handover', next: 'Delivered', source: 'Delivery' }); changed(); }
export function deliveryReceivePo(id: string) { receivePo(db, id, ME); audit_({ actor: ME, object: id, field: 'goods receipt', prev: '—', next: 'Delivered', source: 'Delivery' }); changed(); }

/* ---- Change management (P2B merge, phase 6): one register over operations changes, maintenance and delivery CRs (mock/changemgmt.ts) */
export const changeMgmt = () => changeRegister(db);
export function changeRecord(id: string) {
  const r = changeRegister(db).changes.find(c => c.id === id); if (!r) return null;
  return { change: r, related: changeRegister(db).changes.filter(c => r.conflicts.includes(c.id)), freeze: changeRegister(db).freezes.find(f => f.id === r.freeze) ?? null, audit: db.audit.filter(a => a.object === id).sort((a, b) => b.at - a.at) };
}
/* an approver's decision on the current matrix step; the last step approves the change (delivery CRs follow their work order) */
export function decideChange(id: string, approve: boolean) {
  const r = changeRegister(db).changes.find(c => c.id === id); if (!r) throw new Error('Unknown change');
  if (r.source === 'Delivery') throw new Error('A delivery change request is approved through its work order in Delivery');
  if (r.status !== 'Pending approval') throw new Error('The change is not waiting for approval');
  if (approve && r.violations.some(v => v.enforcement === 'Block')) throw new Error(`Blocked by policy: ${r.violations.filter(v => v.enforcement === 'Block').map(v => v.text).join('; ')}`);
  if (!approve) { setChangeStatus(id, 'Rejected'); return; }
  const steps = r.approvals.filter(a => a.decision !== 'Pre-approved');
  const step = steps[stepsApproved(id)];
  approveStep(id);
  audit_({ actor: ME, object: id, field: 'approval', prev: step?.role ?? '—', next: 'approved', source: 'Change management' });
  if (stepsApproved(id) >= steps.length) setChangeStatus(id, 'Approved'); else changed();
}

/* ---- Compliance and Customization (P2B merge, phase 7) */
export const compliance = () => complianceView(db);
export const customization = () => customization_(db);
export function addCustomField(f: Parameters<typeof addField_>[0]) { addField_(f); audit_({ actor: ME, object: f.key, field: 'custom field', prev: '—', next: 'added', source: 'Customization' }); changed(); }
export function addTagDef(t: Parameters<typeof addTag_>[0]) { addTag_(t); audit_({ actor: ME, object: t.slug, field: 'tag', prev: '—', next: 'added', source: 'Customization' }); changed(); }
export const auditLog = () => [...db.audit].sort((a, b) => b.at - a.at);

