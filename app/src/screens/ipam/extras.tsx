/* IP & Network additions (14-Oct-2026, user: port P2B's address detail, exhaustion forecast, new prefix, device address actions,
   reference registers and integrations — in our own design). Data comes from mock/ipam.ts through api/index.ts. */
import { useState } from 'react';
import * as I from 'lucide-react';
import { assignDeviceIp, createPrefix, getIpAddress, getIpamIntegrations, setPrimaryIp, syncIpamIntegration, unassignIp, useQuery } from '../../api';
import type { IpAddr, IpIntegration, IpPrefix, IpamView, PrefixRole } from '../../api/types';
import { Btn, Chip, Drawer, Field, Info, Modal, Seg } from '../../ui/kit';
import { DataTable } from '../../ui/DataTable';
import { Meter, NeLink } from '../../ui/status';
import { SummaryStrip } from '../site/SummaryStrip';
import { fmtDate, fmtDateTime, fmtNum } from '../../lib/format';
import { loadColor } from '../dcim/common';
import '../../styles/ipam.css';

export const STATE_TONE = { Available: 'success', Committed: 'warning', Consumed: 'error' } as const;
const ROLES: PrefixRole[] = ['Management', 'Production', 'Storage', 'Loopback', 'Point-to-point', 'Backbone', 'Customer', 'Public'];

/* "full by" for one prefix: a date when it is growing, otherwise why there is no date */
export function FullBy({ p, compact }: { p: IpPrefix; compact?: boolean }) {
  if (!p.state) return <span className="vw-label">—</span>;
  if (p.exhaustAt != null && p.growth && (p.size - p.used) / p.growth > 120) return <span className="ipam-fullby"><b>Beyond 10 years</b>{!compact && <small>+{p.growth} addresses / month</small>}</span>;
  if (p.exhaustAt == null) return <span className="ipam-fullby"><b>No growth</b>{!compact && <small>no device added in 12 months</small>}</span>;
  return <span className="ipam-fullby"><b className={p.state !== 'Available' ? `is-${p.state.toLowerCase()}` : ''}>{fmtDate(p.exhaustAt)}</b>{!compact && <small>+{p.growth} addresses / month</small>}</span>;
}

/* ---------------------------------------------------------------- address detail drawer */
export function AddressDrawer({ id, onClose, onPrefix, onAddress, toast }: { id: string | null; onClose: () => void; onPrefix: (id: string) => void; onAddress: (id: string) => void; toast: (t: string, b?: string) => void }) {
  const { data: d } = useQuery(() => (id ? getIpAddress(id) : Promise.resolve(null)), [id]);
  if (!id || !d) return null;
  const a = d.addr;
  const act = (p: Promise<unknown>, ok: string, body?: string) => p.then(() => toast(ok, body)).catch(e => toast('Not changed', String(e.message ?? e)));
  return (
    <Drawer open onClose={onClose} width={600} title={<span className="mono">{a.address}/{a.mask}</span>} sub={`${a.use} · ${a.vrf}`}
      foot={a.deviceId ? <>
        <Btn icon={I.Star} disabled={a.primary} onClick={() => act(setPrimaryIp(a.deviceId!, a.id), `${a.address} is now the primary IPv4 of ${a.deviceName}`)}>{a.primary ? 'Primary IPv4' : 'Set as primary'}</Btn>
        <Btn icon={I.Unlink} disabled={a.use === 'Gateway (VIP)'} onClick={() => act(unassignIp(a.id), `${a.address} unassigned from ${a.deviceName}`, 'It stays reserved in its prefix until it is released or re-used.')}>Unassign</Btn>
        <span style={{ flex: 1 }} />{d.prefix && <Btn variant="filled" icon={I.Network} onClick={() => onPrefix(d.prefix!.id)}>Open prefix</Btn>}
      </> : d.prefix && <><span style={{ flex: 1 }} /><Btn variant="filled" icon={I.Network} onClick={() => onPrefix(d.prefix!.id)}>Open prefix</Btn></>}>
      <div className="row wrap" style={{ gap: 6, marginBottom: 14 }}>
        <Chip tone={a.status === 'Active' ? 'success' : a.status === 'Reserved' ? 'info' : a.status === 'Conflict' ? 'error' : a.status === 'Outside plan' ? 'warning' : 'neutral'} dot>{a.status}</Chip>
        {a.primary && <Chip tone="info" size="xs">Primary IPv4</Chip>}
        {d.prefix && <Chip tone="neutral" size="xs">{d.prefix.role}</Chip>}
      </div>
      <div className="ipam-bind">
        <div className="ipam-bind-node"><span className="ipam-bind-ico"><I.Server size={16} /></span><span><small>Bound to</small>{a.deviceId ? <NeLink id={a.deviceId}>{a.deviceName}</NeLink> : <b>{a.deviceName ?? 'Not on a device'}</b>}</span></div>
        <I.ArrowRight size={14} className="ipam-bind-arrow" />
        <div className="ipam-bind-node"><span className="ipam-bind-ico"><I.EthernetPort size={16} /></span><span><small>Interface</small><b className="mono">{a.iface ?? '—'}</b></span></div>
        <I.ArrowRight size={14} className="ipam-bind-arrow" />
        <div className="ipam-bind-node"><span className="ipam-bind-ico"><I.Network size={16} /></span><span><small>Prefix</small>{d.prefix ? <button type="button" className="ent-link mono" onClick={() => onPrefix(d.prefix!.id)}>{d.prefix.prefix}</button> : <b>Outside every prefix</b>}</span></div>
      </div>
      <dl className="ipam-facts">
        <div><dt>DNS name</dt><dd className="mono">{a.dns || '—'}</dd></div>
        <div><dt>MAC address</dt><dd className="mono">{a.mac ?? '—'}</dd></div>
        <div><dt>VRF</dt><dd className="mono">{a.vrf}</dd></div>
        <div><dt>Site</dt><dd>{a.dcId ?? 'Estate-wide'}</dd></div>
        <div><dt>VLAN</dt><dd>{d.vlan ? <><span className="mono">{d.vlan.vid}</span> · {d.vlan.name}</> : '—'}</dd></div>
        <div><dt>Prefix usage</dt><dd>{d.prefix ? <Meter pct={d.prefix.pct} width={70} color={loadColor(d.prefix.pct)} label={`${fmtNum(d.prefix.used)}/${fmtNum(d.prefix.size)}`} /> : '—'}</dd></div>
      </dl>
      {a.note && <p className="ipam-note"><I.Info size={14} />{a.note}</p>}

      <h5 className="ipam-h5">Gateway group</h5>
      {d.fhrp ? <div className="ipam-gwcard">
        <span className="ipam-bind-ico"><I.Route size={16} /></span>
        <span><b>{d.fhrp.protocol} group {d.fhrp.group}</b><small>{d.fhrpRole === 'Virtual IP' ? 'This address is the virtual gateway' : `This device is a member; virtual IP ${d.fhrp.vip}`} · members {d.fhrp.members.map(x => x.split('-').slice(-2).join('-')).join(', ')}</small></span>
        <Chip tone={d.fhrp.state === 'ok' ? 'success' : 'error'} size="xs" dot>{d.fhrp.state === 'ok' ? 'Redundant' : 'No redundancy'}</Chip>
      </div> : <p className="vw-label">Not part of a VRRP / HSRP group.</p>}

      <h5 className="ipam-h5">Services on this address ({d.services.length})</h5>
      {d.services.length ? <div className="row wrap" style={{ gap: 6 }}>{d.services.map(x => <Chip key={x.id} tone="neutral"><b>{x.name}</b>&nbsp;<span className="mono">{x.protocol} {x.ports.join(', ')}</span></Chip>)}</div> : <p className="vw-label">No service listens on it.</p>}

      {d.sameDevice.length > 0 && <>
        <h5 className="ipam-h5">Other addresses on {a.deviceName} ({d.sameDevice.length})</h5>
        <ul className="ipam-mini">{d.sameDevice.slice(0, 12).map(x => <li key={x.id}><button type="button" onClick={() => onAddress(x.id)}><span className="mono">{x.address}/{x.mask}</span><small>{x.iface ?? x.use} · {x.vrf}</small>{x.primary && <Chip tone="info" size="xs">Primary</Chip>}<I.ChevronRight size={13} /></button></li>)}</ul>
      </>}
    </Drawer>
  );
}

/* ---------------------------------------------------------------- new prefix */
export function NewPrefixModal({ open, m, onClose, onDone, dcId }: { open: boolean; m: IpamView; onClose: () => void; onDone: (id: string) => void; dcId?: string }) {
  const containers = m.prefixes.filter(p => p.status === 'Container' && (!dcId || p.dcId === dcId));
  const [prefix, setPrefix] = useState('');
  const [parentId, setParent] = useState('');
  const [vrf, setVrf] = useState('DEFAULT');
  const [role, setRole] = useState<PrefixRole | ''>('');
  const [vlan, setVlan] = useState('');
  const [pool, setPool] = useState(false);
  const [desc, setDesc] = useState('');
  const [err, setErr] = useState('');
  const parent = containers.find(c => c.id === parentId);
  const go = () => createPrefix({ prefix, parentId: parentId || undefined, vrf: parent?.vrf ?? vrf, role: (role || parent?.role || 'Production') as PrefixRole, dcId: parent?.dcId ?? dcId, vlan: vlan ? Number(vlan) : undefined, pool, description: desc })
    .then(p => { setPrefix(''); setDesc(''); setErr(''); onDone(p.id); }).catch(e => setErr(String(e.message ?? e)));
  return (
    <Modal open={open} onClose={onClose} width={600} title="New prefix" sub="Enter a block by hand. It must sit on its own boundary, inside its container, and not overlap anything in the VRF; it starts as Reserved."
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.Plus} disabled={!prefix.trim()} onClick={go}>Create prefix</Btn></>}>
      <div className="dcim-form">
        <Field label="Prefix (CIDR)" required><input className="input mono" value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="e.g. 10.4.200.0/24" autoFocus /></Field>
        <Field label="Parent container" hint="Role and VRF are inherited when left blank"><select className="select" value={parentId} onChange={e => setParent(e.target.value)}><option value="">Top level (no container)</option>{containers.map(c => <option key={c.id} value={c.id}>{c.prefix} · {c.description}</option>)}</select></Field>
        <Field label="VRF"><select className="select" value={parent?.vrf ?? vrf} disabled={!!parent} onChange={e => setVrf(e.target.value)}>{m.vrfs.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
        <Field label="Role"><select className="select" value={role} onChange={e => setRole(e.target.value as PrefixRole)}><option value="">{parent ? `Inherit (${parent.role})` : 'Production'}</option>{ROLES.map(r => <option key={r}>{r}</option>)}</select></Field>
        <Field label="VLAN" hint="Optional"><input className="input mono" inputMode="numeric" value={vlan} onChange={e => setVlan(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 204" /></Field>
        <Field label="Address pool"><label className="ipam-check"><input type="checkbox" checked={pool} onChange={e => setPool(e.target.checked)} /><span>Treat every address as usable (no network / broadcast), e.g. NAT or loopback pools</span></label></Field>
        <Field label="Description" style={{ gridColumn: '1 / -1' }}><input className="input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Hall C GPU expansion" /></Field>
        {err && <p className="dcim-err" style={{ gridColumn: '1 / -1' }}>{err}</p>}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- device addresses (DCIM device drawer) */
export function DeviceAddresses({ neId, name, dcId, addrs, prefixes, ifaces, onChanged }: { neId: string; name: string; dcId: string; addrs: IpAddr[]; prefixes: IpPrefix[]; ifaces: string[]; onChanged: (t: string, b?: string) => void }) {
  const [adding, setAdding] = useState(false);
  const targets = prefixes.filter(p => p.dcId === dcId && p.status !== 'Container' && p.role !== 'Point-to-point' && p.used < p.size).sort((a, b) => a.role.localeCompare(b.role) || a.prefix.localeCompare(b.prefix));
  const [pfx, setPfx] = useState('');
  const [iface, setIface] = useState('');
  const [primary, setPrimary] = useState(false);
  const run = (p: Promise<unknown>, ok: string, body?: string) => p.then(() => onChanged(ok, body)).catch(e => onChanged('Not changed', String(e.message ?? e)));
  const assign = () => { const p = targets.find(x => x.id === pfx); if (!p) return; run(assignDeviceIp(neId, p.id, iface || undefined, primary).then(a => { setAdding(false); setPfx(''); setIface(''); setPrimary(false); return a; }), `Address from ${p.prefix} assigned to ${name}`, primary ? 'It is now the primary IPv4.' : undefined); };
  return (
    <div className="ipam-devaddr">
      <ul>{addrs.map(a => (
        <li key={a.id} className={a.primary ? 'is-primary' : ''}>
          <span className="ipam-devaddr-main"><span className="mono">{a.address}/{a.mask}</span>{a.primary && <Chip tone="info" size="xs">Primary</Chip>}{a.status !== 'Active' && <Chip tone={a.status === 'Outside plan' ? 'warning' : 'neutral'} size="xs">{a.status}</Chip>}<small>{a.iface ?? a.use} · {a.vrf}</small></span>
          <span className="ipam-devaddr-act">
            {!a.primary && <button type="button" title="Set as primary IPv4" onClick={() => run(setPrimaryIp(neId, a.id), `${a.address} is now the primary IPv4 of ${name}`)}><I.Star size={13} /></button>}
            {a.use !== 'Gateway (VIP)' && <button type="button" title="Unassign" onClick={() => run(unassignIp(a.id), `${a.address} unassigned from ${name}`, 'It stays reserved in its prefix.')}><I.Unlink size={13} /></button>}
          </span>
        </li>))}</ul>
      {adding ? <div className="ipam-devaddr-form">
        <select className="select" value={pfx} onChange={e => setPfx(e.target.value)} aria-label="Prefix"><option value="">Pick a prefix at {dcId}…</option>{targets.map(p => <option key={p.id} value={p.id}>{p.prefix} · {p.role} · {p.size - p.used} free</option>)}</select>
        <select className="select" value={iface} onChange={e => setIface(e.target.value)} aria-label="Interface"><option value="">Device level</option>{ifaces.map(x => <option key={x}>{x}</option>)}</select>
        <label className="ipam-check"><input type="checkbox" checked={primary} onChange={e => setPrimary(e.target.checked)} /><span>Primary</span></label>
        <Btn size="sm" onClick={() => setAdding(false)}>Cancel</Btn><Btn size="sm" variant="filled" disabled={!pfx} onClick={assign}>Assign next free</Btn>
      </div> : <Btn size="sm" icon={I.Plus} onClick={() => setAdding(true)}>Assign an address</Btn>}
    </div>
  );
}

/* ---------------------------------------------------------------- registers */
type Reg = 'rirs' | 'roles' | 'rts' | 'vgroups' | 'templates';
export function Registers({ m, onFilter }: { m: IpamView; onFilter: (tab: string, patch: Record<string, string>) => void }) {
  const [v, setV] = useState<Reg>('rirs');
  const r = m.registers;
  return (
    <section className="vw-card-section ipam-reg">
      <div className="dcim-sub-bar"><Seg value={v} onChange={x => setV(x as Reg)} options={[{ id: 'rirs', label: `Registries ${r.rirs.length}` }, { id: 'roles', label: `Roles ${r.roles.length}` }, { id: 'rts', label: `Route targets ${r.routeTargets.length}` }, { id: 'vgroups', label: `VLAN groups ${r.vlanGroups.length}` }, { id: 'templates', label: `Service templates ${r.serviceTemplates.length}` }]} /></div>
      {v === 'rirs' && <div className="ipam-cards">{r.rirs.map(x => (
        <div key={x.id} className="ipam-card"><span className="ipam-card-top"><span className="ipam-bind-ico"><I.Landmark size={16} /></span><b>{x.name}</b><Chip tone={x.private ? 'neutral' : 'info'} size="xs">{x.private ? 'Private space' : 'Regional registry'}</Chip></span>
          <p>{x.description}</p><span className="ipam-card-figs"><span><b className="num">{x.aggregates}</b>aggregates</span><span><b className="num">{x.asns}</b>ASNs</span></span></div>))}</div>}
      {v === 'roles' && <div className="ipam-cards">{r.roles.map(x => (
        <button type="button" key={x.role} className="ipam-card is-click" onClick={() => onFilter('prefixes', { role: x.role })}><span className="ipam-card-top"><span className="ipam-bind-ico"><I.Tag size={16} /></span><b>{x.role}</b><span className="vw-label num">weight {x.weight}</span></span>
          <p>{x.description}</p><span className="ipam-card-figs"><span><b className="num">{fmtNum(x.prefixes)}</b>prefixes</span><span><b className="num">{fmtNum(x.addresses)}</b>addresses</span><span><b className="num">{fmtNum(x.vlans)}</b>VLANs</span></span></button>))}</div>}
      {v === 'rts' && <DataTable rows={r.routeTargets.map(x => ({ ...x, id: x.rt }))} pageSize={30} cols={[
        { key: 'rt', header: 'Route target', sort: x => x.rt, render: x => <span className="mono vw-card-activity-label">{x.rt}</span> },
        { key: 'i', header: 'Imported by', wrap: true, render: x => <span className="row wrap" style={{ gap: 4 }}>{x.importedBy.slice(0, 6).map(n => <Chip key={n} tone="neutral" size="xs"><span className="mono">{n}</span></Chip>)}{x.importedBy.length > 6 && <span className="vw-label">+{x.importedBy.length - 6}</span>}</span> },
        { key: 'e', header: 'Exported by', wrap: true, render: x => <span className="row wrap" style={{ gap: 4 }}>{x.exportedBy.slice(0, 6).map(n => <Chip key={n} tone="neutral" size="xs"><span className="mono">{n}</span></Chip>)}{x.exportedBy.length > 6 && <span className="vw-label">+{x.exportedBy.length - 6}</span>}</span> },
        { key: 'n', header: 'VRFs', sort: x => x.importedBy.length + x.exportedBy.length, render: x => fmtNum(new Set([...x.importedBy, ...x.exportedBy]).size) }]} />}
      {v === 'vgroups' && <DataTable rows={r.vlanGroups} pageSize={30} cols={[
        { key: 'g', header: 'Group', sort: x => `${x.dcId}${x.group}`, render: x => <span className="cell-2"><b>{x.group}</b><small>{x.dcId}</small></span> },
        { key: 'r', header: 'VLAN ID range', sort: x => x.min, render: x => <span className="mono">{x.min}–{x.max}</span> },
        { key: 'u', header: 'In use', sort: x => x.used / (x.max - x.min + 1), render: x => <Meter pct={(x.used / (x.max - x.min + 1)) * 100} width={70} color={loadColor((x.used / (x.max - x.min + 1)) * 100)} label={`${x.used} of ${x.max - x.min + 1}`} /> },
        { key: 'f', header: 'Free IDs', sort: x => x.max - x.min + 1 - x.used, render: x => fmtNum(x.max - x.min + 1 - x.used) },
        { key: 'a', header: '', render: x => <button type="button" className="ent-link" onClick={() => onFilter('vlans', { dc: x.dcId })}>VLANs →</button> }]} />}
      {v === 'templates' && <div className="ipam-cards">{r.serviceTemplates.map(x => (
        <div key={x.id} className="ipam-card"><span className="ipam-card-top"><span className="ipam-bind-ico"><I.Plug size={16} /></span><b>{x.name}</b><Chip tone="neutral" size="xs"><span className="mono">{x.protocol} {x.ports.join(', ')}</span></Chip></span>
          <p>Applied to every device that runs it; the address list shows where.</p><span className="ipam-card-figs"><span><b className="num">{fmtNum(x.instances)}</b>instances</span><span><b className="num">{fmtNum(x.devices)}</b>devices</span></span></div>))}</div>}
    </section>
  );
}

/* ---------------------------------------------------------------- integrations */
const SYS_ICON = { DDI: I.Database, DNS: I.Globe, DHCP: I.Router, ITSM: I.ClipboardList } as const;
export function Integrations() {
  const [ver, setVer] = useState(0);
  const { data } = useQuery(() => getIpamIntegrations(), [ver]);
  const [busy, setBusy] = useState('');
  if (!data) return null;
  const run = (c: IpIntegration, action: 'Sync' | 'Import' | 'Export' | 'Connect') => { setBusy(c.id); syncIpamIntegration(c.id, action).finally(() => { setBusy(''); setVer(v => v + 1); }); };
  const conn = data.filter(c => c.status === 'Connected').length;
  return (<>
    <SummaryStrip items={[{ key: 'c', label: 'Connected', value: `${conn} of ${data.length}`, tone: conn < data.length ? 'warn' : undefined }, { key: 'e', label: 'In error', value: String(data.filter(c => c.status === 'Error').length), tone: data.some(c => c.status === 'Error') ? 'bad' : undefined },
      { key: 'd', label: 'Differences to resolve', value: fmtNum(data.reduce((a, c) => a + c.differences, 0)), tone: data.some(c => c.differences) ? 'warn' : undefined }, { key: 'r', label: 'Records in sync', value: fmtNum(data.filter(c => c.status === 'Connected').reduce((a, c) => a + c.records, 0)) }]} />
    <div className="ipam-conns">{data.map(c => { const Ico = SYS_ICON[c.system]; const on = busy === c.id; return (
      <div key={c.id} className={`ipam-conn is-${c.status.replace(' ', '-').toLowerCase()}`}>
        <div className="ipam-conn-head"><span className="ipam-bind-ico"><Ico size={17} /></span><span><b>{c.name}</b><small>{c.system} · {c.direction === 'Both' ? 'Import and export' : c.direction}</small></span>
          <Chip tone={c.status === 'Connected' ? 'success' : c.status === 'Error' ? 'error' : 'neutral'} size="xs" dot>{c.status}</Chip></div>
        <p className="ipam-conn-obj">{c.objects}</p>
        <div className="ipam-conn-figs"><span><b className="num">{fmtNum(c.records)}</b>records</span><span><b className={`num${c.differences ? ' is-warn' : ''}`}>{fmtNum(c.differences)}</b>differences</span><span className="is-wide"><b>{c.lastSync ? fmtDateTime(c.lastSync) : 'Never'}</b>last sync</span></div>
        {c.message && <p className="ipam-conn-msg"><I.CircleAlert size={13} />{c.message}</p>}
        {c.history[0] && <p className="ipam-conn-hist"><I.History size={13} />{c.history[0].result}</p>}
        <div className="ipam-conn-act">
          {c.status === 'Not connected' ? <Btn size="sm" variant="filled" icon={I.Plug} disabled={on} onClick={() => run(c, 'Connect')}>{on ? 'Connecting…' : 'Connect'}</Btn> : <>
            {c.direction !== 'Export' && <Btn size="sm" icon={I.Download} disabled={on} onClick={() => run(c, 'Import')}>Import</Btn>}
            {c.direction !== 'Import' && <Btn size="sm" icon={I.Upload} disabled={on} onClick={() => run(c, 'Export')}>Export</Btn>}
            <Btn size="sm" variant="filled" icon={I.RefreshCw} disabled={on} onClick={() => run(c, 'Sync')}>{on ? 'Syncing…' : c.status === 'Error' ? 'Retry' : 'Sync now'}</Btn></>}
        </div>
      </div>); })}</div>
    <p className="vw-label" style={{ marginTop: 4 }}>Connectors are simulated <Info text="Records = what the address plan would send; differences = items the external system disagrees on (addresses outside plan, manual blocks not yet pushed). A sync resolves them and is logged in the audit trail." /></p>
  </>);
}
