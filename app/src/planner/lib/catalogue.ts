/**
 * Approved catalogue and price book — what the planner is allowed to specify.
 *
 * IT and network items map to device models in the DCIM catalogue (asset models with their
 * power, height and end-of-life date). Facility items (UPS, cooling, switchgear…) and services
 * map to the company that makes them and the company we buy them from. Each item kind has a
 * preferred model and alternatives; sourcing skips a model whose end-of-life is too close and
 * falls back. Prices are indicative list prices (vendor price book 2026); purchase orders carry
 * the contract.
 *
 * Vendor names here must match vendor records: a manufacturer is bought from itself, from its
 * authorised channel, or from a named reseller. Optics come from the switch vendor or an optics
 * maker; line systems from Ciena or Nokia; storage from Pure Storage and NetApp directly.
 *
 * `itQuantities` is the one quantity and price model for IT equipment: the estimate, the bill of
 * materials and sourcing all call it, so a GPU server has the same price everywhere.
 */
import type * as T from '../p2b/types';
import type { PlannerData } from './plannerData';

export type ItemKind =
  | 'gpu-server' | 'server' | 'storage' | 'leaf' | 'spine' | 'core' | 'firewall' | 'oob'
  | 'rack' | 'rack-pdu' | 'containment' | 'cage' | 'enclosure'
  | 'ups' | 'ups-small' | 'generator' | 'generator-small' | 'transformer' | 'switchgear' | 'pdu' | 'utility'
  | 'crah' | 'cdu' | 'inrow' | 'reardoor' | 'chiller' | 'cooling-small' | 'sfn' | 'floor'
  | 'optics' | 'fibre' | 'dac' | 'patch' | 'dci'
  | 'suppression' | 'vesda' | 'access' | 'bms'
  | 'fitout' | 'install' | 'move' | 'disposal'
  | 'hv-transformer' | 'dry-cooler' | 'fanwall';

export interface CatalogueOption {
  model: string; manufacturer: string; vendor: string; unitPrice: number;
  /** Device model in DCIM (stock can be matched). */ device?: boolean;
  /** Typical draw and height for IT models (the DCIM asset model wins when loaded). */ typicalW?: number; heightU?: number;
  /** Rating for plant items (UPS module kW, generator kVA, transformer kVA, cooling kW). */ ratingKw?: number; ratingKva?: number;
}
export interface CatalogueKind { kind: ItemKind; label: string; options: CatalogueOption[]; /** Equipment that can sit in stock as devices. */ stockable?: boolean; /** Can be covered by spare capacity at an existing site. */ siteCapacity?: 'positions' | 'ups' | 'cooling' | 'plant'; /** Not bought on a purchase order (grid agreements, utility works). */ agreement?: boolean }

const O = (model: string, manufacturer: string, vendor: string, unitPrice: number, extra: Partial<CatalogueOption> = {}): CatalogueOption => ({ model, manufacturer, vendor, unitPrice, ...extra });
const D = (model: string, manufacturer: string, vendor: string, unitPrice: number, typicalW: number, heightU: number): CatalogueOption => ({ model, manufacturer, vendor, unitPrice, device: true, typicalW, heightU });

export const CATALOGUE: Record<ItemKind, CatalogueKind> = {
  'gpu-server': { kind: 'gpu-server', label: 'GPU server', stockable: true, options: [D('PowerEdge XE9680', 'Dell', 'Dell Technologies', 310000, 9000, 6), D('DGX H100', 'NVIDIA', 'NVIDIA', 380000, 10200, 8), D('SYS-821GE GPU SuperServer', 'Supermicro', 'Supermicro', 290000, 10800, 8)] },
  server: { kind: 'server', label: 'Server', stockable: true, options: [D('PowerEdge R760', 'Dell', 'Dell Technologies', 14000, 800, 2), D('ProLiant DL380 Gen11', 'HPE', 'HPE', 13500, 750, 2)] },
  storage: { kind: 'storage', label: 'Storage array', stockable: true, options: [D('FlashArray //X70', 'Pure Storage', 'Pure Storage', 120000, 1100, 3), D('AFF A400', 'NetApp', 'NetApp', 110000, 1200, 4)] },
  leaf: { kind: 'leaf', label: 'Leaf switch', stockable: true, options: [D('7050X3-48YC8', 'Arista', 'Arista Networks', 38000, 450, 1), D('QFX5120-48Y', 'Juniper', 'Juniper Networks', 34000, 440, 1), D('Catalyst 9300-48P', 'Cisco', 'Cisco Systems', 9000, 350, 1)] },
  spine: { kind: 'spine', label: 'Spine switch', stockable: true, options: [D('Nexus 9336C-FX2', 'Cisco', 'Cisco Systems', 52000, 600, 1)] },
  core: { kind: 'core', label: 'Core router', stockable: true, options: [D('MX480', 'Juniper', 'Juniper Networks', 210000, 1800, 8), D('ASR 9006', 'Cisco', 'Cisco Systems', 240000, 2000, 10)] },
  firewall: { kind: 'firewall', label: 'Firewall', stockable: true, options: [D('PA-5450', 'Palo Alto', 'Palo Alto Networks', 280000, 1300, 3)] },
  oob: { kind: 'oob', label: 'Console server', stockable: true, options: [D('OM2248 Console Server', 'Opengear', 'Opengear', 4200, 60, 1)] },
  rack: { kind: 'rack', label: 'Rack', siteCapacity: 'positions', options: [O('NetShelter SX 48U', 'APC', 'Schneider Electric', 3800), O('VR3300 42U', 'Vertiv', 'Vertiv', 3200), O('TS IT 45U', 'Rittal', 'Schneider Electric', 3600)] },
  'rack-pdu': { kind: 'rack-pdu', label: 'Rack power strip', stockable: true, options: [O('Geist rPDU 3-phase', 'Vertiv', 'Vertiv', 1400, { device: true })] },
  containment: { kind: 'containment', label: 'Aisle containment', options: [O('SmartAisle containment', 'Vertiv', 'Vertiv', 18000)] },
  cage: { kind: 'cage', label: 'Cage', options: [O('Mesh partition with badge door', 'Schneider', 'Schneider Electric', 45000)] },
  enclosure: { kind: 'enclosure', label: 'Prefabricated enclosure', options: [O('EcoStruxure modular enclosure', 'Schneider', 'Schneider Electric', 85000)] },
  // UPS modules: the planner picks the module size for the site type; the price is per module.
  ups: { kind: 'ups', label: 'UPS module', siteCapacity: 'ups', options: [O('Eaton 9395XR 1250 kW', 'Eaton', 'Eaton', 360000, { ratingKw: 1250 }), O('Galaxy VX 1500 kW', 'Schneider', 'Schneider Electric', 430000, { ratingKw: 1500 }), O('Eaton 93PM 500 kW', 'Eaton', 'Eaton', 160000, { ratingKw: 500 }), O('Eaton 93PM 250 kW', 'Eaton', 'Eaton', 85000, { ratingKw: 250 }), O('Eaton 93PS 40 kW', 'Eaton', 'Eaton', 22000, { ratingKw: 40 })] },
  'ups-small': { kind: 'ups-small', label: 'Site UPS', options: [O('Eaton 9PX 22 kVA', 'Eaton', 'Eaton', 18000, { ratingKw: 20 })] },
  generator: { kind: 'generator', label: 'Generator', siteCapacity: 'plant', options: [O('Cat 3516C 3,000 kVA standby', 'Caterpillar', 'Caterpillar', 1100000, { ratingKva: 3000 }), O('Cat 3512C 2,000 kVA standby', 'Caterpillar', 'Caterpillar', 780000, { ratingKva: 2000 })] },
  'generator-small': { kind: 'generator-small', label: 'Site generator', options: [O('Cat DE110 110 kVA with ATS', 'Caterpillar', 'Caterpillar', 45000, { ratingKva: 110 })] },
  transformer: { kind: 'transformer', label: 'Transformer', siteCapacity: 'plant', options: [O('Trihal 2,500 kVA cast resin', 'Schneider', 'Schneider Electric', 120000, { ratingKva: 2500 }), O('Trihal 3,150 kVA cast resin', 'Schneider', 'Schneider Electric', 150000, { ratingKva: 3150 })] },
  // Grid transformers for an HV intake (66 kV and above): bought from a transformer maker under the substation EPC.
  'hv-transformer': { kind: 'hv-transformer', label: 'Grid transformer (HV substation)', options: [O('Power transformer 132/33 kV', 'Hitachi Energy', 'Hitachi Energy', 4500000)] },
  switchgear: { kind: 'switchgear', label: 'Switchgear', siteCapacity: 'plant', options: [O('Premset MV line-up', 'Schneider', 'Schneider Electric', 250000)] },
  pdu: { kind: 'pdu', label: 'Floor power distribution', siteCapacity: 'ups', options: [O('Liebert FPC', 'Vertiv', 'Vertiv', 28000)] },
  // A grid connection is an agreement with the network operator paid in milestones, not a purchase order.
  utility: { kind: 'utility', label: 'Grid connection', agreement: true, options: [O('Grid connection agreement', 'Network operator', 'Network operator', 150000)] },
  crah: { kind: 'crah', label: 'Air handler', siteCapacity: 'cooling', options: [O('Liebert PEX4', 'Vertiv', 'Vertiv', 85000, { ratingKw: 250 }), O('CyberAir 3PRO', 'Stulz', 'Stulz', 82000, { ratingKw: 250 })] },
  fanwall: { kind: 'fanwall', label: 'Fan wall', siteCapacity: 'cooling', options: [O('Liebert CW fan wall', 'Vertiv', 'Vertiv', 95000, { ratingKw: 400 })] },
  cdu: { kind: 'cdu', label: 'Coolant distribution unit', siteCapacity: 'cooling', options: [O('Liebert XDU1350', 'Vertiv', 'Vertiv', 350000, { ratingKw: 1350 })] },
  inrow: { kind: 'inrow', label: 'In-row cooler', siteCapacity: 'cooling', options: [O('Liebert CRV', 'Vertiv', 'Vertiv', 26000, { ratingKw: 60 }), O('CyberRow', 'Stulz', 'Stulz', 25000, { ratingKw: 60 })] },
  reardoor: { kind: 'reardoor', label: 'Rear-door cooler', siteCapacity: 'cooling', options: [O('Liebert DCD', 'Vertiv', 'Vertiv', 18000, { ratingKw: 50 })] },
  chiller: { kind: 'chiller', label: 'Chiller', siteCapacity: 'plant', options: [O('Liebert AFC 1500 kW', 'Vertiv', 'Vertiv', 620000, { ratingKw: 1500 }), O('CyberCool 2', 'Stulz', 'Stulz', 600000, { ratingKw: 1500 })] },
  'dry-cooler': { kind: 'dry-cooler', label: 'Dry or adiabatic cooler', siteCapacity: 'plant', options: [O('Liebert AFC dry cooler 1200 kW', 'Vertiv', 'Vertiv', 210000, { ratingKw: 1200 })] },
  'cooling-small': { kind: 'cooling-small', label: 'Site cooling', options: [O('Liebert DSE 40 kW', 'Vertiv', 'Vertiv', 38000, { ratingKw: 40 })] },
  sfn: { kind: 'sfn', label: 'Secondary fluid network', options: [O('Manifolds and leak detection', 'Vertiv', 'Vertiv', 6500)] },
  floor: { kind: 'floor', label: 'Floor reinforcement', options: [O('Structural works', 'NetBuild', 'NetBuild Corp', 4000)] },
  // Optics from the switch vendor (matched to the platform) or from an optics maker.
  optics: { kind: 'optics', label: 'Optics', options: [O('QDD-400G-DR4', 'Arista', 'Arista Networks', 1200), O('400G QSFP-DD DR4', 'Coherent', 'Coherent', 950)] },
  fibre: { kind: 'fibre', label: 'Fibre trunk', options: [O('MPO-24 trunk', 'Corning', 'Corning', 1500)] },
  dac: { kind: 'dac', label: 'Copper and DAC', options: [O('DAC and copper kit', 'Arista', 'Arista Networks', 800)] },
  patch: { kind: 'patch', label: 'Patching', options: [O('Patch cords and panels', 'Corning', 'Corning', 350)] },
  // Interconnect line systems from optical transport vendors.
  dci: { kind: 'dci', label: 'Interconnect line system', options: [O('WaveLogic 5 line system', 'Ciena', 'Ciena', 420000), O('1830 PSI-M line system', 'Nokia', 'Nokia', 400000)] },
  suppression: { kind: 'suppression', label: 'Fire suppression', options: [O('Clean agent system (installed)', 'CBRE', 'CBRE Data Center Solutions', 180000)] },
  vesda: { kind: 'vesda', label: 'Smoke detection', options: [O('Aspirating detection (installed)', 'CBRE', 'CBRE Data Center Solutions', 40000)] },
  access: { kind: 'access', label: 'Access control and CCTV', options: [O('Security system (installed)', 'CBRE', 'CBRE Data Center Solutions', 60000)] },
  bms: { kind: 'bms', label: 'Building management', options: [O('BMS and DCIM sensors', 'Schneider', 'Schneider Electric', 50000)] },
  fitout: { kind: 'fitout', label: 'Fit-out works', options: [O('White space fit-out', 'NetBuild', 'NetBuild Corp', 2500)] },
  install: { kind: 'install', label: 'Installation', options: [O('Installation services', 'NetBuild', 'NetBuild Corp', 0)] },
  move: { kind: 'move', label: 'Move services', options: [O('Move and re-rack services', 'NetBuild', 'NetBuild Corp', 0)] },
  disposal: { kind: 'disposal', label: 'Disposal', options: [O('Certified disposal', 'CBRE', 'CBRE Data Center Solutions', 0)] },
};

/** Every vendor name the catalogue buys from (the seed must hold a vendor record for each). */
export const CATALOGUE_VENDORS: string[] = [...new Set(Object.values(CATALOGUE).filter(k => !k.agreement).flatMap(k => k.options.map(o => o.vendor)))].sort();

/** Price of a model in the price book, if listed. */
export function priceOf(model: string): number | undefined {
  for (const k of Object.values(CATALOGUE)) { const o = k.options.find(x => x.model === model); if (o && o.unitPrice) return o.unitPrice; }
  return undefined;
}
/** The catalogue kind a device model belongs to. */
export function kindOfModel(model: string): ItemKind | undefined {
  for (const k of Object.values(CATALOGUE)) if (k.options.some(o => o.model === model)) return k.kind;
  return undefined;
}
/** The catalogue option for a model. */
export function optionOf(model: string | undefined): CatalogueOption | undefined {
  if (!model) return undefined;
  for (const k of Object.values(CATALOGUE)) { const o = k.options.find(x => x.model === model); if (o) return o; }
  return undefined;
}
/** UPS module closest to (and not below) a module rating; the largest when the rating is above every module. */
export function upsOptionFor(moduleKw: number): CatalogueOption {
  const opts = [...CATALOGUE.ups.options].sort((a, b) => (a.ratingKw ?? 0) - (b.ratingKw ?? 0));
  return opts.find(o => (o.ratingKw ?? 0) >= moduleKw) ?? opts[opts.length - 1];
}

/** Pick the first option whose model is not near end of life by the date it is needed, and whose vendor is active. */
export function chooseOption(kind: ItemKind, neededBy: string, models: T.AssetModel[], vendors: T.Vendor[], preferred?: string): { option: CatalogueOption; skipped: { model: string; reason: string }[] } {
  const k = CATALOGUE[kind]; const skipped: { model: string; reason: string }[] = [];
  // A model must stay supported for at least two years after it is needed.
  const horizon = new Date(neededBy).getTime() + 2 * 365 * 864e5;
  const ordered = preferred ? [...k.options].sort((a, b) => (a.model === preferred ? -1 : b.model === preferred ? 1 : 0)) : k.options;
  for (const o of ordered) {
    const m = models.find(x => x.model === o.model);
    if (m?.eolDate && new Date(m.eolDate).getTime() < horizon) { skipped.push({ model: o.model, reason: `end of life ${new Date(m.eolDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` }); continue; }
    const v = vendors.find(x => x.name === o.vendor);
    if (v && v.status !== 'Active') { skipped.push({ model: o.model, reason: `${o.vendor} is not an active vendor` }); continue; }
    return { option: o, skipped };
  }
  // Nothing passes: take the active-vendor option with the latest end of life.
  const eol = (o: CatalogueOption) => new Date(models.find(x => x.model === o.model)?.eolDate ?? '2100-01-01').getTime();
  const active = ordered.filter(o => vendors.find(x => x.name === o.vendor)?.status !== 'Inactive');
  return { option: [...(active.length ? active : ordered)].sort((a, b) => eol(b) - eol(a))[0], skipped };
}

/* ================================================================== stock */
const HOLD_STATES = ['Reserved', 'Committed'];
/**
 * A device is free stock when it is not racked, is Staged or Received, and nobody holds it:
 * no capacity reservation on it, no other plan's mark, no "Reserved for" note.
 */
export function isFreeStock(d: T.Device, data?: Pick<PlannerData, 'capacityReservations'>, excludePlanId?: string): boolean {
  if (d.rackId) return false;
  if (d.lifecycleState !== 'Staged' && d.lifecycleState !== 'Received') return false;
  if (d.plannerPlanId && d.plannerPlanId !== excludePlanId) return false;
  if (String(d.notes ?? '').startsWith('Reserved for') && !(excludePlanId && String(d.notes).includes(excludePlanId))) return false;
  if (data?.capacityReservations.some(h => h.resourceType === 'Asset' && h.resourceId === d.id && HOLD_STATES.includes(h.state) && h.plannerPlanId !== excludePlanId)) return false;
  return true;
}
/** Free stock units of a model: at the site first, then the central depot, then other sites. */
export function freeStock(data: Pick<PlannerData, 'devices' | 'capacityReservations'>, model: string, dataCenterId?: string, excludePlanId?: string): T.Device[] {
  const pool = data.devices.filter(d => d.model === model && isFreeStock(d, data, excludePlanId));
  return [...pool.filter(d => dataCenterId && d.dataCenterId === dataCenterId), ...pool.filter(d => !d.dataCenterId), ...pool.filter(d => d.dataCenterId && d.dataCenterId !== dataCenterId)];
}

/* ================================================================== IT quantities */
export type ItClassName = 'GPU' | 'Compute' | 'Storage' | 'General';
export interface ItClassInput { name: string; kw: number; racks: number }
export interface ItLine {
  className: string; kind: 'gpu-server' | 'server' | 'storage'; model: string; manufacturer: string; vendor: string;
  typicalW: number; heightU: number; rackKw: number; racks: number;
  /** Units per rack: rack kW ÷ the model's typical draw, capped by the usable rack units. */
  perRack: number; limitedBy: 'power' | 'space'; units: number; unitPrice: number; total: number;
  leadItem: string; skipped?: string; source: 'asset model' | 'catalogue';
}
export interface ItQuantities { lines: ItLine[]; units: number; total: number; usableU: number; neededBy: string; basis: string }

const CLASS_KIND: Record<string, ItLine['kind']> = { GPU: 'gpu-server', Compute: 'server', Storage: 'storage', General: 'server' };
/** Rack units left for servers after the top-of-rack switches, patching and power strips. */
export const RESERVED_U = 4;

/**
 * IT quantities and prices, one line per rack class. The model is the catalogue's preferred model
 * that is supported for two years after `neededBy` (asset models and vendor status from the
 * platform when loaded). Units per rack = floor(rack kW ÷ typical W), capped by the usable height.
 * `preferred` maps a kind to a model the planner chose (a refresh, a template).
 */
export function itQuantities(input: { classes: ItClassInput[]; neededBy: string; rackHeightU?: number; preferred?: Partial<Record<ItLine['kind'], string>> }, data?: Pick<PlannerData, 'assetModels' | 'vendors'>): ItQuantities {
  const usableU = Math.max(10, (input.rackHeightU ?? 42) - RESERVED_U);
  const lines: ItLine[] = [];
  for (const c of input.classes) {
    if (c.racks <= 0 || c.kw <= 0) continue;
    const kind = CLASS_KIND[c.name] ?? 'server';
    const pick = chooseOption(kind, input.neededBy, data?.assetModels ?? [], data?.vendors ?? [], input.preferred?.[kind]);
    const o = pick.option;
    const am = data?.assetModels.find(m => m.model === o.model);
    const typicalW = Math.max(100, am?.typicalPowerW || o.typicalW || 800);
    const heightU = Math.max(1, am?.heightU || o.heightU || 2);
    const byPower = Math.floor((c.kw * 1000) / typicalW);
    const bySpace = Math.floor(usableU / heightU);
    const perRack = Math.max(1, Math.min(byPower, bySpace));
    const units = perRack * c.racks;
    lines.push({
      className: c.name, kind, model: o.model, manufacturer: o.manufacturer, vendor: o.vendor, typicalW, heightU, rackKw: c.kw, racks: c.racks,
      perRack, limitedBy: byPower <= bySpace ? 'power' : 'space', units, unitPrice: o.unitPrice, total: units * o.unitPrice,
      leadItem: kind === 'gpu-server' ? 'GPU servers' : 'General servers', skipped: pick.skipped.length ? pick.skipped.map(s => `${s.model} (${s.reason})`).join(', ') : undefined,
      source: am ? 'asset model' : 'catalogue',
    });
  }
  const total = lines.reduce((a, l) => a + l.total, 0);
  return { lines, units: lines.reduce((a, l) => a + l.units, 0), total, usableU, neededBy: input.neededBy, basis: lines.map(l => `${l.className}: ${l.racks} racks × ${l.perRack} ${l.model} (${l.rackKw} kW ÷ ${l.typicalW} W${l.limitedBy === 'space' ? `, capped at ${usableU} U` : ''}) × ${l.unitPrice.toLocaleString('en-US')} USD`).join('; ') };
}
