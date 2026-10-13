/**
 * Scope model · migration, consolidation and decommission of a site.
 *
 * Everything comes from the source site's inventory and the dispositions on the plan (see
 * lib/migrationCore.ts): kW and racks are derived, the target must fit per wave, consent and
 * notice gate each wave, circuits and contracts are exited with their cost, compliance follows
 * the plant at the site, and the site is retired only when the closure checklist is green.
 */
import type * as T from '../../p2b/types';
import type * as E from '../../p2b/enums';
import type { CheckResult, ScopeBlocker, ScopeModel, ExecCtx, ReservationRequest } from './types';
import type { Estimate, EstimateLine, Evaluation, ScheduleItem, Sizing } from '../engine';
import type { BodSection, Initiation, IpPlan } from '../outputs';
import { getBlueprint } from '../../p2b/delivery/programBlueprints';
import { analyseMigration, migrationCloseout, migrationOf, modeOf, DISPOSITION_LABEL, MODE_LABEL, type MigrationAnalysis } from '../migrationCore';
import { pnum } from '../replaceBench';
import { byId } from '../plannerData';
import { impactOf } from '../impact';
import { clockMs } from '../../compat/clock';

const r0 = (n: number) => Math.round(n);
const DAY = 864e5;
const usd = (n: number) => `${Math.round(n).toLocaleString('en-US')} USD`;
const noun = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const NOT_LOADED: CheckResult = { status: 'n/a', detail: 'Not checked: platform data still loading' };

function check(a: MigrationAnalysis, plan: T.PlannerPlan, rule: T.PlannerRuleDef, ev: Evaluation): CheckResult | undefined {
  const waves = (plan.waves ?? []).filter(w => w.status !== 'Cancelled');
  const noWaves: CheckResult = { status: 'fail', detail: 'No waves yet: make them on the Migration waves step' };
  const issues = (kinds: string[]) => a.waveCheck.issues.filter(i => kinds.includes(i.kind));
  switch (rule.check) {
    case 'mig-dispositions': {
      const saved = new Set((plan.dispositions ?? []).map(d => `${d.recordType}:${d.recordId}`));
      const open = a.rows.filter(r => !saved.has(r.key));
      return !a.rows.length ? { status: 'warn', detail: 'Nothing recorded at the source site' } : open.length ? { status: 'fail', detail: `${noun(open.length, 'item')} at the site without a confirmed disposition (${[...new Set(open.map(r => r.recordType))].join(', ')}); confirm the inventory on the Requirements step`, value: `${a.rows.length - open.length} of ${a.rows.length}` } : { status: 'pass', detail: `All ${a.rows.length} items at the site have a disposition`, value: `${a.rows.length}` };
    }
    case 'mig-downtime': {
      if (!waves.length) return noWaves;
      const bad = waves.map(w => ({ w, worst: Math.max(0, ...a.services.filter(s => w.serviceIds.includes(s.service.id)).map(s => s.downtimeH)) })).filter(x => x.worst > a.window);
      return bad.length ? { status: 'fail', detail: bad.map(x => `${x.w.name}: ${x.worst} h of downtime against a ${a.window} h window`).join(' · ') } : { status: 'pass', detail: `Every wave's longest service outage fits the ${a.window} h window` };
    }
    case 'mig-target-fit': {
      if (a.mode === 'decommission') return { status: 'n/a', detail: 'Decommission: nothing moves to another site' };
      if (!a.target) return { status: 'fail', detail: 'No target site chosen' };
      if (!ev.ctx.peerSite) return NOT_LOADED;
      if (!waves.length) return a.kwMoving > ev.ctx.peerSite.headroomItKw ? { status: 'fail', detail: `${a.kwMoving} kW moving, ${ev.ctx.peerSite.headroomItKw} kW headroom at ${a.target.code}` } : { status: 'warn', detail: 'Waves not made yet; whole move fits on kW' };
      const bad = a.targetFit.filter(t => !t.ok);
      return bad.length ? { status: 'fail', detail: bad.map(t => `${t.waveName}: ${t.issues.join('; ')}`).join(' · ') } : { status: 'pass', detail: `${a.target.code} takes every wave: ${a.racksMoving} racks of ${a.targetFit[0]?.positions ?? 0} free positions, ${a.kwMoving} kW of ${ev.ctx.peerSite.headroomItKw} kW headroom` };
    }
    case 'mig-consent': {
      if (!a.consents.length) return { status: 'pass', detail: 'No customer services at the site' };
      const bad = a.consents.filter(c => !c.okForWave);
      return bad.length ? { status: 'fail', detail: `${noun(bad.length, 'customer')} without consent or full notice before their wave: ${bad.slice(0, 4).map(c => `${c.customerName} (${c.status}${c.status === 'Notified' ? `, ${c.noticeDays} days notice` : ''})`).join(', ')}` } : { status: 'pass', detail: `${noun(a.consents.length, 'customer')} consented with notice served before their wave` };
    }
    case 'mig-circuits': {
      if (!a.circuits.length) return { status: 'pass', detail: 'No circuits at the site' };
      const pen = a.circuits.filter(c => c.penaltyUsd > 0);
      return pen.length ? { status: 'warn', detail: pen.map(c => `${c.circuit.cid} ceased ${c.monthsLeft} months before ${c.circuit.contractEnd?.slice(0, 10)}: ${usd(c.penaltyUsd)} counted in the cost`).join(' · ') } : { status: 'pass', detail: `${noun(a.circuits.length, 'circuit')}: ${a.circuits.map(c => `${c.circuit.cid} ${c.action}`).join(', ')}` };
    }
    case 'mig-contracts': {
      const late = a.contracts.filter(c => c.late);
      if (late.length) return { status: 'fail', detail: late.map(c => `${c.contract.type} ${c.contract.ctrId}: notice had to be served by ${c.serveBy?.slice(0, 10)} to exit by ${c.exitDate.slice(0, 10)}`).join(' · ') };
      if (!a.contracts.some(c => c.contract.type === 'Lease')) return { status: 'warn', detail: `No lease is recorded for ${a.source?.code}; check the lease terms and notice period before committing to the exit date` };
      return { status: 'pass', detail: a.contracts.map(c => `${c.contract.type} ${c.contract.ctrId}: ${c.endsBeforeExit ? 'ends before the exit' : `serve notice by ${c.serveBy?.slice(0, 10) ?? '—'}`}`).join(' · ') };
    }
    case 'mig-permits': {
      const miss = a.permits.filter(p => !p.onPlan);
      return miss.length ? { status: 'fail', detail: `Not on the plan's permit list: ${miss.map(p => p.name).join(', ')}` } : { status: 'pass', detail: `${noun(a.permits.length, 'compliance step')} on the plan: ${a.permits.map(p => p.name).join(', ')}` };
    }
    case 'mig-critical': {
      const bad = a.services.filter(s => s.critical && s.approach === 'Lift and shift');
      return bad.length ? { status: 'fail', detail: `${bad.map(s => s.service.name).join(', ')}: critical services cannot go dark for a lift and shift; replicate and swing, or re-platform` } : { status: 'pass', detail: a.services.some(s => s.critical) ? 'Critical services move with replication or re-platforming' : 'No critical services at the site' };
    }
    case 'mig-linked-changes': {
      const open = a.openDecomChanges.filter(c => c.plannerPlanId !== plan.id);
      return open.length ? { status: 'warn', detail: `Open decommission changes at the site, linked when the plan is executed: ${open.map(c => c.id).join(', ')}` } : { status: 'pass', detail: 'No other open decommission change at the site' };
    }
    case 'wave-ha-split': { if (!waves.length) return noWaves; const x = issues(['pair']); return x.length ? { status: 'fail', detail: x.slice(0, 3).map(i => i.text).join(' · ') } : { status: 'pass', detail: 'No redundant pair moves in one wave' }; }
    case 'wave-fits-window': { if (!waves.length) return noWaves; const x = issues(['capacity', 'window']); return x.length ? { status: 'fail', detail: x.slice(0, 3).map(i => `${waves.find(w => w.id === i.waveId)?.name}: ${i.text}`).join(' · ') } : { status: 'pass', detail: `Each wave's device work fits one ${a.window} h window at ${a.rate} per hour` }; }
    case 'wave-clash': { if (!waves.length) return noWaves; const x = issues(['clash']); const bad = x.filter(i => i.level === 'bad'); return bad.length ? { status: 'fail', detail: bad.slice(0, 3).map(i => `${waves.find(w => w.id === i.waveId)?.name}: ${i.text}`).join(' · ') } : x.length ? { status: 'warn', detail: x.slice(0, 3).map(i => `${waves.find(w => w.id === i.waveId)?.name}: ${i.text}`).join(' · ') } : { status: 'pass', detail: 'No clash with maintenance windows or open changes' }; }
    case 'wave-coverage': { if (!waves.length) return noWaves; return a.waveCheck.unassigned.length || a.waveCheck.duplicated.length ? { status: 'fail', detail: issues(['coverage']).map(i => i.text).join(' · ') } : { status: 'pass', detail: `Every live device and service is in exactly one of ${noun(waves.length, 'wave')}` }; }
    case 'payback': { const m = ev.estimate.paybackMonths; return m === null ? { status: 'warn', detail: `No running cost saved (${usd(ev.estimate.benefitAnnual ?? 0)} a year)` } : { status: m <= (rule.threshold ?? 96) ? 'pass' : 'warn', detail: `${m} months on ${usd(ev.estimate.benefitAnnual ?? 0)} a year saved`, value: `${m} mo` }; }
    default: return undefined;
  }
}

export const migrationModel: ScopeModel = {
  family: 'migration',

  size(c, generic): Sizing {
    const a = analyseMigration(c); if (!a.ready) return generic;
    return { ...generic, itKw: a.kwLeaving, racks: c.site?.racks ?? 0, halls: 0, buildings: 0, whiteSpaceM2: 0, grossAreaM2: 0, rackClasses: [], plant: [], sites: 0,
      network: { leaves: 0, spines: 0, cores: 0, uplinks: 0, accessPorts: 0, uplinkGbps: 0, carriers: 0, dciGbps: 0 }, staffing: { fte: 0, shifts: 0, perMw: 0, source: generic.staffing.source }, spares: { lines: 0, valueUsd: 0 },
      cooling: { ...generic.cooling, capacityKw: 0, units: 0, unitKw: 0, liquidRequired: false }, pue: c.site ? { value: c.site.pue, source: 'actual', note: `${c.site.dc.name} (${c.site.pueSource})` } : generic.pue };
  },
  ladder: () => [],

  estimate(c, sizing, generic): Estimate {
    const a = analyseMigration(c); if (!a.ready) return generic;
    const byCat = new Map<string, { amount: number; lines: number }>();
    for (const l of a.bom) { const t = byCat.get(l.category) ?? { amount: 0, lines: 0 }; t.amount += r0(l.qty) * r0(l.unitCost); t.lines++; byCat.set(l.category, t); }
    const capex: EstimateLine[] = [...byCat.entries()].map(([cat, t]) => ({ category: 'CapEx', item: cat, amount: r0(t.amount), basis: `Bill of materials: ${noun(t.lines, 'line')}`, source: 'benchmark' }));
    const bomTotal = capex.reduce((s, l) => s + l.amount, 0); const pct = pnum(c.params, 'costContingencyPct', 15); const contingency = r0((bomTotal * pct) / 100);
    if (contingency) capex.push({ category: 'CapEx', item: 'Contingency', amount: contingency, basis: `${pct}% of the bill of materials`, source: c.params.costContingencyPct?.source ?? 'template' });
    const capexTotal = capex.reduce((s, l) => s + l.amount, 0);
    const benefitAnnual = a.savings.reduce((s, l) => s + l.amount, 0);
    return { ...generic, capex, capexTotal, capexPerKw: a.kwLeaving ? r0(capexTotal / a.kwLeaving) : 0, capexPerRack: sizing.racks ? r0(capexTotal / sizing.racks) : 0, opex: [], opexMonthly: 0, opexAnnual: 0, energyMwhYear: 0, revenueAnnual: 0, energyRecoveredAnnual: 0, marginAnnual: benefitAnnual,
      paybackMonths: benefitAnnual > 0 ? r0((capexTotal / benefitAnnual) * 12) : null, paybackBasis: 'One-off move and exit cost ÷ yearly running cost saved (lease, energy, contracts, circuits, staff)', plantCapexTotal: 0, costPerKwMonth: 0, benchmarkBand: undefined,
      benefitLines: a.savings, benefitAnnual, basis: 'bottom-up', contingencyUsd: contingency };
  },

  schedule(c, _s, generic): ScheduleItem[] {
    const a = analyseMigration(c); if (!a.ready) return generic.filter(g => g.kind === 'permit');
    const ordered = ['Approved', 'Executing', 'Completed'].includes(c.plan.status); const now = clockMs();
    const items: ScheduleItem[] = [];
    for (const cn of a.consents) if (cn.firstWave) { const by = new Date(new Date(cn.firstWave).getTime() - cn.noticeDays * DAY).toISOString(); items.push({ item: `Notify ${cn.customerName} (${cn.noticeDays} days)`, leadWeeks: Math.ceil(cn.noticeDays / 7), needBy: cn.firstWave, orderBy: by, late: cn.status === 'Not sent' && new Date(by).getTime() < now, phase: 'Consent', kind: 'gate', note: cn.status }); }
    for (const ct of a.contracts.filter(x => x.serveBy && x.action === 'end')) items.push({ item: `Serve notice on ${ct.contract.type} ${ct.contract.ctrId}`, leadWeeks: Math.ceil((ct.contract.noticeDays ?? 0) / 7), needBy: ct.exitDate, orderBy: ct.serveBy!, late: ct.late, phase: 'Exit', kind: 'gate' });
    for (const ck of a.circuits.filter(x => x.ceaseDate)) items.push({ item: `Cease ${ck.circuit.cid} with the carrier`, leadWeeks: 4, needBy: ck.ceaseDate!, orderBy: new Date(new Date(ck.ceaseDate!).getTime() - 30 * DAY).toISOString(), late: !ordered && new Date(ck.ceaseDate!).getTime() - 30 * DAY < now, phase: 'Exit', kind: 'gate', note: ck.penaltyUsd ? `${usd(ck.penaltyUsd)} early termination` : undefined });
    const rack = a.bom.find(b => b.kind === 'rack'); const firstMove = [...(c.plan.waves ?? [])].filter(w => w.status !== 'Closed').sort((x, y) => x.order - y.order)[0];
    if (rack && firstMove) { const b = c.benchmarks.find(x => x.metric === 'leadWeeks:Racks and containment'); const lw = r0(b?.high ?? 10); const need = new Date(new Date(firstMove.windowStart).getTime() - 7 * DAY).toISOString(); items.push({ item: `Target racks × ${rack.qty}`, leadWeeks: lw, needBy: need, orderBy: new Date(new Date(need).getTime() - lw * 7 * DAY).toISOString(), late: !ordered && new Date(need).getTime() - lw * 7 * DAY < now, phase: firstMove.name, phaseId: firstMove.id, kind: 'equipment', source: 'procure' }); }
    return [...items, ...generic.filter(g => g.kind === 'permit')].sort((x, y) => x.orderBy.localeCompare(y.orderBy));
  },

  check(c, rule, ev) {
    if (!c.data?.ready) return rule.check.startsWith('mig-') || rule.check.startsWith('wave-') ? NOT_LOADED : undefined;
    return check(analyseMigration(c), c.plan, rule, ev);
  },
  analyse: c => ({ migration: analyseMigration(c) }),
  bom(ev, add) { const a = migrationOf(ev); if (!a?.ready) return false; for (const l of a.bom) add(l); return true; },

  ipPlan(ev, generic): IpPlan {
    const a = migrationOf(ev); if (!a?.ready) return generic;
    const items: IpPlan['items'] = a.ip.target.filter(t => t.cidr).map((t, i) => ({ id: `T${i + 1}`, scope: a.target?.code ?? 'Target', purpose: 'Production', name: `Replaces ${t.source}`, cidr: t.cidr!, prefix: Number(t.cidr!.split('/')[1]), hosts: 2 ** (32 - Number(t.cidr!.split('/')[1])) - 3, notes: `Carved from ${t.parent}` }));
    return { aggregate: `Release ${noun(a.ip.subnets.length, 'subnet')} and ${noun(a.ip.vlans.length, 'VLAN')} at ${a.source?.code}${items.length ? `; ${noun(items.length, 'prefix', 'prefixes')} at ${a.target?.code}` : ''}`, items, vlans: [], asns: [], usedAddresses: a.ip.addresses, totalAddresses: a.ip.subnets.reduce((s, x) => s + x.totalHosts, 0) };
  },

  bod(ev, sections): BodSection[] {
    const a = migrationOf(ev); if (!a?.ready) return sections;
    const keep = sections.filter(s => ['risks', 'standards'].includes(s.id)); const purpose = sections.find(s => s.id === 'purpose');
    const counts = (t: string) => a.rows.filter(r => r.recordType === t);
    const by = (t: string) => [...new Set(counts(t).map(r => r.disposition))].map(d => `${counts(t).filter(r => r.disposition === d).length} ${DISPOSITION_LABEL[d].toLowerCase()}`).join(', ');
    const waves = [...(ev.ctx.plan.waves ?? [])].sort((x, y) => x.order - y.order); const e = ev.estimate;
    const out: BodSection[] = [
      { id: 'purpose', title: '1. Purpose', text: purpose?.text, rows: [{ label: 'Mode', value: MODE_LABEL[a.mode] }, { label: 'Source', value: `${a.source?.name} (${a.source?.code})` }, ...(a.target ? [{ label: 'Target', value: `${a.target.name} (${a.target.code}), ${a.distanceKm} km` }] : []), { label: 'Load leaving', value: `${a.kwLeaving} kW${a.mode === 'consolidation' ? `, ${a.kwMoving} kW moving in about ${a.racksMoving} racks` : ''}` }] },
      { id: 'inventory', title: '2. Inventory and dispositions', rows: (['device', 'rack', 'service', 'circuit', 'subnet', 'vlan', 'contract', 'plant'] as const).filter(t => counts(t).length).map(t => ({ label: `${counts(t).length} ${t}${counts(t).length === 1 ? '' : 's'}`, value: by(t) })) },
      { id: 'services', title: '3. How each service moves', rows: a.services.map(s => ({ label: s.service.name, value: `${s.approach}; ${s.downtimeH} h down${s.critical ? '; critical' : ''}` })) },
      { id: 'waves', title: '4. Waves', rows: waves.map(w => ({ label: w.name, value: `${new Date(w.windowStart).toUTCString().slice(0, 22)} · ${w.deviceIds.length} devices, ${w.serviceIds.length} services · ${w.status}` })) },
      { id: 'consent', title: '5. Customers and consent', rows: a.consents.map(cn => ({ label: cn.customerName, value: `${cn.status}; ${cn.noticeDays} days notice${cn.firstWave ? `; first wave ${cn.firstWave.slice(0, 10)}` : ''}` })) },
      { id: 'exit', title: '6. Circuits, contracts and addresses', rows: [...a.circuits.map(ck => ({ label: ck.circuit.cid, value: `${ck.action}${ck.ceaseDate ? ` on ${ck.ceaseDate.slice(0, 10)}` : ''}${ck.penaltyUsd ? `; ${usd(ck.penaltyUsd)} early termination` : ''}` })), ...a.contracts.map(ct => ({ label: `${ct.contract.type} ${ct.contract.ctrId}`, value: ct.endsBeforeExit ? 'ends before the exit' : `serve notice by ${ct.serveBy?.slice(0, 10) ?? 'unknown (no notice period recorded)'}` })), { label: 'Addresses', value: `${a.ip.subnets.length} subnets, ${a.ip.vlans.length} VLANs and ${a.ip.addresses} addresses released after the last wave` }] },
      { id: 'compliance', title: '7. Compliance', rows: a.permits.map(p => ({ label: p.name, value: `${p.authority}; ${p.why}${p.onPlan ? '' : ' (not yet on the permit list)'}` })) },
      { id: 'cost', title: '8. Cost and savings', rows: [{ label: 'One-off cost', value: `${usd(e.capexTotal)} including ${usd(e.contingencyUsd ?? 0)} contingency` }, ...a.savings.map(l => ({ label: l.item, value: `${usd(l.amount)} a year · ${l.basis}` })), { label: 'Payback', value: e.paybackMonths === null ? 'no saving' : `${e.paybackMonths} months` }] },
    ];
    return [...out, ...keep.map((s, i) => ({ ...s, title: `${9 + i}. ${s.title.replace(/^\d+\.\s*/, '')}` }))];
  },

  initiation(ev, _t, _bom, generic): Initiation {
    const plan = ev.ctx.plan; const a = migrationOf(ev); const mode = modeOf(plan);
    const key = mode === 'consolidation' ? 'consolidation' : 'decommission'; const bp = getBlueprint(key);
    const waves = [...(plan.waves ?? [])].sort((x, y) => x.order - y.order); const now = clockMs();
    const first = waves[0] ? new Date(waves[0].windowStart).getTime() : now + 30 * DAY; const last = waves.length ? new Date(waves[waves.length - 1].windowEnd).getTime() : new Date(plan.targetGoLive).getTime();
    const exit = new Date(a?.exitDate ?? plan.targetGoLive).getTime(); const budget = ev.estimate.capexTotal;
    const P = (name: string, s: number, e: number, share: number, gate: string, template?: E.ProjectTemplate) => ({ name: `${plan.title} — ${name}`, start: new Date(s).toISOString(), end: new Date(Math.max(e, s + DAY)).toISOString(), budget: r0(budget * share), gate, longLead: false, template });
    const projects = bp ? bp.phases.map(ph => ({ name: `${plan.title} — ${ph.name}`, start: new Date(now + ph.startWeek * 7 * DAY).toISOString(), end: new Date(now + (ph.startWeek + ph.durationWeeks) * 7 * DAY).toISOString(), budget: r0(budget * ph.budgetShare), gate: ph.gate, longLead: !!ph.longLead, template: ph.template as E.ProjectTemplate | undefined })) : [
      P('Inventory freeze and dispositions', now, now + 14 * DAY, 0.02, 'Plan approved', 'Decommission Program'),
      P('Customer consent and notice', now, first, 0.02, 'Inventory frozen', 'Decommission Program'),
      P(mode === 'consolidation' ? 'Move waves' : 'Retire waves', first, last, 0.5, 'Consent in', mode === 'consolidation' ? 'Migration Wave' : 'Decommission Program'),
      P('Data sanitisation and disposal', first, last + 21 * DAY, 0.12, 'Each wave closed', 'Decommission Program'),
      P('Plant decommission (UPS, cooling, fire)', last, last + 21 * DAY, 0.14, 'Last wave closed', 'Decommission Program'),
      P('Circuits ceased and addresses released', last, last + 14 * DAY, 0.06, 'Last wave closed', 'Decommission Program'),
      P('Handback and site retired', last + 14 * DAY, exit, 0.14, 'Plant decommissioned', 'Decommission Program'),
    ];
    return { ...generic, vehicle: 'programme', budget, blueprintKey: bp ? key : undefined, blueprintName: bp?.name ?? (mode === 'consolidation' ? 'Consolidation programme' : 'Decommission programme'), projects,
      orders: a?.bom.filter(b => b.kind === 'rack').map(b => ({ item: `${b.item} × ${b.qty}`, category: b.category, value: b.qty * b.unitCost, orderBy: new Date(first - 77 * DAY).toISOString(), needBy: new Date(first - 7 * DAY).toISOString(), late: first - 77 * DAY < now })) ?? [],
      designDocs: [{ name: 'Basis of design', type: 'Concept Design', discipline: 'Architectural' }, { name: 'Inventory and disposition register', type: 'Detailed Design', discipline: 'Architectural' }, { name: 'Cut-over runbook (per wave)', type: 'Detailed Design', discipline: 'Network' }, { name: 'Customer consent register', type: 'Detailed Design', discipline: 'Architectural' }, { name: 'IP release and allocation plan', type: 'Detailed Design', discipline: 'Network' }, { name: 'Plant decommission method statement', type: 'Detailed Design', discipline: 'Electrical' }, { name: 'Closure checklist', type: 'Detailed Design', discipline: 'Architectural' }],
      workOrder: { process: 'P10 Work order', key: 'work-order' }, change: undefined, permits: plan.permits };
  },

  blockers(draft, ev, data): ScopeBlocker[] {
    const out: ScopeBlocker[] = []; if (!ev || !data?.ready) return out;
    const a = migrationOf(ev); if (!a?.ready || !draft.dataCenterId) return out;
    if (!(draft.dispositions ?? []).length) out.push({ level: 'bad', text: 'The inventory is not confirmed yet', step: 'requirements' });
    if (!(draft.waves ?? []).length) out.push({ level: 'bad', text: 'No waves yet', step: 'dim:migration' });
    if (a.permits.some(p => !p.onPlan)) out.push({ level: 'warn', text: `${noun(a.permits.filter(p => !p.onPlan).length, 'compliance step')} not on the permit list`, step: 'dim:permits' });
    return out;
  },
  siteMissing(draft) { return modeOf(draft) === 'consolidation' && draft.dataCenterId && !draft.peerDataCenterId ? 'Pick the target site, or switch to decommission' : null; },
  seedDraft: draft => ({ dispositions: [], consents: [], waves: [], params: { ...draft.params, migrationMode: 'decommission' } }),

  reservations(plan, ev, data): ReservationRequest[] {
    const a = migrationOf(ev); if (!a?.ready || a.mode !== 'consolidation' || !a.target || !a.kwMoving) return [];
    const peer = ev.ctx.peerSite;
    const out: ReservationRequest[] = [{ resourceType: 'PowerChain', resourceId: a.target.id, quantity: a.kwMoving, unit: 'kW', label: `${plan.plnId} · ${a.kwMoving} kW moving from ${a.source?.code}`, dataCenterId: a.target.id }];
    const zone = peer?.cooling.zones.find(z => z.headroomKw >= a.kwMoving) ?? peer?.cooling.zones[0];
    if (zone) out.push({ resourceType: 'Cooling', resourceId: zone.zone.id, quantity: a.kwMoving, unit: 'kW', label: `${plan.plnId} · cooling for the moved load`, dataCenterId: a.target.id });
    for (const id of (peer?.halls.flatMap(h => h.emptyRackIds) ?? []).slice(0, a.racksMoving)) if (byId(data, 'racks', id)) out.push({ resourceType: 'Rack', resourceId: id, quantity: 1, unit: 'rack', label: `${plan.plnId} · target rack for moved equipment`, dataCenterId: a.target.id });
    return out;
  },

  async executeVehicle(x) {
    const plan = x.plan; const mode = modeOf(plan); const key = mode === 'consolidation' ? 'consolidation' : 'decommission';
    const budget = plan.baseline?.capexTotal ?? x.ev.estimate.capexTotal;
    const res = getBlueprint(key) ? await x.createProgramFromBlueprint({ blueprintKey: key, name: plan.title, ownerName: plan.ownerName, dataCenterId: plan.dataCenterId, budget, objective: plan.intent }) : undefined;
    if (res?.programId) { x.artefacts.programId = res.programId; x.update('programs', res.programId, { plannerPlanId: plan.id }); }
    else {
      const init = migrationModel.initiation!(x.ev, x.template, x.bom, { vehicle: 'programme', name: plan.title, budget, projects: [], orders: [], permits: plan.permits, designDocs: [], workOrder: { process: 'P10 Work order', key: 'work-order' } });
      const programId = await x.createProgram({ name: plan.title, type: 'Decommissioning', objective: plan.intent || plan.title, ownerName: plan.ownerName, budget, status: 'Active', startDate: new Date(clockMs()).toISOString(), endDate: init.projects[init.projects.length - 1]?.end ?? plan.targetGoLive });
      x.artefacts.programId = programId; x.update('programs', programId, { plannerPlanId: plan.id });
      for (const pj of init.projects) { const pid = await x.createProject({ name: pj.name, programId, template: pj.template ?? 'Decommission Program', managerName: plan.ownerName, dataCenterId: plan.dataCenterId, plannedStart: pj.start, plannedEnd: pj.end, budget: pj.budget, detail: { planId: plan.id } }); if (pid) { x.update('projects', pid, { plannerPlanId: plan.id }); x.artefacts.projectIds = [...(x.artefacts.projectIds ?? []), pid]; } }
    }
    const inst = await x.startProcess('work-order', plan.plnId, { recordType: 'plannerPlan', recordId: plan.id, dataCenterId: plan.dataCenterId, title: plan.title, variables: { planId: plan.id, scope: plan.scope, mode } });
    if (!inst) x.warn('The work order could not be started; start it from Work orders'); else x.artefacts.processInstanceId = inst.id;
  },
  async execute(x) { await executeMigration(x); },
  closeout: (plan, data) => migrationCloseout(plan, data),
};

async function executeMigration(x: ExecCtx) {
  const plan = x.plan; const a = migrationOf(x.ev); if (!a?.ready) throw new Error('Platform data not loaded; execution needs the site records');
  const waves = [...(plan.waves ?? [])].filter(w => w.status !== 'Cancelled').sort((p, q) => p.order - q.order);
  if (!waves.length) throw new Error('The plan has no waves');
  await x.step('scope:site-status', () => { if (plan.dataCenterId && a.source?.status !== 'Decommissioning' && a.source?.status !== 'Retired') x.update('dataCenters', plan.dataCenterId, { status: 'Decommissioning' }); });
  await x.step('scope:link-changes', () => {
    for (const c of a.openDecomChanges.filter(c => !c.plannerPlanId)) { x.update('changeRequests', c.id, { plannerPlanId: plan.id }); x.artefacts.changeRequestIds = [...(x.artefacts.changeRequestIds ?? []), c.id]; }
    for (const ck of a.circuits.filter(c => c.action === 'cease' && c.ceaseDate)) x.update('circuits', ck.circuit.id, { ceaseDate: ck.ceaseDate, plannerPlanId: plan.id });
  });
  const out: T.PlannerWave[] = [];
  await x.step('scope:waves', async () => {
    const projectId = x.artefacts.projectIds?.[0];
    for (const w of waves) {
      if (w.changeRequestId || w.status === 'Closed') { out.push(w); continue; }
      const imp = impactOf(x.data, { deviceIds: w.deviceIds });
      // A wave that carries services or racked equipment to the target is a relocation; one that only retires (and redirects unracked spares) is a decommission.
      const moves = a.mode === 'consolidation' && (w.serviceIds.some(id => a.rows.find(r => r.recordId === id)?.disposition === 'move') || w.deviceIds.some(id => { const r = a.rows.find(x => x.recordId === id); return r?.disposition === 'move' && !!r.rackId; }));
      const chgId = x.seq('changeRequests', 'CHG');
      x.create('changeRequests', { id: chgId, chgId, title: `${plan.title} · ${w.name}`, type: moves ? 'ServerRelocation' : 'Decommission', description: `Raised from plan ${plan.plnId} (${MODE_LABEL[a.mode].toLowerCase()}). ${w.method ?? ''}. ${noun(w.deviceIds.length, 'device')}, ${noun(w.serviceIds.length, 'service')}${(w.circuitIds ?? []).length ? `, ${noun((w.circuitIds ?? []).length, 'circuit')}` : ''}. Customers consented: ${a.consents.filter(c => c.serviceIds.some(s => w.serviceIds.includes(s))).map(c => `${c.customerName} (${c.status})`).join(', ') || 'none affected'}. Chain of custody for every data-bearing device to the disposal vendor.`, risk: imp.critical ? 'High' : 'Medium', status: 'Submitted', priority: imp.critical ? 'High' : 'Medium', affectedResourceType: 'Asset', affectedResourceIds: w.deviceIds, dataCenterId: plan.dataCenterId, requestedBy: x.actor, requestedById: 'me', policyViolations: [], scheduledStart: w.windowStart, scheduledEnd: w.windowEnd, rollbackPlan: w.rollback, projectId, plannerPlanId: plan.id, plannerWaveId: w.id });
      const inst = await x.startProcess('change', chgId, { recordType: 'changeRequest', recordId: chgId, dataCenterId: plan.dataCenterId, title: `${plan.title} · ${w.name}`, variables: { planId: plan.id, waveId: w.id } });
      if (!inst) x.warn(`The change process for ${chgId} could not be started; start it from Changes`);
      const mwId = x.seq('maintenanceWindows', 'MW');
      x.create('maintenanceWindows', { id: mwId, mwId, title: `${plan.title} · ${w.name}`, status: 'Scheduled', dataCenterId: plan.dataCenterId, changeRequestId: chgId, scheduledStart: w.windowStart, scheduledEnd: w.windowEnd, affectedDeviceIds: w.deviceIds, impact: imp.services.length ? `${noun(imp.services.length, 'service')} (${imp.critical} critical) for ${imp.customers.map(c => c.customer.name).join(', ')}` : 'No customer service affected', owner: plan.ownerName, plannerPlanId: plan.id, plannerWaveId: w.id });
      x.artefacts.changeRequestIds = [...(x.artefacts.changeRequestIds ?? []), chgId]; x.artefacts.maintenanceWindowIds = [...(x.artefacts.maintenanceWindowIds ?? []), mwId];
      out.push({ ...w, changeRequestId: chgId, maintenanceWindowId: mwId, status: 'Scheduled' });
    }
    x.planPatch.waves = [...out, ...(plan.waves ?? []).filter(w => w.status === 'Cancelled')];
  });
}

export const migrationRuleChecks = ['mig-dispositions', 'mig-downtime', 'mig-target-fit', 'mig-consent', 'mig-circuits', 'mig-contracts', 'mig-permits', 'mig-critical', 'mig-linked-changes'] as const;
