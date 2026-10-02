import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import type { NetworkElement } from '../../api/types';
import { Empty } from '../../ui/kit';
import { ND_REASON } from '../../lib/vocab';

/* devices without telemetry (planned or unmonitored): say so instead of showing zeros */
export function NoTelemetry({ ne, what }: { ne: NetworkElement; what: string }) {
  return (
    <section className="card">
      <Empty icon={SearchX} title={`No ${what} yet`} action={<Link className="nst-btn nst-btn--sm" to={ne.ndReason === 'planned' ? `/datacenters/${ne.dcId}?tab=overview` : `/datacenters/${ne.dcId}?tab=elements&view=unmonitored`}>{ne.ndReason === 'planned' ? 'Site overview' : 'Unmonitored devices'}</Link>}>
        {ne.ndReason === 'planned' ? `${ne.name} is planned and not installed yet.` : `${ne.name} is installed but not monitored (${ND_REASON[ne.ndReason ?? 'no-collector'].toLowerCase()}).`}
      </Empty>
    </section>
  );
}

export const linkIf = (l: { aNe: string; aIf: string; zNe: string; zIf: string }, neId: string) =>
  l.aNe === neId ? { local: l.aIf, peerNe: l.zNe, peerIf: l.zIf } : { local: l.zIf, peerNe: l.aNe, peerIf: l.aIf };
