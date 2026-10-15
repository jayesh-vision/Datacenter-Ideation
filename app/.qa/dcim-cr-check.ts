/* DCIM change control (mock): raise → approve → execute, standard changes, staged work, tags.  usage: npx tsx .qa/dcim-cr-check.ts [persona] (GEO=us) */
import * as S from '../src/mock/server';
S.setGeo((process.env.GEO as 'us') ?? 'us'); S.setPersona((process.argv[2] as 'neocloud') ?? 'neocloud');
let bad = 0; const ok = (c: unknown, m: string) => { if (!c) { bad++; console.log('  ✗', m); } };
const sites = S.dcim().sites.filter(s => s.status !== 'planned');
for (const site of sites.slice(0, 4)) { const o = S.dcimCrOptions(site.id); console.log(site.id, 'open CRs', o.length, '·', o.filter(x => x.applies === 'now').length, 'now ·', o.filter(x => x.blocked).length, 'on hold'); }
const dc = sites[1].id;
const hall = S.dcim({ dcId: dc }).halls.find(h => h.racks)!;
const r1 = S.dcimRun('createRack', [{ dcId: dc, hallId: hall.id, name: 'RACK-ZZ', heightU: 42, budgetKw: 8, role: 'Compute' }], { raise: { windowStart: S.now() + 3600e3, hours: 4, rollback: 'Remove the rack' } });
ok(r1.staged && !S.dcim({ dcId: dc }).racks.some(r => r.name === 'RACK-ZZ'), 'raised CR keeps the rack as planned work');
const rec = S.changeRecord(r1.changeId)!.change; console.log(r1.changeId, rec.source, rec.cls, rec.status, rec.violations.map(v => v.text).join('; ') || 'no findings');
ok(rec.source === 'DCIM' && rec.status === 'Pending approval', 'raised CR is DCIM / Pending approval');
let e = ''; try { S.dcimExecute(r1.itemId); } catch (x) { e = (x as Error).message; } ok(/approved/.test(e), 'cannot execute before approval: ' + e);
for (let k = 0; k < 5 && S.changeRecord(r1.changeId)!.change.status === 'Pending approval'; k++) S.decideChange(r1.changeId, true);
ok(S.changeRecord(r1.changeId)!.change.status === 'Approved', 'approved');
S.dcimExecute(r1.itemId);
const rk = `${dc}-RACK-ZZ`;
ok(S.dcim({ dcId: dc }).racks.some(r => r.id === rk), 'rack exists after execute');
ok(S.changeRecord(r1.changeId)!.change.status === 'Completed', 'DCIM CR completes when its work is done');
ok(S.dcimTags({ dcId: dc })[`rack:${rk}`] === r1.changeId, 'rack tagged with its CR');
ok(S.raw().audit.some(a => a.object === rk && a.next.includes(r1.changeId)), 'audit line names the CR');
const r2 = S.dcimRun('reserveU', [rk, { u: 1, uHeight: 2, label: 'test' }], { standard: true });
const c2 = S.changeRecord(r2.changeId)!.change;
ok(!r2.staged && c2.cls === 'Standard' && c2.status === 'Completed', `standard change applied + closed (${c2.cls} ${c2.status})`);
e = ''; try { S.dcimRun('createRack', [{ dcId: dc, hallId: hall.id, name: 'RACK-ZY', heightU: 42, budgetKw: 8, role: 'Compute' }], { standard: true }); } catch (x) { e = (x as Error).message; } ok(!!e, 'new rack is not a standard change');
e = ''; try { S.dcimRun('createRack', [{ dcId: dc, hallId: hall.id, name: 'RACK-ZY', heightU: 42, budgetKw: 8, role: 'Compute' }], { changeId: r1.changeId }); } catch (x) { e = (x as Error).message; } ok(/completed/.test(e), 'completed CR refused: ' + e);
const pend = S.dcimCrOptions(dc).find(o => o.applies === 'staged');
if (pend) { const r3 = S.dcimRun('editRack', [rk, { role: 'GPU', heightU: 42, budgetKw: 12 }], { changeId: pend.id }); ok(r3.staged && S.dcimItemsOf(pend.id).length >= 1, 'work added to a pending CR is staged'); S.dcimCancelItem(r3.itemId); }
ok(!S.dcimRun.length || true, '');
console.log(bad ? `${bad} failures` : 'all DCIM change-control checks pass');
process.exit(bad ? 1 : 0);
