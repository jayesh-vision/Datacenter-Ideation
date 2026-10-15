/* Rack page (/dcim/racks/:id): the front elevation by rack unit (devices, planned space, the ODF patch-panel block, free U),
   the two rack PDUs with every cord, the rack's data cables and patch panels. A device opens the device drawer. */
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { dcimReleaseU, dcimRetireRack, getDatacenter, getDcimRack, useQuery } from '../../api';
import type { DcimDevice, DcimRackView } from '../../api/types';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Chip, Info, Modal, Panel, Tabs } from '../../ui/kit';
import { useToast } from '../ops/shared';
import { RackEditModal, ReserveModal } from './ops';
import { DataTable, type Col } from '../../ui/DataTable';
import { Meter } from '../../ui/status';
import { SummaryStrip } from '../site/SummaryStrip';
import { fmtDate, fmtDateTime, fmtKw, fmtMonth, fmtNum } from '../../lib/format';
import { CablePathDrawer, RackPowerDrawer, STATE_TONE, pduState } from '../physical/parts';
import { NotFound } from '../NotFound';
import { ACCENT, BAD, CAT_COLOR, CAT_LABEL, DcimStatusChip, loadColor, pct } from './common';
import { DeviceDrawer } from './lists';
import { InstallDeviceModal } from './forms';
import '../../styles/dcim.css';

type Tab = 'devices' | 'power' | 'cables' | 'panels' | 'reservations' | 'activity';
const UPX = 15;

export function RackPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'devices';
  const { data, loading } = useQuery(() => getDcimRack(id), [id]);
  const [dev, setDev] = useState<string | null>(null);
  const [install, setInstall] = useState(false);
  const [power, setPower] = useState(false);
  const [path, setPath] = useState<string | null>(null);
  const [form, setForm] = useState<'edit' | 'reserve' | 'retire' | null>(null);
  const [err, setErr] = useState('');
  const toast = useToast();
  usePage([{ label: 'Plan & Build' }, { label: 'DCIM', to: '/dcim' }, { label: data?.rack.dcId ?? '…', to: data ? `/dcim?tab=floorplan&dc=${data.rack.dcId}&hall=${data.rack.hallId}` : undefined }, { label: data?.rack.name ?? id }], data ? { dcId: data.rack.dcId } : {});
  const { data: dc } = useQuery(() => (data ? getDatacenter(data.rack.dcId) : Promise.resolve(null)), [data?.rack.dcId]);
  if (loading && !data) return <Loading />;
  if (!data) return <NotFound what="Rack" />;
  const { rack: r, devices, feeds } = data;
  const setTab = (t: Tab) => { const n = new URLSearchParams(sp); t === 'devices' ? n.delete('tab') : n.set('tab', t); setSp(n, { replace: true }); };
  const ac = feeds.filter(f => f.kind === 'AC');

  return (
    <div className="page dcim">
      <PageHead title={r.name} chips={<><DcimStatusChip s={r.status} /><Chip tone="neutral">{r.role}</Chip>{r.density !== 'Standard' && <Chip tone="purple">{r.density} density</Chip>}{r.liquid && <Chip tone="cyan">Liquid cooled</Chip>}{r.tenantName && <Chip tone="neutral">{r.tenantName}</Chip>}{r.condition === 'Damaged' && <Chip tone="error" title={r.conditionNote}>Damaged</Chip>}{r.old && <Chip tone="warning" title="An old cabinet type: shallower (1000 mm) than the current 1200 mm standard">Old type</Chip>}</>}
        sub={<>{r.dcId} · {r.floor} · <Link className="ent-link" to={`/dcim?tab=floorplan&dc=${r.dcId}&hall=${r.hallId}`}>{r.hallName}</Link> · {r.rowName}{r.model ? ` · ${r.model}${r.installed ? `, bought ${fmtMonth(r.installed)}` : ''}` : ''}{r.condition === 'Damaged' && r.conditionNote ? ` · ${r.conditionNote}` : ''}{data.neighbours.length ? ` · next to ${data.neighbours.slice(0, 3).map(n => n.name).join(', ')}` : ''}</>}
        actions={<>
          <Btn icon={I.Zap} onClick={() => setPower(true)}>Outlet map</Btn>
          <Btn icon={I.Box} onClick={() => nav(`/datacenters/${r.dcId}?twin=realistic`)}>3D twin</Btn>
          {r.owner !== 'tenant' && <>
            <Btn icon={I.Pencil} onClick={() => setForm('edit')}>Edit</Btn>
            <Btn icon={I.Bookmark} onClick={() => setForm('reserve')} disabled={r.freeU < 1}>Reserve space</Btn>
            <Btn icon={I.Archive} onClick={() => { setErr(''); setForm('retire'); }}>Retire</Btn>
            <Btn variant="filled" icon={I.HardDriveDownload} onClick={() => setInstall(true)} disabled={r.freeU < 1}>Install device</Btn>
          </>}
        </>} />

      <SummaryStrip items={[
        { key: 'u', label: 'Space', value: `${r.usedU}/${r.heightU} U`, sub: `${r.freeU} U free`, tone: r.freeU < 4 ? 'warn' : undefined, info: 'Rack units in use by devices (and the ODF patch-panel block in a patching rack) out of the cabinet height.' },
        { key: 'kw', label: 'Power', value: `${r.drawKw} kW`, sub: `${r.powerPct}% of ${r.budgetKw}`, tone: r.powerPct >= 90 ? 'bad' : r.powerPct >= 80 ? 'warn' : undefined, info: 'Measured draw of the cabinet against its budget. Each PDU side is rated for the whole cabinet, so one side can carry everything if the other fails.' },
        { key: 'f', label: 'Feeds', value: r.power, sub: ac.every(f => f.state === 'ok') ? 'both normal' : ac.filter(f => f.state !== 'ok').map(f => `${f.name} ${pduState({ state: f.state } as never).label.toLowerCase()}`).join(' · '), tone: r.power !== 'A + B' && r.status !== 'Planned' ? 'bad' : undefined, info: 'Which rack PDU sides are live. A + B means every dual-fed device has both supplies on power.' },
        { key: 'd', label: 'Devices', value: r.devices, sub: r.plannedDevices ? `${r.plannedDevices} planned` : `${fmtNum(r.portsUsed)} ports cabled`, info: 'Devices placed in the rack; planned devices hold their rack units until installed.' },
        { key: 'w', label: 'Weight', value: `${fmtNum(r.weightKg)} kg`, sub: `of ${fmtNum(r.maxWeightKg)} kg`, tone: r.weightKg > r.maxWeightKg * 0.9 ? 'warn' : undefined, info: 'Estimated from the cabinet shell and each device type, against the cabinet rating.' },
        { key: 't', label: 'Inlet', value: r.tempC ? `${r.tempC}°C` : '—', sub: r.tempC > 27 ? 'above 27°C' : 'in band', tone: r.tempC > 27 ? 'bad' : undefined, info: 'Cold-aisle inlet temperature at the front of the cabinet (ASHRAE A1 recommended 18–27°C).' }
      ]} />

      <div className="dcim-rack-grid">
        <Panel title="Front elevation" icon={I.Server} info="The cabinet seen from the cold aisle, rack unit 1 at the bottom. Colour = device category; hatched = planned (space held) or the ODF patch-panel block. Click a device for its ports and power.">
          <Elevation v={data} onDevice={setDev} />
        </Panel>
        <div className="dcim-rack-side">
          <Tabs value={tab} onChange={setTab} tabs={[{ id: 'devices', label: 'Devices', count: devices.length }, { id: 'power', label: 'Power', count: data.cords.length }, { id: 'cables', label: 'Cables', count: data.cables.length }, { id: 'panels', label: 'Panels', count: data.panels.length }, { id: 'reservations', label: 'Reserved', count: data.reserved.filter(x => x.id).length }, { id: 'activity', label: 'Activity', count: data.activity.length }]} />
          {tab === 'devices' && <DeviceList devices={devices} onRow={d => setDev(d.id)} />}
          {tab === 'power' && <PowerCards v={data} />}
          {tab === 'cables' && <section className="vw-card-section dcim-table"><DataTable rows={data.cables} pageSize={15} onRow={c => c.linkId && setPath(c.linkId)} defaultSort={{ key: 'st', dir: 'desc' }} cols={[
            { key: 'a', header: 'From', sort: c => c.aName, render: c => <span className="cell-2"><span className="mono">{c.aName} <b>{c.aPort}</b></span><small>{c.aRack}</small></span> },
            { key: 'z', header: 'To', sort: c => c.zName, render: c => <span className="cell-2"><span className="mono">{c.zName} <b>{c.zPort}</b></span><small>{c.zRack}</small></span> },
            { key: 't', header: 'Cable', sort: c => c.type, render: c => <span className="cell-2"><span>{c.type}</span><small>{c.route}{c.lengthM ? ` · ${c.lengthM} m` : ''}</small></span> },
            { key: 'st', header: 'Status', sort: c => c.status, render: c => <Chip tone={c.status === 'Connected' ? 'success' : c.status === 'Planned' ? 'info' : 'error'} dot>{c.status}</Chip> }]} /></section>}
          {tab === 'panels' && <section className="vw-card-section dcim-table"><DataTable rows={data.panels} pageSize={15} defaultSort={{ key: 'n', dir: 'asc' }} empty={<p className="vw-label" style={{ padding: 16 }}>No patch panels in this cabinet: its devices are cabled inside the rack only.</p>} cols={[
            { key: 'n', header: 'Panel', sort: p => p.name, render: p => <span className="cell-2"><span className="mono">{p.name}</span><small>{p.role === 'odf' ? 'ODF (main distribution)' : 'Cabinet panel, top of rack'}</small></span> },
            { key: 'k', header: 'Kind', sort: p => p.kind, render: p => p.kind },
            { key: 'u', header: 'Ports used', sort: p => p.used / p.ports, render: p => <Meter pct={pct(p.used, p.ports)} width={56} color={ACCENT} label={`${p.used}/${p.ports}`} /> }]} /></section>}
          {tab === 'reservations' && <section className="vw-card-section dcim-table"><DataTable rows={data.reserved.filter(x => x.id).map(x => ({ ...x, id: x.id! }))} pageSize={15} defaultSort={{ key: 'u', dir: 'desc' }}
            empty={<p className="vw-label" style={{ padding: 16 }}>No space held in this cabinet. “Reserve space” holds rack units for a planned install or a change.</p>} cols={[
            { key: 'u', header: 'Units', sort: x => x.u, render: x => <span className="mono">U{x.u}–U{x.u + x.uHeight - 1}</span> },
            { key: 'l', header: 'Held for', sort: x => x.label, wrap: true, render: x => <span className="cell-2"><span>{x.label}</span><small>by {x.by}</small></span> },
            { key: 't', header: 'Until', sort: x => x.until ?? 0, render: x => (x.until ? fmtDate(x.until) : <span className="vw-label">open</span>) },
            { key: 'a', header: '', render: x => <Btn size="sm" icon={I.X} onClick={() => dcimReleaseU(x.id).then(() => toast.show('Space released', `U${x.u}–U${x.u + x.uHeight - 1} is free again.`))}>Release</Btn> }]} /></section>}
          {tab === 'activity' && <section className="vw-card-section"><ul className="dcim-activity">{data.activity.map(a => (
            <li key={a.id}><span className="dcim-activity-dot" /><span><span className="dcim-activity-t"><b>{a.field}</b> · <span className="mono">{a.object.replace(`${r.dcId}-`, '')}</span></span><small>{a.prev !== '—' ? `${a.prev} → ` : ''}{a.next}</small></span><small className="dcim-activity-when">{fmtDateTime(a.at)}<br />{a.actor}</small></li>))}</ul>
            {!data.activity.length && <p className="vw-label">No changes recorded for this cabinet or its devices in this session.</p>}</section>}
        </div>
      </div>

      <DeviceDrawer id={dev} onClose={() => setDev(null)} />
      <RackEditModal rack={form === 'edit' ? r : null} onClose={() => setForm(null)} onDone={t => { setForm(null); toast.show(t); }} />
      <ReserveModal rack={form === 'reserve' ? r : null} onClose={() => setForm(null)} onDone={t => { setForm(null); setTab('reservations'); toast.show(t, 'Install and Move skip this space until it is released.'); }} />
      <Modal open={form === 'retire'} onClose={() => setForm(null)} title={`Retire ${r.name}?`} sub="The cabinet is removed from the hall, the floor plan and the twin. Only an empty rack can be retired."
        foot={<><Btn onClick={() => setForm(null)}>Cancel</Btn><Btn variant="filled" icon={I.Archive} onClick={() => dcimRetireRack(r.id).then(() => { setForm(null); nav(`/dcim?tab=floorplan&dc=${r.dcId}&hall=${r.hallId}`); }).catch(e => setErr(String(e.message ?? e)))}>Retire rack</Btn></>}>
        <p style={{ margin: 0 }}>{r.devices ? `${r.name} holds ${r.devices} device${r.devices === 1 ? '' : 's'}: move or remove them first.` : `${r.name} is empty and can be retired.`}</p>
        {err && <p className="dcim-err">{err}</p>}
      </Modal>
      {toast.node}
      <InstallDeviceModal open={install} onClose={() => setInstall(false)} dcId={r.dcId} rackId={r.id} />
      {power && dc && <RackPowerDrawer dc={dc.dc} rackId={r.id} onClose={() => setPower(false)} />}
      <CablePathDrawer linkId={path} onClose={() => setPath(null)} />
    </div>
  );
}

function Elevation({ v, onDevice }: { v: DcimRackView; onDevice: (id: string) => void }) {
  const H = v.rack.heightU;
  const units = Array.from({ length: H }, (_, i) => H - i);
  return (
    <div className="dcim-elev-wrap">
      <div className="dcim-elev" style={{ height: H * UPX + 2 }}>
        {units.map(u => <span key={u} className="dcim-u" style={{ bottom: (u - 1) * UPX }}>{u % 5 === 0 || u === 1 ? u : ''}</span>)}
        <div className="dcim-elev-rails">
          {v.devices.map(d => (
            <button key={d.id} type="button" onClick={() => onDevice(d.id)} title={`${d.name} · ${d.manufacturer} ${d.model} · U${d.u}${d.uHeight > 1 ? `–${d.u + d.uHeight - 1}` : ''} · ${d.status}`}
              className={`dcim-dev${d.status === 'Planned' ? ' is-planned' : ''}${d.health === 'critical' ? ' is-bad' : d.health === 'degraded' ? ' is-warn' : ''}`}
              style={{ bottom: (d.u - 1) * UPX + 1, height: d.uHeight * UPX - 2, background: d.status === 'Planned' ? undefined : CAT_COLOR[d.category] }}>
              <span className="mono">{d.name.replace(`${d.dcId}-`, '')}</span>{d.uHeight >= 2 && <small>{d.model}</small>}
            </button>
          ))}
          {v.reserved.map(x => (
            <div key={x.id ?? x.label} title={x.id ? `Held for ${x.label} by ${x.by}` : undefined} className={`dcim-dev ${x.id ? 'is-held' : 'is-odf'}`} style={{ bottom: (x.u - 1) * UPX + 1, height: x.uHeight * UPX - 2 }}><span>{x.label} · {x.uHeight}U</span></div>
          ))}
        </div>
      </div>
      <div className="dcim-elev-legend">
        {(['network', 'compute', 'storage', 'tenant'] as const).filter(c => v.devices.some(d => d.category === c)).map(c => <span key={c}><i style={{ background: CAT_COLOR[c] }} />{CAT_LABEL[c]}</span>)}
        {v.devices.some(d => d.status === 'Planned') && <span><i className="is-planned" />Planned</span>}
        <span className="vw-label">{v.rack.freeU} U free</span>
      </div>
    </div>
  );
}

function DeviceList({ devices, onRow }: { devices: DcimDevice[]; onRow: (d: DcimDevice) => void }) {
  const cols: Col<DcimDevice>[] = [
    { key: 'u', header: 'U', sort: d => d.u, render: d => <span className="mono">U{d.u}{d.uHeight > 1 ? `–${d.u + d.uHeight - 1}` : ''}</span> },
    { key: 'n', header: 'Device', sort: d => d.name, render: d => <span className="cell-2"><span className="mono">{d.name}</span><small>{d.manufacturer} {d.model}</small></span> },
    { key: 'r', header: 'Role', sort: d => d.role, render: d => <span className="row" style={{ gap: 6 }}><i className="dcim-dot" style={{ background: CAT_COLOR[d.category] }} />{d.role}</span> },
    { key: 'p', header: 'Power', sort: d => d.powerW, render: d => (d.powerW ? `${fmtNum(d.powerW)} W` : '—') },
    { key: 's', header: 'Status', sort: d => d.status, render: d => <DcimStatusChip s={d.status} /> }
  ];
  return <section className="vw-card-section dcim-table"><DataTable rows={devices} cols={cols} pageSize={15} defaultSort={{ key: 'u', dir: 'desc' }} onRow={onRow} empty={<p className="vw-label" style={{ padding: 16 }}>Empty cabinet. Use “Install device” to plan the first one.</p>} /></section>;
}

function PowerCards({ v }: { v: DcimRackView }) {
  return (
    <div className="dcim-pdus">
      {v.feeds.map(f => {
        const st = pduState({ state: f.state } as never);
        const cords = v.cords.filter(c => c.pduId === f.id).sort((a, b) => a.outlet - b.outlet);
        return (
          <Panel key={f.id} title={<>{f.name}<span className="vw-label"> · side {f.side}</span></>} icon={I.PlugZap}
            actions={<Chip tone={STATE_TONE[st.s]} dot>{st.label}</Chip>}>
            <div className="dcim-pdu-head">
              <span className="cell-2"><span>{f.kind === 'DC' ? '−48 V DC' : `${f.volts} V · ${f.phases}-phase · ${f.amps} A`}</span><small>rated {fmtKw(f.capacityKw)} · {f.cords} of {f.outlets} outlets</small></span>
              <Meter pct={f.pct} width={90} color={loadColor(f.pct)} label={fmtKw(f.loadKw)} />
            </div>
            {f.note && <p className="dcim-note-line" style={{ color: f.state === 'tripped' ? BAD : undefined }}>{f.note}</p>}
            <table className="nst-table dt-table dcim-comp">
              <thead><tr><th>Outlet</th><th>Device supply</th><th>Draw</th><th>State<Info text="live = carrying load; on battery = its UPS is on battery; no power = the outlet or PDU is off; psu failed = the supply itself failed." /></th></tr></thead>
              <tbody>{cords.map(c => (
                <tr key={`${c.neId}${c.psu}`}><td className="mono">{c.outlet}</td><td><span className="mono">{c.deviceName.replace(`${v.rack.dcId}-`, '')}</span> <span className="vw-label">{c.psu}</span></td><td>{c.drawW ? `${fmtNum(c.drawW)} W` : '—'}</td>
                  <td><Chip tone={c.state === 'live' ? 'success' : c.state === 'on-battery' ? 'warning' : 'error'} dot size="xs">{c.state.replace('-', ' ')}</Chip></td></tr>
              ))}</tbody>
            </table>
            {!cords.length && <p className="vw-label">No cords on this PDU.</p>}
          </Panel>
        );
      })}
      {!v.feeds.length && <p className="vw-label">No rack PDUs recorded.</p>}
    </div>
  );
}
