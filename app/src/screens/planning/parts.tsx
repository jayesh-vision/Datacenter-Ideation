/* Small presentational parts shared by the planner screens. */
import type { ComponentType, ReactNode } from 'react';
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

/** a titled section card inside a wizard step: icon tile, title, one-line help, optional actions on the right */
export function Sec({ icon: Ico, title, sub, extra, children, className = '', tone }: { icon?: ComponentType<{ size?: number }>; title: ReactNode; sub?: ReactNode; extra?: ReactNode; children?: ReactNode; className?: string; tone?: 'info' | 'warn' | 'bad' | 'ok' }) {
  return (
    <section className={`pn-sec ${className}`}>
      <header className="pn-sec-head">
        {Ico && <span className={`pn-sec-ico${tone ? ` is-${tone}` : ''}`}><Ico size={16} /></span>}
        <div className="pn-sec-title"><h3>{title}</h3>{sub && <p>{sub}</p>}</div>
        {extra && <div className="pn-sec-extra">{extra}</div>}
      </header>
      {children !== undefined && children !== null && children !== false && <div className="pn-sec-body">{children}</div>}
    </section>
  );
}

/** the figures the planner works out, as a row of quiet tiles (label over a large number) */
export function Figs({ items, cols }: { items: [ReactNode, ReactNode][]; cols?: number }) {
  return <div className="pn-figs" style={cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}>{items.map(([k, v], i) => <div key={i} className="pn-fig"><span>{k}</span><b>{v}</b></div>)}</div>;
}
