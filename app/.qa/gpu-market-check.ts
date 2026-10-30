/* GPU occupancy reconciles (npx tsx .qa/gpu-market-check.ts [persona] ; GEO=us): Σ by model = Σ by site = totals, sold = instances × 8,
   sellable = sold + available, available + held back = idle nodes × 8 (minus nothing else), readiness node counts = nodes, one-site views
   add up to the estate, instance and preemption ids unique, no NaN; enterprise has no market, every node has a readiness. */
import * as S from '../src/mock/server';
const personas = process.argv[2] ? [process.argv[2]] : ['cloud', 'enterprise', 'neocloud'];
let bad = 0; const fail = (m: string) => { bad++; if (bad < 40) console.log('FAIL', m); };
if (process.env.GEO) S.setGeo(process.env.GEO as 'in' | 'us');
for (const p of personas) {
  S.setPersona(p as never);
  const v = S.gpu();
  if (!v.nodes.every(n => n.ready && n.ready.status)) fail(`${p} node without readiness`);
  const m = v.market;
  if (p === 'enterprise') { if (m) fail('enterprise has a market'); continue; }
  if (!m) { fail(`${p} no market`); continue; }
  const txt = JSON.stringify(m); if (/NaN|undefined/.test(txt.replace(/"takenBy":undefined/g, ''))) fail(`${p} NaN/undefined in market`);
  const sum = (rows: typeof m.byModel, k: keyof (typeof rows)[number]) => rows.reduce((a, r) => a + (r[k] as number), 0);
  for (const k of ['installed', 'reserved', 'onDemand', 'spot', 'available', 'heldBack', 'out', 'sold', 'sellable'] as const) {
    if (sum(m.byModel, k) !== m[k]) fail(`${p} Σ model ${k} ${sum(m.byModel, k)} ≠ ${m[k]}`);
    if (sum(m.byPlace, k) !== m[k]) fail(`${p} Σ site ${k} ${sum(m.byPlace, k)} ≠ ${m[k]}`);
  }
  if (m.installed !== v.fleet.gpus) fail(`${p} installed ${m.installed} ≠ fleet ${v.fleet.gpus}`);
  if (m.sold !== m.instances.length * 8) fail(`${p} sold ${m.sold} ≠ instances ${m.instances.length} × 8`);
  if (m.sold !== v.fleet.inJobGpus) fail(`${p} sold ${m.sold} ≠ in-job GPUs ${v.fleet.inJobGpus}`);
  if (m.sellable !== m.sold + m.available) fail(`${p} sellable`);
  if (m.available + m.heldBack !== v.fleet.spareGpus) fail(`${p} available ${m.available} + held ${m.heldBack} ≠ spare ${v.fleet.spareGpus}`);
  if (m.out !== v.fleet.outGpus) fail(`${p} out ${m.out} ≠ ${v.fleet.outGpus}`);
  if (m.installed !== m.sold + m.available + m.heldBack + m.out) fail(`${p} installed split`);
  if (Object.values(m.readiness).reduce((a, b) => a + b, 0) !== v.fleet.nodes) fail(`${p} readiness nodes`);
  if (m.readiness['Held back'] * 8 !== m.heldBack) fail(`${p} held back nodes vs GPUs`);
  if (new Set(m.instances.map(i => i.id)).size !== m.instances.length) fail(`${p} duplicate instance ids`);
  if (new Set(m.preemptions.map(i => i.id)).size !== m.preemptions.length) fail(`${p} duplicate preemption ids`);
  if (m.interruptions24h !== m.preemptions.length || sum(m.byModel, 'interruptions24h') !== m.preemptions.length) fail(`${p} interruptions`);
  if (m.series.length !== 24 || m.series.some(x => x < 0 || x > 100)) fail(`${p} series`);
  if (m.instances.some(i => !v.nodes.find(n => n.neId === i.neId)?.instance)) fail(`${p} node row without its instance`);
  if (m.customers.reduce((a, c) => a + c.instances, 0) !== m.instances.length) fail(`${p} customers Σ instances`);
  /* every site view adds up to the estate */
  const agg = { installed: 0, sold: 0, available: 0, heldBack: 0, instances: 0, pre: 0 };
  for (const s of v.sites) { const x = S.gpu({ dcId: s.id }).market; if (!x) continue; agg.installed += x.installed; agg.sold += x.sold; agg.available += x.available; agg.heldBack += x.heldBack; agg.instances += x.instances.length; agg.pre += x.preemptions.length;
    if (x.placeKind !== 'pod' || x.byPlace.reduce((a, r) => a + r.installed, 0) !== x.installed) fail(`${p} ${s.id} pods ≠ site`); }
  if (agg.installed !== m.installed || agg.sold !== m.sold || agg.available !== m.available || agg.heldBack !== m.heldBack || agg.instances !== m.instances.length || agg.pre !== m.preemptions.length) fail(`${p} sites ≠ estate ${JSON.stringify(agg)}`);
  console.log(`${p}: ${m.installed} GPUs · sold ${m.sold} (res ${m.reserved} · od ${m.onDemand} · spot ${m.spot}) · for sale ${m.available} · held ${m.heldBack} · out ${m.out} · occ ${m.occupancyPct}% · sold-out models ${m.soldOut} · ${m.instances.length} instances · ${m.preemptions.length} interruptions · readiness ${JSON.stringify(m.readiness)}`);
}
console.log(bad ? `gpu market: ${bad} FAILED` : 'gpu market ok'); process.exit(bad ? 1 : 0);
