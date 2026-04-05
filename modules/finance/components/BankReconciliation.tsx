/**
 * BankReconciliation.tsx — Phase 6
 * Match GL bank account entries to bank statement lines.
 * Unmatched GL = outstanding cheques/deposits.
 * Unmatched statement = bank errors or recording gaps.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Company } from '@/modules/shared/types/core';
import { FinanceService } from '@/modules/finance/services/financeService';
import { LedgerTransaction } from '@/modules/finance/types/finance';
import { useAuthStore } from '@/modules/auth/authStore';
import { supabase } from '@/src/services/supabaseClient';
import { CheckCircle2, AlertTriangle, Plus, X, Landmark, RefreshCw, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface StatementLine {
  id:          string;
  date:        string;
  description: string;
  debit:       number;
  credit:      number;
  balance:     number;
  matched:     boolean;
  matchedGLId?: string;
}

interface ReconSession {
  id:           string;
  company:      Company;
  bankAccount:  string;
  month:        string;
  bankBalance:  number;
  glBalance:    number;
  difference:   number;
  status:       'In Progress' | 'Balanced' | 'Unbalanced';
  lines:        StatementLine[];
  matchedGLIds: string[];
  createdAt:    string;
}

const SESSION_KEY = (company: Company, month: string, account: string) =>
  `gtk_erp_bank_recon_${company}_${account}_${month}`;

const BANK_ACCOUNTS = [
  { code: '11121', name: 'MCB Current Account' },
  { code: '11122', name: 'HBL Current Account' },
  { code: '11123', name: 'UBL Savings Account' },
];

const BankReconciliation: React.FC<{ company: Company }> = ({ company }) => {
  const { user } = useAuthStore();
  const actor = user?.fullName || user?.email || 'System';

  const [selectedAccount, setSelectedAccount] = useState('11121');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [bankBalance, setBankBalance] = useState<string>('');
  const [session, setSession] = useState<ReconSession | null>(null);
  const [newLine, setNewLine] = useState({ date: new Date().toISOString().split('T')[0], description: '', debit: '', credit: '' });
  const [showAddLine, setShowAddLine] = useState(false);

  // ── Load GL entries for selected bank account + month ───────────
  const glEntries = useMemo(() => {
    const ledger = FinanceService.getLedger().filter(t => t.company === company);
    const acctCode = selectedAccount;
    return ledger.filter(t => {
      const inMonth = t.date?.startsWith(selectedMonth);
      const touchesAccount = t.details?.some(d =>
        d.accountId?.includes(acctCode) || d.accountId?.endsWith(acctCode)
      );
      return inMonth && touchesAccount && t.status === 'Posted';
    });
  }, [company, selectedAccount, selectedMonth]);

  // GL balance for selected account+month (net movement)
  const glNetMovement = useMemo(() => {
    return glEntries.reduce((sum, t) => {
      const detail = t.details?.find(d =>
        d.accountId?.includes(selectedAccount) || d.accountId?.endsWith(selectedAccount)
      );
      if (!detail) return sum;
      return sum + (detail.debit - detail.credit);
    }, 0);
  }, [glEntries, selectedAccount]);

  const loadSession = () => {
    const key = SESSION_KEY(company, selectedMonth, selectedAccount);
    try {
      const saved = localStorage.getItem(key);
      if (saved) setSession(JSON.parse(saved));
      else setSession(null);
    } catch { setSession(null); }
  };

  const saveSession = (s: ReconSession) => {
    const key = SESSION_KEY(company, selectedMonth, selectedAccount);
    localStorage.setItem(key, JSON.stringify(s));
    setSession(s);
    // Async Supabase persist
    supabase.from('bank_recon_sessions').upsert([{
      id: s.id, company: s.company, bank_account: s.bankAccount,
      month: s.month, status: s.status,
      bank_balance: s.bankBalance, gl_balance: s.glBalance, difference: s.difference,
      data: s, updated_at: new Date().toISOString(),
    }]).then(({ error }) => {
      if (error) console.warn('[BankRecon] Supabase persist failed', error);
    });
  };

  useEffect(() => { loadSession(); }, [company, selectedMonth, selectedAccount]);

  const startSession = () => {
    if (!bankBalance || isNaN(Number(bankBalance))) {
      toast.error('Enter bank statement closing balance.');
      return;
    }
    const bBal = Number(bankBalance);
    const diff = bBal - glNetMovement;
    const s: ReconSession = {
      id: `RECON-${company}-${selectedAccount}-${selectedMonth}`,
      company, bankAccount: selectedAccount, month: selectedMonth,
      bankBalance: bBal, glBalance: glNetMovement,
      difference: diff,
      status: Math.abs(diff) < 1 ? 'Balanced' : 'In Progress',
      lines: [], matchedGLIds: [],
      createdAt: new Date().toISOString(),
    };
    saveSession(s);
  };

  const addStatementLine = () => {
    if (!session) return;
    if (!newLine.description) { toast.error('Enter description'); return; }
    const debit  = Number(newLine.debit)  || 0;
    const credit = Number(newLine.credit) || 0;
    if (debit === 0 && credit === 0) { toast.error('Enter debit or credit amount.'); return; }

    const lastBalance = session.lines.length > 0 ? session.lines[session.lines.length - 1].balance : 0;
    const line: StatementLine = {
      id: `SL-${Date.now()}`, date: newLine.date,
      description: newLine.description, debit, credit,
      balance: lastBalance + debit - credit, matched: false,
    };
    const updated = { ...session, lines: [...session.lines, line] };
    saveSession(updated);
    setNewLine({ date: new Date().toISOString().split('T')[0], description: '', debit: '', credit: '' });
    setShowAddLine(false);
  };

  const toggleMatchGL = (glTx: LedgerTransaction) => {
    if (!session) return;
    const isMatched = session.matchedGLIds.includes(glTx.id);
    const updated = {
      ...session,
      matchedGLIds: isMatched
        ? session.matchedGLIds.filter(id => id !== glTx.id)
        : [...session.matchedGLIds, glTx.id],
    };
    saveSession(updated);
  };

  const toggleMatchStatement = (lineId: string, glTxId?: string) => {
    if (!session) return;
    const lines = session.lines.map(l =>
      l.id === lineId ? { ...l, matched: !l.matched, matchedGLId: !l.matched ? glTxId : undefined } : l
    );
    saveSession({ ...session, lines });
  };

  const finalise = () => {
    if (!session) return;
    const unmatchedGL  = glEntries.filter(t => !session.matchedGLIds.includes(t.id)).length;
    const unmatchedSt  = session.lines.filter(l => !l.matched).length;
    const diff = session.bankBalance - glNetMovement;
    const status: ReconSession['status'] = Math.abs(diff) < 1 ? 'Balanced' : 'Unbalanced';
    const updated = { ...session, difference: diff, glBalance: glNetMovement, status };
    saveSession(updated);
    if (status === 'Balanced') {
      toast.success(`Reconciliation BALANCED ✓ — ${unmatchedGL} outstanding GL, ${unmatchedSt} unmatched statement lines.`);
    } else {
      toast.warning(`Difference: PKR ${Math.abs(diff).toLocaleString()} — investigate ${unmatchedGL} GL items and ${unmatchedSt} statement items.`);
    }
  };

  const acctName = BANK_ACCOUNTS.find(a => a.code === selectedAccount)?.name || selectedAccount;
  const matchedGL = session?.matchedGLIds.length || 0;
  const unmatchedGL = glEntries.length - matchedGL;
  const unmatchedSt = session?.lines.filter(l => !l.matched).length || 0;

  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      {/* Header */}
      <div className={`p-8 rounded-[2rem] shadow-xl text-white relative overflow-hidden ${session?.status === 'Balanced' ? 'bg-emerald-700' : 'bg-slate-900'}`}>
        <div className="absolute top-0 right-0 p-8 opacity-10"><Landmark size={120}/></div>
        <div className="flex justify-between items-start relative z-10">
          <div>
            
            <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest mt-1">{company} — {acctName}</p>
          </div>
          {session && (
            <div className="flex gap-8 text-right">
              <div>
                <p className="text-[9px] font-bold opacity-60 uppercase">Bank Balance</p>
                <p className="text-2xl font-black">PKR {session.bankBalance.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold opacity-60 uppercase">GL Movement</p>
                <p className="text-2xl font-black">PKR {glNetMovement.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold opacity-60 uppercase">Difference</p>
                <p className={`text-2xl font-black ${Math.abs(session.bankBalance - glNetMovement) < 1 ? 'text-emerald-300' : 'text-rose-400'}`}>
                  PKR {Math.abs(session.bankBalance - glNetMovement).toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-2xl border shadow-sm p-6 grid grid-cols-4 gap-4 items-end">
        <div>
          <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Bank Account</label>
          <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)} className="sap-input w-full font-bold">
            {BANK_ACCOUNTS.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Month</label>
          <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="sap-input w-full font-bold"/>
        </div>
        <div>
          <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Bank Statement Closing Balance</label>
          <input type="number" value={bankBalance} onChange={e => setBankBalance(e.target.value)} placeholder="PKR" className="sap-input w-full font-bold text-lg"/>
        </div>
        <div className="flex gap-2">
          <button onClick={startSession} className="flex-1 bg-slate-900 text-white px-5 py-3 rounded-xl font-black uppercase text-xs hover:bg-slate-700 flex items-center justify-center gap-2 shadow-lg">
            <RefreshCw size={14}/> {session ? 'Reset' : 'Start'}
          </button>
          {session && (
            <button onClick={finalise} className="flex-1 bg-blue-600 text-white px-5 py-3 rounded-xl font-black uppercase text-xs hover:bg-blue-700 flex items-center justify-center gap-2 shadow-lg">
              <CheckCircle2 size={14}/> Finalise
            </button>
          )}
        </div>
      </div>

      {session && (
        <div className="grid grid-cols-2 gap-5">

          {/* LEFT: GL Entries */}
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-black uppercase text-slate-700 text-xs tracking-widest">GL Entries — {acctName}</h3>
                <p className="text-[9px] text-slate-400 mt-0.5">{glEntries.length} entries · {matchedGL} matched · {unmatchedGL} outstanding</p>
              </div>
              <span className={`text-[9px] font-black px-2 py-1 rounded-full ${unmatchedGL === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {unmatchedGL === 0 ? 'All Matched ✓' : `${unmatchedGL} Outstanding`}
              </span>
            </div>
            <div className="overflow-y-auto max-h-[480px]">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left font-black text-[9px] text-slate-400 uppercase">Date</th>
                    <th className="px-4 py-2 text-left font-black text-[9px] text-slate-400 uppercase">Description</th>
                    <th className="px-4 py-2 text-right font-black text-[9px] text-slate-400 uppercase">Dr</th>
                    <th className="px-4 py-2 text-right font-black text-[9px] text-slate-400 uppercase">Cr</th>
                    <th className="px-4 py-2 text-center font-black text-[9px] text-slate-400 uppercase">✓</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {glEntries.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-300 text-xs italic">No GL entries for this account/month.</td></tr>
                  )}
                  {glEntries.map(tx => {
                    const detail = tx.details?.find(d =>
                      d.accountId?.includes(selectedAccount) || d.accountId?.endsWith(selectedAccount)
                    );
                    const isMatched = session.matchedGLIds.includes(tx.id);
                    return (
                      <tr key={tx.id} className={`hover:bg-slate-50 ${isMatched ? 'bg-emerald-50' : ''}`}>
                        <td className="px-4 py-2 text-slate-500">{tx.date}</td>
                        <td className="px-4 py-2 font-bold text-slate-700 max-w-[180px] truncate" title={tx.description}>{tx.description}</td>
                        <td className="px-4 py-2 text-right font-bold text-emerald-700">{detail?.debit ? detail.debit.toLocaleString() : '—'}</td>
                        <td className="px-4 py-2 text-right font-bold text-rose-600">{detail?.credit ? detail.credit.toLocaleString() : '—'}</td>
                        <td className="px-4 py-2 text-center">
                          <button onClick={() => toggleMatchGL(tx)}
                            className={`w-6 h-6 rounded border flex items-center justify-center mx-auto transition-all ${isMatched ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-400'}`}>
                            {isMatched && <CheckCircle2 size={12}/>}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT: Bank Statement */}
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-black uppercase text-slate-700 text-xs tracking-widest">Bank Statement Lines</h3>
                <p className="text-[9px] text-slate-400 mt-0.5">{session.lines.length} lines · {unmatchedSt} unmatched</p>
              </div>
              <button onClick={() => setShowAddLine(!showAddLine)}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-blue-700">
                <Plus size={12}/> Add Line
              </button>
            </div>

            {showAddLine && (
              <div className="px-5 py-4 border-b bg-blue-50 grid grid-cols-4 gap-2 items-end">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Date</label>
                  <input type="date" value={newLine.date} onChange={e => setNewLine(n => ({ ...n, date: e.target.value }))} className="sap-input w-full text-xs"/>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Description</label>
                  <input value={newLine.description} onChange={e => setNewLine(n => ({ ...n, description: e.target.value }))} className="sap-input w-full text-xs" placeholder="Payment / deposit"/>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Debit (+)</label>
                  <input type="number" value={newLine.debit} onChange={e => setNewLine(n => ({ ...n, debit: e.target.value }))} className="sap-input w-full text-xs"/>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Credit (−)</label>
                  <input type="number" value={newLine.credit} onChange={e => setNewLine(n => ({ ...n, credit: e.target.value }))} className="sap-input w-full text-xs"/>
                </div>
                <button onClick={addStatementLine} className="col-span-4 bg-blue-600 text-white py-2 rounded-xl font-black uppercase text-xs hover:bg-blue-700">Add Statement Line</button>
              </div>
            )}

            <div className="overflow-y-auto max-h-[480px]">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left font-black text-[9px] text-slate-400 uppercase">Date</th>
                    <th className="px-4 py-2 text-left font-black text-[9px] text-slate-400 uppercase">Description</th>
                    <th className="px-4 py-2 text-right font-black text-[9px] text-slate-400 uppercase">Dr</th>
                    <th className="px-4 py-2 text-right font-black text-[9px] text-slate-400 uppercase">Cr</th>
                    <th className="px-4 py-2 text-center font-black text-[9px] text-slate-400 uppercase">✓</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {session.lines.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-300 text-xs italic">Add bank statement lines above.</td></tr>
                  )}
                  {session.lines.map(line => (
                    <tr key={line.id} className={`hover:bg-slate-50 ${line.matched ? 'bg-emerald-50' : ''}`}>
                      <td className="px-4 py-2 text-slate-500">{line.date}</td>
                      <td className="px-4 py-2 font-bold text-slate-700 max-w-[180px] truncate">{line.description}</td>
                      <td className="px-4 py-2 text-right font-bold text-emerald-700">{line.debit ? line.debit.toLocaleString() : '—'}</td>
                      <td className="px-4 py-2 text-right font-bold text-rose-600">{line.credit ? line.credit.toLocaleString() : '—'}</td>
                      <td className="px-4 py-2 text-center">
                        <button onClick={() => toggleMatchStatement(line.id)}
                          className={`w-6 h-6 rounded border flex items-center justify-center mx-auto transition-all ${line.matched ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-400'}`}>
                          {line.matched && <CheckCircle2 size={12}/>}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Status footer */}
      {session && (
        <div className={`p-5 rounded-2xl border flex items-center gap-4 ${session.status === 'Balanced' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          {session.status === 'Balanced'
            ? <CheckCircle2 size={20} className="text-emerald-600 shrink-0"/>
            : <AlertTriangle size={20} className="text-amber-600 shrink-0"/>
          }
          <div className="text-sm font-bold">
            {session.status === 'Balanced'
              ? <span className="text-emerald-700 font-black uppercase">Reconciliation Balanced ✓ — Bank and GL agree.</span>
              : <span className="text-amber-700">Difference of PKR {Math.abs(session.bankBalance - glNetMovement).toLocaleString()} — {unmatchedGL} GL items and {unmatchedSt} statement lines unmatched.</span>
            }
          </div>
        </div>
      )}
    </div>
  );
};

export default BankReconciliation;
