// Datacenter operations scope rules (run: npx tsx .qa/scope-check.ts)
import * as S from '../src/mock/server';
const db = S.raw();
let fail = 0; const ok = (n: string, c: boolean) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) fail++; };
const dcs = S.datacenters().filter(d => d.status !== 'planned');
ok('downstream alarms exist', db.alerts.some(a => a.scope === 'downstream'));
ok('no datacenter counts a downstream alarm', dcs.every(d => S.alertsInScope(d.id).every(a => a.scope !== 'downstream')));
ok('activeAlerts = site + edge + dependency', dcs.every(d => d.activeAlerts === d.byScope.site + d.byScope.edge + d.byScope.dependency));
const x3 = db.links.find(l => l.protocol === 'LLDP' && l.aNe === 'MH-DC-001-PE-T4-01' && l.aIf === 'xe-0/0/3') ?? db.links.find(l => l.protocol === 'LLDP' && l.zNe === 'MH-DC-001-PE-T4-01' && l.zIf === 'xe-0/0/3')!;
const far = db.neById.get(x3.aNe === 'MH-DC-001-PE-T4-01' ? x3.zNe : x3.aNe)!.dcId;
ok(`edge alarm on MH-DC-001 xe-0/0/3 counts for far end ${far}`, S.alertsInScope(far).some(a => a.code === 'ALM-1930' && a.scope === 'edge'));
ok('far end does not inherit MH-DC-001 site alarms (CPU)', !S.alertsInScope(far).some(a => a.code === 'ALM-1831'));
ok('symptoms reference a datacenter-scope cause', db.alerts.filter(a => a.symptomOf).every(a => db.alerts.some(c => c.code === a.symptomOf && c.scope !== 'downstream')));
ok('no incident is built from a downstream alarm', db.incidents.every(i => i.alertIds.every(id => db.alerts.find(a => a.id === id)?.scope !== 'downstream')));
ok('edge status is computed for every live site', dcs.every(d => d.edge.total > 0 && d.edge.up + d.edge.down === d.edge.total));
console.log(fail ? `${fail} FAILED` : 'ALL SCOPE RULES HOLD'); process.exit(fail ? 1 : 0);
