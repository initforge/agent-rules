import { useQuery } from '@tanstack/react-query';
import { branchesQueryOptions } from '@/features/he-thong/queries/master-data';

// Module lookup-only: không có trang CRUD; dùng trong form nhân viên.
export const useBranches = () => {
  return useQuery(branchesQueryOptions());
};
