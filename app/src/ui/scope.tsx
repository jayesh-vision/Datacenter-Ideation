import type { Alert, AlertScope } from '../api/types';

/* Operational scope of an alarm relative to a datacenter (see AlertScope). */
export const SCOPE_ORDER: AlertScope[] = ['site', 'edge', 'dependency', 'downstream'];
export const SCOPE: Record<AlertScope, { label: string; chip: string; hint: string }> = {
  site: { label: 'Site', chip: 'vw-chip--neutral', hint: 'Inside the datacenter: facility, racked devices, internal links' },
  edge: { label: 'Edge', chip: 'vw-chip--info', hint: 'A link leaving the datacenter (backhaul, uplink) — counts for both ends' },
  dependency: { label: 'Dependency', chip: 'vw-chip--purple', hint: 'Outside the site but the datacenter depends on it: far-end node, shared services, monitoring' },
  downstream: { label: 'Downstream', chip: 'vw-chip--neutral', hint: 'Remote node that depends on the datacenter — not a datacenter issue' }
};
export function ScopeChip({ a }: { a: Pick<Alert, 'scope' | 'hops' | 'symptomOf'> }) {
  const s = SCOPE[a.scope];
  const extra = a.scope === 'downstream' ? (a.symptomOf ? ` · symptom` : a.hops ? ` · ${a.hops} hop${a.hops > 1 ? 's' : ''}` : '') : '';
  return <span style={{ alignSelf: 'flex-start' }} className={`vw-chip ${s.chip} scope-chip${a.scope === 'downstream' ? ' is-muted' : ''}`} title={a.symptomOf ? `${s.hint}. Symptom of ${a.symptomOf}` : s.hint}>{s.label}{extra}</span>;
}
