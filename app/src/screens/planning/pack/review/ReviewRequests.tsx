/* Review requests and comments on the plan page: the note under the header (open request) and the panel on the Approvals tab. */
import { Link, useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import type * as T from '../../../../planner/p2b/types';
import { requestState, reviewerState } from '../../../../planner/lib/reviews';
import { usePlanReviews, useReviewComments } from '../../../../planner/lib/usePlanner';
import { Btn, Chip, Panel } from '../../../../ui/kit';
import { date } from '../../common';
import { reviewUrl } from './lazy';

const STATE_TONE = { Decided: 'success', Commented: 'info', Awaiting: 'neutral' } as const;
const HOW = { pdf: 'PDF', zip: 'ZIP', link: 'Link' } as const;

/** One line under the plan header while a review request is open. */
export function ReviewNote({ plan }: { plan: T.PlannerPlan }) {
  const reviews = usePlanReviews(plan.id); const comments = useReviewComments(plan.id);
  const r = reviews.find(x => requestState(x, plan).open);
  if (!r) return null;
  const open = comments.filter(c => !c.parentId && c.status === 'Open').length;
  return <p className="note note--info"><I.MessagesSquare size={15} /><span>Review <b>{r.revId}</b> sent {date(r.requestedAt)} by {r.requestedBy} to {r.reviewers.map(x => x.name).join(', ')} · {open ? `${open} open comment${open === 1 ? '' : 's'}` : 'no open comments'} · <Link className="ent-link" to={reviewUrl(plan.id)}>Open the review page</Link></span></p>;
}

/** Approvals tab: every review request with its reviewers and where they stand, and the open comments by section. */
export function ReviewRequestsPanel({ plan, onSend }: { plan: T.PlannerPlan; onSend: () => void }) {
  const nav = useNavigate();
  const reviews = usePlanReviews(plan.id); const comments = useReviewComments(plan.id);
  const roots = comments.filter(c => !c.parentId);
  const open = roots.filter(c => c.status === 'Open');
  return (
    <div className="pn-two">
      <Panel title="Review requests" icon={I.Send} count={reviews.length || undefined} info="Each time the review pack was sent: to whom, how (PDF, ZIP or a link only), and where each reviewer stands. No email leaves the prototype; the request is recorded here and in the history."
        actions={<><Btn size="sm" icon={I.BookOpenCheck} onClick={() => nav(reviewUrl(plan.id))}>Review page</Btn><Btn size="sm" icon={I.Send} onClick={onSend} disabled={['Cancelled', 'Completed'].includes(plan.status)}>Send for review</Btn></>}>
        {reviews.length ? <ul className="pn-list">{reviews.map(r => { const st = requestState(r, plan); return (
          <li key={r.id}><Chip tone={st.tone} size="xs" dot>{st.label}</Chip><span className="cell-2"><b style={{ fontWeight: 500 }}><span className="mono">{r.revId}</span> · {r.docNumber} · round {r.round} · {HOW[r.delivery]}</b>
            <small>Sent {date(r.requestedAt)} by {r.requestedBy}{r.message ? ` · “${r.message.length > 90 ? `${r.message.slice(0, 87)}…` : r.message}”` : ''}</small>
            <span className="row wrap" style={{ gap: 6, marginTop: 4 }}>{r.reviewers.map(p => { const s = reviewerState(p.name, r, plan, comments); return <Chip key={p.name} tone={STATE_TONE[s.state]} size="xs" title={`${p.role}${s.detail ? ` · ${s.detail}` : ''}`}>{p.name} · {s.state.toLowerCase()}</Chip>; })}</span></span></li>); })}</ul>
          : <p className="vw-label" style={{ margin: 0 }}>Not sent for review yet. Send for review records who should read the pack and shows them the email that would go out.</p>}
      </Panel>
      <Panel title="Review comments" icon={I.MessagesSquare} count={open.length || undefined} sub={roots.length ? `${open.length} open · ${roots.length - open.length} resolved` : undefined} info="Comments reviewers left on the sections of the review document; open ones first. Reply and resolve them on the review page.">
        {roots.length ? <ul className="pn-list">{[...open, ...roots.filter(c => c.status !== 'Open')].slice(0, 8).map(c => <li key={c.id}><Chip tone={c.status === 'Open' ? 'warning' : 'success'} size="xs" dot>{c.status}</Chip><span className="cell-2"><b style={{ fontWeight: 400 }}>{c.text.length > 140 ? `${c.text.slice(0, 137)}…` : c.text}</b><small>{c.author} · {c.sectionLabel} · {date(c.at)}{comments.some(x => x.parentId === c.id) ? ` · ${comments.filter(x => x.parentId === c.id).length} repl${comments.filter(x => x.parentId === c.id).length === 1 ? 'y' : 'ies'}` : ''}</small></span></li>)}</ul>
          : <p className="vw-label" style={{ margin: 0 }}>No comments yet.</p>}
        {roots.length > 8 && <Link className="ent-link" to={reviewUrl(plan.id)}>All {roots.length} comments on the review page</Link>}
      </Panel>
    </div>
  );
}
