import { sevLabel } from '../../lib/vocab';
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { geoNow } from '../../api';
import * as I from 'lucide-react';
import 'leaflet/dist/leaflet.css';

export type PinKind = 'crit' | 'warn' | 'ok';
export interface DcPin {
  id: string; lat: number; lng: number; city: string; tier: string; kind: PinKind; size: number;
  incidents: number; worstSev: number; breaching: number; alerts: number; critAlerts: number; powerPct: number; coolPct: number; services: number; facilityIssue: boolean;
  /* extra words the map search matches on, e.g. "Illinois · Midwest" */
  place?: string;
}
export interface DcLinkPair { a: string; z: string; n: number; down: number }

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
/* the geography's bounds: India or the USA */
const INDIA = (): L.LatLngBoundsExpression => geoNow().map.bounds;
type BaseId = 'light' | 'streets' | 'satellite' | 'terrain';
const BASEMAPS: { id: BaseId; label: string; base: string; ref?: string; attr: string }[] = [
  { id: 'light', label: 'Light', base: 'Canvas/World_Light_Gray_Base', ref: 'Canvas/World_Light_Gray_Reference', attr: '© Esri, HERE, Garmin' },
  { id: 'streets', label: 'Streets', base: 'World_Street_Map', attr: '© Esri, HERE, Garmin, OpenStreetMap' },
  { id: 'satellite', label: 'Satellite', base: 'World_Imagery', ref: 'Reference/World_Boundaries_and_Places', attr: '© Esri, Maxar, Earthstar Geographics' },
  { id: 'terrain', label: 'Terrain', base: 'World_Topo_Map', attr: '© Esri, HERE, Garmin, FAO, USGS' }
];
const tile = (svc: string) => `${ESRI}/${svc}/MapServer/tile/{z}/{y}/{x}`;
const thumb = (svc: string) => `${ESRI}/${svc}/MapServer/tile/${geoNow().map.thumbTile}`;   // one tile over the geography, as a basemap preview
const KIND: Record<PinKind, { label: string }> = { crit: { label: 'Critical / high' }, warn: { label: 'Incidents' }, ok: { label: 'Healthy' } };
const loadBase = (): BaseId => { try { const v = localStorage.getItem('dco.map.base'); return BASEMAPS.some(b => b.id === v) ? (v as BaseId) : 'light'; } catch { return 'light'; } };

/* Live estate map. Sites are rings sized by estate weight and coloured by state; a site
   with an open critical / high incident ripples, one with lesser incidents pulses slowly. Backhaul that is
   down is drawn as moving red dashes. Clicking a site opens its summary and fans out its
   backhaul to peer sites. Basemap is switchable (light / streets / satellite / terrain). */
export function DcMap({ pins, links = [], onNav, height = 520 }: { pins: DcPin[]; links?: DcLinkPair[]; onNav: (path: string) => void; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pinLayer = useRef<L.LayerGroup | null>(null), linkLayer = useRef<L.LayerGroup | null>(null), fanLayer = useRef<L.LayerGroup | null>(null);
  const tiles = useRef<L.TileLayer[]>([]);
  const nav = useRef(onNav); nav.current = onNav;
  const entered = useRef(false);
  const [base, setBase] = useState<BaseId>(loadBase);
  const [baseOpen, setBaseOpen] = useState(false);
  const [show, setShow] = useState<Record<PinKind, boolean>>({ crit: true, warn: true, ok: true });
  const [sel, setSel] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  /* expanded: fills the app's content area (top bar and left menu stay visible); Esc closes */
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!full) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [full]);
  useEffect(() => {
    const m = map.current; if (!m) return;
    if (full) m.scrollWheelZoom.enable(); else m.scrollWheelZoom.disable();
    /* refit after the container has resized and the resize observer has run */
    const t = window.setTimeout(() => { m.invalidateSize({ animate: false, pan: false }); m.fitBounds(INDIA(), { animate: false, padding: [12, 12] }); }, 160);
    return () => window.clearTimeout(t);
  }, [full]);
  const byId = useMemo(() => new Map(pins.map(p => [p.id, p])), [pins]);

  /* map + interaction model */
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomSnap: 0.25, zoomDelta: 0.5, minZoom: 3.5, maxZoom: 16, scrollWheelZoom: false, zoomControl: false, attributionControl: true }).fitBounds(INDIA());
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    L.control.scale({ position: 'bottomright', imperial: false, maxWidth: 90 }).addTo(m);
    /* site labels sit in their own pane above every pin, so a neighbouring pin never covers a label */
    const lp = m.createPane('dclabels'); lp.style.zIndex = '640'; lp.style.pointerEvents = 'none';
    linkLayer.current = L.layerGroup().addTo(m); fanLayer.current = L.layerGroup().addTo(m); pinLayer.current = L.layerGroup().addTo(m);
    map.current = m;
    /* wheel zoom only after the user clicks into the map, so the page still scrolls past it */
    let hintT = 0;
    const node = el.current;
    const onWheel = () => { if (m.scrollWheelZoom.enabled()) return; setHint(true); window.clearTimeout(hintT); hintT = window.setTimeout(() => setHint(false), 1600); };
    const arm = () => { m.scrollWheelZoom.enable(); setHint(false); };
    const disarm = () => m.scrollWheelZoom.disable();
    node.addEventListener('wheel', onWheel, { passive: true }); node.addEventListener('mousedown', arm); node.addEventListener('mouseleave', disarm);
    /* popup buttons navigate through the router */
    const onClick = (e: MouseEvent) => { const a = (e.target as HTMLElement).closest<HTMLElement>('[data-nav]'); if (a) { e.preventDefault(); nav.current(a.dataset.nav!); } };
    node.addEventListener('click', onClick);
    m.on('click', () => setSel(null));   // a click on empty map closes the site card
    let fitted = false;
    const ro = new ResizeObserver(() => { if (!node.isConnected) return; m.invalidateSize({ animate: false, pan: false }); if (!fitted && node.clientHeight > 100) { fitted = true; m.fitBounds(INDIA(), { animate: false, padding: [12, 12] }); } });
    ro.observe(node);
    return () => { ro.disconnect(); window.clearTimeout(hintT); node.removeEventListener('wheel', onWheel); node.removeEventListener('mousedown', arm); node.removeEventListener('mouseleave', disarm); node.removeEventListener('click', onClick); m.remove(); map.current = null; };
  }, []);

  /* basemap */
  useEffect(() => {
    const m = map.current; if (!m) return;
    tiles.current.forEach(t => t.remove());
    const b = BASEMAPS.find(x => x.id === base)!;
    tiles.current = [L.tileLayer(tile(b.base), { attribution: b.attr, maxZoom: 16, maxNativeZoom: b.id === 'light' ? 13 : 16, zIndex: 1 }).addTo(m), /* place labels: on the light canvas only once zoomed in, so city names do not crowd the sites at country scale */
      ...(b.ref ? [L.tileLayer(tile(b.ref), { maxZoom: 16, maxNativeZoom: 13, zIndex: 2, minZoom: b.id === 'light' ? 6 : 0 }).addTo(m)] : [])];
    try { localStorage.setItem('dco.map.base', base); } catch { /* storage blocked */ }
  }, [base]);

  /* sites */
  useEffect(() => {
    const g = pinLayer.current, m = map.current; if (!g || !m) return;
    g.clearLayers();
    const first = !entered.current; entered.current = true;
    const order: Record<PinKind, number> = { ok: 0, warn: 1, crit: 2 };
    [...pins].filter(p => show[p.kind]).sort((a, b) => order[a.kind] - order[b.kind]).forEach((p, i) => {
      const s = p.size;
      const html = `<div class="dcpin is-${p.kind}${first ? ' is-enter' : ''}" style="--s:${s}px;--d:${i * 25}ms">${p.kind !== 'ok' ? '<i class="dcpin-halo"></i>' : ''}${p.kind === 'crit' ? '<i class="dcpin-halo is-2"></i>' : ''}<i class="dcpin-ring"></i>${p.incidents ? `<b class="dcpin-badge">${p.incidents}</b>` : ''}${p.kind === 'crit' ? '' : `<span class="dcpin-label">${p.id}</span>`}</div>`;
      const mk = L.marker([p.lat, p.lng], { icon: L.divIcon({ html, className: 'dcpin-wrap', iconSize: [s, s], iconAnchor: [s / 2, s / 2] }), riseOnHover: true, zIndexOffset: order[p.kind] * 1000, keyboard: true, title: '' });
      mk.bindTooltip(`<b>${p.id}</b> · ${p.city}<br>${p.incidents ? `${p.incidents} open incident${p.incidents === 1 ? '' : 's'}${p.worstSev ? ` · worst ${sevLabel(p.worstSev).toLowerCase()}` : ''}` : 'no open incident'} · ${p.alerts} alarms`, { direction: 'top', offset: [0, -s / 2 - 4], className: 'map-tip' });
      mk.on('click', e => { L.DomEvent.stopPropagation(e); mk.closeTooltip(); setSel(cur => (cur === p.id ? null : p.id)); });
      mk.addTo(g);
      if (p.kind === 'crit') L.marker([p.lat, p.lng], { pane: 'dclabels', interactive: false, keyboard: false, icon: L.divIcon({ html: `<span class="dcpin-label is-fixed${first ? ' is-enter' : ''}" style="--o:${s / 2 + 3}px">${p.id}</span>`, className: 'dcpin-wrap', iconSize: [0, 0] }) }).addTo(g);
    });
  }, [pins, show]);

  /* backhaul: links that are down are always shown; the selected site fans out all of its links */
  useEffect(() => {
    const g = linkLayer.current, f = fanLayer.current; if (!g || !f) return;
    g.clearLayers(); f.clearLayers();
    const line = (l: DcLinkPair, to: L.LayerGroup, fan: boolean) => {
      const a = byId.get(l.a), z = byId.get(l.z); if (!a || !z) return;
      const down = l.down > 0;
      L.polyline(arc([a.lat, a.lng], [z.lat, z.lng]), { className: `dclink${down ? ' is-down' : ''}${fan ? ' is-fan' : ''}`, weight: down ? 2.5 : 1.6, color: down ? '#ef4444' : '#1C81EF', opacity: down ? 0.95 : 0.55, interactive: true })
        .bindTooltip(`<b>${l.a} ↔ ${l.z}</b><br>${l.n} backhaul link${l.n === 1 ? '' : 's'}${down ? ` · ${l.down} down` : ' · all up'}`, { sticky: true, className: 'map-tip' }).addTo(to);
    };
    if (show.crit || show.warn) links.filter(l => l.down > 0 && l.a !== sel && l.z !== sel).forEach(l => line(l, g, false));
    if (sel) links.filter(l => l.a === sel || l.z === sel).forEach(l => line(l, f, true));
  }, [links, byId, sel, show]);

  const counts = { crit: pins.filter(p => p.kind === 'crit').length, warn: pins.filter(p => p.kind === 'warn').length, ok: pins.filter(p => p.kind === 'ok').length };
  const issues = pins.filter(p => p.kind !== 'ok');
  const fitIssues = () => { const m = map.current; if (!m || !issues.length) return; setSel(null); m.flyToBounds(L.latLngBounds(issues.map(p => [p.lat, p.lng] as [number, number])).pad(0.25), { duration: 0.7, maxZoom: 7 }); };
  /* search: fly to the site and open its summary; a site hidden by the legend is shown again */
  const goTo = (p: DcPin) => {
    const m = map.current; if (!m) return;
    setShow(s => (s[p.kind] ? s : { ...s, [p.kind]: true }));
    setFindOpen(false); setBaseOpen(false);
    m.flyTo([p.lat, p.lng], Math.max(m.getZoom(), 7), { duration: 0.7 });
    setSel(p.id);
  };
  const reset = () => { const m = map.current; if (!m) return; setSel(null); m.flyToBounds(INDIA(), { duration: 0.7, padding: [4, 4] }); };

  return (
    <div className={`map dcmap is-${base}${full ? ' is-full' : ''}`} style={full ? undefined : { height }}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      <div className="dcmap-tools">
        <div className="dcmap-base">
          <button type="button" className={`dcmap-btn${findOpen ? ' is-on' : ''}`} title="Search datacenters" aria-label="Search datacenters" aria-expanded={findOpen} onClick={() => { setFindOpen(o => !o); setBaseOpen(false); }}><I.Search size={16} /></button>
          {findOpen && <MapSearch pins={pins} onPick={goTo} onClose={() => setFindOpen(false)} />}
        </div>
        <div className="dcmap-base">
          <button type="button" className={`dcmap-btn${baseOpen ? ' is-on' : ''}`} title="Basemap" aria-label="Basemap" aria-expanded={baseOpen} onClick={() => { setBaseOpen(o => !o); setFindOpen(false); }}><I.Layers size={16} /></button>
          {baseOpen && (
            <div className="dcmap-basemenu" role="listbox" aria-label="Basemap">
              {BASEMAPS.map(b => (
                <button key={b.id} type="button" role="option" aria-selected={base === b.id} className={base === b.id ? 'is-on' : ''} onClick={() => { setBase(b.id); setBaseOpen(false); }}>
                  <img src={thumb(b.base)} alt="" loading="lazy" /><span>{b.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className={`dcmap-btn${full ? ' is-on' : ''}`} title={full ? 'Exit expanded view (Esc)' : 'Expand map'} aria-label={full ? 'Exit expanded view' : 'Expand map'} aria-pressed={full} onClick={() => setFull(f => !f)}>{full ? <I.Minimize2 size={16} /> : <I.Maximize2 size={16} />}</button>
        <button type="button" className="dcmap-btn" title="Focus on sites with issues" aria-label="Focus on sites with issues" onClick={fitIssues} disabled={!issues.length}><I.Crosshair size={16} /></button>
        <button type="button" className="dcmap-btn" title="Reset view" aria-label="Reset view" onClick={reset}><I.Home size={16} /></button>
      </div>
      <div className="map-legend dcmap-legend" role="group" aria-label="Show or hide sites by state">
        {(['ok', 'warn', 'crit'] as PinKind[]).map(k => (
          <button key={k} type="button" className={`is-${k}${show[k] ? '' : ' is-off'}`} aria-pressed={show[k]} title={show[k] ? `Hide ${KIND[k].label.toLowerCase()}` : `Show ${KIND[k].label.toLowerCase()}`} onClick={() => setShow(s => ({ ...s, [k]: !s[k] }))}>
            <i />{KIND[k].label}<b>{counts[k]}</b>
          </button>
        ))}
        <span className="dcmap-leg-link" title="Backhaul between datacenters that is down"><i />Link down</span>
      </div>
      {full && <div className="dcmap-fulltitle"><b>Live estate</b><span>{pins.length} datacenters · {counts.crit} with critical / high · {links.filter(l => l.down).length} backhaul down</span></div>}
      {sel && byId.get(sel) && <SiteCard p={byId.get(sel)!} onClose={() => setSel(null)} onNav={path => nav.current(path)} />}
      {hint && <div className="dcmap-hint">Click the map, then scroll to zoom</div>}
    </div>
  );
}

/* search panel beside the map tools: id, city, state, region or tier; arrows + Enter pick, Esc closes */
function MapSearch({ pins, onPick, onClose }: { pins: DcPin[]; onPick: (p: DcPin) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const inp = useRef<HTMLInputElement>(null);
  useEffect(() => { inp.current?.focus(); }, []);
  const rank: Record<PinKind, number> = { crit: 0, warn: 1, ok: 2 };
  const hits = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hay = (p: DcPin) => `${p.id} ${p.city} ${p.place ?? ''} ${p.tier}`.toLowerCase();
    return pins.filter(p => words.every(w => hay(p).includes(w)))
      .sort((a, b) => Number(!a.id.toLowerCase().startsWith(words[0] ?? '')) - Number(!b.id.toLowerCase().startsWith(words[0] ?? '')) || rank[a.kind] - rank[b.kind] || a.id.localeCompare(b.id));
  }, [pins, q]);
  const cur = Math.min(at, Math.max(0, hits.length - 1));
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt(Math.min(cur + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(Math.max(cur - 1, 0)); }
    else if (e.key === 'Enter' && hits[cur]) onPick(hits[cur]);
    else if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
  };
  return (
    <div className="dcmap-find" role="dialog" aria-label="Search datacenters" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
      <div className="dcmap-find-in">
        <I.Search size={15} />
        <input ref={inp} value={q} onChange={e => { setQ(e.target.value); setAt(0); }} onKeyDown={key} placeholder="Datacenter, city, state, region" aria-label="Search datacenters" />
        {q && <button type="button" aria-label="Clear search" onClick={() => { setQ(''); inp.current?.focus(); }}><I.X size={14} /></button>}
      </div>
      <div className="dcmap-find-list" role="listbox">
        {hits.map((p, k) => (
          <button key={p.id} type="button" role="option" aria-selected={k === cur} className={k === cur ? 'is-on' : ''} onMouseEnter={() => setAt(k)} onClick={() => onPick(p)}>
            <i className={`dcmap-find-dot is-${p.kind}`} />
            <span className="dcmap-find-txt"><b>{p.id}</b><span>{p.city}{p.place ? ` · ${p.place}` : ''} · {p.tier}</span></span>
            {p.incidents > 0 && <span className="dcmap-find-n">{p.incidents} inc</span>}
          </button>
        ))}
        {!hits.length && <div className="dcmap-find-empty">No datacenter matches “{q}”.</div>}
      </div>
      <div className="dcmap-find-foot">{hits.length} of {pins.length} · ↑↓ to move · Enter to open</div>
    </div>
  );
}

/* a gentle great-circle-like curve between two sites, so parallel links do not overlap sites */
function arc(a: [number, number], z: [number, number]): [number, number][] {
  const mx = (a[0] + z[0]) / 2, my = (a[1] + z[1]) / 2, dx = z[0] - a[0], dy = z[1] - a[1];
  const cx = mx - dy * 0.12, cy = my + dx * 0.12;
  return Array.from({ length: 21 }, (_, i) => { const t = i / 20; const u = 1 - t; return [u * u * a[0] + 2 * u * t * cx + t * t * z[0], u * u * a[1] + 2 * u * t * cy + t * t * z[1]] as [number, number]; });
}

/* site summary, docked inside the map so it is never clipped by the map edge */
function SiteCard({ p, onClose, onNav }: { p: DcPin; onClose: () => void; onNav: (path: string) => void }) {
  const chip = p.kind === 'crit' ? { t: 'error', l: `${sevLabel(p.worstSev)} open` } : p.kind === 'warn' ? { t: 'warning', l: 'Needs attention' } : { t: 'success', l: 'Normal' };
  const cells: [string, string, string, boolean][] = [
    ['Incidents', String(p.incidents), p.breaching ? `${p.breaching} past SLA` : p.incidents ? 'within SLA' : 'none open', p.breaching > 0],
    ['Alarms', String(p.alerts), p.critAlerts ? `${p.critAlerts} critical` : 'none critical', p.critAlerts > 0],
    ['Power', `${p.powerPct}%`, 'of capacity', p.powerPct >= 85],
    ['Cooling', `${p.coolPct}%`, p.facilityIssue ? 'facility issue' : 'of capacity', p.facilityIssue]
  ];
  return (
    <div className="dcpop" role="dialog" aria-label={`${p.id} summary`} onClick={e => e.stopPropagation()}>
      <div className="dcpop-h">
        <div className="dcpop-id"><b>{p.id}</b><span>{p.city} · {p.tier}</span></div>
        <span className={`vw-chip vw-chip--${chip.t} dcpop-chip`}><i className="chip-dot" />{chip.l}</span>
        <button type="button" className="dcpop-x" aria-label="Close" onClick={onClose}><I.X size={15} /></button>
      </div>
      <div className="dcpop-g">{cells.map(([k, v, sub, bad]) => <div key={k}><span>{k}</span><b>{v}</b><small className={bad ? 'bad' : ''}>{sub}</small></div>)}</div>
      <div className="dcpop-a">
        <button type="button" className="nst-btn nst-btn--xs nst-btn--filled" onClick={() => onNav(`/datacenters/${p.id}`)}>Open datacenter</button>
        {p.incidents > 0 && <button type="button" className="nst-btn nst-btn--xs" onClick={() => onNav(`/incidents?dc=${p.id}`)}>Incidents</button>}
        <button type="button" className="nst-btn nst-btn--xs" onClick={() => onNav(`/facilities?dc=${p.id}`)}>Facilities</button>
      </div>
    </div>
  );
}
