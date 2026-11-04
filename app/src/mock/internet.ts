/* Internet edge (04-Nov-2026, user: "if this is a fibre line to provide the internet to the datacenter, are we managing those details …
   which fibre cable, which plan, which router and cabling, to manage the HA for internet"). Phase 1 = records and HA, NeoCloud × USA only.
   Per live site: two IP transit feeds from different upstream providers (the plan, the circuit, the SLA, the NOC), each landing on its own
   border router port (BDR-01 / BDR-02, a free 100G or 10G port), through a cross-connect to the carrier demarc in the ODF / patching rack,
   out through a building entry and a street route to the provider's POP; one eBGP session per feed (full table, RPKI, BFD).
   Seeded weaknesses (what a route audit finds): Tier II sites have one building entry, so both feeds share it; one Tier III site's
   "diverse" feeds share a duct for a few hundred metres; one site has both feeds on one router; the site being built has one feed in
   service and the second on order; one site buys both feeds from the same provider; one site's failover test is overdue.
   Seeded on each site's own id (never the generator's stream). The generator's last phase marks the chosen router ports
   (`markTransitPorts`, description + state), so the device page shows them in use; nothing else generated changes.
   Prices are real-market USD (like the power tariffs), never run through money(). Addresses are documentation / benchmarking ranges. */
import type { CableHop, CablePath, Datacenter, InetFinding, Interface, SiteInternet, SitePhysical, TransitFeed } from '../api/types';
import type { Db } from './generate';
import { mulberry32, seedOf, intBetween, between, type Rnd } from '../lib/rng';
import { activeGeo, dcAt } from './geo';
import { edgeId } from './personas';
import { DAY, MIN } from './seed';

const OPER_ASN = 64500; /* the operator's ASN, as in IP & Network (mock/ipam.ts) */
const BACKHAUL = new Set(['xe-0/0/1', 'xe-0/0/2', 'xe-0/0/3', 'xe-0/0/4', 'xe-0/0/5']); /* reserved for the inter-datacenter links */
const PROVIDERS = [
  { name: 'Lumen', asn: 3356, code: 'LMN', am: 'Dana Whitfield' }, { name: 'Cogent', asn: 174, code: 'COG', am: 'Marcus Lee' },
  { name: 'Zayo', asn: 6461, code: 'ZYO', am: 'Erin Castillo' }, { name: 'Arelion', asn: 1299, code: 'ARL', am: 'Nils Berg' },
  { name: 'NTT', asn: 2914, code: 'NTT', am: 'Kenji Mori' }, { name: 'GTT', asn: 3257, code: 'GTT', am: 'Paula Grant' },
  { name: 'Verizon Business', asn: 701, code: 'VZB', am: 'Tom Alvarez' }
];
const DEMARC = ['Ciena 3926 NID', 'Adtran NetVanta NID', 'Ciena 5164 NID', 'Juniper ACX7024 (carrier-managed)'];
const STREETS = ['Industrial Pkwy', 'Tech Center Dr', 'Commerce Blvd', 'Corporate Way', 'Data Center Ln', 'Innovation Dr', 'Gateway Blvd', 'Enterprise Rd'];

/* applies to the NeoCloud persona in the USA only (phase 1) */
export const hasInternet = (db: Db) => db.persona === 'neocloud' && activeGeo().id === 'us';
const live = (dc: Datacenter) => dc.status !== 'planned';
const tier2 = (dc: Datacenter) => dc.tier === 'Tier II';

interface Plan { site: Omit<SiteInternet, 'feeds' | 'findings' | 'ha' | 'haText' | 'totals'>; feeds: Omit<TransitFeed, 'path'>[]; findings: InetFinding[] }
const plans = new WeakMap<Db, Map<string, Plan>>();

function freePort(db: Db, neId: string, mbps: number, taken: Set<string>): Interface | undefined {
  return db.ifaces.get(neId)?.find(i => i.speedMbps === mbps && !i.peer && !BACKHAUL.has(i.name) && !taken.has(`${neId}:${i.name}`) && (i.description === '' || i.description.startsWith('Transit')));
}

function planSite(db: Db, dc: Datacenter, index: number): Plan | null {
  const r: Rnd = mulberry32(seedOf(`${dc.id}:internet`));
  const b1 = db.neById.get(edgeId(db.persona, dc.id, 1)), b2 = db.neById.get(edgeId(db.persona, dc.id, 2));
  if (!b1) return null;
  const big = !tier2(dc) && dc.racks.length >= 30;
  const portMbps = big ? 100000 : 10000;
  /* the two providers: different ones, except at the one site that bought both from the same provider */
  const p1 = PROVIDERS[seedOf(`${dc.id}:isp`) % PROVIDERS.length];
  const sameProvider = dc.id === dcAt(11);
  const rest = PROVIDERS.filter(p => p !== p1);
  const p2 = sameProvider ? p1 : rest[seedOf(`${dc.id}:isp2`) % rest.length];
  const oneRouter = dc.id === dcAt(16) || !b2;
  const ordered = dc.id === dcAt(24);
  const sharedDuct = dc.id === dcAt(3);
  const testOverdue = dc.id === dcAt(21);
  const taken = new Set<string>();
  const mode: SiteInternet['mode'] = big ? 'Active / active' : 'Primary / backup';
  const v4 = `198.18.${index * 2}.0/23`, v6 = `2001:db8:${(0x100 + index).toString(16)}::/48`;
  const odf = dc.racks.find(rk => rk.role === 'ODF / patching') ?? dc.racks[dc.racks.length - 1];
  const street = STREETS[seedOf(dc.id) % STREETS.length];
  const commit = Math.round(portMbps * between(r, 0.15, 0.4) / 1000) * 1000 || 1000;
  const lastTestAt = db.now - (testOverdue ? intBetween(r, 400, 460) : intBetween(r, 35, 170)) * DAY;
  const feeds: Plan['feeds'] = (['A', 'B'] as const).map((side, k) => {
    const p = k ? p2 : p1;
    const router = k && !oneRouter ? b2! : b1;
    const port = freePort(db, router.id, portMbps, taken) ?? freePort(db, router.id, 10000, taken);
    if (port) taken.add(`${router.id}:${port.name}`);
    const isOrdered = ordered && k === 1;
    const price = portMbps >= 100000 ? Math.round(between(r, 0.09, 0.2) * 100) / 100 : Math.round(between(r, 0.28, 0.55) * 100) / 100;
    const start = Math.max(dc.commissionedOn ?? db.now - 900 * DAY, db.now - intBetween(r, 120, 1000) * DAY);
    const term = k ? 36 : 24 + 12 * intBetween(r, 0, 2);
    const inMbps = isOrdered ? 0 : Math.round(commit * between(r, 0.3, 0.7) * (mode === 'Primary / backup' && k ? 0.08 : 1));
    const entry = tier2(dc) ? 'Building entry 1 (north vault)' : k ? 'Building entry 2 (south vault)' : 'Building entry 1 (north vault)';
    const route = tier2(dc) ? `${street} conduit (north)` : k ? `${STREETS[(seedOf(dc.id) + 3) % STREETS.length]} conduit (south)` : `${street} conduit (north)`;
    const role: TransitFeed['bgp']['role'] = mode === 'Active / active' ? 'Active' : k ? 'Backup' : 'Primary';
    const host = 2 * (index * 2 + k);
    return {
      id: `INET-${dc.id}-${side}`, dcId: dc.id, side, provider: p.name, providerAsn: p.asn, product: 'IP Transit (DIA)', circuit: `${p.code}/IPT/${String(seedOf(`${dc.id}:${side}:cid`) % 900000 + 100000)}`,
      status: isOrdered ? 'Ordered' : 'In service',
      portMbps: port?.speedMbps ?? portMbps, commitMbps: commit, billing: '95th percentile, monthly', pricePerMbps: price, burstPerMbps: Math.round(price * 1.25 * 100) / 100,
      mrc: Math.round(commit * price), termMonths: term, termStart: start, termEnd: start + term * 30.4 * DAY,
      ...(isOrdered ? { due: db.now + 23 * DAY } : { delivered: start }),
      sla: { availabilityPct: p.asn === 174 ? 99.9 : 99.99, mttrH: p.asn === 174 ? 8 : 4, latencyMs: 2 + (seedOf(p.name + dc.id) % 4) },
      noc: { phone: `+1 800 555-0${String(100 + PROVIDERS.indexOf(p) * 7).slice(-3)}`, portal: `${p.name} customer portal`, ticketPrefix: `${p.code}-TT` }, accountManager: p.am,
      neId: router.id, ifName: port?.name ?? '—', optic: (port?.speedMbps ?? portMbps) >= 100000 ? '100GBASE-LR4 QSFP28' : '10GBASE-LR SFP+',
      xc: `XC-${dc.id.slice(-6)}-T${k + 1}`, demarc: `${DEMARC[(seedOf(p.name) + k) % DEMARC.length]} · ${odf.name}`, entry, streetRoute: route,
      pop: `${p.name} POP ${dc.city}`, popKm: Math.round(between(r, 4, 28)),
      bgp: {
        state: isOrdered ? 'Not configured' : 'Established', localIp: `203.0.113.${(host + 1) % 256}`, peerIp: `203.0.113.${host % 256}`, peerAsn: p.asn,
        uptimeMin: isOrdered ? 0 : Math.round((db.now - lastTestAt) / MIN), received4: isOrdered ? 0 : 1_012_000 + intBetween(r, 0, 9000), received6: isOrdered ? 0 : 214_000 + intBetween(r, 0, 4000),
        announced: [v4, v6], role, localPref: role === 'Primary' ? 200 : 100, prepend: role === 'Backup' ? 2 : 0, bfd: true, rpki: true, maxPrefix: 1_200_000, auth: 'TCP-AO'
      },
      traffic: { inMbps, outMbps: Math.round(inMbps * between(r, 1.3, 2.4)) }
    };
  });

  const findings: InetFinding[] = [];
  const [fa, fb] = feeds;
  if (ordered) findings.push({ id: `${dc.id}-INET-SINGLE`, severity: 'major', kind: 'single', title: `One internet feed in service: ${fb.provider} feed on order`,
    detail: `Only ${fa.provider} (${fa.circuit}) carries the site's internet traffic. The second feed from ${fb.provider} is due ${Math.round(23)} days from now; until then a fault on ${fa.provider}'s side, the router port or the street route takes the site off the internet.`,
    fix: `Chase ${fb.provider} for the delivery date; avoid maintenance on ${fa.neId.replace(`${dc.id}-`, '')} and its cross-connect until the second feed is up and tested.`, feedIds: [fa.id, fb.id] });
  if (tier2(dc) && !ordered) findings.push({ id: `${dc.id}-INET-ENTRY`, severity: 'major', kind: 'entry', title: 'Both internet feeds enter the building through one entry',
    detail: `${fa.provider} and ${fb.provider} both come in through ${fa.entry} along ${fa.streetRoute}. The feeds are logically redundant but one dig-up outside the building cuts both (Tier II: one entry by design).`,
    fix: 'Ask one provider for a diverse route into a second entry, or buy the second feed as a wireless / different-street path.', feedIds: [fa.id, fb.id] });
  if (sharedDuct) findings.push({ id: `${dc.id}-INET-DUCT`, severity: 'major', kind: 'duct', title: 'The two "diverse" internet feeds share a duct for 350 m',
    detail: `The route audit found ${fa.provider} and ${fb.provider} in the same conduit under ${street} for about 350 m before they split to the two entries. On paper they are diverse; one excavation there cuts both.`,
    fix: `Ask ${fb.provider} to re-route its lateral to the south vault along another street, and add a route-diversity clause (KML of the route) to both contracts.`, feedIds: [fa.id, fb.id] });
  if (oneRouter && b2) findings.push({ id: `${dc.id}-INET-ROUTER`, severity: 'major', kind: 'router', title: `Both internet feeds terminate on ${b1.name}`,
    detail: `${fa.provider} lands on ${fa.ifName} and ${fb.provider} on ${fb.ifName}, both on ${b1.name}. A failure or a software upgrade of that one router takes the site off the internet; ${b2.name} carries no transit.`,
    fix: `Move ${fb.provider}'s cross-connect to a free port on ${b2.name} (one patch change, BGP re-established on the new port) and re-run the failover test.`, feedIds: [fa.id, fb.id] });
  if (sameProvider) findings.push({ id: `${dc.id}-INET-PROVIDER`, severity: 'minor', kind: 'provider', title: `Both internet feeds are bought from ${fa.provider}`,
    detail: `Two circuits, two router ports, but one provider and one backbone: a ${fa.provider} outage, route leak or billing dispute takes both feeds at once.`,
    fix: `Replace one feed with a second provider at the next term end (${new Date(fb.termEnd).toISOString().slice(0, 10)}).`, feedIds: [fa.id, fb.id] });
  if (testOverdue) findings.push({ id: `${dc.id}-INET-TEST`, severity: 'minor', kind: 'test', title: 'Internet failover not tested in over 12 months',
    detail: `Last test ${Math.round((db.now - lastTestAt) / DAY)} days ago. Without a test nobody knows whether the backup feed really takes all the traffic (prefix filters, session limits, capacity).`,
    fix: 'Book a standard change: shut the primary BGP session in a quiet window, watch the traffic move, restore.', feedIds: [fa.id, fb.id] });
  return {
    site: { dcId: dc.id, asn: OPER_ASN, prefixes: [v4, v6], mode,
      lastTest: { at: lastTestAt, result: 'Pass', text: ordered ? 'Not tested yet: one feed in service' : `Traffic moved to ${fb.provider} in ${intBetween(r, 18, 55)} s; restored on ${fa.provider}` } },
    feeds, findings
  };
}

function plansOf(db: Db): Map<string, Plan> {
  let m = plans.get(db);
  if (!m) {
    m = new Map();
    if (hasInternet(db)) db.datacenters.forEach((dc, i) => { if (live(dc)) { const p = planSite(db, dc, i + 1); if (p) m!.set(dc.id, p); } });
    plans.set(db, m);
  }
  return m;
}

/* generator's last phase: the chosen router ports carry the transit circuit (description, up / reserved) */
export function markTransitPorts(db: Db) {
  if (!hasInternet(db)) return;
  for (const p of plansOf(db).values()) for (const f of p.feeds) {
    const it = db.ifaces.get(f.neId)?.find(i => i.name === f.ifName); if (!it) continue;
    it.description = `Transit: ${f.provider} ${f.circuit}`;
    it.state = f.status === 'Ordered' ? 'reserved' : 'up';
    it.utilPct = f.status === 'Ordered' ? 0 : Math.round((Math.max(f.traffic.inMbps, f.traffic.outMbps) / f.portMbps) * 100);
  }
}

export const internetFindings = (db: Db, dcId: string): InetFinding[] => plansOf(db).get(dcId)?.findings ?? [];
export const internetRouters = (db: Db, dcId: string): string[] => [...new Set(plansOf(db).get(dcId)?.feeds.map(f => f.neId) ?? [])];
export const internetSites = (db: Db) => [...plansOf(db).keys()];

/* the feed's cable path: router port → optic → cord → cabinet panel → trunk → ODF → cross-connect → carrier demarc → building entry → street → POP */
function pathOf(db: Db, dc: Datacenter, f: Omit<TransitFeed, 'path'>, phys: SitePhysical | null, shared: { entry: boolean; duct: boolean }): CablePath {
  const ne = db.neById.get(f.neId)!;
  const rackN = (id: string) => dc.racks.find(rk => rk.id === id)?.name ?? id;
  const it = db.ifaces.get(ne.id)?.find(i => i.name === f.ifName);
  const trunk = phys?.trunks.find(t => t.aRackId === ne.rackId);
  const odf = dc.racks.find(rk => rk.role === 'ODF / patching') ?? dc.racks[dc.racks.length - 1];
  const port = f.side === 'A' ? 23 : 24;
  const hops: CableHop[] = [
    { kind: 'port', id: `${ne.id}:${f.ifName}`, label: `${ne.name} ${f.ifName}`, sub: it ? `${it.type} · ${it.state}` : undefined, where: `${rackN(ne.rackId)} · U${ne.u}`, neId: ne.id, state: f.status === 'Ordered' ? 'off' : 'ok' },
    { kind: 'optic', id: `${ne.id}:${f.ifName}:xcvr`, label: f.optic, sub: f.status === 'Ordered' ? 'Installed, no light yet' : 'Rx −3.1 dBm · Tx −1.2 dBm', neId: ne.id, state: f.status === 'Ordered' ? 'off' : 'ok' }
  ];
  if (ne.rackId !== odf.id) {
    hops.push({ kind: 'cord', id: `${f.id}-CORD`, label: 'LC–LC OS2 patch cord · 3 m', where: rackN(ne.rackId), state: 'ok' });
    hops.push({ kind: 'panel', id: `${ne.rackId}-PP-F1`, label: `${rackN(ne.rackId)} PP-F1 · port ${port}`, where: `${rackN(ne.rackId)} · top of rack`, state: 'ok' });
    if (trunk) hops.push({ kind: 'trunk', id: trunk.id, label: `Trunk ${trunk.id.split('-').slice(-2).join('-')}`, sub: `${trunk.kind} · ${trunk.lengthM} m · ${trunk.route}`, where: `${rackN(ne.rackId)} → ${rackN(trunk.zRackId)}`, state: trunk.state });
    hops.push({ kind: 'panel', id: `${odf.id}-ODF-T`, label: `ODF-T · port ${port}`, where: `${odf.name} · ODF / patching`, state: 'ok' });
  }
  hops.push({ kind: 'jumper', id: f.xc, label: `Cross-connect ${f.xc}`, sub: 'Singlemode duplex jumper to the carrier demarc', where: `${odf.name} · ODF / patching`, state: 'ok' });
  hops.push({ kind: 'panel', id: `${f.id}-NID`, label: `Carrier demarc · ${f.demarc.split(' · ')[0]}`, sub: `${f.provider}'s hand-off, circuit ${f.circuit}`, where: `${odf.name} · carrier-owned`, state: f.status === 'Ordered' ? 'off' : 'ok' });
  hops.push({ kind: 'osp', id: `${f.id}-ENTRY`, label: f.entry, sub: `${f.provider} lateral · ${f.streetRoute}`, where: 'Building entry',
    state: shared.entry || shared.duct ? 'warn' : 'ok', note: shared.entry ? 'Shared with the other feed: one entry for both' : shared.duct ? 'Shares a duct with the other feed for about 350 m outside' : undefined });
  hops.push({ kind: 'osp', id: `${f.id}-POP`, label: f.pop, sub: `~${f.popKm} km of ${f.provider} metro fibre · AS${f.providerAsn}`, where: 'Upstream provider', state: f.status === 'Ordered' ? 'off' : 'ok' });
  const state = hops.some(h => h.state === 'bad') ? 'bad' : hops.some(h => h.state === 'warn') ? 'warn' : 'ok';
  const suspect = hops.findIndex(h => h.state === 'warn');
  return {
    linkId: f.id, aNe: ne.id, aIf: f.ifName, zNe: f.provider, zIf: f.circuit, kind: 'inter-site', hops, state, suspect: suspect >= 0 ? suspect : null,
    verdict: f.status === 'Ordered' ? 'Ordered: port, optic and cross-connect ready, waiting for the provider' : state === 'ok' ? 'Own entry and route, all segments clean' : 'Diversity risk on the outside route',
    lengthM: Math.round((hops.reduce((m, h) => m + Number(/(\d+) m\b/.exec(h.sub ?? h.label)?.[1] ?? 0), 0)))
  };
}

const views = new WeakMap<Db, Map<string, SiteInternet>>();
export function siteInternet(db: Db, dcId: string, phys: SitePhysical | null): SiteInternet | null {
  const p = plansOf(db).get(dcId); if (!p) return null;
  let m = views.get(db); if (!m) { m = new Map(); views.set(db, m); }
  const hit = m.get(dcId); if (hit) return hit;
  const dc = db.datacenters.find(d => d.id === dcId)!;
  const shared = { entry: p.findings.some(x => x.kind === 'entry'), duct: p.findings.some(x => x.kind === 'duct') };
  const feeds: TransitFeed[] = p.feeds.map(f => {
    const it = db.ifaces.get(f.neId)?.find(i => i.name === f.ifName);
    const up = f.status === 'In service' && it?.state !== 'down';
    return { ...f, bgp: { ...f.bgp, state: up ? f.bgp.state : f.bgp.state === 'Established' ? 'Not configured' : f.bgp.state }, path: pathOf(db, dc, f, phys, shared) };
  });
  const inService = feeds.filter(f => f.status === 'In service' && f.bgp.state === 'Established');
  const ha: SiteInternet['ha'] = inService.length < 2 ? 'single' : p.findings.some(x => x.severity === 'major' || x.severity === 'critical') ? 'at-risk' : 'redundant';
  const worst = p.findings[0];
  const haText = ha === 'single' ? 'One feed in service: no internet redundancy'
    : ha === 'at-risk' ? `Two feeds up, but ${worst?.kind === 'entry' ? 'one building entry for both' : worst?.kind === 'duct' ? 'they share a duct outside' : worst?.kind === 'router' ? 'both on one router' : 'a shared point of failure'}`
      : `Two feeds, ${new Set(feeds.map(f => f.provider)).size > 1 ? 'two providers' : 'one provider'}, two routers, two entries${p.findings.some(x => x.kind === 'test') ? ' · failover test overdue' : ''}`;
  const sum = (k: (f: TransitFeed) => number) => feeds.reduce((a, f) => a + k(f), 0);
  const v: SiteInternet = { ...p.site, feeds, findings: p.findings, ha, haText,
    totals: { inService: inService.length, portMbps: sum(f => f.status === 'In service' ? f.portMbps : 0), commitMbps: sum(f => f.status === 'In service' ? f.commitMbps : 0), inMbps: sum(f => f.traffic.inMbps), outMbps: sum(f => f.traffic.outMbps), mrc: sum(f => f.status === 'In service' ? f.mrc : 0), providers: new Set(feeds.map(f => f.provider)).size } };
  m.set(dcId, v);
  return v;
}

/* estate roll-up for the Command center network row: feeds in service vs installed, sites with no redundancy */
export function internetEstate(db: Db) {
  const ps = [...plansOf(db).values()];
  const feeds = ps.flatMap(p => p.feeds);
  const up = feeds.filter(f => f.status === 'In service' && db.ifaces.get(f.neId)?.find(i => i.name === f.ifName)?.state !== 'down');
  const single = ps.filter(p => p.feeds.filter(f => up.includes(f)).length < 2).map(p => p.site.dcId);
  return { feeds: feeds.filter(f => f.status === 'In service').length, up: up.length, single };
}
