export interface ImportColumnDef {
  key: string;
  label: string;
  required?: boolean;
}

export interface ImportRowError {
  /** Excel row number (1-based; row 1 = header) */
  rowNumber: number;
  message: string;
  data: Record<string, unknown>;
}

export interface ImportResult {
  created: number;
  failed: ImportRowError[];
  clientErrors?: ImportRowError[];
}

export interface ImportLookupSheet {
  /** Excel sheet name — no diacritics, max 31 chars */
  sheetName: string;
  title: string;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
  /** Import column keys that reference this lookup sheet */
  mapsToImportKeys?: string[];
}

export interface ImportBatchRow {
  rowNumber: number;
  data: Record<string, unknown>;
}

export interface ImportMutationInput {
  rows: ImportBatchRow[];
  onProgress?: (done: number, total: number) => void;
}
