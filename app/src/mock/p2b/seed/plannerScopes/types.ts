/* What each family of plan types adds to the planner seed: inputs, rules, benchmarks and the
   scope data of its demo plans. seed/planner.ts merges these into the plan templates. */
import type * as T from '../../../../planner/p2b/types';
import type { Seed } from '../ctx';

export interface BenchmarkSeed { metric: string; label: string; category: T.PlannerBenchmark['category']; unit: string; value?: number; low?: number; high?: number; appliesTo?: T.PlannerBenchmark['appliesTo']; source: string; indicative?: boolean }
export interface ScopeSeed {
  /** Extra inputs per plan type (a key that already exists is replaced). */
  params?: Partial<Record<T.PlannerScope, T.PlannerParamDef[]>>;
  /** Core inputs that do not apply to a plan type. */
  exclude?: Partial<Record<T.PlannerScope, string[]>>;
  /** Rules added to plan types (shown in Templates → Rules, evaluated by the family's `check`). */
  rules?: { rule: T.PlannerRuleDef; scopes: T.PlannerScope[] }[];
  /** Core rule ids that do not apply to a plan type. */
  dropRules?: Partial<Record<T.PlannerScope, string[]>>;
  /** Aspect depth changes per plan type (e.g. commissioning 'summary' for network). */
  aspects?: Partial<Record<T.PlannerScope, Partial<Record<T.PlannerAspect, T.PlannerAspectDepth>>>>;
  /** Approval path per plan type (replaces the default). */
  approval?: Partial<Record<T.PlannerScope, string[]>>;
  /** Outputs listed on the plan template. */
  outputs?: Partial<Record<T.PlannerScope, string[]>>;
  benchmarks?: BenchmarkSeed[];
  /** Fill the family's scope data on the seeded plans (waves, paths, plant lines…) once the plans exist. */
  enrich?(S: Seed, plans: T.PlannerPlan[]): void;
}
