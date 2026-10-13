/* Change page (/changes/:id): class, risk and window, the dependency impact of the scope, the approval matrix (decide the current
   step), policy checks, conflicts and freeze, the post-implementation review and the change's audit history. Operations changes move
   through their transitions here; a delivery change request follows its work order in Delivery. */
import { Link, useParams, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { decideChange, getChangeRecord, getChanges, useQuery } from '../../api';
import type { Change } from '../../api/types';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Chip, KV, Panel, Tabs } from '../../ui/kit';
import { ChangeChip, DcLink, IncLink, SevDot } from '../../ui/status';
import { SummaryStrip } from '../site/SummaryStrip';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { fmtHm, useToast } from '../ops/shared';
import { NotFound } from '../NotFound';
import { ChangeBody, Transitions } from './parts';
import { CLASS_TONE } from './Changes';
import '../../styles/dcim.css';
import '../../styles/planner.css';
import '../../styles/ipam.css';

type Tab = 'overview' | 'approvals' | 'checks' | 'review' | 'history';

export function ChangePage() {
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'overview';
  const setTab = (t: Tab) => { const n = new URLSearchParams(sp); t === 'overview' ? n.delete('tab') : n.set('tab', t); setSp(n, { replace: true }); };
  const { data, loading } = useQuery(() => getChangeRecord(id), [id]);
  const { data: raw } = useQuery(() => getChanges({}), [id]);
  const toast = useToast();
  usePage([{ label: 'Operate' }, { label: 'Change management', to: '/changes' }, { label: id }], data ? { dcId: data.change.dcId } : {});
  if (loading && !data) return <Loading />;
  if (!data) return <NotFound what="Change" />;
  const c = data.change;
  const op = raw?.find(x => x.id === c.id) as Change | undefined;
  const step = c.approvals.find(a => a.decision === 'Pending');
  const blocking = c.violations.filter(v => v.enforcement === 'Block');
  const decide = (ok: boolean) => decideChange(c.id, ok).then(() => toast.show(ok ? `${step?.role} approved` : 'Rejected')).catch(e => toast.show('Not done', String(e.message ?? e)));
  return (
    <div className="page dcim planner">
      <PageHead title={<span className="mono">{c.id}</span>} chips={<><Chip tone={CLASS_TONE[c.cls]}>{c.cls}</Chip><ChangeChip s={c.status} />{c.outcome && <Chip tone={c.outcome === 'Successful' ? 'success' : 'error'} dot>{c.outcome}</Chip>}</>}
        sub={<>{c.title} · <DcLink id={c.dcId} /> · {c.source}{c.projectId ? <> · project <Link className="ent-link mono" to={`/delivery/projects/${c.projectId}?tab=workorders`}>{c.projectId}</Link></> : null}{c.incidentId ? <> · incident <IncLink id={c.incidentId} /></> : null}</>}
        actions={c.source === 'Delivery'
          ? <Link className="nst-btn nst-btn--sm" to={`/delivery/projects/${c.projectId}?tab=workorders`}>Open work order {c.woId}</Link>
          : c.status === 'Pending approval' && step ? <><Btn icon={I.X} onClick={() => decide(false)}>Reject</Btn><Btn variant="filled" icon={I.ShieldCheck} disabled={!!blocking.length} title={blocking.length ? blocking.map(v => v.text).join('; ') : undefined} onClick={() => decide(true)}>Approve as {step.role}</Btn></>
          : op ? <Transitions c={op} /> : null} />
      {blocking.length > 0 && <p className="pl-verdict is-blocked"><I.OctagonX size={16} />Blocked by policy: {blocking.map(v => v.text).join(' · ')}</p>}
      <SummaryStrip items={[
        { key: 'w', label: 'Window', value: fmtDateTime(c.windowStart), sub: `${fmtHm((c.windowEnd - c.windowStart) / 60000)}`, info: 'When the work runs; a freeze or an overlapping window on the same devices is flagged.' },
        { key: 'r', label: 'Risk', value: c.risk, sub: c.source === 'Delivery' ? 'from the work type' : 'from the dependency impact', tone: c.risk === 'High' ? 'warn' : undefined, info: 'Operations changes: computed from what the scope carries (links, services, premium customers). Delivery: from the kind of work.' },
        { key: 'a', label: 'Approvals', value: c.cls === 'Standard' ? 'Pre-approved' : `${c.approvals.filter(a => a.decision === 'Approved').length} of ${c.approvals.length}`, sub: step ? `waiting for ${step.role}` : c.status === 'Rejected' ? 'rejected' : 'complete', onClick: () => setTab('approvals'), info: 'The approval matrix for the class and risk.' },
        { key: 'p', label: 'Policy checks', value: c.violations.length ? `${c.violations.length} finding${c.violations.length > 1 ? 's' : ''}` : 'Clear', sub: blocking.length ? 'blocking' : c.violations.length ? 'warnings' : 'all pass', tone: blocking.length ? 'bad' : c.violations.length ? 'warn' : undefined, onClick: () => setTab('checks'), info: 'Rollback plan, freezes, maintenance hours, single points of failure, overlaps, reviews.' },
        { key: 'v', label: 'Review', value: c.pir.state, sub: c.pir.due ? `due ${fmtDate(c.pir.due)}` : c.cls === 'Emergency' ? 'after implementation' : 'not required', tone: c.pir.state === 'Overdue' ? 'bad' : c.pir.state === 'Due' ? 'warn' : undefined, onClick: () => setTab('review'), info: 'Post-implementation review: every emergency change, and any change that rolled back or caused an incident.' }
      ]} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Scope & impact' }, { id: 'approvals', label: 'Approvals', count: c.approvals.length }, { id: 'checks', label: 'Policies & conflicts', count: c.violations.length || undefined }, { id: 'review', label: 'Review' }, { id: 'history', label: 'History', count: data.audit.length || undefined }]} />
      {tab === 'overview' && (op ? <Panel title="Scope and dependency impact" icon={I.Network}><ChangeBody c={op} /></Panel>
        : <Panel title="Scope" icon={I.Network}><KV cols={2} items={[['Source', c.source], ['Site', <DcLink id={c.dcId} />], ['Requester', c.requester], ['Window', `${fmtDateTime(c.windowStart)} → ${fmtDateTime(c.windowEnd)}`], ['Rollback plan', c.rollback],
            ['Racks', c.scope.length ? <span className="row wrap" style={{ gap: 6 }}>{c.scope.map(r => <Link key={r} className="ent-link mono" to={`/dcim/racks/${encodeURIComponent(r)}`}>{r.split('-').slice(-2).join('-')}</Link>)}</span> : '—'], ...(c.template ? [['Standard template', c.template] as [string, string]] : [])]} /></Panel>)}
      {tab === 'approvals' && <Panel title="Approval matrix" icon={I.ShieldCheck} info="Standard = pre-approved template · Normal = change manager, + site lead from Medium risk, + the change advisory board at High · Emergency = the emergency CAB, then a review.">
        <ol className="pl-steps">{c.approvals.map((a, i) => <li key={i} className={`is-${a.decision === 'Pre-approved' ? 'approved' : a.decision.toLowerCase()}`}><span className="pl-step-n">{i + 1}</span><span className="cell-2"><b>{a.role} · {a.who}</b><small>{a.decision}{a.at ? ` · ${fmtDateTime(a.at)}` : ''}</small></span></li>)}</ol>
      </Panel>}
      {tab === 'checks' && <div className="pl-ov">
        <Panel title="Policy checks" icon={I.ListChecks}>{c.violations.length ? <ul className="ipam-find">{c.violations.map((v, i) => <li key={i}><div className="pl-find"><SevDot s={v.enforcement === 'Block' ? 'critical' : 'minor'} /><span className="cell-2"><b>{v.text}</b><small>{v.policy} · {v.enforcement === 'Block' ? 'blocks approval' : 'warning'}</small></span></div></li>)}</ul> : <p className="vw-label">Every policy passes.</p>}</Panel>
        <Panel title="Freeze and overlaps" icon={I.CalendarX}>
          {data.freeze ? <p className="pl-find"><SevDot s="major" /><span className="cell-2"><b>{data.freeze.title}</b><small>{data.freeze.reason} Allows {data.freeze.allows.toLowerCase()}.</small></span></p> : <p className="vw-label">Not inside a freeze.</p>}
          {data.related.length ? data.related.map(o => <p key={o.id} className="pl-find"><SevDot s="minor" /><span className="cell-2"><Link className="ent-link mono" to={`/changes/${encodeURIComponent(o.id)}`}>{o.id}</Link><small>{o.title} · {fmtDateTime(o.windowStart)}</small></span></p>) : <p className="vw-label">No overlapping window on the same devices.</p>}
        </Panel>
      </div>}
      {tab === 'review' && <Panel title="Post-implementation review" icon={I.ClipboardCheck}>
        <KV cols={2} items={[['State', c.pir.state], ['Due', c.pir.due ? fmtDate(c.pir.due) : '—'], ['Outcome', c.outcome ?? 'not implemented yet'], ['Caused incident', c.causedIncident ? <IncLink id={c.causedIncident} /> : '—']]} />
        {c.causedIncident && <p className="pl-verdict is-warn" style={{ marginTop: 12 }}><I.TriangleAlert size={16} />The leading root-cause hypothesis of {c.causedIncident} cites this change: review what was done in the window before closing it.</p>}
      </Panel>}
      {tab === 'history' && <Panel title="History" icon={I.History}>{data.audit.length ? <ul className="pl-hist">{data.audit.map(a => <li key={a.id}><small>{fmtDateTime(a.at)}</small><span><b>{a.actor}</b> — {a.field}: {a.prev} → {a.next}</span></li>)}</ul> : <p className="vw-label">Created {fmtDateTime(c.created)} by {c.requester}; no changes since.</p>}</Panel>}
      {toast.node}
    </div>
  );
}
