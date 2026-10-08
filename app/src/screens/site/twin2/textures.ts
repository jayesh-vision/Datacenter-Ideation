/* Procedural textures for the realistic twin (canvas → CanvasTexture), cached.
   Ported from the shared DC-Digital-View prototype; no network assets. */
import * as THREE from 'three';

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;
const CACHE: Record<string, THREE.CanvasTexture> = {};
function make(key: string, w: number, h: number, draw: Draw, { repeat = false, srgb = true }: { repeat?: boolean; srgb?: boolean } = {}) {
  if (CACHE[key]) return CACHE[key];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  CACHE[key] = t;
  return t;
}
const rr = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
/* deterministic speckle (seeded) so textures never change between renders */
const speckle = (g: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number) => {
  let s = 17;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${alpha * rnd()})`;
    g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
  }
};

/* ---------------- floors ---------------- */
/* one 600 mm raised-floor tile (repeat across the room) */
export const tileTex = () => make('tile', 256, 256, (g, w, h) => {
  g.fillStyle = '#ECEFF3'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 900, 0.05);
  g.strokeStyle = '#C9D0D9'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1; g.strokeRect(6, 6, w - 12, h - 12);
}, { repeat: true });
/* perforated airflow tile for cold aisles */
export const perfTex = () => make('perf', 256, 256, (g, w, h) => {
  g.fillStyle = '#DDE3EA'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#9AA6B4';
  for (let y = 18; y < h - 10; y += 11) for (let x = 18; x < w - 10; x += 11) { g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#B7C1CD'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
}, { repeat: true });
/* sealed epoxy floor for plant rooms */
export const epoxyTex = (tone = '#E1E5EA') => make(`epoxy${tone}`, 256, 256, (g, w, h) => {
  g.fillStyle = tone; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 2400, 0.06);
}, { repeat: true });
/* roof membrane */
export const roofTex = () => make('roof', 256, 256, (g, w, h) => {
  g.fillStyle = '#D5DBE2'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 3000, 0.07);
  g.strokeStyle = 'rgba(120,130,145,0.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
}, { repeat: true });

/* ---------------- rack-mounted device bezels ---------------- */
export type BezelKind = 'patch' | 'server' | 'gpu' | 'storage' | 'switch' | 'router' | 'firewall' | 'optical' | 'appliance' | 'tenant';
const BEZEL_H = 34; // px per U
function bezelBase(g: CanvasRenderingContext2D, w: number, h: number, body = '#2A2F35') {
  g.fillStyle = body; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 0, w, 2);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, h - 2, w, 2);
  g.fillStyle = '#9AA3AD'; g.fillRect(0, 0, 16, h); g.fillRect(w - 16, 0, 16, h); // rack ears
  g.fillStyle = '#5E6670';
  [h * 0.3, h * 0.7].forEach(y => { g.beginPath(); g.arc(8, y, 2.5, 0, 7); g.fill(); g.beginPath(); g.arc(w - 8, y, 2.5, 0, 7); g.fill(); });
}
const vents = (g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, step = 6) => {
  g.fillStyle = 'rgba(0,0,0,0.45)';
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) g.fillRect(x, y, 3, 2);
};
export function bezelTex(kind: BezelKind, U: number) {
  const w = 512, h = BEZEL_H * U;
  return make(`bezel-${kind}-${U}`, w, h, g => {
    if (kind === 'patch') {
      bezelBase(g, w, h, '#C9CED6');
      g.fillStyle = '#F7F8FA'; g.fillRect(28, 3, w - 56, 6);
      for (let i = 0; i < 24; i++) { g.fillStyle = '#4A5058'; rr(g, 34 + i * 18.5, 12, 13, h - 18, 2); g.fillStyle = '#7DB4F2'; g.fillRect(36 + i * 18.5, 14, 4, 3); }
      return;
    }
    if (kind === 'server') {
      bezelBase(g, w, h);
      const bays = U >= 2 ? 12 : 8, bw = 22;
      for (let i = 0; i < bays; i++) {
        const x = 26 + i * (bw + 3);
        g.fillStyle = '#3B424B'; rr(g, x, 4, bw, h - 8, 2);
        g.fillStyle = '#23282E'; g.fillRect(x + 3, 7, bw - 6, h - 14);
        g.fillStyle = '#56D364'; g.fillRect(x + bw - 6, 6, 3, 3);
      }
      vents(g, 26 + bays * (bw + 3) + 10, 6, w - 90, h - 6);
      g.fillStyle = '#C5CBD3'; g.fillRect(w - 82, h / 2 - 5, 44, 10);
      g.strokeStyle = '#8B949E'; g.lineWidth = 2; g.beginPath(); g.arc(w - 26, h / 2, 6, 0, 7); g.stroke();
      return;
    }
    if (kind === 'gpu') {
      bezelBase(g, w, h, '#1F2328');
      g.fillStyle = '#2E343B'; rr(g, 26, 6, w - 52, h - 12, 6);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      for (let y = 14; y < h - 12; y += 8) for (let x = 34 + ((y / 8) % 2) * 4; x < w - 40; x += 8) { g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); }
      g.fillStyle = '#76B900'; g.fillRect(w - 120, h - 18, 70, 6);
      return;
    }
    if (kind === 'storage') {
      bezelBase(g, w, h, '#30353C');
      const n = 24, bw = (w - 52) / n;
      for (let i = 0; i < n; i++) {
        const x = 26 + i * bw;
        g.fillStyle = '#454C55'; rr(g, x + 1, 4, bw - 2, h - 8, 2);
        g.fillStyle = '#20252B'; g.fillRect(x + 4, 10, bw - 8, h - 22);
        g.fillStyle = '#56D364'; g.fillRect(x + bw / 2 - 1.5, h - 10, 3, 3);
      }
      return;
    }
    if (kind === 'switch') {
      bezelBase(g, w, h, '#252A30');
      const rows = U >= 2 ? 4 : 2, cols = 24, pw = 12, ph = Math.min(10, (h - 10) / rows - 3);
      for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) {
        const x = 28 + i * 15 + Math.floor(i / 6) * 4, y = 5 + r * (ph + 3);
        g.fillStyle = '#0E1012'; g.fillRect(x, y, pw, ph);
        g.fillStyle = (i + r) % 3 ? '#3FB950' : '#E3B341'; g.fillRect(x + 1, y, 3, 1.6);
      }
      for (let i = 0; i < 4; i++) { g.fillStyle = '#0E1012'; g.fillRect(w - 118 + i * 22, 6, 18, h - 12); }
      return;
    }
    if (kind === 'tenant') {
      /* customer-owned block: a blank louvred panel, nothing to read */
      bezelBase(g, w, h, '#3A414A');
      g.fillStyle = '#2C3239'; rr(g, 26, 6, w - 52, h - 12, 4);
      vents(g, 40, 10, w - 40, h - 10, 7);
      return;
    }
    /* network appliances: router, firewall, optical, appliance */
    const accent = ({ firewall: '#E46B2D', router: '#2F6FB3', optical: '#7A5AD6', appliance: '#6E7781' } as Record<string, string>)[kind] || '#2F6FB3';
    bezelBase(g, w, h, '#24292F');
    g.fillStyle = accent; g.fillRect(24, 4, 6, h - 8);
    g.fillStyle = '#1A1E22'; rr(g, 38, 6, 120, h - 12, 3);
    g.fillStyle = '#5FB0FF'; g.fillRect(46, h / 2 - 3, 50, 2); g.fillRect(46, h / 2 + 3, 34, 2);
    const ports = kind === 'optical' ? 10 : 8;
    for (let i = 0; i < ports; i++) {
      const x = 180 + i * 26;
      g.fillStyle = kind === 'optical' ? '#3B3350' : '#0E1012'; g.fillRect(x, 8, 20, h - 16);
      g.fillStyle = '#3FB950'; g.fillRect(x + 2, 9, 4, 2);
    }
    vents(g, 400, 8, w - 26, h - 8, 7);
  });
}

/* ---------------- facility cabinet fronts ---------------- */
export type FrontKind = 'crah' | 'ups' | 'battery' | 'gen' | 'panel' | 'dark';
export function frontTex(kind: FrontKind) {
  return make(`front-${kind}`, 512, 512, (g, w, h) => {
    const white = '#EEF1F4';
    if (kind === 'crah') {
      g.fillStyle = white; g.fillRect(0, 0, w, h);
      g.fillStyle = '#D5DBE2'; g.fillRect(28, 60, w - 56, h * 0.62);
      g.fillStyle = '#AEB7C2'; for (let y = 70; y < 60 + h * 0.62 - 8; y += 12) g.fillRect(34, y, w - 68, 5);
      g.fillStyle = '#1D2B3A'; rr(g, w - 170, 14, 140, 38, 4);
      g.fillStyle = '#4FD1C5'; g.fillRect(w - 158, 24, 70, 5); g.fillRect(w - 158, 34, 44, 5);
      g.fillStyle = '#C5CCD5'; g.fillRect(0, h - 70, w, 3);
      return;
    }
    if (kind === 'ups') {
      g.fillStyle = white; g.fillRect(0, 0, w, h);
      g.fillStyle = '#D9DEE5'; g.fillRect(w / 2 - 2, 0, 4, h);
      g.fillStyle = '#15202C'; rr(g, 40, 40, 150, 100, 8);
      g.fillStyle = '#3FB950'; g.fillRect(56, 60, 60, 8); g.fillStyle = '#58A6FF'; g.fillRect(56, 80, 100, 6); g.fillRect(56, 94, 80, 6); g.fillRect(56, 108, 110, 6);
      vents(g, 30, h - 140, w - 30, h - 40, 9);
      g.fillStyle = '#9AA3AD'; g.fillRect(w / 2 - 20, h / 2 - 40, 8, 80); g.fillRect(w / 2 + 12, h / 2 - 40, 8, 80);
      return;
    }
    if (kind === 'battery') {
      g.fillStyle = '#3A3F46'; g.fillRect(0, 0, w, h);
      for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) {
        const x = 24 + c * 78, y = 30 + r * 92;
        g.fillStyle = '#23272C'; rr(g, x, y, 68, 80, 4);
        g.fillStyle = '#CF222E'; g.fillRect(x + 10, y + 6, 10, 6); g.fillStyle = '#111'; g.fillRect(x + 48, y + 6, 10, 6);
      }
      return;
    }
    if (kind === 'gen') {
      g.fillStyle = '#E3E7EC'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#C3CAD3'; for (let x = 30; x < w - 30; x += 16) g.fillRect(x, 40, 8, h - 120);
      g.fillStyle = '#F2C230'; g.fillRect(0, h - 40, w, 14);
      g.fillStyle = '#2B323A'; g.fillRect(0, h - 26, w, 26);
      return;
    }
    /* electrical panels (rectifier, distribution) and dark IT cabinets */
    const dark = kind === 'dark';
    g.fillStyle = dark ? '#2A2F35' : '#E2E6EB'; g.fillRect(0, 0, w, h);
    g.fillStyle = dark ? '#1C2025' : '#C6CDD6';
    for (let x = w / 3; x < w - 10; x += w / 3) g.fillRect(x - 2, 0, 4, h);
    g.fillStyle = dark ? '#5E6670' : '#7E8894';
    for (let i = 0; i < 3; i++) g.fillRect(i * (w / 3) + w / 3 - 26, h / 2 - 30, 8, 60);
    g.fillStyle = '#15202C'; rr(g, 30, 30, 120, 60, 5);
    g.fillStyle = '#3FB950'; g.fillRect(42, 46, 40, 6); g.fillStyle = '#58A6FF'; g.fillRect(42, 60, 80, 5); g.fillRect(42, 70, 60, 5);
    if (!dark) { g.fillStyle = '#F2C230'; g.beginPath(); g.moveTo(w - 70, 40); g.lineTo(w - 40, 90); g.lineTo(w - 100, 90); g.closePath(); g.fill(); }
  });
}

/* ---------------- rack cabinet surfaces ---------------- */
/* perforated door, used as an alpha map (white = steel, black = hole); ~45 % open area */
export const doorAlphaTex = () => make('door-alpha', 256, 768, (g, w, h) => {
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#000000';
  const r = 3.4, dx = 9, dy = 7.8;
  for (let row = 0, y = 26; y < h - 26; row++, y += dy) {
    for (let x = 22 + (row % 2) * (dx / 2); x < w - 22; x += dx) {
      g.beginPath();
      for (let k = 0; k < 6; k++) { const a = (Math.PI / 3) * k + Math.PI / 6; g.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)); }
      g.closePath(); g.fill();
    }
  }
}, { srgb: false });
export const rackSideTex = () => make('rack-side', 256, 512, (g, w, h) => {
  g.fillStyle = '#20252B'; g.fillRect(0, 0, w, h);
  let s = 5; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let x = 0; x < w; x += 2) { g.fillStyle = `rgba(255,255,255,${0.012 + rnd() * 0.02})`; g.fillRect(x, 0, 1, h); }
  g.fillStyle = '#14181C'; g.fillRect(w / 2 - 1, 8, 2, h - 16);
  g.strokeStyle = '#2E353D'; g.lineWidth = 3; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = '#0E1114';
  [36, h - 70].forEach(y0 => { for (let y = y0; y < y0 + 34; y += 7) for (let x = 30; x < w - 30; x += 22) g.fillRect(x, y, 16, 3); });
  g.fillStyle = '#6B737D'; g.fillRect(w * 0.25 - 10, h / 2 - 3, 20, 6); g.fillRect(w * 0.75 - 10, h / 2 - 3, 20, 6);
});
export const rackTopTex = () => make('rack-top', 256, 512, (g, w, h) => {
  g.fillStyle = '#23292F'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#121519'; g.fillRect(28, 40, w - 56, 70); g.fillRect(28, h - 110, w - 56, 70);
  g.strokeStyle = '#3A424B'; g.lineWidth = 1;
  for (let x = 30; x < w - 28; x += 3) { g.beginPath(); g.moveTo(x, 42); g.lineTo(x + 2, 108); g.stroke(); g.beginPath(); g.moveTo(x, h - 108); g.lineTo(x + 2, h - 42); g.stroke(); }
  g.fillStyle = '#0E1114'; for (let y = 150; y < h - 150; y += 10) g.fillRect(50, y, w - 100, 4);
});
/* engraved rack ID plate (font shrinks to fit longer names) */
export const rackLabelTex = (text: string) => make(`rack-label-${text}`, 192, 40, (g, w, h) => {
  g.fillStyle = '#E9EDF2'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#9AA5B2'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
  g.fillStyle = '#1B2430';
  const px = Math.max(12, Math.min(24, Math.floor((w - 16) / Math.max(1, text.length) * 1.7)));
  g.font = `bold ${px}px Inter, "IBM Plex Mono", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 1);
});
