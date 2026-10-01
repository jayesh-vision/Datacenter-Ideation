import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import type { NetworkElement } from '../../api/types';
import { Empty } from '../../ui/kit';
import { ND_REASON } from '../../lib/vocab';

/* not-discovered devices have no telemetry; say so instead of showing zeros */
export function NoTelemetry({ ne, what }: { ne: NetworkElement; what: string }) {
  return (
    <section className="card">
      <Empty icon={SearchX} title={`No ${what} yet`} action={<Link className="nst-btn nst-btn--sm" to={`/datacenters/${ne.dcId}?tab=elements&disc=not-discovered`}>Undiscovered elements</Link>}>
        {ne.name} is on record but has never been seen by discovery ({ND_REASON[ne.ndReason ?? 'planned'].toLowerCase()}).
      </Empty>
    </section>
  );
}

export const linkIf = (l: { aNe: string; aIf: string; zNe: string; zIf: string }, neId: string) =>
  l.aNe === neId ? { local: l.aIf, peerNe: l.zNe, peerIf: l.zIf } : { local: l.zIf, peerNe: l.aNe, peerIf: l.aIf };
