// ─── Filter & Query Types ────────────────────────────────────────────

export interface FilterCriteria {
  field: string;
  operator: 'eq' | 'contains' | 'in' | 'gte' | 'lte' | 'between';
  value: unknown;
  valueTo?: unknown; // for 'between'
}

export interface QueryOptions {
  filters?: FilterCriteria[];
  page?: number;
  pageSize?: number;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T = Record<string, unknown>> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc != null && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function matchesFilter(
  record: Record<string, unknown>,
  filter: FilterCriteria,
): boolean {
  const val = getNestedValue(record, filter.field);

  switch (filter.operator) {
    case 'eq':
      return val === filter.value;

    case 'contains': {
      if (typeof val !== 'string' || typeof filter.value !== 'string')
        return false;
      return val.toLowerCase().includes(filter.value.toLowerCase());
    }

    case 'in': {
      if (!Array.isArray(filter.value)) return false;
      return (filter.value as unknown[]).includes(val);
    }

    case 'gte': {
      if (val == null || filter.value == null) return false;
      return (val as number | string) >= (filter.value as number | string);
    }

    case 'lte': {
      if (val == null || filter.value == null) return false;
      return (val as number | string) <= (filter.value as number | string);
    }

    case 'between': {
      if (val == null || filter.value == null || filter.valueTo == null)
        return false;
      const v = val as number | string;
      return (
        v >= (filter.value as number | string) &&
        v <= (filter.valueTo as number | string)
      );
    }

    default:
      return true;
  }
}

function compareValues(a: unknown, b: unknown, order: 'asc' | 'desc'): number {
  if (a == null && b == null) return 0;
  if (a == null) return order === 'asc' ? -1 : 1;
  if (b == null) return order === 'asc' ? 1 : -1;

  let cmp = 0;
  if (typeof a === 'string' && typeof b === 'string') {
    cmp = a.localeCompare(b);
  } else if (typeof a === 'number' && typeof b === 'number') {
    cmp = a - b;
  } else {
    cmp = String(a).localeCompare(String(b));
  }

  return order === 'desc' ? -cmp : cmp;
}

// ─── MockDB Class ────────────────────────────────────────────────────

export class MockDB {
  private tables: Map<string, Map<string, Record<string, unknown>>> =
    new Map();
  /* per-collection write counter + listeners (our addition: hooks re-read only the collections that changed) */
  private versions = new Map<string, number>();
  private listeners = new Set<() => void>();
  private pending = false;
  version(entity: string): number { return this.versions.get(entity) ?? 0; }
  subscribe(f: () => void): () => void { this.listeners.add(f); return () => { this.listeners.delete(f); }; }
  /** Mark a collection changed; listeners run once per tick. */
  touch(entity: string): void {
    this.versions.set(entity, this.version(entity) + 1);
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(() => { this.pending = false; this.listeners.forEach(f => f()); });
  }

  /** Ensure an entity table exists */
  private ensureTable(
    entity: string,
  ): Map<string, Record<string, unknown>> {
    if (!this.tables.has(entity)) {
      this.tables.set(entity, new Map());
    }
    return this.tables.get(entity)!;
  }

  // ── CRUD ────────────────────────────────────────────────────────────

  create(entity: string, data: Record<string, unknown>): Record<string, unknown> {
    const table = this.ensureTable(entity);
    const id = (data['id'] as string) ?? crypto.randomUUID();
    const record = { ...data, id };
    table.set(id, record);
    this.touch(entity);
    return record;
  }

  getById(entity: string, id: string): Record<string, unknown> | undefined {
    return this.ensureTable(entity).get(id);
  }

  update(
    entity: string,
    id: string,
    data: Partial<Record<string, unknown>>,
  ): Record<string, unknown> | undefined {
    const table = this.ensureTable(entity);
    const existing = table.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, id };
    table.set(id, updated);
    this.touch(entity);
    return updated;
  }

  delete(entity: string, id: string): boolean {
    const ok = this.ensureTable(entity).delete(id);
    if (ok) this.touch(entity);
    return ok;
  }

  // ── Query ───────────────────────────────────────────────────────────

  getAll(
    entity: string,
    options: QueryOptions = {},
  ): PaginatedResult {
    const table = this.ensureTable(entity);
    let records = Array.from(table.values());

    // Apply filters
    if (options.filters && options.filters.length > 0) {
      records = records.filter((r) =>
        options.filters!.every((f) => matchesFilter(r, f)),
      );
    }

    const total = records.length;

    // Sort
    if (options.sortField) {
      const field = options.sortField;
      const order = options.sortOrder ?? 'asc';
      records.sort((a, b) =>
        compareValues(
          getNestedValue(a, field),
          getNestedValue(b, field),
          order,
        ),
      );
    }

    // Paginate
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 50;
    const start = (page - 1) * pageSize;
    const paged = records.slice(start, start + pageSize);

    return { data: paged, total, page, pageSize };
  }

  count(entity: string, filters?: FilterCriteria[]): number {
    const table = this.ensureTable(entity);
    if (!filters || filters.length === 0) return table.size;

    let n = 0;
    for (const record of table.values()) {
      if (filters.every((f) => matchesFilter(record, f))) n++;
    }
    return n;
  }

  search(entity: string, query: string): Record<string, unknown>[] {
    const table = this.ensureTable(entity);
    const q = query.toLowerCase();
    const results: Record<string, unknown>[] = [];

    for (const record of table.values()) {
      const haystack = Object.values(record)
        .filter((v) => typeof v === 'string')
        .join(' ')
        .toLowerCase();
      if (haystack.includes(q)) {
        results.push(record);
      }
    }
    return results;
  }

  // ── Utility ─────────────────────────────────────────────────────────

  /** Get all records as a plain array (no pagination) */
  getAllRaw(entity: string): Record<string, unknown>[] {
    return Array.from(this.ensureTable(entity).values());
  }

  /** Clear all data in a single entity table */
  clearEntity(entity: string): void {
    this.ensureTable(entity).clear();
    this.touch(entity);
  }

  /** Clear everything */
  clearAll(): void {
    this.tables.clear();
  }

  /** List entity names that have data */
  entities(): string[] {
    return Array.from(this.tables.keys());
  }

  /** Bulk-load records from a pre-generated JSON snapshot (one array per entity). */
  hydrate(snapshot: Record<string, Record<string, unknown>[]>): void {
    this.clearAll();
    for (const [entity, records] of Object.entries(snapshot)) {
      const table = this.ensureTable(entity);
      for (const record of records) {
        const id = (record['id'] as string) ?? crypto.randomUUID();
        table.set(id, { ...record, id });
      }
      this.touch(entity);
    }
  }
}
