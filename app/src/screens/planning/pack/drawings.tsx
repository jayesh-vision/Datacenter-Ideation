/* The schematic drawings of the plan pack, each built from the plan's sizing (ported from P2B's planner charts, redrawn on NST
   tokens, no d3): building and floor plan, typical hall layout, electrical single-line, network topology, phasing ladder, lead times.
   Every drawing measures its container and lays itself out for that width (the single-line turns vertical in a narrow panel, the
   topology draws fewer nodes); hover a shape for its figures in the floating ChartTip. Not to scale. */
import { useEffect, useId, useRef, useState } from 'react';
import type { LadderRow, PlantItem, ScheduleItem, Sizing } from '../../../planner/lib/engine';
import { fmtKw } from '../../../planner/lib/engine';
import { clockMs } from '../../../planner/compat/clock';
import { Chip } from '../../../ui/kit';
import { date, num } from '../common';
import { C, clip, textW, useTip, useWidth, weeksBetween, type TipContent, type TipRow } from '../charts/chartKit';
import { ChartLegend, ChartTip, type LegendItem } from '../charts/ChartTip';

export function Legend({ items }: { items: LegendItem[] }) { return <ChartLegend items={items} />; }
export const DrawEmpty = ({ title, hint }: { title: string; hint?: string }) => <div className="pc-empty"><b>{title}</b>{hint && <span>{hint}</span>}</div>;
/** A label in one line of `one` characters, else two lines of `per` characters (word break; ellipsis on the second line only). */
function wrap2(s: string, one: number, per: number): string[] {
  if (s.length <= one) return [s];
  let cut = s.lastIndexOf(' ', per); if (cut < per * 0.5) cut = per;
  return [s.slice(0, cut).trimEnd(), clip(s.slice(cut).trim(), per)];
}
const tipOf = (title: string, rows: [string, string][], note?: string): TipContent => ({ title, rows: rows as TipRow[], note });
const MW = (kw: number) => (kw === 0 ? '0' : kw >= 1000 ? `${+(kw / 1000).toFixed(kw >= 10000 ? 0 : 1)} MW` : `${Math.round(kw)} kW`);
const M = 30.4 * 864e5;
const MON = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
const monYr = (t: number) => `${MON(t)} '${String(new Date(t).getUTCFullYear()).slice(2)}`;

/* ------------------------------------------------------------------ building and floor plan */
export function BuildingStack({ sizing: s, height = 240 }: { sizing: Sizing; height?: number }) {
  const [ref, width] = useWidth(720);
  const { tip, on } = useTip();
  const b = s.building;
  if (!s.halls || !s.buildings || !b.floorsPerBuilding || !b.hallsPerFloor) return <DrawEmpty title="No halls to place" hint="Set the IT capacity and the hall size to see the buildings." />;
  const w = Math.max(280, width);
  const shown = Math.min(s.buildings, Math.max(1, Math.floor((w - 30) / 110)), 6);
  const gap = 18, padL = 24, padR = 6, labelH = 18, plantH = 22;
  const bw = Math.max(80, (w - padL - padR - gap * (shown - 1)) / shown);
  const floorH = Math.max(14, Math.min(46, (height - labelH - plantH - 28) / b.floorsPerBuilding));
  const svgH = labelH + plantH + floorH * b.floorsPerBuilding + 24;
  let remaining = s.halls;
  return (
    <div ref={ref} className="pc-draw">
      <svg viewBox={`0 0 ${w} ${svgH}`} width={w} height={svgH} role="img" aria-label={`${s.buildings} buildings, ${b.floorsPerBuilding} floors each, ${b.hallsPerFloor} halls per floor`}>
        {Array.from({ length: shown }).map((_, bi) => {
          const x = padL + bi * (bw + gap), base = labelH + floorH * b.floorsPerBuilding;
          const inThis = Math.min(remaining, b.hallsPerBuilding); remaining -= inThis;
          const cellW = (bw - 4) / b.hallsPerFloor;
          return (
            <g key={bi}>
              <text x={x + bw / 2} y={12} textAnchor="middle" fontSize={11} fontWeight={600} fill={C.ink}>Building {bi + 1}</text>
              {Array.from({ length: b.floorsPerBuilding }).map((__, fi) => {
                const y = base - (fi + 1) * floorH;
                return (
                  <g key={fi}>
                    <rect x={x} y={y} width={bw} height={floorH} fill={C.surface} stroke={C.grid} />
                    {bi === 0 && <text x={x - 5} y={y + floorH / 2} dy="0.35em" textAnchor="end" fontSize={9.5} fill={C.slate}>F{fi + 1}</text>}
                    {Array.from({ length: b.hallsPerFloor }).map((___, hi) => {
                      const used = fi * b.hallsPerFloor + hi < inThis;
                      return <rect key={hi} x={x + 3 + hi * cellW} y={y + 3} width={Math.max(2, cellW - 2)} height={Math.max(2, floorH - 6)} rx={3} fill={used ? C.blue : 'transparent'} fillOpacity={used ? 0.85 : 1} stroke={used ? C.blue : C.slateLight} strokeDasharray={used ? undefined : '3 3'}
                        {...on(tipOf(`Building ${bi + 1} · floor ${fi + 1} · hall ${hi + 1}`, used ? [['Racks', num(b.racksPerHall)], ['White space', `${num(b.hallWhiteSpaceM2)} m²`]] : [['Status', 'spare slot for later growth']]))} />;
                    })}
                  </g>
                );
              })}
              <rect x={x} y={base} width={bw} height={plantH} fill={C.grid} opacity={0.7} />
              <text x={x + bw / 2} y={base + plantH / 2} dy="0.35em" textAnchor="middle" fontSize={9.5} fill={C.slateDark}>{bw > 110 ? 'Plant and support' : 'Plant'}</text>
              <text x={x + bw / 2} y={base + plantH + 14} textAnchor="middle" fontSize={10} fill={C.slate}>{inThis} of {b.hallsPerBuilding} halls</text>
            </g>
          );
        })}
      </svg>
      <ChartTip tip={tip} />
      {s.buildings > shown && <p className="pc-caption">Showing {shown} of {s.buildings} buildings; the rest repeat the same stack.</p>}
      <Legend items={[{ label: 'Data hall in this plan', color: C.blue }, { label: 'Spare hall slot', color: C.slateLight, kind: 'dash' }, { label: 'Plant and support level', color: C.grid }]} />
    </div>
  );
}

/* ------------------------------------------------------------------ typical data hall */
const MANIFOLD = 'var(--vw-color-sky-600)';
const RACK_W = 10, RACK_D = 18, AISLE_COLD = 16, AISLE_HOT = 12, WALL = 26, GAP = 8;
export function HallLayout({ sizing, densityKwPerRack, liquid, height = 260 }: { sizing: Sizing; densityKwPerRack: number; liquid: boolean; height?: number }) {
  const [ref, width] = useWidth();
  const { tip, on } = useTip();
  const halls = Math.max(0, sizing.halls);
  const racksPerHall = halls ? Math.ceil(sizing.racks / halls) : 0;
  if (!racksPerHall) return <DrawEmpty title="No hall to lay out" hint="Set a design load and density; rows, containment and cooling units follow from the sizing." />;
  const colour: Record<string, string> = { GPU: C.violet, Compute: C.blue, Storage: C.cyan };
  const w = Math.max(280, width);
  // Row length that makes the hall largest in this panel (6–24 racks a row), so a wide panel gets long rows, a narrow one more rows.
  const dims = (rl: number) => { const nr = Math.ceil(racksPerHall / rl); let h = WALL + GAP; for (let r = 0; r < nr; r++) h += RACK_D + (r % 2 === 0 ? AISLE_COLD : AISLE_HOT); return { cw: WALL + GAP + rl * RACK_W + GAP + WALL + 30, ch: h - (nr % 2 ? AISLE_COLD : AISLE_HOT) + GAP + WALL }; };
  const rowLen = Array.from({ length: 19 }, (_, i) => 6 + i).filter(rl => rl <= Math.max(6, racksPerHall)).reduce((best, rl) => { const d = dims(rl), b = dims(best); return Math.min(2.4, (w - 8) / d.cw, height / d.ch) > Math.min(2.4, (w - 8) / b.cw, height / b.ch) + 1e-6 ? rl : best; }, Math.min(24, Math.max(6, Math.ceil(Math.sqrt(racksPerHall * 1.8)))));
  const nRows = Math.ceil(racksPerHall / rowLen), pairs = Math.ceil(nRows / 2);
  const classes = ['GPU', 'Compute', 'Storage'].map(n => sizing.rackClasses.find(c => c.name === n)).filter((c): c is NonNullable<typeof c> => !!c);
  const totalClass = classes.reduce((a, c) => a + c.racks, 0) || 1;
  const classAt = (i: number) => { let acc = 0; for (const c of classes) { acc += (c.racks / totalClass) * racksPerHall; if (i < acc) return c; } return classes[classes.length - 1]; };
  const rowY: number[] = []; let yCur = WALL + GAP;
  for (let r = 0; r < nRows; r++) { rowY.push(yCur); yCur += RACK_D + (r % 2 === 0 ? AISLE_COLD : AISLE_HOT); }
  const contentH = rowY[nRows - 1] + RACK_D + GAP + WALL, contentW = WALL + GAP + rowLen * RACK_W + GAP + WALL + 30;
  const unitsPerHall = Math.max(1, Math.ceil(sizing.cooling.units / Math.max(1, halls)));
  const isLiquid = liquid || sizing.cooling.type === 'liquid-to-chip' || sizing.cooling.type === 'immersion';
  const unitLabel = isLiquid ? 'CDU' : sizing.cooling.type === 'in-row' ? 'IRC' : sizing.cooling.type === 'rear-door' ? 'RDHx' : 'CRAH';
  const sc = Math.min(2.4, (w - 8) / contentW, height / contentH);
  const svgH = Math.min(height, contentH * sc + 4);
  const offX = (w - contentW * sc) / 2, offY = (svgH - contentH * sc) / 2;
  const slots = Math.max(1, Math.ceil(unitsPerHall / 2));
  const step = (contentH - 2 * WALL - 2 * GAP) / slots;
  const unitH = Math.min(22, Math.max(8, step - 3));
  const pduW = Math.min(12, WALL - 10);
  const right = WALL + GAP + rowLen * RACK_W + GAP; // inner right wall
  // Coolant manifolds run along the back (hot-aisle side) of every row, fed by a header along the left wall from the CDUs.
  const manY = rowY.map((ry, r) => (r % 2 === 0 ? ry - 2.5 : ry + RACK_D + 2.5));
  const headerX = WALL + GAP - 4.5;
  const liquidRacks = sizing.rackClasses.filter(c => c.liquid).reduce((a, c) => a + c.racks, 0);
  return (
    <div ref={ref} className="pc-draw">
      <svg viewBox={`0 0 ${w} ${svgH}`} width={w} height={svgH} role="img" aria-label={`Typical hall: ${racksPerHall} racks in ${nRows} rows`}>
        <g transform={`translate(${offX},${offY}) scale(${sc})`}>
          <rect x={0} y={0} width={right + WALL} height={contentH} rx={3} fill={C.surface} stroke={C.slateDark} strokeWidth={1.5 / sc} />
          {Array.from({ length: pairs }, (_, k) => {
            const r0 = 2 * k, r1 = Math.min(nRows - 1, 2 * k + 1);
            const y0 = rowY[r0] - 2, y1 = (r1 > r0 ? rowY[r1] + RACK_D : rowY[r0] + RACK_D + AISLE_COLD) + 2;
            const x0 = WALL + GAP - 2, x1 = WALL + GAP + rowLen * RACK_W + 2;
            return <g key={k} {...on(tipOf(`Cold aisle ${k + 1}`, [['Rows', r1 > r0 ? `${r0 + 1} and ${r1 + 1}` : String(r0 + 1)], ['Containment', 'cold aisle, doors and roof']]))}><rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={2} fill={C.cyan} opacity={0.07} /><rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={2} fill="none" stroke={C.cyan} strokeWidth={1 / sc} strokeDasharray={`${4 / sc} ${2 / sc}`} /></g>;
          })}
          {isLiquid && (
            <g pointerEvents="visibleStroke" {...on(tipOf('Coolant manifolds', [['Rows served', String(nRows)], ['Liquid racks (all halls)', num(liquidRacks || sizing.racks)], ['Liquid heat', fmtKw(sizing.cooling.liquidKw)], ['Fed by', `${unitLabel} × ${unitsPerHall} per hall`]]))}>
              <line x1={headerX} x2={headerX} y1={Math.min(...manY)} y2={Math.max(...manY)} stroke={MANIFOLD} strokeWidth={2.4 / sc} strokeLinecap="round" />
              {manY.map((y, r) => <line key={r} x1={headerX} x2={right - GAP + 2} y1={y} y2={y} stroke={MANIFOLD} strokeWidth={1.8 / sc} strokeLinecap="round" />)}
            </g>
          )}
          {Array.from({ length: racksPerHall }, (_, i) => {
            const row = Math.floor(i / rowLen), col = i % rowLen, c = classAt(i);
            return <rect key={i} x={WALL + GAP + col * RACK_W + 0.6} y={rowY[row]} width={RACK_W - 1.2} height={RACK_D} rx={1} fill={colour[c?.name ?? 'Compute'] ?? C.slate} opacity={0.9}
              {...on(tipOf(`Rack ${i + 1} · row ${row + 1}`, [['Class', c?.name ?? 'Compute'], ['Design load', `${c?.kw ?? densityKwPerRack} kW`], ['Cooling', c?.liquid ? `liquid, ${c.capturePct}% captured` : c?.rearDoor ? 'rear door' : 'air']]))} />;
          })}
          {rowY.map((ry, r) => <g key={r} {...on(tipOf(`Row ${r + 1} PDUs`, [['Feeds', 'A (left) and B (right)'], ['Racks in row', String(Math.min(rowLen, racksPerHall - r * rowLen))]]))}><rect x={WALL - pduW - 1} y={ry + 2} width={pduW} height={RACK_D - 4} rx={1} fill={C.amber} /><rect x={right + 1} y={ry + 2} width={pduW} height={RACK_D - 4} rx={1} fill={C.amber} /></g>)}
          {Array.from({ length: unitsPerHall }, (_, i) => {
            const left = i % 2 === 0, slot = Math.floor(i / 2);
            const uy = WALL + GAP + slot * step + (step - unitH) / 2;
            return <rect key={i} x={left ? 2 : right + pduW + 4} y={uy} width={Math.max(6, WALL - pduW - 6)} height={unitH} rx={1.5} fill={isLiquid ? C.cyan : C.emerald} opacity={0.85}
              {...on(tipOf(`${unitLabel} ${i + 1}`, [['Capacity', fmtKw(sizing.cooling.unitKw)], ['Redundancy', sizing.cooling.redundancy], ['Type', sizing.cooling.type.replace(/-/g, ' ')]]))} />;
          })}
        </g>
      </svg>
      <ChartTip tip={tip} />
      <Legend items={[...classes.map(c => ({ label: `${c.name} ${c.sharePct}%`, color: colour[c.name] ?? C.slate })), { label: `${unitLabel} × ${unitsPerHall} per hall`, color: isLiquid ? C.cyan : C.emerald }, ...(isLiquid ? [{ label: 'Coolant manifold', color: MANIFOLD, kind: 'line' as const }] : []), { label: 'PDU A / B', color: C.amber }, { label: 'Cold-aisle containment', color: C.cyan, kind: 'dash' }]} />
      <p className="pc-caption">One of {halls} hall{halls === 1 ? '' : 's'} · {num(racksPerHall)} racks in {nRows} rows · {densityKwPerRack} kW per rack · {num(sizing.racks)} racks, {num(sizing.whiteSpaceM2)} m² in all</p>
    </div>
  );
}

/* ------------------------------------------------------------------ electrical single-line */
interface Box { id: string; x: number; y: number; w: number; h: number; title: string; sub: string; sub2?: string; color: string; dashed?: boolean; tip: TipContent }
interface Stage { key: string; box: (lane: number) => Omit<Box, 'id' | 'x' | 'y' | 'w' | 'h' | 'color'> }
const BH = 48;
/** Utility to IT load at the plan's redundancy, generators and the cooling lane. Stages with no data are left out (never "0 × 0 kW").
    Wide panels draw it left to right; narrow ones (or layout="tall") top to bottom so the text stays legible. */
export function SingleLine({ sizing, redundancy, height = 280, layout = 'auto' }: { sizing: Sizing; redundancy: string; height?: number; layout?: 'auto' | 'wide' | 'tall' }) {
  const [ref, width] = useWidth();
  const { tip, on } = useTip();
  if (!sizing.plant.some(x => x.kind === 'feed' || x.kind === 'ups') || sizing.itKw <= 0) return <DrawEmpty title="No site plant in this plan" hint="Power and heat rejection come from the existing site; the Rules tab shows what is free." />;
  const red = redundancy.toUpperCase().replace(/\s/g, ''), dual = red.startsWith('2N'), spare = red === 'N+1';
  const byKind = (k: PlantItem['kind']) => sizing.plant.filter(x => x.kind === k && x.count > 0);
  const feeds = byKind('feed'), tx = byKind('transformer'), ups = byKind('ups').filter(x => x.capacityKw > 0), gens = byKind('generator').filter(x => x.capacityKw > 0), pdus = byKind('pdu').filter(x => x.capacityKw > 0), cooling = [...byKind('cdu'), ...byKind('cooling')].filter(x => x.capacityKw > 0);
  const sum = (xs: PlantItem[]) => xs.reduce((a, x) => a + x.capacityKw * x.count, 0), cnt = (xs: PlantItem[]) => xs.reduce((a, x) => a + x.count, 0);
  const half = (n: number) => Math.max(1, Math.ceil(n / 2));
  const side = (i: number) => (dual ? ` · ${i ? 'B' : 'A'}` : '');
  const boardKw = sizing.facility?.facilityKw ?? sizing.itKw;
  const stages: Stage[] = [];
  if (feeds.length) stages.push({ key: 'feed', box: i => { const f = feeds[i] ?? feeds[0]; const mva = f.unitKva ? `${(f.unitKva / 1000).toFixed(1)} MVA` : fmtKw(f.capacityKw); return { title: f.name.split(' · ')[0], sub: `${mva} · ${f.redundancy}`, tip: tipOf(f.name, [['Capacity', mva], ['Redundancy', f.redundancy], ...(f.note ? [['Basis', f.note] as [string, string]] : [])]) }; } });
  else stages.push({ key: 'feed', box: () => ({ title: 'Existing site supply', sub: `${fmtKw(boardKw)} needed`, dashed: true, tip: tipOf('Existing site supply', [['Facility load', fmtKw(boardKw)], ['Source', 'the site intake; no new feed in this plan']]) }) });
  const txN = dual ? (tx[0]?.perPath ?? half(cnt(tx))) : cnt(tx);
  if (txN > 0 && tx[0]) stages.push({ key: 'tx', box: i => ({ title: `Transformer${txN === 1 ? '' : 's'}${side(i)}`, sub: `${txN} × ${tx[0].unitKva ? `${num(tx[0].unitKva)} kVA` : fmtKw(tx[0].capacityKw)}`, tip: tipOf(`Transformers${side(i)}`, [['Units on this path', String(txN)], ['Rating', tx[0].unitKva ? `${num(tx[0].unitKva)} kVA` : fmtKw(tx[0].capacityKw)], ['Redundancy', tx[0].redundancy]]) }) });
  stages.push({ key: 'sg', box: i => ({ title: `Switchgear${side(i)}`, sub: `${fmtKw(boardKw)} board`, tip: tipOf(`Main switchgear${side(i)}`, [['Rating', fmtKw(boardKw)], ['Redundancy', redundancy]]) }) });
  const upsN = dual ? Math.max(1, Math.round(cnt(ups) / 2)) : cnt(ups);
  if (ups[0] && upsN > 0) stages.push({ key: 'ups', box: i => ({ title: `${ups[0].name.split(' · ')[0]}${side(i)}`, sub: `${upsN} × ${fmtKw(ups[0].capacityKw)}`, tip: tipOf(`${ups[0].name}${side(i)}`, [['Modules', String(upsN)], ['Path capacity', fmtKw(sum(ups) / (dual ? 2 : 1))], ['Redundancy', ups[0].redundancy]]) }) });
  const pduN = dual ? half(cnt(pdus)) : cnt(pdus);
  if (pdus[0] && pduN > 0) stages.push({ key: 'pdu', box: i => ({ title: `${pdus[0].name.split(' · ')[0]}${side(i)}`, sub: `${pduN} × ${fmtKw(pdus[0].capacityKw)}`, tip: tipOf(`${pdus[0].name}${side(i)}`, [['Units', String(pduN)], ['Redundancy', pdus[0].redundancy]]) }) });
  const sgIdx = stages.findIndex(s => s.key === 'sg'), upsIdx = stages.findIndex(s => s.key === 'ups');
  const coolSpecs: Omit<Box, 'x' | 'y' | 'w' | 'h'>[] = [];
  const hr = sizing.cooling.heatRejection;
  if (cooling[0]) {
    if (hr?.coolers?.units) coolSpecs.push({ id: 'coolers', title: hr.coolers.kind === 'adiabatic cooler' ? 'Adiabatic coolers' : 'Dry coolers', sub: `${hr.coolers.units} × ${fmtKw(hr.coolers.unitKw)}`, color: C.cyan, tip: tipOf('Heat rejection', [['Units', String(hr.coolers.units)], ['Unit capacity', fmtKw(hr.coolers.unitKw)]]) });
    if (hr?.chillers?.units) coolSpecs.push({ id: 'chiller', title: 'Chillers', sub: `${hr.chillers.units} × ${fmtKw(hr.chillers.unitKw)}`, color: C.cyan, tip: tipOf('Chillers', [['Units', String(hr.chillers.units)], ['Mechanical load', fmtKw(hr.chillers.trimKw)]]) });
    coolSpecs.push({ id: 'cool', title: cooling[0].name.split(' · ')[0], sub: `${cooling[0].count} × ${fmtKw(cooling[0].capacityKw)}`, color: C.cyan, tip: tipOf(cooling[0].name, [['Units', String(cooling[0].count)], ['Redundancy', cooling[0].redundancy], ['Liquid heat', fmtKw(sizing.cooling.liquidKw)], ['Air heat', fmtKw(sizing.cooling.airKw)]]) });
  }
  const genSpec = gens[0] ? { id: 'gen', title: gens[0].name.split(' · ')[0], sub: `${cnt(gens)} × ${fmtKw(gens[0].capacityKw)}`, color: C.amber, tip: tipOf(gens[0].name, [['Units', String(cnt(gens))], ['Total', fmtKw(sum(gens))], ['Redundancy', gens[0].redundancy], ['Connects to', dual ? 'both switchboards' : 'the switchboard']]) } : null;
  const lanes = dual ? [0, 1] : [0];
  const pc = (i: number) => (i === 1 ? C.violet : C.blue);
  const nS = stages.length;
  const wideW = Math.max(nS, coolSpecs.length + 1) * 168 + 160;
  const w = Math.max(280, width);
  const tall = layout === 'tall' || (layout === 'auto' && w < wideW * 0.92);
  const BW = tall ? 124 : 136, P = 168;

  const boxes: Box[] = [], links: { d: string; color: string; dashed?: boolean }[] = [], labels: { x: number; y: number; text: string; sub?: boolean; anchor?: 'start' | 'middle' }[] = [];
  let it: Box, W: number, H: number;
  const itTip = tipOf('IT load', [['Design load', fmtKw(sizing.itKw)], ...(sizing.racks ? [['Racks', num(sizing.racks)] as [string, string]] : []), ['PUE', String(sizing.pue.value)]]);
  const itSub = `${fmtKw(sizing.itKw)}${sizing.racks ? ` · ${num(sizing.racks)} racks` : ''}`;
  // the IT box puts the rack count on its own line when "50 MW · 1,043 racks" does not fit its width
  const itBox = (x: number, y: number, w: number, h: number): Box => {
    const split = !!sizing.racks && textW(itSub, 10.5) > w - 18;
    return { id: 'it', x, y, w, h: split ? Math.max(h, 62) : h, title: 'IT load', sub: split ? fmtKw(sizing.itKw) : itSub, sub2: split ? `${num(sizing.racks)} racks` : undefined, color: C.ink, tip: itTip };
  };
  if (!tall) {
    const cols = Math.max(nS, coolSpecs.length + 1);
    const laneY = dual ? [44, 44 + BH + 40] : [44];
    const lastLane = laneY[laneY.length - 1];
    lanes.forEach(i => stages.forEach((s, k) => boxes.push({ id: `${s.key}-${i}`, x: k * P, y: laneY[i], w: BW, h: BH, color: pc(i), ...s.box(i) })));
    const itX = cols * P + 4;
    it = itBox(itX, (laneY[0] + lastLane + BH) / 2 - 32, 152, 64);
    lanes.forEach(i => {
      stages.slice(1).forEach((_, k) => { const a = boxes.find(b => b.id === `${stages[k].key}-${i}`)!; links.push({ d: `M${a.x + a.w},${a.y + BH / 2} H${a.x + P}`, color: pc(i) }); });
      const d = boxes.find(b => b.id === `${stages[nS - 1].key}-${i}`)!; const ty = it.y + it.h / 2 + (dual ? (i ? 10 : -10) : 0);
      links.push({ d: `M${d.x + d.w},${d.y + BH / 2} H${(d.x + d.w + itX) / 2} V${ty} H${itX}`, color: pc(i) });
    });
    let below = lastLane + BH + 26;
    if (spare && upsIdx >= 0) { boxes.push({ id: 'spare', x: upsIdx * P, y: laneY[0] + BH + 10, w: BW, h: 32, title: '+1 spare module', sub: fmtKw(ups[0].capacityKw), color: C.slate, dashed: true, tip: tipOf('Spare module', [['Role', 'N+1 spare'], ['Capacity', fmtKw(ups[0].capacityKw)]]) }); links.push({ d: `M${upsIdx * P + BW / 2},${laneY[0] + BH} V${laneY[0] + BH + 10}`, color: C.slate, dashed: true }); below = laneY[0] + BH + 10 + 32 + 22; }
    if (genSpec) {
      const gx = Math.max(0, sgIdx - 1) * P, g: Box = { ...genSpec, x: gx, y: below, w: BW, h: BH };
      boxes.push(g);
      lanes.forEach(i => { const tx2 = sgIdx * P + BW / 2 + (dual ? (i ? 14 : -14) : 0); links.push({ d: gx === sgIdx * P ? `M${tx2},${g.y} V${laneY[i] + BH}` : `M${g.x + g.w},${g.y + BH / 2 + (i ? 8 : -8) * (dual ? 1 : 0)} H${tx2} V${laneY[i] + BH}`, color: C.amber, dashed: true }); });
      below += BH + 26;
    }
    labels.push({ x: 0, y: 14, text: `Power · ${redundancy}` });
    labels.push({ x: 0, y: 30, text: dual ? 'Two independent paths; either carries the full load.' : spare ? 'One path with a spare module at each stage.' : 'One power path.', sub: true });
    if (coolSpecs.length) {
      const cy = below + 4;
      labels.push({ x: 0, y: cy + 18, text: 'Cooling' }, { x: 0, y: cy + 33, text: clip(sizing.cooling.redundancy, 22), sub: true });
      coolSpecs.forEach((c, k) => boxes.push({ ...c, x: (k + 1) * P, y: cy, w: BW, h: BH }));
      const cb = boxes.filter(b => coolSpecs.some(c => c.id === b.id));
      cb.forEach((b, k) => { if (cb[k + 1]) links.push({ d: `M${b.x + b.w},${b.y + BH / 2} H${cb[k + 1].x}`, color: C.cyan }); });
      const last = cb[cb.length - 1];
      links.push({ d: `M${last.x + last.w},${last.y + BH / 2} H${it.x + it.w / 2} V${it.y + it.h}`, color: C.cyan });
      below = cy + BH + 8;
    }
    W = itX + 156; H = Math.max(below, it.y + it.h + 8);
  } else {
    const RP = BH + 30, top = 58, laneX = dual ? [0, BW + 16] : [0];
    const lastX = laneX[laneX.length - 1], RX = lastX + BW + 32;
    const rowY = (k: number) => top + k * RP;
    lanes.forEach(i => stages.forEach((s, k) => boxes.push({ id: `${s.key}-${i}`, x: laneX[i], y: rowY(k), w: BW, h: BH, color: pc(i), ...s.box(i) })));
    lanes.forEach(i => stages.slice(1).forEach((_, k) => links.push({ d: `M${laneX[i] + BW / 2},${rowY(k) + BH} V${rowY(k + 1)}`, color: pc(i) })));
    const itW = dual ? 2 * BW + 16 : BW, itY = rowY(nS);
    it = itBox(0, itY, itW, 54);
    lanes.forEach(i => links.push({ d: `M${laneX[i] + BW / 2},${rowY(nS - 1) + BH} V${itY}`, color: pc(i) }));
    labels.push({ x: 0, y: 14, text: `Power · ${redundancy}` });
    if (dual) lanes.forEach(i => labels.push({ x: laneX[i] + BW / 2, y: top - 10, text: `Path ${i ? 'B' : 'A'}`, sub: true, anchor: 'middle' }));
    else labels.push({ x: 0, y: 30, text: spare ? 'One path, a spare module at each stage.' : 'One power path.', sub: true });
    let rows = nS + 1;
    const extra = genSpec || coolSpecs.length;
    if (genSpec) {
      const g: Box = { ...genSpec, x: RX, y: rowY(sgIdx), w: BW, h: BH }; boxes.push(g);
      links.push({ d: `M${RX},${g.y + BH / 2} H${lastX + BW}`, color: C.amber, dashed: true });
      if (dual) links.push({ d: `M${RX},${g.y + BH - 10} H${RX - 14} V${rowY(sgIdx) + BH + 12} H${BW / 2} V${rowY(sgIdx) + BH}`, color: C.amber, dashed: true });
    }
    if (spare && upsIdx >= 0 && !genSpec) { boxes.push({ id: 'spare', x: RX, y: rowY(upsIdx), w: BW, h: 32, title: '+1 spare module', sub: fmtKw(ups[0].capacityKw), color: C.slate, dashed: true, tip: tipOf('Spare module', [['Role', 'N+1 spare']]) }); links.push({ d: `M${RX},${rowY(upsIdx) + 16} H${BW}`, color: C.slate, dashed: true }); }
    if (coolSpecs.length) {
      const start = genSpec ? sgIdx + 1 : spare && upsIdx >= 0 ? upsIdx + 1 : 1;
      labels.push({ x: RX, y: rowY(start) - 10, text: 'Cooling', sub: true });
      coolSpecs.forEach((c, k) => boxes.push({ ...c, x: RX, y: rowY(start + k), w: BW, h: BH }));
      const cb = boxes.filter(b => coolSpecs.some(c => c.id === b.id));
      cb.forEach((b, k) => { if (cb[k + 1]) links.push({ d: `M${RX + BW / 2},${b.y + BH} V${cb[k + 1].y}`, color: C.cyan }); });
      const last = cb[cb.length - 1];
      links.push({ d: last.y >= itY ? `M${RX},${last.y + BH / 2} H${RX - 18} V${itY + it.h / 2} H${itW}` : `M${RX + BW / 2},${last.y + BH} V${itY + it.h / 2} H${itW}`, color: C.cyan });
      rows = Math.max(rows, start + coolSpecs.length);
    }
    W = extra ? RX + BW + 2 : lastX + BW + 2; H = Math.max(rowY(rows - 1) + BH, it.y + it.h) + 6;
  }
  boxes.push(it);
  const sc = Math.min(tall ? 1.15 : 1.1, w / W), svgW = Math.min(w, W * sc), svgH = H * sc;
  void height;
  return (
    <div ref={ref} className="pc-draw">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} width={svgW} height={svgH} role="img" aria-label={`Single-line, ${redundancy}`} style={{ margin: tall ? '0 auto' : undefined }}>
        <g transform={`scale(${sc})`}>
          {labels.map((l, i) => <text key={i} x={l.x} y={l.y} textAnchor={l.anchor ?? 'start'} fontSize={l.sub ? 10 : 11} fontWeight={l.sub ? 400 : 600} fill={l.sub ? C.slate : C.ink}>{l.text}</text>)}
          {links.map((l, i) => <path key={i} d={l.d} fill="none" stroke={l.color} strokeWidth={l.dashed ? 1.5 : 2} strokeDasharray={l.dashed ? '5 4' : undefined} strokeLinejoin="round" />)}
          {boxes.map(b => (
            <g key={b.id} transform={`translate(${b.x},${b.y})`} {...on(b.tip)}>
              <rect width={b.w} height={b.h} rx={6} fill={C.surface} stroke={b.color} strokeWidth={b.id === 'it' ? 2 : 1.5} strokeDasharray={b.dashed ? '4 3' : undefined} />
              <rect width={4} height={b.h} rx={2} fill={b.color} />
              <text x={12} y={b.h >= 40 ? 19 : 14} fontSize={b.h >= 40 ? 11 : 10} fontWeight={600} fill={C.ink}>{clip(b.title.replace(/^(\w+) \1\b/i, '$1'), Math.floor((b.w - 16) / 6.1))}</text>
              <text x={12} y={b.h >= 40 ? 35 : 26} fontSize={10} fill={C.slate}>{clip(b.sub, Math.floor((b.w - 16) / 5.6))}</text>
              {b.sub2 && <text x={12} y={50} fontSize={10} fill={C.slate}>{clip(b.sub2, Math.floor((b.w - 16) / 5.6))}</text>}
            </g>
          ))}
        </g>
      </svg>
      <ChartTip tip={tip} />
      <Legend items={[{ label: dual ? 'Path A' : 'Power path', color: C.blue, kind: 'line' }, ...(dual ? [{ label: 'Path B', color: C.violet, kind: 'line' as const }] : []), ...(genSpec ? [{ label: 'Generator backup', color: C.amber, kind: 'dash' as const }] : []), ...(coolSpecs.length ? [{ label: 'Cooling', color: C.cyan, kind: 'line' as const }] : []), ...(!feeds.length ? [{ label: 'Existing, not in this plan', color: C.slate, kind: 'dash' as const }] : [])]} />
    </div>
  );
}

/* ------------------------------------------------------------------ network topology */
export function Topology({ network, racks, height = 260 }: { network: Sizing['network']; racks: number; height?: number }) {
  const [ref, width] = useWidth();
  const { tip, on } = useTip();
  if (!network.leaves && !network.spines && !network.cores) return <DrawEmpty title="No switching fabric in this plan" />;
  const W = Math.max(280, width), H = Math.max(180, height), padL = 46, padR = 10, span = W - padL - padR;
  const rowAt = (n: number, y: number) => Array.from({ length: n }, (_, i) => ({ x: padL + (n === 1 ? span / 2 : (span * (i + 0.5)) / n), y }));
  const maxLeaves = Math.max(2, Math.min(16, Math.floor(span / 30)));
  const l0 = Math.min(network.leaves, maxLeaves), leavesDrawn = l0 - (l0 % 2 && network.leaves > 1 ? 1 : 0);
  const spinesDrawn = Math.min(network.spines, Math.max(1, Math.min(8, Math.floor(span / 46)))), coresDrawn = Math.min(network.cores, 4);
  const yC = 20, yG = H - 20, yS = yC + (yG - yC) * 0.34, yL = yC + (yG - yC) * 0.67;
  const cores = rowAt(coresDrawn, yC), spines = rowAt(spinesDrawn, yS), leaves = rowAt(leavesDrawn, yL);
  const pairs = Math.max(1, Math.ceil(leavesDrawn / 2)), groups = rowAt(leavesDrawn ? pairs : 0, yG);
  const perPair = network.leaves ? Math.ceil(racks / Math.max(1, network.leaves / 2)) : 0;
  const nw = (n: number, max: number) => Math.max(14, Math.min(max, span / Math.max(1, n) - 8));
  const lw = nw(leavesDrawn, 56), sw = nw(spinesDrawn, 80), cw = nw(coresDrawn, 90), gw = nw(pairs, 110);
  const node = (key: string, x: number, y: number, w: number, fill: string, label: string, short: string, t: TipContent, fs = 10) => (
    <g key={key} {...on(t)}><rect x={x - w / 2} y={y - 11} width={w} height={22} rx={4} fill={fill} />{w >= 18 && <text x={x} y={y} dy="0.35em" textAnchor="middle" fontSize={fs} fill={C.surface}>{w >= textW(label, fs) + 8 ? label : w >= textW(short, fs) + 4 ? short : ''}</text>}</g>
  );
  const drawnNote = [network.cores > coresDrawn && `${coresDrawn} of ${network.cores} core`, network.spines > spinesDrawn && `${spinesDrawn} of ${network.spines} spine`, network.leaves > leavesDrawn && `${leavesDrawn} of ${network.leaves} leaf`].filter(Boolean);
  return (
    <div ref={ref} className="pc-draw">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Network topology: ${network.cores} core, ${network.spines} spine, ${network.leaves} leaf switches`}>
        <g stroke={C.slateLight} strokeWidth={0.8}>
          {cores.flatMap((c, i) => spines.map((s, j) => <line key={`cs${i}-${j}`} x1={c.x} y1={c.y + 11} x2={s.x} y2={s.y - 11} />))}
          {spines.flatMap((s, i) => leaves.map((l, j) => <line key={`sl${i}-${j}`} x1={s.x} y1={s.y + 11} x2={l.x} y2={l.y - 11} />))}
        </g>
        <g stroke={C.slate} strokeWidth={1}>{groups.map((g, i) => [leaves[i * 2], leaves[i * 2 + 1]].filter(Boolean).map((l, k) => <line key={`lg${i}-${k}`} x1={l.x} y1={l.y + 11} x2={g.x} y2={g.y - 13} />))}</g>
        {cores.map((c, i) => node(`c${i}`, c.x, c.y, cw, C.violet, `Core ${i + 1}`, `C${i + 1}`, tipOf(`Core ${i + 1}`, [['Core switches', String(network.cores)], ['Carriers', String(network.carriers)], ...(network.dciGbps ? [['DCI', `${num(network.dciGbps)} Gbps`] as [string, string]] : [])])))}
        {spines.map((s, i) => node(`s${i}`, s.x, s.y, sw, C.blue, `Spine ${i + 1}`, `S${i + 1}`, tipOf(`Spine ${i + 1}`, [['Spine switches', String(network.spines)], ['Uplinks', `${num(network.uplinks)} at ${network.uplinkGbps} Gbps`]])))}
        {leaves.map((l, i) => node(`l${i}`, l.x, l.y, lw, C.cyan, `Leaf ${i + 1}`, `L${i + 1}`, tipOf(`Leaf ${i + 1}`, [['Leaf switches', String(network.leaves)], ['Pair', String(Math.floor(i / 2) + 1)], ['Access ports (all)', num(network.accessPorts)]]), 9.5))}
        {groups.map((g, i) => <g key={`g${i}`} {...on(tipOf(`Leaf pair ${i + 1}`, [['Racks served', `about ${perPair}`]]))}><rect x={g.x - gw / 2} y={g.y - 13} width={gw} height={26} rx={3} fill={C.surface} stroke={C.slateLight} /><text x={g.x} y={g.y} dy="0.35em" textAnchor="middle" fontSize={9.5} fill={C.slateDark}>{gw >= 70 ? `${perPair} racks` : gw >= 22 ? perPair : ''}</text></g>)}
        <g fontSize={10} fill={C.slate}>
          {coresDrawn > 0 && <text x={0} y={yC} dy="0.35em">Core</text>}{spinesDrawn > 0 && <text x={0} y={yS} dy="0.35em">Spine</text>}{leavesDrawn > 0 && <><text x={0} y={yL} dy="0.35em">Leaf</text><text x={0} y={yG} dy="0.35em">Racks</text></>}
        </g>
      </svg>
      <ChartTip tip={tip} />
      <p className="pc-caption">{num(network.uplinks)} uplinks at {network.uplinkGbps} Gbps · leaves in pairs, each pair serves about {perPair} racks{network.carriers ? ` · ${network.carriers} carrier${network.carriers === 1 ? '' : 's'}` : ''}{drawnNote.length ? ` · drawn: ${drawnNote.join(', ')} switches` : ''}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ phasing ladder */
const BIND: Record<LadderRow['bindingConstraint'], string> = { power: 'power-bound', cooling: 'cooling-bound', space: 'space-bound', grid: 'grid-bound', ports: 'port-bound', none: 'balanced' };
/** Installed capacity stepping up at each go-live (committed, reserve hatched, headroom), the demand curve, where demand crosses
    the warning threshold, and one chip per phase with its binding constraint. */
export function PhaseLadder({ rows, growthPctPerYear, height = 240 }: { rows: LadderRow[]; growthPctPerYear: number; height?: number }) {
  const [ref, width] = useWidth();
  const { tip, on } = useTip();
  const pid = `hatch${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const sorted = [...rows].filter(r => !Number.isNaN(new Date(r.phase.goLive).getTime())).sort((a, b) => a.phase.goLive.localeCompare(b.phase.goLive));
  if (!sorted.length) return <DrawEmpty title="No phases to plot" hint="Add a phase with a go-live date and IT load." />;
  const now = clockMs();
  const first = new Date(sorted[0].phase.goLive).getTime(), last = new Date(sorted[sorted.length - 1].phase.goLive).getTime();
  const g = Math.max(0, growthPctPerYear) / 100, base = sorted[0].committedKw || sorted[0].installedKw * 0.5;
  const demandAt = (t: number) => base * Math.pow(1 + g / 12, Math.max(0, (t - first) / M));
  const markers = sorted.flatMap((r, i) => {
    if (r.crossesWarningMonth === undefined) return [];
    const at = now + r.crossesWarningMonth * M, next = sorted[i + 1] ? new Date(sorted[i + 1].phase.goLive).getTime() : null, primary = i === sorted.length - 1;
    return !primary && next !== null && at >= next ? [] : [{ at, r, primary }];
  });
  const maxInst = Math.max(1, ...sorted.map(r => r.installedKw));
  const x0 = Math.min(now, first) - M, x1 = Math.min(Math.max(last + 12 * M, ...markers.map(m => m.at + 2 * M)), last + 36 * M);
  const cap = maxInst * 1.3, yMax = Math.max(maxInst * 1.18, Math.min(cap, demandAt(x1)) * 1.05);
  const yStep = (() => { const raw = yMax / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag; })();
  const yTop = Math.ceil(yMax / yStep) * yStep, yTicks = Array.from({ length: Math.round(yTop / yStep) + 1 }, (_, i) => i * yStep);
  const m = { top: 22, right: 14, bottom: 24, left: Math.ceil(Math.max(...yTicks.map(t => textW(MW(t), 10)))) + 14 }, w = Math.max(300, width), iw = w - m.left - m.right, ih = height - m.top - m.bottom;
  const X = (t: number) => ((t - x0) / (x1 - x0)) * iw, Y = (v: number) => ih - (v / yTop) * ih;
  const spanMonths = (x1 - x0) / M;
  const ticks: number[] = []; {
    if (spanMonths > 30) for (let y = new Date(x0).getUTCFullYear() + 1; Date.UTC(y, 0, 1) < x1; y++) ticks.push(Date.UTC(y, 0, 1));
    else { const every = spanMonths > 14 ? 3 : spanMonths > 8 ? 2 : 1; const d = new Date(x0); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); for (; d.getTime() < x1; d.setUTCMonth(d.getUTCMonth() + 1)) if (d.getUTCMonth() % every === 0) ticks.push(d.getTime()); }
  }
  const tickLabel = (t: number) => (spanMonths > 30 ? String(new Date(t).getUTCFullYear()) : monYr(t));
  const tickEvery = Math.max(1, Math.ceil((textW(tickLabel(ticks[0] ?? x0), 10) + 12) / Math.max(1, iw / Math.max(1, ticks.length))));
  const segs = sorted.map((r, i) => { const a = new Date(r.phase.goLive).getTime(), b = sorted[i + 1] ? new Date(sorted[i + 1].phase.goLive).getTime() : x1; return { r, i, a, b, committed: Math.min(r.committedKw, r.installedKw), reserve: Math.min(r.committedKw + r.reserveKw, r.installedKw) }; });
  const pts: string[] = []; for (let i = 0; i <= 60; i++) { const t = first + ((x1 - first) * i) / 60; const v = Math.min(demandAt(t), cap); pts.push(`${i ? 'L' : 'M'}${X(t).toFixed(1)},${Y(v).toFixed(1)}`); if (v >= cap) break; }
  const tipFor = (s: (typeof segs)[number]) => tipOf(`${s.r.phase.name} · live ${date(s.r.phase.goLive)}`, [['Installed', fmtKw(s.r.installedKw)], ['Committed', fmtKw(s.r.committedKw)], ['Reserve', fmtKw(s.r.reserveKw)], ['Headroom', fmtKw(s.r.headroomKw)], ['Usable', `${s.r.usablePct}%`], ['Racks / halls', `${num(s.r.racks)} / ${s.r.halls}`], ['Binding', BIND[s.r.bindingConstraint]]], s.r.committedBasis);
  return (
    <div ref={ref} className="pc-draw">
      <svg viewBox={`0 0 ${w} ${height}`} width={w} height={height} role="img" aria-label="Installed capacity by phase against demand">
        <defs><pattern id={pid} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill={C.blueLight} opacity={0.45} /><line x1="0" y1="0" x2="0" y2="6" stroke={C.blue} strokeWidth="1.6" opacity={0.55} /></pattern></defs>
        <g transform={`translate(${m.left},${m.top})`}>
          {yTicks.map(t => <g key={t} transform={`translate(0,${Y(t)})`}><line x1={0} x2={iw} stroke={C.grid} strokeDasharray={t ? '2 3' : undefined} /><text x={-8} dy="0.32em" textAnchor="end" fontSize={10} fill={C.slate}>{MW(t)}</text></g>)}
          {ticks.map((t, i) => (i % tickEvery === 0 ? <g key={t} transform={`translate(${X(t)},0)`}><line y1={ih} y2={ih + 4} stroke={C.slateLight} /><text y={ih + 16} textAnchor="middle" fontSize={10} fill={C.slate}>{tickLabel(t)}</text></g> : null))}
          {segs.map(s => {
            const sx = X(s.a), sw = Math.max(0, X(s.b) - X(s.a));
            return (
              <g key={s.r.phase.id} {...on(tipFor(s))}>
                <rect x={sx} y={Y(s.r.installedKw)} width={sw} height={Math.max(0, Y(s.reserve) - Y(s.r.installedKw))} fill={C.emerald} opacity={0.2} />
                <rect x={sx} y={Y(s.reserve)} width={sw} height={Math.max(0, Y(s.committed) - Y(s.reserve))} fill={`url(#${pid})`} />
                <rect x={sx} y={Y(s.committed)} width={sw} height={Math.max(0, ih - Y(s.committed))} fill={C.blue} opacity={0.85} />
                <line x1={sx} x2={sx} y1={Y(s.r.installedKw)} y2={ih} stroke={C.surface} strokeWidth={1.5} />
              </g>
            );
          })}
          <path d={segs.map((s, i) => `${i ? 'L' : 'M'}${X(s.a)},${Y(s.r.installedKw)} L${X(s.b)},${Y(s.r.installedKw)}`).join(' ')} fill="none" stroke={C.ink} strokeWidth={1.75} pointerEvents="none" />
          <path d={pts.join(' ')} fill="none" stroke={C.rose} strokeWidth={2} strokeLinecap="round" pointerEvents="none" />
          {segs.map(s => {
            // Phase badge at the step; the name beside it only when it fits before the next step (the chips below always carry it).
            const sx = X(s.a), sw = X(s.b) - sx, by = Y(s.r.installedKw) - 11, nameFits = textW(s.r.phase.name, 10) + 30 < sw && sx + 30 + textW(s.r.phase.name, 10) < iw;
            return (
              <g key={`b${s.r.phase.id}`} transform={`translate(${sx + 10},${by})`} {...on(tipFor(s))}>
                <circle r={7.5} fill={C.surface} stroke={C.ink} strokeWidth={1.2} /><text dy="0.35em" textAnchor="middle" fontSize={9.5} fontWeight={600} fill={C.ink}>{s.i + 1}</text>
                {nameFits && <text x={12} dy="0.35em" fontSize={10} fontWeight={600} fill={C.ink}>{s.r.phase.name}</text>}
              </g>
            );
          })}
          {X(now) >= 0 && X(now) <= iw && <g transform={`translate(${X(now)},0)`} pointerEvents="none"><line y1={-6} y2={ih} stroke={C.slate} strokeDasharray="3 3" /><text y={-10} textAnchor={X(now) < 20 ? 'start' : 'middle'} fontSize={9.5} fill={C.slate}>today</text></g>}
          {markers.map((mk, i) => {
            const mx = X(mk.at); if (mx < 0 || mx > iw) return null;
            const label = `85% of installed ~${monYr(mk.at)}`, anchor = mx > iw - textW(label, 10) - 8 ? 'end' : 'start';
            return (
              <g key={i} transform={`translate(${mx},0)`} {...on(tipOf('Demand crosses the warning threshold', [['Threshold', '85% of installed'], ['Phase', mk.r.phase.name], ['When', monYr(mk.at)], ['Installed', fmtKw(mk.r.installedKw)], ['Growth', `${growthPctPerYear}% a year`]]))}>
                <line y1={0} y2={ih} stroke={C.amberDark} strokeWidth={mk.primary ? 1.5 : 1} strokeDasharray="5 4" opacity={mk.primary ? 1 : 0.6} />
                <circle cy={Y(Math.min(mk.r.installedKw * 0.85, yTop))} r={3.5} fill={C.amber} stroke={C.surface} strokeWidth={1.5} />
                {mk.primary && <text x={anchor === 'start' ? 5 : -5} y={10} textAnchor={anchor} fontSize={10} fontWeight={600} fill={C.amberDark}>{label}</text>}
                <rect x={-5} y={0} width={10} height={ih} fill="transparent" />
              </g>
            );
          })}
        </g>
      </svg>
      <ChartTip tip={tip} />
      <Legend items={[{ label: 'Committed', color: C.blue }, { label: 'Reserve', color: C.blue, kind: 'hatch' }, { label: 'Headroom', color: 'var(--vw-color-emerald-200)' }, { label: 'Installed', color: C.ink, kind: 'line' }, { label: `Demand (${growthPctPerYear}% a year)`, color: C.rose, kind: 'line' }, ...(markers.length ? [{ label: 'Warning threshold (85%)', color: C.amberDark, kind: 'dash' as const }] : [])]} />
      <div className="pc-chips" style={{ marginTop: 8 }}>
        {sorted.map((r, i) => <Chip key={r.phase.id} tone={r.bindingConstraint === 'none' ? 'neutral' : 'info'} size="xs" title={`${r.phase.name}: headroom ${fmtKw(r.headroomKw)}, ${r.usablePct}% usable`}>{i + 1} · {r.phase.name} · {BIND[r.bindingConstraint]}</Chip>)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ lead times */
const HALO = { stroke: 'var(--vw-color-white)', strokeWidth: 3, paintOrder: 'stroke' as const, strokeLinejoin: 'round' as const };
const KIND: Record<ScheduleItem['kind'], string> = { equipment: 'long-lead equipment', gate: 'gate', permit: 'permit' };
/** One row per schedule item: order-by → need-by bars (buffer hatched), permits amber, gates as diamonds, late items red, with
    "order in N wk" / "N wk late" beside each bar; month axis, today and go-live stay pinned above rows that scroll past `maxHeight`.
    `phase` filters to one phase (name or id); `highlight` marks one item by name and scrolls to it; `onPick` makes rows clickable. */
export function LeadTimes({ items, goLive, phase, maxHeight = 420, highlight, onPick }: { items: ScheduleItem[]; goLive: string; phase?: string; maxHeight?: number; highlight?: string; onPick?: (item: ScheduleItem) => void }) {
  const [ref, width] = useWidth();
  const { tip, on } = useTip();
  const scroll = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const pid = `lt${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const valid = items.filter(it => !Number.isNaN(new Date(it.orderBy).getTime()) && !Number.isNaN(new Date(it.needBy).getTime()) && (!phase || it.phase === phase || it.phaseId === phase));
  const hiIdx = highlight ? valid.findIndex(v => v.item === highlight) : -1;
  const rowH = 24;
  useEffect(() => { const el = scroll.current; if (el && hiIdx >= 0) el.scrollTo({ top: Math.max(0, hiIdx * rowH - el.clientHeight / 2 + rowH), behavior: 'smooth' }); }, [hiIdx]);
  if (!valid.length) return <DrawEmpty title="No schedule items" hint={phase ? 'Nothing is scheduled for this phase.' : 'Add a phase with a go-live date; long-lead items, gates and permits follow from it.'} />;
  const now = clockMs(), gl = new Date(goLive).getTime();
  const t0 = Math.min(now, ...valid.map(v => new Date(v.orderBy).getTime())) - 20 * 864e5;
  const t1 = Math.max(Number.isNaN(gl) ? 0 : gl, ...valid.map(v => new Date(v.needBy).getTime())) + 25 * 864e5;
  const w = Math.max(320, width), labelW = Math.round(Math.min(230, Math.max(120, w * 0.27))), m = { left: labelW, right: 12 }, headH = 40;
  const ih = rowH * valid.length, iw = w - m.left - m.right;
  const X = (t: number) => ((t - t0) / (t1 - t0)) * iw;
  const months: number[] = []; { const d = new Date(t0); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); for (; d.getTime() < t1; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(d.getTime()); }
  const pxMonth = iw / Math.max(1, (t1 - t0) / M), every = [1, 2, 3, 6, 12].find(n => n * pxMonth >= 40) ?? 12;
  const monthLabels: { t: number; text: string }[] = [];
  for (const t of months) {
    if (new Date(t).getUTCMonth() % every !== 0) continue;
    const text = new Date(t).getUTCMonth() === 0 || !monthLabels.length ? monYr(t) : MON(t), prev = monthLabels[monthLabels.length - 1];
    if (prev && X(t) - X(prev.t) < (textW(prev.text, 9.5) + textW(text, 9.5)) / 2 + 8) continue;
    monthLabels.push({ t, text });
  }
  const colour = (it: ScheduleItem) => (it.late ? C.red : it.kind === 'permit' ? C.amber : it.kind === 'gate' ? C.violet : it.source === 'stock' ? C.emerald : it.status === 'ordered' ? C.slate : C.blue);
  const note = (it: ScheduleItem): { text: string; color: string } => {
    const ob = new Date(it.orderBy).getTime(), nb = new Date(it.needBy).getTime();
    if (it.kind === 'gate') return { text: date(it.needBy), color: C.slateDark };
    if (it.late) return { text: `${weeksBetween(ob, now)} wk late`, color: C.red };
    if (it.status === 'ordered') return { text: it.poId ? `ordered · ${it.poId}` : 'ordered', color: C.slate };
    if (it.source === 'stock') return { text: 'from stock', color: 'var(--vw-color-emerald-700)' };
    if (ob > now) return { text: `${it.kind === 'permit' ? 'apply' : 'order'} in ${weeksBetween(now, ob)} wk`, color: C.slateDark };
    return { text: `due ${date(new Date(nb).toISOString())}`, color: C.slate };
  };
  const xNow = X(now), xGl = Number.isNaN(gl) ? -1 : X(gl);
  const nowIn = xNow >= 0 && xNow <= iw, glIn = xGl >= 0 && xGl <= iw;
  const glText = `go-live ${date(goLive)}`, nowText = 'today';
  const clash = nowIn && glIn && Math.abs(xGl - xNow) < (textW(glText, 9.5) + textW(nowText, 9.5)) / 2 + 10;
  const anchorAt = (x: number, tw: number, prefer: 'start' | 'middle' | 'end') => (prefer === 'middle' ? (x - tw / 2 < 0 ? 'start' : x + tw / 2 > iw ? 'end' : 'middle') : prefer);
  const nowAnchor = clash ? (xNow < xGl ? 'end' : 'start') : anchorAt(xNow, textW(nowText, 9.5), 'middle');
  const glAnchor = clash ? (xNow < xGl ? 'start' : 'end') : anchorAt(xGl, textW(glText, 9.5), 'middle');
  const off = (a: string) => (a === 'end' ? -4 : a === 'start' ? 4 : 0);
  const kinds = new Set(valid.map(v => (v.late ? 'late' : v.kind === 'equipment' ? (v.source === 'stock' ? 'stock' : v.status === 'ordered' ? 'ordered' : 'buy') : v.kind)));
  const lines = (h: number) => <>{months.map(t => { const jan = new Date(t).getUTCMonth() === 0; return <line key={t} x1={X(t)} x2={X(t)} y1={0} y2={h} stroke={jan ? C.slateLight : C.grid} strokeDasharray={jan ? undefined : '2 3'} />; })}</>;
  return (
    <div ref={ref} className="pc-draw">
      <svg viewBox={`0 0 ${w} ${headH}`} width={w} height={headH} role="img" aria-label="Lead times: month axis, today and go-live">
        <g transform={`translate(${m.left},0)`}>
          {monthLabels.map(l => <text key={l.t} x={X(l.t)} y={13} textAnchor={X(l.t) < 16 ? 'start' : 'middle'} fontSize={9.5} fill={C.slate}>{l.text}</text>)}
          <g transform={`translate(0,${headH - 22})`}>{lines(22)}</g>
          {nowIn && <g transform={`translate(${xNow},0)`}><line y1={24} y2={headH} stroke={C.slateDark} strokeDasharray="3 3" /><text x={off(nowAnchor)} y={31} textAnchor={nowAnchor} fontSize={9.5} fontWeight={600} fill={C.slateDark}>{nowText}</text></g>}
          {glIn && <g transform={`translate(${xGl},0)`}><line y1={24} y2={headH} stroke={C.emerald} strokeWidth={2} /><text x={off(glAnchor)} y={31} textAnchor={glAnchor} fontSize={9.5} fontWeight={600} fill="var(--vw-color-emerald-700)">{glText}</text></g>}
        </g>
      </svg>
      <div ref={scroll} className="pc-gantt-scroll" style={{ maxHeight }}>
        <svg viewBox={`0 0 ${w} ${ih}`} width={w} height={ih} role="img" aria-label={`${valid.length} items from order-by to need-by`} onMouseLeave={() => setHover(null)}>
          <defs><pattern id={pid} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke={C.surface} strokeWidth="1.8" opacity={0.75} /></pattern></defs>
          {valid.map((_, i) => (i % 2 === 1 || i === hiIdx || i === hover ? <rect key={`bg${i}`} x={0} y={i * rowH} width={w} height={rowH} fill={i === hiIdx ? 'var(--vw-color-blue-50)' : i === hover ? C.faint : C.wash} /> : null))}
          <g transform={`translate(${m.left},0)`}>
            {lines(ih)}
            {nowIn && <line x1={xNow} x2={xNow} y1={0} y2={ih} stroke={C.slateDark} strokeDasharray="3 3" />}
            {glIn && <line x1={xGl} x2={xGl} y1={0} y2={ih} stroke={C.emerald} strokeWidth={2} opacity={0.8} />}
          </g>
          {valid.map((it, i) => {
            const y = i * rowH, cy = y + rowH / 2, ob = new Date(it.orderBy).getTime(), nb = new Date(it.needBy).getTime(), a = X(ob), b = X(nb), c = colour(it), bh = rowH - 10;
            const n = note(it), tw = textW(n.text, 9.5);
            const buf = it.bufferWeeks ? Math.min(b - a, X(ob + it.bufferWeeks * 7 * 864e5) - a) : 0;
            const after = (it.kind === 'gate' ? b + 9 : b + 6) + tw < iw, before = a - 6 - tw > 0;
            const t = tipOf(it.item, [['Kind', KIND[it.kind]], ...(it.kind === 'gate' ? [] : [['Lead time', `${it.leadWeeks} wk${it.bufferWeeks ? ` + ${it.bufferWeeks} wk buffer` : ''}`] as [string, string], ['Order by', date(it.orderBy)] as [string, string]]), ['Need by', date(it.needBy)], ['Phase', it.phase], ...(it.poId ? [['Purchase order', it.poId] as [string, string]] : []), ['Status', n.text]], it.note);
            return (
              <g key={`${it.item}-${i}`} {...on(t)} onMouseEnter={() => setHover(i)} onClick={onPick ? () => onPick(it) : undefined} style={onPick ? { cursor: 'pointer' } : undefined}>
                <rect x={0} y={y} width={w} height={rowH} fill="transparent" />
                {(() => {
                  // a long name wraps onto a second line (ellipsis only after that); the row's tip carries the full name
                  const per = Math.floor((labelW - 14) / 5.9), lines2 = wrap2(it.item, per, Math.floor((labelW - 14) / 5.5));
                  const props = { x: labelW - 10, textAnchor: 'end' as const, fill: it.late ? 'var(--vw-color-red-600)' : C.ink, fontWeight: it.kind === 'gate' || i === hiIdx ? 600 : 400 };
                  return lines2.length === 1 ? <text {...props} y={cy} dy="0.35em" fontSize={10.5}>{lines2[0]}</text>
                    : <text {...props} y={cy - 5} dy="0.35em" fontSize={9.5}>{lines2[0]}<tspan x={labelW - 10} dy={10.5}>{lines2[1]}</tspan></text>;
                })()}
                <g transform={`translate(${m.left},0)`}>
                  {it.kind === 'gate'
                    ? <rect x={b - 5} y={cy - 5} width={10} height={10} rx={1.5} fill={c} stroke={i === hiIdx ? C.ink : C.surface} strokeWidth={1.2} transform={`rotate(45 ${b} ${cy})`} />
                    : <>
                      <rect x={a} y={cy - bh / 2} width={Math.max(3, b - a)} height={bh} rx={3} fill={c} opacity={0.9} stroke={i === hiIdx ? C.ink : 'none'} strokeWidth={1.2} />
                      {buf > 1 && <rect x={a} y={cy - bh / 2} width={buf} height={bh} rx={3} fill={`url(#${pid})`} />}
                      {b - a > textW(`${it.leadWeeks} wk`, 9) + buf + 10 && <text x={a + buf + 5} y={cy} dy="0.35em" fontSize={9} fill={C.surface} fontWeight={600}>{it.leadWeeks} wk</text>}
                    </>}
                  {after ? <text x={(it.kind === 'gate' ? b + 9 : b + 6)} y={cy} dy="0.35em" fontSize={9.5} fontWeight={it.late ? 600 : 400} fill={n.color} {...HALO}>{n.text}</text>
                    : before ? <text x={a - 6} y={cy} dy="0.35em" textAnchor="end" fontSize={9.5} fontWeight={it.late ? 600 : 400} fill={n.color} {...HALO}>{n.text}</text> : null}
                </g>
              </g>
            );
          })}
        </svg>
      </div>
      <ChartTip tip={tip} />
      <Legend items={[
        ...(kinds.has('buy') ? [{ label: 'To buy (order → need)', color: C.blue }] : []), ...(valid.some(v => (v.bufferWeeks ?? 0) > 0) ? [{ label: 'Buffer', color: C.blue, kind: 'hatch' as const }] : []),
        ...(kinds.has('stock') ? [{ label: 'From stock', color: C.emerald }] : []), ...(kinds.has('ordered') ? [{ label: 'Ordered', color: C.slate }] : []), ...(kinds.has('late') ? [{ label: 'Late', color: C.red }] : []),
        ...(kinds.has('permit') ? [{ label: 'Permit', color: C.amber }] : []), ...(kinds.has('gate') ? [{ label: 'Gate', color: C.violet, kind: 'diamond' as const }] : []),
        { label: 'Today', color: C.slateDark, kind: 'dash' }, { label: 'Go-live', color: C.emerald, kind: 'line' },
      ]} />
      {ih > maxHeight && <p className="pc-caption">{valid.length} items; scroll the chart for the rest.</p>}
    </div>
  );
}
