/* Non-component helpers shared by the family drawings (plant single-line, cut-in sequence, DCI paths, rack elevations, hall grid,
   liquid loops, wave plan): equipment states and their line styles, label helpers. Colours are the planner chart tokens. */
import { C } from '../charts/chartKit';
import { kw } from '../common';
import type { SheetKind } from '../../../planner/lib/packModel';

/** Sheet kinds drawn by the plan's family (familyDrawings.tsx), all full width. */
export const FAMILY_KINDS: SheetKind[] = ['plant-as-is', 'plant-to-be', 'cut-ins', 'dci-paths', 'dci-cutover', 'rack-elevation', 'hall-grid', 'hall-mep', 'liquid', 'waves'];

/** State of a piece of equipment on a drawing. */
export type EqState = 'existing' | 'new' | 'removed' | 'uprated' | 'isolated' | 'temp' | 'proposed';
export const EQ_STYLE: Record<EqState, { stroke: string; fill: string; dash?: string; tag?: string; label: string }> = {
  existing: { stroke: C.slateDark, fill: C.surface, label: 'Existing, in the records' },
  new: { stroke: C.emeraldDark, fill: C.surface, dash: '5 3', tag: 'NEW', label: 'New, added by this plan' },
  removed: { stroke: C.red, fill: C.surface, dash: '2 2', tag: 'REMOVED', label: 'Removed by this plan' },
  uprated: { stroke: C.amberDark, fill: C.surface, tag: 'UPRATED', label: 'Uprated by this plan' },
  isolated: { stroke: C.red, fill: C.surface, tag: 'ISOLATED', label: 'Isolated for the step' },
  temp: { stroke: C.amberDark, fill: C.surface, dash: '5 3', tag: 'TEMP', label: 'Temporary plant' },
  proposed: { stroke: C.emeraldDark, fill: C.surface, dash: '5 3', tag: 'PROPOSED', label: 'Proposed, not accepted yet' },
};

/** kW or MW for a label ("1.9 MW", "343 kW"). */
export const kwLabel = (n: number) => kw(Math.round(n));
/** MVA from kVA ("4.0 MVA"), or the kW figure when no kVA is recorded. */
export const mvaLabel = (kva: number | undefined, kwFallback: number) => (kva ? `${(kva / 1000).toFixed(1)} MVA` : kwLabel(kwFallback));
/** Rough width of a label (Poppins / Inter average glyph). */
export const tw = (s: string, fs = 10) => s.length * fs * 0.56;
/** Trim a label to fit a width at a font size. */
export const fit = (s: string, width: number, fs = 10) => { const n = Math.max(3, Math.floor(width / (fs * 0.56))); return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s; };
/** Date and time in UTC, short ("17 Jul 2027 22:00"). */
export const utc = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })} ${d.toISOString().slice(11, 16)}`;
};
export const dayShort = (t: number) => new Date(t).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const monShort = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
