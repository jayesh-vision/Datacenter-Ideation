/* Where an in-site plan happens: live sites with their real IT headroom (power chain at redundancy, holds and approved plans), then
   the halls with free positions and hall and zone headroom. A hall fit-out also says what the hall is today (shell, partly used, or
   a new hall on a floor). Replaces the generic site picker for rack, pod, hall and retrofit plans. */
import { useMemo, useState } from 'react';
import { Btn, Chip, Field, SearchBox } from '../../../../ui/kit';
import { dcTypeProfile } from '../../../../planner/p2b/dcTypes';
import { planAddedKw, siteBaseline, type SiteBaseline } from '../../../../planner/lib/site';
import { climateFromHint, type StepProps } from '../../../../planner/lib/wizardModel';
import { NumInput, SelectInput, TextInput, kw, num } from '../../common';
import { Sub } from '../../parts';
import { Note, Tbl } from '../../wizard/panelKit';
import { ChecksBlock, ShortfallBanner } from './common';
import { analysisOf, rescalePhases } from './helpers';

const MODES = ['Shell hall (full fit-out)', 'Partly used hall (fill free positions)', 'New hall on a floor'];

export function InSiteSitePicker({ draft, patch, ev, data, readOnly }: StepProps) {
  const [q, setQ] = useState('');
  const need = planAddedKw(draft);
  const rows = useMemo(() => data.ready ? data.dataCenters
    .filter(d => d.status === 'Operational' || d.id === draft.dataCenterId)
    .map(dc => ({ dc, site: siteBaseline(data, dc.id, { excludePlanId: draft.id }), campus: data.campuses.find(c => c.id === dc.campusId) }))
    .filter((x): x is { dc: typeof x.dc; site: SiteBaseline; campus: typeof x.campus } => !!x.site)
    .sort((a, b) => a.dc.code.localeCompare(b.dc.code)) : [], [data, draft.dataCenterId, draft.id]);
  const a = analysisOf(ev);
  const chosen = rows.find(r => r.dc.id === draft.dataCenterId);
  const kindName = (key?: string) => dcTypeProfile(key)?.name ?? '';
  const list = rows.filter(r => !q || `${r.dc.code} ${r.dc.name} ${r.campus?.city ?? ''} ${kindName(r.dc.dcTypeKey)}`.toLowerCase().includes(q.toLowerCase()));
  const pick = (id: string) => {
    if (readOnly) return;
    const r = rows.find(x => x.dc.id === id); if (!r) return;
    const params = { ...draft.params }; if (r.dc.id !== draft.dataCenterId) { delete params.targetHallId; delete params.preferredHallId; }
    patch({ dataCenterId: r.dc.id, campusId: r.dc.campusId, regionId: r.campus?.regionId ?? draft.regionId, dcTypeKey: r.dc.dcTypeKey ?? draft.dcTypeKey, climate: climateFromHint(r.campus?.city) ?? draft.climate, newSiteName: undefined, params, ...(r.dc.id !== draft.dataCenterId ? { placement: undefined, waves: [], inSite: { ...draft.inSite, retrofit: [], newHall: undefined } } : {}) });
  };
  const hallKey = draft.scope === 'hall' || draft.scope === 'retrofit' ? 'targetHallId' : 'preferredHallId';
  const pickHall = (id: string | undefined) => {
    if (readOnly) return;
    const params = { ...draft.params }; const sources = { ...draft.paramSources };
    if (id) { params[hallKey] = id; sources[hallKey] = 'user'; } else { delete params[hallKey]; delete sources[hallKey]; }
    patch({ params, paramSources: sources, ...(draft.scope === 'retrofit' && id !== draft.params.targetHallId ? { inSite: { ...draft.inSite, retrofit: [] }, waves: [] } : {}) });
  };
  const mode = String(draft.params.hallMode ?? '');
  const newHall = /new hall/i.test(mode);
  const floors = chosen ? data.floors.filter(f => data.buildings.find(b => b.id === f.buildingId)?.dataCenterId === chosen.dc.id) : [];
  const floorFree = (fid: string) => { const f = data.floors.find(x => x.id === fid); if (!f) return 0; return Math.round(f.usableAreaSqm - data.halls.filter(h => h.floorId === fid).reduce((s, h) => s + (h.areaSqm ?? h.rackCapacity * 2.6), 0)); };
  const nh = draft.inSite?.newHall;
  const setNewHall = (p: Partial<NonNullable<typeof nh>>) => patch({ inSite: { ...draft.inSite, newHall: { floorId: nh?.floorId ?? floors[0]?.id ?? '', name: nh?.name ?? 'New hall', areaSqm: nh?.areaSqm ?? 300, positions: nh?.positions ?? 100, designKw: nh?.designKw ?? draft.designPowerKw, ...p } } });
  const sizeToHall = () => {
    const h = a?.hall; if (!h || !h.hall) return;
    const density = Number(draft.params.densityKwPerRack ?? 12) || 12;
    const racks = Math.max(1, Math.min(h.positionsAvail, Math.floor(Math.max(0, h.designLeftKw) / density)));
    const total = Math.round(racks * density * 10) / 10;
    patch({ designPowerKw: total, phases: rescalePhases(draft, total, racks), inSite: { ...draft.inSite, classes: undefined } });
  };
  return (
    <div className="pn-col">
      <Note>This plan works inside a live site. Headroom is the IT kW the site can still take: the power chain at its redundancy (largest unit lost, one side of 2N), less today&apos;s load, capacity holds and approved plans.</Note>
      <SearchBox value={q} onChange={setQ} placeholder="Search by code, name, city or kind of site" width={360} />
      <Tbl head={['Site', 'Kind', 'IT headroom', 'Binds first', 'Cooling headroom', 'Free positions', 'Fit']} maxHeight={280} empty={data.ready ? 'No live site matches.' : 'Loading the estate…'}>
        {list.map(r => { const sel = r.dc.id === draft.dataCenterId; const fits = need <= 0 || r.site.headroomItKw >= need; const free = r.site.halls.reduce((s, h) => s + h.freePositions, 0); return (
          <tr key={r.dc.id} className={`is-pick${sel ? ' is-on' : ''}`} onClick={() => pick(r.dc.id)}>
            <td><span className="strong">{r.dc.code}</span> <span className="vw-label">{r.campus?.city}</span></td>
            <td style={{ fontSize: 12.5 }}>{kindName(r.dc.dcTypeKey) || '—'}{r.site.dcPlant ? ' · −48 V DC' : ''}</td>
            <td className="num">{kw(r.site.headroomItKw)}</td><td style={{ fontSize: 12.5 }}>{r.site.binding?.label ?? '—'}</td>
            <td className="num">{kw(r.site.cooling.headroomKw)}</td><td className="num">{num(free)}</td>
            <td>{need > 0 ? <Chip tone={fits ? 'success' : 'error'} size="xs" dot>{fits ? 'Has room' : `${kw(need - r.site.headroomItKw)} short`}</Chip> : null}</td>
          </tr>); })}
      </Tbl>
      {chosen && (<div>
        <Sub>{draft.scope === 'hall' ? 'Hall to fit out' : draft.scope === 'retrofit' ? 'Hall to retrofit' : 'Preferred hall (optional)'} at {chosen.dc.code}</Sub>
        {draft.scope === 'hall' && <div style={{ maxWidth: 380, marginBottom: 10 }}><Field label="What the hall is today"><SelectInput value={mode || undefined} placeholder="Pick: shell, partly used or a new hall" disabled={readOnly} options={MODES.map(m => ({ id: m, label: m }))} onChange={v => patch({ params: { ...draft.params, hallMode: v }, paramSources: { ...draft.paramSources, hallMode: 'user' } })} /></Field></div>}
        {!newHall && <Tbl head={['Hall', 'Status', 'Free positions', 'Design', 'Drawn', 'Hall headroom', 'Zone', 'Zone headroom']}>
          {hallKey === 'preferredHallId' && <tr className={`is-pick${!draft.params.preferredHallId ? ' is-on' : ''}`} onClick={() => pickHall(undefined)}><td colSpan={8}>Any hall at the site</td></tr>}
          {chosen.site.halls.map(h => { const z = chosen.site.cooling.zones.find(zz => zz.zone.id === h.hall.coolingZoneId); const sel = draft.params[hallKey] === h.hall.id; return (
            <tr key={h.hall.id} className={`is-pick${sel ? ' is-on' : ''}`} onClick={() => pickHall(h.hall.id)}>
              <td className="strong">{h.hall.name}</td><td>{h.status}</td><td className="num">{num(h.freePositions)} of {num(h.positions)}</td><td className="num">{kw(h.designKw)}</td><td className="num">{kw(h.loadKw)}</td><td className="num">{kw(h.headroomKw)}</td>
              <td>{z?.zone.name ?? '—'}{z && z.hallIds.length > 1 ? <> <Chip tone="neutral" size="xs">shared by {z.hallIds.length} halls</Chip></> : null}</td><td className="num">{z ? kw(z.headroomKw) : '—'}</td>
            </tr>); })}
        </Tbl>}
        {draft.scope === 'hall' && newHall && (
          <div className="pn-grid-5b">
            <Field label="Floor" hint={nh?.floorId ? `${num(floorFree(nh.floorId))} m² of usable area left` : undefined}><SelectInput value={nh?.floorId || undefined} placeholder="Pick a floor" disabled={readOnly} options={floors.map(f => ({ id: f.id, label: `${f.name} · ${num(floorFree(f.id))} m² free` }))} onChange={v => setNewHall({ floorId: v })} /></Field>
            <Field label="Hall name"><TextInput value={nh?.name ?? ''} disabled={readOnly} onChange={v => setNewHall({ name: v })} /></Field>
            <Field label="Area"><NumInput value={nh?.areaSqm} min={50} max={20000} unit="m²" disabled={readOnly} onChange={v => v !== undefined && setNewHall({ areaSqm: v })} /></Field>
            <Field label="Positions"><NumInput value={nh?.positions} min={4} max={2000} disabled={readOnly} onChange={v => v !== undefined && setNewHall({ positions: v })} /></Field>
            <Field label="Design load"><NumInput value={nh?.designKw} min={10} max={20000} unit="kW" disabled={readOnly} onChange={v => v !== undefined && setNewHall({ designKw: v })} /></Field>
          </div>
        )}
        {draft.scope === 'hall' && a?.hall?.hall && !newHall && <div className="pn-row" style={{ marginTop: 10 }}>{!readOnly && <Btn size="sm" onClick={sizeToHall}>Size the plan to the hall</Btn>}<span className="vw-label" style={{ fontSize: 12.5 }}>{num(a.hall.positionsAvail)} free positions, {kw(Math.max(0, a.hall.designLeftKw))} left of the hall design; now {num(a.hall.racks)} racks and {kw(a.hall.kw)}.</span></div>}
      </div>)}
      <ShortfallBanner a={a} plan={draft} />
      <ChecksBlock a={a} keys={['ins-site-power']} />
    </div>
  );
}
