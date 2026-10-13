/* The slice of @tanstack/react-query the planner uses, over the planner store: a query re-runs when the collection named first in
   its key has changed (or on any change, for keys that name none) and when the store is rebuilt; invalidation is a no-op because
   every write already marks its collection. */
import { useMemo, useRef, useSyncExternalStore } from 'react';
import { onPlannerChange, plannerStoreSerial } from './registry';
import { db } from './db';

let tick = 0;
onPlannerChange(() => { tick++; });
const useTick = () => useSyncExternalStore(onPlannerChange, () => tick, () => tick);

export function useQuery<T>({ queryKey, queryFn, enabled = true }: { queryKey: unknown[]; queryFn: () => T; enabled?: boolean; staleTime?: number }): { data: T | undefined; isLoading: boolean } {
  const t = useTick();
  const entity = typeof queryKey[0] === 'string' ? (queryKey[0] as string) : '';
  const known = entity && db.entities().includes(entity);
  const k = `${plannerStoreSerial()}|${known ? db.version(entity) : `t${t}`}|${JSON.stringify(queryKey)}|${enabled}`;
  const memo = useRef<{ k: string; data: T | undefined } | null>(null);
  if (!memo.current || memo.current.k !== k) memo.current = { k, data: enabled ? queryFn() : undefined };
  return { data: memo.current.data, isLoading: false };
}

export function useQueryClient() {
  return useMemo(() => ({ invalidateQueries: (_: unknown) => { void _; }, setQueryData: () => undefined }), []);
}

export function useMutation<A, R>({ mutationFn, onSuccess }: { mutationFn: (a: A) => R | Promise<R>; onSuccess?: (r: R) => void }) {
  const ref = useRef(mutationFn); ref.current = mutationFn;
  return useMemo(() => {
    const run = async (a: A) => { const r = await ref.current(a); onSuccess?.(r); return r; };
    return { mutate: (a: A) => { void run(a); }, mutateAsync: run, isPending: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
