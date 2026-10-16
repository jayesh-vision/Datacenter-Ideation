import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow } from '../../api';
import { Panel, Chip, Info } from '../../ui/kit';
import { Meter, Legend } from '../../ui/status';
import { TimeChart } from '../../charts/TimeChart';
import { Donut } from '../../charts/Donut';
import { fmtAgo, fmtNum } from '../../lib/format';
import { utilColor } from '../../lib/vocab';
import type { SiteData } from './Site';
import { SHOW_DUPLICATES } from './dedupe';
import { FacilityNote } from './Metrics';

const SPLIT_COLORS = ['var(--primaryColor500)', 'var(--vw-color-cyan-500)', 'var(--vw-color-slate-400)'];
const PORT_COLOR: Record<string, string> = { '1G copper': 'var(--vw-color-emerald-500)', '10G SFP+': 'var(--vw-color-amber-500)', '100G QSFP28': 'var(--primaryColor500)', '400G OSFP': 'var(--vw-color-indigo-500)', 'Optical (ODF)': 'var(--vw-color-purple-500)' };

/* INV-02 — power chain, rack space, ports, building and cooling for one site
   (DC-SITE-002…007). */
export function Details({ data }: { data: SiteData }) {
  const { dc, summary: s } = data;
  const now = clockNow();
  const p = dc.power;
  const used = s.powerKw;
  const pct = p.capacityKw ? (used / p.capacityKw) * 100 : 0;
  const uPct = s.rackTotalU ? (s.rackUsedU / s.rackTotalU) * 100 : 0;
  const portPct = s.portsTotal ? (s.portsUsed / s.portsTotal) * 100 : 0;
  const rooms = dc.floors.reduce((a, f) => a + f.rooms.length, 0);
  const hourLabels = p.load24h.map((_, i) => { const h = (new Date(now).getHours() - 23 + i + 24) % 24; return i === 23 ? 'now' : `${String(h).padStart(2, '0')}:00`; });
  const feedTotal = p.feeds.reduce((a, f) => a + f.loadKw, 0);
  const feedCap = p.feeds.reduce((a, f) => a + f.capacityKw, 0);
  const upsKw = p.ups.reduce((a, u) => a + u.capacityKw, 0);
  const cool = dc.cooling;
  const coolPct = cool.capacityKw ? (cool.loadKw / cool.capacityKw) * 100 : 0;
  const byFloor = dc.floors.map(f => {
    const rk = dc.racks.filter(r => r.floor === f.name);
    return { ...f, racks: rk.length, used: rk.reduce((a, r) => a + r.usedU, 0), total: rk.reduce((a, r) => a + r.heightU, 0), kw: rk.reduce((a, r) => a + r.drawKw, 0) };
  });
  const live = dc.status !== 'planned';

  return (
    <div className="col" style={{ gap: 16 }}>
      {!SHOW_DUPLICATES && <FacilityNote dcId={dc.id} what="Power feeds, the 24-hour load, backup (UPS, battery, DG) and cooling for this site" />}
      <div className={`grid ${SHOW_DUPLICATES ? 'g-4' : 'g-3'}`}>
        {SHOW_DUPLICATES && <div className="card cap-card" style={{ '--cc': 'var(--vw-color-orange-400)' } as React.CSSProperties}>
          <span className="cap-l">Power in use<Info text="Facility power drawn right now against the site's installed capacity, split into the AC mains and the −48 V DC plant. Headroom = capacity minus the recorded peak load." /></span>
          <span className="cap-v">{used}<small>kW</small></span>
          <span className="cap-s">of {fmtNum(p.capacityKw)} kW capacity · {Math.round(pct)}%</span>
          <span className="stackbar" style={{ height: 6 }}><i style={{ width: `${(p.acKw / p.capacityKw) * 100}%`, background: 'var(--vw-color-orange-400)' }} /><i style={{ width: `${(p.dcKw / p.capacityKw) * 100}%`, background: 'var(--vw-color-sky-500)' }} /></span>
          <Legend items={[{ label: `${p.acKw} ac`, color: 'var(--vw-color-orange-400)' }, { label: `${p.dcKw} dc`, color: 'var(--vw-color-sky-500)' }]} />
          <span className="cap-good"><I.TrendingUp size={13} />{Math.round((p.capacityKw - p.peakKw) * 10) / 10} kW headroom · peak {p.peakKw} kW</span>
        </div>}
        <div className="card cap-card" style={{ '--cc': 'var(--vw-color-emerald-500)' } as React.CSSProperties}>
          <span className="cap-l">Rack space<Info text="Rack units occupied by installed and planned equipment out of the total U across every rack at the site. Empty racks are counted as reserved for growth." /></span>
          <span className="cap-v">{s.rackUsedU}<small>U</small></span>
          <span className="cap-s">of {s.rackTotalU} U in {dc.racks.length} racks · {Math.round(uPct)}%</span>
          <span className="bar"><i style={{ width: `${uPct}%`, background: 'var(--vw-color-emerald-500)' }} /></span>
          <Legend items={[{ label: `${s.rackUsedU} used`, color: 'var(--vw-color-emerald-500)' }, { label: `${s.rackTotalU - s.rackUsedU} free`, color: 'var(--vw-color-slate-200)' }]} />
          <span className="cap-s">{dc.racks.filter(r => r.usedU === 0).length} empty rack{dc.racks.filter(r => r.usedU === 0).length === 1 ? '' : 's'} reserved for growth</span>
        </div>
        <div className="card cap-card" style={{ '--cc': 'var(--primaryColor500)' } as React.CSSProperties}>
          <span className="cap-l">Ports<Info text="Ports on installed equipment that are patched or in use out of all ports at the site, with the fill of each port class (1G copper, 10G, 100G, 400G, optical) underneath." /></span>
          <span className="cap-v">{fmtNum(s.portsUsed)}<small>in use</small></span>
          <span className="cap-s">of {fmtNum(s.portsTotal)} ports · {Math.round(portPct)}%</span>
          <span className="bar"><i style={{ width: `${portPct}%`, background: 'var(--primaryColor500)' }} /></span>
          <Legend items={[{ label: `${fmtNum(s.portsUsed)} used`, color: 'var(--primaryColor500)' }, { label: `${fmtNum(s.portsTotal - s.portsUsed)} free`, color: 'var(--vw-color-slate-200)' }]} />
          <span className="cap-s">{dc.ports.map(c => `${c.cls} ${Math.round((c.used / c.total) * 100)}%`).join(' · ')}</span>
        </div>
        <div className="card cap-card" style={{ '--cc': 'var(--vw-color-purple-500)' } as React.CSSProperties}>
          <span className="cap-l">Building<Info text="The physical shell and plant: number of racks, floors and rooms, UPS count, diesel generator rating, battery autonomy, PUE (total facility power ÷ IT power) and the cooling redundancy level." /></span>
          <span className="cap-v">{dc.racks.length}<small>racks</small></span>
          <span className="cap-s">{dc.floors.length} floors · {rooms} rooms</span>
          {SHOW_DUPLICATES ? <>
          <span className="cap-s" style={{ marginTop: 'auto' }}>{p.ups.length} UPS · DG {p.dg.kva} kVA · battery {p.battery.runtimeH} h</span>
          <span className="cap-s">PUE <b className="num strong">{p.pue}</b> · cooling {cool.redundancy}</span></>
            : <span className="cap-s" style={{ marginTop: 'auto' }}>{byFloor.filter(f => f.racks).length} floor{byFloor.filter(f => f.racks).length === 1 ? '' : 's'} with racks · {dc.racks.filter(r => r.usedU > 0).length} racks in use</span>}
        </div>
      </div>

      {SHOW_DUPLICATES && <div className="grid g-2-1">
        <Panel title="Power" sub={`AC mains 415 V 3-phase · DC −48 V plant`} flush info="Every power feed into the site with its source, rating, present load and utilisation (load ÷ feed capacity); a healthy feed carrying no load reads Standby. The chart is hourly facility load over the last 24 hours.">
          <table className="nst-table site-table">
            <thead><tr><th>Feed</th><th>Type</th><th>Source</th><th>Rating</th><th className="is-right">Load</th><th>Utilisation</th><th>Status</th></tr></thead>
            <tbody>
              {p.feeds.map(f => (
                <tr key={f.id}><td className="mono strong nowrap">{f.id}</td><td><Chip tone={f.type === 'AC' ? 'warning' : 'info'} size="xs">{f.type}</Chip></td><td>{f.source}</td><td className="mono nowrap">{f.rating}</td><td className="is-right num nowrap">{f.loadKw} kW</td>
                  <td><Meter pct={f.capacityKw ? (f.loadKw / f.capacityKw) * 100 : 0} /></td><td><Chip tone={f.status === 'Normal' ? 'success' : f.status === 'Warning' ? 'warning' : 'error'} size="xs">{f.status === 'Normal' && f.loadKw === 0 ? 'Standby' : f.status}</Chip></td></tr>
              ))}
              <tr className="row-total"><td colSpan={4}>All feeds</td><td className="is-right num nowrap">{Math.round(feedTotal * 10) / 10} kW</td><td><Meter pct={feedCap ? (feedTotal / feedCap) * 100 : 0} /></td><td /></tr>
            </tbody>
          </table>
          <div className="site-chart">
            <div className="row between"><b className="strong" style={{ fontWeight: 500 }}>Load, last 24 hours</b><span className="faint" style={{ fontSize: 12 }}>hourly · peak {p.peakKw} kW · capacity {fmtNum(p.capacityKw)} kW</span></div>
            {live ? <TimeChart height={240} labels={hourLabels} legend={false} yMin={0} format={v => `${v.toFixed(1)} kW`} series={[{ key: 'load', label: 'Facility load', color: '#1C81EF', kind: 'area', values: p.load24h }]} />
              : <div className="faint" style={{ padding: 24, textAlign: 'center' }}>No telemetry — site is planned.</div>}
          </div>
        </Panel>
        <Panel title="Where the power goes" sub="now" info="How the kW in use splits between IT load, cooling and other facility load, then the backup that takes over if a feed drops: DG set runtime and fuel, battery bank runtime, and each UPS with its load and minutes of autonomy." actions={<Link to={`/facilities?dc=${dc.id}`} className="panel-link">Facilities<I.ChevronRight size={14} /></Link>}>
          <Donut size={150} centerValue={`${used}`} centerLabel="kW in use" format={v => `${v} kW`} slices={p.split.map((x, i) => ({ key: x.label, label: x.label, value: x.kw, color: SPLIT_COLORS[i] }))} />
          <div className="site-sub-h"><b>Backup</b><span className="faint">if a feed drops</span></div>
          <div className="backup-row"><span className="cell-2"><b>DG set</b><small className="mono">{p.dg.kva} kVA · fuel {p.dg.fuelPct}%</small></span><span className="num">{p.dg.runtimeH} h</span><Chip tone={p.dg.result === 'Pass' ? 'success' : 'error'} size="xs">Test {p.dg.result.toLowerCase()} · {fmtAgo(p.dg.lastTest, now)}</Chip></div>
          <div className="backup-row"><span className="cell-2"><b>Battery bank</b><small className="mono">{p.battery.volts} V · {fmtNum(p.battery.ah)} Ah</small></span><span className="num">{p.battery.runtimeH} h</span><Chip tone="success" size="xs">Tested {fmtAgo(p.battery.lastTest, now)}</Chip></div>
          {p.ups.map(u => (
            <div key={u.id} className="backup-row"><span className="cell-2"><b>{u.name}</b><small className="mono">{fmtNum(u.capacityKw)} kW · {u.redundancy}</small></span><span className="num">{u.loadPct}% · {u.batteryMin} min</span><Chip tone={u.state === 'Online' ? 'success' : u.state === 'On battery' ? 'error' : 'warning'} size="xs">{u.state}</Chip></div>
          ))}
          <div className="row between faint" style={{ fontSize: 12, marginTop: 10 }}><span>PUE <b className="num strong">{p.pue}</b> · UPS {fmtNum(upsKw)} kW installed</span><span>AC {p.acKw} kW · DC {p.dcKw} kW</span></div>
        </Panel>
      </div>}

      <div className="grid site-g-racks">
        <Panel title="Floors, rooms and racks" sub={`${dc.floors.length} floors · ${rooms} rooms · ${dc.racks.length} racks`} flush info="Every rack with its floor and room, U-space used, power draw and inlet temperature. Draw turns red at 85% of the rack's power budget, inlet above 27°C. The By floor cards roll the same racks up per floor.">
          <table className="nst-table site-table">
            <thead><tr><th>Rack</th><th>Floor · room</th><th>U-space used</th><th className="is-right">Draw</th><th className="is-right">Inlet</th></tr></thead>
            <tbody>
              {dc.racks.map(r => (
                <tr key={r.id}><td className="mono strong nowrap">{r.name}</td><td><span className="cell-2"><span className="nowrap">{r.floor} · {r.room}</span><small>{r.role}</small></span></td><td><Meter pct={(r.usedU / r.heightU) * 100} width={44} color={utilColor((r.usedU / r.heightU) * 100)} label={`${r.usedU} / ${r.heightU} U`} /></td>
                  <td className="is-right num nowrap" style={{ color: r.drawKw / r.budgetKw >= 0.85 ? 'var(--vw-color-red-600)' : undefined }} title={`Budget ${r.budgetKw} kW`}>{r.drawKw} kW</td>
                  <td className="is-right num" style={{ color: r.tempC > 27 ? 'var(--vw-color-red-600)' : undefined }}>{r.tempC}°C</td></tr>
              ))}
              <tr className="row-total"><td colSpan={2}>All racks</td><td><Meter pct={uPct} width={44} label={`${s.rackUsedU} / ${s.rackTotalU} U`} /></td><td className="is-right num">{Math.round(dc.racks.reduce((a, r) => a + r.drawKw, 0) * 10) / 10} kW</td><td /></tr>
            </tbody>
          </table>
          <div className="site-floors">
            <div className="site-sub-h"><b>By floor</b></div>
            <div className="grid g-2" style={{ gap: 12 }}>
              {byFloor.map(f => (
                <div key={f.name} className="floor-card">
                  <div className="row between"><b>{f.name}</b><span className="faint">{f.rooms.length} room{f.rooms.length === 1 ? '' : 's'} · {f.racks} racks</span></div>
                  <span className="faint" style={{ fontSize: 12.5 }}>{f.rooms.join(' · ')}</span>
                  <div className="row" style={{ gap: 10 }}><span className="bar" style={{ flex: 1, height: 6 }}><i style={{ width: `${f.total ? (f.used / f.total) * 100 : 0}%`, background: utilColor(f.total ? (f.used / f.total) * 100 : 0) }} /></span><span className="num" style={{ fontSize: 12.5 }}>{f.used} / {f.total} U</span></div>
                  <span className="faint" style={{ fontSize: 12.5 }}>{Math.round(f.kw * 10) / 10} kW draw</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
        <div className="col" style={{ gap: 16 }}>
          <Panel title="Ports" sub={`${fmtNum(s.portsTotal - s.portsUsed)} free of ${fmtNum(s.portsTotal)}`} flush info="Port capacity by class (total, used, free and fill), then the same per rack for racks holding active equipment. Fill = used ÷ total.">
            <table className="nst-table site-table">
              <thead><tr><th>Port class</th><th className="is-right">Total</th><th className="is-right">Used</th><th className="is-right">Free</th><th>Fill</th></tr></thead>
              <tbody>{dc.ports.map(c => <tr key={c.cls}><td><span className="row nowrap" style={{ gap: 8 }}><i className="site-dot" style={{ background: PORT_COLOR[c.cls] }} />{c.cls}</span></td><td className="is-right num">{fmtNum(c.total)}</td><td className="is-right num">{fmtNum(c.used)}</td><td className="is-right num">{fmtNum(c.total - c.used)}</td><td><Meter pct={(c.used / c.total) * 100} width={48} /></td></tr>)}</tbody>
            </table>
            <div className="site-sub-h" style={{ padding: '14px 18px 6px' }}><b>By rack</b><span className="faint">active-equipment ports</span></div>
            <table className="nst-table site-table">
              <thead><tr><th>Rack</th><th className="is-right">Ports</th><th className="is-right">Used</th><th>Fill</th></tr></thead>
              <tbody>{dc.racks.filter(r => r.ports > 0).map(r => <tr key={r.id}><td className="mono">{r.name}</td><td className="is-right num">{fmtNum(r.ports)}</td><td className="is-right num">{fmtNum(r.portsUsed)}</td><td><Meter pct={(r.portsUsed / r.ports) * 100} width={48} /></td></tr>)}</tbody>
            </table>
          </Panel>
          {SHOW_DUPLICATES && <Panel title="Cooling" sub={`${cool.redundancy} · ${cool.units.length} units`} info="Heat load being removed against installed cooling capacity, each cooling unit with its load share or fault state (hover for zone and supply / return temperatures), and the current temperature and humidity of every zone." actions={<Link to={`/facilities?dc=${dc.id}&tab=cooling`} className="panel-link">Cooling detail<I.ChevronRight size={14} /></Link>}>
            <div className="row between" style={{ marginBottom: 8 }}><span className="num"><b className="strong" style={{ fontSize: 18 }}>{cool.loadKw}</b> <span className="faint">of {fmtNum(cool.capacityKw)} kW</span></span><Meter pct={coolPct} width={120} /></div>
            <div className="unit-grid">
              {cool.units.map(u => (
                <span key={u.id} className={`unit-pill is-${u.status.toLowerCase()}`} title={`${u.zone} · supply ${u.supplyC}°C / return ${u.returnC}°C`}>{u.name}<small>{u.status === 'Operational' ? `${u.loadPct}%` : u.status}</small></span>
              ))}
            </div>
            <div className="faint" style={{ fontSize: 12, marginTop: 10 }}>{cool.sensors.map(x => `${x.zone} ${x.tempC}°C / ${x.humidity}%`).join(' · ')}</div>
          </Panel>}
        </div>
      </div>
    </div>
  );
}
