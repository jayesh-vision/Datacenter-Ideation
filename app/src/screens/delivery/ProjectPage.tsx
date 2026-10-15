/* Project page (/delivery/projects/:id): milestones against today, work orders (start / complete, each with its change request),
   purchase orders, commissioning L1–L5 (run in order), permits and design documents, history; Hand over once L5 passed. */
import { Link, useParams, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { advanceWorkOrder, clockNow, getDeliveryProject, handoverProject, receivePurchaseOrder, runCxTest, useQuery } from '../../api';
import type { DeliveryProjectView } from '../../api/types';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Chip, Panel, Tabs } from '../../ui/kit';
import { DataTable } from '../../ui/DataTable';
import { DcLink } from '../../ui/status';
import { SummaryStrip } from '../site/SummaryStrip';
import { fmtDate, fmtMoney } from '../../lib/format';
import { useToast } from '../ops/shared';
import { NotFound } from '../NotFound';
import { SCOPE_ICON, SCOPE_LABEL } from './scopes';
import { HEALTH_TONE, STATE_TONE, WO_TONE } from './Delivery';
import '../../styles/dcim.css';
import '../../styles/planner.css';
import '../../styles/ipam.css';

type Tab = 'milestones' | 'workorders' | 'procurement' | 'commissioning' | 'permits' | 'history';

export function ProjectPage() {
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'milestones';
  const setTab = (t: Tab) => { const n = new URLSearchParams(sp); t === 'milestones' ? n.delete('tab') : n.set('tab', t); setSp(n, { replace: true }); };
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
        sub={<><span className="mono">{p.id}</span> · {SCOPE_LABEL[p.scope]} · <DcLink id={p.dcId} /> · manager {p.manager} · from plan <Link className="ent-link mono" to={`/planning/plans/${p.planId}`}>{p.planId}</Link></>}
        actions={<>
          {nextTest && testReady && p.state !== 'Mobilising' && <Btn icon={I.ClipboardCheck} onClick={() => run(() => runCxTest(p.id, nextTest.level), `L${nextTest.level} passed`, nextTest.name)}>Run L{nextTest.level} test</Btn>}
          {data.canHandover && <Btn variant="filled" icon={I.Handshake} onClick={() => run(() => handoverProject(p.id), 'Handed over to operations', 'The plan and its capacity plans are now Delivered.')}>Hand over to operations</Btn>}
        </>} />
      <SummaryStrip items={[
        { key: 'p', label: 'Progress', value: `${Math.round(p.progress * 100)}%`, sub: `plan ${Math.round(p.plannedProgress * 100)}% by today`, tone: p.spi < 0.9 ? 'warn' : undefined, info: 'Work done against the schedule. Planned = elapsed share of the schedule today.' },
        { key: 'b', label: 'Budget', value: fmtMoney(p.budget), sub: `${fmtMoney(p.earned)} earned · ${fmtMoney(p.actual)} spent`, info: 'The plan\'s CapEx; earned = budget × progress, spent = actual cost to date.' },
        { key: 'c', label: 'CPI · SPI', value: `${p.cpi} · ${p.spi}`, sub: p.cpi < 0.95 ? 'over cost' : p.spi < 0.97 ? 'behind schedule' : 'on plan', tone: p.cpi < 0.95 || p.spi < 0.9 ? 'warn' : undefined, info: 'Cost performance = earned ÷ spent; schedule performance = progress ÷ planned progress. 1.00 = exactly on plan.' },
        { key: 'f', label: 'Finish', value: fmtDate(p.finish), sub: `target ${fmtDate(p.target)}`, tone: p.finish > p.target ? 'bad' : undefined, info: 'End of the schedule from the lead times, against the plan\'s target date.' },
        { key: 'w', label: 'Work orders', value: `${p.openWorkOrders} open`, sub: `of ${p.workOrders}`, onClick: () => setTab('workorders'), info: 'Field work; each carries its own change request (CR-…).' },
        { key: 'x', label: 'Commissioning', value: p.cxLevel ? `L${p.cxLevel} passed` : 'not started', sub: `${p.snags} snags open`, onClick: () => setTab('commissioning'), info: 'L1 factory witness → L2 site acceptance → L3 pre-functional → L4 functional → L5 integrated systems test.' }
      ]} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'milestones', label: 'Milestones', count: data.milestones.length }, { id: 'workorders', label: 'Work orders', count: data.workOrders.length }, { id: 'procurement', label: 'Purchase orders', count: data.pos.length }, { id: 'commissioning', label: 'Commissioning' }, { id: 'permits', label: 'Permits & design' }, { id: 'history', label: 'History' }]} />
      {tab === 'milestones' && <Milestones v={data} />}
      {tab === 'workorders' && <section className="vw-card-section dcim-table"><DataTable rows={data.workOrders} pageSize={20} defaultSort={{ key: 'w', dir: 'asc' }} cols={[
        { key: 'id', header: 'Work order', wrap: true, render: w => <span className="cell-2"><b className="mono">{w.id}</b><small>{w.title}</small></span> },
        { key: 'c', header: 'Crew', render: w => <span className="cell-2"><span>{w.crew}</span><small>{w.kind}</small></span> },
        { key: 'w', header: 'Window', sort: w => w.start, render: w => <span className="cell-2"><span className="nowrap">{fmtDate(w.start)}</span><small className="nowrap">to {fmtDate(w.end)}</small></span> },
        { key: 'r', header: 'Racks', render: w => w.rackIds.length ? <span className="row wrap" style={{ gap: 4 }}>{w.rackIds.map(r => <Link key={r} className="ent-link mono" to={`/dcim/racks/${encodeURIComponent(r)}`}>{r.split('-').slice(-2).join('-')}</Link>)}</span> : <span className="vw-label">—</span> },
        { key: 'k', header: 'Kit', render: w => <Chip tone={w.kit === 'Ready' ? 'success' : w.kit === 'Partial' ? 'warning' : 'neutral'} size="xs">{w.kit}</Chip> },
        { key: 'ch', header: 'Change', render: w => <span className="cell-2"><span className="mono">{w.changeId}</span><small>{w.changeState}</small></span> },
        { key: 's', header: 'Status', render: w => <Chip tone={WO_TONE[w.state]} dot>{w.state}</Chip> },
        { key: 'a', header: '', render: w => w.state !== 'Done' ? <Btn size="sm" onClick={() => run(() => advanceWorkOrder(w.id), `${w.id} ${w.state === 'In progress' ? 'completed' : 'started'}`)}>{w.state === 'In progress' ? 'Complete' : 'Start'}</Btn> : null }]} /></section>}
      {tab === 'procurement' && <section className="vw-card-section dcim-table"><DataTable rows={data.pos} pageSize={20} defaultSort={{ key: 'd', dir: 'asc' }} cols={[
        { key: 'id', header: 'PO', render: o => <span className="mono">{o.id}</span> },
        { key: 'i', header: 'Item', wrap: true, render: o => <span className="cell-2"><b>{o.item}</b><small>{o.lines ? `${o.lines.length} line${o.lines.length === 1 ? '' : 's'} · ${o.contract ? `contract ${o.contract}` : 'no supply contract'}` : `${o.qty} × ${fmtMoney(o.unitCost)}`}</small></span> },
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
      {toast.node}
    </div>
  );
}

function Milestones({ v }: { v: DeliveryProjectView }) {
  const now = clockNow();
  const t0 = Math.min(...v.milestones.map(m => m.start)), t1 = Math.max(v.project.finish, v.project.target, now);
  const x = (t: number) => `${((t - t0) / Math.max(1, t1 - t0)) * 100}%`;
  const right = (t: number) => (t - t0) / Math.max(1, t1 - t0) > 0.8;
  return (
    <Panel title="Milestones" icon={I.CalendarRange} info="The plan's schedule; the line is today. Long-lead items (amber) are ordered at approval.">
      <div className="pl-gantt">
        {v.milestones.map(m => <div key={m.name} className="pl-g-row"><span className="pl-g-l"><b>{m.name}</b><small>{m.state === 'done' ? 'done' : m.state === 'active' ? 'in progress' : 'upcoming'} · {fmtDate(m.start)} – {fmtDate(m.end)}</small></span>
          <span className="pl-g-track"><i className={`${m.longLead ? 'is-ll' : ''}${m.state === 'done' ? ' is-done' : ''}`} style={{ left: x(m.start), width: `calc(${x(m.end)} - ${x(m.start)})` }} /><b className="pl-g-now" style={{ left: x(now) }} /></span></div>)}
        <div className="pl-g-row pl-g-axis"><span className="pl-g-l" /><span className="pl-g-track">
          <em style={{ left: x(now), transform: right(now) ? 'translateX(-100%)' : undefined }} className="pl-g-target">today</em>
          <em style={{ left: x(v.project.finish), transform: right(v.project.finish) ? 'translateX(-100%)' : undefined }} className={`pl-g-finish${v.project.finish > v.project.target ? ' late' : ''}`}>finish {fmtDate(v.project.finish)}</em>
        </span></div>
      </div>
    </Panel>
  );
}
