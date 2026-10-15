/* Generic result panels of the wizard's dimension steps: what the planner works out from the inputs (the inputs themselves are
   rendered once by DimensionStep). A plan family can replace any of them (scopes/<family>/index.tsx → panels); otherwise the panel
   picks the view for the plan type, as P2B's DimensionPanels do: placement for rack / pod, old-to-new for replacements, the phase
   editor with the capacity ladder for phased builds, cut-over waves for migrations. */
import { useState, type ReactNode } from 'react';
import * as I from 'lucide-react';
import { Chip, Seg } from '../../../ui/kit';
import type * as T from '../../../planner/p2b/types';
import type { DimensionKey } from '../../../planner/lib/dimensions';
import { COOLING_LABEL, type StepProps } from '../../../planner/lib/wizardModel';
import { Sub, Figs } from '../parts';
import { money, kw, num, pct, date, SourceChip } from '../common';
import { BuildingStack, HallLayout, SingleLine, Topology } from '../pack/drawings';
import { CashflowChart } from '../charts/Cashflow';
import { CostBreakdownChart } from '../charts/CostBreakdown';
import { BenchmarkBand } from '../charts/BenchmarkBand';
import { PermitsEditor, RisksEditor } from './editors';
import { PlacementPanel } from './PlacementStep';
import { ReplacementPanel } from './ReplacementPanel';
import { PhasingPanel } from './PhasingStep';
import { CutoverPanel } from './CutoverStep';
import { Tbl, Tiles } from './panelKit';

const evaluating = <p className="vw-label">Evaluating…</p>;
const m2 = (n: number) => `${num(n)} m²`;

/** A drawing inside a result panel: a title, one line of context, the drawing (schematic, not to scale). */
export function DrawCard({ title, sub, children, wide }: { title: string; sub?: ReactNode; children: ReactNode; wide?: boolean }) {
  return <figure className={`pn-drawcard${wide ? ' is-wide' : ''}`}><figcaption><b>{title}</b>{sub && <span>{sub}</span>}</figcaption>{children}</figure>;
}
const isLiquid = (ev: NonNullable<StepProps['ev']>) => ev.sizing.cooling.liquidRequired || ['liquid-to-chip', 'immersion'].includes(ev.sizing.cooling.type);

/* ------------------------------------------------------------------ space */
function SpacePanel(props: StepProps) {
  const { draft, ev, estate } = props;
  if (!ev) return evaluating;
  const s = ev.sizing;
  const density = Number(ev.params['densityKwPerRack']?.value ?? 0);
  if (draft.scope === 'rack' || draft.scope === 'pod') return <PlacementPanel {...props} />;
  if (draft.scope === 'rack-replace') return <ReplacementPanel {...props} />;
  if (draft.scope === 'server-refresh' || draft.scope === 'network-refresh') return <Tiles items={[
    { label: 'Racks affected', value: num(Number(draft.params.affectedRacks ?? 0)), sub: 'no new space needed' },
    { label: 'Devices affected', value: num(Number(draft.params.affectedCount ?? 0)) },
    { label: 'Load today', value: kw(Number(draft.params.affectedKw ?? 0)) },
    { label: 'Load after', value: kw(s.itKw), sub: 'newer equipment draws less' },
  ]} />;
  if (draft.scope === 'hall' || draft.scope === 'retrofit') {
    const hall = estate.halls.find(h => h.dataCenterId === draft.dataCenterId && h.id === draft.params.targetHallId);
    const free = hall ? hall.rackCapacity - hall.rackCount : undefined;
    return <Tiles items={[
      { label: 'Hall', value: hall?.name ?? 'Not chosen', sub: hall ? `${kw(hall.designPowerKw)} design · chosen in Requirements` : 'Pick it in Requirements', tone: hall ? undefined : 'bad' },
      { label: 'Racks needed', value: num(s.racks), sub: `${density} kW each` },
      { label: 'Free positions', value: free === undefined ? '—' : num(free), tone: free === undefined ? undefined : free >= s.racks ? 'ok' : 'bad', sub: free === undefined ? undefined : free >= s.racks ? 'enough room' : `${num(s.racks - free)} short` },
      { label: 'White space', value: m2(s.whiteSpaceM2), sub: 'for the new racks' },
    ]} />;
  }
  if (draft.scope === 'edge') {
    const n = Math.max(1, s.sites || s.halls);
    const one = { ...s, racks: Math.ceil(s.racks / n), halls: 1, itKw: s.itKw / n, rackClasses: s.rackClasses.map(c => ({ ...c, racks: Math.max(1, Math.round(c.racks / n)) })), cooling: { ...s.cooling, units: Math.max(1, Math.ceil(s.cooling.units / n)) } };
    return <>
      <Tiles items={[
        { label: 'Sites', value: num(s.sites || s.halls) },
        { label: 'Racks per site', value: num(Math.ceil(s.racks / n)), sub: `${density} kW each` },
        { label: 'IT per site', value: kw(s.itKw / n) },
        { label: 'Floor space per site', value: m2(Math.round(s.whiteSpaceM2 / n)) },
      ]} />
      <div className="pn-drawgrid"><DrawCard title="One edge site" sub={`${num(one.racks)} racks at ${density} kW, the same layout at every site`} wide><HallLayout sizing={one} densityKwPerRack={density} liquid={isLiquid(ev)} height={220} /></DrawCard></div>
    </>;
  }
  const b = s.building;
  const builds = draft.scope === 'new-dc' || draft.scope === 'expansion' || draft.scope === 'portfolio';
  return <>
    <Tiles items={[
      { label: 'Racks', value: num(s.racks), sub: `${density} kW each` },
      { label: 'Data halls', value: num(s.halls), sub: `${b.racksPerHall} racks, ${m2(b.hallWhiteSpaceM2)} each` },
      builds && { label: 'Floors used', value: num(b.floorsUsed), sub: `${b.hallsPerFloor} halls per floor` },
      builds && { label: 'Buildings', value: num(s.buildings), sub: `${b.floorsPerBuilding} floors each` },
      { label: 'White space', value: m2(s.whiteSpaceM2), sub: 'racks, aisles and containment' },
      builds && { label: 'Gross floor area', value: m2(s.grossAreaM2), sub: `${b.supportRatio}× white space` },
      builds && { label: 'Floor plate', value: m2(b.floorPlateM2), sub: 'one floor of one building' },
      builds && { label: 'Last building', value: `${b.lastBuildingHalls} of ${b.hallsPerBuilding} halls`, sub: b.lastBuildingHalls < b.hallsPerBuilding ? 'spare slots for growth' : 'full' },
    ]} />
    {s.halls > 0 && <div className="pn-drawgrid">
      {builds && <DrawCard title="Buildings and floors" sub={`${num(s.buildings)} building${s.buildings === 1 ? '' : 's'} · ${b.floorsPerBuilding} floor${b.floorsPerBuilding === 1 ? '' : 's'} · ${b.hallsPerFloor} hall${b.hallsPerFloor === 1 ? '' : 's'} per floor`}><BuildingStack sizing={s} height={230} /></DrawCard>}
      <DrawCard title="One data hall" sub={`${num(b.racksPerHall || Math.ceil(s.racks / Math.max(1, s.halls)))} racks · rows, containment and cooling units`} wide={!builds}><HallLayout sizing={s} densityKwPerRack={density} liquid={isLiquid(ev)} height={230} /></DrawCard>
    </div>}
    {s.rackClasses.length > 0 && <><Sub>Rack classes</Sub><Tbl head={['Rack class', 'kW per rack', 'Racks', 'Share', 'Cooling']}>{s.rackClasses.map(c => <tr key={c.name}><td>{c.name}</td><td className="num">{c.kw}</td><td className="num">{num(c.racks)}</td><td className="num">{pct(c.sharePct)}</td><td>{c.liquid ? `Liquid to chip (${c.capturePct}% captured)` : c.rearDoor ? 'Rear door' : 'Air'}</td></tr>)}</Tbl></>}
    {ev.ctx.site && <p className="vw-label" style={{ marginTop: 8 }}>At {ev.ctx.site.dc.name}: {num(ev.ctx.site.halls.reduce((a, h) => a + h.freePositions, 0))} free positions across {ev.ctx.site.halls.length} halls; {kw(ev.ctx.site.headroomItKw)} of IT headroom.</p>}
  </>;
}

/* ------------------------------------------------------------------ power */
function PowerPanel({ ev }: StepProps) {
  if (!ev) return evaluating;
  const s = ev.sizing;
  const redundancy = String(ev.params['redundancy']?.value ?? '2N');
  const hasPlant = s.itKw > 0 && s.plant.some(x => x.kind === 'feed' || x.kind === 'ups');
  return <>
    {s.facility && <Figs items={[['IT load', kw(s.facility.itKw)], ['Facility load', `${kw(s.facility.facilityKw)} · ${s.facility.mva} MVA`], ['Peak PUE', String(s.facility.peakPue)], ['Power factor', String(s.facility.powerFactor)]]} />}
    {hasPlant && <div className="pn-drawgrid"><DrawCard title="Single-line" sub={`Utility to IT load, ${redundancy}; generators and the cooling lane below`} wide><SingleLine sizing={s} redundancy={redundancy} height={260} /></DrawCard></div>}
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
    {s.plant.length > 0 && <><Sub>Plant</Sub><Tbl head={['Item', 'Count', 'Rating', 'Redundancy', 'Note']}>{s.plant.filter(p => !/crah|cdu|chiller|cool|rear/i.test(p.kind)).map((p, i) => <tr key={`${p.name}-${i}`}><td>{p.name}{p.model ? <small className="vw-label"> · {p.model}</small> : null}</td><td className="num">{p.count}</td><td className="num">{p.unitKva ? `${num(p.unitKva)} kVA` : kw(p.capacityKw)}</td><td>{p.redundancy}</td><td className="vw-label">{p.note ?? ''}</td></tr>)}</Tbl></>}
  </>;
}

/* ------------------------------------------------------------------ cooling */
function CoolingPanel({ ev }: StepProps) {
  if (!ev) return evaluating;
  const s = ev.sizing, c = s.cooling;
  return <>
    <Figs items={[['Method', COOLING_LABEL[c.type as T.PlannerCoolingType] ?? c.type], ['Capacity', `${kw(c.capacityKw)} · ${c.redundancy}`], ['Heat to liquid', kw(c.liquidKw)], ['Heat to air', kw(c.airKw)], ['Air units', `${c.air.units} × ${kw(c.air.unitKw)} ${c.air.label}`], ['CDUs', c.cdu ? `${c.cdu.units} × ${kw(c.cdu.unitKw)}` : '—'], ['Rear doors', num(c.rearDoors)], ['PUE', `${s.pue.value} (${s.pue.source})`]]} />
    {c.liquidRequired && <p className="note note--warn" style={{ marginTop: 8 }}><I.Droplets size={15} />Liquid cooling is required at this density (above the liquid threshold benchmark).</p>}
    {c.heatRejection?.streams?.length ? <div style={{ marginTop: 10 }}><Tbl head={['Heat stream', 'Heat', 'Loop', 'Rejected by']}>{c.heatRejection.streams.map(h => <tr key={h.label}><td>{h.label}</td><td className="num">{kw(h.heatKw)}</td><td className="num">{h.loopC} °C</td><td>{h.method}{h.trimPct ? ` (+${h.trimPct}% trim)` : ''}</td></tr>)}</Tbl></div> : null}
  </>;
}

/* ------------------------------------------------------------------ network */
function NetworkPanel(props: StepProps) {
  const { ev, draft } = props;
  if (draft.scope === 'network-refresh') return <ReplacementPanel {...props} />;
  if (!ev) return evaluating;
  const n = ev.sizing.network;
  return <>
    <Figs items={[['Leaf switches', num(n.leaves)], ['Spines', num(n.spines)], ['Core / border', num(n.cores)], ['Uplinks', `${num(n.uplinks)} × ${n.uplinkGbps}G`], ['Access ports', num(n.accessPorts)], ['Carriers', num(n.carriers)], ['Interconnect', n.dciGbps ? `${num(n.dciGbps)} Gbps${n.dciSource ? ` (${n.dciSource})` : ''}` : '—'], ['Oversubscription', String(ev.params.oversubscription?.value ?? '—')]]} />
    {(n.leaves > 0 || n.spines > 0 || n.cores > 0) && <div className="pn-drawgrid"><DrawCard title="Fabric topology" sub={`Core, spine and leaf pairs serving ${num(ev.sizing.racks)} racks`} wide><Topology network={n} racks={ev.sizing.racks} height={250} /></DrawCard></div>}
  </>;
}

/* ------------------------------------------------------------------ IT */
function ItPanel(props: StepProps) {
  const { ev, draft } = props;
  if (draft.scope === 'server-refresh') return <ReplacementPanel {...props} />;
  if (!ev) return evaluating;
  const s = ev.sizing, e = ev.estimate;
  return <>
    <Figs items={[['IT capacity', kw(s.itKw)], ['GPU share', pct(draft.demand.gpuPct)], ['Compute share', pct(draft.demand.computePct)], ['Storage share', pct(draft.demand.storagePct)], ['Operator owns the IT', ev.params.operatorOwnedIt?.value ? 'Yes' : 'No'], ['Owned IT CapEx', money(e.capex.filter(l => /IT|server|GPU|storage/i.test(l.category)).reduce((a, l) => a + l.amount, 0))], ['Spares', `${s.spares.lines} lines · ${money(s.spares.valueUsd)}`], ['Refresh cycle', `${ev.params.refreshYears?.value ?? '—'} years`]]} />
    {s.rackClasses.length > 0 && <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>{s.rackClasses.map(c => <Chip key={c.name} tone="neutral">{c.name}: {num(c.racks)} racks at {c.kw} kW</Chip>)}</div>}
    <p className="vw-label" style={{ marginTop: 8, fontSize: 12.5 }}>The mix comes from Requirements; change it there.</p>
  </>;
}

/* ------------------------------------------------------------------ fire and security, sustainability, operations */
function FireSecPanel({ ev }: StepProps) {
  if (!ev) return evaluating;
  return <Figs items={[['Suppression', String(ev.params.suppressionType?.value ?? '—')], ['Suppression zones', `${num(ev.sizing.halls)}, one per hall`], ['Detection', String(ev.params.detectionType?.value ?? 'VESDA')], ['Security zones', String(ev.params.securityZones?.value ?? '—')], ['Access control', String(ev.params.accessControl?.value ?? 'Two-factor into the hall')]]} />;
}
function SustainabilityPanel({ ev }: StepProps) {
  if (!ev) return evaluating;
  const u = ev.sustainability;
  return <Figs items={[['PUE', String(u.pue)], ['WUE', `${u.wue} L/kWh`], ['Energy per year', `${num(u.energyMwhYear)} MWh`], ['Carbon per year', `${num(u.carbonTYear)} t CO₂`], ['Renewable share', pct(u.renewableSharePct)], ['Heat reuse', `${num(u.heatReuseMwhYear)} MWh`]]} />;
}
function OperationsPanel({ ev }: StepProps) {
  if (!ev) return evaluating;
  const st = ev.sizing.staffing;
  return <>
    <Figs items={[['Operations staff', `${num(st.fte, 1)} FTE`], ['Per MW', `${st.perMw} FTE/MW (${st.source})`], ['Shifts', num(st.shifts)], ['Seats', st.seats ?? '—']]} />
    {st.plan?.length ? <div style={{ marginTop: 10 }}><Tbl head={['Phase', 'Cumulative load', 'FTE', 'Key hires by', 'Technicians by']}>{st.plan.map(p => <tr key={p.phaseId}><td>{p.name}</td><td className="num">{kw(p.cumulativeKw)}</td><td className="num">{num(p.fte, 1)}</td><td>{date(p.keyHireBy)}</td><td>{date(p.techHireBy)}</td></tr>)}</Tbl></div> : null}
    {st.basis && <p className="vw-label" style={{ marginTop: 8 }}>{st.basis}</p>}
  </>;
}

/* ------------------------------------------------------------------ delivery: phases, or one go-live */
const SINGLE_PHASE: T.PlannerScope[] = ['rack', 'pod', 'plant', 'network', 'migration'];
function DeliveryPanel(props: StepProps) {
  return <PhasingPanel {...props} singlePhase={SINGLE_PHASE.includes(props.draft.scope)} />;
}

/* ------------------------------------------------------------------ cost */
function CostPanel({ ev, draft, benchmarks }: StepProps) {
  const [mode, setMode] = useState<'capex' | 'opex'>('capex');
  if (!ev) return evaluating;
  const e = ev.estimate;
  const lines = mode === 'capex' ? e.capex : e.opex;
  const hurdle = e.discountPct ?? 8;
  return <>
    <Tiles items={[
      { label: 'CapEx', value: money(e.capexTotal), sub: <>{money(e.capexPerKw)} per kW {e.capex[0] && <SourceChip s={e.capex[0].source} />}</> },
      { label: 'Per rack', value: money(e.capexPerRack), sub: `all-in${e.it ? ' including IT' : ''} · contingency ${money(e.contingencyUsd ?? 0)}` },
      { label: 'OpEx per month', value: money(e.opexMonthly), sub: `${money(e.opexAnnual)} a year at steady state` },
      { label: 'Per kW-month', value: money(e.costPerKwMonth), sub: `${num(e.energyMwhYear)} MWh a year` },
      { label: 'NPV', value: money(e.npvUsd), tone: e.npvUsd === undefined ? undefined : e.npvUsd >= 0 ? 'ok' : 'bad', sub: `at the ${hurdle}% hurdle rate` },
      { label: 'IRR', value: e.irrPct == null ? '—' : `${e.irrPct}%`, tone: e.irrPct == null ? 'warn' : e.irrPct >= hurdle ? 'ok' : 'warn', sub: e.irrPct == null ? 'never turns positive' : 'over the horizon' },
      { label: 'Payback', value: e.paybackMonths == null ? '—' : `${e.paybackMonths} months`, tone: e.paybackMonths == null || e.paybackMonths > 96 ? 'warn' : 'ok', sub: e.paybackFacilityMonths !== undefined ? `facility only: ${e.paybackFacilityMonths === null ? 'none' : `${e.paybackFacilityMonths} months`}` : e.paybackMonths == null ? 'not within the horizon' : 'from the first spend' },
      { label: e.benefitAnnual ? 'Benefit per year' : 'Revenue per year', value: money(e.benefitAnnual || e.revenueAnnual), sub: e.energyRecoveredAnnual ? `+ ${money(e.energyRecoveredAnnual)} energy recovered` : e.benefitAnnual ? 'savings the works bring' : 'at target fill, steady state' },
    ]} />
    {(e.notes ?? []).length > 0 && <div className="note note--info pn-estnotes"><I.Info size={15} /><ul>{e.notes!.map(n => <li key={n}>{n}.</li>)}</ul></div>}
    {e.cashflow?.length ? <>
      <Sub extra={<span className="vw-label">{e.cashflow.length} years at the {hurdle}% hurdle rate</span>}>Cash flow by year</Sub>
      <CashflowChart years={e.cashflow} height={240} />
      {e.paybackBasis && <p className="pn-caption">{e.paybackBasis}</p>}
    </> : null}
    <Sub>Where the money goes</Sub>
    <CostBreakdownChart ev={ev} />
    {e.benchmarkBand && <>
      <Sub>Against the benchmark</Sub>
      <BenchmarkBand ev={ev} plan={draft} benchmarks={benchmarks} />
      {e.actualsCapexPerKw ? <p className="pn-caption">Our last builds of this kind came in at {money(e.actualsCapexPerKw)} per kW.</p> : null}
    </>}
    <Sub extra={<span className="row" style={{ gap: 10 }}><span className="vw-label">{lines.length} line{lines.length === 1 ? '' : 's'}</span><Seg<'capex' | 'opex'> size="sm" value={mode} onChange={setMode} options={[{ id: 'capex', label: 'CapEx' }, { id: 'opex', label: 'OpEx' }]} /></span>}>{mode === 'capex' ? 'CapEx lines' : 'OpEx lines, per month'}</Sub>
    <Tbl head={['Item', 'Basis', 'Source', mode === 'capex' ? 'Amount' : 'Per month']} empty="No lines." foot={<tr><td className="strong">Total</td><td /><td /><td className="num strong" style={{ whiteSpace: 'nowrap' }}>{money(mode === 'capex' ? e.capexTotal : e.opexMonthly)}</td></tr>}>
      {lines.map((l, i) => <tr key={i}><td>{l.item}</td><td className="vw-label">{l.basis}</td><td><SourceChip s={l.source} /></td><td className="num" style={{ whiteSpace: 'nowrap' }}>{money(l.amount)}</td></tr>)}
    </Tbl>
  </>;
}

/* ------------------------------------------------------------------ permits and risks */
function PermitsPanel({ draft, patch, readOnly }: StepProps) {
  return <>
    <PermitsEditor permits={draft.permits} target={draft.targetGoLive} scope={draft.scope} readOnly={readOnly} onChange={permits => patch({ permits })} />
    <RisksEditor risks={draft.risks} owner={draft.ownerName} readOnly={readOnly} onChange={risks => patch({ risks })} />
  </>;
}

export const DIMENSION_PANEL: Record<DimensionKey, (p: StepProps) => ReactNode> = {
  space: SpacePanel, power: PowerPanel, cooling: CoolingPanel, network: NetworkPanel, it: ItPanel, firesec: FireSecPanel,
  sustainability: SustainabilityPanel, operations: OperationsPanel, delivery: DeliveryPanel, migration: CutoverPanel, cost: CostPanel, permits: PermitsPanel,
};
