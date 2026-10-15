/* Change management → Overview (15-Oct-2026, user: "very limited widgets … check the P2B code"). P2B's overview, redrawn in our kit:
   in pairs of equal height — volume and outcome · lead time, open changes by stage · approvals and the change board, next 14 days ·
   before the windows, changes by site · where changes fail — then one tabbed detail table (needs attention · waiting for review ·
   windows in the next 14 days · carried out in the last 28 days). Every figure is computed from the change register and links to the list. */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import type { ChangeRecord, ChangeRegister } from '../../api/types';
import { Btn, Chip, Panel, Seg, Tabs } from '../../ui/kit';
import { ChangeChip, DcLink, SevDot } from '../../ui/status';
import { DataTable, type Col } from '../../ui/DataTable';
import { TimeChart } from '../../charts/TimeChart';
import { BarList, type BarItem } from '../../charts/BarList';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { CLASS_TONE } from './Changes';

const DAY = 86_400_000;
const OPEN = (c: ChangeRecord) => !['Completed', 'Rolled back', 'Rejected'].includes(c.status);
const DONE = (c: ChangeRecord) => c.status === 'Completed' || c.status === 'Rolled back';
const FAILED = (c: ChangeRecord) => c.status === 'Rolled back' || c.outcome === 'Caused an incident';
/* calm palette: classes in a blue-grey ramp, red only for failures */
const C = { standard: 'var(--vw-color-slate-300)', normal: 'var(--primaryColor400, #4f9cf5)', emergency: 'var(--vw-color-amber-400)', failed: 'var(--vw-color-red-500)', bar: 'var(--primaryColor400, #4f9cf5)', warn: 'var(--vw-color-amber-400)', bad: 'var(--vw-color-red-400)' };
const med = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const d1 = (n: number | null) => (n == null ? '—' : `${n < 10 ? n.toFixed(1) : Math.round(n)} d`);
const short = (t: number) => fmtDate(t).replace(/,? \d{4}$/, '');
const lastApproval = (c: ChangeRecord) => Math.max(c.created, ...c.approvals.map(a => a.at ?? 0));
const STAGES: ChangeRecord['status'][] = ['Draft', 'Pending approval', 'Approved', 'In progress'];

type Detail = 'attention' | 'closeout' | 'windows' | 'recent';

export function ChangeOverview({ r, now, go }: { r: ChangeRegister; now: number; go: (patch: Record<string, string>) => void }) {
  const nav = useNavigate();
  const [failBy, setFailBy] = useState<'source' | 'template'>('source');
  const [detail, setDetail] = useState<Detail>('attention');
  const [allSites, setAllSites] = useState(false);
  const all = r.changes, open = all.filter(OPEN);
  const open14 = open.filter(c => c.windowStart >= now - 6 * 3600e3 && c.windowStart < now + 14 * DAY).sort((a, b) => a.windowStart - b.windowStart);

  /* ---- volume and outcome: 12 weeks by class + failed */
  const labels = r.weeks.map(w => short(w.start));
  const tot12 = r.weeks.reduce((a, w) => a + w.standard + w.normal + w.emergency, 0), fail12 = r.weeks.reduce((a, w) => a + w.failed, 0);

  /* ---- lead time of normal changes: created → last approval → window */
  const wk0 = now - 12 * 7 * DAY;
  const normDone = all.filter(c => c.cls === 'Normal' && DONE(c) && c.windowEnd >= wk0 && c.windowEnd <= now);
  const lead = r.weeks.map(w => { const xs = normDone.filter(c => c.windowEnd >= w.start && c.windowEnd < w.start + 7 * DAY); return { approve: med(xs.map(c => (lastApproval(c) - c.created) / DAY)), implement: med(xs.map(c => Math.max(0, (c.windowStart - lastApproval(c)) / DAY))) }; });
  const leadAll = med(normDone.map(c => (c.windowStart - c.created) / DAY));

  /* ---- open by stage */
  const stuckOf = (c: ChangeRecord) => (c.status === 'Draft' || c.status === 'Pending approval' ? now - c.created > 7 * DAY : c.status === 'Approved' ? c.windowEnd < now : now - c.windowStart > 2 * DAY);
  const stageItems: BarItem[] = STAGES.map(s => {
    const xs = open.filter(c => c.status === s), stuck = xs.filter(stuckOf).length;
    return { key: s, label: s, value: xs.length, display: String(xs.length), secondary: stuck ? ` · ${stuck} stuck` : undefined, color: stuck ? C.warn : C.bar,
      sublabel: xs.length ? `${xs.filter(c => c.cls === 'Standard').length} standard · ${xs.filter(c => c.cls === 'Normal').length} normal · ${xs.filter(c => c.cls === 'Emergency').length} emergency` : 'none', onClick: () => go({ tab: 'changes', status: s }) };
  });

  /* ---- approvals: who is holding them, and the next board */
  const pending = all.filter(c => c.status === 'Pending approval');
  const byRole = new Map<string, ChangeRecord[]>();
  for (const c of pending) { const s = c.approvals.find(a => a.decision === 'Pending'); if (s) byRole.set(s.role, [...(byRole.get(s.role) ?? []), c]); }
  const roleItems: BarItem[] = [...byRole].sort((a, b) => b[1].length - a[1].length).map(([role, xs]) => {
    const oldest = Math.round((now - Math.min(...xs.map(c => c.created))) / DAY), over = xs.filter(c => now - c.created > 3 * DAY).length;
    return { key: role, label: role, value: xs.length, display: String(xs.length), secondary: ` · oldest ${oldest} d`, color: over ? C.warn : C.bar, sublabel: `${xs.length - over} within 3 days · ${over} over 3 days`, onClick: () => go({ tab: 'approvals' }) };
  });
  const thu = new Date(now); thu.setHours(10, 0, 0, 0); thu.setDate(thu.getDate() + ((4 - thu.getDay() + 7) % 7 || (thu.getTime() <= now ? 7 : 0)));
  const cab = pending.filter(c => c.approvals.some(a => a.role === 'Change advisory board' && a.decision !== 'Approved'));

  /* ---- next 14 days, per day by class */
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 14 }, (_, i) => d0.getTime() + i * DAY);
  const inDay = (t: number) => open14.filter(c => c.windowStart >= t && c.windowStart < t + DAY);
  const frozen = days.filter(t => r.freezes.some(f => f.scope === 'Estate' && t + DAY > f.from && t < (f.to ?? Infinity)));
  const issues: { key: string; label: string; hint: string; xs: ChangeRecord[]; tone: 'bad' | 'warn' | 'neutral'; to: Record<string, string> }[] = [
    { key: 'frz', label: 'In a freeze', hint: 'move the window or raise an emergency', xs: open14.filter(c => c.freeze), tone: 'bad', to: { tab: 'freezes' } },
    { key: 'apr', label: 'Not approved yet', hint: 'window booked, decision pending', xs: open14.filter(c => c.status === 'Draft' || c.status === 'Pending approval'), tone: 'warn', to: { tab: 'approvals' } },
    { key: 'cfl', label: 'Overlapping windows', hint: 'same devices, same time', xs: open14.filter(c => c.conflicts.length), tone: 'warn', to: { tab: 'changes', status: 'open', pol: 'POL-05' } },
    { key: 'pol', label: 'Policy warnings', hint: 'maintenance hours, single points of failure', xs: open14.filter(c => c.violations.some(v => v.enforcement === 'Warn' && v.policy !== 'POL-05')), tone: 'warn', to: { tab: 'policies' } },
    { key: 'hi', label: 'High risk', hint: 'check the back-out plan and the crew', xs: open14.filter(c => c.risk === 'High'), tone: 'neutral', to: { tab: 'changes', status: 'open' } }
  ];

  /* ---- sites: success of changes carried out in 12 weeks, and open now */
  const done12 = all.filter(c => DONE(c) && c.windowEnd >= wk0 && c.windowEnd <= now);
  const siteRows = [...new Set([...done12, ...open].map(c => c.dcId))].map(dc => {
    const d = done12.filter(c => c.dcId === dc), f = d.filter(FAILED).length, o = open.filter(c => c.dcId === dc).length;
    return { dc, done: d.length, failed: f, open: o, pct: d.length ? Math.round(((d.length - f) / d.length) * 100) : null };
  }).sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101) || b.done + b.open - (a.done + a.open));
  const siteItems: BarItem[] = (allSites ? siteRows : siteRows.slice(0, 8)).map(s => ({ key: s.dc, label: s.dc, value: s.done + s.open, display: s.pct == null ? '—' : `${s.pct}%`, secondary: ` · ${s.done} done · ${s.open} open`,
    color: s.pct != null && s.pct < 90 ? C.bad : C.bar, sublabel: `${s.done - s.failed} successful · ${s.failed} failed`, onClick: () => go({ tab: 'changes', dc: s.dc }) }));

  /* ---- where changes fail */
  const srcItems: BarItem[] = (['Operations', 'Maintenance', 'Delivery', 'DCIM'] as const).map(s => { const d = done12.filter(c => c.source === s), f = d.filter(FAILED).length;
    return { key: s, label: s, value: d.length, display: f ? `${f} of ${d.length} failed` : `none of ${d.length}`, color: f ? C.bad : C.bar, sublabel: `${d.length - f} succeeded · ${f} rolled back or caused an incident`, onClick: () => go({ tab: 'changes', src: s }) }; }).filter(x => x.value);
  const tplItems: BarItem[] = r.templates.map(t => ({ key: t.id, label: t.name, value: t.uses, display: `${t.success}% success`, secondary: ` · ${t.uses} used`, color: t.success < 100 ? C.bad : C.bar, sublabel: t.lastUsed ? `last used ${fmtDate(t.lastUsed)}` : 'not used yet', onClick: () => go({ tab: 'standard' }) })).sort((a, b) => b.value - a.value);

  /* ---- detail tables */
  const attention = [...open.filter(c => c.violations.length || c.conflicts.length || stuckOf(c))].sort((a, b) => Number(b.violations.some(v => v.enforcement === 'Block')) - Number(a.violations.some(v => v.enforcement === 'Block')) || a.windowStart - b.windowStart);
  const closeout = all.filter(c => c.pir.state === 'Due' || c.pir.state === 'Overdue');
  const recent = all.filter(c => DONE(c) && c.windowEnd >= now - 28 * DAY && c.windowEnd <= now).sort((a, b) => b.windowEnd - a.windowEnd);
  const why = (c: ChangeRecord) => [...c.violations.map(v => v.text), ...(stuckOf(c) ? [c.status === 'Approved' ? 'window passed, not started' : `${Math.round((now - c.created) / DAY)} days in ${c.status.toLowerCase()}`] : [])].join(' · ') || '—';
  const idCell = (c: ChangeRecord) => <span className="cell-2"><Link className="ent-link mono" to={`/changes/${encodeURIComponent(c.id)}`} onClick={e => e.stopPropagation()}>{c.id}</Link><small>{c.title}</small></span>;
  const base: Col<ChangeRecord>[] = [
    { key: 'id', header: 'Change', wrap: true, render: idCell },
    { key: 'cls', header: 'Class', render: c => <Chip size="xs" tone={CLASS_TONE[c.cls]}>{c.cls}</Chip> },
    { key: 'st', header: 'Status', render: c => <ChangeChip s={c.status} size="xs" /> },
    { key: 'dc', header: 'Site', render: c => <DcLink id={c.dcId} /> }
  ];
  const DETAIL: Record<Detail, { label: string; rows: ChangeRecord[]; cols: Col<ChangeRecord>[]; empty: string }> = {
    attention: { label: 'Needs attention', rows: attention, empty: 'No open change needs attention.', cols: [base[0], { key: 'why', header: 'Why', wrap: true, render: c => <span className="cm-why"><SevDot s={c.violations.some(v => v.enforcement === 'Block') ? 'major' : 'minor'} />{why(c)}</span> }, base[1], base[2], { key: 'w', header: 'Window', render: c => <span className="nowrap">{fmtDateTime(c.windowStart)}</span> }, base[3]] },
    closeout: { label: 'Waiting for review', rows: closeout, empty: 'Every emergency, rolled-back and incident-causing change is reviewed.', cols: [base[0], { key: 'r', header: 'Review', render: c => <span className="cell-2"><Chip size="xs" tone={c.pir.state === 'Overdue' ? 'error' : 'warning'}>{c.pir.state}</Chip><small>{c.pir.due ? `due ${fmtDate(c.pir.due)}` : ''}{c.causedIncident ? ` · caused ${c.causedIncident}` : ''}</small></span> }, base[1], base[2], base[3]] },
    windows: { label: 'Next 14 days', rows: open14, empty: 'No change window in the next 14 days.', cols: [{ key: 'w', header: 'Window', render: c => <span className="cell-2"><span className="nowrap">{fmtDateTime(c.windowStart)}</span><small className="nowrap">to {fmtDateTime(c.windowEnd)}</small></span> }, base[0], base[1], base[2], { key: 'f', header: 'Freeze', render: c => (c.freeze ? <Chip size="xs" tone="warning">in a freeze</Chip> : <span className="vw-label">—</span>) }, base[3]] },
    recent: { label: 'Last 28 days', rows: recent, empty: 'No change was carried out in the last 28 days.', cols: [{ key: 'd', header: 'Implemented', render: c => <span className="nowrap">{fmtDateTime(c.windowEnd)}</span> }, base[0], base[1], { key: 'o', header: 'Outcome', render: c => <Chip size="xs" dot tone={c.outcome === 'Successful' ? 'success' : 'error'}>{c.outcome ?? c.status}</Chip> }, base[3]] }
  };
  const D = DETAIL[detail];

  return (<>
    <div className="cm-dash">
      <Panel title="Volume and outcome" icon={I.ChartColumn} info="Changes implemented each week for the last 12 weeks, by class, and the share that succeeded (did not roll back or cause an incident). Hover a week for its numbers.">
        <div className="cm-figs"><span><b>{tot12}</b> implemented</span><span><b>{tot12 ? Math.round(((tot12 - fail12) / tot12) * 100) : 100}%</b> successful</span><span className={fail12 ? 'is-bad' : undefined}><b>{fail12}</b> failed</span><span><b>{(tot12 / 12).toFixed(1)}</b> a week</span></div>
        <TimeChart labels={labels} height={250} series={[
          { key: 'st', label: 'Standard', color: C.standard, kind: 'bar', stack: 'c', values: r.weeks.map(w => w.standard) },
          { key: 'no', label: 'Normal', color: C.normal, kind: 'bar', stack: 'c', values: r.weeks.map(w => w.normal) },
          { key: 'em', label: 'Emergency', color: C.emergency, kind: 'bar', stack: 'c', values: r.weeks.map(w => w.emergency) },
          { key: 'fa', label: 'Failed', color: C.failed, kind: 'line', values: r.weeks.map(w => w.failed) }]} />
      </Panel>
      <Panel title="Lead time" icon={I.Hourglass} info="Normal changes implemented each week: median days from raised to the last approval, then from approval to the window (includes waiting for a slot).">
        <div className="cm-figs"><span><b>{d1(leadAll)}</b> median raised → window</span><span><b>{normDone.length}</b> normal changes in 12 weeks</span></div>
        <TimeChart labels={labels} height={250} format={v => `${Math.round(v * 10) / 10} d`} series={[
          { key: 'a', label: 'To approve', color: C.normal, kind: 'bar', stack: 'l', values: lead.map(x => x.approve) },
          { key: 'i', label: 'Approved → window', color: C.standard, kind: 'bar', stack: 'l', values: lead.map(x => x.implement) }]} />
      </Panel>

      <Panel title="Open changes by stage" icon={I.GitPullRequestArrow} count={open.length} info="Where every open change is now, split by class. Stuck = more than 7 days in draft or approval, an approved window that has passed, or in progress for over 2 days. Click a stage for its changes.">
        <div className="cm-figs"><span><b>{open.length}</b> open</span><span className={open.filter(stuckOf).length ? 'is-warn' : undefined}><b>{open.filter(stuckOf).length}</b> stuck</span><span><b>{d1(open.length ? Math.max(...open.map(c => (now - c.created) / DAY)) : null)}</b> oldest open</span></div>
        <div className="cm-pipe">{STAGES.map((st, i) => { const n = open.filter(c => c.status === st).length; return n ? <button key={st} type="button" style={{ flex: n, background: ['var(--vw-color-slate-300)', 'var(--primaryColor300, #93c5fd)', 'var(--primaryColor400, #4f9cf5)', 'var(--primaryColor600, #1d6fd1)'][i] }} title={`${st}: ${n}`} onClick={() => go({ tab: 'changes', status: st })} /> : null; })}</div>
        <BarList items={stageItems} />
      </Panel>
      <Panel title="Approvals and the change board" icon={I.Gavel} count={pending.length} info="Changes waiting on each approval role (3-day target), and the normal changes on the next weekly change advisory board (Thursdays 10:00).">
        {roleItems.length ? <BarList items={roleItems} /> : <p className="vw-label">Nothing is waiting for a decision.</p>}
        {pending.length > 0 && <ul className="cm-wait">{[...pending].sort((a, b) => a.created - b.created).slice(0, 4).map(c => (
          <li key={c.id}><Link className="ent-link mono" to={`/changes/${encodeURIComponent(c.id)}`}>{c.id}</Link><span title={c.title}>{c.title}</span>
            <Chip size="xs" tone={c.risk === 'High' ? 'warning' : 'neutral'}>{c.risk}</Chip><small>{Math.max(0, Math.round((now - c.created) / DAY))} d</small></li>))}</ul>}
        <div className="cm-board"><I.CalendarCheck size={15} /><span><b>Next change board · {fmtDateTime(thu.getTime())}</b><small>{cab.length ? `${cab.length} high-risk change${cab.length === 1 ? '' : 's'} on the agenda: ${cab.slice(0, 4).map(c => c.id).join(', ')}${cab.length > 4 ? '…' : ''}` : 'No high-risk change on the agenda yet'}</small></span>
          <Btn size="sm" onClick={() => go({ tab: 'approvals' })}>Open approvals</Btn></div>
      </Panel>

      <Panel title="Next 14 days" icon={I.CalendarRange} count={open14.length} info="Open change windows per day by class. Days inside an estate freeze are listed under the chart.">
        <TimeChart labels={days.map(t => new Date(t).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }))} height={240} series={[
          { key: 'st', label: 'Standard', color: C.standard, kind: 'bar', stack: 'd', values: days.map(t => inDay(t).filter(c => c.cls === 'Standard').length) },
          { key: 'no', label: 'Normal', color: C.normal, kind: 'bar', stack: 'd', values: days.map(t => inDay(t).filter(c => c.cls === 'Normal').length) },
          { key: 'em', label: 'Emergency', color: C.emergency, kind: 'bar', stack: 'd', values: days.map(t => inDay(t).filter(c => c.cls === 'Emergency').length) }]} />
        <p className="cm-note">{frozen.length ? <>Frozen days: {frozen.map(t => <Chip key={t} size="xs" tone="warning">{short(t)}</Chip>)}</> : 'No estate freeze in the next 14 days.'}</p>
      </Panel>
      <Panel title="Before the windows" icon={I.TriangleAlert} info="What could stop the changes booked in the next 14 days. Click a line for the list.">
        <ul className="cm-issues">{issues.map(x => (
          <li key={x.key}><button type="button" onClick={() => go(x.to)} disabled={!x.xs.length}>
            <span className={`cm-issue-n is-${x.xs.length ? x.tone : 'none'}`}>{x.xs.length}</span>
            <span className="cell-2"><b>{x.label}</b><small>{x.xs.length ? x.xs.slice(0, 3).map(c => c.id).join(' · ') + (x.xs.length > 3 ? ` +${x.xs.length - 3}` : '') : x.hint}</small></span>
            <I.ChevronRight size={14} /></button></li>))}</ul>
      </Panel>

      <Panel title="Changes by site" icon={I.MapPin} count={siteRows.length} info="Success rate of the changes carried out at each site in the last 12 weeks, and the changes open there now; worst first."
        foot={siteRows.length > 8 ? <Btn size="xs" onClick={() => setAllSites(a => !a)}>{allSites ? 'Show fewer' : `Show all ${siteRows.length}`}</Btn> : undefined}>
        <BarList items={siteItems} />
      </Panel>
      <Panel title="Where changes fail" icon={I.ShieldX} info="Changes carried out in the last 12 weeks that rolled back or caused an incident, by where they come from, or the standard template's success."
        actions={<Seg size="sm" value={failBy} onChange={v => setFailBy(v)} options={[{ id: 'source', label: 'By source' }, { id: 'template', label: 'By template' }]} />}>
        <BarList items={failBy === 'source' ? srcItems : tplItems} />
      </Panel>
    </div>

    <section className="vw-card-section dcim-table cm-detail">
      <div className="cm-detail-head"><Tabs value={detail} onChange={setDetail} tabs={(Object.keys(DETAIL) as Detail[]).map(k => ({ id: k, label: DETAIL[k].label, count: DETAIL[k].rows.length }))} />
        <Btn size="sm" icon={I.List} onClick={() => go({ tab: detail === 'windows' ? 'calendar' : 'changes', ...(detail === 'attention' ? { status: 'open' } : detail === 'recent' ? { status: 'Completed' } : {}) })}>Open the list</Btn></div>
      <DataTable rows={D.rows} cols={D.cols} pageSize={8} onRow={c => nav(`/changes/${encodeURIComponent(c.id)}`)} empty={<p className="vw-label" style={{ padding: 16 }}>{D.empty}</p>} />
    </section>
  </>);
}
