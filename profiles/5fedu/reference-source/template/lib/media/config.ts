import type { MediaConfig, MediaProviderId } from './types';

function parseProvider(raw: string | undefined): MediaProviderId {
  if (raw === 'local') return 'local';
  return 'cloudinary';
}

/** Read media upload config from Vite env. Defaults to Cloudinary; opt-out dev: VITE_MEDIA_PROVIDER=local */
export function getMediaConfig(): MediaConfig {
  const provider = parseProvider(import.meta.env.VITE_MEDIA_PROVIDER);
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME?.trim() ?? '';
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET?.trim() ?? '';

  if (provider === 'cloudinary') {
    if (!cloudName || !uploadPreset) {
      throw new Error(
        'Cloudinary chưa cấu hình: cần VITE_CLOUDINARY_CLOUD_NAME và VITE_CLOUDINARY_UPLOAD_PRESET',
      );
    }
    return {
      provider: 'cloudinary',
      cloudinary: { cloudName, uploadPreset },
    };
  }

  return { provider: 'local' };
}

/** Safe config read — returns local when Cloudinary env is incomplete */
export function getMediaConfigSafe(): MediaConfig {
  try {
    return getMediaConfig();
  } catch {
    return { provider: 'local' };
  }
}
