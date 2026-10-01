export function Sparkline({ values, color = '#1C81EF', height = 32, target }: { values: number[]; color?: string; height?: number; target?: number }) {
  const clean = values.map(v => (Number.isFinite(v) ? v : null));
  const nums = clean.filter((v): v is number => v !== null).concat(target !== undefined ? [target] : []);
  if (nums.length < 2) return <div style={{ height }} />;
  const w = 120;
  const min = Math.min(...nums), max = Math.max(...nums);
  const pad = (max - min) * 0.15 || 1;
  const y = (v: number) => height - 3 - ((v - (min - pad)) / (max - min + 2 * pad)) * (height - 6);
  const x = (i: number) => (i / (clean.length - 1)) * (w - 4) + 2;
  let d = '';
  clean.forEach((v, i) => { if (v !== null) d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
  const lastI = clean.length - 1 - [...clean].reverse().findIndex(v => v !== null);
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" width="100%" height={height} aria-hidden="true">
      {target !== undefined && <line x1={0} x2={w} y1={y(target)} y2={y(target)} stroke="#CBD5E1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      <path d={`${d} L${x(lastI)},${height} L${x(clean.findIndex(v => v !== null))},${height} Z`} fill={color} opacity={0.08} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
