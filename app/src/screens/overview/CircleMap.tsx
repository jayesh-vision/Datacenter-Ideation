import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface Bubble { id: string; lat: number; lng: number; r: number; color: string; tip: string; selected?: boolean }

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';

/* Geography of rollout: one bubble per circle, sized by location count. */
export function CircleMap({ bubbles, onPick, height = 470 }: { bubbles: Bubble[]; onPick: (id: string) => void; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const pick = useRef(onPick); pick.current = onPick;
  useEffect(() => {
    if (!el.current || map.current) return;
    const IN: L.LatLngBoundsExpression = [[7.0, 68.0], [34.5, 96.5]];
    const m = L.map(el.current, { zoomSnap: 0.25, attributionControl: true, scrollWheelZoom: false, zoomAnimation: false, fadeAnimation: false }).fitBounds(IN);
    L.tileLayer(`${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, { attribution: '© Esri, HERE', maxZoom: 12 }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    let fitted = false;
    const ro = new ResizeObserver(() => { if (!el.current?.isConnected) return; m.invalidateSize({ animate: false }); if (!fitted && el.current.clientHeight > 100) { fitted = true; m.fitBounds(IN, { animate: false }); } });
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; layer.current = null; };
  }, []);
  useEffect(() => {
    const g = layer.current; if (!g) return;
    g.clearLayers();
    [...bubbles].sort((a, b) => b.r - a.r).forEach(b => {
      const c = L.circleMarker([b.lat, b.lng], { radius: b.r, color: b.selected ? '#0F172A' : '#ffffff', weight: b.selected ? 3 : 1.5, fillColor: b.color, fillOpacity: 0.82 });
      c.bindTooltip(b.tip, { direction: 'top', className: 'map-tip' });
      c.on('click', () => pick.current(b.id));
      c.addTo(g);
    });
  }, [bubbles]);
  return <div className="map" style={{ height }}><div ref={el} style={{ position: 'absolute', inset: 0 }} /></div>;
}
