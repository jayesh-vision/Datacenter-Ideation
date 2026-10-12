/* Focused trace views of one device (13-Oct-2026, user: "when the user clicks View cabling it should show only the current device
   and the other device the cable comes from; the same for the power cable"). A small 3D scene of its own, opened from the device
   popup in the realistic twin:
   - Cabling: the device on the left, every cable as a lane through the real passive chain (patch cord → cabinet patch panel →
     trunk → ODF → cross-connect → outside plant …) to the far device on the right. Pick one cable in the list to see it alone,
     hop by hop, with optics readings and the segment to check first.
   - Power: the device and its power supplies, each cord to its PDU outlet, the A / B busway, the UPS module (or −48 V plant) and the
     utility feed, coloured by side and state.
   Data: getDevicePhysical (power chain + cable list) and getCablePath (hops), the same model as the Power & cabling tab. */
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type CameraControlsImpl from 'camera-controls';
import { Link } from 'react-router-dom';
import { Canvas, useThree } from '@react-three/fiber';
import { Billboard, CameraControls, Environment, Lightformer, Line, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import * as I from 'lucide-react';
import { getCablePath, getDevicePhysical, useQuery } from '../../../api';
import type { CableHop, CablePath, PhysState } from '../../../api/types';
import type { TwinNe } from '../../../api/ext-twin';
import { tagTex } from '../../ne/twin3d/kit';
import { bezelTex, frontTex, type BezelKind } from './textures';
import { Seg } from '../../../ui/kit';
import { Loading } from '../../../shell/page';

export type TraceKind = 'cables' | 'power';
type P3 = [number, number, number];
const SIDE = { A: '#2F80ED', B: '#F2994A', DC: '#10B981' } as const;
const ST: Record<PhysState, string> = { ok: '#22C55E', warn: '#F5B82E', bad: '#FF4D4F', off: '#94A3B8' };
const LANE_C = (s: PhysState) => (s === 'bad' ? '#FF4D4F' : s === 'warn' ? '#F5B82E' : '#22D3EE');
const NO_RAY = () => null;
const kindOf = (role: string): BezelKind => role === 'Server' ? 'server' : role === 'GPU' ? 'gpu' : role === 'Storage' ? 'storage' : role === 'Switch' || role === 'Access' ? 'switch' : role === 'Router' ? 'router' : role === 'Firewall' ? 'firewall' : role === 'DWDM' ? 'optical' : role === 'Tenant gear' ? 'tenant' : 'appliance';

/* ---------------- small 3D parts ---------------- */
function Tag({ p, text, sub, s = 1 }: { p: P3; text: string; sub?: string; s?: number }) {
  const t = tagTex(text, sub); const img = t.image as HTMLCanvasElement; const w = 1.5 * s, h = w * (img.height / img.width);
  return <Billboard position={p}><mesh raycast={NO_RAY} renderOrder={10}><planeGeometry args={[w, h]} /><meshBasicMaterial map={t} transparent depthTest={false} toneMapped={false} /></mesh></Billboard>;
}
function Device({ p, role, u, h = 0.5, w = 1.7, hot }: { p: P3; role: string; u: number; h?: number; w?: number; hot?: boolean }) {
  const tex = useMemo(() => bezelTex(kindOf(role), Math.max(1, Math.min(8, u))), [role, u]);
  return (
    <group position={p}>
      <RoundedBox args={[w, h, 0.9]} radius={0.02} smoothness={2} castShadow><meshStandardMaterial color="#2B3038" metalness={0.5} roughness={0.45} /></RoundedBox>
      <mesh position={[0, 0, 0.452]} raycast={NO_RAY}><planeGeometry args={[w - 0.04, h - 0.03]} /><meshStandardMaterial map={tex} metalness={0.3} roughness={0.6} /></mesh>
      {hot && <mesh position={[0, 0, 0.47]} raycast={NO_RAY}><planeGeometry args={[w + 0.06, h + 0.06]} /><meshBasicMaterial color="#1C81EF" transparent opacity={0.16} /></mesh>}
    </group>
  );
}
function Panel({ p, w = 0.9, h = 0.16, c = '#1E242C', ports = 12, on }: { p: P3; w?: number; h?: number; c?: string; ports?: number; on?: number }) {
  return (
    <group position={p}>
      <mesh castShadow><boxGeometry args={[w, h, 0.25]} /><meshStandardMaterial color={c} metalness={0.4} roughness={0.5} /></mesh>
      {Array.from({ length: ports }, (_, i) => (
        <mesh key={i} position={[-w / 2 + 0.06 + i * ((w - 0.12) / Math.max(1, ports - 1)), 0, 0.127]} raycast={NO_RAY}>
          <boxGeometry args={[0.035, 0.05, 0.01]} /><meshStandardMaterial color={on === i ? '#22D3EE' : '#9AA4B2'} emissive={on === i ? '#22D3EE' : '#000'} emissiveIntensity={on === i ? 1.2 : 0} toneMapped={on !== i} />
        </mesh>))}
    </group>
  );
}
function Cabinet({ p, kind, w = 0.9, h = 2.0, led }: { p: P3; kind: 'ups' | 'panel' | 'battery'; w?: number; h?: number; led: string }) {
  const tex = useMemo(() => frontTex(kind), [kind]);
  return (
    <group position={p}>
      <RoundedBox args={[w, h, 0.8]} radius={0.02} smoothness={2} position={[0, h / 2, 0]} castShadow><meshStandardMaterial color={kind === 'battery' ? '#3A3F46' : '#E8ECF0'} roughness={0.5} metalness={0.15} /></RoundedBox>
      <mesh position={[0, h / 2, 0.402]} raycast={NO_RAY}><planeGeometry args={[w - 0.04, h - 0.04]} /><meshStandardMaterial map={tex} roughness={0.55} /></mesh>
      <mesh position={[0, h - 0.06, 0.41]} raycast={NO_RAY}><boxGeometry args={[w * 0.6, 0.03, 0.01]} /><meshBasicMaterial color={led} toneMapped={false} /></mesh>
    </group>
  );
}
function Strip({ p, h = 2.2, c, outlet, outlets = 24 }: { p: P3; h?: number; c: string; outlet?: number; outlets?: number }) {
  return (
    <group position={p}>
      <mesh position={[0, h / 2, 0]} castShadow><boxGeometry args={[0.16, h, 0.14]} /><meshStandardMaterial color="#15191F" roughness={0.6} /></mesh>
      <mesh position={[0, h + 0.03, 0]} raycast={NO_RAY}><boxGeometry args={[0.16, 0.04, 0.14]} /><meshBasicMaterial color={c} toneMapped={false} /></mesh>
      {Array.from({ length: 12 }, (_, i) => { const o = Math.round(((i + 0.5) / 12) * outlets); const me = outlet !== undefined && Math.abs(o - outlet) <= outlets / 24; return (
        <mesh key={i} position={[0, 0.1 + (i / 11) * (h - 0.2), 0.072]} raycast={NO_RAY}><boxGeometry args={[0.06, 0.06, 0.01]} /><meshBasicMaterial color={me ? c : '#3B4250'} toneMapped={!me} /></mesh>); })}
    </group>
  );
}
function Busway({ p, len = 1.6, c }: { p: P3; len?: number; c: string }) {
  return (
    <group position={p}>
      <mesh castShadow><boxGeometry args={[len, 0.14, 0.18]} /><meshStandardMaterial color="#C9A453" metalness={0.6} roughness={0.38} /></mesh>
      <mesh position={[0, 0.075, 0]} raycast={NO_RAY}><boxGeometry args={[len, 0.012, 0.19]} /><meshBasicMaterial color={c} toneMapped={false} /></mesh>
    </group>
  );
}
function Feed({ p, bad }: { p: P3; bad?: boolean }) {
  return (
    <group position={p}>
      <mesh position={[0, 0.55, 0]} castShadow><boxGeometry args={[1.0, 1.1, 0.8]} /><meshStandardMaterial color="#9AA5B4" roughness={0.6} metalness={0.25} /></mesh>
      {[-0.3, 0, 0.3].map(x => <mesh key={x} position={[x, 1.25, 0]} castShadow><cylinderGeometry args={[0.05, 0.07, 0.3, 10]} /><meshStandardMaterial color="#C7CDD6" /></mesh>)}
      <mesh position={[0, 0.9, 0.405]} raycast={NO_RAY}><boxGeometry args={[0.5, 0.04, 0.01]} /><meshBasicMaterial color={bad ? '#FF4D4F' : '#22C55E'} toneMapped={false} /></mesh>
    </group>
  );
}
const cable = (pts: P3[], c: string, w = 3, dashed = false) => <Line points={pts} color={c} lineWidth={w} dashed={dashed} dashSize={0.12} gapSize={0.08} toneMapped={false} raycast={NO_RAY} />;
const bend = (a: P3, b: P3): P3[] => { const mx = (a[0] + b[0]) / 2; return [a, [mx, a[1], a[2]], [mx, b[1], b[2]], b]; };

/* ---------------- stage ---------------- */
function Stage({ children, span, h, fitKey }: { children: ReactNode; span: number; h: number; fitKey: string }) {
  return (
    <Canvas shadows dpr={1.5} camera={{ fov: 30, near: 0.1, far: 300, position: [2, h * 0.6 + 3, span * 1.6] }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, preserveDrawingBuffer: true }}>
      <color attach="background" args={['#E9EEF4']} />
      <hemisphereLight args={['#FFFFFF', '#B8C2CF', 0.6]} />
      <directionalLight position={[6, 12, 9]} intensity={1.4} castShadow shadow-mapSize={[1024, 1024]} />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={1.6} position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[20, 12, 1]} />
        <Lightformer form="rect" intensity={1.0} position={[-8, 3, 5]} rotation-y={Math.PI / 2} scale={[10, 3, 1]} />
      </Environment>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow raycast={NO_RAY}><planeGeometry args={[span * 3, 40]} /><meshStandardMaterial color="#DCE3EB" roughness={1} /></mesh>
      <group name="content">{children}</group>
      <Fit fitKey={fitKey} />
    </Canvas>
  );
}
/* frame everything that is drawn, slightly from above and to the right */
function Fit({ fitKey }: { fitKey: string }) {
  const ref = useRef<CameraControlsImpl>(null);
  const scene = useThree(s => s.scene);
  useEffect(() => {
    const t = setTimeout(() => {
      const g = scene.getObjectByName('content'); const c = ref.current; if (!g || !c) return;
      g.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(g); const ctr = box.getCenter(new THREE.Vector3());
      const r = box.getBoundingSphere(new THREE.Sphere()).radius;
      /* fitToBox would snap to a box face: place the camera along our own direction at the sphere-fitting distance */
      const cam = c.camera as THREE.PerspectiveCamera; const fov = (cam.fov * Math.PI) / 180; const aspect = cam.aspect || 1.6;
      const dist = (r / Math.sin(Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * aspect)) / 2)) * (fitKey.startsWith('p') ? 0.64 : 0.8);
      /* power lanes (A / B) lie one behind the other: look down at ~40° so both rows read; cables lie in one plane: nearly front-on */
      const dir = (fitKey.startsWith('p') ? new THREE.Vector3(0.12, 0.72, 0.68) : new THREE.Vector3(0.1, 0.32, 0.94)).normalize().multiplyScalar(dist);
      c.setLookAt(ctr.x + dir.x, ctr.y + dir.y, ctr.z + dir.z, ctr.x, ctr.y, ctr.z, false);
      (window as unknown as { __fit?: unknown }).__fit = { r, dist };
    }, 60);
    return () => clearTimeout(t);
  }, [fitKey, scene]);
  return <CameraControls ref={ref} makeDefault minDistance={1.5} maxDistance={80} maxPolarAngle={Math.PI / 2.05} />;
}

/* ---------------- cabling ---------------- */
type CableRow = NonNullable<Awaited<ReturnType<typeof getDevicePhysical>>>['cables'][number];
const COLS = 7; // device · cord+panel · trunk→ODF · cross-connect · (outside plant) · far panel · far device
function hopCol(h: CableHop, i: number, n: number, interSite: boolean): number {
  if (i === 0 || h.kind === 'optic' && i < n / 2) return 0;
  if (i === n - 1 || h.kind === 'optic' && i >= n / 2) return 6;
  if (h.kind === 'osp') return 3;
  if (h.kind === 'jumper') return interSite ? (i < n / 2 ? 2.5 : 3.5) : 3;
  if (h.kind === 'panel' && /ODF/.test(h.label + (h.where ?? ''))) return i < n / 2 ? 2 : 4;
  if (h.kind === 'panel') return i < n / 2 ? 1 : 5;
  if (h.kind === 'trunk') return i < n / 2 ? 1.5 : 4.5;
  return i < n / 2 ? 0.5 : 5.5;
}
function CableScene({ me, cables, paths, pick }: { me: TwinNe; cables: CableRow[]; paths: Map<string, CablePath>; pick: string | null }) {
  const lanes = (pick ? cables.filter(c => c.linkId === pick) : cables).slice(0, 12);
  const step = 1.55, x0 = -((COLS - 1) * step) / 2;
  const X = (c: number) => x0 + c * step;
  const laneH = pick ? 0 : 0.85;
  const top = 0.7 + Math.max(0, lanes.length - 1) * laneH;
  const span = (COLS - 1) * step + 3;
  const meH = Math.max(0.5, top + 0.2);
  return (
    <Stage span={span} h={meH + 1} fitKey={`c${pick ?? 'all'}${lanes.length}`}>
      <Device p={[X(0) - 0.9, meH / 2 + 0.05, 0]} role={me.role} u={me.uSize} h={meH} w={1.4} hot />
      <Tag p={[X(0) - 0.9, meH + 0.45, 0]} text={me.name.replace(/^[A-Z]{2}-DC-\d{3}-/, '')} sub={`${me.vendor} ${me.model} · U${me.u}`} s={1.15} />
      {lanes.map((c, li) => {
        const y = top - li * laneH;
        const path = paths.get(c.linkId);
        const col = LANE_C(c.state as PhysState);
        const hops = path?.hops ?? [];
        const inter = path?.kind === 'inter-site';
        const pts: P3[] = [[X(0) - 0.2, y, 0.3]];
        const nodes: ReactElement[] = [];
        hops.forEach((h, i) => {
          if (h.kind === 'port' || h.kind === 'optic') return;
          const cx = X(hopCol(h, i, hops.length, inter));
          pts.push([cx, y, 0.3]);
          if (h.kind === 'panel') nodes.push(<Panel key={`${li}p${i}`} p={[cx, y, 0.2]} w={0.8} h={0.16} c={/ODF/.test(h.label) ? '#2A2F3A' : '#1E242C'} ports={10} on={4} />);
          if (pick || li === 0) nodes.push(<Tag key={`${li}t${i}`} p={[cx, y + (pick ? (i % 2 ? -0.62 : 0.62) : 0.32), 0.4]} text={h.label.length > 34 ? h.label.slice(0, 33) + '…' : h.label} sub={pick ? h.sub ?? h.where : undefined} s={pick ? 1.1 : 0.85} />);
          if (pick && path?.suspect === i) nodes.push(<mesh key={`${li}s${i}`} position={[cx, y, 0.3]} raycast={NO_RAY}><sphereGeometry args={[0.14, 16, 16]} /><meshBasicMaterial color={h.state === 'bad' ? '#FF4D4F' : '#F5B82E'} transparent opacity={0.55} /></mesh>);
        });
        pts.push([X(6) - 0.15, y, 0.3]);
        const farName = c.farNe.replace(/^[A-Z]{2}-DC-\d{3}-/, '');
        return (
          <group key={c.linkId}>
            {nodes}
            {cable(pts, col, pick ? 5 : 3, c.state === 'bad')}
            <Device p={[X(6) + 0.75, y, 0]} role={/GPU/.test(c.farNe) ? 'GPU' : /TOR|LEAF|SPINE|SW|AGG|MMR|OOB/.test(c.farNe) ? 'Switch' : /STG/.test(c.farNe) ? 'Storage' : /CMP|CPU|SRV/.test(c.farNe) ? 'Server' : 'Router'} u={2} h={pick ? 0.55 : 0.36} w={1.3} />
            <Tag p={[X(6) + 0.75, y + (pick ? 0.62 : 0.3), 0.45]} text={`${farName} ${c.farIf}`} sub={pick ? `${c.ifName} → ${c.farIf}` : undefined} s={pick ? 1.15 : 0.9} />
            <Tag p={[X(0) - 0.05, y + 0.22, 0.55]} text={c.ifName} s={0.7} />
          </group>
        );
      })}
    </Stage>
  );
}

/* ---------------- power ---------------- */
type PowerRow = NonNullable<Awaited<ReturnType<typeof getDevicePhysical>>>['power'][number];
function PowerScene({ me, power }: { me: TwinNe; power: PowerRow[] }) {
  const sides = [...new Set(power.map(p => p.pdu.id))];
  const step = 2.3, X = (c: number) => -2 * step + c * step;
  const laneZ = (k: number) => (k - (sides.length - 1) / 2) * 3.4;
  const meH = Math.max(0.5, Math.min(1.2, me.uSize * 0.12));
  return (
    <Stage span={4 * step + 3} h={3} fitKey={`p${sides.join(',')}`}>
      <Device p={[X(0), 1.0, 0]} role={me.role} u={me.uSize} h={meH} w={1.6} hot />
      <Tag p={[X(0), 1.0 + meH / 2 + 0.55, 0]} text={me.name.replace(/^[A-Z]{2}-DC-\d{3}-/, '')} sub={`${power.length} power supplies`} s={1.43} />
      {sides.map((pid, k) => {
        const rows = power.filter(p => p.pdu.id === pid); const pdu = rows[0].pdu;
        const z = laneZ(k);
        const base = pdu.kind === 'DC' ? SIDE.DC : SIDE[pdu.side];
        const pc = pdu.state === 'tripped' ? '#FF4D4F' : pdu.state === 'on-battery' ? '#F5B82E' : base;
        const ups = rows[0].chain[3], feed = rows[0].chain[4];
        return (
          <group key={pid}>
            {rows.map((r, j) => {
              const y0 = 1.0 - meH / 2 + 0.12 + j * 0.14;
              const cc = r.cord.state === 'psu-failed' || r.cord.state === 'no-power' ? '#FF4D4F' : r.cord.state === 'on-battery' ? '#F5B82E' : base;
              return <group key={r.cord.psu}>
                {cable(bend([X(0) + 0.8, y0, z * 0.25], [X(1) - 0.09, 0.3 + (Math.max(1, r.cord.outlet) / Math.max(1, pdu.outlets)) * 1.8, z]), cc, 4, r.cord.state !== 'live')}
                <Tag p={[X(0.5), y0 + 0.35 + j * 0.05, z * 0.6]} text={`${r.cord.psu} → outlet ${r.cord.outlet}`} sub={r.cord.state === 'live' ? `${r.cord.drawW} W` : r.cord.state.replace('-', ' ')} s={1.04} />
              </group>;
            })}
            <Strip p={[X(1), 0, z]} c={pc} outlet={rows[0].cord.outlet} outlets={pdu.outlets} />
            <Tag p={[X(1), 2.75, z]} text={`${pdu.name} · rack PDU`} sub={`${pdu.loadKw} / ${pdu.capacityKw} kW${pdu.state === 'tripped' ? ' · tripped' : pdu.state === 'on-battery' ? ' · on battery' : ''}`} s={1.23} />
            {cable([[X(1), 2.25, z], [X(1), 2.6, z], [X(2) - 0.8, 2.6, z]], pc, 4, pdu.state === 'tripped' || pdu.state === 'on-battery')}
            {pdu.kind === 'DC' ? <Panel p={[X(2), 2.6, z]} w={1.6} h={0.22} c="#2A2F3A" ports={10.40} /> : <Busway p={[X(2), 2.6, z]} c={base} />}
            <Tag p={[X(2), 3.05, z]} text={pdu.kind === 'DC' ? '−48 V fuse panel (BDFB)' : `Busway ${pdu.side}`} sub="overhead distribution" s={1.10} />
            {cable([[X(2) + 0.8, 2.6, z], [X(3), 2.6, z], [X(3), 2.05, z]], ups.state === 'bad' ? '#FF4D4F' : ups.state === 'warn' ? '#F5B82E' : base, 4, ups.state !== 'ok')}
            <Cabinet p={[X(3), 0, z]} kind={pdu.kind === 'DC' ? 'battery' : 'ups'} led={ST[ups.state]} />
            <Tag p={[X(3), 2.85, z + 0.2]} text={ups.name} sub={ups.sub} s={1.30} />
            {cable([[X(3) + 0.45, 1.0, z], [X(4) - 0.5, 1.0, z]], feed.state === 'bad' ? '#FF4D4F' : '#64748B', 4, feed.state === 'bad')}
            <Feed p={[X(4), 0, z]} bad={feed.state === 'bad'} />
            <Tag p={[X(4), 1.9, z]} text={feed.name} sub={feed.sub} s={1.23} />
          </group>
        );
      })}
    </Stage>
  );
}

/* ---------------- shell ---------------- */
export function Trace({ kind, me, onKind, onClose }: { kind: TraceKind; me: TwinNe; onKind: (k: TraceKind) => void; onClose: () => void }) {
  const { data } = useQuery(() => getDevicePhysical(me.id), [me.id]);
  const [pick, setPick] = useState<string | null>(null);
  const ids = useMemo(() => (data?.cables ?? []).slice(0, 12).map(c => c.linkId), [data]);
  const { data: paths } = useQuery(() => (kind === 'cables' && ids.length ? Promise.all(ids.map(id => getCablePath(id))).then(xs => new Map(xs.filter(Boolean).map(p => [p!.linkId, p!]))) : Promise.resolve(new Map<string, CablePath>())), [kind, ids.join(',')]);
  const short = (s: string) => s.replace(/^[A-Z]{2}-DC-\d{3}-/, '');
  const sel = pick ? data?.cables.find(c => c.linkId === pick) : undefined;
  return (
    <div className="t2-trace" data-twin2-trace={kind}>
      <div className="t2-trace-bar">
        <button type="button" className="nst-btn nst-btn--sm" onClick={onClose} data-twin2-trace-close><I.ArrowLeft size={14} />Back to the twin</button>
        <b>{kind === 'cables' ? 'Cabling' : 'Power'} of {short(me.name)}</b>
        <Seg size="sm" value={kind} onChange={v => { setPick(null); onKind(v); }} options={[{ id: 'cables', label: 'Cabling' }, { id: 'power', label: 'Power' }]} />
        <span className="grow" />
        <Link className="nst-btn nst-btn--sm" to={`/ne/${me.id}?tab=physical`}>Power & cabling tab</Link>
      </div>
      <div className="t2-trace-body">
        <aside className="t2-trace-list">
          {!data ? <Loading /> : kind === 'cables' ? <>
            <span className="vw-label">{data.cables.length} cable{data.cables.length === 1 ? '' : 's'}{data.cables.length > 12 ? ' · first 12 drawn' : ''}</span>
            <button type="button" className={`t2-tl-row${!pick ? ' is-on' : ''}`} onClick={() => setPick(null)}><b>All cables</b><small>every lane side by side</small></button>
            {data.cables.map(c => (
              <button key={c.linkId} type="button" className={`t2-tl-row is-${c.state}${pick === c.linkId ? ' is-on' : ''}`} data-trace-cable={c.linkId} onClick={() => setPick(c.linkId)}>
                <b><i style={{ background: LANE_C(c.state as PhysState) }} />{c.ifName} → {short(c.farNe)}</b>
                <small>{c.kind === 'in-rack' ? 'in-rack cord' : c.via}{c.state !== 'ok' ? ` · ${c.verdict}` : ''}</small>
              </button>))}
          </> : <>
            <span className="vw-label">{data.verdict.text}</span>
            {data.power.map(p => (
              <div key={p.cord.psu} className={`t2-tl-row is-${p.cord.state === 'live' ? 'ok' : p.cord.state === 'on-battery' ? 'warn' : 'bad'}`}>
                <b><i style={{ background: p.pdu.kind === 'DC' ? SIDE.DC : SIDE[p.pdu.side] }} />{p.cord.psu} → {p.pdu.name} outlet {p.cord.outlet}</b>
                <small>{p.chain[3].name} → {p.chain[4].name} · {p.cord.state === 'live' ? `${p.cord.drawW} W` : p.cord.state.replace('-', ' ')}</small>
              </div>))}
          </>}
          {sel && paths?.get(sel.linkId) && <div className="t2-tl-note"><b>Check first</b><span>{paths.get(sel.linkId)!.verdict}</span></div>}
        </aside>
        <div className="t2-trace-stage">
          {!data ? <Loading /> : kind === 'cables'
            ? (data.cables.length ? <CableScene me={me} cables={data.cables} paths={paths ?? new Map()} pick={pick} /> : <div className="t2-trace-empty">No cabled ports recorded for this device.</div>)
            : <PowerScene me={me} power={data.power} />}
          <div className="t2-trace-hint">Drag to orbit · scroll to zoom{kind === 'cables' ? ' · pick a cable on the left to trace it alone' : ''}</div>
        </div>
      </div>
    </div>
  );
}
