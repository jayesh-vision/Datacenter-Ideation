/* Non-component helpers of the in-site panels (rack, pod, hall, retrofit), kept out of .tsx files for fast refresh. */
import type * as T from '../../../../planner/p2b/types';
import type { Evaluation } from '../../../../planner/lib/engine';
import type { InSiteAnalysis, Shortfall } from '../../../../planner/lib/inSiteAnalysis';

/** The in-site analysis the engine attached to the evaluation (undefined for other plan types or before the first evaluation). */
export const analysisOf = (ev?: Evaluation): InSiteAnalysis | undefined => ev?.scope?.inSite as InSiteAnalysis | undefined;

/** Plain names of the in-site checks (the rule titles are longer). */
export const CHECK_LABEL: Record<string, string> = {
  'ins-u-block': 'Rack units', 'ins-rack-power': 'Rack power', 'ins-pdu': 'PDUs and outlets', 'ins-zone-cooling': 'Cooling zone', 'ins-weight': 'Weight',
  'ins-ports': 'Leaf ports', 'ins-ip': 'Addresses', 'ins-site-power': 'Site power chain', 'ins-positions': 'Positions', 'ins-hall-design': 'Hall design load',
  'ins-facility-water': 'Facility water', 'ins-dc-plant': 'AC or DC supply', 'ins-cdu': 'CDUs', 'ins-uprate': 'Power uprate', 'ins-waves': 'Waves',
  'ins-setpoint': 'Setpoint', 'ins-window': 'Change window', 'ins-containment': 'Containment', 'ins-spine-ports': 'Spine ports', 'liquid-above-density': 'Liquid above 30 kW',
};

/** Every in-site check, in the order the Site fit tab lists them. */
export const ALL_CHECKS = ['ins-site-power', 'ins-dc-plant', 'ins-positions', 'ins-hall-design', 'ins-u-block', 'ins-rack-power', 'ins-pdu', 'ins-uprate', 'ins-zone-cooling', 'ins-facility-water', 'ins-cdu', 'ins-setpoint', 'ins-weight', 'ins-ports', 'ins-spine-ports', 'ins-ip', 'ins-containment', 'ins-window', 'ins-waves'];

/** Wizard link for a linked plant (or expansion) plan with the shortfall as its intent. */
export function linkedPlanUrl(s: Shortfall, plan: T.PlannerPlan): string {
  const scope = s.expansion ? 'expansion' : 'plant';
  const q = new URLSearchParams({ scope, template: `TPL-PLAN-${scope}`, title: s.plantTitle, intent: `${s.plantIntent}. Linked to ${plan.plnId} (${plan.title}).` });
  if (!s.expansion && plan.dataCenterId) q.set('dc', plan.dataCenterId);
  return `/planning/new?${q.toString()}`;
}

/** Phases rescaled to a new total (one phase, or the same split as before). */
export function rescalePhases(draft: T.PlannerPlan, total: number, racks: number): T.PlannerPhase[] {
  if (draft.phases.length <= 1) return [{ id: draft.phases[0]?.id ?? 'PH-1', name: draft.phases[0]?.name ?? 'Go-live', goLive: draft.phases[0]?.goLive ?? draft.targetGoLive, itKw: total, racks, halls: 1, status: draft.phases[0]?.status ?? 'Planned' }];
  const old = draft.phases.reduce((s, p) => s + p.itKw, 0) || 1;
  let left = total; let leftRacks = racks;
  return draft.phases.map((p, i, all) => {
    const last = i === all.length - 1;
    const kw = last ? Math.round(left * 10) / 10 : Math.round(total * (p.itKw / old) * 10) / 10;
    const rk = last ? leftRacks : Math.round(racks * (p.itKw / old));
    left -= kw; leftRacks -= rk;
    return { ...p, itKw: kw, racks: rk };
  });
}
