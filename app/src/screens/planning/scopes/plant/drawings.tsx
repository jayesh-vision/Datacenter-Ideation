/* Plant drawings for the plan pack and the "Plant and cut-ins" tab: the site's electrical and cooling single-line as it is in the
   records and as it will be after the plan's lines (new units dashed, removed struck through, uprated in amber), and the cut-in
   sequence (one panel per live step: what is isolated, what carries the load, the redundancy left, the window and what is exposed).
   All figures come from the plant analysis (planner/lib/plantModel.ts). */
import { useId } from 'react';
import type { CutInResult, PlantAnalysis, PlantSystem, PlantUnit } from '../../../../planner/lib/plantModel';
import { SYSTEM_LABEL } from '../../../../planner/lib/plantModel';
import { C, useTip, type TipContent } from '../../charts/chartKit';
import { ChartLegend, ChartTip, type LegendItem } from '../../charts/ChartTip';
import { EQ_STYLE, fit, kwLabel, mvaLabel, plural, utc, type EqState } from '../../pack/familyDrawKit';
import { Breaker, ChillerSym, CrahSym, DrawNotes, GenSym, Hatch, SrcSym, StateTag, Struck, TxSym, UpsSym } from '../../pack/familyKit';
import { kw } from '../../common';

interface Item { u: PlantUnit; state: EqState; before?: PlantUnit }
const SHORT: Record<PlantSystem, string> = { utility: 'feed', transformer: 'TX', generator: 'DG', ups: 'UPS', chiller: 'chiller', cooling: 'cooling unit' };

/** Short drawing names of the plan's new units ("New UPS 1"), numbered per system in the order of the plan lines. */
function newNames(an: PlantAnalysis): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of an.after) { let k = 0; for (const u of s.units) if (u.isNew) m.set(u.id, `New ${SHORT[s.system]} ${++k}`); }
  return m;
}
/** Units of a system as drawn: the records (as-is), or the records with the plan's changes (to-be). */
function itemsOf(an: PlantAnalysis, sys: PlantSystem, mode: 'as-is' | 'to-be'): Item[] {
  const before = an.baseline?.systems.find(s => s.system === sys)?.units ?? [];
  if (mode === 'as-is') return before.map(u => ({ u, state: 'existing' }));
  const after = an.after.find(s => s.system === sys)?.units ?? [];
  const names = newNames(an);
  return [
    ...before.map((u): Item => { const now = after.find(x => x.id === u.id); return !now ? { u, state: 'removed' } : Math.abs(now.capacityKw - u.capacityKw) > 0.5 ? { u: now, before: u, state: 'uprated' } : { u: now, state: 'existing' }; }),
    ...after.filter(u => u.isNew).map((u): Item => ({ u: { ...u, name: names.get(u.id) ?? u.name }, before: u, state: 'new' })),
  ];
}
/** System name for running text ("UPS", "room cooling"). */
const sysText = (s: PlantSystem) => { const l = SYSTEM_LABEL[s].split(' (')[0]; return s === 'ups' ? l : l.toLowerCase(); };
const andList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const tipOf = (it: Item, extra: [string, string][] = []): TipContent => ({
  title: it.before && it.state === 'new' ? it.before.name : it.u.name,
  rows: [
    ['Rating', it.u.ratingKva ? `${mvaLabel(it.u.ratingKva, it.u.capacityKw)} (${kwLabel(it.u.capacityKw)})` : kwLabel(it.u.capacityKw)],
    ...(it.state === 'uprated' && it.before ? [['Before', kwLabel(it.before.capacityKw)] as [string, string]] : []),
    ...(it.u.side ? [['Side', it.u.side] as [string, string]] : []),
    ...(it.u.loadKw ? [['Load today', kwLabel(it.u.loadKw)] as [string, string]] : []),
    ...(it.u.model ? [['Model', it.u.model] as [string, string]] : []),
    ...(it.u.stage ? [['Stage', String(it.u.stage)] as [string, string]] : []),
    ...extra,
    ['State', EQ_STYLE[it.state].label, EQ_STYLE[it.state].stroke],
  ],
});

/* ------------------------------------------------------------------ single-line */
const W = 1000;
/** Electrical and cooling single-line of the site, as-is or to-be. */
export function PlantSingleLine({ an, mode }: { an: PlantAnalysis; mode: 'as-is' | 'to-be' }) {
  const { tip, on } = useTip();
  const hid = useId().replace(/:/g, '');
  const b = an.baseline; if (!b) return null;
  const rec = (s: PlantSystem) => b.systems.find(x => x.system === s);
  const util = itemsOf(an, 'utility', mode), tx = itemsOf(an, 'transformer', mode), gen = itemsOf(an, 'generator', mode), ups = itemsOf(an, 'ups', mode);
  const ch = itemsOf(an, 'chiller', mode), cool = itemsOf(an, 'cooling', mode);
  const twoSided = [...util, ...tx, ...ups].some(x => x.u.side);
  const sides: ('A' | 'B' | '')[] = twoSided ? ['A', 'B'] : [''];
  const cols = twoSided ? [{ l: 20, r: 400 }, { l: 600, r: 980 }] : [{ l: 20, r: 690 }];
  const mid = twoSided ? { l: 410, r: 590 } : { l: 720, r: 980 };
  /** Units of a side; units with no side on a two-sided site sit with the side that has fewer. */
  const onSide = (xs: Item[], side: string) => (twoSided ? xs.filter(x => (x.u.side ?? 'A') === side) : xs);
  const cells = (n: number, l: number, r: number, max = 132) => { const w = Math.min(max, (r - l) / Math.max(1, n)); const start = l + ((r - l) - w * n) / 2; return Array.from({ length: n }, (_, i) => start + i * w); };
  const cellW = (n: number, l: number, r: number, max = 132) => Math.min(max, (r - l) / Math.max(1, n));
  const Y = { util: 58, hvBus: 92, tx: 116, lvBus: 182, genSym: 112, genBus: 150, ups: 222, crit: 292, it: 326 };
  const hasCool = ch.length + cool.length > 0;
  const coolTop = 392, H = hasCool ? 560 : 372;
  const lineCol = (s: EqState) => (s === 'removed' ? C.slateLight : s === 'new' ? C.emeraldDark : C.slateDark);
  const label = (x: number, y: number, it: Item, w: number, sub: string) => (
    <g>
      {it.state !== 'existing' && <StateTag x={x} y={y - 13} state={it.state} />}
      <text x={x} y={y} fontSize={11} fontWeight={600} fill={it.state === 'removed' ? C.slate : C.ink}>{fit(it.u.name, w, 11)}</text>
      <text x={x} y={y + 13} fontSize={10} fill={C.slate}>{fit(sub, w, 10)}</text>
    </g>
  );
  const rating = (it: Item) => `${it.u.ratingKva && it.u.system !== 'ups' ? mvaLabel(it.u.ratingKva, it.u.capacityKw) : kwLabel(it.u.capacityKw)}${it.state === 'uprated' && it.before ? ` (was ${kwLabel(it.before.capacityKw)})` : ''}`;
  const unitBox = (it: Item, x: number, y: number, w: number, h: number) => it.state === 'removed' ? <Struck x={x} y={y} w={w} h={h} /> : null;

  const els: React.ReactNode[] = [];
  const itX = twoSided ? 410 : 290, itW = twoSided ? 180 : 260;
  sides.forEach((side, si) => {
    const col = cols[si];
    const su = onSide(util, side), st = onSide(tx, side), sp = onSide(ups, side);
    const busL = col.l + 14, busR = col.r - 14;
    // Utility sources and HV bus
    const ux = cells(su.length, col.l, col.r).map(x => x + cellW(su.length, col.l, col.r) / 2 - 30);
    const txW = cellW(st.length, col.l, col.r), txx = cells(st.length, col.l, col.r).map(x => x + txW / 2 - 30);
    const oneToOne = su.length === st.length;
    su.forEach((it, i) => {
      const x = ux[i];
      els.push(<g key={`u${side}${i}`} {...on(tipOf(it, [['Role', it.u.role ?? '—']]))}>
        <SrcSym x={x} y={Y.util} state={it.state} />
        {label(x + 20, Y.util - 2, it, cellW(su.length, col.l, col.r) - 30, rating(it))}
        <line x1={x} y1={Y.util + 13} x2={x} y2={oneToOne ? Y.tx - 10 : Y.hvBus} stroke={lineCol(it.state)} strokeWidth={1.5} />
        <Breaker x={x} y={Y.util + 26} />
      </g>);
    });
    if (!oneToOne && su.length && st.length) {
      const xs = [...ux, ...txx]; els.push(<line key={`hv${side}`} x1={Math.min(...xs) - 10} y1={Y.hvBus} x2={Math.max(...xs) + 10} y2={Y.hvBus} stroke={C.slateDark} strokeWidth={2.5} />);
    }
    st.forEach((it, i) => {
      const x = oneToOne ? ux[i] : txx[i];
      els.push(<g key={`t${side}${i}`} {...on(tipOf(it))}>
        {!oneToOne && <line x1={x} y1={Y.hvBus} x2={x} y2={Y.tx - 10} stroke={lineCol(it.state)} strokeWidth={1.5} />}
        <TxSym x={x} y={Y.tx} state={it.state} />
        {unitBox(it, x - 11, Y.tx - 11, 22, 35)}
        {label(x + 20, Y.tx + 4, it, (oneToOne ? cellW(su.length, col.l, col.r) : txW) - 30, rating(it))}
        <line x1={x} y1={Y.tx + 23} x2={x} y2={Y.lvBus} stroke={lineCol(it.state)} strokeWidth={1.5} />
        <Breaker x={x} y={Y.tx + 42} />
      </g>);
    });
    // LV switchboard
    els.push(<g key={`lv${side}`}><line x1={busL} y1={Y.lvBus} x2={busR} y2={Y.lvBus} stroke={C.ink} strokeWidth={3} /><text x={side === 'B' ? busR : busL} y={Y.lvBus - 6} textAnchor={side === 'B' ? 'end' : 'start'} fontSize={10} fill={C.slate}>LV switchboard{side ? ` ${side}` : ''}</text></g>);
    // UPS modules
    const uw = cellW(sp.length, col.l, col.r, 128), uxs = cells(sp.length, col.l, col.r, 128);
    sp.forEach((it, i) => {
      const cx = uxs[i] + 24;
      els.push(<g key={`p${side}${i}`} {...on(tipOf(it))}>
        <line x1={cx} y1={Y.lvBus} x2={cx} y2={Y.ups} stroke={lineCol(it.state)} strokeWidth={1.5} strokeDasharray={it.state === 'new' ? '5 3' : undefined} />
        <Breaker x={cx} y={Y.lvBus + 20} color={lineCol(it.state)} />
        <UpsSym x={cx} y={Y.ups} state={it.state} />
        {unitBox(it, cx - 17, Y.ups, 34, 26)}
        <line x1={cx} y1={Y.ups + 26} x2={cx} y2={Y.crit} stroke={lineCol(it.state)} strokeWidth={1.5} strokeDasharray={it.state === 'new' ? '5 3' : undefined} />
        {label(cx + 22, Y.ups + 10, it, uw - 48, `${rating(it)}${it.u.side && !twoSided ? ` · ${it.u.side}` : ''}`)}
      </g>);
    });
    if (!sp.length) els.push(<text key={`np${side}`} x={(busL + busR) / 2} y={Y.ups + 16} textAnchor="middle" fontSize={10} fill={C.slate}>No UPS recorded on this side</text>);
    els.push(<g key={`cb${side}`}><line x1={busL} y1={Y.crit} x2={busR} y2={Y.crit} stroke={C.ink} strokeWidth={3} /><text x={side === 'B' ? busR : busL} y={Y.crit + 14} textAnchor={side === 'B' ? 'end' : 'start'} fontSize={10} fill={C.slate}>Critical bus{side ? ` ${side}` : ''} (UPS output)</text></g>);
    // Down to the IT load
    const lx = side === 'B' ? busL + 40 : busR - 40;
    els.push(<path key={`itl${side}`} d={`M${lx},${Y.crit} V${Y.it + 19} H${side === 'B' ? itX + itW : twoSided ? itX : itX + itW}`} fill="none" stroke={C.slateDark} strokeWidth={1.5} />);
  });
  // Generators, generator bus and the transfer switches onto the LV boards
  if (gen.length) {
    const shown = gen.slice(0, 4), gw = (mid.r - mid.l) / shown.length;
    shown.forEach((it, i) => {
      const x = mid.l + gw * (i + 0.5);
      els.push(<g key={`g${i}`} {...on(tipOf(it, [['Role', it.u.role ?? '—']]))}>
        {it.state !== 'existing' && <StateTag x={x - 16} y={Y.genSym - 20} state={it.state} />}
        <GenSym x={x} y={Y.genSym} state={it.state} />
        {it.state === 'removed' && <Struck x={x - 13} y={Y.genSym - 13} w={26} h={26} />}
        <line x1={x} y1={Y.genSym + 13} x2={x} y2={Y.genBus} stroke={C.amberDark} strokeWidth={1.4} />
        <text x={x} y={Y.genSym - 30 - (it.state !== 'existing' ? 12 : 0)} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={C.ink}>{fit(it.u.name, gw - 4, 10.5)}</text>
        <text x={x} y={Y.genSym - 18 - (it.state !== 'existing' ? 12 : 0)} textAnchor="middle" fontSize={9.5} fill={C.slate}>{kwLabel(it.u.capacityKw)}</text>
      </g>);
    });
    if (gen.length > shown.length) els.push(<text key="gmore" x={mid.r} y={Y.genSym + 30} textAnchor="end" fontSize={10} fill={C.slate}>+{gen.length - shown.length} more</text>);
    els.push(<line key="gbus" x1={mid.l + 6} y1={Y.genBus} x2={mid.r - 6} y2={Y.genBus} stroke={C.amberDark} strokeWidth={2.5} />);
    const ats = (fromX: number, toX: number, key: string) => (
      <g key={key}><path d={`M${fromX},${Y.genBus} H${toX} V${Y.lvBus}`} fill="none" stroke={C.amberDark} strokeWidth={1.4} strokeDasharray="6 4" />
        <rect x={toX - 15} y={Y.genBus + 6} width={30} height={14} rx={2} fill={C.surface} stroke={C.amberDark} /><text x={toX} y={Y.genBus + 13} dy="0.35em" textAnchor="middle" fontSize={8.5} fontWeight={600} fill={C.amberDark}>ATS</text></g>
    );
    els.push(ats(mid.l + 6, cols[0].r - 30, 'atsA'));
    if (twoSided) els.push(ats(mid.r - 6, cols[1].l + 30, 'atsB'));
    els.push(<text key="glab" x={(mid.l + mid.r) / 2} y={Y.genBus + 32} textAnchor="middle" fontSize={10} fill={C.slate}>Standby generators · {rec('generator')?.redundancy ?? ''}</text>);
  }
  // IT load
  const loadNow = b.itLoadKw, held = b.itReservedKw + b.itPipelineKw;
  els.push(<g key="it" {...on({ title: 'IT load', rows: [['Today', kwLabel(loadNow)], ['Held by other plans', kwLabel(held)], ['This plan', kwLabel(b.planKw)], ['PUE', String(b.pue)]] })}>
    <rect x={itX} y={Y.it} width={itW} height={38} rx={4} fill={C.wash} stroke={C.ink} strokeWidth={1.5} />
    <text x={itX + itW / 2} y={Y.it + 15} textAnchor="middle" fontSize={11} fontWeight={600} fill={C.ink}>IT load</text>
    <text x={itX + itW / 2} y={Y.it + 29} textAnchor="middle" fontSize={10} fill={C.slate}>{mode === 'as-is' ? `${kwLabel(loadNow)} today` : `${kwLabel(loadNow + held)} + ${kwLabel(b.planKw)} this plan`}</text>
  </g>);

  // Cooling: chillers on the chilled-water header, room units below it
  if (hasCool) {
    const hdr = coolTop + 74, ret = hdr + 7;
    els.push(<g key="ch-h"><line x1={0} y1={coolTop - 18} x2={W} y2={coolTop - 18} stroke={C.grid} /><text x={4} y={coolTop} fontSize={11} fontWeight={600} fill={C.ink}>Cooling</text>
      <text x={4} y={coolTop + 13} fontSize={10} fill={C.slate}>Chillers {rec('chiller')?.redundancy ?? '—'} · room units {rec('cooling')?.redundancy ?? '—'}</text></g>);
    const cl = 130, cr = W - 20;
    const chw = cellW(ch.length, cl, cr, 150), chx = cells(ch.length, cl, cr, 150);
    ch.forEach((it, i) => {
      const cx = chx[i] + 24;
      els.push(<g key={`c${i}`} {...on(tipOf(it))}>
        <ChillerSym x={cx} y={coolTop + 8} state={it.state} />{unitBox(it, cx - 18, coolTop + 8, 36, 24)}
        <line x1={cx - 6} y1={coolTop + 32} x2={cx - 6} y2={hdr} stroke={C.cyan} strokeWidth={1.4} strokeDasharray={it.state === 'new' ? '5 3' : undefined} />
        <line x1={cx + 6} y1={coolTop + 32} x2={cx + 6} y2={ret} stroke={C.cyan} strokeWidth={1.2} strokeDasharray="3 2" />
        {label(cx + 24, coolTop + 18, it, chw - 50, rating(it))}
      </g>);
    });
    if (!ch.length) els.push(<text key="noch" x={cl} y={coolTop + 26} fontSize={10} fill={C.slate}>No chillers recorded</text>);
    els.push(<g key="hdr"><line x1={cl - 10} y1={hdr} x2={cr} y2={hdr} stroke={C.cyan} strokeWidth={2.5} /><line x1={cl - 10} y1={ret} x2={cr} y2={ret} stroke={C.cyan} strokeWidth={1.5} strokeDasharray="5 3" />
      <text x={cl - 16} y={hdr + 2} textAnchor="end" fontSize={9.5} fill={C.cyan}>CHW flow</text><text x={cl - 16} y={ret + 10} textAnchor="end" fontSize={9.5} fill={C.cyan}>return</text></g>);
    const MAX = 8, shown = cool.slice(0, MAX);
    const kw2 = cellW(shown.length, cl, cr, 124), kx = cells(shown.length, cl, cr, 124);
    shown.forEach((it, i) => {
      const cx = kx[i] + 24, top = ret + 26;
      els.push(<g key={`k${i}`} {...on(tipOf(it, [['Zone', b.zones.find(z => z.zone.id === it.u.zoneId)?.zone.name ?? '—']]))}>
        <line x1={cx} y1={hdr} x2={cx} y2={top} stroke={C.cyan} strokeWidth={1.2} strokeDasharray={it.state === 'new' ? '5 3' : undefined} />
        <CrahSym x={cx} y={top} state={it.state} liquid={/CDU/i.test(it.u.name)} />{unitBox(it, cx - 18, top, 36, 24)}
        {label(cx + 22, top + 10, it, kw2 - 46, rating(it))}
      </g>);
    });
    if (cool.length > MAX) els.push(<text key="kmore" x={cr} y={ret + 70} textAnchor="end" fontSize={10} fill={C.slate}>+{cool.length - MAX} more room units</text>);
  }

  const states = new Set([...util, ...tx, ...gen, ...ups, ...ch, ...cool].map(x => x.state));
  const legend: LegendItem[] = [
    { label: 'Existing', color: C.slateDark, kind: 'line' },
    ...(['new', 'removed', 'uprated'] as EqState[]).filter(s => states.has(s)).map(s => ({ label: EQ_STYLE[s].label, color: EQ_STYLE[s].stroke, kind: s === 'new' ? 'dash' as const : 'line' as const })),
    ...(gen.length ? [{ label: 'Generator backup through the ATS', color: C.amberDark, kind: 'dash' as const }] : []),
    ...(hasCool ? [{ label: 'Chilled water flow / return', color: C.cyan, kind: 'line' as const }] : []),
  ];
  const sysNotes = b.systems.filter(s => s.recorded);
  const notes = mode === 'as-is'
    ? [
      `Usable at redundancy (largest unit lost, one side of 2N): ${sysNotes.map(s => `${sysText(s.system)} ${s.redundancy} ${kw(s.usableKw)}`).join(' · ')}.`,
      `The site accepts ${kw(an.headroomBeforeKw)} more IT today${b.binding ? `; ${sysText(b.binding)} binds first` : ''}.`,
      b.systems.some(s => s.recorded && s.loadSource !== 'measured') ? `Loads on ${andList(b.systems.filter(s => s.recorded && s.loadSource !== 'measured').map(s => sysText(s.system)))} are estimated from the IT load, not metered.` : '',
      b.systems.some(s => !s.recorded) ? `Not in the site records, so not drawn: ${andList(b.systems.filter(s => !s.recorded).map(s => sysText(s.system)))}.` : '',
    ]
    : [
      ...an.after.filter(a => a.addedKw || a.removedKw || a.deltaUsableKw).map(a => `${SYSTEM_LABEL[a.system].split(' (')[0]}: usable ${kw(a.usableKw - a.deltaUsableKw)} → ${kw(a.usableKw)} (${a.deltaUsableKw >= 0 ? '+' : '−'}${kw(Math.abs(a.deltaUsableKw))}) for ${kw(a.requiredKw)} needed.`),
      `After the works the site accepts ${kw(an.capacityEnabledKw)} more IT${an.bindingAfter ? `; ${sysText(an.bindingAfter)} binds first` : ''}.`,
      an.runtimeAfterMin !== undefined ? `Battery runtime after the works about ${an.runtimeAfterMin} minutes at the load after the plan.` : '',
      an.lines.some(l => l.line.system === 'Battery' || l.line.system === 'Switchgear') ? 'Battery and switchgear lines change no unit on this drawing; they are in the bill of materials.' : '',
    ];
  return (
    <div className="pc-draw fd-draw">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={`Plant single-line, ${mode}`}>
        <defs><Hatch id={`h${hid}`} color={C.red} /></defs>
        {els}
      </svg>
      <ChartLegend items={legend} />
      <DrawNotes items={notes} />
      <ChartTip tip={tip} />
    </div>
  );
}

/* ------------------------------------------------------------------ cut-in sequence */
const RED_TONE = (c: CutInResult) => (!c.ok ? C.red : c.redundancyLeft === 'N+1 or better' ? C.emeraldDark : C.amberDark);
/** One panel per cut-in step, in order: the units of the system during the step and what the step leaves. */
export function CutInSequence({ an }: { an: PlantAnalysis }) {
  const { tip, on } = useTip();
  const hid = useId().replace(/:/g, '');
  const steps = an.cutIns;
  if (!steps.length) return null;
  const perRow = Math.min(3, steps.length), gap = 36, pw = (W - gap * (perRow - 1)) / perRow, ph = 268;
  const rows = Math.ceil(steps.length / perRow), H = rows * ph + (rows - 1) * 22;
  const newUnits = an.after.flatMap(s => s.units.filter(u => u.isNew));
  const names = newNames(an);
  /** Inside one system's lane the system word is implied: "New 1" (the to-be single-line calls it "New UPS 1"). */
  const short = (u: PlantUnit) => (names.get(u.id) ?? u.name).replace(/^New [A-Za-z ]+? (\d+)$/, 'New $1');
  return (
    <div className="pc-draw fd-draw">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Cut-in sequence">
        <defs><Hatch id={`i${hid}`} color={C.red} gap={4} /></defs>
        {steps.map((c, i) => {
          const col = i % perRow, row = Math.floor(i / perRow);
          const x = col * (pw + gap), y = row * (ph + 22);
          const connecting = newUnits.filter(u => u.lineId && c.step.connectsLineIds?.includes(u.lineId));
          const iso = new Set(c.isolated.map(u => u.id));
          const items: { u: PlantUnit; state: EqState; name: string }[] = [
            ...[...c.remaining, ...c.isolated].sort((a, b) => Number(!!a.isNew) - Number(!!b.isNew) || a.name.localeCompare(b.name, undefined, { numeric: true })).map(u => ({ u, state: iso.has(u.id) ? 'isolated' as const : 'existing' as const, name: short(u) })),
            ...connecting.map(u => ({ u, state: 'new' as const, name: short(u) })),
            ...(c.temporaryKw > 0 || c.step.temporaryPlant ? [{ u: { id: 'temp', name: c.step.temporaryPlant ?? 'Temporary plant', system: c.system ?? 'ups', capacityKw: c.temporaryKw, loadKw: 0 } as PlantUnit, state: 'temp' as const, name: 'Temp' }] : []),
          ];
          const MAX = 7; let shown = items;
          if (items.length > MAX) { const must = items.filter(it => it.state !== 'existing'); shown = [...must, ...items.filter(it => it.state === 'existing').slice(0, Math.max(0, MAX - must.length))]; }
          const more = items.length - shown.length;
          const slot = Math.min(56, (pw - 28) / Math.max(1, shown.length + (more ? 1 : 0)));
          const busY = y + 88, symY = busY + 18;
          const title = c.step.title;
          const words = title.split(' '); const lines: string[] = ['']; for (const w of words) { const t = lines[lines.length - 1]; if (((t ? `${t} ${w}` : w).length * 6.3) > pw - 52 && t) lines.push(w); else lines[lines.length - 1] = t ? `${t} ${w}` : w; }
          const end = c.window.end ? new Date(c.window.end) : undefined;
          const tone = RED_TONE(c);
          const facts: [string, string, string?][] = [
            ['Transfer', c.step.transfer === 'None' ? 'None (tie-in)' : c.step.transfer],
            ['In service', `${kw(c.remainingKw + c.temporaryKw)} for ${kw(c.liveLoadKw)} live`],
            ['Redundancy', c.ok ? c.redundancyLeft : `short (${c.redundancyLeft})`, tone],
            ['Exposed', `${plural(c.exposedRackIds.length, 'rack')} · ${plural(c.services, 'service')}${c.critical ? ` · ${c.critical} critical` : ''}`],
            ['Change', c.step.changeRequestId ?? 'raised at execution'],
          ];
          return (
            <g key={c.step.id} {...on({ title: `${c.order}. ${c.step.title}`, rows: [['Isolated', c.isolated.map(u => u.name).join(', ') || 'nothing'], ['Transfer', c.step.transfer], ['Left / live', `${kw(c.remainingKw + c.temporaryKw)} / ${kw(c.liveLoadKw)}`], ['Redundancy', c.redundancyLeft, tone], ['Window', `${utc(c.window.start)} UTC`], ['Customers', c.customers.slice(0, 3).map(x => x.name).join(', ') || 'none']], note: c.step.mitigation || c.notes[0] })}>
              <rect x={x + 0.5} y={y + 0.5} width={pw - 1} height={ph - 1} rx={4} fill={C.surface} stroke={C.slateLight} />
              <rect x={x + 0.5} y={y + 0.5} width={4} height={ph - 1} rx={2} fill={tone} />
              <circle cx={x + 24} cy={y + 22} r={11} fill={C.ink} /><text x={x + 24} y={y + 22} dy="0.35em" textAnchor="middle" fontSize={11} fontWeight={600} fill={C.surface}>{c.order}</text>
              {lines.slice(0, 2).map((t, k) => <text key={k} x={x + 42} y={y + 19 + k * 14} fontSize={11.5} fontWeight={600} fill={C.ink}>{k === 1 && lines.length > 2 ? fit(t + '…', pw - 52, 11.5) : t}</text>)}
              <text x={x + 14} y={y + 56} fontSize={10} fill={C.slate}>{utc(c.window.start)}{end ? `–${end.toISOString().slice(11, 16)}` : ''} UTC · stage {c.step.stage ?? 1}{c.window.proposed ? ' · proposed' : ''}</text>
              <text x={x + 14} y={busY - 8} fontSize={9.5} fontWeight={600} letterSpacing={0.5} fill={C.slate}>{(c.system ? SYSTEM_LABEL[c.system].split(' (')[0] : 'Plant').toUpperCase()} DURING THE STEP</text>
              <line x1={x + 14} y1={busY} x2={x + pw - 14} y2={busY} stroke={C.ink} strokeWidth={2.5} />
              {shown.map((it, k) => {
                const cx = x + 14 + slot * (k + 0.5);
                const s = it.state, st = EQ_STYLE[s];
                const Sym = c.system === 'chiller' ? ChillerSym : c.system === 'cooling' ? CrahSym : c.system === 'generator' ? null : UpsSym;
                return (
                  <g key={it.u.id + k}>
                    <line x1={cx} y1={busY} x2={cx} y2={symY} stroke={s === 'isolated' ? C.red : st.stroke} strokeWidth={1.3} strokeDasharray={s === 'new' || s === 'temp' ? '4 3' : s === 'isolated' ? '2 2' : undefined} />
                    {s === 'isolated' && <g stroke={C.red} strokeWidth={1.4}><line x1={cx - 5} y1={busY + 5} x2={cx + 5} y2={busY + 13} /><line x1={cx + 5} y1={busY + 5} x2={cx - 5} y2={busY + 13} /></g>}
                    {Sym ? <Sym x={cx} y={symY} state={s} /> : <GenSym x={cx} y={symY + 13} state={s} />}
                    {s === 'isolated' && <rect x={cx - 18} y={symY} width={36} height={26} fill={`url(#i${hid})`} opacity={0.5} />}
                    <text x={cx} y={symY + 40} textAnchor="middle" fontSize={9} fill={s === 'existing' ? C.slateDark : st.stroke} fontWeight={s === 'existing' ? 400 : 600}>{fit(it.name, slot - 2, 9)}</text>
                    {s !== 'existing' && <text x={cx} y={symY + 51} textAnchor="middle" fontSize={7.5} fontWeight={600} letterSpacing={0.4} fill={st.stroke}>{st.tag}</text>}
                  </g>
                );
              })}
              {more > 0 && <text x={x + 14 + slot * (shown.length + 0.5)} y={symY + 16} textAnchor="middle" fontSize={9.5} fill={C.slate}>+{more}</text>}
              {facts.map(([k, v, col2], j) => (
                <g key={k} transform={`translate(${x + 14},${y + 178 + j * 16})`}>
                  <text fontSize={10} fill={C.slate}>{k}</text>
                  <text x={72} fontSize={10.5} fill={col2 ?? C.ink} fontWeight={col2 ? 600 : 400}>{fit(v, pw - 90, 10.5)}</text>
                </g>
              ))}
              {col < perRow - 1 && i < steps.length - 1 && <path d={`M${x + pw + 8},${y + ph / 2 - 8} l12,8 l-12,8`} fill="none" stroke={C.slate} strokeWidth={1.6} />}
            </g>
          );
        })}
      </svg>
      <ChartLegend items={[
        { label: 'In service', color: C.slateDark, kind: 'line' }, { label: 'Isolated for the step', color: C.red, kind: 'hatch' },
        { label: 'New unit connected by the step', color: C.emeraldDark, kind: 'dash' }, { label: 'Temporary plant', color: C.amberDark, kind: 'dash' },
        { label: 'N+1 or better left', color: C.emeraldDark }, { label: 'N left', color: C.amberDark }, { label: 'Below N', color: C.red },
      ]} />
      <DrawNotes items={[
        'One change window per step, in this order; the step after starts only when the one before is accepted.',
        steps.some(c => c.needsTemporaryPlant) ? `Temporary plant is needed where redundancy drops below N+1: ${steps.filter(c => c.needsTemporaryPlant).map(c => `step ${c.order}${c.temporaryLine ? ` (${c.temporaryLine.item.toLowerCase()}, ${kw(c.temporaryLine.kw)})` : ''}`).join(', ')}.` : 'No step drops the system below N+1, so no temporary plant is needed.',
        steps.some(c => c.window.proposed) ? 'Proposed windows are the next free change nights after delivery; they are booked when the plan is executed.' : '',
      ]} />
      <ChartTip tip={tip} />
    </div>
  );
}
