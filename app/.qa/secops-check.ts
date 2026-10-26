/* Security Ops reconciles with the estate (npx tsx .qa/secops-check.ts [persona] ; GEO=us):
   physical detections = the access log's security exceptions, unauthorised drifts = SR-002 detections, every case's detections exist
   and point back at it, site figures = the detections / vulnerabilities / drifts behind them, technique rule counts = enabled rules,
   advisory affected counts = findings, no NaN. Prints sizes and build time per persona. */
import * as S from '../src/mock/server';
const personas = process.argv[2] ? [process.argv[2]] : ['network', 'colocation', 'cloud', 'enterprise', 'neocloud'];
let bad = 0; const fail = (m: string) => { bad++; if (bad < 40) console.log('FAIL', m); };
if (process.env.GEO) S.setGeo(process.env.GEO as 'in' | 'us');
for (const p of personas) {
  S.setPersona(p as never);
  const t = Date.now(); const v = S.secops(); const ms = Date.now() - t;
  const live = S.datacenters().filter(d => d.status !== 'planned');
  let exc = 0; for (const d of live) exc += S.siteAccess(d.id)?.exceptions.length ?? 0;
  const phys = v.detections.filter(d => d.domain === 'Physical');
  if (phys.length !== exc) fail(`${p} physical detections ${phys.length} ≠ access exceptions ${exc}`);
  const un = v.drift.filter(x => !x.authorised), sr2 = v.detections.filter(d => d.ruleId === 'SR-002');
  if (un.length !== sr2.length) fail(`${p} unauthorised drifts ${un.length} ≠ SR-002 detections ${sr2.length}`);
  un.forEach(x => { if (!x.detectionId || !sr2.some(d => d.id === x.detectionId)) fail(`${p} drift ${x.id} has no detection`); });
  const ids = new Set(v.detections.map(d => d.id)); if (ids.size !== v.detections.length) fail(`${p} duplicate detection ids`);
  for (const c of v.cases) { if (!c.detectionIds.length) fail(`${p} ${c.id} has no detections`); c.detectionIds.forEach(id => { const d = v.detections.find(x => x.id === id); if (!d) fail(`${p} ${c.id} → ${id} missing`); else if (d.caseId !== c.id) fail(`${p} ${id}.caseId ${d.caseId} ≠ ${c.id}`); }); }
  v.detections.filter(d => d.caseId).forEach(d => { if (!v.cases.some(c => c.id === d.caseId && c.detectionIds.includes(d.id))) fail(`${p} ${d.id} → ${d.caseId} not listing it`); });
  for (const s of v.sites) {
    const open = v.detections.filter(d => d.dcId === s.dcId && d.state !== 'Closed');
    if (open.length !== s.open) fail(`${p} ${s.dcId} open ${s.open} ≠ ${open.length}`);
    if (open.filter(d => d.severity === 'Critical').length !== s.critical) fail(`${p} ${s.dcId} critical`);
    if (v.vulns.filter(x => x.dcId === s.dcId && x.ssvc === 'Act' && x.state === 'Open').length !== s.act) fail(`${p} ${s.dcId} act`);
    if (v.cases.filter(c => c.dcId === s.dcId && c.phase !== 'Closed').length !== s.cases) fail(`${p} ${s.dcId} cases`);
  }
  for (const tq of v.techniques) if (v.rules.filter(r => r.enabled && r.techniques.includes(tq.id)).length !== tq.rules) fail(`${p} ${tq.id} rules`);
  for (const a of v.advisories) if (v.vulns.filter(x => x.advisoryId === a.id).length !== a.affected) fail(`${p} ${a.id} affected`);
  const story = v.cases.filter(c => c.story).map(c => c.id).join(' ');
  const txt = JSON.stringify(v); if (/NaN|undefined/.test(txt.replace(/"[^"]*undefined[^"]*"/g, ''))) fail(`${p} NaN in view`);
  console.log(`${p}: ${ms} ms · ${(txt.length / 1e6).toFixed(1)} MB · det ${v.detections.length} (open ${v.detections.filter(d => d.state !== 'Closed').length}, physical ${phys.length}) · cases ${v.cases.length} [${story}] · vulns ${v.vulns.length} (Act ${v.vulns.filter(x => x.ssvc === 'Act').length}) · hardening ${v.hardening.length} · drift ${v.drift.length} (${un.length} unauthorised) · OT ${v.otAssets.length} · sites ${v.sites.length} · MTTD ${v.metrics.mttdMin} min MTTA ${v.metrics.mttaMin} MTTR ${v.metrics.mttrH} h FP ${v.metrics.fpPct}%`);
}
console.log(bad ? `${bad} failures` : 'secops-check: all good');
process.exit(bad ? 1 : 0);
