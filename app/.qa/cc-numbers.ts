// Command center hero numbers must reconcile with the screens they link to (run: npx tsx .qa/cc-numbers.ts)
import * as S from '../src/mock/server';
const isOpen = (s: string) => s === 'Open' || s === 'Investigating' || s === 'Mitigated';
let fail = 0;
for (const g of ['in', 'us'] as const) for (const p of ['network', 'colocation', 'cloud', 'enterprise', 'neocloud'] as const) {
  S.setGeo(g); S.setPersona(p);
  const c = S.commandCenter() as any, s = c.situation;
  const all = S.incidents({}), open = all.filter(i => isOpen(i.status));
  const hot = open.filter(i => i.sev <= 2), live = S.datacenters().filter(d => d.status !== 'planned');
  const liveIds = new Set(live.map(d => d.id));
  const checks: [string, boolean, string][] = [
    ['critical = list sev1', s.n1 === open.filter(i => i.sev === 1).length, `${s.n1}`],
    ['high = list sev2', s.n2 === open.filter(i => i.sev === 2).length, `${s.n2}`],
    ['crit/high sites = distinct sites of those incidents', s.critSites === new Set(hot.map(i => i.dcId)).size, `${s.critSites} sites for ${hot.length} incidents`],
    ['crit/high incidents all at live sites', hot.every(i => liveIds.has(i.dcId)), ''],
    ['per-site breakdown sums to Critical + High', s.critBySite.reduce((a: number, x: any) => a + x.n1 + x.n2, 0) === s.n1 + s.n2 && s.critBySite.length === s.critSites, ''],
    ['premium tile = premium rows in Who is affected', s.exposedPremium === c.exposedCustomers.filter((x: any) => x.premium).length || c.exposedCustomers.length < s.exposedPremium, `${s.exposedPremium} vs ${c.exposedCustomers.filter((x: any) => x.premium).length} listed`],
    ['live datacenters', c.pulse.liveDcs === live.length, `${c.pulse.liveDcs}`],
    ['past SLA = list breaching view', c.pulse.breaching === all.filter(i => i.sla.breaching).length, `${c.pulse.breaching} vs ${all.filter(i => i.sla.breaching).length}`],
    ['open = list open', c.pulse.open === open.length, `${c.pulse.open}`],
    ['incident area chips = sites with breaching', c.domains.find((d: any) => d.key === 'response').sites.length === new Set(open.filter(i => i.sla.breaching).map(i => i.dcId)).size, ''],
    ['datacenter list crit/high sites', live.filter(d => (d as any).openIncidents && open.some(i => i.dcId === d.id && i.sev <= 2)).length === s.critSites, ''],
  ];
  for (const [n, ok, v] of checks) if (!ok) { fail++; console.log('FAIL', g, p, n, v); }
  console.log(g, p.padEnd(10), `crit ${s.n1} · high ${s.n2} · at ${s.critSites}/${c.pulse.liveDcs} sites · past SLA ${c.pulse.breaching}/${c.pulse.open} · premium ${s.exposedPremium}`);
}
console.log(fail ? `${fail} FAILED` : 'COMMAND CENTER NUMBERS RECONCILE'); process.exit(fail ? 1 : 0);
