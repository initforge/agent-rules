import { getSupabase } from '@/lib/supabase/client';
import { handleSupabaseError } from '@/lib/supabase/errors';
import type {
  IRepository,
  RepositoryGetByIdOptions,
  RepositoryListResult,
  RepositoryMutationOptions,
  RepositoryQueryOptions,
} from './repository';

/** Giới hạn mặc định mỗi lần getAll — tránh tải bảng lớn một lượt (PostgREST/Supabase). Tăng limit trong RepositoryQueryOptions nếu cần. */
export const SUPABASE_DEFAULT_MAX_ROWS = 5_000;

function ensureClient() {
  const client = getSupabase();
  if (!client) throw new Error('Supabase client is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  return client;
}

/**
 * Supabase-backed repository implementing IRepository.
 * Supports optional select string for relation queries (e.g. '*, phong_ban(ten_phong_ban)').
 */
export class SupabaseRepository<T extends { id: string }> implements IRepository<T> {
  private readonly select: string;
  private readonly mapFromDb?: (row: Record<string, unknown>) => T;

  constructor(
    private readonly tableName: string,
    options?: { select?: string; mapFromDb?: (row: Record<string, unknown>) => T },
  ) {
    if (!options?.select?.trim()) {
      throw new Error(
        `SupabaseRepository("${tableName}"): explicit select string required — avoid select('*') to reduce egress`,
      );
    }
    this.select = options.select;
    this.mapFromDb = options?.mapFromDb;
  }

  private mapItem(row: Record<string, unknown> | null): T | null {
    if (!row) return null;
    return this.mapFromDb ? this.mapFromDb(row) : (row as T);
  }

  private mapItems(rows: Record<string, unknown>[]): T[] {
    return rows.map((row) => this.mapItem(row)!);
  }

  private mutationSelect(opts?: RepositoryMutationOptions): string {
    return opts?.returningSelect ?? this.select;
  }

  async count(): Promise<number> {
    const supabase = ensureClient();
    const { count, error } = await supabase
      .from(this.tableName)
      .select('*', { count: 'exact', head: true });
    if (error) handleSupabaseError(error);
    return count ?? 0;
  }

  async getPage(options?: RepositoryQueryOptions): Promise<RepositoryListResult<T>> {
    const supabase = ensureClient();
    const select = options?.select ?? this.select;
    const includeTotal = options?.includeTotal === true;
    let query = includeTotal
      ? supabase.from(this.tableName).select(select, { count: 'exact' })
      : supabase.from(this.tableName).select(select);
    if (options?.orderBy) {
      query = query.order(options.orderBy, { ascending: options.ascending !== false });
    }
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? SUPABASE_DEFAULT_MAX_ROWS;
    query = query.range(offset, offset + limit - 1);
    const { data, error, count } = await query;
    if (error) handleSupabaseError(error);
    const raw = (data ?? []) as Record<string, unknown>[];
    return {
      items: this.mapFromDb ? this.mapItems(raw) : (raw as T[]),
      total: includeTotal ? (count ?? 0) : 0,
    };
  }

  async getAll(options?: RepositoryQueryOptions): Promise<T[]> {
    const { items } = await this.getPage(options);
    return items;
  }

  async getById(id: string, options?: RepositoryGetByIdOptions): Promise<T | null> {
    const supabase = ensureClient();
    const select = options?.select ?? this.select;
    const { data, error } = await supabase
      .from(this.tableName)
      .select(select)
      .eq('id', id)
      .maybeSingle();
    if (error) handleSupabaseError(error);
    return this.mapItem(data as Record<string, unknown> | null);
  }

  async insert(row: Omit<T, 'id'> & { id?: string }, opts?: RepositoryMutationOptions): Promise<T> {
    const supabase = ensureClient();
    const payload = { ...row } as Record<string, unknown>;
    if (payload.id === undefined) delete payload.id;
    const { data, error } = await supabase
      .from(this.tableName)
      .insert(payload)
      .select(this.mutationSelect(opts))
      .single();
    if (error) handleSupabaseError(error);
    return this.mapItem(data as Record<string, unknown>)!;
  }

  async update(id: string, partial: Partial<T>, opts?: RepositoryMutationOptions): Promise<T> {
    const supabase = ensureClient();
    const payload = { ...partial } as Record<string, unknown>;
    delete payload.id;
    const { data, error } = await supabase
      .from(this.tableName)
      .update(payload)
      .eq('id', id)
      .select(this.mutationSelect(opts))
      .single();
    if (error) handleSupabaseError(error);
    return this.mapItem(data as Record<string, unknown>)!;
  }

  async remove(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const supabase = ensureClient();
    const { error } = await supabase.from(this.tableName).delete().in('id', ids);
    if (error) handleSupabaseError(error);
  }

  async upsert(rows: (Omit<T, 'id'> & { id?: string }) | ((Omit<T, 'id'> & { id?: string })[])): Promise<T[]> {
    const supabase = ensureClient();
    const arr = Array.isArray(rows) ? rows : [rows];
    const payload = arr.map((r) => ({ ...r } as Record<string, unknown>));
    const { data, error } = await supabase
      .from(this.tableName)
      .upsert(payload, { onConflict: 'id' })
      .select(this.select);
    if (error) handleSupabaseError(error);
    const raw = (data ?? []) as Record<string, unknown>[];
    return this.mapFromDb ? this.mapItems(raw) : (raw as T[]);
  }
}
