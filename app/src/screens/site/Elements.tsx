import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getNetworkElements, useQuery } from '../../api';
import { DataTable, type Col } from '../../ui/DataTable';
import { SearchBox, Seg } from '../../ui/kit';
import { NeLink } from '../../ui/status';
import { scoreColor } from '../../lib/vocab';
import { Loading } from '../../shell/page';

type Row = Awaited<ReturnType<typeof getNetworkElements>>[number];
type View = 'all' | 'alarms' | 'unmonitored';

/* Equipment installed at the site — the same devices the 3D twin places in
   its racks. Planned devices only reserve rack space and are not listed. */
export function Elements({ dcId }: { dcId: string }) {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const role = sp.get('role') ?? '', q = sp.get('q') ?? '', view = (sp.get('view') ?? 'all') as View;
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v && v !== 'all' ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const { data } = useQuery(() => getNetworkElements({ dcId }), [dcId]);
  const installed = useMemo(() => (data ?? []).filter(n => n.opsState !== 'planned'), [data]);
  const rows = useMemo(() => installed.filter(n => (!role || n.role === role)
    && (view === 'all' || (view === 'alarms' ? n.alarms > 0 : n.opsState === 'unmonitored'))
    && (!q || `${n.id} ${n.ip} ${n.serial} ${n.model} ${n.vendor}`.toLowerCase().includes(q.toLowerCase()))), [installed, role, view, q]);
  if (!data) return <Loading label="Loading equipment" />;
  const roles = [...new Set(installed.map(n => n.role))];
  const planned = data.length - installed.length;
  const unmon = installed.filter(n => n.opsState === 'unmonitored').length;

  const cols: Col<Row>[] = [
    { key: 'name', header: 'Device', render: n => <span className="cell-2"><NeLink id={n.id}>{n.id.replace(`${dcId}-`, '')}</NeLink><small>{n.opsState === 'tenant-owned' ? `${n.tenant ?? 'Tenant'} · ${n.model}` : `${n.role} · ${n.layer}${n.isPe ? ' · PE' : ''}`}</small></span>, sort: n => n.id },
    { key: 'vendor', header: 'Vendor / model', render: n => <span className="cell-2">{n.model}<small>{n.vendor} · {n.os}</small></span>, sort: n => `${n.vendor} ${n.model}` },
    { key: 'rack', header: 'Rack · U', render: n => <span className="mono nowrap">{n.rack} · U{n.u}</span>, sort: n => n.rackId },
    { key: 'state', header: 'Monitoring', render: n => n.opsState === 'tenant-owned'
      ? <span className="cell-2"><span className="vw-chip vw-chip--neutral cmd-chip" style={{ alignSelf: 'flex-start' }}>Tenant-owned</span><small>power &amp; environment only</small></span>
      : n.opsState === 'unmonitored'
      ? <span className="cell-2"><span className="vw-chip vw-chip--warning cmd-chip" style={{ alignSelf: 'flex-start' }}>Not monitored</span><small>no telemetry</small></span>
      : <span className="cell-2"><span className="vw-chip vw-chip--neutral cmd-chip" style={{ alignSelf: 'flex-start' }}>In service</span><small className="mono">{n.ip}</small></span>, sort: n => n.opsState },
    { key: 'health', header: 'Health', align: 'right', render: n => n.opsState !== 'in-service' ? <span className="faint">—</span> : <span className="num strong" style={{ color: n.healthScore < 80 ? scoreColor(n.healthScore) : undefined }}>{Math.round(n.healthScore)}</span>, sort: n => n.healthScore },
    { key: 'load', header: 'CPU · mem · temp', render: n => n.opsState !== 'in-service' ? <span className="faint">—</span> : <span className="num nowrap">{n.cpu}% · {n.mem}% · {n.tempC}°C</span>, sort: n => n.cpu },
    { key: 'alarms', header: 'Alarms', align: 'right', render: n => <span className={`num ${n.alarms ? 'bad' : 'faint'}`}>{n.alarms}</span>, sort: n => n.alarms }
  ];

  return (
    <section className="card">
      <DataTable rows={rows} cols={cols} onRow={n => nav(`/ne/${n.id}`)} defaultSort={{ key: 'alarms', dir: 'desc' }} pageSize={25}
        toolbar={
          <div className="toolbar" style={{ width: '100%' }}>
            <span className="dt-count">Showing {rows.length} of {installed.length}</span>
            <SearchBox value={q} onChange={v => set('q', v)} placeholder="Device, IP, serial, model" width={240} />
            <Seg size="sm" value={view} onChange={v => set('view', v)} options={[
              { id: 'all', label: `All ${installed.length}` }, { id: 'alarms', label: `With alarms ${installed.filter(n => n.alarms).length}` }, { id: 'unmonitored', label: `Not monitored ${unmon}` }
            ]} />
            <select className="select" value={role} onChange={e => set('role', e.target.value)} aria-label="Role"><option value="">All roles</option>{roles.map(r => <option key={r} value={r}>{r}</option>)}</select>
            {(role || q || view !== 'all') && <button type="button" className="panel-link" onClick={() => { ['role', 'q', 'view'].forEach(k => sp.delete(k)); setSp(new URLSearchParams(sp), { replace: true }); }}><I.X size={13} />Clear</button>}
            <span className="grow" />
            {planned > 0 && <span className="vw-label" title="Planned devices hold reserved rack space only; they appear as outlines in the 3D view">{planned} planned devices not installed</span>}
          </div>
        } />
    </section>
  );
}
