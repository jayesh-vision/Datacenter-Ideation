/* UI pieces each family of plan types contributes (ported from P2B's components/scopes/types.ts). Anything a family does not give
   falls back to the generic UI: the wizard's generic result panel and site picker, the plan pack's generic sections, the plan page's
   generic tabs. */
import type { ReactNode } from 'react';
import type * as T from '../../../planner/p2b/types';
import type { DimensionKey } from '../../../planner/lib/dimensions';
import type { Evaluation } from '../../../planner/lib/engine';
import type { PlannerData } from '../../../planner/lib/plannerData';
import type { StepProps } from '../../../planner/lib/wizardModel';

export interface PlanViewProps { plan: T.PlannerPlan; ev: Evaluation; data: PlannerData; template?: T.PlannerTemplate; benchmarks: T.PlannerBenchmark[] }
export interface PackSection { key: string; label: string; count?: (p: PlanViewProps) => string; render: (p: PlanViewProps) => ReactNode }
export interface DetailTab { key: string; label: string; badge?: (p: PlanViewProps) => number | string | undefined; render: (p: PlanViewProps) => ReactNode }
export interface ScopeUi {
  /** Result panel per dimension step (replaces the generic panel for that dimension). */
  panels?: Partial<Record<DimensionKey, (p: StepProps) => ReactNode>>;
  /** Replaces the generic site picker on the Requirements step. */
  sitePicker?: (p: StepProps) => ReactNode;
  /** Extra blocks on the Requirements step, under the site. */
  requirements?: (p: StepProps) => ReactNode;
  /** Extra sections in the plan pack (after the generic ones). */
  packSections?: PackSection[];
  /** Extra tabs on the plan page (after Overview and Plan pack). */
  detailTabs?: DetailTab[];
}
