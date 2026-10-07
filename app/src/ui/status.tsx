import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ChangeStatus, Discovery, Health, IncidentStatus, LinkState, RolloutStatus, ServiceStatus, Severity } from '../api/types';
import { CHANGE, DISCOVERY, HEALTH, INCIDENT, LINK_STATE, ROLLOUT, SERVICE, SEVERITY, SEV_TONE, sevLabel, utilColor } from '../lib/vocab';
import { Chip } from './kit';

type Sz = 'sm' | 'xs';
export const RolloutChip = ({ s, size = 'sm' }: { s: RolloutStatus; size?: Sz }) => <Chip tone={ROLLOUT[s].tone} size={size} dot>{ROLLOUT[s].label}</Chip>;
export const SeverityChip = ({ s, size = 'sm' }: { s: Severity; size?: Sz }) => <Chip tone={SEVERITY[s].tone} size={size}>{SEVERITY[s].label}</Chip>;
export const DiscoveryChip = ({ s, size = 'sm' }: { s: Discovery; size?: Sz }) => <Chip tone={DISCOVERY[s].tone} size={size} dot>{DISCOVERY[s].label}</Chip>;
export const HealthChip = ({ s, size = 'sm', children }: { s: Health; size?: Sz; children?: ReactNode }) => <Chip tone={HEALTH[s].tone} size={size} dot>{children ?? HEALTH[s].label}</Chip>;
export const LinkStateChip = ({ s, size = 'xs' }: { s: LinkState; size?: Sz }) => <Chip tone={LINK_STATE[s].tone} size={size} dot>{LINK_STATE[s].label}</Chip>;
export const ServiceChip = ({ s, size = 'sm' }: { s: ServiceStatus; size?: Sz }) => <Chip tone={SERVICE[s].tone} size={size} dot>{SERVICE[s].label}</Chip>;
export const IncidentChip = ({ s, size = 'sm' }: { s: IncidentStatus; size?: Sz }) => <Chip tone={INCIDENT[s].tone} size={size} dot>{s}</Chip>;
export const SevChip = ({ n, size = 'sm' }: { n: number; size?: Sz }) => <Chip tone={SEV_TONE[n]} size={size}>{sevLabel(n)}</Chip>;
export const PriChip = ({ n, size = 'sm' }: { n: number; size?: Sz }) => <Chip tone={SEV_TONE[n]} size={size}>P{n}</Chip>;
export const ChangeChip = ({ s, size = 'sm' }: { s: ChangeStatus; size?: Sz }) => <Chip tone={CHANGE[s].tone} size={size} dot>{s}</Chip>;
export const SevDot = ({ s }: { s: Severity }) => <i className="sev-dot" style={{ background: SEVERITY[s].color }} title={SEVERITY[s].label} />;

/* utilisation meter: bar + % in a fixed-width row, coloured by threshold */
export function Meter({ pct, width = 72, color, label, warnAt }: { pct: number; width?: number; color?: string; label?: ReactNode; warnAt?: number }) {
  const c = color ?? (warnAt ? (pct >= warnAt ? 'var(--vw-color-amber-500)' : 'var(--vw-color-emerald-500)') : utilColor(pct));
  return (
    <span className="meter">
      <span className="bar" style={{ width, height: 6 }}><i style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: c }} /></span>
      <span className="num meter-v" style={{ color: !color && !warnAt && pct >= 85 ? 'var(--vw-color-red-600)' : undefined }}>{label ?? `${Math.round(pct)}%`}</span>
    </span>
  );
}

/* stacked status bar used by region / circle roll-ups */
export function StackBar({ parts, height = 8 }: { parts: { value: number; color: string; label?: string }[]; height?: number }) {
  const t = parts.reduce((a, p) => a + p.value, 0) || 1;
  return <span className="stackbar" style={{ height }}>{parts.filter(p => p.value > 0).map((p, i) => <i key={i} title={p.label ? `${p.label}: ${p.value}` : undefined} style={{ width: `${(p.value / t) * 100}%`, background: p.color }} />)}</span>;
}

export const Legend = ({ items }: { items: { label: ReactNode; color: string }[] }) => (
  <span className="mini-legend">{items.map((it, i) => <span key={i}><i style={{ background: it.color }} />{it.label}</span>)}</span>
);

/* entity links: every id on screen is clickable to its record */
export const NeLink = ({ id, tab, children }: { id: string; tab?: string; children?: ReactNode }) => <Link className="ent-link mono" to={`/ne/${encodeURIComponent(id)}${tab ? `?tab=${tab}` : ''}`} onClick={e => e.stopPropagation()}>{children ?? id}</Link>;
export const DcLink = ({ id, tab, children }: { id: string; tab?: string; children?: ReactNode }) => <Link className="ent-link mono" to={`/datacenters/${id}${tab ? `?tab=${tab}` : ''}`} onClick={e => e.stopPropagation()}>{children ?? id}</Link>;
export const SvcLink = ({ id, children }: { id: string; children?: ReactNode }) => <Link className="ent-link mono" to={`/services/${id}`} onClick={e => e.stopPropagation()}>{children ?? id}</Link>;
export const CustLink = ({ id, children }: { id: string; children: ReactNode }) => <Link className="ent-link" to={`/customers/${id}`} onClick={e => e.stopPropagation()}>{children}</Link>;
export const IncLink = ({ id, children }: { id: string; children?: ReactNode }) => <Link className="ent-link mono" to={`/incidents/${id}`} onClick={e => e.stopPropagation()}>{children ?? id}</Link>;

/* "Last 24 hours · updated 1 min ago" — data freshness is always visible (NFR) */
export const Fresh = ({ children }: { children: ReactNode }) => <span className="fresh"><i className="live-dot" />{children}</span>;
