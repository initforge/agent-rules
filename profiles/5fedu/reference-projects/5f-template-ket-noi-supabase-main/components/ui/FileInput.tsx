import React, { useId, useRef, useCallback, useState } from 'react';
import { FileUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FileInputProps {
  label?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /** accept HTML, ví dụ ".pdf,.doc,.docx" hoặc "application/pdf" */
  accept?: string;
  multiple?: boolean;
  maxSizeMB?: number;
  name?: string;
  /** Danh sách file đã chọn (controlled) — nếu không truyền, component tự giữ state nội bộ */
  value?: File[];
  onChange?: (files: File[]) => void;
  placeholder?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Upload tệp không phải ảnh — kéo thả hoặc bấm chọn.
 */
const FileInput: React.FC<FileInputProps> = ({
  label,
  error,
  required,
  disabled,
  className,
  accept,
  multiple = false,
  maxSizeMB = 20,
  name,
  value: controlled,
  onChange,
  placeholder = 'Kéo thả tệp vào đây hoặc bấm để chọn',
}) => {
  const autoId = useId();
  const inputId = `file-${autoId.replace(/:/g, '')}`;
  const errorId = error ? `${inputId}-err` : undefined;
  const inputRef = useRef<HTMLInputElement>(null);
  const [internal, setInternal] = useState<File[]>([]);
  const files = controlled ?? internal;
  const setFiles = useCallback(
    (next: File[]) => {
      if (controlled === undefined) setInternal(next);
      onChange?.(next);
    },
    [controlled, onChange]
  );

  const [dragOver, setDragOver] = useState(false);

  const validateAndSet = useCallback(
    (list: FileList | null) => {
      if (!list?.length) return;
      const arr = Array.from(list);
      const maxBytes = maxSizeMB * 1024 * 1024;
      const ok = arr.filter((f) => f.size <= maxBytes);
      if (ok.length < arr.length) {
        // Có thể báo toast ở ngoài; ở đây chỉ lấy file hợp lệ
      }
      setFiles(multiple ? ok : ok.slice(0, 1));
    },
    [maxSizeMB, multiple, setFiles]
  );

  const clearOne = (idx: number) => {
    const next = files.filter((_, i) => i !== idx);
    setFiles(next);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium leading-none mb-1.5 flex items-center gap-1.5 text-foreground"
        >
          <FileUp className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
          {label}
          {required && <span className="text-destructive" aria-hidden>*</span>}
        </label>
      )}
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          validateAndSet(e.dataTransfer.files);
        }}
        className={cn(
          'rounded-lg border border-dashed px-4 py-6 text-center text-sm transition-colors cursor-pointer',
          'border-border bg-muted/20 hover:bg-muted/40',
          dragOver && 'border-primary bg-primary/5',
          disabled && 'opacity-50 cursor-not-allowed',
          error && 'border-destructive'
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          onChange={(e) => validateAndSet(e.target.files)}
        />
        <p className="text-muted-foreground">{placeholder}</p>
        <p className="text-xs text-muted-foreground mt-1">Tối đa {maxSizeMB} MB / tệp</p>
      </div>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5">
              <span className="truncate min-w-0">{f.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(f.size)}</span>
              {!disabled && (
                <button
                  type="button"
                  className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground"
                  aria-label={`Xóa ${f.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    clearOne(i);
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive mt-1">
          {error}
        </p>
      )}
    </div>
  );
};

export default FileInput;
