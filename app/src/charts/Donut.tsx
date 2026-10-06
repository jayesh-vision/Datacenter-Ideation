import { useState } from 'react';
import { DONUT_LABEL, DONUT_VALUE } from './core';
import { fmtNum } from '../lib/format';

export interface Slice { key: string; label: string; value: number; color: string }

export function Donut({ slices, centerValue, centerLabel, size = 168, format = (v: number) => fmtNum(v) }: {
  slices: Slice[]; centerValue?: string; centerLabel?: string; size?: number; format?: (v: number) => string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((t, s) => t + s.value, 0);
  const stroke = 22;
  const r = size / 2 - stroke / 2 - 2;
  const c = 2 * Math.PI * r;
  const gap = total > 0 && slices.filter(s => s.value > 0).length > 1 ? 2 : 0;
  let acc = 0;
  const active = slices.find(s => s.key === hover);

  return (
    <div className="dn">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={slices.map(s => `${s.label} ${s.value}`).join(', ')}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F1F3F6" strokeWidth={stroke} />
        {total > 0 && slices.map(s => {
          if (!s.value) return null;
          const len = (s.value / total) * c;
          const el = (
            <circle key={s.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color}
              strokeWidth={hover === s.key ? stroke + 4 : stroke}
              strokeDasharray={`${Math.max(0.5, len - gap)} ${c - Math.max(0.5, len - gap)}`} strokeDashoffset={-acc}
              transform={`rotate(-90 ${size / 2} ${size / 2})`} opacity={hover && hover !== s.key ? 0.45 : 1}
              onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)} style={{ transition: 'opacity 120ms' }} />
          );
          acc += len;
          return el;
        })}
        <text x="50%" y="48%" textAnchor="middle" className="dn-value" {...DONUT_VALUE}>{active ? format(active.value) : centerValue ?? format(total)}</text>
        <text x="50%" y="62%" textAnchor="middle" className="dn-label" {...DONUT_LABEL}>{active ? active.label : centerLabel ?? 'total'}</text>
      </svg>
      <table className="dn-legend">
        <tbody>
          {slices.map(s => (
            <tr key={s.key} onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)} className={hover === s.key ? 'is-hover' : ''}>
              <td><i style={{ background: s.color }} />{s.label}</td>
              <td className="num">{format(s.value)}</td>
              <td className="num dn-pct">{total ? `${Math.round((s.value / total) * 100)}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
