/* P2B entity hooks over the planner store (same shapes: list → { data: { data, total } }, detail → { data }). */
import { db } from './db';
import { useMutation, useQuery } from './query';

interface ListParams { page?: number; pageSize?: number; sortField?: string; sortOrder?: 'asc' | 'desc'; search?: string }
export function useEntityList(entity: string, params: ListParams = {}) {
  const { page = 1, pageSize = 20, sortField, sortOrder, search } = params;
  return useQuery({
    queryKey: [entity, 'list', { page, pageSize, sortField, sortOrder, search }],
    queryFn: () => {
      if (!db.entities().includes(entity)) return { data: [] as Record<string, unknown>[], total: 0, page, pageSize };
      if (search) { const r = db.search(entity, search); return { data: r.slice((page - 1) * pageSize, page * pageSize), total: r.length, page, pageSize }; }
      return db.getAll(entity, { page, pageSize, sortField, sortOrder });
    },
  });
}
export function useEntityDetail(entity: string, id: string | undefined) {
  return useQuery({ queryKey: [entity, 'detail', id], queryFn: () => db.getById(entity, id!) ?? null, enabled: !!id });
}
export function useEntityCreate(entity: string) { return useMutation({ mutationFn: (data: Record<string, unknown>) => db.create(entity, data) }); }
export function useEntityUpdate(entity: string) { return useMutation({ mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => db.update(entity, id, data) }); }
export function useEntityDelete(entity: string) { return useMutation({ mutationFn: (id: string) => db.delete(entity, id) }); }
