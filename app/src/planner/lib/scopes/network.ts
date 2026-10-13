/**
 * Scope model · network uplift: DCI / WAN capacity between two sites (A and Z), or a fabric uplift
 * inside one site (lib/networkModel.ts holds the logic).
 *
 * The bill comes from the link type of each path (carrier services monthly plus install, optics per
 * end from the router vendor, line cards only where no port is free, cross-connects at colocation
 * ends). CapEx is the one-off part of the bill; OpEx is the change in monthly charges (new paths and
 * cross-connects less the circuits ceased). The schedule is always dated, whatever the kW. Execution
 * books a 'DCI / WAN Uplift' project, planned circuits with both terminations, a cut-over change
 * and window, the cease of the old circuits and an acceptance ATP per path.
 */
import type * as T from '../../p2b/types';
import type { Evaluation, Sizing } from '../engine';
import type { BodSection, Initiation, IpPlan } from '../outputs';
import { byId } from '../plannerData';
import { nextFreeWindow } from '../impact';
import { DCI_ATP_STEPS, DISPOSITION_OF, NETWORK_KINDS, analyseNetwork, dciIpPlan, networkEstimate, networkKindOf, networkSchedule, type NetworkAnalysis } from '../networkModel';
import type { CheckResult, CloseoutCheck, ExecCtx, ReservationRequest, ScopeBlocker, ScopeCtx, ScopeModel } from './types';
import { clockMs } from '../../compat/clock';

const gb = (g: number) => (g >= 1000 ? `${Math.round(g / 100) / 10} Tbps` : `${Math.round(g * 10) / 10} Gbps`);
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const nowIso = () => new Date(clockMs()).toISOString();

const CACHE = new WeakMap<ScopeCtx, NetworkAnalysis>();
function analysis(c: ScopeCtx): NetworkAnalysis { let a = CACHE.get(c); if (!a) { a = analyseNetwork(c); CACHE.set(c, a); } return a; }
/** The network analysis of an evaluated plan (UI and outputs read it from here). */
export const networkOf = (ev?: Evaluation): NetworkAnalysis | undefined => (ev?.scope?.network as NetworkAnalysis | undefined);

/* ------------------------------------------------------------------ checks */
function check(c: ScopeCtx, rule: T.PlannerRuleDef, ev: Evaluation): CheckResult | undefined {
  const mine = rule.check.startsWith('dci-') || rule.check.startsWith('fabric-') || ['lead-times', 'commissioning-level'].includes(rule.check);
  if (!mine) return undefined;
  if (rule.check === 'lead-times') {
    const eq = ev.schedule.filter(s => s.kind === 'equipment'); const late = eq.filter(s => s.late);
    if (!eq.length) return { status: 'n/a', detail: 'Not checked: nothing to order yet (no paths)' };
    return { status: late.length ? 'fail' : 'pass', detail: late.length ? `${late.length} order(s) cannot land before the cut-over: ${late.map(l => l.item).join('; ')}` : `${eq.length} order line(s) fit the cut-over on ${day(networkOf(ev)?.cutover)} (carrier lead times at the benchmark high plus buffer)` };
  }
  if (!c.data?.ready) return { status: 'n/a', detail: 'Not checked: platform data still loading' };
  const an = analysis(c); const kind = networkKindOf(c.plan);
  if (rule.check.startsWith('fabric-') && kind !== 'fabric') return { status: 'n/a', detail: 'DCI plan: fabric rule does not apply' };
  if (rule.check.startsWith('dci-') && kind !== 'dci') return { status: 'n/a', detail: 'Fabric uplift: DCI rule does not apply' };
  if (rule.check === 'commissioning-level') {
    if (kind === 'fabric') return { status: an.bill.length ? 'pass' : 'n/a', detail: an.bill.length ? 'Fabric acceptance (throughput, failover, ECMP) planned before the cut-over' : 'Nothing to commission' };
    return { status: an.paths.length ? 'pass' : 'n/a', detail: an.paths.length ? `Acceptance per path planned: BER 24 h, throughput, latency, optical budget, encryption, failover (${an.paths.length} path(s))` : 'Not checked: no paths' };
  }
  if (kind === 'fabric') {
    const f = an.fabric; if (!f) return { status: 'n/a', detail: `Not checked: ${an.reason ?? 'no site'}` };
    if (!f.leaves.length) return { status: 'n/a', detail: 'Not checked: no leaf switches recorded at the site' };
    if (rule.check === 'fabric-oversub') return { status: f.oversubAfter <= f.targetOversub ? 'pass' : 'fail', detail: `${f.leaves.length} leaves: ${f.downlinkGbps}G down over ${f.uplinksPerLeaf} × ${f.targetGbps}G up = ${f.oversubAfter}:1 after (${f.oversubNow}:1 today) against ${f.targetOversub}:1`, value: `${f.oversubAfter}:1` };
    if (rule.check === 'fabric-spine-ports') return { status: f.spinePortsAfter >= f.uplinkPortsNeeded ? 'pass' : 'fail', detail: `${f.spinePortsAfter} spine ports after the uplift for ${f.uplinkPortsNeeded} leaf uplinks` };
    return undefined;
  }
  if (!an.a.dc || !an.z.dc) return rule.check === 'dci-ends' ? { status: 'fail', detail: `${!an.a.dc ? 'A' : 'Z'} end not set` } : { status: 'n/a', detail: 'Not checked: both ends are needed' };
  const P = c.params; const paths = an.paths;
  switch (rule.check) {
    case 'dci-ends': {
      const noDev = paths.filter(x => !x.a.deviceId || !x.z.deviceId).map(x => x.path.name);
      return { status: noDev.length || !paths.length ? 'fail' : 'pass', detail: !paths.length ? `${an.a.dc.code} to ${an.z.dc.code}: no paths yet` : noDev.length ? `${noDev.join(', ')} without an end device at both ends` : `${an.a.dc.code} to ${an.z.dc.code}; every path has a device at both ends` };
    }
    case 'dci-survivability': {
      if (!paths.length) return { status: 'n/a', detail: 'Not checked: no paths' };
      const s = an.survivability!; return { status: s.ok ? 'pass' : 'fail', detail: s.detail, value: `${gb(s.remainingGbps)} / ${gb(s.protectedGbps)}` };
    }
    case 'dci-diversity': {
      if (paths.length < 2) return { status: paths.length ? 'fail' : 'n/a', detail: paths.length ? 'One path only: no carrier or route diversity' : 'Not checked: no paths' };
      const d = an.diversity!; return { status: d.ok ? 'pass' : d.waived ? 'warn' : 'fail', detail: d.detail };
    }
    case 'dci-latency': {
      if (!paths.length) return { status: 'n/a', detail: 'Not checked: no paths' };
      const budget = Number(P.latencyBudgetMs?.value ?? 100);
      const over = paths.filter(x => x.latencyMsRtt > budget);
      return { status: over.length ? 'fail' : 'pass', detail: `${paths.map(x => `${x.path.name} ${x.latencyMsRtt} ms (${x.path.latencyMs ? 'quoted' : 'estimated'})`).join(', ')} against ${budget} ms round trip`, value: `${Math.max(...paths.map(x => x.latencyMsRtt))} ms` };
    }
    case 'dci-ports': {
      if (!paths.length) return { status: 'n/a', detail: 'Not checked: no paths' };
      const bad = paths.flatMap(x => [x.a, x.z].filter(p => !p.ok).map(p => `${x.path.name}: ${p.detail}`));
      const cards = paths.flatMap(x => [x.a, x.z].filter(p => p.lineCard).map(p => p.device?.name ?? p.deviceId));
      return { status: bad.length ? 'fail' : 'pass', detail: bad.length ? bad.join('; ') : `Free ${[...new Set(paths.map(x => `${x.path.capacityGbps}G`))].join('/')} ports at both ends${cards.length ? `; line cards in the bill for ${[...new Set(cards)].join(', ')}` : ''}` };
    }
    case 'dci-optics-reach': {
      if (!paths.length) return { status: 'n/a', detail: 'Not checked: no paths' };
      const bad = paths.filter(x => !x.reachOk);
      return { status: bad.length ? 'fail' : 'pass', detail: paths.map(x => `${x.path.name}: ${x.reachNote}`).join('; ') };
    }
    case 'dci-encryption': {
      if (!paths.length) return { status: 'n/a', detail: 'Not checked: no paths' };
      if (P.encryptionRequired?.value === false) return { status: 'n/a', detail: 'Encryption not required by the plan (declared)' };
      const bad = paths.filter(x => !x.encryptionOk).map(x => x.path.name);
      return { status: bad.length ? 'fail' : 'pass', detail: bad.length ? `${bad.join(', ')} unencrypted over third-party infrastructure` : paths.map(x => `${x.path.name}: ${x.path.encryption}`).join(', ') };
    }
    case 'dci-demand': {
      const d = an.demand!; const cap = an.capacityGbps + an.keptGbps;
      if (!paths.length) return { status: 'n/a', detail: 'Not checked: no paths' };
      return { status: cap >= d.designGbps ? 'pass' : 'fail', detail: `${gb(cap)} (${gb(an.capacityGbps)} new${an.keptGbps ? ` + ${gb(an.keptGbps)} kept` : ''}) against ${gb(d.designGbps)} ${d.overridden ? `entered (derived ${gb(d.derivedAtN)} at year ${d.years}${d.reason ? `; reason: ${d.reason}` : '; no reason given'})` : `needed at year ${d.years}`}`, value: `${Math.round((cap / Math.max(1, d.designGbps)) * 100)}%` };
    }
    case 'dci-etc': {
      const ceased = an.circuits.filter(x => x.action === 'cease' || x.action === 'upgrade');
      if (!ceased.length) return { status: 'n/a', detail: an.circuits.length ? 'No circuit ceased' : 'No existing circuits between the sites' };
      const charged = ceased.filter(x => x.etcUsd > 0);
      return { status: charged.length ? 'warn' : 'pass', detail: ceased.map(x => `${x.circuit.cid}: ${x.etcNote}`).join('; '), value: `${charged.reduce((s, x) => s + x.etcUsd, 0).toLocaleString('en-US')} USD` };
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ sizing, outputs */
function size(c: ScopeCtx, generic: Sizing): Sizing {
  const an = analysis(c);
  const carriers = new Set(an.paths.map(x => x.provider?.id ?? x.path.providerName)).size;
  const f = an.fabric;
  return {
    ...generic, itKw: 0, racks: 0, halls: 0, buildings: 0, whiteSpaceM2: 0, grossAreaM2: 0, rackClasses: [], plant: [],
    network: f ? { leaves: f.leaves.length, spines: f.spines.length + f.spinesNeeded - f.spinesToReplace.length, cores: 0, uplinks: f.uplinkPortsNeeded, accessPorts: 0, uplinkGbps: f.targetGbps, carriers: 0, dciGbps: 0 } : { leaves: 0, spines: 0, cores: 0, uplinks: 0, accessPorts: 0, uplinkGbps: an.paths[0]?.path.capacityGbps ?? 0, carriers, dciGbps: an.capacityGbps },
    staffing: { fte: 0, shifts: 0, perMw: 0, source: generic.staffing.source }, spares: { lines: 0, valueUsd: 0 },
    cooling: { ...generic.cooling, capacityKw: 0, units: 0, unitKw: 0, liquidRequired: false },
  };
}
function ipPlan(ev: Evaluation, generic: IpPlan): IpPlan {
  const an = networkOf(ev);
  if (!an?.ready) return { ...generic, items: [], vlans: [], asns: [], aggregate: '—', usedAddresses: 0, totalAddresses: 0 };
  if (an.kind === 'fabric') return { aggregate: '—', items: [], vlans: [], asns: [], usedAddresses: 0, totalAddresses: 0 };
  return dciIpPlan(an.ip!, an.a, an.z, an.paths, ev.params);
}
function bod(ev: Evaluation, sections: BodSection[]): BodSection[] {
  const an = networkOf(ev); const plan = ev.ctx.plan; if (!an) return sections;
  const keep = (id: string) => sections.find(s => s.id === id);
  const e = ev.estimate;
  if (an.kind === 'fabric') {
    const f = an.fabric;
    const fab: BodSection = { id: 'fabric', title: 'Fabric uplift', rows: f ? [{ label: 'Today', value: `${f.leaves.length} leaves, ${f.spines.length} spines, ${f.currentUplinks} × ${f.currentUplinkGbps}G uplinks per leaf, ${f.oversubNow}:1` }, { label: 'Target', value: `${f.uplinksPerLeaf} × ${f.targetGbps}G per leaf, ${f.oversubAfter}:1 (target ${f.targetOversub}:1)` }, { label: 'Replaced', value: `${f.leavesToReplace.length} leaves, ${f.spinesToReplace.length} spines; ${f.spinesNeeded} new spines` }] : [] };
    return [keep('purpose'), fab, keep('schedule'), keep('cost'), keep('risks'), keep('standards')].filter((s): s is BodSection => !!s);
  }
  const ends: BodSection = { id: 'ends', title: '2. Ends', rows: [an.a, an.z].map(x => ({ label: `${x.side} end`, value: x.dc ? `${x.dc.code} · ${x.dc.name}${x.colo ? ' (colocation: cross-connects ordered from the operator)' : ''}; routers ${x.routers.slice(0, 2).map(r => r.name).join(', ') || 'none recorded'}; transit pool ${x.transitPools[0]?.cidr ?? 'none'}` : 'not set' })) };
  const d = an.demand;
  const demand: BodSection = { id: 'demand', title: '3. Demand', text: d?.basis, rows: d ? [{ label: `Needed at year ${d.years}`, value: gb(d.derivedAtN), source: 'Estate actual' }, { label: 'Design figure', value: `${gb(d.designGbps)}${d.overridden ? ` (entered; ${d.reason ? `reason: ${d.reason}` : 'no reason given'})` : ''}` }, { label: 'Protection', value: an.survivability?.detail ?? '—' }] : [] };
  const existing: BodSection = { id: 'existing', title: '4. Existing circuits', rows: an.circuits.length ? an.circuits.map(x => ({ label: `${x.circuit.cid} · ${x.provider?.name ?? ''}`, value: `${x.capacityGbps}G, ${x.monthlyUsd.toLocaleString('en-US')} USD a month, contract to ${day(x.contractEnd)}${x.farEndKnown ? '' : ' (far end not recorded)'}: ${x.action}${x.ceaseDate ? ` from ${day(x.ceaseDate)}` : ''}; ${x.etcNote}` })) : [{ label: 'Existing', value: 'No circuits between the two sites' }] };
  const paths: BodSection = { id: 'paths', title: '5. Paths', rows: an.paths.map(x => ({ label: x.path.name, value: `${x.provider?.name ?? x.path.providerName} ${x.path.linkType}, ${x.path.capacityGbps}G, ${x.distanceKm} km (${x.distanceSource}), ${x.latencyMsRtt} ms RTT; route ${x.path.routeId ?? '—'}; shared risk ${x.path.sharedRiskGroups.join(', ') || 'none recorded'}; ${x.a.detail} / ${x.z.detail}; ${x.optic.model}; ${x.path.encryption ?? 'no'} encryption` })) };
  const ip: BodSection = { id: 'ip', title: '6. Addressing and routing', rows: (an.ip?.items ?? []).map(i => ({ label: `${an.paths.find(x => x.path.id === i.pathId)?.path.name ?? i.pathId}${i.end === 'link' ? '' : ` ${i.end} end`}`, value: `${i.cidr ?? 'not allocated'} from ${i.poolCidr ?? '—'}; ${i.bgp.kind}` })).concat((an.ip?.warnings ?? []).map(w => ({ label: 'Note', value: w }))) };
  const cost: BodSection = { id: 'cost', title: '7. Cost', rows: [{ label: 'One-off', value: `${Math.round(e.capexTotal).toLocaleString('en-US')} USD (bill one-off lines, contingency${an.etcUsd ? ', early termination' : ''})` }, { label: 'Monthly change', value: `${Math.round(e.opexMonthly).toLocaleString('en-US')} USD (${an.newMonthlyUsd.toLocaleString('en-US')} new less ${an.ceasedMonthlyUsd.toLocaleString('en-US')} ceased)` }] };
  const sched: BodSection = { id: 'schedule', title: '8. Cut-over and cease', rows: [{ label: 'Cut-over', value: day(an.cutover) }, { label: 'Old circuits ceased', value: an.ceaseBy ? day(an.ceaseBy) : 'none' }] };
  return [keep('purpose') ? { ...keep('purpose')!, rows: [{ label: 'Plan type', value: 'DCI / WAN uplift' }, { label: 'Needed by', value: day(plan.targetGoLive) }] } : undefined, ends, demand, existing, paths, ip, cost, sched, keep('risks'), keep('standards')].filter((s): s is BodSection => !!s).map((s, i) => ({ ...s, title: s.title.replace(/^\d+\.\s*/, `${i + 1}. `) }));
}
function initiation(ev: Evaluation, _t: T.PlannerTemplate | undefined, _bom: unknown, generic: Initiation): Initiation {
  const an = networkOf(ev); const plan = ev.ctx.plan; const fabric = an?.kind === 'fabric';
  const orders = ev.schedule.filter(s => s.kind === 'equipment').map(s => ({ item: s.item, category: 'Network' as const, value: (an?.bill ?? []).filter(l => !l.monthly && l.leadItem && s.item.startsWith(l.leadItem)).reduce((a, l) => a + Math.round(l.qty) * l.unitCost, 0), orderBy: s.orderBy, needBy: s.needBy, late: s.late }));
  return {
    ...generic, vehicle: 'project', blueprintKey: undefined, blueprintName: `${fabric ? 'Network Refresh' : 'DCI / WAN Uplift'} (delivery template)`,
    projects: [{ name: plan.title, start: nowIso(), end: an?.ceaseBy ?? an?.cutover ?? plan.targetGoLive, budget: ev.estimate.capexTotal, gate: fabric ? 'Design approved' : 'Carrier orders placed', longLead: true, template: fabric ? 'Network Refresh' : 'DCI / WAN Uplift' }],
    orders,
    designDocs: fabric ? [{ name: 'Fabric design and cut-over plan', type: 'Detailed Design', discipline: 'Network' }, { name: 'Network and IP plan', type: 'Detailed Design', discipline: 'Network' }]
      : [{ name: 'Path and diversity design (routes, shared-risk groups, KMZ)', type: 'Concept Design', discipline: 'Network' }, { name: 'IP and BGP plan for the interconnect', type: 'Detailed Design', discipline: 'Network' }, { name: 'Cut-over and cease runbook', type: 'Detailed Design', discipline: 'Network' }, { name: 'Acceptance test plan per path', type: 'Detailed Design', discipline: 'Network' }],
    workOrder: { process: 'P10 Work order', key: 'work-order' },
    change: { title: `${plan.title} · cut-over`, type: 'NetworkMigration' },
  };
}

/* ------------------------------------------------------------------ wizard */
function siteMissing(draft: T.PlannerPlan): string | undefined | null {
  if (networkKindOf(draft) === 'fabric') return !draft.dataCenterId ? 'Pick the site whose fabric is uplifted' : undefined;
  return !draft.dataCenterId || !draft.peerDataCenterId ? 'Pick both ends of the link (A and Z)' : draft.dataCenterId === draft.peerDataCenterId ? 'A and Z must be different sites' : undefined;
}
function blockers(draft: T.PlannerPlan, ev?: Evaluation): ScopeBlocker[] {
  const out: ScopeBlocker[] = []; const an = networkOf(ev);
  if (!draft.targetGoLive || !Number.isFinite(new Date(draft.targetGoLive).getTime())) out.push({ level: 'bad', text: 'No cut-over date', step: 'requirements' });
  if (networkKindOf(draft) === 'fabric') { if (an?.fabric && !an.fabric.leaves.length) out.push({ level: 'bad', text: 'No leaf switches recorded at the site', step: 'dim:network' }); return out; }
  if (!(draft.paths ?? []).length) out.push({ level: 'bad', text: 'No paths: add the carrier or fibre paths between the two sites', step: 'dim:network' });
  for (const x of an?.paths ?? []) for (const pr of x.problems) out.push({ level: 'bad', text: `${x.path.name}: ${pr}`, step: 'dim:network' });
  if (an?.demand?.overridden && !an.demand.reason) out.push({ level: 'warn', text: `Capacity entered (${gb(an.demand.declaredGbps ?? 0)}) differs from the derived need (${gb(an.demand.derivedAtN)}) with no reason`, step: 'dim:network' });
  const undecided = (an?.circuits ?? []).filter(x => x.action === 'undecided');
  if (undecided.length) out.push({ level: 'warn', text: `${undecided.length} existing circuit(s) between the sites with no decision (keep, upgrade or cease)`, step: 'dim:network' });
  for (const w of an?.ip?.warnings ?? []) if (/no transit pool|no free/.test(w)) out.push({ level: 'bad', text: w, step: 'dim:network' });
  return out;
}
function seedDraft(draft: T.PlannerPlan): Partial<T.PlannerPlan> {
  // A network plan always has a dated phase: the cut-over, whatever the kW.
  const phases = draft.phases.length ? draft.phases : [{ id: 'PH-1', name: 'Cut-over', goLive: draft.targetGoLive, itKw: 0, racks: 0, halls: 0, status: 'Planned' as const }];
  return { phases, paths: draft.paths ?? [], params: { ...draft.params, networkKind: draft.params.networkKind ?? NETWORK_KINDS[0] } };
}

/* ------------------------------------------------------------------ governance and execution */
function reservations(plan: T.PlannerPlan, ev: Evaluation): ReservationRequest[] {
  const an = networkOf(ev); if (!an || an.kind !== 'dci') return [];
  const out: ReservationRequest[] = [];
  for (const i of an.ip?.items ?? []) if (i.cidr && i.poolId) out.push({ resourceType: 'Subnet', resourceId: i.poolId, quantity: 2, unit: 'addresses', label: `${i.cidr} for ${plan.plnId} ${an.paths.find(x => x.path.id === i.pathId)?.path.name ?? ''}`, dataCenterId: i.dataCenterId });
  for (const x of an.paths) for (const [end, pc] of [[an.a, x.a], [an.z, x.z]] as const) if (pc.deviceId && !pc.lineCard) out.push({ resourceType: 'Asset', resourceId: pc.deviceId, quantity: 1, unit: 'ports', label: `${pc.device?.name ?? pc.deviceId} ${pc.port ?? ''} for ${plan.plnId} ${x.path.name}`, dataCenterId: end.dc?.id });
  return out;
}
async function executeVehicle(x: ExecCtx): Promise<void> {
  const { plan, ev } = x; const an = networkOf(ev); const fabric = an?.kind === 'fabric';
  const end = an?.ceaseBy ?? an?.cutover ?? plan.targetGoLive;
  const budget = plan.baseline?.capexTotal ?? ev.estimate.capexTotal;
  const programId = await x.createProgram({ name: plan.title, type: 'Network Modernization', objective: plan.intent || plan.title, ownerName: plan.ownerName, budget, status: 'Active', startDate: nowIso(), endDate: end });
  x.update('programs', programId, { plannerPlanId: plan.id }); x.artefacts.programId = programId;
  const detail: Record<string, unknown> = fabric
    ? { planId: plan.id, plnId: plan.plnId, layer: 'Leaf', leaves: an?.fabric?.leaves.length, targetGbps: an?.fabric?.targetGbps }
    : { planId: plan.id, plnId: plan.plnId, capacityGbps: an?.capacityGbps, paths: an?.paths.length, aEnd: an?.a.dc?.code, zEnd: an?.z.dc?.code, cutover: an?.cutover, ceaseBy: an?.ceaseBy };
  const pid = await x.createProject({ name: plan.title, programId, template: fabric ? 'Network Refresh' : 'DCI / WAN Uplift', managerName: plan.ownerName, dataCenterId: plan.dataCenterId, plannedStart: nowIso(), plannedEnd: end, budget, detail });
  if (!pid) throw new Error('The delivery project could not be created');
  x.update('projects', pid, { plannerPlanId: plan.id }); x.artefacts.projectIds = [...(x.artefacts.projectIds ?? []), pid];
  const inst = await x.startProcess('work-order', plan.plnId, { recordType: 'project', recordId: pid, dataCenterId: plan.dataCenterId, title: plan.title, variables: { planId: plan.id, scope: plan.scope, capex: budget } });
  if (!inst) x.warn('The P10 work order could not be started; start it from Work orders');
  x.artefacts.processInstanceId = inst?.id;
}
async function execute(x: ExecCtx): Promise<void> {
  const { plan, ev, data } = x; const an = networkOf(ev);
  if (!an?.ready) throw new Error(`Network analysis unavailable: ${an?.reason ?? 'no ends'}`);
  const projectId = x.artefacts.projectIds?.[0];
  const devices = an.kind === 'dci' ? an.paths.flatMap(p => [p.a.deviceId, p.z.deviceId]).filter((d): d is string => !!d) : (an.fabric?.leaves ?? []).map(d => d.id);
  if (an.kind === 'dci') {
    // 1. Planned circuits with both terminations (device, port and cross-connect reference).
    const paths = [...(plan.paths ?? [])];
    for (const r of an.paths) {
      const path = r.path; const i = paths.findIndex(p => p.id === path.id);
      if (path.circuitId || data.circuits.some(c => c.plannerPlanId === plan.id && c.description?.includes(`[${path.id}]`))) continue;
      const replaced = byId(data, 'circuits', path.replacesCircuitId);
      const typeId = replaced?.circuitTypeId ?? data.circuits.find(c => c.purpose === 'DC Interconnect')?.circuitTypeId ?? '';
      const ckt = x.seq('circuits', 'CKT');
      x.create('circuits', { id: ckt, cktId: ckt, cid: `${(r.provider?.name ?? path.providerName ?? 'NEW').slice(0, 3).toUpperCase()}-ORDER-${plan.plnId.replace('PLN-', '')}-${path.id}`, providerId: r.provider?.id ?? path.providerId ?? '', circuitTypeId: typeId, status: 'Planned', commitRateMbps: path.capacityGbps * 1000, purpose: 'DC Interconnect', description: `${path.linkType} ${path.capacityGbps}G ${an.a.dc?.code}–${an.z.dc?.code}, route ${path.routeId ?? '—'} [${path.id}] from ${plan.plnId}`, monthlyCostUsd: path.monthlyUsd, contractStart: an.cutover, contractEnd: new Date(new Date(an.cutover).getTime() + (path.termMonths || 36) * 30.4 * 864e5).toISOString(), orderedAt: nowIso(), diversityGroup: path.diversityGroup ?? `${an.a.dc?.code}·${an.z.dc?.code}·DCI`, plannerPlanId: plan.id });
      const terms: string[] = [];
      for (const [end, pc] of [[an.a, r.a], [an.z, r.z]] as const) {
        const ct = x.seq('circuitTerminations', 'CTERM');
        const ifc = data.interfaces.find(f => f.deviceId === pc.deviceId && f.name === pc.port);
        x.create('circuitTerminations', { id: ct, ctermId: ct, circuitId: ckt, side: end.side, dataCenterId: end.dc?.id, deviceId: pc.deviceId, interfaceId: ifc?.id, portSpeedMbps: path.capacityGbps * 1000, xconnectId: end.colo ? `XC-PENDING-${path.id}-${end.side}` : undefined, description: `${pc.device?.name ?? ''} ${pc.port ?? '(line card)'}${end.colo ? '; cross-connect to order with the LOA/CFA' : '; internal patch to the meet-me room'}`, plannerPlanId: plan.id });
        terms.push(ct);
      }
      x.artefacts.circuitIds = [...(x.artefacts.circuitIds ?? []), ckt];
      x.artefacts.terminationIds = [...(x.artefacts.terminationIds ?? []), ...terms];
      if (i >= 0) paths[i] = { ...paths[i], circuitId: ckt };
    }
    x.planPatch.paths = paths;
    // 2. Cease of the old circuits: dated, with the notice in the record; status changes when the carrier confirms.
    const dispositions = [...(plan.dispositions ?? [])];
    for (const c of an.circuits.filter(k => k.action === 'cease' || k.action === 'upgrade')) {
      if (!x.artefacts.ceasedCircuitIds?.includes(c.circuit.id)) {
        x.update('circuits', c.circuit.id, { ceaseDate: c.ceaseDate, notes: `Cease scheduled ${c.ceaseDate?.slice(0, 10)} by ${plan.plnId} (${c.action === 'upgrade' ? 'upgraded' : 'ceased'}); ${c.etcNote}` });
        x.artefacts.ceasedCircuitIds = [...(x.artefacts.ceasedCircuitIds ?? []), c.circuit.id];
      }
      const k = dispositions.findIndex(d => d.recordType === 'circuit' && d.recordId === c.circuit.id);
      const row: T.PlannerDispositionRow = { recordType: 'circuit', recordId: c.circuit.id, label: c.circuit.cid, disposition: DISPOSITION_OF[c.action as 'cease' | 'upgrade'], date: c.ceaseDate, costUsd: c.etcUsd, notes: c.etcNote };
      if (k >= 0) dispositions[k] = { ...dispositions[k], ...row }; else dispositions.push(row);
    }
    x.planPatch.dispositions = dispositions;
    // 3. Point-to-point addresses: the generic IP step records every prefix at the A end; move the Z-end ones to their site and pool.
    const ip = dciIpPlan(an.ip!, an.a, an.z, an.paths, ev.params);
    const allocated = an.ip!.items.filter(i => i.cidr);
    allocated.forEach((it, k) => { const sid = x.artefacts.subnetIds[k]; if (sid && ip.items[k]?.cidr === it.cidr) x.update('subnets', sid, { dataCenterId: it.dataCenterId, parentId: it.poolId, purpose: 'Transit', plannerPlanId: plan.id }); });
    x.planPatch.ipAllocation = { at: nowIso(), items: allocated.map(i => ({ name: `${an.paths.find(p => p.path.id === i.pathId)?.path.name ?? i.pathId} ${i.end}`, purpose: 'Transit', cidr: i.cidr!, parentSubnetId: i.poolId, dataCenterId: i.dataCenterId })), warnings: an.ip!.warnings };
  }
  // 4. Cut-over change and its window, after the acceptance tests.
  if (!data.changeRequests.some(c => c.plannerPlanId === plan.id && c.type === 'NetworkMigration') && !(x.artefacts.changeRequestIds ?? []).length) {
    const hours = Number(ev.params.cutoverWindowHours?.value ?? 4);
    const win = nextFreeWindow(data, { dataCenterId: plan.dataCenterId, deviceIds: devices, hours, after: new Date(new Date(an.cutover).getTime() - 2 * 864e5).toISOString(), excludePlanId: plan.id });
    const chg = x.seq('changeRequests', 'CHG');
    x.create('changeRequests', { id: chg, chgId: chg, title: `${plan.title} · cut-over`, type: 'NetworkMigration', description: an.kind === 'dci' ? `Move traffic between ${an.a.dc?.code} and ${an.z.dc?.code} onto ${an.paths.map(p => p.path.name).join(', ')}; BGP preference change, then drain the old circuits. Rollback: restore the old BGP preferences.` : `Cut the fabric over to ${an.fabric?.targetGbps}G uplinks leaf by leaf.`, risk: 'Medium', status: 'Submitted', priority: 'High', affectedResourceType: 'Asset', affectedResourceIds: devices, dataCenterId: plan.dataCenterId, requestedBy: x.actor, requestedById: 'me', scheduledStart: win.start, scheduledEnd: win.end, policyViolations: [], rollbackPlan: 'Restore the previous routing preferences; old circuits stay in service until the cease date', projectId, plannerPlanId: plan.id });
    const mw = x.seq('maintenanceWindows', 'MW');
    x.create('maintenanceWindows', { id: mw, mwId: mw, title: `${plan.plnId} cut-over`, status: 'Scheduled', dataCenterId: plan.dataCenterId, changeRequestId: chg, scheduledStart: win.start, scheduledEnd: win.end, affectedDeviceIds: devices, impact: an.kind === 'dci' ? 'Traffic between the sites moves to the new paths; brief re-convergence' : 'Leaf uplinks move one at a time; servers stay dual-homed', owner: plan.ownerName, plannerPlanId: plan.id });
    x.artefacts.changeRequestIds = [...(x.artefacts.changeRequestIds ?? []), chg]; x.artefacts.maintenanceWindowIds = [...(x.artefacts.maintenanceWindowIds ?? []), mw];
    const inst = await x.startProcess('change', chg, { recordType: 'changeRequest', recordId: chg, dataCenterId: plan.dataCenterId, title: `${plan.title} · cut-over`, variables: { planId: plan.id } });
    if (!inst) x.warn(`The change process for ${chg} could not be started; start it from Changes`);
  }
  // 5. Acceptance tests per path (or for the fabric).
  if (projectId) {
    const have = new Set(data.atps.filter(a => a.plannerPlanId === plan.id).map(a => a.name));
    const budget = Number(ev.params.latencyBudgetMs?.value ?? 100);
    const tests = an.kind === 'dci' ? an.paths.map(p => ({ name: `Acceptance · ${p.path.name} (${p.provider?.name ?? p.path.providerName})`, steps: DCI_ATP_STEPS(Math.min(budget, p.path.latencyMs ?? p.latencyMsRtt)) })) : [{ name: 'Fabric acceptance', steps: [{ description: 'Line-rate throughput leaf to spine', method: 'Traffic generator per leaf', expected: 'No loss at line rate' }, { description: 'ECMP spread', method: 'Flow test across all uplinks', expected: 'Even spread within 10%' }, { description: 'Uplink failover', method: 'Shut one uplink per leaf', expected: 'Traffic re-routes; no loss of sessions' }] }];
    for (const t of tests) {
      if (have.has(t.name)) continue;
      const id = x.seq('atps', 'ATP');
      x.create('atps', { id, atpId: id, projectId, name: t.name, system: 'Network', level: 'L4 Functional', status: 'Draft', plannerPlanId: plan.id, planPhaseId: plan.phases[0]?.id });
      t.steps.forEach((s, i) => { const sid = x.id('ATPS'); x.create('atpSteps', { id: sid, atpsId: sid, atpId: id, stepNo: i + 1, description: s.description, method: s.method, expectedResult: s.expected, result: 'Pending' }); });
      x.artefacts.atpIds = [...(x.artefacts.atpIds ?? []), id];
    }
  } else x.warn('No project: acceptance tests were not created');
}
function closeout(plan: T.PlannerPlan, data: Parameters<NonNullable<ScopeModel['closeout']>>[1]): CloseoutCheck[] {
  const atps = data.atps.filter(a => a.plannerPlanId === plan.id);
  const atpCheck: CloseoutCheck = { key: 'net-atps', label: 'Acceptance tests accepted', ok: atps.length > 0 && atps.every(a => a.status === 'Accepted'), detail: atps.length ? `${atps.filter(a => a.status === 'Accepted').length} of ${atps.length} accepted` : 'No acceptance tests linked' };
  if (networkKindOf(plan) === 'fabric') return [atpCheck];
  const mine = data.circuits.filter(c => c.plannerPlanId === plan.id);
  const old = (plan.artefacts?.ceasedCircuitIds ?? []).map(id => byId(data, 'circuits', id)).filter((c): c is T.Circuit => !!c);
  const oldTerms = data.circuitTerminations.filter(t => old.some(c => c.id === t.circuitId));
  return [
    { key: 'net-active', label: 'New circuits active', ok: mine.length > 0 && mine.every(c => c.status === 'Active'), detail: mine.length ? `${mine.filter(c => c.status === 'Active').length} of ${mine.length} active` : 'No circuits linked to the plan' },
    atpCheck,
    { key: 'net-ceased', label: 'Old circuits ceased', ok: old.every(c => c.status === 'Decommissioned'), detail: old.length ? `${old.filter(c => c.status === 'Decommissioned').length} of ${old.length} decommissioned` : 'Nothing to cease' },
    { key: 'net-optics', label: 'Old ports released and optics recovered', ok: old.every(c => c.status === 'Decommissioned') && oldTerms.every(t => !t.interfaceId), detail: oldTerms.length ? `${oldTerms.filter(t => !t.interfaceId).length} of ${oldTerms.length} old terminations released` : 'No old terminations' },
  ];
}

export const networkModel: ScopeModel = {
  family: 'network',
  size,
  ladder: () => [],
  estimate: (c, _s, generic) => { const an = analysis(c); return an.ready ? networkEstimate(an, c.params, generic) : { ...generic, capex: [], capexTotal: 0, opex: [], opexMonthly: 0, opexAnnual: 0, revenueAnnual: 0, paybackMonths: null, paybackBasis: `Not estimated: ${an.reason}`, basis: 'bottom-up', energyMwhYear: 0 }; },
  // Always dated from the cut-over date, with or without kW, ends or paths.
  schedule: c => networkSchedule(analysis(c), c.plan, c.params, c.benchmarks, c.data),
  analyse: c => ({ network: analysis(c) }),
  check,
  bom: (ev, add) => { for (const l of networkOf(ev)?.bill ?? []) add(l); return true; },
  ipPlan,
  bod,
  initiation,
  blockers,
  siteMissing,
  seedDraft,
  reservations,
  executeVehicle,
  execute,
  closeout,
};
