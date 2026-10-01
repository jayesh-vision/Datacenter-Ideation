import { useState } from 'react';
import { AXIS_TEXT, TARGET_TEXT, Legend, useSize } from '../../charts/core';
import { CRIT, WARN, project } from '../../lib/forecast';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* 6 months of actual peaks + a compound-growth forecast, with the 85% warning
   and 95% critical lines (DC-INV-011 / DC-NET-005). */
export function ForecastChart({ history, growth, now, ahead = 9, height = 280 }: { history: number[]; growth: number; now: number; ahead?: number; height?: number }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const w = size.width;
  const raw = project(history[history.length - 1], growth, ahead).slice(1);
  /* stop the forecast once it passes full capacity — beyond 100% it means nothing */
  const cut = raw.findIndex(v => v >= 100);
  const fc = cut < 0 ? raw : raw.slice(0, cut + 1).map(v => Math.min(100, v));
  const n = history.length + raw.length;
  const d = new Date(now);
  const label = (i: number) => { const m = (d.getMonth() - (history.length - 1) + i + 120) % 12; return MON[m]; };
  const full = (i: number) => { const t = new Date(d.getFullYear(), d.getMonth() - (history.length - 1) + i, 1); return `${MON[t.getMonth()]} ${t.getFullYear()}`; };
  const all = [...history, ...fc];
  const over = cut >= 0;
  const lo = Math.max(0, Math.floor((Math.min(...all) - 10) / 20) * 20);
  const hi = 100;
  const m = { t: 14, r: 92, b: 28, l: 40 };
  const cw = Math.max(10, w - m.l - m.r), ch = height - m.t - m.b;
  const x = (i: number) => m.l + (i / (n - 1)) * cw;
  const y = (v: number) => m.t + ch - ((Math.min(v, hi) - lo) / (hi - lo)) * ch;
  const hp = history.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const fp = [history[history.length - 1], ...fc].map((v, i) => `${i ? 'L' : 'M'}${x(history.length - 1 + i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const step = hi - lo > 50 ? 20 : 10;
  const ticks = Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => hi - i * step).filter(t => t >= lo);
  const nowX = x(history.length - 1);
  return (
    <div className="ch-wrap">
      <div ref={ref} className="ch-frame" style={{ minHeight: height }}>
        {w > 0 && (
          <svg width={w} height={height} onMouseLeave={() => setHover(null)} onMouseMove={e => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const i = Math.round(((e.clientX - r.left - m.l) / cw) * (n - 1)); setHover(i >= 0 && i < n ? i : null); }}>
            {ticks.map(t => <g key={t}><line x1={m.l} x2={m.l + cw} y1={y(t)} y2={y(t)} stroke="#F1F3F6" /><text x={m.l - 8} y={y(t) + 4} textAnchor="end" {...AXIS_TEXT}>{t}%</text></g>)}
            <rect x={nowX} y={m.t} width={m.l + cw - nowX} height={ch} fill="#F8FAFC" />
            <line x1={m.l} x2={m.l + cw} y1={y(CRIT)} y2={y(CRIT)} stroke="#DC2626" strokeDasharray="6 5" strokeWidth={1.5} />
            <text x={m.l + cw + 6} y={y(CRIT) + 4} {...TARGET_TEXT} fill="#DC2626">Critical {CRIT}%</text>
            <line x1={m.l} x2={m.l + cw} y1={y(WARN)} y2={y(WARN)} stroke="#D97706" strokeDasharray="6 5" strokeWidth={1.5} />
            <text x={m.l + cw + 6} y={y(WARN) + 4} {...TARGET_TEXT} fill="#B45309">Warning {WARN}%</text>
            <line x1={nowX} x2={nowX} y1={m.t} y2={m.t + ch} stroke="#CBD5E1" strokeDasharray="3 3" />
            <text x={nowX + 4} y={m.t + 10} {...AXIS_TEXT}>now</text>
            <path d={hp} fill="none" stroke="#1C81EF" strokeWidth={2.25} strokeLinejoin="round" />
            <path d={fp} fill="none" stroke="#D97706" strokeWidth={2.25} strokeDasharray="7 5" />
            {history.map((v, i) => <circle key={`h${i}`} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 3.5} fill="#1C81EF" />)}
            {fc.map((v, i) => <circle key={`f${i}`} cx={x(history.length + i)} cy={y(v)} r={hover === history.length + i ? 5 : 3} fill="#D97706" />)}
            {Array.from({ length: n }, (_, i) => <text key={i} x={x(i)} y={height - 8} textAnchor="middle" {...AXIS_TEXT} fill={i === history.length - 1 ? '#334155' : AXIS_TEXT.fill}>{label(i)}</text>)}
            {over && <text x={x(history.length + cut)} y={y(100) - 6} textAnchor="middle" {...TARGET_TEXT} fill="#DC2626">100% · {full(history.length + cut)}</text>}
            {hover !== null && hover < all.length && <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ch} stroke="#94A3B8" />}
          </svg>
        )}
        {hover !== null && hover < all.length && w > 0 && (
          <div className="ch-tip" style={{ left: Math.min(x(hover) + 12, w - 180), top: 10 }}>
            <div className="ch-tip-title">{full(hover)}</div>
            <div className="ch-tip-row"><i style={{ background: hover < history.length ? '#1C81EF' : '#D97706' }} /><span>{hover < history.length ? 'Actual peak' : 'Forecast'}</span><b>{all[hover]}%</b></div>
          </div>
        )}
      </div>
      <Legend items={[{ label: 'Bandwidth (actual)', color: '#1C81EF', shape: 'line' }, { label: 'Bandwidth (forecast)', color: '#D97706', shape: 'line', dashed: true }, { label: `Warning ${WARN}%`, color: '#D97706', shape: 'line', dashed: true }, { label: `Critical ${CRIT}%`, color: '#DC2626', shape: 'line', dashed: true }]} />
    </div>
  );
}
