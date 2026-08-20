import React, { useEffect } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { toast } from 'sonner';

/**
 * Đăng ký Service Worker (PWA) sau khi React mount để có thể dùng toast.
 * - onNeedRefresh: thông báo có bản cập nhật + nút "Tải lại".
 * - onOfflineReady: thông báo ứng dụng sẵn sàng dùng offline.
 */
const PwaRegister: React.FC = () => {
  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh() {
        toast.info('Đã có bản cập nhật mới.', {
          description: 'Nhấn "Tải lại" để cập nhật ứng dụng.',
          action: {
            label: 'Tải lại',
            onClick: () => updateSW(true),
          },
          duration: Infinity,
        });
      },
      onOfflineReady() {
        toast.success('Ứng dụng sẵn sàng dùng offline.');
      },
    });
  }, []);
  return null;
};

export default PwaRegister;
