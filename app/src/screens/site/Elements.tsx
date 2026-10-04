import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getNetworkElements, useQuery } from '../../api';
import { DataTable, type Col } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
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
  const applyParams = useParamPatch();
  const role = sp.get('role') ?? '', q = sp.get('q') ?? '', view = (sp.get('view') ?? 'all') as View;
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v && v !== 'all' ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const { data, reload } = useQuery(() => getNetworkElements({ dcId }), [dcId]);
  const installed = useMemo(() => (data ?? []).filter(n => n.opsState !== 'planned'), [data]);
  const rows = useMemo(() => installed.filter(n => (!role || n.role === role)
    && (view === 'all' || (view === 'alarms' ? n.alarms > 0 : n.opsState === 'unmonitored'))
    && (!q || `${n.id} ${n.ip} ${n.serial} ${n.model} ${n.vendor}`.toLowerCase().includes(q.toLowerCase()))), [installed, role, view, q]);
  if (!data) return <Loading label="Loading equipment" />;
  const roles = [...new Set(installed.map(n => n.role))];
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
          <ListToolbar onApply={applyParams} shown={rows.length} total={installed.length} onRefresh={reload}
            search={{ value: q, onChange: v => set('q', v), placeholder: 'Device, IP, serial, model' }}
            filters={[
              { id: 'view', label: 'Condition', quick: true, value: view, defaultValue: 'all', onChange: v => set('view', v), options: [{ id: 'all', label: 'All devices', count: installed.length }, { id: 'alarms', label: 'With alarms', count: installed.filter(n => n.alarms).length }, { id: 'unmonitored', label: 'Not monitored', count: unmon }] },
              { id: 'role', label: 'Role', quick: true, value: role, anyLabel: 'Any role', onChange: v => set('role', v), options: roles.map(r => ({ id: r, label: r, count: installed.filter(n => n.role === r).length })) }
            ]} />
        } />
    </section>
  );
}
