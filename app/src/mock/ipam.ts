/* IP & Network read model (13-Oct-2026, P2B merge phase 2). The address plan of the estate, derived from what the generator
   holds, never typed in, and usage = the addresses actually bound (P2B padded its subnets to a 92% baseline; this does not).
   - Management: every site has its own management VRF (MGMT-<site>, so private ranges may repeat between sites); its /24s are the
     ones its devices' management addresses fall in, grouped under one container. An address outside the container is "Outside plan".
   - Fabric (global table, VRF DEFAULT): 10.<site>.0.0/16 per site — loopbacks for every routing speaker (a device in an OSPF / ISIS /
     BGP / LSP adjacency), a /31 per routing adjacency (on the LLDP link it rides), a production /22 per hall with hosts (VLAN 200+n,
     VRRP gateway on two of the hall's switches), a storage /22 (VLAN 300). Inter-site links get /31s from 10.255.0.0/16.
   - Services: L3VPN = a customer VRF with a PE–CE /31 per service; IRV = a public /31 per service; L2VPN, leased line and colocation
     cross-connects = a VLAN per service on the handoff device.
   - ASNs: the operator's public ASN, a private ASN per site fabric and (leaf–spine fabrics) one 32-bit private ASN per BGP leaf.
   Cached per data version; runtime allocations (reserve the next IP, carve a prefix) live in an overlay cleared on regeneration. */
import type { IpAddr, IpAggregate, IpAsn, IpAsnRange, IpFhrp, IpFinding, IpPrefix, IpRange, IpService, IpVlan, IpVrf, IpamView, Link, NetworkElement, PrefixRole } from '../api/types';
import type { Db } from './generate';
import { activeGeo } from './geo';
import { dcimModel } from './dcim';

export const toInt = (ip: string) => ip.split('.').reduce((a, o) => a * 256 + Number(o), 0);
export const toIp = (n: number) => [Math.floor(n / 16777216) % 256, Math.floor(n / 65536) % 256, Math.floor(n / 256) % 256, n % 256].join('.');
const span = (mask: number) => 2 ** (32 - mask);
export const usable = (mask: number) => (mask >= 31 ? span(mask) : span(mask) - 2);
export const parse = (p: string) => { const [ip, m] = p.split('/'); return { base: toInt(ip), mask: Number(m) }; };
export const inPrefix = (ip: string, p: string) => { const { base, mask } = parse(p); const n = toInt(ip); return n >= base && n < base + span(mask); };
const OPER_ASN = 64500;
const isOpaque = (n: NetworkElement) => n.role === 'Tenant gear';
const isPlanned = (n: NetworkElement) => n.discovery === 'not-discovered' && n.ndReason === 'planned';
const HOST = new Set(['Server', 'Storage', 'GPU']);
const short = (dcId: string) => dcId.replace(/-DC-/, '');

export interface IpamOverlay { addresses: IpAddr[]; prefixes: IpPrefix[] }
const overlay: IpamOverlay = { addresses: [], prefixes: [] };
export const resetIpamOverlay = () => { overlay.addresses.length = 0; overlay.prefixes.length = 0; cache = null; };
let cacheDb: Db | null = null;
let cache: IpamView | null = null;
export const clearIpam = () => { cache = null; };
export function ipamModel(db: Db): IpamView {
  if (cache && cacheDb === db) return cache;
  cacheDb = db; cache = build(db);
  return cache;
}

function build(db: Db): IpamView {
  const geo = activeGeo();
  const rir = geo.id === 'us' ? 'ARIN' : 'APNIC';
  const prefixes: IpPrefix[] = [], addresses: IpAddr[] = [], vrfs: IpVrf[] = [], vlans: IpVlan[] = [], asns: IpAsn[] = [], ranges: IpRange[] = [], fhrp: IpFhrp[] = [], services: IpService[] = [];
  const dm = dcimModel(db);
  const domain = (dcId: string) => `${dcId.toLowerCase()}.dc.internal`;
  const dns = (n: NetworkElement, pre = '') => `${pre}${n.name.toLowerCase().replace(`${n.dcId.toLowerCase()}-`, '')}.${domain(n.dcId)}`;
  const addP = (p: Omit<IpPrefix, 'used' | 'pct' | 'children' | 'size'>) => { const x: IpPrefix = { ...p, size: usable(parse(p.prefix).mask), used: 0, pct: 0, children: 0 }; prefixes.push(x); return x; };
  const addA = (a: Omit<IpAddr, 'id'>) => { const x: IpAddr = { ...a, id: `${a.vrf}|${a.address}` }; addresses.push(x); return x; };
  const routing = db.links.filter(l => l.protocol !== 'LLDP');
  const speakers = new Set(routing.flatMap(l => [l.aNe, l.zNe]));
  const lldpBy = new Map<string, Link>();
  for (const l of db.links) if (l.protocol === 'LLDP') lldpBy.set(`${l.aNe}|${l.aIf}|${l.zNe}|${l.zIf}`, l);

  /* ---- estate VRFs */
  vrfs.push({ id: 'DEFAULT', name: 'DEFAULT', rd: `${OPER_ASN}:1`, scope: 'Estate', importRt: [`${OPER_ASN}:1`], exportRt: [`${OPER_ASN}:1`], prefixes: 0, addresses: 0, enforceUnique: true, description: 'Global routing table: site fabrics, loopbacks, hosts and the inter-site backbone' });

  db.datacenters.forEach((dc, i) => {
    const nes = db.nes.filter(n => n.dcId === dc.id && !isOpaque(n));
    if (!nes.length) return;
    const siteAsn = 65100 + i;
    /* ---- management VRF + prefixes from the devices' own addresses */
    const mg = `MGMT-${short(dc.id)}`;
    vrfs.push({ id: mg, name: mg, rd: `${siteAsn}:100`, scope: 'Site', dcId: dc.id, importRt: [`${OPER_ASN}:999`, `${siteAsn}:100`], exportRt: [`${siteAsn}:100`], prefixes: 0, addresses: 0, enforceUnique: true,
      description: `Out-of-band management of ${dc.id}; the NOC imports every site's management route target (${OPER_ASN}:999)` });
    const o12 = new Map<string, number>();
    nes.forEach(n => { const k = n.ip.split('.').slice(0, 2).join('.'); o12.set(k, (o12.get(k) ?? 0) + 1); });
    const top = [...o12].sort((a, b) => b[1] - a[1])[0][0];
    const thirds = [...new Set(nes.filter(n => n.ip.startsWith(`${top}.`)).map(n => Number(n.ip.split('.')[2])))].sort((a, b) => a - b);
    const lo = thirds[0], hi = thirds[thirds.length - 1];
    let cm = 24; while (cm > 16 && !(Math.floor(lo / span(cm + 8)) === Math.floor(hi / span(cm + 8)))) cm--;
    const cBase = Math.floor(lo / span(cm + 8)) * span(cm + 8);
    const mgC = addP({ id: `${dc.id}:mgmt`, prefix: `${top}.${cBase}.0/${cm}`, dcId: dc.id, vrf: mg, role: 'Management', status: 'Container', description: `${dc.id} management (all /24s)`, aggregate: '172.16.0.0/12' });
    const mgChild = new Map<number, IpPrefix>();
    thirds.forEach(t => {
      const p = addP({ id: `${dc.id}:mgmt:${t}`, prefix: `${top}.${t}.0/24`, dcId: dc.id, vrf: mg, role: 'Management', status: 'Active', parentId: mgC.id, vlan: 100, gateway: `${top}.${t}.1`, description: `${dc.id} management ${t - lo + 1}`, aggregate: '172.16.0.0/12' });
      mgChild.set(t, p);
      addA({ address: `${top}.${t}.1`, mask: 24, prefixId: p.id, vrf: mg, dcId: dc.id, status: 'Gateway', use: 'Gateway (VIP)', dns: `gw-mgmt${t - lo + 1}.${domain(dc.id)}`, note: 'Management gateway on the site firewall pair' });
    });
    for (const n of nes) {
      const inC = n.ip.startsWith(`${top}.`) && mgChild.has(Number(n.ip.split('.')[2]));
      addA({ address: n.ip, mask: 24, prefixId: inC ? mgChild.get(Number(n.ip.split('.')[2]))!.id : null, vrf: mg, dcId: dc.id, status: inC ? (isPlanned(n) ? 'Reserved' : 'Active') : 'Outside plan',
        use: 'Management', deviceId: n.id, deviceName: n.name, iface: HOST.has(n.role) ? 'BMC' : 'mgmt0', dns: dns(n),
        note: inC ? (isPlanned(n) ? 'Held for a planned device' : undefined) : `Not inside ${mgC.prefix}: the device was addressed outside this site's management plan` });
    }
    vlans.push({ id: `${dc.id}:v100`, vid: 100, name: `${short(dc.id)}_MGMT`, dcId: dc.id, group: 'Management', role: 'Management', prefix: mgC.prefix, devices: nes.length, status: 'Active' });

    /* ---- fabric: loopbacks, point-to-point /31s */
    const fab = addP({ id: `${dc.id}:fab`, prefix: `10.${i}.0.0/16`, dcId: dc.id, vrf: 'DEFAULT', role: 'Production', status: 'Container', description: `${dc.id} site fabric`, aggregate: '10.0.0.0/8' });
    const sp = nes.filter(n => speakers.has(n.id));
    if (sp.length) {
      const lo0 = addP({ id: `${dc.id}:lo`, prefix: `10.${i}.255.0/24`, dcId: dc.id, vrf: 'DEFAULT', role: 'Loopback', status: 'Active', parentId: fab.id, description: `${dc.id} router / switch loopbacks`, aggregate: '10.0.0.0/8' });
      sp.forEach((n, k) => addA({ address: `10.${i}.255.${k + 1}`, mask: 32, prefixId: lo0.id, vrf: 'DEFAULT', dcId: dc.id, status: isPlanned(n) ? 'Reserved' : 'Active', use: 'Loopback', deviceId: n.id, deviceName: n.name, iface: 'lo0', dns: dns(n, 'lo0.') }));
    }
    const adj = new Map<string, Link>();
    for (const l of routing) {
      const a = db.neById.get(l.aNe), z = db.neById.get(l.zNe);
      if (!a || !z || a.dcId !== dc.id || z.dcId !== dc.id) continue;
      const key = `${l.aNe}|${l.aIf}|${l.zNe}|${l.zIf}`;
      if (!adj.has(key)) adj.set(key, lldpBy.get(key) ?? l);
    }
    const p2pBlocks: IpPrefix[] = [];
    [...adj.values()].forEach((l, k) => {
      const blk = Math.floor(k / 127);
      if (!p2pBlocks[blk]) p2pBlocks[blk] = addP({ id: `${dc.id}:p2p${blk}`, prefix: `10.${i}.${254 - blk}.0/24`, dcId: dc.id, vrf: 'DEFAULT', role: 'Point-to-point', status: 'Active', parentId: fab.id, description: `${dc.id} routed links (/31 each)${blk ? ` ${blk + 1}` : ''}`, aggregate: '10.0.0.0/8' });
      const base = `10.${i}.${254 - blk}`, h = 2 + (k % 127) * 2;
      const a = db.neById.get(l.aNe)!, z = db.neById.get(l.zNe)!;
      addA({ address: `${base}.${h}`, mask: 31, prefixId: p2pBlocks[blk].id, vrf: 'DEFAULT', dcId: dc.id, status: 'Active', use: 'Link', deviceId: a.id, deviceName: a.name, iface: l.aIf, dns: `${l.aIf.replace(/[/:]/g, '-')}.${dns(a)}`, note: `to ${z.name} ${l.zIf}` });
      addA({ address: `${base}.${h + 1}`, mask: 31, prefixId: p2pBlocks[blk].id, vrf: 'DEFAULT', dcId: dc.id, status: 'Active', use: 'Link', deviceId: z.id, deviceName: z.name, iface: l.zIf, dns: `${l.zIf.replace(/[/:]/g, '-')}.${dns(z)}`, note: `to ${a.name} ${l.aIf}` });
    });

    /* ---- hosts: production per hall, storage per site; VRRP gateway on two of the hall's switches */
    const halls = dm.halls.filter(h => h.dcId === dc.id);
    const net = nes.filter(n => !HOST.has(n.role));
    const hallOf = (n: NetworkElement) => dm.rackById.get(n.rackId)?.hallId;
    const gwPair = (hallId: string | null) => {
      const inHall = hallId ? net.filter(n => hallOf(n) === hallId && n.role === 'Switch') : [];
      return (inHall.length >= 2 ? inHall : net.filter(n => n.role === 'Switch' || n.role === 'Router')).slice(0, 2);
    };
    const hostIface = (n: NetworkElement) => { const ifs = db.ifaces.get(n.id) ?? []; return (ifs.find(x => /^eth/.test(x.name) && !/OSFP/.test(x.type)) ?? ifs.find(x => !/OSFP/.test(x.type)) ?? ifs[0])?.name ?? 'eth0'; };
    const hostPrefix = (id: string, prefix: string, role: PrefixRole, vlan: number, hallId: string | undefined, label: string, hs: NetworkElement[], gw: NetworkElement[]) => {
      const p = addP({ id, prefix, dcId: dc.id, hallId, vrf: 'DEFAULT', role, status: 'Active', parentId: fab.id, vlan, gateway: `${prefix.split('.').slice(0, 3).join('.')}.1`, description: label, aggregate: '10.0.0.0/8' });
      const { base } = parse(prefix);
      addA({ address: toIp(base + 1), mask: 22, prefixId: p.id, vrf: 'DEFAULT', dcId: dc.id, status: 'Gateway', use: 'Gateway (VIP)', dns: `gw-${vlan}.${domain(dc.id)}`, note: `VRRP virtual IP on ${gw.map(g => g.name).join(' + ') || 'the site core'}` });
      hs.forEach((n, k) => addA({ address: toIp(base + 10 + k), mask: 22, prefixId: p.id, vrf: 'DEFAULT', dcId: dc.id, status: isPlanned(n) ? 'Reserved' : 'Active', use: 'Host', deviceId: n.id, deviceName: n.name, iface: hostIface(n), dns: dns(n) }));
      const g = fhrp.length + 10;
      fhrp.push({ id: `${p.id}:vrrp`, dcId: dc.id, protocol: db.persona === 'network' ? 'HSRP' : 'VRRP', group: g, vip: toIp(base + 1), prefixId: p.id, members: gw.map(x => x.id),
        state: gw.length < 2 || gw.some(x => x.health === 'critical' || x.icmp.state === 'critical') ? 'degraded' : 'ok' });
      ranges.push({ id: `${p.id}:pxe`, dcId: dc.id, prefixId: p.id, start: toIp(base + 896), end: toIp(base + 1022), size: 127, purpose: 'PXE / provisioning (DHCP) for new hosts', used: hs.filter(isPlanned).length });
      vlans.push({ id: `${dc.id}:v${vlan}`, vid: vlan, name: `${short(dc.id)}_${role === 'Storage' ? 'STORAGE' : `PROD_${label.split(' · ').pop()!.toUpperCase().replace(/[^A-Z0-9]+/g, '')}`}`, dcId: dc.id, group: role === 'Storage' ? 'Storage' : 'Fabric', role, prefix, devices: hs.length + gw.length, status: hs.some(h => !isPlanned(h)) ? 'Active' : 'Reserved' });
    };
    halls.forEach((h, hi) => {
      const hs = nes.filter(n => HOST.has(n.role) && n.role !== 'Storage' && hallOf(n) === h.id);
      if (hs.length) hostPrefix(`${dc.id}:prod:${hi}`, `10.${i}.${16 + hi * 4}.0/22`, 'Production', 200 + hi, h.id, `${dc.id} production · ${h.name}`, hs.slice(0, 880), gwPair(h.id));
    });
    const sto = nes.filter(n => n.role === 'Storage');
    if (sto.length) hostPrefix(`${dc.id}:sto`, `10.${i}.128.0/22`, 'Storage', 300, undefined, `${dc.id} storage`, sto.slice(0, 880), gwPair(null));

    /* ---- per-service VLANs (L2 handoffs) */
    let vk = 0;
    for (const s of db.services.filter(x => x.dcId === dc.id && (x.type === 'L2VPN' || x.type === 'Leased Line' || x.type === 'Cross-connect'))) {
      vlans.push({ id: `${dc.id}:svc:${s.id}`, vid: 1000 + vk++, name: `${s.type === 'Cross-connect' ? 'XC' : s.type === 'L2VPN' ? 'L2VPN' : 'LL'}-${s.id.split('-').pop()}`, dcId: dc.id, group: 'Services', role: s.type, devices: 1, status: s.status === 'Disabled' ? 'Unused' : 'Active', serviceId: s.id, customerId: s.customerId });
    }

    /* ---- ASNs: the site fabric, plus one per BGP leaf in a leaf–spine fabric */
    const bgp = routing.filter(l => l.protocol === 'BGP' && (db.neById.get(l.aNe)?.dcId === dc.id || db.neById.get(l.zNe)?.dcId === dc.id));
    asns.push({ id: `${dc.id}:asn`, asn: siteAsn, kind: 'Private 16-bit', dcId: dc.id, description: `${dc.id} site fabric`, devices: sp.filter(n => n.layer !== 'leaf').length, sessions: bgp.length, up: bgp.filter(l => l.state === 'up').length });
    const leafs = sp.filter(n => n.layer === 'leaf' && n.role === 'Switch' && bgp.some(l => l.aNe === n.id || l.zNe === n.id));
    leafs.forEach((n, k) => { const ss = bgp.filter(l => l.aNe === n.id || l.zNe === n.id); asns.push({ id: `${n.id}:asn`, asn: 4200000000 + i * 1000 + k + 1, kind: 'Private 32-bit', dcId: dc.id, description: `${n.name} (leaf, RFC 7938)`, devices: 1, sessions: ss.length, up: ss.filter(l => l.state === 'up').length }); });

    /* ---- application services on the addresses */
    for (const n of nes.filter(x => !isPlanned(x))) {
      const add = (name: string, protocol: 'TCP' | 'UDP', ports: number[], address = n.ip) => services.push({ id: `${n.id}:${name}`, name, protocol, ports, deviceId: n.id, deviceName: n.name, dcId: dc.id, address });
      if (HOST.has(n.role)) { add('Redfish', 'TCP', [443]); add('IPMI', 'UDP', [623]); continue; }
      add('SSH', 'TCP', [22]); add('SNMP', 'UDP', [161]);
      if (n.role === 'Router' || n.role === 'Firewall') add('NETCONF', 'TCP', [830]);
      const loA = addresses.find(a => a.use === 'Loopback' && a.deviceId === n.id);
      if (loA && bgp.some(l => l.aNe === n.id || l.zNe === n.id)) add('BGP', 'TCP', [179], loA.address);
    }
  });

  /* ---- backbone: a /31 per inter-site link */
  const bb = addP({ id: 'backbone', prefix: '10.255.0.0/16', vrf: 'DEFAULT', role: 'Backbone', status: 'Active', description: 'Inter-site backbone links (/31 each)', aggregate: '10.0.0.0/8' });
  let bk = 0;
  for (const l of db.links) {
    if (l.protocol !== 'LLDP') continue;
    const a = db.neById.get(l.aNe), z = db.neById.get(l.zNe);
    if (!a || !z || a.dcId === z.dcId) continue;
    const base = toInt('10.255.0.0') + bk++ * 2;
    addA({ address: toIp(base), mask: 31, prefixId: bb.id, vrf: 'DEFAULT', dcId: a.dcId, status: 'Active', use: 'Link', deviceId: a.id, deviceName: a.name, iface: l.aIf, dns: `${l.aIf.replace(/[/:]/g, '-')}.${dns(a)}`, note: `backhaul to ${z.name} ${l.zIf}` });
    addA({ address: toIp(base + 1), mask: 31, prefixId: bb.id, vrf: 'DEFAULT', dcId: z.dcId, status: 'Active', use: 'Link', deviceId: z.id, deviceName: z.name, iface: l.zIf, dns: `${l.zIf.replace(/[/:]/g, '-')}.${dns(z)}`, note: `backhaul to ${a.name} ${l.aIf}` });
  }

  /* ---- customer services: L3VPN VRFs (PE–CE /31) and public IRV /31s */
  const custName = new Map(db.customers.map(c => [c.id, c.name]));
  const l3 = db.services.filter(s => s.type === 'L3VPN');
  const custs = [...new Set(l3.map(s => s.customerId))];
  custs.forEach((cid, k) => {
    const words = (custName.get(cid) ?? cid).toUpperCase().replace(/[^A-Z0-9 ]+/g, '').split(/\s+/).filter(Boolean);
    let tag = ''; for (const w of words) { if (tag && tag.length + w.length + 1 > 18) break; tag = tag ? `${tag}-${w}` : w; }
    const name = `L3VPN-${tag}`;
    vrfs.push({ id: name, name, rd: `${OPER_ASN}:${1000 + k}`, scope: 'Customer', customerId: cid, importRt: [`${OPER_ASN}:${1000 + k}`], exportRt: [`${OPER_ASN}:${1000 + k}`], prefixes: 0, addresses: 0, enforceUnique: true, description: `${custName.get(cid) ?? cid} — layer-3 VPN` });
    const p = addP({ id: `cust:${cid}`, prefix: `100.64.${k}.0/24`, vrf: name, role: 'Customer', status: 'Active', description: `${custName.get(cid) ?? cid} PE–CE links`, aggregate: '100.64.0.0/10' });
    l3.filter(s => s.customerId === cid).slice(0, 127).forEach((s, j) => {
      const pe = db.neById.get(s.neId);
      addA({ address: `100.64.${k}.${j * 2}`, mask: 31, prefixId: p.id, vrf: name, dcId: s.dcId, status: s.status === 'Disabled' ? 'Reserved' : 'Active', use: 'PE–CE', deviceId: pe?.id, deviceName: pe?.name, iface: s.ifName, dns: `${s.id.toLowerCase()}.pe.${domain(s.dcId)}`, note: `${s.id} PE side` });
      addA({ address: `100.64.${k}.${j * 2 + 1}`, mask: 31, prefixId: p.id, vrf: name, dcId: s.dcId, status: s.status === 'Disabled' ? 'Reserved' : 'Active', use: 'PE–CE', deviceName: `CE · ${custName.get(cid) ?? cid}`, dns: `${s.id.toLowerCase()}.ce.${domain(s.dcId)}`, note: `${s.id} customer side` });
    });
  });
  const irv = db.services.filter(s => s.type === 'IRV');
  const pub = ['203.0.113.0/24', '198.51.100.0/24', '192.0.2.0/24'];
  if (irv.length) {
    vrfs.push({ id: 'INTERNET', name: 'INTERNET', rd: `${OPER_ASN}:3`, scope: 'Estate', importRt: [`${OPER_ASN}:3`], exportRt: [`${OPER_ASN}:3`], prefixes: 0, addresses: 0, enforceUnique: true, description: 'Internet access (IRV) customer links' });
    const ps = pub.map((x, k) => addP({ id: `pub:${k}`, prefix: x, vrf: 'INTERNET', role: 'Public', status: 'Active', description: `Public block ${k + 1} · ${rir}`, aggregate: x }));
    irv.slice(0, 381).forEach((s, j) => {
      const blk = Math.floor(j / 127), h = (j % 127) * 2, base = parse(pub[blk]).base;
      const pe = db.neById.get(s.neId);
      addA({ address: toIp(base + h), mask: 31, prefixId: ps[blk].id, vrf: 'INTERNET', dcId: s.dcId, status: s.status === 'Disabled' ? 'Reserved' : 'Active', use: 'PE–CE', deviceId: pe?.id, deviceName: pe?.name, iface: s.ifName, dns: `${s.id.toLowerCase()}.${domain(s.dcId)}`, note: `${s.id} internet handoff` });
      addA({ address: toIp(base + h + 1), mask: 31, prefixId: ps[blk].id, vrf: 'INTERNET', dcId: s.dcId, status: s.status === 'Disabled' ? 'Reserved' : 'Active', use: 'PE–CE', deviceName: `CE · ${custName.get(s.customerId) ?? s.customerId}`, dns: `cpe.${s.id.toLowerCase()}.${domain(s.dcId)}`, note: `${s.id} customer router` });
    });
  }
  asns.unshift({ id: 'oper', asn: OPER_ASN, kind: 'Public', description: `Operator backbone ASN (${rir})`, devices: db.nes.filter(n => n.isPe).length, sessions: db.links.filter(l => l.protocol === 'BGP' && l.role === 'Peering').length, up: db.links.filter(l => l.protocol === 'BGP' && l.role === 'Peering' && l.state === 'up').length });

  /* ---- runtime overlay (reserved IPs, carved prefixes) */
  prefixes.push(...overlay.prefixes.filter(p => !prefixes.some(x => x.id === p.id)));
  addresses.push(...overlay.addresses.filter(a => !addresses.some(x => x.id === a.id)));

  /* ---- roll-ups: used = addresses bound in the prefix; a container counts its children's size */
  const byPrefix = new Map<string, number>();
  for (const a of addresses) if (a.prefixId) byPrefix.set(a.prefixId, (byPrefix.get(a.prefixId) ?? 0) + 1);
  for (const p of prefixes) {
    const kids = prefixes.filter(c => c.parentId === p.id);
    p.children = kids.length;
    p.used = p.status === 'Container' ? kids.reduce((a, c) => a + span(parse(c.prefix).mask), 0) : byPrefix.get(p.id) ?? 0;
    p.pct = p.size ? Math.min(100, Math.round((p.used / (p.status === 'Container' ? span(parse(p.prefix).mask) : p.size)) * 100)) : 0;
  }
  for (const v of vrfs) { v.prefixes = prefixes.filter(p => p.vrf === v.id).length; v.addresses = addresses.filter(a => a.vrf === v.id).length; }

  const aggDefs: [string, string, string][] = [['172.16.0.0/12', 'RFC 1918', 'Management networks (each site in its own VRF, so ranges may repeat)'], ['10.0.0.0/8', 'RFC 1918', 'Site fabrics, loopbacks, hosts and the backbone'],
    ...(custs.length ? [['100.64.0.0/10', 'RFC 6598', 'Customer PE–CE links (L3VPN)'] as [string, string, string]] : []), ...(irv.length ? pub.map(p => [p, rir, 'Public addresses for internet customers'] as [string, string, string]) : [])];
  const aggregates: IpAggregate[] = aggDefs.map(([prefix, r, description]) => {
    const top = prefixes.filter(p => p.aggregate === prefix && !p.parentId);
    const allocated = top.reduce((a, p) => a + span(parse(p.prefix).mask), 0);
    const size = span(parse(prefix).mask);
    return { id: prefix, prefix, rir: r, description, size, allocated, pct: Math.round((allocated / size) * 1000) / 10 };
  });
  /* management /12 counts every site's container even where VRFs reuse a range */

  /* ---- findings */
  const findings: IpFinding[] = [];
  for (const p of prefixes) if (p.status === 'Active' && p.size >= 8 && p.pct >= 90 && p.role !== 'Point-to-point')
    findings.push({ id: `full:${p.id}`, severity: p.pct >= 97 ? 'major' : 'minor', kind: 'Prefix full', title: `${p.prefix} is ${p.pct}% used`, detail: `${p.description}: ${p.used} of ${p.size} addresses bound. Carve the next block before new devices are added.`, dcId: p.dcId, ref: p.id });
  const outside = addresses.filter(a => a.status === 'Outside plan');
  for (const a of outside) findings.push({ id: `out:${a.id}`, severity: 'major', kind: 'Outside plan', title: `${a.deviceName} uses ${a.address} outside its site plan`, detail: a.note ?? '', dcId: a.dcId, ref: a.id });
  const seen = new Map<string, IpAddr>();
  for (const a of addresses) { const k = `${a.vrf}|${a.address}`; const o = seen.get(k); if (o && o.deviceId !== a.deviceId) findings.push({ id: `dup:${k}:${a.deviceId}`, severity: 'critical', kind: 'Conflict', title: `${a.address} is on two devices in ${a.vrf}`, detail: `${o.deviceName} and ${a.deviceName} both hold it.`, dcId: a.dcId, ref: a.id }); seen.set(k, a); }
  for (const v of vlans.filter(x => x.status === 'Unused')) findings.push({ id: `vlan:${v.id}`, severity: 'warning', kind: 'Unused VLAN', title: `VLAN ${v.vid} ${v.name} is unused`, detail: `Its service ${v.serviceId} is disabled; release the VLAN or re-use it.`, dcId: v.dcId, ref: v.id });
  for (const g of fhrp.filter(x => x.state === 'degraded')) findings.push({ id: `fhrp:${g.id}`, severity: 'major', kind: 'Gateway degraded', title: `Gateway ${g.vip} has lost redundancy`, detail: `${g.protocol} group ${g.group}: ${g.members.length < 2 ? 'only one router in the group' : 'a member is down or unreachable'}; hosts behind it depend on a single router.`, dcId: g.dcId, ref: g.prefixId });
  const rank = { critical: 0, major: 1, minor: 2, warning: 3 } as const;
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);

  const used16 = asns.filter(a => a.kind === 'Private 16-bit').length, used32 = asns.filter(a => a.kind === 'Private 32-bit').length;
  const asnRanges: IpAsnRange[] = [{ id: 'r16', name: 'Private 16-bit pool', start: 64512, end: 65534, used: used16 }, { id: 'r32', name: 'Private 32-bit pool', start: 4200000000, end: 4294967294, used: used32 }];
  return { prefixes, addresses, vrfs, vlans, asns, asnRanges, ranges, fhrp, services, aggregates, findings };
}

/* ---- runtime allocation */
export function reserveNextIp(db: Db, prefixId: string, note: string): IpAddr {
  const m = ipamModel(db);
  const p = m.prefixes.find(x => x.id === prefixId); if (!p) throw new Error('Unknown prefix');
  if (p.status === 'Container') throw new Error('Pick an active prefix, not a container');
  const { base, mask } = parse(p.prefix);
  const taken = new Set(m.addresses.filter(a => a.vrf === p.vrf).map(a => toInt(a.address)));
  const first = mask >= 31 ? base : base + 1, last = mask >= 31 ? base + span(mask) - 1 : base + span(mask) - 2;
  for (let n = first; n <= last; n++) {
    if (taken.has(n)) continue;
    const a: IpAddr = { id: `${p.vrf}|${toIp(n)}`, address: toIp(n), mask, prefixId: p.id, vrf: p.vrf, dcId: p.dcId, status: 'Reserved', use: 'Reserved', dns: '', note: note || 'Reserved by hand' };
    overlay.addresses.push(a); cache = null;
    return a;
  }
  throw new Error(`${p.prefix} is full`);
}

export function carvePrefix(db: Db, parentId: string, mask: number, role: PrefixRole, description: string): IpPrefix {
  const m = ipamModel(db);
  const c = m.prefixes.find(x => x.id === parentId); if (!c) throw new Error('Unknown container');
  const { base, mask: cm } = parse(c.prefix);
  if (mask <= cm || mask > 30) throw new Error(`Size must be between /${cm + 1} and /30`);
  const kids = m.prefixes.filter(x => x.parentId === c.id).map(x => parse(x.prefix));
  for (let n = base; n + span(mask) <= base + span(cm); n += span(mask)) {
    if (kids.some(k => n < k.base + span(k.mask) && k.base < n + span(mask))) continue;
    const p: IpPrefix = { id: `${c.id}:new:${toIp(n)}`, prefix: `${toIp(n)}/${mask}`, dcId: c.dcId, vrf: c.vrf, role, status: 'Reserved', parentId: c.id, description: description || `Reserved block in ${c.prefix}`, size: usable(mask), used: 0, pct: 0, children: 0, aggregate: c.aggregate };
    overlay.prefixes.push(p); cache = null;
    return p;
  }
  throw new Error(`No free /${mask} left in ${c.prefix}`);
}
