import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getNetworkElement, useQuery, getGpuNode } from '../../api';
import type { NetworkElement as Ne } from '../../api/types';
import { usePage, Loading } from '../../shell/page';
import { Btn, Chip, Drawer, Tabs } from '../../ui/kit';
import { Meter } from '../../ui/status';
import { ND_REASON } from '../../lib/vocab';
import { fmtDateTime, fmtUptime } from '../../lib/format';
import { NotFound } from '../NotFound';
import { GpuNodeDetail } from '../Gpu';
import { Overview } from './Overview';
import { Hardware } from './Hardware';
import { Links } from './Links';
import { Impact } from './Impact';
import { NeAlerts } from './NeAlerts';
import '../../styles/ne.css';

export type NeData = NonNullable<Awaited<ReturnType<typeof getNetworkElement>>>;
type Tab = 'overview' | 'hardware' | 'gpus' | 'links' | 'impact' | 'alerts';
const TABS: Tab[] = ['overview', 'hardware', 'gpus', 'links', 'impact', 'alerts'];
const ROLE_ICON: Record<string, I.LucideIcon> = { Router: I.Router, Switch: I.Network, DWDM: I.Waves, Firewall: I.ShieldCheck, Access: I.RadioTower };

/* Operational state of a device (same rule as the site Equipment tab) */
export type OpsState = 'in-service' | 'unmonitored' | 'planned' | 'tenant-owned';
export const opsStateOf = (ne: Ne): OpsState => (ne.role === 'Tenant gear' ? 'tenant-owned' : ne.discovery !== 'not-discovered' ? 'in-service' : ne.ndReason === 'planned' ? 'planned' : 'unmonitored');

/* Operational status from alarms, reachability and monitoring state */
export type OpsStatus = 'critical' | 'attention' | 'normal' | 'unmonitored' | 'planned' | 'tenant-owned';
export function opsStatusOf(d: NeData): OpsStatus {
  const st = opsStateOf(d.ne);
  if (st !== 'in-service') return st;
  const act = d.alerts.filter(a => a.state !== 'cleared');
  if (d.ne.icmp.state === 'critical' || act.some(a => a.severity === 'critical')) return 'critical';
  if (act.length || d.ne.icmp.state === 'degraded' || d.links.some(l => l.protocol === 'LLDP' && l.state === 'down')) return 'attention';
  return 'normal';
}
const STATUS_LABEL: Record<OpsStatus, { label: string; tone: 'error' | 'warning' | 'success' | 'neutral' | 'info' }> = {
  critical: { label: 'Critical', tone: 'error' }, attention: { label: 'Needs attention', tone: 'warning' }, normal: { label: 'Normal', tone: 'success' },
  unmonitored: { label: 'Not monitored', tone: 'neutral' }, planned: { label: 'Planned', tone: 'info' }, 'tenant-owned': { label: 'Tenant-owned', tone: 'neutral' }
};

/* One device, as operations sees it: status, health, links, the services it
   carries (impact) and its alarms with RCA. */
export function NetworkElement() {
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab: Tab = TABS.includes(sp.get('tab') as Tab) ? (sp.get('tab') as Tab) : sp.get('tab') === 'services' ? 'impact' : 'overview';
  const [res, setRes] = useState(false);
  const { data, loading } = useQuery(() => getNetworkElement(id), [id]);
  const ne = data?.ne;
  usePage(ne ? [{ label: 'Datacenters', to: '/datacenters' }, { label: ne.dcId, to: `/datacenters/${ne.dcId}` }, { label: `${ne.role} · ${ne.name}` }] : [{ label: 'Datacenters', to: '/datacenters' }, { label: id }], { neId: id, dcId: ne?.dcId });
  if (loading && !data) return <Loading />;
  if (!data || !ne) return <NotFound what="Network element" />;
  const Ico = ROLE_ICON[ne.role] ?? I.Server;
  const opsState = opsStateOf(ne);
  const nd = opsState !== 'in-service';
  const status = opsStatusOf(data);
  const sl = STATUS_LABEL[status];
  const rackName = data.rack.name.replace('RACK-', 'Rack ');
  const active = data.alerts.filter(a => a.state !== 'cleared');
  const setTab = (t: Tab) => { const n = new URLSearchParams(); n.set('tab', t); setSp(n, { replace: true }); };

  return (
    <div className="page">
      <section className="vw-card-section ne-head">
        <div className="ne-head-top">
          <span className="vw-card-icon-lg ne-ico"><Ico size={22} /></span>
          <div className="ne-id">
            <div className="ne-name-row">
              <h1 className="ne-name">{ne.name}</h1>
              <span className={`ne-status is-${status}`}><i />{sl.label}</span>
              <Chip tone="neutral" size="sm">{ne.role}{ne.isPe ? ' · PE' : ''}</Chip>
              <Chip tone="neutral" size="sm">{ne.layer}</Chip>
            </div>
            <div className="vw-card-description ne-sub">
              <span><I.Building2 size={13} /><Link className="ent-link" to={`/datacenters/${ne.dcId}`}>{ne.dcId}</Link></span>
              <span><I.Server size={13} /><Link className="ent-link" to={`/datacenters/${ne.dcId}?tab=details`}>{rackName} · U{ne.u}</Link></span>
              <span className="mono">{ne.ip}</span>
              {!nd && ne.lastSeen && <span>polled {fmtDateTime(ne.lastSeen)} via {ne.collector}</span>}
            </div>
          </div>
          <Btn icon={I.Cpu} onClick={() => setRes(true)} disabled={nd} title={nd ? 'No telemetry' : undefined}>Node resources</Btn>
        </div>
        <dl className="ne-attrs">
          <div><dt>Vendor</dt><dd>{ne.vendor}</dd></div>
          <div><dt>Model</dt><dd>{ne.model}</dd></div>
          <div><dt>OS version</dt><dd>{ne.os}</dd></div>
          <div><dt>Serial number</dt><dd>{ne.serial}</dd></div>
          <div><dt>MAC address</dt><dd>{ne.mac}</dd></div>
          <div><dt>Lifecycle</dt><dd>{ne.lifecycle}</dd></div>
        </dl>
        {nd && (
          <div className={`note ${opsState === 'planned' || opsState === 'tenant-owned' ? 'note--info' : 'note--warn'} ne-banner`}>
            {opsState === 'planned' ? <I.CalendarClock size={16} /> : opsState === 'tenant-owned' ? <I.Building2 size={16} /> : <I.EyeOff size={16} />}
            <div style={{ flex: 1 }}>{opsState === 'planned'
              ? <><b>Planned — not installed.</b> Rack space {ne.rackId.split('-').slice(-1)[0]} · U{ne.u} is reserved for this device; it has no telemetry, links or services yet.</>
              : opsState === 'tenant-owned'
              ? <><b>Tenant-owned equipment.</b> A block of customer gear in leased cabinet {ne.rackId.split('-').slice(-1)[0]} · U{ne.u}. The operator monitors the cabinet’s power draw and environment; the tenant monitors the devices inside.</>
              : <><b>Not monitored.</b> Installed but no collector reports its telemetry ({ND_REASON[ne.ndReason ?? 'no-collector'].toLowerCase()}). Health, alarms and links are unknown — a monitoring blind spot.</>}</div>
            <Link className="nst-btn nst-btn--xs" to={opsState === 'planned' ? `/datacenters/${ne.dcId}?tab=overview` : opsState === 'tenant-owned' ? `/datacenters/${ne.dcId}?tab=customers` : `/datacenters/${ne.dcId}?tab=elements&view=unmonitored`}>{opsState === 'planned' ? 'Site overview' : opsState === 'tenant-owned' ? 'Tenants' : 'Unmonitored devices'}</Link>
          </div>
        )}
      </section>

      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { id: 'overview', label: 'Overview' },
        { id: 'hardware', label: 'Hardware & interfaces', count: data.interfaces.length },
        ...(ne.role === 'GPU' ? [{ id: 'gpus' as Tab, label: 'GPUs · DCGM', count: 8 }] : []),
        { id: 'links', label: 'Links', count: data.links.length },
        { id: 'impact', label: 'Impact', count: data.services.length },
        { id: 'alerts', label: 'Alerts & diagnostics', count: active.length }
      ]} />

      {tab === 'overview' && <Overview d={data} />}
      {tab === 'hardware' && <Hardware d={data} />}
      {tab === 'gpus' && ne.role === 'GPU' && <GpuTab id={ne.id} />}
      {tab === 'links' && <Links d={data} />}
      {tab === 'impact' && <Impact d={data} />}
      {tab === 'alerts' && <NeAlerts d={data} />}

      <Drawer open={res} onClose={() => setRes(false)} title="Node resources" sub={`${ne.name} · ${ne.vendor} ${ne.model}`} width={520}>
        <div className="ne-res-grid">
          <div><span className="muted">CPU</span><Meter pct={ne.cpu} width={120} /></div>
          <div><span className="muted">Memory</span><Meter pct={ne.mem} width={120} /></div>
          <div><span className="muted">Temperature</span><b className="num">{ne.tempC}°C</b></div>
          <div><span className="muted">Uptime</span><b className="num">{fmtUptime(ne.uptimeMin)}</b></div>
        </div>
        <table className="nst-table ne-mini">
          <thead><tr><th>Slot</th><th>Module</th><th>Serial</th><th className="is-right">Temp</th><th>State</th></tr></thead>
          <tbody>{ne.modules.map(m => <tr key={m.slot}><td className="mono">{m.slot}</td><td>{m.name}</td><td className="mono">{m.serial}</td><td className="is-right num">{m.tempC}°C</td><td><Chip tone={m.state === 'OK' ? 'success' : m.state === 'Fault' ? 'error' : 'neutral'} size="xs">{m.state}</Chip></td></tr>)}</tbody>
        </table>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>Last reboot {fmtDateTime(ne.lastReboot)} · polled by {ne.collector}</p>
      </Drawer>
    </div>
  );
}

/* a GPU node's DCGM telemetry on its device page — the same detail as the AI & GPU drawer */
function GpuTab({ id }: { id: string }) {
  const { data } = useQuery(() => getGpuNode(id), [id]);
  if (!data) return <Loading label="Loading GPU telemetry" />;
  return <section className="card" style={{ padding: 18 }}><GpuNodeDetail d={data} /></section>;
}
