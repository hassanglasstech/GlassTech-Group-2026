
import React, { useMemo } from 'react';
import { Company } from '../../shared/types';
import { FinanceService } from '../services/financeService';
import { Download, Printer, BarChart4 } from 'lucide-react';
import * as XLSX from 'xlsx';

const TrialBalance: React.FC<{ company: Company }> = ({ company }) => {
  const accounts = FinanceService.getAccounts().filter(a => a.company === company);
  const ledger = FinanceService.getLedger().filter(t => t.company === company);

  const trialBalanceData = useMemo(() => {
    return accounts.map(acc => {
      let totalDebit = 0;
      let totalCredit = 0;

      ledger.forEach(tx => {
        tx.details.forEach(d => {
          if (d.accountId === acc.id) {
            totalDebit += d.debit;
            totalCredit += d.credit;
          }
        });
      });

      const net = totalDebit - totalCredit;
      return {
        ...acc,
        debit: totalDebit,
        credit: totalCredit,
        net: Math.abs(net),
        side: net >= 0 ? 'Dr' : 'Cr'
      };
    }).filter(a => a.debit !== 0 || a.credit !== 0);
  }, [accounts, ledger]);

  const totals = trialBalanceData.reduce((acc, curr) => ({
    debit: acc.debit + curr.debit,
    credit: acc.credit + curr.credit
  }), { debit: 0, credit: 0 });

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(trialBalanceData.map(a => ({
      'G/L Account': a.code,
      'Description': a.name,
      'Debit': a.debit,
      'Credit': a.credit
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Trial Balance");
    XLSX.writeFile(wb, `${company}_Trial_Balance.xlsx`);
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-500">
      <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <div>
          <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Trial Balance</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Period: Active Fiscal Year 2026</p>
        </div>
        <div className="flex space-x-3">
          <button onClick={exportToExcel} className="p-3 bg-white text-slate-600 rounded-xl border border-slate-200 hover:bg-slate-50 transition-all"><Download size={20}/></button>
          <button onClick={() => window.print()} className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center space-x-2"><Printer size={18}/> <span>Print Report</span></button>
        </div>
      </div>

      <div className="p-8">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest">
            <tr>
              <th className="px-6 py-4 rounded-tl-xl">G/L Account</th>
              <th className="px-6 py-4">Account Description</th>
              <th className="px-6 py-4 text-right">Debit (PKR)</th>
              <th className="px-6 py-4 text-right rounded-tr-xl">Credit (PKR)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {trialBalanceData.map(acc => (
              <tr key={acc.id} className="hover:bg-blue-50/30 transition-colors">
                <td className="px-6 py-4 font-mono text-xs text-slate-500">{acc.code}</td>
                <td className="px-6 py-4 font-bold text-slate-800 text-sm">{acc.name}</td>
                <td className="px-6 py-4 text-right font-black text-slate-900">{acc.debit > 0 ? (Number(acc.debit) || 0).toLocaleString() : '-'}</td>
                <td className="px-6 py-4 text-right font-black text-blue-600">{acc.credit > 0 ? (Number(acc.credit) || 0).toLocaleString() : '-'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50">
            <tr>
              <td colSpan={2} className="px-6 py-6 font-black text-slate-900 uppercase text-xs tracking-widest">Calculated Equilibrium</td>
              <td className="px-6 py-6 text-right font-black text-xl text-slate-900">PKR {(Number(totals.debit) || 0).toLocaleString()}</td>
              <td className="px-6 py-6 text-right font-black text-xl text-blue-700">PKR {(Number(totals.credit) || 0).toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
        
        {totals.debit !== totals.credit && (
          <div className="mt-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center space-x-3 text-rose-700 font-bold text-sm">
            <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse"></div>
            <span>WARNING: System indicates a ledger imbalance of PKR {Math.abs(totals.debit - totals.credit).toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrialBalance;
