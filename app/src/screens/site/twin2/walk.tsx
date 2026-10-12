/* Walk mode for the realistic twin (user, 12-Oct-2026: "street view … move to any place inside the digital twin").
   An eye-level camera on the open floor: drag to look around, click the floor to walk there (a ring shows the
   spot), W A S D / arrow keys to move, ← → to turn, scroll to zoom. Racks and plant cabinets block the way.
   Picking a rack, device or plant unit walks up to it (Twin2 builds the spot, this glides there). */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PLATE_T, RACK_D, RACK_W, U_H, rackWorld, type Sel, type TwinLayout } from '../twin/layout';
import { unitFront, type PlantUnit } from './units';

export const EYE = 1.6;
const FOV = 62;
/* where to stand: eye position, an optional point to look at, the floor it is on; `key` changes = glide */
export interface WalkSpot { key: string; floorIdx: number; eye: [number, number, number]; look?: [number, number, number] }

const eyeY = (L: TwinLayout, fi: number) => L.floors[fi].y + PLATE_T + EYE;

/* the spot in front of the current selection (rack → its cold-aisle side, device → close in, unit → its front) */
export function walkSpot(L: TwinLayout, sel: Sel, unit?: PlantUnit): WalkSpot {
  if (unit) {
    const fi = unit.floorIdx, y = unit.roomId ? eyeY(L, fi) : EYE + 0.16;
    const dir = unitFront(unit, L);
    return { key: `u${unit.key}`, floorIdx: fi, eye: [unit.world[0], y, unit.world[2] + dir * (unit.d / 2 + 1.7)], look: [unit.world[0], unit.world[1] + unit.h * 0.55, unit.world[2]] };
  }
  const rk = sel.rack ? L.racks.find(r => r.rack.id === sel.rack) : undefined;
  if (rk) {
    const room = L.rooms.find(r => r.racks.includes(rk))!;
    const p = rackWorld(L, rk); const dir = rk.rot === 0 ? 1 : -1; const face = p.z + dir * (RACK_D / 2);
    const ne = sel.ne ? rk.nes.find(n => n.id === sel.ne) : undefined;
    const ly = ne ? p.y + (ne.u - 1 + ne.uSize / 2) * U_H : p.y + rk.h * 0.55;
    return { key: `k${rk.rack.id}${ne?.id ?? ''}`, floorIdx: room.floorIdx, eye: [p.x, eyeY(L, room.floorIdx), face + dir * (ne ? 0.85 : 1.15)], look: [p.x, ly, face] };
  }
  const fi = sel.floor ?? 0;
  const room = (sel.room !== null ? L.rooms.find(r => r.id === sel.room) : undefined) ?? L.floors[fi].rooms.find(r => r.kind === 'it') ?? L.floors[fi].rooms[0];
  const y = eyeY(L, fi);
  return { key: `r${room?.id ?? fi}`, floorIdx: fi, eye: [room ? room.x : 0, y, room ? room.z + room.d / 2 - 0.7 : 0], look: [room ? room.x : 0, y - 0.35, room ? room.z : -1] };
}

/* footprints you cannot walk through (racks, cabinets), with a little elbow room */
function obstacles(L: TwinLayout, fi: number) {
  const out: [number, number, number, number][] = [];
  const pad = 0.28;
  for (const room of L.floors[fi].rooms) {
    for (const rk of room.racks) { const x = room.x + rk.x, z = room.z + rk.z; out.push([x - RACK_W / 2 - pad, x + RACK_W / 2 + pad, z - RACK_D / 2 - pad, z + RACK_D / 2 + pad]); }
    for (const c of room.cooling) { const x = room.x + c.x, z = room.z + c.z; out.push([x - c.w / 2 - pad, x + c.w / 2 + pad, z - 0.4 - pad, z + 0.4 + pad]); }
    for (const p of room.power) { const x = room.x + p.x, z = room.z + p.z; out.push([x - p.w / 2 - pad, x + p.w / 2 + pad, z - p.d / 2 - pad, z + p.d / 2 + pad]); }
  }
  return out;
}

export function WalkControls({ spot, L }: { spot: WalkSpot; L: TwinLayout }) {
  const { camera, gl } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const pos = useRef(new THREE.Vector3(...spot.eye));
  const yaw = useRef(0), pitch = useRef(0);
  const glide = useRef<{ from: THREE.Vector3; to: THREE.Vector3; yaw0: number; yaw1: number; p0: number; p1: number; t: number } | null>(null);
  const keys = useRef(new Set<string>());
  const ring = useRef<THREE.Mesh>(null);
  const blocks = useMemo(() => obstacles(L, spot.floorIdx), [L, spot.floorIdx]);
  const half = useMemo(() => ({ w: L.building.w / 2 - 0.4, d: L.building.d / 2 - 0.4 }), [L]);
  const free = (x: number, z: number) => Math.abs(x) < half.w && Math.abs(z) < half.d && !blocks.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1);

  /* fly to a new spot (selection changed, or the floor was clicked) */
  useEffect(() => {
    const to = new THREE.Vector3(...spot.eye);
    let y1 = yaw.current, p1 = pitch.current;
    if (spot.look) {
      const d = new THREE.Vector3(...spot.look).sub(to);
      y1 = Math.atan2(-d.x, -d.z); p1 = Math.atan2(d.y, Math.hypot(d.x, d.z));
      /* turn the short way round */
      while (y1 - yaw.current > Math.PI) y1 -= 2 * Math.PI;
      while (y1 - yaw.current < -Math.PI) y1 += 2 * Math.PI;
    }
    glide.current = { from: pos.current.clone(), to, yaw0: yaw.current, yaw1: y1, p0: pitch.current, p1, t: 0 };
  }, [spot.key]); // eslint-disable-line react-hooks/exhaustive-deps

  /* first frame: start from where the orbit camera was, keep its heading */
  useEffect(() => {
    pos.current.copy(cam.position);
    const e = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ');
    yaw.current = e.y; pitch.current = Math.max(-1.2, Math.min(1.2, e.x));
    if (glide.current) { glide.current.from = pos.current.clone(); glide.current.yaw0 = yaw.current; glide.current.p0 = pitch.current; }
    const fov0 = cam.fov; cam.fov = FOV; cam.updateProjectionMatrix();
    return () => { cam.fov = fov0; cam.updateProjectionMatrix(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* drag to look, wheel to zoom, keys to move, ring follows the pointer on the floor */
  useEffect(() => {
    const el = gl.domElement;
    let down: { x: number; y: number } | null = null;
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(spot.eye[1] - EYE));
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onMove = (e: PointerEvent) => {
      if (down && e.buttons) {
        yaw.current += (e.clientX - down.x) * 0.0035;
        pitch.current = Math.max(-1.2, Math.min(1.2, pitch.current + (e.clientY - down.y) * 0.0035));
        down = { x: e.clientX, y: e.clientY }; glide.current = null;
      }
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      const m = ring.current; if (!m) return;
      const ok = ray.ray.intersectPlane(plane, hit) && hit.distanceTo(pos.current) < 40 && free(hit.x, hit.z);
      m.visible = !!ok; if (ok) m.position.set(hit.x, hit.y + 0.02, hit.z);
    };
    const onUp = () => { down = null; };
    const onLeave = () => { if (ring.current) ring.current.visible = false; };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); cam.fov = Math.max(28, Math.min(80, cam.fov + Math.sign(e.deltaY) * 4)); cam.updateProjectionMatrix(); };
    const typing = () => { const a = document.activeElement; return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || (a as HTMLElement).isContentEditable); };
    const kd = (e: KeyboardEvent) => { if (typing()) return; const k = e.key.toLowerCase(); if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { keys.current.add(k); if (k.startsWith('arrow')) e.preventDefault(); glide.current = null; } };
    const ku = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    el.addEventListener('pointerdown', onDown); window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    el.addEventListener('pointerleave', onLeave); el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('blur', blur);
    return () => {
      el.removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointerleave', onLeave); el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', blur);
    };
  }, [gl, cam, spot.eye[1], blocks]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    const g = glide.current;
    if (g) {
      g.t = Math.min(1, g.t + dt / Math.max(0.45, Math.min(1.4, g.from.distanceTo(g.to) / 4)));
      const k = g.t < 0.5 ? 2 * g.t * g.t : 1 - (-2 * g.t + 2) ** 2 / 2;
      pos.current.lerpVectors(g.from, g.to, k);
      yaw.current = g.yaw0 + (g.yaw1 - g.yaw0) * k; pitch.current = g.p0 + (g.p1 - g.p0) * k;
      if (g.t >= 1) glide.current = null;
    }
    const K = keys.current;
    if (K.size) {
      const sp = (K.has('shift') ? 4.2 : 2.1) * Math.min(dt, 0.05);
      if (K.has('arrowleft') || K.has('q')) yaw.current += 1.6 * Math.min(dt, 0.05);
      if (K.has('arrowright') || K.has('e')) yaw.current -= 1.6 * Math.min(dt, 0.05);
      const f = (K.has('w') || K.has('arrowup') ? 1 : 0) - (K.has('s') || K.has('arrowdown') ? 1 : 0);
      const s = (K.has('d') ? 1 : 0) - (K.has('a') ? 1 : 0);
      if (f || s) {
        const fx = -Math.sin(yaw.current), fz = -Math.cos(yaw.current);
        const nx = pos.current.x + (fx * f + -fz * s) * sp, nz = pos.current.z + (fz * f + fx * s) * sp;
        /* slide along obstacles: try both axes, then each one */
        if (free(nx, nz)) { pos.current.x = nx; pos.current.z = nz; }
        else if (free(nx, pos.current.z)) pos.current.x = nx;
        else if (free(pos.current.x, nz)) pos.current.z = nz;
      }
    }
    cam.position.copy(pos.current);
    cam.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
  });

  /* a click on the floor (Room2 / slab) asks Twin2 for a new spot; the ring marks where you would land */
  return (
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false} raycast={() => null} renderOrder={5}>
      <ringGeometry args={[0.22, 0.3, 40]} />
      <meshBasicMaterial color="#1C81EF" transparent opacity={0.85} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/* a floor click is only a walk target when the spot is free */
export function canStand(L: TwinLayout, fi: number, x: number, z: number) {
  const half = { w: L.building.w / 2 - 0.4, d: L.building.d / 2 - 0.4 };
  return Math.abs(x) < half.w && Math.abs(z) < half.d && !obstacles(L, fi).some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
}
