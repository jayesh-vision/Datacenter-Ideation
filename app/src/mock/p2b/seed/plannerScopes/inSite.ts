/* Planner seed · in-site family: rack, pod, hall, retrofit (see src/modules/planner/lib/scopes/inSite.ts).

   - Inputs each type really needs (placement mode, feed configuration, pod layout, hall mode,
     liquid capture, CDU type…) and the site-level inputs these types do not ask (the site's
     plant, tier, staffing, carriers and property are already paid for).
   - Rules R-INS-01… that check the real chain; the site-plant rules they replace are dropped.
   - Unit prices and sizing figures for the bill (`unitCost:*`, `sizing:*`), each with a source.
   - enrich(): the seeded rack, pod, hall and retrofit plans are sized against their real sites.
     A plan that cannot fit its site keeps the site, goes back to Draft and says why. */
import type * as T from '../../../../planner/p2b/types';
import { dcTypeProfile } from '../../../../planner/p2b/dcTypes';
import type { Seed } from '../ctx';
import type { BenchmarkSeed, ScopeSeed } from './types';

const P = (key: string, label: string, aspect: T.PlannerAspect, type: T.PlannerParamDef['type'], extra: Partial<T.PlannerParamDef> = {}): T.PlannerParamDef => ({ key, label, aspect, type, ...extra });
const R = (id: string, aspect: T.PlannerAspect, severity: T.PlannerRuleSeverity, title: string, check: string, extra: Partial<T.PlannerRuleDef> = {}): T.PlannerRuleDef => ({ id, aspect, severity, title, check, ...extra });
const FEEDS = ['Dual 3-phase 16 A', 'Dual 3-phase 32 A', 'Dual 3-phase 63 A', 'Dual single-phase 32 A', 'Single 3-phase 32 A'];
const feedType = P('feedType', 'Rack feeds', 'power', 'select', { options: FEEDS, default: 'Dual 3-phase 32 A', help: 'Feeds per rack; each side must carry the whole rack. 3-phase 415 V at 80% breaker derating: 16 A ≈ 9 kW, 32 A ≈ 18 kW, 63 A ≈ 36 kW' });
const contingency = (d: number) => P('costContingencyPct', 'Cost contingency', 'finance', 'number', { unit: '% of works', default: d, min: 0, max: 40, help: 'Added to the bill of materials (catalogue IT excluded) to give the budget' });

/** Site-level inputs the in-site types do not ask: the site's own plant, tier, staff, carriers and property. */
const SITE_LEVEL = ['feedVoltage', 'upsRuntimeMin', 'generatorFuelHours', 'redundancy', 'coolingRedundancy', 'tier', 'hallDesignKw', 'capexPerKw', 'itCapexPerRack', 'staffPerMw', 'sparesPct', 'carrierCount', 'leaseUsdPerM2Year', 'floorLoadingKgPerRack', 'securityZones', 'refreshYears', 'pueTarget', 'hallsPerFloor', 'floorsPerBuilding', 'supportSpaceRatio'];

const RULES: { rule: T.PlannerRuleDef; scopes: T.PlannerScope[] }[] = [
  { rule: R('R-INS-01', 'space', 'hard', 'Contiguous free rack units on the chosen rack', 'ins-u-block', { standard: 'DCIM U map (devices and rack reservations)' }), scopes: ['rack'] },
  { rule: R('R-INS-02', 'power', 'hard', 'Rack power within the rack and A/B feed rating (block at 90%)', 'ins-rack-power', { threshold: 90, standard: 'Capacity policy: warn at 85%, block at 90%' }), scopes: ['rack'] },
  { rule: R('R-INS-03', 'power', 'hard', 'Feeding PDUs have headroom and free outlets or circuits', 'ins-pdu', { standard: 'Organisation design standard' }), scopes: ['rack', 'pod', 'hall'] },
  { rule: R('R-INS-04', 'cooling', 'hard', 'Cooling zone has headroom for the added heat with one unit lost', 'ins-zone-cooling', { standard: 'Organisation design standard (N+1 per zone)' }), scopes: ['rack', 'pod', 'hall', 'retrofit'] },
  { rule: R('R-INS-05', 'space', 'hard', 'Rack and floor weight within their ratings', 'ins-weight', { standard: 'Rack rating and floor loading (kg/m²)' }), scopes: ['rack', 'retrofit'] },
  { rule: R('R-INS-06', 'network', 'hard', 'Free leaf ports of the right speed on the nearest leaf pair', 'ins-ports'), scopes: ['rack'] },
  { rule: R('R-INS-07', 'network', 'hard', 'Addresses from the site\'s IPAM without overlap or overfill', 'ins-ip', { threshold: 80, standard: 'IPAM policy: subnets not above 80%' }), scopes: ['rack', 'pod', 'hall'] },
  { rule: R('R-INS-08', 'power', 'hard', 'Site power chain has headroom (UPS at redundancy, utility, transformers, holds and approved plans)', 'ins-site-power', { standard: 'Site baseline' }), scopes: ['rack', 'pod', 'hall', 'retrofit'] },
  { rule: R('R-INS-09', 'space', 'hard', 'Free contiguous positions for the racks', 'ins-positions'), scopes: ['pod', 'hall'] },
  { rule: R('R-INS-10', 'space', 'hard', 'Within the hall\'s design load', 'ins-hall-design'), scopes: ['hall'] },
  { rule: R('R-INS-11', 'cooling', 'hard', 'Facility water (chillers, dry coolers) for water-cooled units', 'ins-facility-water'), scopes: ['pod', 'hall', 'retrofit'] },
  { rule: R('R-INS-12', 'power', 'hard', 'GPU racks on AC or HVDC power, not a −48 V DC plant', 'ins-dc-plant'), scopes: ['rack', 'pod', 'hall', 'retrofit'] },
  { rule: R('R-INS-13', 'cooling', 'hard', 'CDU capacity with one unit lost per loop, with floor positions', 'ins-cdu'), scopes: ['retrofit'] },
  { rule: R('R-INS-14', 'power', 'hard', 'Per-rack power uprate: feeds, breakers and PDU headroom', 'ins-uprate'), scopes: ['retrofit'] },
  { rule: R('R-INS-15', 'migration', 'hard', 'Every wave has a window with no clashing change, swing space and a rollback', 'ins-waves'), scopes: ['retrofit'] },
  { rule: R('R-INS-16', 'cooling', 'soft', 'Zone setpoint suits every rack that shares the zone', 'ins-setpoint', { threshold: 27, standard: 'ASHRAE thermal guidelines (recommended envelope)' }), scopes: ['hall', 'retrofit'] },
  { rule: R('R-INS-17', 'schedule', 'hard', 'Change window free of clashing changes, before go-live', 'ins-window'), scopes: ['rack'] },
  { rule: R('R-INS-18', 'space', 'soft', 'Containment matches the row', 'ins-containment'), scopes: ['pod', 'hall'] },
  { rule: R('R-INS-19', 'network', 'hard', 'Free spine ports for the new leaves', 'ins-spine-ports'), scopes: ['pod', 'hall'] },
];
const DROPPED = ['R-PWR-01', 'R-PWR-02', 'R-PWR-03', 'R-PWR-04', 'R-COOL-01', 'R-SPC-01', 'R-SPC-02', 'R-NET-01', 'R-RES-01', 'R-OPS-01', 'R-SCH-02'];

const SRC_PRICE = 'Vendor price book 2026 (indicative)';
const SRC_WORKS = 'Facility works contracts 2025, rates per unit (indicative)';
const COST: [string, string, number, string, string][] = [
  ['install-device', 'Install one device: rack, stack, cable, label, test', 150, 'USD/device', SRC_WORKS], ['install-cabinet', 'Install one cabinet: position, level, bond, blank', 900, 'USD/cabinet', SRC_WORKS],
  ['feed-circuit', 'New rack circuit from a floor PDU: breaker, cable, termination, test', 1800, 'USD/circuit', SRC_WORKS], ['rpdu-63a', 'Rack power strip 63 A three-phase, metered', 2100, 'USD/each', SRC_PRICE],
  ['busway-m', 'Overhead busway', 650, 'USD/m', SRC_PRICE], ['busway-tapoff', 'Busway tap-off box', 1200, 'USD/each', SRC_PRICE],
  ['cage-m', 'Mesh cage partition', 450, 'USD/m', SRC_PRICE], ['cage-door', 'Cage door with lock', 6500, 'USD/each', SRC_PRICE], ['badge-reader', 'Badge reader on the site access system', 3200, 'USD/each', SRC_PRICE], ['cctv-camera', 'CCTV camera on the site system', 1800, 'USD/each', SRC_PRICE],
  ['cdu-inrow', 'In-row coolant distribution unit, 600 kW', 140000, 'USD/each', SRC_PRICE], ['cdu-inrack', 'In-rack coolant distribution unit, 100 kW', 28000, 'USD/each', SRC_PRICE],
  ['liquid-cabinet', 'Liquid-ready cabinet rated 1,800 kg', 6800, 'USD/each', SRC_PRICE], ['hose-kit', 'Hoses and quick disconnects for a liquid-ready rack', 1500, 'USD/rack', SRC_PRICE],
  ['pipework-m', 'Facility-water pipework, insulated, installed', 380, 'USD/m', SRC_WORKS], ['valve', 'Isolation valve, installed', 650, 'USD/each', SRC_WORKS], ['water-tapoff', 'Tap-off from the facility-water main', 1100, 'USD/each', SRC_WORKS],
  ['water-treatment', 'Water treatment and filtration skid', 45000, 'USD/each', SRC_PRICE], ['flush-fill-test', 'Flush, fill, pressure hold and water-quality test per loop', 18000, 'USD/loop', SRC_WORKS],
  ['leak-detection-row', 'Leak detection cable per row', 3500, 'USD/row', SRC_PRICE], ['drip-tray', 'Drip tray under a rack manifold', 450, 'USD/each', SRC_PRICE],
  ['bms-point', 'BMS points for one CDU (alarms, flow, pressure, leak)', 2500, 'USD/CDU', SRC_WORKS], ['bms-integration', 'BMS integration and graphics', 15000, 'USD/lot', SRC_WORKS],
  ['spreader-plate', 'Spreader plates under one rack position', 1800, 'USD/position', SRC_WORKS],
  ['leaf-400g', 'Leaf switch, 48 × 100G down, 400G uplinks', 85000, 'USD/each', SRC_PRICE], ['spine-400g', 'Spine switch, 64 × 400G', 95000, 'USD/each', SRC_PRICE], ['backend-switch', 'GPU back-end switch, 64 × 400G', 120000, 'USD/each', SRC_PRICE],
  ['optic-100g', '100G QSFP28 transceiver', 300, 'USD/each', SRC_PRICE], ['optic-800g', '800G OSFP transceiver', 2500, 'USD/each', SRC_PRICE],
  ['hall-enclosure-m2', 'Hall enclosure and fire-rated separation on an existing floor', 900, 'USD/m²', SRC_WORKS],
  ['electrical-install-kw', 'Hall electrical installation (busway, cabling, earthing, test)', 250, 'USD/kW', SRC_WORKS], ['mechanical-install-kw', 'Chilled-water pipework and controls to new units', 200, 'USD/kW', SRC_WORKS],
  ['atp-rack', 'Acceptance test of one rack (level 4)', 600, 'USD/rack', SRC_WORKS], ['cx-kw', 'Commissioning levels 1 to 5 for a hall', 35, 'USD/kW', SRC_WORKS], ['liquid-cx-loop', 'Level 5 integrated test of one liquid loop', 25000, 'USD/loop', SRC_WORKS],
  ['move-device', 'Move one device (de-rack, transport inside the site, re-rack)', 120, 'USD/move', SRC_WORKS],
];
const SIZING: [string, string, number, string, string][] = [
  ['floor-pdu-kw', 'Floor PDU size used for new distribution', 150, 'kW', 'Organisation design standard'], ['inrow-kw', 'In-row cooler capacity', 50, 'kW', 'Stulz CyberRow data sheet'],
  ['crah-kw', 'CRAH capacity for new hall units', 120, 'kW', 'Vertiv Liebert PEX4 data sheet'], ['cdu-inrow-kw', 'In-row CDU capacity', 600, 'kW', 'Vendor data sheets'], ['cdu-inrack-kw', 'In-rack CDU capacity', 100, 'kW', 'Vendor data sheets'],
  ['cdu-facility-kw', 'Facility CDU capacity (Liebert XDU1350)', 1350, 'kW', 'Vertiv Liebert XDU1350 data sheet'], ['liquid-cabinet-kg', 'Static rating of a liquid-ready cabinet', 1800, 'kg', 'Vendor data sheets'], ['pipe-run-m', 'Pipe run from a loop to the facility-water main', 40, 'm', 'Organisation design standard'],
];
const BENCHMARKS: BenchmarkSeed[] = [
  ...COST.map(([k, label, value, unit, source]) => ({ metric: `unitCost:${k}`, label, category: 'cost' as const, unit, value, source })),
  ...SIZING.map(([k, label, value, unit, source]) => ({ metric: `sizing:${k}`, label, category: 'sizing' as const, unit, value, source })),
  { metric: 'liquidThresholdKw', label: 'Above this rack density, liquid cooling', category: 'sizing', unit: 'kW/rack', value: 30, source: 'Organisation design standard' },
];

export const inSiteSeed: ScopeSeed = {
  params: {
    rack: [
      P('rackCount', 'Racks needed', 'space', 'number', { default: 1, min: 1, max: 4 }),
      P('placementMode', 'What the plan places', 'space', 'select', { options: ['Into existing racks', 'New cabinet in an empty position'], default: 'Into existing racks', help: 'Devices into racks that are already live, or a new cabinet in an empty position' }),
      feedType,
      P('portSpeedGbps', 'Port speed', 'network', 'select', { options: ['1', '10', '25', '100'], default: '25', unit: 'Gbps', help: 'Speed of the leaf ports to reserve' }),
      P('portsPerRack', 'Network ports per rack', 'network', 'number', { default: 4, min: 1, max: 96, help: 'Taken from the equipment list unless you set it' }),
      contingency(5),
    ],
    pod: [
      P('podLayout', 'Layout', 'space', 'select', { options: ['Auto', 'One row', 'Facing pair'], default: 'Auto', help: 'One row, or two facing rows around one contained aisle' }),
      P('podPower', 'Power distribution', 'power', 'select', { options: ['Existing PDUs', 'New floor PDUs', 'Busway'], default: 'Existing PDUs', help: 'From the site UPS through existing or new floor PDUs, or overhead busway; no UPS is added by a pod' }),
      feedType,
      P('cageDoors', 'Cage doors', 'security', 'number', { default: 1, min: 1, max: 4 }),
      P('cageReaders', 'Badge readers', 'security', 'number', { default: 2, min: 0, max: 8 }),
      P('cageCameras', 'Cameras', 'security', 'number', { default: 2, min: 0, max: 8 }),
      contingency(10),
    ],
    hall: [
      P('hallMode', 'Hall today', 'space', 'select', { options: ['Shell hall (full fit-out)', 'Partly used hall (fill free positions)', 'New hall on a floor'], help: 'Shell: built and empty. Partly used: live racks stay as they are and only free positions are planned. New hall: on a floor with free usable area' }),
      P('liquidCapturePct', 'Heat captured to liquid (liquid classes)', 'cooling', 'number', { unit: '%', default: 75, min: 50, max: 100, help: 'Direct-to-chip captures about 70 to 80%; the rest goes to room air' }),
      contingency(12),
    ],
    retrofit: [
      P('liquidCapturePct', 'Heat captured to liquid', 'cooling', 'number', { unit: '%', default: 75, min: 50, max: 100, help: 'Direct-to-chip captures about 70 to 80%; the rest goes to room air and must fit the zone' }),
      P('cduType', 'CDU type', 'cooling', 'select', { options: ['In-rack', 'In-row', 'Facility'], default: 'In-row', help: 'In-rack: one per rack, no floor space. In-row: per row loop, N+1, takes floor positions. Facility: in a gallery, N+1 per loop' }),
      P('liquidRacks', 'Racks moving to liquid cooling', 'cooling', 'number', { default: 0, min: 0, max: 400, help: 'Set from the racks selected on the Space step' }),
      contingency(15),
    ],
  },
  exclude: {
    rack: [...SITE_LEVEL, 'coolingType', 'inletSetpointC', 'renewableSharePct', 'maintenancePctCapex'],
    pod: [...SITE_LEVEL],
    hall: [...SITE_LEVEL],
    retrofit: [...SITE_LEVEL, 'racksPerLeafPair', 'uplinksPerLeaf', 'oversubscription', 'uplinkGbps', 'suppressionType'],
  },
  rules: RULES,
  dropRules: { rack: DROPPED, pod: DROPPED, hall: DROPPED, retrofit: DROPPED },
  aspects: { rack: { security: 'skipped' }, hall: { operations: 'skipped', resilience: 'skipped', sustainability: 'summary' }, pod: { commissioning: 'summary' }, retrofit: { fire: 'summary' } },
  approval: { rack: ['Capacity planner'], pod: ['Capacity planner', 'Facility manager'], hall: ['Design authority', 'Facility manager', 'Finance (by amount)'], retrofit: ['Design authority', 'Facility manager', 'Finance (by amount)'] },
  outputs: {
    rack: ['Placement note', 'Rack elevation', 'Outlet schedule', 'Port and patch schedule', 'IP list', 'Change request'],
    pod: ['Pod layout on the hall grid', 'Feed schedule', 'Bill of materials and budget', 'Network and IP plan', 'Changes for live cut-ins', 'Acceptance test per rack'],
    hall: ['Basis of design', 'Hall layout', 'Electrical and cooling design', 'Bill of materials and budget', 'Network and IP plan', 'Commissioning plan', 'Schedule by phase'],
    retrofit: ['Basis of design', 'Retrofit rack list', 'Liquid cooling design', 'Power uprate schedule', 'Wave plan with changes', 'Bill of materials and budget', 'Commissioning plan (level 5)'],
  },
  benchmarks: BENCHMARKS,
  enrich(S, plans) { enrichInSite(S, plans); },
};

/* ================================================================== enrich: size the demo plans to their sites */
const ACTIVE: T.CapacityReservation['state'][] = ['Reserved', 'Committed'];
function addedKw(p: T.PlannerPlan): number {
  const n = (k: string) => Number(p.params[k] ?? 0) || 0;
  switch (p.scope) {
    case 'server-refresh': case 'network-refresh': return Math.max(0, p.designPowerKw - n('affectedKw'));
    case 'retrofit': return n('addedKw') || Math.max(0, p.designPowerKw - n('currentKw'));
    case 'rack-replace': case 'migration': case 'plant': case 'network': return 0;
    default: return p.designPowerKw;
  }
}
function usableAt(red: string, caps: { kw: number; side?: string }[]): number {
  const live = caps.filter(c => c.kw > 0); if (!live.length) return 0;
  const sum = live.reduce((s, c) => s + c.kw, 0); const largest = Math.max(...live.map(c => c.kw));
  if (red.startsWith('2N')) { const a = live.filter(c => /A/.test(c.side ?? '')), b = live.filter(c => /B/.test(c.side ?? '')); return a.length && b.length ? Math.min(a.reduce((s, c) => s + c.kw, 0), b.reduce((s, c) => s + c.kw, 0)) : sum / 2; }
  return red === 'N+1' ? (live.length > 1 ? sum - largest : 0) : sum;
}
/** The same reading of the site as the planner's site baseline (lib/site.ts), from the seed collections. */
function siteFit(S: Seed, dcId: string, selfId: string) {
  const dc = S.dataCenters.find(d => d.id === dcId); if (!dc) return undefined;
  const pue = dcTypeProfile(dc.dcTypeKey)?.pueTarget ?? 1.4;
  const racks = S.racks.filter(r => r.dataCenterId === dcId);
  const ups = S.upsUnits.filter(u => u.dataCenterId === dcId && u.status !== 'Failed');
  const it = Math.max(racks.reduce((s, r) => s + (r.currentPowerKw || 0), 0), ups.reduce((s, u) => s + (u.loadKw || 0), 0));
  const feeds = S.utilityFeeds.filter(f => f.dataCenterId === dcId);
  const xf = S.transformers.filter(t => feeds.some(f => f.id === t.feedId) && t.status !== 'Failed');
  const gens = S.generators.filter(g => g.dataCenterId === dcId && g.status !== 'Failed');
  const pdus = S.pdus.filter(p => ups.some(u => u.id === p.upsId) || S.halls.find(h => h.id === p.hallId)?.dataCenterId === dcId);
  const ids = new Set([...pdus.map(p => p.id), ...ups.map(u => u.id), ...racks.map(r => r.id)]);
  const held = S.capacityReservations.filter(h => ACTIVE.includes(h.state) && h.status !== 'Released' && h.plannerPlanId !== selfId && h.resourceType === 'PowerChain' && h.unit === 'kW' && (h.dataCenterId === dcId || ids.has(h.resourceId))).reduce((s, h) => s + h.quantity, 0);
  const pipeline = S.plannerPlans.filter(p => p.id !== selfId && p.dataCenterId === dcId && (p.status === 'Approved' || p.status === 'Executing') && !p.artefacts?.reservationIds?.length).reduce((s, p) => s + addedKw(p), 0);
  const committed = it + held + pipeline;
  const side = (feedId?: string) => feeds.find(f => f.id === feedId)?.redundancyRole;
  const stages: number[] = [dc.designPowerKw];
  if (feeds.length) { const a = feeds.filter(f => f.redundancyRole === 'A-side'), b = feeds.filter(f => f.redundancyRole === 'B-side'); stages.push((a.length && b.length ? Math.min(a.reduce((s, f) => s + f.capacityKw, 0), b.reduce((s, f) => s + f.capacityKw, 0)) : feeds.reduce((s, f) => s + f.capacityKw, 0)) / pue); }
  if (xf.length) { const caps = xf.map(t => ({ kw: Math.round(t.capacityKva * 0.95), side: side(t.feedId) })); const two = caps.some(c => /A/.test(c.side ?? '')) && caps.some(c => /B/.test(c.side ?? '')); stages.push(usableAt(caps.length > 1 ? (two ? '2N' : 'N+1') : 'N', caps) / pue); }
  if (ups.length) { const m = new Map<string, number>(); ups.forEach(u => m.set(u.redundancy, (m.get(u.redundancy) ?? 0) + 1)); const red = [...m.entries()].sort((x, y) => y[1] - x[1])[0][0]; stages.push(usableAt(red, ups.map(u => ({ kw: u.capacityKw, side: side(u.feedId) })))); }
  if (gens.length) stages.push(usableAt(gens.length > 1 ? 'N+1' : 'N', gens.map(g => ({ kw: g.capacityKw }))) / pue);
  const headroom = Math.max(0, Math.min(...stages) - committed);
  const zone = (zid?: string) => { const z = S.coolingZones.find(x => x.id === zid); if (!z) return undefined; const units = S.cracUnits.filter(u => u.coolingZoneId === z.id && u.status !== 'Failed'); const inst = units.length ? units.reduce((s, u) => s + u.capacityKw, 0) : z.coolingCapacityKw; const usable = Math.min(Math.min(z.coolingCapacityKw || inst, inst), units.length > 1 ? inst - Math.max(...units.map(u => u.capacityKw)) : inst); const cool = S.capacityReservations.filter(h => ACTIVE.includes(h.state) && h.resourceType === 'Cooling' && h.resourceId === z.id && h.plannerPlanId !== selfId).reduce((s, h) => s + h.quantity, 0); return usable - z.currentLoadKw - cool; };
  return { dc, pue, headroom: Math.round(headroom * 10) / 10, zone };
}
/** Free grid cells of a hall (no rack, or an empty planned cabinet), row by row. */
function freeCells(S: Seed, hall: T.Hall) {
  const racks = S.racks.filter(r => r.hallId === hall.id);
  const cols = Math.max(hall.gridCols, ...racks.map(r => r.gridX + 1)), rowsN = Math.max(hall.gridRows, ...racks.map(r => r.gridY + 1));
  const held = new Set(S.capacityReservations.filter(h => h.resourceType === 'Rack' && ACTIVE.includes(h.state)).map(h => h.resourceId));
  const out: { x: number; y: number; rackId?: string; rowId?: string }[] = [];
  for (let y = 0; y < rowsN; y++) for (let x = 0; x < cols; x++) {
    const r = racks.find(k => k.gridX === x && k.gridY === y);
    if (!r) out.push({ x, y, rowId: S.rows.find(rw => rw.hallId === hall.id && racks.some(k => k.rowId === rw.id && k.gridY === y))?.id });
    else if ((r.status === 'Planned' || r.status === 'Reserved') && !r.currentPowerKw && !held.has(r.id)) out.push({ x, y, rackId: r.id, rowId: r.rowId });
  }
  return out;
}
const clean = (S: Seed, p: T.PlannerPlan, keep: string[]) => {
  const tpl = S.plannerTemplates.find(t => t.id === p.templateId);
  const allowed = new Set([...(tpl?.params ?? []).map(d => d.key), ...keep]);
  for (const k of Object.keys(p.params)) if (!allowed.has(k)) { delete p.params[k]; delete p.paramSources[k]; }
};
function demote(S: Seed, p: T.PlannerPlan, reason: string) {
  p.status = 'Draft'; p.approvals = []; p.approvalHistory = []; p.programId = undefined; p.processInstanceId = undefined; p.artefacts = undefined; p.baseline = undefined; p.wizardStep = Math.min(p.wizardStep || 3, 3);
  p.risks = [...p.risks, { id: `R${p.risks.length + 1}`, title: 'The site cannot take this plan today', domain: 'Facility', probability: 'High', impact: 'High', owner: p.ownerName, mitigation: reason, source: 'actual', evidence: 'Site baseline from the platform records at seed time' }];
  void S;
}

function enrichInSite(S: Seed, plans: T.PlannerPlan[]) {
  const by = (id: string) => plans.find(p => p.plnId === id);
  // ── PLN-0004 · rack: an 8 kW tenant cabinet, equipment from the DCIM catalogue ──
  const rack = by('PLN-0004');
  if (rack) {
    const am = (model: string) => S.assetModels.find(m => m.model === model);
    const eq: T.PlannerEquipmentLine[] = [['PowerEdge R760', 5], ['FlashArray //X70', 1], ['7050X3-48YC8', 2]].map(([m, q]) => ({ assetModelId: am(String(m))?.id ?? '', qty: Number(q) })).filter(l => l.assetModelId);
    const maxKw = eq.reduce((s, l) => { const m = S.assetModels.find(x => x.id === l.assetModelId)!; return s + Math.max(m.maxPowerW, m.typicalPowerW) * l.qty; }, 0) / 1000;
    rack.inSite = { equipment: eq };
    Object.assign(rack.params, { rackCount: 1, placementMode: 'New cabinet in an empty position', feedType: 'Dual 3-phase 32 A', portSpeedGbps: '25', portsPerRack: 4, densityKwPerRack: Math.round(maxKw * 10) / 10, operatorOwnedIt: false, costContingencyPct: 5, commissioningLevel: '3' });
    rack.designPowerKw = Math.round(maxKw * 10) / 10;
    rack.phases = rack.phases.map(ph => ({ ...ph, itKw: rack.designPowerKw, racks: 1, halls: 0 }));
    clean(S, rack, []);
  }
  // ── PLN-0005 · pod: in-row cooled pod; positions from the real grid or back to Draft ──
  const pod = by('PLN-0005');
  if (pod?.dataCenterId) {
    clean(S, pod, []);
    Object.assign(pod.params, { podLayout: 'Auto', podPower: 'Existing PDUs', feedType: 'Dual 3-phase 32 A', uplinkGbps: '100', cageDoors: 1, cageReaders: 2, cageCameras: 2, costContingencyPct: 10 });
    const n = Number(pod.params.rackCount ?? 24) || 24; const kwEach = Number(pod.params.densityKwPerRack ?? 10) || 10;
    const inRowUnits = Math.ceil((n * kwEach * 1.1) / 50) + 1; const need = n + Math.ceil(inRowUnits / 2);
    const fit = siteFit(S, pod.dataCenterId, pod.id);
    let placed: T.PlannerPlacement['positions'] | undefined;
    for (const hall of S.halls.filter(h => h.dataCenterId === pod.dataCenterId)) {
      const cells = freeCells(S, hall); const ys = [...new Set(cells.map(c => c.y))];
      for (const y of ys) { const row = cells.filter(c => c.y === y).sort((a, b) => a.x - b.x); for (let i = 0; i + need <= row.length; i++) { const run = row.slice(i, i + need); if (run[run.length - 1].x - run[0].x === need - 1) { placed = run.map(c => ({ hallId: hall.id, gridX: c.x, gridY: c.y, rackId: c.rackId, rowId: c.rowId })); break; } } if (placed) break; }
      if (placed) break;
    }
    const kw = n * kwEach;
    if (fit && placed && fit.headroom >= kw) pod.placement = { mode: 'empty-positions', hallId: placed[0].hallId, racks: [], positions: placed, acceptedAt: S.daysAgo(10) };
    else if (pod.status === 'Approved' || pod.status === 'Executing') demote(S, pod, `${fit?.dc.name ?? 'The site'} has ${fit?.headroom ?? 0} kW of IT headroom and ${placed ? 'room' : 'no contiguous run of positions'} for ${n} racks at ${kwEach} kW (${kw} kW). Raise a linked plant or expansion plan, or move the pod to a site with room.`);
  }
  // ── PLN-0002 · hall: a partly used hall, so only its free positions are planned ──
  const hall = by('PLN-0002');
  if (hall?.dataCenterId) {
    clean(S, hall, ['targetHallId', 'hallMode']);
    const halls = S.halls.filter(h => h.dataCenterId === hall.dataCenterId);
    const density = Number(hall.params.densityKwPerRack ?? 12) || 12;
    const fit = siteFit(S, hall.dataCenterId, hall.id);
    // The hall named in the plan (Hall 3) if it exists, else the hall with the most free positions.
    const named = halls.find(h => /hall 3/i.test(h.name)) ?? [...halls].sort((a, b) => freeCells(S, b).length - freeCells(S, a).length)[0];
    if (named) {
      const live = S.racks.filter(r => r.hallId === named.id && r.status !== 'Retired' && !(r.status === 'Planned' && !r.currentPowerKw)).length;
      const free = freeCells(S, named).length;
      const left = named.designPowerKw - S.racks.filter(r => r.hallId === named.id).reduce((s, r) => s + (r.currentPowerKw || 0), 0);
      const racks = Math.max(1, Math.min(free, Math.floor(left / density)));
      const kw = racks * density;
      hall.params.targetHallId = named.id; hall.paramSources.targetHallId = 'user';
      hall.params.hallMode = live ? 'Partly used hall (fill free positions)' : 'Shell hall (full fit-out)'; hall.paramSources.hallMode = 'user';
      Object.assign(hall.params, { costContingencyPct: 12, liquidCapturePct: 75, coolingType: 'chilled-water', uplinkGbps: '100' });
      hall.designPowerKw = kw;
      const p1 = Math.ceil(racks / 2) * density;
      hall.phases = hall.phases.length >= 2 && racks >= 2 ? [{ ...hall.phases[0], name: 'Free positions, first rows', itKw: p1, racks: Math.ceil(racks / 2), halls: 1 }, { ...hall.phases[1], name: 'Free positions, remaining rows', itKw: kw - p1, racks: racks - Math.ceil(racks / 2), halls: 1 }] : [{ ...(hall.phases[0] ?? { id: 'P1', goLive: hall.targetGoLive, status: 'Planned' }), name: 'Free positions', itKw: kw, racks, halls: 1 } as T.PlannerPhase];
      const zoneFree = fit?.zone(named.coolingZoneId) ?? 0;
      const fits = !!fit && fit.headroom >= kw;
      if (!fits && (hall.status === 'Approved' || hall.status === 'Executing')) demote(S, hall, `${named.name} has ${free} free positions and ${Math.round(left)} kW of design left, so the plan is sized to ${racks} racks (${kw} kW). ${fit?.dc.name ?? 'The site'} has only ${fit?.headroom ?? 0} kW of IT headroom${zoneFree < kw ? ` and ${Math.round(zoneFree * 10) / 10} kW of cooling headroom in the zone` : ''}: a linked plant plan must add capacity first.`);
    }
  }
  // ── PLN-0008 · retrofit: rows C and D of the first hall, converted to 40 kW liquid racks ──
  const ret = by('PLN-0008');
  if (ret?.dataCenterId) {
    clean(S, ret, ['targetHallId', 'addedKw', 'currentKw']);
    const hallR = S.halls.filter(h => h.dataCenterId === ret.dataCenterId).sort((a, b) => a.name.localeCompare(b.name))[0];
    if (hallR) {
      const rowsR = S.rows.filter(rw => rw.hallId === hallR.id).sort((a, b) => a.name.localeCompare(b.name)).slice(2, 4);
      const target = Number(ret.params.densityKwPerRack ?? 40) || 40;
      const sel = S.racks.filter(r => rowsR.some(rw => rw.id === r.rowId) && r.status !== 'Retired' && r.status !== 'Planned').map(r => ({ rackId: r.id, targetKw: target }));
      const today = sel.reduce((s, x) => s + (S.racks.find(r => r.id === x.rackId)?.currentPowerKw ?? 0), 0);
      ret.inSite = { retrofit: sel };
      ret.params.targetHallId = hallR.id; ret.paramSources.targetHallId = 'user';
      Object.assign(ret.params, { liquidCapturePct: 75, cduType: 'In-row', liquidRacks: sel.length, inletSetpointC: 24, coolingType: 'liquid-to-chip', commissioningLevel: '5', costContingencyPct: 15, currentKw: Math.round(today * 10) / 10, addedKw: Math.round((sel.length * target - today) * 10) / 10 });
      ret.designPowerKw = sel.length * target;
      ret.phases = [{ ...(ret.phases[0] ?? { id: 'P1', goLive: ret.targetGoLive, status: 'Planned', halls: 1 }), name: `${rowsR.map(rw => rw.name).join(' and ')}`, itKw: ret.designPowerKw, racks: sel.length, halls: 1 } as T.PlannerPhase];
      ret.intent = `Convert ${sel.length} racks in ${rowsR.map(rw => rw.name).join(' and ')} of ${hallR.name} to ${target} kW liquid-cooled GPU racks with in-row CDUs, without disturbing the telco core.`;
      ret.risks = ret.risks.filter(r => !/Floor loading 1,100/.test(r.title));
    }
  }
}
