import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import {
  prefetchModuleRolePermissions,
  prefetchAdjacentModuleRolePermissions,
} from './prefetch-module-permissions';

const MODULES = ['mod-a', 'mod-b', 'mod-c'] as const;

describe('prefetchModuleRolePermissions', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
    vi.spyOn(queryClient, 'prefetchQuery').mockResolvedValue(undefined);
  });

  it('no-ops on empty moduleId', () => {
    prefetchModuleRolePermissions(queryClient, '');
    expect(queryClient.prefetchQuery).not.toHaveBeenCalled();
  });

  it('prefetches roles.forModule query', () => {
    prefetchModuleRolePermissions(queryClient, 'mod-b');
    expect(queryClient.prefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.roles.forModule('mod-b') }),
    );
  });
});

describe('prefetchAdjacentModuleRolePermissions', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
    vi.spyOn(queryClient, 'prefetchQuery').mockResolvedValue(undefined);
  });

  it('prefetches previous and next modules', () => {
    prefetchAdjacentModuleRolePermissions(queryClient, 'mod-b', MODULES);
    expect(queryClient.prefetchQuery).toHaveBeenCalledTimes(2);
    expect(queryClient.prefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.roles.forModule('mod-a') }),
    );
    expect(queryClient.prefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.roles.forModule('mod-c') }),
    );
  });

  it('prefetches only next when first module', () => {
    prefetchAdjacentModuleRolePermissions(queryClient, 'mod-a', MODULES);
    expect(queryClient.prefetchQuery).toHaveBeenCalledTimes(1);
    expect(queryClient.prefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.roles.forModule('mod-b') }),
    );
  });

  it('prefetches only previous when last module', () => {
    prefetchAdjacentModuleRolePermissions(queryClient, 'mod-c', MODULES);
    expect(queryClient.prefetchQuery).toHaveBeenCalledTimes(1);
    expect(queryClient.prefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.roles.forModule('mod-b') }),
    );
  });

  it('no-ops when moduleId not in ordered list', () => {
    prefetchAdjacentModuleRolePermissions(queryClient, 'unknown', MODULES);
    expect(queryClient.prefetchQuery).not.toHaveBeenCalled();
  });
});
