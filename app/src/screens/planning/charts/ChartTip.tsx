/* Floating chart tooltip for the planner charts and drawings: the app's white chart card (.ch-tip look), rendered in a portal at
   the pointer so panels, scroll boxes and sheet frames never clip it; flips left / up near the viewport edge. Plus the small
   presentational bits the charts share (legend, empty state). */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { TipState } from './chartKit';
import '../../../styles/planning-charts.css';

export function ChartTip({ tip }: { tip: TipState | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 220, h: 80 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    if (Math.abs(r.width - size.w) > 1 || Math.abs(r.height - size.h) > 1) setSize({ w: r.width, h: r.height });
  });
  if (!tip || typeof document === 'undefined') return null;
  const vw = window.innerWidth, vh = window.innerHeight, gap = 14;
  const left = tip.x + gap + size.w > vw - 8 ? Math.max(8, tip.x - gap - size.w) : tip.x + gap;
  const top = Math.min(Math.max(8, tip.y - 14), Math.max(8, vh - size.h - 8));
  return createPortal(
    <div ref={ref} className="ch-tip pc-tip" style={{ left, top }} role="status">
      <div className="ch-tip-title">{tip.title}</div>
      {tip.rows.map(([label, value, color, dashed], i) => (
        <div key={i} className="ch-tip-row">
          {color && <i className={dashed ? 'is-dashed' : ''} style={{ background: dashed ? 'transparent' : color, borderColor: color }} />}
          <span>{label}</span><b>{value}</b>
        </div>
      ))}
      {tip.note && <div className="pc-tip-note">{tip.note}</div>}
    </div>,
    document.body,
  );
}

export type LegendKind = 'swatch' | 'line' | 'dash' | 'diamond' | 'hatch' | 'dot';
export interface LegendItem { label: string; color: string; kind?: LegendKind }
/** Legend strip under a chart (same look as the drawing sheets' legend). */
export function ChartLegend({ items, children }: { items: LegendItem[]; children?: ReactNode }) {
  return (
    <div className="pc-legend">
      {items.map(it => <span key={it.label}><i className={`is-${it.kind ?? 'swatch'}`} style={it.kind === 'line' || it.kind === 'dash' ? { borderTopColor: it.color } : it.kind === 'hatch' ? { color: it.color, borderColor: it.color } : { background: it.color }} />{it.label}</span>)}
      {children}
    </div>
  );
}

/** Empty state inside a chart's footprint. */
export const ChartEmpty = ({ title, hint }: { title: string; hint?: string }) => <div className="pc-empty"><b>{title}</b>{hint && <span>{hint}</span>}</div>;
