/* Pod, row or cage panels: contiguous positions on the real hall grid, the feed schedule from existing PDUs, cooling, leaves and
   addresses, and the cage. */
import { useState } from 'react';
import { Btn, Chip } from '../../../../ui/kit';
import { hallGrid, type PodOption } from '../../../../planner/lib/placement';
import type { InSiteAnalysis } from '../../../../planner/lib/inSiteAnalysis';
import type { StepProps } from '../../../../planner/lib/wizardModel';
import { kw, num } from '../../common';
import { Sub } from '../../parts';
import { Note, Tbl, Tiles } from '../../wizard/panelKit';
import { HallGridView } from './charts';
import { ChecksBlock, ShortfallBanner, SiteChain } from './common';
import { analysisOf } from './helpers';

export function PodSpacePanel({ draft, patch, ev, data, actions, readOnly }: StepProps) {
  const a = analysisOf(ev); const p = a?.pod;
  const [pick, setPick] = useState<string | undefined>();
  const shown: PodOption | undefined = p ? (p.options.find(o => o.id === pick) ?? p.chosen ?? p.options[0]) : undefined;
  const site = a?.site; const shownHall = shown?.hall.id;
  const grid = shownHall && site ? hallGrid(data, site, shownHall, draft.id) : undefined;
  if (!a || !p) return <Note>Pick the site in Requirements to find room for the pod.</Note>;
  if (!a.ready) return <Note>Loading the site&apos;s halls and racks…</Note>;
  const accept = (o: PodOption) => { patch({ placement: { mode: 'empty-positions', hallId: o.hall.id, racks: [], positions: o.positions.map(x => ({ hallId: x.hallId, gridX: x.gridX, gridY: x.gridY, rackId: x.rackId, rowId: x.rowId })), acceptedAt: new Date().toISOString(), newRows: o.newRows.map(y => ({ hallId: o.hall.id, gridY: y, name: `Row ${String.fromCharCode(65 + y)}` })) } }); actions.recordFeedback('placement-optimiser', draft.id, true, o.id); };
  const release = () => patch({ placement: undefined });
  const isChosen = (o: PodOption) => !!p.chosen && o.positions.every(x => p.chosen!.positions.some(y => y.gridX === x.gridX && y.gridY === x.gridY && y.hallId === x.hallId));
  return (<>
    <Tiles items={[
      { label: 'Pod', value: `${num(p.count)} racks`, sub: `${p.kwPerRack} kW each · ${kw(a.addedKw)}` },
      { label: 'Positions needed', value: num(p.positionsNeeded), sub: p.inRow ? `${p.count} racks + ${p.inRow.positions} for ${p.inRow.units} in-row units` : 'one per rack' },
      { label: 'Free at the site', value: num(p.freePositions), tone: p.freePositions >= p.positionsNeeded ? undefined : 'bad', sub: `longest contiguous run ${p.bestRun}` },
      { label: 'Accepted', value: p.chosen ? p.chosen.hall.name : 'Not yet', tone: p.chosen && !p.chosenProblems.length ? 'ok' : 'warn', sub: p.chosen ? (p.chosen.kind === 'pair' ? 'facing pair, one aisle' : 'one row') : 'pick an option below' },
    ]} />
    <ShortfallBanner a={a} plan={draft} />
    <Sub>Options on the hall grid</Sub>
    {p.options.length ? <Tbl head={['Hall', 'Layout', 'Rows', 'Hall headroom', 'Zone headroom', 'PDU A / B free', 'Containment', 'Score', 'Result', '']}>
      {p.options.map(o => { const on = isChosen(o); return (
        <tr key={o.id} className={`is-pick${on || shown?.id === o.id ? ' is-on' : ''}`} onClick={() => setPick(o.id)}>
          <td className="strong">{o.hall.name}</td><td>{o.kind === 'pair' ? 'Facing pair' : 'One row'}</td><td>{o.gridYs.map(y => y + 1).join(' and ')}{o.newRows.length ? ' (new row)' : ''}</td>
          <td className="num">{kw(o.hallHeadroomKw)}</td><td className="num">{o.zoneHeadroomKw !== undefined ? kw(o.zoneHeadroomKw) : '—'}</td><td className="num">{kw(o.pduHeadroomKw.A)} / {kw(o.pduHeadroomKw.B)}</td>
          <td>{o.containment}</td><td className="num">{o.score}</td>
          <td className="is-wrap" style={{ fontSize: 12.5, minWidth: 170 }}>{o.fits ? <Chip tone="success" size="xs" dot>Fits</Chip> : <span className="pn-bad">{o.problems.join('; ')}</span>}</td>
          <td>{readOnly ? null : on ? <Btn size="sm" onClick={() => release()}>Release</Btn> : <Btn size="sm" variant="filled" disabled={!o.fits} title={o.fits ? undefined : 'Options that do not fit cannot be accepted'} onClick={() => accept(o)}>Accept</Btn>}</td>
        </tr>); })}
    </Tbl> : <Note>No run of {p.positionsNeeded} contiguous free positions at {a.site?.dc.code}. Reduce the pod, split it, or plan more space.</Note>}
    {shown && grid && <div style={{ marginTop: 12 }}><HallGridView grid={grid} marks={shown.positions} markLabel={isChosen(shown) ? 'Accepted pod' : 'Option shown'} title={`${shown.hall.name} · ${grid.cols} × ${grid.rows} grid`} /></div>}
    {p.cage && <Note>Cage: {p.cage.perimeterM} m of fence around the positions (with 1 m clearance), {p.cage.doors} door{p.cage.doors === 1 ? '' : 's'}, {p.cage.readers} badge readers, {p.cage.cameras} cameras.</Note>}
    <ChecksBlock a={a} keys={['ins-positions', 'ins-containment']} />
  </>);
}

export function PodPowerPanel({ draft, ev }: StepProps) {
  const a = analysisOf(ev); const p = a?.pod; if (!a || !p) return <Note>Pick the site first.</Note>;
  return (<>
    <Tiles items={[
      { label: 'Distribution', value: p.power, sub: 'from the existing UPS; no UPS, generator or transformer in this plan' },
      { label: 'Feeds per rack', value: `${p.feedSchedule[0]?.feedsPerSide ?? 1} per side`, sub: p.feed.label },
      { label: 'New floor PDUs', value: num(p.newPdus), tone: p.newPdus ? 'warn' : 'ok', sub: p.newPdus ? `short ${kw(p.pduShortKw.A)} A / ${kw(p.pduShortKw.B)} B` : 'existing PDUs carry the pod' },
      { label: 'Live cut-ins', value: num(p.cutIns.length), sub: 'one change request each' },
    ]} />
    <ShortfallBanner a={a} plan={draft} />
    <Sub>Feed schedule</Sub>
    <Tbl head={['Rack', 'Position', 'Side A', 'Side B', 'Breaker', 'Feeds per side', 'kW']} maxHeight={300} empty="Accept a position to schedule the feeds.">
      {p.feedSchedule.map(f => <tr key={f.label}><td>{f.label}</td><td>row {f.position.gridY + 1}, position {f.position.gridX + 1}</td><td>{f.pduA ?? <span className="pn-bad">new PDU</span>}</td><td>{f.pduB ?? (p.feed.dual ? <span className="pn-bad">new PDU</span> : '—')}</td><td className="num">{f.amps} A</td><td className="num">{f.feedsPerSide}</td><td className="num">{f.kw}</td></tr>)}
    </Tbl>
    {p.buswayM > 0 && <Note>Busway: {p.buswayM} m over the pod with {p.tapOffs} tap-off boxes.</Note>}
    {p.cutIns.length > 0 && <Note>Live cut-ins: {p.cutIns.map(c => `${c.pdu.name} (${c.side}) ${c.circuits} circuits, ${kw(c.kw)}`).join(' · ')}.</Note>}
    <Sub>Site power chain</Sub>
    <SiteChain site={a.site} addKw={a.addedKw} />
    <ChecksBlock a={a} keys={['ins-pdu', 'ins-site-power', 'ins-dc-plant']} />
  </>);
}

export function PodCoolingPanel({ ev }: StepProps) {
  const a = analysisOf(ev); const p = a?.pod; if (!a || !p) return <Note>Pick the site first.</Note>;
  const z = p.chosen?.zone ?? p.options[0]?.zone;
  return (<>
    <Tiles items={[
      { label: 'Cooling', value: p.cooling === 'in-row' ? 'In-row units' : p.cooling === 'rear-door' ? 'Rear doors' : 'Room (zone)', sub: p.inRow ? `${p.inRow.units} × ${p.inRow.unitKw} kW, N+1` : undefined },
      { label: 'Zone', value: z?.zone.name ?? '—', tone: z && z.headroomKw < a.addedKw && !p.inRow ? 'bad' : undefined, sub: z ? `${kw(z.headroomKw)} free with one unit lost` : undefined },
      { label: 'Halls on the zone', value: num(z?.hallIds.length ?? 0), sub: 'their load is counted' },
      { label: 'Heat added', value: kw(a.addedKw) },
    ]} />
    <ChecksBlock a={a} keys={['ins-zone-cooling', 'ins-facility-water']} />
  </>);
}

export function PodNetworkPanel({ ev }: StepProps) {
  const a = analysisOf(ev); const p = a?.pod; if (!a || !p) return <Note>Pick the site first.</Note>;
  return (<>
    <Tiles items={[
      { label: 'Leaves', value: num(p.leaves), sub: 'to the existing spines' },
      { label: 'Uplinks', value: `${p.uplinks} × ${a.network.uplinkGbps}G`, sub: 'optics follow the uplink speed' },
      { label: 'Spine ports free', value: num(p.spine.free), tone: p.spine.spines && p.spine.free < p.uplinks ? 'bad' : undefined, sub: `${p.spine.spines} spines at the site` },
      { label: 'Prefixes', value: num(a.ip.items.length), sub: `from ${a.ip.aggregate}` },
    ]} />
    <IpTable a={a} />
    <ChecksBlock a={a} keys={['ins-spine-ports', 'ins-ip']} />
  </>);
}

export function IpTable({ a }: { a: InSiteAnalysis }) {
  return (<>
    <Sub>Addresses and VLANs</Sub>
    <Tbl head={['Name', 'Purpose', 'Prefix', 'VLAN', 'Gateway', 'Notes']} empty="No prefixes yet.">
      {a.ip.items.map(i => <tr key={i.id}><td>{i.name}</td><td>{i.purpose}</td><td className="mono">{i.cidr}</td><td>{i.vlan ?? '—'}</td><td className="mono">{i.gateway ?? '—'}</td><td className="is-wrap vw-label" style={{ fontSize: 12 }}>{i.notes}</td></tr>)}
    </Tbl>
    <Note>Carved from the site&apos;s container in IPAM, clear of every subnet in use and every prefix other plans hold; loopbacks only for the new switches; no carrier links or ASNs.</Note>
  </>);
}

export function PodSecurityPanel({ ev }: StepProps) {
  const a = analysisOf(ev); const p = a?.pod; if (!a || !p) return <Note>Pick the site first.</Note>;
  return (<>
    <Tiles items={[
      { label: 'Cage', value: p.cage ? `${p.cage.perimeterM} m` : 'None', sub: p.cage ? 'fence around the accepted positions, 1 m clearance' : 'no cage requested' },
      { label: 'Doors', value: num(p.cage?.doors ?? 0) },
      { label: 'Badge readers', value: num(p.cage?.readers ?? 0), sub: 'on the site access system' },
      { label: 'Cameras', value: num(p.cage?.cameras ?? 0), sub: 'on the site CCTV' },
    ]} />
    <Note>Fire suppression and detection are the hall&apos;s; a pod adds none. The cage is sized from the positions accepted on the Space step.</Note>
  </>);
}
