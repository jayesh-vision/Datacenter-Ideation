import { useMemo, useState } from 'react';
import type { Interface, IfState } from '../../api/types';
import { Chip, Panel } from '../../ui/kit';
import { ListToolbar } from '../../ui/ListToolbar';
import { DataTable, type Col } from '../../ui/DataTable';
import { Meter, NeLink } from '../../ui/status';
import { fmtBw, fmtNum } from '../../lib/format';
import type { NeData } from './NetworkElement';
import { DeviceLifecycle } from '../physical/phase2';

const IF_TONE: Record<IfState, 'success' | 'error' | 'neutral' | 'info'> = { up: 'success', down: 'error', 'admin-down': 'neutral', reserved: 'info' };
const STATE_RANK: Record<IfState, number> = { down: 0, up: 1, reserved: 2, 'admin-down': 3 };
type View = 'all' | 'down' | 'errors';

export function Hardware({ d }: { d: NeData }) {
  const { ne } = d;
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>('all');
  const [ty, setTy] = useState('');
  const types = [...new Set(d.interfaces.map(i => i.type))];
  const hasErr = (i: Interface) => i.inErrors > 0 || i.crcErrors > 0 || i.flaps24h > 0 || (i.optics ? i.optics.rxDbm < -10 : false);
  const rows = useMemo(() => d.interfaces.filter(i => (view === 'all' || (view === 'down' ? i.state === 'down' : hasErr(i))) && (!ty || i.type === ty) && (!q || `${i.name} ${i.description} ${i.peer?.neId ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [d.interfaces, q, view, ty]);
  const nd = ne.discovery === 'not-discovered';
  const nDown = d.interfaces.filter(i => i.state === 'down').length, nErr = d.interfaces.filter(hasErr).length;

  const cols: Col<Interface>[] = [
    { key: 'name', header: 'Interface', render: i => <span className="mono strong">{i.name}</span>, sort: i => i.name },
    { key: 'state', header: 'State', render: i => <Chip tone={IF_TONE[i.state]} size="xs">{i.state}</Chip>, sort: i => STATE_RANK[i.state] },
    { key: 'type', header: 'Type', render: i => <span className="nowrap" title={fmtBw(i.speedMbps)}>{i.type}</span>, sort: i => i.speedMbps },
    { key: 'util', header: 'Utilisation', render: i => (i.state === 'up' ? <Meter pct={i.utilPct} width={60} /> : <span className="faint">—</span>), sort: i => i.utilPct },
    { key: 'err', header: 'In / CRC errors', align: 'right', render: i => <span className={`num ${i.crcErrors > 100 || i.inErrors > 100 ? 'bad' : i.inErrors ? 'warn' : 'faint'}`}>{fmtNum(i.inErrors)} / {fmtNum(i.crcErrors)}</span>, sort: i => i.inErrors + i.crcErrors },
    { key: 'flaps', header: 'Flaps 24 h', align: 'right', render: i => <span className={`num ${i.flaps24h >= 3 ? 'bad' : 'faint'}`}>{i.flaps24h}</span>, sort: i => i.flaps24h },
    { key: 'rx', header: 'Optics Rx', align: 'right', render: i => (i.optics ? <span className={`num ${i.optics.rxDbm < -10 ? 'bad' : i.optics.rxDbm < -8 ? 'warn' : ''}`} title={`${i.optics.model} · Tx ${i.optics.txDbm} dBm · ${i.optics.tempC}°C`}>{i.optics.rxDbm} dBm</span> : <span className="faint">—</span>), sort: i => i.optics?.rxDbm ?? 0 },
    { key: 'desc', header: 'Description', wrap: true, render: i => <span className="ellipsis ne-desc" title={i.description}>{i.description || <span className="faint">—</span>}</span> },
    { key: 'peer', header: 'Peer', wrap: true, render: i => (i.peer ? <span className="cell-2"><NeLink id={i.peer.neId} /><small className="mono">{i.peer.ifName}</small></span> : <span className="faint">—</span>) }
  ];

  return (
    <>
      <Panel title="Modules" sub={nd ? 'From the planned record — no hardware inventory reported yet' : `Reported by ${ne.collector}`} count={ne.modules.length || undefined} info="Field-replaceable units the device reports (line cards, fans, PSUs, control modules) with slot, serial, temperature and state. 55°C or more is red; Fault is the module's own fault LED. Interfaces are listed below.">
        {ne.modules.length ? (
          <table className="nst-table ne-mini">
            <thead><tr><th>Slot</th><th>Module</th><th>Serial</th><th className="is-right">Temperature</th><th>State</th></tr></thead>
            <tbody>{ne.modules.map(m => <tr key={m.slot}><td className="mono">{m.slot}</td><td>{m.name}</td><td className="mono">{m.serial}</td><td className={`is-right num ${m.tempC >= 55 ? 'bad' : ''}`}>{m.tempC}°C</td><td><Chip tone={m.state === 'OK' ? 'success' : m.state === 'Fault' ? 'error' : 'neutral'} size="xs">{m.state}</Chip></td></tr>)}</tbody>
          </table>
        ) : <p className="vw-card-description" style={{ margin: 0 }}>No module inventory until the device reports telemetry. Planned ports are listed below.</p>}
      </Panel>
      <DeviceLifecycle neId={ne.id} />
      <section className="vw-card-section ne-hw" style={{ padding: 0, overflow: 'hidden' }}>
        <DataTable rows={rows} cols={cols} pageSize={40} defaultSort={{ key: 'state', dir: 'asc' }}
          toolbar={
            <ListToolbar shown={rows.length} total={d.interfaces.length}
              search={{ value: q, onChange: setQ, placeholder: 'Interface, description, peer' }}
              filters={[
                { id: 'view', label: 'Condition', quick: true, value: view, defaultValue: 'all', onChange: (v: string) => setView(v as View), options: [{ id: 'all', label: 'All interfaces', count: d.interfaces.length }, { id: 'down', label: 'Down', count: nDown }, { id: 'errors', label: 'With errors', count: nErr }] },
                { id: 'type', label: 'Type', quick: true, value: ty, anyLabel: 'Any type', onChange: setTy, options: types.map(t => ({ id: t, label: t, count: d.interfaces.filter(i => i.type === t).length })) }
              ]} />
          } />
      </section>
    </>
  );
}
