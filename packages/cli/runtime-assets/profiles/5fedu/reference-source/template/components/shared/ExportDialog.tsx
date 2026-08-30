import React, { useState } from 'react';
import { txt } from '@/lib/text';
import { motion } from 'framer-motion';
import { Download, X, FileSpreadsheet, FileText, Check } from 'lucide-react';
import Button from '@/components/ui/Button';
import { cn, getTodayISODate } from '@/lib/utils';
import { DIALOG_SIZE } from '@/lib/dialog-sizes';

export interface ExportColumn {
  key: string;
  label: string;
}

type ExportFormat = 'xlsx' | 'csv' | 'pdf';
type ExportScope = 'all' | 'page' | 'selected';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  columns: ExportColumn[];
  data: Record<string, unknown>[];
  selectedData?: Record<string, unknown>[];
  paginatedData?: Record<string, unknown>[];
  fileName: string;
  visibleColumnKeys?: string[];
}

const ExportDialog: React.FC<ExportDialogProps> = ({
  open, onClose, columns = [], data = [], selectedData = [], paginatedData = [], fileName, visibleColumnKeys
}) => {
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [scope, setScope] = useState<ExportScope>('all');
  const [selectedCols, setSelectedCols] = useState<Set<string>>(
    new Set(visibleColumnKeys?.length ? visibleColumnKeys : (columns || []).map(c => c.key))
  );
  const [exporting, setExporting] = useState(false);

  const toggleCol = (key: string) => {
    const next = new Set(selectedCols);
    if (next.has(key)) {
      if (next.size > 1) next.delete(key); // keep at least 1
    } else {
      next.add(key);
    }
    setSelectedCols(next);
  };

  const selectAllCols = () => {
    const cols = columns || [];
    if (cols.length === 0) return;
    if (selectedCols.size === cols.length) {
      setSelectedCols(new Set([cols[0].key]));
    } else {
      setSelectedCols(new Set(cols.map(c => c.key)));
    }
  };

  const getExportData = (): Record<string, unknown>[] => {
    switch (scope) {
      case 'selected': return selectedData;
      case 'page': return paginatedData;
      default: return data;
    }
  };

  const exportCols = (columns || []).filter(c => selectedCols.has(c.key));

  const handleExport = async () => {
    setExporting(true);
    const rows = getExportData();
    const dateStr = getTodayISODate();
    const fullName = `${fileName}_${dateStr}`;

    try {
      if (format === 'xlsx' || format === 'csv') {
        const mod = await import('xlsx');
        const XLSX = mod.default ?? mod;
        const wsData = [
          exportCols.map(c => c.label),
          ...rows.map(row => exportCols.map(c => row[c.key] ?? ''))
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Auto column widths
        ws['!cols'] = exportCols.map(col => ({
          wch: Math.max(col.label.length, ...rows.slice(0, 50).map(r => String(r[col.key] ?? '').length)) + 2
        }));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Data');

        if (format === 'xlsx') {
          XLSX.writeFile(wb, `${fullName}.xlsx`);
        } else {
          XLSX.writeFile(wb, `${fullName}.csv`, { bookType: 'csv' });
        }
      } else if (format === 'pdf') {
        const [jspdfMod, autoTableMod] = await Promise.all([
          import('jspdf'),
          import('jspdf-autotable'),
        ]);
        const { jsPDF } = jspdfMod;
        const autoTable = (autoTableMod as { default: typeof import('jspdf-autotable').default }).default;
        const doc = new jsPDF({ orientation: exportCols.length > 5 ? 'l' : 'p', unit: 'mm', format: 'a4' });

        // Title
        doc.setFontSize(12);
        doc.text(fileName.replace(/_/g, ' '), 14, 15);
        doc.setFontSize(8);
        doc.setTextColor(128);
        doc.text(txt('shared.export.pdfHeader', { date: dateStr, count: rows.length }), 14, 21);

        autoTable(doc, {
          head: [exportCols.map(c => c.label)],
          body: rows.map(row => exportCols.map(c => String(row[c.key] ?? ''))),
          startY: 26,
          styles: { fontSize: 7, cellPadding: 2 },
          headStyles: { fillColor: [59, 130, 246], fontSize: 7, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
        });

        doc.save(`${fullName}.pdf`);
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error('Export error:', e);
    }
    setExporting(false);
    onClose();
  };

  if (!open) return null;

  const formats: { id: ExportFormat; label: string; icon: React.ElementType; desc: string }[] = [
    { id: 'xlsx', label: 'Excel', icon: FileSpreadsheet, desc: '.xlsx' },
    { id: 'csv', label: 'CSV', icon: FileText, desc: '.csv' },
    { id: 'pdf', label: 'PDF', icon: FileText, desc: '.pdf' },
  ];

  const scopes: { id: ExportScope; label: string; count: number }[] = [
    { id: 'all', label: txt('shared.export.scopeAll'), count: data.length },
    { id: 'page', label: txt('shared.export.scopeCurrentPage'), count: paginatedData.length },
    { id: 'selected', label: txt('shared.export.scopeSelected'), count: selectedData.length },
  ];

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-black/20"
      />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 30 }}
          className={cn("w-full bg-card rounded-2xl shadow-2xl border border-border pointer-events-auto flex flex-col max-h-[85vh]", DIALOG_SIZE.LARGE)}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary"><Download size={16} /></div>
              <h3 className="text-sm font-semibold text-foreground">{txt('shared.export.title')}</h3>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">

            {/* Format */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">{txt('shared.export.format')}</p>
              <div className="flex gap-2">
                {formats.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setFormat(f.id)}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-1 py-2.5 px-3 rounded-xl border text-xs font-medium transition-colors",
                      format === f.id
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30 hover:bg-muted/30"
                    )}
                  >
                    <f.icon size={18} />
                    <span>{f.label}</span>
                    <span className="text-xs opacity-60">{f.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Scope */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">{txt('shared.export.scope')}</p>
              <div className="flex gap-2">
                {scopes.filter(s => s.count > 0 || s.id === 'all').map(s => (
                  <button
                    key={s.id}
                    onClick={() => setScope(s.id)}
                    disabled={s.count === 0}
                    className={cn(
                      "flex-1 py-2 px-2 rounded-lg border text-xs font-medium transition-colors",
                      scope === s.id
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30",
                      s.count === 0 && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    <span>{s.label}</span>
                    <span className="block text-xs tabular-nums opacity-60 mt-0.5">{s.count} {txt('shared.export.rows')}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Column selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">{txt('shared.export.selectColumns')}</p>
                <button onClick={selectAllCols} className="text-xs text-primary hover:underline">
                  {selectedCols.size === (columns || []).length ? txt('shared.export.deselectAll') : txt('shared.export.selectAll')}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {(columns || []).map(col => (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => toggleCol(col.key)}
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-xs w-full text-left",
                      selectedCols.has(col.key) ? "bg-primary/5 text-foreground" : "text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    <div className={cn(
                      "w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors shrink-0",
                      selectedCols.has(col.key) ? "bg-primary border-primary text-white" : "border-border"
                    )}>
                      {selectedCols.has(col.key) && <Check size={8} className="stroke-[3px]" />}
                    </div>
                    <span className="truncate">{col.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-border flex items-center justify-between shrink-0">
            <Button variant="outline" onClick={onClose} className="text-xs h-8">{txt('common.cancel')}</Button>
            <Button
              onClick={handleExport}
              disabled={exporting || getExportData().length === 0}
              className="bg-primary text-white text-xs h-8 px-4"
            >
              <Download size={13} className="mr-1.5" />
              {exporting ? txt('shared.export.exporting') : txt('shared.export.exportRows', { count: getExportData().length })}
            </Button>
          </div>
        </motion.div>
      </div>
    </>
  );
};

export default ExportDialog;
