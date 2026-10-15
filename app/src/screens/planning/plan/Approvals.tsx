/* Approvals tab and the decision modal: the approval path of the current round (from the template, the finance step by CapEx band),
   who may decide the next step (the role holder or a recorded delegate, never the requester, never twice in a round), conditions
   with owners and due dates, and delegations. */
import { useState } from 'react';
import * as I from 'lucide-react';
import { Btn, Chip, Field, KV, Modal, Panel, Seg } from '../../../ui/kit';
import type * as T from '../../../planner/p2b/types';
import * as G from '../../../planner/lib/governance';
import type { Evaluation } from '../../../planner/lib/engine';
import type { PlannerData } from '../../../planner/lib/plannerData';
import { useDelegations, useSourcingContext, type usePlannerActions } from '../../../planner/lib/usePlanner';
import { sourcingReady } from '../../../planner/lib/packModel';
import { switchUser, useAuth } from '../../../planner/compat/auth';
import { clockMs } from '../../../planner/compat/clock';
import { message } from '../../../planner/compat/notify';
import { Sub } from '../parts';
import { CheckLabel, NumInput, SelectInput, TextArea, TextInput, date, money } from '../common';

type Actions = ReturnType<typeof usePlannerActions>;
const DECISION_TONE = { Pending: 'warning', Approved: 'success', 'Approved with conditions': 'success', Rejected: 'error' } as const;

export function ApprovalsTab({ plan, actions, onDecide }: { plan: T.PlannerPlan; actions: Actions; onDecide: () => void }) {
  const delegations = useDelegations();
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [dlg, setDlg] = useState(false);
  const next = G.nextPendingStep(plan);
  const steps = G.orderedSteps(plan.approvals);
  const conds = plan.conditions ?? [];
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="pn-two">
        <Panel title={`Approval path · round ${G.currentRound(plan)}`} icon={I.ShieldCheck} info="Steps are decided in order. The finance step is routed by the CapEx of the scenario under review (approval-limit bands); the requester cannot approve, and one person decides at most one step in a round."
          actions={plan.status === 'In review' && next ? <Btn variant="filled" size="sm" icon={I.ClipboardCheck} onClick={onDecide}>Decide: {next.step}</Btn> : undefined}>
          {steps.length ? <><p className="vw-label" style={{ margin: '0 0 8px' }}>{plan.submittedAt ? `Submitted ${date(plan.submittedAt)} by ${plan.submittedBy}` : ''}{plan.approvalAmountUsd ? ` · routed on ${money(plan.approvalAmountUsd)}${plan.approvalBand ? ` · ${plan.approvalBand}` : ''}` : ''}</p>
            <ol className="pl-steps">{steps.map((a, i) => <li key={i} className={`is-${a.decision === 'Pending' ? 'pending' : a.decision === 'Rejected' ? 'rejected' : 'approved'}`}><span className="pl-step-n">{i + 1}</span><span className="cell-2"><b>{a.step} · {a.role}{a.person ? ` · ${a.person}` : ''}{a.onBehalfOf ? ` (for ${a.onBehalfOf})` : ''}</b><small>{a.basis}</small><small>{a.decision}{a.at ? ` · ${date(a.at)}` : ''}{a.reason ? ` · ${a.reason}` : ''}</small></span><Chip tone={DECISION_TONE[a.decision]} size="xs" dot>{a.decision}</Chip></li>)}</ol></>
            : <p className="vw-label">Not submitted yet: the path is built from the template when the plan is submitted.</p>}
        </Panel>
        <Panel title="Conditions" icon={I.ListTodo} count={conds.length} info="Attached by an approval with conditions: each has an owner and a due date; a blocking condition stops the build until it is closed with evidence.">
          {conds.length ? <ul className="pn-list">{conds.map(c => <li key={c.id}><Chip tone={c.status === 'Closed' ? 'success' : c.blocksExecution ? 'error' : 'warning'} size="xs" dot>{c.status === 'Closed' ? 'Closed' : c.blocksExecution ? 'Blocks build' : 'Open'}</Chip><span className="cell-2"><b style={{ fontWeight: 400 }}>{c.text}</b><small>Owner {c.owner}{c.dueDate ? ` · due ${date(c.dueDate)}` : ''} · raised by {c.raisedBy} {date(c.raisedAt)}{c.status === 'Closed' ? ` · closed ${date(c.closedAt)} by ${c.closedBy}: ${c.evidence}` : ''}</small>{c.status === 'Open' && <span className="row" style={{ gap: 6, marginTop: 4 }}><TextInput value={evidence[c.id] ?? ''} placeholder="Evidence (what was done)" onChange={v => setEvidence(e => ({ ...e, [c.id]: v }))} style={{ height: 30 }} /><Btn size="sm" disabled={!(evidence[c.id] ?? '').trim()} onClick={() => { if (actions.closeCondition(plan, c.id, evidence[c.id].trim()).ok) message.success('Condition closed'); }}>Close</Btn></span>}</span></li>)}</ul> : <p className="vw-label">No conditions on this plan.</p>}
        </Panel>
      </div>
      <Panel title="Delegations" icon={I.UserCheck} count={delegations.filter(d => d.status === 'Active').length} info="An approver may delegate their role to a named person for a date range; the delegate decides on their behalf, which the step records."
        actions={<Btn size="sm" icon={I.Plus} onClick={() => setDlg(true)}>Delegate my approvals</Btn>}>
        {delegations.length ? <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>From</th><th>To</th><th>Role</th><th>From</th><th>Until</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>{delegations.map(d => <tr key={d.id}><td>{d.fromName}</td><td>{d.toName}</td><td>{d.role}</td><td>{date(d.startDate)}</td><td>{date(d.endDate)}</td><td className="vw-label">{d.reason ?? '—'}</td><td><Chip tone={d.status === 'Active' ? 'success' : 'neutral'} size="xs" dot>{d.status}</Chip></td><td>{d.status === 'Active' && <Btn size="sm" variant="ghost" onClick={() => actions.revokeDelegation(d.id)}>Revoke</Btn>}</td></tr>)}</tbody></table> : <p className="vw-label">No delegations.</p>}
      </Panel>
      {dlg && <DelegationModal actions={actions} onClose={() => setDlg(false)} />}
    </div>
  );
}

function DelegationModal({ actions, onClose }: { actions: Actions; onClose: () => void }) {
  const me = G.personOf({ id: actions.actorId, name: actions.actor });
  const today = new Date(clockMs()).toISOString().slice(0, 10);
  const [toName, setTo] = useState('');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(new Date(clockMs() + 14 * 864e5).toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const people = G.ALL_PEOPLE.filter(p => p.name !== actions.actor);
  return (
    <Modal open onClose={onClose} title="Delegate my approvals" width={480}
      foot={<div className="row" style={{ justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" disabled={!toName} onClick={() => { if (actions.createDelegation({ toName, role: me?.role ?? '', startDate: `${start}T00:00:00.000Z`, endDate: `${end}T23:59:59.000Z`, reason }).ok) { message.success('Delegation recorded'); onClose(); } }}>Delegate</Btn></div>}>
      <p className="vw-label" style={{ margin: '0 0 10px' }}>You are {actions.actor}{me ? ` (${me.role})` : ''}. The delegate decides {me?.role ?? 'your'} steps on your behalf between the dates; your own requests are excluded.</p>
      <div className="pn-grid-2">
        <Field label="Delegate to" required style={{ gridColumn: 'span 2' }}><SelectInput value={toName} placeholder="Pick a person" options={people.map(p => ({ id: p.name, label: `${p.name} · ${p.role}` }))} onChange={setTo} /></Field>
        <Field label="From"><TextInput type="date" value={start} onChange={setStart} /></Field>
        <Field label="Until"><TextInput type="date" value={end} onChange={setEnd} /></Field>
        <Field label="Reason" style={{ gridColumn: 'span 2' }}><TextInput value={reason} onChange={setReason} placeholder="e.g. On leave" /></Field>
      </div>
    </Modal>
  );
}

/* ---- the decision on the next pending step */
type Decision = G.DecisionInput['decision'];
export function DecideModal({ plan, review, data, actions, onClose }: { plan: T.PlannerPlan; review: { ev: Evaluation; scenario: T.PlannerScenario | null } | undefined; data: PlannerData; actions: Actions; onClose: (changed: boolean) => void }) {
  const delegations = useDelegations();
  /* the final approval freezes the baseline with the sourced bill of materials (what comes from the site and stock, what is bought) */
  const sourcingCtx = useSourcingContext();
  const { users } = useAuth();
  const [decision, setDecision] = useState<Decision>('Approved');
  const [reason, setReason] = useState('');
  const [conds, setConds] = useState<G.ConditionInput[]>([]);
  const [error, setError] = useState<string>();
  const at = new Date(clockMs()).toISOString();
  const next = G.nextPendingStep(plan);
  const me = G.personOf({ id: actions.actorId, name: actions.actor });
  const auth = next ? G.canDecide(plan, next.step, { id: actions.actorId, name: actions.actor }, delegations, at) : undefined;
  const holders = next ? G.peopleWithRole(G.roleOf(next.role)).filter(h => h.name !== plan.requestedBy && h.name !== plan.submittedBy && !plan.approvals.some(a => a.decision !== 'Pending' && (a.person === h.name || a.onBehalfOf === h.name))) : [];
  const record = () => {
    if (!next || !review) return;
    if ((decision === 'Rejected' || decision === 'Approved with conditions') && reason.trim().length < 5) { setError('Give a reason of a few words; it is kept in the plan history.'); return; }
    if (decision === 'Approved with conditions' && (!conds.length || conds.some(c => !c.text.trim() || !c.owner.trim() || !c.dueDate))) { setError('Each condition needs a text, an owner and a due date.'); return; }
    const res = actions.decide(plan, next.step, { decision, reason: reason.trim() || undefined, conditions: decision === 'Approved with conditions' ? conds : undefined }, { ev: review.ev, scenario: review.scenario, data, sourcing: sourcingReady(sourcingCtx) ? sourcingCtx : undefined }, delegations);
    if (!res.ok) { setError(res.reason); return; }
    onClose(true);
  };
  const e = review?.ev;
  return (
    <Modal open onClose={() => onClose(false)} title={`Decide: ${next?.step ?? 'approval'}`} width={720}
      foot={<div className="row" style={{ justifyContent: 'space-between', gap: 8 }}><span className="vw-label">Round {G.currentRound(plan)} · deciding as {actions.actor}{me ? ` (${me.role})` : ''}</span><span className="row" style={{ gap: 8 }}><Btn onClick={() => onClose(false)}>Close</Btn>{next && auth?.ok && <Btn variant={decision === 'Rejected' ? 'danger' : 'filled'} icon={I.ClipboardCheck} onClick={record}>Record decision</Btn>}</span></div>}>
      {e && <KV cols={4} items={[['Scenario', review?.scenario?.name ?? 'Base case'], ['CapEx', money(e.estimate.capexTotal)], ['OpEx per month', money(e.estimate.opexMonthly)], ['Payback', e.estimate.paybackMonths == null ? '—' : `${e.estimate.paybackMonths} months`], ['Hard fails', String(e.hardFails)], ['Warnings', String(e.softWarns)], ['Readiness', `${e.readinessPct}%`], ['Routed on', plan.approvalAmountUsd ? money(plan.approvalAmountUsd) : '—']]} />}
      <Sub>Step {next ? G.orderedSteps(plan.approvals).indexOf(next) + 1 : '—'} of {plan.approvals.length}: {next?.step} · {next?.role}</Sub>
      {next && <p className="vw-label" style={{ margin: '0 0 8px' }}>{next.basis}</p>}
      {auth && !auth.ok && <div className="note note--warn" style={{ marginBottom: 10 }}><I.UserX size={15} /><div>{auth.reason}{holders.length > 0 && <div className="row wrap" style={{ gap: 6, marginTop: 6 }}><span>Switch to a role holder for this demo:</span>{holders.map(h => { const u = users.find(x => x.name === h.name); return u ? <Btn key={h.id} size="sm" onClick={() => switchUser(u.id)}>{h.name}</Btn> : null; })}</div>}</div></div>}
      {auth?.ok && <>
        {auth.onBehalfOf && <p className="note note--info"><I.UserCheck size={15} /><span>You decide on behalf of {auth.onBehalfOf} (delegation).</span></p>}
        <Seg<Decision> value={decision} onChange={setDecision} options={[{ id: 'Approved', label: 'Approve' }, { id: 'Approved with conditions', label: 'Approve with conditions' }, { id: 'Rejected', label: 'Reject' }]} />
        <Field label={decision === 'Approved' ? 'Comment (optional)' : 'Reason'} required={decision !== 'Approved'} style={{ marginTop: 10 }}><TextArea rows={2} value={reason} onChange={setReason} placeholder={decision === 'Rejected' ? 'What must change before resubmission' : decision === 'Approved with conditions' ? 'Why the conditions are needed' : ''} /></Field>
        {decision === 'Approved with conditions' && <>
          <Sub extra={<Btn size="sm" icon={I.Plus} onClick={() => setConds(c => [...c, { text: '', owner: plan.ownerName, dueDate: new Date(clockMs() + 30 * 864e5).toISOString().slice(0, 10), blocksExecution: false }])}>Add a condition</Btn>}>Conditions</Sub>
          {conds.map((c, i) => <div key={i} className="pn-grid-4" style={{ marginBottom: 8, alignItems: 'end' }}><Field label="Condition" style={{ gridColumn: 'span 2' }}><TextInput value={c.text} onChange={v => setConds(cs => cs.map((x, k) => (k === i ? { ...x, text: v } : x)))} /></Field><Field label="Owner"><TextInput value={c.owner} onChange={v => setConds(cs => cs.map((x, k) => (k === i ? { ...x, owner: v } : x)))} /></Field><Field label="Due"><TextInput type="date" value={c.dueDate ?? ''} onChange={v => setConds(cs => cs.map((x, k) => (k === i ? { ...x, dueDate: v } : x)))} /></Field><span className="row" style={{ gridColumn: 'span 4', gap: 10 }}><CheckLabel on={c.blocksExecution} label="Blocks the build until closed" onChange={v => setConds(cs => cs.map((x, k) => (k === i ? { ...x, blocksExecution: v } : x)))} /><Btn size="sm" variant="ghost" icon={I.Trash2} onClick={() => setConds(cs => cs.filter((_, k) => k !== i))} /></span></div>)}
        </>}
      </>}
      {error && <p className="field-error" style={{ marginTop: 8 }}>{error}</p>}
      <span style={{ display: 'none' }}><NumInput value={undefined} onChange={() => undefined} /></span>
    </Modal>
  );
}
