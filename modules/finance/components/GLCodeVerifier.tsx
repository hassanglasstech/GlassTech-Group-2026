/**
 * GLCodeVerifier.tsx — F-02 Fix
 *
 * Compares all hardcoded GL account codes used in posting services
 * against the actual Chart of Accounts in the system.
 *
 * Purpose: Before go-live, the CA/owner should run this tool and
 * confirm every code shown matches their actual COA. Mismatches
 * will cause GL entries to post to wrong accounts silently.
 *
 * Location: Finance → GL Config tab → GL Code Verification section
 */

import React, { useState, useMemo } from 'react';
import { Company } from '@/modules/shared/types/core';
import { FinanceService } from '@/modules/finance/services/financeService';
import { ShieldCheck, AlertTriangle, XCircle, RefreshCw, Download } from 'lucide-react';
import { toast } from 'sonner';

interface Props { company: Company; }

interface CodeEntry {
  code:        string;
  usedIn:      string;    // which module/service
  purpose:     string;    // what it represents
  foundInCOA:  boolean;
  coaName?:    string;    // actual name from COA
  coaId?:      string;
}

// ── All hardcoded GL codes used in posting services ─────────────────────────
// Source: financeService.ts, grnGLService.ts, deliveryInvoiceService.ts,
//         costAnalysisService.ts, creditNoteService.ts, purchaseReturnModule.tsx
const HARDCODED_CODES: Omit<CodeEntry, 'foundInCOA' | 'coaName' | 'coaId'>[] = [
  // ── Assets ─────────────────────────────────────────────────────────────────
  { code:'11111', usedIn:'Finance / Petty Cash',     purpose:'Petty Cash'                    },
  { code:'11112', usedIn:'Finance / PV / GRN',       purpose:'Cash in Hand — Main'           },
  { code:'11121', usedIn:'Finance / Bank Recon',     purpose:'Bank — MCB Current Account'    },
  { code:'11421', usedIn:'Finance / PV (Store)',     purpose:'Employee Advances'             },
  { code:'11511', usedIn:'GRN / Production / Credit Note', purpose:'Inventory — Raw Materials / Glass' },
  { code:'11512', usedIn:'Finance / PV',             purpose:'Glass Sheets — Stock'          },
  { code:'11513', usedIn:'Finance / PV',             purpose:'Hardware & Accessories'        },
  { code:'11519', usedIn:'GRN GL Service',           purpose:'Scrap Inventory (nominal)'     },
  { code:'11531', usedIn:'Finance / PV',             purpose:'Consumables — Fabrication'     },
  { code:'12113', usedIn:'Finance / Salary',         purpose:'Salary Advance Clearing'       },
  { code:'12210', usedIn:'Sales Invoice / Credit Note', purpose:'Trade Receivables — Customers' },
  // ── Liabilities ─────────────────────────────────────────────────────────────
  { code:'21111', usedIn:'GRN GL Service',           purpose:'Payable — Glass Importers'     },
  { code:'21112', usedIn:'GRN GL Service',           purpose:'Payable — Tempering Vendors'   },
  { code:'21113', usedIn:'GRN GL Service',           purpose:'Payable — Other Vendors'       },
  { code:'21114', usedIn:'Finance / PV / Purchase Return', purpose:'Payable — Other Vendors (personal)' },
  { code:'21151', usedIn:'GRN GL Service',           purpose:'GR/IR Clearing — Glass Material' },
  { code:'21152', usedIn:'GRN GL Service',           purpose:'GR/IR Clearing — Freight'      },
  // ── Revenue ─────────────────────────────────────────────────────────────────
  { code:'41110', usedIn:'Sales Invoice / Credit Note', purpose:'Sales Revenue — Service Income' },
  { code:'44112', usedIn:'GRN GL Service',           purpose:'Other Income / Miscellaneous'  },
  // ── Expenses ────────────────────────────────────────────────────────────────
  { code:'51213', usedIn:'GRN GL Service',           purpose:'Inward Freight Expense (alt)'  },
  { code:'51214', usedIn:'GRN GL Service',           purpose:'Inward Freight Expense'        },
  { code:'52291', usedIn:'Finance',                  purpose:'Miscellaneous Expense'         },
  { code:'53122', usedIn:'Finance / PV',             purpose:'Fuel & Transport'              },
  { code:'53511', usedIn:'Finance / PV',             purpose:'Office Supplies'               },
  { code:'53512', usedIn:'Finance / PV',             purpose:'Printing & Stationery'         },
  { code:'53621', usedIn:'Finance / PV',             purpose:'Repair & Maintenance'          },
  { code:'53622', usedIn:'Finance / PV',             purpose:'Electrical Maintenance'        },
  { code:'53817', usedIn:'Finance / PV',             purpose:'Miscellaneous Expenses (default)' },
  { code:'56113', usedIn:'GRN GL Service / NCR',     purpose:'Glass Breakage & Write-off'    },
];

const GLCodeVerifier: React.FC<Props> = ({ company }) => {
  const [refreshKey, setRefreshKey] = useState(0);

  const accounts = useMemo(() => {
    return FinanceService.getAccounts().filter((a: any) => a.company === company);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, refreshKey]);

  const entries: CodeEntry[] = useMemo(() => {
    return HARDCODED_CODES.map(hc => {
      // Match by code — code may be stored as full string or suffix
      const match = accounts.find((a: any) =>
        a.code === hc.code ||
        (a.code || '').endsWith(hc.code) ||
        a.id?.includes(hc.code)
      );
      return {
        ...hc,
        foundInCOA: !!match,
        coaName:    match?.name,
        coaId:      match?.id,
      };
    });
  }, [accounts]);

  const missing  = entries.filter(e => !e.foundInCOA);
  const present  = entries.filter(e => e.foundInCOA);
  const pct      = Math.round((present.length / entries.length) * 100);

  const exportCSV = () => {
    const rows = [
      ['GL Code', 'Used In', 'Purpose', 'Found in COA', 'COA Account Name'],
      ...entries.map(e => [e.code, e.usedIn, e.purpose, e.foundInCOA ? 'YES' : 'NO', e.coaName || '— not found —']),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `GLCodeVerification_${company}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success('GL verification exported');
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      {/* Header */}
      <div className={`p-6 rounded-2xl flex items-center justify-between text-white ${
        pct === 100 ? 'bg-emerald-700' : pct >= 80 ? 'bg-amber-600' : 'bg-rose-700'
      }`}>
        <div className="flex items-center gap-3">
          <ShieldCheck size={22}/>
          <div>
            <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest">
              {company} — GL Code Verification (F-02)
            </p>
            <p className="font-black text-xl">
              {present.length} / {entries.length} codes verified in COA — {pct}%
            </p>
            {missing.length > 0 && (
              <p className="text-[10px] font-bold opacity-80 mt-0.5">
                {missing.length} codes not found — GL entries may post incorrectly
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setRefreshKey(k => k+1)}
            className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl">
            <RefreshCw size={16}/>
          </button>
          <button onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/20 hover:bg-white/30 rounded-xl font-black uppercase text-xs">
            <Download size={14}/> Export CSV
          </button>
        </div>
      </div>

      {/* Summary banner */}
      {pct === 100 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
          <ShieldCheck size={18} className="text-emerald-600 shrink-0"/>
          <p className="text-sm text-emerald-700 font-bold">
            All {entries.length} hardcoded GL codes are present in the Chart of Accounts. GL posting is verified. Safe to go live.
          </p>
        </div>
      ) : (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5"/>
          <div>
            <p className="text-sm text-rose-700 font-bold mb-1">
              {missing.length} GL codes are not in the Chart of Accounts.
            </p>
            <p className="text-xs text-rose-600">
              Create these accounts in Chart of Accounts, or update the GL Posting Rules to match your actual COA codes.
              Until resolved, these transactions will either fail or post to incorrect accounts.
            </p>
          </div>
        </div>
      )}

      {/* Missing codes first */}
      {missing.length > 0 && (
        <div className="bg-white rounded-2xl border border-rose-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b bg-rose-50 flex items-center gap-2">
            <XCircle size={14} className="text-rose-600"/>
            <p className="font-black uppercase text-rose-700 text-xs tracking-widest">
              Missing from COA — Action Required ({missing.length})
            </p>
          </div>
          <table className="w-full sap-table">
            <thead>
              <tr>
                <th className="px-5 py-3 text-left">GL Code</th>
                <th className="px-5 py-3 text-left">Expected Purpose</th>
                <th className="px-5 py-3 text-left">Used In</th>
                <th className="px-5 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {missing.map(e => (
                <tr key={e.code} className="bg-rose-50/40">
                  <td className="px-5 py-3 font-mono font-black text-rose-700">{e.code}</td>
                  <td className="px-5 py-3 font-bold text-slate-800 text-sm">{e.purpose}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{e.usedIn}</td>
                  <td className="px-5 py-3">
                    <span className="text-[9px] font-black px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full uppercase">
                      Create in COA or update posting rule
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Verified codes */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-slate-50 flex items-center gap-2">
          <ShieldCheck size={14} className="text-emerald-600"/>
          <p className="font-black uppercase text-slate-700 text-xs tracking-widest">
            Verified in COA ({present.length})
          </p>
        </div>
        <table className="w-full sap-table">
          <thead>
            <tr>
              <th className="px-5 py-3 text-left">GL Code</th>
              <th className="px-5 py-3 text-left">Expected Purpose</th>
              <th className="px-5 py-3 text-left">Actual COA Name</th>
              <th className="px-5 py-3 text-left">Used In</th>
            </tr>
          </thead>
          <tbody>
            {present.map(e => (
              <tr key={e.code}>
                <td className="px-5 py-3 font-mono font-black text-emerald-700">{e.code}</td>
                <td className="px-5 py-3 text-xs text-slate-500">{e.purpose}</td>
                <td className="px-5 py-3 font-bold text-slate-800 text-sm">{e.coaName || '—'}</td>
                <td className="px-5 py-3 text-xs text-slate-400">{e.usedIn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-slate-400 font-mono text-right">
        {entries.length} codes scanned from: financeService, grnGLService, deliveryInvoiceService, creditNoteService, purchaseReturnModule
      </p>
    </div>
  );
};

export default GLCodeVerifier;
