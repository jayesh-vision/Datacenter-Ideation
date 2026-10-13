/**
 * Reference values the replace and migration families price and time their work with.
 * Each value is read from the plan's benchmark set when it is there (seeded by the family
 * seeds under the same metric), otherwise the default below with its stated source.
 */
import type * as T from '../p2b/types';
import type { ParamValue, Sourced } from './engine';

export interface Bench { value: number; source: string; seeded: boolean }
export const BENCH_DEFAULTS: Record<string, { value: number; label: string; unit: string; source: string; category: T.PlannerBenchmark['category'] }> = {
  // Labour (installation partner rate card)
  'labour:server-install': { value: 250, label: 'Install, cable and burn-in one new server', unit: 'USD/device', source: 'Installation partner rate card 2026', category: 'cost' },
  'labour:server-derack': { value: 90, label: 'De-rack and remove one old server', unit: 'USD/device', source: 'Installation partner rate card 2026', category: 'cost' },
  'labour:switch-cutover': { value: 300, label: 'Rack, cable and cut over one switch', unit: 'USD/device', source: 'Installation partner rate card 2026', category: 'cost' },
  'labour:config-translate': { value: 400, label: 'Translate and test one switch configuration', unit: 'USD/device', source: 'Network automation team estimate 2026', category: 'cost' },
  'labour:rerack': { value: 150, label: 'De-rack and re-rack one device', unit: 'USD/device', source: 'Installation partner rate card 2026', category: 'cost' },
  'labour:recable': { value: 25, label: 'Re-cable one port (data or power)', unit: 'USD/port', source: 'Installation partner rate card 2026', category: 'cost' },
  'labour:rack-swap': { value: 1200, label: 'Remove old rack, set new rack, bond and level', unit: 'USD/rack', source: 'Installation partner rate card 2026', category: 'cost' },
  'labour:containment-adjust': { value: 2500, label: 'Adjust aisle containment for a different rack', unit: 'USD/rack', source: 'Containment supplier quote 2026', category: 'cost' },
  'labour:xconnect-repatch': { value: 350, label: 'Carrier re-patch of one cross-connect', unit: 'USD/xconnect', source: 'Carrier and colo price list 2026', category: 'cost' },
  // Disposal (certified disposal vendor rate card)
  'disposal:device': { value: 45, label: 'Collect and recycle one device (no data)', unit: 'USD/device', source: 'CBRE disposal rate card 2026', category: 'cost' },
  'disposal:drive': { value: 18, label: 'Wipe to NIST 800-88 or shred one drive, certificate per serial', unit: 'USD/drive', source: 'CBRE disposal rate card 2026', category: 'cost' },
  'disposal:network-wipe': { value: 40, label: 'Erase configuration and keys on one network device', unit: 'USD/device', source: 'CBRE disposal rate card 2026', category: 'cost' },
  'disposal:rack': { value: 200, label: 'Remove and recycle one empty rack', unit: 'USD/rack', source: 'CBRE disposal rate card 2026', category: 'cost' },
  'disposal:custody': { value: 250, label: 'Chain of custody: sealed transport and witness per wave', unit: 'USD/wave', source: 'CBRE disposal rate card 2026', category: 'cost' },
  'drives:Server': { value: 4, label: 'Drives in a typical server', unit: 'drives', source: 'Fleet build standard', category: 'sizing' },
  'drives:GPU-Node': { value: 8, label: 'Drives in a GPU server', unit: 'drives', source: 'Fleet build standard', category: 'sizing' },
  'drives:Storage': { value: 24, label: 'Drives in a storage array', unit: 'drives', source: 'Fleet build standard', category: 'sizing' },
  // Resale
  'resale:Server': { value: 300, label: 'Resale credit, server of five years or more', unit: 'USD/device', source: 'IT asset disposition broker quotes 2026', category: 'cost' },
  'resale:Switch': { value: 120, label: 'Resale credit, end-of-life switch', unit: 'USD/device', source: 'IT asset disposition broker quotes 2026', category: 'cost' },
  'resale:Storage': { value: 1500, label: 'Resale credit, storage array', unit: 'USD/device', source: 'IT asset disposition broker quotes 2026', category: 'cost' },
  // Network
  'optic:SFP+': { value: 150, label: '10G SFP+ SR optic', unit: 'USD', source: 'Optics price book 2026', category: 'cost' },
  'optic:SFP28': { value: 250, label: '25G SFP28 SR optic', unit: 'USD', source: 'Optics price book 2026', category: 'cost' },
  'optic:QSFP+': { value: 350, label: '40G QSFP+ SR4 optic', unit: 'USD', source: 'Optics price book 2026', category: 'cost' },
  'optic:QSFP28': { value: 600, label: '100G QSFP28 SR4 optic', unit: 'USD', source: 'Optics price book 2026', category: 'cost' },
  'optic:QSFP-DD': { value: 1200, label: '400G QSFP-DD optic', unit: 'USD', source: 'Optics price book 2026', category: 'cost' },
  'dac:SFP28': { value: 90, label: '25G DAC, 3 m', unit: 'USD', source: 'Optics price book 2026', category: 'cost' },
  'dac:QSFP28': { value: 200, label: '100G DAC, 3 m', unit: 'USD', source: 'Optics price book 2026', category: 'cost' },
  'licence:switch': { value: 4500, label: 'Switch feature licence (routing, EVPN), perpetual', unit: 'USD/device', source: 'Arista and Juniper price books 2026', category: 'cost' },
  'supportPct:network': { value: 12, label: 'Vendor support per year as % of list price (network)', unit: '%/year', source: 'Vendor support price books 2026', category: 'cost' },
  'supportPct:server': { value: 8, label: 'Vendor support per year after warranty as % of list price (servers)', unit: '%/year', source: 'Vendor support price books 2026', category: 'cost' },
  'warrantyYears:new': { value: 3, label: 'Warranty included with new equipment', unit: 'years', source: 'Vendor standard terms', category: 'sizing' },
  // Racks
  'rackPdu:outletsC13': { value: 36, label: 'C13 outlets on one 3-phase rack power strip', unit: 'outlets', source: 'Geist rPDU 3-phase datasheet', category: 'sizing' },
  'rackPdu:outletsC19': { value: 6, label: 'C19 outlets on one 3-phase rack power strip', unit: 'outlets', source: 'Geist rPDU 3-phase datasheet', category: 'sizing' },
  'rackPdu:ratingKw': { value: 22, label: 'Rack power strip rating (415 V, 32 A, 3-phase)', unit: 'kW', source: 'Geist rPDU 3-phase datasheet', category: 'sizing' },
  // Timing
  'transferDays:site': { value: 2, label: 'Spare at the site to the rack', unit: 'days', source: 'Logistics actuals 2026', category: 'leadtime' },
  'transferDays:depot': { value: 5, label: 'Central depot to a site', unit: 'days', source: 'Logistics actuals 2026', category: 'leadtime' },
  'transferDays:transfer': { value: 10, label: 'Transfer between sites', unit: 'days', source: 'Logistics actuals 2026', category: 'leadtime' },
  'stagingDays': { value: 7, label: 'Stage, update firmware and burn in before the wave', unit: 'days', source: 'Build standard', category: 'leadtime' },
  // Migration
  'move:transportPerRackKm': { value: 6, label: 'Secure transport per rack-equivalent per km', unit: 'USD/rack-km', source: 'Logistics partner rate card 2026', category: 'cost' },
  'move:transportBase': { value: 1800, label: 'Secure transport, fixed per wave (vehicle, escort, insurance)', unit: 'USD/wave', source: 'Logistics partner rate card 2026', category: 'cost' },
  'move:replicationMonthly': { value: 900, label: 'Replication licence and bandwidth per service per month', unit: 'USD/service-month', source: 'Storage and DR team actuals 2026', category: 'cost' },
  'move:replatformPerService': { value: 12000, label: 'Re-platform one service (engineering)', unit: 'USD/service', source: 'Application team estimate 2026', category: 'cost' },
  'move:tempCircuitMonthly': { value: 1500, label: 'Temporary interconnect during swing, per month', unit: 'USD/month', source: 'Carrier price list 2026', category: 'cost' },
  'decom:upsBattery': { value: 3500, label: 'Remove and recycle one UPS battery string (hazardous waste)', unit: 'USD/UPS', source: 'Battery recycler quote 2026', category: 'cost' },
  'decom:refrigerant': { value: 2200, label: 'Recover refrigerant from one cooling unit (F-gas certified)', unit: 'USD/unit', source: 'F-gas contractor quote 2026', category: 'cost' },
  'decom:fireSystem': { value: 4000, label: 'Decommission the fire system and recover agent', unit: 'USD/site', source: 'Fire contractor quote 2026', category: 'cost' },
  'decom:utility': { value: 2500, label: 'Utility disconnection and final meter reading', unit: 'USD/feed', source: 'Utility tariff sheet 2026', category: 'cost' },
  'decom:makeGood': { value: 120, label: 'Make good and handback (dilapidations) per m²', unit: 'USD/m²', source: 'Landlord schedule of condition, typical', category: 'cost' },
  'downtime:liftShiftH': { value: 4, label: 'De-rack, transport and re-rack, excluding travel', unit: 'h', source: 'Migration runbook actuals', category: 'leadtime' },
  'downtime:swingH': { value: 0.5, label: 'Final sync and swing of a replicated service', unit: 'h', source: 'Migration runbook actuals', category: 'leadtime' },
  'downtime:replatformH': { value: 1, label: 'Cut-over of a re-platformed service (DNS and traffic)', unit: 'h', source: 'Migration runbook actuals', category: 'leadtime' },
  'staffCostFte': { value: 96000, label: 'Loaded cost per FTE', unit: 'USD/year', source: 'HR benchmark 2026', category: 'cost' },
};

/** A benchmark value: the plan's benchmark set first, then the default with its source. */
export function bench(benchmarks: T.PlannerBenchmark[] | undefined, metric: string): Bench {
  const b = benchmarks?.find(x => x.metric === metric);
  if (b && (b.value ?? b.high) !== undefined) return { value: Number(b.value ?? b.high), source: b.source, seeded: true };
  const d = BENCH_DEFAULTS[metric];
  return { value: d?.value ?? 0, source: d?.source ?? 'not set', seeded: false };
}
export const bv = (benchmarks: T.PlannerBenchmark[] | undefined, metric: string) => bench(benchmarks, metric).value;

/** Typed parameter readers over effective (sourced) parameters. */
export const pnum = (p: Record<string, Sourced<ParamValue>>, k: string, d = 0) => { const v = p[k]?.value; return typeof v === 'number' ? v : typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d; };
export const pstr = (p: Record<string, Sourced<ParamValue>>, k: string, d = '') => { const v = p[k]?.value; return v === undefined || v === '' ? d : String(v); };
export const pbool = (p: Record<string, Sourced<ParamValue>>, k: string, d = false) => { const v = p[k]?.value; return typeof v === 'boolean' ? v : d; };
