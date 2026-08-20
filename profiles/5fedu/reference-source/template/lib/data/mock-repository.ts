import type {
  IRepository,
  RepositoryGetByIdOptions,
  RepositoryListResult,
  RepositoryMutationOptions,
  RepositoryQueryOptions,
} from './repository';

const defaultDelay = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * In-memory repository implementing IRepository.
 * Deep-clones mock data so mutations don't affect the original seed.
 */
export class MockRepository<T extends { id: string }> implements IRepository<T> {
  private data: T[];
  private readonly delayMs: number;

  constructor(
    mockData: T[],
    options?: { delay?: number },
  ) {
    this.data = JSON.parse(JSON.stringify(mockData));
    this.delayMs = options?.delay ?? defaultDelay;
  }

  private sortedList(options?: RepositoryQueryOptions): T[] {
    let list = [...this.data];
    if (options?.orderBy) {
      const key = options.orderBy as keyof T;
      const asc = options.ascending !== false;
      list = list.sort((a, b) => {
        const va = a[key];
        const vb = b[key];
        if (va === vb) return 0;
        if (va == null) return asc ? 1 : -1;
        if (vb == null) return asc ? -1 : 1;
        if (typeof va === 'string' && typeof vb === 'string') {
          return asc ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        return asc ? (va < vb ? -1 : 1) : (vb < va ? -1 : 1);
      });
    }
    return list;
  }

  async count(): Promise<number> {
    await delay(this.delayMs);
    return this.data.length;
  }

  async getPage(options?: RepositoryQueryOptions): Promise<RepositoryListResult<T>> {
    await delay(this.delayMs);
    const list = this.sortedList(options);
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? list.length;
    return {
      items: list.slice(offset, offset + limit),
      total: list.length,
    };
  }

  async getAll(options?: RepositoryQueryOptions): Promise<T[]> {
    const { items } = await this.getPage(options);
    return items;
  }

  async getById(id: string, _options?: RepositoryGetByIdOptions): Promise<T | null> {
    await delay(this.delayMs);
    const item = this.data.find((d) => d.id === id);
    return item ? ({ ...item } as T) : null;
  }

  async insert(data: Omit<T, 'id'> & { id?: string }, _options?: RepositoryMutationOptions): Promise<T> {
    await delay(this.delayMs);
    const id = data.id ?? `mock-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newItem = { ...data, id } as T;
    this.data = [...this.data, newItem];
    return { ...newItem } as T;
  }

  async update(id: string, data: Partial<T>, _options?: RepositoryMutationOptions): Promise<T> {
    await delay(this.delayMs);
    const index = this.data.findIndex((d) => d.id === id);
    if (index === -1) throw new Error('Not found');
    const updated = { ...this.data[index], ...data, id } as T;
    this.data = [...this.data.slice(0, index), updated, ...this.data.slice(index + 1)];
    return { ...updated } as T;
  }

  async remove(ids: string[]): Promise<void> {
    await delay(this.delayMs);
    const set = new Set(ids);
    this.data = this.data.filter((d) => !set.has(d.id));
  }

  async upsert(rows: (Omit<T, 'id'> & { id?: string }) | ((Omit<T, 'id'> & { id?: string })[])): Promise<T[]> {
    await delay(this.delayMs);
    const arr = Array.isArray(rows) ? rows : [rows];
    const result: T[] = [];
    for (const row of arr) {
      const id = row.id ?? `mock-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const index = this.data.findIndex((d) => d.id === id);
      const item = { ...row, id } as T;
      if (index === -1) {
        this.data = [...this.data, item];
        result.push({ ...item } as T);
      } else {
        this.data = [...this.data.slice(0, index), item, ...this.data.slice(index + 1)];
        result.push({ ...item } as T);
      }
    }
    return result;
  }
}
