/* Regional portfolio: region and the existing sites to consider, new plots as options, the demand curve, the proposed and accepted
   allocation, gaps and interconnect. */
import { useMemo } from 'react';
import * as I from 'lucide-react';
import { Btn, CheckBox, Chip, Field } from '../../../../ui/kit';
import type * as T from '../../../../planner/p2b/types';
import { siteBaseline } from '../../../../planner/lib/site';
import { PIPELINE_WEIGHT, ROUTE_LABEL, type PortfolioModel } from '../../../../planner/lib/buildPortfolio';
import type { StepProps } from '../../../../planner/lib/wizardModel';
import { clockMs } from '../../../../planner/compat/clock';
import { Sub } from '../../parts';
import { NumInput, SelectInput, TextInput, date, kw, money, num } from '../../common';
import { Hint, Issues, Quiet, Tbl } from '../replace/shared';
import { analysisOf, fromDate, toDate } from './model';

type Route = NonNullable<T.PlannerSiteRow['route']>;
const ROUTES: Route[] = ['expansion', 'new-dc', 'hall', 'pod'];

/** Region and the existing sites to consider, with what each can take today. */
export function RegionPicker({ draft, patch, estate, data, readOnly }: StepProps) {
  const cands = String(draft.params.candidateSiteIds ?? '').split(',').filter(Boolean);
  const sites = useMemo(() => estate.dataCenters
    .filter(d => d.status === 'Operational' && (!draft.regionId || estate.campuses.find(c => c.id === d.campusId)?.regionId === draft.regionId))
    .map(d => ({ d, head: data.ready ? siteBaseline(data, d.id, { excludePlanId: draft.id })?.headroomItKw ?? 0 : undefined })), [estate, data, draft.regionId, draft.id]);
  const setCands = (ids: string[]) => patch({ params: { ...draft.params, candidateSiteIds: ids.join(',') }, paramSources: { ...draft.paramSources, candidateSiteIds: 'user' } });
  return (
    <div className="col" style={{ gap: 12 }}>
      <Hint>A portfolio plan decides where and when capacity goes across a region. Pick the region and the existing sites to consider; add new plots as options below. Approval creates one child plan per allocation row.</Hint>
      <div className="pn-grid-3">
        <Field label="Region" required><SelectInput value={draft.regionId} placeholder="Pick a region" disabled={readOnly} options={estate.regions.map(r => ({ id: r.id, label: r.name }))} onChange={v => patch({ regionId: v, campusId: undefined, dataCenterId: undefined, params: { ...draft.params, candidateSiteIds: '' } })} /></Field>
      </div>
      {draft.regionId && <>
        <Sub extra={<span className="vw-label" style={{ fontSize: 12.5 }}>{cands.length ? `${cands.length} of ${sites.length} chosen` : 'none chosen: every live site in the region'}</span>}>Existing sites to consider</Sub>
        <Tbl maxHeight={240}>
          <thead><tr><th /><th>Site</th><th>Design</th><th>Free IT capacity</th></tr></thead>
          <tbody>{sites.map(({ d, head }) => { const on = cands.includes(d.id); return (
            <tr key={d.id} className={on ? 'is-on' : undefined}>
              <td style={{ width: 36 }}><CheckBox on={on} onChange={v => !readOnly && setCands(v ? [...cands, d.id] : cands.filter(x => x !== d.id))} /></td>
              <td><span className="cell-2"><span className="strong">{d.name}</span><small className="mono">{d.code}</small></span></td>
              <td className="num">{kw(d.designPowerKw)}</td>
              <td className="num">{head === undefined ? 'Loading' : kw(head)}</td>
            </tr>
          ); })}{!sites.length && <tr><td colSpan={4} className="vw-label">No live site in the region.</td></tr>}</tbody>
        </Tbl>
        <Hint>Free IT capacity is the binding stage of each site's real plant (utility, transformers, UPS, generators, distribution, cooling).</Hint>
      </>}
    </div>
  );
}

export function DemandTable({ m }: { m: PortfolioModel }) {
  return (
    <Tbl>
      <thead><tr><th>Year</th><th>Demand</th><th>Of which pipeline</th><th>Needed with reserve</th><th>Sellable today</th><th>Proposed</th><th>Gap</th></tr></thead>
      <tbody>{m.demand.map(d => <tr key={d.year}><td>{d.label}</td><td className="num">{kw(d.demandKw)}</td><td className="num">{d.pipelineKw ? kw(d.pipelineKw) : '—'}</td><td className="num">{kw(d.needKw)}</td><td className="num">{kw(d.existingKw)}</td><td className="num">{d.allocatedKw ? kw(d.allocatedKw) : '—'}</td><td className="num" style={{ color: d.gapKw ? 'var(--vw-color-red-600)' : undefined }}>{d.gapKw ? kw(d.gapKw) : '—'}</td></tr>)}</tbody>
    </Tbl>
  );
}

export function AllocationTable({ m, onRemove, onChange, readOnly }: { m: PortfolioModel; onRemove?: (id: string) => void; onChange?: (id: string, p: Partial<T.PlannerSiteRow>) => void; readOnly?: boolean }) {
  const edit = !!onChange && !readOnly;
  return (
    <Tbl>
      <thead><tr><th>Site and route</th><th>IT capacity and live</th><th>CapEx</th><th>Checks</th><th>Child plan</th>{edit && onRemove && <th />}</tr></thead>
      <tbody>{m.checks.map(c => (
        <tr key={c.row.id}>
          <td>{edit ? <span className="cell-2" style={{ gap: 4 }}><TextInput value={c.row.name} style={{ width: 170 }} onChange={v => onChange!(c.row.id, { name: v })} /><SelectInput value={c.row.route ?? 'expansion'} style={{ width: 170 }} options={ROUTES.map(r => ({ id: r, label: ROUTE_LABEL[r] }))} onChange={v => onChange!(c.row.id, { route: v })} /></span>
            : <span className="cell-2"><span className="strong">{c.row.name}</span><small>{ROUTE_LABEL[c.row.route ?? 'expansion']}</small></span>}</td>
          <td>{edit ? <span className="cell-2" style={{ gap: 4 }}><NumInput value={c.row.itKw} min={0} step={500} unit="kW" style={{ width: 140 }} onChange={v => v !== undefined && onChange!(c.row.id, { itKw: v })} /><TextInput type="date" value={toDate(c.row.goLive)} style={{ width: 140 }} onChange={v => onChange!(c.row.id, { goLive: fromDate(v, c.row.goLive) })} /></span>
            : <span className="cell-2"><span className="num">{kw(c.row.itKw)}</span><small>live {date(c.row.goLive)}</small></span>}</td>
          <td className="num" title={c.option?.costBasis}>{money(c.capexUsd)}</td>
          <td><span className="cell-2" style={{ gap: 4 }}><Chip tone={c.headroomOk ? 'success' : 'error'} size="xs" dot title={c.detail}>{c.headroomOk ? 'Headroom fits' : 'Headroom short'}</Chip>
            <Chip tone={c.leadOk ? 'success' : 'error'} size="xs" dot title={`Earliest ${date(c.earliest)}${c.option ? ` (${c.option.leadWeeks} weeks${c.option.prerequisite ? `, ${c.option.prerequisite}` : ''})` : ''}`}>{c.leadOk ? 'In time' : 'Too soon'}</Chip></span></td>
          <td>{c.row.childPlanId ? <span className="mono">{c.row.childPlanId}</span> : '—'}</td>
          {edit && onRemove && <td><Btn size="xs" variant="ghost" icon={I.Trash2} title="Remove the row" onClick={() => onRemove(c.row.id)} /></td>}
        </tr>
      ))}</tbody>
    </Tbl>
  );
}

export function DciTable({ m }: { m: PortfolioModel }) {
  if (!m.dci.length) return <Quiet>One location only: no interconnect needed.</Quiet>;
  return (
    <Tbl>
      <thead><tr><th>Between</th><th>Distance</th><th>Latency (one way)</th><th>Capacity</th><th>Carriers at the ends</th><th>Child plan</th></tr></thead>
      <tbody>{m.dci.map(d => <tr key={`${d.a}-${d.b}`}><td>{d.a} to {d.b}</td><td className="num">{d.km === undefined ? 'No position' : `${num(d.km)} km`}</td><td className="num">{d.latencyMs === undefined ? '—' : `${d.latencyMs} ms`}</td><td className="num">{num(d.gbps)} Gbps</td><td>{d.providers.join(', ') || '—'}</td><td>{d.existingEnds ? 'Network plan on approval' : 'After the new site exists'}</td></tr>)}</tbody>
    </Tbl>
  );
}

/** New plots the allocation may use: each becomes a new-site option; its grid offer caps what it can take, its energisation date and
    land cost set its lead time and cost. */
function NewPlots({ draft, patch, readOnly }: StepProps) {
  const xs = draft.candidates ?? [];
  const commit = (next: T.PlannerCandidateSite[]) => patch({ candidates: next });
  const upd = (id: string, p: Partial<T.PlannerCandidateSite>) => commit(xs.map(c => (c.id === id ? { ...c, ...p } : c)));
  const add = () => commit([...xs, { id: `C${xs.length + 1}-${clockMs().toString(36)}`, name: `Plot ${xs.length + 1}`, regionId: draft.regionId, climate: draft.climate, plotHa: 20, buildableHa: 12, zoning: 'Unknown', gridOfferMva: 0, gridEnergisation: new Date(clockMs() + 540 * 864e5).toISOString(), gridFirm: false, waterM3PerDay: 0, fibreRoutes: 2, kmToPop: 10, floodZone: false, seismicZone: false, landCostUsd: 0, chosen: false }]);
  return (<>
    <Sub extra={!readOnly && <Btn size="sm" icon={I.Plus} onClick={add}>Add a plot</Btn>}>New plots to consider</Sub>
    {xs.length ? <Tbl>
      <thead><tr><th>Plot</th><th>Grid offer and energisation</th><th>Land cost (USD)</th><th>Position</th><th /></tr></thead>
      <tbody>{xs.map(c => <tr key={c.id}>
        <td><TextInput value={c.name} disabled={readOnly} style={{ width: 150 }} onChange={v => upd(c.id, { name: v })} /></td>
        <td><span className="cell-2" style={{ gap: 4 }}><NumInput value={c.gridOfferMva} min={0} unit="MVA" disabled={readOnly} style={{ width: 150 }} onChange={v => v !== undefined && upd(c.id, { gridOfferMva: v })} /><TextInput type="date" value={toDate(c.gridEnergisation)} disabled={readOnly} style={{ width: 150 }} onChange={v => upd(c.id, { gridEnergisation: fromDate(v, c.gridEnergisation) })} /></span></td>
        <td><NumInput value={c.landCostUsd} min={0} step={100000} disabled={readOnly} style={{ width: 140 }} onChange={v => v !== undefined && upd(c.id, { landCostUsd: v })} /></td>
        <td><span className="cell-2" style={{ gap: 4 }}><NumInput value={c.latitude} step={0.01} disabled={readOnly} placeholder="Latitude" style={{ width: 110 }} onChange={v => upd(c.id, { latitude: v })} /><NumInput value={c.longitude} step={0.01} disabled={readOnly} placeholder="Longitude" style={{ width: 110 }} onChange={v => upd(c.id, { longitude: v })} /></span></td>
        <td>{!readOnly && <Btn size="xs" variant="ghost" icon={I.Trash2} title="Remove the plot" onClick={() => commit(xs.filter(x => x.id !== c.id))} />}</td>
      </tr>)}</tbody>
    </Tbl> : <Quiet>No new plots: the allocation uses the existing sites and campus expansions only.</Quiet>}
  </>);
}

/** Requirements block: new plots, demand, proposal, the allocation itself, gaps, interconnect. */
export function AllocationBlock(props: StepProps) {
  const { draft, patch, ev, readOnly } = props;
  const m = analysisOf(ev)?.portfolio;
  const rows = draft.sites ?? [];
  // The capacity on Requirements is what the region needs; the allocation is checked against the demand curve, not forced to match it.
  const setRows = (next: T.PlannerSiteRow[]) => patch({ sites: next });
  const change = (id: string, p: Partial<T.PlannerSiteRow>) => setRows(rows.map(r => (r.id === id ? { ...r, ...p, capexUsd: undefined } : r)));
  const optKey = (o: PortfolioModel['options'][number]) => `${o.ref.kind}:${o.ref.id}:${o.route}:${o.name}`;
  const addFrom = (key: string) => {
    const o = m?.options.find(x => optKey(x) === key); if (!o) return;
    setRows([...rows, { id: `A${rows.length + 1}-${clockMs().toString(36)}`, name: o.name, ref: o.ref, itKw: Math.max(500, Number(ev?.params['hallDesignKw']?.value ?? 1500)), goLive: new Date(clockMs() + o.leadWeeks * 7 * 864e5).toISOString(), route: o.route, status: 'Accepted', notes: o.prerequisite, latitude: o.latLon?.latitude, longitude: o.latLon?.longitude }]);
  };
  return (
    <div>
      <NewPlots {...props} />
      <Sub>Demand in the region</Sub>
      {!m ? <Quiet>The demand curve is worked out when the platform data has loaded.</Quiet> : (<>
        <DemandTable m={m} />
        <Hint>Demand = today's IT load at the region's sites × {draft.demand.growthPctPerYear}% growth a year, plus open demand requests at those sites weighted by status ({Object.entries(PIPELINE_WEIGHT).map(([k, v]) => `${k} ${v}`).join(', ')}). Sellable today = each site's design capped by its real plant headroom. {m.notes.join(' ')}</Hint>
        <Sub extra={m.proposal.length > 0 && !readOnly && <Btn size="sm" icon={I.Check} onClick={() => setRows(m.proposal.map(r => ({ ...r, status: 'Accepted' as const })))}>Use this allocation</Btn>}>Proposed allocation</Sub>
        {m.proposal.length ? <ul className="pn-outlist" style={{ margin: 0 }}>{m.proposal.map(r => <li key={r.id}><I.ArrowRight size={13} />{r.name}: {kw(r.itKw)} live {date(r.goLive)} ({money(r.capexUsd ?? 0)}){r.notes ? `, ${r.notes}` : ''}</li>)}</ul> : <Quiet>The forecast is covered by what the region can sell today; no new capacity is proposed within the horizon.</Quiet>}
        <Hint>Year by year, the gap is filled in hall-sized blocks with the cheapest option that can be live by the end of that year (cost per kW from the benchmarks, lead time from delivery durations).</Hint>
        {m.gaps.length > 0 && <Issues items={[`Gaps: ${m.gaps.map(g => `${g.year}: ${kw(g.kw)} (${g.reason})`).join('; ')}`]} />}
        <Sub extra={!readOnly && m.options.length > 0 && <SelectInput value={undefined} placeholder="Add a row from an option" style={{ minWidth: 280 }} options={m.options.map(o => ({ id: optKey(o), label: `${o.name} · ${money(o.costPerKw)}/kW · ${o.leadWeeks} weeks` }))} onChange={addFrom} />}>Allocation{m.rowSource === 'scenario' ? ' (from the scenario)' : ''}</Sub>
        {m.checks.length ? <AllocationTable m={m} readOnly={readOnly} onRemove={id => setRows(rows.filter(r => r.id !== id))} onChange={change} /> : <Quiet>No allocation yet: use the proposal or add rows. Without one the plan cannot be submitted.</Quiet>}
        <Sub>Interconnect between the sites</Sub>
        <DciTable m={m} />
      </>)}
    </div>
  );
}
