/* IP & Network (Plan & Build, 13-Oct-2026: P2B merge phase 2). The estate's address plan: prefixes (site management VRFs, site
   fabrics, the backbone, customer VRFs), every bound address, VRFs, VLANs, ASNs, gateways, DHCP ranges and the services on the
   addresses — all derived from the devices, links and services (mock/ipam.ts). Tabs `?tab=`, site scope `?dc=`. */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { carvePrefix, getDcim, getIpam, reserveIp, useQuery } from '../../api';
import type { IpAddr, IpamView, IpAsn, IpFinding, IpPrefix, IpVlan, IpVrf, PrefixRole } from '../../api/types';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Chip, Drawer, Field, KV, Modal, Panel, Seg, Tabs } from '../../ui/kit';
import { DataTable, type Col } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { Facts, SoftMeter, Split, StatGrid, StatTile } from '../../ui/Analytics';
import { Meter, NeLink, SevDot } from '../../ui/status';
import { fmtNum } from '../../lib/format';
import { useToast } from '../ops/shared';
import { ACCENT, loadColor } from '../dcim/common';
import '../../styles/dcim.css';
import '../../styles/ipam.css';

type Tab = 'overview' | 'prefixes' | 'addresses' | 'vrfs' | 'vlans' | 'asns' | 'services';
const TABS: { id: Tab; label: string }[] = [{ id: 'overview', label: 'Overview' }, { id: 'prefixes', label: 'Prefixes' }, { id: 'addresses', label: 'IP addresses' }, { id: 'vrfs', label: 'VRFs' }, { id: 'vlans', label: 'VLANs' }, { id: 'asns', label: 'ASNs' }, { id: 'services', label: 'Gateways & services' }];
const ROLE_TONE: Record<PrefixRole, 'info' | 'neutral' | 'purple' | 'cyan' | 'orange'> = { Management: 'info', Loopback: 'neutral', 'Point-to-point': 'neutral', Production: 'purple', Storage: 'cyan', Backbone: 'neutral', Public: 'orange', Customer: 'orange' };
const ST_TONE: Record<IpAddr['status'], 'success' | 'info' | 'neutral' | 'error' | 'warning'> = { Active: 'success', Reserved: 'info', Gateway: 'neutral', Conflict: 'error', 'Outside plan': 'warning' };
const has = (s: string, q: string) => !q || s.toLowerCase().includes(q.toLowerCase());
const opts = <T,>(xs: T[], key: (x: T) => string) => { const m = new Map<string, number>(); xs.forEach(x => m.set(key(x), (m.get(key(x)) ?? 0) + 1)); return [...m].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, label: id, count })); };

function useP() {
  const [sp, setSp] = useSearchParams();
  const apply = useParamPatch();
  return { get: (k: string) => sp.get(k) ?? '', set: (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); }, apply, sp, setSp };
}

export function Ipam() {
  const { get, sp, setSp } = useP();
  const tab = (get('tab') as Tab) || 'overview';
  const dcId = get('dc');
  const go = (patch: Record<string, string>) => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); setSp(n, { replace: true }); };
  usePage([{ label: 'Plan & Build' }, { label: 'IP & Network', to: '/ipam' }, ...(dcId ? [{ label: dcId }] : [])], dcId ? { dcId } : {});
  const { data: sites } = useQuery(() => getDcim(), []);
  const { data: m } = useQuery(() => getIpam({ dcId: dcId || undefined }), [dcId]);
  const [prefix, setPrefix] = useState<string | null>(null);
  if (!m || !sites) return <Loading />;
  const leaf = m.prefixes.filter(p => p.status !== 'Container');
  const full = leaf.filter(p => p.pct >= 90 && p.size >= 8 && p.role !== 'Point-to-point');
  const st = (s: string) => m.addresses.filter(a => a.status === s).length;
  const bgp = m.asns.reduce((a, x) => a + (x.kind === 'Private 32-bit' ? 0 : x.sessions), 0), bgpUp = m.asns.reduce((a, x) => a + (x.kind === 'Private 32-bit' ? 0 : x.up), 0);
  const setTab = (t: Tab, extra: Record<string, string> = {}) => go({ tab: t === 'overview' ? '' : t, ...extra });

  return (
    <div className="page dcim ipam">
      <PageHead title="IP & Network" sub="Prefixes, addresses, VRFs, VLANs, ASNs and gateways — the address plan, read from the devices, links and services it serves"
        actions={<select className="select" value={dcId} onChange={e => go({ dc: e.target.value })} aria-label="Datacenter scope">
          <option value="">All datacenters ({sites.sites.length})</option>{sites.sites.map(s => <option key={s.id} value={s.id}>{s.id} · {s.city}</option>)}
        </select>} />
      <StatGrid>
        <StatTile label="Prefixes" value={fmtNum(leaf.length)} sub={`active · ${m.prefixes.length - leaf.length} containers`} onClick={() => setTab('prefixes')} active={tab === 'prefixes'}
          info="Prefixes in use (not counting the containers that hold them), by role. Click to open the prefix tree.">
          <Split parts={[{ key: 'm', label: 'Management', n: leaf.filter(p => p.role === 'Management').length, tone: 'info' as const }, { key: 'h', label: 'Hosts', n: leaf.filter(p => p.role === 'Production' || p.role === 'Storage').length, tone: 'neutral' as const }, { key: 'o', label: 'Links & other', n: leaf.filter(p => !['Management', 'Production', 'Storage'].includes(p.role)).length, tone: 'neutral' as const }].filter(x => x.n)} />
        </StatTile>
        <StatTile label="Addresses" value={fmtNum(m.addresses.length)} sub="bound" onClick={() => setTab('addresses')} active={tab === 'addresses'}
          info="Every address recorded: device management addresses, loopbacks, link /31s, host addresses, gateways and customer links. Reserved = held for a planned device or by hand.">
          <Split parts={[{ key: 'a', label: 'Active', n: st('Active'), tone: 'info' as const }, { key: 'r', label: 'Reserved', n: st('Reserved'), tone: 'neutral' as const }, { key: 'g', label: 'Gateways', n: st('Gateway'), tone: 'neutral' as const }, { key: 'o', label: 'Outside plan', n: st('Outside plan') + st('Conflict'), tone: 'orange' as const }].filter(x => x.n)} />
        </StatTile>
        <StatTile label="Prefixes ≥ 90%" value={full.length} sub={`of ${fmtNum(leaf.length)} active`} subTone={full.length ? 'warn' : undefined} onClick={() => setTab('prefixes', { pf: 'full' })}
          info="Active prefixes (eight or more addresses, links excluded) with 90% or more of their addresses bound. Usage counts real bindings only.">
          <SoftMeter pct={leaf.length ? (full.length / leaf.length) * 100 : 0} tone={full.length ? 'warning' : 'success'} />
          <Facts items={[{ n: m.findings.filter(f => f.kind === 'Outside plan' || f.kind === 'Conflict').length, label: 'address findings', tone: m.findings.some(f => f.kind === 'Outside plan' || f.kind === 'Conflict') ? 'warn' : undefined, onClick: () => setTab('overview') }]} />
        </StatTile>
        <StatTile label="VRFs" value={m.vrfs.length} sub="routing tables" onClick={() => setTab('vrfs')} active={tab === 'vrfs'}
          info="Routing tables: one management VRF per site, the global table (DEFAULT) and customer VRFs (layer-3 VPNs, internet).">
          <Split parts={[{ key: 's', label: 'Site', n: m.vrfs.filter(v => v.scope === 'Site').length, tone: 'info' as const }, { key: 'e', label: 'Estate', n: m.vrfs.filter(v => v.scope === 'Estate').length, tone: 'neutral' as const }, { key: 'c', label: 'Customer', n: m.vrfs.filter(v => v.scope === 'Customer').length, tone: 'neutral' as const }].filter(x => x.n)} />
        </StatTile>
        <StatTile label="VLANs" value={fmtNum(m.vlans.length)} sub={`${m.vlans.filter(v => v.status === 'Unused').length} unused`} onClick={() => setTab('vlans')} active={tab === 'vlans'}
          info="VLANs per site: management, production per hall, storage, and one per layer-2 customer handoff (L2VPN, leased line, cross-connect).">
          <Split parts={[{ key: 'f', label: 'Fabric & storage', n: m.vlans.filter(v => v.group === 'Fabric' || v.group === 'Storage').length, tone: 'info' as const }, { key: 'm', label: 'Management', n: m.vlans.filter(v => v.group === 'Management').length, tone: 'neutral' as const }, { key: 's', label: 'Service handoffs', n: m.vlans.filter(v => v.group === 'Services').length, tone: 'neutral' as const }].filter(x => x.n)} />
        </StatTile>
        <StatTile label="BGP" value={bgp ? `${Math.round((bgpUp / bgp) * 100)}%` : '—'} sub={`${fmtNum(bgpUp)} of ${fmtNum(bgp)} sessions up`} subTone={bgpUp < bgp ? 'warn' : undefined} onClick={() => setTab('asns')} active={tab === 'asns'}
          info="BGP sessions of the operator and site ASNs that are established. Click for every ASN and the private ASN pools.">
          <SoftMeter pct={bgp ? (bgpUp / bgp) * 100 : 0} tone={bgpUp < bgp ? 'warning' : 'success'} />
          <Facts items={[{ n: m.asns.length, label: 'ASNs' }, { n: m.fhrp.length, label: 'gateways' }]} />
        </StatTile>
      </StatGrid>
      <Tabs value={tab} onChange={v => setTab(v)} tabs={TABS.map(t => ({ ...t, count: t.id === 'prefixes' ? leaf.length : t.id === 'vlans' ? m.vlans.length : undefined }))} />
      {tab === 'overview' && <Overview m={m} onPrefix={setPrefix} />}
      {tab === 'prefixes' && <Prefixes m={m} onPrefix={setPrefix} />}
      {tab === 'addresses' && <Addresses m={m} onPrefix={setPrefix} />}
      {tab === 'vrfs' && <Vrfs vrfs={m.vrfs} />}
      {tab === 'vlans' && <Vlans vlans={m.vlans} />}
      {tab === 'asns' && <Asns m={m} />}
      {tab === 'services' && <Services m={m} onPrefix={setPrefix} />}
      <PrefixDrawer m={m} id={prefix} onClose={() => setPrefix(null)} onOpen={setPrefix} />
    </div>
  );
}

/* ---------------------------------------------------------------- overview */

function Overview({ m, onPrefix }: { m: IpamView; onPrefix: (id: string) => void }) {
  const fullest = m.prefixes.filter(p => p.status === 'Active' && p.size >= 8 && p.role !== 'Point-to-point').sort((a, b) => b.pct - a.pct).slice(0, 8);
  const open = (f: IpFinding) => { const p = m.prefixes.find(x => x.id === f.ref) ?? m.prefixes.find(x => x.id === m.addresses.find(a => a.id === f.ref)?.prefixId); if (p) onPrefix(p.id); };
  return (
    <div className="ipam-ov">
      <Panel title="Needs attention" icon={I.TriangleAlert} count={m.findings.length} info="What the address plan itself flags: full prefixes, addresses outside their site's plan or on two devices, unused VLANs and gateways that lost a router. Click one to open its prefix.">
        {m.findings.length ? <ul className="ipam-find">{m.findings.slice(0, 12).map(f => (
          <li key={f.id}><button type="button" onClick={() => open(f)}><SevDot s={f.severity} /><span className="cell-2"><b>{f.title}</b><small>{f.kind}{f.dcId ? ` · ${f.dcId}` : ''} — {f.detail}</small></span></button></li>
        ))}</ul> : <p className="vw-label">Nothing to fix: every address is inside its plan and no prefix is above 90%.</p>}
      </Panel>
      <Panel title="Fullest prefixes" icon={I.Gauge} info="Active prefixes ranked by the share of their addresses bound (links excluded).">
        <table className="nst-table dt-table dcim-comp"><tbody>{fullest.map(p => (
          <tr key={p.id} className="is-click" onClick={() => onPrefix(p.id)}><td className="mono">{p.prefix}</td><td><span className="cell-2"><span>{p.description}</span><small>{p.vrf}</small></span></td><td><Meter pct={p.pct} width={60} color={loadColor(p.pct)} label={`${p.used}/${p.size}`} /></td></tr>
        ))}</tbody></table>
      </Panel>
      <Panel title="Aggregates" icon={I.Network} className="ipam-agg" flush info="The top-level blocks the plan is carved from, who allocates them, and how much of each is given to site containers and prefixes.">
        <DataTable rows={m.aggregates} pageSize={10} cols={[
          { key: 'p', header: 'Aggregate', render: a => <span className="mono">{a.prefix}</span> },
          { key: 'r', header: 'Registry', render: a => a.rir },
          { key: 'd', header: 'Used for', wrap: true, render: a => a.description },
          { key: 'u', header: 'Allocated', render: a => <Meter pct={Math.max(a.pct, a.allocated ? 1 : 0)} width={64} color={ACCENT} label={`${fmtNum(a.allocated)} of ${fmtNum(a.size)}`} /> }]} />
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------- prefixes */

function Prefixes({ m, onPrefix }: { m: IpamView; onPrefix: (id: string) => void }) {
  const { get, set, apply } = useP();
  const q = get('q'), role = get('role'), vrf = get('vrf'), pf = get('pf');
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const filtering = !!(q || role || vrf || pf);
  const match = (p: IpPrefix) => (!role || p.role === role) && (!vrf || p.vrf === vrf) && (!pf || (p.pct >= 90 && p.status !== 'Container' && p.size >= 8 && p.role !== 'Point-to-point')) && has(`${p.prefix} ${p.description} ${p.vrf} ${p.dcId ?? ''} ${p.vlan ?? ''}`, q);
  const tops = m.prefixes.filter(p => !p.parentId);
  const kids = (id: string) => m.prefixes.filter(p => p.parentId === id);
  const rows: { p: IpPrefix; depth: number }[] = [];
  const walk = (p: IpPrefix, d: number) => {
    const ks = kids(p.id);
    const show = filtering ? match(p) || ks.some(match) : true;
    if (!show) return;
    rows.push({ p, depth: d });
    if (!closed.has(p.id) || filtering) ks.forEach(k => (!filtering || match(k)) && walk(k, d + 1));
  };
  tops.forEach(t => walk(t, 0));
  const shown = rows.filter(r => r.p.status !== 'Container').length;
  return (
    <section className="vw-card-section dcim-table">
      <div className="dt-toolbar"><ListToolbar shown={shown} total={m.prefixes.filter(p => p.status !== 'Container').length} noun="prefixes" onApply={apply} search={{ value: q, onChange: v => set('q', v), placeholder: 'Prefix, description, VRF, VLAN' }}
        tools={<><Btn icon={I.ChevronsDownUp} onClick={() => setClosed(new Set(m.prefixes.filter(p => p.status === 'Container').map(p => p.id)))}>Collapse</Btn><Btn icon={I.ChevronsUpDown} onClick={() => setClosed(new Set())}>Expand</Btn></>}
        filters={[
          { id: 'role', label: 'Role', quick: true, value: role, anyLabel: 'Any role', onChange: v => set('role', v), options: opts(m.prefixes, p => p.role) },
          { id: 'vrf', label: 'VRF', quick: true, value: vrf, anyLabel: 'Any VRF', onChange: v => set('vrf', v), options: opts(m.prefixes, p => p.vrf).slice(0, 60) },
          { id: 'pf', label: 'Usage', value: pf, anyLabel: 'Any usage', onChange: v => set('pf', v), options: [{ id: 'full', label: '≥ 90% used', count: m.prefixes.filter(p => p.pct >= 90 && p.status !== 'Container' && p.size >= 8 && p.role !== 'Point-to-point').length }] }
        ]} /></div>
      <div className="dt-scroll"><table className="nst-table dt-table ipam-tree">
        <thead><tr><th>Prefix</th><th>Description</th><th>VRF</th><th>Role</th><th>VLAN</th><th>Usage</th><th>Status</th></tr></thead>
        <tbody>{rows.slice(0, 600).map(({ p, depth }) => (
          <tr key={p.id} className="is-click" onClick={() => onPrefix(p.id)}>
            <td><span className="ipam-pfx" style={{ paddingLeft: depth * 20 }}>
              {p.children ? <button type="button" className="dcim-tree-tw" aria-label={closed.has(p.id) ? 'Expand' : 'Collapse'} onClick={e => { e.stopPropagation(); setClosed(s => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; }); }}><I.ChevronRight size={14} style={{ transform: closed.has(p.id) && !filtering ? undefined : 'rotate(90deg)' }} /></button> : <i className="ipam-tw-sp" />}
              <span className="mono">{p.prefix}</span></span></td>
            <td><span className="cell-2"><span>{p.description}</span>{p.dcId && <small>{p.dcId}</small>}</span></td>
            <td className="mono">{p.vrf}</td>
            <td><Chip tone={ROLE_TONE[p.role]} size="xs">{p.role}</Chip></td>
            <td className="mono">{p.vlan ?? '—'}</td>
            <td>{p.status === 'Container' ? <Meter pct={p.pct} width={60} color="var(--vw-color-slate-400)" label={`${p.children} block${p.children === 1 ? '' : 's'}`} /> : <Meter pct={p.pct} width={60} color={loadColor(p.pct)} label={`${fmtNum(p.used)}/${fmtNum(p.size)}`} />}</td>
            <td><Chip tone={p.status === 'Active' ? 'success' : p.status === 'Reserved' ? 'info' : 'neutral'} dot>{p.status}</Chip></td>
          </tr>
        ))}</tbody>
      </table>{rows.length > 600 && <p className="vw-label" style={{ padding: 12 }}>Showing the first 600 rows — search or filter to narrow down.</p>}</div>
    </section>
  );
}

/* the address map of one prefix: a cell per address (first 512), coloured by status */
function AddressMap({ p, addrs }: { p: IpPrefix; addrs: IpAddr[] }) {
  const [ip, m] = p.prefix.split('/'); const mask = Number(m);
  const n = Math.min(512, 2 ** (32 - mask));
  const base = ip.split('.').reduce((a, o) => a * 256 + Number(o), 0);
  const by = new Map(addrs.map(a => [a.address.split('.').reduce((x, o) => x * 256 + Number(o), 0), a]));
  return (
    <div className="ipam-map" style={{ gridTemplateColumns: `repeat(${n > 64 ? 32 : 16}, 1fr)` }}>
      {Array.from({ length: n }, (_, k) => { const a = by.get(base + k); const edge = mask < 31 && (k === 0 || k === 2 ** (32 - mask) - 1);
        return <i key={k} className={`ipam-cell${a ? ` is-${a.status.replace(' ', '-').toLowerCase()}` : edge ? ' is-edge' : ''}`} title={`.${(base + k) % 256}${a ? ` · ${a.deviceName ?? a.use} ${a.iface ?? ''} · ${a.status}` : edge ? (k === 0 ? ' · network' : ' · broadcast') : ' · free'}`} />; })}
    </div>
  );
}

function PrefixDrawer({ m, id, onClose, onOpen }: { m: IpamView; id: string | null; onClose: () => void; onOpen: (id: string) => void }) {
  const toast = useToast();
  const [carve, setCarve] = useState(false);
  const [note, setNote] = useState('');
  const p = m.prefixes.find(x => x.id === id);
  if (!id || !p) return toast.node;
  const addrs = m.addresses.filter(a => a.prefixId === p.id);
  const kids = m.prefixes.filter(x => x.parentId === p.id);
  const parent = m.prefixes.find(x => x.id === p.parentId);
  const gw = m.fhrp.find(g => g.prefixId === p.id);
  const reserve = () => reserveIp(p.id, note).then(a => { setNote(''); toast.show(`${a.address} reserved in ${a.vrf}`, 'It is held in the prefix and counts toward its usage.'); }).catch(e => toast.show('Not reserved', String(e.message ?? e)));
  return (<>
    <Drawer open onClose={onClose} width={680} title={<span className="mono">{p.prefix}</span>} sub={`${p.description} · ${p.vrf}`}
      foot={p.status === 'Container' ? <Btn variant="filled" icon={I.Scissors} onClick={() => setCarve(true)}>Carve a prefix</Btn>
        : <><input className="input" placeholder="What it is for (optional)" value={note} onChange={e => setNote(e.target.value)} style={{ flex: 1 }} /><Btn variant="filled" icon={I.Plus} onClick={reserve} disabled={p.used >= p.size}>Reserve next IP</Btn></>}>
      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}><Chip tone={ROLE_TONE[p.role]}>{p.role}</Chip><Chip tone={p.status === 'Active' ? 'success' : 'info'} dot>{p.status}</Chip>{p.vlan && <Chip tone="neutral">VLAN {p.vlan}</Chip>}</div>
      <KV cols={3} items={[['Site', p.dcId ?? 'Estate-wide'], ['VRF', <span className="mono">{p.vrf}</span>], ['Aggregate', <span className="mono">{p.aggregate}</span>],
        ['Usage', p.status === 'Container' ? `${p.children} blocks · ${p.pct}%` : `${p.used} of ${p.size} (${p.pct}%)`], ['Gateway', p.gateway ? <span className="mono">{p.gateway}</span> : '—'], ['Parent', parent ? <button type="button" className="ent-link mono" onClick={() => onOpen(parent.id)}>{parent.prefix}</button> : '—']]} />
      {gw && <p className="ipam-gw"><I.Route size={14} />{gw.protocol} group {gw.group} · virtual IP <span className="mono">{gw.vip}</span> on {gw.members.map(x => <NeLink key={x} id={x}>{x.replace(`${p.dcId}-`, '')}</NeLink>)}{gw.state === 'degraded' && <Chip tone="error" size="xs">no redundancy</Chip>}</p>}
      {p.status === 'Container' ? <>
        <b className="dcim-sub-h">Blocks in this container</b>
        <table className="nst-table dt-table dcim-comp"><tbody>{kids.map(k => <tr key={k.id} className="is-click" onClick={() => onOpen(k.id)}><td className="mono">{k.prefix}</td><td>{k.description}</td><td><Chip tone={ROLE_TONE[k.role]} size="xs">{k.role}</Chip></td><td><Meter pct={k.pct} width={50} color={loadColor(k.pct)} label={`${k.used}/${k.size}`} /></td></tr>)}</tbody></table>
      </> : <>
        <b className="dcim-sub-h">Address map {addrs.length ? '' : '(empty)'}<span className="vw-label"> · {2 ** (32 - Number(p.prefix.split('/')[1])) > 512 ? 'first 512 addresses · ' : ''}hover for the device</span></b>
        <AddressMap p={p} addrs={addrs} />
        <div className="ipam-map-legend">{(['Active', 'Reserved', 'Gateway', 'Outside plan'] as const).map(s => <span key={s}><i className={`ipam-cell is-${s.replace(' ', '-').toLowerCase()}`} />{s}</span>)}<span><i className="ipam-cell" />Free</span></div>
        <b className="dcim-sub-h">Addresses ({addrs.length})</b>
        <table className="nst-table dt-table dcim-comp"><thead><tr><th>Address</th><th>Device · interface</th><th>Use</th><th>Status</th></tr></thead>
          <tbody>{addrs.slice(0, 200).map(a => <tr key={a.id}><td className="mono">{a.address}/{a.mask}</td><td>{a.deviceId ? <span className="cell-2"><NeLink id={a.deviceId}>{a.deviceName}</NeLink><small className="mono">{a.iface ?? ''}{a.note ? ` · ${a.note}` : ''}</small></span> : <span className="cell-2"><span>{a.deviceName ?? '—'}</span>{a.note && <small>{a.note}</small>}</span>}</td><td>{a.use}</td><td><Chip tone={ST_TONE[a.status]} dot size="xs">{a.status}</Chip></td></tr>)}</tbody></table>
        {addrs.length > 200 && <p className="vw-label">First 200 of {addrs.length}; the IP addresses tab lists them all.</p>}
      </>}
    </Drawer>
    <CarveModal open={carve} parent={p} onClose={() => setCarve(false)} onDone={id2 => { setCarve(false); onOpen(id2); }} />
    {toast.node}
  </>);
}

function CarveModal({ open, parent, onClose, onDone }: { open: boolean; parent: IpPrefix; onClose: () => void; onDone: (id: string) => void }) {
  const cm = Number(parent.prefix.split('/')[1]);
  const [mask, setMask] = useState(Math.min(30, Math.max(cm + 1, 24)));
  const [role, setRole] = useState<PrefixRole>(parent.role);
  const [desc, setDesc] = useState('');
  const [err, setErr] = useState('');
  const go = () => carvePrefix(parent.id, mask, role, desc).then(p => onDone(p.id)).catch(e => setErr(String(e.message ?? e)));
  return (
    <Modal open={open} onClose={onClose} title={`Carve a prefix from ${parent.prefix}`} sub="Takes the first free block of the size you choose; it is reserved until devices are addressed from it."
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" onClick={go}>Reserve block</Btn></>}>
      <div className="dcim-form">
        <Field label="Size"><select className="select" value={mask} onChange={e => setMask(Number(e.target.value))}>{Array.from({ length: 30 - cm }, (_, k) => cm + 1 + k).map(x => <option key={x} value={x}>/{x} · {fmtNum(x >= 31 ? 2 ** (32 - x) : 2 ** (32 - x) - 2)} addresses</option>)}</select></Field>
        <Field label="Role"><select className="select" value={role} onChange={e => setRole(e.target.value as PrefixRole)}>{(['Management', 'Production', 'Storage', 'Loopback', 'Point-to-point'] as PrefixRole[]).map(r => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Description" style={{ gridColumn: '1 / -1' }}><input className="input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Hall C expansion" /></Field>
        {err && <p className="dcim-err">{err}</p>}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- lists */

function Addresses({ m, onPrefix }: { m: IpamView; onPrefix: (id: string) => void }) {
  const { get, set, apply } = useP();
  const q = get('q'), use = get('use'), st = get('ast');
  const rows = useMemo(() => m.addresses.filter(a => (!use || a.use === use) && (!st || a.status === st) && has(`${a.address} ${a.deviceName ?? ''} ${a.iface ?? ''} ${a.dns} ${a.vrf}`, q)), [m, q, use, st]);
  const cols: Col<IpAddr>[] = [
    { key: 'a', header: 'Address', sort: a => a.address.split('.').map(x => x.padStart(3, '0')).join('.'), render: a => <span className="mono">{a.address}/{a.mask}</span> },
    { key: 'v', header: 'VRF', sort: a => a.vrf, render: a => <span className="mono">{a.vrf}</span> },
    { key: 'd', header: 'Device · interface', sort: a => a.deviceName ?? '', render: a => a.deviceId ? <span className="cell-2"><NeLink id={a.deviceId}>{a.deviceName}</NeLink><small className="mono">{a.iface}</small></span> : <span>{a.deviceName ?? '—'}</span> },
    { key: 'u', header: 'Use', sort: a => a.use, render: a => a.use },
    { key: 'n', header: 'DNS name', sort: a => a.dns, wrap: true, render: a => <span className="mono dcim-via">{a.dns || '—'}</span> },
    { key: 's', header: 'Status', sort: a => a.status, render: a => <Chip tone={ST_TONE[a.status]} dot>{a.status}</Chip> }
  ];
  return (
    <section className="vw-card-section dcim-table">
      <DataTable rows={rows} cols={cols} pageSize={30} defaultSort={{ key: 'a', dir: 'asc' }} onRow={a => a.prefixId && onPrefix(a.prefixId)}
        toolbar={<ListToolbar shown={rows.length} total={m.addresses.length} noun="addresses" onApply={apply} search={{ value: q, onChange: v => set('q', v), placeholder: 'Address, device, interface, DNS name' }}
          filters={[{ id: 'use', label: 'Use', quick: true, value: use, anyLabel: 'Any use', onChange: v => set('use', v), options: opts(m.addresses, a => a.use) },
            { id: 'ast', label: 'Status', quick: true, value: st, anyLabel: 'Any status', onChange: v => set('ast', v), options: opts(m.addresses, a => a.status) }]} />} />
    </section>
  );
}

function Vrfs({ vrfs }: { vrfs: IpVrf[] }) {
  const { get, set, apply } = useP();
  const q = get('q'), sc = get('scope');
  const rows = vrfs.filter(v => (!sc || v.scope === sc) && has(`${v.name} ${v.rd} ${v.description}`, q));
  return (
    <section className="vw-card-section dcim-table">
      <DataTable rows={rows} pageSize={30} defaultSort={{ key: 'n', dir: 'asc' }}
        toolbar={<ListToolbar shown={rows.length} total={vrfs.length} noun="VRFs" onApply={apply} search={{ value: q, onChange: v => set('q', v), placeholder: 'VRF, route distinguisher' }}
          filters={[{ id: 'scope', label: 'Scope', quick: true, value: sc, anyLabel: 'Any scope', onChange: v => set('scope', v), options: opts(vrfs, v => v.scope) }]} />}
        cols={[
          { key: 'n', header: 'VRF', sort: v => v.name, render: v => <span className="cell-2"><span className="mono vw-card-activity-label">{v.name}</span><small>{v.description}</small></span>, wrap: true },
          { key: 'rd', header: 'Route distinguisher', sort: v => v.rd, render: v => <span className="mono">{v.rd}</span> },
          { key: 'rt', header: 'Route targets', render: v => <span className="cell-2"><span className="mono">import {v.importRt.join(', ')}</span><small className="mono">export {v.exportRt.join(', ')}</small></span> },
          { key: 's', header: 'Scope', sort: v => v.scope, render: v => <Chip tone={v.scope === 'Customer' ? 'orange' : v.scope === 'Site' ? 'info' : 'neutral'} size="xs">{v.scope}</Chip> },
          { key: 'p', header: 'Prefixes', sort: v => v.prefixes, render: v => fmtNum(v.prefixes) },
          { key: 'a', header: 'Addresses', sort: v => v.addresses, render: v => fmtNum(v.addresses) }]} />
    </section>
  );
}

function Vlans({ vlans }: { vlans: IpVlan[] }) {
  const { get, set, apply } = useP();
  const q = get('q'), grp = get('group'), st = get('vst');
  const rows = vlans.filter(v => (!grp || v.group === grp) && (!st || v.status === st) && has(`${v.vid} ${v.name} ${v.dcId} ${v.role} ${v.serviceId ?? ''}`, q));
  return (
    <section className="vw-card-section dcim-table">
      <DataTable rows={rows} pageSize={30} defaultSort={{ key: 'd', dir: 'asc' }}
        toolbar={<ListToolbar shown={rows.length} total={vlans.length} noun="VLANs" onApply={apply} search={{ value: q, onChange: v => set('q', v), placeholder: 'VLAN id, name, site, service' }}
          filters={[{ id: 'group', label: 'Group', quick: true, value: grp, anyLabel: 'Any group', onChange: v => set('group', v), options: opts(vlans, v => v.group) },
            { id: 'vst', label: 'Status', quick: true, value: st, anyLabel: 'Any status', onChange: v => set('vst', v), options: opts(vlans, v => v.status) }]} />}
        cols={[
          { key: 'd', header: 'Site · VLAN', sort: v => `${v.dcId}${String(v.vid).padStart(5, '0')}`, render: v => <span className="cell-2"><span><b className="mono">{v.vid}</b> <span className="mono">{v.name}</span></span><small>{v.dcId}</small></span> },
          { key: 'g', header: 'Group', sort: v => v.group, render: v => v.group },
          { key: 'r', header: 'Role', sort: v => v.role, render: v => v.role },
          { key: 'p', header: 'Prefix / service', render: v => v.serviceId ? <Link className="ent-link mono" to={`/services/${v.serviceId}`}>{v.serviceId}</Link> : <span className="mono">{v.prefix ?? '—'}</span> },
          { key: 'n', header: 'Devices', sort: v => v.devices, render: v => fmtNum(v.devices) },
          { key: 's', header: 'Status', sort: v => v.status, render: v => <Chip tone={v.status === 'Active' ? 'success' : v.status === 'Unused' ? 'warning' : 'info'} dot>{v.status}</Chip> }]} />
    </section>
  );
}

function Asns({ m }: { m: IpamView }) {
  const { get, set, apply } = useP();
  const q = get('q'), k = get('kind');
  const rows = m.asns.filter(a => (!k || a.kind === k) && has(`${a.asn} ${a.description} ${a.dcId ?? ''}`, q));
  return (<>
    <div className="ipam-ranges">{m.asnRanges.map(r => (
      <div key={r.id} className="vw-card-section ipam-range"><span className="vw-label">{r.name}</span><b className="mono">{fmtNum(r.start)} – {fmtNum(r.end)}</b>
        <Meter pct={Math.max(1, (r.used / (r.end - r.start + 1)) * 100)} width={120} color={ACCENT} label={`${fmtNum(r.used)} in use`} /></div>
    ))}</div>
    <section className="vw-card-section dcim-table">
      <DataTable rows={rows} pageSize={30} defaultSort={{ key: 'a', dir: 'asc' }}
        toolbar={<ListToolbar shown={rows.length} total={m.asns.length} noun="ASNs" onApply={apply} search={{ value: q, onChange: v => set('q', v), placeholder: 'ASN, site, device' }}
          filters={[{ id: 'kind', label: 'Kind', quick: true, value: k, anyLabel: 'Any kind', onChange: v => set('kind', v), options: opts(m.asns, a => a.kind) }]} />}
        cols={[
          { key: 'a', header: 'ASN', sort: a => a.asn, render: (a: IpAsn) => <span className="mono vw-card-activity-label">AS{a.asn}</span> },
          { key: 'k', header: 'Kind', sort: a => a.kind, render: a => a.kind },
          { key: 'd', header: 'Used by', sort: a => a.description, wrap: true, render: a => <span className="cell-2"><span>{a.description}</span>{a.dcId && <small>{a.dcId}</small>}</span> },
          { key: 'n', header: 'Devices', sort: a => a.devices, render: a => a.devices },
          { key: 's', header: 'BGP sessions', sort: a => a.sessions, render: a => a.sessions ? <Meter pct={(a.up / a.sessions) * 100} width={56} color={a.up < a.sessions ? 'var(--vw-color-amber-500)' : 'var(--vw-color-emerald-500)'} label={`${a.up}/${a.sessions} up`} /> : <span className="vw-label">—</span> }]} />
    </section>
  </>);
}

function Services({ m, onPrefix }: { m: IpamView; onPrefix: (id: string) => void }) {
  const { get, set, apply } = useP();
  const v = (get('sv') || 'gateways') as 'gateways' | 'ranges' | 'apps';
  const q = get('q');
  const pfx = new Map(m.prefixes.map(p => [p.id, p]));
  const apps = m.services.filter(s => has(`${s.name} ${s.deviceName} ${s.address}`, q));
  return (
    <section className="vw-card-section dcim-table">
      <div className="dcim-sub-bar"><Seg value={v} onChange={x => set('sv', x === 'gateways' ? '' : x)} options={[{ id: 'gateways', label: `Gateways ${m.fhrp.length}` }, { id: 'ranges', label: `DHCP ranges ${m.ranges.length}` }, { id: 'apps', label: `Services on addresses ${fmtNum(m.services.length)}` }]} /></div>
      {v === 'gateways' && <DataTable rows={m.fhrp} pageSize={30} defaultSort={{ key: 's', dir: 'desc' }} onRow={g => onPrefix(g.prefixId)} empty={<p className="vw-label" style={{ padding: 16 }}>No host prefixes in scope, so no first-hop gateways (telecom sites route on the devices themselves).</p>} cols={[
        { key: 'v', header: 'Virtual IP', sort: g => g.vip, render: g => <span className="mono">{g.vip}</span> },
        { key: 'p', header: 'Prefix', render: g => <span className="cell-2"><span className="mono">{pfx.get(g.prefixId)?.prefix}</span><small>{pfx.get(g.prefixId)?.description}</small></span> },
        { key: 'g', header: 'Protocol', render: g => `${g.protocol} ${g.group}` },
        { key: 'm', header: 'Routers', wrap: true, render: g => <span className="row wrap" style={{ gap: 6 }}>{g.members.map(x => <NeLink key={x} id={x}>{x.replace(`${g.dcId}-`, '')}</NeLink>)}</span> },
        { key: 's', header: 'State', sort: g => (g.state === 'ok' ? 0 : 1), render: g => <Chip tone={g.state === 'ok' ? 'success' : 'error'} dot>{g.state === 'ok' ? 'Redundant' : 'Single router'}</Chip> }]} />}
      {v === 'ranges' && <DataTable rows={m.ranges} pageSize={30} onRow={r => onPrefix(r.prefixId)} empty={<p className="vw-label" style={{ padding: 16 }}>No DHCP ranges in scope.</p>} cols={[
        { key: 'r', header: 'Range', render: r => <span className="mono">{r.start} – {r.end}</span> },
        { key: 'p', header: 'In prefix', render: r => <span className="mono">{pfx.get(r.prefixId)?.prefix}</span> },
        { key: 'u', header: 'Purpose', wrap: true, render: r => r.purpose },
        { key: 'n', header: 'Held', render: r => `${r.used} of ${r.size}` }]} />}
      {v === 'apps' && <DataTable rows={apps} pageSize={30} defaultSort={{ key: 'd', dir: 'asc' }}
        toolbar={<ListToolbar shown={apps.length} total={m.services.length} noun="services" onApply={apply} search={{ value: q, onChange: x => set('q', x), placeholder: 'Service, device, address' }} />} cols={[
        { key: 'n', header: 'Service', sort: s => s.name, render: s => <b>{s.name}</b> },
        { key: 'p', header: 'Port', render: s => <span className="mono">{s.protocol}/{s.ports.join(',')}</span> },
        { key: 'd', header: 'Device', sort: s => s.deviceName, render: s => <NeLink id={s.deviceId}>{s.deviceName}</NeLink> },
        { key: 'a', header: 'Address', sort: s => s.address, render: s => <span className="mono">{s.address}</span> }]} />}
    </section>
  );
}
