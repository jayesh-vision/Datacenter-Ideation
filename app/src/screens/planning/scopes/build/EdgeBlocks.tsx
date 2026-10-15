/* Edge rollout: edge locations from the estate as plan sites, the wave dates, and each site's supply check; per-site plant and the
   per-site load ladder (pack and Power step). The site rows themselves (name, load, power variant, wave) are edited in the wizard's
   "Sites in the rollout" table. */
import { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import { Btn, Chip, Field } from '../../../../ui/kit';
import type * as T from '../../../../planner/p2b/types';
import { EDGE_VARIANTS, type EdgeAnalysis, type EdgeLadderRow } from '../../../../planner/lib/buildEdge';
import type { StepProps } from '../../../../planner/lib/wizardModel';
import type { Tone } from '../../../../lib/tone';
import { Sub } from '../../parts';
import { NumInput, SelectInput, TextInput, date, kw, num } from '../../common';
import { MultiPick } from '../../wizard/panelKit';
import { Hint, Quiet, Tbl } from '../replace/shared';
import { analysisOf, edgeDraftPatch, fromDate, toDate } from './model';

const STATUS_TONE: Record<T.EdgeLocation['status'], Tone> = { planned: 'info', 'in-progress': 'warning', 'on-air': 'success', failed: 'error' };
const STATUS_LABEL: Record<T.EdgeLocation['status'], string> = { planned: 'Planned', 'in-progress': 'In progress', 'on-air': 'On air', failed: 'Failed' };
const isEdgeRow = (r: T.PlannerSiteRow) => r.ref.kind === 'edgeLocation' || r.ref.kind === 'candidate';

/** Requirements block: add edge locations from the estate, date the waves, and check each site's supply. */
export function EdgeSitesBlock({ draft, patch, data, ev, readOnly }: StepProps) {
  const rows = (draft.sites ?? []).filter(isEdgeRow);
  const waveDates = useMemo(() => { const d = [...draft.phases].sort((a, b) => a.goLive.localeCompare(b.goLive)).map(p => p.goLive); return d.length ? d : [draft.targetGoLive]; }, [draft.phases, draft.targetGoLive]);
  const [country, setCountry] = useState('');
  const [q, setQ] = useState('');
  const [statuses, setStatuses] = useState<string[]>(['planned', 'in-progress']);
  const a = analysisOf(ev)?.edge;
  const defVariant = EDGE_VARIANTS.find(v => v.label === String(ev?.params['defaultVariant']?.value ?? ''))?.key ?? EDGE_VARIANTS[0].key;
  const perSite = Number(draft.params.kwPerSite ?? 40) || 40;
  const inRegion = data.edgeLocations.filter(l => !draft.regionId || l.regionId === draft.regionId);
  const countries = [...new Set(inRegion.map(l => l.country))].sort();
  const taken = new Set(rows.map(r => r.ref.id));
  const avail = inRegion.filter(l => !taken.has(l.id) && statuses.includes(l.status) && (!country || l.country === country) && (!q || `${l.name} ${l.city}`.toLowerCase().includes(q.toLowerCase())));
  const commit = (next: T.PlannerSiteRow[], dates = waveDates) => patch(edgeDraftPatch(draft, next, dates));
  const nextId = () => `ES${Math.max(0, ...rows.map(r => Number(r.id.replace(/\D/g, '')) || 0)) + 1}`;
  const add = (l: T.EdgeLocation) => commit([...rows, { id: nextId(), name: l.name, ref: { kind: 'edgeLocation', id: l.id }, variant: defVariant, itKw: perSite, goLive: waveDates[0], wave: 1, route: 'edge', status: 'Accepted', city: l.city, country: l.country, latitude: l.latitude, longitude: l.longitude, notes: l.blocker ? `Estate blocker: ${l.blockerNote ?? l.blocker}` : undefined }]);
  const upd = (id: string, p: Partial<T.PlannerSiteRow>) => commit(rows.map(r => (r.id === id ? { ...r, ...p } : r)));
  const setWaveDate = (i: number, iso: string) => { const d = [...waveDates]; d[i] = iso; commit(rows, d); };
  const size = (id: string) => a?.sites.find(s => s.row.id === id);
  return (
    <div>
      <Sub extra={<span className="vw-label" style={{ fontSize: 12.5 }}>{avail.length} available</span>}>Add edge locations from the estate</Sub>
      <Hint>Each site is sized on its own with its power variant: the supply it has (from the survey), its backup (genset or battery) and its cooling. Pick planned or in-progress locations, or add a new location in the table above.</Hint>
      <div className="pn-row" style={{ margin: '10px 0' }}>
        <TextInput value={q} placeholder="Search locations" style={{ width: 220 }} onChange={setQ} />
        <SelectInput value={country} style={{ minWidth: 170 }} options={[{ id: '', label: 'Any country' }, ...countries.map(c => ({ id: c, label: c }))]} onChange={setCountry} />
        <MultiPick value={statuses} options={(Object.keys(STATUS_LABEL) as T.EdgeLocation['status'][]).map(s => ({ id: s, label: STATUS_LABEL[s] }))} onChange={setStatuses} placeholder="Status…" />
      </div>
      <Tbl maxHeight={220}>
        <thead><tr><th>Location</th><th>Kind</th><th>Status</th><th>Blocker</th><th /></tr></thead>
        <tbody>{avail.slice(0, 60).map(l => <tr key={l.id}><td><span className="cell-2"><span className="strong">{l.name}</span><small>{l.city}, {l.country}</small></span></td><td>{l.kind === 'pop' ? 'PoP' : 'Access site'}</td><td><Chip tone={STATUS_TONE[l.status]} size="xs" dot>{STATUS_LABEL[l.status]}</Chip></td><td style={{ whiteSpace: 'normal' }}>{l.blockerNote ?? '—'}</td><td>{!readOnly && <Btn size="xs" icon={I.Plus} onClick={() => add(l)}>Add</Btn>}</td></tr>)}
          {!avail.length && <tr><td colSpan={5} className="vw-label">No location matches.</td></tr>}</tbody>
      </Tbl>

      <Sub extra={!readOnly && <Btn size="sm" icon={I.Plus} onClick={() => commit(rows, [...waveDates, waveDates[waveDates.length - 1]])}>Add a wave</Btn>}>Waves</Sub>
      <div className="pn-row">{waveDates.map((d, i) => <Field key={i} label={`Wave ${i + 1} live`}><TextInput type="date" value={toDate(d)} disabled={readOnly} style={{ width: 160 }} onChange={v => setWaveDate(i, fromDate(v, d))} /></Field>)}</div>

      <Sub extra={<span className="vw-label" style={{ fontSize: 12.5 }}>{rows.length} site{rows.length === 1 ? '' : 's'} · {kw(rows.reduce((s, r) => s + r.itKw, 0))}</span>}>Supply check per site</Sub>
      {!rows.length ? <Quiet>No sites yet.</Quiet> : (
        <Tbl>
          <thead><tr><th>Site</th><th>Variant · IT</th><th>Supply (survey)</th><th>Wave</th><th>Supply check</th></tr></thead>
          <tbody>{rows.map(r => { const s = size(r.id); return (
            <tr key={r.id}>
              <td><span className="cell-2"><span className="strong">{r.name}</span><small>{[r.city, r.country].filter(Boolean).join(', ')}{r.ref.kind === 'candidate' ? ' · new' : ''}</small></span></td>
              <td><span className="cell-2"><span>{EDGE_VARIANTS.find(v => v.key === (r.variant ?? defVariant))?.label ?? r.variant}</span><small>{kw(r.itKw)}</small></span></td>
              <td style={{ width: 130 }}><NumInput value={r.supplyKva} min={0} unit="kVA" disabled={readOnly} placeholder={s ? `${s.supplyKva} assumed` : 'assumed'} onChange={v => upd(r.id, { supplyKva: v })} /></td>
              <td style={{ width: 150 }}><SelectInput value={String(r.wave ?? 1)} disabled={readOnly} style={{ width: '100%', minWidth: 0 }} options={waveDates.map((d, i) => ({ id: String(i + 1), label: `${i + 1} · ${date(d)}` }))} onChange={v => upd(r.id, { wave: Number(v) })} /></td>
              <td>{s ? <Chip tone={s.needKva <= s.supplyKva ? 'success' : 'error'} size="xs" dot title={`Needs ${s.needKva} kVA (IT ${s.itKw} kW × PUE ${a?.pue}${s.variant.batteryHours ? ' plus battery recharge' : ''}) on ${s.supplyKva} kVA ${s.variant.supply}${s.supplySource === 'benchmark' ? ' (assumed: record the survey value)' : ''}`}>{num(s.needKva)} of {num(s.supplyKva)} kVA</Chip> : '—'}</td>
            </tr>
          ); })}</tbody>
        </Tbl>
      )}
    </div>
  );
}

/** Per-site plant (pack and Power step). */
export function EdgeSiteTable({ a }: { a: EdgeAnalysis }) {
  return (
    <Tbl>
      <thead><tr><th>Site</th><th>Wave</th><th>IT · racks</th><th>Supply need</th><th>UPS (N+1) · battery</th><th>Genset</th><th>Cooling (1+1)</th></tr></thead>
      <tbody>{a.sites.map(s => (
        <tr key={s.row.id}>
          <td><span className="cell-2"><span className="strong">{s.row.name}</span><small>{s.variant.label}</small></span></td><td><span className="cell-2"><span>Wave {s.wave}</span><small>{date(s.goLive)}</small></span></td><td className="num"><span className="cell-2"><span>{kw(s.itKw)}</span><small>{s.racks} rack{s.racks === 1 ? '' : 's'}</small></span></td>
          <td className="num"><span className="cell-2"><span style={{ color: s.needKva > s.supplyKva ? 'var(--vw-color-red-600)' : undefined }}>{num(s.needKva)} of {num(s.supplyKva)} kVA</span>{s.supplySource === 'benchmark' && <small>supply assumed</small>}</span></td>
          <td className="num"><span className="cell-2"><span>{s.upsModules} × 10 kW</span><small>{num(s.batteryKwh)} kWh, {s.runtimeMin >= 60 ? `${s.runtimeMin / 60} h` : `${s.runtimeMin} min`}</small></span></td>
          <td>{s.gensetKva ? <span className="cell-2"><span>{num(s.gensetKva)} kVA</span><small>{s.fuelHours} h fuel</small></span> : 'None (battery only)'}</td><td className="num">2 × {s.coolingUnitKw} kW</td>
        </tr>
      ))}</tbody>
    </Tbl>
  );
}

/** Per-site load forecast: the regional view is only the roll-up of these. */
export function EdgeLadderTable({ rows }: { rows: EdgeLadderRow[] }) {
  if (!rows.length) return <Quiet>No sites yet.</Quiet>;
  return (
    <Tbl>
      <thead><tr><th>Site</th><th>Installed</th><th>At go-live</th><th>After 12 months</th><th>After 24 months</th><th>Passes 85%</th><th>Status</th></tr></thead>
      <tbody>{rows.map(r => (
        <tr key={r.site.row.id}><td>{r.site.row.name}</td><td className="num">{kw(r.installedKw)}</td><td className="num">{kw(r.day1Kw)}</td><td className="num">{kw(r.month12Kw)}</td><td className="num">{kw(r.month24Kw)}</td><td>{r.crossesMonth === undefined ? '—' : `Month ${r.crossesMonth}`}</td><td><Chip tone={r.status === 'ok' ? 'success' : r.status === 'tight' ? 'warning' : 'error'} size="xs" dot>{r.status === 'ok' ? 'Room to grow' : r.status === 'tight' ? 'Tight in two years' : 'Full in two years'}</Chip></td></tr>
      ))}</tbody>
    </Tbl>
  );
}
