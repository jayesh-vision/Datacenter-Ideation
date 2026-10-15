/* Wave plan for the replace, migration and retrofit plan types (plan pack sheet and the "Waves and closure" tab): one lane per wave
   on a dated axis, coloured by what the wave does (pilot, wave, drain, works, repopulate), its window, what it touches and its
   change; soak periods between the A and B sides of a refresh, today and the plan's target or exit date. Figures come from the
   plan's waves and the family analysis (replaceAnalysis / migrationCore / inSiteAnalysis). */
import { useId } from 'react';
import type * as T from '../../../../planner/p2b/types';
import type { Evaluation } from '../../../../planner/lib/engine';
import type { InSiteAnalysis } from '../../../../planner/lib/inSiteAnalysis';
import { REPLACE_SCOPES } from '../../../../planner/lib/outputs';
import { replaceOf } from '../../../../planner/lib/replaceAnalysis';
import { migrationOf } from '../../../../planner/lib/migrationCore';
import { clockMs } from '../../../../planner/compat/clock';
import { C, useTip, useWidth } from '../../charts/chartKit';
import { ChartLegend, ChartTip, type LegendItem } from '../../charts/ChartTip';
import { dayShort, fit, monShort, plural, utc } from '../../pack/familyDrawKit';
import { DrawNotes, Hatch } from '../../pack/familyKit';
import { date } from '../../common';

const DAY = 864e5;
const KIND: Record<T.PlannerWave['kind'], { color: string; label: string }> = {
  pilot: { color: C.sky, label: 'Pilot wave' }, wave: { color: C.blueDark, label: 'Wave' }, drain: { color: C.amber, label: 'Drain' },
  works: { color: C.violet, label: 'Works (no load)' }, repopulate: { color: C.teal, label: 'Repopulate' }, soak: { color: C.slateLight, label: 'Soak' },
};

/** The waves the plan runs: its own (replace, migration) or the retrofit's (accepted or proposed). */
function wavesOf(plan: T.PlannerPlan, ev: Evaluation): { waves: T.PlannerWave[]; proposed: boolean } {
  const ins = ev.scope?.inSite as InSiteAnalysis | undefined;
  if (ins?.type === 'retrofit' && ins.retrofit) return { waves: ins.retrofit.waves, proposed: ins.retrofit.wavesProposed };
  return { waves: plan.waves ?? [], proposed: false };
}

const ISSUE_TEXT: Record<string, [string, string]> = { pair: ['redundant pair in one wave', 'redundant pairs in one wave'], order: ['side B before the soak ends', 'side B waves before the soak ends'], capacity: ['wave over the crew capacity', 'waves over the crew capacity'], clash: ['clash with other work', 'clashes with other work'], upstream: ['upstream change in the window', 'upstream changes in the window'], coverage: ['item in no wave or two', 'items in no wave or two'], window: ['window problem', 'window problems'], consent: ['consent not in time', 'consents not in time'] };
/** Wave check problems counted by kind, with the first one as an example ("330 redundant pairs in one wave, 1 clash with other work; for example …"). */
function waveIssueSummary(issues: { kind: string; text: string }[]): string {
  const by = new Map<string, number>(); for (const x of issues) by.set(x.kind, (by.get(x.kind) ?? 0) + 1);
  const parts = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${(ISSUE_TEXT[k] ?? [k, k])[n === 1 ? 0 : 1]}`);
  return `${parts.join(', ')}${issues.length > 1 ? `; for example ${issues[0].text.replace(/\.$/, '')}` : ` (${issues[0].text.replace(/\.$/, '')})`}`;
}

export function WaveTimeline({ plan, ev }: { plan: T.PlannerPlan; ev: Evaluation }) {
  const { tip, on } = useTip();
  const [ref, width] = useWidth(1000);
  const hid = useId().replace(/:/g, '');
  const { waves: raw, proposed } = wavesOf(plan, ev);
  const waves = [...raw].filter(w => !Number.isNaN(new Date(w.windowStart).getTime())).sort((a, b) => a.order - b.order);
  if (!waves.length) return null;
  const now = clockMs();
  const ws = (w: T.PlannerWave) => new Date(w.windowStart).getTime();
  const we = (w: T.PlannerWave) => { const e = new Date(w.windowEnd).getTime(); return Number.isNaN(e) ? ws(w) + 6 * 3600e3 : e; };
  const mig = plan.scope === 'migration' && ev.ctx?.data ? migrationOf(ev) : undefined;
  const rep = REPLACE_SCOPES.includes(plan.scope) && ev.ctx?.data ? replaceOf(ev) : undefined;
  const target = mig?.exitDate ?? plan.targetGoLive;
  const tgt = target ? new Date(target).getTime() : NaN;
  const first = Math.min(...waves.map(ws)), last = Math.max(...waves.map(we));
  const span0 = Math.max(7 * DAY, last - first);
  const showNow = now < last && now > first - span0;
  const t0 = Math.min(first, showNow ? now : first) - Math.max(3 * DAY, span0 * 0.06);
  const t1 = Math.max(last, !Number.isNaN(tgt) && tgt < last + span0 ? tgt : last) + Math.max(4 * DAY, span0 * 0.08);
  const w = Math.max(640, width), labelW = Math.min(280, w * 0.3), right = 16, iw = w - labelW - right;
  const X = (t: number) => labelW + ((t - t0) / (t1 - t0)) * iw;
  const aEnd = waves.filter(x => x.side === 'A').map(we), bStart = waves.filter(x => x.side === 'B').map(ws);
  const soak = aEnd.length && bStart.length && Math.min(...bStart) > Math.max(...aEnd) ? { a: Math.max(...aEnd), b: Math.min(...bStart) } : undefined;
  const top = 44, rowH = 40, ih = waves.length * rowH, H = top + ih + (soak ? 30 : 14);
  const span = t1 - t0;
  // Axis: weeks for short programmes, months otherwise.
  const ticks: { t: number; label: string; major: boolean }[] = [];
  if (span <= 75 * DAY) { const d = new Date(t0); d.setUTCHours(0, 0, 0, 0); while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1); for (; d.getTime() < t1; d.setUTCDate(d.getUTCDate() + 7)) ticks.push({ t: d.getTime(), label: dayShort(d.getTime()), major: d.getUTCDate() <= 7 }); }
  else { const d = new Date(t0); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0); d.setUTCMonth(d.getUTCMonth() + 1); const every = span > 540 * DAY ? 3 : span > 270 * DAY ? 2 : 1; let i = 0; for (; d.getTime() < t1; d.setUTCMonth(d.getUTCMonth() + 1), i++) ticks.push({ t: d.getTime(), label: i % every === 0 ? `${monShort(d.getTime())}${d.getUTCMonth() === 0 || i === 0 ? ` '${String(d.getUTCFullYear()).slice(2)}` : ''}` : '', major: d.getUTCMonth() === 0 }); }
  const scopeText = (x: T.PlannerWave) => [x.deviceIds.length ? plural(x.deviceIds.length, 'device') : '', x.rackIds.length ? plural(x.rackIds.length, 'rack') : '', x.serviceIds.length ? plural(x.serviceIds.length, 'service') : '', x.itKw ? `${Math.round(x.itKw)} kW` : ''].filter(Boolean).join(' · ') || 'no recorded devices';
  /** Window text: "Oct 13, 2026 22:00–04:00 UTC", or with the end date when the window runs over several days. */
  const winText = (x: T.PlannerWave) => { const e = we(x); const multi = e - ws(x) > 30 * 3600e3; return `${utc(x.windowStart)}–${multi ? utc(new Date(e).toISOString()).replace(/, \d{4}/, '') : new Date(e).toISOString().slice(11, 16)} UTC`; };
  const kinds = [...new Set(waves.map(x => x.kind))];
  const legend: LegendItem[] = [
    ...kinds.map(k => ({ label: KIND[k].label, color: KIND[k].color })),
    ...(soak ? [{ label: rep?.soakDays ? `Soak before side B (at least ${rep.soakDays} days)` : 'Soak before side B', color: C.slate, kind: 'hatch' as const }] : []),
    { label: 'Closed', color: C.emeraldDark, kind: 'dot' },
    ...(!Number.isNaN(tgt) && tgt >= t0 && tgt <= t1 ? [{ label: mig ? 'Site exit date' : 'Target date', color: C.emeraldDark, kind: 'line' as const }] : []),
  ];
  const issues = (rep?.waveCheck ?? mig?.waveCheck)?.issues ?? [];
  return (
    <div ref={ref} className="pc-draw fd-draw">
      <svg viewBox={`0 0 ${w} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={`Wave plan: ${waves.length} waves`}>
        <defs><Hatch id={`k${hid}`} color={C.slateLight} gap={5} /></defs>
        {ticks.map(t => <g key={t.t}><line x1={X(t.t)} y1={top - 6} x2={X(t.t)} y2={top + ih} stroke={t.major ? C.slateLight : C.grid} strokeDasharray={t.major ? undefined : '2 3'} />{t.label && <text x={X(t.t)} y={top - 10} textAnchor="middle" fontSize={9.5} fill={C.slate}>{t.label}</text>}</g>)}
        {soak && <g><rect x={X(soak.a)} y={top} width={Math.max(1, X(soak.b) - X(soak.a))} height={ih} fill={`url(#k${hid})`} opacity={0.8} /><text x={(X(soak.a) + X(soak.b)) / 2} y={top + ih + 16} textAnchor="middle" fontSize={9.5} fill={C.slateDark}>soak {Math.round((soak.b - soak.a) / DAY)} days</text></g>}
        {waves.map((x, i) => {
          const y = top + i * rowH, a = X(ws(x)), b = Math.max(X(we(x)), a + 8), k = KIND[x.kind];
          const closed = x.status === 'Closed', off = x.status === 'Cancelled' || x.status === 'Rolled back';
          const l1 = winText(x), l2 = `${scopeText(x)}${x.changeRequestId ? ` · ${x.changeRequestId}` : ''}`;
          const txtW = Math.max(l1.length, l2.length) * 5.2, fitsRight = b + 8 + txtW < w - right || b - labelW < (w - right) - b;
          return (
            <g key={x.id} {...on({ title: `${x.order}. ${x.name}`, rows: [['Window', `${utc(x.windowStart)} to ${utc(x.windowEnd)} UTC`], ['Kind', k.label], ...(x.side ? [['Side', x.side] as [string, string]] : []), ['Touches', scopeText(x)], ['Status', x.status], ...(x.changeRequestId ? [['Change', x.changeRequestId] as [string, string]] : []), ...(x.closedAt ? [['Closed', date(x.closedAt)] as [string, string]] : [])], note: x.method ?? x.rollback })}>
              {i % 2 === 1 && <rect x={0} y={y} width={w} height={rowH} fill={C.wash} opacity={0.7} />}
              <text x={8} y={y + 16} fontSize={11} fontWeight={600} fill={off ? C.slate : C.ink}>{fit(`${x.order}. ${x.name}`, labelW - 16, 11)}</text>
              <text x={8} y={y + 30} fontSize={9.5} fill={closed ? C.emeraldDark : C.slate}>{[k.label.toLowerCase(), x.side ? `side ${x.side}` : '', x.status.toLowerCase()].filter(Boolean).join(' · ')}</text>
              <rect x={a} y={y + 10} width={b - a} height={20} rx={3} fill={k.color} opacity={off ? 0.35 : closed ? 1 : 0.85} stroke={closed ? C.emeraldDark : 'none'} strokeWidth={1.5} />
              {closed && <path d={`M${a + (b - a) / 2 - 4},${y + 20} l3,3 l5,-6`} fill="none" stroke={C.surface} strokeWidth={1.8} />}
              {[l1, l2].map((t, k) => <text key={k} x={fitsRight ? b + 8 : a - 8} y={y + 14 + k * 13} dy="0.35em" textAnchor={fitsRight ? 'start' : 'end'} fontSize={9.5} fontWeight={k ? 400 : 500} fill={k ? C.slate : C.slateDark}>{fit(t, fitsRight ? w - right - b - 8 : a - labelW - 12, 9.5)}</text>)}
            </g>
          );
        })}
        {showNow && <g><line x1={X(now)} y1={top - 4} x2={X(now)} y2={top + ih} stroke={C.slateDark} strokeDasharray="3 3" /><text x={X(now)} y={top - 26} textAnchor="middle" fontSize={9.5} fontWeight={600} fill={C.slateDark}>today</text></g>}
        {!Number.isNaN(tgt) && tgt >= t0 && tgt <= t1 && <g><line x1={X(tgt)} y1={top - 4} x2={X(tgt)} y2={top + ih} stroke={C.emeraldDark} strokeWidth={2} /><text x={X(tgt)} y={top - 26} textAnchor={X(tgt) > w - 90 ? 'end' : 'middle'} fontSize={9.5} fontWeight={600} fill={C.emeraldDark}>{mig ? 'exit' : 'target'} {dayShort(tgt)}</text></g>}
      </svg>
      <ChartLegend items={legend} />
      <DrawNotes items={[
        proposed ? 'The waves are proposed by the planner and not accepted yet; accept them on the Migration step.' : '',
        rep ? `Each window is ${rep.windowHours} h at about ${rep.rate} device${rep.rate === 1 ? '' : 's'} an hour; the two halves of a redundant pair are never in the same wave${soak ? ', and side B starts only after the soak' : ''}.` : mig ? `Each window is ${mig.window} h at about ${mig.rate} device${mig.rate === 1 ? '' : 's'} an hour; consent notices must end before a customer's first wave.` : '',
        issues.length ? `Wave check: ${waveIssueSummary(issues)}.` : 'Wave check: no pair split, clash or capacity problem.',
        'Each wave gets its own change request, maintenance window and acceptance test when the plan is executed.',
      ]} />
      <ChartTip tip={tip} />
    </div>
  );
}
