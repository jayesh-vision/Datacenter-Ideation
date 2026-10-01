import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow } from '../../api';
import type { TimelineEvent } from '../../api/types';
import { Panel, Empty } from '../../ui/kit';
import { fmtDateTime, fmtIn } from '../../lib/format';
import type { SiteData } from './Site';

const KIND: Record<TimelineEvent['kind'], { label: string; icon: I.LucideIcon; tone: string }> = {
  incident: { label: 'Incidents', icon: I.Siren, tone: 'error' }, change: { label: 'Changes', icon: I.ArrowLeftRight, tone: 'purple' }, maintenance: { label: 'Maintenance', icon: I.Wrench, tone: 'warning' },
  capacity: { label: 'Capacity', icon: I.Gauge, tone: 'cyan' }, commissioning: { label: 'Commissioning', icon: I.Flag, tone: 'success' }, discovery: { label: 'Discovery', icon: I.Radar, tone: 'neutral' }
};
const refTo = (e: TimelineEvent) => !e.ref ? undefined : e.ref.startsWith('INC') ? `/incidents/${e.ref}` : e.ref.startsWith('CHG') ? `/changes?id=${e.ref}` : e.ref.startsWith('CAP') ? '/capacity' : undefined;

/* DC-SITE-010 — commissioning, changes, incidents, maintenance and capacity
   events for this site, newest first, with upcoming windows on top. */
export function Timeline({ data }: { data: SiteData }) {
  const now = clockNow();
  const all = data.timeline;
  const kinds = (Object.keys(KIND) as TimelineEvent['kind'][]).filter(k => all.some(e => e.kind === k));
  const [on, setOn] = useState<Set<string>>(new Set(kinds));
  const ev = all.filter(e => on.has(e.kind));
  const upcoming = ev.filter(e => e.at > now).sort((a, b) => a.at - b.at);
  const past = ev.filter(e => e.at <= now);
  const toggle = (k: string) => setOn(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const item = (e: TimelineEvent, i: number) => {
    const k = KIND[e.kind]; const to = refTo(e);
    const body = <><b>{e.title}</b><small className="num">{fmtDateTime(e.at)} · {fmtIn(e.at, now)}</small></>;
    return (
      <li key={`${e.ref}-${i}`}>
        <span className={`tl-ico tone-${k.tone}`}><k.icon size={14} /></span>
        {to ? <Link to={to} className="tl-body">{body}</Link> : <span className="tl-body">{body}</span>}
      </li>
    );
  };

  return (
    <Panel title="Operational timeline" sub="Commissioning, changes, incidents, maintenance and capacity events at this site"
      actions={<div className="row wrap" style={{ gap: 6 }}>{kinds.map(k => <button key={k} type="button" className={`tl-filter${on.has(k) ? ' is-on' : ''}`} onClick={() => toggle(k)}>{(() => { const C = KIND[k].icon; return <C size={13} />; })()}{KIND[k].label}<span className="num">{all.filter(e => e.kind === k).length}</span></button>)}</div>}>
      {!ev.length ? <Empty icon={I.CalendarX} title="No events for the selected types" /> : (
        <div className="col" style={{ gap: 18 }}>
          {upcoming.length > 0 && <div><div className="tl-h">Upcoming</div><ul className="tl">{upcoming.map(item)}</ul></div>}
          <div><div className="tl-h">History</div><ul className="tl">{past.map(item)}</ul></div>
        </div>
      )}
    </Panel>
  );
}
