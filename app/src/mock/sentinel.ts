/* Sentinel copilot — deterministic mock. Questions are matched to intents and
   answered from the live mock estate, so every statement carries evidence the
   operator can open. A real LLM/RAG service would return the same shape. */

import { sevLabel } from '../lib/vocab';
import { raw, isOpen, impactOf, linksOf, summarize, slaState, changes as listChanges, revenue, getPersona, gpu, geoDef, heroNeId, powerEconomics } from './server';
import { PERSONA_BY_ID } from './personas';
import { fmtMoney, fmtDur, fmtNum } from '../lib/format';
import { HOUR, DAY } from './seed';
import { fmtDateTime, fmtDate } from '../lib/format';

export interface Evidence { label: string; to: string }
export interface Answer { title: string; confidence: number; lines: string[]; evidence: Evidence[]; actions: { label: string; to: string }[]; followups: string[] }
export interface Ctx { dcId?: string; neId?: string; incidentId?: string; linkId?: string; serviceId?: string }

export function suggestions(ctx: Ctx): string[] {
  const db = raw();
  const dc = ctx.dcId ? db.datacenters.find(d => d.id === ctx.dcId) : undefined;
  const s: string[] = [];
  if (ctx.incidentId) s.push(`What changed before ${ctx.incidentId}?`, `Who is impacted by ${ctx.incidentId}?`);
  if (ctx.neId) s.push(`What services depend on ${ctx.neId}?`, `Why is ${ctx.neId} alarming?`);
  if (ctx.linkId) s.push(`What services depend on ${ctx.linkId}?`, `When will ${ctx.linkId} cross 85%?`);
  if (dc) s.push(`What is at risk in ${dc.city}?`, `Summarise ${dc.id}`);
  if (ctx.incidentId) s.push(`What is ${ctx.incidentId} costing us?`);
  if (db.gpu && (db.gpu.nodes.size || db.gpu.cages.length)) s.push(db.gpu.nodes.size ? 'Which GPU job is losing the most?' : 'Which AI cages are at risk?');
  if (db.gpu?.nodes.size) s.push('Where should the next GPU job go?');
  s.push(dc ? `What is power costing ${dc.id}?` : 'What is power costing us?');
  s.push(dc ? `Which issue costs the most in ${dc.id}?` : 'Which issue is costing the most revenue?');
  s.push(`What is at risk in ${geoDef().heroCity}?`, 'Which links will exhaust first?', 'What changed in the last 24 hours?');
  return [...new Set(s)].slice(0, 5);
}

export function ask(q: string, ctx: Ctx): Answer {
  const db = raw();
  const t = q.toLowerCase();
  const incId = (q.match(/INC-\d{4}/i)?.[0] ?? ctx.incidentId)?.toUpperCase();
  const neId = q.match(/[A-Z]{2}-DC-\d{3}-[A-Z0-9-]+/i)?.[0]?.toUpperCase() ?? ctx.neId;
  const lnk = q.match(/LNK-\d{5}/i)?.[0]?.toUpperCase() ?? ctx.linkId;
  const dcByText = db.datacenters.filter(d => t.includes(d.id.toLowerCase()) || t.includes(d.city.toLowerCase()) || t.includes(d.state.toLowerCase()));

  /* power economics (21-Oct-2026): where the next job should go, what power costs and the findings against the contracts */
  if (/\b(place|placement|where should|next (gpu )?job)\b/.test(t) && db.gpu?.nodes.size) {
    const scopeDc = dcByText[0]?.id ?? ctx.dcId;
    const e = powerEconomics(scopeDc);
    const g = e.gpu;
    const fit = (g?.placement ?? []).filter(p => p.fit !== 'no' && p.freeGpus >= 64).slice(0, 3);
    if (!g || !fit.length) return { title: 'No pod can take a 64-GPU job right now', confidence: 85, lines: [scopeDc ? `${scopeDc} has no pod with 64 free healthy GPUs and working cooling.` : 'No pod has 64 free healthy GPUs with working cooling.'], evidence: [], actions: [{ label: 'Open placement', to: '/gpu?gtab=placement' }], followups: ['What is power costing us?'] };
    const b = fit[0];
    return { title: `Place the next job at ${b.dcId} · ${b.name}`, confidence: 82,
      lines: [`${b.freeGpus} free ${b.model} GPUs, racks at ${b.rackLoadPct}% of budget, cooling ${b.coolingState === 'ok' ? 'normal' : b.coolingState}, ${fmtNum(b.siteHeadroomKw)} kW of contracted headroom${b.paidIdleKw ? ` of which ${fmtNum(b.paidIdleKw)} kW is already paid for` : ''}.`,
        `Marginal power cost there is ${b.marginalCostPerGpuHour.toFixed(3)} per GPU-hour (PUE ${b.pue}, tariff ${b.tariff} per kWh)${fit[1] ? `; next best ${fit[1].dcId} · ${fit[1].name} at ${fit[1].marginalCostPerGpuHour.toFixed(3)}` : ''}.`,
        ...(e.anomalies.length ? [`Avoid ${[...new Set(e.anomalies.filter(a => a.kind === 'block-near-limit' || a.kind === 'demand-ratchet').map(a => a.dcId))].slice(0, 3).join(', ')}: their power contracts are at their limit.`] : [])],
      evidence: fit.map(p => ({ label: `${p.dcId} ${p.name} · ${p.freeGpus} free · ${p.why[0]}`, to: `/gpu?dc=${p.dcId}&gtab=clusters` })),
      actions: [{ label: 'Open placement', to: '/gpu?gtab=placement' }, { label: 'Power economics', to: '/capacity?tab=economics' }], followups: ['What is power costing us?', 'Which GPU job is losing the most?'] };
  }
  if (/\bpower (cost|bill|contract|economics)|costing (us|[a-z]{2}-dc-\d{3})|idle (mw|megawatt|power|block)|take-or-pay|demand (charge|peak)|tariff|kwh/.test(t) && !/gpu job|losing/.test(t)) {
    const scopeDc = dcByText[0]?.id ?? ctx.dcId;
    const e = powerEconomics(scopeDc);
    const tt = e.totals, top = e.anomalies[0], g = e.gpu;
    return { title: scopeDc ? `Power at ${scopeDc}: ${fmtMoney(tt.billMonth)} a month` : `Power costs ${fmtMoney(tt.billMonth)} a month across ${e.sites.length} sites`, confidence: 88,
      lines: [`${fmtNum(Math.round(tt.mwhDay))} MWh a day at a blended ${tt.blendedTariff < 1 ? tt.blendedTariff.toFixed(3) : tt.blendedTariff.toFixed(2)} per kWh; ${fmtNum(tt.peakKw)} of ${fmtNum(tt.committedKw)} contracted kW drawn at peak, ${fmtNum(tt.idleKw)} kW paid for but idle (${fmtMoney(tt.idleCostMonth)} a month).`,
        ...(tt.costPerSoldMwMonth !== null ? [`Cost per sold MW is ${fmtMoney(tt.costPerSoldMwMonth)} a month.`] : []),
        ...(g ? [`The GPU fleet draws ${fmtNum(g.nodeKw)} kW: ${fmtMoney(g.powerCostDay)} a day, ${g.powerSharePct ?? 0}% of what it earns; idle GPUs burn ${fmtMoney(g.idlePowerCostDay)} a day.`] : []),
        ...(top ? [`Biggest finding: ${top.title} at ${top.dcId} — ${fmtMoney(top.exposure)} ${top.exposureLabel}${top.incidentId ? ` (${top.incidentId})` : ''}.`] : ['No finding against the power contracts.'])],
      evidence: [...e.anomalies.slice(0, 3).map(a => ({ label: `${a.dcId} · ${a.title}`, to: a.incidentId ? `/incidents/${a.incidentId}` : a.to })), ...e.sites.filter(s => s.idleKw > 0).slice(0, 2).map(s => ({ label: `${s.id} · ${fmtNum(s.idleKw)} kW idle of ${fmtNum(s.committedKw)}`, to: `/facilities?dc=${s.id}&tab=power` }))],
      actions: [{ label: 'Power economics', to: `/capacity?tab=economics${scopeDc ? `&dc=${scopeDc}` : ''}` }, ...(g ? [{ label: 'GPU power cost', to: '/gpu?gtab=cooling' }] : [])], followups: [...(g ? ['Where should the next GPU job go?'] : []), 'Which issue is costing the most revenue?'] };
  }

  /* AI & GPU: which job is losing GPU time, fleet health, AI cages */
  if (/\bgpu|\bjob\b|\bjobs\b|\bcage|xid|nvlink|cdu|infiniband|\bai\b/.test(t) && !incId) {
    const scopeDc = dcByText[0]?.id ?? ctx.dcId;
    const v = gpu(scopeDc ? { dcId: scopeDc } : {});
    if (v.kind === 'cages') {
      const warn = v.cages.filter(c => c.state !== 'ok'), bad = v.cdus.filter(c => c.state !== 'ok');
      return { title: scopeDc ? `AI cages in ${scopeDc}` : 'Tenant AI cages', confidence: 90,
        lines: [`${v.cageTotals.cages} AI cages for ${v.cageTotals.tenants} tenants: ${v.cageTotals.contractedKw} kW contracted, ${v.cageTotals.drawKw} kW drawn now.`,
          ...bad.map(c => `${c.dcId} ${c.name}: flow ${Math.round((c.flowLpm / c.flowNominal) * 100)}% of design, supply ${c.supplyC}°C — ${c.note ?? 'reduced flow'}. Cages on it: ${v.cages.filter(x => x.cduId === c.id).map(x => `${x.name} (${x.tenant})`).join(', ')}.`),
          ...warn.filter(c => c.pct >= 90).map(c => `${c.dcId} ${c.name} (${c.tenant}) is drawing ${c.pct}% of its ${c.contractedKw} kW contract — one more job and the breaker trips.`),
          'The GPUs are tenant-owned: you watch power, coolant and inlet, and call the tenant before their GPUs throttle.'],
        evidence: [...bad.map(c => ({ label: `${c.dcId} ${c.name}`, to: `/facilities?dc=${c.dcId}&tab=cooling` })), ...warn.slice(0, 3).map(c => ({ label: `${c.dcId} ${c.name}`, to: `/customers/${c.tenantId}` }))], actions: [{ label: 'Open AI & GPU', to: scopeDc ? `/datacenters/${scopeDc}?tab=gpu` : '/gpu' }], followups: ['Which issue is costing the most revenue?'] };
    }
    if (v.kind === 'fleet') {
      const f = v.fleet, top = v.jobs.filter(j => j.wasteRate > 0 || j.atStake > 0).slice(0, 4);
      return { title: scopeDc ? `GPU fleet in ${scopeDc}` : 'Where GPU time is being lost', confidence: 89,
        lines: [`${fmtNum(f.gpus)} GPUs on ${f.nodes} nodes: ${f.allocatedPct}% allocated to jobs, ${f.utilInJobs}% busy on average. ${f.gpuHealth.failed} failed and ${f.gpuHealth.degraded} degraded GPUs.`,
          `GPU time being lost right now: ${fmtMoney(v.waste.rate)}/h (${fmtMoney(v.waste.soFar)} so far, including work to redo).`,
          ...top.map(j => `${j.name} (${j.gpus} GPUs, ${j.owner}, ${j.dcId}) — ${j.state}${j.wasteRate ? `, losing ${fmtMoney(j.wasteRate)}/h` : `, ${fmtMoney(j.atStake)} at stake`}: ${j.cause}${j.incidentId ? ` (${j.incidentId})` : ' — no incident open'}.`),
          ...(f.throttle.hw ? [`${f.throttle.hw} GPUs are in hardware slowdown because a liquid-cooling loop lost flow; fix the cooling, not the GPUs.`] : []),
          ...(f.driftNodes ? [`${f.driftNodes} nodes still run an older driver than ${f.driverStd}; a rollout change is pending approval.`] : [])],
        evidence: top.map(j => ({ label: j.incidentId ?? j.name, to: j.incidentId ? `/incidents/${j.incidentId}` : `/gpu?gtab=jobs&q=${j.name}` })), actions: [{ label: 'Open AI & GPU', to: scopeDc ? `/datacenters/${scopeDc}?tab=gpu` : '/gpu' }],
        followups: top[0]?.incidentId ? [`What is ${top[0].incidentId} costing us?`, `What changed before ${top[0].incidentId}?`] : ['Which issue is costing the most revenue?'] };
    }
    if (/\bgpu/.test(t)) return { title: scopeDc ? `No GPU infrastructure at ${scopeDc}` : 'No GPU fleet in this estate', confidence: 95, lines: [scopeDc ? `${scopeDc} runs no GPU nodes or AI cages.` : 'This estate is modelled as a telco datacenter estate: routers, switches and DWDM, no GPU servers. Switch the persona to Cloud or Enterprise for a GPU fleet, or Colocation for tenant AI cages.'], evidence: [], actions: [], followups: ['Which issue is costing the most revenue?'] };
  }
  /* revenue impact: what an issue costs, which issue costs the most, what is at stake */
  if (/revenue|cost|costing|money|credit|penalt|losing|loss|rupee|₹|business value|business impact/.test(t)) {
    const W0 = PERSONA_BY_ID[getPersona()].vocab.money;
    const low = (x: string) => (/^(SLA|OLA) /.test(x) ? x.slice(0, 4) + x.slice(4).toLowerCase() : x.toLowerCase());
    const PV = PERSONA_BY_ID[getPersona()].vocab, svcL = PV.services.toLowerCase(), custL = PV.customers.toLowerCase();
    const W = { ...W0, lostL: low(W0.lost), creditsL: low(W0.credits), nounL: low(W0.noun), impactL: low(W0.impact) };
    const scopeDc = dcByText[0]?.id ?? (incId ? undefined : ctx.dcId);
    const r = revenue(scopeDc ? { dcId: scopeDc } : {});
    const one = incId ? r.issues.find(i => i.id === incId) ?? revenue().issues.find(i => i.id === incId) : undefined;
    const rate = (n: number) => `${fmtMoney(n)}/h`;
    if (incId && !one) return { title: `${incId} — no ${W.nounL} impact`, confidence: 92, lines: [`No ${PV.service.toLowerCase()} is down, degraded or exposed because of ${incId}. It is an operational risk only.`], evidence: [{ label: incId, to: `/incidents/${incId}` }], actions: [{ label: W.impact, to: '/revenue' }], followups: ['Which issue is costing the most revenue?'] };
    if (one) {
      const lines = one.rate + one.lost + one.credits > 0
        ? [`${one.title} is costing ${rate(one.rate)}: ${fmtMoney(one.lost)} of ${W.lostL} and ${fmtMoney(one.credits)} of ${W.creditsL} so far.`,
          `${one.down} down and ${one.degraded} degraded ${svcL} across ${one.customers} ${one.customers === 1 ? PV.customer.toLowerCase() : custL} (${one.premium} ${PV.premium.toLowerCase()}).`,
          one.nextCliff ? `Next credit step: ${fmtMoney(one.nextCliff.amount)} in ${fmtDur(one.nextCliff.inMin)}.` : 'No further credit step is pending.',
          `Left unresolved for another 24 h it reaches ${fmtMoney(one.forecast24)} — restoring now avoids ${fmtMoney(Math.max(0, one.forecast24 - one.lost - one.credits))}.`]
        : [`Nothing is lost yet. ${one.exposed} ${svcL} worth ${fmtMoney(one.mrrExposed)} a month are still running on this fault.`, `If it takes them down it costs ${rate(one.potentialRate)}, plus ${fmtMoney(one.potentialCredits)} of ${W.creditsL} after a ${r.method.outageHours} h outage.`];
      if (one.changeId) lines.push(`It followed change ${one.changeId} at the same site.`);
      if (one.underPrioritised) lines.push(`It ranks #${one.rank} by ${W.nounL} impact but is only ${sevLabel(one.incident!.sev).toLowerCase()} severity — review its priority.`);
      return { title: `What ${one.id} is costing`, confidence: 90, lines, evidence: [{ label: one.id, to: one.to }, ...one.top.slice(0, 4).map(c => ({ label: c.name, to: `/customers/${c.id}` }))], actions: [{ label: `Open ${W.impactL}`, to: '/revenue' }], followups: ['Which issue is costing the most revenue?', `What changed before ${one.id}?`] };
    }
    const losing = r.issues.filter(i => i.rate + i.lost + i.credits > 0), stake = [...r.issues].filter(i => i.mrrExposed > 0).sort((a, b) => b.mrrExposed - a.mrrExposed);
    const worstDomain = [...r.byDomain].sort((a, b) => b.hist30 - a.hist30)[0];
    return { title: scopeDc ? `${W.impact} in ${scopeDc}` : `What is costing the most ${W.nounL}`, confidence: 88,
      lines: [
        `${fmtMoney(r.total.lost + r.total.credits)} lost so far across ${losing.length} issue${losing.length === 1 ? '' : 's'}, growing at ${rate(r.total.rate)}. ${fmtMoney(r.total.mrrExposed)} a month is still running but exposed to a critical fault.`,
        ...losing.slice(0, 3).map(i => `#${i.rank} ${i.id.startsWith('INC') ? i.id : i.dcId} — ${i.title}: ${fmtMoney(i.lost + i.credits)} so far, ${rate(i.rate)}${i.nextCliff ? `, next credit ${fmtMoney(i.nextCliff.amount)} in ${fmtDur(i.nextCliff.inMin)}` : ''}.`),
        ...(stake[0] ? [`Most at stake: ${stake[0].title} (${stake[0].dcId}) — ${fmtMoney(stake[0].mrrExposed)} a month riding on it; ${rate(stake[0].potentialRate)} if it fails.`] : []),
        ...(worstDomain && worstDomain.hist30 ? [`Over 30 days ${worstDomain.domain.toLowerCase()} issues cost the most: ${fmtMoney(worstDomain.hist30)} of ${fmtMoney(r.trend.total)}.`] : [])
      ],
      evidence: [...losing.slice(0, 3), ...stake.slice(0, 1)].map(i => ({ label: i.id.startsWith('INC') ? i.id : `${i.dcId} · ${i.title}`, to: i.to })), actions: [{ label: `Open ${W.impactL}`, to: scopeDc ? `/datacenters/${scopeDc}?tab=revenue` : '/revenue' }], followups: losing[0]?.incident ? [`What is ${losing[0].id} costing us?`, `What changed before ${losing[0].id}?`] : ['What is at risk in Pune?'] };
  }
  /* what changed before an incident */
  if (/chang/.test(t) && incId && /before|prior|cause/.test(t)) {
    const i = db.incidents.find(x => x.id === incId);
    if (i) {
      const cs = db.changes.filter(c => c.dcId === i.dcId && c.windowEnd <= i.detected && c.windowEnd > i.detected - 3 * DAY);
      return { title: `Changes in ${i.dcId} in the 72 h before ${i.id}`, confidence: 95,
        lines: cs.length ? cs.map(c => `${c.id} (${c.status}) ended ${Math.round((i.detected - c.windowEnd) / HOUR)} h before detection: ${c.title}.${c.scope.some(s => i.affected.some(a => a.id === s)) ? ' It touched the affected device — treat as a strong RCA lead.' : ''}`) : ['No change or maintenance window closed in the 72 hours before detection.'],
        evidence: [...cs.map(c => ({ label: c.id, to: `/changes?id=${c.id}` })), { label: i.id, to: `/incidents/${i.id}` }], actions: [{ label: 'Open RCA workspace', to: `/incidents/${i.id}` }], followups: [`Who is impacted by ${i.id}?`] };
    }
  }
  /* incident impact */
  if (incId && /impact|affected|who/.test(t)) {
    const i = db.incidents.find(x => x.id === incId);
    if (i) {
      const im = impactOf(db, { linkIds: i.affected.filter(a => a.kind === 'Link').map(a => a.id), neIds: i.affected.filter(a => a.kind === 'NE').map(a => a.id) });
      return { title: `Impact of ${i.id}`, confidence: 90,
        lines: [`${im.services.length} services and ${im.customers.length} customers sit on the affected scope (${im.premium.length} premium).`, ...im.premium.slice(0, 4).map(c => `${c.name} — ${im.services.filter(s => s.customerId === c.id).map(s => `${s.id} (${s.type}, SLA ${s.slaTarget}%)`).join(', ')}`), `Monthly revenue on the path: ${fmtMoney(im.revenue)}.`],
        evidence: [...im.services.slice(0, 6).map(s => ({ label: s.id, to: `/services/${s.id}` })), { label: i.id, to: `/incidents/${i.id}` }], actions: [{ label: 'Open incident', to: `/incidents/${i.id}` }], followups: [`What changed before ${i.id}?`] };
    }
  }
  /* service dependency */
  if (/depend|services on|ride|traverse/.test(t) && (neId || lnk)) {
    const svcs = lnk ? db.services.filter(s => s.linkIds.includes(lnk)) : db.services.filter(s => s.neId === neId || s.path.includes(neId!));
    const custs = [...new Set(svcs.map(s => s.customerId))].map(id => db.customers.find(c => c.id === id)!);
    return { title: `Services depending on ${lnk ?? neId}`, confidence: 97,
      lines: svcs.length ? [`${svcs.length} services for ${custs.length} customers (${custs.filter(c => c.premium).length} premium)${neId && !lnk ? ` — ${svcs.filter(s => s.neId === neId).length} hosted on this PE, ${svcs.filter(s => s.neId !== neId).length} transiting it from far-end PEs` : ''}.`, ...svcs.slice(0, 8).map(s => `${s.id} · ${s.type} · ${db.customers.find(c => c.id === s.customerId)!.name} · ${s.bandwidthMbps >= 1000 ? `${s.bandwidthMbps / 1000} Gbps` : `${s.bandwidthMbps} Mbps`} · ${s.status}`)] : ['No provisioned service rides this element. It carries infrastructure traffic only.'],
      evidence: svcs.slice(0, 8).map(s => ({ label: s.id, to: `/services/${s.id}` })), actions: neId ? [{ label: 'Open network services tab', to: `/ne/${neId}?tab=services` }] : [], followups: neId ? [`Why is ${neId} alarming?`] : [] };
  }
  /* NE alarm explanation */
  if (neId && /why|alarm|wrong|health/.test(t)) {
    const ne = db.neById.get(neId);
    if (ne) {
      const al = db.alerts.filter(a => a.neId === neId && a.state !== 'cleared');
      const inc = db.incidents.find(i => isOpen(i) && i.alertIds.some(a => al.some(x => x.id === a)));
      return { title: `${neId} — ${al.length} active alarm${al.length === 1 ? '' : 's'}`, confidence: inc ? inc.rca[0].confidence : 70,
        lines: [`Health ${ne.healthScore}/100 · CPU ${ne.cpu}% · Mem ${ne.mem}% · ${ne.tempC}°C.`, ...(inc ? [`Correlated into ${inc.id}: ${inc.rca[0].cause} (${inc.rca[0].confidence}% confidence).`] : []), ...al.slice(0, 5).map(a => `${a.code} ${a.severity}: ${a.title} — ${a.description}`)],
        evidence: [...al.slice(0, 5).map(a => ({ label: a.code, to: `/ne/${neId}?tab=alerts` })), ...(inc ? [{ label: inc.id, to: `/incidents/${inc.id}` }] : [])], actions: [{ label: 'Alerts & diagnostics', to: `/ne/${neId}?tab=alerts` }], followups: [`What services depend on ${neId}?`] };
    }
  }
  /* exhaustion */
  if (/exhaust|cross|85|forecast|capacity/.test(t)) {
    const ls = linksOf({ protocol: 'LLDP' }).filter(l => (l.role === 'Backhaul' || l.role === 'Uplink') && (!lnk || l.id === lnk)).sort((a, b) => a.forecastMonths - b.forecastMonths).slice(0, lnk ? 1 : 5);
    return { title: lnk ? `When ${lnk} crosses 85%` : 'Links that exhaust first', confidence: 82,
      lines: ls.map(l => `${l.aNe} ${l.aIf} → ${l.zNe}: ${l.utilPct}% today, +${l.growthPct}%/mo (6-month trend ${l.history[0]}% → ${l.utilPct}%). ${l.forecastMonths === 0 ? 'Already above the 85% warning line.' : `Crosses 85% around ${fmtDate(l.forecastDate!)}; 95% in ~${Math.max(1, Math.round(l.critMonths))} months.`}`).concat(['Forecast = compound growth of the last six monthly peaks; approved capacity plans are not yet netted in.']),
      evidence: ls.map(l => ({ label: `${l.aNe} ${l.aIf}`, to: `/ne/${l.aNe}?tab=links&if=${encodeURIComponent(l.aIf)}` })), actions: [{ label: 'Capacity · network', to: '/alerts?q=Utilisation' }], followups: [`What is at risk in ${geoDef().heroCity}?`] };
  }
  /* last 24 h */
  if (/last 24|today|recent/.test(t)) {
    const since = db.now - 24 * HOUR;
    const cs = listChanges({}).filter(c => c.windowStart >= since && c.windowStart <= db.now);
    const inc = db.incidents.filter(i => i.detected >= since);
    return { title: 'Last 24 hours', confidence: 99, lines: [`${inc.length} incidents opened, ${db.alerts.filter(a => a.start >= since).length} alerts raised, ${cs.length} changes/maintenance started.`, ...cs.map(c => `${c.id} ${c.status}: ${c.title} (${c.dcId}, ${fmtDateTime(c.windowStart)})`), ...inc.slice(0, 4).map(i => `${i.id} ${sevLabel(i.sev)} ${i.status}: ${i.title}`)],
      evidence: [...cs.map(c => ({ label: c.id, to: `/changes?id=${c.id}` })), ...inc.slice(0, 4).map(i => ({ label: i.id, to: `/incidents/${i.id}` }))], actions: [], followups: [] };
  }
  /* risk at a location / summary */
  const dcs = dcByText.length ? dcByText : ctx.dcId ? db.datacenters.filter(d => d.id === ctx.dcId) : [];
  if (dcs.length) {
    const lines: string[] = []; const ev: Evidence[] = [];
    for (const d of dcs) {
      const s = summarize(d);
      const inc = db.incidents.filter(i => i.dcId === d.id && isOpen(i));
      const hot = linksOf({ dcId: d.id, protocol: 'LLDP' }).filter(l => l.utilPct >= 80 && l.role !== 'Access');
      lines.push(`${d.id} (${d.status}, ${d.city}): health ${s.healthScore}, ${s.activeAlerts} active alarms, ${inc.length} open incidents, coverage ${s.coveragePct}% (${s.notDiscovered} not discovered, ${s.drifted} drifted).`);
      inc.slice(0, 3).forEach(i => { lines.push(`  • ${i.id} ${sevLabel(i.sev)} — ${i.title}${slaState(i).breaching ? ' (breaching SLA)' : ''}`); ev.push({ label: i.id, to: `/incidents/${i.id}` }); });
      d.risks.filter(r => r.severity === 'critical' || r.severity === 'major').slice(0, 2).forEach(r => lines.push(`  • ${r.domain}: ${r.title}`));
      hot.slice(0, 2).forEach(l => lines.push(`  • ${l.aNe} ${l.aIf} at ${l.utilPct}% (+${l.growthPct}%/mo)`));
      ev.push({ label: d.id, to: `/datacenters/${d.id}?tab=attention` });
    }
    return { title: dcs.length > 1 ? `Risk across ${dcs.map(d => d.id).join(', ')}` : `What is at risk in ${dcs[0].id}`, confidence: 88, lines, evidence: ev, actions: [{ label: 'Open site attention', to: `/datacenters/${dcs[0].id}?tab=attention` }], followups: ['Which links will exhaust first?'] };
  }
  return { title: 'I can answer from the live estate', confidence: 0, lines: [`Ask about a place ("what is at risk in ${geoDef().heroCity}?"), an element ("what services depend on ${heroNeId()}?"), an incident ("what changed before INC-0001?") or capacity ("which links will exhaust first?").`], evidence: [], actions: [], followups: suggestions(ctx) };
}
