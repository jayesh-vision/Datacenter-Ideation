/* The few "realism" constants the P2B planner seed reads, set for our estate before each seed run (geography-dependent). */
import type * as T from '../../../planner/p2b/types';
import { CUSTOMER, type Person, type Seed } from './ctx';

/** Climate per campus key (P2B FRA, ASH …), filled from the datacenter each key lands on. */
export const CAMPUS_CLIMATE: Record<string, 'cold' | 'temperate' | 'hot-dry' | 'hot-humid'> = {};
/** Utility intake per side on the hero campus (kW): the hero site's AC feeds, A side. */
export let ASH_CAMPUS_INTAKE_KW = 40_000;
export function setRealism(climates: Record<string, 'cold' | 'temperate' | 'hot-dry' | 'hot-humid'>, heroIntakeKw: number) {
  for (const k of Object.keys(CAMPUS_CLIMATE)) delete CAMPUS_CLIMATE[k];
  Object.assign(CAMPUS_CLIMATE, climates);
  ASH_CAMPUS_INTAKE_KW = heroIntakeKw;
}
export function metaAt(S: Seed, ageDays: number, by?: Person): Omit<T.BaseEntity, 'id'> {
  return { customerId: CUSTOMER, createdAt: S.daysAgo(ageDays), updatedAt: S.daysAgo(Math.max(1, Math.round(ageDays / 5))), createdBy: by?.name ?? 'System Seed', createdById: by?.id ?? 'system', isDeleted: false };
}
