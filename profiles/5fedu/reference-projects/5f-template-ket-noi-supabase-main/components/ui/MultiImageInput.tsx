import React, { useState, useRef, useCallback } from 'react';
import { ImagePlus, X, Plus, Loader2, ZoomIn, Link2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactDOM from 'react-dom';
import { cn } from '@/lib/utils';
import { txt } from '@/lib/text';
import { getMediaConfigSafe } from '@/lib/media/config';
import { isHttpImageUrl } from '@/lib/media/image-url';
import { useImageUpload } from '@/lib/media/use-image-upload';
import type { ImageUploadContext } from '@/lib/media/types';
import Input from './Input';
import Button from './Button';

export interface ImageItem {
  id: string;
  /** base64 hoặc URL */
  src: string;
  /** File gốc (local provider, chưa upload cloud) */
  file?: File;
  name?: string;
}

export interface MultiImageInputProps {
  label?: string;
  icon?: React.ReactNode;
  required?: boolean;
  error?: string;
  value?: ImageItem[];
  onChange: (images: ImageItem[]) => void;
  accept?: string;
  maxSizeMB?: number;
  /** Số ảnh tối đa, default: 10 */
  maxFiles?: number;
  placeholder?: string;
  hint?: string;
  /** Số cột grid, default: 4 */
  columns?: 2 | 3 | 4;
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

const uid = (): string => Math.random().toString(36).slice(2, 10);

const MultiImageInput: React.FC<MultiImageInputProps> = ({
  label,
  icon,
  required,
  error,
  value = [],
  onChange,
  accept = 'image/*',
  maxSizeMB = 2,
  maxFiles = 10,
  placeholder = 'Kéo thả ảnh vào đây',
  hint,
  columns = 4,
  aspectRatio = '1/1',
  className,
  disabled = false,
  allowUrlInput = false,
  uploadContext,
  useCloudUpload,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [loadingCount, setLoadingCount] = useState(0);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [urlError, setUrlError] = useState('');
  const [urlDraft, setUrlDraft] = useState('');
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const { upload } = useImageUpload();

  const defaultHint = txt('media.multiDefaultHint', { maxSizeMB });
  const remaining = maxFiles - value.length;
  const isFull = remaining <= 0;

  const colsClass =
    columns === 2
      ? 'grid-cols-2'
      : columns === 3
        ? 'grid-cols-2 sm:grid-cols-3'
        : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4';

  const resolveProvider = useCallback((): 'local' | 'cloudinary' => {
    if (useCloudUpload === true) return 'cloudinary';
    if (useCloudUpload === false) return 'local';
    return getMediaConfigSafe().provider;
  }, [useCloudUpload]);

  const appendItems = useCallback(
    (newItems: ImageItem[]) => {
      if (newItems.length === 0) return;
      onChange([...value, ...newItems]);
    },
    [onChange, value],
  );

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const errors: string[] = [];
      const validFiles: File[] = [];

      for (const file of fileArray) {
        if (!file.type.startsWith('image/')) {
          errors.push(txt('media.multiFileNotImage', { fileName: file.name }));
          continue;
        }
        if (file.size > maxSizeMB * 1024 * 1024) {
          errors.push(txt('media.multiFileSizeExceeded', { fileName: file.name, maxSizeMB }));
          continue;
        }
        validFiles.push(file);
      }

      const canAdd = maxFiles - value.length;
      if (validFiles.length > canAdd) {
        errors.push(txt('media.multiRemainingLimit', { count: canAdd }));
        validFiles.splice(canAdd);
      }

      setFileErrors(errors);
      if (validFiles.length === 0) return;

      setLoadingCount((c) => c + validFiles.length);
      const provider = resolveProvider();

      const uploaded = await Promise.all(
        validFiles.map(async (file) => {
          const result = await upload(file, { context: uploadContext, provider });
          if (!result) return null;
          return {
            id: uid(),
            src: result.url,
            file: provider === 'local' ? file : undefined,
            name: file.name,
          } satisfies ImageItem;
        }),
      );

      const newItems = uploaded.filter((item): item is ImageItem => item !== null);
      appendItems(newItems);
      setLoadingCount((c) => c - validFiles.length);
    },
    [appendItems, maxFiles, maxSizeMB, resolveProvider, upload, uploadContext, value.length],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.length) void processFiles(files);
    e.target.value = '';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items?.length) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    if (disabled || isFull) return;
    const files = e.dataTransfer.files;
    if (files?.length) void processFiles(files);
  };

  const handleRemove = (id: string) => {
    onChange(value.filter((img) => img.id !== id));
    setFileErrors([]);
    setUrlError('');
  };

  const addUrl = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      setUrlError('');

      if (!trimmed) return;

      if (isFull) {
        setUrlError(txt('media.multiMaxFilesReached'));
        return;
      }

      if (!isHttpImageUrl(trimmed)) {
        setUrlError(txt('media.urlInvalid'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        appendItems([
          {
            id: uid(),
            src: trimmed,
            name: trimmed,
          },
        ]);
        setUrlDraft('');
        setUrlError('');
      };
      img.onerror = () => {
        setUrlError(txt('media.urlLoadError'));
      };
      img.src = trimmed;
    },
    [appendItems, isFull],
  );

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addUrl(urlDraft);
    }
  };

  const displayError =
    error
    || urlError
    || (fileErrors.length > 0 ? fileErrors.join('; ') : '');
  const isLoading = loadingCount > 0;
  const hasImages = value.length > 0;

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="text-sm font-medium leading-none mb-2 flex items-center gap-1.5">
          {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      {hasImages && (
        <div className={cn('grid gap-2 mb-2', colsClass)}>
          <AnimatePresence mode="popLayout">
            {value.map((img) => (
              <motion.div
                key={img.id}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                className="relative group rounded-lg overflow-hidden border border-border bg-muted/30"
                style={{ aspectRatio }}
              >
                <img
                  src={img.src}
                  alt={img.name || 'Image'}
                  className="w-full h-full object-cover"
                />
                {!disabled && (
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreviewSrc(img.src)}
                      className="w-7 h-7 rounded-full bg-card/90 text-foreground flex items-center justify-center hover:bg-card transition-colors shadow-sm"
                      title={txt('media.multiViewLarge')}
                    >
                      <ZoomIn size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(img.id)}
                      className="w-7 h-7 rounded-full bg-card/90 text-destructive flex items-center justify-center hover:bg-card transition-colors shadow-sm"
                      title={txt('media.removeImage')}
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleRemove(img.id)}
                    className="sm:hidden absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center"
                    aria-label={txt('media.removeImage')}
                  >
                    <X size={12} />
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {!isFull && !disabled && (
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-muted/20 text-muted-foreground hover:border-primary/40 hover:bg-muted/40 hover:text-primary transition-all duration-200 cursor-pointer',
              )}
              style={{ aspectRatio }}
            >
              <Plus size={20} />
              <span className="text-xs font-medium">{txt('media.multiAdd')}</span>
            </motion.button>
          )}

          {isLoading && (
            <div
              className="flex items-center justify-center rounded-lg border-2 border-dashed border-primary/30 bg-primary/5"
              style={{ aspectRatio }}
            >
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          )}
        </div>
      )}

      {!hasImages && (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          className={cn(
            'relative overflow-hidden border-2 border-dashed rounded-lg transition-all duration-200 cursor-pointer',
            disabled && 'opacity-50 cursor-not-allowed',
            isDragging
              ? 'border-primary bg-primary/5 scale-[1.005]'
              : displayError
                ? 'border-destructive/50 bg-destructive/5'
                : 'border-border hover:border-primary/40 bg-muted/30 hover:bg-muted/50',
          )}
          onClick={() => !disabled && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <div className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center mb-2 transition-colors',
              isDragging ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            )}>
              <ImagePlus size={20} />
            </div>
            <p className={cn(
              'text-sm font-medium transition-colors',
              isDragging ? 'text-primary' : 'text-muted-foreground'
            )}>
              {isDragging ? txt('media.dropHere') : placeholder}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {isDragging ? '' : (hint || defaultHint)}
            </p>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled}
      />

      {allowUrlInput && !disabled && !isFull && (
        <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1 min-w-0">
            <Input
              label={txt('media.urlLabel')}
              placeholder={txt('media.urlPlaceholder')}
              icon={<Link2 className="w-4 h-4 text-muted-foreground" />}
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onKeyDown={handleUrlKeyDown}
              disabled={disabled}
              error={urlError || undefined}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="default"
            className="shrink-0 sm:mb-0.5"
            onClick={() => addUrl(urlDraft)}
            disabled={!urlDraft.trim()}
          >
            {txt('media.multiAddUrl')}
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between mt-1.5">
        {displayError && !allowUrlInput ? (
          <p className="text-sm font-medium text-destructive">{displayError}</p>
        ) : displayError && allowUrlInput && !urlError ? (
          <p className="text-sm font-medium text-destructive">{displayError}</p>
        ) : (
          <span />
        )}
        {maxFiles < Infinity && (
          <p className="text-xs text-muted-foreground">
            {txt('media.multiCount', { current: value.length, max: maxFiles })}
          </p>
        )}
      </div>

      {previewSrc && ReactDOM.createPortal(
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewSrc(null)}
          role="presentation"
        >
          <motion.img
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
            src={previewSrc}
            alt="Preview"
            className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setPreviewSrc(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 dark:bg-white/5 hover:bg-white/20 dark:hover:bg-white/10 text-white flex items-center justify-center transition-colors"
            aria-label={txt('common.close')}
          >
            <X size={20} />
          </button>
        </motion.div>,
        document.body
      )}
    </div>
  );
};

export default MultiImageInput;
