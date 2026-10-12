/* Realistic digital twin scene (second 3D view of the datacenter page).
   Visual language ported from the shared DC-Digital-View prototype: neutral, realistic
   equipment (textured bezels, perforated cabinet doors, overhead trays, white facility
   cabinets), health shown by LED light bars, beacons and floor halos — never by painting
   whole cabinets. Lit with a studio environment, soft shadows, AO and LED bloom.
   Geometry comes from the same deterministic layout as the schematic twin
   (twin/layout.ts) and every reading comes from the site record (TwinData). */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CameraControls, Environment, Lightformer, Line, Outlines, PerformanceMonitor, RoundedBox } from '@react-three/drei';
import { Bloom, EffectComposer, N8AO, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import type CameraControlsImpl from 'camera-controls';
import type { TwinData, TwinNe } from '../../../api/ext-twin';
import { FLOOR_H, PITCH, PLATE_T, RACK_D, RACK_W, U_H, cameraPose, rackWorld, type CoolingL, type FloorL, type Level, type PowerL, type RackL, type RoomL, type Sel, type TwinLayout } from '../twin/layout';
import type { Hover, Layer, PosMap } from '../twin/Scene';
import type { Anchor2 } from './anchors2';
import { DG_KEY, coolKey, powerKey, type Pick2 } from './units';
import { WalkControls, type WalkSpot } from './walk';
import type { Attention, AttSev } from '../twin/attention';
import { bezelTex, doorAlphaTex, epoxyTex, frontTex, perfTex, rackLabelTex, rackSideTex, rackTopTex, roofTex, tileTex, type BezelKind, type FrontKind } from './textures';

/* ---------------- palette & scales ---------------- */
export const ACCENT = '#1C81EF';
const OK_LIGHT = '#5AA9FF';
const LED: Record<string, string> = { critical: '#FF4D4F', major: '#FF8A3D', minor: '#F5B82E', warning: '#F5B82E', ok: OK_LIGHT, info: OK_LIGHT };
const ATT_C: Record<AttSev, string> = { critical: '#FF4D4F', major: '#FF8A3D' };
const mix = (c1: string, c2: string, k: number) => {
  const p = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1), b = p(c2);
  return '#' + a.map((x, i) => Math.round(x + (b[i] - x) * Math.min(1, Math.max(0, k))).toString(16).padStart(2, '0')).join('');
};
const scale = (stops: [number, string][]) => (v: number) => {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i]; return mix(ca, cb, (v - a) / (b - a)); }
  return stops[stops.length - 1][1];
};
export const tempColor = scale([[18, '#2F6FDE'], [21, '#2AA6C9'], [24, '#35B87A'], [27, '#E3A008'], [30, '#F0711C'], [33, '#E5534B']]);
export const loadColor = scale([[0, '#9CC7FF'], [40, '#2F6FDE'], [65, '#7A6FE0'], [80, '#E3A008'], [95, '#E5534B']]);
export const LEGENDS: Record<Layer, { c: string; l: string }[]> = {
  health: [{ c: OK_LIGHT, l: 'No alarms' }, { c: LED.minor, l: 'Minor' }, { c: LED.major, l: 'Major' }, { c: LED.critical, l: 'Critical' }],
  thermal: [{ c: '#2F6FDE', l: '18°' }, { c: '#2AA6C9', l: '21°' }, { c: '#35B87A', l: '24°' }, { c: '#E3A008', l: '27° high' }, { c: '#E5534B', l: '32°+ critical' }],
  power: [{ c: '#9CC7FF', l: '0%' }, { c: '#2F6FDE', l: '40%' }, { c: '#7A6FE0', l: '65%' }, { c: '#E3A008', l: '80%' }, { c: '#E5534B', l: '95%+ of budget' }],
  connectivity: [{ c: ACCENT, l: 'Edge link terminates' }, { c: LED.critical, l: 'Link down' }, { c: '#9AA3AD', l: 'Internal only' }]
};
const SEV_RANK: Record<string, number> = { critical: 0, major: 1, minor: 2, warning: 3 };
type RackSev = 'critical' | 'major' | 'minor' | null;
/* worst thing on a rack: attention map (device alarms, rack faults, hot, over budget) first, then minor device alarms */
function rackSev(rk: RackL, att?: Attention): RackSev {
  const a = att?.rack.get(rk.rack.id); if (a) return a;
  return rk.nes.some(n => n.worst) ? 'minor' : null;
}
function barColor(rk: RackL, layer: Layer, sev: RackSev) {
  if (layer === 'thermal') return tempColor(rk.rack.tempC);
  if (layer === 'power') return loadColor(rk.rack.budgetKw ? (rk.rack.drawKw / rk.rack.budgetKw) * 100 : 0);
  if (layer === 'connectivity') return rk.nes.some(n => n.linksDown) ? LED.critical : rk.nes.some(n => n.edge) ? ACCENT : '#9AA3AD';
  return sev ? LED[sev] : OK_LIGHT;
}
const bezelKind = (ne: TwinNe): BezelKind => ne.role === 'Server' ? 'server' : ne.role === 'GPU' ? 'gpu' : ne.role === 'Storage' ? 'storage' : ne.role === 'Switch' || ne.role === 'Access' ? 'switch' : ne.role === 'Router' ? 'router' : ne.role === 'Firewall' ? 'firewall' : ne.role === 'DWDM' ? 'optical' : ne.role === 'Tenant gear' ? 'tenant' : 'appliance';

interface Ctx { L: TwinLayout; data: TwinData; layer: Layer; sel: Sel; level: Level; onPick: (p: Pick2) => void; setHover: (h: Hover | null) => void; att?: Attention; unit?: string | null; walkTo?: (x: number, z: number) => void; hide?: Set<string> }
type Ev = { stopPropagation: () => void; instanceId?: number; delta?: number; point?: THREE.Vector3 };
/* a click that ended a drag (orbit, or looking around while walking) is not a pick */
const dragged = (e: Ev) => (e.delta ?? 0) > 6;
const NO_RAY = () => null;

/* ---------------- shared geometry & materials ---------------- */
const BOX = new THREE.BoxGeometry(1, 1, 1);
const PLANE = new THREE.PlaneGeometry(1, 1);
const CYL = new THREE.CylinderGeometry(0.035, 0.035, 1, 10);
const CYL_F = new THREE.CylinderGeometry(0.022, 0.022, 1, 8);
const MAT = {
  wire: new THREE.MeshStandardMaterial({ color: '#AEB7C2', metalness: 0.85, roughness: 0.3 }),
  fibre: new THREE.MeshStandardMaterial({ color: '#E3B341', roughness: 0.55 }),
  rod: new THREE.MeshStandardMaterial({ color: '#8B949E', metalness: 0.8, roughness: 0.3 }),
  blue: new THREE.MeshStandardMaterial({ color: '#2F6FB3', roughness: 0.6 }),
  yellow: new THREE.MeshStandardMaterial({ color: '#E8B21E', roughness: 0.6 }),
  mullion: new THREE.MeshStandardMaterial({ color: '#9AA7B6', metalness: 0.7, roughness: 0.3 }),
  band: new THREE.MeshStandardMaterial({ color: '#8E9AAA', roughness: 0.6 }),
  glass: new THREE.MeshPhysicalMaterial({ color: '#BFD6EE', transparent: true, opacity: 0.1, roughness: 0.05, depthWrite: false, side: THREE.BackSide }),
  plate: new THREE.MeshStandardMaterial({ color: '#121519', roughness: 0.9 }),
  rail: new THREE.MeshStandardMaterial({ color: '#8B949E', metalness: 0.8, roughness: 0.25 }),
  led: new THREE.MeshBasicMaterial({ toneMapped: false }),
  reserved: new THREE.MeshBasicMaterial({ color: '#9DB7D6', transparent: true, opacity: 0.16, depthWrite: false })
};
/* a rack in the facing row while another rack is open: faint glass outline, so the camera can look through it */
/* racks between the aisle camera and the selected rack = the facing row of the same rack pair */
export function facingRow(room: RoomL, sel: Sel): Set<string> {
  const out = new Set<string>();
  const me = sel.rack ? room.racks.find(r => r.rack.id === sel.rack) : undefined;
  if (!me) return out;
  const dir = me.rot === 0 ? 1 : -1;
  room.racks.forEach(r => { const dz = (r.z - me.z) * dir; if (r.rot !== me.rot && dz > 0.1 && dz < RACK_D * 2 + 1.8) out.add(r.rack.id); });
  return out;
}
interface RackMats { body: THREE.Material[]; door: THREE.Material; handle: THREE.Material; plinth: THREE.Material }
const RACK_M: Record<string, RackMats> = {};
function rackMaterials(ghost: boolean): RackMats {
  const key = ghost ? 'ghost' : 'solid';
  if (RACK_M[key]) return RACK_M[key];
  const op = ghost ? { transparent: true, opacity: 0.35 } : {};
  const side = new THREE.MeshStandardMaterial({ map: rackSideTex(), metalness: 0.5, roughness: 0.45, ...op });
  const top = new THREE.MeshStandardMaterial({ map: rackTopTex(), metalness: 0.4, roughness: 0.5, ...op });
  const dark = new THREE.MeshStandardMaterial({ color: '#15191E', metalness: 0.5, roughness: 0.5, ...op });
  const door = new THREE.MeshStandardMaterial({ color: '#1B2026', metalness: 0.6, roughness: 0.38, alphaMap: doorAlphaTex(), transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: ghost ? 0.35 : 1 });
  const handle = new THREE.MeshStandardMaterial({ color: '#AEB7C2', metalness: 0.9, roughness: 0.2, ...op });
  const plinth = new THREE.MeshStandardMaterial({ color: '#0D1013', roughness: 0.8, ...op });
  return (RACK_M[key] = { body: [side, side, top, dark, dark, dark], door, handle, plinth });
}
const LED_COLORS: Record<string, THREE.Color> = { 0: new THREE.Color('#3FDC74'), 1: new THREE.Color('#F5B82E'), 2: new THREE.Color('#FF8A3D'), 3: new THREE.Color('#FF4D4F'), u: new THREE.Color('#9AA3AD') };
const BEZEL_ON = new THREE.Color('#FFFFFF'), BEZEL_DIM = new THREE.Color('#8A9099');

const _o = new THREE.Object3D();
function writeMatrices(mesh: THREE.InstancedMesh, items: { m: THREE.Matrix4 }[]) {
  items.forEach((it, i) => mesh.setMatrixAt(i, it.m));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}
/* world matrix of a box placed at p (metres), rotated rotY, scaled s */
function mat(p: [number, number, number], rotY: number, s: [number, number, number]) {
  _o.position.set(...p); _o.rotation.set(0, rotY, 0); _o.scale.set(...s); _o.updateMatrix();
  return _o.matrix.clone();
}
function InstancedSet({ items, geometry, material, castShadow, noRay }: { items: { m: THREE.Matrix4 }[]; geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; castShadow?: boolean; noRay?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => { if (ref.current) writeMatrices(ref.current, items); }, [items]);
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={castShadow} raycast={noRay ? NO_RAY : undefined} />;
}

/* ---------------- scene ---------------- */
export function TwinScene2({ L, data, layer, sel, level, onPick, setHover, att, anchors, posRef, resetTick = 0, fx = true, unit = null, focusPose, walk = null, onWalkTo, hide }: Ctx & { anchors: Anchor2[]; posRef: MutableRefObject<PosMap>; resetTick?: number; fx?: boolean; focusPose?: [number[], number[]] | null; walk?: WalkSpot | null; onWalkTo?: (x: number, z: number) => void }) {
  const ctx: Ctx = { L, data, layer, sel, level, onPick, setHover, att, unit, walkTo: walk ? onWalkTo : undefined, hide: walk ? undefined : hide };
  const building = level === 'building';
  const [dpr, setDpr] = useState(1.5);
  const [post, setPost] = useState(fx);
  useEffect(() => { setPost(fx); }, [fx]);
  /* same poses as the schematic twin; the building view backs off a little so the facade, roof and DG stay in frame */
  const pose = useMemo<[number[], number[]]>(() => focusPose ?? aislePose(L, sel) ?? (() => { const [e, t] = cameraPose(L, sel); const k = sel.floor === null ? 1.2 : sel.room === null ? 1.22 : 1; return k === 1 ? [e, t] : [e.map((v, i) => t[i] + (v - t[i]) * k), t] as [number[], number[]]; })(), [L, sel, focusPose]);
  const floor = sel.floor !== null ? L.floors[sel.floor] : null;
  const groundY = building || !floor ? 0 : floor.y;
  const span = Math.max(L.building.w, L.building.d);
  return (
    <Canvas shadows="percentage" dpr={dpr} camera={{ fov: 34, near: 0.1, far: 500, position: pose[0] as [number, number, number] }}
      gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.95, preserveDrawingBuffer: true }}
      onPointerMissed={() => { if (!walk) onPick({}); }}>
      <PerformanceMonitor flipflops={3} onDecline={() => { setDpr(1); setPost(false); }} onFallback={() => { setDpr(1); setPost(false); }} />
      <color attach="background" args={['#D3DBE5']} />
      <fog attach="fog" args={['#D3DBE5', span * 4, span * 8]} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#FFFFFF', '#B9C4D2', 0.45]} />
      <directionalLight position={[-14, 30, 18]} intensity={1.35} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0005}
        shadow-camera-left={-span} shadow-camera-right={span} shadow-camera-top={span} shadow-camera-bottom={-span} shadow-camera-far={120} />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={1.6} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[30, 18, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-14, 5, 8]} rotation-y={Math.PI / 2} scale={[20, 4, 1]} />
        <Lightformer form="rect" intensity={1.0} position={[14, 5, -8]} rotation-y={-Math.PI / 2} scale={[20, 4, 1]} />
        <Lightformer form="ring" intensity={0.8} color="#CFE3FF" position={[0, 6, 16]} scale={6} />
      </Environment>
      {/* ground */}
      <mesh position={[0, groundY - 0.32, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[span * 6, span * 6]} />
        <meshStandardMaterial color="#BCC6D2" roughness={1} />
      </mesh>
      {building ? (
        <>
          {L.floors.map(f => <FloorLevel key={f.idx} floor={f} ctx={ctx} lite />)}
          <Roof L={L} />
        </>
      ) : floor && <FloorLevel floor={floor} ctx={ctx} lite={false} />}
      {L.dg && (building || sel.floor === 0) && <Generator ctx={ctx} y={groundY} />}
      <StaticShadows deps={`${level}|${sel.floor}|${sel.room}`} />
      <Projector anchors={anchors} posRef={posRef} />
      {walk ? <WalkControls spot={walk} L={L} /> : <Rig pose={pose} resetTick={resetTick} />}
      {post && (
        <EffectComposer multisampling={2}>
          <N8AO aoRadius={1.0} intensity={2.0} distanceFalloff={0.6} halfRes quality="performance" />
          <Bloom mipmapBlur luminanceThreshold={1.05} luminanceSmoothing={0.1} intensity={0.65} levels={5} />
          <Vignette offset={0.25} darkness={0.3} />
        </EffectComposer>
      )}
    </Canvas>
  );
}

/* Rack / device camera (as in the shared prototype): stand INSIDE the aisle in front of the rack and look
   along the row at an angle, never straight back from the rack — the facing row is only ~2.2 m away, so a
   straight-back camera ends up inside or behind the opposite cabinets. The camera goes to the side the open
   door does not swing to (local +x), and stays clear of the facing row's doors. */
function aislePose(L: TwinLayout, sel: Sel): [number[], number[]] | null {
  if (!sel.rack) return null;
  const rk = L.racks.find(r => r.rack.id === sel.rack); if (!rk) return null;
  const p = rackWorld(L, rk);
  const dir = rk.rot === 0 ? 1 : -1;           // front of the rack faces +z (row 0) or -z (row 1)
  const face = p.z + dir * (RACK_D / 2);        // world z of the rack's front face
  const ne = sel.ne ? rk.nes.find(n => n.id === sel.ne) : null;
  if (ne) {
    /* device: close, inside the cold aisle, slightly to the open-door-free side */
    const ty = p.y + (ne.u - 1 + ne.uSize / 2) * U_H + 0.04;
    return [[p.x + dir * 0.35, ty + 0.18, face + dir * 1.4], [p.x, ty, face]];
  }
  /* whole rack: front-on from 3.5 m so all of it fits; the facing row is faded to glass (facingRow) */
  const ty = p.y + rk.h * 0.5;
  return [[p.x + dir * 0.9, ty + 0.45, face + dir * 3.5], [p.x + dir * 0.05, ty, face]];
}

/* the plant does not move: render the shadow map a few times after mount, not every frame */
function StaticShadows({ deps }: { deps: string }) {
  const gl = useThree(s => s.gl);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    let n = 0;
    const id = setInterval(() => { gl.shadowMap.needsUpdate = true; if (++n > 4) clearInterval(id); }, 300);
    return () => clearInterval(id);
  }, [gl, deps]);
  return null;
}

/* projects every label anchor to canvas pixels each frame (read by the DOM label overlay) */
function Projector({ anchors, posRef }: { anchors: Anchor2[]; posRef: MutableRefObject<PosMap> }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const m = posRef.current;
    for (const a of anchors) {
      v.set(a.world[0], a.world[1], a.world[2]).project(camera);
      const vis = v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.1;
      m.set(a.id, [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height, vis]);
    }
  });
  return null;
}

function Rig({ pose, resetTick }: { pose: [number[], number[]]; resetTick: number }) {
  const ref = useRef<CameraControlsImpl>(null);
  const key = pose.flat().map(n => n.toFixed(2)).join(',');
  const first = useRef(true);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const [e, t] = pose;
    c.setLookAt(e[0], e[1], e[2], t[0], t[1], t[2], !first.current);
    first.current = false;
  }, [key, resetTick]); // eslint-disable-line react-hooks/exhaustive-deps
  return <CameraControls ref={ref} makeDefault minDistance={0.8} maxDistance={140} maxPolarAngle={Math.PI / 2.1} dollyToCursor smoothTime={0.55} />;
}

/* ---------------- one level ---------------- */
function FloorLevel({ floor, ctx, lite }: { floor: FloorL; ctx: Ctx; lite: boolean }) {
  const [hover, setHover] = useState(false);
  const sub = `${floor.rooms.length} room${floor.rooms.length > 1 ? 's' : ''} · ${floor.rooms.reduce((a, r) => a + r.racks.length, 0)} racks`;
  return (
    <group position={[0, floor.y, 0]}>
      {/* structural slab (top at PLATE_T) */}
      <mesh position={[0, PLATE_T - 0.15, 0]} receiveShadow castShadow={lite}
        onClick={lite ? (e: Ev) => { e.stopPropagation(); ctx.onPick({ floor: floor.idx }); } : ctx.walkTo ? (e: Ev) => { e.stopPropagation(); if (!dragged(e) && e.point) ctx.walkTo!(e.point.x, e.point.z); } : undefined}
        onPointerOver={lite ? (e: Ev) => { e.stopPropagation(); setHover(true); ctx.setHover({ kind: 'floor', title: floor.name, sub }); } : undefined}
        onPointerOut={lite ? () => { setHover(false); ctx.setHover(null); } : undefined}>
        <boxGeometry args={[floor.w + 1.0, 0.3, floor.d + 1.0]} />
        <meshStandardMaterial color={hover ? '#D6E4F7' : lite ? '#B9C3CF' : '#E6EAF0'} roughness={0.85} />
        {lite && hover && <Outlines thickness={0.08} color={ACCENT} />}
      </mesh>
      {lite && <Facade w={floor.w} d={floor.d} />}
      <group position={[0, PLATE_T, 0]}>
        {floor.rooms.map(r => <Room2 key={r.id} room={r} floor={floor} ctx={ctx} lite={lite} />)}
      </group>
    </group>
  );
}

/* glass curtain wall with mullions and spandrel bands around one level */
function Facade({ w, d }: { w: number; d: number }) {
  const H = FLOOR_H - 0.4;
  const L = useMemo(() => {
    const W = w + 0.9, D = d + 0.9, y = H / 2 + PLATE_T;
    const m: { m: THREE.Matrix4 }[] = [], bands: { m: THREE.Matrix4 }[] = [];
    for (let x = -W / 2; x <= W / 2 + 0.01; x += 2.5) [-D / 2, D / 2].forEach(z => m.push({ m: mat([x, y, z], 0, [0.08, H, 0.1]) }));
    for (let z = -D / 2 + 2.5; z < D / 2; z += 2.5) [-W / 2, W / 2].forEach(x => m.push({ m: mat([x, y, z], 0, [0.1, H, 0.08]) }));
    [[0, -D / 2, W, 0.12], [0, D / 2, W, 0.12]].forEach(([x, z, sx, sz]) => { bands.push({ m: mat([x, PLATE_T + 0.3, z], 0, [sx, 0.6, sz]) }); bands.push({ m: mat([x, PLATE_T + H * 0.55, z], 0, [sx, 0.06, 0.1]) }); });
    [[-W / 2, 0, 0.12, D], [W / 2, 0, 0.12, D]].forEach(([x, z, sx, sz]) => { bands.push({ m: mat([x, PLATE_T + 0.3, z], 0, [sx, 0.6, sz]) }); bands.push({ m: mat([x, PLATE_T + H * 0.55, z], 0, [0.1, 0.06, sz]) }); });
    return { m, bands, W, D, y };
  }, [w, d, H]);
  return (
    <group>
      <mesh position={[0, L.y, 0]} material={MAT.glass} raycast={NO_RAY}><boxGeometry args={[L.W, H, L.D]} /></mesh>
      <InstancedSet items={L.m} geometry={BOX} material={MAT.mullion} noRay />
      <InstancedSet items={L.bands} geometry={BOX} material={MAT.band} noRay />
    </group>
  );
}

/* roof slab with parapet on top of the highest floor */
function Roof({ L }: { L: TwinLayout }) {
  const top = L.floors[L.floors.length - 1];
  const y = top.y + FLOOR_H, W = top.w + 1.0, D = top.d + 1.0;
  const tex = useMemo(() => { const t = roofTex().clone(); t.needsUpdate = true; t.repeat.set(W / 3, D / 3); return t; }, [W, D]);
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, -0.15, 0]} castShadow receiveShadow raycast={NO_RAY}><boxGeometry args={[W, 0.3, D]} /><meshStandardMaterial color="#AEB8C5" roughness={0.85} /></mesh>
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={NO_RAY}><planeGeometry args={[W - 0.1, D - 0.1]} /><meshStandardMaterial map={tex} color="#C9D1DB" roughness={0.9} /></mesh>
      {[[0, -D / 2, W, 0.2], [0, D / 2, W, 0.2], [-W / 2, 0, 0.2, D], [W / 2, 0, 0.2, D]].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.3, z]} castShadow receiveShadow raycast={NO_RAY}><boxGeometry args={[w, 0.6, d]} /><meshStandardMaterial color="#C4CDD8" roughness={0.8} /></mesh>
      ))}
    </group>
  );
}

/* ---------------- rooms ---------------- */
function floorMap(room: RoomL) {
  const base = room.kind === 'it' ? tileTex() : epoxyTex('#D6DBE1');
  const t = base.clone(); t.needsUpdate = true;
  const k = room.kind === 'it' ? 0.6 : 3;
  t.repeat.set(room.w / k, room.d / k);
  return t;
}
/* floor heat-map under the racks (thermal overlay): inverse-distance blend of rack inlet temperatures */
function useHeat(room: RoomL, on: boolean) {
  const key = on && room.racks.length ? room.racks.map(r => r.rack.tempC).join(',') : '';
  return useMemo(() => {
    if (!key) return null;
    const pts = room.racks.map(r => ({ x: r.x + room.w / 2, z: r.z + room.d / 2, t: r.rack.tempC }));
    const cols = Math.max(2, Math.round(room.w * 2)), rows = Math.max(2, Math.round(room.d * 2)), data = new Uint8Array(cols * rows * 4);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const px = (i + 0.5) / 2, pz = (j + 0.5) / 2;
      let ws = 0, ts = 0;
      pts.forEach(p => { const w = 1 / (0.6 + (px - p.x) ** 2 + (pz - p.z) ** 2); ws += w; ts += w * p.t; });
      const c = new THREE.Color(tempColor(ts / ws - 0.6));
      const k = (j * cols + i) * 4;
      data[k] = c.r * 255; data[k + 1] = c.g * 255; data[k + 2] = c.b * 255; data[k + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, cols, rows, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    return tex;
  }, [room, key]);
}

function Room2({ room, floor, ctx, lite }: { room: RoomL; floor: FloorL; ctx: Ctx; lite: boolean }) {
  const faded = useMemo(() => (lite || ctx.walkTo ? new Set<string>() : new Set([...facingRow(room, ctx.sel), ...(ctx.hide ?? [])])), [room, ctx.sel, lite, ctx.walkTo, ctx.hide]);
  /* with a rack open, the cold-aisle frame in front of it goes too (user 12-Oct-2026: nothing between the camera and the rack) */
  const rackOpen = !lite && !ctx.walkTo && !!ctx.sel.rack && room.racks.some(r => r.rack.id === ctx.sel.rack);
  const fadedKey = [...faded].sort().join(',');
  const [hover, setHover] = useState(false);
  const selected = ctx.sel.room === room.id;
  const map = useMemo(() => (lite ? null : floorMap(room)), [room, lite]);
  const heat = useHeat(room, ctx.layer === 'thermal' && !lite);
  const rAtt = ctx.att?.room.get(room.id);
  const th = 0.1, inset = th / 2 + 0.015, wallH = lite ? 0.45 : 1.1;
  const cx = 0, cz = 0;
  const walls: [number, number, number, number][] = [
    [cx, -room.d / 2 + inset, room.w - 0.04, th], [cx, room.d / 2 - inset, room.w - 0.04, th],
    [-room.w / 2 + inset, cz, th, room.d - 2 * (inset + th / 2) - 0.02], [room.w / 2 - inset, cz, th, room.d - 2 * (inset + th / 2) - 0.02]
  ];
  const ring = selected && !lite ? ACCENT : rAtt ? ATT_C[rAtt] : hover && !lite ? '#8FB8F0' : null;
  const sub = room.kind === 'power' ? `${room.power.length} plant units` : `${room.racks.length} racks · ${room.racks.reduce((a, r) => a + r.nes.length, 0)} devices · ${room.cooling.length} cooling units${room.sensor ? ` · ${room.sensor.tempC}°C / ${room.sensor.humidity}% RH` : ''}`;
  const pick = (e: Ev) => {
    e.stopPropagation(); if (dragged(e)) return;
    if (ctx.walkTo && e.point) { ctx.walkTo(e.point.x, e.point.z); return; }
    ctx.onPick(lite ? { floor: floor.idx } : { floor: floor.idx, room: room.id });
  };
  const maxH = room.racks.length ? Math.max(...room.racks.map(r => r.h)) : 2.0;
  return (
    <group position={[room.x, 0, room.z]}>
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={pick}
        onPointerOver={(e: Ev) => { e.stopPropagation(); setHover(true); ctx.setHover({ kind: 'room', title: `${room.name} · ${floor.name}`, sub }); }}
        onPointerOut={() => { setHover(false); ctx.setHover(null); }}>
        <planeGeometry args={[room.w - 0.06, room.d - 0.06]} />
        <meshStandardMaterial map={map ?? undefined} color={lite ? '#E3E8EE' : '#F4F6F9'} roughness={room.kind === 'it' && !lite ? 0.38 : 0.75} metalness={0.02} envMapIntensity={room.kind === 'it' ? 0.9 : 0.5} />
      </mesh>
      {heat && (
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={NO_RAY}>
          <planeGeometry args={[room.w - 0.3, room.d - 0.3]} />
          <meshBasicMaterial map={heat} transparent opacity={0.62} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      {walls.map(([x, z, w, d], i) => (
        <group key={i}>
          <mesh position={[x, wallH / 2, z]} castShadow receiveShadow raycast={NO_RAY}><boxGeometry args={[w, wallH, d]} /><meshStandardMaterial color="#C9D1DC" roughness={0.85} /></mesh>
          <mesh position={[x, wallH + 0.012, z]} raycast={NO_RAY}><boxGeometry args={[w, 0.024, d + 0.01]} /><meshStandardMaterial color={ring || '#8E9AAA'} emissive={ring || '#000000'} emissiveIntensity={ring ? 0.9 : 0} toneMapped={!ring} /></mesh>
        </group>
      ))}
      {/* perforated cold-aisle tiles + containment (glass roof, end panels) */}
      {!lite && !rackOpen && room.aisles.filter(a => a.kind === 'cold' && room.racks.some(r => r.rot === 0 && r.z < a.z) && room.racks.some(r => r.rot !== 0 && r.z > a.z)).map((a, i) => <Containment key={i} x0={a.x - a.w / 2} x1={a.x + a.w / 2} z0={a.z - a.d / 2} z1={a.z + a.d / 2} h={maxH + 0.05} />)}
      {!lite && <CableTrays room={room} />}
      {room.racks.map(rk => <Rack2 key={rk.rack.id} rk={rk} ctx={ctx} lite={lite} fade={faded.has(rk.rack.id)} />)}
      {!lite && room.racks.length > 0 && <DeviceFaces room={room} ctx={ctx} hide={fadedKey} />}
      {room.cooling.filter(c => !ctx.hide?.has(coolKey(c.unit.id))).map(c => <CoolingUnit2 key={c.unit.id} c={c} ctx={ctx} lite={lite} />)}
      {room.power.filter(p => !ctx.hide?.has(powerKey(room.id, p.label))).map(p => <PowerUnit2 key={p.label} p={p} roomId={room.id} ctx={ctx} lite={lite} />)}
      {!lite && ctx.layer === 'connectivity' && room.racks.filter(r => r.nes.some(n => n.edge)).map(rk => {
        const down = rk.nes.some(n => n.linksDown); const sx = room.w / 2 + 0.9;
        return <Line key={`e${rk.rack.id}`} points={[[rk.x, rk.h + 0.4, rk.z], [sx, rk.h + 0.4, rk.z], [sx + 0.6, rk.h + 0.4, rk.z]]} color={down ? LED.critical : ACCENT} lineWidth={down ? 3 : 2} dashed={down} dashSize={0.15} gapSize={0.08} />;
      })}
    </group>
  );
}

/* cold-aisle containment: perforated tiles, glass roof, framed end panels */
function Containment({ x0, x1, z0, z1, h }: { x0: number; x1: number; z0: number; z1: number; h: number }) {
  const tex = useMemo(() => { const t = perfTex().clone(); t.needsUpdate = true; t.repeat.set((x1 - x0) / 0.6, (z1 - z0) / 0.6); return t; }, [x0, x1, z0, z1]);
  const frame = <meshStandardMaterial color="#C5CED9" metalness={0.5} roughness={0.35} />;
  const glass = <meshPhysicalMaterial color="#D7E8F7" transparent opacity={0.26} roughness={0.05} depthWrite={false} />;
  return (
    <group>
      <mesh position={[(x0 + x1) / 2, 0.008, (z0 + z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={NO_RAY}><planeGeometry args={[x1 - x0, z1 - z0]} /><meshStandardMaterial map={tex} roughness={0.8} /></mesh>
      <mesh position={[(x0 + x1) / 2, h + 0.02, (z0 + z1) / 2]} raycast={NO_RAY}><boxGeometry args={[x1 - x0, 0.02, z1 - z0]} />{glass}</mesh>
      {[x0, x1].map(x => (
        <group key={x}>
          <mesh position={[x, h / 2, (z0 + z1) / 2]} raycast={NO_RAY}><boxGeometry args={[0.02, h, z1 - z0]} />{glass}</mesh>
          {[z0, (z0 + z1) / 2, z1].map(z => <mesh key={z} position={[x, h / 2, z]} raycast={NO_RAY}><boxGeometry args={[0.05, h + 0.04, 0.05]} />{frame}</mesh>)}
          <mesh position={[x, h + 0.02, (z0 + z1) / 2]} raycast={NO_RAY}><boxGeometry args={[0.06, 0.06, z1 - z0]} />{frame}</mesh>
        </group>
      ))}
      {Array.from({ length: Math.max(1, Math.round((x1 - x0) / 1.5)) }, (_, i) => i).map((i, _, arr) => (
        <mesh key={i} position={[x0 + (i + 1) * ((x1 - x0) / (arr.length + 1)), h + 0.04, (z0 + z1) / 2]} raycast={NO_RAY}><boxGeometry args={[0.025, 0.03, z1 - z0]} />{frame}</mesh>
      ))}
    </group>
  );
}

/* overhead cable management per rack row: wire-basket power tray with rungs, yellow fibre channel,
   hanger rods, cable bundles and drops into every rack */
function trayLayout(room: RoomL) {
  const rows = new Map<number, RackL[]>();
  room.racks.forEach(r => rows.set(r.row, [...(rows.get(r.row) ?? []), r]));
  const rungs: { m: THREE.Matrix4 }[] = [], rails: { m: THREE.Matrix4 }[] = [], drops: { m: THREE.Matrix4 }[] = [], fibreDrops: { m: THREE.Matrix4 }[] = [], channel: { m: THREE.Matrix4 }[] = [], rods: { m: THREE.Matrix4 }[] = [];
  const bundles: { x: number; y: number; z: number; len: number; c: string; r: number }[] = [];
  rows.forEach(rk => {
    const face = rk[0].rot === 0 ? 1 : -1;
    const x0 = Math.min(...rk.map(r => r.x)) - PITCH / 2, x1 = Math.max(...rk.map(r => r.x)) + PITCH / 2, len = x1 - x0, cz = rk[0].z;
    const y = Math.max(...rk.map(r => r.h)) + 0.45;
    const bz = cz + 0.32 * face, fz = cz - 0.25 * face;
    for (let x = 0.06; x < len; x += 0.15) rungs.push({ m: mat([x0 + x, y, bz], 0, [0.012, 0.012, 0.36]) });
    [-0.18, 0.18].forEach(o => rails.push({ m: mat([x0 + len / 2, y + 0.03, bz + o], 0, [len, 0.07, 0.012]) }));
    channel.push({ m: mat([x0 + len / 2, y - 0.13, fz], 0, [len, 0.012, 0.3]) });
    [-0.15, 0.15].forEach(o => channel.push({ m: mat([x0 + len / 2, y - 0.09, fz + o], 0, [len, 0.09, 0.012]) }));
    for (let x = 0.3; x < len; x += 2.4) [bz, fz].forEach(zz => rods.push({ m: mat([x0 + x, y + 0.35, zz], 0, [0.014, 0.75, 0.014]) }));
    bundles.push({ x: x0 + len / 2, y: y + 0.025, z: bz - 0.07, len, c: '#2F6FB3', r: 0.045 }, { x: x0 + len / 2, y: y + 0.025, z: bz + 0.06, len, c: '#3C4652', r: 0.045 }, { x: x0 + len / 2, y: y - 0.1, z: fz, len, c: '#E8B21E', r: 0.035 });
    rk.forEach(r => {
      const dropLen = y - r.h;
      drops.push({ m: mat([r.x - 0.1, r.h + dropLen / 2, bz], 0, [1, dropLen, 1]) });
      fibreDrops.push({ m: mat([r.x + 0.12, r.h + (dropLen - 0.1) / 2, fz], 0, [1, dropLen - 0.1, 1]) });
    });
  });
  return { rungs, rails, drops, fibreDrops, channel, rods, bundles };
}
function CableTrays({ room }: { room: RoomL }) {
  const L = useMemo(() => trayLayout(room), [room]);
  if (!room.racks.length) return null;
  return (
    <group>
      <InstancedSet items={L.rungs} geometry={BOX} material={MAT.wire} noRay />
      <InstancedSet items={L.rails} geometry={BOX} material={MAT.wire} castShadow noRay />
      <InstancedSet items={L.channel} geometry={BOX} material={MAT.fibre} castShadow noRay />
      <InstancedSet items={L.rods} geometry={BOX} material={MAT.rod} noRay />
      <InstancedSet items={L.drops} geometry={CYL} material={MAT.blue} noRay />
      <InstancedSet items={L.fibreDrops} geometry={CYL_F} material={MAT.yellow} noRay />
      {L.bundles.map((b, i) => (
        <mesh key={i} position={[b.x, b.y, b.z]} rotation={[0, 0, Math.PI / 2]} castShadow raycast={NO_RAY}>
          <cylinderGeometry args={[b.r, b.r, b.len - 0.1, 12]} />
          <meshStandardMaterial color={b.c} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------------- facility units ---------------- */
const BODY: Record<FrontKind, string> = { crah: '#E8ECF0', ups: '#E8ECF0', battery: '#3A3F46', gen: '#E8ECF0', panel: '#E8ECF0', dark: '#2A2F35' };
type St = 'ok' | 'warn' | 'bad';
const ST_LED: Record<St, string> = { ok: '#3FDC74', warn: '#F5B82E', bad: '#FF4D4F' };
const ST_ATT: Record<St, AttSev | null> = { ok: null, warn: 'major', bad: 'critical' };
/* a white facility cabinet (CRAH / CRAC / CDU / UPS / rectifier) or dark battery bank, textured front and back */
function Cabinet({ title, sub, x, z, w, d, h, kind, st, ctx, lite, selectable }: { title: string; sub: string; x: number; z: number; w: number; d: number; h: number; kind: FrontKind; st: St; ctx: Ctx; lite: boolean; selectable?: Pick2 }) {
  const chosen = !!selectable?.unit && ctx.unit === selectable.unit;
  const [hover, setHover] = useState(false);
  const front = useMemo(() => (lite ? null : frontTex(kind)), [kind, lite]);
  const alarm = st !== 'ok';
  const ev = lite ? {} : {
    onClick: selectable ? (e: Ev) => { e.stopPropagation(); if (!dragged(e)) ctx.onPick(selectable); } : undefined,
    onPointerOver: (e: Ev) => { e.stopPropagation(); setHover(true); ctx.setHover({ kind: kind === 'crah' ? 'cooling' : 'power', title, sub: `${sub} · click to zoom to it` }); },
    onPointerOut: () => { setHover(false); ctx.setHover(null); }
  };
  const beaconY = h + 0.55;
  return (
    <group position={[x, 0, z]}>
      <RoundedBox args={[w, h, d]} radius={Math.min(0.05, h / 10)} smoothness={3} position={[0, h / 2, 0]} castShadow receiveShadow {...ev}>
        <meshStandardMaterial color={BODY[kind]} roughness={0.5} metalness={0.15} />
        {!lite && (hover || chosen) && <Outlines thickness={chosen ? 0.04 : 0.03} color={chosen ? ACCENT : '#7FB0F5'} />}
      </RoundedBox>
      {front && [1, -1].map(sgn => (
        <mesh key={sgn} position={[0, h / 2, sgn * (d / 2 + 0.003)]} rotation={[0, sgn === 1 ? 0 : Math.PI, 0]} raycast={NO_RAY}>
          <planeGeometry args={[w - 0.02, h - 0.06]} />
          <meshStandardMaterial map={front} roughness={0.55} metalness={0.15} />
        </mesh>
      ))}
      {!lite && <mesh position={[0, h - 0.08, d / 2 + 0.008]} raycast={NO_RAY}><boxGeometry args={[w * 0.5, 0.03, 0.012]} /><meshStandardMaterial color={ST_LED[st]} emissive={ST_LED[st]} emissiveIntensity={alarm ? 2.6 : 1.2} toneMapped={false} /></mesh>}
      {alarm && <Beacon y={beaconY} c={ATT_C[ST_ATT[st]!]} />}
      {alarm && !lite && st === 'bad' && <FloorHalo r={Math.max(w, d) * 0.75 + 0.3} c={LED.critical} />}
    </group>
  );
}
function CoolingUnit2({ c, ctx, lite }: { c: CoolingL; ctx: Ctx; lite: boolean }) {
  const u = c.unit;
  const st: St = u.status === 'Failed' ? 'bad' : u.status === 'Maintenance' ? 'warn' : 'ok';
  return <Cabinet title={u.name} sub={`${u.status} · ${u.type} · ${u.loadPct}% of ${u.capacityKw} kW · supply ${u.supplyC}°C / return ${u.returnC}°C`} x={c.x} z={c.z} w={c.w} d={0.8} h={2.0} kind="crah" st={st} ctx={ctx} lite={lite} selectable={{ unit: coolKey(u.id) }} />;
}
function PowerUnit2({ p, roomId, ctx, lite }: { p: PowerL; roomId: string; ctx: Ctx; lite: boolean }) {
  const sub = p.ups ? `${p.ups.state} · ${p.ups.loadPct}% of ${p.ups.capacityKw} kW · ${p.ups.redundancy} · ${p.ups.batteryMin} min autonomy` : p.kind === 'battery' ? 'DC plant battery bank' : 'AC → 48 V DC rectifier';
  return <Cabinet title={p.label} sub={sub} x={p.x} z={p.z} w={p.w} d={p.d} h={p.h} kind={p.kind === 'ups' ? 'ups' : p.kind === 'battery' ? 'battery' : 'panel'} st={p.state} ctx={ctx} lite={lite} selectable={{ unit: powerKey(roomId, p.label) }} />;
}
/* diesel generator outside the building: white canopy, exhaust stack, plinth, safety marking */
function Generator({ ctx, y }: { ctx: Ctx; y: number }) {
  const g = ctx.L.dg!; const dg = ctx.data.dc.power.dg;
  const [hover, setHover] = useState(false);
  const st: St = dg.result === 'Pass' ? 'ok' : 'bad';
  const front = frontTex('gen');
  const sub = `fuel ${dg.fuelPct}% · ${dg.runtimeH} h runtime · last test ${dg.result}`;
  return (
    <group position={[g.x, y, g.z]}>
      <mesh position={[0, 0.08, 0]} receiveShadow raycast={NO_RAY}><boxGeometry args={[g.w + 0.2, 0.16, g.d + 0.2]} /><meshStandardMaterial color="#2D333B" /></mesh>
      {[[0, -(g.d + 1) / 2, g.w + 1, 0.08], [0, (g.d + 1) / 2, g.w + 1, 0.08], [-(g.w + 1) / 2, 0, 0.08, g.d + 1], [(g.w + 1) / 2, 0, 0.08, g.d + 1]].map(([dx, dz, sw, sd], i) => (
        <mesh key={i} position={[dx, 0.012, dz]} rotation={[-Math.PI / 2, 0, 0]} raycast={NO_RAY}><planeGeometry args={[sw, sd]} /><meshStandardMaterial color="#E8B21E" roughness={0.6} /></mesh>
      ))}
      <RoundedBox args={[g.w, g.h, g.d]} radius={0.05} smoothness={3} position={[0, g.h / 2 + 0.16, 0]} castShadow receiveShadow
        onClick={(e: Ev) => { e.stopPropagation(); if (!dragged(e)) ctx.onPick({ unit: DG_KEY }); }}
        onPointerOver={(e: Ev) => { e.stopPropagation(); setHover(true); ctx.setHover({ kind: 'dg', title: `DG set ${dg.kva} kVA`, sub: `${sub} · click to zoom to it` }); }} onPointerOut={() => { setHover(false); ctx.setHover(null); }}>
        <meshStandardMaterial color="#E8ECF0" roughness={0.5} metalness={0.15} />
        {(hover || ctx.unit === DG_KEY) && <Outlines thickness={0.03} color={ctx.unit === DG_KEY ? ACCENT : '#7FB0F5'} />}
      </RoundedBox>
      {[1, -1].map(sgn => (
        <mesh key={sgn} position={[0, g.h / 2 + 0.16, sgn * (g.d / 2 + 0.003)]} rotation={[0, sgn === 1 ? 0 : Math.PI, 0]} raycast={NO_RAY}><planeGeometry args={[g.w - 0.02, g.h - 0.06]} /><meshStandardMaterial map={front} roughness={0.55} metalness={0.15} /></mesh>
      ))}
      <mesh position={[g.w * 0.32, g.h + 0.66, 0]} castShadow raycast={NO_RAY}><cylinderGeometry args={[0.13, 0.13, 1.0, 20]} /><meshStandardMaterial color="#59636F" metalness={0.6} roughness={0.35} /></mesh>
      <mesh position={[0, g.h + 0.08, g.d / 2 + 0.008]} raycast={NO_RAY}><boxGeometry args={[g.w * 0.5, 0.03, 0.012]} /><meshStandardMaterial color={ST_LED[st]} emissive={ST_LED[st]} emissiveIntensity={st === 'ok' ? 1.2 : 2.6} toneMapped={false} /></mesh>
      {st === 'bad' && <Beacon y={g.h + 0.9} c={LED.critical} />}
    </group>
  );
}

/* floating alert pin above an alerting asset */
function Beacon({ y, c }: { y: number; c: string }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { const g = ref.current; if (!g) return; g.position.y = y + Math.sin(clock.elapsedTime * 2.2) * 0.06; g.rotation.y += 0.02; });
  return (
    <group ref={ref} position={[0, y, 0]}>
      <mesh raycast={NO_RAY}><octahedronGeometry args={[0.16, 0]} /><meshStandardMaterial color={c} emissive={c} emissiveIntensity={2.2} toneMapped={false} /></mesh>
      <mesh position={[0, -0.22, 0]} raycast={NO_RAY}><coneGeometry args={[0.05, 0.16, 12]} /><meshStandardMaterial color={c} emissive={c} emissiveIntensity={1.5} toneMapped={false} /></mesh>
    </group>
  );
}
function FloorHalo({ r, c }: { r: number; c: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => { const m = ref.current; if (!m) return; const k = (clock.elapsedTime * 0.8) % 1; m.scale.setScalar(1 + k * 0.5); (m.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k); });
  return (
    <mesh ref={ref} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={NO_RAY}>
      <ringGeometry args={[r, r + 0.12, 48]} />
      <meshBasicMaterial color={c} transparent opacity={0.5} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/* ---------------- rack ---------------- */
/* front door, swings open on its hinge when the rack is selected (hinge on local -x) */
function RackDoor({ rk, open, M, label }: { rk: RackL; open: boolean; M: RackMats; label: string }) {
  const ref = useRef<THREE.Group>(null);
  const target = open ? -1.85 : 0;
  useFrame((_, dt) => {
    const g = ref.current; if (!g || g.rotation.y === target) return;
    const next = g.rotation.y + (target - g.rotation.y) * Math.min(1, dt * 5);
    g.rotation.y = Math.abs(next - target) < 0.002 ? target : next;
  });
  const w = RACK_W * 0.97, h = rk.h - 0.08;
  const tex = useMemo(() => rackLabelTex(label), [label]);
  return (
    <group ref={ref} position={[-(RACK_W / 2 - 0.01), 0, 0]}>
      <mesh position={[w / 2, h / 2 + 0.06, 0]} material={M.door} raycast={NO_RAY}><planeGeometry args={[w, h]} /></mesh>
      <mesh position={[w - 0.045, h * 0.55, 0.014]} material={M.handle} raycast={NO_RAY}><boxGeometry args={[0.016, 0.24, 0.022]} /></mesh>
      <mesh position={[w / 2, h - 0.03, 0.003]} raycast={NO_RAY}><planeGeometry args={[0.22, 0.047]} /><meshStandardMaterial map={tex} roughness={0.5} /></mesh>
    </group>
  );
}

function Rack2({ rk, ctx, lite, fade }: { rk: RackL; ctx: Ctx; lite: boolean; fade?: boolean }) {
  const [hover, setHover] = useState(false);
  /* the facing row of an open rack is left out entirely: a glass ghost still drew edges in front of the rack */
  if (fade) return null;
  const ghost = ctx.data.dc.status === 'planned' || (rk.nes.length === 0 && rk.reserved.length > 0);
  const M = rackMaterials(ghost);
  const selected = ctx.sel.rack === rk.rack.id;
  const sev = rackSev(rk, ctx.att);
  const bar = barColor(rk, ctx.layer, sev);
  const bright = ctx.layer !== 'health' || !!sev;
  const attSev = ctx.att?.rack.get(rk.rack.id);
  const h = rk.h;
  const showBeacon = !!attSev && (lite || ctx.level === 'floor' || (ctx.level === 'room' && !selected));
  const short = rk.rack.name.replace(`${ctx.data.dc.id}-`, '');
  const sub = `${rk.rack.role} · ${rk.rack.usedU}/${rk.rack.heightU} U · ${rk.rack.drawKw} / ${rk.rack.budgetKw} kW · ${rk.rack.tempC}°C inlet · ${rk.nes.length} devices`;
  const ev = lite ? {} : {
    onClick: (e: Ev) => { e.stopPropagation(); if (!dragged(e)) ctx.onPick({ rack: rk.rack.id }); },
    onPointerOver: (e: Ev) => { e.stopPropagation(); setHover(true); ctx.setHover({ kind: 'rack', title: rk.rack.name, sub }); },
    onPointerOut: () => { setHover(false); ctx.setHover(null); }
  };
  return (
    <group position={[rk.x, 0, rk.z]} rotation={[0, rk.rot, 0]}>
      <mesh position={[0, h / 2 + 0.03, 0]} castShadow receiveShadow material={lite ? undefined : M.body} {...ev}>
        <boxGeometry args={[RACK_W - 0.01, h - 0.06, RACK_D]} />
        {lite && <meshStandardMaterial color="#1E2329" metalness={0.55} roughness={0.42} transparent={ghost} opacity={ghost ? 0.35 : 1} />}
        {!lite && (selected || hover) && <Outlines thickness={selected ? 0.035 : 0.02} color={selected ? ACCENT : '#7FB0F5'} />}
      </mesh>
      {!lite && (
        <>
          <mesh position={[0, 0.03, 0]} material={M.plinth} raycast={NO_RAY}><boxGeometry args={[RACK_W - 0.03, 0.06, RACK_D - 0.05]} /></mesh>
          {/* rear door */}
          <mesh position={[0, (h - 0.08) / 2 + 0.06, -(RACK_D / 2 + 0.012)]} rotation={[0, Math.PI, 0]} material={M.door} raycast={NO_RAY}><planeGeometry args={[RACK_W * 0.97, h - 0.08]} /></mesh>
          {/* front: perforated door (opens when selected), ID plate, handle, LED light bar */}
          <group position={[0, 0, RACK_D / 2 + 0.022]}>
            <RackDoor rk={rk} open={selected} M={M} label={short} />
            <mesh position={[0, h - 0.025, 0.008]} raycast={NO_RAY}>
              <boxGeometry args={[RACK_W * 0.86, 0.02, 0.012]} />
              <meshStandardMaterial color={bar} emissive={bar} emissiveIntensity={bright ? 2.6 : 1.3} toneMapped={false} />
            </mesh>
          </group>
        </>
      )}
      {lite && <mesh position={[0, h + 0.03, 0]} raycast={NO_RAY}><boxGeometry args={[RACK_W * 0.8, 0.02, RACK_D * 0.8]} /><meshStandardMaterial color={bar} emissive={bar} emissiveIntensity={1.5} toneMapped={false} /></mesh>}
      {showBeacon && <Beacon y={h + 0.55} c={ATT_C[attSev!]} />}
      {attSev === 'critical' && !lite && !selected && <FloorHalo r={0.85} c={LED.critical} />}
    </group>
  );
}

/* ---------------- rack-mounted devices (instanced per room) ---------------- */
/* every device bezel in a room is drawn with one InstancedMesh per bezel texture, plus one for the
   status LEDs, the dark back plates and the mounting rails; clicks resolve via instanceId */
interface DevItem { id: string | null; ne?: TwinNe; rk: RackL; index: number; m: THREE.Matrix4; f: THREE.Matrix4 }
interface DevLayout { groups: { key: string; kind: BezelKind; U: number; items: DevItem[] }[]; leds: { id: string; index: number; m: THREE.Matrix4 }[]; plates: { m: THREE.Matrix4 }[]; rails: { m: THREE.Matrix4 }[]; reserved: { ne: TwinNe; m: THREE.Matrix4 }[]; byId: Record<string, DevItem> }
function deviceLayout(room: RoomL, hide: Set<string> = new Set()): DevLayout {
  const groups: Record<string, DevLayout['groups'][number]> = {}; const leds: DevLayout['leds'] = []; const plates: { m: THREE.Matrix4 }[] = []; const rails: { m: THREE.Matrix4 }[] = []; const reserved: DevLayout['reserved'] = []; const byId: Record<string, DevItem> = {};
  let index = 0;
  const base = new THREE.Object3D(), child = new THREE.Object3D();
  room.racks.forEach(rk => {
    if (hide.has(rk.rack.id)) return;
    base.position.set(rk.x, 0, rk.z); base.rotation.set(0, rk.rot, 0); base.updateMatrix();
    const at = (lx: number, ly: number, lz: number, sx: number, sy: number, sz: number) => { child.position.set(lx, ly, lz); child.scale.set(sx, sy, sz); child.updateMatrix(); return base.matrix.clone().multiply(child.matrix); };
    /* the device layer sits just in front of the cabinet body (whose front face is opaque) and behind the door */
    const zf = RACK_D / 2 + 0.008;
    plates.push({ m: at(0, rk.h / 2 + 0.03, RACK_D / 2 + 0.002, RACK_W * 0.9, rk.h - 0.08, 1) });
    [-1, 1].forEach(k => rails.push({ m: at(k * RACK_W * 0.44, rk.h / 2 + 0.03, RACK_D / 2 + 0.006, 0.025, rk.h - 0.08, 0.01) }));
    const place = (id: string | null, ne: TwinNe | undefined, u: number, uSize: number, kind: BezelKind) => {
      const hU = uSize * U_H, y = (u - 1) * U_H + hU / 2 + 0.04;
      const key = `${kind}-${uSize}`;
      const g = (groups[key] = groups[key] || { key, kind, U: uSize, items: [] });
      const item: DevItem = { id, ne, rk, index: index++, m: at(0, y, zf - 0.007, RACK_W * 0.86, hU * 0.94, 0.014), f: at(0, y, zf + 0.0015, RACK_W * 0.86 * 1.05, hU * 0.94 + 0.012, 1) };
      g.items.push(item);
      if (id) { byId[id] = item; leds.push({ id, index: item.index, m: at(RACK_W * 0.385, y + hU * 0.25, zf + 0.0025, 0.018, 0.012, 1) }); }
    };
    rk.nes.forEach(ne => place(ne.id, ne, ne.u, ne.uSize, bezelKind(ne)));
    rk.reserved.forEach(ne => { const hU = ne.uSize * U_H; reserved.push({ ne, m: at(0, (ne.u - 1) * U_H + hU / 2 + 0.04, zf - 0.007, RACK_W * 0.86, hU * 0.94, 0.014) }); });
    /* ODF / patching rack: optical distribution frame = passive patch panels in the free space at the top */
    if (/ODF|patch/i.test(rk.rack.role)) {
      const used = new Set<number>(); [...rk.nes, ...rk.reserved].forEach(n => { for (let k = 0; k < n.uSize; k++) used.add(n.u + k); });
      let n = 0; for (let u = rk.rack.heightU - 1; u >= 1 && n < 18; u--) if (!used.has(u)) { place(null, undefined, u, 1, 'patch'); n++; }
    }
  });
  return { groups: Object.values(groups), leds, plates, rails, reserved, byId };
}
/* one character per device: 0 ok · 1 minor · 2 major · 3 critical · u no telemetry (unmonitored / tenant-owned) · p passive */
const codeOf = (ne?: TwinNe) => !ne ? 'p' : ne.opsState !== 'in-service' ? 'u' : ne.worst ? String(3 - Math.min(2, SEV_RANK[ne.worst])) : '0';

function BezelGroup({ g, codes, ctx, onHover }: { g: DevLayout['groups'][number]; codes: string; ctx: Ctx; onHover: (id: string | null) => void }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(() => {
    const face = new THREE.MeshStandardMaterial({ map: bezelTex(g.kind, g.U), roughness: 0.5, metalness: 0.25 });
    const edge = new THREE.MeshStandardMaterial({ color: g.kind === 'patch' ? '#8B949E' : '#2A3037', roughness: 0.45, metalness: 0.6 });
    return [edge, edge, edge, edge, face, edge];
  }, [g]);
  useLayoutEffect(() => { if (ref.current) writeMatrices(ref.current, g.items); }, [g]);
  useLayoutEffect(() => {
    const m = ref.current; if (!m) return;
    g.items.forEach((it, i) => m.setColorAt(i, codes[it.index] === 'u' ? BEZEL_DIM : BEZEL_ON));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [g, codes]);
  const info = (it: DevItem) => {
    const ne = it.ne!;
    return { kind: 'ne' as const, title: ne.name, sub: `${ne.role} · ${ne.vendor} ${ne.model} · U${ne.u}${ne.uSize > 1 ? `–${ne.u + ne.uSize - 1}` : ''}${ne.opsState === 'tenant-owned' ? ' · tenant-owned' : ne.opsState !== 'in-service' ? ' · no telemetry' : ne.alarms ? ` · ${ne.alarms} alarm${ne.alarms > 1 ? 's' : ''}` : ' · healthy'}` };
  };
  return (
    <instancedMesh ref={ref} args={[BOX, material, g.items.length]}
      onClick={(e: Ev) => { e.stopPropagation(); if (dragged(e)) return; const it = g.items[e.instanceId ?? -1]; if (!it) return; ctx.onPick(it.id ? { rack: it.rk.rack.id, ne: it.id } : { rack: it.rk.rack.id }); }}
      onPointerMove={(e: Ev) => { e.stopPropagation(); const it = g.items[e.instanceId ?? -1]; if (!it) return; onHover(it.id); if (it.ne) ctx.setHover(info(it)); else ctx.setHover({ kind: 'ne', title: `${it.rk.rack.name} · patch panel`, sub: 'Optical distribution frame · passive, not monitored' }); }}
      onPointerOut={() => { onHover(null); ctx.setHover(null); }} />
  );
}

function DeviceFaces({ room, ctx, hide }: { room: RoomL; ctx: Ctx; hide: string }) {
  const L = useMemo(() => deviceLayout(room, new Set(hide ? hide.split(',') : [])), [room, hide]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const ledRef = useRef<THREE.InstancedMesh>(null);
  const codes = useMemo(() => { const arr: string[] = []; L.groups.forEach(g => g.items.forEach(it => { arr[it.index] = codeOf(it.ne); })); return arr.join(''); }, [L]);
  useLayoutEffect(() => { if (ledRef.current) writeMatrices(ledRef.current, L.leds); }, [L]);
  useLayoutEffect(() => {
    const m = ledRef.current; if (!m) return;
    L.leds.forEach((it, i) => m.setColorAt(i, LED_COLORS[codes[it.index]] || LED_COLORS[0]));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [L, codes]);
  const mark = (id: string | null, opacity: number) => {
    const it = id ? L.byId[id] : null; if (!it) return null;
    return (
      <mesh matrixAutoUpdate={false} matrix={it.f} renderOrder={5} raycast={NO_RAY}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={opacity} depthWrite={false} toneMapped={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
    );
  };
  return (
    <group>
      <InstancedSet items={L.plates} geometry={PLANE} material={MAT.plate} noRay />
      <InstancedSet items={L.rails} geometry={BOX} material={MAT.rail} noRay />
      {L.groups.map(g => <BezelGroup key={g.key} g={g} codes={codes} ctx={ctx} onHover={setHoverId} />)}
      {L.leds.length > 0 && <instancedMesh ref={ledRef} args={[PLANE, MAT.led, L.leds.length]} raycast={NO_RAY} />}
      {L.reserved.map(r => <mesh key={r.ne.id} matrixAutoUpdate={false} matrix={r.m} material={MAT.reserved} raycast={NO_RAY}><boxGeometry args={[1, 1, 1]} /></mesh>)}
      {mark(ctx.sel.ne, 0.35)}
      {hoverId !== ctx.sel.ne && mark(hoverId, 0.2)}
    </group>
  );
}
