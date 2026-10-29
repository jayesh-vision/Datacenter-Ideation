/* MACD read model (28-Oct-2026, user: "introduce the MACD management system in our SynapseDC platform … in the context of the datacenter").
   Move · Add · Change · Disconnect requests against what a customer (colocation tenant, NeoCloud customer) or an internal team has in a
   datacenter: equipment, cabinets and cages, power circuits, cross-connects, ports, addresses, GPU nodes and access lists.
   - catalogue = the MACD service catalogue per persona: SLA (standard / expedited; emergency 4 h), one-time (NRC) and monthly (MRC) charges,
     standard (pre-approved) or normal change, the records it updates and the tasks it runs;
   - requests are seeded per live site on their own ids (never the generator's stream, so every fingerprint holds); colocation cross-connect
     orders in flight (mock/ops.ts) ARE MACD requests (same XC id), so the customer page and this module agree;
   - feasibility is computed against the live estate: free U in the rack (DCIM free slots, holds included), rack power after the change,
     the tenant's contracted kW, inlet temperature, free meet-me ports, free GPU nodes, change freezes and open Critical / High incidents;
   - every request from Scheduled on runs under a change request: seeded ones as derived `MCR-` records in Change management (status follows
     the stage), requests raised here as real CHG records (origin MACD) the change board approves;
   - the user's moves (new requests, stage moves, holds, notes) are an overlay, reset on regenerate. Effects on the estate are applied by
     mock/server.ts (DCIM space hold, rack U / contracted kW at verification). */
import type { ChangeFreeze, ChangeStatus, Customer, Datacenter, MacdCatalogItem, MacdCheck, MacdKind, MacdObject, MacdPriority, MacdRequest, MacdSite, MacdSla, MacdStage, MacdTask, MacdView, MacdChannel, Rack } from '../api/types';
import type { Db } from './generate';
import { activeGeo, money } from './geo';
import { colocationOrders } from './ops';
import { dcimModel, freeSlots } from './dcim';
import { GPU_RATE } from './gpu';
import { mulberry32, seedOf, intBetween, between, chance, pick, type Rnd } from '../lib/rng';
import { DAY, HOUR } from './seed';
import { fmtDateTime } from '../lib/format';

/* ------------------------------------------------------------------ catalogue */
type Who = 'colo' | 'neo' | 'cloud' | 'internal';
interface CatDef extends Omit<MacdCatalogItem, 'uses30' | 'avgCycleH' | 'onTimePct' | 'nrc' | 'mrc'> {
  nrcR: number; mrcR: number;                                        // rupees; wrapped with money() for the geography
  who: Who[]; w: number; risk: 'Low' | 'Medium' | 'High'; cr: string; // weight when seeding · change risk · change title wording
}
const T = {
  intake: 'Request received and validated', feas: 'Feasibility checked', quote: 'Quote accepted by the customer', cr: 'Change request approved',
  hold: 'Space and power held in DCIM', access: 'Site access booked', test: 'Tested and verified', records: 'Records updated', bill: 'Billing change posted', close: 'Customer told, request closed'
};
const CAT: CatDef[] = [
  { id: 'MAC-A01', kind: 'Add', object: 'Equipment', name: 'Install equipment', desc: 'Rack, power and cable customer or operator equipment into free U, both PDU sides, structured cabling to the cabinet panel.', slaH: 72, expediteH: 24, nrcR: 7500, mrcR: 0, unit: 'device', standard: true, access: true, uPerUnit: 2, kwPerUnit: 0.7, records: ['Inventory: device, rack, U, PSU cords', 'DCIM: power ports to PDU outlets', 'IP Management: management address'], tasks: ['Rack and stack', 'Power both feeds', 'Patch to the cabinet panel'], who: ['colo', 'neo', 'cloud', 'internal'], w: 5, risk: 'Low', cr: 'Rack and stack' },
  { id: 'MAC-A02', kind: 'Add', object: 'Cabinet', name: 'New cabinet or cage space', desc: 'A new cabinet (or cage extension) in the hall with A + B power, overhead trays and a cabinet patch panel.', slaH: 336, expediteH: 168, nrcR: 90000, mrcR: 60000, unit: 'cabinet', standard: false, access: false, uPerUnit: 0, kwPerUnit: 6, records: ['Inventory: rack position, size, owner', 'DCIM: power feeds, panel ports', 'BSS: cabinet on the contract'], tasks: ['Place and level the cabinet', 'Install A + B feeds', 'Fit the patch panel and trunk'], who: ['colo'], w: 1.4, risk: 'Medium', cr: 'Install a cabinet' },
  { id: 'MAC-A03', kind: 'Add', object: 'Power circuit', name: 'Add a power circuit', desc: 'An extra A + B circuit (32 A) to a cabinet, from the hall busway to a new PDU, with the contract uplift.', slaH: 240, expediteH: 96, nrcR: 30000, mrcR: 7250, unit: 'kW', standard: false, access: true, uPerUnit: 0, kwPerUnit: 5, records: ['DCIM: power feed from the busway, PDU', 'BSS: contracted kW'], tasks: ['Fit tap-off units on A and B busways', 'Install and label the PDU', 'Load test'], who: ['colo', 'internal'], w: 2, risk: 'Medium', cr: 'Add power circuit' },
  { id: 'MAC-A04', kind: 'Add', object: 'Cross-connect', name: 'New cross-connect', desc: 'A fibre or copper cross-connect from the customer cabinet to a carrier, cloud on-ramp, peering fabric or another tenant through the meet-me room.', slaH: 120, expediteH: 24, nrcR: 15000, mrcR: 12500, unit: 'cross-connect', standard: true, access: false, uPerUnit: 0, kwPerUnit: 0, records: ['DCIM: cable, panel ports both ends', 'BSS: cross-connect service'], tasks: ['Reserve panel ports', 'Patch through the MMR', 'Light-level test and hand over (LOA/CFA)'], who: ['colo', 'neo', 'cloud', 'internal'], w: 4, risk: 'Low', cr: 'Patch a cross-connect' },
  { id: 'MAC-A05', kind: 'Add', object: 'GPU nodes', name: 'Add GPU nodes to a cluster', desc: 'Allocate burned-in GPU nodes from the free pool to a customer\'s reserved cluster: InfiniBand partition, storage, scheduler and billing.', slaH: 120, expediteH: 48, nrcR: 0, mrcR: GPU_RATE.neocloud * 8, unit: 'node', standard: false, access: false, uPerUnit: 0, kwPerUnit: 10.2, records: ['Inventory: node owner and cluster', 'Infra Ops: scheduler partition', 'BSS: reserved GPUs'], tasks: ['Burn-in and health check', 'Join the InfiniBand partition', 'Hand to the customer scheduler'], who: ['neo', 'cloud'], w: 3, risk: 'Low', cr: 'Allocate GPU nodes' },
  { id: 'MAC-A06', kind: 'Add', object: 'IP addresses', name: 'Additional IP block or VLAN', desc: 'A public block, VLAN or BGP session for a customer, from the site plan in IP Management.', slaH: 24, expediteH: 8, nrcR: 2500, mrcR: 2000, unit: 'block', standard: false, access: false, uPerUnit: 0, kwPerUnit: 0, records: ['IP Management: prefix / VLAN assigned', 'BSS: IP service'], tasks: ['Assign from the site plan', 'Configure the customer port'], who: ['colo', 'neo', 'cloud', 'internal'], w: 1.5, risk: 'Low', cr: 'Assign addresses' },
  { id: 'MAC-M01', kind: 'Move', object: 'Equipment', name: 'Move equipment', desc: 'Move devices to another U or cabinet at the site: de-rack, re-rack, re-power on both sides, re-patch.', slaH: 96, expediteH: 24, nrcR: 6000, mrcR: 0, unit: 'device', standard: false, access: true, uPerUnit: 2, kwPerUnit: 0.7, records: ['Inventory: rack and U', 'DCIM: power ports, cables'], tasks: ['Agree the outage window', 'De-rack and re-rack', 'Re-power and re-patch'], who: ['colo', 'neo', 'cloud', 'internal'], w: 2.5, risk: 'Medium', cr: 'Move equipment' },
  { id: 'MAC-M02', kind: 'Move', object: 'Cabinet', name: 'Relocate a cage or cabinet', desc: 'Move a customer to another hall (density, liquid cooling, consolidation): staged build, migration windows, old space released.', slaH: 720, expediteH: 336, nrcR: 180000, mrcR: 0, unit: 'cabinet', standard: false, access: true, uPerUnit: 0, kwPerUnit: 0, records: ['Inventory: racks, devices, owner', 'DCIM: feeds, cables', 'BSS: cabinet location'], tasks: ['Build the new space', 'Migrate in windows', 'Release the old space'], who: ['colo'], w: 0.5, risk: 'High', cr: 'Relocate cabinets' },
  { id: 'MAC-M03', kind: 'Move', object: 'GPU nodes', name: 'Move nodes to another pod', desc: 'Re-home GPU nodes to another pod or InfiniBand rail group (fault domain, cooling, consolidation).', slaH: 168, expediteH: 72, nrcR: 0, mrcR: 0, unit: 'node', standard: false, access: true, uPerUnit: 0, kwPerUnit: 0, records: ['Inventory: node rack and pod', 'Infra Ops: scheduler placement'], tasks: ['Drain the nodes', 'Re-cable the rails', 'Burn-in and return'], who: ['neo', 'cloud'], w: 1, risk: 'Medium', cr: 'Move GPU nodes' },
  { id: 'MAC-C01', kind: 'Change', object: 'Power circuit', name: 'Upgrade contracted power', desc: 'Raise a cabinet\'s contracted kW (bigger breaker or a second circuit pair) within the hall\'s cooling and UPS headroom.', slaH: 120, expediteH: 48, nrcR: 20000, mrcR: 7250, unit: 'kW', standard: false, access: true, uPerUnit: 0, kwPerUnit: 2, records: ['DCIM: feed rating', 'BSS: contracted kW'], tasks: ['Check busway and UPS headroom', 'Change the breaker / PDU', 'Load test'], who: ['colo'], w: 1.6, risk: 'Medium', cr: 'Upgrade power circuit' },
  { id: 'MAC-C02', kind: 'Change', object: 'Cross-connect', name: 'Re-patch or upgrade a cross-connect', desc: 'Move a cross-connect to another port or panel, or upgrade it (10G to 100G, MMF to SMF).', slaH: 48, expediteH: 12, nrcR: 6000, mrcR: 0, unit: 'cross-connect', standard: true, access: false, uPerUnit: 0, kwPerUnit: 0, records: ['DCIM: cable, panel ports'], tasks: ['Re-patch', 'Light-level test'], who: ['colo', 'neo', 'cloud', 'internal'], w: 2, risk: 'Low', cr: 'Re-patch cross-connect' },
  { id: 'MAC-C03', kind: 'Change', object: 'Network port', name: 'Change port settings', desc: 'Speed, VLAN, description or enable on customer-facing ports: record and configuration work with no physical move.', slaH: 24, expediteH: 4, nrcR: 0, mrcR: 0, unit: 'port', standard: true, access: false, uPerUnit: 0, kwPerUnit: 0, records: ['DCIM: port label and state', 'IP Management: VLAN'], tasks: ['Change the port', 'Check the link'], who: ['colo', 'neo', 'cloud', 'internal'], w: 2.2, risk: 'Low', cr: 'DCIM record: port settings' },
  { id: 'MAC-C04', kind: 'Change', object: 'Access', name: 'Change the access list', desc: 'Add or remove the people allowed into a customer\'s cage or cabinet (badges, escorts, biometric enrolment).', slaH: 24, expediteH: 4, nrcR: 0, mrcR: 0, unit: 'person', standard: true, access: false, uPerUnit: 0, kwPerUnit: 0, records: ['Access control: badge rights', 'SynapseDC: cage access list'], tasks: ['Verify the requester', 'Update badge rights'], who: ['colo', 'neo'], w: 2, risk: 'Low', cr: 'DCIM record: access list' },
  { id: 'MAC-C05', kind: 'Change', object: 'GPU nodes', name: 'Change partition or power cap', desc: 'Change a cluster\'s InfiniBand partition, MIG layout or node power cap.', slaH: 24, expediteH: 8, nrcR: 0, mrcR: 0, unit: 'node', standard: false, access: false, uPerUnit: 0, kwPerUnit: 0, records: ['Infra Ops: partition / cap', 'Inventory: node settings'], tasks: ['Apply the change', 'Validate with a burn-in job'], who: ['neo', 'cloud'], w: 1.4, risk: 'Low', cr: 'Change GPU partition' },
  { id: 'MAC-D01', kind: 'Disconnect', object: 'Cross-connect', name: 'Disconnect a cross-connect', desc: 'Remove a cross-connect, free both panel ports and stop its monthly charge.', slaH: 48, expediteH: 24, nrcR: 0, mrcR: -12500, unit: 'cross-connect', standard: true, access: false, uPerUnit: 0, kwPerUnit: 0, records: ['DCIM: cable removed, ports free', 'BSS: service ended'], tasks: ['Confirm no traffic', 'Remove the jumper'], who: ['colo', 'neo', 'cloud', 'internal'], w: 1.6, risk: 'Low', cr: 'Remove cross-connect' },
  { id: 'MAC-D02', kind: 'Disconnect', object: 'Equipment', name: 'Remove equipment', desc: 'De-rack and remove (or decommission) devices: data wiped or certificate, cords and cables out, U released.', slaH: 72, expediteH: 24, nrcR: 6000, mrcR: 0, unit: 'device', standard: false, access: true, uPerUnit: 2, kwPerUnit: -0.7, records: ['Inventory: device retired', 'DCIM: U, power ports, cables released', 'IP Management: addresses released'], tasks: ['Confirm power-down', 'De-rack and remove', 'Release records'], who: ['colo', 'neo', 'cloud', 'internal'], w: 1.8, risk: 'Low', cr: 'Remove equipment' },
  { id: 'MAC-D03', kind: 'Disconnect', object: 'Power circuit', name: 'Decommission a power circuit', desc: 'Make safe and remove a circuit pair and lower the contracted kW.', slaH: 120, expediteH: 48, nrcR: 0, mrcR: -7250, unit: 'kW', standard: false, access: true, uPerUnit: 0, kwPerUnit: -5, records: ['DCIM: feed removed', 'BSS: contracted kW'], tasks: ['Isolate and lock out', 'Remove the PDU and tap-offs'], who: ['colo'], w: 0.8, risk: 'Medium', cr: 'Decommission power circuit' },
  { id: 'MAC-D04', kind: 'Disconnect', object: 'Cabinet', name: 'Cabinet or cage exit', desc: 'End of contract: equipment out, cross-connects and circuits removed, cabinet cleaned and back in stock.', slaH: 336, expediteH: 168, nrcR: 25000, mrcR: -60000, unit: 'cabinet', standard: false, access: true, uPerUnit: 0, kwPerUnit: 0, records: ['Inventory: rack back to operator stock', 'DCIM: feeds, cables, panel released', 'BSS: contract line ended'], tasks: ['Customer removes equipment', 'Remove circuits and cross-connects', 'Inspect and release'], who: ['colo'], w: 0.5, risk: 'Medium', cr: 'Cabinet exit' },
  { id: 'MAC-D05', kind: 'Disconnect', object: 'GPU nodes', name: 'Release GPU nodes', desc: 'Return nodes to the free pool at the end of a reservation: data wiped, partition removed, billing stopped.', slaH: 48, expediteH: 24, nrcR: 0, mrcR: -GPU_RATE.neocloud * 8, unit: 'node', standard: false, access: false, uPerUnit: 0, kwPerUnit: 0, records: ['Inventory: node back to the pool', 'Infra Ops: partition removed', 'BSS: reserved GPUs'], tasks: ['Drain and wipe', 'Remove from the partition'], who: ['neo', 'cloud'], w: 1, risk: 'Low', cr: 'Release GPU nodes' }
];
const whoOf = (persona: Db['persona']): Who[] => persona === 'colocation' ? ['colo'] : persona === 'neocloud' ? ['neo'] : persona === 'cloud' ? ['cloud', 'internal'] : ['internal'];
const catFor = (db: Db) => { const w = whoOf(db.persona); return CAT.filter(c => c.who.some(x => w.includes(x))); };
const catById = (id: string) => CAT.find(c => c.id === id);
/* GPU items only where the estate runs GPU nodes */
const hasGpu = (db: Db) => !!db.gpu && db.gpu.nodes.size > 0;
const priceOf = (db: Db, c: CatDef) => ({ nrc: money(c.nrcR), mrc: c.object === 'GPU nodes' ? money(c.mrcR / GPU_RATE.neocloud * (db.persona === 'cloud' ? GPU_RATE.cloud : GPU_RATE.neocloud)) : money(c.mrcR) });

export const STAGES: MacdStage[] = ['Submitted', 'Feasibility', 'Quote', 'Scheduled', 'In progress', 'Verification', 'Completed'];
const si = (s: MacdStage) => STAGES.indexOf(s);
export const slaHours = (c: { slaH: number; expediteH: number }, p: MacdPriority) => (p === 'Emergency' ? 4 : p === 'Expedited' ? c.expediteH : c.slaH);
const TEAMS = ['Network engineering', 'Server team', 'Storage team', 'Platform operations', 'Security team', 'Facilities'];

/* ------------------------------------------------------------------ the user's moves (reset on regenerate) */
interface Base extends Omit<MacdRequest, 'checks' | 'tasks' | 'sla' | 'slaLeftH' | 'changeStatus' | 'changeBlocked'> { seeded: boolean }
const ov = { patch: new Map<string, Partial<Base>>(), created: [] as Base[], notes: new Map<string, { at: number; by: string; text: string }[]>(), seq: 0, gone: new Set<string>() };
let view: MacdView | null = null, viewDb: Db | null = null;
let seedCache: Base[] | null = null, seedDb: Db | null = null;
export const clearMacd = () => { view = null; };
export const resetMacd = () => { ov.patch.clear(); ov.created.length = 0; ov.notes.clear(); ov.gone.clear(); ov.seq = 0; view = null; seedCache = null; };

/* ------------------------------------------------------------------ seed */
const shortRack = (r: Rack) => r.name;
function pickRack(rr: Rnd, dc: Datacenter, c: CatDef, customerId?: string): Rack | undefined {
  const tenant = dc.racks.filter(r => r.owner === 'tenant' && (!customerId || r.tenantId === customerId));
  const ai = dc.racks.filter(r => r.density === 'ai');
  const ops = dc.racks.filter(r => r.owner !== 'tenant' && !/ODF|patch|MMR/i.test(`${r.role} ${r.name}`));
  const pool = c.object === 'GPU nodes' ? ai : customerId && tenant.length ? tenant : ops.length ? ops : dc.racks;
  return pool.length ? pick(rr, pool) : undefined;
}
function custAt(db: Db, dc: Datacenter): Customer[] {
  const ids = new Set<string>();
  if (db.persona === 'colocation') dc.racks.forEach(r => r.tenantId && ids.add(r.tenantId));
  else db.services.filter(s => s.dcId === dc.id).forEach(s => ids.add(s.customerId));
  return db.customers.filter(c => ids.has(c.id));
}
const XC_DEST = ['Carrier POP · MMR panel 3', 'Cloud on-ramp · MMR panel 7', 'Peering fabric · MMR panel 2', 'Another tenant · cage cross-connect', 'Internet exchange · MMR panel 5'];
function titleOf(c: CatDef, qty: number, rack?: Rack, to?: Rack, cust?: Customer, dest?: string): string {
  const rk = rack ? shortRack(rack) : 'the site', s = qty === 1 ? '' : 's';
  switch (`${c.kind}|${c.object}`) {
    case 'Add|Equipment': return `Install ${qty} device${s} in ${rk}`;
    case 'Add|Cabinet': return `${qty} new cabinet${s} beside ${rk}`;
    case 'Add|Power circuit': return `Add ${qty * c.kwPerUnit} kW (A + B circuit${s}) to ${rk}`;
    case 'Add|Cross-connect': return `Cross-connect ${rk} → ${dest ?? 'carrier'}`;
    case 'Add|GPU nodes': return `Add ${qty} GPU node${s} to ${cust?.name ?? 'the'} cluster`;
    case 'Add|IP addresses': return `Additional /28 block and VLAN for ${cust?.name ?? rk}`;
    case 'Move|Equipment': return `Move ${qty} device${s} ${rk} → ${to ? shortRack(to) : 'another rack'}`;
    case 'Move|Cabinet': return `Relocate ${qty} cabinet${s} from ${rack?.room ?? 'the hall'} to ${to?.room ?? 'another hall'}`;
    case 'Move|GPU nodes': return `Move ${qty} GPU node${s} from ${rk} to ${to ? shortRack(to) : 'another pod'}`;
    case 'Change|Power circuit': return `Raise ${rk} contracted power by ${qty * c.kwPerUnit} kW`;
    case 'Change|Cross-connect': return `Upgrade cross-connect on ${rk} to 100G SMF`;
    case 'Change|Network port': return `Change VLAN / speed on ${qty} port${s} for ${rk}`;
    case 'Change|Access': return `${qty} access-list change${s} for ${cust?.name ?? rk}`;
    case 'Change|GPU nodes': return `Power cap and partition change on ${qty} GPU node${s}`;
    case 'Disconnect|Cross-connect': return `Disconnect cross-connect on ${rk}`;
    case 'Disconnect|Equipment': return `Remove ${qty} device${s} from ${rk}`;
    case 'Disconnect|Power circuit': return `Decommission ${qty * Math.abs(c.kwPerUnit)} kW circuit on ${rk}`;
    case 'Disconnect|Cabinet': return `Cabinet exit: ${rk}`;
    case 'Disconnect|GPU nodes': return `Release ${qty} GPU node${s} at reservation end`;
  }
  return c.name;
}
function qtyFor(rr: Rnd, c: CatDef) {
  return c.object === 'Equipment' ? intBetween(rr, 1, 4) : c.object === 'GPU nodes' ? pick(rr, [1, 2, 4, 4, 8]) : c.object === 'Power circuit' ? intBetween(rr, 1, 2)
    : c.object === 'Network port' ? intBetween(rr, 1, 8) : c.object === 'Access' ? intBetween(rr, 1, 5) : 1;
}
/* a request's units → its space / power deltas */
const deltas = (c: CatDef, qty: number) => ({ uDelta: c.uPerUnit * qty * (c.kind === 'Disconnect' ? -1 : 1), kwDelta: Math.round(c.kwPerUnit * qty * 10) / 10 });

function seed(db: Db): Base[] {
  if (seedCache && seedDb === db) return seedCache;
  const now = db.now, ppl = activeGeo().people, out: Base[] = [];
  const cat = catFor(db).filter(c => c.object !== 'GPU nodes' || hasGpu(db));
  let n = 0;
  const live = db.datacenters.filter(d => d.status === 'on-air');
  for (const dc of live) {
    const rr = mulberry32(seedOf(`${dc.id}:macd`));
    const custs = custAt(db, dc);
    const count = intBetween(rr, 6, 12) + (db.persona === 'colocation' ? 3 : 0);
    for (let k = 0; k < count; k++) {
      const r = mulberry32(seedOf(`${dc.id}:macd:${k}`));
      const tot = cat.reduce((s, c) => s + c.w, 0); let x = r() * tot;
      const c = cat.find(cc => (x -= cc.w) < 0) ?? cat[0];
      const external = db.persona === 'colocation' || db.persona === 'neocloud' || (db.persona === 'cloud' && c.object === 'GPU nodes');
      const cust = external && custs.length ? pick(r, custs) : undefined;
      const rack = pickRack(r, dc, c, cust?.id);
      if (!rack && c.object !== 'IP addresses' && c.object !== 'Access') continue;
      const qty = qtyFor(r, c);
      const to = c.kind === 'Move' ? pickRack(r, dc, c, cust?.id) : undefined;
      const dest = c.object === 'Cross-connect' ? pick(r, XC_DEST) : undefined;
      const priority: MacdPriority = chance(r, 0.05) ? 'Emergency' : chance(r, 0.2) ? 'Expedited' : 'Standard';
      const slaH = slaHours(c, priority);
      /* most requests arrive spread over the last 30 days (most are done by now); some are recent enough to still be in flight */
      const created = now - Math.round(chance(r, 0.6) ? between(r, 0.01, 1) * 30 * DAY : between(r, 0.02, 1) * Math.min(30 * DAY, Math.max(slaH * HOUR * 1.2, DAY)));
      const cycle = slaH * HOUR * between(r, 0.35, 1.15);
      const age = now - created;
      const billable = !!cust && (c.nrcR !== 0 || c.mrcR !== 0);
      let stage: MacdStage, completedAt: number | undefined, reason: string | undefined;
      const fate = r();
      if (fate < 0.05) { stage = 'Rejected'; reason = pick(r, ['Not enough contiguous U in the cabinet; customer to free space first', 'Hall cooling headroom too low for the added load', 'Customer did not accept the quote within 10 days']); }
      else if (fate < 0.08) { stage = 'Cancelled'; reason = 'Withdrawn by the requester'; }
      else if (age >= cycle) { stage = 'Completed'; completedAt = created + cycle; }
      else {
        const f = age / cycle;
        stage = f < 0.06 ? 'Submitted' : f < 0.2 ? 'Feasibility' : f < 0.34 && billable ? 'Quote' : f < 0.6 ? 'Scheduled' : f < 0.86 ? 'In progress' : 'Verification';
      }
      const start = created + cycle * 0.55, w = { start, end: start + (c.risk === 'High' ? 8 : 3) * HOUR };
      const { uDelta, kwDelta } = deltas(c, qty);
      const p = priceOf(db, c);
      const neIds = (c.kind !== 'Add' && c.object === 'Equipment' && rack) ? db.nes.filter(ne => ne.rackId === rack.id).slice(0, qty).map(ne => ne.id) : [];
      const id = `MACD-${String(++n).padStart(4, '0')}`;
      const reached = si(stage) >= si('Scheduled') || (stage === 'Cancelled' && chance(r, 0.4));
      const ppl2 = (o: number) => ppl[(seedOf(id) + o) % ppl.length];
      out.push({
        id, kind: c.kind, object: c.object, catalogId: c.id, title: titleOf(c, qty, rack, to, cust, dest), detail: c.desc, seeded: true,
        dcId: dc.id, room: rack?.room, rackId: rack?.id, rackName: rack?.name, toRackId: to?.id, toRackName: to?.name, neIds,
        customerId: cust?.id, customerName: cust?.name, requester: cust ? ppl2(3) : pick(r, TEAMS), owner: ppl2(1),
        channel: cust ? pick(r, ['Customer portal', 'Customer portal', 'Customer portal', 'Account manager', 'Email', 'API'] as MacdChannel[]) : 'Internal',
        priority, stage, created, due: created + slaH * HOUR, window: reached ? w : undefined, completedAt, reason,
        qty, unit: c.unit, uDelta, kwDelta, nrc: billable ? p.nrc * (c.unit === 'kW' ? 1 : qty) : 0, mrcDelta: billable ? p.mrc * (c.unit === 'kW' ? Math.abs(kwDelta) : qty) : 0, billable,
        changeId: reached ? `MCR-${id.slice(5)}` : undefined, ref: undefined,
        workRef: si(stage) >= si('In progress') ? `${c.access ? 'WO' : 'TSK'}-${String(seedOf(id + 'wo') % 90000 + 10000)}` : undefined,
        firstTimeRight: stage === 'Completed' ? chance(r, 0.88) : undefined,
        history: []
      });
    }
  }
  /* colocation: the cross-connect orders in flight are MACD requests (same XC id as the customer page) */
  if (db.persona === 'colocation') {
    const map: Record<string, MacdStage> = { Requested: 'Feasibility', Approved: 'Scheduled', Patched: 'In progress', Tested: 'Verification' };
    const c = catById('MAC-A04')!, p = priceOf(db, c);
    for (const o of colocationOrders(db, {}).xc.filter(x => x.state !== 'Handed over')) {
      const dc = db.datacenters.find(d => d.id === o.dcId); const rack = dc?.racks.find(rk => rk.tenantId === o.customerId);
      const cust = db.customers.find(cu => cu.id === o.customerId);
      const id = `MACD-${String(++n).padStart(4, '0')}`, stage = map[o.state];
      const reached = si(stage) >= si('Scheduled');
      out.push({ id, kind: 'Add', object: 'Cross-connect', catalogId: c.id, title: `Cross-connect ${rack?.name ?? 'tenant cabinet'} → ${o.to}`, detail: `${c.desc} Media ${o.media}.`, seeded: true,
        dcId: o.dcId, room: rack?.room, rackId: rack?.id, rackName: rack?.name, neIds: [], customerId: o.customerId, customerName: cust?.name, requester: activeGeo().people[seedOf(o.id) % activeGeo().people.length], owner: activeGeo().people[(seedOf(o.id) + 1) % activeGeo().people.length],
        channel: 'Customer portal', priority: 'Standard', stage, created: o.ordered, due: o.due, window: reached ? { start: o.ordered + 2 * DAY, end: o.ordered + 2 * DAY + 2 * HOUR } : undefined,
        qty: 1, unit: c.unit, uDelta: 0, kwDelta: 0, nrc: p.nrc, mrcDelta: p.mrc, billable: true, changeId: reached ? `MCR-${id.slice(5)}` : undefined, ref: o.id,
        workRef: si(stage) >= si('In progress') ? `WO-${String(seedOf(o.id + 'wo') % 90000 + 10000)}` : undefined, history: [] });
    }
  }
  /* a few drafts: saved but not submitted yet (no SLA clock, no checks run by the team); own stream so nothing above moves */
  for (const dc of live) {
    const r = mulberry32(seedOf(`${dc.id}:macd:draft`));
    if (!chance(r, 0.3)) continue;
    const pool = cat.filter(c => c.kind === 'Add' || c.kind === 'Change'), c = pick(r, pool);
    const custs = custAt(db, dc), external = db.persona === 'colocation' || db.persona === 'neocloud';
    const cust = external && custs.length ? pick(r, custs) : undefined;
    const rack = pickRack(r, dc, c, cust?.id);
    if (!rack && c.object !== 'IP addresses' && c.object !== 'Access') continue;
    const qty = qtyFor(r, c), { uDelta, kwDelta } = deltas(c, qty), p = priceOf(db, c);
    const billable = !!cust && (c.nrcR !== 0 || c.mrcR !== 0);
    const id = `MACD-${String(++n).padStart(4, '0')}`, created = now - Math.round(between(r, 0.5, 52) * HOUR);
    out.push({ id, kind: c.kind, object: c.object, catalogId: c.id, title: titleOf(c, qty, rack, undefined, cust, c.object === 'Cross-connect' ? pick(r, XC_DEST) : undefined), detail: c.desc, seeded: true,
      dcId: dc.id, room: rack?.room, rackId: rack?.id, rackName: rack?.name, neIds: [], customerId: cust?.id, customerName: cust?.name,
      requester: ppl[(seedOf(id) + 3) % ppl.length], owner: ppl[(seedOf(id) + 3) % ppl.length], channel: cust ? 'Account manager' : 'Internal',
      priority: 'Standard', stage: 'Draft', created, due: created + slaHours(c, 'Standard') * HOUR,
      qty, unit: c.unit, uDelta, kwDelta, nrc: billable ? p.nrc * (c.unit === 'kW' ? 1 : qty) : 0, mrcDelta: billable ? p.mrc * (c.unit === 'kW' ? Math.abs(kwDelta) : qty) : 0, billable, history: [] });
  }
  seedDb = db; seedCache = out; return out;
}

/* seed + the user's moves */
function bases(db: Db): Base[] {
  return [...seed(db), ...ov.created].filter(b => !ov.gone.has(b.id)).map(b => { const p = ov.patch.get(b.id); return p ? { ...b, ...p } : b; });
}
export const macdBase = (db: Db, id: string) => bases(db).find(b => b.id === id);
export const macdCatalogDef = (id: string) => catById(id);
export function macdPatch(id: string, p: Partial<Base>, by: string, text: string, at: number) {
  ov.patch.set(id, { ...(ov.patch.get(id) ?? {}), ...p });
  ov.notes.set(id, [...(ov.notes.get(id) ?? []), { at, by, text }]);
  view = null;
}
/* a draft thrown away (never submitted): it leaves the register */
export function macdDiscard(id: string) { const i = ov.created.findIndex(b => b.id === id); if (i >= 0) ov.created.splice(i, 1); else ov.gone.add(id); ov.patch.delete(id); ov.notes.delete(id); view = null; }
export function macdNote(id: string, by: string, text: string, at: number) { ov.notes.set(id, [...(ov.notes.get(id) ?? []), { at, by, text }]); view = null; }

/* the change records the seeded requests run under (Change management lists them with source MACD) */
export function macdChangeRecords(db: Db): { id: string; title: string; dcId: string; scope: string[]; risk: 'Low' | 'Medium' | 'High'; status: ChangeStatus; windowStart: number; windowEnd: number; requester: string; rollback: string; created: number; macdId: string }[] {
  const out: ReturnType<typeof macdChangeRecords> = [];
  for (const b of bases(db)) {
    if (!b.changeId?.startsWith('MCR-') || !b.window) continue;
    const c = catById(b.catalogId); if (!c) continue;
    const status: ChangeStatus = b.stage === 'Completed' ? 'Completed' : b.stage === 'Cancelled' || b.stage === 'Rejected' ? 'Rejected' : b.stage === 'Scheduled' ? 'Approved' : 'In progress';
    out.push({ id: b.changeId, title: `${c.cr}: ${b.title} (${b.id})`, dcId: b.dcId, scope: [...(b.rackId ? [b.rackId] : []), ...(b.toRackId ? [b.toRackId] : []), ...b.neIds], risk: c.risk, status,
      windowStart: b.window.start, windowEnd: b.window.end, requester: b.owner, rollback: rollbackOf(c), created: b.created, macdId: b.id });
  }
  return out;
}
export const rollbackOf = (c: { kind: MacdKind; object: MacdObject }) => c.kind === 'Disconnect' ? 'Re-patch / re-power from the labelled record before the change; nothing is scrapped until verification'
  : c.object === 'Power circuit' ? 'Isolate the new circuit and leave the cabinet on its existing feeds' : c.kind === 'Move' ? 'Return the equipment to its original U and cabling from the move sheet'
  : 'Remove the addition; the existing service is not touched';

/* ------------------------------------------------------------------ checks (feasibility against the live estate) */
export interface MacdCtx { freezes: ChangeFreeze[]; cr: (id: string) => { status: ChangeStatus; blocked?: string } | undefined }
export function macdChecks(db: Db, b: Pick<Base, 'catalogId' | 'dcId' | 'rackId' | 'toRackId' | 'qty' | 'uDelta' | 'kwDelta' | 'customerId' | 'neIds' | 'priority' | 'kind' | 'object' | 'room'>, ctx: MacdCtx): MacdCheck[] {
  const c = catById(b.catalogId); const dc = db.datacenters.find(d => d.id === b.dcId);
  if (!c || !dc) return [];
  const out: MacdCheck[] = [];
  const target = dc.racks.find(r => r.id === (b.kind === 'Move' && b.toRackId ? b.toRackId : b.rackId));
  const src = dc.racks.find(r => r.id === b.rackId);
  /* space */
  if (b.uDelta > 0 && target) {
    const free = freeSlots(db, target.id);
    const tot = free.reduce((s, x) => s + x.to - x.from + 1, 0), big = Math.max(0, ...free.map(x => x.to - x.from + 1));
    const need = Math.abs(b.uDelta);
    out.push({ key: 'space', label: 'Rack space', result: big >= need ? 'Pass' : tot >= need ? 'Warn' : 'Fail',
      detail: big >= need ? `${need} U needed · ${tot} U free in ${target.name} (largest gap ${big} U)` : tot >= need ? `${need} U needed · ${tot} U free but the largest gap is ${big} U: devices go in separate gaps` : `${need} U needed · only ${tot} U free in ${target.name}` });
  }
  if (c.object === 'Cabinet' && c.kind !== 'Disconnect') {
    const room = c.kind === 'Move' ? target?.room : src?.room;
    const hall = dcimModel(db).halls.find(h => h.dcId === dc.id && h.name === room);
    const freePos = hall ? Math.max(0, hall.gridCols * hall.gridRows - hall.racks) : 0;
    out.push({ key: 'space', label: 'Hall positions', result: freePos >= b.qty ? 'Pass' : 'Fail', detail: `${b.qty} position${b.qty === 1 ? '' : 's'} needed · ${freePos} free in ${room ?? 'the hall'}` });
  }
  /* power on the rack after the change */
  const kwAdd = b.kind === 'Move' ? (b.uDelta / Math.max(1, c.uPerUnit)) * Math.abs(c.kwPerUnit) : b.kwDelta;
  if (kwAdd > 0 && target && c.object !== 'GPU nodes' && c.object !== 'Cabinet') {
    const budget = c.object === 'Power circuit' ? target.budgetKw + kwAdd : target.budgetKw;
    const after = target.drawKw + (c.object === 'Power circuit' ? 0 : kwAdd), pct = Math.round((after / Math.max(0.1, budget)) * 100);
    out.push({ key: 'power', label: 'Rack power', result: pct > 100 ? 'Fail' : pct > 80 ? 'Warn' : 'Pass', detail: `${after.toFixed(1)} of ${budget.toFixed(1)} kW after the change (${pct}%)${pct > 80 && pct <= 100 ? ' · above the 80% PDU budget line' : ''}` });
  }
  if (c.object === 'Power circuit' && c.kind !== 'Disconnect' && target) {
    const ups = dc.power.ups.reduce((s, u) => s + u.capacityKw * (1 - u.loadPct / 100), 0);
    out.push({ key: 'power', label: 'Busway and UPS headroom', result: ups > kwAdd * 4 ? 'Pass' : ups > kwAdd ? 'Warn' : 'Fail', detail: `${kwAdd} kW more · ${Math.round(ups)} kW UPS headroom at the site` });
  }
  /* the tenant's contracted power */
  if (target?.owner === 'tenant' && target.contractedKw && kwAdd > 0 && c.object !== 'Power circuit') {
    const after = target.drawKw + kwAdd;
    out.push({ key: 'contract', label: 'Contracted power', result: after > target.contractedKw ? 'Warn' : 'Pass', detail: after > target.contractedKw ? `${after.toFixed(1)} kW would exceed the ${target.contractedKw} kW contract: quote a power upgrade (MAC-C01) with it` : `${after.toFixed(1)} of ${target.contractedKw} kW contracted` });
  }
  /* cooling at the target */
  if (target && (kwAdd > 0 || c.kind === 'Move')) {
    out.push({ key: 'cooling', label: 'Cooling', result: target.tempC >= 29 ? 'Fail' : target.tempC >= 27 ? 'Warn' : 'Pass', detail: `Rack inlet ${target.tempC.toFixed(1)} °C (ASHRAE recommended up to 27 °C)${dc.cooling.redundancy === 'N' ? ' · site cooling has no spare unit' : ''}` });
  }
  /* meet-me / panel ports */
  if (c.object === 'Cross-connect' && c.kind === 'Add') {
    const pc = dc.ports.reduce((s, p) => s + p.total - p.used, 0);
    out.push({ key: 'ports', label: 'Meet-me ports', result: pc > 20 ? 'Pass' : pc > 0 ? 'Warn' : 'Fail', detail: `${pc} free ports on the site patching panels` });
  }
  /* GPU pool */
  if (c.object === 'GPU nodes' && c.kind === 'Add' && db.gpu) {
    const freeN = [...db.gpu.nodes.values()].filter(nd => nd.dcId === dc.id && nd.state === 'idle' && !nd.jobId && nd.health === 'healthy').length;
    out.push({ key: 'gpu', label: 'Free GPU nodes', result: freeN >= b.qty ? 'Pass' : freeN > 0 ? 'Warn' : 'Fail', detail: `${b.qty} needed · ${freeN} healthy idle node${freeN === 1 ? '' : 's'} at ${dc.id}` });
  }
  /* records exist for what is moved / changed / removed */
  if (c.kind !== 'Add' && c.object === 'Equipment') {
    out.push({ key: 'records', label: 'Inventory records', result: b.neIds.length >= b.qty || src?.owner === 'tenant' ? 'Pass' : 'Warn', detail: b.neIds.length ? `${b.neIds.length} device record${b.neIds.length === 1 ? '' : 's'} found in ${src?.name}` : src?.owner === 'tenant' ? 'Tenant equipment: recorded as U blocks in the cabinet' : 'No device record found: audit the rack first' });
  }
  /* change freeze and open incidents */
  const now = db.now;
  const frz = ctx.freezes.find(f => (f.scope === 'Estate' || f.dcId === dc.id) && now < (f.to ?? Infinity) && now + slaHours(c, b.priority) * HOUR > f.from);
  out.push(frz ? { key: 'freeze', label: 'Change freeze', result: c.standard && frz.allows !== 'Emergency only' ? 'Pass' : 'Warn', detail: `${frz.title}${c.standard && frz.allows !== 'Emergency only' ? ' · standard changes still run' : ' · the work waits for the freeze to lift unless it is an emergency'}` }
    : { key: 'freeze', label: 'Change freeze', result: 'Pass', detail: 'No freeze before the due date' });
  const inc = db.incidents.filter(i => i.dcId === dc.id && i.sev <= 2 && i.status !== 'Resolved' && i.status !== 'Closed');
  out.push({ key: 'incident', label: 'Open incidents at the site', result: inc.length ? 'Warn' : 'Pass', detail: inc.length ? `${inc.map(i => i.id).join(', ')} open (Critical / High): keep the work away from the affected equipment` : 'No Critical or High incident open' });
  return out;
}

/* ------------------------------------------------------------------ tasks from the stage */
function tasksOf(b: Base, c: CatDef, crStatus: ChangeStatus | undefined): MacdTask[] {
  const s = si(b.stage), dead = b.stage === 'Rejected' || b.stage === 'Cancelled';
  const t: (MacdTask & { at0: number })[] = [];
  const add = (key: string, title: string, system: MacdTask['system'], doneAt: number, ref?: string) => t.push({ key, title, system, state: 'Waiting', at0: doneAt, ref });
  add('intake', T.intake, 'SynapseDC', si('Feasibility'));
  add('feas', T.feas, 'SynapseDC', si('Quote'));
  if (b.billable) add('quote', T.quote, 'Customer', si('Scheduled'));
  add('cr', c.standard ? `${T.cr} (standard, pre-approved)` : T.cr, 'Change management', si('Scheduled'), b.changeId);
  if ((b.kind === 'Add' || b.kind === 'Move') && b.uDelta > 0) add('hold', T.hold, 'DCIM', si('Scheduled'), b.holdId);
  if (c.access) add('access', T.access, 'SynapseDC', si('In progress'));
  c.tasks.forEach((x, i) => add(`work${i}`, x, 'Field team', si('Verification'), i === 0 ? b.workRef : undefined));
  add('test', T.test, 'Field team', si('Completed'));
  add('records', `${T.records}: ${c.records.map(r => r.split(':')[0]).filter((v, i, a) => a.indexOf(v) === i).join(', ')}`, 'Inventory', si('Completed'));
  if (b.billable) add('bill', T.bill, 'BSS', si('Completed'));
  add('close', T.close, 'SynapseDC', si('Completed'));
  let open = false;
  return t.map(({ at0, ...x }) => {
    let state: MacdTask['state'] = dead ? (s >= at0 ? 'Done' : 'Skipped') : s >= at0 ? 'Done' : 'Waiting';
    if (b.stage === 'Rejected' || b.stage === 'Cancelled') { /* nothing open */ }
    else if (b.stage === 'Draft') { /* nothing runs until it is submitted */ }
    else if (state === 'Waiting' && !open) { state = 'Open'; open = true; }
    if (x.key === 'cr' && state !== 'Done' && crStatus === 'Pending approval') state = 'Open';
    return { ...x, state };
  });
}

/* ------------------------------------------------------------------ the view */
export function macdView(db: Db, ctx: MacdCtx): MacdView {
  if (view && viewDb === db) return view;
  const now = db.now;
  const reqs: MacdRequest[] = bases(db).map(b => {
    const c = catById(b.catalogId)!;
    const cr = b.changeId ? ctx.cr(b.changeId) : undefined;
    const open = !['Draft', 'Completed', 'Rejected', 'Cancelled'].includes(b.stage);
    const slaLeftH = b.stage === 'Draft' ? slaHours(c, b.priority) : Math.round(((b.due - (b.completedAt ?? now)) / HOUR) * 10) / 10;
    const total = b.due - b.created;
    const sla: MacdSla = b.stage === 'Draft' ? 'On track' : b.stage === 'Completed' ? (b.completedAt! <= b.due ? 'Met' : 'Missed') : !open ? 'Met' : now > b.due ? 'Breached' : b.due - now < total * 0.25 ? 'At risk' : 'On track';
    const { seeded: _s, ...rest } = b;
    return { ...rest, changeStatus: cr?.status, changeBlocked: cr?.blocked, checks: open || b.stage === 'Draft' || b.stage === 'Rejected' ? macdChecks(db, b, ctx) : [], tasks: tasksOf(b, c, cr?.status), sla, slaLeftH,
      history: [...(b.seeded ? historyOf(b, c) : b.history), ...(ov.notes.get(b.id) ?? [])].sort((x, y) => x.at - y.at) };
  }).sort((a, b) => b.created - a.created);
  const open = reqs.filter(r => !['Draft', 'Completed', 'Rejected', 'Cancelled'].includes(r.stage));
  const done30 = reqs.filter(r => r.stage === 'Completed' && r.completedAt! > now - 30 * DAY);
  const cyc = (xs: MacdRequest[]) => xs.length ? Math.round(xs.reduce((s, r) => s + (r.completedAt! - r.created), 0) / xs.length / HOUR) : 0;
  const onTime = (xs: MacdRequest[]) => xs.length ? Math.round((xs.filter(r => r.sla === 'Met').length / xs.length) * 100) : 100;
  const sites: MacdSite[] = [...new Set(reqs.map(r => r.dcId))].map(id => {
    const rs = reqs.filter(r => r.dcId === id), o = rs.filter(r => open.includes(r)), d = rs.filter(r => done30.includes(r));
    return { dcId: id, name: db.datacenters.find(x => x.id === id)?.name ?? id, open: o.length, atRisk: o.filter(r => r.sla === 'At risk').length, breached: o.filter(r => r.sla === 'Breached').length, done30: d.length, onTimePct: onTime(d), avgCycleH: cyc(d),
      kwPending: Math.round(o.reduce((s, r) => s + Math.max(0, r.kwDelta), 0) * 10) / 10, uPending: o.reduce((s, r) => s + Math.max(0, r.uDelta), 0) };
  }).sort((a, b) => b.breached - a.breached || b.atRisk - a.atRisk || b.open - a.open);
  const day0 = new Date(now); day0.setHours(0, 0, 0, 0);
  const trend = Array.from({ length: 14 }, (_, i) => { const day = day0.getTime() - (13 - i) * DAY; return { day, opened: reqs.filter(r => r.stage !== 'Draft' && r.created >= day && r.created < day + DAY).length, done: reqs.filter(r => r.completedAt && r.completedAt >= day && r.completedAt < day + DAY).length }; });
  const kinds: MacdKind[] = ['Move', 'Add', 'Change', 'Disconnect'];
  const catalog: MacdCatalogItem[] = catFor(db).filter(c => c.object !== 'GPU nodes' || hasGpu(db)).map(({ nrcR: _n, mrcR: _m, who: _w, w: _ww, risk: _r, cr: _c, ...c }) => {
    const p = priceOf(db, catById(c.id)!), d = done30.filter(r => r.catalogId === c.id);
    return { ...c, nrc: p.nrc, mrc: p.mrc, uses30: reqs.filter(r => r.stage !== 'Draft' && r.catalogId === c.id && r.created > now - 30 * DAY).length, avgCycleH: d.length ? cyc(d) : undefined, onTimePct: d.length ? onTime(d) : undefined };
  });
  const ftr = done30.filter(r => r.firstTimeRight !== undefined);
  view = {
    now, requests: reqs, catalog, sites,
    metrics: {
      open: open.length, atRisk: open.filter(r => r.sla === 'At risk').length, breached: open.filter(r => r.sla === 'Breached').length, done30: done30.length, onTimePct: onTime(done30),
      ftrPct: ftr.length ? Math.round((ftr.filter(r => r.firstTimeRight).length / ftr.length) * 100) : 100, avgCycleH: cyc(done30),
      nrc30: done30.reduce((s, r) => s + r.nrc, 0), mrc30: done30.reduce((s, r) => s + r.mrcDelta, 0),
      byStage: STAGES.filter(s => s !== 'Completed').map(stage => ({ stage, n: open.filter(r => r.stage === stage).length })),
      byKind: kinds.map(kind => ({ kind, open: open.filter(r => r.kind === kind).length, done30: done30.filter(r => r.kind === kind).length, avgCycleH: cyc(done30.filter(r => r.kind === kind)) })),
      trend, pipelineKw: Math.round(open.reduce((s, r) => s + Math.max(0, r.kwDelta), 0) * 10) / 10, pipelineU: open.reduce((s, r) => s + Math.max(0, r.uDelta), 0)
    }
  };
  viewDb = db; return view;
}

/* the request's own timeline, derived from its dates and stage */
function historyOf(b: Base, c: CatDef): { at: number; by: string; text: string }[] {
  if (!b.seeded) return [];
  if (b.stage === 'Draft') return [{ at: b.created, by: b.requester, text: 'Saved as a draft; not submitted yet' }];
  const h: { at: number; by: string; text: string }[] = [{ at: b.created, by: b.requester, text: `Submitted through ${b.channel === 'Internal' ? 'the internal request form' : b.channel.toLowerCase()} (${b.priority.toLowerCase()})` }];
  const s = si(b.stage), span = (b.completedAt ?? b.due) - b.created;
  const at = (f: number) => Math.min(b.created + span * f, b.completedAt ?? Infinity);
  if (s >= 1 || b.stage === 'Rejected') h.push({ at: at(0.05), by: b.owner, text: 'Picked up; feasibility checks run' });
  if (b.stage === 'Rejected') h.push({ at: at(0.15), by: b.owner, text: `Rejected: ${b.reason}` });
  if (s >= 3 && b.billable) h.push({ at: at(0.25), by: b.requester, text: 'Quote accepted' });
  if (s >= 3 && b.changeId) h.push({ at: at(0.3), by: c.standard ? 'Pre-approved' : 'Change manager', text: `${b.changeId} ${c.standard ? 'raised as a standard change' : 'approved'}; window ${fmtDateTime(b.window!.start)}` });
  if (s >= 4) h.push({ at: b.window!.start, by: b.owner, text: `Work started (${b.workRef})` });
  if (s >= 5) h.push({ at: Math.min(b.window!.end, b.completedAt ?? Infinity), by: b.owner, text: 'Work done; verification' });
  if (b.stage === 'Completed') h.push({ at: b.completedAt!, by: b.owner, text: `Verified and closed${b.firstTimeRight === false ? ' after re-work' : ''}; records ${b.billable ? 'and billing ' : ''}updated` });
  if (b.stage === 'Cancelled') h.push({ at: at(0.2), by: b.requester, text: `Cancelled: ${b.reason}` });
  return h;
}

/* ------------------------------------------------------------------ a new request (validated; the server raises the side effects) */
export function macdNewBase(db: Db, d: import('../api/types').MacdDraft, by: string, draft = false): Base {
  const b = macdDraftBase(db, d, by, `MACD-${String(seed(db).length + ov.seq + 1).padStart(4, '0')}`);
  if (draft) { b.stage = 'Draft'; b.history = [{ at: db.now, by, text: 'Saved as a draft; not submitted yet' }]; }
  ov.seq++; ov.created.push(b); view = null;
  return b;
}
/* the request a draft would become (no side effects): the New request form previews its checks and charges with it */
export function macdDraftBase(db: Db, d: import('../api/types').MacdDraft, by: string, id = 'MACD-NEW'): Base {
  const c = catById(d.catalogId); if (!c) throw new Error('Pick a request type from the catalogue');
  if (!catFor(db).includes(c)) throw new Error(`${c.name} is not offered for this business model`);
  const dc = db.datacenters.find(x => x.id === d.dcId); if (!dc) throw new Error('Pick a datacenter');
  if (dc.status !== 'on-air') throw new Error(`${dc.id} is not in service yet`);
  const needsRack = c.object !== 'IP addresses' && c.object !== 'Access';
  const rack = dc.racks.find(r => r.id === d.rackId);
  if (needsRack && !rack) throw new Error('Pick the rack or cabinet');
  const to = dc.racks.find(r => r.id === d.toRackId);
  if (c.kind === 'Move' && c.object !== 'GPU nodes' && !to) throw new Error('Pick where it moves to');
  if (c.kind === 'Move' && to && rack && to.id === rack.id && c.object !== 'Equipment') throw new Error('The target must be another rack');
  if (!(d.qty >= 1 && d.qty <= 50)) throw new Error('Quantity must be 1–50');
  const custId = d.customerId || rack?.tenantId;
  const cust = db.customers.find(x => x.id === custId);
  const billable = !!cust && (c.nrcR !== 0 || c.mrcR !== 0);
  const p = priceOf(db, c), { uDelta, kwDelta } = deltas(c, d.qty);
  const neIds = c.kind !== 'Add' && c.object === 'Equipment' && rack ? db.nes.filter(n => n.rackId === rack.id).slice(0, d.qty).map(n => n.id) : [];
  const b: Base = { id, kind: c.kind, object: c.object, catalogId: c.id, title: titleOf(c, d.qty, rack, to, cust, c.object === 'Cross-connect' ? 'Carrier POP · MMR panel 3' : undefined), detail: d.detail.trim() || c.desc, seeded: false,
    dcId: dc.id, room: rack?.room, rackId: rack?.id, rackName: rack?.name, toRackId: to?.id, toRackName: to?.name, neIds, customerId: cust?.id, customerName: cust?.name,
    requester: by, owner: by, channel: d.channel ?? (cust ? 'Account manager' : 'Internal'), priority: d.priority, stage: 'Feasibility', created: db.now, due: db.now + slaHours(c, d.priority) * HOUR,
    qty: d.qty, unit: c.unit, uDelta, kwDelta, nrc: billable ? p.nrc * (c.unit === 'kW' ? 1 : d.qty) : 0, mrcDelta: billable ? p.mrc * (c.unit === 'kW' ? Math.abs(kwDelta) : d.qty) : 0, billable,
    history: [{ at: db.now, by, text: `Submitted (${d.priority.toLowerCase()}); feasibility checks run` }] };
  return b;
}
export const macdRiskOf = (id: string) => catById(id)?.risk ?? 'Low';
export const macdCrTitle = (b: { catalogId: string; title: string; id: string }) => `${catById(b.catalogId)?.cr ?? 'MACD'}: ${b.title} (${b.id})`;
