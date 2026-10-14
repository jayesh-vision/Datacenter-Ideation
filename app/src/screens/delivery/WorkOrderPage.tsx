/* Work order page (/delivery/work-orders/:id, 14-Oct-2026, P2B gap fill step B): one piece of field work as a dashboard — where it is
   (stage), what and where, who and site access, the checklist with its back-out plan, kit, the change request, the P10 process with
   its open tasks, sign-off / failure and history. */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { advanceWorkOrder, assignWorkOrder, failWorkOrder, getWfInstance, getWorkOrder, requestWorkOrderAccess, retryWorkOrder, signOffWorkOrder, tickWorkOrderCheck, useQuery } from '../../api';
import type { WorkOrder } from '../../api/types';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Chip, Field, Modal, Panel } from '../../ui/kit';
import { DataTable } from '../../ui/DataTable';
import { DcLink } from '../../ui/status';
import { fmtDate, fmtDateTime, fmtMoney } from '../../lib/format';
import { useToast } from '../ops/shared';
import { NotFound } from '../NotFound';
import { WO_TONE } from './Delivery';
import { TaskCard } from '../workorders/parts';
import { BpmnView } from '../workorders/BpmnView';
import '../../styles/delivery.css';
import '../../styles/workorders.css';

const STAGES: WorkOrder['state'][] = ['Planned', 'Ready', 'In progress', 'Done'];

export function WorkOrderPage() {
  const { id = '' } = useParams();
  const { data: d, loading } = useQuery(() => getWorkOrder(id), [id]);
  const { data: proc } = useQuery(() => (d?.process ? getWfInstance(d.process.id) : Promise.resolve(null)), [d?.process?.id, d?.process?.stepIndex]);
  const [form, setForm] = useState<'assign' | 'signoff' | 'fail' | 'access' | null>(null);
  const toast = useToast();
  usePage([{ label: 'Plan & Build' }, { label: 'Delivery', to: '/delivery' }, { label: d?.project.id ?? '…', to: d ? `/delivery/projects/${d.project.id}` : undefined }, { label: id }], d ? { dcId: d.wo.dcId } : {});
  if (loading && !d) return <Loading />;
  if (!d) return <NotFound what="Work order" />;
  const w = d.wo;
  const run = (f: () => Promise<unknown>, ok: string, body?: string) => f().then(() => toast.show(ok, body)).catch(e => toast.show('Not done', String(e.message ?? e)));
  const stage = w.state === 'Awaiting change' ? 1 : w.state === 'Failed' ? 2 : STAGES.indexOf(w.state);
  const doneN = d.checklist.filter(c => c.done).length;
  return (
    <div className="page dcim planner">
      <PageHead title={w.title} icon={<span className="pl-icon"><I.HardHat size={18} /></span>}
        chips={<><Chip tone={WO_TONE[w.state]} dot>{w.state}</Chip><Chip tone="neutral">{w.kind}</Chip><Chip tone={w.crewKind === 'Contractor' ? 'orange' : 'info'}>{w.crewKind}</Chip></>}
        sub={<><span className="mono">{w.id}</span> · <Link className="ent-link" to={`/delivery/projects/${d.project.id}`}>{d.project.name}</Link> · <DcLink id={w.dcId} /> · change <span className="mono">{d.change?.id}</span></>}
        actions={<>
          {w.state !== 'Done' && <Btn icon={I.Users} onClick={() => setForm('assign')}>Change assignment</Btn>}
          {(w.state === 'Ready' || w.state === 'Planned' || w.state === 'Awaiting change') && <Btn variant="filled" icon={I.Play} onClick={() => run(() => advanceWorkOrder(w.id), 'Work started', `${w.changeId} is now in progress.`)}>Start work</Btn>}
          {w.state === 'In progress' && <><Btn icon={I.CircleX} onClick={() => setForm('fail')}>Record failure</Btn><Btn variant="filled" icon={I.BadgeCheck} onClick={() => setForm('signoff')}>Sign off as complete</Btn></>}
          {w.state === 'Failed' && <Btn variant="filled" icon={I.RotateCcw} onClick={() => run(() => retryWorkOrder(w.id), 'Re-planned', 'The work order is ready to start again.')}>Re-plan</Btn>}
        </>} />

      <section className="wo-hero">
        <ol className="dl-stages wo-stages">{STAGES.map((s, k) => (
          <li key={s} className={k < stage || w.state === 'Done' ? 'is-done' : k === stage ? (w.state === 'Failed' ? 'is-fail' : 'is-on') : ''}>
            <span className="dl-st-dot">{k < stage || w.state === 'Done' ? <I.Check size={13} /> : k === stage && w.state === 'Failed' ? <I.X size={13} /> : k + 1}</span><b>{k === stage && w.state === 'Failed' ? 'Failed' : k === 1 && w.state === 'Awaiting change' ? 'Awaiting change' : s}</b>
            {k === stage && <small>{w.state === 'Awaiting change' ? (w.kit !== 'Ready' ? `kit ${w.kit.toLowerCase()}` : `${w.changeId} not approved`) : w.state === 'In progress' ? `${doneN} of ${d.checklist.length} checks done` : w.state === 'Failed' ? 'back-out applied' : w.state === 'Ready' ? 'kit on site, change approved' : w.state === 'Planned' ? `window opens ${fmtDate(w.start)}` : ''}</small>}
          </li>))}</ol>
        <div className="wo-hero-f"><small>Window</small><b>{fmtDate(w.start)} – {fmtDate(w.end)}</b><em>{Math.max(1, Math.round((w.end - w.start) / 864e5))} days</em></div>
        <div className="wo-hero-f"><small>Crew</small><b>{w.crew}</b><em>{d.technician ? `lead ${d.technician}` : w.crewKind}</em></div>
        <div className="wo-hero-f"><small>Kit</small><b>{w.kit}</b><em>{d.pos.filter(o => o.state === 'Delivered').length} of {d.pos.length} orders on site</em></div>
      </section>

      <div className="dl-dash">
        <Panel className="dl-span-6" title="What and where" icon={I.MapPin}>
          <dl className="wo-kv">
            <div><dt>Type of work</dt><dd>{w.kind}</dd></div><div><dt>Project</dt><dd><Link className="ent-link" to={`/delivery/projects/${d.project.id}`}>{d.project.id}</Link> · {d.project.state}</dd></div>
            <div><dt>Site</dt><dd><DcLink id={w.dcId} /></dd></div><div><dt>Programme</dt><dd>{d.project.programmeId ? <Link className="ent-link" to={`/delivery/programmes/${d.project.programmeId}`}>{d.project.programmeId}</Link> : '—'}</dd></div>
            <div className="wo-kv-wide"><dt>Racks</dt><dd>{w.rackIds.length ? <span className="row wrap" style={{ gap: 4 }}>{w.rackIds.map(r => <Link key={r} className="ent-link mono" to={`/dcim/racks/${encodeURIComponent(r)}`}>{r.split('-').slice(-2).join('-')}</Link>)}</span> : 'The work area of the project'}</dd></div>
          </dl>
        </Panel>
        <Panel className="dl-span-6" title="Who and site access" icon={I.BadgeCheck} actions={d.access.state === 'Not requested' ? <Btn size="sm" icon={I.DoorOpen} onClick={() => setForm('access')}>Request access</Btn> : undefined}>
          <dl className="wo-kv">
            <div><dt>Crew</dt><dd>{w.crew}</dd></div><div><dt>Lead technician</dt><dd>{d.technician ?? '—'}</dd></div>
            <div><dt>Site access</dt><dd><Chip tone={d.access.state === 'Checked in' ? 'success' : d.access.state === 'Not requested' ? 'warning' : d.access.state === 'Not needed' ? 'neutral' : 'info'} size="xs" dot>{d.access.state}</Chip></dd></div>
            <div><dt>Zones</dt><dd>{d.access.zones || '—'}</dd></div>
            {d.access.instanceId && <div className="wo-kv-wide"><dt>Visit</dt><dd><Link className="ent-link" to={`/workorders/instances/${encodeURIComponent(d.access.instanceId)}`}>Access request {d.access.instanceId.replace('WF-', '')}</Link></dd></div>}
          </dl>
        </Panel>
        <Panel className="dl-span-6" title="Checklist" icon={I.ListChecks} sub={`${doneN} of ${d.checklist.length} done`} info="The method statement as steps; tick them while the work is in progress. Sign-off needs every step done.">
          <ul className="wo-check">{d.checklist.map(c => (
            <li key={c.id} className={c.done ? 'is-done' : ''}><button type="button" disabled={w.state !== 'In progress'} onClick={() => run(() => tickWorkOrderCheck(w.id, c.id), c.done ? 'Step reopened' : 'Step done')}>
              <span className="wo-check-box">{c.done && <I.Check size={12} />}</span><span>{c.text}</span>{c.by && <small>{c.by}</small>}</button></li>))}</ul>
        </Panel>
        <Panel className="dl-span-6" title={d.failure ? 'Failure' : d.signoff ? 'Sign-off' : 'Back-out plan'} icon={d.failure ? I.CircleX : d.signoff ? I.BadgeCheck : I.Undo2}>
          {d.failure ? <div className="wo-out is-fail"><b>{d.failure.reason}</b><small>Recorded by {d.failure.by} · {fmtDateTime(d.failure.at)} · back-out applied: {d.backout}</small></div>
            : d.signoff ? <dl className="wo-kv"><div><dt>Work done by</dt><dd>{d.signoff.doneBy}</dd></div><div><dt>Confirmed by</dt><dd>{d.signoff.confirmedBy}</dd></div><div><dt>Customer witness</dt><dd>{d.signoff.witness ? 'Yes' : 'No'}</dd></div><div><dt>When</dt><dd>{fmtDateTime(d.signoff.at)}</dd></div><div className="wo-kv-wide"><dt>Notes</dt><dd>{d.signoff.notes || '—'}</dd></div></dl>
            : <div className="wo-out"><b>If it goes wrong</b><small>{d.backout}</small></div>}
        </Panel>
        <Panel className="dl-span-6" title="Kit and materials" icon={I.Package} count={d.pos.length} flush>
          <DataTable rows={d.pos} pageSize={6} empty={<p className="vw-label" style={{ padding: 16 }}>No equipment needed: the work uses what is on site.</p>} cols={[
            { key: 'i', header: 'Item', wrap: true, render: o => <span className="cell-2"><b>{o.item}</b><small>{o.qty} × · {o.supplier}</small></span> },
            { key: 'd', header: 'Due', render: o => <span className="nowrap">{fmtDate(o.due)}</span> },
            { key: 'v', header: 'Value', render: o => <span className="rev-amt">{fmtMoney(o.total)}</span> },
            { key: 's', header: 'State', render: o => <Chip tone={o.state === 'Delivered' ? 'success' : o.state === 'Late' ? 'error' : o.state === 'In transit' ? 'info' : 'neutral'} size="xs" dot>{o.state}</Chip> }]} />
        </Panel>
        <Panel className="dl-span-6" title="Change request" icon={I.GitPullRequestArrow} actions={d.change && <Link className="ent-link" to={`/changes/${d.change.id}`}>Open change →</Link>}>
          {d.change && <dl className="wo-kv"><div><dt>Change</dt><dd className="mono">{d.change.id}</dd></div><div><dt>Status</dt><dd><Chip tone={/Approved|Completed|Implemented/.test(d.change.status) ? 'success' : /progress/i.test(d.change.status) ? 'purple' : 'warning'} size="xs" dot>{d.change.status}</Chip></dd></div><div><dt>Class</dt><dd>{d.change.cls}</dd></div><div><dt>Risk</dt><dd>{d.change.risk}</dd></div></dl>}
        </Panel>
        {proc && <Panel className="dl-span-12" title={`Process · ${proc.process.pid} ${proc.process.name}`} icon={I.Workflow} actions={<Link className="ent-link" to={`/workorders/instances/${encodeURIComponent(proc.instance.id)}`}>Open in the process console →</Link>}
          info="The field work-order process this work order runs through; the current step's task can be claimed and completed here.">
          <BpmnView processKey={proc.process.key} done={proc.instance.history.map(h => h.step)} current={proc.instance.state === 'Completed' ? undefined : proc.instance.step} incident={proc.instance.state === 'Incident'} height={340} />
          {proc.instance.state === 'Incident' && <p className="note note--warning" style={{ marginTop: 12 }}><I.TriangleAlert size={15} /><span>{proc.instance.incidentText}</span></p>}
          {proc.tasks.map(t => <TaskCard key={t.id} t={t} me="Jayesh Verma" onDone={(m, err) => toast.show(err ? 'Not done' : m, err ? m : undefined)} />)}
        </Panel>}
        <Panel className="dl-span-12" title="History" icon={I.History}>
          {d.history.length ? <ul className="pl-hist">{d.history.map((h, i) => <li key={i}><small>{fmtDateTime(h.at)}</small><span><b>{h.who}</b> — {h.text}</span></li>)}</ul> : <p className="vw-label">No changes recorded yet.</p>}
        </Panel>
      </div>
      <AssignModal open={form === 'assign'} w={w} tech={d.technician} onClose={() => setForm(null)} onSave={x => { setForm(null); run(() => assignWorkOrder(w.id, x), 'Assignment changed'); }} />
      <SignOffModal open={form === 'signoff'} open2={d.checklist.filter(c => !c.done).length} onClose={() => setForm(null)} onSave={x => { setForm(null); run(() => signOffWorkOrder(w.id, x), 'Signed off', `${w.changeId} is implemented and waits for its review.`); }} />
      <TextModal open={form === 'fail'} title="Record the work as failed" sub="The back-out plan is applied and the work order can be re-planned." label="What went wrong" placeholder="e.g. Wrong optics delivered" ok="Record failure" required onClose={() => setForm(null)} onSave={r => { setForm(null); run(() => failWorkOrder(w.id, r), 'Recorded as failed'); }} />
      <TextModal open={form === 'access'} title="Request site access" sub={`For ${w.crew}; security approves the zones, then the crew checks in.`} label="Zones" initial={w.rackIds.length ? `${w.rackIds.length} racks in the hall` : 'Work area and route'} ok="Request" onClose={() => setForm(null)} onSave={z => { setForm(null); run(() => requestWorkOrderAccess(w.id, z), 'Access requested', 'It is now a task for security.'); }} />
      {toast.node}
    </div>
  );
}

function AssignModal({ open, w, tech, onClose, onSave }: { open: boolean; w: WorkOrder; tech?: string; onClose: () => void; onSave: (x: { crewKind: WorkOrder['crewKind']; crew: string; technician?: string }) => void }) {
  const [kind, setKind] = useState<WorkOrder['crewKind']>(w.crewKind); const [crew, setCrew] = useState(w.crew); const [t, setT] = useState(tech ?? '');
  if (!open) return null;
  return (
    <Modal open onClose={onClose} title="Who does the work" foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" disabled={!crew.trim()} onClick={() => onSave({ crewKind: kind, crew, technician: t || undefined })}>Save assignment</Btn></>}>
      <div className="dcim-form">
        <Field label="Kind"><select className="select" value={kind} onChange={e => { const k = e.target.value as WorkOrder['crewKind']; setKind(k); if (k === 'Own technicians') setCrew('Own technicians'); }}><option>Own technicians</option><option>Contractor</option></select></Field>
        <Field label={kind === 'Contractor' ? 'Contractor company' : 'Crew'}><input className="input" value={crew} onChange={e => setCrew(e.target.value)} /></Field>
        <Field label="Lead technician" style={{ gridColumn: '1 / -1' }}><input className="input" value={t} onChange={e => setT(e.target.value)} placeholder="Name" /></Field>
      </div>
    </Modal>
  );
}
function SignOffModal({ open, open2, onClose, onSave }: { open: boolean; open2: number; onClose: () => void; onSave: (x: { confirmedBy: string; witness: boolean; notes: string }) => void }) {
  const [by, setBy] = useState(''); const [wit, setWit] = useState(false); const [notes, setNotes] = useState('');
  if (!open) return null;
  return (
    <Modal open onClose={onClose} title="Sign off as complete" sub={open2 ? `${open2} checklist step${open2 === 1 ? '' : 's'} still open: tick them first.` : 'Every checklist step is done.'} foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.BadgeCheck} disabled={open2 > 0} onClick={() => onSave({ confirmedBy: by, witness: wit, notes })}>Sign off</Btn></>}>
      <div className="dcim-form">
        <Field label="Confirmed by"><input className="input" value={by} onChange={e => setBy(e.target.value)} placeholder="You, if blank" /></Field>
        <Field label="Customer witness"><label className="ipam-check"><input type="checkbox" checked={wit} onChange={e => setWit(e.target.checked)} /><span>The customer witnessed the work</span></label></Field>
        <Field label="Notes" style={{ gridColumn: '1 / -1' }}><input className="input" value={notes} onChange={e => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function TextModal({ open, title, sub, label, placeholder, initial = '', ok, required, onClose, onSave }: { open: boolean; title: string; sub: string; label: string; placeholder?: string; initial?: string; ok: string; required?: boolean; onClose: () => void; onSave: (v: string) => void }) {
  const [v, setV] = useState(initial);
  if (!open) return null;
  return (
    <Modal open onClose={onClose} title={title} sub={sub} foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" disabled={required && !v.trim()} onClick={() => onSave(v)}>{ok}</Btn></>}>
      <Field label={label} required={required}><input className="input" value={v} onChange={e => setV(e.target.value)} placeholder={placeholder} autoFocus /></Field>
    </Modal>
  );
}
