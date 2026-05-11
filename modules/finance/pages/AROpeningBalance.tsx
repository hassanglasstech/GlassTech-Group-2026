/**
 * AROpeningBalance.tsx — Sprint 30
 *
 * Bulk-load outstanding customer invoices that existed before go-live.
 * Each row becomes:
 *   1. An `invoices` row with status='Outstanding', balance=amount
 *   2. (optional) A GL JV: Dr Accounts Receivable / Cr Opening Balance Equity
 *
 * Used during cutover to populate AR aging on day 1.
 */

import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useAuthStore } from '@/modules/auth/authStore';
import { supabase } from '@/src/services/supabaseClient';
import { toast } from 'sonner';
import {
  Upload, Download, CheckCircle2, AlertTriangle, FileText, ArrowRight, X, Calculator,
} from 'lucide-react';
import {
  parseCSV, downloadTemplate, ColumnSpec, ParseError,
} from '@/modules/shared/services/csvImportService';
import { logImport, markChecklistItem } from '@/modules/finance/services/cutoverService';

// AR Opening Balance row schema
const AR_OB_SCHEMA: ColumnSpec[] = [
  { csvHeader: 'Invoice Number', field: 'invoice_number', required: true },
  { csvHeader: 'Client Code',    field: 'client_id',      required: true },
  { csvHeader: 'Invoice Date',   field: 'date',           required: true, type: 'date' },
  { csvHeader: 'Due Date',       field: 'due_date',       type: 'date' },
  { csvHeader: 'Total Amount',   field: 'total_amount',   required: true, type: 'number' },
  { csvHeader: 'Received Amount', field: 'received_amount', type: 'number' },
  { csvHeader: 'Project Name',   field: 'project_name' },
];

const SAMPLE_ROW = {
  invoice_number:  'INV-OB-001',
  client_id:       'CL-001',
  date:            '2026-03-15',
  due_date:        '2026-04-15',
  total_amount:    '125000',
  received_amount: '0',
  project_name:    'Opening Balance',
};

const AR_CONTROL_ACCOUNT  = '11201';  // Accounts Receivable
const OB_EQUITY_ACCOUNT   = '31901';  // Opening Balance Equity

interface AROBRow extends Record<string, unknown> {
  invoice_number:  string;
  client_id:       string;
  date:            string;
  due_date:        string | null;
  total_amount:    number;
  received_amount: number | null;
  project_name:    string | null;
  company:         string;
}

const AROpeningBalance: React.FC = () => {
  const { user, profile } = useAuthStore();
  const company           = useAppStore(s => s.selectedCompany) ?? profile?.company ?? user?.company ?? 'Glassco';

  const [step,    setStep]    = useState<'upload' | 'preview' | 'done'>('upload');
  const [file,    setFile]    = useState<File | null>(null);
  const [rows,    setRows]    = useState<AROBRow[]>([]);
  const [errors,  setErrors]  = useState<ParseError[]>([]);
  const [total,   setTotal]   = useState(0);
  const [postGL,  setPostGL]  = useState(true);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<{ succeeded: number; failed: number; glPosted: boolean } | null>(null);

  const handleFile = async (f: File) => {
    setFile(f);
    setLoading(true);
    const parsed = await parseCSV<AROBRow>(f, AR_OB_SCHEMA, { company });
    setRows(parsed.rows);
    setErrors(parsed.errors);
    setTotal(parsed.total);
    setLoading(false);
    setStep('preview');
  };

  const totalsByCount = useMemo(() => ({
    invoices: rows.length,
    grand:    rows.reduce((t, r) => t + (Number(r.total_amount) || 0), 0),
    received: rows.reduce((t, r) => t + (Number(r.received_amount) || 0), 0),
    balance:  rows.reduce((t, r) => t + ((Number(r.total_amount) || 0) - (Number(r.received_amount) || 0)), 0),
  }), [rows]);

  const handleCommit = async () => {
    if (rows.length === 0) {
      toast.error('No valid rows to import');
      return;
    }
    setLoading(true);

    // 1. Insert invoices
    const invoiceRows = rows.map(r => ({
      id:              `INV-OB-${r.invoice_number}`,
      company,
      order_id:        null,
      client_id:       r.client_id,
      date:            r.date,
      due_date:        r.due_date,
      total_amount:    r.total_amount,
      received_amount: r.received_amount ?? 0,
      balance:         (r.total_amount) - (r.received_amount ?? 0),
      status:          'Outstanding',
      project_name:    r.project_name ?? 'Opening Balance',
      data:            {
        invoiceNumber: r.invoice_number,
        isOpeningBalance: true,
        importedAt: new Date().toISOString(),
      },
    }));

    const { error: invErr } = await supabase.from('invoices').upsert(invoiceRows, { onConflict: 'id' });
    let succeeded = invErr ? 0 : invoiceRows.length;
    let failed    = invErr ? invoiceRows.length : 0;
    const localErrors: ParseError[] = invErr ? [{ row: 0, error: invErr.message }] : [];

    // 2. Post single consolidated GL JV (Dr AR / Cr OB Equity) — optional
    let glPosted = false;
    if (postGL && !invErr && totalsByCount.balance > 0) {
      const jv = {
        id:           `JV-AR-OB-${Date.now()}`,
        company,
        doc_type:     'JV',
        doc_date:     new Date().toISOString().slice(0, 10),
        date:         new Date().toISOString().slice(0, 10),
        description:  `AR Opening Balance — ${rows.length} invoices`,
        reference_id: 'AR-OPENING-BALANCE',
        status:       'Posted',
        details: [
          { accountId: AR_CONTROL_ACCOUNT, accountName: 'Accounts Receivable',
            debit: totalsByCount.balance, credit: 0 },
          { accountId: OB_EQUITY_ACCOUNT,  accountName: 'Opening Balance Equity',
            debit: 0, credit: totalsByCount.balance },
        ],
        created_by:   user?.email ?? 'unknown',
        posted_at:    new Date().toISOString(),
      };
      const { error: glErr } = await supabase.from('ledger').insert(jv);
      if (glErr) localErrors.push({ row: 0, error: `GL JV failed: ${glErr.message}` });
      else glPosted = true;
    }

    setLoading(false);
    setResult({ succeeded, failed, glPosted });

    await logImport({
      company,
      import_type:    'ar_opening',
      file_name:      file?.name ?? 'unknown.csv',
      rows_attempted: total,
      rows_succeeded: succeeded,
      rows_failed:    failed + errors.length,
      error_details:  [...errors, ...localErrors].map(e => ({ row: e.row, error: e.error })),
      imported_by:    user?.email ?? 'unknown',
    });

    if (succeeded > 0) {
      await markChecklistItem(company, 'ar_ob_done', true);
    }

    if (failed === 0) toast.success(`${succeeded} opening invoices loaded${glPosted ? ' + JV posted' : ''}`);
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

  const fmt = (n: number) => Math.round(n).toLocaleString('en-PK');

  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      <div className="bg-gradient-to-r from-slate-900 to-emerald-900 text-white p-6 rounded-[2rem] shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <FileText size={20}/> AR Opening Balance · Bulk Import
            </h2>
            <p className="text-[10px] text-emerald-300 font-bold uppercase tracking-widest mt-0.5">
              {company} · Outstanding customer invoices · Sprint 30 cutover
            </p>
          </div>
          <button onClick={() => downloadTemplate('ar_opening_template.csv', AR_OB_SCHEMA, SAMPLE_ROW)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-white border border-white/25 rounded-lg text-xs font-bold hover:bg-white/20">
            <Download size={13}/> Download Template
          </button>
        </div>
      </div>

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

      {step === 'upload' && (
        <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center">
          <Upload className="mx-auto text-slate-300 mb-3" size={48}/>
          <p className="text-sm font-bold text-slate-600 mb-1">Drop CSV / Excel file here</p>
          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-4">
            Required: Invoice Number, Client Code, Invoice Date, Total Amount
          </p>
          <input type="file" accept=".csv,.xlsx,.xls"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="block mx-auto text-xs"/>
        </div>
      )}

      {step === 'preview' && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
              <p className="text-[9px] font-black text-blue-600 uppercase">Invoices</p>
              <p className="text-2xl font-black text-blue-700">{totalsByCount.invoices}</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <p className="text-[9px] font-black text-slate-600 uppercase">Gross Total</p>
              <p className="text-xl font-black text-slate-800">₨ {fmt(totalsByCount.grand)}</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-[9px] font-black text-amber-600 uppercase">Received</p>
              <p className="text-xl font-black text-amber-700">₨ {fmt(totalsByCount.received)}</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
              <p className="text-[9px] font-black text-emerald-600 uppercase">Outstanding Balance</p>
              <p className="text-xl font-black text-emerald-700">₨ {fmt(totalsByCount.balance)}</p>
            </div>
          </div>

          {errors.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 max-h-64 overflow-y-auto">
              <p className="text-xs font-black text-rose-700 mb-2 flex items-center gap-1">
                <AlertTriangle size={14}/> Row-level errors ({errors.length}):
              </p>
              <ul className="text-[11px] text-rose-700 space-y-0.5 font-mono">
                {errors.slice(0, 50).map((e, i) => <li key={i}>Row {e.row}: {e.error}</li>)}
              </ul>
            </div>
          )}

          {rows.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    {AR_OB_SCHEMA.map(s => (
                      <th key={s.field} className="px-3 py-2.5 text-left font-black text-[10px] uppercase">{s.csvHeader}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.slice(0, 15).map((r, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                      {AR_OB_SCHEMA.map(s => (
                        <td key={s.field} className="px-3 py-2 text-slate-700">{String(r[s.field as keyof AROBRow] ?? '—')}</td>
                      ))}
                    </tr>
                  ))}
                  {rows.length > 15 && (
                    <tr><td colSpan={AR_OB_SCHEMA.length} className="px-3 py-2 text-center text-slate-400 italic">… {rows.length - 15} more</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <label className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3 cursor-pointer">
            <input type="checkbox" checked={postGL} onChange={e => setPostGL(e.target.checked)} className="w-4 h-4"/>
            <Calculator size={14} className="text-blue-700"/>
            <span className="text-xs font-bold text-blue-700">
              Auto-post consolidated GL JV: Dr {AR_CONTROL_ACCOUNT} AR ₨ {fmt(totalsByCount.balance)} / Cr {OB_EQUITY_ACCOUNT} OB Equity ₨ {fmt(totalsByCount.balance)}
            </span>
          </label>

          <div className="flex gap-2">
            <button onClick={reset}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50">
              <X size={14} className="inline mr-1"/> Cancel
            </button>
            <button onClick={handleCommit} disabled={loading || rows.length === 0}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:opacity-50">
              {loading ? 'Importing…' : `Commit ${rows.length} invoices${postGL ? ' + JV' : ''}`}
            </button>
          </div>
        </>
      )}

      {step === 'done' && result && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={48}/>
          <h3 className="text-lg font-black text-slate-900 mb-1">AR Opening Balance Loaded</h3>
          <p className="text-sm text-slate-600 mb-1">
            <span className="text-emerald-700 font-bold">{result.succeeded}</span> invoices created
          </p>
          {result.glPosted && (
            <p className="text-xs text-blue-700 font-bold mb-4">✓ Consolidated GL JV posted</p>
          )}
          <button onClick={reset}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 mt-2">
            Import another file
          </button>
        </div>
      )}
    </div>
  );
};

export default AROpeningBalance;
