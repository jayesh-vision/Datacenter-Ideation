/* Phasing and delivery (generic Delivery step): the phase table with per-phase density and cooling, the capacity ladder (installed,
   committed and reserve per phase against demand growing at the plan's rate) and what must be ordered when. Plan types that go live
   in one step (rack, pod, plant, network, migration) only show the order dates. Ported from P2B's PhasingStep / PhaseEditor. */
import { useState } from 'react';
import * as I from 'lucide-react';
import { Btn, Chip, Field, Seg } from '../../../ui/kit';
import type * as T from '../../../planner/p2b/types';
import type { Evaluation, ScheduleItem } from '../../../planner/lib/engine';
import { COOLING_LABEL, fromDateInput, phaseDerived, toDateInput, type StepProps } from '../../../planner/lib/wizardModel';
import { NumInput, SelectInput, TextInput, date, kw, num } from '../common';
import { Sub } from '../parts';
import { LeadTimes, PhaseLadder } from '../pack/drawings';
import { Note, Tbl } from './panelKit';

const COOLING: T.PlannerCoolingType[] = ['air-crah', 'air-economiser', 'chilled-water', 'in-row', 'rear-door', 'liquid-to-chip', 'immersion'];
const STATUS: T.PlannerPhase['status'][] = ['Planned', 'Approved', 'In delivery', 'Live'];

/** Racks and halls of a phase from its own density and hall load (falling back to the plan's). */
function derived(ph: T.PlannerPhase, ev?: Evaluation): { racks: number; halls: number } {
  const d = Number(ph.params?.densityKwPerRack ?? ev?.params['densityKwPerRack']?.value ?? 12) || 12;
  const h = Number(ph.params?.hallDesignKw ?? ev?.params['hallDesignKw']?.value ?? 1500) || 1500;
  return { racks: ph.itKw > 0 ? Math.ceil(ph.itKw / d) : 0, halls: ph.itKw > 0 ? Math.max(1, Math.ceil(ph.itKw / h)) : 0 };
}

/** Phase table: name, go-live, kW and the per-phase design inputs (density, cooling) that make a phase its own design unit. */
export function PhaseEditor({ phases, onChange, ev, showStatus, readOnly, layout = 'cards' }: { phases: T.PlannerPhase[]; onChange: (phases: T.PlannerPhase[]) => void; ev?: Evaluation; showStatus?: boolean; readOnly?: boolean; layout?: 'table' | 'cards' }) {
  const sorted = [...phases].sort((a, b) => a.goLive.localeCompare(b.goLive));
  const planDensity = ev?.params['densityKwPerRack']?.value;
  const planCooling = ev?.params['coolingType']?.value as T.PlannerCoolingType | undefined;
  const update = (id: string, p: Partial<T.PlannerPhase>) => onChange(phases.map(x => { if (x.id !== id) return x; const next = { ...x, ...p }; return { ...next, ...derived(next, ev) }; }));
  const setPhaseParam = (ph: T.PlannerPhase, key: string, value: number | string | undefined) => {
    const params = { ...(ph.params ?? {}) };
    if (value === undefined || value === '') delete params[key]; else params[key] = value;
    update(ph.id, { params: Object.keys(params).length ? params : undefined });
  };
  if (!sorted.length) return <p className="vw-label">No phases yet.</p>;
  if (layout === 'table') return (
    <div className="pn-tbl pn-phasetbl">
      <table className="nst-table">
        <thead><tr><th>Phase{showStatus ? ' and status' : ''}</th><th>Go-live</th><th>IT load</th><th title={planDensity !== undefined ? `Plan: ${planDensity} kW per rack` : undefined}>Density</th><th title={planCooling ? `Plan: ${COOLING_LABEL[planCooling] ?? planCooling}` : undefined}>Cooling</th><th aria-label="Actions" /></tr></thead>
        <tbody>{sorted.map(p => <tr key={p.id}>
          <td className="is-name"><span className="cell-2"><TextInput value={p.name} disabled={readOnly} onChange={v => update(p.id, { name: v })} />{showStatus && <SelectInput value={p.status} disabled={readOnly} options={STATUS.map(x => ({ id: x, label: x }))} onChange={v => update(p.id, { status: v })} />}</span></td>
          <td className="is-date"><TextInput type="date" value={toDateInput(p.goLive)} disabled={readOnly} onChange={v => update(p.id, { goLive: fromDateInput(v, p.goLive) })} /></td>
          <td className="is-kw"><span className="cell-2"><NumInput value={p.itKw} min={0} step={100} unit="kW" disabled={readOnly} onChange={v => v !== undefined && update(p.id, { itKw: v })} /><small>{num(p.racks)} racks · {num(p.halls)} hall{p.halls === 1 ? '' : 's'}</small></span></td>
          <td className="is-dens"><NumInput value={typeof p.params?.densityKwPerRack === 'number' ? p.params.densityKwPerRack : undefined} min={1} max={200} unit="kW" placeholder={planDensity !== undefined ? `${planDensity}` : 'plan'} disabled={readOnly} onChange={v => setPhaseParam(p, 'densityKwPerRack', v)} /></td>
          <td className="is-cool"><SelectInput value={typeof p.params?.coolingType === 'string' ? p.params.coolingType : ''} disabled={readOnly} options={[{ id: '', label: 'As plan' }, ...COOLING.map(c => ({ id: c, label: COOLING_LABEL[c] }))]} onChange={v => setPhaseParam(p, 'coolingType', v || undefined)} /></td>
          <td className="is-act">{!readOnly && phases.length > 1 && <Btn size="sm" variant="ghost" icon={I.Trash2} title={`Remove ${p.name}`} onClick={() => onChange(phases.filter(x => x.id !== p.id))} />}</td>
        </tr>)}</tbody>
      </table>
    </div>
  );
  return (<>
    {sorted.map(p => (
      <div key={p.id} className="pn-card2">
        <div className="pn-card2-body is-4" style={{ marginTop: 0 }}>
          <Field label="Phase"><TextInput value={p.name} disabled={readOnly} onChange={v => update(p.id, { name: v })} /></Field>
          <Field label="Go-live"><TextInput type="date" value={toDateInput(p.goLive)} disabled={readOnly} onChange={v => update(p.id, { goLive: fromDateInput(v, p.goLive) })} /></Field>
          <Field label="IT load" hint={`${num(p.racks)} racks in ${num(p.halls)} hall${p.halls === 1 ? '' : 's'}`}><NumInput value={p.itKw} min={0} step={100} unit="kW" disabled={readOnly} onChange={v => v !== undefined && update(p.id, { itKw: v })} /></Field>
          {showStatus ? <Field label="Status"><SelectInput value={p.status} disabled={readOnly} options={STATUS.map(s => ({ id: s, label: s }))} onChange={v => update(p.id, { status: v })} /></Field> : <span />}
          <Field label="Density"><NumInput value={typeof p.params?.densityKwPerRack === 'number' ? p.params.densityKwPerRack : undefined} min={1} max={200} unit="kW / rack" placeholder={planDensity !== undefined ? `plan ${planDensity}` : 'as plan'} disabled={readOnly} onChange={v => setPhaseParam(p, 'densityKwPerRack', v)} /></Field>
          <Field label="Cooling"><SelectInput value={typeof p.params?.coolingType === 'string' ? p.params.coolingType : ''} disabled={readOnly} options={[{ id: '', label: planCooling ? `As plan: ${COOLING_LABEL[planCooling] ?? planCooling}` : 'As plan' }, ...COOLING.map(c => ({ id: c, label: COOLING_LABEL[c] }))]} onChange={v => setPhaseParam(p, 'coolingType', v || undefined)} /></Field>
          <span />
          <span className="pn-row" style={{ justifyContent: 'flex-end', alignSelf: 'end' }}>{!readOnly && phases.length > 1 && <Btn size="sm" variant="ghost" icon={I.Trash2} onClick={() => onChange(phases.filter(x => x.id !== p.id))}>Remove</Btn>}</span>
        </div>
      </div>
    ))}
  </>);
}

const readLayout = (): 'table' | 'cards' => { try { return localStorage.getItem('pn.wizard.phaseLayout') === 'cards' ? 'cards' : 'table'; } catch { return 'table'; } };

export function PhasingPanel({ draft, patch, ev, readOnly, singlePhase }: StepProps & { singlePhase?: boolean }) {
  const [layout, setLayoutState] = useState<'table' | 'cards'>(readLayout);
  const setLayout = (v: 'table' | 'cards') => { setLayoutState(v); try { localStorage.setItem('pn.wizard.phaseLayout', v); } catch { /* private window */ } };
  const total = draft.phases.reduce((a, p) => a + p.itKw, 0);
  const remainder = draft.designPowerKw - total;
  const sorted = [...draft.phases].sort((a, b) => a.goLive.localeCompare(b.goLive));
  const add = () => {
    const last = sorted[sorted.length - 1];
    const goLive = last ? new Date(new Date(last.goLive).getTime() + 365 * 864e5).toISOString() : draft.targetGoLive;
    const itKw = Math.max(0, remainder);
    patch({ phases: [...draft.phases, { id: `PH-${Date.now().toString(36)}`, name: `Phase ${draft.phases.length + 1}`, goLive, itKw, ...phaseDerived(itKw, ev), status: 'Planned' }] });
  };
  const late = ev?.schedule.filter(x => x.late) ?? [];
  const mismatch = (ev?.sizing.phaseDesign ?? []).filter(x => x.mismatch);
  return (<>
    {singlePhase ? <p className="vw-label" style={{ margin: 0 }}>This plan goes live in one step on <b className="strong">{date(draft.targetGoLive)}</b> (set in Requirements).</p> : (<>
      <Sub extra={<span className="pn-row"><Chip tone={remainder === 0 ? 'success' : 'warning'} dot>{remainder === 0 ? `Sums to the ${kw(draft.designPowerKw)} design power` : remainder > 0 ? `${kw(remainder)} not yet phased` : `${kw(-remainder)} over the design power`}</Chip><Seg<'table' | 'cards'> size="sm" value={layout} onChange={setLayout} options={[{ id: 'table', label: 'Table', icon: I.Rows3 }, { id: 'cards', label: 'Cards', icon: I.LayoutGrid }]} />{!readOnly && <Btn size="sm" icon={I.Plus} onClick={add}>Add a phase</Btn>}</span>}>Phases</Sub>
      <PhaseEditor phases={draft.phases} onChange={phases => patch({ phases })} ev={ev} showStatus readOnly={readOnly} layout={layout} />
      <Note>Density and cooling left on “as plan” follow the plan; set them to make a phase its own design (for example an air-cooled first hall).</Note>
      <Sub>Capacity ladder</Sub>
      {ev && <PhaseLadder rows={ev.ladder} growthPctPerYear={draft.demand.growthPctPerYear} height={250} />}
      {ev && ev.ladder.length > 0 && <Tbl head={['Phase', 'Installed', 'Committed', 'Reserve', 'Usable', 'Binds first']}>
        {ev.ladder.map(r => <tr key={r.phase.id}><td><span className="cell-2"><b className="strong">{r.phase.name}</b><small>{date(r.phase.goLive)}</small></span></td><td className="num">{kw(r.installedKw)}</td><td className="num">{kw(r.committedKw)}</td><td className="num">{kw(r.reserveKw)}</td><td className="num">{kw(r.headroomKw)} · {r.usablePct}%</td><td><span className="cell-2"><Chip tone={r.bindingConstraint === 'none' ? 'success' : 'warning'} size="xs">{r.bindingConstraint === 'none' ? 'Nothing' : r.bindingConstraint}</Chip>{r.crossesWarningMonth !== undefined && <small>warning in {r.crossesWarningMonth} months</small>}</span></td></tr>)}
      </Tbl>}
    </>)}
    <OrderSchedule items={ev?.schedule ?? []} goLive={sorted[0]?.goLive ?? draft.targetGoLive} phases={sorted} />
    {late.length > 0 && <p className="note note--bad" style={{ marginTop: 8 }}><I.CircleAlert size={15} /><span>{late.length} item{late.length === 1 ? '' : 's'} cannot be ordered in time for {late.length === 1 ? 'its' : 'their'} phase: {late.map(x => `${x.item} (${x.phase})`).join(', ')}. Items from stock need only a transfer; the buffer is the schedule contingency.</span></p>}
    {mismatch.length > 0 && <p className="note note--warn" style={{ marginTop: 8 }}><I.TriangleAlert size={15} /><span>Phase records differ from the design: {mismatch.map(x => `${x.name}: ${x.racks} racks in ${x.halls} halls (record says ${x.storedRacks} / ${x.storedHalls})`).join('; ')}. {readOnly ? '' : ' Racks and halls follow from each phase’s load, density and hall size.'}</span>{!readOnly && <Btn size="sm" icon={I.RefreshCw} onClick={() => patch({ phases: draft.phases.map(ph => { const d = mismatch.find(x => x.phaseId === ph.id); return d ? { ...ph, racks: d.racks, halls: d.halls } : ph; }) })}>Refresh the records</Btn>}</p>}
  </>);
}

/* ------------------------------------------------------------------ what must be ordered when: lead-time chart or table, per phase */
function OrderSchedule({ items, goLive, phases }: { items: ScheduleItem[]; goLive: string; phases: T.PlannerPhase[] }) {
  const [phase, setPhase] = useState('all');
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [picked, setPicked] = useState<ScheduleItem | null>(null);
  const names = [...new Set(items.map(x => x.phase).filter(Boolean))];
  const sel = phase !== 'all' && names.includes(phase) ? phase : 'all';
  const shown = (sel === 'all' ? items : items.filter(x => x.phase === sel)).slice().sort((a, b) => a.orderBy.localeCompare(b.orderBy));
  const phGoLive = sel === 'all' ? goLive : phases.find(p => p.name === sel)?.goLive ?? goLive;
  const counts = { late: shown.filter(x => x.late).length, permits: shown.filter(x => x.kind === 'permit').length, gates: shown.filter(x => x.kind === 'gate').length };
  return <>
    <Sub extra={items.length > 0 && <span className="pn-row">
      {names.length > 1 && <SelectInput value={sel} options={[{ id: 'all', label: `Every phase (${items.length})` }, ...names.map(n => ({ id: n, label: `${n} (${items.filter(x => x.phase === n).length})` }))]} onChange={setPhase} style={{ height: 30, width: 'auto', minWidth: 180 }} />}
      <Seg<'chart' | 'table'> size="sm" value={view} onChange={setView} options={[{ id: 'chart', label: 'Chart', icon: I.ChartGantt }, { id: 'table', label: 'Table', icon: I.Rows3 }]} />
    </span>}>What must be ordered when</Sub>
    {!items.length ? <p className="vw-label">Add a phase to see order dates.</p> : <>
      <p className="pn-caption" style={{ marginTop: 0 }}>{shown.length} item{shown.length === 1 ? '' : 's'}{counts.permits ? ` · ${counts.permits} permit${counts.permits === 1 ? '' : 's'}` : ''}{counts.gates ? ` · ${counts.gates} gate${counts.gates === 1 ? '' : 's'}` : ''}{counts.late ? ` · ${counts.late} late` : ' · nothing late'}</p>
      {view === 'chart' ? <div className="pn-leadwrap"><LeadTimes items={items} phase={sel === 'all' ? undefined : sel} goLive={phGoLive} maxHeight={460} highlight={picked && shown.includes(picked) ? picked.item : undefined} onPick={it => setPicked(p => (p === it ? null : it))} />
        {picked && shown.includes(picked) ? <p className="pn-caption"><b className="strong">{picked.item}</b> · {picked.phase} · {picked.kind === 'gate' ? `gate on ${date(picked.needBy)}` : `${picked.leadWeeks} weeks${picked.bufferWeeks ? ` + ${picked.bufferWeeks} buffer` : ''}, order by ${date(picked.orderBy)}, needed ${date(picked.needBy)}`}{picked.late ? ' · late' : ''}</p> : <p className="pn-caption">Click a bar to pick out an item.</p>}</div>
        : <Tbl head={['Item', 'Phase', 'Kind', 'Lead time', 'Order by', 'Need by', 'Status']} maxHeight={440}>
          {shown.map((x, i) => <tr key={`${x.item}-${i}`}><td>{x.item}</td><td className="vw-label">{x.phase || '—'}</td><td>{x.kind === 'equipment' ? (x.source === 'stock' || x.source === 'site' ? 'From stock' : 'To buy') : x.kind === 'permit' ? 'Permit' : 'Gate'}</td><td className="num" style={{ whiteSpace: 'nowrap' }}>{x.kind === 'gate' ? '—' : `${x.leadWeeks} wk${x.bufferWeeks ? ` + ${x.bufferWeeks}` : ''}`}</td><td style={{ whiteSpace: 'nowrap' }}>{x.kind === 'gate' ? '—' : date(x.orderBy)}</td><td style={{ whiteSpace: 'nowrap' }}>{date(x.needBy)}</td><td>{x.late ? <Chip tone="error" size="xs" dot>Late</Chip> : x.status === 'ordered' ? <Chip tone="neutral" size="xs" dot>Ordered</Chip> : <Chip tone="success" size="xs" dot>On time</Chip>}</td></tr>)}
        </Tbl>}
    </>}
  </>;
}
