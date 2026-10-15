/* Network (DCI / WAN) drawings for the plan pack and the "Paths and circuits" tab: the interconnect path diagram (A site → carrier,
   cable system and landings → Z site, one lane per new path and per existing circuit, end devices and ports, with the diversity check
   between paths), and the cut-over and cease plan (each path from carrier order to service, the old circuits to their cease date).
   All figures come from the network analysis (planner/lib/networkModel.ts) and the plan's schedule. */
import { useId } from 'react';
import type * as T from '../../../../planner/p2b/types';
import type { ScheduleItem } from '../../../../planner/lib/engine';
import type { EndInfo, NetworkAnalysis, PathResult } from '../../../../planner/lib/networkModel';
import { clockMs } from '../../../../planner/compat/clock';
import { C, useTip, useWidth } from '../../charts/chartKit';
import { ChartLegend, ChartTip } from '../../charts/ChartTip';
import { dayShort, fit, monShort, plural, utc } from '../../pack/familyDrawKit';
import { DrawNotes, Hatch } from '../../pack/familyKit';
import { date, money, num } from '../../common';

const PATH_COL = [C.blueDark, C.violet, C.teal, C.indigo, C.cyan];
const gb = (g: number) => (g >= 1000 ? `${Math.round(g / 100) / 10} Tbps` : `${Math.round(g * 10) / 10} Gbps`);
const W = 1000, EW = 212;

/* shared-risk groups by kind: a subsea cable between landing stations, or a terrestrial route ("Route: …") through carrier POPs */
interface Seg { cables: string[]; landings: string[]; route?: string; pops: string[]; other: string[] }
const segOf = (p: T.PlannerNetworkPath): Seg => {
  const g = p.sharedRiskGroups ?? [];
  const after = (x: string) => x.replace(/^[^:]+:\s*/, '');
  const route = g.find(x => /^route:/i.test(x));
  return { cables: g.filter(x => /^cable/i.test(x)).map(after), landings: g.filter(x => /^landing/i.test(x)).map(after), route: route ? after(route).replace(/ via .*$/, '') : undefined, pops: g.filter(x => /^pop:/i.test(x)).map(after), other: g.filter(x => !/^(cable|landing|route|pop):?/i.test(x)) };
};

function EndBlock({ end, x, h, label }: { end: EndInfo; x: number; h: number; label: string }) {
  return (
    <g>
      <rect x={x + 0.5} y={0.5} width={EW - 1} height={h - 1} rx={6} fill={C.wash} stroke={C.slateDark} strokeWidth={1.2} />
      <text x={x + 12} y={18} fontSize={9.5} fontWeight={600} letterSpacing={0.6} fill={C.slate}>{label}</text>
      <text x={x + 12} y={34} fontSize={12.5} fontWeight={600} fill={C.ink}>{fit(end.dc?.name ?? 'not set', EW - 24, 12.5)}</text>
      <text x={x + 12} y={48} fontSize={10} fill={C.slate}>{fit([end.dc?.tier, end.colo ? 'colocation' : 'own site', plural(end.routers.length, 'router')].filter(Boolean).join(' · '), EW - 24, 10)}</text>
    </g>
  );
}

/** Interconnect path diagram: A end, each path through its carrier and cable system to the Z end; existing circuits below; diversity. */
export function DciPaths({ an }: { an: NetworkAnalysis }) {
  const { tip, on } = useTip();
  const hid = useId().replace(/:/g, '');
  const paths = an.paths, circuits = an.circuits;
  if (!paths.length && !circuits.length) return null;
  const top = 66, laneH = 100;
  const lanes = paths.length + circuits.length;
  const blockH = top + lanes * laneH + 4;
  const pairs: [PathResult, PathResult][] = [];
  for (let i = 0; i < paths.length; i++) for (let j = i + 1; j < paths.length; j++) pairs.push([paths[i], paths[j]]);
  const tableY = blockH + 30, rowH = 22, H = tableY + 30 + Math.max(1, pairs.length) * rowH + 6;
  const L = EW + 14, R = W - EW - 14;
  const shareOf = (p: PathResult) => (an.diversity?.shared ?? []).filter(t => t.includes(p.path.name));
  const portText = (c: PathResult['a'], g: number) => c.port ? `${c.port}${c.lineCard ? ' · line card' : ''}` : c.lineCard ? `no free ${g}G port · line card` : c.detail;
  const prov = (p: PathResult) => p.provider?.name ?? p.path.providerName;
  return (
    <div className="pc-draw fd-draw">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={`Interconnect paths between ${an.a.dc?.name ?? 'A'} and ${an.z.dc?.name ?? 'Z'}`}>
        <defs><Hatch id={`s${hid}`} color={C.red} gap={4} /></defs>
        <EndBlock end={an.a} x={0} h={blockH} label="A END" />
        <EndBlock end={an.z} x={W - EW} h={blockH} label="Z END" />
        {paths.map((p, i) => {
          const y = top + i * laneH + 46, col = PATH_COL[i % PATH_COL.length];
          const seg = segOf(p.path); const shared = shareOf(p);
          const lx = [L + (R - L) * 0.28, L + (R - L) * 0.72];
          const sub = p.subsea || /subsea/i.test(p.reachClass);
          const wave = (x0: number, x1: number) => { let d = `M${x0},${y}`; const n = Math.max(4, Math.round((x1 - x0) / 18)); const step = (x1 - x0) / n; for (let k = 0; k < n; k++) d += ` q${step / 4},${k % 2 ? 6 : -6} ${step / 2},0 t${step / 2},0`; return d; };
          const hasLand = seg.landings.length >= 2;
          return (
            <g key={p.path.id} {...on({ title: `${p.path.name} · ${prov(p)}`, rows: [['Link type', p.path.linkType], ['Capacity', gb(p.path.capacityGbps)], ['Distance', `${num(p.distanceKm)} km`], ['Latency (RTT)', `${p.latencyMsRtt} ms`], ['Optic', `${p.optic.model} (${num(p.optic.reachKm)} km reach)`], ['Route', p.path.routeId ?? 'not recorded'], ['Shared-risk groups', p.path.sharedRiskGroups.join(', ') || 'none recorded'], ['Charges', `${money(p.path.monthlyUsd)} a month + ${money(p.path.installUsd)} install, ${p.path.termMonths} months`]], note: [p.distanceSource, ...p.problems].join('. ') })}>
              {/* end devices */}
              {([['a', 10], ['z', W - EW + 10]] as const).map(([k, x]) => { const c = p[k]; return (
                <g key={k}>
                  <rect x={x} y={y - 19} width={EW - 20} height={38} rx={4} fill={C.surface} stroke={c.ok ? C.slateDark : C.red} />
                  <text x={x + 8} y={y - 4} fontSize={10.5} fontWeight={600} fill={C.ink}>{fit(c.device?.name ?? 'no device picked', EW - 36, 10.5)}</text>
                  <text x={x + 8} y={y + 10} fontSize={9.5} fill={c.lineCard ? C.amberDark : C.slate}>{fit(portText(c, p.path.capacityGbps), EW - 36, 9.5)}</text>
                </g>
              ); })}
              <circle cx={EW - 10} cy={y} r={3.5} fill={col} /><circle cx={W - EW + 10} cy={y} r={3.5} fill={col} />
              {/* path line: terrestrial tails and the cable between landings */}
              {hasLand ? <>
                <line x1={EW - 10} y1={y} x2={lx[0]} y2={y} stroke={col} strokeWidth={2.2} />
                <path d={wave(lx[0], lx[1])} fill="none" stroke={col} strokeWidth={2.2} />
                <line x1={lx[1]} y1={y} x2={W - EW + 10} y2={y} stroke={col} strokeWidth={2.2} />
                {seg.landings.slice(0, 2).map((t, k) => <g key={t}><rect x={lx[k] - 5} y={y - 5} width={10} height={10} fill={C.surface} stroke={col} strokeWidth={1.6} /><text x={lx[k]} y={y + 20} textAnchor="middle" fontSize={9.5} fill={C.slateDark}>{fit(t, 150, 9.5)}</text></g>)}
                <text x={(lx[0] + lx[1]) / 2} y={y - 12} textAnchor="middle" fontSize={10} fontWeight={600} fill={col}>{fit(`${seg.cables.join(' / ') || 'Cable system'}${sub ? ' · subsea' : ''}`, lx[1] - lx[0] - 20, 10)}</text>
              </> : <>
                <line x1={EW - 10} y1={y} x2={W - EW + 10} y2={y} stroke={col} strokeWidth={2.2} strokeDasharray={p.path.linkType === 'Leased IP transit' ? '7 4' : undefined} />
                {(seg.cables.length > 0 || seg.route) && <text x={W / 2} y={y - 8} textAnchor="middle" fontSize={10} fontWeight={600} fill={col}>{fit(seg.cables.length ? seg.cables.join(' / ') : `${seg.route} · terrestrial`, 300, 10)}</text>}
                {seg.pops.slice(0, 4).map((c, k, a) => { const x = L + ((R - L) * (k + 1)) / (a.length + 1); return <g key={c}><circle cx={x} cy={y} r={4} fill={C.surface} stroke={col} strokeWidth={1.6} /><text x={x} y={y + 18} textAnchor="middle" fontSize={9.5} fill={C.slateDark}>{fit(c, (R - L) / (a.length + 1) - 8, 9.5)}</text></g>; })}
              </>}
              {/* lane header and figures */}
              <text x={L} y={y - 30} fontSize={11.5} fontWeight={600} fill={C.ink}>{p.path.name} · {fit(`${prov(p)} · ${p.path.linkType.toLowerCase()} · ${gb(p.path.capacityGbps)}`, R - L - 80, 11.5)}</text>
              {shared.length > 0 && <text x={R} y={y - 30} textAnchor="end" fontSize={10} fontWeight={600} fill={C.red}>shared risk</text>}
              <text x={L} y={y + 36} fontSize={10} fill={C.slate}>{fit([`${num(p.distanceKm)} km`, `${p.latencyMsRtt} ms RTT`, p.reachClass, p.path.routeId ? `route ${p.path.routeId}` : 'route not recorded', p.optic.model, ...seg.other].join(' · '), R - L, 10)}</text>
            </g>
          );
        })}
        {circuits.map((c, j) => {
          const i = paths.length + j, y = top + i * laneH + 46;
          const ceased = c.action === 'cease' || c.action === 'upgrade';
          const col = ceased ? C.red : C.slate;
          const by = c.replacedByPathId ? paths.find(p => p.path.id === c.replacedByPathId)?.path.name : undefined;
          return (
            <g key={c.circuit.id} {...on({ title: `${c.circuit.cid} · ${c.provider?.name ?? 'carrier'}`, rows: [['Capacity', gb(c.capacityGbps)], ['Measured', c.measuredGbps !== undefined ? gb(c.measuredGbps) : 'not measured'], ['Monthly', money(c.monthlyUsd)], ['Contract end', c.contractEnd ? date(c.contractEnd) : 'not recorded'], ['Plan', c.action === 'undecided' ? 'not decided' : c.action], ...(c.ceaseDate ? [['Cease', date(c.ceaseDate)] as [string, string]] : [])], note: c.etcNote })}>
              {([10, W - EW + 10] as const).map((x, k) => { const t = k ? c.zTerm : c.aTerm; return (
                <g key={x}><rect x={x} y={y - 19} width={EW - 20} height={38} rx={4} fill={C.surface} stroke={C.slateLight} strokeDasharray={k && !c.farEndKnown ? '4 3' : undefined} />
                  <text x={x + 8} y={y - 4} fontSize={10.5} fontWeight={500} fill={C.slateDark}>{fit(k && !c.farEndKnown ? 'far end not recorded' : t?.deviceId ?? 'termination', EW - 36, 10.5)}</text>
                  <text x={x + 8} y={y + 10} fontSize={9.5} fill={C.slate}>{t?.portSpeedMbps ? `${t.portSpeedMbps / 1000}G port` : 'existing circuit'}</text></g>
              ); })}
              <line x1={EW - 10} y1={y} x2={W - EW + 10} y2={y} stroke={col} strokeWidth={ceased ? 1.6 : 2} strokeDasharray={ceased ? '3 3' : c.farEndKnown ? undefined : '8 4'} />
              {ceased && <g stroke={C.red} strokeWidth={1.8}><line x1={W / 2 - 7} y1={y - 7} x2={W / 2 + 7} y2={y + 7} /><line x1={W / 2 + 7} y1={y - 7} x2={W / 2 - 7} y2={y + 7} /></g>}
              <text x={L} y={y - 30} fontSize={11.5} fontWeight={600} fill={C.slateDark}>Existing {c.circuit.cid} · {fit(`${c.provider?.name ?? 'carrier'} · ${gb(c.capacityGbps)}`, R - L - 200, 11.5)}</text>
              <text x={R} y={y - 30} textAnchor="end" fontSize={10} fontWeight={600} fill={col}>{c.action === 'keep' ? 'kept' : c.action === 'undecided' ? 'not decided' : c.action === 'upgrade' ? `replaced${by ? ` by ${by}` : ''}, cease ${date(c.ceaseDate)}` : `cease ${date(c.ceaseDate)}`}</text>
              <text x={L} y={y + 36} fontSize={10} fill={C.slate}>{fit([c.measuredGbps !== undefined ? `${gb(c.measuredGbps)} measured` : 'use not measured', `${money(c.monthlyUsd)} a month`, c.contractEnd ? `contract to ${date(c.contractEnd)}` : 'contract end not recorded', c.etcUsd ? `early termination ${money(c.etcUsd)}` : ''].filter(Boolean).join(' · '), R - L, 10)}</text>
            </g>
          );
        })}
        {/* diversity check between every pair of paths */}
        <g transform={`translate(0,${tableY})`}>
          <text x={0} y={0} fontSize={11} fontWeight={600} fill={C.ink}>Diversity check</text>
          <text x={120} y={0} fontSize={10} fill={an.diversity?.ok ? C.emeraldDark : an.diversity?.waived ? C.amberDark : C.red} fontWeight={600}>{an.diversity ? (an.diversity.ok ? 'Diverse' : an.diversity.waived ? 'Shared risk, waived' : paths.length < 2 ? 'Only one path' : 'Shared risk') : '—'}</text>
          {(['Paths', 'Carrier', 'Route', 'Shared-risk groups'] as const).map((h, k) => <text key={h} x={[0, 260, 470, 640][k]} y={22} fontSize={9.5} fontWeight={600} letterSpacing={0.4} fill={C.slate}>{h.toUpperCase()}</text>)}
          <line x1={0} y1={28} x2={W} y2={28} stroke={C.grid} />
          {pairs.length ? pairs.map(([x, y], k) => {
            const carrier = (x.provider?.id ?? x.path.providerName) !== (y.provider?.id ?? y.path.providerName);
            const route = !x.path.routeId || !y.path.routeId || x.path.routeId !== y.path.routeId;
            const srg = x.path.sharedRiskGroups.filter(g => y.path.sharedRiskGroups.map(s => s.toLowerCase()).includes(g.toLowerCase()));
            const cell = (ok: boolean, t: string, xx: number) => <g><circle cx={xx + 5} cy={-3} r={4.5} fill={ok ? C.emeraldDark : C.red} /><text x={xx + 15} fontSize={10.5} fill={ok ? C.ink : C.red}>{t}</text></g>;
            return (
              <g key={k} transform={`translate(0,${46 + k * rowH})`}>
                <text x={0} fontSize={10.5} fill={C.ink}>{x.path.name} and {y.path.name}</text>
                {cell(carrier, carrier ? `${fit(prov(x), 80, 10.5)} / ${fit(prov(y), 80, 10.5)}` : `both ${prov(x)}`, 260)}
                {cell(route, !x.path.routeId || !y.path.routeId ? 'not recorded on one path' : route ? 'different routes' : `both ${x.path.routeId}`, 470)}
                {cell(!srg.length, srg.length ? fit(srg.join(', '), 330, 10.5) : 'none in common', 640)}
              </g>
            );
          }) : <text x={0} y={46} fontSize={10.5} fill={C.slate}>One path only: nothing to compare. A second path on another carrier and route is needed for diversity.</text>}
        </g>
      </svg>
      <ChartLegend items={[
        ...paths.slice(0, PATH_COL.length).map((p, i) => ({ label: `${p.path.name} (new)`, color: PATH_COL[i % PATH_COL.length], kind: 'line' as const })),
        ...(paths.some(p => segOf(p.path).landings.length >= 2) ? [{ label: 'Landing station (□), cable system between (wavy)', color: C.slateDark, kind: 'dot' as const }] : []),
        ...(paths.some(p => segOf(p.path).pops.length > 0) ? [{ label: 'Carrier POP on the route (○)', color: C.slateDark, kind: 'dot' as const }] : []),
        ...(circuits.length ? [{ label: 'Existing circuit, kept', color: C.slate, kind: 'line' as const }, { label: 'Existing circuit, to cease', color: C.red, kind: 'dash' as const }] : []),
        { label: 'Line card needed (no free port)', color: C.amberDark, kind: 'dot' },
      ]} />
      <DrawNotes items={[
        an.survivability ? `${an.survivability.mode}: ${an.survivability.detail}.` : '',
        an.demand ? `Design demand ${gb(an.demand.designGbps)} at year ${an.demand.years}${an.demand.overridden ? ' (set by the planner)' : ''}; ${gb(an.capacityGbps + an.keptGbps)} planned across ${plural(paths.length, 'new path')}${an.keptGbps ? ` and the kept circuits` : ''}.` : '',
        paths.some(p => !p.path.distanceKm) ? 'Distances without a carrier route length are great-circle estimates × 1.3; latency is estimated at 5 µs per km plus equipment.' : '',
        an.diversity && !an.diversity.ok && an.diversity.shared.length ? `Shared risk: ${an.diversity.shared.join('; ')}.` : '',
      ]} />
      <ChartTip tip={tip} />
    </div>
  );
}

/* ------------------------------------------------------------------ cut-over and cease */
const WEEK = 7 * 864e5;
/** Each path from carrier order to service and each existing circuit to its cease date, against the gates. */
export function DciCutover({ an, plan, schedule }: { an: NetworkAnalysis; plan: T.PlannerPlan; schedule: ScheduleItem[] }) {
  const { tip, on } = useTip();
  const [ref, width] = useWidth(1000);
  const hid = useId().replace(/:/g, '');
  const cut = new Date(an.cutover).getTime();
  if (Number.isNaN(cut)) return null;
  const now = clockMs();
  const gates = schedule.filter(s => s.kind === 'gate' && !Number.isNaN(new Date(s.needBy).getTime()));
  const gateAt = (re: RegExp, fb: number) => { const g = gates.find(x => re.test(x.item)); return g ? new Date(g.needBy).getTime() : fb; };
  const carrierItems = schedule.filter(s => s.kind === 'equipment' && /carrier|dark fibre|wavelength|transit/i.test(s.item));
  const order = carrierItems.length ? Math.min(...carrierItems.map(s => new Date(s.orderBy).getTime())) : gateAt(/carrier orders/i, cut - 16 * WEEK);
  const handover = gateAt(/handed over/i, cut - 3 * WEEK), accept = gateAt(/acceptance/i, cut - WEEK);
  const cease = an.ceaseBy ? new Date(an.ceaseBy).getTime() : undefined;
  const ends = [cut + 8 * WEEK, ...(cease ? [cease + 4 * WEEK] : []), ...an.circuits.map(c => (c.ceaseDate ? new Date(c.ceaseDate).getTime() + 4 * WEEK : 0))];
  const t0 = Math.min(now, order, ...gates.map(g => new Date(g.needBy).getTime())) - 2 * WEEK, t1 = Math.max(...ends);
  const w = Math.max(640, width), labelW = Math.min(240, w * 0.26), m = { top: 52, right: 18 };
  const iw = w - labelW - m.right;
  const X = (t: number) => labelW + ((t - t0) / (t1 - t0)) * iw;
  const rowH = 34;
  const rows: { key: string; label: string; sub: string; draw: (y: number) => React.ReactNode }[] = [];
  an.paths.forEach((p, i) => {
    const col = PATH_COL[i % PATH_COL.length];
    rows.push({ key: p.path.id, label: `${p.path.name} · ${p.provider?.name ?? p.path.providerName}`, sub: `${gb(p.path.capacityGbps)} ${p.path.linkType.toLowerCase()}`, draw: y => (
      <g {...on({ title: `${p.path.name} · ${p.provider?.name ?? p.path.providerName}`, rows: [['Ordered by', date(new Date(order).toISOString())], ['Handed over', date(new Date(handover).toISOString())], ['Accepted', date(new Date(accept).toISOString())], ['Carries traffic from', date(an.cutover)]] })}>
        <rect x={X(order)} y={y + 9} width={Math.max(2, X(handover) - X(order))} height={16} fill={`url(#p${hid})`} stroke={col} strokeWidth={1} />
        <rect x={X(handover)} y={y + 9} width={Math.max(2, X(cut) - X(handover))} height={16} fill={C.amber} opacity={0.75} />
        <rect x={X(cut)} y={y + 9} width={Math.max(2, X(t1) - X(cut))} height={16} fill={col} />
        {X(handover) - X(order) > 70 && <text x={X(order) + 6} y={y + 17} dy="0.35em" fontSize={9.5} fill={C.ink}>carrier build</text>}
        {X(t1) - X(cut) > 70 && <text x={X(cut) + 6} y={y + 17} dy="0.35em" fontSize={9.5} fontWeight={600} fill={C.surface}>in service</text>}
      </g>
    ) });
  });
  an.circuits.forEach(c => {
    const end = c.ceaseDate ? new Date(c.ceaseDate).getTime() : t1;
    const ce = c.contractEnd ? new Date(c.contractEnd).getTime() : undefined;
    rows.push({ key: c.circuit.id, label: `Existing ${c.circuit.cid}`, sub: `${c.provider?.name ?? 'carrier'} · ${c.action === 'undecided' ? 'not decided' : c.action}`, draw: y => (
      <g {...on({ title: `${c.circuit.cid} · ${c.provider?.name ?? 'carrier'}`, rows: [['Plan', c.action], ['Cease', c.ceaseDate ? date(c.ceaseDate) : '—'], ['Contract end', c.contractEnd ? date(c.contractEnd) : 'not recorded'], ['Early termination', money(c.etcUsd)]], note: c.etcNote })}>
        <rect x={X(t0)} y={y + 9} width={Math.max(2, X(end) - X(t0))} height={16} fill={C.slateLight} />
        {c.ceaseDate && <g stroke={C.red} strokeWidth={1.8}><line x1={X(end) - 5} y1={y + 12} x2={X(end) + 5} y2={y + 22} /><line x1={X(end) + 5} y1={y + 12} x2={X(end) - 5} y2={y + 22} /></g>}
        {ce !== undefined && ce >= t0 && ce <= t1 && <g><line x1={X(ce)} y1={y + 5} x2={X(ce)} y2={y + 29} stroke={C.slateDark} strokeWidth={1.2} /><text x={X(ce) + 3} y={y + 6} fontSize={8.5} fill={C.slateDark}>contract end</text></g>}
      </g>
    ) });
  });
  const ih = rows.length * rowH;
  const months: number[] = []; { const d = new Date(t0); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); for (; d.getTime() < t1; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(d.getTime()); }
  const every = months.length > 18 ? 3 : months.length > 10 ? 2 : 1;
  // Gates as numbered diamonds on their own lane, with a numbered key below (labels never collide, however close the dates).
  const ms = gates.map(g => ({ t: new Date(g.needBy).getTime(), label: g.item })).sort((a, b) => a.t - b.t);
  const keyCols = w > 900 ? 3 : 2, keyRows = Math.ceil(ms.length / keyCols), colW = (w - 16) / keyCols;
  const gateH = 58 + keyRows * 16 + 8;
  return (
    <div ref={ref} className="pc-draw fd-draw">
      <svg viewBox={`0 0 ${w} ${m.top + ih + gateH}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Cut-over and cease plan">
        <defs><Hatch id={`p${hid}`} color={C.slateLight} gap={5} /></defs>
        {months.map((t, i) => <g key={t}><line x1={X(t)} y1={m.top - 6} x2={X(t)} y2={m.top + ih} stroke={new Date(t).getUTCMonth() === 0 ? C.slateLight : C.grid} strokeDasharray={new Date(t).getUTCMonth() === 0 ? undefined : '2 3'} />{i % every === 0 && <text x={X(t)} y={m.top - 10} textAnchor="middle" fontSize={9.5} fill={C.slate}>{monShort(t)}{new Date(t).getUTCMonth() === 0 || i === 0 ? ` '${String(new Date(t).getUTCFullYear()).slice(2)}` : ''}</text>}</g>)}
        {rows.map((r, i) => { const y = m.top + i * rowH; return (
          <g key={r.key}>
            {i % 2 === 1 && <rect x={0} y={y} width={w} height={rowH} fill={C.wash} />}
            <text x={8} y={y + 14} fontSize={10.5} fontWeight={600} fill={C.ink}>{fit(r.label, labelW - 16, 10.5)}</text>
            <text x={8} y={y + 27} fontSize={9.5} fill={C.slate}>{fit(r.sub, labelW - 16, 9.5)}</text>
            {r.draw(y)}
          </g>
        ); })}
        {/* gates under the rows: numbered diamonds, then the key */}
        <g transform={`translate(0,${m.top + ih})`}>
          <text x={8} y={30} fontSize={10.5} fontWeight={600} fill={C.ink}>Gates</text>
          {ms.map((g, i) => <g key={g.label + g.t} {...on({ title: g.label, rows: [['Date', date(new Date(g.t).toISOString())]] })}>
            <rect x={X(g.t) - 5} y={21} width={10} height={10} fill={C.violet} transform={`rotate(45 ${X(g.t)} 26)`} />
            <text x={X(g.t)} y={i % 2 ? 46 : 14} textAnchor="middle" fontSize={9} fontWeight={600} fill={C.violet}>{i + 1}</text>
          </g>)}
          {ms.map((g, i) => (
            <text key={`k${i}`} x={8 + (i % keyCols) * colW} y={66 + Math.floor(i / keyCols) * 16} fontSize={10} fill={C.slateDark}>
              <tspan fontWeight={600} fill={C.violet}>{i + 1}</tspan><tspan dx={6}>{fit(g.label, colW - 110, 10)}</tspan><tspan dx={6} fill={C.slate}>{date(new Date(g.t).toISOString())}</tspan>
            </text>
          ))}
        </g>
        {[[now, 'today', C.slateDark], [cut, `cut-over ${dayShort(cut)}`, C.emeraldDark]].map(([t, l, c]) => (t as number) >= t0 && (t as number) <= t1 && (
          <g key={l as string}><line x1={X(t as number)} y1={m.top - 4} x2={X(t as number)} y2={m.top + ih} stroke={c as string} strokeWidth={l === 'today' ? 1 : 2} strokeDasharray={l === 'today' ? '3 3' : undefined} />
            <text x={X(t as number)} y={m.top - 26} textAnchor={X(t as number) > w - 70 ? 'end' : 'middle'} fontSize={9.5} fontWeight={600} fill={c as string}>{l as string}</text></g>
        ))}
      </svg>
      <ChartLegend items={[{ label: 'Carrier build (order to hand-over)', color: C.slateLight, kind: 'hatch' }, { label: 'Acceptance and soak', color: C.amber }, { label: 'New path in service', color: PATH_COL[0] }, ...(an.circuits.length ? [{ label: 'Existing circuit until cease', color: C.slateLight }] : []), { label: 'Gate', color: C.violet, kind: 'diamond' }]} />
      <DrawNotes items={[
        `Traffic moves in one change window on ${utc(an.cutover)} UTC${an.ceaseBy ? `; the old circuits are ceased after the soak, by ${date(an.ceaseBy)}` : ''}.`,
        an.circuits.length ? `${plural(an.circuits.filter(c => c.action === 'cease' || c.action === 'upgrade').length, 'existing circuit')} to cease, ${plural(an.circuits.filter(c => c.action === 'keep').length, 'kept')}${an.etcUsd ? `; early termination ${money(an.etcUsd)}` : ''}.` : 'No existing circuit between the two sites is recorded, so nothing is ceased.',
        plan.status === 'Draft' || plan.status === 'In review' ? 'Dates follow the plan as it stands and move with the carrier order date.' : '',
      ]} />
      <ChartTip tip={tip} />
    </div>
  );
}
