import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import { getTwinData } from '../../../api/ext-twin';
import { getDevicePhysical, getSitePhysical, useQuery, usePersona } from '../../../api';
import { Loading } from '../../../shell/page';
import { Seg } from '../../../ui/kit';
import { buildLayout, type Level, type Sel } from '../twin/layout';
import type { Hover, Layer, PosMap } from '../twin/Scene';
import { plantUnits, unitOccluders, unitPose, type Pick2 } from './units';
import { canStand, walkSpot, type WalkSpot } from './walk';
import { buildAnchors2, type Anchor2 } from './anchors2';
import { TwinPanel } from '../twin/Panel';
import { buildAttention } from '../twin/attention';
import { LEGENDS, TwinScene2 } from './Scene2';
import { PathCard, pathPose, physAnchors, ROUTE_C, SIDE_C, type PhysView } from './paths';
import '../../../styles/twin.css';
import '../../../styles/twin2.css';

const LAYERS: { id: Layer; label: string }[] = [{ id: 'health', label: 'Health' }, { id: 'thermal', label: 'Temperature' }, { id: 'power', label: 'Rack power' }, { id: 'connectivity', label: 'Connectivity' }];
const hasWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };
const levelOf = (s: Sel): Level => (s.ne ? 'equipment' : s.rack ? 'rack' : s.room !== null ? 'room' : s.floor !== null ? 'floor' : 'building');
const EMPTY: Sel = { floor: null, room: null, rack: null, ne: null };

/* Realistic digital twin (second 3D view, user 08-Oct-2026): the same site record, layout,
   drill path and right-hand panel as the schematic twin, rendered in the realistic visual
   language of the shared DC-Digital-View prototype. Building → Floor → Room → Rack → Equipment. */
export default function Twin2({ dcId }: { dcId: string }) {
  const { data } = useQuery(() => getTwinData(dcId), [dcId]);
  const { persona } = usePersona();
  const [sel, setSel] = useState<Sel>(EMPTY);
  const [layer, setLayer] = useState<Layer>('health');
  const [hover, setHover] = useState<Hover | null>(null);
  const [gl] = useState(hasWebGL);
  const [full, setFull] = useState(false);
  const [resetTick, setResetTick] = useState(0);
  /* selected plant unit (cooling / UPS / rectifier / battery / DG) and the walk (street view) spot */
  const [unit, setUnit] = useState<string | null>(null);
  const [walk, setWalk] = useState<WalkSpot | null>(null);
  /* quick chips (13-Oct-2026, user): draw the power path and the cable paths into the twin */
  const [showPower, setShowPower] = useState(false);
  const [showCables, setShowCables] = useState(false);
  const { data: phys } = useQuery(() => (showPower || showCables ? getSitePhysical(dcId) : Promise.resolve(null)), [dcId, showPower || showCables]);
  const { data: devPhys } = useQuery(() => (showCables && sel.ne ? getDevicePhysical(sel.ne) : Promise.resolve(null)), [showCables, sel.ne]);
  const pv: PhysView = useMemo(() => ({ phys: phys ?? null, dev: devPhys ?? null, power: showPower, cables: showCables }), [phys, devPhys, showPower, showCables]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; setWalk(w => { if (!w) setFull(false); return null; }); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const L = useMemo(() => (data ? buildLayout(data.dc, data.nes) : null), [data]);
  const units = useMemo(() => (data && L ? plantUnits(L, data) : []), [data, L]);
  useEffect(() => { setSel(EMPTY); setUnit(null); setWalk(null); }, [dcId, persona]);
  const level = levelOf(sel);
  const unitObj = unit ? units.find(u => u.key === unit) : undefined;
  const unitView = useMemo(() => { if (!unitObj || !L) return null; const pose = unitPose(unitObj, L); return { pose, hide: unitOccluders(unitObj, L, pose[0]) }; }, [unitObj, L]);
  /* while walking, every new selection walks up to it; leaving the floors ends the walk */
  const walking = !!walk;
  useEffect(() => {
    if (!walking || !L) return;
    if (sel.floor === null && !unitObj) { setWalk(null); return; }
    setWalk(walkSpot(L, sel, unitObj));
  }, [walking, L, sel, unitObj]);

  const onPick = useCallback((p: Pick2) => {
    setHover(null);
    if (!L) return;
    if (p.unit) { const u = units.find(x => x.key === p.unit); if (u) { setSel({ floor: u.floorIdx, room: u.roomId, rack: null, ne: null }); setUnit(u.key); } return; }
    if (unit && !p.rack && !p.room && p.floor === undefined) { setUnit(null); return; }
    setUnit(null);
    if (p.ne && p.rack) { const rk = L.racks.find(r => r.rack.id === p.rack); const room = rk ? L.rooms.find(r => r.racks.includes(rk)) : undefined; setSel({ floor: room?.floorIdx ?? null, room: room?.id ?? null, rack: p.rack, ne: p.ne }); return; }
    if (p.rack) { const rk = L.racks.find(r => r.rack.id === p.rack); const room = rk ? L.rooms.find(r => r.racks.includes(rk)) : undefined; setSel({ floor: room?.floorIdx ?? null, room: room?.id ?? null, rack: p.rack, ne: null }); return; }
    if (p.room) { const room = L.rooms.find(r => r.id === p.room); setSel({ floor: room?.floorIdx ?? p.floor ?? null, room: p.room, rack: null, ne: null }); return; }
    if (p.floor !== undefined) { setSel({ floor: p.floor, room: null, rack: null, ne: null }); return; }
    /* click on empty space steps one level up */
    setSel(s => (s.ne ? { ...s, ne: null } : s.rack ? { ...s, rack: null } : s.room !== null ? { ...s, room: null } : EMPTY));
  }, [L, units, unit]);
  const go = (s: Sel) => { setUnit(null); setSel(s); };
  const toggleWalk = () => {
    if (!L) return;
    if (walk) { setWalk(null); return; }
    const s = sel.floor === null && !unitObj ? { ...EMPTY, floor: 0 } : sel;
    if (s !== sel) setSel(s);
    setWalk(walkSpot(L, s, unitObj));
  };
  const onWalkTo = useCallback((x: number, z: number) => {
    setWalk(w => (w && L && canStand(L, w.floorIdx, x, z) ? { key: `w${x.toFixed(2)},${z.toFixed(2)}`, floorIdx: w.floorIdx, eye: [x, w.eye[1], z] } : w));
  }, [L]);

  const att = useMemo(() => (data && L ? buildAttention(L, data) : undefined), [data, L]);
  const posRef = useRef<PosMap>(new Map());
  const anchors = useMemo(() => (data && L ? [...buildAnchors2(L, data, sel, level, layer, att, unit), ...(level !== 'building' ? physAnchors(L, data, sel, pv) : [])] : []), [data, L, sel, level, layer, att, unit, pv]);
  useEffect(() => { document.body.style.cursor = hover ? 'pointer' : ''; return () => { document.body.style.cursor = ''; }; }, [hover]);
  if (!data || !L) return <Loading label="Loading Data center view" />;
  const { dc } = data;
  const room = sel.room !== null ? L.rooms.find(r => r.id === sel.room) : undefined;
  const rk = sel.rack ? L.racks.find(r => r.rack.id === sel.rack) : undefined;
  const ne = rk && sel.ne ? rk.nes.find(n => n.id === sel.ne) : undefined;
  const crumbs: { label: string; go: () => void }[] = [
    { label: 'Building', go: () => go(EMPTY) },
    ...(sel.floor !== null ? [{ label: L.floors[sel.floor].name, go: () => go({ floor: sel.floor, room: null, rack: null, ne: null }) }] : []),
    ...(room ? [{ label: room.name, go: () => go({ floor: sel.floor, room: sel.room, rack: null, ne: null }) }] : []),
    ...(rk ? [{ label: rk.rack.name, go: () => go({ ...sel, ne: null }) }] : []),
    ...(unitObj ? [{ label: unitObj.title, go: () => {} }] : []),
    ...(ne ? [{ label: ne.name.replace(`${dc.id}-`, ''), go: () => {} }] : [])
  ];
  const toggleFull = () => setFull(f => !f);
  /* the floor picker mirrors the shared prototype: Building + one entry per floor */
  const many = L.floors.length > 4;
  const floorOpts = [{ id: 'B', label: 'Building' }, ...L.floors.map(f => ({ id: String(f.idx), label: many ? f.name.replace(/\s*floor$/i, '') : f.name, title: f.name }))];
  const floorVal = sel.floor === null ? 'B' : String(sel.floor);
  const hint = walk ? 'Walking · drag to look around · click the floor to walk there · W A S D or arrow keys to move (Shift = faster) · scroll to zoom · Esc to stop'
    : unitObj ? 'Drag to orbit · click empty space to step back to the room'
    : level === 'building' ? 'Click a floor to enter it · drag to orbit · scroll to zoom'
    : level === 'floor' ? 'Click a room, a rack or a cabinet · click empty space to step out'
    : 'Click a rack door to open it, a device slice to inspect it · click empty space to step out';

  return (
    <div className={`twin t2${full ? ' is-full' : ''}`} data-twin2>
      <div className="twin-main">
        <div className="twin-canvas t2-stage" data-twin-level-now={level}>
          {gl ? <><TwinScene2 L={L} data={data} layer={layer} sel={sel} level={level} onPick={onPick} setHover={setHover} att={att} anchors={anchors} posRef={posRef} resetTick={resetTick} unit={unit} focusPose={unitView?.pose ?? ((showPower || showCables) ? pathPose(L, sel) : null)} hide={unitView?.hide} pv={level !== 'building' ? pv : undefined} walk={walk} onWalkTo={onWalkTo} /><Labels anchors={anchors} posRef={posRef} onPick={onPick} /></>
            : <div className="twin-nogl"><I.Box size={28} /><b>3D view unavailable</b><span>This browser has no WebGL. Use the lists on the right to navigate floors, rooms, racks and equipment.</span></div>}
          <div className="t2-overlay">
            <div className="t2-overlay-left">
              <Seg size="sm" value={floorVal} onChange={v => go(v === 'B' ? EMPTY : { floor: Number(v), room: null, rack: null, ne: null })} options={floorOpts} />
              {level !== 'building' && <Seg size="sm" value={layer} onChange={setLayer} options={LAYERS} />}
              {level !== 'building' && <div className="t2-chips" role="group" aria-label="Show paths">
                <button type="button" className={`t2-chip${showPower ? ' is-on' : ''}`} aria-pressed={showPower} data-twin2-chip="power" onClick={() => setShowPower(v => !v)} title="Draw the power path: UPS → busway → rack PDU, A side and B side"><I.PlugZap size={13} />Power path</button>
                <button type="button" className={`t2-chip${showCables ? ' is-on' : ''}`} aria-pressed={showCables} data-twin2-chip="cables" onClick={() => setShowCables(v => !v)} title="Draw the cable paths: rack → trunk → ODF; select a device to trace its own cables"><I.Cable size={13} />Cable paths</button>
              </div>}
              {level !== 'building' && (showPower || showCables) && <div className="t2-legend" data-twin2-paths-legend>
                {showPower && <><span><i style={{ background: SIDE_C.A }} />A side</span><span><i style={{ background: SIDE_C.B }} />B side</span>{phys?.pdus.some(p => p.kind === 'DC') && <span><i style={{ background: SIDE_C.DC }} />−48 V DC</span>}<span><i style={{ background: '#F5B82E' }} />On battery</span><span><i style={{ background: '#FF4D4F' }} />Tripped</span></>}
                {showCables && <><span><i style={{ background: ROUTE_C[0] }} />Tray route 1</span><span><i style={{ background: ROUTE_C[1] }} />Tray route 2</span><span><i style={{ background: '#22D3EE' }} />Selected device</span></>}
              </div>}
              <div className="t2-legend" data-twin2-legend>{LEGENDS[level === 'building' ? 'health' : layer].map(x => <span key={x.l}><i style={{ background: x.c }} />{x.l}</span>)}</div>
            </div>
            <div className="t2-overlay-right">
              <button type="button" className={`nst-btn nst-btn--sm t2-whole t2-walk${walk ? ' is-on' : ''}`} data-twin2-walk aria-pressed={walking} title={walk ? 'Stop walking (Esc)' : 'Walk the floor at eye level, like street view'} onClick={toggleWalk}><I.Footprints size={14} />{walk ? 'Stop walking' : 'Walk'}</button>
              {(sel.room !== null || sel.rack || unit) && <button type="button" className="nst-btn nst-btn--sm t2-whole" data-twin2="whole-floor" onClick={() => go({ floor: sel.floor, room: null, rack: null, ne: null })}>Whole floor</button>}
              <button type="button" className="nst-icon-btn twin-reset" title={full ? 'Exit expanded view (Esc)' : 'Expand view'} aria-label={full ? 'Exit expanded view' : 'Expand view'} aria-pressed={full} data-twin="fullscreen" onClick={toggleFull}>{full ? <I.Minimize2 size={15} /> : <I.Maximize2 size={15} />}</button>
              <button type="button" className="nst-icon-btn twin-reset" title="Reset view" aria-label="Reset view" data-twin="reset" onClick={() => { setWalk(null); go(EMPTY); setResetTick(t => t + 1); }}><I.RotateCcw size={15} /></button>
            </div>
          </div>
          {unitObj && (
            <div className={`t2-card is-${unitObj.state}`} data-twin2-unit-card={unitObj.key}>
              <div className="t2-card-h"><span className="dot" /><b>{unitObj.title}</b><button type="button" className="t2-card-x" aria-label="Close" onClick={() => setUnit(null)}><I.X size={14} /></button></div>
              <span className="t2-card-type">{unitObj.type} · <em>{unitObj.status}</em></span>
              <dl>{unitObj.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
              <Link to={`/facilities?dc=${dc.id}&tab=${unitObj.tab}`}>Open in Facilities →</Link>
            </div>
          )}
          {!unitObj && <PathCard L={L} data={data} sel={sel} pv={pv} />}
          {hover ? <div className="twin-tip" role="status"><b>{hover.title}</b><span>{hover.sub}</span></div> : <div className="t2-hint">{hint}</div>}
        </div>
      </div>
      <aside className="twin-side" data-twin="panel">
        <TwinPanel data={data} L={L} sel={sel} level={level} onPick={onPick} crumbs={crumbs} att={att} />
      </aside>
    </div>
  );
}

/* DOM labels pinned to projected world points (updated every animation frame) */
function Labels({ anchors, posRef, onPick }: { anchors: Anchor2[]; posRef: React.MutableRefObject<PosMap>; onPick: (p: Pick2) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const root = box.current;
      if (root) {
        const H = root.clientHeight, W = root.clientWidth;
        const placed: [number, number, number, number][] = [];
        const els = [...(root.children as unknown as HTMLElement[])];
        /* selected and faulty labels claim their spot first, then nearer (lower) ones */
        const rank = (el: HTMLElement) => (el.classList.contains('is-sel') ? 0 : el.classList.contains('is-critical') ? 1 : el.classList.contains('is-major') ? 2 : 3);
        const py = (el: HTMLElement) => posRef.current.get(el.dataset.anchor ?? '')?.[1] ?? 0;
        els.sort((a, b) => rank(a) - rank(b) || py(b) - py(a));
        for (const el of els) {
          const p = posRef.current.get(el.dataset.anchor ?? '');
          if (!p || !p[2]) { el.style.display = 'none'; continue; }
          el.style.display = '';
          /* keep labels clear of the control stack in the top-left corner */
          const ov = root.parentElement?.querySelector<HTMLElement>('.t2-overlay-left');
          const ovr = root.parentElement?.querySelector<HTMLElement>('.t2-overlay-right');
          const topMin = ov && p[0] < ov.offsetLeft + ov.offsetWidth + 60 ? ov.offsetTop + ov.offsetHeight + 18
            : ovr && p[0] > ovr.offsetLeft + (ovr.parentElement?.offsetLeft ?? 0) - 60 ? ovr.offsetTop + ovr.offsetHeight + 28 : 16;
          /* keep the whole label inside the canvas: centred labels need half their width, left-anchored ones all of it */
          const lw = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 140;
          const leftAnchored = el.classList.contains('t2-eq') || el.classList.contains('t2-room');
          const x = leftAnchored ? Math.max(8, Math.min(W - lw - 8, p[0])) : Math.max(lw / 2 + 8, Math.min(W - lw / 2 - 8, p[0]));
          let y = Math.max(topMin, Math.min(H - 16, p[1]));
          /* never on top of another label: step up past whatever is already there */
          const lh = (el.firstElementChild as HTMLElement | null)?.offsetHeight ?? 22;
          const x0 = leftAnchored ? x : x - lw / 2;
          const clash = (yy: number) => placed.find(([ax, ay, aw, ah]) => x0 < ax + aw + 3 && x0 + lw + 3 > ax && yy - lh / 2 < ay + ah / 2 + 2 && yy + lh / 2 + 2 > ay - ah / 2);
          const y0 = y;
          for (let k = 0, hit = clash(y); hit && k < 12; k++, hit = clash(y)) y = hit[1] - hit[3] / 2 - lh / 2 - 3;
          /* no room above (the control stack / the top edge): step down instead */
          if (y < topMin) { y = y0; for (let k = 0, hit = clash(y); hit && k < 12; k++, hit = clash(y)) y = hit[1] + hit[3] / 2 + lh / 2 + 3; }
          placed.push([x0, y, lw, lh]);
          el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [posRef, anchors]);
  return (
    <div ref={box} className="t2-labels">
      {anchors.map(a => {
        const body = <>{a.dot && <span className="dot" style={{ background: a.dot }} />}<strong>{a.text}</strong>{a.sub && <small>{a.sub}</small>}</>;
        const attrs = a.pick?.unit ? { 'data-twin2-unit': a.pick.unit } : a.cls.startsWith('t2-floor') ? { 'data-twin2-floor': a.pick?.floor } : a.cls.startsWith('t2-rack') ? { 'data-twin2-rack': a.pick?.rack } : a.cls.startsWith('t2-room') ? { 'data-twin2-room': a.pick?.room } : {};
        return (
          <div key={a.id} data-anchor={a.id} className={`t2-label ${a.cls}`} style={{ display: 'none' }}>
            {a.pick ? <button type="button" {...attrs} title={a.title} onClick={() => onPick(a.pick!)}>{body}</button> : <span title={a.title}>{body}</span>}
          </div>
        );
      })}
    </div>
  );
}
