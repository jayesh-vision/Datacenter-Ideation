/* Project page (/delivery/projects/:id): milestones against today, work orders (start / complete, each with its change request),
   purchase orders, commissioning L1–L5 (run in order), permits and design documents, history; Hand over once L5 passed. */
import { Link, useParams, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { advanceWorkOrder, getDeliveryProject, handoverProject, receivePurchaseOrder, runCxTest, setRiskState, startDeliveryProject, useQuery } from '../../api';
import { useState } from 'react';
import { ChangeOrderModal, CostTab, ProjectDashboard, ProjectHero, RiskModal, Schedule } from './project-tabs';
import { RiskList } from './ProgrammePage';
import '../../styles/delivery.css';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Chip, Panel, Tabs } from '../../ui/kit';
import { DataTable } from '../../ui/DataTable';
import { DcLink } from '../../ui/status';
import { fmtDate, fmtMoney } from '../../lib/format';
import { useToast } from '../ops/shared';
import { NotFound } from '../NotFound';
import { SCOPE_ICON, SCOPE_LABEL } from './scopes';
import { HEALTH_TONE, STATE_TONE, WO_TONE } from './Delivery';
import '../../styles/dcim.css';
import '../../styles/planner.css';
import '../../styles/ipam.css';

type Tab = 'overview' | 'schedule' | 'workorders' | 'procurement' | 'commissioning' | 'risks' | 'cost' | 'permits' | 'history';

export function ProjectPage() {
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('tab');
  const tab = ((raw === 'milestones' ? 'schedule' : raw) as Tab) || 'overview';
  const setTab = (t: Tab) => { const n = new URLSearchParams(sp); t === 'overview' ? n.delete('tab') : n.set('tab', t); setSp(n, { replace: true }); };
  const [form, setForm] = useState<'co' | 'risk' | null>(null);
  const { data, loading } = useQuery(() => getDeliveryProject(id), [id]);
  const toast = useToast();
  usePage([{ label: 'Plan & Build' }, { label: 'Delivery', to: '/delivery' }, { label: id }], data ? { dcId: data.project.dcId } : {});
  if (loading && !data) return <Loading />;
  if (!data) return <NotFound what="Project" />;
  const { project: p } = data;
  const Ic = SCOPE_ICON[p.scope];
  const run = (f: () => Promise<unknown>, ok: string, body?: string) => f().then(() => toast.show(ok, body)).catch(e => toast.show('Not done', String(e.message ?? e)));
  const nextTest = data.tests.find(t => t.state !== 'Passed');
  const testReady = !!nextTest && (nextTest.level < 3 || data.workOrders.every(w => w.kind === 'Commissioning' || w.state === 'Done'));
  return (
    <div className="page dcim planner">
      <PageHead title={p.name} icon={<span className="pl-icon"><Ic size={18} /></span>} chips={<><Chip tone={STATE_TONE[p.state]} dot>{p.state}</Chip><Chip tone={HEALTH_TONE[p.health]} dot>{p.health}</Chip></>}
        sub={<><span className="mono">{p.id}</span> · {p.template ?? SCOPE_LABEL[p.scope]} · <DcLink id={p.dcId} /> · manager {p.manager}{p.planId ? <> · from plan <Link className="ent-link mono" to={`/planning/plans/${p.planId}`}>{p.planId}</Link></> : ' · template project'}{p.programmeId ? <> · <Link className="ent-link" to={`/delivery/programmes/${p.programmeId}`}>programme {p.programmeId}</Link></> : null}</>}
        actions={<>
          {p.template && p.state === 'Mobilising' && !p.waitsOn?.length && <Btn icon={I.Play} onClick={() => run(() => startDeliveryProject(p.id), 'Project started', 'Crews are mobilised and its purchase orders placed.')}>Start project</Btn>}
          {nextTest && testReady && p.state !== 'Mobilising' && <Btn icon={I.ClipboardCheck} onClick={() => run(() => runCxTest(p.id, nextTest.level), `L${nextTest.level} passed`, nextTest.name)}>Run L{nextTest.level} test</Btn>}
          {data.canHandover && <Btn variant="filled" icon={I.Handshake} onClick={() => run(() => handoverProject(p.id), 'Handed over to operations', 'The plan and its capacity plans are now Delivered.')}>Hand over to operations</Btn>}
        </>} />
      {p.waitsOn?.length ? <p className="note note--info"><I.DoorClosed size={15} /><span>Waiting at its programme gate: work cannot start until {p.waitsOn.map((w, i) => <span key={w}>{i ? ', ' : ''}<Link className="ent-link" to={`/delivery/projects/${w}`}>{w}</Link></span>)} {p.waitsOn.length === 1 ? 'is' : 'are'} delivered.</span></p> : null}
      <ProjectHero v={data} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'schedule', label: 'Schedule' }, { id: 'workorders', label: 'Work orders', count: data.workOrders.length }, { id: 'procurement', label: 'Purchase orders', count: data.pos.length }, { id: 'commissioning', label: 'Commissioning' }, { id: 'risks', label: 'Risks', count: data.risks.filter(r => r.state !== 'Closed').length }, { id: 'cost', label: 'Cost', count: data.changeOrders.length || undefined }, { id: 'permits', label: 'Permits & design' }, { id: 'history', label: 'History' }]} />
      {tab === 'overview' && <ProjectDashboard v={data} onTab={t => setTab(t as Tab)} run={run} />}
      {tab === 'schedule' && <Schedule v={data} />}
      {tab === 'risks' && <Panel title="Risk register" icon={I.ShieldAlert} count={data.risks.filter(r => r.state !== 'Closed').length} actions={<Btn size="sm" icon={I.Plus} onClick={() => setForm('risk')}>Raise a risk</Btn>}
        info="Risks the delivery data flags by itself (late or long-lead orders, permits close to their date, cost or schedule slipping, open snags, contractor crews in live areas) and the ones raised by hand. Score = likelihood × impact (1–25).">
        <RiskList risks={[...data.risks].sort((a, b) => (a.state === 'Closed' ? 1 : 0) - (b.state === 'Closed' ? 1 : 0) || b.likelihood * b.impact - a.likelihood * a.impact)} actions={(rid, st) => <span className="row" style={{ gap: 4 }}>
          {st === 'Open' && <Btn size="sm" onClick={() => run(() => setRiskState(rid, 'Mitigating'), 'Risk being mitigated')}>Mitigate</Btn>}
          {st !== 'Closed' ? <Btn size="sm" onClick={() => run(() => setRiskState(rid, 'Closed'), 'Risk closed')}>Close</Btn> : <Btn size="sm" onClick={() => run(() => setRiskState(rid, 'Open'), 'Risk reopened')}>Reopen</Btn>}</span>} />
      </Panel>}
      {tab === 'cost' && <CostTab v={data} onRaise={() => setForm('co')} run={run} />}
      {tab === 'workorders' && <section className="vw-card-section dcim-table"><DataTable rows={data.workOrders} pageSize={20} defaultSort={{ key: 'w', dir: 'asc' }} cols={[
        { key: 'id', header: 'Work order', wrap: true, render: w => <span className="cell-2"><Link className="ent-link mono" to={`/delivery/work-orders/${w.id}`} onClick={e => e.stopPropagation()}>{w.id}</Link><small>{w.title}</small></span> },
        { key: 'c', header: 'Crew', render: w => <span className="cell-2"><span>{w.crew}</span><small>{w.kind}</small></span> },
        { key: 'w', header: 'Window', sort: w => w.start, render: w => <span className="cell-2"><span className="nowrap">{fmtDate(w.start)}</span><small className="nowrap">to {fmtDate(w.end)}</small></span> },
        { key: 'r', header: 'Racks', render: w => w.rackIds.length ? <span className="row wrap" style={{ gap: 4 }}>{w.rackIds.map(r => <Link key={r} className="ent-link mono" to={`/dcim/racks/${encodeURIComponent(r)}`}>{r.split('-').slice(-2).join('-')}</Link>)}</span> : <span className="vw-label">—</span> },
        { key: 'k', header: 'Kit', render: w => <Chip tone={w.kit === 'Ready' ? 'success' : w.kit === 'Partial' ? 'warning' : 'neutral'} size="xs">{w.kit}</Chip> },
        { key: 'ch', header: 'Change', render: w => <span className="cell-2"><span className="mono">{w.changeId}</span><small>{w.changeState}</small></span> },
        { key: 's', header: 'Status', render: w => <Chip tone={WO_TONE[w.state]} dot>{w.state}</Chip> },
        { key: 'a', header: '', render: w => w.state !== 'Done' ? <Btn size="sm" onClick={() => run(() => advanceWorkOrder(w.id), `${w.id} ${w.state === 'In progress' ? 'completed' : 'started'}`)}>{w.state === 'In progress' ? 'Complete' : 'Start'}</Btn> : null }]} /></section>}
      {tab === 'procurement' && <section className="vw-card-section dcim-table"><DataTable rows={data.pos} pageSize={20} defaultSort={{ key: 'd', dir: 'asc' }} cols={[
        { key: 'id', header: 'PO', render: o => <span className="mono">{o.id}</span> },
        { key: 'i', header: 'Item', wrap: true, render: o => <span className="cell-2"><b>{o.item}</b><small>{o.qty} × {fmtMoney(o.unitCost)}</small></span> },
        { key: 's', header: 'Supplier', render: o => o.supplier },
        { key: 'l', header: 'Lead time', render: o => `${o.leadWeeks} weeks` },
        { key: 'd', header: 'Due', sort: o => o.due, render: o => <span className="nowrap">{fmtDate(o.due)}</span> },
        { key: 't', header: 'Value', sort: o => o.total, render: o => <span className="rev-amt">{fmtMoney(o.total)}</span> },
        { key: 'st', header: 'State', render: o => <Chip tone={o.state === 'Delivered' ? 'success' : o.state === 'Late' ? 'error' : o.state === 'In transit' ? 'info' : 'neutral'} dot>{o.state}</Chip> },
        { key: 'a', header: '', render: o => o.state !== 'Delivered' && p.state !== 'Mobilising' ? <Btn size="sm" onClick={() => run(() => receivePurchaseOrder(o.id), `${o.id} received`, 'Work orders that needed it now have their kit on site.')}>Receive</Btn> : null }]} /></section>}
      {tab === 'commissioning' && <Panel title="Commissioning L1–L5" icon={I.ClipboardCheck} info="Run in order; start-up testing (L3+) needs the installation work orders done. Handover follows a passed L5.">
        <ol className="pl-steps">{data.tests.map(t => <li key={t.level} className={t.state === 'Passed' ? 'is-approved' : t.state === 'Scheduled' ? 'is-pending' : ''}><span className="pl-step-n">L{t.level}</span><span className="cell-2"><b>{t.name}</b><small>{t.scope} · due {fmtDate(t.due)} · witness {t.witness}{t.snags ? ` · ${t.snags} snags` : ''} · {t.state}</small></span></li>)}</ol>
      </Panel>}
      {tab === 'permits' && <div className="pl-ov">
        <Panel title="Permits" icon={I.Stamp} count={data.permits.length} flush>{data.permits.length ? <DataTable rows={data.permits} pageSize={10} cols={[
          { key: 'n', header: 'Permit', wrap: true, render: x => <span className="cell-2"><b>{x.name}</b><small>{x.authority}</small></span> },
          { key: 'd', header: 'Needed by', render: x => <span className="nowrap">{fmtDate(x.due)}</span> },
          { key: 's', header: 'State', render: x => <Chip tone={x.state === 'Granted' ? 'success' : x.state === 'Submitted' ? 'info' : 'warning'} dot>{x.state}</Chip> }]} /> : <p className="vw-label" style={{ padding: 16 }}>No permit needed for this scope.</p>}</Panel>
        <Panel title="Design documents" icon={I.FileText} count={data.docs.length} flush><DataTable rows={data.docs} pageSize={10} cols={[
          { key: 'k', header: 'Document', render: x => <b>{x.kind}</b> }, { key: 'r', header: 'Rev', render: x => <span className="mono">{x.rev}</span> }, { key: 'a', header: 'Author', render: x => x.author },
          { key: 's', header: 'State', render: x => <Chip tone={x.state === 'In review' ? 'info' : x.state === 'Draft' ? 'neutral' : 'success'} dot>{x.state}</Chip> }]} /></Panel>
      </div>}
      {tab === 'history' && <Panel title="History" icon={I.History}><ul className="pl-hist">{[...data.history].reverse().map((h, i) => <li key={i}><small>{fmtDate(h.at)}</small><span><b>{h.who}</b> — {h.text}</span></li>)}</ul></Panel>}
      <ChangeOrderModal open={form === 'co'} pid={p.id} budget={p.budgetApproved} onClose={() => setForm(null)} onDone={t => { setForm(null); toast.show(t, 'It waits for its approver on the Cost tab.'); }} />
      <RiskModal open={form === 'risk'} pid={p.id} onClose={() => setForm(null)} onDone={t => { setForm(null); toast.show(t); }} />
      {toast.node}
    </div>
  );
}
