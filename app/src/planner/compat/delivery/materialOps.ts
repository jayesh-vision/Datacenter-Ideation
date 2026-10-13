/* P2B material operations, reduced to what plan execution calls: a BOM line keeps its own description as the material. */
import type * as T from '../../p2b/types';
import type { MockDB } from '../db';
export function createMaterialOps(db: MockDB, _actor: string, _audit?: unknown) {
  void _actor; void _audit;
  return {
    mirrorMaterial(item: { partNumber: string; description: string; manufacturer: string; unitCost: number; category?: string }): T.Material {
      const id = `MAT-${item.partNumber}`;
      const have = db.getById('materials', id) as unknown as T.Material | undefined;
      if (have) return have;
      return db.create('materials', { id, matId: id, partNumber: item.partNumber, name: item.description, manufacturer: item.manufacturer, unitCost: item.unitCost, category: (item.category ?? 'Other') as T.Material['category'], packSize: 1 }) as unknown as T.Material;
    },
    ensurePoLines(_bomId: string) { void _bomId; return []; },
    planProjectMaterials(_projectId: string) { void _projectId; return []; },
  };
}
