import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/* Categorical order validated for adjacent-pair CVD separation against the
   light surface; lines with 3+ series also carry direct end labels because
   blue and violet fall below the all-pairs floor. Status colors are separate
   and always paired with a label. */
export const SERIES = ['#1C81EF', '#0d9488', '#7c3aed', '#db2777', '#0891b2'];

export const STATUS = {
  good: 'var(--vw-color-green-600)',
  warning: 'var(--vw-color-amber-500)',
  serious: 'var(--vw-color-orange-500)',
  critical: 'var(--vw-color-red-600)',
  neutral: 'var(--vw-color-slate-300)'
} as const;

export const INK = {
  axis: '#9CA3AF',
  grid: '#F1F3F6',
  baseline: '#E5E7EB',
  label: '#6B7280',
  strong: '#1F2937',
  plan: '#9CA3AF'
};

/* SVG text carries its styling as attributes, not only CSS classes, so it looks
   identical on screen and in an exported PDF (image capture drops class styles
   inside SVG). */
const NUM_FONT = 'Inter, system-ui, -apple-system, sans-serif';
export const AXIS_TEXT = { fontSize: 11, fill: '#94A3B8', fontFamily: NUM_FONT } as const;
export const AXIS_TEXT_CURRENT = { ...AXIS_TEXT, fill: '#334155', fontWeight: 500 } as const;
export const TARGET_TEXT = { ...AXIS_TEXT, fill: '#64748B', fontWeight: 500, stroke: '#ffffff', strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round' } as const;
export const DONUT_VALUE = { fontSize: 24, fontWeight: 600, fill: '#0F172A', fontFamily: NUM_FONT } as const;
export const DONUT_LABEL = { fontSize: 12, fill: '#64748B', fontFamily: 'Poppins, system-ui, sans-serif' } as const;

export function useWidth<T extends HTMLElement>() {
  const [ref, size] = useSize<T>();
  return [ref, size.width] as const;
}

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => { const r = el.getBoundingClientRect(); setSize(s => (s.width === r.width && s.height === r.height ? s : { width: r.width, height: r.height })); };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export function niceTicks(max: number, count = 4, min = 0): number[] {
  const span = Math.max(1e-9, max - min);
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  /* no 2.5 steps: on integer counts they render as rounded, misleading ticks */
  const step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export interface TipRow { color?: string; label: string; value: string; dashed?: boolean }
export interface TipState { x: number; y: number; title: string; rows: TipRow[] }

export function Tooltip({ tip, width }: { tip: TipState | null; width: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max(8, tip.x + 14), Math.max(8, width - 220));
  return (
    <div className="ch-tip" style={{ left, top: Math.max(0, tip.y - 12) }} role="status">
      <div className="ch-tip-title">{tip.title}</div>
      {tip.rows.map((r, i) => (
        <div key={i} className="ch-tip-row">
          {r.color && <i className={r.dashed ? 'is-dashed' : ''} style={{ background: r.dashed ? 'transparent' : r.color, borderColor: r.color }} />}
          <span>{r.label}</span><b>{r.value}</b>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean; shape?: 'line' | 'box' }[] }) {
  return (
    <div className="ch-legend">
      {items.map(it => (
        <span key={it.label}>
          <i className={`${it.shape === 'line' ? 'is-line' : ''} ${it.dashed ? 'is-dashed' : ''}`} style={{ background: it.dashed ? 'transparent' : it.color, borderColor: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* The frame takes at least `height`, and grows with its card when the card is
   stretched to match a taller neighbour in the same row. The svg is absolutely
   positioned so its own height never feeds back into the frame's size. */
export function ChartFrame({ height, children, width, frameRef }: { height: number; width: number; children: ReactNode; frameRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={frameRef} className="ch-frame" style={{ minHeight: height }}>
      {width > 0 && children}
    </div>
  );
}
