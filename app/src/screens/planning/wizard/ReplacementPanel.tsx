/* Old to new for server, network and rack replacements: one row per old model and role with its new model, the ratio (old per
   new) and what happens to the old ones; where each new unit comes from (stock or purchase), the load before and after, and the
   per-device list. Shared with the replace family (scopes/replace). Ported from P2B's ReplacementPanel. */
import { useState } from 'react';
import { Chip } from '../../../ui/kit';
import type * as T from '../../../planner/p2b/types';
import { replaceOf } from '../../../planner/lib/replaceAnalysis';
import { ROLE_MODELS, toPlanMapping, type MapRow } from '../../../planner/lib/replaceCore';
import { byId } from '../../../planner/lib/plannerData';
import { phasesFromWaves } from '../../../planner/lib/waves';
import type { StepProps } from '../../../planner/lib/wizardModel';
import { NumInput, SelectInput, kw, num } from '../common';
import { Sub } from '../parts';
import { Note, Tbl, Tiles } from './panelKit';

const DISP: { id: T.PlannerMappingRow['disposition']; label: string }[] = [{ id: 'dispose', label: 'Certified disposal' }, { id: 'keep', label: 'Keep as spares' }, { id: 'resell', label: 'Resell' }];

export function ReplacementPanel({ draft, ev, patch, data, goTo, readOnly }: StepProps) {
  const [all, setAll] = useState(false);
  const a = ev ? replaceOf(ev) : undefined;
  if (!a?.ready) return <p className="vw-label">{a?.reason ?? 'Evaluating…'}</p>;
  if (!a.old.length) return <p className="vw-label">Nothing selected yet. <button type="button" className="ent-link" onClick={() => goTo('requirements')}>Select what is being replaced</button>.</p>;
  const save = (row: MapRow, p: Partial<T.PlannerMappingRow>) => {
    const rows = a.mapping.map(m => (m.id === row.id ? { ...m, ...p } : m));
    const am = (model: string) => data.assetModels.find(x => x.model === model);
    const out = toPlanMapping(rows).map(m => { const units = Math.ceil(m.count / Math.max(1, m.ratio)); return { ...m, newUnits: units, newKw: Math.round((units * (am(m.newModel)?.typicalPowerW ?? 0)) / 100) / 10 }; });
    const total = Math.max(0, Math.round(out.reduce((s, m) => s + m.newKw, 0)));
    patch({ mapping: out, designPowerKw: total, phases: phasesFromWaves(draft.waves ?? [], total), params: { ...draft.params, ...(draft.scope === 'server-refresh' && out[0] ? { replacementModel: out[0].newModel } : {}) } });
  };
  const stock = a.supply.reduce((s, x) => s + x.stock, 0), buy = a.supply.reduce((s, x) => s + x.procure, 0);
  const rows = a.units.flatMap(u => u.oldIds.map((id, i) => ({ u, d: byId(data, 'devices', id), first: i === 0 }))).filter((x): x is { u: typeof x.u; d: T.Device; first: boolean } => !!x.d);
  const waveOf = (id: string) => (draft.waves ?? []).find(w => w.deviceIds.includes(id))?.name;
  return (<>
    <Tiles items={[
      { label: 'Devices out', value: num(a.old.length), sub: `in ${num(a.rackIds.length)} racks · ${kw(a.oldKw)} measured` },
      { label: 'Units in', value: num(a.units.length), sub: `${kw(a.newKw)} typical, ${kw(a.peakKw)} peak` },
      { label: 'Load change', value: `${a.deltaKw > 0 ? '+' : ''}${kw(a.deltaKw)}`, tone: a.deltaKw > 0 ? 'warn' : 'ok', sub: 'new typical against measured today' },
      { label: 'From stock / to buy', value: `${num(stock)} / ${num(buy)}`, tone: buy ? undefined : 'ok', sub: a.supply.map(s => `${s.model}: ${s.stock} spare, ${s.procure} bought (${s.leadWeeks} wk)`).join(' · ') },
    ]} />
    <Note>{num(a.impact.services.length)} services ({num(a.critical.services.length)} critical) for {num(a.impact.customers.length)} customers run on the devices going out{a.pairs.length ? `; ${num(a.pairs.length)} redundant pairs are kept on different waves` : ''}.</Note>
    <Sub extra={!(draft.mapping ?? []).length && <Chip tone="warning" size="xs">Catalogue defaults; change them and they are saved</Chip>}>Old to new</Sub>
    <Tbl head={['Going out', 'New model', 'Old per new', 'New units · kW', 'Old ones']}>
      {a.mapping.map(m => (
        <tr key={m.id}>
          <td><span className="cell-2"><b className="strong">{m.oldModel}</b><small>{m.role} · {num(m.count)}</small></span></td>
          <td style={{ width: '32%' }}><SelectInput value={m.newModel || undefined} placeholder="No catalogue model" style={{ width: '100%', minWidth: 0 }} disabled={readOnly} options={ROLE_MODELS[m.roleKey].map(x => ({ id: x, label: x }))} onChange={v => save(m, { newModel: v })} /></td>
          <td style={{ width: 76 }}><NumInput value={m.ratio} min={1} max={8} disabled={readOnly} style={{ width: '100%', minWidth: 0 }} onChange={v => v !== undefined && save(m, { ratio: v })} /></td>
          <td className="num"><span className="cell-2"><span>{num(m.newUnits)} · {m.oldKw} → {m.newKw} kW</span><small>peak {m.peakKw} kW</small></span></td>
          <td style={{ width: '22%' }}><SelectInput value={m.disposition} style={{ width: '100%', minWidth: 0 }} disabled={readOnly} options={DISP} onChange={v => save(m, { disposition: v })} /></td>
        </tr>
      ))}
    </Tbl>
    <Note>New load is units × the model's typical draw (peak: its maximum, used for the feed check). Old load is what the devices draw today.</Note>
    <Sub extra={rows.length > 12 && <button type="button" className="ent-link" style={{ fontSize: 12.5 }} onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${rows.length}`}</button>}>Per device</Sub>
    <Tbl head={['Old device', 'New unit', 'Keeps', 'Wave', 'Note']} maxHeight={all ? 480 : undefined}>
      {(all ? rows : rows.slice(0, 12)).map(({ u, d, first }) => (
        <tr key={d.id}>
          <td><span className="cell-2"><span className="mono nowrap">{d.name}</span><small>{byId(data, 'racks', d.rackId)?.name ?? '—'} · U{d.position ?? '—'}</small></span></td>
          <td>{first ? <span className="cell-2"><span>{u.id} · {u.model}</span><small>{u.placed ? `to ${byId(data, 'racks', u.rackId)?.name ?? '—'} · U${u.startU ?? '—'}` : <span className="pn-bad">No position</span>}</small></span> : <span className="vw-label">with {u.id}</span>}</td>
          <td>{first ? [u.keepIp4, u.keepOob && `OOB ${u.keepOob}`].filter(Boolean).join(', ') || '—' : <span className="vw-label">addresses released</span>}</td>
          <td className="nowrap">{waveOf(d.id) ?? <span className="vw-label">not in a wave</span>}</td>
          <td className="is-wrap" style={{ fontSize: 12 }}>{first ? u.note : ''}</td>
        </tr>
      ))}
    </Tbl>
  </>);
}
