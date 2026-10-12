import { Link, useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow } from '../../api';
import { Chip, Info, Panel } from '../../ui/kit';
import { ChangeChip, Fresh, HealthChip, IncidentChip, SevChip } from '../../ui/status';
import { fmtAgo, fmtDate, fmtDateTimeS, fmtUptime, fmtWhen } from '../../lib/format';
import { OpsKpi } from '../ops/shared';
import type { NeData } from './NetworkElement';
import { NoTelemetry } from './common';

export function Overview({ d }: { d: NeData }) {
  const { ne } = d;
  const nav = useNavigate();
  if (ne.discovery === 'not-discovered') return <><Dependencies d={d} /><NoTelemetry ne={ne} what="telemetry" /></>;
  const now = clockNow();
  const ifs = d.interfaces;
  const up = ifs.filter(i => i.state === 'up').length;
  const down = ifs.filter(i => i.state === 'down').length, reserved = ifs.filter(i => i.state === 'reserved').length, adm = ifs.filter(i => i.state === 'admin-down').length;
  const act = d.alerts.filter(a => a.state !== 'cleared');
  const sev = (s: string) => act.filter(a => a.severity === s).length;
  const phys = d.links.filter(l => l.protocol === 'LLDP');
  const physUp = phys.filter(l => l.state === 'up').length;
  const edgeLinks = phys.filter(l => (l.aNe === ne.id ? l.zNe : l.aNe).slice(0, 9) !== ne.dcId);
  const edgeDown = edgeLinks.filter(l => l.state === 'down').length;
  const health = Math.round(ne.healthScore);
  const healthTone = health < 60 ? 'bad' : health < 80 ? 'warn' : undefined;

  return (
    <>
      <div className="kpis kpis-5">
        <OpsKpi label="Device health" value={health} unit="/ 100" tone={healthTone} sub={`CPU ${ne.cpu}% · mem ${ne.mem}% · ${ne.tempC}°C`} icon={<I.Activity size={15} />}
          info="100 minus a penalty per active alarm (critical 4, major 1.5, minor 0.3, warning 0.1), minus CPU + memory load and chassis heat above 50°C; capped under 60 when unreachable. Amber under 80, red under 60." />
        <OpsKpi label="Active alarms" value={act.length} tone={sev('critical') ? 'bad' : act.length ? 'warn' : undefined} sub={act.length ? [sev('critical') && `${sev('critical')} critical`, sev('major') && `${sev('major')} major`, sev('minor') && `${sev('minor')} minor`].filter(Boolean).join(' · ') : 'none active'} icon={<I.BellRing size={15} />} onClick={() => nav('?tab=alerts')}
          info="Alarms on this device that are not yet cleared, split by severity (Critical / Major / Minor / Warning). Red when any is critical, amber otherwise. Click to open the Alarms tab." />
        <OpsKpi label="Interfaces up" value={`${up}/${ifs.length}`} tone={down ? 'warn' : undefined} sub={[down && `${down} down`, reserved && `${reserved} reserved`, adm && `${adm} unused`].filter(Boolean).join(' · ') || 'all up'} icon={<I.EthernetPort size={15} />} onClick={() => nav('?tab=hardware')}
          info="Interfaces in the up state out of all interfaces on the device; the note counts the ones down, reserved for planned links and administratively down (unused). Click to open the Hardware tab." />
        <OpsKpi label="Physical links up" value={`${physUp}/${phys.length}`} tone={edgeDown ? 'bad' : physUp < phys.length ? 'warn' : undefined} sub={edgeLinks.length ? `${edgeLinks.length - edgeDown}/${edgeLinks.length} edge links up` : 'internal links only'} icon={<I.Cable size={15} />} onClick={() => nav('?tab=links')}
          info="LLDP-discovered cables that are up out of all cables on the device. Edge links leave the site (backhaul, uplinks); one down is red because it costs redundancy, an internal link down is amber. Click to open the Links tab." />
        <OpsKpi label="Uptime" value={fmtUptime(ne.uptimeMin)} sub={`last reboot ${fmtDate(ne.lastReboot)}`} icon={<I.Clock size={15} />}
          info="Time since the device last rebooted, as reported by the device itself, with the date of that reboot." />
      </div>

      <div className="grid g-3 ne-probes">
        <Probe title="ICMP reachability" sub="Probe every minute" info="Ping from the collector once a minute: packet loss, round-trip latency and jitter from the last probes, and the share of the last 24 h the device answered. Loss above 0.2% is flagged; under 99.9% availability is amber." status={<HealthChip s={ne.icmp.state}>{ne.icmp.state === 'healthy' ? 'Healthy' : ne.icmp.state === 'degraded' ? 'Degraded' : 'Unreachable'}</HealthChip>}
          rows={[['Packet loss', <span className={ne.icmp.lossPct > 0.2 ? 'bad' : ''}>{ne.icmp.lossPct}%</span>], ['Latency', `${ne.icmp.latencyMs} ms`], ['Jitter', `${ne.icmp.jitterMs} ms`], ['Availability 24 h', <span className={ne.icmp.availability >= 99.9 ? '' : 'warn'}>{ne.icmp.availability}%</span>]]}
          foot={`Last checked ${fmtAgo(ne.lastSeen ?? now, now)}`} />
        <Probe title="NTP sync" sub="Time synchronisation" info="Whether the device clock is synchronised to its NTP servers: offset from true time, round-trip delay to the server, jitter and the stratum (distance from a reference clock). Unsynchronised clocks corrupt log and alarm timestamps." status={<Chip tone={ne.ntp.state === 'Synchronised' ? 'success' : 'error'} size="sm">{ne.ntp.state}</Chip>}
          rows={[['Offset', `${ne.ntp.offsetMs} ms`], ['Delay', `${ne.ntp.delayMs} ms`], ['Jitter', `${ne.ntp.jitterMs} ms`], ['Stratum', String(ne.ntp.stratum)]]}
          foot={<>Primary <span className="mono">{ne.ntp.primary}</span> · secondary <span className="mono">{ne.ntp.secondary}</span> · last sync {fmtDateTimeS(ne.ntp.lastSync).slice(12)}</>} />
        <Probe title="RADIUS auth" sub="AAA authentication" info="Operator login authentication against the RADIUS (AAA) servers: success rate and failures in the last 24 h, and whether the primary and secondary servers are reachable from this device." status={<HealthChip s={ne.radius.state} />}
          rows={[['Success rate', `${ne.radius.successPct}%`], ['Failures 24 h', <span className={ne.radius.failures24h ? 'warn' : ''}>{ne.radius.failures24h}</span>], ['Primary', <span className={ne.radius.primary === 'Reachable' ? '' : 'bad'}>{ne.radius.primary}</span>], ['Secondary', <span className={ne.radius.secondary === 'Reachable' ? '' : 'bad'}>{ne.radius.secondary}</span>]]}
          foot={<>Primary <span className="mono">{ne.radius.pri}</span> · secondary <span className="mono">{ne.radius.sec}</span> · last auth {fmtDateTimeS(ne.radius.lastAuth).slice(12)}</>} />
      </div>

      <Dependencies d={d} />

      <Panel title="24-hour probe history" sub="One cell per hour — red marks an hour with failed probes" info="The last 24 hours of ICMP and NTP probes, one cell per hour ending now. A green cell means every probe in that hour passed; red means at least one failed. The count on the right is the number of clean hours." actions={<Fresh>Polled {fmtAgo(ne.lastSeen ?? now, now)} · {ne.collector}</Fresh>}>
        {[['ICMP', ne.icmp.hourly], ['NTP', ne.ntp.hourly]].map(([label, h]) => (
          <div key={label as string} className="ne-avail">
            <div className="row between"><span className="vw-label">{label as string}</span><span className="vw-label num">{(h as boolean[]).filter(Boolean).length} of 24 h clean</span></div>
            <div className="ne-hours">{(h as boolean[]).map((ok, i) => <i key={i} className={ok ? 'ok' : 'bad'} title={`${String((new Date(now).getHours() + 1 + i) % 24).padStart(2, '0')}:00 — ${ok ? 'all probes passed' : 'probe failures'}`} />)}</div>
          </div>
        ))}
      </Panel>
    </>
  );
}

function Probe({ title, sub, info, status, rows, foot }: { title: string; sub: string; info?: string; status: React.ReactNode; rows: [string, React.ReactNode][]; foot: React.ReactNode }) {
  return (
    <section className="vw-card-section ne-probe">
      <div className="ne-probe-h"><div><span className="vw-card-title-sm">{title}{info && <Info text={info} />}</span><span className="vw-label">{sub}</span></div>{status}</div>
      <div className="att-kv">{rows.map(([k, v]) => <div key={k} className="att-kv-row"><span className="vw-label">{k}</span><span className="vw-value num">{v}</span></div>)}</div>
      <div className="vw-footer-meta ne-probe-f">{foot}</div>
    </section>
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
    { icon: I.Waypoints, label: 'Services', value: String(d.services.length), to: '?tab=impact' },
    { icon: I.Users, label: 'Customers', value: `${custs.size}${prem.size ? ` · ${prem.size} premium` : ''}`, to: '?tab=impact' }
  ];
  return (
    <Panel title="Dependencies" sub="Site → rack → element → links → services → customers, with open incidents and changes touching it" info="The chain this device sits in: site, rack, its physical links, and the services and customers riding them; each step opens the matching page. Open incidents and recent changes touching the device are listed below.">
      <div className="ne-dep">
        {steps.map((s, i) => (
          <span key={s.label} className="row" style={{ gap: 6, minWidth: 0 }}>
            <Link to={s.to} className="ne-dep-step">
              <span className="vw-card-icon-sm ne-dep-ic"><s.icon size={15} /></span>
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
