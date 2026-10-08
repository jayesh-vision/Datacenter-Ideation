/* Device twin 3D kit (08-Oct-2026): the hardware vocabulary every device model is built from — sheet-metal chassis,
   port cages with link LEDs, fans that spin at their reported speed, finned heatsinks, cold plates, PCBs, DIMMs,
   power supplies — plus the two behaviours every part shares: it can be picked (hover outline, click → inspector,
   red / amber halo when it is faulty) and it can move when the device is exploded or its lid is opened. */
import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Billboard, Edges, Instance, Instances, RoundedBox } from '@react-three/drei';
import type { PState } from '../twin/model';

export type V3 = [number, number, number];
export const U = 0.0445, RACK_W = 0.44;

/* ------------------------------------------------------------ shared materials and canvas textures */
const texCache = new Map<string, THREE.Texture>();
function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: [number, number]) {
  const k = `${key}:${repeat?.join('x') ?? ''}`;
  const hit = texCache.get(k); if (hit) return hit;
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  texCache.set(k, t); return t;
}
/* hexagonal perforation (front bezels, PSU grilles) */
export const perfTex = (rep: [number, number] = [8, 2], tone = '#1B1F26') => canvasTex(`perf${tone}`, 128, 128, (g, w, h) => {
  g.fillStyle = tone; g.fillRect(0, 0, w, h); g.fillStyle = '#05070A';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.beginPath(); g.arc(x * 16 + (y % 2) * 8 + 4, y * 16 + 8, 5.2, 0, Math.PI * 2); g.fill(); }
}, rep);
/* PCB: solder mask, copper traces, vias */
export const pcbTex = (tone = '#0E3B2C', rep: [number, number] = [2, 2]) => canvasTex(`pcb${tone}`, 512, 512, (g, w, h) => {
  g.fillStyle = tone; g.fillRect(0, 0, w, h);
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.strokeStyle = 'rgba(190,160,80,.22)'; g.lineWidth = 2;
  for (let i = 0; i < 90; i++) { const x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); const L = 30 + rnd() * 120; rnd() > .5 ? g.lineTo(x + L, y) : g.lineTo(x, y + L); g.lineTo(x + L * .7, y + L * .7 * (rnd() > .5 ? 1 : 0)); g.stroke(); }
  g.fillStyle = 'rgba(210,190,120,.35)'; for (let i = 0; i < 260; i++) { g.beginPath(); g.arc(rnd() * w, rnd() * h, 1.6, 0, Math.PI * 2); g.fill(); }
}, rep);
/* silicon die: a faint grid of compute units; lit cells are drawn by the die component itself */
export const dieTex = () => canvasTex('die', 256, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#1B2233'); gr.addColorStop(.5, '#2B3550'); gr.addColorStop(1, '#141A28'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(140,170,255,.18)'; g.lineWidth = 1; for (let i = 0; i <= 16; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 16); g.lineTo(w, i * 16); g.stroke(); }
});
/* a printed label (model name on a bezel, silkscreen on a board) */
export const labelTex = (text: string, fg = '#C9D1DE', bg = 'rgba(0,0,0,0)', w = 512, h = 64, font = 600) => canvasTex(`lbl:${text}:${fg}:${bg}:${w}`, w, h, (g) => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = `${font} ${Math.round(h * 0.52)}px Poppins, Inter, sans-serif`; g.textBaseline = 'middle'; g.fillText(text, 10, h / 2);
});

const M = new Map<string, THREE.Material>();
export function mat(key: string, make: () => THREE.Material) { let m = M.get(key); if (!m) { m = make(); M.set(key, m); } return m; }
export const MAT = {
  steel: () => mat('steel', () => new THREE.MeshStandardMaterial({ color: '#5E656F', metalness: 0.7, roughness: 0.38 })),
  steelLight: () => mat('steelL', () => new THREE.MeshStandardMaterial({ color: '#C3C8CF', metalness: 0.75, roughness: 0.32 })),
  zinc: () => mat('zinc', () => new THREE.MeshStandardMaterial({ color: '#C9CDD2', metalness: 0.9, roughness: 0.28 })),
  black: () => mat('black', () => new THREE.MeshStandardMaterial({ color: '#23272E', metalness: 0.35, roughness: 0.55 })),
  hole: () => mat('hole', () => new THREE.MeshStandardMaterial({ color: '#050608', metalness: 0, roughness: 1 })),
  alu: () => mat('alu', () => new THREE.MeshStandardMaterial({ color: '#C4CAD3', metalness: 0.85, roughness: 0.3 })),
  copper: () => mat('copper', () => new THREE.MeshStandardMaterial({ color: '#C47A45', metalness: 0.9, roughness: 0.3 })),
  plasticGrey: () => mat('pg', () => new THREE.MeshStandardMaterial({ color: '#5A616C', metalness: 0.1, roughness: 0.7 })),
  green: () => mat('green', () => new THREE.MeshStandardMaterial({ map: pcbTex(), metalness: 0.15, roughness: 0.55 })),
  pcbBlack: () => mat('pcbB', () => new THREE.MeshStandardMaterial({ map: pcbTex('#15181D'), metalness: 0.2, roughness: 0.5 })),
  dimm: () => mat('dimm', () => new THREE.MeshStandardMaterial({ color: '#1E2A22', metalness: 0.3, roughness: 0.5 })),
  dimmHs: () => mat('dimmHs', () => new THREE.MeshStandardMaterial({ color: '#7E8794', metalness: 0.85, roughness: 0.3 })),
  substrate: () => mat('sub', () => new THREE.MeshStandardMaterial({ color: '#2E5B3F', metalness: 0.2, roughness: 0.45 })),
  hbm: () => mat('hbm', () => new THREE.MeshStandardMaterial({ color: '#3B414C', metalness: 0.6, roughness: 0.25 })),
  die: () => mat('die', () => new THREE.MeshStandardMaterial({ map: dieTex(), metalness: 0.7, roughness: 0.18 })),
  glass: () => mat('glass', () => new THREE.MeshPhysicalMaterial({ color: '#9FB4CC', transparent: true, opacity: 0.12, roughness: 0.1, metalness: 0, depthWrite: false })),
  tubeBlue: () => mat('tubeB', () => new THREE.MeshStandardMaterial({ color: '#2F7FD8', metalness: 0.2, roughness: 0.35 })),
  tubeRed: () => mat('tubeR', () => new THREE.MeshStandardMaterial({ color: '#D2533C', metalness: 0.2, roughness: 0.35 }))
};
const LED: Record<string, string> = { ok: '#30F070', warn: '#FFB020', bad: '#FF3A3A', off: '#1E2329', idle: '#2C333C', blue: '#4AA8FF' };
export const ledMat = (s: keyof typeof LED) => mat(`led:${s}`, () => new THREE.MeshStandardMaterial({ color: LED[s], emissive: LED[s], emissiveIntensity: s === 'off' || s === 'idle' ? 0 : 2.6, toneMapped: false }));
export const tintMat = (base: string, color: string) => mat(`tint:${base}:${color}`, () => {
  const b = (MAT as Record<string, () => THREE.Material>)[base]() as THREE.MeshStandardMaterial; const m = b.clone(); m.color = new THREE.Color(color); m.map = null; return m;
});
/* heat colour scale (thermal overlay): 25 °C blue → 55 green → 75 amber → 90 red */
export function heatColor(t: number) {
  const stops: [number, string][] = [[25, '#3B82F6'], [45, '#22C55E'], [65, '#EAB308'], [78, '#F97316'], [90, '#EF4444']];
  if (t <= stops[0][0]) return stops[0][1]; if (t >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
  const i = stops.findIndex(s => s[0] >= t); const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
  return '#' + new THREE.Color(c0).lerp(new THREE.Color(c1), (t - t0) / (t1 - t0)).getHexString();
}

/* ------------------------------------------------------------ interaction + motion context */
export interface TwinCtx {
  sel: string | null; hover: string | null; states: Map<string, PState>;
  onPick: (id: string | null) => void; onHover: (id: string | null, e?: ThreeEvent<PointerEvent>) => void;
  explode: React.MutableRefObject<number>; lid: React.MutableRefObject<number>; overlay: 'health' | 'thermal'; reduced: boolean; cap: number;
}
export const Ctx3 = createContext<TwinCtx | null>(null);
export const useT = () => useContext(Ctx3)!;

/* a pickable part: hover = outline, selected = blue outline, faulty = pulsing red / amber halo */
export function Pick({ id, size, pos = [0, 0, 0], children, halo = true }: { id: string; size: V3; pos?: V3; children: ReactNode; halo?: boolean }) {
  const t = useT();
  const st = t.states.get(id) ?? 'ok';
  const haloRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => { const m = haloRef.current?.material as THREE.MeshBasicMaterial | undefined; if (m) m.opacity = 0.07 + (t.reduced ? 0 : (Math.sin(clock.elapsedTime * 4) + 1) * 0.05); });
  const on = t.sel === id, hv = t.hover === id;
  return (
    <group position={pos}
      onClick={e => { e.stopPropagation(); t.onPick(id); }}
      onPointerOver={e => { e.stopPropagation(); t.onHover(id, e); }} onPointerOut={e => { e.stopPropagation(); t.onHover(null); }}>
      {children}
      {(on || hv) && <mesh position={[0, size[1] / 2, 0]} raycast={() => null}><boxGeometry args={[size[0] + 0.006, size[1] + 0.006, size[2] + 0.006]} /><meshBasicMaterial transparent opacity={on ? 0.1 : 0.05} color={on ? '#1C81EF' : '#FFFFFF'} depthWrite={false} />
        <Edges color={on ? '#1C81EF' : '#8EC5FF'} lineWidth={on ? 2.2 : 1.4} /></mesh>}
      {halo && (st === 'bad' || st === 'warn') && <mesh ref={haloRef} position={[0, size[1] / 2, 0]} raycast={() => null}><boxGeometry args={[size[0] + 0.008, size[1] + 0.008, size[2] + 0.008]} /><meshBasicMaterial transparent opacity={0.08} color={st === 'bad' ? '#FF2D2D' : '#FFA41B'} depthWrite={false} toneMapped={false} />
        <Edges color={st === 'bad' ? '#FF3B3B' : '#FFB020'} lineWidth={2} /></mesh>}
    </group>
  );
}

/* moves its children by `off` × the explode amount (0 → assembled, 1 → exploded) */
export function Ex({ off, children, lid }: { off: V3; children: ReactNode; lid?: boolean }) {
  const t = useT(); const g = useRef<THREE.Group>(null);
  useFrame(() => { const k = Math.max(t.explode.current, lid ? t.lid.current : 0); if (g.current) g.current.position.set(off[0] * k, off[1] * k, off[2] * k); });
  return <group ref={g}>{children}</group>;
}

/* ------------------------------------------------------------ primitives */
export function B({ s, p = [0, 0, 0], m, cast = true, r }: { s: V3; p?: V3; m: THREE.Material; cast?: boolean; r?: number }) {
  if (r) return <RoundedBox args={s} radius={r} smoothness={2} position={[p[0], p[1] + s[1] / 2, p[2]]} material={m} castShadow={cast} receiveShadow />;
  return <mesh position={[p[0], p[1] + s[1] / 2, p[2]]} material={m} castShadow={cast} receiveShadow><boxGeometry args={s} /></mesh>;
}
/* a face plane (texture on the front of something); `p` is its centre */
export function Face({ w, h, p, map, rotY = 0, emissive }: { w: number; h: number; p: V3; map: THREE.Texture; rotY?: number; emissive?: boolean }) {
  return <mesh position={p} rotation={[0, rotY, 0]} raycast={() => null}><planeGeometry args={[w, h]} /><meshStandardMaterial map={map} transparent metalness={0.3} roughness={0.6} toneMapped={!emissive} /></mesh>;
}

/* axial fan: frame, hub, pitched blades; spins at `rpm` share (0..1); faulty fans stop */
export function Fan({ d, p, rotX = 0, rotY = 0, speed = 0.6, state = 'ok', depth = 0.028 }: { d: number; p: V3; rotX?: number; rotY?: number; speed?: number; state?: PState; depth?: number }) {
  const t = useT(); const rot = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (rot.current && state !== 'bad' && !t.reduced) rot.current.rotation.z += dt * (6 + speed * 28); });
  const blades = useMemo(() => Array.from({ length: 7 }, (_, i) => (i / 7) * Math.PI * 2), []);
  return (
    <group position={p} rotation={[rotX, rotY, 0]}>
      <mesh material={MAT.black()} castShadow><boxGeometry args={[d, d, depth]} /></mesh>
      <mesh material={MAT.hole()} position={[0, 0, 0.0005]}><cylinderGeometry args={[d * 0.47, d * 0.47, depth + 0.001, 28]} /><meshStandardMaterial color="#07080A" /></mesh>
      <group ref={rot} position={[0, 0, depth / 2 - 0.004]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={MAT.plasticGrey()}><cylinderGeometry args={[d * 0.15, d * 0.15, 0.008, 18]} /></mesh>
        {blades.map(a => <mesh key={a} rotation={[0.35, 0, a]} position={[Math.cos(a + Math.PI / 2) * d * 0.25, Math.sin(a + Math.PI / 2) * d * 0.25, 0]} material={state === 'bad' ? ledMat('bad') : MAT.plasticGrey()}><boxGeometry args={[d * 0.14, d * 0.3, 0.002]} /></mesh>)}
      </group>
      {/* finger guard */}
      {[0.42, 0.3, 0.18].map(r => <mesh key={r} position={[0, 0, depth / 2 + 0.001]} material={MAT.zinc()}><torusGeometry args={[d * r, 0.0007, 4, 32]} /></mesh>)}
    </group>
  );
}

/* finned heatsink (fins run along z = airflow front → back) */
export function Heatsink({ w, h, d, p, fins, m, base = 0.006 }: { w: number; h: number; d: number; p: V3; fins?: number; m?: THREE.Material; base?: number }) {
  const n = fins ?? Math.max(6, Math.round(w / 0.0028));
  const mm = m ?? MAT.alu();
  return (
    <group position={p}>
      <B s={[w, base, d]} m={mm} />
      <Instances limit={n} material={mm} castShadow receiveShadow>
        <boxGeometry args={[0.0006, h - base, d]} />
        {Array.from({ length: n }, (_, i) => <Instance key={i} position={[-w / 2 + (i + 0.5) * (w / n), base + (h - base) / 2, 0]} />)}
      </Instances>
    </group>
  );
}

/* a row of port cages on a faceplate (front = +z); each is pickable by id `if:<name>` */
export interface PortSpec { id: string; state: PState; util: number; kind: 'osfp' | 'qsfp' | 'sfp' | 'rj45' | 'lc' }
const CAGE: Record<PortSpec['kind'], [number, number]> = { osfp: [0.0228, 0.0130], qsfp: [0.0185, 0.0098], sfp: [0.0142, 0.0098], rj45: [0.0160, 0.0135], lc: [0.0070, 0.0090] };
export function PortField({ ports, x0, x1, y, z, rows = 2, gap = 0.003, depth = 0.05, startRowTop = true }: { ports: PortSpec[]; x0: number; x1: number; y: number; z: number; rows?: 1 | 2; gap?: number; depth?: number; startRowTop?: boolean }) {
  const t = useT();
  if (!ports.length) return null;
  const k = ports[0].kind; const [cw, ch] = CAGE[k];
  const cols = Math.ceil(ports.length / rows);
  const pitch = Math.min(cw + gap, (x1 - x0) / cols);
  const w = Math.min(cw, pitch - 0.001);
  const xs = x0 + ((x1 - x0) - cols * pitch) / 2 + pitch / 2;
  const pos = (i: number): V3 => { const c = rows === 2 ? Math.floor(i / 2) : i, r = rows === 2 ? i % 2 : 0; return [xs + c * pitch, y + (rows === 2 ? ((startRowTop ? 1 - r : r) * (ch + 0.004)) : 0), z]; };
  const blink = useRef(0);
  const leds = useRef<THREE.InstancedMesh>(null);
  useFrame(({ clock }) => { blink.current = clock.elapsedTime; });
  return (
    <group>
      {/* metal shells */}
      <Instances limit={ports.length} material={k === 'rj45' ? MAT.black() : MAT.zinc()} castShadow>
        <boxGeometry args={[w, ch, depth]} />
        {ports.map((p, i) => { const q = pos(i); return <Instance key={p.id} position={[q[0], q[1] + ch / 2, q[2] - depth / 2]} onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); t.onPick(p.id); }} onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); t.onHover(p.id, e); }} onPointerOut={() => t.onHover(null)} />; })}
      </Instances>
      {/* dark openings (filled with an optic when the port is in use) */}
      <Instances limit={ports.length} material={MAT.hole()}>
        <boxGeometry args={[w * 0.78, ch * 0.66, 0.002]} />
        {ports.map((p, i) => { const q = pos(i); return <Instance key={p.id} position={[q[0], q[1] + ch / 2, q[2] + 0.0006]} />; })}
      </Instances>
      {/* optics / cables in used ports */}
      <Instances limit={ports.length} material={MAT.steelLight()}>
        <boxGeometry args={[w * 0.66, ch * 0.5, 0.012]} />
        {ports.filter(p => p.state !== 'off' && p.state !== 'idle').map(p => { const q = pos(ports.indexOf(p)); return <Instance key={p.id} position={[q[0], q[1] + ch / 2, q[2] + 0.006]} />; })}
      </Instances>
      {/* link LEDs */}
      {(['ok', 'warn', 'bad'] as const).map(s => {
        const on = ports.filter(p => p.state === s); if (!on.length) return null;
        return <Instances key={s} ref={s === 'ok' ? leds : undefined} limit={on.length} material={ledMat(s)}>
          <boxGeometry args={[0.0022, 0.0016, 0.001]} />
          {on.map(p => { const q = pos(ports.indexOf(p)); return <Instance key={p.id} position={[q[0] + w / 2 - 0.0016, q[1] + ch + 0.0015, q[2] + 0.0008]} />; })}
        </Instances>;
      })}
      {/* selected / hovered port: highlight ring */}
      {ports.map((p, i) => (t.sel === p.id || t.hover === p.id) && (() => { const q = pos(i); return <mesh key={`h${p.id}`} position={[q[0], q[1] + ch / 2, q[2] + 0.002]} raycast={() => null}><boxGeometry args={[w + 0.003, ch + 0.003, 0.003]} /><meshBasicMaterial color={t.sel === p.id ? '#1C81EF' : '#8EC5FF'} transparent opacity={0.85} toneMapped={false} /></mesh>; })())}
    </group>
  );
}

/* power supply module seen from the rear: handle, grille fan, status LED */
export function Psu({ w, h, p, d = 0.32, state = 'ok' }: { w: number; h: number; p: V3; d?: number; state?: PState }) {
  return (
    <group position={p}>
      <B s={[w, h, d]} p={[0, 0, -d / 2]} m={MAT.steel()} />
      <Face w={w * 0.96} h={h * 0.92} p={[0, h / 2, 0.0008]} map={perfTex([3, 1], '#2A2F37')} />
      <B s={[0.006, h * 0.5, 0.012]} p={[w / 2 - 0.012, h * 0.25, 0.006]} m={MAT.zinc()} />
      <mesh position={[-w / 2 + 0.01, h * 0.75, 0.002]} material={ledMat(state === 'bad' ? 'bad' : state === 'warn' ? 'warn' : 'ok')}><boxGeometry args={[0.003, 0.003, 0.002]} /></mesh>
    </group>
  );
}

/* DIMM row */
export function Dimms({ n, p, pitch = 0.0085, h = 0.032, d = 0.133, heatspreader = true }: { n: number; p: V3; pitch?: number; h?: number; d?: number; heatspreader?: boolean }) {
  return (
    <group position={p}>
      <Instances limit={n} material={heatspreader ? MAT.dimmHs() : MAT.dimm()} castShadow>
        <boxGeometry args={[0.0028, h, d]} />
        {Array.from({ length: n }, (_, i) => <Instance key={i} position={[(i - (n - 1) / 2) * pitch, h / 2, 0]} />)}
      </Instances>
    </group>
  );
}

/* floating caption (exploded view): a camera-facing tag drawn on a canvas — no font download */
export const tagTex = (text: string, sub?: string) => canvasTex(`tag:${text}:${sub ?? ''}`, 512, sub ? 150 : 96, (g, w, h) => {
  g.fillStyle = 'rgba(255,255,255,0.96)'; g.strokeStyle = 'rgba(15,23,42,0.18)'; g.lineWidth = 3;
  const r = 22; g.beginPath(); g.moveTo(r, 2); g.arcTo(w - 2, 2, w - 2, h - 2, r); g.arcTo(w - 2, h - 2, 2, h - 2, r); g.arcTo(2, h - 2, 2, 2, r); g.arcTo(2, 2, w - 2, 2, r); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#1F2633'; g.font = '600 46px Poppins, Inter, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(text, w / 2, sub ? 52 : h / 2, w - 30);
  if (sub) { g.fillStyle = '#5B6475'; g.font = '400 34px Inter, sans-serif'; g.fillText(sub, w / 2, 108, w - 30); }
});
export function Caption({ p, text, sub, size = 0.05 }: { p: V3; text: string; sub?: string; size?: number }) {
  const cap = useT().cap; size = Math.max(size, 0.018) * cap;
  const t = tagTex(text, sub); const ar = (t.image as HTMLCanvasElement).height / (t.image as HTMLCanvasElement).width;
  return <Billboard position={p}><mesh raycast={() => null} renderOrder={10}><planeGeometry args={[size * 2.7, size * 2.7 * ar]} /><meshBasicMaterial map={t} transparent depthTest={false} toneMapped={false} /></mesh></Billboard>;
}
