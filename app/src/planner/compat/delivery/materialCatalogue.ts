/* P2B material catalogue hooks used by plan execution. Materials are not tracked separately here: each BOM line stays a BOM line. */
import type * as T from '../../p2b/types';
type Cat = T.Material['category'];
export const CATEGORY_WORK = new Proxy({} as Record<Cat, string[]>, { get: () => [] });
export const stepWorkTypes = (_k: string, _s: string): string[] => { void _k; void _s; return []; };
export const stepForCategory = (_k: string | undefined, _c: Cat): string | undefined => { void _k; void _c; return undefined; };
export const resolveMaterial = (_m: T.Material[], _l: { partNumber?: string; description?: string; model?: string; kind?: string }): T.Material | undefined => { void _m; void _l; return undefined; };
export function inUnits(_m: Pick<T.Material, 'packSize' | 'unitCost'>, quantity: number, unitCost: number) { void _m; return { quantity, unitCost }; }
