/* Site expansion: the campus picker with real intake headroom, and the campus check per phase. */
import { useMemo } from 'react';
import * as I from 'lucide-react';
import { Btn, Chip, Field } from '../../../../ui/kit';
import { DC_TYPE_CATALOG, dcTypeProfile } from '../../../../planner/p2b/dcTypes';
import { campusBaseline } from '../../../../planner/lib/site';
import { proposeExpansionPhases, type CampusCheck } from '../../../../planner/lib/buildSite';
import { CLIMATES, CLIMATE_LABEL, climateFromHint, mixForSiteType, type StepProps } from '../../../../planner/lib/wizardModel';
import type * as T from '../../../../planner/p2b/types';
import { Sub } from '../../parts';
import { SelectInput, TextInput, date, kw } from '../../common';
import { Hint, Quiet, Tbl } from '../replace/shared';
import { analysisOf } from './model';

/** Campus to expand: intake per side against what the existing buildings are entitled to. */
export function CampusPicker({ draft, patch, data, estate, readOnly }: StepProps) {
  const rows = useMemo(() => (data.ready ? data.campuses.filter(c => data.dataCenters.some(d => d.campusId === c.id && d.status !== 'Retired')).map(c => {
    const cb = campusBaseline(data, c.id, { excludePlanId: draft.id });
    const byType = new Map<string, number>();
    for (const d of cb?.dataCenters ?? []) if (d.dcTypeKey) byType.set(d.dcTypeKey, (byType.get(d.dcTypeKey) ?? 0) + d.designPowerKw);
    const dominant = [...byType.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return { c, cb, dominant };
  }).sort((a, b) => (b.cb?.facilityHeadroomKw ?? 0) - (a.cb?.facilityHeadroomKw ?? 0)) : []), [data, draft.id]);
  const chosen = rows.find(r => r.c.id === draft.campusId);
  const pick = (id: string) => {
    if (readOnly) return;
    const r = rows.find(x => x.c.id === id); if (!r) return;
    const type = r.dominant ?? draft.dcTypeKey;
    patch({ campusId: id, regionId: r.c.regionId, dataCenterId: undefined, dcTypeKey: type, demand: { ...draft.demand, ...mixForSiteType(type) }, climate: climateFromHint(r.c.city) ?? draft.climate, newSiteName: draft.newSiteName || `${r.c.city.toUpperCase().slice(0, 3)}-B${(r.cb?.dataCenters.length ?? 0) + 1}` });
  };
  const prof = dcTypeProfile(draft.dcTypeKey);
  const telco = prof?.segment === 'Telco' && draft.designPowerKw > 1000;
  return (
    <div className="col" style={{ gap: 12 }}>
      <Hint>An expansion adds a building or hall block to a campus you already run, sharing its grid intake, MV ring, security and NOC. Free capacity is the campus intake per side (the smaller of A and B) less the facility load the existing buildings are entitled to (design IT × their PUE, or more where load and holds are higher).</Hint>
      {!data.ready ? <Quiet>Campus intake loads with the platform data.</Quiet> : (
        <Tbl maxHeight={260}>
          <thead><tr><th>Campus</th><th>Sites</th><th>Mostly</th><th>Intake per side</th><th>Committed</th><th>Facility free</th></tr></thead>
          <tbody>{rows.map(({ c, cb, dominant }) => { const free = cb?.facilityHeadroomKw ?? 0; const on = c.id === draft.campusId; return (
            <tr key={c.id} className={`is-pick${on ? ' is-on' : ''}`} onClick={() => pick(c.id)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') pick(c.id); }} aria-selected={on}>
              <td><span className="cell-2"><span className="strong">{c.name}</span><small>{c.city}{c.country ? `, ${c.country}` : ''}</small></span></td>
              <td className="num">{cb?.dataCenters.length ?? 0}</td>
              <td>{dominant ? dcTypeProfile(dominant)?.name ?? dominant : '—'}</td>
              <td className="num">{kw(cb?.perSideKw ?? 0)}</td>
              <td className="num">{kw(cb?.committedFacilityKw ?? 0)}</td>
              <td className="num" style={{ color: free > 0 ? 'var(--vw-color-emerald-700)' : 'var(--vw-color-red-600)' }}>{free > 0 ? kw(free) : `${kw(-free)} over`}</td>
            </tr>
          ); })}{!rows.length && <tr><td colSpan={6} className="vw-label">No campus with a live site.</td></tr>}</tbody>
        </Tbl>
      )}
      {chosen && (
        <div className="pn-grid-4b">
          <Field label="New building name" required><TextInput value={draft.newSiteName ?? ''} disabled={readOnly} placeholder="e.g. Building C" onChange={v => patch({ newSiteName: v })} /></Field>
          <Field label="Datacenter record" hint="A new record for the building, or an existing datacenter on the campus"><SelectInput value={draft.dataCenterId ?? ''} disabled={readOnly} options={[{ id: '', label: 'New datacenter record' }, ...(chosen.cb?.dataCenters ?? []).map(d => ({ id: d.id, label: `${d.code} · ${d.name}` }))]} onChange={v => patch({ dataCenterId: v || undefined })} /></Field>
          <Field label="Kind of site" hint={chosen.dominant ? `The campus is mostly ${dcTypeProfile(chosen.dominant)?.name ?? chosen.dominant}` : undefined}><SelectInput value={draft.dcTypeKey} disabled={readOnly} options={DC_TYPE_CATALOG.map(p => ({ id: p.key, label: p.name }))} onChange={v => patch({ dcTypeKey: v, demand: { ...draft.demand, ...mixForSiteType(v) } })} /></Field>
          <Field label="Climate"><SelectInput value={draft.climate} disabled={readOnly} options={CLIMATES.map(c => ({ id: c, label: CLIMATE_LABEL[c] }))} onChange={v => patch({ climate: v as T.PlannerPlan['climate'] })} /></Field>
        </div>
      )}
      {telco && <p className="note note--warn" style={{ margin: 0 }}><I.TriangleAlert size={15} /><span>{prof!.name} is a telco profile with a −48 V DC plant; above 1 MW an AC datacenter profile is the usual choice.</span></p>}
      {estate.campuses.length === 0 && <Quiet>No campuses in the estate.</Quiet>}
    </div>
  );
}

/** Campus intake against each phase, with the uprates on the permits. */
export function CampusTable({ k }: { k: CampusCheck }) {
  return (<>
    <Tbl>
      <thead><tr><th>Phase</th><th>Live</th><th>IT so far</th><th>Facility needed</th><th>Free today</th><th>Uprates by then</th><th>Available</th><th>Result</th></tr></thead>
      <tbody>{k.rows.map(r => (
        <tr key={r.phase.id}><td>{r.phase.name}</td><td>{date(r.phase.goLive)}</td><td className="num">{kw(r.cumulativeItKw)}</td><td className="num">{kw(r.facilityKw)}</td><td className="num">{kw(k.headroomKw)}</td><td className="num">{r.upratesKw ? kw(r.upratesKw) : '—'}</td><td className="num">{kw(r.availableKw)}</td><td>{r.ok ? <Chip tone="success" size="xs" dot>Fits</Chip> : <Chip tone="error" size="xs" dot>{kw(r.shortKw)} short</Chip>}</td></tr>
      ))}</tbody>
    </Tbl>
    <Hint>Facility load = IT × PUE {k.pue}. Intake {kw(k.campus.perSideKw)} per side (A {kw(k.campus.feedsA)}, B {kw(k.campus.feedsB)}), {kw(k.campus.committedFacilityKw)} committed to {k.campus.dataCenters.length} existing building{k.campus.dataCenters.length === 1 ? '' : 's'}{k.otherPlans.length ? `, ${k.otherPlans.map(o => `${o.plnId} ${kw(o.kw)}`).join(', ')} approved` : ''}{k.holdsKw ? `, ${kw(k.holdsKw)} held` : ''}. Campus transformers: {kw(k.campus.transformerKw)} installed.</Hint>
    {k.uprates.length > 0 && <Hint>Uprates: {k.uprates.map(u => `${u.permit.name} adds ${kw(u.kw)} from ${date(u.energisedBy)} (${u.basis})`).join('; ')}.</Hint>}
  </>);
}

/** Requirements block: the campus check per phase and phases capped at what the campus can power. */
export function CampusBlock({ draft, patch, ev, readOnly }: StepProps) {
  const a = analysisOf(ev); const k = a?.campus;
  if (!draft.campusId) return null;
  if (!k) return <Quiet>The campus check runs when the platform data has loaded.</Quiet>;
  const hallKw = Math.max(1, Number(ev?.params['hallDesignKw']?.value ?? 1500));
  const density = Math.max(1, Number(ev?.params['densityKwPerRack']?.value ?? draft.demand.densityKwPerRack ?? 10));
  const proposal = draft.designPowerKw > 0 ? proposeExpansionPhases(draft, k, hallKw, density) : undefined;
  return (
    <div>
      <Sub>Campus intake per phase</Sub>
      {k.rows.length ? <CampusTable k={k} /> : <Quiet>Add phases (or use the proposal below) to check them against the campus intake.</Quiet>}
      {proposal && (
        <div className="pn-card" style={{ cursor: 'default', marginTop: 10 }}>
          <span className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13 }}><b>Phases the campus can power</b> · {proposal.note}</span>
            {proposal.phases.length > 0 && !readOnly && <Btn size="sm" icon={I.Check} onClick={() => patch({ phases: proposal.phases })}>Use these phases</Btn>}
          </span>
          {proposal.phases.length > 0 && <span className="vw-label" style={{ fontSize: 12.5 }}>{proposal.phases.map(p => `${p.name}: ${kw(p.itKw)} live ${date(p.goLive)}`).join(' · ')}</span>}
        </div>
      )}
      {(a?.shared?.length ?? 0) > 0 && <Hint>Shared with the campus: {a!.shared!.map(s => `${s.item} (${s.note})`).join('; ')}.</Hint>}
    </div>
  );
}
