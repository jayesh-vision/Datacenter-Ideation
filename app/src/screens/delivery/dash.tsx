/* Delivery dashboard widgets (14-Oct-2026, user: "redesign as dashboards" — P2B's programme / project / delivery overview analytics,
   redrawn in our style): KPI tiles with sparklines, health matrix, programme progress (work vs time), change outcomes, change calendar,
   plan against today, stage tracker. Pure presentational parts; data comes from the delivery API. */
import type { ReactNode } from 'react';
import * as I from 'lucide-react';
import { clockNow } from '../../api';
import type { ChangeFreeze, ChangeRecord, DeliveryProject, ProgrammeView } from '../../api/types';
import { Info } from '../../ui/kit';
import { Sparkline } from '../../charts/Sparkline';
import { TimeChart } from '../../charts/TimeChart';
import { fmtDate } from '../../lib/format';

const DAY = 864e5;

/* ---------------------------------------------------------------- KPI tile: our app-kpi card, with a trend line or bars underneath */
function MiniBars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  return <span className="dl-minibars">{values.map((v, i) => <i key={i} style={{ height: `${Math.max(v ? 12 : 4, (v / max) * 100)}%`, background: i === values.length - 1 ? color : undefined }} />)}</span>;
}
export function KpiTile({ label, value, sub, spark, sparkKind, tone, onClick, info }: { label: string; value: ReactNode; sub?: ReactNode; spark?: number[]; sparkKind?: 'line' | 'bars'; tone?: 'bad' | 'warn' | 'good'; onClick?: () => void; info?: string }) {
  const T = onClick ? 'button' : 'div';
  const color = tone === 'bad' ? '#DC2626' : tone === 'warn' ? '#D97706' : '#1C81EF';
  return (
    <T type={onClick ? 'button' : undefined} className={`vw-card-section app-kpi dl-kpi2${tone === 'bad' || tone === 'warn' ? ` is-${tone}` : ''}${onClick ? ' vw-card--clickable' : ''}`} onClick={onClick}>
      <div className="app-kpi-h"><span className="vw-card-metric-label">{label}{info && <Info text={info} />}</span></div>
      <div className="app-kpi-v"><span className="vw-card-metric-lg">{value}</span></div>
      {sub && <div className={`vw-card-variance ${tone === 'bad' ? 'is-negative' : tone === 'good' ? 'is-positive' : 'is-neutral'} app-kpi-s`}>{sub}</div>}
      <div className="dl-kpi2-spark">{spark && spark.length > 1 ? (sparkKind === 'bars' ? <MiniBars values={spark} color={color} /> : <Sparkline values={spark} color={color} height={30} />) : <span className="dl-kpi2-none" />}</div>
    </T>
  );
}

/* ---------------------------------------------------------------- project health: one row per stage, a bar split on track / at risk / late */
const STAGES: DeliveryProject['state'][] = ['Mobilising', 'In progress', 'Commissioning', 'Handover', 'Delivered'];
const RAGS: DeliveryProject['health'][] = ['on track', 'at risk', 'late'];
export function HealthMatrix({ projects, onCell }: { projects: DeliveryProject[]; onCell: (stage: string, health: string) => void }) {
  const max = Math.max(1, ...STAGES.map(s => projects.filter(p => p.state === s).length));
  const tot = (h: string) => projects.filter(p => p.state !== 'Delivered' && p.health === h).length;
  return (
    <div className="dl-sh">
      <div className="dl-sh-sum">{RAGS.map(r => <span key={r} className={`is-${r.replace(' ', '-')}`}><b>{tot(r)}</b>{r}</span>)}</div>
      {STAGES.map(s => { const ps = projects.filter(p => p.state === s); return (
        <div key={s} className="dl-sh-row">
          <span className="dl-sh-l">{s}</span>
          <span className="dl-sh-bar" style={{ width: `${(ps.length / max) * 100}%` }}>
            {RAGS.map(r => { const n = ps.filter(p => (s === 'Delivered' ? r === 'on track' : p.health === r)).length; return n ? <button key={r} type="button" className={`is-${r.replace(' ', '-')}`} style={{ flex: n }} title={`${s} · ${r}: ${ps.filter(p => (s === 'Delivered' ? r === 'on track' : p.health === r)).map(p => p.name).join(', ')}`} onClick={() => onCell(s, r)}>{n}</button> : null; })}
          </span>
          <span className="dl-sh-n">{ps.length || '—'}</span>
        </div>); })}
    </div>
  );
}

/* ---------------------------------------------------------------- programme progress: work done against time used */
export function ProgrammeProgress({ progs, onOpen }: { progs: ProgrammeView[]; onOpen: (id: string) => void }) {
  const now = clockNow();
  return (
    <ul className="dl-pp">{progs.map(g => { const elapsed = Math.max(0, Math.min(1, (now - g.start) / Math.max(1, g.forecastFinish - g.start))); const done = g.completion; const behind = done + 0.05 < elapsed; return (
      <li key={g.programme.id}><button type="button" onClick={() => onOpen(g.programme.id)}>
        <span className="dl-pp-top"><i className={`dl-rag is-${g.rag}`} /><b>{g.programme.name}</b><em>{Math.round(done * 100)}% done</em></span>
        <span className="dl-pp-track"><i className="dl-pp-done" style={{ width: `${done * 100}%` }} /><b className="dl-pp-time" style={{ left: `${elapsed * 100}%` }} title={`${Math.round(elapsed * 100)}% of the time used`} /></span>
        <small>{Math.round(elapsed * 100)}% of the time used · finish {fmtDate(g.forecastFinish)}{behind && <span className="dl-pp-flag">behind</span>}</small>
      </button></li>); })}</ul>
  );
}

/* ---------------------------------------------------------------- change outcomes per week, by class (shared TimeChart) */
export function ChangeOutcomes({ weeks }: { weeks: { start: number; standard: number; normal: number; emergency: number; failed: number }[] }) {
  const w = weeks.slice(-10);
  return <TimeChart height={210} labels={w.map(x => new Date(x.start).toLocaleString('en-US', { month: 'short', day: 'numeric' }))} fullLabels={w.map(x => `Week of ${fmtDate(x.start)}`)} yMin={0}
    series={[
      { key: 's', label: 'Standard', color: '#93C5FD', kind: 'bar', stack: 'c', values: w.map(x => x.standard) },
      { key: 'n', label: 'Normal', color: '#1C81EF', kind: 'bar', stack: 'c', values: w.map(x => x.normal) },
      { key: 'e', label: 'Emergency', color: '#F59E0B', kind: 'bar', stack: 'c', values: w.map(x => x.emergency) },
      { key: 'f', label: 'Failed or rolled back', color: '#DC2626', kind: 'line', values: w.map(x => x.failed) },
    ]} />;
}
export function Throughput({ weeks }: { weeks: { s: number; done: number; plan: number }[] }) {
  return <TimeChart height={210} labels={weeks.map(x => new Date(x.s).toLocaleString('en-US', { month: 'short', day: 'numeric' }))} fullLabels={weeks.map(x => `Week of ${fmtDate(x.s)}`)} yMin={0}
    series={[
      { key: 'd', label: 'Finished', color: '#1C81EF', kind: 'bar', stack: 'w', values: weeks.map(x => x.done) },
      { key: 'p', label: 'Planned to finish', color: '#BFDBFE', kind: 'bar', stack: 'w', values: weeks.map(x => x.plan) },
    ]} />;
}

/* ---------------------------------------------------------------- change calendar: next 14 days, windows per day by class, freezes as a banner */
export function ChangeCalendar({ changes, freezes, onDay }: { changes: ChangeRecord[]; freezes: ChangeFreeze[]; onDay?: (t: number) => void }) {
  const now = clockNow(); const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const end = d0.getTime() + 14 * DAY;
  const days = Array.from({ length: 14 }, (_, i) => { const s = d0.getTime() + i * DAY, e = s + DAY; const cs = changes.filter(c => c.windowStart < e && c.windowEnd > s && !['Rejected', 'Completed', 'Rolled back'].includes(c.status));
    return { s, cs, fz: freezes.filter(f => f.from < e && (f.to == null || f.to > s)).length }; });
  const max = Math.max(1, ...days.map(d => d.cs.length));
  const fzs = freezes.filter(f => f.from < end && (f.to == null || f.to > d0.getTime()));
  return (
    <div className="dl-cal2">
      {fzs.length > 0 && <div className="dl-cal2-fz"><I.Snowflake size={13} /><span><b>{fzs[0].title}</b>{fzs.length > 1 ? ` +${fzs.length - 1} more` : ''} · {fzs[0].allows.toLowerCase()} · {fzs[0].to ? `until ${fmtDate(fzs[0].to)}` : 'until lifted'}</span></div>}
      <div className="dl-cal2-grid">{days.map((d, i) => { const dt = new Date(d.s); const n = d.cs.length; const by = (k: string) => d.cs.filter(c => c.cls === k).length; return (
        <button key={d.s} type="button" className={`dl-cal2-d${i === 0 ? ' is-today' : ''}${dt.getDay() === 0 || dt.getDay() === 6 ? ' is-we' : ''}${d.fz ? ' is-fz' : ''}`} onClick={() => onDay?.(d.s)}
          title={`${fmtDate(d.s)}: ${n} change window${n === 1 ? '' : 's'} (${by('Standard')} standard, ${by('Normal')} normal, ${by('Emergency')} emergency)${d.fz ? ' · in a freeze' : ''}`}>
          <span className="dl-cal2-h"><small>{dt.toLocaleString('en-US', { weekday: 'short' }).slice(0, 2)}</small><b>{dt.getDate()}</b></span>
          <span className="dl-cal2-n">{n || '–'}</span>
          <span className="dl-cal2-bar" style={{ width: `${(n / max) * 100}%` }}><i className="is-s" style={{ flex: by('Standard') }} /><i className="is-n" style={{ flex: by('Normal') }} /><i className="is-e" style={{ flex: by('Emergency') }} /></span>
        </button>); })}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- plan against today: baseline, forecast, actual work per project */
export function PlanVsToday({ projects }: { projects: DeliveryProject[] }) {
  const now = clockNow();
  if (!projects.length) return <p className="vw-label">No projects.</p>;
  const t0 = Math.min(...projects.map(p => p.start), now), t1 = Math.max(...projects.map(p => Math.max(p.finish, p.baselineFinish, p.target)), now);
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * 100;
  return (
    <div className="dl-pvt">
      {projects.map(p => { const act = p.start + p.progress * (p.finish - p.start); return (
        <div key={p.id} className="dl-pvt-row">
          <span className="dl-pvt-l"><b title={p.name}>{p.name}</b><small>{p.finish > p.baselineFinish ? `${Math.round((p.finish - p.baselineFinish) / DAY)} days after baseline` : 'on baseline'}</small></span>
          <span className="dl-pvt-track">
            <i className="is-base" style={{ left: `${x(p.start)}%`, width: `${x(p.baselineFinish) - x(p.start)}%` }} />
            <i className="is-cur" style={{ left: `${x(p.start)}%`, width: `${x(p.finish) - x(p.start)}%` }} />
            <i className="is-act" style={{ left: `${x(p.start)}%`, width: `${Math.max(0, x(Math.min(act, now)) - x(p.start))}%` }} />
            <b className="dl-g-now" style={{ left: `${x(now)}%` }} />
          </span>
        </div>); })}
      <div className="dl-c-legend"><span><i className="dl-sw is-base" />Baseline</span><span><i className="dl-sw is-cur" />Current forecast</span><span><i className="dl-sw is-act" />Work done</span><span className="vw-label">red line = today</span></div>
    </div>
  );
}

/* ---------------------------------------------------------------- stage tracker for one project */
export function StageTracker({ p }: { p: DeliveryProject }) {
  const i = STAGES.indexOf(p.state);
  return (
    <ol className="dl-stages">{STAGES.map((s, k) => (
      <li key={s} className={k < i ? 'is-done' : k === i ? 'is-on' : ''}>
        <span className="dl-st-dot">{k < i ? <I.Check size={13} /> : k + 1}</span><b>{s}</b>
        {k === i && <small>{p.waitsOn?.length ? 'waiting at the programme gate' : s === 'In progress' ? `${Math.round(p.progress * 100)}% of the work done` : s === 'Commissioning' ? (p.cxLevel ? `L${p.cxLevel} passed` : 'tests starting') : s === 'Mobilising' ? (p.template ? 'ready to start' : 'plan approved') : s === 'Handover' ? 'L5 passed, ready to hand over' : 'handed over'}</small>}
      </li>))}</ol>
  );
}
