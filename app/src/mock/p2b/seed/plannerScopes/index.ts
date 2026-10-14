import type * as T from '../../../../planner/p2b/types';
import type { ScopeSeed } from './types';
import { inSiteSeed } from './inSite';
import { plantSeed } from './plant';
import { networkSeed } from './network';
import { buildSeed } from './build';
import { replaceSeed } from './replace';
import { migrationSeed } from './migration';
import { coreSeed } from './core';

export const SCOPE_SEEDS: ScopeSeed[] = [coreSeed, inSiteSeed, plantSeed, networkSeed, buildSeed, replaceSeed, migrationSeed];
export const familyParams = (scope: T.PlannerScope) => SCOPE_SEEDS.flatMap(s => s.params?.[scope] ?? []);
export const familyExclude = (scope: T.PlannerScope) => SCOPE_SEEDS.flatMap(s => s.exclude?.[scope] ?? []);
export const familyRules = (scope: T.PlannerScope) => SCOPE_SEEDS.flatMap(s => (s.rules ?? []).filter(r => r.scopes.includes(scope)).map(r => r.rule));
export const familyDropRules = (scope: T.PlannerScope) => SCOPE_SEEDS.flatMap(s => s.dropRules?.[scope] ?? []);
export const familyAspects = (scope: T.PlannerScope) => Object.assign({}, ...SCOPE_SEEDS.map(s => s.aspects?.[scope] ?? {})) as Partial<Record<T.PlannerAspect, T.PlannerAspectDepth>>;
export const familyApproval = (scope: T.PlannerScope) => SCOPE_SEEDS.map(s => s.approval?.[scope]).find(Boolean);
export const familyOutputs = (scope: T.PlannerScope) => SCOPE_SEEDS.map(s => s.outputs?.[scope]).find(Boolean);
export type { ScopeSeed };
