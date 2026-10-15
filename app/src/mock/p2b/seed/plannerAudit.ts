/* The demo plans' audit trail, read back from what each plan already records (created, revision raised, each approval round submitted
   and decided, baseline frozen, handed to Delivery, completed, held, cancelled). P2B seeded no audit events, so every plan's History
   tab said "no change since" even for a plan on revision B with two approval rounds. Timestamps and people come from the plan itself;
   nothing is invented beyond the summary wording. */
import type * as T from '../../../planner/p2b/types';

type Ev = { id: string; audId: string; entityType: 'Plan'; entityId: string; action: string; actorName: string; timestamp: string; summary: string; changes?: T.AuditChange[]; reason?: string; plannerPlanId: string; customerId: string; isDeleted: false; createdAt: string; updatedAt: string; createdBy: string; createdById: string };

export function planAuditTrail(plans: T.PlannerPlan[], existing: { id: string }[] = []): Ev[] {
  let n = existing.reduce((m, e) => { const x = /^AUD-(\d+)$/.exec(e.id); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  const out: Ev[] = [];
  const add = (p: T.PlannerPlan, at: string | undefined, who: string | undefined, action: string, summary: string, changes?: T.AuditChange[], reason?: string) => {
    if (!at || !who) return;
    const id = `AUD-${String(++n).padStart(5, '0')}`;
    out.push({ id, audId: id, entityType: 'Plan', entityId: p.id, action, actorName: who, timestamp: at, summary, changes, reason, plannerPlanId: p.id, customerId: p.customerId ?? 'CUST-001', isDeleted: false, createdAt: at, updatedAt: at, createdBy: who, createdById: who });
  };
  const byId = new Map(plans.map(p => [p.id, p]));
  for (const p of plans) {
    const parent = p.revisionOf ? byId.get(p.revisionOf) : undefined;
    if (parent) add(p, p.createdAt, p.createdBy ?? p.requestedBy, 'revision raised', `Revision ${p.revision ?? 'B'} raised from ${parent.plnId}${parent.baseline ? ` (baseline frozen ${parent.baseline.at.slice(0, 10)})` : ''}`, [{ field: 'revision', from: parent.revision ?? 'A', to: p.revision ?? 'B' }]);
    else add(p, p.createdAt, p.createdBy ?? p.requestedBy, 'created', `Plan created from template ${p.templateId}${p.dataCenterId ? ` for ${p.dataCenterId}` : ''}`, [{ field: 'status', to: 'Draft' }]);
    const rounds: T.PlannerApprovalRound[] = [...(p.approvalHistory ?? []), ...(p.approvals.length && p.submittedAt ? [{ round: (p.approvalHistory?.length ?? 0) + 1, submittedAt: p.submittedAt, submittedBy: p.submittedBy ?? p.requestedBy, approvals: p.approvals, outcome: 'Approved' as const }] : [])];
    for (const r of rounds) {
      add(p, r.submittedAt, r.submittedBy, 'submitted', `Submitted for review (round ${r.round})${r.amountUsd ? `, ${Math.round(r.amountUsd / 1e5) / 10} M USD` : ''}`, [{ field: 'status', from: 'Draft', to: 'In review' }]);
      for (const a of r.approvals) if (a.decision !== 'Pending') add(p, a.at, a.person ?? a.role, a.decision === 'Rejected' ? 'rejected' : 'approved', `${a.step}: ${a.decision.toLowerCase()}${a.conditions ? ` with conditions (${a.conditions})` : ''}`, undefined, a.reason);
      if (r.outcome === 'Withdrawn' && r !== rounds[rounds.length - 1]) add(p, r.approvals.find(a => a.at)?.at ?? r.submittedAt, r.submittedBy, 'withdrawn', `Round ${r.round} withdrawn to Draft`);
    }
    if (p.baseline) add(p, p.baseline.at, p.baseline.by, 'baseline frozen', `Approved; baseline frozen at ${Math.round(p.baseline.capexTotal / 1e5) / 10} M USD CapEx on ${p.baseline.scenarioName ?? 'the base case'}`, [{ field: 'status', from: 'In review', to: 'Approved' }]);
    const ex = p.artefacts;
    if (ex?.executionId && ['Executing', 'Completed'].includes(p.status)) add(p, ex.completedAt ?? ex.createdAt ?? p.baseline?.at, p.ownerName, 'executed', `Build started: handed to Delivery as ${p.plnId.replace('PLN-', 'PRJ-')}`, [{ field: 'status', from: 'Approved', to: 'Executing' }]);
    if (p.closeout) add(p, p.closeout.completedAt, p.closeout.completedBy, 'completed', 'Plan completed: handover signed, capacity holds consumed', [{ field: 'status', from: 'Executing', to: 'Completed' }]);
    if (p.status === 'On hold') add(p, p.heldAt, p.heldBy, 'held', 'Put on hold', [{ field: 'status', from: p.statusBeforeHold ?? 'Approved', to: 'On hold' }], p.holdReason);
    if (p.status === 'Cancelled') add(p, p.cancelledAt, p.cancelledBy, 'cancelled', 'Plan cancelled; capacity holds released', [{ field: 'status', to: 'Cancelled' }], p.cancelReason);
    if (p.supersededBy) { const nx = byId.get(p.supersededBy); add(p, nx?.baseline?.at ?? nx?.updatedAt, nx?.baseline?.by ?? nx?.ownerName, 'superseded', `Superseded by ${nx?.plnId ?? p.supersededBy}`); }
  }
  return out;
}
