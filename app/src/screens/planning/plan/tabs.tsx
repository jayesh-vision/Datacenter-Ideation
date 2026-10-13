/* Plan page tabs: what the engine worked out for the plan (overview, sizing, capacity by phase, cost, schedule, rules), its
   delivery records, the frozen baseline and the audit history. */
import * as I from 'lucide-react';
import { Link } from 'react-router-dom';
import { Chip, KV, Panel } from '../../../ui/kit';
import { StatGrid, StatTile } from '../../../ui/Analytics';
import type * as T from '../../../planner/p2b/types';
import type { Evaluation } from '../../../planner/lib/engine';
import { COOLING_LABEL } from '../../../planner/lib/wizardModel';
import * as G from '../../../planner/lib/governance';
import { closeoutChecks, deliveryView } from '../../../planner/lib/closeout';
import type { PlannerData } from '../../../planner/lib/plannerData';
import { STEP_LABEL } from '../../../planner/lib/execute';
import { usePlanAudit } from '../../../planner/lib/usePlanner';
import { clockMs } from '../../../planner/compat/clock';
import { Sub, KvList } from '../parts';
import { ASPECT_LABEL, FindingList, SourceChip, date, kw, money, num, pct } from '../common';
import { CashflowBars, ScheduleGantt } from './figures';

export interface TabProps { plan: T.PlannerPlan; ev: Evaluation; template?: T.PlannerTemplate; data: PlannerData }

export function OverviewTab({ plan, ev, template }: TabProps) {
  const fails = ev.findings.filter(f => f.status === 'fail'), warns = ev.findings.filter(f => f.status === 'warn');
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="pn-two is-wide">
        <Panel title="The plan" icon={I.FileText} info="What was asked for, as entered in the wizard: the need, the workload and how critical it is.">
          {plan.intent && <p style={{ margin: '0 0 10px', fontSize: 13.5, lineHeight: 1.5 }}>{plan.intent}</p>}
          <KV cols={3} items={[['Requested by', plan.requestedBy], ['Owner', plan.ownerName], ['Template', `${template?.name ?? plan.templateId}${template ? ` v${template.version}` : ''}${plan.templateVersion ? ` (approved on v${plan.templateVersion})` : ''}`], ['Workload', `${plan.demand.gpuPct}% GPU · ${plan.demand.computePct}% compute · ${plan.demand.storagePct}% storage`], ['Tenancy', plan.demand.tenancy === 'multi' ? 'Several tenants' : 'Single'], ['Growth', `${plan.demand.growthPctPerYear}% a year`], ['Tier', String(ev.params.tier?.value ?? '—')], ['Redundancy', String(ev.params.redundancy?.value ?? '—')], ['Cooling', COOLING_LABEL[ev.params.coolingType?.value as T.PlannerCoolingType] ?? String(ev.params.coolingType?.value ?? '—')]]} />
          {plan.phases.length > 0 && <><Sub>Phases</Sub><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Phase</th><th>Go-live</th><th>IT kW</th><th>Racks</th><th>Halls</th><th>Status</th></tr></thead><tbody>{[...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive)).map(p => <tr key={p.id}><td>{p.name}</td><td>{date(p.goLive)}</td><td className="num">{num(p.itKw)}</td><td className="num">{num(p.racks)}</td><td className="num">{num(p.halls)}</td><td><Chip tone={p.status === 'Live' ? 'success' : p.status === 'In delivery' ? 'warning' : 'neutral'} size="xs" dot>{p.status}</Chip></td></tr>)}</tbody></table></>}
        </Panel>
        <Panel title="Readiness by area" icon={I.ListChecks} info="Share of each area's inputs confirmed by the planner, the requirements, a benchmark, an estate actual or a document; untouched template defaults do not count.">
          <ul className="pn-list">{ev.aspects.map(a => <li key={a.aspect}><span className="cell-2"><b style={{ fontWeight: 400 }}>{ASPECT_LABEL[a.aspect]}<small className="vw-label" style={{ marginLeft: 6 }}>{a.depth}</small></b><span className="pn-bar"><span className="bar" style={{ height: 6 }}><i style={{ width: `${a.pct}%`, background: a.pct >= 80 ? 'var(--vw-color-emerald-500)' : a.pct >= 50 ? 'var(--vw-color-amber-500)' : 'var(--vw-color-red-500)' }} /></span><small className="num">{a.answered}/{a.total}</small></span></span>{a.findings.some(f => f.status === 'fail') ? <Chip tone="error" size="xs">fail</Chip> : a.findings.some(f => f.status === 'warn') ? <Chip tone="warning" size="xs">warn</Chip> : <Chip tone="success" size="xs">pass</Chip>}</li>)}</ul>
        </Panel>
      </div>
      <div className="pn-two">
        <Panel title="Rules that need attention" icon={I.TriangleAlert} count={fails.length + warns.length} info="Hard rules (must) block submission; soft rules (should) are acknowledged in the review.">
          <FindingList findings={[...fails, ...warns]} empty="Every rule passes." />
        </Panel>
        <Panel title="What the plan produces" icon={I.Package} info="The outputs the template defines, and what execution creates in Delivery.">
          <div className="row wrap" style={{ gap: 6 }}>{(template?.outputs ?? []).map(o => <Chip key={o} tone="neutral">{o}</Chip>)}{template?.executesAs && <Chip tone="info">becomes a {template.executesAs}</Chip>}</div>
          <KvList items={[['Approval path', template?.approvalPath.join(' → ') || 'none'], ['Rules checked', String(ev.findings.length)], ['Scenarios', String(plan.preferredScenarioId ? 'one preferred' : 'base case')], ['Permits', String(plan.permits.length)], ['Risks', String(plan.risks.length)], ['Conditions open', String((plan.conditions ?? []).filter(c => c.status === 'Open').length)]]} />
        </Panel>
      </div>
    </div>
  );
}

export function SizingTab({ ev }: TabProps) {
  const s = ev.sizing;
  return (
    <div className="col" style={{ gap: 14 }}>
      <StatGrid cols={6}>
        <StatTile label="IT capacity" value={kw(s.itKw)} sub={s.facility ? `${s.facility.mva} MVA facility` : undefined} />
        <StatTile label="Racks" value={num(s.racks)} sub={`${ev.params.densityKwPerRack?.value ?? '—'} kW per rack`} />
        <StatTile label="Halls / buildings" value={`${s.halls} / ${s.buildings}`} sub={`${num(s.whiteSpaceM2)} m² white space`} />
        <StatTile label="Cooling" value={kw(s.cooling.capacityKw)} sub={`${COOLING_LABEL[s.cooling.type as T.PlannerCoolingType] ?? s.cooling.type} · ${s.cooling.redundancy}`} />
        <StatTile label="PUE" value={String(s.pue.value)} sub={s.pue.source} />
        <StatTile label="Operations staff" value={`${num(s.staffing.fte, 1)} FTE`} sub={`${s.staffing.perMw} per MW`} />
      </StatGrid>
      {s.power?.length ? <Panel title="Power chain at redundancy" icon={I.Zap} info="Each stage must carry its load with the redundancy taken out: one side for 2N, all but the largest module for N+1."><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Stage</th><th>Redundancy</th><th>Units</th><th>Usable</th><th>Must carry</th><th>Check</th><th>From</th></tr></thead><tbody>{s.power.map(p => <tr key={p.key}><td><span className="cell-2"><b>{p.label}</b><small>{p.basis}</small></span></td><td>{p.redundancy}</td><td className="num">{p.count} × {p.unit}</td><td className="num">{kw(p.usableKw)}</td><td className="num">{kw(p.needKw)}</td><td><Chip tone={p.ok ? 'success' : 'error'} size="xs" dot>{p.ok ? 'OK' : 'Short'}</Chip></td><td><SourceChip s={p.source} /></td></tr>)}</tbody></table></Panel> : null}
      <div className="pn-two">
        <Panel title="Plant" icon={I.Factory} count={s.plant.length}>{s.plant.length ? <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Item</th><th>Count</th><th>Rating</th><th>Redundancy</th></tr></thead><tbody>{s.plant.map((p, i) => <tr key={`${p.name}-${i}`}><td><span className="cell-2"><b>{p.name}</b>{(p.model || p.note) && <small>{[p.model, p.note].filter(Boolean).join(' · ')}</small>}</span></td><td className="num">{p.count}</td><td className="num">{p.unitKva ? `${num(p.unitKva)} kVA` : kw(p.capacityKw)}</td><td>{p.redundancy}</td></tr>)}</tbody></table> : <p className="vw-label">No plant for this plan type.</p>}</Panel>
        <div className="col" style={{ gap: 14 }}>
          <Panel title="Cooling" icon={I.Snowflake}><KV cols={2} items={[['Heat to liquid', kw(s.cooling.liquidKw)], ['Heat to air', kw(s.cooling.airKw)], ['Air units', `${s.cooling.air.units} × ${kw(s.cooling.air.unitKw)} ${s.cooling.air.label}`], ['CDUs', s.cooling.cdu ? `${s.cooling.cdu.units} × ${kw(s.cooling.cdu.unitKw)}` : '—'], ['Rear doors', num(s.cooling.rearDoors)], ['Liquid required', s.cooling.liquidRequired ? 'Yes' : 'No']]} /></Panel>
          <Panel title="Network" icon={I.Network}><KV cols={2} items={[['Leaf / spine / core', `${s.network.leaves} / ${s.network.spines} / ${s.network.cores}`], ['Uplinks', `${num(s.network.uplinks)} × ${s.network.uplinkGbps}G`], ['Access ports', num(s.network.accessPorts)], ['Carriers', num(s.network.carriers)], ['Interconnect', s.network.dciGbps ? `${num(s.network.dciGbps)} Gbps` : '—'], ['Spares', `${s.spares.lines} lines · ${money(s.spares.valueUsd)}`]]} /></Panel>
        </div>
      </div>
      {s.rackClasses.length > 0 && <Panel title="Rack classes" icon={I.Server}><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Class</th><th>kW per rack</th><th>Racks</th><th>Share</th><th>Cooling</th></tr></thead><tbody>{s.rackClasses.map(c => <tr key={c.name}><td>{c.name}</td><td className="num">{c.kw}</td><td className="num">{num(c.racks)}</td><td className="num">{pct(c.sharePct)}</td><td>{c.liquid ? `Liquid to chip (${c.capturePct}% captured)` : c.rearDoor ? 'Rear door' : 'Air'}</td></tr>)}</tbody></table></Panel>}
      {s.warnings?.length ? <p className="note note--warn"><I.TriangleAlert size={15} /><span>{s.warnings.join(' · ')}</span></p> : null}
    </div>
  );
}

export function CapacityTab({ plan, ev }: TabProps) {
  const site = ev.ctx.site;
  return (
    <div className="col" style={{ gap: 14 }}>
      <Panel title="Capacity by phase" icon={I.Layers} info="Installed IT capacity at each phase, what is already committed (live load, holds, approved plans), the reserve policy and the headroom left; the first binding dimension is named.">
        {ev.ladder.length ? <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Phase</th><th>Go-live</th><th>Installed</th><th>Committed</th><th>Reserve</th><th>Headroom</th><th>Usable</th><th>Binds first</th><th>Demand crosses</th></tr></thead><tbody>{ev.ladder.map(r => <tr key={r.phase.id}><td><span className="cell-2"><b>{r.phase.name}</b>{r.committedBasis && <small>{r.committedBasis}</small>}</span></td><td>{date(r.phase.goLive)}</td><td className="num">{kw(r.installedKw)}</td><td className="num">{kw(r.committedKw)}</td><td className="num">{kw(r.reserveKw)}</td><td className="num">{kw(r.headroomKw)}</td><td className="num">{pct(r.usablePct)}</td><td><Chip tone={r.bindingConstraint === 'none' ? 'success' : 'warning'} size="xs">{r.bindingConstraint}</Chip></td><td>{r.crossesWarningMonth !== undefined ? `month ${r.crossesWarningMonth} at ${plan.demand.growthPctPerYear}% a year` : '—'}</td></tr>)}</tbody></table> : <p className="vw-label">No phases.</p>}
      </Panel>
      {site && <Panel title={`What ${site.dc.name} can take today`} icon={I.Building2} info="The site's power chain read from its records: usable capacity at each stage's redundancy, less live load, holds and approved plans.">
        <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Stage</th><th>Redundancy</th><th>Usable</th><th>Load</th><th>IT headroom</th><th>Basis</th></tr></thead><tbody>{site.stages.map(s => <tr key={s.key}><td>{s.label}</td><td>{s.redundancy}</td><td className="num">{kw(s.usableKw)}</td><td className="num">{kw(s.loadKw)}</td><td className="num" style={{ color: s.headroomItKw < 0 ? 'var(--vw-color-red-600)' : undefined }}>{kw(s.headroomItKw)}</td><td className="vw-label">{s.basis}</td></tr>)}</tbody></table>
        <KvList items={[['Live IT load', kw(site.itLoadKw)], ['Holds', `${kw(site.reservedKw)} (${site.holds.length})`], ['Approved plans not yet held', `${kw(site.pipelineKw)} (${site.pipeline.length})`], ['Free rack positions', String(site.halls.reduce((a, h) => a + h.freePositions, 0))], ['Cooling headroom', kw(site.cooling.headroomKw)], ['Binding stage', site.binding?.label ?? '—']]} />
      </Panel>}
    </div>
  );
}

export function CostTab({ plan, ev }: TabProps) {
  const e = ev.estimate;
  const byCat = new Map<string, number>(); for (const l of e.capex) byCat.set(l.category, (byCat.get(l.category) ?? 0) + l.amount);
  return (
    <div className="col" style={{ gap: 14 }}>
      <StatGrid cols={6}>
        <StatTile label="CapEx" value={money(e.capexTotal)} sub={`${money(e.capexPerKw)} per kW`} />
        <StatTile label="Per rack" value={money(e.capexPerRack)} sub={e.basis ?? 'benchmark'} />
        <StatTile label="OpEx per month" value={money(e.opexMonthly)} sub={`${money(e.costPerKwMonth)} per kW-month`} />
        <StatTile label="Revenue per year" value={money(e.revenueAnnual)} sub={e.benefitAnnual ? `+ ${money(e.benefitAnnual)} benefit` : 'from the price per kW'} />
        <StatTile label="Payback" value={e.paybackMonths == null ? '—' : `${e.paybackMonths} mo`} sub={e.paybackMonths == null ? 'not within the horizon' : 'from the first spend'} subTone={e.paybackMonths == null || e.paybackMonths > 96 ? 'warn' : undefined} />
        <StatTile label="NPV / IRR" value={`${money(e.npvUsd)} / ${e.irrPct == null ? '—' : `${e.irrPct}%`}`} sub={`at ${e.discountPct ?? '—'}% hurdle rate`} subTone={(e.npvUsd ?? 0) < 0 ? 'warn' : undefined} />
      </StatGrid>
      {plan.baseline && <p className="note note--info"><I.Lock size={15} /><span>Approved baseline {money(plan.baseline.capexTotal)} CapEx and {money(plan.baseline.opexMonthly)} OpEx per month, frozen {date(plan.baseline.at)} on {plan.baseline.scenarioName ?? 'the base case'}. Figures below are the live evaluation.</span></p>}
      <div className="pn-two">
        <Panel title="CapEx by category" icon={I.Coins} count={e.capex.length}>
          {[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => <div key={c} className="pn-rail-row"><span>{c}</span><b>{money(v)}</b></div>)}
          <div className="pn-rail-row" style={{ borderBottom: 0 }}><span className="strong">Total</span><b>{money(e.capexTotal)}</b></div>
          {e.benchmarkBand && <p className="vw-label" style={{ margin: '8px 0 0', fontSize: 12 }}>Benchmark {money(e.benchmarkBand.low)}–{money(e.benchmarkBand.high)} per kW ({e.benchmarkBand.source}){e.actualsCapexPerKw ? `; our last builds ${money(e.actualsCapexPerKw)} per kW` : ''}.</p>}
        </Panel>
        <Panel title="OpEx per year" icon={I.Gauge} count={e.opex.length}>
          {e.opex.map((l, i) => <div key={i} className="pn-rail-row" title={l.basis}><span>{l.item}</span><b>{money(l.amount)}</b></div>)}
          <div className="pn-rail-row" style={{ borderBottom: 0 }}><span className="strong">Total</span><b>{money(e.opexAnnual)}</b></div>
          <p className="vw-label" style={{ margin: '8px 0 0', fontSize: 12 }}>{num(e.energyMwhYear)} MWh a year at PUE {ev.sizing.pue.value}; {num(ev.sustainability.carbonTYear)} t CO₂ with {ev.sustainability.renewableSharePct}% renewables.</p>
        </Panel>
      </div>
      <Panel title="CapEx lines" icon={I.List} flush><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Item</th><th>Category</th><th>Basis</th><th>Amount</th><th>From</th></tr></thead><tbody>{e.capex.map((l, i) => <tr key={i}><td>{l.item}</td><td>{l.category}</td><td className="vw-label">{l.basis}</td><td className="num">{money(l.amount)}</td><td><SourceChip s={l.source} /></td></tr>)}</tbody></table></Panel>
      {e.cashflow?.length ? <Panel title="Cash flow" icon={I.TrendingUp} sub={`${e.cashflow.length} years · ${e.paybackBasis}`}><CashflowBars years={e.cashflow} /><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Year</th><th>CapEx</th><th>OpEx</th><th>Revenue</th>{e.benefitAnnual ? <th>Benefit</th> : null}<th>Net</th><th>Cumulative</th></tr></thead><tbody>{e.cashflow.map(y => <tr key={y.year}><td>{y.label}</td><td className="num">{money(y.capex)}</td><td className="num">{money(y.opex)}</td><td className="num">{money(y.revenue)}</td>{e.benefitAnnual ? <td className="num">{money(y.benefit)}</td> : null}<td className="num" style={{ color: y.net < 0 ? 'var(--vw-color-red-600)' : undefined }}>{money(y.net)}</td><td className="num">{money(y.cumulative)}</td></tr>)}</tbody></table></Panel> : null}
      {ev.reconciliation && <Panel title="Estimate against the bill of materials" icon={I.Scale} info="Whole-site plans are estimated from benchmarks; the bill of materials prices the same categories bottom-up. Land, shell, design and contingency have no bill counterpart.">
        <KvList items={[['Estimate', money(ev.reconciliation.estimateTotal)], ['Bill of materials', money(ev.reconciliation.bomTotal)], ['Reconciled', money(ev.reconciliation.reconciledTotal)], ['Gap', `${money(ev.reconciliation.gapUsd)} (${pct(ev.reconciliation.gapPct)})`]]} />
      </Panel>}
    </div>
  );
}

export function ScheduleTab({ plan, ev }: TabProps) {
  const late = ev.schedule.filter(s => s.late);
  return (
    <div className="col" style={{ gap: 14 }}>
      {late.length > 0 && <p className="note note--bad"><I.OctagonAlert size={15} /><span>{late.length} item{late.length === 1 ? '' : 's'} cannot arrive by the need date: {late.map(l => l.item).join(', ')}. Order now, move the phase, or pick a stocked alternative.</span></p>}
      <Panel title="What must be ordered when" icon={I.CalendarClock} info="Each long-lead item back-scheduled from the phase that needs it: lead time = benchmark high plus the schedule contingency as a buffer; stock means a transfer only.">
        <ScheduleGantt items={ev.schedule} target={plan.targetGoLive} />
      </Panel>
      <Panel title="Items" icon={I.List} flush><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Item</th><th>Kind</th><th>Phase</th><th>Lead time</th><th>Order by</th><th>Need by</th><th>Source</th><th>Status</th></tr></thead><tbody>{ev.schedule.map((s, i) => <tr key={i}><td>{s.item}{s.note && <small className="vw-label"> · {s.note}</small>}</td><td>{s.kind}</td><td>{s.phase}</td><td className="num">{s.leadWeeks} wk{s.bufferWeeks ? ` + ${s.bufferWeeks}` : ''}</td><td>{date(s.orderBy)}</td><td>{date(s.needBy)}</td><td>{s.source ?? '—'}</td><td>{s.late ? <Chip tone="error" size="xs" dot>Late</Chip> : <Chip tone={s.poId ? 'success' : 'neutral'} size="xs" dot>{s.status ?? 'to order'}</Chip>}</td></tr>)}</tbody></table></Panel>
      {plan.permits.length > 0 && <Panel title="Permits" icon={I.Stamp} flush><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Permit</th><th>Authority</th><th>Lead time</th><th>Needed before</th><th>Status</th></tr></thead><tbody>{plan.permits.map(p => <tr key={p.id}><td>{p.name}</td><td>{p.authority}</td><td className="num">{p.leadWeeks} wk</td><td>{date(p.neededBefore)}</td><td><Chip tone={p.status === 'Approved' ? 'success' : p.status === 'Expired' ? 'error' : p.status === 'Not started' ? 'neutral' : 'info'} size="xs" dot>{p.status}</Chip></td></tr>)}</tbody></table></Panel>}
    </div>
  );
}

export function RulesTab({ ev }: TabProps) {
  const byAspect = new Map<T.PlannerAspect, typeof ev.findings>();
  for (const f of ev.findings) byAspect.set(f.rule.aspect, [...(byAspect.get(f.rule.aspect) ?? []), f]);
  const n = (s: string) => ev.findings.filter(f => f.status === s).length;
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row wrap" style={{ gap: 6 }}><Chip tone="error" dot>{n('fail')} fail</Chip><Chip tone="warning" dot>{n('warn')} warn</Chip><Chip tone="success" dot>{n('pass')} pass</Chip><Chip tone="neutral" dot>{n('n/a')} not applicable</Chip><span className="vw-label">· {ev.findings.length} rules from {ev.resolved?.chain.map(c => c.name).join(' → ') ?? 'the template'}</span></div>
      {[...byAspect.entries()].sort((a, b) => (b[1].some(f => f.status === 'fail') ? 1 : 0) - (a[1].some(f => f.status === 'fail') ? 1 : 0)).map(([a, fs]) => <Panel key={a} title={ASPECT_LABEL[a]} count={fs.length}><FindingList findings={fs} /></Panel>)}
    </div>
  );
}

export function HistoryTab({ plan }: TabProps) {
  const audit = usePlanAudit(plan.id);
  const rounds = [...(plan.approvalHistory ?? []), ...(plan.approvals.length ? [{ round: G.currentRound(plan), submittedAt: plan.submittedAt ?? '', submittedBy: plan.submittedBy ?? '', approvals: plan.approvals, outcome: (plan.status === 'Rejected' ? 'Rejected' : plan.status === 'In review' ? 'Withdrawn' : 'Approved') as T.PlannerApprovalRound['outcome'], current: true, amountUsd: plan.approvalAmountUsd, band: plan.approvalBand }] : [])];
  return (
    <div className="pn-two is-wide">
      <Panel title="Audit trail" icon={I.History} count={audit.length} info="Every change to the plan, field by field, with who made it and the reason given.">
        {audit.length ? <ul className="pl-hist">{audit.map(a => <li key={a.id}><small>{date(a.timestamp)}</small><span><b>{a.actorName}</b> — {a.summary}{a.reason ? <small> · reason: {a.reason}</small> : null}{a.changes?.length ? <small>{G.changesText(a.changes, 3)}</small> : null}</span></li>)}</ul> : <p className="vw-label">Created {date(plan.createdAt)} by {plan.createdBy}; no change since.</p>}
      </Panel>
      <Panel title="Approval rounds" icon={I.ShieldCheck} count={rounds.length}>
        {rounds.length ? rounds.map(r => <div key={r.round} style={{ marginBottom: 12 }}><div className="row between"><b style={{ fontSize: 13 }}>Round {r.round}{'current' in r ? ' (current)' : ''}</b><Chip tone={r.outcome === 'Approved' ? 'success' : r.outcome === 'Rejected' ? 'error' : 'neutral'} size="xs" dot>{'current' in r && plan.status === 'In review' ? 'In progress' : r.outcome}</Chip></div><small className="vw-label">Submitted {date(r.submittedAt)} by {r.submittedBy}{r.amountUsd ? ` · ${money(r.amountUsd)}${r.band ? ` · ${r.band}` : ''}` : ''}</small><ol className="pl-steps" style={{ marginTop: 6 }}>{G.orderedSteps(r.approvals).map((a, i) => <li key={i} className={`is-${a.decision === 'Pending' ? 'pending' : a.decision === 'Rejected' ? 'rejected' : 'approved'}`}><span className="pl-step-n">{i + 1}</span><span className="cell-2"><b>{a.step} · {a.person ?? a.role}</b><small>{a.decision}{a.at ? ` · ${date(a.at)}` : ''}{a.reason ? ` · ${a.reason}` : ''}</small></span></li>)}</ol></div>) : <p className="vw-label">Not submitted yet.</p>}
      </Panel>
    </div>
  );
}

export function BaselineTab({ plan, ev, template }: TabProps) {
  const b = plan.baseline;
  if (!b) return <p className="vw-label">No baseline: it is frozen at final approval.</p>;
  const delta = G.baselineDelta(b, plan, ev, k => ev.resolved?.params.find(p => p.key === k)?.label ?? k);
  const drift = G.templateDrift(plan, template);
  return (
    <div className="col" style={{ gap: 14 }}>
      <StatGrid cols={6}>
        <StatTile label="Baseline CapEx" value={money(b.capexTotal)} sub={`incl. ${money(b.contingencyUsd)} contingency`} />
        <StatTile label="Baseline OpEx" value={money(b.opexMonthly)} sub="per month" />
        <StatTile label="Bill of materials" value={money(b.bomTotal)} sub={b.buyTotal !== undefined ? `${money(b.buyTotal)} to buy` : 'at approval'} />
        <StatTile label="Design power" value={kw(b.designPowerKw)} sub={`${b.phases.length} phases`} />
        <StatTile label="Frozen" value={date(b.at)} sub={`by ${b.by}`} />
        <StatTile label="Template" value={`v${b.templateVersion}`} sub={drift ? `now v${drift.to}` : 'current'} subTone={drift ? 'warn' : undefined} />
      </StatGrid>
      <Panel title="Live plan against the baseline" icon={I.GitCompare} info="What differs between the frozen figures and the plan as it evaluates today. A change after approval needs a revision with its own approval round.">
        <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Figure</th><th>Baseline</th><th>Now</th><th></th></tr></thead><tbody>{delta.map(d => <tr key={d.label}><td>{d.label}</td><td className="num">{d.before}</td><td className="num">{d.after}</td><td>{d.changed ? <Chip tone="warning" size="xs">changed</Chip> : <Chip tone="success" size="xs">same</Chip>}</td></tr>)}</tbody></table>
      </Panel>
      {plan.closeout && <Panel title="Close-out" icon={I.CheckCircle2}><KV cols={3} items={[['Completed', `${date(plan.closeout.completedAt)} by ${plan.closeout.completedBy}`], ['Delivered', kw(plan.closeout.deliveredKw)], ['Actual CapEx', money(plan.closeout.actualCapex)], ['Measured draw', plan.closeout.measuredKw !== undefined ? kw(plan.closeout.measuredKw) : '—'], ['Notes', plan.closeout.notes ?? '—']]} /></Panel>}
    </div>
  );
}

export function DeliveryTab({ plan, data, template }: TabProps) {
  const d = deliveryView(plan, data, clockMs());
  const checks = closeoutChecks(plan, data, template);
  const a = plan.artefacts;
  const prj = plan.plnId.replace('PLN-', 'PRJ-');
  return (
    <div className="col" style={{ gap: 14 }}>
      <StatGrid cols={6}>
        <StatTile label="Complete" value={d.pctComplete === undefined ? '—' : pct(d.pctComplete)} sub={d.rag ? `RAG ${d.rag}` : `${d.records.projects.length} projects`} />
        <StatTile label="Actual spend" value={money(d.actualSpend)} sub={d.baselineCapex ? `of ${money(d.baselineCapex)} baseline` : 'no baseline'} />
        <StatTile label="Variance" value={d.variancePct === undefined ? '—' : `${d.variancePct > 0 ? '+' : ''}${pct(d.variancePct)}`} sub="forecast against baseline" subTone={d.variancePct !== undefined && d.variancePct > 5 ? 'bad' : undefined} />
        <StatTile label="Purchase orders" value={num(d.records.purchaseOrders.length)} sub={`${d.overduePos.length} overdue to order`} subTone={d.overduePos.length ? 'bad' : undefined} />
        <StatTile label="Changes" value={`${d.records.changeRequests.filter(c => c.status === 'Implemented' || c.status === 'Closed').length}/${d.records.changeRequests.length}`} sub="implemented" />
        <StatTile label="Close-out checks" value={`${checks.filter(c => c.ok).length}/${checks.length}`} sub={checks.every(c => c.ok) && checks.length ? 'ready to complete' : 'open'} />
      </StatGrid>
      <div className="pn-two">
        <Panel title="Execution" icon={I.Rocket} sub={a?.executionId ? `${a.executionId}${a.completedAt ? ` · finished ${date(a.completedAt)}` : ' · not finished'}` : 'Not executed yet'} info="The steps Start the build runs from the approved baseline; steps already done are kept when a stopped execution is resumed.">
          {a?.steps ? <ul className="pn-list">{Object.entries(a.steps).map(([k, s]) => <li key={k}><Chip tone={s === 'done' ? 'success' : s === 'failed' ? 'error' : 'neutral'} size="xs" dot>{s}</Chip><span className="cell-2"><b style={{ fontWeight: 400 }}>{STEP_LABEL[k] ?? k}</b>{a.errors?.find(e => e.step === k) && <small style={{ color: 'var(--vw-color-red-600)' }}>{a.errors.find(e => e.step === k)!.message}</small>}</span></li>)}</ul> : <p className="vw-label">Nothing has been built yet. Delivery records appear here once the approved plan is executed.</p>}
          {(plan.status === 'Executing' || plan.status === 'Completed') && <p style={{ margin: '10px 0 0', fontSize: 13 }}>Delivered as project <Link className="ent-link mono" to={`/delivery/projects/${prj}`}>{prj}</Link> in Delivery: work orders, purchase orders, commissioning and handover.</p>}
        </Panel>
        <Panel title="Completion checklist" icon={I.ClipboardCheck} actions={checks.length ? <Chip tone={checks.every(c => c.ok) ? 'success' : 'warning'}>{checks.filter(c => c.ok).length}/{checks.length}</Chip> : undefined} info="Read live from the delivery records; every check must be green before the plan can be completed.">
          {checks.length ? <ul className="pn-list">{checks.map(c => <li key={c.key}><Chip tone={c.ok ? 'success' : 'warning'} size="xs" dot>{c.ok ? 'OK' : 'Open'}</Chip><span className="cell-2"><b style={{ fontWeight: 400 }}>{c.label}</b><small>{c.detail}</small></span></li>)}</ul> : <p className="vw-label">Checks apply once the plan is executing.</p>}
        </Panel>
      </div>
      {a && <Panel title="Records created" icon={I.Boxes}><KV cols={4} items={[['Vehicle', a.vehicle], ['Programme', a.programId ?? '—'], ['Bill of materials', a.bomId ?? '—'], ['Purchase orders', String(a.purchaseOrderIds.length)], ['Subnets / VLANs', `${a.subnetIds.length} / ${a.vlanIds.length}`], ['Permits', String(a.permitIds.length)], ['Design documents', String(a.designDocIds.length)], ['Capacity holds', String(a.reservationIds?.length ?? 0)]]} /></Panel>}
    </div>
  );
}
