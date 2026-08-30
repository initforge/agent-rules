/** Media storage provider identifier */
export type MediaProviderId = 'local' | 'cloudinary';

/** Context passed when uploading an image (Cloudinary folder/tags) */
export interface ImageUploadContext {
  /** Cloudinary folder, e.g. `5f/company/logo` */
  folder?: string;
  /** Optional tags for Cloudinary asset management */
  tags?: string[];
}

/** Result of a successful image upload */
export interface ImageUploadResult {
  url: string;
  publicId?: string;
  width?: number;
  height?: number;
}

export interface MediaConfig {
  provider: MediaProviderId;
  cloudinary?: {
    cloudName: string;
    uploadPreset: string;
  };
}
