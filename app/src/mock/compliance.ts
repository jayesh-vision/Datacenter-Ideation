/* Compliance (13-Oct-2026, P2B merge phase 7). Policies are evaluated on the estate itself (every resource they apply to, every time),
   framework controls are mapped to the policies that evidence them (P2B mapped ISO A.8.32 change management to a rack-power policy and
   A.5.23 cloud services to N+1 cooling; here each control points at what actually evidences it), manual controls carry an attestation date. */
import type { ComplianceControl, ComplianceFramework, CompliancePolicy, ComplianceView, ComplianceViolation, PolicyDecision } from '../api/types';
import type { Db } from './generate';
import { activeGeo } from './geo';
import { dcimModel } from './dcim';
import { ipamModel } from './ipam';
import { sitePhys } from './physical';
import { siteSafety } from './safety';
import { sitePm } from './maintenance';
import { modelDates } from './lifecycle';
import { changeRegister } from './changemgmt';
import { mulberry32, seedOf, intBetween } from '../lib/rng';
import { DAY } from './seed';

let cache: ComplianceView | null = null, cacheDb: Db | null = null;
export const clearCompliance = () => { cache = null; };
/* the user's moves (14-Oct-2026): policies switched off, manual controls attested, policies / controls / frameworks added by hand */
const ov = { off: new Set<string>(), attested: new Map<string, { at: number; by: string; note: string }>(), policies: [] as CompliancePolicy[], controls: [] as ComplianceControl[], frameworks: [] as { name: string; description: string; version: string }[] };
export const resetCompliance = () => { ov.off.clear(); ov.attested.clear(); ov.policies.length = 0; ov.controls.length = 0; ov.frameworks.length = 0; cache = null; };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
/* the Rego source of each built-in policy: what the evaluator runs against the resource it is given */
const REGO: Record<string, [string, string]> = {
  'CP-01': ['rack', 'violation[msg] {\n  input.rack.status == "Active"\n  input.rack.draw_kw > input.rack.budget_kw * 0.8\n  msg := sprintf("%s draws %.1f of %.1f kW (over 80%%)", [input.rack.name, input.rack.draw_kw, input.rack.budget_kw])\n}'],
  'CP-02': ['device', 'violation[msg] {\n  sides := {c.side | c := input.device.cords[_]; c.state == "live"}\n  count(sides) < 2\n  msg := sprintf("%s runs on one PDU side only", [input.device.name])\n}'],
  'CP-03': ['floor', 'violation[msg] {\n  input.floor.cooling_kw - input.floor.largest_unit_kw < input.floor.heat_kw\n  msg := sprintf("%s has no spare cooling unit (N+1 lost)", [input.floor.name])\n}'],
  'CP-04': ['ups', 'violation[msg] {\n  input.ups.battery_min < 10\n  msg := sprintf("%s holds its load %d min on battery (< 10)", [input.ups.name, input.ups.battery_min])\n}'],
  'CP-05': ['address', 'violation[msg] {\n  not net.cidr_contains(input.site.mgmt_prefix, input.address.ip)\n  msg := sprintf("%s is outside %s", [input.address.ip, input.site.mgmt_prefix])\n}'],
  'CP-06': ['device', 'violation[msg] {\n  time.parse_rfc3339_ns(input.model.end_of_support) < time.now_ns()\n  msg := sprintf("%s (%s) is past vendor end of support", [input.device.name, input.model.name])\n}'],
  'CP-07': ['change', 'deny[msg] {\n  some v in input.change.violations\n  v.enforcement == "Block"\n  msg := sprintf("%s breaks %s", [input.change.id, v.policy])\n}'],
  'CP-08': ['fire_zone', 'violation[msg] {\n  input.zone.inspection_due < time.now_ns()\n  not input.zone.inspection_booked\n  msg := sprintf("%s fire inspection overdue", [input.zone.name])\n}'],
  'CP-09': ['asset', 'violation[msg] {\n  input.task.next_due < time.now_ns()\n  msg := sprintf("%s: %s overdue", [input.asset.name, input.task.name])\n}'],
};
export function complianceView(db: Db): ComplianceView {
  if (cache && cacheDb === db) return cache;
  cacheDb = db; cache = build(db); return cache;
}

function build(db: Db): ComplianceView {
  const now = db.now;
  const live = db.datacenters.filter(d => d.status === 'on-air');
  const dm = dcimModel(db);
  const V: ComplianceViolation[] = [];
  const pol: CompliancePolicy[] = [];
  const P = (id: string, name: string, rule: string, area: CompliancePolicy['area'], enforcement: CompliancePolicy['enforcement'], evaluated: number, found: Omit<ComplianceViolation, 'id' | 'policyId' | 'outcome' | 'raised' | 'changeId'>[]) => {
    const off = ov.off.has(id), rr = mulberry32(seedOf(`cp:${id}`));
    const trigger: CompliancePolicy['trigger'] = area === 'Change' ? 'Change gate' : area === 'Lifecycle' || area === 'Maintenance' ? 'Nightly sweep' : 'On change';
    if (!off) found.forEach((f, i) => V.push({ ...f, id: `${id}-${i + 1}`, policyId: id, outcome: enforcement === 'Block' ? 'Blocked' : 'Warned', changeId: area === 'Change' ? f.resource : undefined, raised: now - intBetween(rr, 20, 60 * 24 * 6) * 60e3 }));
    const [res, body] = REGO[id] ?? ['resource', 'violation[msg] { false }'];
    pol.push({ id, name, rule, area, enforcement, evaluated: off ? 0 : evaluated, violations: off ? 0 : found.length, pkg: `dcos.${area.toLowerCase()}.${slug(name)}`,
      rego: `package dcos.${area.toLowerCase()}.${slug(name)}\n\n# ${rule}\n# input: one ${res}, evaluated ${trigger.toLowerCase()}\nimport rego.v1\n\n${body}`, active: !off, controlIds: [], lastRun: off ? undefined : now - intBetween(rr, 5, 600) * 60e3, trigger });
  };
  const ids = new Set(live.map(d => d.id));
  const racks = dm.racks.filter(r => ids.has(r.dcId) && r.status !== 'Planned');
  P('CP-01', 'Rack draw within 80% of its budget', 'Every live rack draws at most 80% of one PDU side, so it survives losing the other side.', 'Power', 'Warn', racks.length,
    racks.filter(r => r.powerPct > 80).map(r => ({ resource: r.id, resourceName: r.name, dcId: r.dcId, message: `${r.drawKw} of ${r.budgetKw} kW (${r.powerPct}%)`, to: `/dcim/racks/${encodeURIComponent(r.id)}` })));
  const single: Omit<ComplianceViolation, 'id' | 'policyId' | 'outcome' | 'raised' | 'changeId'>[] = []; let devs = 0;
  for (const d of live) { const ph = sitePhys(db, d.id); if (!ph) continue; const by = new Map<string, Set<string>>();
    for (const c of ph.cords) if (c.state === 'live' || c.state === 'on-battery') by.set(c.neId, (by.get(c.neId) ?? new Set()).add(c.pduId.slice(-1)));
    for (const [ne, sides] of by) { devs++; if (sides.size < 2) single.push({ resource: ne, resourceName: db.neById.get(ne)?.name ?? ne, dcId: d.id, message: 'Runs on one PDU side only', to: `/ne/${encodeURIComponent(ne)}?tab=physical` }); } }
  P('CP-02', 'Dual-fed devices', 'Every powered device draws from both the A and the B side.', 'Power', 'Block', devs, single);
  const zones = live.flatMap(d => sitePhys(db, d.id)?.zones ?? []);
  P('CP-03', 'Cooling keeps N+1', 'Every floor keeps one spare cooling unit beyond its heat load.', 'Cooling', 'Block', zones.length, zones.filter(z => z.state !== 'n+1').map(z => ({ resource: z.id, resourceName: `${z.dcId} · ${z.floor}`, dcId: z.dcId, message: z.state === 'short' ? 'Cooling short of the heat load' : 'No spare unit', to: `/facilities?dc=${z.dcId}&tab=cooling` })));
  const ups = live.flatMap(d => d.power.ups.map(u => ({ ...u, dcId: d.id })));
  P('CP-04', 'UPS autonomy at least 10 minutes', 'Every UPS module carries its load on battery for 10 minutes or more (time for the generator to start and take the load).', 'Power', 'Warn', ups.length, ups.filter(u => u.batteryMin < 10).map(u => ({ resource: `${u.dcId}-${u.name}`, resourceName: `${u.dcId} ${u.name}`, dcId: u.dcId, message: `${u.batteryMin} min at ${u.loadPct}% load`, to: `/facilities?dc=${u.dcId}` })));
  const ip = ipamModel(db);
  P('CP-05', 'Addresses inside the site plan', 'Every management address sits inside its site\'s management prefixes and is unique in its VRF.', 'Network', 'Warn', ip.addresses.length,
    ip.findings.filter(f => f.kind === 'Outside plan' || f.kind === 'Conflict').map(f => ({ resource: f.ref ?? f.id, resourceName: f.title, dcId: f.dcId ?? '', message: f.kind, to: '/ipam?tab=addresses&ast=Outside%20plan' })));
  const nes = dm.devices.filter(d => ids.has(d.dcId) && d.status !== 'Tenant-owned' && d.status !== 'Planned');
  P('CP-06', 'No device past vendor end of support', 'Every installed device runs a model the vendor still supports.', 'Lifecycle', 'Warn', nes.length, nes.filter(d => modelDates(d.model, now).endOfSupport < now).map(d => ({ resource: d.id, resourceName: d.name, dcId: d.dcId, message: `${d.model} past end of support`, to: `/ne/${encodeURIComponent(d.id)}?tab=hardware` })));
  const ch = changeRegister(db).changes.filter(c => !['Completed', 'Rolled back', 'Rejected'].includes(c.status));
  P('CP-07', 'Changes follow the change policy', 'No open change breaks a blocking change policy (rollback plan, freeze).', 'Change', 'Block', ch.length, ch.filter(c => c.violations.some(v => v.enforcement === 'Block')).map(c => ({ resource: c.id, resourceName: c.title, dcId: c.dcId, message: c.violations.filter(v => v.enforcement === 'Block').map(v => v.text).join('; '), to: `/changes/${encodeURIComponent(c.id)}` })));
  const fire = live.flatMap(d => siteSafety(db, d.id)?.fire ?? []);
  P('CP-08', 'Fire systems inspected on schedule', 'Every fire zone has its quarterly inspection done or booked.', 'Safety', 'Warn', fire.length, fire.filter(f => f.state !== 'ok').map(f => ({ resource: f.id, resourceName: `${f.dcId} · ${f.zone}`, dcId: f.dcId, message: f.note ?? 'Attention', to: `/facilities?dc=${f.dcId}&tab=environment` })));
  const pm = live.flatMap(d => sitePm(db, d.id) ?? []);
  P('CP-09', 'Plant maintenance not overdue', 'Every plant asset has its preventive maintenance within its interval.', 'Maintenance', 'Warn', pm.length, pm.filter(t => t.state === 'overdue').map(t => ({ resource: t.id, resourceName: `${t.dcId} · ${t.asset}`, dcId: t.dcId, message: `${t.task} overdue since ${new Date(t.nextDue).toISOString().slice(0, 10)}`, to: `/facilities?dc=${t.dcId}&tab=maintenance` })));

  /* ---- frameworks and controls */
  const ppl = activeGeo().people;
  const r = mulberry32(seedOf('compliance'));
  const C: [string, string, string, 'Automated' | 'Manual', string[]][] = [
    ['ISO/IEC 27001:2022', 'A.7.11', 'Supporting utilities', 'Automated', ['CP-02', 'CP-04']],
    ['ISO/IEC 27001:2022', 'A.7.13', 'Equipment maintenance', 'Automated', ['CP-09']],
    ['ISO/IEC 27001:2022', 'A.8.32', 'Change management', 'Automated', ['CP-07']],
    ['ISO/IEC 27001:2022', 'A.8.9', 'Configuration management', 'Automated', ['CP-05']],
    ['ISO/IEC 27001:2022', 'A.7.2', 'Physical entry', 'Manual', []],
    ['ISO/IEC 27001:2022', 'A.5.30', 'ICT readiness for business continuity', 'Manual', []],
    ['ISO/IEC 22237', '22237-3', 'Power distribution', 'Automated', ['CP-01', 'CP-02', 'CP-04']],
    ['ISO/IEC 22237', '22237-4', 'Environmental control', 'Automated', ['CP-03']],
    ['ISO/IEC 22237', '22237-6', 'Security systems (fire, access)', 'Automated', ['CP-08']],
    ['ISO/IEC 22237', '22237-7', 'Management and operational information', 'Automated', ['CP-09', 'CP-06']],
    ['TIA-942-C', 'Electrical', 'Redundant distribution to the rack', 'Automated', ['CP-02', 'CP-01']],
    ['TIA-942-C', 'Mechanical', 'Cooling redundancy', 'Automated', ['CP-03']],
    ['TIA-942-C', 'Telecom', 'Structured cabling records', 'Manual', []],
    ['SOC 2', 'CC8.1', 'Change management', 'Automated', ['CP-07']],
    ['SOC 2', 'A1.2', 'Environmental protections and recovery infrastructure', 'Automated', ['CP-03', 'CP-04', 'CP-08']],
    ['SOC 2', 'CC7.1', 'Vulnerability and configuration monitoring', 'Automated', ['CP-06', 'CP-05']],
    ['SOC 2', 'CC6.4', 'Physical access to facilities', 'Manual', []]
  ];
  pol.push(...ov.policies.map(p => ({ ...p, active: !ov.off.has(p.id) })));
  const byId = new Map(pol.map(p => [p.id, p]));
  const all: [string, string, string, 'Automated' | 'Manual', string[], boolean?][] = [...C, ...ov.controls.map(c => [c.framework, c.ref, c.title, c.type, c.policyIds, true] as [string, string, string, 'Automated' | 'Manual', string[], boolean])];
  const controls: ComplianceControl[] = all.map(([framework, ref, title, type, policyIdsAll, custom], i) => {
    const policyIds = [...policyIdsAll, ...pol.filter(p => p.custom && p.controlIds.includes(`CTL-${String(i + 1).padStart(2, '0')}`)).map(p => p.id)];
    const ps = policyIds.map(id => byId.get(id)!).filter(p => p.active);
    const vio = ps.reduce((a, p) => a + p.violations, 0), ev = ps.reduce((a, p) => a + p.evaluated, 0);
    const cid = `CTL-${String(i + 1).padStart(2, '0')}`, att = ov.attested.get(cid);
    const assessed = att?.at ?? (type === 'Automated' ? now : now - intBetween(r, 40, 420) * DAY);
    const status: ComplianceControl['status'] = type === 'Manual' ? (att ? 'Compliant' : custom ? 'Evidence due' : now - assessed > 365 * DAY ? 'Evidence due' : 'Compliant')
      : !ps.length ? 'Not assessed' : ps.every(p => p.custom) ? 'Not assessed' : vio === 0 ? 'Compliant' : ps.some(p => p.enforcement === 'Block' && p.violations) || vio / Math.max(1, ev) > 0.05 ? 'Non-compliant' : 'Partial';
    return { id: cid, framework, ref, title, type, policyIds, status, owner: att?.by ?? ppl[(i % 5) + 1] ?? 'Compliance', assessed, custom,
      evidence: type === 'Manual' ? (att ? `Attested: ${att.note}` : custom ? 'Not attested yet' : `Attestation and audit sample on ${new Date(assessed).toISOString().slice(0, 10)}`) : !ps.length ? 'No active policy evidences it' : `${ev} resources evaluated by ${policyIds.join(', ')}; ${vio} finding${vio === 1 ? '' : 's'}` };
  });
  const fws = [...new Set([...C.map(c => c[0]), ...ov.frameworks.map(f => f.name)])];
  const DESC: Record<string, string> = { 'ISO/IEC 27001:2022': 'Information security management (Annex A controls that a datacenter evidences)', 'ISO/IEC 22237': 'Datacenter facilities and infrastructure (EN 50600 family)', 'TIA-942-C': 'Telecommunications infrastructure standard for datacenters', 'SOC 2': 'Trust services criteria (security, availability)' };
  const VER: Record<string, string> = { 'ISO/IEC 27001:2022': '2022 Annex A', 'ISO/IEC 22237': '2018 / 2021', 'TIA-942-C': 'Rev C (2024)', 'SOC 2': 'TSC 2017 (rev. 2022)' };
  const frameworks: ComplianceFramework[] = fws.map((f, i) => { const cu = ov.frameworks.find(x => x.name === f); return { id: `FW-${i + 1}`, name: f, description: cu?.description ?? DESC[f], version: cu?.version ?? VER[f], custom: !!cu, controls: controls.filter(c => c.framework === f).length, compliant: controls.filter(c => c.framework === f && c.status === 'Compliant').length }; });
  for (const p of pol) p.controlIds = controls.filter(c => c.policyIds.includes(p.id)).map(c => c.id);
  /* decision records: every finding is a deny (blocking) or warn decision; passing resources are summarised as one allow per policy and site */
  const decisions: PolicyDecision[] = [];
  for (const v of V) { const p = byId.get(v.policyId)!; decisions.push({ id: `DEC-${v.id}`, policyId: p.id, policyName: p.name, resource: v.resource, resourceName: v.resourceName, resourceType: (REGO[p.id] ?? ['resource'])[0], dcId: v.dcId,
    decision: p.enforcement === 'Block' ? 'deny' : 'warn', at: v.raised, by: p.trigger, input: { policy: p.pkg, resource: { id: v.resource, name: v.resourceName, site: v.dcId }, finding: v.message }, result: v.message }); }
  for (const p of pol.filter(x => x.active && !x.custom)) { const rr = mulberry32(seedOf(`allow:${p.id}`));
    for (const d of live.slice(0, 6)) { const bad = V.filter(v => v.policyId === p.id && v.dcId === d.id).length; const n = Math.max(0, Math.round(p.evaluated / live.length) - bad); if (!n) continue;
      decisions.push({ id: `DEC-${p.id}-${d.id}`, policyId: p.id, policyName: p.name, resource: d.id, resourceName: `${n} ${(REGO[p.id] ?? ['resource'])[0].replace('_', ' ')}s at ${d.id}`, resourceType: 'sweep', dcId: d.id, decision: 'allow', at: p.lastRun ?? now - intBetween(rr, 30, 900) * 60e3, by: p.trigger,
        input: { policy: p.pkg, scope: { site: d.id, resources: n + bad }, passed: n, failed: bad }, result: `${n} passed${bad ? `, ${bad} failed (listed separately)` : ''}` }); } }
  decisions.sort((a, b) => b.at - a.at);
  return { frameworks, controls, policies: pol, violations: V, decisions };
}

/* ---- the user's moves */
export function setPolicyActive(db: Db, id: string, on: boolean) { const p = complianceView(db).policies.find(x => x.id === id); if (!p) throw new Error('Unknown policy'); on ? ov.off.delete(id) : ov.off.add(id); cache = null; }
export function attestControl(db: Db, id: string, note: string, who: string) {
  const c = complianceView(db).controls.find(x => x.id === id); if (!c) throw new Error('Unknown control');
  if (c.type !== 'Manual') throw new Error('Automated controls are evidenced by their policies');
  if (!note.trim()) throw new Error('Describe the evidence (document, audit sample, walk-through)');
  ov.attested.set(id, { at: db.now, by: who, note: note.trim() }); cache = null;
}
export function addPolicy(_db: Db, x: { name: string; area: CompliancePolicy['area']; enforcement: CompliancePolicy['enforcement']; rule: string; rego: string; controlIds: string[] }) {
  if (!x.name.trim() || !x.rule.trim()) throw new Error('Give the policy a name and a rule');
  if (!/^\s*package\s+[a-z0-9_.]+/m.test(x.rego)) throw new Error('The Rego source must start with a package line');
  const id = `CP-${String(10 + ov.policies.length).padStart(2, '0')}`;
  ov.policies.push({ id, name: x.name.trim(), rule: x.rule.trim(), area: x.area, enforcement: x.enforcement, evaluated: 0, violations: 0, pkg: /package\s+([a-z0-9_.]+)/.exec(x.rego)![1], rego: x.rego, active: true, controlIds: x.controlIds, custom: true, trigger: 'On change' });
  cache = null; return id;
}
export function addControl(db: Db, x: { framework: string; ref: string; title: string; type: ComplianceControl['type']; policyIds: string[] }) {
  if (!x.framework.trim() || !x.ref.trim() || !x.title.trim()) throw new Error('Framework, reference and title are required');
  if (complianceView(db).controls.some(c => c.framework === x.framework && c.ref === x.ref.trim())) throw new Error(`${x.ref} already exists in ${x.framework}`);
  ov.controls.push({ id: '', framework: x.framework, ref: x.ref.trim(), title: x.title.trim(), type: x.type, policyIds: x.type === 'Automated' ? x.policyIds : [], status: 'Not assessed', evidence: '', owner: '', assessed: db.now, custom: true });
  cache = null;
}
export function addFramework(db: Db, x: { name: string; version: string; description: string }) {
  if (!x.name.trim()) throw new Error('Give the framework a name');
  if (complianceView(db).frameworks.some(f => f.name.toLowerCase() === x.name.trim().toLowerCase())) throw new Error('This framework already exists');
  ov.frameworks.push({ name: x.name.trim(), version: x.version.trim(), description: x.description.trim() || 'Added by hand' }); cache = null;
}
