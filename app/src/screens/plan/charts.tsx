import { useState } from 'react';
import { AXIS_TEXT, AXIS_TEXT_CURRENT, TARGET_TEXT, useSize } from '../../charts/core';

/* 270° arc gauge, coloured by threshold (green < 75, amber < 85, red ≥ 85) */
export function Gauge({ pct, size = 140, label }: { pct: number; size?: number; label?: string }) {
  const r = size / 2 - 10, cx = size / 2, cy = size / 2;
  const start = 135, sweep = 270;
  const p = Math.max(0, Math.min(100, pct));
  const pt = (deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  const arc = (from: number, to: number) => { const [x1, y1] = pt(from), [x2, y2] = pt(to); return `M${x1},${y1} A${r},${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2},${y2}`; };
  const color = p >= 85 ? 'var(--vw-color-red-500)' : p >= 75 ? 'var(--vw-color-amber-500)' : 'var(--vw-color-emerald-500)';
  return (
    <svg width={size} height={size * 0.86} viewBox={`0 0 ${size} ${size * 0.86}`} role="img" aria-label={`${Math.round(p)}%`}>
      <path d={arc(start, start + sweep)} fill="none" stroke="var(--vw-color-slate-100)" strokeWidth={11} strokeLinecap="round" />
      {p > 0 && <path d={arc(start, start + (sweep * p) / 100)} fill="none" stroke={color} strokeWidth={11} strokeLinecap="round" />}
      <text x={cx} y={cy + 4} textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif', fontSize: 26, fontWeight: 600, fill: 'var(--vw-color-slate-900)' }}>{Math.round(p)}%</text>
      {label && <text x={cx} y={cy + 24} textAnchor="middle" style={{ fontFamily: 'Poppins, sans-serif', fontSize: 11, fill: 'var(--vw-color-slate-500)' }}>{label}</text>}
    </svg>
  );
}

/* history (solid) + forecast (dashed) with a "now" rule and warning/critical
   threshold lines; values are percentages */
export function ForecastChart({ labels, history, forecast, nowIndex, warn = 85, crit = 95, height = 260, unitLabel = '%' }: {
  labels: string[]; history: (number | null)[]; forecast: (number | null)[]; nowIndex: number; warn?: number; crit?: number; height?: number; unitLabel?: string;
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const w = size.width;
  const m = { t: 16, r: 92, b: 28, l: 44 };
  const cw = Math.max(10, w - m.l - m.r), ch = height - m.t - m.b;
  const all = [...history, ...forecast].filter((v): v is number => v !== null);
  const step = Math.max(100, ...all) - Math.min(...all) > 60 ? 20 : 10;
  const top = Math.ceil(Math.max(100, ...all, crit) / step) * step;
  const lo = Math.max(0, Math.floor((Math.min(...all) - 5) / step) * step);
  const x = (i: number) => m.l + (labels.length > 1 ? (i / (labels.length - 1)) * cw : cw / 2);
  const y = (v: number) => m.t + ch - ((v - lo) / (top - lo)) * ch;
  const path = (vs: (number | null)[]) => vs.map((v, i) => (v === null ? '' : `${vs.slice(0, i).some(z => z !== null) ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join('');
  const ticks = Array.from({ length: Math.round((top - lo) / step) + 1 }, (_, i) => lo + step * i);
  const every = Math.max(1, Math.ceil(labels.length / 9));
  return (
    <div ref={ref} className="ch-frame" style={{ minHeight: height, position: 'relative' }}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label="Utilisation history and forecast" onMouseLeave={() => setHover(null)}
          onMouseMove={e => { const bx = e.currentTarget.getBoundingClientRect().left; const i = Math.round(((e.clientX - bx - m.l) / cw) * (labels.length - 1)); setHover(i >= 0 && i < labels.length ? i : null); }}>
          {ticks.map(t => <g key={t}><line x1={m.l} x2={m.l + cw} y1={y(t)} y2={y(t)} stroke="#F1F3F6" /><text x={m.l - 8} y={y(t) + 4} textAnchor="end" {...AXIS_TEXT}>{Math.round(t)}{unitLabel}</text></g>)}
          {[{ v: crit, c: 'var(--vw-color-red-500)', l: `Critical ${crit}%` }, { v: warn, c: 'var(--vw-color-amber-500)', l: `Warning ${warn}%` }].map(t => (
            <g key={t.l}><line x1={m.l} x2={m.l + cw} y1={y(t.v)} y2={y(t.v)} stroke={t.c} strokeDasharray="6 5" strokeWidth={1.4} /><text x={m.l + cw + 6} y={y(t.v) + 4} style={{ ...TARGET_TEXT, fill: t.c, stroke: 'none' }} fontWeight={600}>{t.l}</text></g>
          ))}
          <line x1={x(nowIndex)} x2={x(nowIndex)} y1={m.t} y2={m.t + ch} stroke="#CBD5E1" strokeDasharray="3 3" />
          <text x={x(nowIndex)} y={m.t - 4} textAnchor="middle" {...AXIS_TEXT}>now</text>
          <path d={path(history)} fill="none" stroke="var(--primaryColor500)" strokeWidth={2.2} strokeLinejoin="round" />
          <path d={path(forecast)} fill="none" stroke="var(--vw-color-purple-500)" strokeWidth={2.2} strokeDasharray="7 5" strokeLinejoin="round" />
          {history.map((v, i) => v !== null && <circle key={`h${i}`} cx={x(i)} cy={y(v)} r={hover === i ? 4.5 : 3} fill="var(--primaryColor500)" />)}
          {forecast.map((v, i) => v !== null && i > nowIndex && <circle key={`f${i}`} cx={x(i)} cy={y(v)} r={hover === i ? 4.5 : 3} fill="var(--vw-color-purple-500)" />)}
          {labels.map((l, i) => (i % every === 0 || i === labels.length - 1) && <text key={l + i} x={x(i)} y={height - 8} textAnchor="middle" {...(i === nowIndex ? AXIS_TEXT_CURRENT : AXIS_TEXT)}>{l}</text>)}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ch} stroke="#94A3B8" />}
        </svg>
      )}
      {hover !== null && w > 0 && (
        <div className="ch-tip" style={{ left: Math.min(x(hover) + 12, w - 200), top: 10 }}>
          <div className="ch-tip-title">{labels[hover]}</div>
          {history[hover] !== null && <div className="ch-tip-row"><i style={{ background: 'var(--primaryColor500)' }} /><span>Actual</span><b>{history[hover]}%</b></div>}
          {forecast[hover] !== null && hover >= nowIndex && <div className="ch-tip-row"><i className="is-dashed" style={{ borderColor: 'var(--vw-color-purple-500)' }} /><span>Forecast</span><b>{forecast[hover]}%</b></div>}
        </div>
      )}
    </div>
  );
}
