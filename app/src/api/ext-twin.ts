/* Digital-twin data for one datacenter: the site record plus per-element
   operational facts the 3D view colours by. Mock-backed like src/api/index.ts;
   a REST backend would serve GET /datacenters/:id/twin with the same shape. */
import * as S from '../mock/server';
import type { Alert, Datacenter, DcSummary, EdgeStatus, NetworkElement, Severity } from './types';

export interface TwinNe extends NetworkElement {
  alarms: number; worst: Severity | null; linksDown: number; links: number; services: number; uSize: number; edge: boolean; edgeTo?: string;
}
export interface TwinData {
  dc: Datacenter; summary: DcSummary; nes: TwinNe[]; alerts: Alert[]; incidents: ReturnType<typeof S.incidents>; edge: EdgeStatus;
}

const SEV: Record<Severity, number> = { critical: 0, major: 1, minor: 2, warning: 3 };
const wait = <T,>(f: () => T): Promise<T> => new Promise(res => setTimeout(() => res(structuredClone(f())), 60));

/* chassis height in rack units by role / layer (matches the generator) */
export const uSizeOf = (n: NetworkElement) => (n.role === 'DWDM' ? 6 : n.role === 'Firewall' ? 3 : n.layer === 'spine' ? 4 : 1);

export const getTwinData = (dcId: string): Promise<TwinData | null> => wait(() => {
  const db = S.raw();
  const dc = db.datacenters.find(d => d.id === dcId);
  if (!dc) return null;
  const alerts = S.alertsInScope(dcId);
  const lldp = db.links.filter(l => l.protocol === 'LLDP');
  const nes: TwinNe[] = db.nes.filter(n => n.dcId === dcId).map(n => {
    const al = alerts.filter(a => a.neId === n.id);
    const worst = al.length ? al.reduce<Severity>((w, a) => (SEV[a.severity] < SEV[w] ? a.severity : w), 'warning') : null;
    const ls = lldp.filter(l => l.aNe === n.id || l.zNe === n.id);
    const edgeLink = ls.find(l => db.neById.get(l.aNe)!.dcId !== db.neById.get(l.zNe)!.dcId);
    const edge = !!edgeLink;
    const edgeTo = edgeLink ? (db.neById.get(edgeLink.aNe)!.dcId === dcId ? db.neById.get(edgeLink.zNe)!.dcId : db.neById.get(edgeLink.aNe)!.dcId) : undefined;
    return { ...n, alarms: al.length, worst, linksDown: ls.filter(l => l.state === 'down').length, links: ls.length, services: db.services.filter(s => s.neId === n.id).length, uSize: uSizeOf(n), edge, edgeTo };
  });
  return { dc, summary: S.summarize(dc), nes, alerts, incidents: S.incidents({ dcId, status: 'open' }), edge: S.edgeStatus(dcId) };
});
