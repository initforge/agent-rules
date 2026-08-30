import { useState, useRef, useCallback, useMemo } from 'react';
import { txt } from '@/lib/text';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileSpreadsheet, X, AlertCircle, CheckCircle2, Download, ArrowRight, Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { cn, getErrorMessage } from '@/lib/utils';
import Combobox, { type Option } from '@/components/ui/Combobox';
import { DIALOG_SIZE } from '@/lib/dialog-sizes';
import {
  buildErrorWorkbook,
  buildImportTemplate,
  type ImportBatchRow,
  type ImportLookupSheet,
  type ImportResult,
  type ImportRowError,
} from '@/lib/import';

export interface ImportColumn {
  key: string;
  label: string;
  required?: boolean;
}

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  columns: ImportColumn[];
  onImport: (
    rows: ImportBatchRow[],
    ctx?: { onProgress?: (done: number, total: number) => void },
  ) => Promise<ImportResult>;
  templateFileName?: string;
  lookupSheets?: ImportLookupSheet[];
}

type Step = 'upload' | 'mapping' | 'importing' | 'result';

const MAX_VISIBLE_ERRORS = 20;

interface DialogResult {
  created: number;
  failed: ImportRowError[];
  clientErrors: ImportRowError[];
}

const ImportDialog: React.FC<ImportDialogProps> = ({
  open,
  onClose,
  columns,
  onImport,
  templateFileName = 'template',
  lookupSheets = [],
}) => {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [sheetData, setSheetData] = useState<unknown[][]>([]);
  const [dataStartRow, setDataStartRow] = useState(2);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<DialogResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mappingSelectOptions: Option[] = useMemo(
    () => [
      { value: '', label: txt('shared.import.skipColumn') },
      ...sheetHeaders.map((h) => ({ value: h, label: h })),
    ],
    [sheetHeaders],
  );

  const allErrors = useMemo(
    () => (result ? [...result.clientErrors, ...result.failed] : []),
    [result],
  );

  const reset = (): void => {
    setStep('upload');
    setFile(null);
    setSheetHeaders([]);
    setSheetData([]);
    setDataStartRow(2);
    setMapping({});
    setImporting(false);
    setProgress({ done: 0, total: 0 });
    setResult(null);
  };

  const handleClose = (): void => {
    reset();
    onClose();
  };

  const parseFile = useCallback(
    async (f: File) => {
      setFile(f);
      try {
        const mod = await import('xlsx');
        const XLSX = mod.default ?? mod;
        const buffer = await f.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames.includes('Du_lieu')
          ? 'Du_lieu'
          : workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

        if (json.length < 2) {
          setResult({ created: 0, failed: [], clientErrors: [{ rowNumber: 0, message: txt('shared.import.noDataOrHeader'), data: {} }] });
          setStep('result');
          return;
        }

        const headers = (json[0] as string[]).map((h) => String(h || '').trim().replace(/\s*\(\*\)\s*$/, ''));
        const dataStartIndex = json.length > 1 && isHintRow(json[1]) ? 2 : 1;
        setDataStartRow(dataStartIndex + 1);
        const data = json
          .slice(dataStartIndex)
          .filter((row) =>
            (row as unknown[]).some((cell) => cell !== null && cell !== undefined && cell !== ''),
          );
        setSheetHeaders(headers);
        setSheetData(data as unknown[][]);

        const autoMap: Record<string, string> = {};
        columns.forEach((col) => {
          const match = headers.find(
            (h) =>
              h.toLowerCase() === col.label.toLowerCase() ||
              h.toLowerCase().includes(col.label.toLowerCase()) ||
              col.label.toLowerCase().includes(h.toLowerCase()),
          );
          if (match) autoMap[col.key] = match;
        });
        setMapping(autoMap);
        setStep('mapping');
      } catch {
        setResult({
          created: 0,
          failed: [],
          clientErrors: [{ rowNumber: 0, message: txt('shared.import.cannotReadFile'), data: {} }],
        });
        setStep('result');
      }
    },
    [columns],
  );

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void parseFile(f);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0];
    if (f) void parseFile(f);
  };

  const handleImport = async (): Promise<void> => {
    setImporting(true);
    const clientErrors: ImportRowError[] = [];
    const parsed: { rowNumber: number; data: Record<string, unknown> }[] = [];

    const unmapped = columns.filter((c) => c.required && !mapping[c.key]);
    if (unmapped.length > 0) {
      setResult({
        created: 0,
        failed: [],
        clientErrors: [
          {
            rowNumber: 0,
            message: txt('shared.import.missingRequiredColumns', {
              columns: unmapped.map((c) => c.label).join(', '),
            }),
            data: {},
          },
        ],
      });
      setStep('result');
      setImporting(false);
      return;
    }

    sheetData.forEach((row, rowIdx) => {
      const excelRow = dataStartRow + rowIdx;
      const record: Record<string, unknown> = {};
      let hasError = false;

      columns.forEach((col) => {
        const headerName = mapping[col.key];
        if (!headerName) return;
        const colIdx = sheetHeaders.indexOf(headerName);
        if (colIdx === -1) return;
        const value = row[colIdx];

        if (col.required && (value === null || value === undefined || value === '')) {
          clientErrors.push({
            rowNumber: excelRow,
            message: txt('shared.import.rowEmptyField', { row: excelRow, column: col.label }),
            data: record,
          });
          hasError = true;
          return;
        }
        record[col.key] = value ?? '';
      });

      if (!hasError) {
        parsed.push({ rowNumber: excelRow, data: record });
      }
    });

    if (parsed.length === 0 && clientErrors.length > 0) {
      setResult({ created: 0, failed: [], clientErrors });
      setStep('result');
      setImporting(false);
      return;
    }

    setStep('importing');
    setProgress({ done: 0, total: parsed.length });

    try {
      const serverResult = await onImport(parsed, {
        onProgress: (done, total) => setProgress({ done, total }),
      });

      setResult({
        created: serverResult.created,
        failed: serverResult.failed,
        clientErrors,
      });
    } catch (err: unknown) {
      setResult({
        created: 0,
        failed: [],
        clientErrors: [
          ...clientErrors,
          { rowNumber: 0, message: getErrorMessage(err) || txt('shared.import.importError'), data: {} },
        ],
      });
    }

    setStep('result');
    setImporting(false);
  };

  const downloadTemplate = async (): Promise<void> => {
    await buildImportTemplate({
      columns,
      lookupSheets,
      fileName: templateFileName,
    });
  };

  const downloadErrorFile = async (): Promise<void> => {
    if (!result || allErrors.length === 0) return;
    await buildErrorWorkbook({
      columns,
      errors: allErrors.filter((e) => e.rowNumber > 0),
      fileName: templateFileName,
    });
  };

  if (!open) return null;

  const hasPartialSuccess = result && result.created > 0 && allErrors.length > 0;
  const hasFullSuccess = result && result.created > 0 && allErrors.length === 0;
  const hasOnlyErrors = result && result.created === 0 && allErrors.length > 0;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
        className="fixed inset-0 z-[60] bg-black/20"
      />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 30 }}
          className={cn(
            'w-full bg-card rounded-2xl shadow-2xl border border-border pointer-events-auto flex flex-col max-h-[85vh]',
            DIALOG_SIZE.LARGE,
          )}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Upload size={18} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{txt('shared.import.title')}</h3>
                <p className="text-xs text-muted-foreground">
                  {file ? file.name : txt('shared.import.subtitle')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
            <AnimatePresence mode="wait">
              {step === 'upload' && (
                <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                    onDrop={handleDrop}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    className={cn(
                      'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors',
                      dragOver
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50 hover:bg-muted/20',
                    )}
                  >
                    <FileSpreadsheet size={40} className="mx-auto text-primary/40 mb-3" />
                    <p className="text-sm font-medium text-foreground mb-1">{txt('shared.import.dropHere')}</p>
                    <p className="text-xs text-muted-foreground mb-4">{txt('shared.import.orClickToSelect')}</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => void downloadTemplate()}
                      className="text-xs text-primary hover:underline flex items-center gap-1.5"
                    >
                      <Download size={13} /> {txt('shared.import.downloadTemplate')}
                    </button>
                  </div>
                </motion.div>
              )}

              {step === 'mapping' && (
                <motion.div
                  key="mapping"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <p className="text-xs text-muted-foreground">
                    {txt('shared.import.rowsRead', { count: sheetData.length })}
                  </p>
                  <div className="border border-border rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/30 border-b border-border">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            {txt('shared.import.systemColumn')}
                          </th>
                          <th className="px-2 py-2 text-center w-8">
                            <ArrowRight size={12} className="mx-auto text-muted-foreground/50" />
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            {txt('shared.import.fileColumn')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50 [&>tr:last-child>td]:border-b [&>tr:last-child>td]:border-border/50">
                        {columns.map((col) => (
                          <tr key={col.key} className="hover:bg-muted/20">
                            <td className="px-3 py-2">
                              <span className="font-medium text-foreground">{col.label}</span>
                              {col.required && <span className="text-destructive ml-1">*</span>}
                            </td>
                            <td className="px-2 py-2 text-center">
                              <ArrowRight size={11} className="mx-auto text-muted-foreground/30" />
                            </td>
                            <td className="px-3 py-2 min-w-[8rem]">
                              <Combobox
                                options={mappingSelectOptions}
                                value={mapping[col.key] ?? ''}
                                onChange={(v) =>
                                  setMapping((prev) => ({
                                    ...prev,
                                    [col.key]: v === '' || v === null || v === undefined ? '' : String(v),
                                  }))
                                }
                                searchable={sheetHeaders.length > 8}
                                clearable={false}
                                dropdownInPortal
                                placeholder={txt('shared.import.skipColumn')}
                                className="w-full"
                                triggerClassName={cn(
                                  'h-7 min-h-7 text-xs py-0',
                                  mapping[col.key]
                                    ? 'border-primary/30 text-foreground'
                                    : 'border-border text-muted-foreground',
                                )}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {sheetData.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        {txt('shared.import.preview')}
                      </p>
                      <div className="border border-border rounded-lg overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-muted/20">
                              {sheetHeaders.map((h, i) => (
                                <th
                                  key={i}
                                  className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap border-b border-border"
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sheetData.slice(0, 5).map((row, ri) => (
                              <tr key={ri} className="border-b border-border/30">
                                {sheetHeaders.map((_, ci) => (
                                  <td
                                    key={ci}
                                    className="px-2 py-1.5 text-foreground whitespace-nowrap max-w-[150px] truncate"
                                  >
                                    {row[ci] ?? <span className="text-muted-foreground/40">--</span>}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {step === 'importing' && (
                <motion.div
                  key="importing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-10 space-y-4"
                >
                  <Loader2 size={40} className="mx-auto text-primary animate-spin" />
                  <p className="text-sm font-medium text-foreground">
                    {txt('shared.import.processing', {
                      done: progress.done,
                      total: progress.total,
                    })}
                  </p>
                  {progress.total > 0 && (
                    <div className="mx-auto max-w-xs h-2 rounded-lg bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                      />
                    </div>
                  )}
                </motion.div>
              )}

              {step === 'result' && result && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-6"
                >
                  {hasFullSuccess && (
                    <div className="space-y-3">
                      <CheckCircle2 size={48} className="mx-auto text-primary" />
                      <p className="text-sm font-semibold text-foreground">{txt('shared.import.success')}</p>
                      <p className="text-xs text-muted-foreground">
                        {txt('shared.import.successCount', { count: result.created })}
                      </p>
                    </div>
                  )}
                  {hasPartialSuccess && (
                    <div className="space-y-3">
                      <CheckCircle2 size={48} className="mx-auto text-primary" />
                      <p className="text-sm font-semibold text-foreground">
                        {txt('shared.import.partialSuccess')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {txt('shared.import.resultSummary', {
                          created: result.created,
                          failed: allErrors.length,
                        })}
                      </p>
                    </div>
                  )}
                  {hasOnlyErrors && (
                    <div className="space-y-3">
                      <AlertCircle size={48} className="mx-auto text-destructive" />
                      <p className="text-sm font-semibold text-foreground">{txt('shared.import.error')}</p>
                    </div>
                  )}
                  {allErrors.length > 0 && (
                    <div className="mt-4 text-left bg-destructive/5 border border-destructive/20 rounded-lg p-3 max-h-[150px] overflow-y-auto custom-scrollbar">
                      {allErrors.slice(0, MAX_VISIBLE_ERRORS).map((err, i) => (
                        <p key={i} className="text-xs text-destructive py-0.5">
                          {err.rowNumber > 0 ? `Dòng ${err.rowNumber}: ` : ''}
                          {err.message}
                        </p>
                      ))}
                      {allErrors.length > MAX_VISIBLE_ERRORS && (
                        <p className="text-xs text-destructive/80 pt-1">
                          {txt('shared.import.moreErrors', {
                            count: allErrors.length - MAX_VISIBLE_ERRORS,
                          })}
                        </p>
                      )}
                    </div>
                  )}
                  {allErrors.some((e) => e.rowNumber > 0) && (
                    <div className="mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void downloadErrorFile()}
                        className="text-xs h-8 gap-1.5"
                      >
                        <Download size={14} />
                        {txt('shared.import.downloadErrorFile')}
                      </Button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="px-5 py-3 border-t border-border flex items-center justify-between shrink-0">
            <Button variant="outline" onClick={handleClose} className="text-xs h-8">
              {step === 'result' ? txt('common.close') : txt('common.cancel')}
            </Button>
            <div className="flex gap-2">
              {step === 'mapping' && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStep('upload');
                      setFile(null);
                    }}
                    className="text-xs h-8"
                  >
                    {txt('common.selectFile')}
                  </Button>
                  <Button
                    onClick={() => void handleImport()}
                    disabled={importing}
                    className="bg-primary text-white text-xs h-8 px-4"
                  >
                    {importing ? txt('common.processing') : txt('shared.import.importRows', { count: sheetData.length })}
                  </Button>
                </>
              )}
              {step === 'result' && result && result.created > 0 && (
                <Button onClick={handleClose} className="bg-primary text-white text-xs h-8 px-4">
                  {txt('common.finish')}
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
};

function isHintRow(row: unknown): boolean {
  if (!Array.isArray(row)) return false;
  const cells = row as unknown[];
  if (cells.length === 0) return false;
  const first = String(cells[0] ?? '').toLowerCase();
  return first.includes('bắt buộc') || first.includes('bat buoc') || first === '(bắt buộc)';
}

export default ImportDialog;
