import React, { useState, useEffect } from 'react';
import { Company, Quotation, ProductionPiece, LedgerTransaction } from '@/modules/shared/types';
import { FinanceService } from '@/modules/finance/services/financeService';
import { SalesService } from '@/modules/sales/services/salesService';
import { ProductionService } from '@/modules/production/services/productionService';
import { FileText, CheckCircle2, Ban, ArrowRightLeft } from 'lucide-react';

const BillingHub: React.FC<{ company: Company }> = ({ company }) => {
  const [orders, setOrders] = useState<Quotation[]>([]);
  const [pieces, setPieces] = useState<ProductionPiece[]>([]);
  const [clients, setClients] = useState<any[]>([]);

  useEffect(() => {
    setOrders(SalesService.getQuotations().filter(q => q.company === company && q.status === 'Approved'));
    setPieces(ProductionService.getProductionPieces());
    setClients(SalesService.getClients());
  }, [company]);

  const isCycleComplete = (orderNo?: string) => {
    if (!orderNo) return false;
    const orderPieces = pieces.filter(p => p.orderId === orderNo);
    if (orderPieces.length === 0) return false;
    // For billing, we allow if delivered or simply if it's a service order without pieces
    return orderPieces.every(p => p.status === 'Delivered');
  };

  const handleGenerateInvoice = (order: Quotation) => {
      const client = clients.find(c => c.id === order.clientId);
      const clientName = client?.name || 'Walk-in';
      
      // 1. Calculate Revenue
      const totalRevenue = order.items.reduce((sum, item) => sum + item.amount, 0);
      
      // 2. Fetch All Accounts (to handle multi-company posting)
      const allAccounts = FinanceService.getAccounts();
      
      // --- SENDER SIDE (e.g. Glassco) ---
      const myAccounts = allAccounts.filter(a => a.company === company);
      // Logic: Find 'Receivables' and 'Sales'
      const receivableAcc = myAccounts.find(a => a.name.includes('RECEIVABLE') || a.code.startsWith('122')) || myAccounts.find(a => a.type === 'Asset');
      const revenueAcc = myAccounts.find(a => a.name.includes('SALES') || a.code.startsWith('411')) || myAccounts.find(a => a.type === 'Revenue');

      if (!receivableAcc || !revenueAcc) {
          return alert(`Error: Setup Chart of Accounts for ${company} first (Need Receivables & Sales accounts).`);
      }

      // 3. Create Ledger Transaction (Sender)
      const txId = `INV-${Date.now().toString().slice(-6)}`;
      const newLedgerEntries: LedgerTransaction[] = [];

      // ── CORRECT IFRS ENTRY: AR Dr / Revenue Cr / Sales Tax Payable Cr ──
      const salesTaxRate = 0.18; // 18% GST — adjust per company if needed
      const salesTaxAmount = Math.round(totalRevenue * salesTaxRate);
      const revenueNet = totalRevenue; // Revenue is net amount on invoice
      const arAmount = totalRevenue + salesTaxAmount; // AR = Net + Tax

      // Find Sales Tax Payable account
      const salesTaxAcc = myAccounts.find(a =>
        a.name.toLowerCase().includes('sales tax payable') ||
        a.name.toLowerCase().includes('output tax') ||
        a.code.startsWith('21311') || a.code.startsWith('2131')
      );

      const senderDetails: any[] = [
        { accountId: receivableAcc.id, debit: arAmount, credit: 0, text: `A/R — ${clientName}` },
        { accountId: revenueAcc.id, debit: 0, credit: revenueNet, text: `Revenue: ${order.projectName || 'General'}` },
      ];
      if (salesTaxAcc) {
        senderDetails.push({ accountId: salesTaxAcc.id, debit: 0, credit: salesTaxAmount, text: 'Sales Tax Payable (Output 18%)' });
      }

      const senderTx: LedgerTransaction = {
          id: txId,
          company,
          docType: 'DR',
          docDate: new Date().toISOString().split('T')[0],
          date: new Date().toISOString().split('T')[0],
          description: `INVOICE: ${clientName} - Ref: ${order.orderNo}`,
          referenceId: order.orderNo || order.id,
          status: 'Parked', // Park first — accountant reviews before posting
          details: senderDetails
      };
      newLedgerEntries.push(senderTx);

      // --- INTER-COMPANY AUTOMATION (The Magic) ---
      let mirrorMsg = "";
      
      // Detect if Client is a Sister Company
      let targetCompany: Company | null = null;
      const cNameUpper = clientName.toUpperCase();
      if (cNameUpper.includes('GTI')) targetCompany = 'GTI';
      else if (cNameUpper.includes('GTK')) targetCompany = 'GTK';
      else if (cNameUpper.includes('NIPPON')) targetCompany = 'Nippon';
      else if (cNameUpper.includes('GLASSCO')) targetCompany = 'Glassco';
      else if (cNameUpper.includes('FACTORY')) targetCompany = 'Factory';

      // Prevent self-billing (Glassco selling to Glassco)
      if (targetCompany && targetCompany !== company) {
          const targetAccounts = allAccounts.filter(a => a.company === targetCompany);
          
          // Logic: Find 'Cost of Sales/Material' and 'Payables' in Target
          // Debit: Expense/Asset (Purchase), Credit: Liability (Payable to Source)
          const costAcc = targetAccounts.find(a => a.name.includes('CONSUMED') || a.name.includes('MATERIAL') || a.code.startsWith('511')) || targetAccounts.find(a => a.type === 'Expense');
          const payableAcc = targetAccounts.find(a => a.name.includes('PAYABLE') || a.code.startsWith('221')) || targetAccounts.find(a => a.type === 'Liability');

          if (costAcc && payableAcc) {
              const receiverTx: LedgerTransaction = {
                  id: `BILL-${txId}`, // Linked ID
                  company: targetCompany,
                  docType: 'KR', // Vendor Invoice
                  docDate: new Date().toISOString().split('T')[0],
                  date: new Date().toISOString().split('T')[0],
                  description: `AUTO-PURCHASE: From ${company} - Ref: ${order.orderNo}`,
                  referenceId: txId,
                  status: 'Parked',
                  details: [
                      { accountId: costAcc.id, debit: totalRevenue, credit: 0, text: `Material Cost (Auto from ${company})` },
                      { accountId: payableAcc.id, debit: 0, credit: totalRevenue, text: `Payable to ${company}` }
                  ]
              };
              newLedgerEntries.push(receiverTx);
              mirrorMsg = `\n\n✨ INTER-COMPANY SYNC ACTIVE:\nPurchase Entry automatically posted in ${targetCompany} Books.\n(Dr: ${costAcc.name}, Cr: ${payableAcc.name})`;
          } else {
              mirrorMsg = `\n\n⚠️ Sync Warning: Could not auto-post to ${targetCompany}. Check their Chart of Accounts.`;
          }
      }

      // 4. Commit All Transactions
      const currentLedger = FinanceService.getLedger();
      FinanceService.saveLedger([...currentLedger, ...newLedgerEntries]);
      
      // 5. Visual Feedback
      alert(`Success: Invoice ${txId} Generated & Revenue Booked (PKR ${totalRevenue.toLocaleString()}).${mirrorMsg}`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
       <div className="bg-slate-900 text-white p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10"><FileText size={120} /></div>
          <div><h2 className="text-2xl font-black uppercase tracking-tight">SD Billing Engine</h2><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Invoice Generation Guardrails (Full Cycle Check)</p></div>
       </div>

       <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
          <table className="w-full text-left sap-table">
             <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                <tr>
                    <th className="px-6 py-3">Order Ref</th>
                    <th className="px-6 py-3">Business Partner</th>
                    <th className="px-6 py-3">Industrial Status</th>
                    <th className="px-6 py-3">Inter-Co Check</th>
                    <th className="px-6 py-3">Operation</th>
                </tr>
             </thead>
             <tbody>
                {orders.map(order => {
                  const complete = isCycleComplete(order.orderNo);
                  const client = clients.find(c => c.id === order.clientId);
                  const isInterCo = ['GTI', 'GTK', 'NIPPON', 'GLASSCO', 'FACTORY'].some(c => client?.name.toUpperCase().includes(c));

                  return (
                    <tr key={order.id}>
                       <td className="px-6 py-4 font-black text-blue-600">{order.orderNo}</td>
                       <td className="px-6 py-4 font-bold text-slate-700">{client?.name || 'Unknown'}</td>
                       <td className="px-6 py-4">
                          <div className="flex items-center space-x-2">
                             {complete ? <CheckCircle2 size={16} className="text-emerald-500"/> : <Ban size={16} className="text-rose-500"/>}
                             <span className={`text-[10px] font-black uppercase ${complete ? 'text-emerald-600' : 'text-rose-600'}`}>{complete ? 'Cycle Complete' : 'Production In-Progress'}</span>
                          </div>
                       </td>
                       <td className="px-6 py-4">
                          {isInterCo ? (
                              <div className="flex items-center space-x-1 text-indigo-600 bg-indigo-50 px-2 py-1 rounded w-fit border border-indigo-100">
                                  <ArrowRightLeft size={12}/>
                                  <span className="text-[9px] font-black uppercase">Auto-Mirror</span>
                              </div>
                          ) : (
                              <span className="text-[9px] text-slate-400 font-bold uppercase">-</span>
                          )}
                       </td>
                       <td className="px-6 py-4">
                          <button 
                            onClick={() => handleGenerateInvoice(order)}
                            disabled={!complete} 
                            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${complete ? 'bg-emerald-600 text-white shadow-lg hover:bg-emerald-700' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                          >
                            Generate Invoice
                          </button>
                       </td>
                    </tr>
                  );
                })}
             </tbody>
          </table>
       </div>
    </div>
  );
};

export default BillingHub;
