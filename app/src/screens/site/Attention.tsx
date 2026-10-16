import { sevChipCls, sevLabel } from '../../lib/vocab';
import { Link, useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, getAlerts, getChanges, getIncidents, getNetworkElements, getSitePhysical, useQuery, vocabNow } from '../../api';
import { SpofList, SpofInfo } from '../physical/parts';
import { SHOW_DUPLICATES } from './dedupe';
import { OnCallPanel } from '../ops/process';
import type { Alert, AlertCategory } from '../../api/types';
import { Empty, Panel } from '../../ui/kit';
import { ChangeChip, SevDot, SeverityChip } from '../../ui/status';
import { ScopeChip } from '../../ui/scope';
import { fmtAgo, fmtDate, fmtDur, fmtWhen } from '../../lib/format';
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
  const { data: allIncs } = useQuery(() => getIncidents({ dcId: dc.id }), [dc.id]);
  const { data: al } = useQuery(() => getAlerts({ dcId: dc.id, state: 'open' }), [dc.id]);
  const { data: chg } = useQuery(() => getChanges({ dcId: dc.id }), [dc.id]);
  const { data: nes } = useQuery(() => getNetworkElements({ dcId: dc.id }), [dc.id]);
  const { data: phys } = useQuery(() => getSitePhysical(dc.id), [dc.id]);

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
  /* incident figures + recently resolved (16-Oct-2026, user: the incidents panel was mostly empty space next to the alarms) */
  const open = incs ?? [];
  const resolved = (allIncs ?? []).filter(i => i.resolved && i.resolved >= now - 7 * 86400e3).sort((a, b) => (b.resolved ?? 0) - (a.resolved ?? 0));
  const res30 = (allIncs ?? []).filter(i => i.resolved && i.resolved >= now - 30 * 86400e3);
  const mttr = res30.length ? res30.reduce((t, i) => t + ((i.resolved ?? 0) - i.detected), 0) / res30.length / 60000 : null;
  const oldest = open.length ? Math.min(...open.map(i => i.detected)) : null;
  const incFacts = [
    { k: 'Past SLA', v: String(open.filter(i => i.sla.breaching).length), bad: open.some(i => i.sla.breaching), icon: I.TimerOff },
    { k: 'Unacked', v: String(open.filter(i => !i.acknowledged).length), bad: open.some(i => !i.acknowledged), icon: I.BellDot },
    { k: 'Oldest open', v: oldest ? fmtDur((now - oldest) / 60000) : '—', bad: false, icon: I.Hourglass },
    { k: 'MTTR · 30 d', v: mttr !== null ? fmtDur(mttr) : '—', bad: false, icon: I.TimerReset }
  ];

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
        <Panel title="Open incidents" count={incs?.length ?? 0} icon={I.Siren} sub="Open, investigating or mitigated · most severe first" info="Incidents here that are Open, Investigating or Mitigated, most severe first, then least time left on the resolution SLA; the right column is that time left (or overdue). Click a row to open the incident." actions={<Link to={`/incidents?dc=${dc.id}`} className="panel-link">All incidents<I.ChevronRight size={14} /></Link>} flush>
          <div className="att-cats">
            {incFacts.map(f => <div key={f.k} className="att-cat"><span className="att-cat-h"><f.icon size={14} /><span className="vw-label">{f.k}</span></span><span className={`vw-card-metric-sm${f.bad ? ' bad' : ''}`}>{f.v}</span></div>)}
          </div>
          {incs && incs.length ? (
            <div className="att-list">{[...incs].sort((a, b) => a.sev - b.sev || a.sla.resolveLeft - b.sla.resolveLeft).map(i => (
              <Link key={i.id} to={`/incidents/${i.id}`} className="att-row">
                <span className={`vw-chip ${sevChipCls(i.sev)} is-strong cmd-chip att-sev`}>{sevLabel(i.sev)}</span>
                <span className="att-main"><b>{i.title}</b><small>{i.id} · {i.status} · {i.owner} · {i.impact.services} {vocabNow().services.toLowerCase()}</small></span>
                <span className={`att-sla${i.sla.breaching ? ' is-late' : ''}`}>{i.sla.resolveLeft < 0 ? `Overdue ${fmtDur(-i.sla.resolveLeft)}` : `${fmtDur(i.sla.resolveLeft)} left`}</span>
              </Link>))}</div>
          ) : <Empty icon={I.ShieldCheck} title="No open incidents" />}
          {resolved.length > 0 && <>
            <div className="att-subh"><span>Resolved · last 7 days</span><span className="faint">{resolved.length}</span></div>
            <div className="att-list">{resolved.slice(0, 6).map(i => (
              <Link key={i.id} to={`/incidents/${i.id}`} className="att-row is-done">
                <span className="vw-chip vw-chip--neutral cmd-chip att-sev">{sevLabel(i.sev)}</span>
                <span className="att-main"><b>{i.title}</b><small>{i.id} · resolved {fmtDate(i.resolved!)} · {i.owner}</small></span>
                <span className="att-sla is-done">took {fmtDur(((i.resolved ?? 0) - i.detected) / 60000)}</span>
              </Link>))}</div>
          </>}
        </Panel>

        <Panel title="Alarms in datacenter scope" count={alarms.length} icon={I.BellRing} sub="Site, edge and dependencies · not downstream" info="Active alarms that count against this site: inside it, on links leaving it, or on something it depends on; downstream sites are excluded. Tiles split them by category, the list shows the 8 most severe. Click a tile or row to drill in." actions={<Link to={`/alerts?dc=${dc.id}`} className="panel-link">Alerts console<I.ChevronRight size={14} /></Link>} flush>
          <div className="att-cats">
            {CATS.map(c => { const xs = alarms.filter(a => a.category === c.k); const crit = xs.filter(a => a.severity === 'critical' || a.severity === 'major').length; return (
              <Link key={c.k} to={`/alerts?dc=${dc.id}`} className="att-cat" title={`${xs.length} ${c.k.toLowerCase()} alarms · ${crit} major or critical`}><span className="att-cat-h"><c.icon size={14} /><span className="vw-label">{c.k}</span></span><span className="att-cat-v"><span className="vw-card-metric-sm">{xs.length}</span>{crit ? <em>{crit} major+</em> : null}</span></Link>
            ); })}
          </div>
          {top.length ? <div className="att-list">{top.map(a => (
            <button key={a.id} type="button" className="att-row" onClick={() => nav(a.neId ? `/ne/${a.neId}?tab=alerts` : `/alerts?dc=${dc.id}&q=${a.code}`)}>
              <SevDot s={a.severity} />
              <span className="att-main"><b>{a.title}</b><small>{a.neId ? a.neId.replace(`${dc.id}-`, '') : a.node ?? (a.category === 'Facility' ? 'Facility' : dc.id)}{a.ifName ? ` · ${a.ifName}` : ''} · {fmtAgo(a.start, now)}</small></span>
              <span className="att-tags"><ScopeChip a={a} /><SeverityChip s={a.severity} size="xs" /></span>
            </button>))}</div> : <Empty icon={I.BellOff} title="No active alarms" />}
        </Panel>
      </div>

      <div className="grid g-3">
        <Panel title="Facility" icon={I.Zap} info="The plant keeping the site alive now: utility feeds in alarm, UPS units not online, DG rating / fuel / last test, battery autonomy, cooling units not operational and any zone above 27°C. Red text marks what is wrong." actions={<Link to={`/facilities?dc=${dc.id}`} className="panel-link">Facilities<I.ChevronRight size={14} /></Link>}>
          <div className="att-kv">
            <Row k="Utility feeds" v={feedsBad.length ? <span className="bad">{feedsBad.length} lost</span> : `${dc.power.feeds.filter(f => f.type === 'AC').length} normal`} />
            <Row k="UPS" v={upsBad.length ? <span className="bad">{upsBad.map(u => `${u.name} ${u.state.toLowerCase()}`).join(', ')}</span> : `${dc.power.ups.length}/${dc.power.ups.length} online · ${dc.power.ups[0]?.redundancy}`} />
            <Row k="DG" v={`${dc.power.dg.kva} kVA · fuel ${dc.power.dg.fuelPct}% · last test ${dc.power.dg.result}`} />
            <Row k="Battery" v={`${dc.power.battery.runtimeH} h autonomy`} />
            <Row k="Cooling units" v={unitsBad.length ? <span className="bad">{unitsBad.map(u => `${u.name} ${u.status.toLowerCase()}`).join(', ')}</span> : `${dc.cooling.units.length}/${dc.cooling.units.length} running · ${dc.cooling.redundancy}`} />
            <Row k="Zone temperature" v={hotZones.length ? <span className="bad">{hotZones.map(z => `${z.zone} ${z.tempC}°C`).join(', ')}</span> : `max ${Math.max(...dc.cooling.sensors.map(z => z.tempC))}°C (limit 27°C)`} />
          </div>
        </Panel>

        <Panel title="Edge links" icon={I.Cable} info="Links leaving the site (backhaul, uplinks) that are up out of all of them. Redundant = all up; Redundancy lost = one or more down; Site isolated = every one down. Below: links down inside the site and devices not answering ping." actions={<Link to={`/datacenters/${dc.id}?tab=topology`} className="panel-link">Topology<I.ChevronRight size={14} /></Link>}>
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

        <Panel title="Monitoring gaps" icon={I.EyeOff} sub="Installed devices with no telemetry are blind spots" info="Installed devices at this site that no collector polls, out of every installed device; a fault on them would go unseen. Also warns when a collector has stopped reporting. The link lists the unmonitored devices.">
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
        <Panel title="Changes & maintenance" count={activeChg.length} icon={I.ArrowLeftRight} sub="In progress now or starting in the next 7 days" info="Changes at this site that are in progress, or approved / pending approval with a window starting in the last hour or the next 7 days, with their risk rating and start time. Click a row to open the change." actions={<Link to={`/changes?dc=${dc.id}`} className="panel-link">Change calendar<I.ChevronRight size={14} /></Link>} flush>
          {activeChg.length ? <div className="att-list">{activeChg.map(c => (
            <Link key={c.id} to={`/changes?id=${c.id}`} className="att-row">
              <span className="vw-chip vw-chip--neutral cmd-chip">{c.kind}</span>
              <span className="att-main"><b>{c.title}</b><small>{c.id} · {c.risk} risk · {fmtWhen(c.windowStart, now)}</small></span>
              <ChangeChip s={c.status} size="xs" />
            </Link>))}</div> : <Empty icon={I.CalendarCheck} title="No change activity this week" />}
        </Panel>

        <Panel title="Operational risks" count={opsRisks.length} icon={I.ShieldAlert} sub="Facility, network, security and supplier risks at this site" flush info="Open risks logged against this site in the Facility, Network, Security and Supplier domains, each with its severity, detail and owner. These are known conditions on a register, not live alarms.">
          {opsRisks.length ? <div className="att-list">{opsRisks.map(r => (
            <div key={r.id} className="att-row">
              <SevDot s={r.severity} />
              <span className="att-main"><b>{r.title}</b><small>{r.domain} · {r.detail} · {r.owner}</small></span>
              <SeverityChip s={r.severity} size="xs" />
            </div>))}</div> : <Empty icon={I.ShieldCheck} title="No open operational risks" />}
        </Panel>
      </div>

      {/* the single points of failure list is the Facility → Single points of failure tab (16-Oct-2026, user: duplicate; see dedupe.ts) */}
      {phys && dc.status !== 'planned' && (<div className={SHOW_DUPLICATES ? 'grid g-1-2' : 'col'}>
        <OnCallPanel dcId={dc.id} />
        {SHOW_DUPLICATES && <Panel title={<>Single points of failure<SpofInfo /></>} count={phys.spofs.length} icon={I.ShieldAlert} flush sub="Power, cooling and cabling risks that would turn one more failure into an outage"
          actions={phys.spofs.length > 4 ? <Link to={`/facilities?dc=${dc.id}&tab=resilience`} className="panel-link">All {phys.spofs.length}<I.ChevronRight size={14} /></Link> : undefined}>
          <SpofList spofs={phys.spofs.slice(0, 4)} link />
        </Panel>}
      </div>)}
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="att-kv-row"><span className="vw-label">{k}</span><span className="vw-value">{v}</span></div>;
