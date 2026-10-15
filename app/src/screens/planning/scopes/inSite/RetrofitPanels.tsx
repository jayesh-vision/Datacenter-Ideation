/* Liquid retrofit panels: the racks converted, power uprate, liquid and residual air cooling, the drain-and-repopulate waves with
   their services, customers, redundant pairs and change-window clashes, and the GPU back-end fabric. */
import { Fragment, useMemo } from 'react';
import { Btn, CheckBox, Chip } from '../../../../ui/kit';
import type * as T from '../../../../planner/p2b/types';
import { clashes, haPairs, impactOf } from '../../../../planner/lib/impact';
import { hallRacks } from '../../../../planner/lib/placement';
import type { StepProps } from '../../../../planner/lib/wizardModel';
import { NumInput, SelectInput, TextInput, kw, num } from '../../common';
import { Sub } from '../../parts';
import { Note, Tbl, Tiles, dateTime } from '../../wizard/panelKit';
import { ChecksBlock, ShortfallBanner, SiteChain } from './common';
import { analysisOf, rescalePhases } from './helpers';

export function RetrofitSpacePanel({ draft, patch, ev, data, readOnly }: StepProps) {
  const a = analysisOf(ev); const r = a?.retrofit;
  const hallId = String(draft.params.targetHallId ?? '');
  const racks = useMemo(() => hallRacks(data, hallId), [data, hallId]);
  const sel = useMemo(() => draft.inSite?.retrofit ?? [], [draft.inSite?.retrofit]);
  const services = useMemo(() => new Map(racks.map(rk => [rk.id, impactOf(data, { rackIds: [rk.id] }).services.length])), [data, racks]);
  if (!hallId) return <Note>Pick the hall in Requirements, then select the racks to convert.</Note>;
  const density = Number(draft.params.densityKwPerRack ?? 40) || 40;
  /** A retrofit never lowers a rack: the default target is the plan density or the rack's draw today, whichever is higher. */
  const target = (rk: T.Rack) => Math.max(density, Math.ceil(rk.currentPowerKw ?? 0));
  const apply = (next: T.PlannerRetrofitRack[]) => {
    const today = next.reduce((s, x) => s + (racks.find(rk => rk.id === x.rackId)?.currentPowerKw ?? 0), 0);
    const total = Math.round(next.reduce((s, x) => s + x.targetKw, 0) * 10) / 10;
    patch({ inSite: { ...draft.inSite, retrofit: next }, designPowerKw: total, phases: rescalePhases(draft, total, next.length), waves: [], params: { ...draft.params, liquidRacks: next.length, currentKw: Math.round(today * 10) / 10, addedKw: Math.round(Math.max(0, total - today) * 10) / 10 }, paramSources: { ...draft.paramSources, liquidRacks: 'user', currentKw: 'actual', addedKw: 'user' } });
  };
  const toggle = (rk: T.Rack) => apply(sel.some(x => x.rackId === rk.id) ? sel.filter(x => x.rackId !== rk.id) : [...sel, { rackId: rk.id, targetKw: target(rk) }]);
  const rows = [...new Set(racks.map(rk => rk.rowId))];
  const rowName = (id: string) => data.rows.find(rw => rw.id === id)?.name ?? id;
  const selectRow = (rowId: string) => apply([...sel.filter(x => racks.find(rk => rk.id === x.rackId)?.rowId !== rowId), ...racks.filter(rk => rk.rowId === rowId && rk.status !== 'Planned').map(rk => ({ rackId: rk.id, targetKw: target(rk) }))]);
  const rowOf = (id: string) => r?.rows.find(x => x.rack.id === id);
  return (<>
    {r && <Tiles items={[
      { label: 'Racks converted', value: num(r.rows.length), sub: `${r.ready} ready, ${r.kits} kit, ${r.newCabinets} new cabinet` },
      { label: 'Today → target', value: `${kw(r.todayKw)} → ${kw(r.targetKw)}`, sub: `adds ${kw(r.deltaKw)}` },
      { label: 'Services on them', value: num(r.services), tone: r.critical ? 'warn' : undefined, sub: `${r.customers} customers, ${r.critical} critical` },
      { label: 'Floor reinforcement', value: num(r.reinforce), tone: r.reinforce ? 'warn' : 'ok', sub: 'positions above the floor rating' },
    ]} />}
    <ShortfallBanner a={a} plan={draft} />
    <Sub extra={!readOnly && rows.length > 0 && <span className="pn-row" style={{ gap: 6 }}>{rows.map(id => <Btn key={id} size="sm" onClick={() => selectRow(id)}>Select {rowName(id)}</Btn>)}</span>}>Racks in the hall</Sub>
    <Tbl head={['', 'Rack', 'Today', 'Target', 'Weight', 'Readiness', 'Services']} maxHeight={400} empty="No racks recorded in this hall.">
      {racks.map(rk => { const s = sel.find(x => x.rackId === rk.id); const row = rowOf(rk.id); return (
        <tr key={rk.id} className={s ? 'is-on' : undefined}>
          <td>{readOnly ? (s ? <Chip tone="info" size="xs">In plan</Chip> : null) : <CheckBox on={!!s} label={`Convert ${rk.name}`} onChange={() => toggle(rk)} />}</td>
          <td><span className="cell-2"><b className="strong">{rk.name}</b><small>{rowName(rk.rowId)}{rk.liquidCoolingReady ? ' · liquid-ready' : ''}</small></span></td>
          <td className="num">{rk.currentPowerKw} kW</td>
          <td style={{ minWidth: 100 }}>{s ? <NumInput value={s.targetKw} min={1} max={150} unit="kW" disabled={readOnly} onChange={v => v !== undefined && apply(sel.map(x => (x.rackId === rk.id ? { ...x, targetKw: v } : x)))} /> : '—'}</td>
          <td className="num" title={row ? `${row.floorKgM2} kg/m² of ${row.floorRating ?? '?'} on the floor` : undefined}><span className="cell-2"><span>{num(rk.currentWeightKg)} / {num(rk.maxWeightKg)} kg</span>{row && <small>filled {num(row.filledKg)} kg</small>}</span></td>
          <td style={{ minWidth: 140 }}>{s ? <SelectInput value={s.readiness ?? 'auto'} disabled={readOnly} onChange={v => apply(sel.map(x => (x.rackId === rk.id ? { ...x, readiness: v === 'auto' ? undefined : v as T.PlannerRetrofitRack['readiness'] } : x)))} options={[{ id: 'auto', label: row ? `Auto: ${row.readiness}` : 'Auto' }, { id: 'ready', label: 'Ready' }, { id: 'kit', label: 'Kit' }, { id: 'new-cabinet', label: 'New cabinet' }]} /> : '—'}</td>
          <td className="num">{services.get(rk.id) ?? 0}</td>
        </tr>); })}
    </Tbl>
    <Note>The requirement is the added kW: target minus today on the selected racks. Filled weight = cabinet, GPU servers at the target kW (catalogue model weight) and the liquid kit; readiness is set from liquid-readiness and the rack&apos;s rating.</Note>
    <ChecksBlock a={a} keys={['ins-weight']} />
  </>);
}

export function RetrofitPowerPanel({ draft, ev }: StepProps) {
  const a = analysisOf(ev); const r = a?.retrofit; if (!a || !r) return <Note>Select the racks first.</Note>;
  return (<>
    <Tiles items={[
      { label: 'Added per side', value: kw(r.deltaKw), sub: 'each side carries the whole rack' },
      { label: 'New circuits per side', value: num(r.uprate.circuitsPerSide), tone: r.uprate.circuitsPerSide > Math.min(r.uprate.freeCircuits.A, r.uprate.freeCircuits.B) ? 'bad' : 'ok', sub: `${r.uprate.freeCircuits.A} free on A, ${r.uprate.freeCircuits.B} on B` },
      { label: 'Hall PDUs free', value: `${kw(r.uprate.pdu.A)} / ${kw(r.uprate.pdu.B)}`, tone: r.deltaKw > Math.min(r.uprate.pdu.A, r.uprate.pdu.B) ? 'bad' : 'ok', sub: 'side A / side B' },
      { label: 'Supply', value: a.site?.dcPlant ? '−48 V DC' : 'AC', tone: a.site?.dcPlant ? 'bad' : 'ok', sub: a.site?.dcPlant ? 'GPU racks need 415 V AC or HVDC' : undefined },
    ]} />
    <ShortfallBanner a={a} plan={draft} />
    <Sub>Uprate per rack</Sub>
    <Tbl head={['Rack', 'Target kW', 'Feeds per side', 'Breaker', 'kW per feed', "Today's feed rating", 'Supply today']} maxHeight={280} empty="Select the racks on the Space step.">
      {r.rows.map(x => <tr key={x.rack.id}><td>{x.rack.name}</td><td className="num">{x.targetKw}</td><td className="num">{x.feedsPerSide}</td><td className="num">{x.feedAmps} A</td><td className="num">{x.feedKwEach}</td><td className="num">{x.existingFeedKw ?? '—'}</td><td>{x.dcFeeds ? '−48 V DC' : 'AC'}</td></tr>)}
    </Tbl>
    <Sub>Site power chain</Sub>
    <SiteChain site={a.site} addKw={a.addedKw} />
    <ChecksBlock a={a} keys={['ins-uprate', 'ins-dc-plant', 'ins-site-power']} />
  </>);
}

export function RetrofitCoolingPanel({ draft, ev }: StepProps) {
  const a = analysisOf(ev); const r = a?.retrofit; if (!a || !r) return <Note>Select the racks first.</Note>;
  return (<>
    <Tiles items={[
      { label: 'To liquid', value: kw(r.liquidKw), sub: `${r.capturePct}% of ${kw(r.targetKw)}` },
      { label: 'Facility water', value: kw(Math.max(0, r.facilityWater.headroomKw)), tone: r.liquidKw > r.facilityWater.headroomKw ? 'bad' : 'ok', sub: r.facilityWater.chillers ? `${r.facilityWater.chillers} chillers, one lost` : 'no chiller recorded' },
      { label: 'CDUs', value: `${r.cdu.units} × ${kw(r.cdu.unitKw)}`, sub: `${r.cdu.type}, ${r.cdu.loops.length} loop${r.cdu.loops.length === 1 ? '' : 's'}${r.cdu.positions ? `, ${r.cdu.positions} positions` : ''}` },
      { label: 'Leak and BMS', value: 'Per row', sub: 'leak cable, drip trays, CDU alarms; no new hall suppression' },
    ]} />
    <ShortfallBanner a={a} plan={draft} />
    <Sub>Residual air heat per zone</Sub>
    <Tbl head={['Zone', 'Headroom', 'Residual added', 'Air-cooled racks left on the zone']} empty="No zone recorded.">
      {r.zones.map(z => <tr key={z.zone.zone.id}><td>{z.zone.zone.name}</td><td className="num">{kw(z.zone.headroomKw)}</td><td className={`num${z.residualKw > z.zone.headroomKw ? ' pn-bad' : ''}`}>{kw(z.residualKw)}</td><td className="num">{num(z.airRacksLeft)}</td></tr>)}
    </Tbl>
    <Sub>CDU loops</Sub>
    <Tbl head={['Loop', 'Liquid kW', 'Units', 'Positions needed', 'Free in the row']} empty="No loops yet.">
      {r.cdu.loops.map(l => <tr key={l.name}><td>{l.name}</td><td className="num">{l.kw}</td><td className="num">{l.units}</td><td className="num">{l.positionsNeeded}</td><td className="num">{l.positionsFree ?? '—'}</td></tr>)}
    </Tbl>
    <ChecksBlock a={a} keys={['ins-zone-cooling', 'ins-facility-water', 'ins-cdu', 'ins-setpoint', 'liquid-above-density']} />
  </>);
}

export function RetrofitMigrationPanel({ draft, patch, ev, data, readOnly }: StepProps) {
  const a = analysisOf(ev); const r = a?.retrofit;
  const waves = useMemo(() => r?.waves ?? [], [r?.waves]);
  const info = useMemo(() => waves.map(w => {
    const imp = impactOf(data, { rackIds: w.kind === 'works' ? [] : w.rackIds });
    const cl = w.windowStart ? clashes(data, { dataCenterId: draft.dataCenterId, rackIds: w.rackIds, deviceIds: w.deviceIds, start: w.windowStart, end: w.windowEnd, excludePlanId: draft.id }) : [];
    const pairs = w.kind === 'works' ? [] : haPairs(data, w.deviceIds ?? []).filter(x => x.reason !== 'service path');
    return { customers: imp.customers.length, critical: imp.critical, block: cl.filter(c => c.severity === 'block'), warn: cl.filter(c => c.severity === 'warn'), pairs };
  }), [waves, data, draft.dataCenterId, draft.id]);
  if (!a || !r) return <Note>Select the racks first.</Note>;
  if (!r.rows.length) return <Note>Select the racks to retrofit on the Space step; the waves are proposed from their rows.</Note>;
  const editWave = (id: string, p: Partial<T.PlannerWave>) => patch({ waves: (draft.waves ?? []).map(w => (w.id === id ? { ...w, ...p } : w)) });
  const moveStart = (w: T.PlannerWave, v: string) => { if (!v) return; const start = new Date(`${v}:00Z`).getTime(); if (Number.isNaN(start)) return; const dur = new Date(w.windowEnd).getTime() - new Date(w.windowStart).getTime(); editWave(w.id, { windowStart: new Date(start).toISOString(), windowEnd: new Date(start + dur).toISOString() }); };
  const devName = (id: string) => data.devices.find(d => d.id === id)?.name ?? id;
  const pairsTotal = new Set(info.flatMap(x => x.pairs.map(q => [q.a, q.b].sort().join('|')))).size;
  return (<>
    <Tiles items={[
      { label: 'Waves', value: num(waves.length), tone: r.wavesProposed ? 'warn' : 'ok', sub: r.wavesProposed ? 'proposed: use them to plan' : 'accepted' },
      { label: 'Racks drained', value: num(r.drainRacks), tone: r.swing.length < r.drainRacks ? 'bad' : 'ok', sub: `${r.swing.length} swing positions free` },
      { label: 'Services touched', value: num(r.services), sub: `${r.customers} customers, ${r.critical} critical` },
      { label: 'Redundant pairs in one wave', value: num(pairsTotal), tone: pairsTotal ? 'warn' : 'ok', sub: 'both sides of a pair down in the same window' },
    ]} />
    <div className="pn-row" style={{ margin: '12px 0' }}>
      {!readOnly && (r.wavesProposed ? <Btn size="sm" variant="filled" onClick={() => patch({ waves })}>Use these waves</Btn> : <Btn size="sm" onClick={() => patch({ waves: [] })}>Propose the waves again</Btn>)}
      <span className="vw-label" style={{ fontSize: 12.5, flex: 1, minWidth: 240 }}>Each row is drained to swing positions, worked on (pipework, flush, fill, pressure test), then repopulated at the target density, each in a change night with no clash.</span>
    </div>
    <Tbl head={['Wave', 'Window (UTC)', 'Racks', 'Services', 'Clashes and pairs']}>
      {waves.map((w, i) => (
        <Fragment key={w.id}><tr className="pn-main-row">
          <td><span className="cell-2"><b className="strong">{w.order}. {w.name}</b><small>{w.kind ? w.kind[0].toUpperCase() + w.kind.slice(1) : 'Wave'}</small></span></td>
          <td style={{ minWidth: 180 }}>{r.wavesProposed || readOnly ? <span className="cell-2"><span className="nowrap">{dateTime(w.windowStart)}</span><small>to {dateTime(w.windowEnd)}</small></span> : <span className="cell-2"><TextInput type="datetime-local" value={w.windowStart.slice(0, 16)} onChange={v => moveStart(w, v)} /><small>to {dateTime(w.windowEnd)}</small></span>}</td>
          <td className="num"><span className="cell-2"><span>{w.rackIds.length}</span><small>{w.swingRackIds?.length ?? 0} swing</small></span></td>
          <td className="num"><span className="cell-2"><span>{w.serviceIds.length}</span><small>{info[i]?.customers ?? 0} customers{info[i]?.critical ? `, ${info[i].critical} critical` : ''}</small></span></td>
          <td title={[...(info[i]?.block ?? []), ...(info[i]?.warn ?? [])].map(c => `${c.id} ${c.title}`).join('\n') || undefined}><span className="cell-2">{info[i]?.block.length ? <Chip tone="error" size="xs" dot>Clash {info[i].block.map(c => c.id).join(', ')}</Chip> : info[i]?.warn.length ? <Chip tone="warning" size="xs" dot>Same kit, other time</Chip> : <Chip tone="success" size="xs" dot>No clash</Chip>}{info[i]?.pairs.length ? <small className="pn-warn" title={info[i].pairs.map(x => `${devName(x.a)} + ${devName(x.b)} (${x.reason})`).join('\n')}>{info[i].pairs.length} redundant pair{info[i].pairs.length === 1 ? '' : 's'} down together</small> : null}</span></td>
        </tr>
        <tr className="pn-sub-row"><td colSpan={5}>{r.wavesProposed || readOnly ? <span className="vw-label" style={{ fontSize: 12.5 }}><b className="strong">Rollback:</b> {w.rollback || '—'}</span> : <span className="pn-inline" style={{ alignItems: 'center' }}><span className="vw-label" style={{ fontSize: 12.5, flex: 'none' }}>Rollback</span><span className="grow"><TextInput value={w.rollback} onChange={v => editWave(w.id, { rollback: v })} /></span></span>}</td></tr></Fragment>))}
    </Tbl>
    <ChecksBlock a={a} keys={['ins-waves']} />
  </>);
}

export function RetrofitNetworkPanel({ ev }: StepProps) {
  const a = analysisOf(ev); const r = a?.retrofit; if (!a || !r) return <Note>Select the racks first.</Note>;
  return (<>
    <Tiles items={[
      { label: 'GPU servers', value: num(r.gpuServers), sub: 'at the target kW per rack' },
      { label: 'Back-end fabric', value: r.backend ? `${r.backend.leaves} leaf · ${r.backend.spines} spine` : 'Not needed', sub: r.backend ? `${r.backend.ports} × 400G server ports` : 'GPU share below 40%' },
      { label: 'Optics', value: num(r.backend?.optics ?? 0), sub: '400G, both ends' },
      { label: 'Front end', value: 'Existing leaves', sub: 'ports checked when the racks are repopulated' },
    ]} />
    <Note>The front-end network reuses the hall&apos;s leaves; the GPU back-end (RoCE or InfiniBand, rail-optimised, 8 × 400G per server) is sized from the GPU server count when GPUs are 40% or more of the mix.</Note>
  </>);
}

export function RetrofitFirePanel({ ev }: StepProps) {
  const a = analysisOf(ev); const r = a?.retrofit; if (!a || !r) return <Note>Select the racks first.</Note>;
  const rows = new Set(r.rows.map(x => x.rack.rowId)).size;
  return (<>
    <Tiles items={[
      { label: 'Leak detection', value: `${rows} row${rows === 1 ? '' : 's'}`, sub: 'sensing cable along each converted row' },
      { label: 'Drip trays', value: num(r.rows.length), sub: 'under each rack manifold' },
      { label: 'BMS points', value: num(r.cdu.units), sub: 'CDU alarms, flow, pressure, leak' },
      { label: 'Suppression', value: 'Unchanged', sub: 'no new hall system' },
    ]} />
    <Note>A liquid retrofit keeps the hall&apos;s suppression and smoke detection. Ask the fire engineer to review the suppression zone for the new heat density; any change is a separate works item.</Note>
  </>);
}

