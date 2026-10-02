import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, getAlerts, getChanges, getDatacenter, getDatacenters, useQuery } from '../api';
import type { Datacenter, Rack } from '../api/types';
import { usePage, PageHead, Loading, useSentinel } from '../shell/page';
import { Btn, Chip, Panel, Tabs, Empty } from '../ui/kit';
import { ChangeChip, DcLink, IncLink, Meter, RolloutChip, SeverityChip, Fresh } from '../ui/status';
import { fmtAgo, fmtDate, fmtDateTime, fmtKw, fmtNum } from '../lib/format';
import { OpsKpi } from './ops/shared';
import { NotFound } from './NotFound';
import '../styles/plan.css';

type TabId = 'power' | 'cooling' | 'environment' | 'maintenance';
const TEMP = { lo: 18, hi: 27 }, HUM = { lo: 40, hi: 60 };
const BAD = 'var(--vw-color-red-500)', WARN = 'var(--vw-color-amber-500)', ACCENT = 'var(--primaryColor500)';
const loadColor = (p: number) => (p >= 85 ? BAD : p >= 75 ? WARN : ACCENT);
const ic = (Icon: I.LucideIcon) => <Icon size={15} />;

/* DC-FAC-001…007, DC-SITE-002…005, DC-RES-001…003 */
export function Facilities() {
  const [sp, setSp] = useSearchParams();
  const ask = useSentinel();
  const dcId = sp.get('dc') || 'MH-DC-001';
  const tab = (sp.get('tab') as TabId) || 'power';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const { data: dcs } = useQuery(getDatacenters, []);
  const { data, loading } = useQuery(() => getDatacenter(dcId), [dcId]);
  const { data: alerts } = useQuery(() => getAlerts({ dcId, state: 'open' }), [dcId]);
  const { data: changes } = useQuery(() => getChanges({ dcId }), [dcId]);
  usePage([{ label: 'Infrastructure' }, { label: 'Facilities', to: '/facilities' }, { label: dcId }], { dcId });
  if (loading && !data) return <Loading />;
  if (!data || !dcs) return <NotFound what="Datacenter" />;
  const dc = data.dc;
  const fac = (alerts ?? []).filter(a => a.source === 'Power' || a.source === 'Cooling' || a.source === 'Environment');
  const maint = (changes ?? []).filter(c => c.kind === 'Maintenance');
  const upsDown = dc.power.ups.filter(u => u.state !== 'Online');
  const coolDown = dc.cooling.units.filter(u => u.status !== 'Operational');
  const hotZones = dc.cooling.sensors.filter(s => s.tempC > TEMP.hi);
  const totalKw = dc.power.split.reduce((a, s) => a + s.kw, 0);
  const pwrPct = Math.round((totalKw / dc.power.capacityKw) * 100);
  const live = dcs.filter(d => d.status !== 'planned');

  return (
    <div className="page">
      <PageHead title="Facilities" chips={<RolloutChip s={dc.status} />}
        sub={<>Power chain, backup readiness, cooling and environment for <DcLink id={dc.id} /> · {dc.address}, {dc.city} · {dc.tier}</>}
        actions={<>
          <select className="select" value={dcId} onChange={e => set('dc', e.target.value)} aria-label="Datacenter">{live.map(d => <option key={d.id} value={d.id}>{d.id} · {d.city}</option>)}</select>
          <Btn icon={I.Sparkles} onClick={() => ask(`What is at risk in ${dc.id}?`)}>Ask Opstral AI</Btn>
        </>} />
      <div className="kpis kpis-5">
        <OpsKpi label="Power in use" value={fmtNum(Math.round(totalKw * 10) / 10)} unit="kW" icon={ic(I.Zap)} tone={pwrPct >= 85 ? 'warn' : undefined} sub={`${pwrPct}% of ${fmtNum(dc.power.capacityKw)} kW capacity`} onClick={() => set('tab', '')} />
        <OpsKpi label="PUE" value={dc.power.pue.toFixed(2)} icon={ic(I.Gauge)} sub={`IT ${fmtKw(dc.power.split[0].kw)} · cooling ${fmtKw(dc.power.split[1].kw)}`} />
        <OpsKpi label="UPS online" value={`${dc.power.ups.length - upsDown.length}/${dc.power.ups.length}`} icon={ic(I.BatteryCharging)} tone={upsDown.length ? 'bad' : undefined} sub={upsDown.length ? upsDown.map(u => `${u.name} ${u.state.toLowerCase()}`).join(', ') : `${dc.power.ups[0]?.redundancy ?? 'N'} redundancy intact`} onClick={() => set('tab', '')} />
        <OpsKpi label="Cooling units" value={`${dc.cooling.units.length - coolDown.length}/${dc.cooling.units.length}`} icon={ic(I.Fan)} tone={coolDown.some(u => u.status === 'Failed') ? 'bad' : coolDown.length ? 'warn' : undefined} sub={coolDown.length ? `${coolDown[0].name} ${coolDown[0].status.toLowerCase()}${coolDown.length > 1 ? ` +${coolDown.length - 1} more` : ''}` : `all running · ${dc.cooling.redundancy}`} onClick={() => set('tab', 'cooling')} />
        <OpsKpi label="Facility alarms" value={fac.length} icon={ic(I.BellRing)} tone={fac.some(a => a.severity === 'critical') ? 'bad' : fac.length ? 'warn' : undefined} sub={hotZones.length ? `${hotZones.length} zone${hotZones.length > 1 ? 's' : ''} above ${TEMP.hi}°C` : fac.length ? `${fac.filter(a => a.severity === 'critical').length} critical` : 'none active'} onClick={() => set('tab', 'maintenance')} />
      </div>
      <Tabs value={tab} onChange={v => set('tab', v === 'power' ? '' : v)} tabs={[
        { id: 'power', label: 'Power chain & backup', icon: I.Zap }, { id: 'cooling', label: 'Cooling', icon: I.Snowflake, count: coolDown.length || undefined },
        { id: 'environment', label: 'Environment', icon: I.Thermometer, count: hotZones.length || undefined }, { id: 'maintenance', label: 'Maintenance & alarms', icon: I.Wrench, count: fac.length + maint.filter(m => m.status !== 'Completed').length || undefined }
      ]} />
      {tab === 'power' && <PowerChain dc={dc} />}
      {tab === 'cooling' && <Cooling dc={dc} />}
      {tab === 'environment' && <Environment dc={dc} />}
      {tab === 'maintenance' && <Maintenance alerts={fac} changes={maint} />}
    </div>
  );
}

/* ---------------------------------------------------------------- power */

type NodeState = 'ok' | 'alarm' | 'warn' | 'standby';
function ChainNode({ name, state, chip, metric, sub }: { name: string; state: NodeState; chip: string; metric: string; sub?: string }) {
  return (
    <div className={`vw-card-child chain-node is-${state}`}>
      <div className="chain-node-h"><b>{name}</b><Chip tone={state === 'alarm' ? 'error' : state === 'warn' ? 'warning' : state === 'standby' ? 'neutral' : 'success'} size="xs">{chip}</Chip></div>
      <span className="chain-node-m">{metric}</span>
      {sub && <span className="chain-node-s">{sub}</span>}
    </div>
  );
}

function PowerChain({ dc }: { dc: Datacenter }) {
  const now = clockNow();
  const nav = useNavigate();
  const p = dc.power;
  const acFeeds = p.feeds.filter(f => f.type === 'AC'), dcFeeds = p.feeds.filter(f => f.type === 'DC');
  const feedAlarm = acFeeds.some(f => f.status === 'Alarm');
  const upsOnline = p.ups.filter(u => u.state === 'Online').length;
  const upsNeeded = p.ups.length - (p.ups[0]?.redundancy === 'N+1' ? 1 : p.ups[0]?.redundancy === '2N' ? p.ups.length / 2 : 0);
  const itKw = dc.racks.reduce((a, r) => a + r.drawKw, 0);
  const spof: string[] = [];
  if (acFeeds.length < 2) spof.push('Single utility feed — DG is the only alternative source.');
  if (dcFeeds.length < 2) spof.push('Single rectifier plant feeds the −48 V DC loads.');
  if (upsOnline < upsNeeded + (p.ups[0]?.redundancy === 'N+1' ? 1 : 0)) spof.push(`UPS redundancy lost: ${upsOnline} of ${p.ups.length} online against ${p.ups[0]?.redundancy} design.`);
  const battOverdue = now - p.battery.lastTest > 90 * 86_400_000;
  const dgAgeD = Math.round((now - p.dg.lastTest) / 86_400_000);

  const cols: { h: string; icon: I.LucideIcon; nodes: React.ReactNode[] }[] = [
    { h: 'Sources', icon: I.UtilityPole, nodes: [
      ...acFeeds.map(f => <ChainNode key={f.id} name={f.id} state={f.status === 'Alarm' ? 'alarm' : f.loadKw === 0 ? 'standby' : 'ok'} chip={f.status === 'Alarm' ? 'Lost' : f.loadKw === 0 ? 'Standby' : 'Normal'} metric={`${fmtKw(f.loadKw)} / ${fmtKw(f.capacityKw)}`} sub={`${f.source} · ${f.rating}`} />),
      <ChainNode key="dg" name="DG set" state={feedAlarm ? 'warn' : 'standby'} chip={feedAlarm ? 'Start pending' : 'Standby'} metric={`${fmtNum(p.dg.kva)} kVA · fuel ${p.dg.fuelPct}%`} sub={`${p.dg.runtimeH} h at 60% load`} />
    ] },
    { h: 'Transfer, LT & battery', icon: I.ToggleRight, nodes: [
      <ChainNode key="ats" name="ATS-1" state={feedAlarm ? 'warn' : 'ok'} chip={feedAlarm ? 'Position B' : 'Utility'} metric="415 V 3-phase" sub="automatic transfer" />,
      <ChainNode key="lt" name="LT panel" state="ok" chip="Normal" metric={`AC ${fmtKw(p.acKw)} · DC ${fmtKw(p.dcKw)}`} sub="main low-tension distribution" />,
      <ChainNode key="batt" name="Battery bank" state={battOverdue ? 'warn' : 'ok'} chip={battOverdue ? 'Test overdue' : 'Tested'} metric={`${p.battery.volts} V · ${fmtNum(p.battery.ah)} Ah`} sub={`${p.battery.runtimeH} h autonomy · feeds DC plant`} />
    ] },
    { h: 'UPS & DC plant', icon: I.BatteryCharging, nodes: [
      ...p.ups.map(u => <ChainNode key={u.id} name={u.name} state={u.state === 'Online' ? 'ok' : 'alarm'} chip={u.state} metric={`${u.loadPct}% of ${fmtKw(u.capacityKw)}`} sub={`${u.redundancy} · battery ${u.batteryMin} min`} />),
      ...dcFeeds.map(f => <ChainNode key={f.id} name={f.source} state={f.status === 'Alarm' ? 'alarm' : 'ok'} chip={f.status} metric={fmtKw(f.loadKw)} sub={f.rating} />)
    ] },
    { h: 'Distribution & loads', icon: I.Server, nodes: [
      <ChainNode key="pdu" name="Rack PDUs (A/B)" state="ok" chip="Normal" metric={`${fmtKw(itKw)} IT load`} sub={`${dc.racks.length} racks`} />,
      <ChainNode key="bdfb" name="DC distribution" state="ok" chip="Normal" metric={fmtKw(p.dcKw)} sub="−48 V BDFB" />,
      ...p.split.slice(1).map(s => <ChainNode key={s.label} name={s.label} state="ok" chip="Normal" metric={fmtKw(s.kw)} sub={`${Math.round((s.kw / (p.split.reduce((a, x) => a + x.kw, 0) || 1)) * 100)}% of site load`} />)
    ] }
  ];

  const racks = [...dc.racks].filter(r => r.drawKw > 0);

  return (
    <>
      <Panel title="Power chain" sub="Utility → transfer switch → UPS / rectifier → distribution → loads. Accent = alarm or degraded, dashed = standby." icon={I.Workflow} actions={<Fresh>BMS · updated 2 min ago</Fresh>}>
        <div className="chain">
          {cols.map((c, i) => (
            <div key={c.h} className="chain-col">
              {i > 0 && <span className="chain-link" aria-hidden><I.ChevronRight size={16} /></span>}
              <div className="chain-h"><c.icon size={13} />{c.h}</div>
              <div className="chain-nodes">{c.nodes}</div>
            </div>
          ))}
        </div>
      </Panel>
      <div className="grid g-2-1 fac-eq">
        <Panel title="Rack power" count={racks.length} sub="Live draw against budget per rack" icon={I.Server} flush>
          {racks.length ? <RackTable racks={racks} onRow={() => nav(`/datacenters/${dc.id}?tab=details`)} /> : <div className="panel-body"><Empty icon={I.Server} title="No racks energised yet" /></div>}
        </Panel>
        <Panel title="Resilience & backup readiness" sub="Redundancy design, single points of failure and what carries the load if a feed drops" icon={I.ShieldCheck}>
          <div className="res">
            <div className="res-h">Redundancy design</div>
            <Row k="UPS" v={`${p.ups[0]?.redundancy} · ${upsOnline}/${p.ups.length} online`} bad={upsOnline < p.ups.length} />
            <Row k="Cooling" v={`${dc.cooling.redundancy} · ${dc.cooling.units.filter(u => u.status === 'Operational').length}/${dc.cooling.units.length} running`} bad={dc.cooling.units.some(u => u.status === 'Failed')} />
            <Row k="Utility feeds" v={`${acFeeds.length} × ${acFeeds[0]?.rating ?? ''}`} bad={feedAlarm} />
            <div className="res-h">Single points of failure</div>
            {spof.length ? spof.map(s => <div key={s} className="note note--warn"><I.TriangleAlert size={14} />{s}</div>) : <div className="note note--good"><I.CheckCircle2 size={14} />No single point of failure in the power chain.</div>}
            <div className="res-h">If a feed drops</div>
            <Row k="DG set" v={`${fmtNum(p.dg.kva)} kVA · ${p.dg.runtimeH} h · fuel ${p.dg.fuelPct}%`} chip={<Chip tone={p.dg.result === 'Pass' ? 'success' : 'error'} size="xs">Test {p.dg.result} · {dgAgeD} d ago</Chip>} />
            <Row k="Battery bank" v={`${p.battery.volts} V · ${fmtNum(p.battery.ah)} Ah · ${p.battery.runtimeH} h`} chip={<Chip tone={battOverdue ? 'warning' : 'success'} size="xs">{battOverdue ? 'Test overdue' : `Tested ${fmtDate(p.battery.lastTest)}`}</Chip>} />
            {p.ups.map(u => <Row key={u.id} k={`${u.name} autonomy`} v={`${u.batteryMin} min at ${u.loadPct}% load`} bad={u.state !== 'Online'} chip={u.state !== 'Online' ? <Chip tone="error" size="xs">{u.state}</Chip> : undefined} />)}
          </div>
        </Panel>
      </div>
    </>
  );
}

function Row({ k, v, bad, chip }: { k: string; v: string; bad?: boolean; chip?: React.ReactNode }) {
  return <div className="res-row"><span className="vw-label">{k}</span><span className={`res-v${bad ? ' is-bad' : ''}`}>{v}{chip}</span></div>;
}

type SortKey = 'name' | 'room' | 'load' | 'temp';
function RackTable({ racks, onRow }: { racks: Rack[]; onRow: (r: Rack) => void }) {
  const [sort, setSort] = useState<{ k: SortKey; d: 1 | -1 }>({ k: 'load', d: -1 });
  const rows = useMemo(() => [...racks].sort((a, b) => {
    const v = (r: Rack) => sort.k === 'name' ? r.name : sort.k === 'room' ? `${r.floor} ${r.room}` : sort.k === 'temp' ? r.tempC : r.drawKw / r.budgetKw;
    const x = v(a), y = v(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.d;
  }), [racks, sort]);
  const th = (k: SortKey, label: string, right?: boolean) => (
    <th className={right ? 'is-right' : ''}><button type="button" className={`dt-sort${sort.k === k ? ' is-active' : ''}`} onClick={() => setSort(s => ({ k, d: s.k === k ? (s.d === 1 ? -1 : 1) : -1 }))}>{label}<I.ArrowDown size={12} style={{ transform: sort.k === k && sort.d === 1 ? 'rotate(180deg)' : undefined }} /></button></th>
  );
  return (
    <table className="nst-table dt-table">
      <thead><tr>{th('name', 'Rack')}{th('room', 'Location')}{th('load', 'Draw / budget')}{th('temp', 'Inlet', true)}<th>State</th></tr></thead>
      <tbody>{rows.map(r => { const pct = Math.round((r.drawKw / r.budgetKw) * 100); const hot = r.tempC > TEMP.hi; return (
        <tr key={r.id} className="is-click" onClick={() => onRow(r)}>
          <td><span className="cell-2"><b className="mono strong">{r.name}</b><small>{r.role}</small></span></td>
          <td className="is-wrap">{r.floor} · {r.room}</td>
          <td><span className="row" style={{ gap: 8 }}><Meter pct={pct} width={64} color={loadColor(pct)} /><small className="muted num nowrap">{r.drawKw} / {r.budgetKw} kW</small></span></td>
          <td className={`is-right num${hot ? ' bad' : ''}`}>{r.tempC}°C</td>
          <td><Chip tone={pct >= 85 || hot ? 'error' : pct >= 75 ? 'warning' : 'success'} size="xs">{pct >= 85 ? 'Over budget' : hot ? 'Hot inlet' : pct >= 75 ? 'High' : 'Normal'}</Chip></td>
        </tr>); })}</tbody>
    </table>
  );
}

/* -------------------------------------------------------------- cooling */

function Cooling({ dc }: { dc: Datacenter }) {
  const c = dc.cooling;
  const op = c.units.filter(u => u.status === 'Operational');
  const unitCap = c.units[0]?.capacityKw || 1;
  const needed = Math.max(1, Math.ceil(c.loadKw / unitCap));
  const designOk = op.length >= needed + (c.redundancy === 'N+1' ? 1 : 0);
  const failedZones = new Set(c.units.filter(u => u.status !== 'Operational').map(u => u.zone));
  const racks = dc.racks.filter(r => failedZones.has(`${r.floor} · ${r.room}`) || r.tempC > 30).sort((a, b) => b.tempC - a.tempC);
  const loadPct = Math.round((c.loadKw / c.capacityKw) * 100);
  return (
    <>
      <div className="kpis">
        <OpsKpi label="Cooling capacity" value={fmtNum(c.capacityKw)} unit="kW" icon={ic(I.Snowflake)} sub={`${c.units.length} units · design ${c.redundancy}`} />
        <OpsKpi label="Current load" value={fmtNum(Math.round(c.loadKw * 10) / 10)} unit="kW" icon={ic(I.Activity)} tone={loadPct >= 85 ? 'warn' : undefined} sub={`${loadPct}% of capacity`} />
        <OpsKpi label="Headroom" value={fmtNum(Math.round((c.capacityKw - c.loadKw) * 10) / 10)} unit="kW" icon={ic(I.Gauge)} sub={`running units carry ${fmtNum(op.reduce((a, u) => a + u.capacityKw, 0))} kW`} />
        <OpsKpi label="Units running" value={`${op.length}/${c.units.length}`} icon={ic(I.Fan)} tone={designOk ? undefined : 'bad'} sub={designOk ? `${needed} needed · ${c.redundancy} holds` : `${needed} needed · ${c.redundancy} not met`} />
      </div>
      <div className={`note ${designOk ? 'note--good' : 'note--bad'}`}>{designOk ? <I.CheckCircle2 size={15} /> : <I.ShieldAlert size={15} />}
        <span>{designOk ? `Redundancy intact: ${op.length} units running for a load that needs ${needed}.` : `Redundancy lost in ${[...failedZones].join(', ')}: ${op.length} unit(s) running for a load that needs ${needed}. Dependent racks are listed on the right.`}</span></div>
      <div className="grid g-2-1 fac-eq">
        <Panel title="CRAC / CRAH / CDU units" count={c.units.length} icon={I.Fan} flush>
          <table className="nst-table dt-table"><thead><tr><th>Unit</th><th>Zone</th><th>Load</th><th className="is-right">Supply / return</th><th>Status</th></tr></thead>
            <tbody>{c.units.map(u => (
              <tr key={u.id}><td><span className="cell-2"><b className="mono strong">{u.name}</b><small>{u.type} · {fmtKw(u.capacityKw)}</small></span></td><td className="is-wrap">{u.zone}</td>
                <td><Meter pct={u.status === 'Failed' ? 0 : u.loadPct} width={56} color={u.status === 'Failed' ? BAD : loadColor(u.loadPct)} /></td><td className="is-right num">{u.supplyC}° / {u.returnC}°C</td>
                <td><Chip tone={u.status === 'Operational' ? 'success' : u.status === 'Failed' ? 'error' : 'warning'} size="xs">{u.status}</Chip></td></tr>))}</tbody></table>
        </Panel>
        <Panel title="Dependent racks" count={racks.length} sub="In a zone with a unit down, or inlet above 30°C" icon={I.Server} flush>
          {racks.length ? (
            <table className="nst-table dt-table"><thead><tr><th>Rack</th><th>Zone</th><th className="is-right">Inlet</th><th className="is-right">Draw</th></tr></thead>
              <tbody>{racks.map(r => <tr key={r.id}><td className="mono strong">{r.name}</td><td className="is-wrap">{r.floor} · {r.room}</td><td className={`is-right num ${r.tempC > 30 ? 'bad' : ''}`}>{r.tempC}°C</td><td className="is-right num">{fmtKw(r.drawKw)}</td></tr>)}</tbody></table>
          ) : <div className="panel-body"><Empty icon={I.CheckCircle2} title="No rack depends on a failed unit" /></div>}
        </Panel>
      </div>
    </>
  );
}

/* ----------------------------------------------------------- environment */

function Environment({ dc }: { dc: Datacenter }) {
  const sensors = dc.cooling.sensors;
  const hot = sensors.filter(s => s.tempC > TEMP.hi || s.tempC < TEMP.lo), wet = sensors.filter(s => s.humidity > HUM.hi || s.humidity < HUM.lo);
  const events = sensors.filter(s => s.smoke || s.leak);
  return (
    <>
      <div className="kpis">
        <OpsKpi label="Zones monitored" value={sensors.length} icon={ic(I.Thermometer)} sub={`${TEMP.lo}–${TEMP.hi}°C · ${HUM.lo}–${HUM.hi}% RH limits`} />
        <OpsKpi label="Hottest zone" value={`${Math.max(...sensors.map(s => s.tempC))}°C`} icon={ic(I.Flame)} tone={hot.length ? 'bad' : undefined} sub={hot.length ? `${hot.length} zone${hot.length > 1 ? 's' : ''} out of range` : 'all zones in range'} />
        <OpsKpi label="Humidity" value={`${Math.min(...sensors.map(s => s.humidity))}–${Math.max(...sensors.map(s => s.humidity))}%`} icon={ic(I.Droplets)} tone={wet.length ? 'warn' : undefined} sub={wet.length ? `${wet.length} zone${wet.length > 1 ? 's' : ''} out of range` : 'all zones in range'} />
        <OpsKpi label="Smoke / leak" value={events.length} icon={ic(I.AlarmSmoke)} tone={events.length ? 'bad' : undefined} sub={events.length ? events.map(s => s.zone).join(', ') : 'no detection'} />
      </div>
      <Panel title="Environmental sensors" count={sensors.length} sub="One row per zone · racks in the zone and their hottest inlet" icon={I.Thermometer} actions={<Fresh>sensors · 1 min</Fresh>} flush>
        <table className="nst-table dt-table"><thead><tr><th>Zone</th><th>Temperature</th><th className="is-right">Humidity</th><th>Smoke / leak</th><th className="is-right">Racks · max inlet</th><th>State</th></tr></thead>
          <tbody>{sensors.map(s => {
            const h = s.tempC > TEMP.hi || s.tempC < TEMP.lo, w = s.humidity > HUM.hi || s.humidity < HUM.lo, ev = s.smoke || s.leak;
            const racks = dc.racks.filter(r => `${r.floor} · ${r.room}` === s.zone);
            return (
              <tr key={s.id}>
                <td className="is-wrap strong">{s.zone}</td>
                <td><span className="row" style={{ gap: 8 }}><Meter pct={((s.tempC - 10) / 25) * 100} width={64} color={h ? BAD : ACCENT} label={`${s.tempC}°C`} /></span></td>
                <td className={`is-right num${w ? ' warn' : ''}`}>{s.humidity}% RH</td>
                <td>{s.smoke ? 'Smoke detected' : 'Clear'} / {s.leak ? 'Leak detected' : 'Dry'}</td>
                <td className="is-right num">{racks.length} · {racks.length ? `${Math.max(...racks.map(r => r.tempC))}°C` : '—'}</td>
                <td><Chip tone={h || ev ? 'error' : w ? 'warning' : 'success'} size="xs">{h ? 'Over temp' : s.smoke ? 'Smoke' : s.leak ? 'Leak' : w ? 'Humidity' : 'Normal'}</Chip></td>
              </tr>);
          })}</tbody></table>
      </Panel>
    </>
  );
}

/* ----------------------------------------------------------- maintenance */

function Maintenance({ alerts, changes }: { alerts: NonNullable<Awaited<ReturnType<typeof getAlerts>>>; changes: NonNullable<Awaited<ReturnType<typeof getChanges>>> }) {
  const nav = useNavigate();
  const now = clockNow();
  return (
    <div className="grid g-2 fac-eq">
      <Panel title="Facility alarms" count={alerts.length} sub="Power, cooling and environment events and their incident" icon={I.BellRing} flush>
        {alerts.length ? (
          <table className="nst-table dt-table"><thead><tr><th>Severity</th><th>Alarm</th><th>Incident</th><th className="is-right">Raised</th></tr></thead>
            <tbody>{alerts.map(a => (
              <tr key={a.id}><td><SeverityChip s={a.severity} size="xs" /></td><td className="is-wrap"><span className="cell-2"><b className="strong">{a.title}</b><small>{a.code} · {a.description}</small></span></td>
                <td>{a.incidentId ? <IncLink id={a.incidentId} /> : <span className="faint">not correlated</span>}</td><td className="is-right num nowrap">{fmtAgo(a.start, now)}</td></tr>))}</tbody></table>
        ) : <div className="panel-body"><Empty icon={I.CheckCircle2} title="No active facility alarms" /></div>}
      </Panel>
      <Panel title="Maintenance schedule" count={changes.length} sub="Inspections and tests for generators, batteries, UPS, cooling and safety systems" icon={I.CalendarClock} flush
        actions={<Link to="/changes" className="panel-link">Change calendar<I.ChevronRight size={14} /></Link>}>
        {changes.length ? (
          <table className="nst-table dt-table"><thead><tr><th>Window</th><th>Maintenance</th><th>Risk</th><th>Status</th></tr></thead>
            <tbody>{changes.map(c => (
              <tr key={c.id} className="is-click" onClick={() => nav(`/changes?id=${c.id}`)}><td className="num nowrap">{fmtDateTime(c.windowStart)}</td><td className="is-wrap"><span className="cell-2"><b className="strong">{c.title}</b><small className="mono">{c.id} · {c.requester}{c.approver ? ` · approved by ${c.approver}` : ''}</small></span></td>
                <td><Chip tone={c.risk === 'High' ? 'error' : c.risk === 'Medium' ? 'warning' : 'neutral'} size="xs">{c.risk}</Chip></td><td><ChangeChip s={c.status} size="xs" /></td></tr>))}</tbody></table>
        ) : <div className="panel-body"><Empty icon={I.CalendarClock} title="No maintenance scheduled for this site" /></div>}
      </Panel>
    </div>
  );
}
