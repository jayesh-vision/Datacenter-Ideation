/* Planner notifications: the logic layer (usePlannerActions) reports refusals and results here; the planning screens show them
   with the app's toast (screens/planning/common.tsx PlannerToasts). */
export type NoteKind = 'success' | 'info' | 'warning' | 'error';
export interface Note { id: number; kind: NoteKind; text: string }
const subs = new Set<(n: Note) => void>();
let seq = 0;
export const notify = (kind: NoteKind, text: string) => { const n = { id: ++seq, kind, text }; subs.forEach(f => f(n)); };
export const onNotify = (f: (n: Note) => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const message = { success: (t: string) => notify('success', t), info: (t: string) => notify('info', t), warning: (t: string) => notify('warning', t), error: (t: string) => notify('error', t) };
