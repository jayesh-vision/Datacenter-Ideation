/* Which UI each family of plan types contributes. Each family registers its ScopeUi in its own folder (scopes/<family>/index.tsx)
   and is added here; the wizard, the plan pack and the plan page ask `uiFor(scope)` and fall back to the generic UI. */
import type * as T from '../../../planner/p2b/types';
import { FAMILY_OF, type ScopeFamily } from '../../../planner/lib/scopes/types';
import type { ScopeUi } from './types';

const UI: Partial<Record<ScopeFamily, ScopeUi>> = {};

export function registerScopeUi(family: ScopeFamily, ui: ScopeUi) { UI[family] = ui; }
export function uiFor(scope: T.PlannerScope | undefined): ScopeUi { return (scope && UI[FAMILY_OF[scope]]) || {}; }
export type { ScopeUi, PlanViewProps, PackSection, DetailTab } from './types';
