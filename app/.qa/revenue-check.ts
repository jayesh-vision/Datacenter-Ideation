/* Revenue impact must reconcile: the same money by issue, by cause, by datacenter and by customer,
   estate = sum of sites, and the incident list / datacenter list show the figures of the model.
   usage: npx tsx .qa/revenue-check.ts */
import * as S from '../src/mock/server';
/* GEO=us runs the same reconciliation on the USA estate */
if (process.env.GEO === 'us') S.setGeo('us');
let fail = 0;
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const ok = (name: string, cond: boolean, detail = '') => { if (!cond) { fail++; console.log('  FAIL', name, detail); } };
for (const p of ['network', 'colocation', 'cloud', 'enterprise', 'neocloud'] as const) {
  S.setPersona(p);
  const v = S.revenue();
  const keys = ['mrrDown', 'mrrDegraded', 'mrrExposed', 'rate', 'lost', 'credits'] as const;
  const sum = <T,>(l: T[], f: (x: T) => number) => l.reduce((a, x) => a + f(x), 0);
  for (const k of keys) {
    const tol = Math.max(2, v.issues.length, v.customers.length, v.byDc.length);   // each part is rounded to a rupee
    ok(`${p} issues Σ${k}`, near(sum(v.issues, i => i[k]), v.total[k], tol), `${sum(v.issues, i => i[k])} vs ${v.total[k]}`);
    ok(`${p} byDomain Σ${k}`, near(sum(v.byDomain, i => i[k]), v.total[k], tol), `${sum(v.byDomain, i => i[k])} vs ${v.total[k]}`);
    ok(`${p} byDc Σ${k}`, near(sum(v.byDc, i => i[k]), v.total[k], tol), `${sum(v.byDc, i => i[k])} vs ${v.total[k]}`);
    ok(`${p} customers Σ${k}`, near(sum(v.customers, i => i[k]), v.total[k], tol), `${sum(v.customers, i => i[k])} vs ${v.total[k]}`);
    const sites = S.datacenters().filter(d => d.status !== 'planned').map(d => S.revenue({ dcId: d.id }));
    ok(`${p} sites Σ${k}`, near(sum(sites, s => s.total[k]), v.total[k], sites.length + 2), `${sum(sites, s => s.total[k])} vs ${v.total[k]}`);
  }
  ok(`${p} base = Σ sites`, near(sum(v.byDc, d => d.mrr), v.base.mrr, v.byDc.length));
  ok(`${p} services counted once`, v.total.down + v.total.degraded + v.total.exposed === v.total.services && sum(v.issues, i => i.services) === v.total.services);
  ok(`${p} trend = Σ domains`, near(sum(v.byDomain, d => d.hist30), v.trend.total, 10) && near(v.trend.lost + v.trend.credits, v.trend.total, 10), `${sum(v.byDomain, d => d.hist30)} / ${v.trend.lost + v.trend.credits} vs ${v.trend.total}`);
  ok(`${p} ranks`, v.issues.every((i, k) => i.rank === k + 1));
  ok(`${p} no NaN`, JSON.stringify(v).indexOf('null,null') < 0 && !/NaN|Infinity/.test(JSON.stringify(v)));
  ok(`${p} curves`, v.issues.every(i => i.curve.v.every((x, k) => k === 0 || x >= i.curve.v[k - 1] - 1) && (i.curve.potential || near(i.curve.v[i.curve.nowIdx], i.lost + i.credits, Math.max(50, (i.lost + i.credits) * 0.08) + i.rate))), 'cumulative impact must not fall, and equal the impact so far at "now"');
  /* other screens show the model's numbers */
  const incs = S.incidents({ status: 'open' });
  for (const i of v.issues.filter(x => x.incident)) { const row = incs.find(x => x.id === i.id); ok(`${p} ${i.id} on the incident list`, !!row?.revenue && row.revenue.rate === i.rate && row.revenue.impact === i.lost + i.credits); ok(`${p} ${i.id} incident detail`, S.incident(i.id)?.revenue?.rate === i.rate); }
  for (const d of S.datacenters()) { const r = v.byDc.find(x => x.id === d.id); ok(`${p} ${d.id} summary`, !r ? d.mrr === 0 : d.mrr === r.mrr && d.revRate === r.rate && d.revImpact === r.lost + r.credits && d.revExposed === r.mrrExposed); }
  const cc = S.commandCenter().revenue;
  ok(`${p} command center`, cc.total.rate === v.total.rate && cc.base === v.base.mrr);
  console.log(`${p}: base ${v.base.mrr} · losing ${v.total.rate}/h · so far ${v.total.lost + v.total.credits} · at stake ${v.total.mrrExposed}/mo · ${v.issues.length} issues · 30 d ${v.trend.total}`);
}
/* the persona switch must not have moved the telco anchors (India only) */
S.setGeo('in');
S.setPersona('network');
const mh = S.datacenters().find(d => d.id === 'MH-DC-001')!;
ok('MH-DC-001 anchors', mh.ne === 179 && mh.discovered === 103 && mh.drifted === 21 && mh.notDiscovered === 76, `${mh.ne}/${mh.discovered}/${mh.drifted}/${mh.notDiscovered}`);
console.log(fail ? `revenue-check: ${fail} FAILED` : 'revenue-check: ok');
process.exit(fail ? 1 : 0);
