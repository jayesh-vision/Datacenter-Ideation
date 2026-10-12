import { sevLabel } from '../../lib/vocab';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import type { RevDomain, RevIssue, RevenueView } from '../../api/types';
import { REV_DOMAINS } from '../../api/types';
import { vocabNow } from '../../api';
import { useSentinel } from '../../shell/page';
import { Btn, Drawer, Info } from '../../ui/kit';
import { DataTable, type Col } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { IncLink, IncidentChip, SevChip, SeverityChip } from '../../ui/status';
import { AXIS_TEXT, AXIS_TEXT_CURRENT, INK, Tooltip, niceTicks, useWidth, type TipState } from '../../charts/core';
import { fmtAgo, fmtDur, fmtMoney, fmtTime, fmtDayLabel } from '../../lib/format';
import { OpstralBtn } from '../../ui/OpstralMark';
import { downloadCsv, slaText } from '../ops/shared';
import '../../styles/revenue.css';

/* ------------------------------------------------------------- vocabulary */

export const inr = (n: number) => fmtMoney(n);
export const perHr = (n: number) => `${fmtMoney(n)}/h`;
export const perMo = (n: number) => `${fmtMoney(n)}/mo`;
/* lower-case a vocabulary word for mid-sentence use, keeping acronyms (SLA credits, OLA rebates) */
export const lc = (s: string) => (/^(SLA|OLA) /.test(s) ? s.slice(0, 4) + s.slice(4).toLowerCase() : s.toLowerCase());
export const impactOf = (i: { lost: number; credits: number }) => i.lost + i.credits;

/* calm palette: one blue-grey ramp for the kinds of issue; red and amber stay reserved for loss */
export const DOMAIN: Record<RevDomain, { icon: I.LucideIcon; color: string }> = {
  Power: { icon: I.Zap, color: 'var(--primaryColor500)' }, Cooling: { icon: I.Snowflake, color: 'var(--vw-color-blue-300)' }, Network: { icon: I.Network, color: 'var(--vw-color-slate-600)' }, GPU: { icon: I.Cpu, color: 'var(--primaryColor700)' },
  Device: { icon: I.Server, color: 'var(--vw-color-slate-400)' }, Capacity: { icon: I.Gauge, color: 'var(--vw-color-slate-300)' }
};
export const LOSS = 'var(--vw-color-red-400)', CREDIT = 'var(--vw-color-amber-400)', STAKE = 'var(--vw-color-slate-400)';

export function DomainTag({ d }: { d: RevDomain }) {
  const Ic = DOMAIN[d].icon;
  return <span className="rev-dom"><span className="rev-dom-ic" style={{ color: DOMAIN[d].color }}><Ic size={13} /></span>{d}</span>;
}

export const stateText = (i: { down: number; degraded: number; exposed: number }) => [i.down ? `${i.down} down` : '', i.degraded ? `${i.degraded} degraded` : '', i.exposed ? `${i.exposed} exposed` : ''].filter(Boolean).join(' · ');

/* ------------------------------------------------------------ cost of delay */

/* Cumulative impact of one issue: solid up to now, dashed for the next 24 h if nothing changes.
   An exposed issue has lost nothing yet, so the whole curve is "if it fails now". */
export function CostCurve({ curve, now, height = 170, compact }: { curve: RevIssue['curve']; now: number; height?: number; compact?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<TipState | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const m = compact ? { t: 8, r: 8, b: 18, l: 8 } : { t: 14, r: 18, b: 26, l: 58 };
  const n = curve.v.length;
  const cw = Math.max(10, width - m.l - m.r), ch = height - m.t - m.b;
  const ticks = niceTicks(Math.max(1, ...curve.v), 3);
  const top = ticks[ticks.length - 1] || 1;
  const span = Math.max(1, curve.t[n - 1] - curve.t[0]);
  const x = (k: number) => m.l + ((curve.t[k] - curve.t[0]) / span) * cw, y = (v: number) => m.t + ch - (v / top) * ch;
  const line = (from: number, to: number) => curve.v.slice(from, to + 1).map((v, k) => `${k ? 'L' : 'M'}${x(from + k).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = (from: number, to: number) => `${line(from, to)} L${x(to).toFixed(1)},${y(0)} L${x(from).toFixed(1)},${y(0)} Z`;
  const ni = curve.nowIdx, color = curve.potential ? CREDIT : LOSS;
  const when = (k: number) => { const d = (curve.t[k] - now) / 60000; return Math.abs(d) < 8 ? 'Now' : d < 0 ? `${fmtDur(-d)} ago` : `In ${fmtDur(d)}`; };
  const move = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const at = curve.t[0] + Math.max(0, Math.min(1, (e.clientX - r.left - m.l) / cw)) * span;
    const k = curve.t.reduce((best, tt, j) => (Math.abs(tt - at) < Math.abs(curve.t[best] - at) ? j : best), 0);
    setHover(k);
    setTip({ x: x(k), y: y(curve.v[k]), title: `${when(k)} · ${fmtDayLabel(curve.t[k], now)} ${fmtTime(curve.t[k])}`, rows: [{ color: k <= ni && !curve.potential ? color : STAKE, label: curve.potential ? 'Cost if it fails now' : k <= ni ? 'Impact so far' : 'Impact if unresolved', value: inr(curve.v[k]), dashed: k > ni || curve.potential }] });
  };
  return (
    <div ref={ref} className={`ch-frame rev-curve${compact ? ' is-compact' : ''}`} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={curve.potential ? `Cost if this fails now: ${inr(curve.v[n - 1])} after 24 hours` : `Impact so far ${inr(curve.v[ni])}; ${inr(curve.v[n - 1])} if unresolved for another 24 hours`} onMouseMove={move} onMouseLeave={() => { setTip(null); setHover(null); }}>
          {!compact && ticks.map(t => (
            <g key={t}><line x1={m.l} x2={m.l + cw} y1={y(t)} y2={y(t)} stroke={t === 0 ? INK.baseline : INK.grid} /><text x={m.l - 8} y={y(t) + 4} textAnchor="end" {...AXIS_TEXT}>{t === 0 ? '0' : inr(t)}</text></g>
          ))}
          {compact && <line x1={m.l} x2={m.l + cw} y1={y(0)} y2={y(0)} stroke={INK.baseline} />}
          {ni > 0 && <path d={area(0, ni)} style={{ fill: color }} opacity={0.14} />}
          <path d={area(ni, n - 1)} style={{ fill: curve.potential ? color : STAKE }} opacity={0.08} />
          {ni > 0 && <path d={line(0, ni)} fill="none" style={{ stroke: color }} strokeWidth={2} strokeLinejoin="round" />}
          <path d={line(ni, n - 1)} fill="none" style={{ stroke: curve.potential ? color : STAKE }} strokeWidth={1.75} strokeDasharray="5 4" strokeLinejoin="round" />
          {!curve.potential && <line x1={x(ni)} x2={x(ni)} y1={m.t} y2={y(0)} style={{ stroke: 'var(--vw-color-slate-300)' }} strokeDasharray="2 3" />}
          {!curve.potential && <circle cx={x(ni)} cy={y(curve.v[ni])} r={4} style={{ fill: color, stroke: 'var(--vw-color-white)' }} strokeWidth={2} />}
          <circle cx={x(n - 1)} cy={y(curve.v[n - 1])} r={3} style={{ fill: 'var(--vw-color-white)', stroke: curve.potential ? color : STAKE }} strokeWidth={1.75} />
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={y(0)} stroke={INK.axis} />}
          {hover !== null && <circle cx={x(hover)} cy={y(curve.v[hover])} r={3.5} style={{ fill: 'var(--vw-color-gray-900)' }} />}
          {curve.potential
            ? <><text x={m.l} y={height - 6} {...AXIS_TEXT_CURRENT}>If it fails now</text><text x={m.l + cw} y={height - 6} textAnchor="end" {...AXIS_TEXT}>+24 h</text></>
            : <>
              <text x={m.l} y={height - 6} {...AXIS_TEXT}>{compact ? fmtAgo(curve.t[0], now) : `Began ${fmtAgo(curve.t[0], now)}`}</text>
              {(curve.t[ni] - curve.t[0]) / span > 0.22 && (curve.t[ni] - curve.t[0]) / span < 0.8 && <text x={x(ni)} y={height - 6} textAnchor="middle" {...AXIS_TEXT_CURRENT}>Now</text>}
              <text x={m.l + cw} y={height - 6} textAnchor="end" {...AXIS_TEXT}>+24 h</text>
            </>}
        </svg>
      )}
      <Tooltip tip={tip} width={width} />
    </div>
  );
}

/* ------------------------------------------------------------- issue list */

type View = 'all' | 'losing' | 'stake' | 'untracked';
const isLosing = (i: RevIssue) => i.rate + i.lost + i.credits > 0;

/* Every issue that touches revenue, ranked by what it has cost. Filters live in the URL
   (rview, dom, rdc, q) so tiles and other screens can link straight to a filtered list. */
export function IssueTable({ view: v, onOpen, hideDc, pageSize = 15 }: { view: RevenueView; onOpen: (i: RevIssue) => void; hideDc?: boolean; pageSize?: number }) {
  const W = vocabNow().money, V = vocabNow();
  const [sp, setSp] = useSearchParams();
  const applyParams = useParamPatch();
  const view = (sp.get('rview') ?? 'all') as View, dom = sp.get('dom') ?? '', dc = sp.get('rdc') ?? '', q = sp.get('q') ?? '';
  const set = (k: string, val: string) => { const n = new URLSearchParams(sp); val && val !== 'all' ? n.set(k, val) : n.delete(k); setSp(n, { replace: true }); };
  const all = v.issues;
  const rows = useMemo(() => all.filter(i => (view === 'all' || (view === 'losing' ? isLosing(i) : view === 'stake' ? i.mrrExposed > 0 : !i.incident)) && (!dom || i.domain === dom) && (!dc || i.dcId === dc)
    && (!q || `${i.id} ${i.title} ${i.where} ${i.dcId} ${i.domain}`.toLowerCase().includes(q.toLowerCase()))), [all, view, dom, dc, q]);
  const max = Math.max(1, ...all.map(impactOf));
  const dcs = [...new Set(all.map(i => i.dcId))].sort();

  const cols: Col<RevIssue>[] = [
    { key: 'rank', header: '#', sort: i => -i.rank, render: i => <span className="rev-rank">{i.rank}</span> },
    { key: 'issue', header: 'Issue', wrap: true, sort: i => i.title, render: i => (
      <span className="cell-2 rev-issue">
        <span className="strong" style={{ fontWeight: 500 }}>{i.title}</span>
        <small>{[i.incident ? i.id : '', hideDc ? '' : i.dcId, i.where !== i.dcId ? i.where : '', `began ${fmtAgo(i.since, v.now)}`].filter(Boolean).join(' · ')}</small>
        <span className="rev-flags">
          <DomainTag d={i.domain} />
          {i.changeId && <span className="vw-chip vw-chip--neutral" title={`Change ${i.changeId} completed at this site shortly before the fault`}>after {i.changeId}</span>}
          {i.underPrioritised && <span className="vw-chip vw-chip--warning" title={`Ranks #${i.rank} by ${lc(W.noun)} impact but is only ${sevLabel(i.incident!.sev).toLowerCase()} severity`}>review priority</span>}
        </span>
      </span>) },
    { key: 'hit', header: 'Impacted', sort: i => i.down * 1e6 + i.degraded * 1e3 + i.exposed, render: i => <span className="cell-2 rev-hit"><span>{stateText(i)}</span><small>{i.customers} {(i.customers === 1 ? V.customer : V.customers).toLowerCase()}{i.premium ? ` · ${i.premium} ${V.premium.toLowerCase()}` : ''}</small></span> },
    { key: 'rate', header: 'Losing now', sort: i => i.rate, render: i => (i.rate ? <span className="num rev-amt nowrap rev-bad">{perHr(i.rate)}</span> : <span className="faint">—</span>) },
    { key: 'impact', header: 'Impact so far', sort: i => impactOf(i), render: i => (isLosing(i) ? (
      <span className="cell-2 rev-impact" title={`${inr(i.lost)} ${lc(W.lost)} + ${inr(i.credits)} ${lc(W.credits)}`}>
        <span className="num rev-amt nowrap">{inr(impactOf(i))}</span>
        <span className="rev-bar"><i style={{ width: `${(i.lost / max) * 100}%`, background: LOSS }} /><i style={{ width: `${(i.credits / max) * 100}%`, background: CREDIT }} /></span>
        <small className="nowrap">{inr(i.credits)} credits</small>
      </span>) : <span className="faint nowrap">nothing lost yet</span>) },
    { key: 'cliff', header: 'Next credit', sort: i => (i.nextCliff ? -i.nextCliff.inMin : -1e9), render: i => (i.nextCliff ? <span className="cell-2"><span className="num nowrap">{inr(i.nextCliff.amount)}</span><small className={`nowrap${i.nextCliff.inMin <= 60 ? ' rev-bad' : ''}`}>in {fmtDur(i.nextCliff.inMin)}</small></span> : <span className="faint">—</span>) },
    { key: 'stake', header: 'At stake', sort: i => Math.max(i.forecast24, i.potentialCredits + i.potentialRate * v.method.outageHours), render: i => (i.mrrExposed > 0 && !isLosing(i)
      ? <span className="cell-2"><span className="num nowrap">{perMo(i.mrrExposed)}</span><small>{perHr(i.potentialRate)} if it fails</small></span>
      : <span className="cell-2"><span className="num nowrap">{inr(i.forecast24)}</span><small className="nowrap">by +24 h</small></span>) },
    { key: 'track', header: 'Tracked by', sort: i => (i.incident ? i.incident.sev : 9), render: i => (i.incident
      ? <span className="cell-2"><span className="row nowrap" style={{ gap: 6 }}><IncLink id={i.incident.id} /><SevChip n={i.incident.sev} size="xs" /></span><small className={`nowrap${i.incident.resolveLeft < 0 ? ' rev-bad' : ''}`}>{slaText(i.incident.resolveLeft)}</small></span>
      : <span className="vw-chip vw-chip--warning" title="An active fault is costing money and no incident is tracking it">No incident</span>) }
  ];
  const exportCsv = () => downloadCsv('revenue-impact-issues.csv', [['Rank', 'Issue', 'Reference', 'Datacenter', 'Cause', 'Down', 'Degraded', 'Exposed', 'Customers', 'Losing per hour', W.lost, W.credits, 'If it runs 24 h more', 'Exposed monthly', 'Per hour if it fails'],
    ...rows.map(i => [i.rank, i.title, i.incident?.id ?? 'no incident', i.dcId, i.domain, i.down, i.degraded, i.exposed, i.customers, i.rate, i.lost, i.credits, i.forecast24, i.mrrExposed, i.potentialRate])]);

  return (
    <section className="card">
      <DataTable rows={rows} cols={cols} onRow={onOpen} pageSize={pageSize} defaultSort={{ key: 'rank', dir: 'desc' }}
        empty={<div className="rev-empty"><I.CircleCheck size={18} />No open issue is touching {lc(W.noun)} in this view.</div>}
        toolbar={
          <ListToolbar onApply={applyParams} shown={rows.length} total={all.length} noun="issues"
            search={{ value: q, onChange: val => set('q', val), placeholder: 'Issue, incident, datacenter' }}
            actions={[{ label: 'Export CSV', icon: I.Download, onClick: exportCsv }]}
            filters={[
              { id: 'rview', label: 'View', quick: true, value: view, defaultValue: 'all', onChange: val => set('rview', val), options: [
                { id: 'all', label: 'All issues', count: all.length }, { id: 'losing', label: 'Losing now', count: all.filter(isLosing).length },
                { id: 'stake', label: 'At stake', count: all.filter(i => i.mrrExposed > 0).length }, { id: 'untracked', label: 'No incident', count: all.filter(i => !i.incident).length }] },
              { id: 'dom', label: 'Cause', quick: true, value: dom, anyLabel: 'Any cause', onChange: val => set('dom', val), options: REV_DOMAINS.map(d => ({ id: d, label: d, count: all.filter(i => i.domain === d).length })) },
              ...(hideDc ? [] : [{ id: 'rdc', label: 'Datacenter', value: dc, anyLabel: 'Any datacenter', onChange: (val: string) => set('rdc', val), options: dcs.map(d => ({ id: d, label: d, count: all.filter(i => i.dcId === d).length })) }])
            ]} />
        } />
    </section>
  );
}

/* ------------------------------------------------------------ issue drawer */

export function IssueDrawer({ issue: i, view: v, onClose }: { issue: RevIssue | null; view: RevenueView; onClose: () => void }) {
  const nav = useNavigate();
  const ask = useSentinel();
  const W = vocabNow().money, V = vocabNow();
  if (!i) return null;
  const losing = isLosing(i);
  const avoid = Math.max(0, i.forecast24 - impactOf(i));
  return (
    <Drawer open onClose={onClose} width={640} title={i.title}
      sub={<>{i.incident ? `${i.id} · ` : ''}{i.dcId}{i.where !== i.dcId ? ` · ${i.where}` : ''} · began {fmtAgo(i.since, v.now)}</>}
      foot={<>
        <Btn variant="filled" icon={i.incident ? I.Siren : I.BellRing} onClick={() => nav(i.to)}>{i.incident ? 'Open incident' : 'Open the fault'}</Btn>
        <Btn icon={I.Building2} onClick={() => nav(`/datacenters/${i.dcId}?tab=revenue`)}>{i.dcId}</Btn>
        <span className="grow" />
        <OpstralBtn onClick={() => { onClose(); ask(i.incident ? `What is ${i.id} costing us?` : `Which issue costs the most in ${i.dcId}?`); }} />
      </>}>
      <div className="rev-drawer">
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="rev-rank is-lg" title={`Ranked #${i.rank} by ${lc(W.noun)} impact`}>#{i.rank}</span>
          <DomainTag d={i.domain} />
          <SeverityChip s={i.severity} size="xs" />
          {i.incident ? <><SevChip n={i.incident.sev} size="xs" /><IncidentChip s={i.incident.status} size="xs" /><span className="vw-label">{i.incident.owner} · {slaText(i.incident.resolveLeft)}</span></> : <span className="vw-chip vw-chip--warning">No incident tracking this</span>}
        </div>
        {i.underPrioritised && <div className="note note--warn"><I.TriangleAlert size={15} />Ranks #{i.rank} by {lc(W.noun)} impact but is only {sevLabel(i.incident!.sev).toLowerCase()} severity. Review its priority.</div>}
        {i.changeId && <div className="note note--info"><I.ArrowLeftRight size={15} /><span>Change <Link className="ent-link mono" to={`/changes?id=${i.changeId}`}>{i.changeId}</Link> completed at this site shortly before the fault began.</span></div>}

        <div className="rev-figs">
          {losing ? <>
            <Fig label="Losing now" value={perHr(i.rate)} sub={stateText({ ...i, exposed: 0 }) || '—'} tone="bad" />
            <Fig label={W.lost} value={inr(i.lost)} sub="pro-rata since it began" />
            <Fig label={W.credits} value={inr(i.credits)} sub={i.nextCliff ? `next ${inr(i.nextCliff.amount)} in ${fmtDur(i.nextCliff.inMin)}` : 'no further step pending'} tone={i.nextCliff && i.nextCliff.inMin <= 60 ? 'warn' : undefined} />
            <Fig label="If it runs 24 h more" value={inr(i.forecast24)} sub={`restoring now avoids ${inr(avoid)}`} />
          </> : <>
            <Fig label="At stake" value={perMo(i.mrrExposed)} sub={`${i.exposed} ${V.services.toLowerCase()} still running`} tone="warn" />
            <Fig label="If it fails" value={perHr(i.potentialRate)} sub="lost for every hour down" />
            <Fig label={`Credits after ${v.method.outageHours} h`} value={inr(i.potentialCredits)} sub="if the outage lasts that long" />
            <Fig label="Lost so far" value={inr(0)} sub="nothing is down yet" />
          </>}
        </div>

        <div className="rev-sec">
          <div className="rev-sec-h"><b>{losing ? 'Cost of delay' : 'What a failure would cost'}<Info text={losing
            ? `Cumulative ${lc(W.lost)} plus ${lc(W.credits)} for this issue: solid from the start of the fault to now, dashed for the next 24 h if nothing changes. Hover for the value at a point in time.`
            : `Cumulative cost if the exposed ${V.services.toLowerCase()} go down now: hourly rate × hours plus the ${lc(W.credits)} each further hour of outage triggers, over 24 h. Hover for a point in time.`} /></b><span className="vw-label">{losing ? 'impact so far, and the next 24 hours if nothing changes' : `cumulative cost if these ${V.services.toLowerCase()} go down now`}</span></div>
          <CostCurve curve={i.curve} now={v.now} height={190} />
          {losing && i.mrrExposed > 0 && <span className="vw-label">Another {perMo(i.mrrExposed)} is still running on this fault ({perHr(i.potentialRate)} more if it fails).</span>}
        </div>

        <div className="rev-sec">
          <div className="rev-sec-h"><b>Who it hits<Info text={`${V.customers} whose ${V.services.toLowerCase()} are charged to this issue, largest impact first: their monthly charge and what the issue has cost them (${lc(W.lost)} + ${lc(W.credits)}). Click a row to open the ${V.customer.toLowerCase()}.`} /></b><span className="vw-label">{i.customers} {V.customers.toLowerCase()} · {i.premium} {V.premium.toLowerCase()}{i.customers > i.top.length ? ` · top ${i.top.length} shown` : ''}</span></div>
          <table className="nst-table dt-table rev-mini">
            <thead><tr><th>{V.customer}</th><th>{V.services}</th><th>Monthly</th><th>{losing ? 'Impact so far' : 'State'}</th></tr></thead>
            <tbody>{i.top.map(c => (
              <tr key={c.id} className="is-click" onClick={() => nav(`/customers/${c.id}`)}>
                <td><span className="cell-2"><span className="strong" style={{ fontWeight: 500 }}>{c.name}</span>{c.premium && <small>{V.premium}</small>}</span></td>
                <td><span className="num">{c.services}</span> <span className={`rev-st is-${c.state}`}>{c.state}</span></td>
                <td className="num">{inr(c.mrr)}</td>
                <td>{losing ? <span className="cell-2"><span className="num rev-amt">{inr(c.lost + c.credits)}</span><small>{inr(c.credits)} {lc(W.credits)}</small></span> : <span className="faint">running</span>}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </div>
    </Drawer>
  );
}

export function Fig({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'bad' | 'warn' }) {
  return <div className={`rev-fig${tone ? ` is-${tone}` : ''}`}><span className="vw-label">{label}</span><b className="num">{value}</b>{sub && <small title={sub}>{sub}</small>}</div>;
}

/* ---------------------------------------------------------- how it is priced */

export function MethodDrawer({ open, onClose, view: v }: { open: boolean; onClose: () => void; view: RevenueView }) {
  const V = vocabNow(), W = V.money;
  return (
    <Drawer open={open} onClose={onClose} width={560} title={`How ${lc(W.impact)} is calculated`} sub="Derived from the same alarms, incidents and services as every other screen. Each impacted service is charged to one issue only.">
      <div className="rev-method">
        <p className="rev-method-lead">{W.billing}</p>
        <dl>
          <dt>Which {V.services.toLowerCase()} count</dt>
          <dd><b>Down</b> and <b>degraded</b> {V.services.toLowerCase()} are losing {lc(W.noun)} now. <b>Exposed</b> ones are still running but ride a critical fault (a UPS on battery, a failed cooling unit, a critical alarm on their own path). A {V.service.toLowerCase()} running hot inside its own contracted size is not a loss.</dd>
          <dt>Losing now</dt>
          <dd>Monthly charge ÷ 730 hours. A degraded {V.service.toLowerCase()} counts at {Math.round(v.method.degradedFactor * 100)}%.</dd>
          <dt>{W.lost}</dt>
          <dd>The hourly figure × the time since the fault began on that {V.service.toLowerCase()}.</dd>
          <dt>{W.credits}</dt>
          <dd>The impacted minutes come off the 30-day uptime. The shortfall against the SLA target picks the tier:
            <table className="nst-table rev-tiers"><tbody>{v.method.tiers.map(t => <tr key={t.credit}><td>{t.shortfall}</td><td className="num">{t.credit}% of the monthly charge</td></tr>)}</tbody></table>
            Credits a {V.service.toLowerCase()} already owed before this fault are shown as "locked in", not charged to the issue.</dd>
          <dt>Next credit step</dt>
          <dd>How long until the first impacted {V.service.toLowerCase()} crosses into its next tier, and what that adds.</dd>
          <dt>At stake</dt>
          <dd>Monthly charge of the exposed {V.services.toLowerCase()}, what it costs per hour if the fault takes them down, and the credits after a {v.method.outageHours}-hour outage.</dd>
          <dt>One issue per {V.service.toLowerCase()}</dt>
          <dd>The most severe fault on the {V.service.toLowerCase()}'s own path, and the open incident tracking it when there is one. Totals by issue, datacenter, cause and {V.customer.toLowerCase()} therefore all add up to the same number.</dd>
          <dt>30-day history</dt>
          <dd>Resolved incidents priced by duration, severity and the site's average charge, plus the credits already locked in, plus what is open today.</dd>
        </dl>
      </div>
    </Drawer>
  );
}
