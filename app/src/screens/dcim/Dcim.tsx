/* DCIM (Plan & Build, 13-Oct-2026: P2B merge phase 1). The inventory record of the estate: sites, floor plans, racks, devices,
   cabling, power distribution, the device-type catalogue and the containment hierarchy. One page, tabs (`?tab=`), an optional
   site scope (`?dc=`); every number is derived from the same entities the operations screens use (mock/dcim.ts). */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getDcim, getDcimCables, getDcimDevices, getDcimTypes, useQuery } from '../../api';
import type { DcimSite } from '../../api/types';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Tabs } from '../../ui/kit';
import { DataTable, type Col } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { Facts, SoftMeter, Split, StatGrid, StatTile } from '../../ui/Analytics';
import { Meter, RolloutChip } from '../../ui/status';
import { fmtKw, fmtNum } from '../../lib/format';
import { ACCENT, BAD, loadColor, pct } from './common';
import { FloorPlans } from './FloorPlan';
import { RacksTab, DevicesTab, CablingTab, PowerTab, TypesTab } from './lists';
import { Hierarchy } from './Hierarchy';
import { Explorer } from './Explorer';
import { NewRackModal, InstallDeviceModal } from './forms';
import '../../styles/dcim.css';

export type DcimTab = 'sites' | 'floorplan' | 'racks' | 'devices' | 'cabling' | 'power' | 'types' | 'hierarchy' | 'explorer';
const TABS: { id: DcimTab; label: string }[] = [
  { id: 'sites', label: 'Sites' }, { id: 'floorplan', label: 'Floor plans' }, { id: 'racks', label: 'Racks' }, { id: 'devices', label: 'Devices' },
  { id: 'cabling', label: 'Cabling' }, { id: 'power', label: 'Power' }, { id: 'types', label: 'Device types' }, { id: 'hierarchy', label: 'Hierarchy' }, { id: 'explorer', label: 'Explorer' }
];

export function Dcim() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as DcimTab) || 'sites';
  const dcId = sp.get('dc') ?? '';
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); setSp(n, { replace: true }); };
  const [modal, setModal] = useState<'rack' | 'device' | null>(null);
  usePage([{ label: 'Plan & Build' }, { label: 'DCIM', to: '/dcim' }, ...(dcId ? [{ label: dcId }] : [])], dcId ? { dcId } : {});
  const { data: all } = useQuery(() => getDcim(), []);
  const { data: scoped } = useQuery(() => getDcim({ dcId: dcId || undefined }), [dcId]);
  const { data: devices } = useQuery(() => getDcimDevices({ dcId: dcId || undefined }), [dcId]);
  const { data: cables } = useQuery(() => getDcimCables({ dcId: dcId || undefined }), [dcId]);
  const { data: types } = useQuery(getDcimTypes, []);
  if (!all || !scoped || !devices || !cables || !types) return <Loading />;

  const S = scoped;
  const usedU = S.racks.reduce((a, r) => a + r.usedU, 0), totalU = S.racks.reduce((a, r) => a + r.heightU, 0);
  const draw = S.racks.reduce((a, r) => a + r.drawKw, 0), budget = S.racks.reduce((a, r) => a + r.budgetKw, 0);
  const hot = S.racks.filter(r => r.powerPct >= 90).length;
  const cat = (c: string) => devices.filter(d => d.category === c).length;
  const planned = devices.filter(d => d.status === 'Planned').length;
  const data = cables.filter(c => c.kind === 'Data'), power = cables.filter(c => c.kind === 'Power');
  const route = (r: string) => data.filter(c => c.route === r).length;
  const down = cables.filter(c => c.status !== 'Connected' && c.status !== 'Planned').length;
  const typeIds = new Set(devices.map(d => d.typeId));
  const mfrs = new Set(types.types.filter(t => typeIds.has(t.id)).map(t => t.manufacturer));
  const sites = S.sites;
  const go = (t: DcimTab, extra: Record<string, string> = {}) => set({ tab: t === 'sites' ? '' : t, ...extra });

  return (
    <div className="page dcim">
      <PageHead title="DCIM" sub="Sites, floor plans, racks, devices, cabling and power — the inventory record behind every operations screen"
        actions={<>
          <select className="select" value={dcId} onChange={e => set({ dc: e.target.value, hall: '' })} aria-label="Datacenter scope">
            <option value="">All datacenters ({all.sites.length})</option>
            {all.sites.map(s => <option key={s.id} value={s.id}>{s.id} · {s.city}</option>)}
          </select>
          <Btn icon={I.Plus} onClick={() => setModal('rack')}>New rack</Btn>
          <Btn variant="filled" icon={I.HardDriveDownload} onClick={() => setModal('device')}>Install device</Btn>
        </>} />

      <StatGrid>
        <StatTile label="Sites" value={sites.length} sub={`${fmtNum(sites.reduce((a, s) => a + s.halls, 0))} halls · ${fmtNum(sites.reduce((a, s) => a + s.rows, 0))} rows`} onClick={() => go('sites')} active={tab === 'sites'}
          info="Datacenters in scope by rollout state, with the halls (rooms) and rack rows they contain. Click to open the site list.">
          <Split parts={[{ key: 'on-air', label: 'Live', n: sites.filter(s => s.status === 'on-air').length, tone: 'info' }, { key: 'in-progress', label: 'Building', n: sites.filter(s => s.status === 'in-progress').length, tone: 'neutral' }, { key: 'planned', label: 'Planned', n: sites.filter(s => s.status === 'planned').length, tone: 'neutral' }]} />
        </StatTile>
        <StatTile label="Rack space" value={`${pct(usedU, totalU)}%`} sub={`${fmtNum(usedU)} of ${fmtNum(totalU)} U`} onClick={() => go('racks')} active={tab === 'racks'}
          info="Rack units in use (devices plus the ODF patch-panel block) as a share of all rack units in scope. Click to open the rack list.">
          <SoftMeter pct={pct(usedU, totalU)} tone={pct(usedU, totalU) >= 85 ? 'warning' : 'info'} />
          <Facts items={[{ n: fmtNum(S.racks.length), label: 'racks' }, { n: fmtNum(totalU - usedU), label: 'U free' }]} />
        </StatTile>
        <StatTile label="Devices" value={fmtNum(devices.length)} sub={planned ? `${fmtNum(planned)} planned` : 'all installed'} onClick={() => go('devices')} active={tab === 'devices'}
          info="Every device placed in a rack, by category. Planned devices hold their rack units but are not yet installed. Click to open the device list.">
          <Split parts={[{ key: 'network', label: 'Network', n: cat('network'), tone: 'info' as const }, { key: 'compute', label: 'Compute', n: cat('compute'), tone: 'neutral' as const }, { key: 'storage', label: 'Storage', n: cat('storage'), tone: 'neutral' as const }, { key: 'tenant', label: 'Tenant', n: cat('tenant'), tone: 'neutral' as const }].filter(x => x.n)} />
        </StatTile>
        <StatTile label="Rack power" value={`${pct(draw, budget)}%`} sub={`of ${fmtKw(budget)}`} subTone={hot ? 'warn' : undefined} onClick={() => go('power')} active={tab === 'power'}
          info="Measured rack draw as a share of the summed rack power budgets (each cabinet side is rated for the whole cabinet). Click to open power distribution.">
          <SoftMeter pct={pct(draw, budget)} tone={pct(draw, budget) >= 85 ? 'warning' : 'info'} />
          <Facts items={[{ n: fmtKw(draw), label: 'drawn' }, { n: hot, label: `rack${hot === 1 ? '' : 's'} ≥ 90%`, tone: hot ? 'warn' : undefined, onClick: () => go('racks', { load: 'hot' }) }]} />
        </StatTile>
        <StatTile label="Cabling" value={fmtNum(data.length)} sub={`data · ${fmtNum(power.length)} power`} subTone={down ? 'warn' : undefined} onClick={() => go('cabling')} active={tab === 'cabling'}
          info="Data cables (one per physical link) by route: inside one cabinet, through the structured cabling (panel → trunk → ODF), or leaving the site. Power cords connect a device supply to a rack PDU outlet.">
          <Split parts={[{ key: 'Structured', label: 'Structured', n: route('Structured'), tone: 'info' }, { key: 'In-rack', label: 'In-rack', n: route('In-rack'), tone: 'neutral' }, { key: 'Inter-site', label: 'Inter-site', n: route('Inter-site'), tone: 'neutral' }]} />
          <Facts items={[{ n: down, label: 'not connected', tone: down ? 'warn' : undefined, onClick: () => go('cabling', { cst: 'issue' }) }]} />
        </StatTile>
        <StatTile label="Catalogue" value={typeIds.size} sub={`types · ${mfrs.size} makers`} onClick={() => go('types')} active={tab === 'types'}
          info="Device types in use in scope (one per manufacturer + model) and the manufacturers that make them. Click to open the catalogue.">
          <Split parts={[{ key: 'n', label: 'Network', n: types.types.filter(t => typeIds.has(t.id) && t.category === 'network').length, tone: 'info' as const }, { key: 'c', label: 'Compute', n: types.types.filter(t => typeIds.has(t.id) && t.category === 'compute').length, tone: 'neutral' as const }, { key: 'o', label: 'Storage & tenant', n: types.types.filter(t => typeIds.has(t.id) && (t.category === 'storage' || t.category === 'tenant')).length, tone: 'neutral' as const }].filter(x => x.n)} />
        </StatTile>
      </StatGrid>

      <Tabs value={tab} onChange={v => go(v)} tabs={TABS.map(t => ({ ...t, count: t.id === 'sites' ? sites.length : t.id === 'racks' ? S.racks.length : t.id === 'devices' ? devices.length : undefined }))} />

      {tab === 'sites' && <SitesTab sites={sites} onOpen={id => set({ tab: 'floorplan', dc: id, hall: '' })} />}
      {tab === 'floorplan' && <FloorPlans dcId={dcId || all.sites.find(s => s.status !== 'planned')?.id || all.sites[0].id} onSite={id => set({ dc: id, hall: '' })} />}
      {tab === 'racks' && <RacksTab racks={S.racks} />}
      {tab === 'devices' && <DevicesTab devices={devices} />}
      {tab === 'cabling' && <CablingTab cables={cables} />}
      {tab === 'power' && <PowerTab panels={S.panels} feeds={S.feeds} dcId={dcId} />}
      {tab === 'types' && <TypesTab types={types} inScope={typeIds} />}
      {tab === 'hierarchy' && <Hierarchy dcId={dcId} />}
      {tab === 'explorer' && <Explorer dcId={dcId} />}

      <NewRackModal open={modal === 'rack'} onClose={() => setModal(null)} dcId={dcId} />
      <InstallDeviceModal open={modal === 'device'} onClose={() => setModal(null)} dcId={dcId} />
    </div>
  );
}

function SitesTab({ sites, onOpen }: { sites: DcimSite[]; onOpen: (id: string) => void }) {
  const [sp, setSp] = useSearchParams();
  const apply = useParamPatch();
  const nav = useNavigate();
  const q = sp.get('q') ?? '', st = sp.get('st') ?? '', type = sp.get('type') ?? '';
  const setP = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const rows = useMemo(() => sites.filter(s => (!st || s.status === st) && (!type || s.type === type) && (!q || `${s.id} ${s.name} ${s.city} ${s.state} ${s.type}`.toLowerCase().includes(q.toLowerCase()))), [sites, q, st, type]);
  const types = [...new Set(sites.map(s => s.type))];
  const cols: Col<DcimSite>[] = [
    { key: 'site', header: 'Datacenter', sort: s => s.id, render: s => <span className="cell-2"><span className="vw-card-activity-label">{s.id}</span><small className="nowrap">{s.city}</small></span> },
    { key: 'type', header: 'Facility type', sort: s => s.type, render: s => <span className="cell-2"><span className="nowrap">{s.type}</span><small>{s.tier}</small></span> },
    { key: 'st', header: 'Status', sort: s => s.status, render: s => <RolloutChip s={s.status} /> },
    { key: 'shape', header: 'Halls', sort: s => s.halls, render: s => <span className="cell-2"><span>{s.halls}</span><small className="nowrap">{s.floors} floor{s.floors === 1 ? '' : 's'} · {s.rows} rows</small></span> },
    { key: 'racks', header: 'Racks', sort: s => s.racks, render: s => <span className="cell-2"><span className="dcl-num">{fmtNum(s.racks)}</span><small className="nowrap">{fmtNum(s.devices)} devices</small></span> },
    { key: 'u', header: 'Rack space', sort: s => pct(s.usedU, s.totalU), render: s => <Meter pct={pct(s.usedU, s.totalU)} width={64} color={ACCENT} label={`${pct(s.usedU, s.totalU)}%`} /> },
    { key: 'kw', header: 'Rack power', sort: s => pct(s.itKw, s.rackBudgetKw), render: s => <Meter pct={pct(s.itKw, s.rackBudgetKw)} width={64} color={loadColor(pct(s.itKw, s.rackBudgetKw))} label={fmtKw(s.itKw)} /> },
    { key: 'design', header: 'Site capacity', sort: s => s.designKw, render: s => <span className="cell-2"><span>{fmtKw(s.designKw)}</span><small className="nowrap" style={{ color: s.itKw > s.designKw ? BAD : undefined }}>{pct(s.itKw, s.designKw)}% used</small></span> },
    { key: 'cab', header: 'Cabling', hideBelow: 1500, sort: s => s.cables, render: s => <span className="cell-2"><span>{fmtNum(s.cables)}</span><small className="nowrap">{fmtNum(s.powerFeeds)} rack PDUs</small></span> }
  ];
  return (
    <section className="vw-card-section dcim-table">
      <DataTable rows={rows} cols={cols} pageSize={30} defaultSort={{ key: 'site', dir: 'asc' }} onRow={s => onOpen(s.id)}
        toolbar={<ListToolbar shown={rows.length} total={sites.length} noun="sites" onApply={apply} search={{ value: q, onChange: v => setP('q', v), placeholder: 'Site, city, facility type' }}
          actions={[{ label: 'Open in operations', icon: I.Activity, onClick: () => nav('/datacenters') }]}
          filters={[
            { id: 'st', label: 'Status', quick: true, value: st, anyLabel: 'Any status', onChange: v => setP('st', v), options: (['on-air', 'in-progress', 'planned'] as const).map(x => ({ id: x, label: x === 'on-air' ? 'Live' : x === 'in-progress' ? 'Building' : 'Planned', count: sites.filter(s => s.status === x).length })) },
            { id: 'type', label: 'Facility type', quick: true, value: type, anyLabel: 'Any type', onChange: v => setP('type', v), options: types.map(t => ({ id: t, label: t, count: sites.filter(s => s.type === t).length })) }
          ]} />} />
    </section>
  );
}
