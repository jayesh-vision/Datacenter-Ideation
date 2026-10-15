/**
 * Seed · planner governance for the demo plans.
 *
 * Approvals follow each plan template's approval path (`approvalPath`), in order, with people from
 * the matching roles. The "Finance (by amount)" step is decided by the approval-limit band of the
 * plan's CapEx at submission: up to $50k the Capacity Planner, up to $250k the Finance Manager, up to
 * $1M the Facilities Director, above that the Executive. Plans that reached a decision carry the
 * current round in `approvals`; `approvalHistory` holds earlier rounds only (a resubmitted plan carries its first round).
 *
 * Approved, executing and completed plans get the template version they were approved against and
 * a baseline. The baseline figures here are a seed approximation from the plan's own parameters
 * (CapEx = design kW × CapEx per kW, plus IT when the operator owns it); the engine regenerates
 * them from a full evaluation once a plan is re-approved.
 *
 * The executing plan (PLN-0003, Dallas UPS and chiller expansion) is linked to the records a real
 * execution would have created or joined: the DC4 phase 2 plant project, its bill of materials and
 * purchase orders, the cut-in change request with its maintenance window, and the permits.
 *
 * No random draws: the two draws the plan list took for approvals are passed in and reused.
 */
import type * as T from '../../../planner/p2b/types';
import type * as E from '../../../planner/p2b/enums';
import { PEOPLE, type Person, type Seed } from './ctx';
import { metaAt } from './realism';
import { plannerMoney } from '../../../planner/compat/registry';

/** Approval-limit bands for the finance step (the approval DMN). */
export const APPROVAL_BANDS: { max: number; role: string; label: string }[] = [
  { max: 50_000, role: 'Capacity Planner', label: 'up to $50k' },
  { max: 250_000, role: 'Finance Manager', label: '$50k to $250k' },
  { max: 1_000_000, role: 'Facilities Director', label: '$250k to $1M' },
  { max: Number.POSITIVE_INFINITY, role: 'Executive', label: 'above $1M' },
];
/** Which job role decides each named step of a template's approval path. */
const STEP_ROLE: Record<string, string> = { 'Capacity planner': 'Capacity Planner', 'Facility manager': 'Facilities Director', 'Design authority': 'Facilities Director', 'Network architect': 'Network Engineer', 'Operations lead': 'NOC Lead', Executive: 'Executive' };
const FINANCE_STEP = /finance/i;
/* money in the geography's form (the app's registered formatter), short USD without one */
const usd = (n: number) => plannerMoney()?.(n) ?? (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1000)}k`);
const bandText = (b: { max: number }) => { const i = APPROVAL_BANDS.indexOf(b as typeof APPROVAL_BANDS[number]), lo = APPROVAL_BANDS[i - 1]?.max; return !Number.isFinite(b.max) ? `above ${usd(lo ?? 0)}` : lo === undefined ? `up to ${usd(b.max)}` : `${usd(lo)} to ${usd(b.max)}`; };

/** CapEx the approvers were asked to sign, from the plan's own parameters (seed approximation). */
export function approvalAmount(p: T.PlannerPlan): number {
  const n = (k: string) => Number(p.params[k] ?? 0) || 0;
  if (p.scope === 'server-refresh' || p.scope === 'network-refresh' || p.scope === 'rack-replace') return Math.round(n('replacementUnits') * n('replacementUnitCost'));
  if (p.scope === 'network') return Math.round(n('dciGbpsRequired') * 600);
  const facility = p.designPowerKw * n('capexPerKw');
  const racks = Math.ceil(p.designPowerKw / Math.max(1, n('densityKwPerRack') || 10));
  const it = p.params.operatorOwnedIt === true && p.scope !== 'plant' && p.scope !== 'migration' ? racks * n('itCapexPerRack') : 0;
  return Math.round(facility + it);
}

export function seedPlanGovernance(S: Seed, draws: Map<string, number[]>): void {
  const tplOf = (p: T.PlannerPlan) => S.plannerTemplates.find(t => t.id === p.templateId);
  const campusOf = (p: T.PlannerPlan) => S.dcCampus.get(p.dataCenterId ?? '') ?? S.dataCenters.filter(d => d.campusId === p.campusId).map(d => S.dcCampus.get(d.id)).find(Boolean) ?? '';
  const personFor = (step: string, p: T.PlannerPlan): Person => {
    if (step === 'Facility manager') return PEOPLE.find(x => x.role === 'Facilities Engineer' && x.site === campusOf(p)) ?? S.byRole('Facilities Director');
    if (step === 'Network architect') return PEOPLE.find(x => x.role === 'Network Engineer' && x.site === campusOf(p)) ?? S.byRole('Network Engineer');
    return S.byRole(STEP_ROLE[step] ?? 'Facilities Director');
  };
  /** The steps of the path with who decides and why. */
  const pathOf = (p: T.PlannerPlan): { step: string; person: Person; basis: string }[] => {
    const path = tplOf(p)?.approvalPath ?? [];
    const amount = approvalAmount(p);
    return path.map(step => {
      if (!FINANCE_STEP.test(step)) return { step, person: personFor(step, p), basis: 'Template approval path' };
      const band = APPROVAL_BANDS.find(b => amount <= b.max) ?? APPROVAL_BANDS[APPROVAL_BANDS.length - 1];
      if (band.role === 'Executive' && path.includes('Executive')) return { step, person: S.byRole('Finance Manager'), basis: `CapEx ${usd(amount)} is ${bandText(band)}: the Finance Manager reviews and the Executive step approves` };
      return { step, person: S.byRole(band.role), basis: `CapEx ${usd(amount)} is ${bandText(band)}: approved by the ${band.role}` };
    });
  };
  const decided = (steps: ReturnType<typeof pathOf>, startDaysAgo: number, overrides: Partial<Record<number, Partial<T.PlannerApproval>>> = {}, upTo = steps.length): T.PlannerApproval[] =>
    steps.slice(0, upTo).map((s, k) => ({ step: s.step, role: s.person.role, person: s.person.name, order: k + 1, basis: s.basis, decision: 'Approved', at: S.daysAgo(Math.max(1, startDaysAgo - 2 - k * 3)), ...overrides[k] }));
  const pending = (steps: ReturnType<typeof pathOf>, from = 0): T.PlannerApproval[] => steps.slice(from).map((s, k) => ({ step: s.step, role: s.person.role, person: s.person.name, order: from + k + 1, basis: s.basis, decision: 'Pending' }));

  for (const p of S.plannerPlans) {
    const tpl = tplOf(p);
    const steps = pathOf(p);
    const owner = PEOPLE.find(x => x.name === p.ownerName) ?? S.byRole('Capacity Planner');
    const [d1 = 20] = draws.get(p.id) ?? [];
    if (p.status === 'Draft') { p.approvals = []; continue; }
    p.templateVersion = tpl?.version;
    p.revision = 'A';
    if (p.status === 'In review') {
      if (p.plnId === 'PLN-0001') {
        // Resubmitted: round 1 went back for rework; round 2 has passed design review.
        const r1Start = 75;
        const r1 = decided(steps, r1Start, { 1: { decision: 'Rejected', reason: 'CapEx per kW sits above the AI factory benchmark band and phase 1 has no firm grid date. Split phase 1 and confirm the 60 MVA connection date before resubmitting.' } }, 2);
        p.approvalHistory = [{ round: 1, submittedAt: S.daysAgo(r1Start), submittedBy: owner.name, approvals: r1, outcome: 'Rejected' }];
        p.revision = 'B'; p.submittedAt = S.daysAgo(20); p.submittedBy = owner.name;
        p.approvals = [...decided(steps, 20, {}, 1), ...pending(steps, 1)];
      } else {
        p.submittedAt = S.daysAgo(p.plnId === 'PLN-0007' ? 6 : 9); p.submittedBy = owner.name;
        p.approvals = pending(steps);
      }
      continue;
    }
    const start = p.status === 'Executing' ? 150 : p.status === 'Completed' ? 230 : p.status === 'Rejected' ? 45 : d1 + 10;
    p.submittedAt = S.daysAgo(start); p.submittedBy = owner.name;
    if (p.status === 'Rejected') {
      const fin = steps.findIndex(s => FINANCE_STEP.test(s.step));
      const reason = 'Payback is above 8 years at the current tariff, and the utility gives no connection date for Dublin before 2028.';
      p.approvals = decided(steps, start, { [fin]: { decision: 'Rejected', reason, conditions: undefined } }, fin + 1);
      // The current (rejected) round lives in `approvals`; history holds earlier rounds only.
      continue;
    }
    // Approved, executing, completed: every step approved, some with conditions.
    const lastAt = S.daysAgo(Math.max(1, start - 2 - (steps.length - 1) * 3));
    const fin = steps.findIndex(s => FINANCE_STEP.test(s.step));
    const conds: T.PlannerCondition[] = [];
    const overrides: Partial<Record<number, Partial<T.PlannerApproval>>> = {};
    if (p.plnId === 'PLN-0002' && fin >= 0) {
      const text = 'Order rows E to H only when rows A to D reach 60% of their power budget.';
      overrides[fin] = { decision: 'Approved with conditions', conditions: text, reason: 'The second half of the hall is not yet backed by committed demand.' };
      conds.push({ id: 'C1', text, owner: S.byRole('Capacity Planner').name, dueDate: S.daysAhead(120), raisedBy: steps[fin].person.name, raisedAt: lastAt, status: 'Open', blocksExecution: false });
    }
    if (p.plnId === 'PLN-0003') {
      conds.push({ id: 'C1', text: 'Generator on standby and a change freeze on the site during every UPS cut-in window.', owner: p.ownerName, raisedBy: steps[0]?.person.name ?? p.ownerName, raisedAt: lastAt, status: 'Closed', closedAt: S.daysAgo(start - 12), closedBy: p.ownerName, evidence: 'Cut-in change request and maintenance window record the standby generator and the freeze', blocksExecution: true });
    }
    if (p.plnId === 'PLN-0009') {
      conds.push({ id: 'C1', text: 'The carrier proves the third path is diverse from path A with route files before acceptance.', owner: p.ownerName, dueDate: S.daysAhead(60), raisedBy: steps[0]?.person.name ?? p.ownerName, raisedAt: lastAt, status: 'Open', blocksExecution: false });
    }
    p.approvals = decided(steps, start, overrides);
    if (conds.length) p.conditions = conds;
    p.approvedScenarioId = p.preferredScenarioId;
    const scn = S.plannerScenarios.find(x => x.id === p.preferredScenarioId);
    const n = (k: string) => Number(p.params[k] ?? 0) || 0;
    const capex = approvalAmount(p);
    const pue = n('pueTarget') || 1.4;
    const energyKw = p.scope === 'server-refresh' || p.scope === 'network-refresh' ? Math.max(0, p.designPowerKw - n('affectedKw')) : p.scope === 'plant' || p.scope === 'network' || p.scope === 'migration' ? 0 : p.designPowerKw;
    const opex = Math.round(energyKw * pue * 730 * (n('tariffUsdPerKwh') || 0.12) + (capex * (n('maintenancePctCapex') || 2.5)) / 100 / 12);
    p.baseline = {
      at: lastAt, by: p.approvals[p.approvals.length - 1]?.person ?? p.ownerName, scenarioId: scn?.id, scenarioName: scn?.name, templateId: p.templateId, templateVersion: tpl?.version ?? 1,
      params: { ...p.params }, designPowerKw: p.designPowerKw, targetGoLive: p.targetGoLive, phases: p.phases.map(ph => ({ ...ph })),
      capexTotal: capex, contingencyUsd: Math.round(capex * (n('contingencyPct') || 10) / 100), opexMonthly: opex, bomTotal: Math.round(capex * 0.92),
      schedule: [], benchmarks: S.plannerBenchmarks.filter(b => b.metric === 'capexPerKw' && b.appliesTo.dcTypeKey === p.dcTypeKey).map(b => ({ metric: b.metric, value: b.value, low: b.low, high: b.high })),
      hardFails: 0, softWarns: 0, readinessPct: 100,
    };
  }
  executingArtefacts(S);
}

/** PLN-0003 joined the DC4 phase 2 plant project; link what that execution produced. */
function executingArtefacts(S: Seed): void {
  const p = S.plannerPlans.find(x => x.plnId === 'PLN-0003');
  const dc = S.dataCenters.find(d => d.id === p?.dataCenterId);
  const prog = S.programs.find(x => x.id === p?.programId);
  if (!p || !dc || !prog) return;
  const proj = S.projects.find(x => x.programId === prog.id && x.template === 'MEP & Plant Installation');
  if (!proj) return;
  const owner = PEOPLE.find(x => x.name === p.ownerName) ?? S.byRole('Facilities Director');
  const execAt = 130;
  proj.plannerPlanId = p.id; proj.planPhaseId = 'P1';
  const bom = S.boms.find(b => b.projectId === proj.id);
  if (bom) bom.plannerPlanId = p.id;
  const pos = bom ? S.purchaseOrders.filter(po => po.bomId === bom.id) : [];
  pos.forEach((po, i) => {
    po.plannerPlanId = p.id; po.planPhaseId = i === 0 ? 'P1' : 'P2';
    po.contractId = S.contracts.find(c => c.vendorId === po.vendorId && (c.type === 'Framework' || c.type === 'Supply') && c.status === 'Active')?.id;
    po.orderBy = S.daysAgo(execAt - 5); po.needBy = i === 0 ? S.daysAhead(45) : S.daysAhead(105);
  });
  // The cut-in change for the two UPS modules, with its window.
  const ups = S.upsUnits.filter(u => u.dataCenterId === dc.id);
  const rule = S.approvalMatrixRules.find(r => r.changeType === 'PowerUpgrade') ?? S.approvalMatrixRules[0];
  const start = new Date(S.daysAhead(24)); start.setUTCHours(22, 0, 0, 0);
  const end = new Date(start.getTime() + 4 * 36e5);
  const crId = S.nid('CHG');
  const assignee = S.byRole('Field Technician');
  S.changeRequests.push({ id: crId, chgId: crId, ...metaAt(S, 20, owner), title: `UPS modules ${ups.length + 1} and ${ups.length + 2} cut-in — ${dc.code}`, type: 'PowerUpgrade' as E.ChangeType, description: `Connect two 1 MW UPS modules to the parallel bus at ${dc.name}. The system runs at N on maintenance bypass for up to four hours with the generator on standby; site change freeze for the window.`, risk: 'High', status: 'Scheduled', priority: 'High', affectedResourceType: 'PowerChain', affectedResourceIds: ups.map(u => u.id), dataCenterId: dc.id, requestedBy: owner.name, requestedById: owner.id, assignedTo: assignee.name, assignedToId: assignee.id, scheduledStart: start.toISOString(), scheduledEnd: end.toISOString(), policyViolations: [], approvalRuleId: rule?.id, rollbackPlan: 'Open the new module breakers, return the bus to the three existing modules and leave maintenance bypass after load transfer checks.', source: 'Internal', projectId: proj.id, plannerPlanId: p.id } as T.ChangeRequest);
  for (const st of rule?.stages ?? []) {
    const who = S.byRole(({ FacilityManager: 'Facilities Director', ChangeApprover: 'NOC Lead', CapacityPlanner: 'Capacity Planner', NetworkEngineer: 'Network Engineer', NOCOperator: 'NOC Lead', Executive: 'Executive', DeliveryManager: 'Program Manager', ComplianceAuditor: 'Compliance Manager', Administrator: 'Administrator', FieldTechnician: 'Field Technician' } as Record<string, string>)[st.approverRole] ?? 'Facilities Director');
    for (let k = 0; k < st.requiredCount; k++) { const id = S.nid('APSTEP'); S.approvalSteps.push({ id, apstepId: id, ...metaAt(S, 15, who), changeRequestId: crId, order: st.order, approverRole: st.approverRole, approverId: who.id, decision: 'Approved', decidedAt: S.daysAgo(12 - st.order), comment: 'Window, standby generator and freeze confirmed; approved.' } as T.ApprovalStep); }
  }
  const mwId = S.nid('MW');
  S.maintenanceWindows.push({ id: mwId, mwId, ...metaAt(S, 15, owner), title: `UPS cut-in window — ${dc.code}`, status: 'Scheduled', dataCenterId: dc.id, changeRequestId: crId, scheduledStart: start.toISOString(), scheduledEnd: end.toISOString(), affectedDeviceIds: [], impact: 'UPS on maintenance bypass: the critical load runs at N on utility with the generator on standby. No IT outage planned.', owner: owner.name, plannerPlanId: p.id } as T.MaintenanceWindow);
  // Permits the plan listed, as platform records.
  const permitIds = p.permits.map((pm, i) => {
    const id = S.nid('PMT');
    S.permits.push({ id, permitId: id, ...metaAt(S, execAt, owner), name: pm.name, type: (/refrigerant/i.test(pm.name) ? 'Environmental' : 'Electrical') as E.PermitType, status: pm.status === 'Approved' ? 'Approved' : 'Applied', authority: pm.authority, referenceNo: `${dc.code}-${/refrigerant/i.test(pm.name) ? 'ENV' : 'ELE'}-${4100 + i}`, owner: owner.name, programId: prog.id, projectId: proj.id, dataCenterId: dc.id, appliedDate: S.daysAgo(execAt - 3), approvedDate: pm.status === 'Approved' ? S.daysAgo(execAt - 30 - i * 10) : undefined, validFrom: pm.status === 'Approved' ? S.daysAgo(execAt - 30 - i * 10) : undefined, expiryDate: S.daysAhead(365), plannerPlanId: p.id } as T.Permit);
    return id;
  });
  const ddId = S.nid('DD');
  S.designDocuments.push({ id: ddId, ddId, ...metaAt(S, execAt - 10, owner), name: `${dc.code} UPS and chiller expansion — single-line and cut-in sequence`, type: 'MEP Design', status: 'Issued for Construction', discipline: 'Electrical', revision: 'B', author: S.byRole('Facilities Director').name, reviewedBy: S.byRole('Commissioning Engineer').name, issuedDate: S.daysAgo(execAt - 25), programId: prog.id, projectId: proj.id, plannerPlanId: p.id } as T.DesignDocument);
  p.artefacts = {
    createdAt: S.daysAgo(execAt), vehicle: 'project', programId: prog.id, projectIds: [proj.id], bomId: bom?.id,
    purchaseOrderIds: pos.map(x => x.id), subnetIds: [], vlanIds: [], permitIds, designDocIds: [ddId],
    changeRequestIds: [crId], changeRequestId: crId, maintenanceWindowIds: [mwId],
    executionId: `EXE-${p.plnId}-1`, steps: { vehicle: 'done', bom: 'done', 'purchase-orders': 'done', holds: 'skipped', ip: 'skipped', permits: 'done', 'design-docs': 'done', scope: 'done' },
  };
}
