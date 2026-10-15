/* Plan pack sections (Placement, Schedules, Waves) and the plan page's "Site fit" tab of the in-site plan types. */
import { CalendarClock, Cable, Gauge, Layers, ListChecks, Network, Plug, Zap } from 'lucide-react';
import { Chip, Panel } from '../../../../ui/kit';
import { hallGrid } from '../../../../planner/lib/placement';
import { clashes, haPairs, impactOf } from '../../../../planner/lib/impact';
import type { PlanViewProps } from '../types';
import { kw, num } from '../../common';
import { Note, Tbl, Tiles, dateTime } from '../../wizard/panelKit';
import { HallGridView, RackElevation } from './charts';
import { ChecksBlock, ShortfallBanner, SiteChain } from './common';
import { HallGridSheet, RackElevationSheet } from './drawings';
import { Grid3x3, Server } from 'lucide-react';
import { ALL_CHECKS, analysisOf } from './helpers';
import '../../../../styles/planning-scopes.css';

/** Rack elevation (rack), the hall grid with the planned positions (pod, hall), or the converted racks (retrofit). */
export function PlacementSection({ plan, ev, data }: PlanViewProps) {
  const a = analysisOf(ev);
  if (!a) return <Note>No placement yet.</Note>;
  const pos = a.pod?.chosen?.positions ?? a.hall?.positions ?? [];
  const hallId = a.pod?.chosen?.hall.id ?? a.hall?.hall?.id;
  const grid = hallId && a.site ? hallGrid(data, a.site, hallId, plan.id) : undefined;
  if (a.rack) return a.rack.accepted.length ? <div className="pn-elevs">{a.rack.accepted.map(x => <RackElevation key={x.cand.rack.id} rb={x.cand.rb} block={x.startU && x.endU ? { start: x.startU, end: x.endU } : undefined} label={plan.plnId} />)}</div> : <Note>No rack accepted yet.</Note>;
  if (a.retrofit) return (
    <Tbl head={['Rack', 'Today', 'Target', 'Readiness', 'Filled weight', 'Feeds per side', 'Services']} empty="No racks selected yet.">
      {a.retrofit.rows.map(x => <tr key={x.rack.id}><td>{x.rack.name}</td><td className="num">{x.todayKw} kW</td><td className="num">{x.targetKw} kW</td><td className="is-wrap">{x.readiness} <span className="vw-label">({x.readinessWhy})</span></td><td className="num">{num(x.filledKg)} kg</td><td className="num">{x.feedsPerSide} × {x.feedAmps} A</td><td className="num">{x.services}</td></tr>)}
    </Tbl>
  );
  return pos.length ? <HallGridView grid={grid} marks={pos} positions={pos} markLabel={plan.plnId} title={grid ? `${grid.hall.name} · ${pos.length} positions` : 'New hall layout'} /> : <Note>No positions accepted yet.</Note>;
}

/** Outlet, port / patch and IP schedules (rack), feed schedule (pod), phases and classes (hall), uprate (retrofit). */
export function SchedulesSection({ ev }: PlanViewProps) {
  const a = analysisOf(ev); if (!a) return <Note>Nothing scheduled yet.</Note>;
  if (a.rack) { const r = a.rack; return (<div className="pn-col">
    <Panel flush icon={Plug} title="Outlet schedule" foot={r.mode === 'new-cabinet' ? <span className="vw-label">New power strips on new circuits: {r.feed.label}.</span> : undefined}><Tbl head={['Rack', 'Side', 'Outlet']} empty="No outlets scheduled.">{r.accepted.flatMap(x => x.outlets.map(o => <tr key={o.id}><td>{x.cand.rack.name}</td><td>{o.side}</td><td>{o.name}</td></tr>))}</Tbl></Panel>
    <Panel flush icon={Cable} title="Port and patch schedule"><Tbl head={['Rack', 'Side', 'Leaf', 'Interface', 'Speed']} empty="No ports reserved.">{r.accepted.flatMap(x => x.ports.map(p => <tr key={p.ifaceId}><td>{x.cand.rack.name}</td><td>{p.side}</td><td>{p.deviceName}</td><td className="mono">{p.ifaceName}</td><td className="num">{(p.speedMbps ?? 0) / 1000}G</td></tr>))}</Tbl></Panel>
    <Panel flush icon={Network} title="IP list" foot={<span className="vw-label">{a.ip.aggregate}</span>}><Tbl head={['Rack', 'Purpose', 'Address', 'VLAN']} empty="No addresses yet.">{a.ip.addresses.map(x => <tr key={x.purpose + x.address}><td>{x.rackName}</td><td>{x.purpose}</td><td className="mono">{x.address}</td><td>{x.vlan ?? '—'}</td></tr>)}</Tbl></Panel>
    <Panel icon={CalendarClock} title="Change window">{r.window ? <span style={{ fontSize: 13 }}>{dateTime(r.window.start)} to {dateTime(r.window.end)} · {r.window.clashes.filter(c => c.severity === 'block').length ? <Chip tone="error" size="xs" dot>{r.window.clashes.filter(c => c.severity === 'block').map(c => c.id).join(', ')}</Chip> : 'no clash'} · backout: {r.backout}</span> : <Note>Scheduled once a rack is accepted.</Note>}</Panel>
  </div>); }
  if (a.pod) return (<Panel flush icon={Zap} title="Feed schedule" foot={<span className="vw-label">Live cut-ins: {a.pod.cutIns.map(c => `${c.pdu.name} (${c.side}) ${c.circuits} circuits`).join(', ') || 'none'}; one change request each.</span>}>
    <Tbl head={['Rack', 'Position', 'Side A', 'Side B', 'Breaker', 'Feeds per side']} empty="Accept a position to schedule the feeds.">{a.pod.feedSchedule.map(f => <tr key={f.label}><td>{f.label}</td><td>row {f.position.gridY + 1}, position {f.position.gridX + 1}</td><td>{f.pduA ?? 'new PDU'}</td><td>{f.pduB ?? 'new PDU'}</td><td className="num">{f.amps} A</td><td className="num">{f.feedsPerSide}</td></tr>)}</Tbl>
  </Panel>);
  if (a.hall) return (<Panel flush icon={Layers} title="Phases and rack classes" foot={<span className="vw-label">{a.hall.classes.map(c => `${c.racks} ${c.name} at ${c.kw} kW (${c.cooling})`).join(' · ')}</span>}>
    <Tbl head={['Phase', 'Racks', 'kW', 'Go-live']}>{a.hall.phases.map(p => <tr key={p.phase.id}><td>{p.phase.name}</td><td className="num">{num(p.racks)}</td><td className="num">{kw(p.kw)}</td><td>{p.phase.goLive.slice(0, 10)}</td></tr>)}</Tbl>
  </Panel>);
  if (a.retrofit) return (<Panel flush icon={Gauge} title="Power uprate schedule">
    <Tbl head={['Rack', 'Target', 'Feeds per side', 'Breaker']} empty="No racks selected yet.">{a.retrofit.rows.map(x => <tr key={x.rack.id}><td>{x.rack.name}</td><td className="num">{x.targetKw} kW</td><td className="num">{x.feedsPerSide}</td><td className="num">{x.feedAmps} A</td></tr>)}</Tbl>
  </Panel>);
  return null;
}

/** Retrofit waves with their window, services, customers, redundant pairs and clashes. */
export function WavesSection({ plan, ev, data }: PlanViewProps) {
  const a = analysisOf(ev); const r = a?.retrofit;
  if (!r) return <Note>This plan type has no waves; its work runs under {plan.scope === 'rack' ? 'one change request' : 'the project and its change requests'}.</Note>;
  const info = r.waves.map(w => {
    const cl = w.windowStart ? clashes(data, { dataCenterId: plan.dataCenterId, rackIds: w.rackIds, deviceIds: w.deviceIds, start: w.windowStart, end: w.windowEnd, excludePlanId: plan.id }) : [];
    return { customers: impactOf(data, { rackIds: w.kind === 'works' ? [] : w.rackIds }).customers.length, pairs: w.kind === 'works' ? 0 : haPairs(data, w.deviceIds ?? []).filter(x => x.reason !== 'service path').length, block: cl.filter(c => c.severity === 'block') };
  });
  return (
    <Tbl head={['#', 'Wave', 'Window (UTC)', 'Racks', 'Swing', 'Services', 'Customers', 'Pairs', 'Clash', 'Change', 'Rollback']} empty="No waves yet.">
      {r.waves.map((w, i) => <tr key={w.id}><td>{w.order}</td><td>{w.name}{r.wavesProposed ? ' (proposed)' : ''}</td><td>{dateTime(w.windowStart)} to {dateTime(w.windowEnd)}</td><td className="num">{w.rackIds.length}</td><td className="num">{w.swingRackIds?.length ?? 0}</td><td className="num">{w.serviceIds.length}</td><td className="num">{info[i].customers}</td><td className="num">{info[i].pairs || '—'}</td><td>{info[i].block.length ? <Chip tone="error" size="xs" dot>{info[i].block.map(c => c.id).join(', ')}</Chip> : <Chip tone="success" size="xs" dot>None</Chip>}</td><td className="mono">{w.changeRequestId ?? '—'}</td><td className="is-wrap vw-label" style={{ fontSize: 12 }}>{w.rollback}</td></tr>)}
    </Tbl>
  );
}

/** Site fit: the chain the plan was checked against, every in-site check, and the linked plan when it does not fit. */
export function SiteFitTab({ plan, ev }: PlanViewProps) {
  const a = analysisOf(ev);
  const checks = a ? Object.values(a.checks) : [];
  const fails = checks.filter(c => c.status === 'fail').length, warns = checks.filter(c => c.status === 'warn').length;
  return (<div className="pn-col" style={{ gap: 16 }}>
    <Tiles items={[
      { label: 'Site', value: a?.site?.dc.name ?? '—', sub: a?.site?.binding ? `${a.site.binding.label} binds first` : undefined },
      { label: 'IT the plan adds', value: kw(a?.addedKw ?? 0), sub: `${num(a?.racks ?? 0)} racks` },
      { label: 'Site IT headroom', value: kw(a?.site?.headroomItKw ?? 0), tone: a?.shortfall ? 'bad' : 'ok', sub: a?.shortfall ? `short of ${a.shortfall.what} by ${kw(a.shortfall.kw)}` : 'the site can take it' },
      { label: 'Checks', value: `${checks.length - fails - warns} of ${checks.length} pass`, tone: fails ? 'bad' : warns ? 'warn' : 'ok', sub: fails || warns ? `${fails} fail, ${warns} warning${warns === 1 ? '' : 's'}` : 'nothing to fix' },
    ]} />
    <ShortfallBanner a={a} plan={plan} />
    {a && (a.type === 'rack'
      ? (a.rack?.accepted.length || a.rack?.candidates.some(c => !c.blocked.length && c.block)) && <Panel icon={Server} title="In the rack" info="Elevation of the accepted rack before and after the plan (or the best-ranked candidate while none is accepted), from DCIM."><RackElevationSheet plan={plan} ev={ev} max={2} /></Panel>
      : ((a.hall?.grid && a.hall.positions.length) || a.pod?.chosen || a.pod?.options.some(o => o.fits) || (a.retrofit?.hall && a.retrofit.rows.length)) ? <Panel icon={Grid3x3} title="On the hall grid" info="The hall's positions from DCIM before and after the plan: live racks, empty cabinets, free positions and what this plan takes."><HallGridSheet plan={plan} ev={ev} /></Panel> : null)}
    <Panel icon={Zap} title={`Site power chain · ${a?.site?.dc.name ?? 'site not loaded'}`} info="Each stage of the site's power chain at its redundancy (largest unit lost, one side of 2N): usable capacity, today's load, the IT headroom it leaves and what is left after this plan."><SiteChain site={a?.site} addKw={a?.addedKw ?? 0} /></Panel>
    <Panel icon={ListChecks} title="Checks on the real site" info="The in-site checks the planner ran against DCIM, the power chain, cooling zones, IPAM and the change calendar for this plan.">{a ? <ChecksBlock a={a} keys={ALL_CHECKS} /> : <Note>The plan has not been evaluated against a site yet.</Note>}</Panel>
  </div>);
}
