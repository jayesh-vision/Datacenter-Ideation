/* Programme page (/delivery/programmes/:id, 14-Oct-2026): the projects that deliver one outcome. Roadmap (projects on one time line,
   each gated on the ones it waits on), start gates, budget by project, top risks, materials, change orders, history; hold / reactivate /
   close; add a project. Derived from mock/delivery.ts deliveryProgrammes. */
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, getProgramme, setProgrammeStatus, useQuery } from '../../api';
import type { DeliveryProject, ProgrammeView } from '../../api/types';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Chip, Panel, Tabs } from '../../ui/kit';
import { DataTable } from '../../ui/DataTable';
import { Meter, SevDot } from '../../ui/status';
import { PlanVsToday } from './dash';
import { fmtDate, fmtDateTime, fmtMoney } from '../../lib/format';
import { useToast } from '../ops/shared';
import { NotFound } from '../NotFound';
import { HEALTH_TONE, STATE_TONE } from './Delivery';
import { CostCurve, Gantt, NewProjectWizard, PROG_ICON, RAG_LABEL, RAG_TONE } from './parts';
import '../../styles/dcim.css';
import '../../styles/planner.css';
import '../../styles/ipam.css';
import '../../styles/delivery.css';

type Tab = 'overview' | 'projects' | 'risks' | 'materials' | 'changes' | 'history';

export function ProgrammePage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'overview';
  const setTab = (t: Tab) => { const n = new URLSearchParams(sp); t === 'overview' ? n.delete('tab') : n.set('tab', t); setSp(n, { replace: true }); };
  const { data: g, loading } = useQuery(() => getProgramme(id), [id]);
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  usePage([{ label: 'Plan & Build' }, { label: 'Delivery', to: '/delivery' }, { label: 'Programmes', to: '/delivery?tab=programmes' }, { label: id }]);
  if (loading && !g) return <Loading />;
  if (!g) return <NotFound what="Programme" />;
  const P = g.programme, Ic = PROG_ICON[P.type];
  const pname = new Map(g.projects.map(p => [p.id, p.name]));
  const status = (to: 'Active' | 'On hold' | 'Closed') => setProgrammeStatus(P.id, to).then(() => toast.show(`Programme ${to === 'Active' ? 'reactivated' : to === 'On hold' ? 'put on hold' : 'closed'}`)).catch(e => toast.show('Not changed', String(e.message ?? e)));
  return (
    <div className="page dcim planner">
      <PageHead title={P.name} icon={<span className="pl-icon"><Ic size={18} /></span>}
        chips={<><Chip tone={RAG_TONE[g.rag]} dot>{RAG_LABEL[g.rag]}</Chip><Chip tone={P.status === 'Active' ? 'info' : P.status === 'On hold' ? 'warning' : 'neutral'}>{P.status}</Chip><Chip tone="neutral">{P.type}</Chip>{P.blueprint && <Chip tone="purple">{P.blueprint}</Chip>}</>}
        sub={<><span className="mono">{P.id}</span> · sponsor {P.sponsor} · manager {P.manager}{P.description ? ` · ${P.description}` : ''}</>}
        actions={<>
          {P.status === 'Active' && <Btn icon={I.Pause} onClick={() => status('On hold')}>Put on hold</Btn>}
          {P.status === 'On hold' && <Btn icon={I.Play} onClick={() => status('Active')}>Reactivate</Btn>}
          {P.status !== 'Closed' && <Btn icon={I.Archive} onClick={() => status('Closed')}>Close</Btn>}
          {P.status === 'Active' && <Btn variant="filled" icon={I.Plus} onClick={() => setAdding(true)}>Add project</Btn>}
        </>} />
      {P.status === 'On hold' && <p className="note note--warning"><I.Pause size={15} /><span>On hold: no new work orders should start until the programme is reactivated.</span></p>}
      <ProgrammeHero g={g} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'projects', label: 'Projects', count: g.projects.length }, { id: 'risks', label: 'Risks', count: g.risks.length }, { id: 'materials', label: 'Materials' }, { id: 'changes', label: 'Change orders', count: g.changeOrders.length }, { id: 'history', label: 'History' }]} />

      {tab === 'overview' && <div className="dl-dash">
        <Panel className="dl-span-8" title="Phase roadmap" icon={I.GanttChart} info="The projects in their order; hatched = waiting on a gate (a project it depends on is not delivered), amber = long-lead, red = late. Click one to open it.">
          <Gantt rows={g.projects.map((p, k) => ({ id: p.id, label: `${k + 1}. ${p.name.replace(/^[A-Z]{2}-DC-\d{3} · /, '')}`, sub: p.waitsOn?.length ? `Gate: waits on ${p.waitsOn.map(w => `${g.projects.findIndex(x => x.id === w) + 1}`).join(' and ')}` : `${p.state} · ${p.template ?? 'from the planner'}`, start: p.start, end: p.finish,
            tone: p.state === 'Delivered' ? 'done' : p.waitsOn?.length ? 'wait' : p.health === 'late' ? 'late' : p.state === 'Mobilising' ? 'next' : 'active', onClick: () => nav(`/delivery/projects/${p.id}`), note: `${Math.round(p.progress * 100)}%` }))} />
        </Panel>
        <Panel className="dl-span-4" title="Start gates" icon={I.DoorOpen} info="What each phase needs before its work starts: the phases it waits on delivered, permits granted, design issued for construction.">
          <ul className="dl-gates">{g.gates.map((x, k) => { const p = g.projects.find(q => q.id === x.projectId)!; return (
            <li key={x.projectId} className={x.ready ? 'is-open' : 'is-closed'}><button type="button" onClick={() => nav(`/delivery/projects/${x.projectId}`)}>
              <span className="dl-gate-n">{k + 1}</span>
              <span className="dl-gate-m"><b>{p.name.replace(/^[A-Z]{2}-DC-\d{3} · /, '')}</b><small>{x.waitsOn.length ? `waits on ${x.waitsOn.map(w => pname.get(w)?.replace(/^[A-Z]{2}-DC-\d{3} · /, '') ?? w).join(', ')}` : p.state === 'Delivered' ? 'delivered' : 'gate open'}</small>
                <span className="dl-gate-chips"><Chip tone={x.permits === 'granted' ? 'success' : x.permits === 'pending' ? 'warning' : 'neutral'} size="xs">Permits {x.permits === 'none' ? 'n/a' : x.permits}</Chip><Chip tone={x.design === 'issued' ? 'success' : 'info'} size="xs">Design {x.design}</Chip></span></span>
              {x.ready ? <I.DoorOpen size={16} className="dl-gate-ic" /> : <I.DoorClosed size={16} className="dl-gate-ic" />}
            </button></li>); })}</ul>
        </Panel>
        <Panel className="dl-span-6" title="Plan against today" icon={I.Scale} info="Per project: the baseline schedule, today's forecast and the work done so far, on one time line.">
          <PlanVsToday projects={g.projects} />
        </Panel>
        <Panel className="dl-span-6" title="Budget by project" icon={I.Wallet} sub={`${fmtMoney(g.actual)} spent of ${fmtMoney(g.budget)}`} info="Approved budget per project (baseline + approved change orders); the darker part is spent.">
          <ul className="dl-bud2">{g.projects.map(p => { const sp = p.budgetApproved ? Math.min(1, p.actual / p.budgetApproved) : 0; return (
            <li key={p.id}><span className="dl-bud2-l"><Link className="ent-link" to={`/delivery/projects/${p.id}`}>{p.name.replace(/^[A-Z]{2}-DC-\d{3} · /, '')}</Link><small>{fmtMoney(p.budgetApproved)} · CPI {p.cpi}</small></span>
              <span className="dl-bud2-bar" style={{ width: `${g.budget ? Math.max(4, (p.budgetApproved / Math.max(...g.projects.map(q => q.budgetApproved))) * 100) : 0}%` }}><i style={{ width: `${sp * 100}%` }} className={p.cpi < 0.95 ? 'is-over' : ''} /></span></li>); })}</ul>
        </Panel>
        <Panel className="dl-span-8" title="Cost performance" icon={I.TrendingUp} info="Planned value against earned value and actual cost for the programme, with the budget at completion and the forecast at completion (budget ÷ CPI).">
          <CostCurve pts={g.costCurve} height={230} bac={g.budget} eac={g.actual && g.earned ? g.budget / (g.earned / g.actual) : g.budget} />
        </Panel>
        <Panel className="dl-span-4 dl-h-fill" title="Top risks" icon={I.ShieldAlert} count={g.risks.length} actions={<button type="button" className="ent-link" onClick={() => setTab('risks')}>All →</button>}>
          <RiskList risks={g.risks.slice(0, 6)} pname={pname} />
        </Panel>
        <Panel className="dl-span-6" title="Materials" icon={I.Package} info="Purchase orders per project: delivered, in transit, still on order and late.">
          <ul className="dl-mat">{g.materials.map(m => { const t = Math.max(1, m.delivered + m.inTransit + m.open - m.inTransit); const open = m.open - m.inTransit - m.late; return (
            <li key={m.projectId}><span className="dl-bud2-l"><span>{pname.get(m.projectId)?.replace(/^[A-Z]{2}-DC-\d{3} · /, '')}</span><small>{m.delivered + m.open} orders · {fmtMoney(m.value)}</small></span>
              {m.delivered + m.open ? <span className="dl-mat-bar"><i className="is-d" style={{ flex: m.delivered }} /><i className="is-t" style={{ flex: m.inTransit }} /><i className="is-o" style={{ flex: Math.max(0, open) }} /><i className="is-l" style={{ flex: m.late }} /></span> : <span className="vw-label">no orders</span>}
              <em>{t ? `${m.delivered}/${m.delivered + m.open}` : ''}</em></li>); })}</ul>
          <div className="dl-c-legend"><span><i className="dl-sw is-md" />Delivered</span><span><i className="dl-sw is-mt" />In transit</span><span><i className="dl-sw is-mo" />On order</span><span><i className="dl-sw is-f" />Late</span></div>
        </Panel>
        <Panel className="dl-span-6" title="Change orders" icon={I.FileDiff} count={g.changeOrders.length} actions={g.changeOrders.length ? <button type="button" className="ent-link" onClick={() => setTab('changes')}>All →</button> : undefined}>
          {g.changeOrders.length ? <ul className="ipam-find">{g.changeOrders.slice(0, 5).map(c => <li key={c.id}><button type="button" onClick={() => nav(`/delivery/projects/${c.projectId}?tab=cost`)}><SevDot s={c.state === 'Submitted' ? 'minor' : c.state === 'Rejected' ? 'warning' : 'warning'} /><span className="cell-2"><b>{c.title}</b><small>{c.id} · {c.budgetDelta >= 0 ? '+' : ''}{fmtMoney(c.budgetDelta)} · {c.scheduleDays >= 0 ? '+' : ''}{c.scheduleDays} days · {c.state}</small></span></button></li>)}</ul> : <p className="vw-label">No change orders on this programme.</p>}
        </Panel>
      </div>}
      {tab === 'projects' && <section className="vw-card-section dcim-table"><DataTable rows={g.projects} pageSize={20} onRow={(p: DeliveryProject) => nav(`/delivery/projects/${p.id}`)} cols={[
        { key: 'n', header: 'Project', wrap: true, render: p => <span className="cell-2"><b>{p.name}</b><small><span className="mono">{p.id}</span>{p.template ? ` · ${p.template}` : ' · from the planner'}</small></span> },
        { key: 'st', header: 'Stage', render: p => <span className="cell-2"><Chip tone={STATE_TONE[p.state]} dot>{p.state}</Chip>{p.waitsOn?.length ? <small>waits on {p.waitsOn.join(', ')}</small> : null}</span> },
        { key: 'h', header: 'Health', render: p => <Chip tone={HEALTH_TONE[p.health]} dot>{p.health}</Chip> },
        { key: 'pr', header: 'Progress', sort: p => p.progress, render: p => <Meter pct={p.progress * 100} width={60} color="var(--primaryColor500)" label={`${Math.round(p.progress * 100)}%`} /> },
        { key: 'b', header: 'Budget', sort: p => p.budgetApproved, render: p => <span className="cell-2"><span className="rev-amt">{fmtMoney(p.budgetApproved)}</span><small>{fmtMoney(p.actual)} spent</small></span> },
        { key: 'f', header: 'Finish', sort: p => p.finish, render: p => <span className="cell-2"><span className="nowrap">{fmtDate(p.finish)}</span><small>{p.openWorkOrders} work orders open</small></span> }]} /></section>}
      {tab === 'risks' && <Panel title="Risks across the projects" icon={I.ShieldAlert} count={g.risks.length} info="Open risks of every project, highest score first. Manage them on each project's Risks tab."><RiskList risks={g.risks} pname={pname} /></Panel>}
      {tab === 'materials' && <section className="vw-card-section dcim-table"><DataTable rows={g.materials.map(m => ({ ...m, id: m.projectId }))} pageSize={20} onRow={m => nav(`/delivery/projects/${m.projectId}?tab=procurement`)} cols={[
        { key: 'p', header: 'Project', wrap: true, render: m => pname.get(m.projectId) },
        { key: 'v', header: 'Ordered value', sort: m => m.value, render: m => <span className="rev-amt">{fmtMoney(m.value)}</span> },
        { key: 'd', header: 'Delivered', sort: m => m.delivered, render: m => m.delivered },
        { key: 't', header: 'In transit', render: m => m.inTransit },
        { key: 'o', header: 'Open', render: m => m.open },
        { key: 'l', header: 'Late', sort: m => m.late, render: m => (m.late ? <Chip tone="error" size="xs">{m.late} late</Chip> : <span className="vw-label">0</span>) }]}
        empty={<p className="vw-label" style={{ padding: 16 }}>No purchase orders yet.</p>} /></section>}
      {tab === 'changes' && <section className="vw-card-section dcim-table"><DataTable rows={g.changeOrders} pageSize={20} onRow={c => nav(`/delivery/projects/${c.projectId}?tab=cost`)} cols={[
        { key: 'id', header: 'Change order', wrap: true, render: c => <span className="cell-2"><b>{c.title}</b><small><span className="mono">{c.id}</span> · {pname.get(c.projectId)}</small></span> },
        { key: 'b', header: 'Budget', sort: c => c.budgetDelta, render: c => <span className="rev-amt">{c.budgetDelta >= 0 ? '+' : ''}{fmtMoney(c.budgetDelta)}</span> },
        { key: 'd', header: 'Schedule', render: c => `${c.scheduleDays >= 0 ? '+' : ''}${c.scheduleDays} days` },
        { key: 'a', header: 'Decided by', render: c => <span className="cell-2"><span>{c.approver}</span><small>{c.decidedBy ? `${c.decidedBy} · ${fmtDate(c.decidedAt!)}` : 'waiting'}</small></span> },
        { key: 's', header: 'State', render: c => <Chip tone={c.state === 'Approved' ? 'success' : c.state === 'Rejected' ? 'error' : 'warning'} dot>{c.state}</Chip> }]}
        empty={<p className="vw-label" style={{ padding: 16 }}>No change orders on this programme.</p>} /></section>}
      {tab === 'history' && <Panel title="History" icon={I.History}><ul className="pl-hist">{g.history.map((h, i) => <li key={i}><small>{fmtDateTime(h.at)}</small><span><b>{h.who}</b> — {h.text}</span></li>)}</ul></Panel>}
      <NewProjectWizard open={adding} onClose={() => setAdding(false)} programmeId={P.id} />
      {toast.node}
    </div>
  );
}

export function RiskList({ risks, pname, actions }: { risks: { id: string; projectId: string; title: string; category: string; likelihood: number; impact: number; mitigation: string; owner: string; state: string; derived: boolean }[]; pname?: Map<string, string>; actions?: (id: string, state: string) => React.ReactNode }) {
  if (!risks.length) return <p className="vw-label">No open risks.</p>;
  return (
    <ul className="dl-risks">{risks.map(r => { const s = r.likelihood * r.impact; return (
      <li key={r.id} className={r.state === 'Closed' ? 'is-closed' : ''}>
        <span className={`dl-risk-score ${s >= 16 ? 'is-high' : s >= 9 ? 'is-mid' : 'is-low'}`} title={`Likelihood ${r.likelihood} × impact ${r.impact}`}>{s}</span>
        <span className="dl-risk-main"><b>{r.title}</b><small>{r.category}{pname ? ` · ${pname.get(r.projectId) ?? r.projectId}` : ''} · owner {r.owner}{r.derived ? ' · flagged by the delivery data' : ''}</small><small className="dl-risk-mit"><I.ShieldCheck size={12} />{r.mitigation || 'No mitigation recorded'}</small></span>
        <span className="dl-risk-side"><Chip tone={r.state === 'Open' ? 'warning' : r.state === 'Mitigating' ? 'info' : 'neutral'} size="xs">{r.state}</Chip>{actions?.(r.id, r.state)}</span>
      </li>); })}</ul>
  );
}

function ProgrammeHero({ g }: { g: ProgrammeView }) {
  const now = clockNow();
  const done = g.completion, elapsed = Math.max(0, Math.min(1, (now - g.start) / Math.max(1, g.forecastFinish - g.start)));
  const slip = Math.round((g.forecastFinish - g.baselineFinish) / 864e5);
  const r = 34, c = 2 * Math.PI * r;
  return (
    <section className="dl-hero">
      <div className="dl-hero-ring"><svg width={84} height={84}><circle cx={42} cy={42} r={r} className="dl-ring-bg" /><circle cx={42} cy={42} r={r} className={`dl-ring-fg is-${g.rag}`} strokeDasharray={`${c * done} ${c}`} transform="rotate(-90 42 42)" /></svg>
        <span><b>{Math.round(done * 100)}%</b><small>done</small></span></div>
      <div className="dl-hero-f"><small>Projects</small><b>{g.projects.filter(p => p.state === 'Delivered').length} of {g.projects.length}</b><em>delivered · {g.gates.filter(x => x.waitsOn.length).length} at a gate</em></div>
      <div className="dl-hero-f dl-hero-wt"><small>Work against time</small>
        <span className="dl-pp-track"><i className="dl-pp-done" style={{ width: `${done * 100}%` }} /><b className="dl-pp-time" style={{ left: `${elapsed * 100}%` }} /></span>
        <em className={done + 0.05 < elapsed ? 'is-bad' : ''}>{Math.round(elapsed * 100)}% of the time used{done + 0.05 < elapsed ? ' · behind' : ' · in step'}</em></div>
      <div className="dl-hero-f"><small>Budget</small><b>{fmtMoney(g.budget)}</b><em>{fmtMoney(g.actual)} spent · {fmtMoney(g.earned)} earned</em></div>
      <div className="dl-hero-f"><small>Forecast finish</small><b>{fmtDate(g.forecastFinish)}</b><em className={slip > 0 ? 'is-bad' : ''}>{slip > 0 ? `${slip} days after the baseline` : 'on the baseline'}</em></div>
      <div className="dl-hero-f"><small>Open</small><b>{g.openWorkOrders} work orders</b><em>{g.risks.length} risks · {g.changeOrders.filter(x => x.state === 'Submitted').length} change orders waiting</em></div>
    </section>
  );
}
