/* In-site and refresh drawings for the plan pack and the family tabs: rack elevations before and after (a rack plan's block, or a
   server / switch refresh's devices out and new units in), the real hall grid before and after (hall, pod; retrofit racks converted
   to liquid with their swing positions), and the liquid cooling schematic of a retrofit (facility water → CDUs → row manifolds →
   racks). Figures come from the in-site analysis (inSiteAnalysis.ts), the replace analysis (replaceCore rackRows) and DCIM (hallGrid). */
import { useId, type ReactNode } from 'react';
import type * as T from '../../../../planner/p2b/types';
import type { Evaluation } from '../../../../planner/lib/engine';
import type { InSiteAnalysis, RetrofitResult } from '../../../../planner/lib/inSiteAnalysis';
import type { RackBaseline } from '../../../../planner/lib/site';
import { hallGrid, type HallGrid } from '../../../../planner/lib/placement';
import { replaceOf } from '../../../../planner/lib/replaceAnalysis';
import { REPLACE_SCOPES } from '../../../../planner/lib/outputs';
import { C, useTip, type TipContent } from '../../charts/chartKit';
import { ChartLegend, ChartTip, type LegendItem } from '../../charts/ChartTip';
import { fit, plural } from '../../pack/familyDrawKit';
import { CrahSym, DrawNotes, Hatch, StateTag } from '../../pack/familyKit';
import { kw, num } from '../../common';

const W = 1000;
/** kW with one decimal under 100 kW (a 4.5 kW rack), else the planner's kW / MW. */
const kwd = (n: number) => (Math.abs(n) < 100 ? `${Math.round(n * 10) / 10} kW` : kw(n));

/* ------------------------------------------------------------------ rack elevations */
type UState = 'existing' | 'out' | 'new' | 'held' | 'proposed';
interface UItem { key: string; start: number; h: number; label: string; sub?: string; state: UState; tip: TipContent }
interface ElevPair { rack: T.Rack; heightU: number; before: UItem[]; after: UItem[]; beforeFoot: string; afterFoot: string; afterTag?: string }
const U_FILL: Record<UState, { fill: string; stroke: string; text: string; dash?: string }> = {
  existing: { fill: 'var(--vw-color-slate-100)', stroke: C.slate, text: C.ink },
  out: { fill: 'var(--vw-color-red-50)', stroke: C.red, text: 'var(--vw-color-red-700)' },
  new: { fill: 'var(--vw-color-emerald-100)', stroke: C.emeraldDark, text: C.ink },
  held: { fill: 'var(--vw-color-amber-100)', stroke: C.amberDark, text: C.amberDark },
  proposed: { fill: 'var(--vw-color-emerald-50)', stroke: C.emeraldDark, text: C.emeraldDark, dash: '4 3' },
};

function Elevation({ x, y, heightU, uh, items, title, foot, hid, onTip, tag }: { x: number; y: number; heightU: number; uh: number; items: UItem[]; title: string; foot: string; hid: string; onTip: (c: TipContent) => object; tag?: ReactNode }) {
  const left = x + 26, w = 168, top = y + 30;
  const yOf = (u: number) => top + (heightU - u) * uh;
  return (
    <g>
      <text x={left} y={y + 12} fontSize={11} fontWeight={600} fill={C.ink}>{title}</text>
      {tag}
      <rect x={left - 6} y={top - 6} width={w + 12} height={heightU * uh + 12} rx={2} fill={C.surface} stroke={C.slateDark} strokeWidth={1.4} />
      <rect x={left} y={top} width={w} height={heightU * uh} fill={C.surface} stroke={C.slateLight} />
      {Array.from({ length: heightU }, (_, i) => i + 1).map(u => <line key={u} x1={left} x2={left + w} y1={yOf(u) + uh} y2={yOf(u) + uh} stroke={C.faint} />)}
      {Array.from({ length: heightU }, (_, i) => i + 1).filter(u => u === 1 || u % 5 === 0).map(u => <text key={`n${u}`} x={left - 10} y={yOf(u) + uh / 2} dy="0.35em" textAnchor="end" fontSize={8.5} fill={C.slate}>{u}</text>)}
      {items.map(it => {
        const st = U_FILL[it.state]; const yy = yOf(it.start + it.h - 1), hh = it.h * uh;
        return (
          <g key={it.key} {...onTip(it.tip)}>
            <rect x={left + 1} y={yy + 0.5} width={w - 2} height={Math.max(2, hh - 1)} rx={1} fill={st.fill} stroke={st.stroke} strokeWidth={it.state === 'existing' ? 0.6 : 1.2} strokeDasharray={st.dash} />
            {it.state === 'out' && <rect x={left + w - 44} y={yy + 0.5} width={43} height={Math.max(2, hh - 1)} fill={`url(#o${hid})`} opacity={0.45} />}
            {hh >= 8 && <text x={left + 6} y={yy + Math.min(hh, 13) / 2 + 0.5} dy="0.35em" fontSize={Math.min(9, hh - 1)} fontWeight={it.state === 'existing' ? 400 : 600} fill={st.text}>{fit(it.label, w - (it.state === 'out' ? 50 : 12), 9)}</text>}
            {it.state === 'out' && hh >= 8 && <text x={left + w - 5} y={yy + Math.min(hh, 13) / 2 + 0.5} dy="0.35em" textAnchor="end" fontSize={7.5} fontWeight={600} fill={C.red}>OUT</text>}
            {it.sub && hh >= 24 && <text x={left + 6} y={yy + 18} dy="0.35em" fontSize={8.5} fill={C.slate}>{fit(it.sub, w - 12, 8.5)}</text>}
          </g>
        );
      })}
      <text x={left - 6} y={top + heightU * uh + 22} fontSize={10} fill={C.slateDark}>{foot}</text>
    </g>
  );
}

const devItems = (rb: RackBaseline, outIds: Set<string> = new Set(), drop = false): UItem[] => {
  const devs = rb.devices.filter(d => d.position && d.category !== 'PDU' && (!drop || !outIds.has(d.id)));
  const held = [...rb.usedUnits].filter(u => !rb.devices.some(d => d.position && u >= d.position && u < d.position + Math.max(1, d.heightU ?? 1))).sort((a, b) => a - b);
  // Group consecutive held units into blocks.
  const blocks: { start: number; h: number }[] = [];
  for (const u of held) { const b = blocks[blocks.length - 1]; if (b && b.start + b.h === u) b.h++; else blocks.push({ start: u, h: 1 }); }
  return [
    ...devs.map((d): UItem => ({ key: d.id, start: d.position!, h: Math.max(1, d.heightU ?? 1), label: d.name, sub: d.model, state: outIds.has(d.id) ? 'out' : 'existing', tip: { title: d.name, rows: [['Position', `U${d.position}${(d.heightU ?? 1) > 1 ? `–U${d.position! + (d.heightU ?? 1) - 1}` : ''}`], ['Model', d.model ?? d.category], ['Category', d.category], ...(outIds.has(d.id) ? [['This plan', 'removed', C.red] as [string, string, string]] : [])] } })),
    ...blocks.map((b, i): UItem => ({ key: `h${i}`, start: b.start, h: b.h, label: 'Held by a rack reservation', state: 'held', tip: { title: `U${b.start}${b.h > 1 ? `–U${b.start + b.h - 1}` : ''}`, rows: [['Held', 'rack reservation']] } })),
  ];
};

function pairsFor(plan: T.PlannerPlan, ev: Evaluation): { pairs: ElevPair[]; proposed: boolean; notes: string[] } {
  const ins = ev.scope?.inSite as InSiteAnalysis | undefined;
  if (ins?.type === 'rack' && ins.rack) {
    const r = ins.rack;
    const accepted = r.accepted.map(a => ({ rb: a.cand.rb, start: a.startU, end: a.endU }));
    const best = !accepted.length ? [...r.candidates].filter(c => !c.blocked.length && c.block).sort((a, b) => b.score - a.score)[0] : undefined;
    const list = accepted.length ? accepted : best ? [{ rb: best.rb, start: best.block!.start, end: best.block!.start + r.perRack.u - 1 }] : [];
    const st: UState = accepted.length ? 'new' : 'proposed';
    return {
      proposed: !accepted.length,
      pairs: list.map(x => {
        const before = devItems(x.rb);
        const block: UItem[] = x.start && x.end ? [{ key: 'plan', start: x.start, h: x.end - x.start + 1, label: `${plan.plnId} · ${r.perRack.hosts ? `${r.perRack.hosts} hosts · ` : ''}${kwd(r.perRack.kw)}`, sub: r.equipment ? `${num(r.perRack.u)} U · ${num(r.perRack.kg)} kg` : `${num(r.perRack.u)} U`, state: st, tip: { title: `${plan.plnId} block`, rows: [['Units', `U${x.start}–U${x.end}`], ['Load', kwd(r.perRack.kw)], ['Weight', `${num(r.perRack.kg)} kg`], ['Ports', String(r.perRack.ports)], ['State', st === 'new' ? 'accepted' : 'proposed (best-ranked candidate)']] } }] : [];
        const used = x.rb.usedUnits.size;
        return { rack: x.rb.rack, heightU: x.rb.rack.heightU || 42, before, after: [...before, ...block], afterTag: st === 'proposed' ? 'PROPOSED' : undefined,
          beforeFoot: `${kwd(x.rb.drawKw)} of ${kwd(x.rb.ratingKw)} · ${used} of ${x.rb.rack.heightU} U used`,
          afterFoot: `${kwd(x.rb.drawKw + r.perRack.kw)} of ${kwd(x.rb.ratingKw)} · ${used + (x.end && x.start ? x.end - x.start + 1 : 0)} of ${x.rb.rack.heightU} U used` };
      }),
      notes: [
        !accepted.length ? `No rack is accepted yet. The drawing shows the best-ranked candidate (${list[0]?.rb.rack.name ?? '—'}) the planner proposes; accept a rack on the Space step to fix it.` : `${plural(accepted.length, 'rack')} accepted; the block is reserved in DCIM when the plan is executed.`,
        `Each rack gets ${r.feed.label}; ${r.perRack.ports} port${r.perRack.ports === 1 ? '' : 's'} at ${r.portSpeedMbps / 1000}G on the leaf pair.`,
      ],
    };
  }
  if (REPLACE_SCOPES.includes(plan.scope) && plan.scope !== 'rack-replace' && ev.ctx?.data) {
    const a = replaceOf(ev);
    const rows = (a?.rackRows ?? []).filter(r => r.rb && (r.out.length || r.inn.length));
    return {
      proposed: false,
      pairs: rows.map(r => {
        const outIds = new Set(r.out.map(d => d.id));
        const newItems: UItem[] = r.inn.filter(u => u.startU).map(u => ({ key: u.id, start: u.startU!, h: u.heightU, label: u.keepHostname ?? r.out.find(d => u.oldIds.includes(d.id))?.name ?? u.model, sub: u.model, state: 'new', tip: { title: `${u.keepHostname ?? u.model} (new)`, rows: [['Model', u.model], ['Position', `U${u.startU}${u.heightU > 1 ? `–U${u.startU! + u.heightU - 1}` : ''}`], ['Replaces', u.oldIds.length ? `${u.oldIds.length} old device${u.oldIds.length === 1 ? '' : 's'}` : '—'], ['Typical / max', `${u.typicalKw} / ${u.maxKw} kW`], ['Keeps address', u.keepIp4 ?? '—'], ['Run', u.parallel ? 'in parallel with the old one' : 'after the old one is out']], note: u.note } }));
        return { rack: r.rack, heightU: r.heightU || 42, before: devItems(r.rb!, outIds), after: [...devItems(r.rb!, outIds, true), ...newItems],
          beforeFoot: `${kwd(r.kwBefore)} of ${kwd(r.ratingKw)} · ${r.uBefore} of ${r.heightU} U used`,
          afterFoot: `${kwd(r.kwAfter)} (peak ${kwd(r.kwPeakAfter)}) · ${r.uAfter} of ${r.heightU} U used` };
      }),
      notes: [
        `${plural(rows.reduce((s, r) => s + r.out.length, 0), 'device')} out, ${plural(rows.reduce((s, r) => s + r.inn.length, 0), 'new unit')} in, across ${plural(rows.length, 'rack')}.`,
        rows.some(r => r.issues.length) ? `To resolve: ${rows.filter(r => r.issues.length).map(r => `${r.rack.name}: ${r.issues.join('; ')}`).join(' · ')}.` : 'Every rack stays inside its power rating, feed loading, U space and weight after the swap.',
        (a?.units ?? []).some(u => !u.placed) ? `${(a?.units ?? []).filter(u => !u.placed).length} new unit(s) have no position yet and are not drawn.` : '',
      ],
    };
  }
  return { pairs: [], proposed: false, notes: [] };
}

/** Rack elevations before and after, one pair per rack. */
export function RackElevationSheet({ plan, ev, max }: { plan: T.PlannerPlan; ev: Evaluation; max?: number }) {
  const { tip, on } = useTip();
  const hid = useId().replace(/:/g, '');
  const { pairs: all, notes } = pairsFor(plan, ev);
  if (!all.length) return null;
  const pairs = max ? all.slice(0, max) : all;
  const pairW = 470, perRow = Math.max(1, Math.floor((W + 60) / (pairW + 60))), gapX = perRow > 1 ? (W - perRow * pairW) / (perRow - 1) : 0;
  const maxU = Math.max(...pairs.map(p => p.heightU)), uh = Math.min(10, 420 / maxU);
  const pairH = 30 + maxU * uh + 44;
  const rows = Math.ceil(pairs.length / perRow), H = rows * pairH + (rows - 1) * 24;
  const states = new Set(pairs.flatMap(p => [...p.before, ...p.after].map(i => i.state)));
  const legend: LegendItem[] = [
    { label: 'Installed device', color: 'var(--vw-color-slate-200)' },
    ...(states.has('out') ? [{ label: 'Removed by this plan', color: C.red, kind: 'hatch' as const }] : []),
    ...(states.has('new') ? [{ label: 'Added by this plan', color: 'var(--vw-color-emerald-300)' }] : []),
    ...(states.has('proposed') ? [{ label: 'Proposed block, not accepted yet', color: C.emeraldDark, kind: 'dash' as const }] : []),
    ...(states.has('held') ? [{ label: 'Held by a rack reservation', color: 'var(--vw-color-amber-200)' }] : []),
  ];
  return (
    <div className="pc-draw fd-draw">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Rack elevations before and after">
        <defs><Hatch id={`o${hid}`} color={C.red} gap={4} /></defs>
        {pairs.map((p, i) => {
          const x = pairs.length < perRow ? (W - pairs.length * pairW - (pairs.length - 1) * 60) / 2 + i * (pairW + 60) : (i % perRow) * (pairW + gapX), y = Math.floor(i / perRow) * (pairH + 24);
          const mid = x + 230, ay = y + 30 + (p.heightU * uh) / 2;
          return (
            <g key={p.rack.id}>
              <Elevation x={x} y={y} heightU={p.heightU} uh={uh} items={p.before} title={`${p.rack.name} · before`} foot={p.beforeFoot} hid={hid} onTip={on} />
              <path d={`M${mid - 14},${ay} h22 m-7,-6 l7,6 l-7,6`} fill="none" stroke={C.slate} strokeWidth={1.6} />
              <Elevation x={x + 262} y={y} heightU={p.heightU} uh={uh} items={p.after} title={`${p.rack.name} · after`} foot={p.afterFoot} hid={hid} onTip={on}
                tag={p.afterTag ? <StateTag x={x + 262 + 26 + 168 - 64} y={y + 12} state="proposed" /> : undefined} />
            </g>
          );
        })}
      </svg>
      {all.length > pairs.length && <p className="pc-caption">Showing {pairs.length} of {all.length} racks; the plan pack has them all.</p>}
      <ChartLegend items={legend} />
      <DrawNotes items={notes} />
      <ChartTip tip={tip} />
    </div>
  );
}

/* ------------------------------------------------------------------ hall grid */
interface Mark { x: number; y: number; kind: 'plan' | 'proposed' | 'liquid' | 'swing'; label?: string }
const MARK: Record<Mark['kind'], { fill: string; stroke: string; label: string }> = {
  plan: { fill: 'var(--vw-color-emerald-400)', stroke: C.emeraldDark, label: 'Rack added by this plan' },
  proposed: { fill: 'var(--vw-color-emerald-100)', stroke: C.emeraldDark, label: 'Proposed position, not accepted yet' },
  liquid: { fill: 'var(--vw-color-violet-300)', stroke: C.violet, label: 'Rack converted to liquid cooling' },
  swing: { fill: 'var(--vw-color-sky-200)', stroke: 'var(--vw-color-sky-600)', label: 'Swing position during the works' },
};
const CELL: Record<string, { fill: string; label: string }> = {
  free: { fill: 'var(--vw-color-slate-100)', label: 'Free position' }, 'empty-rack': { fill: 'var(--vw-color-blue-100)', label: 'Empty cabinet' },
  occupied: { fill: 'var(--vw-color-slate-300)', label: 'Live rack' }, retired: { fill: 'var(--vw-color-slate-200)', label: 'Retired cabinet' }, held: { fill: 'var(--vw-color-amber-100)', label: 'Held by another plan' },
};

function gridFor(plan: T.PlannerPlan, ev: Evaluation): { grid?: HallGrid; marks: Mark[]; proposed: boolean; notes: string[]; afterTitle: string } {
  const ins = ev.scope?.inSite as InSiteAnalysis | undefined;
  const data = ins?.data ?? ev.ctx?.data; const site = ins?.site;
  if (!ins || !data) return { marks: [], proposed: false, notes: [], afterTitle: '' };
  if (ins.hall) {
    const h = ins.hall;
    return { grid: h.grid, marks: h.positions.map(p => ({ x: p.gridX, y: p.gridY, kind: 'plan' as const })), proposed: false, afterTitle: `After · ${plural(h.positions.length, 'rack')} added`,
      notes: [`${plural(h.racks, 'rack')}, ${kw(h.kw)} IT in ${h.hall?.name ?? 'the hall'} (${h.mode === 'partly-used' ? 'partly used today' : h.mode === 'shell' ? 'an empty shell' : 'a new hall'}); ${h.designLeftKw > 0 ? `${kw(h.designLeftKw)} of the hall design load left after` : 'the hall design load is used up'}.`,
        `Rack classes: ${h.classes.map(c => `${c.racks} ${c.name} at ${c.kw} kW (${c.cooling})`).join(' · ')}.`,
        h.phases.length > 1 ? `Phases: ${h.phases.map(p => `${p.phase.name} ${p.racks} racks`).join(' · ')}.` : '',
        `${h.crah.units} × ${kw(h.crah.unitKw)} CRAH${h.cdus ? ` and ${h.cdus} CDU` : ''}; ${h.pduPerSide} floor PDU per side; ${h.newRows.length ? `new rows on grid lines ${h.newRows.map(r => r + 1).join(', ')}` : 'no new rows'}.`] };
  }
  if (ins.pod) {
    const p = ins.pod; const opt = p.chosen ?? [...p.options].filter(o => o.fits).sort((a, b) => b.score - a.score)[0];
    if (!opt || !site) return { marks: [], proposed: false, notes: [], afterTitle: '' };
    const grid = hallGrid(data, site, opt.hall.id, plan.id);
    const proposed = !p.chosen;
    return { grid, marks: opt.positions.map(x => ({ x: x.gridX, y: x.gridY, kind: proposed ? 'proposed' as const : 'plan' as const })), proposed, afterTitle: `After · ${plural(opt.positions.length, 'position')}${proposed ? ' (proposed)' : ''}`,
      notes: [proposed ? `No positions are accepted yet; the drawing shows the best-fitting option the planner proposes (${opt.kind === 'pair' ? 'a facing pair' : 'one row'} in ${opt.hall.name}).` : `${plural(opt.positions.length, 'position')} accepted in ${opt.hall.name}.`,
        `${p.count} racks at ${p.kwPerRack} kW; containment ${opt.containment === 'New' ? 'new' : String(opt.containment).toLowerCase()}; ${opt.aisles} aisle${opt.aisles === 1 ? '' : 's'}${p.cage ? `; cage ${num(p.cage.perimeterM)} m with ${p.cage.doors} doors` : ''}.`] };
  }
  if (ins.retrofit?.hall && site) {
    const r = ins.retrofit; const grid = hallGrid(data, site, r.hall!.id, plan.id);
    return { grid, proposed: false, afterTitle: `After · ${plural(r.rows.length, 'rack')} on liquid`,
      marks: [...r.rows.map(x => ({ x: x.rack.gridX, y: x.rack.gridY, kind: 'liquid' as const, label: x.rack.name })), ...r.swing.map(s => ({ x: s.gridX, y: s.gridY, kind: 'swing' as const, label: s.name }))],
      notes: [`${plural(r.rows.length, 'rack')} from ${kw(r.todayKw)} to ${kw(r.targetKw)} IT (${r.capturePct}% captured by liquid, ${kw(r.liquidKw)}); ${plural(r.swing.length, 'swing position')} hold the load while a row is worked on.`,
        `${r.cdu.units} × ${kw(r.cdu.unitKw)} ${r.cdu.type.toLowerCase()} CDU; ${r.reinforce ? `${r.reinforce} rack${r.reinforce === 1 ? '' : 's'} need floor reinforcement` : 'no floor reinforcement needed'}.`] };
  }
  return { marks: [], proposed: false, notes: [], afterTitle: '' };
}

function GridView({ grid, x, y, cell, marks, title, onTip, foot }: { grid: HallGrid; x: number; y: number; cell: number; marks: Mark[]; title: string; onTip: (c: TipContent) => object; foot: string }) {
  const ch = cell * 1.25, gap = 3, aisle = Math.max(12, cell * 0.45), left = x + 64, top = y + 34;
  const y0 = (r: number) => top + r * (ch + gap + aisle);
  const mk = new Map(marks.map(m => [`${m.x}:${m.y}`, m]));
  return (
    <g>
      <text x={x} y={y + 12} fontSize={11} fontWeight={600} fill={C.ink}>{title}</text>
      {Array.from({ length: grid.cols }, (_, c) => (cell >= 16 || c % 5 === 0 || c === grid.cols - 1) && <text key={c} x={left + c * (cell + gap) + cell / 2} y={top - 6} textAnchor="middle" fontSize={8.5} fill={C.slate}>{c + 1}</text>)}
      {Array.from({ length: grid.rows }, (_, r) => (
        <g key={r}>
          {r > 0 && <text x={left - 6} y={y0(r) - aisle / 2 - gap / 2} dy="0.35em" textAnchor="end" fontSize={8} fill={C.slate}>aisle</text>}
          <text x={x} y={y0(r) + ch / 2} dy="0.35em" fontSize={9.5} fill={grid.rowByY.get(r) ? C.slateDark : C.slate}>{fit(grid.rowByY.get(r)?.name ?? `Grid line ${r + 1}`, 60, 9.5)}</text>
          {Array.from({ length: grid.cols }, (_, c) => {
            const cellRec = grid.cells[r]?.[c]; const state = cellRec?.state ?? 'free'; const m = mk.get(`${c}:${r}`);
            const fill = m ? MARK[m.kind].fill : CELL[state].fill; const stroke = m ? MARK[m.kind].stroke : C.slateLight;
            return (
              <g key={c} {...onTip({ title: `${grid.rowByY.get(r)?.name ?? `Line ${r + 1}`}, position ${c + 1}`, rows: [['Today', CELL[state].label], ...(cellRec?.rack ? [['Rack', `${cellRec.rack.name} · ${cellRec.rack.currentPowerKw} of ${cellRec.rack.maxPowerKw} kW`] as [string, string]] : []), ...(m ? [['This plan', MARK[m.kind].label, MARK[m.kind].stroke] as [string, string, string]] : [])] })}>
                <rect x={left + c * (cell + gap)} y={y0(r)} width={cell} height={ch} rx={2} fill={fill} stroke={stroke} strokeWidth={m ? 1.3 : 0.7} strokeDasharray={m?.kind === 'proposed' ? '3 2' : undefined} />
              </g>
            );
          })}
        </g>
      ))}
      <text x={x} y={y0(grid.rows - 1) + ch + 20} fontSize={10} fill={C.slateDark}>{foot}</text>
    </g>
  );
}

/** The real hall grid from DCIM, before and after the plan. */
export function HallGridSheet({ plan, ev }: { plan: T.PlannerPlan; ev: Evaluation }) {
  const { tip, on } = useTip();
  const { grid, marks, notes, afterTitle } = gridFor(plan, ev);
  if (!grid) return null;
  const count = (s: string) => grid.cells.flat().filter(c => c.state === s).length;
  const side = (W - 40) / 2;
  const cellSide = Math.min(42, (side - 70) / grid.cols - 3);
  const stacked = cellSide < 14;
  const cell = stacked ? Math.min(42, (W - 70) / grid.cols - 3) : cellSide;
  const ch = cell * 1.25, aisle = Math.max(12, cell * 0.45);
  const gridH = 34 + grid.rows * (ch + 3) + (grid.rows - 1) * aisle + 30;
  const H = stacked ? gridH * 2 + 16 : gridH;
  const before = `${num(count('occupied'))} live racks · ${num(count('empty-rack'))} empty cabinets · ${num(count('free'))} free positions`;
  const after = marks.filter(m => m.kind !== 'swing').length;
  const kinds = new Set(marks.map(m => m.kind));
  return (
    <div className="pc-draw fd-draw">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={`${grid.hall.name} grid before and after`}>
        <GridView grid={grid} x={0} y={0} cell={cell} marks={[]} title={`${grid.hall.name} · before`} onTip={on} foot={before} />
        <GridView grid={grid} x={stacked ? 0 : side + 40} y={stacked ? gridH + 16 : 0} cell={cell} marks={marks} title={`${grid.hall.name} · ${afterTitle.replace(/^After/, 'after')}`} onTip={on} foot={`${plural(after, 'position')} changed by ${plan.plnId}${marks.some(m => m.kind === 'swing') ? ` · ${plural(marks.filter(m => m.kind === 'swing').length, 'swing position')}` : ''}`} />
        {!stacked && <path d={`M${side + 8},${gridH / 2} h22 m-7,-6 l7,6 l-7,6`} fill="none" stroke={C.slate} strokeWidth={1.6} />}
      </svg>
      <ChartLegend items={[
        ...(['occupied', 'empty-rack', 'free', 'held'] as const).filter(s => count(s) > 0).map(s => ({ label: CELL[s].label, color: CELL[s].fill })),
        ...([...kinds] as Mark['kind'][]).map(k => ({ label: MARK[k].label, color: MARK[k].fill, kind: k === 'proposed' ? 'dash' as const : 'swatch' as const })),
      ]} />
      <DrawNotes items={[...notes, `Grid ${grid.cols} × ${grid.rows} from DCIM; each row is drawn with the aisle beside it.`]} />
      <ChartTip tip={tip} />
    </div>
  );
}

/* ------------------------------------------------------------------ liquid cooling */
/** Retrofit liquid cooling: facility water to the CDUs, CDUs to the row manifolds, manifolds to each converted rack. */
export function LiquidLoops({ r }: { r: RetrofitResult }) {
  const { tip, on } = useTip();
  const loops = r.cdu.loops;
  if (!loops.length) return null;
  const loopH = 150, top = 20, H = top + loops.length * loopH + 10;
  const fwX = 0, fwW = 180, cduX = 250, manX = 420;
  return (
    <div className="pc-draw fd-draw">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Liquid cooling schematic">
        <g {...on({ title: 'Facility water', rows: [['Chillers', String(r.facilityWater.chillers)], ['Headroom', kw(r.facilityWater.headroomKw)], ['Needed by the retrofit', kw(r.facilityWater.needKw)]] })}>
          <rect x={fwX + 0.5} y={top} width={fwW} height={loops.length * loopH - 20} rx={6} fill={C.wash} stroke={C.slateDark} strokeWidth={1.2} />
          <text x={fwX + 12} y={top + 18} fontSize={9.5} fontWeight={600} letterSpacing={0.6} fill={C.slate}>FACILITY WATER</text>
          <text x={fwX + 12} y={top + 36} fontSize={12} fontWeight={600} fill={C.ink}>{plural(r.facilityWater.chillers, 'chiller')}</text>
          <text x={fwX + 12} y={top + 52} fontSize={10} fill={C.slate}>{kw(r.facilityWater.headroomKw)} headroom</text>
          <text x={fwX + 12} y={top + 66} fontSize={10} fill={r.facilityWater.needKw > r.facilityWater.headroomKw ? C.red : C.slate}>{kw(r.facilityWater.needKw)} needed</text>
        </g>
        {loops.map((l, i) => {
          const y = top + i * loopH, sy = y + 34, ry = y + 42;
          const racks = r.rows.filter(x => !l.rowId || x.rack.rowId === l.rowId);
          const slot = Math.min(120, (W - manX - 40) / Math.max(1, racks.length));
          const units = Math.max(1, l.units), shown = Math.min(units, 2);
          const cx = cduX + 70, cys = Array.from({ length: shown }, (_, k) => y + 26 + k * 54);
          const fR = cduX + 4, rR = cduX + 16, sR = cduX + 118, tR = cduX + 130;
          const manEnd = manX + 30 + racks.length * slot + 10;
          return (
            <g key={l.name}>
              <text x={cduX} y={y + 8} fontSize={11.5} fontWeight={600} fill={C.ink}>{l.name} loop · {kw(l.kw)} to liquid</text>
              <text x={W} y={y + 8} textAnchor="end" fontSize={10} fill={C.slate}>{units} × {kw(r.cdu.unitKw)} {r.cdu.type.toLowerCase()} CDU{l.positionsFree !== undefined ? ` · ${l.positionsNeeded} positions needed, ${l.positionsFree} free in the row` : ''}</text>
              {/* primary: facility water mains to risers at the CDUs */}
              <path d={`M${fwW},${sy} H${fR} V${cys[cys.length - 1] + 8}`} fill="none" stroke={C.cyan} strokeWidth={2.2} />
              <path d={`M${fwW},${ry} H${rR} V${cys[cys.length - 1] + 16}`} fill="none" stroke={C.cyan} strokeWidth={1.6} strokeDasharray="5 3" />
              <text x={fwW + 8} y={sy - 5} fontSize={9} fill={C.cyan}>primary flow</text><text x={fwW + 8} y={ry + 12} fontSize={9} fill={C.cyan}>return</text>
              {/* secondary: CDU risers to the row manifolds */}
              <path d={`M${sR},${cys[cys.length - 1] + 8} V${sy} H${manEnd}`} fill="none" stroke={C.violet} strokeWidth={2.2} />
              <path d={`M${tR},${cys[cys.length - 1] + 16} V${ry} H${manEnd}`} fill="none" stroke={C.violet} strokeWidth={1.6} strokeDasharray="5 3" />
              <text x={manX + 4} y={sy - 6} fontSize={9} fill={C.violet}>secondary supply (TCS)</text><text x={manX + 4} y={ry + 12} fontSize={9} fill={C.violet}>return</text>
              {cys.map((cy, k) => (
                <g key={k} {...on({ title: `CDU ${k + 1} · ${l.name}`, rows: [['Type', r.cdu.type], ['Rating', kw(r.cdu.unitKw)], ['Loop load', kw(l.kw)]] })}>
                  <line x1={fR} y1={cy + 8} x2={cx - 18} y2={cy + 8} stroke={C.cyan} strokeWidth={1.3} /><line x1={rR} y1={cy + 16} x2={cx - 18} y2={cy + 16} stroke={C.cyan} strokeWidth={1.2} strokeDasharray="3 2" />
                  <line x1={cx + 18} y1={cy + 8} x2={sR} y2={cy + 8} stroke={C.violet} strokeWidth={1.3} /><line x1={cx + 18} y1={cy + 16} x2={tR} y2={cy + 16} stroke={C.violet} strokeWidth={1.2} strokeDasharray="3 2" />
                  <CrahSym x={cx} y={cy} liquid />
                  <text x={cx} y={cy + 36} textAnchor="middle" fontSize={9.5} fill={C.ink}>CDU {k + 1}</text>
                </g>
              ))}
              {units > shown && <text x={cx} y={cys[cys.length - 1] + 50} textAnchor="middle" fontSize={9.5} fill={C.slate}>+{units - shown} more</text>}
              {racks.map((x, k) => {
                const rx = manX + 30 + k * slot, ty = y + 76, bw = Math.min(100, slot - 14);
                return (
                  <g key={x.rack.id} {...on({ title: x.rack.name, rows: [['Today', kw(x.todayKw)], ['Target', kw(x.targetKw)], ['Readiness', x.readiness], ['Feeds per side', `${x.feedsPerSide} × ${x.feedAmps} A`], ['Filled weight', `${num(x.filledKg)} of ${num(x.maxKg)} kg`], ['Services', String(x.services)]], note: x.readinessWhy })}>
                    <line x1={rx + 18} y1={sy} x2={rx + 18} y2={ty} stroke={C.violet} strokeWidth={1.2} /><line x1={rx + 30} y1={ry} x2={rx + 30} y2={ty} stroke={C.violet} strokeWidth={1.2} strokeDasharray="3 2" />
                    <circle cx={rx + 18} cy={sy} r={2.5} fill={C.violet} /><circle cx={rx + 30} cy={ry} r={2.5} fill={C.violet} />
                    <rect x={rx} y={ty} width={bw} height={46} rx={2} fill="var(--vw-color-violet-50)" stroke={C.violet} strokeWidth={1.3} />
                    <text x={rx + 6} y={ty + 15} fontSize={10.5} fontWeight={600} fill={C.ink}>{fit(x.rack.name, bw - 10, 10.5)}</text>
                    <text x={rx + 6} y={ty + 29} fontSize={9.5} fill={C.slate}>{kw(x.todayKw)} → {kw(x.targetKw)}</text>
                    <text x={rx + 6} y={ty + 41} fontSize={9} fill={x.readiness === 'ready' ? C.emeraldDark : C.amberDark}>{x.readiness === 'ready' ? 'liquid ready' : x.readiness === 'kit' ? 'retrofit kit' : 'new cabinet'}</text>
                  </g>
                );
              })}
              <text x={manEnd + 6} y={sy} dy="0.35em" fontSize={9} fill={C.violet}>end of row</text>
            </g>
          );
        })}
      </svg>
      <ChartLegend items={[{ label: 'Facility water flow / return', color: C.cyan, kind: 'line' }, { label: 'Secondary loop (TCS) flow / return', color: C.violet, kind: 'line' }, { label: 'Rack on direct liquid cooling', color: 'var(--vw-color-violet-200)' }]} />
      <DrawNotes items={[
        `${kw(r.liquidKw)} of ${kw(r.targetKw)} goes to liquid (${r.capturePct}% capture, ${r.coolingType}); the rest stays on air in the zone.`,
        r.zones.length ? `Air load left in the zone after the retrofit: ${r.zones.map(z => `${z.zone.zone.name} ${z.residualKw > 0 ? kw(z.residualKw) : 'none'}`).join(' · ')}.` : '',
        `Facility water: ${kw(r.facilityWater.needKw)} needed against ${kw(r.facilityWater.headroomKw)} headroom on ${plural(r.facilityWater.chillers, 'chiller')}.`,
        'Flush, fill and pressure test each loop before racks are repopulated (see the wave plan).',
      ]} />
      <ChartTip tip={tip} />
    </div>
  );
}

/* ------------------------------------------------------------------ hall power and cooling */
/** Hall one-line: the site's critical buses to the floor PDUs (existing headroom, new units) and the rows they feed; the cooling zone
 *  with its units, the new CRAH / CDU and the hall's air and liquid load. */
export function HallMep({ ev }: { ev: Evaluation }) {
  const { tip, on } = useTip();
  const ins = ev.scope?.inSite as InSiteAnalysis | undefined; const h = ins?.hall;
  if (!h) return null;
  const rowName = (y: number) => h.grid?.rowByY.get(y)?.name ?? `New row, grid line ${y + 1}`;
  const byRow = new Map<number, number>(); for (const p of h.positions) byRow.set(p.gridY, (byRow.get(p.gridY) ?? 0) + 1);
  const rows = [...byRow.entries()].sort((a, b) => a[0] - b[0]);
  const perRack = h.racks ? h.kw / h.racks : 0;
  const PW = 590, H = 340;
  const buses = [{ side: 'A' as const, x0: 20, x1: 280, col: C.blueDark }, { side: 'B' as const, x0: 310, x1: 570, col: C.violet }];
  const rowW = Math.min(130, (PW - 40) / Math.max(1, rows.length)), rowX = (i: number) => 20 + i * rowW + (PW - 40 - rows.length * rowW) / 2;
  const zone = h.zone;
  const existingUnits = zone?.units.length ?? 0;
  return (
    <div className="pc-draw fd-draw">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Hall power and cooling">
        <text x={0} y={14} fontSize={9.5} fontWeight={600} letterSpacing={0.6} fill={C.slate}>POWER</text>
        {buses.map(b => {
          const n = h.pduPerSide, cw = (b.x1 - b.x0) / Math.max(1, n);
          return (
            <g key={b.side}>
              <line x1={b.x0} y1={44} x2={b.x1} y2={44} stroke={C.ink} strokeWidth={3} />
              <text x={b.x0} y={36} fontSize={10.5} fontWeight={600} fill={C.ink}>Site critical bus {b.side}</text>
              <text x={b.x1} y={36} textAnchor="end" fontSize={9.5} fill={C.slate}>existing PDUs {kw(h.existingPduHeadroom[b.side])} free</text>
              {Array.from({ length: n }, (_, k) => { const cx = b.x0 + cw * (k + 0.5); return (
                <g key={k} {...on({ title: `Floor PDU ${b.side}${k + 1} (new)`, rows: [['Rating', kw(ev.sizing.plant.find(x => x.kind === 'pdu')?.capacityKw ?? 0)], ['Fed from', `site critical bus ${b.side}`]] })}>
                  <line x1={cx} y1={44} x2={cx} y2={80} stroke={C.emeraldDark} strokeWidth={1.4} strokeDasharray="5 3" />
                  <rect x={cx - 4} y={56} width={8} height={8} fill={C.surface} stroke={C.emeraldDark} />
                  <rect x={cx - 46} y={80} width={92} height={34} rx={3} fill={C.surface} stroke={C.emeraldDark} strokeWidth={1.4} strokeDasharray="5 3" />
                  <text x={cx} y={94} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={C.ink}>Floor PDU {b.side}{k + 1}</text>
                  <text x={cx} y={107} textAnchor="middle" fontSize={9.5} fill={C.slate}>{kw(ev.sizing.plant.find(x => x.kind === 'pdu')?.capacityKw ?? 0)} · new</text>
                  <line x1={cx} y1={114} x2={cx} y2={b.side === 'A' ? 150 : 162} stroke={b.col} strokeWidth={1.4} />
                </g>
              ); })}
              {!n && <path d={`M${(b.x0 + b.x1) / 2},44 V${b.side === 'A' ? 150 : 162}`} stroke={b.col} strokeWidth={1.4} fill="none" />}
              {!n && <text x={(b.x0 + b.x1) / 2 + 6} y={100} fontSize={9.5} fill={C.slate}>through the existing PDUs</text>}
              <line x1={20} y1={b.side === 'A' ? 150 : 162} x2={PW - 20} y2={b.side === 'A' ? 150 : 162} stroke={b.col} strokeWidth={2} />
              <text x={PW - 20} y={b.side === 'A' ? 146 : 174} textAnchor="end" fontSize={9} fill={b.col}>{b.side} feeds{b.side === 'B' ? '' : ''}</text>
            </g>
          );
        })}
        {rows.map(([gy, n], i) => {
          const x = rowX(i), cx = x + rowW / 2;
          return (
            <g key={gy} {...on({ title: rowName(gy), rows: [['Racks', String(n)], ['IT load', kw(n * perRack)], ['New row', h.newRows.includes(gy) ? 'yes' : 'no']] })}>
              <line x1={cx - 6} y1={150} x2={cx - 6} y2={196} stroke={C.blueDark} strokeWidth={1.2} /><line x1={cx + 6} y1={162} x2={cx + 6} y2={196} stroke={C.violet} strokeWidth={1.2} />
              <circle cx={cx - 6} cy={150} r={2.5} fill={C.blueDark} /><circle cx={cx + 6} cy={162} r={2.5} fill={C.violet} />
              <rect x={x + 6} y={196} width={rowW - 12} height={58} rx={3} fill="var(--vw-color-emerald-50)" stroke={C.emeraldDark} strokeWidth={1.3} />
              <text x={cx} y={214} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={C.ink}>{fit(rowName(gy).replace(/^New row, /, 'New, '), rowW - 18, 10.5)}</text>
              <text x={cx} y={229} textAnchor="middle" fontSize={9.5} fill={C.slate}>{plural(n, 'rack')}</text>
              <text x={cx} y={243} textAnchor="middle" fontSize={9.5} fill={C.slate}>{kw(n * perRack)}</text>
            </g>
          );
        })}
        <text x={20} y={282} fontSize={10.5} fill={C.slateDark}>{plural(h.racks, 'rack')} · {kw(h.kw)} IT · {h.classes.map(c => `${c.racks} ${c.name} at ${c.kw} kW`).join(' · ')}</text>
        <text x={20} y={298} fontSize={10} fill={C.slate}>Each rack dual-fed, one feed from each side; either side carries the whole rack.</text>
        {/* cooling */}
        <line x1={620} y1={0} x2={620} y2={H - 10} stroke={C.grid} />
        <text x={650} y={14} fontSize={9.5} fontWeight={600} letterSpacing={0.6} fill={C.slate}>COOLING</text>
        <g {...on({ title: zone ? `Cooling zone ${zone.zone.name}` : 'Cooling zone', rows: zone ? [['Usable', kw(zone.usableKw)], ['Load', kw(zone.loadKw)], ['Held', kw(zone.reservedKw)], ['Headroom', kw(zone.headroomKw)]] : [['Zone', 'not recorded']], note: h.zoneSharedWith.length ? `Shared with ${h.zoneSharedWith.join(', ')}` : undefined })}>
          <rect x={650} y={26} width={340} height={56} rx={4} fill={C.wash} stroke={C.slateDark} strokeWidth={1.2} />
          <text x={662} y={44} fontSize={11} fontWeight={600} fill={C.ink}>Cooling zone {fit(zone?.zone.name ?? 'not recorded', 200, 11)}</text>
          <text x={662} y={60} fontSize={10} fill={C.slate}>{zone ? `usable ${kw(zone.usableKw)} · load ${kw(zone.loadKw)} · headroom ${kw(zone.headroomKw)}` : 'no zone recorded for this hall'}</text>
          <text x={662} y={74} fontSize={9.5} fill={C.slate}>{h.zoneSharedWith.length ? fit(`shared with ${h.zoneSharedWith.join(', ')}`, 320, 9.5) : 'serves this hall only'}</text>
        </g>
        <line x1={660} y1={110} x2={980} y2={110} stroke={C.cyan} strokeWidth={2.2} /><line x1={660} y1={118} x2={980} y2={118} stroke={C.cyan} strokeWidth={1.5} strokeDasharray="5 3" />
        <text x={980} y={104} textAnchor="end" fontSize={9} fill={C.cyan}>chilled water flow / return</text>
        <line x1={820} y1={82} x2={820} y2={110} stroke={C.slateLight} />
        {existingUnits > 0 && <g {...on({ title: 'Existing zone units', rows: [['Units', String(existingUnits)], ['Capacity', kw(zone?.capacityKw ?? 0)]] })}>
          <line x1={700} y1={118} x2={700} y2={150} stroke={C.cyan} strokeWidth={1.2} /><CrahSym x={700} y={150} /><text x={700} y={192} textAnchor="middle" fontSize={10} fill={C.ink}>{existingUnits} × existing</text><text x={700} y={205} textAnchor="middle" fontSize={9.5} fill={C.slate}>{kw(zone?.capacityKw ?? 0)} in all</text>
        </g>}
        {Array.from({ length: Math.min(h.crah.units, 4) }, (_, k) => { const cx = 780 + k * 52; return (
          <g key={k} {...on({ title: `New CRAH ${k + 1}`, rows: [['Rating', kw(h.crah.unitKw)], ['Covers', `${kw(h.crah.coversKw)} of air load (N+1)`]] })}>
            <line x1={cx} y1={110} x2={cx} y2={150} stroke={C.emeraldDark} strokeWidth={1.2} strokeDasharray="4 3" /><CrahSym x={cx} y={150} state="new" />
            <text x={cx} y={192} textAnchor="middle" fontSize={10} fontWeight={600} fill={C.emeraldDark}>New {k + 1}</text><text x={cx} y={205} textAnchor="middle" fontSize={9.5} fill={C.slate}>{kw(h.crah.unitKw)}</text>
          </g>
        ); })}
        {h.crah.units > 4 && <text x={990} y={170} textAnchor="end" fontSize={9.5} fill={C.slate}>+{h.crah.units - 4}</text>}
        {h.cdus > 0 && <text x={780} y={222} fontSize={10} fill={C.ink}>{h.cdus} CDU for {kw(h.liquidKw)} liquid</text>}
        <rect x={650} y={236} width={340} height={44} rx={4} fill="var(--vw-color-emerald-50)" stroke={C.emeraldDark} strokeWidth={1.3} />
        <text x={662} y={254} fontSize={11} fontWeight={600} fill={C.ink}>{h.hall?.name ?? 'Hall'} heat load</text>
        <text x={662} y={270} fontSize={10} fill={C.slate}>{kw(h.airKw)} to air{h.liquidKw ? ` · ${kw(h.liquidKw)} to liquid` : ''}{h.crah.coversKw ? ` · new CRAH cover ${kw(h.crah.coversKw)}` : ' · taken by the zone'}</text>
        {(() => { const ax = h.crah.units ? 780 + (Math.min(h.crah.units, 4) - 1) * 26 : 700; return <><path d={`M${ax},212 V236`} stroke={C.slate} strokeWidth={1.2} fill="none" /><path d={`M${ax - 5},229 l5,7 l5,-7`} stroke={C.slate} strokeWidth={1.2} fill="none" /></>; })()}
      </svg>
      <ChartLegend items={[{ label: 'Existing', color: C.slateDark, kind: 'line' }, { label: 'New, added by this plan', color: C.emeraldDark, kind: 'dash' }, { label: 'Side A feeds', color: C.blueDark, kind: 'line' }, { label: 'Side B feeds', color: C.violet, kind: 'line' }, { label: 'Chilled water flow / return', color: C.cyan, kind: 'line' }]} />
      <DrawNotes items={[
        h.pduPerSide ? `The existing PDUs have ${kw(h.existingPduHeadroom.A)} (A) and ${kw(h.existingPduHeadroom.B)} (B) free; ${h.pduPerSide} new floor PDU${h.pduPerSide === 1 ? '' : 's'} per side cover the rest of ${kw(h.kw)}.` : `The existing PDUs carry the ${kw(h.kw)} (${kw(h.existingPduHeadroom.A)} A, ${kw(h.existingPduHeadroom.B)} B free).`,
        `Hall design load ${kw(h.designKw)}; ${kw(Math.max(0, h.designLeftKw))} left after this plan.`,
        h.crah.units ? `${h.crah.units} × ${kw(h.crah.unitKw)} CRAH for ${kw(h.crah.coversKw)} of air load the zone cannot take (N+1).` : 'The zone takes the air load; no new CRAH.',
        'UPS, generators and heat rejection stay with the site plant (see the site\'s plant plan).',
      ]} />
      <ChartTip tip={tip} />
    </div>
  );
}
