/* Delivery dashboard widgets (14-Oct-2026, user: "redesign as dashboards" — P2B's programme / project / delivery overview analytics,
   redrawn in our style): KPI tiles with sparklines, health matrix, programme progress (work vs time), change outcomes, change calendar,
   plan against today, stage tracker. Pure presentational parts; data comes from the delivery API. */
import type { ReactNode } from 'react';
import * as I from 'lucide-react';
import { clockNow } from '../../api';
import type { ChangeFreeze, ChangeRecord, DeliveryProject, ProgrammeView } from '../../api/types';
import { Info } from '../../ui/kit';
import { fmtDate } from '../../lib/format';

const DAY = 864e5;

/* ---------------------------------------------------------------- sparkline */
export function Spark({ values, kind = 'line', tone = 'blue' }: { values: number[]; kind?: 'line' | 'bars'; tone?: 'blue' | 'red' | 'amber' | 'green' }) {
  const W = 96, H = 34;
  if (values.length < 2) return <svg width={W} height={H} />;
  const max = Math.max(1, ...values), min = kind === 'bars' ? 0 : Math.min(...values);
  const x = (i: number) => (i / (values.length - 1)) * (W - 4) + 2, y = (v: number) => H - 3 - ((v - min) / Math.max(1e-9, max - min)) * (H - 8);
  return (
    <svg width={W} height={H} className={`dl-spark is-${tone}`} aria-hidden>
      {kind === 'bars' ? values.map((v, i) => <rect key={i} x={i * (W / values.length) + 1} width={W / values.length - 2} y={y(v)} height={H - 3 - y(v)} rx={1.5} />)
        : <><path d={values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} /><circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2.5} /></>}
    </svg>
  );
}
export function KpiTile({ label, value, sub, spark, sparkKind, tone, onClick, info }: { label: string; value: ReactNode; sub?: ReactNode; spark?: number[]; sparkKind?: 'line' | 'bars'; tone?: 'bad' | 'warn' | 'good'; onClick?: () => void; info?: string }) {
  const T = onClick ? 'button' : 'div';
  return (
    <T type={onClick ? 'button' : undefined} className={`dl-kpi${tone ? ` is-${tone}` : ''}${onClick ? ' is-click' : ''}`} onClick={onClick}>
      <span className="dl-kpi-l">{label}{info && <Info text={info} />}</span>
      <span className="dl-kpi-row"><b>{value}</b>{spark && <Spark values={spark} kind={sparkKind} tone={tone === 'bad' ? 'red' : tone === 'warn' ? 'amber' : tone === 'good' ? 'green' : 'blue'} />}</span>
      {sub && <small>{sub}</small>}
    </T>
  );
}

/* ---------------------------------------------------------------- health matrix: stage × RAG */
const STAGES: DeliveryProject['state'][] = ['Mobilising', 'In progress', 'Commissioning', 'Handover', 'Delivered'];
const RAGS: DeliveryProject['health'][] = ['on track', 'at risk', 'late'];
export function HealthMatrix({ projects, onCell }: { projects: DeliveryProject[]; onCell: (stage: string, health: string) => void }) {
  return (
    <div className="dl-hm">
      <span /> {RAGS.map(r => <span key={r} className="dl-hm-h">{r[0].toUpperCase() + r.slice(1)}</span>)}
      {STAGES.map(s => <span key={s} className="dl-hm-row">
        <span className="dl-hm-s">{s}</span>
        {RAGS.map(r => { const ps = projects.filter(p => p.state === s && (s === 'Delivered' ? r === 'on track' : p.health === r)); const n = ps.length; return (
          <button key={r} type="button" disabled={!n} className={`dl-hm-c is-${r.replace(' ', '-')}${n ? ' has' : ''}`} style={{ ['--a' as string]: Math.min(1, 0.25 + n / 4) }} title={ps.map(p => p.name).join('\n')} onClick={() => onCell(s, r)}>{n || ''}</button>); })}
      </span>)}
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
        <small className={behind ? 'is-late' : ''}>{Math.round(elapsed * 100)}% of the time used{behind ? ' · behind' : ' · in step'} · finish {fmtDate(g.forecastFinish)}</small>
      </button></li>); })}</ul>
  );
}

/* ---------------------------------------------------------------- change outcomes per week, by class, failed marked */
export function ChangeOutcomes({ weeks }: { weeks: { start: number; standard: number; normal: number; emergency: number; failed: number }[] }) {
  const w = weeks.slice(-10);
  const max = Math.max(1, ...w.map(x => x.standard + x.normal + x.emergency));
  return (
    <div>
      <div className="dl-co">{w.map(x => { const t = x.standard + x.normal + x.emergency; return (
        <span key={x.start} className="dl-co-col" title={`Week of ${fmtDate(x.start)}: ${x.standard} standard · ${x.normal} normal · ${x.emergency} emergency${x.failed ? ` · ${x.failed} failed` : ''}`}>
          <span className="dl-co-bars">{x.failed > 0 && <b className="dl-co-fail">{x.failed}</b>}<i className="is-e" style={{ height: `${(x.emergency / max) * 100}%` }} /><i className="is-n" style={{ height: `${(x.normal / max) * 100}%` }} /><i className="is-s" style={{ height: `${(x.standard / max) * 100}%` }} /></span>
          <small>{new Date(x.start).toLocaleString('en-US', { month: 'short', day: 'numeric' })}</small><em>{t || ''}</em>
        </span>); })}</div>
      <div className="dl-c-legend"><span><i className="dl-sw is-s" />Standard</span><span><i className="dl-sw is-n" />Normal</span><span><i className="dl-sw is-e" />Emergency</span><span><i className="dl-sw is-f" />Failed or rolled back</span></div>
    </div>
  );
}

/* ---------------------------------------------------------------- change calendar: next 14 days, windows per day, freeze days */
export function ChangeCalendar({ changes, freezes, onDay }: { changes: ChangeRecord[]; freezes: ChangeFreeze[]; onDay?: (t: number) => void }) {
  const now = clockNow(); const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 14 }, (_, i) => { const s = d0.getTime() + i * DAY, e = s + DAY; const cs = changes.filter(c => c.windowStart < e && c.windowEnd > s && c.status !== 'Rejected' && c.status !== 'Completed' && c.status !== 'Rolled back');
    const fz = freezes.filter(f => f.from < e && (f.to == null || f.to > s)); return { s, cs, fz, dl: cs.filter(c => c.source === 'Delivery').length }; });
  return (
    <div className="dl-cal">{days.map((d, i) => { const dt = new Date(d.s); return (
      <button key={d.s} type="button" className={`dl-cal-d${d.fz.length ? ' is-freeze' : ''}${i === 0 ? ' is-today' : ''}${dt.getDay() === 0 || dt.getDay() === 6 ? ' is-we' : ''}`} onClick={() => onDay?.(d.s)}
        title={`${fmtDate(d.s)}: ${d.cs.length} change window${d.cs.length === 1 ? '' : 's'}${d.dl ? ` (${d.dl} delivery)` : ''}${d.fz.length ? ` · freeze: ${d.fz.map(f => f.title).join(', ')}` : ''}`}>
        <small>{dt.toLocaleString('en-US', { weekday: 'short' }).slice(0, 2)}</small><b>{dt.getDate()}</b>
        <span className="dl-cal-dots">{d.cs.slice(0, 4).map(c => <i key={c.id} className={`is-${c.cls.toLowerCase()}${c.source === 'Delivery' ? ' is-dl' : ''}`} />)}{d.cs.length > 4 && <em>+{d.cs.length - 4}</em>}</span>
        {d.fz.length > 0 && <I.Snowflake size={11} className="dl-cal-fz" />}
      </button>); })}</div>
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
