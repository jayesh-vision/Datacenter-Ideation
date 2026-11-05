/* Planner → Templates → Site types: custom site types. NewSiteTypeModal = a copy of an existing type under a new name (a draft
   site-type template carrying the whole catalogue entry); SiteTypeSection = every field of that entry in the draft editor (sizes,
   physical standard, build, capacity limits, PUE). Once published the type joins the catalogue (dcTypes.ts syncSiteTypes): new plans
   can pick it, and the planner sizes, prices and schedules it from these values; benchmarks fall back to the type it was based on. */
import { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import { Btn, Field, Modal, Toggle } from '../../ui/kit';
import { usePlannerActions, useTemplates } from '../../planner/lib/usePlanner';
import { DC_TYPE_CATALOG, dcTypeProfile, pickableDcTypes, type CoolingUnitType, type DcTypeProfile, type LiquidCoolingPosture, type WanProfile } from '../../planner/p2b/dcTypes';
import { CONTAINMENT, DC_SEGMENT, DC_TIERS, POWER_REDUNDANCY } from '../../planner/p2b/enums';
import { siteTypeErrors } from '../../planner/lib/templateCatalog';
import type * as T from '../../planner/p2b/types';
import { NumInput, SelectInput, TextInput } from './common';

const opts = <V extends string>(xs: readonly V[], label: (v: V) => string = v => v) => xs.map(id => ({ id, label: label(id) }));
const UNITS: CoolingUnitType[] = ['CRAC', 'CRAH', 'InRow', 'RDHx', 'CDU'];
const UNIT_LABEL: Record<CoolingUnitType, string> = { CRAC: 'CRAC', CRAH: 'CRAH', InRow: 'In-row', RDHx: 'Rear door', CDU: 'CDU (liquid)' };
const LIQUID: Record<LiquidCoolingPosture, string> = { none: 'None', optional: 'Optional', standard: 'Standard' };
const WAN: Record<WanProfile, string> = { edge: 'Edge (one or two circuits)', enterprise: 'Enterprise', colo: 'Colocation (carrier neutral)', telco: 'Telco' };
const BLUEPRINTS: Record<string, string> = { 'greenfield-dc': 'Greenfield data centre', 'hyperscale-campus': 'Hyperscale campus', 'ai-gpu-factory': 'AI / GPU factory', 'modular-pod': 'Modular POD', 'telco-site': 'Telco site', 'edge-wave': 'Edge roll-out wave' };
const VOLTS = [400, 11000, 33000, 132000];

/* ------------------------------------------------------------------ New site type */
export function NewSiteTypeModal({ base: base0, onClose, onCreated }: { base?: string; onClose: () => void; onCreated: (id: string) => void }) {
  const templates = useTemplates();
  const actions = usePlannerActions();
  const types = pickableDcTypes();
  const [base, setBase] = useState(base0 ?? '');
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const b = dcTypeProfile(base) ?? templates.find(t => t.kind === 'profile' && t.dcTypeKey === base)?.siteType;
  const names = useMemo(() => [...DC_TYPE_CATALOG.map(t => t.name), ...templates.filter(t => t.kind === 'profile' && !t.isDeleted && !t.versionOf).map(t => t.name)].map(n => n.trim().toLowerCase()), [templates]);
  const clash = !!name.trim() && names.includes(name.trim().toLowerCase());
  const [err, setErr] = useState('');
  const ok = !!b && !!name.trim() && !clash;
  const create = () => { const r = actions.createSiteType({ name, label: label || b!.label, base }); if ('id' in r) onCreated(r.id); else setErr(r.reason); };
  return (
    <Modal open onClose={onClose} title="New site type" width={560}
      foot={<div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.Plus} disabled={!ok} onClick={create}>Create draft</Btn></div>}>
      <div className="pn-te-new">
        <Field label="Start from" required hint="Its sizes, physical standard, build programme, capacity limits and default inputs are copied; you change what differs. Benchmarks with no value for the new type use this one's.">
          <select className="select" value={base} onChange={e => setBase(e.target.value)}>
            <option value="" disabled>Choose a site type</option>
            {DC_SEGMENT.map(seg => <optgroup key={seg} label={seg}>{types.filter(t => t.segment === seg).map(t => <option key={t.key} value={t.key}>{t.name}{t.basedOn ? ' (custom)' : ''}</option>)}</optgroup>)}
          </select>
        </Field>
        <Field label="Name" required error={clash ? 'A site type with this name already exists.' : undefined}><TextInput value={name} onChange={setName} placeholder="e.g. Sovereign AI cloud, Liquid-cooled inference POD" /></Field>
        <Field label="Short label" hint="used in site codes, e.g. SAI"><TextInput value={label} onChange={v => setLabel(v.toUpperCase().slice(0, 6))} placeholder={b?.label ?? ''} /></Field>
        {err && <p className="vw-label" style={{ margin: 0, color: 'var(--vw-color-red-600)' }}>{err}</p>}
        <p className="vw-label" style={{ margin: 0 }}>It starts as a draft v1 that no plan can pick. Edit it, then publish it: new plans can then choose it as their kind of site.</p>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ the catalogue entry in the draft editor */
export function SiteTypeSection({ v, onChange }: { v: DcTypeProfile; onChange: (v: DcTypeProfile) => void }) {
  const set = (p: Partial<DcTypeProfile>) => onChange({ ...v, ...p });
  const ph = (p: Partial<DcTypeProfile['physical']>) => set({ physical: { ...v.physical, ...p } });
  const bd = (p: Partial<DcTypeProfile['build']>) => set({ build: { ...v.build, ...p } });
  const cp = (p: Partial<DcTypeProfile['capacity']>) => set({ capacity: { ...v.capacity, ...p } });
  const n = (x: number | undefined, d: number) => (x === undefined || Number.isNaN(x) ? d : x);
  const pair = (label: string, r: [number, number | null], f: (r: [number, number | null]) => void, unit?: string, open = true) =>
    <Field label={label}><div className="pn-st-pair"><NumInput value={r[0]} unit={unit} onChange={x => f([n(x, 0), r[1]])} /><span>to</span><NumInput value={r[1] ?? undefined} unit={unit} placeholder={open ? 'no limit' : ''} onChange={x => f([r[0], x === undefined ? (open ? null : r[0]) : x])} /></div></Field>;
  const errs = siteTypeErrors(v);
  const base = v.basedOn ? dcTypeProfile(v.basedOn) : undefined;
  return (
    <section className="pn-st">
      <h4>Site type <span className="vw-label" style={{ fontWeight: 400 }}>· {v.key}{base ? ` · based on ${base.name}` : ''}</span></h4>
      <p className="vw-label" style={{ margin: 0 }}>What the planner assumes for a site of this kind: the sizes it suggests and checks against, the plant it lays out, how long and how much a new build takes, and the capacity limits it flags. Name and description are set above.</p>
      <h5>Size and density</h5>
      <div className="pn-st-grid">
        <Field label="Short label"><TextInput value={v.label} onChange={x => set({ label: x.toUpperCase().slice(0, 6) })} /></Field>
        <Field label="Segment"><SelectInput value={v.segment} options={opts(DC_SEGMENT)} onChange={x => set({ segment: x })} /></Field>
        <Field label="Default tier"><SelectInput value={v.defaultTier} options={opts(DC_TIERS)} onChange={x => set({ defaultTier: x })} /></Field>
        {pair('Facility power', v.powerKw, r => set({ powerKw: r }), 'kW')}
        {pair('Typical racks', v.typicalRacks, r => set({ typicalRacks: r }))}
        <Field label="kW per rack"><div className="pn-st-pair"><NumInput value={v.kwPerRack?.[0]} unit="kW" onChange={x => set({ kwPerRack: [n(x, 1), v.kwPerRack?.[1] ?? n(x, 1)] })} /><span>to</span><NumInput value={v.kwPerRack?.[1]} unit="kW" onChange={x => set({ kwPerRack: [v.kwPerRack?.[0] ?? 1, n(x, v.kwPerRack?.[0] ?? 1)] })} /></div></Field>
        <Field label="High density" hint="GPU-class racks"><Toggle on={!!v.highDensity} onChange={x => set({ highDensity: x || undefined })} /></Field>
        <Field label="Multi-tenant" hint="colocation"><Toggle on={!!v.multiTenant} onChange={x => set({ multiTenant: x || undefined })} /></Field>
        <Field label="−48 V DC plant" hint="telco power"><Toggle on={!!v.dcPowerPlant} onChange={x => set({ dcPowerPlant: x || undefined })} /></Field>
      </div>
      <h5>Physical standard</h5>
      <div className="pn-st-grid">
        <Field label="Power redundancy"><SelectInput value={v.physical.redundancy} options={opts(POWER_REDUNDANCY)} onChange={x => ph({ redundancy: x })} /></Field>
        <Field label="Containment"><SelectInput value={v.physical.containment} options={opts(CONTAINMENT)} onChange={x => ph({ containment: x })} /></Field>
        <Field label="Rack height"><SelectInput value={String(v.physical.rackHeightU) as '42' | '45' | '48'} options={opts(['42', '45', '48'] as const, x => `${x}U`)} onChange={x => ph({ rackHeightU: Number(x) as 42 | 45 | 48 })} /></Field>
        <Field label="Cooling units" style={{ gridColumn: 'span 2' }}><div className="pn-st-units">{UNITS.map(u => { const on = v.physical.coolingUnits.includes(u); return <button key={u} type="button" className={on ? 'is-on' : ''} onClick={() => ph({ coolingUnits: on ? v.physical.coolingUnits.filter(x => x !== u) : [...v.physical.coolingUnits, u] })}>{on && <I.Check size={12} />}{UNIT_LABEL[u]}</button>; })}</div></Field>
        <Field label="Liquid cooling"><SelectInput value={v.physical.liquidCooling} options={opts(Object.keys(LIQUID) as LiquidCoolingPosture[], x => LIQUID[x])} onChange={x => ph({ liquidCooling: x })} /></Field>
        <Field label="Cooling, as written"><TextInput value={v.cooling} onChange={x => set({ cooling: x })} /></Field>
        <Field label="Cooling overhead" hint="share of IT load; sets PUE"><NumInput value={Math.round(v.physical.coolingOverhead * 100)} unit="%" onChange={x => ph({ coolingOverhead: n(x, 0) / 100 })} /></Field>
        <Field label="Cooling zones"><NumInput value={v.physical.coolingZones} min={1} onChange={x => ph({ coolingZones: Math.max(1, Math.round(n(x, 1))) })} /></Field>
        <Field label="Resilience, as written"><TextInput value={v.redundancy} onChange={x => set({ redundancy: x })} /></Field>
        <Field label="Utility intake"><SelectInput value={String(v.physical.feedVoltage)} options={VOLTS.map(x => ({ id: String(x), label: x >= 1000 ? `${x / 1000} kV` : `${x} V` }))} onChange={x => ph({ feedVoltage: Number(x) })} /></Field>
        <Field label="Battery ride-through"><div className="pn-st-pair"><NumInput value={v.physical.backupRuntimeMins[0]} unit="min" onChange={x => ph({ backupRuntimeMins: [n(x, 0), v.physical.backupRuntimeMins[1]] })} /><span>to</span><NumInput value={v.physical.backupRuntimeMins[1]} unit="min" onChange={x => ph({ backupRuntimeMins: [v.physical.backupRuntimeMins[0], n(x, 0)] })} /></div></Field>
        <Field label="Buildings"><NumInput value={v.physical.buildings} min={1} onChange={x => ph({ buildings: Math.max(1, Math.round(n(x, 1))) })} /></Field>
        <Field label="Floors per building"><div className="pn-st-pair"><NumInput value={v.physical.floorsPerBuilding[0]} onChange={x => ph({ floorsPerBuilding: [Math.max(1, Math.round(n(x, 1))), v.physical.floorsPerBuilding[1]] })} /><span>to</span><NumInput value={v.physical.floorsPerBuilding[1]} onChange={x => ph({ floorsPerBuilding: [v.physical.floorsPerBuilding[0], Math.max(1, Math.round(n(x, 1)))] })} /></div></Field>
        <Field label="WAN profile"><SelectInput value={v.physical.wan} options={opts(Object.keys(WAN) as WanProfile[], x => WAN[x])} onChange={x => ph({ wan: x })} /></Field>
        <Field label="Circuits"><NumInput value={v.physical.circuits} min={1} onChange={x => ph({ circuits: Math.max(1, Math.round(n(x, 1))) })} /></Field>
        <Field label="Diverse WAN expected" hint="single-homed is a finding"><Toggle on={v.physical.diversityExpected} onChange={x => ph({ diversityExpected: x })} /></Field>
      </div>
      <h5>Build, capacity limits and efficiency</h5>
      <div className="pn-st-grid">
        <Field label="Build programme"><SelectInput value={v.build.blueprintKey} options={Object.entries(BLUEPRINTS).map(([id, label]) => ({ id, label }))} onChange={x => bd({ blueprintKey: x })} /></Field>
        <Field label="Duration factor" hint="× the programme's weeks"><NumInput value={v.build.durationFactor} step={0.05} onChange={x => bd({ durationFactor: n(x, 1) })} /></Field>
        <Field label="Default budget"><NumInput value={v.build.defaultBudget} unit="USD" onChange={x => bd({ defaultBudget: Math.max(0, n(x, 0)) })} /></Field>
        <Field label="Rack power: warn at"><NumInput value={v.capacity.rackPowerWarnPct} unit="%" onChange={x => cp({ rackPowerWarnPct: n(x, 85) })} /></Field>
        <Field label="Rack power: block at"><NumInput value={v.capacity.rackPowerBlockPct} unit="%" onChange={x => cp({ rackPowerBlockPct: n(x, 90) })} /></Field>
        <Field label="Cooling headroom minimum"><NumInput value={v.capacity.coolingHeadroomMinPct} unit="%" onChange={x => cp({ coolingHeadroomMinPct: n(x, 10) })} /></Field>
        <Field label="PUE target"><NumInput value={v.pueTarget} step={0.01} onChange={x => set({ pueTarget: n(x, 1.5) })} /></Field>
      </div>
      {errs.length > 0 && <ul className="pn-st-errs">{errs.map(e => <li key={e}><I.CircleAlert size={13} />{e}</li>)}</ul>}
    </section>
  );
}

/** Keep the catalogue entry's name / description / blueprint in step with the template before it is saved. */
export const withSiteTypeSynced = (t: T.PlannerTemplate): T.PlannerTemplate =>
  t.siteType ? { ...t, siteType: { ...t.siteType, name: t.name.trim(), description: t.description }, blueprintKey: t.siteType.build.blueprintKey, labels: ['profile', t.siteType.segment.toLowerCase(), t.siteType.key] } : t;
