import React from 'react';
import MultiSelect from '@/components/ui/MultiSelect';
import type { Option } from '@/components/ui/MultiSelect';

/**
 * Filter chip single-select: một giá trị hoặc "tất cả" (placeholder).
 * Quy chuẩn giống FilterChipMultiSelect: dropdown có "Chọn tất cả" + "Xóa chọn" (MultiSelect).
 * Dùng cho: Trạng thái (Active/Inactive), Phòng ban (root), v.v.
 */
interface FilterChipSingleSelectProps {
  options: Option[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder: string;
  icon?: React.ElementType;
  className?: string;
}

const FilterChipSingleSelect: React.FC<FilterChipSingleSelectProps> = ({
  options,
  value,
  onChange,
  placeholder,
  icon,
  className = 'w-full sm:w-[150px]',
}) => {
  const multiValue = value ? [value] : [];

  const handleChange = (val: string[]) => {
    if (val.length === 0) {
      onChange(null);
      return;
    }
    if (val.length === 1) {
      onChange(val[0]);
      return;
    }
    // Nhiều lựa chọn (toggle từ option khác): giữ option vừa chọn
    const newlyPicked = val.find((v) => v !== value);
    onChange((newlyPicked ?? val[0]) || null);
  };

  return (
    <MultiSelect
      options={options}
      value={multiValue}
      onChange={handleChange}
      icon={icon}
      placeholder={placeholder}
      className={className}
    />
  );
};

export default FilterChipSingleSelect;
