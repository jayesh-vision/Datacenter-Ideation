/* Small figures of the plan page tabs: a compact tile strip (sub-line under the number, no empty detail box), a value with its source
   chip, a panel of template inputs with their sources. (The old CSS order bars and cash-flow bars were replaced by schedule.tsx,
   pack/drawings LeadTimes and charts/Cashflow.) */
import type { ReactNode } from 'react';
import * as I from 'lucide-react';
import { Panel } from '../../../ui/kit';
import { StatGrid } from '../../../ui/Analytics';
import type { Evaluation, ParamValue, Sourced } from '../../../planner/lib/engine';
import { SourceChip, fmtValue } from '../common';

/** StatGrid of compact tiles: the qualifier wraps under the number and the tile is only as tall as its content. */
export function TileStrip({ cols, children }: { cols: number; children: ReactNode }) {
  return <div className={`pn-tstrip is-${cols}`}><StatGrid cols={cols} fit>{children}</StatGrid></div>;
}

/** A derived value with the chip saying where it came from. */
export function SourcedValue({ s, unit }: { s?: Sourced<ParamValue>; unit?: string }) {
  if (!s) return <span className="vw-label">—</span>;
  return <span className="pn-sv"><span>{fmtValue(s.value, unit)}</span><SourceChip s={s.source} note={s.note} short /></span>;
}

/** The template inputs behind a figure, with their values and sources (only the ones the template defines). */
export function ParamPanel({ ev, keys, title, icon = I.SlidersHorizontal, info }: { ev: Evaluation; keys: string[]; title: string; icon?: I.LucideIcon; info?: string }) {
  const rows = keys.map(k => ({ k, def: ev.resolved?.params.find(p => p.key === k), s: ev.params[k] })).filter(r => r.def && r.s && r.s.value !== '' && r.s.value !== undefined);
  if (!rows.length) return null;
  return (
    <Panel title={title} icon={icon} count={rows.length} info={info ?? 'The inputs behind these figures: entered, from the requirements, a benchmark, an estate actual, or the template default.'}>
      <div className="pn-pvals">{rows.map(r => <div key={r.k}><span>{r.def?.label ?? r.k}</span><SourcedValue s={r.s} unit={r.def?.unit} /></div>)}</div>
    </Panel>
  );
}

