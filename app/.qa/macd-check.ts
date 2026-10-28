/* MACD reconciles (npx tsx .qa/macd-check.ts [persona] ; GEO=us): ids unique, every request from Scheduled on has a change request that
   Change management lists with source MACD and the same id back, colocation cross-connect orders in flight = MACD cross-connect requests,
   site and metric figures = the requests behind them, no NaN; then runs one request end to end (create → accept → quote → approve → start →
   complete → verify) and checks the DCIM hold, the change and the rack effect. */
import * as S from '../src/mock/server';
const personas = process.argv[2] ? [process.argv[2]] : ['network', 'colocation', 'cloud', 'enterprise', 'neocloud'];
let bad = 0; const fail = (m: string) => { bad++; if (bad < 40) console.log('FAIL', m); };
if (process.env.GEO) S.setGeo(process.env.GEO as 'in' | 'us');
for (const p of personas) {
  S.setPersona(p as never);
  const t = Date.now(); const v = S.macd(); const ms = Date.now() - t;
  const ids = new Set(v.requests.map(r => r.id)); if (ids.size !== v.requests.length) fail(`${p} duplicate request ids`);
  const reg = S.changeMgmt().changes;
  for (const r of v.requests) {
    if (JSON.stringify(r).includes('NaN') || JSON.stringify(r).includes('undefined')) fail(`${p} ${r.id} NaN/undefined`);
    if (['Scheduled', 'In progress', 'Verification', 'Completed'].includes(r.stage)) {
      const c = reg.find(x => x.id === r.changeId);
      if (!c) fail(`${p} ${r.id} ${r.stage} has no change ${r.changeId}`);
      else { if (c.source !== 'MACD' || c.macdId !== r.id) fail(`${p} ${c.id} source ${c.source} macd ${c.macdId}`); if (r.changeStatus !== c.status) fail(`${p} ${r.id} change status`); }
    }
    if (r.stage === 'Completed' && !r.completedAt) fail(`${p} ${r.id} completed without date`);
  }
  if (reg.filter(c => c.source === 'MACD').some(c => !ids.has(c.macdId!))) fail(`${p} MACD change without request`);
  if (p === 'colocation') {
    const xc = S.colocationOrders({}).xc.filter(x => x.state !== 'Handed over');
    const m = v.requests.filter(r => r.ref?.startsWith('XC-'));
    if (xc.length !== m.length || xc.some(x => !m.some(r => r.ref === x.id))) fail(`${p} XC orders ${xc.length} ≠ MACD ${m.length}`);
  }
  const open = v.requests.filter(r => !['Completed', 'Rejected', 'Cancelled'].includes(r.stage));
  if (open.length !== v.metrics.open) fail(`${p} open ${v.metrics.open} ≠ ${open.length}`);
  if (v.sites.reduce((s, x) => s + x.open, 0) !== open.length) fail(`${p} Σ site open`);
  if (v.metrics.byStage.reduce((s, x) => s + x.n, 0) !== open.length) fail(`${p} Σ by stage`);
  if (v.metrics.byKind.reduce((s, x) => s + x.open, 0) !== open.length) fail(`${p} Σ by kind`);
  console.log(`${p}: ${v.requests.length} requests · ${open.length} open (${v.metrics.atRisk} at risk, ${v.metrics.breached} breached) · ${v.metrics.done30} done 30 d, ${v.metrics.onTimePct}% on time · ${v.catalog.length} catalogue items · ${ms} ms`);
  /* end to end: an install in a rack with room */
  const cat = v.catalog.find(c => c.id === 'MAC-A01');
  const dcs = S.datacenters().filter(d => d.status === 'on-air').map(d => S.datacenter(d.id)!.dc);
  const ok = (r: { heightU: number; usedU: number; drawKw: number; budgetKw: number; tempC: number; owner?: string }) => r.heightU - r.usedU >= 8 && r.drawKw < r.budgetKw * 0.5 && r.tempC < 27 && (p !== 'colocation' || r.owner === 'tenant');
  const dc = dcs.find(d => !S.macd().requests.some(() => false) && d.racks.some(ok))!;
  const rk = dc?.racks.find(ok);
  if (cat && rk) {
    try {
      const pv = S.macdPreview({ catalogId: 'MAC-A01', dcId: dc.id, rackId: rk.id, qty: 2, priority: 'Standard', detail: '' });
      const id = S.macdCreate({ catalogId: 'MAC-A01', dcId: dc.id, rackId: rk.id, qty: 2, priority: 'Standard', detail: 'QA' });
      const u0 = rk.usedU;
      S.macdAct(id, 'accept');
      let r = S.macd().requests.find(x => x.id === id)!;
      if (r.stage === 'Quote') { S.macdAct(id, 'quote'); r = S.macd().requests.find(x => x.id === id)!; }
      if (r.stage !== 'Scheduled' || !r.changeId?.startsWith('CHG-')) fail(`${p} e2e not scheduled: ${r.stage} ${r.changeId}`);
      if (!r.holdId) fail(`${p} e2e no DCIM hold (${r.history.at(-1)?.text})`);
      if (r.changeStatus !== 'Approved') S.setChangeStatus(r.changeId!, 'Approved');
      S.macdAct(id, 'start'); S.macdAct(id, 'complete'); S.macdAct(id, 'verify');
      r = S.macd().requests.find(x => x.id === id)!;
      const rk2 = S.datacenter(dc.id)!.dc.racks.find(x => x.id === rk.id)!;
      if (r.stage !== 'Completed' || r.changeStatus !== 'Completed') fail(`${p} e2e end ${r.stage} ${r.changeStatus}`);
      if (rk2.usedU !== u0 + 4) fail(`${p} e2e rack U ${u0} → ${rk2.usedU}`);
      if (r.sla !== 'Met') fail(`${p} e2e sla ${r.sla}`);
      console.log(`  e2e ${id} in ${rk.id}: ${pv.checks.map(c => `${c.key}:${c.result}`).join(' ')} → ${r.history.map(h => h.text).join(' | ').slice(0, 400)}`);
    } catch (e) { fail(`${p} e2e threw ${(e as Error).message}`); }
  }
}
console.log(bad ? `${bad} failures` : 'MACD ok');
process.exit(bad ? 1 : 0);
