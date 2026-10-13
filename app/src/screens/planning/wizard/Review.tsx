/* The last step (what blocks submission, what the plan produces, who approves it) and the live estimate rail shown beside every step. */
import * as I from 'lucide-react';
import { Chip, KV, Panel } from '../../../ui/kit';
import type * as T from '../../../planner/p2b/types';
import type { Evaluation } from '../../../planner/lib/engine';
import { blockers, type StepKey, type StepProps } from '../../../planner/lib/wizardModel';
import * as G from '../../../planner/lib/governance';
import { ASPECT_LABEL, SCOPE_LABEL, SourceChip, date, kw, money, num } from '../common';
import { Sub } from '../parts';
import { StepHead } from './steps';

export function ReviewStep({ draft, ev, template, data, goTo, estate }: StepProps) {
  const list = blockers(draft, ev, template, data);
  const bad = list.filter(b => b.level === 'bad'), warn = list.filter(b => b.level === 'warn');
  const amt = ev ? G.approvalAmount(ev) : { amountUsd: 0, itUsd: 0 };
  const path = G.buildApprovalPath(template, amt.amountUsd, amt.itUsd);
  const site = estate.dataCenters.find(d => d.id === draft.dataCenterId)?.name ?? draft.newSiteName ?? estate.campuses.find(c => c.id === draft.campusId)?.name ?? estate.regions.find(r => r.id === draft.regionId)?.name ?? '—';
  const step = (k: StepKey) => <button type="button" className="ent-link" style={{ fontSize: 12 }} onClick={() => goTo(k)}>fix</button>;
  return (
    <div>
      <StepHead title="Review and submit" text="What approvers will see: the plan, its figures, the rules it passes and what it produces. Anything blocking is listed first." />
      <p className={`pl-verdict ${bad.length ? 'is-blocked' : warn.length ? 'is-warn' : 'is-ready'}`}>{bad.length ? <I.OctagonX size={16} /> : warn.length ? <I.TriangleAlert size={16} /> : <I.CheckCircle2 size={16} />}{bad.length ? `${bad.length} item${bad.length === 1 ? '' : 's'} block submission` : warn.length ? `Ready to submit; ${warn.length} item${warn.length === 1 ? '' : 's'} to acknowledge` : 'Ready to submit: every rule passes and every input has a source'}</p>
      {list.length > 0 && <ul className="pn-list" style={{ marginTop: 10 }}>{list.map((b, i) => <li key={i}><Chip tone={b.level === 'bad' ? 'error' : 'warning'} size="xs" dot>{b.level === 'bad' ? 'Blocks' : 'Note'}</Chip><span className="cell-2"><b style={{ fontWeight: 400 }}>{b.text}</b></span>{step(b.step)}</li>)}</ul>}
      <div className="pn-two" style={{ marginTop: 14 }}>
        <Panel title="The plan" icon={I.FileText}>
          <KV cols={2} items={[['Plan type', SCOPE_LABEL[draft.scope]], ['Template', `${template?.name ?? '—'}${template ? ` v${template.version}` : ''}`], ['Where', site], ['Needed by', date(draft.targetGoLive)], ['IT capacity', kw(draft.designPowerKw)], ['Phases', String(draft.phases.length)], ['Workload', `${draft.demand.gpuPct}% GPU · ${draft.demand.computePct}% compute · ${draft.demand.storagePct}% storage`], ['Owner', draft.ownerName]]} />
          {ev && <><Sub>Figures approvers see</Sub><KV cols={2} items={[['CapEx', money(ev.estimate.capexTotal)], ['OpEx per month', money(ev.estimate.opexMonthly)], ['PUE', String(ev.sizing.pue.value)], ['Payback', ev.estimate.paybackMonths == null ? '—' : `${ev.estimate.paybackMonths} months`], ['Racks / halls', `${num(ev.sizing.racks)} / ${num(ev.sizing.halls)}`], ['Readiness', `${ev.readinessPct}%`]]} /></>}
        </Panel>
        <Panel title="Approval and outputs" icon={I.ShieldCheck}>
          <p className="vw-label" style={{ margin: '0 0 8px' }}>Routed on {money(amt.amountUsd)}{amt.itUsd ? ` (incl. ${money(amt.itUsd)} owned IT)` : ''} · band {path.band.label}{path.band.businessCaseRequired ? ' · business case required' : ''}</p>
          {path.approvals.length ? <ol className="pl-steps">{path.approvals.map((a, i) => <li key={i} className="is-pending"><span className="pl-step-n">{i + 1}</span><span className="cell-2"><b>{a.step} · {a.role}</b><small>{a.basis}</small></span></li>)}</ol> : <p className="vw-label">No approval step for this plan type.</p>}
          <Sub>Produces</Sub>
          <div className="row wrap" style={{ gap: 6 }}>{(template?.outputs ?? []).map(o => <Chip key={o} tone="neutral">{o}</Chip>)}{template?.executesAs && <Chip tone="info">becomes a {template.executesAs}</Chip>}</div>
        </Panel>
      </div>
      {ev && <><Sub>Inputs by area</Sub><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Area</th><th>Depth</th><th>Confirmed inputs</th><th>Still on defaults</th><th>Checks</th></tr></thead><tbody>{ev.aspects.map(a => <tr key={a.aspect}><td>{ASPECT_LABEL[a.aspect]}</td><td>{a.depth}</td><td className="num">{a.answered} of {a.total}</td><td className="num">{a.defaults ?? 0}</td><td>{a.findings.some(f => f.status === 'fail') ? <Chip tone="error" size="xs">fail</Chip> : a.findings.some(f => f.status === 'warn') ? <Chip tone="warning" size="xs">warn</Chip> : <Chip tone="success" size="xs">pass</Chip>}</td></tr>)}</tbody></table></>}
    </div>
  );
}

function Row({ label, value, source, note, tone }: { label: string; value: React.ReactNode; source?: T.PlannerParamSource; note?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return <div className="pn-rail-row" title={note}><span>{label}</span><span className="row" style={{ gap: 6 }}><b className={tone ?? ''}>{value}</b><SourceChip short s={source} note={note} /></span></div>;
}
export function LiveEstimate({ draft, ev }: { draft: T.PlannerPlan; ev?: Evaluation }) {
  return (
    <Panel className="pn-rail" title="Live estimate" info="Re-evaluated on every change: sizing, cost, rules and readiness of the draft as it is now. Each figure says where its inputs come from."
      actions={ev && <Chip tone={ev.hardFails ? 'error' : ev.softWarns ? 'warning' : 'success'} dot>{ev.hardFails ? `${ev.hardFails} fail` : ev.softWarns ? `${ev.softWarns} warn` : 'Clean'}</Chip>}>
      {!ev ? <p className="vw-label">Evaluating…</p> : <>
        {ev.ctx.site && <Row label={`Free at ${ev.ctx.site.dc.code}`} value={kw(ev.ctx.site.headroomItKw)} source="actual" note={`${ev.ctx.site.binding?.label ?? 'no stage'} binds; live draw ${kw(ev.ctx.site.itLoadKw)}, holds ${kw(ev.ctx.site.reservedKw)}`} />}
        <Row label="IT power" value={kw(ev.sizing.itKw)} source="user" />
        {ev.sizing.facility && <Row label="Facility load" value={`${ev.sizing.facility.mva} MVA`} note={`${kw(ev.sizing.facility.facilityKw)} = IT × peak PUE ${ev.sizing.facility.peakPue}`} source={ev.sizing.pue.source} />}
        <Row label="Racks" value={num(ev.sizing.racks)} source={ev.params.densityKwPerRack?.source ?? 'template'} note={`${ev.params.densityKwPerRack?.value ?? 12} kW per rack`} />
        <Row label="Halls / buildings" value={`${ev.sizing.halls} / ${ev.sizing.buildings}`} source={ev.params.hallDesignKw?.source ?? 'template'} />
        <Row label="CapEx" value={money(ev.estimate.capexTotal)} source={ev.params.capexPerKw?.source ?? ev.estimate.capex[0]?.source ?? 'benchmark'} note={`${money(ev.estimate.capexPerKw)} per kW plant and fit-out`} />
        <Row label="OpEx / month" value={money(ev.estimate.opexMonthly)} source={ev.sizing.pue.source} note={`${money(ev.estimate.costPerKwMonth)} per kW-month`} />
        <Row label="PUE" value={String(ev.sizing.pue.value)} source={ev.sizing.pue.source} note={ev.sizing.pue.note} />
        <Row label="Payback" value={ev.estimate.paybackMonths == null ? '—' : `${ev.estimate.paybackMonths} mo`} source={ev.params.revenuePerKwMonth?.source} note={ev.estimate.paybackBasis} tone={ev.estimate.paybackMonths == null ? 'warn' : ev.estimate.paybackMonths > 96 ? 'warn' : 'ok'} />
        {ev.estimate.npvUsd !== undefined && <Row label="NPV / IRR" value={`${money(ev.estimate.npvUsd)} / ${ev.estimate.irrPct == null ? '—' : `${ev.estimate.irrPct}%`}`} note={`at ${ev.estimate.discountPct}% hurdle rate`} tone={ev.estimate.npvUsd >= 0 ? 'ok' : 'warn'} />}
        <Row label="Hard fails" value={String(ev.hardFails)} tone={ev.hardFails ? 'bad' : 'ok'} />
        <Row label="Warnings" value={String(ev.softWarns)} tone={ev.softWarns ? 'warn' : 'ok'} />
        <Row label="Readiness" value={`${ev.readinessPct}%`} note="inputs confirmed by you, your requirements, a benchmark, an actual or a document; untouched template defaults do not count" tone={ev.readinessPct >= 80 ? 'ok' : ev.readinessPct >= 50 ? 'warn' : 'bad'} />
        {!!ev.defaultsCount && <Row label="Still on template defaults" value={String(ev.defaultsCount)} tone="warn" />}
        {ev.bindingConstraint !== 'none' && <p style={{ margin: '8px 0 0' }}><Chip tone="warning" size="xs">{ev.bindingConstraint} binds first</Chip></p>}
        <p className="vw-label" style={{ margin: '10px 0 0', fontSize: 11.5 }}>{ev.resolved?.template.name ?? 'No template'} · {draft.phases.length} phase{draft.phases.length === 1 ? '' : 's'} · {ev.findings.length} rules checked</p>
      </>}
    </Panel>
  );
}
