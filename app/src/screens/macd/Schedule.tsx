/* MACD → Schedule (the work windows of scheduled and running requests, today and the next 14 days, grouped by day, with the change
   request, crew and warnings) and MACD → Catalogue (the request types offered for this business model: SLA, charges, change class,
   records it updates, how it performed in 30 days; "Request" opens the New request form on that type). */
import { Link, useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { Btn, Chip, Panel } from '../../ui/kit';
import { DataTable } from '../../ui/DataTable';
import { fmtDayLabel, fmtNum, fmtTime } from '../../lib/format';
import type { MacdProps } from './Macd';
import { KindChip, OBJ_ICON, StageChip, hrs, isOpen, money, mrcLine, plural } from './common';

export function ScheduleView({ v }: MacdProps) {
  const nav = useNavigate();
  const now = v.now, d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const until = d0.getTime() + 15 * 864e5;
  const win = v.requests.filter(r => isOpen(r) && r.window && r.window.end >= d0.getTime() && r.window.start < until).sort((a, b) => a.window!.start - b.window!.start);
  const late = v.requests.filter(r => r.stage === 'Scheduled' && r.window && r.window.end < now);
  const unsched = v.requests.filter(r => ['Submitted', 'Feasibility', 'Quote'].includes(r.stage));
  const days = [...new Set(win.map(r => { const d = new Date(r.window!.start); d.setHours(0, 0, 0, 0); return Math.max(d.getTime(), d0.getTime()); }))];
  return (
    <div className="dl-dash">
      <Panel className="dl-span-8" title="Work windows" icon={I.CalendarClock} count={win.length} sub="Today and the next 14 days" info="Scheduled and running MACD work by day, from the change request's window. Running work shows under today. Each row opens the request.">
        {days.map(day => (
          <div key={day} className="mc-day">
            <h4>{fmtDayLabel(day, now)}<small>{plural(win.filter(r => Math.max(new Date(r.window!.start).setHours(0, 0, 0, 0), d0.getTime()) === day).length, 'window')}</small></h4>
            <ul className="ipam-find">{win.filter(r => Math.max(new Date(r.window!.start).setHours(0, 0, 0, 0), d0.getTime()) === day).map(r => { const Ic = OBJ_ICON[r.object]; return (
              <li key={r.id}><button type="button" onClick={() => nav(`/macd/requests/${r.id}`)}>
                <span className="mc-time">{r.stage === 'In progress' || r.stage === 'Verification' ? 'Now' : `${fmtTime(r.window!.start)}–${fmtTime(r.window!.end)}`}</span>
                <span className="cell-2"><b>{r.title}</b><small className="mc-obj"><Ic size={12} />{r.dcId}{r.rackName ? ` · ${r.rackName}` : ''} · <span className="mono">{r.changeId}</span>{r.changeStatus === 'Pending approval' ? ' · awaiting approval' : ''} · {r.owner}</small>
                  {r.changeBlocked && <small className="so-bad">{r.changeBlocked}</small>}</span>
                <KindChip k={r.kind} /><StageChip s={r.stage} /><I.ChevronRight size={14} className="ipam-chev" /></button></li>); })}</ul>
          </div>))}
        {!days.length && <p className="vw-label">No MACD work scheduled in the next 14 days.</p>}
      </Panel>
      <Panel className="dl-span-4" title="Not scheduled yet" icon={I.Inbox} count={unsched.length} info="Requests still in intake, feasibility or waiting for the customer to accept the quote: they get a window when the change request is raised.">
        <ul className="ipam-find">{unsched.sort((a, b) => a.slaLeftH - b.slaLeftH).slice(0, 14).map(r => (
          <li key={r.id}><button type="button" onClick={() => nav(`/macd/requests/${r.id}`)}><span className="cell-2"><b>{r.title}</b><small><span className="mono">{r.id}</span> · {r.dcId} · {r.stage} · {r.slaLeftH >= 0 ? `${hrs(r.slaLeftH)} to due` : `${hrs(r.slaLeftH)} past due`}</small></span><I.ChevronRight size={14} className="ipam-chev" /></button></li>))}
          {unsched.length > 14 && <li><Link className="ent-link" to="/macd?tab=requests&open=1&stage=Feasibility">All {unsched.length} →</Link></li>}
        </ul>
        {late.length > 0 && <p className="mc-note so-bad">{plural(late.length, 'scheduled window')} passed without the work starting.</p>}
      </Panel>
    </div>
  );
}

export function CatalogView({ v, set }: MacdProps) {
  return (
    <section className="vw-card-section dcim-table">
      <DataTable rows={v.catalog} pageSize={40} defaultSort={{ key: 'id', dir: 'asc' }}
        cols={[
          { key: 'id', header: 'Type', sort: c => c.id, render: c => <span className="cell-2"><KindChip k={c.kind} /><small className="mono">{c.id}</small></span> },
          { key: 'n', header: 'Request', wrap: true, sort: c => c.name, render: c => { const Ic = OBJ_ICON[c.object]; return <span className="cell-2"><b>{c.name}</b><small className="mc-obj"><Ic size={12} />{c.object} · {c.desc}</small></span>; } },
          { key: 'sla', header: 'SLA', sort: c => c.slaH, render: c => <span className="cell-2"><span>{hrs(c.slaH)}</span><small>expedited {hrs(c.expediteH)} · emergency 4 h</small></span> },
          { key: 'chg', header: 'Charges', sort: c => c.mrc, render: c => <span className="cell-2"><span className="rev-amt">{c.nrc ? money(c.nrc) : '—'}<small> one-time</small></span><small>{c.mrc ? `${mrcLine(c.mrc)} per ${c.unit}` : 'no monthly change'}</small></span> },
          { key: 'cr', header: 'Change', sort: c => (c.standard ? 0 : 1), render: c => <Chip tone={c.standard ? 'success' : 'info'}>{c.standard ? 'Standard' : 'Normal'}</Chip> },
          { key: 'rec', header: 'Records it updates', wrap: true, hideBelow: 1380, render: c => <small className="mc-recs">{c.records.join(' · ')}</small> },
          { key: 'use', header: '30 days', sort: c => c.uses30, render: c => <span className="cell-2"><span>{fmtNum(c.uses30)} requests</span><small>{c.avgCycleH !== undefined ? `${hrs(c.avgCycleH)} avg · ${c.onTimePct}% on time` : 'none closed'}</small></span> },
          { key: 'go', header: '', render: c => <Btn size="xs" icon={I.Plus} onClick={() => set({ new: '1', cat: c.id })}>Request</Btn> }
        ]} />
    </section>
  );
}
