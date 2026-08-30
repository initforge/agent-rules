/**
 * Utilities chuẩn hóa tìm kiếm trên list view.
 * Dùng chung cho mọi module: tìm trên tất cả cột hiển thị + trường liên kết (enriched).
 */

/**
 * Chuẩn hóa giá trị từ item thành chuỗi để so khớp tìm kiếm.
 * null/undefined → '', number/boolean → string, Date/string ISO → string.
 * object/array bỏ qua (trả về '').
 */
function valueToSearchString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return '';
  return String(value);
}

/**
 * Lấy chuỗi gộp từ item theo danh sách key, dùng để so khớp với searchTerm.
 * Mỗi key lấy item[key], chuẩn hóa thành chuỗi, nối bằng khoảng trắng, lowercase.
 *
 * @param item - Một bản ghi (row) trong list
 * @param keys - Các key cần search (id cột + trường enriched: ten_xxx, trang_thai_text...)
 */
export function getSearchableText(
  item: Record<string, unknown>,
  keys: string[]
): string {
  const parts: string[] = [];
  for (const key of keys) {
    const raw = item[key];
    const s = valueToSearchString(raw);
    if (s) parts.push(s);
  }
  return parts.join(' ').toLowerCase();
}

/**
 * Kiểm tra item có khớp searchTerm khi tìm trong các trường keys hay không.
 * searchTerm rỗng (sau trim) → luôn khớp (true).
 *
 * @param item - Một bản ghi trong list
 * @param searchTerm - Chuỗi người dùng nhập
 * @param keys - Các key cần search (id cột + trường liên kết)
 */
export function matchesSearchTerm(
  item: Record<string, unknown>,
  searchTerm: string,
  keys: string[]
): boolean {
  const term = searchTerm.trim();
  if (!term) return true;
  const searchable = getSearchableText(item, keys);
  return searchable.includes(term.toLowerCase());
}
