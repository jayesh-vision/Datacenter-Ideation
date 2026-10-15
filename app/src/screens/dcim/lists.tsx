/* DCIM list tabs: racks, devices (+ device drawer), cabling, power distribution and the device-type catalogue.
   Filters live in the URL (ListToolbar + useParamPatch); every list shows "N of M" against the scope's full list. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, dcimDisconnect, dcimRemoveModule, dcimSwapModule, getDatacenter, getDcimDevice, getDcimTags, getDcimWork, getDeviceIps, getDeviceLifecycle, getIpam, setDeviceStatus, useQuery } from '../../api';
import { CrChip, CrWorkList, showCr, useCrGate } from './cr';
import type { DcimCable, DcimComponent, DcimDevice, DcimDeviceType, DcimModuleType, DcimPowerFeed, DcimPowerPanel, DcimRack, DcimCatalog } from '../../api/types';
import { Loading } from '../../shell/page';
import { Btn, Chip, Drawer, KV, Panel, Seg } from '../../ui/kit';
import { DataTable, type Col } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { HealthChip, Meter } from '../../ui/status';
import { fmtBw, fmtDate, fmtKw, fmtNum } from '../../lib/format';
import { CablePathDrawer, RackPowerDrawer, STATE_TONE, pduState } from '../physical/parts';
import { useToast } from '../ops/shared';
import { ACCENT, BAD, CAT_COLOR, CAT_LABEL, DcimStatusChip, loadColor, pct } from './common';
import { NewTypeModal } from './forms';
import { DeviceAddresses } from '../ipam/extras';
import { ConnectModal, FeedModal, ImportTypesModal, InterfaceModal, ModuleModal, ModuleTypeModal, MoveModal, PanelModal } from './ops';

function useP() {
  const [sp, setSp] = useSearchParams();
  const apply = useParamPatch();
  const get = (k: string) => sp.get(k) ?? '';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  return { get, set, apply };
}
const opts = <T,>(xs: T[], key: (x: T) => string, label?: (k: string) => string) => { const m = new Map<string, number>(); xs.forEach(x => m.set(key(x), (m.get(key(x)) ?? 0) + 1)); return [...m].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, label: label ? label(id) : id, count })); };
const has = (s: string, q: string) => !q || s.toLowerCase().includes(q.toLowerCase());

/* ---------------------------------------------------------------- racks */

export function RacksTab({ racks }: { racks: DcimRack[] }) {
  const { get, set, apply } = useP();
  const nav = useNavigate();
  const q = get('q'), dens = get('density'), st = get('rst'), load = get('load');
  const rows = useMemo(() => racks.filter(r => (!dens || r.density === dens) && (!st || r.status === st) && (!load || (load === 'hot' ? r.powerPct >= 90 : load === 'side' ? r.power !== 'A + B' : load === 'full' ? r.freeU < 4 : r.devices === 0))
    && has(`${r.name} ${r.dcId} ${r.hallName} ${r.role} ${r.tenantName ?? ''}`, q)), [racks, q, dens, st, load]);
  const tenants = racks.some(r => r.owner === 'tenant');
  const cols: Col<DcimRack>[] = [
    { key: 'rack', header: 'Rack', sort: r => `${r.dcId}${r.name}`, render: r => <span className="cell-2"><span className="vw-card-activity-label">{r.name}</span><small>{r.dcId} · {r.hallName} · {r.rowName}</small></span> },
    { key: 'role', header: 'Role', sort: r => r.role, render: r => <span className="cell-2"><span>{r.role}</span><small>{r.devices} device{r.devices === 1 ? '' : 's'}{r.plannedDevices ? ` · ${r.plannedDevices} planned` : ''}</small></span> },
    { key: 'u', header: 'Space', sort: r => r.usedU / r.heightU, render: r => <Meter pct={pct(r.usedU, r.heightU)} width={56} color={ACCENT} label={`${r.usedU}/${r.heightU} U`} /> },
    { key: 'kw', header: 'Power', sort: r => r.powerPct, render: r => <Meter pct={r.powerPct} width={56} color={loadColor(r.powerPct)} label={`${r.drawKw} of ${r.budgetKw} kW`} /> },
    { key: 'feed', header: 'Feeds', sort: r => r.power, render: r => <span className="cell-2"><span style={{ color: r.power !== 'A + B' && r.status !== 'Planned' ? BAD : undefined }}>{r.power}</span><small>{r.pdus} PDU{r.pdus === 1 ? '' : 's'}</small></span> },
    { key: 'dens', header: 'Density', sort: r => r.density, render: r => <span className="cell-2"><span>{r.density}</span><small>{r.liquid ? 'Liquid cooled' : 'Air cooled'}</small></span> },
    { key: 'wt', header: 'Weight', sort: r => r.weightKg / r.maxWeightKg, hideBelow: 1360, render: r => <span className="cell-2"><span>{fmtNum(r.weightKg)} kg</span><small>of {fmtNum(r.maxWeightKg)} kg</small></span> },
    ...(tenants ? [{ key: 'ten', header: 'Tenant', sort: (r: DcimRack) => r.tenantName ?? '', render: (r: DcimRack) => r.tenantName ?? <span className="vw-label">Operator</span> }] : []),
    { key: 'st', header: 'Status', sort: r => r.status, render: r => <DcimStatusChip s={r.status} /> }
  ];
  return (
    <section className="vw-card-section dcim-table">
      <DataTable rows={rows} cols={cols} pageSize={30} defaultSort={{ key: 'rack', dir: 'asc' }} onRow={r => nav(`/dcim/racks/${encodeURIComponent(r.id)}`)}
        toolbar={<ListToolbar shown={rows.length} total={racks.length} noun="racks" onApply={apply} search={{ value: q, onChange: v => set('q', v), placeholder: 'Rack, hall, role, tenant' }}
          filters={[
            { id: 'load', label: 'Condition', quick: true, value: load, anyLabel: 'Any condition', onChange: v => set('load', v), options: [
              { id: 'hot', label: 'Power ≥ 90% of budget', count: racks.filter(r => r.powerPct >= 90).length }, { id: 'side', label: 'One power side down', count: racks.filter(r => r.power !== 'A + B').length },
              { id: 'full', label: 'Under 4 U free', count: racks.filter(r => r.freeU < 4).length }, { id: 'empty', label: 'Empty', count: racks.filter(r => !r.devices).length }] },
            { id: 'density', label: 'Density', quick: true, value: dens, anyLabel: 'Any density', onChange: v => set('density', v), options: opts(racks, r => r.density) },
            { id: 'rst', label: 'Status', value: st, anyLabel: 'Any status', onChange: v => set('rst', v), options: opts(racks, r => r.status) }
          ]} />} />
    </section>
  );
}

/* ---------------------------------------------------------------- devices */

export function DevicesTab({ devices }: { devices: DcimDevice[] }) {
  const { get, set, apply } = useP();
  const q = get('q'), cat = get('cat'), st = get('dst');
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => devices.filter(d => (!cat || d.category === cat) && (!st || d.status === st) && has(`${d.name} ${d.model} ${d.manufacturer} ${d.serial} ${d.rackName} ${d.ip}`, q)), [devices, q, cat, st]);
  const cols: Col<DcimDevice>[] = [
    { key: 'dev', header: 'Device', sort: d => d.name, render: d => <span className="cell-2"><span className="vw-card-activity-label mono">{d.name}</span><small>{d.manufacturer} {d.model}</small></span> },
    { key: 'role', header: 'Role', sort: d => d.role, render: d => <span className="cell-2"><span className="row" style={{ gap: 6 }}><i className="dcim-dot" style={{ background: CAT_COLOR[d.category] }} />{d.role}</span><small>{CAT_LABEL[d.category]}</small></span> },
    { key: 'loc', header: 'Location', sort: d => `${d.dcId}${d.rackName}${String(d.u).padStart(3, '0')}`, render: d => <span className="cell-2"><span><Link className="ent-link" to={`/dcim/racks/${encodeURIComponent(d.rackId)}`} onClick={e => e.stopPropagation()}>{d.rackName}</Link> · U{d.u}{d.uHeight > 1 ? `–${d.u + d.uHeight - 1}` : ''}</span><small>{d.dcId} · {d.hallName}</small></span> },
    { key: 'ports', header: 'Ports', sort: d => d.ports, render: d => d.ports ? <span className="cell-2"><span>{d.portsUp}/{d.ports} up</span><small>{d.cables} cables</small></span> : <span className="vw-label">—</span> },
    { key: 'pw', header: 'Power', sort: d => d.powerW, render: d => <span className="cell-2"><span>{d.powerW ? `${fmtNum(d.powerW)} W` : '—'}</span><small>{d.psus} supply{d.psus === 1 ? '' : 'ies'}</small></span> },
    { key: 'sn', header: 'Serial', sort: d => d.serial, hideBelow: 1360, render: d => <span className="mono">{d.serial || '—'}</span> },
    { key: 'st', header: 'Status', sort: d => d.status, render: d => <DcimStatusChip s={d.status} /> }
  ];
  return (
    <section className="vw-card-section dcim-table">
      <DataTable rows={rows} cols={cols} pageSize={30} defaultSort={{ key: 'loc', dir: 'asc' }} onRow={d => setOpen(d.id)}
        toolbar={<ListToolbar shown={rows.length} total={devices.length} noun="devices" onApply={apply} search={{ value: q, onChange: v => set('q', v), placeholder: 'Name, model, serial, rack, IP' }}
          filters={[
            { id: 'cat', label: 'Category', quick: true, value: cat, anyLabel: 'Any category', onChange: v => set('cat', v), options: opts(devices, d => d.category, k => CAT_LABEL[k as DcimDevice['category']]) },
            { id: 'dst', label: 'Status', quick: true, value: st, anyLabel: 'Any status', onChange: v => set('dst', v), options: opts(devices, d => d.status) }
          ]} />} />
      <DeviceDrawer id={open} onClose={() => setOpen(null)} />
    </section>
  );
}

export function DeviceDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const nav = useNavigate();
  const { data } = useQuery(() => (id ? getDcimDevice(id) : Promise.resolve(null)), [id]);
  const { data: ips } = useQuery(() => (id ? getDeviceIps(id) : Promise.resolve(null)), [id]);
  const { data: lc } = useQuery(() => (id ? getDeviceLifecycle(id) : Promise.resolve(null)), [id]);
  const { data: sitePlan } = useQuery(() => (data?.device ? getIpam({ dcId: data.device.dcId }) : Promise.resolve(null)), [data?.device?.dcId]);
  const [kind, setKind] = useState<'Interface' | 'Power port' | 'Module bay' | 'other'>('Interface');
  const toast = useToast();
  const [conn, setConn] = useState<DcimComponent | null>(null);
  const [edit, setEdit] = useState<DcimComponent | null>(null);
  const [bay, setBay] = useState<string | null>(null);
  const [move, setMove] = useState(false);
  const [trace, setTrace] = useState<string | null>(null);
  const gate = useCrGate(toast);
  const { data: tags } = useQuery(() => (data?.device ? getDcimTags({ dcId: data.device.dcId }) : Promise.resolve({} as Record<string, string>)), [data?.device?.dcId]);
  const { data: work } = useQuery(() => (id ? getDcimWork({ neId: id }) : Promise.resolve([])), [id]);
  if (!id) return null;
  const d = data?.device;
  const comps = data?.components ?? [];
  const shown = comps.filter(c => (kind === 'other' ? c.kind === 'Console' || c.kind === 'Management' : c.kind === kind));
  const editable = !!d && d.status !== 'Tenant-owned';
  /* one-click edits ask for the change request they run under */
  const ask = (title: string, std: boolean, verb: string, run: Parameters<typeof gate.open>[0]['run'], done: string) => d && gate.open({ title, sub: `${d.name} · ${d.dcId}`, dcId: d.dcId, std, verb, run, done });
  const optics = comps.filter(c => c.kind === 'Interface' && c.detail && /dBm/.test(c.detail));
  const setSt = (to: 'Active' | 'Maintenance' | 'Decommissioning') => ask(`Set ${d?.name} to ${to}`, false, `Set to ${to}`, cr => setDeviceStatus(id, to, cr), `${d?.name} set to ${to}`);
  return (
    <Drawer open onClose={onClose} width={640} title={d ? <span className="mono">{d.name}</span> : 'Device'} sub={d ? `${d.manufacturer} ${d.model} · ${d.dcId} · ${d.rackName} U${d.u}` : 'Loading'}
      foot={d && <>
        <Btn variant="filled" icon={I.Activity} onClick={() => nav(`/ne/${encodeURIComponent(d.id)}`)}>Open device page</Btn>
        <Btn icon={I.Server} onClick={() => nav(`/dcim/racks/${encodeURIComponent(d.rackId)}`)}>Open rack</Btn>
        {editable && <Btn icon={I.MoveVertical} onClick={() => setMove(true)}>Move</Btn>}
        {d.status !== 'Tenant-owned' && d.status !== 'Planned' && <select className="select" aria-label="Lifecycle" value="" onChange={e => e.target.value && setSt(e.target.value as 'Active')}>
          <option value="">Set lifecycle…</option>{(['Active', 'Maintenance', 'Decommissioning'] as const).filter(x => x !== d.status).map(x => <option key={x} value={x}>{x}</option>)}
        </select>}
      </>}>
      {!d ? <Loading /> : <>
        <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}><DcimStatusChip s={d.status} />{d.status !== 'Planned' && d.status !== 'Tenant-owned' && <HealthChip s={d.health} />}<Chip tone="neutral">{d.role}</Chip><Chip tone="neutral">{d.uHeight}U</Chip>{d.purpose && <span className="vw-label" data-purpose>{d.purpose}</span>}<CrChip id={tags?.[`ne:${d.id}`]} /></div>
        <KV cols={3} items={[['Serial', <span className="mono">{d.serial || '—'}</span>], ['Asset tag', <span className="mono">{d.assetTag}</span>], ['Management IP', <span className="mono">{d.ip || '—'}</span>],
          ['Platform', d.platform], ['Hall', d.hallName], ['Draw', d.powerW ? `${fmtNum(d.powerW)} W` : '—'],
          ...(lc?.life && lc.life.state !== 'Planned' && lc.life.state !== 'Tenant-owned' ? [
            ['Installed', fmtDate(lc.life.installed)],
            ['Warranty', <span className={lc.life.warrantyEnd < clockNow() ? 'warn' : undefined} data-warranty>{lc.life.warrantyEnd < clockNow() ? 'Ended' : 'Until'} {fmtDate(lc.life.warrantyEnd)}</span>],
            ['Vendor support', <span title={`End of sale ${fmtDate(lc.life.endOfSale)}`} data-eos>{lc.life.endOfSupport < clockNow() ? 'Ended' : 'Until'} {fmtDate(lc.life.endOfSupport)}{lc.life.endOfSale < clockNow() ? ' · end of sale passed' : ''}</span>]] as [string, React.ReactNode][] : [])]} />
        {ips && <>
          <b className="dcim-sub-h">IP addresses ({ips.addresses.length}) <Link className="ent-link" style={{ fontWeight: 400 }} to={`/ipam?tab=addresses&q=${encodeURIComponent(d.name)}`}>in IP & Network →</Link></b>
          <DeviceAddresses neId={d.id} name={d.name} dcId={d.dcId} addrs={ips.addresses} prefixes={sitePlan?.prefixes ?? []} ifaces={comps.filter(c => c.kind === 'Interface').map(c => c.name)} onChanged={toast.show} />
        </>}
        {!!work?.length && <><b className="dcim-sub-h">Change requests on this device ({work.length})</b><CrWorkList items={work} /></>}
        <div className="row" style={{ justifyContent: 'space-between', margin: '16px 0 8px' }}>
          <b>Components</b>
          <Seg size="sm" value={kind} onChange={setKind} options={[{ id: 'Interface', label: `Ports ${comps.filter(c => c.kind === 'Interface').length}` }, { id: 'Power port', label: `Power ${comps.filter(c => c.kind === 'Power port').length}` }, { id: 'Module bay', label: `Bays ${comps.filter(c => c.kind === 'Module bay').length}` }, { id: 'other', label: `Mgmt ${comps.filter(c => c.kind === 'Console' || c.kind === 'Management').length}` }]} />
        </div>
        <table className="nst-table dt-table dcim-comp">
          <thead><tr><th>Name</th><th>Type</th><th>{kind === 'Module bay' ? 'Module' : 'Connected to'}</th><th>State</th>{editable && (kind === 'Interface' || kind === 'Module bay') && <th aria-label="Actions" />}</tr></thead>
          <tbody>{shown.map(c => (
            <tr key={c.id}>
              <td className="mono">{c.name}</td>
              <td><span className="cell-2"><span>{c.type}</span>{c.speedMbps ? <small>{fmtBw(c.speedMbps)}</small> : c.detail && <small>{c.detail}</small>}</span></td>
              <td>{c.peer ? <span className="cell-2"><span className="mono">{c.peer.deviceName}</span><small>{c.peer.port}</small></span> : <span className="vw-label">—</span>}</td>
              <td><span className="row" style={{ gap: 6 }}><Chip tone={c.state === 'Connected' ? 'success' : c.state === 'Down' || c.state === 'Failed' ? 'error' : 'neutral'} dot>{kind === 'Module bay' && c.state === 'Connected' ? 'Installed' : c.state}</Chip><CrChip id={tags?.[`${kind === 'Module bay' ? 'mod' : 'if'}:${d!.id}|${c.name}`]} /></span></td>
              {editable && kind === 'Interface' && <td className="dcim-acts">
                {c.peer ? <>
                  {c.cableId?.startsWith('CB-') && <button type="button" title="Trace the cable" onClick={() => setTrace(c.cableId!.slice(3))}><I.Route size={14} /></button>}
                  <button type="button" title="Disconnect" onClick={() => ask(`Disconnect ${c.name}`, true, 'Disconnect', cr => dcimDisconnect(d!.id, c.name, cr), `${c.name} disconnected from ${c.peer!.deviceName} ${c.peer!.port}`)}><I.Unplug size={14} /></button>
                </> : c.state !== 'Disabled' && <button type="button" title="Connect a cable" onClick={() => setConn(c)}><I.Cable size={14} /></button>}
                <button type="button" title="Edit interface" onClick={() => setEdit(c)}><I.Pencil size={14} /></button>
              </td>}
              {editable && kind === 'Module bay' && <td className="dcim-acts">
                {c.state === 'Empty' ? <button type="button" title="Install a module" onClick={() => setBay(c.name)}><I.Plus size={14} /></button> : <>
                  <button type="button" title={c.state === 'Failed' ? 'Replace the faulty module' : 'Swap for a spare'} onClick={() => ask(`Replace the module in ${c.name}`, /^(PSU|PEM|FAN)/.test(c.name), 'Replace', cr => dcimSwapModule(d!.id, c.name, cr), `${c.name} replaced; the old part goes to RMA`)}><I.RefreshCw size={14} /></button>
                  {/^(FPC|DISK)/.test(c.name) && <button type="button" title="Remove the module" onClick={() => ask(`Remove the module in ${c.name}`, false, 'Remove', cr => dcimRemoveModule(d!.id, c.name, cr), `${c.name} removed`)}><I.Trash2 size={14} /></button>}
                </>}
              </td>}
            </tr>
          ))}</tbody>
        </table>
        {!shown.length && <p className="vw-label">{kind === 'Module bay' ? 'No module bays on this device type.' : 'None recorded.'}</p>}
        {kind === 'Module bay' && optics.length > 0 && <>
          <b className="dcim-sub-h">Inventory items · optics ({optics.length})</b>
          <div className="row wrap" style={{ gap: 6 }}>{optics.slice(0, 40).map(c => <Chip key={c.id} tone="neutral" title={c.detail}><span className="mono">{c.name}</span> · {c.detail!.split(' · ')[0]}</Chip>)}{optics.length > 40 && <span className="vw-label">+{optics.length - 40}</span>}</div>
        </>}
      </>}
      {d && <>
        <ConnectModal port={conn && { deviceId: d.id, deviceName: d.name, dcId: d.dcId, name: conn.name, speedMbps: conn.speedMbps }} onClose={() => setConn(null)} onDone={(t, r) => { setConn(null); showCr(toast, t, r, 'The cable appears in Cabling, on both devices and in the cable path view.'); }} />
        <InterfaceModal port={edit && { deviceId: d.id, dcId: d.dcId, c: edit }} onClose={() => setEdit(null)} onDone={(t, r) => { setEdit(null); showCr(toast, t, r); }} />
        <ModuleModal bay={bay ? { deviceId: d.id, dcId: d.dcId, model: d.model, slot: bay } : null} onClose={() => setBay(null)} onDone={(t, r) => { setBay(null); showCr(toast, t, r); }} />
        <MoveModal dev={move ? { id: d.id, name: d.name, dcId: d.dcId, rackId: d.rackId, u: d.u, uHeight: d.uHeight, powerW: d.powerW } : null} onClose={() => setMove(false)} onDone={(t, r) => { setMove(false); showCr(toast, t, r, 'The rack, the floor plan and the twin show the new position.'); }} />
        <CablePathDrawer linkId={trace} onClose={() => setTrace(null)} />
        {gate.node}
      </>}
      {toast.node}
    </Drawer>
  );
}

/* ---------------------------------------------------------------- cabling */

export function CablingTab({ cables }: { cables: DcimCable[] }) {
  const { get, set, apply } = useP();
  const q = get('q'), kind = get('ckind') || 'Data', route = get('route'), cst = get('cst');
  const [path, setPath] = useState<string | null>(null);
  const [rack, setRack] = useState<{ dcId: string; rackId: string } | null>(null);
  const pool = cables.filter(c => c.kind === kind);
  const rows = useMemo(() => pool.filter(c => (!route || c.route === route) && (!cst || (cst === 'issue' ? c.status !== 'Connected' && c.status !== 'Planned' : c.status === cst))
    && has(`${c.aName} ${c.aPort} ${c.zName} ${c.zPort} ${c.type} ${c.via} ${c.aRack} ${c.zRack}`, q)), [pool, q, route, cst]);
  const cols: Col<DcimCable>[] = [
    { key: 'a', header: kind === 'Power' ? 'Device supply' : 'A end', wrap: true, sort: c => `${c.aName}${c.aPort}`, render: c => <span className="cell-2"><span className="mono">{c.aName} <b>{c.aPort}</b></span><small>{c.aRack}</small></span> },
    { key: 'z', header: kind === 'Power' ? 'PDU outlet' : 'Z end', wrap: true, sort: c => `${c.zName}${c.zPort}`, render: c => <span className="cell-2"><span className="mono">{c.zName} <b>{c.zPort}</b></span><small>{c.zRack}</small></span> },
    { key: 'type', header: 'Cable', sort: c => c.type, render: c => <span className="cell-2"><span className="nowrap">{c.type}</span><small className="nowrap">{c.route}{c.lengthM ? ` · ${c.lengthM} m` : ''}</small></span> },
    { key: 'via', header: kind === 'Power' ? 'Fed from' : 'Route', sort: c => c.via, wrap: true, render: c => <span className="dcim-via">{c.via}</span> },
    { key: 'st', header: 'Status', sort: c => (c.status === 'Connected' ? 0 : c.status === 'Planned' ? 1 : 2), render: c => <Chip tone={c.status === 'Connected' ? 'success' : c.status === 'Planned' ? 'info' : 'error'} dot>{c.status}</Chip> }
  ];
  return (
    <section className="vw-card-section dcim-table">
      <DataTable rows={rows} cols={cols} pageSize={30} defaultSort={{ key: 'st', dir: 'desc' }}
        onRow={c => (c.linkId ? setPath(c.linkId) : setRack({ dcId: c.dcId, rackId: rackOfPdu(c.zDevice) }))}
        toolbar={<ListToolbar shown={rows.length} total={pool.length} noun={kind === 'Power' ? 'power cords' : 'data cables'} onApply={apply} search={{ value: q, onChange: v => set('q', v), placeholder: 'Device, port, rack, panel, trunk' }}
          filters={[
            { id: 'ckind', label: 'Cables', quick: true, value: kind, defaultValue: 'Data', onChange: v => set('ckind', v === 'Data' ? '' : v), options: [{ id: 'Data', label: 'Data cables', count: cables.filter(c => c.kind === 'Data').length }, { id: 'Power', label: 'Power cords', count: cables.filter(c => c.kind === 'Power').length }] },
            { id: 'cst', label: 'Status', quick: true, value: cst, anyLabel: 'Any status', onChange: v => set('cst', v), options: [{ id: 'issue', label: 'Not connected', count: pool.filter(c => c.status !== 'Connected' && c.status !== 'Planned').length }, ...opts(pool, c => c.status)] },
            ...(kind === 'Data' ? [{ id: 'route', label: 'Route', value: route, anyLabel: 'Any route', onChange: (v: string) => set('route', v), options: opts(pool, c => c.route) }] : [])
          ]} />} />
      <CablePathDrawer linkId={path} onClose={() => setPath(null)} />
      {rack && <RackPower dcId={rack.dcId} rackId={rack.rackId} onClose={() => setRack(null)} />}
    </section>
  );
}
/* a PDU id is `${rackId}-PDU-A` / `${rackId}-BDFB-B` */
const rackOfPdu = (pduId: string) => pduId.replace(/-(PDU|BDFB)-[AB]$/, '');

function RackPower({ dcId, rackId, onClose }: { dcId: string; rackId: string; onClose: () => void }) {
  const { data } = useQuery(() => getDatacenter(dcId), [dcId]);
  if (!data) return null;
  return <RackPowerDrawer dc={data.dc} rackId={rackId} onClose={onClose} />;
}

/* ---------------------------------------------------------------- power */

export function PowerTab({ panels, feeds, dcId }: { panels: DcimPowerPanel[]; feeds: DcimPowerFeed[]; dcId: string }) {
  const { get, set, apply } = useP();
  const toast = useToast();
  const [form, setForm] = useState<'panel' | 'feed' | null>(null);
  const q = get('q'), side = get('side'), fst = get('fst');
  const [panel, setPanel] = useState('');
  const [rack, setRack] = useState<{ dcId: string; rackId: string } | null>(null);
  const { data: tags } = useQuery(() => getDcimTags({ dcId: dcId || undefined }), [dcId]);
  const fRows = useMemo(() => feeds.filter(f => (!panel || f.panelId === panel) && (!side || f.side === side) && (!fst || f.state === fst) && has(`${f.rackName} ${f.hallName} ${f.name} ${f.dcId}`, q)), [feeds, panel, side, fst, q]);
  const pCols: Col<DcimPowerPanel>[] = [
    { key: 'p', header: 'Distribution', sort: p => `${p.dcId}${p.hallName}${p.side}`, render: p => <span className="cell-2"><span className="vw-card-activity-label">{p.name}{p.manual && <Chip tone="info" size="xs">New</Chip>}<CrChip id={tags?.[`panel:${p.id}`]} /></span><small>{p.dcId}{p.hallName && !p.name.includes(p.hallName) ? ` · ${p.hallName}` : ''}</small></span> },
    { key: 'src', header: 'Fed from', sort: p => p.source, render: p => <span className="cell-2"><span>{p.source}</span><small style={{ color: p.sourceState === 'On battery' || p.sourceState === 'Fault' ? BAD : undefined }}>{p.sourceState === 'Rectifier' ? '−48 V plant' : p.sourceState} · {p.utility}</small></span> },
    { key: 'f', header: 'Rack PDUs', sort: p => p.feeds, render: p => fmtNum(p.feeds) },
    { key: 'load', header: 'Load', sort: p => p.loadKw / (p.capacityKw || 1), render: p => <Meter pct={pct(p.loadKw, p.capacityKw)} width={56} color={loadColor(pct(p.loadKw, p.capacityKw))} label={`${fmtKw(p.loadKw)} of ${fmtKw(p.capacityKw)}`} /> },
    { key: 'st', header: 'State', sort: p => p.state, render: p => <Chip tone={p.state === 'ok' ? 'success' : p.state === 'warn' ? 'warning' : 'error'} dot>{p.state === 'ok' ? 'Normal' : p.state === 'warn' ? 'Attention' : 'Fault'}</Chip> }
  ];
  const fCols: Col<DcimPowerFeed>[] = [
    { key: 'r', header: 'Rack PDU', sort: f => `${f.dcId}${f.rackName}${f.name}`, render: f => <span className="cell-2"><span className="vw-card-activity-label">{f.rackName} · {f.name}{f.manual && <Chip tone="info" size="xs">New</Chip>}<CrChip id={tags?.[`feed:${f.id}`]} /></span><small>{f.dcId} · {f.hallName}</small></span> },
    { key: 'e', header: 'Electrical', sort: f => f.capacityKw, render: f => <span className="cell-2"><span>{f.kind === 'DC' ? '−48 V DC' : `${f.volts} V · ${f.phases}-phase · ${f.amps} A`}</span><small>rated {fmtKw(f.capacityKw)}</small></span> },
    { key: 'load', header: 'Load', sort: f => f.pct, render: f => <Meter pct={f.pct} width={56} color={loadColor(f.pct)} label={fmtKw(f.loadKw)} /> },
    { key: 'o', header: 'Outlets', sort: f => f.cords / f.outlets, render: f => `${f.cords} of ${f.outlets}` },
    { key: 'st', header: 'State', sort: f => f.state, render: f => { const s = pduState({ state: f.state } as never); return <span className="cell-2"><Chip tone={STATE_TONE[s.s]} dot>{s.label}</Chip>{f.note && <small className="dcim-note" title={f.note}>{f.note}</small>}</span>; } }
  ];
  return (
    <div className="dcim-power">
      <Panel title="Distribution" icon={I.Zap} count={panels.length} flush actions={<span className="row" style={{ gap: 6 }}><Btn size="sm" icon={I.Plus} disabled={!dcId} title={dcId ? undefined : 'Pick a datacenter in the scope selector first'} onClick={() => setForm('panel')}>New panel</Btn><Btn size="sm" icon={I.PlugZap} disabled={!dcId} title={dcId ? undefined : 'Pick a datacenter in the scope selector first'} onClick={() => setForm('feed')}>New feed</Btn></span>} info="Each hall has an A and a B busway; each hangs off one UPS module (or the −48 V plant for DC-powered telecom gear). Click one to list the rack PDUs it feeds.">
        <DataTable rows={panels} cols={pCols} pageSize={12} onRow={p => setPanel(panel === p.id ? '' : p.id)} rowClass={p => (p.id === panel ? 'is-selected' : '')} defaultSort={{ key: 'p', dir: 'asc' }} />
      </Panel>
      <section className="vw-card-section dcim-table">
        <DataTable rows={fRows} cols={fCols} pageSize={20} defaultSort={{ key: 'load', dir: 'desc' }} onRow={f => setRack({ dcId: f.dcId, rackId: f.rackId })}
          toolbar={<ListToolbar shown={fRows.length} total={feeds.length} noun="rack PDUs" onApply={apply} search={{ value: q, onChange: v => set('q', v), placeholder: 'Rack, hall, PDU' }}
            filters={[
              { id: 'side', label: 'Side', quick: true, value: side, anyLabel: 'Both sides', onChange: v => set('side', v), options: [{ id: 'A', label: 'A side', count: feeds.filter(f => f.side === 'A').length }, { id: 'B', label: 'B side', count: feeds.filter(f => f.side === 'B').length }] },
              { id: 'fst', label: 'State', quick: true, value: fst, anyLabel: 'Any state', onChange: v => set('fst', v), options: opts(feeds, f => f.state, k => pduState({ state: k } as never).label) }
            ]}>{panel && <Chip tone="info">{panels.find(p => p.id === panel)?.name}<button type="button" className="dcim-chip-x" onClick={() => setPanel('')} aria-label="Clear panel">×</button></Chip>}</ListToolbar>} />
      </section>
      {rack && <RackPower dcId={rack.dcId} rackId={rack.rackId} onClose={() => setRack(null)} />}
      <PanelModal open={form === 'panel'} dcId={dcId} onClose={() => setForm(null)} onDone={(t, r) => { setForm(null); showCr(toast, t, r, 'It is listed under Distribution; add feeds to give racks a circuit from it.'); }} />
      <FeedModal open={form === 'feed'} dcId={dcId} onClose={() => setForm(null)} onDone={(t, r) => { setForm(null); showCr(toast, t, r, 'The rack PDU appears in the feed list with no cords yet.'); }} />
      {toast.node}
    </div>
  );
}

/* ---------------------------------------------------------------- catalogue */

export function TypesTab({ types, inScope }: { types: { types: DcimDeviceType[]; modules: DcimModuleType[]; catalog: DcimCatalog }; inScope: Set<string> }) {
  const { get, set, apply } = useP();
  const nav = useNavigate();
  const view = (get('cv') || 'types') as 'types' | 'modules' | 'mfr' | 'platforms';
  const q = get('q'), cat = get('cat');
  const [add, setAdd] = useState(false);
  const [form, setForm] = useState<'module' | 'import' | null>(null);
  const toast = useToast();
  const all = types.types;
  const rows = useMemo(() => all.filter(t => (!cat || t.category === cat) && has(`${t.manufacturer} ${t.model} ${t.role} ${t.platform}`, q)), [all, q, cat]);
  const tCols: Col<DcimDeviceType>[] = [
    { key: 't', header: 'Device type', sort: t => `${t.manufacturer}${t.model}`, render: t => <span className="cell-2"><span className="vw-card-activity-label">{t.manufacturer} {t.model}</span><small>{t.description}</small></span> },
    { key: 'role', header: 'Role', sort: t => t.role, render: t => <span className="row" style={{ gap: 6 }}><i className="dcim-dot" style={{ background: CAT_COLOR[t.category] }} />{t.role}{t.custom && <Chip tone="info" size="xs">New</Chip>}</span> },
    { key: 'u', header: 'Height', sort: t => t.uHeight, render: t => `${t.uHeight}U${t.fullDepth ? ' · full depth' : ''}` },
    { key: 'ports', header: 'Ports', sort: t => t.ports.reduce((a, p) => a + p.count, 0), wrap: true, render: t => t.ports.length ? t.ports.map(p => `${p.count}× ${p.type}`).join(' · ') : <span className="vw-label">—</span> },
    { key: 'pw', header: 'Power', sort: t => t.typicalW, render: t => <span className="cell-2"><span>{t.psus} supplies</span><small>{t.typicalW ? `${fmtNum(t.typicalW)} W typical` : 'no reading yet'}</small></span> },
    { key: 'n', header: 'In use', sort: t => t.devices, render: t => <span className="cell-2"><span className="dcl-num">{fmtNum(t.devices)}</span><small>{t.sites} site{t.sites === 1 ? '' : 's'}{inScope.has(t.id) ? '' : ' · not in scope'}</small></span> }
  ];
  const mCols: Col<DcimModuleType>[] = [
    { key: 'n', header: 'Module', sort: m => m.name, render: m => <span className="cell-2"><span className="vw-card-activity-label">{m.name}{m.custom && <Chip tone="info" size="xs">New</Chip>}</span>{m.ports && <small>adds {m.ports.count}× {m.ports.type}</small>}</span> },
    { key: 'k', header: 'Kind', sort: m => m.kind, render: m => m.kind },
    { key: 'f', header: 'Fits', wrap: true, render: m => m.fits.slice(0, 4).join(', ') + (m.fits.length > 4 ? ` +${m.fits.length - 4}` : '') },
    { key: 'i', header: 'Installed', sort: m => m.installed, render: m => fmtNum(m.installed) },
    { key: 'x', header: 'Faulty', sort: m => m.faulty, render: m => m.faulty ? <span style={{ color: BAD }}>{m.faulty}</span> : <span className="vw-label">0</span> }
  ];
  return (
    <section className="vw-card-section dcim-table">
      <div className="dcim-sub-bar">
        <Seg value={view} onChange={v => set('cv', v === 'types' ? '' : v)} options={[{ id: 'types', label: `Device types ${all.length}` }, { id: 'modules', label: `Module types ${types.modules.length}` }, { id: 'mfr', label: `Manufacturers ${types.catalog.manufacturers.length}` }, { id: 'platforms', label: `Platforms ${types.catalog.platforms.length}` }]} />
        {view === 'types' && <span className="row" style={{ gap: 6 }}><Btn icon={I.Upload} onClick={() => setForm('import')}>Import JSON</Btn><Btn icon={I.Plus} onClick={() => setAdd(true)}>New device type</Btn></span>}
        {view === 'modules' && <Btn icon={I.Plus} onClick={() => setForm('module')}>New module type</Btn>}
      </div>
      {view === 'types' && <DataTable rows={rows} cols={tCols} pageSize={30} defaultSort={{ key: 'n', dir: 'desc' }} onRow={t => nav(`/dcim/types/${encodeURIComponent(t.id)}`)}
        toolbar={<ListToolbar shown={rows.length} total={all.length} noun="device types" onApply={apply} search={{ value: q, onChange: v => set('q', v), placeholder: 'Manufacturer, model, role, platform' }}
          filters={[{ id: 'cat', label: 'Category', quick: true, value: cat, anyLabel: 'Any category', onChange: v => set('cat', v), options: opts(all, t => t.category, k => CAT_LABEL[k as DcimDeviceType['category']]) }]} />} />}
      {view === 'modules' && <DataTable rows={types.modules} cols={mCols} pageSize={30} defaultSort={{ key: 'i', dir: 'desc' }} />}
      {view === 'mfr' && <DataTable rows={types.catalog.manufacturers.map(m => ({ ...m, id: m.name }))} pageSize={30} defaultSort={{ key: 'd', dir: 'desc' }} cols={[
        { key: 'n', header: 'Manufacturer', sort: m => m.name, render: m => <span className="vw-card-activity-label">{m.name}</span> },
        { key: 't', header: 'Device types', sort: m => m.types, render: m => m.types },
        { key: 'd', header: 'Devices', sort: m => m.devices, render: m => fmtNum(m.devices) }]} />}
      {view === 'platforms' && <DataTable rows={types.catalog.platforms.map(m => ({ ...m, id: m.name }))} pageSize={30} defaultSort={{ key: 'd', dir: 'desc' }} cols={[
        { key: 'n', header: 'Platform / OS', sort: m => m.name, render: m => <span className="vw-card-activity-label">{m.name}</span> },
        { key: 'd', header: 'Devices', sort: m => m.devices, render: m => fmtNum(m.devices) }]} />}
      <NewTypeModal open={add} onClose={() => setAdd(false)} />
      <ModuleTypeModal open={form === 'module'} types={all} onClose={() => setForm(null)} onDone={t => { setForm(null); toast.show(t, 'Install it from a device drawer → Bays.'); }} />
      <ImportTypesModal open={form === 'import'} onClose={() => setForm(null)} onDone={t => toast.show(t)} />
      {toast.node}
    </section>
  );
}
