/** Thay {{name}} trong chuỗi (chuẩn cũ từ JSON). */
export function fmt(template: string, vars: Record<string, string | number | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const v = vars[name];
    return v != null ? String(v) : '';
  });
}
