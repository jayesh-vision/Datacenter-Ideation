/* Where the plan sits against the benchmark bands for its site type: MEP and fit-out CapEx per kW (with the estate's delivered
   figure when known) and PUE for its cooling and climate. Each row draws the low–high band, the typical value, the plan's marker
   and an inside / above / below chip. Ported from P2B's cost benchmark strip, drawn as plain SVG on the drawings' tokens. */
import type * as T from '../../../planner/p2b/types';
import type { Evaluation } from '../../../planner/lib/engine';
import { Chip } from '../../../ui/kit';
import { date, money } from '../common';
import { C, useTip, useWidth, type TipRow } from './chartKit';
import { ChartEmpty, ChartLegend, ChartTip } from './ChartTip';

interface Row {
  key: string; label: string; unit: string; fmt: (v: number) => string;
  low: number; high: number; typical?: number; plan: number; actual?: number; lowerIsBetter?: boolean;
  source: string; sourceDate?: string; indicative?: boolean; note?: string;
}

export function BenchmarkBand({ ev, plan, benchmarks }: { ev: Evaluation; plan: T.PlannerPlan; benchmarks: T.PlannerBenchmark[] }) {
  const [ref, width] = useWidth(720);
  const { tip, on } = useTip();
  const est = ev.estimate, s = ev.sizing;
  const rows: Row[] = [];
  const bmCapex = benchmarks.find(b => b.metric === 'capexPerKw' && b.appliesTo.dcTypeKey === plan.dcTypeKey);
  // Only the band the estimate itself used: scopes costed bottom-up (or as a share of a site) carry none, and the tab says so.
  const band = est.benchmarkBand;
  if (band && est.capexPerKw > 0) rows.push({
    key: 'capex', label: 'CapEx per kW', unit: 'MEP and fit-out', fmt: v => money(v), low: band.low, high: band.high, typical: bmCapex?.value && bmCapex.value >= band.low && bmCapex.value <= band.high ? bmCapex.value : undefined, plan: est.capexPerKw,
    actual: est.actualsCapexPerKw, source: band.source, sourceDate: bmCapex?.sourceDate, indicative: bmCapex?.indicative,
    note: 'The band covers MEP and fit-out only; land, shell, IT and contingency are separate lines.',
  });
  const cooling = s.cooling.type;
  const bmPue = benchmarks.find(b => b.metric === 'pue' && b.appliesTo.coolingType === cooling && b.appliesTo.climate === plan.climate) ?? benchmarks.find(b => b.metric === 'pue' && b.appliesTo.coolingType === cooling);
  const pue = s.pue.value;
  if (bmPue && s.itKw > 0 && pue > 0) {
    const lo = bmPue.low ?? (bmPue.value ? bmPue.value - 0.05 : undefined), hi = bmPue.high ?? (bmPue.value ? bmPue.value + 0.08 : undefined);
    if (lo && hi) rows.push({ key: 'pue', label: 'PUE', unit: `${cooling.replace(/-/g, ' ')}${bmPue.appliesTo.climate ? `, ${bmPue.appliesTo.climate} climate` : ''}`, fmt: v => v.toFixed(2), low: lo, high: hi, typical: bmPue.value, plan: pue, lowerIsBetter: true, source: bmPue.source, sourceDate: bmPue.sourceDate, indicative: bmPue.indicative });
  }
  const tier = String(ev.params['tier']?.value ?? '');
  const staffBm = benchmarks.find(b => b.metric === 'staffPerMw' && b.appliesTo.tier === tier) ?? benchmarks.find(b => b.metric === 'staffPerMw');
  if (staffBm?.low && staffBm.high && s.staffing.perMw > 0 && s.itKw >= 500) rows.push({ key: 'staff', label: 'Staff per MW', unit: tier || 'site staffing', fmt: v => v.toFixed(1), low: staffBm.low, high: staffBm.high, typical: staffBm.value, plan: s.staffing.perMw, source: staffBm.source, sourceDate: staffBm.sourceDate, indicative: staffBm.indicative });

  if (!rows.length) return <ChartEmpty title="No benchmark for this plan type" hint="It is costed bottom-up from its bill of materials, so there is no per-kW band to compare with." />;
  const w = Math.max(280, width), narrow = w < 640;
  const trackW = narrow ? w : Math.max(160, w - 220 - 118 - 36);
  const H = 46, pad = 14;

  return (
    <div ref={ref} className={`pc-draw pc-bench${narrow ? ' is-narrow' : ''}`}>
      {rows.map(r => {
        const vals = [r.low, r.high, r.plan, ...(r.actual ? [r.actual] : []), ...(r.typical ? [r.typical] : [])];
        const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || hi * 0.1 || 1;
        const d0 = Math.max(0, lo - span * 0.35), d1 = hi + span * 0.35;
        const X = (v: number) => pad + ((v - d0) / (d1 - d0)) * (trackW - pad * 2);
        const pos = r.plan < r.low ? 'below' : r.plan > r.high ? 'above' : 'inside';
        const tone = pos === 'inside' ? 'success' : (pos === 'below') === !!r.lowerIsBetter ? 'success' : 'warning';
        const chip = pos === 'inside' ? 'Inside band' : pos === 'above' ? 'Above band' : 'Below band';
        const srcRows: TipRow[] = [['Source', r.source], ...(r.sourceDate ? [['As of', date(r.sourceDate)] as TipRow] : []), ...(r.indicative ? [['Status', 'indicative'] as TipRow] : [])];
        const bandTip = { title: `${r.label} benchmark`, rows: [['Low', r.fmt(r.low), C.slateLight] as TipRow, ...(r.typical ? [['Typical', r.fmt(r.typical)] as TipRow] : []), ['High', r.fmt(r.high)] as TipRow, ...srcRows], note: r.note };
        const planTip = { title: 'This plan', rows: [[r.label, r.fmt(r.plan), pos === 'inside' ? C.blueDark : C.amber] as TipRow, ['Against the band', `${pos}${pos === 'inside' ? '' : ` by ${r.fmt(Math.abs(r.plan - (pos === 'above' ? r.high : r.low)))}`}`] as TipRow, ...(r.typical ? [['Against typical', `${r.plan >= r.typical ? '+' : ''}${(((r.plan - r.typical) / r.typical) * 100).toFixed(0)}%`] as TipRow] : [])] };
        const lx = X(r.low), hx = X(r.high), px = X(r.plan);
        const labelAt = (x: number) => Math.min(trackW - 4, Math.max(4, x));
        return (
          <div key={r.key} className="pc-bench-row">
            <div className="pc-bench-label"><b>{r.label} <strong>{r.fmt(r.plan)}</strong></b><span>{r.unit} · band {r.fmt(r.low)} to {r.fmt(r.high)}</span></div>
            <div className="pc-bench-track">
              <svg viewBox={`0 0 ${trackW} ${H}`} width={trackW} height={H} role="img" aria-label={`${r.label}: plan ${r.fmt(r.plan)}, band ${r.fmt(r.low)} to ${r.fmt(r.high)}`}>
                <line x1={pad} x2={trackW - pad} y1={18} y2={18} stroke={C.grid} strokeWidth={2} strokeLinecap="round" />
                <rect x={lx} y={10} width={Math.max(3, hx - lx)} height={16} rx={5} fill="var(--vw-color-emerald-100)" stroke="var(--vw-color-emerald-300)" {...on(bandTip)} />
                {r.typical && <line x1={X(r.typical)} x2={X(r.typical)} y1={8} y2={28} stroke="var(--vw-color-emerald-600)" strokeWidth={1.5} pointerEvents="none" />}
                <text x={labelAt(lx)} y={41} textAnchor={hx - lx < 70 ? 'end' : 'middle'} fontSize={10} fill={C.slate}>{r.fmt(r.low)}</text>
                <text x={labelAt(hx)} y={41} textAnchor={hx - lx < 70 ? 'start' : 'middle'} fontSize={10} fill={C.slate}>{r.fmt(r.high)}</text>
                {r.actual !== undefined && (
                  <g transform={`translate(${X(r.actual)},18) rotate(45)`} {...on({ title: 'Estate actual', rows: [[r.label, r.fmt(r.actual), C.violet], ['Basis', 'delivered programmes of this type']] })}>
                    <rect x={-5} y={-5} width={10} height={10} fill={C.violet} stroke={C.surface} strokeWidth={1.5} />
                  </g>
                )}
                <g transform={`translate(${px},18)`} {...on(planTip)}>
                  <circle r={7.5} fill={tone === 'success' ? C.blueDark : C.amber} stroke={C.surface} strokeWidth={2.5} />
                </g>
              </svg>
            </div>
            <Chip tone={tone} dot>{chip}</Chip>
          </div>
        );
      })}
      <ChartLegend items={[{ label: 'This plan', color: C.blueDark, kind: 'dot' }, ...(rows.some(r => r.actual !== undefined) ? [{ label: 'Estate actual', color: C.violet, kind: 'diamond' as const }] : []), { label: 'Benchmark band', color: 'var(--vw-color-emerald-200)' }, ...(rows.some(r => r.typical) ? [{ label: 'Typical', color: 'var(--vw-color-emerald-600)', kind: 'line' as const }] : [])]} />
      <ChartTip tip={tip} />
    </div>
  );
}
