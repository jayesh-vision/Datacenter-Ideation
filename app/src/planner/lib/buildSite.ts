/**
 * New data centre and site expansion — the site itself.
 *
 *  - Feasibility: the plot, the grid offer, energisation, water and hazards of the chosen site
 *    (a candidate in `plan.candidates`) checked against what the design needs.
 *  - Candidates: 2 to 5 plots compared on a weighted scorecard (time to power, CapEx and land,
 *    energy cost, latency to the estate, risk) with the hard limits shown per plot.
 *  - Campus headroom (expansion): the campus intake per side against the facility load the
 *    existing buildings are entitled to, plus grid uprates energised by each phase date.
 */
import type * as T from '../p2b/types';
import type { Evaluation, ParamValue, Sourced } from './engine';
import type { PlannerData } from './plannerData';
import { campusBaseline, type CampusBaseline } from './site';
import { permitDecision } from './outputs';
import type { BomItem } from './outputs';
import { clockMs } from '../compat/clock';

type P = Record<string, Sourced<ParamValue>>;
const num = (p: P, k: string, d = 0) => { const v = p[k]?.value; return typeof v === 'number' ? v : typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d; };
const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const WEEK = 7 * 864e5;
const POWER_FACTOR = 0.95;

/* ------------------------------------------------------------------ geography */
export interface LatLon { latitude: number; longitude: number }
/** Great-circle distance in km. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** One-way fibre latency: the route is about 1.4 × the straight line, light travels about 200 km per ms in glass. */
export const latencyMs = (km: number) => r1((km * 1.4) / 200);
export const ROUTE_FACTOR_NOTE = 'one way, fibre route about 1.4 × the straight line at 200 km per millisecond';

/* ------------------------------------------------------------------ feasibility */
/** The site the plan is evaluated on: the scenario's `candidateId`, else the chosen candidate, else the only one. */
export function chosenCandidate(plan: T.PlannerPlan, p?: P): T.PlannerCandidateSite | undefined {
  const xs = plan.candidates ?? [];
  const sc = p?.['candidateId']?.value;
  return (sc ? xs.find(c => c.id === sc) : undefined) ?? xs.find(c => c.chosen) ?? (xs.length === 1 ? xs[0] : undefined);
}
export interface FeasibilityCheck { key: 'footprint' | 'grid' | 'energisation' | 'water' | 'zoning'; label: string; ok: boolean; warn?: boolean; detail: string }
export interface Feasibility {
  candidate: T.PlannerCandidateSite; peakPue: number; facilityKw: number; mva: number;
  footprintM2: number; plotNeedM2: number; buildableM2: number;
  waterM3PerDay: number; firstPhase?: T.PlannerPhase; powerOn?: string; energisation: string;
  checks: FeasibilityCheck[];
  /** What to do when energisation is late: interim generation or moving phase 1. */
  proposal?: { interimGenerationMw: number; shiftPhase1To: string };
}
/** Weeks before go-live the site needs permanent power (energisation) for commissioning. */
export const POWER_ON_WEEKS = 20;
/** Peak PUE over the annual target: the grid offer must carry the hottest day, not the average. */
export const PEAK_PUE_FACTOR = 1.1;
/** The site facts against what the design needs. */
export function feasibility(plan: T.PlannerPlan, ev: Pick<Evaluation, 'sizing' | 'sustainability' | 'params'>, cand: T.PlannerCandidateSite): Feasibility {
  const s = ev.sizing; const p = ev.params;
  const peakPue = num(p, 'peakPue', 0) || r1(s.pue.value * PEAK_PUE_FACTOR * 100) / 100;
  const facilityKw = r0(s.itKw * peakPue);
  const mva = r1(facilityKw / POWER_FACTOR / 1000);
  const ratio = num(p, 'siteAreaRatio', 1.8);
  const footprintM2 = r0(Math.max(1, s.buildings) * s.building.floorPlateM2);
  const plotNeedM2 = r0(footprintM2 * ratio);
  const buildableM2 = r0(cand.buildableHa * 10000);
  const waterM3PerDay = r1((s.itKw * 24 * ev.sustainability.wue) / 1000);
  const phases = [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive));
  const first = phases[0];
  const powerOn = first ? new Date(new Date(first.goLive).getTime() - POWER_ON_WEEKS * WEEK).toISOString() : undefined;
  const energisedOk = !!powerOn && !!cand.gridEnergisation && cand.gridEnergisation <= powerOn;
  const checks: FeasibilityCheck[] = [
    { key: 'footprint', label: 'Buildings fit the buildable plot', ok: plotNeedM2 <= buildableM2, detail: `${plotNeedM2.toLocaleString('en-US')} m² needed (${Math.max(1, s.buildings)} building footprint${s.buildings === 1 ? '' : 's'} of ${s.building.floorPlateM2.toLocaleString('en-US')} m² × ${ratio} for yard, substation, roads and setbacks) against ${buildableM2.toLocaleString('en-US')} m² buildable` },
    { key: 'grid', label: 'Facility load within the grid offer', ok: mva <= cand.gridOfferMva, warn: mva <= cand.gridOfferMva && !cand.gridFirm, detail: `${mva} MVA at peak (${s.itKw.toLocaleString('en-US')} kW × peak PUE ${peakPue} ÷ ${POWER_FACTOR}) against an offer of ${cand.gridOfferMva} MVA${cand.gridFirm ? ', firm' : ', non-firm: curtailment possible'}` },
    { key: 'energisation', label: 'Grid energised before phase 1 power-on', ok: energisedOk, detail: !cand.gridEnergisation ? 'No energisation date recorded' : !powerOn ? 'No phases' : `Energisation ${cand.gridEnergisation.slice(0, 10)}; phase 1 needs power on ${powerOn.slice(0, 10)} (${POWER_ON_WEEKS} weeks before go-live)` },
    { key: 'water', label: 'Water demand within the supply', ok: waterM3PerDay <= cand.waterM3PerDay, detail: `${waterM3PerDay} m³ a day (${s.itKw.toLocaleString('en-US')} kW × 24 h × ${ev.sustainability.wue} L/kWh) against ${cand.waterM3PerDay} m³ a day` },
    { key: 'zoning', label: 'Plot zoned for a data centre', ok: cand.zoning === 'Zoned for data centre', warn: cand.zoning !== 'Zoned for data centre', detail: `${cand.zoning}${cand.floodZone ? ' · flood zone' : ''}${cand.seismicZone ? ' · seismic zone' : ''}` },
  ];
  const proposal = !energisedOk && first && cand.gridEnergisation ? { interimGenerationMw: r1((first.itKw * peakPue) / 1000), shiftPhase1To: new Date(new Date(cand.gridEnergisation).getTime() + POWER_ON_WEEKS * WEEK).toISOString() } : undefined;
  return { candidate: cand, peakPue, facilityKw, mva, footprintM2, plotNeedM2, buildableM2, waterM3PerDay, firstPhase: first, powerOn, energisation: cand.gridEnergisation, checks, proposal };
}

/* ------------------------------------------------------------------ candidate scorecard */
export const CRITERIA = ['time', 'cost', 'tariff', 'latency', 'risk'] as const;
export type Criterion = (typeof CRITERIA)[number];
export const CRITERION_LABEL: Record<Criterion, string> = { time: 'Time to power', cost: 'CapEx and land', tariff: 'Energy cost', latency: 'Latency to the estate', risk: 'Risk' };
export function scoreWeights(p: P): Record<Criterion, number> {
  const raw = String(p['candidateWeights']?.value ?? '30,25,20,15,10').split(',').map(x => Math.max(0, Number(x) || 0));
  return Object.fromEntries(CRITERIA.map((c, i) => [c, raw[i] ?? 0])) as Record<Criterion, number>;
}
export interface CandidateScore {
  candidate: T.PlannerCandidateSite; feasibility: Feasibility; feasible: boolean;
  metrics: { monthsToPower: number; costUsd: number; energyUsdYear: number; tariff: number; tariffSource: string; latencyMs?: number; latencyBasis: string; riskPoints: number; riskWhy: string[] };
  scores: Record<Criterion, number>; total: number; rank: number;
}
/** Estate the latency is measured to: the region's campuses weighted by their design load. */
function latencyTo(cand: T.PlannerCandidateSite, data: PlannerData | undefined, regionId?: string): { ms?: number; basis: string } {
  if (cand.latitude === undefined || cand.longitude === undefined) return { basis: 'no position recorded' };
  if (!data) return { basis: 'platform data still loading' };
  const camps = data.campuses.filter(c => !regionId || c.regionId === regionId);
  const w = camps.map(c => ({ c, kw: data.dataCenters.filter(d => d.campusId === c.id && d.status !== 'Retired').reduce((a, d) => a + d.designPowerKw, 0) })).filter(x => x.kw > 0);
  if (!w.length) return { basis: 'no campus in the region' };
  const tot = w.reduce((a, x) => a + x.kw, 0);
  const km = w.reduce((a, x) => a + haversineKm(cand as LatLon, x.c) * x.kw, 0) / tot;
  return { ms: latencyMs(km), basis: `${r0(km)} km on average to ${w.length} campus${w.length === 1 ? '' : 'es'} weighted by design load (${ROUTE_FACTOR_NOTE})` };
}
/** Lower is better: the best gets 100, the worst 0, the rest in between (one candidate scores 100). */
const scaleLow = (v: number, xs: number[]) => { const lo = Math.min(...xs), hi = Math.max(...xs); return hi === lo ? 100 : r0(100 - ((v - lo) / (hi - lo)) * 100); };
export function scoreCandidates(plan: T.PlannerPlan, ev: Evaluation, now = clockMs()): CandidateScore[] {
  const xs = plan.candidates ?? []; if (!xs.length) return [];
  const p = ev.params; const w = scoreWeights(p);
  const region = ev.ctx.benchmarks.find(b => b.metric === 'tariff' && b.appliesTo.regionId === plan.regionId);
  const rows = xs.map(c => {
    const f = feasibility(plan, ev, c);
    const months = c.gridEnergisation ? Math.max(0, r1((new Date(c.gridEnergisation).getTime() - now) / (30.4 * 864e5))) : 99;
    const tariff = c.tariffUsdPerKwh ?? region?.value ?? num(p, 'tariffUsdPerKwh', 0.11);
    const lat = latencyTo(c, ev.ctx.data, c.regionId ?? plan.regionId);
    const riskWhy = [c.floodZone && 'flood zone', c.seismicZone && 'seismic zone', c.zoning === 'Rezoning needed' && 'rezoning needed', c.zoning === 'Unknown' && 'zoning unknown', !c.gridFirm && 'non-firm grid offer', c.fibreRoutes < 2 && 'fewer than two fibre routes'].filter(Boolean) as string[];
    const riskPoints = (c.floodZone ? 30 : 0) + (c.seismicZone ? 20 : 0) + (c.zoning === 'Rezoning needed' ? 25 : c.zoning === 'Unknown' ? 15 : 0) + (c.gridFirm ? 0 : 15) + (c.fibreRoutes < 2 ? 10 : 0);
    return { c, f, months, costUsd: ev.estimate.capexTotal + c.landCostUsd, tariff, tariffSource: c.tariffUsdPerKwh ? 'site offer' : region ? 'regional benchmark' : 'plan input', energyUsdYear: r0(ev.estimate.energyMwhYear * 1000 * tariff), lat, riskPoints, riskWhy };
  });
  const latKnown = rows.filter(r => r.lat.ms !== undefined).map(r => r.lat.ms!);
  const out = rows.map(r => {
    const scores: Record<Criterion, number> = {
      time: scaleLow(r.months, rows.map(x => x.months)), cost: scaleLow(r.costUsd, rows.map(x => x.costUsd)), tariff: scaleLow(r.energyUsdYear, rows.map(x => x.energyUsdYear)),
      latency: r.lat.ms === undefined || !latKnown.length ? 0 : scaleLow(r.lat.ms, latKnown), risk: scaleLow(r.riskPoints, rows.map(x => x.riskPoints)),
    };
    const wsum = CRITERIA.reduce((a, k) => a + w[k], 0) || 1;
    const total = r0(CRITERIA.reduce((a, k) => a + w[k] * scores[k], 0) / wsum);
    const feasible = r.f.checks.filter(x => x.key !== 'zoning').every(x => x.ok);
    return { candidate: r.c, feasibility: r.f, feasible, metrics: { monthsToPower: r.months, costUsd: r.costUsd, energyUsdYear: r.energyUsdYear, tariff: r.tariff, tariffSource: r.tariffSource, latencyMs: r.lat.ms, latencyBasis: r.lat.basis, riskPoints: r.riskPoints, riskWhy: r.riskWhy }, scores, total, rank: 0 };
  });
  // Feasible plots rank above any plot that breaks a hard limit.
  [...out].sort((a, b) => Number(b.feasible) - Number(a.feasible) || b.total - a.total).forEach((x, i) => { x.rank = i + 1; });
  return out;
}

/* ------------------------------------------------------------------ campus headroom (expansion) */
export interface Uprate { permit: T.PlannerPermit; kw: number; energisedBy: string; basis: string }
/** Grid uprates on the plan's permits: facility kW added, and when (the later of the date asked for and the earliest decision). */
export function uprates(plan: T.PlannerPlan, now = clockMs()): Uprate[] {
  return plan.permits.filter(pm => (pm.upliftKw ?? 0) > 0 && pm.status !== 'Expired').map(pm => {
    if (pm.energisedBy) return { permit: pm, kw: pm.upliftKw!, energisedBy: pm.energisedBy, basis: 'energisation date from the utility' };
    const d = permitDecision(pm, now);
    const at = Math.max(new Date(pm.neededBefore).getTime(), d.at ?? 0);
    return { permit: pm, kw: pm.upliftKw!, energisedBy: new Date(at).toISOString(), basis: d.approved ? 'approved; energised on the date asked for' : `later of the date asked for and the earliest decision (${d.basis})` };
  });
}
export interface CampusPhaseRow { phase: T.PlannerPhase; cumulativeItKw: number; facilityKw: number; upratesKw: number; availableKw: number; ok: boolean; shortKw: number }
export interface CampusCheck {
  campus: CampusBaseline; pue: number;
  /** Facility kW free on the campus intake today, after other approved expansions and campus holds. */
  headroomKw: number; otherPlans: { plnId: string; title: string; kw: number }[]; holdsKw: number;
  /** Campus transformers per side (assumes an even A/B split) against the committed facility load. */
  transformerHeadroomKw: number;
  rows: CampusPhaseRow[]; uprates: Uprate[];
  dominantType?: { key: string; kw: number };
}
/** The campus intake against each phase's cumulative facility load (IT × PUE), with the uprates energised by then. */
export function campusCheck(plan: T.PlannerPlan, data: PlannerData, pue: number, campus?: CampusBaseline, now = clockMs()): CampusCheck | undefined {
  const cb = campus ?? campusBaseline(data, plan.campusId, { excludePlanId: plan.id });
  if (!cb) return undefined;
  const ACTIVE = ['Reserved', 'Committed'];
  const holds = data.capacityReservations.filter(h => h.resourceType === 'PowerChain' && h.resourceId === cb.campus.id && ACTIVE.includes(h.state) && h.plannerPlanId !== plan.id && (!h.expiresAt || new Date(h.expiresAt).getTime() > now));
  const holdPlans = new Set(holds.map(h => h.plannerPlanId));
  const holdsKw = holds.reduce((a, h) => a + (h.unit === 'kW' ? h.quantity : 0), 0);
  const others = data.plannerPlans.filter(p => p.id !== plan.id && p.scope === 'expansion' && p.campusId === cb.campus.id && (p.status === 'Approved' || p.status === 'Executing') && !holdPlans.has(p.id))
    .map(p => ({ plnId: p.plnId, title: p.title, kw: r0(p.designPowerKw * (Number(p.params.pueTarget) || 1.3)) }));
  const headroom = cb.facilityHeadroomKw - holdsKw - others.reduce((a, o) => a + o.kw, 0);
  const ups = uprates(plan, now);
  let cum = 0;
  const rows = [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive)).map(ph => {
    cum += ph.itKw;
    const facilityKw = r0(cum * pue);
    const upratesKw = ups.filter(u => u.energisedBy <= ph.goLive).reduce((a, u) => a + u.kw, 0);
    const availableKw = r0(headroom + upratesKw);
    return { phase: ph, cumulativeItKw: cum, facilityKw, upratesKw, availableKw, ok: facilityKw <= availableKw, shortKw: Math.max(0, facilityKw - availableKw) };
  });
  const byType = new Map<string, number>();
  for (const d of cb.dataCenters) if (d.dcTypeKey) byType.set(d.dcTypeKey, (byType.get(d.dcTypeKey) ?? 0) + d.designPowerKw);
  const dom = [...byType.entries()].sort((a, b) => b[1] - a[1])[0];
  return { campus: cb, pue, headroomKw: r0(headroom), otherPlans: others, holdsKw: r0(holdsKw), transformerHeadroomKw: r0(cb.transformerKw / 2 - cb.committedFacilityKw), rows, uprates: ups, dominantType: dom ? { key: dom[0], kw: dom[1] } : undefined };
}

/**
 * Phases snapped to hall blocks and capped by what the campus can power at each date: phase 1 up
 * to today's headroom (at the target date), then one phase per uprate as it is energised.
 */
export function proposeExpansionPhases(plan: T.PlannerPlan, check: CampusCheck, hallKw: number, density: number): { phases: T.PlannerPhase[]; shortKw: number; note: string } {
  const target = plan.targetGoLive;
  const halls = Math.max(1, Math.ceil(plan.designPowerKw / Math.max(1, hallKw)));
  const events = [...new Set([target, ...check.uprates.map(u => (u.energisedBy > target ? u.energisedBy : target))])].sort();
  const phases: T.PlannerPhase[] = []; let placed = 0;
  for (const d of events) {
    const avail = check.headroomKw + check.uprates.filter(u => u.energisedBy <= d).reduce((a, u) => a + u.kw, 0);
    const capHalls = Math.floor(Math.max(0, avail) / check.pue / hallKw);
    const add = Math.min(halls - placed, capHalls - placed);
    if (add <= 0) continue;
    const itKw = placed + add === halls ? plan.designPowerKw - placed * hallKw : add * hallKw;
    phases.push({ id: `P${phases.length + 1}`, name: `Halls ${placed + 1} to ${placed + add}`, goLive: d, itKw, halls: add, racks: Math.ceil(itKw / Math.max(1, density)), status: 'Planned' });
    placed += add;
  }
  const shortKw = Math.max(0, plan.designPowerKw - phases.reduce((a, p) => a + p.itKw, 0));
  return { phases, shortKw, note: shortKw ? `${r0(shortKw).toLocaleString('en-US')} kW cannot be powered with the headroom and uprates recorded: add an uprate or reduce the building.` : `${phases.length} phase${phases.length === 1 ? '' : 's'} of ${hallKw.toLocaleString('en-US')} kW halls, each live when the campus can power it.` };
}

/**
 * The expansion's bill: the generic building bill, less what the campus already has. The HV
 * intake is shared (only the shortfall is bought as an uprate), the campus core routers and
 * carrier entries are shared, and the perimeter and lobby security zones are the campus's.
 * Building plant (MV/LV transformers, UPS, generators, cooling) is bought for the building.
 */
export function expansionBomLines(lines: BomItem[], check: CampusCheck | undefined, itKw: number): { lines: BomItem[]; shared: { item: string; note: string }[] } {
  const out: BomItem[] = []; const shared: { item: string; note: string }[] = [];
  const needMw = r1((itKw * (check?.pue ?? 1.3)) / 1000);
  const freeMw = check ? r1(Math.max(0, check.headroomKw) / 1000) : 0;
  const uprateMw = check ? r1(check.uprates.reduce((a, u) => a + u.kw, 0) / 1000) : 0;
  for (const l of lines) {
    if (!check) { out.push(l); continue; }
    if (l.item === 'Utility connection') {
      const short = r1(Math.max(0, needMw - freeMw));
      if (short <= 0) { shared.push({ item: l.item, note: `Not bought: the campus intake has ${freeMw} MW free for the ${needMw} MW this building needs` }); continue; }
      out.push({ ...l, qty: Math.ceil(short), total: Math.ceil(short) * l.unitCost, spec: `Uprate share: ${short} MW beyond the ${freeMw} MW free on the campus intake`, note: `Shared: campus intake covers ${freeMw} MW of ${needMw} MW${uprateMw ? `; ${uprateMw} MW of uprates on the permits` : ''}` });
      continue;
    }
    if (l.item === 'Medium-voltage switchgear') { const q = 2; out.push({ ...l, qty: q, total: q * l.unitCost, spec: 'Building ring-main units, A and B', note: 'Shared: the campus MV ring and HV substation are reused' }); continue; }
    if (l.item === 'Core router') { shared.push({ item: `${l.qty} × core router`, note: 'Not bought: the campus core and carrier entries serve the new building' }); continue; }
    if (l.item === 'Access control and CCTV') { const q = Math.max(1, l.qty - 2); out.push({ ...l, qty: q, total: q * l.unitCost, note: 'Shared: campus perimeter and lobby zones already exist' }); continue; }
    if (l.item === 'Transformer') { out.push({ ...l, note: 'Building MV/LV transformers fed from the campus ring' }); continue; }
    out.push(l);
  }
  return { lines: out, shared };
}
