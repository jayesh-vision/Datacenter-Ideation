/* Planner seed · replace family (see src/modules/planner/lib/scopes/replace.ts).
   Inputs, rules and reference values for server refresh, network device refresh and rack
   replacement, and the scope data of their demo plans (PLN-0013, PLN-0014, PLN-0015).
   The seed only uses texts and reference values from the planner (no runtime), so it does not
   pull the planner's data layer into the seed. */
import type * as T from '../../../../planner/p2b/types';
import type { Seed } from '../ctx';
import type { BenchmarkSeed, ScopeSeed } from './types';
import { BENCH_DEFAULTS } from '../../../../planner/lib/replaceBench';
import { acceptanceText, rollbackText, PARALLEL, SWAP_METHODS, SWAP_TEXT, type SwapMethodName } from '../../../../planner/lib/replaceText';

type Scope = T.PlannerScope;
const P = (key: string, label: string, aspect: T.PlannerAspect, type: T.PlannerParamDef['type'], extra: Partial<T.PlannerParamDef> = {}): T.PlannerParamDef => ({ key, label, aspect, type, ...extra });
const R = (id: string, aspect: T.PlannerAspect, severity: T.PlannerRuleSeverity, title: string, check: string, extra: Partial<T.PlannerRuleDef> = {}): T.PlannerRuleDef => ({ id, aspect, severity, title, check, ...extra });
const SR: Scope = 'server-refresh', NR: Scope = 'network-refresh', RR: Scope = 'rack-replace';
const ALL: Scope[] = [SR, NR, RR];

/** Core rules that do not apply to work inside existing racks (site plant, fabric, staffing, whole-site benchmarks). */
const NOT_HERE = ['R-PWR-01', 'R-PWR-02', 'R-PWR-03', 'R-PWR-04', 'R-COOL-01', 'R-COOL-02', 'R-COOL-03', 'R-SPC-01', 'R-SPC-02', 'R-NET-01', 'R-NET-02', 'R-RES-01', 'R-SUS-01', 'R-FIN-01', 'R-SCH-02', 'R-OPS-01', 'R-CMS-01'];

const benchmarks: BenchmarkSeed[] = Object.entries(BENCH_DEFAULTS).filter(([m]) => m !== 'staffCostFte').map(([metric, b]) => ({ metric, label: b.label, category: b.category, unit: b.unit, value: b.value, source: b.source, indicative: true }));

export const replaceSeed: ScopeSeed = {
  params: {
    [SR]: [
      P('crewDevicesPerHour', 'Servers one crew swaps per hour', 'migration', 'number', { default: 4, min: 0.5, max: 20, help: 'Two-person crew: de-rack, rack, cable and power on. Sizes each wave.' }),
      P('cutoverWindowHours', 'Change window length', 'migration', 'number', { unit: 'h', default: 6, min: 1, max: 12 }),
      P('pilotWave', 'Start with a smaller pilot wave', 'migration', 'bool', { default: true }),
      P('racksPerWave', 'Most racks touched in one window', 'migration', 'number', { default: 4, min: 1, max: 40 }),
      P('costContingencyPct', 'Cost contingency', 'finance', 'number', { unit: '%', default: 10, min: 0, max: 50 }),
      P('licenceDeltaAnnualUsd', 'Licence change per year', 'finance', 'number', { unit: 'USD', default: 0, help: 'Positive when the new servers need fewer per-core or per-socket licences; negative when they need more' }),
    ],
    [NR]: [
      P('crewDevicesPerHour', 'Switches one crew cuts over per hour', 'migration', 'number', { default: 2, min: 0.5, max: 10, help: 'Rack beside the old switch, move links port by port, verify' }),
      P('cutoverWindowHours', 'Change window length', 'migration', 'number', { unit: 'h', default: 4, min: 1, max: 12 }),
      P('soakDays', 'Soak between side A and side B', 'migration', 'number', { unit: 'days', default: 7, min: 1, max: 30, help: 'The old switch stays racked for rollback until the soak ends' }),
      P('pilotWave', 'Start with a smaller pilot wave', 'migration', 'bool', { default: true }),
      P('racksPerWave', 'Most switches in one window', 'migration', 'number', { default: 6, min: 1, max: 40 }),
      P('upgradeUplinks', 'Move 40G uplinks to 100G', 'network', 'bool', { default: true, help: 'Changes the far-end spine ports and optics as well' }),
      P('costContingencyPct', 'Cost contingency', 'finance', 'number', { unit: '%', default: 10, min: 0, max: 50 }),
      P('opticsReusePct', 'Share of matching optics reused', 'network', 'number', { unit: '%', default: 90, min: 0, max: 100, help: 'Optics with the same form factor and speed; the rest are worn, old or unlabelled' }),
    ],
    [RR]: [
      P('crewDevicesPerHour', 'Devices one crew re-racks per hour', 'migration', 'number', { default: 6, min: 1, max: 20 }),
      P('cutoverWindowHours', 'Change window length', 'migration', 'number', { unit: 'h', default: 6, min: 1, max: 12 }),
      P('pilotWave', 'Start with a smaller pilot wave', 'migration', 'bool', { default: true }),
      P('racksPerWave', 'Most racks in one window', 'migration', 'number', { default: 2, min: 1, max: 20 }),
      P('swapMethod', 'How each rack is swapped (default)', 'migration', 'select', { options: SWAP_METHODS, default: 'Next free position in the row', help: 'Can be set per rack on the Space step' }),
      P('costContingencyPct', 'Cost contingency', 'finance', 'number', { unit: '%', default: 10, min: 0, max: 50 }),
      P('tenantNoticeDays', 'Notice to tenants', 'migration', 'number', { unit: 'days', default: 30, min: 0, max: 180, help: 'Premium tenants get at least 60 days' }),
    ],
  },
  rules: [
    ...([[SR, 'it'], [NR, 'network'], [RR, 'space']] as [Scope, T.PlannerAspect][]).map(([s, a]) => ({ rule: R('R-RPL-01', a, 'hard', 'Selected equipment is not held by another plan or an open change', 'rpl-selection-free'), scopes: [s] })),
    ...([[SR, 'it'], [NR, 'network']] as [Scope, T.PlannerAspect][]).map(([s, a]) => ({ rule: R('R-RPL-02', a, 'hard', 'Every old model and role has a current catalogue model', 'rpl-mapping', { standard: 'Approved catalogue' }), scopes: [s] })),
    { rule: R('R-RPL-02', 'space', 'hard', 'The new rack model is in the rack type catalogue', 'rpl-mapping'), scopes: [RR] },
    { rule: R('R-RPL-03', 'power', 'hard', 'Rack power after the swap within the rack rating and 80% of each feed', 'rpl-rack-power', { standard: 'Breaker continuous-load derating (80%)' }), scopes: ALL },
    { rule: R('R-RPL-04', 'space', 'hard', 'Every new unit has a position; space and weight within the rack limits', 'rpl-rack-space'), scopes: [SR] },
    { rule: R('R-RPL-04', 'migration', 'hard', 'Every new switch has a position beside the old one or in its place', 'rpl-rack-space'), scopes: [NR] },
    { rule: R('R-RPL-04', 'space', 'hard', 'The new rack fits the position, the row containment and the floor', 'rpl-rack-space'), scopes: [RR] },
    { rule: R('R-RPL-05', 'migration', 'hard', 'Critical services keep running: a parallel run or the redundant partner, and a rollback', 'rpl-critical-parallel'), scopes: [SR, NR] },
    { rule: R('R-RPL-06', 'migration', 'hard', 'The two members of a redundant pair are never in the same wave', 'wave-ha-split'), scopes: ALL },
    { rule: R('R-RPL-07', 'migration', 'hard', 'Each wave fits one change window at the crew rate', 'wave-fits-window'), scopes: ALL },
    { rule: R('R-RPL-08', 'migration', 'hard', 'No clash with maintenance windows or open changes on the same equipment', 'wave-clash'), scopes: ALL },
    { rule: R('R-RPL-09', 'migration', 'hard', 'Everything selected is in exactly one wave', 'wave-coverage'), scopes: ALL },
    { rule: R('R-RPL-10', 'migration', 'hard', 'Side B of each pair goes after side A and the soak period', 'wave-ab-soak'), scopes: [NR] },
    { rule: R('R-RPL-11', 'migration', 'soft', 'Every wave states its acceptance test and rollback', 'wave-acceptance'), scopes: ALL },
    { rule: R('R-RPL-12', 'network', 'soft', 'New servers\' network ports fit the leaf switches', 'rpl-nic-fit'), scopes: [SR] },
    { rule: R('R-RPL-20', 'network', 'hard', 'Every used port has a compatible port on the new model', 'net-port-fit'), scopes: [NR] },
    { rule: R('R-RPL-21', 'network', 'soft', 'Far-end port changes are listed and priced', 'net-far-end'), scopes: [NR] },
    { rule: R('R-RPL-22', 'power', 'soft', 'The new switch\'s airflow suits each rack', 'net-airflow'), scopes: [NR] },
    { rule: R('R-RPL-23', 'network', 'soft', 'A configuration backup exists for every switch', 'net-config-backup'), scopes: [NR] },
    { rule: R('R-RPL-30', 'power', 'hard', 'Outlets on the new power strips cover every power port', 'rack-outlets'), scopes: [RR] },
    { rule: R('R-RPL-31', 'migration', 'hard', 'Every tenant has consented, with notice served before their wave', 'rack-consent'), scopes: [RR] },
    { rule: R('R-RPL-32', 'migration', 'soft', 'Cross-connects to re-patch are listed with the carrier', 'rack-xconnect'), scopes: [RR] },
  ],
  // Core inputs that describe a site's plant or fabric, or are replaced by the family's own (schedule contingency → cost contingency).
  exclude: { [SR]: ['uplinkGbps', 'refreshYears', 'contingencyPct'], [NR]: ['uplinkGbps', 'contingencyPct'], [RR]: ['floorLoadingKgPerRack', 'redundancy', 'contingencyPct'] },
  dropRules: { [SR]: NOT_HERE, [NR]: NOT_HERE, [RR]: NOT_HERE },
  aspects: { [NR]: { it: 'skipped', security: 'skipped', power: 'summary' }, [RR]: { cooling: 'skipped' } },
  outputs: {
    [SR]: ['Old-to-new device list', 'Rack power and space after the swap', 'Wave schedule and cut-over runbook', 'Customer notification list', 'Bill of materials and business case', 'Closure checklist'],
    [NR]: ['Old-to-new device list', 'Port map and patch list per wave', 'Optics and far-end changes', 'Wave schedule and cut-over runbook', 'Bill of materials and running cost', 'Closure checklist'],
    [RR]: ['Rack swap list', 'Outlet plan and rack power', 'Tenant consent register', 'Wave schedule and cut-over runbook', 'Bill of materials', 'Closure checklist'],
  },
  benchmarks,
  enrich(S, plans) { enrichReplace(S, plans); },
};

/* ================================================================== demo plans */
const DAY = 864e5;
const NIGHTS = [2, 3, 4, 6];
const OPEN: T.ChangeRequest['status'][] = ['Submitted', 'UnderReview', 'Approved', 'Scheduled', 'InProgress'];
/** Next change night (22:00 UTC) after `from` with no live maintenance window at the site and no open change on these items. */
function nextNight(S: Seed, dcId: string, ids: string[], from: number, hours: number, taken: number[]): { start: string; end: string; at: number } {
  const d = new Date(from); d.setUTCHours(22, 0, 0, 0); if (d.getTime() < from) d.setUTCDate(d.getUTCDate() + 1);
  for (let i = 0; i < 200; i++, d.setUTCDate(d.getUTCDate() + 1)) {
    if (!NIGHTS.includes(d.getUTCDay())) continue;
    const t0 = d.getTime(), t1 = t0 + hours * 3600e3;
    if (taken.some(t => Math.abs(t - t0) < 12 * 3600e3)) continue;
    const win = S.maintenanceWindows.some(w => w.dataCenterId === dcId && (w.status === 'Scheduled' || w.status === 'In Progress') && new Date(w.scheduledStart).getTime() < t1 && t0 < new Date(w.scheduledEnd).getTime());
    const chg = S.changeRequests.some(c => OPEN.includes(c.status) && (c.affectedResourceIds ?? []).some(x => ids.includes(x)) && c.scheduledStart && new Date(c.scheduledStart).getTime() < t1 && t0 < new Date(c.scheduledEnd ?? c.scheduledStart).getTime() + 1);
    if (!win && !chg) return { start: new Date(t0).toISOString(), end: new Date(t1).toISOString(), at: t0 };
  }
  return { start: d.toISOString(), end: new Date(d.getTime() + hours * 3600e3).toISOString(), at: d.getTime() };
}
/** Phases mirroring the waves, shares summing to `kw`. */
function phases(waves: T.PlannerWave[], kw: number): T.PlannerPhase[] {
  const w = waves.map(x => Math.max(0.001, x.itKw ?? x.deviceIds.length)); const sum = w.reduce((a, b) => a + b, 0); let left = Math.round(kw);
  return waves.map((x, i) => { const v = i === waves.length - 1 ? left : Math.round((kw * w[i]) / sum); left -= v; return { id: x.id, name: x.name, goLive: x.windowEnd, itKw: v, halls: 0, racks: x.rackIds.length, status: 'Planned' as const }; });
}
const critOf = (S: Seed, ids: string[]) => new Set(S.services.filter(s => s.critical && s.status !== 'Disabled').flatMap(s => [s.deviceId, ...(s.pathDeviceIds ?? [])]).filter((d): d is string => !!d && ids.includes(d)));
const svcOf = (S: Seed, ids: string[]) => S.services.filter(s => s.status !== 'Disabled' && ((s.deviceId && ids.includes(s.deviceId)) || (s.pathDeviceIds ?? []).some(p => ids.includes(p)))).map(s => s.id);
const rackName = (S: Seed, id?: string) => S.racks.find(r => r.id === id)?.name ?? '';

function enrichReplace(S: Seed, plans: T.PlannerPlan[]) {
  /* the demo plans of each family (PLN-0013…0015; every persona has servers since 15-Oct-2026 — the telco and colocation operators'
     own servers — so every persona has the server refresh. A site without previous-generation servers would have none, and the
     network and rack plans would move up one number) */
  const demo = (scope: Scope) => plans.find(p => p.scope === scope && !!p.params.affectedIds);
  const sr = demo(SR), nr = demo(NR), rr = demo(RR);
  /** When the n-th unit of a model can be on site: free stock first (about a week), then a purchase at the benchmark's longest lead, plus a week to stage. */
  const ready = (model: string, n: number, leadItem: string) => {
    const free = S.devices.filter(d => d.model === model && !d.rackId && (d.lifecycleState === 'Staged' || d.lifecycleState === 'Received') && !String(d.notes ?? '').startsWith('Reserved for')).length;
    const b = S.plannerBenchmarks.find(x => x.metric === `leadWeeks:${leadItem}`);
    return S.now + (n <= free ? 10 : Math.round((b?.high ?? b?.value ?? 12) * 7) + 7) * DAY;
  };
  const model = (m: string) => S.assetModels.find(a => a.model === m);
  const set = (p: T.PlannerPlan, params: Record<string, number | string | boolean>) => { p.params = { ...p.params, ...params }; for (const k of Object.keys(params)) p.paramSources = { ...p.paramSources, [k]: p.paramSources[k] ?? 'user' }; };

  if (sr && sr.dataCenterId) {
    const ids = String(sr.params.affectedIds).split(',');
    const devs = ids.map(id => S.devices.find(d => d.id === id)).filter((d): d is T.Device => !!d);
    const ratio = 2;
    /* one mapping row per old model (the estate's previous generation), all consolidated onto the R760 */
    const newOf = (_d: T.Device) => 'PowerEdge R760';
    const groups = new Map<string, T.Device[]>(); for (const d of devs) groups.set(d.model ?? 'Unknown model', [...(groups.get(d.model ?? 'Unknown model') ?? []), d]);
    sr.mapping = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([oldModel, ds]) => {
      const nm = newOf(ds[0]); const am = model(nm); const units = Math.ceil(ds.length / ratio);
      return { id: `${oldModel}|server`, oldModel, role: 'Server', count: ds.length, newModel: nm, ratio, disposition: 'dispose' as const, newUnits: units, newKw: Math.round((units * (am?.typicalPowerW ?? 800)) / 100) / 10, oldKw: Math.round(ds.reduce((a, d) => a + (d.powerDrawW ?? 420), 0) / 100) / 10 };
    });
    const oldKw = Math.round(devs.reduce((a, d) => a + (d.powerDrawW ?? 420), 0) / 100) / 10;
    const newKw = Math.round(sr.mapping.reduce((a, m) => a + m.newKw, 0) * 10) / 10;
    set(sr, { selectionCriteria: JSON.stringify({ reasons: ['eol'], years: 5 }), affectedSiteId: sr.dataCenterId, affectedKw: Math.round(oldKw), crewDevicesPerHour: 4, cutoverWindowHours: 6, pilotWave: true, racksPerWave: 4, licenceDeltaAnnualUsd: 0, migrationApproach: 'Rolling, rack by rack' });
    // Waves by rack: a pilot of one rack, then up to four racks or 24 servers per window (4 per hour × 6 h).
    const crit = critOf(S, ids);
    const byRack = new Map<string, T.Device[]>(); for (const d of devs) byRack.set(d.rackId!, [...(byRack.get(d.rackId!) ?? []), d]);
    const racks = [...byRack.keys()].sort((a, b) => rackName(S, a).localeCompare(rackName(S, b)));
    /* device bins rack by rack: a pilot of at most 8 servers in one rack, then at most 24 servers (4 per hour × 6 h) in at most 4 racks;
       a rack holding more old servers than a window takes is split over consecutive waves */
    /* the two halves of a redundant pair (two selected servers on one service path) never share a wave */
    const partner = new Map<string, Set<string>>();
    for (const sv of S.services) { const on = (sv.pathDeviceIds ?? []).filter(d => ids.includes(d)); for (const x of on) for (const y of on) if (x !== y) partner.set(x, (partner.get(x) ?? new Set()).add(y)); }
    /* … nor do the two halves of a naming pair (NMS-01 / NMS-02, as rule R-RPL-06 reads them: the telco and colocation operator servers carry no
       customer service, so their pairs show only in their names) */
    const stem = (n: string) => n.replace(/[-_]?(0?1|0?2|a|b)$/i, '');
    const named = new Map<string, string[]>();
    for (const d of devs) if (/[-_](0?[12]|[ab])$/i.test(d.name ?? '')) { const k = `${d.category}|${stem(d.name!)}`; named.set(k, [...(named.get(k) ?? []), d.id]); }
    for (const [x, y] of [...named.values()].filter(m => m.length === 2)) { partner.set(x, (partner.get(x) ?? new Set()).add(y)); partner.set(y, (partner.get(y) ?? new Set()).add(x)); }
    const bins: { ids: string[]; racks: string[] }[] = [];
    const capOf = (i: number) => (i === 0 ? 8 : 24), maxRacks = (i: number) => (i === 0 ? 1 : 4);
    for (const r of racks) for (const d of byRack.get(r)!) {
      let i = bins.findIndex((b, k) => b.ids.length < capOf(k) && (b.racks.includes(r) || b.racks.length < maxRacks(k)) && !b.ids.some(x => partner.get(d.id)?.has(x)));
      if (i < 0) { bins.push({ ids: [], racks: [] }); i = bins.length - 1; }
      bins[i].ids.push(d.id); if (!bins[i].racks.includes(r)) bins[i].racks.push(r);
    }
    let from = S.now + 14 * DAY; const taken: number[] = []; const need = new Map<string, number>();
    sr.waves = bins.map(({ ids: dids, racks: rs }, i) => {
      const par = dids.some(d => crit.has(d));
      for (const d of dids) { const nm = newOf(devs.find(x => x.id === d)!); need.set(nm, (need.get(nm) ?? 0) + 1 / ratio); from = Math.max(from, ready(nm, Math.ceil(need.get(nm)!), 'General servers')); }
      const win = nextNight(S, sr.dataCenterId!, dids, from, 6, taken); taken.push(win.at); from = win.at + (i === 0 ? 7 : 2) * DAY;
      return { id: `W-${i + 1}`, name: i === 0 ? 'Pilot wave' : `Wave ${i + 1}`, order: i + 1, kind: i === 0 ? 'pilot' : 'wave', deviceIds: dids, rackIds: rs, serviceIds: svcOf(S, dids), targetRackIds: rs, method: par ? PARALLEL : 'Rolling, rack by rack', windowStart: win.start, windowEnd: win.end, crewHours: Math.min(6, Math.ceil(dids.length / 4)), rollback: rollbackText(SR, { parallel: par }), acceptance: acceptanceText(SR), status: 'Planned', itKw: Math.round((newKw * dids.length / devs.length) * 10) / 10 } satisfies T.PlannerWave;
    });
    sr.designPowerKw = Math.max(1, Math.round(newKw)); sr.phases = phases(sr.waves, sr.designPowerKw); sr.targetGoLive = sr.waves[sr.waves.length - 1].windowEnd;
  }

  if (nr && nr.dataCenterId) {
    const ids = String(nr.params.affectedIds).split(',');
    const devs = ids.map(id => S.devices.find(d => d.id === id)).filter((d): d is T.Device => !!d).sort((a, b) => a.name.localeCompare(b.name));
    const am = model('7050X3-48YC8');
    const oldKw = Math.round(devs.reduce((a, d) => a + (d.powerDrawW ?? 180), 0) / 100) / 10; const newKw = Math.round((devs.length * (am?.typicalPowerW ?? 450)) / 100) / 10;
    /* one mapping row per old model (the estate's previous-generation leaf / ToR switches), all onto the Arista 7050X3 */
    const groups = new Map<string, T.Device[]>(); for (const d of devs) groups.set(d.model ?? 'Unknown model', [...(groups.get(d.model ?? 'Unknown model') ?? []), d]);
    nr.mapping = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([oldModel, ds]) => ({ id: `${oldModel}|leaf`, oldModel, role: 'Leaf / ToR switch', count: ds.length, newModel: '7050X3-48YC8', ratio: 1, disposition: 'dispose' as const, newUnits: ds.length, newKw: Math.round((ds.length * (am?.typicalPowerW ?? 450)) / 100) / 10, oldKw: Math.round(ds.reduce((a, d) => a + (d.powerDrawW ?? 180), 0) / 100) / 10 }));
    set(nr, { selectionCriteria: JSON.stringify({ reasons: ['eol'], years: 5 }), affectedSiteId: nr.dataCenterId, affectedKw: Math.round(oldKw), crewDevicesPerHour: 2, cutoverWindowHours: 4, soakDays: 7, pilotWave: true, racksPerWave: 6, upgradeUplinks: true, opticsReusePct: 90 });
    // Pairs: two switches of the model in one rack. A sides first, a 7-day soak, then B sides.
    const side = new Map<string, 'A' | 'B'>();
    const byRack = new Map<string, T.Device[]>(); for (const d of devs) byRack.set(d.rackId!, [...(byRack.get(d.rackId!) ?? []), d]);
    for (const list of byRack.values()) list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).forEach((d, i) => side.set(d.id, i % 2 === 0 ? 'A' : 'B'));
    const bins: { side: 'A' | 'B'; ids: string[] }[] = [];
    for (const s of ['A', 'B'] as const) { const list = devs.filter(d => side.get(d.id) === s).map(d => d.id); let first = s === 'A'; for (let i = 0; i < list.length;) { const n = first ? 2 : 6; bins.push({ side: s, ids: list.slice(i, i + n) }); i += n; first = false; } }
    let from = S.now + 21 * DAY; const taken: number[] = []; let lastA = 0; let need = 0;
    nr.waves = bins.map((b, i) => {
      if (b.side === 'B' && lastA && from < lastA + 7 * DAY) from = lastA + 7 * DAY;
      need += b.ids.length; from = Math.max(from, ready('7050X3-48YC8', need, 'Spine / leaf switches'));
      const win = nextNight(S, nr.dataCenterId!, b.ids, from, 4, taken); taken.push(win.at); if (b.side === 'A') lastA = win.at + 4 * 3600e3; from = win.at + (i === 0 ? 7 : 2) * DAY;
      return { id: `W-${i + 1}`, name: `${i === 0 ? 'Pilot wave' : `Wave ${i + 1}`} · side ${b.side}`, order: i + 1, kind: i === 0 ? 'pilot' : 'wave', deviceIds: b.ids, rackIds: [...new Set(b.ids.map(id => S.devices.find(d => d.id === id)?.rackId).filter((x): x is string => !!x))], serviceIds: svcOf(S, b.ids), side: b.side, method: `Side ${b.side}: new switch racked beside the old one, links moved port by port while the partner carries the traffic`, windowStart: win.start, windowEnd: win.end, crewHours: Math.min(4, Math.ceil(b.ids.length / 2)), rollback: rollbackText(NR, { side: b.side, soakDays: 7 }), acceptance: acceptanceText(NR, 7), status: 'Planned', itKw: Math.round((newKw * b.ids.length / devs.length) * 10) / 10 } satisfies T.PlannerWave;
    });
    nr.designPowerKw = Math.max(1, Math.round(newKw)); nr.phases = phases(nr.waves, nr.designPowerKw); nr.targetGoLive = nr.waves[nr.waves.length - 1].windowEnd;
  }

  if (rr && rr.dataCenterId) {
    const rackIds = String(rr.params.affectedIds).split(',');
    const racks = rackIds.map(id => S.racks.find(r => r.id === id)).filter((r): r is T.Rack => !!r);
    const live = (rid: string) => S.devices.filter(d => d.rackId === rid && d.lifecycleState !== 'Retired' && d.lifecycleState !== 'Disposed');
    const freeInRow = (r: T.Rack) => S.racks.filter(x => x.rowId === r.rowId && x.id !== r.id && x.status === 'Planned' && !x.currentPowerKw && !live(x.id).length);
    const used = new Set<string>(); const methods: Record<string, SwapMethodName> = {};
    for (const r of racks) { const f = freeInRow(r).find(x => !used.has(x.id)); if (f) { used.add(f.id); methods[r.id] = 'Next free position in the row'; } else methods[r.id] = 'Temporary rack'; }
    const kw = Math.round(racks.reduce((a, r) => a + r.currentPowerKw, 0));
    set(rr, { selectionCriteria: JSON.stringify({ reasons: [], years: 5, rackReasons: ['old-type', 'damaged'] }), affectedSiteId: rr.dataCenterId, affectedKw: kw, affectedDevices: racks.reduce((a, r) => a + live(r.id).length, 0), crewDevicesPerHour: 6, cutoverWindowHours: 6, pilotWave: true, racksPerWave: 2, swapMethod: 'Next free position in the row', tenantNoticeDays: 30, ...Object.fromEntries(Object.entries(methods).filter(([, m]) => m !== 'Next free position in the row').map(([id, m]) => [`swap:${id}`, m])) });
    // Tenants: rack owners and the customers of services in the racks; the first two notified, none consented yet.
    const owners = new Map<string, { name: string; cust?: T.Customer; svc: string[] }>();
    for (const r of racks) {
      if (r.owner) { const cust = S.customers.find(c => c.name === r.owner); const k = cust?.id ?? r.owner; owners.set(k, owners.get(k) ?? { name: cust?.name ?? r.owner, cust, svc: [] }); }
      for (const s of S.services.filter(x => x.status !== 'Disabled' && (x.rackId === r.id || live(r.id).some(d => d.id === x.deviceId || (x.pathDeviceIds ?? []).includes(d.id))))) { const cust = S.customers.find(c => c.id === s.customerRef); const k = cust?.id ?? s.customerRef; const e = owners.get(k) ?? { name: cust?.name ?? s.customerRef, cust, svc: [] }; if (!e.svc.includes(s.id)) e.svc.push(s.id); owners.set(k, e); }
    }
    rr.consents = [...owners.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([k, o], i) => ({ customerRef: k, customerName: o.name, serviceIds: o.svc, noticeDays: o.cust?.premium ? 60 : 30, status: i < 2 ? 'Notified' : 'Not sent', notifiedAt: i < 2 ? S.daysAgo(5) : undefined, accountManager: o.cust?.accountManager }));
    let from = S.now + 14 * DAY; const taken: number[] = []; let need = 0;
    const order = [...racks].sort((a, b) => a.name.localeCompare(b.name));
    const bins: T.Rack[][] = []; for (let i = 0; i < order.length;) { const n = bins.length === 0 ? 1 : 2; bins.push(order.slice(i, i + n)); i += n; }
    rr.waves = bins.map((rs, i) => {
      const ids = rs.flatMap(r => live(r.id).map(d => d.id));
      need += rs.length; from = Math.max(from, ready('NetShelter SX 48U', need, 'Racks and containment'), ready('Geist rPDU 3-phase', need * 2, 'PDU'));
      const win = nextNight(S, rr.dataCenterId!, [...ids, ...rs.map(r => r.id)], from, 6, taken); taken.push(win.at); from = win.at + (i === 0 ? 7 : 2) * DAY;
      const m = rs.map(r => methods[r.id]);
      return { id: `W-${i + 1}`, name: i === 0 ? 'Pilot wave' : `Wave ${i + 1}`, order: i + 1, kind: i === 0 ? 'pilot' : 'wave', deviceIds: ids, rackIds: rs.map(r => r.id), serviceIds: svcOf(S, ids), method: [...new Set(m)].map(x => `${x}: ${SWAP_TEXT[x]}`).join(' '), windowStart: win.start, windowEnd: win.end, crewHours: Math.min(6, Math.ceil(ids.length / 6)), rollback: rollbackText(RR, { swap: m[0] }), acceptance: acceptanceText(RR), status: 'Planned', itKw: Math.round(rs.reduce((a, r) => a + r.currentPowerKw, 0) * 10) / 10 } satisfies T.PlannerWave;
    });
    rr.designPowerKw = Math.max(1, kw); rr.phases = phases(rr.waves, rr.designPowerKw); rr.targetGoLive = rr.waves[rr.waves.length - 1].windowEnd;
  }
}
