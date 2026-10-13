/**
 * Scope model · new data centre, site expansion, regional portfolio and edge rollout.
 *
 *  new-dc     site feasibility (plot, grid offer, energisation, water) as hard rules, candidate
 *             plots on a weighted scorecard, one project set per building phase, ATPs per phase,
 *             and the DataCenter with its buildings, floors and halls created on execution.
 *  expansion  the campus intake (per side) against each phase's facility load plus the uprates
 *             energised by then; an incremental bill (shared intake, MV ring, core, security);
 *             the campus-expansion blueprint; a building under the campus on execution.
 *  portfolio  demand curve, an allocation of capacity to sites and years, checked against real
 *             headroom and lead time; executes to child plans, never to a bill or orders.
 *  edge       one row per edge location with a power variant; sizing, rules and bill per site;
 *             per-wave schedule, edge-wave blueprint with per-site work orders and an SAT per site.
 * Hooks not defined here fall back to the generic engine, output, wizard and execution behaviour.
 */
import type * as T from '../../p2b/types';
import type { BomAdder, CheckResult, CloseoutCheck, ReservationRequest, ScopeBlocker, ScopeCtx, ScopeModel } from './types';
import { priceOf } from '../catalogue';
import type { Estimate, EstimateLine, Evaluation, LadderRow, PlantItem, ScheduleItem, Sizing } from '../engine';
import type { BodSection, InitProject, IpPlan, IpRequest, PermitGate } from '../outputs';
import { allocateIpPlan, genericBomLines, permitGates, phasedProjects, planPhases, resolveBlueprintKey } from '../outputs';
import { getBlueprint } from '../../p2b/delivery/programBlueprints';
import { dcTypeProfile } from '../../p2b/dcTypes';
import { campusCheck, chosenCandidate, expansionBomLines, feasibility, scoreCandidates, type CampusCheck, type CandidateScore, type Feasibility } from '../buildSite';
import { accessCircuitMonthly, edgeAnalysis, edgeBomLines, edgeLadder, edgeRows, edgeRule, edgeSchedule, type EdgeAnalysis, type EdgeLadderRow } from '../buildEdge';
import { portfolioModel, ROUTE_LABEL, type PortfolioModel } from '../buildPortfolio';
import { edgeAtpPlan, phaseAtpPlan } from '../buildAtp';
import { createAtps, createChildPlans, createProgramme, createSiteRecords, initiationOf, linkIp, linkPermits, startPlanWorkOrder, startSiteWorkOrders, subStep, touchEdgeLocations } from '../buildExecute';

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const num = (c: { params: ScopeCtx['params'] }, k: string, d = 0) => { const v = c.params[k]?.value; return typeof v === 'number' ? v : typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d; };
const kw = (n: number) => (n >= 1000 ? `${r1(n / 1000).toLocaleString('en-US')} MW` : `${r0(n).toLocaleString('en-US')} kW`);
const day = (iso?: string) => (iso ? iso.slice(0, 10) : '—');

/** What the build family works out for a plan (stored on `ev.scope.build`). */
export interface BuildAnalysis {
  scope: T.PlannerScope; dataReady: boolean;
  /** Programme projects back-scheduled per phase, and the permits against the projects they gate. */
  blueprintKey?: string; projects: InitProject[]; gates: PermitGate[];
  feasibility?: Feasibility; candidates?: CandidateScore[];
  campus?: CampusCheck; shared?: { item: string; note: string }[];
  portfolio?: PortfolioModel;
  edge?: EdgeAnalysis; edgeLadder?: EdgeLadderRow[];
}
export const buildScope = (ev?: Evaluation): BuildAnalysis | undefined => ev?.scope?.build as BuildAnalysis | undefined;

/* Per-evaluation memo: the hooks of one evaluation share the same params object. */
const EDGE = new WeakMap<object, EdgeAnalysis>();
const PORT = new WeakMap<object, PortfolioModel | undefined>();
const CAMP = new WeakMap<object, CampusCheck | undefined>();
const edgeOf = (c: ScopeCtx, pue: number) => { let a = EDGE.get(c.params); if (!a) { a = edgeAnalysis(c.plan, c.params, c.benchmarks, pue); EDGE.set(c.params, a); } return a; };
const portOf = (c: ScopeCtx) => { if (!PORT.has(c.params)) PORT.set(c.params, c.data ? portfolioModel(c.plan, { params: c.params, ctx: { data: c.data, benchmarks: c.benchmarks } }) : undefined); return PORT.get(c.params); };
const campOf = (c: ScopeCtx, pue: number) => { if (!CAMP.has(c.params)) CAMP.set(c.params, c.data ? campusCheck(c.plan, c.data, pue, c.campus) : undefined); return CAMP.get(c.params); };

const IT_LINE = /^IT\b|IT and network|IT equipment|servers?\b|GPU/i;
/** Totals after capex or opex lines change. */
function retotal(e: Estimate, itKw: number, racks: number, capex: EstimateLine[], opex: EstimateLine[] = e.opex): Estimate {
  const capexTotal = capex.reduce((a, l) => a + l.amount, 0);
  const it = capex.filter(l => IT_LINE.test(l.item)).reduce((a, l) => a + l.amount, 0);
  const plant = capexTotal - it;
  const opexMonthly = opex.reduce((a, l) => a + l.amount, 0);
  const marginAnnual = e.revenueAnnual + e.energyRecoveredAnnual - opexMonthly * 12;
  return { ...e, capex, capexTotal: r0(capexTotal), plantCapexTotal: r0(plant), capexPerKw: itKw ? r0(plant / itKw) : 0, capexPerRack: racks ? r0(capexTotal / racks) : 0, opex, opexMonthly: r0(opexMonthly), opexAnnual: r0(opexMonthly * 12), marginAnnual: r0(marginAnnual), paybackMonths: marginAnnual > 0 && plant > 0 ? r0((plant / marginAnnual) * 12) : null };
}

/** Projects for the schedule and the rules (budgets are not needed there). */
function projectsFor(c: ScopeCtx, est?: Estimate): { key?: string; projects: InitProject[] } {
  if (c.plan.scope === 'portfolio') return { projects: [] };
  const tpl = c.templates.find(t => t.id === c.plan.templateId);
  const key = resolveBlueprintKey(c.plan, tpl); const bp = getBlueprint(key);
  const ev = { estimate: est ?? { capex: [] }, ctx: c, params: c.params } as unknown as Evaluation;
  return { key, projects: bp ? phasedProjects(c.plan, ev, bp) : [] };
}

/* ------------------------------------------------------------------ cooling per rack class */
const CLOSE_COUPLED = ['liquid-to-chip', 'immersion', 'rear-door'];
/** Rack classes above the air limit in a hall cooled by air: they need rear-door (or liquid) units on their rows. */
function hotClasses(ev: Pick<Evaluation, 'sizing' | 'ctx'>): { name: string; kw: number; racks: number }[] {
  const limit = ev.ctx.benchmarks.find(b => b.metric === 'liquidThresholdKw')?.value ?? 30;
  if (CLOSE_COUPLED.includes(ev.sizing.cooling.type)) return [];
  return ev.sizing.rackClasses.filter(c => c.kw > limit && c.racks > 0);
}
/** Rear-door units for the rows of the hot rack classes (the mixed cooling design, priced). */
function mixedCoolingLines(ev: Evaluation, add: BomAdder): void {
  for (const c of hotClasses(ev)) add({ kind: 'reardoor', category: 'Cooling', item: 'Rear-door heat exchanger', spec: `${c.name} racks at ${c.kw} kW: rear-door units on top of ${ev.sizing.cooling.type} for these rows`, qty: c.racks, unit: 'rack', unitCost: priceOf('Liebert DCD') ?? 18000, leadItem: 'CRAH / CDU', manufacturer: 'Vertiv', note: 'Mixed cooling: the average rack is within the air limit, this class is not' });
}

/* ------------------------------------------------------------------ rule answers */
function feasibilityAnswer(a: BuildAnalysis | undefined, key: string, soft = false): CheckResult {
  if (!a?.feasibility) return { status: 'n/a', detail: 'No site facts recorded: add the plot, grid offer and water supply on Requirements' };
  const ch = a.feasibility.checks.find(x => x.key === key)!;
  const extra = key === 'energisation' && !ch.ok && a.feasibility.proposal ? ` Either bring ${a.feasibility.proposal.interimGenerationMw} MW of interim generation for phase 1 or move phase 1 to ${day(a.feasibility.proposal.shiftPhase1To)}.` : '';
  return { status: ch.ok ? (ch.warn ? 'warn' : 'pass') : soft ? 'warn' : 'fail', detail: `${a.feasibility.candidate.name}: ${ch.detail}.${extra}`, value: ch.ok ? 'OK' : 'Short' };
}
function permitAnswer(a: BuildAnalysis | undefined, plan: T.PlannerPlan): CheckResult {
  if (!plan.permits.length) return { status: 'n/a', detail: 'No permits listed for this plan' };
  const gates = a?.gates ?? [];
  const linked = gates.filter(g => g.projectUid);
  const bad = gates.filter(g => !g.ok);
  if (bad.length) return { status: 'fail', detail: bad.slice(0, 4).map(g => `${g.permit.name}: ${g.reason}`).join('; ') + (bad.length > 4 ? `; and ${bad.length - 4} more` : ''), value: `${gates.length - bad.length}/${gates.length}` };
  if (!linked.length) return { status: 'n/a', detail: 'No permit is linked to a programme project (set the project each permit gates)' };
  return { status: 'pass', detail: `${linked.length} permit${linked.length === 1 ? '' : 's'} decided before the project each gates${gates.length > linked.length ? `; ${gates.length - linked.length} not linked to a project` : ''}`, value: `${linked.length}/${gates.length}` };
}
function civilAnswer(a: BuildAnalysis | undefined): CheckResult {
  const ps = a?.projects ?? [];
  const civil = ps.filter(p => p.template === 'Site Construction');
  const fit = ps.filter(p => p.template === 'Building Fit-out' || p.template === 'Hall Fit-out');
  if (!civil.length || !fit.length) return { status: 'n/a', detail: 'The blueprint has no separate civil and fit-out projects' };
  const bad = fit.filter(f => civil.some(cv => (cv.planPhaseId === f.planPhaseId || cv.shared) && f.start < cv.end && f.key !== 'rfs'));
  return bad.length ? { status: 'fail', detail: bad.map(f => `${f.name} starts ${day(f.start)} before the shell is complete`).join('; ') } : { status: 'pass', detail: `${fit.length} fit-out project${fit.length === 1 ? '' : 's'} start after the shell of their phase is complete` };
}
function campusAnswer(a: BuildAnalysis | undefined, c: ScopeCtx): CheckResult {
  if (!c.data) return { status: 'n/a', detail: 'Not checked: platform data still loading' };
  if (!c.plan.campusId) return { status: 'n/a', detail: 'Pick the campus to expand' };
  const k = a?.campus; if (!k) return { status: 'n/a', detail: 'Campus not found in the estate' };
  if (!k.rows.length) return { status: 'n/a', detail: 'No phases yet' };
  const bad = k.rows.filter(r => !r.ok);
  const head = `campus intake ${kw(k.campus.perSideKw)} per side, ${kw(k.campus.committedFacilityKw)} committed to the existing buildings${k.otherPlans.length ? `, ${kw(k.otherPlans.reduce((s, o) => s + o.kw, 0))} to approved expansions` : ''}${k.holdsKw ? `, ${kw(k.holdsKw)} held` : ''}: ${kw(k.headroomKw)} free`;
  if (bad.length) return { status: 'fail', detail: `${bad.map(r => `${r.phase.name} needs ${kw(r.facilityKw)} facility by ${day(r.phase.goLive)}, ${kw(r.availableKw)} available${r.upratesKw ? ` with ${kw(r.upratesKw)} of uprates energised` : ''} (${kw(r.shortKw)} short)`).join('; ')}. Today: ${head}.`, value: `${kw(bad[0].shortKw)} short` };
  return { status: 'pass', detail: `${k.rows.map(r => `${r.phase.name}: ${kw(r.facilityKw)} of ${kw(r.availableKw)}`).join('; ')}. Today: ${head}.` };
}
function siteKindAnswer(c: ScopeCtx, a?: BuildAnalysis): CheckResult {
  const prof = dcTypeProfile(c.plan.dcTypeKey);
  const dom = a?.campus?.dominantType;
  const telco = prof?.segment === 'Telco' && c.plan.designPowerKw > 1000;
  const differs = dom && dom.key !== c.plan.dcTypeKey ? ` The campus is mostly ${dcTypeProfile(dom.key)?.name ?? dom.key} (${kw(dom.kw)}).` : '';
  if (!prof) return { status: 'n/a', detail: 'No site type chosen' };
  return telco ? { status: 'warn', detail: `${prof.name} is a telco profile (−48 V DC plant) used for ${kw(c.plan.designPowerKw)}: above 1 MW an AC data-centre profile is the usual choice.${differs}` } : { status: 'pass', detail: `${prof.name} for ${kw(c.plan.designPowerKw)}.${differs}` };
}
function portfolioAnswer(check: string, m: PortfolioModel | undefined, c: ScopeCtx): CheckResult | undefined {
  if (!m) return { status: 'n/a', detail: 'Not checked: platform data still loading' };
  const rows = m.checks;
  switch (check) {
    case 'allocation-defined': return rows.length ? { status: 'pass', detail: `${rows.length} allocation row${rows.length === 1 ? '' : 's'}, ${kw(m.totals.allocatedKw)}${m.rowSource === 'scenario' ? ' (from the scenario)' : ''}` } : { status: 'fail', detail: 'No allocation yet: accept the proposal or add rows on Requirements' };
    case 'allocation-headroom': { if (!rows.length) return { status: 'n/a', detail: 'No allocation yet' }; const bad = rows.filter(r => !r.headroomOk); return bad.length ? { status: 'fail', detail: bad.map(r => `${r.row.name}: ${r.detail}`).join('; ') } : { status: 'pass', detail: rows.map(r => `${r.row.name}: ${r.detail}`).join('; ') }; }
    case 'allocation-lead': { if (!rows.length) return { status: 'n/a', detail: 'No allocation yet' }; const bad = rows.filter(r => !r.leadOk); return bad.length ? { status: 'fail', detail: bad.map(r => `${r.row.name} live ${day(r.row.goLive)}, earliest ${day(r.earliest)} (${r.option?.leadWeeks ?? '?'} weeks${r.option?.prerequisite ? `, ${r.option.prerequisite}` : ''})`).join('; ') } : { status: 'pass', detail: `Every row can be live by its date (earliest ${rows.map(r => `${r.row.name} ${day(r.earliest)}`).join(', ')})` }; }
    case 'allocation-gap': {
      if (!m.demand.length) return { status: 'n/a', detail: 'No demand curve (no sites in the region)' };
      const short = m.demand.map(d => ({ d, gap: d.needKw - d.existingKw - m.rows.filter(r => Number(r.goLive.slice(0, 4)) <= d.year).reduce((s, r) => s + r.itKw, 0) })).filter(x => x.gap > 1);
      return short.length ? { status: 'warn', detail: `Demand plus ${num(c, 'reservePct', 15)}% reserve not met in ${short.map(x => `${x.d.year} (${kw(x.gap)} short)`).join(', ')}` } : { status: 'pass', detail: `Demand plus reserve met every year to ${m.demand[m.demand.length - 1].year}` };
    }
    case 'lead-times': return { status: 'n/a', detail: 'Equipment is ordered by the child plans; delivery dates of the allocation are checked by R-POR-04' };
    default: return undefined;
  }
}

/* ------------------------------------------------------------------ the model */
export const buildModel: ScopeModel = {
  family: 'build',

  size(c, g) {
    const plan = c.plan;
    if (plan.scope === 'edge') {
      const a = edgeOf(c, g.pue.value);
      if (!a.sites.length) return g;
      const n = a.sites.length; const itKw = a.sites.reduce((s, x) => s + x.itKw, 0); const racks = a.sites.reduce((s, x) => s + x.racks, 0);
      const plant: PlantItem[] = a.groups.flatMap(gr => {
        const s0 = gr.sites.reduce((m, x) => (x.itKw > m.itKw ? x : m), gr.sites[0]);
        return [
          { name: `${gr.variant.label} · ${gr.variant.supply} supply ${s0.supplyKva} kVA per site`, kind: 'feed' as const, capacityKw: r0(s0.supplyKva * 0.95), count: gr.sites.length, redundancy: 'Single supply' },
          { name: `${gr.variant.label} · UPS ${s0.upsModules} × 10 kW per site`, kind: 'ups' as const, capacityKw: s0.upsKw, count: gr.sites.length, redundancy: 'N+1' },
          ...(gr.variant.generator ? [{ name: `${gr.variant.label} · genset ${s0.gensetKva} kVA per site`, kind: 'generator' as const, capacityKw: r0(s0.gensetKva * 0.8), count: gr.sites.length, redundancy: 'N' }] : []),
          { name: `${gr.variant.label} · direct-expansion units ${s0.coolingUnitKw} kW`, kind: 'cooling' as const, capacityKw: s0.coolingUnitKw, count: gr.sites.length * 2, redundancy: '1+1 per site' },
        ];
      });
      const maxUnit = Math.max(...a.sites.map(s => s.coolingUnitKw));
      const fte = Math.ceil(n / Math.max(1, num(c, 'sitesPerFieldTech', 8)));
      return {
        ...g, itKw, racks, halls: n, buildings: n, sites: n, plant,
        cooling: { ...g.cooling, units: n * 2, unitKw: maxUnit, capacityKw: n * 2 * maxUnit, redundancy: '1+1 per site' },
        network: { leaves: n * 2, spines: 0, cores: n * 2, uplinks: 0, accessPorts: racks * 48, uplinkGbps: g.network.uplinkGbps, carriers: num(c, 'accessCircuitsPerSite', 2), dciGbps: 0 },
        staffing: { fte, shifts: 1, perMw: itKw ? r1(fte / (itKw / 1000)) : 0, source: c.params['sitesPerFieldTech']?.source ?? 'template' },
      } satisfies Sizing;
    }
    if (plan.scope === 'expansion') {
      // Campus NOC, security and site management already exist: only the added roles are hired.
      const shared = num(c, 'campusSharedFte', 4);
      return { ...g, staffing: { ...g.staffing, fte: r1(Math.max(1, g.staffing.fte - shared)) } };
    }
    return g;
  },

  ladder(c, sizing, generic) {
    if (c.plan.scope !== 'expansion') return generic;
    const k = campOf(c, sizing.pue.value); if (!k) return generic;
    return generic.map(l => { const row = k.rows.find(r => r.phase.id === l.phase.id); return row && !row.ok ? { ...l, bindingConstraint: 'power' as LadderRow['bindingConstraint'] } : l; });
  },

  estimate(c, sizing, e) {
    const plan = c.plan;
    if (plan.scope === 'edge') {
      const n = edgeRows(plan).length; if (!n) return e;
      const circ = accessCircuitMonthly(c.data); const bmUsd = c.benchmarks.find(b => b.metric === 'price:accessCircuitMonthly')?.value ?? 1800;
      const usd = circ?.usd ?? bmUsd;
      const per = num(c, 'accessCircuitsPerSite', 2);
      const opex = e.opex.map(l => (/connectivity/i.test(l.item) ? { ...l, amount: r0(n * per * usd), basis: `${n} sites × ${per} access circuits × ${usd.toLocaleString('en-US')} USD a month (${circ ? `average of ${circ.sample} active 1 Gbps internet circuits in the platform` : 'benchmark: no edge-size circuit priced in the platform'})`, source: circ ? 'actual' as const : 'benchmark' as const } : l));
      return retotal(e, sizing.itKw, sizing.racks, e.capex, opex);
    }
    if (plan.scope === 'expansion') {
      // The campus land is already owned: no land line (shell stays, it is a new building).
      const capex = e.capex.filter(l => !(/^land\b/i.test(l.item) && !/shell/i.test(l.item)));
      return capex.length === e.capex.length ? e : retotal(e, sizing.itKw, sizing.racks, capex);
    }
    if (plan.scope === 'portfolio') {
      const m = portOf(c); if (!m || !m.checks.length) return e;
      const lines: EstimateLine[] = m.checks.map(k => ({ category: 'CapEx', item: `${k.row.name} · ${ROUTE_LABEL[k.row.route ?? 'expansion']}`, amount: k.capexUsd, basis: `${kw(k.row.itKw)} × ${(k.option?.costPerKw ?? 0).toLocaleString('en-US')} USD/kW (${k.option?.costBasis ?? 'route benchmark'})`, source: 'benchmark' }));
      return retotal(e, m.totals.allocatedKw || sizing.itKw, sizing.racks, [...lines, ...e.capex.filter(l => IT_LINE.test(l.item))]);
    }
    return e;
  },

  schedule(c, sizing, generic) {
    const plan = c.plan;
    if (plan.scope === 'edge') {
      const a = edgeOf(c, sizing.pue.value); if (!a.sites.length) return generic;
      return [...edgeSchedule(plan, a, c.params, c.benchmarks), ...generic.filter(x => x.kind === 'permit')].sort((x, y) => x.orderBy.localeCompare(y.orderBy));
    }
    if (plan.scope === 'portfolio') {
      const m = portOf(c);
      const gates: ScheduleItem[] = (m?.rows ?? []).map(r => ({ item: `${r.name} live (${ROUTE_LABEL[r.route ?? 'expansion']})`, leadWeeks: 0, needBy: r.goLive, orderBy: r.goLive, late: false, phase: r.goLive.slice(0, 4), kind: 'gate' }));
      return [...generic.filter(x => x.kind === 'permit'), ...gates].sort((x, y) => x.orderBy.localeCompare(y.orderBy));
    }
    // One calendar: the programme's own dates replace the generic gates.
    const { projects } = projectsFor(c);
    if (!projects.length) return generic;
    const gates: ScheduleItem[] = projects.filter(p => p.key !== 'it-procurement').map(p => ({ item: `${p.name.split(' — ').slice(1).join(' — ') || p.name} complete`, leadWeeks: 0, needBy: p.end, orderBy: p.end, late: false, phase: p.phaseName ?? 'All phases', phaseId: p.planPhaseId, kind: 'gate', note: p.gate }));
    return [...generic.filter(x => x.kind !== 'gate'), ...gates].sort((x, y) => x.orderBy.localeCompare(y.orderBy));
  },

  analyse(c, ev) {
    const plan = c.plan;
    const { key, projects } = projectsFor(c, ev.estimate);
    const bp = key ? getBlueprint(key) : undefined;
    const a: BuildAnalysis = { scope: plan.scope, dataReady: !!c.data?.ready, blueprintKey: key, projects, gates: permitGates(plan, projects, bp) };
    if (plan.scope === 'new-dc') {
      const cand = chosenCandidate(plan, c.params);
      a.feasibility = cand ? feasibility(plan, ev, cand) : undefined;
      a.candidates = scoreCandidates(plan, ev);
    }
    if (plan.scope === 'expansion') {
      a.campus = campOf(c, ev.sizing.pue.value);
      if (a.campus) a.shared = expansionBomLines(genericBomLines(plan, ev, c.benchmarks), a.campus, ev.sizing.itKw).shared;
    }
    if (plan.scope === 'portfolio') a.portfolio = portOf(c);
    if (plan.scope === 'edge') { a.edge = edgeOf(c, ev.sizing.pue.value); a.edgeLadder = edgeLadder(plan, a.edge, c.params); }
    return { build: a };
  },

  check(c, rule, ev) {
    const a = buildScope(ev); const scope = c.plan.scope;
    switch (rule.check) {
      case 'site-footprint': return feasibilityAnswer(a, 'footprint');
      case 'grid-offer': return feasibilityAnswer(a, 'grid');
      case 'grid-energisation': return feasibilityAnswer(a, 'energisation');
      case 'water-supply': return feasibilityAnswer(a, 'water');
      case 'zoning': return feasibilityAnswer(a, 'zoning', true);
      case 'candidates-compared': { const xs = a?.candidates ?? []; const best = [...xs].sort((x, y) => x.rank - y.rank)[0]; return xs.length >= 2 ? { status: 'pass', detail: `${xs.length} candidate sites compared; ${best.candidate.name} ranks first (${best.total} of 100${best.feasible ? '' : ', breaks a hard limit'})` } : { status: 'warn', detail: xs.length ? 'Only one site recorded: compare at least two plots before the design is fixed' : 'No candidate sites recorded' }; }
      case 'permit-gates': return permitAnswer(a, c.plan);
      case 'civil-before-fitout': return scope === 'new-dc' || scope === 'expansion' ? civilAnswer(a) : undefined;
      case 'campus-headroom': return campusAnswer(a, c);
      case 'site-kind': return siteKindAnswer(c, a);
      case 'allocation-defined': case 'allocation-headroom': case 'allocation-lead': case 'allocation-gap': return portfolioAnswer(rule.check, a?.portfolio, c);
      case 'lead-times': return scope === 'portfolio' ? portfolioAnswer('lead-times', a?.portfolio, c) : undefined;
      case 'liquid-above-density': {
        if (scope !== 'new-dc' && scope !== 'expansion') break;
        const limit = rule.threshold ?? 30; const hot = hotClasses(ev);
        if (!ev.sizing.rackClasses.length) return { status: 'n/a', detail: 'No racks in scope' };
        if (CLOSE_COUPLED.includes(ev.sizing.cooling.type)) return { status: 'pass', detail: `${ev.sizing.cooling.type} covers every rack class (largest ${Math.max(...ev.sizing.rackClasses.map(x => x.kw))} kW per rack)` };
        return hot.length ? { status: 'warn', detail: `${hot.map(h => `${h.name} racks at ${h.kw} kW`).join(', ')} exceed ${limit} kW with ${ev.sizing.cooling.type}: rear-door units for ${hot.reduce((s2, h) => s2 + h.racks, 0)} racks are in the bill of materials (mixed cooling)` } : { status: 'pass', detail: `Every rack class is at or below ${limit} kW (largest ${Math.max(...ev.sizing.rackClasses.map(x => x.kw))} kW)` };
      }
    }
    if (scope === 'edge' && a?.edge) return edgeRule(rule.check, a.edge, c.params);
    if (scope === 'edge' && rule.check === 'edge-variant-fit') return { status: 'n/a', detail: 'No sites chosen yet' };
    return undefined;
  },

  /* ---------------------------------------------------------------- outputs */
  bom(ev, add) {
    const plan = ev.ctx.plan; const a = buildScope(ev);
    if (plan.scope === 'portfolio') return true;
    if (plan.scope === 'edge') {
      if (!a?.edge?.sites.length) return false;
      edgeBomLines(plan, ev, a.edge, add);
      return true;
    }
    if (plan.scope === 'expansion' || plan.scope === 'new-dc') {
      const hot = hotClasses(ev).length > 0;
      if (plan.scope === 'new-dc' && !hot) return false;
      const generic = genericBomLines(plan, ev, ev.ctx.benchmarks);
      const lines = plan.scope === 'expansion' && a?.campus ? expansionBomLines(generic, a.campus, ev.sizing.itKw).lines : generic;
      for (const l of lines) { const { id: _id, total: _total, ...rest } = l; void _id; void _total; add(rest); }
      mixedCoolingLines(ev, add);
      return true;
    }
    return false;
  },

  ipPlan(ev, generic) {
    const plan = ev.ctx.plan;
    if (plan.scope === 'portfolio') return { aggregate: 'Allocated by each child plan', items: [], vlans: [], asns: [], usedAddresses: 0, totalAddresses: 0, containers: [], warnings: [] } satisfies IpPlan;
    if (plan.scope !== 'edge') return generic;
    const rows = edgeRows(plan); if (!rows.length) return generic;
    const density = Math.max(1, Number(ev.params['densityKwPerRack']?.value ?? 8));
    const reqs: IpRequest[] = rows.flatMap(r => {
      const racks = Math.max(1, Math.ceil(r.itKw / density));
      return [
        { scope: r.name, purpose: 'Production' as const, name: `${r.name} servers`, hosts: racks * 20, vlanFrom: 100, notes: `${racks} rack${racks === 1 ? '' : 's'} × about 20 hosts` },
        { scope: r.name, purpose: 'Management' as const, name: `${r.name} management`, hosts: 28, vlanFrom: 110, notes: 'UPS, genset controller, sensors, switch and BMC management' },
        { scope: r.name, purpose: 'OOB' as const, name: `${r.name} out of band`, hosts: 12, vlanFrom: 900, notes: 'SD-WAN LTE out-of-band and console' },
        { scope: r.name, purpose: 'Loopback' as const, name: `${r.name} loopbacks`, hosts: 4, notes: 'two edge routers, two switches' },
        { scope: r.name, purpose: 'Transit' as const, name: `${r.name} access circuit A`, hosts: 2, notes: 'hand-off to carrier A' },
        { scope: r.name, purpose: 'Transit' as const, name: `${r.name} access circuit B`, hosts: 2, notes: 'hand-off to carrier B (diverse)' },
      ];
    });
    return allocateIpPlan(plan, ev, reqs, [{ role: `Edge routers (one per site, ${rows.length} sites)`, count: rows.length }]);
  },

  bod(ev, sections) {
    const plan = ev.ctx.plan; const a = buildScope(ev); if (!a) return sections;
    const out = [...sections];
    const after = (id: string, s: BodSection) => { const i = out.findIndex(x => x.id === id); out.splice(i >= 0 ? i + 1 : out.length, 0, s); };
    if (plan.scope === 'new-dc' && a.feasibility) {
      const f = a.feasibility; const cd = f.candidate;
      after('site', { id: 'feasibility', title: 'Site feasibility', text: `${cd.name}${a.candidates && a.candidates.length > 1 ? `, chosen from ${a.candidates.length} candidate plots` : ''}.`, rows: [
        { label: 'Plot', value: `${cd.plotHa} ha, ${cd.buildableHa} ha buildable · ${cd.zoning}` },
        { label: 'Grid offer', value: `${cd.gridOfferMva} MVA ${cd.gridFirm ? 'firm' : 'non-firm'}, energised ${day(cd.gridEnergisation)}` },
        { label: 'Water', value: `${cd.waterM3PerDay} m³ a day available, ${f.waterM3PerDay} needed` },
        { label: 'Fibre', value: `${cd.fibreRoutes} route${cd.fibreRoutes === 1 ? '' : 's'}, ${cd.kmToPop} km to the nearest PoP` },
        { label: 'Hazards', value: [cd.floodZone && 'flood zone', cd.seismicZone && 'seismic zone'].filter(Boolean).join(', ') || 'none recorded' },
        { label: 'Land', value: `${(cd.landCostUsd / 1e6).toFixed(1)} M USD` },
        ...f.checks.map(ch => ({ label: ch.label, value: `${ch.ok ? (ch.warn ? 'Warning' : 'Pass') : 'Fail'} · ${ch.detail}` })),
      ] });
    }
    if (plan.scope === 'expansion' && a.campus) {
      const k = a.campus;
      after('site', { id: 'campus', title: 'Campus intake and shared plant', text: `${k.campus.campus.name}: ${k.campus.dataCenters.length} live building${k.campus.dataCenters.length === 1 ? '' : 's'}.`, rows: [
        { label: 'Intake per side', value: `${kw(k.campus.perSideKw)} (A ${kw(k.campus.feedsA)}, B ${kw(k.campus.feedsB)})`, source: 'Estate actual' },
        { label: 'Committed facility load', value: kw(k.campus.committedFacilityKw), source: 'Estate actual' },
        { label: 'Free today', value: kw(k.headroomKw) },
        ...k.uprates.map(u => ({ label: `Uprate · ${u.permit.name}`, value: `${kw(u.kw)} energised ${day(u.energisedBy)} (${u.basis})` })),
        ...k.rows.map(r => ({ label: r.phase.name, value: `${kw(r.facilityKw)} facility needed by ${day(r.phase.goLive)}, ${kw(r.availableKw)} available · ${r.ok ? 'fits' : `${kw(r.shortKw)} short`}` })),
        ...(a.shared ?? []).map(s => ({ label: `Shared · ${s.item}`, value: s.note })),
      ] });
    }
    if (plan.scope === 'portfolio' && a.portfolio) {
      const m = a.portfolio;
      after('purpose', { id: 'allocation', title: 'Allocation', text: m.rows.length ? `${m.rows.length} allocation rows, ${kw(m.totals.allocatedKw)}.` : 'No allocation accepted yet.', rows: [
        ...m.rows.map(r => ({ label: `${r.name} · ${ROUTE_LABEL[r.route ?? 'expansion']}`, value: `${kw(r.itKw)} live ${day(r.goLive)}` })),
        ...m.gaps.map(g => ({ label: `Gap ${g.year}`, value: `${kw(g.kw)}: ${g.reason}` })),
        ...m.dci.map(d => ({ label: `Interconnect ${d.a} to ${d.b}`, value: `${d.gbps} Gbps${d.km !== undefined ? `, ${d.km} km, about ${d.latencyMs} ms one way` : ''}` })),
      ] });
    }
    if (plan.scope === 'edge' && a.edge?.sites.length) {
      const i = out.findIndex(x => x.id === 'power');
      const power: BodSection = { id: 'power', title: '5. Power chain (per site, by variant)', rows: a.edge.groups.map(g => ({ label: `${g.variant.label} · ${g.sites.length} site${g.sites.length === 1 ? '' : 's'}`, value: `${g.variant.supply} supply; UPS ${g.sites[0].upsModules} × 10 kW N+1; ${g.variant.generator ? `genset ${g.sites[0].gensetKva} kVA` : `${g.variant.batteryHours} h lithium-ion battery, no generator`}; 2 × ${g.sites[0].coolingUnitKw} kW cooling` })) };
      if (i >= 0) out[i] = power; else out.push(power);
      after('site', { id: 'sites', title: 'Sites', rows: a.edge.sites.map(s => ({ label: s.row.name, value: `${s.variant.label}, ${kw(s.itKw)}, wave ${s.wave}, supply ${s.supplyKva} kVA${s.supplySource === 'benchmark' ? ' (assumed)' : ''}` })) });
      const n = out.findIndex(x => x.id === 'network');
      const per = Number(ev.params['accessCircuitsPerSite']?.value ?? 2);
      const net: BodSection = { id: 'network', title: '7. Network (per site)', rows: [
        { label: 'Routing and security', value: 'Two edge routers with firewall (redundant pair)' },
        { label: 'Switching', value: 'Two top-of-rack switches' },
        { label: 'WAN', value: `SD-WAN appliance with LTE out of band; ${per} diverse access circuits` },
        { label: 'Sites', value: `${a.edge.sites.length} sites: ${a.edge.sites.length * 2} routers, ${a.edge.sites.length * 2} switches, ${a.edge.sites.length * per} circuits` },
      ] };
      if (n >= 0) out[n] = net;
    }
    return out;
  },

  initiation(ev, _template, _bom, generic) {
    const plan = ev.ctx.plan; const templates = ev.ctx.templates;
    if (plan.scope === 'portfolio') {
      const m = buildScope(ev)?.portfolio;
      return { ...generic, vehicle: 'portfolio', projects: [], orders: [], blueprintKey: undefined, blueprintName: undefined, workOrder: { process: 'Started by each child plan', key: '' }, childPlans: (m?.checks ?? []).map(k => ({ rowId: k.row.id, scope: k.row.route === 'new-dc' ? 'new-dc' : k.row.route === 'hall' ? 'hall' : k.row.route === 'pod' ? 'pod' : 'expansion', title: `${k.row.name} · ${kw(k.row.itKw)}`, site: k.row.name, itKw: k.row.itKw, goLive: k.row.goLive, budget: k.capexUsd, note: k.row.notes })), notes: [...(generic.notes ?? []), 'A portfolio creates child plans on approval; each child plan is planned, approved and built on its own.'] };
    }
    if (plan.scope === 'edge') {
      const phases = planPhases(plan);
      const workOrders = edgeRows(plan).map(r => {
        const ph = phases[(r.wave ?? 1) - 1];
        const ps = generic.projects.filter(p => p.perSite && p.planPhaseId === ph?.id);
        const start = ps.reduce((m, p) => (p.start < m ? p.start : m), ps[0]?.start ?? plan.targetGoLive);
        const end = ps.reduce((m, p) => (p.end > m ? p.end : m), ps[0]?.end ?? plan.targetGoLive);
        return { name: `Edge site build · ${r.name}`, siteRef: r.id, planPhaseId: ph?.id, start, end, process: 'P10 Work order', key: 'work-order' };
      });
      return { ...generic, workOrders, atps: edgeAtpPlan(plan, generic.projects, templates), designDocs: [...generic.designDocs, { name: 'Site survey pack (per site)', type: 'Concept Design', discipline: 'Electrical' }] };
    }
    const docs = plan.scope === 'new-dc' ? [{ name: 'Site feasibility and candidate comparison', type: 'Concept Design' as const, discipline: 'Architectural' as const }, ...generic.designDocs] : [{ name: 'Campus tie-in and intake study', type: 'Concept Design' as const, discipline: 'Electrical' as const }, ...generic.designDocs];
    return { ...generic, designDocs: docs, atps: phaseAtpPlan(plan, generic.projects, templates) };
  },

  /* ---------------------------------------------------------------- wizard */
  blockers(draft, ev) {
    const out: ScopeBlocker[] = [];
    if (draft.scope === 'new-dc') {
      const xs = draft.candidates ?? [];
      if (!xs.length) out.push({ level: 'bad', text: 'Record the site facts (plot, grid offer, energisation, water) on Requirements', step: 'requirements' });
      else if (xs.length > 1 && !xs.some(x => x.chosen)) out.push({ level: 'bad', text: 'Choose one of the candidate sites', step: 'requirements' });
    }
    if (draft.scope === 'portfolio' && !(draft.sites ?? []).filter(r => r.status !== 'Rejected').length) out.push({ level: 'bad', text: 'No allocation: accept the proposal or add rows on Requirements', step: 'requirements' });
    if (draft.scope === 'edge') {
      const rows = edgeRows(draft);
      const sum = rows.reduce((a, r) => a + r.itKw, 0);
      if (rows.length && sum !== draft.designPowerKw) out.push({ level: 'bad', text: `Site loads sum to ${kw(sum)}, not the ${kw(draft.designPowerKw)} required`, step: 'requirements' });
      const waves = new Set(rows.map(r => r.wave ?? 1));
      if (rows.length && [...waves].some(w => w > draft.phases.length)) out.push({ level: 'bad', text: 'A site is in a wave that has no date', step: 'requirements' });
    }
    if (draft.scope === 'expansion') {
      const prof = dcTypeProfile(draft.dcTypeKey);
      if (prof?.segment === 'Telco' && draft.designPowerKw > 1000) out.push({ level: 'warn', text: `${prof.name} is a telco profile; above 1 MW choose an AC data-centre profile`, step: 'requirements' });
      const k = buildScope(ev)?.campus;
      if (k && k.rows.some(r => !r.ok) && !k.uprates.length) out.push({ level: 'warn', text: 'The campus intake is short and no grid uprate is on the permits', step: 'requirements' });
    }
    return out;
  },
  siteMissing(draft) {
    if (draft.scope === 'expansion') return !draft.campusId ? 'Pick the campus to expand' : !draft.dataCenterId && !draft.newSiteName?.trim() ? 'Name the new building' : undefined;
    if (draft.scope === 'edge') return !draft.regionId ? 'Pick the region' : !draft.newSiteName?.trim() ? 'Name the rollout' : !edgeRows(draft).length ? 'Pick the edge locations' : undefined;
    return null;
  },
  seedDraft(draft) {
    if (draft.scope === 'new-dc') return { candidates: draft.candidates ?? [] };
    if (draft.scope === 'portfolio' || draft.scope === 'edge') return { sites: draft.sites ?? [] };
    return {};
  },

  /* ---------------------------------------------------------------- governance and execution */
  reservations(plan, ev) {
    if (plan.scope !== 'expansion' || !plan.campusId) return [];
    const k = buildScope(ev)?.campus; const last = [...plan.phases].sort((a, b) => b.goLive.localeCompare(a.goLive))[0];
    const facility = k?.rows.length ? k.rows[k.rows.length - 1].facilityKw : r0(plan.designPowerKw * ev.sizing.pue.value);
    const r: ReservationRequest = { resourceType: 'PowerChain', resourceId: plan.campusId, quantity: facility, unit: 'kW', label: `Campus intake · ${plan.plnId} ${plan.newSiteName ?? plan.title}`, expiresAt: last ? new Date(new Date(last.goLive).getTime() + 90 * 864e5).toISOString() : undefined };
    return [r];
  },
  async executeVehicle(x) {
    const scope = x.plan.scope;
    if (scope === 'portfolio') { await subStep(x, 'child-plans', () => createChildPlans(x)); return; }
    const init = initiationOf(x);
    if (scope === 'new-dc' || scope === 'expansion') await subStep(x, 'site-records', () => createSiteRecords(x));
    const dcId = x.artefacts.createdSite?.dataCenterId ?? x.plan.dataCenterId;
    await subStep(x, 'programme', () => createProgramme(x, init, dcId));
    await subStep(x, 'work-order', () => startPlanWorkOrder(x, init, dcId));
  },
  async execute(x) {
    const scope = x.plan.scope;
    if (scope === 'portfolio') return;
    const init = initiationOf(x);
    await subStep(x, 'link-ip', () => linkIp(x));
    await subStep(x, 'link-permits', () => linkPermits(x, init));
    await subStep(x, 'atps', () => createAtps(x, init));
    if (scope === 'edge') { await subStep(x, 'site-work-orders', () => startSiteWorkOrders(x, init)); await subStep(x, 'edge-locations', () => touchEdgeLocations(x)); }
  },
  closeout(plan, data) {
    const out: CloseoutCheck[] = [];
    const a = plan.artefacts;
    if (plan.scope === 'portfolio') {
      const kids = data.plannerPlans.filter(p => (a?.childPlanIds ?? plan.childPlanIds ?? []).includes(p.id));
      out.push({ key: 'child-plans', label: 'Child plans completed', ok: kids.length > 0 && kids.every(k => k.status === 'Completed'), detail: kids.length ? kids.map(k => `${k.plnId} ${k.status}`).join(', ') : 'No child plans created' });
      return out;
    }
    const atps = data.atps.filter(t => t.plannerPlanId === plan.id);
    if (plan.scope === 'edge') {
      const sat = atps.filter(t => t.name.startsWith('Edge SAT'));
      out.push({ key: 'edge-sat', label: 'Site acceptance accepted at every site', ok: sat.length > 0 && sat.every(t => t.status === 'Accepted'), detail: sat.length ? `${sat.filter(t => t.status === 'Accepted').length} of ${sat.length} accepted` : 'No site acceptance tests created' });
      const locs = data.edgeLocations.filter(l => (a?.edgeLocationIds ?? []).includes(l.id));
      out.push({ key: 'edge-on-air', label: 'Edge locations on air', ok: locs.length > 0 && locs.every(l => l.status === 'on-air'), detail: locs.length ? `${locs.filter(l => l.status === 'on-air').length} of ${locs.length} on air` : 'No edge locations linked' });
      return out;
    }
    const dcId = a?.createdSite?.dataCenterId ?? plan.dataCenterId;
    const dc = data.dataCenters.find(d => d.id === dcId);
    if (plan.scope === 'new-dc' || a?.createdSite?.dataCenterId) out.push({ key: 'dc-operational', label: 'Data centre operational', ok: dc?.status === 'Operational', detail: dc ? `${dc.code} is ${dc.status}` : 'No data centre record' });
    const halls = data.halls.filter(h => (a?.createdSite?.hallIds ?? []).includes(h.id));
    out.push({ key: 'halls-live', label: 'Halls live', ok: halls.length > 0 && halls.every(h => h.status === 'Live'), detail: halls.length ? `${halls.filter(h => h.status === 'Live').length} of ${halls.length} live` : 'No halls created' });
    const l5 = atps.filter(t => t.level === 'L5 IST');
    out.push({ key: 'l5-accepted', label: 'Integrated systems test (L5) accepted for every phase', ok: l5.length > 0 && l5.every(t => t.status === 'Accepted'), detail: l5.length ? `${l5.filter(t => t.status === 'Accepted').length} of ${l5.length} accepted; ${atps.filter(t => t.status === 'Accepted').length} of ${atps.length} tests accepted in all` : 'No commissioning tests created' });
    return out;
  },
};
