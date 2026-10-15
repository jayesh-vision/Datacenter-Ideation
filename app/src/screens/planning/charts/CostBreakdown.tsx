/* CapEx / OpEx breakdown: the total and its per-kW figures, a 100% bar, a donut and the lines with amount and share, with a
   CapEx / OpEx (and savings, when the plan has them) switch. Hovering a line, a bar segment or a slice highlights it in all three.
   Ported from P2B charts/CostBreakdownChart, drawn as plain SVG on the drawings' tokens; the donut sits beside the lines when there
   is room and above them in a narrow panel. */
import { useState } from 'react';
import type { Evaluation, EstimateLine } from '../../../planner/lib/engine';
import { Seg } from '../../../ui/kit';
import { money, SOURCE_LABEL } from '../common';
import { C, SERIES, arcPath, clip, useTip, useWidth, type TipContent } from './chartKit';
import { ChartEmpty, ChartTip } from './ChartTip';

type Mode = 'capex' | 'opex' | 'benefit';
interface Part { key: string; label: string; amount: number; share: number; color: string; lines: EstimateLine[] }
const MAX_PARTS = 7;

export function CostBreakdownChart({ ev, initial = 'capex' }: { ev: Evaluation; initial?: 'capex' | 'opex' }) {
  const [ref, width] = useWidth(720);
  const { tip, on, hide } = useTip();
  const [mode, setMode] = useState<Mode>(initial);
  const [hot, setHot] = useState<string | null>(null);
  const est = ev.estimate;
  const benefits = (est.benefitLines ?? []).filter(l => l.amount > 0);
  const lines = (mode === 'capex' ? est.capex : mode === 'opex' ? est.opex : benefits).filter(l => l.amount > 0);
  const total = lines.reduce((a, l) => a + l.amount, 0);
  const sorted = [...lines].sort((a, b) => b.amount - a.amount);
  const head = sorted.length > MAX_PARTS ? sorted.slice(0, MAX_PARTS - 1) : sorted, rest = sorted.slice(head.length);
  const parts: Part[] = head.map((l, i) => ({ key: l.item, label: l.item, amount: l.amount, share: l.amount / (total || 1), color: SERIES[i % SERIES.length], lines: [l] }));
  if (rest.length) { const a = rest.reduce((s, l) => s + l.amount, 0); parts.push({ key: '__other', label: `Other (${rest.length} lines)`, amount: a, share: a / (total || 1), color: 'var(--vw-color-slate-300)', lines: rest }); }
  const suffix = mode === 'opex' ? ' / mo' : mode === 'benefit' ? ' / yr' : '';
  const pct = (s: number) => `${s >= 0.095 ? Math.round(s * 100) : (s * 100).toFixed(1)}%`;
  const tipFor = (p: Part): TipContent => p.lines.length === 1
    ? { title: p.label, rows: [['Amount', `${money(p.amount)}${suffix}`, p.color], ['Share', pct(p.share)], ['Source', SOURCE_LABEL[p.lines[0].source] ?? p.lines[0].source]], note: p.lines[0].basis ? clip(p.lines[0].basis, 160) : undefined }
    : { title: p.label, rows: [['Amount', `${money(p.amount)}${suffix}`, p.color], ['Share', pct(p.share)], ...p.lines.slice(0, 6).map(l => [clip(l.item, 30), `${money(l.amount)}${suffix}`] as [string, string])] };

  const w = Math.max(280, width), narrow = w < 600;
  const donut = narrow ? Math.min(176, w - 40) : Math.min(196, Math.max(150, w * 0.2));
  const listW = narrow ? w : w - donut - 28;
  // two columns only when each keeps room for a long line name next to its amount ("Maintenance and service contracts")
  const two = listW >= 760 && parts.length > 3;
  const barH = 26;
  const R1 = donut / 2 - 4, R0 = R1 - Math.max(18, donut * 0.13);
  let acc = 0;
  const slices = parts.map(p => { const a0 = acc * Math.PI * 2; acc += p.share; return { p, a0, a1: acc * Math.PI * 2 }; });
  let off = 0;
  const segs = parts.map(p => { const x = off * listW; off += p.share; return { p, x, w: p.share * listW }; });
  const opts: { id: Mode; label: string }[] = [{ id: 'capex', label: 'CapEx' }, { id: 'opex', label: 'OpEx per month' }, ...(benefits.length ? [{ id: 'benefit' as const, label: 'Savings per year' }] : [])];
  const figs = mode === 'capex'
    ? [est.capexPerKw ? `${money(est.capexPerKw)} per kW` : '', est.capexPerRack ? `${money(est.capexPerRack)} per rack` : ''].filter(Boolean)
    : mode === 'opex' ? [`${money(est.opexAnnual)} a year`, est.costPerKwMonth ? `${money(est.costPerKwMonth)} per kW-month` : ''].filter(Boolean)
      : [`${benefits.length} line${benefits.length === 1 ? '' : 's'}`];
  const fade = (k: string) => (hot && hot !== k ? 0.35 : 1);

  return (
    <div ref={ref} className="pc-draw">
      <div className="pc-head">
        <div className="pc-head-figs"><b>{money(total)}{suffix}</b><span>{mode === 'capex' ? 'total CapEx' : mode === 'opex' ? 'OpEx' : 'savings and benefits'}</span>{figs.map(f => <span key={f}>{f}</span>)}</div>
        {opts.length > 1 && <Seg size="sm" options={opts} value={mode} onChange={v => { setMode(v); setHot(null); }} />}
      </div>
      {!parts.length || total <= 0 ? (
        <ChartEmpty title={mode === 'capex' ? 'No CapEx lines' : mode === 'opex' ? 'No OpEx lines' : 'No savings lines'} hint="Enter the design load and scope; the estimate fills in from benchmarks and estate actuals." />
      ) : (
        <div className={`pc-cost${narrow ? ' is-narrow' : ''}`}>
          <div style={{ minWidth: 0 }}>
            <svg viewBox={`0 0 ${listW} ${barH + 4}`} width={listW} height={barH + 4} role="img" aria-label={`${mode === 'capex' ? 'CapEx' : mode === 'opex' ? 'OpEx' : 'Savings'} by line`}>
              {segs.map(({ p, x, w: sw }) => (
                <g key={p.key} {...on(tipFor(p))} onMouseEnter={() => setHot(p.key)} onMouseOut={() => setHot(null)}>
                  <rect x={x} y={hot === p.key ? 0 : 2} width={Math.max(0, sw - 1.5)} height={hot === p.key ? barH + 4 : barH} rx={3} fill={p.color} opacity={fade(p.key)} />
                  {sw > 40 && <text x={x + sw / 2} y={barH / 2 + 2} dy="0.35em" textAnchor="middle" fontSize={10.5} fontWeight={600} fill={p.key === '__other' || p.color === C.skyLight ? C.slateDark : C.surface} pointerEvents="none">{Math.round(p.share * 100)}%</text>}
                </g>
              ))}
            </svg>
            <div className={`pc-lines${two ? ' is-two' : ''}`}>
              {parts.map(p => (
                <div key={p.key} className={`pc-line${hot === p.key ? ' is-hot' : ''}`} onMouseEnter={() => setHot(p.key)} onMouseMove={on(tipFor(p)).onMouseMove} onMouseLeave={() => { setHot(null); hide(); }}>
                  <i style={{ background: p.color }} /><span>{p.label}</span><b>{money(p.amount)}{suffix}</b><em>{pct(p.share)}</em>
                </div>
              ))}
            </div>
          </div>
          <svg className="pc-donut" viewBox={`0 0 ${donut} ${donut}`} width={donut} height={donut} role="img" aria-label="Share of the total by line">
            <g transform={`translate(${donut / 2},${donut / 2})`}>
              {slices.map(({ p, a0, a1 }) => {
                const pad = parts.length > 1 ? Math.min(0.012, (a1 - a0) / 4) : 0;
                return <path key={p.key} d={arcPath(hot === p.key ? R0 - 2 : R0, hot === p.key ? R1 + 3 : R1, a0 + pad, a1 - pad)} fill={p.color} opacity={fade(p.key)} {...on(tipFor(p))} onMouseEnter={() => setHot(p.key)} onMouseOut={() => setHot(null)} />;
              })}
              <text textAnchor="middle" dy="-0.15em" fontSize={Math.max(13, donut * 0.09)} fontWeight={600} fill={C.ink}>{money(total)}</text>
              <text textAnchor="middle" dy="1.25em" fontSize={10.5} fill={C.slate}>{mode === 'capex' ? 'CapEx' : mode === 'opex' ? 'per month' : 'per year'}</text>
            </g>
          </svg>
        </div>
      )}
      <ChartTip tip={tip} />
    </div>
  );
}
