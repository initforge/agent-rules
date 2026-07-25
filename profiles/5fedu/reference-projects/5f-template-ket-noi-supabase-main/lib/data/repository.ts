/**
 * Repository interface for data access.
 * Extends the concept from types/crud.ts with method names aligned to Supabase (insert, remove).
 */
export interface RepositoryQueryOptions {
  orderBy?: string;
  ascending?: boolean;
  /** Limit number of rows (Supabase: .range(offset, offset + limit - 1)) */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Override default PostgREST `.select()` for this request (Supabase only). */
  select?: string;
  /**
   * Khi true, PostgREST trả kèm `{ count: 'exact' }` (tốn egress hơn).
   * Mặc định false — dùng `count()` riêng hoặc cache count query khi cần tổng.
   */
  includeTotal?: boolean;
}

export interface RepositoryGetByIdOptions {
  select?: string;
}

/** Tùy chọn PostgREST: thu hẹp payload trả về sau insert/update (giảm egress). */
export interface RepositoryMutationOptions {
  /** Chuỗi `.select()` sau insert/update; mock repository bỏ qua. */
  returningSelect?: string;
}

export interface RepositoryListResult<T> {
  items: T[];
  total: number;
}

export interface IRepository<
  T extends { id: string },
  TCreate = Omit<T, 'id'>,
  TUpdate = Partial<T>,
> {
  count(): Promise<number>;
  getAll(options?: RepositoryQueryOptions): Promise<T[]>;
  /** Một request: items theo range + tổng số bản ghi (PostgREST count). */
  getPage(options?: RepositoryQueryOptions): Promise<RepositoryListResult<T>>;
  getById(id: string, options?: RepositoryGetByIdOptions): Promise<T | null>;
  insert(data: TCreate, options?: RepositoryMutationOptions): Promise<T>;
  update(id: string, data: TUpdate, options?: RepositoryMutationOptions): Promise<T>;
  remove(ids: string[]): Promise<void>;
  upsert?(data: TCreate | TCreate[]): Promise<T[]>;
}
