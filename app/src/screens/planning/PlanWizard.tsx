/* New plan / edit plan wizard (/planning/new, /planning/plans/:id/edit): the template fixes the steps — Plan type → Requirements →
   one step per area the template covers → Scenarios → Review and submit. Leaving Requirements fills every design input the planner
   has not set themselves ("Fill the design") and creates the draft; the live estimate on the right is re-evaluated on every change.
   A plan past review opens read-only. Logic: src/planner/lib (wizardModel, dimensions, engine, governance). */
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Chip, Panel } from '../../ui/kit';
import type * as T from '../../planner/p2b/types';
import { evaluate, type ParamValue } from '../../planner/lib/engine';
import { applyDerived, deriveFromRequirements, dimensionsFor } from '../../planner/lib/dimensions';
import { blockers, ensureSinglePhase, stepIssues, stepsFor, type StepKey, type StepProps } from '../../planner/lib/wizardModel';
import * as G from '../../planner/lib/governance';
import { newPlanDraft, useActuals, useBenchmarks, useDraftEvaluation, useEstate, usePlan, usePlannerActions, useScenarios, useTemplates } from '../../planner/lib/usePlanner';
import { usePlannerData } from '../../planner/lib/plannerData';
import { message } from '../../planner/compat/notify';
import { clockMs } from '../../planner/compat/clock';
import { PlanStatusChip, PlannerToasts } from './common';
import { RequirementsStep, TypeStep, StepHead } from './wizard/steps';
import { DimensionStep } from './wizard/DimensionStep';
import { ScenarioPanel } from './wizard/Scenarios';
import { LiveEstimate, ReviewStep } from './wizard/Review';
import '../../styles/planning.css';

/** keyed by plan so moving between /planning/new and an edit never carries one draft into another */
export function PlanWizard() {
  const { planId } = useParams();
  const [sp] = useSearchParams();
  return <Wizard key={`${planId ?? 'new'}:${sp.get('template') ?? ''}`} />;
}

function Wizard() {
  const { planId } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const actions = usePlannerActions();
  const existing = usePlan(planId);
  const templates = useTemplates(), benchmarks = useBenchmarks(), estate = useEstate(), data = usePlannerData();
  const [local, setLocal] = useState<T.PlannerPlan | null>(() => (planId ? null : newPlanDraft({ title: sp.get('title') ?? '', ...(sp.get('scope') ? { scope: sp.get('scope') as T.PlannerScope } : {}), ...(sp.get('template') ? { templateId: sp.get('template')! } : {}) }, { id: actions.actorId, name: actions.actor })));
  const [base, setBase] = useState<T.PlannerPlan | undefined>(undefined);
  if (planId && existing && (!base || (!local && existing.updatedAt !== base.updatedAt))) setBase(existing);
  const draft = local ?? existing;
  const saved = !!base;
  const readOnly = !!existing && !G.isEditable(existing);
  const template = useMemo(() => templates.find(t => t.id === draft?.templateId), [templates, draft?.templateId]);
  const steps = useMemo(() => stepsFor(template), [template]);
  const resumeIndex = existing ? Math.max(0, existing.wizardStepKey ? steps.findIndex(s => s.key === existing.wizardStepKey) : (existing.wizardStep ?? 1) - 1) : 0;
  const [stepState, setStepState] = useState<number | null>(planId ? null : 0);
  const step = Math.min(steps.length - 1, Math.max(0, stepState ?? resumeIndex));
  const [maxVisitedState, setMaxVisited] = useState<number | null>(planId ? null : 0);
  const maxVisited = Math.max(step, maxVisitedState ?? (planId ? steps.length - 1 : step));
  const actuals = useActuals(draft?.dcTypeKey);
  const ev = useDraftEvaluation(draft);
  const scenarios = useScenarios(draft?.id);
  const why = useMemo(() => (draft ? Object.fromEntries(deriveFromRequirements(draft, template, benchmarks).map(d => [d.key, d.why])) : {}), [draft, template, benchmarks]);
  const dirty = !readOnly && !!local && (base ? Object.keys(G.wizardPatch(base, local)).length > 0 : !!local.templateId);
  usePage([{ label: 'Plan & Build' }, { label: 'Planner', to: '/planning' }, { label: planId ? `${readOnly ? 'View' : 'Edit'} ${planId}` : 'New plan' }], draft?.dataCenterId ? { dcId: draft.dataCenterId } : {});

  const patch = useCallback((p: Partial<T.PlannerPlan>) => setLocal(d => ({ ...(d ?? existing!), ...p })), [existing]);
  const setParam = useCallback((key: string, value: ParamValue, source: T.PlannerParamSource = 'user') => setLocal(d => { const b = d ?? existing!; return { ...b, params: { ...b.params, [key]: value }, paramSources: { ...b.paramSources, [key]: source } }; }), [existing]);
  const resetParam = useCallback((key: string) => setLocal(d => { const b = d ?? existing!; const params = { ...b.params }, sources = { ...b.paramSources }; delete params[key]; delete sources[key]; return { ...b, params, paramSources: sources }; }), [existing]);
  const persist = useCallback((at?: number, from?: T.PlannerPlan): T.PlannerPlan | undefined => {
    const cur = from ?? draft!;
    if (readOnly) return undefined;
    const ownsPhases = steps.some(s => s.key === 'dim:delivery' || s.key === 'dim:migration') && !['rack', 'pod', 'plant', 'network'].includes(cur.scope);
    const phases = !ownsPhases || cur.phases.length === 0 ? ensureSinglePhase(cur, ev) : cur.phases;
    const idx = at ?? step;
    const res = actions.saveWizard(base, { ...cur, phases, wizardStep: idx + 1, wizardStepKey: steps[idx]?.key });
    if (!res.ok || !res.value) return undefined;
    setLocal(res.value); setBase(res.value);
    return res.value;
  }, [draft, readOnly, steps, ev, actions, step, base]);
  const goTo = useCallback((i: number) => { setStepState(i); setMaxVisited(m => Math.max(m ?? (planId ? steps.length - 1 : 0), i)); window.scrollTo({ top: 0 }); }, [planId, steps.length]);
  const goToKey = useCallback((key: StepKey) => { const i = steps.findIndex(s => s.key === key); if (i >= 0) goTo(i); }, [steps, goTo]);

  if (!draft) return <Loading />;
  const cur = steps[step];
  const isLast = step === steps.length - 1;
  const issues = readOnly ? [] : stepIssues(cur.key, draft, ev, templates, clockMs());
  const bad = isLast ? blockers(draft, ev, template, data).filter(b => b.level === 'bad').length : 0;
  const canSave = !readOnly && !!draft.templateId && !!draft.title.trim();
  const next = () => {
    if (step >= steps.length - 1) return;
    if (readOnly) { goTo(step + 1); return; }
    if (issues.length) { message.warning(issues[0].text); return; }
    const from = cur.key === 'requirements' ? applyDerived(draft, deriveFromRequirements(draft, template, benchmarks)) : draft;
    if (cur.key === 'type' && !saved) { if (from !== draft) setLocal(from); goTo(step + 1); return; }
    if (!persist(step + 1, from)) return;
    goTo(step + 1);
  };
  const saveExit = () => { if (!dirty) { nav('/planning'); return; } if (persist()) { message.success('Draft saved'); nav('/planning'); } };
  const submit = () => {
    const rec = persist(); if (!rec) return;
    const bad2 = blockers(rec, ev, template, data).filter(b => b.level === 'bad');
    if (bad2.length) { message.warning(`${bad2.length} item${bad2.length === 1 ? '' : 's'} block submission; see the checklist.`); return; }
    const scn = scenarios.find(s => s.id === rec.preferredScenarioId) ?? null;
    const reviewEv = scn ? evaluate(rec, scn, templates, benchmarks, actuals, data) : ev!;
    const r = actions.submitForReview(rec, { ev: reviewEv, scenario: scn });
    if (!r.ok) return;
    message.success(`Plan submitted for review. ${r.notes?.[0] ?? ''}`);
    nav(`/planning/plans/${rec.id}`);
  };
  const stepProps: StepProps = { draft, template, why, patch, setParam, resetParam, ev, templates, benchmarks, estate, actuals, actions, data, persist: () => persist() ?? draft, saved, goTo: goToKey, issues, readOnly };
  const dimUse = cur.key.startsWith('dim:') ? dimensionsFor(template).find(d => `dim:${d.dim.key}` === cur.key) : undefined;
  const lock = existing ? G.lockReason(existing) : undefined;
  const groups = [...new Set(steps.map(s => s.group))];

  return (
    <div className="page planning">
      <PageHead title={draft.title.trim() || 'New plan'} chips={<><PlanStatusChip s={draft.status} />{template && <Chip tone="neutral">{template.name}</Chip>}</>}
        sub={<><span className="mono">{draft.plnId}</span> · {cur.label} · step {step + 1} of {steps.length}{draft.revision ? ` · revision ${draft.revision}` : ''}{dirty ? ' · unsaved changes' : ''}</>}
        actions={readOnly ? <Btn icon={I.ArrowLeft} onClick={() => nav(`/planning/plans/${draft.id}`)}>Back to the plan</Btn> : <Btn icon={I.Save} disabled={!canSave} title={canSave ? undefined : 'Pick a plan type and give the plan a name first'} onClick={saveExit}>Save and exit</Btn>} />
      {lock && <p className="note note--info"><I.Lock size={15} /><span>{lock} The wizard shows the plan as it was submitted.</span></p>}
      <div className="pn-wiz">
        <Panel className="pn-steps" title="Steps" count={steps.length}>
          {groups.map(g => <div key={g}><h4>{g}</h4>{steps.map((s, i) => s.group === g && <button key={s.key} type="button" className={`pn-step${i === step ? ' is-on' : i < step || (i <= maxVisited && i !== step) ? ' is-done' : ''}`} disabled={i > maxVisited && !readOnly} onClick={() => goTo(i)} title={s.hint}><i>{i < step || (i < maxVisited && i !== step) ? '✓' : i + 1}</i><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span></button>)}</div>)}
        </Panel>
        <Panel>
          {cur.key === 'type' && <TypeStep {...stepProps} />}
          {cur.key === 'requirements' && <RequirementsStep {...stepProps} />}
          {dimUse && <DimensionStep {...stepProps} dim={dimUse.dim} depth={dimUse.depth} />}
          {cur.key === 'scenarios' && <>
            <StepHead title="Compare options" text="Scenarios change a few inputs against the base case; the preferred one is what approvers are shown. The plan is saved as a draft before a scenario is created." />
            {ev && <ScenarioPanel plan={draft} base={ev} scenarios={scenarios.map(s => ({ scenario: s, ev: evaluate(draft, s, templates, benchmarks, actuals, data) }))} templates={templates} actions={actions} editable={!readOnly} onCreateNeedsSave={() => persist()} />}
          </>}
          {cur.key === 'review' && <ReviewStep {...stepProps} />}
          <div className="pn-wiz-foot">
            <Btn icon={I.ArrowLeft} disabled={step === 0} onClick={() => goTo(step - 1)}>Back</Btn>
            <span className="row" style={{ gap: 8 }}>
              {issues.length > 0 && <span className="field-error">{issues[0].text}</span>}
              {!readOnly && !isLast && <Btn disabled={!canSave} onClick={() => { if (persist()) message.success('Draft saved'); }}>Save draft</Btn>}
              {!isLast && <Btn variant="filled" iconRight={I.ArrowRight} disabled={!readOnly && (issues.length > 0 || (cur.key === 'type' && !draft.templateId))} onClick={next}>{cur.key === 'requirements' && !readOnly ? 'Fill the design' : 'Next'}</Btn>}
              {isLast && !readOnly && <Btn variant="filled" icon={I.Send} disabled={bad > 0 || !canSave} title={bad ? `${bad} item(s) block submission` : undefined} onClick={submit}>{draft.status === 'Rejected' ? 'Resubmit for review' : 'Submit for review'}</Btn>}
              {isLast && readOnly && <Btn variant="filled" onClick={() => nav(`/planning/plans/${draft.id}`)}>Open the plan</Btn>}
            </span>
          </div>
        </Panel>
        <LiveEstimate draft={draft} ev={ev} />
      </div>
      <PlannerToasts />
    </div>
  );
}
