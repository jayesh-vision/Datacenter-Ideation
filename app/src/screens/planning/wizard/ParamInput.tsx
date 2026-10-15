/* One template input in the wizard: the control for its type, where the value comes from (entered, from the requirements, template
   default, benchmark…) and a reset to the template default once it was changed. Layout (15-Oct-2026, user: "because of the description
   text the UI is broken; introduce an info icon and show on hover"): one label row (name, an ⓘ with the help and why the value is what
   it is, the source as dot + word, a small inline reset), then the control with its unit inside it, then a range error if any. The grid
   (`ParamFields`) gives every field a subgrid, so all inputs of a row start on the same line however the labels wrap.
   Styles: styles/planning-wizard.css (`pw-field*`; planner CSS is global, so the names are unique to this component). */
import type { CSSProperties, ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import type * as T from '../../../planner/p2b/types';
import type { Evaluation, ParamValue } from '../../../planner/lib/engine';
import { COOLING_LABEL } from '../../../planner/lib/wizardModel';
import { Info, Toggle } from '../../../ui/kit';
import { NumInput, SelectInput, SOURCE_LABEL, TextInput } from '../common';

const sentence = (s: string) => { const t = s.trim(); return t ? `${t[0].toUpperCase()}${t.slice(1)}${/[.!?)]$/.test(t) ? '' : '.'}` : ''; };
const withUnit = (v: unknown, unit?: string) => `${v}${unit ? ` ${unit}` : ''}`;

export function ParamInput({ def, ev, draft, setParam, resetParam, why, disabled }: { def: T.PlannerParamDef; ev?: Evaluation; draft: T.PlannerPlan; setParam: (k: string, v: ParamValue) => void; resetParam: (k: string) => void; why?: string; disabled?: boolean }) {
  const cur = ev?.params[def.key];
  const value = draft.params[def.key] ?? cur?.value ?? def.default;
  const overridden = draft.params[def.key] !== undefined;
  const src = cur?.source ?? (overridden ? 'user' : 'template');
  const num = typeof value === 'number' ? value : value === undefined || value === '' ? undefined : Number(value);
  const control = def.type === 'bool' ? <span className="pw-field-bool"><Toggle on={!!value} onChange={v => setParam(def.key, v)} /></span>
    : def.type === 'select' ? <SelectInput value={String(value ?? '')} disabled={disabled} options={(def.options ?? []).map(o => ({ id: o, label: def.key === 'coolingType' ? (COOLING_LABEL[o as T.PlannerCoolingType] ?? o) : o }))} onChange={v => setParam(def.key, v)} />
    : def.type === 'number' ? (
      <span className={`pw-field-num${def.unit ? ' has-unit' : ''}`} style={def.unit ? { '--pw-unit': def.unit.length } as CSSProperties : undefined}>
        <NumInput value={num} min={def.min} max={def.max} disabled={disabled} placeholder={num === undefined ? 'Auto' : undefined} onChange={v => { if (v !== undefined) setParam(def.key, v); }} />
        {def.unit && <small aria-hidden>{def.unit}</small>}
      </span>)
    : <TextInput value={String(value ?? '')} disabled={disabled} onChange={v => setParam(def.key, v)} />;
  /* the ⓘ: what the input is, how its default is worked out, and why it has this value when the requirements set it */
  const info = [def.help && sentence(def.help), def.derived && def.derived !== def.help && sentence(def.derived), src === 'requirement' && why && `Set from your requirements: ${sentence(why)}`].filter(Boolean).join(' ');
  const cut = def.label.lastIndexOf(' '), head = cut > 0 ? def.label.slice(0, cut + 1) : '', last = cut > 0 ? def.label.slice(cut + 1) : def.label;
  /* reset only when it would change something: an entered (not requirement-derived) value that differs from the template default */
  const canReset = overridden && !disabled && src !== 'requirement' && value !== def.default;
  const range = def.type !== 'number' || num === undefined || !Number.isFinite(num) ? undefined
    : def.min !== undefined && def.max !== undefined && (num < def.min || num > def.max) ? `Between ${def.min} and ${withUnit(def.max, def.unit)}`
    : def.min !== undefined && num < def.min ? `At least ${withUnit(def.min, def.unit)}`
    : def.max !== undefined && num > def.max ? `At most ${withUnit(def.max, def.unit)}` : undefined;
  return (
    <div className={`pw-field${overridden ? ' is-set' : ''}${range ? ' is-bad' : ''}`}>
      <span className="pw-field-head">
        {/* the ⓘ is glued to the last word so it never wraps onto a line of its own */}
        <span className="pw-field-name">{head && <span title={def.label}>{head}</span>}<span className="pw-field-last"><span title={def.label}>{last}</span>{info && <Info text={info} className="pw-field-info" />}</span></span>
        <span className={`pw-field-src s-${SRC_CLS[src] ?? 'def'}`} title={`${SOURCE_LABEL[src]}${cur?.note ? ` · ${cur.note}` : ''}`}><i />{SRC_SHORT[src]}</span>
        {canReset && <button type="button" className="pw-field-reset" title={`Back to the template default${def.default !== undefined && def.default !== '' ? ` (${def.type === 'bool' ? (def.default ? 'on' : 'off') : withUnit(def.default, def.unit)})` : ''}`} aria-label={`Reset ${def.label} to the template default`} onClick={() => resetParam(def.key)}><RotateCcw size={12} /></button>}
      </span>
      <span className="pw-field-ctl">
        {control}
        {range && <small className="pw-field-err" role="alert">{range}</small>}
      </span>
    </div>
  );
}

/** The grid of inputs: every field is a two-row subgrid (label row, control row). */
export const ParamFields = ({ children }: { children: ReactNode }) => <div className="pw-fields">{children}</div>;

const SRC_CLS: Partial<Record<T.PlannerParamSource, string>> = { user: 'user', requirement: 'req', template: 'def', benchmark: 'bm', actual: 'bm', document: 'bm', ai: 'bm' };
const SRC_SHORT: Record<T.PlannerParamSource, string> = { user: 'Entered', requirement: 'Requirements', template: 'Default', benchmark: 'Benchmark', actual: 'Actual', document: 'Document', ai: 'Proposed' };
