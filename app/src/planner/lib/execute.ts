/**
 * Execution — an approved plan is handed to Delivery, which builds it.
 *
 * Execution always runs from the approved baseline (the scenario the approvers saw, with its
 * parameters frozen at approval), never from the scenario on screen. It is blocked while an
 * approval condition that blocks execution is open.
 *
 * Delivery is the source of truth for the build (user, 14-Oct-2026): the project (PRJ-n = PLN-n),
 * its purchase orders, work orders with their change requests, commissioning, permits and design
 * documents are Delivery's records, derived from the plan and its sourced bill of materials
 * (mock/delivery.ts). Execution therefore creates no programme, project, purchase order, permit or
 * design document of its own: it hands the plan over and records Delivery's ids in the artefacts.
 * It keeps what Delivery does not own: the sourced bill of materials (site / stock / buy per line,
 * vendor orders under their contracts, which Delivery turns into one purchase order per vendor and
 * phase), stock devices and rack positions held for the plan, IP space and VLANs, the plan type's
 * own records (site records and child plans for builds, circuits, planned devices, wave changes…)
 * and the capacity holds, which move from Reserved to Committed.
 *
 * Steps record 'done' (or 'failed' with the error) in the plan's artefacts as soon as they finish,
 * so a failed run can be resumed: steps already done are skipped and nothing is created twice. The
 * plan is set to Executing only when every step has succeeded; a partial run leaves it Approved
 * with the errors shown and "Resume".
 */
import type * as T from '../p2b/types';
import { db } from '../compat/db';
import { evaluate, fmtUsd, type Evaluation } from './engine';
import { buildBom, buildInitiation, buildIpPlan, REPLACE_SCOPES } from './outputs';
import { sourceBom, type SourcedLine, type SourcingContext } from './sourcing';
import { vendorOrderRecords } from './packModel';
import type { PlannerData } from './plannerData';
import { modelFor, type ExecCtx } from './scopes';
import { baselineScenario, buildBaseline, openBlockingConditions } from './governance';
import { moveReservations, reservationRequests, writeReservations, type Store } from './reservations';
import { createChildPlans, createSiteRecords } from './buildExecute';
import { deliveryFor, deliveryProjectId } from '../compat/delivery/handoff';
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

/** What execution needs from the app. */
export interface ExecEnv {
  actor: string; actorId?: string; customerId?: string; templates: T.PlannerTemplate[]; benchmarks: T.PlannerBenchmark[]; data: PlannerData;
  audit(entity: string, id: string, action: string, summary: string): void;
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

/** The sourcing decision as Delivery reads it from the bill of materials (packModel.vendorOrderRecords). */
export type { VendorOrderRecord } from './packModel';

/** Human names of the steps, for the plan page (older runs may show the steps execution used to have). */
export const STEP_LABEL: Record<string, string> = {
  handover: 'Handed over to Delivery', bom: 'Bill of materials and sourcing', holds: 'Stock and rack holds', ip: 'IP space and VLANs', scope: 'Plan-type records',
  'commit-reservations': 'Capacity holds committed', 'delivery-refs': 'Delivery records linked',
  vehicle: 'Delivery vehicle and process', 'purchase-orders': 'Purchase orders', materials: 'Materials on the project steps', permits: 'Permits', 'design-docs': 'Design documents',
  /* the plan types' own steps */
  'in-site-rack': 'Rack placement records', 'in-site-pod': 'Pod records', 'in-site-hall': 'Hall fit-out records', 'in-site-retrofit': 'Retrofit records',
  'scope:planned-devices': 'Planned devices', 'scope:planned-racks': 'Planned racks', 'scope:waves': 'Wave changes and windows', 'scope:site-status': 'Site status', 'scope:link-changes': 'Open changes linked',
  'site-records': 'Planned site records', 'child-plans': 'Child plans', 'link-ip': 'IP space linked to the site', 'link-permits': 'Permits linked', atps: 'Acceptance test protocols', 'site-work-orders': 'Site work orders', 'edge-locations': 'Edge locations',
  programme: 'Programme', 'work-order': 'Work order',
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
  const model = modelFor(plan.scope);
  const budget = plan.baseline!.capexTotal;
  const prj = deliveryProjectId(plan.plnId);

  // Resume an earlier run that did not finish. Artefacts written at approval (holds only) start a fresh run.
  const prev = plan.artefacts?.executionId && !plan.artefacts.completedAt ? plan.artefacts : undefined;
  const artefacts: T.PlannerArtefacts = prev
    ? { ...prev, errors: [] }
    : { ...(plan.artefacts ?? {}), createdAt: at0, executionId: `EXE-${clockMs().toString(36).toUpperCase()}`, vehicle: init.vehicle === 'portfolio' ? 'portfolio' : 'project', purchaseOrderIds: [], subnetIds: [], vlanIds: [], permitIds: [], designDocIds: [], steps: {}, errors: [] };
  artefacts.steps = artefacts.steps ?? {};
  const errors: { step: string; message: string }[] = [];
  const persist = () => db.update('plannerPlans', plan.id, { artefacts, updatedAt: now() } as Record<string, unknown>);
  /* Delivery runs the build: where plan-type code asks for a programme, project or process, the answer is Delivery's project. */
  const toDelivery = async () => prj;
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
    startProcess: async () => ({ id: prj }), createProgramFromBlueprint: async () => ({ programId: prj }), createProgram: toDelivery, createProject: toDelivery,
  };
  persist();

  // 1. Hand the plan to Delivery: its project is the delivery vehicle (no programme, project or process is created here).
  //    A site build first writes the planned site records; a portfolio executes to child plans.
  await x.step('handover', () => {
    artefacts.deliveryProjectId = prj;
    artefacts.projectIds = [prj];
    if (plan.scope === 'portfolio') createChildPlans(x);
    else if ((plan.scope === 'new-dc' || plan.scope === 'expansion') && !artefacts.createdSite?.dataCenterId) createSiteRecords(x);
  });

  // 2. Bill of materials with the sourcing decision: per line from spare site capacity, stock or a vendor; the vendor orders
  //    (one per vendor and phase, under its contract) are what Delivery raises as purchase orders.
  await x.step('bom', () => {
    const bomId = nextId('boms', 'BOM');
    const lines = sourced?.lines ?? bom.lines;
    const top = bom.byCategory[0]?.category;
    const vendorOrders = sourced ? vendorOrderRecords(sourced) : [];
    x.create('boms', { id: bomId, bomId, name: `${plan.title} · bill of materials`, type: REPLACE_TYPES[plan.scope] ?? (plan.scope === 'network' ? 'Network' : plan.scope === 'plant' ? 'Power' : top === 'Compute and storage' ? 'Compute' : 'Rack'), totalCost: sourced?.total ?? bom.total, status: 'Approved', lineCount: lines.length, plannerPlanId: plan.id, projectId: prj, sourced: !!sourced, vendorOrders });
    lines.forEach((l, i) => { const sl = l as Partial<SourcedLine>; const id = x.id('BOML'); x.create('bomLines', { id, bomlId: id, bomId, lineNo: i + 1, partNumber: l.partNumber, description: `${l.item} — ${l.spec}${sl.allocations ? ` · ${sl.fromSite ? `${sl.fromSite} from site, ` : ''}${sl.fromStock ? `${sl.fromStock} from stock, ` : ''}${sl.toBuy} to buy` : ''}`, manufacturer: l.manufacturer, quantity: l.qty, unitCost: l.unitCost, category: l.category, fromSite: sl.fromSite ?? 0, fromStock: sl.fromStock ?? 0, toBuy: sl.toBuy ?? l.qty, vendorName: sl.vendorName }); });
    artefacts.bomId = bomId;
    if (sourced) {
      const sum = (f: (l: SourcedLine) => number) => sourced.lines.reduce((a, l) => a + f(l), 0);
      artefacts.sourcing = { siteQty: sum(l => l.fromSite), stockQty: sum(l => l.fromStock), buyQty: sum(l => l.toBuy), siteUsd: Math.round(sourced.siteValue), stockUsd: Math.round(sourced.stockValue), buyUsd: Math.round(sourced.buyTotal), vendors: vendorOrders.length, plannedHolds: sourced.plannedHoldDeviceIds?.length ?? 0 };
      for (const w of sourced.warnings) x.warn(w);
    } else x.warn('Sourcing data was not available: Delivery orders every line from the bill of materials.');
    // Grid connections and similar agreements are paid in milestones under the agreement, not by purchase order.
    for (const ag of sourced?.agreements ?? []) x.warn(`${ag.item}: ${ag.note} — record it as an agreement with milestone payments, not a purchase order`);
  });

  // 3. Stock and rack positions the plan uses — held in the plan's name, never anonymously.
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

  // 4. IP space and VLANs (only plans that add network; replacements keep their addresses).
  await x.step('ip', () => {
    const coversNetwork = !REPLACE_SCOPES.includes(plan.scope) && plan.scope !== 'migration' && (template?.requiredAspects ?? []).some(a => a.aspect === 'network' && a.depth !== 'skipped');
    if (!coversNetwork) return;
    const purposeOf = (p: string) => (p === 'Loopback' ? 'Transit' : p);
    artefacts.subnetIds = ip.items.map(i => { const id = nextId('subnets', 'SUBNET'); x.create('subnets', { id, subnetId: id, cidr: i.cidr, name: `${plan.title.split('·')[0].trim()} · ${i.name}`, status: 'Reserved', gatewayIp: i.gateway ?? '', dataCenterId: plan.dataCenterId, totalHosts: i.hosts, usedHosts: 0, utilizationPct: 0, state: 'Reserved', purpose: purposeOf(i.purpose), plannerPlanId: plan.id }); return id; });
    artefacts.vlanIds = ip.vlans.map(v => { const id = nextId('vlans', 'VLAN'); x.create('vlans', { id, vlanId: id, vlanNumber: v.number, name: v.name, dataCenterId: plan.dataCenterId, status: 'Reserved', plannerPlanId: plan.id }); return id; });
  });

  // 5. The plan type's own records (circuits, planned devices and racks, wave changes, test protocols…), linked to the Delivery project.
  if (model.execute) await x.step('scope', () => model.execute!(x));

  // 6. Capacity holds: written at approval (written now for plans approved before the ledger), then committed.
  await x.step('commit-reservations', () => {
    const fresh = env.data.ready ? reservationRequests(plan, ev, env.data) : undefined;
    if (fresh) { const ids = writeReservations(mockDbStore, plan, fresh, meta(), env.actor); artefacts.reservationIds = [...new Set([...(artefacts.reservationIds ?? []), ...ids.reservationIds])]; artefacts.rackReservationIds = [...new Set([...(artefacts.rackReservationIds ?? []), ...ids.rackReservationIds])]; }
    moveReservations(mockDbStore, plan.id, 'Committed', { changeRequestId: artefacts.changeRequestId ?? artefacts.changeRequestIds?.[0], at: now() });
  });

  // 7. Delivery's records for the plan: the project, its purchase orders, work orders with their change requests, permits and documents.
  await x.step('delivery-refs', () => {
    const d = deliveryFor(plan.plnId);
    if (!d) throw new Error(`Delivery has no project for ${plan.plnId}; it appears once the plan is approved. Resume to retry.`);
    artefacts.deliveryProjectId = d.projectId;
    artefacts.purchaseOrderIds = d.purchaseOrders.map(o => o.id);
    artefacts.workOrderIds = d.workOrders.map(w => w.id);
    artefacts.changeRequestIds = [...new Set([...(artefacts.changeRequestIds ?? []), ...d.workOrders.map(w => w.changeId)])];
    artefacts.permitIds = d.permits.map(p => p.id);
    artefacts.designDocIds = d.docs.map(doc => doc.id);
  });

  const ok = errors.length === 0;
  if (ok) artefacts.completedAt = now();
  artefacts.runs = [...(artefacts.runs ?? []), { executionId: artefacts.executionId!, at: now(), by: env.actor, ok, failed: errors.map(e => e.step) }];
  const phases = ok ? plan.phases.map(p => (p.status === 'Planned' || p.status === 'Approved' ? { ...p, status: 'In delivery' as const } : p)) : plan.phases;
  db.update('plannerPlans', plan.id, { ...x.planPatch, phases, status: ok ? 'Executing' : plan.status, artefacts, updatedAt: now(), updatedBy: env.actor } as Record<string, unknown>);
  for (const [k, s] of Object.entries(artefacts.steps)) if (s === 'failed') env.audit('Plan', plan.id, 'execution step failed', `${STEP_LABEL[k] ?? k}: ${errors.find(e => e.step === k)?.message ?? 'failed'}`);
  const a = artefacts.sourcing;
  env.audit('Plan', plan.id, ok ? 'executed' : 'execution failed', ok
    ? `Plan ${plan.plnId} handed to Delivery as ${prj} from the approved baseline (${fmtUsd(budget)}): ${bom.lines.length} BOM lines${a ? ` (${a.siteQty} from the site, ${a.stockQty} from stock, ${a.buyQty} to buy)` : ''}, ${artefacts.purchaseOrderIds.length} purchase orders and ${artefacts.workOrderIds?.length ?? 0} work orders in Delivery, ${artefacts.reservedDeviceIds?.length ?? 0} stock units and ${artefacts.reservedRackIds?.length ?? 0} rack positions held, ${artefacts.subnetIds.length} subnets, ${artefacts.reservationIds?.length ?? 0} capacity holds committed`
    : `Execution of ${plan.plnId} stopped at ${errors.map(e => STEP_LABEL[e.step] ?? e.step).join(', ')}: ${errors.map(e => e.message).join('; ')}. Steps done are kept; resume to continue.`);
  return { ok, artefacts, errors, warnings };
}
