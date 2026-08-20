/**
 * Quy chuẩn filter chip: chỉ hiện option có dữ liệu (count > 0), hoặc option đang được chọn (để user có thể bỏ chọn).
 * Dùng cho FilterChipMultiSelect (desktop) và MobileFilterSheet (mobile).
 */
export interface OptionWithCount {
  value: string;
  count?: number;
  [key: string]: unknown;
}

/**
 * Lọc options: giữ lại option có count > 0 HOẶC đang nằm trong selectedValues.
 * Option không có count (count === undefined) luôn giữ lại.
 */
export function filterOptionsWithCount<T extends OptionWithCount>(
  options: T[],
  selectedValues: string[],
): T[] {
  return options.filter((o) => {
    if (o.count === undefined) return true;
    return o.count > 0 || selectedValues.includes(o.value);
  });
}
