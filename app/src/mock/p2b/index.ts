/* The planner's record store (P2B Planner, merged 13-Oct-2026). One MockDB per generated estate: our estate adapted to the planner's
   records (adapter.ts), then P2B's own seed — site-type profiles, aspect modules, rule sets, demand profiles, the 14 plan templates
   and their variants, document and checklist templates, benchmarks — and its 15 demo plans placed on our datacenters (ctx.ts
   SITE_KEYS), with their place names, customers and carriers rewritten for the geography. The planner screens read and write this
   store; Delivery, Change management and Capacity read its executing plans and holds. Rebuilt when the persona or geography changes. */
import type { Db } from '../generate';
import { activeGeo } from '../geo';
import { MockDB } from './store';
import { adaptEstate } from './adapter';
import { Seed, SITE_KEYS } from './seed/ctx';
import { setRealism } from './seed/realism';
import { seedPlanner } from './seed/planner';
import { planAuditTrail } from './seed/plannerAudit';
import { castPeople } from '../../planner/compat/people';
import type * as T from '../../planner/p2b/types';
import { evaluate } from '../../planner/lib/engine';
import { baselineScenario } from '../../planner/lib/governance';
import { buildBom } from '../../planner/lib/outputs';
import { plannerDataFromSnapshot } from '../../planner/lib/plannerData';

let store: MockDB | null = null;
let builtFor: Db | null = null;
let serial = 0;
const listeners = new Set<() => void>();
/** any write to any planner store (and a rebuild) */
export const subscribePlanner = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const plannerStoreSerial = () => serial;
/** The estate the planner store was built from (Delivery's handle for the planner reads it). */
export const plannerDb = (): Db | null => builtFor;
/** Something the planner reads changed outside its store (Delivery's moves): planner screens re-read. */
export const notifyPlanner = () => { queueMicrotask(() => listeners.forEach(f => f())); };
export function resetPlanner2() { store = null; builtFor = null; }

export function p2bStore(db: Db): MockDB {
  if (store && builtFor === db) return store;
  builtFor = db;
  store = build(db);
  serial++;
  store.subscribe(() => listeners.forEach(f => f()));
  queueMicrotask(() => listeners.forEach(f => f()));
  return store;
}

type Climate = 'cold' | 'temperate' | 'hot-dry' | 'hot-humid';
function climateOf(lat: number, state: string, us: boolean): Climate {
  if (us) return lat >= 41 ? 'cold' : /arizona|nevada|texas|new mexico|utah/i.test(state) ? 'hot-dry' : lat < 31 ? 'hot-humid' : 'temperate';
  return /delhi|rajasthan|haryana|punjab|uttar|gujarat|madhya/i.test(state) ? 'hot-dry' : /karnataka|telangana/i.test(state) ? 'temperate' : 'hot-humid';
}

function build(db: Db): MockDB {
  const G = activeGeo();
  const us = G.id === 'us';
  castPeople({ id: G.id, people: G.people }, ['GRU', 'FRA', 'DUB', 'SIN', 'SYD']);
  const estate = adaptEstate(db);
  const S = new Seed(db.now, estate);
  S.geo = us ? 'us' : 'in';
  const climates: Record<string, Climate> = {};
  for (const key of Object.keys(SITE_KEYS)) {
    const dc = S.siteByKey(key); if (!dc) continue;
    S.dcCampus.set(dc.id, key);
    const ours = db.datacenters.find(d => d.id === dc.id);
    climates[key] = ours ? climateOf(ours.lat, ours.state, us) : 'temperate';
  }
  const hero = db.datacenters.find(d => d.id === S.siteByKey('ASH')?.id);
  setRealism(climates, Math.round((hero?.power.feeds.filter(f => f.type === 'AC')[0]?.capacityKw ?? 10_000) * 2.5));
  seedPlanner(S);
  localize(S, db);
  const out = new MockDB();
  const snap: Record<string, Record<string, unknown>[]> = { ...estate };
  for (const k of ['plannerTemplates', 'plannerBenchmarks', 'plannerPlans', 'plannerScenarios', 'plannerFeedback', 'programs', 'projects', 'boms', 'purchaseOrders', 'permits', 'designDocuments', 'maintenanceWindows', 'disposalCertificates', 'changeRequests', 'capacityReservations'] as const)
    snap[k] = (S as unknown as Record<string, Record<string, unknown>[]>)[k];
  for (const k of ['approvalDelegations', 'auditEvents', 'rackReservations', 'milestones', 'atps', 'hotos', 'demandRequests', 'contracts', 'vendors', 'cidrBlocks', 'ipAddresses', 'interfaces', 'cables', 'deviceComponents', 'virtualChassis', 'configBackups', 'powerPanels', 'powerFeeds', 'approvalMatrixRules', 'tasks', 'projectActivities', 'bomLines', 'purchaseOrderLines', 'processInstances', 'materials', 'planReviews', 'planReviewComments'])
    snap[k] ??= [];
  validate(snap, db.now);
  snap.auditEvents = [...snap.auditEvents, ...planAuditTrail(snap.plannerPlans as unknown as T.PlannerPlan[], snap.auditEvents as { id: string }[])];
  out.hydrate(snap);
  return out;
}

/* ------------------------------------------------------------------ approved plans pass every hard rule on OUR estate
   P2B shipped its demo plans as approved / executing on its own estate. Here the same rule the planner enforces at submission
   applies: a plan past review has no hard fail. A plan that only misses supplier lead times had its orders placed at approval, so
   its dates move out by the shortfall; anything else goes back to Draft with the reason, as P2B's in-site seed already does. */
function validate(snap: Record<string, Record<string, unknown>[]>, now: number) {
  const plans = snap.plannerPlans as unknown as T.PlannerPlan[];
  const tpls = snap.plannerTemplates as unknown as T.PlannerTemplate[], bms = snap.plannerBenchmarks as unknown as T.PlannerBenchmark[];
  const scns = snap.plannerScenarios as unknown as T.PlannerScenario[];
  const past = ['Approved', 'Executing', 'Completed'];
  const refreeze = refreezeWith(tpls, bms, scns, plannerDataFromSnapshot(snap));
  const run = (p: T.PlannerPlan) => evaluate(p, scns.find(x => x.id === (p.approvedScenarioId ?? p.preferredScenarioId)) ?? null, tpls, bms, undefined, plannerDataFromSnapshot(snap));
  for (const p of plans.filter(x => past.includes(x.status))) {
    let ev = run(p);
    const fails = () => ev.findings.filter(f => f.status === 'fail');
    const leadOnly = () => fails().length > 0 && fails().every(f => f.rule.id === 'R-SCH-01' || /lead|arrive/i.test(f.rule.title));
    for (let k = 0; k < 3 && leadOnly(); k++) {
      const shortDays = Math.ceil(Math.max(0, ...ev.schedule.filter(i => i.late).map(i => (now + (i.leadWeeks + (i.bufferWeeks ?? 0)) * 7 * 864e5 - new Date(i.needBy).getTime()) / 864e5))) + 21;
      shiftDates(p, shortDays, now);
      ev = run(p);
    }
    if (!fails().length) { refreeze(p); continue; }
    const reason = fails().map(f => `${f.rule.title}: ${f.detail}`).join(' · ');
    p.status = 'Draft'; p.approvals = []; p.approvalHistory = []; p.programId = undefined; p.processInstanceId = undefined; p.artefacts = undefined; p.baseline = undefined; p.conditions = undefined;
    p.risks = [...p.risks, { id: `R${p.risks.length + 1}`, title: 'Fails hard rules on the site as it is today', domain: 'Facility', probability: 'High', impact: 'High', owner: p.ownerName, mitigation: reason.slice(0, 600), source: 'actual', evidence: 'Evaluated against the estate records' }];
  }
}

/* The demo plans carry P2B's baseline figures, frozen on its estate. A plan that stays approved on ours is re-frozen on our estate
   (14-Oct-2026): its parameters as placed here (target hall, hall mode, density… set by the scope seeds) with the approved scenario, then
   the approved money from them, so the baseline, the plan pack, the bill of materials and Delivery's orders and budget agree. */
function refreezeWith(tpls: T.PlannerTemplate[], bms: T.PlannerBenchmark[], scns: T.PlannerScenario[], data: ReturnType<typeof plannerDataFromSnapshot>) {
  return (p: T.PlannerPlan) => {
    if (!p.baseline) return;
    const approved = scns.find(x => x.id === (p.approvedScenarioId ?? p.preferredScenarioId)) ?? null;
    const placed = evaluate(p, approved, tpls, bms, undefined, data);
    // the scope as placed too (PLN-0002 is the free positions of a hall, not P2B's 2 MW): design power, phases and go-live
    const phasesMoved = (p.baseline.phases ?? []).map(x => x.name).join('|') !== p.phases.map(x => x.name).join('|');
    p.baseline = { ...p.baseline, params: Object.fromEntries(Object.entries(placed.params).map(([k, v]) => [k, v.value])), designPowerKw: p.designPowerKw, targetGoLive: p.targetGoLive, phases: p.phases.map(x => ({ ...x })), ...(phasesMoved ? { schedule: [] } : {}) };
    const ev = evaluate(p, baselineScenario(p), tpls, bms, undefined, data);
    const contingency = ev.estimate.contingencyUsd ?? ev.estimate.capex.filter(l => /contingency/i.test(l.item)).reduce((a, l) => a + l.amount, 0);
    p.baseline = { ...p.baseline, capexTotal: ev.estimate.capexTotal, contingencyUsd: contingency, opexMonthly: ev.estimate.opexMonthly, bomTotal: buildBom(p, ev, bms).total, hardFails: ev.hardFails, softWarns: ev.softWarns, readinessPct: ev.readinessPct, schedule: p.baseline.schedule?.length ? p.baseline.schedule : ev.schedule.map(x => ({ item: x.item, orderBy: x.orderBy, needBy: x.needBy, phase: x.phase })) };
  };
}

/* ------------------------------------------------------------------ place names, customers and carriers for our estate */
function localize(S: Seed, db: Db) {
  const G = activeGeo();
  const us = G.id === 'us';
  const site = (k: string) => S.siteByKey(k);
  const ours = (k: string) => db.datacenters.find(d => d.id === site(k)?.id);
  const city = (k: string) => ours(k)?.city ?? k;
  const id = (k: string) => site(k)?.id ?? k;
  const regionName = (k: string) => db.regions.find(r => r.id === ours(k)?.regionId)?.name ?? G.short;
  const custAt = (k: string, i = 0) => { const ids = new Set(db.services.filter(s => s.dcId === id(k)).map(s => s.customerId)); const cs = db.customers.filter(c => ids.has(c.id)); return (cs.filter(c => c.premium)[i] ?? cs[i] ?? db.customers[i])?.name ?? 'Customer'; };
  const neighbour = (k: string) => db.datacenters.find(d => d.regionId === ours(k)?.regionId && d.id !== id(k) && d.status !== 'planned')?.city ?? city('ASH');
  const carriers = us ? ['Lumen', 'Zayo', 'AT&T'] : ['Tata Communications', 'Airtel Business', 'Jio Enterprise'];
  /* longest first, so "Dublin CO-1" is rewritten before "Dublin" */
  const pairs: [string, string][] = ([
    ['Frankfurt AI campus', `${city('FRA')} AI campus`], ['FRA-AI1', `${id('FRA').split('-')[0]}-AI-01`],
    ['Ashburn to Frankfurt DCI', `${id('ASH')} to ${id('FRA')} DCI`], ['Ashburn DC-1', id('ASH')], ['Ashburn campus', `${city('ASH')} campus`], ['ASH-DC2', `${id('ASH').split('-')[0]}-DC-0B`],
    ['Dallas HDC-1', id('DAL')], ['Singapore NC-1', id('SIN')], ['Dublin SR-1', id('DUB')], ['Dublin CO-1', id('DUB-CO1')], ['Dublin CO', id('DUB-CO1')],
    ['Sydney MTSO-1', id('SYD')], ['Frankfurt COLO-1', id('FRA')], ['Frankfurt Colo', id('FRA')], ['Frankfurt standard', `${city('FRA')} standard`], ['Frankfurt campus', `${city('FRA')} campus`],
    ['EU edge rollout', `${regionName('FRA')} edge rollout`], ['EU-EDGE-01…12', 'EDGE-01…12'], ['across Germany and Ireland', `across the ${regionName('FRA')} region`],
    ['EU private-cloud replication', 'Private-cloud replication'], ['LATAM capacity portfolio', `${regionName('GRU')} capacity portfolio`], ['in LATAM', `in ${regionName('GRU')}`],
    ['São Paulo', city('GRU')], ['Santiago', neighbour('GRU')], ['Chile and Argentina', 'the neighbouring states'],
    ['Quanta AI Labs (anchor customer)', `${custAt('FRA')} (anchor customer)`], ['Acme Financial', custAt('FRA', 1)],
    ['Telia Carrier', carriers[1]], ['Lumen', carriers[0]], ['Zayo', carriers[2]],
    ['City of Frankfurt', us ? `City of ${city('FRA')}` : `${city('FRA')} municipal corporation`], ['Transatlantic waves', 'Long-haul waves'], ['data centre', 'datacenter'], ['Data centre', 'Datacenter'], ['data centres', 'datacenters'], ['allowed by the EU variant', 'allowed by the regional variant'],
    ['Frankfurt', city('FRA')], ['Ashburn', city('ASH')], ['Dallas', city('DAL')], ['Singapore', city('SIN')], ['Sydney', city('SYD')], ['Dublin', city('DUB')],
  ] as [string, string][]).sort((a, b) => b[0].length - a[0].length);
  const fix = (s: string) => { let t = s; for (const [a, b] of pairs) if (t.includes(a)) t = t.split(a).join(b); return t; };
  const walk = (v: unknown, key = ''): unknown => {
    // ids, and the DCI route text the network seed builds from OUR site cities (a POP named Dallas must stay Dallas), are not rewritten
    if (typeof v === 'string') return /id$|Id$|^id$/.test(key) || key === 'sharedRiskGroups' || key === 'routeNotes' || key === 'providerName' ? v : fix(v);
    if (Array.isArray(v)) return v.map(x => walk(x, key));
    if (v && typeof v === 'object') { const o = v as Record<string, unknown>; for (const k of Object.keys(o)) o[k] = walk(o[k], k); return o; }
    return v;
  };
  for (const coll of [S.plannerPlans, S.plannerScenarios, S.plannerTemplates, S.programs, S.changeRequests, S.maintenanceWindows, S.permits, S.designDocuments] as unknown[][]) coll.forEach(r => walk(r));
  /* a plan on one of our sites takes that site's type (P2B named a type per demo campus) */
  for (const p of S.plannerPlans as T.PlannerPlan[]) { const dc = S.dataCenters.find(d => d.id === p.dataCenterId); if (dc?.dcTypeKey && p.scope !== 'new-dc' && p.scope !== 'edge') p.dcTypeKey = dc.dcTypeKey; }
}

/** Move every future date of a plan (go-live, phases, stage windows, permits, waves) out by `days`. */
const DATE_KEYS = new Set(['targetGoLive', 'goLive', 'windowStart', 'windowEnd', 'neededBefore', 'needBy', 'start', 'end', 'cutoverAt']);
function shiftDates(p: T.PlannerPlan, days: number, now: number) {
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== 'object') return;
    const r = o as Record<string, unknown>;
    for (const [k, v] of Object.entries(r)) {
      if (DATE_KEYS.has(k) && typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) && new Date(v).getTime() > now) r[k] = new Date(new Date(v).getTime() + days * 864e5).toISOString();
      else if (v && typeof v === 'object' && k !== 'approvals' && k !== 'approvalHistory') walk(v);
    }
  };
  walk(p);
}
