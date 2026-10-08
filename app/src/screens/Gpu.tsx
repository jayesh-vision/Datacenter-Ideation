import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getDatacenters, getGpu, getGpuNode, useQuery, usePersona } from '../api';
import type { Gpu as GpuT } from '../api/types';
import type { GpuClusterRow, GpuJobRow, GpuNodeRow, GpuView } from '../mock/gpu-view';
import { usePage, PageHead, Loading, useSentinel } from '../shell/page';
import { Btn, Drawer, Empty, Panel, Seg, Tabs } from '../ui/kit';
import { DataTable, type Col } from '../ui/DataTable';
import { ListToolbar } from '../ui/ListToolbar';
import { IncLink, SevChip, Fresh } from '../ui/status';
import { Facts, MiniBars, SoftMeter, Split, StatGrid, StatTile, type Tone } from '../ui/Analytics';
import { TimeChart } from '../charts/TimeChart';
import { Sparkline } from '../charts/Sparkline';
import type { GpuModelRow, GpuTelemetry, Leader } from '../mock/gpu-view';
import { GPU_VENDORS, gpuName, gpuSpec } from '../lib/gpuSpec';
import { fmtAgo, fmtDur, fmtMoney, fmtNum } from '../lib/format';
import { OpstralBtn } from '../ui/OpstralMark';
import { downloadCsv } from './ops/shared';
import '../styles/revenue.css';
import '../styles/gpu.css';

/* AI & GPU operations (05-Oct-2026). GPU fleets are run per JOB: one bad GPU in a 16-node training
   run idles all 128 GPUs, so the page leads with jobs and the GPU time they are losing, then the
   fleet as a heat map, then the nodes, cooling, power and the InfiniBand fabric.
   Colocation operators host tenant AI cages instead: power, coolant and inlet only. */

type TabId = 'clusters' | 'jobs' | 'nodes' | 'models' | 'telemetry' | 'cooling' | 'fabric';
type NodeR = GpuNodeRow & { id: string };
const short = (id: string) => id.replace(/^[A-Z]{2}-DC-\d{3}-/, '');
const perH = (n: number) => `${fmtMoney(n)}/h`;
const STATE_LABEL: Record<string, string> = { running: 'Running', slowed: 'Slowed', stalled: 'Stalled', 'at-risk': 'At risk', idle: 'Idle', 'in-job': 'In a job', drained: 'Drained', failed: 'Failed', 'burn-in': 'Burn-in' };
const STATE_CHIP: Record<string, string> = { running: 'vw-chip--success', slowed: 'vw-chip--warning', stalled: 'vw-chip--error', 'at-risk': 'vw-chip--warning', idle: 'vw-chip--neutral', 'in-job': 'vw-chip--info', drained: 'vw-chip--neutral', failed: 'vw-chip--error', 'burn-in': 'vw-chip--neutral' };
export const StateChip = ({ s }: { s: string }) => <span className={`vw-chip ${STATE_CHIP[s] ?? 'vw-chip--neutral'} cmd-chip`}>{STATE_LABEL[s] ?? s}</span>;

/* one GPU as a heat-map square: failed red, degraded or throttled amber, busy blue by utilisation, idle grey */
const cellColor = (h: GpuT['health'], u: number, th: GpuT['throttle'], state: string) =>
  h === 'failed' ? 'var(--vw-color-red-500)' : h === 'degraded' ? 'var(--vw-color-amber-500)' : th === 'hw-slowdown' || th === 'thermal' ? 'var(--vw-color-amber-300)' : th === 'power-cap' ? 'var(--vw-color-amber-200)'
    : state === 'drained' || state === 'burn-in' || state === 'failed' ? 'var(--vw-color-slate-300)' : u >= 70 ? 'var(--primaryColor500)' : u >= 30 ? 'var(--vw-color-blue-300)' : u >= 5 ? 'var(--vw-color-blue-200, #bfdbfe)' : 'var(--vw-color-slate-200)';

export function GpuPage() {
  const [sp, setSp] = useSearchParams();
  const ask = useSentinel();
  const dc = sp.get('dc') ?? '';
  const { def } = usePersona();
  usePage([{ label: 'Infrastructure' }, { label: 'AI & GPU' }, ...(dc ? [{ label: dc }] : [])], dc ? { dcId: dc } : {});
  const { data: dcs } = useQuery(getDatacenters, []);
  const { data: v } = useQuery(() => getGpu({ dcId: dc || undefined }), [dc]);
  if (!v || !dcs) return <Loading />;
  const setDc = (x: string) => { const n = new URLSearchParams(sp); x ? n.set('dc', x) : n.delete('dc'); n.delete('q'); setSp(n, { replace: true }); };
  const cages = v.kind === 'cages';
  return (
    <div className="page gpu">
      <PageHead title="AI & GPU" sub={cages ? 'Tenant AI cages: the high-density, liquid-cooled cabinets your tenants fill with GPUs — their power, coolant and inlet temperature.' : 'The GPU fleet, the AI jobs running on it, and what a single bad GPU costs — health, heat, power and the InfiniBand fabric.'}
        actions={<>
          <Fresh>{cages ? 'Live · BMS and CDU telemetry' : v.fleet.models.some(m => m.vendor === 'Intel') ? 'Live · DCGM and Intel GPU telemetry every 30 s' : 'Live · DCGM telemetry every 30 s'}</Fresh>
          <select className="select" value={dc} onChange={e => setDc(e.target.value)} aria-label="Datacenter">
            <option value="">All datacenters</option>
            {v.sites.length ? (dc && !v.sites.some(s => s.id === dc) ? [{ id: dc, nodes: 0, cages: 0 }, ...v.sites] : v.sites).map(s => <option key={s.id} value={s.id}>{s.id} · {dcs.find(d => d.id === s.id)?.city ?? ''}{s.nodes ? ` · ${s.nodes} nodes` : s.cages ? ` · ${s.cages} cages` : ''}</option>) : null}
          </select>
          <OpstralBtn onClick={() => ask(cages ? 'Which AI cages are at risk?' : 'Which GPU job is losing the most?')} />
        </>} />
      {v.kind === 'none' ? <NoGpu persona={def.label} dc={dc} /> : <GpuBody v={v} />}
    </div>
  );
}

export function NoGpu({ persona, dc }: { persona: string; dc?: string }) {
  return <section className="card"><Empty icon={I.Cpu} title={dc ? `No GPU infrastructure at ${dc}` : 'No GPU fleet in this estate'}>{dc ? 'This site runs no GPU nodes or AI cages. Pick another datacenter.' : `The ${persona} model hosts network equipment, not GPU servers. Switch the persona to Cloud or Enterprise for a GPU fleet, or Colocation for tenant AI cages.`}</Empty></section>;
}

/* the body, shared by the AI & GPU page and the datacenter's AI & GPU tab */
export function GpuBody({ v, embedded }: { v: GpuView; embedded?: boolean }) {
  return v.kind === 'cages' ? <Cages v={v} embedded={embedded} /> : <Fleet v={v} embedded={embedded} />;
}

/* ------------------------------------------------------------------ fleet */

function Fleet({ v, embedded }: { v: GpuView; embedded?: boolean }) {
  const [sp, setSp] = useSearchParams();
  const { vocab: V } = usePersona();
  const tab = (['clusters', 'jobs', 'nodes', 'models', 'telemetry', 'cooling', 'fabric'].includes(sp.get('gtab') ?? '') ? sp.get('gtab') : 'clusters') as TabId;
  const go = (t: TabId, patch: Record<string, string> = {}) => { const n = new URLSearchParams(sp); ['gtab', 'gstate', 'q', 'gview', 'gmodel'].forEach(k => n.delete(k)); if (t !== 'clusters') n.set('gtab', t); Object.entries(patch).forEach(([k, x]) => n.set(k, x)); setSp(n, { replace: true }); };
  const [node, setNode] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const f = v.fleet, js = v.jobsSummary, w = v.waste;
  const stalled = v.jobs.find(j => j.state === 'stalled');
  const worstSlow = v.jobs.filter(j => j.state !== 'stalled' && j.wasteRate > 0).sort((a, b) => b.wasteRate - a.wasteRate)[0];
  const atRisk = v.jobs.find(j => j.state === 'at-risk');
  const xidN = f.xid.reduce((a, x) => a + x.n, 0);
  const cduBad = v.cdus.filter(c => c.state !== 'ok');
  const job = jobId ? v.jobs.find(j => j.id === jobId) ?? null : null;

  return (
    <div className="col" style={{ gap: 16 }}>
      <StatGrid>
        <StatTile label="GPUs" value={fmtNum(f.gpus)} sub={`${f.nodes} nodes`} onClick={() => go('nodes')} active={tab === 'nodes'}>
          <Split parts={[{ key: 'h', label: 'Healthy', n: f.gpuHealth.healthy, tone: 'info' }, { key: 'd', label: 'Degraded', n: f.gpuHealth.degraded, tone: 'orange' }, { key: 'f', label: 'Failed', n: f.gpuHealth.failed, tone: 'error' }]} onPick={k => go('nodes', { gstate: k === 'h' ? '' : k === 'd' ? 'degraded' : 'failed' })} />
          <Facts items={[{ n: GPU_VENDORS.map(vd => ({ vd, n: f.models.filter(m => m.vendor === vd).reduce((a, m) => a + m.gpus, 0) })).filter(x => x.n).map(x => `${x.vd} ${fmtNum(x.n)}`).join(' · '), label: '' }]} />
        </StatTile>
        <StatTile label="Allocation" value={`${f.allocatedPct}%`} sub="in jobs" onClick={() => go('clusters')} active={tab === 'clusters'}>
          <Split parts={[{ key: 'j', label: 'In jobs', n: f.inJobGpus, tone: 'info' }, { key: 's', label: 'Spare', n: f.spareGpus, tone: 'neutral' }, { key: 'o', label: 'Out of service', n: f.outGpus, tone: 'warning' }]} />
          <Facts items={[{ n: `${f.utilInJobs}%`, label: 'busy in jobs' }]} />
        </StatTile>
        <StatTile label="AI jobs" value={js.total} sub={`${fmtNum(js.gpus)} GPUs`} subTone={js.stalled ? 'bad' : js.slowed ? 'warn' : undefined} onClick={() => go('jobs')} active={tab === 'jobs'}>
          <Split parts={[{ key: 'stalled', label: 'Stalled', n: js.stalled, tone: 'error' }, { key: 'slowed', label: 'Slowed or at risk', n: js.slowed + js.atRisk, tone: 'orange' }, { key: 'running', label: 'Running', n: js.running + js.idle, tone: 'info' }]} onPick={k => go('jobs', { gstate: k === 'slowed' ? 'slowed' : k })} />
          <Facts items={[{ n: js.idle, label: 'holding GPUs idle', tone: js.idle ? 'warn' : undefined }]} />
        </StatTile>
        <StatTile label="GPU time lost" value={perH(w.rate)} sub="now" subTone={w.rate ? 'bad' : undefined} onClick={() => go('jobs')}>
          <Split other={perH} parts={[{ key: 's', label: 'Stalled', n: w.stalled, tone: 'error', display: perH(w.stalled) }, { key: 'w', label: 'Slowed', n: w.slowed, tone: 'orange', display: perH(w.slowed) }, { key: 'i', label: 'Idle allocated', n: w.idle, tone: 'warning', display: perH(w.idle) }]} />
          <Facts items={[{ n: fmtMoney(w.soFar), label: 'lost so far' }]} />
        </StatTile>
        <StatTile label="Heat & power" value={f.throttle.thermal + f.throttle.hw + f.throttle.power} sub="GPUs throttled" subTone={f.throttle.hw ? 'bad' : f.throttle.thermal + f.throttle.power ? 'warn' : undefined} onClick={() => go('cooling')} active={tab === 'cooling'}>
          <Split parts={[{ key: 'hw', label: 'Hardware slowdown', n: f.throttle.hw, tone: 'error' }, { key: 'th', label: 'Thermal', n: f.throttle.thermal, tone: 'orange' }, { key: 'pc', label: 'Power-capped', n: f.throttle.power, tone: 'warning' }]} />
          <Facts items={[{ n: `${f.hottest}°C`, label: `hottest${cduBad.length ? ` · ${cduBad.length} CDU alarm${cduBad.length > 1 ? 's' : ''}` : ''}`, tone: f.hottest >= 85 ? 'bad' : undefined }]} />
        </StatTile>
        <StatTile label="Hardware errors · 24 h" value={xidN} sub="Xid events" subTone={xidN ? 'bad' : undefined} onClick={() => go('nodes', { gstate: 'degraded' })}>
          <Split parts={f.xid.length ? f.xid.map(x => ({ key: String(x.code), label: `Xid ${x.code}`, n: x.n, tone: (x.code === 79 || x.code === 48 ? 'error' : 'orange') as Tone })) : [{ key: 'none', label: 'None', n: 0, tone: 'neutral' as Tone }]} />
          <Facts items={[{ n: f.rmaOpen, label: `RMA · ${f.driftNodes} old driver`, tone: f.driftNodes ? 'warn' : undefined }]} />
        </StatTile>
      </StatGrid>

      {!embedded || stalled || worstSlow ? (
        <div className="gpu-heroes">
          <BlastCard j={stalled} v={v} onOpen={setJobId} />
          <WasteCard j={worstSlow ?? atRisk} v={v} onOpen={setJobId} />
        </div>
      ) : null}

      <Tabs value={tab} onChange={t => go(t)} tabs={[
        { id: 'clusters', label: 'Clusters', icon: I.LayoutGrid, count: v.clusters.length },
        { id: 'jobs', label: 'Jobs', icon: I.BrainCircuit, count: js.total },
        { id: 'nodes', label: 'Nodes', icon: I.Server, count: f.nodes },
        { id: 'models', label: 'GPU models', icon: I.Cpu, count: f.models.length },
        { id: 'telemetry', label: 'Telemetry', icon: I.Activity },
        { id: 'cooling', label: 'Cooling & power', icon: I.Thermometer, count: cduBad.length + v.racks.filter(r => r.state !== 'ok').length || undefined },
        { id: 'fabric', label: 'Fabric', icon: I.Network }
      ]} />
      {tab === 'clusters' && <Clusters v={v} onNode={setNode} />}
      {tab === 'jobs' && <Jobs v={v} onJob={setJobId} hideDc={!!v.dcId} />}
      {tab === 'nodes' && <Nodes v={v} onNode={setNode} hideDc={!!v.dcId} />}
      {tab === 'models' && <Models v={v} onModel={m => go('nodes', { gmodel: m })} />}
      {tab === 'telemetry' && v.telemetry && <Telemetry t={v.telemetry} v={v} onNode={setNode} />}
      {tab === 'cooling' && <CoolingPower v={v} />}
      {tab === 'fabric' && <Fabric v={v} onNode={setNode} />}

      <NodeDrawer id={node} onClose={() => setNode(null)} onJob={id => { setNode(null); setJobId(id); }} />
      <JobDrawer j={job} v={v} onClose={() => setJobId(null)} onNode={id => { setJobId(null); setNode(id); }} />
      <span className="vw-label gpu-foot">GPU time is priced at {fmtMoney(v.rate)} per H100 GPU-hour ({v.rateLabel}); other models are scaled to their list price. A stalled job loses all its GPUs, a slowed job the share of each step it loses, an idle allocation everything it holds. {V.money.impact} counts what {V.customers.toLowerCase()} are billed; this counts productive GPU time.</span>
    </div>
  );
}

/* "one GPU stalls N" — the job's nodes as a grid, the failed GPU in red, everyone else waiting */
function BlastCard({ j, v, onOpen }: { j?: GpuJobRow; v: GpuView; onOpen: (id: string) => void }) {
  if (!j) return (
    <section className="vw-card-section gpu-hero is-quiet"><span className="vw-card-metric-label">Biggest blast radius</span>
      <div className="gpu-hero-quiet"><I.CircleCheck size={20} /><div><b>No job is stalled</b><span className="vw-label">Every job with a failed GPU has been restarted on healthy nodes.</span></div></div></section>
  );
  const redoMin = Math.round((j.since! - j.lastCheckpoint) / 60000);
  return (
    <section className="vw-card-section vw-card--accent gpu-hero">
      <div className="vw-card-accent" style={{ background: 'var(--vw-color-red-500)' }} />
      <div className="gpu-hero-h"><span className="vw-card-metric-label">Biggest blast radius</span>{j.incidentId && <span className="row" style={{ gap: 6 }}><IncLink id={j.incidentId} />{j.incidentSev && <SevChip n={j.incidentSev} size="xs" />}</span>}</div>
      <button type="button" className="gpu-hero-title" onClick={() => onOpen(j.id)}>One failed GPU has stopped {j.gpus} GPUs</button>
      <span className="vw-label gpu-hero-sub">{j.name} · {j.owner} · {j.dcId} {j.cluster} · stalled {fmtAgo(j.since!, v.now)}</span>
      <div className="gpu-hero-body">
        <JobGrid j={j} v={v} />
        <div className="gpu-hero-figs">
          <div><span className="vw-label">Lost now</span><b className="num gpu-bad">{perH(j.wasteRate)}</b></div>
          <div><span className="vw-label">Work to redo</span><b className="num">{fmtMoney(j.redo)}</b></div>
          <div><span className="vw-label">Since the checkpoint</span><b className="num">{fmtDur(redoMin)}</b></div>
        </div>
      </div>
      <div className="gpu-hero-foot"><span className="vw-label gpu-hero-note">{j.cause}</span><button type="button" className="nst-btn nst-btn--sm nst-btn--ghost" onClick={() => onOpen(j.id)}>Recovery plan<I.ArrowRight size={14} /></button></div>
    </section>
  );
}
function WasteCard({ j, v, onOpen }: { j?: GpuJobRow; v: GpuView; onOpen: (id: string) => void }) {
  if (!j) return (
    <section className="vw-card-section gpu-hero is-quiet"><span className="vw-card-metric-label">Slowest job</span>
      <div className="gpu-hero-quiet"><I.CircleCheck size={20} /><div><b>Every job runs at its baseline speed</b><span className="vw-label">No straggler, throttling or idle allocation.</span></div></div></section>
  );
  const head = j.state === 'idle' ? 'Wasting the most' : j.state === 'at-risk' ? 'At risk' : 'Slowest job';
  const title = j.state === 'idle' ? `${j.gpus} GPUs allocated and doing nothing` : j.state === 'at-risk' ? `${j.gpus} GPUs one fault from a crash` : `${j.gpus} GPUs running ${j.slowdownPct}% slower`;
  return (
    <section className="vw-card-section vw-card--accent gpu-hero">
      <div className="vw-card-accent" style={{ background: 'var(--vw-color-amber-500)' }} />
      <div className="gpu-hero-h"><span className="vw-card-metric-label">{head}</span>{j.incidentId ? <span className="row" style={{ gap: 6 }}><IncLink id={j.incidentId} />{j.incidentSev && <SevChip n={j.incidentSev} size="xs" />}</span> : <span className="vw-chip vw-chip--warning cmd-chip">No incident</span>}</div>
      <button type="button" className="gpu-hero-title" onClick={() => onOpen(j.id)}>{title}</button>
      <span className="vw-label gpu-hero-sub">{j.name} · {j.owner} · {j.dcId} {j.cluster}{j.since ? ` · since ${fmtAgo(j.since, v.now)}` : ''}</span>
      <div className="gpu-hero-body">
        <JobGrid j={j} v={v} />
        <div className="gpu-hero-figs">
          {j.state === 'at-risk' ? <>
            <div><span className="vw-label">At stake</span><b className="num gpu-warn">{fmtMoney(j.atStake)}</b></div>
            <div><span className="vw-label">Checkpoint every</span><b className="num">{j.checkpointMin} min</b></div>
            <div><span className="vw-label">Last checkpoint</span><b className="num">{fmtAgo(j.lastCheckpoint, v.now)}</b></div>
          </> : <>
            <div><span className="vw-label">Lost now</span><b className="num gpu-warn">{perH(j.wasteRate)}</b></div>
            <div><span className="vw-label">Lost so far</span><b className="num">{fmtMoney(j.wasteSoFar)}</b></div>
            <div><span className="vw-label">{j.state === 'idle' ? 'Utilisation' : 'Step time'}</span><b className="num">{j.state === 'idle' ? 'under 5%' : `${(j.stepMs / 1000).toFixed(2)} s vs ${(j.baselineMs / 1000).toFixed(2)} s`}</b></div>
          </>}
        </div>
      </div>
      <div className="gpu-hero-foot"><span className="vw-label gpu-hero-note">{j.cause}</span><button type="button" className="nst-btn nst-btn--sm nst-btn--ghost" onClick={() => onOpen(j.id)}>Details<I.ArrowRight size={14} /></button></div>
    </section>
  );
}

function JobGrid({ j, v }: { j: GpuJobRow; v: GpuView }) {
  const cells = j.nodes.map(id => v.nodes.find(n => n.neId === id)).filter(Boolean) as GpuNodeRow[];
  return (
    <div className="gpu-jobgrid" role="img" aria-label={`${j.nodes.length} nodes, ${j.gpus} GPUs`}>
      {cells.map(n => (
        <span key={n.neId} className={`gpu-node${n.neId === j.causeNeId ? ' is-cause' : ''}`} title={`${short(n.neId)} · ${n.util}% · ${n.maxTemp}°C`}>
          {n.gpus.map(g => <i key={g.idx} style={{ background: j.state === 'stalled' && g.health !== 'failed' ? 'var(--vw-color-slate-300)' : cellColor(g.health, g.util, g.throttle, n.state) }} />)}
        </span>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- clusters */

function Clusters({ v, onNode }: { v: GpuView; onNode: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const issues = v.clusters.filter(c => c.worst !== 'ok');
  const shown = all || issues.length === 0 ? v.clusters : issues;
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="gpu-legend">
        {[['var(--primaryColor500)', 'Busy (≥70%)'], ['var(--vw-color-blue-300)', 'Light load'], ['var(--vw-color-slate-200)', 'Idle / spare'], ['var(--vw-color-amber-300)', 'Throttled'], ['var(--vw-color-amber-500)', 'Degraded'], ['var(--vw-color-red-500)', 'Failed'], ['var(--vw-color-slate-300)', 'Drained · burn-in · down']].map(([c, l]) => <span key={l}><i style={{ background: c }} />{l}</span>)}
        <span className="grow" />
        {issues.length > 0 && issues.length < v.clusters.length && <button type="button" className="nst-btn nst-btn--sm nst-btn--ghost" onClick={() => setAll(x => !x)}>{all ? `Only the ${issues.length} with issues` : `Show all ${v.clusters.length} clusters`}</button>}
      </div>
      <div className="gpu-clusters">
        {shown.map(c => <ClusterCard key={c.id} c={c} v={v} onNode={onNode} />)}
      </div>
    </div>
  );
}
function ClusterCard({ c, v, onNode }: { c: GpuClusterRow; v: GpuView; onNode: (id: string) => void }) {
  const jobs = v.jobs.filter(j => j.clusterId === c.id);
  const bad = jobs.filter(j => j.state !== 'running');
  return (
    <section className={`vw-card-section gpu-cl is-${c.worst}`}>
      <div className="gpu-cl-h">
        <div className="gpu-cl-id"><b>{c.dcId} · {c.name}</b><span className="vw-label"><VendorTag v={c.vendor} />{c.model} · {c.cooling === 'liquid' ? 'liquid-cooled' : 'air-cooled'} · {c.scheduler}</span></div>
        <span className={`gpu-dot is-${c.worst}`} title={c.worst === 'ok' ? 'Healthy' : c.worst === 'warn' ? 'Needs attention' : 'Fault'} />
      </div>
      <div className="gpu-cl-stats">
        <span><b className="num">{c.gpus}</b> GPUs</span><span><b className="num">{c.util}%</b> busy</span><span><b className="num">{c.spare}</b> spare</span><span><b className="num">{c.powerKw}</b> kW</span>
      </div>
      <div className="gpu-heat">
        {c.cells.map(n => (
          <button key={n.neId} type="button" className={`gpu-node${n.worst !== 'ok' ? ` is-${n.worst}` : ''}`} onClick={() => onNode(n.neId)} title={`${short(n.neId)} · ${STATE_LABEL[n.state]}${n.jobId ? ` · ${jobs.find(j => j.id === n.jobId)?.name ?? ''}` : ''}`} aria-label={`Open ${short(n.neId)}`}>
            {n.g.map((g, i) => <i key={i} style={{ background: cellColor(g.h, g.u, g.th, n.state) }} />)}
          </button>
        ))}
      </div>
      <div className="gpu-cl-foot">
        {bad.length ? bad.slice(0, 2).map(j => <span key={j.id} className="gpu-cl-job"><StateChip s={j.state} /><span title={j.cause}>{j.name}</span></span>)
          : <span className="vw-label">{jobs.length} job{jobs.length === 1 ? '' : 's'} running normally</span>}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- jobs */

function Jobs({ v, onJob, hideDc }: { v: GpuView; onJob: (id: string) => void; hideDc?: boolean }) {
  const { vocab: V } = usePersona();
  const [sp, setSp] = useSearchParams();
  const st = sp.get('gstate') ?? '', q = sp.get('q') ?? '';
  const [kind, setKind] = useState('');
  const set = (k: string, x: string) => { const n = new URLSearchParams(sp); x ? n.set(k, x) : n.delete(k); setSp(n, { replace: true }); };
  const rows = v.jobs.filter(j => (!st || j.state === st || (st === 'slowed' && j.state === 'at-risk')) && (!kind || j.kind === kind) && (!q || `${j.id} ${j.name} ${j.owner} ${j.dcId}`.toLowerCase().includes(q.toLowerCase())));
  const max = Math.max(1, ...v.jobs.map(j => j.wasteRate));
  const cols: Col<GpuJobRow>[] = [
    { key: 'job', header: 'Job', wrap: true, sort: j => j.name, render: j => <span className="cell-2"><span className="gpu-strong">{j.name}</span><small>{j.id} · {j.kind}{hideDc ? '' : ` · ${j.dcId}`} {j.cluster} · {j.gpuModel}</small></span> },
    { key: 'owner', header: V.customer, wrap: true, sort: j => j.owner, render: j => <span className="cell-2"><span>{j.owner}</span>{j.premium && <small>{V.premium}</small>}</span> },
    { key: 'gpus', header: 'GPUs', sort: j => j.gpus, render: j => <span className="cell-2"><span className="num">{j.gpus}</span><small className="nowrap">{j.nodes.length} node{j.nodes.length === 1 ? '' : 's'}</small></span> },
    { key: 'state', header: 'State', sort: j => ['stalled', 'at-risk', 'slowed', 'idle', 'running'].indexOf(j.state), render: j => <StateChip s={j.state} /> },
    { key: 'speed', header: 'Speed', sort: j => j.slowdownPct, render: j => (j.kind === 'inference' ? <span className="faint">serving</span> : <span className="cell-2"><span className={`num nowrap${j.slowdownPct ? ' gpu-warn' : ''}`}>{j.state === 'stalled' ? 'stopped' : j.slowdownPct ? `${j.slowdownPct}% slower` : 'baseline'}</span><small className="nowrap">MFU {j.mfu}%</small></span>) },
    { key: 'cp', header: 'Checkpoint', sort: j => j.lastCheckpoint, render: j => (j.checkpointMin ? <span className="cell-2"><span className="nowrap">{fmtAgo(j.lastCheckpoint, v.now)}</span><small className="nowrap">every {j.checkpointMin} min</small></span> : <span className="faint">—</span>) },
    { key: 'waste', header: 'GPU time lost', sort: j => j.wasteRate * 1e3 + j.atStake, render: j => (j.wasteRate ? <span className="cell-2 gpu-amt"><span className="num gpu-strong nowrap gpu-bad">{perH(j.wasteRate)}</span><span className="rev-bar"><i style={{ width: `${(j.wasteRate / max) * 100}%`, background: j.state === 'stalled' ? 'var(--vw-color-red-400)' : 'var(--vw-color-amber-400)' }} /></span><small className="nowrap">{fmtMoney(j.wasteSoFar + j.redo)} so far</small></span>
      : j.atStake ? <span className="cell-2"><span className="num nowrap gpu-warn">{fmtMoney(j.atStake)}</span><small className="nowrap">at stake</small></span> : <span className="faint">—</span>) },
    { key: 'inc', header: 'Incident', sort: j => j.incidentSev ?? 9, render: j => (j.incidentId ? <span className="row nowrap" style={{ gap: 6 }}><IncLink id={j.incidentId} />{j.incidentSev && <SevChip n={j.incidentSev} size="xs" />}</span> : j.state !== 'running' ? <span className="vw-chip vw-chip--warning cmd-chip">None</span> : <span className="faint">—</span>) }
  ];
  return (
    <section className="card">
      <DataTable rows={rows} cols={cols} onRow={j => onJob(j.id)} pageSize={20} defaultSort={{ key: 'waste', dir: 'desc' }}
        toolbar={<ListToolbar shown={rows.length} total={v.jobs.length} noun="jobs" search={{ value: q, onChange: x => set('q', x), placeholder: `Job, ${V.customer.toLowerCase()}, datacenter` }}
          actions={[{ label: 'Export CSV', icon: I.Download, onClick: () => downloadCsv('gpu-jobs.csv', [['Job', 'ID', 'Kind', V.customer, 'Datacenter', 'GPUs', 'State', 'Slowdown %', 'MFU %', 'GPU time lost ₹/h', 'Lost so far ₹', 'Incident'], ...rows.map(j => [j.name, j.id, j.kind, j.owner, j.dcId, j.gpus, j.state, j.slowdownPct, j.mfu, j.wasteRate, j.wasteSoFar + j.redo, j.incidentId ?? ''])]) }]}
          filters={[
            { id: 'gstate', label: 'State', quick: true, value: st, anyLabel: 'Any state', onChange: x => set('gstate', x), options: (['stalled', 'slowed', 'at-risk', 'idle', 'running'] as const).map(s => ({ id: s, label: STATE_LABEL[s], count: v.jobs.filter(j => j.state === s).length })) },
            { id: 'kind', label: 'Kind', quick: true, value: kind, anyLabel: 'Any kind', onChange: setKind, options: (['training', 'fine-tuning', 'inference'] as const).map(k => ({ id: k, label: k[0].toUpperCase() + k.slice(1), count: v.jobs.filter(j => j.kind === k).length })) }
          ]} />} />
    </section>
  );
}

/* -------------------------------------------------------------------- nodes */

function Nodes({ v, onNode, hideDc }: { v: GpuView; onNode: (id: string) => void; hideDc?: boolean }) {
  const [sp, setSp] = useSearchParams();
  const st = sp.get('gstate') ?? '', q = sp.get('q') ?? '', model = sp.get('gmodel') ?? '';
  const [view, setView] = useState('');
  const set = (k: string, x: string) => { const n = new URLSearchParams(sp); x ? n.set(k, x) : n.delete(k); setSp(n, { replace: true }); };
  const match = (n: GpuNodeRow) => !st || (st === 'degraded' ? n.worst !== 'ok' : st === 'failed' ? n.health === 'failed' || n.state === 'failed' : n.state === st);
  const rows = useMemo<NodeR[]>(() => v.nodes.map(n => ({ ...n, id: n.neId })).filter(n => match(n) && (!model || n.model === model || n.vendor === model) && (!view || (view === 'drift' ? n.drift : view === 'liquid' ? n.cooling === 'liquid' : n.throttled > 0)) && (!q || `${n.neId} ${n.job ?? ''} ${n.owner ?? ''} ${n.rackName}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => ({ bad: 0, warn: 1, ok: 2 })[a.worst] - ({ bad: 0, warn: 1, ok: 2 })[b.worst]), [v.nodes, st, view, q, model]);
  const cols: Col<NodeR>[] = [
    { key: 'node', header: 'Node', sort: n => n.neId, render: n => <span className="cell-2"><span className="nowrap" title={`${gpuName(n.model)} × 8 · ${n.server}`}><span className="mono gpu-strong">{short(n.neId)}</span> <VendorTag v={n.vendor} /><span className="gpu-model-s">{gpuSpec(n.model).short}</span></span><small className="nowrap">{hideDc ? '' : `${n.dcId} · `}{n.rackName} · {n.cluster}</small></span> },
    { key: 'gpus', header: 'GPUs', render: n => <span className="gpu-strip" aria-label="GPU health">{n.gpus.map(g => <i key={g.idx} title={`GPU${g.idx} · ${g.util}% · ${g.tempC}°C${g.throttle !== 'none' ? ` · ${g.throttle}` : ''}${g.xid ? ` · Xid ${g.xid.code}` : ''}`} style={{ background: cellColor(g.health, g.util, g.throttle, n.state) }} />)}</span> },
    { key: 'state', header: 'State', sort: n => n.state, render: n => <StateChip s={n.state} /> },
    { key: 'job', header: 'Job', wrap: true, sort: n => n.job ?? '', render: n => (n.job ? <span className="cell-2"><span>{n.job}</span><small>{n.owner}</small></span> : <span className="faint">{n.note ?? '—'}</span>) },
    { key: 'util', header: 'Util', sort: n => n.util, render: n => <span className="num">{n.util}%</span> },
    { key: 'temp', header: 'Max temp', sort: n => n.maxTemp, render: n => <span className={`num nowrap${n.maxTemp >= 85 ? ' gpu-bad' : n.maxTemp >= 80 ? ' gpu-warn' : ''}`}>{n.maxTemp}°C{n.throttled ? <small className="faint"> · {n.throttled} throttled</small> : null}</span> },
    { key: 'pwr', header: 'Power', sort: n => n.powerKw, render: n => <span className="num nowrap">{n.powerKw} kW</span> },
    { key: 'err', header: 'Errors', sort: n => (n.xid ? 1000 : 0) + n.gpus.reduce((a, g) => a + g.dbe * 100 + (g.nvlinkErr > 100 ? 10 : 0), 0), render: n => (n.xid ? <span className="cell-2"><span className="gpu-bad nowrap">Xid {n.xid.code}</span><small className="nowrap">{fmtAgo(n.xid.at, v.now)}</small></span> : n.ib.some(p => p.state !== 'up') ? <span className="gpu-warn nowrap">IB rail {n.ib.find(p => p.state !== 'up')!.rail} {n.ib.find(p => p.state !== 'up')!.state}</span> : <span className="faint">—</span>) },
    { key: 'drv', header: 'Driver', hideBelow: 1360, sort: n => n.driver, render: n => <span className={`mono nowrap${n.drift ? ' gpu-warn' : ''}`}>{n.driver}</span> }
  ];
  return (
    <section className="card">
      <DataTable rows={rows} cols={cols} onRow={n => onNode(n.neId)} pageSize={25}
        toolbar={<ListToolbar shown={rows.length} total={v.nodes.length} noun="nodes" search={{ value: q, onChange: x => set('q', x), placeholder: 'Node, job, rack' }}
          filters={[
            { id: 'gmodel', label: 'GPU model', quick: true, value: model, anyLabel: 'Any model', onChange: x => set('gmodel', x), options: [
              ...GPU_VENDORS.filter(vd => v.nodes.some(n => n.vendor === vd)).map(vd => ({ id: vd, label: `All ${vd}`, count: v.nodes.filter(n => n.vendor === vd).length })),
              ...v.fleet.models.map(m => ({ id: m.model, label: gpuName(m.model), count: m.nodes }))] },
            { id: 'gstate', label: 'Condition', quick: true, value: st, anyLabel: 'Any condition', onChange: x => set('gstate', x), options: [
              { id: 'degraded', label: 'Needs attention', count: v.nodes.filter(n => n.worst !== 'ok').length }, { id: 'failed', label: 'Failed', count: v.nodes.filter(n => n.health === 'failed' || n.state === 'failed').length },
              { id: 'in-job', label: 'In a job', count: v.nodes.filter(n => n.state === 'in-job').length }, { id: 'idle', label: 'Spare', count: v.nodes.filter(n => n.state === 'idle').length },
              { id: 'drained', label: 'Drained', count: v.nodes.filter(n => n.state === 'drained').length }, { id: 'burn-in', label: 'Burn-in', count: v.nodes.filter(n => n.state === 'burn-in').length }] },
            { id: 'view', label: 'Show', quick: true, value: view, anyLabel: 'All nodes', onChange: setView, options: [
              { id: 'throttled', label: 'Throttled', count: v.nodes.filter(n => n.throttled > 0).length }, { id: 'drift', label: `Old driver (not ${v.fleet.driverStd})`, count: v.nodes.filter(n => n.drift).length }, { id: 'liquid', label: 'Liquid-cooled', count: v.nodes.filter(n => n.cooling === 'liquid').length }] }
          ]} />} />
    </section>
  );
}

/* ---------------------------------------------------------------- models */

export const VendorTag = ({ v }: { v: string }) => <span className={`gpu-vendor is-${v.toLowerCase()}`}>{v}</span>;

/* the accelerator models in the fleet: datasheet, where they run, how busy and healthy they are */
function Models({ v, onModel }: { v: GpuView; onModel: (m: string) => void }) {
  const [vendor, setVendor] = useState('');
  const ms = v.fleet.models;
  const rows = ms.filter(m => !vendor || m.vendor === vendor).map(m => ({ ...m, id: m.model }));
  const total = ms.reduce((a, m) => a + m.gpus, 0);
  const vendors = GPU_VENDORS.map(vd => ({ vd, ms: ms.filter(m => m.vendor === vd) })).filter(x => x.ms.length);
  const cols: Col<GpuModelRow & { id: string }>[] = [
    { key: 'model', header: 'GPU model', wrap: true, sort: m => `${m.vendor} ${m.model}`, render: m => <span className="cell-2 gpu-model-cell"><span className="nowrap gpu-strong"><VendorTag v={m.vendor} />{m.model}</span><small>{gpuSpec(m.model).arch} · {gpuSpec(m.model).memGb} GB {gpuSpec(m.model).memType} · {gpuSpec(m.model).tdpW} W · {gpuSpec(m.model).form}</small></span> },
    { key: 'use', header: 'Used for', sort: m => gpuSpec(m.model).use, render: m => <span className={`vw-chip ${gpuSpec(m.model).use === 'training' ? 'vw-chip--info' : 'vw-chip--neutral'} cmd-chip`}>{gpuSpec(m.model).use === 'training' ? 'Training' : 'Inference'}</span> },
    { key: 'gpus', header: 'GPUs', sort: m => m.gpus, render: m => <span className="cell-2"><span className="num">{fmtNum(m.gpus)}</span><small className="nowrap">{m.nodes} nodes · {m.clusters} pod{m.clusters === 1 ? '' : 's'} · {fmtNum(m.powerKw)} kW</small></span> },
    { key: 'sites', header: 'Datacenters', wrap: true, sort: m => m.sites.length, render: m => <span className="cell-2"><span className="num">{m.sites.length}</span><small>{m.sites.slice(0, 3).join(' · ')}{m.sites.length > 3 ? ` +${m.sites.length - 3}` : ''}</small></span> },
    { key: 'link', header: 'Scale-up · scale-out', wrap: true, render: m => <span className="cell-2"><span>{gpuSpec(m.model).link || 'PCIe only'}</span><small>{gpuSpec(m.model).fabric}</small></span> },
    { key: 'busy', header: 'In jobs · busy', sort: m => m.inJob / Math.max(1, m.gpus), render: m => <span className="cell-2"><span className="num nowrap">{Math.round((m.inJob / Math.max(1, m.gpus)) * 100)}% allocated</span><small className="nowrap">{m.util}% busy in jobs</small></span> },
    { key: 'health', header: 'Health', sort: m => m.failed * 100 + m.degraded, render: m => (m.failed || m.degraded ? <span className="cell-2">{m.failed > 0 && <span className="gpu-bad nowrap num">{m.failed} failed</span>}{m.degraded > 0 && <span className="gpu-warn nowrap num">{m.degraded} degraded</span>}</span> : <span className="faint">all healthy</span>) },
    { key: 'tel', header: 'Telemetry', wrap: true, hideBelow: 1600, render: m => <span className="vw-label">{gpuSpec(m.model).telemetry}</span> }
  ];
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="gpu-vendors">
        {vendors.map(x => {
          const n = x.ms.reduce((a, m) => a + m.gpus, 0);
          return (
            <button key={x.vd} type="button" className={`vw-card-section gpu-vendor-card${vendor === x.vd ? ' is-on' : ''}`} onClick={() => setVendor(vendor === x.vd ? '' : x.vd)} aria-pressed={vendor === x.vd}>
              <span className="gpu-vendor-h"><VendorTag v={x.vd} /><span className="vw-label">{Math.round((n / Math.max(1, total)) * 100)}% of the fleet</span></span>
              <b className="num">{fmtNum(n)} <small>GPUs</small></b>
              <span className="gpu-vendor-bar">{x.ms.map(m => <i key={m.model} style={{ flex: m.gpus }} title={`${m.model} · ${fmtNum(m.gpus)} GPUs`} />)}</span>
              <span className="gpu-vendor-ms">{x.ms.map(m => <span key={m.model}><b>{gpuSpec(m.model).short}</b> {fmtNum(m.gpus)}</span>)}</span>
            </button>
          );
        })}
      </div>
      <section className="card">
        <DataTable rows={rows} cols={cols} onRow={m => onModel(m.model)} pageSize={20} defaultSort={{ key: 'gpus', dir: 'desc' }}
          toolbar={<ListToolbar shown={rows.length} total={ms.length} noun="GPU models"
            filters={[{ id: 'vendor', label: 'Vendor', quick: true, value: vendor, anyLabel: 'Any vendor', onChange: setVendor, options: vendors.map(x => ({ id: x.vd, label: x.vd, count: x.ms.length })) }]} />} />
      </section>
    </div>
  );
}

/* ----------------------------------------------------------- cooling & power */

function CoolingPower({ v }: { v: GpuView }) {
  const nav = useNavigate();
  return (
    <div className="col" style={{ gap: 16 }}>
      {v.cdus.length > 0 && (
        <Panel title="Liquid-cooling loops" icon={I.Droplets} sub="Coolant distribution units feeding direct-to-chip GPU racks · flow against design, supply and return temperature">
          <div className="gpu-cdus">{v.cdus.map(c => <CduCard key={c.id} c={c} onOpen={() => nav(`/facilities?dc=${c.dcId}&tab=cooling`)} />)}</div>
        </Panel>
      )}
      <Panel title="GPU racks" icon={I.Zap} sub="Draw against the rack's power budget — GPU racks run close to their breakers" flush>
        <table className="nst-table dt-table gpu-racks"><thead><tr><th>Rack</th><th>Cooling</th><th>Nodes</th><th>Power</th><th>Hottest GPU</th><th>State</th></tr></thead>
          <tbody>{v.racks.slice(0, 40).map(r => {
            const pct = Math.round((r.drawKw / r.budgetKw) * 100);
            return (
              <tr key={r.id} className="is-click" onClick={() => nav(`/datacenters/${r.dcId}?tab=gpu&gtab=nodes&q=${r.name}`)}>
                <td><span className="cell-2"><span className="gpu-strong">{r.dcId} · {r.name}</span><small>{r.room}</small></span></td>
                <td>{r.liquid ? <span className="nowrap"><I.Droplets size={13} style={{ verticalAlign: -2 }} /> {r.cdu ?? 'liquid'}</span> : <span className="faint">air</span>}</td>
                <td className="num">{r.nodes}</td>
                <td><span className="gpu-meter"><SoftMeter pct={pct} tone={pct >= 90 ? 'error' : pct >= 80 ? 'warning' : 'info'} /><span className="num nowrap">{r.drawKw} / {r.budgetKw} kW</span></span></td>
                <td className={`num${r.maxTemp >= 85 ? ' gpu-bad' : ''}`}>{r.maxTemp}°C</td>
                <td><span className={`gpu-dot is-${r.state}`} /> {r.state === 'ok' ? 'Normal' : r.state === 'warn' ? 'Watch' : 'Act'}</td>
              </tr>
            );
          })}</tbody></table>
        {v.racks.length > 40 && <div className="vw-label" style={{ padding: '10px 16px' }}>Showing the 40 racks closest to their limits of {v.racks.length}.</div>}
      </Panel>
    </div>
  );
}
function CduCard({ c, onOpen }: { c: GpuView['cdus'][number]; onOpen: () => void }) {
  const flowPct = Math.round((c.flowLpm / c.flowNominal) * 100);
  return (
    <button type="button" className={`gpu-cdu is-${c.state}`} onClick={onOpen} title="Open in Facilities">
      <span className="gpu-cdu-h"><b>{c.dcId} · {c.name}</b><span className={`gpu-dot is-${c.state === 'ok' ? 'ok' : c.state === 'warn' ? 'warn' : 'bad'}`} /></span>
      <span className="vw-label">{c.room} · {c.racks.length} rack{c.racks.length === 1 ? '' : 's'} · pump {c.pump}</span>
      <span className="gpu-cdu-row"><span className="vw-label">Flow</span><SoftMeter pct={flowPct} tone={flowPct < 75 ? 'error' : flowPct < 90 ? 'warning' : 'info'} /><b className="num">{flowPct}%</b></span>
      <span className="gpu-cdu-kv"><span>Supply <b className={`num${c.supplyC > 30 ? ' gpu-bad' : ''}`}>{c.supplyC}°C</b></span><span>Return <b className="num">{c.returnC}°C</b></span><span>Load <b className="num">{c.util}%</b></span></span>
      {c.note && <span className="gpu-cdu-note">{c.note}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------- fabric */

function Fabric({ v, onNode }: { v: GpuView; onNode: (id: string) => void }) {
  const flapping = v.nodes.filter(n => n.ib.some(p => p.state !== 'up'));
  return (
    <div className="col" style={{ gap: 16 }}>
      {flapping.length > 0 && <div className="note note--warn"><I.TriangleAlert size={15} /><span>{flapping.map(n => `${short(n.neId)} rail ${n.ib.find(p => p.state !== 'up')!.rail} ${n.ib.find(p => p.state !== 'up')!.state}`).join(' · ')} — collectives on that rail retry, so every job using it slows. <button type="button" className="panel-link" onClick={() => onNode(flapping[0].neId)}>Open node</button></span></div>}
      <Panel title="InfiniBand rails" icon={I.Network} sub="Rail-optimised fabric: GPU n of every node connects to rail n · ports up per rail, and symbol errors" flush>
        <div className="dt-scroll">
          <table className="nst-table dt-table gpu-rails"><thead><tr><th>Cluster</th>{Array.from({ length: 8 }, (_, i) => <th key={i}>Rail {i}</th>)}</tr></thead>
            <tbody>{v.rails.map(c => (
              <tr key={c.clusterId}>
                <td><span className="cell-2"><span className="gpu-strong">{c.dcId} · {c.cluster}</span></span></td>
                {c.rails.map(r => <td key={r.rail}><span className={`gpu-rail${r.flapping || r.down ? ' is-bad' : r.errors > 200 ? ' is-warn' : ''}`} title={`${r.up} up · ${r.flapping} flapping · ${r.down} down · ${fmtNum(r.errors)} symbol errors`}><b className="num">{r.up}</b>{r.flapping || r.down ? <small>{r.flapping + r.down} bad</small> : <small>{fmtNum(r.errors)} err</small>}</span></td>)}
              </tr>
            ))}</tbody></table>
        </div>
      </Panel>
    </div>
  );
}


/* ---------------------------------------------------------------- telemetry */

/* What the DCGM exporter says about the whole fleet: where utilisation and heat sit, 24 h history,
   power and energy, errors and the GPUs that lead each error counter. */
function Telemetry({ t, v, onNode }: { t: GpuTelemetry; v: GpuView; onNode: (id: string) => void }) {
  const f = v.fleet;
  const hours = Array.from({ length: 24 }, (_, h) => { const d = new Date(v.now - (23 - h) * 3600000); return `${String(d.getHours()).padStart(2, '0')}:00`; });
  const xidTotal = t.xid24.reduce((a, b) => a + b, 0);
  const Lead = ({ title, items, hint }: { title: string; items: Leader[]; hint: string }) => (
    <Panel title={title} sub={hint}>
      {items.length ? <ul className="gpu-lead">{items.map(l => <li key={`${l.neId}-${l.gpu}`}><button type="button" onClick={() => onNode(l.neId)}><span className="mono">{short(l.neId)} GPU{l.gpu}</span><small>{l.dcId}{l.job ? ` · ${l.job}` : ''}</small></button><b className="num">{fmtNum(l.value)} {l.unit}</b></li>)}</ul> : <span className="faint" style={{ fontSize: 13 }}>Nothing to report.</span>}
    </Panel>
  );
  return (
    <div className="col" style={{ gap: 16 }}>
      <StatGrid>
        <StatTile label="Utilisation · in jobs" value={`${f.utilInJobs}%`} sub="mean GPU util"><SoftMeter pct={f.utilInJobs} tone="info" /><Facts items={[{ n: `${t.smAvg}%`, label: 'SM active' }, { n: `${t.tensorAvg}%`, label: 'tensor cores' }]} /></StatTile>
        <StatTile label="Power now" value={`${fmtNum(t.powerKwNow)} kW`}><SoftMeter pct={t.avgTdpPct} tone="info" /><Facts items={[{ n: `${t.avgPowerW} W`, label: `per GPU · ${t.avgTdpPct}% of TDP` }]} /></StatTile>
        <StatTile label="Energy · 24 h" value={`${t.energyMwh24} MWh`}><Split parts={[{ key: 'p0', label: 'P0 (busy)', n: t.pstate.P0, tone: 'info' }, { key: 'p8', label: 'P8 (idle)', n: t.pstate.P8, tone: 'neutral' }]} /></StatTile>
        <StatTile label="Hottest GPU" value={`${f.hottest}°C`} sub="now" subTone={f.hottest >= 85 ? 'bad' : f.hottest >= 80 ? 'warn' : undefined}><Split parts={t.tempHist.slice(3).map((b, i) => ({ key: b.label, label: b.label, n: b.n, tone: (['info', 'orange', 'error'] as Tone[])[i] }))} /><Facts items={[{ n: `${t.fanAvg}%`, label: 'avg fan' }]} /></StatTile>
        <StatTile label="Memory errors" value={fmtNum(t.ecc.sbe)} sub="SBE" subTone={t.ecc.dbe ? 'bad' : undefined}><Split parts={[{ key: 'dbe', label: 'Uncorrectable', n: t.ecc.dbe, tone: 'error' }, { key: 'rp', label: 'Pages retired', n: t.ecc.retired, tone: 'orange' }, { key: 'rm', label: 'Remap pending', n: t.ecc.remap, tone: 'warning' }]} /></StatTile>
        <StatTile label="Xid events · 24 h" value={xidTotal} sub="driver errors" subTone={xidTotal ? 'bad' : undefined}><MiniBars values={t.xid24} labels={hours} hot={t.xid24.lastIndexOf(Math.max(...t.xid24))} /></StatTile>
      </StatGrid>
      <div className="grid g-2">
        <Panel title="Where the GPUs are" icon={I.BarChart3} sub="Every GPU by utilisation and by temperature, right now">
          <div className="gpu-hists">
            <div><span className="vw-label">Utilisation</span>{t.utilHist.map(b => <span key={b.label} className="gpu-hbar"><em>{b.label}</em><i style={{ width: `${(b.n / Math.max(1, ...t.utilHist.map(x => x.n))) * 100}%`, background: 'var(--primaryColor500)' }} /><b className="num">{fmtNum(b.n)}</b></span>)}</div>
            <div><span className="vw-label">Temperature</span>{t.tempHist.map((b, i) => <span key={b.label} className="gpu-hbar"><em>{b.label}</em><i style={{ width: `${(b.n / Math.max(1, ...t.tempHist.map(x => x.n))) * 100}%`, background: i >= 5 ? 'var(--vw-color-red-400)' : i === 4 ? 'var(--vw-color-amber-400)' : 'var(--vw-color-slate-400)' }} /><b className="num">{fmtNum(b.n)}</b></span>)}</div>
          </div>
        </Panel>
        <Panel title="Last 24 hours" icon={I.Activity} sub="Fleet mean utilisation and hottest GPU">
          <TimeChart labels={hours.map((h, i) => (i % 4 === 3 ? h : ''))} fullLabels={hours} height={200} yMin={0} yMax={100} format={n => `${Math.round(n)}`}
            series={[{ key: 'util', label: 'Mean utilisation %', color: 'var(--primaryColor500)', kind: 'area', values: t.series.util }, { key: 'hot', label: 'Hottest GPU °C', color: 'var(--vw-color-amber-500)', kind: 'line', values: t.series.hottest }]} />
          <div className="rev-kv" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <div><span className="vw-label">Power now</span><b className="num">{fmtNum(t.series.power[23])} kW</b></div>
            <div><span className="vw-label">Peak · 24 h</span><b className="num">{fmtNum(Math.max(...t.series.power))} kW</b></div>
            <div><span className="vw-label">Energy · 24 h</span><b className="num">{t.energyMwh24} MWh</b></div>
          </div>
        </Panel>
      </div>
      <div className="grid g-3">
        <Lead title="Hottest GPUs" items={t.leaders.hottest} hint="DCGM_FI_DEV_GPU_TEMP" />
        <Lead title="PCIe replays" items={t.leaders.pcie} hint="DCGM_FI_DEV_PCIE_REPLAY_COUNTER · a rising count precedes 'fell off the bus'" />
        <Lead title="NVLink errors" items={t.leaders.nvlink} hint="DCGM_FI_DEV_NVLINK_*_ERROR_COUNT_TOTAL" />
        <Lead title="Correctable ECC" items={t.leaders.sbe} hint="DCGM_FI_DEV_ECC_SBE_VOL_TOTAL · many SBE on one GPU foreshadow a DBE" />
        <Lead title="Allocated but idle" items={t.leaders.idle} hint="in a job, under 5% utilisation" />
        <Panel title="Metrics collected" icon={I.ListChecks} sub={v.fleet.models.some(m => m.vendor === 'Intel') ? 'NVIDIA DCGM exporter fields behind this page · Intel Gaudi (habanalabs exporter) and Data Center GPU Max (XPU Manager) report the same counters under their own names' : 'NVIDIA DCGM exporter fields behind this page'}>
          <ul className="gpu-fields">{t.fields.map(x => <li key={x.field}><code>{x.field}</code><span>{x.what}</span></li>)}</ul>
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ drawers */

function NodeDrawer({ id, onClose, onJob }: { id: string | null; onClose: () => void; onJob: (id: string) => void }) {
  const nav = useNavigate();
  const ask = useSentinel();
  const { data } = useQuery(() => (id ? getGpuNode(id) : Promise.resolve(null)), [id]);
  if (!id) return null;
  const d = data && data.node.neId === id ? data : null;
  const n = d?.node;
  return (
    <Drawer open onClose={onClose} width={860} title={n ? short(n.neId) : id} sub={n ? `${gpuName(n.model)} × 8 · ${n.dcId} · ${n.rackName} · ${n.cluster} · ${n.cooling === 'liquid' ? 'liquid-cooled' : 'air-cooled'}` : 'Loading'}
      foot={<>
        <Btn icon={I.Server} onClick={() => nav(`/ne/${encodeURIComponent(id)}?tab=gpus`)}>Open device</Btn>
        {n?.jobId && <Btn icon={I.BrainCircuit} onClick={() => onJob(n.jobId!)}>Open job</Btn>}
        {d?.alerts.find(a => a.incidentId) && <Btn variant="filled" icon={I.Siren} onClick={() => nav(`/incidents/${d.alerts.find(a => a.incidentId)!.incidentId}`)}>Open incident</Btn>}
        <span className="grow" />
        <OpstralBtn onClick={() => { onClose(); ask(`Why is ${id} alarming?`); }} />
      </>}>
      {!d ? <Loading /> : <GpuNodeDetail d={d} />}
    </Drawer>
  );
}

/* Everything DCGM reports for one node: recommendation, node figures, the per-GPU table in two views
   (health and profiling), 24 h history, InfiniBand ports and alarms. Shared by the AI & GPU drawer and the device page. */
export function GpuNodeDetail({ d }: { d: NonNullable<Awaited<ReturnType<typeof getGpuNode>>> }) {
  const n = d.node, spec = gpuSpec(n.model), nv = n.vendor === 'NVIDIA';
  const ib = spec.fabric.startsWith('InfiniBand');
  const [view, setView] = useState<'health' | 'profile'>('health');
  const action = n.gpus.some(g => g.xid?.code === 79) ? 'Cordon the node, restart the job from its checkpoint on a spare node, then run DCGM level-3 diagnostics; RMA the GPU if they fail.'
    : n.gpus.some(g => g.remapPending) ? 'Let the job reach its next checkpoint, then drain the node and reset the GPU to apply the row remap.'
    : n.gpus.some(g => g.nvlinkErr > 100) ? 'Drain at the next checkpoint and swap in a spare; reseat the baseboard and run an NVLink bandwidth test.'
    : n.gpus.some(g => g.throttle === 'hw-slowdown') ? 'Cooling problem, not the node: cap GPU power to 550 W and restore coolant flow on the loop.'
    : n.gpus.some(g => g.throttle === 'power-cap') ? 'The rack is near its breaker: rebalance a node to another rack before lifting the cap.'
    : n.ib.some(p => p.state !== 'up') ? 'Replace the transceiver or cable on the flapping rail; the job slows until then.'
    : n.drift ? 'Schedule the driver update to the fleet standard at the next maintenance window.' : '';
  const hours = Array.from({ length: 24 }, (_, h) => `${String((new Date(d.ne.lastSeen ?? Date.now()).getHours() - 23 + h + 48) % 24).padStart(2, '0')}:00`);
  return (
    <div className="gpu-drawer">
      <div className="row wrap" style={{ gap: 8 }}><StateChip s={n.state} />{n.job && <span className="vw-label">{n.job} · {n.owner}</span>}{n.note && <span className="vw-label">{n.note}</span>}</div>
      {action && <div className={`note ${n.worst === 'bad' ? 'note--bad' : 'note--warn'}`}><I.Wrench size={15} /><span><b>Recommended:</b> {action}</span></div>}
      <div className="gpu-hw" data-gpu-hw>
        <span className="gpu-hw-name"><VendorTag v={n.vendor} /><b>{n.model}</b><span className="vw-label">× 8 · {spec.arch}</span></span>
        <span><span className="vw-label">Server</span>{n.server}</span>
        <span><span className="vw-label">Memory</span>{spec.memGb} GB {spec.memType}</span>
        <span><span className="vw-label">Power limit</span>{spec.tdpW} W · {spec.form}</span>
        <span><span className="vw-label">Scale-up</span>{spec.link || 'none (PCIe only)'}</span>
        <span><span className="vw-label">Telemetry</span>{spec.telemetry}</span>
      </div>
      <div className="rev-figs">
        <div className="rev-fig"><span className="vw-label">Utilisation</span><b className="num">{n.util}%</b><small>SM active {Math.round(n.gpus.reduce((a, g) => a + g.smActive, 0) / 8)}% · tensor {Math.round(n.gpus.reduce((a, g) => a + g.tensorActive, 0) / 8)}%</small></div>
        <div className="rev-fig"><span className="vw-label">Node power</span><b className="num">{n.powerKw} kW</b><small>GPUs {(n.gpus.reduce((a, g) => a + g.powerW, 0) / 1000).toFixed(1)} kW of {(n.gpus.reduce((a, g) => a + g.tdpW, 0) / 1000).toFixed(1)} · {n.gpus.reduce((a, g) => a + g.energyKwh24, 0).toFixed(0)} kWh / 24 h</small></div>
        <div className="rev-fig"><span className="vw-label">Hottest GPU</span><b className={`num${n.maxTemp >= 85 ? ' gpu-bad' : ''}`}>{n.maxTemp}°C</b><small>HBM {Math.max(...n.gpus.map(g => g.hbmC))}°C{n.cooling === 'air' ? ` · fans ${Math.round(n.gpus.reduce((a, g) => a + g.fanPct, 0) / 8)}%` : ' · liquid'}</small></div>
        <div className="rev-fig"><span className="vw-label">Driver</span><b className={`num${n.drift ? ' gpu-warn' : ''}`}>{n.driver}</b><small>{n.firmware}</small></div>
      </div>
      <div className="rev-sec">
        <div className="rev-sec-h"><b>Per GPU</b><span className="vw-label">as {nv ? 'the DCGM exporter' : spec.telemetry} reports it</span><span className="grow" /><Seg size="sm" value={view} onChange={setView} options={[{ id: 'health', label: 'Health' }, { id: 'profile', label: 'Profiling & traffic' }]} /></div>
        <div className="dt-scroll"><table className="nst-table dt-table gpu-gpus">
          {view === 'health' ? <>
            <thead><tr><th>GPU</th><th>Health</th><th>Util</th><th>Memory</th><th>Temp · HBM</th><th>Power</th><th>Clock · P-state</th><th>Throttle</th><th>ECC · pages</th><th>{spec.link ? `${spec.linkShort} err` : 'Link err'}</th><th>{nv ? 'Last Xid' : 'Last error'}</th></tr></thead>
            <tbody>{n.gpus.map(g => (
              <tr key={g.idx} className={g.health !== 'healthy' ? `is-${g.health}` : ''}>
                <td className="mono">GPU{g.idx}</td>
                <td><span className="row nowrap" style={{ gap: 6 }}><i className="gpu-sq" style={{ background: cellColor(g.health, g.util, g.throttle, n.state) }} />{g.health}</span></td>
                <td className="num">{g.util}%</td>
                <td className="num nowrap">{g.memUsedGb}/{g.memGb} GB</td>
                <td className={`num nowrap${g.tempC >= 85 ? ' gpu-bad' : ''}`}>{g.tempC}° · {g.hbmC}°</td>
                <td className="num nowrap">{g.powerW}/{g.tdpW} W</td>
                <td className="num nowrap">{g.clockMhz} MHz · {g.pstate}</td>
                <td className={g.throttle !== 'none' ? 'gpu-warn nowrap' : 'faint'}>{g.throttle === 'none' ? '—' : g.throttle}</td>
                <td className="num nowrap">{g.dbe ? <span className="gpu-bad">{g.dbe} DBE</span> : null}{g.dbe && g.sbe ? ' · ' : ''}{g.sbe ? `${g.sbe} SBE` : g.dbe ? '' : '—'}{g.remapPending ? <small className="gpu-warn"> remap</small> : null}{g.retiredPages ? <small className="gpu-warn"> · {g.retiredPages} pg</small> : null}</td>
                <td className={`num${g.nvlinkErr > 100 ? ' gpu-bad' : ''}`}>{spec.link ? g.nvlinkErr || '—' : '—'}</td>
                <td>{g.xid ? <span className="gpu-bad nowrap" title={`${g.xid.text} · ${new Date(g.xid.at).toTimeString().slice(0, 5)}`}>Xid {g.xid.code}</span> : <span className="faint">—</span>}</td>
              </tr>))}</tbody>
          </> : <>
            <thead><tr><th>GPU</th><th>Util</th><th>SM active</th><th>SM occ.</th><th>Tensor</th><th>Mem copy</th><th>DRAM</th><th>Mem clock</th><th>Fan</th><th>PCIe rx / tx</th><th>PCIe replay</th><th>{spec.link ? spec.linkShort : 'Scale-up'} rx / tx</th><th>Energy 24 h</th></tr></thead>
            <tbody>{n.gpus.map(g => (
              <tr key={g.idx} className={g.health !== 'healthy' ? `is-${g.health}` : ''}>
                <td className="mono">GPU{g.idx}</td>
                <td className="num">{g.util}%</td><td className="num">{g.smActive}%</td><td className="num">{g.smOccupancy}%</td><td className="num">{g.tensorActive}%</td><td className="num">{g.memCopyUtil}%</td><td className="num">{g.dramActive}%</td>
                <td className="num nowrap">{g.memClockMhz} MHz</td><td className="num">{n.cooling === 'air' ? `${g.fanPct}%` : '—'}</td>
                <td className="num nowrap">{g.pcieRxGbs} / {g.pcieTxGbs} GB/s</td><td className={`num${g.pcieReplay > 100 ? ' gpu-bad' : g.pcieReplay ? ' gpu-warn' : ''}`}>{g.pcieReplay || '—'}</td>
                <td className="num nowrap">{spec.link ? `${g.nvlinkRxGbs} / ${g.nvlinkTxGbs} GB/s` : '—'}</td><td className="num nowrap">{g.energyKwh24} kWh</td>
              </tr>))}</tbody>
          </>}
        </table></div>
      </div>
      <div className="rev-sec">
        <div className="rev-sec-h"><b>Last 24 hours</b><span className="vw-label">one sample per hour across the node's 8 GPUs</span></div>
        <div className="gpu-hist">
          <div><span className="vw-label">Utilisation %</span><Sparkline values={n.series.util} color="var(--primaryColor500)" height={44} /><small className="num">{n.series.util[0]}% → {n.series.util[23]}%</small></div>
          <div><span className="vw-label">Hottest GPU °C</span><Sparkline values={n.series.tempC} color={n.maxTemp >= 85 ? 'var(--vw-color-red-500)' : 'var(--vw-color-amber-500)'} height={44} /><small className="num">{n.series.tempC[0]}° → {n.series.tempC[23]}°</small></div>
          <div><span className="vw-label">Node power kW</span><Sparkline values={n.series.powerKw} color="var(--vw-color-slate-500)" height={44} /><small className="num">{n.series.powerKw[0]} → {n.series.powerKw[23]} kW</small></div>
        </div>
        <span className="vw-label">{hours[0]} to {hours[23]}</span>
      </div>
      <div className="rev-sec">
        <div className="rev-sec-h"><b>{ib ? 'InfiniBand ports' : 'Scale-out ports'}</b><span className="vw-label">{ib ? `one port per GPU, on rails 0–7 · ${spec.fabric}` : spec.fabric}</span></div>
        <div className="gpu-ports">{n.ib.map(p => <span key={p.rail} className={`gpu-port is-${p.state}`} title={`${fmtNum(p.errors)} symbol errors`}><b>{ib ? 'ib' : 'eth'}{p.rail}</b>{p.state === 'up' ? `${p.errors} err` : p.state}</span>)}</div>
      </div>
      {d.alerts.length > 0 && (
        <div className="rev-sec">
          <div className="rev-sec-h"><b>Active alarms</b></div>
          <ul className="gpu-alarms">{d.alerts.map(a => <li key={a.id}><span className={`sev-dot`} style={{ background: a.severity === 'critical' ? 'var(--vw-color-red-500)' : a.severity === 'major' ? 'var(--vw-color-orange-500)' : 'var(--vw-color-amber-400)' }} /><span><b>{a.title}</b><small>{a.description}</small></span>{a.incidentId && <Link className="ent-link mono" to={`/incidents/${a.incidentId}`}>{a.incidentId}</Link>}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function JobDrawer({ j, v, onClose, onNode }: { j: GpuJobRow | null; v: GpuView; onClose: () => void; onNode: (id: string) => void }) {
  const nav = useNavigate();
  const ask = useSentinel();
  const { vocab: V } = usePersona();
  if (!j) return null;
  const spare = v.nodes.find(n => n.clusterId === j.clusterId && n.state === 'idle' && n.worst === 'ok');
  const plan = j.state === 'stalled' ? [`Cordon ${short(j.causeNeId!)} so the scheduler stops placing work on it`, `Restart ${j.name} from its checkpoint (${fmtAgo(j.lastCheckpoint, v.now)}) on ${spare ? `spare node ${short(spare.neId)}` : 'N-1 nodes'}`, 'Run DCGM level-3 diagnostics on the failed node; RMA the GPU if they fail']
    : j.state === 'slowed' ? [`Find the straggler: ${j.cause}`, j.cause?.includes('CDU') ? 'Restore coolant flow; cap GPU power until it recovers' : `Drain ${j.causeNeId ? short(j.causeNeId) : 'the slow node'} at the next checkpoint and swap in ${spare ? short(spare.neId) : 'a spare'}`, 'Confirm step time is back within 5% of baseline']
    : j.state === 'at-risk' ? [`Let the job write its next checkpoint (every ${j.checkpointMin} min)`, `Drain ${short(j.causeNeId!)} and reset the GPU to apply the row remap`, 'Resume on a spare node']
    : j.state === 'idle' ? [`Ask ${j.owner} to scale ${j.name} down or release the GPUs`, 'Return the nodes to the spare pool'] : [];
  return (
    <Drawer open onClose={onClose} width={680} title={j.name} sub={`${j.id} · ${j.kind} · ${j.owner} · ${j.dcId} ${j.cluster}`}
      foot={<>
        {j.incidentId && <Btn variant="filled" icon={I.Siren} onClick={() => nav(`/incidents/${j.incidentId}`)}>Open {j.incidentId}</Btn>}
        <Btn icon={I.Users} onClick={() => nav(`/customers/${j.customerId}`)}>{V.customer}</Btn>
        <span className="grow" />
        <OpstralBtn onClick={() => { onClose(); ask(`What is ${j.incidentId ?? j.id} costing us?`); }} />
      </>}>
      <div className="gpu-drawer">
        <div className="row wrap" style={{ gap: 8 }}><StateChip s={j.state} /><span className="vw-label">{j.gpus} GPUs on {j.nodes.length} nodes · started {fmtAgo(j.started, v.now)}</span></div>
        {j.cause && <div className={`note ${j.state === 'stalled' ? 'note--bad' : 'note--warn'}`}><I.TriangleAlert size={15} /><span>{j.cause}</span></div>}
        <div className="rev-figs">
          <div className="rev-fig is-bad"><span className="vw-label">GPU time lost now</span><b className="num">{perH(j.wasteRate)}</b><small>{fmtNum(j.gpus)} GPUs × {fmtMoney(v.rate)}/h</small></div>
          <div className="rev-fig"><span className="vw-label">Lost so far</span><b className="num">{fmtMoney(j.wasteSoFar)}</b><small>{j.since ? `since ${fmtAgo(j.since, v.now)}` : '—'}</small></div>
          <div className="rev-fig"><span className="vw-label">{j.state === 'at-risk' ? 'At stake' : 'Work to redo'}</span><b className="num">{fmtMoney(j.state === 'at-risk' ? j.atStake : j.redo)}</b><small>{j.checkpointMin ? `checkpoint every ${j.checkpointMin} min` : 'no checkpoints (serving)'}</small></div>
          <div className="rev-fig"><span className="vw-label">{j.kind === 'inference' ? 'Serving' : 'Step time'}</span><b className="num">{j.kind === 'inference' ? (j.state === 'idle' ? 'idle' : 'normal') : `${(j.stepMs / 1000).toFixed(2)} s`}</b><small>{j.kind === 'inference' ? '' : `baseline ${(j.baselineMs / 1000).toFixed(2)} s · MFU ${j.mfu}%`}</small></div>
        </div>
        <div className="rev-sec">
          <div className="rev-sec-h"><b>Nodes</b><span className="vw-label">click a node for its GPUs</span></div>
          <div className="gpu-jobnodes">{j.nodes.map(id => { const n = v.nodes.find(x => x.neId === id); return n ? (
            <button key={id} type="button" className={`gpu-jobnode${id === j.causeNeId ? ' is-cause' : ''}`} onClick={() => onNode(id)}>
              <span className="gpu-node">{n.gpus.map(g => <i key={g.idx} style={{ background: j.state === 'stalled' && g.health !== 'failed' ? 'var(--vw-color-slate-300)' : cellColor(g.health, g.util, g.throttle, n.state) }} />)}</span>
              <span className="mono">{short(id)}</span>
            </button>) : null; })}</div>
        </div>
        {plan.length > 0 && (
          <div className="rev-sec">
            <div className="rev-sec-h"><b>Recovery plan</b>{j.incidentId && <span className="vw-label">tracked in {j.incidentId}; approve disruptive steps there</span>}</div>
            <ol className="gpu-plan">{plan.map(p => <li key={p}>{p}</li>)}</ol>
          </div>
        )}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------- colocation */

function Cages({ v, embedded }: { v: GpuView; embedded?: boolean }) {
  const nav = useNavigate();
  const { vocab: V } = usePersona();
  const t = v.cageTotals;
  const warn = v.cages.filter(c => c.state !== 'ok');
  const cols: Col<GpuView['cages'][number] & { id: string }>[] = [
    { key: 'cage', header: 'AI cage', sort: c => c.name, render: c => <span className="cell-2"><span className="gpu-strong">{c.dcId} · {c.name}</span><small>{c.room}</small></span> },
    { key: 'tenant', header: V.customer, wrap: true, sort: c => c.tenant, render: c => <span className="cell-2"><span>{c.tenant}</span>{c.premium && <small>{V.premium}</small>}</span> },
    { key: 'kw', header: 'Power', sort: c => c.pct, render: c => <span className="gpu-meter"><SoftMeter pct={c.pct} tone={c.pct >= 90 ? 'error' : c.pct >= 80 ? 'warning' : 'info'} /><span className="num nowrap">{c.drawKw} / {c.contractedKw} kW</span></span> },
    { key: 'cdu', header: 'Coolant loop', sort: c => c.cduId, render: c => { const cdu = v.cdus.find(x => x.id === c.cduId); return <span className="cell-2"><span className="nowrap">{cdu?.name ?? '—'}</span><small className={`nowrap${cdu && cdu.state !== 'ok' ? ' gpu-warn' : ''}`}>{cdu ? `${Math.round((cdu.flowLpm / cdu.flowNominal) * 100)}% flow · ${cdu.supplyC}°C` : ''}</small></span>; } },
    { key: 'inlet', header: 'Inlet', sort: c => c.inletC, render: c => <span className={`num${c.inletC > 27 ? ' gpu-bad' : ''}`}>{c.inletC}°C</span> },
    { key: 'rev', header: 'Power revenue', sort: c => c.revenue, render: c => <span className="num nowrap">{fmtMoney(c.revenue)}/mo</span> },
    { key: 'state', header: 'Condition', wrap: true, sort: c => (c.state === 'ok' ? 1 : 0), render: c => (c.state === 'ok' ? <span className="faint">Normal</span> : <span className="cell-2"><span className="gpu-warn">Watch</span><small>{c.note}</small></span>) }
  ];
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="note note--info"><I.Info size={15} /><span>The GPUs in these cages belong to {V.customers.toLowerCase()}, so their telemetry is theirs. You run what keeps them alive: <b>power within the contract, coolant flow and temperature, and inlet air</b> — and an AI cage draws 40–60 kW where a normal cabinet draws 6–8.</span></div>
      <StatGrid>
        <StatTile label="AI cages" value={t.cages} sub={`${t.tenants} ${V.customers.toLowerCase()}`}>
          <Split parts={[{ key: 'ok', label: 'Normal', n: t.cages - warn.length, tone: 'info' }, { key: 'w', label: 'Watch', n: warn.length, tone: 'orange' }]} />
          <Facts items={[{ n: t.liquid, label: 'liquid-cooled' }]} />
        </StatTile>
        <StatTile label="Contracted power" value={`${t.contractedKw} kW`} sub="total">
          <SoftMeter pct={Math.round((t.drawKw / Math.max(1, t.contractedKw)) * 100)} tone="info" />
          <Facts items={[{ n: `${t.drawKw} kW`, label: 'drawn now' }, { n: `${Math.round(t.contractedKw / Math.max(1, t.cages))} kW`, label: 'per cage on average' }]} />
        </StatTile>
        <StatTile label="Near the contract" value={v.cages.filter(c => c.pct >= 90).length} sub="cages ≥ 90%" subTone={v.cages.some(c => c.pct >= 90) ? 'warn' : undefined}>
          <Split parts={[{ key: 'a', label: '≥ 90%', n: v.cages.filter(c => c.pct >= 90).length, tone: 'error' }, { key: 'b', label: '80–90%', n: v.cages.filter(c => c.pct >= 80 && c.pct < 90).length, tone: 'orange' }, { key: 'c', label: 'Below 80%', n: v.cages.filter(c => c.pct < 80).length, tone: 'info' }]} />
        </StatTile>
        <StatTile label="Coolant loops" value={v.cdus.length} sub="CDUs" subTone={v.cdus.some(c => c.state !== 'ok') ? 'warn' : undefined}>
          <Split parts={[{ key: 'ok', label: 'Normal', n: v.cdus.filter(c => c.state === 'ok').length, tone: 'info' }, { key: 'w', label: 'Reduced flow', n: v.cdus.filter(c => c.state !== 'ok').length, tone: 'error' }]} />
        </StatTile>
        <StatTile label="Hottest inlet" value={`${Math.max(...v.cages.map(c => c.inletC), 0)}°C`} sub="ASHRAE 27°C" subTone={v.cages.some(c => c.inletC > 27) ? 'bad' : undefined}>
          <SoftMeter pct={Math.min(100, (Math.max(...v.cages.map(c => c.inletC), 0) / 32) * 100)} tone={v.cages.some(c => c.inletC > 27) ? 'error' : 'info'} />
          <Facts items={[{ n: v.cages.filter(c => c.inletC > 27).length, label: 'cages above 27°C', tone: v.cages.some(c => c.inletC > 27) ? 'bad' : undefined }]} />
        </StatTile>
        <StatTile label="AI power revenue" value={fmtMoney(t.revenue)} sub="a month">
          <Facts items={[{ n: fmtMoney(Math.round(t.revenue / Math.max(1, t.contractedKw))), label: 'per contracted kW' }]} />
        </StatTile>
      </StatGrid>
      {v.cdus.length > 0 && <Panel title="Liquid-cooling loops" icon={I.Droplets} sub="One CDU per AI row"><div className="gpu-cdus">{v.cdus.map(c => <CduCard key={c.id} c={c} onOpen={() => nav(`/facilities?dc=${c.dcId}&tab=cooling`)} />)}</div></Panel>}
      <section className="card">
        <DataTable rows={v.cages.map(c => ({ ...c, id: c.rackId }))} cols={cols} pageSize={20} defaultSort={{ key: 'kw', dir: 'desc' }} onRow={c => nav(`/customers/${c.tenantId}`)}
          toolbar={<ListToolbar shown={v.cages.length} total={v.cages.length} noun="AI cages" />} />
      </section>
      {!embedded && <span className="vw-label gpu-foot">AI cages are tenant cabinets on direct-to-chip liquid cooling. Power is billed per contracted kW; a cage drawing over 90% of its contract is one GPU job away from tripping its breaker.</span>}
    </div>
  );
}

export { cellColor };
