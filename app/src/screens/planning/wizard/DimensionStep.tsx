/* A design / delivery / business step of the wizard: the template's inputs for this area (pre-filled from the requirements with
   the reason shown), what the planner works out from them, and the rules checked for this area. The phases, permits and risks
   editors are shared with the plan page. */
import { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import { Btn, Chip } from '../../../ui/kit';
import type * as T from '../../../planner/p2b/types';
import type { Dimension } from '../../../planner/lib/dimensions';
import { requirementParamKeys } from '../../../planner/lib/dimensions';
import { COOLING_LABEL, fmtParam, fromDateInput, paramDefsFor, phaseDerived, toDateInput, type StepProps } from '../../../planner/lib/wizardModel';
import type { Evaluation } from '../../../planner/lib/engine';
import { Sub, KvList, Sec, Figs } from '../parts';
import { FindingList, NumInput, SelectInput, TextInput, date, kw, money, num, pct } from '../common';
import { ParamInput } from './ParamInput';
import { StepHead } from './steps';
import { ScheduleGantt, CashflowBars } from '../plan/figures';

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
  return (
    <div className="pn-stack">
      <StepHead title={dim.label} text={dim.question} extra={<span className="row" style={{ gap: 6 }}>{depth === 'summary' && <Chip tone="neutral">Brief for this plan type</Chip>}<Chip tone={fails ? 'error' : warns ? 'warning' : 'success'} dot>{fails ? `${fails} fail` : warns ? `${warns} warning${warns === 1 ? '' : 's'}` : 'Checks pass'}</Chip></span>} />
      {fixed.length > 0 && <div className="pn-fromreq"><I.ListChecks size={15} /><span className="vw-label">From your requirements</span>{fixed.map(d => <span key={d.key} className="pn-fromreq-item">{d.label} <b>{fmtParam(d.key, ev?.params[d.key]?.value ?? d.default, d.unit)}</b></span>)}<button type="button" className="ent-link" onClick={() => goTo('requirements')}>Change</button></div>}
      {inputs.length > 0 && <Sec icon={I.SlidersHorizontal} title="Inputs" sub={fromReq > 0 ? `${fromReq} of ${inputs.length} filled from your requirements; change only what differs` : `${inputs.length} input${inputs.length === 1 ? '' : 's'} for ${dim.label.toLowerCase()}`}
        extra={<span className="pn-legend"><span><i className="s-user" />Entered</span><span><i className="s-req" />Requirements</span><span><i className="s-def" />Default</span><span><i className="s-bm" />Benchmark</span></span>}>
        <div className="pn-params">{visible.map(d => <ParamInput key={d.key} def={d} ev={ev} draft={draft} setParam={setParam} resetParam={resetParam} why={why[d.key]} disabled={readOnly} />)}</div>
        {visible.length < inputs.length && <button type="button" className="ent-link" style={{ marginTop: 12, fontSize: 12.5 }} onClick={() => setShowAll(true)}>Show {inputs.length - visible.length} more input{inputs.length - visible.length === 1 ? '' : 's'}</button>}
      </Sec>}
      <Sec icon={I.Calculator} title="What the planner works out" sub="Recalculated from the inputs as you type">
        <Result {...props} />
      </Sec>
      {findings.length > 0 && <Sec icon={I.ShieldCheck} title={`Checks for ${dim.label.toLowerCase()}`} sub="The template's rules for this area, evaluated on the plan as it is now" tone={fails ? 'bad' : warns ? 'warn' : 'ok'}
        extra={<span className="row" style={{ gap: 6 }}>{passes > 0 && <Chip tone="success" size="xs" dot>{passes} pass</Chip>}{warns > 0 && <Chip tone="warning" size="xs" dot>{warns} warn</Chip>}{fails > 0 && <Chip tone="error" size="xs" dot>{fails} fail</Chip>}</span>}>
        <FindingList findings={findings} />
      </Sec>}
    </div>
  );
}

/* ------------------------------------------------------------------ what the planner works out, per area */
function Result(props: StepProps & { dim: Dimension }) {
  const { dim, ev, draft } = props;
  if (!ev) return <p className="vw-label">Evaluating…</p>;
  const s = ev.sizing, e = ev.estimate;
  switch (dim.key) {
    case 'space': return <>
      <Figs items={[['Racks', num(s.racks)], ['Halls', num(s.halls)], ['Buildings', num(s.buildings)], ['White space', `${num(s.whiteSpaceM2)} m²`], ['Gross area', `${num(s.grossAreaM2)} m²`], ['Racks per hall', num(s.building.racksPerHall)], ['Floors per building', num(s.building.floorsPerBuilding)], ['Halls per floor', num(s.building.hallsPerFloor)]]} />
      {s.rackClasses.length > 0 && <table className="nst-table" style={{ width: '100%', marginTop: 10 }}><thead><tr><th>Rack class</th><th>kW per rack</th><th>Racks</th><th>Share</th><th>Cooling</th></tr></thead><tbody>{s.rackClasses.map(c => <tr key={c.name}><td>{c.name}</td><td className="num">{c.kw}</td><td className="num">{num(c.racks)}</td><td className="num">{pct(c.sharePct)}</td><td>{c.liquid ? `Liquid to chip (${c.capturePct}% captured)` : c.rearDoor ? 'Rear door' : 'Air'}</td></tr>)}</tbody></table>}
      {ev.ctx.site && <p className="vw-label" style={{ marginTop: 8 }}>At {ev.ctx.site.dc.name}: {ev.ctx.site.halls.reduce((a, h) => a + h.freePositions, 0)} free positions across {ev.ctx.site.halls.length} halls; {kw(ev.ctx.site.headroomItKw)} of IT headroom.</p>}
    </>;
    case 'power': return <>
      {s.facility && <Figs items={[['IT load', kw(s.facility.itKw)], ['Facility load', `${kw(s.facility.facilityKw)} · ${s.facility.mva} MVA`], ['Peak PUE', String(s.facility.peakPue)], ['Power factor', String(s.facility.powerFactor)]]} />}
      {s.power?.length ? <><Sub>Power path, utility to rack</Sub><div className="pn-chain-cards">{s.power.map((p, i) => <div key={p.key} className={`pn-stagecard${p.ok ? '' : ' is-bad'}`}>
        {i > 0 && <I.ChevronRight size={16} className="pn-stagecard-arrow" />}
        <span className="row between"><b>{p.label}</b><Chip tone={p.ok ? 'success' : 'error'} size="xs" dot>{p.ok ? 'OK' : 'Short'}</Chip></span>
        <span className="pn-stagecard-units num">{p.count} × {p.unit}</span>
        <span className="pn-stagecard-red">{p.redundancy}</span>
        <span className="pn-stagecard-kv"><span>Usable</span><b className="num">{kw(p.usableKw)}</b></span>
        <span className="pn-stagecard-kv"><span>Must carry</span><b className="num">{kw(p.needKw)}</b></span>
        <span className="pn-stagecard-meter"><i style={{ width: `${Math.min(100, (p.needKw / Math.max(1, p.usableKw)) * 100)}%` }} /></span>
        <small title={p.basis}>{p.basis}</small>
      </div>)}</div></> : null}
      {s.plant.length > 0 && <><Sub>Plant</Sub><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Item</th><th>Count</th><th>Rating</th><th>Redundancy</th><th>Note</th></tr></thead><tbody>{s.plant.filter(p => !/crah|cdu|chiller|cool|rear/i.test(p.kind)).map((p, i) => <tr key={`${p.name}-${i}`}><td>{p.name}{p.model ? <small className="vw-label"> · {p.model}</small> : null}</td><td className="num">{p.count}</td><td className="num">{p.unitKva ? `${num(p.unitKva)} kVA` : kw(p.capacityKw)}</td><td>{p.redundancy}</td><td className="vw-label">{p.note ?? ''}</td></tr>)}</tbody></table></>}
    </>;
    case 'cooling': { const c = s.cooling; return <>
      <Figs items={[['Method', COOLING_LABEL[c.type as T.PlannerCoolingType] ?? c.type], ['Capacity', `${kw(c.capacityKw)} · ${c.redundancy}`], ['Heat to liquid', kw(c.liquidKw)], ['Heat to air', kw(c.airKw)], ['Air units', `${c.air.units} × ${kw(c.air.unitKw)} ${c.air.label}`], ['CDUs', c.cdu ? `${c.cdu.units} × ${kw(c.cdu.unitKw)}` : '—'], ['Rear doors', num(c.rearDoors)], ['PUE', `${s.pue.value} (${s.pue.source})`]]} />
      {c.liquidRequired && <p className="note note--warn" style={{ marginTop: 8 }}><I.Droplets size={15} />Liquid cooling is required at this density (above the liquid threshold benchmark).</p>}
      {c.heatRejection?.streams?.length ? <table className="nst-table" style={{ width: '100%', marginTop: 10 }}><thead><tr><th>Heat stream</th><th>Heat</th><th>Loop</th><th>Rejected by</th></tr></thead><tbody>{c.heatRejection.streams.map(h => <tr key={h.label}><td>{h.label}</td><td className="num">{kw(h.heatKw)}</td><td className="num">{h.loopC} °C</td><td>{h.method}{h.trimPct ? ` (+${h.trimPct}% trim)` : ''}</td></tr>)}</tbody></table> : null}
    </>; }
    case 'network': { const n = s.network; return <Figs items={[['Leaf switches', num(n.leaves)], ['Spines', num(n.spines)], ['Core / border', num(n.cores)], ['Uplinks', `${num(n.uplinks)} × ${n.uplinkGbps}G`], ['Access ports', num(n.accessPorts)], ['Carriers', num(n.carriers)], ['Interconnect', n.dciGbps ? `${num(n.dciGbps)} Gbps${n.dciSource ? ` (${n.dciSource})` : ''}` : '—'], ['Oversubscription', String(ev.params.oversubscription?.value ?? '—')]]} />; }
    case 'it': return <>
      <Figs items={[['IT capacity', kw(s.itKw)], ['GPU share', pct(draft.demand.gpuPct)], ['Compute share', pct(draft.demand.computePct)], ['Storage share', pct(draft.demand.storagePct)], ['Operator owns the IT', ev.params.operatorOwnedIt?.value ? 'Yes' : 'No'], ['Owned IT CapEx', money(e.capex.filter(l => /IT|server|GPU|storage/i.test(l.category)).reduce((a, l) => a + l.amount, 0))], ['Spares', `${s.spares.lines} lines · ${money(s.spares.valueUsd)}`], ['Refresh cycle', `${ev.params.refreshYears?.value ?? '—'} years`]]} />
      {s.rackClasses.length > 0 && <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>{s.rackClasses.map(c => <Chip key={c.name} tone="neutral">{c.name}: {num(c.racks)} racks at {c.kw} kW</Chip>)}</div>}
    </>;
    case 'firesec': return <Figs items={[['Suppression', String(ev.params.suppressionType?.value ?? '—')], ['Detection', String(ev.params.detectionType?.value ?? 'VESDA')], ['Security zones', String(ev.params.securityZones?.value ?? '—')], ['Access control', String(ev.params.accessControl?.value ?? 'Two-factor into the hall')]]} />;
    case 'sustainability': { const u = ev.sustainability; return <Figs items={[['PUE', String(u.pue)], ['WUE', `${u.wue} L/kWh`], ['Energy per year', `${num(u.energyMwhYear)} MWh`], ['Carbon per year', `${num(u.carbonTYear)} t CO₂`], ['Renewable share', pct(u.renewableSharePct)], ['Heat reuse', `${num(u.heatReuseMwhYear)} MWh`]]} />; }
    case 'operations': { const st = s.staffing; return <>
      <Figs items={[['Operations staff', `${num(st.fte, 1)} FTE`], ['Per MW', `${st.perMw} FTE/MW (${st.source})`], ['Shifts', num(st.shifts)], ['Seats', st.seats ?? '—']]} />
      {st.plan?.length ? <table className="nst-table" style={{ width: '100%', marginTop: 10 }}><thead><tr><th>Phase</th><th>Cumulative load</th><th>FTE</th><th>Key hires by</th><th>Technicians by</th></tr></thead><tbody>{st.plan.map(p => <tr key={p.phaseId}><td>{p.name}</td><td className="num">{kw(p.cumulativeKw)}</td><td className="num">{num(p.fte, 1)}</td><td>{date(p.keyHireBy)}</td><td>{date(p.techHireBy)}</td></tr>)}</tbody></table> : null}
      {st.basis && <p className="vw-label" style={{ marginTop: 8 }}>{st.basis}</p>}
    </>; }
    case 'delivery': case 'migration': return <>
      <PhasesEditor draft={draft} ev={ev} readOnly={props.readOnly} onChange={phases => props.patch({ phases })} wave={dim.key === 'migration'} />
      {ev.ladder.length > 0 && <><Sub>Capacity by phase</Sub><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Phase</th><th>Go-live</th><th>Installed</th><th>Committed</th><th>Reserve</th><th>Headroom</th><th>Binds first</th></tr></thead><tbody>{ev.ladder.map(r => <tr key={r.phase.id}><td>{r.phase.name}</td><td>{date(r.phase.goLive)}</td><td className="num">{kw(r.installedKw)}</td><td className="num">{kw(r.committedKw)}</td><td className="num">{kw(r.reserveKw)}</td><td className="num">{kw(r.headroomKw)}</td><td><Chip tone={r.bindingConstraint === 'none' ? 'success' : 'warning'} size="xs">{r.bindingConstraint}</Chip></td></tr>)}</tbody></table></>}
      <Sub>What must be ordered when</Sub>
      <ScheduleGantt items={ev.schedule} target={draft.targetGoLive} />
    </>;
    case 'cost': return <>
      <Figs items={[['CapEx', money(e.capexTotal)], ['Per kW', money(e.capexPerKw)], ['Per rack', money(e.capexPerRack)], ['Contingency', money(e.contingencyUsd ?? 0)], ['OpEx per month', money(e.opexMonthly)], ['Per kW-month', money(e.costPerKwMonth)], ['Payback', e.paybackMonths == null ? '—' : `${e.paybackMonths} months`], ['NPV / IRR', `${money(e.npvUsd)} / ${e.irrPct == null ? '—' : `${e.irrPct}%`}`]]} />
      {e.benchmarkBand && <p className="vw-label" style={{ marginTop: 8 }}>Benchmark band {money(e.benchmarkBand.low)}–{money(e.benchmarkBand.high)} per kW ({e.benchmarkBand.source}){e.actualsCapexPerKw ? `; our last builds ${money(e.actualsCapexPerKw)} per kW` : ''}. {e.paybackBasis}</p>}
      <Sub>CapEx lines</Sub>
      <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Item</th><th>Basis</th><th>Amount</th></tr></thead><tbody>{e.capex.map((l, i) => <tr key={i}><td>{l.item}</td><td className="vw-label">{l.basis}</td><td className="num" style={{ whiteSpace: 'nowrap' }}>{money(l.amount)}</td></tr>)}<tr><td className="strong">Total</td><td /><td className="num strong" style={{ whiteSpace: 'nowrap' }}>{money(e.capexTotal)}</td></tr></tbody></table>
      {e.cashflow?.length ? <><Sub>Cash flow · {e.cashflow.length} years at {e.discountPct}% hurdle rate</Sub><CashflowBars years={e.cashflow} /></> : null}
    </>;
    case 'permits': return <>
      <PermitsEditor permits={draft.permits} target={draft.targetGoLive} readOnly={props.readOnly} onChange={permits => props.patch({ permits })} />
      <RisksEditor risks={draft.risks} owner={draft.ownerName} readOnly={props.readOnly} onChange={risks => props.patch({ risks })} />
    </>;
  }
}

/* ------------------------------------------------------------------ editors shared with the plan page */
const PHASE_STATUS: T.PlannerPhase['status'][] = ['Planned', 'Approved', 'In delivery', 'Live'];
export function PhasesEditor({ draft, ev, onChange, readOnly, wave }: { draft: T.PlannerPlan; ev?: Evaluation; onChange: (p: T.PlannerPhase[]) => void; readOnly?: boolean; wave?: boolean }) {
  const phases = [...draft.phases].sort((a, b) => a.goLive.localeCompare(b.goLive));
  const total = phases.reduce((a, p) => a + p.itKw, 0);
  const upd = (id: string, p: Partial<T.PlannerPhase>) => onChange(draft.phases.map(x => (x.id === id ? { ...x, ...p, ...phaseDerived(p.itKw ?? x.itKw, ev) } : x)));
  const add = () => { const left = Math.max(0, draft.designPowerKw - total); onChange([...draft.phases, { id: `P${draft.phases.length + 1}-${Date.now().toString(36)}`, name: `${wave ? 'Wave' : 'Phase'} ${draft.phases.length + 1}`, goLive: draft.targetGoLive, itKw: left, status: 'Planned', ...phaseDerived(left, ev) }]); };
  const word = wave ? 'Waves' : 'Phases';
  return <>
    <Sub extra={<span className="row" style={{ gap: 8 }}><Chip tone={total === draft.designPowerKw ? 'success' : 'error'} dot>{kw(total)} of {kw(draft.designPowerKw)}</Chip>{!readOnly && <Btn size="sm" icon={I.Plus} onClick={add}>Add {wave ? 'a wave' : 'a phase'}</Btn>}</span>}>{word}</Sub>
    {phases.length ? <table className="nst-table pn-phases" style={{ width: '100%' }}><thead><tr><th>{wave ? 'Wave' : 'Phase'}</th><th>Go-live</th><th>IT kW</th><th>Racks</th><th>Halls</th><th>Status</th><th></th></tr></thead><tbody>
      {phases.map(p => <tr key={p.id}><td><TextInput value={p.name} disabled={readOnly} onChange={v => upd(p.id, { name: v })} /></td><td><TextInput type="date" value={toDateInput(p.goLive)} disabled={readOnly} onChange={v => upd(p.id, { goLive: fromDateInput(v, p.goLive) })} /></td><td><NumInput value={p.itKw} min={0} disabled={readOnly} onChange={v => v !== undefined && upd(p.id, { itKw: v })} /></td><td className="num">{num(p.racks)}</td><td className="num">{num(p.halls)}</td><td><SelectInput value={p.status} disabled={readOnly} options={PHASE_STATUS.map(s => ({ id: s, label: s }))} onChange={v => upd(p.id, { status: v })} /></td><td>{!readOnly && draft.phases.length > 1 && <Btn size="sm" variant="ghost" icon={I.Trash2} onClick={() => onChange(draft.phases.filter(x => x.id !== p.id))} />}</td></tr>)}
    </tbody></table> : <p className="vw-label">No {word.toLowerCase()} yet.</p>}
    <p className="vw-label" style={{ margin: '8px 0 0', fontSize: 12 }}>{word} must add up to the design power; racks and halls follow from the density and hall load of the plan.</p>
  </>;
}

const PERMIT_STATUS: T.PlannerPermit['status'][] = ['Not started', 'Applied', 'In review', 'Approved', 'Expired'];
export function PermitsEditor({ permits, target, onChange, readOnly }: { permits: T.PlannerPermit[]; target: string; onChange: (p: T.PlannerPermit[]) => void; readOnly?: boolean }) {
  const upd = (id: string, p: Partial<T.PlannerPermit>) => onChange(permits.map(x => (x.id === id ? { ...x, ...p } : x)));
  return <>
    <Sub extra={!readOnly && <Btn size="sm" icon={I.Plus} onClick={() => onChange([...permits, { id: `PM-${Date.now().toString(36)}`, name: '', authority: '', leadWeeks: 8, neededBefore: target, status: 'Not started' }])}>Add a permit</Btn>}>Permits and consents</Sub>
    {permits.length ? <table className="nst-table pn-phases" style={{ width: '100%' }}><thead><tr><th>Permit</th><th>Authority</th><th>Lead time</th><th>Needed before</th><th>Status</th><th></th></tr></thead><tbody>
      {permits.map(p => <tr key={p.id}><td><TextInput value={p.name} placeholder="e.g. Building permit" disabled={readOnly} onChange={v => upd(p.id, { name: v })} /></td><td><TextInput value={p.authority} placeholder="Who grants it" disabled={readOnly} onChange={v => upd(p.id, { authority: v })} /></td><td><NumInput value={p.leadWeeks} min={0} unit="weeks" disabled={readOnly} onChange={v => v !== undefined && upd(p.id, { leadWeeks: v })} /></td><td><TextInput type="date" value={toDateInput(p.neededBefore)} disabled={readOnly} onChange={v => upd(p.id, { neededBefore: fromDateInput(v, p.neededBefore) })} /></td><td><SelectInput value={p.status} disabled={readOnly} options={PERMIT_STATUS.map(s => ({ id: s, label: s }))} onChange={v => upd(p.id, { status: v })} /></td><td>{!readOnly && <Btn size="sm" variant="ghost" icon={I.Trash2} onClick={() => onChange(permits.filter(x => x.id !== p.id))} />}</td></tr>)}
    </tbody></table> : <p className="vw-label">No permits listed. A permit decided after the project it gates starts fails the compliance rule.</p>}
  </>;
}

const DOMAINS: T.PlannerRisk['domain'][] = ['Facility', 'Network', 'Supplier', 'Commissioning', 'Regulatory', 'Finance', 'Security'];
const LEVELS: ('Low' | 'Medium' | 'High')[] = ['Low', 'Medium', 'High'];
export function RisksEditor({ risks, owner, onChange, readOnly }: { risks: T.PlannerRisk[]; owner: string; onChange: (r: T.PlannerRisk[]) => void; readOnly?: boolean }) {
  const upd = (id: string, p: Partial<T.PlannerRisk>) => onChange(risks.map(x => (x.id === id ? { ...x, ...p } : x)));
  const tone = (r: T.PlannerRisk) => (r.impact === 'High' && r.probability !== 'Low' ? 'error' : r.impact === 'High' || r.probability === 'High' ? 'warning' : 'neutral');
  return <>
    <Sub extra={!readOnly && <Btn size="sm" icon={I.Plus} onClick={() => onChange([...risks, { id: `R${risks.length + 1}-${Date.now().toString(36)}`, title: '', domain: 'Facility', probability: 'Medium', impact: 'Medium', owner, mitigation: '', source: 'user' }])}>Add a risk</Btn>}>Risk register</Sub>
    {risks.length ? <table className="nst-table pn-phases" style={{ width: '100%' }}><thead><tr><th>Risk</th><th>Area</th><th>Probability</th><th>Impact</th><th>Owner</th><th>Mitigation</th><th></th></tr></thead><tbody>
      {risks.map(r => <tr key={r.id}><td><span className="cell-2"><TextInput value={r.title} placeholder="What could go wrong" disabled={readOnly} onChange={v => upd(r.id, { title: v })} />{r.evidence && <small className="vw-label">{r.evidence}</small>}</span></td><td><SelectInput value={r.domain} disabled={readOnly} options={DOMAINS.map(d => ({ id: d, label: d }))} onChange={v => upd(r.id, { domain: v })} /></td><td><SelectInput value={r.probability} disabled={readOnly} options={LEVELS.map(l => ({ id: l, label: l }))} onChange={v => upd(r.id, { probability: v })} /></td><td><span className="row" style={{ gap: 6 }}><SelectInput value={r.impact} disabled={readOnly} options={LEVELS.map(l => ({ id: l, label: l }))} onChange={v => upd(r.id, { impact: v })} /><Chip tone={tone(r)} size="xs" dot>{tone(r) === 'error' ? 'Top' : tone(r) === 'warning' ? 'Watch' : 'Low'}</Chip></span></td><td><TextInput value={r.owner} disabled={readOnly} onChange={v => upd(r.id, { owner: v })} /></td><td><TextInput value={r.mitigation} placeholder="What is done about it" disabled={readOnly} onChange={v => upd(r.id, { mitigation: v })} /></td><td>{!readOnly && <Btn size="sm" variant="ghost" icon={I.Trash2} onClick={() => onChange(risks.filter(x => x.id !== r.id))} />}</td></tr>)}
    </tbody></table> : <p className="vw-label">No risks yet. High-impact risks need an owner and a mitigation before submission.</p>}
    {risks.length > 0 && <KvList items={[['Top risks', String(risks.filter(r => tone(r) === 'error').length)], ['Without an owner or mitigation', String(risks.filter(r => !r.owner || !r.mitigation).length)]]} />}
  </>;
}
