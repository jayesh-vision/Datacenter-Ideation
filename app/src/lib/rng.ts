export type Rnd = () => number;

export function mulberry32(seed: number): Rnd {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const pick = <T,>(r: Rnd, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
export const between = (r: Rnd, lo: number, hi: number) => lo + r() * (hi - lo);
export const intBetween = (r: Rnd, lo: number, hi: number) => Math.floor(between(r, lo, hi + 1));
export const chance = (r: Rnd, p: number) => r() < p;

/* right-skewed durations (restoration times, stage durations) look far more
   like real operations data than uniform noise does */
export function lognormal(r: Rnd, median: number, spread: number) {
  const u = Math.max(1e-9, r()), v = r();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return median * Math.exp(spread * z);
}
