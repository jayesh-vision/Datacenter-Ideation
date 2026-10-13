import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import * as I from 'lucide-react';
import { getNetworkElements, useQuery, usePersona } from '../../api';
import { Panel } from '../../ui/kit';
import { Stat } from './Metrics';
import { Meter } from '../../ui/status';
import { Donut } from '../../charts/Donut';
import { SummaryStrip } from './SummaryStrip';
import { fmtNum } from '../../lib/format';
import type { SiteData } from './Site';
import { SiteLifecycle } from '../physical/phase2';

const PALETTE = ['#1C81EF', '#0d9488', '#7c3aed', '#db2777', '#0891b2', '#64748b'];
const ROLE_LABEL: Record<string, string> = { Router: 'Routers', Switch: 'Switches', Firewall: 'Firewalls', DWDM: 'DWDM / optical', Access: 'Access', Server: 'Servers', Storage: 'Storage arrays', GPU: 'GPU nodes', 'Tenant gear': 'Tenant equipment' };
const CAT_LABEL: Record<string, string> = { network: 'Network', compute: 'Compute', storage: 'Storage', tenant: 'Tenant-owned' };

/* Site composition — floors, rooms, racks and space, installed equipment by
   category, facility assets, ports and pooled compute. Installed devices only
   (planned devices hold reserved rack space and are counted separately). */
export function Assets({ data }: { data: SiteData }) {
  const { dc, summary: s } = data;
  const { persona, vocab } = usePersona();
  const { data: nes } = useQuery(() => getNetworkElements({ dcId: dc.id }), [dc.id]);

  const a = useMemo(() => {
    const inst = (nes ?? []).filter(n => n.opsState !== 'planned');
    const planned = (nes ?? []).length - inst.length;
    const byRole = Object.entries(inst.reduce<Record<string, number>>((m, n) => { m[n.role] = (m[n.role] ?? 0) + 1; return m; }, {})).sort((x, y) => y[1] - x[1]);
    const byLayer = Object.entries(inst.reduce<Record<string, number>>((m, n) => { m[n.layer] = (m[n.layer] ?? 0) + 1; return m; }, {})).sort((x, y) => y[1] - x[1]);
    const byCat = Object.entries(inst.reduce<Record<string, number>>((m, n) => { m[n.category] = (m[n.category] ?? 0) + 1; return m; }, {})).sort((x, y) => y[1] - x[1]);
    const usedU = dc.racks.reduce((t, r) => t + r.usedU, 0), totU = dc.racks.reduce((t, r) => t + r.heightU, 0);
    const rooms = dc.floors.flatMap(f => f.rooms.map(rm => {
      const rs = dc.racks.filter(r => r.floor === f.name && r.room === rm);
      return { floor: f.name, room: rm, racks: rs.length, used: rs.reduce((t, r) => t + r.usedU, 0), total: rs.reduce((t, r) => t + r.heightU, 0), kw: Math.round(rs.reduce((t, r) => t + r.drawKw, 0) * 10) / 10, devices: inst.filter(n => rs.some(r => r.id === n.rackId)).length };
    }));
    const units = dc.cooling.units.reduce<Record<string, number>>((m, u) => { m[u.type] = (m[u.type] ?? 0) + 1; return m; }, {});
    const facility = [
      { k: 'UPS units', v: dc.power.ups.length, sub: `${dc.power.ups[0]?.redundancy ?? '—'} · ${fmtNum(dc.power.ups.reduce((t, u) => t + u.capacityKw, 0))} kW`, icon: I.BatteryCharging },
      { k: 'Rectifier plants', v: dc.power.feeds.filter(f => f.type === 'DC').length, sub: '-48 V DC', icon: I.PlugZap },
      { k: 'DG sets', v: dc.status === 'planned' ? 0 : 1, sub: `${dc.power.dg.kva} kVA`, icon: I.Fuel },
      { k: 'Battery banks', v: 1, sub: `${dc.power.battery.volts} V · ${fmtNum(dc.power.battery.ah)} Ah`, icon: I.Battery },
      { k: 'Utility feeds', v: dc.power.feeds.filter(f => f.type === 'AC').length, sub: 'AC 415 V', icon: I.Zap },
      { k: 'Rack PDUs', v: dc.racks.length * 2, sub: 'A + B per rack', icon: I.Plug },
      ...Object.entries(units).map(([t, n]) => ({ k: `${t} units`, v: n, sub: `${dc.cooling.redundancy} cooling`, icon: I.Fan })),
      { k: 'Env sensors', v: dc.cooling.sensors.length, sub: 'temp · RH · smoke · leak', icon: I.Thermometer }
    ];
    const fullest = [...dc.racks].sort((x, y) => y.usedU / y.heightU - x.usedU / x.heightU)[0];
    return { inst, planned, byRole, byLayer, byCat, usedU, totU, rooms, facility, fullest };
  }, [nes, dc]);
  if (!nes) return null;
  const c = dc.compute;

  return (
    <div className="col" style={{ gap: 16 }}>
      <SummaryStrip items={[
        { key: 'fl', label: 'Floors', value: dc.floors.length, sub: `${a.rooms.length} rooms`, info: 'Floors in the building and the rooms (data halls, meet-me rooms, plant rooms) across them.' },
        { key: 'rk', label: 'Racks', value: dc.racks.length, sub: `${dc.racks.filter(r => r.usedU === 0).length} empty`, info: 'Racks on the floor plan; empty = no equipment installed or planned in them yet.' },
        { key: 'u', label: 'Rack space used', value: `${fmtNum(a.usedU)} U`, sub: `${fmtNum(a.totU - a.usedU)} U free`, info: 'Rack units occupied across every rack, including space reserved for planned devices, and the units still free.' },
        { key: 'ne', label: persona === 'network' ? 'Network devices' : persona === 'colocation' ? 'Devices & tenant blocks' : 'Hosts & network devices', value: a.inst.length, sub: a.planned ? `+${a.planned} planned` : 'all installed', info: `${vocab.equipment} physically installed at the site; planned devices are not counted here but hold reserved rack space.` },
        { key: 'fac', label: 'Facility assets', value: a.facility.reduce((t, f) => t + f.v, 0), sub: 'power · cooling', info: 'Count of plant items: UPS units, rectifier plants, DG sets, battery banks, utility feeds, rack PDUs (A + B per rack), cooling units and environment sensors, as listed in Facility assets below.' },
        { key: 'pt', label: 'Ports in use', value: fmtNum(s.portsUsed), sub: `of ${fmtNum(s.portsTotal)}`, info: 'Ports on installed equipment that are patched or in use, out of all ports at the site.' }
      ]} />

      <div className="grid g-2 mx-row">
        <Panel title="Space by room" icon={I.Building2} sub="Racks, U used / free and draw per room" flush actions={<Link className="ent-link" to={`/dcim?tab=floorplan&dc=${dc.id}`}>Floor plans in DCIM →</Link>} info="Each room with its racks, U-space used out of total, installed devices and power draw (sum of its racks). Below: the fullest rack by U fill, the average draw per rack and how many planned devices hold reserved space.">
          <table className="nst-table mx-table">
            <thead><tr><th>Floor · room</th><th className="is-right">Racks</th><th>U used / total</th><th className="is-right">Devices</th><th className="is-right">Draw</th></tr></thead>
            <tbody>{a.rooms.map(r => (
              <tr key={r.floor + r.room}><td>{r.floor} · {r.room}</td><td className="is-right num">{r.racks}</td>
                <td>{r.total ? <Meter pct={(r.used / r.total) * 100} width={90} label={`${r.used} / ${r.total}`} /> : <span className="faint">no racks</span>}</td>
                <td className="is-right num">{r.devices}</td><td className="is-right num">{r.kw} kW</td></tr>
            ))}</tbody>
            <tfoot><tr><td>Total</td><td className="is-right num">{dc.racks.length}</td><td className="num">{fmtNum(a.usedU)} / {fmtNum(a.totU)} U</td><td className="is-right num">{a.rooms.reduce((t, r) => t + r.devices, 0)}</td><td className="is-right num">{Math.round(a.rooms.reduce((t, r) => t + r.kw, 0) * 10) / 10} kW</td></tr></tfoot>
          </table>
          <div className="asset-room-stats"><div className="mx-stats">
            <Stat l="Fullest rack" v={a.fullest ? a.fullest.id.replace(`${dc.id}-`, '') : '—'} sub={a.fullest ? `${Math.round((a.fullest.usedU / a.fullest.heightU) * 100)}% · ${a.fullest.floor} · ${a.fullest.room}` : undefined} />
            <Stat l="Avg draw / rack" v={`${Math.round((dc.racks.reduce((t, r) => t + r.drawKw, 0) / Math.max(1, dc.racks.length)) * 10) / 10} kW`} sub="installed racks" />
            <Stat l="Planned (reserved)" v={`${a.planned} devices`} sub="space reserved" />
          </div></div>
        </Panel>

        <Panel title={`${vocab.equipment} by category`} icon={I.Router} sub={`${a.inst.length} installed devices`} info={`Installed ${vocab.equipment.toLowerCase()} by role (routers, switches, servers, GPU nodes…) in the donut, and by ${persona === 'network' ? 'network layer' : 'category (network, compute, storage, tenant-owned)'} in the tiles, each with its share of the installed total.`}>
          <div className="asset-split">
            <Donut size={150} centerValue={String(a.inst.length)} centerLabel="devices" slices={a.byRole.map(([k, v], i) => ({ key: k, label: ROLE_LABEL[k] ?? k, value: v, color: PALETTE[i % PALETTE.length] }))} />
            <div className="asset-layers">
              <span className="vw-label">{persona === 'network' ? 'By network layer' : 'By category'}</span>
              <div className="asset-tiles">{(persona === 'network' ? a.byLayer : a.byCat).map(([k, v]) => <Stat key={k} l={persona === 'network' ? k[0].toUpperCase() + k.slice(1) : CAT_LABEL[k] ?? k} v={String(v)} sub={`${Math.round((v / Math.max(1, a.inst.length)) * 100)}%`} />)}</div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid g-2 mx-row">
        <Panel title="Facility assets" icon={I.Zap} sub="Power, cooling and environmental plant" info="The plant installed at the site with its headline rating: UPS units and total kW, −48 V rectifier plants, DG set, battery bank, AC utility feeds, rack PDUs (two per rack), cooling units by type and environment sensors.">
          <div className="asset-fac">
            {a.facility.map(f => (
              <div key={f.k} className="vw-card-child asset-fac-item">
                <span className="asset-fac-ic"><f.icon size={16} /></span>
                <span className="asset-fac-main"><span className="vw-label">{f.k}</span><span className="vw-card-metric-sm">{f.v}</span><span className="vw-label asset-fac-sub">{f.sub}</span></span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Ports & compute" icon={I.Cpu} sub="Port classes and pooled compute (no per-server records in this model)" info="Fill of each port class (used out of total), then the site's pooled compute: CPU cores, memory and storage in use out of installed. Compute is a site-level pool, not a per-server inventory.">
          <div className="asset-ports">
            {dc.ports.map(p => <div key={p.cls} className="asset-layer"><span>{p.cls}</span><Meter pct={(p.used / Math.max(1, p.total)) * 100} width={84} label={`${fmtNum(p.used)} / ${fmtNum(p.total)}`} /></div>)}
            <span className="vw-label" style={{ marginTop: 8 }}>Compute & storage</span>
            <div className="asset-layer"><span>CPU cores</span><Meter pct={(c.cpuUsed / c.cpuCores) * 100} width={84} label={`${fmtNum(c.cpuUsed)} / ${fmtNum(c.cpuCores)}`} /></div>
            <div className="asset-layer"><span>Memory</span><Meter pct={(c.memUsed / c.memGb) * 100} width={84} label={`${fmtNum(Math.round(c.memUsed / 1024))} / ${fmtNum(Math.round(c.memGb / 1024))} TB`} /></div>
            <div className="asset-layer"><span>Storage</span><Meter pct={(c.storageUsed / c.storageTb) * 100} width={84} label={`${fmtNum(c.storageUsed)} / ${fmtNum(c.storageTb)} TB`} /></div>
          </div>
        </Panel>
      </div>
      {dc.status !== 'planned' && <SiteLifecycle dcId={dc.id} />}
    </div>
  );
}
