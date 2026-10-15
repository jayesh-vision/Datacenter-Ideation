/* A design / delivery / business step of the wizard: the template's inputs for this area (pre-filled from the requirements with
   the reason shown), what the planner works out from them (the plan family's panel for this area when it has one, else the
   generic panel in DimensionPanels.tsx), and the rules checked for this area. The phases, permits and risks editors live in
   editors.tsx and are shared with the plan page. */
import { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import { Chip } from '../../../ui/kit';
import type { Dimension } from '../../../planner/lib/dimensions';
import { requirementParamKeys } from '../../../planner/lib/dimensions';
import { fmtParam, paramDefsFor, type StepProps } from '../../../planner/lib/wizardModel';
import { Sec } from '../parts';
import { FindingList } from '../common';
import { ParamFields, ParamInput } from './ParamInput';
import { StepHead } from './steps';
import { DIMENSION_PANEL } from './DimensionPanels';
import { uiFor } from '../scopes/registry';
export { PhasesEditor, PermitsEditor, RisksEditor } from './editors';

export function DimensionStep(props: StepProps & { dim: Dimension; depth: 'full' | 'summary' }) {
  const { dim, depth, draft, ev, templates, setParam, resetParam, why, goTo, readOnly } = props;
  const [showAll, setShowAll] = useState(false);
  const defs = useMemo(() => paramDefsFor(ev, templates, draft.dcTypeKey), [ev, templates, draft.dcTypeKey]);
  const reqKeys = requirementParamKeys(draft.scope);
  const inputs = [...defs.values()].filter(d => dim.aspects.includes(d.aspect) && !reqKeys.includes(d.key));
  const fixed = [...defs.values()].filter(d => dim.aspects.includes(d.aspect) && reqKeys.includes(d.key));
  const findings = (ev?.findings ?? []).filter(f => dim.aspects.includes(f.rule.aspect) && f.status !== 'n/a');
  const fromReq = inputs.filter(d => ev?.params[d.key]?.source === 'requirement').length;
  const visible = depth === 'summary' && !showAll ? inputs.slice(0, 3) : inputs;
  const fails = findings.filter(f => f.status === 'fail').length, warns = findings.filter(f => f.status === 'warn').length;
  const passes = findings.filter(f => f.status === 'pass').length;
  const Panel = uiFor(draft.scope).panels?.[dim.key] ?? DIMENSION_PANEL[dim.key];
  return (
    <div className="pn-stack">
      <StepHead title={dim.label} text={dim.question} extra={<span className="row" style={{ gap: 6 }}>{depth === 'summary' && <Chip tone="neutral">Brief for this plan type</Chip>}<Chip tone={fails ? 'error' : warns ? 'warning' : 'success'} dot>{fails ? `${fails} fail` : warns ? `${warns} warning${warns === 1 ? '' : 's'}` : 'Checks pass'}</Chip></span>} />
      {fixed.length > 0 && <div className="pn-fromreq"><I.ListChecks size={15} /><span className="vw-label">From your requirements</span>{fixed.map(d => <span key={d.key} className="pn-fromreq-item">{d.label} <b>{fmtParam(d.key, ev?.params[d.key]?.value ?? d.default, d.unit)}</b></span>)}<button type="button" className="ent-link" onClick={() => goTo('requirements')}>Change</button></div>}
      {inputs.length > 0 && <Sec icon={I.SlidersHorizontal} title="Inputs" sub={fromReq > 0 ? `${fromReq} of ${inputs.length} filled from your requirements; change only what differs` : `${inputs.length} input${inputs.length === 1 ? '' : 's'} for ${dim.label.toLowerCase()}`}
        extra={<span className="pw-legend"><span><i className="s-user" />Entered</span><span><i className="s-req" />Requirements</span><span><i className="s-def" />Default</span><span><i className="s-bm" />Benchmark</span></span>}>
        <ParamFields>{visible.map(d => <ParamInput key={d.key} def={d} ev={ev} draft={draft} setParam={setParam} resetParam={resetParam} why={why[d.key]} disabled={readOnly} />)}</ParamFields>
        {visible.length < inputs.length && <button type="button" className="ent-link" style={{ marginTop: 12, fontSize: 12.5 }} onClick={() => setShowAll(true)}>Show {inputs.length - visible.length} more input{inputs.length - visible.length === 1 ? '' : 's'}</button>}
      </Sec>}
      <Sec icon={I.Calculator} title="What the planner works out" sub="Recalculated from the inputs as you type">
        <Panel {...props} />
      </Sec>
      {findings.length > 0 && <Sec icon={I.ShieldCheck} title={`Checks for ${dim.label.toLowerCase()}`} sub="The template's rules for this area, evaluated on the plan as it is now" tone={fails ? 'bad' : warns ? 'warn' : 'ok'}
        extra={<span className="row" style={{ gap: 6 }}>{passes > 0 && <Chip tone="success" size="xs" dot>{passes} pass</Chip>}{warns > 0 && <Chip tone="warning" size="xs" dot>{warns} warn</Chip>}{fails > 0 && <Chip tone="error" size="xs" dot>{fails} fail</Chip>}</span>}>
        <FindingList findings={findings} />
      </Sec>}
    </div>
  );
}
