import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getNetworkElement, useQuery } from '../../api';
import { usePage, Loading } from '../../shell/page';
import { Btn, Chip, Drawer, Tabs } from '../../ui/kit';
import { DiscoveryChip, Meter } from '../../ui/status';
import { ND_REASON } from '../../lib/vocab';
import { fmtDateTime, fmtUptime } from '../../lib/format';
import { NotFound } from '../NotFound';
import { Overview } from './Overview';
import { Hardware } from './Hardware';
import { Links } from './Links';
import { NeServices } from './NeServices';
import { NeAlerts } from './NeAlerts';
import '../../styles/ne.css';

export type NeData = NonNullable<Awaited<ReturnType<typeof getNetworkElement>>>;
type Tab = 'overview' | 'hardware' | 'links' | 'services' | 'alerts';
const ROLE_ICON: Record<string, I.LucideIcon> = { Router: I.Router, Switch: I.Network, DWDM: I.Waves, Firewall: I.ShieldCheck, Access: I.RadioTower };

/* INV-09 / INV-03 / INV-07 / INV-08 — one device, from health to the
   services and customers that depend on it. */
export function NetworkElement() {
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'overview';
  const [res, setRes] = useState(false);
  const { data, loading } = useQuery(() => getNetworkElement(id), [id]);
  const ne = data?.ne;
  usePage(ne ? [{ label: 'Location', to: '/inventory' }, { label: ne.dcId, to: `/datacenters/${ne.dcId}` }, { label: `${ne.role} · ${ne.name}` }] : [{ label: 'Location', to: '/inventory' }, { label: id }], { neId: id, dcId: ne?.dcId });
  if (loading && !data) return <Loading />;
  if (!data || !ne) return <NotFound what="Network element" />;
  const Ico = ROLE_ICON[ne.role] ?? I.Server;
  const nd = ne.discovery === 'not-discovered';
  const rackName = data.rack.name.replace('RACK-', 'Rack ');
  const active = data.alerts.filter(a => a.state !== 'cleared');
  const setTab = (t: Tab) => { const n = new URLSearchParams(); n.set('tab', t); setSp(n, { replace: true }); };

  return (
    <div className="page">
      <section className="card ent-head">
        <div className="ent-head-top">
          <span className="ent-ico"><Ico size={24} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ent-title">
              <h1>{ne.name}</h1>
              <Chip tone={ne.lifecycle === 'Ready' ? 'success' : ne.lifecycle === 'Planned' ? 'info' : 'warning'} size="sm">{ne.lifecycle}</Chip>
              <Chip tone="neutral" size="sm">{ne.role}</Chip>
              {ne.isPe && <Chip tone="purple" size="sm">PE · core</Chip>}
              <DiscoveryChip s={ne.discovery} />
            </div>
            <div className="ent-sub mono">{ne.dcId} · {ne.ip} · {ne.serial}{!nd && ne.lastSeen ? <span className="faint"> · last seen {fmtDateTime(ne.lastSeen)} via {ne.collector}</span> : null}</div>
          </div>
          <Btn icon={I.Cpu} onClick={() => setRes(true)} disabled={nd} title={nd ? 'No telemetry until discovered' : undefined}>Node resources</Btn>
        </div>
        <dl className="ent-attrs" style={{ '--cols': 7 } as React.CSSProperties}>
          <div><dt>Vendor</dt><dd>{ne.vendor}</dd></div>
          <div><dt>OS version</dt><dd>{ne.os}</dd></div>
          <div><dt>Serial number</dt><dd>{ne.serial}</dd></div>
          <div><dt>Rack location</dt><dd><Link className="ent-link" to={`/datacenters/${ne.dcId}?tab=details`}>{rackName} · U{ne.u}</Link></dd></div>
          <div><dt>Model</dt><dd>{ne.model}</dd></div>
          <div><dt>IP address</dt><dd>{ne.ip}</dd></div>
          <div><dt>MAC address</dt><dd>{ne.mac}</dd></div>
        </dl>
        {ne.discovery === 'drifted' && ne.drift && (
          <div className="note note--warn ne-banner">
            <I.GitCompareArrows size={16} />
            <div style={{ flex: 1 }}>
              <b>Record drifted from the network.</b> {ne.drift.map(d => <span key={d.attr} className="ne-drift"><span className="muted">{d.attr}</span> <s className="mono">{d.record}</s> → <span className="mono">{d.observed}</span></span>)}
              {ne.duplicateSerialOf && <span> Serial also reported by <Link className="ent-link mono" to={`/ne/${ne.duplicateSerialOf}`}>{ne.duplicateSerialOf}</Link>.</span>}
            </div>
            <Link className="nst-btn nst-btn--xs" to={`/reconciliation?dc=${ne.dcId}&q=${ne.id}`}>Reconcile</Link>
          </div>
        )}
        {nd && (
          <div className="note note--bad ne-banner">
            <I.SearchX size={16} />
            <div style={{ flex: 1 }}><b>Not discovered.</b> On record but never seen by a collector — {ND_REASON[ne.ndReason ?? 'planned'].toLowerCase()}. Telemetry, links and services appear once it is discovered and reconciled.</div>
            <Link className="nst-btn nst-btn--xs" to={`/reconciliation?dc=${ne.dcId}&q=${ne.id}`}>Open reconciliation</Link>
          </div>
        )}
      </section>

      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { id: 'overview', label: 'Overview' },
        { id: 'hardware', label: 'Hardware & interfaces', count: data.interfaces.length },
        { id: 'links', label: 'Links', count: data.links.length },
        { id: 'services', label: 'Network services', count: data.services.length },
        { id: 'alerts', label: 'Alerts & diagnostics', count: active.length }
      ]} />

      {tab === 'overview' && <Overview d={data} />}
      {tab === 'hardware' && <Hardware d={data} />}
      {tab === 'links' && <Links d={data} />}
      {tab === 'services' && <NeServices d={data} />}
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
