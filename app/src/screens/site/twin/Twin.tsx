import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as I from 'lucide-react';
import { getTwinData } from '../../../api/ext-twin';
import { useQuery } from '../../../api';
import { Loading } from '../../../shell/page';
import { Seg } from '../../../ui/kit';
import { buildLayout, type Level, type Sel } from './layout';
import { TwinScene, type Hover, type Layer, type Pick, type PosMap } from './Scene';
import { buildAnchors, type Anchor } from './anchors';
import { TwinPanel } from './Panel';
import '../../../styles/twin.css';

const LAYERS: { id: Layer; label: string; legend: { c: string; l: string }[] }[] = [
  { id: 'health', label: 'Health', legend: [{ c: '#64748B', l: 'No alarms' }, { c: '#FCD34D', l: 'Minor' }, { c: '#F59E0B', l: 'Major' }, { c: '#EF4444', l: 'Critical' }] },
  { id: 'power', label: 'Power', legend: [{ c: '#1C81EF', l: '< 75% of budget' }, { c: '#F59E0B', l: '75–85%' }, { c: '#EF4444', l: '≥ 85%' }] },
  { id: 'thermal', label: 'Thermal', legend: [{ c: '#60A5FA', l: '≤ 25°C' }, { c: '#F59E0B', l: '25–27°C' }, { c: '#EF4444', l: '> 27°C' }, { c: '#BFDBFE', l: 'zone tint' }] },
  { id: 'connectivity', label: 'Connectivity', legend: [{ c: '#1C81EF', l: 'Edge link terminates' }, { c: '#EF4444', l: 'Link down' }, { c: '#CBD5E1', l: 'Internal only' }] }
];

const hasWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };
const levelOf = (s: Sel): Level => (s.ne ? 'equipment' : s.rack ? 'rack' : s.room !== null ? 'room' : s.floor !== null ? 'floor' : 'building');

/* DC Explorer / digital twin (blueprint 4.3): Building → Floor → Room → Rack
   → Equipment, one scene, four overlay layers, and a context panel. */
export default function Twin({ dcId }: { dcId: string }) {
  const { data } = useQuery(() => getTwinData(dcId), [dcId]);
  const [sel, setSel] = useState<Sel>({ floor: null, room: null, rack: null, ne: null });
  const [layer, setLayer] = useState<Layer>('health');
  const [hover, setHover] = useState<Hover | null>(null);
  const [gl] = useState(hasWebGL);
  const [full, setFull] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setFull(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    document.addEventListener('fullscreenchange', onFs); window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('fullscreenchange', onFs); window.removeEventListener('keydown', onKey); };
  }, []);
  const posRef = useRef<PosMap>(new Map());
  const L = useMemo(() => (data ? buildLayout(data.dc, data.nes) : null), [data]);
  useEffect(() => { setSel({ floor: null, room: null, rack: null, ne: null }); }, [dcId]);
  const level = levelOf(sel);

  const onPick = useCallback((p: Pick) => {
    setHover(null);
    if (!L) return;
    if (p.ne && p.rack) { const rk = L.racks.find(r => r.rack.id === p.rack); const room = rk ? L.rooms.find(r => r.racks.includes(rk)) : undefined; setSel({ floor: room?.floorIdx ?? null, room: room?.id ?? null, rack: p.rack, ne: p.ne }); return; }
    if (p.rack) { const rk = L.racks.find(r => r.rack.id === p.rack); const room = rk ? L.rooms.find(r => r.racks.includes(rk)) : undefined; setSel({ floor: room?.floorIdx ?? null, room: room?.id ?? null, rack: p.rack, ne: null }); return; }
    if (p.room) { const room = L.rooms.find(r => r.id === p.room); setSel({ floor: room?.floorIdx ?? p.floor ?? null, room: p.room, rack: null, ne: null }); return; }
    if (p.floor !== undefined) { setSel({ floor: p.floor, room: null, rack: null, ne: null }); return; }
    /* click on empty space steps one level up */
    setSel(s => (s.ne ? { ...s, ne: null } : s.rack ? { ...s, rack: null } : s.room !== null ? { ...s, room: null } : { floor: null, room: null, rack: null, ne: null }));
  }, [L]);

  const anchors = useMemo(() => (data && L ? buildAnchors(L, data, sel, level) : []), [data, L, sel, level]);
  useEffect(() => { document.body.style.cursor = hover ? 'pointer' : ''; return () => { document.body.style.cursor = ''; }; }, [hover]);
  if (!data || !L) return <Loading label="Building the digital twin" />;
  const { dc } = data;
  const room = sel.room !== null ? L.rooms.find(r => r.id === sel.room) : undefined;
  const rk = sel.rack ? L.racks.find(r => r.rack.id === sel.rack) : undefined;
  const ne = rk && sel.ne ? rk.nes.find(n => n.id === sel.ne) : undefined;
  const crumbs: { label: string; go: () => void }[] = [
    { label: 'Building', go: () => setSel({ floor: null, room: null, rack: null, ne: null }) },
    ...(sel.floor !== null ? [{ label: L.floors[sel.floor].name, go: () => setSel({ floor: sel.floor, room: null, rack: null, ne: null }) }] : []),
    ...(room ? [{ label: room.name, go: () => setSel({ floor: sel.floor, room: sel.room, rack: null, ne: null }) }] : []),
    ...(rk ? [{ label: rk.rack.name, go: () => setSel({ ...sel, ne: null }) }] : []),
    ...(ne ? [{ label: ne.name.replace(`${dc.id}-`, ''), go: () => {} }] : [])
  ];
  /* full screen: the whole twin (canvas + panel) so navigation stays available;
     native Fullscreen API when allowed, CSS overlay fallback otherwise */
  const toggleFull = () => {
    const el = rootRef.current; if (!el) return;
    if (full) { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); setFull(false); return; }
    setFull(true);
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  };
  const legend = LAYERS.find(l => l.id === layer)!.legend;

  return (
    <div className={`twin${full ? ' is-full' : ''}`} ref={rootRef}>
      <div className="twin-main">
        <div className="twin-canvas" data-twin-level-now={level}>
          {gl ? <><TwinScene L={L} data={data} layer={layer} sel={sel} level={level} onPick={onPick} setHover={setHover} anchors={anchors} posRef={posRef} /><LabelOverlay anchors={anchors} posRef={posRef} onPick={onPick} /></>
            : <div className="twin-nogl"><I.Box size={28} /><b>3D view unavailable</b><span>This browser has no WebGL. Use the lists on the right to navigate floors, rooms, racks and equipment.</span></div>}
          {/* only view controls live on the canvas; navigation is the panel's path and lists */}
          <div className="twin-tools">
            <Seg size="sm" value={layer} onChange={setLayer} options={LAYERS.map(l => ({ id: l.id, label: l.label }))} />
            <button type="button" className="nst-icon-btn twin-reset" title={full ? 'Exit full screen (Esc)' : 'Full screen'} aria-label={full ? 'Exit full screen' : 'Full screen'} aria-pressed={full} data-twin="fullscreen" onClick={toggleFull}>{full ? <I.Minimize2 size={15} /> : <I.Maximize2 size={15} />}</button>
            <button type="button" className="nst-icon-btn twin-reset" title="Reset view" aria-label="Reset view" data-twin="reset" onClick={() => setSel({ floor: null, room: null, rack: null, ne: null })}><I.RotateCcw size={15} /></button>
          </div>
          {hover && <div className="twin-tip" role="status"><b>{hover.title}</b><span>{hover.sub}</span></div>}
          <div className="twin-legend" title="Click to drill in · click empty space to step out · drag to orbit · scroll to zoom">
            {legend.map(x => <span key={x.l}><i style={{ background: x.c }} />{x.l}</span>)}
          </div>
        </div>
      </div>
      <aside className="twin-side" data-twin="panel">
        <TwinPanel data={data} L={L} sel={sel} level={level} onPick={onPick} crumbs={crumbs} />
      </aside>
    </div>
  );
}

/* DOM labels pinned to projected world points (updated every animation frame) */
function LabelOverlay({ anchors, posRef, onPick }: { anchors: Anchor[]; posRef: React.MutableRefObject<PosMap>; onPick: (p: Pick) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    let raf = 0;
    const ROW = 24;
    const tick = () => {
      const root = box.current, sv = svg.current;
      if (root) {
        const H = root.clientHeight, W = root.clientWidth;
        /* column labels: evenly spaced rows from the top, pinned to a fixed x */
        const cols = anchors.filter(a => a.column);
        const colX = (() => { const xs = cols.map(a => posRef.current.get(a.id)?.[0] ?? 0); return xs.length ? Math.min(W - 150, Math.max(...xs) + 36) : 0; })();
        const top = Math.max(16, (H - (cols.length - 1) * ROW) / 2 - ROW);
        for (const el of root.children as unknown as HTMLElement[]) {
          const id = el.dataset.anchor ?? '';
          const a = anchors.find(x => x.id === id);
          const p = posRef.current.get(id);
          if (!p || !p[2] || !a) { el.style.display = 'none'; continue; }
          el.style.display = '';
          if (a.column) {
            const y = Math.min(H - 16, top + a.column.slot * ROW);
            el.style.transform = `translate(${colX.toFixed(1)}px, ${y.toFixed(1)}px)`;
            const ln = sv?.querySelector<SVGLineElement>(`[data-leader="${CSS.escape(id)}"]`);
            if (ln) { ln.setAttribute('x1', String(p[0])); ln.setAttribute('y1', String(p[1])); ln.setAttribute('x2', String(colX - 4)); ln.setAttribute('y2', String(y)); ln.style.display = ''; }
          } else { const x = Math.max(60, Math.min(W - 60, p[0])), y = Math.max(14, Math.min(H - 14, p[1])); el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [posRef, anchors]);
  return (
    <>
      <svg ref={svg} className="twin-leaders" aria-hidden="true">{anchors.filter(a => a.column).map(a => <line key={a.id} data-leader={a.id} style={{ display: 'none' }} />)}</svg>
      <div ref={box} className="twin-labels" aria-hidden={false}>
        {anchors.map(a => (
          <div key={a.id} data-anchor={a.id} className={`twin-label ${a.cls} is-${a.align}`} style={{ display: 'none' }}>
            {a.pick ? <button type="button" onClick={() => onPick(a.pick!)}>{a.text}{a.sub && <small>{a.sub}</small>}</button> : <span>{a.text}{a.sub && <small>{a.sub}</small>}</span>}
          </div>
        ))}
      </div>
    </>
  );
}
