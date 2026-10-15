/**
 * Scope model · server refresh, network device refresh and rack replacement.
 *
 * Everything is read from the selection, the mapping and the waves on the plan against the
 * live site (see lib/replaceAnalysis.ts). No site plant, fabric, staff or connectivity is sized:
 * the work happens inside racks that already exist. The estimate is the bill of materials plus
 * contingency, the business case is what changes against today, and lead times are per wave
 * with stock needing only its transfer time.
 */
import type * as T from '../../p2b/types';
import type * as E from '../../p2b/enums';
import type { CheckResult, ScopeBlocker, ScopeModel, ExecCtx, ReservationRequest, RackUnitRequest } from './types';
import type { Estimate, EstimateLine, Evaluation, Sizing } from '../engine';
import type { BodSection, Initiation, IpPlan } from '../outputs';
import { analyseReplace, PARALLEL, replaceOf, replaceSchedule, type ReplaceAnalysis } from '../replaceAnalysis';
import { replaceCloseout } from '../replaceClose';
import { pnum, pstr } from '../replaceBench';
import { RACK_REASON_LABEL, REASON_LABEL, readCriteria, reasonsOf, type Reason } from '../replaceCore';
import { rackCandidates, swapMethodOf, SWAP_TEXT } from '../replaceRack';
import { byId } from '../plannerData';
import { impactOf } from '../impact';
import { priceOf } from '../catalogue';
import { clockMs } from '../../compat/clock';

const r0 = (n: number) => Math.round(n);
const usd = (n: number) => `${Math.round(n).toLocaleString('en-US')} USD`;
const NOT_LOADED: CheckResult = { status: 'n/a', detail: 'Not checked: platform data still loading' };
const PROJECT_TEMPLATE: Record<string, E.ProjectTemplate> = { 'server-refresh': 'Server Refresh', 'network-refresh': 'Network Refresh', 'rack-replace': 'Rack Replacement' };
const CHANGE_TYPE: Record<string, T.ChangeRequest['type']> = { 'server-refresh': 'ServerRelocation', 'network-refresh': 'NetworkMigration', 'rack-replace': 'ServerRelocation' };
const noun = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Why the selection is due, counted on the selected items themselves (the wizard's reasons are quick filters, not criteria). */
function whyText(ev: Evaluation, a: ReplaceAnalysis): string {
  const data = ev.ctx.data; if (!data) return 'As selected';
  const now = clockMs(); const crit = readCriteria(ev.ctx.plan);
  if (a.scope === 'rack-replace') {
    const ids = new Set(a.rackIds); const counts = new Map<string, number>();
    for (const c of rackCandidates(data, ev.ctx.plan, crit, now).filter(c => ids.has(c.rack.id))) for (const r of c.reasons) counts.set(RACK_REASON_LABEL[r], (counts.get(RACK_REASON_LABEL[r]) ?? 0) + 1);
    return [...counts].map(([k, n]) => `${n} ${k.toLowerCase()}`).join(', ') || 'As selected';
  }
  const counts = new Map<Reason, number>();
  for (const d of a.old) for (const r of reasonsOf(data, d, crit.years, now).why) counts.set(r, (counts.get(r) ?? 0) + 1);
  return (['eol', 'warranty', 'faulty', 'age'] as Reason[]).filter(r => counts.get(r)).map(r => `${counts.get(r)} ${r === 'age' ? `older than ${crit.years} years` : REASON_LABEL[r].toLowerCase()}`).join(', ') || 'As selected';
}

function check(a: ReplaceAnalysis, plan: T.PlannerPlan, rule: T.PlannerRuleDef, ev: Evaluation): CheckResult | undefined {
  const waves = (plan.waves ?? []).filter(w => w.status !== 'Cancelled');
  const issues = (kinds: string[]) => a.waveCheck.issues.filter(i => kinds.includes(i.kind));
  const noWaves: CheckResult = { status: 'fail', detail: 'No waves yet: make them on the Migration waves step' };
  switch (rule.check) {
    case 'rpl-selection-free': return !a.old.length && !a.rackIds.length ? { status: 'fail', detail: 'Nothing selected' } : a.held.length ? { status: 'fail', detail: `${noun(a.held.length, 'selected item')} already held: ${a.held.slice(0, 3).map(h => `${byId(ev.ctx.data!, 'devices', h.id)?.name ?? byId(ev.ctx.data!, 'racks', h.id)?.name ?? h.id} (${h.why})`).join('; ')}` } : { status: 'pass', detail: `${noun(a.scope === 'rack-replace' ? a.rackIds.length : a.old.length, a.scope === 'rack-replace' ? 'rack' : 'device')} free of other plans and open changes` };
    case 'rpl-mapping': {
      if (a.scope === 'rack-replace') return a.rack?.newType ? { status: 'pass', detail: `${a.rack.newType.model}: ${a.rack.newType.uHeight} U, ${a.rack.newType.outerWidthMm} × ${a.rack.newType.outerDepthMm} mm (rack type catalogue)` } : { status: 'fail', detail: `${pstr(ev.params, 'rackModel')} is not in the rack type catalogue` };
      const bad = a.mapping.filter(m => !m.newModel || !m.am);
      return !a.mapping.length ? { status: 'fail', detail: 'Nothing selected' } : bad.length ? { status: 'fail', detail: `No current catalogue model for ${bad.map(m => `${m.oldModel} (${m.role})`).join(', ')}` } : { status: 'pass', detail: a.mapping.map(m => `${m.count} × ${m.oldModel} → ${m.newUnits} × ${m.newModel}`).join('; ') };
    }
    case 'rpl-rack-power': {
      if (a.scope === 'rack-replace') { const bad = (a.rack?.outlets ?? []).filter(o => o.drawKw > o.ratingAfterKw); return bad.length ? { status: 'fail', detail: bad.map(o => `${byId(ev.ctx.data!, 'racks', o.rackId)?.name}: ${o.drawKw} kW drawn, ${o.ratingAfterKw} kW after`).join('; ') } : { status: 'pass', detail: `Every rack's draw fits its rating after the swap (lower of the new strips and 80% of one feed)` }; }
      const bad = a.rackRows.filter(r => r.level === 'bad' && r.issues.some(i => /kW/.test(i)));
      const warn = a.rackRows.filter(r => r.level === 'warn');
      if (!bad.length && warn.length) return { status: 'warn', detail: `${warn.map(r => `${r.rack.name}: ${r.issues.join('; ')}`).slice(0, 3).join(' · ')}. Over its rating before this plan; raise it with the facility team.` };
      return !a.rackRows.length ? { status: 'n/a', detail: 'No racks in scope' } : bad.length ? { status: 'fail', detail: bad.slice(0, 4).map(r => `${r.rack.name}: ${r.issues.filter(i => /kW/.test(i)).join('; ')}`).join(' · '), value: `${bad.length} of ${a.rackRows.length}` } : { status: 'pass', detail: `${noun(a.rackRows.length, 'rack')} within the rack rating and 80% of each feed after the swap (peak and side-by-side)`, value: `${a.rackRows.length} racks` };
    }
    case 'rpl-rack-space': {
      if (a.scope === 'rack-replace') { const bad = (a.rack?.fit ?? []).filter(f => !f.ok); const warn = (a.rack?.fit ?? []).filter(f => f.ok && f.warnings.length); return bad.length ? { status: 'fail', detail: bad.map(f => `${byId(ev.ctx.data!, 'racks', f.rackId)?.name}: ${f.issues.join('; ')}`).join(' · ') } : warn.length ? { status: 'warn', detail: [...new Set(warn.flatMap(f => f.warnings))].join(' · ') } : { status: 'pass', detail: 'The new rack fits every position: width, depth, height and floor loading' }; }
      const bad = a.rackRows.filter(r => r.issues.some(i => !/kW/.test(i)));
      const homeless = a.units.filter(u => !u.placed);
      if (homeless.length) return { status: 'fail', detail: `${noun(homeless.length, 'new unit')} without a position: ${[...new Set(homeless.map(u => u.note))].join('; ')}`, value: `${a.units.length - homeless.length} of ${a.units.length}` };
      return bad.length ? { status: 'fail', detail: bad.slice(0, 4).map(r => `${r.rack.name}: ${r.issues.filter(i => !/kW/.test(i)).join('; ')}`).join(' · ') } : { status: 'pass', detail: `Every new unit has a position; U and weight within limits in ${noun(a.rackRows.length, 'rack')}` };
    }
    case 'rpl-critical-parallel': {
      if (!a.critical.services.length) return { status: 'pass', detail: 'No critical service on the selected equipment' };
      const crit = a.critical.ids;
      if (!waves.length) return a.approach === PARALLEL || a.scope !== 'server-refresh' ? { status: 'warn', detail: `${noun(a.critical.services.length, 'critical service')}; waves not made yet` } : { status: 'fail', detail: `${noun(a.critical.services.length, 'critical service')} (${a.critical.services.slice(0, 2).map(s => s.name).join(', ')}) need a parallel run, but the approach is "${a.approach}"` };
      const bad = waves.filter(w => w.deviceIds.some(d => crit.has(d)) && (!w.rollback?.trim() || (a.scope === 'server-refresh' ? w.method !== PARALLEL : a.scope === 'network-refresh' ? !w.side : false)));
      return bad.length ? { status: 'fail', detail: `${bad.map(w => w.name).join(', ')} carr${bad.length === 1 ? 'ies' : 'y'} critical services without ${a.scope === 'server-refresh' ? 'a parallel run' : a.scope === 'network-refresh' ? 'a redundant partner carrying the load' : 'a stated method'} and a rollback` } : { status: 'pass', detail: `${noun(a.critical.services.length, 'critical service')} only in waves with ${a.scope === 'server-refresh' ? 'a parallel run' : 'the partner carrying the load'} and a rollback` };
    }
    case 'wave-ha-split': { if (!waves.length) return noWaves; const x = issues(['pair']); return x.length ? { status: 'fail', detail: x.slice(0, 3).map(i => i.text).join(' · ') } : { status: 'pass', detail: a.pairs.length ? `${noun(a.pairs.length, 'redundant pair')}, each split across waves` : 'No redundant pairs found among the selected devices (virtual chassis, peer links, service paths, naming, same rack)' }; }
    case 'wave-fits-window': { if (!waves.length) return noWaves; const x = issues(['capacity', 'window']); return x.length ? { status: 'fail', detail: x.slice(0, 3).map(i => `${waves.find(w => w.id === i.waveId)?.name}: ${i.text}`).join(' · ') } : { status: 'pass', detail: `Each wave fits one ${a.windowHours} h window at ${a.rate} per hour` }; }
    case 'wave-clash': {
      if (!waves.length) return noWaves; const x = issues(['clash', 'upstream']); const bad = x.filter(i => i.level === 'bad');
      return bad.length ? { status: 'fail', detail: bad.slice(0, 3).map(i => `${waves.find(w => w.id === i.waveId)?.name}: ${i.text}`).join(' · ') } : x.length ? { status: 'warn', detail: x.slice(0, 3).map(i => `${waves.find(w => w.id === i.waveId)?.name}: ${i.text}`).join(' · ') } : { status: 'pass', detail: 'No maintenance window or open change on the same equipment at the same time' };
    }
    case 'wave-coverage': { if (!waves.length) return noWaves; return a.waveCheck.unassigned.length || a.waveCheck.duplicated.length ? { status: 'fail', detail: issues(['coverage']).map(i => i.text).join(' · ') } : { status: 'pass', detail: `Everything selected is in exactly one of ${noun(waves.length, 'wave')}` }; }
    case 'wave-ab-soak': { if (!waves.length) return noWaves; const x = issues(['order']); return x.length ? { status: 'fail', detail: x.slice(0, 3).map(i => i.text).join(' · ') } : { status: 'pass', detail: a.pairs.length ? `Side B of every pair starts at least ${a.soakDays} days after side A` : 'No pairs to sequence' }; }
    case 'wave-acceptance': { if (!waves.length) return noWaves; const bad = waves.filter(w => !w.acceptance?.trim() || !w.rollback?.trim()); return bad.length ? { status: 'warn', detail: `${bad.map(w => w.name).join(', ')} without acceptance or rollback` } : { status: 'pass', detail: `Every wave states its acceptance test and rollback${a.scope === 'server-refresh' ? ' (burn-in test per wave created at execution)' : ''}` }; }
    case 'rpl-nic-fit': return a.nic ? { status: a.nic.status, detail: a.nic.detail } : { status: 'n/a', detail: 'Not a server refresh' };
    case 'net-port-fit': {
      const p = a.ports; if (!p) return { status: 'n/a', detail: 'Not a network refresh' };
      if (p.noProfile.length) return { status: 'n/a', detail: `No port profile for ${p.noProfile.join(', ')}; port fit not checked` };
      const basis = p.assumed ? ` (${noun(p.assumed, 'device')} without cable or interface records: every enabled port counted as used)` : '';
      return p.incompatible ? { status: 'fail', detail: `${noun(p.incompatible, 'used port')} with no compatible port on the new model: ${p.devices.flatMap(d => d.incompatible).slice(0, 3).map(r => `${byId(ev.ctx.data!, 'devices', r.deviceId)?.name} ${r.oldPort} ${r.oldCls}`).join(', ')}${basis}` } : { status: 'pass', detail: `${noun(p.used, 'used port')} mapped to compatible ports${basis}` };
    }
    case 'net-far-end': { const p = a.ports; if (!p) return { status: 'n/a', detail: 'Not a network refresh' }; return p.farEnd.length ? { status: 'warn', detail: `${noun(p.farEnd.length, 'uplink')} move to 100G: the far-end (spine) ports and optics change too; listed in the patch list and priced` } : { status: 'pass', detail: 'No far-end port changes' }; }
    case 'net-airflow': {
      if (a.scope !== 'network-refresh') return { status: 'n/a', detail: 'Not a network refresh' };
      const flows = new Map<string, number>(); for (const d of a.old) flows.set(d.airflow ?? 'not recorded', (flows.get(d.airflow ?? 'not recorded') ?? 0) + 1);
      const odd = [...flows.keys()].filter(f => f !== 'front-to-rear' && f !== 'rear-to-front');
      const txt = [...flows.entries()].map(([f, n]) => `${n} × ${f}`).join(', ');
      return odd.length ? { status: 'warn', detail: `${txt}: order the matching airflow variant per rack; ${odd.join(', ')} has no standard variant, check the rack's aisle orientation` } : { status: 'pass', detail: `${txt}: order the matching airflow variant per rack` };
    }
    case 'net-config-backup': {
      if (a.scope !== 'network-refresh') return { status: 'n/a', detail: 'Not a network refresh' };
      const miss = a.old.filter(d => !ev.ctx.data!.configBackups.some(b => b.deviceId === d.id));
      return miss.length ? { status: 'warn', detail: `${noun(miss.length, 'switch', 'switches')} without a configuration backup on record; capture one before the first wave` } : { status: 'pass', detail: 'Every switch has a configuration backup to carry over' };
    }
    case 'rack-outlets': { const bad = (a.rack?.outlets ?? []).filter(o => !o.ok); return !a.rack ? { status: 'n/a', detail: 'Not a rack replacement' } : bad.length ? { status: 'fail', detail: bad.map(o => `${byId(ev.ctx.data!, 'racks', o.rackId)?.name}: ${o.detail}`).join(' · ') } : { status: 'pass', detail: `Outlets per side cover every power port in ${noun(a.rackIds.length, 'rack')}` }; }
    case 'rack-consent': {
      if (!a.rack) return { status: 'n/a', detail: 'Not a rack replacement' };
      const firstWave = (key: string) => { const ids = a.rack!.tenants.find(t => t.key === key)?.rackIds ?? []; return waves.filter(w => w.rackIds.some(r => ids.includes(r))).map(w => w.windowStart).sort()[0]; };
      const bad = a.rack.consents.filter(cn => {
        if (cn.status !== 'Consented' || !cn.notifiedAt) return true;
        const first = firstWave(cn.customerRef);
        return !!first && new Date(first).getTime() < new Date(cn.notifiedAt).getTime() + cn.noticeDays * 864e5;
      });
      return !a.rack.consents.length ? { status: 'pass', detail: 'No tenant on the racks' } : bad.length ? { status: 'fail', detail: `${noun(bad.length, 'tenant')} without consent or full notice before their first wave: ${bad.slice(0, 4).map(cn => `${cn.customerName} (${cn.status})`).join(', ')}` } : { status: 'pass', detail: `${noun(a.rack.consents.length, 'tenant')} consented, notice served before their first wave` };
    }
    case 'rack-xconnect': { if (!a.rack) return { status: 'n/a', detail: 'Not a rack replacement' }; const x = a.rack.xconnects; return x.length ? { status: 'warn', detail: `${noun(x.length, 'cross-connect')} end in the racks and must be re-patched with the carrier: ${x.slice(0, 4).map(t => t.termination.xconnectId ?? t.circuit?.cid).join(', ')}` } : { status: 'pass', detail: 'No cross-connects end in the racks' }; }
    case 'payback': {
      if (a.scope !== 'server-refresh') return { status: 'n/a', detail: a.scope === 'rack-replace' ? 'Justified by safety and power headroom, not savings' : `Driven by end of life; running cost changes by ${usd(ev.estimate.benefitAnnual ?? 0)} a year` };
      const m = ev.estimate.paybackMonths; return m === null ? { status: 'warn', detail: `No saving to pay the work back (${usd(ev.estimate.benefitAnnual ?? 0)} a year)` } : { status: m <= (rule.threshold ?? 96) ? 'pass' : 'warn', detail: `${m} months on ${usd(ev.estimate.benefitAnnual ?? 0)} a year of savings`, value: `${m} mo` };
    }
    default: return undefined;
  }
}

export const replaceModel: ScopeModel = {
  family: 'replace',

  size(c, generic): Sizing {
    const a = analyseReplace(c);
    const itKw = a.ready && (a.old.length || a.rackIds.length) ? a.newKw : c.plan.designPowerKw;
    return { ...generic, itKw, racks: a.rackIds.length || generic.racks, halls: 0, buildings: 0, whiteSpaceM2: 0, grossAreaM2: 0, rackClasses: [], plant: [], sites: 0,
      network: { leaves: 0, spines: 0, cores: 0, uplinks: 0, accessPorts: 0, uplinkGbps: 0, carriers: 0, dciGbps: 0 },
      staffing: { fte: 0, shifts: 0, perMw: 0, source: generic.staffing.source }, spares: { lines: 0, valueUsd: 0 },
      cooling: { ...generic.cooling, capacityKw: 0, units: 0, unitKw: 0, liquidRequired: false },
      pue: c.site ? { value: c.site.pue, source: 'actual', note: `${c.site.dc.name} (${c.site.pueSource})` } : generic.pue };
  },
  ladder: () => [],

  estimate(c, sizing, generic): Estimate {
    const a = analyseReplace(c); if (!a.ready) return generic;
    const byCat = new Map<string, { amount: number; lines: number }>();
    for (const l of a.bom) { const t = byCat.get(l.category) ?? { amount: 0, lines: 0 }; t.amount += r0(l.qty) * r0(l.unitCost); t.lines++; byCat.set(l.category, t); }
    const capex: EstimateLine[] = [...byCat.entries()].map(([cat, t]) => ({ category: 'CapEx', item: cat, amount: r0(t.amount), basis: `Bill of materials: ${noun(t.lines, 'line')}`, source: 'benchmark' }));
    const bomTotal = capex.reduce((s, l) => s + l.amount, 0);
    const pct = pnum(c.params, 'costContingencyPct', 10);
    const contingency = r0(bomTotal * pct / 100);
    if (contingency) capex.push({ category: 'CapEx', item: 'Contingency', amount: contingency, basis: `${pct}% of the bill of materials`, source: c.params.costContingencyPct?.source ?? 'template' });
    const b = a.business;
    if (b.resaleCredit) capex.push({ category: 'CapEx', item: 'Resale credit for old equipment', amount: -b.resaleCredit, basis: 'Broker quotes per device class (one-off credit)', source: 'benchmark' });
    const capexTotal = capex.reduce((s, l) => s + l.amount, 0);
    const opexMonthly = b.opexLines.reduce((s, l) => s + l.amount, 0);
    const benefitAnnual = b.benefitLines.reduce((s, l) => s + l.amount, 0);
    const payback = a.scope === 'server-refresh' && benefitAnnual > 0 ? r0((capexTotal / benefitAnnual) * 12) : null;
    return {
      ...generic, capex, capexTotal, capexPerKw: sizing.itKw ? r0(capexTotal / sizing.itKw) : 0, capexPerRack: a.rackIds.length ? r0(capexTotal / a.rackIds.length) : 0,
      opex: b.opexLines, opexMonthly, opexAnnual: opexMonthly * 12, energyMwhYear: r0((b.energyNewKw * (sizing.pue.value || 1.5) * 8760) / 1000),
      revenueAnnual: 0, energyRecoveredAnnual: 0, marginAnnual: benefitAnnual, paybackMonths: payback,
      paybackBasis: a.scope === 'server-refresh' ? 'One-off cost ÷ yearly savings (energy, support no longer renewed, licences)' : b.notes[0] ?? 'Driven by end of life, not savings', plantCapexTotal: 0,
      costPerKwMonth: sizing.itKw ? r0(opexMonthly / sizing.itKw) : 0, benchmarkBand: undefined,
      benefitLines: b.benefitLines, benefitAnnual, basis: 'bottom-up', contingencyUsd: contingency,
    };
  },

  schedule(c, _s, generic) {
    const a = analyseReplace(c); if (!a.ready) return generic.filter(g => g.kind === 'permit');
    return [...replaceSchedule(a, c.plan), ...generic.filter(g => g.kind === 'permit')];
  },

  check(c, rule, ev) {
    if (!c.data?.ready) return ['rpl-', 'wave-', 'net-', 'rack-'].some(p => rule.check.startsWith(p)) ? NOT_LOADED : undefined;
    return check(analyseReplace(c), c.plan, rule, ev);
  },
  analyse: c => ({ replace: analyseReplace(c) }),

  bom(ev, add) { const a = replaceOf(ev); if (!a?.ready) return false; for (const l of a.bom) add(l); return true; },

  ipPlan(ev, generic): IpPlan {
    const a = replaceOf(ev); if (!a?.ready) return generic;
    const items = a.units.flatMap(u => [u.keepIp4 && { id: `${u.id}-ip`, scope: byId(ev.ctx.data!, 'racks', u.rackId)?.name ?? 'Rack', purpose: 'Production' as const, name: u.keepHostname ?? byId(ev.ctx.data!, 'devices', u.oldIds[0])?.name ?? u.id, cidr: `${u.keepIp4}/32`, prefix: 32, hosts: 1, notes: `Kept from ${byId(ev.ctx.data!, 'devices', u.oldIds[0])?.name}` }, u.keepOob && { id: `${u.id}-oob`, scope: byId(ev.ctx.data!, 'racks', u.rackId)?.name ?? 'Rack', purpose: 'OOB' as const, name: `${u.keepHostname ?? byId(ev.ctx.data!, 'devices', u.oldIds[0])?.name ?? u.id} OOB`, cidr: `${u.keepOob}/32`, prefix: 32, hosts: 1, notes: 'Out-of-band address kept' }].filter(Boolean) as IpPlan['items']);
    return { aggregate: 'Existing addressing kept', items, vlans: [], asns: [], usedAddresses: items.length, totalAddresses: items.length };
  },

  bod(ev, sections): BodSection[] {
    const a = replaceOf(ev); if (!a?.ready) return sections;
    const keep = sections.filter(s => ['risks', 'standards'].includes(s.id));
    const purpose = sections.find(s => s.id === 'purpose');
    const waves = [...(ev.ctx.plan.waves ?? [])].sort((x, y) => x.order - y.order);
    const e = ev.estimate;
    const out: BodSection[] = [
      { id: 'purpose', title: '1. Purpose', text: purpose?.text, rows: [{ label: 'Plan type', value: purpose?.rows[0]?.value ?? '' }, { label: 'Site', value: `${a.dc?.name} (${a.dc?.code})` }, { label: a.scope === 'rack-replace' ? 'Racks' : 'Devices', value: a.scope === 'rack-replace' ? `${a.rackIds.length} racks holding ${a.old.length} devices` : `${a.old.length} devices in ${a.rackIds.length} racks` }, { label: 'Why', value: whyText(ev, a) }] },
      { id: 'mapping', title: '2. Old to new', rows: a.scope === 'rack-replace' ? [{ label: 'New rack', value: `${a.rack?.newType?.model ?? '—'} · ${a.rack?.recommend.type ? `recommended: ${a.rack.recommend.type.model} (${a.rack.recommend.why})` : a.rack?.recommend.why}` }, ...a.rackIds.map(id => ({ label: byId(ev.ctx.data!, 'racks', id)?.name ?? id, value: `${swapMethodOf(ev.ctx.plan, id)}: ${SWAP_TEXT[swapMethodOf(ev.ctx.plan, id)]}` }))] : a.mapping.map(m => ({ label: `${m.count} × ${m.oldModel} (${m.role})`, value: `${m.newUnits} × ${m.newModel} at ${m.ratio}:1; old ones: ${m.disposition}`, source: m.fromPlan ? 'Entered' : 'Catalogue default' })) },
      { id: 'racks', title: '3. Power, space and weight per rack', rows: a.scope === 'rack-replace' ? (a.rack?.outlets ?? []).map(o => ({ label: byId(ev.ctx.data!, 'racks', o.rackId)?.name ?? o.rackId, value: `${o.drawKw} kW drawn; rating ${o.ratingBeforeKw} → ${o.ratingAfterKw} kW; ${o.detail}` })) : a.rackRows.map(r => ({ label: r.rack.name, value: `${r.kwBefore} → ${r.kwAfter} kW (peak ${r.kwPeakAfter}) of ${r.ratingKw} kW; ${r.uBefore} → ${r.uAfter} U; ${r.kgBefore} → ${r.kgAfter} kg${r.issues.length ? ` · ${r.issues.join('; ')}` : ''}` })) },
      { id: 'network', title: '4. Network', rows: a.ports ? [{ label: 'Ports', value: `${a.ports.used} used ports mapped, ${a.ports.incompatible} without a match` }, { label: 'Far end', value: `${a.ports.farEnd.length} uplinks change speed at the spine` }, { label: 'Optics', value: a.ports.optics.map(o => `${o.cls}: ${o.reuse} reused, ${o.buy} new`).join('; ') || 'none' }] : a.nic ? [{ label: 'Server ports', value: a.nic.detail }] : [{ label: 'Cross-connects', value: `${a.rack?.xconnects.length ?? 0} to re-patch with the carrier` }] },
      { id: 'impact', title: '5. Services and customers', rows: [{ label: 'Services', value: `${a.impact.services.length} (${a.impact.critical} critical), ${usd(a.impact.revenueMonthly)} a month` }, ...a.impact.customers.slice(0, 8).map(cu => ({ label: cu.customer.name, value: `${cu.services.length} services${cu.critical ? `, ${cu.critical} critical` : ''}; account manager ${cu.customer.accountManager}` }))] },
      { id: 'waves', title: '6. Waves', rows: waves.map(w => ({ label: w.name, value: `${new Date(w.windowStart).toUTCString().slice(0, 22)} · ${w.deviceIds.length} devices, ${w.rackIds.length} racks · ${w.method ?? ''}` })) },
      { id: 'cost', title: '7. Cost and business case', rows: [{ label: 'One-off cost', value: `${usd(e.capexTotal)} (bill of materials plus ${usd(e.contingencyUsd ?? 0)} contingency)` }, ...(e.benefitLines ?? []).map(l => ({ label: l.item, value: `${usd(l.amount)} a year · ${l.basis}` })), { label: 'Payback', value: e.paybackMonths === null ? e.paybackBasis : `${e.paybackMonths} months` }] },
    ];
    return [...out, ...keep.map((s, i) => ({ ...s, title: `${8 + i}. ${s.title.replace(/^\d+\.\s*/, '')}` }))];
  },

  initiation(ev, _t, _bom, generic): Initiation {
    const a = replaceOf(ev); const plan = ev.ctx.plan;
    const waves = [...(plan.waves ?? [])].sort((x, y) => x.order - y.order);
    const end = waves.length ? waves[waves.length - 1].windowEnd : plan.targetGoLive;
    const docs: Initiation['designDocs'] = [{ name: 'Basis of design', type: 'Concept Design', discipline: 'Architectural' }, { name: plan.scope === 'rack-replace' ? 'Rack swap list' : 'Old-to-new device list', type: 'Detailed Design', discipline: plan.scope === 'network-refresh' ? 'Network' : 'Architectural' }, { name: 'Cut-over runbook (per wave)', type: 'Detailed Design', discipline: plan.scope === 'network-refresh' ? 'Network' : 'Electrical' }, ...(plan.scope === 'network-refresh' ? [{ name: 'Port and patch list', type: 'Detailed Design' as const, discipline: 'Network' as const }] : []), ...(plan.scope === 'rack-replace' ? [{ name: 'Outlet plan and rack elevations', type: 'Detailed Design' as const, discipline: 'Electrical' as const }] : []), { name: 'Customer notification list', type: 'Detailed Design', discipline: 'Architectural' }];
    const orders = (a?.needs ?? []).filter(n => n.toBuy > 0).map(n => ({ item: `${n.model} × ${n.toBuy} (${n.waveName})`, category: (plan.scope === 'server-refresh' ? 'Compute and storage' : plan.scope === 'network-refresh' ? 'Network' : 'Racks and containment') as Initiation['orders'][number]['category'], value: n.toBuy * (priceOf(n.model) ?? 0), orderBy: n.orderBy, needBy: n.needBy, late: n.late }));
    return { ...generic, vehicle: 'project', budget: ev.estimate.capexTotal, blueprintKey: undefined, blueprintName: `${PROJECT_TEMPLATE[plan.scope]} (delivery template)`, projects: [{ name: plan.title, start: new Date(clockMs()).toISOString(), end, budget: ev.estimate.capexTotal, gate: 'Plan approved', longLead: false, template: PROJECT_TEMPLATE[plan.scope] }], orders, designDocs: docs, workOrder: { process: 'P10 Work order', key: 'work-order' }, change: undefined, permits: plan.permits };
  },

  blockers(draft, ev, data): ScopeBlocker[] {
    const out: ScopeBlocker[] = [];
    if (!ev || !data?.ready) return out;
    const a = replaceOf(ev); if (!a?.ready || !draft.dataCenterId) return out;
    if (a.held.length) out.push({ level: 'bad', text: `${noun(a.held.length, 'selected item')} already held by another plan or an open change`, step: 'requirements' });
    if ((a.old.length || a.rackIds.length) && !(draft.waves ?? []).length) out.push({ level: 'bad', text: 'No waves yet', step: 'dim:migration' });
    if (draft.scope !== 'rack-replace' && a.mapping.some(m => !m.am)) out.push({ level: 'bad', text: 'A mapping row has no catalogue model', step: draft.scope === 'server-refresh' ? 'dim:it' : 'dim:network' });
    if (draft.scope !== 'rack-replace' && a.mapping.length && !(draft.mapping ?? []).length) out.push({ level: 'warn', text: 'The old-to-new mapping uses catalogue defaults; confirm it', step: draft.scope === 'server-refresh' ? 'dim:it' : 'dim:network' });
    const notified = a.impact.customers.length;
    if (notified && draft.scope !== 'rack-replace') out.push({ level: 'warn', text: `${noun(notified, 'customer')} to notify before the first wave (list in the plan pack)`, step: 'review' });
    return out;
  },
  siteMissing(draft) {
    if (draft.params.affectedSiteId && draft.params.affectedSiteId !== draft.dataCenterId) return 'Select again what is being replaced at this site';
    return null;
  },
  seedDraft: draft => ({ mapping: [], waves: [], params: { ...draft.params, affectedIds: '', selectionCriteria: '' } }),

  reservations(plan, ev, data): ReservationRequest[] {
    const a = replaceOf(ev); if (!a?.ready || plan.scope === 'rack-replace') return [];
    // Hold only what a rack gains: the peak after the swap, or the side-by-side peak during a parallel run, above today's draw.
    return a.rackRows.filter(r => r.inn.length).map(r => ({ resourceType: 'PowerChain' as const, resourceId: r.rack.id, quantity: Math.round(Math.max(0, r.kwPeakAfter - r.kwBefore, r.kwOverlap - r.kwBefore) * 10) / 10, unit: 'kW', label: `${plan.plnId} · ${r.inn.length} new ${r.inn.length === 1 ? 'unit' : 'units'} in ${r.rack.name} (peak above today)`, dataCenterId: plan.dataCenterId })).filter(x => x.quantity > 0 && byId(data, 'racks', x.resourceId));
  },
  rackUnits(plan, ev): RackUnitRequest[] {
    const a = replaceOf(ev); if (!a?.ready) return [];
    return a.units.filter(u => u.rackId && u.startU && u.placed && !(u.startU === byId(ev.ctx.data!, 'devices', u.oldIds[0])?.position && u.rackId === byId(ev.ctx.data!, 'devices', u.oldIds[0])?.rackId)).map(u => ({ rackId: u.rackId!, units: Array.from({ length: u.heightU }, (_, i) => u.startU! + i), description: `${plan.plnId} · ${u.model} replacing ${u.oldIds.map(id => byId(ev.ctx.data!, 'devices', id)?.name ?? id).join(', ')}` }));
  },

  async executeVehicle(x) {
    const plan = x.plan;
    const waves = [...(plan.waves ?? [])].sort((p, q) => p.order - q.order);
    const end = waves.length ? waves[waves.length - 1].windowEnd : plan.targetGoLive;
    const budget = plan.baseline?.capexTotal ?? x.ev.estimate.capexTotal;
    const programId = await x.createProgram({ name: plan.title, type: plan.scope === 'network-refresh' ? 'Network Modernization' : 'Other', objective: plan.intent || plan.title, ownerName: plan.ownerName, budget, status: 'Active', startDate: new Date(clockMs()).toISOString(), endDate: end });
    x.update('programs', programId, { plannerPlanId: plan.id }); x.artefacts.programId = programId;
    const pid = await x.createProject({ name: plan.title, programId, template: PROJECT_TEMPLATE[plan.scope], managerName: plan.ownerName, dataCenterId: plan.dataCenterId, plannedStart: new Date(clockMs()).toISOString(), plannedEnd: end, budget, detail: { planId: plan.id } });
    if (pid) { x.update('projects', pid, { plannerPlanId: plan.id }); x.artefacts.projectIds = [...(x.artefacts.projectIds ?? []), pid]; }
    const inst = await x.startProcess('work-order', plan.plnId, { recordType: 'plannerPlan', recordId: plan.id, dataCenterId: plan.dataCenterId, title: plan.title, variables: { planId: plan.id, scope: plan.scope, capex: budget } });
    if (!inst) x.warn('The work order could not be started; start it from Work orders'); else x.artefacts.processInstanceId = inst.id;
  },

  async execute(x) { await executeReplace(x); },
  closeout: (plan, data) => replaceCloseout(plan, data),
};

/** Per wave: a change request, a maintenance window and an acceptance test; planned devices for what is bought; config changes (network); planned racks (rack swaps). */
async function executeReplace(x: ExecCtx) {
  const plan = x.plan; const a = replaceOf(x.ev); if (!a?.ready) throw new Error('Platform data not loaded; execution needs the site records');
  const waves = [...(plan.waves ?? [])].filter(w => w.status !== 'Cancelled').sort((p, q) => p.order - q.order);
  if (!waves.length) throw new Error('The plan has no waves');
  const projectId = x.artefacts.projectIds?.[0];
  const out: T.PlannerWave[] = [];
  // Units bought (not covered by stock reserved for the plan) become planned device records, latest waves first.
  const stockBy = new Map<string, number>(); for (const l of x.sourced?.lines ?? []) if (l.model) stockBy.set(l.model, (stockBy.get(l.model) ?? 0) + l.fromStock);
  const unitWave = new Map<string, T.PlannerWave>(); for (const u of a.units) { const w = waves.find(v => u.oldIds.some(id => v.deviceIds.includes(id))); if (w) unitWave.set(u.id, w); }
  const planned = new Map<string, string>();
  await x.step('scope:planned-devices', () => {
    if (plan.scope === 'rack-replace') return;
    const byModel = new Map<string, typeof a.units>(); for (const u of a.units) byModel.set(u.model, [...(byModel.get(u.model) ?? []), u]);
    for (const [model, list] of byModel) {
      const buy = list.slice(Math.min(list.length, stockBy.get(model) ?? 0));
      const am = x.data.assetModels.find(m => m.model === model);
      for (const u of buy) {
        const id = x.seq('devices', 'ASSET'); const w = unitWave.get(u.id); const rack = byId(x.data, 'racks', u.rackId);
        x.create('devices', { id, devcId: id, name: `${plan.plnId.toLowerCase()}-${u.id.toLowerCase()}`, deviceTypeId: ((x.data as unknown as { deviceTypes?: T.DcimDeviceType[] }).deviceTypes ?? []).find(t => t.model === model)?.id ?? '', model, manufacturer: am?.manufacturer, category: am?.category, heightU: am?.heightU, powerDrawW: am?.typicalPowerW, weightKg: am?.weightKg, assetModelId: am?.id, dataCenterId: plan.dataCenterId, status: 'Planned', lifecycleState: 'Ordered', plannerPlanId: plan.id, notes: `Planned for ${plan.plnId} · unit ${u.id} · ${w?.name ?? 'unscheduled'} · ${rack?.name ?? 'no rack yet'}${u.startU ? ` U${u.startU}` : ''}` });
        planned.set(u.id, id);
      }
    }
    x.artefacts.plannedDeviceIds = [...(x.artefacts.plannedDeviceIds ?? []), ...planned.values()];
  });
  // Rack swaps: the new rack record per old rack (planned), or the free position it moves into (reserved).
  if (plan.scope === 'rack-replace') await x.step('scope:planned-racks', () => {
    const usedFree = new Set<string>(); const ids: string[] = [];
    for (const rid of a.rackIds) {
      const old = byId(x.data, 'racks', rid); if (!old) continue;
      const method = swapMethodOf(plan, rid);
      const free = method === 'Next free position in the row' ? (a.rack?.freePositions[rid] ?? []).find(r => !usedFree.has(r.id)) : undefined;
      if (free) { usedFree.add(free.id); x.update('racks', free.id, { status: 'Reserved', plannerPlanId: plan.id, notes: `Position for the rack that replaces ${old.id} (${old.name}) under ${plan.plnId}` }); ids.push(free.id); continue; }
      if (method === 'Next free position in the row') x.warn(`${old.name}: no free position left in the row; swapped in place`);
      const id = x.seq('racks', 'RACK'); const t = a.rack?.newType;
      x.create('racks', { ...old, id, rackId: id, name: `${old.name} (new)`, status: 'Planned', rackTypeId: t?.id ?? old.rackTypeId, heightU: t?.uHeight ?? old.heightU, usedU: 0, availableU: t?.uHeight ?? old.heightU, currentPowerKw: 0, powerUtilizationPct: 0, currentWeightKg: t?.weight ?? 0, outerWidthMm: t?.outerWidthMm, outerDepthMm: t?.outerDepthMm, mountingDepthMm: t?.mountingDepthMm, maxPowerKw: a.rack?.outlets.find(o => o.rackId === rid)?.ratingAfterKw ?? old.maxPowerKw, plannerPlanId: plan.id, notes: `Planned rack that replaces ${old.id} (${old.name}) under ${plan.plnId}` });
      ids.push(id);
    }
    x.artefacts.plannedRackIds = [...(x.artefacts.plannedRackIds ?? []), ...ids];
  });
  await x.step('scope:waves', async () => {
    const data = x.data;
    for (const w of waves) {
      if (w.changeRequestId && w.status !== 'Planned') { out.push(w); continue; }
      const imp = impactOf(data, { deviceIds: w.deviceIds, rackIds: plan.scope === 'rack-replace' ? w.rackIds : undefined, downstream: plan.scope === 'network-refresh' });
      const newIds = a.units.filter(u => u.oldIds.some(id => w.deviceIds.includes(id))).map(u => planned.get(u.id)).filter(Boolean) as string[];
      const crit = imp.services.some(s => s.service.critical);
      const chgId = x.seq('changeRequests', 'CHG');
      const custody = plan.scope === 'rack-replace' ? '' : ' Chain of custody: drives and devices for disposal stay in the cage until collected in sealed, numbered bags by the disposal vendor; serials are checked against the certificate list and signed by both sides.';
      x.create('changeRequests', { id: chgId, chgId, title: `${plan.title} · ${w.name}`, type: CHANGE_TYPE[plan.scope], description: `Raised from plan ${plan.plnId}. ${w.method ?? ''}. ${noun(w.deviceIds.length, 'device')} in ${noun(w.rackIds.length, 'rack')}; ${noun(imp.services.length, 'service')} (${imp.critical} critical) for ${noun(imp.customers.length, 'customer')}. Acceptance: ${w.acceptance ?? 'as per runbook'}.${custody}`, risk: crit ? 'High' : w.kind === 'pilot' ? 'Medium' : 'Low', status: 'Submitted', priority: crit ? 'High' : 'Medium', affectedResourceType: plan.scope === 'rack-replace' ? 'Rack' : 'Asset', affectedResourceIds: plan.scope === 'rack-replace' ? w.rackIds : [...w.deviceIds, ...newIds], dataCenterId: plan.dataCenterId, requestedBy: x.actor, requestedById: 'me', policyViolations: [], scheduledStart: w.windowStart, scheduledEnd: w.windowEnd, rollbackPlan: w.rollback, projectId, plannerPlanId: plan.id, plannerWaveId: w.id });
      const inst = await x.startProcess('change', chgId, { recordType: 'changeRequest', recordId: chgId, dataCenterId: plan.dataCenterId, title: `${plan.title} · ${w.name}`, variables: { planId: plan.id, waveId: w.id } });
      if (!inst) x.warn(`The change process for ${chgId} could not be started; start it from Changes`);
      const mwId = x.seq('maintenanceWindows', 'MW');
      x.create('maintenanceWindows', { id: mwId, mwId, title: `${plan.title} · ${w.name}`, status: 'Scheduled', dataCenterId: plan.dataCenterId, changeRequestId: chgId, scheduledStart: w.windowStart, scheduledEnd: w.windowEnd, affectedDeviceIds: w.deviceIds, impact: imp.services.length ? `${noun(imp.services.length, 'service')} at risk (${imp.critical} critical) for ${imp.customers.map(c => c.customer.name).slice(0, 5).join(', ')}${imp.customers.length > 5 ? '…' : ''}; ${w.method ?? ''}` : `No customer service affected; ${w.method ?? ''}`, owner: plan.ownerName, plannerPlanId: plan.id, plannerWaveId: w.id });
      const atpId = x.seq('atps', 'ATP');
      x.create('atps', { id: atpId, atpId, projectId: projectId ?? '', name: `${plan.scope === 'server-refresh' ? 'IT burn-in' : plan.scope === 'network-refresh' ? 'Switch acceptance' : 'Rack power and re-rack acceptance'} · ${w.name}`, system: plan.scope === 'server-refresh' ? 'Integrated' : plan.scope === 'network-refresh' ? 'Network' : 'Power', level: 'L3 Pre-functional', status: 'Draft', plannerPlanId: plan.id, plannerWaveId: w.id });
      const steps = plan.scope === 'server-refresh' ? [['Firmware and BIOS at the baseline', 'Compare with the golden baseline', 'All units on baseline'], ['24 h burn-in', 'CPU, memory and disk stress', 'No errors, no thermal alarms'], ['BMC and addressing', 'BMC reachable on the kept OOB address; primary IP answers', 'Both addresses answer'], ['Monitoring onboarding', 'Device polled and alarms clean', 'Green in monitoring'], ['Workload validation', 'Service owners confirm', 'Owners sign off']]
        : plan.scope === 'network-refresh' ? [['Configuration loaded', 'Diff against the translated config', 'No unexpected lines'], ['Links up', 'Every patched port up at the planned speed', 'All up, no errors'], ['Routing and redundancy', 'BGP/EVPN peers up; fail the partner side', 'Traffic holds'], ['Monitoring', 'Polled, syslog and telemetry flowing', 'Green in monitoring'], ['Soak', `${a.soakDays} days without errors before side B`, 'No incidents']]
        : [['Power strips', 'Each outlet energised; A and B feeds metered', 'Readings match the outlet plan'], ['Devices back', 'Every device powered on dual feeds', 'No single-fed device'], ['Links up', 'Every patched port up', 'All up'], ['Labels and records', 'Rack elevation and cable labels updated', 'Records match the rack']];
      steps.forEach(([d, m, e], i) => { const sid = x.id('ATPS'); x.create('atpSteps', { id: sid, atpsId: sid, atpId, stepNo: i + 1, description: d, method: m, expectedResult: e, result: 'Pending' }); });
      if (plan.scope === 'network-refresh') {
        for (const id of w.deviceIds) {
          const d = byId(data, 'devices', id); const backup = data.configBackups.filter(b => b.deviceId === id).sort((p, q) => q.capturedAt.localeCompare(p.capturedAt))[0];
          const u = a.units.find(n => n.oldIds.includes(id));
          const cid = x.seq('configChanges', 'CFGCHG');
          x.create('configChanges', { id: cid, cfgchgId: cid, deviceId: id, changeRequestId: chgId, status: 'Planned', driftDetected: false, rollbackConfigId: backup?.id, plannerPlanId: plan.id, diff: `Carry over ${backup ? `configuration ${backup.version} captured ${backup.capturedAt.slice(0, 10)}` : 'the running configuration (no backup on record: capture one first)'} to ${u?.model ?? 'the new model'}, translated to its syntax; keep hostname ${d?.hostname ?? d?.name}, management ${d?.primaryIp4 ?? '—'}, out-of-band ${d?.oobIp ?? '—'}` });
          x.artefacts.configChangeIds = [...(x.artefacts.configChangeIds ?? []), cid];
        }
      }
      x.artefacts.changeRequestIds = [...(x.artefacts.changeRequestIds ?? []), chgId];
      x.artefacts.maintenanceWindowIds = [...(x.artefacts.maintenanceWindowIds ?? []), mwId];
      x.artefacts.atpIds = [...(x.artefacts.atpIds ?? []), atpId];
      out.push({ ...w, changeRequestId: chgId, maintenanceWindowId: mwId, atpId, status: 'Scheduled' });
    }
    x.planPatch.waves = [...out, ...(plan.waves ?? []).filter(w => w.status === 'Cancelled')];
  });
}

export { PARALLEL };
export const replaceRuleChecks = ['rpl-selection-free', 'rpl-mapping', 'rpl-rack-power', 'rpl-rack-space', 'rpl-critical-parallel', 'wave-ha-split', 'wave-fits-window', 'wave-clash', 'wave-coverage', 'wave-ab-soak', 'wave-acceptance', 'rpl-nic-fit', 'net-port-fit', 'net-far-end', 'net-airflow', 'net-config-backup', 'rack-outlets', 'rack-consent', 'rack-xconnect'] as const;
