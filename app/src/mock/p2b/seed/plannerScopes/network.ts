/* Planner seed · network family (see src/modules/planner/lib/scopes/network.ts and lib/networkModel.ts).
   Inputs, rules and lead-time benchmarks for DCI / WAN and fabric uplifts, and the scope data of the
   seeded Ashburn–Frankfurt DCI plan (PLN-0009): Z end, the existing circuit it upgrades and two
   diverse paths from different carriers. */
import type * as T from '../../../../planner/p2b/types';
import type { Seed } from '../ctx';
import type { ScopeSeed } from './types';

const P = (key: string, label: string, aspect: T.PlannerAspect, type: T.PlannerParamDef['type'], extra: Partial<T.PlannerParamDef> = {}): T.PlannerParamDef => ({ key, label, aspect, type, ...extra });
const RULE = (id: string, aspect: T.PlannerAspect, severity: T.PlannerRuleSeverity, title: string, check: string, extra: Partial<T.PlannerRuleDef> = {}): T.PlannerRuleDef => ({ id, aspect, severity, title, check, ...extra });
/* Inputs the network panel shows for the chosen sub-type (kept off the generic input grid, which cannot tell DCI from fabric). */
const PANEL: T.PlannerAspect = 'it';

export const networkSeed: ScopeSeed = {
  params: {
    network: [
      P('networkKind', 'Kind of uplift', PANEL, 'select', { options: ['DCI / WAN between two sites', 'Fabric uplift inside one site'], default: 'DCI / WAN between two sites' }),
      P('diversePaths', 'Diverse paths (from the path list)', PANEL, 'number', { help: 'Set by the paths; not an input' }),
      P('demandYears', 'Size for demand at year', PANEL, 'number', { default: 3, min: 1, max: 10, help: 'Services and measured traffic grown to this year' }),
      P('demandOverrideReason', 'Why the capacity differs from the derived need', PANEL, 'text', { help: 'Needed when the capacity entered in Requirements differs from what services and measured traffic show' }),
      P('protection', 'Protection', PANEL, 'select', { options: ['1+1 (full demand on one path)', 'Protected share', 'Unprotected'], default: '1+1 (full demand on one path)' }),
      P('protectedSharePct', 'Protected share of the demand', PANEL, 'number', { unit: '%', default: 100, min: 0, max: 100, help: 'Traffic that must survive the loss of one path' }),
      P('latencyBudgetMs', 'Round-trip latency budget', PANEL, 'number', { unit: 'ms', default: 100, min: 1, max: 400 }),
      P('encryptionRequired', 'Encryption required on every path', PANEL, 'bool', { default: true, help: 'MACsec or optical encryption over third-party infrastructure' }),
      P('diversityWaiver', 'Diversity waiver', PANEL, 'text', { help: 'Only when two paths must share a carrier or a shared-risk group; who accepted it and why' }),
      P('dciP2pPool', 'Point-to-point addresses from', PANEL, 'select', { options: ['Alternate A and Z', 'A end', 'Z end'], default: 'Alternate A and Z' }),
      P('orgAsn', 'Our ASN', PANEL, 'number', { default: 64600, min: 1, max: 4294967295 }),
      P('crossConnectNrcUsd', 'Cross-connect one-off charge', PANEL, 'number', { unit: 'USD', default: 500, min: 0, max: 10000 }),
      P('crossConnectMrcUsd', 'Cross-connect monthly charge', PANEL, 'number', { unit: 'USD', default: 300, min: 0, max: 5000 }),
      P('earlyTerminationPct', 'Early termination charge', PANEL, 'number', { unit: '% of remaining charges', default: 100, min: 0, max: 100 }),
      P('ceaseSoakDays', 'Old circuits kept after cut-over', PANEL, 'number', { unit: 'days', default: 30, min: 0, max: 180 }),
      P('demarcSpanKm', 'Router to carrier demarc', PANEL, 'number', { unit: 'km', default: 0.5, min: 0.01, max: 10 }),
      P('cutoverWindowHours', 'Cut-over window', PANEL, 'number', { unit: 'h', default: 4, min: 1, max: 12 }),
      P('fabricTargetGbps', 'Target uplink speed', PANEL, 'select', { options: ['100', '400', '800'], default: '400', unit: 'Gbps' }),
      P('fabricUplinksPerLeaf', 'Uplinks per leaf after', PANEL, 'number', { default: 4, min: 2, max: 16 }),
      P('fabricTargetOversub', 'Target oversubscription', PANEL, 'number', { default: 3, min: 1, max: 8 }),
      P('costContingencyPct', 'Cost contingency', 'finance', 'number', { unit: '%', default: 10, min: 0, max: 40, help: 'On the one-off lines; carrier charges are contracted' }),
    ],
  },
  // Fabric sizing from racks, carriers as a count, tier and site-wide cost inputs do not describe a DCI or fabric uplift.
  exclude: { network: ['racksPerLeafPair', 'uplinksPerLeaf', 'uplinkGbps', 'oversubscription', 'carrierCount', 'operatorOwnedIt', 'refreshYears', 'tariffUsdPerKwh', 'tier', 'redundancy'] },
  rules: [
    { scopes: ['network'], rule: RULE('R-DCI-01', 'network', 'hard', 'Both ends set, with an end device on every path', 'dci-ends') },
    { scopes: ['network'], rule: RULE('R-DCI-02', 'network', 'hard', 'Survives the loss of one path: (paths − 1) × capacity covers the protected demand', 'dci-survivability', { standard: 'Organisation network standard' }) },
    { scopes: ['network'], rule: RULE('R-DCI-03', 'network', 'hard', 'No two paths share a carrier, route or shared-risk group', 'dci-diversity', { standard: 'Organisation network standard' }) },
    { scopes: ['network'], rule: RULE('R-DCI-04', 'network', 'hard', 'Round-trip latency within the budget on every path', 'dci-latency') },
    { scopes: ['network'], rule: RULE('R-DCI-05', 'network', 'hard', 'Free ports at the right speed at both ends (or a line card in the bill)', 'dci-ports') },
    { scopes: ['network'], rule: RULE('R-DCI-06', 'network', 'hard', 'Optics reach covers the span', 'dci-optics-reach') },
    { scopes: ['network'], rule: RULE('R-DCI-07', 'network', 'hard', 'Encryption on every path where required', 'dci-encryption', { standard: 'Information security policy' }) },
    { scopes: ['network'], rule: RULE('R-DCI-08', 'network', 'hard', 'Capacity meets the demand at the sizing year', 'dci-demand') },
    { scopes: ['network'], rule: RULE('R-DCI-09', 'finance', 'soft', 'Old circuits ceased without avoidable early-termination charges', 'dci-etc') },
    { scopes: ['network'], rule: RULE('R-FAB-01', 'network', 'hard', 'Fabric oversubscription at or below the target after the uplift', 'fabric-oversub') },
    { scopes: ['network'], rule: RULE('R-FAB-02', 'network', 'hard', 'Spine ports for every leaf uplink', 'fabric-spine-ports') },
  ],
  dropRules: { network: ['R-NET-01', 'R-NET-02', 'R-FIN-01', 'R-FIN-02', 'R-SCH-02', 'R-RES-01'] },
  // Resilience lives in the network step (protection and diversity); no IT step; a short commissioning (acceptance) section.
  aspects: { network: { it: 'skipped', resilience: 'skipped', commissioning: 'summary' } },
  approval: { network: ['Network architect', 'Security (encryption and diversity)', 'Finance (by amount)'] },
  outputs: { network: ['Path and diversity design', 'Bill of materials and carrier orders', 'IP and BGP plan', 'Cut-over and cease plan', 'Acceptance test plan', 'Schedule'] },
  benchmarks: [
    { metric: 'leadWeeks:Carrier wave (metro)', label: 'Carrier wavelength, metro', category: 'leadtime', unit: 'weeks', value: 10, low: 8, high: 13, source: 'Carrier delivery intervals 2025–26 (60–90 days)' },
    { metric: 'leadWeeks:Carrier wave (regional)', label: 'Carrier wavelength, regional', category: 'leadtime', unit: 'weeks', value: 13, low: 9, high: 17, source: 'Carrier delivery intervals 2025–26 (60–120 days)' },
    { metric: 'leadWeeks:Carrier wave (long-haul)', label: 'Carrier wavelength, long-haul terrestrial', category: 'leadtime', unit: 'weeks', value: 14, low: 10, high: 17, source: 'Carrier delivery intervals 2025–26' },
    { metric: 'leadWeeks:Carrier wave (subsea)', label: 'Carrier wavelength, subsea', category: 'leadtime', unit: 'weeks', value: 20, low: 14, high: 26, source: 'Carrier delivery intervals 2025–26 (transatlantic 100–180 days)' },
    { metric: 'leadWeeks:Dark fibre (IRU)', label: 'Dark fibre IRU, including splicing', category: 'leadtime', unit: 'weeks', value: 26, low: 16, high: 40, source: 'Dark fibre providers 2025–26' },
    { metric: 'leadWeeks:Cross-connect', label: 'Colocation cross-connect after LOA/CFA', category: 'leadtime', unit: 'weeks', value: 2, low: 1, high: 3, source: 'Colocation operators, standard install' },
    { metric: 'leadWeeks:Router line card', label: 'Router line card (400GE)', category: 'leadtime', unit: 'weeks', value: 12, low: 8, high: 16, source: 'Router vendors 2026' },
    { metric: 'leadWeeks:DWDM terminal', label: 'DWDM terminal and transponders', category: 'leadtime', unit: 'weeks', value: 16, low: 12, high: 20, source: 'Optical vendors 2026' },
    { metric: 'leadWeeks:Coherent optics (ZR)', label: '400G ZR / ZR+ coherent optics', category: 'leadtime', unit: 'weeks', value: 12, low: 8, high: 16, source: 'Optics vendors 2026' },
  ],
  enrich(S: Seed, plans: T.PlannerPlan[]) {
    // PLN-0009 · Ashburn DC-1 to Frankfurt COLO-1 (placed on two of our sites in one country): the existing DCI circuit is upgraded to
    // 400G and a second 400G path comes from a different carrier on a diverse terrestrial route; half of the 800G is protected.
    const p = plans.find(x => x.plnId === 'PLN-0009');
    const a = S.dataCenters.find(d => d.id === p?.dataCenterId); const z = S.siteByKey('FRA-COLO1');
    if (!p || !a || !z) return;
    p.peerDataCenterId = z.id;
    const routers = (dc: string) => S.devices.filter(d => d.dataCenterId === dc && d.category === 'Router' && d.lifecycleState !== 'Retired').sort((x, y) => (x.name ?? '').localeCompare(y.name ?? ''));
    const ra = routers(a.id), rz = routers(z.id);
    const prov = (name: string) => S.providers.find(x => x.name === name);
    // The DCI circuit at Ashburn to Frankfurt (far end recorded) or, failing that, Ashburn's DCI circuit with no far end recorded.
    const termsOf = (cid: string) => S.circuitTerminations.filter(t => t.circuitId === cid);
    const dci = S.circuits.filter(c => c.purpose === 'DC Interconnect' && c.status !== 'Decommissioned' && termsOf(c.id).some(t => t.dataCenterId === a.id));
    const existing = dci.find(c => termsOf(c.id).some(t => t.dataCenterId === z.id)) ?? dci.find(c => termsOf(c.id).every(t => t.dataCenterId === a.id || !t.dataCenterId));
    const p1 = (existing ? S.providers.find(x => x.id === existing.providerId) : undefined) ?? prov('Lumen') ?? S.providers[0];
    const p2 = [prov('Telia Carrier'), prov('Zayo'), ...S.providers].find(x => x && x.id !== p1?.id); // a different carrier, always
    // Our estate is one country, so the DCI is domestic: two leased long-haul waves on diverse terrestrial routes (no subsea system);
    // each route passes through the POP cities of our other sites on its side of the A–Z line, so the two share no city.
    const cutover = S.daysAhead(240);
    p.targetGoLive = cutover;
    p.phases = [{ id: 'P1', name: 'Paths live and cut over', goLive: cutover, itKw: 0, racks: 0, halls: 0, status: 'Approved' }];
    const group = `${a.code}·${z.code}·DCI`;
    const pos = (d: T.DataCenter) => { const c = S.campuses.find(x => x.id === d.campusId); return { lat: d.latitude ?? c?.latitude ?? 0, lng: d.longitude ?? c?.longitude ?? 0, city: c?.city ?? d.name }; };
    const A = pos(a), Z = pos(z);
    const km = (u: { lat: number; lng: number }, v: { lat: number; lng: number }) => { const R = 6371, r = Math.PI / 180, dLat = (v.lat - u.lat) * r, dLng = (v.lng - u.lng) * r; const h = Math.sin(dLat / 2) ** 2 + Math.cos(u.lat * r) * Math.cos(v.lat * r) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
    const gc = km(A, Z);
    // POP cities: other sites' cities between the ends (projection 0.15–0.85 along A→Z), split by the side of the line they sit on
    const dx = Z.lng - A.lng, dy = Z.lat - A.lat, L2 = dx * dx + dy * dy || 1;
    const pops = [...new Map(S.dataCenters.filter(d => d.id !== a.id && d.id !== z.id).map(pos).filter(q => q.city !== A.city && q.city !== Z.city).map(q => [q.city, q])).values()]
      .map(q => ({ ...q, t: ((q.lng - A.lng) * dx + (q.lat - A.lat) * dy) / L2, side: Math.sign(dx * (q.lat - A.lat) - dy * (q.lng - A.lng)) }))
      .map(q => ({ ...q, off: Math.abs(dx * (q.lat - A.lat) - dy * (q.lng - A.lng)) / Math.sqrt(L2) }))
      .filter(q => q.t > 0.15 && q.t < 0.85 && q.off <= Math.sqrt(L2) * 0.35).sort((u, v) => u.t - v.t); // near the corridor, not a detour
    const eastWest = Math.abs(dx) >= Math.abs(dy);
    const sideName = (sd: number) => (eastWest ? ((sd > 0) === (dx > 0) ? 'northern' : 'southern') : ((sd > 0) === (dy > 0) ? 'western' : 'eastern'));
    const route = (sd: number, k: number) => {
      const via = pops.filter(q => q.side === sd).slice(0, 3);
      const legs = [A, ...via, Z]; let len = 0; for (let i = 1; i < legs.length; i++) len += km(legs[i - 1], legs[i]);
      const distanceKm = Math.round(Math.max(len, gc) * 1.12); // fibre follows roads and rail: 12% over the POP-to-POP line
      return { name: sideName(sd), via: via.map(q => q.city), distanceKm, latencyMs: Math.round((2 * distanceKm * 0.005 + 0.6) * 10) / 10, k };
    };
    const r1 = route(1, 1), r2 = route(-1, 2);
    const us = S.geo === 'us';
    const wave = (r: typeof r1) => ({
      routeId: `LH-${r.name.replace(/ern$/, '').toUpperCase()}-0${r.k}`,
      sharedRiskGroups: [`Route: ${r.name} long-haul${r.via.length ? ` via ${r.via.join(', ')}` : ''}`, ...r.via.map(c => `POP: ${c}`)],
      linkType: 'Leased wavelength' as const, capacityGbps: 400, distanceKm: r.distanceKm, latencyMs: r.latencyMs,
      routeNotes: `Carrier KMZ received; terrestrial long-haul on the ${r.name} route${r.via.length ? ` through ${r.via.join(', ')}` : ''}, no shared conduit or POP with the other path`,
    });
    p.paths = [
      { id: 'PATH-1', name: 'Path 1', providerId: p1?.id, providerName: p1?.name ?? 'Lumen', diversityGroup: group, ...wave(r1), aDeviceId: ra[0]?.id, zDeviceId: rz[0]?.id, monthlyUsd: us ? 21000 : 9500, installUsd: us ? 10000 : 4000, termMonths: 36, replacesCircuitId: existing?.id, encryption: 'MACsec' },
      { id: 'PATH-2', name: 'Path 2', providerId: p2?.id, providerName: p2?.name ?? 'Telia Carrier', diversityGroup: group, ...wave(r2), aDeviceId: (ra[1] ?? ra[0])?.id, zDeviceId: (rz[1] ?? rz[0])?.id, monthlyUsd: us ? 19500 : 8800, installUsd: us ? 8000 : 3500, termMonths: 36, encryption: 'MACsec' },
    ];
    p.intent = `Upgrade the DCI between ${a.name} and ${z.name} to 2 × 400G: the existing circuit renewed at 400G and a second carrier on a diverse long-haul route.`;
    p.risks = p.risks.map(r => (/Third path shares a duct/.test(r.title) ? { ...r, title: 'Path 2 shares a duct with path 1 for 2 km near the A end', mitigation: 'Carrier to prove diversity with KMZ route files before acceptance; re-route the tail if it does not.' } : r));
    p.conditions = p.conditions?.map(c => ({ ...c, text: c.text.replace('the third path is diverse from path A', 'path 2 is diverse from path 1') }));
    const budget = Math.max(20, Math.ceil((Math.max(r1.latencyMs, r2.latencyMs) * 1.25) / 5) * 5);
    p.dispositions = existing ? [{ recordType: 'circuit', recordId: existing.id, label: existing.cid, disposition: 'renew', notes: 'Upgraded from 40G to 400G with the same carrier (Path 1)' }] : [];
    p.params = { ...p.params, networkKind: 'DCI / WAN between two sites', dciGbpsRequired: 800, demandOverrideReason: 'EU private-cloud replication and backup moving to Frankfurt in 2027 (capacity review, September 2026)', demandYears: 3, protection: 'Protected share', protectedSharePct: 50, latencyBudgetMs: budget, encryptionRequired: true, dciP2pPool: 'Alternate A and Z', orgAsn: 64600, costContingencyPct: 10, ceaseSoakDays: 30, diversePaths: 2 };
    // The approved baseline records the same cut-over and scope.
    if (p.baseline) p.baseline = { ...p.baseline, targetGoLive: p.targetGoLive, phases: p.phases.map(ph => ({ ...ph })), params: { ...p.params } };
    p.paramSources = { ...p.paramSources, networkKind: 'user', dciGbpsRequired: 'user', demandOverrideReason: 'user', demandYears: 'template', protection: 'user', protectedSharePct: 'user', latencyBudgetMs: 'user', encryptionRequired: 'template', dciP2pPool: 'template', orgAsn: 'document', costContingencyPct: 'template', ceaseSoakDays: 'template', diversePaths: 'user' };
  },
};
