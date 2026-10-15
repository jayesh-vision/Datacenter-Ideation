/* Rack placement panels: candidate racks checked on the real rack (U map, feeds, PDUs, weight, cooling zone), the outlet, port and
   address schedules, the equipment list, and the change window with its clashes. */
import { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import { Btn, Chip } from '../../../../ui/kit';
import type * as T from '../../../../planner/p2b/types';
import { equipmentTotals, type RackCandidate } from '../../../../planner/lib/placement';
import type { StepProps } from '../../../../planner/lib/wizardModel';
import { NumInput, SelectInput, SourceChip, kw, num } from '../../common';
import { Sub } from '../../parts';
import { Note, Tbl, Tiles, dateTime } from '../../wizard/panelKit';
import { RackElevation } from './charts';
import { ChecksBlock, ShortfallBanner, SiteChain } from './common';
import { analysisOf } from './helpers';

export function RackSpacePanel({ draft, patch, ev, actions, readOnly }: StepProps) {
  const a = analysisOf(ev); const r = a?.rack;
  const [all, setAll] = useState(false);
  if (!a || !r) return <Note>Pick the site in Requirements to rank its racks.</Note>;
  if (!a.ready) return <Note>Loading the site&apos;s racks, feeds and devices…</Note>;
  const accepted = new Set(r.accepted.map(x => x.cand.rack.id));
  const stale = draft.placement && draft.placement.mode !== r.mode && (draft.placement.racks?.length ?? 0) > 0;
  const accept = (c: RackCandidate) => {
    const keep = (draft.placement?.mode === r.mode ? draft.placement.racks ?? [] : []).filter(x => x.rackId !== c.rack.id);
    const racks = [...keep, { rackId: c.rack.id, startU: c.block?.start, endU: c.block ? c.block.start + r.perRack.u - 1 : undefined, kw: r.perRack.kw }].slice(-r.count);
    const params = { ...draft.params }; delete params.placementRackIds;
    patch({ placement: { mode: r.mode, racks, acceptedAt: new Date().toISOString() }, params });
    actions.recordFeedback('placement-optimiser', draft.id, true, c.rack.id);
  };
  const release = (id: string) => { patch({ placement: { mode: r.mode, racks: (draft.placement?.racks ?? []).filter(x => x.rackId !== id) } }); actions.recordFeedback('placement-optimiser', draft.id, false, id); };
  const list = all ? r.candidates : r.candidates.slice(0, 10);
  const passing = r.candidates.filter(c => !c.blocked.length).length;
  return (<>
    <Tiles items={[
      { label: 'Mode', value: r.mode === 'new-cabinet' ? 'New cabinet' : 'Existing racks', sub: r.mode === 'new-cabinet' ? 'empty cabinets in position' : 'devices into live racks' },
      { label: 'Per rack', value: `${r.perRack.u}U · ${kw(r.perRack.kw)}`, sub: r.equipment ? `${r.perRack.drawKw} kW typical · ${num(r.perRack.kg)} kg` : `declared: ${r.perRack.declared.join(', ')}` },
      { label: 'Candidates', value: `${passing} of ${r.candidates.length}`, tone: passing ? 'ok' : 'bad', sub: 'pass every check' },
      { label: 'Accepted', value: `${r.accepted.length} of ${r.count}`, tone: r.missing ? 'warn' : 'ok', sub: r.missing ? 'accept below' : 'placement complete' },
    ]} />
    <ShortfallBanner a={a} plan={draft} />
    {stale && <Note>The accepted racks were for the other mode; accept again for “{r.mode === 'new-cabinet' ? 'New cabinet in an empty position' : 'Into existing racks'}”.</Note>}
    <Sub extra={<SourceChip s="actual" note="Each rack checked on its U map, feeds, PDUs, weight and cooling zone from DCIM" />}>Candidate racks at {a.site?.dc.code}</Sub>
    <Tbl head={['Rack', 'U block', 'Free kW', 'Weight', 'Cooling zone', 'Result', '']} empty="No rack at the site has room for this.">
      {list.map(c => { const on = accepted.has(c.rack.id); const blocked = c.blocked.length > 0; return (
        <tr key={c.rack.id} className={on ? 'is-on' : blocked ? 'is-off' : undefined}>
          <td className="nowrap"><span className="cell-2"><b className="strong">{c.rack.name}</b><small>{c.hall?.name} · {c.rb.row?.name ?? '—'}</small></span></td>
          <td className="nowrap">{c.block ? `U${c.block.start}–U${c.block.start + r.perRack.u - 1}` : `max ${c.rb.largestFreeBlock}U`}</td>
          <td className="num"><span className="cell-2"><span>{c.freeKw} kW</span><small>{c.afterPct}% after</small></span></td>
          <td className="num" title={c.checks.weight.detail}>{num(c.weightAfterKg)} / {num(c.rb.maxWeightKg)} kg</td>
          <td className="num" title={c.checks.cooling.detail}>{c.zone ? `${kw(c.zone.headroomKw)} free` : '—'}</td>
          <td style={{ fontSize: 12.5, whiteSpace: 'normal' }} title={c.checks.pdu.detail}>{blocked ? <span className="pn-bad">Blocked: {c.blocked.join('; ')}</span> : c.warnings.length ? <span className="pn-warn">Warning: {c.warnings.join('; ')}</span> : <Chip tone="success" size="xs" dot>Pass</Chip>}{!c.checks.pdu.na && !c.checks.pdu.ok && !blocked ? <small className="vw-label"> · PDUs short</small> : null}</td>
          <td>{readOnly ? null : on ? <Btn size="sm" onClick={() => release(c.rack.id)}>Release</Btn> : <Btn size="sm" variant="filled" disabled={blocked} title={blocked ? 'Blocked candidates cannot be accepted' : undefined} onClick={() => accept(c)}>Accept</Btn>}</td>
        </tr>); })}
    </Tbl>
    {r.candidates.length > 10 && <button type="button" className="ent-link" style={{ fontSize: 12.5, marginTop: 8 }} onClick={() => setAll(x => !x)}>{all ? 'Show the top 10' : `Show all ${r.candidates.length} candidates`}</button>}
    {r.accepted.length > 0 && (<>
      <Sub>Rack elevation</Sub>
      <div className="pn-elevs">{r.accepted.map(x => <RackElevation key={x.cand.rack.id} rb={x.cand.rb} block={x.startU && x.endU ? { start: x.startU, end: x.endU } : undefined} label={draft.plnId || 'This plan'} />)}</div>
    </>)}
    <ChecksBlock a={a} keys={['ins-u-block', 'ins-rack-power', 'ins-weight', 'ins-zone-cooling']} />
  </>);
}

export function RackPowerPanel({ draft, ev }: StepProps) {
  const a = analysisOf(ev); const r = a?.rack; if (!a || !r) return <Note>Pick the site first.</Note>;
  return (<>
    <Tiles items={[
      { label: 'Feeds per rack', value: r.feed.label, sub: `${r.feed.kw} kW per feed at 80% derating` },
      { label: 'Allocated per rack', value: kw(r.perRack.kw), sub: r.equipment ? 'maximum draw of the models' : 'declared density' },
      { label: 'Power supplies', value: num(r.perRack.psus), sub: 'outlets needed per rack' },
      { label: 'Site IT headroom', value: kw(a.site?.headroomItKw ?? 0), tone: a.checks['ins-site-power']?.status === 'fail' ? 'bad' : 'ok', sub: a.site?.binding?.label ? `${a.site.binding.label} binds first` : undefined },
    ]} />
    <ShortfallBanner a={a} plan={draft} />
    {r.accepted.map(x => (
      <div key={x.cand.rack.id}>
        <Sub>Outlet schedule · {x.cand.rack.name}</Sub>
        {x.outlets.length ? <Tbl head={['Side', 'Outlet', 'Fed from']}>{x.outlets.map(o => <tr key={o.id}><td>{o.side}</td><td>{o.name}</td><td>{x.cand.pduSides.find(s => s.side === o.side)?.pdu.name ?? '—'}</td></tr>)}</Tbl>
          : <Note>{r.mode === 'new-cabinet' ? `New power strips on new ${r.feed.amps} A circuits: ${x.cand.checks.pdu.detail}` : x.cand.checks.pdu.detail}</Note>}
      </div>
    ))}
    <Sub>Site power chain</Sub>
    <SiteChain site={a.site} addKw={a.addedKw} />
    <ChecksBlock a={a} keys={['ins-rack-power', 'ins-pdu', 'ins-site-power', 'ins-dc-plant']} />
  </>);
}

export function RackCoolingPanel({ ev }: StepProps) {
  const a = analysisOf(ev); const r = a?.rack; if (!a || !r) return <Note>Pick the site first.</Note>;
  return (<>
    <Tbl head={['Rack', 'Zone', 'Usable', 'Load', 'Headroom', 'Halls on the zone']} empty="Accept a rack on the Space step to check its zone.">
      {r.accepted.map(x => <tr key={x.cand.rack.id}><td>{x.cand.rack.name}</td><td>{x.cand.zone?.zone.name ?? '—'}</td><td className="num">{kw(x.cand.zone?.usableKw ?? 0)}</td><td className="num">{kw(x.cand.zone?.loadKw ?? 0)}</td><td className="num">{kw(x.cand.zone?.headroomKw ?? 0)}</td><td className="num">{x.cand.zone?.hallIds.length ?? 0}</td></tr>)}
    </Tbl>
    <Note>Usable cooling is the zone&apos;s units with the largest one lost; the zone load counts every hall it serves.</Note>
    <ChecksBlock a={a} keys={['ins-zone-cooling']} />
  </>);
}

export function RackNetworkPanel({ ev }: StepProps) {
  const a = analysisOf(ev); const r = a?.rack; if (!a || !r) return <Note>Pick the site first.</Note>;
  return (<>
    <Sub>Port and patch schedule</Sub>
    <Tbl head={['Rack', 'Side', 'Leaf', 'Interface', 'Speed']} empty="Accept a rack on the Space step to reserve ports.">
      {r.accepted.flatMap(x => x.ports.map(p => <tr key={p.ifaceId}><td>{x.cand.rack.name}</td><td>{p.side}</td><td>{p.deviceName}</td><td className="mono">{p.ifaceName}</td><td className="num">{(p.speedMbps ?? 0) / 1000}G</td></tr>))}
    </Tbl>
    <Sub>Addresses</Sub>
    <Tbl head={['Rack', 'Purpose', 'Address', 'VLAN']} maxHeight={240} empty="No addresses yet.">
      {a.ip.addresses.map(x => <tr key={`${x.purpose}${x.address}`}><td>{x.rackName}</td><td>{x.purpose}</td><td className="mono">{x.address}</td><td>{x.vlan ?? '—'}</td></tr>)}
    </Tbl>
    <Note>Addresses come from the hall&apos;s existing subnets and VLANs in IPAM; no new aggregate, loopbacks, carrier links or ASNs for a rack.</Note>
    <ChecksBlock a={a} keys={['ins-ports', 'ins-ip']} />
  </>);
}

/** Equipment list editor: models from the DCIM catalogue, per rack. */
export function RackItPanel({ draft, patch, ev, data, readOnly }: StepProps) {
  const a = analysisOf(ev);
  const lines = useMemo(() => draft.inSite?.equipment ?? [], [draft.inSite?.equipment]);
  const models = useMemo(() => data.assetModels.filter(m => m.heightU > 0 && !['PDU', 'UPS'].includes(m.category)).sort((x, y) => x.category.localeCompare(y.category) || x.model.localeCompare(y.model)), [data.assetModels]);
  const tot = useMemo(() => equipmentTotals(data, lines), [data, lines]);
  const set = (next: T.PlannerEquipmentLine[]) => {
    const t = equipmentTotals(data, next); const count = Number(draft.params.rackCount ?? 1) || 1;
    const params = { ...draft.params }; const sources = { ...draft.paramSources };
    if (t) { params.densityKwPerRack = t.maxKw; params.rackUnitsNeeded = t.u; sources.densityKwPerRack = 'user'; sources.rackUnitsNeeded = 'user'; }
    patch({ inSite: { ...draft.inSite, equipment: next }, params, paramSources: sources, ...(t ? { designPowerKw: Math.round(t.maxKw * count * 10) / 10 } : {}) });
  };
  const opts = models.map(m => ({ id: m.id, label: `${m.category} · ${m.manufacturer} ${m.model} · ${m.heightU}U` }));
  return (<>
    <Sub extra={!readOnly && <Btn size="sm" icon={I.Plus} disabled={!models.length} onClick={() => set([...lines, { assetModelId: models.find(m => m.category === 'Server')?.id ?? models[0].id, qty: 1 }])}>Add a model</Btn>}>Equipment per rack</Sub>
    <Tbl head={['Model', 'Qty per rack', 'U', 'Typical / max W', 'kg', 'Ports / supplies', '']} empty="No equipment listed: the placement uses the declared rack units and density.">
      {lines.map((l, i) => { const row = tot?.rows.find(x => x.line === l) ?? tot?.rows[i]; return (
        <tr key={i}>
          <td style={{ width: '38%', maxWidth: 260 }}><SelectInput value={l.assetModelId} style={{ width: '100%', minWidth: 0 }} disabled={readOnly} options={opts} onChange={v => set(lines.map((x, j) => (j === i ? { ...x, assetModelId: v } : x)))} /></td>
          <td style={{ minWidth: 80 }}><NumInput value={l.qty} min={1} max={42} disabled={readOnly} onChange={v => v !== undefined && set(lines.map((x, j) => (j === i ? { ...x, qty: v } : x)))} /></td>
          <td className="num">{row?.u ?? '—'}</td><td className="num">{row ? `${num(row.typicalW)} / ${num(row.maxW)}` : '—'}</td><td className="num">{row?.kg ?? '—'}</td>
          <td className="num" title={row?.portsFrom === 'dcim' ? 'Ports counted on a device of this model in DCIM' : 'Ports typical for the model class'}>{row ? `${row.ports} / ${row.psus}` : '—'}</td>
          <td>{!readOnly && <Btn size="sm" variant="ghost" icon={I.Trash2} title="Remove the model" onClick={() => set(lines.filter((_, j) => j !== i))} />}</td>
        </tr>); })}
    </Tbl>
    {tot && <div style={{ marginTop: 12 }}><Tiles items={[
      { label: 'Rack units', value: `${tot.u}U`, sub: 'contiguous block needed' },
      { label: 'Power', value: `${tot.typicalKw} / ${tot.maxKw} kW`, sub: 'typical / maximum (held at maximum)' },
      { label: 'Weight', value: `${num(tot.kg)} kg`, sub: 'added to the rack' },
      { label: 'Ports and supplies', value: `${tot.ports} / ${tot.psus}`, sub: `${tot.hosts} hosts need addresses` },
    ]} /></div>}
    {a?.rack && <Note>IT is {draft.params.operatorOwnedIt === false ? 'tenant-owned and not in the bill' : 'priced from the catalogue in the bill'}.</Note>}
  </>);
}

export function RackDeliveryPanel({ ev }: StepProps) {
  const a = analysisOf(ev); const r = a?.rack; if (!a || !r) return <Note>Pick the site first.</Note>;
  const w = r.window;
  const blocks = w?.clashes.filter(c => c.severity === 'block') ?? [];
  return (<>
    <Sub>Change request</Sub>
    {w ? <Tiles items={[
      { label: 'Window', value: dateTime(w.start), tone: blocks.length ? 'bad' : w.beforeGoLive ? 'ok' : 'warn', sub: `to ${dateTime(w.end)}${w.beforeGoLive ? '' : ' · after the needed-by date'}` },
      { label: 'Clashes', value: num(blocks.length), tone: blocks.length ? 'bad' : 'ok', sub: `${w.clashes.length} open change${w.clashes.length === 1 ? '' : 's'} on the same equipment` },
      { label: 'Racks', value: r.accepted.map(x => x.cand.rack.name).join(', ') || '—' },
      { label: 'Approval', value: 'Capacity planner', sub: 'then the change process' },
    ]} /> : <Note>Accept a rack to schedule the change in the next free change night.</Note>}
    <Note><b className="strong">Backout:</b> {r.backout}</Note>
    {w?.clashes.length ? <Tbl head={['Change or window', 'When', 'Shared', 'Effect']}>{w.clashes.map(c => <tr key={c.id}><td><span className="mono">{c.id}</span> {c.title}</td><td>{c.start ? `${dateTime(c.start)}` : '—'}</td><td className="is-wrap" style={{ fontSize: 12.5 }}>{c.sharedResources.join(', ') || '—'}</td><td><Chip tone={c.severity === 'block' ? 'error' : 'warning'} size="xs" dot>{c.severity === 'block' ? 'Blocks the window' : 'Same equipment, other time'}</Chip></td></tr>)}</Tbl> : null}
    <ChecksBlock a={a} keys={['ins-window']} />
  </>);
}
