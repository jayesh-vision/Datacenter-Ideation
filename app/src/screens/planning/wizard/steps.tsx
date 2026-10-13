/* Wizard steps 1 and 2: the plan type (which fixes every later step) and the requirements in the planner's own words — where, how
   much, what runs in the racks, how critical, needed by when — from which the planner fills the design inputs. */
import { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import { Chip, Field, Panel, Seg, CheckBox, Btn, KV } from '../../../ui/kit';
import { DataTable, type Col } from '../../../ui/DataTable';
import type * as T from '../../../planner/p2b/types';
import { DC_TYPE_CATALOG } from '../../../planner/p2b/dcTypes';
import { modelFor } from '../../../planner/lib/scopes';
import { capacityFromRequirements, deriveFromRequirements, dimensionsFor, REQUIREMENTS, requirementParamKeys, type RequirementField } from '../../../planner/lib/dimensions';
import { CLIMATES, CLIMATE_LABEL, SITE_MODE, climateFromHint, fmtParam, fromDateInput, paramDefsFor, toDateInput, type StepProps } from '../../../planner/lib/wizardModel';
import { siteBaseline } from '../../../planner/lib/site';
import { EDGE_VARIANTS } from '../../../planner/lib/buildEdge';
import { byId } from '../../../planner/lib/plannerData';
import { Sub } from '../parts';
import { NumInput, SCOPE_GROUP, SCOPE_LABEL, SelectInput, TextArea, TextInput, kw, num } from '../common';
import { CandidatePlots } from './Candidates';

export const StepHead = ({ title, text, extra }: { title: string; text: string; extra?: React.ReactNode }) => <div className="pn-step-head"><div><h2>{title}</h2><p>{text}</p></div>{extra}</div>;

/* ------------------------------------------------------------------ step 1: plan type */
export function TypeStep({ draft, patch, templates, template }: StepProps) {
  const planTypes = useMemo(() => templates.filter(t => t.kind === 'plan' && t.status === 'published'), [templates]);
  const choose = (t: T.PlannerTemplate) => {
    const scope = t.scope ?? draft.scope;
    const params = { ...draft.params }, paramSources = { ...draft.paramSources };
    for (const key of requirementParamKeys(scope)) { const def = t.params.find(p => p.key === key); if (def?.default !== undefined && params[key] === undefined) { params[key] = def.default; paramSources[key] = 'template'; } }
    const next = { ...draft, templateId: t.id, scope, params, paramSources };
    const prof = DC_TYPE_CATALOG.find(p => p.key === draft.dcTypeKey);
    const siteKw = prof ? Math.round(((prof.powerKw[0] + (prof.powerKw[1] ?? prof.powerKw[0] * 4)) / 2) / 100) * 100 : 1000;
    const startKw: Partial<Record<T.PlannerScope, number>> = { 'server-refresh': 0, 'network-refresh': 0, 'rack-replace': 0, hall: prof?.highDensity ? 2500 : 1500, retrofit: 800, plant: 2000, network: 0, migration: 200, expansion: Math.max(2000, Math.round(siteKw / 2 / 100) * 100), 'new-dc': siteKw, portfolio: siteKw, edge: 0 };
    const designPowerKw = ['rack', 'pod', 'edge'].includes(scope) ? capacityFromRequirements(next) : scope !== draft.scope || !draft.designPowerKw ? startKw[scope] ?? siteKw : draft.designPowerKw;
    const mode = SITE_MODE[scope];
    const site: Partial<T.PlannerPlan> = mode === 'new' || mode === 'region' || mode === 'campus' ? { dataCenterId: undefined, peerDataCenterId: undefined } : mode === 'existing' ? { newSiteName: undefined, peerDataCenterId: undefined } : { newSiteName: undefined };
    if (mode !== 'existing') delete params.targetHallId;
    const base: Partial<T.PlannerPlan> = { templateId: t.id, scope, params, paramSources, designPowerKw, ...(SITE_MODE[draft.scope] !== mode ? site : {}) };
    patch({ ...base, ...(modelFor(scope).seedDraft?.({ ...draft, ...base } as T.PlannerPlan) ?? {}) });
  };
  const groups = ['On an existing site', 'Replace or refresh', 'New capacity'] as const;
  return (
    <div>
      <StepHead title="What are you planning?" text="Pick a plan type. It decides which areas the wizard asks about, which inputs and rules apply, what the plan produces and who approves it." />
      {groups.map(g => { const ts = planTypes.filter(t => t.scope && SCOPE_GROUP[t.scope] === g); return ts.length ? (
        <div key={g}><Sub>{g}</Sub><div className="pn-cards">{ts.map(t => { const on = draft.templateId === t.id; const d = dimensionsFor(t); return (
          <button key={t.id} type="button" className={`pn-card${on ? ' is-on' : ''}`} onClick={() => choose(t)} aria-pressed={on}>
            <span className="row between"><b>{t.name}</b>{on ? <Chip tone="info" size="xs">Selected</Chip> : t.inheritsFrom ? <Chip tone="purple" size="xs">Variant</Chip> : null}</span>
            <span className="vw-label">{t.description}</span>
            <span className="vw-label" style={{ fontSize: 11.5 }}>{d.length} areas · becomes a {t.executesAs ?? 'plan'}{t.approvalPath.length ? ` · ${t.approvalPath.length} approval step${t.approvalPath.length === 1 ? '' : 's'}` : ''}</span>
          </button>); })}</div></div>) : null; })}
      {template && (
        <Panel icon={I.Route} title={`${template.name}: what happens next`} style={{ marginTop: 16 }}>
          <div className="pn-two is-wide">
            <div>
              <div className="strong" style={{ fontSize: 12.5, marginBottom: 6 }}>The wizard asks about {dimensionsFor(template).length} areas, then you compare options and submit</div>
              <div className="row wrap" style={{ gap: 4 }}>{dimensionsFor(template).map(({ dim, depth }) => <Chip key={dim.key} tone={depth === 'full' ? 'info' : 'neutral'} size="xs">{dim.label}{depth === 'summary' ? ' · brief' : ''}</Chip>)}</div>
            </div>
            <div className="vw-label" style={{ fontSize: 12.5 }}>
              <b className="strong">Where:</b> {{ existing: 'inside a live site; its kind, tier and climate set the defaults.', 'two-sites': 'between two live sites.', migration: 'from a live site to another, or a decommission.', campus: 'a new building on an existing campus.', new: 'a new site on new land.', region: 'across the sites of a region.' }[SITE_MODE[template.scope ?? draft.scope]]}<br />
              <b className="strong">Approved by:</b> {template.approvalPath.join(' → ') || 'no one'}.<br /><b className="strong">Produces:</b> {template.outputs.join(', ').toLowerCase() || '—'}.
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ step 2: requirements */
const MIX: { key: 'gpuPct' | 'computePct' | 'storagePct'; label: string; hint: string }[] = [{ key: 'gpuPct', label: 'GPU and accelerators', hint: 'AI training and inference' }, { key: 'computePct', label: 'General compute', hint: 'Virtual machines, applications' }, { key: 'storagePct', label: 'Storage', hint: 'Object, block, backup' }];
function rebalance(d: T.PlannerDemand, key: typeof MIX[number]['key'], value: number): T.PlannerDemand {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const others = MIX.map(m => m.key).filter(k => k !== key);
  const rest = 100 - v, cur = others.reduce((a, k) => a + d[k], 0);
  const out = { ...d, [key]: v } as T.PlannerDemand;
  if (cur <= 0) { out[others[0]] = rest; out[others[1]] = 0; } else { out[others[0]] = Math.round((d[others[0]] / cur) * rest); out[others[1]] = rest - out[others[0]]; }
  return out;
}
const TIER_TEXT: Record<string, string> = { 'Tier II': 'Some downtime for maintenance is acceptable.', 'Tier III': 'Any part can be maintained without stopping the load.', 'Tier IV': 'Survives any single failure without stopping the load.' };

export function RequirementsStep(props: StepProps) {
  const { draft, patch, setParam, template, ev, templates, benchmarks, issues = [], readOnly } = props;
  const err = (f: string) => issues.filter(i => i.field === f).map(i => i.text).join(' ') || undefined;
  const fields = REQUIREMENTS[draft.scope];
  const has = (f: RequirementField) => fields.includes(f);
  const defs = useMemo(() => paramDefsFor(ev, templates, draft.dcTypeKey), [ev, templates, draft.dcTypeKey]);
  const n = (k: string) => Number(draft.params[k] ?? defs.get(k)?.default ?? 0);
  const setReq = (key: string, v: number | string) => {
    setParam(key, v, 'user');
    const next = { ...draft, params: { ...draft.params, [key]: v } };
    if (['rackCount', 'densityKwPerRack', 'siteCount', 'kwPerSite'].includes(key)) patch({ designPowerKw: capacityFromRequirements(next) });
    if (key === 'densityKwPerRack') patch({ demand: { ...draft.demand, densityKwPerRack: Number(v) } });
  };
  const preview = useMemo(() => deriveFromRequirements(draft, template, benchmarks), [draft, template, benchmarks]);
  const sum = draft.demand.gpuPct + draft.demand.computePct + draft.demand.storagePct;
  const capLabel = draft.scope === 'migration' ? 'IT load moving' : draft.scope === 'plant' ? 'IT load the plant must carry' : draft.scope === 'expansion' ? 'Extra IT capacity needed' : 'IT capacity needed';
  const howMuch = fields.some(f => ['capacityKw', 'rackCount', 'densityKwPerRack', 'siteCount', 'kwPerSite', 'dciGbpsRequired', 'racksToMove', 'growth', 'tenancy'].includes(f));
  return (
    <div>
      <StepHead title="What do you need?" text="Answer in your own terms. These answers fill the inputs of every following step; you only change what differs." />
      <div className="pn-grid-3">
        <Field label="Plan name" required error={err('title')} style={{ gridColumn: 'span 2' }}><TextInput value={draft.title} disabled={readOnly} placeholder="e.g. Los Angeles AI campus · 50 MW" onChange={v => patch({ title: v })} /></Field>
        <Field label={draft.scope === 'migration' ? 'Finished by' : 'Needed by'} required error={err('targetGoLive')}><TextInput type="date" value={toDateInput(draft.targetGoLive)} disabled={readOnly} onChange={v => patch({ targetGoLive: fromDateInput(v, draft.targetGoLive) })} /></Field>
        <Field label="What is this plan for?" style={{ gridColumn: 'span 3' }}><TextArea rows={2} value={draft.intent} disabled={readOnly} placeholder="The need in a sentence or two: who asked for it, why, and any constraint the reviewers should know." onChange={v => patch({ intent: v })} /></Field>
      </div>
      <Sub>Where</Sub>
      {err('site') && <p className="field-error" style={{ margin: '0 0 8px' }}>{err('site')}</p>}
      <SitePicker {...props} />
      {has('affected') && <AffectedPicker {...props} />}
      {draft.scope === 'edge' && <EdgeSites {...props} />}
      {draft.scope === 'new-dc' && <CandidatePlots {...props} />}
      {howMuch && <Sub>How much</Sub>}
      <div className="pn-grid-4">
        {has('capacityKw') && <Field label={capLabel} required error={err('capacity')} hint={draft.designPowerKw >= 1000 ? kw(draft.designPowerKw) : undefined}><NumInput value={draft.designPowerKw || undefined} min={0} unit="kW" disabled={readOnly} onChange={v => patch({ designPowerKw: v ?? 0 })} /></Field>}
        {has('rackCount') && <Field label="Racks needed"><NumInput value={n('rackCount')} min={1} disabled={readOnly} onChange={v => v !== undefined && setReq('rackCount', v)} /></Field>}
        {has('densityKwPerRack') && <Field label="Power per rack"><NumInput value={n('densityKwPerRack')} min={1} max={150} unit="kW" disabled={readOnly} onChange={v => v !== undefined && setReq('densityKwPerRack', v)} /></Field>}
        {has('dciGbpsRequired') && <Field label="Interconnect capacity needed"><NumInput value={n('dciGbpsRequired')} min={100} step={100} unit="Gbps" disabled={readOnly} onChange={v => v !== undefined && setReq('dciGbpsRequired', v)} /></Field>}
        {has('racksToMove') && <Field label="Racks to move"><NumInput value={n('racksToMove')} min={1} disabled={readOnly} onChange={v => v !== undefined && setReq('racksToMove', v)} /></Field>}
        {has('growth') && <Field label="Demand growth per year" hint="when installed capacity runs out"><NumInput value={draft.demand.growthPctPerYear} min={0} max={100} unit="%" disabled={readOnly} onChange={v => v !== undefined && patch({ demand: { ...draft.demand, growthPctPerYear: v } })} /></Field>}
        {has('tenancy') && <Field label="Who uses it"><Seg<T.PlannerDemand['tenancy']> size="sm" value={draft.demand.tenancy} onChange={v => patch({ demand: { ...draft.demand, tenancy: v } })} options={[{ id: 'single', label: 'Us' }, { id: 'multi', label: 'Several tenants' }]} /></Field>}
        {(draft.scope === 'rack' || draft.scope === 'pod' || draft.scope === 'edge') && <Field label="Total IT load" error={err('capacity')}><div style={{ fontSize: 18, fontWeight: 500, paddingTop: 4 }} className="num">{kw(draft.designPowerKw)}</div></Field>}
      </div>
      {has('workload') && <>
        <Sub extra={<Chip tone={sum === 100 ? 'success' : 'error'} dot>{sum}%</Chip>}>What runs in the racks</Sub>
        {err('workload') && <p className="field-error" style={{ margin: '0 0 8px' }}>{err('workload')}</p>}
        <div className="pn-mix">{MIX.map(m => <div key={m.key} className="tile"><div className="row between"><span className="strong" style={{ fontSize: 13 }}>{m.label}</span><b className="num">{draft.demand[m.key]}%</b></div><input type="range" min={0} max={100} value={draft.demand[m.key]} disabled={readOnly} onChange={e => patch({ demand: rebalance(draft.demand, m.key, Number(e.target.value)) })} /><span className="vw-label" style={{ fontSize: 11.5 }}>{m.hint}</span></div>)}</div>
      </>}
      {has('tier') && <>
        <Sub>How critical is it?</Sub>
        <div className="pn-tiers">{['Tier II', 'Tier III', 'Tier IV'].map(t => { const on = String(draft.params.tier ?? defs.get('tier')?.default ?? 'Tier III') === t; return <button key={t} type="button" className={`pn-card${on ? ' is-on' : ''}`} disabled={readOnly} aria-pressed={on} onClick={() => setReq('tier', t)}><b>{t}</b><span className="vw-label">{TIER_TEXT[t]}</span></button>; })}</div>
      </>}
      {preview.length > 0 && (
        <Panel icon={I.Wand2} title={`From these answers the planner fills ${preview.length} inputs`} sub="You can change any of them on the next steps" style={{ marginTop: 16 }} info="Each design input the planner derives from the requirements (tier, density, workload mix, climate, site type), with the reason. Inputs you set yourself are never overwritten.">
          <div className="pn-why">{preview.map(d => { const def = defs.get(d.key); return <div key={d.key}><span style={{ minWidth: 0 }}><span className="strong">{def?.label ?? d.key}</span> <span className="vw-label">· {d.why}</span></span><b>{fmtParam(d.key, d.value, def?.unit)}</b></div>; })}</div>
        </Panel>
      )}
      {ev && draft.designPowerKw > 0 && <div className="tile" style={{ marginTop: 12 }}><KV cols={4} items={[['IT capacity', <b className="num" style={{ fontSize: 18 }}>{kw(ev.sizing.itKw)}</b>], ['Racks', <b className="num" style={{ fontSize: 18 }}>{num(ev.sizing.racks)}</b>], ['Halls', <b className="num" style={{ fontSize: 18 }}>{num(ev.sizing.halls)}</b>], ['Buildings', <b className="num" style={{ fontSize: 18 }}>{num(ev.sizing.buildings)}</b>]]} /></div>}
    </div>
  );
}

/* ---- where: the site picker per plan family */
function SitePicker({ draft, patch, estate, data, readOnly }: StepProps) {
  const mode = SITE_MODE[draft.scope];
  const live = estate.dataCenters.filter(d => d.status === 'Operational' || d.id === draft.dataCenterId || d.id === draft.peerDataCenterId);
  const campusOf = (id?: string) => estate.campuses.find(c => c.id === id);
  const opts = live.map(d => ({ id: d.id, label: `${d.name} · ${campusOf(d.campusId)?.city ?? ''}` }));
  const profile = DC_TYPE_CATALOG.find(p => p.key === draft.dcTypeKey);
  const pickSite = (id: string) => { const d = estate.dataCenters.find(x => x.id === id); if (!d) return; const c = campusOf(d.campusId); const params = { ...draft.params }; delete params.targetHallId; patch({ dataCenterId: d.id, campusId: d.campusId, regionId: c?.regionId ?? draft.regionId, dcTypeKey: d.dcTypeKey ?? draft.dcTypeKey, climate: climateFromHint(c?.city) ?? draft.climate, newSiteName: undefined, params }); };
  const base = draft.dataCenterId && data.ready ? siteBaseline(data, draft.dataCenterId, { excludePlanId: draft.id }) : undefined;
  const facts = base && (
    <div className="note note--info" style={{ marginTop: 8 }}><I.Building2 size={15} /><div><b>{base.dc.name}</b> · {kw(base.headroomItKw)} of IT headroom today ({base.binding?.label ?? 'no stage'} binds) · live draw {kw(base.itLoadKw)} · holds {kw(base.reservedKw)} · approved plans {kw(base.pipelineKw)} · {base.halls.reduce((a, h) => a + h.freePositions, 0)} free rack positions in {base.halls.length} halls{base.warnings.length ? ` · ${base.warnings.join('; ')}` : ''}</div></div>
  );
  const kindField = <Field label="Kind of site" hint={profile ? `${profile.cooling} · ${profile.redundancy} · ${profile.defaultTier}` : undefined}><SelectInput value={draft.dcTypeKey} disabled={readOnly} options={DC_TYPE_CATALOG.map(p => ({ id: p.key, label: p.name }))} onChange={v => patch({ dcTypeKey: v })} /></Field>;
  const climateField = <Field label="Climate"><SelectInput value={draft.climate} disabled={readOnly} options={CLIMATES.map(c => ({ id: c, label: CLIMATE_LABEL[c] }))} onChange={v => patch({ climate: v as T.PlannerPlan['climate'] })} /></Field>;
  if (mode === 'existing') {
    const halls = estate.halls.filter(h => h.dataCenterId === draft.dataCenterId);
    return <>
      <div className="pn-grid-3">
        <Field label="Data centre" required><SelectInput value={draft.dataCenterId} placeholder="Pick a site" disabled={readOnly} options={opts} onChange={pickSite} /></Field>
        {draft.scope === 'hall' && <Field label="Hall" required hint="A shell hall for a full fit-out, or a partly used hall to fill"><SelectInput value={String(draft.params.targetHallId ?? '')} placeholder="Pick the hall" disabled={readOnly} options={halls.map(h => { const b = base?.halls.find(x => x.hall.id === h.id); return { id: h.id, label: `${h.name} · ${h.status ?? 'Live'} · ${b ? `${b.freePositions} free positions, ${kw(b.headroomKw)} left` : `${h.rackCount}/${h.rackCapacity} racks`}` }; })} onChange={v => patch({ params: { ...draft.params, targetHallId: v }, paramSources: { ...draft.paramSources, targetHallId: 'user' } })} /></Field>}
      </div>{facts}</>;
  }
  if (mode === 'two-sites' || mode === 'migration') return <>
    <div className="pn-grid-3">
      <Field label={mode === 'migration' ? 'Site being emptied' : 'Site A'} required><SelectInput value={draft.dataCenterId} placeholder="Pick a site" disabled={readOnly} options={opts.filter(o => o.id !== draft.peerDataCenterId)} onChange={pickSite} /></Field>
      <Field label={mode === 'migration' ? 'Where the load goes' : 'Site B'} required={mode !== 'migration'} hint={mode === 'migration' ? 'Leave empty for a decommission' : undefined}><SelectInput value={draft.peerDataCenterId ?? ''} placeholder={mode === 'migration' ? 'Decommission only' : 'Pick a site'} disabled={readOnly} options={opts.filter(o => o.id !== draft.dataCenterId)} onChange={v => patch({ peerDataCenterId: v || undefined })} /></Field>
    </div>{facts}</>;
  if (mode === 'campus') {
    const campuses = estate.campuses.filter(c => estate.dataCenters.some(d => d.campusId === c.id));
    return <div className="pn-grid-3">
      <Field label="Campus to expand" required><SelectInput value={draft.campusId} placeholder="Pick a campus" disabled={readOnly} options={campuses.map(c => ({ id: c.id, label: `${c.name} · ${estate.dataCenters.filter(d => d.campusId === c.id).map(d => d.name).join(', ')}` }))} onChange={id => { const c = campuses.find(x => x.id === id); const first = estate.dataCenters.find(d => d.campusId === id); patch({ campusId: id, regionId: c?.regionId, dataCenterId: undefined, dcTypeKey: first?.dcTypeKey ?? draft.dcTypeKey, climate: climateFromHint(c?.city) ?? draft.climate }); }} /></Field>
      <Field label="New building name" required><TextInput value={draft.newSiteName ?? ''} disabled={readOnly} placeholder="e.g. Building C" onChange={v => patch({ newSiteName: v })} /></Field>
      {kindField}{climateField}
    </div>;
  }
  const candidates = String(draft.params.candidateSiteIds ?? '').split(',').filter(Boolean);
  return <div className="pn-grid-3">
    <Field label="Region" required><SelectInput value={draft.regionId} placeholder="Pick a region" disabled={readOnly} options={estate.regions.map(r => ({ id: r.id, label: r.name }))} onChange={v => patch({ regionId: v, campusId: undefined, dataCenterId: undefined })} /></Field>
    {mode === 'new' && <Field label="Nearest campus (optional)" hint="for shared spares, staff and network"><SelectInput value={draft.campusId ?? ''} placeholder="None" disabled={readOnly} options={estate.campuses.filter(c => !draft.regionId || c.regionId === draft.regionId).map(c => ({ id: c.id, label: c.name }))} onChange={v => patch({ campusId: v || undefined })} /></Field>}
    {mode === 'new' && <Field label={draft.scope === 'edge' ? 'Rollout name' : 'New site name'} required><TextInput value={draft.newSiteName ?? ''} disabled={readOnly} placeholder={draft.scope === 'edge' ? 'e.g. West edge wave 1' : 'e.g. CA-AI-01'} onChange={v => patch({ newSiteName: v })} /></Field>}
    {mode === 'region' && <Field label="Sites to consider" hint="empty = every live site in the region" style={{ gridColumn: 'span 2' }}><div className="row wrap" style={{ gap: 10 }}>{live.filter(d => !draft.regionId || campusOf(d.campusId)?.regionId === draft.regionId).map(d => <CheckBox key={d.id} on={candidates.includes(d.id)} label={d.name} onChange={on => { const next = on ? [...candidates, d.id] : candidates.filter(x => x !== d.id); patch({ params: { ...draft.params, candidateSiteIds: next.join(',') }, paramSources: { ...draft.paramSources, candidateSiteIds: 'user' } }); }} />)}</div></Field>}
    {climateField}{kindField}
  </div>;
}

/* ---- replacements: what is being replaced (devices at the site, by model) */
function AffectedPicker({ draft, patch, data, readOnly }: StepProps) {
  const [model, setModel] = useState('');
  const devices = useMemo(() => data.devices.filter(d => d.dataCenterId === draft.dataCenterId && d.rackId && d.lifecycleState !== 'Retired' && d.lifecycleState !== 'Disposed' && (draft.scope === 'rack-replace' || (draft.scope === 'server-refresh' ? ['Server', 'Storage', 'GPU-Node'] : ['Switch', 'Router', 'Firewall']).includes(d.category ?? ''))), [data.devices, draft.dataCenterId, draft.scope]);
  const models = [...new Set(devices.map(d => d.model ?? ''))].filter(Boolean).sort();
  const selected = new Set(String(draft.params.affectedIds ?? '').split(',').filter(Boolean));
  const commit = (ids: Set<string>) => {
    const chosen = devices.filter(d => ids.has(d.id));
    const racks = [...new Set(chosen.map(d => d.rackId!))];
    patch({ params: { ...draft.params, affectedIds: [...ids].join(','), affectedCount: draft.scope === 'rack-replace' ? racks.length : chosen.length, affectedDevices: chosen.length, affectedRacks: racks.length, affectedKw: Math.round(chosen.reduce((a, d) => a + (d.powerDrawW ?? 400), 0) / 1000 * 10) / 10, affectedSiteId: draft.dataCenterId ?? '' }, paramSources: { ...draft.paramSources, affectedIds: 'user', affectedCount: 'user' } });
  };
  const shown = devices.filter(d => !model || d.model === model);
  const cols: Col<typeof devices[number]>[] = [
    { key: 's', header: '', render: d => <CheckBox on={selected.has(d.id)} onChange={on => { const n = new Set(selected); on ? n.add(d.id) : n.delete(d.id); commit(n); }} /> },
    { key: 'n', header: 'Device', render: d => <span className="mono">{d.name}</span> },
    { key: 'm', header: 'Model', render: d => `${d.manufacturer ?? ''} ${d.model ?? ''}` },
    { key: 'r', header: 'Rack', render: d => byId(data, 'racks', d.rackId)?.name ?? d.rackId ?? '—' },
    { key: 'w', header: 'Draw', render: d => <span className="num">{d.powerDrawW ? `${d.powerDrawW} W` : '—'}</span> },
    { key: 'st', header: 'State', render: d => d.lifecycleState ?? d.status },
  ];
  if (!draft.dataCenterId) return null;
  const modelOpts = models.map(m => ({ id: m, label: `${m} (${devices.filter(d => d.model === m).length})` }));
  const selectShown = () => commit(new Set([...selected, ...shown.map(d => d.id)]));
  const tools = (
    <span className="row" style={{ gap: 8 }}>
      <span className="vw-label">{selected.size} selected</span>
      <SelectInput value={model} placeholder="Every model" options={modelOpts} onChange={setModel} style={{ height: 32, minWidth: 220 }} />
      {!readOnly && <Btn size="sm" onClick={selectShown}>Select shown</Btn>}
      {!readOnly && <Btn size="sm" variant="ghost" onClick={() => commit(new Set())}>Clear</Btn>}
    </span>
  );
  return <div style={{ marginTop: 12 }}>
    <Sub extra={tools}>What is being replaced</Sub>
    <DataTable rows={shown} cols={cols} pageSize={8} compact />
  </div>;
}

/* ---- edge rollout: the sites, each with its load, power variant and wave */
function EdgeSites({ draft, patch, readOnly }: StepProps) {
  const rows = (draft.sites ?? []).filter(r => r.ref.kind === 'edgeLocation' || r.ref.kind === 'candidate');
  const commit = (next: T.PlannerSiteRow[]) => patch({ sites: [...(draft.sites ?? []).filter(r => r.ref.kind !== 'edgeLocation' && r.ref.kind !== 'candidate'), ...next], designPowerKw: next.reduce((a, r) => a + r.itKw, 0), params: { ...draft.params, siteCount: next.length, kwPerSite: next.length ? Math.round(next.reduce((a, r) => a + r.itKw, 0) / next.length) : 0 } });
  const add = () => commit([...rows, { id: `S-${rows.length + 1}`, name: `Site ${rows.length + 1}`, ref: { kind: 'candidate' }, itKw: Number(draft.params.kwPerSite) || 40, goLive: draft.targetGoLive, wave: 1, variant: EDGE_VARIANTS[0].key }]);
  const upd = (id: string, p: Partial<T.PlannerSiteRow>) => commit(rows.map(r => (r.id === id ? { ...r, ...p } : r)));
  return <div style={{ marginTop: 12 }}>
    <Sub extra={!readOnly && <Btn size="sm" icon={I.Plus} onClick={add}>Add a site</Btn>}>Sites in the rollout</Sub>
    {rows.length ? <table className="nst-table pn-phases" style={{ width: '100%' }}><thead><tr><th>Site</th><th>City</th><th>IT load</th><th>Power variant</th><th>Wave</th><th></th></tr></thead><tbody>
      {rows.map(r => <tr key={r.id}><td><TextInput value={r.name} disabled={readOnly} onChange={v => upd(r.id, { name: v })} /></td><td><TextInput value={r.city ?? ''} disabled={readOnly} onChange={v => upd(r.id, { city: v })} /></td><td><NumInput value={r.itKw} min={1} unit="kW" disabled={readOnly} onChange={v => v !== undefined && upd(r.id, { itKw: v })} /></td><td><SelectInput value={r.variant ?? EDGE_VARIANTS[0].key} disabled={readOnly} options={EDGE_VARIANTS.map(v => ({ id: v.key, label: v.label }))} onChange={v => upd(r.id, { variant: v })} /></td><td><NumInput value={r.wave ?? 1} min={1} max={9} disabled={readOnly} onChange={v => v !== undefined && upd(r.id, { wave: v })} /></td><td>{!readOnly && <Btn size="sm" variant="ghost" icon={I.Trash2} onClick={() => commit(rows.filter(x => x.id !== r.id))} />}</td></tr>)}
    </tbody></table> : <p className="vw-label">No sites yet: add the locations the template is stamped on; the count and the total load follow from them.</p>}
  </div>;
}

export { SCOPE_LABEL };
