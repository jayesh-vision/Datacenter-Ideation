/**
 * Scope model · plant upgrade: UPS modules, batteries, generators, transformers, chillers and room
 * cooling added to, replaced in or uprated in a live site.
 *
 * Everything is sized as a delta against the plant the site really has (lib/plantModel.ts): the
 * plan's lines are the bill, the estimate is the bill plus contingency, redundancy is checked per
 * system on real units, every cut-in step is checked for the capacity left against the live load,
 * and execution books the works as a 'Plant Upgrade Works' project with a change request and a
 * maintenance window per cut-in, planned plant records, ATPs per item and a hand-over record.
 */
import type * as T from '../../p2b/types';
import type { Evaluation, PlantItem, Sizing } from '../engine';
import type { BodSection, Initiation } from '../outputs';
import { byId, groupBy } from '../plannerData';
import { siteBaseline } from '../site';
import {
  ATP_STEPS, LINE_SYSTEM, POWER_SYSTEMS, SYSTEM_LABEL, analysePlant, atpSystemOf, lineUnitKw, plantEstimate, plantLadder, plantSchedule,
  type PlantAnalysis,
} from '../plantModel';
import type { CheckResult, CloseoutCheck, ExecCtx, ScopeBlocker, ScopeCtx, ScopeModel } from './types';
import { clockMs } from '../../compat/clock';

const r0 = (n: number) => Math.round(n);
const kw = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1)} MW` : `${Math.round(n)} kW`);
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
const nowIso = () => new Date(clockMs()).toISOString();

/* ------------------------------------------------------------------ analysis cache */
const CACHE = new WeakMap<ScopeCtx, PlantAnalysis>();
function analysis(c: ScopeCtx): PlantAnalysis {
  let a = CACHE.get(c);
  if (!a) { a = analysePlant(c); CACHE.set(c, a); }
  return a;
}
/** The plant analysis of an evaluated plan (UI and outputs read it from here). */
export const plantOf = (ev?: Evaluation): PlantAnalysis | undefined => (ev?.scope?.plant as PlantAnalysis | undefined);
const loading: CheckResult = { status: 'n/a', detail: 'Not checked: platform data still loading' };

/* ------------------------------------------------------------------ rule checks */
function check(c: ScopeCtx, rule: T.PlannerRuleDef, ev: Evaluation): CheckResult | undefined {
  const plantRule = rule.check.startsWith('plant-') || ['fuel-hours', 'commissioning-level', 'lead-times'].includes(rule.check);
  if (!plantRule) return undefined;
  if (rule.check === 'lead-times') {
    const late = ev.schedule.filter(s => s.late);
    if (!ev.schedule.some(s => s.kind === 'equipment')) return { status: 'n/a', detail: 'Not checked: no plant lines, so nothing to order' };
    return { status: late.length ? 'fail' : 'pass', detail: late.length ? `${late.length} item(s) cannot arrive before their stage needs them: ${late.map(l => l.item).join('; ')}` : `Every item fits its stage date (${ev.schedule.filter(s => s.kind === 'equipment').length} order lines, lead time at the benchmark high plus the schedule buffer)` };
  }
  if (!c.data?.ready) return loading;
  const an = analysis(c); const b = an.baseline;
  if (!b) return { status: 'n/a', detail: `Not checked: ${an.reason ?? 'no site'}` };
  const P = c.params; const lines = c.plan.plantLines ?? [];
  const sys = (k: string) => b.systems.find(s => s.system === k);
  const aft = (k: string) => an.after.find(s => s.system === k);
  const has = (...kinds: T.PlannerPlantLine['system'][]) => lines.some(l => kinds.includes(l.system));
  const declared = (k: string) => P[k]?.value === true;
  const sysCheck = (keys: string[], what: string): CheckResult => {
    const all = keys.map(k => ({ s: sys(k)!, a: aft(k)! }));
    const rows = all.filter(x => x.s?.recorded);
    const unrecorded = all.filter(x => !x.s?.recorded && x.a?.addedKw > 0).map(x => `${x.s.label}: ${kw(x.a.addedKw)} added but the existing units are not recorded, so it is not checked`);
    if (!rows.length) return { status: 'n/a', detail: `Not checked: no ${what} with ratings recorded at the site${unrecorded.length ? `; ${unrecorded.join('; ')}` : ''}` };
    const bad = rows.filter(x => x.a.usableKw < x.s.requiredKw);
    return { status: bad.length ? 'fail' : 'pass', detail: [...rows.map(x => `${x.s.label}: usable ${kw(x.a.usableKw)} at ${x.s.redundancy} after the works (${kw(x.s.usableKw)} today) against ${kw(x.s.requiredKw)} needed (${kw(x.s.committedKw)} committed + ${kw(c.plan.designPowerKw * x.s.factor)} this plan, ×${x.s.margin})`), ...unrecorded].join('; '), value: rows.map(x => `${Math.round((x.a.usableKw / Math.max(1, x.s.requiredKw)) * 100)}%`).join(' / ') };
  };
  switch (rule.check) {
    case 'plant-ups': return sysCheck(['ups'], 'UPS');
    case 'plant-feeds': return sysCheck(['utility', 'transformer'], 'utility feeds or transformers');
    case 'plant-generators': { const r = sysCheck(['generator'], 'generators'); return r.status === 'fail' ? { ...r, status: 'warn' } : r; }
    case 'plant-cooling': return sysCheck(['chiller', 'cooling'], 'cooling plant');
    case 'fuel-hours': {
      const gens = (groupBy(c.data, 'generators', 'dataCenterId').get(c.plan.dataCenterId!) ?? []).filter(g => g.status !== 'Failed' && g.status !== 'Planned' && g.status !== 'Retired');
      const tier = String(P.tier?.value ?? 'Tier III'); const need = tier === 'Tier IV' ? 48 : (rule.threshold ?? 24);
      if (!gens.length && !has('Generator')) return { status: 'n/a', detail: 'Not checked: no generators at the site and none added' };
      const hrs = gens.length ? Math.min(...gens.map(g => g.fuelHours)) : Number(P.generatorFuelHours?.value ?? 0);
      return { status: hrs >= need ? 'pass' : 'warn', detail: `${gens.length ? `Lowest recorded fuel autonomy ${hrs} h across ${gens.length} generator(s)` : `${hrs} h declared for the new generators`}; ${need} h expected for ${tier}`, value: `${hrs} h` };
    }
    case 'plant-cutin-capacity': {
      if (!lines.length) return { status: 'n/a', detail: 'Not checked: no plant lines' };
      if (!an.cutIns.length) return b.itLoadKw > 0 ? { status: 'fail', detail: `No cut-in sequence for a site carrying ${kw(b.itLoadKw)} of live load` } : { status: 'warn', detail: 'No cut-in sequence; the site carries no measured load today, so nothing is exposed yet' };
      const bad = an.cutIns.filter(x => !x.ok);
      return { status: bad.length ? 'fail' : 'pass', detail: bad.length ? bad.map(x => `Step ${x.order} (${x.step.title}): ${kw(x.remainingKw + x.temporaryKw)} left for ${kw(x.liveLoadKw)} live load`).join('; ') : `${an.cutIns.length} step(s); lowest margin ${kw(Math.min(...an.cutIns.map(x => x.remainingKw + x.temporaryKw - x.liveLoadKw)))} over the live load` };
    }
    case 'plant-cutin-mitigation': {
      if (!an.cutIns.length) return { status: 'n/a', detail: 'Not checked: no cut-in steps' };
      const below = an.cutIns.filter(x => x.redundancyLeft !== 'N+1 or better');
      if (!below.length) return { status: 'pass', detail: 'Every step keeps N+1 or better' };
      const bare = below.filter(x => x.step.transfer === 'None' && !x.step.mitigation?.trim());
      return { status: bare.length ? 'warn' : 'pass', detail: `${below.length} step(s) below N+1 (${below.map(x => `${x.order}: ${x.redundancyLeft}`).join(', ')}); ${bare.length ? `${bare.length} without a transfer method or mitigation` : 'each has a transfer method or mitigation and temporary plant in the bill'}` };
    }
    case 'plant-cutin-clash': {
      if (!an.cutIns.length) return { status: 'n/a', detail: 'Not checked: no cut-in steps' };
      const block = an.cutIns.flatMap(x => x.clashes.filter(k => k.severity === 'block').map(k => `step ${x.order} with ${k.title}`));
      const warn = an.cutIns.flatMap(x => x.clashes.filter(k => k.severity === 'warn'));
      return { status: block.length ? 'fail' : warn.length ? 'warn' : 'pass', detail: block.length ? `Blocking clashes: ${block.join('; ')}` : warn.length ? `${warn.length} other window(s) or change(s) at the site at the same time` : `${an.cutIns.length} window(s) checked against maintenance windows and open changes at the site` };
    }
    case 'plant-frame-slots': {
      const need = an.frameSlotsNeeded; if (!need) return { status: 'n/a', detail: 'Not checked: no UPS modules added' };
      const frames = lines.filter(l => l.system === 'UPS' && l.action === 'add').map(l => byId(c.data!, 'upsUnits', l.targetAssetId)).filter((u): u is T.UPS => !!u);
      const recorded = frames.filter(u => u.frameSlots !== undefined && u.modulesInstalled !== undefined);
      if (recorded.length) { const free = recorded.reduce((a, u) => a + Math.max(0, (u.frameSlots ?? 0) - (u.modulesInstalled ?? 0)), 0); return { status: free >= need ? 'pass' : 'fail', detail: `${free} free slot(s) recorded in ${recorded.map(u => u.name).join(', ')} for ${need} module(s)` }; }
      const declaredSlots = Number(P.upsFrameSpareSlots?.value ?? NaN);
      if (!Number.isFinite(declaredSlots)) return { status: 'n/a', detail: `Not checked: the UPS records do not hold frame slots; enter the spare slots per frame (${need} module(s) to fit)` };
      return { status: declaredSlots >= need ? 'pass' : 'fail', detail: `Declared: ${declaredSlots} spare slot(s) for ${need} module(s) (frame slots are not in the UPS records)` };
    }
    case 'plant-battery-runtime': {
      const start = Number(P.generatorStartSec?.value ?? 10), transfer = Number(P.transferSec?.value ?? 5);
      const needMin = Math.max(5, Math.ceil(((start + transfer) * 3) / 60));
      const rt = an.runtimeAfterMin ?? b.runtimeMin ?? (has('UPS', 'Battery') ? Number(P.upsRuntimeMin?.value ?? 0) : undefined);
      if (rt === undefined) return { status: 'n/a', detail: 'Not checked: no UPS runtime recorded and no UPS or battery lines' };
      const src = an.runtimeAfterMin !== undefined ? `lowest recorded runtime ${b.runtimeMin} min scaled to the load after the works` : b.runtimeMin !== undefined ? 'lowest runtime in the UPS records (no measured load to scale it)' : 'declared runtime for the new modules';
      return { status: rt >= needMin ? 'pass' : 'fail', detail: `${rt} min (${src}) against ${needMin} min: three generator start attempts of ${start} s plus ${transfer} s transfer, never under 5 min`, value: `${rt} min` };
    }
    case 'plant-protection-study': {
      if (!lines.some(l => POWER_SYSTEMS.includes(LINE_SYSTEM[l.system]))) return { status: 'n/a', detail: 'Not checked: no electrical plant added' };
      return declared('protectionStudyDone') ? { status: 'pass', detail: 'Declared: short-circuit, discrimination and protection study done for the new plant' } : { status: 'fail', detail: 'The study is not marked done; breaker settings and fault ratings cannot be confirmed before the cut-ins' };
    }
    case 'plant-arc-flash': {
      if (!lines.some(l => POWER_SYSTEMS.includes(LINE_SYSTEM[l.system]))) return { status: 'n/a', detail: 'Not checked: no electrical plant added' };
      return declared('arcFlashLabels') ? { status: 'pass', detail: 'Declared: arc-flash study updated and new labels planned' } : { status: 'warn', detail: 'Arc-flash labels are not marked as updated for the new fault levels' };
    }
    case 'plant-emissions-permit': {
      if (!has('Generator')) return { status: 'n/a', detail: 'Not checked: no generators added' };
      const pm = c.plan.permits.find(x => /emission|air/i.test(x.name));
      if (!pm) return { status: 'fail', detail: 'Generators are added but no emissions permit is listed' };
      return { status: pm.status === 'Expired' ? 'fail' : pm.status === 'Approved' ? 'pass' : 'warn', detail: `${pm.name} (${pm.authority}): ${pm.status}, needed before ${day(pm.neededBefore)}` };
    }
    case 'plant-fgas': {
      if (!has('Chiller', 'CRAH', 'Dry cooler')) return { status: 'n/a', detail: 'Not checked: no refrigerant plant added' };
      const pm = c.plan.permits.find(x => /refrigerant|f-gas/i.test(x.name));
      return declared('fgasCertifiedContractor') || pm?.status === 'Approved' ? { status: 'pass', detail: pm?.status === 'Approved' ? `${pm.name}: approved` : 'Declared: refrigerant handled by an F-gas certified contractor with leak checks logged' } : { status: 'warn', detail: 'Refrigerant handling is not confirmed (certified contractor or refrigerant permit)' };
    }
    case 'plant-lift-plan': {
      const heavy = lines.filter(l => ['Chiller', 'Generator', 'Transformer', 'Dry cooler'].includes(l.system));
      if (!heavy.length) return { status: 'n/a', detail: 'Not checked: no heavy plant to lift' };
      return declared('craneLiftPlan') ? { status: 'pass', detail: `Declared: lift plan and structural check for ${heavy.reduce((a, l) => a + l.qty, 0)} heavy item(s)` } : { status: 'warn', detail: `${heavy.reduce((a, l) => a + l.qty, 0)} heavy item(s) without a lift plan` };
    }
    case 'plant-cost-benchmark': {
      const band = ev.estimate.benchmarkBand; const per = ev.estimate.capexPerKw;
      if (!an.addedPlantKw) return { status: 'n/a', detail: 'Not checked: no capacity added' };
      if (!band) return { status: 'n/a', detail: 'Not checked: no benchmark for plant works per kW added' };
      return { status: per >= band.low * 0.8 && per <= band.high * 1.1 ? 'pass' : 'warn', detail: `${per.toLocaleString('en-US')} USD per kW of plant added (${kw(an.addedPlantKw)}) against ${band.low.toLocaleString('en-US')} to ${band.high.toLocaleString('en-US')} (${band.source})`, value: `${per.toLocaleString('en-US')} USD/kW` };
    }
    case 'commissioning-level': {
      const need = 5; const have = Number(P.commissioningLevel?.value ?? 5);
      if (!lines.length) return { status: 'n/a', detail: 'Not checked: nothing to commission' };
      const ist = ev.schedule.some(s => /L5 integrated/.test(s.item));
      return { status: have >= need && ist ? 'pass' : 'fail', detail: `Level ${have} planned; L3 and L4 tests per new item and an L5 integrated test with load banks ${ist ? 'are in the schedule' : 'are missing from the schedule'}` };
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ sizing */
function size(c: ScopeCtx, generic: Sizing): Sizing {
  const an = analysis(c);
  const plant: PlantItem[] = an.lines.filter(l => l.line.system !== 'Battery').map(l => ({ name: `${l.line.system}${l.line.model ? ` ${l.line.model}` : ''} (${l.line.action})`, kind: l.system === 'ups' ? 'ups' : l.system === 'generator' ? 'generator' : l.system === 'transformer' ? 'transformer' : l.system === 'cooling' && l.line.system === 'CDU' ? 'cdu' : l.system === 'cooling' || l.system === 'chiller' ? 'cooling' : 'pdu', capacityKw: l.unitKw, count: l.line.action === 'uprate' ? 1 : l.line.qty, redundancy: an.baseline?.systems.find(s => s.system === l.system)?.redundancy ?? 'N+1' }));
  const cool = an.after.find(a => a.system === 'cooling');
  return {
    ...generic, itKw: c.plan.designPowerKw, racks: 0, halls: 0, buildings: 0, whiteSpaceM2: 0, grossAreaM2: 0, rackClasses: [], plant,
    network: { leaves: 0, spines: 0, cores: 0, uplinks: 0, accessPorts: 0, uplinkGbps: 0, carriers: 0, dciGbps: 0 },
    staffing: { fte: 0, shifts: 0, perMw: 0, source: generic.staffing.source }, spares: { lines: 0, valueUsd: 0 },
    cooling: { ...generic.cooling, capacityKw: cool?.usableKw ?? 0, units: cool?.units.length ?? 0, unitKw: cool?.units.length ? Math.max(...cool.units.map(u => u.capacityKw)) : 0, liquidRequired: false },
  };
}

/* ------------------------------------------------------------------ outputs */
function bod(ev: Evaluation, sections: BodSection[]): BodSection[] {
  const an = plantOf(ev); const b = an?.baseline; const plan = ev.ctx.plan;
  if (!an || !b) return sections;
  const keep = (id: string) => sections.find(s => s.id === id);
  const purpose: BodSection = { id: 'purpose', title: '1. Purpose', text: plan.intent || 'Plant upgrade.', rows: [{ label: 'Load the plant must support', value: `${kw(plan.designPowerKw)} of IT on top of ${kw(b.committedItKw)} committed today` }, { label: 'Capacity enabled', value: `${kw(an.capacityEnabledKw)} of IT the site can accept after the works (${kw(an.headroomBeforeKw)} today)` }, { label: 'Binding system after the works', value: an.bindingAfter ? SYSTEM_LABEL[an.bindingAfter] : '—' }] };
  const asIs: BodSection = { id: 'asis', title: '2. As-is plant (from the site records)', rows: b.systems.map(s => ({ label: s.label, value: s.recorded ? `${s.units.length} unit(s), ${kw(s.installedKw)} installed, ${kw(s.usableKw)} usable at ${s.redundancy}; load ${kw(s.loadKw)} (${s.loadSource}), ${kw(s.reservedKw + s.pipelineKw)} held by other plans` : 'not recorded', source: s.recorded ? 'Estate actual' : undefined })) };
  const toBe: BodSection = { id: 'tobe', title: '3. To-be plant', rows: [...an.lines.map(l => ({ label: `${l.line.action === 'add' ? 'Add' : l.line.action === 'replace' ? 'Replace' : 'Uprate'} · ${l.line.system}`, value: `${l.line.action === 'uprate' ? '' : `${l.line.qty} × `}${l.ratingNote}${l.target ? ` (${l.line.action === 'add' ? 'joins' : l.line.action === 'replace' ? 'replaces' : 'uprates'} ${l.target.name})` : ''}, stage ${l.line.stage ?? 1}` })), ...an.after.filter(a => a.units.length).map(a => ({ label: `${SYSTEM_LABEL[a.system]} after`, value: `${kw(a.usableKw)} usable against ${kw(a.requiredKw)} needed: ${a.ok ? 'meets' : 'short'}` }))] };
  const cut: BodSection = { id: 'cutins', title: '4. Cut-in sequence and redundancy during the works', rows: an.cutIns.length ? an.cutIns.map(x => ({ label: `Step ${x.order} · ${x.step.title}`, value: `${x.isolated.map(u => u.name).join(', ') || 'nothing'} isolated; ${kw(x.remainingKw + x.temporaryKw)} left for ${kw(x.liveLoadKw)} live (${x.redundancyLeft}); transfer: ${x.step.transfer}; ${x.exposedRackIds.length} racks, ${x.services} services exposed; window ${day(x.window.start)}${x.window.proposed ? ' (proposed)' : ''}; rollback: ${x.step.rollback || '—'}` })) : [{ label: 'Cut-ins', value: 'No cut-in steps defined' }] };
  const P = ev.params;
  const studies: BodSection = { id: 'studies', title: '5. Studies and permits', rows: [{ label: 'Short-circuit and protection study', value: P.protectionStudyDone?.value === true ? 'Done (declared)' : 'Not done' }, { label: 'Arc-flash labels', value: P.arcFlashLabels?.value === true ? 'Updated (declared)' : 'Not updated' }, { label: 'Lift plan', value: P.craneLiftPlan?.value === true ? 'In place (declared)' : 'Not in place' }, { label: 'Refrigerant handling', value: P.fgasCertifiedContractor?.value === true ? 'Certified contractor (declared)' : 'Not confirmed' }, ...plan.permits.map(pm => ({ label: pm.name, value: `${pm.authority}, ${pm.leadWeeks} weeks, ${pm.status}` }))] };
  const stages: BodSection = { id: 'schedule', title: '6. Stages', rows: an.stages.map(s => ({ label: `Stage ${s.stage} · ${s.name}`, value: `${s.lines.length} line(s); MOP ${day(s.mop)}, FAT ${day(s.fat)}, delivery ${day(s.delivery)}, handover ${day(s.need)}` })) };
  const e = ev.estimate;
  const cost: BodSection = { id: 'cost', title: '7. Cost', rows: [{ label: 'CapEx', value: `${Math.round(e.capexTotal).toLocaleString('en-US')} USD (bill of materials plus ${Math.round(e.contingencyUsd ?? 0).toLocaleString('en-US')} USD contingency)` }, { label: 'Per kW of plant added', value: `${e.capexPerKw.toLocaleString('en-US')} USD` }, { label: 'OpEx added', value: `${Math.round(e.opexMonthly).toLocaleString('en-US')} USD a month (maintenance and fixed losses)` }] };
  return [purpose, keep('site'), asIs, toBe, cut, studies, stages, cost, keep('risks'), keep('standards')].filter((s): s is BodSection => !!s).map((s, i) => ({ ...s, title: s.title.replace(/^\d+\.\s*/, `${i + 1}. `) }));
}

function initiation(ev: Evaluation, _template: T.PlannerTemplate | undefined, _bom: unknown, generic: Initiation): Initiation {
  const an = plantOf(ev); const plan = ev.ctx.plan;
  const end = an?.stages[an.stages.length - 1]?.need ?? plan.targetGoLive;
  const orders = ev.schedule.filter(s => s.kind === 'equipment').map(s => ({ item: s.item, category: (/chiller|CRAH|cool|refrigerant/i.test(s.item) ? 'Cooling' : 'Power') as Initiation['orders'][number]['category'], value: (an?.bill ?? []).filter(l => l.phaseId === s.phaseId && s.item.includes(l.item)).reduce((a, l) => a + Math.round(l.qty) * l.unitCost, 0), orderBy: s.orderBy, needBy: s.needBy, late: s.late }));
  const cooling = (plan.plantLines ?? []).some(l => ['Chiller', 'Dry cooler', 'CRAH', 'CDU'].includes(l.system));
  return {
    ...generic, vehicle: 'project', blueprintKey: undefined, blueprintName: 'Plant Upgrade Works (delivery template)',
    projects: [{ name: plan.title, start: nowIso(), end, budget: ev.estimate.capexTotal, gate: 'Studies and MOP approved', longLead: true, template: 'Plant Upgrade Works' }],
    orders,
    designDocs: [
      { name: 'Basis of design (as-is, to-be, cut-ins, studies)', type: 'Concept Design', discipline: 'Electrical' },
      { name: 'Single-line diagram, as-is and to-be', type: 'Schematic Design', discipline: 'Electrical' },
      { name: 'Short-circuit, protection and arc-flash study', type: 'Detailed Design', discipline: 'Electrical' },
      { name: 'Method of procedure per cut-in (MOP), with rollback', type: 'Detailed Design', discipline: 'Electrical' },
      ...(cooling ? [{ name: 'Mechanical schematic, chilled water and room cooling', type: 'Schematic Design' as const, discipline: 'Mechanical' as const }] : []),
      { name: 'Commissioning plan (L3 to L5)', type: 'Detailed Design', discipline: cooling ? 'Mechanical' : 'Electrical' },
    ],
    workOrder: { process: 'P10 Work order', key: 'work-order' },
    change: { title: `${plan.title} · cut-ins`, type: 'PowerUpgrade' },
  };
}

/* ------------------------------------------------------------------ wizard */
function blockers(draft: T.PlannerPlan, ev?: Evaluation): ScopeBlocker[] {
  const out: ScopeBlocker[] = [];
  const lines = draft.plantLines ?? [];
  if (!lines.length) out.push({ level: 'bad', text: 'No plant lines: say what is added, replaced or uprated', step: 'dim:power' });
  const an = plantOf(ev);
  for (const l of an?.lines ?? []) for (const pr of l.problems) out.push({ level: 'bad', text: `${l.line.system} line: ${pr}`, step: l.system === 'chiller' || l.system === 'cooling' ? 'dim:cooling' : 'dim:power' });
  if (lines.length && !(draft.cutIns ?? []).length) out.push({ level: (an?.baseline?.itLoadKw ?? 0) > 0 ? 'bad' : 'warn', text: 'No cut-in sequence: plan how each item is connected without dropping the live load', step: 'dim:delivery' });
  for (const x of an?.cutIns ?? []) {
    if (!x.ok) out.push({ level: 'bad', text: `Cut-in step ${x.order}: ${kw(x.remainingKw + x.temporaryKw)} left for ${kw(x.liveLoadKw)} live load`, step: 'dim:delivery' });
    if (!x.isolated.length) out.push({ level: 'warn', text: `Cut-in step ${x.order} isolates nothing`, step: 'dim:delivery' });
    if (!x.step.rollback?.trim()) out.push({ level: 'warn', text: `Cut-in step ${x.order} has no rollback`, step: 'dim:delivery' });
  }
  if (an?.ready && an.lines.length && draft.designPowerKw <= 0) out.push({ level: 'warn', text: 'No load to support entered: the plan sizes against today’s committed load only', step: 'requirements' });
  return out;
}

function seedDraft(draft: T.PlannerPlan): Partial<T.PlannerPlan> {
  return { plantLines: draft.plantLines ?? [], cutIns: draft.cutIns ?? [], params: { ...draft.params, protectionStudyDone: draft.params.protectionStudyDone ?? false } };
}

/* ------------------------------------------------------------------ execution */
async function executeVehicle(x: ExecCtx): Promise<void> {
  const { plan, ev } = x; const an = plantOf(ev);
  const systems = [...new Set((plan.plantLines ?? []).map(l => l.system))].join(', ');
  const end = an?.stages[an.stages.length - 1]?.need ?? plan.targetGoLive;
  const budget = plan.baseline?.capexTotal ?? ev.estimate.capexTotal;
  const programId = await x.createProgram({ name: plan.title, type: 'Capacity Expansion', objective: plan.intent || plan.title, ownerName: plan.ownerName, budget, status: 'Active', startDate: nowIso(), endDate: end });
  x.update('programs', programId, { plannerPlanId: plan.id });
  x.artefacts.programId = programId;
  const projectId = await x.createProject({ name: plan.title, programId, template: 'Plant Upgrade Works', managerName: plan.ownerName, dataCenterId: plan.dataCenterId, plannedStart: nowIso(), plannedEnd: end, budget, detail: { planId: plan.id, plnId: plan.plnId, systems, addedKw: an?.addedPlantKw ?? 0, redundancy: String(ev.params.redundancy?.value ?? 'N+1'), capacityEnabledKw: an?.capacityEnabledKw ?? 0, cutIns: (plan.cutIns ?? []).length, stages: an?.stages.map(s => ({ stage: s.stage, name: s.name, mop: s.mop, fat: s.fat, delivery: s.delivery, handover: s.need })) } });
  if (!projectId) throw new Error('The Plant Upgrade Works project could not be created');
  x.update('projects', projectId, { plannerPlanId: plan.id });
  x.artefacts.projectIds = [...(x.artefacts.projectIds ?? []), projectId];
  const inst = await x.startProcess('work-order', plan.plnId, { recordType: 'project', recordId: projectId, dataCenterId: plan.dataCenterId, title: plan.title, variables: { planId: plan.id, scope: plan.scope, capex: budget } });
  if (!inst) x.warn('The P10 work order could not be started; start it from Work orders');
  x.artefacts.processInstanceId = inst?.id;
}

async function execute(x: ExecCtx): Promise<void> {
  const { plan, ev, data } = x; const an = plantOf(ev);
  if (!an?.baseline) throw new Error(`Plant analysis unavailable: ${an?.reason ?? 'no site'}`);
  const projectId = x.artefacts.projectIds?.[0];
  const mine = <R extends { plannerPlanId?: string }>(xs: R[]) => xs.filter(r => r.plannerPlanId === plan.id);
  // 1. A change request and a maintenance window per cut-in step (power changes take the facilities sign-off matrix).
  const rule = data.approvalMatrixRules.find(r => r.changeType === 'PowerUpgrade');
  const cutIns = [...(plan.cutIns ?? [])];
  for (const ci of an.cutIns) {
    const s = ci.step; const idx = cutIns.findIndex(z => z.id === s.id);
    const existing = mine(data.changeRequests).find(c => c.title.includes(`[${s.id}]`));
    if (existing || s.changeRequestId) continue;
    const chg = x.seq('changeRequests', 'CHG');
    const mop = [`MOP for plan ${plan.plnId}, step ${ci.order}: ${s.title}.`, `Isolate: ${ci.isolated.map(u => u.name).join(', ') || '—'}.`, `Transfer: ${s.transfer}${s.temporaryPlant ? ` with ${s.temporaryPlant}` : ''}.`, `Remaining: ${kw(ci.remainingKw + ci.temporaryKw)} for ${kw(ci.liveLoadKw)} live load (${ci.redundancyLeft}).`, `Exposed: ${ci.exposedRackIds.length} racks, ${ci.services} services (${ci.critical} critical).`, `Mitigation: ${s.mitigation || '—'}.`].join(' ');
    x.create('changeRequests', { id: chg, chgId: chg, title: `${plan.title.split('·')[0].trim()} · cut-in ${ci.order}: ${s.title} [${s.id}]`, type: 'PowerUpgrade', description: mop, risk: ci.redundancyLeft === 'N+1 or better' ? 'Medium' : ci.redundancyLeft === 'N' ? 'High' : 'Critical', status: 'Submitted', priority: 'High', affectedResourceType: ci.system === 'chiller' || ci.system === 'cooling' ? 'Cooling' : 'PowerChain', affectedResourceIds: [...ci.isolated.map(u => u.id), ...ci.exposedRackIds], dataCenterId: plan.dataCenterId, requestedBy: x.actor, requestedById: 'me', scheduledStart: ci.window.start, scheduledEnd: ci.window.end, policyViolations: [], approvalRuleId: rule?.id, rollbackPlan: s.rollback || 'Restore the isolated plant and return the load to normal', projectId, plannerPlanId: plan.id });
    const mw = x.seq('maintenanceWindows', 'MW');
    x.create('maintenanceWindows', { id: mw, mwId: mw, title: `Cut-in ${ci.order}: ${s.title} · ${plan.plnId}`, status: 'Scheduled', dataCenterId: plan.dataCenterId, changeRequestId: chg, scheduledStart: ci.window.start, scheduledEnd: ci.window.end, affectedDeviceIds: ci.exposedDeviceIds.slice(0, 500), impact: `${ci.redundancyLeft} while ${ci.isolated.map(u => u.name).join(', ')} is isolated; ${ci.exposedRackIds.length} racks and ${ci.services} services exposed`, owner: plan.ownerName, plannerPlanId: plan.id });
    x.artefacts.changeRequestIds = [...(x.artefacts.changeRequestIds ?? []), chg];
    x.artefacts.maintenanceWindowIds = [...(x.artefacts.maintenanceWindowIds ?? []), mw];
    if (idx >= 0) cutIns[idx] = { ...cutIns[idx], windowStart: ci.window.start, windowEnd: ci.window.end, changeRequestId: chg, maintenanceWindowId: mw, status: 'Scheduled' };
    const inst = await x.startProcess('change', chg, { recordType: 'changeRequest', recordId: chg, dataCenterId: plan.dataCenterId, title: `Cut-in ${ci.order}: ${s.title}`, variables: { planId: plan.id } });
    if (!inst) x.warn(`The change process for ${chg} could not be started; start it from Changes`);
  }
  x.planPatch.cutIns = cutIns;
  // 2. Planned plant records for every added unit, linked to the feed or zone; replaced units are flagged for disposal at closeout.
  const tier = String(ev.params.tier?.value ?? 'Tier III');
  const made: { entity: string; id: string; tag?: string }[] = [...(x.artefacts.plantUnitIds ?? [])];
  const PLANT_ENTITIES = ['upsUnits', 'generators', 'transformers', 'chillers', 'cracUnits'] as const;
  const existingFor = (lineId: string) => PLANT_ENTITIES.reduce((a, e) => a + (data[e] as { plannerPlanId?: string; notes?: string }[]).filter(rec => rec.plannerPlanId === plan.id && rec.notes?.includes(`[${lineId}]`)).length, 0);
  const dispositions = [...(plan.dispositions ?? [])];
  for (const r of an.lines) {
    const l = r.line; if (l.system === 'Battery' || l.system === 'Switchgear' || l.action === 'uprate') continue;
    if (existingFor(l.id) + made.filter(m => m.tag === l.id).length >= l.qty) continue;
    const { kw: unitKw } = lineUnitKw(l, tier);
    for (let i = 0; i < l.qty; i++) {
      const tag = `[${l.id}] unit ${i + 1}`; const base = { plannerPlanId: plan.id, status: 'Planned', notes: `Planned by ${plan.plnId} ${tag}`, installedDate: undefined };
      if (l.system === 'UPS') { const id = x.seq('upsUnits', 'UPS'); x.create('upsUnits', { id, upsId: id, dataCenterId: plan.dataCenterId, name: `UPS module ${i + 1} (${plan.plnId})`, capacityKw: r0(unitKw), loadKw: 0, loadPct: 0, redundancy: String(ev.params.redundancy?.value ?? 'N+1'), runtimeMinutes: Number(ev.params.upsRuntimeMin?.value ?? 10), feedId: r.target?.feedId, manufacturer: l.manufacturer ?? r.target?.model?.split(' ')[0], model: l.model, ...base }); made.push({ entity: 'upsUnits', id, tag: l.id }); }
      else if (l.system === 'Generator') { const id = x.seq('generators', 'GEN'); x.create('generators', { id, genId: id, dataCenterId: plan.dataCenterId, name: `Generator ${i + 1} (${plan.plnId})`, capacityKva: l.ratingKva ?? r0(unitKw / 0.8), capacityKw: r0(l.ratingKw || (l.ratingKva ?? 0) * (l.powerFactor ?? 0.8)), fuelHours: Number(ev.params.generatorFuelHours?.value ?? 24), redundancyRole: 'Redundant', model: l.model, ...base }); made.push({ entity: 'generators', id, tag: l.id }); }
      else if (l.system === 'Transformer') { const id = x.seq('transformers', 'XFMR'); x.create('transformers', { id, xfmrId: id, feedId: r.target?.feedId ?? data.utilityFeeds.find(f => f.dataCenterId === plan.dataCenterId)?.id, name: `Transformer ${i + 1} (${plan.plnId})`, capacityKva: l.ratingKva ?? r0(unitKw / 0.95), loadKw: 0, model: l.model, ...base }); made.push({ entity: 'transformers', id, tag: l.id }); }
      else if (l.system === 'Chiller' || l.system === 'Dry cooler') { const id = x.seq('chillers', 'CHL'); x.create('chillers', { id, chlrId: id, dataCenterId: plan.dataCenterId, name: `${l.system} ${i + 1} (${plan.plnId})`, type: l.system === 'Dry cooler' ? 'Dry cooler' : 'Air-cooled chiller', capacityKw: r0(unitKw), loadKw: 0, supplyTempC: 18, servesZoneIds: (groupBy(data, 'coolingZones', 'dataCenterId').get(plan.dataCenterId!) ?? []).map(z => z.id), model: l.model, ...base }); made.push({ entity: 'chillers', id, tag: l.id }); }
      else if (l.system === 'CRAH' || l.system === 'CDU') { const id = x.seq('cracUnits', 'CRAC'); x.create('cracUnits', { id, cracId: id, coolingZoneId: l.zoneId ?? r.target?.zoneId ?? (groupBy(data, 'coolingZones', 'dataCenterId').get(plan.dataCenterId!) ?? [])[0]?.id, name: `${l.system} ${i + 1} (${plan.plnId})`, capacityKw: r0(unitKw), type: l.system, supplyTempC: 18, returnTempC: 30, model: l.model, ...base }); made.push({ entity: 'cracUnits', id, tag: l.id }); }
    }
    if (l.action === 'replace' && r.target && !dispositions.some(d => d.recordId === r.target!.id)) dispositions.push({ recordType: 'plant', recordId: r.target.id, label: r.target.name, disposition: 'dispose', date: an.stages.find(s => s.stage === (l.stage ?? 1))?.need, notes: `Replaced by line ${l.id}; retire after its cut-in and the L5 test` });
  }
  x.artefacts.plantUnitIds = made.map(m => ({ entity: m.entity, id: m.id }));
  if (dispositions.length) x.planPatch.dispositions = dispositions;
  // 3. Acceptance tests: L3 and L4 per new line, one L5 integrated test per stage; a hand-over record for operations.
  if (projectId) {
    const haveAtp = new Set(mine(data.atps).map(a => a.name));
    const mkAtp = (name: string, system: T.Atp['system'], level: T.Atp['level'], phaseId: string | undefined, steps: { description: string; method: string; expected: string }[]) => {
      if (haveAtp.has(name)) return;
      const id = x.seq('atps', 'ATP');
      x.create('atps', { id, atpId: id, projectId, name, system, level, status: 'Draft', plannerPlanId: plan.id, planPhaseId: phaseId });
      steps.forEach((s, i) => { const sid = x.id('ATPS'); x.create('atpSteps', { id: sid, atpsId: sid, atpId: id, stepNo: i + 1, description: s.description, method: s.method, expectedResult: s.expected, result: 'Pending' }); });
      x.artefacts.atpIds = [...(x.artefacts.atpIds ?? []), id];
    };
    for (const r of an.lines) {
      const l = r.line; const st = an.stages.find(s => s.stage === (l.stage ?? 1)); const sys = atpSystemOf(l.system);
      const label = `${l.system}${l.model ? ` ${l.model}` : ''} ${l.action === 'uprate' ? 'uprate' : `× ${l.qty}`}`;
      mkAtp(`L3 pre-functional · ${label} [${l.id}]`, sys, 'L3 Pre-functional', st?.phaseId, ATP_STEPS[sys].slice(0, 3));
      mkAtp(`L4 functional · ${label} [${l.id}]`, sys, 'L4 Functional', st?.phaseId, ATP_STEPS[sys].slice(2));
    }
    for (const st of an.stages) mkAtp(`L5 integrated systems test · ${st.name}`, 'Integrated', 'L5 IST', st.phaseId, ATP_STEPS.Integrated);
    if (!(x.artefacts.hotoIds ?? []).length) {
      const hid = x.seq('hotos', 'HOTO');
      x.create('hotos', { id: hid, hotoId: hid, projectId, status: 'Not Started', conditions: `Hand-over of ${an.lines.length} plant line(s) from ${plan.plnId}: as-built single-line, O&M manuals, spares, training, warranty start` });
      x.artefacts.hotoIds = [hid];
    }
  } else x.warn('No project: ATPs and the hand-over record were not created');
}

function closeout(plan: T.PlannerPlan, data: Parameters<NonNullable<ScopeModel['closeout']>>[1]): CloseoutCheck[] {
  const atps = data.atps.filter(a => a.plannerPlanId === plan.id);
  const units = (plan.artefacts?.plantUnitIds ?? []).map(m => ({ m, rec: (data as unknown as Record<string, { id: string; status?: string; name?: string }[]>)[m.entity]?.find(r => r.id === m.id) }));
  const notLive = units.filter(u => u.rec && u.rec.status !== 'Operational');
  const chg = data.changeRequests.filter(c => c.plannerPlanId === plan.id && c.type === 'PowerUpgrade');
  const open = chg.filter(c => !['Implemented', 'Closed'].includes(c.status));
  const replaced = (plan.dispositions ?? []).filter(d => d.recordType === 'plant' && d.disposition === 'dispose');
  const stillLive = replaced.filter(d => { const u = byId(data, 'upsUnits', d.recordId) ?? byId(data, 'generators', d.recordId) ?? byId(data, 'chillers', d.recordId) ?? byId(data, 'cracUnits', d.recordId) ?? byId(data, 'transformers', d.recordId); return u && u.status !== 'Retired'; });
  const hotos = data.hotos.filter(h => (plan.artefacts?.hotoIds ?? []).includes(h.id));
  // Capacity recomputed: the site baseline now counts the new units (they are in service and no longer 'Planned').
  const site = plan.dataCenterId ? siteBaseline(data, plan.dataCenterId) : undefined;
  return [
    { key: 'plant-atps', label: 'Every plant ATP accepted (L3, L4, L5)', ok: atps.length > 0 && atps.every(a => a.status === 'Accepted'), detail: atps.length ? `${atps.filter(a => a.status === 'Accepted').length} of ${atps.length} accepted` : 'No ATPs linked to the plan' },
    { key: 'plant-cutins', label: 'Every cut-in change implemented', ok: chg.length > 0 && !open.length, detail: chg.length ? `${chg.length - open.length} of ${chg.length} implemented or closed` : 'No cut-in changes linked to the plan' },
    { key: 'plant-in-service', label: 'New plant in service', ok: units.length > 0 && !notLive.length, detail: units.length ? `${units.length - notLive.length} of ${units.length} units Operational${notLive.length ? `; still ${notLive.map(u => `${u.rec?.name} ${u.rec?.status}`).slice(0, 4).join(', ')}` : ''}` : 'No planned plant records linked' },
    { key: 'plant-retired', label: 'Replaced plant retired for disposal', ok: !stillLive.length, detail: replaced.length ? `${replaced.length - stillLive.length} of ${replaced.length} retired` : 'Nothing replaced' },
    { key: 'plant-capacity', label: 'Site capacity recomputed with the new plant', ok: !!site && units.length > 0 && !notLive.length, detail: site ? `Site headroom now ${kw(site.headroomItKw)} (binding: ${site.binding?.label ?? '—'})` : 'Site not found' },
    { key: 'plant-hoto', label: 'Hand-over to operations accepted', ok: hotos.length > 0 && hotos.every(h => h.status === 'Accepted' || h.status === 'Accepted with conditions'), detail: hotos.length ? hotos.map(h => `${h.id} ${h.status}`).join(', ') : 'No hand-over record' },
  ];
}

export const plantModel: ScopeModel = {
  family: 'plant',
  size,
  ladder: (c, _s, generic) => { const an = analysis(c); return an.ready ? plantLadder(an, c.plan) : generic; },
  estimate: (c, _s, generic) => { const an = analysis(c); return an.ready ? plantEstimate(an, c.plan, c.params, c.benchmarks, generic) : { ...generic, capex: [], capexTotal: 0, opex: [], opexMonthly: 0, opexAnnual: 0, revenueAnnual: 0, paybackMonths: null, paybackBasis: `Not estimated: ${an.reason}`, basis: 'bottom-up' }; },
  schedule: (c, _s, generic) => { const an = analysis(c); return an.ready ? plantSchedule(an, c.plan, c.params, c.benchmarks, c.data) : generic.filter(g => g.kind !== 'equipment'); },
  analyse: c => ({ plant: analysis(c) }),
  check,
  bom: (ev, add) => { const an = plantOf(ev); for (const l of an?.bill ?? []) add(l); return true; },
  // Plant works take no address space.
  ipPlan: (_ev, generic) => ({ ...generic, aggregate: '—', items: [], vlans: [], asns: [], usedAddresses: 0, totalAddresses: 0 }),
  bod,
  initiation,
  blockers,
  seedDraft,
  reservations: () => [],
  executeVehicle,
  execute,
  closeout,
};
export { LINE_SYSTEM, SYSTEM_LABEL };
