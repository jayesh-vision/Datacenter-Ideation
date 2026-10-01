import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { ackAlert, clockNow, createIncidentFromAlerts } from '../../api';
import type { Alert, Severity } from '../../api/types';
import { Btn, CheckBox, Chip, Seg } from '../../ui/kit';
import { IncidentChip, Legend, SevChip, SeverityChip } from '../../ui/status';
import { SEVERITY } from '../../lib/vocab';
import { fmtAgo, fmtDateTimeS } from '../../lib/format';
import type { NeData } from './NetworkElement';

const SEVS: Severity[] = ['critical', 'major', 'minor', 'warning'];
const isOpen = (s: string) => s === 'Open' || s === 'Investigating' || s === 'Mitigated';

export function NeAlerts({ d }: { d: NeData }) {
  const nav = useNavigate();
  const now = clockNow();
  const [view, setView] = useState<'alerts' | 'incidents'>('alerts');
  const [sev, setSev] = useState('');
  const [src, setSrc] = useState('');
  const [showCleared, setShowCleared] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const live = d.alerts.filter(a => a.state !== 'cleared');
  const rows = useMemo(() => d.alerts.filter(a => (showCleared || a.state !== 'cleared') && (!sev || a.severity === sev) && (!src || a.source === src))
    .sort((a, b) => SEVERITY[a.severity].rank - SEVERITY[b.severity].rank || b.start - a.start), [d.alerts, sev, src, showCleared]);
  const sources = [...new Set(d.alerts.map(a => a.source))];
  const inc = d.incidents.find(i => isOpen(i.status) && i.alertIds.some(id => live.some(a => a.id === id)));
  const uncorrelated = live.filter(a => !a.incidentId);
  const correlate = async (ids: string[]) => { setBusy(true); const id = await createIncidentFromAlerts(ids); setBusy(false); if (id) nav(`/incidents/${id}`); };
  const toggle = (id: string, on: boolean) => { const n = new Set(sel); on ? n.add(id) : n.delete(id); setSel(n); };

  return (
    <section className="card ne-al">
      <div className="row between wrap" style={{ gap: 12 }}>
        <Seg<'alerts' | 'incidents'> value={view} onChange={setView} options={[{ id: 'alerts', label: `Alerts · ${live.length}`, icon: I.Bell }, { id: 'incidents', label: `Incidents · ${d.incidents.length}`, icon: I.FileText }]} />
      </div>
      {view === 'alerts' ? (
        <div className="ne-al-grid">
          <div className="col" style={{ gap: 10, minWidth: 0 }}>
            <div className="ne-al-head">
              <span className="kpi-ico tone-error"><I.CircleAlert size={16} /></span>
              <div style={{ flex: 1, minWidth: 0 }}><b>Active alerts & events</b><span className="muted">Real-time monitoring across this element's resources</span></div>
              <select className="select" value={sev} onChange={e => setSev(e.target.value)} aria-label="Severity"><option value="">All severity</option>{SEVS.map(s => <option key={s} value={s}>{SEVERITY[s].label}</option>)}</select>
              <select className="select" value={src} onChange={e => setSrc(e.target.value)} aria-label="Source"><option value="">All sources</option>{sources.map(s => <option key={s}>{s}</option>)}</select>
            </div>
            {sel.size > 0 && (
              <div className="dt-bulkbar ne-al-bulk"><b>{sel.size} selected</b><span className="grow" /><Btn size="xs" onClick={() => setSel(new Set())}>Clear</Btn><Btn size="xs" variant="filled" icon={I.Combine} disabled={busy} onClick={() => correlate([...sel])}>Correlate into incident</Btn></div>
            )}
            {!rows.length && <div className="empty"><span className="empty-ico"><I.BellOff size={22} /></span><b>No alerts match</b><div>{d.ne.discovery === 'not-discovered' ? 'Not discovered — no events are collected for this element yet.' : 'Clear a filter to see more.'}</div></div>}
            {rows.map(a => <AlertCard key={a.id} a={a} on={sel.has(a.id)} onToggle={v => toggle(a.id, v)} now={now} />)}
            <div className="row between wrap ne-al-foot">
              <Legend items={SEVS.map(s => ({ label: SEVERITY[s].label, color: SEVERITY[s].color }))} />
              {d.alerts.some(a => a.state === 'cleared') && <label className="row muted" style={{ gap: 6, fontSize: 12.5, cursor: 'pointer' }}><input type="checkbox" checked={showCleared} onChange={e => setShowCleared(e.target.checked)} />Show cleared</label>}
            </div>
          </div>
          <Diagnostics inc={inc} uncorrelated={uncorrelated} onCorrelate={() => correlate(uncorrelated.map(a => a.id))} busy={busy} />
        </div>
      ) : (
        <div className="col" style={{ gap: 8 }}>
          {!d.incidents.length && <div className="empty"><span className="empty-ico"><I.FileText size={22} /></span><b>No incidents touch this element</b></div>}
          {d.incidents.map(i => (
            <Link key={i.id} to={`/incidents/${i.id}`} className="ne-inc-row">
              <SevChip n={i.sev} size="xs" /><span className="mono strong">{i.id}</span><span className="ellipsis" style={{ flex: 1 }}>{i.title}</span>
              <span className="faint num nowrap" style={{ fontSize: 12 }}>{fmtDateTimeS(i.detected)}</span><span className="muted nowrap" style={{ fontSize: 12 }}>{i.owner}</span><IncidentChip s={i.status} size="xs" /><I.ChevronRight size={15} className="faint" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function AlertCard({ a, on, onToggle, now }: { a: Alert; on: boolean; onToggle: (v: boolean) => void; now: number }) {
  return (
    <div className={`ne-alert${on ? ' is-sel' : ''}${a.state === 'cleared' ? ' is-cleared' : ''}`} style={{ '--sc': SEVERITY[a.severity].color } as React.CSSProperties}>
      <div className="ne-alert-top">
        {a.state !== 'cleared' && <CheckBox on={on} onChange={onToggle} label={`Select ${a.code}`} />}
        <SeverityChip s={a.severity} />
        <b className="ne-alert-title">{a.title}</b>
        {a.ifName && <Chip tone="neutral" size="xs"><span className="mono">{a.ifName}</span></Chip>}
        <span className="grow" />
        {a.incidentId && <Link to={`/incidents/${a.incidentId}`} className="vw-chip vw-chip--info chip-xs mono" onClick={e => e.stopPropagation()}>{a.incidentId}</Link>}
        <Chip tone={a.state === 'active' ? 'error' : a.state === 'acknowledged' ? 'warning' : 'success'} size="xs">{a.state === 'active' ? 'Active' : a.state === 'acknowledged' ? `Ack · ${a.ackBy ?? 'NOC'}` : 'Cleared'}</Chip>
        {a.state === 'active' && <Btn size="xs" icon={I.Check} onClick={() => ackAlert(a.id)}>Acknowledge</Btn>}
      </div>
      <p className="ne-alert-desc">{a.description}</p>
      <dl className="ne-alert-m">
        <div><dt>Source</dt><dd>{a.source}</dd></div>
        <div><dt>Alert type</dt><dd>{a.type}</dd></div>
        <div><dt>Event start time</dt><dd className="num">{fmtDateTimeS(a.start)}<small className="faint" style={{ display: 'block', fontSize: 11.5 }}>{fmtAgo(a.start, now)}</small></dd></div>
        <div><dt>Alert code</dt><dd className="mono">{a.code}</dd></div>
      </dl>
    </div>
  );
}

function Diagnostics({ inc, uncorrelated, onCorrelate, busy }: { inc: NeData['incidents'][number] | undefined; uncorrelated: Alert[]; onCorrelate: () => void; busy: boolean }) {
  if (!inc) return (
    <aside className="ai-card ne-ai">
      <div className="ai-card-head"><b>AI diagnostics</b><span>Intelligent root cause analysis</span></div>
      <div className="ai-card-body">
        <div className="ai-block"><h5>No correlated incident</h5><span>{uncorrelated.length ? `${uncorrelated.length} active alert${uncorrelated.length > 1 ? 's are' : ' is'} not yet correlated. Correlating groups them by topology and time and starts an RCA workspace.` : 'No active alerts on this element.'}</span>
          {uncorrelated.length > 0 && <div><Btn size="sm" variant="filled" icon={I.Combine} disabled={busy} onClick={onCorrelate}>Correlate {uncorrelated.length} alert{uncorrelated.length > 1 ? 's' : ''}</Btn></div>}</div>
      </div>
    </aside>
  );
  const h = [...inc.rca].filter(x => !x.rejected).sort((a, b) => b.confidence - a.confidence)[0] ?? inc.rca[0];
  return (
    <aside className="ai-card ne-ai">
      <div className="ai-card-head"><b>AI diagnostics</b><span>Intelligent root cause analysis · <Link to={`/incidents/${inc.id}`} className="mono" style={{ color: 'inherit', textDecoration: 'underline' }}>{inc.id}</Link></span></div>
      <div className="ai-card-body">
        <div className="ai-block">
          <h5>Root cause<Chip tone="error" size="xs">{h.confidence}%</Chip></h5>
          <span className="lbl">Most likely cause</span>
          <span>{h.cause}</span>
          <span className="bar" style={{ height: 6 }}><i style={{ width: `${h.confidence}%`, background: 'var(--vw-color-red-400)' }} /></span>
          <span className="lbl">{h.confidence}% confidence · {h.evidence.length} evidence item{h.evidence.length === 1 ? '' : 's'}</span>
        </div>
        <div className="ai-block">
          <h5>Impact assessment<Chip tone={inc.impact.level === 'High' ? 'warning' : inc.impact.level === 'Medium' ? 'info' : 'neutral'} size="xs">{inc.impact.level}</Chip></h5>
          <span className="lbl">{inc.impact.services} services · {inc.impact.customers} customers · {inc.impact.premium} premium</span>
          <span>{inc.impact.summary}</span>
        </div>
        <div className="ai-block">
          <h5>Action plan</h5>
          <span className="lbl">Priority order</span>
          <ol className="ne-ai-steps">{inc.actions.map(s => <li key={s.id} className={s.status === 'done' ? 'is-done' : ''}>{s.step}{s.disruptive && <Chip tone="warning" size="xs">approval</Chip>}</li>)}</ol>
        </div>
        {inc.similar && (
          <div className="ai-block">
            <h5>Similar events<Chip tone="info" size="xs">{inc.similar.nodes.length} nodes</Chip></h5>
            <span className="lbl">Estate correlation</span>
            <span>{inc.similar.text}</span>
            <span className="row wrap" style={{ gap: 6 }}>{inc.similar.nodes.map(n => <Link key={n} to={`/ne/${n}?tab=alerts`} className="vw-chip vw-chip--neutral chip-xs mono">{n}</Link>)}</span>
          </div>
        )}
        <Link to={`/incidents/${inc.id}`} className="nst-btn nst-btn--sm nst-btn--filled is-block" style={{ justifyContent: 'center' }}>Open RCA workspace<I.ArrowRight size={15} /></Link>
      </div>
    </aside>
  );
}
