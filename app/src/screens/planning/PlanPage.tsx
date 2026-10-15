/* Plan page (/planning/plans/:id). Cleaned up 15-Oct-2026 in the rhythm of the Delivery project page: one header (scope icon, title,
   status / revision chips, one line of facts, the primary action + Send for review + Actions), one calm status line (plan/header.tsx
   PlanStatusLine: state, what it waits on, its build in Delivery, an open review or revision), one hero strip (PlanHero: readiness or
   build ring + five figures), then the tabs with the figures picker (base case or a scenario) at the right of the row:
   Overview · Project plan (phases and dates, editable with live effect) · the family's own tabs (`uiFor(scope).detailTabs`) · Sizing ·
   Capacity · Cost · Risks & permits · Rules · Scenarios · Approvals · Plan pack · Delivery or Baseline · History.
   Every edit on the page goes through plan/edit/policy.ts `usePlanEdit` (in place / withdraw first / revision / read-only). */
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Chip, Drawer, Menu, type MenuItem } from '../../ui/kit';
import { DcLink } from '../../ui/status';
import * as G from '../../planner/lib/governance';
import { blockers } from '../../planner/lib/wizardModel';
import { closeoutChecks, closeoutReady } from '../../planner/lib/closeout';
import { STEP_LABEL } from '../../planner/lib/execute';
import { useEstate, usePlan, usePlanEvaluation, usePlannerActions, useTemplates } from '../../planner/lib/usePlanner';
import { message } from '../../planner/compat/notify';
import { NotFound } from '../NotFound';
import { getDeliveryProject, useQuery } from '../../api';
import { PlanStatusChip, PlannerToasts, ReasonModal, SCOPE_ICON, SCOPE_LABEL, type ReasonRequest } from './common';
import { BaselineTab, CapacityTab, CostTab, DeliveryTab, HistoryTab, RulesTab, SizingTab } from './plan/tabs';
import { PlanOverview } from './plan/overview';
import { ProjectPlanTab } from './plan/ProjectPlan';
import { PlanHero, PlanStatusLine } from './plan/header';
import { ApprovalsTab, DecideModal } from './plan/Approvals';
import { ScenarioPanel } from './wizard/Scenarios';
import { useSchedule } from './plan/schedule';
import { PlanTabs } from './plan/tabbar';
import { MaterialsTab } from './plan/Materials';
import { RisksPermits } from './plan/RisksPermits';
import { PackDeliverables, PlanPack } from './pack/PlanPack';
import { projectOf, projectUrl } from './pack/records';
import { uiFor, type PlanViewProps } from './scopes/registry';
import { SendForReview, reviewUrl } from './pack/review/lazy';
import { ReviewRequestsPanel } from './pack/review/ReviewRequests';
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
  const [deciding, setDeciding] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [sending, setSending] = useState(false);
  const [ask, setAsk] = useState<ReasonRequest | null>(null);
  /* Merged tabs (15-Oct-2026): Capacity is part of Design (id `sizing`), the Baseline is read in History, and Scenarios open on demand
     from the What-if button; the old `?tab=` ids still land in the right place. */
  const raw = (sp.get('tab') as Tab) || 'overview';
  const want: Tab = raw === 'capacity' ? 'sizing' : raw === 'baseline' ? 'history' : raw === 'scenarios' ? 'overview' : raw;
  const [whatIf, setWhatIf] = useState(raw === 'scenarios');
  const setTab = (t: Tab) => {
    if (t === 'scenarios') { setWhatIf(true); return; }
    const to: Tab = t === 'capacity' ? 'sizing' : t === 'baseline' ? 'history' : t;
    const n = new URLSearchParams(sp); to === 'overview' ? n.delete('tab') : n.set('tab', to); if (to !== 'pack') n.delete('sec'); setSp(n, { replace: true });
    if (t === 'capacity') requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('pn-capacity')?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
  };
  // Delivery holds the build once the plan is approved (PRJ-n = PLN-n); re-read when the plan moves.
  const { data: delivery } = useQuery(() => (plan && ['Approved', 'Executing', 'Completed'].includes(plan.status) ? getDeliveryProject(projectOf(plan)) : Promise.resolve(null)), [plan?.id, plan?.status, plan?.updatedAt]);
  const dcIds = useMemo(() => new Set(estate.dataCenters.map(d => d.id)), [estate.dataCenters]);
  usePage([{ label: 'Plan & Build' }, { label: 'Planner', to: '/planning' }, { label: 'Plans', to: '/planning?tab=plans' }, { label: planId }], plan?.dataCenterId ? { dcId: plan.dataCenterId } : {});
  const effectiveKey = useMemo(() => { const want = plan?.approvedScenarioId ?? plan?.reviewScenarioId ?? plan?.preferredScenarioId ?? 'base'; return want !== 'base' && !evaluation.scenarios.some(s => s.scenario.id === want) ? 'base' : want; }, [plan, evaluation.scenarios]);
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
    setTab('scenarios'); message.success(`Scenario ${rec.name} created${src ? ` from ${src.name}` : ' from the base case'}`);
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
    { label: 'Open the review page', icon: I.BookOpenCheck, onClick: () => nav(reviewUrl(plan.id)) },
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
  /* Tab order (15-Oct-2026 cleanup): the summary, the plan itself (project plan, the family's own design tabs, sizing, capacity, cost,
     materials, risks & permits), its checks (rules, scenarios), the decision (approvals), what it produces (plan pack, delivery / baseline)
     and the record (history). Editors from other files register here with one line each. */
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'schedule', label: 'Project plan', count: lateN || undefined },
    ...scopeTabs.map(t => ({ id: t.key as Tab, label: t.label, count: badge(t.badge?.(vp)) })),
    { id: 'sizing', label: 'Design' }, { id: 'cost', label: 'Cost' },
    { id: 'materials', label: 'Materials', count: ev.materials?.changes.length || undefined },
    { id: 'risks', label: 'Risks & permits' },
    { id: 'rules', label: 'Rules', count: ev.hardFails + ev.softWarns || undefined },
    { id: 'approvals', label: 'Approvals', count: plan.approvals.filter(a => a.decision === 'Pending').length || undefined },
    { id: 'pack', label: 'Plan pack' },
    ...(hasDelivery ? [{ id: 'delivery' as Tab, label: 'Delivery' }] : []),
    { id: 'history', label: 'History' },
  ];
  const tab: Tab = tabs.some(t => t.id === want) ? want : 'overview';
  const tp = { plan, ev, template, data: evaluation.data, benchmarks: evaluation.benchmarks };
  const siteName = site?.name ?? plan.newSiteName ?? campus?.name ?? 'New site';
  const Ico = SCOPE_ICON[plan.scope] ?? I.FileText;
  const go = (t: string) => setTab(t as Tab);
  return (
    <div className="page planning pn-page">
      <PageHead title={plan.title} icon={<span className="pn-icon"><Ico size={18} /></span>}
        chips={<><PlanStatusChip s={s} />{plan.revision && plan.revision !== 'A' && <Chip tone="neutral">Rev {plan.revision}</Chip>}{plan.supersededBy && <Chip tone="neutral">Superseded</Chip>}</>}
        sub={<><span className="mono">{plan.plnId}</span> · {SCOPE_LABEL[plan.scope]} · {site ? <DcLink id={site.id}>{where}</DcLink> : where} · owner {plan.ownerName}</>}
        actions={<>{primary && <Btn variant="filled" icon={primary.icon} disabled={primary.disabled} title={primary.disabled && editable ? `${submitBlockers.length} item(s) block submission` : primary.disabled && s === 'Executing' ? `Not ready: ${checks.filter(c => !c.ok).map(c => c.label).join(', ')}` : undefined} onClick={primary.onClick}>{primary.label}</Btn>}{!['Cancelled', 'Completed'].includes(s) && <Btn icon={I.Send} onClick={() => setSending(true)}>Send for review</Btn>}<Btn className="pn-whatif" icon={I.FlaskConical} title="What-if scenarios" onClick={() => setWhatIf(true)}><span className="pn-whatif-l">What-if</span>{evaluation.scenarios.length ? <span className="pn-whatif-n">{evaluation.scenarios.length}</span> : null}</Btn><Menu items={secondary} trigger={open => <Btn icon={I.MoreHorizontal} onClick={open}>Actions</Btn>} /></>} />
      <PlanStatusLine plan={plan} template={template} delivery={delivery} blockersN={submitBlockers.length} closeout={s === 'Executing' ? { done: checks.filter(c => c.ok).length, total: checks.length } : undefined} onTab={go} />
      {partial && <p className="note note--bad"><I.OctagonAlert size={15} /><span>Execution stopped part-way: {Object.entries(plan.artefacts?.steps ?? {}).map(([k, st]) => `${STEP_LABEL[k] ?? k} ${st}`).join(' · ')}.{(plan.artefacts?.errors ?? []).map(e => ` ${STEP_LABEL[e.step] ?? e.step}: ${e.message}.`).join('')} Finished steps are kept; Resume execution picks up from there.</span></p>}
      <PlanHero plan={plan} ev={ev} lateN={lateN} delivery={delivery} onTab={go} />
      <PlanTabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'overview' && <PlanOverview plan={plan} ev={ev} template={template} delivery={delivery} schedule={sched} submitBlockers={editable ? submitBlockers : []} onTab={go}
        where={<>{site ? <DcLink id={site.id}>{site.name}</DcLink> : where}{campus && site ? ` · ${campus.name}` : ''}</>}
        deliverables={<PackDeliverables plan={plan} ev={ev} template={template} benchmarks={evaluation.benchmarks} siteName={siteName} dcIds={dcIds} delivery={delivery} />} />}
      {tab === 'pack' && <PlanPack plan={plan} ev={ev} template={template} benchmarks={evaluation.benchmarks} data={evaluation.data} siteName={siteName} dcIds={dcIds} delivery={delivery} />}
      {scopeTabs.filter(t => t.key === tab).map(t => <div key={t.key} className="col" style={{ gap: 14 }}>{t.render(vp)}</div>)}
      {tab === 'sizing' && <SizingTab {...tp} />}
      {tab === 'sizing' && <><h3 className="pn-section-h" id="pn-capacity"><I.Gauge size={16} />Capacity</h3><CapacityTab {...tp} /></>}
      {tab === 'cost' && <CostTab {...tp} />}
      {tab === 'materials' && <MaterialsTab {...tp} />}
      {tab === 'schedule' && <ProjectPlanTab {...tp} overrides={sel?.scenario.overrides} />}
      {tab === 'rules' && <RulesTab {...tp} />}
      <Drawer open={whatIf} onClose={() => { setWhatIf(false); if (raw === 'scenarios') setTab('overview'); }} width={1080} title="What-if scenarios"
        sub="Options against the base case. The preferred one is what approvers see and, once approved, becomes the frozen baseline; the plan's figures follow it.">
        <ScenarioPanel plan={plan} base={evaluation.base} scenarios={evaluation.scenarios} templates={templates} actions={actions} editable={editable} />
      </Drawer>
      {tab === 'risks' && <RisksPermits plan={plan} />}
      {tab === 'approvals' && <ApprovalsTab plan={plan} actions={actions} onDecide={() => setDeciding(true)} />}
      {tab === 'approvals' && <ReviewRequestsPanel plan={plan} onSend={() => setSending(true)} />}
      {tab === 'delivery' && <DeliveryTab {...tp} />}
      {tab === 'delivery' && plan.baseline && <><h3 className="pn-section-h"><I.Lock size={16} />Baseline frozen at approval</h3><BaselineTab {...tp} /></>}
      {tab === 'history' && plan.baseline && !hasDelivery && <><h3 className="pn-section-h"><I.Lock size={16} />Baseline frozen at approval</h3><BaselineTab {...tp} /></>}
      {tab === 'history' && <HistoryTab {...tp} />}
      {deciding && <DecideModal plan={plan} review={evaluation.review} data={evaluation.data} actions={actions} onClose={changed => { setDeciding(false); if (changed) message.success('Decision recorded'); }} />}
      {sending && <SendForReview plan={plan} onClose={() => setSending(false)} />}
      <ReasonModal req={ask} onClose={() => setAsk(null)} />
      <PlannerToasts />
    </div>
  );
}
