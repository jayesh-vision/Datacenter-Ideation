/* Shared DCIM bits: status chips, the site picker, meters and the colour of a rack by the chosen floor-plan measure. */
import type { DcimRack, DcimStatus, NeCategory } from '../../api/types';
import { Chip } from '../../ui/kit';
import type { Tone } from '../../lib/tone';

export const STATUS_TONE: Record<DcimStatus, Tone> = { Active: 'success', Planned: 'info', Reserved: 'purple', Maintenance: 'warning', Decommissioning: 'error', 'Tenant-owned': 'neutral' };
export const DcimStatusChip = ({ s }: { s: DcimStatus }) => <Chip tone={STATUS_TONE[s]} dot>{s}</Chip>;

/* category colours for device blocks in elevations and type lists (NST palette, calm) */
export const CAT_COLOR: Record<NeCategory, string> = {
  network: 'var(--vw-color-blue-300)', compute: 'var(--vw-color-indigo-300)', storage: 'var(--vw-color-cyan-300)', tenant: 'var(--vw-color-slate-300)'
};
export const CAT_LABEL: Record<NeCategory, string> = { network: 'Network', compute: 'Compute', storage: 'Storage', tenant: 'Tenant' };

export const BAD = 'var(--vw-color-red-500)', WARN = 'var(--vw-color-amber-500)', ACCENT = 'var(--primaryColor500)';
export const loadColor = (p: number) => (p >= 90 ? BAD : p >= 80 ? WARN : ACCENT);

export type PlanMeasure = 'power' | 'space' | 'temp' | 'density' | 'tenant' | 'status';
/* a rack's fill for the floor plan: power % of budget, U used %, inlet temperature or status */
export function rackFill(r: DcimRack, m: PlanMeasure): { color: string; label: string } {
  if (m === 'power') return { color: r.powerPct >= 90 ? 'var(--vw-color-red-200)' : r.powerPct >= 80 ? 'var(--vw-color-amber-200)' : r.powerPct >= 50 ? 'var(--vw-color-blue-200)' : 'var(--vw-color-blue-50)', label: `${r.powerPct}%` };
  if (m === 'space') { const p = Math.round((r.usedU / r.heightU) * 100); return { color: p >= 90 ? 'var(--vw-color-amber-200)' : p >= 50 ? 'var(--vw-color-blue-200)' : 'var(--vw-color-blue-50)', label: `${r.usedU}/${r.heightU}U` }; }
  if (m === 'temp') return { color: r.tempC > 27 ? 'var(--vw-color-red-200)' : r.tempC > 25 ? 'var(--vw-color-amber-200)' : 'var(--vw-color-green-100)', label: r.tempC ? `${r.tempC}°C` : '—' };
  if (m === 'density') return { color: r.density === 'AI' ? 'var(--vw-color-purple-200, #e9d5ff)' : r.density === 'High' ? 'var(--vw-color-blue-200)' : 'var(--vw-color-slate-100)', label: `${r.budgetKw} kW${r.liquid ? ' · liq' : ''}` };
  if (m === 'tenant') {
    if (r.owner !== 'tenant') return { color: 'var(--vw-color-slate-50)', label: 'Operator' };
    const c = r.contractedKw ?? r.budgetKw, p = c ? Math.round((r.drawKw / c) * 100) : 0;
    return { color: p > 100 ? 'var(--vw-color-red-200)' : p >= 90 ? 'var(--vw-color-amber-200)' : 'var(--vw-color-cyan-100, #cffafe)', label: `${r.drawKw}/${c} kW` };
  }
  return { color: r.status === 'Planned' ? 'var(--vw-color-blue-50)' : r.power !== 'A + B' ? 'var(--vw-color-red-200)' : r.status === 'Tenant-owned' ? 'var(--vw-color-gray-100)' : 'var(--vw-color-green-100)', label: r.power !== 'A + B' ? r.power : r.status };
}

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
