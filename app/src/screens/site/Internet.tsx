import * as I from 'lucide-react';
import { getSiteInternet, useQuery } from '../../api';
import type { InetHa, SiteInternet, TransitFeed } from '../../api/types';
import { Chip, Empty, Info, KV, Panel } from '../../ui/kit';
import { NeLink, SeverityChip } from '../../ui/status';
import { Loading } from '../../shell/page';
import { CablePathView } from '../physical/parts';
import { SummaryStrip } from './SummaryStrip';
import { fmtBw, fmtDate, fmtMoney, fmtNum, fmtUptime } from '../../lib/format';
import type { SiteData } from './Site';
import '../../styles/internet.css';

const HA: Record<InetHa, { label: string; tone: 'success' | 'warning' | 'error' }> = {
  redundant: { label: 'Redundant', tone: 'success' }, 'at-risk': { label: 'At risk', tone: 'warning' }, single: { label: 'Single feed', tone: 'error' }
};
const port = (mbps: number) => (mbps >= 1000 ? `${mbps / 1000}G` : `${mbps}M`);

/* Internet & carriers (04-Nov-2026, user: "which fibre cable, which plan, which router and cabling, to manage the HA for internet").
   The site's IP transit feeds: plan and contract, circuit and SLA, the border-router port and BGP session, and the physical path
   from the router to the provider's POP, with the findings that break the redundancy (shared entry / duct / router, one feed,
   one provider, overdue failover test). Data = mock/internet.ts (NeoCloud × USA). */
export function Internet({ data }: { data: SiteData }) {
  const { dc } = data;
  const { data: v, loading } = useQuery(() => getSiteInternet(dc.id), [dc.id]);
  if (loading && !v) return <Loading label="Loading internet edge" />;
  if (!v) return <Panel title="Internet & carriers"><Empty icon={I.Globe} title="No internet feeds recorded">{dc.name} has no transit circuits on record yet.</Empty></Panel>;
  return <InternetBody v={v} />;
}

function InternetBody({ v }: { v: SiteInternet }) {
  const t = v.totals, ha = HA[v.ha];
  const ports = v.feeds.filter(f => f.status === 'In service');
  /* a few words for the strip; the full sentence is in the hover title */
  const worst = v.findings.find(f => f.severity === 'major' || f.severity === 'critical');
  const haShort = v.ha === 'single' ? 'one feed' : v.ha === 'at-risk' ? { entry: 'one entry for both', duct: 'shared duct', router: 'one router', single: 'one feed', provider: 'one provider', test: 'test overdue' }[worst?.kind ?? 'entry'] : 'diverse paths';
  return (
    <div className="col inet" style={{ gap: 16 }}>
      <SummaryStrip items={[
        { key: 'ha', label: 'Redundancy', value: <span title={v.haText}><Chip tone={ha.tone} dot>{ha.label}</Chip></span>, sub: haShort, tone: v.ha === 'single' ? 'bad' : v.ha === 'at-risk' ? 'warn' : undefined,
          info: 'Redundant = two feeds in service from two providers, on two border routers, through two building entries. At risk = both up but one thing (entry, duct, router) can still take both. Single feed = only one in service.' },
        { key: 'feeds', label: 'Feeds in service', value: `${t.inService} of ${v.feeds.length}`, sub: ports.map(f => port(f.portMbps)).join(' + ') || 'none up', tone: t.inService < 2 ? 'bad' : undefined,
          info: 'IP transit circuits with the BGP session established (a feed on order is counted but not in service), and the port speed of each on the border routers.' },
        { key: 'commit', label: 'Committed', value: fmtBw(t.commitMbps), sub: `${fmtMoney(t.mrc)}/mo`, info: 'The committed rate bought on the feeds in service (billed at the 95th percentile) and the monthly charge for them; a feed on order is not billed yet. Usage against the commit comes in phase 2.' },
        { key: 'traffic', label: 'Traffic now', value: fmtBw(t.outMbps), sub: 'out', info: 'Current outbound traffic (datacenter → internet) summed over the feeds; inbound is on each feed card.' },
        { key: 'find', label: 'Findings', value: v.findings.length, sub: v.findings.length ? 'to fix' : 'nothing shared', tone: v.findings.some(f => f.severity === 'major' || f.severity === 'critical') ? 'warn' : undefined,
          info: 'Things that defeat the redundancy, from the route audit and the records. They also appear under Facility → Single points of failure (Internet).' }
      ]} />

      {v.findings.length > 0 && (
        <Panel title="What defeats the redundancy" icon={I.ShieldAlert} count={v.findings.length} flush info="Each finding names what both feeds share (or what is missing) and the fix. The same list is under Facility → Single points of failure, domain Internet.">
          <ul className="inet-find">
            {v.findings.map(f => (
              <li key={f.id}>
                <SeverityChip s={f.severity} size="xs" />
                <div><b>{f.title}</b><p>{f.detail}</p><small><I.Wrench size={12} /> {f.fix}</small></div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid g-2 inet-feeds">{v.feeds.map(f => <FeedCard key={f.id} f={f} />)}</div>

      <Panel title="How each feed reaches the router" icon={I.Waypoints} info="The physical path of each feed inside and out of the building: router port, optic, patch cord, cabinet panel, trunk, ODF, the cross-connect to the provider's demarc, the building entry and street route, and the provider's POP. Amber = shared with the other feed.">
        <div className="grid g-2 inet-paths">
          {v.feeds.map(f => <div key={f.id} className="col" style={{ gap: 8 }}><span className="vw-label">Feed {f.side} · {f.provider}</span>{f.path && <CablePathView path={f.path} compact />}</div>)}
        </div>
      </Panel>

      <Panel title="Routing and failover" icon={I.Network} info="How the site is announced to the internet and how traffic moves between the feeds. Addresses are illustrative (documentation and benchmarking ranges).">
        <KV cols={4} items={[
          ['Our ASN', <span className="mono">AS{v.asn}</span>],
          ['Announced', <span className="mono">{v.prefixes.join(' · ')}</span>],
          ['Mode', v.mode],
          ['Last failover test', <span>{fmtDate(v.lastTest.at)} · {v.lastTest.result}<br /><small className="muted">{v.lastTest.text}</small></span>]
        ]} />
      </Panel>
    </div>
  );
}

function FeedCard({ f }: { f: TransitFeed }) {
  const up = f.status === 'In service' && f.bgp.state === 'Established';
  return (
    <section className="vw-card-section inet-feed">
      <header>
        <span className="inet-side">{f.side}</span>
        <div><b>{f.provider}</b><small className="muted">AS{f.providerAsn} · {f.product}{up ? ` · ${fmtBw(f.traffic.outMbps)} out · ${fmtBw(f.traffic.inMbps)} in` : ''}</small></div>
        <span className="row" style={{ gap: 6, marginLeft: 'auto' }}>
          <Chip tone={up ? 'success' : f.status === 'Ordered' ? 'neutral' : 'error'} size="xs" dot>{f.status === 'Ordered' ? 'Ordered' : up ? 'Up' : 'Down'}</Chip>
          {up && <Chip tone="info" size="xs">{f.bgp.role}</Chip>}
        </span>
      </header>
      <h4>Plan<Info text="The contract: port speed, committed rate, how it is billed, price per Mbps (and above the commit), monthly charge and term." /></h4>
      <KV cols={3} items={[
        ['Port', port(f.portMbps)], ['Committed', fmtBw(f.commitMbps)], ['Billing', f.billing],
        ['Price', `${fmtMoney(f.pricePerMbps)} / Mbps`], ['Burst', `${fmtMoney(f.burstPerMbps)} / Mbps`], ['Monthly', fmtMoney(f.mrc)],
        ['Term', `${f.termMonths} months`], ['Started', fmtDate(f.termStart)], ['Ends', fmtDate(f.termEnd)]
      ]} />
      <h4>Circuit & SLA<Info text="The provider's circuit id (quote it to their NOC), delivery, the SLA they sign up to and who to call." /></h4>
      <KV cols={3} items={[
        ['Circuit', <span className="mono">{f.circuit}</span>], [f.status === 'Ordered' ? 'Due' : 'Delivered', f.due ? fmtDate(f.due) : f.delivered ? fmtDate(f.delivered) : '—'], ['Availability', `${f.sla.availabilityPct}%`],
        ['Time to repair', `${f.sla.mttrH} h`], ['Latency to POP', `${f.sla.latencyMs} ms`], ['Account manager', f.accountManager],
        ['NOC', f.noc.phone], ['Portal', f.noc.portal], ['Ticket ref', <span className="mono">{f.noc.ticketPrefix}-…</span>]
      ]} />
      <h4>Router & BGP<Info text="Where the feed lands on our side and the eBGP session over it: state, addresses, prefixes received (full table) and the policy that makes it primary, backup or active." /></h4>
      <KV cols={3} items={[
        ['Router port', <NeLink id={f.neId} tab="links">{f.neId.split('-').slice(-2).join('-')} {f.ifName}</NeLink>], ['Optic', f.optic], ['Cross-connect', <span className="mono">{f.xc}</span>],
        ['Session', f.bgp.state === 'Established' ? `Established · ${fmtUptime(f.bgp.uptimeMin)}` : f.bgp.state], ['Peer', <span className="mono">{f.bgp.peerIp} AS{f.bgp.peerAsn}</span>], ['Local', <span className="mono">{f.bgp.localIp}</span>],
        ['Received', up ? `${fmtNum(f.bgp.received4)} v4 · ${fmtNum(f.bgp.received6)} v6` : '—'], ['Policy', `${f.bgp.role} · local-pref ${f.bgp.localPref}${f.bgp.prepend ? ` · prepend ×${f.bgp.prepend}` : ''}`],
        ['Protection', `BFD · RPKI · ${f.bgp.auth} · max ${fmtNum(f.bgp.maxPrefix)}`]
      ]} />
      <h4>Into the building<Info text="The carrier's demarc device, the building entry and street route the provider's fibre takes, and its POP." /></h4>
      <KV cols={3} items={[['Demarc', f.demarc], ['Entry', f.entry], ['Street route', f.streetRoute], ['POP', `${f.pop} · ~${f.popKm} km`]]} />
    </section>
  );
}
