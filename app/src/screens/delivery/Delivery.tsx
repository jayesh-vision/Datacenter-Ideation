/* Delivery (Plan & Build, 13-Oct-2026: P2B merge phase 5). Approved plans as projects, their work orders (each with its change request),
   purchase orders, commissioning L1–L5, permits and design documents. Tabs `?tab=`. Everything is derived from the planner (mock/delivery.ts). */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { advanceWorkOrder, getDelivery, getPlannerQueue, getProgrammes, useQuery } from '../../api';
import { DeliveryOverview } from './Overview';
import { NewProgrammeModal, NewProjectWizard, PROG_ICON, RAG_LABEL, RAG_TONE } from './parts';
import '../../styles/delivery.css';
import type { DeliveryProject, WorkOrder } from '../../api/types';
import { usePage, PageHead, Loading } from '../../shell/page';
import { SubTabs, subCrumb } from '../../shell/submenus';
import { Btn, Chip, Panel } from '../../ui/kit';
import { DataTable, type Col } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { Facts, SoftMeter, Split, StatGrid, StatTile } from '../../ui/Analytics';
import { Meter, SevDot } from '../../ui/status';
import { fmtDate, fmtMoney, fmtNum } from '../../lib/format';
import { useToast } from '../ops/shared';
import { SCOPE_ICON, SCOPE_LABEL } from './scopes';
import '../../styles/dcim.css';
import '../../styles/planner.css';
import '../../styles/ipam.css';

type Tab = 'overview' | 'programmes' | 'projects' | 'workorders' | 'commissioning' | 'permits' | 'design' | 'todo';
export const STATE_TONE: Record<DeliveryProject['state'], 'neutral' | 'info' | 'warning' | 'purple' | 'success'> = { Mobilising: 'neutral', 'In progress': 'info', Commissioning: 'warning', Handover: 'purple', Delivered: 'success' };
export const HEALTH_TONE: Record<DeliveryProject['health'], 'success' | 'warning' | 'error'> = { 'on track': 'success', 'at risk': 'warning', late: 'error' };
export const WO_TONE: Record<WorkOrder['state'], 'neutral' | 'warning' | 'info' | 'purple' | 'success' | 'error'> = { Planned: 'neutral', 'Awaiting change': 'warning', Ready: 'info', 'In progress': 'purple', Done: 'success', Failed: 'error' };
const has = (s: string, q: string) => !q || s.toLowerCase().includes(q.toLowerCase());
const opts = <T,>(xs: T[], key: (x: T) => string) => { const m = new Map<string, number>(); xs.forEach(x => m.set(key(x), (m.get(key(x)) ?? 0) + 1)); return [...m].map(([id, count]) => ({ id, label: id, count })); };

export function Delivery() {
  const [sp, setSp] = useSearchParams();
  const apply = useParamPatch();
  const nav = useNavigate();
  const tab = (sp.get('tab') as Tab) || 'overview';
  const q = sp.get('q') ?? '', f1 = sp.get('f1') ?? '', f2 = sp.get('f2') ?? '';
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); setSp(n, { replace: true }); };
  const setTab = (t: Tab) => set({ tab: t === 'overview' ? '' : t, q: '', f1: '', f2: '' });
  usePage([{ label: 'Plan & Build' }, { label: 'Delivery', to: '/delivery' }, ...(tab === 'commissioning' ? [{ label: 'Commissioning' }] : subCrumb('delivery', tab))]);
  const { data: d } = useQuery(getDelivery, []);
  const { data: queue } = useQuery(getPlannerQueue, []);
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState<'programme' | 'project' | null>(null);
  const { data: progs } = useQuery(getProgrammes, []);
  const pname = useMemo(() => new Map((d?.projects ?? []).map(p => [p.id, p.name])), [d]);
  if (!d || !queue || !progs) return <Loading />;
  const progOf = new Map(progs.flatMap(g => g.programme.projectIds.map(pid => [pid, g.programme] as const)));
  const ps = d.projects, live = ps.filter(p => p.state !== 'Delivered');
  const budget = live.reduce((a, p) => a + p.budget, 0), earned = live.reduce((a, p) => a + p.earned, 0), actual = live.reduce((a, p) => a + p.actual, 0);
  const cpi = actual ? earned / actual : 1;
  const openWo = d.workOrders.filter(w => w.state !== 'Done');
  const latePo = d.pos.filter(o => o.state === 'Late');
  const waitingApproval = (queue ?? []).filter(p => p.status === 'In review');
  const advance = (w: WorkOrder) => { setBusy(w.id); advanceWorkOrder(w.id).then(st => toast.show(`${w.id} ${st === 'Done' ? 'completed' : 'started'}`, `${w.changeId} ${st === 'Done' ? 'implemented' : 'approved'}; the project's progress updates.`)).catch(e => toast.show('Not started', String(e.message ?? e))).finally(() => setBusy('')); };

  const woCols: Col<WorkOrder>[] = [
    { key: 'id', header: 'Work order', sort: w => w.id, wrap: true, render: w => <span className="cell-2"><Link className="ent-link mono" to={`/delivery/work-orders/${w.id}`} onClick={e => e.stopPropagation()}>{w.id}</Link><small>{w.title}</small></span> },
    { key: 'p', header: 'Project', sort: w => w.projectId, wrap: true, render: w => <span className="cell-2"><Link className="ent-link" to={`/delivery/projects/${w.projectId}`} onClick={e => e.stopPropagation()}>{pname.get(w.projectId)}</Link><small>{w.dcId}</small></span> },
    { key: 'c', header: 'Crew', sort: w => w.crew, render: w => <span className="cell-2"><span className="nowrap">{w.crew}</span><small>{w.kind}</small></span> },
    { key: 'w', header: 'Window', sort: w => w.start, render: w => <span className="cell-2"><span className="nowrap">{fmtDate(w.start)}</span><small className="nowrap">to {fmtDate(w.end)}</small></span> },
    { key: 'k', header: 'Kit', sort: w => w.kit, render: w => <Chip tone={w.kit === 'Ready' ? 'success' : w.kit === 'Partial' ? 'warning' : 'neutral'} size="xs">{w.kit}</Chip> },
    { key: 'ch', header: 'Change', sort: w => w.changeState, render: w => <span className="cell-2"><span className="mono">{w.changeId}</span><small>{w.changeState}</small></span> },
    { key: 's', header: 'Status', sort: w => ['Awaiting change', 'Ready', 'In progress', 'Planned', 'Done'].indexOf(w.state), render: w => <Chip tone={WO_TONE[w.state]} dot>{w.state}</Chip> },
    { key: 'a', header: '', render: w => w.state !== 'Done' ? <Btn size="sm" disabled={busy === w.id} onClick={() => advance(w)}>{w.state === 'In progress' ? 'Complete' : 'Start'}</Btn> : null }
  ];
  const projCols: Col<DeliveryProject>[] = [
    { key: 'n', header: 'Project', sort: p => p.id, wrap: true, render: p => <span className="cell-2"><b>{p.name}</b><small><span className="mono">{p.id}</span> · {p.manager}{progOf.get(p.id) ? ` · ${progOf.get(p.id)!.name}` : ''}</small></span> },
    { key: 's', header: 'Scope', sort: p => p.scope, render: p => { const Ic = SCOPE_ICON[p.scope]; return <span className="row nowrap" style={{ gap: 6 }}><Ic size={14} className="muted" />{SCOPE_LABEL[p.scope]}</span>; } },
    { key: 'dc', header: 'Site', sort: p => p.dcId, render: p => <span className="mono">{p.dcId}</span> },
    { key: 'pr', header: 'Progress', sort: p => p.progress, render: p => <Meter pct={p.progress * 100} width={56} color="var(--primaryColor500)" label={`${Math.round(p.progress * 100)}%`} /> },
    { key: 'b', header: 'Budget', sort: p => p.budget, render: p => <span className="cell-2"><span className="rev-amt">{fmtMoney(p.budget)}</span><small className="nowrap">CPI {p.cpi} · SPI {p.spi}</small></span> },
    { key: 'f', header: 'Finish', sort: p => p.finish, render: p => <span className="cell-2"><span className="nowrap">{fmtDate(p.finish)}</span><small className="nowrap" style={{ color: p.finish > p.target ? 'var(--vw-color-red-600)' : undefined }}>target {fmtDate(p.target)}</small></span> },
    { key: 'h', header: 'Health', sort: p => p.health, render: p => <Chip tone={HEALTH_TONE[p.health]} dot>{p.health}</Chip> },
    { key: 'st', header: 'Stage', sort: p => p.state, render: p => <Chip tone={STATE_TONE[p.state]} dot>{p.state}</Chip> }
  ];
  const listTb = (shown: number, total: number, noun: string, filters: Parameters<typeof ListToolbar>[0]['filters'] = []) => <ListToolbar shown={shown} total={total} noun={noun} onApply={apply} search={{ value: q, onChange: v => set({ q: v }), placeholder: 'Search' }} filters={filters} />;

  return (
    <div className="page dcim planner">
      <PageHead title="Delivery" sub="Approved plans become projects; projects raise work orders (each with its change request), place purchase orders, pass L1–L5 commissioning and hand over to operations"
        actions={<><Btn icon={I.DraftingCompass} onClick={() => nav('/planning')}>Open the planner</Btn><Btn icon={I.FolderPlus} onClick={() => setForm('programme')}>New programme</Btn><Btn variant="filled" icon={I.Plus} onClick={() => setForm('project')}>New project</Btn></>} />
      {tab !== 'overview' && <StatGrid>
        <StatTile label="Projects" value={ps.length} sub={`${live.length} in delivery`} onClick={() => setTab('projects')} info="A project per approved, executing or delivered plan, by stage: mobilising (approved, not started) → in progress → commissioning → handover → delivered.">
          <Split parts={(['Mobilising', 'In progress', 'Commissioning', 'Delivered'] as const).map((s, i) => ({ key: s, label: s, n: ps.filter(p => p.state === s || (s === 'Commissioning' && p.state === 'Handover')).length, tone: (i === 1 ? 'info' : 'neutral') as 'info' | 'neutral' })).filter(x => x.n)} />
        </StatTile>
        <StatTile label="Cost performance" value={cpi.toFixed(2)} sub={`CPI · ${fmtMoney(earned)} earned of ${fmtMoney(budget)}`} subTone={cpi < 0.95 ? 'warn' : undefined} info="Earned value ÷ actual cost over the projects still in delivery. Below 1 = spending more than the work done is worth.">
          <SoftMeter pct={budget ? (earned / budget) * 100 : 0} tone={cpi < 0.95 ? 'warning' : 'info'} />
          <Facts items={[{ n: fmtMoney(actual), label: 'spent' }]} />
        </StatTile>
        <StatTile label="Schedule" value={live.filter(p => p.health === 'late').length} sub={`late of ${live.length}`} subTone={live.some(p => p.health === 'late') ? 'bad' : undefined} onClick={() => setTab('projects')} info="Projects whose own schedule finishes after their target, or whose progress is under 90% of plan (SPI < 0.9).">
          <Split parts={(['late', 'at risk', 'on track'] as const).map(h => ({ key: h, label: h[0].toUpperCase() + h.slice(1), n: live.filter(p => p.health === h).length, tone: (h === 'late' ? 'error' : h === 'at risk' ? 'orange' : 'neutral') as 'error' | 'orange' | 'neutral' })).filter(x => x.n)} />
        </StatTile>
        <StatTile label="Work orders open" value={openWo.length} sub={`of ${d.workOrders.length}`} onClick={() => setTab('workorders')} info="Field work by state. Awaiting change = its change request is not approved or its kit is not on site yet.">
          <Split parts={(['Awaiting change', 'Ready', 'In progress', 'Planned'] as const).map(s => ({ key: s, label: s, n: openWo.filter(w => w.state === s).length, tone: (s === 'Awaiting change' ? 'orange' : s === 'In progress' ? 'info' : 'neutral') as 'orange' | 'info' | 'neutral' })).filter(x => x.n)} />
        </StatTile>
        <StatTile label="Purchase orders" value={d.pos.filter(o => o.state !== 'Delivered').length} sub={`open · ${latePo.length} late`} subTone={latePo.length ? 'warn' : undefined} info="Equipment ordered for the projects: plant (UPS, generators, cooling), racks and compute, with their lead times.">
          <Split parts={(['Late', 'In transit', 'Ordered', 'Draft', 'Delivered'] as const).map(s => ({ key: s, label: s, n: d.pos.filter(o => o.state === s).length, tone: (s === 'Late' ? 'error' : s === 'In transit' ? 'info' : 'neutral') as 'error' | 'info' | 'neutral' })).filter(x => x.n)} />
        </StatTile>
        <StatTile label="Commissioning" value={d.tests.filter(t => t.state === 'Passed').length} sub={`of ${d.tests.length} tests passed`} onClick={() => setTab('commissioning')} info="L1 factory witness → L2 site acceptance → L3 pre-functional → L4 functional → L5 integrated systems test, per project.">
          <SoftMeter pct={d.tests.length ? (d.tests.filter(t => t.state === 'Passed').length / d.tests.length) * 100 : 0} tone="info" />
          <Facts items={[{ n: d.tests.filter(t => t.state === 'Scheduled').length, label: 'scheduled in 30 days' }]} />
        </StatTile>
      </StatGrid>}
      <SubTabs screen="delivery" value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'programmes', label: 'Programmes', count: progs.length }, { id: 'projects', label: 'Projects', count: ps.length }, { id: 'workorders', label: 'Work orders', count: openWo.length }, { id: 'commissioning', label: 'Commissioning' }, { id: 'permits', label: 'Permits', count: d.permits.filter(p => p.state !== 'Granted').length }, { id: 'design', label: 'Design' }, { id: 'todo', label: 'To do' }]} />

      {tab === 'overview' && <DeliveryOverview />}
      {tab === 'programmes' && <div className="dl-progs">{progs.map(g => { const Ic = PROG_ICON[g.programme.type]; const slip = Math.round((g.forecastFinish - g.baselineFinish) / 864e5); return (
        <button key={g.programme.id} type="button" className={`dl-pcard is-${g.rag}`} onClick={() => nav(`/delivery/programmes/${g.programme.id}`)}>
          <span className="dl-pcard-top"><span className="dl-prog-ico"><Ic size={17} /></span><span className="cell-2"><b>{g.programme.name}</b><small>{g.programme.type} · <span className="mono">{g.programme.id}</span>{g.programme.status !== 'Active' ? ` · ${g.programme.status}` : ''}</small></span><Chip tone={RAG_TONE[g.rag]} size="xs" dot>{RAG_LABEL[g.rag]}</Chip></span>
          <p>{g.programme.description}</p>
          <span className="dl-pcard-bar"><i style={{ width: `${Math.round(g.completion * 100)}%` }} /><em>{Math.round(g.completion * 100)}%</em></span>
          <span className="dl-pcard-figs"><span><b>{g.projects.length}</b>projects</span><span><b>{fmtMoney(g.budget)}</b>budget</span><span><b className={slip > 0 ? 'is-late' : ''}>{fmtDate(g.forecastFinish)}</b>{slip > 0 ? `${slip} d late` : 'on baseline'}</span></span>
          <span className="dl-pcard-foot">{g.gates.some(x => x.waitsOn.length) ? <><I.DoorClosed size={13} />{g.gates.filter(x => x.waitsOn.length).length} at a gate</> : <><I.DoorOpen size={13} />all gates open</>} · {g.risks.length} risks · sponsor {g.programme.sponsor}</span>
        </button>); })}
        <button type="button" className="dl-pcard is-new" onClick={() => setForm('programme')}><I.FolderPlus size={20} /><b>New programme</b><small>Group projects, or start a greenfield build from the blueprint</small></button>
      </div>}
      {tab === 'projects' && (() => { const rows = ps.filter(p => (!f1 || p.state === f1) && (!f2 || p.health === f2) && has(`${p.id} ${p.name} ${p.dcId} ${p.manager}`, q)); return (
        <section className="vw-card-section dcim-table"><DataTable rows={rows} cols={projCols} pageSize={30} onRow={p => nav(`/delivery/projects/${p.id}`)} defaultSort={{ key: 'st', dir: 'asc' }}
          toolbar={listTb(rows.length, ps.length, 'projects', [{ id: 'f1', label: 'Stage', quick: true, value: f1, anyLabel: 'Any stage', onChange: v => set({ f1: v }), options: opts(ps, p => p.state) }, { id: 'f2', label: 'Health', quick: true, value: f2, anyLabel: 'Any health', onChange: v => set({ f2: v }), options: opts(ps, p => p.health) }])} /></section>); })()}
      {tab === 'workorders' && (() => { const pool = d.workOrders; const rows = pool.filter(w => (f1 ? w.state === f1 : true) && (!f2 || w.kind === f2) && has(`${w.id} ${w.title} ${w.crew} ${w.changeId} ${w.dcId}`, q)); return (
        <section className="vw-card-section dcim-table"><DataTable rows={rows} cols={woCols} pageSize={30} defaultSort={{ key: 's', dir: 'asc' }}
          toolbar={listTb(rows.length, pool.length, 'work orders', [{ id: 'f1', label: 'Status', quick: true, value: f1, anyLabel: 'Any status', onChange: v => set({ f1: v }), options: opts(pool, w => w.state) }, { id: 'f2', label: 'Kind', quick: true, value: f2, anyLabel: 'Any kind', onChange: v => set({ f2: v }), options: opts(pool, w => w.kind) }])} /></section>); })()}
      {tab === 'commissioning' && (() => { const rows = d.tests.map(t => ({ ...t, id: `${t.projectId}:${t.level}` })).filter(t => (!f1 || t.state === f1) && has(`${t.projectName} ${t.name} ${t.dcId}`, q)); return (
        <section className="vw-card-section dcim-table"><DataTable rows={rows} pageSize={30} defaultSort={{ key: 'd', dir: 'asc' }} onRow={t => nav(`/delivery/projects/${t.projectId}?tab=commissioning`)}
          toolbar={listTb(rows.length, d.tests.length, 'tests', [{ id: 'f1', label: 'Result', quick: true, value: f1, anyLabel: 'Any result', onChange: v => set({ f1: v }), options: opts(d.tests, t => t.state) }])} cols={[
          { key: 'l', header: 'Level', sort: t => t.level, render: t => <Chip tone="neutral" size="xs">L{t.level}</Chip> },
          { key: 'n', header: 'Test', wrap: true, render: t => <span className="cell-2"><b>{t.name}</b><small>{t.scope}</small></span> },
          { key: 'p', header: 'Project', wrap: true, render: t => <span className="cell-2"><span>{t.projectName}</span><small>{t.dcId}</small></span> },
          { key: 'd', header: 'Due', sort: t => t.due, render: t => <span className="nowrap">{fmtDate(t.due)}</span> },
          { key: 'w', header: 'Witness', render: t => t.witness },
          { key: 's', header: 'Result', sort: t => t.state, render: t => <Chip tone={t.state === 'Passed' ? 'success' : t.state === 'Failed' ? 'error' : t.state === 'Scheduled' ? 'info' : 'neutral'} dot>{t.state}</Chip> }]} /></section>); })()}
      {tab === 'permits' && (() => { const rows = d.permits.filter(p => (!f1 || p.state === f1) && has(`${p.name} ${p.authority} ${p.projectId}`, q)); return (
        <section className="vw-card-section dcim-table"><DataTable rows={rows} pageSize={30} defaultSort={{ key: 'd', dir: 'asc' }} onRow={p => nav(`/delivery/projects/${p.projectId}?tab=permits`)}
          toolbar={listTb(rows.length, d.permits.length, 'permits', [{ id: 'f1', label: 'State', quick: true, value: f1, anyLabel: 'Any state', onChange: v => set({ f1: v }), options: opts(d.permits, p => p.state) }])} cols={[
          { key: 'n', header: 'Permit', wrap: true, render: p => <span className="cell-2"><b>{p.name}</b><small>{p.authority}</small></span> },
          { key: 'p', header: 'Project', wrap: true, render: p => pname.get(p.projectId) },
          { key: 'd', header: 'Needed by', sort: p => p.due, render: p => <span className="nowrap">{fmtDate(p.due)}</span> },
          { key: 'o', header: 'Owner', render: p => p.owner },
          { key: 's', header: 'State', sort: p => p.state, render: p => <Chip tone={p.state === 'Granted' ? 'success' : p.state === 'Submitted' ? 'info' : 'warning'} dot>{p.state}</Chip> }]} /></section>); })()}
      {tab === 'design' && (() => { const rows = d.docs.filter(x => (!f1 || x.state === f1) && has(`${x.title} ${x.kind} ${x.author}`, q)); return (
        <section className="vw-card-section dcim-table"><DataTable rows={rows} pageSize={30} defaultSort={{ key: 'u', dir: 'desc' }} onRow={x => nav(`/delivery/projects/${x.projectId}?tab=permits`)}
          toolbar={listTb(rows.length, d.docs.length, 'documents', [{ id: 'f1', label: 'State', quick: true, value: f1, anyLabel: 'Any state', onChange: v => set({ f1: v }), options: opts(d.docs, x => x.state) }])} cols={[
          { key: 't', header: 'Document', wrap: true, render: x => <span className="cell-2"><b>{x.kind}</b><small>{x.title.split(' — ')[1]}</small></span> },
          { key: 'r', header: 'Rev', render: x => <span className="mono">{x.rev}</span> },
          { key: 'a', header: 'Author', render: x => x.author },
          { key: 'u', header: 'Updated', sort: x => x.updated, render: x => <span className="nowrap">{fmtDate(x.updated)}</span> },
          { key: 's', header: 'State', sort: x => x.state, render: x => <Chip tone={x.state === 'Issued for construction' || x.state === 'As-built' ? 'success' : x.state === 'In review' ? 'info' : 'neutral'} dot>{x.state}</Chip> }]} /></section>); })()}
      {tab === 'todo' && <div className="pl-ov">
        <Panel title="Work to start or finish" icon={I.Hammer} count={openWo.filter(w => w.state === 'Ready' || w.state === 'In progress').length} flush>
          <DataTable rows={openWo.filter(w => w.state === 'Ready' || w.state === 'In progress')} cols={woCols.filter(c => ['id', 'w', 's', 'a'].includes(c.key))} pageSize={12} empty={<p className="vw-label" style={{ padding: 16 }}>Nothing ready to start.</p>} />
        </Panel>
        <Panel title="Approvals and permits" icon={I.Stamp}>
          <ul className="ipam-find">
            {waitingApproval.map(p => <li key={p.id}><button type="button" onClick={() => nav(`/planning/plans/${p.id}`)}><SevDot s="warning" /><span className="cell-2"><b>Approve {p.name}</b><small>{p.waitingFor ?? 'next step'} · {fmtMoney(p.capex)}</small></span></button></li>)}
            {d.permits.filter(p => p.state === 'To submit').map(p => <li key={p.id}><button type="button" onClick={() => nav(`/delivery/projects/${p.projectId}?tab=permits`)}><SevDot s="minor" /><span className="cell-2"><b>Submit: {p.name}</b><small>{p.authority} · needed by {fmtDate(p.due)}</small></span></button></li>)}
          </ul>
          <p className="vw-label" style={{ margin: '8px 0 0' }}>{fmtNum(waitingApproval.length)} approvals · {fmtNum(d.permits.filter(p => p.state === 'To submit').length)} permits to submit</p>
        </Panel>
      </div>}
      <NewProgrammeModal open={form === 'programme'} onClose={() => setForm(null)} />
      <NewProjectWizard open={form === 'project'} onClose={() => setForm(null)} />
      {toast.node}
    </div>
  );
}
