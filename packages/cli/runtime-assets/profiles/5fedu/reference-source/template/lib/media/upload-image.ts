import { getMediaConfigSafe } from './config';
import { uploadImageCloudinary } from './providers/cloudinary-provider';
import { uploadImageLocal } from './providers/local-provider';
import type { ImageUploadContext, ImageUploadResult } from './types';

export interface UploadImageOptions {
  context?: ImageUploadContext;
  /** Override provider from env */
  provider?: 'local' | 'cloudinary';
}

/**
 * Upload an image via configured provider.
 * - local: base64 data URL (dev/mock)
 * - cloudinary: HTTPS URL from Cloudinary CDN
 */
export async function uploadImage(
  file: File,
  options?: UploadImageOptions,
): Promise<ImageUploadResult> {
  const config = getMediaConfigSafe();
  const provider = options?.provider ?? config.provider;

  if (provider === 'cloudinary') {
    return uploadImageCloudinary(file, options?.context);
  }

  return uploadImageLocal(file);
}
