/* What buildReviewDoc needs for a plan, gathered once for every caller (the reviewer page, Send for review, the Plan pack downloads):
   the plan, the evaluation of the scenario under review (else the approved one, else the preferred one, else the base case), template,
   benchmarks, platform data, the site name, sourcing, the recorded orders, the Delivery project and its purchase orders, every plan
   (revision chain), who generates it. No builder import here, so a caller can load the builder only when it needs the document. */
import { useMemo } from 'react';
import type * as T from '../../../../planner/p2b/types';
import { getDeliveryProject, useQuery } from '../../../../api';
import { sourcingReady } from '../../../../planner/lib/packModel';
import { useDelivery, useEstate, usePlanEvaluation, usePlans, useRecordedOrders, useSourcingContext } from '../../../../planner/lib/usePlanner';
import { useAuth } from '../../../../planner/compat/auth';
import { clockMs } from '../../../../planner/compat/clock';
import { projectOf } from '../records';
import type { ReviewInput } from './build';

export function useReviewInput(plan: T.PlannerPlan | undefined) {
  const evaluation = usePlanEvaluation(plan);
  const estate = useEstate();
  const plans = usePlans();
  const ctx = useSourcingContext();
  const recorded = useRecordedOrders(plan);
  const handoff = useDelivery(plan?.plnId);
  const { user } = useAuth();
  const { data: delivery } = useQuery(() => (plan && ['Approved', 'Executing', 'Completed'].includes(plan.status) ? getDeliveryProject(projectOf(plan)) : Promise.resolve(null)), [plan?.id, plan?.status, plan?.updatedAt]);
  const site = estate.dataCenters.find(d => d.id === plan?.dataCenterId);
  const campus = estate.campuses.find(c => c.id === plan?.campusId);
  const siteName = site?.name ?? (plan?.newSiteName ? `${plan.newSiteName}${campus ? ` · ${campus.name}` : ''}` : undefined) ?? campus?.name ?? estate.regions.find(r => r.id === plan?.regionId)?.name ?? 'New site';
  // the figures a reviewer decides on: the scenario under review; once approved the approved one; before submission the preferred one
  const pick = plan && evaluation.base
    ? plan.status === 'In review' ? evaluation.review
      : plan.approvedScenarioId && evaluation.scenarios.some(s => s.scenario.id === plan.approvedScenarioId) ? evaluation.scenarios.find(s => s.scenario.id === plan.approvedScenarioId)
      : plan.preferredScenarioId && evaluation.scenarios.some(s => s.scenario.id === plan.preferredScenarioId) ? evaluation.scenarios.find(s => s.scenario.id === plan.preferredScenarioId)
      : { ev: evaluation.base, scenario: null }
    : undefined;
  const ev = pick?.ev;
  const scenario = pick?.scenario ?? null;
  const template = ev?.resolved?.template ?? evaluation.templates.find(t => t.id === plan?.templateId);
  const sourcing = sourcingReady(ctx) ? ctx : undefined;
  const generatedBy = user?.name;
  const input = useMemo<ReviewInput | undefined>(() => (plan && ev
    ? { plan, ev, template, benchmarks: evaluation.benchmarks, data: evaluation.data, siteName, sourcing, recorded, delivery: delivery ?? null, scheduleOrders: handoff?.purchaseOrders, scenario, plans, generatedBy, generatedAt: new Date(clockMs()).toISOString() }
    : undefined), [plan, ev, template, evaluation.benchmarks, evaluation.data, siteName, sourcing, recorded, delivery, handoff, scenario, plans, generatedBy]);
  return { input, siteName, template, evaluation, delivery: delivery ?? null };
}
