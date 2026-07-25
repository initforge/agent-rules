import { useQuery } from '@tanstack/react-query';
import { useEmployee } from '@/features/he-thong/nhan-vien/hooks/use-nhan-vien';
import { positionsQueryOptions } from '@/features/he-thong/queries/master-data';
import { txt } from '@/lib/text';
import type { User } from '@/types';

export interface CurrentUserDisplay {
  displayName: string;
  positionName: string | undefined;
  avatarName: string;
  avatarUrl: string | undefined;
}

/** Tên + chức vụ hiển thị topbar — từ hồ sơ NV, fallback metadata session. */
export function useCurrentUserDisplay(user: User | null | undefined): CurrentUserDisplay {
  const { data: employee } = useEmployee(user?.employee_id ?? null);

  const chucVuId = employee?.chuc_vu_id ?? user?.id_chuc_vu?.[0] ?? '';
  const needsPositionLookup = !employee?.ten_chuc_vu && Boolean(chucVuId);

  const { data: positions = [] } = useQuery({
    ...positionsQueryOptions(),
    enabled: needsPositionLookup,
  });

  const displayName = employee?.ho_ten ?? user?.full_name ?? txt('nav.guestUser');
  const avatarName = employee?.ho_ten ?? user?.full_name ?? 'User';
  const positionName =
    employee?.ten_chuc_vu ??
    (chucVuId ? positions.find((p) => p.id === chucVuId)?.ten_chuc_vu : undefined);

  return {
    displayName,
    positionName,
    avatarName,
    avatarUrl: user?.avatar_url ?? employee?.anh_dai_dien,
  };
}
