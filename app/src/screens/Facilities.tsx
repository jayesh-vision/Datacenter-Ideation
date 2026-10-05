import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, getAlerts, getChanges, getDatacenter, getDatacenters, useQuery } from '../api';
import type { Datacenter, Rack, Severity } from '../api/types';
import { usePage, PageHead, Loading, useSentinel } from '../shell/page';
import { Chip, Panel, Tabs, Empty } from '../ui/kit';
import { ChangeChip, DcLink, IncLink, Meter, RolloutChip, SeverityChip, Fresh } from '../ui/status';
import { fmtAgo, fmtDate, fmtDateTime, fmtKw, fmtNum } from '../lib/format';
import { SEVERITY } from '../lib/vocab';
import { useSize } from '../charts/core';
import { TimeChart } from '../charts/TimeChart';
import { Facts, MiniBars, SOFT, SoftMeter, Split, StatGrid, StatTile, type Tone } from '../ui/Analytics';
import { NotFound } from './NotFound';
import '../styles/plan.css';
import '../styles/facilities.css';
import { OpstralBtn } from '../ui/OpstralMark';

type TabId = 'power' | 'cooling' | 'environment' | 'maintenance';
const TEMP = { lo: 18, hi: 27 }, HUM = { lo: 40, hi: 60 };
const BAD = 'var(--vw-color-red-500)', WARN = 'var(--vw-color-amber-500)', ACCENT = 'var(--primaryColor500)';
const loadColor = (p: number) => (p >= 85 ? BAD : p >= 75 ? WARN : ACCENT);
const loadTone = (p: number): Tone => (p >= 85 ? 'error' : p >= 75 ? 'warning' : 'info');
const SEV_TONE: Record<Severity, Tone> = { critical: 'error', major: 'orange', minor: 'warning', warning: 'neutral' };
const p2 = (n: number) => String(n).padStart(2, '0');

/* Facilities (DC-FAC-001…007, DC-SITE-002…005, DC-RES-001…003): the site's power path,
   backup ride-through, cooling and environment — read at a glance, then drilled by tab. */
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
  const now = clockNow();
  const fac = (alerts ?? []).filter(a => a.source === 'Power' || a.source === 'Cooling' || a.source === 'Environment');
  const maint = (changes ?? []).filter(c => c.kind === 'Maintenance');
  const upcoming = maint.filter(m => m.status !== 'Completed' && m.windowEnd >= now).sort((a, b) => a.windowStart - b.windowStart);
  const ups = dc.power.ups, units = dc.cooling.units, sensors = dc.cooling.sensors;
  const upsDown = ups.filter(u => u.state !== 'Online');
  const coolDown = units.filter(u => u.status !== 'Operational');
  const hotZones = sensors.filter(s => s.tempC > TEMP.hi);
  const totalKw = dc.power.split.reduce((a, s) => a + s.kw, 0);
  const pwrPct = Math.round((totalKw / dc.power.capacityKw) * 100);
  const coolPct = Math.round((dc.cooling.loadKw / dc.cooling.capacityKw) * 100);
  const hottest = sensors.length ? Math.max(...sensors.map(s => s.tempC)) : 0;
  const live = dcs.filter(d => d.status !== 'planned');

  return (
    <div className="page">
      <PageHead title="Facilities" chips={<RolloutChip s={dc.status} />}
        sub={<>Power path, backup ride-through, cooling and environment for <DcLink id={dc.id} /> · {dc.address}, {dc.city} · {dc.tier}</>}
        actions={<>
          <select className="select" value={dcId} onChange={e => set('dc', e.target.value)} aria-label="Datacenter">{live.map(d => <option key={d.id} value={d.id}>{d.id} · {d.city}</option>)}</select>
          <OpstralBtn onClick={() => ask(`What is at risk in ${dc.id}?`)} />
        </>} />

      <StatGrid>
        <StatTile label="Power load" value={`${pwrPct}%`} sub={`${fmtKw(totalKw)} of ${fmtKw(dc.power.capacityKw)}`} subTone={pwrPct >= 85 ? 'bad' : undefined} onClick={() => set('tab', '')} active={tab === 'power'}>
          <SoftMeter pct={pwrPct} tone={loadTone(pwrPct)} />
          <Facts items={[{ n: fmtKw(dc.power.peakKw), label: 'peak today' }, { n: fmtKw(Math.max(0, dc.power.capacityKw - totalKw)), label: 'headroom' }]} />
        </StatTile>
        <StatTile label="PUE" value={dc.power.pue.toFixed(2)} sub="facility ÷ IT load">
          <Split parts={dc.power.split.map((x, i) => ({ key: x.label, label: i === 0 ? 'IT' : x.label.split(' ')[0], n: Math.round(x.kw * 10) / 10, tone: (['info', 'cyan', 'neutral'] as Tone[])[i] ?? 'neutral' }))} />
        </StatTile>
        <StatTile label="UPS" value={`${ups.length - upsDown.length}/${ups.length}`} sub={upsDown.length ? upsDown.map(u => `${u.name} ${u.state.toLowerCase()}`).join(', ') : `online · ${ups[0]?.redundancy ?? 'N'} intact`} subTone={upsDown.length ? 'bad' : undefined} onClick={() => set('tab', '')}>
          <Split parts={[{ key: 'on', label: 'Online', n: ups.length - upsDown.length, tone: 'success' }, { key: 'bat', label: 'On battery', n: ups.filter(u => u.state === 'On battery').length, tone: 'warning' }, { key: 'flt', label: 'Fault', n: ups.filter(u => u.state === 'Fault' || u.state === 'Bypass').length, tone: 'error' }]} />
          <Facts items={[{ n: `${Math.min(...ups.map(u => u.batteryMin))} min`, label: 'shortest autonomy', tone: upsDown.length ? 'bad' : undefined }]} />
        </StatTile>
        <StatTile label="Cooling" value={`${units.length - coolDown.length}/${units.length}`} sub={coolDown.length ? `${coolDown[0].name} ${coolDown[0].status.toLowerCase()}${coolDown.length > 1 ? ` +${coolDown.length - 1}` : ''}` : `units running · ${dc.cooling.redundancy}`} subTone={coolDown.some(u => u.status === 'Failed') ? 'bad' : coolDown.length ? 'warn' : undefined} onClick={() => set('tab', 'cooling')} active={tab === 'cooling'}>
          <Split parts={[{ key: 'op', label: 'Running', n: units.filter(u => u.status === 'Operational').length, tone: 'success' }, { key: 'mt', label: 'Maint.', n: units.filter(u => u.status === 'Maintenance').length, tone: 'warning' }, { key: 'fl', label: 'Failed', n: units.filter(u => u.status === 'Failed').length, tone: 'error' }]} />
          <Facts items={[{ n: `${coolPct}%`, label: 'of capacity in use', tone: coolPct >= 85 ? 'warn' : undefined }]} />
        </StatTile>
        <StatTile label="Environment" value={`${hottest}°C`} sub={hotZones.length ? `${hotZones.length} zone${hotZones.length > 1 ? 's' : ''} above ${TEMP.hi}°C` : 'hottest zone'} subTone={hotZones.length ? 'bad' : undefined} onClick={() => set('tab', 'environment')} active={tab === 'environment'}>
          <Split parts={[{ key: 'ok', label: 'In range', n: sensors.filter(s => s.tempC <= 25).length, tone: 'success' }, { key: 'warm', label: 'Warm', n: sensors.filter(s => s.tempC > 25 && s.tempC <= TEMP.hi).length, tone: 'warning' }, { key: 'hot', label: 'Hot', n: hotZones.length, tone: 'error' }]} />
          <Facts items={[{ n: `${Math.min(...sensors.map(s => s.humidity))}–${Math.max(...sensors.map(s => s.humidity))}%`, label: 'humidity' }]} />
        </StatTile>
        <StatTile label="Alarms & maintenance" value={fac.length} sub={fac.length ? `facility alarm${fac.length > 1 ? 's' : ''} active` : 'no facility alarms'} subTone={fac.some(a => a.severity === 'critical') ? 'bad' : undefined} onClick={() => set('tab', 'maintenance')} active={tab === 'maintenance'}>
          <Split parts={(['critical', 'major', 'minor', 'warning'] as Severity[]).map(sv => ({ key: sv, label: SEVERITY[sv].label, n: fac.filter(a => a.severity === sv).length, tone: SEV_TONE[sv] })).filter(x => x.n || x.key === 'critical')} />
          <Facts items={[{ n: upcoming.length, label: upcoming[0] ? `due · next ${fmtDate(upcoming[0].windowStart).slice(0, 6)}` : 'maintenance due' }]} />
        </StatTile>
      </StatGrid>

      <Tabs value={tab} onChange={v => set('tab', v === 'power' ? '' : v)} tabs={[
        { id: 'power', label: 'Power & backup', icon: I.Zap }, { id: 'cooling', label: 'Cooling', icon: I.Snowflake, count: coolDown.length || undefined },
        { id: 'environment', label: 'Environment', icon: I.Thermometer, count: hotZones.length || undefined }, { id: 'maintenance', label: 'Maintenance & alarms', icon: I.Wrench, count: fac.length + maint.filter(m => m.status !== 'Completed').length || undefined }
      ]} />
      {tab === 'power' && <PowerTab dc={dc} />}
      {tab === 'cooling' && <Cooling dc={dc} />}
      {tab === 'environment' && <Environment dc={dc} />}
      {tab === 'maintenance' && <Maintenance alerts={fac} changes={maint} />}
    </div>
  );
}

/* ---------------------------------------------------------------- power */

type PState = 'live' | 'standby' | 'warn' | 'alarm';
interface PNode { id: string; col: number; name: string; metric: string; sub: string; chip: string; state: PState; icon: I.LucideIcon }
interface PEdge { from: string; to: string; state: PState; kind?: 'bus' | 'up' }
const COLS = ['Sources', 'Transfer', 'Main distribution', 'UPS & DC plant', 'Loads'];
const P_TONE: Record<PState, Tone> = { live: 'success', standby: 'neutral', warn: 'warning', alarm: 'error' };

/* Single-line power diagram: utility / DG → ATS → LT panel → UPS & rectifier → loads.
   Live paths animate in the direction of flow; standby is dashed grey; a lost input is red.
   Hovering a node lights everything upstream and downstream of it. */
function PowerPath({ dc }: { dc: Datacenter }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const now = clockNow();
  const p = dc.power;
  const ac = p.feeds.filter(f => f.type === 'AC'), dcF = p.feeds.filter(f => f.type === 'DC');
  const feedAlarm = ac.some(f => f.status === 'Alarm'), allLost = ac.length > 0 && ac.every(f => f.status === 'Alarm');
  const totalKw = p.split.reduce((a, x) => a + x.kw, 0), itKw = dc.racks.reduce((a, r) => a + r.drawKw, 0);
  const battOverdue = now - p.battery.lastTest > 90 * 86_400_000;
  const upsState = (st: string): PState => (st === 'Online' ? 'live' : st === 'Fault' ? 'alarm' : 'warn');

  const { nodes, edges } = useMemo(() => {
    const nodes: PNode[] = [
      ...ac.map(f => ({ id: f.id, col: 0, name: f.source.replace('Utility feed', 'Utility'), metric: `${fmtKw(f.loadKw)} of ${fmtKw(f.capacityKw)}`, sub: f.rating, chip: f.status === 'Alarm' ? 'Lost' : f.loadKw === 0 ? 'Standby' : 'Live', state: (f.status === 'Alarm' ? 'alarm' : f.loadKw === 0 ? 'standby' : 'live') as PState, icon: I.UtilityPole })),
      { id: 'dg', col: 0, name: 'DG set', metric: `${fmtNum(p.dg.kva)} kVA · fuel ${p.dg.fuelPct}%`, sub: `${p.dg.runtimeH} h runtime · test ${p.dg.result.toLowerCase()}`, chip: feedAlarm ? 'Pending' : 'Standby', state: feedAlarm ? 'warn' : 'standby', icon: I.Fuel },
      { id: 'ats', col: 1, name: 'ATS-1', metric: allLost ? 'No source' : feedAlarm ? 'On alternate source' : 'On utility', sub: '415 V · automatic transfer', chip: allLost ? 'No input' : feedAlarm ? 'On alt.' : 'Normal', state: allLost ? 'alarm' : feedAlarm ? 'warn' : 'live', icon: I.ToggleRight },
      { id: 'lt', col: 2, name: 'LT panel', metric: fmtKw(totalKw), sub: `AC ${fmtKw(p.acKw)} · DC ${fmtKw(p.dcKw)}`, chip: allLost ? 'No power' : 'Normal', state: allLost ? 'alarm' : 'live', icon: I.PanelTop },
      ...p.ups.map(u => ({ id: u.id, col: 3, name: u.name, metric: `${u.loadPct}% of ${fmtKw(u.capacityKw)}`, sub: `${u.redundancy} · ${u.batteryMin} min battery`, chip: u.state === 'On battery' ? 'Battery' : u.state, state: upsState(u.state), icon: I.BatteryCharging })),
      ...dcF.map(f => ({ id: f.id, col: 3, name: f.source.replace('Rectifier ', ''), metric: fmtKw(f.loadKw), sub: `rectifier · ${f.rating}`, chip: f.status, state: (f.status === 'Alarm' ? 'alarm' : 'live') as PState, icon: I.PlugZap })),
      { id: 'batt', col: 3, name: 'Battery', metric: `${p.battery.volts} V · ${fmtNum(p.battery.ah)} Ah`, sub: `${p.battery.runtimeH} h autonomy`, chip: allLost ? 'In use' : battOverdue ? 'Test due' : 'Float', state: allLost || battOverdue ? 'warn' : 'standby', icon: I.Battery },
      { id: 'pdu', col: 4, name: 'IT racks', metric: `${fmtKw(itKw)} IT load`, sub: `PDU A + B · ${dc.racks.length} racks`, chip: p.ups.some(u => u.state !== 'Online') ? 'Reduced' : 'Normal', state: p.ups.some(u => u.state !== 'Online') ? 'warn' : 'live', icon: I.Server },
      ...(dcF.length ? [{ id: 'bdfb', col: 4, name: 'DC loads', metric: fmtKw(p.dcKw), sub: '−48 V · BDFB distribution', chip: 'Normal', state: 'live' as PState, icon: I.Cable }] : []),
      ...p.split.slice(1).map((x, i) => ({ id: `load${i}`, col: 4, name: x.label.split(' ')[0], metric: fmtKw(x.kw), sub: `${Math.round((x.kw / (totalKw || 1)) * 100)}% of site load`, chip: allLost ? 'Off' : 'Normal', state: (allLost ? 'alarm' : 'live') as PState, icon: i === 0 ? I.Fan : I.Lightbulb }))
    ];
    const edges: PEdge[] = [
      ...ac.map(f => ({ from: f.id, to: 'ats', state: (f.status === 'Alarm' ? 'alarm' : f.loadKw === 0 ? 'standby' : 'live') as PState })),
      { from: 'dg', to: 'ats', state: feedAlarm ? 'warn' : 'standby' },
      { from: 'ats', to: 'lt', state: allLost ? 'alarm' : 'live' },
      /* with every source lost the LT panel is dead: UPS and the DC plant carry the loads from their batteries */
      ...p.ups.map(u => ({ from: 'lt', to: u.id, state: (!allLost && u.state === 'Online' ? 'live' : 'alarm') as PState })),
      ...p.ups.map(u => ({ from: u.id, to: 'pdu', state: upsState(u.state) })),
      ...dcF.flatMap(f => [{ from: 'lt', to: f.id, state: (allLost ? 'alarm' : 'live') as PState }, { from: f.id, to: 'bdfb', state: 'live' as PState }, { from: 'batt', to: f.id, state: (allLost ? 'warn' : 'standby') as PState, kind: 'up' as const }]),
      ...p.split.slice(1).map((_, i) => ({ from: 'lt', to: `load${i}`, state: (allLost ? 'alarm' : 'live') as PState, kind: 'bus' as const }))
    ];
    return { nodes, edges };
  }, [dc, now]); // eslint-disable-line react-hooks/exhaustive-deps

  /* layout from the measured width */
  const W = Math.max(760, size.width), GAP = W < 1000 ? 28 : 44, NH = 68, RG = 10, HEAD = 26, BUS = 22;
  const nw = (W - GAP * (COLS.length - 1)) / COLS.length;
  const byCol = COLS.map((_, c) => nodes.filter(n => n.col === c));
  const maxRows = Math.max(...byCol.map(l => l.length));
  const bodyH = maxRows * NH + (maxRows - 1) * RG, H = HEAD + bodyH + BUS;
  const pos = new Map<string, { x: number; y: number }>();
  byCol.forEach((l, c) => { const colH = l.length * NH + (l.length - 1) * RG; const y0 = HEAD + (bodyH - colH) / 2; l.forEach((n, i) => pos.set(n.id, { x: c * (nw + GAP), y: y0 + i * (NH + RG) })); });
  const path = (e: PEdge) => {
    const a = pos.get(e.from)!, b = pos.get(e.to)!;
    if (e.kind === 'up') return `M ${a.x + nw / 2} ${a.y} V ${b.y + NH}`;
    if (e.kind === 'bus') { const busY = H - 8, vx = b.x - 9; return `M ${a.x + nw / 2} ${a.y + NH} V ${busY} H ${vx} V ${b.y + NH / 2} H ${b.x}`; }
    const mid = a.x + nw + GAP / 2;
    return `M ${a.x + nw} ${a.y + NH / 2} H ${mid} V ${b.y + NH / 2} H ${b.x}`;
  };
  /* everything upstream and downstream of the hovered node */
  const lit = useMemo(() => {
    if (!hover) return null;
    const s = new Set([hover]);
    const walk = (dir: 'from' | 'to') => { const q = [hover]; while (q.length) { const id = q.pop()!; edges.forEach(e => { const [src, dst] = dir === 'from' ? [e.from, e.to] : [e.to, e.from]; if (src === id && !s.has(dst)) { s.add(dst); q.push(dst); } }); } };
    walk('from'); walk('to');
    return s;
  }, [hover, edges]);

  return (
    <div ref={ref} className="pp" style={{ height: H }}>
      {size.width > 0 && <>
        <svg className="pp-svg" width={W} height={H} aria-hidden>
          {edges.map((e, i) => { if (!pos.get(e.from) || !pos.get(e.to)) return null; const d = path(e); const on = !lit || (lit.has(e.from) && lit.has(e.to)); return (
            <g key={i} className={`pp-edge is-${e.state}${on ? '' : ' is-dim'}${lit && on ? ' is-lit' : ''}`}>
              <path d={d} className="pp-rail" />
              {(e.state === 'live' || e.state === 'warn') && <path d={d} className="pp-flow" />}
            </g>
          ); })}
        </svg>
        {COLS.map((c, i) => <span key={c} className="pp-col" style={{ left: i * (nw + GAP), width: nw }}>{c}</span>)}
        {nodes.map(n => { const xy = pos.get(n.id)!; const dim = lit && !lit.has(n.id); return (
          <div key={n.id} className={`pp-node is-${n.state}${dim ? ' is-dim' : ''}`} style={{ left: xy.x, top: xy.y, width: nw, height: NH }} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} title={`${n.name} · ${n.metric} · ${n.sub}`}>
            <span className="pp-ic"><n.icon size={15} /></span>
            <span className="pp-body">
              <span className="pp-h"><b>{n.name}</b><span className={`vw-chip vw-chip--${P_TONE[n.state]} pp-chip`}><i className="chip-dot" />{n.chip}</span></span>
              <span className="pp-m">{n.metric}</span>
              <span className="pp-s">{n.sub}</span>
            </span>
          </div>
        ); })}
      </>}
    </div>
  );
}

/* What happens if utility power fails: UPS bridges, the DG takes over, fuel sets the runway. */
function RideThrough({ dc }: { dc: Datacenter }) {
  const now = clockNow();
  const p = dc.power;
  const ac = p.feeds.filter(f => f.type === 'AC'), dcF = p.feeds.filter(f => f.type === 'DC');
  const totalKw = p.split.reduce((a, x) => a + x.kw, 0);
  const upsMin = Math.min(...p.ups.map(u => u.batteryMin));
  const dgKw = Math.round(p.dg.kva * 0.8), dgPct = Math.round((totalKw / dgKw) * 100);
  const onBatt = p.ups.filter(u => u.state === 'On battery');
  const upsOnline = p.ups.filter(u => u.state === 'Online').length;
  const feedLost = ac.some(f => f.status === 'Alarm');
  const dgAgeD = Math.round((now - p.dg.lastTest) / 86_400_000), battAgeD = Math.round((now - p.battery.lastTest) / 86_400_000);
  const checks: { ok: boolean; warn?: boolean; k: string; v: string }[] = [
    { ok: upsOnline === p.ups.length, k: 'UPS redundancy', v: `${p.ups[0]?.redundancy} design · ${upsOnline}/${p.ups.length} online` },
    { ok: ac.length >= 2 && !feedLost, warn: ac.length < 2 && !feedLost, k: 'Utility feeds', v: feedLost ? `${ac.filter(f => f.status === 'Alarm').length} of ${ac.length} lost` : ac.length >= 2 ? `${ac.length} independent feeds` : 'single feed — DG is the only alternative' },
    { ok: p.dg.result === 'Pass' && dgAgeD <= 35, warn: p.dg.result === 'Pass' && dgAgeD > 35, k: 'DG test', v: `${p.dg.result} · ${dgAgeD} d ago${dgAgeD > 35 ? ' · monthly test overdue' : ''}` },
    { ok: p.dg.fuelPct >= 50, warn: p.dg.fuelPct >= 30 && p.dg.fuelPct < 50, k: 'DG fuel', v: `${p.dg.fuelPct}% · ${p.dg.runtimeH} h at 60% load` },
    { ok: battAgeD <= 90, warn: battAgeD > 90, k: 'Battery test', v: `${fmtDate(p.battery.lastTest)}${battAgeD > 90 ? ' · quarterly test overdue' : ''}` },
    ...(dcF.length ? [{ ok: dcF.length >= 2, warn: dcF.length < 2, k: '−48 V DC plant', v: dcF.length < 2 ? `single rectifier · ${p.battery.runtimeH} h on battery` : `${dcF.length} rectifiers · ${p.battery.runtimeH} h on battery` }] : [])
  ];
  return (
    <div className="rt">
      {onBatt.length > 0
        ? <div className="note note--bad"><I.ShieldAlert size={15} /><span><b>{onBatt.map(u => u.name).join(', ')} on battery now</b> — {Math.min(...onBatt.map(u => u.batteryMin))} min of autonomy left at the current load. The DG has not taken the load.</span></div>
        : <div className="note note--good"><I.ShieldCheck size={15} /><span>The site rides through a utility failure for about <b>{p.dg.runtimeH} h</b> without refuelling.</span></div>}
      <div className="rt-steps">
        <div className="rt-step"><span className="rt-t">0 s · utility lost</span><b>{upsMin} min</b><small>UPS batteries carry the IT load (shortest unit)</small></div>
        <I.ChevronRight size={16} className="rt-arrow" />
        <div className="rt-step"><span className="rt-t">≈ 30 s · DG starts</span><b>{fmtNum(dgKw)} kW</b><small>{fmtNum(p.dg.kva)} kVA set · {dgPct}% loaded by this site</small></div>
        <I.ChevronRight size={16} className="rt-arrow" />
        <div className="rt-step"><span className="rt-t">Fuel runway</span><b>{p.dg.runtimeH} h</b><small>at {p.dg.fuelPct}% fuel · refuel before then</small></div>
      </div>
      <div className="rt-bar" aria-hidden>
        <i className="is-ups" style={{ flex: '0 0 16%' }}><span>UPS {upsMin} min</span></i>
        <i className="is-dg" style={{ flex: 1 }}><span>DG {p.dg.runtimeH} h</span></i>
      </div>
      <ul className="rt-checks">
        {checks.map(c => (
          <li key={c.k} className={c.ok ? 'is-ok' : c.warn ? 'is-warn' : 'is-bad'}>
            {c.ok ? <I.CircleCheck size={15} /> : <I.TriangleAlert size={15} />}<span className="rt-k">{c.k}</span><span className="rt-v">{c.v}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PowerTab({ dc }: { dc: Datacenter }) {
  const now = clockNow();
  const nav = useNavigate();
  const p = dc.power;
  const totalKw = p.split.reduce((a, x) => a + x.kw, 0);
  const labels = Array.from({ length: 24 }, (_, i) => `${p2(new Date(now - (23 - i) * 3_600_000).getHours())}:00`);
  const avg = p.load24h.reduce((a, b) => a + b, 0) / (p.load24h.length || 1);
  const growth = p.history12m[0] ? Math.round(((p.history12m[11] - p.history12m[0]) / p.history12m[0]) * 100) : 0;
  const racks = [...dc.racks].filter(r => r.drawKw > 0);
  const pctOf = (r: Rack) => Math.round((r.drawKw / (r.budgetKw || 1)) * 100);
  const hotRacks = racks.filter(r => pctOf(r) >= 85).length;
  return (
    <>
      <Panel title="Power path" sub="Live single-line view from the sources to the loads. Hover a block to trace what feeds it and what it feeds." icon={I.Workflow}
        actions={<span className="pp-legend"><span><i className="is-live" />Live</span><span><i className="is-standby" />Standby</span><span><i className="is-warn" />Degraded</span><span><i className="is-alarm" />Lost</span><Fresh>BMS · 2 min ago</Fresh></span>}>
        <PowerPath dc={dc} />
      </Panel>

      <div className="grid g-2 fac-eq">
        <Panel title="Site load · last 24 hours" sub="Total facility draw against installed capacity" icon={I.Activity}>
          <div className="lc-stats">
            <div><span>Now</span><b>{fmtKw(totalKw)}</b></div>
            <div><span>Peak</span><b>{fmtKw(Math.max(...p.load24h))}</b></div>
            <div><span>Average</span><b>{fmtKw(avg)}</b></div>
            <div><span>Headroom</span><b>{fmtKw(Math.max(0, p.capacityKw - totalKw))}</b></div>
          </div>
          <TimeChart labels={labels} height={190} legend={false} yMin={0} yMax={Math.ceil((p.capacityKw * 1.08) / 10) * 10} format={v => `${Math.round(v)} kW`}
            series={[{ key: 'load', label: 'Site load', color: 'var(--primaryColor500)', kind: 'area', values: p.load24h }]} target={{ value: p.capacityKw, label: 'Capacity' }} />
          <div className="lc-year"><span className="vw-label">12-month trend · {growth >= 0 ? '+' : ''}{growth}%</span><MiniBars values={p.history12m} tone="info" /></div>
        </Panel>
        <Panel title="If utility power fails" sub="How long the site carries its load, and what could stop it" icon={I.ShieldCheck}>
          <RideThrough dc={dc} />
        </Panel>
      </div>

      <Panel title="Rack power" count={racks.length} sub={hotRacks ? `${hotRacks} rack${hotRacks > 1 ? 's' : ''} at or above 85% of budget` : 'Live draw against budget · every rack within budget'} icon={I.Server} flush>
        {racks.length ? <>
          <RackTable racks={racks} onRow={() => nav(`/datacenters/${dc.id}?tab=details`)} />
        </> : <div className="panel-body"><Empty icon={I.Server} title="No racks energised yet" /></div>}
      </Panel>
    </>
  );
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
  const running = op.reduce((a, u) => a + u.capacityKw, 0), minusOne = Math.max(0, running - unitCap);
  const scale = Math.max(c.capacityKw, c.loadKw) || 1;
  const bars: { k: string; v: number; tone: Tone; note: string }[] = [
    { k: 'Heat to remove', v: c.loadKw, tone: 'orange', note: `${Math.round((c.loadKw / c.capacityKw) * 100)}% of installed capacity` },
    { k: 'Running capacity', v: running, tone: 'info', note: `${op.length} of ${c.units.length} units` },
    { k: 'With one more unit lost', v: minusOne, tone: minusOne >= c.loadKw ? 'success' : 'error', note: minusOne >= c.loadKw ? 'still covers the load' : 'does NOT cover the load' },
    { k: 'Installed capacity', v: c.capacityKw, tone: 'neutral', note: `design ${c.redundancy}` }
  ];
  return (
    <>
      <div className="grid g-1-2 fac-eq">
        <Panel title="Heat balance" sub="Can the running units carry the heat load, and survive one more failure?" icon={I.Scale}>
          <div className={`note ${designOk ? 'note--good' : 'note--bad'}`}>{designOk ? <I.CheckCircle2 size={15} /> : <I.ShieldAlert size={15} />}
            <span>{designOk ? `Redundancy intact: ${op.length} units running for a load that needs ${needed}.` : `Redundancy lost in ${[...failedZones].join(', ')}: ${op.length} running for a load that needs ${needed}.`}</span></div>
          <div className="hb">
            {bars.map(b => (
              <div key={b.k} className="hb-row">
                <span className="hb-k">{b.k}</span>
                <span className="hb-track"><i style={{ width: `${Math.min(100, (b.v / scale) * 100)}%`, background: SOFT[b.tone] }} /><em style={{ left: `${Math.min(100, (c.loadKw / scale) * 100)}%` }} /></span>
                <span className="hb-v"><b>{fmtKw(b.v)}</b><small className={b.tone === 'error' ? 'bad' : ''}>{b.note}</small></span>
              </div>
            ))}
            <span className="hb-foot"><em />heat load line</span>
          </div>
        </Panel>
        <Panel title="Cooling units" count={c.units.length} sub="Load, supply and return air per unit" icon={I.Fan}>
          <div className="cu-grid">
            {c.units.map(u => { const st = u.status === 'Operational' ? 'success' : u.status === 'Failed' ? 'error' : 'warning'; const load = u.status === 'Failed' ? 0 : u.loadPct; return (
              <div key={u.id} className={`cu is-${st}`}>
                <div className="cu-h"><span><b>{u.name}</b><small>{u.type} · {fmtKw(u.capacityKw)}</small></span><span className={`vw-chip vw-chip--${st} pp-chip`}><i className="chip-dot" />{u.status}</span></div>
                <div className="cu-load"><span className="dco-meter"><i style={{ width: `${load}%`, background: SOFT[u.status === 'Failed' ? 'error' : loadTone(load)] }} /></span><b>{load}%</b></div>
                <div className="cu-air"><span><small>Supply</small>{u.status === 'Failed' ? '—' : `${u.supplyC}°C`}</span><I.MoveRight size={14} /><span><small>Return</small>{u.status === 'Failed' ? '—' : `${u.returnC}°C`}</span><span className="cu-dt"><small>ΔT</small>{u.status === 'Failed' ? '—' : `${u.returnC - u.supplyC}°`}</span></div>
                <small className="cu-zone"><I.MapPin size={12} />{u.zone}</small>
              </div>
            ); })}
          </div>
        </Panel>
      </div>
      <Panel title="Dependent racks" count={racks.length} sub="In a zone with a unit down, or inlet above 30°C" icon={I.Server} flush>
        {racks.length ? (
          <table className="nst-table dt-table"><thead><tr><th>Rack</th><th>Zone</th><th>Inlet</th><th>Draw</th></tr></thead>
            <tbody>{racks.map(r => <tr key={r.id}><td className="mono strong">{r.name}</td><td className="is-wrap">{r.floor} · {r.room}</td><td className={`num ${r.tempC > 30 ? 'bad' : ''}`}>{r.tempC}°C</td><td className="num">{fmtKw(r.drawKw)}</td></tr>)}</tbody></table>
        ) : <div className="panel-body"><Empty icon={I.CheckCircle2} title="No rack depends on a failed unit" /></div>}
      </Panel>
    </>
  );
}

/* ----------------------------------------------------------- environment */

/* a reading on its scale, with the safe band shaded and the value marked */
function Band({ value, min, max, lo, hi }: { value: number; min: number; max: number; lo: number; hi: number }) {
  const pc = (v: number) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const out = value > hi || value < lo;
  return <span className="band"><i className="band-safe" style={{ left: `${pc(lo)}%`, width: `${pc(hi) - pc(lo)}%` }} /><i className={`band-dot${out ? ' is-out' : ''}`} style={{ left: `${pc(value)}%` }} /><span className="band-x"><em style={{ left: `${pc(lo)}%` }}>{lo}</em><em style={{ left: `${pc(hi)}%` }}>{hi}</em></span></span>;
}

function Environment({ dc }: { dc: Datacenter }) {
  const sensors = dc.cooling.sensors;
  return (
    <Panel title="Zones" count={sensors.length} sub={`Each reading against its safe band — ${TEMP.lo}–${TEMP.hi}°C and ${HUM.lo}–${HUM.hi}% RH`} icon={I.Thermometer} actions={<Fresh>sensors · 1 min</Fresh>}>
      <div className="zn-grid">
        {sensors.map(s => {
          const h = s.tempC > TEMP.hi || s.tempC < TEMP.lo, w = s.humidity > HUM.hi || s.humidity < HUM.lo, ev = s.smoke || s.leak;
          const racks = dc.racks.filter(r => `${r.floor} · ${r.room}` === s.zone);
          const tone = h || ev ? 'error' : w ? 'warning' : 'success';
          return (
            <div key={s.id} className={`zn is-${tone}`}>
              <div className="zn-h"><b>{s.zone}</b><span className={`vw-chip vw-chip--${tone} pp-chip`}><i className="chip-dot" />{h ? 'Over temp' : s.smoke ? 'Smoke' : s.leak ? 'Leak' : w ? 'Humidity' : 'Normal'}</span></div>
              <div className="zn-read">
                <div><span className="zn-l"><I.Thermometer size={13} />Temperature</span><b className={h ? 'bad' : ''}>{s.tempC}<small>°C</small></b><Band value={s.tempC} min={12} max={34} lo={TEMP.lo} hi={TEMP.hi} /></div>
                <div><span className="zn-l"><I.Droplets size={13} />Humidity</span><b className={w ? 'warn' : ''}>{s.humidity}<small>% RH</small></b><Band value={s.humidity} min={20} max={80} lo={HUM.lo} hi={HUM.hi} /></div>
              </div>
              <div className="zn-f">
                <span className={s.smoke ? 'is-bad' : ''}><I.AlarmSmoke size={13} />{s.smoke ? 'Smoke detected' : 'No smoke'}</span>
                <span className={s.leak ? 'is-bad' : ''}><I.Droplet size={13} />{s.leak ? 'Leak detected' : 'Dry'}</span>
                <span><I.Server size={13} />{racks.length} racks{racks.length ? ` · max inlet ${Math.max(...racks.map(r => r.tempC))}°C` : ''}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
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
