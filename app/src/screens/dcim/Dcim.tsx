/* DCIM (Plan & Build, 13-Oct-2026: P2B merge phase 1). The inventory record of the estate: sites, floor plans, racks, devices,
   cabling, power distribution, the device-type catalogue and the containment hierarchy. One page, tabs (`?tab=`), an optional
   site scope (`?dc=`); every number is derived from the same entities the operations screens use (mock/dcim.ts). */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getDcim, getDcimCables, getDcimChangeBoard, getDcimDevices, getDcimTypes, useQuery } from '../../api';
import { DcimChangesTab } from './Changes';
import type { DcimSite } from '../../api/types';
import { usePage, PageHead, Loading } from '../../shell/page';
import { SubTabs, subCrumb, subHead } from '../../shell/submenus';
import { DcimInsights } from './Insights';
import { Btn, Drawer } from '../../ui/kit';
import { NewChange } from '../changes/parts';
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

export type DcimTab = 'overview' | 'sites' | 'floorplan' | 'racks' | 'devices' | 'cabling' | 'power' | 'changes' | 'types' | 'hierarchy' | 'explorer';
/* order (user, 15-Oct-2026): the estate top-down (site → hierarchy → hall → rack → device), what connects and powers it, the catalogue,
   then the tools (explorer) and the change requests that act on all of it */
const TABS: { id: DcimTab; label: string }[] = [
  { id: 'overview', label: 'Insights' }, { id: 'sites', label: 'Sites' }, { id: 'hierarchy', label: 'Hierarchy' }, { id: 'floorplan', label: 'Floor plans' }, { id: 'racks', label: 'Racks' }, { id: 'devices', label: 'Devices' },
  { id: 'cabling', label: 'Cabling' }, { id: 'power', label: 'Power' }, { id: 'types', label: 'Device types' }, { id: 'explorer', label: 'Explorer' }, { id: 'changes', label: 'Change requests' }
];

export function Dcim() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as DcimTab) || 'overview';
  const dcId = sp.get('dc') ?? '';
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); setSp(n, { replace: true }); };
  const [modal, setModal] = useState<'rack' | 'device' | 'change' | null>(null);
  usePage([{ label: 'Plan & Build' }, { label: 'DCIM', to: '/dcim' }, ...subCrumb('dcim', tab), ...(dcId ? [{ label: dcId }] : [])], dcId ? { dcId } : {});
  const { data: all } = useQuery(() => getDcim(), []);
  const { data: scoped } = useQuery(() => getDcim({ dcId: dcId || undefined }), [dcId]);
  const { data: devices } = useQuery(() => getDcimDevices({ dcId: dcId || undefined }), [dcId]);
  const { data: cables } = useQuery(() => getDcimCables({ dcId: dcId || undefined }), [dcId]);
  const { data: types } = useQuery(getDcimTypes, []);
  const { data: board } = useQuery(() => getDcimChangeBoard({ dcId: dcId || undefined }), [dcId]);
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
  const go = (t: DcimTab, extra: Record<string, string> = {}) => set({ tab: t === 'overview' ? '' : t, ...extra });

  return (
    <div className="page dcim">
      <PageHead {...subHead('dcim', tab, { title: 'DCIM', sub: 'Sites, floor plans, racks, devices, cabling and power — the inventory record behind every operations screen' })}
        actions={<>
          <select className="select" value={dcId} onChange={e => set({ dc: e.target.value, hall: '' })} aria-label="Datacenter scope">
            <option value="">All datacenters ({all.sites.length})</option>
            {all.sites.map(s => <option key={s.id} value={s.id}>{s.id} · {s.city}</option>)}
          </select>
          {/* one action set per sub-menu (user, 21-Oct-2026): racks on Insights / Sites / Racks, devices on Devices, a change request on Changes */}
          {(tab === 'overview' || tab === 'sites' || tab === 'hierarchy' || tab === 'racks' || tab === 'floorplan') && <Btn icon={I.Plus} onClick={() => setModal('rack')}>New rack</Btn>}
          {(tab === 'overview' || tab === 'sites' || tab === 'hierarchy' || tab === 'racks' || tab === 'floorplan' || tab === 'devices' || tab === 'explorer') && <Btn variant="filled" icon={I.HardDriveDownload} onClick={() => setModal('device')}>Install device</Btn>}
          {tab === 'changes' && <Btn variant="filled" icon={I.Plus} onClick={() => setModal('change')}>Raise change request</Btn>}
        </>} />

      {board && (() => {
        /* up-front: what change control has coming for this scope */
        const ready = board.rows.filter(r => r.view === 'ready').length, wait = board.rows.filter(r => r.view === 'approval').length, run = board.rows.filter(r => r.view === 'progress').length;
        if (!ready && !wait && !run && !board.plans.length) return null;
        const open = (cv: string) => set({ tab: 'changes', cv });
        return <div className={`dcim-crbar${ready ? ' is-ready' : ''}`} data-crbar><I.GitPullRequestArrow size={16} /><b>Change requests{dcId ? ` at ${dcId}` : ''}</b>
          {ready > 0 && <button type="button" onClick={() => open('ready')}><em>{ready}</em> approved, ready to run in DCIM</button>}
          {wait > 0 && <button type="button" onClick={() => open('approval')}><em>{wait}</em> awaiting approval</button>}
          {run > 0 && <button type="button" onClick={() => open('progress')}><em>{run}</em> in progress</button>}
          {board.plans.length > 0 && <button type="button" onClick={() => open('')}><em>{board.plans.length}</em> plan{board.plans.length === 1 ? '' : 's'} in review</button>}
          <button type="button" className="dcim-crbar-go" onClick={() => open('')}>Open the list →</button></div>;
      })()}

      {/* the analytics strip belongs to Insights only (user, 21-Oct-2026) */}
      {tab === 'overview' && <StatGrid>
        <StatTile label="Sites" value={sites.length} sub={`${fmtNum(sites.reduce((a, s) => a + s.halls, 0))} halls · ${fmtNum(sites.reduce((a, s) => a + s.rows, 0))} rows`} onClick={() => go('sites')}
          info="Datacenters in scope by rollout state, with the halls (rooms) and rack rows they contain. Click to open the site list.">
          <Split parts={[{ key: 'on-air', label: 'Live', n: sites.filter(s => s.status === 'on-air').length, tone: 'info' }, { key: 'in-progress', label: 'Building', n: sites.filter(s => s.status === 'in-progress').length, tone: 'neutral' }, { key: 'planned', label: 'Planned', n: sites.filter(s => s.status === 'planned').length, tone: 'neutral' }]} />
        </StatTile>
        <StatTile label="Rack space" value={`${pct(usedU, totalU)}%`} sub={`${fmtNum(usedU)} of ${fmtNum(totalU)} U`} onClick={() => go('racks')}
          info="Rack units in use (devices plus the ODF patch-panel block) as a share of all rack units in scope. Click to open the rack list.">
          <SoftMeter pct={pct(usedU, totalU)} tone={pct(usedU, totalU) >= 85 ? 'warning' : 'info'} />
          <Facts items={[{ n: fmtNum(S.racks.length), label: 'racks' }, { n: fmtNum(totalU - usedU), label: 'U free' }]} />
        </StatTile>
        <StatTile label="Devices" value={fmtNum(devices.length)} sub={planned ? `${fmtNum(planned)} planned` : 'all installed'} onClick={() => go('devices')}
          info="Every device placed in a rack, by category. Planned devices hold their rack units but are not yet installed. Click to open the device list.">
          <Split parts={[{ key: 'network', label: 'Network', n: cat('network'), tone: 'info' as const }, { key: 'compute', label: 'Compute', n: cat('compute'), tone: 'neutral' as const }, { key: 'storage', label: 'Storage', n: cat('storage'), tone: 'neutral' as const }, { key: 'tenant', label: 'Tenant', n: cat('tenant'), tone: 'neutral' as const }].filter(x => x.n)} />
        </StatTile>
        <StatTile label="Rack power" value={`${pct(draw, budget)}%`} sub={`of ${fmtKw(budget)}`} subTone={hot ? 'warn' : undefined} onClick={() => go('power')}
          info="Measured rack draw as a share of the summed rack power budgets (each cabinet side is rated for the whole cabinet). Click to open power distribution.">
          <SoftMeter pct={pct(draw, budget)} tone={pct(draw, budget) >= 85 ? 'warning' : 'info'} />
          <Facts items={[{ n: fmtKw(draw), label: 'drawn' }, { n: hot, label: `rack${hot === 1 ? '' : 's'} ≥ 90%`, tone: hot ? 'warn' : undefined, onClick: () => go('racks', { load: 'hot' }) }]} />
        </StatTile>
        <StatTile label="Cabling" value={fmtNum(data.length)} sub={`data · ${fmtNum(power.length)} power`} subTone={down ? 'warn' : undefined} onClick={() => go('cabling')}
          info="Data cables (one per physical link) by route: inside one cabinet, through the structured cabling (panel → trunk → ODF), or leaving the site. Power cords connect a device supply to a rack PDU outlet.">
          <Split parts={[{ key: 'Structured', label: 'Structured', n: route('Structured'), tone: 'info' }, { key: 'In-rack', label: 'In-rack', n: route('In-rack'), tone: 'neutral' }, { key: 'Inter-site', label: 'Inter-site', n: route('Inter-site'), tone: 'neutral' }]} />
          <Facts items={[{ n: down, label: 'not connected', tone: down ? 'warn' : undefined, onClick: () => go('cabling', { cst: 'issue' }) }]} />
        </StatTile>
        <StatTile label="Catalogue" value={typeIds.size} sub={`types · ${mfrs.size} makers`} onClick={() => go('types')}
          info="Device types in use in scope (one per manufacturer + model) and the manufacturers that make them. Click to open the catalogue.">
          <Split parts={[{ key: 'n', label: 'Network', n: types.types.filter(t => typeIds.has(t.id) && t.category === 'network').length, tone: 'info' as const }, { key: 'c', label: 'Compute', n: types.types.filter(t => typeIds.has(t.id) && t.category === 'compute').length, tone: 'neutral' as const }, { key: 'o', label: 'Storage & tenant', n: types.types.filter(t => typeIds.has(t.id) && (t.category === 'storage' || t.category === 'tenant')).length, tone: 'neutral' as const }].filter(x => x.n)} />
        </StatTile>
      </StatGrid>}

      <SubTabs screen="dcim" value={tab} onChange={v => go(v)} tabs={TABS.map(t => ({ ...t, count: ({ sites: sites.length, racks: S.racks.length, devices: devices.length, types: typeIds.size, changes: board?.rows.filter(r => r.view !== 'done' && r.view !== 'closed').length || undefined } as Partial<Record<DcimTab, number | undefined>>)[t.id] }))} />

      {tab === 'overview' && <DcimInsights model={S} devices={devices} cables={cables} types={types.types} board={board} dcId={dcId} go={go} />}
      {tab === 'sites' && <SitesTab sites={sites} onOpen={id => set({ tab: 'floorplan', dc: id, hall: '' })} />}
      {tab === 'floorplan' && <FloorPlans dcId={dcId || all.sites.find(s => s.status !== 'planned')?.id || all.sites[0].id} onSite={id => set({ dc: id, hall: '' })} />}
      {tab === 'racks' && <RacksTab racks={S.racks} />}
      {tab === 'devices' && <DevicesTab devices={devices} />}
      {tab === 'cabling' && <CablingTab cables={cables} />}
      {tab === 'power' && <PowerTab panels={S.panels} feeds={S.feeds} dcId={dcId} />}
      {tab === 'changes' && <DcimChangesTab dcId={dcId} />}
      {tab === 'types' && <TypesTab types={types} inScope={typeIds} />}
      {tab === 'hierarchy' && <Hierarchy dcId={dcId} />}
      {tab === 'explorer' && <Explorer dcId={dcId} />}

      <NewRackModal open={modal === 'rack'} onClose={() => setModal(null)} dcId={dcId} />
      <InstallDeviceModal open={modal === 'device'} onClose={() => setModal(null)} dcId={dcId} />
      {/* the same form as Change management, tagged as raised from DCIM; the new CR lands in "Awaiting approval" on this board */}
      <Drawer open={modal === 'change'} onClose={() => setModal(null)} width={620} title="Raise change request" sub="Scope drives the live impact preview; risk is computed, not chosen. The request waits for approval before any DCIM work runs under it.">
        {modal === 'change' && <NewChange kind="change" origin="DCIM" onDone={() => { setModal(null); set({ tab: 'changes', cv: 'approval' }); }} />}
      </Drawer>
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
