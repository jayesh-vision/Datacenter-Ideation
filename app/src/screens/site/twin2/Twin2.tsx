import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as I from 'lucide-react';
import { getTwinData } from '../../../api/ext-twin';
import { useQuery, usePersona } from '../../../api';
import { Loading } from '../../../shell/page';
import { Seg } from '../../../ui/kit';
import { buildLayout, type Level, type Sel } from '../twin/layout';
import type { Hover, Layer, Pick, PosMap } from '../twin/Scene';
import { buildAnchors2, type Anchor2 } from './anchors2';
import { TwinPanel } from '../twin/Panel';
import { buildAttention } from '../twin/attention';
import { LEGENDS, TwinScene2 } from './Scene2';
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const L = useMemo(() => (data ? buildLayout(data.dc, data.nes) : null), [data]);
  useEffect(() => { setSel(EMPTY); }, [dcId, persona]);
  const level = levelOf(sel);

  const onPick = useCallback((p: Pick) => {
    setHover(null);
    if (!L) return;
    if (p.ne && p.rack) { const rk = L.racks.find(r => r.rack.id === p.rack); const room = rk ? L.rooms.find(r => r.racks.includes(rk)) : undefined; setSel({ floor: room?.floorIdx ?? null, room: room?.id ?? null, rack: p.rack, ne: p.ne }); return; }
    if (p.rack) { const rk = L.racks.find(r => r.rack.id === p.rack); const room = rk ? L.rooms.find(r => r.racks.includes(rk)) : undefined; setSel({ floor: room?.floorIdx ?? null, room: room?.id ?? null, rack: p.rack, ne: null }); return; }
    if (p.room) { const room = L.rooms.find(r => r.id === p.room); setSel({ floor: room?.floorIdx ?? p.floor ?? null, room: p.room, rack: null, ne: null }); return; }
    if (p.floor !== undefined) { setSel({ floor: p.floor, room: null, rack: null, ne: null }); return; }
    /* click on empty space steps one level up */
    setSel(s => (s.ne ? { ...s, ne: null } : s.rack ? { ...s, rack: null } : s.room !== null ? { ...s, room: null } : EMPTY));
  }, [L]);

  const att = useMemo(() => (data && L ? buildAttention(L, data) : undefined), [data, L]);
  const posRef = useRef<PosMap>(new Map());
  const anchors = useMemo(() => (data && L ? buildAnchors2(L, data, sel, level, layer, att) : []), [data, L, sel, level, layer, att]);
  useEffect(() => { document.body.style.cursor = hover ? 'pointer' : ''; return () => { document.body.style.cursor = ''; }; }, [hover]);
  if (!data || !L) return <Loading label="Loading Data center view" />;
  const { dc } = data;
  const room = sel.room !== null ? L.rooms.find(r => r.id === sel.room) : undefined;
  const rk = sel.rack ? L.racks.find(r => r.rack.id === sel.rack) : undefined;
  const ne = rk && sel.ne ? rk.nes.find(n => n.id === sel.ne) : undefined;
  const crumbs: { label: string; go: () => void }[] = [
    { label: 'Building', go: () => setSel(EMPTY) },
    ...(sel.floor !== null ? [{ label: L.floors[sel.floor].name, go: () => setSel({ floor: sel.floor, room: null, rack: null, ne: null }) }] : []),
    ...(room ? [{ label: room.name, go: () => setSel({ floor: sel.floor, room: sel.room, rack: null, ne: null }) }] : []),
    ...(rk ? [{ label: rk.rack.name, go: () => setSel({ ...sel, ne: null }) }] : []),
    ...(ne ? [{ label: ne.name.replace(`${dc.id}-`, ''), go: () => {} }] : [])
  ];
  const toggleFull = () => setFull(f => !f);
  /* the floor picker mirrors the shared prototype: Building + one entry per floor */
  const many = L.floors.length > 4;
  const floorOpts = [{ id: 'B', label: 'Building' }, ...L.floors.map(f => ({ id: String(f.idx), label: many ? f.name.replace(/\s*floor$/i, '') : f.name, title: f.name }))];
  const floorVal = sel.floor === null ? 'B' : String(sel.floor);
  const hint = level === 'building' ? 'Click a floor to enter it · drag to orbit · scroll to zoom'
    : level === 'floor' ? 'Click a room, a rack or a cabinet · click empty space to step out'
    : 'Click a rack door to open it, a device slice to inspect it · click empty space to step out';

  return (
    <div className={`twin t2${full ? ' is-full' : ''}`} data-twin2>
      <div className="twin-main">
        <div className="twin-canvas t2-stage" data-twin-level-now={level}>
          {gl ? <><TwinScene2 L={L} data={data} layer={layer} sel={sel} level={level} onPick={onPick} setHover={setHover} att={att} anchors={anchors} posRef={posRef} resetTick={resetTick} /><Labels anchors={anchors} posRef={posRef} onPick={onPick} /></>
            : <div className="twin-nogl"><I.Box size={28} /><b>3D view unavailable</b><span>This browser has no WebGL. Use the lists on the right to navigate floors, rooms, racks and equipment.</span></div>}
          <div className="t2-overlay">
            <div className="t2-overlay-left">
              <Seg size="sm" value={floorVal} onChange={v => setSel(v === 'B' ? EMPTY : { floor: Number(v), room: null, rack: null, ne: null })} options={floorOpts} />
              {level !== 'building' && <Seg size="sm" value={layer} onChange={setLayer} options={LAYERS} />}
              <div className="t2-legend" data-twin2-legend>{LEGENDS[level === 'building' ? 'health' : layer].map(x => <span key={x.l}><i style={{ background: x.c }} />{x.l}</span>)}</div>
            </div>
            <div className="t2-overlay-right">
              {(sel.room !== null || sel.rack) && <button type="button" className="nst-btn nst-btn--sm t2-whole" data-twin2="whole-floor" onClick={() => setSel({ floor: sel.floor, room: null, rack: null, ne: null })}>Whole floor</button>}
              <button type="button" className="nst-icon-btn twin-reset" title={full ? 'Exit expanded view (Esc)' : 'Expand view'} aria-label={full ? 'Exit expanded view' : 'Expand view'} aria-pressed={full} data-twin="fullscreen" onClick={toggleFull}>{full ? <I.Minimize2 size={15} /> : <I.Maximize2 size={15} />}</button>
              <button type="button" className="nst-icon-btn twin-reset" title="Reset view" aria-label="Reset view" data-twin="reset" onClick={() => { setSel(EMPTY); setResetTick(t => t + 1); }}><I.RotateCcw size={15} /></button>
            </div>
          </div>
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
function Labels({ anchors, posRef, onPick }: { anchors: Anchor2[]; posRef: React.MutableRefObject<PosMap>; onPick: (p: Pick) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const root = box.current;
      if (root) {
        const H = root.clientHeight, W = root.clientWidth;
        for (const el of root.children as unknown as HTMLElement[]) {
          const p = posRef.current.get(el.dataset.anchor ?? '');
          if (!p || !p[2]) { el.style.display = 'none'; continue; }
          el.style.display = '';
          /* keep labels clear of the control stack in the top-left corner */
          const ov = root.parentElement?.querySelector<HTMLElement>('.t2-overlay-left');
          const topMin = ov && p[0] < ov.offsetLeft + ov.offsetWidth + 60 ? ov.offsetTop + ov.offsetHeight + 18 : 16;
          /* keep the whole label inside the canvas: centred labels need half their width, left-anchored ones all of it */
          const lw = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 140;
          const leftAnchored = el.classList.contains('t2-eq') || el.classList.contains('t2-room');
          const x = leftAnchored ? Math.max(8, Math.min(W - lw - 8, p[0])) : Math.max(lw / 2 + 8, Math.min(W - lw / 2 - 8, p[0]));
          const y = Math.max(topMin, Math.min(H - 16, p[1]));
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
        const attrs = a.cls.startsWith('t2-floor') ? { 'data-twin2-floor': a.pick?.floor } : a.cls.startsWith('t2-rack') ? { 'data-twin2-rack': a.pick?.rack } : a.cls.startsWith('t2-room') ? { 'data-twin2-room': a.pick?.room } : {};
        return (
          <div key={a.id} data-anchor={a.id} className={`t2-label ${a.cls}`} style={{ display: 'none' }}>
            {a.pick ? <button type="button" {...attrs} onClick={() => onPick(a.pick!)}>{body}</button> : <span>{body}</span>}
          </div>
        );
      })}
    </div>
  );
}
