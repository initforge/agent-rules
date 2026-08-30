import dayjs from 'dayjs';
import { txt } from '@/lib/text';
import type { ImportColumnDef, ImportRowError } from './types';

export interface BuildErrorWorkbookOptions {
  columns: ImportColumnDef[];
  errors: ImportRowError[];
  fileName: string;
}

/** Build and download an Excel file of failed import rows. */
export async function buildErrorWorkbook(options: BuildErrorWorkbookOptions): Promise<void> {
  const mod = await import('xlsx');
  const XLSX = mod.default ?? mod;
  const { columns, errors, fileName } = options;

  const header = [
    txt('shared.import.errorColRow'),
    ...columns.map((c) => c.label),
    txt('shared.import.errorColMessage'),
  ];

  const dataRows = errors.map((err) => [
    err.rowNumber,
    ...columns.map((c) => err.data[c.key] ?? ''),
    err.message,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Loi');

  const timestamp = dayjs().format('YYYYMMDD_HHmm');
  XLSX.writeFile(wb, `${fileName}_Loi_${timestamp}.xlsx`);
}
