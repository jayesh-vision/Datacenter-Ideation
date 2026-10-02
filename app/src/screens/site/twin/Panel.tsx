import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import type { TwinData, TwinNe } from '../../../api/ext-twin';
import type { Level, RackL, RoomL, Sel, TwinLayout } from './layout';
import { HealthChip, Meter, SeverityChip } from '../../../ui/status';
import { fmtKw, fmtNum } from '../../../lib/format';
import type { Pick } from './Scene';

export interface Crumb { label: string; go: () => void }

/* Hierarchy path inside the panel — same steps as the canvas breadcrumb, in sync. */
export function PanelPath({ crumbs }: { crumbs: Crumb[] }) {
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;
  return (
    <nav className="twin-path" aria-label="Location in datacenter" data-twin="panel-path">
      {parent && <button type="button" className="twin-path-back" data-twin-crumb="back" onClick={parent.go}><I.ChevronLeft size={14} />Back to {parent.label}</button>}
      <div className="twin-path-row">
        {crumbs.map((c, i) => (
          <span key={i} className="row" style={{ gap: 2 }}>
            {i > 0 && <I.ChevronRight size={11} />}
            {i === crumbs.length - 1 ? <b data-twin-crumb={i} aria-current="location">{c.label}</b> : <button type="button" data-twin-crumb={i} onClick={c.go}>{c.label}</button>}
          </span>
        ))}
      </div>
    </nav>
  );
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="twin-row"><span className="vw-label">{k}</span><span className="vw-value">{v}</span></div>;
const Card = ({ title, children, count, action, path }: { title: string; children: React.ReactNode; count?: number; action?: React.ReactNode; path?: Crumb[] }) => (
  <section className="vw-card-section twin-card">
    {path && <PanelPath crumbs={path} />}
    <div className="twin-card-h"><span className="vw-card-title-sm">{title}{count !== undefined && <span className="count">{count}</span>}</span>{action}</div>
    {children}
  </section>
);
const ratio = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const BAD = 'var(--vw-color-red-500)', ACCENT = 'var(--primaryColor500)', WARN = 'var(--vw-color-amber-500)';
const loadColor = (p: number) => (p >= 85 ? BAD : p >= 75 ? WARN : ACCENT);

/* Right-hand context: numbers come from the same summary the KPI strip uses. */
export function TwinPanel({ data, L, sel, level, onPick, crumbs }: { data: TwinData; L: TwinLayout; sel: Sel; level: Level; onPick: (p: Pick) => void; crumbs: Crumb[] }) {
  const { dc, summary: s } = data;
  const room = sel.room !== null ? L.rooms.find(r => r.id === sel.room) : undefined;
  const rk = sel.rack ? L.racks.find(r => r.rack.id === sel.rack) : undefined;
  const ne = rk && sel.ne ? rk.nes.find(n => n.id === sel.ne) : undefined;
  const floor = sel.floor !== null ? L.floors[sel.floor] : undefined;

  if (level === 'equipment' && ne && rk) return <EquipmentPanel ne={ne} rk={rk} data={data} onPick={onPick} path={crumbs} />;
  if ((level === 'rack' || level === 'equipment') && rk) return <RackPanel rk={rk} room={room} data={data} onPick={onPick} path={crumbs} />;
  if (level === 'room' && room) return <RoomPanel room={room} data={data} onPick={onPick} path={crumbs} />;
  if (level === 'floor' && floor) return (
    <>
      <Card title={floor.name} count={floor.rooms.length} path={crumbs}>
        <Row k="Racks" v={fmtNum(floor.rooms.reduce((a, r) => a + r.racks.length, 0))} />
        <Row k="Devices" v={fmtNum(floor.rooms.reduce((a, r) => a + r.racks.reduce((b, k) => b + k.nes.length, 0), 0))} />
        <Row k="Power draw" v={fmtKw(floor.rooms.reduce((a, r) => a + r.racks.reduce((b, k) => b + k.rack.drawKw, 0), 0))} />
        <Row k="Cooling units" v={fmtNum(floor.rooms.reduce((a, r) => a + r.cooling.length, 0))} />
      </Card>
      <Card title="Rooms">
        <ul className="twin-list" data-twin="rooms">
          {floor.rooms.map(r => (
            <li key={r.id}><button type="button" data-twin-room={r.id} onClick={() => onPick({ floor: floor.idx, room: r.id })}>
              <span className="vw-card-activity-label">{r.name}</span>
              <span className="vw-label">{r.kind === 'power' ? `${r.power.length} plant units` : `${r.racks.length} racks · ${r.racks.reduce((a, k) => a + k.nes.length, 0)} devices${r.sensor ? ` · ${r.sensor.tempC}°C` : ''}`}</span>
              <I.ChevronRight size={14} />
            </button></li>
          ))}
        </ul>
      </Card>
    </>
  );

  /* building */
  const upsOk = dc.power.ups.filter(u => u.state === 'Online').length;
  const coolOk = dc.cooling.units.filter(u => u.status === 'Operational').length;
  const powerPct = ratio(s.powerKw, s.powerCapKw), coolPct = ratio(dc.cooling.loadKw, dc.cooling.capacityKw);
  return (
    <>
      <Card title={dc.id} action={<span className="vw-label">{dc.tier}</span>} path={crumbs}>
        <div className="twin-stats">
          <div><span className="vw-card-metric-md">{L.floors.length}</span><span className="vw-label">floors</span></div>
          <div><span className="vw-card-metric-md">{L.rooms.filter(r => r.kind === 'it').length}</span><span className="vw-label">rooms</span></div>
          <div><span className="vw-card-metric-md">{dc.racks.length}</span><span className="vw-label">racks</span></div>
          <div title={`${s.inService} in service · ${s.unmonitored} not monitored · ${s.planned} planned (reserved space only)`}><span className="vw-card-metric-md">{fmtNum(s.installed)}</span><span className="vw-label">devices</span></div>
        </div>
        {dc.status === 'planned' && <p className="twin-note">Planned site — record data only. Racks and equipment are shown as ghosts until the collector sees them.</p>}
      </Card>
      <Card title="Floors">
        <ul className="twin-list" data-twin="floors">
          {L.floors.map(f => (
            <li key={f.idx}><button type="button" data-twin-floor={f.idx} onClick={() => onPick({ floor: f.idx })}>
              <span className="vw-card-activity-label">{f.name}</span>
              <span className="vw-label">{f.rooms.map(r => r.name).join(' · ')}</span>
              <I.ChevronRight size={14} />
            </button></li>
          ))}
        </ul>
      </Card>
      <Card title="Power & cooling">
        <Row k="IT + facility load" v={<span className="twin-meter"><Meter pct={powerPct} color={loadColor(powerPct)} width={60} />of {fmtKw(s.powerCapKw)}</span>} />
        <Row k="PUE" v={dc.power.pue.toFixed(2)} />
        <Row k="Cooling load" v={<span className="twin-meter"><Meter pct={coolPct} color={loadColor(coolPct)} width={60} />of {fmtKw(dc.cooling.capacityKw)}</span>} />
        <Row k="Cooling units" v={<span style={{ color: coolOk < dc.cooling.units.length ? BAD : undefined }}>{coolOk}/{dc.cooling.units.length} running · {dc.cooling.redundancy}</span>} />
        <Row k="UPS" v={<span style={{ color: upsOk < dc.power.ups.length ? BAD : undefined }}>{upsOk}/{dc.power.ups.length} online</span>} />
        <Row k="DG" v={`${dc.power.dg.kva} kVA · fuel ${dc.power.dg.fuelPct}% · ${dc.power.dg.runtimeH} h`} />
        <Row k="Battery" v={`${dc.power.battery.runtimeH} h autonomy`} />
      </Card>
      <Card title="Operations" count={s.activeAlerts} action={<Link to={`/alerts?dc=${dc.id}`} className="panel-link">Alerts<I.ChevronRight size={14} /></Link>}>
        <Row k="Active alarms (DC scope)" v={<span style={{ color: s.critAlerts ? BAD : undefined }}>{s.activeAlerts}{s.critAlerts ? ` · ${s.critAlerts} critical` : ''}</span>} />
        <Row k="Open incidents" v={s.openIncidents ? <Link to={`/incidents?dc=${dc.id}`} className="ent-link">{s.openIncidents}{data.incidents.some(i => i.sev <= 2) ? ` · SEV${Math.min(...data.incidents.map(i => i.sev))}` : ''}</Link> : 'None'} />
        <Row k="Edge links" v={<span style={{ color: data.edge.state !== 'redundant' ? WARN : undefined }}>{data.edge.up}/{data.edge.total} up · {data.edge.state === 'redundant' ? 'redundant' : data.edge.state === 'isolated' ? 'isolated' : 'redundancy lost'}</span>} />
        <Row k="Services" v={`${fmtNum(s.services)} · ${s.servicesDegraded} degraded`} />
      </Card>
    </>
  );
}

function RoomPanel({ room, data, onPick, path }: { room: RoomL; data: TwinData; onPick: (p: Pick) => void; path: Crumb[] }) {
  const draw = room.racks.reduce((a, r) => a + r.rack.drawKw, 0), budget = room.racks.reduce((a, r) => a + r.rack.budgetKw, 0);
  const pct = ratio(draw, budget);
  const units = room.cooling;
  return (
    <>
      <Card title={room.name} action={<span className="vw-label">{room.floorName}</span>} path={path}>
        {room.kind === 'power' ? (
          <>
            {room.power.map(p => <Row key={p.label} k={p.label} v={<span style={{ color: p.state === 'bad' ? BAD : p.state === 'warn' ? WARN : undefined }}>{p.ups ? `${p.ups.state} · ${p.ups.loadPct}% · ${p.ups.batteryMin} min` : p.kind === 'battery' ? `${data.dc.power.battery.runtimeH} h autonomy` : data.dc.power.feeds.find(f => f.type === 'DC')?.rating ?? '—'}</span>} />)}
            <Row k="DG" v={`${data.dc.power.dg.kva} kVA · ${data.dc.power.dg.result} · fuel ${data.dc.power.dg.fuelPct}%`} />
          </>
        ) : (
          <>
            <Row k="Racks" v={`${room.racks.length} · ${room.racks.reduce((a, r) => a + r.nes.length, 0)} devices`} />
            <Row k="Power draw" v={<span className="twin-meter"><Meter pct={pct} color={loadColor(pct)} width={60} />{fmtKw(draw)} of {fmtKw(budget)}</span>} />
            <Row k="Environment" v={room.sensor ? <span style={{ color: room.sensor.tempC > 27 ? BAD : undefined }}>{room.sensor.tempC}°C · {room.sensor.humidity}% RH{room.sensor.smoke || room.sensor.leak ? ' · ALARM' : ''}</span> : '—'} />
            <Row k="Cooling" v={units.length ? <span style={{ color: units.some(u => u.unit.status === 'Failed') ? BAD : undefined }}>{units.filter(u => u.unit.status === 'Operational').length}/{units.length} running</span> : 'shared'} />
          </>
        )}
      </Card>
      {units.length > 0 && (
        <Card title="Cooling units" count={units.length}>
          {units.map(u => <Row key={u.unit.id} k={`${u.unit.name} · ${u.unit.type}`} v={<span style={{ color: u.unit.status === 'Failed' ? BAD : u.unit.status === 'Maintenance' ? WARN : undefined }}>{u.unit.status} · {u.unit.loadPct}% · {u.unit.supplyC}→{u.unit.returnC}°C</span>} />)}
        </Card>
      )}
      {room.racks.length > 0 && (
        <Card title="Racks" count={room.racks.length}>
          <ul className="twin-list" data-twin="racks">
            {room.racks.map(r => {
              const worst = r.nes.find(n => n.worst === 'critical') ? 'critical' : r.nes.find(n => n.worst === 'major') ? 'major' : null;
              return (
                <li key={r.rack.id}><button type="button" data-twin-rack={r.rack.id} onClick={() => onPick({ floor: room.floorIdx, room: room.id, rack: r.rack.id })}>
                  <span className="vw-card-activity-label">{r.rack.name}<span className="vw-label"> · {r.rack.role}</span></span>
                  <span className="vw-label">{r.rack.usedU}/{r.rack.heightU} U · {r.rack.drawKw} kW · {r.rack.tempC}°C · {r.nes.length} devices</span>
                  {worst && <SeverityChip s={worst} size="xs" />}<I.ChevronRight size={14} />
                </button></li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}

function RackPanel({ rk, room, data, onPick, path }: { rk: RackL; room?: RoomL; data: TwinData; onPick: (p: Pick) => void; path: Crumb[] }) {
  const r = rk.rack; const pct = ratio(r.drawKw, r.budgetKw);
  const alarms = rk.nes.reduce((a, n) => a + n.alarms, 0);
  return (
    <>
      <Card title={r.name} action={<span className="vw-label">{r.floor} · {r.room}</span>} path={path}>
        <div className="twin-stats">
          <div><span className="vw-card-metric-md">{r.usedU}<small>/{r.heightU} U</small></span><span className="vw-label">{r.heightU - r.usedU} U free</span></div>
          <div><span className="vw-card-metric-md" style={{ color: pct >= 85 ? BAD : undefined }}>{r.drawKw}<small> kW</small></span><span className="vw-label">of {r.budgetKw} kW budget</span></div>
          <div><span className="vw-card-metric-md" style={{ color: r.tempC > 27 ? BAD : undefined }}>{r.tempC}<small>°C</small></span><span className="vw-label">inlet</span></div>
          <div><span className="vw-card-metric-md">{r.portsUsed}<small>/{r.ports}</small></span><span className="vw-label">ports used</span></div>
        </div>
        <Row k="Role" v={r.role} />
        <Row k="Power feeds" v={`A + B · ${data.dc.power.ups.map(u => u.name).slice(0, 2).join(' / ')}`} />
        <Row k="Alarms" v={alarms ? <span style={{ color: BAD }}>{alarms} on {rk.nes.filter(n => n.alarms).length} devices</span> : 'None'} />
        {room?.sensor && <Row k="Zone" v={`${room.sensor.tempC}°C · ${room.sensor.humidity}% RH`} />}
      </Card>
      <Card title="Equipment" count={rk.nes.length} action={rk.reserved.length ? <span className="vw-label" title="Planned devices: space reserved, not installed">{rk.reserved.reduce((a, n) => a + n.uSize, 0)} U reserved</span> : undefined}>
        {rk.nes.length === 0 && <p className="twin-note">{r.role === 'ODF / patching' ? 'Passive rack: ODF and patch panels only.' : 'Empty rack.'}</p>}
        <ul className="twin-list" data-twin="equipment">
          {[...rk.nes].reverse().map(n => (
            <li key={n.id}><button type="button" data-twin-ne={n.id} onClick={() => onPick({ floor: room?.floorIdx, room: room?.id, rack: r.id, ne: n.id })}>
              <span className="vw-card-activity-label">{n.name.replace(`${n.dcId}-`, '')}<span className="vw-label"> · U{n.u}{n.uSize > 1 ? `–${n.u + n.uSize - 1}` : ''}</span></span>
              <span className="vw-label">{n.role} · {n.vendor} {n.model}</span>
              {n.opsState === 'unmonitored' ? <span className="vw-chip vw-chip--neutral cmd-chip" title="Installed, no telemetry">Not monitored</span> : n.worst ? <SeverityChip s={n.worst} size="xs" /> : <HealthChip s={n.health} size="xs" />}
              <I.ChevronRight size={14} />
            </button></li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function EquipmentPanel({ ne, rk, data, onPick, path }: { ne: TwinNe; rk: RackL; data: TwinData; onPick: (p: Pick) => void; path: Crumb[] }) {
  const nd = ne.opsState === 'unmonitored';
  const al = data.alerts.filter(a => a.neId === ne.id);
  return (
    <>
      <Card title={ne.name.replace(`${ne.dcId}-`, '')} path={path} action={nd ? <span className="vw-chip vw-chip--neutral cmd-chip">Not monitored</span> : <HealthChip s={ne.health} size="xs">{ne.health} · {ne.healthScore}</HealthChip>}>
        <Row k="Role" v={`${ne.role} · ${ne.layer}`} />
        <Row k="Model" v={`${ne.vendor} ${ne.model}`} />
        <Row k="OS" v={ne.os} />
        <Row k="Serial" v={<span className="mono">{ne.serial}</span>} />
        <Row k="IP / MAC" v={<span className="mono">{ne.ip} · {ne.mac}</span>} />
        <Row k="Position" v={<button type="button" className="ent-link twin-inline" onClick={() => onPick({ rack: rk.rack.id })}>{rk.rack.name} · U{ne.u}{ne.uSize > 1 ? `–${ne.u + ne.uSize - 1}` : ''}</button>} />
        {!nd && (
          <div className="twin-stats" style={{ marginTop: 8 }}>
            <div><span className="vw-card-metric-md" style={{ color: ne.cpu > 75 ? WARN : undefined }}>{ne.cpu}<small>%</small></span><span className="vw-label">CPU</span></div>
            <div><span className="vw-card-metric-md">{ne.mem}<small>%</small></span><span className="vw-label">memory</span></div>
            <div><span className="vw-card-metric-md" style={{ color: ne.tempC > 50 ? WARN : undefined }}>{ne.tempC}<small>°C</small></span><span className="vw-label">chassis</span></div>
            <div><span className="vw-card-metric-md">{ne.links}</span><span className="vw-label">links{ne.linksDown ? ` · ${ne.linksDown} down` : ''}</span></div>
          </div>
        )}
        {nd && <p className="twin-note">Installed but not reporting telemetry — no collector polls it. Health and alarms are unknown until monitoring is restored.</p>}
      </Card>
      <Card title="Alarms" count={al.length} action={<Link to={`/ne/${ne.id}?tab=alerts`} className="panel-link">Diagnostics<I.ChevronRight size={14} /></Link>}>
        {al.length ? al.slice(0, 5).map(a => <Row key={a.id} k={a.code} v={<span className="row" style={{ gap: 6 }}><SeverityChip s={a.severity} size="xs" />{a.title}</span>} />) : <p className="twin-note">No active alarms.</p>}
      </Card>
      <Card title="Dependencies">
        <Row k="Services" v={`${ne.services} hosted`} />
        <Row k="Modules" v={`${ne.modules.filter(m => m.state === 'OK').length}/${ne.modules.length} OK`} />
        <Row k="Edge" v={ne.edge ? 'Terminates an edge link' : 'Internal only'} />
        <div className="twin-actions">
          <Link to={`/ne/${ne.id}`} className="nst-btn nst-btn--xs nst-btn--filled">Open element</Link>
          <Link to={`/ne/${ne.id}?tab=links`} className="nst-btn nst-btn--xs">Links</Link>
          <Link to={`/ne/${ne.id}?tab=services`} className="nst-btn nst-btn--xs">Services</Link>
        </div>
      </Card>
    </>
  );
}
