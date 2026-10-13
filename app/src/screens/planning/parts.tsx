/* Small presentational parts shared by the planner screens. */
import type { ReactNode } from 'react';
import { Bar } from '../../ui/kit';

/** readiness / share in a grid cell: a short bar and the percentage */
export const SoftMeterCell = ({ pct, color }: { pct: number; color?: string }) => (
  <span className="pn-bar" style={{ width: 120 }}><Bar value={pct} color={color ?? (pct >= 80 ? 'var(--vw-color-emerald-500)' : pct >= 50 ? 'var(--vw-color-amber-500)' : 'var(--vw-color-red-500)')} /><span className="num" style={{ fontSize: 12.5, width: 36, textAlign: 'right' }}>{Math.round(pct)}%</span></span>
);

/** two-column key / value list inside a panel */
export function KvList({ items, one }: { items: [ReactNode, ReactNode][]; one?: boolean }) {
  return <div className={`pn-kv${one ? ' is-one' : ''}`}>{items.map(([k, v], i) => <div key={i}><span>{k}</span><span>{v}</span></div>)}</div>;
}

/** section heading inside a step or tab */
export const Sub = ({ children, extra }: { children: ReactNode; extra?: ReactNode }) => <div className="pn-sub"><span>{children}</span>{extra}</div>;
