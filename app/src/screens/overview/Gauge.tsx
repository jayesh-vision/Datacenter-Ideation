import { scoreColor } from '../../lib/vocab';

/* 270° arc gauge for a 0–100 index */
export function Gauge({ value, label, size = 164 }: { value: number; label: string; size?: number }) {
  const r = size / 2 - 12, cx = size / 2, cy = size / 2;
  const a0 = 135, sweep = 270;
  const pt = (deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  const arc = (from: number, to: number) => { const [x1, y1] = pt(from), [x2, y2] = pt(to); return `M${x1},${y1} A${r},${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2},${y2}`; };
  const v = Math.max(0, Math.min(100, value));
  const c = scoreColor(v);
  return (
    <svg width={size} height={size * 0.86} viewBox={`0 0 ${size} ${size * 0.86}`} role="img" aria-label={`${label} ${value} of 100`}>
      <path d={arc(a0, a0 + sweep)} fill="none" stroke="#EEF1F5" strokeWidth={12} strokeLinecap="round" />
      {v > 0 && <path d={arc(a0, a0 + (sweep * v) / 100)} fill="none" stroke={c} strokeWidth={12} strokeLinecap="round" />}
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={34} fontWeight={600} fill="#0F172A" fontFamily="Inter, system-ui">{value}</text>
      <text x={cx} y={cy + 26} textAnchor="middle" fontSize={12.5} fontWeight={500} fill={c} fontFamily="Poppins, system-ui">{label}</text>
    </svg>
  );
}
