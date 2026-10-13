/**
 * Execution — an approved plan becomes build artefacts in the platform.
 *
 * Execution always runs from the approved baseline (the scenario the approvers saw, with its
 * parameters frozen at approval), never from the scenario on screen. It is blocked while an
 * approval condition that blocks execution is open.
 *
 * Execution runs as named steps. Each step records 'done' (or 'failed' with the error) in the
 * plan's artefacts as soon as it finishes, so a failed run can be resumed: steps already done
 * are skipped and nothing is created twice. The plan is set to Executing only when every
 * step has succeeded; a partial run leaves it Approved with the errors shown and "Resume".
 *
 * Generic steps: delivery vehicle (programme, project or change, unless the plan type's family
 * creates its own), bill of materials, purchase orders, stock and rack holds, IP space, permits
 * and design documents. The family's `execute` hook then adds its own records (changes and
 * windows per wave, circuits, planned devices, child plans…). Last, the plan's capacity holds
 * move from Reserved to Committed and are linked to the change request.
 *
 * Delivery process (no double approval): the planner's approval round already took the option
 * and budget decision, so execution never starts P06 "Capacity expansion" (whose first steps
 * are choose option → approval limit → approve budget). When the initiation names P06, the
 * delivery process is started instead: P02 "Hall fit-out" for capacity added inside a live site
 * (it starts at "Fit-out approved": design review, PO release, install, commission, handover,
 * release capacity); for site builds, plant, network and migrations the programme and its
 * projects are the delivery vehicle and no extra work-order process is started. P05 change and
 * P10 work order are started as the initiation names them.
 */
import type * as T from '../p2b/types';
import { db } from '../compat/db';
import { dcTypeProfile } from '../p2b/dcTypes';
import { evaluate, fmtUsd, type Evaluation } from './engine';
import { blueprintFor, buildBom, buildInitiation, buildIpPlan, REPLACE_SCOPES } from './outputs';
import { sourceBom, type SourcedLine, type SourcingContext } from './sourcing';
import type { PlannerData } from './plannerData';
import { modelFor, FAMILY_OF, type ExecCtx } from './scopes';
import { baselineScenario, buildBaseline, openBlockingConditions } from './governance';
import { moveReservations, reservationRequests, writeReservations, type Store } from './reservations';
import { PROCESS_FOR_TEMPLATE } from '../p2b/delivery/projectTemplates';
import { createMaterialOps } from '../compat/delivery/materialOps';
import { CATEGORY_WORK, inUnits, resolveMaterial, stepForCategory, stepWorkTypes } from '../compat/delivery/materialCatalogue';
import { WORK_SPECS, processKeyFor } from '../compat/delivery/projectProcess';
import { clockMs } from '../compat/clock';

const now = () => new Date(clockMs()).toISOString();
const REPLACE_TYPES: Partial<Record<T.PlannerScope, T.BOM['type']>> = { 'server-refresh': 'Compute', 'network-refresh': 'Network', 'rack-replace': 'Rack' };

/** MockDB as a governance store. */
export const mockDbStore: Store = {
  list: entity => db.getAll(entity, { pageSize: 1_000_000 }).data as Record<string, unknown>[],
  get: (entity, id) => db.getById(entity, id),
  create: (entity, rec) => { db.create(entity, rec); },
  update: (entity, id, patch) => { db.update(entity, id, patch); },
};

/** What execution needs from the app (hooks are created by the caller). */
export interface ExecEnv {
  actor: string; actorId?: string; customerId?: string; templates: T.PlannerTemplate[]; benchmarks: T.PlannerBenchmark[]; data: PlannerData;
  audit(entity: string, id: string, action: string, summary: string): void;
  startProcess: ExecCtx['startProcess'];
  createProgramFromBlueprint: ExecCtx['createProgramFromBlueprint'];
  createProgram: ExecCtx['createProgram'];
  createProject: ExecCtx['createProject'];
  /** Scenarios of the plan (to find the approved one when a plan was approved before baselines were kept). */
  scenarios?: T.PlannerScenario[];
}
export interface ExecResult { ok: boolean; artefacts: T.PlannerArtefacts; errors: { step: string; message: string }[]; warnings: string[] }

/** Next sequential id for a collection: PREFIX-0001, PREFIX-0002… (falls back to a time-based id when the collection uses another scheme). */
export function nextId(entity: string, prefix: string): string {
  const all = db.getAll(entity, { pageSize: 100000 }).data as { id: string }[];
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const max = all.reduce((m, r) => { const x = re.exec(r.id); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

/** The delivery process to start for an initiation's work order (never P06 after a planner approval). */
export function deliveryProcessFor(plan: T.PlannerPlan, initiationKey: string): { key?: string; name: string } {
  if (initiationKey !== 'capacity-expansion') return { key: initiationKey, name: initiationKey };
  if (FAMILY_OF[plan.scope] === 'in-site') return { key: 'hall-fitout', name: 'P02 Hall fit-out' };
  return { key: undefined, name: 'the programme and its projects' };
}

/** Human names of the generic steps, for the plan page. */
export const STEP_LABEL: Record<string, string> = {
  vehicle: 'Delivery vehicle and process', bom: 'Bill of materials', 'purchase-orders': 'Purchase orders', materials: 'Materials on the project steps', holds: 'Stock and rack holds', ip: 'IP space and VLANs',
  permits: 'Permits', 'design-docs': 'Design documents', scope: 'Plan-type records', 'commit-reservations': 'Capacity holds committed',
};

export async function runExecution(env: ExecEnv, planIn: T.PlannerPlan, _viewed?: Evaluation, sourcing?: SourcingContext): Promise<ExecResult> {
  const warnings: string[] = [];
  const template = env.templates.find(t => t.id === planIn.templateId);
  const at0 = now();
  const meta = () => ({ customerId: env.customerId ?? planIn.customerId ?? 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: env.actor, createdById: env.actorId ?? 'me' });

  // Gate: approved, no open blocking condition.
  const stopped = (step: string, message: string): ExecResult => ({ ok: false, artefacts: planIn.artefacts ?? { createdAt: at0, vehicle: 'project', purchaseOrderIds: [], subnetIds: [], vlanIds: [], permitIds: [], designDocIds: [] }, errors: [{ step, message }], warnings });
  if (planIn.status !== 'Approved') return stopped('status', `Only an approved plan can be executed; this plan is ${planIn.status.toLowerCase()}.`);
  const blocking = openBlockingConditions(planIn);
  if (blocking.length) return stopped('conditions', `${blocking.length} approval condition(s) must be closed first: ${blocking.map(c => `${c.text} (owner ${c.owner})`).join('; ')}`);

  // The approved figures. Plans approved before baselines were kept get one frozen now.
  let plan = planIn;
  if (!plan.baseline) {
    const scn = env.scenarios?.find(s => s.id === (plan.approvedScenarioId ?? plan.reviewScenarioId ?? plan.preferredScenarioId)) ?? null;
    const evA = evaluate(plan, scn, env.templates, env.benchmarks, undefined, env.data);
    const bomA = buildBom(plan, evA, env.benchmarks);
    const srcA = sourcing ? sourceBom(plan, evA, bomA, sourcing) : undefined;
    const baseline = buildBaseline({ plan, ev: evA, scenario: scn, template, benchmarks: env.benchmarks, bomTotal: bomA.total, sourcedTotal: srcA?.total, buyTotal: srcA?.buyTotal, actor: env.actor, at: at0 });
    plan = { ...plan, baseline, approvedScenarioId: scn?.id, templateVersion: baseline.templateVersion };
    db.update('plannerPlans', plan.id, { baseline, approvedScenarioId: scn?.id, templateVersion: baseline.templateVersion, updatedAt: now() } as Record<string, unknown>);
    warnings.push(`The plan was approved before baselines were kept; its figures were frozen now (${fmtUsd(baseline.capexTotal)} from ${baseline.scenarioName}).`);
    env.audit('Plan', plan.id, 'baseline frozen', `Baseline frozen at execution: ${fmtUsd(baseline.capexTotal)} CapEx from ${baseline.scenarioName}, template v${baseline.templateVersion}`);
  }
  const ev = evaluate(plan, baselineScenario(plan), env.templates, env.benchmarks, undefined, env.data);
  const bom = buildBom(plan, ev, env.benchmarks); const ip = buildIpPlan(plan, ev); const init = buildInitiation(plan, ev, template, bom);
  const sourced = sourcing ? sourceBom(plan, ev, bom, { ...sourcing, data: sourcing.data ?? env.data }) : undefined;
  const profile = dcTypeProfile(plan.dcTypeKey);
  const model = modelFor(plan.scope);
  const budget = plan.baseline!.capexTotal;

  // Resume an earlier run that did not finish. Artefacts written at approval (holds only) start a fresh run.
  const prev = plan.artefacts?.executionId && !plan.artefacts.completedAt ? plan.artefacts : undefined;
  const artefacts: T.PlannerArtefacts = prev
    ? { ...prev, errors: [] }
    : { ...(plan.artefacts ?? {}), createdAt: at0, executionId: `EXE-${clockMs().toString(36).toUpperCase()}`, vehicle: init.vehicle, purchaseOrderIds: [], subnetIds: [], vlanIds: [], permitIds: [], designDocIds: [], steps: {}, errors: [] };
  artefacts.steps = artefacts.steps ?? {};
  const errors: { step: string; message: string }[] = [];
  const persist = () => db.update('plannerPlans', plan.id, { artefacts, updatedAt: now() } as Record<string, unknown>);
  const x: ExecCtx = {
    plan, ev, template, bom, sourced, data: env.data, actor: env.actor, meta,
    id: (prefix: string) => `${prefix}-${clockMs().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e4).toString(36).toUpperCase()}`,
    seq: nextId,
    create(entity, rec) { const id = String(rec.id ?? x.id(entity.slice(0, 4).toUpperCase())); db.create(entity, { ...meta(), ...rec, id }); return id; },
    update(entity, id, patch) { db.update(entity, id, { ...patch, updatedAt: now() }); },
    async step(key, fn) {
      if (artefacts.steps![key] === 'done') return;
      try { await fn(); artefacts.steps![key] = 'done'; }
      catch (e) { artefacts.steps![key] = 'failed'; const message = e instanceof Error ? e.message : String(e); errors.push({ step: key, message }); artefacts.errors = [...(artefacts.errors ?? []), { step: key, message, at: now() }]; }
      persist();
    },
    artefacts, planPatch: {}, warn: m => warnings.push(m),
    startProcess: env.startProcess, createProgramFromBlueprint: env.createProgramFromBlueprint, createProgram: env.createProgram, createProject: env.createProject,
  };
  persist();

  // 1. Delivery vehicle and the delivery process.
  await x.step('vehicle', async () => {
    if (model.executeVehicle) { await model.executeVehicle(x); return; }
    if (init.vehicle === 'change') {
      const id = nextId('changeRequests', 'CHG');
      x.create('changeRequests', { id, chgId: id, title: plan.title, type: init.change?.type ?? 'RackDeploy', description: `Raised from plan ${plan.plnId}: ${plan.intent || plan.title}`, risk: ev.hardFails ? 'High' : 'Low', status: 'Submitted', priority: 'Medium', affectedResourceType: 'Rack', affectedResourceIds: String(plan.params.placementRackIds ?? '').split(',').filter(Boolean), dataCenterId: plan.dataCenterId, requestedBy: env.actor, requestedById: env.actorId ?? 'me', policyViolations: [], scheduledStart: plan.targetGoLive, plannerPlanId: plan.id });
      artefacts.changeRequestId = id; artefacts.changeRequestIds = [...(artefacts.changeRequestIds ?? []), id];
      const inst = await env.startProcess('change', id, { recordType: 'changeRequest', recordId: id, dataCenterId: plan.dataCenterId, title: plan.title, variables: { planId: plan.id } });
      if (!inst) throw new Error('The change process could not be started');
      artefacts.processInstanceId = inst.id; artefacts.deliveryProcessKey = 'change';
      return;
    }
    if (!artefacts.programId) {
      if (init.vehicle === 'project') {
        const programId = await env.createProgram({ name: plan.title, type: plan.scope === 'network' ? 'Network Modernization' : 'Capacity Expansion', objective: plan.intent || plan.title, ownerName: plan.ownerName, budget, status: 'Active', startDate: now(), endDate: plan.targetGoLive });
        x.update('programs', programId, { plannerPlanId: plan.id });
        artefacts.programId = programId; persist();
        for (const pj of init.projects) if (pj.template) { const pid = await env.createProject({ name: pj.name, programId, template: pj.template, managerName: plan.ownerName, dataCenterId: plan.dataCenterId, plannedStart: pj.start, plannedEnd: pj.end, budget: pj.budget, detail: { planId: plan.id } }); if (pid) { x.update('projects', pid, { plannerPlanId: plan.id }); artefacts.projectIds = [...(artefacts.projectIds ?? []), pid]; } }
      } else {
        const res = await env.createProgramFromBlueprint({ blueprintKey: init.blueprintKey ?? blueprintFor(plan), name: plan.title, ownerName: plan.ownerName, dataCenterId: plan.dataCenterId, budget, objective: plan.intent, durationFactor: profile?.build.durationFactor });
        if (!res?.programId) throw new Error(`Blueprint ${init.blueprintKey ?? blueprintFor(plan)} not found`);
        artefacts.programId = res.programId; x.update('programs', res.programId, { plannerPlanId: plan.id, budget });
        for (const p of db.getAll('projects', { pageSize: 100000 }).data as unknown as T.Project[]) if (p.programId === res.programId) { x.update('projects', p.id, { plannerPlanId: plan.id }); artefacts.projectIds = [...new Set([...(artefacts.projectIds ?? []), p.id])]; }
      }
      persist();
    }
    const dp = deliveryProcessFor(plan, init.workOrder.key);
    artefacts.deliveryProcessKey = dp.key ?? 'programme';
    if (!dp.key) { x.warn(`Delivery runs through ${dp.name}; the budget was approved in the planner, so no separate approval process is started.`); return; }
    const approvedBy = plan.approvals.filter(a => a.decision !== 'Pending').map(a => `${a.step}: ${a.person}`).join('; ');
    const inst = await env.startProcess(dp.key, plan.plnId, { recordType: 'plannerPlan', recordId: plan.id, dataCenterId: plan.dataCenterId, title: plan.title, variables: { planId: plan.id, scope: plan.scope, designPowerKw: plan.designPowerKw, budget, approved: true, approvedInPlanner: true, approvedBy, baselineAt: plan.baseline?.at } });
    if (!inst) throw new Error(`The delivery process ${dp.name} could not be started. Check the work-order engine, then resume.`);
    artefacts.processInstanceId = inst.id;
  });

  // Handover to delivery: every project this plan created runs its template's process (projects
  // created through the delivery hooks have started it already; this covers the rest). Blocked
  // phases start theirs when their predecessors complete.
  for (const pid of artefacts.projectIds ?? []) {
    const proj = db.getById('projects', pid) as unknown as T.Project | undefined;
    const key = proj?.template ? PROCESS_FOR_TEMPLATE[proj.template as keyof typeof PROCESS_FOR_TEMPLATE] : undefined;
    if (!proj || !key || proj.status === 'Blocked') continue;
    const running = (db.getAllRaw('processInstances') as unknown as T.ProcessInstance[]).some(i => i.recordType === 'project' && i.recordId === pid && i.state !== 'cancelled');
    if (!running) await env.startProcess(key, proj.projId, { recordType: 'project', recordId: pid, dataCenterId: proj.dataCenterId, title: proj.name, variables: { projectId: pid, programId: proj.programId, template: proj.template, plannerPlanId: plan.id } });
  }

  // 2. Bill of materials.
  await x.step('bom', () => {
    const bomId = nextId('boms', 'BOM');
    const lines = sourced?.lines ?? bom.lines;
    const top = bom.byCategory[0]?.category;
    x.create('boms', { id: bomId, bomId, name: `${plan.title} · bill of materials`, type: REPLACE_TYPES[plan.scope] ?? (plan.scope === 'network' ? 'Network' : plan.scope === 'plant' ? 'Power' : top === 'Compute and storage' ? 'Compute' : 'Rack'), totalCost: sourced?.total ?? bom.total, status: 'Draft', lineCount: lines.length, plannerPlanId: plan.id });
    lines.forEach((l, i) => { const sl = l as Partial<SourcedLine>; const id = x.id('BOML'); x.create('bomLines', { id, bomlId: id, bomId, lineNo: i + 1, partNumber: l.partNumber, description: `${l.item} — ${l.spec}${sl.allocations ? ` · ${sl.fromSite ? `${sl.fromSite} from site, ` : ''}${sl.fromStock ? `${sl.fromStock} from stock, ` : ''}${sl.toBuy} to buy` : ''}`, manufacturer: l.manufacturer, quantity: l.qty, unitCost: l.unitCost, category: l.category }); });
    artefacts.bomId = bomId;
  });

  // 3. Purchase orders: one per vendor under its contract when sourced; otherwise one per long-lead item.
  await x.step('purchase-orders', () => {
    const longest = init.orders.reduce<{ orderBy?: string; needBy?: string }>((m, o) => (!m.orderBy || o.orderBy < m.orderBy ? { orderBy: o.orderBy, needBy: o.needBy } : m), {});
    const ids = sourced
      // One order per vendor and phase, under the vendor's supply or framework contract, dated from that phase.
      ? sourced.vendors.filter(v => v.value > 0).map(v => { const id = nextId('purchaseOrders', 'PO'); x.create('purchaseOrders', { id, poId: id, bomId: artefacts.bomId, vendorId: v.vendorId, contractId: v.contractId, plannedCost: v.value, approvedBudget: v.value, actualSpend: 0, forecastVariance: 0, status: 'Draft', plannerPlanId: plan.id, planPhaseId: v.phaseId, orderBy: v.orderBy ?? longest.orderBy, needBy: v.needBy ?? longest.needBy ?? plan.targetGoLive, notes: `${v.vendorName}${v.phaseName ? ` · ${v.phaseName}` : ''}: ${v.lines.length} line${v.lines.length === 1 ? '' : 's'}${v.contractId ? ` under contract ${v.contractLabel}` : ', no contract'}; longest lead ${v.leadWeeks || '—'} weeks. From plan ${plan.plnId}.` }); return id; })
      : init.orders.map(o => { const id = nextId('purchaseOrders', 'PO'); x.create('purchaseOrders', { id, poId: id, bomId: artefacts.bomId, plannedCost: o.value, approvedBudget: o.value, actualSpend: 0, forecastVariance: 0, status: 'Draft', plannerPlanId: plan.id, orderBy: o.orderBy, needBy: o.needBy, notes: `${o.item}: order by ${o.orderBy.slice(0, 10)}` }); return id; });
    artefacts.purchaseOrderIds = ids;
    // Grid connections and similar agreements are paid in milestones under the agreement, not by purchase order.
    for (const ag of sourced?.agreements ?? []) x.warn(`${ag.item}: ${ag.note} — record it as an agreement with milestone payments, not a purchase order`);
  });

  // 3b. Materials: the BOM is linked to the project(s) it delivers, each line resolved to a catalogue
  //     item and allocated to the project step whose work takes it; the purchase orders get their ERP
  //     lines (per vendor and phase when sourced) and every project plans its step material lines.
  await x.step('materials', () => {
    const projectIds = artefacts.projectIds ?? [];
    if (!artefacts.bomId || !projectIds.length) return;
    const mops = createMaterialOps(db, env.actor, env.audit);
    const items = sourced?.lines ?? bom.lines;
    const projects = projectIds.map(id => db.getById('projects', id) as unknown as T.Project | undefined).filter((p): p is T.Project => !!p);
    const bomLines = (db.getAllRaw('bomLines') as unknown as T.BOMLine[]).filter(l => l.bomId === artefacts.bomId).sort((a, b) => a.lineNo - b.lineNo);
    const takes = (p: T.Project, cat: T.Material['category']) => { const key = processKeyFor(p.template); return !!key && Object.keys(WORK_SPECS[key] ?? {}).some(st => stepWorkTypes(key, st).some(t => CATEGORY_WORK[cat].includes(t))); };
    bomLines.forEach((bl, i) => {
      const it = items[i];
      const m = resolveMaterial(db.getAllRaw('materials') as unknown as T.Material[], { partNumber: bl.partNumber, description: it ? `${it.item} ${it.spec}` : bl.description, model: (it as Partial<SourcedLine> | undefined)?.model ?? it?.model, kind: it?.kind })
        ?? mops.mirrorMaterial({ partNumber: bl.partNumber, description: bl.description, manufacturer: bl.manufacturer, unitCost: bl.unitCost, category: bl.category });
      const project = projects.find(p => takes(p, m.category)) ?? projects[0];
      const step = stepForCategory(processKeyFor(project.template), m.category);
      const u = inUnits(m, bl.quantity, bl.unitCost); // pieces of a pack-sold item → whole packs
      x.update('bomLines', bl.id, { materialId: m.id, projectId: project.id, projectStepId: step, needBy: it?.needBy, quantity: u.quantity, unitCost: u.unitCost });
    });
    x.update('boms', artefacts.bomId, { projectId: projects[0]?.id });
    // ERP lines: one per sourced line and vendor order (the quantity bought from that vendor in that phase).
    if (sourced) {
      const ids = artefacts.purchaseOrderIds;
      sourced.vendors.filter(v => v.value > 0).forEach((v, k) => {
        const poId = ids[k]; if (!poId) return;
        v.lines.forEach((sl, n) => {
          const idx = items.indexOf(sl); const bl = bomLines[idx]; if (!bl) return;
          const pieces = sl.allocations.filter(a => a.source === 'procure' && !a.agreement && a.vendorId === v.vendorId && (!v.phaseId || a.phaseId === v.phaseId)).reduce((a, b) => a + b.qty, 0) || sl.toBuy;
          if (pieces <= 0) return;
          const m = db.getById('materials', (db.getById('bomLines', bl.id) as unknown as T.BOMLine).materialId ?? '') as unknown as T.Material | undefined;
          const { quantity: qty, unitCost } = m ? inUnits(m, pieces, sl.unitCost) : { quantity: pieces, unitCost: sl.unitCost };
          const id = nextId('purchaseOrderLines', 'POL');
          const needBy = sl.allocations.find(a => a.vendorId === v.vendorId && a.needBy)?.needBy ?? v.needBy;
          x.create('purchaseOrderLines', { id, polId: id, poId, lineNo: n + 1, materialId: (db.getById('bomLines', bl.id) as unknown as T.BOMLine).materialId, bomLineId: bl.id, quantity: qty, unitCost, needBy, receivedQty: 0, status: 'Open', erpRef: `ERP-${poId}-${(n + 1) * 10}` });
        });
      });
    } else mops.ensurePoLines(artefacts.bomId);
    for (const p of projects) mops.planProjectMaterials(p.id);
  });

  // 4. Stock and rack positions the plan uses — held in the plan's name, never anonymously.
  await x.step('holds', () => {
    const devs = sourced?.stockDeviceIds ?? [];
    for (const id of devs) x.update('devices', id, { lifecycleState: 'Staged', plannerPlanId: plan.id, notes: `Reserved for ${plan.plnId} · ${plan.title}` });
    const racks = sourced?.siteRackIds ?? [];
    for (const id of racks) {
      x.update('racks', id, { status: 'Reserved', plannerPlanId: plan.id });
      const rid = nextId('capacityReservations', 'RSV');
      x.create('capacityReservations', { id: rid, rsvId: rid, resourceType: 'Rack', resourceId: id, state: 'Reserved', quantity: 1, unit: 'rack', status: 'Active', plannerPlanId: plan.id, dataCenterId: plan.dataCenterId, label: `${plan.plnId}: rack position for the plan`, expiresAt: plan.targetGoLive });
      artefacts.reservationIds = [...(artefacts.reservationIds ?? []), rid];
    }
    artefacts.reservedDeviceIds = devs; artefacts.reservedRackIds = racks;
  });

  // 5. IP space and VLANs (only plans that add network; replacements keep their addresses).
  await x.step('ip', () => {
    const coversNetwork = !REPLACE_SCOPES.includes(plan.scope) && plan.scope !== 'migration' && (template?.requiredAspects ?? []).some(a => a.aspect === 'network' && a.depth !== 'skipped');
    if (!coversNetwork) return;
    const purposeOf = (p: string) => (p === 'Loopback' ? 'Transit' : p);
    artefacts.subnetIds = ip.items.map(i => { const id = nextId('subnets', 'SUBNET'); x.create('subnets', { id, subnetId: id, cidr: i.cidr, name: `${plan.title.split('·')[0].trim()} · ${i.name}`, status: 'Reserved', gatewayIp: i.gateway ?? '', dataCenterId: plan.dataCenterId, totalHosts: i.hosts, usedHosts: 0, utilizationPct: 0, state: 'Reserved', purpose: purposeOf(i.purpose), plannerPlanId: plan.id }); return id; });
    artefacts.vlanIds = ip.vlans.map(v => { const id = nextId('vlans', 'VLAN'); x.create('vlans', { id, vlanId: id, vlanNumber: v.number, name: v.name, dataCenterId: plan.dataCenterId, status: 'Reserved', plannerPlanId: plan.id }); return id; });
  });

  // 6. Permits and design documents.
  await x.step('permits', () => {
    const permitType = (n: string) => (/planning|zoning/i.test(n) ? 'Planning / Zoning' : /building/i.test(n) ? 'Building Permit' : /grid|utility|connection/i.test(n) ? 'Utility Interconnect' : /environment|emission|noise|water/i.test(n) ? 'Environmental' : /fire/i.test(n) ? 'Fire / Life Safety' : /electric/i.test(n) ? 'Electrical' : 'Planning / Zoning');
    const permitStatus: Record<T.PlannerPermit['status'], string> = { 'Not started': 'Not Started', Applied: 'Applied', 'In review': 'In Review', Approved: 'Approved', Expired: 'Expired' };
    artefacts.permitIds = plan.permits.map(pm => { const id = nextId('permits', 'PMT'); x.create('permits', { id, permitId: id, name: pm.name, type: permitType(pm.name), status: permitStatus[pm.status], authority: pm.authority, owner: plan.ownerName, programId: artefacts.programId, dataCenterId: plan.dataCenterId, plannerPlanId: plan.id, notes: `Needed before ${pm.neededBefore.slice(0, 10)}; ${pm.leadWeeks} weeks lead. From plan ${plan.plnId}.` }); return id; });
  });
  await x.step('design-docs', () => {
    artefacts.designDocIds = init.designDocs.map(d => { const id = nextId('designDocuments', 'DD'); x.create('designDocuments', { id, ddId: id, name: `${plan.title} · ${d.name}`, type: d.type, status: 'Draft', discipline: d.discipline, revision: plan.revision ?? 'A', author: env.actor, programId: artefacts.programId, plannerPlanId: plan.id, notes: `Generated from plan ${plan.plnId}` }); return id; });
  });

  // 7. The family's own records.
  if (model.execute) await x.step('scope', () => model.execute!(x));

  // 8. Capacity holds: written at approval (written now for plans approved before the ledger), then committed.
  await x.step('commit-reservations', () => {
    const fresh = env.data.ready ? reservationRequests(plan, ev, env.data) : undefined;
    if (fresh) { const ids = writeReservations(mockDbStore, plan, fresh, meta(), env.actor); artefacts.reservationIds = [...new Set([...(artefacts.reservationIds ?? []), ...ids.reservationIds])]; artefacts.rackReservationIds = [...new Set([...(artefacts.rackReservationIds ?? []), ...ids.rackReservationIds])]; }
    moveReservations(mockDbStore, plan.id, 'Committed', { changeRequestId: artefacts.changeRequestId ?? artefacts.changeRequestIds?.[0], at: now() });
  });

  const ok = errors.length === 0;
  if (ok) artefacts.completedAt = now();
  artefacts.runs = [...(artefacts.runs ?? []), { executionId: artefacts.executionId!, at: now(), by: env.actor, ok, failed: errors.map(e => e.step) }];
  const phases = ok ? plan.phases.map(p => (p.status === 'Planned' || p.status === 'Approved' ? { ...p, status: 'In delivery' as const } : p)) : plan.phases;
  db.update('plannerPlans', plan.id, { ...x.planPatch, phases, status: ok ? 'Executing' : plan.status, programId: artefacts.programId, processInstanceId: artefacts.processInstanceId, artefacts, updatedAt: now(), updatedBy: env.actor } as Record<string, unknown>);
  for (const [k, s] of Object.entries(artefacts.steps)) if (s === 'failed') env.audit('Plan', plan.id, 'execution step failed', `${STEP_LABEL[k] ?? k}: ${errors.find(e => e.step === k)?.message ?? 'failed'}`);
  env.audit('Plan', plan.id, ok ? 'executed' : 'execution failed', ok
    ? `Plan ${plan.plnId} executed from the approved baseline (${fmtUsd(budget)}): ${artefacts.programId ? `programme ${artefacts.programId}` : `change ${artefacts.changeRequestId}`}, ${bom.lines.length} BOM lines, ${artefacts.purchaseOrderIds.length} purchase orders, ${artefacts.subnetIds.length} subnets, ${artefacts.permitIds.length} permits, ${artefacts.reservationIds?.length ?? 0} capacity holds committed; delivery process ${artefacts.deliveryProcessKey}`
    : `Execution of ${plan.plnId} stopped at ${errors.map(e => STEP_LABEL[e.step] ?? e.step).join(', ')}: ${errors.map(e => e.message).join('; ')}. Steps done are kept; resume to continue.`);
  return { ok, artefacts, errors, warnings };
}
