/* Plant upgrade wizard panels and plan views: the site's plant per system (Requirements), the power and cooling line-ups with what is
   added, replaced or uprated, the stages with their gates and the cut-in sequence. */
import * as I from 'lucide-react';
import { Btn, Chip } from '../../../../ui/kit';
import type * as T from '../../../../planner/p2b/types';
import { dcTypeProfile } from '../../../../planner/p2b/dcTypes';
import { POWER_SYSTEMS, SYSTEM_LABEL, type PlantAnalysis } from '../../../../planner/lib/plantModel';
import { plantOf } from '../../../../planner/lib/scopes/plant';
import { climateFromHint, fromDateInput, toDateInput, type StepProps } from '../../../../planner/lib/wizardModel';
import type { PlanViewProps } from '../types';
import { NumInput, SelectInput, TextInput, date, kw, money } from '../../common';
import { Sub } from '../../parts';
import { Note, Tbl, Tiles, dateTime } from '../../wizard/panelKit';
import { AsIsOneLine, PlantSystemsTable } from './PlantSystems';
import { CutInEditor, PlantLinesEditor, type Stage } from './PlantEditors';
import { CutInSequence, PlantSingleLine } from './drawings';
import '../../../../styles/planning-scopes.css';

const COOLING = ['chiller', 'cooling'] as const;
const stagesOf = (plan: T.PlannerPlan): Stage[] => { const ph = [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive)); return ph.length ? ph.map((p, i) => ({ stage: i + 1, name: p.name })) : [{ stage: 1, name: 'Stage 1' }]; };
const short = (s: string) => SYSTEM_LABEL[s as keyof typeof SYSTEM_LABEL].split(' (')[0].toLowerCase();

function Headline({ an }: { an: PlantAnalysis }) {
  const b = an.baseline!;
  return <Tiles items={[
    { label: 'IT load today', value: kw(b.itLoadKw), sub: `${kw(b.itReservedKw + b.itPipelineKw)} held by other plans` },
    { label: 'Site can accept today', value: kw(an.headroomBeforeKw), sub: b.binding ? `bound by ${short(b.binding)}` : 'no rated plant recorded' },
    { label: 'After the works', value: kw(an.capacityEnabledKw), tone: an.capacityEnabledKw > an.headroomBeforeKw ? 'ok' : undefined, sub: an.bindingAfter ? `bound by ${short(an.bindingAfter)}` : undefined },
    { label: 'Plant added', value: kw(an.addedPlantKw), sub: `${an.lines.length} line${an.lines.length === 1 ? '' : 's'}` },
  ]} />;
}
const Warnings = ({ an }: { an: PlantAnalysis }) => (an.baseline?.warnings.length ? <Note>{an.baseline.warnings.join('. ')}.</Note> : null);

/** Requirements: pick the live site and see its plant per system (not "free IT power"). */
export function PlantSitePicker({ draft, patch, data, ev, readOnly }: StepProps) {
  const an = plantOf(ev);
  const sites = data.dataCenters.filter(d => d.status === 'Operational' || d.status === 'Construction' || d.id === draft.dataCenterId).sort((a, b) => a.code.localeCompare(b.code));
  const pick = (id: string) => { const dc = data.dataCenters.find(d => d.id === id); if (!dc) return; const campus = data.campuses.find(c => c.id === dc.campusId); patch({ dataCenterId: dc.id, campusId: dc.campusId, regionId: campus?.regionId ?? draft.regionId, dcTypeKey: dc.dcTypeKey ?? draft.dcTypeKey, climate: climateFromHint(campus?.city) ?? draft.climate, newSiteName: undefined, plantLines: draft.dataCenterId === dc.id ? draft.plantLines : [], cutIns: draft.dataCenterId === dc.id ? draft.cutIns : [] }); };
  return (
    <div className="pn-col">
      <Note>A plant upgrade works on the plant a live site already has. Pick the site; its plant is read from the records per system, at the redundancy you target.</Note>
      <div style={{ maxWidth: 520 }}><SelectInput value={draft.dataCenterId} placeholder="Pick the site" disabled={readOnly} options={sites.map(d => ({ id: d.id, label: `${d.code} · ${d.name} · ${dcTypeProfile(d.dcTypeKey)?.name ?? 'kind not set'} · ${d.tier}${d.status !== 'Operational' ? ` · ${d.status}` : ''}` }))} onChange={pick} /></div>
      {draft.dataCenterId && !an?.ready && <Note>{an?.reason ?? 'Reading the site…'}</Note>}
      {an?.baseline && (<>
        <Headline an={an} />
        <PlantSystemsTable an={an} />
        <Note>Load to support: {kw(draft.designPowerKw)} of IT on top of {kw(an.baseline.committedItKw)} committed. * load estimated from the IT load where the plant has no meter reading.</Note>
        <Warnings an={an} />
      </>)}
    </div>
  );
}

export function PlantPowerPanel(props: StepProps) {
  const an = plantOf(props.ev);
  if (!an?.baseline) return <Note>{an?.reason ?? 'Pick the site in Requirements.'}</Note>;
  return (<>
    <Headline an={an} />
    <Sub>Power plant, as-is and to-be</Sub>
    <AsIsOneLine an={an} systems={['utility', 'transformer', 'generator', 'ups']} />
    <Sub>What is added, replaced or uprated</Sub>
    <PlantLinesEditor {...props} an={an} systems={POWER_SYSTEMS} stages={stagesOf(props.draft)} />
    <Sub>Per system</Sub>
    <PlantSystemsTable an={an} systems={POWER_SYSTEMS} />
    {an.runtimeAfterMin !== undefined && <Note>Battery runtime after the works: about {an.runtimeAfterMin} min at the planned load (recorded {an.baseline.runtimeMin} min at today&apos;s load).</Note>}
  </>);
}

export function PlantCoolingPanel(props: StepProps) {
  const an = plantOf(props.ev);
  if (!an?.baseline) return <Note>{an?.reason ?? 'Pick the site in Requirements.'}</Note>;
  return (<>
    <Sub>Cooling plant, as-is and to-be</Sub>
    <AsIsOneLine an={an} systems={['chiller', 'cooling']} />
    <Sub>Cooling zones</Sub>
    <Tbl head={['Zone', 'Units', 'Usable', 'Load', 'Headroom']} empty="No cooling zones recorded.">
      {an.baseline.zones.map(z => <tr key={z.zone.id}><td>{z.zone.name}</td><td className="num">{z.units.length}</td><td className="num">{kw(z.usableKw)}</td><td className="num">{kw(z.loadKw)}</td><td className={`num${z.usableKw - z.loadKw < 0 ? ' pn-bad' : ''}`}>{kw(z.usableKw - z.loadKw)}</td></tr>)}
    </Tbl>
    <Sub>What is added, replaced or uprated</Sub>
    <PlantLinesEditor {...props} an={an} systems={[...COOLING]} stages={stagesOf(props.draft)} />
    <Sub>Per system</Sub>
    <PlantSystemsTable an={an} systems={[...COOLING]} />
    <Warnings an={an} />
  </>);
}

/** Stages (each with its own items, handover and gates) and the cut-in sequence. */
export function PlantDeliveryPanel(props: StepProps) {
  const { draft, patch, ev, readOnly } = props;
  const an = plantOf(ev);
  const phases = [...draft.phases].sort((a, b) => a.goLive.localeCompare(b.goLive));
  const total = phases.reduce((a, p) => a + p.itKw, 0);
  const setPhase = (id: string, p: Partial<T.PlannerPhase>) => patch({ phases: draft.phases.map(x => (x.id === id ? { ...x, ...p } : x)) });
  const addStage = () => { const last = phases[phases.length - 1]; const goLive = last ? new Date(new Date(last.goLive).getTime() + 90 * 864e5).toISOString() : draft.targetGoLive; patch({ phases: [...draft.phases, { id: `PH-${Date.now().toString(36)}`, name: `Stage ${phases.length + 1}`, goLive, itKw: Math.max(0, draft.designPowerKw - total), racks: 0, halls: 0, status: 'Planned' }], targetGoLive: goLive > draft.targetGoLive ? goLive : draft.targetGoLive }); };
  return (<>
    <Sub extra={<span className="pn-row">{phases.length > 0 && <Chip tone={total === draft.designPowerKw ? 'success' : 'error'} dot>{kw(total)} of {kw(draft.designPowerKw)}</Chip>}{!readOnly && <Btn size="sm" icon={I.Plus} onClick={addStage}>Add a stage</Btn>}</span>}>Stages</Sub>
    <Tbl head={['Stage', 'Handover', 'Load it enables', 'Lines and gates', '']} empty="No stages yet.">
      {phases.map((p, i) => {
        const st = an?.stages.find(s => s.stage === i + 1);
        const items = (draft.plantLines ?? []).filter(l => (l.stage ?? 1) === i + 1).map(l => `${l.qty} × ${l.system}`).join(', ');
        return (
          <tr key={p.id}>
            <td style={{ minWidth: 150 }}><TextInput value={p.name} disabled={readOnly} onChange={v => setPhase(p.id, { name: v })} /></td>
            <td style={{ minWidth: 135 }}><TextInput type="date" value={toDateInput(p.goLive)} disabled={readOnly} onChange={v => setPhase(p.id, { goLive: fromDateInput(v, p.goLive) })} /></td>
            <td style={{ minWidth: 110 }}><NumInput value={p.itKw} min={0} step={100} unit="kW" disabled={readOnly} onChange={v => setPhase(p.id, { itKw: v ?? 0 })} /></td>
            <td className="is-wrap"><span className="cell-2"><span>{items || 'No lines in this stage'}</span>{st && <small>Method statement {date(st.mop)} · factory test {date(st.fat)} · delivery {date(st.delivery)}</small>}</span></td>
            <td>{!readOnly && phases.length > 1 && <Btn size="sm" variant="ghost" icon={I.Trash2} title="Remove the stage" onClick={() => patch({ phases: draft.phases.filter(x => x.id !== p.id) })} />}</td>
          </tr>
        );
      })}
    </Tbl>
    {phases.length > 0 && total !== draft.designPowerKw && <p className="field-error" style={{ marginTop: 6 }}>Stages enable {kw(total)}; the plan supports {kw(draft.designPowerKw)}. Make them match.</p>}
    <Sub>Cut-in sequence</Sub>
    <Note>Each step: what is taken out of service, how the live load is carried, the redundancy left, what is exposed, and how it is undone. A step whose remaining capacity is below the live load cannot be submitted.</Note>
    <div style={{ marginTop: 10 }}><CutInEditor {...props} an={an} stages={phases.map((p, i) => ({ stage: i + 1, name: p.name }))} /></div>
  </>);
}

/** Plan page tab and pack section: as-is / to-be, per system, and the cut-in sequence. */
export function PlantView({ ev, plan }: PlanViewProps) {
  const an = plantOf(ev);
  if (!an?.baseline) return <Note>{an?.reason ?? 'No site picked.'}</Note>;
  return (
    <div className="pn-col">
      <Headline an={an} />
      <div><Sub>Single-line after the works</Sub>{plan.plantLines?.length ? <PlantSingleLine an={an} mode="to-be" /> : <PlantSingleLine an={an} mode="as-is" />}</div>
      <PlantSystemsTable an={an} />
      {an.cutIns.length > 0 && <div><Sub>Cut-in sequence</Sub><CutInSequence an={an} /></div>}
      <CutInTable an={an} />
      <Note>{plan.plantLines?.length ?? 0} plant lines; CapEx {money(ev.estimate.capexTotal)} from the bill plus contingency; {money(ev.estimate.opexMonthly)} a month added OpEx.</Note>
    </div>
  );
}

/** The cut-in steps with the redundancy each leaves, what is exposed and the window. */
export function CutInTable({ an }: { an: PlantAnalysis }) {
  return (
    <Tbl head={['Step', 'Isolated and transfer', 'Left / live', 'Redundancy', 'Exposed', 'Window', 'Change']} empty="No cut-in steps.">
      {an.cutIns.map(c => (
        <tr key={c.step.id}>
          <td><span className="cell-2"><b className="strong">{c.order}. {c.step.title}</b><small>stage {c.step.stage ?? 1}</small></span></td>
          <td><span className="cell-2"><span>{c.isolated.map(u => u.name).join(', ') || 'Nothing isolated'}</span><small>{c.step.transfer}</small></span></td>
          <td className="num">{kw(c.remainingKw + c.temporaryKw)} / {kw(c.liveLoadKw)}</td>
          <td><Chip tone={!c.ok ? 'error' : c.redundancyLeft === 'N+1 or better' ? 'success' : 'warning'} size="xs" dot>{c.ok ? c.redundancyLeft : 'Short'}</Chip></td>
          <td className="is-wrap"><span className="cell-2"><span>{c.exposedRackIds.length} racks · {c.services} services{c.critical ? ` (${c.critical} critical)` : ''}</span>{c.customers.length > 0 && <small>{c.customers.slice(0, 2).map(x => x.name).join(', ')}{c.customers.length > 2 ? ` +${c.customers.length - 2}` : ''}</small>}</span></td>
          <td><span className="cell-2"><span className="nowrap">{dateTime(c.window.start)}</span><small>{c.window.proposed ? 'proposed' : 'set'}{c.clashes.length ? ` · ${c.clashes.length} clash${c.clashes.length === 1 ? '' : 'es'}` : ' · no clash'}</small></span></td>
          <td className="mono">{c.step.changeRequestId ?? '—'}</td>
        </tr>
      ))}
    </Tbl>
  );
}
