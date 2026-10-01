import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow } from '../../api';
import { Chip, Panel } from '../../ui/kit';
import { ChangeChip, Fresh, HealthChip, IncidentChip, SevChip } from '../../ui/status';
import { fmtAgo, fmtDate, fmtDateTimeS, fmtUptime, fmtWhen } from '../../lib/format';
import type { NeData } from './NetworkElement';
import { NoTelemetry } from './common';

const PROTOS = ['LLDP', 'OSPF', 'BGP', 'ISIS', 'LSP'] as const;

export function Overview({ d }: { d: NeData }) {
  const { ne } = d;
  if (ne.discovery === 'not-discovered') return <><Dependencies d={d} /><NoTelemetry ne={ne} what="telemetry" /></>;
  const now = clockNow();
  const ifs = d.interfaces;
  const up = ifs.filter(i => i.state === 'up').length;
  const down = ifs.filter(i => i.state === 'down').length, reserved = ifs.filter(i => i.state === 'reserved').length, adm = ifs.filter(i => i.state === 'admin-down').length;
  const act = d.alerts.filter(a => a.state !== 'cleared');
  const sev = (s: string) => act.filter(a => a.severity === s).length;
  const protos = PROTOS.filter(p => d.links.some(l => l.protocol === p));

  return (
    <>
      <Panel title="Overview" actions={<Fresh>Polled {fmtAgo(ne.lastSeen ?? now, now)} · {ne.collector}</Fresh>}>
        <div className="ne-kpis">
          <div className="ne-kpi c-green"><span>Device health</span><b>{ne.healthScore.toFixed(ne.healthScore % 1 ? 2 : 0)}%</b><small>CPU {ne.cpu}% · Mem {ne.mem}% · {ne.tempC}°C</small></div>
          <Link to="?tab=links" className="ne-kpi c-blue"><span>Protocol links</span><b>{d.links.length}</b><small>{protos.join(' · ')}</small></Link>
          <Link to="?tab=hardware" className="ne-kpi c-amber"><span>Interface status</span><b>{up}/{ifs.length}</b><small>{[down && `${down} down`, reserved && `${reserved} reserved`, adm && `${adm} unused`].filter(Boolean).join(' · ') || 'all up'}</small></Link>
          <Link to="?tab=alerts" className="ne-kpi c-red"><span>Active alarms</span><b>{act.length}</b><small>{sev('critical')} critical · {sev('major')} major · {sev('minor')} minor{sev('warning') ? ` · ${sev('warning')} warning` : ''}</small></Link>
          <div className="ne-kpi c-purple"><span>System uptime</span><b>{fmtUptime(ne.uptimeMin)}</b><small>last reboot {fmtDate(ne.lastReboot)}</small></div>
        </div>
        <div className="grid g-3" style={{ marginTop: 14 }}>
          <div className="ne-probe">
            <div className="row between"><div><h4>ICMP health</h4><span className="muted">Network reachability</span></div><HealthChip s={ne.icmp.state}>{ne.icmp.state === 'healthy' ? 'Healthy' : ne.icmp.state === 'degraded' ? 'Degraded' : 'Unreachable'}</HealthChip></div>
            <dl className="ne-probe-m">
              <div><dt>Pkt loss</dt><dd className={ne.icmp.lossPct > 0.2 ? 'bad' : ''}>{ne.icmp.lossPct}%</dd></div>
              <div><dt>Latency</dt><dd>{ne.icmp.latencyMs} ms</dd></div>
              <div><dt>Jitter</dt><dd>{ne.icmp.jitterMs} ms</dd></div>
              <div><dt>Availability</dt><dd className={ne.icmp.availability >= 99.9 ? 'good' : 'warn'}>{ne.icmp.availability}%</dd></div>
            </dl>
            <div className="ne-probe-f">Last checked 1 min ago · probe interval 1 min</div>
          </div>
          <div className="ne-probe">
            <div className="row between"><div><h4>NTP sync</h4><span className="muted">Time synchronisation</span></div><Chip tone={ne.ntp.state === 'Synchronised' ? 'success' : 'error'} size="sm">{ne.ntp.state}</Chip></div>
            <dl className="ne-probe-m">
              <div><dt>Offset</dt><dd>{ne.ntp.offsetMs} ms</dd></div>
              <div><dt>Delay</dt><dd>{ne.ntp.delayMs} ms</dd></div>
              <div><dt>Jitter</dt><dd>{ne.ntp.jitterMs} ms</dd></div>
              <div><dt>Stratum</dt><dd>{ne.ntp.stratum}</dd></div>
            </dl>
            <div className="ne-probe-f">Primary <span className="mono">{ne.ntp.primary}</span> · secondary <span className="mono">{ne.ntp.secondary}</span> · last sync {fmtDateTimeS(ne.ntp.lastSync)}</div>
          </div>
          <div className="ne-probe">
            <div className="row between"><div><h4>RADIUS auth</h4><span className="muted">AAA authentication</span></div><HealthChip s={ne.radius.state} /></div>
            <dl className="ne-probe-m">
              <div><dt>Success</dt><dd className="good">{ne.radius.successPct}%</dd></div>
              <div><dt>Fails 24h</dt><dd className={ne.radius.failures24h ? 'warn' : ''}>{ne.radius.failures24h}</dd></div>
              <div><dt>Primary</dt><dd className={ne.radius.primary === 'Reachable' ? 'good' : 'bad'}>{ne.radius.primary}</dd></div>
              <div><dt>Secondary</dt><dd className={ne.radius.secondary === 'Reachable' ? 'good' : 'bad'}>{ne.radius.secondary}</dd></div>
            </dl>
            <div className="ne-probe-f">Primary <span className="mono">{ne.radius.pri}</span> · secondary <span className="mono">{ne.radius.sec}</span> · last auth {fmtDateTimeS(ne.radius.lastAuth)}</div>
          </div>
        </div>
      </Panel>

      <Dependencies d={d} />
      <Panel title="24-hour service availability" sub="Hourly probe result — red marks an hour with failed probes" foot={<><span>Last 24 hours</span><span>updated 1 min ago</span></>}>
          {[['ICMP health', ne.icmp.hourly], ['NTP sync', ne.ntp.hourly]].map(([label, h]) => (
            <div key={label as string} className="ne-avail">
              <div className="row between"><span className="row" style={{ gap: 6 }}><i className="ne-sq" />{label as string}</span><b className="num">{(h as boolean[]).filter(Boolean).length} of 24 h clean</b></div>
              <div className="ne-hours">{(h as boolean[]).map((ok, i) => <i key={i} className={ok ? 'ok' : 'bad'} title={`${String((new Date(now).getHours() + 1 + i) % 24).padStart(2, '0')}:00 — ${ok ? 'all probes passed' : 'probe failures'}`} />)}</div>
            </div>
          ))}
      </Panel>
    </>
  );
}

/* site → rack → NE → links → services → customers (DC-NET-010) */
function Dependencies({ d }: { d: NeData }) {
  const { ne } = d;
  const now = clockNow();
  const phys = d.links.filter(l => l.protocol === 'LLDP');
  const custs = new Set(d.services.map(s => s.customerId));
  const prem = new Set(d.services.filter(s => s.customer.premium).map(s => s.customerId));
  const openInc = d.incidents.filter(i => ['Open', 'Investigating', 'Mitigated'].includes(i.status));
  const chg = d.changes.filter(c => !['Completed', 'Rolled back', 'Rejected'].includes(c.status) || c.windowEnd > now - 3 * 86400000);
  const steps: { icon: I.LucideIcon; label: string; value: string; to: string }[] = [
    { icon: I.Building2, label: 'Site', value: ne.dcId, to: `/datacenters/${ne.dcId}` },
    { icon: I.Server, label: 'Rack', value: `${d.rack.name} · U${ne.u}`, to: `/datacenters/${ne.dcId}?tab=details` },
    { icon: I.Router, label: 'Element', value: ne.role, to: '?tab=overview' },
    { icon: I.Cable, label: 'Physical links', value: String(phys.length), to: '?tab=links' },
    { icon: I.Waypoints, label: 'Services', value: String(d.services.length), to: '?tab=services' },
    { icon: I.Users, label: 'Customers', value: `${custs.size}${prem.size ? ` · ${prem.size} premium` : ''}`, to: '?tab=services' }
  ];
  return (
    <Panel title="Dependencies" sub="From the physical site to the customers that ride this element, with open incidents and changes touching it">
      <div className="ne-dep">
        {steps.map((s, i) => (
          <span key={s.label} className="row" style={{ gap: 6, minWidth: 0 }}>
            <Link to={s.to} className="ne-dep-step">
              <span className="kpi-ico tone-info"><s.icon size={15} /></span>
              <span className="ne-dep-t"><small>{s.label}</small><b>{s.value}</b></span>
            </Link>
            {i < steps.length - 1 && <I.ChevronRight size={16} className="faint" />}
          </span>
        ))}
      </div>
      {(openInc.length > 0 || chg.length > 0) && <div className="ne-dep-ops">
        {openInc.map(i => <Link key={i.id} to={`/incidents/${i.id}`} className="ne-dep-op"><SevChip n={i.sev} size="xs" /><span className="mono">{i.id}</span><span className="ellipsis">{i.title}</span><IncidentChip s={i.status} size="xs" /></Link>)}
        {chg.map(c => <Link key={c.id} to={`/changes?id=${c.id}`} className="ne-dep-op"><I.ArrowLeftRight size={13} className="muted" /><span className="mono">{c.id}</span><span className="ellipsis">{c.title}</span><span className="faint nowrap" style={{ fontSize: 11.5 }}>{fmtWhen(c.windowStart, now)}</span><ChangeChip s={c.status} size="xs" /></Link>)}
      </div>}
    </Panel>
  );
}
