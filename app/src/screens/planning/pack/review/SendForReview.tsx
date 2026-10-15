/* "Send for review": pick reviewers (the holders of the approving roles on the plan's path, never its requester), write a message, choose
   what goes with the email (the PDF, the ZIP package, or a link only) and see the email that would be sent. Recording it writes a review
   request (planReviews, audited on the plan); a draft can be submitted for approval at the same time. The prototype sends no email. */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import * as I from 'lucide-react';
import type * as T from '../../../../planner/p2b/types';
import * as G from '../../../../planner/lib/governance';
import { blockers } from '../../../../planner/lib/wizardModel';
import { defaultReviewers, fmtBytes, reviewCandidates, type PlanReviewRequest, type ReviewAttachment, type ReviewDelivery, type ReviewEmail } from '../../../../planner/lib/reviews';
import { usePlannerActions } from '../../../../planner/lib/usePlanner';
import { personOf } from '../../../../planner/lib/governance';
import { message } from '../../../../planner/compat/notify';
import { Btn, CheckBox, Field, Modal, Seg } from '../../../../ui/kit';
import { CheckLabel, TextArea } from '../../common';
import type { ReviewDoc } from './model';
import { attachmentsFor } from './files';
import { useReviewDoc } from './useReviewDoc';
import { reviewUrl } from './lazy';
import '../../../../styles/planning-review.css';

/** A form field around controls that are buttons (the kit's Field is a <label>, which would forward clicks to the first button). */
const FieldBox = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => <div className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</div>;

const firstName = (n: string) => n.split(' ')[0];

/** The email a review request sends (subject, plain-text body with the summary and the link, attachments). */
export function composeEmail(doc: ReviewDoc, i: { plan: T.PlannerPlan; to: string[]; message: string; delivery: ReviewDelivery; link: string; attachments: ReviewAttachment[]; from: string; fromRole?: string; deciding: boolean }): ReviewEmail {
  const m = doc.meta;
  const subject = `${i.deciding ? 'Decision requested' : 'Comments requested'}: ${m.plnId} rev ${m.revision} · ${m.title}`;
  const steps = i.plan.approvals.length ? G.orderedSteps(i.plan.approvals) : [];
  const next = G.nextPendingStep(i.plan);
  const lines = [
    `Hello ${i.to.length ? i.to.map(firstName).join(', ') : 'all'},`, '',
    ...(i.message.trim() ? [i.message.trim(), ''] : []),
    `${m.title} (${m.plnId}, revision ${m.revision}, document ${m.docNumber}) is ready for your ${i.deciding ? 'review and decision' : 'review and comments'}.`, '',
    'Summary',
    `- ${m.scopeLabel} at ${m.site}${m.neededBy ? `, needed by ${m.neededBy}` : ''}`,
    ...m.headline.map(h => `- ${h.label}: ${h.value}${h.sub ? ` (${h.sub})` : ''}`),
    `- Verdict: ${m.verdict.text}`, '',
    ...(doc.ask.decision ? ['Decision asked', doc.ask.decision, ''] : []),
    ...(doc.ask.changesSinceLast?.length ? ['Changes since the last round', ...doc.ask.changesSinceLast.map(c => `- ${c}`), ''] : []),
    ...(steps.length && i.deciding ? ['Approval path', ...steps.map((a, k) => `${k + 1}. ${a.step} (${a.role})${a.person ? ` · ${a.person}` : ''} · ${a.decision}${a === next ? ' ← next' : ''}`), ''] : []),
    `Open the review page to read the document, comment on any section${i.deciding ? ' and record your decision' : ''}:`, i.link, '',
    ...(i.attachments.length ? [i.delivery === 'zip' ? `Attached: the review package (${i.attachments.map(a => `${a.name}, ${a.bytes ? fmtBytes(a.bytes) : 'size when built'}`).join('; ')}) with the PDF, the data workbook, CSV files and the drawings.` : `Attached: the review pack as a PDF (${i.attachments.map(a => `${a.name}, ${a.bytes ? fmtBytes(a.bytes) : 'size when built'}`).join('; ')}).`, ''] : ['Nothing is attached: the document, workbook and drawings are on the review page.', '']),
    'Regards,', i.from + (i.fromRole ? `\n${i.fromRole}` : ''),
  ];
  return { to: i.to, subject, body: lines.join('\n'), link: i.link, attachments: i.attachments };
}

export function SendForReviewModal({ plan, onClose }: { plan: T.PlannerPlan; onClose: (sent?: PlanReviewRequest) => void }) {
  const actions = usePlannerActions();
  const { doc, template, evaluation } = useReviewDoc(plan);
  const cands = useMemo(() => reviewCandidates(plan, template), [plan, template]);
  const [picked, setPicked] = useState<string[] | null>(null);
  const chosen = picked ?? defaultReviewers(cands);
  const [msg, setMsg] = useState('');
  const [delivery, setDelivery] = useState<ReviewDelivery>('pdf');
  const [att, setAtt] = useState<{ key: string; list: ReviewAttachment[] } | null>(null);
  const editable = G.isEditable(plan);
  const preferred = evaluation.scenarios.find(x => x.scenario.id === plan.preferredScenarioId);
  const submitEv = preferred?.ev ?? evaluation.base;
  const submitBlockers = submitEv ? blockers(plan, submitEv, template, evaluation.data).filter(b => b.level === 'bad') : [];
  const canSubmit = editable && !!submitEv && !submitBlockers.length;
  const [submitToo, setSubmitToo] = useState(true);
  const deciding = plan.status === 'In review' || (canSubmit && submitToo);
  const me = personOf({ id: actions.actorId, name: actions.actor });
  const link = `${window.location.origin}${reviewUrl(plan.id)}`;
  const key = `${doc?.meta.docNumber}|${delivery}`;
  useEffect(() => {
    if (!doc) return; let live = true;
    void attachmentsFor(doc, delivery).then(list => { if (live) setAtt({ key, list }); }, () => { if (live) setAtt({ key, list: [] }); });
    return () => { live = false; };
  }, [doc, delivery, key]);
  const attachments = att?.key === key ? att.list : delivery === 'link' ? [] : undefined;
  const email = doc ? composeEmail(doc, { plan, to: chosen, message: msg, delivery, link, attachments: attachments ?? [], from: actions.actor, fromRole: me?.role, deciding }) : undefined;
  const toggle = (n: string) => setPicked(chosen.includes(n) ? chosen.filter(x => x !== n) : [...chosen, n]);
  const send = () => {
    if (!doc || !email) return;
    if (canSubmit && submitToo && submitEv) {
      const r = actions.submitForReview(plan, { ev: submitEv, scenario: preferred?.scenario ?? null });
      if (!r.ok) return;
    }
    const reviewers = chosen.map(n => ({ name: n, role: cands.find(c => c.person.name === n)?.person.role ?? '' }));
    const r = actions.requestReview(plan, { reviewers, message: msg.trim(), delivery, email, docNumber: doc.meta.docNumber });
    if (r.ok) { message.success(`Review ${r.value?.id} recorded and shown to ${reviewers.map(x => x.name).join(', ')}${canSubmit && submitToo ? '; the plan is submitted for approval' : ''}. No email is sent in this prototype.`); onClose(r.value); }
  };
  return (
    <Modal open onClose={() => onClose()} width={1040} title={`Send ${plan.plnId} for review`} sub={doc ? `${doc.meta.docNumber} · ${plan.title}` : plan.title}
      foot={<div className="row" style={{ justifyContent: 'space-between', gap: 8 }}><span className="vw-label row" style={{ gap: 6 }}><I.Info size={14} />Prototype: no email leaves the app. The request is recorded on the plan and shown to the reviewers in the planner.</span><span className="row" style={{ gap: 8 }}><Btn onClick={() => onClose()}>Cancel</Btn><Btn variant="filled" icon={I.Send} disabled={!chosen.length || !doc || attachments === undefined} onClick={send}>{canSubmit && submitToo ? 'Submit and send' : 'Record and send'}</Btn></span></div>}>
      <div className="rv-send">
        <div className="col" style={{ gap: 12, minWidth: 0 }}>
          <FieldBox label={`Reviewers (${chosen.length})`} hint="People holding the roles on the plan's approval path; the requester and the submitter are left out.">
            {cands.length ? <ul className="rv-pick">{cands.map(c => (
              <li key={c.person.id}><label><CheckBox on={chosen.includes(c.person.name)} label={c.person.name} onChange={() => toggle(c.person.name)} /><span className="cell-2"><b style={{ fontWeight: 500 }}>{c.person.name}</b><small>{c.person.role}{c.step !== c.person.role ? ` · ${c.step}` : ""}</small></span></label></li>
            ))}</ul> : <p className="vw-label" style={{ margin: 0 }}>The plan's template names no approving roles.</p>}
          </FieldBox>
          <Field label="Message"><TextArea rows={3} value={msg} onChange={setMsg} placeholder={deciding ? 'e.g. Please review the design basis and the cost before Friday; Finance decides on the CapEx.' : 'e.g. Early look before we submit: comments on the layout and the power chain welcome.'} /></Field>
          <FieldBox label="Send as"><Seg<ReviewDelivery> value={delivery} onChange={setDelivery} options={[{ id: 'pdf', label: 'PDF attached', icon: I.FileText }, { id: 'zip', label: 'ZIP package', icon: I.FileArchive }, { id: 'link', label: 'Link only', icon: I.Link }]} /></FieldBox>
          {editable && <div className="col" style={{ gap: 6 }}>
            {canSubmit ? <CheckLabel on={submitToo} onChange={setSubmitToo} label={`Submit for approval as well (round ${G.currentRound(plan)})`} />
              : <p className="note note--warn" style={{ margin: 0 }}><I.TriangleAlert size={15} /><span>The plan is a {plan.status.toLowerCase()} and cannot be submitted yet ({submitBlockers.length} item{submitBlockers.length === 1 ? '' : 's'} block it): reviewers can read and comment; decisions open once it is submitted.</span></p>}
          </div>}
        </div>
        <div className="rv-mail" aria-label="Email preview">
          <div className="rv-mail-head">
            <span>From</span><b>{actions.actor}{me ? ` · ${me.role}` : ''}</b>
            <span>To</span><b>{chosen.length ? chosen.join(', ') : '—'}</b>
            <span>Subject</span><b>{email?.subject ?? '…'}</b>
          </div>
          <div className="rv-mail-body">{email?.body ?? 'Building the review pack…'}</div>
          <div className="rv-mail-att">{delivery === 'link' ? <span className="vw-label">No attachment: link to the review page only</span>
            : attachments === undefined ? <span className="vw-label">Building the attachment…</span>
            : attachments.map(a => <span key={a.name} className="rv-att">{delivery === 'zip' ? <I.FileArchive size={14} /> : <I.FileText size={14} />}{a.name}<small>{a.bytes ? fmtBytes(a.bytes) : 'built on download'}</small></span>)}</div>
        </div>
      </div>
    </Modal>
  );
}
