/* Device twin 3D models (08-Oct-2026). Proportions follow the real products: 19" chassis (0.44 m wide, 1U = 44.5 mm),
   vendor depths, HGX baseboard layout (8 SXM modules, NVSwitch row, CPU tray below, fan wall in front, PSUs and
   OSFP cages at the rear), switch ASIC under a tall finned heatsink, PSUs + fan modules at the rear, coherent DWDM
   cards with fibre jumpers. Every part is a Pick with the same id the inspector knows (if:…, mod:…, gpu:N, fan:N …). */
import { useMemo } from 'react';
import * as THREE from 'three';
import type { Interface } from '../../../api/types';
import type { GpuNodeRow } from '../../../mock/gpu-view';
import { gpuSpec } from '../../../lib/gpuSpec';
import { bezelTex, type BezelKind } from '../../site/twin2/textures';
import type { NeData } from '../NetworkElement';
import { ifState, modState, siliconOf, type PState } from '../twin/model';
import { B, Caption, Dimms, Ex, Face, Fan, Heatsink, MAT, Pick, PortField, Psu, RACK_W, U, heatColor, labelTex, ledMat, mat, perfTex, tintMat, useT, type PortSpec, type V3 } from './kit';

export interface DevProps { d: NeData; gpu: GpuNodeRow | null; chip: number; labels: boolean }
export interface Dims { w: number; h: number; d: number }

const W = RACK_W;
const short = (id: string) => id.replace(/^[A-Z]{2}-DC-\d{3}-/, '');
const kindOf = (i: Interface): PortSpec['kind'] => (/OSFP/.test(i.type) ? 'osfp' : /QSFP/.test(i.type) ? 'qsfp' : /SFP/.test(i.type) ? 'sfp' : 'rj45');
const spec = (i: Interface): PortSpec => ({ id: `if:${i.name}`, state: ifState(i), util: i.utilPct, kind: kindOf(i) });
const isPsu = (s: string) => /^(PSU|PEM)/.test(s);

export function dimsOf(d: NeData): Dims {
  const r = d.ne.role, u = Math.max(1, d.ne.uSize ?? 1);
  const depth = r === 'GPU' ? 0.9 : r === 'Server' ? 0.75 : r === 'Storage' ? 0.6 : r === 'DWDM' ? 0.3 : r === 'Router' ? 0.6 : r === 'Firewall' ? 0.6 : r === 'Tenant gear' ? 0.8 : 0.5;
  const h = r === 'DWDM' ? Math.max(u, 4) * U : r === 'GPU' ? Math.max(u, 6) * U : u * U;
  return { w: W, h, d: depth };
}

/* ---------------------------------------------------------------------- chassis shell (bottom, sides, removable lid) */
function Shell({ dm, front = true, lidLift = 0.22 }: { dm: Dims; front?: boolean; lidLift?: number }) {
  const t = 0.0012;
  return (
    <group>
      <B s={[dm.w, t, dm.d]} p={[0, 0, 0]} m={MAT.steel()} />
      <B s={[t, dm.h, dm.d]} p={[-dm.w / 2, 0, 0]} m={MAT.steel()} />
      {/* the near side panel slides away when the lid comes off, so the inside is in view */}
      <Ex off={[0.6, 0, 0]} lid><B s={[t, dm.h, dm.d]} p={[dm.w / 2, 0, 0]} m={MAT.steel()} /></Ex>
      {/* rack ears */}
      {front && [-1, 1].map(s => <B key={s} s={[0.02, dm.h - 0.002, 0.002]} p={[s * (dm.w / 2 + 0.01), 0.001, dm.d / 2 - 0.001]} m={MAT.steel()} />)}
      <Ex off={[0, lidLift, -dm.d * 0.75]} lid><B s={[dm.w + 0.002, t, dm.d]} p={[0, dm.h - t, 0]} m={MAT.steelLight()} /></Ex>
    </group>
  );
}
function Pcb({ w, d, p, black }: { w: number; d: number; p: V3; black?: boolean }) { return <B s={[w, 0.0016, d]} p={p} m={black ? MAT.pcbBlack() : MAT.green()} cast={false} />; }

/* model label on the bezel */
function Badge({ text, p, w = 0.09, h = 0.011 }: { text: string; p: V3; w?: number; h?: number }) { return <Face w={w} h={h} p={p} map={labelTex(text)} />; }

/* ---------------------------------------------------------------------- network gear: switch / router / firewall / access */
export function NetBox({ d, labels }: DevProps) {
  const t = useT();
  const dm = dimsOf(d); const { ne, interfaces: ifs } = d;
  const si = siliconOf(ne);
  const data = ifs.filter(i => i.speedMbps > 1000), mgmt = ifs.filter(i => i.speedMbps <= 1000);
  const psus = ne.modules.filter(m => isPsu(m.slot)), fan = ne.modules.find(m => /^FAN/.test(m.slot)), re = ne.modules.find(m => /^(RE|CPM)/.test(m.slot));
  const H = dm.h, Z = dm.d / 2;
  const kinds = [...new Set(data.map(kindOf))];
  const fw = ne.role === 'Firewall';
  const rows: 1 | 2 = data.length > 12 ? 2 : 1;
  const fanD = Math.min(H * 0.82, 0.04), nFans = H > 0.05 ? 4 : 5;
  const thermal = t.overlay === 'thermal';
  const asicT = ne.tempC + 18, hs = thermal ? tintMat('alu', heatColor(asicT)) : MAT.alu();
  const xData0 = -W / 2 + (re ? 0.12 : 0.1), xData1 = W / 2 - 0.02;
  /* split the data ports by cage kind so each block is uniform */
  const blocks = kinds.map(k => data.filter(i => kindOf(i) === k));
  const widths = blocks.map(b => b.length * (k2w(kindOf(b[0])) + 0.003) / (rows === 2 && b.length > 1 ? 2 : 1));
  const tot = widths.reduce((a, b) => a + b, 0) + (blocks.length - 1) * 0.012;
  const sc = Math.min(1, (xData1 - xData0) / tot);
  let cursor = xData0 + ((xData1 - xData0) - tot * sc) / 2;
  return (
    <group>
      <Shell dm={dm} />
      {/* front faceplate */}
      <B s={[dm.w, H - 0.0024, 0.002]} p={[0, 0.0012, Z - 0.001]} m={MAT.black()} cast={false} />
      <Badge text={`${ne.vendor} ${ne.model}`} p={[-W / 2 + 0.06, H - Math.min(0.009, H * 0.2), Z + 0.0012]} w={0.1} h={Math.min(0.01, H * 0.22)} />
      {re
        ? <Pick id={`mod:${re.slot}`} size={[0.09, H - 0.008, 0.01]} pos={[-W / 2 + 0.058, 0.004, Z]}><B s={[0.09, H - 0.008, 0.004]} p={[0, 0, 0.002]} m={MAT.plasticGrey()} /><mesh position={[0.035, H * 0.6, 0.0045]} material={ledMat(modState(re.state) === 'bad' ? 'bad' : 'ok')}><boxGeometry args={[0.003, 0.003, 0.001]} /></mesh></Pick>
        : <Pick id="sys" size={[0.05, 0.01, 0.01]} pos={[-W / 2 + 0.04, H * 0.5, Z]}>{(['SYS', 'PSU', 'FAN'] as const).map((l, k) => <mesh key={l} position={[-0.02 + k * 0.012, 0.002, 0.0015]} material={ledMat(l === 'SYS' ? (ne.icmp.state === 'critical' ? 'bad' : 'ok') : l === 'PSU' ? (psus.some(p => p.state === 'Fault') ? 'warn' : 'ok') : modState(fan?.state) === 'bad' ? 'bad' : 'ok')}><boxGeometry args={[0.003, 0.003, 0.001]} /></mesh>)}</Pick>}
      <PortField ports={mgmt.map(spec)} x0={-W / 2 + 0.015} x1={-W / 2 + (re ? 0.11 : 0.09)} y={Math.max(0.004, H / 2 - 0.016)} z={Z} rows={mgmt.length > 4 ? 2 : 1} depth={0.03} />
      {blocks.map((b, k) => { const x0 = cursor, x1 = cursor + widths[k] * sc; cursor = x1 + 0.012 * sc; const ch = kindOf(b[0]) === 'osfp' ? 0.013 : 0.0098; const y = rows === 2 && b.length > 1 ? H / 2 - ch - 0.002 : H / 2 - ch / 2; return <PortField key={k} ports={b.map(spec)} x0={x0} x1={x1} y={Math.max(0.003, y)} z={Z} rows={b.length > 1 ? rows : 1} depth={0.06} />; })}
      {/* inside: board, forwarding silicon under its heatsink, control CPU, memory */}
      <Pcb w={W - 0.01} d={dm.d - 0.08} p={[0, 0.003, 0.02]} black={ne.vendor === 'NVIDIA'} />
      {fw ? [0, 1, 2, 3].map(k => (
        <Pick key={k} id={`np:${k}`} size={[0.05, H - 0.012, 0.05]} pos={[-0.08 + k * 0.06, 0.005, -0.02]}>
          <B s={[0.03, 0.002, 0.03]} m={MAT.substrate()} /><Heatsink w={0.05} h={H - 0.014} d={0.05} p={[0, 0.002, 0]} m={hs} />
        </Pick>))
        : <Pick id="asic" size={[0.11, H - 0.012, 0.11]} pos={[0.03, 0.005, -0.01]}>
          <B s={[0.06, 0.002, 0.06]} m={MAT.substrate()} /><Heatsink w={0.11} h={Math.max(0.01, H - 0.014)} d={0.11} p={[0, 0.002, 0]} m={hs} />
          {labels && <Caption p={[0, H + 0.04, 0]} text={si.asic} sub={si.asicSub.split(' · ')[0]} size={0.03} />}
        </Pick>}
      <Pick id="cpu" size={[0.05, Math.min(0.02, H - 0.01), 0.05]} pos={[-0.13, 0.005, -0.05]}><Heatsink w={0.045} h={Math.min(0.018, H - 0.012)} d={0.045} p={[0, 0, 0]} m={thermal ? tintMat('alu', heatColor(ne.tempC + 6)) : MAT.alu()} /></Pick>
      <Pick id="dram" size={[0.03, 0.03, 0.135]} pos={[-0.18, 0.004, -0.06]}><group rotation={[0, 0, 0]}><Dimms n={2} p={[0, 0, 0]} h={Math.min(0.03, H - 0.01)} /></group></Pick>
      <Pick id="ssd" size={[0.03, 0.004, 0.08]} pos={[-0.13, 0.004, 0.06]}><B s={[0.022, 0.002, 0.08]} m={MAT.pcbBlack()} /></Pick>
      {labels && <Caption p={[-0.13, H + 0.03, -0.05]} text="Control CPU" sub={si.cpu.split(' · ')[0]} size={0.022} />}
      {/* rear: PSUs + fan modules */}
      {psus.map((m, k) => { const pw = 0.054, ph = Math.min(0.04, H - 0.006); return (
        <Ex key={m.slot} off={[0, 0, -0.18]}><Pick id={`mod:${m.slot}`} size={[pw, ph, 0.28]} pos={[W / 2 - 0.035 - k * (pw + 0.006), 0.003, -Z + 0.14]}>
          <group rotation={[0, Math.PI, 0]} position={[0, 0, -0.14]}><Psu w={pw} h={ph} p={[0, 0, 0]} d={0.28} state={modState(m.state)} /></group>
        </Pick></Ex>); })}
      {Array.from({ length: nFans }, (_, k) => (
        <Ex key={k} off={[0, 0, -0.12]}><Pick id={`fan:${k}`} size={[fanD, fanD, 0.04]} pos={[-W / 2 + 0.04 + k * (fanD + 0.012), (H - fanD) / 2, -Z + 0.02]}>
          <B s={[fanD + 0.004, fanD + 0.004, 0.04]} p={[0, -0.002, 0]} m={MAT.black()} />
          <Fan d={fanD} p={[0, fanD / 2, -0.021]} rotY={Math.PI} speed={0.55} state={modState(fan?.state)} />
        </Pick></Ex>))}
      <B s={[dm.w - 0.004, H - 0.003, 0.0015]} p={[0, 0.0015, -Z + 0.0008]} m={mat('rearHole', () => new THREE.MeshStandardMaterial({ color: '#1A1E24', metalness: 0.5, roughness: 0.6, transparent: true, opacity: 0.25 }))} cast={false} />
    </group>
  );
}
const k2w = (k: PortSpec['kind']) => (k === 'osfp' ? 0.0228 : k === 'qsfp' ? 0.0185 : k === 'sfp' ? 0.0142 : 0.016);

/* ---------------------------------------------------------------------- DWDM shelf: vertical cards, LC ports, fibre jumpers */
export function OpticalShelf({ d, labels }: DevProps) {
  const dm = dimsOf(d); const { ne, interfaces: ifs } = d;
  const H = dm.h, Z = dm.d / 2;
  const si = siliconOf(ne);
  const psus = ne.modules.filter(m => isPsu(m.slot)), fan = ne.modules.find(m => /^FAN/.test(m.slot));
  const slots = 10, sw = (W - 0.02) / slots;
  const cards: { id: string; label: string; kind: 'ctl' | 'tp' | 'mux' | 'amp' | 'osc'; ports: Interface[] }[] = [
    { id: 'osc', label: 'EC', kind: 'ctl', ports: [] }, ...[0, 1, 2, 3].map(k => ({ id: 'dsp', label: `TP-${k + 1}`, kind: 'tp' as const, ports: ifs.slice(k * 2, k * 2 + 2) })),
    { id: 'mux', label: 'MUX', kind: 'mux', ports: [] }, { id: 'mux', label: 'DMX', kind: 'mux', ports: [] }, { id: 'amp', label: 'BST', kind: 'amp', ports: [] }, { id: 'amp', label: 'PRE', kind: 'amp', ports: [] }, { id: 'osc', label: 'OSC', kind: 'osc', ports: [] }];
  const fibre = useMemo(() => ifs.slice(0, 8).map((_, k) => {
    const card = 1 + Math.floor(k / 2), x = -W / 2 + 0.01 + (card + 0.5) * sw, y = H * 0.62 - (k % 2) * 0.03;
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(x, y, Z + 0.012), new THREE.Vector3(x, y - 0.02, Z + 0.06), new THREE.Vector3(x + 0.04 + k * 0.01, -0.02, Z + 0.09), new THREE.Vector3(W / 2 + 0.03, -0.05, Z + 0.06)]);
    return new THREE.TubeGeometry(c, 32, 0.0016, 6, false);
  }), [ifs, H, Z, sw]);
  const jacket = mat('fibreY', () => new THREE.MeshStandardMaterial({ color: '#F2C230', roughness: 0.5 }));
  return (
    <group>
      <Shell dm={dm} />
      {cards.map((c, k) => {
        const x = -W / 2 + 0.01 + (k + 0.5) * sw;
        return (
          <Ex key={k} off={[0, 0, 0.08 + (k % 2) * 0.03]}>
            <Pick id={c.ports[0] ? `if:${c.ports[0].name}` : c.id} size={[sw - 0.002, H - 0.012, 0.012]} pos={[x, 0.006, Z - 0.006]}>
              <B s={[sw - 0.002, H - 0.012, 0.006]} p={[0, 0, 0]} m={c.kind === 'tp' ? MAT.steelLight() : c.kind === 'amp' ? mat('ampFace', () => new THREE.MeshStandardMaterial({ color: '#D7DCE3', metalness: 0.6, roughness: 0.35 })) : MAT.plasticGrey()} />
              <Face w={sw - 0.006} h={0.008} p={[0, H - 0.024, 0.0035]} map={labelTex(c.label, '#1F2633')} />
              <mesh position={[0, H - 0.04, 0.0035]} material={ledMat('ok')}><boxGeometry args={[0.003, 0.003, 0.001]} /></mesh>
              {/* card body inside the shelf */}
              <B s={[0.0016, H - 0.02, dm.d - 0.06]} p={[0, 0.004, -(dm.d - 0.06) / 2]} m={MAT.green()} />
              {c.kind === 'tp' && <Heatsink w={0.0016 + 0.014} h={0.03} d={0.06} p={[0.008, H * 0.3, -0.12]} />}
            </Pick>
            {c.ports.length > 0 && <PortField ports={c.ports.map(i => ({ ...spec(i), kind: 'lc' as const }))} x0={x - sw / 2 + 0.004} x1={x + sw / 2 - 0.004} y={H * 0.55} z={Z + 0.004} rows={2} depth={0.01} />}
          </Ex>
        );
      })}
      {fibre.map((g, k) => <mesh key={k} geometry={g} material={jacket} castShadow />)}
      {psus.map((m, k) => <Ex key={m.slot} off={[0, 0, -0.1]}><Pick id={`mod:${m.slot}`} size={[0.08, 0.03, 0.12]} pos={[W / 2 - 0.05 - k * 0.09, 0.004, -Z + 0.055]}><group rotation={[0, Math.PI, 0]} position={[0, 0, -0.055]}><Psu w={0.08} h={0.03} p={[0, 0, 0]} d={0.11} state={modState(m.state)} /></group></Pick></Ex>)}
      {[0, 1, 2].map(k => <Ex key={k} off={[0, 0, -0.08]}><Pick id={`fan:${k}`} size={[0.05, 0.05, 0.03]} pos={[-W / 2 + 0.05 + k * 0.06, 0.03, -Z + 0.03]}><Fan d={0.05} p={[0, 0.025, 0]} rotY={Math.PI} state={modState(fan?.state)} /></Pick></Ex>)}
      {labels && <><Caption p={[-0.06, H + 0.05, Z]} text="Coherent transponders" sub={si.asic} size={0.028} /><Caption p={[0.12, H + 0.05, Z]} text="Mux · amplifiers" sub="C-band, EDFA" size={0.028} /></>}
    </group>
  );
}

/* ---------------------------------------------------------------------- GPU server (HGX-class) */
export function GpuServer({ d, gpu, labels }: DevProps) {
  const t = useT();
  const dm = dimsOf(d); const { ne, interfaces: ifs } = d;
  const H = dm.h, Z = dm.d / 2;
  const m = gpu ? gpuSpec(gpu.model) : gpuSpec('H100 SXM 80 GB');
  const liquid = gpu?.cooling === 'liquid';
  const pcie = !m.link;            // L40S / T4: double-wide PCIe cards instead of SXM / OAM modules
  const psus = ne.modules.filter(x => isPsu(x.slot)), fan = ne.modules.find(x => /^FAN/.test(x.slot));
  const ib = ifs.filter(i => i.name.startsWith('ib')), eth = ifs.filter(i => i.name.startsWith('eth')), mg = ifs.filter(i => i.name.startsWith('mgmt'));
  const thermal = t.overlay === 'thermal';
  const trayY = H * 0.36;           // GPU tray floor
  const gpuH = H - trayY - 0.012;
  const gx = (k: number) => -0.15 + (k % 4) * 0.1, gz = (k: number) => (k < 4 ? 0.2 : 0.02);
  const fanD = Math.min(0.08, (H - trayY - 0.032) / 2);
  return (
    <group>
      <Shell dm={dm} lidLift={0.3} />
      {/* ---- GPU tray */}
      <Ex off={[0, 0.16, 0]}>
        <Pcb w={W - 0.012} d={0.56} p={[0, trayY, 0.08]} black />
        {labels && <Caption p={[0, trayY + (liquid ? 0.12 : gpuH + 0.1), 0.11]} text={pcie ? 'GPU cards' : m.vendor === 'Intel' ? 'OAM baseboard' : 'HGX baseboard'} sub={`8 × ${m.vendor} ${m.short} · ${liquid ? 'cold plates' : 'heatsinks'}`} />}
        {Array.from({ length: 8 }, (_, k) => {
          const g = gpu?.gpus[k]; const tc = g?.tempC ?? 35;
          const hsM = thermal ? tintMat(liquid ? 'copper' : 'alu', heatColor(tc)) : liquid ? MAT.copper() : MAT.alu();
          const busy = g ? g.util / 100 : 0;
          return (
            <Ex key={k} off={[0, 0.07 + (k < 4 ? 0.02 : 0), 0]}>
              <Pick id={`gpu:${k}`} size={[0.09, pcie ? gpuH * 0.85 : liquid ? 0.03 : gpuH, 0.15]} pos={[gx(k), trayY + 0.002, gz(k)]}>
                {pcie ? <>
                  {/* double-wide PCIe card lying on the riser: shroud + fan */}
                  <B s={[0.03, gpuH * 0.85, 0.15]} p={[0, 0, 0]} m={mat('shroud', () => new THREE.MeshStandardMaterial({ color: '#2B2F36', metalness: 0.6, roughness: 0.35 }))} />
                  <mesh position={[0.0151, gpuH * 0.45, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[0.14, gpuH * 0.7]} /><meshStandardMaterial map={labelTex(`NVIDIA ${m.short}`, '#76B900', '#2B2F36', 512, 64, 700)} /></mesh>
                </> : <>
                  <B s={[0.085, 0.0016, 0.14]} m={MAT.green()} cast={false} />
                  {liquid
                    ? <><B s={[0.07, 0.012, 0.09]} p={[0, 0.002, 0]} m={hsM} r={0.003} /><mesh position={[-0.02, 0.02, -0.06]} rotation={[Math.PI / 2, 0, 0]} material={MAT.tubeBlue()}><cylinderGeometry args={[0.004, 0.004, 0.08, 10]} /></mesh><mesh position={[0.02, 0.02, -0.06]} rotation={[Math.PI / 2, 0, 0]} material={MAT.tubeRed()}><cylinderGeometry args={[0.004, 0.004, 0.08, 10]} /></mesh></>
                    : <Heatsink w={0.084} h={gpuH - 0.004} d={0.13} p={[0, 0.002, 0]} m={hsM} fins={22} />}
                </>}
                {/* activity strip on the module edge: brightness = utilisation */}
                <mesh position={[0, 0.006, 0.072]} raycast={() => null}><boxGeometry args={[0.07 * Math.max(0.05, busy), 0.002, 0.001]} /><meshStandardMaterial color="#5B8CFF" emissive="#5B8CFF" emissiveIntensity={g ? 0.6 + busy * 2 : 0} toneMapped={false} /></mesh>
              </Pick>
            </Ex>
          );
        })}
        {/* scale-up switching behind the GPUs */}
        {Array.from({ length: m.short === 'Gaudi 3' ? 0 : pcie ? 2 : 4 }, (_, k) => (
          <Pick key={k} id={`sw:${k}`} size={[0.06, 0.035, 0.06]} pos={[-0.14 + k * (pcie ? 0.28 : 0.093), trayY + 0.002, -0.14]}>
            <B s={[0.04, 0.002, 0.04]} m={MAT.substrate()} /><Heatsink w={0.06} h={0.035} d={0.06} p={[0, 0.002, 0]} m={liquid ? MAT.copper() : MAT.alu()} fins={16} />
          </Pick>))}
        {labels && m.short !== 'Gaudi 3' && <Caption p={[0.12, trayY + 0.08, -0.2]} text={pcie ? 'PCIe switches' : m.vendor === 'Intel' ? 'Xe Link' : 'NVSwitch'} sub={m.link || 'no NVLink'} />}
        {liquid && <><mesh position={[-W / 2 + 0.03, trayY + 0.04, -0.1]} material={MAT.tubeBlue()}><boxGeometry args={[0.012, 0.012, 0.5]} /></mesh><mesh position={[-W / 2 + 0.05, trayY + 0.04, -0.1]} material={MAT.tubeRed()}><boxGeometry args={[0.012, 0.012, 0.5]} /></mesh></>}
      </Ex>
      {/* ---- front: fan wall over the GPU tray, NVMe bays + controls on the CPU tray */}
      {Array.from({ length: 10 }, (_, k) => {
        const cols = 5, c = k % cols, r = Math.floor(k / cols);
        const x = -W / 2 + 0.02 + (c + 0.5) * ((W - 0.04) / cols);
        return (
          <Ex key={k} off={[0, 0, 0.18]}>
            <Pick id={`fan:${Math.min(5, k)}`} size={[fanD, fanD, 0.05]} pos={[x, trayY + 0.01 + r * (fanD + 0.01), Z - 0.025]}>
              <B s={[fanD + 0.006, fanD + 0.006, 0.05]} p={[0, -0.003, -0.025]} m={MAT.black()} />
              <Fan d={fanD} p={[0, fanD / 2, 0.001]} speed={gpu ? (gpu.gpus.reduce((a, g) => a + g.fanPct, 0) / 800) : 0.5} state={modState(fan?.state)} />
            </Pick>
          </Ex>
        );
      })}
      <B s={[W - 0.004, trayY - 0.006, 0.003]} p={[0, 0.003, Z - 0.0015]} m={MAT.black()} cast={false} />
      <Instances8 H={trayY} Z={Z} />
      <Badge text={gpu?.server ?? `${ne.vendor} ${ne.model}`} p={[0.08, trayY * 0.22, Z + 0.002]} w={0.18} h={0.012} />
      {/* ---- CPU tray (inside, below the GPUs) */}
      <Pcb w={W - 0.012} d={dm.d - 0.08} p={[0, 0.004, 0]} />
      {[0, 1].map(k => (
        <Ex key={k} off={[0, 0.07, 0]}>
          <Pick id={`cpu:${k}`} size={[0.09, Math.min(0.06, trayY - 0.02), 0.11]} pos={[-0.1 + k * 0.2, 0.006, 0.1]}>
            <B s={[0.06, 0.003, 0.07]} m={MAT.substrate()} />
            <Heatsink w={0.09} h={Math.min(0.06, trayY - 0.02)} d={0.11} p={[0, 0.003, 0]} m={thermal ? tintMat('alu', heatColor(ne.tempC + 24)) : MAT.alu()} />
          </Pick>
          <Dimms n={8} p={[-0.1 + k * 0.2 - 0.085, 0.006, 0.1]} pitch={0.0078} h={Math.min(0.032, trayY - 0.02)} />
          <Dimms n={8} p={[-0.1 + k * 0.2 + 0.085, 0.006, 0.1]} pitch={0.0078} h={Math.min(0.032, trayY - 0.02)} />
        </Ex>
      ))}
      {labels && <><Caption p={[-0.12, 0.16, 0.05]} text="CPU tray" sub="2 CPUs · 32 DIMMs" />
        <Caption p={[0, H + 0.04, Z + 0.2]} text="Fan wall" sub={liquid ? 'air for memory, NICs, PSUs' : '10 hot-swap fans'} />
        <Caption p={[0, 0.12, -Z - 0.24]} text="Power supplies" sub={`${psus.length} × 3.3 kW, A + B feeds`} /></>}
      {/* ---- rear: PSUs (bottom), compute NIC cages, front-end + management */}
      {psus.map((p, k) => { const pw = (W - 0.03) / Math.max(psus.length, 4) - 0.006, ph = Math.min(0.04, trayY * 0.45); return (
        <Ex key={p.slot} off={[0, 0, -0.22]}><Pick id={`mod:${p.slot}`} size={[pw, ph, 0.3]} pos={[-W / 2 + 0.015 + pw / 2 + k * (pw + 0.006), 0.006, -Z + 0.15]}>
          <group rotation={[0, Math.PI, 0]} position={[0, 0, -0.15]}><Psu w={pw} h={ph} p={[0, 0, 0]} d={0.3} state={modState(p.state)} /></group>
        </Pick></Ex>); })}
      <group rotation={[0, Math.PI, 0]}>
        <PortField ports={ib.map(spec)} x0={-W / 2 + 0.02} x1={W / 2 - 0.12} y={trayY + 0.02} z={Z - 0.001} rows={1} depth={0.07} />
        <PortField ports={eth.map(spec)} x0={W / 2 - 0.11} x1={W / 2 - 0.05} y={trayY + 0.02} z={Z - 0.001} rows={1} depth={0.05} />
        <PortField ports={mg.map(spec)} x0={W / 2 - 0.045} x1={W / 2 - 0.012} y={trayY + 0.02} z={Z - 0.001} rows={1} depth={0.03} />
        <Pick id="bmc" size={[0.03, 0.012, 0.01]} pos={[W / 2 - 0.03, trayY + 0.045, Z]}><mesh position={[0, 0.003, 0.001]} material={ledMat('blue')}><boxGeometry args={[0.003, 0.003, 0.001]} /></mesh></Pick>
        <B s={[W - 0.004, H - trayY - 0.07, 0.002]} p={[0, trayY + 0.06, Z - 0.001]} m={mat('perfRear', () => new THREE.MeshStandardMaterial({ map: perfTex([14, 6], '#2A2F37'), metalness: 0.5, roughness: 0.5 }))} cast={false} />
      </group>
    </group>
  );
}
/* eight NVMe caddies on the CPU tray front */
function Instances8({ H, Z }: { H: number; Z: number }) {
  return <group>{Array.from({ length: 8 }, (_, k) => <group key={k} position={[-W / 2 + 0.03 + k * 0.022, H * 0.35, Z]}><B s={[0.018, H * 0.5, 0.004]} p={[0, 0, 0.002]} m={MAT.plasticGrey()} /><mesh position={[0, H * 0.45, 0.0045]} material={ledMat('ok')}><boxGeometry args={[0.002, 0.002, 0.001]} /></mesh></group>)}</group>;
}

/* ---------------------------------------------------------------------- one accelerator, close up (SXM / OAM / PCIe card) */
export function Accelerator({ gpu, chip, labels }: DevProps) {
  const t = useT();
  const g = gpu?.gpus[chip]; const m = gpu ? gpuSpec(gpu.model) : gpuSpec('H100 SXM 80 GB');
  const liquid = gpu?.cooling === 'liquid';
  const gddr = m.memType.startsWith('GDDR');
  const stacks = gddr ? (m.short === 'T4' ? 8 : 12) : m.short === 'B200' || m.vendor === 'Intel' ? 8 : m.short === 'H200' ? 6 : 5;
  const S = 4;                                  // shown at 4× so the package reads at desk scale
  const pw = 0.14 * S, pd = 0.08 * S;
  const lit = g ? Math.round((g.smActive / 100) * 80) : 0;
  const thermal = t.overlay === 'thermal';
  const st: PState = !g ? 'idle' : g.health === 'failed' ? 'bad' : g.health === 'degraded' ? 'warn' : 'ok';
  const dieW = (m.short === 'B200' ? 0.05 : 0.03) * S, dieD = 0.027 * S;
  const cells = useMemo(() => Array.from({ length: 80 }, (_, i) => i), []);
  return (
    <group position={[0, 0.02, 0]}>
      {/* module PCB with VRMs and mezzanine connectors */}
      <Pick id="pcie" size={[pw * 0.6, 0.02, 0.05]} pos={[0, -0.02, -pd * 0.3]} halo><Ex off={[0, -0.06, 0]}>{[-1, 1].map(s => <B key={s} s={[pw * 0.28, 0.014, 0.03]} p={[s * pw * 0.18, -0.014, 0]} m={MAT.black()} />)}</Ex></Pick>
      <B s={[pw, 0.006, pd]} p={[0, 0, 0]} m={MAT.green()} />
      <Pick id="pwr" size={[pw * 0.9, 0.02, 0.04]} pos={[0, 0.006, pd / 2 - 0.035]}>
        {Array.from({ length: 16 }, (_, i) => <B key={i} s={[0.022, 0.016, 0.022]} p={[-pw * 0.42 + i * (pw * 0.84 / 15), 0, 0]} m={MAT.black()} />)}
        {labels && <Caption p={[0, 0.06, 0]} text="Power stages" sub={g ? `${g.powerW} / ${g.tdpW} W` : `${m.tdpW} W`} size={0.035} />}
      </Pick>
      {/* package: substrate, die, memory */}
      <Ex off={[0, 0.12, 0]}>
        <B s={[0.07 * S, 0.006, 0.06 * S]} p={[0, 0.006, -0.01]} m={MAT.substrate()} />
        <Pick id="die" size={[dieW, 0.012, dieD]} pos={[0, 0.012, -0.01]}>
          <B s={[dieW, 0.008, dieD]} m={MAT.die()} />
          {/* streaming multiprocessors lit by SM-active */}
          <group position={[0, 0.0085, 0]}>{cells.map(i => { const c = i % 10, r = Math.floor(i / 10); return <mesh key={i} position={[-dieW / 2 + dieW / 20 + c * dieW / 10, 0, -dieD / 2 + dieD / 16 + r * dieD / 8]} raycast={() => null}><boxGeometry args={[dieW / 12, 0.0006, dieD / 10]} /><meshStandardMaterial color={st === 'bad' ? '#FF5A5A' : '#7C8CFF'} emissive={st === 'bad' ? '#FF3030' : '#6F7DFF'} emissiveIntensity={i < lit ? 1.8 : 0.05} toneMapped={false} /></mesh>; })}</group>
          {labels && <Caption p={[0, 0.07, 0]} text={m.vendor === 'Intel' ? `${m.short} die` : 'GPU die'} sub={`${m.arch} · ${g ? `${g.smActive}% SM active` : ''}`} size={0.04} />}
        </Pick>
        {Array.from({ length: stacks }, (_, i) => {
          const per = Math.ceil(stacks / 2), left = i < per, j = left ? i : i - per;
          const mw = gddr ? 0.012 * S : 0.011 * S, md = gddr ? 0.012 * S : 0.008 * S;
          const z = -0.01 - ((per - 1) * (md + 0.006)) / 2 + j * (md + 0.006);
          return <Pick key={i} id={`mem:${i}`} size={[mw, 0.012, md]} pos={[(left ? -1 : 1) * (dieW / 2 + 0.02 + mw / 2), 0.012, z]}><B s={[mw, 0.01, md]} m={thermal && g ? tintMat('hbm', heatColor(g.hbmC)) : MAT.hbm()} /></Pick>;
        })}
        {labels && <Caption p={[-(dieW / 2 + 0.06), 0.08, 0.04]} text={m.memType} sub={`${m.memGb} GB · ${stacks} ${gddr ? 'chips' : 'stacks'}`} size={0.035} />}
      </Ex>
      {/* cold plate or heatsink on top */}
      <Ex off={[0, 0.3, 0]}>
        <Pick id="temp" size={[0.075 * S, liquid ? 0.03 : 0.12, 0.065 * S]} pos={[0, 0.04, -0.01]}>
          {liquid
            ? <><B s={[0.075 * S, 0.03, 0.065 * S]} m={thermal && g ? tintMat('copper', heatColor(g.tempC)) : MAT.copper()} r={0.01} />
              <mesh position={[-0.06, 0.05, -0.05]} rotation={[Math.PI / 2, 0, 0]} material={MAT.tubeBlue()}><cylinderGeometry args={[0.012, 0.012, 0.3, 14]} /></mesh>
              <mesh position={[0.06, 0.05, -0.05]} rotation={[Math.PI / 2, 0, 0]} material={MAT.tubeRed()}><cylinderGeometry args={[0.012, 0.012, 0.3, 14]} /></mesh></>
            : <Heatsink w={0.075 * S} h={0.12} d={0.065 * S} p={[0, 0, 0]} fins={40} m={thermal && g ? tintMat('alu', heatColor(g.tempC)) : MAT.alu()} />}
          {labels && <Caption p={[0, liquid ? 0.09 : 0.17, 0]} text={liquid ? 'Cold plate' : 'Heatsink'} sub={g ? `${g.tempC}°C die · ${g.hbmC}°C memory` : ''} size={0.04} />}
        </Pick>
      </Ex>
      {st === 'bad' && <pointLight position={[0, 0.06, -0.01]} color="#FF3A3A" intensity={0.6} distance={0.5} />}
    </group>
  );
}

/* ---------------------------------------------------------------------- servers, storage, tenant gear */
export function ServerBox({ d, labels }: DevProps) {
  const t = useT();
  const dm = dimsOf(d); const { ne, interfaces: ifs } = d;
  const H = dm.h, Z = dm.d / 2;
  const disks = ne.modules.filter(m => /^DISK/.test(m.slot)), psus = ne.modules.filter(m => isPsu(m.slot)), fan = ne.modules.find(m => /^FAN/.test(m.slot));
  const thermal = t.overlay === 'thermal';
  const fanD = Math.min(H * 0.8, 0.06);
  return (
    <group>
      <Shell dm={dm} />
      <B s={[W - 0.004, H - 0.004, 0.003]} p={[0, 0.002, Z - 0.0015]} m={MAT.black()} cast={false} />
      <Badge text={`${ne.vendor} ${ne.model}`} p={[W / 2 - 0.07, H - Math.min(0.008, H * 0.2), Z + 0.0012]} w={0.11} h={Math.min(0.01, H * 0.22)} />
      {Array.from({ length: 10 }, (_, k) => { const m = disks[k]; return (
        <Ex key={k} off={[0, 0, 0.06]}><Pick id={m ? `mod:${m.slot}` : `bay:${k}`} size={[0.02, H - 0.008, 0.01]} pos={[-W / 2 + 0.07 + k * 0.023, 0.004, Z]}>
          <B s={[0.02, H - 0.008, 0.006]} p={[0, 0, 0.003]} m={m ? MAT.plasticGrey() : MAT.black()} />
          {m && <mesh position={[0, H - 0.014, 0.0065]} material={ledMat(modState(m.state) === 'bad' ? 'bad' : 'ok')}><boxGeometry args={[0.002, 0.002, 0.001]} /></mesh>}
        </Pick></Ex>); })}
      <Pick id="panel" size={[0.03, H - 0.01, 0.01]} pos={[-W / 2 + 0.03, 0.005, Z]}><mesh position={[0, H * 0.5, 0.003]} material={ledMat('blue')}><boxGeometry args={[0.004, 0.004, 0.002]} /></mesh></Pick>
      <Pcb w={W - 0.012} d={dm.d - 0.06} p={[0, 0.003, 0]} />
      {Array.from({ length: 6 }, (_, k) => <Ex key={k} off={[0, 0.05, 0]}><Pick id={`fan:${k}`} size={[fanD, fanD, 0.04]} pos={[-W / 2 + 0.04 + k * 0.072, (H - fanD) / 2, 0.16]}><Fan d={fanD} p={[0, fanD / 2, 0]} state={modState(fan?.state)} depth={0.035} /></Pick></Ex>)}
      {[0, 1].map(k => (
        <Ex key={k} off={[0, 0.08, 0]}>
          <Pick id={`cpu:${k}`} size={[0.08, H - 0.01, 0.1]} pos={[-0.1 + k * 0.2, 0.004, -0.02]}><Heatsink w={0.08} h={H - 0.012} d={0.1} p={[0, 0, 0]} m={thermal ? tintMat('alu', heatColor(ne.tempC + 22)) : MAT.alu()} /></Pick>
          {[-1, 1].map(s => <Pick key={s} id={`dimm:${k}:${s}:0`} size={[0.06, H - 0.01, 0.133]} pos={[-0.1 + k * 0.2 + s * 0.075, 0.004, -0.02]} halo={false}><Dimms n={8} p={[0, 0, 0]} pitch={0.0072} h={Math.min(0.031, H - 0.01)} /></Pick>)}
        </Ex>))}
      {labels && <Caption p={[0, H + 0.05, -0.02]} text="2 CPUs · 32 DIMMs" sub={ne.model} size={0.026} />}
      {psus.map((p, k) => <Ex key={p.slot} off={[0, 0, -0.16]}><Pick id={`mod:${p.slot}`} size={[0.07, Math.min(0.038, H - 0.006), 0.2]} pos={[W / 2 - 0.045 - k * 0.078, 0.003, -Z + 0.1]}><group rotation={[0, Math.PI, 0]} position={[0, 0, -0.1]}><Psu w={0.07} h={Math.min(0.038, H - 0.006)} p={[0, 0, 0]} d={0.2} state={modState(p.state)} /></group></Pick></Ex>)}
      <group rotation={[0, Math.PI, 0]}><PortField ports={ifs.map(spec)} x0={-W / 2 + 0.03} x1={0.02} y={Math.min(0.012, H * 0.3)} z={Z - 0.001} rows={1} depth={0.05} /></group>
      <Pick id="nic" size={[0.12, 0.012, 0.1]} pos={[-0.12, 0.004, -Z + 0.06]}><B s={[0.12, 0.002, 0.1]} m={MAT.green()} /></Pick>
    </group>
  );
}
export function StorageBox({ d, labels }: DevProps) {
  const dm = dimsOf(d); const { ne, interfaces: ifs } = d;
  const H = dm.h, Z = dm.d / 2;
  const shelf = ne.modules.find(m => /^SHELF/.test(m.slot)), ctl = ne.modules.filter(m => /^CTRL/.test(m.slot)), psus = ne.modules.filter(m => isPsu(m.slot)), fan = ne.modules.find(m => /^FAN/.test(m.slot));
  const sst = modState(shelf?.state ?? 'OK');
  return (
    <group>
      <Shell dm={dm} />
      {Array.from({ length: 24 }, (_, k) => (
        <Ex key={k} off={[0, 0, 0.05 + (k % 3) * 0.01]}><Pick id={`drv:${k}`} size={[0.0155, H - 0.01, 0.01]} pos={[-W / 2 + 0.02 + k * 0.0167, 0.005, Z]}>
          <B s={[0.0152, H - 0.01, 0.006]} p={[0, 0, 0.003]} m={MAT.plasticGrey()} />
          <mesh position={[0, H - 0.016, 0.0065]} material={ledMat(sst === 'bad' ? 'bad' : sst === 'warn' ? 'warn' : 'ok')}><boxGeometry args={[0.002, 0.002, 0.001]} /></mesh>
          <B s={[0.012, H - 0.02, 0.15]} p={[0, 0.002, -0.08]} m={MAT.steelLight()} />
        </Pick></Ex>))}
      <Badge text={`${ne.vendor} ${ne.model}`} p={[0, H + 0.0001 - 0.004, Z + 0.004]} w={0.14} h={0.006} />
      <B s={[W - 0.01, H - 0.01, 0.004]} p={[0, 0.005, Z - 0.17]} m={MAT.green()} />
      {Array.from({ length: 4 }, (_, k) => <Ex key={k} off={[0, 0.06, 0]}><Pick id={`fan:${k}`} size={[0.06, 0.06, 0.04]} pos={[-0.15 + k * 0.1, 0.008, Z - 0.22]}><Fan d={Math.min(0.06, H - 0.02)} p={[0, Math.min(0.06, H - 0.02) / 2, 0]} state={modState(fan?.state)} /></Pick></Ex>)}
      {ctl.map((m, k) => (
        <Ex key={m.slot} off={[0, 0, -0.16 - k * 0.05]}>
          <Pick id={`mod:${m.slot}`} size={[W - 0.12, H / 2 - 0.006, 0.3]} pos={[-0.05, 0.004 + k * (H / 2), -Z + 0.15]}>
            <B s={[W - 0.12, H / 2 - 0.008, 0.3]} p={[0, 0, 0]} m={MAT.steel()} />
            <B s={[W - 0.14, 0.002, 0.28]} p={[0, 0.004, 0]} m={MAT.green()} />
            <Heatsink w={0.06} h={H / 2 - 0.016} d={0.06} p={[0.05, 0.006, -0.05]} />
          </Pick>
          <group rotation={[0, Math.PI, 0]}><PortField ports={ifs.filter((_, j) => j % 2 === k).map(spec)} x0={-W / 2 + 0.17} x1={W / 2 - 0.02} y={0.008 + k * (H / 2)} z={Z - 0.001} rows={1} depth={0.04} /></group>
        </Ex>))}
      {psus.map((p, k) => <Ex key={p.slot} off={[0, 0, -0.2]}><Pick id={`mod:${p.slot}`} size={[0.05, H / 2 - 0.008, 0.24]} pos={[W / 2 - 0.035, 0.004 + k * (H / 2), -Z + 0.12]}><group rotation={[0, Math.PI, 0]} position={[0, 0, -0.12]}><Psu w={0.05} h={H / 2 - 0.008} p={[0, 0, 0]} d={0.24} state={modState(p.state)} /></group></Pick></Ex>)}
      {labels && <><Caption p={[0, H + 0.05, Z]} text="24 drives" sub="dual-ported NVMe" size={0.026} /><Caption p={[0, H + 0.05, -Z + 0.15]} text="Two controllers" sub="mirrored write cache" size={0.026} /></>}
    </group>
  );
}
export function TenantBox({ d }: DevProps) {
  const dm = dimsOf(d); const H = dm.h, Z = dm.d / 2;
  return (
    <group>
      <Pick id="blk" size={[W, H, dm.d]} pos={[0, 0, 0]} halo={false}>
        <B s={[W, H, dm.d]} m={MAT.steel()} />
        <Face w={W - 0.01} h={H - 0.006} p={[0, H / 2, Z + 0.001]} map={bezelTex('tenant', Math.max(1, d.ne.uSize ?? 1))} />
        <mesh position={[W / 2 - 0.04, H / 2, Z + 0.01]} rotation={[Math.PI / 2, 0, 0]} material={MAT.zinc()}><torusGeometry args={[0.008, 0.0022, 8, 20, Math.PI]} /></mesh>
        <B s={[0.022, 0.016, 0.008]} p={[W / 2 - 0.04, H / 2 - 0.018, Z + 0.004]} m={MAT.copper()} />
      </Pick>
    </group>
  );
}

/* ---------------------------------------------------------------------- the rack: this device slid out, neighbours in place */
const BEZEL: Record<string, BezelKind> = { GPU: 'gpu', Server: 'server', Storage: 'storage', Switch: 'switch', Router: 'router', Firewall: 'firewall', DWDM: 'optical', Access: 'router', 'Tenant gear': 'tenant' };
export function rackDims(d: NeData): Dims { const u = d.rack.heightU || 42; return { w: 0.6, h: u * U + 0.12, d: 1.07 }; }
export function RackView({ d }: DevProps) {
  const t = useT();
  const { rack, rackNes, ne } = d;
  const u = rack.heightU || 42, H = u * U, D = 1.07, RW = 0.6;
  const pct = rack.drawKw / Math.max(1, rack.budgetKw);
  const glass = MAT.glass();
  const frame = MAT.black();
  return (
    <group>
      {/* frame */}
      {[-1, 1].flatMap(sx => [-1, 1].map(sz => <B key={`${sx}${sz}`} s={[0.03, H + 0.1, 0.03]} p={[sx * (RW / 2 - 0.015), 0, sz * (D / 2 - 0.015)]} m={frame} />))}
      <B s={[RW, 0.05, D]} p={[0, H + 0.05, 0]} m={frame} />
      <B s={[RW, 0.04, D]} p={[0, -0.04, 0]} m={frame} />
      {[-1, 1].map(s => <mesh key={s} position={[s * (RW / 2 - 0.002), H / 2 + 0.03, 0]} material={glass} raycast={() => null}><boxGeometry args={[0.002, H + 0.06, D - 0.04]} /></mesh>)}
      {/* rails */}
      {[-1, 1].map(s => <B key={`r${s}`} s={[0.012, H, 0.02]} p={[s * (W / 2 + 0.012), 0, D / 2 - 0.08]} m={MAT.steelLight()} />)}
      {/* devices */}
      {rackNes.map(n => {
        const h = n.uSize * U - 0.002, y = (n.u - 1) * U + 0.001;
        const me = n.id === ne.id;
        const tex = bezelTex(BEZEL[n.role] ?? 'appliance', Math.max(1, n.uSize));
        const st: PState = n.opsState === 'planned' ? 'off' : n.opsState !== 'in-service' ? 'idle' : !n.reachable || n.worst === 'critical' ? 'bad' : n.worst ? 'warn' : 'ok';
        return (
          <Ex key={n.id} off={me ? [0, 0, 0] : [0, 0, 0]}>
            <Pick id={`ne:${n.id}`} size={[W, h, 0.8]} pos={[0, y, D / 2 - 0.08 - 0.4 + (me ? 0.38 : 0)]}>
              <B s={[W, h, 0.8]} m={n.opsState === 'planned' ? MAT.glass() : MAT.steel()} />
              {n.opsState !== 'planned' && <Face w={W - 0.004} h={h - 0.002} p={[0, h / 2, 0.401]} map={tex} />}
              <mesh position={[W / 2 - 0.012, h - 0.008, 0.402]} material={ledMat(st === 'bad' ? 'bad' : st === 'warn' ? 'warn' : st === 'ok' ? 'ok' : 'idle')}><boxGeometry args={[0.004, 0.004, 0.001]} /></mesh>
              {me && <Caption p={[0, h + 0.05, 0.4]} text={short(n.name)} sub="this device" size={0.035} />}
            </Pick>
          </Ex>
        );
      })}
      {/* rear PDUs (A + B) with outlet LEDs */}
      {[-1, 1].map((s, k) => (
        <Pick key={s} id={`pdu:${k ? 'B' : 'A'}`} size={[0.05, H, 0.06]} pos={[s * (RW / 2 - 0.06), 0, -D / 2 + 0.06]}>
          <B s={[0.05, H, 0.06]} m={MAT.black()} />
          {Array.from({ length: 18 }, (_, i) => <mesh key={i} position={[0, 0.06 + i * (H - 0.12) / 17, 0.031]} material={ledMat(pct >= 0.95 ? 'bad' : pct >= 0.85 ? 'warn' : 'ok')}><boxGeometry args={[0.004, 0.004, 0.001]} /></mesh>)}
        </Pick>))}
      {/* overhead busway and feeds */}
      <Pick id="busway" size={[1.6, 0.08, 0.14]} pos={[0, H + 0.32, -0.2]}>
        <B s={[1.6, 0.08, 0.14]} m={mat('busway', () => new THREE.MeshStandardMaterial({ color: '#C9A453', metalness: 0.6, roughness: 0.4 }))} />
        {[-1, 1].map(s => <mesh key={s} position={[s * (RW / 2 - 0.06), -0.12, 0.14]} material={MAT.black()}><cylinderGeometry args={[0.008, 0.008, 0.26, 8]} /></mesh>)}
      </Pick>
      {rack.liquid && <><B s={[0.03, H, 0.03]} p={[-RW / 2 + 0.1, 0, -D / 2 + 0.12]} m={MAT.tubeBlue()} /><B s={[0.03, H, 0.03]} p={[-RW / 2 + 0.14, 0, -D / 2 + 0.12]} m={MAT.tubeRed()} /></>}
      {/* cold aisle tile in front */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.039, D / 2 + 0.32]} receiveShadow raycast={() => null}><planeGeometry args={[0.6, 0.6]} /><meshStandardMaterial map={perfTex([10, 10], '#C7CED8')} /></mesh>
      {t.overlay === 'thermal' && <mesh position={[0, H / 2, D / 2 + 0.06]} raycast={() => null}><planeGeometry args={[RW, H]} /><meshBasicMaterial color={heatColor(rack.tempC + 30)} transparent opacity={0.18} depthWrite={false} /></mesh>}
    </group>
  );
}
