import type { ReactNode } from 'react';

/* Analytics strip used at the top of the list screens (Datacenters, Alerts,
   Incidents, Changes): one card of tiles, each tile = label · headline number
   with a short qualifier · a soft proportion bar or meter · pill legend / facts.
   Colours are the NST grid-pill palette: pills for legends, 200–300 shades for bars. */

export type Tone = 'error' | 'orange' | 'warning' | 'success' | 'neutral' | 'info' | 'purple' | 'cyan';
export const SOFT: Record<Tone, string> = {
  error: 'var(--vw-color-red-300)', orange: 'var(--vw-color-orange-300)', warning: 'var(--vw-color-amber-200)', success: 'var(--vw-color-emerald-200)',
  neutral: 'var(--vw-color-slate-200)', info: 'var(--vw-color-blue-300)', purple: 'var(--vw-color-purple-200, #e9d5ff)', cyan: 'var(--vw-color-cyan-200, #a5f3fc)'
};

export function StatGrid({ children, cols = 6 }: { children: ReactNode; cols?: number }) {
  return <section className={`vw-card-section dco-card dco-cols-${cols}`}>{children}</section>;
}

export function StatTile({ label, value, sub, subTone, children, onClick, active }: { label: ReactNode; value: ReactNode; sub?: ReactNode; subTone?: 'bad' | 'warn'; children?: ReactNode; onClick?: () => void; active?: boolean }) {
  const body = (
    <>
      <span className="dco-l">{label}</span>
      <span className="dco-v">{value}</span>
      <span className={`dco-sub ${subTone ?? ''}`} title={typeof sub === 'string' ? sub : undefined}>{sub ?? '\u00a0'}</span>
      <div className="dco-detail">{children}</div>
    </>
  );
  return onClick
    ? <button type="button" className={`dco-tile is-click${active ? ' is-active' : ''}`} onClick={onClick} aria-pressed={active}>{body}</button>
    : <div className="dco-tile">{body}</div>;
}

export interface Part { key: string; label: string; n: number; tone: Tone }
/* proportion bar + pill legend; legend pills can act as filters */
export function Split({ parts, onPick, active, legend = true }: { parts: Part[]; onPick?: (k: string) => void; active?: string; legend?: boolean }) {
  const total = parts.reduce((a, p) => a + p.n, 0) || 1;
  return (
    <div className="dco-split">
      <div className="dco-bar">{parts.filter(p => p.n).map(p => <i key={p.key} style={{ width: `${(p.n / total) * 100}%`, background: SOFT[p.tone] }} title={`${p.label}: ${p.n}`} />)}</div>
      {legend && <div className="dco-legend">{parts.map(p => (
        <span key={p.key} role={onPick ? 'button' : undefined} tabIndex={onPick ? 0 : undefined} className={`vw-chip vw-chip--${p.tone} dco-pill${onPick ? ' is-click' : ''}${active === p.key ? ' is-active' : ''}`}
          onClick={e => { if (!onPick) return; e.stopPropagation(); onPick(p.key); }} onKeyDown={e => { if (onPick && e.key === 'Enter') onPick(p.key); }}>
          <i className="chip-dot" />{p.label}<b>{p.n}</b>
        </span>
      ))}</div>}
    </div>
  );
}

export function SoftMeter({ pct, tone = 'info' }: { pct: number; tone?: Tone }) {
  return <span className="dco-meter"><i style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: SOFT[tone] }} /></span>;
}

export function Facts({ items }: { items: { n: ReactNode; label: string; tone?: 'bad' | 'warn'; onClick?: () => void }[] }) {
  return (
    <div className="dco-facts">
      {items.map(x => x.onClick
        ? <span key={x.label} role="button" tabIndex={0} className={`is-click ${x.tone ? `is-${x.tone}` : ''}`} onClick={e => { e.stopPropagation(); x.onClick!(); }}><b>{x.n}</b> {x.label}</span>
        : <span key={x.label} className={x.tone ? `is-${x.tone}` : ''}><b>{x.n}</b> {x.label}</span>)}
    </div>
  );
}

/* small column chart (e.g. alarms raised per hour, windows per day) */
export function MiniBars({ values, labels, tone = 'info', hot }: { values: number[]; labels?: string[]; tone?: Tone; hot?: number }) {
  const max = Math.max(1, ...values);
  return (
    <div className="dco-bars">
      {values.map((v, i) => <span key={i} title={`${labels?.[i] ?? ''}${labels ? ': ' : ''}${v}`}><i style={{ height: `${Math.max(v ? 8 : 2, (v / max) * 100)}%`, background: hot !== undefined && i === hot ? SOFT.orange : SOFT[tone] }} /></span>)}
      {labels && <div className="dco-bars-x"><span>{labels[0]}</span><span>{labels[labels.length - 1]}</span></div>}
    </div>
  );
}

/* ranked list with inline bars (e.g. top datacenters by alarms) */
export function RankList({ items }: { items: { key: string; label: string; n: number; tone?: Tone; onClick?: () => void }[] }) {
  const max = Math.max(1, ...items.map(i => i.n));
  return (
    <div className="dco-rank">
      {items.map(i => (
        <span key={i.key} role={i.onClick ? 'button' : undefined} className={i.onClick ? 'is-click' : ''} onClick={e => { if (!i.onClick) return; e.stopPropagation(); i.onClick(); }}>
          <em>{i.label}</em><span className="dco-rank-bar"><i style={{ width: `${(i.n / max) * 100}%`, background: SOFT[i.tone ?? 'info'] }} /></span><b>{i.n}</b>
        </span>
      ))}
    </div>
  );
}
