/* MACD shared parts: kind / stage / SLA / priority chips, the stage stepper, money and hour formats. */
import * as I from 'lucide-react';
import { Chip } from '../../ui/kit';
import type { MacdKind, MacdObject, MacdPriority, MacdRequest, MacdSla, MacdStage } from '../../api/types';
import { fmtMoney } from '../../lib/format';

export const KINDS: MacdKind[] = ['Move', 'Add', 'Change', 'Disconnect'];
export const FLOW: MacdStage[] = ['Submitted', 'Feasibility', 'Quote', 'Scheduled', 'In progress', 'Verification', 'Completed'];
export const OPEN_STAGES: MacdStage[] = ['Submitted', 'Feasibility', 'Quote', 'Scheduled', 'In progress', 'Verification'];
export const OBJECTS: MacdObject[] = ['Equipment', 'Cabinet', 'Power circuit', 'Cross-connect', 'Network port', 'IP addresses', 'GPU nodes', 'Access'];
export const isOpen = (r: MacdRequest) => OPEN_STAGES.includes(r.stage);

export const KIND_ICON: Record<MacdKind, I.LucideIcon> = { Move: I.MoveRight, Add: I.Plus, Change: I.RefreshCw, Disconnect: I.Unplug };
export const OBJ_ICON: Record<MacdObject, I.LucideIcon> = { Equipment: I.Server, Cabinet: I.Archive, 'Power circuit': I.PlugZap, 'Cross-connect': I.Cable, 'Network port': I.EthernetPort, 'IP addresses': I.Network, 'GPU nodes': I.Cpu, Access: I.KeyRound };
const KIND_TONE = { Move: 'purple', Add: 'info', Change: 'cyan', Disconnect: 'neutral' } as const;
export const KindChip = ({ k }: { k: MacdKind }) => { const Ic = KIND_ICON[k]; return <Chip tone={KIND_TONE[k]}><span className="mc-kind"><Ic size={12} />{k}</span></Chip>; };
const STAGE_TONE: Record<MacdStage, 'neutral' | 'info' | 'cyan' | 'purple' | 'success' | 'orange' | 'error'> = { Submitted: 'neutral', Feasibility: 'neutral', Quote: 'purple', Scheduled: 'cyan', 'In progress': 'info', Verification: 'info', Completed: 'success', Rejected: 'error', Cancelled: 'neutral' };
export const StageChip = ({ s }: { s: MacdStage }) => <Chip tone={STAGE_TONE[s]} dot>{s}</Chip>;
const SLA_TONE: Record<MacdSla, 'success' | 'orange' | 'error' | 'neutral' | 'info'> = { 'On track': 'info', 'At risk': 'orange', Breached: 'error', Met: 'success', Missed: 'error' };
export const SlaChip = ({ s }: { s: MacdSla }) => <Chip tone={SLA_TONE[s]}>{s}</Chip>;
export const PrioChip = ({ p }: { p: MacdPriority }) => p === 'Standard' ? <span className="vw-label">Standard</span> : <Chip tone={p === 'Emergency' ? 'error' : 'orange'}>{p}</Chip>;

export const hrs = (h: number) => { const a = Math.abs(h); return a < 1 ? `${Math.round(a * 60)} min` : a < 48 ? `${Math.round(a)} h` : `${Math.round(a / 24)} d`; };
export const slaLine = (r: MacdRequest) => r.stage === 'Completed' ? (r.sla === 'Met' ? `met with ${hrs(r.slaLeftH)} to spare` : `missed by ${hrs(r.slaLeftH)}`) : !isOpen(r) ? r.stage.toLowerCase() : r.slaLeftH >= 0 ? `${hrs(r.slaLeftH)} left` : `${hrs(r.slaLeftH)} over`;
export const money = (n: number) => fmtMoney(n, 0);
export const mrcLine = (n: number) => (n === 0 ? '—' : `${n > 0 ? '+' : '−'}${fmtMoney(Math.abs(n), 0)}/mo`);
export const plural = (n: number, w: string, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;

/* where a request is: one connected line of stages (Quote is skipped for internal work) */
export function Stepper({ r }: { r: MacdRequest }) {
  const steps = FLOW.filter(s => s !== 'Quote' || r.billable);
  const dead = r.stage === 'Rejected' || r.stage === 'Cancelled';
  const reached = dead ? (r.changeId ? steps.indexOf('Scheduled') : 1) : steps.indexOf(r.stage);
  return (
    <ol className={`mc-steps${dead ? ' is-dead' : ''}`}>
      {steps.map((s, i) => (
        <li key={s} className={i < reached || r.stage === 'Completed' ? 'is-done' : i === reached && !dead ? 'is-now' : ''}>
          <i>{i < reached || r.stage === 'Completed' ? <I.Check size={12} /> : i + 1}</i><span>{s}</span>
        </li>))}
      {dead && <li className="is-end"><i><I.X size={12} /></i><span>{r.stage}</span></li>}
    </ol>
  );
}
