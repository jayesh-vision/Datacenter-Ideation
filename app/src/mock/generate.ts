/* Deterministic mock estate. Everything a screen counts is an entity here, so
   a number reached from two different screens is always the same number. */

import { mulberry32, seedOf, pick, intBetween, between, chance, type Rnd } from '../lib/rng';
import type {
  Alert, AuditEntry, CapacityPlan, Change, Circle, CoolingUnit, Customer, Datacenter, EnvSensor, Incident, Interface, Link, LinkState, Location,
  NetworkElement, NeRole, Protocol, Rack, ReconTask, Region, RolloutStatus, Service, ServiceType, Severity, UpsUnit, CableCore
} from '../api/types';
import { ACCOUNT_MANAGERS, BLOCKERS, CIRCLES, CITIES, CUSTOMERS, DAY, DCS, HOUR, MIN, NOW, PEOPLE, POP_STATUS, REGIONS, SITE_STATUS } from './seed';
import { buildIncidents } from './incidents';

export interface Db {
  now: number;
  regions: Region[]; circles: Circle[]; locations: Location[]; datacenters: Datacenter[];
  nes: NetworkElement[]; neById: Map<string, NetworkElement>; ifaces: Map<string, Interface[]>;
  links: Link[]; services: Service[]; customers: Customer[]; alerts: Alert[]; incidents: Incident[]; changes: Change[];
  recon: ReconTask[]; audit: AuditEntry[]; plans: CapacityPlan[];
  seq: { alm: number; inc: number; chg: number; rec: number; aud: number; plan: number };
}

const shuffle = <T,>(r: Rnd, xs: T[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const hex2 = (r: Rnd) => Math.floor(r() * 256).toString(16).toUpperCase().padStart(2, '0');
const hours = (r: Rnd, okP: number) => Array.from({ length: 24 }, () => !chance(r, 1 - okP));

/* ------------------------------------------------------------------ estate */

function buildEstate(r: Rnd) {
  const regions = REGIONS;
  const circles: Circle[] = CIRCLES.map(([id, name, regionId, lat, lng]) => ({ id, name, state: name, regionId, lat, lng }));
  const locations: Location[] = [];
  const passive = (k: Location['kind'], rr: Rnd): Location['passive'] => k === 'datacenter'
    ? { fiberSpans: intBetween(rr, 8, 20), odf: intBetween(rr, 4, 9), racks: 0, powerPlant: intBetween(rr, 4, 8), splices: intBetween(rr, 4, 10), patchCords: intBetween(rr, 40, 90), ducts: intBetween(rr, 2, 6) }
    : k === 'pop'
      ? { fiberSpans: intBetween(rr, 2, 5), odf: intBetween(rr, 1, 2), racks: intBetween(rr, 1, 3), powerPlant: 1, splices: intBetween(rr, 1, 3), patchCords: intBetween(rr, 6, 14), ducts: intBetween(rr, 0, 2) }
      : { fiberSpans: chance(rr, 0.55) ? 1 : 0, odf: chance(rr, 0.2) ? 1 : 0, racks: chance(rr, 0.45) ? 1 : 0, powerPlant: chance(rr, 0.15) ? 1 : 0, splices: chance(rr, 0.2) ? 1 : 0, patchCords: intBetween(rr, 0, 1), ducts: chance(rr, 0.1) ? 1 : 0 };

  for (const d of DCS) {
    const [id, city, , circleId, status, ne, disc, , lat, lng, category] = d;
    const c = circles.find(x => x.id === circleId)!;
    const rr = mulberry32(seedOf(id));
    locations.push({ id, name: id, kind: 'datacenter', status, circleId, regionId: c.regionId, city, state: c.state, lat, lng, category, neCount: ne, discovered: disc, roles: {}, passive: passive('datacenter', rr) });
  }
  const statusBag = (counts: Record<RolloutStatus, number>) => shuffle(r, (Object.entries(counts) as [RolloutStatus, number][]).flatMap(([s, n]) => Array(n).fill(s) as RolloutStatus[]));
  const popBag = statusBag(POP_STATUS), siteBag = statusBag(SITE_STATUS);
  let pi = 0, si = 0;
  for (const [cid, , regionId, clat, clng, pops, sites] of CIRCLES) {
    const c = circles.find(x => x.id === cid)!;
    const cities = CITIES[cid];
    for (let i = 0; i < pops; i++) {
      const status = popBag[pi++];
      const roles: Record<string, number> = { Router: intBetween(r, 2, 3), Switch: intBetween(r, 1, 2) };
      if (chance(r, 0.35)) roles.DWDM = 1;
      const n = Object.values(roles).reduce((a, b) => a + b, 0);
      const disc = status === 'on-air' ? n : status === 'in-progress' ? intBetween(r, 0, n - 1) : status === 'failed' ? intBetween(r, 0, 1) : 0;
      const bl = status === 'failed' || (status === 'in-progress' && chance(r, 0.35)) ? pick(r, BLOCKERS) : null;
      locations.push({ id: `${cid}-POP-${String(i + 1).padStart(3, '0')}`, name: `${cid}-POP-${String(i + 1).padStart(3, '0')}`, kind: 'pop', status, circleId: cid, regionId, city: pick(r, cities), state: c.state,
        lat: clat + between(r, -1.6, 1.6), lng: clng + between(r, -1.6, 1.6), category: 'Regional', neCount: n, discovered: disc, roles, blocker: bl?.[0], blockerNote: bl?.[1], passive: passive('pop', r) });
    }
    for (let i = 0; i < sites; i++) {
      const status = siteBag[si++];
      const roles: Record<string, number> = { Access: 1 };
      if (chance(r, 0.012)) roles.eNodeB = 1; else if (chance(r, 0.009)) roles.gNodeB = 1;
      const n = Object.values(roles).reduce((a, b) => a + b, 0);
      const disc = status === 'on-air' ? n : status === 'in-progress' && chance(r, 0.4) ? 1 : 0;
      const bl = status === 'failed' || (status === 'in-progress' && chance(r, 0.12)) ? pick(r, BLOCKERS) : null;
      locations.push({ id: `${cid}-ST-${String(i + 1).padStart(4, '0')}`, name: `${cid}-ST-${String(i + 1).padStart(4, '0')}`, kind: 'site', status, circleId: cid, regionId, city: pick(r, cities), state: c.state,
        lat: clat + between(r, -2.1, 2.1), lng: clng + between(r, -2.1, 2.1), category: 'Edge', neCount: n, discovered: disc, roles, blocker: bl?.[0], blockerNote: bl?.[1], passive: passive('site', r) });
    }
  }
  return { regions, circles, locations };
}

/* --------------------------------------------------------- network elements */

const ROUTER_MODELS = [['JUNIPER', 'MX204', '21.4R3-S5.5', 'JU'], ['JUNIPER', 'MX480', '22.2R3-S2', 'JU'], ['CISCO', 'ASR 9006', 'IOS XR 7.9.2', 'CS'], ['NOKIA', '7750 SR-1', 'SR OS 23.10.R2', 'NK']] as const;
const ACCESS_MODELS = [['CISCO', 'NCS 540', 'IOS XR 7.8.1', 'CS'], ['JUNIPER', 'ACX7100', '22.4R2', 'JU'], ['NOKIA', '7250 IXR-e', 'SR OS 23.3.R1', 'NK']] as const;
const SWITCH_MODELS = [['CISCO', 'Nexus 93180YC', 'NX-OS 10.3(4a)', 'CS'], ['ARISTA', '7050SX3-48YC', 'EOS 4.31.1F', 'AR'], ['JUNIPER', 'QFX5120-48Y', '22.2R3', 'JU']] as const;
const DWDM_MODELS = [['CIENA', '6500 D7', 'R16.2', 'CI'], ['NOKIA', '1830 PSS-16II', 'R23.6', 'NK']] as const;
const FW_MODELS = [['FORTINET', 'FortiGate 3700F', 'FortiOS 7.4.3', 'FG']] as const;

function ifName(vendor: string, kind: 'ge' | 'xe' | 'et', i: number): string {
  if (vendor === 'JUNIPER') return kind === 'et' ? `et-0/1/${i}` : kind === 'xe' ? `xe-0/0/${i}` : `ge-0/2/${i}`;
  if (vendor === 'CISCO') return kind === 'et' ? `Hu0/0/1/${i}` : kind === 'xe' ? `Te0/0/0/${i}` : `Gi0/0/2/${i}`;
  if (vendor === 'NOKIA') return kind === 'et' ? `1/2/c${i + 1}` : kind === 'xe' ? `1/1/c${i + 1}` : `1/3/${i + 1}`;
  if (vendor === 'ARISTA') return kind === 'et' ? `Ethernet49/${i + 1}` : `Ethernet${i + 1}`;
  if (vendor === 'CIENA') return `1-A-${i + 1}`;
  return kind === 'et' ? `port${i + 41}` : `port${i + 1}`;
}

interface NeDraft { ne: NetworkElement; uSize: number; drawKw: number; plan: { kind: 'ge' | 'xe' | 'et'; n: number }[] }

function buildNes(dcRow: typeof DCS[number], r: Rnd) {
  const [dcId, , , , dcStatus, total, discovered, drifted] = dcRow;
  const fw = total >= 160 ? 2 : 0;
  const dwdm = total >= 100 ? 2 : 1;
  const routers = Math.round(total * 0.592);
  const switches = total - routers - dwdm - fw;
  const spineN = Math.min(12, Math.max(4, Math.round(routers * 0.11)));
  const leafN = Math.max(4, Math.round(switches * 0.2));
  const drafts: NeDraft[] = [];
  const dcVendor = pick(r, ROUTER_MODELS);
  const add = (role: NeRole, layer: NetworkElement['layer'], name: string, m: readonly [string, string, string, string], uSize: number, drawKw: number, plan: NeDraft['plan'], isPe = false) => {
    const serialNo = 11000 + drafts.length * 7 + intBetween(r, 0, 6);
    drafts.push({
      uSize, drawKw, plan, ne: {
        id: name, dcId, name, role, layer, vendor: m[0], model: m[1], os: m[2], serial: `${m[3]}00${serialNo}`, ip: `172.${16 + (seedOf(dcId) % 16)}.${40 + Math.floor(drafts.length / 200)}.${(drafts.length % 200) + 20}`,
        mac: `A4:5E:60:${hex2(r)}:${hex2(r)}:${hex2(r)}`, rackId: '', u: 0, lifecycle: 'Ready', discovery: 'verified', health: 'healthy', healthScore: 100, cpu: 0, mem: 0, tempC: 0, uptimeMin: 0, lastReboot: 0,
        icmp: { lossPct: 0, latencyMs: 0, jitterMs: 0, availability: 100, state: 'healthy', hourly: [] }, ntp: { offsetMs: 0, delayMs: 0, jitterMs: 0, stratum: 3, state: 'Synchronised', primary: '10.16.16.10', secondary: '10.16.16.11', lastSync: 0, hourly: [] },
        radius: { successPct: 100, failures24h: 0, primary: 'Reachable', secondary: 'Reachable', lastAuth: 0, state: 'healthy', pri: '10.25.25.5', sec: '10.25.25.6' }, modules: [], isPe
      }
    });
  };
  for (let i = 1; i <= 4; i++) add('Router', 'core', `${dcId}-PE-T4-0${i}`, i <= 2 ? ROUTER_MODELS[0] : dcVendor, 1, 0.45, [{ kind: 'xe', n: 12 }, { kind: 'et', n: 4 }, { kind: 'ge', n: 16 }], true);
  for (let i = 1; i <= fw; i++) add('Firewall', 'core', `${dcId}-FW-0${i}`, FW_MODELS[0], 3, 1.1, [{ kind: 'xe', n: 8 }]);
  for (let i = 1; i <= dwdm; i++) add('DWDM', 'core', `${dcId}-OLA-0${i}`, pick(r, DWDM_MODELS), 6, 0.9, [{ kind: 'et', n: 8 }]);
  for (let i = 1; i <= spineN; i++) add('Router', 'spine', `${dcId}-AGG-R${String(i).padStart(2, '0')}`, ROUTER_MODELS[1], 4, 1.6, [{ kind: 'xe', n: 16 }, { kind: 'et', n: 8 }]);
  for (let i = 1; i <= leafN; i++) add('Switch', 'leaf', `${dcId}-ACC-${String(i).padStart(2, '0')}`, pick(r, SWITCH_MODELS), 1, 0.38, [{ kind: 'xe', n: 32 }, { kind: 'et', n: 4 }]);
  const accR = routers - 4 - spineN;
  for (let i = 1; i <= accR; i++) add('Router', 'access', `${dcId}-CSR-${String(i).padStart(3, '0')}`, pick(r, ACCESS_MODELS), 1, 0.16, [{ kind: 'ge', n: 8 }, { kind: 'xe', n: 4 }]);
  for (let i = 1; i <= switches - leafN; i++) add('Switch', 'access', `${dcId}-TOR-${String(i).padStart(3, '0')}`, pick(r, SWITCH_MODELS), 1, 0.24, [{ kind: 'xe', n: 24 }, { kind: 'et', n: 2 }]);

  /* discovery state: newest access gear is what's not discovered yet */
  const notDisc = total - discovered;
  const candidates = drafts.filter(d => d.ne.layer === 'access').reverse().concat(drafts.filter(d => d.ne.layer !== 'access' && !d.ne.isPe).reverse(), drafts.filter(d => d.ne.isPe));
  const nd = candidates.slice(0, notDisc);
  const reasonBag = dcId === 'MH-DC-001'
    ? [...Array(48).fill('planned'), ...Array(22).fill('no-collector'), ...Array(4).fill('collector-unavailable'), ...Array(2).fill('not-applicable')]
    : dcStatus === 'planned' ? Array(notDisc).fill('planned') : nd.map(() => pick(r, ['planned', 'planned', 'no-collector', 'collector-unavailable']));
  nd.forEach((d, i) => { d.ne.discovery = 'not-discovered'; d.ne.ndReason = reasonBag[i] as NetworkElement['ndReason']; d.ne.lifecycle = d.ne.ndReason === 'planned' ? 'Planned' : 'Ready'; });
  const disc = drafts.filter(d => d.ne.discovery !== 'not-discovered' && d.ne.id !== `${dcId}-PE-T4-01`);
  const dr = shuffle(r, disc).slice(0, drifted);
  const DRIFTS: (() => { attr: string; record: string; observed: string })[] = [
    () => ({ attr: 'OS version', record: '21.4R3-S5.5', observed: '22.2R3-S2' }),
    () => ({ attr: 'Rack position', record: `U${intBetween(r, 4, 30)}`, observed: `U${intBetween(r, 31, 40)}` }),
    () => ({ attr: 'Hostname', record: 'legacy-name-01', observed: 'renamed on device' }),
    () => ({ attr: 'Management IP', record: `10.40.${intBetween(r, 1, 9)}.${intBetween(r, 10, 99)}`, observed: `10.40.${intBetween(r, 10, 19)}.${intBetween(r, 100, 199)}` }),
    () => ({ attr: 'Line card', record: 'MPC7E-10G', observed: 'MPC7E-MRATE' })
  ];
  dr.forEach((d, i) => {
    d.ne.discovery = 'drifted';
    const items = [pick(r, DRIFTS)()];
    if (i % 3 === 0) { const twin = disc[(i * 7 + 3) % disc.length]; if (twin && twin !== d) { d.ne.duplicateSerialOf = twin.ne.id; items.unshift({ attr: 'Serial number', record: d.ne.serial, observed: twin.ne.serial }); } }
    const os = items.find(x => x.attr === 'OS version');
    if (os) { os.record = d.ne.os; if (os.observed === os.record) os.observed = d.ne.vendor === 'JUNIPER' ? '23.2R1-S1' : `${d.ne.os} (patched)`; }
    d.ne.drift = items;
  });
  return drafts;
}

/* -------------------------------------------------------------- facility */

function placeInRacks(dcId: string, drafts: NeDraft[], r: Rnd) {
  const totalU = drafts.reduce((a, d) => a + d.uSize, 0) + 0;
  const nRacks = Math.max(4, Math.ceil(totalU / 26));
  const big = nRacks > 8;
  const floors = big ? [{ name: 'Ground', rooms: ['MDF', 'Hall A'] }, { name: '1st floor', rooms: ['Equipment room', 'Hall B'] }] : [{ name: 'Ground', rooms: ['MDF'] }, { name: '1st floor', rooms: ['Equipment room'] }];
  const rooms = floors.flatMap(f => f.rooms.map(rm => ({ floor: f.name, room: rm })));
  const racks: Rack[] = Array.from({ length: nRacks }, (_, i) => {
    const loc = rooms[Math.min(rooms.length - 1, Math.floor((i / nRacks) * rooms.length))];
    const name = `RACK-${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}`;
    return { id: `${dcId}-${name}`, name, dcId, floor: loc.floor, room: loc.room, role: i === 0 ? 'Core' : i === 1 ? 'Aggregation' : i === nRacks - 1 ? 'ODF / patching' : 'Access', heightU: i % 3 === 1 ? 42 : 45, usedU: 0, drawKw: 0, budgetKw: 0, ports: 0, portsUsed: 0, tempC: 0 };
  });
  let ri = 0;
  for (const d of drafts) {
    while (ri < racks.length - 2 && racks[ri].usedU + d.uSize > racks[ri].heightU - 10) ri++;
    const rk = racks[ri];
    d.ne.rackId = rk.id; d.ne.u = rk.usedU + 2;
    rk.usedU += d.uSize;
    if (d.ne.discovery !== 'not-discovered' || d.ne.ndReason !== 'planned') rk.drawKw += d.drawKw * between(r, 0.85, 1.15);
  }
  /* patch panels / ODF occupy U in the last rack */
  const odf = racks[racks.length - 1]; odf.usedU += 18; odf.drawKw += 0.4;
  racks.forEach(rk => { rk.drawKw = r1(rk.drawKw); rk.budgetKw = Math.max(rk.role === 'Core' || rk.role === 'Aggregation' ? 12 : 8, Math.ceil(rk.drawKw / between(r, 0.55, 0.8))); });
  return { racks, floors };
}

/* ------------------------------------------------------------------ build */

export function generate(): Db {
  const r = mulberry32(20261001);
  const { regions, circles, locations } = buildEstate(r);
  const nes: NetworkElement[] = [];
  const ifaces = new Map<string, Interface[]>();
  const datacenters: Datacenter[] = [];
  const links: Link[] = [];
  const freeIf = new Map<string, Interface[]>();

  /* ---- per-DC hardware */
  const draftsByDc = new Map<string, NeDraft[]>();
  for (const row of DCS) {
    const rr = mulberry32(seedOf(row[0]) ^ 0x5eed);
    const drafts = buildNes(row, rr);
    draftsByDc.set(row[0], drafts);
    for (const d of drafts) {
      nes.push(d.ne);
      const list: Interface[] = [];
      for (const p of d.plan) for (let i = 0; i < p.n; i++) {
        const name = ifName(d.ne.vendor, p.kind, i);
        const speed = p.kind === 'ge' ? 1000 : p.kind === 'xe' ? 10000 : 100000;
        list.push({ id: `${d.ne.id}:${name}`, neId: d.ne.id, name, type: p.kind === 'ge' ? '1G copper' : p.kind === 'xe' ? '10G SFP+' : '100G QSFP28', speedMbps: speed, state: 'admin-down', utilPct: 0, inErrors: 0, crcErrors: 0, flaps24h: 0, description: '' });
      }
      ifaces.set(d.ne.id, list);
      freeIf.set(d.ne.id, [...list]);
    }
  }
  const neById = new Map(nes.map(n => [n.id, n]));

  const take = (neId: string, kinds: string[], skip?: (i: Interface) => boolean) => {
    const pool = freeIf.get(neId)!;
    const idx = pool.findIndex(i => kinds.some(k => i.type.startsWith(k)) && !(skip?.(i)));
    if (idx < 0) return null;
    return pool.splice(idx, 1)[0];
  };
  let linkSeq = 1;
  let cableSeq = 1;
  const STRANDS = ['Blue', 'Orange', 'Green', 'Brown', 'Slate', 'White', 'Red', 'Black', 'Yellow', 'Violet', 'Rose', 'Aqua'];
  const mkLink = (protocol: Protocol, a: Interface, z: Interface, role: Link['role'], dcId: string, rr: Rnd, base?: Link): Link => {
    const util = base ? base.utilPct : r1(role === 'Backhaul' || role === 'Uplink' ? (chance(rr, 0.012) ? between(rr, 80, 91) : between(rr, 34, 72)) : between(rr, 8, 62));
    const growth = base ? base.growthPct : r1(between(rr, 0.4, 2.6));
    const history = base ? base.history : Array.from({ length: 6 }, (_, i) => r1(Math.max(1, util / Math.pow(1 + growth / 100, 5 - i) + between(rr, -1.2, 1.2))));
    if (!base) history[5] = util;
    const l: Link = { id: `LNK-${String(linkSeq++).padStart(5, '0')}`, protocol, aNe: a.neId, aIf: a.name, zNe: z.neId, zIf: z.name, dcId, capacityMbps: Math.min(a.speedMbps, z.speedMbps), utilPct: util, state: 'up', role,
      sessions: base ? base.sessions : intBetween(rr, 900, 9200), growthPct: growth, history, physical: null };
    if (protocol === 'LLDP') l.physical = { cable: `${dcId}-CBL-${String(cableSeq++).padStart(4, '0')}`, strand: pick(rr, STRANDS), aPort: `ODF-${intBetween(rr, 1, 4)}/P${intBetween(rr, 1, 24)}`, zPort: `ODF-${intBetween(rr, 1, 4)}/P${intBetween(rr, 1, 24)}` };
    links.push(l);
    return l;
  };
  const adjacency = (a: NetworkElement, b: NetworkElement, kindsA: string[], kindsB: string[], role: Link['role'], rr: Rnd, protos: Protocol[]) => {
    const ia = take(a.id, kindsA, i => a.isPe && /xe-0\/0\/[0-5]$|Te0\/0\/0\/[0-5]$|1\/1\/c[1-6]$/.test(i.name));
    const ib = take(b.id, kindsB, i => b.isPe && /xe-0\/0\/[0-5]$|Te0\/0\/0\/[0-5]$|1\/1\/c[1-6]$/.test(i.name));
    if (!ia || !ib) { if (ia) freeIf.get(a.id)!.unshift(ia); if (ib) freeIf.get(b.id)!.unshift(ib); return; }
    ia.peer = { neId: b.id, ifName: ib.name }; ib.peer = { neId: a.id, ifName: ia.name };
    ia.description = `${role} to ${b.name}`; ib.description = `${role} to ${a.name}`;
    const lldp = mkLink('LLDP', ia, ib, role, a.dcId, rr);
    for (const p of protos) mkLink(p, ia, ib, role, a.dcId, rr, lldp);
  };

  for (const row of DCS) {
    const dcId = row[0];
    const rr = mulberry32(seedOf(dcId) ^ 0x11);
    const live = draftsByDc.get(dcId)!.map(d => d.ne).filter(n => n.discovery !== 'not-discovered');
    const core = live.filter(n => n.isPe), spine = live.filter(n => n.layer === 'spine'), leaf = live.filter(n => n.layer === 'leaf');
    const fw = live.filter(n => n.role === 'Firewall'), dw = live.filter(n => n.role === 'DWDM');
    const accR = live.filter(n => n.layer === 'access' && n.role === 'Router'), tor = live.filter(n => n.layer === 'access' && n.role === 'Switch');
    for (let i = 0; i < core.length; i++) for (let j = i + 1; j < core.length; j++) adjacency(core[i], core[j], ['100G'], ['100G'], 'Fabric', rr, ['OSPF', 'ISIS', 'BGP', 'LSP']);
    spine.forEach((s, i) => { adjacency(s, core[i % core.length], ['100G'], ['10G'], 'Uplink', rr, ['OSPF', 'ISIS']); adjacency(s, core[(i + 1) % core.length], ['100G'], ['10G'], 'Uplink', rr, ['OSPF', 'ISIS']); });
    dw.forEach((d, i) => { if (spine.length) adjacency(d, spine[i % spine.length], ['100G'], ['100G'], 'Uplink', rr, []); });
    fw.forEach((f, i) => { if (spine.length) { adjacency(f, spine[i % spine.length], ['10G'], ['10G'], 'Uplink', rr, []); adjacency(f, spine[(i + 1) % spine.length], ['10G'], ['10G'], 'Uplink', rr, []); } });
    leaf.forEach((l, i) => { if (spine.length) { adjacency(l, spine[i % spine.length], ['100G'], ['10G'], 'Uplink', rr, []); adjacency(l, spine[(i + 3) % spine.length], ['100G'], ['10G'], 'Uplink', rr, []); } });
    accR.forEach((a, i) => { if (spine.length) { adjacency(a, spine[i % spine.length], ['10G'], ['10G'], 'Access', rr, ['OSPF']); if (i % 2 === 0) adjacency(a, spine[(i + 5) % spine.length], ['10G'], ['10G'], 'Access', rr, ['OSPF']); } });
    tor.forEach((t, i) => { if (leaf.length) { adjacency(t, leaf[i % leaf.length], ['100G', '10G'], ['10G'], 'Access', rr, []); adjacency(t, leaf[(i + 1) % leaf.length], ['100G', '10G'], ['10G'], 'Access', rr, []); } });
  }

  /* inter-DC backhaul: each live PE offers its five reserved backhaul ports */
  const stubs: Interface[] = [];
  for (const n of nes) if (n.isPe && n.discovery !== 'not-discovered') {
    const pool = freeIf.get(n.id)!;
    for (let k = 1; k <= 5; k++) { const idx = pool.findIndex(i => i.speedMbps === 10000 && /(xe-0\/0\/|Te0\/0\/0\/|1\/1\/c)/.test(i.name) && (i.name.endsWith(`/${k}`) || i.name.endsWith(`c${k + 1}`))); if (idx >= 0) stubs.push(pool.splice(idx, 1)[0]); }
  }
  const bh = shuffle(r, stubs);
  const used = new Set<string>();
  /* the hero PE's ports pair first so its forecast cards are stable */
  bh.sort((a, b) => (a.neId === 'MH-DC-001-PE-T4-01' ? -1 : 0) - (b.neId === 'MH-DC-001-PE-T4-01' ? -1 : 0));
  for (let i = 0; i < bh.length; i++) {
    const a = bh[i]; if (used.has(a.id)) continue;
    const dcA = neById.get(a.neId)!.dcId;
    const z = bh.find((x, j) => j > i && !used.has(x.id) && neById.get(x.neId)!.dcId !== dcA);
    if (!z) continue;
    used.add(a.id); used.add(z.id);
    const rr = mulberry32(seedOf(a.id));
    a.peer = { neId: z.neId, ifName: z.name }; z.peer = { neId: a.neId, ifName: a.name };
    const zdc = neById.get(z.neId)!.dcId;
    a.description = `Backhaul to ${zdc}`; z.description = `Backhaul to ${dcA}`;
    const l = mkLink('LLDP', a, z, chance(rr, 0.5) ? 'Backhaul' : 'Uplink', dcA, rr);
    mkLink('BGP', a, z, 'Peering', dcA, rr, l);
    if (chance(rr, 0.6)) mkLink('LSP', a, z, l.role, dcA, rr, l);
  }

  /* hero PE: link forecast cards and protocol counts from the reference screens */
  const HERO = 'MH-DC-001-PE-T4-01';
  const heroIf = (l: Link) => (l.aNe === HERO ? l.aIf : l.zIf);
  const FORCE: Record<string, { util: number; growth: number; sessions: number; role?: Link['role'] }> = {
    'xe-0/0/1': { util: 53, growth: 7.3, sessions: 8895 }, 'xe-0/0/2': { util: 70, growth: 2.6, sessions: 5426 }, 'xe-0/0/3': { util: 87, growth: 5.2, sessions: 7357, role: 'Backhaul' },
    'xe-0/0/4': { util: 41, growth: 3.1, sessions: 4210 }, 'xe-0/0/5': { util: 62, growth: 4.4, sessions: 6034 }
  };
  for (const l of links) {
    const ifn = l.aNe === HERO ? l.aIf : l.zNe === HERO ? l.zIf : null;
    if (!ifn || !FORCE[ifn]) continue;
    const f = FORCE[ifn];
    l.utilPct = f.util; l.growthPct = f.growth; l.sessions = f.sessions; if (f.role) l.role = f.role;
    l.history = Array.from({ length: 6 }, (_, i) => r1(f.util / Math.pow(1 + f.growth / 100, 5 - i)));
  }
  const setStates = (proto: Protocol, states: LinkState[]) => {
    const ls = links.filter(l => l.protocol === proto && (l.aNe === HERO || l.zNe === HERO) && !Object.keys(FORCE).includes(heroIf(l)));
    states.forEach((s, i) => { if (ls[i]) ls[i].state = s; });
  };
  setStates('LLDP', ['down', 'down']);
  setStates('OSPF', ['down', 'down', 'init']);
  setStates('BGP', []);
  setStates('ISIS', ['down']);
  setStates('LSP', ['standby']);
  const heroBgp = links.filter(l => l.protocol === 'BGP' && (l.aNe === HERO || l.zNe === HERO));
  heroBgp.slice(-2).forEach(l => { l.state = 'idle'; });

  /* elsewhere a light sprinkle of down / init sessions */
  for (const l of links) {
    if (l.aNe === HERO || l.zNe === HERO) continue;
    const rr = mulberry32(seedOf(l.id));
    if (l.protocol === 'LLDP' && chance(rr, 0.004)) l.state = 'down';
    else if (l.protocol === 'OSPF' && chance(rr, 0.01)) l.state = pick(rr, ['down', 'init'] as LinkState[]);
    else if (l.protocol === 'BGP' && chance(rr, 0.02)) l.state = 'idle';
    else if (l.protocol === 'LSP' && chance(rr, 0.03)) l.state = 'standby';
  }
  /* protocol links over a down physical link are down too */
  const lldpByIf = new Map<string, Link>();
  for (const l of links) if (l.protocol === 'LLDP') { lldpByIf.set(`${l.aNe}:${l.aIf}`, l); lldpByIf.set(`${l.zNe}:${l.zIf}`, l); }
  for (const l of links) if (l.protocol !== 'LLDP' && lldpByIf.get(`${l.aNe}:${l.aIf}`)?.state === 'down') l.state = l.protocol === 'BGP' ? 'idle' : 'down';

  /* interface state + utilisation follow the physical link */
  for (const l of links) if (l.protocol === 'LLDP') {
    for (const [ne, ifn] of [[l.aNe, l.aIf], [l.zNe, l.zIf]] as const) {
      const it = ifaces.get(ne)!.find(i => i.name === ifn)!;
      it.state = l.state === 'down' ? 'down' : 'up'; it.utilPct = l.state === 'down' ? 0 : l.utilPct;
      const rr = mulberry32(seedOf(it.id));
      it.inErrors = l.state === 'down' ? intBetween(rr, 40, 400) : chance(rr, 0.08) ? intBetween(rr, 1, 30) : 0;
      if (it.speedMbps >= 10000) it.optics = { model: it.speedMbps === 100000 ? 'QSFP28-100G-LR4' : 'SFP-10G-LR', rxDbm: r1(between(rr, -6.5, -2.2)), txDbm: r1(between(rr, -2.4, 0.8)), tempC: intBetween(rr, 34, 48) };
    }
  }
  /* server- and CPE-facing ports on access gear are in use too */
  for (const n of nes) {
    if (n.discovery === 'not-discovered' || n.isPe || n.layer === 'core' || n.layer === 'spine') continue;
    const rr = mulberry32(seedOf(n.id) ^ 0x9f);
    for (const it of freeIf.get(n.id)!) if (it.speedMbps <= 10000 && chance(rr, n.role === 'Switch' ? 0.62 : 0.5)) {
      it.state = chance(rr, 0.04) ? 'down' : 'up'; it.utilPct = it.state === 'up' ? r1(between(rr, 4, 58)) : 0; it.description = n.role === 'Switch' ? 'Server NIC' : 'Customer CPE';
    }
    const pool = freeIf.get(n.id)!; freeIf.set(n.id, pool.filter(i => i.state === 'admin-down'));
  }
  for (const list of ifaces.values()) for (const it of list) if (it.state === 'admin-down' && mulberry32(seedOf(it.id))() < 0.06) it.state = 'reserved';
  const heroX3 = ifaces.get(HERO)!.find(i => i.name === 'xe-0/0/3')!;
  heroX3.flaps24h = 8; heroX3.crcErrors = 1284; heroX3.inErrors = 3117; heroX3.optics = { model: 'SFP-10G-LR', rxDbm: -11.8, txDbm: -1.9, tempC: 58 };

  /* -------- customers + services */
  const customers: Customer[] = CUSTOMERS.map(([name, segment, city, state, plan, premium], i) => ({
    id: `CUST-${String(1202 + ((i * 7919) % 8800)).padStart(4, '0')}`, name, segment: segment as Customer['segment'], city, state, plan, premium, revenueMonthly: 0, accountManager: ACCOUNT_MANAGERS[i % ACCOUNT_MANAGERS.length]
  }));
  const services: Service[] = [];
  let svcSeq = 1100;
  const TYPES: ServiceType[] = ['IRV', 'Leased Line', 'L2VPN', 'L3VPN', 'Other'];
  const BW = [100, 200, 500, 1000, 1000, 2000, 10000];
  const typeCode: Record<ServiceType, string> = { IRV: 'IR', 'Leased Line': 'LL', L2VPN: 'L2', L3VPN: 'L3', Other: 'OT' };
  const makeSvc = (pe: NetworkElement, type: ServiceType, cust: Customer, bw: number, util: number, link: Link | undefined, rr: Rnd, idOverride?: string) => {
    const handoff = take(pe.id, ['1G', '10G'], i => /xe-0\/0\/[0-5]$/.test(i.name));
    if (!handoff) return;
    const id = idOverride ?? `SVC-${typeCode[type]}-${svcSeq++}`;
    handoff.state = 'up'; handoff.utilPct = util; handoff.description = `CUST: ${cust.name} · ${id}`;
    const remote = link ? (link.aNe === pe.id ? link.zNe : link.aNe) : undefined;
    const sla = cust.premium ? (type === 'L3VPN' ? 99.99 : 99.9) : 99.5;
    services.push({
      id, type, customerId: cust.id, dcId: pe.dcId, neId: pe.id, ifName: handoff.name, path: remote ? [pe.id, remote] : [pe.id], linkIds: link ? [link.id] : [],
      bandwidthMbps: bw, utilPct: util, status: 'Active', slaTarget: sla, uptime30d: r2(Math.min(99.999, chance(rr, 0.12) ? sla - between(rr, 0.04, 0.4) : sla + between(rr, 0.005, (100 - sla) * 0.9))), growthPct: r1(between(rr, 0.5, 4.2)),
      revenueMonthly: Math.round((bw >= 1000 ? 1.8 : 3.2) * bw * (type === 'L3VPN' ? 260 : type === 'IRV' ? 140 : 210) / 10) * 10, critical: cust.premium
    });
  };
  const byName = (n: string) => customers.find(c => c.name === n)!;
  for (const pe of nes.filter(n => n.isPe && n.discovery !== 'not-discovered')) {
    const rr = mulberry32(seedOf(pe.id) ^ 0x5c);
    const bhLinks = links.filter(l => l.protocol === 'LLDP' && (l.aNe === pe.id || l.zNe === pe.id) && (l.role === 'Backhaul' || l.role === 'Uplink') && neById.get(l.aNe)!.dcId !== neById.get(l.zNe)!.dcId);
    if (pe.id === HERO) {
      const lk = (n: string) => bhLinks.find(l => heroIf(l) === n);
      const H: [string, ServiceType, string, number, number, string][] = [
        ['SVC-L3-1807', 'L3VPN', 'Enterprise Corp', 1000, 36, 'xe-0/0/3'], ['SVC-L2-1230', 'L2VPN', 'Telecom Provider', 500, 58, 'xe-0/0/1'], ['SVC-LL-1551', 'Leased Line', 'Finance Group', 200, 80, 'xe-0/0/3'],
        ['SVC-L3-1873', 'L3VPN', 'Media Corporation', 1000, 40, 'xe-0/0/2'], ['SVC-IR-1295', 'IRV', 'Logistics Partners', 2000, 62, 'xe-0/0/3'], ['SVC-L3-1617', 'L3VPN', 'Retail Chain', 500, 84, 'xe-0/0/3'],
        ['SVC-L2-1938', 'L2VPN', 'Education Institute', 1000, 45, 'xe-0/0/4'], ['SVC-L3-1361', 'L3VPN', 'Health Network', 10000, 67, 'xe-0/0/1'], ['SVC-LL-1402', 'Leased Line', 'Cooperative Bank', 200, 52, 'xe-0/0/3'],
        ['SVC-LL-1418', 'Leased Line', 'Auto Components Ltd', 100, 33, 'xe-0/0/5'], ['SVC-LL-1446', 'Leased Line', 'Payments Gateway', 500, 71, 'xe-0/0/2'], ['SVC-L2-1477', 'L2VPN', 'Stock Broking House', 1000, 49, 'xe-0/0/3'],
        ['SVC-L2-1490', 'L2VPN', 'Pharma Manufacturing', 500, 38, 'xe-0/0/4'], ['SVC-OT-1503', 'Other', 'Insurance Services', 200, 27, 'xe-0/0/5'], ['SVC-OT-1519', 'Other', 'Retail Chain', 100, 22, 'xe-0/0/1']
      ];
      H.forEach(([id, t, c, bw, u, port]) => makeSvc(pe, t, byName(c), bw, u, lk(port), rr, id));
      services.find(s => s.id === 'SVC-L3-1873')!.status = 'Disabled';
      continue;
    }
    const n = intBetween(rr, 10, 15);
    for (let i = 0; i < n; i++) {
      const t = pick(rr, TYPES);
      const cust = customers[Math.floor(rr() * customers.length)];
      makeSvc(pe, t, cust, pick(rr, BW), r1(between(rr, 18, 88)), bhLinks.length ? bhLinks[i % bhLinks.length] : undefined, rr);
    }
  }
  /* service status follows the infrastructure */
  const linkById = new Map(links.map(l => [l.id, l]));
  for (const s of services) {
    if (s.status === 'Disabled') continue;
    const ls = s.linkIds.map(id => linkById.get(id)!);
    if (ls.some(l => l.state === 'down')) s.status = 'Degraded';
    else if (s.utilPct >= 90 || ls.some(l => l.utilPct >= 95)) s.status = 'Degraded';
  }
  /* the flapping hero span degrades everything riding it */
  { const x3 = links.find(l => l.protocol === 'LLDP' && ((l.aNe === HERO && l.aIf === 'xe-0/0/3') || (l.zNe === HERO && l.zIf === 'xe-0/0/3'))); if (x3) services.filter(s => s.linkIds.includes(x3.id) && s.status === 'Active').forEach(s => { s.status = 'Degraded'; }); }
  for (const c of customers) c.revenueMonthly = services.filter(s => s.customerId === c.id).reduce((a, s) => a + s.revenueMonthly, 0);

  /* -------- NE telemetry */
  for (const n of nes) {
    const rr = mulberry32(seedOf(n.id) ^ 0x7e);
    if (n.discovery === 'not-discovered') { n.health = 'unknown'; n.healthScore = 0; continue; }
    n.cpu = intBetween(rr, 12, 58); n.mem = intBetween(rr, 30, 72); n.tempC = intBetween(rr, 33, 47);
    n.uptimeMin = intBetween(rr, 3 * 1440, 220 * 1440); n.lastReboot = NOW - n.uptimeMin * MIN; n.lastSeen = NOW - intBetween(rr, 1, 9) * MIN; n.collector = `COL-${n.dcId}-${(seedOf(n.id) % 2) + 1}`;
    n.icmp = { lossPct: r2(between(rr, 0, 0.12)), latencyMs: r2(between(rr, 0.4, 1.6)), jitterMs: r2(between(rr, 0.1, 0.6)), availability: 99.99, state: 'healthy', hourly: hours(rr, 0.995) };
    n.ntp = { offsetMs: r2(between(rr, 0.05, 0.9)), delayMs: r2(between(rr, 0.4, 1.4)), jitterMs: r2(between(rr, 0.2, 1.6)), stratum: intBetween(rr, 2, 3), state: 'Synchronised', primary: '10.16.16.10', secondary: '10.16.16.11', lastSync: NOW - intBetween(rr, 1, 30) * MIN, hourly: hours(rr, 0.99) };
    n.radius = { successPct: r1(between(rr, 99.2, 100)), failures24h: intBetween(rr, 0, 3), primary: 'Reachable', secondary: 'Reachable', lastAuth: NOW - intBetween(rr, 5, 120) * MIN, state: 'healthy', pri: '10.25.25.5', sec: '10.25.25.6' };
    n.modules = n.role === 'Router' && n.layer !== 'access'
      ? [{ slot: 'RE0', name: 'Routing Engine', serial: `${n.serial}-RE0`, state: 'OK', tempC: n.tempC }, { slot: 'FPC0', name: n.model === 'MX204' ? 'MPC (fixed)' : 'MPC7E-MRATE', serial: `${n.serial}-F0`, state: 'OK', tempC: n.tempC + 4 },
        { slot: 'PEM0', name: 'Power supply AC', serial: `${n.serial}-P0`, state: 'OK', tempC: n.tempC - 6 }, { slot: 'PEM1', name: 'Power supply AC', serial: `${n.serial}-P1`, state: 'OK', tempC: n.tempC - 5 }, { slot: 'FAN0', name: 'Fan tray', serial: `${n.serial}-FT`, state: 'OK', tempC: n.tempC - 3 }]
      : [{ slot: 'PSU1', name: 'Power supply', serial: `${n.serial}-P1`, state: 'OK', tempC: n.tempC - 6 }, { slot: 'PSU2', name: 'Power supply', serial: `${n.serial}-P2`, state: chance(rr, 0.006) ? 'Fault' : 'OK', tempC: n.tempC - 6 }, { slot: 'FAN', name: 'Fan module', serial: `${n.serial}-FN`, state: 'OK', tempC: n.tempC - 3 }];
    /* a few access devices are unreachable */
    if (n.layer === 'access' && chance(rr, 0.006)) { n.icmp.lossPct = 100; n.icmp.availability = r2(between(rr, 62, 88)); n.icmp.state = 'critical'; n.icmp.hourly = n.icmp.hourly.map((h, i) => (i > 18 ? false : h)); }
  }
  const hero = neById.get(HERO)!;
  Object.assign(hero, { cpu: 82, mem: 68, tempC: 58, uptimeMin: 29 * 1440 + 9 * 60, lastReboot: NOW - (29 * 1440 + 9 * 60) * MIN, serial: 'JU0011000', ip: '172.31.40.20', mac: 'A4:5E:60:16:8F:48', os: '21.4R3-S5.5', model: 'MX204', vendor: 'JUNIPER' });
  hero.icmp = { lossPct: 0.46, latencyMs: 0.98, jitterMs: 0.73, availability: 99.75, state: 'degraded', hourly: Array.from({ length: 24 }, (_, i) => i !== 16) };
  hero.ntp = { ...hero.ntp, offsetMs: 0.43, delayMs: 0.857, jitterMs: 1.375, stratum: 3, lastSync: NOW - 28 * MIN, hourly: Array.from({ length: 24 }, (_, i) => i !== 4) };
  hero.radius = { ...hero.radius, successPct: 99.8, failures24h: 2, lastAuth: NOW - 88 * MIN };
  hero.modules = hero.modules.map(m => ({ ...m, serial: m.serial.replace(/^[A-Z]{2}\d+/, 'JU0011000') }));
  hero.modules[1].tempC = 58;

  /* -------- datacenter records */
  for (const row of DCS) {
    const [id, city, address, circleId, status, , , , lat, lng, category, tier] = row;
    const rr = mulberry32(seedOf(id) ^ 0xdc);
    const c = circles.find(x => x.id === circleId)!;
    const drafts = draftsByDc.get(id)!;
    const { racks, floors } = placeInRacks(id, drafts, rr);
    const dcNes = drafts.map(d => d.ne);
    for (const rk of racks) {
      const inRack = dcNes.filter(n => n.rackId === rk.id);
      const ifs = inRack.flatMap(n => ifaces.get(n.id)!);
      rk.ports = ifs.length; rk.portsUsed = ifs.filter(i => i.state !== 'admin-down').length;
    }
    const itKw = r1(racks.reduce((a, rk) => a + rk.drawKw, 0));
    const pue = id === 'MH-DC-001' ? 1.52 : r2(between(rr, 1.38, 1.68));
    const totalKw = r1(itKw * pue);
    const capacityKw = Math.ceil((totalKw / between(rr, 0.42, 0.66)) / 10) * 10;
    const acKw = r1(totalKw * 0.7), dcKw = r1(totalKw - acKw);
    const load24h = Array.from({ length: 24 }, (_, h) => r1(totalKw * (0.84 + 0.1 * Math.sin(((h - 6) / 24) * Math.PI * 2 - Math.PI / 2) * -1 + between(rr, -0.02, 0.02))));
    { const k = totalKw / load24h[23]; for (let h = 0; h < 24; h++) load24h[h] = r1(load24h[h] * k); }
    const peakKw = r1(Math.max(...load24h) * 1.06);
    const coolKw = r1(itKw * (pue - 1) * 0.78);
    const upsN = capacityKw > 300 ? 4 : 2;
    const ups: UpsUnit[] = Array.from({ length: upsN }, (_, i) => ({ id: `${id}-UPS-${i + 1}`, name: `UPS-${i + 1}`, capacityKw: Math.round(capacityKw / (upsN - 1) / 10) * 10, loadPct: intBetween(rr, 34, 64), redundancy: 'N+1', batteryMin: intBetween(rr, 12, 28), state: 'Online' }));
    /* thermal: capacity vs IT heat to remove (coolKw above is the plant's electrical draw) */
    const heatKw = r1(itKw * 1.03);
    const coolCap = Math.ceil(heatKw * between(rr, 1.6, 2.1) / 10) * 10;
    const zones = floors.flatMap(f => f.rooms.map(rm => `${f.name} · ${rm}`));
    const units: CoolingUnit[] = Array.from({ length: Math.max(3, zones.length * 2) }, (_, i) => ({ id: `${id}-CRAH-${11 + i}`, name: `CRAH-${11 + i}`, type: i % 5 === 4 ? 'CRAC' : 'CRAH', zone: zones[i % zones.length], capacityKw: Math.round(coolCap / Math.max(3, zones.length * 2)), loadPct: intBetween(rr, 38, 72), supplyC: intBetween(rr, 17, 20), returnC: intBetween(rr, 28, 32), status: 'Operational' }));
    const sensors: EnvSensor[] = zones.map((z, i) => ({ id: `${id}-ENV-${i + 1}`, zone: z, tempC: r1(between(rr, 22.5, 25.8)), humidity: intBetween(rr, 42, 55), smoke: false, leak: false }));
    racks.forEach(rk => { const s = sensors.find(x => x.zone === `${rk.floor} · ${rk.room}`); rk.tempC = r1((s?.tempC ?? 24) + between(rr, 0, 1.2)); });
    const portCls = new Map<string, { total: number; used: number }>();
    for (const n of dcNes) for (const it of ifaces.get(n.id)!) {
      const k = it.type === '1G copper' ? '1G copper' : it.type === '10G SFP+' ? '10G SFP+' : '100G QSFP28';
      const e = portCls.get(k) ?? { total: 0, used: 0 }; e.total++; if (it.state !== 'admin-down') e.used++; portCls.set(k, e);
    }
    const cores = 24 + (dcNes.length > 120 ? 24 : 0);
    const odfUsed = Math.round(cores * between(rr, 0.45, 0.62));
    portCls.set('Optical (ODF)', { total: cores * 4, used: odfUsed * 4 - intBetween(rr, 0, 6) });
    /* cabling ledger: the first cores of the incoming cable land on PE / ACC ports */
    const pe1 = dcNes.find(n => n.id === `${id}-PE-T4-01`)!, acc1 = dcNes.find(n => n.id === `${id}-ACC-01`) ?? dcNes[dcNes.length - 1];
    const peIf = ifaces.get(pe1.id)!, accIf = ifaces.get(acc1.id)!;
    const ledger: CableCore[] = Array.from({ length: cores }, (_, i) => ({ port: i + 1, state: 'free' as const }));
    const patch = (port: number, ne: NetworkElement, inIf: string, outPort: number, outIf: string, strand: string) => { ledger[port - 1] = { port, state: 'connected', neId: ne.id, inIf, outPort, outIf, strand }; };
    const peGe = peIf.filter(i => i.type === '1G copper');
    patch(2, acc1, accIf[0].name, 2, accIf[4]?.name ?? accIf[1].name, 'Green');
    patch(4, pe1, peIf.find(i => i.name.endsWith('/2'))?.name ?? peIf[2].name, 1, peGe[peGe.length - 2]?.name ?? peIf[0].name, 'Blue');
    patch(6, acc1, accIf[3].name, 6, accIf[5]?.name ?? accIf[2].name, 'Brown');
    patch(7, pe1, peIf.find(i => i.name.endsWith('/3'))?.name ?? peIf[3].name, 7, peGe[peGe.length - 1]?.name ?? peIf[1].name, 'Orange');
    ledger[8] = { port: 9, state: 'direct', outPort: 9, strand: 'Red' };
    for (let i = 10; i < Math.min(cores, 10 + Math.round(cores * 0.25)); i++) if (i !== 8) ledger[i] = { port: i + 1, state: 'connected', neId: dcNes[(i * 5) % dcNes.length].id, inIf: ifaces.get(dcNes[(i * 5) % dcNes.length].id)![0].name, outPort: i + 1, outIf: ifaces.get(dcNes[(i * 5) % dcNes.length].id)![1]?.name ?? '', strand: STRANDS[i % STRANDS.length] };

    const nScale = dcNes.length / 179;
    const capexApproved = id === 'MH-DC-001' ? 9.56e7 : Math.round(9.56e7 * nScale * between(rr, 0.8, 1.2) / 1e5) * 1e5;
    const capexCommitted = id === 'MH-DC-001' ? 8.77e7 : status === 'planned' ? Math.round(capexApproved * 0.22) : Math.round(capexApproved * between(rr, 0.86, 0.99) / 1e5) * 1e5;
    const opexMonthly = id === 'MH-DC-001' ? 98.88e5 : status === 'planned' ? 0 : Math.round(98.88e5 * nScale * between(rr, 0.8, 1.15) / 1e3) * 1e3;
    const collectors: Datacenter['collectors'] = status === 'planned' ? [] : [{ id: `COL-${id}-1`, name: `Collector ${city} A`, state: 'up', lastSeen: NOW - 2 * MIN }, { id: `COL-${id}-2`, name: `Collector ${city} B`, state: id === 'MH-DC-001' ? 'stale' : 'up', lastSeen: id === 'MH-DC-001' ? NOW - 3 * HOUR - 12 * MIN : NOW - 3 * MIN }];
    const dc: Datacenter = {
      id, locationId: id, name: id, status, category, siteType: 'Datacenter', regionId: c.regionId, circleId, zone: REGIONS.find(x => x.id === c.regionId)!.name, city, state: c.state, address, lat, lng, tier,
      commissionedOn: status === 'on-air' ? NOW - intBetween(rr, 200, 1400) * DAY : undefined, collectors,
      capex: { approved: capexApproved, committed: capexCommitted, spent: Math.round(capexCommitted * between(rr, 0.7, 0.92)), lines: [
        { item: 'Network equipment', approved: Math.round(capexApproved * 0.52), committed: Math.round(capexCommitted * 0.55) },
        { item: 'Power & UPS', approved: Math.round(capexApproved * 0.18), committed: Math.round(capexCommitted * 0.17) },
        { item: 'Cooling', approved: Math.round(capexApproved * 0.12), committed: Math.round(capexCommitted * 0.11) },
        { item: 'Civil & fit-out', approved: Math.round(capexApproved * 0.1), committed: Math.round(capexCommitted * 0.1) },
        { item: 'Passive & cabling', approved: capexApproved - Math.round(capexApproved * 0.52) - Math.round(capexApproved * 0.18) - Math.round(capexApproved * 0.12) - Math.round(capexApproved * 0.1), committed: capexCommitted - Math.round(capexCommitted * 0.55) - Math.round(capexCommitted * 0.17) - Math.round(capexCommitted * 0.11) - Math.round(capexCommitted * 0.1) }
      ] },
      opex: { monthly: opexMonthly, drivers: [
        { item: 'Electricity', monthly: Math.round(opexMonthly * 0.41) }, { item: 'Facility lease', monthly: Math.round(opexMonthly * 0.24) }, { item: 'AMC & support', monthly: Math.round(opexMonthly * 0.17) },
        { item: 'Backhaul bandwidth', monthly: Math.round(opexMonthly * 0.12) }, { item: 'Field operations', monthly: opexMonthly - Math.round(opexMonthly * 0.41) - Math.round(opexMonthly * 0.24) - Math.round(opexMonthly * 0.17) - Math.round(opexMonthly * 0.12) }
      ] },
      power: { capacityKw, acKw, dcKw, peakKw, pue, load24h, split: [{ label: 'Network equipment', kw: itKw }, { label: 'Cooling', kw: coolKw }, { label: 'Lighting & other', kw: r1(Math.max(0, totalKw - itKw - coolKw)) }],
        feeds: [{ id: 'AC-1', type: 'AC', source: 'Utility feed A', rating: `${Math.round(capacityKw * 0.7 * 1000 / 415 / 1.732)} A · 415 V`, loadKw: acKw, capacityKw: Math.round(capacityKw * 0.7), status: 'Normal' },
          ...(tier !== 'Tier II' ? [{ id: 'AC-2', type: 'AC' as const, source: 'Utility feed B', rating: `${Math.round(capacityKw * 0.7 * 1000 / 415 / 1.732)} A · 415 V`, loadKw: 0, capacityKw: Math.round(capacityKw * 0.7), status: 'Normal' as const }] : []),
          { id: 'DC-1', type: 'DC', source: 'Rectifier RECT-01', rating: `48 V · ${Math.round(capacityKw * 0.3 * 1000 / 48 / 10) * 10} A`, loadKw: dcKw, capacityKw: Math.round(capacityKw * 0.3), status: 'Normal' }],
        dg: { kva: Math.ceil(capacityKw * 1.25 / 25) * 25, runtimeH: intBetween(rr, 10, 16), fuelPct: intBetween(rr, 58, 92), lastTest: NOW - intBetween(rr, 6, 40) * DAY, result: 'Pass' },
        battery: { volts: 48, ah: Math.ceil(capacityKw * 6 / 100) * 100, runtimeH: r1(between(rr, 2.4, 4.2)), lastTest: NOW - intBetween(rr, 20, 120) * DAY }, ups,
        history12m: Array.from({ length: 12 }, (_, i) => r1(totalKw * (0.82 + i * 0.016 + between(rr, -0.01, 0.01)))) },
      cooling: { capacityKw: coolCap, loadKw: heatKw, redundancy: 'N+1', units, sensors },
      floors, racks, ports: [...portCls.entries()].map(([cls, v]) => ({ cls, ...v })), cabling: { cable: `G.652D Single Mode · ${cores} Core`, cores, ledger },
      compute: { cpuCores: Math.round(dcNes.length * 96), cpuUsed: Math.round(dcNes.length * 96 * between(rr, 0.5, 0.72)), memGb: dcNes.length * 512, memUsed: Math.round(dcNes.length * 512 * between(rr, 0.45, 0.66)), storageTb: dcNes.length * 18, storageUsed: Math.round(dcNes.length * 18 * between(rr, 0.42, 0.7)) },
      risks: [], readiness: []
    };
    if (status === 'on-air') dc.power.history12m[11] = totalKw;
    datacenters.push(dc);
    const loc = locations.find(l => l.id === id)!;
    loc.passive.racks = racks.length;
    loc.roles = dcNes.reduce<Record<string, number>>((a, n) => { a[n.role] = (a[n.role] ?? 0) + 1; return a; }, {});
  }

  /* hand-set facility conditions that incidents reference */
  const dc3 = datacenters.find(d => d.id === 'MH-DC-003')!; dc3.cooling.units[0].status = 'Failed'; dc3.cooling.units[1].status = 'Maintenance'; dc3.cooling.sensors[0].tempC = 29.4; dc3.racks.filter(rk => rk.room === dc3.cooling.units[0].zone.split(' · ')[1]).forEach(rk => { rk.tempC = r1(rk.tempC + 5.2); });
  const dc9 = datacenters.find(d => d.id === 'DL-DC-009')!; dc9.power.ups[1].state = 'On battery'; dc9.power.ups[1].loadPct = 71; dc9.power.feeds.filter(f => f.type === 'AC').forEach(f => { f.status = 'Alarm'; f.loadKw = 0; });
  const dc20 = datacenters.find(d => d.id === 'KA-DC-020')!; dc20.racks.slice(2, 5).forEach((rk, i) => { rk.drawKw = r1(rk.budgetKw * (0.91 + i * 0.03)); });
  const dc1 = datacenters.find(d => d.id === 'MH-DC-001')!;
  dc1.readiness = [
    { step: 'Site created & planned inventory loaded', done: true }, { step: 'Collectors assigned', done: true, note: 'Collector Pune B stale since 10:08' },
    { step: 'Assets discovered', done: false, note: '103 of 179 NE discovered (58%)' }, { step: 'Inventory reconciled', done: false, note: '21 drifted records open' },
    { step: 'Power, racks & ports validated', done: true }, { step: 'Connectivity mapped', done: true, note: 'Cable ledger 6 of 24 cores patched' },
    { step: 'Services commissioned', done: false, note: 'Enterprise Corp L3VPN pending acceptance' }, { step: 'Move to on-air', done: false }
  ];
  const dc24 = datacenters.find(d => d.id === 'KL-DC-024')!;
  dc24.readiness = [{ step: 'Site created & planned inventory loaded', done: true }, { step: 'Collectors assigned', done: true }, { step: 'Assets discovered', done: false, note: '40 of 72 NE discovered' }, { step: 'Inventory reconciled', done: false },
    { step: 'Power, racks & ports validated', done: false, note: 'DG load-bank test scheduled 06-Oct' }, { step: 'Connectivity mapped', done: false }, { step: 'Services commissioned', done: false }, { step: 'Move to on-air', done: false }];
  const dc13 = datacenters.find(d => d.id === 'GJ-DC-013')!;
  dc13.readiness = [{ step: 'Site created & planned inventory loaded', done: true }, { step: 'Collectors assigned', done: false, note: 'Awaiting rack & power handover' }, { step: 'Assets discovered', done: false }, { step: 'Inventory reconciled', done: false },
    { step: 'Power, racks & ports validated', done: false }, { step: 'Connectivity mapped', done: false }, { step: 'Services commissioned', done: false }, { step: 'Move to on-air', done: false }];

  const db: Db = { now: NOW, regions, circles, locations, datacenters, nes, neById, ifaces, links, services, customers, alerts: [], incidents: [], changes: [], recon: [], audit: [], plans: [], seq: { alm: 1000, inc: 0, chg: 2000, rec: 0, aud: 0, plan: 0 } };

  buildAlerts(db);
  buildDownstream(db);
  buildChanges(db);
  buildIncidents(db);
  buildRecon(db);
  buildPlans(db);
  finaliseHealth(db);
  buildRisks(db);
  return db;
}

/* ---------------------------------------------------------------- alerts */

type NewAlert = Omit<Alert, 'id' | 'code' | 'scope' | 'category'> & { code?: string; scope?: Alert['scope']; category?: Alert['category'] };
export function addAlert(db: Db, a: NewAlert): Alert {
  const code = a.code ?? `ALM-${++db.seq.alm}`;
  const al: Alert = { ...a, id: code, code, scope: a.scope ?? scopeOf(db, a), category: a.category ?? categoryOf(a) };
  db.alerts.push(al);
  return al;
}

/* Category: what kind of problem it is, for the operator. */
function categoryOf(a: NewAlert): Alert['category'] {
  if (!a.neId && (a.source === 'Power' || a.source === 'Cooling' || a.source === 'Environment')) return 'Facility';
  if (a.source === 'Power' || a.source === 'Environment' || a.source === 'Discovery') return a.title === 'Collector Stale' ? 'Network' : 'Device';
  if (a.source === 'CPU' || a.type === 'Capacity' || a.title === 'Link Degradation') return 'Performance';
  return 'Network';
}
/* Scope relative to the alert's own datacenter: a link that leaves the site is
   edge, a monitoring collector is a dependency, everything else is the site. */
function scopeOf(db: Db, a: NewAlert): Alert['scope'] {
  if (a.title === 'Collector Stale') return 'dependency';
  const l = a.linkId ? db.links.find(x => x.id === a.linkId) : a.neId && a.ifName ? db.links.find(x => x.protocol === 'LLDP' && ((x.aNe === a.neId && x.aIf === a.ifName) || (x.zNe === a.neId && x.zIf === a.ifName))) : undefined;
  if (l && db.neById.get(l.aNe)!.dcId !== db.neById.get(l.zNe)!.dcId) return 'edge';
  return 'site';
}

/* Remote PoPs and access sites hang off each datacenter's aggregation routers.
   They are not datacenter assets: their own faults are 'downstream' and never
   count against the site; when a site link fails, their alarms are symptoms. */
function buildDownstream(db: Db) {
  const r = mulberry32(5150);
  const FAULTS: [string, string, Alert['severity'], Alert['source'], string, Alert['category']][] = [
    ['Fan Tray Failure', 'Fan tray 2 reports failure; temperature rising', 'major', 'Environment', 'Hardware', 'Device'],
    ['Mains Power Failure', 'PoP running on battery after grid loss', 'critical', 'Power', 'Power', 'Facility'],
    ['Device Unreachable', 'ICMP 100% loss; last-mile fibre cut reported', 'critical', 'Interface', 'Reachability', 'Network'],
    ['High CPU Utilization', 'CPU above 90% for 25 minutes', 'minor', 'CPU', 'CPU', 'Performance'],
    ['Link Down', 'Access ring segment lost carrier', 'major', 'Link', 'Link', 'Network']
  ];
  for (const dc of db.datacenters.filter(d => d.status !== 'planned')) {
    const spine = db.nes.filter(n => n.dcId === dc.id && n.layer === 'spine' && n.discovery !== 'not-discovered');
    if (!spine.length) continue;
    const pops = db.locations.filter(l => l.kind === 'pop' && l.circleId === dc.circleId && l.status === 'on-air').slice(0, 2);
    const sites = db.locations.filter(l => l.kind === 'site' && l.circleId === dc.circleId && l.status === 'on-air').slice(0, 3);
    /* independent downstream faults — the DC must NOT turn red for these */
    pops.forEach((p, k) => {
      if (!chance(r, 0.55)) return;
      const f = FAULTS[intBetween(r, 0, FAULTS.length - 1)];
      addAlert(db, { dcId: dc.id, node: `${p.id}-AGG-01`, nodeLocation: `${p.city} PoP`, hops: 1, severity: f[2], title: f[0], description: f[1], source: f[3], type: f[4], category: f[5], scope: 'downstream', start: db.now - intBetween(r, 20, 900) * MIN, state: 'active' });
      if (k === 0 && sites[0] && chance(r, 0.6)) {
        const g = FAULTS[intBetween(r, 0, FAULTS.length - 1)];
        addAlert(db, { dcId: dc.id, node: `${sites[0].id}-CSR-01`, nodeLocation: `${sites[0].city} site`, hops: 2, severity: g[2], title: g[0], description: g[1], source: g[3], type: g[4], category: g[5], scope: 'downstream', start: db.now - intBetween(r, 20, 900) * MIN, state: 'active' });
      }
    });
    /* symptoms: when a link inside / at the edge of the site is down, the PoP and
       sites behind it alarm too — rolled up under the site alarm, not counted */
    const cause = db.alerts.find(a => a.dcId === dc.id && a.title === 'Link Down' && a.scope !== 'downstream');
    if (cause) {
      const victims = [...pops.slice(0, 1).map(p => ({ node: `${p.id}-AGG-01`, loc: `${p.city} PoP`, hops: 1 })), ...sites.map(st => ({ node: `${st.id}-CSR-01`, loc: `${st.city} site`, hops: 2 }))];
      victims.forEach((v, k) => addAlert(db, { dcId: dc.id, node: v.node, nodeLocation: v.loc, hops: v.hops, severity: 'critical', title: 'Device Unreachable', description: `Lost reachability ${k + 1} s after ${cause.code} on ${cause.neId}`, source: 'Interface', type: 'Reachability', category: 'Network', scope: 'downstream', symptomOf: cause.code, start: cause.start + (k + 1) * 1000, state: 'active' }));
    }
  }
  /* an edge link to a PoP (leaves the site) IS a datacenter issue */
  const agg = db.neById.get('MH-DC-001-AGG-R05');
  const pop = db.locations.find(l => l.kind === 'pop' && l.circleId === 'MH' && l.status === 'on-air');
  if (agg && pop) addAlert(db, { neId: agg.id, dcId: 'MH-DC-001', ifName: 'xe-0/0/15', node: `${pop.id}-AGG-01`, nodeLocation: `${pop.city} PoP`, severity: 'major', title: 'Link Down', description: `Uplink to ${pop.id}-AGG-01 lost carrier; PoP still reachable over its second uplink`, source: 'Link', type: 'Link', category: 'Network', scope: 'edge', start: db.now - 95 * MIN, state: 'active' });
  /* a shared service the site depends on */
  addAlert(db, { dcId: 'MH-DC-001', node: 'AAA-SRV-02 (10.25.25.6)', nodeLocation: 'Shared services', severity: 'minor', title: 'Secondary RADIUS Server Unreachable', description: 'Device logins fall back to primary only; no redundancy for AAA', source: 'Security', type: 'AAA', category: 'Network', scope: 'dependency', start: db.now - 3 * HOUR, state: 'active' });
}

function buildAlerts(db: Db) {
  const HERO = 'MH-DC-001-PE-T4-01';
  const T = (d: number, h: number, m: number, s = 58) => new Date(2026, 8 + (d === 30 ? 0 : 1), d, h, m, s).getTime();
  const fixed: Parameters<typeof addAlert>[1][] = [
    { code: 'ALM-1930', neId: HERO, dcId: 'MH-DC-001', ifName: 'xe-0/0/3', severity: 'critical', title: 'Interface Flapping Detected', description: 'Interface state changed 8 times in 20 minutes', source: 'Interface', type: 'Interface', start: T(1, 12, 37), state: 'active' },
    { code: 'ALM-1831', neId: HERO, dcId: 'MH-DC-001', severity: 'major', title: 'High CPU Utilization', description: 'CPU sustained above 77% for 45 minutes', source: 'CPU', type: 'CPU', start: T(1, 12, 22), state: 'active' },
    { code: 'ALM-1774', neId: HERO, dcId: 'MH-DC-001', ifName: 'xe-0/0/3', severity: 'major', title: 'Link Degradation', description: 'Latency increased to 12.4 ms, packet loss detected', source: 'Link', type: 'Link', start: T(1, 10, 22), state: 'active' },
    { code: 'ALM-1702', neId: HERO, dcId: 'MH-DC-001', ifName: 'xe-0/0/3', severity: 'minor', title: 'Optical Rx Power Low', description: 'Rx power −11.8 dBm, below −10.0 dBm warning threshold', source: 'Interface', type: 'Optics', start: T(1, 9, 48), state: 'active' },
    { code: 'ALM-1655', neId: HERO, dcId: 'MH-DC-001', severity: 'minor', title: 'BGP Peer Idle', description: 'Two eBGP sessions in Idle after hold-timer expiry', source: 'Protocol', type: 'BGP', start: T(1, 8, 15), state: 'active' },
    { code: 'ALM-1610', neId: HERO, dcId: 'MH-DC-001', severity: 'minor', title: 'Temperature Warning', description: 'Temperature elevated to 58°C in slot 3', source: 'Environment', type: 'Thermal', start: T(30, 11, 2), state: 'active' },
    { code: 'ALM-1598', neId: HERO, dcId: 'MH-DC-001', severity: 'minor', title: 'OSPF Neighbour in INIT', description: 'Adjacency stuck in INIT — hello received, no 2-way', source: 'Protocol', type: 'OSPF', start: T(30, 22, 41), state: 'active' }
  ];
  fixed.forEach(a => addAlert(db, a));
  const now = db.now;
  for (const l of db.links) {
    if (l.aNe === HERO || l.zNe === HERO) continue;
    const rr = mulberry32(seedOf(l.id) ^ 0xa1);
    if (l.protocol === 'LLDP' && l.state === 'down') addAlert(db, { neId: l.aNe, dcId: l.dcId, ifName: l.aIf, linkId: l.id, severity: 'major', title: 'Link Down', description: `Physical link to ${l.zNe} ${l.zIf} lost carrier`, source: 'Link', type: 'Link', start: now - intBetween(rr, 20, 900) * MIN, state: chance(rr, 0.3) ? 'acknowledged' : 'active' });
    else if (l.protocol === 'BGP' && l.state === 'idle') addAlert(db, { neId: l.aNe, dcId: l.dcId, linkId: l.id, severity: 'minor', title: 'BGP Peer Idle', description: `Session to ${l.zNe} in Idle`, source: 'Protocol', type: 'BGP', start: now - intBetween(rr, 30, 1800) * MIN, state: 'active' });
    else if (l.protocol === 'OSPF' && (l.state === 'down' || l.state === 'init')) addAlert(db, { neId: l.aNe, dcId: l.dcId, linkId: l.id, severity: 'minor', title: l.state === 'init' ? 'OSPF Neighbour in INIT' : 'OSPF Neighbour Down', description: `Adjacency with ${l.zNe} on ${l.aIf}`, source: 'Protocol', type: 'OSPF', start: now - intBetween(rr, 30, 1800) * MIN, state: 'active' });
    else if (l.protocol === 'LLDP' && l.utilPct >= 82 && l.role !== 'Access') addAlert(db, { neId: l.aNe, dcId: l.dcId, ifName: l.aIf, linkId: l.id, severity: l.utilPct >= 90 ? 'major' : 'warning', title: 'Link Utilisation High', description: `${Math.round(l.utilPct)}% of ${l.capacityMbps / 1000} Gbps; growing ${l.growthPct}%/mo`, source: 'Link', type: 'Capacity', start: now - intBetween(rr, 60, 4000) * MIN, state: 'active' });
  }
  for (const n of db.nes) {
    if (n.id === HERO || n.discovery === 'not-discovered') continue;
    const rr = mulberry32(seedOf(n.id) ^ 0xa2);
    if (n.icmp.state === 'critical') addAlert(db, { neId: n.id, dcId: n.dcId, severity: 'critical', title: 'Device Unreachable', description: 'ICMP 100% loss for 5 consecutive probes; SNMP timeouts', source: 'Interface', type: 'Reachability', start: now - intBetween(rr, 15, 240) * MIN, state: 'active' });
    if (chance(rr, 0.012)) addAlert(db, { neId: n.id, dcId: n.dcId, severity: 'minor', title: 'High Memory Utilization', description: `Memory at ${n.mem + 18}% for 30 minutes`, source: 'CPU', type: 'Memory', start: now - intBetween(rr, 20, 2000) * MIN, state: chance(rr, 0.4) ? 'acknowledged' : 'active' });
    if (chance(rr, 0.008)) addAlert(db, { neId: n.id, dcId: n.dcId, severity: 'warning', title: 'NTP Offset Drift', description: 'Clock offset above 50 ms against primary', source: 'Protocol', type: 'NTP', start: now - intBetween(rr, 20, 2000) * MIN, state: 'active' });
    if (n.modules.some(m => m.state === 'Fault')) addAlert(db, { neId: n.id, dcId: n.dcId, severity: 'major', title: 'Power Supply Fault', description: 'PSU2 reports output failure; running on single PSU', source: 'Power', type: 'Hardware', start: now - intBetween(rr, 60, 3000) * MIN, state: 'active' });
    if (n.discovery === 'drifted' && chance(rr, 0.35)) addAlert(db, { neId: n.id, dcId: n.dcId, severity: 'warning', title: 'Configuration Drift', description: `${n.drift![0].attr} differs from inventory record`, source: 'Discovery', type: 'Drift', start: now - intBetween(rr, 600, 9000) * MIN, state: 'active' });
  }
  for (const dc of db.datacenters) {
    for (const u of dc.cooling.units) if (u.status === 'Failed') addAlert(db, { dcId: dc.id, severity: 'critical', title: `${u.name} Cooling Unit Failed`, description: `Compressor trip; ${u.zone} running on remaining units`, source: 'Cooling', type: 'Cooling', start: now - 3 * HOUR - 40 * MIN, state: 'active' });
    for (const s of dc.cooling.sensors) if (s.tempC > 27) addAlert(db, { dcId: dc.id, severity: 'major', title: 'Zone Temperature High', description: `${s.zone} at ${s.tempC}°C (threshold 27°C)`, source: 'Environment', type: 'Thermal', start: now - 3 * HOUR, state: 'active' });
    for (const u of dc.power.ups) if (u.state === 'On battery') addAlert(db, { dcId: dc.id, severity: 'critical', title: `${u.name} On Battery`, description: `Utility feed A lost; ${u.batteryMin} min autonomy at ${u.loadPct}% load`, source: 'Power', type: 'UPS', start: now - 52 * MIN, state: 'active' });
    for (const rk of dc.racks) if (rk.drawKw / rk.budgetKw >= 0.9) addAlert(db, { dcId: dc.id, severity: 'major', title: 'Rack Over Power Budget', description: `${rk.name} drawing ${rk.drawKw} kW of ${rk.budgetKw} kW budget`, source: 'Power', type: 'Rack', start: now - 7 * HOUR, state: 'active' });
    for (const c of dc.collectors) if (c.state !== 'up') addAlert(db, { dcId: dc.id, severity: 'major', title: 'Collector Stale', description: `${c.name} last reported ${Math.round((now - c.lastSeen) / MIN)} min ago; discovery paused`, source: 'Discovery', type: 'Collector', start: c.lastSeen, state: 'active' });
  }
}

/* --------------------------------------------------------------- changes */

function buildChanges(db: Db) {
  const n = db.now;
  const C = (c: Omit<Change, 'id' | 'created'> & { created?: number }) => { db.changes.push({ ...c, id: `CHG-${++db.seq.chg}`, created: c.created ?? c.windowStart - 4 * DAY }); };
  C({ kind: 'Change', title: 'Re-patch ODF RACK-D core 7 to PE-T4-01 xe-0/0/3 (new backhaul span)', dcId: 'MH-DC-001', scope: ['MH-DC-001-PE-T4-01'], risk: 'Medium', status: 'Completed', windowStart: n - 15 * HOUR - 20 * MIN, windowEnd: n - 14 * HOUR - 20 * MIN, requester: 'Rahul Deshpande', approver: 'Priya Nair', rollback: 'Restore previous patch at ODF-2/P7' });
  C({ kind: 'Change', title: 'Junos upgrade 21.4R3-S5.5 → 22.2R3-S2 on MH-DC-001 PE pair', dcId: 'MH-DC-001', scope: ['MH-DC-001-PE-T4-01', 'MH-DC-001-PE-T4-02'], risk: 'High', status: 'Pending approval', windowStart: n + 2 * DAY + 10 * HOUR, windowEnd: n + 2 * DAY + 14 * HOUR, requester: 'Arjun Mehta', rollback: 'Boot from alternate partition (snapshot taken)' });
  C({ kind: 'Maintenance', title: 'DG load-bank test — 125 kVA set', dcId: 'MH-DC-001', scope: [], risk: 'Low', status: 'Approved', windowStart: n + 4 * DAY + 6 * HOUR, windowEnd: n + 4 * DAY + 8 * HOUR, requester: 'Anil Kulkarni', approver: 'Kavita Rao', rollback: 'Return to utility; abort test' });
  C({ kind: 'Maintenance', title: 'CRAH-11 compressor replacement', dcId: 'MH-DC-003', scope: [], risk: 'Medium', status: 'In progress', windowStart: n - 2 * HOUR, windowEnd: n + 4 * HOUR, requester: 'Anil Kulkarni', approver: 'Kavita Rao', rollback: 'Keep CRAH-12 in service; portable cooling on standby' });
  C({ kind: 'Change', title: 'Utility feed A switchover to feeder 2', dcId: 'DL-DC-009', scope: [], risk: 'High', status: 'Completed', windowStart: n - 26 * HOUR, windowEnd: n - 24 * HOUR, requester: 'Vikram Singh', approver: 'Kavita Rao', rollback: 'Revert ATS to feeder 1' });
  C({ kind: 'Maintenance', title: 'UPS battery string replacement — UPS-2', dcId: 'KA-DC-020', scope: [], risk: 'Medium', status: 'Approved', windowStart: n + 6 * DAY, windowEnd: n + 6 * DAY + 5 * HOUR, requester: 'Meera Iyer', approver: 'Kavita Rao', rollback: 'Keep UPS-2 in bypass on N+1' });
  C({ kind: 'Change', title: 'Add 100G backhaul KA-DC-020 ↔ TN-DC-022', dcId: 'KA-DC-020', scope: ['KA-DC-020-PE-T4-01', 'TN-DC-022-PE-T4-01'], risk: 'Medium', status: 'Pending approval', windowStart: n + 9 * DAY, windowEnd: n + 9 * DAY + 4 * HOUR, requester: 'Priya Nair', rollback: 'Shut new interfaces; traffic stays on existing span' });
  C({ kind: 'Change', title: 'Enable BFD on PE–AGG uplinks', dcId: 'UP-DC-005', scope: ['UP-DC-005-PE-T4-01', 'UP-DC-005-PE-T4-02'], risk: 'Low', status: 'Completed', windowStart: n - 5 * DAY, windowEnd: n - 5 * DAY + 2 * HOUR, requester: 'Sarah Chen', approver: 'Priya Nair', rollback: 'Remove BFD stanza' });
  C({ kind: 'Maintenance', title: 'Quarterly fire-suppression inspection', dcId: 'WB-DC-016', scope: [], risk: 'Low', status: 'Approved', windowStart: n + 3 * DAY, windowEnd: n + 3 * DAY + 3 * HOUR, requester: 'Sneha Patil', approver: 'Kavita Rao', rollback: 'n/a — inspection only' });
  C({ kind: 'Change', title: 'Migrate L2VPN services to EVPN on TOR pair 007/008', dcId: 'TN-DC-022', scope: ['TN-DC-022-TOR-007', 'TN-DC-022-TOR-008'], risk: 'High', status: 'Rolled back', windowStart: n - 3 * DAY, windowEnd: n - 3 * DAY + 3 * HOUR, requester: 'David Kim', approver: 'Priya Nair', rollback: 'Restore VPLS config from backup' });
  C({ kind: 'Change', title: 'RADIUS server certificate renewal', dcId: 'HR-DC-011', scope: [], risk: 'Low', status: 'Draft', windowStart: n + 12 * DAY, windowEnd: n + 12 * DAY + HOUR, requester: 'James Wilson', rollback: 'Re-import previous certificate' });
  C({ kind: 'Maintenance', title: 'ODF re-labelling & cable audit', dcId: 'KL-DC-024', scope: [], risk: 'Low', status: 'Approved', windowStart: n + 5 * DAY, windowEnd: n + 5 * DAY + 6 * HOUR, requester: 'Meera Iyer', approver: 'Kavita Rao', rollback: 'n/a' });
}

/* ----------------------------------------------------------- recon / plans */

function buildRecon(db: Db) {
  for (const n of db.nes) {
    if (n.discovery === 'verified') continue;
    const rr = mulberry32(seedOf(n.id) ^ 0x4ec);
    const kind = n.discovery === 'not-discovered' ? 'not-discovered' : n.duplicateSerialOf ? 'duplicate-serial' : 'drift';
    const ip = chance(rr, 0.12);
    db.recon.push({ id: `REC-${String(++db.seq.rec).padStart(4, '0')}`, dcId: n.dcId, neId: n.id, kind, status: ip ? 'In progress' : 'Open', assignee: ip ? pick(rr, PEOPLE) : undefined, created: db.now - intBetween(rr, 1, 30) * DAY });
  }
  const A = (at: number, actor: string, object: string, field: string, prev: string, next: string, source: string, note?: string) => db.audit.push({ id: `AUD-${++db.seq.aud}`, at, actor, object, field, prev, next, source, note });
  A(db.now - 2 * DAY, 'Discovery (COL-MH-DC-001-1)', 'MH-DC-001-CSR-014', 'OS version', '21.4R3-S5.5', '22.2R3-S2', 'SNMP sysDescr', 'Accepted observed value');
  A(db.now - 3 * DAY, 'Priya Nair', 'MH-DC-001-AGG-R03', 'Rack position', 'U18', 'U22', 'Field audit', 'Record updated after site walk');
  A(db.now - 5 * DAY, 'Discovery (COL-UP-DC-005-2)', 'UP-DC-005-TOR-021', 'Management IP', '10.40.3.44', '10.40.12.144', 'LLDP / ARP', 'Kept record — device re-addressed in error');
  A(db.now - 9 * DAY, 'Arjun Mehta', 'KA-DC-020-CSR-031', 'Lifecycle', 'Planned', 'Ready', 'Commissioning', 'Moved after acceptance test');
}

function buildPlans(db: Db) {
  const P = (p: Omit<CapacityPlan, 'id'>) => db.plans.push({ ...p, id: `CAP-${String(++db.seq.plan).padStart(3, '0')}` });
  P({ dcId: 'MH-DC-001', dimension: 'Bandwidth', title: 'Upgrade PE-T4-01 xe-0/0/3 backhaul to 100G', amount: 90, unit: 'Gbps', target: db.now + 45 * DAY, status: 'Submitted', capex: 38_00_000 });
  P({ dcId: 'KA-DC-020', dimension: 'Power', title: 'Add 2 × 200 kVA UPS modules, Hall A', amount: 320, unit: 'kW', target: db.now + 70 * DAY, status: 'Approved', capex: 1_45_00_000 });
  P({ dcId: 'DL-DC-009', dimension: 'Cooling', title: 'Add CRAH-19/20 for Hall B densification', amount: 180, unit: 'kW', target: db.now + 90 * DAY, status: 'Executing', capex: 92_00_000 });
  P({ dcId: 'MH-DC-003', dimension: 'Space', title: 'Open 8 racks in 1st-floor equipment room', amount: 336, unit: 'U', target: db.now + 60 * DAY, status: 'Submitted', capex: 41_00_000 });
  P({ dcId: 'TN-DC-022', dimension: 'Ports', title: 'Add 2 leaf switches (96 × 25G)', amount: 96, unit: 'ports', target: db.now + 35 * DAY, status: 'Approved', capex: 28_00_000 });
}

/* --------------------------------------------------------- health / risks */

export function finaliseHealth(db: Db) {
  const act = db.alerts.filter(a => a.state !== 'cleared' && a.neId);
  const byNe = new Map<string, Alert[]>();
  act.forEach(a => { const l = byNe.get(a.neId!) ?? []; l.push(a); byNe.set(a.neId!, l); });
  for (const n of db.nes) {
    if (n.discovery === 'not-discovered') continue;
    const al = byNe.get(n.id) ?? [];
    const pen = al.reduce((t, a) => t + (a.severity === 'critical' ? 4 : a.severity === 'major' ? 1.5 : a.severity === 'minor' ? 0.3 : 0.1), 0);
    let s = 100 - pen - (n.cpu + n.mem) / 40 - Math.max(0, n.cpu - 75) * 0.12 - Math.max(0, n.tempC - 50) * 0.1;
    if (n.icmp.state === 'critical') s = Math.min(s, 38 + (seedOf(n.id) % 18));
    n.healthScore = r2(Math.max(0, s));
    n.health = n.healthScore >= 80 ? (al.some(a => a.severity === 'critical' || a.severity === 'major') ? 'degraded' : 'healthy') : n.healthScore >= 60 ? 'degraded' : 'critical';
  }
}

function buildRisks(db: Db) {
  for (const dc of db.datacenters) {
    const nes = db.nes.filter(n => n.dcId === dc.id);
    const nd = nes.filter(n => n.discovery === 'not-discovered').length, dr = nes.filter(n => n.discovery === 'drifted').length;
    const R = (domain: Datacenter['risks'][number]['domain'], title: string, detail: string, severity: Severity, owner: string, opened: number) => dc.risks.push({ id: `${dc.id}-R${dc.risks.length + 1}`, domain, title, detail, severity, owner, opened });
    if (nd) R('Inventory', `${nd} NE not discovered`, 'Planned or no collector — reconcile to close the record gap', nd > 20 ? 'major' : 'minor', 'Asset & inventory', db.now - 12 * DAY);
    if (dr) R('Inventory', `${dr} NE drifted from record`, 'Includes duplicate serials — verify and update the record', dr > 10 ? 'major' : 'minor', 'Asset & inventory', db.now - 6 * DAY);
    for (const c of dc.collectors) if (c.state !== 'up') R('Inventory', `${c.name} stale`, 'Discovery paused for half the site; freshness SLA 15 min', 'major', 'NOC tooling', c.lastSeen);
    for (const u of dc.cooling.units) if (u.status === 'Failed') R('Facility', `${u.name} failed`, `${u.zone} cooling at N — redundancy lost`, 'critical', 'Facility ops', db.now - 4 * HOUR);
    for (const u of dc.power.ups) if (u.state !== 'Online') R('Facility', `${u.name} ${u.state.toLowerCase()}`, 'Feed A lost — DG start pending', 'critical', 'Facility ops', db.now - HOUR);
    const hot = db.links.filter(l => l.protocol === 'LLDP' && l.dcId === dc.id && l.utilPct >= 85 && l.role !== 'Access');
    if (hot.length) R('Network', `${hot.length} backhaul link${hot.length > 1 ? 's' : ''} ≥85% utilised`, 'Forecast to cross 95% critical inside the planning window', 'major', 'Capacity planning', db.now - 9 * DAY);
    if (dc.id === 'MH-DC-001') { R('Supplier', 'Optics batch SFP-10G-LR lot 22B', '4 nodes in the estate show the same Rx-power decay signature', 'minor', 'Vendor management', db.now - 2 * DAY); R('Commissioning', 'Enterprise Corp L3VPN acceptance pending', 'Customer acceptance test booked 03-Oct', 'minor', 'Service delivery', db.now - 4 * DAY); }
    if (dc.id === 'KL-DC-024') R('Commissioning', 'DG load-bank test outstanding', 'Required before on-air sign-off', 'major', 'Facility ops', db.now - 8 * DAY);
    if (dc.id === 'GJ-DC-013') R('Supplier', 'Rack & PDU delivery delayed', 'Vendor ETA moved to 24-Oct', 'major', 'Procurement', db.now - 15 * DAY);
  }
}

export { HOUR, DAY, MIN };
