/* The planner's record store (P2B MockDB). It lives in the mock server, built from our estate plus the planner seed; the planner
   code reads and writes it through this handle, exactly as it did in P2B. */
import { plannerStore } from './registry';
import type { MockDB } from '../../mock/p2b/store';

export const db: MockDB = new Proxy({} as MockDB, {
  get(_, k) { const s = plannerStore() as unknown as Record<string | symbol, unknown>; const v = s[k]; return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(s) : v; },
});
export type { MockDB };
