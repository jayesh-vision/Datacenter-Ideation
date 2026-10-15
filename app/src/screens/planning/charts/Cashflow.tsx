/* Cash flow by year: CapEx below the axis (facility and operator-owned IT), operating cash after tax above it (an operating loss
   stacks below the CapEx), the cumulative position as a line and the discounted one dashed; the year the cumulative line crosses
   zero is marked as payback. Ported from P2B charts/CashflowChart, drawn as plain SVG on the drawings' tokens. */
import { useState } from 'react';
import type { CashflowYear } from '../../../planner/lib/engine';
import { money } from '../common';
import { C, fitTicks, moneyAxis, textW, useTip, useWidth, type TipRow } from './chartKit';
import { ChartEmpty, ChartLegend, ChartTip } from './ChartTip';

export function CashflowChart({ years, height = 260 }: { years: CashflowYear[]; height?: number }) {
  const [ref, width] = useWidth(720);
  const { tip, on, hide } = useTip();
  const [hot, setHot] = useState<number | null>(null);
  if (!years.length) return <ChartEmpty title="No cash flow yet" hint="Add a dated phase; CapEx, revenue and OpEx are laid out by year from it." />;

  const rows = years.map(y => {
    const op = y.revenue + y.benefit - y.opex - (y.tax ?? 0);
    const it = Math.min(y.capex, Math.max(0, y.itCapex ?? 0));
    return { y, op, it, fac: y.capex - it };
  });
  const lo = Math.min(0, ...rows.map(r => -r.y.capex + Math.min(0, r.op)), ...years.map(y => Math.min(y.cumulative, y.discounted)));
  const hi = Math.max(0, ...rows.map(r => Math.max(0, r.op)), ...years.map(y => Math.max(y.cumulative, y.discounted)));
  const { ticks, d0, d1 } = fitTicks(lo, hi, height < 220 ? 4 : 5);
  const w = Math.max(300, width);
  const m = { top: 24, right: 10, bottom: 24, left: Math.ceil(Math.max(...ticks.map(t => textW(moneyAxis(t), 10.5)))) + 14 };
  const iw = w - m.left - m.right, ih = height - m.top - m.bottom;
  const Y = (v: number) => ih - ((v - d0) / (d1 - d0 || 1)) * ih;
  const step = iw / years.length, bw = Math.min(40, Math.max(4, step * 0.62)), cx = (i: number) => step * (i + 0.5);
  const longLabel = textW('2030', 10.5) + 10 <= step, label = (s: string) => (longLabel || !/^\d{4}$/.test(s) ? s : `'${s.slice(2)}`);
  const every = Math.max(1, Math.ceil((textW(label(years[0].label), 10.5) + 10) / step));
  const payIdx = years.findIndex((y, i) => i > 0 && y.cumulative >= 0 && years[i - 1].cumulative < 0);
  // Interpolate where the cumulative line crosses zero inside the payback year.
  const payX = payIdx > 0 ? (() => { const a = years[payIdx - 1].cumulative, b = years[payIdx].cumulative; return cx(payIdx - 1) + step * (-a / (b - a || 1)); })() : null;
  const hasIt = rows.some(r => r.it > 0), hasLoss = rows.some(r => r.op < 0);
  const line = (k: 'cumulative' | 'discounted') => years.map((y, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)},${Y(y[k]).toFixed(1)}`).join(' ');
  const tipRows = (r: (typeof rows)[number]): TipRow[] => [
    ['CapEx', money(-r.y.capex), C.indigo], ...(r.it ? [['of which IT', money(-r.it), C.violet] as TipRow] : []),
    ['Revenue', money(r.y.revenue)], ...(r.y.benefit ? [['Savings and benefits', money(r.y.benefit)] as TipRow] : []),
    ['OpEx incl. energy', money(-r.y.opex)], ...(r.y.tax ? [['Tax', money(-r.y.tax)] as TipRow] : []),
    ['Operating cash', money(r.op), r.op >= 0 ? C.emerald : C.amber], ['Net cash', money(r.y.net)],
    ['Cumulative', money(r.y.cumulative), C.ink, true], ['Discounted cumulative', money(r.y.discounted), C.slate, true],
  ];
  const last = years[years.length - 1];

  return (
    <div ref={ref} className="pc-draw">
      <svg viewBox={`0 0 ${w} ${height}`} width={w} height={height} role="img" aria-label={`Cash flow over ${years.length} years; cumulative ${money(last.cumulative)} by ${last.label}`} onMouseLeave={() => { setHot(null); hide(); }}>
        <g transform={`translate(${m.left},${m.top})`}>
          {ticks.map(t => <g key={t} transform={`translate(0,${Y(t)})`}><line x1={0} x2={iw} stroke={t === 0 ? C.slateLight : C.grid} strokeDasharray={t === 0 ? undefined : '2 3'} /><text x={-8} dy="0.32em" textAnchor="end" fontSize={10.5} fill={C.slate}>{moneyAxis(t)}</text></g>)}
          {rows.map((r, i) => {
            const x = cx(i) - bw / 2, z = Y(0);
            const facH = Y(-r.fac) - z, itH = Y(-r.y.capex) - Y(-r.fac), lossH = r.op < 0 ? Y(-r.y.capex + r.op) - Y(-r.y.capex) : 0, gainH = r.op > 0 ? z - Y(r.op) : 0;
            return (
              <g key={r.y.label} {...on({ title: r.y.label, rows: tipRows(r) })} onMouseEnter={() => setHot(i)}>
                <rect x={cx(i) - step / 2} y={0} width={step} height={ih} fill={hot === i ? C.faint : 'transparent'} />
                {facH > 0 && <rect x={x} y={z} width={bw} height={facH} rx={2} fill={C.indigo} />}
                {itH > 0 && <rect x={x} y={z + facH} width={bw} height={itH} rx={2} fill={C.violet} />}
                {lossH > 0 && <rect x={x} y={Y(-r.y.capex)} width={bw} height={lossH} rx={2} fill={C.amber} opacity={0.9} />}
                {gainH > 0 && <rect x={x} y={z - gainH} width={bw} height={gainH} rx={2} fill={C.emerald} opacity={0.9} />}
                {i % every === 0 && <text x={cx(i)} y={ih + 16} textAnchor="middle" fontSize={10.5} fill={hot === i ? C.ink : C.slate}>{label(r.y.label)}</text>}
              </g>
            );
          })}
          <path d={line('discounted')} fill="none" stroke={C.slate} strokeWidth={1.4} strokeDasharray="4 3" pointerEvents="none" />
          <path d={line('cumulative')} fill="none" stroke={C.ink} strokeWidth={1.8} strokeLinejoin="round" pointerEvents="none" />
          {years.map((y, i) => <circle key={y.label} cx={cx(i)} cy={Y(y.cumulative)} r={hot === i ? 3.6 : 2.4} fill={hot === i ? C.surface : C.ink} stroke={C.ink} strokeWidth={hot === i ? 1.8 : 0} pointerEvents="none" />)}
          {payX !== null && (
            <g transform={`translate(${payX},0)`} pointerEvents="none">
              <line y1={-6} y2={ih} stroke={C.emeraldDark} strokeDasharray="4 3" />
              <text y={-10} textAnchor={payX > iw - 70 ? 'end' : payX < 70 ? 'start' : 'middle'} fontSize={10.5} fontWeight={600} fill={C.emeraldDark}>pays back in {years[payIdx].label}</text>
            </g>
          )}
        </g>
      </svg>
      <ChartTip tip={tip} />
      <ChartLegend items={[
        { label: hasIt ? 'CapEx (facility)' : 'CapEx', color: C.indigo }, ...(hasIt ? [{ label: 'CapEx (operator-owned IT)', color: C.violet }] : []),
        { label: 'Operating cash after tax', color: C.emerald }, ...(hasLoss ? [{ label: 'Operating loss', color: C.amber }] : []),
        { label: 'Cumulative', color: C.ink, kind: 'line' as const }, { label: 'Discounted', color: C.slate, kind: 'dash' as const },
      ]}>
        {payX === null && <span className="pc-legend-note">{last.cumulative >= 0 ? 'Cash positive from the first year' : `Does not pay back by ${last.label}`}</span>}
      </ChartLegend>
    </div>
  );
}
