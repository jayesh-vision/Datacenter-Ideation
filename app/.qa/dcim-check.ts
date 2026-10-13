/* DCIM read model reconciles with the operations estate (mock/dcim.ts).
   usage: npx tsx .qa/dcim-check.ts [persona…]   (GEO=us for the USA) */
import * as S from '../src/mock/server';
const personas = (process.argv.slice(2).length ? process.argv.slice(2) : ['network', 'colocation', 'cloud', 'enterprise', 'neocloud']) as any[];
if (process.env.GEO === 'us') S.setGeo('us');
let bad = 0;
const fail = (m: string) => { if (bad++ < 40) console.log('  ✗', m); };
const near = (a: number, b: number, tol = 0.15) => Math.abs(a - b) <= tol + Math.abs(b) * 0.005;
for (const p of personas) {
  S.setPersona(p);
  const db: any = S.raw();
  const t0 = Date.now();
  const all = S.dcim();
  const ms = Date.now() - t0;
  const devs = S.dcimDevices(), cables = S.dcimCables();
  /* sites / racks / devices = the estate */
  if (all.sites.length !== db.datacenters.length) fail(`${p}: ${all.sites.length} sites ≠ ${db.datacenters.length}`);
  const nRacks = db.datacenters.reduce((a: number, d: any) => a + d.racks.length, 0);
  if (all.racks.length !== nRacks) fail(`${p}: ${all.racks.length} racks ≠ ${nRacks}`);
  if (devs.length !== db.nes.length) fail(`${p}: ${devs.length} devices ≠ ${db.nes.length} NEs`);
  for (const s of all.sites) {
    const dc = db.datacenters.find((d: any) => d.id === s.id);
    const hs = all.halls.filter(h => h.dcId === s.id), rs = all.racks.filter(r => r.dcId === s.id);
    if (hs.length !== dc.floors.reduce((a: number, f: any) => a + f.rooms.length, 0)) fail(`${s.id}: halls ≠ rooms`);
    if (hs.reduce((a, h) => a + h.racks, 0) !== rs.length) fail(`${s.id}: Σ hall racks ≠ racks`);
    if (!near(hs.reduce((a, h) => a + h.drawKw, 0), s.itKw, 0.6)) fail(`${s.id}: Σ hall draw ${hs.reduce((a, h) => a + h.drawKw, 0)} ≠ site IT ${s.itKw}`);
    if (s.devices !== devs.filter(d => d.dcId === s.id).length) fail(`${s.id}: site devices ≠ device list`);
    if (s.cables !== cables.filter(c => c.dcId === s.id).length) fail(`${s.id}: site cables ≠ cable list`);
    /* rows partition the racks; grid positions unique per hall */
    const inRows = all.rows.filter(r => r.dcId === s.id).flatMap(r => r.racks);
    if (inRows.length !== rs.length || new Set(inRows).size !== rs.length) fail(`${s.id}: rows do not partition the racks`);
    const pos = new Set(rs.map(r => `${r.hallId}:${r.gridX}:${r.gridY}`)); if (pos.size !== rs.length) fail(`${s.id}: two racks share a floor-plan position`);
  }
  for (const r of all.racks) {
    const ds = devs.filter(d => d.rackId === r.id);
    if (r.devices !== ds.length) fail(`${r.id}: devices ${r.devices} ≠ ${ds.length}`);
    const devU = ds.reduce((a, d) => a + d.uHeight, 0);
    const extra = r.role === 'ODF / patching' ? 18 : 0;
    if (r.usedU !== devU + extra) fail(`${r.id}: usedU ${r.usedU} ≠ Σ device U ${devU}${extra ? ` + ${extra} ODF` : ''}`);
    if (r.usedU > r.heightU) fail(`${r.id}: overfilled ${r.usedU}/${r.heightU}U`);
    /* no two devices share a U */
    const taken = new Map<number, string>();
    for (const d of ds) for (let u = d.u; u < d.u + d.uHeight; u++) { if (taken.has(u)) fail(`${r.id}: U${u} used by ${taken.get(u)} and ${d.id}`); taken.set(u, d.id); if (u > r.heightU || u < 1) fail(`${d.id} at U${u} outside ${r.heightU}U`); }
    /* power: Σ feeds = rack draw */
    const fs = all.feeds.filter(f => f.rackId === r.id);
    /* same tolerance as physical-check; a rack with a host that lost every supply (the "Host Power Lost" story) is skipped:
       its cords carry nothing while the rack meter (shared with Facilities) still holds the host's last reading */
    const cordsR = S.dcimCables({ kind: 'Power' }).filter(c => ds.some(d => d.id === c.aDevice));
    const dark = ds.some(d => { const cs = cordsR.filter(c => c.aDevice === d.id); return cs.length > 0 && cs.every(c => c.status !== 'Connected'); });
    if (!dark && Math.abs(fs.reduce((a, f) => a + f.loadKw, 0) - r.drawKw) > 0.25 + r.drawKw * 0.02) fail(`${r.id}: Σ feed load ${fs.reduce((a, f) => a + f.loadKw, 0).toFixed(1)} ≠ draw ${r.drawKw}`);
    if (r.status !== 'Planned' && fs.filter(f => f.kind === 'AC').length !== 2) fail(`${r.id}: ${fs.length} AC feeds, expected A + B`);
  }
  /* panels: Σ panel load = Σ feed load; every feed has a panel */
  const pk = new Set(all.panels.map(x => x.id));
  for (const f of all.feeds) if (!pk.has(f.panelId)) fail(`${f.id}: no panel ${f.panelId}`);
  for (const x of all.panels) { const fl = all.feeds.filter(f => f.panelId === x.id); if (fl.length !== x.feeds) fail(`${x.id}: feeds ${x.feeds} ≠ ${fl.length}`); if (!near(fl.reduce((a, f) => a + f.loadKw, 0), x.loadKw, 0.3)) fail(`${x.id}: load mismatch`); }
  /* cables: one data cable per LLDP link, one power cable per cord */
  const lldp = db.links.filter((l: any) => l.protocol === 'LLDP').length;
  const data = cables.filter(c => c.kind === 'Data').length, power = cables.filter(c => c.kind === 'Power').length;
  if (data !== lldp) fail(`${p}: ${data} data cables ≠ ${lldp} LLDP links`);
  const cords = db.datacenters.reduce((a: number, d: any) => a + (S.sitePhysical(d.id)?.cords.length ?? 0), 0);
  if (power !== cords) fail(`${p}: ${power} power cables ≠ ${cords} cords`);
  if (new Set(cables.map(c => c.id)).size !== cables.length) fail(`${p}: duplicate cable ids`);
  /* types: Σ type devices = devices */
  const T = S.dcimTypes();
  if (T.types.reduce((a, t) => a + t.devices, 0) !== devs.length) fail(`${p}: Σ type devices ≠ devices`);
  console.log(`${p.padEnd(10)} sites ${all.sites.length} · halls ${all.halls.length} · rows ${all.rows.length} · racks ${all.racks.length} · devices ${devs.length} · types ${T.types.length} · modules ${T.modules.length} · cables ${data}+${power} · panels ${all.panels.length} · feeds ${all.feeds.length} · ${ms} ms`);
}
console.log(bad ? `\n✗ ${bad} problem(s)` : '\n✓ DCIM reconciles');
process.exit(bad ? 1 : 0);
