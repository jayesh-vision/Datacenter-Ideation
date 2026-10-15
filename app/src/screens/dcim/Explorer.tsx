/* DCIM Explorer (14-Oct-2026, P2B gap fill): ask the inventory a question — racks or devices, filtered by site, hall, power band,
   cooling, density, status, owner, category, manufacturer — and see the answer as a table or as tiles. Views can be saved (this
   browser only) and every answer exports to CSV. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { getDcim, getDcimDevices, useQuery } from '../../api';
import type { DcimDevice, DcimRack } from '../../api/types';
import { Loading } from '../../shell/page';
import { Btn, Chip, Field, Modal } from '../../ui/kit';
import { ListToolbar, type ListFilter } from '../../ui/ListToolbar';
import { DataTable, type Col } from '../../ui/DataTable';
import { Meter } from '../../ui/status';
import { fmtNum } from '../../lib/format';
import { CAT_COLOR, CAT_LABEL, DcimStatusChip, loadColor } from './common';
import { DeviceDrawer } from './lists';

type Entity = 'racks' | 'devices';
type Q = Record<string, string>;
interface Saved { name: string; entity: Entity; q: Q }
const KEY = 'dco.dcim.views';
const load = (): Saved[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } };
const store = (v: Saved[]) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage blocked */ } };
const band = (p: number) => (p >= 85 ? 'hot' : p >= 60 ? 'mid' : 'low');
/* the value a quick-filter option counts against */
const fieldOf = (r: Record<string, unknown>, k: string) => String(k === 'cat' ? r.category : k === 'mfr' ? r.manufacturer : r[k] ?? '');
const BAND_LABEL: Record<string, string> = { hot: '≥ 85% of budget', mid: '60–84%', low: '< 60%' };

export function Explorer({ dcId }: { dcId: string }) {
  const nav = useNavigate();
  const { data } = useQuery(() => getDcim({ dcId: dcId || undefined }), [dcId]);
  const { data: devs } = useQuery(() => getDcimDevices({ dcId: dcId || undefined }), [dcId]);
  const [entity, setEntity] = useState<Entity>('racks');
  const [view, setView] = useState<'table' | 'visual'>('table');
  const [q, setQ] = useState<Q>({});
  const [saved, setSaved] = useState<Saved[]>(load);
  const [naming, setNaming] = useState<string | null>(null);
  const [dev, setDev] = useState<string | null>(null);
  const racks = data?.racks ?? [], devices = devs ?? [];
  const set = (k: string, v: string) => setQ(x => { const n = { ...x }; if (v) n[k] = v; else delete n[k]; return n; });
  /* switching racks ⇄ devices keeps only the site / hall scope */
  const pickEntity = (e: Entity) => { if (e === entity) return; setEntity(e); setQ(x => { const n: Q = {}; if (x.site) n.site = x.site; if (x.hall) n.hall = x.hall; if (x.text) n.text = x.text; return n; }); };

  const rRows = useMemo(() => racks.filter(r => (!q.site || r.dcId === q.site) && (!q.hall || r.hallName === q.hall) && (!q.band || band(r.powerPct) === q.band) && (!q.cool || (q.cool === 'liquid' ? r.liquid : !r.liquid))
    && (!q.density || r.density === q.density) && (!q.status || r.status === q.status) && (!q.owner || r.owner === q.owner) && (!q.free || r.freeU >= Number(q.free)) && (!q.text || `${r.name} ${r.role} ${r.tenantName ?? ''}`.toLowerCase().includes(q.text.toLowerCase()))), [racks, q]);
  const dRows = useMemo(() => devices.filter(d => (!q.site || d.dcId === q.site) && (!q.hall || d.hallName === q.hall) && (!q.cat || d.category === q.cat) && (!q.status || d.status === q.status) && (!q.mfr || d.manufacturer === q.mfr)
    && (!q.text || `${d.name} ${d.model} ${d.rackName} ${d.serial}`.toLowerCase().includes(q.text.toLowerCase()))), [devices, q]);
  if (!data || !devs) return <Loading />;

  const uniq = <T,>(xs: T[], f: (x: T) => string) => [...new Set(xs.map(f))].filter(Boolean).sort();
  const opt = (k: string, xs: string[], label: (x: string) => string = x => x) => xs.map(x => ({ id: x, label: label(x), count: (entity === 'racks' ? racks : devices).filter(r => fieldOf(r as never, k) === x).length }));
  const rCols: Col<DcimRack>[] = [
    { key: 'n', header: 'Rack', sort: r => `${r.dcId}${r.name}`, render: r => <span className="cell-2"><span className="vw-card-activity-label">{r.name}</span><small>{r.dcId} · {r.hallName} · {r.rowName}</small></span> },
    { key: 'r', header: 'Role', sort: r => r.role, render: r => <span className="cell-2"><span>{r.role}</span><small>{r.density}{r.liquid ? ' · liquid' : ''}</small></span> },
    { key: 'u', header: 'Space', sort: r => r.usedU / r.heightU, render: r => <Meter pct={(r.usedU / r.heightU) * 100} width={56} color="var(--primaryColor400)" label={`${r.freeU} U free`} /> },
    { key: 'p', header: 'Power', sort: r => r.powerPct, render: r => <Meter pct={r.powerPct} width={56} color={loadColor(r.powerPct)} label={`${r.drawKw}/${r.budgetKw} kW`} /> },
    { key: 'd', header: 'Devices', sort: r => r.devices, render: r => fmtNum(r.devices) },
    { key: 'o', header: 'Owner', sort: r => r.tenantName ?? '', render: r => r.tenantName ?? 'Operator' },
    { key: 's', header: 'Status', sort: r => r.status, render: r => <DcimStatusChip s={r.status} /> }
  ];
  const dCols: Col<DcimDevice>[] = [
    { key: 'n', header: 'Device', sort: d => d.name, render: d => <span className="cell-2"><span className="mono">{d.name}</span><small>{d.manufacturer} {d.model}</small></span> },
    { key: 'l', header: 'Location', sort: d => `${d.dcId}${d.rackName}${d.u}`, render: d => <span className="cell-2"><span>{d.rackName} · U{d.u}</span><small>{d.dcId} · {d.hallName}</small></span> },
    { key: 'c', header: 'Category', sort: d => d.category, render: d => <span className="row" style={{ gap: 6 }}><i className="dcim-dot" style={{ background: CAT_COLOR[d.category] }} />{d.role}</span> },
    { key: 'p', header: 'Ports', sort: d => d.ports, render: d => `${d.portsUp}/${d.ports} up` },
    { key: 'w', header: 'Draw', sort: d => d.powerW, render: d => (d.powerW ? `${fmtNum(d.powerW)} W` : '—') },
    { key: 's', header: 'Status', sort: d => d.status, render: d => <DcimStatusChip s={d.status} /> }
  ];
  const rows = entity === 'racks' ? rRows : dRows;
  const exportCsv = () => {
    const head = entity === 'racks' ? ['Rack', 'Datacenter', 'Hall', 'Row', 'Role', 'Density', 'Liquid', 'Height U', 'Used U', 'Free U', 'Draw kW', 'Budget kW', 'Power %', 'Devices', 'Owner', 'Status']
      : ['Device', 'Datacenter', 'Hall', 'Rack', 'U', 'Manufacturer', 'Model', 'Role', 'Category', 'Serial', 'Ports', 'Ports up', 'Draw W', 'Status'];
    const body = entity === 'racks' ? rRows.map(r => [r.name, r.dcId, r.hallName, r.rowName, r.role, r.density, r.liquid ? 'yes' : 'no', r.heightU, r.usedU, r.freeU, r.drawKw, r.budgetKw, r.powerPct, r.devices, r.tenantName ?? 'Operator', r.status])
      : dRows.map(d => [d.name, d.dcId, d.hallName, d.rackName, d.u, d.manufacturer, d.model, d.role, d.category, d.serial, d.ports, d.portsUp, d.powerW, d.status]);
    const csv = [head, ...body].map(r => r.map(c => { const v = String(c ?? ''); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `dcim-${entity}-${dcId || 'estate'}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const save = () => { if (!naming?.trim()) return; const v = [...saved.filter(x => x.name !== naming.trim()), { name: naming.trim(), entity, q }]; setSaved(v); store(v); setNaming(null); };
  const active = Object.keys(q).filter(k => k !== 'text').length;

  const halls = uniq(racks.filter(r => !q.site || r.dcId === q.site), r => r.hallName);
  const f = (id: string, label: string, anyLabel: string, options: { id: string; label: string; count?: number }[], quick = false): ListFilter => ({ id, label, anyLabel, quick, value: q[id] ?? '', onChange: v => set(id, v), options });
  const filters: ListFilter[] = [
    { id: 'entity', label: 'Show', quick: true, value: entity, defaultValue: 'racks', onChange: v => pickEntity(v as Entity), options: [{ id: 'racks', label: 'Racks', count: racks.length }, { id: 'devices', label: 'Devices', count: devices.length }] },
    ...(!dcId ? [f('site', 'Site', 'Any site', uniq(racks, r => r.dcId).map(x => ({ id: x, label: x })), true)] : [f('hall', 'Hall', 'Any hall', halls.map(x => ({ id: x, label: x })), true)]),
    ...(!dcId ? [f('hall', 'Hall', 'Any hall', halls.map(x => ({ id: x, label: x })))] : []),
    ...(entity === 'racks' ? [
      f('band', 'Power band', 'Any power band', ['hot', 'mid', 'low'].map(x => ({ id: x, label: BAND_LABEL[x], count: racks.filter(r => band(r.powerPct) === x).length }))),
      f('cool', 'Cooling', 'Any cooling', [{ id: 'liquid', label: 'Liquid cooled', count: racks.filter(r => r.liquid).length }, { id: 'air', label: 'Air only', count: racks.filter(r => !r.liquid).length }]),
      f('density', 'Density', 'Any density', ['Standard', 'High', 'AI'].map(x => ({ id: x, label: x, count: racks.filter(r => r.density === x).length }))),
      f('owner', 'Owner', 'Any owner', [{ id: 'operator', label: 'Operator', count: racks.filter(r => r.owner === 'operator').length }, { id: 'tenant', label: 'Tenant', count: racks.filter(r => r.owner === 'tenant').length }]),
      f('free', 'Free space', 'Any free space', [1, 4, 8, 16].map(x => ({ id: String(x), label: `≥ ${x} U free`, count: racks.filter(r => r.freeU >= x).length }))),
      f('status', 'Status', 'Any status', opt('status', uniq(racks, r => r.status)))
    ] : [
      f('cat', 'Category', 'Any category', opt('cat', uniq(devices, d => d.category), x => CAT_LABEL[x as DcimDevice['category']])),
      f('mfr', 'Manufacturer', 'Any manufacturer', opt('mfr', uniq(devices, d => d.manufacturer))),
      f('status', 'Status', 'Any status', opt('status', uniq(devices, d => d.status)))
    ])
  ];
  const facts = entity === 'racks'
    ? `${fmtNum(rRows.reduce((a, r) => a + r.freeU, 0))} U free · ${fmtNum(Math.round(rRows.reduce((a, r) => a + r.drawKw, 0)))}/${fmtNum(Math.round(rRows.reduce((a, r) => a + r.budgetKw, 0)))} kW`
    : `${fmtNum(Math.round(dRows.reduce((a, d) => a + d.powerW, 0) / 1000))} kW · ${fmtNum(dRows.filter(d => d.status === 'Planned').length)} planned`;
  const toolbar = <ListToolbar shown={rows.length} total={entity === 'racks' ? racks.length : devices.length} noun={entity}
    search={{ value: q.text ?? '', onChange: v => set('text', v), placeholder: entity === 'racks' ? 'Rack, role, tenant' : 'Device, model, rack, serial' }}
    filters={filters} onApply={patch => { if (patch.entity !== undefined) pickEntity((patch.entity || 'racks') as Entity); setQ(x => { const n = { ...x }; for (const [k, v] of Object.entries(patch)) { if (k === 'entity') continue; if (v) n[k] = v; else delete n[k]; } return n; }); }}
    layout={{ value: view === 'table' ? 'list' : 'tiles', onChange: v => setView(v === 'list' ? 'table' : 'visual') }}
    actions={[
      { label: `Export ${fmtNum(rows.length)} ${entity} to CSV`, icon: I.Download, onClick: exportCsv },
      ...(active ? [{ label: 'Save this view…', icon: I.BookmarkPlus, onClick: () => setNaming('') }] : []),
      ...saved.map(v => ({ label: `Open view: ${v.name} (${v.entity})`, icon: I.Bookmark, onClick: () => { setEntity(v.entity); setQ(v.q); } })),
      ...(saved.length ? [{ label: 'Delete saved views', icon: I.Trash2, onClick: () => { setSaved([]); store([]); } }] : [])
    ]}>
    <span className="vw-label dcim-ex-facts">{facts}</span>
  </ListToolbar>;

  return (
    <div className="dcim-ex">
      {naming !== null && <Modal open onClose={() => setNaming(null)} title="Save this view" sub={`${entity === 'racks' ? 'Racks' : 'Devices'} with ${active} filter${active === 1 ? '' : 's'}; kept in this browser and listed under ⋮`}
        foot={<><Btn onClick={() => setNaming(null)}>Cancel</Btn><Btn variant="filled" onClick={save} disabled={!naming.trim()}>Save view</Btn></>}>
        <Field label="Name" required><input className="input" autoFocus value={naming} onChange={e => setNaming(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }} placeholder="e.g. Hot GPU racks" /></Field>
      </Modal>}
      {view === 'table' ? <section className="vw-card-section dcim-table">
        {entity === 'racks' ? <DataTable rows={rRows} cols={rCols} pageSize={30} defaultSort={{ key: 'p', dir: 'desc' }} onRow={r => nav(`/dcim/racks/${encodeURIComponent(r.id)}`)} toolbar={toolbar} empty={<p className="vw-label" style={{ padding: 16 }}>No racks match these filters.</p>} />
          : <DataTable rows={dRows} cols={dCols} pageSize={30} defaultSort={{ key: 'n', dir: 'asc' }} onRow={d => setDev(d.id)} toolbar={toolbar} empty={<p className="vw-label" style={{ padding: 16 }}>No devices match these filters.</p>} />}
      </section> : <><section className="vw-card-section dcim-table">{toolbar}</section>{entity === 'racks' ? <div className="dcim-ex-tiles">{rRows.slice(0, 300).map(r => (
        <button key={r.id} type="button" className="dcim-ex-tile" onClick={() => nav(`/dcim/racks/${encodeURIComponent(r.id)}`)} style={{ borderTopColor: loadColor(r.powerPct) }}>
          <span className="dcim-ex-tile-top"><b>{r.name}</b>{r.liquid && <I.Droplets size={12} />}<Chip tone="neutral" size="xs">{r.density}</Chip></span>
          <small>{r.dcId} · {r.hallName}</small>
          <Meter pct={r.powerPct} width={120} color={loadColor(r.powerPct)} label={`${r.powerPct}%`} />
          <small>{r.drawKw}/{r.budgetKw} kW · {r.freeU} U free · {r.devices} devices</small>
        </button>))}{rRows.length > 300 && <p className="vw-label">First 300 of {fmtNum(rRows.length)}; filter to narrow down.</p>}</div>
        : <div className="dcim-ex-tiles">{dRows.slice(0, 300).map(d => (
          <button key={d.id} type="button" className="dcim-ex-tile" onClick={() => setDev(d.id)} style={{ borderTopColor: CAT_COLOR[d.category] }}>
            <span className="dcim-ex-tile-top"><b className="mono">{d.name.replace(`${d.dcId}-`, '')}</b><DcimStatusChip s={d.status} /></span>
            <small>{d.manufacturer} {d.model}</small>
            <small>{d.rackName} U{d.u} · {d.portsUp}/{d.ports} ports up{d.powerW ? ` · ${fmtNum(d.powerW)} W` : ''}</small>
          </button>))}{dRows.length > 300 && <p className="vw-label">First 300 of {fmtNum(dRows.length)}; filter to narrow down.</p>}</div>}</>}
      <DeviceDrawer id={dev} onClose={() => setDev(null)} />
    </div>
  );
}
