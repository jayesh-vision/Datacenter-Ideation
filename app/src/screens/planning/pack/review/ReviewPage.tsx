/* Reviewer page (/planning/plans/:planId/review): the plan's review pack as a document (ReviewDocView, the same content as the PDF and the
   ZIP), with the decision bound to the plan's approval flow (the same DecideModal, decide action and segregation rules as the Approvals
   tab; whose turn it is), the review status (requests, reviewers, comments), the pack files to download, and threaded comments per
   section (author, time, reply, resolve). */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { usePage, PageHead, Loading } from '../../../../shell/page';
import { Btn, Chip, Modal, Panel, Seg } from '../../../../ui/kit';
import type * as T from '../../../../planner/p2b/types';
import * as G from '../../../../planner/lib/governance';
import { fmtBytes, requestState, reviewerState, whoseTurn, type PlanReviewComment, type PlanReviewRequest } from '../../../../planner/lib/reviews';
import { useDelegations, usePlan, usePlanReviews, usePlannerActions, useReviewComments } from '../../../../planner/lib/usePlanner';
import { printPlanArea } from '../../../../planner/lib/packModel';
import { switchUser, useAuth } from '../../../../planner/compat/auth';
import { clockMs } from '../../../../planner/compat/clock';
import { message } from '../../../../planner/compat/notify';
import { NotFound } from '../../../NotFound';
import { DecideModal } from '../../plan/Approvals';
import { PlanStatusChip, PlannerToasts, SelectInput, TextArea, date } from '../../common';
import type { ReviewDoc } from './model';
import { ReviewContents, ReviewDocView, jumpTo, sectionRefs, stamp, useActiveSection, type DocSectionRef } from './ReviewDocView';
import { SendForReviewModal } from './SendForReview';
import { downloadFile, fileName, type PackFile } from './files';
import { useReviewDoc } from './useReviewDoc';
import '../../../../styles/planning.css';
import '../../../../styles/planning-review.css';

export const when = (iso?: string) => (iso ? `${date(iso)} ${new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}` : '—');
const initials = (n: string) => n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const DELIVERY_LABEL = { pdf: 'PDF attached', zip: 'ZIP package attached', link: 'link only' } as const;
const STATE_TONE = { Decided: 'success', Commented: 'info', Awaiting: 'neutral' } as const;
type Counts = Record<string, { open: number; total: number }>;

export function ReviewPage() {
  const { planId = '' } = useParams();
  const nav = useNavigate();
  const plan = usePlan(planId);
  const { doc, evaluation } = useReviewDoc(plan);
  const reviews = usePlanReviews(plan?.id);
  const comments = useReviewComments(plan?.id);
  const actions = usePlannerActions();
  const [side, setSide] = useState<'contents' | 'comments'>('contents');
  const [focus, setFocus] = useState<string | undefined>();
  const [deciding, setDeciding] = useState(false);
  const [sending, setSending] = useState(false);
  usePage([{ label: 'Plan & Build' }, { label: 'Planner', to: '/planning' }, { label: 'Plans', to: '/planning?tab=plans' }, { label: planId, to: `/planning/plans/${planId}` }, { label: 'Review' }], plan?.dataCenterId ? { dcId: plan.dataCenterId } : {});
  const refs = useMemo(() => (doc ? sectionRefs(doc) : []), [doc]);
  const active = useActiveSection(refs.map(r => r.id));
  const counts = useMemo(() => { const c: Counts = {}; for (const x of comments) if (!x.parentId) { const e = c[x.sectionId] ??= { open: 0, total: 0 }; e.total++; if (x.status === 'Open') e.open++; } return c; }, [comments]);
  if (!plan) return evaluation.templates.length ? <NotFound what="Plan" /> : <Loading />;
  if (!doc) return <Loading label="Building the review pack" />;
  const openN = comments.filter(c => !c.parentId && c.status === 'Open').length;
  const openComments = (s: DocSectionRef) => { setSide('comments'); setFocus(s.id); };
  return (
    <div className="page planning rv-page">
      <PageHead title={plan.title} chips={<><PlanStatusChip s={plan.status} /><Chip tone="neutral">Rev {plan.revision ?? 'A'}</Chip><Chip tone="info">Review</Chip></>}
        sub={<><span className="mono">{doc.meta.docNumber}</span> · <Link className="ent-link mono" to={`/planning/plans/${plan.id}`}>{plan.plnId}</Link> · {doc.meta.scopeLabel} · {doc.meta.site} · requested by {plan.requestedBy}</>}
        actions={<><Btn icon={I.Printer} onClick={printPlanArea}>Print</Btn><Btn icon={I.Send} onClick={() => setSending(true)} disabled={['Cancelled', 'Completed'].includes(plan.status)}>Send for review</Btn><Btn icon={I.ArrowLeft} onClick={() => nav(`/planning/plans/${plan.id}?tab=approvals`)}>Open plan</Btn></>} />

      <div className="rv-band">
        <DecisionPanel plan={plan} onDecide={() => setDeciding(true)} />
        <StatusPanel plan={plan} reviews={reviews} comments={comments} onSend={() => setSending(true)} onComments={() => { setSide('comments'); setFocus(undefined); }} />
        <FilesPanel doc={doc} />
      </div>

      <div className="rv-main">
        <ReviewDocView doc={doc} comments={counts} onComment={openComments} focus={side === 'comments' ? focus : undefined} />
        <aside className="rv-side" aria-label="Contents and comments">
          <div className="rv-side-head"><Seg<'contents' | 'comments'> value={side} onChange={setSide} options={[{ id: 'contents', label: 'Contents', icon: I.ListTree }, { id: 'comments', label: `Comments${openN ? ` · ${openN} open` : ''}`, icon: I.MessagesSquare }]} /></div>
          {side === 'contents'
            ? <div className="rv-side-body"><ReviewContents refs={refs} active={active} comments={counts} /></div>
            : <Comments plan={plan} refs={refs} comments={comments} focus={focus} setFocus={setFocus} active={active} reviewId={reviews.find(r => requestState(r, plan).open)?.id ?? reviews[0]?.id} actions={actions} />}
        </aside>
      </div>

      {deciding && <DecideModal plan={plan} review={evaluation.review} data={evaluation.data} actions={actions} onClose={changed => { setDeciding(false); if (changed) message.success('Decision recorded on the plan'); }} />}
      {sending && <SendForReviewModal plan={plan} onClose={() => setSending(false)} />}
      <PlannerToasts />
    </div>
  );
}

/* ---- decision: the approval path of this round, whose turn it is, and the same decide action as the Approvals tab */
function DecisionPanel({ plan, onDecide }: { plan: T.PlannerPlan; onDecide: () => void }) {
  const actions = usePlannerActions();
  const delegations = useDelegations();
  const { users } = useAuth();
  const turn = whoseTurn(plan);
  const steps = G.orderedSteps(plan.approvals);
  const auth = turn ? G.canDecide(plan, turn.step.step, { id: actions.actorId, name: actions.actor }, delegations, new Date(clockMs()).toISOString()) : undefined;
  const me = G.personOf({ id: actions.actorId, name: actions.actor });
  const status = plan.status;
  const lastDecided = [...steps].reverse().find(a => a.decision !== 'Pending');
  const switchTo = (name: string) => { const u = users.find(x => x.name === name); if (u) switchUser(u.id); };
  return (
    <Panel icon={I.ClipboardCheck} title="Decision" info="The plan's approval path for this round: steps are decided in order, the requester cannot approve and one person decides at most one step. Deciding here records the same decision as the plan's Approvals tab."
      sub={steps.length ? `Round ${G.currentRound(plan)} · ${steps.filter(a => a.decision !== 'Pending').length} of ${steps.length} steps decided` : 'Not submitted for approval'}
      actions={turn && auth?.ok ? <Btn variant="filled" size="sm" icon={I.ClipboardCheck} onClick={onDecide}>Decide: {turn.step.step}</Btn> : undefined}>
      {steps.length > 0 && <ol className="rv-steps">{steps.map((a, i) => <li key={a.step} className={a.decision === 'Pending' ? (turn?.step === a ? 'is-now' : undefined) : a.decision === 'Rejected' ? 'is-bad' : 'is-done'} title={`${a.step} · ${a.role}${a.person ? ` · ${a.person}` : ''} · ${a.decision}${a.at ? ` ${date(a.at)}` : ''}`}><i>{a.decision === 'Pending' ? i + 1 : a.decision === 'Rejected' ? '×' : '✓'}</i>{a.step}</li>)}</ol>}
      <div className="rv-turn">
        {turn ? <>
          <span>Next: <b>{turn.step.step}</b> · step {turn.index + 1} of {turn.total} · {turn.step.role}</span>
          <span className="vw-label">Whose turn: {turn.holders.length ? turn.holders.map(h => h.name).join(' or ') : 'nobody eligible holds the role (use a delegation)'}</span>
          {auth?.ok ? <span className="vw-label">You ({actions.actor}{me ? `, ${me.role}` : ''}) can decide this step{auth.onBehalfOf ? ` on behalf of ${auth.onBehalfOf}` : ''}.</span>
            : <span className="vw-label">{auth?.reason}{turn.holders.length > 0 && <span className="row wrap" style={{ gap: 6, marginTop: 6 }}>{turn.holders.map(h => <Btn key={h.id} size="sm" onClick={() => switchTo(h.name)}>Sign in as {h.name}</Btn>)}</span>}</span>}
        </> : status === 'In review' ? <span className="vw-label">Every step is decided.</span>
          : status === 'Draft' || status === 'Rejected' ? <span className="vw-label">{status === 'Rejected' && lastDecided ? `Rejected at ${lastDecided.step} by ${lastDecided.person ?? lastDecided.role}${lastDecided.reason ? `: ${lastDecided.reason}` : ''}. ` : ''}Reviewers can read and comment; decisions open once the plan is {status === 'Rejected' ? 'resubmitted' : 'submitted for approval'} (Send for review can submit it).</span>
          : <span className="vw-label">{status === 'On hold' ? 'The plan is on hold: nothing is decided while it is held.' : status === 'Cancelled' ? 'The plan is cancelled.' : `Approved${lastDecided?.at ? ` ${date(lastDecided.at)}` : ''}${lastDecided?.person ? ` (last step by ${lastDecided.person})` : ''}; the baseline is frozen. The plan is ${status.toLowerCase()}.`}</span>}
      </div>
    </Panel>
  );
}

/* ---- review status: the latest request, its reviewers and where each stands, comments, earlier requests */
function StatusPanel({ plan, reviews, comments, onSend, onComments }: { plan: T.PlannerPlan; reviews: PlanReviewRequest[]; comments: PlanReviewComment[]; onSend: () => void; onComments: () => void }) {
  const [mail, setMail] = useState<PlanReviewRequest | null>(null);
  const r = reviews[0];
  const st = r ? requestState(r, plan) : undefined;
  const roots = comments.filter(c => !c.parentId);
  const open = roots.filter(c => c.status === 'Open').length;
  return (
    <Panel icon={I.Users} title="Review status" count={reviews.length || undefined} info="Who was asked to review the plan, how it was sent, and where each reviewer stands: decided (a step of the round), commented, or awaiting. No email leaves the prototype; the request is recorded on the plan."
      sub={r ? <>Sent {when(r.requestedAt)} by {r.requestedBy} · {DELIVERY_LABEL[r.delivery]}</> : 'Not sent for review yet'}
      actions={r ? <><Chip tone={st!.tone} size="xs" dot>{st!.label}</Chip><Btn size="sm" variant="ghost" icon={I.Mail} onClick={() => setMail(r)}>Email</Btn></> : <Btn size="sm" icon={I.Send} onClick={onSend}>Send for review</Btn>}>
      {r ? <ul className="rv-people">{r.reviewers.map(p => { const s = reviewerState(p.name, r, plan, comments); return <li key={p.name}><span className="rv-c-av">{initials(p.name)}</span><span className="cell-2"><b style={{ fontWeight: 500 }}>{p.name}</b><small>{p.role}{s.detail ? ` · ${s.detail}` : ''}</small></span><Chip tone={STATE_TONE[s.state]} size="xs" dot>{s.state}</Chip></li>; })}</ul>
        : <p className="vw-label" style={{ margin: 0 }}>Send the review pack to the approvers of the plan's path: they read it here, comment per section and decide their step.</p>}
      <div className="row wrap" style={{ gap: 10, marginTop: 10, fontSize: 12.5 }}>
        <button type="button" className="rv-linkbtn" onClick={onComments}>{roots.length ? `${open} open · ${roots.length - open} resolved comment${roots.length - open === 1 ? '' : 's'}` : 'No comments yet'}</button>
        {reviews.length > 1 && <span className="vw-label">{reviews.length - 1} earlier request{reviews.length === 2 ? '' : 's'}: {reviews.slice(1, 4).map(x => `${x.revId} (${date(x.requestedAt)}, ${requestState(x, plan).label.toLowerCase()})`).join(', ')}</span>}
      </div>
      {mail && <Modal open onClose={() => setMail(null)} width={720} title={`Email of ${mail.revId}`} sub={`Recorded ${when(mail.requestedAt)} · not sent (prototype)`}>
        <div className="rv-mail"><div className="rv-mail-head"><span>From</span><b>{mail.requestedBy}</b><span>To</span><b>{mail.email.to.join(', ')}</b><span>Subject</span><b>{mail.email.subject}</b></div>
          <div className="rv-mail-body">{mail.email.body}</div>
          <div className="rv-mail-att">{mail.email.attachments.length ? mail.email.attachments.map(a => <span key={a.name} className="rv-att"><I.Paperclip size={14} />{a.name}<small>{a.bytes ? fmtBytes(a.bytes) : ''}</small></span>) : <span className="vw-label">No attachment: link only</span>}</div></div>
      </Modal>}
    </Panel>
  );
}

/* ---- the pack files (Agent A's builders) */
function FilesPanel({ doc }: { doc: ReviewDoc }) {
  const [busy, setBusy] = useState<PackFile | null>(null);
  const get = async (f: PackFile) => { setBusy(f); try { if (!(await downloadFile(doc, f))) message.warning('This file is not available yet.'); } catch (e) { message.error((e as Error).message); } finally { setBusy(null); } };
  const rows: { f: PackFile; label: string; sub: string; icon: I.LucideIcon }[] = [
    { f: 'pdf', label: fileName(doc, 'pdf'), sub: `Document · ${doc.sections.length} sections · ${doc.drawings.length} drawing${doc.drawings.length === 1 ? '' : 's'}`, icon: I.FileText },
    { f: 'xlsx', label: fileName(doc, 'xlsx'), sub: `Data workbook · ${doc.sheets.length} sheet${doc.sheets.length === 1 ? '' : 's'}`, icon: I.FileSpreadsheet },
    { f: 'zip', label: fileName(doc, 'zip'), sub: 'PDF, workbook, CSV, drawings, manifest', icon: I.FileArchive },
  ];
  return (
    <Panel icon={I.PackageOpen} title="Review pack" sub={`${doc.meta.docNumber} · generated ${stamp(doc.meta.generatedAt)}`} info="The same document as a PDF, the data behind it as a workbook, and the whole package as a ZIP (with CSV files, drawings and a manifest with checksums).">
      <ul className="rv-files">{rows.map(r => <li key={r.f}><r.icon size={16} className="muted" /><span className="cell-2"><b>{r.label}</b><small>{r.sub}</small></span><Btn size="sm" icon={busy === r.f ? I.LoaderCircle : I.Download} disabled={!!busy} onClick={() => void get(r.f)}>{busy === r.f ? 'Building' : 'Download'}</Btn></li>)}</ul>
    </Panel>
  );
}

/* ---- comments: threads per section, reply, resolve; the composer writes on the chosen section (else the one in view) */
function Comments({ plan, refs, comments, focus, setFocus, active, reviewId, actions }: { plan: T.PlannerPlan; refs: DocSectionRef[]; comments: PlanReviewComment[]; focus?: string; setFocus: (s?: string) => void; active?: string; reviewId?: string; actions: ReturnType<typeof usePlannerActions> }) {
  const [show, setShow] = useState<'open' | 'all'>('all');
  const [text, setText] = useState('');
  const [reply, setReply] = useState<{ id: string; text: string } | null>(null);
  const me = G.personOf({ id: actions.actorId, name: actions.actor });
  const target = refs.find(r => r.id === (focus ?? active)) ?? refs[0];
  const label = (id: string) => refs.find(r => r.id === id)?.label ?? id;
  const roots = comments.filter(c => !c.parentId && (!focus || c.sectionId === focus) && (show === 'all' || c.status === 'Open'));
  const order = new Map(refs.map((r, i) => [r.id, i]));
  roots.sort((a, b) => (order.get(a.sectionId) ?? 99) - (order.get(b.sectionId) ?? 99) || a.at.localeCompare(b.at));
  const post = () => { if (!target) return; const r = actions.commentOnReview(plan, { sectionId: target.id, sectionLabel: target.label, text, reviewId }); if (r.ok) { setText(''); setFocus(target.id); } };
  const send = () => { if (!reply) return; const root = comments.find(c => c.id === reply.id); if (!root) return; const r = actions.commentOnReview(plan, { sectionId: root.sectionId, sectionLabel: root.sectionLabel, text: reply.text, parentId: root.id, reviewId: root.reviewId }); if (r.ok) setReply(null); };
  const counts = (id?: string) => comments.filter(c => !c.parentId && (!id || c.sectionId === id)).length;
  return (
    <>
      <div className="rv-side-head" style={{ borderTop: 0, paddingTop: 0 }}>
        <SelectInput value={focus ?? '__all'} onChange={v => setFocus(v === '__all' ? undefined : v)} options={[{ id: '__all', label: `All sections (${counts()})` }, ...refs.map(r => ({ id: r.id, label: `${r.label}${counts(r.id) ? ` (${counts(r.id)})` : ''}` }))]} style={{ height: 32 }} />
        <Seg<'open' | 'all'> size="sm" value={show} onChange={setShow} options={[{ id: 'all', label: 'All' }, { id: 'open', label: 'Open only' }]} />
      </div>
      <div className="rv-side-body">
        {roots.length ? <ul className="rv-threads">{roots.map(c => {
          const replies = comments.filter(x => x.parentId === c.id);
          return (
            <li key={c.id} className={`rv-thread${c.status === 'Resolved' ? ' is-resolved' : ''}`} data-comment={c.id}>
              {!focus && <button type="button" className="rv-thread-sec" onClick={() => { setFocus(c.sectionId); jumpTo(c.sectionId); }}>{label(c.sectionId)}</button>}
              {[c, ...replies].map(x => <div key={x.id} className="rv-c"><span className="rv-c-av">{initials(x.author)}</span><div className="rv-c-main"><span className="rv-c-head"><b>{x.author}</b>{x.authorRole && <small>{x.authorRole}</small>}<small>{when(x.at)}</small>{x === c && c.status === 'Resolved' && <Chip tone="success" size="xs" dot>Resolved</Chip>}</span><span className="rv-c-text">{x.text}</span></div></div>)}
              {c.status === 'Resolved' && <small className="vw-label" style={{ display: 'block', marginTop: 6 }}>Resolved by {c.resolvedBy} {when(c.resolvedAt)}</small>}
              <div className="rv-c-acts">
                {c.status === 'Open' && <button type="button" className="rv-linkbtn" onClick={() => setReply(reply?.id === c.id ? null : { id: c.id, text: '' })}>Reply</button>}
                <button type="button" className="rv-linkbtn" onClick={() => actions.resolveReviewComment(plan, c.id, c.status === 'Open')}>{c.status === 'Open' ? 'Resolve' : 'Reopen'}</button>
              </div>
              {reply?.id === c.id && <div className="rv-reply"><TextArea rows={2} value={reply.text} onChange={v => setReply({ id: c.id, text: v })} placeholder="Reply" /><span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}><Btn size="sm" variant="ghost" onClick={() => setReply(null)}>Cancel</Btn><Btn size="sm" variant="filled" disabled={reply.text.trim().length < 2} onClick={send}>Reply</Btn></span></div>}
            </li>
          );
        })}</ul> : <p className="vw-label" style={{ margin: 0 }}>{focus ? `No ${show === 'open' ? 'open ' : ''}comments on ${label(focus)} yet.` : show === 'open' ? 'No open comments.' : 'No comments yet. Use the comment button on a section heading, or write below.'}</p>}
      </div>
      <div className="rv-side-foot">
        <span className="vw-label">Comment on <b>{target?.label}</b> as {actions.actor}{me ? ` (${me.role})` : ''}</span>
        <TextArea rows={3} value={text} onChange={setText} placeholder="What should change, or what needs an answer?" />
        <span className="row" style={{ justifyContent: 'flex-end' }}><Btn size="sm" variant="filled" icon={I.MessageSquarePlus} disabled={text.trim().length < 2} onClick={post}>Comment</Btn></span>
      </div>
    </>
  );
}
