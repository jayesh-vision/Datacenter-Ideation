/* DCIM → Insights (user, 21-Oct-2026: "an attractive, professional analytics / insight screen for DCIM, same theme as the other
   modules' insight screens"). A dashboard, not a list: what needs attention in the inventory record, where space and power are
   tight, what the estate is made of (rack density, devices, cabling, vendors), how power is distributed and what is changing.
   Every figure is derived from the same scoped DCIM read model the lists use, with the same predicates, and every number links
   to the list filtered to exactly those rows. Layout and widgets follow Delivery's Insights (dl-dash grid, ipam-find list). */
import { useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import type { DcimCable, DcimDevice, DcimDeviceType, DcimHall, DcimPowerFeed, DcimPowerPanel, DcimRack, DcimSite, DcimChangeBoard, Severity } from '../../api/types';
import { Panel, Chip } from '../../ui/kit';
import { SevDot, StackBar } from '../../ui/status';
import { Facts } from '../../ui/Analytics';
import { BarList } from '../../charts/BarList';
import { Donut } from '../../charts/Donut';
import { fmtNum } from '../../lib/format';
import type { DcimTab } from './Dcim';
import '../../styles/delivery.css';
import '../../styles/ipam.css';

/* calm palette: blue ramp for the estate, red / amber only for faults */
const C = { blue: '#1C81EF', blue2: '#60A5FA', blue3: '#93C5FD', slate: '#CBD5E1', slate2: '#94A3B8', amber: '#F59E0B', red: '#EF4444', green: '#10B981' };
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const fmtKw = (kw: number) => (kw >= 1000 ? `${(kw / 1000).toFixed(1)} MW` : `${fmtNum(Math.round(kw))} kW`);
const plural = (n: number, w: string) => `${fmtNum(n)} ${w}${n === 1 ? '' : 's'}`;

interface Props {
  model: { sites: DcimSite[]; halls: DcimHall[]; racks: DcimRack[]; panels: DcimPowerPanel[]; feeds: DcimPowerFeed[] };
  devices: DcimDevice[]; cables: DcimCable[]; types: DcimDeviceType[]; board?: DcimChangeBoard; dcId: string;
  go: (t: DcimTab, extra?: Record<string, string>) => void;
}

export function DcimInsights({ model: S, devices, cables, types, board, dcId, go }: Props) {
  const nav = useNavigate();
  const racks = S.racks.filter(r => r.status !== 'Planned'), live = racks.filter(r => r.status !== 'Decommissioning');
  /* the same predicates the Racks list uses for ?load= (lists.tsx), so each count opens exactly those rows */
  const hot = racks.filter(r => r.powerPct >= 90), oneSide = racks.filter(r => r.power !== 'A + B'), full = racks.filter(r => r.freeU < 4), empty = racks.filter(r => r.devices === 0);
  const damaged = racks.filter(r => r.condition === 'Damaged'), old = racks.filter(r => r.old);
  const dataCables = cables.filter(c => c.kind === 'Data'), powerCords = cables.filter(c => c.kind === 'Power');
  const issue = (c: DcimCable) => c.status !== 'Connected' && c.status !== 'Planned';
  const dataIssues = dataCables.filter(issue), powerIssues = powerCords.filter(issue);
  const byStatus = (d: DcimDevice['status']) => devices.filter(x => x.status === d);
  const feedStates = [...new Set(S.feeds.filter(f => f.state !== 'ok').map(f => f.state))];
  const panelsOff = S.panels.filter(p => p.sourceState !== 'Online');
  const ready = board?.rows.filter(r => r.view === 'ready') ?? [], awaiting = board?.rows.filter(r => r.view === 'approval') ?? [], inProgress = board?.rows.filter(r => r.view === 'progress') ?? [];

  /* ---- needs attention: one row per finding type, worst first */
  const items: { key: string; sev: Severity; title: string; sub: string; onClick: () => void }[] = [
    ...(hot.length ? [{ key: 'hot', sev: 'major' as const, title: `${plural(hot.length, 'rack')} at 90% of the power budget or more`, sub: 'No headroom to add a device; a PSU swap can trip the feed', onClick: () => go('racks', { load: 'hot' }) }] : []),
    ...feedStates.map(st => { const n = S.feeds.filter(f => f.state === st).length; return { key: `f-${st}`, sev: (st === 'tripped' ? 'major' : 'minor') as Severity, title: `${plural(n, 'rack feed')} ${st.replace(/-/g, ' ')}`, sub: 'Rack PDUs that are not carrying load normally', onClick: () => go('power', { fst: st }) }; }),
    ...(panelsOff.length ? [{ key: 'pan', sev: 'major' as const, title: `${plural(panelsOff.length, 'power panel')} not on normal supply`, sub: panelsOff.map(p => `${p.name}: ${p.sourceState}`).slice(0, 3).join(' · '), onClick: () => go('power') }] : []),
    ...(dataIssues.length ? [{ key: 'dc', sev: 'major' as const, title: `${plural(dataIssues.length, 'data cable')} not connected`, sub: 'Link down at one end or the other', onClick: () => go('cabling', { ckind: 'Data', cst: 'issue' }) }] : []),
    ...(powerIssues.length ? [{ key: 'pc', sev: 'minor' as const, title: `${plural(powerIssues.length, 'power cord')} without power`, sub: 'Failed PSU or a dead outlet', onClick: () => go('cabling', { ckind: 'Power', cst: 'issue' }) }] : []),
    ...(oneSide.length ? [{ key: 'side', sev: 'minor' as const, title: `${plural(oneSide.length, 'rack')} on one power side only`, sub: 'Loses everything if the remaining feed fails', onClick: () => go('racks', { load: 'side' }) }] : []),
    ...(damaged.length ? [{ key: 'dmg', sev: 'minor' as const, title: `${plural(damaged.length, 'rack')} marked damaged at audit`, sub: damaged.slice(0, 3).map(r => `${r.dcId} ${r.name}`).join(' · '), onClick: () => go('racks', { q: 'damaged' }) }] : []),
    ...(full.length ? [{ key: 'full', sev: 'warning' as const, title: `${plural(full.length, 'rack')} with fewer than 4 U free`, sub: 'Nothing bigger than a 1U device fits any more', onClick: () => go('racks', { load: 'full' }) }] : []),
    ...(byStatus('Planned').length ? [{ key: 'pl', sev: 'warning' as const, title: `${plural(byStatus('Planned').length, 'planned device')} holding rack space`, sub: 'Reserved units until the device is installed', onClick: () => go('devices', { dst: 'Planned' }) }] : []),
    ...(ready.length ? [{ key: 'cr', sev: 'warning' as const, title: `${plural(ready.length, 'change request')} approved and ready to execute`, sub: 'DCIM work waiting for its window', onClick: () => go('changes', { cv: 'ready' }) }] : []),
    ...(empty.length ? [{ key: 'empty', sev: 'warning' as const, title: `${plural(empty.length, 'empty rack')}`, sub: 'Cabinets with no device at all', onClick: () => go('racks', { load: 'empty' }) }] : []),
  ];
  const major = items.filter(i => i.sev === 'major').length;

  /* ---- sites: power and space pressure, tightest first */
  const siteRows = S.sites.filter(s => s.racks > 0).map(s => ({ s, power: pct(s.itKw, s.rackBudgetKw), space: pct(s.usedU, s.totalU) })).sort((a, b) => b.power - a.power);
  /* ---- halls: the same, by rack power against the hall's budget */
  const hallRows = S.halls.filter(h => h.racks > 0).map(h => ({ h, power: pct(h.drawKw, h.budgetKw), space: pct(h.usedU, h.totalU) })).sort((a, b) => b.power - a.power);
  /* ---- power panels by load */
  const panelRows = [...S.panels].map(p => ({ p, load: pct(p.loadKw, p.capacityKw) })).sort((a, b) => b.load - a.load);
  /* ---- vendors from the devices in scope */
  const vendors = [...devices.reduce((m, d) => m.set(d.manufacturer, (m.get(d.manufacturer) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const typesInScope = new Set(devices.map(d => d.typeId));
  const cat = (c: string) => devices.filter(d => d.category === c).length;
  const dens = (d: DcimRack['density']) => live.filter(r => r.density === d).length;
  const liquid = live.filter(r => r.liquid).length, tenant = live.filter(r => r.owner === 'tenant').length;
  const cst = (pool: DcimCable[], s: string) => pool.filter(c => c.status === s).length;
  const withDc = (extra: Record<string, string>) => (dcId ? { ...extra } : extra);

  return (
    <div className="dl-dash dcim-ov">
      <Panel className="dl-span-5 dl-h-360" title="Needs attention" icon={I.TriangleAlert} count={items.length} sub={items.length ? `${major} major · ${items.length - major} other` : 'Nothing flagged in the inventory record'}
        info="Findings in the inventory record itself: racks out of power headroom or on one side, feeds and panels off normal supply, cables not connected, damaged or empty racks, planned devices holding space and change requests ready to run. Each row opens the list filtered to those rows.">
        <ul className="ipam-find">{items.map(x => <li key={x.key}><button type="button" onClick={x.onClick}><SevDot s={x.sev} /><span className="cell-2"><b>{x.title}</b><small>{x.sub}</small></span><I.ChevronRight size={14} className="ipam-chev" /></button></li>)}
          {!items.length && <li><p className="vw-label" style={{ margin: 0 }}>Every rack, feed and cable is in order.</p></li>}</ul>
      </Panel>
      <Panel className="dl-span-7 dl-h-360" title="Where capacity is tight" icon={I.Building2} count={siteRows.length} sub="Rack power drawn against the summed rack budgets, tightest site first; the second figure is rack space in use"
        info="Per site: IT load as a share of the rack power budgets (bar) and rack units in use. The 85% marker is the warning line Capacity uses. Click a site to open its racks.">
        <BarList items={siteRows.map(x => ({ key: x.s.id, label: `${x.s.id} · ${x.s.city}`, sublabel: `${plural(x.s.racks, 'rack')} · ${fmtKw(x.s.itKw)} of ${fmtKw(x.s.rackBudgetKw)}`, value: x.power, display: `${x.power}% power`, secondary: `${x.space}% space`, color: x.power >= 90 ? C.red : x.power >= 85 ? C.amber : C.blue, onClick: () => go('racks', { dc: x.s.id }) }))} max={100} marker={{ value: 85, label: 'warning line' }} />
      </Panel>

      <Panel className="dl-span-4" title="Rack density" icon={I.Server} count={live.length} sub={`${plural(liquid, 'liquid-cooled rack')} · ${tenant ? plural(tenant, 'tenant rack') : 'operator racks only'}`}
        info="Live racks by density class: Standard (air, up to ~10 kW), High (15–30 kW) and AI (liquid-cooled GPU cabinets). Click a class in the Racks list to filter by it.">
        <Donut slices={[{ key: 'Standard', label: 'Standard', value: dens('Standard'), color: C.blue3 }, { key: 'High', label: 'High density', value: dens('High'), color: C.blue2 }, { key: 'AI', label: 'AI / GPU', value: dens('AI'), color: C.blue }]} centerLabel="live racks" />
        <Facts items={[{ n: fmtNum(S.racks.filter(r => r.status === 'Planned').length), label: 'planned', onClick: () => go('racks', { rst: 'Planned' }) }, { n: fmtNum(old.length), label: 'previous generation' }, { n: fmtNum(S.halls.filter(h => h.cooling !== 'Air').length), label: 'liquid / hybrid halls' }]} />
      </Panel>
      <Panel className="dl-span-4" title="Devices" icon={I.HardDrive} count={devices.length} sub={`${plural(typesInScope.size, 'device type')} from ${plural(vendors.length, 'maker')}`}
        info="Every device placed in a rack, by category. Status facts open the device list filtered to that status.">
        <Donut slices={[{ key: 'network', label: 'Network', value: cat('network'), color: C.blue }, { key: 'compute', label: 'Compute', value: cat('compute'), color: C.blue2 }, { key: 'storage', label: 'Storage', value: cat('storage'), color: C.blue3 }, { key: 'tenant', label: 'Tenant gear', value: cat('tenant'), color: C.slate }]} centerLabel="devices" />
        <Facts items={[{ n: fmtNum(byStatus('Active').length), label: 'installed', onClick: () => go('devices', { dst: 'Active' }) }, { n: fmtNum(byStatus('Planned').length), label: 'planned', onClick: () => go('devices', { dst: 'Planned' }) },
          { n: fmtNum(byStatus('Maintenance').length + byStatus('Decommissioning').length), label: 'in maintenance / leaving', tone: byStatus('Decommissioning').length ? 'warn' : undefined, onClick: () => go('devices', { dst: 'Maintenance' }) }]} />
      </Panel>
      <Panel className="dl-span-4" title="Cabling" icon={I.Cable} count={cables.length} sub={`${plural(dataCables.length, 'data cable')} · ${plural(powerCords.length, 'power cord')}`}
        info="Data cables (one per physical link) and power cords (one per device supply) by state. Issues open the cabling list filtered to the cables that are not connected.">
        <div className="dcim-ov-stack">
          <div><span className="dcim-ov-stack-h"><b>Data</b><small>{fmtNum(cst(dataCables, 'Connected'))} connected{dataIssues.length ? ` · ${dataIssues.length} not connected` : ''}{cst(dataCables, 'Planned') ? ` · ${cst(dataCables, 'Planned')} planned` : ''}</small></span>
            <StackBar height={10} parts={[{ value: cst(dataCables, 'Connected'), color: C.blue, label: 'Connected' }, { value: dataIssues.length, color: C.red, label: 'Not connected' }, { value: cst(dataCables, 'Planned'), color: C.slate, label: 'Planned' }]} /></div>
          <div><span className="dcim-ov-stack-h"><b>Power</b><small>{fmtNum(cst(powerCords, 'Connected'))} live{powerIssues.length ? ` · ${powerIssues.length} without power` : ''}{cst(powerCords, 'Planned') ? ` · ${cst(powerCords, 'Planned')} planned` : ''}</small></span>
            <StackBar height={10} parts={[{ value: cst(powerCords, 'Connected'), color: C.blue2, label: 'Live' }, { value: powerIssues.length, color: C.red, label: 'Without power' }, { value: cst(powerCords, 'Planned'), color: C.slate, label: 'Planned' }]} /></div>
        </div>
        <Facts items={(['Structured', 'In-rack', 'Inter-site'] as const).map(r => ({ n: fmtNum(dataCables.filter(c => c.route === r).length), label: r.toLowerCase(), onClick: () => go('cabling', { ckind: 'Data', route: r }) }))} />
      </Panel>

      <Panel className="dl-span-6 dl-h-360" title="Power distribution" icon={I.Zap} count={S.panels.length} sub={`${plural(S.panels.length, 'panel')} feeding ${plural(S.feeds.length, 'rack PDU')} · ${S.panels.filter(p => p.side === 'A').length} A · ${S.panels.filter(p => p.side === 'B').length} B${S.panels.some(p => p.side === 'DC') ? ` · ${S.panels.filter(p => p.side === 'DC').length} −48 V` : ''}`}
        info="Each hall's A and B busway (one UPS module each) or −48 V distribution, by load against capacity, most loaded first. Click a panel to open power distribution.">
        <BarList items={panelRows.map(x => ({ key: x.p.id, label: `${x.p.name} · ${x.p.side === 'DC' ? '−48 V' : `side ${x.p.side}`}`, sublabel: `${x.p.dcId} · ${x.p.hallName} · ${x.p.source}${x.p.sourceState !== 'Online' ? ` (${x.p.sourceState})` : ''}`, value: x.load, display: `${x.load}%`, secondary: `${fmtKw(x.p.loadKw)} of ${fmtKw(x.p.capacityKw)}`, color: x.p.state === 'bad' ? C.red : x.p.state === 'warn' ? C.amber : C.blue, onClick: () => go('power', withDc({ dc: x.p.dcId })) }))} max={100} marker={{ value: 85, label: 'warning line' }} />
      </Panel>
      <Panel className="dl-span-6 dl-h-360" title="Halls under pressure" icon={I.LayoutGrid} count={hallRows.length} sub="Rack draw against the hall's rack budgets, tightest hall first; the second figure is rack space"
        info="Every hall (room) with racks: rack draw as a share of its rack power budgets, and rack units in use. Click a hall to open its floor plan.">
        <BarList items={hallRows.map(x => ({ key: x.h.id, label: `${x.h.dcId} · ${x.h.name}`, sublabel: `${x.h.floor} · ${plural(x.h.racks, 'rack')} · ${x.h.cooling} cooling${x.h.hotAisleContained ? ' · contained' : ''}`, value: x.power, display: `${x.power}% power`, secondary: `${x.space}% space`, color: x.power >= 90 ? C.red : x.power >= 85 ? C.amber : C.blue2, onClick: () => go('floorplan', { dc: x.h.dcId, hall: x.h.id }) }))} max={100} marker={{ value: 85, label: 'warning line' }} />
      </Panel>

      <Panel className="dl-span-6 dl-h-360" title="Makers in the estate" icon={I.Factory} count={vendors.length} sub={`${plural(typesInScope.size, 'device type')} in use · ${plural(types.length, 'type')} in the catalogue`}
        info="Devices in scope by manufacturer, most devices first. Click a maker to open the catalogue.">
        <BarList items={vendors.map(([name, n]) => ({ key: name, label: name, sublabel: `${plural(types.filter(t => t.manufacturer === name && typesInScope.has(t.id)).length, 'type')} in use`, value: n, display: fmtNum(n), secondary: `${pct(n, devices.length)}%`, color: C.blue, onClick: () => go('types', { q: name }) }))} limit={10} />
      </Panel>
      <Panel className="dl-span-6 dl-h-360" title="Records under change" icon={I.GitPullRequestArrow} count={(board?.rows.filter(r => r.view !== 'done' && r.view !== 'closed').length) ?? 0} sub="Change requests that touch racks, devices, ports or power in this scope"
        info="Every DCIM edit runs under a change request. Ready = approved and executable now; awaiting = in approval; in progress = being executed; plans in review = planner plans whose build would change these records.">
        <div className="dcim-ov-cr">
          {[{ k: 'ready', n: ready.length, label: 'Ready to execute', tone: 'success' as const }, { k: 'approval', n: awaiting.length, label: 'Awaiting approval', tone: 'warning' as const }, { k: 'progress', n: inProgress.length, label: 'In progress', tone: 'info' as const }, { k: 'done', n: board?.rows.filter(r => r.view === 'done').length ?? 0, label: 'Done · 30 days', tone: 'neutral' as const }]
            .map(x => <button key={x.k} type="button" className="dcim-ov-cr-tile" onClick={() => go('changes', { cv: x.k })}><b className="num">{fmtNum(x.n)}</b><Chip tone={x.tone} size="xs" dot>{x.label}</Chip></button>)}
        </div>
        <Facts items={[{ n: fmtNum(board?.plans.length ?? 0), label: 'plans in review', onClick: () => nav('/planning?tab=plans&status=In%20review') }, { n: fmtNum(board?.ghosts.length ?? 0), label: 'racks planned on floor plans', onClick: () => go('floorplan') },
          { n: fmtNum(board?.rows.reduce((a, r) => a + r.work.planned, 0) ?? 0), label: 'work items planned', onClick: () => go('changes', { cv: 'ready' }) }, { n: fmtNum(board?.rows.reduce((a, r) => a + r.work.failed, 0) ?? 0), label: 'failed', tone: board?.rows.some(r => r.work.failed) ? 'bad' : undefined, onClick: () => go('changes', { cv: 'progress' }) }]} />
      </Panel>
    </div>
  );
}
