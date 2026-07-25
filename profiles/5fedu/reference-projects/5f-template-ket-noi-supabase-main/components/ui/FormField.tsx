
import React from 'react';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  label?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  /** Mô tả phụ dưới label */
  description?: string;
}

/**
 * FormField – wrapper chuẩn hoá label + error + description cho mọi trường form.
 * Dùng khi cần bọc component không có sẵn label (raw textarea, input đặc biệt…).
 */
const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  required,
  children,
  className,
  description,
}) => {
  return (
    <div className={cn('w-full space-y-1.5', className)}>
      {label && (
        <label className="text-sm font-medium leading-none text-foreground block">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {children}
      {error && <p className="text-xs font-medium text-destructive mt-1 ml-1">{error}</p>}
    </div>
  );
};

export default FormField;
