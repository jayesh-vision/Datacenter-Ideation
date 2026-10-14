import type { ReactNode } from 'react';
import { Info } from './kit';

/* Analytics strip used at the top of the list screens (Datacenters, Alerts,
   Incidents, Changes): one card of tiles, each tile = label · headline number
   with a short qualifier · a soft proportion bar or meter · pill legend / facts.
   Colours are the NST grid-pill palette: pills for legends, 200–300 shades for bars. */

export type Tone = 'error' | 'orange' | 'warning' | 'success' | 'neutral' | 'info' | 'purple' | 'cyan';
export const SOFT: Record<Tone, string> = {
  error: 'var(--vw-color-red-300)', orange: 'var(--vw-color-orange-300)', warning: 'var(--vw-color-amber-200)', success: 'var(--vw-color-emerald-200)',
  neutral: 'var(--vw-color-slate-200)', info: 'var(--vw-color-blue-300)', purple: 'var(--vw-color-purple-200, #e9d5ff)', cyan: 'var(--vw-color-cyan-200, #a5f3fc)'
};

/* `fit`: tiles size to their content instead of the fixed detail box (use when every tile carries the same number of rows) */
export function StatGrid({ children, cols = 6, fit }: { children: ReactNode; cols?: number; fit?: boolean }) {
  return <section className={`vw-card-section dco-card dco-cols-${cols}${fit ? ' is-fit' : ''}`}>{children}</section>;
}

export function StatTile({ label, value, sub, subTone, children, onClick, active, info }: { label: ReactNode; value: ReactNode; sub?: ReactNode; subTone?: 'bad' | 'warn'; children?: ReactNode; onClick?: () => void; active?: boolean; info?: string }) {
  const body = (
    <>
      <span className="dco-l">{label}{info && <Info text={info} />}</span>
      <span className="dco-v"><span className="dco-num">{value}</span>{sub !== undefined && <span className={`dco-sub ${subTone ?? ''}`} title={typeof sub === 'string' ? sub : undefined}>{sub}</span>}</span>
      <div className="dco-detail">{children}</div>
    </>
  );
  return onClick
    ? <button type="button" className={`dco-tile is-click${active ? ' is-active' : ''}`} onClick={onClick} aria-pressed={active}>{body}</button>
    : <div className="dco-tile">{body}</div>;
}

/* `display` replaces the number shown next to the label (money, units); `n` still sizes the bar */
export interface Part { key: string; label: string; n: number; tone: Tone; display?: ReactNode }
/* calm palette: problems are red / amber, everything else is a blue-grey ramp by position */
const RAMP = ['var(--primaryColor500)', 'var(--vw-color-blue-300)', 'var(--vw-color-slate-400)', 'var(--vw-color-slate-300)', 'var(--vw-color-slate-200)'];
export const partColor = (tone: Tone, i: number) => (tone === 'error' ? 'var(--vw-color-red-400)' : tone === 'orange' ? 'var(--vw-color-amber-400)' : tone === 'warning' ? 'var(--vw-color-amber-200)' : RAMP[Math.min(i, RAMP.length - 1)]);
/* proportion bar + two-column breakdown (at most four entries); entries can act as filters */
export function Split({ parts, onPick, active, legend = true, other }: { parts: Part[]; onPick?: (k: string) => void; active?: string; legend?: boolean; other?: (n: number) => ReactNode }) {
  const total = parts.reduce((a, p) => a + p.n, 0) || 1;
  let ramp = 0;
  const colored = parts.map(p => ({ ...p, c: partColor(p.tone, ['error', 'orange', 'warning'].includes(p.tone) ? 0 : ramp++) }));
  /* at most three rows, in the caller's order (most severe first): fold the rest into "Other" */
  const rows = colored.length <= 3 ? colored : [...colored.slice(0, 2), { key: '_other', label: 'Other', n: colored.slice(2).reduce((a, p) => a + p.n, 0), tone: 'neutral' as Tone, c: RAMP[4], display: other?.(colored.slice(2).reduce((a, p) => a + p.n, 0)) }];
  return (
    <div className="dco-split">
      <div className="dco-bar">{colored.filter(p => p.n).map(p => <i key={p.key} style={{ width: `${(p.n / total) * 100}%`, background: p.c }} title={`${p.label}: ${typeof p.display === 'string' ? p.display : p.n}`} />)}</div>
      {legend && <div className="dco-kv">{rows.map(p => {
        const click = onPick && p.key !== '_other';
        return (
          <span key={p.key} role={click ? 'button' : undefined} tabIndex={click ? 0 : undefined} className={`${click ? 'is-click' : ''}${active === p.key ? ' is-active' : ''}${p.n && p.tone === 'error' ? ' is-bad' : ''}`}
            onClick={e => { if (!click) return; e.stopPropagation(); onPick!(p.key); }} onKeyDown={e => { if (click && e.key === 'Enter') onPick!(p.key); }}>
            <i style={{ background: p.c }} /><em>{p.label}</em><b>{p.display ?? p.n}</b>
          </span>
        );
      })}</div>}
    </div>
  );
}

export function SoftMeter({ pct, tone = 'info' }: { pct: number; tone?: Tone }) {
  return <span className="dco-meter"><i style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: partColor(tone, 0) }} /></span>;
}

/* one line of supporting facts under the breakdown */
export function Facts({ items }: { items: { n: ReactNode; label: string; tone?: 'bad' | 'warn'; onClick?: () => void }[] }) {
  return (
    <div className="dco-facts">
      {items.map(x => (
        <span key={x.label} role={x.onClick ? 'button' : undefined} tabIndex={x.onClick ? 0 : undefined} className={`${x.onClick ? 'is-click ' : ''}${x.tone ? `is-${x.tone}` : ''}`} onClick={x.onClick ? e => { e.stopPropagation(); x.onClick!(); } : undefined}><b>{x.n}</b> {x.label}</span>
      ))}
    </div>
  );
}

/* small column chart (e.g. alarms raised per hour, windows per day) */
export function MiniBars({ values, labels, hot }: { values: number[]; labels?: string[]; tone?: Tone; hot?: number }) {
  const max = Math.max(1, ...values);
  return (
    <div className="dco-bars">
      {values.map((v, i) => <span key={i} title={`${labels?.[i] ?? ''}${labels ? ': ' : ''}${v}`}><i style={{ height: `${Math.max(v ? 8 : 2, (v / max) * 100)}%`, background: hot !== undefined && i === hot ? 'var(--primaryColor500)' : 'var(--vw-color-slate-300)' }} /></span>)}
      {labels && <div className="dco-bars-x"><span>{labels[0]}</span><span>{labels[labels.length - 1]}</span></div>}
    </div>
  );
}

/* ranked list with inline bars (e.g. top datacenters by alarms) */
export function RankList({ items }: { items: { key: string; label: string; n: number; tone?: Tone; onClick?: () => void }[] }) {
  const max = Math.max(1, ...items.map(i => i.n));
  return (
    <div className="dco-rank">
      {items.slice(0, 3).map(i => (
        <span key={i.key} role={i.onClick ? 'button' : undefined} className={i.onClick ? 'is-click' : ''} onClick={e => { if (!i.onClick) return; e.stopPropagation(); i.onClick(); }}>
          <em>{i.label}</em><span className="dco-rank-bar"><i style={{ width: `${(i.n / max) * 100}%`, background: i.tone === 'error' ? 'var(--vw-color-red-300)' : 'var(--vw-color-slate-400)' }} /></span><b>{i.n}</b>
        </span>
      ))}
    </div>
  );
}
