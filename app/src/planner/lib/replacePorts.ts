/**
 * Ports — does the new equipment plug into what the old equipment used?
 *
 *  - Network refresh: a port map per switch. Every used old port (from cables, else NMS
 *    interfaces that are up, else every enabled interface, said so) gets a compatible port on
 *    the new model (from its component templates, else the vendor datasheet profile). Uplinks
 *    moving from 40G to 100G change the far end too (spine ports and optics). Optics follow the
 *    port map: reuse where the form factor and speed allow, DAC and AOC kept apart.
 *  - Server refresh: the new servers' NICs against the leaf ports the old servers free and the
 *    free ports left on those leaves.
 */
import type * as T from '../p2b/types';
import { byId, groupBy, type PlannerData } from './plannerData';

export type PortClass = 'RJ45' | 'SFP' | 'SFP+' | 'SFP28' | 'QSFP+' | 'QSFP28' | 'QSFP-DD';
export interface PortSpec { name: string; cls: PortClass; speedMbps: number; mgmt?: boolean }
const CLASS_SPEED: Record<PortClass, number> = { RJ45: 1000, SFP: 1000, 'SFP+': 10000, SFP28: 25000, 'QSFP+': 40000, QSFP28: 100000, 'QSFP-DD': 400000 };
export function classOf(ifaceType?: string, speedMbps?: number, name?: string): PortClass {
  const t = (ifaceType ?? '').toUpperCase();
  if (/QSFP-?DD|OSFP/.test(t)) return 'QSFP-DD'; if (/QSFP28/.test(t)) return 'QSFP28'; if (/QSFP\+|QSFP(?!2)/.test(t)) return 'QSFP+';
  if (/SFP28/.test(t)) return 'SFP28'; if (/SFP\+/.test(t)) return 'SFP+'; if (/BASE-T|RJ45/.test(t) || /mgmt|management|idrac|ilo|bmc/i.test(name ?? '')) return 'RJ45'; if (/SFP/.test(t)) return 'SFP';
  const s = speedMbps ?? 0;
  return s >= 400000 ? 'QSFP-DD' : s >= 100000 ? 'QSFP28' : s >= 40000 ? 'QSFP+' : s >= 25000 ? 'SFP28' : s >= 10000 ? 'SFP+' : 'RJ45';
}
/** New port classes that take an old port, best first. */
const ACCEPTS: Record<PortClass, PortClass[]> = { RJ45: ['RJ45', 'SFP'], SFP: ['SFP', 'SFP+', 'SFP28'], 'SFP+': ['SFP+', 'SFP28'], SFP28: ['SFP28'], 'QSFP+': ['QSFP+', 'QSFP28'], QSFP28: ['QSFP28', 'QSFP-DD'], 'QSFP-DD': ['QSFP-DD'] };

/** Vendor datasheet port profiles, used when the model has no component templates in DCIM. */
const DATASHEET: Record<string, [string, number, PortClass, boolean?][]> = {
  '7050X3-48YC8': [['Ethernet{1-48}', 48, 'SFP28'], ['Ethernet{49-56}', 8, 'QSFP28'], ['Management1', 1, 'RJ45', true]],
  'QFX5120-48Y': [['et-0/0/{0-47}', 48, 'SFP28'], ['et-0/0/{48-55}', 8, 'QSFP28'], ['em0', 1, 'RJ45', true]],
  'Nexus 9336C-FX2': [['Ethernet1/{1-36}', 36, 'QSFP28'], ['mgmt0', 1, 'RJ45', true]],
  'Catalyst 9300-48P': [['GigabitEthernet1/0/{1-48}', 48, 'RJ45'], ['TenGigabitEthernet1/1/{1-4}', 4, 'SFP+'], ['GigabitEthernet0/0', 1, 'RJ45', true]],
  'Nexus 3172PQ': [['Ethernet1/{1-48}', 48, 'SFP+'], ['Ethernet1/{49-54}', 6, 'QSFP+'], ['mgmt0', 1, 'RJ45', true]],
  'QFX5100-48S': [['xe-0/0/{0-47}', 48, 'SFP+'], ['et-0/0/{48-53}', 6, 'QSFP+'], ['em0', 1, 'RJ45', true]],
  'MX480': [['et-1/0/{0-7}', 8, 'QSFP28'], ['xe-2/0/{0-15}', 16, 'SFP+'], ['fxp0', 1, 'RJ45', true]],
  'ASR 9006': [['HundredGigE0/0/0/{0-7}', 8, 'QSFP28'], ['TenGigE0/1/0/{0-15}', 16, 'SFP+'], ['MgmtEth0', 1, 'RJ45', true]],
  'PA-5450': [['ethernet1/{1-8}', 8, 'SFP28'], ['ethernet1/{9-12}', 4, 'QSFP28'], ['mgmt', 1, 'RJ45', true]],
  'PowerEdge R760': [['eno{1-4}', 4, 'SFP28'], ['idrac', 1, 'RJ45', true]],
  'ProLiant DL380 Gen11': [['eno{1-4}', 4, 'SFP28'], ['ilo', 1, 'RJ45', true]],
  'PowerEdge XE9680': [['ens{1-2}', 2, 'QSFP28'], ['gpu{1-8}', 8, 'QSFP-DD'], ['idrac', 1, 'RJ45', true]],
  'DGX H100': [['ens{1-2}', 2, 'QSFP28'], ['ib{1-8}', 8, 'QSFP-DD'], ['bmc', 1, 'RJ45', true]],
  'SYS-821GE GPU SuperServer': [['ens{1-2}', 2, 'QSFP28'], ['gpu{1-8}', 8, 'QSFP-DD'], ['bmc', 1, 'RJ45', true]],
  'FlashArray //X70': [['ct0.eth{1-4}', 4, 'SFP28'], ['ct0.mgmt', 2, 'RJ45', true]],
  'AFF A400': [['e0{a-d}', 4, 'QSFP28'], ['e0M', 2, 'RJ45', true]],
};
function expand(pattern: string, count: number): string[] {
  const m = /^(.*)[[{](\d+)-(\d+)[\]}](.*)$/.exec(pattern);
  if (m) { const a = Number(m[2]); return Array.from({ length: Math.max(0, Math.min(count, Number(m[3]) - a + 1)) }, (_, i) => `${m[1]}${a + i}${m[4]}`); }
  return Array.from({ length: count }, (_, i) => (count > 1 ? `${pattern}${i + 1}` : pattern));
}
interface ExtraData { componentTemplates?: T.ComponentTemplate[]; deviceTypes?: T.DcimDeviceType[] }
/** The port set of a model: DCIM component templates first, else the datasheet profile. */
export function modelPorts(data: PlannerData, model: string): { ports: PortSpec[]; source: 'templates' | 'datasheet' | 'none' } {
  const x = data as unknown as ExtraData;
  const dt = x.deviceTypes?.find(t => t.model === model);
  const tpl = dt ? (x.componentTemplates ?? []).filter(t => t.deviceTypeId === dt.id && t.kind === 'interface') : [];
  // Templates whose speeds disagree with the form factor are not trusted (e.g. 400G on SFP+ names).
  const sane = tpl.filter(t => { const c = classOf(t.ifaceType, t.speedMbps, t.namePattern); return !t.speedMbps || t.speedMbps <= CLASS_SPEED[c] * 1.01; });
  if (tpl.length && sane.length === tpl.length) {
    const ports = tpl.flatMap(t => { const n = /\[(\d+)-(\d+)\]/.exec(t.namePattern); const count = n ? Number(n[2]) - Number(n[1]) + 1 : 1; const cls = classOf(t.ifaceType, t.speedMbps, t.namePattern); return expand(t.namePattern, count).map(name => ({ name, cls, speedMbps: t.speedMbps ?? CLASS_SPEED[cls], mgmt: t.mgmtOnly || cls === 'RJ45' && /mgmt|management/i.test(name) })); });
    return { ports, source: 'templates' };
  }
  const ds = DATASHEET[model];
  if (ds) return { ports: ds.flatMap(([pat, count, cls, mgmt]) => expand(pat, count).map(name => ({ name, cls, speedMbps: CLASS_SPEED[cls], mgmt }))), source: 'datasheet' };
  return { ports: [], source: 'none' };
}

export interface UsedPort { compId: string; name: string; cls: PortClass; speedMbps: number; mgmt: boolean; cable?: T.Cable; farDeviceId?: string; farPort?: string; media: 'optic' | 'dac' | 'copper' | 'unknown'; basis: 'cable' | 'nms' | 'assumed' }
/** Ports in use on a device: cabled, else up in NMS, else every enabled interface (assumed). */
export function usedPorts(data: PlannerData, deviceId: string): UsedPort[] {
  const comps = (groupBy(data, 'deviceComponents', 'deviceId').get(deviceId) ?? []).filter(c => c.kind === 'interface');
  const cables = [...(groupBy(data, 'cables', 'aDeviceId').get(deviceId) ?? []), ...(groupBy(data, 'cables', 'bDeviceId').get(deviceId) ?? [])].filter(c => c.status !== 'Decommissioning');
  const byComp = new Map<string, T.Cable>(); for (const c of cables) { byComp.set(c.aDeviceId === deviceId ? c.aComponentId : c.bComponentId, c); }
  const nms = new Map((groupBy(data, 'interfaces', 'deviceId').get(deviceId) ?? []).map(i => [i.name, i]));
  const basis: UsedPort['basis'] = byComp.size ? 'cable' : nms.size ? 'nms' : 'assumed';
  const media = (c?: T.Cable): UsedPort['media'] => !c ? 'unknown' : c.cableType === 'DAC' ? 'dac' : /MMF|SMF/.test(c.cableType) ? 'optic' : 'copper';
  return comps.filter(c => basis === 'cable' ? byComp.has(c.id) : basis === 'nms' ? nms.get(c.name)?.operStatus === 'Up' : c.enabled !== false).map(c => {
    const cable = byComp.get(c.id); const far = cable ? (cable.aDeviceId === deviceId ? { d: cable.bDeviceId, p: cable.bComponentId } : { d: cable.aDeviceId, p: cable.aComponentId }) : undefined;
    const cls = classOf(c.ifaceType, c.speedMbps, c.name);
    return { compId: c.id, name: c.name, cls, speedMbps: c.speedMbps ?? CLASS_SPEED[cls], mgmt: !!c.mgmtOnly || (cls === 'RJ45' && /mgmt|management|idrac|ilo|bmc/i.test(c.name)) || c.speedMbps === 1000 && /Management|mgmt/i.test(c.name), cable, farDeviceId: far?.d, farPort: far ? data.deviceComponents.find(x => x.id === far.p)?.name : undefined, media: media(cable), basis };
  });
}

export interface PatchRow { deviceId: string; oldPort: string; oldCls: PortClass; oldSpeed: number; newPort?: string; newCls?: PortClass; newSpeed?: number; farDeviceId?: string; farPort?: string; optic: 'reuse' | 'new' | 'dac-reuse' | 'dac-new' | 'copper' | 'none'; farEndChange: boolean; mgmt: boolean; note: string }
export interface DevicePortMap { deviceId: string; newModel: string; source: 'templates' | 'datasheet' | 'none'; basis: UsedPort['basis']; rows: PatchRow[]; incompatible: PatchRow[]; spare: number }
export interface PortMap { devices: DevicePortMap[]; incompatible: number; used: number; assumed: number; farEnd: PatchRow[]; optics: { cls: PortClass; reuse: number; buy: number }[]; dac: { cls: PortClass; reuse: number; buy: number }[]; farOptics: { cls: PortClass; buy: number }[]; noProfile: string[] }

/**
 * Port map for a network refresh. `upgradeUplinks` moves 40G uplinks to 100G (new optics at
 * both ends and a far-end port change); otherwise they run at 40G in the new QSFP28 ports.
 */
export function networkPortMap(data: PlannerData, devices: { id: string; newModel: string }[], opts: { upgradeUplinks: boolean; reusePct: number }): PortMap {
  const out: DevicePortMap[] = []; const noProfile = new Set<string>();
  for (const { id, newModel } of devices) {
    const used = usedPorts(data, id); const prof = modelPorts(data, newModel);
    if (prof.source === 'none') noProfile.add(newModel);
    const pool = new Map<PortClass, PortSpec[]>(); for (const p of prof.ports) pool.set(p.cls, [...(pool.get(p.cls) ?? []), p]);
    const rows: PatchRow[] = [];
    for (const u of [...used].sort((a, b) => Number(a.mgmt) - Number(b.mgmt) || CLASS_SPEED[b.cls] - CLASS_SPEED[a.cls])) {
      const want = u.mgmt ? ['RJ45' as PortClass] : ACCEPTS[u.cls];
      let pick: PortSpec | undefined;
      for (const c of want) { const list = (pool.get(c) ?? []).filter(p => !!p.mgmt === u.mgmt || !u.mgmt && !p.mgmt); if (list.length) { pick = list[0]; pool.set(c, (pool.get(c) ?? []).filter(p => p !== pick)); break; } }
      if (!pick && u.mgmt) { const list = pool.get('RJ45') ?? []; pick = list[0]; if (pick) pool.set('RJ45', list.slice(1)); }
      const upgrade = !!pick && !u.mgmt && u.cls === 'QSFP+' && pick.cls === 'QSFP28' && opts.upgradeUplinks;
      const newSpeed = pick ? (upgrade ? pick.speedMbps : Math.min(pick.speedMbps, u.speedMbps)) : undefined;
      const sameOptic = !!pick && (pick.cls === u.cls || (u.cls === 'SFP+' && pick.cls === 'SFP28') || (u.cls === 'QSFP+' && pick.cls === 'QSFP28' && !upgrade));
      const optic: PatchRow['optic'] = !pick || u.mgmt ? (u.mgmt ? 'copper' : 'none') : u.media === 'copper' ? 'copper' : u.media === 'dac' ? (sameOptic ? 'dac-reuse' : 'dac-new') : sameOptic ? 'reuse' : 'new';
      rows.push({ deviceId: id, oldPort: u.name, oldCls: u.cls, oldSpeed: u.speedMbps, newPort: pick?.name, newCls: pick?.cls, newSpeed, farDeviceId: u.farDeviceId, farPort: u.farPort, optic, farEndChange: upgrade, mgmt: u.mgmt,
        note: !pick ? `no ${ACCEPTS[u.cls].join(' or ')} port left on ${newModel}` : upgrade ? `uplink moves from ${u.speedMbps / 1000}G to ${pick.speedMbps / 1000}G: far end changes` : u.cls !== pick.cls ? `${u.cls} optic runs at ${(newSpeed ?? 0) / 1000}G in a ${pick.cls} port` : '' });
    }
    out.push({ deviceId: id, newModel, source: prof.source, basis: used[0]?.basis ?? 'assumed', rows, incompatible: rows.filter(r => !r.newPort), spare: [...pool.values()].reduce((a, l) => a + l.filter(p => !p.mgmt).length, 0) });
  }
  const all = out.flatMap(d => d.rows).filter(r => !r.mgmt && r.newPort);
  const tally = (pred: (r: PatchRow) => boolean, clsOf: (r: PatchRow) => PortClass) => { const m = new Map<PortClass, number>(); for (const r of all.filter(pred)) m.set(clsOf(r), (m.get(clsOf(r)) ?? 0) + 1); return m; };
  const reusable = tally(r => r.optic === 'reuse', r => r.oldCls); const newOpt = tally(r => r.optic === 'new' || r.optic === 'none' && !!r.newPort, r => r.newCls!);
  const dacReuse = tally(r => r.optic === 'dac-reuse', r => r.oldCls); const dacNew = tally(r => r.optic === 'dac-new', r => r.newCls!);
  const classes = [...new Set([...reusable.keys(), ...newOpt.keys()])];
  const pct = Math.max(0, Math.min(100, opts.reusePct)) / 100;
  const optics = classes.map(cls => { const ru = Math.floor((reusable.get(cls) ?? 0) * pct); return { cls, reuse: ru, buy: (newOpt.get(cls) ?? 0) + (reusable.get(cls) ?? 0) - ru }; }).filter(o => o.reuse + o.buy > 0);
  const dac = [...new Set([...dacReuse.keys(), ...dacNew.keys()])].map(cls => ({ cls, reuse: dacReuse.get(cls) ?? 0, buy: dacNew.get(cls) ?? 0 }));
  const farEnd = all.filter(r => r.farEndChange);
  const farOptics = [...tally(r => r.farEndChange, r => r.newCls!).entries()].map(([cls, buy]) => ({ cls, buy }));
  return { devices: out, incompatible: out.reduce((a, d) => a + d.incompatible.length, 0), used: all.length, assumed: out.filter(d => d.basis === 'assumed').length, farEnd, optics, dac, farOptics, noProfile: [...noProfile] };
}

/* ================================================================== server NICs */
export interface NicFit { status: 'pass' | 'warn' | 'fail' | 'n/a'; detail: string; perClass: { cls: PortClass; freed: number; needed: number; leafFree?: number }[]; leafIds: string[]; dacPorts: number }
/** New servers' data ports against the leaf ports the old ones free and the free ports on those leaves. */
export function serverNicFit(data: PlannerData, oldIds: string[], units: { model: string; count: number }[]): NicFit {
  const freed = new Map<PortClass, number>(); const leaves = new Set<string>();
  for (const id of oldIds) {
    for (const u of usedPorts(data, id).filter(x => !x.mgmt)) freed.set(u.cls, (freed.get(u.cls) ?? 0) + 1);
    for (const c of [...(groupBy(data, 'cables', 'aDeviceId').get(id) ?? []), ...(groupBy(data, 'cables', 'bDeviceId').get(id) ?? [])]) { const far = c.aDeviceId === id ? c.bDeviceId : c.aDeviceId; if (byId(data, 'devices', far)?.category === 'Switch') leaves.add(far); }
  }
  if (!leaves.size) for (const s of data.services) if (s.pathDeviceIds?.some(d => oldIds.includes(d))) for (const d of s.pathDeviceIds) if (byId(data, 'devices', d)?.category === 'Switch') leaves.add(d);
  const needed = new Map<PortClass, number>(); let missing = '';
  for (const u of units) { const prof = modelPorts(data, u.model); if (prof.source === 'none') missing = u.model; for (const p of prof.ports.filter(x => !x.mgmt)) needed.set(p.cls, (needed.get(p.cls) ?? 0) + u.count); }
  const leafFree = new Map<PortClass, number>();
  for (const l of leaves) {
    const used = new Set(usedPorts(data, l).filter(u => u.basis !== 'assumed').map(u => u.compId));
    for (const c of (groupBy(data, 'deviceComponents', 'deviceId').get(l) ?? []).filter(c => c.kind === 'interface' && !used.has(c.id) && !c.mgmtOnly)) { const cls = classOf(c.ifaceType, c.speedMbps, c.name); leafFree.set(cls, (leafFree.get(cls) ?? 0) + 1); }
  }
  const classes = [...new Set([...freed.keys(), ...needed.keys()])];
  const perClass = classes.map(cls => ({ cls, freed: freed.get(cls) ?? 0, needed: needed.get(cls) ?? 0, leafFree: leaves.size ? ACCEPTS[cls].reduce((a, c) => a + (leafFree.get(c) ?? 0), 0) : undefined }));
  const dacPorts = [...needed.entries()].filter(([c]) => c === 'SFP28' || c === 'QSFP28').reduce((a, [, n]) => a + n, 0);
  if (missing) return { status: 'n/a', detail: `No port profile for ${missing}; NIC fit not checked`, perClass, leafIds: [...leaves], dacPorts };
  const short = perClass.filter(p => p.needed > p.freed && (p.leafFree === undefined || p.needed - p.freed > p.leafFree));
  const net = perClass.reduce((a, p) => a + p.needed - p.freed, 0);
  if (!leaves.size) return { status: net > 0 ? 'warn' : 'pass', detail: net > 0 ? `New servers need ${net} more data ports than the old ones free; no leaf switch is recorded for them (cables or service paths), so free leaf ports are not checked` : `New servers use ${-net} fewer data ports than the old ones free (same classes)`, perClass, leafIds: [], dacPorts };
  if (short.length) return { status: 'fail', detail: short.map(p => `${p.needed} × ${p.cls} needed, ${p.freed} freed, ${p.leafFree ?? 0} free on the ${leaves.size} leaf switch${leaves.size === 1 ? '' : 'es'}`).join('; '), perClass, leafIds: [...leaves], dacPorts };
  return { status: 'pass', detail: perClass.map(p => `${p.cls}: ${p.needed} needed, ${p.freed} freed${p.needed > p.freed ? `, ${p.leafFree} free on the leaves` : ''}`).join('; '), perClass, leafIds: [...leaves], dacPorts };
}
