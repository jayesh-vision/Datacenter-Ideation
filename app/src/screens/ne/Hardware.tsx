import { useMemo, useState } from 'react';
import type { Interface, IfState } from '../../api/types';
import { Chip, Panel, SearchBox } from '../../ui/kit';
import { DataTable, type Col } from '../../ui/DataTable';
import { Meter, NeLink } from '../../ui/status';
import { fmtBw, fmtNum } from '../../lib/format';
import type { NeData } from './NetworkElement';

const IF_TONE: Record<IfState, 'success' | 'error' | 'neutral' | 'info'> = { up: 'success', down: 'error', 'admin-down': 'neutral', reserved: 'info' };

export function Hardware({ d }: { d: NeData }) {
  const { ne } = d;
  const [q, setQ] = useState('');
  const [st, setSt] = useState('');
  const [ty, setTy] = useState('');
  const types = [...new Set(d.interfaces.map(i => i.type))];
  const rows = useMemo(() => d.interfaces.filter(i => (!st || i.state === st) && (!ty || i.type === ty) && (!q || `${i.name} ${i.description} ${i.peer?.neId ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [d.interfaces, q, st, ty]);
  const nd = ne.discovery === 'not-discovered';

  const cols: Col<Interface>[] = [
    { key: 'name', header: 'Interface', render: i => <span className="mono strong">{i.name}</span>, sort: i => i.name },
    { key: 'type', header: 'Type', render: i => <span className="nowrap" title={fmtBw(i.speedMbps)}>{i.type}</span>, sort: i => i.speedMbps },
    { key: 'state', header: 'State', render: i => <Chip tone={IF_TONE[i.state]} size="xs">{i.state}</Chip>, sort: i => i.state },
    { key: 'util', header: 'Utilisation', render: i => (i.state === 'up' ? <Meter pct={i.utilPct} width={60} /> : <span className="faint">—</span>), sort: i => i.utilPct },
    { key: 'err', header: 'In / CRC errors', align: 'right', render: i => <span className={`num ${i.crcErrors > 100 || i.inErrors > 100 ? 'bad' : i.inErrors ? 'warn' : 'faint'}`}>{fmtNum(i.inErrors)} / {fmtNum(i.crcErrors)}</span>, sort: i => i.inErrors + i.crcErrors },
    { key: 'flaps', header: 'Flaps 24 h', align: 'right', render: i => <span className={`num ${i.flaps24h >= 3 ? 'bad' : 'faint'}`}>{i.flaps24h}</span>, sort: i => i.flaps24h },
    { key: 'rx', header: 'Optics Rx', align: 'right', render: i => (i.optics ? <span className={`num ${i.optics.rxDbm < -10 ? 'bad' : i.optics.rxDbm < -8 ? 'warn' : ''}`} title={`${i.optics.model} · Tx ${i.optics.txDbm} dBm · ${i.optics.tempC}°C`}>{i.optics.rxDbm} dBm</span> : <span className="faint">—</span>), sort: i => i.optics?.rxDbm ?? 0 },
    { key: 'desc', header: 'Description', render: i => <span className="ellipsis ne-desc" title={i.description}>{i.description || <span className="faint">—</span>}</span> },
    { key: 'peer', header: 'Peer', render: i => (i.peer ? <span className="cell-2"><NeLink id={i.peer.neId} /><small className="mono">{i.peer.ifName}</small></span> : <span className="faint">—</span>) }
  ];

  return (
    <>
      <Panel title="Modules" sub={nd ? 'From the planned record — no hardware inventory reported yet' : `Reported by ${ne.collector}`} count={ne.modules.length || undefined}>
        {ne.modules.length ? (
          <table className="nst-table ne-mini">
            <thead><tr><th>Slot</th><th>Module</th><th>Serial</th><th className="is-right">Temperature</th><th>State</th></tr></thead>
            <tbody>{ne.modules.map(m => <tr key={m.slot}><td className="mono">{m.slot}</td><td>{m.name}</td><td className="mono">{m.serial}</td><td className={`is-right num ${m.tempC >= 55 ? 'bad' : ''}`}>{m.tempC}°C</td><td><Chip tone={m.state === 'OK' ? 'success' : m.state === 'Fault' ? 'error' : 'neutral'} size="xs">{m.state}</Chip></td></tr>)}</tbody>
          </table>
        ) : <p className="muted" style={{ margin: 0, fontSize: 13 }}>No module inventory until the device is discovered. Planned ports are listed below.</p>}
      </Panel>
      <section className="card">
        <DataTable rows={rows} cols={cols} pageSize={40} defaultSort={undefined}
          toolbar={<div className="toolbar" style={{ width: '100%' }}>
            <span className="dt-count">{rows.length} of {d.interfaces.length} interfaces</span>
            <SearchBox value={q} onChange={setQ} placeholder="Interface, description, peer" width={260} />
            <select className="select" value={st} onChange={e => setSt(e.target.value)} aria-label="State"><option value="">All states</option>{(['up', 'down', 'admin-down', 'reserved'] as const).map(s => <option key={s} value={s}>{s} ({d.interfaces.filter(i => i.state === s).length})</option>)}</select>
            <select className="select" value={ty} onChange={e => setTy(e.target.value)} aria-label="Type"><option value="">All types</option>{types.map(t => <option key={t}>{t}</option>)}</select>
            <span className="grow" />
            <span className="faint" style={{ fontSize: 12 }}>Rx below −10 dBm is flagged red</span>
          </div>} />
      </section>
    </>
  );
}
