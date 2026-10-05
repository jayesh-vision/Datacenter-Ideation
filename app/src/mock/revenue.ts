/* Revenue-impact model: what every active datacenter issue is costing.

   One pass over the services. A service that is Down or Degraded is losing revenue now; a service
   that is still Active but rides a critical fault (UPS on battery, a failed cooling unit, a critical
   alarm on its own path) is "exposed" — nothing lost yet, a lot at stake. Each impacted service is
   attributed to exactly ONE issue (its most severe cause; the open incident tracking that fault when
   there is one), so money never double counts across issues, datacenters or customers.

   Money:
     rate    = monthly charge ÷ 730 h, × 1.0 when down, × DEGRADED_FACTOR when degraded
     lost    = rate × hours since the fault began (pro-rata revenue for service not delivered)
     credits = SLA credit triggered by the extra downtime: the 30-day uptime drops by the impacted
               minutes; the shortfall against the SLA target picks the credit tier (10 / 25 / 50% of the
               monthly charge). Credits a service already owed before this fault are "locked in" and
               reported separately, not charged to the issue.
   Deterministic and derived from the same alarms, incidents and services every other screen uses. */

import type { Datacenter, ImpactCause, Incident, RevCliff, RevCustomer, RevCustomerHit, RevDc, RevDomain, RevExposure, RevIssue, RevMoney, RevRack, RevenueView, Service, Severity } from '../api/types';
import { REV_DOMAINS } from '../api/types';
import type { Db } from './generate';
import { isOpen } from './incidents';
import { DAY, HOUR, MIN } from './seed';

export const DEGRADED_FACTOR = 0.3;
export const OUTAGE_HOURS = 4;            // "if it fails": credits after an outage this long (the SEV1 resolution target)
const MONTH_H = 730, MONTH_MIN = 43200;
const STEPS = [0, 0.5, 2];                // SLA shortfall (points below target) at which the credit steps up
const tier = (short: number) => (short <= 1e-9 ? 0 : short < 0.5 ? 0.10 : short < 2 ? 0.25 : 0.50);
const SEV_W: Record<Severity, number> = { critical: 0, major: 1, minor: 2, warning: 3 };
const INC_DOMAIN: Record<Incident['type'], RevDomain> = { Network: 'Network', Power: 'Power', Cooling: 'Cooling', Rack: 'Capacity', Capacity: 'Capacity', Security: 'Network' };

const KIND_W: Record<ImpactCause['kind'], number> = { link: 0, interface: 0, rack: 1, site: 1, device: 2, utilisation: 3 };
const REDUNDANCY_ONLY = /Power Supply Fault/;
const SELF_LOAD = /Over Power Budget/;
const hash = (x: string) => { let h = 7; for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) >>> 0; return h; };

type State = 'down' | 'degraded' | 'exposed';
interface Row { s: Service; state: State; w: number; cause: ImpactCause; key: string; since: number; hourly: number; short0: number }

const zero = (): RevMoney => ({ mrrDown: 0, mrrDegraded: 0, mrrExposed: 0, rate: 0, lost: 0, credits: 0 });
/* money a row has cost after `h` hours of impact */
function costAt(r: Row, h: number) {
  if (r.state === 'exposed' || h <= 0) return { lost: 0, credits: 0 };
  const short = r.short0 + ((h * 60 * r.w) / MONTH_MIN) * 100;
  return { lost: r.hourly * r.w * h, credits: Math.max(0, tier(short) - tier(r.short0)) * r.s.revenueMonthly };
}
/* the next credit step for a row that is losing revenue */
function cliffOf(r: Row, h: number): { inMin: number; amount: number } | null {
  if (r.state === 'exposed') return null;
  const short = r.short0 + ((h * 60 * r.w) / MONTH_MIN) * 100;
  const next = STEPS.find(x => x > short - 1e-9 && tier(x + 1e-6) > tier(short));
  if (next === undefined) return null;
  return { inMin: Math.max(0, ((next - short) / 100) * MONTH_MIN / r.w), amount: (tier(next + 1e-6) - tier(short)) * r.s.revenueMonthly };
}
const add = (m: RevMoney, r: Row, c: { lost: number; credits: number }) => {
  if (r.state === 'down') m.mrrDown += r.s.revenueMonthly; else if (r.state === 'degraded') m.mrrDegraded += r.s.revenueMonthly; else m.mrrExposed += r.s.revenueMonthly;
  m.rate += r.state === 'exposed' ? 0 : r.hourly * r.w; m.lost += c.lost; m.credits += c.credits;
};
const round = <T extends RevMoney>(m: T): T => { (['mrrDown', 'mrrDegraded', 'mrrExposed', 'rate', 'lost', 'credits'] as const).forEach(k => { m[k] = Math.round(m[k]); }); return m; };

export interface RevModel { rows: Row[]; issues: Map<string, RevIssue>; rowsByIssue: Map<string, Row[]> }

export function buildRevenue(db: Db, why: (s: Service) => ImpactCause[]): RevModel {
  const now = db.now;
  const incById = new Map(db.incidents.map(i => [i.id, i]));
  const custById = new Map(db.customers.map(c => [c.id, c]));
  const linkState = new Map(db.links.map(l => [l.id, l.state]));
  const rows: Row[] = [];
  for (const s of db.services) {
    if (s.status === 'Disabled' || !s.revenueMonthly) continue;
    const causes = why(s);
    /* the cause that explains the impact: most severe first; a fault on the service's own link, port, rack or site
       before a device alarm; a redundancy-only alarm (single PSU) last; the fault an incident already tracks first */
    const cause = [...causes].sort((a, b) => SEV_W[a.severity] - SEV_W[b.severity] || Number(REDUNDANCY_ONLY.test(a.title)) - Number(REDUNDANCY_ONLY.test(b.title)) || KIND_W[a.kind] - KIND_W[b.kind] || Number(!!b.incidentId) - Number(!!a.incidentId))[0];
    const state: State | null = s.status === 'Down' ? 'down' : s.status === 'Degraded' ? 'degraded' : cause && cause.severity === 'critical' ? 'exposed' : null;
    if (!state || !cause) continue;
    /* not a revenue loss: a service running hot inside its own contracted size (a full cabinet, a busy VM, a tenant
       over its contracted draw) — that is the customer's sizing, not a fault we owe credits for */
    const linkDown = s.linkIds.some(id => linkState.get(id) === 'down');
    if (state === 'degraded' && !linkDown && cause.severity !== 'critical' && (cause.kind === 'utilisation' || SELF_LOAD.test(cause.title) || (s.utilPct >= 90 && cause.kind === 'device'))) continue;
    const key = cause.incidentId ?? (cause.kind === 'site' ? cause.code : cause.kind === 'utilisation' ? `${s.dcId}|capacity` : `${s.dcId}|${cause.title}`);
    rows.push({ s, state, w: state === 'down' ? 1 : state === 'degraded' ? DEGRADED_FACTOR : 0, cause, key, since: Math.max(now - 30 * DAY, Math.min(now, cause.since ?? now - 2 * HOUR)), hourly: s.revenueMonthly / MONTH_H, short0: s.slaTarget - s.uptime30d });
  }
  const rowsByIssue = new Map<string, Row[]>();
  rows.forEach(r => rowsByIssue.set(r.key, [...(rowsByIssue.get(r.key) ?? []), r]));

  const issues = new Map<string, RevIssue>();
  for (const [key, rs] of rowsByIssue) {
    const inc = incById.get(key);
    const worst = rs.reduce((a, r) => (SEV_W[r.cause.severity] < SEV_W[a.cause.severity] ? r : a), rs[0]);
    const dcId = inc?.dcId ?? rs[0].s.dcId;
    const since = inc ? Math.min(inc.detected, ...rs.map(r => r.since)) : Math.min(...rs.map(r => r.since));
    const m = zero();
    let forecast24 = 0, potentialRate = 0, potentialCredits = 0;
    const cliffs: { inMin: number; amount: number }[] = [];
    const cust = new Map<string, RevIssue['top'][number]>();
    for (const r of rs) {
      const h = (now - r.since) / HOUR;
      const c = costAt(r, h); add(m, r, c);
      const f = costAt(r, h + 24); forecast24 += f.lost + f.credits;
      if (r.state === 'exposed') { potentialRate += r.hourly; potentialCredits += Math.max(0, tier(r.short0 + (OUTAGE_HOURS * 60 / MONTH_MIN) * 100) - tier(r.short0)) * r.s.revenueMonthly; }
      const cl = cliffOf(r, h); if (cl) cliffs.push(cl);
      const cu = custById.get(r.s.customerId)!;
      const e = cust.get(cu.id) ?? { id: cu.id, name: cu.name, premium: cu.premium, services: 0, mrr: 0, lost: 0, credits: 0, state: r.state };
      e.services++; e.mrr += r.s.revenueMonthly; e.lost += c.lost; e.credits += c.credits;
      if (r.state === 'down' || (r.state === 'degraded' && e.state === 'exposed')) e.state = r.state;
      cust.set(cu.id, e);
    }
    /* the soonest credit step, with everything that steps within the following half hour */
    let nextCliff: RevCliff | null = null;
    if (cliffs.length) { const first = Math.min(...cliffs.map(c => c.inMin)); const grp = cliffs.filter(c => c.inMin <= first + 30); nextCliff = { inMin: Math.round(first), amount: Math.round(grp.reduce((a, c) => a + c.amount, 0)), services: grp.length }; }
    /* cumulative impact: from the start of the fault to 24 h ahead; an exposed-only issue shows "if it fails now" */
    const losing = rs.filter(r => r.state !== 'exposed');
    const potential = !losing.length;
    /* samples: the past up to exactly `now`, then the next 24 h */
    const t1 = now + 24 * HOUR, past = potential ? 0 : Math.max(0, now - since);
    const nPast = potential || !past ? 0 : Math.max(6, Math.min(24, Math.round((48 * past) / (past + 24 * HOUR)))), nNext = 48 - nPast;
    const t: number[] = [...Array.from({ length: nPast }, (_, k) => since + (past * k) / nPast), ...Array.from({ length: nNext + 1 }, (_, k) => now + ((t1 - now) * k) / nNext)];
    const v = t.map(at => Math.round(potential
      ? rs.reduce((a, r) => { const h = (at - now) / HOUR; return a + r.hourly * h + Math.max(0, tier(r.short0 + ((h * 60) / MONTH_MIN) * 100) - tier(r.short0)) * r.s.revenueMonthly; }, 0)
      : losing.reduce((a, r) => { const c = costAt(r, (at - r.since) / HOUR); return a + c.lost + c.credits; }, 0)));
    const nowIdx = nPast;
    const wheres = [...new Set(rs.map(r => r.cause.where))];
    const util = !inc && worst.cause.kind === 'utilisation';
    const recentChange = inc ? (inc.changeIds[0] ?? db.changes.find(c => c.dcId === inc.dcId && c.status === 'Completed' && c.windowEnd <= inc.detected && c.windowEnd > inc.detected - 3 * DAY)?.id) : undefined;
    const resUsed = inc ? (now - inc.detected) / MIN : 0;
    issues.set(key, round({
      ...m, id: key, kind: inc ? 'incident' : 'fault', title: inc ? inc.title : util ? 'Running at the capacity limit' : worst.cause.title,
      where: inc ? dcId : wheres.length === 1 ? wheres[0] : `${wheres.length} locations`, dcId, domain: inc ? INC_DOMAIN[inc.type] : worst.cause.domain ?? 'Device', severity: worst.cause.severity,
      to: inc ? `/incidents/${inc.id}` : util ? `/datacenters/${dcId}?tab=customers&cview=risk` : wheres.length === 1 ? worst.cause.to : `/alerts?dc=${dcId}&q=${encodeURIComponent(worst.cause.title)}`,
      incident: inc ? { id: inc.id, sev: inc.sev, status: inc.status, owner: inc.owner, resolveLeft: Math.round(inc.resolveSlaMin - resUsed), breaching: resUsed > inc.resolveSlaMin } : undefined,
      since, services: rs.length, down: rs.filter(r => r.state === 'down').length, degraded: rs.filter(r => r.state === 'degraded').length, exposed: rs.filter(r => r.state === 'exposed').length,
      customers: cust.size, premium: [...cust.values()].filter(c => c.premium).length, nextCliff, forecast24: Math.round(forecast24), potentialRate: Math.round(potentialRate), potentialCredits: Math.round(potentialCredits),
      changeId: recentChange, rank: 0, underPrioritised: false,
      top: [...cust.values()].sort((a, b) => b.lost + b.credits - (a.lost + a.credits) || b.mrr - a.mrr).slice(0, 6).map(c => ({ ...c, mrr: Math.round(c.mrr), lost: Math.round(c.lost), credits: Math.round(c.credits) })),
      curve: { t, v, nowIdx, potential }
    }));
  }
  return { rows, issues, rowsByIssue };
}

/* the open issues hitting one customer, costliest first (same money as the estate view, cut by customer) */
export function customerHits(db: Db, model: RevModel, customerId: string, issueOf: (id: string) => RevIssue | undefined): RevCustomerHit[] {
  const by = new Map<string, RevCustomerHit>();
  for (const r of model.rows) {
    if (r.s.customerId !== customerId) continue;
    const issue = issueOf(r.key); if (!issue) continue;
    const e = by.get(r.key) ?? { ...zero(), issue, services: 0, down: 0, degraded: 0, exposed: 0, mrr: 0 };
    add(e, r, costAt(r, (db.now - r.since) / HOUR)); e.services++; e[r.state]++; e.mrr += r.s.revenueMonthly;
    by.set(r.key, e);
  }
  return [...by.values()].map(e => ({ ...round(e), mrr: Math.round(e.mrr) })).sort((a, b) => b.lost + b.credits - (a.lost + a.credits) || b.rate - a.rate || b.mrrExposed - a.mrrExposed);
}

/* ranking: what is costing the most first (impact so far, then burn rate), then what has the most at stake */
const weight = (i: RevIssue) => i.lost + i.credits;
const order = (a: RevIssue, b: RevIssue) => weight(b) - weight(a) || b.rate - a.rate || b.potentialCredits + b.potentialRate * OUTAGE_HOURS - (a.potentialCredits + a.potentialRate * OUTAGE_HOURS) || b.mrrExposed - a.mrrExposed;

export function revenueView(db: Db, model: RevModel, dcId: string | undefined, edgeState: (dcId: string) => 'redundant' | 'redundancy-lost' | 'isolated'): RevenueView {
  const now = db.now;
  const inScope = (id: string) => !dcId || id === dcId;
  const svcs = db.services.filter(s => s.status !== 'Disabled' && s.revenueMonthly > 0 && inScope(s.dcId));
  /* money is charged to the datacenter where the FAULT is: a backhaul fault at one site also degrades services
     homed at far-end sites, and that loss is caused by — and counted against — the faulted site */
  const causeDc = (r: Row) => model.issues.get(r.key)!.dcId;
  const rows = model.rows.filter(r => inScope(causeDc(r)));
  const baseMrr = svcs.reduce((a, s) => a + s.revenueMonthly, 0);
  const dcById = new Map(db.datacenters.map(d => [d.id, d]));
  const custById = new Map(db.customers.map(c => [c.id, c]));

  const issues = [...model.issues.values()].filter(i => inScope(i.dcId)).sort(order).map((i, k) => ({ ...i, rank: k + 1 }));
  issues.forEach(i => { i.underPrioritised = !!i.incident && i.incident.sev >= 3 && i.rank <= 3 && weight(i) + i.rate > 0; });

  const total = { ...zero(), forecast24: 0, potentialRate: 0, potentialCredits: 0, services: rows.length, down: 0, degraded: 0, exposed: 0, customers: new Set(rows.map(r => r.s.customerId)).size, premium: new Set(rows.filter(r => custById.get(r.s.customerId)?.premium).map(r => r.s.customerId)).size };
  const dom = new Map<RevDomain, RevenueView['byDomain'][number]>(REV_DOMAINS.map(d => [d, { ...zero(), domain: d, issues: 0, services: 0, hist30: 0 }]));
  const dcs = new Map<string, RevDc>();
  for (const d of db.datacenters) if (inScope(d.id) && d.status !== 'planned') dcs.set(d.id, { ...zero(), id: d.id, city: d.city, state: d.state, tier: d.tier, mrr: 0, services: 0, customers: 0, issues: 0, hist30: 0, topIssue: '', topIssueId: '' });
  const dcCust = new Map<string, Set<string>>();
  for (const s of svcs) { const e = dcs.get(s.dcId); if (!e) continue; e.mrr += s.revenueMonthly; e.services++; (dcCust.get(s.dcId) ?? dcCust.set(s.dcId, new Set()).get(s.dcId)!).add(s.customerId); }
  dcs.forEach(e => { e.customers = dcCust.get(e.id)?.size ?? 0; });

  const cust = new Map<string, RevCustomer>();
  for (const s of svcs) {
    const c = custById.get(s.customerId)!;
    const e = cust.get(c.id) ?? { ...zero(), id: c.id, name: c.name, segment: c.segment, premium: c.premium, accountManager: c.accountManager, mrr: 0, services: 0, down: 0, degraded: 0, exposed: 0, creditsLocked: 0, nextCliffMin: null, belowSla: 0, slaTarget: 0, uptime: 100, cause: '', issueId: '' };
    e.mrr += s.revenueMonthly; e.services++;
    if (s.uptime30d < s.slaTarget) { e.belowSla++; e.creditsLocked += tier(s.slaTarget - s.uptime30d) * s.revenueMonthly; }
    if (s.uptime30d - s.slaTarget < e.uptime - e.slaTarget || !e.slaTarget) { e.uptime = s.uptime30d; e.slaTarget = s.slaTarget; }
    cust.set(c.id, e);
  }
  const issueDomain = (key: string) => model.issues.get(key)!.domain;
  const allCliffs: { inMin: number; amount: number; key: string }[] = [];
  const worstOf = new Map<string, { key: string; w: number }>();
  for (const r of rows) {
    const h = (now - r.since) / HOUR, c = costAt(r, h), f = costAt(r, h + 24);
    add(total, r, c); total.forecast24 += f.lost + f.credits; total[r.state]++;
    const iss = model.issues.get(r.key)!;
    if (r.state === 'exposed') { total.potentialRate += r.hourly; total.potentialCredits += Math.max(0, tier(r.short0 + (OUTAGE_HOURS * 60 / MONTH_MIN) * 100) - tier(r.short0)) * r.s.revenueMonthly; }
    const d = dom.get(issueDomain(r.key))!; add(d, r, c); d.services++;
    const e = dcs.get(causeDc(r)); if (e) add(e, r, c);
    /* a customer hit here whose service is homed at another site has no entry yet */
    let cu = cust.get(r.s.customerId);
    if (!cu) { const c0 = custById.get(r.s.customerId)!; cu = { ...zero(), id: c0.id, name: c0.name, segment: c0.segment, premium: c0.premium, accountManager: c0.accountManager, mrr: 0, services: 0, down: 0, degraded: 0, exposed: 0, creditsLocked: 0, nextCliffMin: null, belowSla: 0, slaTarget: r.s.slaTarget, uptime: r.s.uptime30d, cause: '', issueId: '' }; cust.set(c0.id, cu); }
    if (!inScope(r.s.dcId)) { cu.mrr += r.s.revenueMonthly; cu.services++; }
    add(cu, r, c); cu[r.state]++;
    const cl = cliffOf(r, h);
    if (cl) { allCliffs.push({ ...cl, key: r.key }); cu.nextCliffMin = cu.nextCliffMin === null ? Math.round(cl.inMin) : Math.min(cu.nextCliffMin, Math.round(cl.inMin)); }
    const w = (r.state === 'down' ? 3e12 : r.state === 'degraded' ? 2e12 : 1e12) + r.s.revenueMonthly;
    const cur = worstOf.get(cu.id); if (!cur || w > cur.w) { worstOf.set(cu.id, { key: r.key, w }); cu.cause = iss.title; cu.issueId = iss.id; }
  }
  issues.forEach(i => { dom.get(i.domain)!.issues++; const e = dcs.get(i.dcId); if (e) { e.issues++; if (!e.topIssue) { e.topIssue = i.title; e.topIssueId = i.id; } } });

  /* SLA position: revenue-weighted share of services meeting their target over 30 days */
  const below = svcs.filter(s => s.uptime30d < s.slaTarget);
  const creditsLocked = below.reduce((a, s) => a + tier(s.slaTarget - s.uptime30d) * s.revenueMonthly, 0);
  const impactedIds = new Set(rows.filter(r => r.state !== 'exposed' && costAt(r, (now - r.since) / HOUR).credits > 0).map(r => r.s.id));
  const within = svcs.filter(s => s.uptime30d >= s.slaTarget && !impactedIds.has(s.id)).reduce((a, s) => a + s.revenueMonthly, 0);
  allCliffs.sort((a, b) => a.inMin - b.inMin);
  const first = allCliffs[0];
  const firstGrp = first ? allCliffs.filter(c => c.key === first.key && c.inMin <= first.inMin + 30) : [];
  const in60 = allCliffs.filter(c => c.inMin <= 60);

  /* 30-day history: resolved incidents priced from the site's average service (duration × severity weight), plus what is open today */
  const days = Array.from({ length: 30 }, (_, k) => { const d = new Date(now - (29 - k) * DAY); d.setHours(0, 0, 0, 0); return d.getTime(); });
  const series = Object.fromEntries(REV_DOMAINS.map(d => [d, days.map(() => 0)])) as Record<RevDomain, number[]>;
  const estateAvg = db.services.length ? db.services.reduce((a, s) => a + s.revenueMonthly, 0) / db.services.length : 0;
  const avgOf = (id: string) => { const e = dcs.get(id); return e && e.services ? e.mrr / e.services : estateAvg; };
  const hist = db.incidents.filter(i => !isOpen(i) && !!i.resolved && inScope(i.dcId) && i.detected >= days[0]);
  const dayOf = (at: number) => Math.min(29, Math.max(0, days.findIndex((d, j) => at >= d && (j === 29 || at < days[j + 1]))));
  const book = (k: number, dmn: RevDomain, dc: string, amount: number) => { series[dmn][k] += amount; dom.get(dmn)!.hist30 += amount; const e = dcs.get(dc); if (e) e.hist30 += amount; };
  let histInc = 0, histLost = 0;
  for (const i of hist) {
    if (!i.impact.services) continue;
    const hours = (i.resolved! - i.detected) / HOUR, w = i.sev <= 2 ? 0.6 : i.sev === 3 ? 0.3 : 0.12;
    const amount = i.impact.services * (avgOf(i.dcId) / MONTH_H) * hours * w;
    book(dayOf(i.detected), INC_DOMAIN[i.type], i.dcId, amount); histInc++; histLost += amount;
  }
  /* credits already locked in: each service below its SLA owes its tier; booked to an earlier incident at its site */
  const SPREAD: RevDomain[] = ['Network', 'Network', 'Power', 'Cooling', 'Device', 'Network', 'Capacity'];
  for (const s of below) {
    const h = hash(s.id), at = hist.filter(i => i.dcId === s.dcId), i = at.length ? at[h % at.length] : undefined;
    book(i ? dayOf(i.detected) : h % 29, i ? INC_DOMAIN[i.type] : SPREAD[h % SPREAD.length], s.dcId, tier(s.slaTarget - s.uptime30d) * s.revenueMonthly);
  }
  dom.forEach(d => { series[d.domain][29] += d.lost + d.credits; d.hist30 += d.lost + d.credits; });
  dcs.forEach(e => { e.hist30 += e.lost + e.credits; });
  REV_DOMAINS.forEach(d => { series[d] = series[d].map(Math.round); });
  const dayTotals = days.map((_, k) => REV_DOMAINS.reduce((a, d) => a + series[d][k], 0));
  const trendTotal = dayTotals.reduce((a, b) => a + b, 0);
  const worstK = dayTotals.indexOf(Math.max(...dayTotals));
  const counted = histInc + issues.filter(i => weight(i) > 0).length;

  const exposures = buildExposures(db, svcs, dcs, edgeState);
  const changeIssues = issues.filter(i => i.changeId && weight(i) + i.mrrExposed > 0);
  const changeImpact = changeIssues.reduce((a, i) => a + weight(i), 0);

  /* racks by revenue hosted — only meaningful inside one datacenter */
  const racks: RevRack[] = [];
  let rackBy: 'rack' | 'device' = 'rack';
  if (dcId) {
    const dc = dcById.get(dcId);
    const by = new Map<string, { mrr: number; services: number; cust: Set<string>; atRisk: number; state: RevRack['state'] }>();
    const stateOf = new Map(model.rows.map(r => [r.s.id, r.state]));
    const rank = { ok: 0, exposed: 1, degraded: 2, down: 3 } as const;
    for (const s of svcs) {
      const rackId = db.neById.get(s.neId)?.rackId; if (!rackId) continue;
      const e = by.get(rackId) ?? { mrr: 0, services: 0, cust: new Set<string>(), atRisk: 0, state: 'ok' as RevRack['state'] };
      e.mrr += s.revenueMonthly; e.services++; e.cust.add(s.customerId);
      const st = stateOf.get(s.id); if (st) { e.atRisk += s.revenueMonthly; if (rank[st] > rank[e.state]) e.state = st; }
      by.set(rackId, e);
    }
    const fill = (m: typeof by, name: (id: string) => { name: string; room: string }) => { for (const [id, e] of m) racks.push({ id, ...name(id), mrr: Math.round(e.mrr), services: e.services, customers: e.cust.size, atRisk: Math.round(e.atRisk), state: e.state }); };
    if (by.size > 2) fill(by, id => { const rk = dc?.racks.find(x => x.id === id); return { name: rk?.name ?? id.replace(`${dcId}-`, ''), room: rk ? `${rk.floor} · ${rk.room}` : '' }; });
    else {
      /* everything sits in one or two racks (a telco edge): break it down by device instead */
      const byNe = new Map<string, { mrr: number; services: number; cust: Set<string>; atRisk: number; state: RevRack['state'] }>();
      for (const s of svcs) {
        const e = byNe.get(s.neId) ?? { mrr: 0, services: 0, cust: new Set<string>(), atRisk: 0, state: 'ok' as RevRack['state'] };
        e.mrr += s.revenueMonthly; e.services++; e.cust.add(s.customerId);
        const st = stateOf.get(s.id); if (st) { e.atRisk += s.revenueMonthly; if (rank[st] > rank[e.state]) e.state = st; }
        byNe.set(s.neId, e);
      }
      fill(byNe, id => { const n = db.neById.get(id); const rk = dc?.racks.find(x => x.id === n?.rackId); return { name: id.replace(`${dcId}-`, ''), room: rk ? `${rk.name} · ${rk.room}` : '' }; });
      rackBy = 'device';
    }
    racks.sort((a, b) => b.mrr - a.mrr);
  }

  return {
    dcId, now, base: { mrr: Math.round(baseMrr), services: svcs.length, customers: new Set(svcs.map(s => s.customerId)).size },
    total: { ...round(total), forecast24: Math.round(total.forecast24), potentialRate: Math.round(total.potentialRate), potentialCredits: Math.round(total.potentialCredits) },
    sla: { withinPct: baseMrr ? Math.round((within / baseMrr) * 1000) / 10 : 100, below: below.length, creditsLocked: Math.round(creditsLocked),
      nextCliff: first ? { inMin: Math.round(first.inMin), amount: Math.round(firstGrp.reduce((a, c) => a + c.amount, 0)), services: firstGrp.length, issueId: first.key, title: model.issues.get(first.key)!.title } : null,
      cliff60: { services: in60.length, amount: Math.round(in60.reduce((a, c) => a + c.amount, 0)) } },
    issues, byDomain: [...dom.values()].map(d => ({ ...round(d), hist30: Math.round(d.hist30) })),
    byDc: [...dcs.values()].map(e => ({ ...round(e), mrr: Math.round(e.mrr), hist30: Math.round(e.hist30) })).sort((a, b) => b.lost + b.credits - (a.lost + a.credits) || b.mrrExposed - a.mrrExposed || b.mrr - a.mrr),
    customers: [...cust.values()].map(c => ({ ...round(c), mrr: Math.round(c.mrr), creditsLocked: Math.round(c.creditsLocked) })).sort((a, b) => b.lost + b.credits - (a.lost + a.credits) || b.mrrExposed - a.mrrExposed || b.creditsLocked - a.creditsLocked || b.mrr - a.mrr),
    trend: { days, series, total: Math.round(trendTotal), lost: Math.round(histLost + total.lost), credits: Math.round(creditsLocked + total.credits), incidents: counted, avgPerIncident: counted ? Math.round(trendTotal / counted) : 0, worstDay: trendTotal ? { at: days[worstK], amount: dayTotals[worstK] } : null },
    exposures, racks, rackBy,
    changeInduced: { issues: changeIssues.length, impact: Math.round(changeImpact), share: total.lost + total.credits > 0 ? Math.round((changeImpact / (total.lost + total.credits)) * 100) : 0 },
    method: { degradedFactor: DEGRADED_FACTOR, tiers: [{ shortfall: 'below target', credit: 10 }, { shortfall: '0.5 pts or more below', credit: 25 }, { shortfall: '2 pts or more below', credit: 50 }], outageHours: OUTAGE_HOURS }
  };
}

/* "One failure away": places where redundancy is already gone, or one element carries a large share of a
   site's revenue. Nothing is being lost — this is what the next failure would cost per hour. */
function buildExposures(db: Db, svcs: Service[], dcs: Map<string, RevDc>, edgeState: (dcId: string) => string): RevExposure[] {
  const out: RevExposure[] = [];
  const custById = new Map(db.customers.map(c => [c.id, c]));
  const mk = (id: string, kind: RevExposure['kind'], dc: Datacenter, what: string, why: string, list: Service[], to: string) => {
    if (!list.length) return;
    const mrr = list.reduce((a, s) => a + s.revenueMonthly, 0), cs = new Set(list.map(s => s.customerId)), site = dcs.get(dc.id)?.mrr ?? 0;
    out.push({ id, kind, dcId: dc.id, what, why, mrr: Math.round(mrr), rate: Math.round(mrr / MONTH_H), services: list.length, customers: cs.size, premium: [...cs].filter(c => custById.get(c)?.premium).length, share: site ? Math.round((mrr / site) * 100) : 0, to });
  };
  const byDc = new Map<string, Service[]>();
  svcs.forEach(s => byDc.set(s.dcId, [...(byDc.get(s.dcId) ?? []), s]));
  for (const [dcId, list] of byDc) {
    const dc = db.datacenters.find(d => d.id === dcId); if (!dc) continue;
    const ups = dc.power.ups.filter(u => u.state !== 'Online'), feeds = dc.power.feeds.filter(f => f.status === 'Alarm');
    if (ups.length || feeds.length) mk(`${dcId}-pwr`, 'power', dc, ups.length ? `${ups.map(u => `${u.name} ${u.state.toLowerCase()}`).join(', ')}` : `${feeds[0].source} lost`, ups.some(u => u.state === 'On battery') ? `Running on battery with ${Math.min(...ups.map(u => u.batteryMin))} min autonomy. The whole site drops if the generator does not take the load` : 'Power redundancy is gone; one more power fault takes the site down', list, `/facilities?dc=${dcId}`);
    const failed = dc.cooling.units.filter(u => u.status === 'Failed'), maint = dc.cooling.units.filter(u => u.status === 'Maintenance');
    if (failed.length || maint.length) {
      const zones = new Set([...failed, ...maint].map(u => u.zone.split(' · ').pop()!));
      const inZone = list.filter(s => { const rk = dc.racks.find(r => r.id === db.neById.get(s.neId)?.rackId); return rk && zones.has(rk.room); });
      mk(`${dcId}-cool`, 'cooling', dc, [...failed.map(u => `${u.name} failed`), ...maint.map(u => `${u.name} in maintenance`)].join(', '), `Cooling at N in ${[...zones].join(', ')}. One more unit lost and inlet temperatures force a shutdown`, inZone.length ? inZone : list, `/facilities?dc=${dcId}&tab=cooling`);
    }
    const edge = edgeState(dcId);
    if (edge !== 'redundant') mk(`${dcId}-edge`, 'edge', dc, edge === 'isolated' ? 'All edge links down' : 'Edge redundancy lost', edge === 'isolated' ? 'The site is isolated from the network' : 'One edge link is carrying the site; losing it isolates every service hosted here', list, `/datacenters/${dcId}?tab=topology`);
    /* single PSU: the device stays up until the second supply fails */
    const psu = new Set(db.alerts.filter(a => a.state !== 'cleared' && a.dcId === dcId && a.title === 'Power Supply Fault' && a.neId).map(a => a.neId!));
    if (psu.size) { const on = list.filter(s => [s.neId, ...s.path].some(id => psu.has(id))); mk(`${dcId}-psu`, 'device', dc, `${psu.size} device${psu.size === 1 ? '' : 's'} on a single power supply`, 'No PSU redundancy. A second supply failure powers the device off', on, `/alerts?dc=${dcId}&q=${encodeURIComponent('Power Supply Fault')}`); }
    /* racks over their power budget: a breaker trip drops everything in the cabinet */
    const hot = new Set(db.alerts.filter(a => a.state !== 'cleared' && a.dcId === dcId && SELF_LOAD.test(a.title) && a.rackId).map(a => a.rackId!));
    if (hot.size) { const on = list.filter(s => hot.has(db.neById.get(s.neId)?.rackId ?? '')); mk(`${dcId}-rackpwr`, 'rack', dc, `${hot.size} rack${hot.size === 1 ? '' : 's'} over the power budget`, 'Drawing at or above the breaker rating. A trip drops every service in the cabinet', on, `/facilities?dc=${dcId}`); }
    /* concentration: the one device carrying the largest share of the site's revenue */
    const byNe = new Map<string, Service[]>();
    list.forEach(s => byNe.set(s.neId, [...(byNe.get(s.neId) ?? []), s]));
    const top = [...byNe.entries()].map(([id, l]) => ({ id, l, mrr: l.reduce((a, s) => a + s.revenueMonthly, 0) })).sort((a, b) => b.mrr - a.mrr)[0];
    const site = dcs.get(dcId)?.mrr ?? 0;
    if (top && site && top.mrr / site >= 0.2 && byNe.size > 1) { const ne = db.neById.get(top.id); mk(`${dcId}-conc`, ne?.role === 'Tenant gear' ? 'rack' : 'device', dc, `${top.id.replace(`${dcId}-`, '')} carries ${Math.round((top.mrr / site) * 100)}% of site revenue`, 'Revenue is concentrated on one device. No fault now, but a single failure here is the costliest at this site', top.l, `/ne/${encodeURIComponent(top.id)}`); }
  }
  return out.sort((a, b) => b.rate - a.rate);
}
