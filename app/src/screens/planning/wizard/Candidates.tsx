/* New site: the site facts of each candidate plot (plot, grid offer and energisation, water, fibre, land) checked against what the
   design needs; one plot is chosen and, with two or more, the planner scores them (time to power, cost, energy, latency, risk). */
import * as I from 'lucide-react';
import { Btn, Chip, Field } from '../../../ui/kit';
import type * as T from '../../../planner/p2b/types';
import type { StepProps } from '../../../planner/lib/wizardModel';
import { buildScope } from '../../../planner/lib/scopes/build';
import { clockMs } from '../../../planner/compat/clock';
import { Sub } from '../parts';
import { CheckLabel, NumInput, SelectInput, TextInput, date, money, num } from '../common';

const ZONING: T.PlannerCandidateSite['zoning'][] = ['Zoned for data centre', 'Rezoning needed', 'Unknown'];
export function CandidatePlots({ draft, patch, ev, readOnly }: StepProps) {
  const xs = draft.candidates ?? [];
  const a = buildScope(ev);
  const commit = (next: T.PlannerCandidateSite[]) => patch({ candidates: next });
  const add = () => commit([...xs, { id: `C${xs.length + 1}-${Date.now().toString(36)}`, name: `Plot ${xs.length + 1}`, regionId: draft.regionId, climate: draft.climate, plotHa: 20, buildableHa: 12, zoning: 'Unknown', gridOfferMva: 0, gridEnergisation: new Date(clockMs() + 540 * 864e5).toISOString(), gridFirm: false, waterM3PerDay: 0, fibreRoutes: 2, kmToPop: 10, floodZone: false, seismicZone: false, landCostUsd: 0, chosen: xs.length === 0 }]);
  const upd = (id: string, p: Partial<T.PlannerCandidateSite>) => commit(xs.map(c => (c.id === id ? { ...c, ...p } : c)));
  const choose = (id: string) => commit(xs.map(c => ({ ...c, chosen: c.id === id })));
  return <div style={{ marginTop: 12 }}>
    <Sub extra={!readOnly && <Btn size="sm" icon={I.Plus} onClick={add}>Add a candidate plot</Btn>}>Site facts and candidate plots</Sub>
    <p className="vw-label" style={{ margin: '0 0 8px', fontSize: 12.5 }}>Record the plot, the grid offer and the water supply of each candidate. The chosen plot is what the design is checked against: the buildings must fit the buildable area, the facility load must fit the grid offer, the grid must be energised before phase 1 needs power, and the water demand must fit the supply.</p>
    {!xs.length && <p className="note note--warn"><I.MapPin size={15} /><span>No site facts yet: add the first plot to check the design against it.</span></p>}
    {xs.map(c => { const f = a?.feasibility?.candidate.id === c.id ? a.feasibility : undefined; const sc = a?.candidates?.find(s => s.candidate.id === c.id); return (
      <div key={c.id} className={`pn-card${c.chosen ? ' is-on' : ''}`} style={{ cursor: 'default', marginBottom: 10 }}>
        <span className="row between"><span className="row" style={{ gap: 8 }}><b>{c.name}</b>{c.chosen ? <Chip tone="info" size="xs">Chosen</Chip> : !readOnly && <Btn size="sm" variant="ghost" onClick={() => choose(c.id)}>Choose</Btn>}{sc && <Chip tone={sc.feasible ? 'success' : 'error'} size="xs">rank {sc.rank}{sc.feasible ? '' : ' · not feasible'}</Chip>}</span>{!readOnly && <Btn size="sm" variant="ghost" icon={I.Trash2} onClick={() => commit(xs.filter(x => x.id !== c.id))} />}</span>
        <div className="pn-grid-4">
          <Field label="Plot name"><TextInput value={c.name} disabled={readOnly} onChange={v => upd(c.id, { name: v })} /></Field>
          <Field label="Plot"><NumInput value={c.plotHa} min={0} unit="ha" disabled={readOnly} onChange={v => v !== undefined && upd(c.id, { plotHa: v })} /></Field>
          <Field label="Buildable"><NumInput value={c.buildableHa} min={0} unit="ha" disabled={readOnly} onChange={v => v !== undefined && upd(c.id, { buildableHa: v })} /></Field>
          <Field label="Zoning"><SelectInput value={c.zoning} disabled={readOnly} options={ZONING.map(z => ({ id: z, label: z.replace('data centre', 'datacenter') }))} onChange={v => upd(c.id, { zoning: v })} /></Field>
          <Field label="Grid offer"><NumInput value={c.gridOfferMva} min={0} unit="MVA" disabled={readOnly} onChange={v => v !== undefined && upd(c.id, { gridOfferMva: v })} /></Field>
          <Field label="Energised by"><TextInput type="date" value={c.gridEnergisation.slice(0, 10)} disabled={readOnly} onChange={v => v && upd(c.id, { gridEnergisation: `${v}T00:00:00.000Z` })} /></Field>
          <Field label="Grid offer firm"><CheckLabel on={c.gridFirm} label={c.gridFirm ? 'Signed offer' : 'Indicative'} onChange={v => upd(c.id, { gridFirm: v })} /></Field>
          <Field label="Water supply"><NumInput value={c.waterM3PerDay} min={0} unit="m³/day" disabled={readOnly} onChange={v => v !== undefined && upd(c.id, { waterM3PerDay: v })} /></Field>
          <Field label="Fibre routes"><NumInput value={c.fibreRoutes} min={0} disabled={readOnly} onChange={v => v !== undefined && upd(c.id, { fibreRoutes: v })} /></Field>
          <Field label="Distance to PoP"><NumInput value={c.kmToPop} min={0} unit="km" disabled={readOnly} onChange={v => v !== undefined && upd(c.id, { kmToPop: v })} /></Field>
          <Field label="Land cost"><NumInput value={c.landCostUsd} min={0} unit="USD" disabled={readOnly} onChange={v => v !== undefined && upd(c.id, { landCostUsd: v })} /></Field>
          <Field label="Hazards"><span className="row" style={{ gap: 10 }}><CheckLabel on={c.floodZone} label="Flood zone" onChange={v => upd(c.id, { floodZone: v })} /><CheckLabel on={c.seismicZone} label="Seismic" onChange={v => upd(c.id, { seismicZone: v })} /></span></Field>
        </div>
        {f && <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>{f.checks.map(k => <Chip key={k.key} tone={k.ok ? (k.warn ? 'warning' : 'success') : k.key === 'zoning' ? 'warning' : 'error'} size="xs" dot title={k.detail}>{k.label}</Chip>)}<span className="vw-label" style={{ fontSize: 12 }}>needs {num(f.plotNeedM2 / 10000, 1)} ha, {f.mva} MVA, {num(f.waterM3PerDay)} m³/day, power on by {date(f.powerOn)}{f.proposal ? ` · if energisation is late: ${f.proposal.interimGenerationMw} MW interim generation or phase 1 to ${date(f.proposal.shiftPhase1To)}` : ''}</span></div>}
      </div>); })}
    {a?.candidates && a.candidates.length > 1 && <><Sub>Candidates compared</Sub><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Rank</th><th>Plot</th><th>Time to power</th><th>CapEx and land</th><th>Energy a year</th><th>Latency</th><th>Risk</th><th>Feasible</th></tr></thead><tbody>{[...a.candidates].sort((x, y) => x.rank - y.rank).map(s => <tr key={s.candidate.id}><td className="num">{s.rank}</td><td>{s.candidate.name}</td><td className="num">{s.metrics.monthsToPower} mo</td><td className="num">{money(s.metrics.costUsd)}</td><td className="num" title={`${s.metrics.tariff} USD/kWh (${s.metrics.tariffSource})`}>{money(s.metrics.energyUsdYear)}</td><td className="num" title={s.metrics.latencyBasis}>{s.metrics.latencyMs === undefined ? '—' : `${s.metrics.latencyMs} ms`}</td><td title={s.metrics.riskWhy.join(', ')}>{s.metrics.riskPoints ? `${s.metrics.riskPoints} points` : 'Low'}</td><td>{s.feasible ? <Chip tone="success" size="xs">All met</Chip> : <Chip tone="error" size="xs" title={s.feasibility.checks.filter(c => !c.ok).map(c => c.detail).join(' · ')}>{s.feasibility.checks.filter(c => !c.ok).length} short</Chip>}</td></tr>)}</tbody></table></>}
  </div>;
}
