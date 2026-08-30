import React, { useState, useRef, useCallback } from 'react';
import { ImagePlus, Trash2, Camera, Image, Loader2, Pencil, Link2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactDOM from 'react-dom';
import { cn } from '@/lib/utils';
import { txt } from '@/lib/text';
import { getMediaConfigSafe } from '@/lib/media/config';
import { isHttpImageUrl } from '@/lib/media/image-url';
import { useImageUpload } from '@/lib/media/use-image-upload';
import type { ImageUploadContext } from '@/lib/media/types';
import Input from './Input';

export interface SingleImageInputProps {
  label?: string;
  icon?: React.ReactNode;
  required?: boolean;
  error?: string;
  /** base64 hoặc URL */
  value?: string | null;
  onChange: (value: string | null) => void;
  /** MIME types cho input file, default: "image/*" */
  accept?: string;
  /** Giới hạn dung lượng (MB), default: 2 */
  maxSizeMB?: number;
  /** Text placeholder khi chưa có ảnh */
  placeholder?: string;
  /** Text gợi ý dưới placeholder */
  hint?: string;
  /** Hình dạng khung preview */
  shape?: 'square' | 'rounded' | 'circle';
  /** Tỉ lệ khung hình, vd "1/1", "3/4", "16/9" */
  aspectRatio?: string;
  className?: string;
  disabled?: boolean;
  /** Hiện ô nhập URL ảnh (dán link) */
  allowUrlInput?: boolean;
  /** Cloudinary folder/tags khi upload */
  uploadContext?: ImageUploadContext;
  /** Override provider: true = cloudinary, false = local base64 */
  useCloudUpload?: boolean;
}

const SingleImageInput: React.FC<SingleImageInputProps> = ({
  label,
  icon,
  required,
  error,
  value,
  onChange,
  accept = 'image/*',
  maxSizeMB = 2,
  placeholder = 'Kéo thả, dán (Ctrl+V) hoặc nhấn để chọn',
  hint,
  shape = 'rounded',
  aspectRatio = '1/1',
  className,
  disabled = false,
  allowUrlInput = false,
  uploadContext,
  useCloudUpload,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sizeError, setSizeError] = useState('');
  const [urlError, setUrlError] = useState('');
  const [urlDraft, setUrlDraft] = useState('');
  const [urlTouched, setUrlTouched] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const { upload, isUploading } = useImageUpload();

  const defaultHint = txt('media.defaultHint', { maxSizeMB });

  const shapeClass = shape === 'circle'
    ? 'rounded-full'
    : shape === 'rounded'
      ? 'rounded-xl'
      : 'rounded-lg';

  const resolveProvider = useCallback((): 'local' | 'cloudinary' => {
    if (useCloudUpload === true) return 'cloudinary';
    if (useCloudUpload === false) return 'local';
    return getMediaConfigSafe().provider;
  }, [useCloudUpload]);

  const urlInputValue =
    urlTouched
      ? urlDraft
      : (value && isHttpImageUrl(value) ? value : urlDraft);

  const processFile = useCallback(async (file: File) => {
    setSizeError('');
    setUrlError('');
    if (!file.type.startsWith('image/')) {
      setSizeError(txt('media.notImageFile'));
      return;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      setSizeError(txt('media.sizeExceeded', { maxSizeMB }));
      return;
    }

    const provider = resolveProvider();
    if (provider === 'cloudinary') {
      setIsLoading(true);
      const result = await upload(file, { context: uploadContext, provider: 'cloudinary' });
      setIsLoading(false);
      if (result) {
        onChange(result.url);
        if (allowUrlInput) {
          setUrlDraft(result.url);
          setUrlTouched(false);
        }
      }
      return;
    }

    setIsLoading(true);
    const result = await upload(file, { provider: 'local' });
    setIsLoading(false);
    if (result) onChange(result.url);
  }, [allowUrlInput, maxSizeMB, onChange, resolveProvider, upload, uploadContext]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
    e.target.value = '';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items?.length) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (disabled) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) void processFile(file);
          return;
        }
      }
    },
    [disabled, processFile]
  );

  const handleRemove = () => {
    onChange(null);
    setSizeError('');
    setUrlError('');
    setUrlDraft('');
    setUrlTouched(false);
  };

  const openPicker = () => {
    if (!disabled) setShowPicker(true);
  };

  const chooseGallery = () => {
    setShowPicker(false);
    setTimeout(() => galleryRef.current?.click(), 100);
  };

  const chooseCamera = () => {
    setShowPicker(false);
    setTimeout(() => cameraRef.current?.click(), 100);
  };

  const applyUrl = useCallback((raw: string) => {
    const trimmed = raw.trim();
    setUrlError('');
    if (!trimmed) {
      onChange(null);
      setUrlTouched(false);
      setUrlDraft('');
      return;
    }
    if (!isHttpImageUrl(trimmed)) {
      setUrlError(txt('media.urlInvalid'));
      return;
    }
    const img = new Image();
    img.onload = () => {
      onChange(trimmed);
      setUrlError('');
      setUrlTouched(false);
      setUrlDraft(trimmed);
    };
    img.onerror = () => {
      setUrlError(txt('media.urlLoadError'));
    };
    img.src = trimmed;
  }, [onChange]);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrlTouched(true);
    setUrlDraft(e.target.value);
  };

  const handleUrlBlur = () => {
    if (!urlInputValue.trim()) {
      if (value && isHttpImageUrl(value)) onChange(null);
      setUrlTouched(false);
      setUrlDraft('');
      return;
    }
    applyUrl(urlInputValue);
  };

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyUrl(urlInputValue);
    }
  };

  const loading = isLoading || isUploading;
  const displayError = error || sizeError || urlError;

  return (
    <div className={cn('w-full', className)} onPaste={handlePaste}>
      {label && (
        <label className="text-sm font-medium leading-none mb-2 flex items-center gap-1.5 justify-center">
          {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      <input ref={galleryRef} type="file" accept={accept} className="hidden" onChange={handleFileChange} disabled={disabled} />
      <input ref={cameraRef} type="file" accept={accept} capture="environment" className="hidden" onChange={handleFileChange} disabled={disabled} />

      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        role={value ? undefined : 'button'}
        tabIndex={value || disabled ? -1 : 0}
        className={cn(
          'relative overflow-hidden border-2 transition-all duration-200 mx-auto',
          shapeClass,
          disabled && 'opacity-50 cursor-not-allowed',
          value ? 'border-transparent' : 'border-dashed cursor-pointer',
          !value && (
            isDragging
              ? 'border-primary bg-primary/5 scale-[1.01]'
              : displayError
                ? 'border-destructive/50 bg-destructive/5'
                : 'border-border hover:border-primary/40 bg-muted/30 hover:bg-muted/50'
          ),
        )}
        style={{ aspectRatio }}
        onClick={() => !value && openPicker()}
        onKeyDown={(e) => {
          if (value || disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPicker();
          }
        }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-muted/50"
            >
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </motion.div>
          ) : value ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0"
            >
              <img
                src={value}
                alt="Preview"
                className={cn('w-full h-full object-cover', shapeClass)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center"
            >
              <div className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center mb-1.5 transition-colors',
                isDragging ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              )}>
                <ImagePlus size={18} />
              </div>
              <p className={cn(
                'text-xs font-medium transition-colors leading-tight',
                isDragging ? 'text-primary' : 'text-muted-foreground'
              )}>
                {isDragging ? txt('media.dropHere') : placeholder}
              </p>
              <p className="text-xs text-muted-foreground/50 mt-0.5 leading-tight">
                {isDragging ? '' : (hint || defaultHint)}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {value && !disabled && (
        <div className="flex items-center justify-center gap-3 mt-2 whitespace-nowrap">
          <button
            type="button"
            onClick={openPicker}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors py-1"
          >
            <Pencil size={12} />
            {txt('media.changeImage')}
          </button>
          <span className="w-px h-3 bg-border" />
          <button
            type="button"
            onClick={handleRemove}
            className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:text-destructive/70 transition-colors py-1"
          >
            <Trash2 size={12} />
            {txt('media.removeImage')}
          </button>
        </div>
      )}

      {allowUrlInput && (
        <div className="mt-3">
          <Input
            label={txt('media.urlLabel')}
            placeholder={txt('media.urlPlaceholder')}
            icon={<Link2 className="w-4 h-4 text-muted-foreground" />}
            value={urlInputValue}
            onChange={handleUrlChange}
            onBlur={handleUrlBlur}
            onKeyDown={handleUrlKeyDown}
            disabled={disabled}
            error={urlError || undefined}
          />
        </div>
      )}

      {displayError && !allowUrlInput && (
        <p className="text-xs font-medium text-destructive mt-1.5 text-center">{displayError}</p>
      )}
      {displayError && allowUrlInput && !urlError && (
        <p className="text-xs font-medium text-destructive mt-1.5 text-center">{displayError}</p>
      )}

      {showPicker && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
          onClick={() => setShowPicker(false)}
          role="presentation"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 60 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full sm:w-auto sm:min-w-[280px] bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="px-5 pt-5 pb-3">
              <div className="w-8 h-1 rounded-full bg-border mx-auto mb-4 sm:hidden" />
              <p className="text-sm font-semibold text-foreground text-center">{txt('media.pickerTitle')}</p>
            </div>

            <div className="px-4 pb-2 space-y-1">
              <button
                type="button"
                onClick={chooseGallery}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left hover:bg-muted/60 active:bg-muted transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Image size={18} />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{txt('media.pickerGallery')}</p>
                  <p className="text-xs text-muted-foreground">{txt('media.pickerGalleryHint')}</p>
                </div>
              </button>
              <button
                type="button"
                onClick={chooseCamera}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left hover:bg-muted/60 active:bg-muted transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Camera size={18} />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{txt('media.pickerCamera')}</p>
                  <p className="text-xs text-muted-foreground">{txt('media.pickerCameraHint')}</p>
                </div>
              </button>
            </div>

            <div className="px-4 pb-4 pt-1">
              <button
                type="button"
                onClick={() => setShowPicker(false)}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted/60 active:bg-muted transition-colors"
              >
                {txt('media.pickerCancel')}
              </button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SingleImageInput;
