
import React, { useState, useMemo } from 'react';
import { Company } from '@/modules/shared/types';
import { FinanceService } from '@/modules/finance/services/financeService';
import { FileText, PieChart, TrendingUp, Landmark, ChevronDown, ChevronRight, Printer, ArrowRightLeft } from 'lucide-react';

const FinancialStatements: React.FC<{ company: Company }> = ({ company }) => {
  const [reportType, setReportType] = useState<'PL' | 'BS' | 'CF'>('PL');
  const accounts = FinanceService.getAccounts().filter(a => a.company === company);
  const ledger = FinanceService.getLedger().filter(t => t.company === company);

  const stats = useMemo(() => {
    // 1. Calculate Account Balances
    const balances: Record<string, number> = {};
    accounts.forEach(acc => {
      balances[acc.id] = 0;
      ledger.forEach(tx => {
        tx.details.forEach(d => {
          if (d.accountId === acc.id) {
            balances[acc.id] += (d.debit - d.credit); // Asset/Exp nature (Dr +)
          }
        });
      });
    });

    // Helper to get total balance of a group
    const getGroupBalance = (type: string) => accounts
      .filter(a => a.type === type)
      .reduce((sum, a) => sum + balances[a.id], 0);

    // PL Data
    const rev = Math.abs(getGroupBalance('Revenue')); // Credit nature
    const exp = Math.abs(getGroupBalance('Expense')); // Debit nature
    const netProfit = rev - exp;

    // BS Data
    const assets = getGroupBalance('Asset');
    const liab = Math.abs(getGroupBalance('Liability'));
    const equity = Math.abs(getGroupBalance('Equity'));

    // Cash Flow Logic (Indirect Method)
    
    // A. Operating Activities
    // 1. Net Profit (Start)
    // 2. Working Capital Changes:
    //    - Current Assets (Excluding Cash): 12xxx (Inventory 121, Rec 122). Increase = Outflow (-)
    //    - Current Liabilities: 22xxx (Payables). Increase = Inflow (+)
    
    let changeReceivables = 0; // 122...
    let changeInventory = 0;   // 121...
    let changePayables = 0;    // 22...
    
    // B. Investing Activities
    //    - Non-Current Assets (PPE): 11xxx. Increase = Outflow (-)
    let changePPE = 0; 

    // C. Financing Activities
    //    - Equity: 3xxxx. Increase = Inflow (+)
    //    - Non-Current Liab: 21xxx. Increase = Inflow (+)
    let changeEquity = 0;
    let changeLongTermLiab = 0;

    // Cash Reconciliation
    let openingCash = 0; // 123...
    let closingCash = 0; // 123...

    accounts.forEach(acc => {
        const bal = balances[acc.id];
        const code = acc.code;

        // Cash Accounts (123...)
        if (code.startsWith('123')) {
            closingCash += bal;
            // Simplified: Assuming Ledger contains 'OB' (Opening Balance) transactions
            // Ideally we check dates, but for now Total Balance = Closing Cash
        }
        // Investing: Fixed Assets (11...)
        else if (code.startsWith('11')) {
            changePPE += bal; // Dr Balance means purchased asset -> Cash Outflow
        }
        // Operating: Inventory (121...)
        else if (code.startsWith('121')) {
            changeInventory += bal; // Dr Balance increase -> Cash Outflow
        }
        // Operating: Receivables (122...)
        else if (code.startsWith('122')) {
            changeReceivables += bal; // Dr Balance increase -> Cash Outflow
        }
        // Operating: Current Liab (22...)
        else if (code.startsWith('22')) {
            changePayables += Math.abs(bal); // Cr Balance increase -> Cash Inflow
        }
        // Financing: Non-Current Liab (21...)
        else if (code.startsWith('21')) {
            changeLongTermLiab += Math.abs(bal);
        }
        // Financing: Equity (3...)
        else if (code.startsWith('3')) {
            changeEquity += Math.abs(bal);
        }
    });

    const operatingCashFlow = netProfit + changePayables - changeReceivables - changeInventory;
    const investingCashFlow = -changePPE; // Purchase is negative
    const financingCashFlow = changeEquity + changeLongTermLiab;
    const netCashChange = operatingCashFlow + investingCashFlow + financingCashFlow;

    return { 
        rev, exp, netProfit, assets, liab, equity,
        cf: {
            operating: operatingCashFlow,
            investing: investingCashFlow,
            financing: financingCashFlow,
            netChange: netCashChange,
            closingCash,
            details: {
                inventory: -changeInventory,
                receivables: -changeReceivables,
                payables: changePayables,
                ppe: -changePPE,
                equity: changeEquity + changeLongTermLiab
            }
        }
    };
  }, [accounts, ledger]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex bg-white p-1 border border-slate-200 w-fit rounded no-print">
        <button onClick={() => setReportType('PL')} className={`px-6 py-2 text-xs font-bold uppercase transition-all ${reportType === 'PL' ? 'bg-[#0a6ed1] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Profit & Loss</button>
        <button onClick={() => setReportType('BS')} className={`px-6 py-2 text-xs font-bold uppercase transition-all ${reportType === 'BS' ? 'bg-[#0a6ed1] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Balance Sheet</button>
        <button onClick={() => setReportType('CF')} className={`px-6 py-2 text-xs font-bold uppercase transition-all ${reportType === 'CF' ? 'bg-[#0a6ed1] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Cash Flow Stmt</button>
      </div>

      <div className="bg-white border border-slate-300 shadow-xl p-12 min-h-[900px] max-w-[1000px] mx-auto print:shadow-none print:border-none">
        <div className="flex justify-between items-start border-b-2 border-slate-900 pb-8 mb-10">
          <div>
            <h1 className="text-3xl font-bold uppercase tracking-tight text-slate-900">{company} BUSINESS UNIT</h1>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#0a6ed1] mt-1">
              {reportType === 'PL' ? 'Consolidated Profit & Loss Account' : reportType === 'BS' ? 'Consolidated Balance Sheet' : 'Statement of Cash Flows'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Accounting Standard: IFRS</p>
            <p className="text-lg font-black">As of {new Date().toLocaleDateString()}</p>
          </div>
        </div>

        {reportType === 'PL' && (
          <div className="space-y-12 animate-in fade-in">
            <section>
              <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-2"><h3 className="text-sm font-black uppercase text-slate-700">Operating Revenue</h3></div>
              <div className="space-y-4">
                 <div className="flex justify-between text-sm font-medium text-slate-600"><span>Gross Sales & Services</span><span>PKR {stats.rev.toLocaleString()}</span></div>
                 <div className="flex justify-between font-black text-slate-900 text-lg border-t-2 border-slate-900 pt-4 mt-4"><span>TOTAL INCOME</span><span>PKR {stats.rev.toLocaleString()}</span></div>
              </div>
            </section>

            <section>
              <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-2"><h3 className="text-sm font-black uppercase text-rose-600">Administrative Expenditure</h3></div>
              <div className="space-y-4">
                 <div className="flex justify-between text-sm font-medium text-slate-600"><span>Cost of Goods Sold / Materials</span><span>(PKR {stats.exp.toLocaleString()})</span></div>
                 <div className="flex justify-between font-black text-rose-700 text-lg border-t-2 border-slate-900 pt-4 mt-4"><span>TOTAL OPERATING EXPENSES</span><span>(PKR {stats.exp.toLocaleString()})</span></div>
              </div>
            </section>

            <div className="mt-20 p-10 bg-slate-50 border-y-4 border-slate-900 flex justify-between items-center">
               <div><p className="text-2xl font-black text-slate-900 uppercase">Net Result (EBIT)</p></div>
               <p className={`text-4xl font-black ${stats.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  PKR {stats.netProfit.toLocaleString()}
               </p>
            </div>
          </div>
        )}

        {reportType === 'BS' && (
          <div className="grid grid-cols-2 gap-16 animate-in fade-in">
            <div className="space-y-8">
               <h3 className="text-sm font-black uppercase text-[#0a6ed1] border-b border-blue-100 pb-2">Total Assets</h3>
               <div className="flex justify-between font-black text-xl text-slate-900"><span>Non-Current & Current Assets</span><span>PKR {stats.assets.toLocaleString()}</span></div>
            </div>
            <div className="space-y-8">
               <h3 className="text-sm font-black uppercase text-slate-900 border-b border-slate-200 pb-2">Liabilities & Equity</h3>
               <div className="space-y-4">
                  <div className="flex justify-between text-sm font-bold text-slate-600"><span>Share Capital & Reserves</span><span>PKR {stats.equity.toLocaleString()}</span></div>
                  <div className="flex justify-between text-sm font-bold text-slate-600"><span>Total Liabilities</span><span>PKR {stats.liab.toLocaleString()}</span></div>
                  <div className="flex justify-between font-black text-xl text-slate-900 border-t border-slate-900 pt-4"><span>EQUITY & LIABILITIES</span><span>PKR {(stats.equity + stats.liab).toLocaleString()}</span></div>
               </div>
            </div>
          </div>
        )}

        {reportType === 'CF' && (
          <div className="space-y-10 animate-in fade-in">
             <section className="space-y-4">
                <h3 className="text-sm font-black uppercase text-slate-700 border-b-2 border-slate-900 pb-2">Operating Activities</h3>
                <div className="pl-4 space-y-3">
                   <div className="flex justify-between text-sm font-bold text-slate-800"><span>Net Profit / (Loss)</span><span>{stats.netProfit.toLocaleString()}</span></div>
                   <div className="text-[10px] font-black uppercase text-slate-400 mt-2">Adjustments for Working Capital:</div>
                   <div className="flex justify-between text-sm text-slate-600"><span>(Increase)/Dec in Inventory</span><span>{stats.cf.details.inventory.toLocaleString()}</span></div>
                   <div className="flex justify-between text-sm text-slate-600"><span>(Increase)/Dec in Receivables</span><span>{stats.cf.details.receivables.toLocaleString()}</span></div>
                   <div className="flex justify-between text-sm text-slate-600"><span>Increase/(Dec) in Payables</span><span>{stats.cf.details.payables.toLocaleString()}</span></div>
                   <div className={`flex justify-between text-base font-black border-t pt-2 ${stats.cf.operating >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      <span>Net Cash from Operations</span><span>{stats.cf.operating.toLocaleString()}</span>
                   </div>
                </div>
             </section>

             <section className="space-y-4">
                <h3 className="text-sm font-black uppercase text-slate-700 border-b-2 border-slate-900 pb-2">Investing Activities</h3>
                <div className="pl-4 space-y-3">
                   <div className="flex justify-between text-sm text-slate-600"><span>Purchase of Fixed Assets (PPE)</span><span>{stats.cf.details.ppe.toLocaleString()}</span></div>
                   <div className={`flex justify-between text-base font-black border-t pt-2 ${stats.cf.investing >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      <span>Net Cash from Investing</span><span>{stats.cf.investing.toLocaleString()}</span>
                   </div>
                </div>
             </section>

             <section className="space-y-4">
                <h3 className="text-sm font-black uppercase text-slate-700 border-b-2 border-slate-900 pb-2">Financing Activities</h3>
                <div className="pl-4 space-y-3">
                   <div className="flex justify-between text-sm text-slate-600"><span>Capital Injection & Loans</span><span>{stats.cf.details.equity.toLocaleString()}</span></div>
                   <div className={`flex justify-between text-base font-black border-t pt-2 ${stats.cf.financing >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      <span>Net Cash from Financing</span><span>{stats.cf.financing.toLocaleString()}</span>
                   </div>
                </div>
             </section>

             <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 mt-8">
                <div className="flex justify-between items-center mb-2">
                   <span className="text-xs font-bold text-slate-500 uppercase">Net Increase / (Decrease) in Cash</span>
                   <span className={`text-xl font-black ${stats.cf.netChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{stats.cf.netChange.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center mb-4 border-b border-slate-200 pb-4">
                   <span className="text-xs font-bold text-slate-500 uppercase">Opening Cash Balance</span>
                   <span className="text-lg font-bold text-slate-700">0</span>
                </div>
                <div className="flex justify-between items-center">
                   <span className="text-sm font-black text-slate-900 uppercase">Closing Cash & Bank Balance</span>
                   <span className="text-2xl font-black text-blue-700">PKR {stats.cf.closingCash.toLocaleString()}</span>
                </div>
             </div>
          </div>
        )}

        <div className="mt-40 grid grid-cols-2 gap-24 no-print border-t border-slate-100 pt-10">
           <div className="text-center"><p className="text-[10px] font-bold uppercase text-slate-400">Authorized Signature - Finance</p></div>
           <div className="text-center"><p className="text-[10px] font-bold uppercase text-slate-400">Authorized Signature - Auditor</p></div>
        </div>
      </div>
      
      <div className="flex justify-center no-print">
         <button onClick={() => window.print()} className="sap-btn-primary flex items-center space-x-2 px-12 py-3 shadow-2xl">
            <Printer size={16}/> <span>Print Formal Report</span>
         </button>
      </div>
    </div>
  );
};

export default FinancialStatements;
