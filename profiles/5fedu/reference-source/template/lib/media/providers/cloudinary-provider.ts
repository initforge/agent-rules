import type { ImageUploadContext, ImageUploadResult } from '@/lib/media/types';
import { getMediaConfig } from '@/lib/media/config';

interface CloudinaryUploadResponse {
  secure_url?: string;
  public_id?: string;
  width?: number;
  height?: number;
  error?: { message?: string };
}

/** Unsigned upload to Cloudinary (upload preset — no API secret in client) */
export async function uploadImageCloudinary(
  file: File,
  context?: ImageUploadContext,
): Promise<ImageUploadResult> {
  const config = getMediaConfig();
  if (config.provider !== 'cloudinary' || !config.cloudinary) {
    throw new Error('Cloudinary chưa được cấu hình');
  }

  const { cloudName, uploadPreset } = config.cloudinary;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);
  if (context?.folder) {
    formData.append('folder', context.folder);
  }
  if (context?.tags?.length) {
    formData.append('tags', context.tags.join(','));
  }

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: 'POST', body: formData },
  );

  const data = (await response.json()) as CloudinaryUploadResponse;

  if (!response.ok || !data.secure_url) {
    const message = data.error?.message ?? `Cloudinary upload failed (${response.status})`;
    throw new Error(message);
  }

  return {
    url: data.secure_url,
    publicId: data.public_id,
    width: data.width,
    height: data.height,
  };
}
