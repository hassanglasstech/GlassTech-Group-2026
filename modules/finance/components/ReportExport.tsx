import React from 'react';
import { Download, Printer, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

export interface ExportColumn {
  header: string;
  key:    string;
}

interface ReportExportProps {
  /** Report title shown in toast and used as default filename */
  title:    string;
  /** Rows to export — each row is a plain object */
  rows:     Record<string, unknown>[];
  /** Optional explicit column mapping; if omitted, keys from first row are used */
  columns?: ExportColumn[];
  /** Sheet name inside the workbook (max 31 chars) */
  sheet?:   string;
  /** Extra CSS classes on the wrapper */
  className?: string;
}

const ReportExport: React.FC<ReportExportProps> = ({
  title,
  rows,
  columns,
  sheet,
  className = '',
}) => {
  const handleExcel = () => {
    if (rows.length === 0) {
      toast.warning('No data to export');
      return;
    }

    const exportRows = columns
      ? rows.map(r =>
          Object.fromEntries(columns.map(c => [c.header, r[c.key] ?? '']))
        )
      : rows;

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, (sheet ?? title).slice(0, 31));
    const filename = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success(`${title} exported`);
  };

  const handlePrint = () => window.print();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        onClick={handleExcel}
        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors"
        title="Export to Excel"
      >
        <Download size={13} /> Excel
      </button>
      <button
        onClick={handlePrint}
        className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-white text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors"
        title="Print report"
      >
        <Printer size={13} /> Print
      </button>
      <button
        onClick={() => {
          const csv = [
            (columns ? columns.map(c => c.header) : Object.keys(rows[0] ?? {})).join(','),
            ...rows.map(r =>
              (columns ? columns.map(c => r[c.key]) : Object.values(r))
                .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
                .join(',')
            ),
          ].join('\n');
          const blob = new Blob([csv], { type: 'text/csv' });
          const a    = document.createElement('a');
          a.href     = URL.createObjectURL(blob);
          a.download = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
          a.click();
          toast.success('CSV downloaded');
        }}
        className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-white text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors"
        title="Download CSV"
      >
        <FileText size={13} /> CSV
      </button>
    </div>
  );
};

export default ReportExport;
