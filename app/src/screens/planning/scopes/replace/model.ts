/* View helpers for the replace and migration families (no React components here): dates and windows as the screens show them, and
   applying the record changes a wave close, a certificate or a site retirement produces. */
import { useCallback } from 'react';
import type * as T from '../../../../planner/p2b/types';
import { db } from '../../../../planner/compat/db';
import { clockMs } from '../../../../planner/compat/clock';
import { nextId } from '../../../../planner/lib/execute';
import type { RecordChanges } from '../../../../planner/lib/replaceClose';
import { usePlannerActions } from '../../../../planner/lib/usePlanner';
import { date } from '../../common';

/** A wave window: the day in the geography's style and the UTC time. */
export const fmtWhen = (iso?: string) => (iso ? `${date(iso)} ${iso.slice(11, 16)} UTC` : '—');
export const toLocalInput = (iso?: string) => (iso ? iso.slice(0, 16) : '');
export const fromLocalInput = (v: string, hours: number) => { const s = new Date(`${v}:00Z`); return { start: s.toISOString(), end: new Date(s.getTime() + hours * 3600e3).toISOString() }; };
export const nowIso = () => new Date(clockMs()).toISOString();

/** Sequential ids for records a wave close creates. */
export const idFor = (entity: string, prefix: string) => nextId(entity, prefix);

/** Records outside the planner bundle that a close also updates (config changes, managed devices, acceptance tests). */
export function extraRecords() {
  const all = <X,>(e: string) => (db.entities().includes(e) ? (db.getAll(e, { pageSize: 100000 }).data as unknown as X[]) : []);
  return { configChanges: all<T.ConfigChange>('configChanges'), managedDevices: all<T.ManagedDevice>('managedDevices'), atps: all<T.Atp>('atps') };
}

/** Write a set of record changes (wave close, certificate, meter reading, site retirement) through the planner's audited
 *  `applyRecordChanges` action (allowed on executing and completed plans). */
export function useApplyChanges() {
  const actions = usePlannerActions();
  return useCallback((plan: T.PlannerPlan, changes: RecordChanges, what: string) => actions.applyRecordChanges(plan, changes, what), [actions]);
}
