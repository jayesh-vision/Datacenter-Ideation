/**
 * Scope model · rack, pod, hall and retrofit: capacity added inside a live site.
 *
 * The work is done by lib/inSiteAnalysis.ts (one analysis per evaluation, read from the site's
 * own records) and lib/inSiteExec.ts (records created at execution, holds requested at approval).
 * These hooks replace the generic behaviour: no site plant is sized from the plan's own kW; the
 * estimate is the bill of materials plus contingency; site-plant rules are replaced by checks on
 * the real chain (rack → feed → PDU → UPS → utility, zone → units → facility water).
 */
import type * as T from '../../p2b/types';
import type { Estimate, EstimateLine, LadderRow, ScheduleItem, Sizing } from '../engine';
import { plannerMoney } from '../../compat/registry';
import type { BodRow, BodSection, Initiation } from '../outputs';
import { inSiteAnalysis, type InSiteAnalysis, type InSiteLine } from '../inSiteAnalysis';
import { inSiteCloseout, inSiteExecute, inSiteExecuteVehicle, inSiteOf, inSiteRackUnits, inSiteReservations } from '../inSiteExec';
import type { CheckResult, ScopeBlocker, ScopeCtx, ScopeModel } from './types';
import { clockMs } from '../../compat/clock';

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const kw = (n: number) => (Math.abs(n) >= 1000 ? `${r1(n / 1000)} MW` : `${r1(n)} kW`);
const usd = (n: number) => plannerMoney()?.(n) ?? (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${r0(n)}`);
const num = (c: ScopeCtx, k: string, d = 0) => { const v = c.params[k]?.value; return typeof v === 'number' ? v : typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d; };
const lineTotal = (l: InSiteLine) => r0(l.qty * l.unitCost);

/** Contingency on the works (not on catalogue IT), by plan type, unless the plan sets its own. */
const CONTINGENCY: Record<string, number> = { rack: 5, pod: 10, hall: 12, retrofit: 15 };
/** Generic site-plant rules that the in-site checks replace (dropped from the templates; answered here for older templates). */
const REPLACED: Record<string, string> = {
  'feeds-cover-load': 'Replaced by "Site power chain has headroom" (R-INS-08), read from the site\'s utility feeds',
  'ups-redundancy': 'Replaced by "Site power chain has headroom" (R-INS-08): the site UPS at its redundancy',
  'generator-margin': 'Site generators are checked in the site power chain (R-INS-08)',
  'fuel-hours': 'Fuel autonomy is a property of the existing site',
  'cooling-n1': 'Replaced by "Cooling zone has headroom" (R-INS-04) on the real zone',
  'hall-load-band': 'Replaced by "Within the hall\'s design load" (R-INS-10)',
  'floor-loading': 'Replaced by "Rack and floor weight" (R-INS-05) on the real racks and floor',
  'tier-redundancy': 'Redundancy is the existing site\'s',
  'civil-before-fitout': 'No civil works in an existing site',
  'staffing': 'No new staff: the site\'s operations team runs the added capacity',
  'carrier-diversity': 'Carrier entries are a property of the existing site',
};
/** Install lead before go-live, weeks, per lead-time item. */
const INSTALL_WEEKS: Record<string, number> = { 'Racks and containment': 4, PDU: 4, 'CRAH / CDU': 6, 'Spine / leaf switches': 3, 'Optics (400G)': 3, 'Fibre trunks': 3, 'GPU servers': 2, 'General servers': 2 };

export const inSiteModel: ScopeModel = {
  family: 'in-site',

  /* ---------------------------------------------------------------- engine */
  size(c, generic): Sizing {
    const a = inSiteAnalysis(c);
    const whiteSpace = a.hall?.whiteSpaceM2 ?? (a.type === 'pod' ? r0(a.racks * num(c, 'whiteSpaceM2PerRack', 2.6)) : 0);
    return {
      ...generic, itKw: a.addedKw, racks: a.racks, halls: a.type === 'hall' || a.type === 'retrofit' ? 1 : 0, buildings: 0, whiteSpaceM2: whiteSpace, grossAreaM2: 0, sites: 0,
      building: { racksPerHall: a.racks, hallWhiteSpaceM2: whiteSpace, hallsPerFloor: 0, floorsPerBuilding: 0, hallsPerBuilding: 0, floorsUsed: 0, floorPlateM2: 0, buildingGrossM2: 0, supportRatio: 0, lastBuildingHalls: 0 },
      rackClasses: a.classes.map(k => ({ ...k, liquid: !!(k as { liquid?: boolean }).liquid || (k as { cooling?: string }).cooling === 'liquid', capturePct: a.cooling.liquidRequired ? num(c, 'liquidCapturePct', 75) : 0, rearDoor: a.cooling.type === 'rear-door' })), plant: a.plant.map(p => ({ ...p })),
      network: { leaves: a.network.leaves, spines: a.network.spines, cores: 0, uplinks: a.network.uplinks, accessPorts: a.network.accessPorts, uplinkGbps: a.network.uplinkGbps, carriers: 0, dciGbps: 0 },
      staffing: { fte: 0, shifts: 0, perMw: 0, source: 'template' }, spares: { lines: 0, valueUsd: 0 },
      // Only what this plan adds: no new heat rejection or site plant unless the family analysis says so.
      cooling: { ...generic.cooling, type: a.cooling.type, capacityKw: a.cooling.capacityKw, units: a.cooling.units, unitKw: a.cooling.unitKw, redundancy: a.cooling.redundancy, liquidRequired: a.cooling.liquidRequired, rearDoors: a.cooling.type === 'rear-door' ? a.racks : 0, heatRejection: { ...generic.cooling.heatRejection, streams: [], coolers: null, chillers: null } },
      pue: c.site ? { value: c.site.pue, source: 'benchmark', note: `${c.site.dc.code}: ${c.site.pueSource}` } : generic.pue,
    };
  },

  ladder(c, _sizing, generic): LadderRow[] {
    const a = inSiteAnalysis(c);
    const reserve = num(c, 'reservePct', 15) / 100;
    const binding: LadderRow['bindingConstraint'] = a.checks['ins-site-power']?.status === 'fail' ? 'power' : (a.checks['ins-zone-cooling']?.status === 'fail' || a.checks['ins-facility-water']?.status === 'fail') ? 'cooling' : a.checks['ins-positions']?.status === 'fail' ? 'space' : a.checks['ins-ports']?.status === 'fail' || a.checks['ins-spine-ports']?.status === 'fail' ? 'ports' : 'none';
    // Committed = holds other plans and changes already have on the target hall (none invented).
    const hb = a.hall?.hb ?? (a.pod?.chosen ? c.site?.halls.find(h => h.hall.id === a.pod!.chosen!.hall.id) : undefined);
    let installed = 0;
    return generic.map((row, i) => {
      installed += row.phase.itKw;
      const committed = r0(Math.min(installed, i === 0 ? hb?.reservedKw ?? 0 : 0));
      const reserveKw = r0(installed * reserve);
      return { ...row, installedKw: installed, committedKw: committed, reserveKw, headroomKw: Math.max(0, installed - committed - reserveKw), crossesWarningMonth: undefined, bindingConstraint: binding };
    });
  },

  estimate(c, sizing, generic): Estimate {
    const a = inSiteAnalysis(c);
    const it = a.lines.filter(l => l.it).reduce((s, l) => s + lineTotal(l), 0);
    const works = a.lines.filter(l => !l.it).reduce((s, l) => s + lineTotal(l), 0);
    const contPct = c.params['costContingencyPct'] ? num(c, 'costContingencyPct') : CONTINGENCY[a.type] ?? 10;
    const contingency = r0(works * contPct / 100);
    const cats = [...new Set(a.lines.filter(l => !l.it).map(l => l.category))];
    const capex: EstimateLine[] = cats.map(cat => { const ls = a.lines.filter(l => !l.it && l.category === cat); return { category: 'CapEx', item: cat, amount: ls.reduce((s, l) => s + lineTotal(l), 0), basis: `${ls.length} bill line${ls.length === 1 ? '' : 's'}: ${ls.slice(0, 3).map(l => `${l.qty} × ${l.item}`).join(', ')}${ls.length > 3 ? '…' : ''}`, source: 'benchmark' as const }; });
    if (it) capex.push({ category: 'CapEx', item: 'IT and network equipment', amount: it, basis: 'catalogue models and prices, quantities from the rack kW and the models\' typical draw', source: 'benchmark' });
    if (contingency) capex.push({ category: 'CapEx', item: 'Contingency', amount: contingency, basis: `${contPct}% of the works (catalogue IT excluded)`, source: c.params['costContingencyPct']?.source ?? 'template' });
    const capexTotal = works + it + contingency;
    const tariff = num(c, 'tariffUsdPerKwh', c.plan.tariffUsdPerKwh ?? 0.11);
    const pue = sizing.pue.value;
    const energyMwhYear = r0((a.drawKw * pue * 8760) / 1000);
    const energy = a.drawKw * pue * 8760 * tariff;
    const maintPct = num(c, 'maintenancePctCapex', c.benchmarks.find(b => b.metric === 'maintenancePctCapex')?.value ?? 2.5);
    const maintenance = (works + contingency) * maintPct / 100;
    const opex: EstimateLine[] = [
      { category: 'OpEx', item: 'Energy', amount: r0(energy / 12), basis: `${kw(a.drawKw)} added × site PUE ${pue} × 730 h × ${tariff} USD/kWh`, source: c.params['tariffUsdPerKwh']?.source ?? 'benchmark' },
      { category: 'OpEx', item: 'Maintenance on the new kit', amount: r0(maintenance / 12), basis: `${maintPct}% a year of the works`, source: c.params['maintenancePctCapex']?.source ?? 'benchmark' },
    ].filter(l => l.amount > 0) as EstimateLine[];
    const opexMonthly = opex.reduce((s, l) => s + l.amount, 0);
    const occupancy = 0.85;
    const revenueAnnual = r0(a.addedKw * num(c, 'revenuePerKwMonth', c.plan.revenuePerKwMonth ?? 0) * 12 * occupancy);
    const energyRecoveredAnnual = revenueAnnual > 0 ? r0(energy * occupancy) : 0;
    const marginAnnual = r0(revenueAnnual + energyRecoveredAnnual - opexMonthly * 12);
    const plantCapexTotal = capexTotal - it;
    return {
      ...generic, capex, capexTotal, capexPerKw: a.addedKw ? r0(plantCapexTotal / a.addedKw) : 0, capexPerRack: a.racks ? r0(capexTotal / a.racks) : 0,
      opex, opexMonthly, opexAnnual: opexMonthly * 12, energyMwhYear, revenueAnnual, energyRecoveredAnnual, marginAnnual,
      paybackMonths: marginAnnual > 0 && plantCapexTotal > 0 ? r0((plantCapexTotal / marginAnnual) * 12) : null,
      paybackBasis: revenueAnnual ? 'works CapEx (IT excluded) against the chargeback at 85% occupancy plus energy recovered' : 'no chargeback entered; payback not applicable',
      plantCapexTotal, costPerKwMonth: a.addedKw ? r0(opexMonthly / a.addedKw) : 0, benchmarkBand: undefined,
      basis: 'bottom-up', contingencyUsd: contingency, capacityEnabledKw: a.addedKw,
      benefitLines: undefined, benefitAnnual: undefined,
    };
  },

  schedule(c, _sizing, generic): ScheduleItem[] {
    const a = inSiteAnalysis(c);
    const plan = c.plan; const nowMs = clockMs();
    const phases = [...plan.phases].sort((x, y) => x.goLive.localeCompare(y.goLive));
    const first = phases[0];
    if (!first) return generic.filter(g => g.kind === 'permit');
    const contingency = 1 + num(c, 'contingencyPct', 15) / 100;
    const ordered = ['Approved', 'Executing', 'Completed'].includes(plan.status);
    const items: ScheduleItem[] = [];
    const keys = new Map<string, InSiteLine[]>();
    for (const l of a.lines) if (l.leadItem) { const k = `${l.leadItem}|${l.phaseId ?? first.id}`; keys.set(k, [...(keys.get(k) ?? []), l]); }
    for (const [k, ls] of keys) {
      const [lead, phaseId] = k.split('|');
      const ph = phases.find(p => p.id === phaseId) ?? first;
      const b = c.benchmarks.find(x => x.metric === `leadWeeks:${lead}`);
      // Models held in stock (received or staged, not in a rack, not held by another plan) only need a transfer.
      const stock = c.data && ls.every(l => l.model) ? ls.every(l => c.data!.devices.filter(d => d.model === l.model && !d.rackId && (d.lifecycleState === 'Received' || d.lifecycleState === 'Staged') && (!d.plannerPlanId || d.plannerPlanId === plan.id)).length >= l.qty) : false;
      const weeks = stock ? 1 : r0((b?.high ?? b?.value ?? 8) * contingency);
      const needBy = new Date(ph.goLive).getTime() - (INSTALL_WEEKS[lead] ?? 3) * 7 * 864e5;
      const orderBy = needBy - weeks * 7 * 864e5;
      items.push({ item: lead, leadWeeks: weeks, needBy: new Date(needBy).toISOString(), orderBy: new Date(orderBy).toISOString(), late: !ordered && orderBy < nowMs, phase: ph.name, phaseId: ph.id, kind: 'equipment', source: stock ? 'stock' : 'procure', note: (stock ? 'from stock: ' : '') + ls.map(l => `${l.qty} ${l.unit} ${l.item.toLowerCase()}`).join(', ') });
    }
    const gate = (item: string, at: number, phase = first) => items.push({ item, leadWeeks: 0, needBy: new Date(at).toISOString(), orderBy: new Date(at).toISOString(), late: false, phase: phase.name, phaseId: phase.id, kind: 'gate' });
    const goLive = new Date(first.goLive).getTime();
    if (a.type === 'rack') { const w = a.rack?.window; gate('Change approved', (w ? new Date(w.start).getTime() : goLive) - 7 * 864e5); if (w) gate(`Change window ${w.start.slice(0, 10)}`, new Date(w.start).getTime()); }
    if (a.type === 'pod') { gate('Cut-in changes approved', goLive - 6 * 7 * 864e5); gate('Racks accepted (level 4, one test per rack)', goLive - 7 * 864e5); gate('Go-live readiness', goLive); }
    if (a.type === 'hall') { gate('Design review', goLive - 12 * 7 * 864e5); for (const p of phases) { const t = new Date(p.goLive).getTime(); gate(`Commissioning level 5 · ${p.name}`, t - 2 * 7 * 864e5, p); gate(`Capacity released · ${p.name}`, t, p); } }
    if (a.type === 'retrofit') { for (const w of a.retrofit?.waves ?? []) gate(`${w.name}${a.retrofit?.wavesProposed ? ' (proposed)' : ''}`, new Date(w.windowStart).getTime()); gate('Level 5 integrated test (liquid loops)', goLive - 7 * 864e5); }
    return [...items, ...generic.filter(g => g.kind === 'permit')].sort((x, y) => x.orderBy.localeCompare(y.orderBy));
  },

  check(c, rule, ev): CheckResult | undefined {
    const a = inSiteAnalysis(c);
    if (REPLACED[rule.check]) return { status: 'n/a', detail: REPLACED[rule.check] };
    if (rule.check.startsWith('ins-')) return a.checks[rule.check] ?? { status: 'n/a', detail: 'Does not apply to this plan type' };
    switch (rule.check) {
      case 'commissioning-level': { const have = num(c, 'commissioningLevel', 3); const need = a.type === 'retrofit' && !['liquid-to-chip', 'immersion', 'rear-door'].includes(String(c.params['coolingType']?.value ?? 'liquid-to-chip')) ? 4 : a.commissioningLevel; return { status: have >= need ? 'pass' : 'fail', detail: `Level ${have} planned, level ${need} required${a.type === 'retrofit' && need === 5 ? ' for liquid loops (flush, pressure hold, leak test, CDU failover, thermal under load)' : ''}` }; }
      case 'pue-benchmark': return { status: 'n/a', detail: c.site ? `The site's PUE applies (${c.site.pue}, ${c.site.pueSource}); energy is costed with it` : 'The site\'s PUE applies' };
      case 'capex-benchmark': return { status: 'n/a', detail: `Estimated bottom-up from the bill of materials (${usd(ev.estimate.capexTotal)} including contingency); the whole-site benchmark does not apply` };
      case 'liquid-above-density': if (a.type === 'hall') { const bad = (a.hall?.classes ?? []).filter(x => x.kw > (rule.threshold ?? 30) && x.cooling === 'air'); return bad.length ? { status: 'fail', detail: `${bad.map(x => `${x.name} at ${x.kw} kW`).join(', ')} set to air cooling; above ${rule.threshold ?? 30} kW needs liquid` } : { status: 'pass', detail: (a.hall?.classes ?? []).map(x => `${x.name} ${x.kw} kW ${x.cooling}`).join(', ') || 'No classes' }; } return a.checks['liquid-above-density'];
      case 'inlet-envelope': return a.type === 'hall' || a.type === 'retrofit' ? a.checks['ins-setpoint'] : undefined;
      default: return undefined;
    }
  },

  analyse(c) { return { inSite: inSiteAnalysis(c) }; },

  /* ---------------------------------------------------------------- outputs */
  bom(ev, add) {
    const a = inSiteOf(ev); if (!a) return false;
    for (const l of a.lines) add({ kind: l.kind, category: l.category, item: l.item, spec: l.spec, qty: l.qty, unit: l.unit, unitCost: l.unitCost, leadItem: l.leadItem, manufacturer: l.manufacturer, phaseId: l.phaseId, model: l.model, needBy: ev.schedule.find(s => s.kind === 'equipment' && s.item === l.leadItem && (!l.phaseId || s.phaseId === l.phaseId))?.needBy });
    return true;
  },
  ipPlan(ev, generic) { const a = inSiteOf(ev); if (!a) return generic; const { aggregate, items, vlans, asns, usedAddresses, totalAddresses } = a.ip; return { aggregate, items, vlans, asns, usedAddresses, totalAddresses }; },
  bod(ev, sections) { const a = inSiteOf(ev); return a ? bodFor(a, ev.ctx, sections) : sections; },
  initiation(ev, _template, bom, generic): Initiation {
    const a = inSiteOf(ev); if (!a) return generic;
    const plan = ev.ctx.plan; const budget = ev.estimate.capexTotal;
    const orders = ev.schedule.filter(s => s.kind === 'equipment').map(s => ({ item: s.item, category: (bom.lines.find(l => l.leadItem === s.item)?.category ?? 'Mixed') as Initiation['orders'][number]['category'], value: bom.lines.filter(l => l.leadItem === s.item && (!l.phaseId || !s.phaseId || l.phaseId === s.phaseId)).reduce((x, l) => x + l.total, 0), orderBy: s.orderBy, needBy: s.needBy, late: s.late })).filter(o => o.value > 0);
    const project = (tpl: NonNullable<Initiation['projects'][number]['template']>) => [{ name: plan.title, start: new Date(clockMs()).toISOString(), end: plan.targetGoLive, budget, gate: 'Plan approved', longLead: orders.some(o => o.late), template: tpl }];
    const base = { ...generic, name: plan.title, budget, orders, permits: plan.permits, blueprintKey: undefined };
    if (a.type === 'rack') return { ...base, vehicle: 'change', projects: [], blueprintName: 'Change request (P05)', designDocs: [{ name: 'Placement note', type: 'Detailed Design', discipline: 'Architectural' }], workOrder: { process: 'P05 Change', key: 'change' }, change: { title: plan.title, type: 'RackDeploy' } };
    if (a.type === 'pod') return { ...base, vehicle: 'project', projects: project('Rack Deployment'), blueprintName: 'Rack Deployment (delivery template)', designDocs: [{ name: 'Pod layout and feed schedule', type: 'Detailed Design', discipline: 'Electrical' }, { name: 'Network and IP plan', type: 'Detailed Design', discipline: 'Network' }, { name: 'Acceptance test per rack', type: 'Detailed Design', discipline: 'Electrical' }], workOrder: { process: 'P10 Work order', key: 'work-order' }, change: undefined };
    if (a.type === 'hall') return { ...base, vehicle: 'project', projects: project('Hall Fit-out'), blueprintName: 'Hall Fit-out (delivery template)', designDocs: [{ name: 'Basis of design', type: 'Concept Design', discipline: 'Architectural' }, { name: 'Hall layout', type: 'Schematic Design', discipline: 'Architectural' }, { name: 'Hall electrical distribution', type: 'MEP Design', discipline: 'Electrical' }, { name: 'Hall cooling', type: 'MEP Design', discipline: 'Mechanical' }, { name: 'Network and IP plan', type: 'Detailed Design', discipline: 'Network' }, { name: 'Commissioning plan (levels 1 to 5)', type: 'Detailed Design', discipline: 'Electrical' }], workOrder: { process: 'P02 Hall fit-out', key: 'hall-fitout' }, change: undefined };
    return { ...base, vehicle: 'project', projects: project('Liquid Retrofit'), blueprintName: 'Liquid Retrofit (delivery template)', designDocs: [{ name: 'Basis of design', type: 'Concept Design', discipline: 'Mechanical' }, { name: 'Liquid cooling design (CDUs and secondary loops)', type: 'MEP Design', discipline: 'Mechanical' }, { name: 'Power uprate schedule', type: 'Detailed Design', discipline: 'Electrical' }, ...(a.retrofit?.reinforce ? [{ name: 'Floor loading assessment', type: 'Structural' as const, discipline: 'Structural' as const }] : []), { name: 'Retrofit wave plan', type: 'Detailed Design', discipline: 'Architectural' }, { name: 'Commissioning plan (level 5)', type: 'Detailed Design', discipline: 'Mechanical' }], workOrder: { process: 'P10 Work order', key: 'work-order' }, change: undefined };
  },

  /* ---------------------------------------------------------------- wizard */
  blockers(draft, ev): ScopeBlocker[] {
    const a = inSiteOf(ev); if (!a?.ready) return [];
    const out: ScopeBlocker[] = [];
    if (a.rack) {
      if (a.rack.missing) out.push({ level: 'bad', text: `Accept ${a.rack.missing} more rack${a.rack.missing === 1 ? '' : 's'} for the placement (${a.rack.candidates.filter(x => !x.blocked.length).length} candidates pass every check)`, step: 'dim:space' });
      for (const x of a.rack.accepted) if (x.cand.blocked.length) out.push({ level: 'bad', text: `${x.cand.rack.name} no longer passes: ${x.cand.blocked.join('; ')}`, step: 'dim:space' });
    }
    if (a.pod) {
      if (!a.pod.chosen) out.push({ level: 'bad', text: a.pod.options.some(o => o.fits) ? 'Accept a pod position on the Space step' : 'No position at the site can take the pod; see the site fit', step: 'dim:space' });
      for (const p of a.pod.chosenProblems) out.push({ level: 'bad', text: p, step: 'dim:space' });
    }
    if (a.hall && a.hall.classesFrom === 'plan' && Math.abs(a.hall.classKw - draft.designPowerKw) > 1) out.push({ level: 'bad', text: `Rack classes add up to ${kw(a.hall.classKw)}, the requirement is ${kw(draft.designPowerKw)}`, step: 'dim:it' });
    if (a.retrofit) {
      if (!a.retrofit.rows.length) out.push({ level: 'bad', text: 'Select the racks to retrofit', step: 'dim:space' });
      else if (a.retrofit.wavesProposed) out.push({ level: 'bad', text: 'Accept or edit the proposed retrofit waves', step: 'dim:migration' });
    }
    if (a.shortfall) out.push({ level: 'warn', text: `The site is short of ${a.shortfall.what} (${kw(a.shortfall.kw)}); create a linked ${a.shortfall.expansion ? 'expansion' : 'plant'} plan`, step: 'requirements' });
    return out;
  },
  siteMissing(draft) {
    if (!draft.dataCenterId) return 'Pick the data centre';
    if (draft.scope === 'hall') { const mode = String(draft.params.hallMode ?? ''); if (/new hall/i.test(mode)) return draft.inSite?.newHall?.floorId ? undefined : 'Pick the floor for the new hall'; return draft.params.targetHallId ? undefined : 'Pick the hall'; }
    if (draft.scope === 'retrofit') return draft.params.targetHallId ? undefined : 'Pick the hall';
    return undefined;
  },
  seedDraft(draft) {
    // A new plan type starts with no placement, selection or waves from another type.
    const base: Partial<T.PlannerPlan> = { placement: undefined, waves: [], inSite: {} };
    // A retrofit's capacity comes from the racks selected, so it starts at zero.
    if (draft.scope === 'retrofit') return { ...base, designPowerKw: 0, phases: [], params: { ...draft.params, liquidCapturePct: draft.params.liquidCapturePct ?? 75, cduType: draft.params.cduType ?? 'In-row' } };
    return base;
  },

  /* ---------------------------------------------------------------- governance and execution */
  reservations: inSiteReservations,
  rackUnits: (plan, ev) => inSiteRackUnits(plan, ev),
  executeVehicle: inSiteExecuteVehicle,
  execute: inSiteExecute,
  closeout: inSiteCloseout,
};

/* ================================================================== basis of design */
function bodFor(a: InSiteAnalysis, c: ScopeCtx, generic: BodSection[]): BodSection[] {
  const keep = (id: string) => generic.find(s => s.id === id);
  const site = a.site;
  const purpose = keep('purpose');
  const out: BodSection[] = [];
  if (purpose) out.push({ ...purpose, rows: purpose.rows.map(r => r.label === 'IT capacity' ? { label: 'IT capacity added', value: kw(a.addedKw) } : r) });
  const R = (label: string, value: string, source?: string): BodRow => ({ label, value, source });
  out.push({ id: 'site', title: '2. Site fit', text: a.shortfall ? `The site is short of ${a.shortfall.what} by ${kw(a.shortfall.kw)}. ${a.shortfall.plantIntent}.` : undefined, rows: site ? [
    R('Site', `${site.dc.code} · ${site.dc.name}`), R('IT load today', kw(site.itLoadKw), 'DCIM'),
    R('IT headroom', `${kw(site.headroomItKw)} (binding: ${site.binding?.label ?? '—'})`, 'Site baseline'),
    ...site.stages.filter(s => s.key !== 'design').map(s => R(s.label, `${kw(s.usableKw)} usable (${s.redundancy}), ${kw(Math.max(0, s.headroomItKw))} IT headroom`, s.basis)),
    R('Held by others', `${kw(site.reservedKw)} reserved, ${kw(site.pipelineKw)} in approved plans`),
    R('This plan adds', kw(a.addedKw)),
  ] : [R('Site', 'not loaded')] });
  const chk = (k: string) => a.checks[k] ? `${a.checks[k].status === 'pass' ? 'Pass' : a.checks[k].status === 'fail' ? 'Fail' : a.checks[k].status === 'warn' ? 'Warning' : 'Not checked'} · ${a.checks[k].detail}` : '—';
  if (a.rack) {
    const r = a.rack;
    out.push({ id: 'space', title: '3. Placement', rows: [R('Mode', r.mode === 'new-cabinet' ? 'New cabinet in an empty position' : 'Into existing racks'), R('Per rack', `${r.perRack.u}U, ${r.perRack.kw} kW allocated (${r.perRack.drawKw} kW typical), ${r.perRack.kg} kg${r.perRack.declared.length ? ` · declared: ${r.perRack.declared.join(', ')}` : ''}`), ...r.accepted.map(x => R(x.cand.rack.name, `${x.cand.hall?.name ?? ''} · U${x.startU ?? '?'} to U${x.endU ?? '?'} · ${x.cand.checks.power.detail}`)), R('Rack units', chk('ins-u-block')), R('Weight', chk('ins-weight'))] });
    out.push({ id: 'power', title: '4. Power', rows: [R('Feeds', r.feed.label), R('Rack power', chk('ins-rack-power')), R('PDUs and outlets', chk('ins-pdu')), ...r.accepted.map(x => R(`Outlets · ${x.cand.rack.name}`, x.outlets.map(o => `${o.side}: ${o.name}`).join(', ') || 'new power strips')), R('Site chain', chk('ins-site-power'))] });
    out.push({ id: 'cooling', title: '5. Cooling', rows: [R('Zone', chk('ins-zone-cooling'))] });
    out.push({ id: 'network', title: '6. Network and addresses', rows: [R('Ports', chk('ins-ports')), ...r.accepted.flatMap(x => x.ports.map(p => R(`${x.cand.rack.name} port ${p.side}`, `${p.deviceName} ${p.ifaceName}`))), R('Addresses', chk('ins-ip'))] });
    out.push({ id: 'change', title: '7. Change', rows: [R('Window', chk('ins-window')), R('Backout', r.backout)] });
  }
  if (a.pod) {
    const p = a.pod;
    out.push({ id: 'space', title: '3. Pod position', rows: [R('Racks', `${p.count} at ${p.kwPerRack} kW (${kw(a.addedKw)})`), R('Position', chk('ins-positions')), R('Containment', chk('ins-containment')), ...(p.cage ? [R('Cage', `${p.cage.perimeterM} m of fence, ${p.cage.doors} door(s), ${p.cage.readers} readers`)] : [])] });
    out.push({ id: 'power', title: '4. Power distribution', rows: [R('From', `${p.power}; no UPS, generator or transformer in this plan`), R('Feeds', `${p.feed.label}, ${p.feedSchedule[0]?.feedsPerSide ?? 1} per side per rack`), R('PDUs', chk('ins-pdu')), R('Site chain', chk('ins-site-power'))] });
    out.push({ id: 'cooling', title: '5. Cooling', rows: [R('Cooling', p.cooling), R('Zone', chk('ins-zone-cooling')), R('Facility water', chk('ins-facility-water'))] });
    out.push({ id: 'network', title: '6. Network and addresses', rows: [R('Leaves', `${p.leaves} to the existing spines, ${p.uplinks} × ${a.network.uplinkGbps}G uplinks`), R('Spine ports', chk('ins-spine-ports')), R('Addresses', chk('ins-ip'))] });
  }
  if (a.hall) {
    const h = a.hall;
    out.push({ id: 'space', title: '3. Hall', rows: [R('Mode', h.mode === 'shell' ? 'Shell hall, full fit-out' : h.mode === 'partly-used' ? 'Partly used hall: free positions only; live racks out of scope' : 'New hall on an existing floor'), R('Hall', h.hall ? `${h.hall.name}, ${kw(h.hall.designPowerKw)} design` : c.plan.inSite?.newHall?.name ?? '—'), R('Positions', chk('ins-positions')), R('Design load', chk('ins-hall-design')), R('Classes', h.classes.map(x => `${x.racks} ${x.name} at ${x.kw} kW (${x.cooling})`).join(', '))] });
    out.push({ id: 'power', title: '4. Power', rows: [R('Site chain', chk('ins-site-power')), R('Distribution', chk('ins-pdu')), R('UPS', 'From the site plant; a shortfall is a linked plant plan, not part of this bill')] });
    out.push({ id: 'cooling', title: '5. Cooling', rows: [R('Zone', chk('ins-zone-cooling')), R('Facility water', chk('ins-facility-water')), R('Setpoint', chk('ins-setpoint'))] });
    out.push({ id: 'network', title: '6. Network and addresses', rows: [R('Leaves', `${h.leaves}, ${h.uplinks} uplinks`), R('Spines', chk('ins-spine-ports')), R('Addresses', chk('ins-ip'))] });
    const fs = keep('firesec'); if (fs && h.mode !== 'partly-used') out.push(fs);
  }
  if (a.retrofit) {
    const r = a.retrofit;
    out.push({ id: 'space', title: '3. Racks converted', rows: [R('Racks', `${r.rows.length}: ${kw(r.todayKw)} today → ${kw(r.targetKw)} target (adds ${kw(r.deltaKw)})`), R('Readiness', `${r.ready} liquid-ready, ${r.kits} need a kit, ${r.newCabinets} new cabinets`), R('Weight', chk('ins-weight')), R('Services', `${r.services} services, ${r.customers} customers on the racks`)] });
    out.push({ id: 'power', title: '4. Power uprate', rows: [R('Uprate', chk('ins-uprate')), R('Supply', chk('ins-dc-plant')), R('Site chain', chk('ins-site-power'))] });
    out.push({ id: 'cooling', title: '5. Liquid cooling', rows: [R('Capture', `${r.capturePct}% to liquid (${kw(r.liquidKw)}), the rest to room air`), R('Residual air', chk('ins-zone-cooling')), R('Facility water', chk('ins-facility-water')), R('CDUs', chk('ins-cdu')), R('Setpoint', chk('ins-setpoint'))] });
    out.push({ id: 'migration', title: '6. Waves', rows: r.waves.map(w => R(w.name, `${w.windowStart.slice(0, 16).replace('T', ' ')} to ${w.windowEnd.slice(0, 16).replace('T', ' ')} · ${w.serviceIds.length} services · rollback: ${w.rollback}`)) });
  }
  for (const id of ['schedule', 'cost', 'risks', 'standards']) { const s = keep(id); if (s) out.push(s); }
  return out.map((s, i) => ({ ...s, title: s.title.replace(/^\d+\.\s*/, `${i + 1}. `) }));
}
