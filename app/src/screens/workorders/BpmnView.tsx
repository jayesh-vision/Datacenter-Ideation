/* BPMN process diagram (14-Oct-2026, user: "use the same workflow lib as P2B or make it professional"). The standard bpmn-js viewer
   (pan + zoom) over the process's BPMN file (src/workorders/bpmn, the 12 P01–P12 definitions). Steps are matched to diagram elements by
   name, then marked done / current / failed; optional count badges (e.g. instances waiting on a step). Loaded on demand. */
import { useEffect, useRef, useState } from 'react';
import * as I from 'lucide-react';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';
import 'bpmn-js/dist/assets/bpmn-js.css';

const FILES = import.meta.glob('../../workorders/bpmn/*.bpmn', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;
const norm = (s: string) => s.replace(/&amp;/g, '&').trim().toLowerCase();

type Viewer = { importXML: (x: string) => Promise<unknown>; get: <T>(n: string) => T; destroy: () => void };
interface Canvas { zoom: (v?: number | 'fit-viewport', c?: unknown) => number; addMarker: (id: string, m: string) => void; removeMarker: (id: string, m: string) => void }
interface Registry { getAll: () => { id: string; type: string; businessObject?: { name?: string } }[] }
interface Overlays { add: (id: string, o: { position: Record<string, number>; html: string }) => string; clear: () => void }

export function BpmnView({ processKey, done = [], current, incident, counts, height = 380 }: { processKey: string; done?: string[]; current?: string; incident?: boolean; counts?: Record<string, number>; height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const [ready, setReady] = useState(0);
  const [err, setErr] = useState('');
  const touched = useRef(false);
  const [full, setFull] = useState(false);
  useEffect(() => { if (!full) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [full]);
  /* entering or leaving full screen refits the diagram to the new box */
  useEffect(() => { touched.current = false; const t = setTimeout(() => { try { viewer.current?.get<Canvas>('canvas').zoom('fit-viewport', 'auto'); } catch { /* not imported yet */ } }, 60); return () => clearTimeout(t); }, [full]);
  const stopRo = useRef<(() => void) | null>(null);

  useEffect(() => {
    let dead = false;
    import('bpmn-js/lib/NavigatedViewer').then(m => {
      if (dead || !host.current) return;
      const V = m.default as unknown as new (o: { container: HTMLElement }) => Viewer;
      viewer.current = new V({ container: host.current });
      /* refit when the box changes size (drawers open with an animation) until the user zooms */
      const ro = new ResizeObserver(() => { if (touched.current) return; try { viewer.current?.get<Canvas>('canvas').zoom('fit-viewport', 'auto'); } catch { /* not imported yet */ } });
      ro.observe(host.current); stopRo.current = () => ro.disconnect();
      setReady(r => r + 1);
    }).catch(e => setErr(String(e)));
    return () => { dead = true; stopRo.current?.(); viewer.current?.destroy(); viewer.current = null; };
  }, []);

  const [imported, setImported] = useState('');
  useEffect(() => {
    const v = viewer.current; if (!v) return;
    const file = Object.keys(FILES).find(k => k.endsWith(`/${processKey}.bpmn`));
    if (!file) { setErr(`No diagram for ${processKey}`); return; }
    let dead = false;
    FILES[file]().then(xml => v.importXML(xml)).then(() => { if (dead) return; v.get<Canvas>('canvas').zoom('fit-viewport', 'auto'); setImported(processKey + Math.random()); }).catch(e => setErr(String(e?.message ?? e)));
    return () => { dead = true; };
  }, [processKey, ready]);

  /* markers and badges */
  useEffect(() => {
    const v = viewer.current; if (!v || !imported) return;
    const canvas = v.get<Canvas>('canvas'), reg = v.get<Registry>('elementRegistry'), ov = v.get<Overlays>('overlays');
    ov.clear();
    const els = reg.getAll().filter(e => e.businessObject?.name && !/Participant|Lane|Process|Collaboration|SequenceFlow|Label/.test(e.type));
    const doneN = new Set(done.map(norm)), cur = current ? norm(current) : '';
    for (const e of els) {
      for (const m of ['wfm-done', 'wfm-cur', 'wfm-fail']) canvas.removeMarker(e.id, m);
      const n = norm(e.businessObject!.name!);
      if (n === cur) canvas.addMarker(e.id, incident ? 'wfm-fail' : 'wfm-cur');
      else if (doneN.has(n)) canvas.addMarker(e.id, 'wfm-done');
      const c = counts?.[n] ?? counts?.[e.businessObject!.name!];
      if (c) ov.add(e.id, { position: { top: -10, right: 10 }, html: `<span class="wfm-badge">${c}</span>` });
      if (n === cur) ov.add(e.id, { position: { bottom: -8, left: 0 }, html: `<span class="wfm-now${incident ? ' is-fail' : ''}">${incident ? 'failed' : 'now'}</span>` });
    }
  }, [imported, done.join('|'), current, incident, JSON.stringify(counts ?? {})]);

  const zoom = (f: number | 'fit') => { const c = viewer.current?.get<Canvas>('canvas'); if (!c) return; if (f === 'fit') { touched.current = false; c.zoom('fit-viewport', 'auto'); } else { touched.current = true; c.zoom(c.zoom() * f); } };
  return (
    <div className={`wfm${full ? ' is-full' : ''}`} style={full ? undefined : { height }}>
      <div ref={host} className="wfm-canvas" onWheel={() => { touched.current = true; }} onMouseDown={() => { touched.current = true; }} />
      <div className="wfm-tools">
        <button type="button" title={full ? 'Exit full screen (Esc)' : 'Full screen'} aria-pressed={full} onClick={() => setFull(f => !f)}>{full ? <I.Minimize2 size={14} /> : <I.Maximize2 size={14} />}</button>
        <button type="button" title="Fit to view" onClick={() => zoom('fit')}><I.Scan size={14} /></button>
        <button type="button" title="Zoom in" onClick={() => zoom(1.2)}><I.Plus size={14} /></button>
        <button type="button" title="Zoom out" onClick={() => zoom(1 / 1.2)}><I.Minus size={14} /></button>
      </div>
      <div className="wfm-legend"><span><i className="is-done" />Done</span><span><i className="is-cur" />Current step</span><span><i className="is-fail" />Failed step</span><span className="vw-label">drag to pan · scroll to zoom{full ? ' · Esc to close' : ''}</span></div>
      {err && <p className="wfm-err">{err}</p>}
    </div>
  );
}
