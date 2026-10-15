/* How an edit made on the plan page (materials, project plan, equipment, risks / permits / vendors) lands, by plan status:
   - Draft / Rejected: in place (patchPlan), audited with the editor's `what`;
   - In review: "Withdraw and save" — the plan goes back to Draft (the round is kept in History as withdrawn), then the edit lands in place;
   - Approved / Executing (and not superseded): "Draft revision B" — raiseRevision creates Rev B, the edit is applied to B and audited as
     "Raised to change: <what>"; the approved plan and its baseline stay untouched until B is approved. The caller lands on B.
     When a revision of this plan is already open as a draft, the edit goes into that revision instead (one open revision at a time);
     when that revision is in review, the edit is read-only until it is withdrawn or decided.
   - On hold / Completed / Cancelled / superseded: read only, with the reason (G.lockReason).
   Opt-in `living`: risks and permits are a living register (patchPlan accepts them on a locked plan), so an editor that only writes those
   fields can pass `{ living: true }` to save them straight onto an approved / executing plan instead of drafting a revision.
   Every editor on the plan page goes through `usePlanEdit(plan)` so the rule is the same everywhere: show `policy.note` as a calm banner
   (`EditNote` in ./EditNote.tsx), label the commit button `policy.commitLabel`, and after commit navigate to the returned plan when its id
   differs (`landOn` below). Withdraw / revision outcomes raise their own toast. */
import { useMemo } from 'react';
import type * as T from '../../../../planner/p2b/types';
import * as G from '../../../../planner/lib/governance';
import { usePlannerActions, usePlans } from '../../../../planner/lib/usePlanner';
import { message } from '../../../../planner/compat/notify';

export type EditMode = 'in-place' | 'withdraw-first' | 'revision' | 'read-only';
export interface EditPolicy {
  mode: EditMode;
  /* one short sentence for the editor's banner, e.g. "Approved: your change drafts revision B …". Empty for a draft. */
  note: string;
  /* the label of the editor's commit button for this mode: "Save", "Withdraw and save", "Draft revision B", "Save to revision B" */
  commitLabel: string;
  /* the plan the change lands on when it is not this one (an open revision, or just the letter of the one that will be drafted) */
  target?: { id?: string; plnId?: string; revision: string };
}
export type CommitResult = { ok: true; plan: T.PlannerPlan } | { ok: false; reason: string };
export interface PlanEditApi {
  policy: EditPolicy;
  /* apply a patch the way the policy says; `what` is the audit / revision note ("Materials: 2 lines changed"). Resolves to the plan that now
     carries the change (the same plan, or the revision) — the caller navigates to it when it differs. */
  commit: (patch: Partial<T.PlannerPlan>, what: string) => Promise<CommitResult>;
}
export interface EditOptions { living?: boolean }

/** After a commit: the URL to land on when the change went to another plan (a revision), keeping the tab; undefined otherwise. */
export function landOn(from: T.PlannerPlan, r: CommitResult, tab?: string): string | undefined {
  return r.ok && r.plan.id !== from.id ? `/planning/plans/${r.plan.id}${tab ? `?tab=${tab}` : ''}` : undefined;
}

const LIVING: (keyof T.PlannerPlan)[] = ['risks', 'permits'];
/** The open revision of an approved / executing plan (draft, rejected or in review), if any. */
export function openRevisionOf(plan: T.PlannerPlan, plans: T.PlannerPlan[]): T.PlannerPlan | undefined {
  return plans.find(p => p.revisionOf === plan.id && !p.isDeleted && !p.supersededBy && ['Draft', 'Rejected', 'In review'].includes(p.status));
}

/** The edit rule for a plan as a pure function (the hook below and QA use it). */
export function editPolicy(plan: T.PlannerPlan, plans: T.PlannerPlan[], opts: EditOptions = {}): EditPolicy {
  const s = plan.status;
  if (G.isEditable(plan)) return { mode: 'in-place', note: '', commitLabel: 'Save' };
  if (!plan.supersededBy && s === 'In review')
    return { mode: 'withdraw-first', note: 'In review: saving withdraws the plan to Draft (this round stays in History). Submit it again when you are done.', commitLabel: 'Withdraw and save' };
  if (!plan.supersededBy && (s === 'Approved' || s === 'Executing')) {
    const where = s === 'Executing' ? 'In delivery' : 'Approved';
    if (opts.living) return { mode: 'in-place', note: `${where}: risks and permits stay live, so this saves straight to the plan. The approved baseline is untouched.`, commitLabel: 'Save' };
    const open = openRevisionOf(plan, plans);
    const tgt = open ? { id: open.id, plnId: open.plnId, revision: open.revision ?? '' } : undefined;
    if (open && open.status === 'In review')
      return { mode: 'read-only', note: `Revision ${open.revision} (${open.plnId}) is in review. Withdraw it or wait for its decision before changing this plan again.`, commitLabel: 'Save', target: tgt };
    if (open)
      return { mode: 'revision', note: `${where}: revision ${open.revision} (${open.plnId}) is already open, so your change goes into it. This plan and its baseline stay as they are.`, commitLabel: `Save to revision ${open.revision}`, target: tgt };
    const letter = G.nextRevisionLetter(plan.revision);
    return { mode: 'revision', note: `${where}: your change drafts revision ${letter} with the change in it. The approved baseline is untouched until ${letter} is approved.`, commitLabel: `Draft revision ${letter}`, target: { revision: letter } };
  }
  return { mode: 'read-only', note: G.lockReason(plan) ?? 'This plan cannot be edited.', commitLabel: 'Save' };
}

/* A patch built against `from` re-based onto `to` (a revision): map-valued fields (params, paramSources…) carry only the keys the editor
   changed, so the revision keeps what it already has (approved scenario overrides folded into its params, earlier edits). */
function rebase(patch: Partial<T.PlannerPlan>, from: T.PlannerPlan, to: T.PlannerPlan): Partial<T.PlannerPlan> {
  if (from.id === to.id) return patch;
  const isMap = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    const was = (from as unknown as Record<string, unknown>)[k];
    const cur = (to as unknown as Record<string, unknown>)[k];
    if (isMap(v) && isMap(was) && isMap(cur)) {
      const merged: Record<string, unknown> = { ...cur };
      for (const [kk, vv] of Object.entries(v)) if (JSON.stringify(was[kk]) !== JSON.stringify(vv)) merged[kk] = vv;
      for (const kk of Object.keys(was)) if (!(kk in v)) delete merged[kk];
      out[k] = merged;
    } else out[k] = v;
  }
  return out as Partial<T.PlannerPlan>;
}

export function usePlanEdit(plan: T.PlannerPlan, opts: EditOptions = {}): PlanEditApi {
  const actions = usePlannerActions();
  const plans = usePlans();
  const living = !!opts.living;
  const policy = useMemo(() => editPolicy(plan, plans, { living }), [plan, plans, living]);
  const commit: PlanEditApi['commit'] = async (patch, what) => {
    const keys = Object.keys(patch) as (keyof T.PlannerPlan)[];
    if (!keys.length) return { ok: true, plan };
    const fail = (reason: string): CommitResult => ({ ok: false, reason });
    const p = editPolicy(plan, plans, { living: living && keys.every(k => LIVING.includes(k)) });
    switch (p.mode) {
      case 'read-only': message.warning(p.note); return fail(p.note);
      case 'in-place': {
        const r = actions.patchPlan(plan.id, patch, what);
        return r.ok ? { ok: true, plan: { ...plan, ...patch } } : fail(r.reason);
      }
      case 'withdraw-first': {
        const w = actions.withdraw(plan, `To change: ${what}`);
        if (!w.ok) return fail(w.reason);
        const r = actions.patchPlan(plan.id, patch, what);
        if (!r.ok) return fail(r.reason);
        message.info(`${plan.plnId} withdrawn to Draft and saved. Submit it again when you are ready.`);
        return { ok: true, plan: { ...plan, ...patch, status: 'Draft' } };
      }
      case 'revision': {
        let target = p.target?.id ? plans.find(x => x.id === p.target!.id) : undefined;
        let raised = false;
        if (!target) {
          const r = actions.raiseRevision(plan, `Raised to change: ${what}`);
          if (!r.ok) return fail(r.reason);
          if (!r.value) return fail('The revision was not created.');
          target = r.value; raised = true;
        }
        const rp = rebase(patch, plan, target);
        const r = actions.patchPlan(target.id, rp, raised ? `Raised to change: ${what}` : what);
        if (!r.ok) return fail(r.reason);
        message.success(raised ? `Revision ${target.revision} (${target.plnId}) drafted with your change; ${plan.plnId} is untouched until it is approved.` : `Saved to revision ${target.revision} (${target.plnId}).`);
        return { ok: true, plan: { ...target, ...rp } };
      }
    }
  };
  return { policy, commit };
}
