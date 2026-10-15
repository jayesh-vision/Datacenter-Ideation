/* Hall fit-out panels: the hall (shell, partly used or new) on its grid, the site power chain, cooling, network and the rack classes. */
import * as I from 'lucide-react';
import { Btn } from '../../../../ui/kit';
import type * as T from '../../../../planner/p2b/types';
import { classesFromMix } from '../../../../planner/lib/inSiteAnalysis';
import type { StepProps } from '../../../../planner/lib/wizardModel';
import { NumInput, SelectInput, TextInput, kw, num } from '../../common';
import { Sub } from '../../parts';
import { Note, Tbl, Tiles } from '../../wizard/panelKit';
import { HallGridView } from './charts';
import { ChecksBlock, ShortfallBanner, SiteChain } from './common';
import { IpTable } from './PodPanels';
import { analysisOf } from './helpers';

const MODE_LABEL = { shell: 'Shell hall, full fit-out', 'partly-used': 'Partly used: free positions only', 'new-hall': 'New hall on a floor' } as const;

export function HallSpacePanel({ draft, ev }: StepProps) {
  const a = analysisOf(ev); const h = a?.hall;
  if (!a || !h) return <Note>Pick the site and the hall in Requirements.</Note>;
  return (<>
    <Tiles items={[
      { label: 'Hall', value: h.hall?.name ?? draft.inSite?.newHall?.name ?? '—', sub: MODE_LABEL[h.mode] },
      { label: 'Racks', value: num(h.racks), tone: h.racks > h.positionsAvail ? 'bad' : 'ok', sub: `${num(h.positionsAvail)} free positions` },
      { label: 'IT load', value: kw(h.kw), tone: h.kw > h.designLeftKw ? 'bad' : 'ok', sub: `${kw(Math.max(0, h.designLeftKw))} left of the hall design` },
      { label: 'White space', value: `${num(h.whiteSpaceM2)} m²`, sub: h.floorFreeM2 !== undefined ? `${num(h.floorFreeM2)} m² free on the floor` : h.mode === 'partly-used' ? 'for the new racks' : 'the whole hall' },
    ]} />
    <ShortfallBanner a={a} plan={draft} />
    {h.mode === 'partly-used' && h.hb && <Note>{num(h.hb.racksInstalled)} live racks ({kw(h.hb.loadKw)}) stay as they are; only the {num(h.positionsAvail)} free positions are planned, and only incremental items are in the bill.</Note>}
    {(h.grid || h.positions.length > 0) && <div style={{ marginTop: 12 }}><HallGridView grid={h.grid} marks={h.positions} positions={h.positions} markLabel="Planned racks" title={h.hall ? `${h.hall.name} · ${h.grid?.cols ?? '?'} × ${h.grid?.rows ?? '?'} grid` : 'New hall layout'} /></div>}
    {h.phases.length > 1 && <Note>{h.phases.map(p => `${p.phase.name}: ${num(p.racks)} racks, ${kw(p.kw)}`).join(' · ')}</Note>}
    <ChecksBlock a={a} keys={['ins-positions', 'ins-hall-design', 'ins-containment']} />
  </>);
}

export function HallPowerPanel({ draft, ev }: StepProps) {
  const a = analysisOf(ev); const h = a?.hall; if (!a || !h) return <Note>Pick the site and the hall first.</Note>;
  return (<>
    <Tiles items={[
      { label: 'Site IT headroom', value: kw(a.site?.headroomItKw ?? 0), tone: a.checks['ins-site-power']?.status === 'fail' ? 'bad' : 'ok', sub: a.site?.binding ? `${a.site.binding.label} binds first` : undefined },
      { label: 'Existing hall PDUs', value: `${kw(h.existingPduHeadroom.A)} / ${kw(h.existingPduHeadroom.B)}`, sub: 'free on side A / side B' },
      { label: 'New floor PDUs', value: num(h.pduPerSide * 2), sub: h.mode === 'partly-used' ? 'only where existing PDUs are short' : 'per side × 2, fed from the site UPS' },
      { label: 'UPS', value: 'Site plant', sub: 'a shortfall is a linked plant plan' },
    ]} />
    <ShortfallBanner a={a} plan={draft} />
    <Sub>Site power chain</Sub>
    <SiteChain site={a.site} addKw={a.addedKw} />
    <ChecksBlock a={a} keys={['ins-site-power', 'ins-pdu', 'ins-dc-plant']} />
  </>);
}

export function HallCoolingPanel({ ev }: StepProps) {
  const a = analysisOf(ev); const h = a?.hall; if (!a || !h) return <Note>Pick the site and the hall first.</Note>;
  return (<>
    <Tiles items={[
      { label: 'Zone', value: h.zone?.zone.name ?? 'New', sub: h.zone ? `${kw(h.zone.headroomKw)} free with one unit lost` : 'the hall has no zone yet' },
      { label: 'Shared with', value: h.zoneSharedWith.length ? h.zoneSharedWith.join(', ') : 'No other hall', sub: 'their load is counted' },
      { label: 'Air / liquid heat', value: `${kw(h.airKw)} / ${kw(h.liquidKw)}`, sub: h.residualAirKw ? `${kw(h.residualAirKw)} of liquid-class heat stays in the air` : undefined },
      { label: 'New units', value: `${h.crah.units} CRAH · ${h.cdus} CDU`, sub: h.crah.units ? `${h.crah.unitKw} kW CRAH, N+1` : 'the zone takes the air heat' },
    ]} />
    <ChecksBlock a={a} keys={['ins-zone-cooling', 'ins-facility-water', 'ins-setpoint']} />
  </>);
}

export function HallNetworkPanel({ ev }: StepProps) {
  const a = analysisOf(ev); const h = a?.hall; if (!a || !h) return <Note>Pick the site and the hall first.</Note>;
  return (<>
    <Tiles items={[
      { label: 'Leaves', value: num(h.leaves), sub: `${h.uplinks} uplinks at ${a.network.uplinkGbps}G` },
      { label: 'Spines', value: h.newSpines ? `${h.newSpines} new` : 'Existing', sub: `${h.spine.free} free ports on ${h.spine.spines} spines` },
      { label: 'Access ports', value: num(a.network.accessPorts) },
      { label: 'Prefixes', value: num(a.ip.items.length), sub: `from ${a.ip.aggregate}` },
    ]} />
    <IpTable a={a} />
    <ChecksBlock a={a} keys={['ins-spine-ports', 'ins-ip']} />
  </>);
}

/** Rack classes: count, kW and cooling per class; they must add up to the requirement. */
export function HallItPanel({ draft, patch, ev, readOnly }: StepProps) {
  const a = analysisOf(ev); const h = a?.hall;
  if (!a || !h) return <Note>Pick the site and the hall first.</Note>;
  const classes = h.classes;
  const set = (next: T.PlannerRackClass[] | undefined) => patch({ inSite: { ...draft.inSite, classes: next } });
  const edit = (i: number, row: Partial<T.PlannerRackClass>) => set(classes.map((c, j) => (j === i ? { ...c, ...row } : c)));
  const fromMix = () => set(classesFromMix(draft.designPowerKw, Math.ceil(draft.designPowerKw / Math.max(1, Number(draft.params.densityKwPerRack ?? 12))), draft.demand));
  const off = Math.abs(h.classKw - draft.designPowerKw) > 1;
  return (<>
    <Sub extra={!readOnly && <span className="pn-row"><Btn size="sm" icon={I.Plus} onClick={() => set([...classes, { name: 'New class', racks: 1, kw: Number(draft.params.densityKwPerRack ?? 12), cooling: 'air' }])}>Add a class</Btn><Btn size="sm" variant="ghost" icon={I.RotateCcw} onClick={fromMix}>Reset to the workload mix</Btn></span>}>Rack classes</Sub>
    <Tbl head={['Class', 'Racks', 'kW each', 'kW total', 'Cooling', '']} empty="No rack classes." foot={<tr><td>Total</td><td className="num">{num(h.racks)}</td><td /><td className={`num${off ? ' pn-bad' : ''}`}>{kw(h.classKw)} of {kw(draft.designPowerKw)}</td><td colSpan={2} /></tr>}>
      {classes.map((c, i) => (
        <tr key={i}>
          <td style={{ minWidth: 140 }}><TextInput value={c.name} disabled={readOnly} onChange={v => edit(i, { name: v })} /></td>
          <td style={{ minWidth: 90 }}><NumInput value={c.racks} min={0} max={2000} disabled={readOnly} onChange={v => v !== undefined && edit(i, { racks: v })} /></td>
          <td style={{ minWidth: 90 }}><NumInput value={c.kw} min={1} max={150} step={0.5} disabled={readOnly} onChange={v => v !== undefined && edit(i, { kw: v })} /></td>
          <td className="num">{kw(c.racks * c.kw)}</td>
          <td style={{ minWidth: 140 }}><SelectInput value={c.cooling} disabled={readOnly} options={[{ id: 'air', label: 'Air' }, { id: 'liquid', label: 'Liquid to chip' }]} onChange={v => edit(i, { cooling: v as T.PlannerRackClass['cooling'] })} /></td>
          <td>{!readOnly && <Btn size="sm" variant="ghost" icon={I.Trash2} title="Remove the class" onClick={() => set(classes.filter((_, j) => j !== i))} />}</td>
        </tr>))}
    </Tbl>
    <Note>{h.classesFrom === 'mix' ? 'Classes come from the workload mix in Requirements; edit them here to fix them.' : 'Classes set by the planner.'} Above 30 kW a class needs liquid cooling. IT is priced from the catalogue: servers per rack = rack kW ÷ the model&apos;s typical draw, capped by rack units.</Note>
  </>);
}
