/**
 * Plain-English texts for waves (rollback, acceptance, swap methods). No imports beyond types,
 * so the seed can use them without pulling in the planner runtime.
 */
import type * as T from '../p2b/types';

export type SwapMethodName = 'In place' | 'Next free position in the row' | 'Temporary rack';

export function rollbackText(scope: T.PlannerScope, o: { side?: 'A' | 'B'; parallel?: boolean; swap?: SwapMethodName; soakDays?: number }): string {
  if (scope === 'server-refresh') return o.parallel
    ? 'Old servers stay racked and powered until the service owners accept the new ones. Rollback: move the workload back to the old servers and power the new ones down. Decision point at half the window.'
    : 'Old servers are removed only after the new ones pass the first checks. Rollback: re-rack the old servers in the same U, same cables and addresses, and power them on. Decision point at half the window.';
  if (scope === 'network-refresh') return `The old switch stays racked and cabled beside the new one until the ${o.soakDays ?? 7}-day soak ends. Rollback: move the patch leads back to the old switch and restore its configuration backup; the ${o.side === 'B' ? 'side A switch (already proven)' : 'side B switch'} carries the traffic throughout.`;
  if (o.swap === 'In place') return 'Rollback: refit the old rack (kept on site until acceptance), re-rack the devices in the recorded U positions and reconnect the existing power strips.';
  if (o.swap === 'Temporary rack') return 'Rollback: devices stay in the temporary rack on its own feeds until the new rack is accepted; move them back into the old rack if the new one fails.';
  return 'Rollback: devices not yet moved stay in the old rack; devices already moved go back one at a time into their recorded U positions in the old rack, which stays in place until the last device is accepted.';
}
export function acceptanceText(scope: T.PlannerScope, soakDays = 7): string {
  if (scope === 'server-refresh') return 'Firmware and BIOS on the baseline, 24 h burn-in clean, BMC and kept addresses answer, monitoring green, service owners sign off.';
  if (scope === 'network-refresh') return `Every patched port up at the planned speed, routing and overlay peers up, partner failover tested, no errors through the ${soakDays}-day soak.`;
  return 'Both strips energised and metered, every device dual-fed and up, every link up, rack elevation and labels updated.';
}


export const SWAP_METHODS: SwapMethodName[] = ['In place', 'Next free position in the row', 'Temporary rack'];
export const SWAP_TEXT: Record<SwapMethodName, string> = {
  'In place': 'The whole rack goes down: devices are de-racked, the rack swapped, devices re-racked and re-cabled.',
  'Next free position in the row': 'The new rack is set in a free position in the row; devices move one at a time while their partners carry the load. The rack position changes.',
  'Temporary rack': 'Devices move to a temporary rack, the rack is swapped in place, and the devices move back: two short moves per device, same position.',
};

/** How workloads move in a server refresh when a critical service needs both running. */
export const PARALLEL = 'Parallel run, then switch';
