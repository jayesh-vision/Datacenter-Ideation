/* MACD request page (/macd/requests/:id): where the request is (stage line + SLA clock), the next step as the primary action, what and
   where (rack → DCIM, devices, customer), charges and the change request it runs under (→ Change management), the task list with the
   system each task updates, the feasibility checks against the live estate, and the history with notes. */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { MACD_EDITABLE, actMacd, getMacd, noteMacd, useQuery } from '../../api';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Chip, Empty, Modal, Panel } from '../../ui/kit';
import { DcLink, NeLink } from '../../ui/status';
import { fmtDateTime } from '../../lib/format';
import { useToast } from '../ops/shared';
import { KindChip, OBJ_ICON, PrioChip, SlaChip, StageChip, Stepper, hrs, isOpen, money, mrcLine, slaLine } from './common';
import { Checks, NewRequest } from './NewRequest';
import '../../styles/delivery.css';
import '../../styles/ipam.css';
import '../../styles/secops.css';
import '../../styles/macd.css';

type Act = Parameters<typeof actMacd>[1];
const F = ({ k, children }: { k: string; children: React.ReactNode }) => <div className="so-f"><dt>{k}</dt><dd>{children}</dd></div>;

export function MacdRequestPage() {
  const { id = '' } = useParams();
  const { data } = useQuery(getMacd, []);
  const toast = useToast();
  const [ask, setAsk] = useState<{ act: Act; title: string; label: string; required: boolean } | null>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const nav = useNavigate();
  const r = data?.requests.find(x => x.id === id);
  usePage([{ label: 'Operate' }, { label: 'MACD', to: '/macd' }, { label: 'Requests', to: '/macd?tab=requests' }, { label: id }], r ? { dcId: r.dcId } : {});
  if (!data) return <Loading />;
  if (!r) return <div className="page"><Empty icon={I.Shuffle} title={`${id} not found`}><Link className="ent-link" to="/macd?tab=requests">All requests →</Link></Empty></div>;
  const run = (a: Act, ok: string, n?: string) => actMacd(r.id, a, n).then(() => { toast.show(ok, `${r.id} · ${r.title}`); setAsk(null); setText(''); if (a === 'discard') nav('/macd?tab=requests'); }).catch(e => toast.show('Not done', String(e.message ?? e)));
  const draft = r.stage === 'Draft', editable = MACD_EDITABLE.includes(r.stage);
  const fails = r.checks.filter(c => c.result === 'Fail');
  const crWaiting = r.stage === 'Scheduled' && r.changeStatus !== 'Approved' && r.changeStatus !== 'In progress';
  const primary = (() => {
    switch (r.stage) {
      case 'Draft': return <Btn variant="filled" icon={I.Send} onClick={() => run('submit', 'Submitted: feasibility checks run')}>Submit request</Btn>;
      case 'Submitted': case 'Feasibility': return <Btn variant="filled" icon={I.CircleCheck} disabled={!!fails.length} title={fails.length ? `Failing: ${fails.map(f => f.label).join(', ')}` : undefined} onClick={() => run('accept', r.billable ? 'Feasible: quote sent' : 'Feasible: scheduled')}>{r.billable ? 'Feasible, send the quote' : 'Feasible, schedule it'}</Btn>;
      case 'Quote': return <Btn variant="filled" icon={I.FileCheck2} onClick={() => run('quote', 'Quote accepted: scheduled')}>Customer accepted the quote</Btn>;
      case 'Scheduled': return <Btn variant="filled" icon={I.Play} disabled={crWaiting || !!r.changeBlocked} title={crWaiting ? `${r.changeId} is ${r.changeStatus?.toLowerCase()}` : r.changeBlocked} onClick={() => run('start', 'Work started')}>Start the work</Btn>;
      case 'In progress': return <Btn variant="filled" icon={I.ClipboardCheck} onClick={() => setAsk({ act: 'complete', title: 'Work done', label: 'What was done (optional)', required: false })}>Work done, verify</Btn>;
      case 'Verification': return <Btn variant="filled" icon={I.BadgeCheck} onClick={() => run('verify', 'Verified and closed')}>Verified, close</Btn>;
      default: return null;
    }
  })();
  const Ic = OBJ_ICON[r.object];
  const done = r.tasks.filter(t => t.state === 'Done').length;
  return (
    <div className="page macd mc-page">
      <PageHead icon={<span className="mc-ico"><Ic size={20} /></span>} title={r.title}
        sub={<span className="mc-sub"><span className="mono">{r.id}</span> · {r.object} · <DcLink id={r.dcId} />{r.room ? ` · ${r.room}` : ''} · {draft ? 'draft saved' : 'submitted'} {fmtDateTime(r.created)} by {r.requester}</span>}
        chips={<><KindChip k={r.kind} /><StageChip s={r.stage} /><SlaChip s={r.sla} draft={draft} /><PrioChip p={r.priority} /></>}
        actions={<>
          {primary}
          {editable && <Btn icon={I.Pencil} onClick={() => setEditing(true)}>{draft ? 'Edit draft' : 'Edit request'}</Btn>}
          {draft && <Btn icon={I.Trash2} onClick={() => setAsk({ act: 'discard', title: 'Discard the draft', label: 'Note (optional): the draft is deleted, nothing was submitted', required: false })}>Discard</Btn>}
          {r.stage === 'Verification' && <Btn icon={I.Undo2} onClick={() => setAsk({ act: 'rework', title: 'Verification failed', label: 'What failed', required: true })}>Failed verification</Btn>}
          {['Submitted', 'Feasibility', 'Quote'].includes(r.stage) && <Btn icon={I.Ban} onClick={() => setAsk({ act: 'reject', title: r.stage === 'Quote' ? 'Customer declined the quote' : 'Reject the request', label: 'Reason (sent to the requester)', required: true })}>Reject</Btn>}
          {['Submitted', 'Feasibility', 'Quote', 'Scheduled'].includes(r.stage) && <Btn icon={I.X} onClick={() => setAsk({ act: 'cancel', title: 'Cancel the request', label: 'Reason (optional)', required: false })}>Cancel</Btn>}
        </>} />

      <section className="vw-card-section mc-track">
        <Stepper r={r} />
        <div className="mc-clock">
          <span><em>Due</em><b>{draft ? `Set when submitted (${hrs(r.slaLeftH)} SLA)` : fmtDateTime(r.due)}</b></span>
          <span><em>SLA</em><b className={r.sla === 'Breached' || r.sla === 'Missed' ? 'so-bad' : ''}>{slaLine(r)}</b></span>
          {r.window && <span><em>Work window</em><b>{fmtDateTime(r.window.start)} · {hrs((r.window.end - r.window.start) / 36e5)}</b></span>}
          {r.completedAt && <span><em>Closed</em><b>{fmtDateTime(r.completedAt)}{r.firstTimeRight === false ? ' · after re-work' : ''}</b></span>}
          {r.reason && <span><em>{r.stage === 'Rejected' ? 'Rejected' : 'Reason'}</em><b>{r.reason}</b></span>}
        </div>
        {crWaiting && r.changeId && <p className="mc-note"><I.Hourglass size={14} /> The work starts once <Link className="ent-link mono" to={`/changes/${r.changeId}`}>{r.changeId}</Link> is approved in Change management ({r.changeStatus?.toLowerCase()}).</p>}
        {r.changeBlocked && <p className="mc-note so-bad"><I.OctagonAlert size={14} /> {r.changeId} cannot run now: {r.changeBlocked}</p>}
      </section>

      <div className="dl-dash">
        <Panel className="dl-span-7" title="What and where" icon={I.MapPin} info="The request as submitted: what changes, where (datacenter, hall, rack and the target of a move), for whom and how much space and power it adds or releases.">
          <dl className="so-facts">
            <F k="Request">{r.detail}</F>
            <F k="Datacenter"><DcLink id={r.dcId} /></F>
            <F k={r.kind === 'Move' ? 'From' : 'Rack'}>{r.rackId ? <Link className="ent-link mono" to={`/dcim/racks/${r.rackId}`}>{r.rackName}</Link> : '—'}{r.room ? <small>{r.room}</small> : null}</F>
            {r.toRackId && <F k="To"><Link className="ent-link mono" to={`/dcim/racks/${r.toRackId}`}>{r.toRackName}</Link></F>}
            <F k="For">{r.customerId ? <Link className="ent-link" to={`/customers/${r.customerId}`}>{r.customerName}</Link> : 'Internal'}<small>{r.requester} · {r.channel}</small></F>
            <F k="Quantity">{r.qty} {r.unit}{r.qty === 1 || r.unit === 'kW' ? '' : 's'}</F>
            <F k="Rack space">{r.uDelta ? `${r.uDelta > 0 ? '+' : ''}${r.uDelta} U` : '—'}</F>
            <F k="Power">{r.kwDelta ? `${r.kwDelta > 0 ? '+' : ''}${r.kwDelta} kW` : '—'}</F>
            {r.neIds.length > 0 && <F k="Devices">{r.neIds.map(n => <NeLink key={n} id={n}>{n.replace(/^[A-Z]{2}-DC-\d{3}-/, '')}</NeLink>).reduce<React.ReactNode[]>((a, x, i) => (i ? [...a, ', ', x] : [x]), [])}</F>}
            {r.ref && <F k="Order">{r.ref}</F>}
            <F k="Owner">{r.owner}</F>
          </dl>
        </Panel>
        <Panel className="dl-span-5" title="Charges and change request" icon={I.Receipt} info="One-time (NRC) and monthly (MRC) charges from the catalogue, posted to BSS when the request is verified; the change request it runs under and its state in Change management; the DCIM space hold and the work order.">
          <div className="mc-pv-figs">
            <span><em>One-time</em><b>{r.billable ? money(r.nrc) : '—'}</b></span>
            <span><em>Monthly</em><b>{r.billable ? mrcLine(r.mrcDelta) : '—'}</b></span>
          </div>
          <dl className="so-facts">
            <F k="Change request">{r.changeId ? <><Link className="ent-link mono" to={`/changes/${r.changeId}`}>{r.changeId}</Link> {r.changeStatus && <Chip tone={r.changeStatus === 'Pending approval' ? 'orange' : r.changeStatus === 'Completed' ? 'success' : 'info'}>{r.changeStatus}</Chip>}</> : <span className="vw-label">raised when it is scheduled</span>}</F>
            <F k="Space hold">{r.holdId ? <Link className="ent-link mono" to={`/dcim/racks/${r.toRackId ?? r.rackId}?tab=reserved`}>{r.holdId}</Link> : r.uDelta > 0 && (r.kind === 'Add' || r.kind === 'Move') ? <span className="vw-label">{isOpen(r) ? 'held when it is scheduled' : '—'}</span> : '—'}</F>
            <F k="Work order">{r.workRef ?? '—'}</F>
            <F k="Billing">{!r.billable ? 'Not billed (internal or no charge)' : r.stage === 'Completed' ? 'Posted to BSS' : 'Posted to BSS at verification'}</F>
          </dl>
        </Panel>

        <Panel className="dl-span-7" title="Tasks" icon={I.ListChecks} count={`${done}/${r.tasks.length}`} info="The steps this request type runs, in order, and the system each one updates (SynapseDC, the customer, BSS, Change management, DCIM, the field team, Inventory, IP Management). The open one is what the request waits on.">
          <ul className="mc-tasks">{r.tasks.map(t => (
            <li key={t.key} className={`is-${t.state.toLowerCase()}`}>
              <i>{t.state === 'Done' ? <I.Check size={12} /> : t.state === 'Skipped' ? <I.Minus size={12} /> : t.state === 'Open' ? <I.ArrowRight size={12} /> : null}</i>
              <span className="mc-t"><b>{t.title}</b><small>{t.system}{t.ref ? ` · ${t.ref}` : ''}</small></span>
              <Chip tone={t.state === 'Done' ? 'success' : t.state === 'Open' ? 'info' : 'neutral'}>{t.state}</Chip>
            </li>))}</ul>
        </Panel>
        <Panel className="dl-span-5" title="Feasibility" icon={I.ScanSearch} count={r.checks.length || undefined} info="Checked against the live estate: free U in the rack (DCIM free slots, holds included), rack power after the change against the budget (80% line), the tenant's contracted kW, rack inlet temperature, free panel ports, free GPU nodes, change freezes and open Critical / High incidents at the site.">
          {r.checks.length ? <Checks checks={r.checks} /> : <p className="vw-label">Checked at submission; {r.stage === 'Completed' ? 'the request is closed.' : 'nothing to check now.'}</p>}
        </Panel>

        <Panel className="dl-span-12" title="History" icon={I.History} count={r.history.length} info="Every step with who did it; notes added here are kept on the request.">
          <ol className="mc-hist">{r.history.map((h, i) => <li key={i}><time>{fmtDateTime(h.at)}</time><span><b>{h.by}</b> {h.text}</span></li>)}</ol>
          <div className="mc-addnote"><input className="input" placeholder="Add a note for the team or the customer" value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && note.trim()) noteMacd(r.id, note).then(() => setNote('')); }} />
            <Btn icon={I.MessageSquarePlus} disabled={!note.trim()} onClick={() => noteMacd(r.id, note).then(() => setNote(''))}>Add note</Btn></div>
        </Panel>
      </div>

      {ask && <Modal open onClose={() => setAsk(null)} title={ask.title} sub={`${r.id} · ${r.title}`}
        foot={<div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><Btn onClick={() => setAsk(null)}>Back</Btn><Btn variant="filled" disabled={ask.required && !text.trim()} onClick={() => run(ask.act, ask.title, text)}>{ask.title}</Btn></div>}>
        <label className="field"><span className="field-label">{ask.label}</span><textarea className="input" rows={3} value={text} onChange={e => setText(e.target.value)} autoFocus /></label>
      </Modal>}
      {editing && <NewRequest all={data} dcId={r.dcId} cat={r.catalogId} rack={r.rackId ?? ''} edit={r} onClose={() => setEditing(false)} toast={toast.show} />}
      {toast.node}
    </div>
  );
}

