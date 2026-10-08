import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as THREE from 'three';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { CameraControls, ContactShadows, Environment, Lightformer, PerformanceMonitor } from '@react-three/drei';
import { Bloom, EffectComposer, N8AO } from '@react-three/postprocessing';
import type CameraControlsImpl from 'camera-controls';
import * as I from 'lucide-react';
import { getGpuNode, useQuery } from '../../../api';
import { Seg } from '../../../ui/kit';
import { gpuSpec } from '../../../lib/gpuSpec';
import type { NeData } from '../NetworkElement';
import { buildScene, viewsFor } from '../twin/scenes';
import { DeviceTwin, Inspector, Summary } from '../twin/DeviceTwin';
import { STATE_LABEL, type Info, type Part, type PState, type View } from '../twin/model';
import { Ctx3, type TwinCtx } from './kit';
import { Accelerator, GpuServer, NetBox, OpticalShelf, RackView, ServerBox, StorageBox, TenantBox, dimsOf, rackDims, type DevProps, type Dims } from './devices';
import '../../../styles/devtwin.css';

/* Device digital twin in 3D (08-Oct-2026, user: "use your own intelligence … to create the digital twin"). A product-
   configurator view of the real equipment: modelled to its proportions, lit like a studio shot, with live LEDs, fans
   spinning at their reported speed, faulty parts glowing, a lid that opens, an exploded view of the assembly, the
   accelerator package close up and the rack it sits in. Click any part for its live readings. */
type Mode = 'product' | 'open' | 'exploded' | 'chip' | 'rack';
type Cam = 'iso' | 'front' | 'rear' | 'top';
const hasWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };

export function Device3D({ d }: { d: NeData }) {
  const [gl] = useState(hasWebGL);
  if (!gl) return <DeviceTwin d={d} />;
  return <Device3DInner d={d} />;
}

function Device3DInner({ d }: { d: NeData }) {
  const ne = d.ne;
  const [sp, setSp] = useSearchParams();
  const { data: g } = useQuery(() => (ne.role === 'GPU' ? getGpuNode(ne.id) : Promise.resolve(null)), [ne.id]);
  const gpu = g?.node ?? null;
  const tenant = ne.role === 'Tenant gear';
  const modes: { id: Mode; label: string }[] = tenant ? [{ id: 'product', label: 'Device' }, { id: 'rack', label: 'In the rack' }]
    : [{ id: 'product', label: 'Device' }, { id: 'open', label: 'Open lid' }, { id: 'exploded', label: 'Exploded' }, ...(ne.role === 'GPU' && gpu ? [{ id: 'chip' as Mode, label: 'One accelerator' }] : []), { id: 'rack', label: 'In the rack' }];
  const want = sp.get('tview') as Mode | null;
  const mode: Mode = modes.some(m => m.id === want) ? want! : 'product';
  const chip = Math.min(7, Math.max(0, Number(sp.get('gpu') ?? 0) || 0));
  const [cam, setCam] = useState<Cam>('iso');
  const [overlay, setOverlay] = useState<'health' | 'thermal'>('health');
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const set = (patch: Record<string, string | null>) => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, v]) => (v === null ? n.delete(k) : n.set(k, v))); setSp(n, { replace: true }); setSel(null); };
  useEffect(() => { setCam(mode === 'rack' ? 'iso' : mode === 'chip' ? 'iso' : 'iso'); }, [mode]);

  /* what every part is and how it is: the same records the inspector reads, from every view of the device */
  const { info, states, issues } = useMemo(() => {
    const ctx = { d, gpu, chip };
    const views: View[] = ['face', 'inside', 'rack', ...(ne.role === 'GPU' && gpu ? ['chip' as View] : [])];
    const all: Part[] = views.flatMap(v => (viewsFor(ne, !!gpu).some(x => x.id === v) || v === 'rack' ? buildScene(v, ctx).parts : []));
    const info = new Map<string, Info>(); const states = new Map<string, PState>();
    all.forEach(p => { if (p.info && !info.has(p.id)) { info.set(p.id, p.info); states.set(p.id, p.state); } });
    const seen = new Set<string>();
    const issues = all.filter(p => (p.state === 'bad' || p.state === 'warn') && p.info && !p.id.startsWith('cage:') && (!p.id.startsWith('ne:') || p.id === `ne:${ne.id}`) && !seen.has(p.info.title) && seen.add(p.info.title));
    return { info, states, issues };
  }, [d, gpu, chip, ne]);
  const part: Part | null = sel && info.get(sel) ? { id: sel, kind: info.get(sel)!.kind, x: 0, y: 0, w: 0, h: 0, state: states.get(sel) ?? 'ok', info: info.get(sel) } : null;

  const m = gpu ? gpuSpec(gpu.model) : null;
  const caption = mode === 'rack' ? `${d.rack.name} · ${d.rackNes.length} devices · ${d.rack.drawKw} of ${d.rack.budgetKw} kW · ${d.rack.liquid ? 'liquid-cooled' : 'air-cooled'}`
    : mode === 'chip' && m ? `${m.vendor} ${m.model} · GPU ${chip} · ${m.arch} · ${m.tdpW} W`
    : mode === 'exploded' ? 'Every assembly pulled apart — trays, modules, fans and power supplies — with its live state'
    : mode === 'open' ? 'Lid off: the boards, silicon, memory and cooling inside'
    : `${ne.vendor} ${ne.model} · ${ne.uSize ?? 1}U${gpu ? ` · 8 × ${gpuSpec(gpu.model).short}` : ''}`;
  const hovInfo = hover ? info.get(hover.id) : undefined;

  return (
    <section className="card dt dt3" data-devtwin={mode}>
      <div className="dt-head">
        <div className="dt-title"><b>{ne.name.replace(`${ne.dcId}-`, '')} · digital twin</b><span className="vw-label">{caption}</span></div>
        <Seg size="sm" value={mode} onChange={v => set({ tview: v === 'product' ? null : v })} options={modes} />
      </div>
      {mode === 'chip' && gpu && <div className="dt-chips"><span className="dt-gpus" role="group" aria-label="Pick a GPU">{gpu.gpus.map(x => (
        <button key={x.idx} type="button" className={`dt-gpu-pick${x.idx === chip ? ' is-on' : ''} s-${x.health === 'failed' ? 'bad' : x.health === 'degraded' || x.throttle !== 'none' ? 'warn' : 'ok'}`} onClick={() => set({ gpu: String(x.idx) })} aria-pressed={x.idx === chip}>GPU {x.idx}</button>))}</span></div>}
      <div className="dt-body">
        <div className="dt3-stage" ref={stage} data-devtwin-stage>
          <Canvas3D d={d} gpu={gpu} chip={chip} mode={mode} cam={cam} overlay={overlay} sel={sel} hoverId={hover?.id ?? null} states={states}
            onPick={id => { if (id && id.startsWith('ne:') && id !== `ne:${ne.id}`) { setSel(id); return; } setSel(id && info.has(id) ? id : null); }}
            onHover={(id, e) => { if (!id) { setHover(null); return; } const r = stage.current?.getBoundingClientRect(); setHover({ id, x: (e?.nativeEvent.clientX ?? 0) - (r?.left ?? 0), y: (e?.nativeEvent.clientY ?? 0) - (r?.top ?? 0) }); }} />
          <div className="dt3-tools">
            <div className="seg seg--sm dt3-seg" role="group" aria-label="Camera">{([['iso', '3/4', I.Box], ['front', 'Front', I.PanelTop], ['rear', 'Rear', I.PanelBottom], ['top', 'Top', I.Layers]] as const).map(([id, l, Ico]) => (
              <button key={id} type="button" className={cam === id ? 'is-active' : ''} aria-pressed={cam === id} onClick={() => setCam(id)} title={`${l} view`}><Ico size={13} />{l}</button>))}</div>
            <div className="seg seg--sm dt3-seg" role="group" aria-label="Overlay">{([['health', 'Health'], ['thermal', 'Heat']] as const).map(([id, l]) => (
              <button key={id} type="button" className={overlay === id ? 'is-active' : ''} aria-pressed={overlay === id} onClick={() => setOverlay(id)}>{l}</button>))}</div>
          </div>
          {hover && hovInfo && <div className="dt3-tip" style={{ left: Math.min(hover.x + 14, (stage.current?.clientWidth ?? 600) - 220), top: Math.max(8, hover.y - 44) }}><b>{hovInfo.title}</b><span className={`s-${states.get(hover.id)}`}>{STATE_LABEL[states.get(hover.id) ?? 'ok']}</span></div>}
          <div className="dt3-legend" data-devtwin-legend>
            {overlay === 'thermal'
              ? <><span className="vw-label">Component temperature</span><span className="dt3-heat">25°C<i />90°C</span></>
              : <><span><i className="led ok" />Link / unit up</span><span><i className="led warn" />Attention</span><span><i className="led bad" />Fault (part glows)</span><span><i className="led off" />Off / empty</span></>}
            <span className="grow" /><span className="vw-label">Drag to orbit · scroll to zoom · click a part</span>
          </div>
        </div>
        <aside className="dt-insp" data-devtwin-inspector>
          {part ? <Inspector p={part} onChip={k => set({ tview: 'chip', gpu: String(k) })} onClose={() => setSel(null)} />
            : <Summary d={d} issues={issues} onSel={setSel} scene={{ w: 0, h: 0, title: '', caption: '', chips: [], groups: [], parts: [...info.entries()].map(([id, i]) => ({ id, kind: i.kind, x: 0, y: 0, w: 0, h: 0, state: states.get(id) ?? 'ok', info: i })) }} />}
        </aside>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ the canvas */
function Canvas3D(p: { d: NeData; gpu: DevProps['gpu']; chip: number; mode: Mode; cam: Cam; overlay: 'health' | 'thermal'; sel: string | null; hoverId: string | null; states: Map<string, PState>; onPick: (id: string | null) => void; onHover: (id: string | null, e?: ThreeEvent<PointerEvent>) => void }) {
  const explode = useRef(0), lid = useRef(0);
  const [dpr, setDpr] = useState(1.75);
  const [post, setPost] = useState(true);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const ctx: TwinCtx = { sel: p.sel, hover: p.hoverId, states: p.states, onPick: p.onPick, onHover: p.onHover, explode, lid, overlay: p.overlay, reduced: !!reduced, cap: 1 };
  const dims: Dims = p.mode === 'rack' ? rackDims(p.d) : p.mode === 'chip' ? { w: 0.56, h: 0.3, d: 0.32 } : dimsOf(p.d);
  /* bounding-sphere radius of what is on stage (exploded assemblies grow upwards) */
  const r = p.mode === 'chip' ? 0.42 : 0.5 * Math.hypot(dims.w, dims.h + (p.mode === 'exploded' ? 0.3 : 0), dims.d);
  ctx.cap = Math.min(1.8, Math.max(0.8, r / 0.36));
  const dev: DevProps = { d: p.d, gpu: p.gpu, chip: p.chip, labels: p.mode === 'exploded' || p.mode === 'chip' };
  const role = p.d.ne.role;
  const Model = p.mode === 'rack' ? RackView : p.mode === 'chip' ? Accelerator : role === 'GPU' ? GpuServer : role === 'DWDM' ? OpticalShelf : role === 'Server' ? ServerBox : role === 'Storage' ? StorageBox : role === 'Tenant gear' ? TenantBox : NetBox;
  return (
    <Canvas shadows dpr={dpr} camera={{ fov: 30, near: 0.01, far: 60, position: [r, r * 0.7, r * 1.2] }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0, preserveDrawingBuffer: true }} onPointerMissed={() => p.onPick(null)}>
      <PerformanceMonitor flipflops={3} onDecline={() => { setDpr(1); setPost(false); }} onFallback={() => { setDpr(1); setPost(false); }} />
      <color attach="background" args={['#E9EEF4']} />
      <hemisphereLight args={['#FFFFFF', '#B8C2CF', 0.55]} />
      <directionalLight position={[r * 1.6, r * 3, r * 2]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004}>
        <orthographicCamera attach="shadow-camera" args={[-r * 1.4, r * 1.4, r * 1.4, -r * 1.4, 0.01, r * 10]} />
      </directionalLight>
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#C9D2DD']} />
        <Lightformer form="rect" intensity={2.2} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[8, 6, 1]} />
        <Lightformer form="rect" intensity={1.3} position={[-5, 2, 3]} rotation-y={Math.PI / 2} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={1.0} position={[5, 2, -3]} rotation-y={-Math.PI / 2} scale={[6, 2, 1]} />
        <Lightformer form="ring" intensity={0.9} color="#CFE3FF" position={[0, 2, 5]} scale={3} />
      </Environment>
      <Ctx3.Provider value={ctx}>
        <Animator mode={p.mode} explode={explode} lid={lid} />
        <Suspense fallback={null}><group key={`${p.mode}-${p.chip}`}><Model {...dev} /></group></Suspense>
      </Ctx3.Provider>
      <ContactShadows position={[0, -0.0005, 0]} scale={r * 4} blur={2.4} far={r * 1.2} opacity={0.42} resolution={512} frames={reduced ? 1 : Infinity} />
      <Rig mode={p.mode} cam={p.cam} dims={dims} r={r} flat={p.mode !== 'rack' && p.mode !== 'chip' && dims.h < 0.1} />
      {post && <EffectComposer multisampling={2}>
        <N8AO aoRadius={Math.max(0.02, r * 0.05)} intensity={1.6} distanceFalloff={0.5} halfRes quality="performance" />
        <Bloom mipmapBlur luminanceThreshold={1.0} luminanceSmoothing={0.1} intensity={0.55} levels={4} />
      </EffectComposer>}
    </Canvas>
  );
}

/* open the lid / explode the assembly smoothly */
function Animator({ mode, explode, lid }: { mode: Mode; explode: React.MutableRefObject<number>; lid: React.MutableRefObject<number> }) {
  useFrame((_, dt) => {
    const ex = mode === 'exploded' ? 1 : mode === 'chip' ? 0.55 : 0, ld = mode === 'open' ? 1 : 0;
    const k = 1 - Math.pow(0.0025, dt);
    explode.current += (ex - explode.current) * k; lid.current += (ld - lid.current) * k;
  });
  return null;
}

/* camera presets per mode, framed to the device */
function Rig({ mode, cam, dims, r, flat }: { mode: Mode; cam: Cam; dims: Dims; r: number; flat: boolean }) {
  const ref = useRef<CameraControlsImpl>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const lift = mode === 'exploded' ? 0.15 : mode === 'open' ? 0.03 : 0;
    const ty = mode === 'rack' ? dims.h * 0.48 : mode === 'chip' ? 0.05 : dims.h / 2 + lift;
    /* 1U / 2U gear: the story is on the faceplate, so the closed view leans to the front */
    const tz = mode === 'rack' ? 0.15 : flat && mode === 'product' && cam !== 'rear' && cam !== 'top' ? dims.d * 0.28 : 0;
    const k = mode === 'rack' ? 1.12 : mode === 'exploded' ? 1.3 : flat && mode === 'product' ? 0.78 : 1.08;
    const dist = (r / Math.sin((30 / 2) * Math.PI / 180)) * k;
    const dir: Record<Cam, [number, number, number]> = mode === 'rack'
      ? { iso: [0.55, 0.18, 0.82], front: [0, 0.04, 1], rear: [0, 0.04, -1], top: [0.01, 1, 0.35] }
      : flat && mode === 'product' ? { iso: [0.42, 0.3, 0.86], front: [0, 0.08, 1], rear: [0, 0.1, -1], top: [0.001, 1, 0.02] }
      : { iso: [0.5, 0.42, 0.78], front: [0, 0.1, 1], rear: [0, 0.12, -1], top: [0.001, 1, 0.02] };
    const v = new THREE.Vector3(...dir[cam]).normalize().multiplyScalar(dist);
    c.setLookAt(v.x, ty + v.y, tz + v.z, 0, ty, tz, true);
  }, [mode, cam, dims.h, dims.d, r, flat]);
  return <CameraControls ref={ref} makeDefault minDistance={r * 0.4} maxDistance={r * 9} dollyToCursor smoothTime={0.5} />;
}
