/* In-site drawings: the real hall grid with the plan's positions, and a rack elevation from its U map (DCIM). NST tokens only. */
import type * as T from '../../../../planner/p2b/types';
import type { HallGrid } from '../../../../planner/lib/placement';
import type { RackBaseline } from '../../../../planner/lib/site';

const C = {
  surface: 'var(--vw-color-white)', ink: 'var(--vw-color-slate-900)', slate: 'var(--vw-color-slate-500)', line: 'var(--vw-color-slate-400)',
  live: 'var(--vw-color-slate-300)', empty: 'var(--vw-color-blue-100)', retired: 'var(--vw-color-slate-200)', held: 'var(--vw-color-amber-300)', plan: 'var(--vw-color-emerald-500)',
};

export interface GridMark { gridX: number; gridY: number }
/** Top-down hall grid: every position from DCIM, coloured by state, with the plan's positions on top. */
export function HallGridView({ grid, marks = [], markLabel = 'This plan', positions, title }: { grid?: HallGrid; marks?: GridMark[]; markLabel?: string; positions?: GridMark[]; title?: string }) {
  const src = positions ?? marks;
  const cols = grid?.cols ?? Math.max(1, ...src.map(m => m.gridX + 1));
  const rows = grid?.rows ?? Math.max(1, ...src.map(m => m.gridY + 1));
  const cw = 24, ch = 32, gap = 4, aisle = 14, left = 70, top = 8;
  const y0 = (y: number) => top + y * (ch + gap) + Math.ceil(y / 2) * aisle;
  const width = left + cols * (cw + gap) + 8, height = y0(rows) + 6;
  const marked = new Set(marks.map(m => `${m.gridX}:${m.gridY}`));
  const fill: Record<string, string> = { free: C.surface, 'empty-rack': C.empty, occupied: C.live, retired: C.retired, held: C.held };
  const label: Record<string, string> = { free: 'Free position', 'empty-rack': 'Empty cabinet (free)', occupied: 'Live rack', retired: 'Retired cabinet', held: 'Held by another plan' };
  return (
    <div className="pn-draw">
      {title && <div className="pn-draw-title">{title}</div>}
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width }} role="img" aria-label="Hall grid">
        {Array.from({ length: rows }, (_, y) => (
          <g key={y}>
            <text x={4} y={y0(y) + ch / 2 + 4} fontSize={11} fill={C.slate}>{grid?.rowByY.get(y)?.name ?? `Line ${y + 1}`}</text>
            {Array.from({ length: cols }, (__, x) => {
              const cell = grid?.cells[y]?.[x];
              const state = cell?.state ?? 'free';
              const on = marked.has(`${x}:${y}`);
              return (
                <rect key={x} x={left + x * (cw + gap)} y={y0(y)} width={cw} height={ch} rx={3} fill={on ? C.plan : fill[state]} stroke={on ? C.ink : C.line} strokeWidth={on ? 1.4 : 0.6} opacity={state === 'retired' && !on ? 0.6 : 1}>
                  <title>{`${grid?.rowByY.get(y)?.name ?? `Line ${y + 1}`}, position ${x + 1}: ${on ? `${markLabel} · ` : ''}${label[state]}${cell?.rack ? ` · ${cell.rack.name} ${cell.rack.currentPowerKw} of ${cell.rack.maxPowerKw} kW` : ''}`}</title>
                </rect>
              );
            })}
          </g>
        ))}
      </svg>
      <div className="pn-legend2">
        <span><i style={{ background: C.plan, borderColor: C.plan }} />{markLabel}</span>
        <span><i style={{ background: C.live }} />Live rack</span>
        <span><i style={{ background: C.empty }} />Empty cabinet</span>
        <span><i style={{ background: C.surface }} />Free position</span>
        <span><i style={{ background: C.held }} />Held by another plan</span>
        <span>Rows are drawn in facing pairs around their aisles.</span>
      </div>
    </div>
  );
}

/** Rack elevation from DCIM: devices at their U, units held by rack reservations, and the plan's block. */
export function RackElevation({ rb, block, label = 'This plan', height = 360 }: { rb: RackBaseline; block?: { start: number; end: number }; label?: string; height?: number }) {
  const H = rb.rack.heightU || 42; const uh = Math.max(5, Math.min(9, (height - 30) / H)); const w = 180, left = 30, top = 6;
  const yOf = (u: number) => top + (H - u) * uh;
  const devs = rb.devices.filter(d => d.position && d.category !== 'PDU') as (T.Device & { position: number })[];
  const reservedOnly = [...rb.usedUnits].filter(u => !devs.some(d => u >= d.position && u < d.position + Math.max(1, d.heightU ?? 1)));
  const W = left + w + 8, HH = top + H * uh + 8;
  return (
    <div className="pn-draw" style={{ width: W }}>
      <div className="pn-draw-title">{rb.rack.name} · {H}U · {rb.hall?.name ?? ''} {rb.row?.name ?? ''}</div>
      <svg viewBox={`0 0 ${W} ${HH}`} width={W} height={HH} role="img" aria-label={`Elevation of ${rb.rack.name}`}>
        <rect x={left} y={top} width={w} height={H * uh} fill={C.surface} stroke={C.line} strokeWidth={1} />
        {Array.from({ length: H }, (_, i) => i + 1).filter(u => u % 5 === 0 || u === 1).map(u => <text key={u} x={left - 4} y={yOf(u) + uh - 1} fontSize={9} textAnchor="end" fill={C.slate}>{u}</text>)}
        {reservedOnly.map(u => <rect key={`r${u}`} x={left + 1} y={yOf(u)} width={w - 2} height={uh} fill={C.held} opacity={0.6}><title>{`U${u}: held by a rack reservation`}</title></rect>)}
        {devs.map(d => { const hU = Math.max(1, d.heightU ?? 1); return (
          <g key={d.id}><rect x={left + 1} y={yOf(d.position + hU - 1)} width={w - 2} height={hU * uh - 0.5} fill={C.live} stroke={C.slate} strokeWidth={0.5}><title>{`U${d.position}${hU > 1 ? `–U${d.position + hU - 1}` : ''}: ${d.name} (${d.model ?? d.category})`}</title></rect>
            {hU * uh >= 9 && <text x={left + 5} y={yOf(d.position + hU - 1) + Math.min(hU * uh, 12) - 3} fontSize={8} fill={C.ink}>{d.name.slice(0, 28)}</text>}</g>
        ); })}
        {block && <rect x={left + 1} y={yOf(block.end)} width={w - 2} height={(block.end - block.start + 1) * uh} fill={C.plan} opacity={0.85}><title>{`U${block.start}–U${block.end}: ${label}`}</title></rect>}
        {block && <text x={left + 6} y={yOf(block.end) + 11} fontSize={10} fontWeight={600} fill={C.surface}>{label} U{block.start}–U{block.end}</text>}
      </svg>
      <div className="pn-legend2"><span><i style={{ background: C.live }} />Devices</span><span><i style={{ background: C.held }} />Reserved</span><span><i style={{ background: C.plan }} />{label}</span></div>
    </div>
  );
}
