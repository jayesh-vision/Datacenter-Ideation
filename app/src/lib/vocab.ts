/* One status vocabulary for the whole product (blueprint §16): every state
   maps to exactly one chip tone and one colour, defined here only. */
import type { Tone } from './tone';
import type { ChangeStatus, Discovery, Health, IncidentStatus, LinkState, RolloutStatus, ServiceStatus, Severity } from '../api/types';

export const ROLLOUT: Record<RolloutStatus, { label: string; tone: Tone; color: string }> = {
  'on-air': { label: 'On-air', tone: 'success', color: 'var(--vw-color-emerald-500)' },
  'in-progress': { label: 'In progress', tone: 'warning', color: 'var(--vw-color-amber-500)' },
  planned: { label: 'Planned', tone: 'info', color: 'var(--primaryColor400)' },
  failed: { label: 'Failed', tone: 'error', color: 'var(--vw-color-red-500)' }
};
export const ROLLOUT_ORDER: RolloutStatus[] = ['on-air', 'in-progress', 'planned', 'failed'];

export const SEVERITY: Record<Severity, { label: string; tone: Tone; color: string; rank: number }> = {
  critical: { label: 'Critical', tone: 'error', color: 'var(--vw-color-red-500)', rank: 0 },
  major: { label: 'Major', tone: 'warning', color: 'var(--vw-color-amber-400)', rank: 1 },
  minor: { label: 'Minor', tone: 'orange', color: 'var(--vw-color-orange-500)', rank: 2 },
  warning: { label: 'Warning', tone: 'neutral', color: 'var(--vw-color-slate-300)', rank: 3 }
};
export const DISCOVERY: Record<Discovery, { label: string; tone: Tone; color: string }> = {
  verified: { label: 'Verified', tone: 'success', color: 'var(--vw-color-emerald-500)' },
  drifted: { label: 'Drifted', tone: 'warning', color: 'var(--vw-color-amber-400)' },
  'not-discovered': { label: 'Not discovered', tone: 'error', color: 'var(--vw-color-red-400)' }
};
export const ND_REASON: Record<string, string> = { planned: 'Planned — not installed', 'no-collector': 'No collector assigned', 'collector-unavailable': 'Collector unavailable', 'not-applicable': 'Not applicable (passive)' };
export const HEALTH: Record<Health, { label: string; tone: Tone; color: string }> = {
  healthy: { label: 'Healthy', tone: 'success', color: 'var(--vw-color-emerald-500)' },
  degraded: { label: 'Degraded', tone: 'warning', color: 'var(--vw-color-amber-500)' },
  critical: { label: 'Critical', tone: 'error', color: 'var(--vw-color-red-500)' },
  unknown: { label: 'Unknown', tone: 'neutral', color: 'var(--vw-color-slate-300)' }
};
/* topology / health-score bands */
export const scoreColor = (s: number) => (s >= 80 ? 'var(--vw-color-emerald-500)' : s >= 60 ? 'var(--vw-color-orange-500)' : 'var(--vw-color-red-500)');
export const LINK_STATE: Record<LinkState, { label: string; tone: Tone }> = {
  up: { label: 'Up', tone: 'success' }, down: { label: 'Down', tone: 'error' }, init: { label: 'Init', tone: 'warning' }, idle: { label: 'Idle', tone: 'warning' }, standby: { label: 'Standby', tone: 'info' }
};
export const SERVICE: Record<ServiceStatus, { label: string; tone: Tone }> = {
  Active: { label: 'Active', tone: 'success' }, Degraded: { label: 'Degraded', tone: 'warning' }, Down: { label: 'Down', tone: 'error' }, Disabled: { label: 'Disabled', tone: 'neutral' }
};
export const INCIDENT: Record<IncidentStatus, { tone: Tone }> = {
  Open: { tone: 'error' }, Investigating: { tone: 'warning' }, Mitigated: { tone: 'info' }, Resolved: { tone: 'success' }, Closed: { tone: 'neutral' }
};
/* Incident severity: stored as 1–4, shown as words (user, 07-Oct-2026). Alarms keep Critical / Major / Minor / Warning. */
export const SEV_LABEL: Record<number, string> = { 1: 'Critical', 2: 'High', 3: 'Medium', 4: 'Low' };
export const sevLabel = (n: number) => SEV_LABEL[n] ?? `Level ${n}`;
export const SEV_TONE: Record<number, 'error' | 'warning' | 'info' | 'neutral'> = { 1: 'error', 2: 'warning', 3: 'info', 4: 'neutral' };
/* the class of a solid incident-severity chip (vw-chip--*) */
export const sevChipCls = (n: number) => `vw-chip--${n === 1 ? 'error' : n === 2 ? 'warning' : n === 3 ? 'info' : 'neutral'}`;
export const CHANGE: Record<ChangeStatus, { tone: Tone }> = {
  Draft: { tone: 'neutral' }, 'Pending approval': { tone: 'warning' }, Approved: { tone: 'info' }, 'In progress': { tone: 'purple' }, Completed: { tone: 'success' }, 'Rolled back': { tone: 'orange' }, Rejected: { tone: 'error' }
};
/* utilisation colour: green < 75, amber < 85, red ≥ 85 (warning threshold) */
export const utilColor = (p: number) => (p >= 85 ? 'var(--vw-color-red-500)' : p >= 75 ? 'var(--vw-color-amber-500)' : 'var(--vw-color-emerald-500)');
export const REGION_TONE: Record<string, string> = { north: 'var(--vw-color-cyan-300)', east: 'var(--vw-color-purple-300)', west: 'var(--vw-color-orange-300)', south: 'var(--vw-color-teal-300)' };
