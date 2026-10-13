/* IP & Network read model reconciles with the estate (mock/ipam.ts).
   usage: npx tsx .qa/ipam-check.ts [persona…]   (GEO=us for the USA) */
import * as S from '../src/mock/server';
import { inPrefix, parse, toInt } from '../src/mock/ipam';
const personas = (process.argv.slice(2).length ? process.argv.slice(2) : ['network', 'colocation', 'cloud', 'enterprise', 'neocloud']) as any[];
if (process.env.GEO === 'us') S.setGeo('us');
let bad = 0;
const fail = (m: string) => { if (bad++ < 40) console.log('  ✗', m); };
for (const p of personas) {
  S.setPersona(p);
  const db: any = S.raw();
  const t0 = Date.now(); const m = S.ipam(); const ms = Date.now() - t0;
  const opaque = (n: any) => n.role === 'Tenant gear';
  /* every managed device has exactly its own management address */
  for (const n of db.nes.filter((x: any) => !opaque(x))) {
    const a = m.addresses.filter(x => x.deviceId === n.id && x.use === 'Management');
    if (a.length !== 1 || a[0].address !== n.ip) fail(`${n.id}: management address ${a.map(x => x.address)} ≠ ${n.ip}`);
  }
  /* addresses sit inside their prefix; no address twice in a VRF; used = bound */
  const byId = new Map(m.prefixes.map(x => [x.id, x]));
  const seen = new Set<string>();
  for (const a of m.addresses) {
    const k = `${a.vrf}|${a.address}`; if (seen.has(k)) fail(`duplicate ${k}`); seen.add(k);
    if (a.prefixId) { const pr = byId.get(a.prefixId); if (!pr) fail(`${a.id}: no prefix`); else if (!inPrefix(a.address, pr.prefix)) fail(`${a.address} not in ${pr.prefix}`); else if (pr.vrf !== a.vrf) fail(`${a.address} vrf ${a.vrf} ≠ prefix ${pr.vrf}`); }
    else if (a.status !== 'Outside plan') fail(`${a.id}: no prefix but status ${a.status}`);
  }
  for (const pr of m.prefixes) {
    if (pr.status === 'Container') continue;
    const n = m.addresses.filter(a => a.prefixId === pr.id).length;
    if (n !== pr.used) fail(`${pr.prefix}: used ${pr.used} ≠ ${n} bound`);
    if (pr.used > pr.size) fail(`${pr.prefix}: ${pr.used} > ${pr.size}`);
  }
  /* children inside parent, no sibling overlap */
  for (const pr of m.prefixes.filter(x => x.parentId)) {
    const par = byId.get(pr.parentId!)!; const a = parse(pr.prefix), b = parse(par.prefix);
    if (!(a.base >= b.base && a.base + 2 ** (32 - a.mask) <= b.base + 2 ** (32 - b.mask))) fail(`${pr.prefix} outside parent ${par.prefix}`);
  }
  const groups = new Map<string, any[]>(); for (const pr of m.prefixes) { const k = `${pr.vrf}|${pr.parentId ?? 'top'}`; groups.set(k, [...(groups.get(k) ?? []), pr]); }
  for (const [k, xs] of groups) for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) { const a = parse(xs[i].prefix), b = parse(xs[j].prefix); if (a.base < b.base + 2 ** (32 - b.mask) && b.base < a.base + 2 ** (32 - a.mask)) fail(`${k}: ${xs[i].prefix} overlaps ${xs[j].prefix}`); }
  /* every routing adjacency inside a site has two /31 ends; every inter-site LLDP link too */
  const intra = new Set(db.links.filter((l: any) => l.protocol !== 'LLDP' && db.neById.get(l.aNe)?.dcId === db.neById.get(l.zNe)?.dcId).map((l: any) => `${l.aNe}|${l.aIf}|${l.zNe}|${l.zIf}`)).size;
  const inter = db.links.filter((l: any) => l.protocol === 'LLDP' && db.neById.get(l.aNe).dcId !== db.neById.get(l.zNe).dcId).length;
  const links = m.addresses.filter(a => a.use === 'Link').length;
  if (links !== 2 * (intra + inter)) fail(`${p}: ${links} link addresses ≠ 2 × (${intra} adjacencies + ${inter} inter-site)`);
  /* hosts: every compute / storage host has one host address */
  const hosts = db.nes.filter((n: any) => ['Server', 'Storage', 'GPU'].includes(n.role));
  for (const h of hosts) if (m.addresses.filter(a => a.deviceId === h.id && a.use === 'Host').length !== 1) fail(`${h.id}: host address missing`);
  /* services: L3VPN/IRV have two PE–CE addresses; L2 services have a VLAN */
  const l3 = db.services.filter((s: any) => s.type === 'L3VPN' || s.type === 'IRV').length;
  if (m.addresses.filter(a => a.use === 'PE–CE').length !== 2 * l3) fail(`${p}: PE–CE addresses ≠ 2 × ${l3}`);
  const l2 = db.services.filter((s: any) => ['L2VPN', 'Leased Line', 'Cross-connect'].includes(s.type)).length;
  if (m.vlans.filter(v => v.serviceId).length !== l2) fail(`${p}: service VLANs ≠ ${l2}`);
  /* VLAN ids unique per site */
  const vk = new Set<string>(); for (const v of m.vlans) { const k = `${v.dcId}|${v.vid}`; if (vk.has(k)) fail(`VLAN ${k} twice`); vk.add(k); }
  /* gateways: one per host prefix, inside it */
  for (const g of m.fhrp) { const pr = byId.get(g.prefixId)!; if (!inPrefix(g.vip, pr.prefix)) fail(`VIP ${g.vip} outside ${pr.prefix}`); }
  /* site scope = slices of the estate */
  const s0 = db.datacenters[0].id; const sc = S.ipam({ dcId: s0 });
  if (sc.addresses.length !== m.addresses.filter(a => a.dcId === s0).length) fail('site scope addresses');
  const ex = m.findings.reduce((a: any, f) => { a[f.kind] = (a[f.kind] ?? 0) + 1; return a; }, {});
  console.log(`${p.padEnd(10)} prefixes ${m.prefixes.length} · addresses ${m.addresses.length} · vrfs ${m.vrfs.length} · vlans ${m.vlans.length} · asns ${m.asns.length} · gateways ${m.fhrp.length} · services ${m.services.length} · findings ${JSON.stringify(ex)} · ${ms} ms`);
}
void toInt;
console.log(bad ? `\n✗ ${bad} problem(s)` : '\n✓ IPAM reconciles');
process.exit(bad ? 1 : 0);
