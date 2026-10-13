/* Where the planner finds its record store. The mock server registers it at start-up (the planner code is also imported by the
   mock, so it must not import the API module itself: that would be an import cycle). A real backend would register a client here. */
import type { MockDB } from '../../mock/p2b/store';
let storeFn: (() => MockDB) | null = null;
let serialFn: () => number = () => 0;
const pending = new Set<() => void>();
let subscribeFn: ((f: () => void) => () => void) | null = null;
export function registerPlannerStore(r: { store: () => MockDB; serial: () => number; subscribe: (f: () => void) => () => void }) {
  storeFn = r.store; serialFn = r.serial; subscribeFn = r.subscribe;
  for (const f of pending) r.subscribe(f);
  pending.clear();
}
export const plannerStore = (): MockDB => { if (!storeFn) throw new Error('planner store not registered'); return storeFn(); };
export const plannerStoreSerial = () => serialFn();
export const onPlannerChange = (f: () => void): (() => void) => { if (subscribeFn) return subscribeFn(f); pending.add(f); return () => { pending.delete(f); }; };
