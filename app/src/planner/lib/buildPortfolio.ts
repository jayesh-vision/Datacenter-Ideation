/**
 * Regional portfolio — where and when capacity goes across a region.
 *
 *  - Demand curve: today's IT load at the region's sites × the plan's growth, plus the open
 *    demand requests at those sites (weighted by status), plus the reserve policy.
 *  - Supply: what the sites can carry today without works (design capped by real plant headroom).
 *  - Options: an expansion on a candidate site's campus (capped by its intake headroom; beyond it
 *    an uprate first), or a new site on a candidate plot. Each has a cost per kW (benchmark ×
 *    route factor, plus land for a new site) and a lead time (route duration benchmark).
 *  - Proposal: year by year, fill the gap with the cheapest option that can be live by then,
 *    in hall-sized blocks; whatever cannot be filled is the gap list.
 *  - The allocation itself is `plan.sites` (or the scenario's `siteAllocation`); it is checked
 *    against real headroom and lead time, and execution turns each row into a child plan.
 */
import type * as T from '../p2b/types';
import type { Evaluation, ParamValue, Sourced } from './engine';
import type { PlannerData } from './plannerData';
import { campusBaseline, siteBaseline } from './site';
import { haversineKm, latencyMs, ROUTE_FACTOR_NOTE, type LatLon } from './buildSite';
import { clockMs } from '../compat/clock';

type P = Record<string, Sourced<ParamValue>>;
const num = (p: P, k: string, d = 0) => { const v = p[k]?.value; return typeof v === 'number' ? v : typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d; };
const r0 = (n: number) => Math.round(n);
const WEEK = 7 * 864e5;
type Route = NonNullable<T.PlannerSiteRow['route']>;

export const ROUTE_LABEL: Record<Route, string> = { expansion: 'Campus expansion', 'new-dc': 'New site', hall: 'Hall fit-out', pod: 'Pod', edge: 'Edge' };
/** Status weights for open demand requests: approved counts in full, under review half, open a third (assumption, shown in the UI). */
export const PIPELINE_WEIGHT: Record<string, number> = { Approved: 1, 'Under Review': 0.5, Open: 0.3 };

export interface RegionSite { dc: T.DataCenter; campus?: T.Campus; loadKw: number; headroomKw: number; sellableKw: number }
export interface DemandYear { year: number; label: string; demandKw: number; needKw: number; existingKw: number; allocatedKw: number; gapKw: number; pipelineKw: number }
export interface AllocationOption { ref: T.PlannerSiteRow['ref']; name: string; route: Route; costPerKw: number; costBasis: string; leadWeeks: number; capKw?: number; capBasis: string; latLon?: LatLon; campusId?: string; prerequisite?: string }
export interface RowCheck { row: T.PlannerSiteRow; option?: AllocationOption; capexUsd: number; earliest: string; leadOk: boolean; headroomOk: boolean; detail: string }
export interface DciPair { a: string; b: string; km?: number; latencyMs?: number; gbps: number; providers: string[]; existingEnds: boolean; aDcId?: string; bDcId?: string }
export interface PortfolioModel {
  sites: RegionSite[]; demand: DemandYear[]; options: AllocationOption[]; proposal: T.PlannerSiteRow[]; gaps: { year: number; kw: number; reason: string }[];
  rows: T.PlannerSiteRow[]; rowSource: 'plan' | 'scenario' | 'none'; checks: RowCheck[]; dci: DciPair[];
  totals: { allocatedKw: number; capexUsd: number }; notes: string[];
}

const bm = (benchmarks: T.PlannerBenchmark[], metric: string, d: number, appliesTo?: Partial<T.PlannerBenchmark['appliesTo']>) => {
  const xs = benchmarks.filter(b => b.metric === metric);
  const hit = appliesTo ? xs.find(b => Object.entries(appliesTo).every(([k, v]) => (b.appliesTo as Record<string, unknown>)[k] === v)) : undefined;
  return (hit ?? xs.find(b => !Object.keys(b.appliesTo ?? {}).length) ?? xs[0])?.value ?? d;
};

/** kW an open demand request implies (GPUs, servers or TB), from the conversion benchmarks. */
export function demandKw(d: T.DemandRequest, benchmarks: T.PlannerBenchmark[]): number {
  const q = d.requestedQuantity;
  if (/gpu/i.test(d.unit)) return q * bm(benchmarks, 'kwPerGpu', 1.2);
  if (/tb/i.test(d.unit)) return q * bm(benchmarks, 'kwPerStorageTb', 0.01);
  if (/kw/i.test(d.unit)) return q;
  if (/mw/i.test(d.unit)) return q * 1000;
  return q * bm(benchmarks, 'kwPerServer', 0.6);
}
/** The site a demand request is for: its title ends with the site code ("… — ASH-DC1"). */
const demandSite = (d: T.DemandRequest, dcs: T.DataCenter[]) => dcs.find(dc => d.title.includes(dc.code));

/** The allocation in force: a scenario's `siteAllocation` (JSON rows) overrides the plan's rows. */
export function effectiveAllocation(plan: T.PlannerPlan, p: P): { rows: T.PlannerSiteRow[]; source: PortfolioModel['rowSource'] } {
  const raw = p['siteAllocation']?.value;
  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try { const rows = JSON.parse(raw) as T.PlannerSiteRow[]; if (Array.isArray(rows)) return { rows, source: 'scenario' }; } catch { /* fall through to the plan's rows */ }
  }
  const rows = (plan.sites ?? []).filter(r => r.status !== 'Rejected');
  return { rows, source: rows.length ? 'plan' : 'none' };
}

export function portfolioModel(plan: T.PlannerPlan, ev: Pick<Evaluation, 'params'> & { ctx: { data?: PlannerData; benchmarks: T.PlannerBenchmark[] } }, now = clockMs()): PortfolioModel | undefined {
  const data = ev.ctx.data; if (!data) return undefined;
  const p = ev.params; const b = ev.ctx.benchmarks;
  const notes: string[] = [];
  const camps = data.campuses.filter(c => c.regionId === plan.regionId);
  const dcs = data.dataCenters.filter(d => camps.some(c => c.id === d.campusId) && (d.status === 'Operational' || d.status === 'Construction'));
  const sites: RegionSite[] = dcs.map(dc => { const sb = siteBaseline(data, dc.id, { excludePlanId: plan.id }); const load = sb?.itLoadKw ?? 0; const head = Math.max(0, sb?.headroomItKw ?? 0); return { dc, campus: camps.find(c => c.id === dc.campusId), loadKw: r0(load), headroomKw: r0(head), sellableKw: r0(Math.min(dc.designPowerKw, load + head)) }; });
  const g = plan.demand.growthPctPerYear / 100; const reserve = num(p, 'reservePct', 15) / 100;
  const y0 = new Date(now).getUTCFullYear();
  const horizon = Math.max(num(p, 'planningHorizonYears', 5), new Date(plan.targetGoLive).getUTCFullYear() - y0 + 2);
  const load0 = sites.reduce((a, s) => a + s.loadKw, 0);
  const existingKw = sites.reduce((a, s) => a + s.sellableKw, 0);
  const pipe = data.demandRequests.filter(d => PIPELINE_WEIGHT[d.status] !== undefined).map(d => ({ d, site: demandSite(d, dcs), kw: demandKw(d, b) * PIPELINE_WEIGHT[d.status], year: new Date(d.targetDate).getUTCFullYear() })).filter(x => x.site);
  if (!pipe.length) notes.push('No open demand requests at the region\'s sites: the curve is load × growth only.');

  // Options: campus expansions on the candidate sites' campuses, and new sites on candidate plots.
  const cands = String(p['candidateSiteIds']?.value ?? '').split(',').filter(Boolean);
  const candDcs = cands.length ? dcs.filter(d => cands.includes(d.id)) : dcs;
  if (!cands.length && dcs.length) notes.push('No sites picked to consider: every site in the region is a candidate.');
  const basePerKw = bm(b, 'capexPerKw', num(p, 'capexPerKw', 3400), { dcTypeKey: plan.dcTypeKey });
  const options: AllocationOption[] = [];
  for (const cid of [...new Set(candDcs.map(d => d.campusId))]) {
    const campus = data.campuses.find(c => c.id === cid); if (!campus) continue;
    const cb = campusBaseline(data, cid, { excludePlanId: plan.id });
    const pue = num(p, 'pueTarget', 1.4);
    const head = cb ? cb.itHeadroomKw(pue) : 0;
    const f = bm(b, 'capexFactor:expansion', 0.85);
    const lead = bm(b, 'durationWeeks:expansion', 72);
    options.push({ ref: { kind: 'campus', id: cid }, name: `${campus.name} expansion`, route: 'expansion', costPerKw: r0(basePerKw * f), costBasis: `${basePerKw.toLocaleString('en-US')} USD/kW × ${f} (campus land, intake and security shared)`, leadWeeks: lead, capKw: head, capBasis: cb ? `campus intake: ${r0(cb.facilityHeadroomKw).toLocaleString('en-US')} kW facility free at PUE ${pue}` : 'no campus data', latLon: campus, campusId: cid });
    const upLead = bm(b, 'leadWeeks:Grid uprate', 78);
    options.push({ ref: { kind: 'campus', id: cid }, name: `${campus.name} expansion with grid uprate`, route: 'expansion', costPerKw: r0(basePerKw * f * 1.1), costBasis: `expansion cost × 1.1 for the uprate contribution (assumption)`, leadWeeks: Math.max(lead, upLead), capBasis: 'beyond the intake headroom: needs a utility uprate first', latLon: campus, campusId: cid, prerequisite: `Grid uprate at ${campus.city} (${upLead} weeks)` });
  }
  for (const c of plan.candidates ?? []) {
    const lead = bm(b, 'durationWeeks:new-dc', 104);
    const energ = c.gridEnergisation ? Math.max(0, (new Date(c.gridEnergisation).getTime() - now) / WEEK + 20) : 0;
    const cap = c.gridOfferMva ? r0((c.gridOfferMva * 1000 * 0.95) / Math.max(1, num(p, 'pueTarget', 1.4))) : undefined;
    const sizeKw = Math.max(1, plan.designPowerKw);
    options.push({ ref: { kind: 'candidate', id: c.id }, name: `${c.name} (new site)`, route: 'new-dc', costPerKw: r0(basePerKw + c.landCostUsd / sizeKw), costBasis: `${basePerKw.toLocaleString('en-US')} USD/kW plus land ${(c.landCostUsd / 1e6).toFixed(1)} M spread over ${r0(sizeKw).toLocaleString('en-US')} kW`, leadWeeks: r0(Math.max(lead, energ)), capKw: cap, capBasis: cap ? `grid offer ${c.gridOfferMva} MVA` : 'no grid offer recorded', latLon: c.latitude !== undefined && c.longitude !== undefined ? { latitude: c.latitude, longitude: c.longitude } : undefined });
  }
  // Scenario priority: options named first are filled first, whatever their cost.
  const prio = String(p['allocationPriority']?.value ?? '').split(',').map(x => x.trim()).filter(Boolean);
  const rank = (o: AllocationOption) => { const i = prio.findIndex(k => k === o.ref.id || o.name.toLowerCase().includes(k.toLowerCase())); return i < 0 ? 99 : i; };
  const ordered = [...options].sort((a, x) => rank(a) - rank(x) || a.costPerKw - x.costPerKw || a.leadWeeks - x.leadWeeks);

  // Year by year: the gap is filled in hall-sized blocks with the cheapest option live by the end of that year.
  const block = Math.max(100, num(p, 'hallDesignKw', 1500));
  const used = new Map<AllocationOption, number>();
  const proposal: T.PlannerSiteRow[] = []; const gaps: PortfolioModel['gaps'] = [];
  let allocated = 0; let pipeKw = 0;
  const demand: DemandYear[] = [];
  for (let i = 0; i <= horizon; i++) {
    const year = y0 + i; const yearEnd = Date.UTC(year, 11, 31);
    pipeKw += pipe.filter(x => x.year === year || (i === 0 && x.year < year)).reduce((a, x) => a + x.kw, 0);
    const dem = load0 * Math.pow(1 + g, i) + pipeKw; const need = dem * (1 + reserve);
    let gap = need - existingKw - allocated;
    while (gap > 1) {
      const opt = ordered.find(o => now + o.leadWeeks * WEEK <= yearEnd && (o.capKw === undefined || (o.capKw - (used.get(o) ?? 0)) >= Math.min(block, gap)));
      if (!opt) {
        const soonest = [...options].sort((a, x) => a.leadWeeks - x.leadWeeks)[0];
        gaps.push({ year, kw: r0(gap), reason: soonest ? `No option is live by the end of ${year}: the fastest (${soonest.name}) takes ${soonest.leadWeeks} weeks` : 'No candidate sites or plots to allocate to' });
        break;
      }
      const room = opt.capKw === undefined ? Infinity : opt.capKw - (used.get(opt) ?? 0);
      const kw = Math.min(room, Math.ceil(gap / block) * block);
      const goLive = new Date(Math.max(Date.UTC(year, 0, 1), now + opt.leadWeeks * WEEK)).toISOString();
      const existing = proposal.find(r => r.ref.id === opt.ref.id && r.route === opt.route && r.goLive.slice(0, 4) === goLive.slice(0, 4));
      if (existing) existing.itKw += kw; else proposal.push({ id: `A${proposal.length + 1}`, name: opt.name, ref: opt.ref, itKw: kw, goLive, route: opt.route, capexUsd: 0, status: 'Proposed', notes: opt.prerequisite, latitude: opt.latLon?.latitude, longitude: opt.latLon?.longitude });
      used.set(opt, (used.get(opt) ?? 0) + kw); allocated += kw; gap -= kw;
    }
    demand.push({ year, label: String(year), demandKw: r0(dem), needKw: r0(need), existingKw: r0(existingKw), allocatedKw: r0(allocated), gapKw: r0(Math.max(0, need - existingKw - allocated)), pipelineKw: r0(pipeKw) });
  }
  for (const r of proposal) { const o = options.find(x => x.ref.id === r.ref.id && x.route === r.route && x.name === r.name); r.capexUsd = r0(r.itKw * (o?.costPerKw ?? basePerKw)); }

  // The allocation in force, checked against headroom and lead time.
  const { rows, source } = effectiveAllocation(plan, p);
  const optionFor = (r: T.PlannerSiteRow) => {
    const xs = options.filter(o => o.ref.id === r.ref.id && o.route === r.route);
    return xs.find(o => o.capKw !== undefined) ?? xs[0] ?? (r.ref.kind === 'dataCenter' ? options.find(o => o.campusId === data.dataCenters.find(d => d.id === r.ref.id)?.campusId && o.route === 'expansion') : undefined);
  };
  const usedCap = new Map<string, number>();
  const checks: RowCheck[] = rows.map(r => {
    const o = optionFor(r);
    const leadW = o ? (o.prerequisite ? o.leadWeeks : o.leadWeeks) : bm(b, `durationWeeks:${r.route === 'hall' ? 'hall' : r.route === 'pod' ? 'pod' : r.route === 'new-dc' ? 'new-dc' : 'expansion'}`, 72);
    const earliest = new Date(now + leadW * WEEK).toISOString();
    const leadOk = r.goLive >= earliest;
    let headroomOk = true; let detail = '';
    if (r.route === 'hall' || r.route === 'pod') {
      const s = sites.find(x => x.dc.id === r.ref.id); const free = (s?.headroomKw ?? 0) - (usedCap.get(r.ref.id ?? '') ?? 0);
      headroomOk = !!s && r.itKw <= free; usedCap.set(r.ref.id ?? '', (usedCap.get(r.ref.id ?? '') ?? 0) + r.itKw);
      detail = s ? `${r.itKw.toLocaleString('en-US')} kW against ${r0(free).toLocaleString('en-US')} kW of plant headroom at ${s.dc.code}` : 'Site not in the region';
    } else if (r.route === 'expansion') {
      const cap = options.find(x => x.ref.id === (o?.campusId ?? r.ref.id) && x.route === 'expansion' && x.capKw !== undefined)?.capKw ?? 0;
      const usedKw = usedCap.get(`campus:${o?.campusId ?? r.ref.id}`) ?? 0; usedCap.set(`campus:${o?.campusId ?? r.ref.id}`, usedKw + r.itKw);
      const uprate = plan.permits.find(pm => pm.siteRef === r.id && (pm.upliftKw ?? 0) > 0 && pm.status !== 'Expired');
      headroomOk = r.itKw + usedKw <= cap || !!uprate;
      detail = r.itKw + usedKw <= cap ? `${r.itKw.toLocaleString('en-US')} kW within ${r0(cap - usedKw).toLocaleString('en-US')} kW of campus intake headroom` : uprate ? `Beyond the campus intake (${r0(Math.max(0, cap - usedKw)).toLocaleString('en-US')} kW free): uprate "${uprate.name}" is on the permits` : `Beyond the campus intake (${r0(Math.max(0, cap - usedKw)).toLocaleString('en-US')} kW free) and no uprate permit is linked to this row`;
    } else if (r.route === 'new-dc') {
      const cap = o?.capKw; headroomOk = cap === undefined || r.itKw <= cap;
      detail = cap === undefined ? 'No grid offer recorded for the plot' : `${r.itKw.toLocaleString('en-US')} kW within the grid offer (${r0(cap).toLocaleString('en-US')} kW IT)`;
    }
    return { row: r, option: o, capexUsd: r.capexUsd ?? r0(r.itKw * (o?.costPerKw ?? basePerKw)), earliest, leadOk, headroomOk, detail };
  });

  // Interconnect between every pair of allocated locations.
  const locOf = (r: T.PlannerSiteRow): { name: string; ll?: LatLon; dcId?: string } => {
    if (r.ref.kind === 'dataCenter') { const d = data.dataCenters.find(x => x.id === r.ref.id); return { name: d?.code ?? r.name, ll: d, dcId: d?.id }; }
    if (r.ref.kind === 'campus') { const c = data.campuses.find(x => x.id === r.ref.id); const d = data.dataCenters.find(x => x.campusId === c?.id && x.status === 'Operational'); return { name: c?.city ?? r.name, ll: c, dcId: d?.id }; }
    const c = plan.candidates?.find(x => x.id === r.ref.id);
    return { name: c?.name ?? r.name, ll: c && c.latitude !== undefined && c.longitude !== undefined ? { latitude: c.latitude, longitude: c.longitude } : r.latitude !== undefined && r.longitude !== undefined ? { latitude: r.latitude, longitude: r.longitude } : undefined };
  };
  const locs = new Map<string, { name: string; ll?: LatLon; dcId?: string; kw: number }>();
  for (const r of rows) { const l = locOf(r); const key = `${r.ref.kind}:${r.ref.id}`; const cur = locs.get(key); locs.set(key, { ...l, kw: (cur?.kw ?? 0) + r.itKw }); }
  const perMw = num(p, 'dciGbpsPerMw', 20);
  const L = [...locs.values()]; const dci: DciPair[] = [];
  const providersAt = (dcId?: string) => { if (!dcId) return []; const ck = new Set(data.circuitTerminations.filter(t => t.dataCenterId === dcId).map(t => t.circuitId)); return [...new Set(data.circuits.filter(c => ck.has(c.id)).map(c => data.providers.find(pv => pv.id === c.providerId)?.name).filter(Boolean) as string[])]; };
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], c = L[j]; const km = a.ll && c.ll ? r0(haversineKm(a.ll, c.ll)) : undefined;
    const pa = providersAt(a.dcId), pc = providersAt(c.dcId);
    dci.push({ a: a.name, b: c.name, km, latencyMs: km !== undefined ? latencyMs(km) : undefined, gbps: Math.max(100, Math.ceil((Math.min(a.kw, c.kw) / 1000) * perMw / 100) * 100), providers: pa.filter(x => pc.includes(x)).length ? pa.filter(x => pc.includes(x)) : [...new Set([...pa, ...pc])], existingEnds: !!a.dcId && !!c.dcId, aDcId: a.dcId, bDcId: c.dcId });
  }
  if (dci.length) notes.push(`Interconnect latency is ${ROUTE_FACTOR_NOTE}; capacity is ${perMw} Gbps per MW of the smaller end, in 100G steps.`);
  return { sites, demand, options, proposal, gaps, rows, rowSource: source, checks, dci, totals: { allocatedKw: r0(rows.reduce((a, r) => a + r.itKw, 0)), capexUsd: r0(checks.reduce((a, c) => a + c.capexUsd, 0)) }, notes };
}

/** Plan type a portfolio row becomes. */
export const CHILD_SCOPE: Record<Route, T.PlannerScope> = { expansion: 'expansion', 'new-dc': 'new-dc', hall: 'hall', pod: 'pod', edge: 'edge' };
