/**
 * IPAM allocation for plans — addresses come from the organisation's real address space,
 * never from a formula.
 *
 *  - A plan at an existing site carves its prefixes out of the site's container subnet
 *    (e.g. 10.0.0.0/16 at Ashburn DC-1), avoiding every subnet already there and every
 *    prefix other plans have reserved.
 *  - A new site gets a fresh container (/16, or /15 for very large sites) from the private
 *    supernet in cidrBlocks, clear of every existing container.
 *  - VLAN numbers are the next numbers not used at the site.
 *
 * `Allocator` keeps what it has handed out, so one plan never gets the same block twice.
 */
import type * as T from '../p2b/types';
import type { PlannerData } from './plannerData';

export const ipToInt = (ip: string) => ip.split('.').reduce((a, o) => ((a << 8) >>> 0) + Number(o), 0) >>> 0;
export const intToIp = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
export interface Range { start: number; end: number; cidr: string }
export function parseCidr(cidr: string): Range | undefined {
  const [ip, len] = cidr.split('/'); const p = Number(len);
  if (!ip || !(p >= 0 && p <= 32) || ip.split('.').length !== 4) return undefined;
  const size = 2 ** (32 - p); const start = Math.floor(ipToInt(ip) / size) * size;
  return { start, end: start + size - 1, cidr: `${intToIp(start)}/${p}` };
}
export const overlap = (a: Range, b: Range) => a.start <= b.end && b.start <= a.end;
export const contains = (outer: Range, inner: Range) => outer.start <= inner.start && inner.end <= outer.end;
/** Smallest prefix that holds `hosts` usable addresses (network, broadcast and gateway reserved). */
export const prefixForHosts = (hosts: number) => Math.max(16, Math.min(30, 32 - Math.ceil(Math.log2(Math.max(4, hosts + 3)))));

const isContainer = (s: T.Subnet) => s.status === 'Container';

export class Allocator {
  private taken: Range[] = [];
  private vlansTaken = new Map<string, Set<number>>();
  readonly warnings: string[] = [];
  constructor(private data: PlannerData, opts: { excludePlanId?: string } = {}) {
    for (const s of data.subnets) { if (isContainer(s)) continue; if (opts.excludePlanId && s.plannerPlanId === opts.excludePlanId) continue; const r = parseCidr(s.cidr); if (r) this.taken.push(r); }
  }
  /** The site's container subnets (where its prefixes are carved from). */
  containers(dataCenterId: string): T.Subnet[] { return this.data.subnets.filter(s => s.dataCenterId === dataCenterId && isContainer(s)); }
  /** First aligned block of /prefix inside `within` that overlaps nothing in use. */
  carve(within: Range, prefix: number, label: string): string | undefined {
    const size = 2 ** (32 - prefix);
    for (let start = within.start; start + size - 1 <= within.end; start += size) {
      const r: Range = { start, end: start + size - 1, cidr: `${intToIp(start)}/${prefix}` };
      if (this.taken.some(t => overlap(t, r))) continue;
      this.taken.push(r); return r.cidr;
    }
    this.warnings.push(`No free /${prefix} left in ${within.cidr} for ${label}`);
    return undefined;
  }
  /** A prefix at an existing site, from its container. */
  atSite(dataCenterId: string, prefix: number, label: string): { cidr?: string; parent?: T.Subnet } {
    for (const c of this.containers(dataCenterId)) { const r = parseCidr(c.cidr); if (!r) continue; const cidr = this.carve(r, prefix, label); if (cidr) return { cidr, parent: c }; }
    if (!this.containers(dataCenterId).length) this.warnings.push(`The site has no container subnet in IPAM; ${label} needs one`);
    return {};
  }
  /** A new site container from the private supernet, clear of every existing container. */
  newContainer(prefix: number, label: string): { cidr?: string; block?: T.CIDRBlock } {
    const block = this.data.cidrBlocks.find(b => b.cidr.startsWith('10.')) ?? this.data.cidrBlocks[0];
    const r = block ? parseCidr(block.cidr) : undefined; if (!r) { this.warnings.push('No private address block in IPAM'); return {}; }
    const containers = this.data.subnets.filter(isContainer).map(s => parseCidr(s.cidr)).filter((x): x is Range => !!x);
    const size = 2 ** (32 - prefix);
    for (let start = r.start; start + size - 1 <= r.end; start += size) {
      const c: Range = { start, end: start + size - 1, cidr: `${intToIp(start)}/${prefix}` };
      if (containers.some(t => overlap(t, c)) || this.taken.some(t => overlap(t, c))) continue;
      this.taken.push(c); return { cidr: c.cidr, block };
    }
    this.warnings.push(`No free /${prefix} left in ${block?.cidr} for ${label}`); return {};
  }
  /** Next VLAN number at the site from `from`, skipping numbers in use there. */
  vlan(dataCenterId: string | undefined, from = 100): number {
    const key = dataCenterId ?? 'new';
    let used = this.vlansTaken.get(key);
    if (!used) { used = new Set(this.data.vlans.filter(v => v.dataCenterId === dataCenterId).map(v => v.vlanNumber)); this.vlansTaken.set(key, used); }
    let n = from; while (used.has(n)) n++;
    used.add(n); return n;
  }
}

/** Prefixes of other plans and live subnets that overlap a cidr (for checks). */
export function overlapsInUse(data: PlannerData, cidr: string, excludePlanId?: string): T.Subnet[] {
  const r = parseCidr(cidr); if (!r) return [];
  return data.subnets.filter(s => !isContainer(s) && s.plannerPlanId !== excludePlanId && (() => { const x = parseCidr(s.cidr); return !!x && overlap(x, r); })());
}
