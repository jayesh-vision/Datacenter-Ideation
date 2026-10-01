import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getNetworkElements, useQuery } from '../../api';
import { DataTable, type Col } from '../../ui/DataTable';
import { SearchBox } from '../../ui/kit';
import { DiscoveryChip, NeLink } from '../../ui/status';
import { DISCOVERY, ND_REASON, scoreColor } from '../../lib/vocab';
import { Loading } from '../../shell/page';

type Row = Awaited<ReturnType<typeof getNetworkElements>>[number];

export function Elements({ dcId }: { dcId: string }) {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const role = sp.get('role') ?? '', disc = sp.get('disc') ?? '', reason = sp.get('reason') ?? '', q = sp.get('q') ?? '';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); if (k === 'disc' && v !== 'not-discovered') n.delete('reason'); setSp(n, { replace: true }); };
  const { data } = useQuery(() => getNetworkElements({ dcId }), [dcId]);
  const rows = useMemo(() => (data ?? []).filter(n => (!role || n.role === role) && (!disc || n.discovery === disc) && (!reason || n.ndReason === reason)
    && (!q || `${n.id} ${n.ip} ${n.serial} ${n.model} ${n.vendor}`.toLowerCase().includes(q.toLowerCase()))), [data, role, disc, reason, q]);
  if (!data) return <Loading label="Loading network elements" />;
  const roles = [...new Set(data.map(n => n.role))];

  const cols: Col<Row>[] = [
    { key: 'name', header: 'Name', render: n => <NeLink id={n.id}>{n.id.replace(`${dcId}-`, '')}</NeLink>, sort: n => n.id },
    { key: 'role', header: 'Role', render: n => <span className="cell-2">{n.role}<small style={{ textTransform: 'capitalize' }}>{n.layer}{n.isPe ? ' · PE' : ''}</small></span>, sort: n => n.role },
    { key: 'vendor', header: 'Vendor / model', render: n => <span className="cell-2">{n.model}<small>{n.vendor}</small></span>, sort: n => `${n.vendor} ${n.model}` },
    { key: 'os', header: 'OS', render: n => <span className="mono nowrap" style={{ fontSize: 12.5 }}>{n.os}</span> },
    { key: 'ip', header: 'Mgmt IP', render: n => <span className="mono">{n.ip}</span> },
    { key: 'rack', header: 'Rack · U', render: n => <span className="mono nowrap">{n.rack} · U{n.u}</span>, sort: n => n.rackId },
    { key: 'disc', header: 'Discovery', render: n => <span className="cell-2"><DiscoveryChip s={n.discovery} size="xs" />{n.discovery === 'not-discovered' && n.ndReason && <small>{ND_REASON[n.ndReason]}</small>}{n.discovery === 'drifted' && n.drift && <small>{n.drift.map(d => d.attr).join(', ')}</small>}</span>, sort: n => n.discovery },
    { key: 'health', header: 'Health', align: 'right', render: n => n.discovery === 'not-discovered' ? <span className="faint">—</span> : <span className="num strong" style={{ color: scoreColor(n.healthScore) }}>{Math.round(n.healthScore)}</span>, sort: n => n.healthScore },
    { key: 'alarms', header: 'Alarms', align: 'right', render: n => <span className={`num ${n.alarms ? 'bad' : 'faint'}`}>{n.alarms}</span>, sort: n => n.alarms }
  ];

  return (
    <section className="card">
      <DataTable rows={rows} cols={cols} onRow={n => nav(`/ne/${n.id}`)} defaultSort={{ key: 'name', dir: 'asc' }} pageSize={25}
        toolbar={
          <div className="toolbar" style={{ width: '100%' }}>
            <span className="dt-count">Showing {rows.length} of {data.length}</span>
            <SearchBox value={q} onChange={v => set('q', v)} placeholder="Name, IP, serial, model" width={260} />
            <select className="select" value={role} onChange={e => set('role', e.target.value)} aria-label="Role"><option value="">All roles</option>{roles.map(r => <option key={r} value={r}>{r}</option>)}</select>
            <select className="select" value={disc} onChange={e => set('disc', e.target.value)} aria-label="Discovery">
              <option value="">Any discovery state</option>{(Object.keys(DISCOVERY) as (keyof typeof DISCOVERY)[]).map(k => <option key={k} value={k}>{DISCOVERY[k].label}</option>)}
            </select>
            {disc === 'not-discovered' && <select className="select" value={reason} onChange={e => set('reason', e.target.value)} aria-label="Reason"><option value="">Any reason</option>{Object.entries(ND_REASON).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
            {(role || disc || q || reason) && <button type="button" className="panel-link" onClick={() => { ['role', 'disc', 'q', 'reason'].forEach(k => sp.delete(k)); setSp(new URLSearchParams(sp), { replace: true }); }}><I.X size={13} />Clear</button>}
          </div>
        } />
    </section>
  );
}
