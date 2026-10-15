/* Small presentational parts shared by the build, replace and migration families (no logic). */
import type { ReactNode } from 'react';
import { Chip } from '../../../../ui/kit';
import type { CloseoutCheck } from '../../../../planner/lib/scopes/types';

/** A row of quiet figure tiles (label, value, one line under it); the value is coloured only when it carries a verdict. The wizard's
    shared tiles (wizard/panelKit.tsx), so every family's figures look the same. */
export { Tiles, Note as Hint } from '../../wizard/panelKit';

/** A grid in the wizard's table frame (wizard/panelKit.tsx .pn-tbl): scrolls inside its own frame when it is wider or taller. */
export function Tbl({ children, maxHeight }: { children: ReactNode; maxHeight?: number }) {
  return <div className="pn-tbl" style={maxHeight ? { maxHeight } : undefined}><table className="nst-table">{children}</table></div>;
}

/** "1 rack", "3 racks". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** What a wave touches, in words. */
export const waveScope = (w: { rackIds: string[]; deviceIds: string[]; serviceIds: string[] }) => [plural(w.rackIds.length, 'rack'), plural(w.deviceIds.length, 'device'), w.serviceIds.length ? plural(w.serviceIds.length, 'service') : ''].filter(Boolean).join(', ');
/** An empty-state line inside a step or a section. */
export const Quiet = ({ children }: { children: ReactNode }) => <p className="vw-label" style={{ margin: 0, fontSize: 13 }}>{children}</p>;
/** Red / amber issue lines (each its own line). */
export const Issues = ({ items, warn }: { items: string[]; warn?: boolean }) => <>{items.map((t, i) => <div key={i} style={{ fontSize: 12, color: warn ? 'var(--vw-color-amber-700)' : 'var(--vw-color-red-600)' }}>{t}</div>)}</>;

/** A closure checklist: done or open, the check and its detail, read live from the platform. Once the plan is in Delivery
    (`atHandover`), a check that is still open is set by the handover to operations, so it reads "At handover" instead of "Open". */
export function Checklist({ checks, atHandover }: { checks: CloseoutCheck[]; atHandover?: boolean }) {
  if (!checks.length) return <Quiet>No closure checks for this plan.</Quiet>;
  return (
    <Tbl><tbody>{checks.map(c => (
      <tr key={c.key}>
        <td style={{ width: 110 }}><Chip tone={c.ok ? 'success' : atHandover ? 'neutral' : 'warning'} size="xs" dot>{c.ok ? 'Done' : atHandover ? 'At handover' : 'Open'}</Chip></td>
        <td><span className="strong">{c.label}</span></td>
        <td style={{ whiteSpace: 'normal' }}><span className="vw-label">{c.detail}</span></td>
      </tr>
    ))}</tbody></Tbl>
  );
}

/** The plan is in Delivery and not handed over yet: the handover closes what is still open. */
export const inDelivery = (plan: { status: string; artefacts?: unknown }) => plan.status === 'Executing' && !!(plan.artefacts as { deliveryProjectId?: string } | undefined)?.deliveryProjectId;
/** The plan's project in Delivery. */
export const deliveryProjectOf = (plan: { id: string; artefacts?: unknown }) => (plan.artefacts as { deliveryProjectId?: string } | undefined)?.deliveryProjectId ?? plan.id.replace('PLN-', 'PRJ-');
