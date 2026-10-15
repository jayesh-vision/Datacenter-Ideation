/* Plan page (/planning/plans/:id): the plan's figures (base case or a scenario), its status and the actions its status allows
   (submit, withdraw, decide, start the build, complete, hold, cancel, revision, open the programme in Delivery, clone as a scenario
   base), then tabs: Overview · Plan pack · the family's own tabs (`uiFor(scope).detailTabs`) · Sizing · Capacity · Cost · Schedule ·
   Rules · Scenarios · Risks & permits · Approvals · Delivery · Baseline · History. Once approved the build lives in Delivery as PRJ-n. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Chip, KV, Menu, Panel, type MenuItem } from '../../ui/kit';
import { SummaryStrip } from '../site/SummaryStrip';
import { DcLink } from '../../ui/status';
import * as G from '../../planner/lib/governance';
import { blockers } from '../../planner/lib/wizardModel';
import { closeoutChecks, closeoutReady } from '../../planner/lib/closeout';
import { STEP_LABEL } from '../../planner/lib/execute';
import { useEstate, usePlan, usePlanEvaluation, usePlannerActions, useTemplates } from '../../planner/lib/usePlanner';
import { message } from '../../planner/compat/notify';
import { NotFound } from '../NotFound';
import { getDeliveryProject, useQuery } from '../../api';
import { PlanStatusChip, PlannerToasts, ReasonModal, SCOPE_LABEL, SelectInput, date, kw, money, num, pct, type ReasonRequest } from './common';
import { BaselineTab, CapacityTab, CostTab, DeliveryTab, HistoryTab, OverviewTab, RulesTab, ScheduleTab, SizingTab } from './plan/tabs';
import { ApprovalsTab, DecideModal } from './plan/Approvals';
import { ScenarioPanel } from './wizard/Scenarios';
import { useSchedule } from './plan/schedule';
import { PlanTabs } from './plan/tabbar';
import { PermitsEditor, RisksEditor } from './wizard/DimensionStep';
import { PackDeliverables, PlanPack } from './pack/PlanPack';
import { projectOf, projectUrl } from './pack/records';
import { uiFor, type PlanViewProps } from './scopes/registry';
import './scopes/all';
import '../../styles/planning.css';
import '../../styles/planning-plan.css';

/** Built-in tabs; a family adds its own (`uiFor(scope).detailTabs`, keyed by the tab's key). */
type Tab = 'overview' | 'pack' | 'sizing' | 'capacity' | 'cost' | 'schedule' | 'rules' | 'scenarios' | 'risks' | 'approvals' | 'delivery' | 'baseline' | 'history' | (string & {});

export function PlanPage() {
  const { planId = '' } = useParams();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const plan = usePlan(planId);
  const evaluation = usePlanEvaluation(plan);
  const templates = useTemplates();
  const estate = useEstate();
  const actions = usePlannerActions();
  const [viewKey, setViewKey] = useState<string | undefined>();
  const [deciding, setDeciding] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [ask, setAsk] = useState<ReasonRequest | null>(null);
  const want = (sp.get('tab') as Tab) || 'overview';
  const setTab = (t: Tab) => { const n = new URLSearchParams(sp); t === 'overview' ? n.delete('tab') : n.set('tab', t); if (t !== 'pack') n.delete('sec'); setSp(n, { replace: true }); };
  // Delivery holds the build once the plan is approved (PRJ-n = PLN-n); re-read when the plan moves.
  const { data: delivery } = useQuery(() => (plan && ['Approved', 'Executing', 'Completed'].includes(plan.status) ? getDeliveryProject(projectOf(plan)) : Promise.resolve(null)), [plan?.id, plan?.status, plan?.updatedAt]);
  const dcIds = useMemo(() => new Set(estate.dataCenters.map(d => d.id)), [estate.dataCenters]);
  usePage([{ label: 'Plan & Build' }, { label: 'Planner', to: '/planning' }, { label: 'Plans', to: '/planning?tab=plans' }, { label: planId }], plan?.dataCenterId ? { dcId: plan.dataCenterId } : {});
  const effectiveKey = useMemo(() => { const want = viewKey ?? plan?.approvedScenarioId ?? plan?.reviewScenarioId ?? plan?.preferredScenarioId ?? 'base'; return want !== 'base' && !evaluation.scenarios.some(s => s.scenario.id === want) ? 'base' : want; }, [viewKey, plan, evaluation.scenarios]);
  // the schedule with Delivery's purchase orders over it (counts in the strip and the tab badge match the Schedule tab)
  const sched = useSchedule(plan, (effectiveKey === 'base' ? evaluation.base : evaluation.scenarios.find(x => x.scenario.id === effectiveKey)?.ev ?? evaluation.base) ?? undefined);
  const lateN = sched.filter(x => x.late).length;
  const checks = useMemo(() => (plan && plan.status === 'Executing' ? closeoutChecks(plan, evaluation.data, templates.find(t => t.id === plan.templateId)) : []), [plan, evaluation.data, templates]);
  if (!plan) return templates.length ? <NotFound what="Plan" /> : <Loading />;
  if (!evaluation.base) return <Loading />;
  const sel = effectiveKey === 'base' ? null : evaluation.scenarios.find(s => s.scenario.id === effectiveKey) ?? null;
  const ev = sel?.ev ?? evaluation.base;
  const template = ev.resolved?.template ?? templates.find(t => t.id === plan.templateId);
  const site = estate.dataCenters.find(d => d.id === plan.dataCenterId);
  const campus = estate.campuses.find(c => c.id === plan.campusId);
  const where = site ? site.name : plan.newSiteName ? `${plan.newSiteName}${campus ? ` · ${campus.name}` : ''}` : campus?.name ?? estate.regions.find(r => r.id === plan.regionId)?.name ?? '—';
  const s = plan.status;
  const next = G.nextPendingStep(plan);
  const editable = G.isEditable(plan);
  const lock = G.lockReason(plan);
  const drift = G.templateDrift(plan, template);
  const blocking = G.openBlockingConditions(plan);
  const partial = s === 'Approved' && !!plan.artefacts?.executionId && !plan.artefacts.completedAt;
  const preferred = evaluation.scenarios.find(x => x.scenario.id === plan.preferredScenarioId);
  const submitEv = preferred?.ev ?? evaluation.base;
  const submitBlockers = blockers(plan, submitEv, template, evaluation.data).filter(b => b.level === 'bad');
  const ready = closeoutReady(checks);
  const scopeTabs = uiFor(plan.scope).detailTabs ?? [];
  const vp: PlanViewProps = { plan, ev, data: evaluation.data, template, benchmarks: evaluation.benchmarks };
  const prj = projectOf(plan);
  const cloneAsScenario = () => {
    const src = sel?.scenario;
    const rec = actions.createScenario(plan.id, src ? `${src.name} (copy)` : `Scenario ${String.fromCharCode(65 + evaluation.scenarios.length)}`, src ? src.description : 'Copy of the base case; change the overrides to explore an alternative.', { ...(src?.overrides ?? {}) });
    if (src?.phaseOverrides?.length) actions.updateScenario(rec.id, { phaseOverrides: src.phaseOverrides });
    setViewKey(rec.id); setTab('scenarios'); message.success(`Scenario ${rec.name} created${src ? ` from ${src.name}` : ' from the base case'}`);
  };
  const execute = async () => {
    setExecuting(true);
    try {
      const res = await actions.execute(plan, actions.sourcing(), evaluation.data, evaluation.scenarios.map(x => x.scenario));
      for (const w of res.warnings) message.warning(w);
      if (!res.ok) { message.error(`Execution stopped at ${res.errors.map(e => STEP_LABEL[e.step] ?? e.step).join(', ')}: ${res.errors.map(e => e.message).join('; ')}. Finished steps are kept; fix the cause and resume.`); return; }
      message.success(`Build started: ${res.artefacts.programId ? `programme ${res.artefacts.programId}, ` : ''}bill of materials, ${res.artefacts.purchaseOrderIds.length} purchase orders, ${res.artefacts.permitIds.length} permits; capacity holds committed. The plan is now in Delivery.`);
      setTab('delivery');
    } catch (e) { message.error((e as Error).message); } finally { setExecuting(false); }
  };
  const submit = () => { const r = actions.submitForReview(plan, { ev: submitEv, scenario: preferred?.scenario ?? null }); if (r.ok) message.success(`Submitted for review. ${r.notes?.[0] ?? ''}`); };
  const primary: MenuItem | undefined =
    editable ? { label: s === 'Rejected' ? 'Resubmit for review' : 'Submit for review', icon: I.Send, disabled: submitBlockers.length > 0, onClick: submit }
    : s === 'In review' && next ? { label: `Decide: ${next.step}`, icon: I.ClipboardCheck, onClick: () => setDeciding(true) }
    : s === 'Approved' && !plan.supersededBy ? { label: executing ? 'Creating…' : partial ? 'Resume execution' : 'Start the build', icon: I.Rocket, disabled: executing || blocking.length > 0, onClick: () => void execute() }
    : s === 'Executing' ? { label: 'Complete plan', icon: I.CheckCircle2, disabled: !ready, onClick: () => setAsk({ title: 'Complete the plan', description: 'Every close-out check is green: what was delivered is recorded against the baseline and the capacity holds are consumed.', okText: 'Complete', needsReason: false, onOk: notes => { if (actions.complete(plan, evaluation.data, notes || undefined).ok) message.success('Plan completed'); } }) }
    : s === 'On hold' ? { label: 'Resume plan', icon: I.Play, onClick: () => { if (actions.resume(plan).ok) message.success('Plan resumed'); } }
    : undefined;
  const secondary: MenuItem[] = [
    ...(delivery ? [{ label: `Open programme (${prj})`, icon: I.FolderKanban, onClick: () => nav(projectUrl(plan)) }] : []),
    { label: editable ? 'Edit in wizard' : 'View in wizard', icon: editable ? I.Pencil : I.Eye, onClick: () => nav(`/planning/plans/${plan.id}/edit`) },
    ...(editable ? [{ label: 'Clone as scenario base', icon: I.FlaskConical, onClick: cloneAsScenario }] : []),
    ...(s === 'In review' ? [{ label: 'Withdraw from review', icon: I.Undo2, onClick: () => setAsk({ title: 'Withdraw from review', description: 'The plan goes back to Draft; this round is kept in the history as withdrawn.', okText: 'Withdraw', needsReason: true, onOk: r => { if (actions.withdraw(plan, r).ok) message.success('Withdrawn to Draft'); } }) }] : []),
    ...((s === 'Approved' || s === 'Executing') && !plan.supersededBy ? [{ label: 'Raise a revision', icon: I.GitBranch, onClick: () => { const r = actions.raiseRevision(plan); if (r.ok && r.value) { message.success(`Revision ${r.value.revision} created as a draft`); nav(`/planning/plans/${r.value.id}/edit`); } } }] : []),
    ...(['In review', 'Approved', 'Executing'].includes(s) ? [{ label: 'Put on hold', icon: I.Pause, onClick: () => setAsk({ title: 'Put the plan on hold', description: 'Nothing is decided or built while the plan is on hold; capacity holds stay in place.', okText: 'Put on hold', needsReason: true, onOk: r => { if (actions.hold(plan, r).ok) message.success('Plan on hold'); } }) }] : []),
    ...(!['Draft', 'Completed', 'Cancelled'].includes(s) ? [{ label: 'Cancel plan', icon: I.Ban, danger: true, sep: true, onClick: () => setAsk({ title: `Cancel ${plan.plnId}`, description: 'The plan is cancelled and kept read-only; its capacity holds are released.', okText: 'Cancel the plan', danger: true, needsReason: true, onOk: r => { if (actions.cancel(plan, r).ok) message.success('Plan cancelled'); } }) }] : []),
    ...(G.canDelete(plan) ? [{ label: 'Delete draft', icon: I.Trash2, danger: true, sep: true, onClick: () => setAsk({ title: `Delete ${plan.plnId}?`, description: 'The draft is removed from the planner; it stays in the audit trail.', okText: 'Delete', danger: true, needsReason: false, onOk: () => { if (actions.deletePlan(plan).ok) nav('/planning?tab=plans'); } }) }] : []),
  ];
  const hasDelivery = !!plan.artefacts?.executionId || s === 'Executing' || s === 'Completed';
  const badge = (b: number | string | undefined) => (typeof b === 'number' ? (b > 0 ? b : undefined) : b || undefined) as number | undefined;
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' }, { id: 'pack', label: 'Plan pack' }, ...scopeTabs.map(t => ({ id: t.key as Tab, label: t.label, count: badge(t.badge?.(vp)) })), { id: 'sizing', label: 'Sizing' }, { id: 'capacity', label: 'Capacity' }, { id: 'cost', label: 'Cost' },
    { id: 'schedule', label: 'Schedule', count: lateN || undefined }, { id: 'rules', label: 'Rules', count: ev.hardFails + ev.softWarns || undefined },
    { id: 'scenarios', label: 'Scenarios', count: evaluation.scenarios.length || undefined }, { id: 'risks', label: 'Risks & permits', count: plan.risks.length + plan.permits.length || undefined },
    { id: 'approvals', label: 'Approvals', count: plan.approvals.filter(a => a.decision === 'Pending').length || undefined },
    ...(hasDelivery ? [{ id: 'delivery' as Tab, label: 'Delivery' }] : []), ...(plan.baseline && !hasDelivery ? [{ id: 'baseline' as Tab, label: 'Baseline' }] : []), { id: 'history', label: 'History' },
  ];
  // once the build is in Delivery the frozen baseline is read beside it (one tab less on the busiest plans)
  const asked: Tab = want === 'baseline' && hasDelivery ? 'delivery' : want;
  const tab: Tab = tabs.some(t => t.id === asked) ? asked : 'overview';
  const tp = { plan, ev, template, data: evaluation.data, benchmarks: evaluation.benchmarks };
  return (
    <div className="page planning">
      <PageHead title={plan.title} chips={<><PlanStatusChip s={s} />{plan.revision && plan.revision !== 'A' && <Chip tone="neutral">Rev {plan.revision}</Chip>}{plan.supersededBy && <Chip tone="neutral">Superseded</Chip>}</>}
        sub={<><span className="mono">{plan.plnId}</span> · {SCOPE_LABEL[plan.scope]} · {site ? <DcLink id={site.id}>{where}</DcLink> : where} · {template?.name ?? plan.templateId}{template ? ` v${template.version}` : ''} · requested by {plan.requestedBy} · updated {date(plan.updatedAt)}</>}
        actions={<>{primary && <Btn variant="filled" icon={primary.icon} disabled={primary.disabled} title={primary.disabled && editable ? `${submitBlockers.length} item(s) block submission` : primary.disabled && s === 'Executing' ? `Not ready: ${checks.filter(c => !c.ok).map(c => c.label).join(', ')}` : undefined} onClick={primary.onClick}>{primary.label}</Btn>}<Menu items={secondary} trigger={open => <Btn icon={I.MoreHorizontal} onClick={open}>Actions</Btn>} /></>} />
      {lock && <p className={`note ${s === 'Cancelled' || s === 'On hold' ? 'note--warn' : 'note--info'}`}><I.Lock size={15} /><span>{lock}{s === 'On hold' && plan.holdReason ? ` Reason: ${plan.holdReason} (${plan.heldBy ?? ''}, ${date(plan.heldAt)}).` : ''}{s === 'Cancelled' && plan.cancelReason ? ` Reason: ${plan.cancelReason}.` : ''}</span></p>}
      {plan.revisionOf && <p className="note note--info"><I.GitBranch size={15} /><span>Revision {plan.revision} of <button type="button" className="ent-link mono" onClick={() => nav(`/planning/plans/${plan.revisionOf}`)}>{plan.revisionOf}</button>: when approved it supersedes the parent and takes over its delivery records.</span></p>}
      {drift && <p className="note note--warn"><I.TriangleAlert size={15} /><span>Template changed since approval: v{drift.from} → v{drift.to}. The approved figures stay on v{drift.from}; raise a revision to adopt the new template.</span></p>}
      {blocking.length > 0 && (s === 'Approved' || s === 'Executing') && <p className="note note--warn"><I.TriangleAlert size={15} /><span>{blocking.length} approval condition{blocking.length === 1 ? '' : 's'} block the build: {blocking.map(c => `${c.text} (owner ${c.owner}${c.dueDate ? `, due ${date(c.dueDate)}` : ''})`).join('; ')}. Close them on the Approvals tab.</span></p>}
      {partial && <Panel title="Execution stopped part-way" icon={I.OctagonAlert}><div className="row wrap" style={{ gap: 6 }}>{Object.entries(plan.artefacts?.steps ?? {}).map(([k, st]) => <Chip key={k} tone={st === 'done' ? 'success' : st === 'failed' ? 'error' : 'neutral'} size="xs">{STEP_LABEL[k] ?? k}: {st}</Chip>)}</div>{(plan.artefacts?.errors ?? []).map((e, i) => <p key={i} className="note note--bad" style={{ marginTop: 8 }}><I.OctagonAlert size={15} /><span>{STEP_LABEL[e.step] ?? e.step}: {e.message}</span></p>)}</Panel>}
      {delivery && <p className="note note--info"><I.FolderKanban size={15} /><span>In Delivery as <Link className="ent-link mono" to={projectUrl(plan)}>{prj}</Link> ({delivery.project.state.toLowerCase()}, {delivery.project.health}):{' '}
        <Link className="ent-link" to={projectUrl(plan, 'workorders')}>{delivery.workOrders.length} work order{delivery.workOrders.length === 1 ? '' : 's'}</Link>{delivery.workOrders[0] && <> with change requests (<Link className="ent-link mono" to={`/changes/${delivery.workOrders[0].changeId}`}>{delivery.workOrders[0].changeId}</Link>{delivery.workOrders.length > 1 ? ` and ${delivery.workOrders.length - 1} more` : ''})</>},{' '}
        <Link className="ent-link" to={projectUrl(plan, 'procurement')}>{delivery.pos.length} purchase order{delivery.pos.length === 1 ? '' : 's'}</Link>,{' '}
        <Link className="ent-link" to={projectUrl(plan, 'permits')}>{delivery.permits.length} permit{delivery.permits.length === 1 ? '' : 's'} and {delivery.docs.length} design document{delivery.docs.length === 1 ? '' : 's'}</Link>.
        {' '}<button type="button" className="ent-link" style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }} onClick={() => setTab('pack')}>Everything the plan creates</button></span></p>}
      <div className="pn-sumstrip"><SummaryStrip items={[
        { key: 'kw', label: 'IT capacity', value: kw(ev.sizing.itKw), sub: ev.sizing.racks ? `${num(ev.sizing.racks)} racks${ev.sizing.halls ? ` · ${ev.sizing.halls} hall${ev.sizing.halls === 1 ? '' : 's'}` : ''}` : ev.estimate.capacityEnabledKw ? `${kw(ev.estimate.capacityEnabledKw)} made usable` : 'no new racks', onClick: () => setTab('sizing'), info: 'Design IT power and the racks and halls it takes at the chosen density; click for the sizing.' },
        { key: 'capex', label: 'CapEx', value: money(plan.baseline?.capexTotal ?? ev.estimate.capexTotal), sub: plan.baseline ? 'approved baseline' : `${money(ev.estimate.capexPerKw)} per kW`, onClick: () => setTab('cost'), info: 'Plant and fit-out from benchmarks or the bill of materials, plus owned IT; the baseline once approved.' },
        { key: 'opex', label: 'OpEx / month', value: money(ev.estimate.opexMonthly), sub: `PUE ${ev.sizing.pue.value}`, onClick: () => setTab('cost'), info: 'Energy at the PUE, maintenance, staff and leases per month.' },
        { key: 'pay', label: 'Payback', value: ev.estimate.paybackMonths == null ? '—' : `${ev.estimate.paybackMonths} mo`, sub: ev.estimate.npvUsd !== undefined ? `NPV ${money(ev.estimate.npvUsd)}` : 'no cash flow', tone: ev.estimate.paybackMonths == null || ev.estimate.paybackMonths > 96 ? 'warn' : undefined, onClick: () => setTab('cost'), info: 'Months from the first spend until the cumulative cash flow turns positive.' },
        { key: 'rules', label: 'Rules', value: ev.hardFails ? `${ev.hardFails} fail` : ev.softWarns ? `${ev.softWarns} warn` : 'Pass', sub: `${ev.findings.length} checked`, tone: ev.hardFails ? 'bad' : ev.softWarns ? 'warn' : undefined, onClick: () => setTab('rules'), info: 'Hard rules must pass before submission; soft rules are acknowledged in the review.' },
        { key: 'ready', label: 'Readiness', value: pct(ev.readinessPct), sub: ev.defaultsCount ? `${ev.defaultsCount} on defaults` : 'inputs confirmed', tone: ev.readinessPct < 50 ? 'warn' : undefined, onClick: () => setTab('overview'), info: 'Share of inputs confirmed by the planner, the requirements, a benchmark, an actual or a document.' },
        { key: 'go', label: 'Needed by', value: date(plan.targetGoLive), sub: lateN ? `${lateN} late item${lateN === 1 ? '' : 's'}` : 'orders on time', tone: lateN ? 'bad' : undefined, onClick: () => setTab('schedule'), info: 'The date the capacity is needed; late items cannot arrive by then at their lead time.' },
      ]} /></div>
      {evaluation.scenarios.length > 0 && <div className="row" style={{ gap: 8 }}><span className="vw-label">Showing</span><SelectInput value={effectiveKey} options={[{ id: 'base', label: 'Base case' }, ...evaluation.scenarios.map(x => ({ id: x.scenario.id, label: `${x.scenario.name}${[x.scenario.id === plan.preferredScenarioId ? 'preferred' : '', x.scenario.id === plan.approvedScenarioId ? 'approved' : ''].filter(Boolean).length ? ` (${[x.scenario.id === plan.preferredScenarioId ? 'preferred' : '', x.scenario.id === plan.approvedScenarioId ? 'approved' : ''].filter(Boolean).join(', ')})` : ''}` }))]} onChange={setViewKey} style={{ height: 32, width: 'auto' }} /></div>}
      <PlanTabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'overview' && <OverviewTab {...tp} deliverables={<PackDeliverables plan={plan} ev={ev} template={template} benchmarks={evaluation.benchmarks} siteName={site?.name ?? plan.newSiteName ?? campus?.name ?? 'New site'} dcIds={dcIds} delivery={delivery} />} />}
      {tab === 'pack' && <PlanPack plan={plan} ev={ev} template={template} benchmarks={evaluation.benchmarks} data={evaluation.data} siteName={site?.name ?? plan.newSiteName ?? campus?.name ?? 'New site'} dcIds={dcIds} delivery={delivery} />}
      {scopeTabs.filter(t => t.key === tab).map(t => <div key={t.key} className="col" style={{ gap: 14 }}>{t.render(vp)}</div>)}
      {tab === 'sizing' && <SizingTab {...tp} />}
      {tab === 'capacity' && <CapacityTab {...tp} />}
      {tab === 'cost' && <CostTab {...tp} />}
      {tab === 'schedule' && <ScheduleTab {...tp} />}
      {tab === 'rules' && <RulesTab {...tp} />}
      {tab === 'scenarios' && <Panel title="Scenarios" icon={I.FlaskConical} info="What-if options against the base case; the preferred one is what approvers see and, once approved, the frozen baseline."><ScenarioPanel plan={plan} base={evaluation.base} scenarios={evaluation.scenarios} templates={templates} actions={actions} editable={editable} /></Panel>}
      {tab === 'risks' && <Panel title="Risks and permits" icon={I.Stamp} info="The risk register and the permits stay editable through delivery (the only fields that do once a plan is approved)."><PermitsEditor permits={plan.permits} target={plan.targetGoLive} readOnly={['Completed', 'Cancelled'].includes(s)} onChange={permits => actions.patchPlan(plan.id, { permits })} /><RisksEditor risks={plan.risks} owner={plan.ownerName} readOnly={['Completed', 'Cancelled'].includes(s)} onChange={risks => actions.patchPlan(plan.id, { risks })} /></Panel>}
      {tab === 'approvals' && <ApprovalsTab plan={plan} actions={actions} onDecide={() => setDeciding(true)} />}
      {tab === 'delivery' && <DeliveryTab {...tp} />}
      {tab === 'delivery' && plan.baseline && <><h3 className="pn-section-h"><I.Lock size={16} />Baseline frozen at approval</h3><BaselineTab {...tp} /></>}
      {tab === 'baseline' && <BaselineTab {...tp} />}
      {tab === 'history' && <HistoryTab {...tp} />}
      {tab === 'overview' && site && <Panel title="Where" icon={I.Building2}><KV cols={4} items={[['Site', <DcLink id={site.id}>{site.name}</DcLink>], ['Campus', campus?.name ?? '—'], ['Site type', template?.dcTypeKey ?? plan.dcTypeKey], ['Climate', plan.climate]]} /></Panel>}
      {deciding && <DecideModal plan={plan} review={evaluation.review} data={evaluation.data} actions={actions} onClose={changed => { setDeciding(false); if (changed) message.success('Decision recorded'); }} />}
      <ReasonModal req={ask} onClose={() => setAsk(null)} />
      <PlannerToasts />
    </div>
  );
}
