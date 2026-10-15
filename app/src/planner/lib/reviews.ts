/* Review requests and review comments on a plan (the reviewer portal, `/planning/plans/:id/review`).
   A review request records who was asked to read the plan's review pack, with which message, sent how (PDF, ZIP or a link only) and the
   email that would have gone out (the prototype sends nothing). Comments are threaded per section of the review document and can be
   resolved. Pure: the store writes live in usePlanner (`requestReview`, `commentOnReview`, `resolveReviewComment`), audited on the plan. */
import type * as T from '../p2b/types';
import * as G from './governance';
import type { Person } from '../compat/people';

export type ReviewDelivery = 'pdf' | 'zip' | 'link';
export interface ReviewAttachment { name: string; bytes: number }
export interface ReviewEmail { to: string[]; subject: string; body: string; link: string; attachments: ReviewAttachment[] }

export interface PlanReviewRequest {
  id: string; revId: string; planId: string; plnId: string; revision: string; round: number; docNumber: string;
  requestedBy: string; requestedById?: string; requestedAt: string;
  reviewers: { name: string; role: string }[];
  message: string; delivery: ReviewDelivery; email: ReviewEmail;
  /** the plan's status when it was sent (a draft can be sent for comments before it is submitted) */
  planStatus: T.PlannerPlanStatus;
  customerId?: string; isDeleted?: boolean; createdAt?: string; updatedAt?: string;
}

export interface PlanReviewComment {
  id: string; planId: string; reviewId?: string; revision: string; sectionId: string; sectionLabel: string; parentId?: string;
  author: string; authorRole?: string; at: string; text: string;
  status: 'Open' | 'Resolved'; resolvedBy?: string; resolvedAt?: string;
  customerId?: string; isDeleted?: boolean; createdAt?: string; updatedAt?: string;
}

/** The approval round a request belongs to, as the plan holds it now (current approvals or a past round). */
export function roundApprovals(plan: T.PlannerPlan, round: number): T.PlannerApproval[] {
  if (round === G.currentRound(plan)) return plan.approvals;
  return plan.approvalHistory?.find(r => r.round === round)?.approvals ?? [];
}

export type RequestState = { label: string; tone: 'info' | 'warning' | 'success' | 'error' | 'neutral'; open: boolean };
/** Open while its round is the plan's current round and the plan is in review (or still a draft for comments); else closed with the outcome. */
export function requestState(req: PlanReviewRequest, plan: T.PlannerPlan): RequestState {
  const current = req.round === G.currentRound(plan);
  if (current && plan.status === 'In review') return { label: 'Awaiting decision', tone: 'warning', open: true };
  if (current && (plan.status === 'Draft' || plan.status === 'Rejected') && req.planStatus === plan.status) return { label: 'Open for comments', tone: 'info', open: true };
  const past = plan.approvalHistory?.find(r => r.round === req.round);
  const outcome = past?.outcome ?? (current && ['Approved', 'Executing', 'Completed'].includes(plan.status) ? 'Approved' : current && plan.status === 'Rejected' ? 'Rejected' : undefined);
  if (outcome === 'Approved') return { label: 'Approved', tone: 'success', open: false };
  if (outcome === 'Rejected') return { label: 'Rejected', tone: 'error', open: false };
  if (outcome) return { label: outcome, tone: 'neutral', open: false };
  return { label: 'Closed', tone: 'neutral', open: false };
}

export type ReviewerState = 'Decided' | 'Commented' | 'Awaiting';
/** A reviewer has decided when they (or someone on their behalf) decided a step of the request's round; commented when they wrote on it. */
export function reviewerState(name: string, req: PlanReviewRequest, plan: T.PlannerPlan, comments: PlanReviewComment[]): { state: ReviewerState; detail?: string } {
  const a = roundApprovals(plan, req.round).find(x => x.decision !== 'Pending' && (x.person === name || x.onBehalfOf === name));
  if (a) return { state: 'Decided', detail: `${a.step}: ${a.decision}` };
  const n = comments.filter(c => c.author === name && c.at >= req.requestedAt).length;
  if (n) return { state: 'Commented', detail: `${n} comment${n === 1 ? '' : 's'}` };
  return { state: 'Awaiting' };
}

/** People who may be asked to review: the holders of the roles on the plan's approval path (this round's, else the template's), never
 *  the plan's own requester or submitter (segregation of duties), the holder of the next step first. */
export function reviewCandidates(plan: T.PlannerPlan, template: T.PlannerTemplate | undefined, people: readonly Person[] = G.ALL_PEOPLE): { person: Person; step: string }[] {
  const steps = plan.approvals.length ? G.orderedSteps(plan.approvals).map(a => ({ step: a.step, role: a.role })) : (template?.approvalPath ?? []).map(s => ({ step: s, role: s }));
  const out: { person: Person; step: string }[] = [];
  for (const s of steps) for (const p of G.peopleWithRole(G.roleOf(s.role), people)) {
    if (p.name === plan.requestedBy || p.name === plan.submittedBy || out.some(o => o.person.name === p.name)) continue;
    out.push({ person: p, step: s.step });
  }
  return out;
}

/** Default pick: one person per step (the first eligible holder), so every approver of the path gets the pack. */
export function defaultReviewers(cands: { person: Person; step: string }[]): string[] {
  const seen = new Set<string>(); const out: string[] = [];
  for (const c of cands) if (!seen.has(c.step)) { seen.add(c.step); out.push(c.person.name); }
  return out;
}

/** Whose turn it is: the next pending step, its role and the people who may decide it (role holders minus the requester and anyone
 *  who already decided a step in this round). */
export function whoseTurn(plan: T.PlannerPlan): { step: T.PlannerApproval; index: number; total: number; holders: Person[] } | undefined {
  if (plan.status !== 'In review') return undefined;
  const next = G.nextPendingStep(plan); if (!next) return undefined;
  const steps = G.orderedSteps(plan.approvals);
  const holders = G.peopleWithRole(G.roleOf(next.role)).filter(h => h.name !== plan.requestedBy && h.name !== plan.submittedBy && !plan.approvals.some(a => a.decision !== 'Pending' && (a.person === h.name || a.onBehalfOf === h.name)));
  return { step: next, index: steps.indexOf(next), total: steps.length, holders };
}

export const fmtBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
