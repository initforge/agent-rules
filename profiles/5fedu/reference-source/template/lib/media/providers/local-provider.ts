import type { ImageUploadResult } from '@/lib/media/types';

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
        return;
      }
      reject(new Error('Không thể đọc file ảnh'));
    };
    reader.onerror = () => reject(new Error('Không thể đọc file ảnh'));
    reader.readAsDataURL(file);
  });

/** Dev/mock: encode file as base64 data URL (no cloud upload) */
export async function uploadImageLocal(file: File): Promise<ImageUploadResult> {
  const url = await readFileAsDataUrl(file);
  return { url };
}
