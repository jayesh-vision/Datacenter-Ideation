/* Small building blocks of the wizard's result panels and the family panels (in-site, plant, network…): a row of figures with a
   qualifier and a tone, a scrolling table, a muted note, a grid of template inputs, a multi-pick. Styles: styles/planning-scopes.css. */
import { useMemo, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type * as T from '../../../planner/p2b/types';
import { paramDefsFor, type StepProps } from '../../../planner/lib/wizardModel';
import { ParamFields, ParamInput } from './ParamInput';
import { date } from '../common';
import '../../../styles/planning-scopes.css';
import '../../../styles/planning-pack.css';
import '../../../styles/planning-wizard.css';

export type TileTone = 'ok' | 'warn' | 'bad';
export interface TileItem { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: TileTone; title?: string }

/** A row of quiet figures: label, number, an optional qualifier; tone colours the number (and a top accent for warn / bad). */
export function Tiles({ items, cols = 4 }: { items: (TileItem | false | undefined | null)[]; cols?: 3 | 4 }) {
  return (
    <div className={`pn-figs is-${cols}`}>
      {items.filter((x): x is TileItem => !!x).map((t, i) => (
        <div key={i} className={`pn-fig${t.tone ? ` is-${t.tone}` : ''}`} title={t.title}>
          <span>{t.label}</span><b>{t.value}</b>{t.sub !== undefined && t.sub !== null && t.sub !== '' && <small>{t.sub}</small>}
        </div>
      ))}
    </div>
  );
}

/** A table that scrolls inside its own frame (headers stay put). `head` cells are plain labels. */
export function Tbl({ head, children, foot, maxHeight, empty, cols }: { head: ReactNode[]; children?: ReactNode; foot?: ReactNode; maxHeight?: number; empty?: ReactNode; cols?: number }) {
  const hasRows = Array.isArray(children) ? children.flat().some(Boolean) : !!children;
  return (
    <div className="pn-tbl" style={maxHeight ? { maxHeight } : undefined}>
      <table className="nst-table">
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{hasRows ? children : <tr><td colSpan={cols ?? head.length} className="vw-label">{empty ?? 'Nothing yet.'}</td></tr>}</tbody>
        {foot && <tfoot>{foot}</tfoot>}
      </table>
    </div>
  );
}

export const Note = ({ children }: { children: ReactNode }) => <p className="pn-note">{children}</p>;
export const ToneText = ({ tone, children }: { tone?: TileTone; children: ReactNode }) => <span className={tone ? `pn-${tone}` : undefined}>{children}</span>;

/** A date and time of a change window, in UTC. */
export const dateTime = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const asLocal = new Date(d.getTime() + d.getTimezoneOffset() * 60000); // local fields = UTC fields, so the day matches the UTC time
  return `${date(asLocal.toISOString())} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
};

/** Some of the template's inputs, shown inside a panel (inputs that only make sense for one sub-type are kept off the generic grid). */
export function ParamGrid({ keys, draft, ev, templates, setParam, resetParam, why, readOnly }: StepProps & { keys: string[] }) {
  const defs = useMemo(() => paramDefsFor(ev, templates, draft.dcTypeKey), [ev, templates, draft.dcTypeKey]);
  const list = keys.map(k => defs.get(k)).filter((d): d is T.PlannerParamDef => !!d);
  if (!list.length) return null;
  return <ParamFields>{list.map(d => <ParamInput key={d.key} def={d} ev={ev} draft={draft} setParam={setParam} resetParam={resetParam} why={why[d.key]} disabled={readOnly} />)}</ParamFields>;
}

/** Several values from a list: chips with a remove button and a select to add one more. */
export function MultiPick({ value, options, onChange, placeholder = 'Add…', disabled, empty = 'None' }: { value: string[]; options: { id: string; label: string }[]; onChange: (v: string[]) => void; placeholder?: string; disabled?: boolean; empty?: string }) {
  const left = options.filter(o => !value.includes(o.id));
  const label = (id: string) => options.find(o => o.id === id)?.label ?? id;
  return (
    <span className="pn-picks">
      {value.map(v => <span key={v} className="pn-pick" title={label(v)}>{label(v).split(' · ')[0]}{!disabled && <button type="button" aria-label={`Remove ${label(v)}`} onClick={() => onChange(value.filter(x => x !== v))}><X size={11} /></button>}</span>)}
      {!value.length && disabled && <span className="vw-label" style={{ fontSize: 12 }}>{empty}</span>}
      {!disabled && left.length > 0 && <select className="select" value="" onChange={e => e.target.value && onChange([...value, e.target.value])}><option value="">{placeholder}</option>{left.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>}
    </span>
  );
}

/** A labelled block that is not a <label> (for controls with several buttons, where a label click would press the first one). */
export const Block = ({ label, children }: { label: ReactNode; children: ReactNode }) => <div className="field"><span className="field-label">{label}</span>{children}</div>;

/** Two or three controls side by side under one label (not a <label>: a click must not land on the first control). */
export const Pair = ({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) => <div className="field"><span className="field-label">{label}</span><span className="pn-inline">{children}</span>{hint && <span className="field-hint">{hint}</span>}</div>;
