/* Work orders (/workorders, 14-Oct-2026, P2B gap fill step B): the process side of field work. Tabs: My tasks (inbox: claim and
   complete with the step's form), Running work (every process instance), Processes (the 12 definitions as swimlanes) and Process KPIs
   (cycle time, SLA, waiting time per task, volume by site, bottleneck heat-map). Data: mock/workflow.ts. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, getDcim, getWfKpis, getWorkflow, useQuery } from '../../api';
import type { WfInstance, WfProcess, WfTask } from '../../api/types';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Chip, Drawer, Panel, Tabs } from '../../ui/kit';
import { DataTable, type Col } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { BarList } from '../../charts/BarList';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { useToast } from '../ops/shared';
import { KpiTile } from '../delivery/dash';
import { TaskCard, hrs } from './parts';
import { BpmnView } from './BpmnView';
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
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'tasks', label: 'My tasks', count: lanes.length }, { id: 'running', label: 'Work orders', count: data.instances.filter(i => i.state !== 'Completed').length }, { id: 'processes', label: 'Processes', count: data.processes.length }, { id: 'kpis', label: 'Process KPIs' }]} />
      {tab === 'tasks' && <Inbox tasks={data.tasks} me={data.me} mineN={mine.length} instances={data.instances} processes={data.processes} />}
      {tab === 'running' && <Running instances={data.instances} processes={data.processes} tasks={data.tasks} />}
      {tab === 'processes' && <Catalogue processes={data.processes} instances={data.instances} />}
      {tab === 'kpis' && <Kpis />}
    </div>
  );
}

/* ---------------------------------------------------------------- inbox: list on the left, the selected task on the right */
interface DoneTask { id: string; instanceId: string; step: string; process: string; pid: string; title: string; who: string; at: number; tookHours: number; lane: string; data?: Record<string, string | boolean | number>; dcId: string; link?: string; late: boolean }
function Inbox({ tasks, me, mineN, instances, processes }: { tasks: WfTask[]; me: string; mineN: number; instances: WfInstance[]; processes: WfProcess[] }) {
  const [view, setView] = useState<'mine' | 'lanes' | 'overdue' | 'done' | 'all'>('lanes');
  const [sel, setSel] = useState<string | null>(null);
  const toast = useToast();
  /* completed tasks: user steps done in the last 14 days, the newest first */
  const done = useMemo<DoneTask[]>(() => { const now = clockNow(); const kind = new Map(processes.flatMap(p => p.steps.map(st => [`${p.pid}:${st.id}`, st] as const)));
    return instances.flatMap(i => i.history.filter(h => kind.get(`${i.pid}:${h.stepId}`)?.kind === 'user' && h.who !== 'System' && now - h.at < 14 * 864e5).map((h, k) => ({ id: `${i.id}:${h.stepId}:${k}`, instanceId: i.id, step: h.step, process: i.process, pid: i.pid, title: i.title, who: h.who, at: h.at, tookHours: h.tookHours, lane: h.lane, data: h.data, dcId: i.dcId, link: i.link, late: h.tookHours > (kind.get(`${i.pid}:${h.stepId}`)?.hours ?? 1e9) })))
      .sort((a, b) => b.at - a.at).slice(0, 150); }, [instances, processes]);
  const pools = { mine: tasks.filter(t => t.assignee === me), lanes: tasks.filter(t => t.candidates.includes(me)), overdue: tasks.filter(t => t.overdue && t.candidates.includes(me)), all: tasks };
  const list = view === 'done' ? [] : [...pools[view]].sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.due - b.due);
  const cur = list.find(t => t.id === sel) ?? list[0];
  const curDone = view === 'done' ? done.find(t => t.id === sel) ?? done[0] : undefined;
  const VIEWS = [['lanes', 'Lanes', pools.lanes.length], ['mine', 'Mine', mineN], ['overdue', 'Overdue', pools.overdue.length], ['done', 'Done', done.length], ['all', 'All open', tasks.length]] as const;
  return (
    <div className="wf-inbox">
      <section className="vw-card-section wf-inbox-l">
        <div className="wf-views2" role="tablist">{VIEWS.map(([k, l, n]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} className={`${view === k ? 'is-on' : ''}${k === 'overdue' && n ? ' is-alert' : ''}`} onClick={() => { setView(k); setSel(null); }}><b>{n}</b><span>{l}</span></button>))}</div>
        <ul className="wf-list">{view === 'done' ? done.map(t => (
          <li key={t.id}><button type="button" className={curDone?.id === t.id ? 'is-on' : ''} onClick={() => setSel(t.id)}>
            <span className="wf-list-top"><b>{t.step}</b><Chip tone={t.late ? 'warning' : 'success'} size="xs" dot>{t.late ? 'Done late' : 'Done'}</Chip></span>
            <small>{t.title}</small>
            <small className="wf-list-meta"><span className="mono">{t.pid}</span> {t.process} · {t.who === me ? 'you' : t.who} · {fmtDateTime(t.at)}</small>
          </button></li>)) : list.map(t => (
          <li key={t.id}><button type="button" className={cur?.id === t.id ? 'is-on' : ''} onClick={() => setSel(t.id)}>
            <span className="wf-list-top"><b>{t.step}</b>{t.overdue ? <Chip tone="error" size="xs" dot>Overdue</Chip> : <small>{fmtDateTime(t.due)}</small>}</span>
            <small>{t.title}</small>
            <small className="wf-list-meta"><span className="mono">{t.pid}</span> {t.process} · {t.lane}{t.assignee ? ` · ${t.assignee === me ? 'you' : t.assignee}` : ' · unassigned'}</small>
          </button></li>))}
          {(view === 'done' ? !done.length : !list.length) && <li><p className="vw-label" style={{ padding: 12, margin: 0 }}>Nothing here.</p></li>}</ul>
      </section>
      <div className="wf-inbox-r">
        {view === 'done' ? (curDone ? <>
          <div className="wf-task is-done">
            <div className="wf-task-head"><span className="wf-task-ico is-done"><I.CheckCheck size={16} /></span><span className="cell-2"><b>{curDone.step}</b><small>{curDone.process} · {curDone.lane} lane · {curDone.dcId}</small></span><Chip tone={curDone.late ? 'warning' : 'success'} size="xs" dot>{curDone.late ? 'Done late' : 'Done on time'}</Chip></div>
            <p className="wf-task-title">{curDone.title}</p>
            <div className="wf-task-who"><span><small>Done by</small><b>{curDone.who}</b></span><span><small>Completed</small><b>{fmtDateTime(curDone.at)}</b></span><span><small>Took</small><b>{hrs(curDone.tookHours)}</b></span></div>
            {curDone.data && <div className="wf-recorded"><small>Recorded</small>{Object.entries(curDone.data).map(([k, v]) => <span key={k}><em>{k}</em>{v === true ? 'yes' : String(v)}</span>)}</div>}
          </div>
          <Panel title="Where this task sits" icon={I.Workflow} actions={<Link className="ent-link" to={`/workorders/instances/${encodeURIComponent(curDone.instanceId)}`}>Open the process →</Link>}>
            <InstanceTrack id={curDone.instanceId} />
          </Panel>
        </> : <Panel title="No completed tasks" icon={I.Inbox}><p className="vw-label">No task was completed in the last 14 days.</p></Panel>)
        : cur ? <>
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
  return <BpmnView processKey={p.key} done={inst.history.map(h => h.step.replace(' (retried)', ''))} current={inst.state === 'Completed' ? undefined : inst.step} incident={inst.state === 'Incident'} height={320} />;
}

/* ---------------------------------------------------------------- running work */
function Running({ instances, processes, tasks }: { instances: WfInstance[]; processes: WfProcess[]; tasks: WfTask[] }) {
  const [sp, setSp] = useSearchParams(); const apply = useParamPatch(); const nav = useNavigate();
  const { data: sites } = useQuery(() => getDcim(), []);
  const city = useMemo(() => new Map((sites?.sites ?? []).map(x => [x.id, x.city])), [sites]);
  const q = sp.get('q') ?? '', pr = sp.get('pr') ?? '', st = sp.get('st') ?? '', dc = sp.get('dc') ?? '';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const now = clockNow();
  const who = useMemo(() => new Map(tasks.map(t => [t.instanceId, t])), [tasks]);
  const pool = instances.filter(i => (st ? i.state === st : i.state !== 'Completed'));
  const rows = pool.filter(i => (!pr || i.pid === pr) && (!dc || i.dcId === dc) && (!q || `${i.id} ${i.title} ${i.businessKey} ${i.dcId} ${i.step}`.toLowerCase().includes(q.toLowerCase())));
  const cols: Col<WfInstance>[] = [
    { key: 'k', header: 'Work order', sort: i => i.businessKey, render: i => <span className="cell-2"><b className="mono">{i.businessKey}</b><small><span className="wf-pid">{i.pid}</span> {i.process}</small></span> },
    { key: 't', header: 'Subject', wrap: true, sort: i => i.title, render: i => i.title },
    { key: 'dc', header: 'Datacenter', sort: i => i.dcId, render: i => <span className="cell-2"><span className="mono">{i.dcId}</span><small>{city.get(i.dcId) ?? ''}</small></span> },
    { key: 's', header: 'Current step', sort: i => i.step, render: i => <span className="cell-2"><span>{i.step}</span><small>{i.state === 'Completed' ? 'finished' : `${i.lane} · step ${i.stepIndex + 1}`}</small></span> },
    { key: 'a', header: 'Assigned to', sort: i => who.get(i.id)?.assignee ?? 'zz', render: i => { const t = who.get(i.id); return t ? <span className="cell-2"><span>{t.assignee ?? 'Unassigned'}</span><small>{t.lane} lane</small></span> : <span className="vw-label">{i.state === 'Completed' ? '—' : 'automatic'}</span>; } },
    { key: 'w', header: 'Waiting', sort: i => (i.state === 'Completed' ? -1 : now - i.waitingSince), render: i => i.state === 'Completed' ? <span className="vw-label">—</span> : <span className={i.overdue ? 'wf-late' : ''}>{hrs(Math.max(0, (now - i.waitingSince) / 3600e3))}{i.overdue ? ' · overdue' : ''}</span> },
    { key: 'st', header: 'Started', sort: i => i.started, render: i => <span className="nowrap">{fmtDate(i.started)}</span> },
    { key: 'd', header: 'Due', sort: i => i.due, render: i => <span className={`nowrap${i.state !== 'Completed' && i.due < now ? ' wf-late' : ''}`}>{fmtDate(i.ended ?? i.due)}</span> },
    { key: 'x', header: 'State', sort: i => i.state, render: i => <Chip tone={ST_TONE[i.state]} dot>{i.state === 'Incident' ? 'Failed step' : i.state}</Chip> }
  ];
  return (
    <section className="vw-card-section dcim-table">
      <DataTable rows={rows} cols={cols} pageSize={30} defaultSort={{ key: 'w', dir: 'desc' }} onRow={i => nav(`/workorders/instances/${encodeURIComponent(i.id)}`)}
        toolbar={<ListToolbar shown={rows.length} total={pool.length} noun="work orders" onApply={apply} search={{ value: q, onChange: v => set('q', v), placeholder: 'Work order, subject, datacenter, step' }}
          filters={[{ id: 'pr', label: 'Process', quick: true, value: pr, anyLabel: 'Any process', onChange: v => set('pr', v), options: processes.map(p => ({ id: p.pid, label: `${p.pid} ${p.name}`, count: pool.filter(i => i.pid === p.pid).length })) },
            { id: 'st', label: 'State', quick: true, value: st, anyLabel: 'Open (running or failed)', onChange: v => set('st', v), options: (['Running', 'Incident', 'Completed'] as const).map(x => ({ id: x, label: x === 'Incident' ? 'Failed step' : x, count: instances.filter(i => i.state === x).length })) },
            { id: 'dc', label: 'Datacenter', value: dc, anyLabel: 'Any datacenter', onChange: v => set('dc', v), options: [...new Set(pool.map(i => i.dcId))].sort().map(x => ({ id: x, label: `${x}${city.get(x) ? ` · ${city.get(x)}` : ''}`, count: pool.filter(i => i.dcId === x).length })) }]} />} />
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
    {p && <ProcessDrawer p={p} instances={instances} onClose={() => setOpen(null)} />}
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

/* ---------------------------------------------------------------- process details: summary + collapsible sections */
function Section({ title, icon: Ic, count, open: init = false, children, extra }: { title: string; icon: I.LucideIcon; count?: number; open?: boolean; children: React.ReactNode; extra?: React.ReactNode }) {
  const [open, setOpen] = useState(init);
  return (
    <section className={`wf-sec${open ? ' is-open' : ''}`}>
      <button type="button" className="wf-sec-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="wf-sec-ico"><Ic size={15} /></span><b>{title}</b>{count != null && <span className="wf-sec-n">{count}</span>}
        <span className="wf-sec-extra" onClick={e => e.stopPropagation()}>{extra}</span><I.ChevronDown size={16} className="wf-sec-chev" />
      </button>
      {open && <div className="wf-sec-body">{children}</div>}
    </section>
  );
}
function ProcessDrawer({ p, instances, onClose }: { p: WfProcess; instances: WfInstance[]; onClose: () => void }) {
  const nav = useNavigate();
  const now = clockNow();
  const running = instances.filter(i => i.pid === p.pid && i.state !== 'Completed').sort((a, b) => a.waitingSince - b.waitingSince);
  const done = instances.filter(i => i.pid === p.pid && i.state === 'Completed');
  const onTime = done.length ? Math.round((done.filter(i => (i.ended ?? 0) - i.started <= p.slaHours * 3600e3).length / done.length) * 100) : 0;
  const KIND = { user: ['Task', I.User], auto: ['Automatic', I.Cog], decision: ['Decision', I.GitFork] } as const;
  return (
    <Drawer open onClose={onClose} width={980} title={<span className="row" style={{ gap: 8 }}><span className="wf-proc-id">{p.pid}</span>{p.name}</span>} sub={p.description}>
      <div className="wf-pd-sum">
        <span><small>Owner</small><b>{p.owner}</b></span>
        <span><small>Steps</small><b>{p.steps.filter(x => !x.branch).length}</b><em>{p.steps.filter(x => x.branch).length} when needed · {p.lanes.length} lanes</em></span>
        <span><small>Target</small><b>{hrs(p.slaHours)}</b><em>end to end</em></span>
        <span><small>Running now</small><b>{running.length}</b><em>{running.filter(i => i.overdue).length} overdue · {running.filter(i => i.state === 'Incident').length} failed</em></span>
        <span><small>Completed</small><b>{done.length}</b><em>{onTime}% on time</em></span>
      </div>
      <div className="wf-secs">
        <Section title="Process flow" icon={I.Workflow} open>
          <BpmnView processKey={p.key} height={400} counts={Object.fromEntries(p.steps.map(st => [st.name.toLowerCase(), running.filter(i => i.stepId === st.id).length]))} />
          <p className="vw-label" style={{ margin: '8px 0 0' }}>Blue badges = work orders waiting on that step now.</p>
        </Section>
        <Section title="Steps" icon={I.ListOrdered} count={p.steps.length}>
          <ol className="wf-steps">{p.steps.map(st => { const [kl, KI] = KIND[st.kind]; const waiting = running.filter(i => i.stepId === st.id).length; return (
            <li key={st.id} className={st.branch ? 'is-branch' : ''}>
              <span className="wf-steps-n">{st.branch ? <I.Undo2 size={12} /> : p.steps.filter(x => !x.branch).indexOf(st) + 1}</span>
              <span className="wf-steps-m"><b>{st.name}</b><small>{st.branch ? 'Only when needed · ' : ''}{st.form?.length ? `Form: ${st.form.map(f => f.label).join(', ')}` : 'No form'}</small></span>
              <span className="wf-steps-lane">{st.lane}</span>
              <span className="wf-steps-kind"><KI size={12} />{kl}</span>
              <span className="wf-steps-t">{hrs(st.hours)}</span>
              <span className="wf-steps-w">{waiting ? <Chip tone="info" size="xs">{waiting} waiting</Chip> : null}</span>
            </li>); })}</ol>
        </Section>
        <Section title="Running now" icon={I.Activity} count={running.length} open={running.length > 0}>
          {running.length ? <ul className="wf-run">{running.map(i => (
            <li key={i.id}><button type="button" onClick={() => nav(`/workorders/instances/${encodeURIComponent(i.id)}`)}>
              <span className="wf-run-k"><b className="mono">{i.businessKey}</b><small>{i.dcId}</small></span>
              <span className="wf-run-t">{i.title}</span>
              <span className="wf-run-s"><span>{i.step}</span><small>{i.lane}</small></span>
              <span className={`wf-run-w${i.overdue ? ' is-late' : ''}`}>{hrs(Math.max(0, (now - i.waitingSince) / 3600e3))}<small>{i.overdue ? 'overdue' : 'waiting'}</small></span>
              <Chip tone={ST_TONE[i.state]} size="xs" dot>{i.state === 'Incident' ? 'Failed step' : i.state}</Chip>
              <I.ChevronRight size={14} className="wf-run-chev" />
            </button></li>))}</ul> : <p className="vw-label">Nothing running.</p>}
        </Section>
      </div>
    </Drawer>
  );
}
