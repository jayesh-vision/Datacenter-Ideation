import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, createCapacityPlan, getCapacity, getDatacenter, getDatacenters, getLinks, useQuery } from '../api';
import type { CapacityPlan, Rack } from '../api/types';
import { usePage, PageHead, Loading } from '../shell/page';
import { DataTable, type Col } from '../ui/DataTable';
import { Btn, Chip, Kpi, Modal, Panel, Seg, Tabs, Field, Empty } from '../ui/kit';
import { DcLink, Meter, NeLink, LinkStateChip, Legend } from '../ui/status';
import { fmtDate, fmtINR, fmtKw, fmtMonth, fmtNum } from '../lib/format';
import { dateAfterMonths, monthsTo, WARN } from '../lib/forecast';
import { Gauge, ForecastChart } from './plan/charts';
import '../styles/plan.css';

type Cap = NonNullable<Awaited<ReturnType<typeof getCapacity>>>;
type Dim = Cap['dims'][number];
type DimName = CapacityPlan['dimension'];
type TabId = 'overview' | 'power' | 'space' | 'network' | 'compute' | 'financial';
const TABS: { id: TabId; label: string; icon: I.LucideIcon }[] = [
  { id: 'overview', label: 'Overview & forecast', icon: I.Gauge }, { id: 'power', label: 'Power & cooling', icon: I.Zap }, { id: 'space', label: 'Space & racks', icon: I.Server },
  { id: 'network', label: 'Network & bandwidth', icon: I.Cable }, { id: 'compute', label: 'Compute & storage', icon: I.Cpu }, { id: 'financial', label: 'Financial', icon: I.IndianRupee }
];
const DIM_ICON: Record<DimName, I.LucideIcon> = { Power: I.Zap, Cooling: I.Snowflake, Space: I.Server, Ports: I.Plug, Bandwidth: I.Cable };
const DIM_TAB: Record<DimName, TabId> = { Power: 'power', Cooling: 'power', Space: 'space', Ports: 'space', Bandwidth: 'network' };
/* CapEx rate card per delivered unit (mock, derived from the plan ledger) */
export const RATE: Record<DimName, number> = { Power: 45_000, Cooling: 51_000, Space: 12_000, Ports: 29_000, Bandwidth: 42_000 };
const PLAN_STATUS: { s: CapacityPlan['status']; color: string }[] = [
  { s: 'Submitted', color: 'var(--primaryColor400)' }, { s: 'Approved', color: 'var(--vw-color-emerald-500)' }, { s: 'Executing', color: 'var(--vw-color-amber-500)' }, { s: 'Delivered', color: 'var(--vw-color-purple-500)' }
];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtU = (d: Dim, v: number) => `${fmtNum(Math.round(v))} ${d.unit}`;

/* DC-CAP-001…006, DC-FIN-001…003 */
export function Capacity() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as TabId) || 'overview';
  const dc = sp.get('dc') ?? '';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const [planOpen, setPlanOpen] = useState(false);
  usePage([{ label: 'Plan' }, { label: 'Capacity & forecast', to: '/capacity' }, ...(dc ? [{ label: dc }] : [])], { dcId: dc || undefined });
  const { data: cap } = useQuery(() => getCapacity(dc || undefined), [dc]);
  const { data: dcs } = useQuery(getDatacenters, []);
  if (!cap || !dcs) return <Loading />;
  const live = dcs.filter(d => d.status !== 'planned');

  return (
    <div className="page">
      <PageHead title="Capacity & forecast" sub={`Power, cooling, space, ports and bandwidth headroom${dc ? ` for ${dc}` : ` across ${live.length} live datacenters`}, forecast against the 85% warning line, with the plans that will change it.`}
        actions={<>
          <select className="select" value={dc} onChange={e => set('dc', e.target.value)} aria-label="Datacenter"><option value="">All data centers ({live.length})</option>{live.map(d => <option key={d.id} value={d.id}>{d.id} · {d.city}</option>)}</select>
          <Btn variant="filled" icon={I.Zap} onClick={() => setPlanOpen(true)}>Raise capacity plan</Btn>
        </>} />
      <Tabs tabs={TABS} value={tab} onChange={v => set('tab', v === 'overview' ? '' : v)} />
      {tab === 'overview' && <Overview cap={cap} go={t => set('tab', t)} />}
      {tab === 'power' && <PowerTab cap={cap} />}
      {tab === 'space' && <SpaceTab cap={cap} />}
      {tab === 'network' && <NetworkTab cap={cap} />}
      {tab === 'compute' && <ComputeTab cap={cap} />}
      {tab === 'financial' && <FinancialTab cap={cap} dc={dc} onDc={id => nav(`/capacity?tab=financial&dc=${id}`)} />}
      <PlanModal open={planOpen} onClose={() => setPlanOpen(false)} dcs={live.map(d => ({ id: d.id, city: d.city }))} initialDc={dc || 'MH-DC-001'} />
    </div>
  );
}

/* ---------------------------------------------------------- overview */

function forecastFor(d: Dim, powerHistory: number[], now: number) {
  const nowIdx = 11;
  const hist = d.name === 'Power' && d.cap
    ? powerHistory.map(v => Math.round((v / d.cap) * 1000) / 10)
    : Array.from({ length: 12 }, (_, i) => Math.round((d.pct / Math.pow(1 + d.growth / 100, 11 - i)) * 10) / 10);
  hist[nowIdx] = d.pct;
  /* approved / executing pipeline lands ~3 months out and adds capacity */
  const fc = Array.from({ length: 13 }, (_, i) => {
    const use = d.use * Math.pow(1 + d.growth / 100, i);
    const capNow = d.cap + (i >= 3 ? d.pipeline : 0);
    return Math.round((use / capNow) * 1000) / 10;
  });
  const cross = fc.findIndex(v => v >= WARN);
  const d0 = new Date(now);
  const labels = Array.from({ length: 24 }, (_, i) => { const dt = new Date(d0.getFullYear(), d0.getMonth() - 11 + i, 1); return `${MON[dt.getMonth()]}${dt.getMonth() === 0 || i === 0 ? ` ${String(dt.getFullYear()).slice(2)}` : ''}`; });
  return { labels, history: [...hist, ...Array(12).fill(null)], forecast: [...Array(11).fill(null), ...fc], nowIdx, cross };
}

function Overview({ cap, go }: { cap: Cap; go: (t: TabId) => void }) {
  const [dim, setDim] = useState<DimName>('Power');
  const now = clockNow();
  const d = cap.dims.find(x => x.name === dim)!;
  const f = forecastFor(d, cap.powerHistory, now);
  const plans = cap.plans;
  const feeding = plans.filter(p => p.dimension === dim);
  const backlog = plans.filter(p => p.status === 'Submitted');
  const pw = cap.dims[0], cool = cap.dims[1], sp = cap.dims[2], pt = cap.dims[3], bw = cap.dims[4];
  return (
    <>
      <div className="kpis kpis-5">
        <Kpi label="Power headroom" value={fmtNum(Math.round(pw.headroom))} unit="kW" icon={I.Zap} tone="info" basis={`${fmtNum(Math.round(pw.use))} of ${fmtNum(pw.cap)} kW in use`} onClick={() => go('power')} />
        <Kpi label="Cooling headroom" value={fmtNum(Math.round(cool.headroom))} unit="kW" icon={I.Snowflake} tone="cyan" basis={`${cool.pct}% of ${fmtNum(cool.cap)} kW`} onClick={() => go('power')} />
        <Kpi label="Rack space free" value={fmtNum(Math.round(sp.headroom))} unit="U" icon={I.Server} tone="purple" basis={`${cap.racks.length} racks · ${sp.pct}% used`} onClick={() => go('space')} />
        <Kpi label="Bandwidth headroom" value={fmtNum(Math.round(bw.headroom))} unit="Gbps" icon={I.Cable} tone="success" basis={`${cap.hotLinks.length} links ≥ 75% utilised`} onClick={() => go('network')} />
        <Kpi label="Reserved (backlog)" value={backlog.length} icon={I.ClipboardList} tone="warning" basis={`${plans.length} plans · ${fmtINR(backlog.reduce((a, p) => a + p.capex, 0))} awaiting approval`} />
      </div>
      <div className="gauges">
        {cap.dims.map(x => {
          const Ic = DIM_ICON[x.name];
          return (
            <button key={x.name} type="button" className="card gauge-card" onClick={() => go(DIM_TAB[x.name])}>
              <div className="gh"><span><Ic size={15} className="muted" />{x.name}</span><I.ArrowRight size={14} className="faint" /></div>
              <Gauge pct={x.pct} size={132} label={x.name === 'Ports' ? `${fmtNum(pt.cap - pt.use)} free` : undefined} />
              <small>{fmtNum(Math.round(x.use))} / {fmtU(x, x.cap)}</small>
            </button>
          );
        })}
      </div>
      <div className="grid g-2">
        <Panel title="Capacity state (reservation ledger)" sub="Submitted → Approved → Executing → Delivered. Approved & executing plans are netted into the forecast." icon={I.BookOpen}>
          <div className="ledger-bar">{PLAN_STATUS.map(x => { const n = plans.filter(p => p.status === x.s).length; return n ? <i key={x.s} style={{ flex: n, background: x.color }} title={`${x.s} ${n}`} /> : null; })}</div>
          <div style={{ marginTop: 8 }}><Legend items={PLAN_STATUS.map(x => ({ label: <>{x.s} <b className="num" style={{ fontWeight: 500 }}>{plans.filter(p => p.status === x.s).length}</b></>, color: x.color }))} /></div>
          <div style={{ marginTop: 10 }}>
            {plans.length ? plans.map(p => (
              <div key={p.id} className="plan-row">
                <div style={{ minWidth: 0 }}><b>{p.title}</b><small><span className="mono">{p.id}</span> · <DcLink id={p.dcId} /> · {p.dimension} · target {fmtDate(p.target)}</small></div>
                <div className="amt">+{fmtNum(p.amount)} {p.unit}<Chip tone={p.status === 'Submitted' ? 'info' : p.status === 'Approved' ? 'success' : p.status === 'Executing' ? 'warning' : 'purple'} size="xs">{p.status}</Chip></div>
              </div>
            )) : <Empty icon={I.Inbox} title="No capacity plans in scope" />}
          </div>
        </Panel>
        <Panel title="Headroom vs pipeline" sub="What is left today, what approved plans add, and when the 85% line is crossed at current growth" icon={I.Layers} flush>
          <table className="nst-table dt-table">
            <thead><tr><th>Dimension</th><th>Utilisation</th><th className="is-right">Headroom</th><th className="is-right">Pipeline</th><th className="is-right">85% reached</th></tr></thead>
            <tbody>{cap.dims.map(x => (
              <tr key={x.name} className="is-click" onClick={() => setDim(x.name)}>
                <td><b className="strong">{x.name}</b></td><td><Meter pct={x.pct} width={40} /></td><td className="is-right num">{fmtU(x, x.headroom)}</td>
                <td className="is-right num">{x.pipeline ? `+${fmtU(x, x.pipeline)}` : '—'}</td>
                <td className="is-right num"><span className="cell-2" style={{ alignItems: 'flex-end' }}>{x.monthsToWarn === 0 ? <span className="bad">now</span> : x.warnDate ? <span className={x.monthsToWarn <= 9 ? 'warn' : ''}>{fmtMonth(x.warnDate)}</span> : '—'}<small>at +{x.growth}%/mo</small></span></td>
              </tr>))}</tbody>
          </table>
        </Panel>
      </div>
      <Panel title="Capacity forecast" sub="12 months of history, 12 months forward. Forecast = compound growth on today's use, with approved/executing plans landing ~3 months out." icon={I.TrendingUp}>
        <div className="dim-cards">
          {cap.dims.map(x => (
            <button key={x.name} type="button" className={`dim-card${dim === x.name ? ' is-active' : ''}`} onClick={() => setDim(x.name)}>
              <span className="row between"><b>{x.name}</b><span className="dim-pct" style={{ color: x.pct >= 85 ? 'var(--vw-color-red-600)' : x.pct >= 75 ? 'var(--vw-color-amber-600)' : 'var(--vw-color-emerald-600)' }}>{x.pct}%</span></span>
              <small>{fmtU(x, x.headroom)} headroom</small>
              <span className="row wrap" style={{ gap: 4 }}>
                <Chip tone={x.monthsToWarn <= 9 ? 'warning' : 'success'} size="xs">{x.monthsToWarn === 0 ? 'above 85%' : Number.isFinite(x.monthsToWarn) ? (x.monthsToWarn <= 9 ? `85% in ${Math.max(1, Math.round(x.monthsToWarn))} mo` : 'no exhaustion < 9 mo') : 'flat'}</Chip>
                {x.pipeline > 0 && <Chip tone="purple" size="xs">+{fmtNum(x.pipeline)} {x.unit} pipeline</Chip>}
              </span>
            </button>
          ))}
        </div>
        <div className="grid g-2-1" style={{ marginTop: 14 }}>
          <div>
            <ForecastChart labels={f.labels} history={f.history} forecast={f.forecast} nowIndex={f.nowIdx} height={270} />
            <div className="row wrap" style={{ gap: 8, marginTop: 6 }}>
              <Chip tone="info" size="xs">history{d.name === 'Power' ? ' (metered)' : ' (back-computed from trend)'}</Chip><Chip tone="purple" size="xs">forecast incl. pipeline</Chip>
              <Chip tone={f.cross >= 0 ? 'warning' : 'success'} size="xs">{f.cross === 0 ? 'above 85% now' : f.cross > 0 ? `crosses 85% ${fmtMonth(dateAfterMonths(now, f.cross))}` : 'no exhaustion within forecast window'}</Chip>
            </div>
          </div>
          <div>
            <div className="kpis" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 12 }}>
              <Kpi label={`${d.name} utilisation`} value={d.pct} unit="%" basis={`${fmtU(d, d.use)} of ${fmtU(d, d.cap)}`} />
              <Kpi label="Time to 85%" value={f.cross === 0 ? 'now' : f.cross > 0 ? `${f.cross}` : '12+'} unit={f.cross > 0 || f.cross < 0 ? 'mo' : undefined} basis={`at +${d.growth}%/mo incl. pipeline`} />
            </div>
            <h4 style={{ fontSize: 13.5, margin: '0 0 4px' }}>Demand feeding {d.name} ({feeding.length})</h4>
            {feeding.length ? feeding.map(p => (
              <div key={p.id} className="plan-row"><div><b>{p.title}</b><small><DcLink id={p.dcId} /> · target {fmtDate(p.target)}</small></div><div className="amt">+{fmtNum(p.amount)} {p.unit}<Chip tone={p.status === 'Submitted' ? 'info' : 'success'} size="xs">{p.status}</Chip></div></div>
            )) : <p className="muted" style={{ fontSize: 12.5, margin: '6px 0' }}>No plan targets {d.name.toLowerCase()} in this scope. Use “Raise capacity plan” to model one.</p>}
            <p className="faint" style={{ fontSize: 11.5, marginTop: 8 }}>Committed (approved/executing): <b className="num">{fmtNum(d.pipeline)} {d.unit}</b> — netted into the forecast line.</p>
          </div>
        </div>
      </Panel>
    </>
  );
}

/* ------------------------------------------------------- power & cooling */

function PowerTab({ cap }: { cap: Cap }) {
  const [band, setBand] = useState<'85' | '70' | 'all'>('85');
  const pw = cap.dims[0], cool = cap.dims[1];
  type R = Rack & { dcName: string; pct: number };
  const racks: R[] = cap.racks.map(r => ({ ...r, pct: Math.round((r.drawKw / r.budgetKw) * 100) })).filter(r => band === 'all' || r.pct >= Number(band));
  const ups = cap.ups.map(u => ({ ...u, id: `${u.dcId}-${u.name}` }));
  const units = cap.cooling;
  const rackCols: Col<R>[] = [
    { key: 'dc', header: 'Datacenter', render: r => <DcLink id={r.dcId} tab="details" />, sort: r => r.dcId },
    { key: 'rack', header: 'Rack', render: r => <span className="mono strong">{r.name}</span>, sort: r => r.name },
    { key: 'loc', header: 'Floor · room', render: r => `${r.floor} · ${r.room}` },
    { key: 'role', header: 'Role', render: r => <Chip tone="info" size="xs">{r.role}</Chip> },
    { key: 'draw', header: 'Power (live)', render: r => <Meter pct={r.pct} width={110} label={`${r.drawKw} / ${r.budgetKw} kW`} />, sort: r => r.pct },
    { key: 'pct', header: 'Of budget', align: 'right', render: r => <span className={`num ${r.pct >= 85 ? 'bad' : ''}`}>{r.pct}%</span>, sort: r => r.pct },
    { key: 't', header: 'Inlet', align: 'right', render: r => <span className={`num ${r.tempC > 30 ? 'bad' : ''}`}>{r.tempC}°C</span>, sort: r => r.tempC }
  ];
  return (
    <>
      <div className="kpis">
        <Kpi label="Feed capacity" value={fmtNum(pw.cap)} unit="kW" icon={I.Zap} tone="info" basis={`${cap.perDc.length} datacenters`} />
        <Kpi label="Load (live)" value={fmtNum(Math.round(pw.use))} unit="kW" icon={I.Activity} tone="success" basis={`${pw.pct}% of capacity`} />
        <Kpi label="UPS load (avg)" value={ups.length ? Math.round(ups.reduce((a, u) => a + u.loadPct, 0) / ups.length) : 0} unit="%" icon={I.BatteryCharging} tone="purple" basis={`${ups.filter(u => u.state !== 'Online').length} of ${ups.length} UPS not online`} />
        <Kpi label="Racks over 85% of budget" value={cap.racks.filter(r => r.drawKw / r.budgetKw >= 0.85).length} icon={I.TriangleAlert} tone="error" basis={`of ${cap.racks.length} racks`} onClick={() => setBand('85')} />
      </div>
      <div className="grid g-2 cap-2">
        <Panel title="UPS units" count={ups.length} icon={I.BatteryCharging} flush>
          <div className="dt-scroll" style={{ maxHeight: 380 }}>
            <table className="nst-table dt-table">
              <thead><tr><th>Unit</th><th>Load</th><th>Design</th><th className="is-right">Battery</th><th>State</th></tr></thead>
              <tbody>{[...ups].sort((a, b) => (a.state === 'Online' ? 1 : 0) - (b.state === 'Online' ? 1 : 0) || b.loadPct - a.loadPct).map(u => (
                <tr key={u.id}><td><span className="cell-2"><b className="strong mono">{u.name}</b><small><DcLink id={u.dcId} /> · {fmtKw(u.capacityKw)}</small></span></td><td><Meter pct={u.loadPct} width={56} /></td>
                  <td><Chip tone="neutral" size="xs">{u.redundancy}</Chip></td><td className="is-right num">{u.batteryMin} min</td><td><Chip tone={u.state === 'Online' ? 'success' : 'error'} size="xs">{u.state}</Chip></td></tr>))}</tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Cooling" sub={`${fmtNum(Math.round(cool.use))} of ${fmtNum(cool.cap)} kW · ${fmtNum(Math.round(cool.headroom))} kW headroom`} icon={I.Snowflake} flush>
          <div className="dt-scroll" style={{ maxHeight: 380 }}>
            <table className="nst-table dt-table">
              <thead><tr><th>Unit</th><th>Zone</th><th>Load</th><th className="is-right">Supply / return</th><th>Status</th></tr></thead>
              <tbody>{[...units].sort((a, b) => (a.status === 'Operational' ? 1 : 0) - (b.status === 'Operational' ? 1 : 0)).map(u => (
                <tr key={u.id}><td><span className="cell-2"><b className="strong mono">{u.name}</b><small><DcLink id={u.dcId} /> · {u.type}</small></span></td><td className="is-wrap">{u.zone}</td><td><Meter pct={u.status === 'Failed' ? 0 : u.loadPct} width={50} /></td>
                  <td className="is-right num">{u.supplyC}° / {u.returnC}°C</td><td><Chip tone={u.status === 'Operational' ? 'success' : u.status === 'Failed' ? 'error' : 'warning'} size="xs">{u.status}</Chip></td></tr>))}</tbody>
            </table>
          </div>
        </Panel>
      </div>
      <Panel title="Racks by power budget" sub="Live draw against the rack's power budget. ≥ 85% is over the operating band." icon={I.Server} flush
        actions={<Seg size="sm" value={band} onChange={setBand} options={[{ id: '85', label: '≥ 85%' }, { id: '70', label: '≥ 70%' }, { id: 'all', label: 'All racks' }]} />}>
        <DataTable rows={racks} cols={rackCols} defaultSort={{ key: 'pct', dir: 'desc' }} pageSize={15} empty={<Empty icon={I.CheckCircle2} title="No rack in this band" />} />
      </Panel>
    </>
  );
}

/* --------------------------------------------------------------- space */

function SpaceTab({ cap }: { cap: Cap }) {
  type R = Rack & { dcName: string };
  const sp = cap.dims[2], pt = cap.dims[3];
  const cols: Col<R>[] = [
    { key: 'dc', header: 'Datacenter', render: r => <DcLink id={r.dcId} tab="details" />, sort: r => r.dcId },
    { key: 'rack', header: 'Rack', render: r => <span className="cell-2"><b className="mono strong">{r.name}</b><small>{r.role}</small></span>, sort: r => r.name },
    { key: 'loc', header: 'Floor · room', render: r => `${r.floor} · ${r.room}`, sort: r => r.floor + r.room },
    { key: 'u', header: 'U-space', render: r => <Meter pct={(r.usedU / r.heightU) * 100} width={56} label={`${r.usedU} / ${r.heightU} U`} />, sort: r => r.usedU / r.heightU },
    { key: 'free', header: 'Free U', align: 'right', render: r => <span className="num">{r.heightU - r.usedU}</span>, sort: r => r.heightU - r.usedU },
    { key: 'ports', header: 'Ports', render: r => <Meter pct={r.ports ? (r.portsUsed / r.ports) * 100 : 0} width={44} label={`${r.portsUsed} / ${r.ports}`} />, sort: r => (r.ports ? r.portsUsed / r.ports : 0) },
    { key: 'draw', header: 'Draw / budget', render: r => <Meter pct={(r.drawKw / r.budgetKw) * 100} width={44} label={`${r.drawKw} / ${r.budgetKw} kW`} />, sort: r => r.drawKw / r.budgetKw },
    { key: 't', header: 'Inlet', align: 'right', render: r => <span className={`num ${r.tempC > 30 ? 'bad' : ''}`}>{r.tempC}°C</span>, sort: r => r.tempC }
  ];
  return (
    <>
      <div className="kpis">
        <Kpi label="Racks" value={fmtNum(cap.racks.length)} icon={I.Server} tone="info" basis={`${cap.racks.filter(r => r.usedU === 0).length} empty / reserved`} />
        <Kpi label="U-space used" value={sp.pct} unit="%" icon={I.Rows3} tone="purple" basis={`${fmtNum(sp.use)} of ${fmtNum(sp.cap)} U · ${fmtNum(sp.headroom)} U free`} />
        <Kpi label="Ports in use" value={pt.pct} unit="%" icon={I.Plug} tone="cyan" basis={`${fmtNum(pt.use)} of ${fmtNum(pt.cap)} ports`} />
        <Kpi label="Racks ≥ 80% full" value={cap.racks.filter(r => r.usedU / r.heightU >= 0.8).length} icon={I.TriangleAlert} tone="warning" basis="candidates for the next build" />
      </div>
      <section className="card"><DataTable rows={cap.racks} cols={cols} defaultSort={{ key: 'u', dir: 'desc' }} pageSize={25} /></section>
    </>
  );
}

/* ------------------------------------------------------------- network */

function NetworkTab({ cap }: { cap: Cap }) {
  const nav = useNavigate();
  type L = Cap['hotLinks'][number];
  const bw = cap.dims[4];
  const cols: Col<L>[] = [
    { key: 'a', header: 'Link (A end)', render: l => <span className="cell-2"><Link className="ent-link mono" to={`/ne/${l.aNe}?tab=links&if=${encodeURIComponent(l.aIf)}`}>{l.aNe} {l.aIf}</Link><small>→ <NeLink id={l.zNe} /> {l.zIf}</small></span>, sort: l => l.aNe },
    { key: 'role', header: 'Role', render: l => <Chip tone={l.role === 'Backhaul' ? 'orange' : 'info'} size="xs">{l.role}</Chip>, sort: l => l.role },
    { key: 'st', header: 'State', render: l => <LinkStateChip s={l.state} /> },
    { key: 'cap', header: 'Capacity', align: 'right', render: l => <span className="num">{l.capacityMbps / 1000} Gbps</span>, sort: l => l.capacityMbps },
    { key: 'u', header: 'Utilisation', render: l => <Meter pct={l.utilPct} width={70} />, sort: l => l.utilPct },
    { key: 'g', header: 'Growth', align: 'right', render: l => <span className="num">+{l.growthPct}%/mo</span>, sort: l => l.growthPct },
    { key: 'f', header: '85% warning', align: 'right', render: l => <span className={`num ${l.forecastMonths <= 3 ? 'bad' : l.forecastMonths <= 6 ? 'warn' : ''}`}>{l.forecastMonths === 0 ? 'crossed' : l.forecastDate ? fmtMonth(l.forecastDate) : '—'}</span>, sort: l => l.forecastMonths - l.utilPct / 1000 },
    { key: 'c', header: '95% critical', align: 'right', render: l => <span className="num">{l.critMonths === 0 ? 'crossed' : Number.isFinite(l.critMonths) ? `~${Math.max(1, Math.round(l.critMonths))} mo` : '—'}</span>, sort: l => l.critMonths }
  ];
  return (
    <>
      <div className="kpis">
        <Kpi label="Backhaul & uplink capacity" value={fmtNum(bw.cap)} unit="Gbps" icon={I.Cable} tone="info" basis={`${bw.pct}% utilised · +${bw.growth}%/mo estate trend`} />
        <Kpi label="Links ≥ 75%" value={cap.hotLinks.length} icon={I.Activity} tone="warning" basis="sorted below by time to the 85% line" />
        <Kpi label="Crossing 85% ≤ 6 months" value={cap.hotLinks.filter(l => l.forecastMonths <= 6).length} icon={I.TriangleAlert} tone="error" basis={`${cap.hotLinks.filter(l => l.forecastMonths === 0).length} already above`} />
        <Kpi label="Bandwidth plans" value={cap.plans.filter(p => p.dimension === 'Bandwidth').length} icon={I.ClipboardList} tone="purple" basis={`${fmtNum(bw.pipeline)} Gbps approved pipeline`} />
      </div>
      <Panel title="Links in countdown" sub="Compound growth of the last six monthly peaks; open a link for its forecast chart on the network element." icon={I.TrendingUp} flush>
        <DataTable rows={cap.hotLinks} cols={cols} defaultSort={{ key: 'f', dir: 'asc' }} pageSize={20} onRow={l => nav(`/ne/${l.aNe}?tab=links&if=${encodeURIComponent(l.aIf)}`)} empty={<Empty icon={I.CheckCircle2} title="No link above 75% in scope" />} />
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------- compute */

function ComputeTab({ cap }: { cap: Cap }) {
  const pools: [string, number[], string, I.LucideIcon][] = [['CPU cores', cap.compute.cpu, 'cores', I.Cpu], ['Memory', cap.compute.mem, 'GB', I.MemoryStick], ['Storage', cap.compute.sto, 'TB', I.HardDrive]];
  return (
    <>
      <div className="kpis kpis-3">
        {pools.map(([l, [c, u], unit, Ic]) => <Kpi key={l} label={`${l} free`} value={fmtNum(Math.round(c - u))} unit={unit} icon={Ic} tone="info" basis={`${Math.round((u / c) * 100)}% of ${fmtNum(c)} ${unit} in use`} />)}
      </div>
      <Panel title="Estate compute pools" sub="Hosting and platform pools attached to the datacenters in scope" icon={I.Database}>
        {pools.map(([l, [c, u], unit]) => (
          <div key={l} className="pool">
            <div className="row between"><b>{l}</b><span className="num muted" style={{ fontSize: 12.5 }}>{fmtNum(Math.round(u))} / {fmtNum(c)} {unit}</span></div>
            <div className="row" style={{ gap: 10 }}><span className="bar" style={{ flex: 1, height: 10 }}><i style={{ width: `${(u / c) * 100}%`, background: 'var(--primaryColor500)' }} /></span><span className="num" style={{ width: 40, textAlign: 'right' }}>{Math.round((u / c) * 100)}%</span></div>
          </div>
        ))}
        <p className="faint" style={{ fontSize: 11.5, margin: '6px 0 0' }}>Compute and storage telemetry is a placeholder roll-up in this prototype (blueprint DC-CAP-001); pool-level drill-down arrives with the compute integration.</p>
      </Panel>
    </>
  );
}

/* ----------------------------------------------------------- financial */

function FinancialTab({ cap, dc, onDc }: { cap: Cap; dc: string; onDc: (id: string) => void }) {
  const { data: links } = useQuery(() => getLinks({ protocol: 'LLDP' }), []);
  const { data: one } = useQuery(() => (dc ? getDatacenter(dc) : Promise.resolve(null)), [dc]);
  const bwByDc = useMemo(() => {
    const m = new Map<string, number>();
    (links ?? []).filter(l => l.role === 'Backhaul' || l.role === 'Uplink').forEach(l => { const a = l.aNe.split('-').slice(0, 3).join('-'), z = l.zNe.split('-').slice(0, 3).join('-'); [a, z].forEach(d => m.set(d, (m.get(d) ?? 0) + l.capacityMbps / 1000 / (a === z ? 2 : 1))); });
    return m;
  }, [links]);
  type R = { id: string; approved: number; committed: number; opex: number; kw: number; racks: number; gbps: number };
  const rows: R[] = cap.perDc.map(p => ({ id: p.id, approved: p.s.capexApproved, committed: p.s.capexCommitted, opex: p.s.opexMonthly, kw: p.s.powerCapKw, racks: cap.racks.filter(r => r.dcId === p.id).length, gbps: Math.round(bwByDc.get(p.id) ?? 0) }));
  const tot = rows.reduce((a, r) => ({ ap: a.ap + r.approved, co: a.co + r.committed, op: a.op + r.opex }), { ap: 0, co: 0, op: 0 });
  const cols: Col<R>[] = [
    { key: 'id', header: 'Datacenter', render: r => <DcLink id={r.id} tab="capex" />, sort: r => r.id },
    { key: 'ap', header: 'CapEx approved', align: 'right', render: r => <span className="num">{fmtINR(r.approved)}</span>, sort: r => r.approved },
    { key: 'co', header: 'Committed', render: r => <Meter pct={r.approved ? (r.committed / r.approved) * 100 : 0} width={60} warnAt={95} label={fmtINR(r.committed)} />, sort: r => r.committed / (r.approved || 1) },
    { key: 'rem', header: 'Remaining', align: 'right', render: r => <span className="num">{fmtINR(r.approved - r.committed)}</span>, sort: r => r.approved - r.committed },
    { key: 'op', header: 'OpEx / mo', align: 'right', render: r => <span className="num">{fmtINR(r.opex)}</span>, sort: r => r.opex },
    { key: 'opy', header: 'OpEx / yr', align: 'right', render: r => <span className="num">{fmtINR(r.opex * 12)}</span>, sort: r => r.opex },
    { key: 'kw', header: '₹ / kW', align: 'right', render: r => <span className="num">{fmtINR(r.committed / (r.kw || 1))}</span>, sort: r => r.committed / (r.kw || 1) },
    { key: 'rk', header: '₹ / rack', align: 'right', render: r => <span className="num">{r.racks ? fmtINR(r.committed / r.racks) : '—'}</span>, sort: r => r.committed / (r.racks || 1) },
    { key: 'gb', header: '₹ / Gbps', align: 'right', render: r => <span className="num">{r.gbps ? fmtINR(r.committed / r.gbps) : '—'}</span>, sort: r => r.committed / (r.gbps || 1) }
  ];
  return (
    <>
      <div className="kpis">
        <Kpi label="CapEx approved" value={fmtINR(tot.ap)} icon={I.BadgeCheck} tone="info" basis={`${rows.length} datacenters`} />
        <Kpi label="CapEx committed" value={fmtINR(tot.co)} icon={I.FileSignature} tone="purple" basis={`${tot.ap ? Math.round((tot.co / tot.ap) * 100) : 0}% of approved · ${fmtINR(tot.ap - tot.co)} remaining`} />
        <Kpi label="OpEx run rate" value={fmtINR(tot.op)} unit="/ mo" icon={I.Repeat} tone="warning" basis={`${fmtINR(tot.op * 12)} annualised`} />
        <Kpi label="Plans awaiting funds" value={fmtINR(cap.plans.filter(p => p.status === 'Submitted').reduce((a, p) => a + p.capex, 0))} icon={I.ClipboardList} tone="neutral" basis={`${cap.plans.filter(p => p.status === 'Submitted').length} submitted capacity plans`} />
      </div>
      {one && (
        <div className="grid g-2">
          <Panel title={`CapEx lines — ${one.dc.id}`} icon={I.BadgeCheck} flush>
            <table className="nst-table dt-table"><thead><tr><th>Line</th><th className="is-right">Approved</th><th>Committed</th></tr></thead>
              <tbody>{one.dc.capex.lines.map(l => <tr key={l.item}><td>{l.item}</td><td className="is-right num">{fmtINR(l.approved)}</td><td><Meter pct={l.approved ? (l.committed / l.approved) * 100 : 0} width={70} warnAt={95} label={fmtINR(l.committed)} /></td></tr>)}</tbody></table>
          </Panel>
          <Panel title={`OpEx drivers — ${one.dc.id}`} sub={`${fmtINR(one.dc.opex.monthly)} / mo`} icon={I.Repeat} flush>
            <table className="nst-table dt-table"><thead><tr><th>Driver</th><th className="is-right">Monthly</th><th>Share</th></tr></thead>
              <tbody>{one.dc.opex.drivers.map(l => <tr key={l.item}><td>{l.item}</td><td className="is-right num">{fmtINR(l.monthly)}</td><td><Meter pct={one.dc.opex.monthly ? (l.monthly / one.dc.opex.monthly) * 100 : 0} width={80} color="var(--primaryColor500)" /></td></tr>)}</tbody></table>
          </Panel>
        </div>
      )}
      <Panel title="CapEx, OpEx and cost to capacity by datacenter" sub="Committed CapEx per delivered kW of feed capacity, per rack and per Gbps of backhaul/uplink. Select a row for its lines and drivers." icon={I.IndianRupee} flush>
        <DataTable rows={rows} cols={cols} defaultSort={{ key: 'ap', dir: 'desc' }} pageSize={30} onRow={r => onDc(r.id)} rowClass={r => (r.id === dc ? 'is-selected' : '')} />
      </Panel>
    </>
  );
}

/* --------------------------------------------- raise plan with what-if */

function PlanModal({ open, onClose, dcs, initialDc }: { open: boolean; onClose: () => void; dcs: { id: string; city: string }[]; initialDc: string }) {
  const nav = useNavigate();
  const [dcId, setDc] = useState(initialDc);
  const [dim, setDim] = useState<DimName>('Power');
  const [amount, setAmount] = useState(200);
  const [months, setMonths] = useState(3);
  const [title, setTitle] = useState('');
  const { data: c } = useQuery(() => getCapacity(dcId), [dcId]);
  if (!open) return null;
  const d = c?.dims.find(x => x.name === dim);
  const unit = d?.unit ?? '';
  const before = d?.pct ?? 0;
  const after = d ? Math.round((d.use / (d.cap + amount)) * 100) : 0;
  const mB = d ? monthsTo(before, d.growth, WARN) : 0, mA = d ? monthsTo(after, d.growth, WARN) : 0;
  const capex = amount * RATE[dim];
  const now = clockNow();
  const target = now + months * 30.4 * 86_400_000;
  const def = `Add ${fmtNum(amount)} ${unit} ${dim.toLowerCase()} capacity at ${dcId}`;
  const exh = (m: number) => (m === 0 ? 'already above 85%' : Number.isFinite(m) ? `85% ≈ ${fmtMonth(dateAfterMonths(now, m))}` : 'no exhaustion');
  const submit = () => { createCapacityPlan({ dcId, dimension: dim, title: title.trim() || def, amount, unit, target, capex }).then(() => { onClose(); setTitle(''); nav(`/capacity?dc=${dcId}`); }); };
  return (
    <Modal open={open} onClose={onClose} width={620} title="Raise capacity plan" sub="Model the expansion first: before/after utilisation, new exhaustion date and CapEx estimate (DC-CAP-005)."
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.Send} onClick={submit} disabled={!d || amount <= 0}>Submit plan</Btn></>}>
      <div className="col" style={{ gap: 14 }}>
        <div className="whatif">
          <Field label="Datacenter"><select className="select" value={dcId} onChange={e => setDc(e.target.value)}>{dcs.map(x => <option key={x.id} value={x.id}>{x.id} · {x.city}</option>)}</select></Field>
          <Field label="Dimension"><select className="select" value={dim} onChange={e => setDim(e.target.value as DimName)}>{(['Power', 'Cooling', 'Space', 'Ports', 'Bandwidth'] as DimName[]).map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label={`Capacity to add (${unit || '…'})`}><input className="input" type="number" min={1} value={amount} onChange={e => setAmount(Math.max(0, Number(e.target.value)))} /></Field>
          <Field label="Target" hint={fmtDate(target)}><select className="select" value={months} onChange={e => setMonths(Number(e.target.value))}>{[1, 2, 3, 6, 9, 12].map(m => <option key={m} value={m}>in {m} month{m > 1 ? 's' : ''}</option>)}</select></Field>
          <Field label="Title" style={{ gridColumn: '1 / -1' }}><input className="input" value={title} placeholder={def} onChange={e => setTitle(e.target.value)} /></Field>
        </div>
        {!d ? <div className="loading"><span className="spinner" />Loading capacity…</div> : (
          <>
            <div className="ba">
              <div><span className="k">Today</span><span className="v" style={{ color: before >= 85 ? 'var(--vw-color-red-600)' : undefined }}>{before}%</span><small>{fmtU(d, d.use)} of {fmtU(d, d.cap)}</small><small>{exh(mB)}</small></div>
              <I.ArrowRight size={20} className="faint" />
              <div><span className="k">After plan</span><span className="v" style={{ color: 'var(--vw-color-emerald-600)' }}>{after}%</span><small>{fmtU(d, d.use)} of {fmtU(d, d.cap + amount)}</small><small>{exh(mA)}</small></div>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <Chip tone="purple">CapEx estimate {fmtINR(capex)}</Chip>
              <Chip tone="neutral">{fmtINR(RATE[dim])} per {unit}</Chip>
              <Chip tone="info">growth +{d.growth}%/mo</Chip>
              {Number.isFinite(mA) && Number.isFinite(mB) && <Chip tone="success">+{Math.max(0, Math.round(mA - mB))} months of runway</Chip>}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
