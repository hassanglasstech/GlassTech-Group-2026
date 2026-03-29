/**
 * DataImportTool.tsx — Stage 1E
 * Bulk CSV import for historical data: GRNs, orders, delivery dates
 * 
 * Supports:
 *  - Generator logs CSV
 *  - Cutter daily logs CSV
 *  - Delivery dates CSV (updates existing quotations)
 * 
 * Each type has a template download + upload + preview + confirm flow
 */

import React, { useState, useRef } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useAuthStore } from '@/modules/auth/authStore';
import { GeneratorService } from '@/modules/production/services/generatorService';
import { LabourService } from '@/modules/production/services/labourService';
import { SalesService } from '@/modules/sales/services/salesService';
import { Upload, Download, FileText, CheckCircle2, AlertTriangle, X, Loader2, Zap, Users, Truck } from 'lucide-react';
import { toast } from 'sonner';

type ImportType = 'generator' | 'labour' | 'delivery';

interface ParsedRow { [key: string]: string; }

const TEMPLATES: Record<ImportType, { name: string; icon: any; iconClass: string; bgClass: string; headers: string[]; sampleRow: string; description: string }> = {
  generator: {
    name: 'Generator Hours',
    icon: Zap, iconClass: 'text-amber-600', bgClass: 'bg-amber-100',
    headers: ['date', 'wapda_hours', 'generator_hours', 'fuel_litres', 'fuel_rate', 'sqft_produced', 'notes'],
    sampleRow: '2025-10-15,16,8,12.5,350,450,Normal loadshedding day',
    description: 'Daily generator/WAPDA hours with fuel consumption',
  },
  labour: {
    name: 'Cutter Productivity',
    icon: Users, iconClass: 'text-blue-600', bgClass: 'bg-blue-100',
    headers: ['date', 'cutter_name', 'shift', 'sqft_produced', 'pieces_cut', 'sheets_used', 'overtime_hours', 'notes'],
    sampleRow: '2025-10-15,Ahmed,Morning,380,42,6,0,',
    description: 'Daily cutter output: sqft, pieces, overtime',
  },
  delivery: {
    name: 'Delivery Dates',
    icon: Truck, iconClass: 'text-emerald-600', bgClass: 'bg-emerald-100',
    headers: ['order_id', 'actual_delivery_date', 'delay_category', 'delay_reason'],
    sampleRow: 'QT-GLASSCO-0326-001,2026-03-20,Outsourcing,Tempering vendor delayed 2 days',
    description: 'Update existing orders with actual delivery dates and delay reasons',
  },
};

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const row: ParsedRow = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  }).filter(row => Object.values(row).some(v => v));
}

const DataImportTool: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const user = useAuthStore(s => s.user);
  const [importType, setImportType] = useState<ImportType | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = (type: ImportType) => {
    const tmpl = TEMPLATES[type];
    const csv = tmpl.headers.join(',') + '\n' + tmpl.sampleRow + '\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${type}_import_template.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length === 0) { toast.error('No valid data rows found'); return; }
      setParsedData(rows);
      toast.success(`${rows.length} rows parsed — review and confirm import`);
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleImport = async () => {
    if (!importType || parsedData.length === 0) return;
    setImporting(true);
    let success = 0, errors = 0;

    if (importType === 'generator') {
      for (const row of parsedData) {
        try {
          await GeneratorService.saveLog({
            company,
            logDate: row.date,
            wapdaHours: Number(row.wapda_hours || 0),
            generatorHours: Number(row.generator_hours || 0),
            fuelLitresUsed: Number(row.fuel_litres || 0),
            fuelRatePerLitre: Number(row.fuel_rate || 350),
            cuttingSqftProduced: Number(row.sqft_produced || 0),
            notes: row.notes || '',
            enteredBy: user?.email || 'import',
          });
          success++;
        } catch { errors++; }
      }
    }

    if (importType === 'labour') {
      for (const row of parsedData) {
        try {
          await LabourService.saveLog({
            company,
            logDate: row.date,
            cutterName: row.cutter_name,
            employeeId: '',
            shift: (row.shift as any) || 'Morning',
            sqftProduced: Number(row.sqft_produced || 0),
            piecesCut: Number(row.pieces_cut || 0),
            sheetsUsed: Number(row.sheets_used || 0),
            overtimeHours: Number(row.overtime_hours || 0),
            overtimeRateMultiplier: 1.5,
            notes: row.notes || '',
            enteredBy: user?.email || 'import',
          });
          success++;
        } catch { errors++; }
      }
    }

    if (importType === 'delivery') {
      const allOrders = SalesService.getQuotations().filter(q => q.company === company);
      for (const row of parsedData) {
        const order = allOrders.find(q => q.id === row.order_id || q.orderNo === row.order_id);
        if (order) {
          const updated = {
            ...order,
            actualDeliveryDate: row.actual_delivery_date || order.actualDeliveryDate,
            delayCategory: (row.delay_category as any) || order.delayCategory || '',
            delayReason: row.delay_reason || order.delayReason || '',
          };
          const next = allOrders.map(q => q.id === order.id ? updated : q);
          SalesService.saveQuotations(next);
          success++;
        } else { errors++; }
      }
    }

    setImportResult({ success, errors });
    setImporting(false);
    toast.success(`Import complete: ${success} saved, ${errors} failed`);
  };

  const reset = () => {
    setImportType(null);
    setParsedData([]);
    setImportResult(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
          <Upload size={20} className="text-indigo-500"/> Historical Data Import
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">Bulk CSV import for generator logs, cutter productivity, delivery dates | {company}</p>
      </div>

      {/* Import Type Selection */}
      {!importType && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(Object.entries(TEMPLATES) as [ImportType, typeof TEMPLATES[ImportType]][]).map(([type, tmpl]) => (
            <div key={type} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-all cursor-pointer group" onClick={() => setImportType(type)}>
              <div className={`w-10 h-10 rounded-xl ${tmpl.bgClass} flex items-center justify-center mb-3`}>
                <tmpl.icon size={20} className={tmpl.iconClass}/>
              </div>
              <h3 className="text-sm font-black text-slate-800">{tmpl.name}</h3>
              <p className="text-[10px] text-slate-500 mt-1">{tmpl.description}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={(e) => { e.stopPropagation(); handleDownloadTemplate(type); }} className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg flex items-center gap-1 hover:bg-indigo-100">
                  <Download size={10}/> Template
                </button>
                <span className="text-[9px] font-bold text-slate-400 px-2 py-1">{tmpl.headers.length} columns</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Import Flow */}
      {importType && !importResult && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-slate-800 uppercase flex items-center gap-2">
              <FileText size={16}/> Import {TEMPLATES[importType].name}
            </h3>
            <button onClick={reset} className="p-1 hover:bg-slate-100 rounded-lg"><X size={16} className="text-slate-400"/></button>
          </div>

          {/* Download template */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-indigo-700">CSV Format Required</p>
              <p className="text-[9px] text-indigo-500 mt-0.5">Columns: {TEMPLATES[importType].headers.join(', ')}</p>
            </div>
            <button onClick={() => handleDownloadTemplate(importType)} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1">
              <Download size={12}/> Download Template
            </button>
          </div>

          {/* Upload */}
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
            <Upload size={24} className="mx-auto text-slate-400 mb-2"/>
            <p className="text-xs font-bold text-slate-500 mb-2">Upload your CSV file</p>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFileUpload} className="hidden"/>
            <button onClick={() => fileRef.current?.click()} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-black uppercase">
              Choose File
            </button>
          </div>

          {/* Preview */}
          {parsedData.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-2">{parsedData.length} rows ready to import</p>
              <div className="overflow-x-auto max-h-60 overflow-y-auto border border-slate-100 rounded-xl">
                <table className="w-full text-[10px]">
                  <thead><tr className="bg-slate-50 font-black text-slate-400 uppercase">
                    {Object.keys(parsedData[0]).map(h => <th key={h} className="px-3 py-2 text-left">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {parsedData.slice(0, 20).map((row, i) => (
                      <tr key={i} className="border-t border-slate-50">
                        {Object.values(row).map((v, j) => <td key={j} className="px-3 py-1.5 font-bold text-slate-600">{v}</td>)}
                      </tr>
                    ))}
                    {parsedData.length > 20 && <tr><td colSpan={99} className="px-3 py-2 text-center text-slate-400 font-bold">...and {parsedData.length - 20} more rows</td></tr>}
                  </tbody>
                </table>
              </div>
              <button onClick={handleImport} disabled={importing} className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white py-3 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 shadow-lg">
                {importing ? <><Loader2 size={14} className="animate-spin"/> Importing...</> : <><CheckCircle2 size={14}/> Confirm Import ({parsedData.length} rows)</>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Result */}
      {importResult && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-3"/>
          <h3 className="text-lg font-black text-slate-800">Import Complete</h3>
          <div className="flex items-center justify-center gap-6 mt-3">
            <div><span className="text-2xl font-black text-emerald-600">{importResult.success}</span><p className="text-[10px] font-bold text-slate-400">Saved</p></div>
            {importResult.errors > 0 && <div><span className="text-2xl font-black text-red-600">{importResult.errors}</span><p className="text-[10px] font-bold text-slate-400">Failed</p></div>}
          </div>
          <button onClick={reset} className="mt-4 bg-slate-900 text-white px-6 py-2 rounded-xl text-xs font-black uppercase">Import More</button>
        </div>
      )}
    </div>
  );
};

export default React.memo(DataImportTool);
