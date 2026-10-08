/* Device digital twin — one scene per view and device family. Layout is in SVG user units (1000 wide);
   the renderer scales it. Every part's state comes from the device record: modules (PSU / fan / card / disk /
   GPU), interfaces (state, errors, flaps, optics, peer), host and GPU telemetry, and the rack it sits in. */
import type { Interface } from '../../../api/types';
import type { GpuNodeRow } from '../../../mock/gpu-view';
import type { NeData } from '../NetworkElement';
import { gpuSpec } from '../../../lib/gpuSpec';
import { fmtNum } from '../../../lib/format';
import { fmtSpeed, hostCpuOf, ifState, modState, siliconOf, worstOf, type Group, type Info, type Kind, type Part, type PState, type Scene, type View } from './model';

export interface Ctx { d: NeData; gpu: GpuNodeRow | null; chip: number }
type Mod = NeData['ne']['modules'][number];

const short = (id: string) => id.replace(/^[A-Z]{2}-DC-\d{3}-/, '');
const isPsu = (m: Mod) => /^(PSU|PEM)/.test(m.slot);
const isFan = (m: Mod) => /^FAN/.test(m.slot);
const isCard = (m: Mod) => /^(FPC|MPC|LC|CARD)/.test(m.slot);
const isCtl = (m: Mod) => /^(RE|CPM|SUP|CTRL)/.test(m.slot);

function modInfo(m: Mod, kind: Kind, extra: [string, string][] = []): Info {
  return { title: `${m.slot} · ${m.name}`, kind, state: modState(m.state), rows: [['Slot', m.slot], ['Module', m.name], ['Serial', m.serial], ['Temperature', `${m.tempC}°C`], ['State', m.state], ...extra],
    note: m.state === 'Fault' ? 'The module reports a fault. The chassis runs on its redundant partner — replace it before the partner is lost.' : undefined };
}
function portInfo(i: Interface): Info {
  const st = ifState(i);
  return {
    title: i.name, kind: i.name.startsWith('mgmt') || i.speedMbps <= 1000 ? 'mgmt' : 'network', state: st,
    rows: [['Type', i.type], ['Speed', fmtSpeed(i.speedMbps) + 'b/s'], ['State', i.state], ['Utilisation', i.state === 'up' ? `${i.utilPct}%` : '—'],
      ['Errors in · CRC', `${fmtNum(i.inErrors)} · ${fmtNum(i.crcErrors)}`], ['Flaps · 24 h', String(i.flaps24h)],
      ...(i.optics ? [['Optic', `${i.optics.model} · Rx ${i.optics.rxDbm} dBm · Tx ${i.optics.txDbm} dBm · ${i.optics.tempC}°C`] as [string, string]] : []),
      ...(i.peer ? [['Connected to', `${short(i.peer.neId)} ${i.peer.ifName}`] as [string, string]] : []), ...(i.description ? [['Description', i.description] as [string, string]] : [])],
    note: st === 'bad' ? 'Link is down — check the optic, the cable and the far end.' : st === 'warn' ? 'Errors or flaps in the last 24 h — a dirty connector or a failing optic is the usual cause.' : undefined,
    to: i.peer ? { href: `/ne/${encodeURIComponent(i.peer.neId)}`, label: `Open ${short(i.peer.neId)}` } : undefined
  };
}

/* ports in two rows (odd numbers on top, like a real faceplate) */
function portBank(ifs: Interface[], x: number, y: number, w: number, h: number, maxPw = 30): Part[] {
  if (!ifs.length) return [];
  const rows = ifs.length > 8 ? 2 : 1, cols = Math.ceil(ifs.length / rows), gap = 4;
  const pw = Math.min(maxPw, (w - gap * (cols - 1)) / cols), ph = Math.min(h / rows - gap, pw * 0.8 + 6);
  const x0 = x + (w - (cols * pw + (cols - 1) * gap)) / 2, y0 = y + Math.max(0, (h - rows * ph - (rows - 1) * gap) / 2);
  return ifs.map((i, k) => {
    const c = rows === 2 ? Math.floor(k / 2) : k, r = rows === 2 ? k % 2 : 0;
    return { id: `if:${i.name}`, kind: 'network', shape: 'port', x: x0 + c * (pw + gap), y: y0 + r * (ph + gap), w: pw, h: ph, state: ifState(i), info: portInfo(i), fill: i.state === 'up' ? i.utilPct / 100 : 0 };
  });
}
const portSummary = (ifs: Interface[]) => {
  const by = new Map<string, number>(); ifs.forEach(i => by.set(i.type, (by.get(i.type) ?? 0) + 1));
  return [...by.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} × ${t}`);
};
function fans(n: number, m: Mod | undefined, x: number, y: number, w: number, r: number, vertical = false, label = 'Fan'): Part[] {
  const st = modState(m?.state ?? 'OK');
  return Array.from({ length: n }, (_, k) => {
    const step = (vertical ? w : w) / n;
    const cx = vertical ? x : x + step * k + step / 2, cy = vertical ? y + step * k + step / 2 : y;
    return { id: `fan:${k}`, kind: 'cooling', shape: 'circle', x: cx - r, y: cy - r, w: r * 2, h: r * 2, state: st,
      info: m ? modInfo(m, 'cooling', [['Fan', `${label} ${k + 1} of ${n}`]]) : { title: `${label} ${k + 1}`, kind: 'cooling', state: 'ok', rows: [['Fan', `${k + 1} of ${n}`]] } };
  });
}
const arrow = (x1: number, y1: number, x2: number, y2: number, cls: string, key: string) => <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} className={`dt-arrow ${cls}`} markerEnd={`url(#dt-ah-${cls})`} />;

/* ------------------------------------------------------------------------------------------- network gear */

function faceNetwork({ d }: Ctx): Scene {
  const { ne, interfaces: ifs } = d;
  const mgmt = ifs.filter(i => i.speedMbps <= 1000), data = ifs.filter(i => i.speedMbps > 1000);
  const psus = ne.modules.filter(isPsu), fan = ne.modules.find(isFan), cards = ne.modules.filter(isCard), ctl = ne.modules.find(isCtl);
  const groups: Group[] = [{ x: 20, y: 34, w: 960, h: 186, label: `Front panel · ${ne.vendor} ${ne.model} · ${ne.uSize ?? 1}U`, dark: true },
    { x: 20, y: 266, w: 960, h: 150, label: 'Rear · power and cooling', dark: true }];
  const parts: Part[] = [];
  const sys = worstOf([...ne.modules.map(m => modState(m.state)), ne.icmp.state === 'critical' ? 'bad' : 'ok']);
  /* left: control card + management */
  let x = 40;
  if (ctl) { parts.push({ id: `mod:${ctl.slot}`, kind: 'compute', x, y: 62, w: 120, h: 70, label: ctl.slot, sub: ctl.name, state: modState(ctl.state), info: modInfo(ctl, 'compute', [['CPU', `${ne.cpu}%`], ['Memory', `${ne.mem}%`]]) }); }
  else parts.push({ id: 'sys', kind: 'compute', x, y: 62, w: 120, h: 70, label: 'Control', sub: siliconOf(ne).cpu.split(' · ')[0], state: sys, info: { title: 'Control plane', kind: 'compute', state: sys, rows: [['CPU', `${ne.cpu}%`], ['Memory', `${ne.mem}%`], ['OS', ne.os], ['Uptime', `${Math.round(ne.uptimeMin / 1440)} days`]] } });
  parts.push(...['SYS', 'PSU', 'FAN'].map((l, k) => ({ id: `led:${l}`, kind: 'mgmt' as Kind, shape: 'led' as const, x: x + 6 + k * 40, y: 148, w: 10, h: 10, label: l, state: (l === 'SYS' ? sys : l === 'PSU' ? worstOf(psus.map(p => modState(p.state))) : modState(fan?.state)) as PState,
    info: { title: `${l} status LED`, kind: 'mgmt' as Kind, state: (l === 'SYS' ? sys : l === 'PSU' ? worstOf(psus.map(p => modState(p.state))) : modState(fan?.state)) as PState, rows: [['Meaning', l === 'SYS' ? 'Chassis health' : l === 'PSU' ? 'All power supplies' : 'Fan tray']] as [string, string][] } })));
  parts.push(...portBank(mgmt, x, 176, 120, 30, 26).map(p => ({ ...p, kind: 'mgmt' as Kind })));
  x = 180;
  /* data ports, inside the line card when the chassis has one */
  const bankW = 980 - x - 30;
  if (cards.length) {
    const c = cards[0];
    groups.push({ x: x - 6, y: 54, w: bankW + 12, h: 156, label: `${c.slot} · ${c.name}`, kind: 'network' });
    parts.push(...portBank(data, x + 4, 80, bankW - 8, 110, data.length <= 24 ? 56 : 34));
    parts.push({ id: `mod:${c.slot}`, kind: 'network', shape: 'led', x: x + bankW - 8, y: 60, w: 10, h: 10, state: modState(c.state), info: modInfo(c, 'network', [['Ports', String(data.length)]]) });
  } else parts.push(...portBank(data, x, 70, bankW, 130, data.length <= 24 ? 56 : 34));
  /* rear: PSUs + fans */
  psus.forEach((m, k) => parts.push({ id: `mod:${m.slot}`, kind: 'power', x: 44 + k * 190, y: 300, w: 170, h: 90, label: m.slot, sub: m.name, state: modState(m.state), info: modInfo(m, 'power', [['Feed', k % 2 ? 'B' : 'A']]) }));
  const fx = 44 + Math.max(2, psus.length) * 190 + 20;
  groups.push({ x: fx - 10, y: 290, w: 960 - fx + 10, h: 110, label: fan ? `${fan.slot} · ${fan.name}` : 'Fans', kind: 'cooling' });
  parts.push(...fans(6, fan, fx, 352, 960 - fx - 10, 22));
  const deco = <>{[120, 880].map(x2 => arrow(x2, 230, x2, 258, 'cool', `a${x2}`))}<text x={500} y={250} className="dt-note" textAnchor="middle">front-to-back airflow</text></>;
  return { w: 1000, h: 430, title: 'Front panel and rear', caption: `${data.length} data ports · ${mgmt.length} management · ${psus.length} power supplies`, chips: [...portSummary(ifs).slice(0, 3), `${psus.length} × PSU`], groups, parts, deco };
}

function insideNetwork(c: Ctx): Scene {
  const { ne, interfaces: ifs } = c.d;
  if (ne.role === 'DWDM') return insideOptical(c);
  const si = siliconOf(ne);
  const psus = ne.modules.filter(isPsu), fan = ne.modules.find(isFan);
  const groups: Group[] = [{ x: 20, y: 30, w: 960, h: 470, label: `${ne.model} · top view (front at the bottom)` }];
  const parts: Part[] = [];
  const st = worstOf([ne.icmp.state === 'critical' ? 'bad' : 'ok', ...ne.modules.filter(isCard).map(m => modState(m.state))]);
  const fw = ne.role === 'Firewall';
  /* forwarding silicon */
  if (fw) [0, 1, 2, 3].forEach(k => parts.push({ id: `np:${k}`, kind: 'compute', x: 300 + (k % 2) * 140, y: 180 + Math.floor(k / 2) * 90, w: 124, h: 76, label: `NP7 · ${k}`, sub: 'security processor', state: st, glow: true,
    info: { title: `NP7 network processor ${k}`, kind: 'compute', state: st, rows: [['Role', 'Firewall / VPN / NAT offload'], ['Load', `${Math.round(ne.cpu * 0.8)}%`]] } }));
  else parts.push({ id: 'asic', kind: 'compute', x: 330, y: 190, w: 260, h: 150, label: si.asic, sub: si.asicSub, state: st, glow: true, fill: ne.cpu / 100,
    info: { title: si.asic, kind: 'compute', state: st, rows: [['Silicon', si.asic], ['Capacity', si.asicSub], ['Ports served', String(ifs.filter(i => i.speedMbps > 1000).length)], ['Temperature', `${ne.tempC}°C`]] } });
  if (fw) parts.push({ id: 'cp9', kind: 'compute', x: 600, y: 200, w: 110, h: 60, label: 'CP9', sub: 'content / IPS', state: st, info: { title: 'CP9 content processor', kind: 'compute', state: st, rows: [['Role', 'IPS, app control, SSL inspection']] } });
  /* control plane: CPU + DRAM + SSD */
  const cpuSt: PState = ne.cpu >= 90 ? 'warn' : 'ok';
  parts.push({ id: 'cpu', kind: 'compute', x: 60, y: 200, w: 150, h: 70, label: 'Control CPU', sub: si.cpu, state: cpuSt, fill: ne.cpu / 100, info: { title: 'Control-plane CPU', kind: 'compute', state: cpuSt, rows: [['Processor', si.cpu], ['CPU', `${ne.cpu}%`], ['OS', ne.os]] } });
  parts.push({ id: 'dram', kind: 'memory', x: 60, y: 284, w: 70, h: 46, label: 'DRAM', state: ne.mem >= 90 ? 'warn' : 'ok', fill: ne.mem / 100, info: { title: 'System memory', kind: 'memory', state: ne.mem >= 90 ? 'warn' : 'ok', rows: [['Used', `${ne.mem}%`]] } });
  parts.push({ id: 'ssd', kind: 'storage', x: 140, y: 284, w: 70, h: 46, label: 'SSD', state: 'ok', info: { title: 'Boot SSD', kind: 'storage', state: 'ok', rows: [['Holds', `${ne.os} images, logs`]] } });
  /* front edge: port cages grouped by type */
  const types = [...new Set(ifs.map(i => i.type))];
  const cw = (900 - (types.length - 1) * 14) / Math.max(1, types.length);
  types.forEach((t, k) => {
    const on = ifs.filter(i => i.type === t), s = worstOf(on.map(ifState)), up = on.filter(i => i.state === 'up').length;
    const isMgmt = on.every(i => i.speedMbps <= 1000);
    parts.push({ id: `cage:${t}`, kind: isMgmt ? 'mgmt' : 'network', x: 50 + k * (cw + 14), y: 420, w: cw, h: 54, label: `${on.length} × ${t}`, sub: `${up} up · ${on.filter(i => i.state === 'down').length} down`, state: s,
      info: { title: `${t} cages`, kind: isMgmt ? 'mgmt' : 'network', state: s, rows: [['Ports', String(on.length)], ['Up', String(up)], ['Down', String(on.filter(i => i.state === 'down').length)], ['Disabled', String(on.filter(i => i.state === 'admin-down').length)], ['Average load', `${Math.round(on.filter(i => i.state === 'up').reduce((a, i) => a + i.utilPct, 0) / Math.max(1, up))}%`]] } });
  });
  /* rear edge: PSUs and fans */
  psus.forEach((m, k) => parts.push({ id: `mod:${m.slot}`, kind: 'power', x: 50 + k * 150, y: 56, w: 136, h: 70, label: m.slot, sub: m.name, state: modState(m.state), info: modInfo(m, 'power') }));
  const fx = 50 + Math.max(2, psus.length) * 150 + 20;
  parts.push(...fans(5, fan, fx, 92, 940 - fx, 24));
  const deco = <>
    {types.map((_, k) => <path key={k} className="dt-trace" d={`M ${460} ${fw ? 360 : 340} C ${460} 390, ${50 + k * (cw + 14) + cw / 2} 380, ${50 + k * (cw + 14) + cw / 2} 420`} />)}
    <path className="dt-trace" d="M 210 235 L 330 250" />
    {[250, 950].map(x2 => arrow(x2, 400, x2, 150, 'cool', `f${x2}`))}
    <text x={936} y={392} className="dt-note" textAnchor="end">cool air in at the front, out at the rear</text>
  </>;
  return { w: 1000, h: 510, title: 'Inside · top view', caption: `${si.asic} switching every port · control plane on ${si.cpu}`, chips: [si.asic, si.asicSub.split(' · ')[0], `${psus.length} × PSU`], groups, parts, deco };
}

function insideOptical({ d }: Ctx): Scene {
  const { ne, interfaces: ifs } = d;
  const si = siliconOf(ne), psus = ne.modules.filter(isPsu), fan = ne.modules.find(isFan);
  const groups: Group[] = [{ x: 20, y: 30, w: 960, h: 360, label: `${ne.model} · optical path (client side → line side)` }];
  const parts: Part[] = [];
  const clients = ifs.slice(0, 8);
  clients.forEach((i, k) => parts.push({ id: `if:${i.name}`, kind: 'network', shape: 'port', x: 50, y: 60 + k * 36, w: 70, h: 26, label: i.name, state: ifState(i), info: portInfo(i), fill: i.state === 'up' ? i.utilPct / 100 : 0 }));
  const tr = worstOf(clients.map(ifState));
  parts.push({ id: 'dsp', kind: 'compute', x: 200, y: 110, w: 200, h: 170, label: 'Transponder', sub: si.asic, state: tr, glow: true, info: { title: 'Coherent transponder', kind: 'compute', state: tr, rows: [['DSP', si.asic], ['Rate', si.asicSub], ['Clients mapped', String(clients.filter(i => i.state === 'up').length)]] } });
  parts.push({ id: 'mux', kind: 'network', x: 450, y: 120, w: 130, h: 150, label: 'Mux / Demux', sub: '96 ch · C-band', state: 'ok', info: { title: 'Wavelength mux / demux', kind: 'network', state: 'ok', rows: [['Grid', 'Flexible, 96 channels'], ['Channels lit', String(clients.filter(i => i.state === 'up').length)]] } });
  parts.push({ id: 'amp', kind: 'power', x: 630, y: 140, w: 130, h: 110, label: 'Amplifier', sub: 'EDFA booster', state: 'ok', info: { title: 'Optical amplifier (EDFA)', kind: 'power', state: 'ok', rows: [['Role', 'Boosts the combined signal for the span'], ['Output', '+20 dBm']] } });
  parts.push({ id: 'osc', kind: 'mgmt', x: 630, y: 280, w: 130, h: 60, label: 'OSC · OTDR', state: 'ok', info: { title: 'Optical supervisory channel', kind: 'mgmt', state: 'ok', rows: [['Role', 'Span monitoring and fibre-break location']] } });
  psus.forEach((m, k) => parts.push({ id: `mod:${m.slot}`, kind: 'power', x: 200 + k * 140, y: 316, w: 124, h: 56, label: m.slot, state: modState(m.state), info: modInfo(m, 'power') }));
  parts.push(...fans(3, fan, 800, 330, 160, 20));
  const deco = <>
    {clients.map((_, k) => <path key={k} className="dt-trace" d={`M 120 ${73 + k * 36} L 200 ${150 + k * 12}`} />)}
    {arrow(400, 195, 450, 195, 'net', 'x1')}{arrow(580, 195, 630, 195, 'net', 'x2')}{arrow(760, 195, 980, 195, 'net', 'x3')}
    <text x={975} y={184} className="dt-note" textAnchor="end">line fibre to the far site</text>
  </>;
  return { w: 1000, h: 400, title: 'Optical path', caption: `${clients.length} client ports → coherent transponder → mux → amplifier → line`, chips: [si.asic, `${clients.length} clients`, `${psus.length} × PSU`], groups, parts, deco };
}

/* ------------------------------------------------------------------------------------------- GPU servers */

function gpuInfo(c: Ctx, k: number): Info {
  const g = c.gpu?.gpus[k], m = c.gpu ? gpuSpec(c.gpu.model) : null;
  if (!g || !m) return { title: `GPU ${k}`, kind: 'compute', state: 'idle', rows: [['Telemetry', 'none — the node is not monitored']] };
  const st: PState = g.health === 'failed' ? 'bad' : g.health === 'degraded' || g.throttle !== 'none' ? 'warn' : g.util < 5 ? 'idle' : 'ok';
  return { title: `GPU ${k} · ${m.vendor} ${m.short}`, kind: 'compute', state: st, chip: k,
    rows: [['Health', g.health], ['Utilisation', `${g.util}% · SM ${g.smActive}% · tensor ${g.tensorActive}%`], ['Memory', `${g.memUsedGb} / ${g.memGb} GB ${m.memType}`], ['Temperature', `${g.tempC}°C · HBM ${g.hbmC}°C`],
      ['Power', `${g.powerW} / ${g.tdpW} W`], ['Clock', `${g.clockMhz} MHz · ${g.pstate}`], ['Throttle', g.throttle === 'none' ? '—' : g.throttle], ['ECC', `${g.sbe} SBE · ${g.dbe} DBE${g.remapPending ? ' · remap pending' : ''}`],
      ...(m.link ? [[`${m.linkShort} errors`, String(g.nvlinkErr)] as [string, string]] : []), ['Last error', g.xid ? `${m.vendor === 'NVIDIA' ? `Xid ${g.xid.code} · ` : ''}${g.xid.text}` : '—'], ['Serial', g.serial]],
    note: g.xid?.code === 79 ? 'Fell off the bus: cordon the node, restart the job from its checkpoint elsewhere, run level-3 diagnostics.' : g.remapPending ? 'Row remap pending — reset the GPU at the next checkpoint.' : g.throttle === 'hw-slowdown' ? 'Hardware slowdown from coolant temperature — fix the loop, not the node.' : undefined };
}
const gpuState = (c: Ctx, k: number): PState => gpuInfo(c, k).state;

function insideGpu(c: Ctx): Scene {
  const { ne, interfaces: ifs } = c.d;
  const m = c.gpu ? gpuSpec(c.gpu.model) : gpuSpec('H100 SXM 80 GB');
  const liquid = c.gpu?.cooling === 'liquid';
  const psus = ne.modules.filter(isPsu), fan = ne.modules.find(isFan);
  const ib = ifs.filter(i => i.name.startsWith('ib')), eth = ifs.filter(i => i.name.startsWith('eth')), mg = ifs.find(i => i.name.startsWith('mgmt'));
  const groups: Group[] = [{ x: 14, y: 30, w: 972, h: 520, label: `8-GPU server, top view · ${c.gpu?.server ?? `${ne.vendor} ${ne.model}`}` }];
  const parts: Part[] = [];
  /* cooling column */
  if (liquid) {
    parts.push({ id: 'manifold', kind: 'cooling', x: 30, y: 60, w: 44, h: 470, label: '', state: c.gpu?.gpus.some(g => g.throttle === 'hw-slowdown') ? 'warn' : 'ok',
      info: { title: 'Direct-to-chip coolant manifold', kind: 'cooling', state: c.gpu?.gpus.some(g => g.throttle === 'hw-slowdown') ? 'warn' : 'ok', rows: [['Cooling', 'Liquid · cold plate on every GPU'], ['Hottest GPU', `${c.gpu?.maxTemp ?? '—'}°C`]],
        note: c.gpu?.gpus.some(g => g.throttle === 'hw-slowdown') ? 'GPUs are slowing down for heat — the CDU loop feeding this rack is short of flow.' : undefined } });
  } else parts.push(...fans(6, fan, 52, 60, 470, 21, true));
  /* GPUs: two rows of four, the switch row between */
  const gx = 96, gw = 132, gg = 14;
  for (let k = 0; k < 8; k++) {
    const g = c.gpu?.gpus[k];
    parts.push({ id: `gpu:${k}`, kind: 'compute', x: gx + (k % 4) * (gw + gg), y: k < 4 ? 60 : 382, w: gw, h: 148, label: `GPU ${k}`, sub: g ? `${g.util}% · ${g.tempC}°C · ${g.powerW} W` : m.short, state: gpuState(c, k), glow: !!g && g.util >= 30, fill: g ? g.util / 100 : 0, info: gpuInfo(c, k) });
  }
  const sw = m.vendor === 'Intel' ? (m.short === 'Gaudi 3' ? { n: 1, label: 'On-chip RoCE · all-to-all', sub: m.link } : { n: 2, label: 'Xe Link bridge', sub: m.link })
    : m.link ? { n: m.short === 'A100' ? 6 : 4, label: 'NVSwitch', sub: m.link.split(' · ')[0] } : { n: 2, label: 'PCIe switch', sub: 'Gen4 / Gen5 · no NVLink' };
  const sx0 = gx + 10, swW = (4 * gw + 3 * gg - 20 - (sw.n - 1) * 12) / sw.n;
  const linkErr = c.gpu?.gpus.some(g => g.nvlinkErr > 100);
  for (let k = 0; k < sw.n; k++) parts.push({ id: `sw:${k}`, kind: 'network', x: sx0 + k * (swW + 12), y: 236, w: swW, h: 118, label: sw.label, sub: sw.sub, state: linkErr ? 'warn' : 'ok',
    info: { title: `${sw.label}${sw.n > 1 ? ` ${k}` : ''}`, kind: 'network', state: linkErr ? 'warn' : 'ok', rows: [['Joins', 'all 8 GPUs into one memory domain'], ['Link', m.link || 'PCIe only'], ['Link errors', linkErr ? 'one GPU above threshold' : 'none']] } });
  /* right column: CPUs, NICs, BMC, PSUs */
  const cx = 700;
  [0, 1].forEach(k => parts.push({ id: `cpu:${k}`, kind: 'compute', x: cx + k * 142, y: 60, w: 130, h: 74, label: `CPU ${k}`, sub: hostCpuOf(c.gpu?.server ?? ne.model).replace('Intel Xeon ', 'Xeon ').replace('AMD ', ''), state: ne.cpu >= 95 ? 'warn' : 'ok', fill: ne.cpu / 100,
    info: { title: `Host CPU ${k}`, kind: 'compute', state: 'ok', rows: [['Processor', hostCpuOf(c.gpu?.server ?? ne.model)], ['Host CPU', `${ne.cpu}%`], ['Host memory', `${ne.mem}%`], ['Driver', c.gpu?.driver ?? '—']] } }));
  const nics = [...ib, ...eth].slice(0, 10);
  const nw = 62, nh = 36;
  nics.forEach((i, k) => parts.push({ id: `if:${i.name}`, kind: 'network', x: cx + (k % 4) * (nw + 8), y: 150 + Math.floor(k / 4) * (nh + 8), w: nw, h: nh, label: i.name, state: ifState(i), info: portInfo(i), fill: i.state === 'up' ? i.utilPct / 100 : 0 }));
  const by = 150 + Math.ceil(nics.length / 4) * (nh + 8) + 6;
  parts.push({ id: 'bmc', kind: 'mgmt', x: cx, y: by, w: 272, h: 44, label: 'BMC (out-of-band)', sub: mg ? `${mg.name} · ${mg.state}` : undefined, state: mg ? ifState(mg) : 'ok', info: mg ? { ...portInfo(mg), title: `BMC · ${mg.name}` } : { title: 'BMC', kind: 'mgmt', state: 'ok', rows: [['Role', 'out-of-band management']] } });
  const py = by + 60, pw = 84, ph = 60;
  psus.forEach((p, k) => parts.push({ id: `mod:${p.slot}`, kind: 'power', x: cx + (k % 3) * (pw + 10), y: py + Math.floor(k / 3) * (ph + 10), w: pw, h: ph, label: p.slot, sub: '3.3 kW', state: modState(p.state), info: modInfo(p, 'power', [['Feed', k % 2 ? 'B' : 'A']]) }));
  const deco = <>
    {[0, 1, 2, 3].map(k => <line key={k} className="dt-trace" x1={gx + k * (gw + gg) + gw / 2} y1={208} x2={gx + k * (gw + gg) + gw / 2} y2={236} />)}
    {[0, 1, 2, 3].map(k => <line key={`b${k}`} className="dt-trace" x1={gx + k * (gw + gg) + gw / 2} y1={354} x2={gx + k * (gw + gg) + gw / 2} y2={382} />)}
  </>;
  const kw = c.gpu?.powerKw;
  return { w: 1000, h: 560, title: 'Inside · top view', caption: `${8} × ${m.vendor} ${m.model} on one baseboard, joined by ${sw.label}${liquid ? ' · liquid-cooled' : ' · air-cooled'}`,
    chips: [`8 × ${m.short}`, `${m.memGb * 8} GB ${m.memType}`, kw ? `${kw} kW now` : `${(m.tdpW * 8 / 1000 + 2).toFixed(1)} kW max`, `${ib.length || eth.length} × ${fmtSpeed((ib[0] ?? eth[0])?.speedMbps ?? 100000)} NICs`], groups, parts, deco };
}

function faceGpu(c: Ctx): Scene {
  const { ne, interfaces: ifs } = c.d;
  const m = c.gpu ? gpuSpec(c.gpu.model) : gpuSpec('H100 SXM 80 GB');
  const liquid = c.gpu?.cooling === 'liquid';
  const psus = ne.modules.filter(isPsu), fan = ne.modules.find(isFan);
  const ib = ifs.filter(i => i.name.startsWith('ib')), eth = ifs.filter(i => i.name.startsWith('eth')), mg = ifs.filter(i => i.name.startsWith('mgmt'));
  const groups: Group[] = [{ x: 20, y: 30, w: 960, h: 410, label: `Rear I/O · ${c.gpu?.server ?? ne.model} · ${ne.uSize ?? 8}U`, dark: true },
    { x: 40, y: 56, w: 920, h: 110, label: liquid ? 'GPU tray · coolant in / out' : 'GPU tray exhaust', kind: 'cooling' }];
  const parts: Part[] = liquid
    ? [{ id: 'qd:in', kind: 'cooling', x: 80, y: 90, w: 180, h: 56, label: 'Supply', sub: 'quick-disconnect', state: 'ok', info: { title: 'Coolant supply', kind: 'cooling', state: 'ok', rows: [['Cooling', 'direct-to-chip'], ['Hottest GPU', `${c.gpu?.maxTemp ?? '—'}°C`]] } },
       { id: 'qd:out', kind: 'cooling', x: 280, y: 90, w: 180, h: 56, label: 'Return', sub: 'quick-disconnect', state: 'ok', info: { title: 'Coolant return', kind: 'cooling', state: 'ok', rows: [['Cooling', 'direct-to-chip']] } },
       ...fans(4, fan, 500, 118, 440, 22)]
    : fans(10, fan, 60, 118, 880, 22);
  groups.push({ x: 40, y: 190, w: 920, h: 120, label: `Network · ${ib.length ? `${ib.length} × ${fmtSpeed(ib[0].speedMbps)} compute` : ''}${eth.length ? ` · ${eth.length} × ${fmtSpeed(eth[0].speedMbps)} front-end` : ''}`, kind: 'network' });
  [...ib, ...eth].forEach((i, k, all) => { const w = Math.min(84, (880 - (all.length - 1) * 10) / all.length); parts.push({ id: `if:${i.name}`, kind: 'network', shape: 'port', x: 60 + k * (w + 10), y: 222, w, h: 50, label: i.name, state: ifState(i), info: portInfo(i), fill: i.state === 'up' ? i.utilPct / 100 : 0 }); });
  mg.forEach((i, k) => parts.push({ id: `if:${i.name}`, kind: 'mgmt', shape: 'port', x: 870 - k * 60, y: 282, w: 50, h: 22, label: i.name, state: ifState(i), info: portInfo(i) }));
  psus.forEach((p, k) => parts.push({ id: `mod:${p.slot}`, kind: 'power', x: 60 + k * (880 / psus.length), y: 334, w: 880 / psus.length - 14, h: 86, label: p.slot, sub: `3.3 kW · feed ${k % 2 ? 'B' : 'A'}`, state: modState(p.state), info: modInfo(p, 'power', [['Feed', k % 2 ? 'B' : 'A']]) }));
  return { w: 1000, h: 450, title: 'Rear I/O', caption: `${ib.length + eth.length} network ports, ${mg.length} management, ${psus.length} power supplies`, chips: [`8 × ${m.short}`, ...portSummary(ifs).slice(0, 2), `${psus.length} × PSU`], groups, parts };
}

/* one accelerator package: die, memory stacks, scale-up ports, power, PCIe, cold plate */
function chipGpu(c: Ctx): Scene {
  const k = c.chip, g = c.gpu?.gpus[k];
  const m = c.gpu ? gpuSpec(c.gpu.model) : gpuSpec('H100 SXM 80 GB');
  const liquid = c.gpu?.cooling === 'liquid';
  const gddr = m.memType.startsWith('GDDR');
  const stacks = gddr ? (m.short === 'T4' ? 8 : 12) : m.short === 'B200' || m.vendor === 'Intel' ? 8 : m.short === 'H200' ? 6 : 5;
  const links = m.short === 'A100' ? 12 : m.link ? (m.linkShort === 'RoCE' ? 24 : m.linkShort === 'Xe Link' ? 16 : 18) : 0;
  const groups: Group[] = [{ x: 40, y: 30, w: 920, h: 525, label: `${m.vendor} ${m.model} · package (${m.form}) · GPU ${k}`, r: 22 }];
  const parts: Part[] = [];
  const st = gpuState(c, k);
  const memSt: PState = !g ? 'idle' : g.dbe ? 'bad' : g.remapPending || g.sbe > 100 ? 'warn' : 'ok';
  parts.push({ id: 'pwr', kind: 'power', x: 70, y: 66, w: 190, h: 60, label: 'Power in', sub: g ? `${g.powerW} / ${g.tdpW} W` : `${m.tdpW} W`, state: g?.throttle === 'power-cap' ? 'warn' : g ? 'ok' : 'idle', fill: g ? g.powerW / g.tdpW : 0,
    info: { title: 'Power delivery', kind: 'power', state: g?.throttle === 'power-cap' ? 'warn' : 'ok', rows: [['Draw', g ? `${g.powerW} W` : '—'], ['Limit (TDP)', `${m.tdpW} W`], ['Energy · 24 h', g ? `${g.energyKwh24} kWh` : '—'], ['Throttle', g?.throttle ?? '—']] } });
  parts.push({ id: 'pcie', kind: 'network', x: 740, y: 66, w: 190, h: 60, label: 'PCIe to CPU', sub: g ? `${g.pcieRxGbs} / ${g.pcieTxGbs} GB/s` : m.form, state: !g ? 'idle' : g.pcieReplay > 100 ? 'bad' : g.pcieReplay ? 'warn' : 'ok',
    info: { title: 'PCIe link to the host', kind: 'network', state: !g ? 'idle' : g.pcieReplay > 100 ? 'bad' : g.pcieReplay ? 'warn' : 'ok', rows: [['Traffic rx / tx', g ? `${g.pcieRxGbs} / ${g.pcieTxGbs} GB/s` : '—'], ['Replay counter', g ? String(g.pcieReplay) : '—']],
      note: g && g.pcieReplay > 100 ? 'A rising replay count comes before "fell off the bus".' : undefined } });
  /* the die, with its compute grid lit by utilisation */
  const dx = 330, dy = 170, dw = 340, dh = 270;
  groups.push({ x: dx - 26, y: dy - 30, w: dw + 52, h: dh + 54, label: liquid ? 'Cold plate' : 'Heatsink', kind: 'cooling', dashed: true, r: 16 });
  parts.push({ id: 'die', kind: 'compute', x: dx, y: dy, w: dw, h: dh, state: st, glow: true, info: { ...gpuInfo(c, k), chip: undefined } });
  const cols = 8, rows = 5, lit = g ? Math.round((g.smActive / 100) * cols * rows) : 0;
  const cells = Array.from({ length: cols * rows }, (_, i) => <rect key={i} x={dx + 22 + (i % cols) * 38} y={dy + 52 + Math.floor(i / cols) * 40} width={32} height={34} rx={6} className={`dt-sm${i < lit ? ' is-on' : ''}${st === 'bad' ? ' is-bad' : ''}`} />);
  parts.push({ id: 'temp', kind: 'cooling', shape: 'circle', x: dx + dw - 40, y: dy + 10, w: 30, h: 30, label: '°C', state: !g ? 'idle' : g.tempC >= 85 ? 'bad' : g.tempC >= 80 ? 'warn' : 'ok',
    info: { title: 'Die temperature', kind: 'cooling', state: !g ? 'idle' : g.tempC >= 85 ? 'bad' : g.tempC >= 80 ? 'warn' : 'ok', rows: [['GPU', g ? `${g.tempC}°C` : '—'], ['Memory', g ? `${g.hbmC}°C` : '—'], ['Fan', liquid ? 'liquid-cooled' : g ? `${g.fanPct}%` : '—']] } });
  /* memory stacks either side */
  const per = Math.ceil(stacks / 2), mh = Math.min(84, (dh - (per - 1) * 10) / per), mw = gddr ? 80 : 120;
  for (let i = 0; i < stacks; i++) {
    const left = i < per, j = left ? i : i - per;
    parts.push({ id: `mem:${i}`, kind: 'memory', x: left ? dx - 50 - mw : dx + dw + 50, y: dy + j * (mh + 10), w: mw, h: mh, label: gddr ? 'GDDR' : 'HBM', sub: `${Math.round(m.memGb / stacks)} GB`, state: memSt, fill: g ? g.memUsedGb / g.memGb : 0,
      info: { title: `${m.memType} ${gddr ? 'chip' : 'stack'} ${i}`, kind: 'memory', state: memSt, rows: [['Capacity', `${Math.round(m.memGb / stacks)} GB of ${m.memGb} GB`], ['GPU memory used', g ? `${g.memUsedGb} GB` : '—'], ['ECC', g ? `${g.sbe} correctable · ${g.dbe} uncorrectable` : '—'], ['Retired pages', g ? String(g.retiredPages) : '—'], ['Row remap', g?.remapPending ? 'pending — needs a GPU reset' : 'none']] } });
  }
  /* scale-up ports along the bottom */
  if (links) {
    const lw = Math.min(34, (800 - (links - 1) * 6) / links), lx = 500 - (links * lw + (links - 1) * 6) / 2;
    const badPort = g && g.nvlinkErr > 100 ? 4 : -1;
    for (let i = 0; i < links; i++) parts.push({ id: `link:${i}`, kind: 'network', x: lx + i * (lw + 6), y: 494, w: lw, h: 40, state: !g ? 'idle' : i === badPort ? 'bad' : 'ok',
      info: { title: `${m.linkShort} port ${i}`, kind: 'network', state: !g ? 'idle' : i === badPort ? 'bad' : 'ok', rows: [['Link', m.link], ['Traffic rx / tx (GPU total)', g ? `${g.nvlinkRxGbs} / ${g.nvlinkTxGbs} GB/s` : '—'], ['Errors (GPU total)', g ? String(g.nvlinkErr) : '—']],
        note: i === badPort ? 'CRC / replay errors on this link make the GPU a straggler for the whole job.' : undefined } });
  }
  const over = <>{cells}<text x={dx + 22} y={dy + 34} className="dt-die-t">{m.vendor === 'Intel' ? `${m.short} die` : 'GPU die'} · {m.arch}</text></>;
  const deco = <text x={500} y={482} className="dt-note" textAnchor="middle">{links ? `${m.linkShort} ports · ${m.link}` : 'PCIe card — no scale-up link'}</text>;
  return { w: 1000, h: 560, title: `One accelerator · GPU ${k}`, caption: `${m.arch} die with ${stacks} ${gddr ? 'GDDR chips' : 'HBM stacks'}${links ? ` and ${links} ${m.linkShort} ports` : ''}; lit cells = streaming multiprocessors active now`,
    chips: [`${m.tdpW} W`, `${m.memGb} GB ${m.memType}`, m.link || 'PCIe only', liquid ? 'cold plate' : 'air heatsink'], groups, parts, deco, over };
}

/* ------------------------------------------------------------------------------------------- servers & storage */

function faceServer({ d }: Ctx): Scene {
  const { ne, interfaces: ifs } = d;
  const disks = ne.modules.filter(m => /^DISK/.test(m.slot)), psus = ne.modules.filter(isPsu);
  const groups: Group[] = [{ x: 20, y: 34, w: 960, h: 140, label: `Front · ${ne.vendor} ${ne.model} · ${ne.uSize ?? 1}U`, dark: true }, { x: 20, y: 220, w: 960, h: 140, label: 'Rear', dark: true }];
  const parts: Part[] = [];
  const bays = Math.max(10, disks.length);
  for (let k = 0; k < bays; k++) {
    const m = disks[k];
    parts.push({ id: m ? `mod:${m.slot}` : `bay:${k}`, kind: 'storage', x: 160 + k * 66, y: 64, w: 58, h: 86, label: m ? `${k}` : '', sub: m ? 'NVMe' : 'blank', state: m ? modState(m.state) : 'off', info: m ? modInfo(m, 'storage') : { title: `Drive bay ${k}`, kind: 'storage', state: 'off', rows: [['Bay', 'empty (blank)']] } });
  }
  const sys = worstOf(ne.modules.map(m => modState(m.state)));
  parts.push({ id: 'panel', kind: 'mgmt', x: 44, y: 64, w: 96, h: 86, label: 'Panel', sub: 'power · ID · health', state: sys, info: { title: 'Control panel', kind: 'mgmt', state: sys, rows: [['Health LED', sys === 'ok' ? 'blue (healthy)' : 'amber'], ['Uptime', `${Math.round(ne.uptimeMin / 1440)} days`]] } });
  psus.forEach((p, k) => parts.push({ id: `mod:${p.slot}`, kind: 'power', x: 44 + k * 160, y: 252, w: 146, h: 86, label: p.slot, sub: `feed ${k % 2 ? 'B' : 'A'}`, state: modState(p.state), info: modInfo(p, 'power') }));
  parts.push(...portBank(ifs, 400, 266, 540, 60, 70).map(p => (p.id.includes('mgmt') ? { ...p, kind: 'mgmt' as Kind } : p)));
  return { w: 1000, h: 370, title: 'Front and rear', caption: `${disks.length} drives · ${ifs.length} network ports · ${psus.length} power supplies`, chips: [`${disks.length} × NVMe`, ...portSummary(ifs).slice(0, 2), `${psus.length} × PSU`], groups, parts };
}
function insideServer({ d }: Ctx): Scene {
  const { ne, interfaces: ifs } = d;
  const disks = ne.modules.filter(m => /^DISK/.test(m.slot)), psus = ne.modules.filter(isPsu), fan = ne.modules.find(isFan);
  const groups: Group[] = [{ x: 20, y: 30, w: 960, h: 470, label: `${ne.model} · top view (front at the bottom)` }];
  const parts: Part[] = [];
  const cpu = hostCpuOf(ne.model);
  [0, 1].forEach(k => {
    const x = 200 + k * 330;
    parts.push({ id: `cpu:${k}`, kind: 'compute', x, y: 170, w: 150, h: 130, label: `CPU ${k}`, sub: cpu.replace('Intel Xeon ', 'Xeon '), state: ne.cpu >= 95 ? 'warn' : 'ok', glow: true, fill: ne.cpu / 100, info: { title: `CPU ${k}`, kind: 'compute', state: 'ok', rows: [['Processor', cpu], ['Utilisation', `${ne.cpu}%`]] } });
    [-1, 1].forEach(side => { for (let j = 0; j < 8; j++) parts.push({ id: `dimm:${k}:${side}:${j}`, kind: 'memory', x: side < 0 ? x - 70 + j * 8 : x + 160 + j * 8, y: 150, w: 5, h: 170, state: ne.mem >= 92 ? 'warn' : 'ok', info: { title: `DIMMs · CPU ${k}`, kind: 'memory', state: 'ok', rows: [['Memory used', `${ne.mem}%`], ['Modules', '16 × 64 GB DDR5 per CPU']] } }); });
  });
  parts.push(...fans(6, fan, 60, 360, 880, 22));
  disks.forEach((m, k) => parts.push({ id: `mod:${m.slot}`, kind: 'storage', x: 300 + k * 100, y: 420, w: 86, h: 50, label: m.slot, state: modState(m.state), info: modInfo(m, 'storage') }));
  psus.forEach((p, k) => parts.push({ id: `mod:${p.slot}`, kind: 'power', x: 60 + k * 130, y: 56, w: 116, h: 70, label: p.slot, state: modState(p.state), info: modInfo(p, 'power') }));
  const nic = ifs.filter(i => !i.name.startsWith('mgmt'));
  parts.push({ id: 'nic', kind: 'network', x: 560, y: 56, w: 220, h: 70, label: 'OCP 3.0 NIC', sub: portSummary(nic)[0], state: worstOf(nic.map(ifState)), info: { title: 'Network adapter', kind: 'network', state: worstOf(nic.map(ifState)), rows: nic.map(i => [i.name, `${i.state} · ${fmtSpeed(i.speedMbps)} · ${i.utilPct}%`] as [string, string]) } });
  parts.push({ id: 'bmc', kind: 'mgmt', x: 800, y: 56, w: 140, h: 70, label: 'BMC', sub: ne.vendor === 'DELL' ? 'iDRAC 9' : ne.vendor === 'HPE' ? 'iLO 6' : 'IPMI', state: 'ok', info: { title: 'Baseboard management controller', kind: 'mgmt', state: 'ok', rows: [['Role', 'out-of-band power, console and sensors']] } });
  const deco = <>{[0, 1, 2, 3].map(k => arrow(140 + k * 240, 470, 140 + k * 240, 140, 'cool', `f${k}`))}</>;
  return { w: 1000, h: 510, title: 'Inside · top view', caption: `2 × ${cpu} with 32 DIMMs · ${disks.length} NVMe drives · fans pull air front to back`, chips: [`2 × ${cpu.split(' ').slice(-1)[0]}`, `${disks.length} × NVMe`, `${psus.length} × PSU`], groups, parts, deco };
}
function faceStorage({ d }: Ctx): Scene {
  const { ne, interfaces: ifs } = d;
  const shelf = ne.modules.find(m => /^SHELF/.test(m.slot)), ctl = ne.modules.filter(m => /^CTRL/.test(m.slot)), psus = ne.modules.filter(isPsu);
  const groups: Group[] = [{ x: 20, y: 34, w: 960, h: 170, label: `Front · ${ne.vendor} ${ne.model} · drive shelf`, dark: true }, { x: 20, y: 250, w: 960, h: 170, label: 'Rear · controllers', dark: true }];
  const parts: Part[] = [];
  for (let k = 0; k < 24; k++) parts.push({ id: `drv:${k}`, kind: 'storage', x: 44 + k * 38.5, y: 62, w: 32, h: 124, label: `${k}`, state: modState(shelf?.state ?? 'OK'), info: shelf ? modInfo(shelf, 'storage', [['Drive', `bay ${k} · 7.68 TB NVMe`]]) : { title: `Drive ${k}`, kind: 'storage', state: 'ok', rows: [] } });
  ctl.forEach((m, k) => {
    parts.push({ id: `mod:${m.slot}`, kind: 'compute', x: 44 + k * 470, y: 278, w: 446, h: 70, label: m.name, sub: m.slot, state: modState(m.state), info: modInfo(m, 'compute', [['Role', k ? 'standby / active-active partner' : 'active']]) });
    parts.push(...portBank(ifs.filter((_, j) => j % 2 === k), 60 + k * 470, 356, 300, 40, 60));
  });
  psus.forEach((p, k) => parts.push({ id: `mod:${p.slot}`, kind: 'power', x: 380 + k * 470, y: 356, w: 100, h: 46, label: p.slot, state: modState(p.state), info: modInfo(p, 'power') }));
  return { w: 1000, h: 430, title: 'Front and rear', caption: `24-drive shelf · ${ctl.length} controllers · ${ifs.length} ports`, chips: ['24 × 7.68 TB', `${ctl.length} controllers`, ...portSummary(ifs).slice(0, 1)], groups, parts };
}
function insideStorage({ d }: Ctx): Scene {
  const { ne } = d;
  const ctl = ne.modules.filter(m => /^CTRL/.test(m.slot)), psus = ne.modules.filter(isPsu), fan = ne.modules.find(isFan), shelf = ne.modules.find(m => /^SHELF/.test(m.slot));
  const groups: Group[] = [{ x: 20, y: 30, w: 960, h: 440, label: `${ne.model} · inside` }];
  const parts: Part[] = [];
  ctl.forEach((m, k) => {
    const x = 60 + k * 470;
    groups.push({ x: x - 10, y: 56, w: 420, h: 190, label: m.name, kind: 'compute' });
    parts.push({ id: `mod:${m.slot}`, kind: 'compute', x, y: 84, w: 180, h: 140, label: 'CPU', sub: m.slot, state: modState(m.state), glow: true, info: modInfo(m, 'compute') });
    parts.push({ id: `nvram:${k}`, kind: 'memory', x: x + 200, y: 84, w: 190, h: 64, label: 'NVRAM / write cache', state: modState(m.state), info: { title: `Write cache · ${m.slot}`, kind: 'memory', state: modState(m.state), rows: [['Role', 'mirrored to the partner controller before a write is acknowledged']] } });
    parts.push({ id: `hba:${k}`, kind: 'network', x: x + 200, y: 160, w: 190, h: 64, label: 'Host ports', state: 'ok', info: { title: 'Host interface', kind: 'network', state: 'ok', rows: [['Protocol', 'NVMe-oF / NFS / SMB']] } });
  });
  parts.push({ id: 'mid', kind: 'network', x: 60, y: 264, w: 880, h: 34, label: 'Midplane · both controllers see every drive', state: 'ok', info: { title: 'Midplane', kind: 'network', state: 'ok', rows: [['Paths', 'dual-ported drives, two controllers']] } });
  for (let k = 0; k < 24; k++) parts.push({ id: `drv:${k}`, kind: 'storage', x: 60 + k * 36.6, y: 314, w: 30, h: 70, state: modState(shelf?.state ?? 'OK'), info: shelf ? modInfo(shelf, 'storage', [['Drive', `bay ${k}`]]) : { title: `Drive ${k}`, kind: 'storage', state: 'ok', rows: [] } });
  psus.forEach((p, k) => parts.push({ id: `mod:${p.slot}`, kind: 'power', x: 60 + k * 150, y: 400, w: 136, h: 56, label: p.slot, state: modState(p.state), info: modInfo(p, 'power') }));
  parts.push(...fans(4, fan, 380, 428, 560, 22));
  return { w: 1000, h: 480, title: 'Inside', caption: 'Two controllers share one set of dual-ported drives; writes are mirrored before they are acknowledged', chips: [`${ctl.length} controllers`, '24 drives', `${psus.length} × PSU`], groups, parts };
}

function tenantScene({ d }: Ctx): Scene {
  return { w: 1000, h: 300, title: 'Tenant equipment', caption: 'The tenant owns and monitors these devices; the operator sees the cabinet only', chips: [`${d.ne.uSize ?? 1}U block`, `${d.rack.drawKw} kW cabinet draw`],
    groups: [{ x: 20, y: 30, w: 960, h: 250, label: `${d.ne.name} · ${d.ne.uSize ?? 1}U · customer gear`, dark: true }],
    parts: [{ id: 'blk', kind: 'mgmt', x: 80, y: 80, w: 840, h: 160, label: 'Tenant-owned — not visible to the operator', sub: `Cabinet ${d.rack.name} · ${d.rack.drawKw} / ${d.rack.contractedKw ?? d.rack.budgetKw} kW contracted · inlet ${d.rack.tempC}°C`, state: 'idle',
      info: { title: 'Tenant gear', kind: 'mgmt', state: 'idle', rows: [['Owner', 'tenant'], ['Cabinet draw', `${d.rack.drawKw} kW`], ['Contracted', `${d.rack.contractedKw ?? d.rack.budgetKw} kW`], ['Inlet', `${d.rack.tempC}°C`]] } }] };
}

/* ------------------------------------------------------------------------------------------- rack */

function rackScene({ d }: Ctx): Scene {
  const { rack, rackNes, ne } = d;
  const U = rack.heightU || 42, top = 92, bottom = 600, uh = (bottom - top) / U;
  const rx = 330, rw = 340;
  const groups: Group[] = [{ x: rx - 14, y: top - 18, w: rw + 28, h: bottom - top + 34, label: `${rack.name} · ${U}U · ${rack.role}`, r: 8 }];
  const parts: Part[] = [];
  const pct = rack.drawKw / Math.max(1, rack.budgetKw);
  const pSt: PState = pct >= 0.95 ? 'bad' : pct >= 0.85 ? 'warn' : 'ok';
  parts.push({ id: 'busway', kind: 'power', x: 200, y: 22, w: 600, h: 34, label: 'Overhead busway (A + B feeds)', state: pSt, info: { title: 'Rack power', kind: 'power', state: pSt, rows: [['Draw', `${rack.drawKw} kW`], ['Budget', `${rack.budgetKw} kW`], ['Load', `${Math.round(pct * 100)}%`], ...(rack.contractedKw ? [['Contracted', `${rack.contractedKw} kW`] as [string, string]] : [])], note: pSt !== 'ok' ? 'Close to the breaker — move load before adding equipment.' : undefined } });
  ['A', 'B'].forEach((f, k) => parts.push({ id: `pdu:${f}`, kind: 'power', x: k ? rx + rw + 26 : rx - 50, y: top, w: 24, h: bottom - top, state: pSt, info: { title: `PDU ${f}`, kind: 'power', state: pSt, rows: [['Feed', f], ['Share of draw', `${(rack.drawKw / 2).toFixed(1)} kW`]] } }));
  for (const n of rackNes) {
    const h = Math.max(uh * n.uSize - 2, 6), y = bottom - (n.u - 1 + n.uSize) * uh + 1;
    const me = n.id === ne.id;
    const st: PState = n.opsState === 'planned' ? 'off' : n.opsState !== 'in-service' ? 'idle' : !n.reachable || n.worst === 'critical' ? 'bad' : n.worst ? 'warn' : 'ok';
    const kind: Kind = n.role === 'GPU' || n.role === 'Server' ? 'compute' : n.role === 'Storage' ? 'storage' : n.role === 'Tenant gear' ? 'mgmt' : 'network';
    parts.push({ id: `ne:${n.id}`, kind, x: rx, y, w: rw, h, label: h >= 14 ? `${short(n.name)}${me && h < 30 ? ' · this device' : ''}` : undefined, sub: h >= 30 ? `${me ? 'This device · ' : ''}${n.role} · ${n.model} · U${n.u}` : undefined, state: st, me, glow: me, nav: me ? undefined : `/ne/${encodeURIComponent(n.id)}`,
      info: { title: short(n.name), kind, state: st, rows: [['Role', n.role], ['Model', `${n.vendor} ${n.model}`], ['Position', `U${n.u}${n.uSize > 1 ? `–${n.u + n.uSize - 1}` : ''}`], ['State', n.opsState]], to: me ? undefined : { href: `/ne/${encodeURIComponent(n.id)}`, label: `Open ${short(n.name)}` } } });
  }
  const used = rackNes.reduce((a, n) => a + n.uSize, 0);
  const deco = <>
    {[0, 1].map(k => <line key={k} className="dt-feed" x1={k ? rx + rw + 38 : rx - 38} y1={56} x2={k ? rx + rw + 38 : rx - 38} y2={top} />)}
    {[0, 1, 2, 3].map(k => arrow(120, 180 + k * 100, 260, 180 + k * 100, 'cool', `c${k}`))}
    {[0, 1, 2, 3].map(k => arrow(rx + rw + 70, 180 + k * 100, rx + rw + 210, 180 + k * 100, 'hot', `h${k}`))}
    <text x={190} y={160} className="dt-note" textAnchor="middle">Cold aisle</text><text x={190} y={580} className="dt-note" textAnchor="middle">inlet {rack.tempC}°C</text>
    <text x={rx + rw + 140} y={160} className="dt-note" textAnchor="middle">Hot aisle</text><text x={rx + rw + 140} y={580} className="dt-note" textAnchor="middle">exhaust</text>
    {rack.liquid && <><line className="dt-liquid is-sup" x1={rx + 8} y1={top - 6} x2={rx + 8} y2={bottom} /><line className="dt-liquid is-ret" x1={rx + rw - 8} y1={top - 6} x2={rx + rw - 8} y2={bottom} /></>}
    {Array.from({ length: Math.floor(U / 6) + 1 }, (_, k) => <text key={k} x={rx - 60} y={bottom - k * 6 * uh + 3} className="dt-u" textAnchor="end">{k * 6 + 1}</text>)}
    <text x={rx - 38} y={bottom + 16} className="dt-note" textAnchor="middle">PDU A</text><text x={rx + rw + 38} y={bottom + 16} className="dt-note" textAnchor="middle">PDU B</text>
  </>;
  return { w: 1000, h: 630, title: 'In the rack', caption: `${rackNes.length} devices in ${used} of ${U} U · ${rack.drawKw} of ${rack.budgetKw} kW · ${rack.liquid ? 'liquid-cooled (supply / return manifolds)' : 'air-cooled, cold aisle to hot aisle'}`,
    chips: [`${rack.drawKw} / ${rack.budgetKw} kW`, `${used} / ${U} U`, `inlet ${rack.tempC}°C`, rack.liquid ? 'liquid' : 'air'], groups, parts, deco };
}

/* ------------------------------------------------------------------------------------------- entry */

export function viewsFor(ne: NeData['ne'], hasGpu: boolean): { id: View; label: string }[] {
  if (ne.role === 'Tenant gear') return [{ id: 'face', label: 'Block' }, { id: 'rack', label: 'In the rack' }];
  const face = ne.role === 'GPU' ? 'Rear I/O' : ne.role === 'Server' || ne.role === 'Storage' ? 'Front & rear' : 'Front panel';
  const inside = ne.role === 'DWDM' ? 'Optical path' : 'Inside';
  return [{ id: 'face', label: face }, { id: 'inside', label: inside }, ...(ne.role === 'GPU' && hasGpu ? [{ id: 'chip' as View, label: 'One accelerator' }] : []), { id: 'rack', label: 'In the rack' }];
}
export function buildScene(view: View, c: Ctx): Scene {
  const r = c.d.ne.role;
  if (view === 'rack') return rackScene(c);
  if (r === 'Tenant gear') return tenantScene(c);
  if (r === 'GPU') return view === 'chip' ? chipGpu(c) : view === 'inside' ? insideGpu(c) : faceGpu(c);
  if (r === 'Server') return view === 'inside' ? insideServer(c) : faceServer(c);
  if (r === 'Storage') return view === 'inside' ? insideStorage(c) : faceStorage(c);
  return view === 'inside' ? insideNetwork(c) : faceNetwork(c);
}
