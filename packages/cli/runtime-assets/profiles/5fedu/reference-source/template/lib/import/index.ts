import type { ImportLookupSheet } from './types';

export type {
  ImportBatchRow,
  ImportColumnDef,
  ImportLookupSheet,
  ImportMutationInput,
  ImportResult,
  ImportRowError,
} from './types';

export { runImportBatch } from './run-import-batch';
export { buildImportTemplate } from './build-import-template';
export type { BuildImportTemplateOptions } from './build-import-template';
export { buildErrorWorkbook } from './build-error-workbook';
export type { BuildErrorWorkbookOptions } from './build-error-workbook';

/** Lookup sheet for trạng thái hoạt động (Active/Inactive). */
export function createTrangThaiLookupSheet(): ImportLookupSheet {
  return {
    sheetName: 'Trang_thai',
    title: 'Trạng thái hoạt động',
    columns: [{ key: 'trang_thai', label: 'Trạng thái' }],
    rows: [{ trang_thai: 'Đang hoạt động' }, { trang_thai: 'Ngừng hoạt động' }],
    mapsToImportKeys: ['trang_thai'],
  };
}
