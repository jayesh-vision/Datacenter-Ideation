/* Shared, non-component helpers for the planner charts and drawings: NST colour tokens, a measured-width hook, the floating
   tooltip hook, axis ticks and short money for axes. Components live in ChartTip.tsx so fast refresh stays happy. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { fmtMoney } from '../../../lib/format';
import { fromUsd } from '../common';

/** Colour tokens every planner chart and drawing uses (NST variables only). */
export const C = {
  ink: 'var(--vw-color-slate-900)', slate: 'var(--vw-color-slate-500)', slateLight: 'var(--vw-color-slate-300)', slateDark: 'var(--vw-color-slate-700)', grid: 'var(--vw-color-slate-200)',
  faint: 'var(--vw-color-slate-100)', wash: 'var(--vw-color-slate-50)',
  surface: 'var(--vw-color-white)', blue: 'var(--vw-color-blue-500)', blueDark: 'var(--vw-color-blue-600)', blueLight: 'var(--vw-color-blue-200)', sky: 'var(--vw-color-sky-400)', skyLight: 'var(--vw-color-sky-200)',
  indigo: 'var(--vw-color-indigo-400)', violet: 'var(--vw-color-violet-500)', cyan: 'var(--vw-color-cyan-600)', teal: 'var(--vw-color-teal-500)',
  emerald: 'var(--vw-color-emerald-500)', emeraldDark: 'var(--vw-color-emerald-600)', amber: 'var(--vw-color-amber-500)', amberDark: 'var(--vw-color-amber-600)', red: 'var(--vw-color-red-500)', rose: 'var(--vw-color-rose-500)',
};
/** Categorical order for stacked bars and donuts: a calm blue / teal / violet family, greys last (red and amber stay for faults). */
export const SERIES = [C.blueDark, C.sky, C.indigo, C.teal, C.violet, C.cyan, 'var(--vw-color-slate-400)', C.skyLight];

/** A fixed drawing width (the review pack renders every sheet off-screen at one size); unset = measure the wrapper. */
export const DrawWidth = createContext<number | undefined>(undefined);
/** Width of a wrapper div, kept current with a ResizeObserver (starts at `initial` until measured), or the fixed `DrawWidth`. */
export function useWidth(initial = 640): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const fixed = useContext(DrawWidth);
  const [w, setW] = useState(fixed ?? initial);
  useEffect(() => {
    const el = ref.current; if (!el || fixed) return;
    const first = Math.round(el.getBoundingClientRect().width); if (first > 0) setW(first);
    const ro = new ResizeObserver(e => { const n = Math.round(e[0].contentRect.width); if (n > 0) setW(p => (Math.abs(p - n) > 1 ? n : p)); });
    ro.observe(el); return () => ro.disconnect();
  }, [fixed]);
  return [ref, fixed ?? w];
}

/** One tooltip row: label, value and an optional colour key (a dashed key for lines). */
export type TipRow = [label: string, value: ReactNode, color?: string, dashed?: boolean];
export interface TipContent { title: ReactNode; rows: TipRow[]; note?: ReactNode }
export interface TipState extends TipContent { x: number; y: number }

/** Floating tooltip driven by pointer events (viewport coordinates; ChartTip renders it in a portal so nothing clips it). */
export function useTip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const show = useCallback((e: { clientX: number; clientY: number }, content: TipContent) => setTip({ x: e.clientX, y: e.clientY, ...content }), []);
  const hide = useCallback(() => setTip(null), []);
  useEffect(() => {
    if (!tip) return;
    const off = () => setTip(null);
    window.addEventListener('scroll', off, true); window.addEventListener('blur', off);
    return () => { window.removeEventListener('scroll', off, true); window.removeEventListener('blur', off); };
  }, [tip]);
  /** Spread on an SVG element: shows `content` while the pointer is over it. */
  const on = useCallback((content: TipContent) => ({ onMouseMove: (e: React.MouseEvent) => show(e, content), onMouseLeave: hide }), [show, hide]);
  return { tip, show, hide, on };
}

/** "Nice" axis ticks between lo and hi (about n of them), always including 0 when the range spans it. */
export function niceTicks(lo: number, hi: number, n = 5): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0];
  if (hi === lo) { hi = lo + (Math.abs(lo) || 1); }
  const raw = (hi - lo) / Math.max(1, n), mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : +v.toPrecision(12));
  return out;
}

/** Ticks for a padded domain [lo, hi]: the nice ticks that fall inside it, so the plot does not waste a whole empty step. */
export function fitTicks(lo: number, hi: number, n = 5): { ticks: number[]; d0: number; d1: number } {
  const all = niceTicks(lo, hi, n); const step = all.length > 1 ? all[1] - all[0] : 1;
  const d0 = lo < 0 ? Math.min(lo * 1.06, -step * 0.2) : 0, d1 = hi > 0 ? Math.max(hi * 1.08, step * 0.2) : 0;
  const ticks = all.filter(t => t >= d0 - 1e-9 && t <= d1 + 1e-9);
  return { ticks, d0: Math.min(d0, ...ticks), d1: Math.max(d1, ...ticks, d0 + step * 0.5) };
}

/** Short money for axis labels in the geography's units ($12M, ₹4.5 Cr). Tooltips and text use money(). */
export const moneyAxis = (usd: number) => (usd === 0 ? '0' : fmtMoney(fromUsd(usd), 1).replace(/\.0(?=[^0-9]|$)/, ''));

/** Trim a label to about n characters with an ellipsis. */
export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1)).trimEnd()}…` : s);
/** Rough width of a label at a font size (Poppins / Inter average glyph). */
export const textW = (s: string, fs = 10) => s.length * fs * 0.58;
/** Weeks between two instants (rounded, never negative). */
export const weeksBetween = (a: number, b: number) => Math.max(0, Math.round((b - a) / (7 * 864e5)));

/** SVG path of a donut slice from angle a0 to a1 (radians, 0 = 12 o'clock). */
export function arcPath(r0: number, r1: number, a0: number, a1: number): string {
  const sweep = a1 - a0;
  if (sweep >= Math.PI * 2 - 1e-6) { const m = a0 + Math.PI; return `${arcPath(r0, r1, a0, m)} ${arcPath(r0, r1, m, a1)}`; }
  const p = (r: number, a: number) => `${(r * Math.sin(a)).toFixed(2)},${(-r * Math.cos(a)).toFixed(2)}`;
  const large = sweep > Math.PI ? 1 : 0;
  return `M${p(r1, a0)} A${r1},${r1} 0 ${large} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
}
