import { Fragment } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, getAlerts, getChanges, getDatacenter, getDatacenters, useQuery } from '../api';
import type { Datacenter } from '../api/types';
import { usePage, PageHead, Loading, useSentinel } from '../shell/page';
import { Btn, Chip, Kpi, Panel, Tabs, Empty } from '../ui/kit';
import { ChangeChip, DcLink, IncLink, Meter, RolloutChip, SeverityChip, Fresh } from '../ui/status';
import { fmtAgo, fmtDate, fmtDateTime, fmtKw, fmtNum } from '../lib/format';
import { NotFound } from './NotFound';
import '../styles/plan.css';

type TabId = 'power' | 'cooling' | 'environment' | 'maintenance';
const TEMP = { lo: 18, hi: 27 }, HUM = { lo: 40, hi: 60 };

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
  usePage([{ label: 'Plan' }, { label: 'Facilities', to: '/facilities' }, { label: dcId }], { dcId });
  if (loading && !data) return <Loading />;
  if (!data || !dcs) return <NotFound what="Datacenter" />;
  const dc = data.dc;
  const fac = (alerts ?? []).filter(a => a.source === 'Power' || a.source === 'Cooling' || a.source === 'Environment');
  const maint = (changes ?? []).filter(c => c.kind === 'Maintenance');
  const upsDown = dc.power.ups.filter(u => u.state !== 'Online');
  const coolDown = dc.cooling.units.filter(u => u.status !== 'Operational');
  const hotZones = dc.cooling.sensors.filter(s => s.tempC > TEMP.hi);
  const totalKw = dc.power.split.reduce((a, s) => a + s.kw, 0);

  return (
    <div className="page">
      <PageHead title="Facilities" chips={<RolloutChip s={dc.status} />}
        sub={<>Power chain, backup readiness, cooling and environment for <DcLink id={dc.id} /> · {dc.address}, {dc.city} · {dc.tier}</>}
        actions={<>
          <select className="select" value={dcId} onChange={e => set('dc', e.target.value)} aria-label="Datacenter">{dcs.map(d => <option key={d.id} value={d.id}>{d.id} · {d.city}{d.status === 'planned' ? ' (planned)' : ''}</option>)}</select>
          <Btn icon={I.Sparkles} onClick={() => ask(`What is at risk in ${dc.id}?`)}>Ask Sentinel</Btn>
        </>} />
      <div className="kpis kpis-5">
        <Kpi label="Power in use" value={fmtNum(Math.round(totalKw * 10) / 10)} unit="kW" icon={I.Zap} tone="info" basis={`of ${fmtNum(dc.power.capacityKw)} kW · peak ${dc.power.peakKw} kW`} onClick={() => set('tab', '')} />
        <Kpi label="PUE" value={dc.power.pue.toFixed(2)} icon={I.Leaf} tone="success" basis={`IT ${fmtKw(dc.power.split[0].kw)} · cooling ${fmtKw(dc.power.split[1].kw)}`} />
        <Kpi label="UPS online" value={`${dc.power.ups.length - upsDown.length}/${dc.power.ups.length}`} icon={I.BatteryCharging} tone={upsDown.length ? 'error' : 'success'} basis={upsDown.length ? `${upsDown.map(u => `${u.name} ${u.state.toLowerCase()}`).join(', ')}` : `${dc.power.ups[0]?.redundancy ?? 'N'} redundancy intact`} onClick={() => set('tab', '')} />
        <Kpi label="Cooling units" value={`${dc.cooling.units.length - coolDown.length}/${dc.cooling.units.length}`} icon={I.Snowflake} tone={coolDown.some(u => u.status === 'Failed') ? 'error' : coolDown.length ? 'warning' : 'success'} basis={coolDown.length ? coolDown.map(u => `${u.name} ${u.status.toLowerCase()}`).join(', ') : 'all operational'} onClick={() => set('tab', 'cooling')} />
        <Kpi label="Facility alarms" value={fac.length} icon={I.BellRing} tone={fac.some(a => a.severity === 'critical') ? 'error' : fac.length ? 'warning' : 'success'} basis={hotZones.length ? `${hotZones.length} zone(s) above ${TEMP.hi}°C` : 'power, cooling, environment'} onClick={() => set('tab', 'maintenance')} />
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

function PowerChain({ dc }: { dc: Datacenter }) {
  const now = clockNow();
  const p = dc.power;
  const acFeeds = p.feeds.filter(f => f.type === 'AC'), dcFeeds = p.feeds.filter(f => f.type === 'DC');
  const feedAlarm = acFeeds.some(f => f.status === 'Alarm');
  const upsOnline = p.ups.filter(u => u.state === 'Online').length;
  const upsNeeded = p.ups.length - (p.ups[0]?.redundancy === 'N+1' ? 1 : p.ups[0]?.redundancy === '2N' ? p.ups.length / 2 : 0);
  const racks = [...dc.racks].filter(r => r.drawKw > 0).sort((a, b) => b.drawKw / b.budgetKw - a.drawKw / a.budgetKw);
  const spof: string[] = [];
  if (acFeeds.length < 2) spof.push('Single utility feed — DG is the only alternative source.');
  if (dcFeeds.length < 2) spof.push('Single rectifier plant (RECT-01) feeds the −48 V DC loads.');
  if (upsOnline < upsNeeded + (p.ups[0]?.redundancy === 'N+1' ? 1 : 0)) spof.push(`UPS redundancy lost: ${upsOnline} of ${p.ups.length} online against ${p.ups[0]?.redundancy} design.`);
  return (
    <>
      <Panel title="Power chain" sub="Utility → transfer switch → UPS / rectifier → distribution → racks. Red = alarm, amber = degraded, dashed = standby." icon={I.Workflow} actions={<Fresh>BMS · updated 2 min ago</Fresh>}>
        <div className="chain">
          <div className="chain-col">
            <div className="chain-h"><I.UtilityPole size={13} />Sources</div>
            {acFeeds.map(f => (
              <div key={f.id} className={`chain-node${f.status === 'Alarm' ? ' is-alarm' : f.loadKw === 0 ? ' is-idle' : ''}`}>
                <b>{f.id} <Chip tone={f.status === 'Alarm' ? 'error' : f.loadKw === 0 ? 'neutral' : 'success'} size="xs">{f.status === 'Alarm' ? 'Lost' : f.loadKw === 0 ? 'Standby' : 'Normal'}</Chip></b>
                <span>{f.source}</span><small>{f.rating} · {fmtKw(f.loadKw)} / {fmtKw(f.capacityKw)}</small>
              </div>
            ))}
            <div className={`chain-node${feedAlarm ? ' is-warn' : ' is-idle'}`}>
              <b>DG set <Chip tone={feedAlarm ? 'warning' : 'neutral'} size="xs">{feedAlarm ? 'Start pending' : 'Standby'}</Chip></b>
              <small>{fmtNum(p.dg.kva)} kVA · {p.dg.runtimeH} h at 60% · fuel {p.dg.fuelPct}%</small>
            </div>
          </div>
          <div className="chain-col">
            <div className="chain-h"><I.ToggleRight size={13} />Transfer & LT panel</div>
            <div className={`chain-node${feedAlarm ? ' is-warn' : ''}`}><I.ChevronRight size={16} className="chain-arrow" />
              <b>ATS-1 <Chip tone={feedAlarm ? 'warning' : 'success'} size="xs">{feedAlarm ? 'Position B' : 'Utility'}</Chip></b>
              <small>415 V 3-phase · auto transfer</small>
            </div>
            <div className="chain-node"><b>LT panel</b><small>AC {fmtKw(p.acKw)} · DC plant {fmtKw(p.dcKw)}</small></div>
          </div>
          <div className="chain-col">
            <div className="chain-h"><I.BatteryCharging size={13} />UPS & DC plant</div>
            {p.ups.map(u => (
              <div key={u.id} className={`chain-node${u.state !== 'Online' ? ' is-alarm' : ''}`}><I.ChevronRight size={16} className="chain-arrow" />
                <b>{u.name} <Chip tone={u.state === 'Online' ? 'success' : 'error'} size="xs">{u.state}</Chip></b>
                <Meter pct={u.loadPct} width={70} /><small>{fmtKw(u.capacityKw)} · {u.redundancy} · battery {u.batteryMin} min</small>
              </div>
            ))}
            {dcFeeds.map(f => <div key={f.id} className="chain-node"><b>{f.source}</b><small>{f.rating} · {fmtKw(f.loadKw)}</small></div>)}
          </div>
          <div className="chain-col">
            <div className="chain-h"><I.Split size={13} />Distribution</div>
            <div className="chain-node"><I.ChevronRight size={16} className="chain-arrow" /><b>Rack PDUs (A/B)</b><small>{dc.racks.length} racks · {fmtKw(dc.racks.reduce((a, r) => a + r.drawKw, 0))} IT</small></div>
            <div className="chain-node"><b>DC distribution (BDFB)</b><small>−48 V · {fmtKw(p.dcKw)}</small></div>
            <div className="chain-node"><b>Battery bank</b><small>{p.battery.volts} V · {fmtNum(p.battery.ah)} Ah · {p.battery.runtimeH} h</small></div>
          </div>
          <div className="chain-col">
            <div className="chain-h"><I.Server size={13} />Loads</div>
            {p.split.map(s => <div key={s.label} className="chain-node"><b>{s.label}</b><small>{fmtKw(s.kw)} · {Math.round((s.kw / (p.split.reduce((a, x) => a + x.kw, 0) || 1)) * 100)}%</small></div>)}
          </div>
        </div>
      </Panel>
      <div className="grid g-2-1" style={{ alignItems: 'start' }}>
        <Panel title="Rack draw" sub="Live draw against budget; open a rack's site details" icon={I.Server}>
          {racks.length ? (
            <div className="rack-mini">
              {racks.map(r => { const pct = Math.round((r.drawKw / r.budgetKw) * 100); return (
                <Link key={r.id} to={`/datacenters/${dc.id}?tab=details`} className={pct >= 85 ? 'is-hot' : ''} title={`${r.floor} · ${r.room} · ${r.role}`}>
                  <b>{r.name}</b><span className="bar" style={{ height: 5 }}><i style={{ width: `${Math.min(100, pct)}%`, background: pct >= 85 ? 'var(--vw-color-red-500)' : pct >= 75 ? 'var(--vw-color-amber-500)' : 'var(--vw-color-emerald-500)' }} /></span>
                  <span className="num muted">{r.drawKw} / {r.budgetKw} kW</span>
                </Link>); })}
            </div>
          ) : <Empty icon={I.Server} title="No racks energised yet" />}
        </Panel>
        <Panel title="Resilience" sub="Redundancy design and single points of failure (DC-RES-001/002)" icon={I.ShieldCheck}>
          <div className="col" style={{ gap: 8 }}>
            <div className="row between"><span className="muted">UPS design</span><b className="num">{p.ups[0]?.redundancy} · {upsOnline}/{p.ups.length} online</b></div>
            <div className="row between"><span className="muted">Cooling design</span><b className="num">{dc.cooling.redundancy} · {dc.cooling.units.filter(u => u.status === 'Operational').length}/{dc.cooling.units.length} running</b></div>
            <div className="row between"><span className="muted">Utility feeds</span><b className="num">{acFeeds.length}</b></div>
            {spof.length ? spof.map(s => <div key={s} className="note note--warn"><I.TriangleAlert size={14} />{s}</div>) : <div className="note note--good"><I.CheckCircle2 size={14} />No single point of failure in the power chain.</div>}
          </div>
        </Panel>
      </div>
      <Panel title="Backup readiness" sub="If a feed drops (DC-FAC-002)" icon={I.BatteryFull}>
        <div className="ready">
          <div className="ready-card">
            <h4>DG set <Chip tone={p.dg.result === 'Pass' ? 'success' : 'error'} size="xs">Last test {p.dg.result}</Chip></h4>
            <dl><dt>Rating</dt><dd>{fmtNum(p.dg.kva)} kVA</dd><dt>Runtime at 60%</dt><dd>{p.dg.runtimeH} h</dd><dt>Fuel</dt><dd>{p.dg.fuelPct}%</dd><dt>Last test</dt><dd>{fmtDate(p.dg.lastTest)} · {Math.round((now - p.dg.lastTest) / 86_400_000)} d ago</dd></dl>
            <Meter pct={p.dg.fuelPct} width={160} color={p.dg.fuelPct < 50 ? 'var(--vw-color-amber-500)' : 'var(--vw-color-emerald-500)'} label={`fuel ${p.dg.fuelPct}%`} />
          </div>
          <div className="ready-card">
            <h4>Battery bank <Chip tone={now - p.battery.lastTest > 90 * 86_400_000 ? 'warning' : 'success'} size="xs">{now - p.battery.lastTest > 90 * 86_400_000 ? 'Test overdue' : 'Tested'}</Chip></h4>
            <dl><dt>Voltage</dt><dd>{p.battery.volts} V</dd><dt>Capacity</dt><dd>{fmtNum(p.battery.ah)} Ah</dd><dt>Runtime</dt><dd>{p.battery.runtimeH} h</dd><dt>Last test</dt><dd>{fmtDate(p.battery.lastTest)}</dd></dl>
          </div>
          <div className="ready-card">
            <h4>UPS autonomy <Chip tone={p.ups.some(u => u.state !== 'Online') ? 'error' : 'success'} size="xs">{p.ups.some(u => u.state !== 'Online') ? 'On battery' : 'Ready'}</Chip></h4>
            <dl>{p.ups.map(u => <Fragment key={u.id}><dt>{u.name} ({u.loadPct}% load)</dt><dd className={u.state !== 'Online' ? 'bad' : ''}>{u.batteryMin} min</dd></Fragment>)}</dl>
          </div>
        </div>
      </Panel>
    </>
  );
}

function Cooling({ dc }: { dc: Datacenter }) {
  const c = dc.cooling;
  const op = c.units.filter(u => u.status === 'Operational');
  const unitCap = c.units[0]?.capacityKw || 1;
  const needed = Math.max(1, Math.ceil(c.loadKw / unitCap));
  const designOk = op.length >= needed + (c.redundancy === 'N+1' ? 1 : 0);
  const failedZones = new Set(c.units.filter(u => u.status !== 'Operational').map(u => u.zone));
  const racks = dc.racks.filter(r => failedZones.has(`${r.floor} · ${r.room}`) || r.tempC > 30).sort((a, b) => b.tempC - a.tempC);
  return (
    <>
      <div className="kpis">
        <Kpi label="Cooling capacity" value={fmtNum(c.capacityKw)} unit="kW" icon={I.Snowflake} tone="info" basis={`${c.units.length} units · design ${c.redundancy}`} />
        <Kpi label="Current load" value={fmtNum(Math.round(c.loadKw * 10) / 10)} unit="kW" icon={I.Activity} tone="purple" basis={`${Math.round((c.loadKw / c.capacityKw) * 100)}% of capacity`} />
        <Kpi label="Headroom" value={fmtNum(Math.round((c.capacityKw - c.loadKw) * 10) / 10)} unit="kW" icon={I.Gauge} tone="success" basis={`operational units carry ${fmtNum(op.reduce((a, u) => a + u.capacityKw, 0))} kW`} />
        <Kpi label="Units running" value={`${op.length}/${c.units.length}`} icon={I.Fan} tone={designOk ? 'success' : 'error'} basis={`${needed} needed for load`} />
      </div>
      <div className={`note ${designOk ? 'note--good' : 'note--bad'}`}>{designOk ? <I.CheckCircle2 size={15} /> : <I.ShieldAlert size={15} />}
        <span>{designOk ? `Redundancy intact: ${op.length} units running for a load that needs ${needed} — ${c.redundancy} holds.` : `Redundancy lost: ${op.length} unit(s) running for a load that needs ${needed}; the ${c.redundancy} design is not met in ${[...failedZones].join(', ')}. Dependent racks are listed below.`}</span></div>
      <div className="grid g-2-1">
        <Panel title="CRAC / CRAH / CDU units" count={c.units.length} icon={I.Fan} flush>
          <table className="nst-table dt-table"><thead><tr><th>Unit</th><th>Zone</th><th>Load</th><th className="is-right">Supply / return</th><th>Status</th></tr></thead>
            <tbody>{c.units.map(u => (
              <tr key={u.id}><td><span className="cell-2"><b className="mono strong">{u.name}</b><small>{u.type} · {fmtKw(u.capacityKw)}</small></span></td><td className="is-wrap">{u.zone}</td>
                <td><Meter pct={u.status === 'Failed' ? 0 : u.loadPct} width={56} /></td><td className="is-right num">{u.supplyC}° / {u.returnC}°C</td>
                <td><Chip tone={u.status === 'Operational' ? 'success' : u.status === 'Failed' ? 'error' : 'warning'} size="xs">{u.status}</Chip></td></tr>))}</tbody></table>
        </Panel>
        <Panel title="Dependent racks" sub="Racks in a zone with a unit down, or with inlet above 30°C (DC-FAC-005)" icon={I.Server} flush>
          {racks.length ? (
            <table className="nst-table dt-table"><thead><tr><th>Rack</th><th>Zone</th><th className="is-right">Inlet</th><th className="is-right">Draw</th></tr></thead>
              <tbody>{racks.map(r => <tr key={r.id}><td className="mono strong">{r.name}</td><td className="is-wrap">{r.floor} · {r.room}</td><td className={`is-right num ${r.tempC > 30 ? 'bad' : ''}`}>{r.tempC}°C</td><td className="is-right num">{fmtKw(r.drawKw)}</td></tr>)}</tbody></table>
          ) : <Empty icon={I.CheckCircle2} title="No rack depends on a failed unit" />}
        </Panel>
      </div>
    </>
  );
}

function Environment({ dc }: { dc: Datacenter }) {
  return (
    <Panel title="Environmental sensors" sub={`Thresholds: temperature ${TEMP.lo}–${TEMP.hi}°C, humidity ${HUM.lo}–${HUM.hi}% RH, smoke and water leak (DC-FAC-004)`} icon={I.Thermometer} actions={<Fresh>sensors · 1 min</Fresh>}>
      <div className="sensor-grid">
        {dc.cooling.sensors.map(s => {
          const hot = s.tempC > TEMP.hi || s.tempC < TEMP.lo, wet = s.humidity > HUM.hi || s.humidity < HUM.lo;
          const racks = dc.racks.filter(r => `${r.floor} · ${r.room}` === s.zone);
          return (
            <div key={s.id} className={`sensor${hot || s.smoke || s.leak ? ' is-hot' : ''}`}>
              <h4>{s.zone}<Chip tone={hot || s.smoke || s.leak ? 'error' : wet ? 'warning' : 'success'} size="xs">{hot ? 'Over temp' : s.smoke ? 'Smoke' : s.leak ? 'Leak' : wet ? 'Humidity' : 'Normal'}</Chip></h4>
              <div className="big" style={{ color: hot ? 'var(--vw-color-red-600)' : undefined }}>{s.tempC}<small>°C</small></div>
              <Meter pct={((s.tempC - 10) / 25) * 100} width={170} color={hot ? 'var(--vw-color-red-500)' : 'var(--vw-color-emerald-500)'} label={`max ${TEMP.hi}°C`} />
              <div className="row between" style={{ fontSize: 12.5 }}><span className="muted">Humidity</span><b className={`num ${wet ? 'warn' : ''}`}>{s.humidity}% RH</b></div>
              <div className="row between" style={{ fontSize: 12.5 }}><span className="muted">Smoke / leak</span><b>{s.smoke ? 'Detected' : 'Clear'} / {s.leak ? 'Detected' : 'Dry'}</b></div>
              <div className="row between" style={{ fontSize: 12.5 }}><span className="muted">Racks in zone</span><b className="num">{racks.length} · max inlet {racks.length ? Math.max(...racks.map(r => r.tempC)) : '—'}°C</b></div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function Maintenance({ alerts, changes }: { alerts: NonNullable<Awaited<ReturnType<typeof getAlerts>>>; changes: NonNullable<Awaited<ReturnType<typeof getChanges>>> }) {
  const nav = useNavigate();
  const now = clockNow();
  return (
    <div className="grid g-2">
      <Panel title="Facility alarms" count={alerts.length} sub="Power, cooling and environment events, with the incident each is correlated into (DC-FAC-006)" icon={I.BellRing} flush>
        {alerts.length ? (
          <table className="nst-table dt-table"><thead><tr><th>Severity</th><th>Alarm</th><th>Incident</th><th className="is-right">Raised</th></tr></thead>
            <tbody>{alerts.map(a => (
              <tr key={a.id}><td><SeverityChip s={a.severity} size="xs" /></td><td className="is-wrap"><span className="cell-2"><b className="strong">{a.title}</b><small>{a.code} · {a.description}</small></span></td>
                <td>{a.incidentId ? <IncLink id={a.incidentId} /> : <span className="faint">not correlated</span>}</td><td className="is-right num">{fmtAgo(a.start, now)}</td></tr>))}</tbody></table>
        ) : <Empty icon={I.CheckCircle2} title="No active facility alarms" />}
      </Panel>
      <Panel title="Maintenance schedule" count={changes.length} sub="Inspections and tests for generators, batteries, UPS, cooling and safety systems (DC-FAC-007)" icon={I.CalendarClock} flush
        actions={<Btn size="xs" icon={I.ArrowRight} onClick={() => nav('/changes')}>Changes</Btn>}>
        {changes.length ? (
          <table className="nst-table dt-table"><thead><tr><th>Window</th><th>Maintenance</th><th>Risk</th><th>Status</th></tr></thead>
            <tbody>{changes.map(c => (
              <tr key={c.id} className="is-click" onClick={() => nav(`/changes?id=${c.id}`)}><td className="num nowrap">{fmtDateTime(c.windowStart)}</td><td className="is-wrap"><span className="cell-2"><b className="strong">{c.title}</b><small className="mono">{c.id} · {c.requester}{c.approver ? ` · approved by ${c.approver}` : ''}</small></span></td>
                <td><Chip tone={c.risk === 'High' ? 'error' : c.risk === 'Medium' ? 'warning' : 'neutral'} size="xs">{c.risk}</Chip></td><td><ChangeChip s={c.status} size="xs" /></td></tr>))}</tbody></table>
        ) : <Empty icon={I.CalendarClock} title="No maintenance scheduled for this site" />}
      </Panel>
    </div>
  );
}
