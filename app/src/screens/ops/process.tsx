/* Phase 3 views (12-Oct-2026, user): problem records (Incidents → Problems), the incident's on-call / ITSM / customer-notice
   panel, the on-call rota for a datacenter, resilience tests (Facilities → Single points of failure) and colocation cross-connect
   orders and remote-hands tickets. Data: mock/ops.ts. */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, getColocationOrders, getIncidentOps, getOnCall, getProblems, getResilienceTests, useQuery } from '../../api';
import type { Problem } from '../../api/types';
import { Chip, Empty, Panel } from '../../ui/kit';
import { DataTable, type Col } from '../../ui/DataTable';
import { ListToolbar } from '../../ui/ListToolbar';
import { DcLink } from '../../ui/status';
import { Loading } from '../../shell/page';
import { fmtAgo, fmtDate, fmtDateTime, fmtTime } from '../../lib/format';
import '../../styles/physical.css';

const MIN = 60_000;
const until = (t: number, now: number) => { const m = Math.round((t - now) / MIN); return Math.abs(m) < 90 ? (m >= 0 ? `in ${m} m` : `${-m} m ago`) : Math.abs(m) < 2880 ? (m >= 0 ? `in ${Math.round(m / 60)} h` : `${Math.round(-m / 60)} h ago`) : (m >= 0 ? `in ${Math.round(m / 1440)} d` : `${Math.round(-m / 1440)} d ago`); };

/* ---------------------------------------------------------------- problems */

const PRB_TONE: Record<Problem['state'], 'error' | 'warning' | 'info'> = { Investigating: 'error', 'Known error': 'warning', 'Fix in change': 'info' };
export function ProblemsTable({ dc, initial }: { dc?: string; initial?: string | null }) {
  const { data } = useQuery(getProblems, []);
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [st, setSt] = useState('');
  const all = useMemo(() => (data ?? []).filter(p => !dc || p.sites.includes(dc)), [data, dc]);
  const rows = useMemo(() => all.filter(p => (!st || p.state === st) && (!q || `${p.id} ${p.title} ${p.owner} ${p.sites.join(' ')}`.toLowerCase().includes(q.toLowerCase()))), [all, q, st]);
  const [open, setOpen] = useState<string | null>(initial ?? null);
  if (!data) return <Loading />;
  const sel = all.find(p => p.id === open);
  const cols: Col<Problem>[] = [
    { key: 'id', header: 'Problem', render: p => <span className="cell-2"><b className="mono strong">{p.id}</b><small>{p.type}</small></span>, sort: p => p.id },
    { key: 'title', header: 'Recurring cause', wrap: true, render: p => <span className="cell-2"><b className="strong">{p.title}</b><small>{p.workaround}</small></span> },
    { key: 'state', header: 'State', render: p => <span className="cell-2"><Chip tone={PRB_TONE[p.state]} size="xs">{p.state}</Chip>{p.changeId && <Link className="ent-link mono" to={`/changes?id=${p.changeId}`} onClick={e => e.stopPropagation()}>{p.changeId}</Link>}</span>, sort: p => ['Investigating', 'Fix in change', 'Known error'].indexOf(p.state) },
    { key: 'inc', header: 'Incidents', render: p => <span className="cell-2"><span className="num">{p.incidents.length} total</span><small className={p.open ? 'bad' : ''}>{p.open} open</small></span>, sort: p => p.open * 100 + p.incidents.length },
    { key: 'sites', header: 'Datacenters', wrap: true, render: p => <span className="row wrap" style={{ gap: 4 }}>{p.sites.slice(0, 3).map(s => <DcLink key={s} id={s} />)}{p.sites.length > 3 && <span className="faint">+{p.sites.length - 3}</span>}</span>, sort: p => p.sites.length },
    { key: 'seen', header: 'Last seen', render: p => <span className="num nowrap">{fmtDate(p.lastSeen)}</span>, sort: p => p.lastSeen },
    { key: 'owner', header: 'Owner', render: p => p.owner }
  ];
  return (
    <div className={sel ? 'grid g-2-1' : 'col'} style={{ gap: 16 }}>
      <section className="card" data-problems>
        <DataTable rows={rows} cols={cols} onRow={p => setOpen(p.id === open ? null : p.id)} rowClass={p => (p.id === open ? 'is-selected' : '')} defaultSort={{ key: 'inc', dir: 'desc' }} pageSize={25}
          toolbar={<ListToolbar shown={rows.length} total={all.length} noun="problems" search={{ value: q, onChange: setQ, placeholder: 'Problem, cause, owner, datacenter' }}
            filters={[{ id: 'st', label: 'State', quick: true, value: st, anyLabel: 'Any state', onChange: setSt, options: (['Investigating', 'Fix in change', 'Known error'] as Problem['state'][]).map(s => ({ id: s, label: s, count: all.filter(p => p.state === s).length })) }]} />} />
      </section>
      {sel && (
        <Panel title={<span className="mono">{sel.id}</span>} sub={sel.title} icon={I.Bug} actions={<button type="button" className="panel-link" onClick={() => setOpen(null)}>Close<I.X size={14} /></button>}
          info="A problem record groups incidents with the same underlying cause across sites (DC-OPS-006): the workaround operators use today, the permanent fix and the change that carries it, and every incident linked to it.">
          <div className="col" style={{ gap: 10, fontSize: 13 }}>
            <div><span className="vw-label">Workaround</span><div>{sel.workaround}</div></div>
            <div><span className="vw-label">Permanent fix</span><div>{sel.fix}{sel.changeId ? <> · <Link className="ent-link mono" to={`/changes?id=${sel.changeId}`}>{sel.changeId}</Link></> : null}</div></div>
            <div><span className="vw-label">First seen · last seen</span><div className="num">{fmtDate(sel.firstSeen)} · {fmtDate(sel.lastSeen)}</div></div>
            <span className="vw-label">Incidents</span>
            <div className="col" style={{ gap: 4 }}>{sel.incidents.map(id => <button key={id} type="button" className="fac-pdu-row" onClick={() => nav(`/incidents/${id}`)}><b className="mono">{id}</b><span /><small className="muted">open the incident</small></button>)}</div>
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- incident ops */

export function IncidentOpsPanel({ id }: { id: string }) {
  const { data } = useQuery(() => getIncidentOps(id), [id]);
  const now = clockNow();
  if (!data) return null;
  const overdue = data.notices.find(n => n.state === 'overdue');
  return (
    <Panel title="On call & communications" icon={I.PhoneCall} sub={`${data.itsm.system} ${data.itsm.ref} · ${data.itsm.state} · ${data.itsm.group}`}
      info="Who was paged and when they acknowledged (L1 at once, the owner's on-call role next, the duty manager for Critical), the next escalation if nobody acts, the ITSM ticket this incident is synced to, and the notices owed to affected customers: an initial notice within 15 / 30 / 60 minutes by severity, then an update every 1 / 2 / 4 hours until resolved."
      actions={data.problemId ? <Link className="panel-link" to={`/incidents?tab=problems&prb=${data.problemId}`}>{data.problemId}<I.ChevronRight size={14} /></Link> : undefined}>
      <div className="col" style={{ gap: 12 }} data-incops>
        {overdue && <div className="note note--bad"><I.MailWarning size={15} /><span><b>Customer update overdue</b> since {fmtTime(overdue.at)}: {overdue.recipients} customers ({overdue.premium} premium) expect an update every {data.updateEveryMin / 60} h.</span></div>}
        <div className="col" style={{ gap: 4 }}>
          <span className="vw-label">Paged</span>
          {data.paged.map((p, i) => <div key={i} className="fac-pdu-row" style={{ cursor: 'default' }}><b>{p.who}</b><Chip tone={p.ack ? 'success' : 'warning'} size="xs">{p.ack ? `ack ${fmtTime(p.ack)}` : 'no ack'}</Chip><small className="muted">{p.role} · {p.via} at {fmtTime(p.at)}</small></div>)}
          {data.nextEscalation && <small className="muted"><I.ArrowUpRight size={12} style={{ verticalAlign: -2 }} /> Escalates to {data.nextEscalation.who} ({data.nextEscalation.role}) {until(data.nextEscalation.at, now)}</small>}
        </div>
        <div className="col" style={{ gap: 4 }}>
          <span className="vw-label">Customer notices</span>
          {data.notices.length ? data.notices.map((n, i) => <div key={i} className="fac-pdu-row" style={{ cursor: 'default' }}><b className="num">{fmtTime(n.at)}</b><Chip tone={n.state === 'sent' ? 'success' : n.state === 'overdue' ? 'error' : 'neutral'} size="xs">{n.state === 'sent' ? n.kind : n.state === 'overdue' ? 'Overdue' : 'Scheduled'}</Chip><small className="muted">{n.state === 'sent' ? `${n.channel} · ${n.recipients} customers · ${n.text}` : n.text}</small></div>)
            : <small className="muted">No customer-facing impact: no notices owed.</small>}
        </div>
        <small className="faint">ITSM synced {fmtAgo(data.itsm.synced, now)}</small>
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- on call */

export function OnCallPanel({ dcId }: { dcId: string }) {
  const { data } = useQuery(() => getOnCall(dcId), [dcId]);
  if (!data) return null;
  return (
    <Panel title="On call now" icon={I.PhoneCall} count={data.length} sub={data[0]?.shift} flush
      info="Who answers for this datacenter right now, by role and tier: the NOC shift lead takes every alarm first, the L2 engineers by domain, the field technician on site, and the duty manager for major incidents. The column is how long before an unacknowledged page escalates.">
      <table className="nst-table dt-table" data-oncall><thead><tr><th>Role</th><th>On call</th></tr></thead>
        <tbody>{data.map(o => <tr key={o.role}><td className="is-wrap"><span className="cell-2"><b className="strong">{o.role}</b><small>{o.covers}</small></span></td><td><span className="cell-2"><span className="nowrap">{o.name}</span><small className="nowrap">L{o.tier} · escalates after {o.escalateAfterMin} min</small></span></td></tr>)}</tbody></table>
    </Panel>
  );
}

/* ---------------------------------------------------------------- resilience tests */

export function ResilienceTestsPanel({ dcId }: { dcId: string }) {
  const { data } = useQuery(() => getResilienceTests(dcId), [dcId]);
  const now = clockNow();
  if (!data) return null;
  if (!data.length) return null;
  const bad = data.filter(t => t.state !== 'ok').length;
  return (
    <Panel title="Resilience tests" icon={I.FlaskConical} count={data.length} sub={bad ? `${bad} overdue, due or failed` : 'Every test current and passed'} flush
      info="The tests that prove the redundancy really works (DC-RES-003): generator start and transfer (monthly), UPS battery autonomy and ATS transfer (6-monthly), cooling-unit and backhaul failover (quarterly) and the site-isolation DR runbook (yearly), with the last result and when the next one is due.">
      <table className="nst-table dt-table" data-rtests><thead><tr><th>Test</th><th>Last run</th><th>Result</th><th>Next due</th></tr></thead>
        <tbody>{data.map(t => <tr key={t.id}><td className="is-wrap"><span className="cell-2"><b className="strong">{t.test}</b><small>{t.note}</small></span></td>
          <td className="num nowrap">{t.last ? fmtDate(t.last) : '—'}</td>
          <td><Chip tone={t.result === 'Pass' ? 'success' : t.result === 'Partial' ? 'warning' : t.result === 'Fail' ? 'error' : 'neutral'} size="xs">{t.result}</Chip></td>
          <td><span className="cell-2"><span className={`num nowrap ${t.state === 'overdue' || t.state === 'failed' ? 'bad' : t.state === 'due' ? 'warn' : ''}`}>{fmtDate(t.next)}</span><small>{t.state === 'overdue' ? `overdue · ${until(t.next, now)}` : until(t.next, now)}</small></span></td></tr>)}</tbody></table>
    </Panel>
  );
}

/* ---------------------------------------------------------------- colocation orders */

export function ColocationOrders({ dcId, customerId, names }: { dcId?: string; customerId?: string; names?: Record<string, string> }) {
  const { data } = useQuery(() => getColocationOrders({ dcId, customerId }), [dcId, customerId]);
  const now = clockNow();
  if (!data || (!data.xc.length && !data.hands.length)) return null;
  const inFlight = data.xc.filter(x => x.state !== 'Handed over');
  const nm = (id: string) => names?.[id] ?? id;
  return (
    <div className="grid g-2">
      <Panel title="Cross-connect orders" icon={I.Cable} count={data.xc.length} flush sub={`${inFlight.length} in flight · ${data.xc.length - inFlight.length} handed over`}
        info="Cross-connects ordered by tenants: from the tenant cabinet to a carrier, cloud on-ramp, peering fabric or another tenant through the meet-me room, with the order state (Requested, Approved, Patched, Tested, Handed over) and the due date (5 working days). Handed-over cross-connects are billed as services.">
        <table className="nst-table dt-table" data-xc><thead><tr><th>Order</th><th>{customerId ? 'Route' : 'Tenant · route'}</th><th>State</th><th>Due</th></tr></thead>
          <tbody>{[...inFlight, ...data.xc.filter(x => x.state === 'Handed over')].slice(0, 10).map(x => <tr key={x.id}><td><span className="cell-2"><b className="mono">{x.id}</b><small>{x.media}</small></span></td>
            <td className="is-wrap"><span className="cell-2">{!customerId && <b className="strong">{nm(x.customerId)}</b>}<small>{x.from} → {x.to}</small></span></td>
            <td><Chip tone={x.state === 'Handed over' ? 'success' : x.state === 'Requested' ? 'neutral' : 'info'} size="xs">{x.state}</Chip></td>
            <td><span className="cell-2"><span className={`num nowrap ${x.state !== 'Handed over' && x.due < now ? 'bad' : ''}`}>{fmtDate(x.due)}</span><small>{x.state === 'Handed over' ? 'done' : until(x.due, now)}</small></span></td></tr>)}</tbody></table>
      </Panel>
      <Panel title="Remote hands" icon={I.Hand} count={data.hands.length} flush sub={`${data.hands.filter(h => h.state !== 'Done').length} open · ${data.hands.reduce((a, h) => a + h.minutes, 0)} min used`}
        info="Remote-hands tickets: work the operator's on-site engineers do inside tenant cabinets on request (power-cycles, re-seats, swaps, escorts), with state, the engineer and the minutes booked against the tenant's remote-hands plan.">
        {data.hands.length ? <table className="nst-table dt-table" data-hands><thead><tr><th>Ticket</th><th>Task</th><th>State</th><th className="is-right">Minutes</th></tr></thead>
          <tbody>{data.hands.slice(0, 10).map(h => <tr key={h.id}><td><span className="cell-2"><b className="mono">{h.id}</b><small>{fmtDateTime(h.opened)}</small></span></td>
            <td className="is-wrap"><span className="cell-2">{!customerId && <b className="strong">{nm(h.customerId)}</b>}<small>{h.task} · {h.engineer}</small></span></td>
            <td><Chip tone={h.state === 'Done' ? 'success' : h.state === 'In progress' ? 'info' : 'neutral'} size="xs">{h.state}</Chip></td><td className="is-right num">{h.minutes || '—'}</td></tr>)}</tbody></table>
          : <div className="panel-body"><Empty icon={I.Hand} title="No remote-hands tickets" /></div>}
      </Panel>
    </div>
  );
}
