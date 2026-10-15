/* Scenarios: what-if options compared against the base case (tier, cooling, density, grid offer, owned IT, cost assumptions, and
   optionally the phases themselves); one is preferred and is what approvers see. Shared by the wizard's Scenarios step and the plan
   page's Scenarios tab. Each option is a card, the compare chart puts them side by side on one measure, and the table lists every
   measure with the difference from the base case. */
import { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import { Btn, Chip, Drawer, Field, Panel } from '../../../ui/kit';
import type * as T from '../../../planner/p2b/types';
import type { Evaluation, ParamValue } from '../../../planner/lib/engine';
import { COOLING_LABEL, paramDefsFor, phaseDerived } from '../../../planner/lib/wizardModel';
import type { usePlannerActions } from '../../../planner/lib/usePlanner';
import { Sub } from '../parts';
import { NumInput, SelectInput, TextInput, kw, money, num } from '../common';
import { ScenarioCompareChart } from '../charts/ScenarioCompare';
import { PhaseEditor } from './PhasingStep';
import '../../../styles/planning-wizard.css';

const OVERRIDE_KEYS = ['tier', 'redundancy', 'coolingType', 'densityKwPerRack', 'hallDesignKw', 'pueTarget', 'gridOfferMva', 'operatorOwnedIt', 'capexPerKw', 'revenuePerKwMonth', 'contingencyPct'];
export interface ScenarioEval { scenario: T.PlannerScenario; ev: Evaluation }

/** One row of the side-by-side table: how to read the figure, format it, and whether lower is better (for the delta's colour). */
interface Metric { label: string; get: (ev: Evaluation) => number | null | undefined; fmt: (v: number) => string; dfmt?: (d: number) => string; better?: 'lower' | 'higher' }
const signed = (d: number, f: (v: number) => string) => `${d > 0 ? '+' : '−'}${f(Math.abs(d))}`;
const METRICS: Metric[] = [
  { label: 'IT capacity', get: ev => ev.sizing.itKw, fmt: kw, better: 'higher' },
  { label: 'Racks', get: ev => ev.sizing.racks, fmt: v => num(v) },
  { label: 'CapEx', get: ev => ev.estimate.capexTotal, fmt: money, better: 'lower' },
  { label: 'OpEx per month', get: ev => ev.estimate.opexMonthly, fmt: money, better: 'lower' },
  { label: 'PUE', get: ev => ev.sizing.pue.value, fmt: v => v.toFixed(2), better: 'lower' },
  { label: 'Payback', get: ev => ev.estimate.paybackMonths, fmt: v => `${num(v)} mo`, better: 'lower' },
  { label: 'NPV', get: ev => ev.estimate.npvUsd, fmt: money, better: 'higher' },
  { label: 'IRR', get: ev => ev.estimate.irrPct, fmt: v => `${v}%`, dfmt: d => `${num(d, 1)} pts`, better: 'higher' },
  { label: 'Hard fails', get: ev => ev.hardFails, fmt: v => num(v), better: 'lower' },
  { label: 'Warnings', get: ev => ev.softWarns, fmt: v => num(v), better: 'lower' },
  { label: 'Readiness', get: ev => ev.readinessPct, fmt: v => `${v}%`, dfmt: d => `${num(d)} pts`, better: 'higher' },
];

export function ScenarioPanel({ plan, base, scenarios, templates, actions, editable, onCreateNeedsSave, onPrefer }: { plan: T.PlannerPlan; base: Evaluation; scenarios: ScenarioEval[]; templates: T.PlannerTemplate[]; actions: ReturnType<typeof usePlannerActions>; editable: boolean; onCreateNeedsSave?: () => T.PlannerPlan | undefined; onPrefer?: (id?: string) => void }) {
  const [editing, setEditing] = useState<T.PlannerScenario | 'new' | null>(null);
  const [allMeasures, setAllMeasures] = useState(false);
  const defs = useMemo(() => paramDefsFor(base, templates, plan.dcTypeKey), [base, templates, plan.dcTypeKey]);
  const cols = [{ key: 'base', name: 'Base case', ev: base, scenario: null as T.PlannerScenario | null }, ...scenarios.map(s => ({ key: s.scenario.id, name: s.scenario.name, ev: s.ev, scenario: s.scenario }))];
  const preferred = plan.preferredScenarioId;
  const prefer = (id?: string) => { if (onPrefer) onPrefer(id); else actions.preferScenario(plan, id); };
  const open = (s: T.PlannerScenario | 'new') => { if (s === 'new' && onCreateNeedsSave && !onCreateNeedsSave()) return; setEditing(s); };
  const valueText = (k: string, v: ParamValue) => (typeof v === 'string' && /^[[{]/.test(v) ? 'edited' : k === 'coolingType' ? COOLING_LABEL[v as T.PlannerCoolingType] ?? String(v) : typeof v === 'boolean' ? (v ? 'yes' : 'no') : `${typeof v === 'number' ? num(v, 2) : v}${defs.get(k)?.unit && typeof v === 'number' ? ` ${defs.get(k)!.unit}` : ''}`);
  const delta = (m: Metric, ev: Evaluation) => {
    const a = m.get(base), b = m.get(ev);
    if (a == null || b == null) return null;
    const d = Math.round((b - a) * 100) / 100;
    if (!d) return <small className="pw-delta">same</small>;
    const good = m.better ? (m.better === 'lower' ? d < 0 : d > 0) : undefined;
    return <small className={`pw-delta${good === undefined ? '' : good ? ' is-good' : ' is-bad'}`}>{signed(d, m.dfmt ?? m.fmt)}</small>;
  };
  return <>
    <div className="pn-scen">
      {cols.map(c => { const on = (c.scenario?.id ?? undefined) === preferred; const ov = c.scenario ? Object.entries(c.scenario.overrides) : []; const ph = c.scenario?.phaseOverrides?.length ?? 0; return (
        <div key={c.key} className={`pn-card${on ? ' is-on' : ''}`} style={{ cursor: 'default' }}>
          <span className="pn-scen-head"><b>{c.name}</b><span className="pn-scen-chips">{on && <Chip tone="info" size="xs">Preferred</Chip>}{c.ev.hardFails ? <Chip tone="error" size="xs">{c.ev.hardFails} fail</Chip> : <Chip tone="success" size="xs">Pass</Chip>}</span></span>
          <span className="vw-label">{c.scenario ? c.scenario.description || `${ov.length} change${ov.length === 1 ? '' : 's'} from the base case` : 'The plan as entered, every input at its own value.'}</span>
          <span className="row wrap" style={{ gap: 10, fontSize: 12.5 }}><span><small className="vw-label">CapEx </small><b className="num">{money(c.ev.estimate.capexTotal)}</b></span><span><small className="vw-label">PUE </small><b className="num">{c.ev.sizing.pue.value}</b></span><span><small className="vw-label">Payback </small><b className="num">{c.ev.estimate.paybackMonths == null ? '—' : `${c.ev.estimate.paybackMonths} mo`}</b></span></span>
          {c.scenario && (ov.length > 0 || ph > 0) && <span className="row wrap" style={{ gap: 4 }}>{ov.map(([k, v]) => <Chip key={k} tone="neutral" size="xs">{defs.get(k)?.label ?? k.replace(/([A-Z])/g, ' $1').toLowerCase()}: {valueText(k, v)}</Chip>)}{ph > 0 && <Chip tone="purple" size="xs">{ph} phase{ph === 1 ? '' : 's'} of its own</Chip>}</span>}
          {editable && <span className="row" style={{ gap: 6, marginTop: 'auto', paddingTop: 4 }}>{!on && <Btn size="sm" icon={I.Star} onClick={() => prefer(c.scenario?.id)}>Prefer</Btn>}{c.scenario && <Btn size="sm" variant="ghost" icon={I.Pencil} onClick={() => open(c.scenario!)}>Edit</Btn>}{c.scenario && <Btn size="sm" variant="ghost" icon={I.Trash2} title={`Delete ${c.name}`} onClick={() => { actions.deleteScenario(c.scenario!.id); if (on) prefer(undefined); }} />}</span>}
        </div>); })}
      {editable && <button type="button" className="pn-card" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 120, borderStyle: 'dashed' }} onClick={() => open('new')}><I.Plus size={18} className="muted" /><b>New scenario</b><span className="vw-label">Change tier, cooling, density, the grid offer, cost assumptions or the phases</span></button>}
    </div>
    {scenarios.length > 0 && <>
      <Sub>Compared on one measure</Sub>
      <ScenarioCompareChart base={base} scenarios={scenarios} preferredId={preferred} />
      <button type="button" className="pn-scen-more" aria-expanded={allMeasures} onClick={() => setAllMeasures(v => !v)}>{allMeasures ? <I.ChevronUp size={14} /> : <I.ChevronDown size={14} />}{allMeasures ? 'Hide the differences' : `Every measure (${METRICS.length}) with its difference from the base case`}</button>
      {allMeasures && <div className="pn-tbl pn-scentbl"><table className="nst-table"><thead><tr><th>Measure</th>{cols.map(c => <th key={c.key}><span className="pn-scencell"><span>{c.name}</span>{(c.scenario?.id ?? undefined) === preferred && <small className="pw-delta is-good">preferred</small>}</span></th>)}</tr></thead>
        <tbody>{METRICS.map(m => <tr key={m.label}><td className="strong">{m.label}</td>{cols.map(c => { const v = m.get(c.ev); return <td key={c.key} className="num"><span className="pn-scencell"><span>{v == null ? '—' : m.fmt(v)}</span>{c.scenario && delta(m, c.ev)}</span></td>; })}</tr>)}</tbody></table></div>}
    </>}
    {editing && <ScenarioDrawer plan={plan} base={base} scenario={editing === 'new' ? null : editing} defs={defs} count={scenarios.length} actions={actions} onClose={() => setEditing(null)} />}
  </>;
}

function ScenarioDrawer({ plan, base, scenario, defs, count, actions, onClose }: { plan: T.PlannerPlan; base: Evaluation; scenario: T.PlannerScenario | null; defs: Map<string, T.PlannerParamDef>; count: number; actions: ReturnType<typeof usePlannerActions>; onClose: () => void }) {
  const [name, setName] = useState(scenario?.name ?? `Scenario ${String.fromCharCode(65 + count)}`);
  const [desc, setDesc] = useState(scenario?.description ?? '');
  const [ov, setOv] = useState<Record<string, ParamValue>>({ ...(scenario?.overrides ?? {}) });
  const [phases, setPhases] = useState<T.PlannerPhase[] | undefined>(scenario?.phaseOverrides?.map(p => ({ ...p })));
  const set = (k: string, v: ParamValue | undefined) => setOv(o => { const n = { ...o }; if (v === undefined || v === '') delete n[k]; else n[k] = v; return n; });
  const save = () => {
    const phaseOverrides = phases?.length ? phases : undefined;
    if (scenario) actions.updateScenario(scenario.id, { name, description: desc, overrides: ov, phaseOverrides });
    else { const rec = actions.createScenario(plan.id, name, desc, ov); if (phaseOverrides) actions.updateScenario(rec.id, { phaseOverrides }); }
    onClose();
  };
  const addPhase = () => { const ph = phases ?? []; const last = [...ph].sort((a, b) => a.goLive.localeCompare(b.goLive)).pop(); setPhases([...ph, { id: `PH-S${Date.now().toString(36)}`, name: `Phase ${ph.length + 1}`, goLive: last ? new Date(new Date(last.goLive).getTime() + 365 * 864e5).toISOString() : plan.targetGoLive, itKw: 0, racks: 0, halls: 0, status: 'Planned' }]); };
  const planValue = (k: string, d: T.PlannerParamDef) => { const v = base.params[k]?.value ?? plan.params[k] ?? d.default; return v === undefined || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : k === 'coolingType' ? COOLING_LABEL[v as T.PlannerCoolingType] ?? String(v) : `${v}${d.unit ? ` ${d.unit}` : ''}`; };
  const total = (phases ?? []).reduce((a, p) => a + p.itKw, 0);
  return (
    <Drawer open onClose={onClose} width={680} title={scenario ? `Edit ${scenario.name}` : 'New scenario'} sub="Only what you set here differs from the plan; everything else stays as entered."
      foot={<div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.Save} disabled={!name.trim()} onClick={save}>{scenario ? 'Save' : 'Create'}</Btn></div>}>
      <div className="pn-grid-2"><Field label="Name" required><TextInput value={name} onChange={setName} /></Field>
        <Field label="What it explores"><TextInput value={desc} onChange={setDesc} placeholder="e.g. Air-cooled first hall for early revenue" /></Field></div>
      <Panel title="Inputs that differ" style={{ marginTop: 12 }}>
        <div className="pn-grid-2">{OVERRIDE_KEYS.map(k => { const d = defs.get(k); if (!d) return null; const v = ov[k]; return (
          <Field key={k} label={d.label} hint={v === undefined ? `plan: ${planValue(k, d)}` : undefined}>
            {d.type === 'bool' ? <SelectInput value={v === undefined ? '' : v ? 'yes' : 'no'} options={[{ id: '', label: 'As the plan' }, { id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }]} onChange={x => set(k, x === '' ? undefined : x === 'yes')} />
              : d.type === 'select' ? <SelectInput value={String(v ?? '')} options={[{ id: '', label: 'As the plan' }, ...(d.options ?? []).map(o => ({ id: o, label: k === 'coolingType' ? COOLING_LABEL[o as T.PlannerCoolingType] ?? o : o }))]} onChange={x => set(k, x || undefined)} />
              : <NumInput value={typeof v === 'number' ? v : undefined} min={d.min} max={d.max} unit={d.unit} placeholder="As the plan" onChange={x => set(k, x)} />}
          </Field>); })}</div>
      </Panel>
      <Panel title="Phases in this scenario" style={{ marginTop: 12 }} sub={phases ? `${phases.length} phase${phases.length === 1 ? '' : 's'} · ${kw(total)} of ${kw(plan.designPowerKw)}` : `Uses the plan's ${plan.phases.length} phase${plan.phases.length === 1 ? '' : 's'}`}
        actions={phases ? <span className="row" style={{ gap: 6 }}><Btn size="sm" icon={I.Plus} onClick={addPhase}>Add a phase</Btn><Btn size="sm" variant="ghost" onClick={() => setPhases(undefined)}>Use the plan's phases</Btn></span>
          : <Btn size="sm" icon={I.CalendarRange} disabled={!plan.phases.length} onClick={() => setPhases(plan.phases.map(p => ({ ...p, ...phaseDerived(p.itKw, base) })))}>Change phases</Btn>}>
        {phases ? <div className="pn-scen-phases"><PhaseEditor phases={phases} onChange={setPhases} ev={base} layout="cards" /></div>
          : <p className="vw-label" style={{ margin: 0, fontSize: 12.5 }}>Change them to test, for example, two larger buildings instead of three, or an air-cooled first hall.</p>}
      </Panel>
    </Drawer>
  );
}
