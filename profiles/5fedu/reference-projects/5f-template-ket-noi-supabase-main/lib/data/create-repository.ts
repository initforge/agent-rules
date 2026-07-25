import { isSupabase } from './config';
import type { IRepository } from './repository';
import { MockRepository } from './mock-repository';
import { SupabaseRepository } from './supabase-repository';

export interface CreateRepositoryConfig<T extends { id: string }> {
  tableName: string;
  mockData: T[];
  select?: string;
  delay?: number;
  /** Map raw PostgREST row → domain entity (coerce bigint ids, unwrap embeds). */
  mapFromDb?: (row: Record<string, unknown>) => T;
}

/**
 * Factory: returns MockRepository or SupabaseRepository based on VITE_DATA_SOURCE.
 */
export function createRepository<T extends { id: string }>(
  config: CreateRepositoryConfig<T>,
): IRepository<T> {
  if (isSupabase()) {
    if (!config.select?.trim()) {
      throw new Error(
        `createRepository("${config.tableName}"): "select" is required when VITE_DATA_SOURCE=supabase — declare columns in features/*/core/supabase-select.ts`,
      );
    }
    return new SupabaseRepository<T>(config.tableName, {
      select: config.select,
      mapFromDb: config.mapFromDb,
    });
  }
  return new MockRepository<T>(config.mockData, { delay: config.delay });
}
