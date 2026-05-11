/**
 * ClientImport.tsx — Sprint 30
 *
 * CSV bulk import wizard for clients (Glassco sales master).
 * Three steps: Upload → Preview → Commit.
 */

import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useAuthStore } from '@/modules/auth/authStore';
import { toast } from 'sonner';
import {
  Upload, Download, CheckCircle2, AlertTriangle, Users, ArrowRight, X,
} from 'lucide-react';
import {
  parseCSV, batchUpsert, downloadTemplate, ColumnSpec, ParseError,
} from '@/modules/shared/services/csvImportService';
import { logImport, markChecklistItem } from '@/modules/finance/services/cutoverService';

// ── Schema definition for clients CSV ─────────────────────────────────────────
const CLIENT_SCHEMA: ColumnSpec[] = [
  { csvHeader: 'Code',           field: 'id',             required: true },
  { csvHeader: 'Business Name',  field: 'name',           required: true },
  { csvHeader: 'Contact Person', field: 'contact_person' },
  { csvHeader: 'Email',          field: 'email' },
  { csvHeader: 'Phone',          field: 'phone' },
  { csvHeader: 'Address',        field: 'address' },
  { csvHeader: 'NTN',            field: 'ntn' },
  { csvHeader: 'Credit Limit',   field: 'credit_limit',   type: 'number' },
];

const SAMPLE_ROW = {
  id:              'CL-001',
  name:            'ABC Trading Co.',
  contact_person:  'Mr. Khan',
  email:           'khan@abc.pk',
  phone:           '+92-300-1234567',
  address:         'Plot 5, Korangi, Karachi',
  ntn:             '1234567-8',
  credit_limit:    '500000',
};

interface ClientRow { id: string; company: string; name: string; [k: string]: unknown }

const ClientImport: React.FC = () => {
  const { user, profile } = useAuthStore();
  const company           = useAppStore(s => s.selectedCompany) ?? profile?.company ?? user?.company ?? 'Glassco';

  const [step,    setStep]    = useState<'upload' | 'preview' | 'done'>('upload');
  const [file,    setFile]    = useState<File | null>(null);
  const [rows,    setRows]    = useState<ClientRow[]>([]);
  const [errors,  setErrors]  = useState<ParseError[]>([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<{ succeeded: number; failed: number } | null>(null);

  // ── Upload → Parse ──────────────────────────────────────────────────────────
  const handleFile = async (f: File) => {
    setFile(f);
    setLoading(true);
    const parsed = await parseCSV<ClientRow>(f, CLIENT_SCHEMA, { company });
    setRows(parsed.rows);
    setErrors(parsed.errors);
    setTotal(parsed.total);
    setLoading(false);
    setStep('preview');
  };

  // ── Commit → batch upsert ───────────────────────────────────────────────────
  const handleCommit = async () => {
    if (rows.length === 0) {
      toast.error('No valid rows to import');
      return;
    }
    setLoading(true);
    const { succeeded, failed, errors: upsertErrs } = await batchUpsert('clients', rows, {
      onConflict: 'id',
    });
    setLoading(false);
    setResult({ succeeded, failed });

    // Audit log
    await logImport({
      company,
      import_type:    'clients',
      file_name:      file?.name ?? 'unknown.csv',
      rows_attempted: total,
      rows_succeeded: succeeded,
      rows_failed:    failed + errors.length,
      error_details:  [...errors, ...upsertErrs].map(e => ({ row: e.row, error: e.error })),
      imported_by:    user?.email ?? 'unknown',
    });

    // Mark cutover checklist if at least 1 client imported
    if (succeeded > 0) {
      await markChecklistItem(company, 'masters_loaded', true);
    }

    if (failed === 0) toast.success(`${succeeded} clients imported`);
    else toast.error(`${succeeded} succeeded, ${failed} failed`);

    setStep('done');
  };

  const reset = () => {
    setStep('upload');
    setFile(null);
    setRows([]);
    setErrors([]);
    setTotal(0);
    setResult(null);
  };

  const errorByRow = useMemo(() => {
    const m = new Map<number, string[]>();
    errors.forEach(e => {
      if (!m.has(e.row)) m.set(e.row, []);
      m.get(e.row)!.push(e.error);
    });
    return m;
  }, [errors]);

  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-blue-900 text-white p-6 rounded-[2rem] shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <Users size={20}/> Client Master · Bulk Import
            </h2>
            <p className="text-[10px] text-blue-300 font-bold uppercase tracking-widest mt-0.5">
              {company} · CSV / Excel upload · Sprint 30 cutover tool
            </p>
          </div>
          <button onClick={() => downloadTemplate('clients_template.csv', CLIENT_SCHEMA, SAMPLE_ROW)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-white border border-white/25 rounded-lg text-xs font-bold hover:bg-white/20">
            <Download size={13}/> Download Template
          </button>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {['upload', 'preview', 'done'].map((s, i) => (
          <React.Fragment key={s}>
            <div className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${step === s ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>
              {i + 1}. {s}
            </div>
            {i < 2 && <ArrowRight size={14} className="text-slate-300"/>}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center">
          <Upload className="mx-auto text-slate-300 mb-3" size={48}/>
          <p className="text-sm font-bold text-slate-600 mb-1">Drop CSV / Excel file here</p>
          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-4">
            Required columns: Code, Business Name
          </p>
          <input type="file" accept=".csv,.xlsx,.xls"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="block mx-auto text-xs"/>
        </div>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
              <p className="text-[9px] font-black text-blue-600 uppercase">Total Rows</p>
              <p className="text-2xl font-black text-blue-700">{total}</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
              <p className="text-[9px] font-black text-emerald-600 uppercase">Valid</p>
              <p className="text-2xl font-black text-emerald-700">{rows.length}</p>
            </div>
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
              <p className="text-[9px] font-black text-rose-600 uppercase">Errors</p>
              <p className="text-2xl font-black text-rose-700">{errors.length}</p>
            </div>
          </div>

          {errors.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 max-h-64 overflow-y-auto">
              <p className="text-xs font-black text-rose-700 mb-2 flex items-center gap-1">
                <AlertTriangle size={14}/> Row-level errors:
              </p>
              <ul className="text-[11px] text-rose-700 space-y-0.5 font-mono">
                {errors.slice(0, 50).map((e, i) => (
                  <li key={i}>Row {e.row}: {e.error}</li>
                ))}
                {errors.length > 50 && <li>… and {errors.length - 50} more</li>}
              </ul>
            </div>
          )}

          {rows.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    {CLIENT_SCHEMA.map(s => (
                      <th key={s.field} className="px-3 py-2.5 text-left font-black text-[10px] uppercase">{s.csvHeader}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.slice(0, 20).map((r, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                      {CLIENT_SCHEMA.map(s => (
                        <td key={s.field} className="px-3 py-2 text-slate-700">{String(r[s.field] ?? '—')}</td>
                      ))}
                    </tr>
                  ))}
                  {rows.length > 20 && (
                    <tr><td colSpan={CLIENT_SCHEMA.length} className="px-3 py-2 text-center text-slate-400 italic">… {rows.length - 20} more</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={reset}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50">
              <X size={14} className="inline mr-1"/> Cancel
            </button>
            <button onClick={handleCommit} disabled={loading || rows.length === 0}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:opacity-50">
              {loading ? 'Importing…' : `Commit ${rows.length} clients`}
            </button>
          </div>
        </>
      )}

      {/* Step 3: Done */}
      {step === 'done' && result && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={48}/>
          <h3 className="text-lg font-black text-slate-900 mb-1">Import Complete</h3>
          <p className="text-sm text-slate-600 mb-4">
            <span className="text-emerald-700 font-bold">{result.succeeded}</span> succeeded, {' '}
            <span className="text-rose-700 font-bold">{result.failed + errors.length}</span> failed
          </p>
          <button onClick={reset}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800">
            Import another file
          </button>
        </div>
      )}
    </div>
  );
};

export default ClientImport;
