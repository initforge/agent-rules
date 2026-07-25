/**
 * Trang preview hồ sơ nhân viên (mở tab mới) – toolbar: Tải (Doc / Excel / PDF), In.
 * Route: /ho-so-nhan-vien/:id
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { txt } from '@/lib/text';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getParentPath } from '@/components/shared/Breadcrumbs';
import { X, Printer, Download, ChevronDown, FileText, FileSpreadsheet, FileType } from 'lucide-react';
import { cn, getFontStack } from '@/lib/utils';
import { buildPrintDocumentCSS } from '@/lib/print-document/print-styles';
import { useEmployee } from '../hooks/use-nhan-vien';
import { printEmployeePDF } from '../utils/print-employee-pdf';
import { exportEmployeeProfileDoc, exportEmployeeProfileExcel } from '../utils/export-employee-profile';
import type { EmployeeProfileExportFormat } from '../utils/export-employee-profile';
import EmployeeProfilePreviewContent from '../components/EmployeeProfilePreviewContent';

const FORMATS: { format: EmployeeProfileExportFormat; labelKey: string; icon: React.ReactNode }[] = [
  { format: 'doc', labelKey: 'employee.export.doc', icon: <FileType size={14} /> },
  { format: 'excel', labelKey: 'employee.export.excel', icon: <FileSpreadsheet size={14} /> },
  { format: 'pdf', labelKey: 'employee.export.pdf', icon: <FileText size={14} /> },
];

const PRINT_STYLE_ID = 'employee-profile-print-styles';

const EmployeeProfilePreviewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: employee, isLoading, isError, error, refetch } = useEmployee(id ?? null);
  const [exporting, setExporting] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    const parent = getParentPath(location.pathname, txt);
    navigate(parent ?? '/he-thong/nhan-vien');
  }, [navigate, location.pathname]);

  useEffect(() => {
    const css = buildPrintDocumentCSS({ fontStack: getFontStack(), includePage: true });
    let styleEl = document.getElementById(PRINT_STYLE_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = PRINT_STYLE_ID;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
    return () => {
      styleEl?.remove();
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (downloadOpen) setDownloadOpen(false);
        else handleClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleClose, downloadOpen]);

  useEffect(() => {
    if (!downloadOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDownloadOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [downloadOpen]);

  useEffect(() => {
    if (!employee) return;
    const prev = document.title;
    document.title = `${txt('employee.pdf.title')} - ${employee.ho_ten} (${employee.id})`;
    return () => { document.title = prev; };
  }, [employee]);

  const handlePrint = () => window.print();

  const handleDownload = async (format: EmployeeProfileExportFormat) => {
    if (!employee) return;
    setExporting(true);
    setDownloadOpen(false);
    try {
      if (format === 'pdf') await printEmployeePDF(employee);
      else if (format === 'excel') await exportEmployeeProfileExcel(employee);
      else await exportEmployeeProfileDoc(employee);
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="h-10 w-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" aria-label={txt('common.loading')} />
      </div>
    );
  }

  const notFound = !isLoading && !employee && !isError;
  const loadError = isError;

  if (notFound || loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-muted/30 p-4">
        <p className="text-destructive font-medium text-center">
          {loadError ? (error?.message ?? txt('employee.profile.loadError')) : txt('employee.profile.notFound')}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {loadError && (
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card hover:bg-muted/50 font-medium"
            >
              {txt('common.retry')}
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90"
          >
            <X size={16} />
            {txt('common.close')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="employee-profile-preview-backdrop fixed inset-0 z-[70] flex flex-col bg-muted/90"
      role="main"
      aria-label={txt('employee.pdf.title')}
    >
      <div className="employee-profile-preview-toolbar flex items-center justify-between gap-2 px-3 py-1.5 bg-card border-b border-border shadow-sm shrink-0">
        <button
          type="button"
          onClick={handleClose}
          className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={txt('common.close')}
        >
          <X size={16} />
        </button>
        <div className="flex items-center gap-1.5">
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDownloadOpen((o) => !o)}
              disabled={exporting}
              className={cn(
                'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium border border-border bg-card hover:bg-muted/50',
                exporting && 'opacity-70 pointer-events-none'
              )}
            >
              <Download size={14} />
              {txt('employee.profile.download')}
              <ChevronDown size={12} className={cn('transition-transform', downloadOpen && 'rotate-180')} />
            </button>
            {downloadOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 py-1 bg-card rounded-xl border border-border shadow-xl z-10">
                {FORMATS.map((f) => (
                  <button
                    key={f.format}
                    type="button"
                    onClick={() => handleDownload(f.format)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted/60"
                  >
                    {f.icon}
                    {txt(f.labelKey)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary/90"
          >
            <Printer size={14} />
            {txt('employee.profile.print')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6 flex justify-center">
        <div
          className="bg-white shadow-xl rounded-sm max-w-[210mm] w-full min-h-[297mm]"
          style={{ minHeight: '297mm' }}
        >
          <EmployeeProfilePreviewContent employee={employee} />
        </div>
      </div>
    </div>
  );
};

export default EmployeeProfilePreviewPage;
