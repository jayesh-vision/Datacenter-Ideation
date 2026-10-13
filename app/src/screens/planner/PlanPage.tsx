/* Plan page (/planner/:id): the verdict and every check against the site, the plant sized at its redundancy, space, CapEx / OpEx /
   ten-year cash flow, the schedule from lead times, scenarios to compare and adopt, the approval chain and the history. Actions follow
   the status: Draft → Submit (blocked plans cannot) → each approver → Execute (raises Capacity plans, creates racks in DCIM). */
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { choosePlanScenario, decidePlannerPlan, executePlannerPlan, getPlannerPlan, submitPlannerPlan, useQuery } from '../../api';
import type { PlanEval, PlannerPlan } from '../../api/types';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Chip, Info, KV, Modal, Field, Panel, Tabs } from '../../ui/kit';
import { DataTable } from '../../ui/DataTable';
import { SevDot, DcLink } from '../../ui/status';
import { SummaryStrip } from '../site/SummaryStrip';
import { fmtDate, fmtKw, fmtMoney, fmtNum } from '../../lib/format';
import { useToast } from '../ops/shared';
import { NotFound } from '../NotFound';
import { SCOPE_ICON, SCOPE_LABEL, STATUS_TONE, VERDICT } from './Planner';
import { EditPlanModal } from './PlanWizard';
import '../../styles/dcim.css';
import '../../styles/planner.css';
import '../../styles/ipam.css';

type Tab = 'overview' | 'sizing' | 'cost' | 'schedule' | 'scenarios' | 'approvals';

export function PlanPage() {
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'overview';
  const setTab = (t: Tab) => { const n = new URLSearchParams(sp); t === 'overview' ? n.delete('tab') : n.set('tab', t); setSp(n, { replace: true }); };
  const { data, loading } = useQuery(() => getPlannerPlan(id), [id]);
  const toast = useToast();
  const [decide, setDecide] = useState<null | boolean>(null);
  const [edit, setEdit] = useState(false);
  usePage([{ label: 'Plan & Build' }, { label: 'Planner', to: '/planner' }, { label: id }], data ? { dcId: data.plan.dcId } : {});
  if (loading && !data) return <Loading />;
  if (!data) return <NotFound what="Plan" />;
  const { plan: p, eval: e } = data;
  const Ic = SCOPE_ICON[p.scope];
  const step = p.approvals.find(a => a.decision === 'Pending');
  const run = (f: () => Promise<unknown>, ok: string, body?: string) => f().then(() => toast.show(ok, body)).catch(err => toast.show('Not done', String(err.message ?? err)));

  return (
    <div className="page dcim planner">
      <PageHead title={p.name} icon={<span className="pl-icon"><Ic size={18} /></span>}
        chips={<><Chip tone={STATUS_TONE[p.status]} dot>{p.status}</Chip><Chip tone={VERDICT[e.verdict.state].tone} dot>{VERDICT[e.verdict.state].label}</Chip></>}
        sub={<><span className="mono">{p.id}</span> · {SCOPE_LABEL[p.scope]} · {p.scope === 'new-site' ? `${p.city ?? ''} (${p.dcId})` : <DcLink id={p.dcId} />} · owner {p.owner} · {p.source}</>}
        actions={<>
          {p.status === 'Draft' && <Btn icon={I.Pencil} onClick={() => setEdit(true)}>Edit requirements</Btn>}
          {p.status === 'Draft' && <Btn variant="filled" icon={I.Send} disabled={e.verdict.state === 'blocked'} title={e.verdict.state === 'blocked' ? 'Resolve the blocking checks first' : undefined} onClick={() => run(() => submitPlannerPlan(p.id), 'Submitted for approval', `${p.approvals[0]?.who} (${p.approvals[0]?.role}) is next.`)}>Submit for approval</Btn>}
          {p.status === 'In review' && step && <><Btn icon={I.X} onClick={() => setDecide(false)}>Reject</Btn><Btn variant="filled" icon={I.Check} onClick={() => setDecide(true)}>Approve as {step.role}</Btn></>}
          {p.status === 'Approved' && <Btn variant="filled" icon={I.Rocket} onClick={() => run(() => executePlannerPlan(p.id), 'Execution started', 'Capacity plans raised; racks (if any) created in DCIM as empty cabinets.')}>Execute plan</Btn>}
        </>} />
      <p className={`pl-verdict is-${e.verdict.state}`}>{e.verdict.state === 'ready' ? <I.CircleCheck size={16} /> : e.verdict.state === 'warn' ? <I.TriangleAlert size={16} /> : <I.OctagonX size={16} />}{e.verdict.text}</p>
      <SummaryStrip items={[
        { key: 'it', label: 'IT load', value: p.scope === 'plant-upgrade' ? `+${fmtKw(p.plantKw ?? 0)}` : fmtKw(e.itKw), sub: p.scope === 'plant-upgrade' ? `${p.plant} capacity` : p.racks ? `${p.racks} racks × ${p.kwPerRack} kW` : 'extra draw', info: 'Design IT load the plan adds (racks × kW per rack), or the plant capacity it adds.' },
        { key: 'fac', label: 'Facility load', value: fmtKw(e.facilityKw), sub: `PUE ${e.pue}`, info: 'IT × design PUE (the site\'s PUE for air in an existing site; the benchmark for the cooling method otherwise).' },
        { key: 'c', label: 'CapEx', value: fmtMoney(e.capexTotal), sub: `${p.approvals.length} approval step${p.approvals.length === 1 ? '' : 's'}`, onClick: () => setTab('cost'), info: 'All CapEx lines incl. 10% contingency. The approval chain is set by this figure.' },
        { key: 'n', label: e.irr !== null ? 'NPV · IRR' : 'NPV (cost)', value: fmtMoney(e.npv), sub: e.irr !== null ? `IRR ${e.irr}%${e.payback !== null ? ` · payback year ${e.payback}` : ''}` : 'cost-only plan', tone: e.npv < 0 && e.irr !== null ? 'warn' : undefined, onClick: () => setTab('cost'), info: `Ten-year net present value at ${Math.round(e.discount * 100)}%. ${e.revenueBasis}.` },
        { key: 'f', label: 'Finish', value: fmtDate(e.finish), sub: e.lateDays ? `${Math.ceil(e.lateDays / 7)} weeks after target` : `target ${fmtDate(p.target)}`, tone: e.lateDays ? 'warn' : undefined, onClick: () => setTab('schedule'), info: 'End of the schedule built from the lead times; long-lead items are ordered at approval.' }
      ]} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Checks & findings', count: e.checks.filter(c => !c.ok).length || undefined }, { id: 'sizing', label: 'Sizing' }, { id: 'cost', label: 'Cost & return' }, { id: 'schedule', label: 'Schedule', count: e.tasks.length }, { id: 'scenarios', label: 'Scenarios', count: data.scenarios.length }, { id: 'approvals', label: 'Approvals & history' }]} />
      {tab === 'overview' && <Overview p={p} e={e} capacityPlans={data.capacityPlans} />}
      {tab === 'sizing' && <Sizing p={p} e={e} />}
      {tab === 'cost' && <Cost e={e} />}
      {tab === 'schedule' && <Schedule p={p} e={e} />}
      {tab === 'scenarios' && <section className="vw-card-section dcim-table">
        <div className="dcim-sub-bar"><span className="vw-label">The same plan with another cooling method, density or redundancy. {p.status === 'Draft' ? 'Adopt one to change the draft.' : 'Scenarios can be adopted while the plan is a draft.'}</span></div>
        <DataTable rows={data.scenarios} pageSize={10} cols={[
          { key: 'n', header: 'Scenario', render: s => <span className="cell-2"><b>{s.name}{s.id === 'base' && <Chip tone="info" size="xs">current</Chip>}</b><small>{s.note}</small></span> },
          { key: 'c', header: 'CapEx', sort: s => s.capex, render: s => <span className="rev-amt">{fmtMoney(s.capex)}</span> },
          { key: 'p', header: 'PUE', sort: s => s.pue, render: s => s.pue },
          { key: 'o', header: 'OpEx / year', sort: s => s.opex, render: s => fmtMoney(s.opex) },
          { key: 'v', header: 'NPV', sort: s => s.npv, render: s => <span style={{ color: s.npv < 0 ? 'var(--vw-color-red-600)' : undefined }}>{fmtMoney(s.npv)}</span> },
          { key: 'f', header: 'Finish', sort: s => s.finish, render: s => fmtDate(s.finish) },
          { key: 'b', header: 'Checks', render: s => s.blocked ? <Chip tone="error" dot>{s.blocked} blocking</Chip> : <Chip tone="success" dot>Feasible</Chip> },
          { key: 'a', header: '', render: s => s.id !== 'base' && p.status === 'Draft' ? <Btn size="sm" onClick={() => run(() => choosePlanScenario(p.id, s.id), `Adopted: ${s.name}`, 'The draft now uses this variant; checks and cost are recalculated.')}>Adopt</Btn> : null }]} />
      </section>}
      {tab === 'approvals' && <Approvals p={p} />}
      <DecideModal open={decide !== null} approve={!!decide} step={step?.role ?? ''} onClose={() => setDecide(null)} onDone={(c) => { const a = decide!; setDecide(null); run(() => decidePlannerPlan(p.id, a, c), a ? `Approved as ${step?.role}` : 'Rejected — back to draft'); }} />
      {edit && <EditPlanModal plan={p} onClose={() => setEdit(false)} />}
      {toast.node}
      {p.status === 'Executing' && data.capacityPlans.length > 0 && <p className="vw-footer-meta"><I.Link2 size={13} /> Delivers {data.capacityPlans.map(c => c.id).join(', ')} in <Link className="ent-link" to={`/capacity?tab=reservations&dc=${p.dcId}`}>Capacity</Link>{p.createdRacks.length ? <> · {p.createdRacks.length} racks in <Link className="ent-link" to={`/dcim?tab=racks&dc=${p.dcId}`}>DCIM</Link></> : null}</p>}
    </div>
  );
}

function Overview({ p, e, capacityPlans }: { p: PlannerPlan; e: PlanEval; capacityPlans: { id: string; title: string; status: string }[] }) {
  return (
    <div className="pl-ov">
      <Panel title="Checks against the site" icon={I.ListChecks} count={e.checks.length} info="Each check compares what the plan needs with what the site has today (its UPS at its redundancy, generator, running cooling, CDU headroom, free floor positions, rack feed limit). A failing check says what to add.">
        {e.checks.length ? <table className="nst-table dt-table dcim-comp"><thead><tr><th>Check</th><th>Needs</th><th>Has</th><th>Result</th></tr></thead><tbody>{e.checks.map(c => (
          <tr key={c.key}><td><span className="cell-2"><b>{c.label}</b><small>{c.basis}</small></span></td><td className="num nowrap">{fmtNum(c.need)} {c.unit}</td><td className="num nowrap">{fmtNum(c.have)} {c.unit}</td>
            <td>{c.ok ? <Chip tone="success" dot>Pass</Chip> : <span className="cell-2"><Chip tone="error" dot>Fails</Chip>{c.fix && <small>{c.fix}</small>}</span>}</td></tr>
        ))}</tbody></table> : <p className="vw-label">{p.scope === 'new-site' ? 'A new datacenter is sized from scratch: every stage below is chosen to carry the load at the plan\'s redundancy.' : 'No site checks for this scope.'}</p>}
      </Panel>
      <Panel title="Findings" icon={I.TriangleAlert} count={e.findings.length} info="Rules the plan breaks or should watch: failed checks, tier rules, a single utility feed, a finish after the target, part-load efficiency and the business case.">
        {e.findings.length ? <ul className="ipam-find">{e.findings.map((f, i) => <li key={i}><div className="pl-find"><SevDot s={f.severity} /><span className="cell-2"><b>{f.title}</b><small>{f.detail}</small></span></div></li>)}</ul> : <p className="vw-label">No findings.</p>}
      </Panel>
      <Panel title="Requirements" icon={I.ClipboardList}>
        <KV cols={3} items={[['Scope', SCOPE_LABEL[p.scope]], ['Site', p.dcId], ['Hall', e.space.hallName ?? '—'], ['Racks', p.racks || '—'], ['kW per rack', p.kwPerRack || '—'], ['Cooling', p.cooling],
          ['Redundancy', p.redundancy], ['Tier', p.tier], ['Target', fmtDate(p.target)], ...(p.plant ? [['Plant', `${p.plant} +${p.plantKw} kW`] as [string, string]] : []), ...(p.refreshTypeId ? [['Refresh', `${p.refreshTypeId} → ${p.refreshToTypeId}`] as [string, string]] : [])]} />
        {capacityPlans.length > 0 && <p className="vw-label" style={{ margin: '10px 0 0' }}>Capacity plans: {capacityPlans.map(c => `${c.id} (${c.status})`).join(', ')}</p>}
      </Panel>
    </div>
  );
}

function Sizing({ p, e }: { p: PlannerPlan; e: PlanEval }) {
  return (
    <div className="pl-ov is-wide">
      <Panel title={p.scope === 'new-site' ? 'Power and cooling chain' : 'Plant to add'} icon={I.Zap} flush info="Each stage sized at its redundancy: 2N = one side carries everything; N+1 = everything but the largest unit carries it. Generators in kVA at 0.8 pf with 10% margin; transformers and UPS at 0.95 pf.">
        {e.plant.length ? <DataTable rows={e.plant.map((x, i) => ({ ...x, id: String(i) }))} pageSize={20} cols={[
          { key: 's', header: 'Stage', render: x => <b>{x.stage}</b> },
          { key: 'u', header: 'Units', render: x => `${x.units} × ${x.unitSize}` },
          { key: 'r', header: 'Redundancy', render: x => x.redundancy },
          { key: 'c', header: 'Capacity', render: x => x.capacity },
          { key: 'n', header: 'Basis', wrap: true, render: x => <span className="vw-label">{x.note}</span> },
          { key: 'k', header: 'Cost', render: x => (x.cost ? <span className="rev-amt">{fmtMoney(x.cost)}</span> : '—') }]} /> : <p className="vw-label" style={{ padding: 16 }}>Nothing to add: the site's plant carries the plan (see the checks).</p>}
      </Panel>
      <Panel title="Heat and space" icon={I.Thermometer}>
        <KV cols={2} items={[['IT load', fmtKw(e.itKw)], ['Facility load', `${fmtKw(e.facilityKw)} (PUE ${e.pue})`], ['Heat to air', fmtKw(e.airKw)], ['Heat to water', fmtKw(e.liquidKw)],
          ['Racks · rows', e.space.racks ? `${e.space.racks} in ${e.space.rows} row${e.space.rows === 1 ? '' : 's'}` : '—'], ['White space', e.space.whiteM2 ? `${fmtNum(e.space.whiteM2)} m²` : '—'],
          ...(e.space.grossM2 ? [['Gross building', `${fmtNum(e.space.grossM2)} m² · ${e.space.halls} hall${e.space.halls > 1 ? 's' : ''}`] as [string, string]] : []), ...(e.space.freePositions !== undefined ? [['Free positions in the hall', e.space.freePositions]] as [string, number][] : [])]} />
      </Panel>
    </div>
  );
}

function Cost({ e }: { e: PlanEval }) {
  const max = Math.max(1, ...e.cash.map(c => Math.max(Math.abs(c.net), Math.abs(c.cum))));
  return (
    <div className="pl-ov">
      <Panel title="CapEx" icon={I.Banknote} flush info="Every line with its basis from the benchmarks; contingency is its own line.">
        <DataTable rows={e.capex.map((c, i) => ({ ...c, id: String(i) }))} pageSize={20} cols={[
          { key: 'l', header: 'Line', render: c => <b>{c.line}</b> }, { key: 'b', header: 'Basis', wrap: true, render: c => <span className="vw-label">{c.basis}</span> }, { key: 'a', header: 'Amount', render: c => <span className="rev-amt">{fmtMoney(c.amount)}</span> }]} />
        <div className="pl-total"><span>Total CapEx</span><b>{fmtMoney(e.capexTotal)}</b></div>
      </Panel>
      <Panel title="OpEx and return" icon={I.TrendingUp} info={`${e.revenueBasis}. Discount rate ${Math.round(e.discount * 100)}%. Energy uses the PUE at part load in each year of the ramp.`}>
        <table className="nst-table dt-table dcim-comp"><tbody>{e.opexYear.map(o => <tr key={o.line}><td><span className="cell-2"><b>{o.line}</b><small>{o.basis}</small></span></td><td className="rev-amt">{fmtMoney(o.amount)}</td></tr>)}</tbody></table>
        <KV cols={3} items={[['NPV (10 y)', fmtMoney(e.npv)], ['IRR', e.irr !== null ? `${e.irr}%` : '—'], ['Payback', e.payback !== null ? `year ${e.payback}` : 'not within 10 years']]} />
        <div className="pl-cash" aria-label="Cash flow by year">
          {e.cash.map(c => (
            <div key={c.year} className="pl-cash-y" title={`Year ${c.year}: net ${fmtMoney(c.net)} · cumulative ${fmtMoney(c.cum)}`}>
              <span className="pl-cash-bar"><i className={c.net >= 0 ? 'up' : 'down'} style={{ height: `${(Math.abs(c.net) / max) * 100}%` }} /></span>
              <span className={`pl-cash-dot${c.cum >= 0 ? ' up' : ''}`} style={{ bottom: `${50 + (c.cum / max) * 50}%` }} />
              <small>Y{c.year}</small>
            </div>
          ))}
        </div>
        <p className="vw-label" style={{ margin: 0 }}>Bars: net cash per year (CapEx, OpEx, revenue) · dots: cumulative position.</p>
      </Panel>
    </div>
  );
}

function Schedule({ p, e }: { p: PlannerPlan; e: PlanEval }) {
  const t0 = Math.min(...e.tasks.map(t => t.start)), t1 = Math.max(e.finish, p.target);
  const x = (t: number) => `${((t - t0) / Math.max(1, t1 - t0)) * 100}%`;
  return (
    <Panel title="Schedule" icon={I.CalendarRange} info="Built from the lead times in the benchmarks: design, long-lead equipment (ordered at approval), installation and commissioning L1–L5. Items in parallel start together.">
      <div className="pl-gantt">
        {e.tasks.map(t => (
          <div key={t.name} className="pl-g-row">
            <span className="pl-g-l"><b>{t.name}</b><small>{t.weeks} weeks{t.longLead ? ' · long lead' : ''}{t.parallel ? ' · in parallel' : ''}</small></span>
            <span className="pl-g-track"><i className={t.longLead ? 'is-ll' : ''} style={{ left: x(t.start), width: `calc(${x(t.end)} - ${x(t.start)})` }} /></span>
          </div>
        ))}
        <div className="pl-g-row pl-g-axis"><span className="pl-g-l" /><span className="pl-g-track">
          <em style={{ left: x(p.target), transform: (p.target - t0) / Math.max(1, t1 - t0) > 0.8 ? 'translateX(-100%)' : undefined }} className="pl-g-target">target {fmtDate(p.target)}</em>
          <em style={{ left: x(e.finish), transform: (e.finish - t0) / Math.max(1, t1 - t0) > 0.8 ? 'translateX(-100%)' : undefined }} className={`pl-g-finish${e.lateDays ? ' late' : ''}`}>finish {fmtDate(e.finish)}</em>
        </span></div>
      </div>
    </Panel>
  );
}

function Approvals({ p }: { p: PlannerPlan }) {
  return (
    <div className="pl-ov">
      <Panel title="Approval chain" icon={I.ShieldCheck} info="Set by the plan's CapEx: the site lead always; the head of DC operations above 1 crore (≈ $200k); the CFO above 10 crore (≈ $2M). A rejection sends the plan back to draft.">
        <ol className="pl-steps">{p.approvals.map(a => (
          <li key={a.step} className={`is-${a.decision.toLowerCase()}`}><span className="pl-step-n">{a.step}</span><span className="cell-2"><b>{a.role} · {a.who}</b><small>{a.decision}{a.at ? ` · ${fmtDate(a.at)}` : ''}{a.comment ? ` · “${a.comment}”` : ''}</small></span></li>
        ))}</ol>
      </Panel>
      <Panel title="History" icon={I.History} count={p.history.length}>
        <ul className="pl-hist">{[...p.history].reverse().map((h, i) => <li key={i}><small>{fmtDate(h.at)}</small><span><b>{h.who}</b> — {h.text}</span></li>)}</ul>
      </Panel>
    </div>
  );
}

function DecideModal({ open, approve, step, onClose, onDone }: { open: boolean; approve: boolean; step: string; onClose: () => void; onDone: (comment: string) => void }) {
  const [c, setC] = useState('');
  return (
    <Modal open={open} onClose={onClose} title={approve ? `Approve as ${step}` : 'Reject the plan'} sub={approve ? 'The next approver is asked; the last approval makes the plan ready to execute.' : 'The plan goes back to draft so its owner can change it.'}
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant={approve ? 'filled' : 'danger'} onClick={() => { onDone(c); setC(''); }}>{approve ? 'Approve' : 'Reject'}</Btn></>}>
      <Field label={<>Comment <Info text="Kept in the plan's history." /></>}><textarea className="input" rows={3} value={c} onChange={e => setC(e.target.value)} placeholder={approve ? 'Optional' : 'Why, and what should change'} /></Field>
    </Modal>
  );
}
