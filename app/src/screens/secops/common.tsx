/* Security Ops — shared vocabulary and small parts (chips, technique tags, the case lifecycle tracker). */
import * as I from 'lucide-react';
import type { SecDetState, SecDomain, SecPhase, SecSev, SecSsvc } from '../../api/types';
import { Chip } from '../../ui/kit';
import type { Tone } from '../../lib/tone';

export const SEVS: SecSev[] = ['Critical', 'High', 'Medium', 'Low'];
export const SEV_TONE: Record<SecSev, Tone> = { Critical: 'error', High: 'orange', Medium: 'warning', Low: 'neutral' };
export const STATE_TONE: Record<SecDetState, Tone> = { New: 'info', Investigating: 'purple', Escalated: 'orange', Closed: 'neutral' };
export const SSVC_TONE: Record<SecSsvc, Tone> = { Act: 'error', Attend: 'orange', 'Track*': 'warning', Track: 'neutral' };
/* ATT&CK tactic columns in matrix order (the techniques in scope are in the view) */
export const TACTICS = {
  Enterprise: ['Initial Access', 'Execution', 'Persistence', 'Privilege Escalation', 'Defense Evasion', 'Credential Access', 'Discovery', 'Lateral Movement', 'Collection', 'Command and Control', 'Exfiltration', 'Impact'],
  ICS: ['Initial Access', 'Execution', 'Persistence', 'Discovery', 'Lateral Movement', 'Collection', 'Inhibit Response Function', 'Impair Process Control', 'Impact']
};
export const PHASES: SecPhase[] = ['Detection & analysis', 'Containment', 'Eradication', 'Recovery', 'Post-incident', 'Closed'];
export const DOMAINS: SecDomain[] = ['Network', 'Management', 'Compute', 'Kubernetes', 'Facility OT', 'Physical', 'Cross-domain'];
export const DOMAIN_ICON: Record<SecDomain, I.LucideIcon> = { Network: I.Network, Management: I.Cable, Compute: I.Server, Kubernetes: I.Boxes, 'Facility OT': I.Factory, Physical: I.DoorClosedLocked, 'Cross-domain': I.Workflow };
export const SSVC_INFO = 'CISA SSVC decision from exploitation (CISA KEV = active, EPSS ≥ 10% = proof of concept), exposure (internet edge = open) and mission impact (crown-jewel assets): Act = fix now (7 days), Attend = fix soon (30 days), Track* = watch closely (90 days), Track = next cycle.';

export const SevChip = ({ s, size = 'xs' }: { s: SecSev; size?: 'xs' | 'sm' }) => <Chip tone={SEV_TONE[s]} size={size}>{s}</Chip>;
export const StateChip = ({ s }: { s: SecDetState }) => <Chip tone={STATE_TONE[s]} size="xs" dot>{s}</Chip>;
export const PhaseChip = ({ p }: { p: SecPhase }) => <Chip tone={p === 'Closed' ? 'neutral' : p === 'Detection & analysis' ? 'info' : p === 'Containment' ? 'orange' : 'purple'} size="xs" dot>{p}</Chip>;
export const DomainTag = ({ d }: { d: SecDomain }) => { const Ic = DOMAIN_ICON[d]; return <span className="so-dom"><Ic size={13} />{d}</span>; };
export const Tech = ({ id, title }: { id: string; title?: string }) => (
  <a className="so-tech" href={`https://attack.mitre.org/techniques/${id.replace('.', '/')}/`} target="_blank" rel="noreferrer" title={title ?? `MITRE ATT&CK ${id}`} onClick={e => e.stopPropagation()}>{id}</a>
);
export const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
export const plural = (n: number, w: string, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
export const toneOf = (v: number) => (v >= 85 ? 'good' : v >= 65 ? 'warn' : 'bad') as 'good' | 'warn' | 'bad';

/* score ring (posture, CSF functions, sites) */
export function Ring({ value, size = 72, label }: { value: number; size?: number; label?: string }) {
  const r = size / 2 - 6, c = 2 * Math.PI * r;
  return (
    <span className="so-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}><circle cx={size / 2} cy={size / 2} r={r} className="so-ring-bg" /><circle cx={size / 2} cy={size / 2} r={r} className={`so-ring-fg is-${toneOf(value)}`} strokeDasharray={`${(c * value) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} /></svg>
      <b>{value}{label ?? ''}</b>
    </span>
  );
}

/* NIST SP 800-61 lifecycle tracker */
export function Lifecycle({ phase }: { phase: SecPhase }) {
  const at = PHASES.indexOf(phase);
  return (
    <ol className="so-life">{PHASES.slice(0, 5).map((p, i) => <li key={p} className={i < at || phase === 'Closed' ? 'is-done' : i === at ? 'is-now' : ''}><i>{i < at || phase === 'Closed' ? <I.Check size={12} /> : i + 1}</i><span>{p}</span></li>)}</ol>
  );
}
