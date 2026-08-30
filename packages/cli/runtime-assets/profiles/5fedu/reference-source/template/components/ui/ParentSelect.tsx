import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { getDescendantIds } from '@/lib/tree-utils';
import type { GetIdFn, GetParentIdFn } from '@/lib/tree-utils';
import Combobox, { type Option } from './Combobox';

export interface ParentSelectOption<T> {
  value: string;
  label: string;
  level: number;
  /** Item gốc (để custom render nếu cần) */
  item: T;
}

export interface ParentSelectProps<T> {
  /** Toàn bộ items (cây) để chọn làm cha */
  items: T[];
  value: string;
  onChange: (value: string) => void;
  /** Id node đang sửa — sẽ loại trừ chính nó và mọi con cháu khỏi options */
  excludeId?: string | null;
  getId: GetIdFn<T>;
  getParentId: GetParentIdFn<T>;
  /** Level/cấp (1 = root) để indent option */
  getLevel: (item: T) => number;
  getOptionLabel: (item: T) => string;
  label?: string;
  /** Icon hiển thị cạnh label (chuẩn generic form) */
  icon?: React.ReactNode;
  /** Text option "Không có" / "None" */
  placeholder?: string;
  /** Hint nhỏ dưới field */
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /** Gắn vào form HTML (kèm input hidden khi cần submit native) */
  name?: string;
}

const INDENT_CHAR = '\u00A0';
const INDENT_PER_LEVEL = 3;
const PREFIX_CHILD = '└─ ';

function formatParentOptionLabel(level: number, text: string): string {
  const indent = Array(level - 1)
    .fill(INDENT_CHAR.repeat(INDENT_PER_LEVEL))
    .join('');
  const prefix = level > 1 ? PREFIX_CHILD : '';
  return indent + prefix + text;
}

/**
 * Chọn "cha" cho entity dạng cây (Combobox). Option có indent theo level,
 * tự loại trừ bản thân và con cháu (tránh vòng).
 */
function ParentSelect<T>({
  items,
  value,
  onChange,
  excludeId,
  getId,
  getParentId,
  getLevel,
  getOptionLabel,
  label,
  icon,
  placeholder = '',
  hint,
  error,
  required,
  disabled,
  className,
  name,
}: ParentSelectProps<T>) {
  const validOptions = useMemo(() => {
    const excluded = new Set<string>();
    if (excludeId) {
      excluded.add(excludeId);
      const descendantIds = getDescendantIds(excludeId, items, { getId, getParentId });
      descendantIds.forEach((id) => excluded.add(id));
    }
    return items
      .filter((item) => !excluded.has(getId(item)))
      .map((item) => ({
        value: getId(item),
        label: getOptionLabel(item),
        level: getLevel(item),
        item,
      }));
  }, [items, excludeId, getId, getParentId, getLevel, getOptionLabel]);

  const comboboxOptions: Option[] = useMemo(() => {
    const head: Option[] = [{ value: '', label: placeholder || '—' }];
    const rest = validOptions.map((opt) => ({
      value: opt.value,
      label: formatParentOptionLabel(opt.level, opt.label),
    }));
    return [...head, ...rest];
  }, [placeholder, validOptions]);

  return (
    <div className={cn('w-full', className)}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <Combobox
        label={label}
        icon={icon}
        required={required}
        options={comboboxOptions}
        value={value}
        onChange={(v) => onChange(v === '' || v === null || v === undefined ? '' : String(v))}
        error={error}
        disabled={disabled}
        searchable={validOptions.length > 6}
        clearable={false}
        dropdownInPortal
        placeholder={placeholder || '—'}
        className="w-full"
      />
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

export { ParentSelect };
export default ParentSelect;
