
import React, { useState, useMemo } from 'react';
import { Company, Account } from '@/modules/shared/types';
import { FinanceService } from '@/modules/finance/services/financeService';
import { Calendar, Filter, Printer, Download, AlertCircle, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import * as XLSX from 'xlsx';

const AgingReport: React.FC<{ company: Company }> = ({ company }) => {
  const [reportType, setReportType] = useState<'Receivable' | 'Payable'>('Receivable');
  const [agingDate, setAgingDate] = useState(new Date().toISOString().split('T')[0]);

  const accounts = FinanceService.getAccounts().filter(a => a.company === company);
  const ledger = FinanceService.getLedger().filter(t => t.company === company && t.status === 'Posted');

  // 1. Identify Parent Control Accounts (Level 4/3) to filter children
  const controlAccounts = useMemo(() => {
    return accounts.filter(a => 
      (a.level === 3 || a.level === 4) && 
      (reportType === 'Receivable' ? a.type === 'Asset' : a.type === 'Liability')
    );
  }, [accounts, reportType]);

  const [selectedParentId, setSelectedParentId] = useState<string>('');

  // 2. Calculate Aging Logic
  const agingData = useMemo(() => {
    // Filter Target Accounts (Level 5 children of selected parent, or all if none selected)
    const targetAccounts = accounts.filter(a => 
        a.level === 5 && 
        (a.type === (reportType === 'Receivable' ? 'Asset' : 'Liability')) &&
        (selectedParentId ? a.parentId === selectedParentId : true)
    );

    return targetAccounts.map(acc => {
        // A. Get All Transactions for this Account
        const txs = ledger.flatMap(t => 
            t.details.filter(d => d.accountId === acc.id).map(d => ({
                date: t.date,
                debit: d.debit,
                credit: d.credit,
                ref: t.id
            }))
        ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Newest First

        // B. Calculate Net Balance
        const totalDebit = txs.reduce((s, t) => s + t.debit, 0);
        const totalCredit = txs.reduce((s, t) => s + t.credit, 0);
        const balance = reportType === 'Receivable' ? (totalDebit - totalCredit) : (totalCredit - totalDebit);

        // Filter out zero balance accounts
        if (Math.abs(balance) < 1) return null;

        // C. FIFO Aging Algorithm
        // Walk backwards from newest transactions to "explain" the outstanding balance.
        let remainingBalance = balance;
        const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
        const refDate = new Date(agingDate);

        for (const tx of txs) {
            if (remainingBalance <= 0) break;

            // For Receivables, we look at Debits (Invoices) that make up the balance.
            // For Payables, we look at Credits (Bills) that make up the balance.
            const txValue = reportType === 'Receivable' ? tx.debit : tx.credit;

            if (txValue > 0) {
                const amountToAge = Math.min(remainingBalance, txValue);
                const txDate = new Date(tx.date);
                const diffDays = Math.ceil((refDate.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24));

                if (diffDays <= 30) buckets['0-30'] += amountToAge;
                else if (diffDays <= 60) buckets['31-60'] += amountToAge;
                else if (diffDays <= 90) buckets['61-90'] += amountToAge;
                else buckets['90+'] += amountToAge;

                remainingBalance -= amountToAge;
            }
        }

        return {
            id: acc.id,
            code: acc.code,
            name: acc.name,
            balance,
            buckets
        };
    }).filter(Boolean) as { id: string, code: string, name: string, balance: number, buckets: Record<string, number> }[];

  }, [accounts, ledger, reportType, selectedParentId, agingDate]);

  const totals = useMemo(() => {
      return agingData.reduce((acc, curr) => ({
          balance: acc.balance + curr.balance,
          b30: acc.b30 + curr.buckets['0-30'],
          b60: acc.b60 + curr.buckets['31-60'],
          b90: acc.b90 + curr.buckets['61-90'],
          bPlus: acc.bPlus + curr.buckets['90+']
      }), { balance: 0, b30: 0, b60: 0, b90: 0, bPlus: 0 });
  }, [agingData]);

  const handleExport = () => {
      const exportData = agingData.map(d => ({
          'Account Code': d.code,
          'Party Name': d.name,
          'Total Outstanding': d.balance,
          '0-30 Days': d.buckets['0-30'],
          '31-60 Days': d.buckets['31-60'],
          '61-90 Days': d.buckets['61-90'],
          '90+ Days': d.buckets['90+']
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Aging Report");
      XLSX.writeFile(wb, `${company}_Aging_${reportType}_${agingDate}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-slate-900 text-white p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden">
         <div className="absolute top-0 right-0 p-8 opacity-10"><Clock size={140} /></div>
         <div>
            <h2 className="text-3xl font-black uppercase tracking-tight">Aging Analysis</h2>
            <p className="text-[10px] font-bold text-blue-300 uppercase tracking-widest mt-1">Cash Flow Health & Outstanding Dues</p>
         </div>
         <div className="flex flex-col items-end z-10">
            <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Total {reportType} Exposure</p>
            <p className={`text-4xl font-black ${reportType === 'Receivable' ? 'text-emerald-400' : 'text-rose-400'}`}>PKR {totals.balance.toLocaleString()}</p>
         </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-4 justify-between items-center no-print">
         <div className="flex items-center space-x-4">
            <div className="flex bg-slate-100 p-1 rounded-xl">
               <button 
                 onClick={() => setReportType('Receivable')} 
                 className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${reportType === 'Receivable' ? 'bg-white shadow text-emerald-600' : 'text-slate-500'}`}
               >
                  <TrendingUp size={14}/> <span>Receivables (Assets)</span>
               </button>
               <button 
                 onClick={() => setReportType('Payable')} 
                 className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${reportType === 'Payable' ? 'bg-white shadow text-rose-600' : 'text-slate-500'}`}
               >
                  <TrendingDown size={14}/> <span>Payables (Liabilities)</span>
               </button>
            </div>
            
            <div className="h-8 w-px bg-slate-200"></div>

            <div className="flex flex-col space-y-1">
               <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Filter Control Account</label>
               <div className="flex items-center space-x-2">
                  <Filter size={14} className="text-slate-400"/>
                  <select 
                    className="bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-xs font-bold w-64 outline-none"
                    value={selectedParentId}
                    onChange={e => setSelectedParentId(e.target.value)}
                  >
                     <option value="">All {reportType} Accounts</option>
                     {controlAccounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                  </select>
               </div>
            </div>
         </div>

         <div className="flex items-center space-x-4">
            <div className="flex flex-col space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Reference Date</label>
                <div className="flex items-center space-x-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                    <Calendar size={14} className="text-slate-500"/>
                    <input type="date" value={agingDate} onChange={e => setAgingDate(e.target.value)} className="bg-transparent text-xs font-bold outline-none"/>
                </div>
            </div>
            <button onClick={handleExport} className="p-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 transition-all"><Download size={20}/></button>
            <button onClick={() => window.print()} className="p-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-lg transition-all"><Printer size={20}/></button>
         </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
         <table className="w-full text-left sap-table">
            <thead className="bg-slate-50 border-b text-[10px] font-black uppercase tracking-widest text-slate-500">
               <tr>
                  <th className="px-6 py-4">Account Profile</th>
                  <th className="px-6 py-4 text-right">Total Balance</th>
                  <th className="px-6 py-4 text-right text-emerald-600">0-30 Days</th>
                  <th className="px-6 py-4 text-right text-amber-600">31-60 Days</th>
                  <th className="px-6 py-4 text-right text-orange-600">61-90 Days</th>
                  <th className="px-6 py-4 text-right text-rose-600">90+ Days</th>
                  <th className="px-6 py-4 text-center">Status</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-medium">
               {agingData.map(row => {
                  const isCritical = row.buckets['90+'] > 0;
                  return (
                     <tr key={row.id} className="hover:bg-slate-50 group">
                        <td className="px-6 py-4">
                           <p className="font-black text-slate-800 text-sm uppercase">{row.name}</p>
                           <p className="text-[10px] font-bold text-slate-400 font-mono">{row.code}</p>
                        </td>
                        <td className="px-6 py-4 text-right font-black text-slate-900 text-base">{row.balance.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right text-emerald-700 bg-emerald-50/30 font-bold">{row.buckets['0-30'] > 0 ? row.buckets['0-30'].toLocaleString() : '-'}</td>
                        <td className="px-6 py-4 text-right text-amber-700 bg-amber-50/30 font-bold">{row.buckets['31-60'] > 0 ? row.buckets['31-60'].toLocaleString() : '-'}</td>
                        <td className="px-6 py-4 text-right text-orange-700 bg-orange-50/30 font-bold">{row.buckets['61-90'] > 0 ? row.buckets['61-90'].toLocaleString() : '-'}</td>
                        <td className="px-6 py-4 text-right text-rose-700 bg-rose-50/30 font-bold">{row.buckets['90+'] > 0 ? row.buckets['90+'].toLocaleString() : '-'}</td>
                        <td className="px-6 py-4 text-center">
                           {isCritical && (
                              <div className="inline-flex items-center space-x-1 bg-rose-100 text-rose-700 px-2 py-1 rounded text-[9px] font-black uppercase">
                                 <AlertCircle size={10}/> <span>Critical</span>
                              </div>
                           )}
                        </td>
                     </tr>
                  );
               })}
               {agingData.length === 0 && (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-300 font-bold uppercase italic text-xs">No outstanding balances found for this selection.</td></tr>
               )}
            </tbody>
            <tfoot className="bg-slate-100 border-t border-slate-200">
               <tr>
                  <td className="px-6 py-4 font-black text-xs uppercase text-slate-600">Grand Total</td>
                  <td className="px-6 py-4 text-right font-black text-sm text-slate-900">{totals.balance.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-black text-emerald-700">{totals.b30.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-black text-amber-700">{totals.b60.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-black text-orange-700">{totals.b90.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-black text-rose-700">{totals.bPlus.toLocaleString()}</td>
                  <td></td>
               </tr>
            </tfoot>
         </table>
      </div>
    </div>
  );
};

export default AgingReport;
