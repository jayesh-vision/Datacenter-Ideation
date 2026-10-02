import { Link, useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, getAlerts, getChanges, getIncidents, getNetworkElements, useQuery } from '../../api';
import type { Alert, AlertCategory } from '../../api/types';
import { Empty, Panel } from '../../ui/kit';
import { ChangeChip, SevDot, SeverityChip } from '../../ui/status';
import { ScopeChip } from '../../ui/scope';
import { fmtAgo, fmtDur, fmtWhen } from '../../lib/format';
import type { SiteData } from './Site';

const CATS: { k: AlertCategory; icon: I.LucideIcon }[] = [
  { k: 'Facility', icon: I.Zap }, { k: 'Network', icon: I.Network }, { k: 'Device', icon: I.Server }, { k: 'Performance', icon: I.Activity }
];
const SEV_RANK = { critical: 0, major: 1, minor: 2, warning: 3 } as const;

/* Attention — what needs an operator at this datacenter now: incidents,
   alarms in datacenter scope, facility and edge state, monitoring blind
   spots, change activity and open operational risks. Inventory work
   (discovery, drift, reconciliation) is deliberately not here. */
export function Attention({ data }: { data: SiteData }) {
  const { dc, summary: s } = data;
  const nav = useNavigate();
  const now = clockNow();
  const { data: incs } = useQuery(() => getIncidents({ dcId: dc.id, status: 'open' }), [dc.id]);
  const { data: al } = useQuery(() => getAlerts({ dcId: dc.id, state: 'open' }), [dc.id]);
  const { data: chg } = useQuery(() => getChanges({ dcId: dc.id }), [dc.id]);
  const { data: nes } = useQuery(() => getNetworkElements({ dcId: dc.id }), [dc.id]);

  const alarms = (al ?? []) as Alert[];
  const unmon = (nes ?? []).filter(n => n.opsState === 'unmonitored');
  const staleCol = dc.collectors.filter(c => c.state !== 'up');
  const upsBad = dc.power.ups.filter(u => u.state !== 'Online');
  const feedsBad = dc.power.feeds.filter(f => f.status === 'Alarm');
  const unitsBad = dc.cooling.units.filter(u => u.status !== 'Operational');
  const hotZones = dc.cooling.sensors.filter(z => z.tempC > 27);
  const activeChg = (chg ?? []).filter(c => c.status === 'In progress' || ((c.status === 'Approved' || c.status === 'Pending approval') && c.windowStart > now - 3600e3 && c.windowStart < now + 7 * 86400e3));
  const opsRisks = dc.risks.filter(r => r.domain === 'Facility' || r.domain === 'Network' || r.domain === 'Security' || r.domain === 'Supplier');
  const top = [...alarms].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.start - a.start).slice(0, 8);
  const facilityIssues = upsBad.length + feedsBad.length + unitsBad.length + hotZones.length;

  const summary = [
    incs?.length ? `${incs.length} open incident${incs.length === 1 ? '' : 's'}` : '',
    s.critAlerts ? `${s.critAlerts} critical alarm${s.critAlerts === 1 ? '' : 's'}` : '',
    facilityIssues ? `${facilityIssues} facility issue${facilityIssues === 1 ? '' : 's'}` : '',
    s.edge.state !== 'redundant' ? `edge ${s.edge.up}/${s.edge.total} up` : '',
    unmon.length ? `${unmon.length} devices not monitored` : ''
  ].filter(Boolean);

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className={`att-banner${summary.length ? '' : ' is-ok'}`}>
        {summary.length ? <I.TriangleAlert size={16} /> : <I.ShieldCheck size={16} />}
        <span>{summary.length ? <><b>{dc.id} needs attention:</b> {summary.join(' · ')}.</> : <><b>No operational issues</b> at {dc.id} right now.</>}</span>
      </div>

      <div className="grid g-2">
        <Panel title="Open incidents" count={incs?.length ?? 0} icon={I.Siren} actions={<Link to={`/incidents?dc=${dc.id}`} className="panel-link">All incidents<I.ChevronRight size={14} /></Link>} flush>
          {incs && incs.length ? (
            <div className="att-list">{[...incs].sort((a, b) => a.sev - b.sev || a.sla.resolveLeft - b.sla.resolveLeft).map(i => (
              <Link key={i.id} to={`/incidents/${i.id}`} className="att-row">
                <span className={`vw-chip ${i.sev === 1 ? 'vw-chip--error' : i.sev === 2 ? 'vw-chip--warning' : 'vw-chip--neutral'} is-strong cmd-chip`}>SEV{i.sev}</span>
                <span className="att-main"><b>{i.title}</b><small>{i.id} · {i.status} · {i.owner} · {i.impact.services} services</small></span>
                <span className={`att-sla${i.sla.breaching ? ' is-late' : ''}`}>{i.sla.resolveLeft < 0 ? `Overdue ${fmtDur(-i.sla.resolveLeft)}` : `${fmtDur(i.sla.resolveLeft)} left`}</span>
              </Link>))}</div>
          ) : <Empty icon={I.ShieldCheck} title="No open incidents" />}
        </Panel>

        <Panel title="Alarms in datacenter scope" count={alarms.length} icon={I.BellRing} sub="Site, edge links and dependencies · downstream excluded" actions={<Link to={`/alerts?dc=${dc.id}`} className="panel-link">Alerts console<I.ChevronRight size={14} /></Link>} flush>
          <div className="att-cats">
            {CATS.map(c => { const xs = alarms.filter(a => a.category === c.k); const crit = xs.filter(a => a.severity === 'critical' || a.severity === 'major').length; return (
              <Link key={c.k} to={`/alerts?dc=${dc.id}`} className="att-cat" title={`${xs.length} ${c.k.toLowerCase()} alarms · ${crit} major or critical`}><span className="att-cat-h"><c.icon size={14} /><span className="vw-label">{c.k}</span></span><span className="att-cat-v"><span className="vw-card-metric-sm">{xs.length}</span>{crit ? <em>{crit} major+</em> : null}</span></Link>
            ); })}
          </div>
          {top.length ? <div className="att-list">{top.map(a => (
            <button key={a.id} type="button" className="att-row" onClick={() => nav(a.neId ? `/ne/${a.neId}?tab=alerts` : `/alerts?dc=${dc.id}&q=${a.code}`)}>
              <SevDot s={a.severity} />
              <span className="att-main"><b>{a.title}</b><small>{a.neId ? a.neId.replace(`${dc.id}-`, '') : a.node ?? (a.category === 'Facility' ? 'Facility' : dc.id)}{a.ifName ? ` · ${a.ifName}` : ''} · {fmtAgo(a.start, now)}</small></span>
              <ScopeChip a={a} /><SeverityChip s={a.severity} size="xs" />
            </button>))}</div> : <Empty icon={I.BellOff} title="No active alarms" />}
        </Panel>
      </div>

      <div className="grid g-3">
        <Panel title="Facility" icon={I.Zap} actions={<Link to={`/facilities?dc=${dc.id}`} className="panel-link">Facilities<I.ChevronRight size={14} /></Link>}>
          <div className="att-kv">
            <Row k="Utility feeds" v={feedsBad.length ? <span className="bad">{feedsBad.length} lost</span> : `${dc.power.feeds.filter(f => f.type === 'AC').length} normal`} />
            <Row k="UPS" v={upsBad.length ? <span className="bad">{upsBad.map(u => `${u.name} ${u.state.toLowerCase()}`).join(', ')}</span> : `${dc.power.ups.length}/${dc.power.ups.length} online · ${dc.power.ups[0]?.redundancy}`} />
            <Row k="DG" v={`${dc.power.dg.kva} kVA · fuel ${dc.power.dg.fuelPct}% · last test ${dc.power.dg.result}`} />
            <Row k="Battery" v={`${dc.power.battery.runtimeH} h autonomy`} />
            <Row k="Cooling units" v={unitsBad.length ? <span className="bad">{unitsBad.map(u => `${u.name} ${u.status.toLowerCase()}`).join(', ')}</span> : `${dc.cooling.units.length}/${dc.cooling.units.length} running · ${dc.cooling.redundancy}`} />
            <Row k="Zone temperature" v={hotZones.length ? <span className="bad">{hotZones.map(z => `${z.zone} ${z.tempC}°C`).join(', ')}</span> : `max ${Math.max(...dc.cooling.sensors.map(z => z.tempC))}°C (limit 27°C)`} />
          </div>
        </Panel>

        <Panel title="Edge links" icon={I.Cable} actions={<Link to={`/topology?dc=${dc.id}`} className="panel-link">Topology<I.ChevronRight size={14} /></Link>}>
          <div className="att-edge">
            <span className="vw-card-metric-lg">{s.edge.up}/{s.edge.total}</span>
            <span className={`att-edge-state is-${s.edge.state}`}>{s.edge.state === 'redundant' ? 'All up · redundant' : s.edge.state === 'isolated' ? 'Site isolated' : 'Redundancy lost'}</span>
          </div>
          <p className="vw-card-description att-p">Backhaul and uplinks leaving the site. A link down with a working parallel path loses redundancy; losing every path isolates the site.</p>
          <div className="att-kv">
            <Row k="Links down inside the site" v={String(s.linksDown)} />
            <Row k="Devices unreachable" v={String(s.unreachable)} />
          </div>
        </Panel>

        <Panel title="Monitoring gaps" icon={I.EyeOff} sub="Installed devices with no telemetry are blind spots">
          <div className="att-edge">
            <span className="vw-card-metric-lg">{unmon.length}</span>
            <span className="vw-label">of {s.installed} installed devices not monitored</span>
          </div>
          {staleCol.length > 0 && <div className="note note--warn" style={{ marginTop: 8 }}><I.TriangleAlert size={14} />{staleCol.map(c => c.name).join(', ')} stale — last report {fmtAgo(staleCol[0].lastSeen, now)}.</div>}
          {unmon.length > 0 && <Link to={`/datacenters/${dc.id}?tab=elements&view=unmonitored`} className="panel-link" style={{ marginTop: 10 }}>View unmonitored devices<I.ChevronRight size={14} /></Link>}
          {!unmon.length && !staleCol.length && <p className="vw-card-description att-p">Every installed device reports telemetry.</p>}
        </Panel>
      </div>

      <div className="grid g-2">
        <Panel title="Changes & maintenance" count={activeChg.length} icon={I.ArrowLeftRight} sub="In progress now or starting in the next 7 days" actions={<Link to={`/changes?dc=${dc.id}`} className="panel-link">Change calendar<I.ChevronRight size={14} /></Link>} flush>
          {activeChg.length ? <div className="att-list">{activeChg.map(c => (
            <Link key={c.id} to={`/changes?id=${c.id}`} className="att-row">
              <span className="vw-chip vw-chip--neutral cmd-chip">{c.kind}</span>
              <span className="att-main"><b>{c.title}</b><small>{c.id} · {c.risk} risk · {fmtWhen(c.windowStart, now)}</small></span>
              <ChangeChip s={c.status} size="xs" />
            </Link>))}</div> : <Empty icon={I.CalendarCheck} title="No change activity this week" />}
        </Panel>

        <Panel title="Operational risks" count={opsRisks.length} icon={I.ShieldAlert} sub="Facility, network, security and supplier risks at this site" flush>
          {opsRisks.length ? <div className="att-list">{opsRisks.map(r => (
            <div key={r.id} className="att-row">
              <SevDot s={r.severity} />
              <span className="att-main"><b>{r.title}</b><small>{r.domain} · {r.detail} · {r.owner}</small></span>
              <SeverityChip s={r.severity} size="xs" />
            </div>))}</div> : <Empty icon={I.ShieldCheck} title="No open operational risks" />}
        </Panel>
      </div>
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="att-kv-row"><span className="vw-label">{k}</span><span className="vw-value">{v}</span></div>;
