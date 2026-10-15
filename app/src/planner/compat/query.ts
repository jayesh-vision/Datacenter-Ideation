/* The slice of @tanstack/react-query the planner uses, over the planner store.
   - A query re-runs when the collection named first in its key has changed (every write marks its collection), when the store is
     rebuilt (persona / geography), and, for keys that name no collection (e.g. ['delivery', planId], read from Delivery), on any
     planner or Delivery change. Every mounted query subscribes, so a screen never shows a copy older than the store.
   - invalidateQueries({ queryKey: [k] }) forces the queries whose key starts with k to re-run when k is not a collection (a write to a
     collection already re-runs its queries, so invalidating one costs nothing); setQueryData(key, data) shows data for that key until its source changes.
   - useMutation tracks isPending while the mutation runs. */
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { onPlannerChange, plannerStoreSerial } from './registry';
import { db } from './db';

let tick = 0;
const local = new Set<() => void>();
const forced = new Map<string, number>();
const overrides = new Map<string, { at: string; data: unknown }>();
let queued = false;
const emit = () => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; tick++; local.forEach(f => f()); }); };
onPlannerChange(() => { tick++; local.forEach(f => f()); });
const subscribe = (f: () => void) => { local.add(f); return () => { local.delete(f); }; };
const useTick = () => useSyncExternalStore(subscribe, () => tick, () => tick);
const head = (key: readonly unknown[]) => (typeof key[0] === 'string' ? (key[0] as string) : '');
const keyOf = (key: readonly unknown[], t: number, enabled: boolean) => {
  const e = head(key);
  return `${plannerStoreSerial()}|${e && db.entities().includes(e) ? db.version(e) : `t${t}`}|f${forced.get(e) ?? 0}|${JSON.stringify(key)}|${enabled}`;
};

export function useQuery<T>({ queryKey, queryFn, enabled = true }: { queryKey: unknown[]; queryFn: () => T; enabled?: boolean; staleTime?: number }): { data: T | undefined; isLoading: boolean } {
  const t = useTick();
  const k = keyOf(queryKey, t, enabled);
  const memo = useRef<{ k: string; data: T | undefined } | null>(null);
  if (!memo.current || memo.current.k !== k) memo.current = { k, data: enabled ? queryFn() : undefined };
  const o = overrides.get(JSON.stringify(queryKey));
  return { data: o && o.at === k ? (o.data as T) : memo.current.data, isLoading: false };
}

export function useQueryClient() {
  return useMemo(() => ({
    invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
      const e = head(queryKey);
      for (const j of [...overrides.keys()]) if (j.startsWith(`[${JSON.stringify(e)}`)) overrides.delete(j);
      if (e && db.entities().includes(e)) return; // a write to the collection already re-runs its queries
      forced.set(e, (forced.get(e) ?? 0) + 1); emit();
    },
    /* shown until the key's source changes (the next write to its collection, or the next change for keys without one) */
    setQueryData: (queryKey: readonly unknown[], data: unknown) => { overrides.set(JSON.stringify(queryKey), { at: keyOf(queryKey, tick + 1, true), data }); emit(); },
  }), []);
}

export function useMutation<A, R>({ mutationFn, onSuccess }: { mutationFn: (a: A) => R | Promise<R>; onSuccess?: (r: R) => void }) {
  const fn = useRef(mutationFn); fn.current = mutationFn;
  const done = useRef(onSuccess); done.current = onSuccess;
  const [pending, setPending] = useState(0);
  const run = useCallback(async (a: A) => {
    setPending(n => n + 1);
    try { const r = await fn.current(a); done.current?.(r); return r; } finally { setPending(n => n - 1); }
  }, []);
  return useMemo(() => ({ mutate: (a: A) => { void run(a); }, mutateAsync: run, isPending: pending > 0 }), [run, pending]);
}
