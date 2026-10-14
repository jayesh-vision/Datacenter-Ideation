/* DCIM Explorer (14-Oct-2026, P2B gap fill): ask the inventory a question — racks or devices, filtered by site, hall, power band,
   cooling, density, status, owner, category, manufacturer — and see the answer as a table or as tiles. Views can be saved (this
   browser only) and every answer exports to CSV. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { getDcim, getDcimDevices, useQuery } from '../../api';
import type { DcimDevice, DcimRack } from '../../api/types';
import { Loading } from '../../shell/page';
import { Btn, Chip, Seg } from '../../ui/kit';
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

  const rRows = useMemo(() => racks.filter(r => (!q.site || r.dcId === q.site) && (!q.hall || r.hallName === q.hall) && (!q.band || band(r.powerPct) === q.band) && (!q.cool || (q.cool === 'liquid' ? r.liquid : !r.liquid))
    && (!q.density || r.density === q.density) && (!q.status || r.status === q.status) && (!q.owner || r.owner === q.owner) && (!q.free || r.freeU >= Number(q.free)) && (!q.text || `${r.name} ${r.role} ${r.tenantName ?? ''}`.toLowerCase().includes(q.text.toLowerCase()))), [racks, q]);
  const dRows = useMemo(() => devices.filter(d => (!q.site || d.dcId === q.site) && (!q.hall || d.hallName === q.hall) && (!q.cat || d.category === q.cat) && (!q.status || d.status === q.status) && (!q.mfr || d.manufacturer === q.mfr)
    && (!q.text || `${d.name} ${d.model} ${d.rackName} ${d.serial}`.toLowerCase().includes(q.text.toLowerCase()))), [devices, q]);
  if (!data || !devs) return <Loading />;

  const uniq = <T,>(xs: T[], f: (x: T) => string) => [...new Set(xs.map(f))].filter(Boolean).sort();
  const sel = (k: string, label: string, options: { id: string; label: string }[]) => (
    <label className={`dcim-ex-f${q[k] ? ' is-on' : ''}`}><span>{label}</span><select className="select" value={q[k] ?? ''} onChange={e => set(k, e.target.value)}><option value="">Any</option>{options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
  );
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
  const active = Object.keys(q).length;

  return (
    <div className="dcim-ex">
      <section className="vw-card-section dcim-ex-bar">
        <div className="dcim-ex-top">
          <Seg value={entity} onChange={v => { setEntity(v as Entity); setQ(x => (x.site ? { site: x.site } : {}) as Q); }} options={[{ id: 'racks', label: `Racks ${racks.length}` }, { id: 'devices', label: `Devices ${devices.length}` }]} />
          <span className="dcim-ex-search"><I.Search size={14} /><input value={q.text ?? ''} onChange={e => set('text', e.target.value)} placeholder={entity === 'racks' ? 'Rack, role, tenant' : 'Device, model, rack, serial'} /></span>
          <span style={{ flex: 1 }} />
          <Seg size="sm" value={view} onChange={v => setView(v as 'table')} options={[{ id: 'table', label: 'Table', icon: I.Table2 }, { id: 'visual', label: 'Tiles', icon: I.LayoutGrid }]} />
          <Btn icon={I.Download} onClick={exportCsv} disabled={!rows.length}>Export CSV</Btn>
        </div>
        <div className="dcim-ex-filters">
          {!dcId && sel('site', 'Site', uniq(racks, r => r.dcId).map(x => ({ id: x, label: x })))}
          {sel('hall', 'Hall', uniq(racks.filter(r => !q.site || r.dcId === q.site), r => r.hallName).map(x => ({ id: x, label: x })))}
          {entity === 'racks' ? <>
            {sel('band', 'Power band', ['hot', 'mid', 'low'].map(x => ({ id: x, label: BAND_LABEL[x] })))}
            {sel('cool', 'Cooling', [{ id: 'liquid', label: 'Liquid cooled' }, { id: 'air', label: 'Air only' }])}
            {sel('density', 'Density', ['Standard', 'High', 'AI'].map(x => ({ id: x, label: x })))}
            {sel('owner', 'Owner', [{ id: 'operator', label: 'Operator' }, { id: 'tenant', label: 'Tenant' }])}
            {sel('free', 'Free space', [1, 4, 8, 16].map(x => ({ id: String(x), label: `≥ ${x} U free` })))}
            {sel('status', 'Status', uniq(racks, r => r.status).map(x => ({ id: x, label: x })))}
          </> : <>
            {sel('cat', 'Category', uniq(devices, d => d.category).map(x => ({ id: x, label: CAT_LABEL[x as DcimDevice['category']] })))}
            {sel('mfr', 'Manufacturer', uniq(devices, d => d.manufacturer).map(x => ({ id: x, label: x })))}
            {sel('status', 'Status', uniq(devices, d => d.status).map(x => ({ id: x, label: x })))}
          </>}
          {active > 0 && <button type="button" className="ent-link" onClick={() => setQ({})}>Clear {active} filter{active === 1 ? '' : 's'}</button>}
        </div>
        <div className="dcim-ex-views">
          <span className="vw-label"><I.Bookmark size={13} /> Saved views</span>
          {saved.map(v => (
            <span key={v.name} className="dcim-ex-view"><button type="button" onClick={() => { setEntity(v.entity); setQ(v.q); }}>{v.name}<small>{v.entity}</small></button>
              <button type="button" aria-label={`Delete ${v.name}`} onClick={() => { const n = saved.filter(x => x.name !== v.name); setSaved(n); store(n); }}><I.X size={12} /></button></span>))}
          {!saved.length && <span className="vw-label">none yet</span>}
          {naming === null ? <Btn size="sm" icon={I.Plus} onClick={() => setNaming('')} disabled={!active}>Save this view</Btn>
            : <span className="dcim-ex-name"><input className="input" autoFocus value={naming} onChange={e => setNaming(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setNaming(null); }} placeholder="View name" /><Btn size="sm" variant="filled" onClick={save} disabled={!naming.trim()}>Save</Btn><Btn size="sm" onClick={() => setNaming(null)}>Cancel</Btn></span>}
        </div>
      </section>

      <div className="dcim-ex-count"><b>{fmtNum(rows.length)}</b> {entity} match{rows.length === 1 ? 'es' : ''}{entity === 'racks' && rRows.length > 0 && <span className="vw-label"> · {fmtNum(rRows.reduce((a, r) => a + r.freeU, 0))} U free · {Math.round(rRows.reduce((a, r) => a + r.drawKw, 0))} of {Math.round(rRows.reduce((a, r) => a + r.budgetKw, 0))} kW drawn</span>}
        {entity === 'devices' && dRows.length > 0 && <span className="vw-label"> · {fmtNum(Math.round(dRows.reduce((a, d) => a + d.powerW, 0) / 1000))} kW drawn · {fmtNum(dRows.filter(d => d.status === 'Planned').length)} planned</span>}</div>

      {view === 'table' ? <section className="vw-card-section dcim-table">
        {entity === 'racks' ? <DataTable rows={rRows} cols={rCols} pageSize={30} defaultSort={{ key: 'p', dir: 'desc' }} onRow={r => nav(`/dcim/racks/${encodeURIComponent(r.id)}`)} empty={<p className="vw-label" style={{ padding: 16 }}>No racks match these filters.</p>} />
          : <DataTable rows={dRows} cols={dCols} pageSize={30} defaultSort={{ key: 'n', dir: 'asc' }} onRow={d => setDev(d.id)} empty={<p className="vw-label" style={{ padding: 16 }}>No devices match these filters.</p>} />}
      </section> : entity === 'racks' ? <div className="dcim-ex-tiles">{rRows.slice(0, 300).map(r => (
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
          </button>))}{dRows.length > 300 && <p className="vw-label">First 300 of {fmtNum(dRows.length)}; filter to narrow down.</p>}</div>}
      <DeviceDrawer id={dev} onClose={() => setDev(null)} />
    </div>
  );
}
