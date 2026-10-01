import { DAY } from '../mock/seed';

/* compound monthly growth → months until `util` reaches `threshold` */
export function monthsTo(util: number, growthPct: number, threshold: number): number {
  if (util >= threshold) return 0;
  if (growthPct <= 0) return Infinity;
  return Math.log(threshold / util) / Math.log(1 + growthPct / 100);
}
export const dateAfterMonths = (now: number, months: number) => now + months * 30.4 * DAY;
export function project(util: number, growthPct: number, months: number) {
  return Array.from({ length: months + 1 }, (_, i) => Math.round(util * Math.pow(1 + growthPct / 100, i) * 10) / 10);
}
export const WARN = 85, CRIT = 95;
