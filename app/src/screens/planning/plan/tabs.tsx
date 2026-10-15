/* Plan page tabs: what the engine worked out for the plan (overview, sizing with the hall and single-line drawings, capacity by phase
   with the ladder, cost with the cash-flow / breakdown / benchmark charts, rules), its delivery records, the frozen baseline and the
   history. The schedule tab lives in ./schedule.tsx. Round 2 of the planner gaps (14-Oct-2026): the best of DCOS and dcos-ops, without
   DCOS's three-column squeezes and half-width cost panels. */
import { useMemo, useState, type ReactNode } from 'react';
import * as I from 'lucide-react';
import { Link } from 'react-router-dom';
import { Btn, Chip, KV, Panel, Seg } from '../../../ui/kit';
import { DataTable, type Col } from '../../../ui/DataTable';
import { StatGrid, StatTile } from '../../../ui/Analytics';
import type * as T from '../../../planner/p2b/types';
import { WHOLE_SITE_SCOPES, type Evaluation, type EstimateLine, type LadderRow, type PlantItem } from '../../../planner/lib/engine';
import { COOLING_LABEL } from '../../../planner/lib/wizardModel';
import * as G from '../../../planner/lib/governance';
import { closeoutChecks } from '../../../planner/lib/closeout';
import type { PlannerData } from '../../../planner/lib/plannerData';
import { STEP_LABEL } from '../../../planner/lib/execute';
import { FAMILY_OF } from '../../../planner/lib/scopes';
import { plantOf } from '../../../planner/lib/scopes/plant';
import { useActuals, useDelivery, usePlanAudit, usePlans } from '../../../planner/lib/usePlanner';
import { Sub, KvList } from '../parts';
import { ASPECT_LABEL, FindingList, PlanStatusChip, SOURCE_LABEL, SourceChip, date, fmtValue, kw, money, num, pct } from '../common';
import { HallLayout, PhaseLadder, SingleLine } from '../pack/drawings';
import { CashflowChart } from '../charts/Cashflow';
import { CostBreakdownChart } from '../charts/CostBreakdown';
import { BenchmarkBand } from '../charts/BenchmarkBand';
import { AsIsOneLine } from '../scopes/plant/PlantSystems';
import { SiteChain } from '../scopes/inSite/common';
import { ParamPanel, SourcedValue, TileStrip } from './figures';

export interface TabProps { plan: T.PlannerPlan; ev: Evaluation; template?: T.PlannerTemplate; data: PlannerData; benchmarks?: T.PlannerBenchmark[] }
export { ScheduleTab } from './schedule';

const tone = (c?: 'bad' | 'warn' | 'ok') => (c === 'bad' ? 'pn-bad' : c === 'warn' ? 'pn-warn' : c === 'ok' ? 'pn-ok' : undefined);
const Tv = ({ t, children }: { t?: 'bad' | 'warn' | 'ok'; children: React.ReactNode }) => <span className={tone(t)}>{children}</span>;
const monthYear = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');

/* ================================================================== overview */
/** `deliverables`: the pack's deliverables with their state (PackDeliverables, rendered by the plan page, which has Delivery and the site). */
export function OverviewTab({ plan, ev, template, deliverables }: TabProps & { deliverables?: ReactNode }) {
  const fails = ev.findings.filter(f => f.status === 'fail'), warns = ev.findings.filter(f => f.status === 'warn');
  const departures = useMemo(() => Object.entries(ev.params).filter(([k, s]) => (s.source === 'user' || s.source === 'ai' || s.source === 'document') && ev.resolved?.params.find(p => p.key === k)?.default !== s.value), [ev.params, ev.resolved]);
  const [allDep, setAllDep] = useState(false);
  const shownDep = allDep ? departures : departures.slice(0, 8);
  const def = (k: string) => ev.resolved?.params.find(p => p.key === k);
  return (
    <div className="pn-cols">
      <div className="col" style={{ gap: 14 }}>
        <Panel title="The plan" icon={I.FileText} info="What was asked for, as entered in the wizard: the need, the workload and how critical it is.">
          {plan.intent && <p style={{ margin: '0 0 10px', fontSize: 13.5, lineHeight: 1.5 }}>{plan.intent}</p>}
          <KV cols={3} items={[['Requested by', plan.requestedBy], ['Owner', plan.ownerName], ['Template', `${template?.name ?? plan.templateId}${template ? ` v${template.version}` : ''}${plan.templateVersion ? ` (approved on v${plan.templateVersion})` : ''}`], ['Workload', `${plan.demand.gpuPct}% GPU · ${plan.demand.computePct}% compute · ${plan.demand.storagePct}% storage`], ['Tenancy', plan.demand.tenancy === 'multi' ? 'Several tenants' : 'Single'], ['Growth', `${plan.demand.growthPctPerYear}% a year`], ['Tier', String(ev.params.tier?.value ?? '—')], ['Redundancy', String(ev.params.redundancy?.value ?? '—')], ['Cooling', COOLING_LABEL[ev.params.coolingType?.value as T.PlannerCoolingType] ?? String(ev.params.coolingType?.value ?? '—')]]} />
          {plan.phases.length > 0 && <><Sub>Phases</Sub><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Phase</th><th>Go-live</th><th>IT</th><th>Racks</th><th>Halls</th><th>Status</th></tr></thead><tbody>{[...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive)).map(p => <tr key={p.id}><td>{p.name}</td><td className="nowrap">{date(p.goLive)}</td><td className="num">{kw(p.itKw)}</td><td className="num">{num(p.racks)}</td><td className="num">{num(p.halls)}</td><td><Chip tone={p.status === 'Live' ? 'success' : p.status === 'In delivery' ? 'warning' : 'neutral'} size="xs" dot>{p.status}</Chip></td></tr>)}</tbody></table></>}
        </Panel>
        <Panel title="Inputs changed from the template" icon={I.SlidersHorizontal} count={departures.length} flush={departures.length > 0} sub={template ? `${template.name} v${template.version}` : undefined}
          info="Every input whose value is not the template default: entered by the planner, proposed and accepted, or read from a document. Approvers read these first."
          actions={departures.length > 8 ? <Btn size="sm" variant="ghost" onClick={() => setAllDep(v => !v)}>{allDep ? 'Show fewer' : `Show all ${departures.length}`}</Btn> : undefined}>
          {departures.length === 0 ? <p className="vw-label" style={{ margin: 0 }}>Every input is at its template value.</p>
            : <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Input</th><th>Value</th><th>Template</th><th>Set by</th></tr></thead><tbody>{shownDep.map(([k, s]) => { const d = def(k); return <tr key={k}><td>{d?.label ?? k}</td><td className="num strong-num">{fmtValue(s.value, d?.unit)}</td><td className="num vw-label">{d?.default !== undefined ? fmtValue(d.default, d.unit) : '—'}</td><td><span className="cell-2"><span>{SOURCE_LABEL[s.source]}</span>{s.note && <small>{s.note}</small>}</span></td></tr>; })}</tbody></table>}
        </Panel>
        <Panel title="What the plan produces" icon={I.Package} info="The outputs the template defines (the Plan pack shows each one), and what execution creates in Delivery.">
          {deliverables ?? <div className="row wrap" style={{ gap: 6 }}>{(template?.outputs ?? []).map(o => <Chip key={o} tone="neutral">{o}</Chip>)}{template?.executesAs && <Chip tone="info">becomes a {template.executesAs}</Chip>}</div>}
          <KvList items={[['Approval path', template?.approvalPath.join(' → ') || 'none'], ['Rules checked', String(ev.findings.length)], ['Scenarios', plan.preferredScenarioId ? 'one preferred' : 'base case'], ['Permits', String(plan.permits.length)], ['Risks', String(plan.risks.length)], ['Conditions open', String((plan.conditions ?? []).filter(c => c.status === 'Open').length)]]} />
        </Panel>
      </div>
      <div className="col" style={{ gap: 14 }}>
        <Panel title="Rules that need attention" icon={I.TriangleAlert} count={fails.length + warns.length} info="Hard rules (must) block submission; soft rules (should) are acknowledged in the review.">
          <FindingList findings={[...fails, ...warns]} empty="Every rule passes." />
        </Panel>
        <Panel title="Readiness by area" icon={I.ListChecks} info="Share of each area's inputs confirmed by the planner, the requirements, a benchmark, an estate actual or a document; untouched template defaults do not count.">
          <ul className="pn-list">{ev.aspects.map(a => <li key={a.aspect}><span className="cell-2"><b style={{ fontWeight: 400 }}>{ASPECT_LABEL[a.aspect]}<small className="vw-label" style={{ marginLeft: 6 }}>{a.depth}</small></b><span className="pn-bar"><span className="bar" style={{ height: 6 }}><i style={{ width: `${a.pct}%`, background: a.pct >= 80 ? 'var(--vw-color-emerald-500)' : a.pct >= 50 ? 'var(--vw-color-amber-500)' : 'var(--vw-color-red-500)' }} /></span><small className="num">{a.answered}/{a.total}</small></span></span>{a.findings.some(f => f.status === 'fail') ? <Chip tone="error" size="xs">fail</Chip> : a.findings.some(f => f.status === 'warn') ? <Chip tone="warning" size="xs">warn</Chip> : <Chip tone="success" size="xs">pass</Chip>}</li>)}</ul>
        </Panel>
      </div>
    </div>
  );
}

/* ================================================================== sizing */
const KIND_LABEL: Record<PlantItem['kind'], string> = { feed: 'Grid supply path', substation: 'HV substation', transformer: 'Transformer', ups: 'UPS / DC plant', generator: 'Generator', pdu: 'Distribution', cooling: 'Air cooling', cdu: 'CDU', chiller: 'Chiller', 'heat-rejection': 'Heat rejection' };
export function SizingTab({ plan, ev }: TabProps) {
  const s = ev.sizing;
  const actuals = useActuals(plan.dcTypeKey);
  const fam = FAMILY_OF[plan.scope];
  const density = Number(ev.params.densityKwPerRack?.value ?? 0);
  const liquid = s.cooling.liquidKw > 0 || s.cooling.liquidRequired;
  const redundancy = String(ev.params.redundancy?.value ?? '2N');
  const hr = s.cooling.heatRejection;
  const plant = fam === 'plant' ? plantOf(ev) : undefined;
  const site = ev.ctx.site;
  const hallOk = s.halls > 0 && s.racks > 0 && fam !== 'plant';
  const lineOk = s.itKw > 0 && s.plant.some(x => x.kind === 'feed' || x.kind === 'ups') && fam !== 'plant';
  const siteChain = fam === 'in-site' && !!site;
  const classTotal = { racks: s.rackClasses.reduce((a, c) => a + c.racks, 0), kw: s.rackClasses.reduce((a, c) => a + c.racks * c.kw, 0) };
  const hallFigs: [string, React.ReactNode][] = [
    ['Hall design load', <SourcedValue s={ev.params.hallDesignKw} unit="kW" />], ['White space per hall', `${num(s.building.hallWhiteSpaceM2)} m² (${num(s.building.racksPerHall)} racks)`],
    ['Halls per floor', <SourcedValue s={ev.params.hallsPerFloor} />], ['Floors per building', <SourcedValue s={ev.params.floorsPerBuilding} />],
    ['Plant rooms', s.building.plantM2 ? `${num(s.building.plantM2)} m²` : '—'], ['Gross floor area', `${num(s.grossAreaM2)} m²`],
  ];
  const hallPanel = hallOk && <Panel key="hall" title="Typical hall" icon={I.LayoutGrid} sub={`${s.halls} hall${s.halls === 1 ? '' : 's'}${s.buildings ? ` · ${s.buildings} building${s.buildings === 1 ? '' : 's'}` : ''} · ${num(s.whiteSpaceM2)} m² white space`} info="One typical hall drawn from the sizing: rows of racks by class, cold-aisle containment, PDUs and the cooling units per hall. Not to scale.">
    <HallLayout sizing={s} densityKwPerRack={density} liquid={liquid} height={280} />
    {WHOLE_SITE_SCOPES.includes(plan.scope) && <div style={{ marginTop: 12 }}><KvList items={hallFigs} /></div>}
  </Panel>;
  const linePanel = lineOk && <Panel key="line" title="Power and cooling single-line" icon={I.Cable} actions={<Chip tone="neutral" size="xs">{redundancy} power · {s.cooling.redundancy} cooling</Chip>} info="The power paths from the utility feed to the IT load at the chosen redundancy, with generator backup and the heat-rejection chain.">
    <SingleLine sizing={s} redundancy={redundancy} height={280} />
  </Panel>;
  const chainPanel = siteChain && <Panel key="chain" title={`Site power chain · ${site!.dc.name}`} icon={I.Zap} info="The site's power chain at its redundancy: usable capacity, load today, IT headroom, and what is left after this plan."><SiteChain site={site} addKw={s.itKw} /></Panel>;
  const drawings = [hallPanel, linePanel || chainPanel].filter(Boolean);
  return (
    <div className="col" style={{ gap: 14 }}>
      {actuals.sampleSites > 0 && <div className="vw-card-section pn-actuals">
        <Chip tone="success" size="xs" dot>Estate actuals</Chip><span className="vw-label">{actuals.sampleSites} live site{actuals.sampleSites === 1 ? '' : 's'} of this type</span>
        {actuals.kwPerRack !== undefined && <span>Actual density <b>{actuals.kwPerRack} kW per rack</b> <small>vs {density} planned</small></span>}
        {actuals.pue !== undefined && <span>Achieved PUE <b>{actuals.pue}</b> <small>vs {s.pue.value} planned</small></span>}
        {actuals.capexPerKw !== undefined && <span>Delivered CapEx <b>{money(actuals.capexPerKw)} per kW</b></span>}
        {actuals.powerUtilPct !== undefined && <span>Power used <b>{pct(actuals.powerUtilPct)}</b> <small>of installed</small></span>}
      </div>}
      {(s.warnings ?? []).length > 0 && <div className="note note--warn"><I.TriangleAlert size={15} /><div><b>Design notes</b><ul className="pn-bullets">{s.warnings!.map(w => <li key={w}>{w}</li>)}</ul></div></div>}
      <TileStrip cols={6}>
        <StatTile label="IT load" value={kw(s.itKw)} sub={`${num(s.racks)} racks${s.halls ? ` in ${s.halls} hall${s.halls === 1 ? '' : 's'}` : ''}`} />
        <StatTile label="Design PUE" value={String(s.pue.value)} sub={s.facility ? `peak ${s.facility.peakPue} on the design day` : SOURCE_LABEL[s.pue.source].toLowerCase()} />
        {s.facility ? <StatTile label="Facility load" value={kw(s.facility.facilityKw)} sub="IT × peak PUE: what feeds and generators carry" /> : <StatTile label="Cooling" value={kw(s.cooling.capacityKw)} sub={s.cooling.redundancy} />}
        {s.facility ? <StatTile label="Apparent power" value={s.facility.mva >= 1 ? `${s.facility.mva} MVA` : `${num(s.facility.kva)} kVA`} sub={`${num(s.facility.kva)} kVA at ${s.facility.powerFactor} power factor`} /> : <StatTile label="Racks" value={num(s.racks)} sub={density ? `${density} kW per rack` : 'no new racks'} />}
        <StatTile label="Liquid / air heat" value={`${kw(s.cooling.liquidKw)} / ${kw(s.cooling.airKw)}`} sub="to CDUs / to air units" />
        {s.staffing.fte > 0 ? <StatTile label="Operations staff" value={`${num(s.staffing.fte, 1)} FTE`} sub={`${s.staffing.perMw} per MW`} /> : <StatTile label="Capacity made usable" value={kw(ev.estimate.capacityEnabledKw ?? s.itKw)} sub="IT the works let the site carry" />}
      </TileStrip>
      {s.power?.length ? <Panel title={`Power chain at ${redundancy}`} icon={I.Zap} flush count={s.power.length} info="Each stage must carry its load with the redundancy taken out: one side for 2N, all but the largest module for N+1.">
        <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Stage</th><th>Redundancy</th><th>Units</th><th>Usable at redundancy</th><th>Must carry</th><th>Check</th><th>Basis</th></tr></thead><tbody>{s.power.map(p => <tr key={p.key}><td className="strong">{p.label}</td><td>{p.redundancy}</td><td className="num nowrap">{p.count} × {p.unit}</td><td className="num">{kw(p.usableKw)}</td><td className="num">{kw(p.needKw)}</td><td><Chip tone={p.ok ? 'success' : 'error'} size="xs" dot>{p.ok ? 'Carries it' : 'Short'}</Chip></td><td className="is-wrap"><span className="cell-2"><small>{p.basis}</small><span><SourceChip s={p.source} short /></span></span></td></tr>)}</tbody></table>
      </Panel> : null}
      {plant?.baseline && <Panel title="Plant as-is and to-be" icon={I.Cable} info="Every plant unit in the site's records by system, the units this plan adds (dashed), replaces or uprates. The Plant and cut-ins tab has the cut-in sequence."><AsIsOneLine an={plant} /></Panel>}
      {drawings.length === 2 ? <div className="pn-two">{drawings}</div> : drawings}
      {s.rackClasses.length > 0 && <Panel title="Rack classes" icon={I.Server} count={s.rackClasses.length} flush info="Racks and kW per class add up to the design load; liquid classes send their captured share to the CDUs.">
        <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Class</th><th>Racks</th><th>kW per rack</th><th>Load</th><th>Share</th><th>Cooling</th><th>IT per rack</th></tr></thead>
          <tbody>{s.rackClasses.map(c => { const it = ev.estimate.it?.lines.find(l => l.className === c.name); return <tr key={c.name}><td className="strong">{c.name}</td><td className="num">{num(c.racks)}</td><td className="num">{c.kw}</td><td className="num">{kw(c.kw * c.racks)}</td><td className="num">{pct(c.sharePct)}</td><td>{c.liquid ? `Liquid to chip, ${c.capturePct}% to water` : c.rearDoor ? 'Rear door' : 'Air'}</td><td>{it ? `${it.perRack} × ${it.model}` : '—'}</td></tr>; })}</tbody>
          <tfoot><tr><td className="strong">Total</td><td className="num strong">{num(classTotal.racks)}</td><td /><td className="num strong">{kw(classTotal.kw)}</td><td colSpan={3} /></tr></tfoot></table>
      </Panel>}
      {s.plant.length > 0 && <Panel title="Plant" icon={I.Factory} count={s.plant.length} flush info="Every plant item the sizing calls for: unit rating, count, units per path and installed capacity.">
        <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Item</th><th>Kind</th><th>Unit</th><th>Count</th><th>Per path</th><th>Installed</th><th>Redundancy</th></tr></thead>
          <tbody>{s.plant.map((p, i) => <tr key={`${p.name}-${i}`}><td><span className="cell-2"><span>{p.name}</span>{(p.model || p.note) && <small>{[p.model, p.note].filter(Boolean).join(' · ')}</small>}</span></td><td>{KIND_LABEL[p.kind]}</td><td className="num nowrap">{p.unitKva ? `${num(p.unitKva)} kVA` : kw(p.capacityKw)}</td><td className="num">{num(p.count)}</td><td className="num">{p.perPath ?? '—'}</td><td className="num">{kw(p.capacityKw * p.count)}</td><td><Chip tone="neutral" size="xs">{p.redundancy}</Chip></td></tr>)}</tbody></table>
      </Panel>}
      <div className={s.network.leaves || s.network.carriers || s.network.dciGbps ? 'pn-two' : undefined}>
        <Panel title="Cooling and heat rejection" icon={I.Snowflake} actions={<Chip tone={liquid ? 'cyan' : 'neutral'} size="xs">{COOLING_LABEL[s.cooling.type as T.PlannerCoolingType] ?? s.cooling.type}</Chip>} info="Where the heat goes: liquid to CDUs, air to the room units, then out through coolers or chillers on the design day.">
          <KvList one items={[
            ['Cooling type', <SourcedValue s={ev.params.coolingType} />],
            ...(s.cooling.cdu ? [['CDUs', `${s.cooling.cdu.units} × ${kw(s.cooling.cdu.unitKw)} (${s.cooling.cdu.perHall} per hall)`] as [string, string]] : []),
            [s.cooling.air.label, s.cooling.air.units ? `${s.cooling.air.units} × ${kw(s.cooling.air.unitKw)}` : '—'],
            ['Redundancy', <SourcedValue s={ev.params.coolingRedundancy} />],
            ['Inlet setpoint', <SourcedValue s={ev.params.inletSetpointC} unit="°C" />],
            ['Design day', `${hr.designDryBulbC} °C dry bulb, ${hr.designWetBulbC} °C wet bulb`],
            ...hr.streams.map(st => [st.label, `${kw(st.heatKw)} at ${st.loopC} °C → ${st.method}${st.trimPct ? `, ${st.trimPct}% mechanical on the design day` : ''}`] as [string, string]),
            ...(hr.coolers ? [[hr.coolers.kind === 'adiabatic cooler' ? 'Adiabatic coolers' : 'Dry coolers', `${hr.coolers.units} × ${kw(hr.coolers.unitKw)}`] as [string, string]] : []),
            ...(hr.chillers ? [['Chillers', `${hr.chillers.units} × ${kw(hr.chillers.unitKw)} for ${kw(hr.chillers.trimKw)}`] as [string, string]] : []),
          ]} />
          {hr.source && <p className="vw-label pn-foot">{hr.source}</p>}
        </Panel>
        {(s.network.leaves || s.network.carriers || s.network.dciGbps) ? <Panel title="Network" icon={I.Network} info="Fabric sized from the racks: leaf pairs per rack group, spines at the oversubscription, carriers and the interconnect.">
          <KvList one items={[
            ['Leaves / spines / cores', `${s.network.leaves} / ${s.network.spines} / ${s.network.cores}`], ['Uplinks', `${num(s.network.uplinks)} × ${s.network.uplinkGbps}G`], ['Access ports', num(s.network.accessPorts)],
            ['Racks per leaf pair', <SourcedValue s={ev.params.racksPerLeafPair} />], ['Oversubscription', <SourcedValue s={ev.params.oversubscription} unit=":1" />],
            ['Carriers', <SourcedValue s={ev.params.carrierCount} />], ['WAN and interconnect', s.network.dciGbps ? `${num(s.network.dciGbps)} Gbps` : '—'],
          ]} />
          {s.network.dciSource && <p className="vw-label pn-foot">Interconnect: {s.network.dciSource}.</p>}
        </Panel> : null}
      </div>
      {(s.staffing.fte > 0 || s.spares.lines > 0) && <Panel title="Staffing and spares" icon={I.Users} info="Operations staff from the seats per shift and the day roles; key people are hired before each phase goes live, technicians later.">
        <div className={(s.staffing.plan ?? []).length ? 'pn-two is-inner' : undefined}>
          <KvList one items={[['Operations staff', <span className="pn-sv"><span>{num(s.staffing.fte, 1)} FTE</span><SourceChip s={s.staffing.source} short /></span>], ['Per MW', `${s.staffing.perMw} FTE`], ['How', s.staffing.basis ?? '—'], ['Spares', `${num(s.spares.lines)} lines · ${money(s.spares.valueUsd)}`], ['Spares held', <SourcedValue s={ev.params.sparesPct} unit="%" />]]} />
          {(s.staffing.plan ?? []).length > 0 && <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Phase</th><th>Seats</th><th>FTE</th><th>Key hires by</th><th>Technicians by</th></tr></thead><tbody>{s.staffing.plan!.map(x => <tr key={x.phaseId}><td>{x.name}</td><td className="num">{x.seats}</td><td className="num">{num(x.fte, 1)}</td><td className="nowrap">{monthYear(x.keyHireBy)}</td><td className="nowrap">{monthYear(x.techHireBy)}</td></tr>)}</tbody></table>}
        </div>
      </Panel>}
      {(s.phaseDesign ?? []).length > 0 && <Panel title="Phases as design units" icon={I.CalendarRange} count={s.phaseDesign!.length} flush info="Racks and halls per phase from the same model as the totals; a phase record that says otherwise is flagged.">
        <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Phase</th><th>Go-live</th><th>IT</th><th>Density</th><th>Cooling</th><th>Racks</th><th>Halls</th><th>Phase record</th></tr></thead>
          <tbody>{s.phaseDesign!.map(ph => <tr key={ph.phaseId}><td>{ph.name}</td><td className="nowrap">{monthYear(ph.goLive)}</td><td className="num">{kw(ph.itKw)}</td><td className="num">{ph.density} kW</td><td>{COOLING_LABEL[ph.coolingType] ?? ph.coolingType}</td><td className="num">{num(ph.racks)}</td><td className="num">{ph.halls}</td><td>{ph.mismatch ? <Chip tone="warning" size="xs" dot>says {ph.storedRacks} racks, {ph.storedHalls} halls</Chip> : <Chip tone="success" size="xs" dot>matches</Chip>}</td></tr>)}</tbody></table>
      </Panel>}
      <div className="pn-two">
        <ParamPanel ev={ev} title="Power inputs" icon={I.Zap} keys={['tier', 'redundancy', 'feedVoltage', 'gridOfferMva', 'peakPueFactor', 'powerFactor', 'transformerKva', 'upsModuleKw', 'generatorKva', 'upsRuntimeMin', 'generatorFuelHours']} />
        <div className="col" style={{ gap: 14 }}>
          <ParamPanel ev={ev} title="Space and safety inputs" icon={I.LayoutGrid} keys={['densityKwPerRack', 'gpuRackKw', 'computeRackKw', 'storageRackKw', 'hallDesignKw', 'whiteSpaceM2PerRack', 'plantM2PerMw', 'yardM2PerMw', 'floorLoadingKgPerRack', 'suppressionType', 'securityZones', 'commissioningLevel']} />
          <ParamPanel ev={ev} title="Cooling and sustainability inputs" icon={I.Leaf} keys={['liquidCapturePct', 'pueTarget', 'renewableSharePct']} />
        </div>
      </div>
    </div>
  );
}

/* ================================================================== capacity */
const BIND_TONE = { power: 'error', cooling: 'error', space: 'warning', grid: 'error', ports: 'warning', none: 'success' } as const;
const BIND_TEXT: Record<LadderRow['bindingConstraint'], string> = {
  power: 'Power binds first: usable headroom falls under 10% of installed capacity after the committed load and the reserve. Add plant or lower the reserve policy.',
  cooling: 'Cooling binds first: installed cooling does not cover the committed load with margin. Add cooling units or lower the density.',
  space: 'Space binds first: the halls planned for the phase cannot hold the committed load. Add a hall or raise the hall design load.',
  grid: 'The grid binds first: the phases install more IT than the grid intake can supply at the peak PUE. Get a larger grid offer, an uprate, or move the phase.',
  ports: 'Ports bind first: the fabric runs out of access ports before power does. Add leaf pairs.',
  none: 'Power, cooling, space and the grid all keep headroom through every phase.',
};
const head = (v: number | undefined, installed: number) => (v === undefined ? '—' : <span className={v < installed * 0.1 ? 'pn-bad' : undefined}>{v < 0 ? `${kw(-v)} short` : kw(v)}</span>);
export function CapacityTab({ plan, ev }: TabProps) {
  const site = ev.ctx.site;
  const binding = ev.ladder.find(l => l.bindingConstraint !== 'none');
  const b = ev.bindingConstraint;
  return (
    <div className="col" style={{ gap: 14 }}>
      <Panel title="Capacity by phase" icon={I.ChartColumn} info="Installed IT capacity as each phase goes live, against what is committed (live load, holds, approved plans, anchor and pre-let), the reserve policy and the headroom left; the demand line grows at the plan's growth rate."
        actions={<span className="row" style={{ gap: 6, fontSize: 12.5 }}><span className="vw-label">Reserve</span><SourcedValue s={ev.params.reservePct} unit="%" /><span className="vw-label">· growth {plan.demand.growthPctPerYear}% a year</span></span>}>
        {ev.ladder.length ? <PhaseLadder rows={ev.ladder} growthPctPerYear={plan.demand.growthPctPerYear} height={300} /> : <p className="vw-label" style={{ margin: 0 }}>No phases: add phases in the wizard to see the ladder.</p>}
        <div className={`note ${b === 'none' ? 'note--good' : b === 'space' || b === 'ports' ? 'note--warn' : 'note--bad'}`} style={{ marginTop: 12 }}>
          {b === 'none' ? <I.CheckCircle2 size={15} /> : <I.TriangleAlert size={15} />}
          <div><b>{b === 'none' ? 'Nothing binds' : `Binding constraint: ${b}`}{binding ? ` (from ${binding.phase.name})` : ''}.</b> {BIND_TEXT[b]}
            {binding && <div className="vw-label" style={{ marginTop: 4 }}>At {binding.phase.name}: {kw(binding.installedKw)} installed, {kw(binding.committedKw)} committed, {kw(binding.reserveKw)} reserve, {kw(binding.headroomKw)} usable headroom{binding.crossesWarningMonth !== undefined ? `; at ${plan.demand.growthPctPerYear}% growth the warning threshold is crossed about ${binding.crossesWarningMonth} months from now` : ''}.</div>}
            {ev.ladder[0]?.committedBasis && <div className="vw-label" style={{ marginTop: 4 }}>Committed load: {ev.ladder[0].committedBasis}.</div>}
          </div>
        </div>
      </Panel>
      {ev.ladder.length > 0 && <Panel title="Headroom by phase and dimension" icon={I.Layers} count={ev.ladder.length} flush info="Headroom left in each dimension after the committed load and the reserve, in IT kW; red when under 10% of installed capacity.">
        <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Phase</th><th>Installed</th><th>Committed</th><th>Reserve</th><th>Power</th><th>Cooling</th><th>Space</th><th>Grid</th><th>Racks / halls</th><th>Binds</th><th>Warning</th></tr></thead>
          <tbody>{ev.ladder.map(r => <tr key={r.phase.id}><td><span className="cell-2"><span>{r.phase.name}</span><small>{date(r.phase.goLive)} · {r.phase.status}</small></span></td><td className="num">{kw(r.installedKw)}</td><td className="num">{kw(r.committedKw)}</td><td className="num">{kw(r.reserveKw)}</td><td className="num">{head(r.headrooms?.power, r.installedKw)}</td><td className="num">{head(r.headrooms?.cooling, r.installedKw)}</td><td className="num">{head(r.headrooms?.space, r.installedKw)}</td><td className="num">{head(r.headrooms?.grid, r.installedKw)}</td><td className="num nowrap">{num(r.racks)} / {r.halls}</td><td><Chip tone={BIND_TONE[r.bindingConstraint]} size="xs" dot>{r.bindingConstraint === 'none' ? 'none' : r.bindingConstraint}</Chip></td><td className="nowrap">{r.crossesWarningMonth !== undefined ? `month ${r.crossesWarningMonth}` : '—'}</td></tr>)}</tbody></table>
      </Panel>}
      {site && <Panel title={`What ${site.dc.name} can take today`} icon={I.Building2} flush info="The site's power chain read from its records: usable capacity at each stage's redundancy, less live load, holds and approved plans."
        actions={<Chip tone={site.headroomItKw > 0 ? 'success' : 'error'} size="xs" dot>{kw(Math.max(0, site.headroomItKw))} free{site.binding ? ` · ${site.binding.label} binds` : ''}</Chip>}
        foot={<span className="vw-label">Live IT load {kw(site.itLoadKw)} · holds {kw(site.reservedKw)} ({site.holds.length}) · approved plans not yet held {kw(site.pipelineKw)}{site.pipeline.length ? ` (${site.pipeline.map(x => x.plnId).join(', ')})` : ''} · free rack positions {num(site.halls.reduce((a, h) => a + h.freePositions, 0))} · cooling headroom {kw(site.cooling.headroomKw)}</span>}>
        <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Stage</th><th>Redundancy</th><th>Usable</th><th>Load</th><th>IT headroom</th><th>Basis</th></tr></thead><tbody>{site.stages.map(st => <tr key={st.key}><td className="strong">{st.label}</td><td>{st.redundancy}</td><td className="num">{kw(st.usableKw)}</td><td className="num">{kw(st.loadKw)}</td><td className="num"><span className={st.headroomItKw < 0 ? 'pn-bad' : undefined}>{st.headroomItKw < 0 ? `${kw(-st.headroomItKw)} short` : kw(st.headroomItKw)}</span></td><td className="is-wrap vw-label">{st.basis}</td></tr>)}</tbody></table>
      </Panel>}
    </div>
  );
}

/* ================================================================== cost */
type LineRow = { id: string; item: string; amount: number; basis: string; source: T.PlannerParamSource; parts: number };
/** Lines grouped by item (several lines can price the same item: phases, sides), largest first. */
function byItem(lines: EstimateLine[] | undefined): LineRow[] {
  const m = new Map<string, LineRow>();
  for (const l of lines ?? []) { const r = m.get(l.item); if (r) { r.amount += l.amount; r.parts += 1; } else m.set(l.item, { id: l.item, item: l.item, amount: l.amount, basis: l.basis, source: l.source, parts: 1 }); }
  return [...m.values()].sort((a, b) => b.amount - a.amount);
}
function LineTable({ rows, total, unit }: { rows: LineRow[]; total: number; unit?: string }) {
  const cols: Col<LineRow>[] = [
    { key: 'item', header: 'Line', wrap: true, render: r => <span className="cell-2"><span>{r.item}</span><small>{r.parts > 1 ? `${r.parts} lines · ` : ''}{r.basis}</small></span> },
    { key: 'src', header: 'Source', render: r => <SourceChip s={r.source} short /> },
    { key: 'amt', header: `Amount${unit ? ` ${unit}` : ''}`, render: r => <span className="num nowrap">{money(r.amount)}</span>, sort: r => r.amount },
    { key: 'share', header: 'Share', render: r => <span className="pn-share"><i style={{ width: `${total ? Math.max(2, (r.amount / total) * 100) : 0}%` }} /><b>{total ? pct((r.amount / total) * 100) : '—'}</b></span>, sort: r => r.amount },
  ];
  return <DataTable rows={rows} cols={cols} pageSize={12} compact />;
}
export function CostTab({ plan, ev, benchmarks = [] }: TabProps) {
  const e = ev.estimate;
  const band = e.benchmarkBand;
  const inBand = band ? e.capexPerKw >= band.low * 0.8 && e.capexPerKw <= band.high * 1.05 : undefined;
  const hurdle = e.discountPct ?? 8;
  const recon = ev.reconciliation;
  const capexRows = useMemo(() => byItem(e.capex), [e.capex]);
  const opexRows = useMemo(() => byItem(e.opex), [e.opex]);
  const benefitRows = useMemo(() => byItem(e.benefitLines), [e.benefitLines]);
  const cf = e.cashflow ?? [];
  // only the inputs this plan carries (a network or refresh plan has no fill, anchor or pre-let)
  const has = (rows: [string, React.ReactNode][]) => rows.filter(([, v]) => { const pr = (v as { props?: { s?: unknown } } | null)?.props; return !pr || !('s' in pr) || pr.s !== undefined; });
  const hasDep = cf.some(y => y.depreciation), hasTax = cf.some(y => y.tax), hasBen = cf.some(y => y.benefit);
  return (
    <div className="col" style={{ gap: 14 }}>
      <TileStrip cols={4}>
        <StatTile label="CapEx" value={money(e.capexTotal)} sub={e.capexPerRack ? `${money(e.capexPerRack)} per rack all-in` : e.basis === 'bottom-up' ? 'priced bottom-up from the bill' : 'from the benchmarks'} />
        <StatTile label="Fit-out per kW" value={e.capexPerKw ? <Tv t={inBand === false ? 'warn' : undefined}>{money(e.capexPerKw)}</Tv> : '—'} sub={band ? `benchmark ${money(band.low)} to ${money(band.high)}` : 'no benchmark for this plan type'} subTone={inBand === false ? 'warn' : undefined} />
        <StatTile label="Contingency" value={money(e.contingencyUsd ?? 0)} sub="its own line, on the works" />
        <StatTile label="OpEx per month" value={money(e.opexMonthly)} sub={`${money(e.opexAnnual)} a year at steady state`} />
        <StatTile label="NPV" value={<Tv t={e.npvUsd === undefined ? undefined : e.npvUsd >= 0 ? 'ok' : 'bad'}>{e.npvUsd === undefined ? '—' : money(e.npvUsd)}</Tv>} sub={`at a ${hurdle}% hurdle rate`} />
        <StatTile label="IRR" value={<Tv t={e.irrPct == null ? 'warn' : e.irrPct >= hurdle ? 'ok' : 'warn'}>{e.irrPct == null ? '—' : `${e.irrPct}%`}</Tv>} sub={e.irrPct == null ? 'the cash flow never turns positive' : e.irrPct >= hurdle ? 'above the hurdle rate' : 'below the hurdle rate'} />
        <StatTile label="Payback" value={<Tv t={e.paybackMonths == null || e.paybackMonths > 96 ? 'warn' : undefined}>{e.paybackMonths == null ? 'None' : `${e.paybackMonths} mo`}</Tv>} sub={e.paybackFacilityMonths !== undefined ? `facility only: ${e.paybackFacilityMonths === null ? 'none' : `${e.paybackFacilityMonths} mo`}` : e.revenueAnnual || e.benefitAnnual ? 'from the first spend' : 'no revenue or benefit'} />
        <StatTile label="Depreciation" value={money(e.depreciationAnnual ?? 0)} sub="a year once every phase is live" />
      </TileStrip>
      {plan.baseline && <p className="note note--info"><I.Lock size={15} /><span>Approved baseline {money(plan.baseline.capexTotal)} CapEx and {money(plan.baseline.opexMonthly)} OpEx per month, frozen {date(plan.baseline.at)} on {plan.baseline.scenarioName ?? 'the base case'}. The figures below are the live evaluation.</span></p>}
      {(e.notes ?? []).length > 0 && <div className="note note--warn"><I.TriangleAlert size={15} /><div><b>Read with the figures</b><ul className="pn-bullets">{e.notes!.map(n => <li key={n}>{n}</li>)}</ul></div></div>}
      {cf.length > 0 && <Panel title="Cash flow by year" icon={I.ChartLine} sub={`${cf.length} years · ${e.paybackBasis}`} info="CapEx below the axis, operating cash (revenue and benefits less OpEx and tax) above it, and the cumulative position as a line; payback is where it crosses zero.">
        <CashflowChart years={cf} height={260} />
        <div className="pn-cf-table"><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Year</th><th>CapEx</th><th>Revenue</th>{hasBen && <th>Benefits</th>}<th>OpEx</th>{hasDep && <th>Depreciation</th>}{hasTax && <th>Tax</th>}<th>Net cash</th><th>Cumulative</th></tr></thead>
          <tbody>{cf.map(y => <tr key={y.year}><td className="nowrap">{y.label}</td><td className="num">{money(y.capex)}</td><td className="num">{money(y.revenue)}</td>{hasBen && <td className="num">{money(y.benefit)}</td>}<td className="num">{money(y.opex)}</td>{hasDep && <td className="num">{money(y.depreciation ?? 0)}</td>}{hasTax && <td className="num">{money(y.tax ?? 0)}</td>}<td className={`num${y.net < 0 ? ' pn-bad' : ''}`}>{money(y.net)}</td><td className={`num${y.cumulative < 0 ? ' pn-bad' : ''}`}>{money(y.cumulative)}</td></tr>)}</tbody></table></div>
      </Panel>}
      <Panel title="Where the money goes" icon={I.ChartPie} info="CapEx and OpEx by line: the chart switches between the two; the tables list every line with its basis, where the figure came from and its share.">
        <CostBreakdownChart ev={ev} />
        <div className="pn-two is-inner" style={{ marginTop: 12 }}>
          <div><Sub extra={<span className="num strong">{money(e.capexTotal)}</span>}>CapEx by line</Sub><LineTable rows={capexRows} total={e.capexTotal} /></div>
          <div><Sub extra={<span className="num strong">{money(e.opexMonthly)} / month</span>}>OpEx by line, a year</Sub><LineTable rows={opexRows} total={e.opexAnnual} /><p className="vw-label pn-foot">{num(e.energyMwhYear)} MWh a year at PUE {ev.sizing.pue.value}; {num(ev.sustainability.carbonTYear)} t CO₂ with {ev.sustainability.renewableSharePct}% renewables.</p></div>
        </div>
      </Panel>
      {benefitRows.length > 0 && <Panel title="Benefits a year" icon={I.Gift} actions={<Chip tone="success" size="xs">{money(e.benefitAnnual ?? 0)}</Chip>} info="What the plan saves or enables each year: energy, support, lease, circuits; counted in the cash flow."><LineTable rows={benefitRows} total={e.benefitAnnual ?? 0} /></Panel>}
      {recon && WHOLE_SITE_SCOPES.includes(plan.scope) && <Panel title="Estimate against the bill of materials" icon={I.Scale} flush actions={<Chip tone={Math.abs(recon.gapPct) <= 15 ? 'success' : 'warning'} size="xs">{recon.gapPct > 0 ? '+' : ''}{recon.gapPct}%</Chip>}
        info="Whole-site plans are estimated from benchmarks; the bill of materials prices the same categories bottom-up. Land, shell, design and contingency have no bill counterpart. A gap above 15% raises a warning (R-FIN-04)."
        foot={<span className="vw-label">A gap above 15% raises a warning (R-FIN-04): explain it or align the bill and the estimate before approval.</span>}>
        <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Estimate line</th><th>Estimate</th><th>Bill of materials</th><th>Bill categories</th></tr></thead>
          <tbody>{recon.rows.map(r => <tr key={r.item}><td>{r.item}</td><td className="num">{money(r.estimate)}</td><td className="num">{r.categories.length ? money(r.bom) : <span className="vw-label">not in the bill</span>}</td><td className="vw-label">{r.categories.join(', ') || '—'}</td></tr>)}</tbody>
          <tfoot><tr><td>Bill of materials</td><td /><td className="num">{money(recon.bomTotal)}</td><td /></tr><tr><td>+ lines the bill does not cost{recon.uncosted.length ? ` (${recon.uncosted.map(u => u.item.toLowerCase()).join(', ')})` : ''}</td><td /><td className="num">{money(recon.reconciledTotal - recon.bomTotal)}</td><td /></tr><tr><td className="strong">Reconciled total against the estimate</td><td className="num strong">{money(recon.estimateTotal)}</td><td className="num strong">{money(recon.reconciledTotal)}</td><td>{recon.gapUsd > 0 ? '+' : '−'}{money(Math.abs(recon.gapUsd))}</td></tr></tfoot></table>
      </Panel>}
      <div className="pn-two">
        <Panel title="Benchmark band" icon={I.Ruler} info="Fit-out CapEx per kW against the benchmark band for this site type; land, shell, IT and contingency are separate lines.">
          <BenchmarkBand ev={ev} plan={plan} benchmarks={benchmarks} />
          <div style={{ marginTop: 12 }} /><KvList one items={has([['Fit-out CapEx per kW', <SourcedValue s={ev.params.capexPerKw} unit="USD/kW" />], ['Shell and core', <SourcedValue s={ev.params.shellCostPerM2} unit="USD/m²" />], ['Land', <SourcedValue s={ev.params.landCostUsd} unit="USD" />], ['Cost contingency', <SourcedValue s={ev.params.costContingencyPct} unit="%" />], ['Tariff', <SourcedValue s={ev.params.tariffUsdPerKwh} unit="USD/kWh" />], ['Plant maintenance', <SourcedValue s={ev.params.maintenancePctCapex} unit="% of MEP" />]])} />
        </Panel>
        <Panel title="Business case inputs" icon={I.Briefcase} info="What the revenue, payback and investment measures rest on, with where each input came from.">
          <KvList one items={has([
            ['Revenue or charge-back', <SourcedValue s={ev.params.revenuePerKwMonth} unit="USD/kW-month" />], ['Target fill', <SourcedValue s={ev.params.targetFillPct} unit="%" />], ['Fill ramp', <SourcedValue s={ev.params.fillRampMonths} unit="months" />],
            ['Anchor contract', <SourcedValue s={ev.params.anchorKw} unit="kW" />], ['Pre-let', <SourcedValue s={ev.params.preLetPct} unit="%" />], ['IT draw of sold capacity', <SourcedValue s={ev.params.itDrawPct} unit="%" />],
            ['Hurdle rate', <SourcedValue s={ev.params.hurdlePct} unit="%" />], ['Tax rate', <SourcedValue s={ev.params.taxRatePct} unit="%" />], ['Operator owns the IT', <SourcedValue s={ev.params.operatorOwnedIt} />], ['IT refresh', <SourcedValue s={ev.params.refreshYears} unit="years" />],
            ['Revenue a year (steady state)', e.revenueAnnual ? money(e.revenueAnnual) : '—'], ['Energy recovered from tenants', e.energyRecoveredAnnual ? money(e.energyRecoveredAnnual) : plan.demand.tenancy === 'multi' ? '—' : 'single tenant: not recovered'],
          ])} />
        </Panel>
      </div>
    </div>
  );
}

/* ================================================================== rules */
type RFilter = 'all' | 'fail' | 'warn' | 'pass';
export function RulesTab({ ev }: TabProps) {
  const [filter, setFilter] = useState<RFilter>('all');
  const n = (s: string) => ev.findings.filter(f => f.status === s).length;
  const groups = useMemo(() => {
    const by = new Map<T.PlannerAspect, typeof ev.findings>();
    for (const f of ev.findings) { if (filter !== 'all' && f.status !== filter) continue; by.set(f.rule.aspect, [...(by.get(f.rule.aspect) ?? []), f]); }
    const rank = (fs: typeof ev.findings) => (fs.some(f => f.status === 'fail') ? 0 : fs.some(f => f.status === 'warn') ? 1 : 2);
    return [...by.entries()].sort((a, b) => rank(a[1]) - rank(b[1]));
  }, [ev, filter]);
  return (
    <div className="col" style={{ gap: 14 }}>
      <TileStrip cols={4}>
        <StatTile label="Rules checked" value={ev.findings.length} sub={`from ${ev.resolved?.chain.map(c => c.name).join(' → ') ?? 'the template'}`} />
        <StatTile label="Hard fails" value={<Tv t={n('fail') ? 'bad' : 'ok'}>{n('fail')}</Tv>} sub="block submission" onClick={n('fail') ? () => setFilter(f => (f === 'fail' ? 'all' : 'fail')) : undefined} active={filter === 'fail'} />
        <StatTile label="Warnings" value={<Tv t={n('warn') ? 'warn' : 'ok'}>{n('warn')}</Tv>} sub="soft rules, acknowledged in the review" onClick={n('warn') ? () => setFilter(f => (f === 'warn' ? 'all' : 'warn')) : undefined} active={filter === 'warn'} />
        <StatTile label="Pass" value={n('pass')} sub={`${n('n/a')} not applicable`} onClick={() => setFilter(f => (f === 'pass' ? 'all' : 'pass'))} active={filter === 'pass'} />
      </TileStrip>
      <Panel title="Findings by area" icon={I.ShieldCheck} info="Every rule of the template chain with its id, whether it is a must (hard) or should (soft), the value measured, the standard or source it comes from and its threshold."
        actions={<Seg size="sm" value={filter} onChange={setFilter} options={[{ id: 'all', label: `All ${ev.findings.length}` }, { id: 'fail', label: `Fail ${n('fail')}` }, { id: 'warn', label: `Warn ${n('warn')}` }, { id: 'pass', label: `Pass ${n('pass')}` }]} />}>
        {!groups.length && <p className="vw-label" style={{ margin: 0 }}>No rule matches this filter.</p>}
        <div className="col" style={{ gap: 16 }}>{groups.map(([a, fs]) => <div key={a}><Sub extra={<span className="vw-label">{fs.length} rule{fs.length === 1 ? '' : 's'}</span>}>{ASPECT_LABEL[a]}</Sub><FindingList findings={fs} rich /></div>)}</div>
      </Panel>
    </div>
  );
}

/* ================================================================== history */
const OUTCOME_TONE = { Approved: 'success', Rejected: 'error', Withdrawn: 'neutral', Superseded: 'neutral' } as const;
const when = (iso?: string) => (iso ? `${date(iso)} ${new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}` : '—');
/** The plan's revision chain: the first plan and every revision after it, in order. */
function useChain(plan: T.PlannerPlan) {
  const plans = usePlans();
  return useMemo(() => {
    const byId = new Map(plans.map(p => [p.id, p])); let root = plan; const seen = new Set<string>();
    while (root.revisionOf && byId.get(root.revisionOf) && !seen.has(root.id)) { seen.add(root.id); root = byId.get(root.revisionOf)!; }
    const out: T.PlannerPlan[] = [root];
    for (let cur = root; ;) { const nx = plans.find(p => p.revisionOf === cur.id); if (!nx || out.includes(nx)) break; out.push(nx); cur = nx; }
    return { chain: out, parent: plan.revisionOf ? byId.get(plan.revisionOf) : undefined };
  }, [plans, plan]);
}
export function HistoryTab({ plan }: TabProps) {
  const audit = usePlanAudit(plan.id);
  const { chain } = useChain(plan);
  const rounds = [...(plan.approvals.length ? [{ round: G.currentRound(plan), submittedAt: plan.submittedAt ?? '', submittedBy: plan.submittedBy ?? '', approvals: plan.approvals, outcome: (plan.status === 'Rejected' ? 'Rejected' : plan.status === 'In review' ? 'Withdrawn' : 'Approved') as T.PlannerApprovalRound['outcome'], current: true, amountUsd: plan.approvalAmountUsd, band: plan.approvalBand }] : []), ...[...(plan.approvalHistory ?? [])].reverse()];
  return (
    <div className="pn-cols is-wide">
      <Panel title="Audit trail" icon={I.History} count={audit.length} info="Every change to the plan, field by field, with who made it and the reason given.">
        {audit.length ? <ul className="pl-hist">{audit.map(a => <li key={a.id}><small>{when(a.timestamp)}</small><span><b>{a.actorName}</b> — {a.summary}{a.reason ? <small> · reason: {a.reason}</small> : null}{a.changes?.length ? <small>{G.changesText(a.changes, 3)}</small> : null}</span></li>)}</ul> : <p className="vw-label" style={{ margin: 0 }}>Created {date(plan.createdAt)} by {plan.createdBy}; no change since.</p>}
      </Panel>
      <div className="col" style={{ gap: 14 }}>
        <Panel title="Revisions" icon={I.GitBranch} count={chain.length} info="The plan and its revisions in order. A revision gets its own approval round; once approved it supersedes the one before and takes over its delivery records.">
          <ul className="pn-list">{chain.map(p => <li key={p.id}><Chip tone="neutral" size="xs">Rev {p.revision ?? 'A'}</Chip><span className="cell-2">{p.id === plan.id ? <b style={{ fontWeight: 500 }}>{p.plnId} (this plan)</b> : <Link className="ent-link mono" to={`/planning/plans/${p.id}`}>{p.plnId}</Link>}<small>{p.baseline ? `baseline ${money(p.baseline.capexTotal)}, frozen ${date(p.baseline.at)}` : `created ${date(p.createdAt)}`}</small></span>{p.supersededBy ? <Chip tone="neutral" size="xs">Superseded</Chip> : <PlanStatusChip s={p.status} size="xs" />}</li>)}</ul>
        </Panel>
        <Panel title="Approval rounds" icon={I.ShieldCheck} count={rounds.length}>
          {rounds.length ? rounds.map(r => <div key={`${r.round}-${r.submittedAt}`} style={{ marginBottom: 12 }}><div className="row between"><b style={{ fontSize: 13 }}>Round {r.round}{'current' in r ? ' (current)' : ''}</b><Chip tone={'current' in r && plan.status === 'In review' ? 'warning' : OUTCOME_TONE[r.outcome]} size="xs" dot>{'current' in r && plan.status === 'In review' ? 'Open' : r.outcome}</Chip></div><small className="vw-label">Submitted {date(r.submittedAt)} by {r.submittedBy}{r.amountUsd ? ` · ${money(r.amountUsd)}${r.band ? ` · ${r.band}` : ''}` : ''}</small><ol className="pl-steps" style={{ marginTop: 6 }}>{G.orderedSteps(r.approvals).map((a, i) => <li key={i} className={`is-${a.decision === 'Pending' ? 'pending' : a.decision === 'Rejected' ? 'rejected' : 'approved'}`}><span className="pl-step-n">{i + 1}</span><span className="cell-2"><b>{a.step} · {a.person ?? a.role}</b><small>{a.decision}{a.at ? ` · ${date(a.at)}` : ''}{a.reason ? ` · ${a.reason}` : a.conditions ? ` · ${a.conditions}` : ''}</small></span></li>)}</ol></div>) : <p className="vw-label" style={{ margin: 0 }}>Not submitted yet.</p>}
        </Panel>
      </div>
    </div>
  );
}

/* ================================================================== baseline */
function DeltaTable({ rows, empty = 'No difference.' }: { rows: G.DeltaRow[]; empty?: string }) {
  const changed = rows.filter(r => r.changed);
  if (!changed.length) return <p className="vw-label" style={{ margin: 0 }}>{empty}</p>;
  return <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>What</th><th>Baseline</th><th>Now</th></tr></thead><tbody>{changed.map(r => <tr key={r.label}><td>{r.label}</td><td className="num">{r.before}</td><td className="num strong">{r.after}</td></tr>)}</tbody></table>;
}
type BRow = { id: string; item: string; phase: string; orderBy: string; needBy: string; now?: { orderBy: string; needBy: string } };
export function BaselineTab({ plan, ev, template }: TabProps) {
  const { parent } = useChain(plan);
  const d = useDelivery(plan.plnId);
  const b = plan.baseline;
  const label = (k: string) => ev.resolved?.params.find(p => p.key === k)?.label ?? k;
  const drift = G.templateDrift(plan, template);
  const changedN = b ? G.baselineDelta(b, plan, ev, label).filter(r => r.changed).length : 0;
  const schedRows = useMemo<BRow[]>(() => (b?.schedule ?? []).map((s, i) => ({ ...s, id: `${i}-${s.item}`, now: ev.schedule.find(x => x.item === s.item && x.phase === s.phase) })), [b, ev.schedule]);
  const moved = (r: BRow) => (r.now ? Math.round((new Date(r.now.needBy).getTime() - new Date(r.needBy).getTime()) / (7 * 864e5)) : undefined);
  const schedCols: Col<BRow>[] = [
    { key: 'item', header: 'Item', wrap: true, render: r => r.item }, { key: 'phase', header: 'Phase', wrap: true, render: r => r.phase },
    { key: 'order', header: 'Order by', render: r => <span className="nowrap">{date(r.orderBy)}</span>, sort: r => r.orderBy }, { key: 'need', header: 'Need by', render: r => <span className="nowrap">{date(r.needBy)}</span>, sort: r => r.needBy },
    { key: 'now', header: 'Now', render: r => { const m = moved(r); return m === undefined ? <span className="vw-label">not in the plan now</span> : m === 0 ? <Chip tone="success" size="xs">same</Chip> : <Chip tone={m > 0 ? 'warning' : 'info'} size="xs">{m > 0 ? `${m} wk later` : `${-m} wk earlier`}</Chip>; } },
  ];
  return (
    <div className="col" style={{ gap: 14 }}>
      {parent?.baseline && <Panel title={`Revision ${plan.revision ?? ''}: what changes against ${parent.plnId}`} icon={I.GitCompare} actions={<Link className="nst-btn nst-btn--sm" to={`/planning/plans/${parent.id}?tab=baseline`}>Open {parent.plnId}</Link>} info="The parent's frozen baseline against this revision as it stands. The revision gets its own approval round; once approved it supersedes the parent and its holds.">
        <p className="vw-label" style={{ margin: '0 0 10px' }}>Baseline of {parent.plnId}, approved {date(parent.baseline.at)}, against this revision.</p>
        <DeltaTable rows={G.baselineDelta(parent.baseline, plan, ev, label)} empty="The revision changes nothing in the frozen figures yet." />
      </Panel>}
      {!b ? <p className="note note--info"><I.Lock size={15} /><span>The baseline is frozen at final approval: the approved scenario, its inputs, CapEx, OpEx, bill of materials, schedule, template version and benchmarks.</span></p> : <>
        {drift && <p className="note note--warn"><I.TriangleAlert size={15} /><span>The template changed since approval (v{drift.from} → v{drift.to}). The plan keeps the v{drift.from} figures; raise a revision to adopt the new template.</span></p>}
        <TileStrip cols={6}>
          <StatTile label="Baseline CapEx" value={money(b.capexTotal)} sub={`incl. ${money(b.contingencyUsd)} contingency`} />
          <StatTile label="Baseline OpEx" value={money(b.opexMonthly)} sub="per month" />
          <StatTile label="Bill of materials" value={money(b.bomTotal)} sub={b.buyTotal !== undefined ? `${money(b.buyTotal)} to buy` : 'at approval'} />
          <StatTile label="Design power" value={kw(b.designPowerKw)} sub={`${b.phases.length} phase${b.phases.length === 1 ? '' : 's'}, live ${date(b.targetGoLive)}`} />
          <StatTile label="Frozen" value={date(b.at)} sub={`by ${b.by} · ${b.scenarioName ?? 'base case'}`} />
          <StatTile label="Template" value={`v${b.templateVersion}`} sub={drift ? `now v${drift.to}` : 'still current'} subTone={drift ? 'warn' : undefined} />
        </TileStrip>
        <div className={changedN ? 'pn-two' : undefined}>
          <Panel title="Baseline, now and actual" icon={I.Scale} flush foot={changedN ? undefined : <span className="vw-label">No input has changed since approval.</span>} info="The frozen figures, the plan as it evaluates today, and what Delivery reports as spent and delivered.">
            <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Figure</th><th>Baseline</th><th>Now</th><th>Actual</th></tr></thead><tbody>
              <tr><td>CapEx</td><td className="num">{money(b.capexTotal)}</td><td className="num">{money(ev.estimate.capexTotal)}</td><td className="num">{plan.closeout ? money(plan.closeout.actualCapex) : d?.actualUsd ? money(d.actualUsd) : '—'}</td></tr>
              <tr><td>OpEx per month</td><td className="num">{money(b.opexMonthly)}</td><td className="num">{money(ev.estimate.opexMonthly)}</td><td className="num">{plan.closeout?.actualOpexMonthly ? money(plan.closeout.actualOpexMonthly) : '—'}</td></tr>
              <tr><td>IT capacity</td><td className="num">{kw(b.designPowerKw)}</td><td className="num">{kw(plan.designPowerKw)}</td><td className="num">{plan.closeout ? kw(plan.closeout.deliveredKw) : '—'}</td></tr>
              <tr><td>Go-live</td><td className="nowrap">{date(b.targetGoLive)}</td><td className="nowrap">{date(plan.targetGoLive)}</td><td className="nowrap">{plan.closeout ? date(plan.closeout.completedAt) : d ? `${date(d.finish)} (forecast)` : '—'}</td></tr>
              <tr><td>Rules</td><td>{b.hardFails} fail · {b.softWarns} warn</td><td>{ev.hardFails} fail · {ev.softWarns} warn</td><td>—</td></tr>
            </tbody></table>
          </Panel>
          {changedN > 0 && <Panel title="Inputs: baseline against the plan now" icon={I.GitCompare} count={changedN} info="What differs between the frozen inputs and figures and the plan as it evaluates today. A change after approval needs a revision with its own approval round.">
            <DeltaTable rows={G.baselineDelta(b, plan, ev, label)} empty="Nothing has changed since approval." />
          </Panel>}
        </div>
        {schedRows.length > 0 && <Panel title="Baseline schedule" icon={I.CalendarRange} count={schedRows.length} flush info="The order-by and need-by dates frozen at approval, and how far each has moved in the plan as it stands."><DataTable rows={schedRows} cols={schedCols} pageSize={15} /></Panel>}
        {plan.closeout && <Panel title="Close-out" icon={I.CheckCircle2}><KV cols={3} items={[['Completed', `${date(plan.closeout.completedAt)} by ${plan.closeout.completedBy}`], ['Delivered', kw(plan.closeout.deliveredKw)], ['Actual CapEx', money(plan.closeout.actualCapex)], ['Measured draw', plan.closeout.measuredKw !== undefined ? kw(plan.closeout.measuredKw) : '—'], ['Notes', plan.closeout.notes ?? '—']]} /></Panel>}
      </>}
    </div>
  );
}

/* Delivery tab: Delivery is the source of truth for the build (its project, purchase orders, work orders and change requests,
   commissioning), read live; the plan keeps its holds, IP space and sourcing decision, listed under "Held for the plan". */
const PO_TONE = { Delivered: 'success', Late: 'error', 'In transit': 'info', Ordered: 'neutral', Draft: 'neutral' } as const;
const WO_TONE = { Done: 'success', 'In progress': 'info', Ready: 'info', 'Awaiting change': 'warning', Planned: 'neutral', Failed: 'error' } as const;
const CR_TONE = { Implemented: 'success', Approved: 'info', 'Pending approval': 'warning', Draft: 'neutral' } as const;
export function DeliveryTab({ plan, data, template }: TabProps) {
  const d = useDelivery(plan.plnId);
  const checks = closeoutChecks(plan, data, template, d);
  const gate = checks.filter(c => !c.atHandover);
  const a = plan.artefacts;
  const prj = d?.projectId ?? plan.plnId.replace('PLN-', 'PRJ-');
  const to = (tab?: string) => `/delivery/projects/${prj}${tab ? `?tab=${tab}` : ''}`;
  const executed = plan.status === 'Executing' || plan.status === 'Completed';
  const pos = d?.purchaseOrders ?? [], wos = d?.workOrders ?? [];
  const cx = d ? Math.max(0, ...d.tests.filter(t => t.state === 'Passed').map(t => t.level)) : 0;
  const src = a?.sourcing;
  return (
    <div className="col" style={{ gap: 14 }}>
      <StatGrid cols={6}>
        <StatTile label="Progress" value={d ? pct(d.progress * 100) : '—'} sub={d ? `${d.state} · ${d.health}` : 'not in Delivery yet'} subTone={d?.health === 'late' ? 'bad' : undefined} />
        <StatTile label="Spend" value={d ? money(d.actualUsd) : '—'} sub={d ? `of ${money(d.budgetUsd)} budget · CPI ${d.cpi}` : plan.baseline ? `${money(plan.baseline.capexTotal)} baseline` : 'no baseline'} subTone={d && d.cpi < 0.95 ? 'bad' : undefined} />
        <StatTile label="Purchase orders" value={d ? `${pos.filter(o => o.state === 'Delivered').length}/${pos.length}` : '—'} sub={d ? `received · ${pos.filter(o => o.state === 'Late').length} late` : 'raised by Delivery'} subTone={pos.some(o => o.state === 'Late') ? 'bad' : undefined} />
        <StatTile label="Work orders" value={d ? `${wos.filter(w => w.state === 'Done').length}/${wos.length}` : '—'} sub={d ? 'done' : 'planned by Delivery'} />
        <StatTile label="Change requests" value={d ? `${wos.filter(w => w.changeState === 'Implemented').length}/${wos.length}` : '—'} sub={d ? 'implemented' : 'one per work order'} />
        <StatTile label="Close-out" value={`${gate.filter(c => c.ok).length}/${gate.length}`} sub={plan.status === 'Completed' ? 'completed' : gate.every(c => c.ok) && gate.length ? 'ready to complete' : `commissioning L${cx} of L5`} />
      </StatGrid>
      <div className="pn-two">
        <Panel title="Delivery project" icon={I.HardHat} sub={d ? undefined : 'Not in Delivery yet'} info="Delivery builds the approved plan as one project: its purchase orders, work orders with their change requests, commissioning L1–L5 and the handover to operations. Start the build hands the plan over and records Delivery's ids here."
          actions={d ? <Link className="nst-btn nst-btn--sm" to={to()}>Open {prj}</Link> : undefined}>
          {d ? <KV cols={3} items={[['Project', <Link className="ent-link mono" to={to()}>{prj}</Link>], ['State', <Chip tone={d.state === 'Delivered' ? 'success' : d.state === 'Mobilising' ? 'neutral' : 'info'} size="xs" dot>{d.state}</Chip>], ['Health', <Chip tone={d.health === 'late' ? 'error' : d.health === 'at risk' ? 'warning' : 'success'} size="xs" dot>{d.health}</Chip>], ['Manager', d.manager], ['Window', `${date(d.start)} – ${date(d.finish)}`], ['Commissioning', cx ? `L${cx} passed` : 'not started'], ['Permits', `${d.permits.filter(p => p.state === 'Granted').length} of ${d.permits.length} granted`], ['Design documents', String(d.docs.length)], ['Planned progress', pct(d.plannedProgress * 100)]]} />
            : <p className="vw-label" style={{ margin: 0 }}>The plan becomes a Delivery project once it is approved; Start the build hands it over with its sourced bill of materials.</p>}
          {a?.steps && <><Sub>Hand-over steps{a.executionId ? ` · ${a.executionId}${a.completedAt ? `, finished ${date(a.completedAt)}` : ', not finished'}` : ''}</Sub><ul className="pn-list">{Object.entries(a.steps).map(([k, s]) => <li key={k}><Chip tone={s === 'done' ? 'success' : s === 'failed' ? 'error' : 'neutral'} size="xs" dot>{s}</Chip><span className="cell-2"><b style={{ fontWeight: 400 }}>{STEP_LABEL[k] ?? k}</b>{a.errors?.find(e => e.step === k) && <small style={{ color: 'var(--vw-color-red-600)' }}>{a.errors.find(e => e.step === k)!.message}</small>}</span></li>)}</ul></>}
        </Panel>
        <Panel title="Completion checklist" icon={I.ClipboardCheck} actions={gate.length ? <Chip tone={gate.every(c => c.ok) ? 'success' : 'warning'}>{gate.filter(c => c.ok).length}/{gate.length}</Chip> : undefined} info="Read live from Delivery. When every check is green, completing the plan signs the handover in Delivery; the items marked 'at handover' are set by the handover itself.">
          {executed ? <ul className="pn-list">{checks.map(c => <li key={c.key}><Chip tone={c.ok ? 'success' : c.atHandover ? 'neutral' : 'warning'} size="xs" dot>{c.ok ? 'OK' : c.atHandover ? 'At handover' : 'Open'}</Chip><span className="cell-2"><b style={{ fontWeight: 400 }}>{c.label}</b><small>{c.detail}</small></span></li>)}</ul> : <p className="vw-label">Checks apply once the plan is handed over to Delivery.</p>}
        </Panel>
      </div>
      {d && <Panel title="Purchase orders" icon={I.ShoppingCart} count={pos.length} info="Raised by Delivery from the plan's sourced bill of materials: one order per vendor and phase, under the vendor's contract, for what is bought (spare site capacity and stock are not ordered)." actions={<Link className="nst-btn nst-btn--sm" to={to('procurement')}>Procurement</Link>}>
        {pos.length ? <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Order</th><th>Supplier</th><th>Lines</th><th>Value</th><th>Due</th><th>State</th></tr></thead><tbody>{pos.map(o => <tr key={o.id}><td><Link className="ent-link mono" to={to('procurement')}>{o.id}</Link></td><td><span className="cell-2"><span>{o.supplier}</span><small>{o.contract ? `contract ${o.contract}` : 'no supply contract'}</small></span></td><td style={{ whiteSpace: 'normal' }}>{o.item}</td><td className="num">{money(o.totalUsd)}</td><td className="nowrap">{date(o.due)}</td><td><Chip tone={PO_TONE[o.state]} size="xs" dot>{o.state}</Chip></td></tr>)}</tbody></table> : <p className="vw-label">Nothing to buy: the plan is covered from the site and stock.</p>}
      </Panel>}
      {d && <Panel title="Work orders and change requests" icon={I.Wrench} count={wos.length} info="Delivery splits the field work into crew windows; each work order carries its own change request, approved and implemented with it." actions={<Link className="nst-btn nst-btn--sm" to={to('workorders')}>Work orders</Link>}>
        {wos.length ? <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Work order</th><th>Crew</th><th>Window</th><th>State</th><th>Change request</th></tr></thead><tbody>{wos.map(w => <tr key={w.id}><td style={{ whiteSpace: 'normal' }}><span className="cell-2"><Link className="ent-link mono" to={to('workorders')}>{w.id}</Link><small>{w.title}</small></span></td><td><span className="cell-2"><span>{w.crew}</span><small>{w.kind}</small></span></td><td className="nowrap">{date(w.start)} – {date(w.end)}</td><td><Chip tone={WO_TONE[w.state]} size="xs" dot>{w.state}</Chip></td><td><span className="cell-2"><Link className="ent-link mono" to={`/changes/${w.changeId}`}>{w.changeId}</Link><small><Chip tone={CR_TONE[w.changeState]} size="xs">{w.changeState}</Chip></small></span></td></tr>)}</tbody></table> : <p className="vw-label">No field work in this plan.</p>}
      </Panel>}
      {a && <Panel title="Held for the plan" icon={I.Boxes} info="What the planner keeps for the plan while Delivery builds it: the sourcing decision, stock and rack positions held in the plan's name, capacity holds, and IP space."><KV cols={4} items={[
        ['Bill of materials', a.bomId ?? '—'],
        ['Sourced', src ? `${num(src.siteQty)} from the site · ${num(src.stockQty)} from stock · ${num(src.buyQty)} to buy` : '—'],
        ['Stock held', `${num(a.reservedDeviceIds?.length ?? 0)} unit${(a.reservedDeviceIds?.length ?? 0) === 1 ? '' : 's'}${src?.plannedHolds ? ` · ${num(src.plannedHolds)} held later` : ''}`],
        ['Rack positions held', num(a.reservedRackIds?.length ?? 0)],
        ['Avoided by reuse', src ? money(src.siteUsd + src.stockUsd) : '—'],
        ['Capacity holds', num(a.reservationIds?.length ?? 0)],
        ['Subnets / VLANs', `${a.subnetIds.length} / ${a.vlanIds.length}`],
        ['Permits / documents', d ? `${d.permits.length} / ${d.docs.length} in Delivery` : '—'],
      ]} /></Panel>}
    </div>
  );
}
