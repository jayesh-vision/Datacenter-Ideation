/* Plant line editor (what is added, replaced or uprated, sized against the target redundancy) and the cut-in sequence editor (what is
   isolated, how the live load is carried, the redundancy left, what is exposed, the window and how it is undone). */
import * as I from 'lucide-react';
import { Btn, Chip, Field } from '../../../../ui/kit';
import type * as T from '../../../../planner/p2b/types';
import { DEFAULT_PF, LINE_SYSTEM, LINE_SYSTEMS, SYSTEM_LABEL, type PlantAnalysis, type PlantSystem, type RedundancyLeft } from '../../../../planner/lib/plantModel';
import { fromDateInput, toDateInput, type StepProps } from '../../../../planner/lib/wizardModel';
import { NumInput, SelectInput, TextInput, kw } from '../../common';
import { Block, MultiPick, Note, Pair, dateTime } from '../../wizard/panelKit';

const KVA_SYSTEMS: T.PlannerPlantLine['system'][] = ['Transformer', 'Generator'];
const ACTIONS: { id: T.PlannerPlantLine['action']; label: string }[] = [{ id: 'add', label: 'Add' }, { id: 'replace', label: 'Replace' }, { id: 'uprate', label: 'Uprate' }];
const TRANSFERS: T.PlannerCutInStep['transfer'][] = ['Transfer to B path', 'Static bypass', 'Maintenance bypass', 'Temporary generator', 'Rental chiller', 'None'];
const BASES: NonNullable<T.PlannerPlantLine['ratingBasis']>[] = ['Standby (ESP)', 'Prime (PRP)', 'Continuous (COP)'];
const LEFT_TONE: Record<RedundancyLeft, 'success' | 'warning' | 'error'> = { 'N+1 or better': 'success', N: 'warning', 'Below N': 'error', 'Unprotected (raw mains)': 'error' };
const nextId = (prefix: string, ids: string[]) => { let n = ids.length + 1; while (ids.includes(`${prefix}-${n}`)) n++; return `${prefix}-${n}`; };
export type Stage = { stage: number; name: string };

/** Existing assets a line can target, by system (zones for room cooling). */
function targetOptions(an: PlantAnalysis | undefined, system: T.PlannerPlantLine['system']) {
  const b = an?.baseline; if (!b) return [];
  const sys = LINE_SYSTEM[system];
  const units = b.systems.find(s => s.system === (system === 'Switchgear' ? 'transformer' : sys))?.units ?? [];
  const opts = units.map(u => ({ id: u.id, label: `${u.name} · ${kw(u.capacityKw)}${u.side ? ` · ${u.side} side` : ''}${u.model ? ` · ${u.model}` : ''}` }));
  if (sys === 'cooling') return [...b.zones.map(z => ({ id: z.zone.id, label: `${z.zone.name} (zone) · ${kw(z.usableKw)} usable` })), ...opts];
  return opts;
}

export function PlantLinesEditor({ draft, patch, ev, an, systems, stages, readOnly }: StepProps & { an?: PlantAnalysis; systems: PlantSystem[]; stages: Stage[] }) {
  const lines = draft.plantLines ?? [];
  const shown = lines.filter(l => systems.includes(LINE_SYSTEM[l.system]));
  const set = (id: string, p: Partial<T.PlannerPlantLine>) => patch({ plantLines: lines.map(l => (l.id === id ? { ...l, ...p } : l)) });
  const tier = String(ev?.params.tier?.value ?? 'Tier III');
  const kinds = LINE_SYSTEMS.filter(s => systems.includes(LINE_SYSTEM[s]));
  const add = () => patch({ plantLines: [...lines, { id: nextId('PL', lines.map(l => l.id)), system: kinds[0], action: 'add', ratingKw: 0, qty: 1, stage: 1 }] });
  return (<>
    {shown.map(l => {
      const r = an?.lines.find(x => x.line.id === l.id);
      const kva = KVA_SYSTEMS.includes(l.system);
      const targets = targetOptions(an, l.system);
      return (
        <div key={l.id} className="pn-card2">
          <div className="pn-card2-head">
            <span style={{ width: 140 }}><SelectInput value={l.system} disabled={readOnly} options={kinds.map(k => ({ id: k, label: k }))} onChange={v => set(l.id, { system: v, targetAssetId: undefined, ratingKva: undefined })} /></span>
            <span style={{ width: 110 }}><SelectInput value={l.action} disabled={readOnly} options={ACTIONS} onChange={v => set(l.id, { action: v })} /></span>
            <span style={{ width: 90 }} title="Quantity"><NumInput value={l.qty} min={1} max={60} unit="×" disabled={readOnly || l.action === 'uprate'} onChange={v => set(l.id, { qty: v ?? 1 })} /></span>
            <span style={{ width: 170 }}><SelectInput value={String(l.stage ?? 1)} disabled={readOnly} options={stages.map(st => ({ id: String(st.stage), label: `Stage ${st.stage} · ${st.name}` }))} onChange={v => set(l.id, { stage: Number(v) })} /></span>
            {r?.problems.length ? <Chip tone="error" size="xs" dot>{r.problems.length} problem{r.problems.length === 1 ? '' : 's'}</Chip> : r?.suggestedQty !== undefined ? (r.suggestedQty === l.qty ? <Chip tone="success" size="xs" dot>Matches the need</Chip> : <Chip tone={r.suggestedQty > l.qty ? 'warning' : 'neutral'} size="xs" dot>Need {r.suggestedQty}</Chip>) : null}
            {r?.suggestedQty !== undefined && r.suggestedQty !== l.qty && !readOnly && <button type="button" className="ent-link" style={{ fontSize: 12.5 }} onClick={() => set(l.id, { qty: Math.max(1, r.suggestedQty!) })}>Use {r.suggestedQty}</button>}
            <span className="grow" />
            {!readOnly && <Btn size="sm" variant="ghost" icon={I.Trash2} title="Remove the line" onClick={() => patch({ plantLines: lines.filter(x => x.id !== l.id), cutIns: (draft.cutIns ?? []).map(c => ({ ...c, connectsLineIds: (c.connectsLineIds ?? []).filter(id => id !== l.id) })) })} />}
          </div>
          <div className="pn-card2-body">
            <Field label="Existing asset"><SelectInput value={l.targetAssetId ?? ''} disabled={readOnly} options={[{ id: '', label: l.action === 'add' ? 'Frame or zone (optional)' : 'Pick the asset' }, ...targets]} onChange={v => set(l.id, { targetAssetId: v || undefined, targetAssetLabel: targets.find(o => o.id === v)?.label.split(' · ')[0], zoneId: an?.baseline?.zones.some(z => z.zone.id === v) ? v : l.zoneId })} /></Field>
            <Field label="Model"><TextInput value={l.model ?? ''} disabled={readOnly} placeholder={l.system === 'UPS' && r?.target?.model ? `${r.target.model.split(' ')[0]} module` : 'Model'} onChange={v => set(l.id, { model: v || undefined })} /></Field>
            {kva
              ? <Pair label={l.system === 'Generator' ? 'Rating, power factor and basis' : 'Rating and power factor'} hint={r?.ratingNote}><NumInput value={l.ratingKva} min={0} step={100} unit="kVA" disabled={readOnly} onChange={v => set(l.id, { ratingKva: v, ratingKw: 0 })} /><NumInput value={l.powerFactor ?? DEFAULT_PF[l.system]} min={0.5} max={1} step={0.01} unit="pf" disabled={readOnly} onChange={v => set(l.id, { powerFactor: v })} />{l.system === 'Generator' && <SelectInput value={l.ratingBasis ?? 'Standby (ESP)'} disabled={readOnly} options={BASES.map(v => ({ id: v, label: v }))} onChange={v => set(l.id, { ratingBasis: v })} />}</Pair>
              : l.system === 'Battery' ? <Field label="Runtime"><NumInput value={l.runtimeMin ?? 10} min={1} max={60} unit="min" disabled={readOnly} onChange={v => set(l.id, { runtimeMin: v })} /></Field>
                : <Field label={l.action === 'uprate' ? 'New rating' : 'Rating per unit'}><NumInput value={l.ratingKw || undefined} min={0} step={50} unit="kW" disabled={readOnly} onChange={v => set(l.id, { ratingKw: v ?? 0 })} /></Field>}
          </div>
          <div className={`pn-card2-foot${r?.problems.length ? ' is-bad' : ''}`}>
            {r?.problems.length ? r.problems.join('; ') : r?.suggestedQty !== undefined ? r.suggestionNote : l.system === 'Battery' ? 'Runtime only; no capacity change.' : l.system === 'Switchgear' ? 'No capacity change.' : l.action === 'uprate' ? `Uprate${r?.target ? ` from ${kw(r.target.capacityKw)}` : ''}.` : 'Sized against the target redundancy once a rating is entered.'}
          </div>
        </div>
      );
    })}
    {!shown.length && <Note>No {systems.map(s => SYSTEM_LABEL[s].split(' (')[0].toLowerCase()).join(', ')} lines yet.</Note>}
    <div className="pn-row" style={{ marginTop: 10 }}>{!readOnly && <Btn size="sm" icon={I.Plus} onClick={add}>Add a line</Btn>}<span className="vw-label" style={{ fontSize: 12.5 }}>Sizing: what is needed at the target redundancy ({tier}) minus what the site can already use.</span></div>
  </>);
}


export function CutInEditor({ draft, patch, an, stages, readOnly }: StepProps & { an?: PlantAnalysis; stages: Stage[] }) {
  const steps = [...(draft.cutIns ?? [])].sort((a, b) => a.order - b.order);
  const lines = draft.plantLines ?? [];
  const set = (id: string, p: Partial<T.PlannerCutInStep>) => patch({ cutIns: steps.map(s => (s.id === id ? { ...s, ...p } : s)) });
  const allUnits = (an?.baseline?.systems ?? []).flatMap(s => s.units).map(u => ({ id: u.id, label: `${u.name} · ${kw(u.capacityKw)}${u.side ? ` · ${u.side}` : ''}` }));
  const lineOpts = lines.map(l => ({ id: l.id, label: `${l.id} · ${l.system} ${l.action}` }));
  const hours = Number(draft.params.cutInWindowHours ?? 6);
  const propose = () => {
    const out: T.PlannerCutInStep[] = lines.filter(l => l.system !== 'Switchgear').map((l, i) => {
      const r = an?.lines.find(x => x.line.id === l.id); const sys = LINE_SYSTEM[l.system];
      const sided = sys === 'ups' && an?.baseline?.systems.find(s => s.system === 'ups')?.units.some(u => u.side);
      return { id: `CI-${i + 1}`, order: i + 1, stage: l.stage ?? 1, title: `${l.action === 'add' ? 'Connect' : l.action === 'replace' ? 'Replace' : 'Uprate'} ${l.system}${r?.target ? ` at ${r.target.name}` : ''}`, isolatedAssetIds: r?.target && r.target.system === sys ? [r.target.id] : [], isolatedLabel: r?.target?.name ?? '', transfer: sys === 'ups' ? (sided ? 'Transfer to B path' : 'Static bypass') : 'None', windowStart: '', windowEnd: '', mitigation: '', rollback: '', connectsLineIds: [l.id], status: 'Planned' };
    });
    patch({ cutIns: out });
  };
  const add = () => patch({ cutIns: [...steps, { id: nextId('CI', steps.map(s => s.id)), order: steps.length + 1, stage: 1, title: 'New step', isolatedAssetIds: [], isolatedLabel: '', transfer: 'None', windowStart: '', windowEnd: '', mitigation: '', rollback: '', connectsLineIds: [], status: 'Planned' }] });
  const setWindow = (s: T.PlannerCutInStep, v: string) => {
    if (!v) { set(s.id, { windowStart: '', windowEnd: '' }); return; }
    const st = new Date(fromDateInput(v, s.windowStart || new Date().toISOString())); st.setUTCHours(22);
    set(s.id, { windowStart: st.toISOString(), windowEnd: new Date(st.getTime() + hours * 3600e3).toISOString() });
  };
  return (<>
    {steps.map(s => {
      const r = an?.cutIns.find(x => x.step.id === s.id);
      const blocks = r?.clashes.filter(c => c.severity === 'block') ?? [];
      return (
        <div key={s.id} className="pn-card2">
          <div className="pn-card2-head">
            <span style={{ width: 70 }}><NumInput value={s.order} min={1} disabled={readOnly} onChange={v => set(s.id, { order: v ?? s.order })} /></span>
            <span style={{ width: 260 }}><TextInput value={s.title} disabled={readOnly} onChange={v => set(s.id, { title: v })} /></span>
            <span style={{ width: 170 }}><SelectInput value={String(s.stage ?? 1)} disabled={readOnly} options={stages.map(x => ({ id: String(x.stage), label: `Stage ${x.stage} · ${x.name}` }))} onChange={v => set(s.id, { stage: Number(v) })} /></span>
            {r && <Chip tone={r.ok ? LEFT_TONE[r.redundancyLeft] : 'error'} size="xs" dot>{r.ok ? `${r.redundancyLeft} left` : 'Capacity below the live load'}</Chip>}
            {blocks.length > 0 && <Chip tone="error" size="xs" dot>Window clash</Chip>}
            <span className="grow" />
            {!readOnly && <Btn size="sm" variant="ghost" icon={I.Trash2} title="Remove the step" onClick={() => patch({ cutIns: steps.filter(x => x.id !== s.id) })} />}
          </div>
          <div className="pn-card2-body">
            <Block label="Taken out of service"><MultiPick value={s.isolatedAssetIds} options={allUnits} disabled={readOnly} empty="Nothing isolated" placeholder="Add an asset…" onChange={v => set(s.id, { isolatedAssetIds: v, isolatedLabel: allUnits.filter(o => v.includes(o.id)).map(o => o.label.split(' · ')[0]).join(', ') })} /></Block>
            <Field label="Load transfer"><SelectInput value={s.transfer} disabled={readOnly} options={TRANSFERS.map(t => ({ id: t, label: t }))} onChange={v => set(s.id, { transfer: v })} /></Field>
            <Block label="Connects"><MultiPick value={s.connectsLineIds ?? []} options={lineOpts} disabled={readOnly} empty="No line" placeholder="Add a line…" onChange={v => set(s.id, { connectsLineIds: v })} /></Block>
            {(s.transfer === 'Temporary generator' || s.transfer === 'Rental chiller') && <Field label="Temporary plant rating"><NumInput value={s.temporaryKw} min={0} unit="kW" disabled={readOnly} onChange={v => set(s.id, { temporaryKw: v, temporaryPlant: s.transfer })} /></Field>}
            <Field label={`Window (22:00 UTC, ${hours} h)`}><TextInput type="date" value={s.windowStart ? toDateInput(s.windowStart) : ''} disabled={readOnly} onChange={v => setWindow(s, v)} /></Field>
            <Field label="Mitigation"><TextInput value={s.mitigation} disabled={readOnly} placeholder="Generator on standby, change freeze…" onChange={v => set(s.id, { mitigation: v })} /></Field>
            <Field label="Rollback" error={!s.rollback.trim() && !readOnly ? 'Say how the step is undone' : undefined}><TextInput value={s.rollback} disabled={readOnly} placeholder="How the step is undone" onChange={v => set(s.id, { rollback: v })} /></Field>
          </div>
          {r && (
            <div className={`pn-card2-foot${r.ok ? '' : ' is-bad'}`}>
              {r.system ? `${SYSTEM_LABEL[r.system]}: ` : ''}{kw(r.remainingKw)} left{r.temporaryKw ? ` + ${kw(r.temporaryKw)} temporary` : ''} for {kw(r.liveLoadKw)} live load.{' '}
              {r.exposedRackIds.length ? `${r.exposedRackIds.length} racks, ${r.services} services (${r.critical} critical)${r.customers.length ? ` for ${r.customers.slice(0, 3).map(c => c.name).join(', ')}${r.customers.length > 3 ? ` and ${r.customers.length - 3} more` : ''}` : ''} on the isolated path. ` : 'No racks traced behind the isolated plant. '}
              Window {dateTime(r.window.start)}{r.window.proposed ? ' (next free change night after delivery)' : ''}{r.clashes.length ? `; clashes: ${r.clashes.map(c => `${c.id} ${c.title}`).slice(0, 2).join(', ')}` : '; no clash'}.
              {r.temporaryLine ? ` ${r.temporaryLine.item} added to the bill (${r.temporaryLine.days} days).` : ''}
              {r.notes.length ? ` ${r.notes.join(' ')}` : ''}
            </div>
          )}
        </div>
      );
    })}
    {!steps.length && <Note>No cut-in steps. Each new or replaced item needs a step: what is isolated, how the load is carried, and how it is undone.</Note>}
    {!readOnly && <div className="pn-row" style={{ marginTop: 10 }}><Btn size="sm" icon={I.Plus} onClick={add}>Add a step</Btn>{lines.length > 0 && <Btn size="sm" icon={I.ListOrdered} onClick={propose}>Propose steps from the lines</Btn>}</div>}
  </>);
}
