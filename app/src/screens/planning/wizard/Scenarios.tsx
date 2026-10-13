/* Scenarios: what-if options compared against the base case (tier, cooling, density, cost assumptions); one is preferred and is
   what approvers see. Shared by the wizard's Scenarios step and the plan page's Scenarios tab. */
import { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import { Btn, Chip, Drawer, Field, Panel } from '../../../ui/kit';
import type * as T from '../../../planner/p2b/types';
import type { Evaluation, ParamValue } from '../../../planner/lib/engine';
import { COOLING_LABEL, paramDefsFor } from '../../../planner/lib/wizardModel';
import type { usePlannerActions } from '../../../planner/lib/usePlanner';
import { Sub } from '../parts';
import { NumInput, SelectInput, TextArea, TextInput, kw, money, num } from '../common';

const OVERRIDE_KEYS = ['tier', 'redundancy', 'coolingType', 'densityKwPerRack', 'hallDesignKw', 'pueTarget', 'capexPerKw', 'revenuePerKwMonth', 'contingencyPct'];
export interface ScenarioEval { scenario: T.PlannerScenario; ev: Evaluation }

export function ScenarioPanel({ plan, base, scenarios, templates, actions, editable, onCreateNeedsSave }: { plan: T.PlannerPlan; base: Evaluation; scenarios: ScenarioEval[]; templates: T.PlannerTemplate[]; actions: ReturnType<typeof usePlannerActions>; editable: boolean; onCreateNeedsSave?: () => T.PlannerPlan | undefined }) {
  const [editing, setEditing] = useState<T.PlannerScenario | 'new' | null>(null);
  const defs = useMemo(() => paramDefsFor(base, templates, plan.dcTypeKey), [base, templates, plan.dcTypeKey]);
  const cols = [{ key: 'base', name: 'Base case', ev: base, scenario: null as T.PlannerScenario | null }, ...scenarios.map(s => ({ key: s.scenario.id, name: s.scenario.name, ev: s.ev, scenario: s.scenario }))];
  const preferred = plan.preferredScenarioId;
  const metric = (ev: Evaluation) => [kw(ev.sizing.itKw), num(ev.sizing.racks), money(ev.estimate.capexTotal), money(ev.estimate.opexMonthly), String(ev.sizing.pue.value), ev.estimate.paybackMonths == null ? '—' : `${ev.estimate.paybackMonths} mo`, money(ev.estimate.npvUsd), ev.estimate.irrPct == null ? '—' : `${ev.estimate.irrPct}%`, String(ev.hardFails), String(ev.softWarns), `${ev.readinessPct}%`];
  const labels = ['IT capacity', 'Racks', 'CapEx', 'OpEx / month', 'PUE', 'Payback', 'NPV', 'IRR', 'Hard fails', 'Warnings', 'Readiness'];
  const prefer = (id?: string) => actions.preferScenario(plan, id);
  const open = (s: T.PlannerScenario | 'new') => { if (s === 'new' && onCreateNeedsSave && !onCreateNeedsSave()) return; setEditing(s); };
  return <>
    <div className="pn-scen">
      {cols.map(c => { const on = (c.scenario?.id ?? undefined) === preferred; return (
        <div key={c.key} className={`pn-card${on ? ' is-on' : ''}`} style={{ cursor: 'default' }}>
          <span className="row between"><b>{c.name}</b><span className="row" style={{ gap: 4 }}>{on && <Chip tone="info" size="xs">Preferred</Chip>}{c.ev.hardFails ? <Chip tone="error" size="xs">{c.ev.hardFails} fail</Chip> : <Chip tone="success" size="xs">Pass</Chip>}</span></span>
          <span className="vw-label">{c.scenario ? c.scenario.description || `${Object.keys(c.scenario.overrides).length} override${Object.keys(c.scenario.overrides).length === 1 ? '' : 's'}` : 'The plan as entered, every input at its own value.'}</span>
          <span className="row wrap" style={{ gap: 10, fontSize: 12.5 }}><span><small className="vw-label">CapEx </small><b className="num">{money(c.ev.estimate.capexTotal)}</b></span><span><small className="vw-label">PUE </small><b className="num">{c.ev.sizing.pue.value}</b></span><span><small className="vw-label">Payback </small><b className="num">{c.ev.estimate.paybackMonths == null ? '—' : `${c.ev.estimate.paybackMonths} mo`}</b></span></span>
          {c.scenario && <span className="row wrap" style={{ gap: 4 }}>{Object.entries(c.scenario.overrides).map(([k, v]) => { const structured = typeof v === 'string' && /^[[{]/.test(v); return <Chip key={k} tone="neutral" size="xs">{defs.get(k)?.label ?? k.replace(/([A-Z])/g, ' $1').toLowerCase()}: {structured ? 'edited' : k === 'coolingType' ? COOLING_LABEL[v as T.PlannerCoolingType] ?? String(v) : String(v)}</Chip>; })}</span>}
          {editable && <span className="row" style={{ gap: 6, marginTop: 4 }}>{!on && <Btn size="sm" icon={I.Star} onClick={() => prefer(c.scenario?.id)}>Prefer</Btn>}{c.scenario && <Btn size="sm" variant="ghost" icon={I.Pencil} onClick={() => open(c.scenario!)}>Edit</Btn>}{c.scenario && <Btn size="sm" variant="ghost" icon={I.Trash2} onClick={() => { actions.deleteScenario(c.scenario!.id); if (on) prefer(undefined); }} />}</span>}
        </div>); })}
      {editable && <button type="button" className="pn-card" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 120, borderStyle: 'dashed' }} onClick={() => open('new')}><I.Plus size={18} className="muted" /><b>New scenario</b><span className="vw-label">Change tier, cooling, density or cost assumptions</span></button>}
    </div>
    {scenarios.length > 0 && <><Sub>Side by side</Sub><div style={{ overflowX: 'auto' }}><table className="nst-table" style={{ width: '100%' }}><thead><tr><th></th>{cols.map(c => <th key={c.key}>{c.name}</th>)}</tr></thead><tbody>{labels.map((l, i) => <tr key={l}><td className="strong">{l}</td>{cols.map(c => <td key={c.key} className="num">{metric(c.ev)[i]}</td>)}</tr>)}</tbody></table></div></>}
    {editing && <ScenarioDrawer plan={plan} scenario={editing === 'new' ? null : editing} defs={defs} count={scenarios.length} actions={actions} onClose={() => setEditing(null)} />}
  </>;
}

function ScenarioDrawer({ plan, scenario, defs, count, actions, onClose }: { plan: T.PlannerPlan; scenario: T.PlannerScenario | null; defs: Map<string, T.PlannerParamDef>; count: number; actions: ReturnType<typeof usePlannerActions>; onClose: () => void }) {
  const [name, setName] = useState(scenario?.name ?? `Scenario ${String.fromCharCode(65 + count)}`);
  const [desc, setDesc] = useState(scenario?.description ?? '');
  const [ov, setOv] = useState<Record<string, ParamValue>>({ ...(scenario?.overrides ?? {}) });
  const set = (k: string, v: ParamValue | undefined) => setOv(o => { const n = { ...o }; if (v === undefined || v === '') delete n[k]; else n[k] = v; return n; });
  const save = () => { if (scenario) actions.updateScenario(scenario.id, { name, description: desc, overrides: ov }); else actions.createScenario(plan.id, name, desc, ov); onClose(); };
  return (
    <Drawer open onClose={onClose} width={520} title={scenario ? `Edit ${scenario.name}` : 'New scenario'} sub="Only the inputs you set here differ from the plan; everything else stays as entered."
      foot={<div className="row" style={{ justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.Save} disabled={!name.trim()} onClick={save}>{scenario ? 'Save' : 'Create'}</Btn></div>}>
      <Field label="Name" required><TextInput value={name} onChange={setName} /></Field>
      <Field label="What it explores" style={{ marginTop: 10 }}><TextArea rows={2} value={desc} onChange={setDesc} placeholder="e.g. Air-cooled first hall for early revenue" /></Field>
      <Panel title="Overrides" style={{ marginTop: 12 }}>
        <div className="pn-grid-2">{OVERRIDE_KEYS.map(k => { const d = defs.get(k); if (!d) return null; const v = ov[k]; return (
          <Field key={k} label={d.label} hint={v === undefined ? `plan: ${String(plan.params[k] ?? d.default ?? '—')}${d.unit ? ` ${d.unit}` : ''}` : undefined}>
            {d.type === 'select' ? <SelectInput value={String(v ?? '')} placeholder="As the plan" options={(d.options ?? []).map(o => ({ id: o, label: k === 'coolingType' ? COOLING_LABEL[o as T.PlannerCoolingType] ?? o : o }))} onChange={x => set(k, x)} />
              : <NumInput value={typeof v === 'number' ? v : undefined} min={d.min} max={d.max} unit={d.unit} placeholder="As the plan" onChange={x => set(k, x)} />}
          </Field>); })}</div>
      </Panel>
    </Drawer>
  );
}
