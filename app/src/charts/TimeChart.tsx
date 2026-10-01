import { useId, useState } from 'react';
import { AXIS_TEXT, AXIS_TEXT_CURRENT, ChartFrame, INK, Legend, TARGET_TEXT, Tooltip, niceTicks, useSize, type TipState } from './core';
import { List, TrendingUp } from 'lucide-react';

export interface TimeSeries {
  key: string;
  label: string;
  color: string;
  kind: 'bar' | 'line' | 'area';
  values: (number | null)[];
  dashed?: boolean;
  stack?: string;
}

/* One-axis time chart: grouped/stacked columns and lines share the same
   scale by construction (never a second y-axis). A threshold/target renders
   as a labelled dashed rule. Hover snaps to the nearest bucket and lists
   every series in a single tooltip. "View data" swaps the plot for the exact
   numbers behind it. */
export function TimeChart({
  labels, series, height: minHeight = 260, format = (v: number) => String(Math.round(v)), yMin, yMax, target, legend = true, fullLabels, targetAlign = 'end'
}: {
  labels: string[];
  fullLabels?: string[];
  series: TimeSeries[];
  height?: number;
  format?: (v: number) => string;
  yMin?: number;
  yMax?: number;
  target?: { value: number; label: string };
  legend?: boolean;
  targetAlign?: 'start' | 'end';
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const width = size.width;
  const height = Math.max(minHeight, Math.floor(size.height));
  const [hover, setHover] = useState<number | null>(null);
  const [tip, setTip] = useState<TipState | null>(null);
  const [asTable, setAsTable] = useState(false);
  const gid = useId().replace(/:/g, '');
  const compact = minHeight < 180;

  const m = { t: 14, r: 16, b: 30, l: 48 };
  const cw = Math.max(10, width - m.l - m.r);
  const ch = height - m.t - m.b;
  const n = labels.length;

  const stacks = new Map<string, number[]>();
  for (const s of series) if (s.kind === 'bar' && s.stack) {
    const acc = stacks.get(s.stack) ?? new Array(n).fill(0);
    s.values.forEach((v, i) => { acc[i] += v ?? 0; });
    stacks.set(s.stack, acc);
  }
  const all = [
    ...series.flatMap(s => s.values.filter((v): v is number => v !== null)),
    ...[...stacks.values()].flat(),
    ...(target ? [target.value] : [])
  ];
  const dataMax = all.length ? Math.max(...all) : 1;
  const dataMin = all.length ? Math.min(...all) : 0;
  const lo = yMin ?? Math.min(0, dataMin);
  const rawTicks = niceTicks(yMax ?? dataMax * 1.08, compact ? 3 : 5, lo);
  const top = yMax ?? rawTicks[rawTicks.length - 1];
  const bottom = yMin ?? rawTicks[0];
  const ticks = rawTicks.filter(t => t >= bottom - 1e-9 && t <= top + 1e-9);
  const y = (v: number) => m.t + ch - ((v - bottom) / (top - bottom || 1)) * ch;

  const slot = cw / n;
  const x = (i: number) => m.l + slot * (i + 0.5);
  const barGroups = [...new Set(series.filter(s => s.kind === 'bar').map(s => s.stack ?? s.key))];
  const groupW = Math.min(44, slot * 0.72);
  const barW = barGroups.length ? Math.max(3, groupW / barGroups.length - (barGroups.length > 1 ? 2 : 0)) : 0;
  const labelEvery = Math.ceil(n / Math.max(1, Math.floor(cw / 64)));

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.max(0, Math.min(n - 1, Math.floor((px - m.l) / slot)));
    setHover(i);
    setTip({
      x: px, y: e.clientY - rect.top, title: fullLabels?.[i] ?? labels[i],
      rows: series.filter(s => s.values[i] !== null).map(s => ({ color: s.color, label: s.label, value: format(s.values[i] as number), dashed: s.dashed }))
        .concat(target ? [{ color: INK.plan, label: target.label || 'Threshold', value: format(target.value), dashed: true }] : [])
    });
  };

  const path = (vals: (number | null)[]) => {
    let d = '';
    vals.forEach((v, i) => { if (v === null) return; d += `${d && vals[i - 1] !== null && vals[i - 1] !== undefined ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
    return d;
  };

  return (
    <div className="ch-wrap">
      <ChartFrame height={minHeight} width={width} frameRef={ref}>
        {asTable ? (
          <div className="ch-data">
            <table className="nst-table">
              <thead><tr><th>Period</th>{series.map(s => <th key={s.key} className="is-right">{s.label}</th>)}</tr></thead>
              <tbody>
                {labels.map((l, i) => (
                  <tr key={i}>
                    <td className="nst-table-td--primary">{fullLabels?.[i] ?? l}</td>
                    {series.map(s => <td key={s.key} className="is-right">{s.values[i] === null ? '—' : format(s.values[i] as number)}</td>)}
                  </tr>
                )).reverse()}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <svg width={width} height={height} role="img" aria-label={series.map(s => s.label).join(', ')}>
              {ticks.map(t => (
                <g key={t}>
                  <line x1={m.l} x2={m.l + cw} y1={y(t)} y2={y(t)} stroke={t === 0 ? INK.baseline : INK.grid} />
                  <text x={m.l - 10} y={y(t) + 4} textAnchor="end" className="ch-axis" {...AXIS_TEXT}>{format(t)}</text>
                </g>
              ))}
              {hover !== null && <rect x={m.l + slot * hover} y={m.t} width={slot} height={ch} fill="#1C81EF" opacity={0.05} />}

              {barGroups.map((g, gi) => {
                const members = series.filter(s => s.kind === 'bar' && (s.stack ?? s.key) === g);
                const offset = (gi - (barGroups.length - 1) / 2) * (barW + (barGroups.length > 1 ? 2 : 0));
                return labels.map((_, i) => {
                  let base = 0;
                  return members.map((s, si) => {
                    const v = s.values[i];
                    if (v === null || v === 0) return null;
                    const y0 = y(base), y1 = y(base + v);
                    base += v;
                    const isTop = si === members.length - 1 || members.slice(si + 1).every(o => !o.values[i]);
                    const h = Math.max(1, y0 - y1);
                    const bx = x(i) + offset - barW / 2;
                    const r = Math.min(4, barW / 2, h);
                    return isTop
                      ? <path className="ch-bar" key={`${s.key}-${i}`} d={`M${bx},${y0} V${y1 + r} Q${bx},${y1} ${bx + r},${y1} H${bx + barW - r} Q${bx + barW},${y1} ${bx + barW},${y1 + r} V${y0} Z`} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.55} />
                      : <rect className="ch-bar" key={`${s.key}-${i}`} x={bx} y={y1 + 1} width={barW} height={Math.max(0, h - 1)} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.55} />;
                  });
                });
              })}

              {series.filter(s => s.kind === 'area').map(s => {
                const d = path(s.values);
                const firstI = s.values.findIndex(v => v !== null);
                const lastI = s.values.length - 1 - [...s.values].reverse().findIndex(v => v !== null);
                return d ? (
                  <g key={`${s.key}-a`} className="ch-area">
                    <defs>
                      <linearGradient id={`${gid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={s.color} stopOpacity={0.24} />
                        <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <path d={`${d} L${x(lastI)},${y(bottom)} L${x(firstI)},${y(bottom)} Z`} fill={`url(#${gid}-${s.key})`} />
                  </g>
                ) : null;
              })}

              {target && (
                <g>
                  <line x1={m.l} x2={m.l + cw} y1={y(target.value)} y2={y(target.value)} stroke={INK.plan} strokeDasharray="4 4" />
                  <text x={targetAlign === 'end' ? m.l + cw : m.l + 6} y={y(target.value) - 6} textAnchor={targetAlign === 'end' ? 'end' : 'start'} className="ch-axis ch-target" {...TARGET_TEXT}>
                    {target.label ? `${target.label} ${format(target.value)}` : format(target.value)}
                  </text>
                </g>
              )}

              {series.filter(s => s.kind !== 'bar').map(s => (
                <g key={s.key} className="ch-line">
                  <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
                  {s.values.map((v, i) => v !== null && (hover === i || (i === s.values.length - 1 && !s.dashed)) ? (
                    <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 4.5 : 3.5} fill="#fff" stroke={s.color} strokeWidth={2} />
                  ) : null)}
                </g>
              ))}

              {labels.map((l, i) => (i === n - 1 || (i % labelEvery === 0 && n - 1 - i >= labelEvery)) ? (
                <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className={`ch-axis${i === n - 1 ? ' is-current' : ''}`} {...(i === n - 1 ? AXIS_TEXT_CURRENT : AXIS_TEXT)}>{l}</text>
              ) : null)}

              <rect x={m.l} y={m.t} width={cw} height={ch} fill="transparent" onMouseMove={onMove} onMouseLeave={() => { setHover(null); setTip(null); }} />
            </svg>
            <Tooltip tip={tip} width={width} />
          </>
        )}
      </ChartFrame>
      <div className="ch-foot">
        {legend ? <Legend items={series.map(s => ({ label: s.label, color: s.color, dashed: s.dashed, shape: (s.kind === 'bar' ? 'box' : 'line') as 'box' | 'line' }))
          .concat(target ? [{ label: target.label || 'Threshold', color: INK.plan, dashed: true, shape: 'line' as const }] : [])} /> : <span />}
        {!compact && (
          <button type="button" className="ch-toggle" onClick={() => { setAsTable(v => !v); setTip(null); setHover(null); }} aria-pressed={asTable}>
            {asTable ? <TrendingUp size={13} /> : <List size={13} />}{asTable ? 'View chart' : 'View data'}
          </button>
        )}
      </div>
    </div>
  );
}
