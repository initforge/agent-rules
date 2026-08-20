import React from 'react';
import type { DataTypeId } from '@/lib/data-types';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import NumericFormatInput from '@/components/ui/NumericFormatInput';
import CurrencyInput from '@/components/ui/CurrencyInput';
import PercentInput from '@/components/ui/PercentInput';
import DatePicker from '@/components/ui/DatePicker';
import TimeInput from '@/components/ui/TimeInput';
import DateTimeInput from '@/components/ui/DateTimeInput';
import MonthYearPicker from '@/components/ui/MonthYearPicker';
import EmailInput from '@/components/ui/EmailInput';
import PhoneInput from '@/components/ui/PhoneInput';
import UrlInput from '@/components/ui/UrlInput';
import FileInput from '@/components/ui/FileInput';
import ColorPickerInput from '@/components/ui/ColorPickerInput';
import Combobox, { type Option } from '@/components/ui/Combobox';
import MultiSelect from '@/components/ui/MultiSelect';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import SingleImageInput from '@/components/ui/SingleImageInput';
import MultiImageInput, { type ImageItem } from '@/components/ui/MultiImageInput';
import { CLOUDINARY_FOLDERS } from '@/lib/media/cloudinary-folders';
import AsyncCombobox from '@/components/ui/AsyncCombobox';

export interface DataFieldProps {
  dataType: DataTypeId;
  label?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  name?: string;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Gợi ý trong ô (text, email, phone, url, …) */
  placeholder?: string;
  /** Icon cạnh label — component con (`Input`, `EmailInput`, …) đã hỗ trợ */
  icon?: React.ReactNode;
  /** enum, ref, enum_list */
  options?: Option[];
  /** ref bất đồng bộ */
  loadOptions?: (query: string) => Promise<Option[]>;
  /** FileInput */
  accept?: string;
  multiple?: boolean;
  maxSizeMB?: number;
  /** MonthYear: chỉ năm */
  yearOnly?: boolean;
}

/**
 * Ánh xạ `DataTypeId` → component form tương ứng (form controlled đơn giản).
 * Các kiểu cần cấu hình thêm (date_range, show, app_link, audit, lat_long đặc thù, …) nên dùng trực tiếp component module.
 */
const DataField: React.FC<DataFieldProps> = ({
  dataType,
  label,
  error,
  required,
  disabled,
  className,
  name,
  value,
  onChange,
  placeholder,
  icon,
  options = [],
  loadOptions,
  accept,
  multiple,
  maxSizeMB,
  yearOnly,
}) => {
  const vStr = typeof value === 'string' ? value : value == null ? '' : String(value);
  const vNum = typeof value === 'number' ? value : Number(value);
  const vBool = Boolean(value);
  const vArrStr = Array.isArray(value) ? (value as string[]) : [];

  switch (dataType) {
    case 'text':
    case 'name':
    case 'duration':
    case 'progress':
    case 'lat_long':
    case 'video':
      return (
        <Input
          label={label}
          error={error}
          required={required}
          disabled={disabled}
          className={className}
          name={name}
          value={vStr}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          icon={icon}
        />
      );
    case 'long_text':
    case 'address':
      return (
        <Textarea
          label={label}
          error={error}
          required={required}
          disabled={disabled}
          className={className}
          name={name}
          value={vStr}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'number':
      return (
        <NumericFormatInput
          label={label}
          error={error}
          required={required}
          disabled={disabled}
          className={className}
          name={name}
          value={Number.isFinite(vNum) ? vNum : 0}
          onChange={(n) => onChange(n)}
          decimalScale={0}
        />
      );
    case 'decimal':
      return (
        <NumericFormatInput
          label={label}
          error={error}
          required={required}
          disabled={disabled}
          className={className}
          name={name}
          value={Number.isFinite(vNum) ? vNum : 0}
          onChange={(n) => onChange(n)}
          decimalScale={4}
        />
      );
    case 'percent':
      return (
        <PercentInput
          label={label}
          error={error}
          required={required}
          disabled={disabled}
          className={className}
          name={name}
          value={Number.isFinite(vNum) ? vNum : 0}
          onChange={(n) => onChange(n)}
        />
      );
    case 'currency':
      return (
        <CurrencyInput
          label={label}
          error={error}
          required={required}
          disabled={disabled}
          className={className}
          name={name}
          value={Number.isFinite(vNum) ? vNum : 0}
          onChange={(n) => onChange(n)}
        />
      );
    case 'date':
      return (
        <DatePicker
          label={label}
          error={error}
          required={required}
          disabled={disabled}
          className={className}
          name={name}
          value={vStr}
          onChange={(s) => onChange(s)}
        />
      );
    case 'time':
      return (
        <TimeInput
          label={label}
          error={error}
          required={required}
          disabled={disabled}
          className={className}
          name={name}
          value={vStr}
          onChange={(s) => onChange(s)}
        />
      );
    case 'datetime':
      return (
        <DateTimeInput
          label={label}
          error={error}
          required={required}
          disabled={disabled}
          className={className}
          name={name}
          value={vStr}
          onChange={(s) => onChange(s)}
        />
      );
    case 'month_year':
      return (
        <MonthYearPicker
          label={label}
          error={error}
          required={required}
          disabled={disabled}
          className={className}
          name={name}
          value={vStr}
          onChange={(s) => onChange(s)}
          yearOnly={yearOnly}
        />
      );
    case 'email':
      return (
        <EmailInput
          label={label}
          error={error}
          required={required}
          disabled={disabled}
          className={className}
          name={name}
          value={vStr}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          icon={icon}
        />
      );
    case 'phone':
      return (
        <PhoneInput
          label={label}
          error={error}
          required={required}
          disabled={disabled}
          className={className}
          name={name}
          value={vStr}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          icon={icon}
        />
      );
    case 'url':
      return (
        <UrlInput
          label={label}
          error={error}
          required={required}
          disabled={disabled}
          className={className}
          name={name}
          value={vStr}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          icon={icon}
        />
      );
    case 'file':
      return (
        <FileInput
          label={label}
          error={error}
          required={required}
          disabled={disabled}
          className={className}
          name={name}
          accept={accept}
          multiple={multiple}
          maxSizeMB={maxSizeMB}
          value={Array.isArray(value) ? (value as File[]) : []}
          onChange={(files) => onChange(files)}
        />
      );
    case 'color':
      return (
        <ColorPickerInput
          label={label}
          error={error}
          required={required}
          disabled={disabled}
          className={className}
          name={name}
          value={vStr || '#000000'}
          onChange={(s) => onChange(s)}
        />
      );
    case 'enum':
      if (loadOptions) {
        return (
          <AsyncCombobox
            label={label}
            error={error}
            required={required}
            disabled={disabled}
            className={className}
            name={name}
            loadOptions={loadOptions}
            value={value as string | number | null}
            onChange={(v) => onChange(v)}
          />
        );
      }
      return (
        <Combobox
          label={label}
          error={error}
          required={required}
          disabled={disabled}
          className={className}
          options={options}
          value={(value as string | number | null) ?? ''}
          onChange={(v) => onChange(v)}
        />
      );
    case 'enum_list':
      return (
        <div className={className}>
          <MultiSelect
            label={label}
            options={options.map((o) => ({ label: o.label, value: String(o.value) }))}
            value={vArrStr}
            onChange={(ids) => onChange(ids)}
          />
          {error && <p className="text-xs text-destructive mt-1">{error}</p>}
        </div>
      );
    case 'ref':
      if (loadOptions) {
        return (
          <AsyncCombobox
            label={label}
            error={error}
            required={required}
            disabled={disabled}
            className={className}
            loadOptions={loadOptions}
            value={value as string | number | null}
            onChange={(v) => onChange(v)}
          />
        );
      }
      return (
        <Combobox
          label={label}
          error={error}
          required={required}
          disabled={disabled}
          className={className}
          options={options}
          value={(value as string | number | null) ?? ''}
          onChange={(v) => onChange(v)}
        />
      );
    case 'yes_no':
      return (
        <div className={className}>
          <ToggleSwitch
            label={label ?? ' '}
            checked={vBool}
            onChange={(c) => onChange(c)}
            disabled={disabled}
          />
          {error && <p className="text-xs text-destructive mt-1">{error}</p>}
        </div>
      );
    case 'image':
    case 'signature':
      return (
        <SingleImageInput
          label={label}
          error={error}
          required={required}
          disabled={disabled}
          className={className}
          value={(value as string | null) ?? null}
          onChange={(v) => onChange(v)}
          uploadContext={{ folder: CLOUDINARY_FOLDERS.generalUpload }}
        />
      );
    case 'multi_image':
      return (
        <MultiImageInput
          label={label}
          error={error}
          required={required}
          disabled={disabled}
          className={className}
          value={Array.isArray(value) ? (value as ImageItem[]) : []}
          onChange={(v) => onChange(v)}
          uploadContext={{ folder: CLOUDINARY_FOLDERS.generalUpload }}
        />
      );
    case 'date_range':
    case 'show':
    case 'app_link':
    case 'change_counter':
    case 'change_timestamp':
    case 'change_location':
      return (
        <p className="text-xs text-muted-foreground">
          Kiểu «{dataType}» cần cấu hình riêng — xem registry và component trực tiếp.
        </p>
      );
    default: {
      const _exhaustive: never = dataType;
      return _exhaustive;
    }
  }
};

export default DataField;
