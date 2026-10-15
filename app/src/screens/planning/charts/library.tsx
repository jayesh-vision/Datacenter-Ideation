/* Visuals of the planner hub and its library (Overview, Templates, Benchmarks & rules), ported from DCOS `components/hub/visuals.tsx`
   and `pages/BenchmarksPage.tsx` and redrawn on NST tokens: two-series bar rows, a low / typical / high range bar, a stacked share
   bar, the PUE matrix (cooling × climate) and the lead-time range chart. Every hover uses the shared floating tooltip (ChartTip). */
import type { ReactNode } from 'react';
import { ChartTip } from './ChartTip';
import { C, niceTicks, useTip, type TipContent } from './chartKit';
import { CLIMATE_LABEL, CLIMATE_ORDER, COOLING_LABEL, COOLING_ORDER, metricDetail } from '../../../planner/lib/labels';
import type * as T from '../../../planner/p2b/types';
import { date, num } from '../common';

/** a hover target that shows the floating tooltip (for HTML text such as a table cell) */
export function Tip({ content, children, className = '' }: { content: TipContent; children: ReactNode; className?: string }) {
  const { tip, on } = useTip();
  return <span className={`pn-tip-host ${className}`} {...on(content)}>{children}<ChartTip tip={tip} /></span>;
}

/* ------------------------------------------------------------------ bar rows: one row per item, one bar per series */
export interface BarSeries { key: string; label: string; color: string; format: (v: number) => string }
export interface BarRowItem { key: string; label: string; values: Record<string, number>; onClick?: () => void; note?: string }
/** Horizontal bars, each series normalised to its own maximum (a count and a kW can share a row). Plain HTML, so the text keeps
 *  the app's sizes at any card width. */
export function BarRows({ items, series, labelWidth = 170, valueWidth = 64 }: { items: BarRowItem[]; series: BarSeries[]; labelWidth?: number; valueWidth?: number }) {
  const { tip, on } = useTip();
  if (!items.length) return <p className="vw-label">Nothing to show yet.</p>;
  const max: Record<string, number> = {};
  for (const s of series) max[s.key] = Math.max(1e-9, ...items.map(i => i.values[s.key] ?? 0));
  const cols = `${labelWidth}px minmax(0, 1fr) ${series.map(() => `${valueWidth}px`).join(' ')}`;
  return (
    <div className="pn-barrows" role="img" aria-label={`Bar chart: ${series.map(s => s.label).join(' and ')}`}>
      <div className="pn-barrows-legend" style={{ gridTemplateColumns: cols }}>
        <span /><span />
        {series.map(s => <span key={s.key} className="pn-barrows-head"><i style={{ background: s.color }} />{s.label}</span>)}
      </div>
      {items.map(it => {
        const Row = it.onClick ? 'button' : 'div';
        const content: TipContent = { title: it.label, rows: series.map(s => [s.label, s.format(it.values[s.key] ?? 0), s.color]), note: it.note };
        return (
          <Row key={it.key} {...(it.onClick ? { type: 'button' as const, onClick: it.onClick } : {})} className={`pn-barrows-row${it.onClick ? ' is-click' : ''}`} style={{ gridTemplateColumns: cols }} {...on(content)}>
            <span className="pn-barrows-name">{it.label}</span>
            <span className="pn-barrows-tracks">
              {series.map(s => { const v = it.values[s.key] ?? 0; return <span key={s.key} className="pn-barrows-track"><i style={{ width: `${v > 0 ? Math.max(1.5, (v / max[s.key]) * 100) : 0}%`, background: s.color }} /></span>; })}
            </span>
            {series.map(s => <b key={s.key} className="pn-barrows-val">{s.format(it.values[s.key] ?? 0)}</b>)}
          </Row>
        );
      })}
      <ChartTip tip={tip} />
    </div>
  );
}

/* ------------------------------------------------------------------ range bar */
/** low – typical – high on a shared axis from 0 to `max`; the typical value is the dark tick. */
export function RangeBar({ low, value, high, min = 0, max, width = 120, fmt = n => num(n, 2), unit, title }: { low?: number; value?: number; high?: number; min?: number; max: number; width?: number; fmt?: (n: number) => string; unit?: string; title?: string }) {
  const { tip, on } = useTip();
  const x = (n: number) => Math.max(0, Math.min(width, ((n - min) / Math.max(1e-9, max - min)) * width));
  const lo = low ?? value ?? 0, hi = high ?? value ?? 0;
  const u = unit ? ` ${unit}` : '';
  const rows: TipContent['rows'] = [];
  if (low !== undefined) rows.push(['Low', `${fmt(low)}${u}`, C.blueLight]);
  if (value !== undefined) rows.push(['Typical', `${fmt(value)}${u}`, C.blueDark]);
  if (high !== undefined) rows.push(['High', `${fmt(high)}${u}`, C.blueLight]);
  return (
    <span className="pn-range" {...on({ title: title ?? 'Range', rows })}>
      <svg width={width} height={14} viewBox={`0 0 ${width} 14`} role="img" aria-label={rows.map(r => `${r[0]} ${r[1]}`).join(', ')}>
        <rect x={0} y={5} width={width} height={4} rx={2} fill={C.faint} />
        {hi > lo && <rect x={x(lo)} y={5} width={Math.max(2, x(hi) - x(lo))} height={4} rx={2} fill={C.blueLight} />}
        {value !== undefined && <rect x={Math.min(width - 3, Math.max(0, x(value) - 1.5))} y={1} width={3} height={12} rx={1} fill={C.blueDark} />}
      </svg>
      <ChartTip tip={tip} />
    </span>
  );
}

/* ------------------------------------------------------------------ stacked share bar */
export function StackBar({ parts, height = 14 }: { parts: { label: string; pct: number; color: string }[]; height?: number }) {
  const { tip, on } = useTip();
  const shown = parts.filter(p => p.pct > 0);
  return (
    <div className="pn-stackbar">
      <div className="pn-stackbar-bar" style={{ height, borderRadius: height / 2 }} role="img" aria-label={parts.map(p => `${p.label} ${p.pct}%`).join(', ')}>
        {shown.map(p => <i key={p.label} style={{ width: `${p.pct}%`, background: p.color }} {...on({ title: p.label, rows: [['Share', `${p.pct}%`, p.color]] })} />)}
      </div>
      <div className="pn-stackbar-keys">{parts.map(p => <span key={p.label}><i style={{ background: p.color }} />{p.label} <b>{p.pct}%</b></span>)}</div>
      <ChartTip tip={tip} />
    </div>
  );
}

/* ------------------------------------------------------------------ PUE matrix */
const rangeText = (b: T.PlannerBenchmark) => (b.low !== undefined && b.high !== undefined ? `${num(b.low, 2)} – ${num(b.high, 2)}` : '');
/** Typical PUE for each cooling choice (rows) in each climate (columns); the best value is green; a cell opens the value. */
export function PueMatrix({ rows, onEdit }: { rows: T.PlannerBenchmark[]; onEdit: (b: T.PlannerBenchmark) => void }) {
  const { tip, on } = useTip();
  const coolings = COOLING_ORDER.filter(c => rows.some(b => b.appliesTo.coolingType === c));
  const climates = CLIMATE_ORDER.filter(cl => rows.some(b => b.appliesTo.climate === cl));
  if (!coolings.length) return <div className="pc-empty"><b>No PUE values</b><span>Add PUE values per cooling type and climate.</span></div>;
  const cell = (c: T.PlannerCoolingType, cl: string) => rows.find(b => b.appliesTo.coolingType === c && b.appliesTo.climate === cl);
  const vals = rows.map(b => b.value).filter((v): v is number => v !== undefined);
  const best = Math.min(...vals), worst = Math.max(...vals);
  /* a soft blue wash: lighter = better, so the eye finds the efficient corner */
  const wash = (v: number) => `color-mix(in srgb, var(--vw-color-blue-100) ${Math.round(15 + ((v - best) / Math.max(1e-9, worst - best)) * 70)}%, white)`;
  return (
    <div className="pn-pue">
      <table className="nst-table">
        <thead><tr><th>Cooling</th>{climates.map(cl => <th key={cl}>{CLIMATE_LABEL[cl]}</th>)}</tr></thead>
        <tbody>{coolings.map(c => (
          <tr key={c}>
            <td className="pn-pue-name">{COOLING_LABEL[c]}</td>
            {climates.map(cl => { const b = cell(c, cl); if (!b || b.value === undefined) return <td key={cl} className="pn-pue-cell is-none"><span>—</span></td>;
              return (
                <td key={cl} className={`pn-pue-cell${b.value === best ? ' is-best' : ''}`} style={{ background: wash(b.value) }}>
                  <button type="button" onClick={() => onEdit(b)} {...on({ title: `${COOLING_LABEL[c]} · ${CLIMATE_LABEL[cl]}`, rows: [['Typical PUE', num(b.value, 2), C.blueDark], ...(rangeText(b) ? [['Range', rangeText(b)] as [string, string]] : [])], note: `${b.source} · as of ${date(b.sourceDate)}${b.indicative ? ' · indicative' : ''}. Click to change it.` })}>
                    <b>{num(b.value, 2)}</b>{rangeText(b) && <small>{rangeText(b)}</small>}
                  </button>
                </td>
              ); })}
          </tr>
        ))}</tbody>
      </table>
      <ChartTip tip={tip} />
    </div>
  );
}

/* ------------------------------------------------------------------ lead-time range chart */
/** Equipment lead times in weeks as horizontal ranges, longest first; long items (≥ `longWeeks` at the high end) in amber. */
export function LeadBars({ rows, onEdit, longWeeks = 40 }: { rows: T.PlannerBenchmark[]; onEdit: (b: T.PlannerBenchmark) => void; longWeeks?: number }) {
  const { tip, on } = useTip();
  if (!rows.length) return <div className="pc-empty"><b>No lead times</b><span>Add lead times per equipment class.</span></div>;
  const sorted = [...rows].sort((a, b) => (b.high ?? b.value ?? 0) - (a.high ?? a.value ?? 0));
  const ticks = niceTicks(0, Math.max(1, ...rows.map(b => b.high ?? b.value ?? 0)), 6);
  const max = ticks[ticks.length - 1] || 1;
  const pct = (w: number) => `${(w / max) * 100}%`;
  const long = sorted.filter(b => (b.high ?? b.value ?? 0) >= longWeeks).length;
  return (
    <div className="pn-lead" role="img" aria-label="Equipment lead times in weeks">
      <div className="pn-lead-row pn-lead-axis" aria-hidden="true">
        <span />
        <span className="pn-lead-track">{ticks.map(t => <span key={t} style={{ left: pct(t) }}>{t === 0 ? '0' : `${num(t)} wk`}</span>)}</span>
        <span /><span />
      </div>
      {sorted.map(b => {
        const lo = b.low ?? b.value ?? 0, hi = b.high ?? b.value ?? 0, isLong = hi >= longWeeks;
        const name = metricDetail(b.metric) || b.label;
        return (
          <button key={b.id} type="button" className="pn-lead-row" onClick={() => onEdit(b)}
            {...on({ title: name, rows: [['Range', `${num(lo)} – ${num(hi)} weeks`, isLong ? C.amber : C.blue], ...(b.value !== undefined ? [['Typical', `${num(b.value)} weeks`, C.slateDark] as [string, string, string]] : [])], note: `${b.source} · as of ${date(b.sourceDate)} · ${b.indicative ? 'indicative' : 'confirmed'}. Click to change it.` })}>
            <span className="pn-lead-name">{name}</span>
            <span className="pn-lead-track">
              {ticks.map(t => <i key={t} className="pn-lead-grid" style={{ left: pct(t) }} />)}
              <i className={`pn-lead-fill${isLong ? ' is-long' : ''}`} style={{ left: pct(lo), width: `max(6px, calc(${pct(hi)} - ${pct(lo)}))` }} />
              {b.value !== undefined && <i className="pn-lead-mark" style={{ left: pct(b.value) }} />}
            </span>
            <span className="pn-lead-val">{lo === hi ? `${num(hi)}` : `${num(lo)}–${num(hi)}`} wk</span>
            <span className={`pn-lead-kind${b.indicative ? '' : ' is-ok'}`}>{b.indicative ? 'Indicative' : 'Confirmed'}</span>
          </button>
        );
      })}
      <div className="pc-legend">
        <span><i style={{ background: C.blueLight }} />Lead time range</span>
        <span><i style={{ background: 'var(--vw-color-amber-300)' }} />{long} long-lead item{long === 1 ? '' : 's'} ({longWeeks}+ weeks)</span>
        <span><i className="is-line" style={{ borderTopColor: C.slateDark, transform: 'rotate(90deg)', width: 10 }} />Typical</span>
      </div>
      <ChartTip tip={tip} />
    </div>
  );
}
