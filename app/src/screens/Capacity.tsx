import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, createCapacityPlan, defaultDcId, getCapacity, getDatacenter, getDatacenters, getLinks, useQuery } from '../api';
import type { CapacityPlan, Rack } from '../api/types';
import { usePage, PageHead, Loading } from '../shell/page';
import { SummaryStrip } from './site/SummaryStrip';
import { moneyIcon } from '../ui/Money';
import { DataTable, type Col } from '../ui/DataTable';
import { ListToolbar, useParamPatch } from '../ui/ListToolbar';
import { Btn, Chip, Kpi, Modal, Panel, Seg, Tabs, Field, Empty } from '../ui/kit';
import { DcLink, Meter, NeLink, LinkStateChip, Legend } from '../ui/status';
import { fmtDate, fmtMoney, fmtKw, fmtMonth, fmtNum, currencySymbol } from '../lib/format';
import { dateAfterMonths, monthsTo, WARN } from '../lib/forecast';
import { ForecastChart } from './plan/charts';
import { Facts, SoftMeter, Split, StatGrid, StatTile } from '../ui/Analytics';
import '../styles/plan.css';

type Cap = NonNullable<Awaited<ReturnType<typeof getCapacity>>>;
type Dim = Cap['dims'][number];
type DimName = CapacityPlan['dimension'];
type TabId = 'overview' | 'power' | 'space' | 'network' | 'compute' | 'reservations' | 'energy' | 'financial';
const TABS: { id: TabId; label: string; icon: I.LucideIcon }[] = [
  { id: 'overview', label: 'Overview & forecast', icon: I.Gauge }, { id: 'power', label: 'Power & cooling', icon: I.Zap }, { id: 'space', label: 'Space & racks', icon: I.Server },
  { id: 'network', label: 'Network & bandwidth', icon: I.Cable }, { id: 'compute', label: 'Compute & GPU', icon: I.Cpu }, { id: 'reservations', label: 'Reservations', icon: I.CalendarClock },
  { id: 'energy', label: 'PUE & energy', icon: I.Leaf }, { id: 'financial', label: 'Financial', icon: I.IndianRupee }
];
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
  usePage([{ label: 'Plan & Build' }, { label: 'Capacity', to: '/capacity' }, ...(dc ? [{ label: dc }] : [])], { dcId: dc || undefined });
  const { data: cap } = useQuery(() => getCapacity(dc || undefined), [dc]);
  const { data: dcs } = useQuery(getDatacenters, []);
  if (!cap || !dcs) return <Loading />;
  const live = dcs.filter(d => d.status !== 'planned');

  return (
    <div className="page">
      <PageHead title="Capacity" sub={`Power, cooling, space, ports and bandwidth headroom${dc ? ` for ${dc}` : ` across ${live.length} live datacenters`}, forecast against the 85% warning line, with the plans that will change it.`}
        actions={<>
          <select className="select" value={dc} onChange={e => set('dc', e.target.value)} aria-label="Datacenter"><option value="">All data centers ({live.length})</option>{live.map(d => <option key={d.id} value={d.id}>{d.id} · {d.city}</option>)}</select>
          <Btn variant="filled" icon={I.Zap} onClick={() => setPlanOpen(true)}>Raise capacity plan</Btn>
        </>} />
      <Tabs tabs={TABS.map(t => (t.id === 'financial' ? { ...t, icon: moneyIcon() } : t))} value={tab} onChange={v => set('tab', v === 'overview' ? '' : v)} />
      {tab === 'overview' && <Overview cap={cap} go={t => set('tab', t)} />}
      {tab === 'power' && <PowerTab cap={cap} />}
      {tab === 'space' && <SpaceTab cap={cap} />}
      {tab === 'network' && <NetworkTab cap={cap} />}
      {tab === 'compute' && <ComputeTab cap={cap} />}
      {tab === 'reservations' && <ReservationsTab cap={cap} />}
      {tab === 'energy' && <EnergyTab cap={cap} />}
      {tab === 'financial' && <FinancialTab cap={cap} dc={dc} onDc={id => nav(`/capacity?tab=financial&dc=${id}`)} />}
      <PlanModal open={planOpen} onClose={() => setPlanOpen(false)} dcs={live.map(d => ({ id: d.id, city: d.city }))} initialDc={dc || defaultDcId()} />
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
  return (
    <>
      <StatGrid>
        {cap.dims.map(x => {
          const res = cap.holds.filter(h => h.resource === x.name && (h.state === 'Reserved' || h.state === 'Committed')).reduce((a, h) => a + h.qty, 0);
          return (
            <StatTile key={x.name} label={x.name} value={`${x.pct}%`} sub="used" subTone={x.pct >= WARN ? 'bad' : x.pct >= 75 ? 'warn' : undefined} onClick={() => go(DIM_TAB[x.name])}
              info={`${x.name} capacity minus what is in use now, across the datacenters in scope. The bar is the share in use; the 85% line is the warning level the forecast tracks.${x.name === 'Power' || x.name === 'Space' ? ' Reserved = held by planned devices and tenant contracts.' : ''}`}>
              <SoftMeter pct={x.pct} tone={x.pct >= WARN ? 'error' : x.pct >= 75 ? 'warning' : 'info'} />
              <Facts items={[{ n: fmtNum(Math.round(x.headroom)), label: `${x.unit} free` }, ...(res ? [{ n: fmtNum(Math.round(res)), label: `${x.unit} reserved` }] : []), ...(x.pipeline ? [{ n: `+${fmtNum(x.pipeline)}`, label: `${x.unit} coming` }] : [])]} />
            </StatTile>
          );
        })}
        <StatTile label="Held & requested" value={cap.holds.filter(h => h.state === 'Reserved' || h.state === 'Committed').length} sub="holds against capacity" onClick={() => go('reservations')}
          info="Capacity already spoken for but not yet in use: planned devices holding rack units and power, tenant contracts above what they draw, GPU nodes allocated to idle jobs. Requested = capacity plans awaiting approval.">
          <Split parts={(['Reserved', 'Committed', 'Pipeline', 'Requested'] as const).map((st, i) => ({ key: st, label: st, n: cap.holds.filter(h => h.state === st).length, tone: (i === 0 ? 'info' : 'neutral') as 'info' | 'neutral' })).filter(x => x.n)} />
        </StatTile>
      </StatGrid>
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
      <SummaryStrip items={[
        { key: 'k0', label: 'Feed capacity', value: `${fmtNum(pw.cap)} kW`, sub: `${cap.perDc.length} datacenters` },
        { key: 'k1', label: 'Load (live)', value: `${fmtNum(Math.round(pw.use))} kW`, sub: `${pw.pct}% of capacity` },
        { key: 'k2', label: 'UPS load (avg)', value: `${ups.length ? Math.round(ups.reduce((a, u) => a + u.loadPct, 0) / ups.length) : 0}%`, sub: `${ups.filter(u => u.state !== 'Online').length} of ${ups.length} UPS not online` },
        { key: 'k3', label: 'Racks over 85% of budget', value: cap.racks.filter(r => r.drawKw / r.budgetKw >= 0.85).length, sub: `of ${cap.racks.length} racks`, onClick: () => setBand('85') }
      ]} />
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
  const nav = useNavigate();
  type R = Rack & { dcName: string };
  const sp = cap.dims[2], pt = cap.dims[3];
  const cols: Col<R>[] = [
    { key: 'dc', header: 'Datacenter', render: r => <DcLink id={r.dcId} tab="details" />, sort: r => r.dcId },
    { key: 'rack', header: 'Rack', render: r => <span className="cell-2"><Link className="ent-link mono" to={`/dcim/racks/${encodeURIComponent(r.id)}`}>{r.name}</Link><small>{r.role}</small></span>, sort: r => r.name },
    { key: 'loc', header: 'Floor · room', render: r => `${r.floor} · ${r.room}`, sort: r => r.floor + r.room },
    { key: 'u', header: 'U-space', render: r => <Meter pct={(r.usedU / r.heightU) * 100} width={56} label={`${r.usedU} / ${r.heightU} U`} />, sort: r => r.usedU / r.heightU },
    { key: 'free', header: 'Free U', align: 'right', render: r => <span className="num">{r.heightU - r.usedU}</span>, sort: r => r.heightU - r.usedU },
    { key: 'ports', header: 'Ports', render: r => <Meter pct={r.ports ? (r.portsUsed / r.ports) * 100 : 0} width={44} label={`${r.portsUsed} / ${r.ports}`} />, sort: r => (r.ports ? r.portsUsed / r.ports : 0) },
    { key: 'draw', header: 'Draw / budget', render: r => <Meter pct={(r.drawKw / r.budgetKw) * 100} width={44} label={`${r.drawKw} / ${r.budgetKw} kW`} />, sort: r => r.drawKw / r.budgetKw },
    { key: 't', header: 'Inlet', align: 'right', render: r => <span className={`num ${r.tempC > 30 ? 'bad' : ''}`}>{r.tempC}°C</span>, sort: r => r.tempC }
  ];
  return (
    <>
      <SummaryStrip items={[
        { key: 'r', label: 'Racks', value: fmtNum(cap.racks.length), sub: `${cap.racks.filter(r => r.usedU === 0).length} empty`, info: 'Racks in the datacenters in scope; empty racks hold no devices yet.' },
        { key: 'u', label: 'U-space used', value: `${sp.pct}%`, sub: `${fmtNum(sp.headroom)} U free`, tone: sp.pct >= WARN ? 'bad' : undefined, info: 'Rack units in use out of all rack units in scope.' },
        { key: 'p', label: 'Ports in use', value: `${pt.pct}%`, sub: `${fmtNum(pt.use)} of ${fmtNum(pt.cap)}`, info: 'Network ports in use out of all ports on the devices in scope.' },
        { key: 'f', label: 'Racks ≥ 80% full', value: cap.racks.filter(r => r.usedU / r.heightU >= 0.8).length, sub: 'candidates for the next build', info: 'Racks with 80% or more of their units used.' },
        { key: 'h', label: 'Reserved', value: `${fmtNum(cap.holds.filter(h => h.resource === 'Space' && h.state === 'Reserved').reduce((a, h) => a + h.qty, 0))} U`, sub: 'held by planned devices', info: 'Rack units held by devices planned in DCIM but not yet installed.' }
      ]} />
      <Panel title="Space and power by hall" icon={I.LayoutGrid} flush info="Each hall's rack units and rack power, used against what its racks offer. Click a hall to open its floor plan in DCIM.">
        <DataTable rows={cap.halls} pageSize={12} defaultSort={{ key: 'u', dir: 'desc' }} onRow={h => nav(`/dcim?tab=floorplan&dc=${h.dcId}&hall=${h.id}`)} cols={[
          { key: 'h', header: 'Hall', sort: h => `${h.dcId}${h.name}`, render: h => <span className="cell-2"><b>{h.name}</b><small>{h.dcId} · {h.floor} · {h.kind}</small></span> },
          { key: 'r', header: 'Racks', sort: h => h.racks, render: h => `${h.racks} in ${h.rows} row${h.rows === 1 ? '' : 's'}` },
          { key: 'u', header: 'U-space', sort: h => (h.totalU ? h.usedU / h.totalU : 0), render: h => <Meter pct={h.totalU ? (h.usedU / h.totalU) * 100 : 0} width={56} label={`${fmtNum(h.usedU)} / ${fmtNum(h.totalU)} U`} /> },
          { key: 'kw', header: 'Rack power', sort: h => (h.budgetKw ? h.drawKw / h.budgetKw : 0), render: h => <Meter pct={h.budgetKw ? (h.drawKw / h.budgetKw) * 100 : 0} width={56} label={`${fmtKw(h.drawKw)} of ${fmtKw(h.budgetKw)}`} /> },
          { key: 'c', header: 'Cooling', sort: h => h.cooling, render: h => h.cooling }]} />
      </Panel>
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
      <SummaryStrip items={[
        { key: 'k0', label: 'Backhaul & uplink capacity', value: `${fmtNum(bw.cap)} Gbps`, sub: `${bw.pct}% utilised · +${bw.growth}%/mo estate trend` },
        { key: 'k1', label: 'Links ≥ 75%', value: cap.hotLinks.length, sub: 'sorted below by time to the 85% line' },
        { key: 'k2', label: 'Crossing 85% ≤ 6 months', value: cap.hotLinks.filter(l => l.forecastMonths <= 6).length, sub: `${cap.hotLinks.filter(l => l.forecastMonths === 0).length} already above` },
        { key: 'k3', label: 'Bandwidth plans', value: cap.plans.filter(p => p.dimension === 'Bandwidth').length, sub: `${fmtNum(bw.pipeline)} Gbps approved pipeline` }
      ]} />
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
      <SummaryStrip items={[...pools.map(([l, [c, u], unit]) => ({ key: l, label: `${l} free`, value: `${fmtNum(Math.round(c - u))} ${unit}`, sub: `${Math.round((u / c) * 100)}% of ${fmtNum(c)} in use`, info: `${l} left in the hosting and platform pools of the sites in scope.` })),
        ...(cap.gpu ? [{ key: 'gpu', label: 'GPUs free', value: fmtNum(cap.gpu.free), sub: `of ${fmtNum(cap.gpu.gpus)} · ${fmtNum(cap.gpu.allocatedIdle)} allocated idle`, info: 'Accelerators on idle nodes not allocated to any job, ready to schedule.' }] : [])]} />
      {cap.gpu && <Panel title="GPU capacity" icon={I.Cpu} sub={`${fmtNum(cap.gpu.gpus)} GPUs in scope`} info="Every accelerator in the GPU nodes in scope: running a job, allocated to a job that is idle (reserved), free to schedule, or out of service (failed, drained, in burn-in). Per model below.">
        <div className="gpu-cap-bar">{([['In a job', cap.gpu.inJob, 'var(--primaryColor500)'], ['Allocated, idle', cap.gpu.allocatedIdle, 'var(--vw-color-amber-400)'], ['Free', cap.gpu.free, 'var(--vw-color-emerald-300)'], ['Out of service', cap.gpu.out, 'var(--vw-color-slate-300)']] as const).map(([l, n, c]) => n ? <i key={l} style={{ flex: n, background: c }} title={`${l}: ${fmtNum(n)}`} /> : null)}</div>
        <Legend items={([['In a job', cap.gpu.inJob, 'var(--primaryColor500)'], ['Allocated, idle', cap.gpu.allocatedIdle, 'var(--vw-color-amber-400)'], ['Free', cap.gpu.free, 'var(--vw-color-emerald-300)'], ['Out of service', cap.gpu.out, 'var(--vw-color-slate-300)']] as const).map(([l, n, c]) => ({ label: <>{l} <b className="num" style={{ fontWeight: 500 }}>{fmtNum(n)}</b></>, color: c }))} />
        <table className="nst-table dt-table" style={{ marginTop: 10 }}><thead><tr><th>Model</th><th className="is-right">GPUs</th><th className="is-right">In a job</th><th className="is-right">Free</th><th>Used</th></tr></thead>
          <tbody>{cap.gpu.byModel.map(m => <tr key={m.model}><td>{m.model}</td><td className="is-right num">{fmtNum(m.gpus)}</td><td className="is-right num">{fmtNum(m.inJob)}</td><td className="is-right num">{fmtNum(m.free)}</td><td><Meter pct={(m.inJob / m.gpus) * 100} width={60} color="var(--primaryColor500)" /></td></tr>)}</tbody></table>
        <p style={{ margin: '8px 0 0' }}><Link className="ent-link" to="/gpu">Jobs, telemetry and nodes in AI & GPU →</Link></p>
      </Panel>}
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

/* -------------------------------------------------------- reservations */

function ReservationsTab({ cap }: { cap: Cap }) {
  const [sp, setSp] = useSearchParams();
  const apply = useParamPatch();
  const q = sp.get('q') ?? '', kind = sp.get('hk') ?? '', st = sp.get('hs') ?? '';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const nav = useNavigate();
  const rows = cap.holds.filter(h => (!kind || h.kind === kind) && (!st || h.state === st) && (!q || `${h.label} ${h.dcId} ${h.ref ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  const sumOf = (res: string, states: string[]) => cap.holds.filter(h => h.resource === res && states.includes(h.state)).reduce((a, h) => a + h.qty, 0);
  const pw = cap.dims[0], spc = cap.dims[2];
  const netKw = pw.cap - pw.use - sumOf('Power', ['Reserved', 'Committed']);
  const netU = spc.cap - spc.use - sumOf('Space', ['Reserved']);
  const cnt = (k: string) => cap.holds.filter(h => h.kind === k).length;
  return (<>
    <SummaryStrip items={[
      { key: 'kw', label: 'Power net available', value: fmtKw(Math.round(netKw)), sub: `after ${fmtKw(Math.round(sumOf('Power', ['Reserved', 'Committed'])))} held`, info: 'Power capacity minus what is drawn now minus what is held: planned devices (their type\'s typical draw) and tenant contracts above what the cabinet draws.' },
      { key: 'u', label: 'Space net available', value: `${fmtNum(Math.round(netU))} U`, sub: `after ${fmtNum(sumOf('Space', ['Reserved']))} U held`, info: 'Rack units free minus the units held by planned devices.' },
      { key: 'pd', label: 'Planned devices', value: fmtNum(cap.holds.filter(h => h.kind === 'Planned device' && h.resource === 'Space').length), sub: 'holding rack units', onClick: () => set('hk', 'Planned device'), active: kind === 'Planned device', info: 'Devices planned in DCIM: they hold their rack units now and their power once installed.' },
      { key: 'tc', label: 'Tenant contracts', value: fmtNum(cnt('Tenant contract')), sub: 'sold above draw', onClick: () => set('hk', 'Tenant contract'), active: kind === 'Tenant contract', info: 'Colocation cabinets whose contracted power is above what they draw: the difference is sold and cannot be offered again.' },
      { key: 'ph', label: 'Planner holds', value: fmtNum(cnt('Planner hold')), sub: `${fmtKw(Math.round(cap.holds.filter(h => h.kind === 'Planner hold' && h.unit === 'kW').reduce((x, h) => x + h.qty, 0)))} held by approved plans`, onClick: () => set('hk', 'Planner hold'), active: kind === 'Planner hold', info: 'Capacity an approved planner plan holds at the site: written at final approval (Reserved), committed when the plan is executed, consumed at completion.' },
      { key: 'cp', label: 'Capacity plans', value: fmtNum(cnt('Capacity plan')), sub: `${cap.holds.filter(h => h.state === 'Requested').length} awaiting approval`, onClick: () => set('hk', 'Capacity plan'), active: kind === 'Capacity plan', info: 'Plans that add capacity: approved or executing ones are the pipeline, submitted ones are requested.' }
    ]} />
    <section className="vw-card-section dcl-table">
      <DataTable rows={rows} pageSize={30} defaultSort={{ key: 'q', dir: 'desc' }} onRow={h => h.to && nav(h.to)}
        toolbar={<ListToolbar shown={rows.length} total={cap.holds.length} noun="holds" onApply={apply} search={{ value: q, onChange: v => set('q', v), placeholder: 'Device, rack, tenant, plan' }}
          filters={[
            { id: 'hk', label: 'Kind', quick: true, value: kind, anyLabel: 'Any kind', onChange: v => set('hk', v), options: ['Planned device', 'Tenant contract', 'Planner hold', 'Capacity plan', 'GPU allocation'].filter(cnt).map(k => ({ id: k, label: k, count: cnt(k) })) },
            { id: 'hs', label: 'State', quick: true, value: st, anyLabel: 'Any state', onChange: v => set('hs', v), options: (['Reserved', 'Committed', 'Pipeline', 'Requested'] as const).map(x => ({ id: x, label: x, count: cap.holds.filter(h => h.state === x).length })).filter(x => x.count) }
          ]} />}
        cols={[
          { key: 'l', header: 'Held by', sort: h => h.label, wrap: true, render: h => <span className="cell-2"><b>{h.label}</b><small>{h.kind} · {h.dcId}</small></span> },
          { key: 'r', header: 'Resource', sort: h => h.resource, render: h => h.resource },
          { key: 'q', header: 'Quantity', sort: h => (h.unit === 'kW' ? h.qty : h.qty / 10), render: h => <span className="num">{h.state === 'Pipeline' || h.state === 'Requested' ? '+' : ''}{fmtNum(h.qty)} {h.unit}</span> },
          { key: 's', header: 'State', sort: h => h.state, render: h => <Chip tone={h.state === 'Reserved' ? 'info' : h.state === 'Committed' ? 'purple' : h.state === 'Pipeline' ? 'success' : 'neutral'} dot>{h.state}</Chip> }]} />
    </section>
  </>);
}

/* -------------------------------------------------------------- energy */

function EnergyTab({ cap }: { cap: Cap }) {
  const e = cap.energy;
  const it = e.sites.reduce((a, x) => a + x.itKw, 0), fac = e.sites.reduce((a, x) => a + x.facilityKw, 0);
  const pue = it ? fac / it : 0;
  const mwh = e.sites.reduce((a, x) => a + x.mwhDay, 0), t = e.sites.reduce((a, x) => a + x.tco2Day, 0);
  const best = [...e.sites].filter(x => x.pue).sort((a, b) => a.pue - b.pue)[0], worst = [...e.sites].filter(x => x.pue).sort((a, b) => b.pue - a.pue)[0];
  return (<>
    <SummaryStrip items={[
      { key: 'p', label: 'PUE (estate)', value: pue.toFixed(2), sub: 'load-weighted · industry average 1.56', tone: pue > 1.6 ? 'warn' : undefined, info: 'Facility power ÷ IT power, weighted by load across the sites in scope. Reference: the Uptime Institute 2024 global survey average of 1.56.' },
      { key: 'it', label: 'IT load', value: fmtKw(Math.round(it)), sub: `of ${fmtKw(Math.round(fac))} facility`, info: 'Power drawn by IT / network equipment, and the whole facility load including cooling, lighting and losses.' },
      { key: 'e', label: 'Energy', value: `${fmtNum(Math.round(mwh))} MWh`, sub: 'per day at today\'s load', info: 'Facility load × 24 h.' },
      { key: 'c', label: 'Carbon', value: `${fmtNum(Math.round(t))} t CO₂`, sub: `per day · ${e.kgPerKwh} kg/kWh`, info: `Facility energy × the national grid emission factor (${e.source}). Site-specific supply contracts or on-site renewables are not modelled.` },
      { key: 'b', label: 'Best / worst PUE', value: best ? `${best.pue} / ${worst.pue}` : '—', sub: best ? `${best.id} · ${worst.id}` : '', info: 'The most and least efficient sites in scope.' }
    ]} />
    <section className="vw-card-section dcl-table">
      <DataTable rows={e.sites} pageSize={30} defaultSort={{ key: 'p', dir: 'desc' }} cols={[
        { key: 'd', header: 'Datacenter', sort: x => x.id, render: x => <span className="cell-2"><DcLink id={x.id} /><small>{x.city}</small></span> },
        { key: 'p', header: 'PUE', sort: x => x.pue, render: x => <span className={`num ${x.pue > 1.6 ? 'bad' : ''}`}>{x.pue ? x.pue.toFixed(2) : '—'}</span> },
        { key: 'it', header: 'IT load', sort: x => x.itKw, render: x => <span className="num">{fmtKw(x.itKw)}</span> },
        { key: 'f', header: 'Facility load', sort: x => x.facilityKw, render: x => <Meter pct={x.facilityKw ? (x.itKw / x.facilityKw) * 100 : 0} width={56} label={fmtKw(x.facilityKw)} /> },
        { key: 'c', header: 'Cooling', sort: x => x.coolingKw, render: x => <span className="cell-2"><span className="num">{fmtKw(x.coolingKw)}</span><small>{x.liquidRacks ? `${x.liquidRacks} liquid racks` : 'air'}</small></span> },
        { key: 'm', header: 'Energy / day', sort: x => x.mwhDay, render: x => <span className="num">{fmtNum(x.mwhDay)} MWh</span> },
        { key: 't', header: 'CO₂ / day', sort: x => x.tco2Day, render: x => <span className="num">{fmtNum(x.tco2Day)} t</span> }]} />
    </section>
  </>);
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
    { key: 'ap', header: 'CapEx approved', align: 'right', render: r => <span className="num">{fmtMoney(r.approved)}</span>, sort: r => r.approved },
    { key: 'co', header: 'Committed', render: r => <Meter pct={r.approved ? (r.committed / r.approved) * 100 : 0} width={60} warnAt={95} label={fmtMoney(r.committed)} />, sort: r => r.committed / (r.approved || 1) },
    { key: 'rem', header: 'Remaining', align: 'right', render: r => <span className="num">{fmtMoney(r.approved - r.committed)}</span>, sort: r => r.approved - r.committed },
    { key: 'op', header: 'OpEx / mo', align: 'right', render: r => <span className="num">{fmtMoney(r.opex)}</span>, sort: r => r.opex },
    { key: 'opy', header: 'OpEx / yr', align: 'right', render: r => <span className="num">{fmtMoney(r.opex * 12)}</span>, sort: r => r.opex },
    { key: 'kw', header: `${currencySymbol()} / kW`, align: 'right', render: r => <span className="num">{fmtMoney(r.committed / (r.kw || 1))}</span>, sort: r => r.committed / (r.kw || 1) },
    { key: 'rk', header: `${currencySymbol()} / rack`, align: 'right', render: r => <span className="num">{r.racks ? fmtMoney(r.committed / r.racks) : '—'}</span>, sort: r => r.committed / (r.racks || 1) },
    { key: 'gb', header: `${currencySymbol()} / Gbps`, align: 'right', render: r => <span className="num">{r.gbps ? fmtMoney(r.committed / r.gbps) : '—'}</span>, sort: r => r.committed / (r.gbps || 1) }
  ];
  return (
    <>
      <SummaryStrip items={[
        { key: 'k0', label: 'CapEx approved', value: fmtMoney(tot.ap), sub: `${rows.length} datacenters` },
        { key: 'k1', label: 'CapEx committed', value: fmtMoney(tot.co), sub: `${tot.ap ? Math.round((tot.co / tot.ap) * 100) : 0}% of approved · ${fmtMoney(tot.ap - tot.co)} remaining` },
        { key: 'k2', label: 'OpEx run rate', value: `${fmtMoney(tot.op)} / mo`, sub: `${fmtMoney(tot.op * 12)} annualised` },
        { key: 'k3', label: 'Plans awaiting funds', value: fmtMoney(cap.plans.filter(p => p.status === 'Submitted').reduce((a, p) => a + p.capex, 0)), sub: `${cap.plans.filter(p => p.status === 'Submitted').length} submitted capacity plans` }
      ]} />
      {one && (
        <div className="grid g-2">
          <Panel title={`CapEx lines — ${one.dc.id}`} icon={I.BadgeCheck} flush>
            <table className="nst-table dt-table"><thead><tr><th>Line</th><th className="is-right">Approved</th><th>Committed</th></tr></thead>
              <tbody>{one.dc.capex.lines.map(l => <tr key={l.item}><td>{l.item}</td><td className="is-right num">{fmtMoney(l.approved)}</td><td><Meter pct={l.approved ? (l.committed / l.approved) * 100 : 0} width={70} warnAt={95} label={fmtMoney(l.committed)} /></td></tr>)}</tbody></table>
          </Panel>
          <Panel title={`OpEx drivers — ${one.dc.id}`} sub={`${fmtMoney(one.dc.opex.monthly)} / mo`} icon={I.Repeat} flush>
            <table className="nst-table dt-table"><thead><tr><th>Driver</th><th className="is-right">Monthly</th><th>Share</th></tr></thead>
              <tbody>{one.dc.opex.drivers.map(l => <tr key={l.item}><td>{l.item}</td><td className="is-right num">{fmtMoney(l.monthly)}</td><td><Meter pct={one.dc.opex.monthly ? (l.monthly / one.dc.opex.monthly) * 100 : 0} width={80} color="var(--primaryColor500)" /></td></tr>)}</tbody></table>
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
              <Chip tone="purple">CapEx estimate {fmtMoney(capex)}</Chip>
              <Chip tone="neutral">{fmtMoney(RATE[dim])} per {unit}</Chip>
              <Chip tone="info">growth +{d.growth}%/mo</Chip>
              {Number.isFinite(mA) && Number.isFinite(mB) && <Chip tone="success">+{Math.max(0, Math.round(mA - mB))} months of runway</Chip>}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
