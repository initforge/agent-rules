import { useQuery } from '@tanstack/react-query';
import { jobLevelsQueryOptions } from '@/features/he-thong/queries/master-data';

// Module lookup-only: không có trang CRUD; dùng trong form nhân viên / chức vụ.
export const useJobLevels = () => {
  return useQuery(jobLevelsQueryOptions());
};
