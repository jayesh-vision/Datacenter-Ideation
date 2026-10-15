/* Planner data layer — reads the planner collections (and the estate records the AI is
   grounded on) from MockDB through react-query, and exposes mutations that write through
   so every DCOS screen sees the same records.

   Every mutation is audited with a field-level diff (who, when, old → new, source). Plan
   lifecycle rules live in governance.ts (pure); this file applies them to the store. */
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '../compat/query';
import { useEntityList, useEntityDetail } from '../compat/useEntityCRUD';
import { useAuth } from '../compat/auth';
import { message } from '../compat/notify';
import { db } from '../compat/db';
import type * as T from '../p2b/types';
import { deliveryFor, deliveryHandover, type DeliveryRef } from '../compat/delivery/handoff';
import { evaluate, fmtUsd, type EstateActuals, type Evaluation } from './engine';
import { estateActuals } from './ai';
import { sourceBom, type SourcingContext } from './sourcing';
import { buildBom } from './outputs';
import { mockDbStore, nextId, runExecution } from './execute';
import { emptyPlannerData, plannerDataFromSnapshot, usePlannerData, type PlannerData } from './plannerData';
import { closeoutChecks, closeoutReady } from './closeout';
import type { RecordChanges } from './replaceClose';
import { recordedVendorOrders, type VendorOrderRecord } from './packModel';
import type { VendorOrder } from './sourcing';
import * as G from './governance';
import { moveReservations } from './reservations';
import { clockMs } from '../compat/clock';

const BIG = { pageSize: 5000 } as const;
export const PLANNER_ENTITIES = ['plannerTemplates', 'plannerBenchmarks', 'plannerPlans', 'plannerScenarios', 'plannerFeedback', 'approvalDelegations', 'auditEvents', 'capacityReservations', 'rackReservations'] as const;
/** Collections execution writes to (invalidated afterwards). Delivery owns the project, its orders, work orders and changes. */
export const EXECUTION_COLLECTIONS = ['boms', 'bomLines', 'subnets', 'vlans', 'ipAddresses', 'changeRequests', 'maintenanceWindows', 'capacityReservations', 'rackReservations', 'devices', 'racks', 'halls', 'rows', 'buildings', 'floors', 'dataCenters', 'circuits', 'circuitTerminations', 'atps', 'atpSteps', 'configChanges', 'disposalCertificates', 'powerFeeds', 'pdus', 'cables', 'edgeLocations'] as const;
const now = () => new Date(clockMs()).toISOString();
const sid = (p: string) => `${p}-${clockMs().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e3).toString(36).toUpperCase()}`;
/** Tenant of every record. The signed-in user carries an operator, not a customer id, so the platform tenant is used. */
export const TENANT_ID = 'CUST-001';

export const useTemplates = () => (useEntityList('plannerTemplates', BIG).data?.data ?? []) as unknown as T.PlannerTemplate[];
export const useBenchmarks = () => (useEntityList('plannerBenchmarks', BIG).data?.data ?? []) as unknown as T.PlannerBenchmark[];
const EMPTY: never[] = [];
export const usePlans = () => { const data = useEntityList('plannerPlans', BIG).data?.data; return useMemo(() => ((data ?? EMPTY) as unknown as T.PlannerPlan[]).filter(p => !p.isDeleted), [data]); };
export const usePlan = (id?: string) => { const p = (useEntityDetail('plannerPlans', id).data ?? undefined) as unknown as T.PlannerPlan | undefined; return p?.isDeleted ? undefined : p; };
export const useScenarios = (planId?: string) => { const data = useEntityList('plannerScenarios', BIG).data?.data; return useMemo(() => { const all = (data ?? EMPTY) as unknown as T.PlannerScenario[]; return planId ? all.filter(s => s.planId === planId) : all; }, [data, planId]); };
export const useFeedback = () => (useEntityList('plannerFeedback', BIG).data?.data ?? []) as unknown as T.PlannerFeedback[];
export const useDelegations = () => { const data = useEntityList('approvalDelegations', BIG).data?.data; return useMemo(() => ((data ?? EMPTY) as unknown as T.ApprovalDelegation[]).filter(d => !d.isDeleted), [data]); };
/** Audit events of one plan, newest first. */
export const usePlanAudit = (planId?: string) => { const data = useEntityList('auditEvents', { pageSize: 100000 }).data?.data; return useMemo(() => ((data ?? EMPTY) as unknown as T.AuditEvent[]).filter(e => planId && (e.plannerPlanId === planId || (e.entityType === 'Plan' && e.entityId === planId))).sort((a, b) => b.timestamp.localeCompare(a.timestamp)), [data, planId]); };

/** Estate records the engine and the AI are grounded on. */
export function useEstate() {
  const dataCenters = useEntityList('dataCenters', BIG).data?.data;
  const campuses = useEntityList('campuses', BIG).data?.data;
  const regions = useEntityList('regions', BIG).data?.data;
  const halls = useEntityList('halls', BIG).data?.data;
  const racks = useEntityList('racks', BIG).data?.data;
  const coolingZones = useEntityList('coolingZones', BIG).data?.data;
  const programs = useEntityList('programs', BIG).data?.data;
  const projects = useEntityList('projects', BIG).data?.data;
  const risks = useEntityList('risks', BIG).data?.data;
  return useMemo(() => ({
    dataCenters: (dataCenters ?? EMPTY) as unknown as T.DataCenter[], campuses: (campuses ?? EMPTY) as unknown as T.Campus[], regions: (regions ?? EMPTY) as unknown as T.Region[], halls: (halls ?? EMPTY) as unknown as T.Hall[], racks: (racks ?? EMPTY) as unknown as T.Rack[],
    coolingZones: (coolingZones ?? EMPTY) as unknown as T.CoolingZone[], programs: (programs ?? EMPTY) as unknown as T.Program[], projects: (projects ?? EMPTY) as unknown as T.Project[], risks: (risks ?? EMPTY) as unknown as T.RiskItem[],
  }), [dataCenters, campuses, regions, halls, racks, coolingZones, programs, projects, risks]);
}
export type Estate = ReturnType<typeof useEstate>;

/** Everything sourcing needs: stock devices, vendors and contracts, catalogue models, racks and site plant. */
export function useSourcingContext(): SourcingContext {
  const devices = useEntityList('devices', { pageSize: 20000 }).data?.data;
  const vendors = useEntityList('vendors', BIG).data?.data;
  const contracts = useEntityList('contracts', BIG).data?.data;
  const assetModels = useEntityList('assetModels', BIG).data?.data;
  const racks = useEntityList('racks', BIG).data?.data;
  const upsUnits = useEntityList('upsUnits', BIG).data?.data;
  const coolingZones = useEntityList('coolingZones', BIG).data?.data;
  const dataCenters = useEntityList('dataCenters', BIG).data?.data;
  return useMemo(() => ({ devices: (devices ?? EMPTY) as unknown as T.Device[], vendors: (vendors ?? EMPTY) as unknown as T.Vendor[], contracts: (contracts ?? EMPTY) as unknown as T.Contract[], assetModels: (assetModels ?? EMPTY) as unknown as T.AssetModel[], racks: (racks ?? EMPTY) as unknown as T.Rack[], upsUnits: (upsUnits ?? EMPTY) as unknown as T.UPS[], coolingZones: (coolingZones ?? EMPTY) as unknown as T.CoolingZone[], dataCenters: (dataCenters ?? EMPTY) as unknown as T.DataCenter[] }), [devices, vendors, contracts, assetModels, racks, upsUnits, coolingZones, dataCenters]);
}
/** The same context read from the store as it is now (for actions: execution sources against today's stock, not a rendered copy). */
export function storeSourcing(): SourcingContext {
  const all = <R,>(e: string) => (db.entities().includes(e) ? db.getAllRaw(e).filter(r => !(r as { isDeleted?: boolean }).isDeleted) : []) as unknown as R[];
  const snap: Record<string, unknown> = {}; for (const e of db.entities()) snap[e] = db.getAllRaw(e);
  return { devices: all('devices'), vendors: all('vendors'), contracts: all('contracts'), assetModels: all('assetModels'), racks: all('racks'), upsUnits: all('upsUnits'), coolingZones: all('coolingZones'), dataCenters: all('dataCenters'), data: plannerDataFromSnapshot(snap) };
}

/** The vendor orders execution recorded on the plan's bill of materials (what Delivery raised as purchase orders); undefined before. */
export function useRecordedOrders(plan?: T.PlannerPlan): VendorOrder[] | undefined {
  const boms = useEntityList('boms', BIG).data?.data;
  const bomId = plan?.artefacts?.bomId;
  return useMemo(() => { const b = bomId ? ((boms ?? EMPTY) as unknown as { id: string; vendorOrders?: VendorOrderRecord[] }[]).find(x => x.id === bomId) : undefined; return Array.isArray(b?.vendorOrders) ? recordedVendorOrders(b.vendorOrders) : undefined; }, [boms, bomId]);
}

/** Delivery's view of a plan (project, purchase orders, work orders and their change requests, commissioning, permits); re-read on
 *  every planner or Delivery change. Null until the plan is in Delivery. */
export function useDelivery(plnId?: string): DeliveryRef | null {
  return useQuery({ queryKey: ['delivery', plnId], queryFn: () => (plnId ? deliveryFor(plnId) : null), enabled: !!plnId }).data ?? null;
}

export function useActuals(dcTypeKey?: string): EstateActuals {
  const e = useEstate();
  return useMemo(() => (dcTypeKey ? estateActuals(dcTypeKey, e) : { sampleSites: 0 }), [dcTypeKey, e]);
}

/** Full evaluation of a plan (base case) plus one evaluation per scenario, the one under review and the approved baseline. */
export function usePlanEvaluation(plan?: T.PlannerPlan) {
  const templates = useTemplates(); const benchmarks = useBenchmarks(); const scenarios = useScenarios(plan?.id); const actuals = useActuals(plan?.dcTypeKey);
  const data = usePlannerData();
  return useMemo(() => {
    if (!plan || !templates.length) return { base: undefined as Evaluation | undefined, scenarios: [] as { scenario: T.PlannerScenario; ev: Evaluation }[], preferred: undefined as Evaluation | undefined, review: undefined as { scenario: T.PlannerScenario | null; ev: Evaluation } | undefined, approved: undefined as Evaluation | undefined, actuals, templates, benchmarks, data };
    const base = evaluate(plan, null, templates, benchmarks, actuals, data);
    const scs = scenarios.map(s => ({ scenario: s, ev: evaluate(plan, s, templates, benchmarks, actuals, data) }));
    const preferred = scs.find(s => s.scenario.id === plan.preferredScenarioId)?.ev ?? base;
    const reviewId = plan.reviewScenarioId ?? plan.preferredScenarioId;
    const rs = scs.find(s => s.scenario.id === reviewId);
    const review = rs ? { scenario: rs.scenario as T.PlannerScenario | null, ev: rs.ev } : { scenario: null, ev: base };
    const bs = G.baselineScenario(plan);
    const approved = bs ? evaluate(plan, bs, templates, benchmarks, actuals, data) : undefined;
    return { base, scenarios: scs, preferred, review, approved, actuals, templates, benchmarks, data };
  }, [plan, templates, benchmarks, scenarios, actuals, data]);
}

/** Evaluate an unsaved draft (wizard) without touching the store. */
export function useDraftEvaluation(draft?: T.PlannerPlan, overrides?: Record<string, number | string | boolean>) {
  const templates = useTemplates(); const benchmarks = useBenchmarks(); const actuals = useActuals(draft?.dcTypeKey);
  const data = usePlannerData();
  return useMemo(() => (draft && templates.length ? evaluate(draft, overrides ? { id: 'draft', scnId: 'draft', planId: draft.id, name: 'Draft', description: '', overrides, preferred: false } as T.PlannerScenario : null, templates, benchmarks, actuals, data) : undefined), [draft, overrides, templates, benchmarks, actuals, data]);
}

/** A new, unsaved plan with the next sequential id (checked again when it is first saved). */
export function newPlanDraft(partial: Partial<T.PlannerPlan>, owner: string | { id?: string; name: string }): T.PlannerPlan {
  const o = typeof owner === 'string' ? { name: owner, id: undefined } : owner;
  const id = nextId('plannerPlans', 'PLN');
  return {
    id, plnId: id, customerId: TENANT_ID, isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: o.name, createdById: o.id ?? 'unknown',
    title: '', scope: 'new-dc', status: 'Draft', templateId: '', dcTypeKey: 'hyperscale-dc', climate: 'temperate', intent: '', ownerName: o.name, requestedBy: o.name,
    designPowerKw: 0, targetGoLive: new Date(clockMs() + 365 * 864e5).toISOString(), demand: { gpuPct: 20, computePct: 60, storagePct: 20, densityKwPerRack: 12, tenancy: 'single', growthPctPerYear: 15 },
    phases: [], params: {}, paramSources: {}, risks: [], permits: [], approvals: [], wizardStep: 1, wizardStepKey: 'type', aiAssisted: false, revision: 'A', ...partial,
  } as T.PlannerPlan;
}

export type ActionResult<R = undefined> = { ok: true; value?: R; notes?: string[] } | { ok: false; reason: string };
const getPlan = (id: string) => db.getById('plannerPlans', id) as unknown as T.PlannerPlan | undefined;
/** Fields that stay editable during delivery: the living risk register and permit status. */
const LIVING_FIELDS: (keyof T.PlannerPlan)[] = ['risks', 'permits'];

export function usePlannerActions() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const actor = user?.name ?? 'Planner';
  const actorId = user?.id;
  const templatesAll = useTemplates();
  const benchmarksAll = useBenchmarks();
  const invalidate = useCallback(() => { for (const k of PLANNER_ENTITIES) void qc.invalidateQueries({ queryKey: [k] }); void qc.invalidateQueries({ queryKey: ['delivery'] }); }, [qc]);
  const meta = useCallback(() => ({ customerId: TENANT_ID, isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: actor, createdById: actorId ?? 'unknown' }), [actor, actorId]);

  /** Audit event with a field-level diff, tied to the plan so the History tab can read it. */
  const log = useCallback((entityType: string, entityId: string, action: string, summary: string, extra: { changes?: T.AuditChange[]; reason?: string; planId?: string } = {}) => {
    const id = nextId('auditEvents', 'AUD'); const t = now();
    db.create('auditEvents', { id, audId: id, entityType, entityId, action, actorName: actor, actorId, timestamp: t, summary, changes: extra.changes, reason: extra.reason, plannerPlanId: extra.planId ?? (entityType === 'Plan' ? entityId : undefined), ...meta() });
    void qc.invalidateQueries({ queryKey: ['auditEvents'] });
  }, [actor, actorId, meta, qc]);
  const refuse = useCallback((reason: string): { ok: false; reason: string } => { message.warning(reason); return { ok: false, reason }; }, [message]);
  const update = useCallback((id: string, patch: Partial<T.PlannerPlan>) => { db.update('plannerPlans', id, { ...patch, updatedAt: now(), updatedBy: actor } as Record<string, unknown>); }, [actor]);
  const scenarioPlan = (scenarioId: string) => { const s = db.getById('plannerScenarios', scenarioId) as unknown as T.PlannerScenario | undefined; return s ? getPlan(s.planId) : undefined; };

  return useMemo(() => ({
    actor, actorId,
    /* ----------------------------------------------------------------- wizard */
    /**
     * Save from the wizard: only wizard-owned fields, and only if nobody changed the plan since it
     * was loaded (`base`). Creates the record on the first save. Never writes status or approvals.
     */
    saveWizard(base: T.PlannerPlan | undefined, local: T.PlannerPlan): ActionResult<T.PlannerPlan> {
      let server = getPlan(local.id);
      if (!base && server) {
        // The id was taken by another draft since this one was opened: take the next one.
        const id = nextId('plannerPlans', 'PLN'); local = { ...local, id, plnId: id }; server = undefined;
      }
      if (!server) {
        if (!local.templateId || !local.title.trim()) return refuse('Pick a plan type and give the plan a name before saving.');
        const rec = { ...local, status: 'Draft' as const, approvals: [], customerId: TENANT_ID, createdAt: now(), updatedAt: now(), createdBy: actor, createdById: actorId ?? 'unknown', updatedBy: actor };
        db.create('plannerPlans', rec as unknown as Record<string, unknown>);
        log('Plan', rec.id, 'created', `Created plan ${rec.plnId} ${rec.title}${rec.revisionOf ? ` (revision ${rec.revision} of ${rec.revisionOf})` : ''}`);
        invalidate(); return { ok: true, value: rec };
      }
      const conflict = G.wizardConflict(base, server);
      if (conflict) return refuse(conflict);
      if (!G.isEditable(server)) return refuse(G.lockReason(server) ?? 'The plan cannot be edited.');
      const patch = G.wizardPatch(base ?? server, local);
      if (!Object.keys(patch).length) return { ok: true, value: server };
      const changes = G.diffPlan(server, patch);
      update(server.id, patch);
      if (changes.length) log('Plan', server.id, 'edited', `Edited in the wizard: ${G.changesText(changes)}`, { changes });
      invalidate(); return { ok: true, value: getPlan(server.id)! };
    },
    /** Patch a plan outside the wizard (detail tabs). Locked plans accept only the living fields (risks, permits). */
    patchPlan(id: string, patch: Partial<T.PlannerPlan>): ActionResult {
      const cur = getPlan(id); if (!cur) return refuse('Plan not found.');
      const keys = Object.keys(patch) as (keyof T.PlannerPlan)[];
      if (!G.isEditable(cur) && keys.some(k => !LIVING_FIELDS.includes(k))) return refuse(G.lockReason(cur) ?? 'The plan is read-only.');
      const changes = G.diffPlan(cur, patch).concat(keys.filter(k => LIVING_FIELDS.includes(k)).map(k => ({ field: k, from: `${(cur[k] as unknown[] | undefined)?.length ?? 0} items`, to: `${(patch[k] as unknown[] | undefined)?.length ?? 0} items` })));
      update(id, patch);
      log('Plan', id, 'edited', `Changed ${keys.join(', ')}${changes.length ? `: ${G.changesText(changes)}` : ''}`, { changes });
      invalidate(); return { ok: true };
    },
    setParam(plan: T.PlannerPlan, key: string, value: number | string | boolean, source: T.PlannerParamSource = 'user'): ActionResult {
      const cur = getPlan(plan.id) ?? plan;
      if (!G.isEditable(cur)) return refuse(G.lockReason(cur) ?? 'The plan is read-only.');
      const patch = { params: { ...cur.params, [key]: value }, paramSources: { ...cur.paramSources, [key]: source } };
      const changes = G.diffPlan(cur, patch);
      update(plan.id, patch);
      log('Plan', plan.id, 'parameter changed', `Parameter ${key}: ${String(cur.params[key] ?? 'template default')} → ${String(value)} (${source})`, { changes });
      invalidate(); return { ok: true };
    },
    /* ----------------------------------------------------------------- scenarios */
    createScenario(planId: string, name: string, description: string, overrides: Record<string, number | string | boolean>) {
      const id = sid('SCN'); const rec: T.PlannerScenario = { id, scnId: id, ...meta(), planId, name, description, overrides, preferred: false };
      db.create('plannerScenarios', rec as unknown as Record<string, unknown>);
      log('Scenario', id, 'created', `Scenario ${name} created with ${Object.keys(overrides).length} override(s)`, { planId, changes: Object.entries(overrides).map(([k, v]) => ({ field: `override ${k}`, to: v })) });
      invalidate(); return rec;
    },
    updateScenario(id: string, patch: Partial<T.PlannerScenario>): ActionResult {
      const cur = db.getById('plannerScenarios', id) as unknown as T.PlannerScenario | undefined; const plan = scenarioPlan(id);
      if (!cur) return refuse('Scenario not found.');
      if (plan && !G.isEditable(plan) && (plan.reviewScenarioId === id || plan.approvedScenarioId === id)) return refuse(`This scenario is the one ${plan.status === 'In review' ? 'under review' : 'that was approved'}; it cannot change. Clone it instead.`);
      db.update('plannerScenarios', id, { ...patch, updatedAt: now() } as Record<string, unknown>);
      const before = cur.overrides ?? {}; const after = patch.overrides ?? before;
      const changes = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(k => before[k] !== after[k]).map(k => ({ field: `override ${k}`, from: before[k], to: after[k] }));
      log('Scenario', id, 'edited', `Scenario ${patch.name ?? cur.name} edited${changes.length ? `: ${G.changesText(changes)}` : ''}`, { planId: cur.planId, changes });
      invalidate(); return { ok: true };
    },
    deleteScenario(id: string): ActionResult {
      const cur = db.getById('plannerScenarios', id) as unknown as T.PlannerScenario | undefined; const plan = scenarioPlan(id);
      if (plan && (plan.reviewScenarioId === id || plan.approvedScenarioId === id) && !G.isEditable(plan)) return refuse('The scenario under review or approved cannot be deleted.');
      db.delete('plannerScenarios', id);
      if (cur) log('Scenario', id, 'deleted', `Scenario ${cur.name} deleted`, { planId: cur.planId });
      invalidate(); return { ok: true };
    },
    preferScenario(plan: T.PlannerPlan, scenarioId: string | undefined): ActionResult {
      const cur = getPlan(plan.id) ?? plan;
      if (!G.isEditable(cur)) return refuse(`The preferred scenario cannot change while the plan is ${cur.status.toLowerCase()}: approvers decide on the scenario they were shown.`);
      for (const s of db.getAll('plannerScenarios', { pageSize: 5000 }).data as unknown as T.PlannerScenario[]) if (s.planId === plan.id) db.update('plannerScenarios', s.id, { preferred: s.id === scenarioId });
      db.update('plannerPlans', plan.id, { preferredScenarioId: scenarioId, updatedAt: now() });
      log('Plan', plan.id, 'scenario preferred', `Preferred scenario: ${cur.preferredScenarioId ?? 'base case'} → ${scenarioId ?? 'base case'}`, { changes: [{ field: 'preferredScenarioId', from: cur.preferredScenarioId ?? 'base', to: scenarioId ?? 'base' }] });
      invalidate(); return { ok: true };
    },
    recordFeedback(capability: string, planId: string, accepted: boolean, note?: string) { const id = sid('FB'); db.create('plannerFeedback', { id, fbId: id, ...meta(), capability, planId, accepted, note, at: now() } as Record<string, unknown>); invalidate(); },
    /* ----------------------------------------------------------------- approval */
    /** Submit (or resubmit): a new approval round built from the template path and the amount of the scenario under review. */
    submitForReview(plan: T.PlannerPlan, review: { ev: Evaluation; scenario: T.PlannerScenario | null }): ActionResult {
      const cur = getPlan(plan.id) ?? plan;
      if (review.ev.hardFails > 0) return refuse(`${review.ev.hardFails} hard rule(s) fail; fix them before submitting.`);
      const template = templatesAll.find(t => t.id === cur.templateId);
      const amt = G.approvalAmount(review.ev);
      const r = G.startRound(cur, template, { scenarioId: review.scenario?.id, scenarioName: review.scenario?.name, amountUsd: amt.amountUsd, itUsd: amt.itUsd }, actor, now());
      if (!r.ok) return refuse(r.reason);
      update(cur.id, r.patch);
      log('Plan', cur.id, cur.status === 'Rejected' ? 'resubmitted' : 'submitted', `Submitted for review (${r.note}); routed on ${fmtUsd(amt.amountUsd)} from ${review.scenario?.name ?? 'the base case'}, band ${r.patch.approvalBand}`, { changes: [{ field: 'status', from: cur.status, to: 'In review' }] });
      invalidate(); return { ok: true, notes: [r.note ?? ''] };
    },
    withdraw(plan: T.PlannerPlan, reason: string): ActionResult {
      const cur = getPlan(plan.id) ?? plan;
      const r = G.withdrawRound(cur, now()); if (!r.ok) return refuse(r.reason);
      update(cur.id, r.patch);
      log('Plan', cur.id, 'withdrawn', `Withdrawn from review${reason ? `: ${reason}` : ''}`, { reason, changes: [{ field: 'status', from: cur.status, to: 'Draft' }] });
      invalidate(); return { ok: true };
    },
    /** Decide one step. On the final approval the baseline is frozen and the capacity holds are written. */
    decide(plan: T.PlannerPlan, step: string, input: G.DecisionInput, review: { ev: Evaluation; scenario: T.PlannerScenario | null; data: PlannerData; sourcing?: SourcingContext }, delegations: T.ApprovalDelegation[]): ActionResult {
      const cur = getPlan(plan.id) ?? plan; const t = now();
      if (!review.data.ready) return refuse('Platform data is still loading; the capacity holds cannot be checked yet. Try again in a moment.');
      const r = G.applyDecision(cur, step, input, { id: actorId, name: actor }, delegations, t);
      if (!r.ok) return refuse(r.reason);
      const d = r.patch;
      update(cur.id, d.patch);
      log('Plan', cur.id, `decision: ${input.decision}`, `${step} (${d.approval.role}): ${input.decision}${d.approval.onBehalfOf ? ` on behalf of ${d.approval.onBehalfOf}` : ''}${input.reason ? ` · ${input.reason}` : ''}${d.newConditions.length ? ` · ${d.newConditions.length} condition(s)` : ''}`, { reason: input.reason, changes: [{ field: `approval ${step}`, from: 'Pending', to: input.decision }, ...d.newConditions.map(c => ({ field: `condition ${c.id}`, to: `${c.text} (owner ${c.owner}, due ${c.dueDate?.slice(0, 10)})` }))] });
      const notes: string[] = [];
      if (d.finalApproved) {
        const after = { ...cur, ...d.patch } as T.PlannerPlan;
        const template = templatesAll.find(x => x.id === cur.templateId);
        const bom = buildBom(after, review.ev, benchmarksAll);
        const sourced = review.sourcing ? sourceBom(after, review.ev, bom, review.sourcing) : undefined;
        const fx = G.onFinalApproval(mockDbStore, { plan: after, ev: review.ev, scenario: review.scenario, template, benchmarks: benchmarksAll, data: review.data, bomTotal: bom.total, sourcedTotal: sourced?.total, buyTotal: sourced?.buyTotal, actor, meta: meta(), at: t });
        update(cur.id, fx.patch);
        if (fx.previous) { update(fx.previous.id, fx.previous.patch); log('Plan', fx.previous.id, 'superseded', `Superseded by revision ${after.revision} (${after.plnId})`); }
        log('Plan', cur.id, 'approved', `Final approval. ${fx.notes.join(' ')}`, { changes: [{ field: 'status', from: 'In review', to: fx.patch.status ?? 'Approved' }, { field: 'baseline', to: fmtUsd(fx.patch.baseline!.capexTotal) }] });
        notes.push(...fx.notes);
      }
      if (d.rejected) log('Plan', cur.id, 'rejected', `Rejected at ${step}: ${input.reason}`, { reason: input.reason });
      for (const k of ['capacityReservations', 'rackReservations']) void qc.invalidateQueries({ queryKey: [k] });
      invalidate(); return { ok: true, notes };
    },
    closeCondition(plan: T.PlannerPlan, conditionId: string, evidence: string): ActionResult {
      const cur = getPlan(plan.id) ?? plan;
      const r = G.closeCondition(cur, conditionId, evidence, actor, now()); if (!r.ok) return refuse(r.reason);
      update(cur.id, r.patch);
      log('Plan', cur.id, 'condition closed', `Condition ${conditionId} closed: ${evidence}`, { changes: [{ field: `condition ${conditionId}`, from: 'Open', to: 'Closed' }] });
      invalidate(); return { ok: true };
    },
    createDelegation(d: { toName: string; role: string; startDate: string; endDate: string; reason?: string }): ActionResult {
      const rec = { fromName: actor, fromId: actorId, ...d };
      const bad = G.validateDelegation(rec); if (bad) return refuse(bad);
      const id = nextId('approvalDelegations', 'DLG');
      db.create('approvalDelegations', { id, dlgId: id, ...meta(), ...rec, toId: G.ALL_PEOPLE.find(p => p.name === d.toName)?.id, status: 'Active' });
      log('Delegation', id, 'created', `${actor} delegated ${G.roleOf(d.role)} approvals to ${d.toName} from ${d.startDate.slice(0, 10)} to ${d.endDate.slice(0, 10)}${d.reason ? ` (${d.reason})` : ''}`);
      invalidate(); return { ok: true };
    },
    revokeDelegation(id: string): ActionResult {
      db.update('approvalDelegations', id, { status: 'Revoked', updatedAt: now() });
      log('Delegation', id, 'revoked', `Delegation ${id} revoked by ${actor}`);
      invalidate(); return { ok: true };
    },
    /* ----------------------------------------------------------------- lifecycle */
    hold(plan: T.PlannerPlan, reason: string): ActionResult {
      const cur = getPlan(plan.id) ?? plan; const r = G.holdPlan(cur, reason, actor, now()); if (!r.ok) return refuse(r.reason);
      update(cur.id, r.patch); log('Plan', cur.id, 'on hold', `Put on hold: ${reason}`, { reason, changes: [{ field: 'status', from: cur.status, to: 'On hold' }] }); invalidate(); return { ok: true };
    },
    resume(plan: T.PlannerPlan): ActionResult {
      const cur = getPlan(plan.id) ?? plan; const r = G.resumePlan(cur); if (!r.ok) return refuse(r.reason);
      update(cur.id, r.patch); log('Plan', cur.id, 'resumed', `Resumed to ${r.patch.status}`, { changes: [{ field: 'status', from: 'On hold', to: r.patch.status }] }); invalidate(); return { ok: true };
    },
    cancel(plan: T.PlannerPlan, reason: string): ActionResult {
      const cur = getPlan(plan.id) ?? plan; const t = now(); const r = G.cancelPlan(cur, reason, actor, t); if (!r.ok) return refuse(r.reason);
      const n = moveReservations(mockDbStore, cur.id, 'Released', { reason: `plan cancelled: ${reason}`, at: t });
      update(cur.id, r.patch);
      log('Plan', cur.id, 'cancelled', `Cancelled: ${reason}. ${n} capacity hold(s) released.${cur.status === 'Executing' && deliveryFor(cur.plnId) ? ` Project ${deliveryFor(cur.plnId)!.projectId} must be stopped in Delivery.` : ''}`, { reason, changes: [{ field: 'status', from: cur.status, to: 'Cancelled' }] });
      for (const k of ['capacityReservations', 'rackReservations']) void qc.invalidateQueries({ queryKey: [k] });
      invalidate(); return { ok: true };
    },
    /** Soft delete of a draft (kept in the store with isDeleted for the audit trail). */
    deletePlan(plan: T.PlannerPlan): ActionResult {
      const cur = getPlan(plan.id) ?? plan; if (!G.canDelete(cur)) return refuse('Only a draft that was never executed can be deleted. Cancel it instead.');
      update(cur.id, { isDeleted: true } as Partial<T.PlannerPlan>); log('Plan', cur.id, 'deleted', `Draft ${cur.plnId} ${cur.title} deleted`); invalidate(); return { ok: true };
    },
    /** Raise the next revision of an approved or executing plan: a Draft copy with its own approval round. */
    raiseRevision(plan: T.PlannerPlan): ActionResult<T.PlannerPlan> {
      const cur = getPlan(plan.id) ?? plan;
      const scn = cur.approvedScenarioId ? (db.getById('plannerScenarios', cur.approvedScenarioId) as unknown as T.PlannerScenario | undefined) : undefined;
      const all = db.getAll('plannerPlans', { pageSize: 100000 }).data as unknown as T.PlannerPlan[];
      const r = G.revisionDraft(cur, all, scn?.overrides ?? {}, { id: actorId, name: actor }, now()); if (!r.ok) return refuse(r.reason);
      const rec = { ...r.patch, customerId: TENANT_ID, updatedBy: actor };
      db.create('plannerPlans', rec as unknown as Record<string, unknown>);
      log('Plan', rec.id, 'revision raised', `Revision ${rec.revision} of ${cur.plnId} raised as a draft`, { planId: rec.id });
      log('Plan', cur.id, 'revision raised', `Revision ${rec.revision} (${rec.plnId}) raised; this plan stays ${cur.status.toLowerCase()} until the revision is approved`);
      invalidate(); return { ok: true, value: rec };
    },
    /** The sourcing context as the store holds it now (stock, vendors, contracts); pass it to `execute`. */
    sourcing: storeSourcing,
    /** Approved plan → handed to Delivery (see execute.ts). Resumes an earlier run that stopped part-way. Without a sourcing context the
     *  store's current one is used, so the bill of materials is always split into site / stock / buy. */
    async execute(plan: T.PlannerPlan, sourcing: SourcingContext | undefined, data: PlannerData | undefined, scenarios?: T.PlannerScenario[]) {
      const cur = getPlan(plan.id) ?? plan;
      const res = await runExecution({ actor, actorId, customerId: TENANT_ID, templates: templatesAll, benchmarks: benchmarksAll, data: data ?? emptyPlannerData(), scenarios, audit: (e, id, a, s) => log(e, id, a, s) }, cur, undefined, sourcing ?? storeSourcing());
      for (const k of EXECUTION_COLLECTIONS) void qc.invalidateQueries({ queryKey: [k] });
      invalidate(); return res;
    },
    /** Completion = the handover to operations. When Delivery is ready (every check green), the handover is signed in Delivery, which
     *  completes the plan (closeout.completeFromHandover through the bridge). A plan Delivery has no project for cannot complete. */
    complete(plan: T.PlannerPlan, data: PlannerData, notes?: string): ActionResult {
      const cur = getPlan(plan.id) ?? plan; const template = templatesAll.find(t => t.id === cur.templateId);
      const checks = closeoutChecks(cur, data, template);
      if (!closeoutReady(checks)) return refuse(`Not ready to complete: ${checks.filter(c => !c.ok && !c.atHandover).map(c => c.label).join(', ')}.`);
      const d = deliveryFor(cur.plnId);
      if (d && !d.handedOver) { try { deliveryHandover(cur.plnId, actor, notes); } catch (e) { return refuse((e as Error).message); } }
      else { const r = G.completePlan(mockDbStore, cur, data, template, actor, now(), notes); if (!r.ok) return refuse(r.reason); update(cur.id, r.patch); log('Plan', cur.id, 'completed', `Completed: ${r.patch.closeout!.deliveredKw} kW delivered; holds consumed`, { changes: [{ field: 'status', from: cur.status, to: 'Completed' }] }); }
      for (const k of ['capacityReservations', 'rackReservations', 'delivery']) void qc.invalidateQueries({ queryKey: [k] });
      invalidate(); return { ok: true };
    },
    /** Apply the record changes a wave close, a disposal certificate, the final meter reading or a site retirement produces
     *  (replaceClose / migrationCore): creates and updates through the store, the plan patch (waves, params, artefacts) and one audit
     *  event on the plan. These records follow the work, so unlike `patchPlan` this runs on an executing or completed plan. */
    applyRecordChanges(plan: T.PlannerPlan, changes: RecordChanges, what: string): ActionResult {
      const cur = getPlan(plan.id) ?? plan;
      if (cur.status !== 'Executing' && cur.status !== 'Completed') return refuse(`The plan is ${cur.status.toLowerCase()}: waves, certificates and the site retirement are recorded once the build has started.`);
      if (changes.errors.length) return refuse(changes.errors.join('; '));
      for (const c of changes.creates) db.create(c.entity, c.rec);
      for (const u of changes.updates) db.update(u.entity, u.id, u.patch);
      const diff = Object.keys(changes.plan).length ? G.diffPlan(cur, changes.plan) : [];
      if (Object.keys(changes.plan).length) update(cur.id, changes.plan);
      const counts = [changes.updates.length && `${changes.updates.length} record(s) updated`, changes.creates.length && `${changes.creates.length} created`].filter(Boolean).join(', ');
      const said = changes.summary.join('; ');
      log('Plan', cur.id, 'records updated', `${!said ? what : said.startsWith(what) ? said : `${what}: ${said}`}${counts ? ` (${counts})` : ''}`, { changes: diff });
      for (const k of [...EXECUTION_COLLECTIONS, 'managedDevices', 'services', 'contracts', 'disposalCertificates']) void qc.invalidateQueries({ queryKey: [k] });
      invalidate(); return { ok: true, notes: changes.warnings };
    },
    /* ----------------------------------------------------------------- library */
    /** Save a template. Content edits bump the version (plans keep the version they were approved against). */
    saveTemplate(t: T.PlannerTemplate): T.PlannerTemplate {
      const old = db.getById('plannerTemplates', t.id) as unknown as T.PlannerTemplate | undefined;
      if (!old) { const rec = { ...t, ...meta(), createdAt: t.createdAt ?? now() }; db.create('plannerTemplates', rec as unknown as Record<string, unknown>); log('Template', t.id, 'created', `Template ${t.name} v${t.version} created`); invalidate(); return rec; }
      const CONTENT: (keyof T.PlannerTemplate)[] = ['name', 'description', 'params', 'rules', 'requiredAspects', 'outputs', 'approvalPath', 'executesAs', 'blueprintKey', 'appliesTo', 'inheritsFrom', 'demand', 'items', 'scope', 'dcTypeKey'];
      const changed = CONTENT.filter(k => JSON.stringify(old[k] ?? null) !== JSON.stringify(t[k] ?? null));
      const version = changed.length ? (old.version ?? 1) + 1 : old.version;
      const rec = { ...t, version, updatedAt: now(), updatedBy: actor };
      db.update('plannerTemplates', t.id, rec as unknown as Record<string, unknown>);
      const paramChanges: T.AuditChange[] = changed.includes('params') ? t.params.filter(p => JSON.stringify(old.params.find(o => o.key === p.key)) !== JSON.stringify(p)).map(p => ({ field: `param ${p.key} default`, from: old.params.find(o => o.key === p.key)?.default, to: p.default })) : [];
      const changes: T.AuditChange[] = [...changed.filter(k => k !== 'params').map(k => ({ field: String(k), from: '…', to: '…' })), ...paramChanges, ...(old.status !== t.status ? [{ field: 'status', from: old.status, to: t.status }] : []), ...(version !== old.version ? [{ field: 'version', from: old.version, to: version }] : [])];
      if (changes.length) log('Template', t.id, changed.length ? 'template edited' : 'template status', `Template ${t.name}${changed.length ? ` v${old.version} → v${version}: ${changed.join(', ')} changed` : `: status ${old.status} → ${t.status}`}`, { changes });
      invalidate(); return rec;
    },
    cloneTemplate(t: T.PlannerTemplate, name: string) { const id = sid('TPL'); const rec: T.PlannerTemplate = { ...t, id, tplId: id, ...meta(), name, version: 1, status: 'draft', ownerName: actor, inheritsFrom: t.id, params: [], rules: [] }; db.create('plannerTemplates', rec as unknown as Record<string, unknown>); log('Template', id, 'created', `Template ${name} created from ${t.name} v${t.version}`); invalidate(); return rec; },
    /** Save a benchmark. Value edits bump its version and are audited old → new. */
    saveBenchmark(b: T.PlannerBenchmark) {
      const old = db.getById('plannerBenchmarks', b.id) as unknown as T.PlannerBenchmark | undefined;
      if (!old) { db.create('plannerBenchmarks', { ...b, version: 1, ...meta() } as unknown as Record<string, unknown>); log('Benchmark', b.id, 'created', `Benchmark ${b.label} created: ${b.value ?? `${b.low}–${b.high}`} ${b.unit} (${b.source})`); invalidate(); return; }
      const keys: (keyof T.PlannerBenchmark)[] = ['value', 'low', 'high', 'unit', 'source', 'sourceDate', 'indicative', 'appliesTo', 'label', 'metric', 'category'];
      const changes = keys.filter(k => JSON.stringify(old[k] ?? null) !== JSON.stringify(b[k] ?? null)).map(k => ({ field: String(k), from: typeof old[k] === 'object' ? JSON.stringify(old[k]) : old[k], to: typeof b[k] === 'object' ? JSON.stringify(b[k]) : b[k] }));
      const version = changes.length ? (old.version ?? 1) + 1 : (old.version ?? 1);
      db.update('plannerBenchmarks', b.id, { ...b, version, updatedAt: now(), updatedBy: actor } as unknown as Record<string, unknown>);
      if (changes.length) log('Benchmark', b.id, 'benchmark edited', `Benchmark ${b.label} v${old.version ?? 1} → v${version}: ${G.changesText(changes)}`, { changes });
      invalidate();
    },
    newId: sid,
  }), [actor, actorId, log, refuse, update, invalidate, meta, templatesAll, benchmarksAll, qc]);
}
