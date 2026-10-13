/* Scope model registry: the family model for each plan type. */
import type * as T from '../../p2b/types';
import { FAMILY_OF, type ScopeFamily, type ScopeModel } from './types';
import { inSiteModel } from './inSite';
import { plantModel } from './plant';
import { networkModel } from './network';
import { buildModel } from './build';
import { replaceModel } from './replace';
import { migrationModel } from './migration';

export const SCOPE_MODELS: Record<ScopeFamily, ScopeModel> = { 'in-site': inSiteModel, plant: plantModel, network: networkModel, build: buildModel, replace: replaceModel, migration: migrationModel };
export const modelFor = (scope: T.PlannerScope): ScopeModel => SCOPE_MODELS[FAMILY_OF[scope]];
export { FAMILY_OF };
export type * from './types';
