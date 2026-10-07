/* GPU cloud (NeoCloud) fabric planes. A GPU cloud does not think in routing protocols on its hosts:
   every cable belongs to one of three networks.
   - InfiniBand: the 400G NDR compute fabric (GPU node rails, IB leaf ↔ IB spine);
   - Ethernet: the 100G front-end / storage fabric (hosts ↔ Ethernet leafs ↔ spines ↔ border, firewalls);
   - Management: out-of-band 1G BMC ports and the OOB switches' uplinks. */
export type Plane = 'ib' | 'eth' | 'mgmt';

export const PLANE_LABEL: Record<Plane, string> = { ib: 'InfiniBand', eth: 'Ethernet front-end', mgmt: 'Management (OOB)' };
export const PLANE_SHORT: Record<Plane, string> = { ib: 'InfiniBand', eth: 'Ethernet', mgmt: 'management' };

export function planeOf(l: { aNe: string; zNe: string; capacityMbps: number }): Plane {
  if (/-OOB-\d+$/.test(l.aNe) || /-OOB-\d+$/.test(l.zNe) || l.capacityMbps <= 1000) return 'mgmt';
  if (l.capacityMbps >= 400000) return 'ib';
  return 'eth';
}
