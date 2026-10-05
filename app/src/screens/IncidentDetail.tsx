import { ScopeChip } from '../ui/scope';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { addWorklog, advanceIncident, clockNow, getIncident, hypothesisFeedback, raiseEmergencyChange, runClosureChecks, setActionStatus, useQuery, vocabNow } from '../api';
import type { ActionStep, IncidentStatus, RevIssue } from '../api/types';
import { usePage, Loading, useSentinel } from '../shell/page';
import { Btn, Chip, Panel } from '../ui/kit';
import { ChangeChip, CustLink, DcLink, IncidentChip, PriChip, SevChip, SevDot, SeverityChip, SvcLink, ServiceChip } from '../ui/status';
import { fmtAgo, fmtDateTime, fmtDateTimeS, fmtDur, fmtQty } from '../lib/format';
import { CostCurve, DomainTag, Fig, inr, lc, perHr, perMo, stateText } from './revenue/parts';
import { NotFound } from './NotFound';
import { TYPE_ICON } from './Incidents';
import { fmtHm, refTo, slaText, useToast, OpsKpi } from './ops/shared';
import { OpstralBadge, OpstralBtn } from '../ui/OpstralMark';

const FLOW: IncidentStatus[] = ['Open', 'Investigating', 'Mitigated', 'Resolved', 'Closed'];

/* Incident workspace (DC-OPS-002…008, DC-AI-002/003/004/006/007/008):
   alert + RCA + impact + action plan side by side. */
export function IncidentDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const ask = useSentinel();
  const toast = useToast();
  const { data, loading } = useQuery(() => getIncident(id), [id]);
  const [note, setNote] = useState('');
  const [allSvc, setAllSvc] = useState(false);
  usePage([{ label: 'Operate' }, { label: 'Incidents', to: '/incidents' }, { label: id }], { incidentId: id, dcId: data?.incident.dcId });
  if (!data) return loading ? <Loading /> : <NotFound what={`Incident ${id}`} />;

  const { incident: inc, alerts, symptoms, services, customers, changes, dc, similar, revenue: rev } = data;
  const now = clockNow();
  const open = inc.status === 'Open' || inc.status === 'Investigating' || inc.status === 'Mitigated';
  const next = FLOW[Math.min(FLOW.indexOf(inc.status) + 1, FLOW.length - 1)];
  const checksOk = inc.verification.every(v => v.ok === true);
  const alertNe = (code: string) => alerts.find(a => a.code === code)?.neId;
  const TypeIc = TYPE_ICON[inc.type];
  const ne = inc.affected.find(a => a.kind === 'NE');
  const rack = inc.affected.find(a => a.kind === 'Rack');
  const lnk = inc.affected.find(a => a.kind === 'Link');
  const ifName = alerts.find(a => a.ifName)?.ifName;
  const premium = customers.filter(c => c.premium);
  /* premium customers first, then by bandwidth */
  const svcSorted = [...services].sort((a, b) => Number(b.customer.premium) - Number(a.customer.premium) || b.qty - a.qty);
  const V = vocabNow();
  const resolveAll = async () => { for (let k = FLOW.indexOf(inc.status); k < FLOW.indexOf('Resolved'); k++) await advanceIncident(inc.id); };

  return (
    <div className="page">
      <section className="card inc-head">
        <div className="row wrap" style={{ gap: 10 }}>
          <Btn icon={I.ArrowLeft} onClick={() => nav('/incidents')}>Incidents</Btn>
          <h1 className="mono">{inc.id}</h1>
          <SevChip n={inc.sev} /><PriChip n={inc.pri} /><IncidentChip s={inc.status} />
          {inc.sla.breaching && <Chip tone="error">SLA breach</Chip>}
          <span className="row muted" style={{ gap: 6, fontSize: 13 }}><span className={`type-ico t-${inc.type.toLowerCase()}`}><TypeIc size={13} /></span>{inc.type} · <DcLink id={inc.dcId} tab="attention" /> · {dc.city}</span>
        </div>
        <div className="inc-title">{inc.title}</div>
        <div className="row wrap" style={{ gap: 8 }}>
          {open && next !== 'Resolved' && <Btn variant="filled" icon={I.ArrowRightLeft} onClick={() => advanceIncident(inc.id)}>Advance to {next}</Btn>}
          {open && <Btn icon={I.CircleCheck} disabled={!checksOk} onClick={resolveAll} title={checksOk ? 'All closure checks passed' : 'Run closure checks first — every check must pass before resolving (DC-OPS-008)'}>Resolve</Btn>}
          {inc.status === 'Resolved' && <Btn variant="filled" icon={I.Archive} onClick={() => advanceIncident(inc.id)}>Close incident</Btn>}
          {open && <Btn icon={I.PencilLine} onClick={async () => { const c = await raiseEmergencyChange(inc.id); toast.show(`Emergency change ${c} raised`, 'Pending approval · scope taken from the affected devices.', { to: `/changes?id=${c}`, label: 'Open change' }); }}>Raise emergency change</Btn>}
          <OpstralBtn onClick={() => ask(`What changed before ${inc.id}?`)} />
          <span className="grow" />
          {!checksOk && open && <span className="faint" style={{ fontSize: 12 }}><I.Lock size={12} style={{ verticalAlign: -2 }} /> Resolve unlocks after closure checks pass</span>}
        </div>
      </section>

      <div className="kpis kpis-3">
        <OpsKpi label="Response SLA" tone={inc.sla.responseBreached ? 'bad' : undefined} value={inc.sla.responseBreached ? 'Breached' : inc.acknowledged ? 'Met' : 'Open'}
          sub={inc.sla.responseBreached ? `acknowledged after ${inc.sla.responseMin} m · target ${fmtHm(inc.responseSlaMin)}` : inc.acknowledged ? `acknowledged in ${inc.sla.responseMin} m · target ${fmtHm(inc.responseSlaMin)}` : `${fmtHm(Math.max(0, inc.sla.responseLeft))} left to acknowledge`} />
        <OpsKpi label="Resolution SLA" tone={open && inc.sla.resolveLeft < 0 ? 'bad' : open && inc.sla.resolveLeft < inc.resolveSlaMin * 0.25 ? 'warn' : undefined}
          value={open ? slaText(inc.sla.resolveLeft) : inc.resolved ? fmtHm((inc.resolved - inc.detected) / 60000) : '—'} sub={open ? `target ${fmtHm(inc.resolveSlaMin)} from detection` : 'time to resolve'} />
        <OpsKpi label="Severity · priority" value={`SEV${inc.sev} · P${inc.pri}`} sub={`${inc.type} · ${dc.city}`} />
      </div>

      <div className="inc-grid">
        <div className="col" style={{ gap: 16 }}>
          <Panel title="Details">
            <table className="kv-table"><tbody>
              <tr><th>Title</th><td>{inc.title}</td></tr>
              <tr><th>Type</th><td>{inc.type}</td></tr>
              <tr><th>Owner</th><td>{inc.owner}</td></tr>
              <tr><th>Reported by</th><td>{inc.reportedBy}</td></tr>
              <tr><th>Data center</th><td><DcLink id={inc.dcId} /> <span className="muted">· {dc.address}, {dc.city}</span></td></tr>
              <tr><th>Detected</th><td className="num">{fmtDateTime(inc.detected)} <span className="faint">({fmtAgo(inc.detected, now)})</span></td></tr>
              <tr><th>Acknowledged</th><td className="num">{inc.acknowledged ? fmtDateTime(inc.acknowledged) : '—'}</td></tr>
              <tr><th>Resolved</th><td className="num">{inc.resolved ? fmtDateTime(inc.resolved) : '—'}</td></tr>
              <tr><th>MTTR</th><td className="num">{inc.resolved ? fmtHm((inc.resolved - inc.detected) / 60000) : '—'}</td></tr>
              <tr><th>Affected</th><td><div className="row wrap" style={{ gap: 6 }}>{inc.affected.length ? inc.affected.map(a => { const to = refTo(a.id); return to ? <Link key={a.id} to={to} className="vw-chip vw-chip--neutral chip-xs aff-chip">{a.kind}:{a.label}</Link> : <span key={a.id} className="vw-chip vw-chip--neutral chip-xs">{a.kind}:{a.label}</span>; }) : <span className="faint">—</span>}</div></td></tr>
            </tbody></table>
          </Panel>

          <Panel title="Correlated alerts" count={alerts.length} sub="Grouped by topology, time and source (DC-OPS-001)">
            {alerts.length ? <div className="col" style={{ gap: 8 }}>{alerts.map(a => (
              <Link key={a.id} to={a.neId ? `/ne/${encodeURIComponent(a.neId)}?tab=alerts` : `/alerts?q=${a.code}`} className={`alert-row sev-${a.severity}`}>
                <SevDot s={a.severity} />
                <span style={{ flex: 1, minWidth: 0 }}><b>{a.title}</b><small>{a.description}</small></span>
                <span className="cell-2 num" style={{ textAlign: 'right' }}><span className="mono">{a.code}</span><small>{a.neId ?? a.dcId}{a.ifName ? ` · ${a.ifName}` : ''} · {fmtDateTimeS(a.start).slice(12)}</small></span>
                <ScopeChip a={a} />
                <SeverityChip s={a.severity} size="xs" />
              </Link>))}</div> : <div className="faint" style={{ fontSize: 13 }}>No live alerts are linked (historic incident).</div>}
            {symptoms.length > 0 && (
              <div className="vw-card-child-shaded inc-symptoms">
                <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm">
                  <span className="vw-card-activity-label">Downstream symptoms · {symptoms.length}</span>
                  <span className="vw-label">Rolled up here as impact — not separate datacenter issues</span>
                </div>
                <ul>{symptoms.map(a => <li key={a.id}><span className="mono">{a.node}</span><span className="vw-label">{a.nodeLocation} · {a.hops} hop{a.hops === 1 ? '' : 's'} · {a.title.toLowerCase()} {Math.round((a.start - (alerts.find(x => x.code === a.symptomOf)?.start ?? a.start)) / 1000)} s after {a.symptomOf}</span></li>)}</ul>
              </div>
            )}
          </Panel>

          {open && rev && <RevenuePanel rev={rev} now={now} onAsk={() => ask(`What is ${inc.id} costing us?`)} />}

          <Panel title="Impact assessment" sub="Infrastructure → services → customers (DC-OPS-002, DC-NET-007)" actions={<Chip tone={inc.impact.level === 'High' ? 'error' : inc.impact.level === 'Medium' ? 'warning' : 'neutral'}>{inc.impact.level}</Chip>}>
            <div className="dep-path">
              <Link to={`/datacenters/${inc.dcId}`} className="dep-node"><I.Building2 size={14} /><span><small>Site</small>{inc.dcId}</span></Link>
              {rack && <><I.ChevronRight size={14} className="faint" /><Link to={refTo(rack.id) ?? '#'} className="dep-node"><I.Server size={14} /><span><small>Rack</small>{rack.label}</span></Link></>}
              {ne && <><I.ChevronRight size={14} className="faint" /><Link to={`/ne/${encodeURIComponent(ne.id)}`} className="dep-node"><I.Router size={14} /><span><small>Network element</small>{ne.id.replace(`${inc.dcId}-`, '')}</span></Link></>}
              {(lnk || ifName) && <><I.ChevronRight size={14} className="faint" /><Link to={ne ? `/ne/${encodeURIComponent(ne.id)}?tab=links${ifName ? `&if=${encodeURIComponent(ifName)}` : ''}` : '#'} className="dep-node"><I.Cable size={14} /><span><small>{lnk ? 'Interface / link' : 'Interface'}</small>{ifName ?? lnk!.id}</span></Link></>}
              <I.ChevronRight size={14} className="faint" />
              <a href="#inc-svcs" className={`dep-node${services.length ? ' is-hot' : ''}`}><I.Waypoints size={14} /><span><small>{V.services}</small>{services.length}</span></a>
              <I.ChevronRight size={14} className="faint" />
              <a href="#inc-svcs" className={`dep-node${premium.length ? ' is-hot' : ''}`}><I.Users size={14} /><span><small>{V.customers}</small>{customers.length}{premium.length ? ` · ${premium.length} ${V.premium.toLowerCase()}` : ''}</span></a>
            </div>
            <p className="impact-sum">{inc.impact.summary}</p>
            <div className="grid g-4 impact-stats">
              <div><span>{V.services}</span><b className="num">{services.length}</b></div>
              <div><span>{V.customers}</span><b className="num">{customers.length}</b></div>
              <div><span>Premium exposed</span><b className={`num ${premium.length ? 'bad' : ''}`}>{premium.length}</b></div>
              <div><span>Scope</span><b className="num">{inc.affected.length} affected</b></div>
            </div>
            {services.length > 0 && (
              <div id="inc-svcs" className="dt-scroll" style={{ marginTop: 12 }}>
                <table className="nst-table dt-table inc-svc-table">
                  <thead><tr><th>Service</th><th>Customer</th><th className="is-right">Size</th><th>Status</th><th className="is-right">Uptime 30 d</th></tr></thead>
                  <tbody>{(allSvc ? svcSorted : svcSorted.slice(0, 8)).map(s => (
                    <tr key={s.id} className="is-click" onClick={() => nav(`/services/${s.id}`)}>
                      <td><span className="cell-2"><SvcLink id={s.id} /><small>{s.type}</small></span></td>
                      <td><span className="cell-2"><CustLink id={s.customerId}>{s.customer.name}</CustLink><small>{s.customer.premium ? <span className="premium-tag">Premium</span> : s.customer.segment}</small></span></td>
                      <td className="is-right num">{fmtQty(s.qty, s.unit)}</td><td><ServiceChip s={s.status} size="xs" /></td>
                      <td className="is-right"><span className="cell-2" style={{ alignItems: 'flex-end' }}><span className={`num ${s.uptime30d < s.slaTarget ? 'bad' : ''}`}>{s.uptime30d}%</span><small className="num">target {s.slaTarget}%</small></span></td>
                    </tr>))}</tbody>
                </table>
                {services.length > 8 && <button type="button" className="panel-link" style={{ margin: '10px 4px 0' }} onClick={() => setAllSvc(v => !v)}>{allSvc ? 'Show top 8' : `Show all ${services.length} services`}<I.ChevronDown size={14} style={{ transform: allSvc ? 'rotate(180deg)' : undefined }} /></button>}
              </div>
            )}
          </Panel>

          <Panel title="Worklog" count={inc.worklog.length}>
            <form className="wl-add" onSubmit={e => { e.preventDefault(); addWorklog(inc.id, note); setNote(''); }}>
              <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Add a worklog note…" />
              <Btn type="submit" variant="filled" disabled={!note.trim()}>Add</Btn>
            </form>
            <ol className="wl">{[...inc.worklog].reverse().map((w, k) => (
              <li key={k} className={`wl-${w.kind}`}>
                <span className="wl-ico">{w.kind === 'ai' ? <OpstralBadge size={11} /> : w.kind === 'system' ? <I.Cpu size={12} /> : <I.User size={12} />}</span>
                <div><div className="row between"><b>{w.who}</b><span className="faint num">{fmtDateTime(w.at)}</span></div><p>{w.text}</p></div>
              </li>))}</ol>
          </Panel>
        </div>

        <div className="col" style={{ gap: 16 }}>
          <div className="ai-card">
            <div className="ai-card-head"><b>AI diagnostics · root-cause hypotheses</b><span>Ranked by evidence; confirm or reject to train future recommendations</span></div>
            <div className="ai-card-body">
              {inc.rca.map((h, k) => (
                <div key={k} className={`ai-block hyp${h.rejected ? ' is-rejected' : ''}`}>
                  <h5><span>{k === 0 ? 'Most likely cause' : `Alternative ${k}`}</span><span className={`num ${k === 0 ? 'bad' : 'muted'}`}>{h.confidence}%</span></h5>
                  <div>{h.cause}</div>
                  <div className="bar" style={{ height: 5 }}><i style={{ width: `${h.confidence}%`, background: k === 0 ? 'var(--vw-color-red-400)' : 'var(--vw-color-slate-400)' }} /></div>
                  {h.evidence.length > 0 && <ul className="evidence">{h.evidence.map((e, j) => { const to = refTo(e.ref, alertNe); return (
                    <li key={j}><I.FileSearch size={12} /><span>{to ? <Link to={to}>{e.label}</Link> : e.label}{e.at && <span className="faint num nowrap"> · {fmtDateTime(e.at)}</span>}</span></li>); })}</ul>}
                  {open && <div className="row" style={{ gap: 6 }}>
                    {h.rejected ? <Chip tone="neutral" size="xs">Rejected by operator</Chip> : inc.feedback === 'confirmed' && k === 0 ? <Chip tone="success" size="xs">Confirmed</Chip> : null}
                    <span className="grow" />
                    <Btn size="xs" icon={I.ThumbsUp} onClick={() => hypothesisFeedback(inc.id, k, true)}>Confirm</Btn>
                    <Btn size="xs" icon={I.ThumbsDown} onClick={() => hypothesisFeedback(inc.id, k, false)}>Reject</Btn>
                  </div>}
                </div>
              ))}
            </div>
          </div>

          <Panel title="Action plan" sub="Priority order · disruptive steps need approval (DC-AI-007)" count={inc.actions.length}>
            {inc.actions.length ? <ol className="steps">{inc.actions.map((s, k) => <StepRow key={s.id} n={k + 1} s={s} incId={inc.id} open={open} />)}</ol> : <div className="faint" style={{ fontSize: 13 }}>No actions recorded.</div>}
          </Panel>

          <Panel title="Change awareness" sub="Changes and maintenance near detection (DC-OPS-005)" count={changes.length}>
            {changes.length ? <div className="col" style={{ gap: 8 }}>{changes.map(c => {
              const rel = c.windowEnd <= inc.detected ? `ended ${fmtHm((inc.detected - c.windowEnd) / 60000)} before detection` : c.windowStart <= now ? 'window open now' : `starts in ${fmtHm((c.windowStart - now) / 60000)}`;
              const touches = c.scope.some(s => inc.affected.some(a => a.id === s));
              return (
                <Link key={c.id} to={`/changes?id=${c.id}`} className={`chg-row${touches ? ' is-hot' : ''}`}>
                  <span style={{ flex: 1, minWidth: 0 }}><b className="mono">{c.id}</b> <span>{c.title}</span><small>{c.kind} · {rel}{touches ? ' · touched the affected device' : ''}</small></span>
                  <ChangeChip s={c.status} size="xs" />
                </Link>);
            })}</div> : <div className="faint" style={{ fontSize: 13 }}>No change or maintenance in the 72 hours before detection.</div>}
          </Panel>

          {inc.similar && (
            <Panel title="Similar events" sub="Estate correlation" actions={<Chip tone="info" size="xs">{similar.length} nodes</Chip>}>
              <p className="impact-sum" style={{ marginTop: 0 }}>{inc.similar.text}</p>
              <div className="row wrap" style={{ gap: 6 }}>{similar.map(n => <Link key={n.id} to={`/ne/${encodeURIComponent(n.id)}?tab=alerts`} className="vw-chip vw-chip--neutral chip-xs aff-chip">{n.id}</Link>)}</div>
            </Panel>
          )}

          <Panel title="Closure verification" sub="Post-action evidence required before resolve (DC-OPS-008)"
            actions={open && <Btn size="xs" icon={I.ListChecks} onClick={() => runClosureChecks(inc.id)}>Run closure checks</Btn>}>
            <ul className="checks">{inc.verification.map((v, k) => (
              <li key={k} className={v.ok === true ? 'ok' : v.ok === false ? 'fail' : ''}>
                {v.ok === true ? <I.CircleCheck size={15} /> : v.ok === false ? <I.CircleX size={15} /> : <I.Circle size={15} />}{v.check}
                <span className="faint">{v.ok === null ? 'not run' : v.ok ? 'passed' : 'failed'}</span>
              </li>))}</ul>
          </Panel>
        </div>
      </div>
      {toast.node}
    </div>
  );
}

/* what this incident is costing: the hourly loss, the total so far, the next credit step and the cost of delay */
function RevenuePanel({ rev: r, now, onAsk }: { rev: RevIssue; now: number; onAsk: () => void }) {
  const V = vocabNow(), W = V.money;
  const losing = r.rate + r.lost + r.credits > 0;
  const avoid = Math.max(0, r.forecast24 - r.lost - r.credits);
  return (
    <Panel title={W.impact} icon={I.IndianRupee} sub={losing ? `What this incident has cost and what another day costs · ranked #${r.rank} of the open issues` : `Nothing is lost yet · ${r.exposed} ${V.services.toLowerCase()} are still running on this fault`}
      actions={<><DomainTag d={r.domain} />{r.underPrioritised && <Chip tone="warning" size="xs">Review priority</Chip>}</>}>
      <div className="rev-inc">
        <div className="rev-figs">
          {losing ? <>
            <Fig label="Losing now" value={perHr(r.rate)} sub={stateText({ ...r, exposed: 0 })} tone="bad" />
            <Fig label="Impact so far" value={inr(r.lost + r.credits)} sub={`${inr(r.credits)} ${lc(W.credits)}`} />
            <Fig label="Next credit step" value={r.nextCliff ? inr(r.nextCliff.amount) : '—'} sub={r.nextCliff ? `in ${fmtDur(r.nextCliff.inMin)}` : 'none pending'} tone={r.nextCliff && r.nextCliff.inMin <= 60 ? 'warn' : undefined} />
            <Fig label="By +24 h" value={inr(r.forecast24)} sub={`restore now, avoid ${inr(avoid)}`} />
          </> : <>
            <Fig label="At stake" value={perMo(r.mrrExposed)} sub={`${r.customers} ${V.customers.toLowerCase()}`} tone="warn" />
            <Fig label="If it fails" value={perHr(r.potentialRate)} sub="for every hour down" />
            <Fig label="Credits after 4 h" value={inr(r.potentialCredits)} sub="if the outage lasts that long" />
            <Fig label="Lost so far" value="₹0" sub="nothing is down yet" />
          </>}
        </div>
        <CostCurve curve={r.curve} now={now} height={150} />
      </div>
      <div className="rev-inc-foot">
        <span className="vw-label">{r.top.slice(0, 3).map(c => `${c.name} ${inr(losing ? c.lost + c.credits : c.mrr)}${losing ? '' : '/mo'}`).join(' · ')}{r.customers > 3 ? ` · +${r.customers - 3} more` : ''}</span>
        <span className="row" style={{ gap: 8 }}>
          <Link to={`/revenue?rdc=${r.dcId}`} className="nst-btn nst-btn--sm nst-btn--ghost">{W.impact}<I.ArrowRight size={14} /></Link>
          <OpstralBtn onClick={onAsk} />
        </span>
      </div>
    </Panel>
  );
}

function StepRow({ n, s, incId, open }: { n: number; s: ActionStep; incId: string; open: boolean }) {
  const go = (to: ActionStep['status']) => setActionStatus(incId, s.id, to);
  const STATUS: Record<ActionStep['status'], { label: string; tone: 'neutral' | 'warning' | 'info' | 'purple' | 'success' | 'error' }> = {
    pending: { label: 'Pending', tone: 'neutral' }, 'awaiting-approval': { label: 'Awaiting approval', tone: 'warning' }, approved: { label: 'Approved', tone: 'info' },
    running: { label: 'Running', tone: 'purple' }, done: { label: 'Done', tone: 'success' }, rejected: { label: 'Rejected', tone: 'error' }
  };
  return (
    <li className={`step st-${s.status}`}>
      <span className="step-n num">{s.status === 'done' ? <I.Check size={13} /> : n}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row between" style={{ alignItems: 'flex-start' }}><b>{s.step}</b><Chip size="xs" tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Chip></div>
        <dl className="step-kv">
          <div><dt>Owner</dt><dd>{s.owner}</dd></div><div><dt>Expected</dt><dd>{s.expected}</dd></div>
          <div><dt>Rollback</dt><dd>{s.rollback}</dd></div><div><dt>Verify</dt><dd>{s.verify}</dd></div>
        </dl>
        {open && s.status !== 'done' && s.status !== 'rejected' && (
          <div className="row wrap" style={{ gap: 6 }}>
            {s.disruptive && <Chip size="xs" tone="orange"><I.ShieldAlert size={11} />Disruptive</Chip>}
            <span className="grow" />
            {s.status === 'pending' && s.disruptive && <Btn size="xs" variant="filled" onClick={() => go('awaiting-approval')}>Request approval</Btn>}
            {s.status === 'pending' && !s.disruptive && <Btn size="xs" variant="filled" icon={I.Play} onClick={() => go('running')}>Run</Btn>}
            {s.status === 'awaiting-approval' && <Btn size="xs" variant="filled" icon={I.ShieldCheck} onClick={() => go('approved')}>Approve</Btn>}
            {s.status === 'approved' && <Btn size="xs" variant="filled" icon={I.Play} onClick={() => go('running')}>Run</Btn>}
            {s.status === 'running' && <Btn size="xs" variant="filled" icon={I.Check} onClick={() => go('done')}>Mark done</Btn>}
            {s.status !== 'running' && <Btn size="xs" onClick={() => go('rejected')}>Reject</Btn>}
          </div>
        )}
      </div>
    </li>
  );
}
