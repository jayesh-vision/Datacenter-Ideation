/* Scenarios against the base plan on one metric at a time (CapEx, OpEx, PUE, payback, racks): one bar per option with its value
   and the change against the base, the preferred option highlighted and the lowest marked; a strip below holds every metric per
   option (click a row to chart it). Ported from P2B charts/ScenarioCompareChart, drawn as horizontal bars so long scenario names
   fit, on the drawings' tokens. */
import { useState } from 'react';
import type * as T from '../../../planner/p2b/types';
import type { Evaluation } from '../../../planner/lib/engine';
import { fmtKw } from '../../../planner/lib/engine';
import { Seg } from '../../../ui/kit';
import { money, num } from '../common';
import { C, clip, fitTicks, moneyAxis, textW, useTip, useWidth, type TipRow } from './chartKit';
import { ChartEmpty, ChartLegend, ChartTip } from './ChartTip';

type Key = 'capex' | 'opex' | 'pue' | 'payback' | 'racks' | 'fails';
interface Metric { key: Key; label: string; short: string; get: (ev: Evaluation) => number | null; fmt: (v: number) => string; lowerBetter: boolean; axis?: (v: number) => string }
const METRICS: Metric[] = [
  { key: 'capex', label: 'CapEx', short: 'CapEx', get: ev => ev.estimate.capexTotal, fmt: v => money(v), lowerBetter: true },
  { key: 'opex', label: 'OpEx per month', short: 'OpEx', get: ev => ev.estimate.opexMonthly, fmt: v => money(v), lowerBetter: true },
  { key: 'pue', label: 'PUE', short: 'PUE', get: ev => (ev.sizing.itKw > 0 ? ev.sizing.pue.value : null), fmt: v => v.toFixed(2), lowerBetter: true },
  { key: 'payback', label: 'Payback', short: 'Payback', get: ev => ev.estimate.paybackMonths, fmt: v => `${num(v)} mo`, lowerBetter: true },
  { key: 'racks', label: 'Racks', short: 'Racks', get: ev => ev.sizing.racks, fmt: v => num(v), lowerBetter: false },
  { key: 'fails', label: 'Hard fails', short: 'Fails', get: ev => ev.hardFails, fmt: v => num(v), lowerBetter: true },
];
const CHARTED: Key[] = ['capex', 'opex', 'pue', 'payback', 'racks'];

export function ScenarioCompareChart({ base, scenarios, preferredId }: { base: Evaluation; scenarios: { scenario: T.PlannerScenario; ev: Evaluation }[]; preferredId?: string }) {
  const [ref, width] = useWidth(720);
  const { tip, on } = useTip();
  const [key, setKey] = useState<Key>('capex');
  if (!scenarios.length) return <ChartEmpty title="No scenarios to compare" hint="Add a what-if scenario to compare it with the base plan." />;

  const prefId = preferredId ?? scenarios.find(s => s.scenario.preferred)?.scenario.id;
  const items = [{ id: '__base', name: 'Base plan', ev: base, base: true, preferred: false }, ...scenarios.map(s => ({ id: s.scenario.id, name: s.scenario.name, ev: s.ev, base: false, preferred: s.scenario.id === prefId }))];
  const metric = METRICS.find(m => m.key === key)!;
  const vals = items.map(it => metric.get(it.ev));
  const finite = vals.filter((v): v is number => v !== null && Number.isFinite(v));
  const bestOf = (m: Metric) => { const xs = items.map(it => m.get(it.ev)).filter((v): v is number => v !== null && Number.isFinite(v)); return xs.length > 1 && new Set(xs).size > 1 ? (m.lowerBetter ? Math.min(...xs) : Math.max(...xs)) : undefined; };
  const best = bestOf(metric);
  const baseV = vals[0];

  const w = Math.max(280, width), stacked = w < 520, narrow = w < 640;
  // Wide: name | bar + value | change vs base. Narrow panels stack the name (and the change) above each bar.
  const nameW = stacked ? 0 : Math.min(230, Math.max(104, Math.ceil(Math.max(...items.map(it => textW(it.name, 12))) + 16), w * 0.24));
  const deltaW = narrow ? 0 : 96, rowH = stacked ? 46 : 34, top = 18, bar = 14;
  const iw = w - nameW - deltaW - 8;
  const fmtV = (v: number) => metric.fmt(v);
  const valueRoom = Math.max(60, ...finite.map(v => textW(fmtV(v), 12.5))) + (best !== undefined ? 56 : 14);
  const plotW = Math.max(60, iw - valueRoom);
  const lo = key === 'pue' ? Math.max(1, Math.floor((Math.min(...finite, 1.1) - 0.05) * 10) / 10) : 0;
  const hiV = Math.max(lo + 0.1, ...finite);
  const fit = fitTicks(lo, hiV, Math.max(2, Math.min(5, Math.floor(plotW / 70))));
  const d0 = key === 'pue' ? lo : 0, d1 = Math.max(fit.d1, hiV);
  const ticks = fit.ticks.filter(t => t >= d0 - 1e-9);
  const X = (v: number) => ((v - d0) / (d1 - d0 || 1)) * plotW;
  const H = top + rowH * items.length + 6;
  const axisLabel = (t: number) => (metric.axis ? metric.axis(t) : key === 'capex' || key === 'opex' ? moneyAxis(t) : key === 'pue' ? t.toFixed(2) : num(t));
  const delta = (v: number | null) => {
    if (v === null || baseV === null || !Number.isFinite(v) || !Number.isFinite(baseV)) return null;
    const d = v - baseV; if (Math.abs(d) < 1e-9) return { text: 'same as base', tone: C.slate };
    const better = metric.lowerBetter ? d < 0 : d > 0;
    const text = key === 'pue' ? `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}` : key === 'capex' || key === 'opex' ? `${d > 0 ? '+' : '−'}${money(Math.abs(d))}` : `${d > 0 ? '+' : '−'}${num(Math.abs(d))}${key === 'payback' ? ' mo' : ''}`;
    return { text, tone: better ? C.emeraldDark : C.slateDark };
  };
  const tipFor = (it: (typeof items)[number]): TipRow[] => {
    const dl = it.base ? null : delta(vals[items.indexOf(it)]);
    return [
      ...METRICS.map(m => { const v = m.get(it.ev); return [m.label, v === null ? 'n/a' : m.fmt(v), m.key === key ? C.blueDark : undefined] as TipRow; }),
      ...(dl ? [[`${metric.label} vs base`, dl.text] as TipRow] : []),
      ['Design load', fmtKw(it.ev.sizing.itKw)], ['Readiness', `${it.ev.readinessPct}%`], ['Warnings', num(it.ev.softWarns)],
    ];
  };

  return (
    <div ref={ref} className="pc-draw">
      <div className="pc-head">
        <div className="pc-head-figs"><span>{items.length} options · {metric.lowerBetter ? 'lower is better' : 'more racks, more capacity'}</span></div>
        <Seg size="sm" options={METRICS.filter(m => CHARTED.includes(m.key)).map(m => ({ id: m.key, label: m.short }))} value={key} onChange={setKey} />
      </div>
      <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label={`${metric.label} by scenario`}>
        <g transform={`translate(${nameW},${top})`}>
          {ticks.map(t => <g key={t} transform={`translate(${X(t)},0)`}><line y1={-4} y2={rowH * items.length} stroke={C.grid} strokeDasharray={t === d0 ? undefined : '2 3'} /><text y={-7} textAnchor={X(t) < 12 ? 'start' : 'middle'} fontSize={10} fill={C.slate}>{axisLabel(t)}</text></g>)}
          {!narrow && <text x={w - nameW - 4} y={-7} textAnchor="end" fontSize={10} fill={C.slate}>change vs base</text>}
        </g>
        {items.map((it, i) => {
          const v = vals[i], y = top + i * rowH, cy = stacked ? y + 32 : y + rowH / 2, dl = delta(v);
          const fill = it.preferred ? C.blueDark : it.base ? 'var(--vw-color-slate-300)' : C.blueLight;
          const isBest = v !== null && best !== undefined && v === best;
          const name = clip(it.name, stacked ? Math.floor((w - 110) / 6.6) : Math.floor((nameW - 14) / 6.6));
          return (
            <g key={it.id} {...on({ title: `${it.name}${it.preferred ? ' · preferred' : ''}`, rows: tipFor(it) })}>
              <rect x={0} y={y} width={w} height={rowH} fill={i % 2 ? C.wash : 'transparent'} />
              {stacked ? (
                <>
                  <text x={4} y={y + 13} dy="0.35em" fontSize={12} fontWeight={it.preferred || it.base ? 600 : 400} fill={C.ink}>{name}{it.preferred && <tspan fontSize={10} fontWeight={400} fill={C.blueDark}>  preferred</tspan>}</text>
                  <text x={w - 4} y={y + 13} dy="0.35em" textAnchor="end" fontSize={11} fill={it.base ? C.slate : dl?.tone ?? C.slate}>{it.base ? 'base' : dl?.text ?? ''}</text>
                </>
              ) : (
                <>
                  <text x={nameW - 10} y={cy - (it.preferred ? 5 : 0)} dy="0.35em" textAnchor="end" fontSize={12} fontWeight={it.preferred || it.base ? 600 : 400} fill={C.ink}>{name}</text>
                  {it.preferred && <text x={nameW - 10} y={cy + 9} dy="0.35em" textAnchor="end" fontSize={10} fill={C.blueDark}>preferred</text>}
                </>
              )}
              <g transform={`translate(${nameW},0)`}>
                {v === null || !Number.isFinite(v) ? (
                  <><rect x={0} y={cy - bar / 2} width={Math.min(90, plotW * 0.3)} height={bar} rx={3} fill="none" stroke={C.slateLight} strokeDasharray="3 3" /><text x={Math.min(90, plotW * 0.3) + 8} y={cy} dy="0.35em" fontSize={11} fill={C.slate}>{key === 'payback' ? 'does not pay back' : 'n/a'}</text></>
                ) : (
                  <>
                    <rect x={0} y={cy - bar / 2} width={Math.max(2, X(v))} height={bar} rx={3} fill={fill} />
                    <text x={Math.max(2, X(v)) + 7} y={cy} dy="0.35em" fontSize={11.5} fontWeight={600} fill={C.ink}>{fmtV(v)}{isBest && <tspan dx={8} fontSize={10} fontWeight={600} fill={C.emeraldDark}>{metric.lowerBetter ? 'lowest' : 'most'}</tspan>}</text>
                  </>
                )}
              </g>
              {!narrow && !stacked && !it.base && dl && <text x={w - 4} y={cy} dy="0.35em" textAnchor="end" fontSize={11.5} fontWeight={500} fill={dl.tone}>{dl.text}</text>}
              {!narrow && !stacked && it.base && <text x={w - 4} y={cy} dy="0.35em" textAnchor="end" fontSize={11} fill={C.slate}>base</text>}
            </g>
          );
        })}
      </svg>
      <ChartLegend items={[{ label: 'Base plan', color: 'var(--vw-color-slate-300)' }, { label: 'Preferred', color: C.blueDark }, { label: 'Other scenarios', color: C.blueLight }]}>
        <span className="pc-legend-note">Hover a row for every figure</span>
      </ChartLegend>
      <div className="pc-strip">
        <table>
          <thead><tr><th>Metric</th>{items.map(it => <th key={it.id} className={it.preferred ? 'is-pref' : undefined} title={it.name}>{clip(it.name, 22)}</th>)}</tr></thead>
          <tbody>
            {METRICS.map(m => {
              const b = bestOf(m);
              return (
                <tr key={m.key} className={m.key === key ? 'is-active' : undefined} onClick={() => CHARTED.includes(m.key) && setKey(m.key)} style={CHARTED.includes(m.key) ? undefined : { cursor: 'default' }}>
                  <td>{m.label}</td>
                  {items.map(it => { const v = m.get(it.ev); return <td key={it.id} className={v === null ? 'is-na' : b !== undefined && v === b ? 'is-best' : undefined}>{v === null ? 'n/a' : m.fmt(v)}</td>; })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ChartTip tip={tip} />
    </div>
  );
}
