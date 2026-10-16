import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FacilityStrip, type FacilityTab } from '../Facilities';
import * as I from 'lucide-react';
import { clockNow, getNetworkElements, useQuery } from '../../api';
import { Info, Panel } from '../../ui/kit';
import { Meter, NeLink } from '../../ui/status';
import { Sparkline } from '../../charts/Sparkline';
import { fmtAgo, fmtNum } from '../../lib/format';
import type { SiteData } from './Site';
import { SHOW_DUPLICATES } from './dedupe';

const BAD = 'var(--vw-color-red-500)', WARN = 'var(--vw-color-amber-500)', ACCENT = 'var(--primaryColor500)';
const TEMP_LIMIT = 27, HUM = [40, 60] as const;
const FAC_SUB: Record<FacilityTab, string> = { power: 'fpower', cooling: 'fcooling', environment: 'fenv', resilience: 'fspof', maintenance: 'fmaint' };
const FAULT_ROWS = 5; // same row count as Device load beside it
/* vitals the Facilities screen does not show (averages + 24 h trends, diesel in litres); the rest are hidden as duplicates */
/* with duplicates hidden: zone temperature + humidity trends, rack inlet, hottest chassis (Facilities shows none of them) */
const r1 = (n: number) => Math.round(n * 10) / 10;
/* deterministic diurnal history ending at the current reading (mock telemetry) */
const diurnal = (now: number, amp: number, seed: number) => Array.from({ length: 24 }, (_, h) => r1(now + amp * Math.sin(((h - 23) / 24) * Math.PI * 2 + seed) - amp * Math.sin(seed)));

/* Site metrics — the aggregated physical telemetry of one datacenter:
   thermal, humidity, power, cooling, backup (battery + diesel) and
   hardware fault indicators (fans, PSUs, module fault LEDs). */
export function Metrics({ data }: { data: SiteData }) {
  const { dc, summary: s } = data;
  const now = clockNow();
  const { data: nes } = useQuery(() => getNetworkElements({ dcId: dc.id }), [dc.id]);
  const [allFaults, setAllFaults] = useState(false);
  const nav = useNavigate();

  const m = useMemo(() => {
    const live = (nes ?? []).filter(n => n.opsState === 'in-service');
    const zones = dc.cooling.sensors;
    const zoneAvg = zones.length ? zones.reduce((a, z) => a + z.tempC, 0) / zones.length : 0;
    const zoneMax = zones.length ? Math.max(...zones.map(z => z.tempC)) : 0;
    const humAvg = zones.length ? zones.reduce((a, z) => a + z.humidity, 0) / zones.length : 0;
    const racks = dc.racks.filter(r => r.usedU > 0);
    const inlet = racks.map(r => r.tempC);
    const mods = live.flatMap(n => n.modules.map(md => ({ ...md, ne: n })));
    const fans = mods.filter(md => /^FAN/.test(md.slot));
    const psus = mods.filter(md => /^(PSU|PEM)/.test(md.slot));
    const faults = mods.filter(md => md.state === 'Fault');
    const ledRed = live.filter(n => n.health === 'critical' || faults.some(f => f.ne.id === n.id));
    const kwNow = dc.power.load24h[23] ?? s.powerKw;
    const coolPct = dc.cooling.capacityKw ? (dc.cooling.loadKw / dc.cooling.capacityKw) * 100 : 0;
    const upsMin = dc.power.ups.length ? Math.min(...dc.power.ups.map(u => u.batteryMin)) : 0;
    /* diesel: tank sized from DG rating; burn ≈ 0.2 L per kVA-hour at 75 % load (estimate, not a recorded field) */
    const tankL = Math.round((dc.power.dg.kva * 3.2) / 50) * 50;
    const fuelL = Math.round((tankL * dc.power.dg.fuelPct) / 100);
    const burnLh = r1(dc.power.dg.kva * 0.75 * 0.2);
    const runH30 = dc.power.ups.some(u => u.state === 'On battery') ? 0 : 1.5;
    const usedL30 = Math.round(burnLh * runH30);
    const cpuAvg = live.length ? live.reduce((a, n) => a + n.cpu, 0) / live.length : 0;
    const memAvg = live.length ? live.reduce((a, n) => a + n.mem, 0) / live.length : 0;
    const devTempMax = live.length ? Math.max(...live.map(n => n.tempC)) : 0;
    const hotNe = live.length ? live.reduce((a, n) => (n.tempC > a.tempC ? n : a)) : undefined;
    return {
      hotNe, live, zones, zoneAvg, zoneMax, humAvg, racks, inlet, fans, psus, faults, ledRed, kwNow, coolPct, upsMin, tankL, fuelL, burnLh, runH30, usedL30, cpuAvg, memAvg, devTempMax,
      hotRacks: [...racks].sort((a, b) => b.tempC - a.tempC).slice(0, 5),
      topCpu: [...live].sort((a, b) => b.cpu - a.cpu).slice(0, 5),
      tTemp: diurnal(r1(zoneAvg), 0.6, 0.7), tHum: diurnal(r1(humAvg), 2, 1.9), tPower: dc.power.load24h.map(r1),
      tCool: dc.power.load24h.map(v => r1((v / Math.max(1, kwNow)) * coolPct))
    };
  }, [nes, dc, s.powerKw]);

  const vitals = [
    { k: 'temp', l: 'Avg zone temperature', v: `${r1(m.zoneAvg)}°C`, note: `max ${m.zoneMax}°C / ${TEMP_LIMIT}°C`, bad: m.zoneMax > TEMP_LIMIT, t: m.tTemp,
      info: `Mean of the zone temperature sensors across the site, with the hottest zone against the ${TEMP_LIMIT}°C limit; red when any zone is above it. The sparkline is the last 24 hours.` },
    { k: 'hum', l: 'Humidity', v: `${Math.round(m.humAvg)}%`, note: `band ${HUM[0]}–${HUM[1]}% RH`, bad: m.humAvg < HUM[0] || m.humAvg > HUM[1], t: m.tHum,
      info: `Mean relative humidity across the zone sensors; red when the average leaves the ${HUM[0]}–${HUM[1]}% RH safe band (static risk below, condensation risk above). Sparkline = last 24 hours.` },
    { k: 'pwr', l: 'IT + facility load', v: `${fmtNum(Math.round(m.kwNow))} kW`, note: `of ${fmtNum(dc.power.capacityKw)} kW · PUE ${dc.power.pue.toFixed(2)}`, bad: m.kwNow / dc.power.capacityKw >= 0.85, t: m.tPower,
      info: 'Total facility power drawn now (IT plus cooling and plant) against installed capacity; red at 85% or more. PUE = total facility power ÷ IT power. Sparkline = hourly load over the last 24 hours.' },
    { k: 'cool', l: 'Cooling load', v: `${Math.round(m.coolPct)}%`, note: `${dc.cooling.units.filter(u => u.status === 'Operational').length}/${dc.cooling.units.length} units · ${dc.cooling.redundancy}`, bad: m.coolPct >= 85 || dc.cooling.units.some(u => u.status === 'Failed'), t: m.tCool,
      info: 'Heat load being removed as a share of installed cooling capacity, with operational units out of all units and the redundancy level. Red at 85% or more, or when any unit has failed. Sparkline follows the 24 h power load.' },
    { k: 'bat', l: 'Battery backup', v: `${dc.power.battery.runtimeH} h`, note: `UPS autonomy ≥ ${m.upsMin} min`, bad: dc.power.ups.some(u => u.state === 'On battery'),
      info: 'Hours the battery bank can carry the site if mains and generator both fail, and the shortest UPS autonomy at present load. Red while any UPS is running on battery.' },
    { k: 'dsl', l: 'Diesel in tank', v: `${fmtNum(m.fuelL)} L`, note: `${dc.power.dg.fuelPct}% · ${dc.power.dg.runtimeH} h runtime`, bad: dc.power.dg.fuelPct < 40,
      info: 'Litres of diesel in the generator tank, estimated from the tank size (sized to the DG rating) and the fuel level reading, with the runtime that fuel gives at rated load. Red under 40%.' }
  ];

  const inletAvg = m.inlet.length ? r1(m.inlet.reduce((a, b) => a + b, 0) / m.inlet.length) : 0;
  const inletMax = m.inlet.length ? Math.max(...m.inlet) : 0;
  const leanVitals = [
    vitals[0], vitals[1],
    { k: 'inlet', l: 'Rack inlet', v: m.inlet.length ? `${inletAvg}°C` : '—', note: m.inlet.length ? `avg · range ${Math.min(...m.inlet)}–${inletMax}°C` : 'no inlet probes', bad: inletMax > TEMP_LIMIT, t: undefined as number[] | undefined,
      info: `Average inlet temperature across the ${m.racks.length} racks with equipment, and the coolest to hottest rack; red when any rack is above ${TEMP_LIMIT}°C.` },
    { k: 'chassis', l: 'Hottest device', v: m.hotNe ? `${m.hotNe.tempC}°C` : '—', note: m.hotNe ? m.hotNe.id.replace(`${dc.id}-`, '') + ' · chassis' : 'no monitored devices', bad: (m.hotNe?.tempC ?? 0) >= 55, t: undefined as number[] | undefined,
      info: 'The highest chassis temperature reported by any in-service device at the site, and which device; red at 55°C or more.' }
  ];

  return (
    <div className="col mx" style={{ gap: 16 }}>
      {/* the Facilities summary strip (user, 16-Oct-2026: "merge these KPI cards into Metrics"); each tile opens its Facility sub tab */}
      <FacilityStrip dcId={dc.id} onTab={t => nav(`/datacenters/${dc.id}?tab=${FAC_SUB[t]}`)} />
      {SHOW_DUPLICATES && <>
      <section className="vw-card-section mx-vitals">
        {vitals.map(x => (
          <div key={x.k} className="mx-vital">
            <span className="vw-card-metric-label">{x.l}<Info text={x.info} /></span>
            <span className="mx-vital-row">
              <span className="vw-card-metric-lg">{x.v}</span>
              {x.t && <span className="mx-spark"><Sparkline values={x.t} color={x.bad ? BAD : ACCENT} height={28} /></span>}
            </span>
            <span className={`vw-card-variance ${x.bad ? 'is-negative' : 'is-neutral'} mx-note`}>{x.note}{x.t ? ' · 24 h' : ''}</span>
          </div>
        ))}
      </section>

      <div className="grid g-2 mx-row">
        <Panel title="Thermal & environment" icon={I.Thermometer} sub={`${m.zones.length} zone sensors · ${m.racks.length} racks with inlet probes`} info={`Average rack inlet temperature and range, the hottest device chassis (red at 55°C+), smoke / leak detection, then each zone's temperature (red above ${TEMP_LIMIT}°C, amber above 25.5°C) and humidity, and the 5 hottest racks.`} actions={<Link to={`/datacenters/${dc.id}?tab=fenv`} className="panel-link">Environment<I.ChevronRight size={14} /></Link>}>
          <div className="mx-stats">
            <Stat l="Rack inlet avg" v={m.inlet.length ? `${r1(m.inlet.reduce((a, b) => a + b, 0) / m.inlet.length)}°C` : '—'} sub={m.inlet.length ? `range ${Math.min(...m.inlet)}–${Math.max(...m.inlet)}°C` : undefined} />
            <Stat l="Hottest device chassis" v={`${m.devTempMax}°C`} bad={m.devTempMax >= 55} />
            {SHOW_DUPLICATES && <Stat l="Smoke / leak" v={m.zones.some(z => z.smoke || z.leak) ? 'Detected' : 'Clear'} bad={m.zones.some(z => z.smoke || z.leak)} />}
          </div>
          {SHOW_DUPLICATES && <table className="nst-table mx-table">
            <thead><tr><th>Zone</th><th>Temperature</th><th className="is-right">Humidity</th></tr></thead>
            <tbody>{m.zones.map(z => (
              <tr key={z.id}><td>{z.zone}</td><td><Meter pct={(z.tempC / 35) * 100} color={z.tempC > TEMP_LIMIT ? BAD : z.tempC > 25.5 ? WARN : ACCENT} width={90} label={`${z.tempC}°C`} /></td><td className="is-right num">{z.humidity}%</td></tr>
            ))}</tbody>
          </table>}
          <div className="mx-sub">Hottest racks</div>
          <div className="mx-chips">{m.hotRacks.map(r => <span key={r.id} className={`vw-chip ${r.tempC > TEMP_LIMIT ? 'vw-chip--error' : 'vw-chip--neutral'} cmd-chip`}>{r.name} · {r.tempC}°C</span>)}</div>
        </Panel>

        <Panel title={SHOW_DUPLICATES ? 'Power & backup' : 'Diesel'} icon={SHOW_DUPLICATES ? I.BatteryCharging : I.Fuel} sub={SHOW_DUPLICATES ? 'UPS autonomy, battery bank and diesel generator' : 'Fuel in litres, burn rate and last 30 days of generator use (estimated)'} info="Each UPS with load, minutes of autonomy and state (red when not online), the battery bank and DG with their last tests, and diesel as litres in tank out of tank size. Burn rate and 30-day usage are estimates (≈0.2 L per kVA-hour at 75% load)." actions={<Link to={`/datacenters/${dc.id}?tab=fpower`} className="panel-link">Power chain<I.ChevronRight size={14} /></Link>}>
          {SHOW_DUPLICATES && <><table className="nst-table mx-table">
            <thead><tr><th>UPS</th><th>Load</th><th className="is-right">Autonomy</th><th className="is-right">State</th></tr></thead>
            <tbody>{dc.power.ups.map(u => (
              <tr key={u.id}><td>{u.name} <span className="faint">· {u.redundancy}</span></td><td><Meter pct={u.loadPct} width={80} /></td><td className="is-right num">{u.batteryMin} min</td>
                <td className="is-right"><span className={`vw-chip ${u.state === 'Online' ? 'vw-chip--neutral' : 'vw-chip--error'} cmd-chip`}>{u.state}</span></td></tr>
            ))}</tbody>
          </table>
          <div className="mx-stats mx-stats-2">
            <Stat l="Battery bank" v={`${dc.power.battery.volts} V · ${fmtNum(dc.power.battery.ah)} Ah`} sub={`${dc.power.battery.runtimeH} h runtime · tested ${fmtAgo(dc.power.battery.lastTest, now)}`} />
            <Stat l="DG set" v={`${dc.power.dg.kva} kVA · ${dc.power.dg.result}`} sub={`last test ${fmtAgo(dc.power.dg.lastTest, now)}`} bad={dc.power.dg.result !== 'Pass'} />
          </div>
          <div className="mx-sub">Diesel</div></>}
          <div className="mx-fuel">
            <Meter pct={dc.power.dg.fuelPct} width={160} color={dc.power.dg.fuelPct < 40 ? BAD : dc.power.dg.fuelPct < 60 ? WARN : ACCENT} label={`${fmtNum(m.fuelL)} / ${fmtNum(m.tankL)} L`} />
            <span className="vw-label">burn ≈ {m.burnLh} L/h at 75% load · used last 30 d ≈ {fmtNum(m.usedL30)} L ({m.runH30} run-h) · estimated</span>
          </div>
        </Panel>
      </div>

      </>}

      {!SHOW_DUPLICATES && <>
      <section className="vw-card-section mx-vitals is-4">
        {leanVitals.map(x => (
          <div key={x.k} className="mx-vital">
            <span className="vw-card-metric-label">{x.l}<Info text={x.info} /></span>
            <span className="mx-vital-row">
              <span className={`vw-card-metric-lg${x.bad ? ' is-bad' : ''}`}>{x.v}</span>
              {x.t && <span className="mx-spark"><Sparkline values={x.t} color={x.bad ? BAD : ACCENT} height={28} /></span>}
            </span>
            <span className={`vw-card-variance ${x.bad ? 'is-negative' : 'is-neutral'} mx-note`} title={x.note}>{x.note}</span>
          </div>
        ))}
      </section>

      <div className="grid g-2 mx-row">
        <Panel title="Hottest racks" icon={I.Thermometer} sub={`Highest inlet temperature of ${m.racks.length} racks with probes · limit ${TEMP_LIMIT}°C`} flush
          info={`The five racks with the highest inlet temperature, with their room and power draw. Red above ${TEMP_LIMIT}°C, amber above 25.5°C. The zone cards and every rack's inlet are on Facilities.`}
          actions={<Link to={`/datacenters/${dc.id}?tab=fenv`} className="panel-link">Environment<I.ChevronRight size={14} /></Link>}>
          <table className="nst-table mx-table">
            <thead><tr><th>Rack</th><th>Floor · room</th><th>Inlet</th><th className="is-right">Draw</th></tr></thead>
            <tbody>{m.hotRacks.map(r => (
              <tr key={r.id}><td className="strong">{r.name}</td><td>{r.floor} · {r.room}</td>
                <td><Meter pct={(r.tempC / 35) * 100} color={r.tempC > TEMP_LIMIT ? BAD : r.tempC > 25.5 ? WARN : ACCENT} width={90} label={`${r.tempC}°C`} /></td>
                <td className="is-right num">{r.drawKw} kW</td></tr>
            ))}</tbody>
          </table>
        </Panel>

        <Panel title="Diesel" icon={I.Fuel} sub={`DG set ${fmtNum(dc.power.dg.kva)} kVA · litres are estimated from the tank size and fuel level`}
          info="Litres of diesel in the generator tank (tank sized to the DG rating) from the fuel-level reading, the runtime that gives at rated load, the burn rate at 75% load (≈0.2 L per kVA-hour) and the generator's use over the last 30 days. Fuel % and runtime alone are also on Facilities."
          actions={<Link to={`/datacenters/${dc.id}?tab=fpower`} className="panel-link">Power chain<I.ChevronRight size={14} /></Link>}>
          <div className="mx-fuel-head">
            <span className="vw-card-metric-lg">{fmtNum(m.fuelL)}<small> L</small></span>
            <span className="vw-label">of {fmtNum(m.tankL)} L tank · {dc.power.dg.fuelPct}%</span>
          </div>
          <span className="mx-fuel-bar"><i style={{ width: `${dc.power.dg.fuelPct}%`, background: dc.power.dg.fuelPct < 40 ? BAD : dc.power.dg.fuelPct < 60 ? WARN : ACCENT }} /></span>
          <div className="mx-stats mx-stats-3">
            <Stat l="Runtime" v={`${dc.power.dg.runtimeH} h`} sub="at rated load" bad={dc.power.dg.runtimeH < 8} />
            <Stat l="Burn rate" v={`${m.burnLh} L/h`} sub="at 75% load" />
            <Stat l="Used last 30 d" v={`${fmtNum(m.usedL30)} L`} sub={`${m.runH30} run-hours`} />
          </div>
          <p className="vw-label mx-fuel-note"><I.Info size={13} />Reorder below 60% ({fmtNum(Math.round(m.tankL * 0.6))} L) · critical below 40% ({fmtNum(Math.round(m.tankL * 0.4))} L){dc.power.dg.fuelPct >= 60 ? ` · ${fmtNum(m.fuelL - Math.round(m.tankL * 0.6))} L above the reorder level` : ''}</p>
        </Panel>
      </div>
      </>}

      <div className="grid g-2 mx-row">
        <Panel title="Hardware fault indicators" icon={I.CircleAlert} sub={`${m.live.length} monitored devices · fans, power supplies and module fault LEDs`} info="Across in-service devices here: fan and PSU modules reporting OK out of all of them, modules with a lit fault LED, and devices showing red (critical health or a faulted module). The table lists each faulted module.">
          <div className="mx-stats mx-stats-4">
            <Stat l="Fans OK" v={`${m.fans.filter(f => f.state === 'OK').length}/${m.fans.length}`} bad={m.fans.some(f => f.state === 'Fault')} />
            <Stat l="PSUs OK" v={`${m.psus.filter(p => p.state === 'OK').length}/${m.psus.length}`} bad={m.psus.some(p => p.state === 'Fault')} />
            <Stat l="Fault LEDs lit" v={String(m.faults.length)} bad={m.faults.length > 0} />
            <Stat l="Devices red" v={String(m.ledRed.length)} bad={m.ledRed.length > 0} sub="critical alarm" />
          </div>
          {m.faults.length ? (<>
            <table className="nst-table mx-table">
              <thead><tr><th>Device</th><th>Module</th><th className="is-right">State</th></tr></thead>
              <tbody>{(allFaults ? m.faults : m.faults.slice(0, FAULT_ROWS)).map(f => <tr key={f.ne.id + f.slot}><td><NeLink id={f.ne.id}>{f.ne.id.replace(`${dc.id}-`, '')}</NeLink></td><td>{f.slot} · {f.name}</td><td className="is-right"><span className="vw-chip vw-chip--error cmd-chip">Fault</span></td></tr>)}</tbody>
            </table>
            {m.faults.length > FAULT_ROWS && <button type="button" className="mx-more" onClick={() => setAllFaults(v => !v)}>{allFaults ? 'Show fewer' : `Show all ${m.faults.length} faulted modules`}<I.ChevronDown size={14} style={{ transform: allFaults ? 'rotate(180deg)' : undefined }} /></button>}
          </>) : <p className="vw-card-description mx-ok"><I.CircleCheck size={15} />No fault LEDs lit on monitored devices.</p>}
        </Panel>

        <Panel title="Device load" icon={I.Cpu} sub={`${m.live.length} monitored devices · CPU, memory and chassis temperature`} info="Average CPU and memory over every monitored device, how many run at 80% or more (red when any is at 90%), then the 5 devices with the highest CPU utilisation with their memory use and chassis temperature. Click a device to open it." actions={<Link to={`/datacenters/${dc.id}?tab=elements`} className="panel-link">Equipment<I.ChevronRight size={14} /></Link>}>
          <div className="mx-stats mx-stats-4">
            <Stat l="Avg CPU" v={`${Math.round(m.cpuAvg)}%`} bad={m.cpuAvg >= 80} />
            <Stat l="Avg memory" v={`${Math.round(m.memAvg)}%`} bad={m.memAvg >= 80} />
            <Stat l="CPU ≥ 80%" v={String(m.live.filter(n => n.cpu >= 80).length)} sub="devices" bad={m.live.some(n => n.cpu >= 90)} />
            <Stat l="Memory ≥ 80%" v={String(m.live.filter(n => n.mem >= 80).length)} sub="devices" bad={m.live.some(n => n.mem >= 90)} />
          </div>
          <table className="nst-table mx-table">
            <thead><tr><th>Busiest devices</th><th>CPU</th><th>Memory</th><th className="is-right">Temp</th></tr></thead>
            <tbody>{m.topCpu.map(n => (
              <tr key={n.id}><td><NeLink id={n.id}>{n.id.replace(`${dc.id}-`, '')}</NeLink></td><td><Meter pct={n.cpu} width={70} /></td><td><Meter pct={n.mem} width={70} /></td><td className="is-right num">{n.tempC}°C</td></tr>
            ))}</tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}

/* where the hidden power / cooling / environment figures now live (see dedupe.ts) */
export function FacilityNote({ dcId, what }: { dcId: string; what: string }) {
  return <div className="note note--info site-moved"><I.Info size={15} /><span>{what} are in the Facility tab, under Power & backup, Cooling and Environment.</span>
    <Link to={`/datacenters/${dcId}?tab=fpower`} className="panel-link">Power & backup<I.ChevronRight size={14} /></Link></div>;
}

export function Stat({ l, v, sub, bad }: { l: string; v: string; sub?: string; bad?: boolean }) {
  return <div className="mx-stat"><span className="vw-label">{l}</span><span className={`mx-stat-v${bad ? ' is-bad' : ''}`}>{v}</span>{sub && <span className="vw-label mx-stat-s">{sub}</span>}</div>;
}
