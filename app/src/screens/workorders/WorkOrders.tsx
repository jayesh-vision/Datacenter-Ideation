/* Work orders (/workorders, 14-Oct-2026, P2B gap fill step B): the process side of field work. Tabs: My tasks (inbox: claim and
   complete with the step's form), Running work (every process instance), Processes (the 12 definitions as swimlanes) and Process KPIs
   (cycle time, SLA, waiting time per task, volume by site, bottleneck heat-map). Data: mock/workflow.ts. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, getWfKpis, getWorkflow, useQuery } from '../../api';
import type { WfInstance, WfProcess, WfTask } from '../../api/types';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Chip, Drawer, Panel, Tabs } from '../../ui/kit';
import { DataTable, type Col } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { BarList } from '../../charts/BarList';
import { fmtDateTime } from '../../lib/format';
import { useToast } from '../ops/shared';
import { KpiTile } from '../delivery/dash';
import { Swimlane, TaskCard, hrs } from './parts';
import '../../styles/delivery.css';
import '../../styles/workorders.css';

type Tab = 'tasks' | 'running' | 'processes' | 'kpis';
const ST_TONE = { Running: 'info', Completed: 'success', Incident: 'error', Cancelled: 'neutral' } as const;

export function WorkOrders() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'tasks';
  const setTab = (t: Tab) => { const n = new URLSearchParams(); if (t !== 'tasks') n.set('tab', t); setSp(n, { replace: true }); };
  usePage([{ label: 'Plan & Build' }, { label: 'Work orders', to: '/workorders' }]);
  const { data } = useQuery(getWorkflow, []);
  if (!data) return <Loading />;
  const mine = data.tasks.filter(t => t.assignee === data.me), lanes = data.tasks.filter(t => t.candidates.includes(data.me));
  return (
    <div className="page dcim planner">
      <PageHead title="Work orders" sub="Field work and the processes behind it: what waits on you, every running process, the twelve process definitions and how fast they flow" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'tasks', label: 'My tasks', count: lanes.length }, { id: 'running', label: 'Running work', count: data.instances.filter(i => i.state !== 'Completed').length }, { id: 'processes', label: 'Processes', count: data.processes.length }, { id: 'kpis', label: 'Process KPIs' }]} />
      {tab === 'tasks' && <Inbox tasks={data.tasks} me={data.me} mineN={mine.length} />}
      {tab === 'running' && <Running instances={data.instances} processes={data.processes} />}
      {tab === 'processes' && <Catalogue processes={data.processes} instances={data.instances} />}
      {tab === 'kpis' && <Kpis />}
    </div>
  );
}

/* ---------------------------------------------------------------- inbox: list on the left, the selected task on the right */
function Inbox({ tasks, me, mineN }: { tasks: WfTask[]; me: string; mineN: number }) {
  const [view, setView] = useState<'mine' | 'lanes' | 'overdue' | 'all'>('lanes');
  const [sel, setSel] = useState<string | null>(null);
  const toast = useToast();
  const pools = { mine: tasks.filter(t => t.assignee === me), lanes: tasks.filter(t => t.candidates.includes(me)), overdue: tasks.filter(t => t.overdue && t.candidates.includes(me)), all: tasks };
  const list = [...pools[view]].sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.due - b.due);
  const cur = list.find(t => t.id === sel) ?? list[0];
  return (
    <div className="wf-inbox">
      <section className="vw-card-section wf-inbox-l">
        <div className="wf-views">{([['lanes', 'My lanes', pools.lanes.length], ['mine', 'Assigned to me', mineN], ['overdue', 'Overdue', pools.overdue.length], ['all', 'Everyone', tasks.length]] as const).map(([k, l, n]) => (
          <button key={k} type="button" className={view === k ? 'is-on' : ''} onClick={() => { setView(k); setSel(null); }}>{l}<b>{n}</b></button>))}</div>
        <ul className="wf-list">{list.map(t => (
          <li key={t.id}><button type="button" className={cur?.id === t.id ? 'is-on' : ''} onClick={() => setSel(t.id)}>
            <span className="wf-list-top"><b>{t.step}</b>{t.overdue ? <Chip tone="error" size="xs" dot>Overdue</Chip> : <small>{fmtDateTime(t.due)}</small>}</span>
            <small>{t.title}</small>
            <small className="wf-list-meta"><span className="mono">{t.pid}</span> {t.process} · {t.lane}{t.assignee ? ` · ${t.assignee === me ? 'you' : t.assignee}` : ' · unassigned'}</small>
          </button></li>))}
          {!list.length && <li><p className="vw-label" style={{ padding: 12, margin: 0 }}>Nothing here.</p></li>}</ul>
      </section>
      <div className="wf-inbox-r">
        {cur ? <>
          <TaskCard t={cur} me={me} onDone={(m, err) => toast.show(err ? 'Not done' : m, err ? m : undefined)} />
          <Panel title="Where this task sits" icon={I.Workflow} actions={<Link className="ent-link" to={`/workorders/instances/${encodeURIComponent(cur.instanceId)}`}>Open the process →</Link>}>
            <p className="vw-label" style={{ margin: '0 0 10px' }}>{cur.process} for <b>{cur.title}</b>{cur.link ? <> · <Link className="ent-link" to={cur.link}>open the record</Link></> : null}</p>
            <InstanceTrack id={cur.instanceId} />
          </Panel>
        </> : <Panel title="No task selected" icon={I.Inbox}><p className="vw-label">Pick a task on the left.</p></Panel>}
      </div>
      {toast.node}
    </div>
  );
}
function InstanceTrack({ id }: { id: string }) {
  const { data } = useQuery(getWorkflow, []);
  const inst = data?.instances.find(i => i.id === id), p = data?.processes.find(x => x.pid === inst?.pid);
  if (!inst || !p) return null;
  return <Swimlane p={p} inst={inst} />;
}

/* ---------------------------------------------------------------- running work */
function Running({ instances, processes }: { instances: WfInstance[]; processes: WfProcess[] }) {
  const [sp, setSp] = useSearchParams(); const apply = useParamPatch(); const nav = useNavigate();
  const q = sp.get('q') ?? '', pr = sp.get('pr') ?? '', st = sp.get('st') ?? '';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const pool = instances.filter(i => (st ? i.state === st : i.state !== 'Completed'));
  const rows = pool.filter(i => (!pr || i.pid === pr) && (!q || `${i.id} ${i.title} ${i.businessKey} ${i.dcId} ${i.step}`.toLowerCase().includes(q.toLowerCase())));
  const cols: Col<WfInstance>[] = [
    { key: 'p', header: 'Process', sort: i => i.pid, render: i => <span className="cell-2"><b>{i.process}</b><small className="mono">{i.pid} · {i.businessKey}</small></span> },
    { key: 't', header: 'For', wrap: true, sort: i => i.title, render: i => <span className="cell-2"><span>{i.title}</span><small>{i.dcId}</small></span> },
    { key: 's', header: 'Current step', sort: i => i.step, render: i => <span className="cell-2"><span>{i.step}</span><small>{i.state === 'Completed' ? `ended ${fmtDateTime(i.ended!)}` : `${i.lane} · waiting ${hrs(Math.max(0, (clockNow() - i.waitingSince) / 3600e3))}}`}</small></span> },
    { key: 'd', header: 'Due', sort: i => i.due, render: i => <span className="cell-2"><span className="nowrap">{fmtDateTime(i.due)}</span>{i.overdue && <small className="wf-late">step overdue</small>}</span> },
    { key: 'x', header: 'State', sort: i => i.state, render: i => <Chip tone={ST_TONE[i.state]} dot>{i.state}</Chip> }
  ];
  return (
    <section className="vw-card-section dcim-table">
      <DataTable rows={rows} cols={cols} pageSize={30} defaultSort={{ key: 'd', dir: 'asc' }} onRow={i => nav(`/workorders/instances/${encodeURIComponent(i.id)}`)}
        toolbar={<ListToolbar shown={rows.length} total={pool.length} noun="process instances" onApply={apply} search={{ value: q, onChange: v => set('q', v), placeholder: 'Work order, change, incident, site, step' }}
          filters={[{ id: 'pr', label: 'Process', quick: true, value: pr, anyLabel: 'Any process', onChange: v => set('pr', v), options: processes.map(p => ({ id: p.pid, label: `${p.pid} ${p.name}`, count: pool.filter(i => i.pid === p.pid).length })) },
            { id: 'st', label: 'State', quick: true, value: st, anyLabel: 'Open (running or failed)', onChange: v => set('st', v), options: (['Running', 'Incident', 'Completed'] as const).map(x => ({ id: x, label: x === 'Incident' ? 'Failed step' : x, count: instances.filter(i => i.state === x).length })) }]} />} />
    </section>
  );
}

/* ---------------------------------------------------------------- processes */
function Catalogue({ processes, instances }: { processes: WfProcess[]; instances: WfInstance[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const p = processes.find(x => x.pid === open);
  return (<>
    <div className="wf-cat">{processes.map(x => (
      <button key={x.pid} type="button" className="wf-proc" onClick={() => setOpen(x.pid)}>
        <span className="wf-proc-top"><span className="wf-proc-id">{x.pid}</span><b>{x.name}</b><Chip tone="neutral" size="xs">{x.owner}</Chip></span>
        <p>{x.description}</p>
        <span className="wf-proc-mini">{x.steps.filter(s => !s.branch).map(s => <i key={s.id} className={`is-${s.kind}`} title={`${s.name} · ${s.lane}`} />)}</span>
        <span className="wf-proc-figs"><span><b>{x.running}</b>running</span><span><b>{x.completed}</b>completed</span><span><b>{x.lanes.length}</b>lanes</span><span><b>{hrs(x.slaHours)}</b>target</span></span>
      </button>))}</div>
    {p && <Drawer open onClose={() => setOpen(null)} width={960} title={`${p.pid} · ${p.name}`} sub={`${p.owner} · ${p.steps.filter(s => !s.branch).length} steps · target ${hrs(p.slaHours)} end to end`}>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--ink-600)' }}>{p.description}</p>
      <Swimlane p={p} />
      <b className="dcim-sub-h">Steps</b>
      <table className="nst-table dt-table dcim-comp"><thead><tr><th>#</th><th>Step</th><th>Lane</th><th>Kind</th><th>Target</th><th>Form</th></tr></thead>
        <tbody>{p.steps.map((s, i) => <tr key={s.id}><td className="mono">{s.branch ? '↺' : i + 1}</td><td>{s.name}{s.branch && <small className="vw-label"> · only when needed</small>}</td><td>{s.lane}</td><td>{s.kind === 'user' ? 'Task' : s.kind === 'auto' ? 'Automatic' : 'Decision'}</td><td>{hrs(s.hours)}</td><td>{s.form?.map(f => f.label).join(', ') ?? '—'}</td></tr>)}</tbody></table>
      <b className="dcim-sub-h">Running now ({instances.filter(i => i.pid === p.pid && i.state !== 'Completed').length})</b>
      <ul className="ipam-find">{instances.filter(i => i.pid === p.pid && i.state !== 'Completed').slice(0, 10).map(i => <li key={i.id}><Link className="ent-link" to={`/workorders/instances/${encodeURIComponent(i.id)}`}>{i.title}</Link> <small className="vw-label">· {i.step}</small></li>)}</ul>
    </Drawer>}
  </>);
}

/* ---------------------------------------------------------------- KPIs dashboard */
function Kpis() {
  const { data: k } = useQuery(getWfKpis, []);
  const { data: w } = useQuery(getWorkflow, []);
  const heatMax = useMemo(() => Math.max(1, ...(k?.heat ?? []).flatMap(r => r.cells.map(c => c.avgWait ?? 0))), [k]);
  if (!k || !w) return <Loading />;
  const done = k.perProcess.reduce((a, p) => a + p.completed, 0), run = k.perProcess.reduce((a, p) => a + p.running, 0);
  const sla = done ? Math.round(k.perProcess.reduce((a, p) => a + p.slaPct * p.completed, 0) / done) : 0;
  const maxCols = Math.max(...k.heat.map(r => r.cells.length));
  return (
    <div className="dl-dash">
      <div className="dl-kpis dl-span-12" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <KpiTile label="Running" value={run} sub={`${w.instances.filter(i => i.state === 'Incident').length} with a failed step`} tone={w.instances.some(i => i.state === 'Incident') ? 'warn' : undefined} info="Process instances not finished yet." />
        <KpiTile label="Completed" value={done} sub="last quarter" info="Process instances that reached their end in the last quarter." />
        <KpiTile label="On time" value={`${sla}%`} sub="ended within the process target" tone={sla < 70 ? 'bad' : sla < 85 ? 'warn' : 'good'} info="Share of completed instances whose end-to-end time stayed within the sum of their step targets." />
        <KpiTile label="Tasks overdue" value={w.tasks.filter(t => t.overdue).length} sub={`of ${w.tasks.length} open tasks`} tone={w.tasks.some(t => t.overdue) ? 'warn' : undefined} info="Open tasks waiting longer than their step's target." />
      </div>
      <Panel className="dl-span-6" title="Cycle time per process" icon={I.Timer} sub="Average end-to-end time of completed runs" info="Average time from start to end of the completed instances, against the process target.">
        <BarList items={k.perProcess.filter(p => p.completed).sort((a, b) => b.avgCycleHours - a.avgCycleHours).map(p => ({ key: p.pid, label: `${p.pid} ${p.name}`, value: p.avgCycleHours, display: hrs(p.avgCycleHours), secondary: `target ${hrs(p.slaHours)}`, color: p.avgCycleHours > p.slaHours ? '#F59E0B' : '#1C81EF' }))} />
      </Panel>
      <Panel className="dl-span-6" title="SLA attainment per process" icon={I.Target} sub="Completed runs that ended within target" info="Share of completed instances that ended within the process target.">
        <BarList max={100} items={k.perProcess.filter(p => p.completed).sort((a, b) => a.slaPct - b.slaPct).map(p => ({ key: p.pid, label: `${p.pid} ${p.name}`, value: p.slaPct, display: `${p.slaPct}%`, secondary: `${p.completed} runs`, color: p.slaPct < 70 ? '#DC2626' : p.slaPct < 85 ? '#F59E0B' : '#16A34A' }))} />
      </Panel>
      <Panel className="dl-span-12" title="Bottlenecks" icon={I.Flame} sub="Average time spent on each step, by process (darker = slower)" info="Each cell is the average time instances spent on that step. Hover a cell for the step.">
        <div className="wf-heat" style={{ ['--cols' as string]: maxCols }}>
          <span /> {Array.from({ length: maxCols }, (_, i) => <span key={i} className="wf-heat-h">{i + 1}</span>)}
          {k.heat.map(r => <div key={r.pid} className="wf-heat-row"><span className="wf-heat-l"><span className="mono">{r.pid}</span> {r.process}</span>
            {Array.from({ length: maxCols }, (_, i) => { const c = r.cells[i]; return c ? <span key={i} className="wf-heat-c" style={{ ['--a' as string]: c.avgWait == null ? 0 : Math.min(1, 0.12 + (c.avgWait / heatMax) * 0.88) }} title={`${c.step}: ${c.avgWait == null ? 'no runs yet' : hrs(c.avgWait)}`}>{c.avgWait == null ? '' : hrs(c.avgWait)}</span> : <span key={i} className="wf-heat-c is-none" />; })}</div>)}
        </div>
      </Panel>
      <Panel className="dl-span-8" title="Waiting time per task" icon={I.Hourglass} flush info="How long each kind of task waited before it was completed: average, the slowest 10% (P90) and the share done within the step's target.">
        <DataTable rows={k.perTask.map(t => ({ ...t, id: `${t.pid}${t.step}` }))} pageSize={10} defaultSort={{ key: 'a', dir: 'desc' }} cols={[
          { key: 's', header: 'Task', wrap: true, sort: t => t.step, render: t => <span className="cell-2"><b>{t.step}</b><small>{t.pid} {t.process} · {t.lane}</small></span> },
          { key: 'n', header: 'Done', sort: t => t.n, render: t => t.n },
          { key: 'a', header: 'Average', sort: t => t.avgWait, render: t => hrs(t.avgWait) },
          { key: 'p', header: 'P90', sort: t => t.p90, render: t => hrs(t.p90) },
          { key: 'o', header: 'On time', sort: t => t.onTimePct, render: t => <Chip tone={t.onTimePct >= 85 ? 'success' : t.onTimePct >= 60 ? 'warning' : 'error'} size="xs">{t.onTimePct}%</Chip> }]} />
      </Panel>
      <Panel className="dl-span-4" title="Volume by site" icon={I.Building2} sub="Running now" info="Process instances running at each site.">
        <BarList limit={10} items={k.bySite.filter(x => x.running).map(x => ({ key: x.dcId, label: x.dcId, value: x.running, display: String(x.running), secondary: `${x.completed} done` }))} />
      </Panel>
    </div>
  );
}
