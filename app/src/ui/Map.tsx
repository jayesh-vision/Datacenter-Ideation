import { useEffect, useRef, useState, type ReactNode } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Layers, Maximize2 } from 'lucide-react';
import type { LatLng } from '../lib/geo';

export interface MapPin { id: string; lat: number; lng: number; color: string; hot?: boolean; selected?: boolean; tip?: string; onClick?: () => void; kind?: 'job' | 'obs' | 'dot'; glyph?: string }
export interface MapEng { id: string; lat: number; lng: number; initials: string; hue: number; status: string; selected?: boolean; tip?: string; onClick?: () => void; dim?: boolean }
export interface MapPoly { id: string; points: LatLng[]; color: string; label?: string; fill?: number; dashed?: boolean; onClick?: () => void }
export interface MapLine { id: string; points: LatLng[]; color: string; weight?: number; dashed?: boolean; opacity?: number }
export interface MapSos { id: string; lat: number; lng: number; tip?: string; onClick?: () => void }

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const TILES = {
  street: { url: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`, attr: '© Esri, HERE, OpenStreetMap' },
  light: { url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, attr: '© Esri, HERE, OpenStreetMap', labels: `${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}` },
  satellite: { url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, attr: '© Esri, Maxar', labels: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}` }
} as Record<string, { url: string; attr: string; labels?: string }>;

export function MapView({ pins = [], engineers = [], polys = [], lines = [], sos = [], fit, height = '100%', tiles = 'light', legend, children, onMapClick, fitKey, minZoom = 10 }: {
  pins?: MapPin[]; engineers?: MapEng[]; polys?: MapPoly[]; lines?: MapLine[]; sos?: MapSos[];
  fit?: LatLng[]; height?: number | string; tiles?: 'street' | 'light' | 'satellite'; legend?: ReactNode; children?: ReactNode;
  onMapClick?: (p: LatLng) => void; fitKey?: string; minZoom?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const tileLayer = useRef<L.LayerGroup | null>(null);
  const [base, setBase] = useState<string>(tiles);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, zoomControl: true, attributionControl: true, minZoom, preferCanvas: false, zoomSnap: 0.25 }).setView([22.72, 75.87], 12);
    m.zoomControl.setPosition('topright');
    layer.current = L.layerGroup().addTo(m);
    m.on('click', e => clickRef.current?.([e.latlng.lat, e.latlng.lng]));
    map.current = m;
    const ro = new ResizeObserver(() => { if (map.current === m && el.current?.isConnected) m.invalidateSize({ animate: false }); });
    ro.observe(el.current);
    return () => { ro.disconnect(); map.current = null; layer.current = null; tileLayer.current = null; m.off(); m.remove(); };
  }, [minZoom]);

  useEffect(() => {
    const m = map.current; if (!m) return;
    tileLayer.current?.remove();
    const t = TILES[base];
    const grp = L.layerGroup([L.tileLayer(t.url, { attribution: t.attr, maxZoom: 19 })]);
    if (t.labels) grp.addLayer(L.tileLayer(t.labels, { maxZoom: 19, pane: 'overlayPane', opacity: 0.9 }));
    tileLayer.current = grp.addTo(m);
  }, [base]);

  useEffect(() => {
    const g = layer.current; if (!g) return;
    g.clearLayers();
    polys.forEach(p => {
      const poly = L.polygon(p.points, { color: p.color, weight: 1.5, fillOpacity: p.fill ?? 0.06, dashArray: p.dashed ? '5 5' : undefined });
      if (p.label) poly.bindTooltip(p.label, { permanent: false, direction: 'center', className: 'map-tip' });
      if (p.onClick) poly.on('click', p.onClick);
      poly.addTo(g);
    });
    lines.forEach(l => L.polyline(l.points, { color: l.color, weight: l.weight ?? 4, opacity: l.opacity ?? 0.9, dashArray: l.dashed ? '6 7' : undefined, lineCap: 'round', lineJoin: 'round' }).addTo(g));
    pins.forEach(p => {
      const html = p.kind === 'obs'
        ? `<div class="mk-obs" style="background:${p.color}">${p.glyph ?? '!'}</div>`
        : p.kind === 'dot'
          ? `<div style="width:12px;height:12px;border-radius:50%;background:${p.color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>`
          : `<div class="mk-job${p.hot ? ' is-hot' : ''}${p.selected ? ' is-sel' : ''}" style="background:${p.color}"><i></i></div>`;
      const size: [number, number] = p.kind === 'obs' ? [22, 22] : p.kind === 'dot' ? [12, 12] : [22, 22];
      const mk = L.marker([p.lat, p.lng], { icon: L.divIcon({ html, className: '', iconSize: size, iconAnchor: p.kind === 'job' || !p.kind ? [4, 22] : [size[0] / 2, size[1] / 2] }), zIndexOffset: p.selected ? 900 : p.hot ? 400 : 0 });
      if (p.tip) mk.bindTooltip(p.tip, { direction: 'top', offset: [8, -24], className: 'map-tip' });
      if (p.onClick) mk.on('click', p.onClick);
      mk.addTo(g);
    });
    engineers.forEach(e => {
      const html = `<div class="mk-eng${e.selected ? ' is-sel' : ''}" style="background:hsl(${e.hue} 55% 46%);--st:${e.status};opacity:${e.dim ? 0.45 : 1}">${e.initials}</div>`;
      const mk = L.marker([e.lat, e.lng], { icon: L.divIcon({ html, className: '', iconSize: [32, 32], iconAnchor: [16, 16] }), zIndexOffset: e.selected ? 1000 : 600 });
      if (e.tip) mk.bindTooltip(e.tip, { direction: 'top', offset: [0, -16], className: 'map-tip' });
      if (e.onClick) mk.on('click', e.onClick);
      mk.addTo(g);
    });
    sos.forEach(s => {
      const mk = L.marker([s.lat, s.lng], { icon: L.divIcon({ html: '<div class="mk-sos">SOS</div>', className: '', iconSize: [40, 40], iconAnchor: [20, 20] }), zIndexOffset: 2000 });
      if (s.tip) mk.bindTooltip(s.tip, { direction: 'top', offset: [0, -20], className: 'map-tip' });
      if (s.onClick) mk.on('click', s.onClick);
      mk.addTo(g);
    });
  }, [pins, engineers, polys, lines, sos]);

  const doFit = () => {
    const m = map.current; if (!m) return;
    const pts = fit ?? [...pins.map(p => [p.lat, p.lng] as LatLng), ...engineers.map(e => [e.lat, e.lng] as LatLng)];
    if (!el.current?.isConnected) return;
    if (pts.length === 1) m.setView(pts[0], 15, { animate: false });
    else if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 16, animate: false });
  };
  useEffect(() => { const t = setTimeout(doFit, 30); return () => clearTimeout(t); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fitKey ?? JSON.stringify(fit ?? null)]);

  return (
    <div className="map" style={{ height }}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      <div className="map-overlay" style={{ top: 12, left: 12, display: 'flex', gap: 6 }}>
        <button type="button" className="nst-icon-btn" style={{ background: '#fff' }} title={base === 'satellite' ? 'Street map' : 'Satellite'} onClick={() => setBase(b => (b === 'satellite' ? tiles : 'satellite'))}><Layers size={15} /></button>
        <button type="button" className="nst-icon-btn" style={{ background: '#fff' }} title="Fit to view" onClick={doFit}><Maximize2 size={15} /></button>
      </div>
      {legend && <div className="map-legend">{legend}</div>}
      {children}
    </div>
  );
}
