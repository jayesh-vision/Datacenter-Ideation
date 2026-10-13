/**
 * Execution for site builds — the records a delivery team expects when a new site, a campus
 * expansion, an edge rollout or a regional portfolio is approved.
 *
 *  - new data centre: the DataCenter (Planned) with its buildings, floors and halls per phase;
 *    expansion: a building (and halls) on the campus, under a new data centre record unless the
 *    plan names an existing one. Every later artefact (projects, subnets, VLANs, permits) carries
 *    those ids; they are listed in `artefacts.createdSite`.
 *  - programme: one project per initiation line (per phase, back-scheduled), dependencies wired,
 *    permits linked to the project they gate, ATPs on each phase's commissioning project.
 *  - edge: the same per wave, one work order per site, an "Edge SAT" per site, and the edge
 *    locations moved to in progress (new locations created).
 *  - portfolio: child plans (scope, site, kW, go-live, budget envelope), never a BOM or orders.
 * Each part is its own step, so a failed run resumes where it stopped.
 */
import type * as T from '../p2b/types';
import type { ExecCtx } from './scopes/types';
import { buildInitiation, buildIpPlan, type Initiation } from './outputs';
import { chosenCandidate, haversineKm } from './buildSite';
import { CHILD_SCOPE, portfolioModel, effectiveAllocation } from './buildPortfolio';
import { edgeRows, variantOf } from './buildEdge';
import { fmtKw, fmtUsd } from './engine';
import { clockMs } from '../compat/clock';

const r0 = (n: number) => Math.round(n);
const nowIso = () => new Date(clockMs()).toISOString();

/** A sub-step; when it fails, the enclosing step fails too so a resumed run retries it. */
export async function subStep(x: ExecCtx, key: string, fn: () => Promise<void> | void): Promise<void> {
  await x.step(key, fn);
  if (x.artefacts.steps?.[key] === 'failed') throw new Error(`Step "${key}" failed`);
}
export const initiationOf = (x: ExecCtx): Initiation => buildInitiation(x.plan, x.ev, x.template, x.bom);

/* ------------------------------------------------------------------ site records */
function nearestCampus(x: ExecCtx, at?: { latitude?: number; longitude?: number }): T.Campus | undefined {
  const camps = x.data.campuses.filter(c => !x.plan.regionId || c.regionId === x.plan.regionId);
  if (at?.latitude === undefined || at.longitude === undefined) return camps[0];
  return [...camps].sort((a, b) => haversineKm(a, at as { latitude: number; longitude: number }) - haversineKm(b, at as { latitude: number; longitude: number }))[0];
}
/** DataCenter, buildings, floors and halls (all Planned) for a new site or a campus expansion. */
export function createSiteRecords(x: ExecCtx): void {
  const plan = x.plan; const s = x.ev.sizing; const P = x.ev.params;
  const site: NonNullable<T.PlannerArtefacts['createdSite']> = x.artefacts.createdSite ?? { buildingIds: [], floorIds: [], hallIds: [] };
  const cand = chosenCandidate(plan, P);
  let dcId = plan.dataCenterId;
  if (!dcId) {
    const campus = x.data.campuses.find(c => c.id === plan.campusId) ?? nearestCampus(x, cand);
    if (!campus) throw new Error('A data centre belongs to a campus: pick the nearest campus on Requirements');
    dcId = x.seq('dataCenters', 'DC');
    const code = (plan.newSiteName ?? dcId).trim();
    x.create('dataCenters', { id: dcId, dcId, campusId: campus.id, name: plan.scope === 'expansion' ? `${campus.city} ${code}` : code, code, dcTypeKey: plan.dcTypeKey, tier: String(P['tier']?.value ?? 'Tier III'), status: 'Planned', designPowerKw: plan.designPowerKw, designCoolingKw: r0(plan.designPowerKw * 1.1), totalRacks: s.racks, latitude: cand?.latitude ?? campus.latitude, longitude: cand?.longitude ?? campus.longitude, plannerPlanId: plan.id, notes: `Created by plan ${plan.plnId} on approval` });
    site.dataCenterId = dcId;
    x.planPatch.dataCenterId = dcId; x.planPatch.campusId = plan.campusId ?? campus.id;
  }
  const phases = [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive));
  const hpf = Math.max(1, s.building.hallsPerFloor);
  const racksPerHall = Math.max(1, s.building.racksPerHall);
  const kgPerM2 = r0(Number(P['floorLoadingKgPerRack']?.value ?? 1200) / Math.max(1, Number(P['whiteSpaceM2PerRack']?.value ?? 2.6)));
  const addBuilding = (name: string, blocks: { phase: T.PlannerPhase; halls: number }[]) => {
    const total = blocks.reduce((a, b) => a + b.halls, 0); const floors = Math.max(1, Math.ceil(total / hpf));
    const bId = x.seq('buildings', 'BLD');
    x.create('buildings', { id: bId, bldId: bId, dataCenterId: dcId, name, floorCount: floors, grossAreaSqm: r0(floors * s.building.floorPlateM2), plannerPlanId: plan.id });
    site.buildingIds!.push(bId);
    const floorIds: string[] = [];
    for (let f = 1; f <= floors; f++) { const fId = x.seq('floors', 'FLR'); x.create('floors', { id: fId, flrId: fId, buildingId: bId, name: `${name} · Level ${f}`, level: f, usableAreaSqm: s.building.floorPlateM2, floorLoadingKgSqm: kgPerM2, hallCount: Math.min(hpf, total - (f - 1) * hpf), plannerPlanId: plan.id }); floorIds.push(fId); site.floorIds!.push(fId); }
    let n = 0;
    for (const b of blocks) for (let h = 0; h < b.halls; h++) {
      const hId = x.seq('halls', 'HALL');
      x.create('halls', { id: hId, hallId: hId, floorId: floorIds[Math.floor(n / hpf)] ?? floorIds[floorIds.length - 1], dataCenterId: dcId, name: `${name} · Hall ${n + 1}`, gridCols: 10, gridRows: Math.ceil(racksPerHall / 10), designPowerKw: r0(b.phase.itKw / Math.max(1, b.halls)), rackCount: 0, rackCapacity: racksPerHall, utilizationPct: 0, status: 'Planned', areaSqm: s.building.hallWhiteSpaceM2, plannerPlanId: plan.id, notes: `${plan.plnId} · ${b.phase.name}` });
      site.hallIds!.push(hId); n++;
    }
  };
  const hallsOf = (ph: T.PlannerPhase) => ph.halls || Math.max(1, Math.ceil(ph.itKw / Math.max(1, Number(P['hallDesignKw']?.value ?? 1500))));
  if (plan.scope === 'new-dc') {
    // One building per phase (phases are buildings on a multi-building campus).
    phases.forEach((ph, i) => addBuilding(/building\s+\w+/i.exec(ph.name)?.[0] ?? `Building ${String.fromCharCode(65 + i)}`, [{ phase: ph, halls: hallsOf(ph) }]));
  } else {
    addBuilding(plan.newSiteName?.trim() || 'New building', phases.map(ph => ({ phase: ph, halls: hallsOf(ph) })));
  }
  x.artefacts.createdSite = site;
}

/* ------------------------------------------------------------------ programme */
/** The programme and one project per initiation line, with dependencies, phase ids and the permit gates. */
export async function createProgramme(x: ExecCtx, init: Initiation, dataCenterId?: string): Promise<void> {
  const plan = x.plan;
  const projects = init.projects.filter(p => p.template);
  if (!projects.length) throw new Error(`No projects to create (blueprint ${init.blueprintKey ?? 'missing'})`);
  if (!x.artefacts.programId) {
    const start = projects.reduce((m, p) => (p.start < m ? p.start : m), projects[0].start);
    const end = projects.reduce((m, p) => (p.end > m ? p.end : m), projects[0].end);
    const programId = await x.createProgram({ name: plan.title, type: plan.scope === 'new-dc' ? 'Greenfield Build' : 'Capacity Expansion', objective: plan.intent || plan.title, ownerName: plan.ownerName, budget: plan.baseline?.capexTotal ?? init.budget, status: 'Active', startDate: start < nowIso() ? nowIso() : start, endDate: end });
    x.update('programs', programId, { plannerPlanId: plan.id, projectCount: projects.length });
    x.artefacts.programId = programId;
  }
  const map = { ...(x.artefacts.projectByUid ?? {}) };
  for (const [i, pj] of projects.entries()) {
    const uid = pj.uid ?? `${i}`;
    if (map[uid]) continue;
    const pid = await x.createProject({ name: pj.name, programId: x.artefacts.programId!, template: pj.template!, managerName: plan.ownerName, dataCenterId, plannedStart: pj.start, plannedEnd: pj.end, budget: pj.budget, detail: { planId: plan.id, planPhaseId: pj.planPhaseId, key: pj.key } });
    if (!pid) throw new Error(`Project "${pj.name}" could not be created`);
    map[uid] = pid; x.artefacts.projectByUid = { ...map }; x.artefacts.projectIds = [...(x.artefacts.projectIds ?? []), pid];
    x.update('projects', pid, { plannerPlanId: plan.id, planPhaseId: pj.planPhaseId, dependsOnProjectIds: (pj.dependsOn ?? []).map(u => map[u]).filter(Boolean), longLead: pj.longLead, phase: i, startGate: [pj.gate, ...(pj.gatedBy?.length ? [`permits: ${pj.gatedBy.join(', ')}`] : [])].join(' · ') });
  }
}
export async function startPlanWorkOrder(x: ExecCtx, init: Initiation, dataCenterId?: string): Promise<void> {
  if (x.artefacts.processInstanceId) return;
  const inst = await x.startProcess(init.workOrder.key, x.plan.plnId, { recordType: 'plannerPlan', recordId: x.plan.id, dataCenterId, title: x.plan.title, variables: { planId: x.plan.id, scope: x.plan.scope, designPowerKw: x.plan.designPowerKw, capex: init.budget } });
  if (!inst) x.warn(`Work order ${init.workOrder.process} could not be started; start it from Work orders`);
  x.artefacts.processInstanceId = inst?.id;
}

/* ------------------------------------------------------------------ links after the generic steps */
/** New site: its container goes into IPAM and every subnet and VLAN of the plan points at the site. */
export function linkIp(x: ExecCtx): void {
  const dcId = x.artefacts.createdSite?.dataCenterId ?? x.plan.dataCenterId;
  // A new site (or an edge rollout, whose sites are not data centres) gets its container written to IPAM now.
  const newSite = !x.plan.dataCenterId && (!!x.artefacts.createdSite?.dataCenterId || x.plan.scope === 'edge');
  let containerId: string | undefined; let blockId: string | undefined;
  if (newSite && x.artefacts.subnetIds.length) {
    const c = buildIpPlan(x.plan, x.ev).containers?.find(k => k.isNew);
    if (c) {
      const size = 2 ** (32 - Number(c.cidr.split('/')[1]));
      containerId = x.seq('subnets', 'SUBNET'); blockId = c.cidrBlockId;
      x.create('subnets', { id: containerId, subnetId: containerId, cidr: c.cidr, name: `${x.plan.newSiteName ?? x.plan.title} · ${x.plan.scope === 'edge' ? 'rollout' : 'site'} container`, status: 'Container', cidrBlockId: c.cidrBlockId, dataCenterId: dcId, gatewayIp: '', totalHosts: size - 2, usedHosts: 0, utilizationPct: 0, state: 'Reserved', purpose: 'Management', plannerPlanId: x.plan.id });
    }
  }
  for (const id of x.artefacts.subnetIds) x.update('subnets', id, { ...(dcId ? { dataCenterId: dcId } : {}), ...(containerId ? { parentId: containerId, cidrBlockId: blockId } : {}) });
  if (dcId) for (const id of x.artefacts.vlanIds) x.update('vlans', id, { dataCenterId: dcId });
  if (containerId) x.artefacts.subnetIds = [containerId, ...x.artefacts.subnetIds];
}
/** Permits point at the site and at the project they gate. */
export function linkPermits(x: ExecCtx, init: Initiation): void {
  const dcId = x.artefacts.createdSite?.dataCenterId ?? x.plan.dataCenterId;
  const map = x.artefacts.projectByUid ?? {};
  x.plan.permits.forEach((pm, i) => {
    const id = x.artefacts.permitIds[i]; if (!id) return;
    const g = init.permitGates?.find(k => k.permit.id === pm.id);
    const projectId = g?.projectUid ? map[g.projectUid] : undefined;
    x.update('permits', id, { dataCenterId: dcId, projectId, notes: `Needed before ${pm.neededBefore.slice(0, 10)}; ${pm.leadWeeks} weeks lead.${g?.projectName ? ` Gates "${g.projectName}" (starts ${g.projectStart?.slice(0, 10)}).` : ''}${pm.siteRef ? ` Site ${x.plan.sites?.find(s => s.id === pm.siteRef)?.name ?? pm.siteRef}.` : ''} From plan ${x.plan.plnId}.` });
  });
}
/** One ATP per line of the test plan, with its steps, on the commissioning project of its phase. */
export function createAtps(x: ExecCtx, init: Initiation): void {
  const map = x.artefacts.projectByUid ?? {};
  const ids: string[] = [...(x.artefacts.atpIds ?? [])];
  for (const a of init.atps ?? []) {
    const atpId = x.seq('atps', 'ATP');
    x.create('atps', { id: atpId, atpId, projectId: (a.projectUid && map[a.projectUid]) || x.artefacts.projectIds?.[0] || '', name: a.name, system: a.system, level: a.level, status: 'Draft', plannerPlanId: x.plan.id, planPhaseId: a.planPhaseId, notes: a.siteRef ? `Site ${x.plan.sites?.find(s => s.id === a.siteRef)?.name ?? a.siteRef}; go-live needs this accepted` : a.level === 'L5 IST' ? 'Go-live of the phase needs this accepted' : undefined });
    a.steps.forEach((st, k) => { const sid = x.seq('atpSteps', 'ATPS'); x.create('atpSteps', { id: sid, atpsId: sid, atpId, stepNo: k + 1, description: st.description, method: st.method, expectedResult: st.expected, result: 'Pending' }); });
    ids.push(atpId);
  }
  x.artefacts.atpIds = ids;
}

/* ------------------------------------------------------------------ edge */
export async function startSiteWorkOrders(x: ExecCtx, init: Initiation): Promise<void> {
  const ids = [...(x.artefacts.workOrderIds ?? [])]; let failed = 0;
  for (const wo of init.workOrders ?? []) {
    const inst = await x.startProcess(wo.key, `${x.plan.plnId}-${wo.siteRef ?? ids.length + 1}`, { recordType: 'plannerPlan', recordId: x.plan.id, title: wo.name, variables: { planId: x.plan.id, siteRef: wo.siteRef, planPhaseId: wo.planPhaseId, plannedStart: wo.start, plannedEnd: wo.end } });
    if (inst) ids.push(inst.id); else failed++;
  }
  if (failed) x.warn(`${failed} site work order${failed === 1 ? '' : 's'} could not be started; start them from Work orders`);
  x.artefacts.workOrderIds = ids;
}
/** Planned edge locations move to in progress; new locations are created as planned. */
export function touchEdgeLocations(x: ExecCtx): void {
  const ids: string[] = [];
  for (const r of edgeRows(x.plan)) {
    const v = variantOf(r.variant);
    if (r.ref.kind === 'edgeLocation' && r.ref.id) {
      const loc = x.data.edgeLocations.find(l => l.id === r.ref.id);
      if (loc) { x.update('edgeLocations', loc.id, { status: loc.status === 'planned' ? 'in-progress' : loc.status, notes: `Rollout ${x.plan.plnId}, wave ${r.wave ?? 1}, ${v.label}, ${r.itKw} kW` }); ids.push(loc.id); }
    } else {
      const campus = x.data.campuses.find(c => c.id === x.plan.campusId) ?? nearestCampus(x, r);
      const id = x.seq('edgeLocations', 'SITE');
      x.create('edgeLocations', { id, locId: id, kind: 'site', name: r.name, campusId: campus?.id ?? '', regionId: x.plan.regionId ?? campus?.regionId ?? '', city: r.city ?? r.name, country: r.country ?? campus?.country ?? '', latitude: r.latitude ?? campus?.latitude ?? 0, longitude: r.longitude ?? campus?.longitude ?? 0, status: 'planned', category: 'Edge', neCount: 0, discovered: 0, roles: {}, passive: { fiberSpans: 0, odf: 0, racks: 0, powerPlant: 0, splices: 0, patchCords: 0, ducts: 0 }, notes: `New location from plan ${x.plan.plnId}, wave ${r.wave ?? 1}, ${v.label}` });
      ids.push(id);
    }
  }
  x.artefacts.edgeLocationIds = ids;
}

/* ------------------------------------------------------------------ portfolio */
/** Each allocation row becomes a draft child plan (scope, site, kW, go-live, budget envelope); interconnects between live sites become network plans. */
export function createChildPlans(x: ExecCtx): void {
  const plan = x.plan;
  const model = portfolioModel(plan, x.ev);
  const rows = model?.rows ?? effectiveAllocation(plan, x.ev.params).rows;
  if (!rows.length) throw new Error('The portfolio has no allocation: accept the proposal or add rows before executing');
  const ids: string[] = []; const patched: T.PlannerSiteRow[] = [];
  const base = (scope: T.PlannerScope, title: string, intent: string, itKw: number, goLive: string, extra: Partial<T.PlannerPlan>, params: Record<string, number | string | boolean>) => {
    const id = x.seq('plannerPlans', 'PLN');
    const density = Number(x.ev.params['densityKwPerRack']?.value ?? plan.demand.densityKwPerRack) || 10;
    const hallKw = Number(x.ev.params['hallDesignKw']?.value ?? 1500) || 1500;
    const rec: Partial<T.PlannerPlan> = {
      id, plnId: id, title, scope, status: 'Draft', templateId: `TPL-PLAN-${scope}`, dcTypeKey: plan.dcTypeKey, climate: plan.climate, regionId: plan.regionId,
      intent, ownerName: plan.ownerName, requestedBy: `${plan.plnId} · ${plan.title}`, designPowerKw: itKw, targetGoLive: goLive, demand: { ...plan.demand },
      phases: itKw > 0 ? [{ id: 'P1', name: 'Go-live', goLive, itKw, halls: Math.max(1, Math.ceil(itKw / hallKw)), racks: Math.ceil(itKw / density), status: 'Planned' }] : [],
      params, paramSources: Object.fromEntries(Object.keys(params).map(k => [k, 'requirement' as const])), risks: [], permits: [], approvals: [], wizardStep: 2, aiAssisted: false, parentPlanId: plan.id, ...extra,
    };
    x.create('plannerPlans', rec as Record<string, unknown>);
    ids.push(id); return id;
  };
  const tier = String(x.ev.params['tier']?.value ?? 'Tier III');
  for (const r of rows) {
    if (r.childPlanId && x.data.plannerPlans.some(p => p.id === r.childPlanId)) { patched.push(r); ids.push(r.childPlanId); continue; }
    const scope = CHILD_SCOPE[r.route ?? 'expansion'];
    const check = model?.checks.find(c => c.row.id === r.id);
    const budget = r.capexUsd ?? check?.capexUsd ?? 0;
    let extra: Partial<T.PlannerPlan>;
    if (r.ref.kind === 'dataCenter') { const d = x.data.dataCenters.find(k => k.id === r.ref.id); extra = { dataCenterId: d?.id, campusId: d?.campusId, ...(scope === 'expansion' ? { newSiteName: `${d?.code ?? 'Site'} new building` } : {}) }; }
    else if (r.ref.kind === 'campus') { const c = x.data.campuses.find(k => k.id === r.ref.id); extra = { campusId: c?.id, newSiteName: `${c?.city.toUpperCase().slice(0, 3) ?? 'NEW'}-B${(x.data.dataCenters.filter(d => d.campusId === c?.id).length || 0) + 1}` }; }
    else { const c = plan.candidates?.find(k => k.id === r.ref.id); extra = { newSiteName: r.name.replace(/\s*\(new site\)/i, ''), candidates: c ? [{ ...c, chosen: true }] : undefined, climate: c?.climate ?? plan.climate }; }
    const permits = plan.permits.filter(pm => pm.siteRef === r.id);
    const id = base(scope, `${r.name.replace(/\s*\(new site\)/i, '')} · ${fmtKw(r.itKw)}`, `Delivers allocation row "${r.name}" of portfolio ${plan.plnId}: ${fmtKw(r.itKw)} by ${r.goLive.slice(0, 10)} as a ${scope}, within a budget envelope of ${fmtUsd(budget)}.${r.notes ? ` ${r.notes}.` : ''}`, r.itKw, r.goLive, { ...extra, permits }, { tier, budgetEnvelopeUsd: budget });
    patched.push({ ...r, childPlanId: id, status: 'Accepted' });
  }
  for (const d of model?.dci ?? []) {
    if (!d.existingEnds || !d.aDcId || !d.bDcId) { x.warn(`Interconnect ${d.a} to ${d.b}: plan it once the new site exists`); continue; }
    base('network', `${d.a} to ${d.b} interconnect · ${d.gbps} Gbps`, `Interconnect for portfolio ${plan.plnId}: ${d.gbps} Gbps between ${d.a} and ${d.b}${d.km !== undefined ? `, ${d.km} km, about ${d.latencyMs} ms one way` : ''}.`, 0, rows.reduce((m, r) => (r.goLive < m ? r.goLive : m), rows[0].goLive), { dataCenterId: d.aDcId, peerDataCenterId: d.bDcId }, { dciGbpsRequired: d.gbps, diversePaths: 2 });
  }
  x.artefacts.childPlanIds = ids; x.artefacts.vehicle = 'portfolio';
  x.planPatch.childPlanIds = ids;
  if (model?.rowSource !== 'scenario') x.planPatch.sites = [...patched, ...(plan.sites ?? []).filter(r => r.status === 'Rejected')];
}
