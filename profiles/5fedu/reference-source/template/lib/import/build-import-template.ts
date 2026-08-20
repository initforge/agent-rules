import { txt } from '@/lib/text';
import type { ImportColumnDef, ImportLookupSheet } from './types';

export interface BuildImportTemplateOptions {
  columns: ImportColumnDef[];
  lookupSheets?: ImportLookupSheet[];
  fileName: string;
}

function buildGuideRows(
  columns: ImportColumnDef[],
  lookupSheets: ImportLookupSheet[],
): string[][] {
  const rows: string[][] = [
    [txt('shared.import.templateGuideTitle')],
    [''],
    [txt('shared.import.templateGuideIntro')],
    [''],
    [txt('shared.import.templateGuideRequired')],
    ...columns
      .filter((c) => c.required)
      .map((c) => [`  • ${c.label} (*)`]),
    [''],
    [txt('shared.import.templateGuideDataSheet')],
    [''],
  ];

  if (lookupSheets.length > 0) {
    rows.push([txt('shared.import.templateGuideLookup')]);
    for (const sheet of lookupSheets) {
      const mappedKeys = sheet.mapsToImportKeys ?? [];
      const mappedLabels = mappedKeys
        .map((key) => columns.find((c) => c.key === key)?.label ?? key)
        .join(', ');
      rows.push([
        `  • ${sheet.title} (sheet "${sheet.sheetName}")${mappedLabels ? ` → ${mappedLabels}` : ''}`,
      ]);
    }
  }

  return rows;
}

function appendLookupSheet(
  wb: { Sheets: Record<string, unknown>; SheetNames: string[] },
  XLSX: {
    utils: {
      aoa_to_sheet: (data: unknown[][]) => unknown;
      book_append_sheet: (wb: unknown, ws: unknown, name: string) => void;
    };
  },
  sheet: ImportLookupSheet,
): void {
  const header = sheet.columns.map((c) => c.label);
  const dataRows = sheet.rows.map((row) =>
    sheet.columns.map((c) => row[c.key] ?? ''),
  );
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  XLSX.utils.book_append_sheet(wb, ws, sheet.sheetName.slice(0, 31));
}

/** Build and download a multi-sheet import template (.xlsx). */
export async function buildImportTemplate(options: BuildImportTemplateOptions): Promise<void> {
  const mod = await import('xlsx');
  const XLSX = mod.default ?? mod;
  const { columns, lookupSheets = [], fileName } = options;

  const wb = XLSX.utils.book_new();

  const dataHeader = columns.map((c) => (c.required ? `${c.label} (*)` : c.label));
  const hintRow = columns.map((c) =>
    c.required ? txt('shared.import.templateRequiredHint') : '',
  );
  const dataWs = XLSX.utils.aoa_to_sheet([dataHeader, hintRow]);
  XLSX.utils.book_append_sheet(wb, dataWs, 'Du_lieu');

  const guideWs = XLSX.utils.aoa_to_sheet(buildGuideRows(columns, lookupSheets));
  XLSX.utils.book_append_sheet(wb, guideWs, 'Huong_dan');

  for (const sheet of lookupSheets) {
    appendLookupSheet(wb, XLSX, sheet);
  }

  XLSX.writeFile(wb, `${fileName}.xlsx`);
}
