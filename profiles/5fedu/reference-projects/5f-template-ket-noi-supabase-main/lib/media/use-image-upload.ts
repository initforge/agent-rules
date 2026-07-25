import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/utils';
import { txt } from '@/lib/text';
import { uploadImage, type UploadImageOptions } from './upload-image';
import type { ImageUploadResult } from './types';

export interface UseImageUploadReturn {
  upload: (file: File, options?: UploadImageOptions) => Promise<ImageUploadResult | null>;
  isUploading: boolean;
  error: string | null;
}

/** Hook wrapping `uploadImage` with loading state and error toast */
export function useImageUpload(): UseImageUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File, options?: UploadImageOptions): Promise<ImageUploadResult | null> => {
      setIsUploading(true);
      setError(null);
      try {
        const result = await uploadImage(file, options);
        return result;
      } catch (err: unknown) {
        const message = getErrorMessage(err);
        setError(message);
        toast.error(txt('media.uploadError', { message }));
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [],
  );

  return { upload, isUploading, error };
}
