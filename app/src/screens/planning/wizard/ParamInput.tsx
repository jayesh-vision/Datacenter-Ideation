/* One template input in the wizard: the control for its type, where the value comes from (entered, from the requirements, template
   default, benchmark…) and a reset to the template default once it was changed. */
import { RotateCcw } from 'lucide-react';
import type * as T from '../../../planner/p2b/types';
import type { Evaluation, ParamValue } from '../../../planner/lib/engine';
import { COOLING_LABEL } from '../../../planner/lib/wizardModel';
import { IconBtn, Toggle } from '../../../ui/kit';
import { NumInput, SelectInput, SourceChip, TextInput } from '../common';

export function ParamInput({ def, ev, draft, setParam, resetParam, why, disabled }: { def: T.PlannerParamDef; ev?: Evaluation; draft: T.PlannerPlan; setParam: (k: string, v: ParamValue) => void; resetParam: (k: string) => void; why?: string; disabled?: boolean }) {
  const cur = ev?.params[def.key];
  const value = draft.params[def.key] ?? cur?.value ?? def.default;
  const overridden = draft.params[def.key] !== undefined;
  const control = def.type === 'bool' ? <Toggle on={!!value} onChange={v => setParam(def.key, v)} />
    : def.type === 'select' ? <SelectInput value={String(value ?? '')} disabled={disabled} options={(def.options ?? []).map(o => ({ id: o, label: def.key === 'coolingType' ? (COOLING_LABEL[o as T.PlannerCoolingType] ?? o) : o }))} onChange={v => setParam(def.key, v)} />
    : def.type === 'number' ? <NumInput value={typeof value === 'number' ? value : value === undefined || value === '' ? undefined : Number(value)} min={def.min} max={def.max} unit={def.unit} disabled={disabled} onChange={v => { if (v !== undefined) setParam(def.key, v); }} />
    : <TextInput value={String(value ?? '')} disabled={disabled} onChange={v => setParam(def.key, v)} />;
  return (
    <div className="pn-param">
      <span className="field-label" title={def.help ?? def.derived}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{def.label}</span><span className="row" style={{ gap: 4 }}><SourceChip short s={cur?.source ?? (overridden ? 'user' : 'template')} note={cur?.note} />{overridden && !disabled && <IconBtn icon={RotateCcw} size={13} title="Back to the template default" onClick={() => resetParam(def.key)} />}</span></span>
      {control}
      {cur?.source === 'requirement' && why && <small className="why">{why}</small>}
    </div>
  );
}
