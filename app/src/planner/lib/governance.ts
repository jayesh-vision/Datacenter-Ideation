/**
 * Plan governance — approval path, decisions, rounds, lock, revisions, baseline and status.
 *
 * Everything here is pure (plan in, patch out) so the rules can be tested without React.
 * `usePlanner.ts` applies the patches to MockDB and writes the audit trail.
 *
 * Approval path
 *   Built from the plan template's `approvalPath`. "Finance (by amount)" (or a template with no
 *   finance step at all) is resolved with the delegation-of-authority bands of the
 *   `approval-limit` decision table, applied to the CapEx of the scenario under review
 *   including owned IT:
 *     ≤ $50k   Capacity Planner                     (Rule_al_1 Operational spend)
 *     ≤ $250k  Finance Manager                      (Rule_al_2 Departmental budget)
 *     ≤ $1M    Finance Manager → Facilities Director (Rule_al_3 Site programme)
 *     > $1M    Finance Manager → Executive           (Rule_al_4 Capital programme)
 *   A higher band keeps the lower finance step (the Finance Manager checks the numbers, the
 *   higher authority signs). A role already on the path is not added twice.
 *
 * Decisions
 *   Steps are decided in order. Only a holder of the step's role, or a named delegate for a
 *   date range, may decide. The requester or submitter cannot approve, and one person cannot
 *   decide two steps of the same round. Rejecting and approving with conditions need a reason;
 *   conditions get an owner and a due date and block execution until closed with evidence.
 */
import type * as T from '../p2b/types';
import { PEOPLE, type Person } from '../compat/people';
import { fmtKw, fmtUsd, type Evaluation } from './engine';
import type { PlannerData } from './plannerData';
import { moveReservations, reservationRequests, writeReservations, type Store } from './reservations';
import { closeoutChecks, closeoutFigures, closeoutReady } from './closeout';

/* ------------------------------------------------------------------ roles and people */

/** Approval path labels (template wording) → the platform role that holds them. */
export const STEP_ROLE: Record<string, string> = {
  'Capacity planner': 'Capacity Planner',
  'Facility manager': 'Facilities Engineer',
  'Design authority': 'Facilities Director',
  'Network architect': 'Network Engineer',
  'Operations lead': 'NOC Lead',
  Executive: 'Executive',
  Finance: 'Finance Manager',
};
/** Role of a step label or a stored role (legacy approvals stored the label). */
export const roleOf = (labelOrRole: string): string => STEP_ROLE[labelOrRole] ?? labelOrRole;

/** People who hold a role. Identity comes from the customer platform; the prototype uses the seeded cast. */
export function peopleWithRole(role: string, people: readonly Person[] = PEOPLE): Person[] {
  const r = roleOf(role);
  return people.filter(p => p.role === r);
}
/** The person behind a signed-in user (matched by id, then by name). */
export function personOf(actor: { id?: string; name: string }, people: readonly Person[] = PEOPLE): Person | undefined {
  return people.find(p => p.id === actor.id) ?? people.find(p => p.name === actor.name);
}
export const ALL_PEOPLE: readonly Person[] = PEOPLE;

/* ------------------------------------------------------------------ amount bands */

export interface AmountBand { ruleId: string; label: string; upTo: number | null; approverRole: string; businessCaseRequired: boolean; roles: string[] }
/** Mirror of the `approval-limit` DMN (src/modules/workorders/lib/dmn.ts, rules Rule_al_1…4). */
export const APPROVAL_LIMIT_BANDS: AmountBand[] = [
  { ruleId: 'Rule_al_1', label: 'Operational spend', upTo: 50_000, approverRole: 'Capacity Planner', businessCaseRequired: false, roles: ['Capacity Planner'] },
  { ruleId: 'Rule_al_2', label: 'Departmental budget', upTo: 250_000, approverRole: 'Finance Manager', businessCaseRequired: false, roles: ['Finance Manager'] },
  { ruleId: 'Rule_al_3', label: 'Site programme', upTo: 1_000_000, approverRole: 'Facilities Director', businessCaseRequired: true, roles: ['Finance Manager', 'Facilities Director'] },
  { ruleId: 'Rule_al_4', label: 'Capital programme', upTo: null, approverRole: 'Executive', businessCaseRequired: true, roles: ['Finance Manager', 'Executive'] },
];
export function bandFor(amountUsd: number): AmountBand {
  return APPROVAL_LIMIT_BANDS.find(b => b.upTo === null || amountUsd <= b.upTo)!;
}
export const bandLabel = (b: AmountBand) => `${b.label} (${b.upTo === null ? `over ${fmtUsd(1e6)}` : `up to ${fmtUsd(b.upTo)}`}) · ${b.ruleId}`;

/** The amount an approval is routed on: CapEx of the evaluation, which includes IT the operator buys. */
export function approvalAmount(ev: Evaluation): { amountUsd: number; itUsd: number } {
  const itUsd = ev.estimate.capex.filter(l => /IT and network equipment|New equipment/i.test(l.item)).reduce((a, l) => a + l.amount, 0);
  return { amountUsd: ev.estimate.capexTotal, itUsd };
}

const FINANCE_ENTRY = /by amount|^finance$/i;
const DEFAULT_PATH = ['Design authority', 'Finance (by amount)'];

/** The approval steps a submission creates, in order, each with the reason it is there. */
export function buildApprovalPath(template: Pick<T.PlannerTemplate, 'name' | 'version' | 'approvalPath'> | undefined, amountUsd: number, itUsd = 0): { approvals: T.PlannerApproval[]; band: AmountBand } {
  const band = bandFor(amountUsd);
  const entries = template?.approvalPath?.length ? template.approvalPath : DEFAULT_PATH;
  const tplBasis = template ? `Template ${template.name} v${template.version} approval path` : 'Default approval path (the plan has no template path)';
  const amountText = `CapEx ${fmtUsd(amountUsd)}${itUsd > 0 ? ` (incl. ${fmtUsd(itUsd)} owned IT)` : ''}`;
  const bandBasis = `Delegation of authority, approval-limit table ${band.ruleId} "${band.label}": ${amountText} is ${band.upTo === null ? `over ${fmtUsd(1e6)}` : `up to ${fmtUsd(band.upTo)}`}`;
  const steps: T.PlannerApproval[] = [];
  /** Band basis held back for a role the template names later on (it signs there, under the template's name). */
  const deferred = new Map<string, string>();
  const push = (step: string, role: string, basis: string) => {
    const same = steps.find(s => s.role === role);
    if (same) { same.basis = `${same.basis}; ${basis}`; return; }
    steps.push({ step, role, decision: 'Pending', basis });
  };
  const templateRolesAfter = (i: number) => new Set(entries.slice(i + 1).filter(e => !FINANCE_ENTRY.test(e)).map(roleOf));
  const financeAt = entries.findIndex(e => FINANCE_ENTRY.test(e));
  // Without a finance step on the template, the band goes before the first template step that is itself a band role (the finance check comes before the higher authority signs), else at the end.
  const bandAt = financeAt >= 0 ? financeAt : (() => { const i = entries.findIndex(e => band.roles.includes(roleOf(e))); return i >= 0 ? i : entries.length; })();
  const placeBand = (i: number) => {
    const later = templateRolesAfter(i - (financeAt >= 0 ? 0 : 1));
    band.roles.forEach((r, k) => {
      const basis = financeAt >= 0 ? (k === 0 ? bandBasis : `${bandBasis}; the higher authority signs after the finance check`) : `${bandBasis}; added because the template path has no finance step`;
      if (later.has(r) || (financeAt < 0 && roleOf(entries[i] ?? '') === r)) { deferred.set(r, basis); return; }
      push(financeAt >= 0 && k === 0 ? entries[financeAt] : financeAt >= 0 ? `${r} sign-off (amount band)` : `Budget approval · ${r}`, r, basis);
    });
  };
  entries.forEach((e, i) => {
    if (i === bandAt) placeBand(i);
    if (FINANCE_ENTRY.test(e)) return;
    const role = roleOf(e);
    push(e, role, deferred.has(role) ? `${tplBasis}; ${deferred.get(role)}` : tplBasis);
    deferred.delete(role);
  });
  if (bandAt >= entries.length) placeBand(entries.length);
  steps.forEach((s, i) => { s.order = i + 1; });
  return { approvals: steps, band };
}

/* ------------------------------------------------------------------ delegations */

const dayEnd = (iso: string) => new Date(new Date(iso).toISOString().slice(0, 10) + 'T23:59:59.999Z').getTime();
const dayStart = (iso: string) => new Date(new Date(iso).toISOString().slice(0, 10) + 'T00:00:00.000Z').getTime();
export function delegationActive(d: T.ApprovalDelegation, at: string): boolean {
  const t = new Date(at).getTime();
  return d.status === 'Active' && !d.isDeleted && t >= dayStart(d.startDate) && t <= dayEnd(d.endDate);
}
/** Check a new delegation: the delegator must hold the role, the delegate must be someone else, dates in order. */
export function validateDelegation(d: Pick<T.ApprovalDelegation, 'fromName' | 'toName' | 'role' | 'startDate' | 'endDate'>, people: readonly Person[] = PEOPLE): string | undefined {
  if (!d.toName.trim()) return 'Name the delegate.';
  if (d.toName === d.fromName) return 'You cannot delegate to yourself.';
  if (!people.some(p => p.name === d.fromName && p.role === roleOf(d.role))) return `${d.fromName} does not hold the role ${roleOf(d.role)}, so cannot delegate it.`;
  if (!d.startDate || !d.endDate) return 'Give a start and an end date.';
  if (dayEnd(d.endDate) < dayStart(d.startDate)) return 'The end date is before the start date.';
  return undefined;
}

/* ------------------------------------------------------------------ rounds */

export const currentRound = (plan: T.PlannerPlan) => (plan.approvalHistory?.length ?? 0) + 1;
/** Steps sorted in decision order (legacy approvals without `order` keep their array order). */
export const orderedSteps = (approvals: T.PlannerApproval[]) => approvals.map((a, i) => ({ a, i })).sort((x, y) => (x.a.order ?? x.i + 1) - (y.a.order ?? y.i + 1)).map(x => x.a);
export const nextPendingStep = (plan: T.PlannerPlan) => orderedSteps(plan.approvals).find(a => a.decision === 'Pending');

function outcomeOf(status: T.PlannerPlanStatus): T.PlannerApprovalRound['outcome'] {
  return status === 'Rejected' ? 'Rejected' : status === 'Approved' || status === 'Executing' || status === 'Completed' ? 'Approved' : 'Withdrawn';
}
function archiveRound(plan: T.PlannerPlan, outcome: T.PlannerApprovalRound['outcome'], at: string): T.PlannerApprovalRound[] {
  const history = [...(plan.approvalHistory ?? [])];
  if (!plan.approvals.length) return history;
  history.push({ round: history.length + 1, submittedAt: plan.submittedAt ?? plan.updatedAt, submittedBy: plan.submittedBy ?? plan.requestedBy, approvals: plan.approvals, outcome, scenarioId: plan.reviewScenarioId, amountUsd: plan.approvalAmountUsd, band: plan.approvalBand, closedAt: at });
  return history;
}

export interface Review { scenarioId?: string; scenarioName?: string; amountUsd: number; itUsd?: number }
export type Result<P> = { ok: true; patch: P; note?: string } | { ok: false; reason: string };

/** Submit: a new approval round. The previous round (if any) goes to the history with its outcome. */
export function startRound(plan: T.PlannerPlan, template: T.PlannerTemplate | undefined, review: Review, actor: string, at: string): Result<Partial<T.PlannerPlan>> {
  if (plan.status !== 'Draft' && plan.status !== 'Rejected') return { ok: false, reason: `A ${plan.status.toLowerCase()} plan cannot be submitted. ${plan.status === 'In review' ? 'It is already in review.' : 'Raise a revision to change it.'}` };
  const history = archiveRound(plan, outcomeOf(plan.status), at);
  const { approvals, band } = buildApprovalPath(template, review.amountUsd, review.itUsd);
  return { ok: true, patch: {
    status: 'In review', approvals, approvalHistory: history, submittedAt: at, submittedBy: actor,
    reviewScenarioId: review.scenarioId, approvalAmountUsd: review.amountUsd, approvalBand: bandLabel(band), wizardStepKey: 'review',
  }, note: `Round ${history.length + 1}: ${approvals.map(a => a.step).join(' → ')}` };
}

/** Withdraw while in review: the round is kept as Withdrawn and the plan goes back to Draft. */
export function withdrawRound(plan: T.PlannerPlan, at: string): Result<Partial<T.PlannerPlan>> {
  if (plan.status !== 'In review') return { ok: false, reason: 'Only a plan in review can be withdrawn.' };
  return { ok: true, patch: { status: 'Draft', approvals: [], approvalHistory: archiveRound(plan, 'Withdrawn', at), reviewScenarioId: undefined } };
}

/* ------------------------------------------------------------------ deciding */

export interface Actor { id?: string; name: string }
export type Authority = { ok: true; onBehalfOf?: string; role: string } | { ok: false; reason: string };

/** May this person decide this step now? Order, role (or delegation) and segregation of duties. */
export function canDecide(plan: T.PlannerPlan, stepName: string, actor: Actor, delegations: T.ApprovalDelegation[], at: string, people: readonly Person[] = PEOPLE): Authority {
  if (plan.status !== 'In review') return { ok: false, reason: `The plan is ${plan.status.toLowerCase()}, not in review.` };
  const step = plan.approvals.find(a => a.step === stepName);
  if (!step) return { ok: false, reason: `There is no step "${stepName}" in this round.` };
  if (step.decision !== 'Pending') return { ok: false, reason: `"${step.step}" was already decided (${step.decision}).` };
  const next = nextPendingStep(plan);
  if (next && next.step !== step.step) return { ok: false, reason: `Steps are decided in order: "${next.step}" comes first.` };
  const role = roleOf(step.role);
  if (actor.name === plan.requestedBy || actor.name === plan.submittedBy) return { ok: false, reason: 'You requested or submitted this plan, so someone else must approve it (segregation of duties).' };
  const me = personOf(actor, people);
  let onBehalfOf: string | undefined;
  if (me?.role !== role) {
    const d = delegations.find(x => x.toName === actor.name && roleOf(x.role) === role && delegationActive(x, at));
    if (!d) {
      const holders = peopleWithRole(role, people).map(p => p.name);
      return { ok: false, reason: `Only a ${role} can decide this step (${holders.length ? holders.join(', ') : 'nobody holds this role'}), or a person they have delegated to. You are signed in as ${actor.name}${me ? ` (${me.role})` : ''}.` };
    }
    if (d.fromName === plan.requestedBy || d.fromName === plan.submittedBy) return { ok: false, reason: `${d.fromName} requested or submitted this plan, so a delegation from them cannot be used to approve it.` };
    onBehalfOf = d.fromName;
  }
  const who = [actor.name, onBehalfOf].filter(Boolean) as string[];
  const twice = plan.approvals.find(a => a !== step && a.decision !== 'Pending' && (who.includes(a.person ?? '') || who.includes(a.onBehalfOf ?? '')));
  if (twice) return { ok: false, reason: `${twice.person}${twice.onBehalfOf ? ` (for ${twice.onBehalfOf})` : ''} already decided "${twice.step}" in this round; a different person must decide this step.` };
  return { ok: true, onBehalfOf, role };
}

export interface ConditionInput { text: string; owner: string; dueDate?: string; blocksExecution: boolean }
export interface DecisionInput { decision: Exclude<T.PlannerApproval['decision'], 'Pending'>; reason?: string; conditions?: ConditionInput[] }
export interface DecisionOutcome { patch: Partial<T.PlannerPlan>; approval: T.PlannerApproval; finalApproved: boolean; rejected: boolean; newConditions: T.PlannerCondition[] }

/** Record one decision. Validates authority and the reason/conditions, and works out the new status. */
export function applyDecision(plan: T.PlannerPlan, stepName: string, input: DecisionInput, actor: Actor, delegations: T.ApprovalDelegation[], at: string, people: readonly Person[] = PEOPLE): Result<DecisionOutcome> {
  const auth = canDecide(plan, stepName, actor, delegations, at, people);
  if (!auth.ok) return auth;
  const reason = input.reason?.trim() ?? '';
  if (input.decision !== 'Approved' && reason.length < 5) return { ok: false, reason: input.decision === 'Rejected' ? 'Give the reason for rejecting (at least a few words).' : 'Give the reason for the conditions (at least a few words).' };
  const conds = (input.conditions ?? []).filter(c => c.text.trim());
  if (input.decision === 'Approved with conditions') {
    if (!conds.length) return { ok: false, reason: 'Add at least one condition.' };
    const bad = conds.find(c => !c.owner.trim() || !c.dueDate);
    if (bad) return { ok: false, reason: `Condition "${bad.text}" needs an owner and a due date.` };
  }
  const round = currentRound(plan);
  const base = (plan.conditions ?? []).length;
  const newConditions: T.PlannerCondition[] = input.decision === 'Approved with conditions' ? conds.map((c, i) => ({ id: `CND-${round}-${base + i + 1}`, text: c.text.trim(), owner: c.owner.trim(), dueDate: c.dueDate, raisedBy: actor.name, raisedAt: at, status: 'Open', blocksExecution: c.blocksExecution })) : [];
  const approval: T.PlannerApproval = { ...plan.approvals.find(a => a.step === stepName)!, decision: input.decision, person: actor.name, at, reason: reason || undefined, onBehalfOf: auth.onBehalfOf, conditions: newConditions.length ? newConditions.map(c => c.text).join('; ') : input.decision === 'Rejected' ? reason : undefined };
  const approvals = plan.approvals.map(a => (a.step === stepName ? approval : a));
  const rejected = input.decision === 'Rejected';
  const finalApproved = !rejected && approvals.every(a => a.decision === 'Approved' || a.decision === 'Approved with conditions');
  return { ok: true, patch: { patch: { approvals, conditions: [...(plan.conditions ?? []), ...newConditions], status: rejected ? 'Rejected' : finalApproved ? 'Approved' : 'In review' }, approval, finalApproved, rejected, newConditions } };
}

/** Close a condition with evidence. */
export function closeCondition(plan: T.PlannerPlan, conditionId: string, evidence: string, actor: string, at: string): Result<Partial<T.PlannerPlan>> {
  const c = (plan.conditions ?? []).find(x => x.id === conditionId);
  if (!c) return { ok: false, reason: 'Condition not found.' };
  if (c.status === 'Closed') return { ok: false, reason: 'The condition is already closed.' };
  if (evidence.trim().length < 5) return { ok: false, reason: 'Say how the condition was met (evidence, document or record reference).' };
  return { ok: true, patch: { conditions: (plan.conditions ?? []).map(x => (x.id === conditionId ? { ...x, status: 'Closed' as const, closedAt: at, closedBy: actor, evidence: evidence.trim() } : x)) } };
}
export const openBlockingConditions = (plan: T.PlannerPlan) => (plan.conditions ?? []).filter(c => c.status === 'Open' && c.blocksExecution);

/* ------------------------------------------------------------------ lock and status */

export const EDITABLE_STATUSES: T.PlannerPlanStatus[] = ['Draft', 'Rejected'];
export const isEditable = (plan: Pick<T.PlannerPlan, 'status' | 'supersededBy'>) => EDITABLE_STATUSES.includes(plan.status) && !plan.supersededBy;
/** Why the plan cannot be edited, in plain words (undefined when it can). */
export function lockReason(plan: T.PlannerPlan): string | undefined {
  if (plan.supersededBy) return `This revision was superseded by ${plan.supersededBy}. It is kept read-only for the record.`;
  switch (plan.status) {
    case 'In review': return 'The plan is in review, so it is read-only. Withdraw it from review to make changes.';
    case 'Approved': return 'The plan is approved and its baseline is frozen. Raise a revision to change it; the revision gets its own approval.';
    case 'Executing': return 'The plan is in delivery and its baseline is frozen. Raise a revision to change it; the revision gets its own approval.';
    case 'Completed': return 'The plan is completed. It is kept read-only as the record of what was delivered.';
    case 'On hold': return 'The plan is on hold. Resume it first.';
    case 'Cancelled': return 'The plan is cancelled and kept read-only.';
    default: return undefined;
  }
}

export function holdPlan(plan: T.PlannerPlan, reason: string, actor: string, at: string): Result<Partial<T.PlannerPlan>> {
  if (!['In review', 'Approved', 'Executing'].includes(plan.status)) return { ok: false, reason: `A ${plan.status.toLowerCase()} plan cannot be put on hold.` };
  if (reason.trim().length < 5) return { ok: false, reason: 'Say why the plan is on hold.' };
  return { ok: true, patch: { status: 'On hold', statusBeforeHold: plan.status, holdReason: reason.trim(), heldAt: at, heldBy: actor } };
}
export function resumePlan(plan: T.PlannerPlan): Result<Partial<T.PlannerPlan>> {
  if (plan.status !== 'On hold') return { ok: false, reason: 'The plan is not on hold.' };
  return { ok: true, patch: { status: plan.statusBeforeHold ?? 'Draft', statusBeforeHold: undefined } };
}
export function cancelPlan(plan: T.PlannerPlan, reason: string, actor: string, at: string): Result<Partial<T.PlannerPlan>> {
  if (plan.status === 'Completed' || plan.status === 'Cancelled') return { ok: false, reason: `A ${plan.status.toLowerCase()} plan cannot be cancelled.` };
  if (plan.status === 'Draft') return { ok: false, reason: 'Delete a draft instead of cancelling it.' };
  if (reason.trim().length < 5) return { ok: false, reason: 'Say why the plan is cancelled.' };
  return { ok: true, patch: { status: 'Cancelled', cancelReason: reason.trim(), cancelledAt: at, cancelledBy: actor } };
}
export const canDelete = (plan: T.PlannerPlan) => plan.status === 'Draft' && !plan.artefacts?.executionId;

/* ------------------------------------------------------------------ ids */

/** Next sequential plan id (PLN-0016…). Revisions (PLN-0002-B) do not count. */
export function nextPlanId(ids: string[]): string {
  const max = ids.reduce((m, id) => { const x = /^PLN-(\d+)$/.exec(id); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return `PLN-${String(max + 1).padStart(4, '0')}`;
}

/* ------------------------------------------------------------------ revisions */

export const nextRevisionLetter = (rev?: string) => String.fromCharCode((rev ?? 'A').charCodeAt(0) + 1);

/** Clone an approved or executing plan as the next revision (Draft, its own approval round). */
export function revisionDraft(plan: T.PlannerPlan, allPlans: T.PlannerPlan[], approvedOverrides: Record<string, number | string | boolean>, actor: Actor, at: string): Result<T.PlannerPlan> {
  if (plan.status !== 'Approved' && plan.status !== 'Executing') return { ok: false, reason: 'Only an approved or executing plan can be revised.' };
  if (plan.supersededBy) return { ok: false, reason: `This plan was already superseded by ${plan.supersededBy}.` };
  const open = allPlans.find(p => p.revisionOf === plan.id && !p.isDeleted && p.status !== 'Cancelled' && !p.supersededBy && p.status !== 'Approved' && p.status !== 'Executing');
  if (open) return { ok: false, reason: `Revision ${open.revision} (${open.plnId}) is already open. Finish or cancel it first.` };
  const letter = nextRevisionLetter(plan.revision);
  const root = plan.plnId.replace(/-[A-Z]$/, '');
  const id = `${root}-${letter}`;
  if (allPlans.some(p => p.id === id)) return { ok: false, reason: `${id} already exists.` };
  const params = { ...plan.params, ...approvedOverrides };
  const paramSources = { ...plan.paramSources };
  for (const k of Object.keys(approvedOverrides)) paramSources[k] = 'user';
  const draft: T.PlannerPlan = {
    ...plan, id, plnId: id, status: 'Draft', revision: letter, revisionOf: plan.id, supersededBy: undefined,
    params, paramSources, preferredScenarioId: undefined, reviewScenarioId: undefined, approvedScenarioId: undefined,
    approvals: [], approvalHistory: [], conditions: [], baseline: undefined, closeout: undefined, artefacts: undefined,
    processInstanceId: undefined, templateVersion: undefined, submittedAt: undefined, submittedBy: undefined, approvalAmountUsd: undefined, approvalBand: undefined,
    holdReason: undefined, cancelReason: undefined, statusBeforeHold: undefined,
    createdAt: at, updatedAt: at, createdBy: actor.name, createdById: actor.id ?? plan.createdById, wizardStepKey: 'requirements',
  };
  return { ok: true, patch: draft };
}

export interface DeltaRow { label: string; before: string; after: string; changed: boolean }
/** What a revision (or the live plan) changes against a baseline. */
export function baselineDelta(baseline: T.PlannerBaseline, plan: T.PlannerPlan, ev: Evaluation, labelOf: (key: string) => string = k => k): DeltaRow[] {
  const row = (label: string, before: string, after: string): DeltaRow => ({ label, before, after, changed: before !== after });
  const day = (iso: string) => iso.slice(0, 10);
  const rows: DeltaRow[] = [
    row('IT capacity', fmtKw(baseline.designPowerKw), fmtKw(plan.designPowerKw)),
    row('Target go-live', day(baseline.targetGoLive), day(plan.targetGoLive)),
    row('CapEx', fmtUsd(baseline.capexTotal), fmtUsd(ev.estimate.capexTotal)),
    row('OpEx per month', fmtUsd(baseline.opexMonthly), fmtUsd(ev.estimate.opexMonthly)),
    row('Phases', String(baseline.phases.length), String(plan.phases.length)),
    row('Hard rule failures', String(baseline.hardFails), String(ev.hardFails)),
  ];
  const keys = new Set([...Object.keys(baseline.params), ...Object.keys(ev.params)]);
  for (const k of [...keys].sort()) {
    const a = baseline.params[k]; const b = ev.params[k]?.value;
    if (a === b || (a === undefined && b === undefined)) continue;
    rows.push(row(labelOf(k), a === undefined ? '—' : String(a), b === undefined ? '—' : String(b)));
  }
  return rows;
}

/* ------------------------------------------------------------------ baseline */

export interface BaselineInput {
  plan: T.PlannerPlan; ev: Evaluation; scenario?: T.PlannerScenario | null; template?: T.PlannerTemplate;
  benchmarks: T.PlannerBenchmark[]; bomTotal: number; sourcedTotal?: number; buyTotal?: number; actor: string; at: string;
}
/** Figures frozen at final approval. */
export function buildBaseline(i: BaselineInput): T.PlannerBaseline {
  const { plan, ev } = i;
  const contingency = ev.estimate.contingencyUsd ?? ev.estimate.capex.filter(l => /contingency/i.test(l.item)).reduce((a, l) => a + l.amount, 0);
  const bms = i.benchmarks.filter(b => !b.appliesTo.dcTypeKey || b.appliesTo.dcTypeKey === plan.dcTypeKey);
  return {
    at: i.at, by: i.actor, scenarioId: i.scenario?.id, scenarioName: i.scenario?.name ?? 'Base case',
    templateId: plan.templateId, templateVersion: i.template?.version ?? ev.resolved?.template.version ?? 0,
    params: Object.fromEntries(Object.entries(ev.params).map(([k, s]) => [k, s.value])),
    designPowerKw: plan.designPowerKw, targetGoLive: plan.targetGoLive, phases: plan.phases.map(p => ({ ...p })),
    capexTotal: ev.estimate.capexTotal, contingencyUsd: contingency, opexMonthly: ev.estimate.opexMonthly,
    bomTotal: i.bomTotal, sourcedTotal: i.sourcedTotal, buyTotal: i.buyTotal,
    schedule: ev.schedule.map(s => ({ item: s.item, orderBy: s.orderBy, needBy: s.needBy, phase: s.phase })),
    benchmarks: bms.map(b => ({ metric: b.metric, value: b.value, low: b.low, high: b.high })),
    hardFails: ev.hardFails, softWarns: ev.softWarns, readinessPct: ev.readinessPct,
  };
}

/** A scenario whose overrides are the frozen baseline parameters: execution evaluates the approved figures, never the scenario on screen. */
export function baselineScenario(plan: T.PlannerPlan): T.PlannerScenario | null {
  const b = plan.baseline;
  if (!b) return null;
  return { id: b.scenarioId ?? 'baseline', scnId: b.scenarioId ?? 'baseline', planId: plan.id, name: `${b.scenarioName ?? 'Base case'} (approved baseline)`, description: 'Parameters frozen at approval', overrides: b.params, preferred: false, customerId: plan.customerId, isDeleted: false, createdAt: b.at, updatedAt: b.at, createdBy: b.by, createdById: plan.createdById };
}

/** True when the template moved on since the plan was approved. */
export function templateDrift(plan: T.PlannerPlan, template?: T.PlannerTemplate): { from: number; to: number } | undefined {
  const pinned = plan.templateVersion ?? plan.baseline?.templateVersion;
  if (pinned === undefined || !template || template.version === pinned) return undefined;
  return { from: pinned, to: template.version };
}

/* ------------------------------------------------------------------ wizard save */

/** Fields the wizard owns. Saving never writes status, approvals, baseline, artefacts or links. */
export const WIZARD_FIELDS = [
  'title', 'scope', 'templateId', 'dcTypeKey', 'campusId', 'dataCenterId', 'regionId', 'newSiteName', 'peerDataCenterId', 'climate', 'intent', 'ownerName', 'requestedBy',
  'designPowerKw', 'targetGoLive', 'demand', 'phases', 'params', 'paramSources', 'risks', 'permits', 'aiAssisted', 'revenuePerKwMonth', 'tariffUsdPerKwh',
  'wizardStep', 'wizardStepKey', 'waves', 'sites', 'candidates', 'plantLines', 'cutIns', 'paths', 'consents', 'dispositions', 'mapping', 'placement', 'ipAllocation', 'inSite',
] as const satisfies readonly (keyof T.PlannerPlan)[];
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The wizard-owned fields that differ from what was loaded (all of them for a new plan). */
export function wizardPatch(base: T.PlannerPlan | undefined, local: T.PlannerPlan): Partial<T.PlannerPlan> {
  const out: Record<string, unknown> = {};
  for (const f of WIZARD_FIELDS) if (!base || !same(base[f], local[f])) out[f] = local[f];
  return out as Partial<T.PlannerPlan>;
}
/** Someone else changed the plan after the wizard loaded it (status, approvals or a field the wizard owns). */
export function wizardConflict(base: T.PlannerPlan | undefined, server: T.PlannerPlan | undefined): string | undefined {
  if (!base || !server) return undefined;
  if (server.updatedAt === base.updatedAt) return undefined;
  if (server.status !== base.status) return `The plan is now ${server.status.toLowerCase()} (it was ${base.status.toLowerCase()} when you opened it). Reload to see the latest version.`;
  if (!same(server.approvals, base.approvals)) return 'Approvals changed since you opened the plan. Reload to see the latest version.';
  const changed = WIZARD_FIELDS.filter(f => f !== 'wizardStep' && f !== 'wizardStepKey' && !same(server[f], base[f]));
  if (changed.length) return `Someone else changed ${changed.slice(0, 3).join(', ')}${changed.length > 3 ? '…' : ''} since you opened the plan. Reload to see the latest version.`;
  return undefined;
}

/* ------------------------------------------------------------------ audit diffs */

const show = (v: unknown) => (v === undefined || v === null || v === '' ? '—' : typeof v === 'object' ? (Array.isArray(v) ? `${v.length} item${v.length === 1 ? '' : 's'}` : 'set') : String(v));
/** Field-level changes between two versions of a plan (parameters one by one, with their source). */
export function diffPlan(before: Partial<T.PlannerPlan> | undefined, after: Partial<T.PlannerPlan>): T.AuditChange[] {
  const out: T.AuditChange[] = [];
  const bp = before?.params ?? {}; const ap = after.params;
  if (ap) for (const k of new Set([...Object.keys(bp), ...Object.keys(ap)])) if (!same(bp[k], ap[k])) out.push({ field: `param ${k}`, from: show(bp[k]), to: show(ap[k]), source: after.paramSources?.[k] ?? 'user' });
  for (const f of WIZARD_FIELDS) {
    if (f === 'params' || f === 'paramSources' || f === 'wizardStep' || f === 'wizardStepKey' || !(f in after)) continue;
    const a = before?.[f]; const b = after[f];
    if (same(a, b)) continue;
    out.push({ field: f, from: show(a), to: show(b) });
  }
  return out;
}
export const changesText = (cs: T.AuditChange[], max = 4) => cs.slice(0, max).map(c => `${c.field} ${String(c.from ?? '—')} → ${String(c.to ?? '—')}${c.source ? ` (${c.source})` : ''}`).join('; ') + (cs.length > max ? ` and ${cs.length - max} more` : '');

/* ------------------------------------------------------------------ lifecycle orchestration (through a Store) */

export interface ApprovalEffects { patch: Partial<T.PlannerPlan>; previous?: { id: string; patch: Partial<T.PlannerPlan> }; notes: string[] }

/**
 * Final approval: freeze the baseline from the scenario the approvers saw, pin the template
 * version and write the capacity holds. A revision supersedes the plan it revises: the old
 * holds are released and, if the old plan was already in delivery, the revision takes over its
 * delivery records (programme budget moves to the new baseline).
 */
export function onFinalApproval(store: Store, i: { plan: T.PlannerPlan; ev: Evaluation; scenario?: T.PlannerScenario | null; template?: T.PlannerTemplate; benchmarks: T.PlannerBenchmark[]; data: PlannerData; bomTotal: number; sourcedTotal?: number; buyTotal?: number; actor: string; meta: Record<string, unknown>; at: string }): ApprovalEffects {
  const { plan, at } = i;
  const notes: string[] = [];
  const baseline = buildBaseline({ plan, ev: i.ev, scenario: i.scenario, template: i.template, benchmarks: i.benchmarks, bomTotal: i.bomTotal, sourcedTotal: i.sourcedTotal, buyTotal: i.buyTotal, actor: i.actor, at });
  const prev = plan.revisionOf ? (store.get('plannerPlans', plan.revisionOf) as unknown as T.PlannerPlan | undefined) : undefined;
  let previous: ApprovalEffects['previous'];
  let inherited: Partial<T.PlannerPlan> = {};
  if (prev) {
    const n = moveReservations(store, prev.id, 'Released', { reason: `superseded by ${plan.plnId}`, at });
    previous = { id: prev.id, patch: { supersededBy: plan.id, updatedAt: at } };
    notes.push(`${prev.plnId} superseded; ${n} hold(s) released.`);
    if (prev.status === 'Executing' && prev.artefacts) {
      inherited = { artefacts: { ...prev.artefacts, reservationIds: [], rackReservationIds: [] }, programId: prev.programId, processInstanceId: prev.processInstanceId, status: 'Executing' };
      const progId = prev.artefacts.programId ?? prev.programId;
      if (progId && store.get('programs', progId)) { store.update('programs', progId, { budget: baseline.capexTotal, plannerPlanId: plan.id, updatedAt: at }); notes.push(`Programme ${progId} budget set to the new baseline ${fmtUsd(baseline.capexTotal)}.`); }
      for (const e of ['projects', 'purchaseOrders', 'changeRequests', 'maintenanceWindows', 'permits', 'designDocuments', 'atps']) for (const r of store.list(e)) if (r.plannerPlanId === prev.id) store.update(e, String(r.id), { plannerPlanId: plan.id });
      notes.push('Delivery records moved to the revision.');
    }
  }
  const req = reservationRequests(plan, i.ev, i.data);
  const ids = writeReservations(store, plan, req, i.meta, i.actor);
  if (req.note) notes.push(req.note);
  if (inherited.status === 'Executing') moveReservations(store, plan.id, 'Committed', { changeRequestId: inherited.artefacts?.changeRequestId, at });
  const vehicle: T.PlannerArtefacts['vehicle'] = i.template?.executesAs === 'programme' ? 'programme' : i.template?.executesAs === 'change' ? 'change' : i.template?.executesAs === 'portfolio' ? 'portfolio' : 'project';
  const artefacts: T.PlannerArtefacts = inherited.artefacts ? { ...inherited.artefacts, ...ids } : { ...(plan.artefacts ?? { createdAt: at, vehicle, purchaseOrderIds: [], subnetIds: [], vlanIds: [], permitIds: [], designDocIds: [] }), ...ids };
  return {
    patch: {
      ...inherited, baseline, approvedScenarioId: i.scenario?.id, templateVersion: baseline.templateVersion, artefacts,
      phases: plan.phases.map(p => (p.status === 'Planned' ? { ...p, status: 'Approved' as const } : p)),
    },
    previous, notes: [`Baseline frozen: ${fmtUsd(baseline.capexTotal)} CapEx from ${baseline.scenarioName}, template v${baseline.templateVersion}.`, `${ids.reservationIds.length} capacity hold(s) and ${ids.rackReservationIds.length} rack-unit hold(s) written.`, ...notes],
  };
}

/** Complete the plan when every check is green: write the close-out, set phases Live, consume the holds. */
export function completePlan(store: Store, plan: T.PlannerPlan, data: PlannerData, template: T.PlannerTemplate | undefined, actor: string, at: string, notes?: string): Result<Partial<T.PlannerPlan>> {
  const checklist = closeoutChecks(plan, data, template);
  if (!closeoutReady(checklist)) return { ok: false, reason: `Not ready to complete: ${checklist.filter(c => !c.ok && !c.atHandover).map(c => c.label).join(', ')}.` };
  const fig = closeoutFigures(plan, data);
  moveReservations(store, plan.id, 'Consumed', { at });
  const closeout: T.PlannerCloseout = { completedAt: at, completedBy: actor, deliveredKw: fig.deliveredKw, actualCapex: fig.actualCapex, checklist, notes, measuredKw: fig.measuredKw, measuredAt: fig.measuredKw !== undefined ? at : undefined };
  return { ok: true, patch: { status: 'Completed', closeout, phases: plan.phases.map(p => ({ ...p, status: 'Live' as const })) } };
}
