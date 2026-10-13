/**
 * Wave proposals for the replace family: the units of work per plan type fed to the shared
 * wave engine, with the method, rollback and acceptance a delivery team expects to read.
 */
import type * as T from '../p2b/types';
import type { ScopeCtx } from './scopes/types';
import { byId } from './plannerData';
import { composeWaves, phasesFromWaves, type WaveUnit } from './waves';
import { PARALLEL, type ReplaceAnalysis } from './replaceAnalysis';
import { pbool, pnum, bv } from './replaceBench';
import { outageHours, swapMethodOf, SWAP_TEXT, type SwapMethod } from './replaceRack';
import { acceptanceText, rollbackText } from './replaceText';
import { clockMs } from '../compat/clock';

const DAY = 864e5;

/** Propose waves for the current selection, keeping waves already closed or in progress. */
export function proposeReplaceWaves(c: ScopeCtx, a: ReplaceAnalysis, now = clockMs()): T.PlannerWave[] {
  const data = c.data; if (!data || !a.ready) return c.plan.waves ?? [];
  const P = c.params; const plan = c.plan;
  const keep = (plan.waves ?? []).filter(w => w.status === 'Closed' || w.status === 'In progress' || (w.status === 'Scheduled' && !!w.changeRequestId));
  const done = new Set(keep.flatMap(w => [...w.deviceIds, ...w.rackIds]));
  const units: WaveUnit[] = [];
  if (a.scope === 'server-refresh') {
    const byRack = new Map<string, T.Device[]>(); for (const d of a.old) if (!done.has(d.id)) byRack.set(d.rackId ?? '-', [...(byRack.get(d.rackId ?? '-') ?? []), d]);
    for (const [rid, devs] of [...byRack.entries()].sort((x, y) => (byId(data, 'racks', x[0])?.name ?? '').localeCompare(byId(data, 'racks', y[0])?.name ?? ''))) {
      const ids = devs.map(d => d.id);
      const us = a.units.filter(u => u.oldIds.some(id => ids.includes(id)));
      const share = (u: (typeof us)[number]) => u.oldIds.filter(id => ids.includes(id)).length / u.oldIds.length;
      units.push({ key: rid, label: byId(data, 'racks', rid)?.name ?? rid, deviceIds: ids, rackIds: [rid], targetRackIds: [...new Set(us.map(u => u.rackId!).filter(Boolean))], work: ids.length, itKw: us.reduce((s, u) => s + u.typicalKw * share(u), 0) });
    }
  } else if (a.scope === 'network-refresh') {
    for (const d of [...a.old].sort((x, y) => (x.name ?? '').localeCompare(y.name ?? ''))) if (!done.has(d.id)) { const u = a.units.find(n => n.oldIds.includes(d.id)); units.push({ key: d.id, label: d.name, deviceIds: [d.id], rackIds: d.rackId ? [d.rackId] : [], work: 1, side: a.sides.get(d.id) ?? 'A', itKw: u?.typicalKw ?? 0 }); }
  } else {
    for (const rid of a.rackIds) if (!done.has(rid)) {
      const devs = a.old.filter(d => d.rackId === rid && d.category !== 'PDU'); const m = swapMethodOf(plan, rid);
      units.push({ key: rid, label: byId(data, 'racks', rid)?.name ?? rid, deviceIds: devs.map(d => d.id), rackIds: [rid], work: devs.length * (m === 'Temporary rack' ? 2 : 1), itKw: (byId(data, 'racks', rid)?.currentPowerKw ?? 0), method: m });
    }
  }
  // Equipment arrival: cumulative demand per model against the supply (stock first, then purchases), plus staging.
  const staging = bv(c.benchmarks, 'stagingDays');
  const earliestFor = (sofar: WaveUnit[]) => {
    const ids = new Set(sofar.flatMap(u => a.scope === 'rack-replace' ? u.rackIds : u.deviceIds));
    let at = now + 7 * DAY;
    for (const s of a.supply) {
      const need = a.scope === 'rack-replace' ? [...ids].length * (s.model === 'Geist rPDU 3-phase' ? 2 : 1) : a.units.filter(u => u.model === s.model && u.oldIds.some(id => ids.has(id) || done.has(id))).length;
      const k = Math.min(s.avail.length, need) - 1; if (k >= 0) at = Math.max(at, s.avail[k].at + staging * DAY);
    }
    return new Date(at).toISOString();
  };
  const crit = a.critical.ids;
  const waves = composeWaves(data, {
    dataCenterId: plan.dataCenterId, excludePlanId: plan.id, units, pairs: a.pairs, ratePerHour: a.rate, windowHours: a.windowHours, pilot: pbool(P, 'pilotWave', true),
    after: new Date(now + 7 * DAY).toISOString(), gapDays: 2, soakDays: a.soakDays, sideAware: a.scope === 'network-refresh', keep, maxUnits: Math.max(1, pnum(P, 'racksPerWave', a.scope === 'network-refresh' ? 6 : 4)), earliestFor,
    method: us => a.scope === 'server-refresh' ? (us.some(u => u.deviceIds.some(d => crit.has(d))) || a.approach === PARALLEL ? PARALLEL : a.approach)
      : a.scope === 'network-refresh' ? `Side ${us[0]?.side ?? 'A'}: new switch racked beside the old one, links moved port by port while the partner carries the traffic`
      : [...new Set(us.map(u => `${u.method}: ${SWAP_TEXT[u.method as SwapMethod]} Outage per device about ${outageHours(u.method as SwapMethod, u.deviceIds.length, a.rate)} h.`))].join(' '),
    rollback: (us, side) => rollbackText(plan.scope, { side, parallel: us.some(u => u.deviceIds.some(d => crit.has(d))) || a.approach === PARALLEL, swap: us[0]?.method as SwapMethod | undefined, soakDays: a.soakDays }),
    acceptance: () => acceptanceText(plan.scope, a.soakDays),
  });
  return [...keep, ...waves].sort((x, y) => x.order - y.order);
}

/** Draft changes after the selection, mapping or method changed: kW figures and phases that mirror the waves. */
export function replacePatch(plan: T.PlannerPlan, a: ReplaceAnalysis, waves: T.PlannerWave[]): Partial<T.PlannerPlan> {
  const kw = Math.max(0, Math.round(a.newKw));
  return { waves, designPowerKw: kw, phases: phasesFromWaves(waves, kw), targetGoLive: waves.length ? waves[waves.length - 1].windowEnd : plan.targetGoLive, params: { ...plan.params, affectedKw: Math.round(a.oldKw) } };
}
