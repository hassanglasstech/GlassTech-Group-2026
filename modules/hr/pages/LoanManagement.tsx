
import React, { useState, useEffect, useRef } from 'react';
import { Employee, LoanAdvance, Requisition, Company } from '@/modules/shared/types';
import { HRService } from '@/modules/hr/services/hrService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { FinanceService } from '@/modules/finance/services/financeService';
import { Banknote, HandCoins, X, AlertCircle, FileUp, Download, Calendar, Edit2, Trash2, Fingerprint, FileText, Wallet, Layers } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';
import { useRealtimeRefresh } from '@/modules/shared/hooks/useRealtimeRefresh';
import { formatPKR, formatNumber, formatDate, formatMonthYear } from '@/modules/shared/utils/format';
import { KpiTile, KpiRow } from '@/modules/shared/components/KpiTile';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { EmptyState } from '@/modules/shared/components/EmptyState';

const LoanManagement: React.FC<{ company: Company }> = ({ company }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loans, setLoans] = useState<LoanAdvance[]>([]);
  const [authorizedReqs, setAuthorizedReqs] = useState<Requisition[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'Loan' | 'Advance'>('Advance');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statementEmpId, setStatementEmpId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [newLoan, setNewLoan] = useState<Partial<LoanAdvance>>({
    employeeId: '',
    type: 'Advance',
    amount: 0,
    repaymentAmount: 0,
    status: 'Active',
    date: new Date().toISOString().split('T')[0],
    requisitionId: ''
  });


  const { refreshKey } = useRealtimeRefresh(['loans', 'employees']);

  useEffect(() => {
    const emps = HRService.getEmployees().filter(e => e.company === company);
    setEmployees(emps);
    refreshData(emps);
  }, [company, selectedMonth, refreshKey]);

  const refreshData = (emps: Employee[]) => {
    const allLoans = HRService.getLoans();
    const filtered = allLoans.filter(l => 
      emps.some(e => e.id === l.employeeId) && 
      l.date.startsWith(selectedMonth)
    );
    setLoans(filtered);

    // Phase-7 (P5-1): reqType mismatch fix. Audit RC-20: PR module saves
    // reqType from the user-facing subCategory ("Loan Request" / "Salary
    // Advance"), but LoanAdvance.type uses canonical "Loan" / "Advance".
    // Previously approved loan PRs never appeared here → Hassan couldn't
    // disburse loans that had been approved. Now we accept both forms and
    // normalize when linking.
    const allReqs = InventoryService.getRequisitions().filter(Boolean);
    const relevant = allReqs.filter(r =>
      r.company === company &&
      r.status === 'Approved' &&
      ['Loan', 'Loan Request', 'Advance', 'Salary Advance'].includes(r.reqType as string)
    );
    setAuthorizedReqs(relevant);
  };

  // Normalize PR reqType → LoanAdvance.type
  const _normalizeLoanType = (reqType: string): 'Loan' | 'Advance' => {
    if (reqType === 'Loan Request' || reqType === 'Loan') return 'Loan';
    return 'Advance';   // 'Salary Advance' or 'Advance'
  };

  const handleLinkRequisition = (reqId: string) => {
      const req = authorizedReqs.find(r => r.id === reqId);
      if (req) {
          const normalizedType = _normalizeLoanType(req.reqType as string);
          setNewLoan(prev => ({
              ...prev,
              requisitionId: req.id,
              amount: req.totalValue,
              type: normalizedType,
              date: new Date().toISOString().split('T')[0] // Use current date for issuance
          }));
          setModalType(normalizedType);
      } else {
          setNewLoan(prev => ({ ...prev, requisitionId: '' }));
      }
  };

  const handleSaveLoan = () => {
    if (!newLoan.employeeId || !newLoan.amount || !newLoan.date) {
      toast.error("Please select employee, enter amount and date");
      return;
    }
    const finalRepayment = modalType === 'Advance' ? Number(newLoan.amount) : Number(newLoan.repaymentAmount);
    const allLoans = HRService.getLoans();
    
    const loanData = {
        ...newLoan,
        type: modalType,
        repaymentAmount: finalRepayment
    } as LoanAdvance;

    if (editingId) {
        const updated = allLoans.map(l => l.id === editingId ? { ...loanData, id: editingId } : l);
        HRService.saveLoans(updated);
    } else {
        const loan: LoanAdvance = { 
            ...loanData, 
            id: Date.now().toString()
        };
        HRService.saveLoans([...allLoans, loan]);

        // Phase 3: Mark Requisition as Completed/Disbursed
        if (newLoan.requisitionId) {
            const allReqs = InventoryService.getRequisitions().filter(Boolean);
            const updatedReqs = allReqs.map(r => r.id === newLoan.requisitionId ? { ...r, status: 'Completed' as const } : r);
            InventoryService.saveRequisitions(updatedReqs);
        }

        // GL Entry: Dr Staff Loans/Advances (1121), Cr Cash (1111)
        try {
          const emp = employees.find(e => e.id === newLoan.employeeId);
          const assetParent = FinanceService.ensureAccount(company as any, 'CURRENT ASSETS', 2, null, 'Asset', '11');
          const loanAcc     = FinanceService.ensureAccount(company as any, 'Staff Loans & Advances', 3, assetParent.id, 'Asset', '1121');
          const cashAcc     = FinanceService.ensureAccount(company as any, 'Cash in Hand', 3, assetParent.id, 'Asset', '1111');
          FinanceService.recordTransaction({
            id: `LOAN-DISB-${Date.now()}`,
            docType: 'JV',
            docDate: loanData.date,
            date: loanData.date,
            description: `${modalType} Disbursed — ${emp?.personal?.name || ''} — ${formatPKR(loanData.amount)}`,
            company,
            referenceId: loan.id,
            status: 'Parked',
            details: [
              { accountId: loanAcc.id, debit: Number(loanData.amount), credit: 0, text: `${modalType} issued` },
              { accountId: cashAcc.id, debit: 0, credit: Number(loanData.amount), text: 'Cash paid out' },
            ],
            createdBy: 'HR',
          });
        } catch(e) { console.warn('Loan GL entry failed', e); }
    }
    
    refreshData(employees);
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleEdit = (loan: LoanAdvance) => {
      setEditingId(loan.id);
      setModalType(loan.type);
      setNewLoan(loan);
      setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
      if (await confirmModal("Permanently delete this entry?")) {
          const updated = HRService.getLoans().filter(l => l.id !== id);
          HRService.saveLoans(updated);
          refreshData(employees);
      }
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data: any[] = XLSX.utils.sheet_to_json(ws);
      const importedLoans: LoanAdvance[] = data.map(row => {
        const emp = employees.find(e => e.work.employeeCode === row.EmployeeCode);
        if (!emp) return null;
        return {
          id: (Date.now() + Math.random()).toString(),
          employeeId: emp.id,
          date: row.Date || new Date().toISOString().split('T')[0],
          amount: Number(row.Amount) || 0,
          type: (row.Type as 'Loan' | 'Advance') || 'Advance',
          repaymentAmount: Number(row.RepaymentAmount) || 0,
          status: (row.Status as 'Active' | 'Paid') || 'Active'
        };
      }).filter(l => l !== null) as LoanAdvance[];
      const updated = [...HRService.getLoans(), ...importedLoans];
      HRService.saveLoans(updated);
      refreshData(employees);
      toast.success(`${importedLoans.length} financial records imported!`);
    };
    reader.readAsBinaryString(file);
  };

  const handleExportExcel = () => {
    const dataToExport = loans.map(loan => {
      const emp = employees.find(e => e.id === loan.employeeId);
      return { 'EmployeeCode': emp?.work.employeeCode, 'Name': emp?.personal.name, 'Date': loan.date, 'Amount': loan.amount, 'Type': loan.type, 'RepaymentAmount': loan.repaymentAmount, 'Status': loan.status };
    });
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Loans");
    XLSX.writeFile(wb, `${company}_Loans_Advances_${selectedMonth}.xlsx`);
  };

  const openNewEntryModal = (type: 'Loan' | 'Advance') => {
      setModalType(type);
      setEditingId(null);
      setNewLoan({
        employeeId: '',
        type: type,
        amount: 0,
        repaymentAmount: 0,
        status: 'Active',
        date: new Date().toISOString().split('T')[0],
        requisitionId: ''
      });
      setIsModalOpen(true);
  };

  // Tab KPIs — derived from the month-filtered loans already in state (real values only)
  const activeCount    = loans.filter(l => l.status === 'Active').length;
  const totalDisbursed = loans.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const monthlyRepay   = loans.reduce((s, l) => s + (Number(l.repaymentAmount) || 0), 0);

  return (
    <div className="space-y-4">
      {statementEmpId && (() => {
        const emp = employees.find(e => e.id === statementEmpId);
        return emp ? <LoanStatementModal empId={statementEmpId} empName={emp.personal.name} onClose={() => setStatementEmpId(null)} /> : null;
      })()}
      {/* ── KPI row ── */}
      <KpiRow>
        <KpiTile label="Records" value={formatNumber(loans.length)} icon={<Layers size={16} />} tone="primary" hint={formatMonthYear(selectedMonth)} />
        <KpiTile label="Active" value={formatNumber(activeCount)} icon={<HandCoins size={16} />} tone="warning" hint={`${loans.length - activeCount} settled`} />
        <KpiTile label="Disbursed" value={`PKR ${formatNumber(totalDisbursed)}`} icon={<Banknote size={16} />} tone="info" hint="this month" />
        <KpiTile label="Repay / Mo" value={`PKR ${formatNumber(monthlyRepay)}`} icon={<Wallet size={16} />} tone="success" hint="monthly deduction" />
      </KpiRow>

      {/* ── Toolbar: month filter + actions ── */}
      <div className="flex items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-2">
          <Calendar className="text-slate-400" size={16} />
          <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="sap-input py-1.5 text-label font-bold" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input type="file" ref={fileInputRef} onChange={handleImportExcel} className="hidden" accept=".xlsx, .xls" />
          <button onClick={() => fileInputRef.current?.click()} className="sap-btn-ghost flex items-center gap-2"><FileUp size={14} /><span>Import</span></button>
          <button onClick={handleExportExcel} className="sap-btn-ghost flex items-center gap-2"><Download size={14} /><span>Export</span></button>
          <button onClick={() => openNewEntryModal('Advance')} className="sap-btn-ghost flex items-center gap-2"><HandCoins size={14} /><span>Advance</span></button>
          <button onClick={() => openNewEntryModal('Loan')} className="sap-btn-primary flex items-center gap-2"><Banknote size={14} /><span>New Loan</span></button>
        </div>
      </div>

      <div className="bg-white rounded-card border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-2xs font-black uppercase text-slate-500 tracking-widest"><th className="px-8 py-5">Employee Profile</th><th className="px-6 py-5">Issuance Date</th><th className="px-6 py-5">Category</th><th className="px-6 py-5">Original Amt.</th><th className="px-6 py-5">Repay/Mo</th><th className="px-6 py-5">Status</th><th className="px-6 py-5 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loans.length > 0 ? loans.map(loan => {
              const emp = employees.find(e => e.id === loan.employeeId);
              return (
                <tr key={loan.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-8 py-4"><div className="flex items-center gap-2"><div><p className="font-bold text-slate-900 leading-tight">{emp?.personal.name}</p><p className="text-2xs text-slate-400 font-bold uppercase tracking-tight">{emp?.work.employeeCode}</p></div><button onClick={() => setStatementEmpId(loan.employeeId)} title="View full statement" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><FileText size={13}/></button></div></td>
                  <td className="px-6 py-4 font-black text-slate-500 text-xs uppercase tracking-tighter">{formatDate(loan.date)}</td>
                  <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-lg text-2xs font-black uppercase tracking-widest border ${loan.type === 'Loan' ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>{loan.type}</span>
                      {loan.requisitionId && <span className="ml-2 inline-flex items-center text-2xs font-bold text-emerald-600 bg-emerald-50 px-1 rounded border border-emerald-100"><Fingerprint size={8}/> PR LINKED</span>}
                  </td>
                  <td className="px-6 py-4 font-black text-slate-900">{formatPKR(loan.amount)}</td>
                  <td className="px-6 py-4 font-bold text-slate-600">{formatPKR(loan.repaymentAmount)}</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={loan.status} size="sm" />
                  </td>
                  <td className="px-6 py-4 text-right">
                      <div className="flex justify-end space-x-2">
                          <button onClick={() => handleEdit(loan)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={14}/></button>
                          <button onClick={() => handleDelete(loan.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={14}/></button>
                      </div>
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan={7} className="p-0">
                <EmptyState
                  icon={<HandCoins size={22} />}
                  title={`No records for ${formatMonthYear(selectedMonth)}`}
                  description="No loans or advances were issued this month. Disburse an advance or a new loan to start the ledger."
                  action={{ label: 'New Loan', icon: <Banknote size={14} />, onClick: () => openNewEntryModal('Loan') }}
                  secondaryAction={{ label: 'Advance', icon: <HandCoins size={14} />, onClick: () => openNewEntryModal('Advance') }}
                />
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-modal"><div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-200">
        <div className="p-10 space-y-8 bg-slate-50">
          {!editingId && authorizedReqs.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-card animate-in fade-in">
              <label className="text-2xs font-black uppercase tracking-[0.2em] text-emerald-700 ml-1 mb-2 block">Link Approved Request (Optional)</label>
              <select className="w-full bg-white border border-emerald-200 p-3 rounded-xl text-xs font-bold outline-none text-emerald-900" onChange={(e) => handleLinkRequisition(e.target.value)} value={newLoan.requisitionId || ''}>
                <option value="">-- Direct Issuance (No Link) --</option>
                {authorizedReqs.map(req => (
                  <option key={req.id} value={req.id}>{req.id} | {req.requisitioner} | {req.reqType?.toUpperCase() || 'N/A'} | {formatPKR(req.totalValue || 0)}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-2"><label className="text-2xs font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Employee Profile</label><select className="w-full bg-white border-2 border-slate-100 p-4 rounded-2xl outline-none font-bold text-slate-900 shadow-sm focus:border-blue-500 transition-all" onChange={e => setNewLoan({...newLoan, employeeId: e.target.value})} value={newLoan.employeeId} disabled={!!editingId}><option value="">Select Associate...</option>{employees.map(e => <option key={e.id} value={e.id}>{e.personal.name} ({e.work.employeeCode})</option>)}</select></div>
            <div className="space-y-2"><label className="text-2xs font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Ledger Date</label><input type="date" className="w-full bg-white border-2 border-slate-100 p-4 rounded-2xl font-bold outline-none shadow-sm focus:border-blue-500 transition-all" value={newLoan.date} onChange={e => setNewLoan({...newLoan, date: e.target.value})} /></div>
          </div>
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-2"><label className="text-2xs font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Total Principal (PKR)</label><input type="number" className="w-full bg-white border-2 border-slate-100 p-4 rounded-2xl font-black text-slate-900 outline-none shadow-sm focus:border-blue-500 transition-all" value={newLoan.amount || ''} onChange={e => setNewLoan({...newLoan, amount: Number(e.target.value)})} /></div>
            {modalType === 'Loan' && (<div className="space-y-2"><label className="text-2xs font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Repayment/Mo (PKR)</label><input type="number" className="w-full bg-white border-2 border-slate-100 p-4 rounded-2xl font-black text-blue-600 outline-none shadow-sm focus:border-blue-500 transition-all" value={newLoan.repaymentAmount || ''} onChange={e => setNewLoan({...newLoan, repaymentAmount: Number(e.target.value)})} /></div>)}
            {modalType === 'Advance' && (<div className="bg-blue-50 p-4 rounded-card border border-blue-100 flex items-center justify-center"><p className="text-2xs font-black text-blue-700 uppercase">Auto-Deduct Full Amount</p></div>)}
          </div>
          <div className="bg-amber-50 p-6 rounded-card border border-amber-100 flex items-start space-x-4"><AlertCircle className="text-amber-500 shrink-0 mt-1" size={20} /><p className="text-2xs font-bold text-amber-700 uppercase leading-relaxed tracking-tight">{modalType === 'Advance' ? 'Note: This advance will be deducted in full from the upcoming salary cycle.' : 'Note: Monthly repayments will be automatically deducted during the payroll generation process.'}</p></div>
        </div>
        <div className="px-10 py-8 bg-white border-t flex justify-end space-x-4">
          <button onClick={() => { setIsModalOpen(false); setEditingId(null); }} className="px-8 py-3 text-slate-400 font-black uppercase text-xs tracking-widest hover:text-slate-600">Discard</button>
          <button onClick={handleSaveLoan} className={`${modalType === 'Loan' ? 'bg-slate-900' : 'bg-blue-600'} text-white px-12 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl transition-all hover:scale-[1.02] active:scale-95`}>{editingId ? 'Update Record' : 'Post Transaction'}</button>
        </div>
      </div></div>)}
    </div>
  );
};


// ── Loan Statement Modal ──────────────────────────────────────────────
const LoanStatementModal: React.FC<{ empId: string; empName: string; onClose: () => void }> = ({ empId, empName, onClose }) => {
  const allLoans = HRService.getLoans().filter(l => l.employeeId === empId).sort((a,b) => a.date.localeCompare(b.date));
  const total = allLoans.reduce((s, l) => s + l.amount, 0);
  const recovered = allLoans.reduce((s, l) => s + (l.repaymentAmount || 0), 0);
  const outstanding = total - recovered;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-modal p-4">
      <div className="bg-white rounded-card w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-900 rounded-t-2xl">
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Loan Statement</p>
            <p className="text-white font-black text-lg">{empName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-2"><X size={20}/></button>
        </div>
        <div className="grid grid-cols-3 gap-4 p-4 border-b bg-slate-50">
          <div className="text-center"><p className="text-2xs font-black text-slate-400 uppercase">Total Disbursed</p><p className="text-xl font-black text-slate-800">{formatPKR(total)}</p></div>
          <div className="text-center"><p className="text-2xs font-black text-slate-400 uppercase">Recovered</p><p className="text-xl font-black text-emerald-600">{formatPKR(recovered)}</p></div>
          <div className="text-center"><p className="text-2xs font-black text-slate-400 uppercase">Outstanding</p><p className="text-xl font-black text-rose-600">{formatPKR(outstanding)}</p></div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {allLoans.length === 0 ? <p className="text-sm text-slate-400 italic text-center py-8">No loans/advances on record</p> : (
            <table className="w-full text-xs border-collapse">
              <thead><tr className="bg-slate-50 text-2xs font-black text-slate-500 uppercase">
                <th className="p-2 text-left">Date</th><th className="p-2 text-left">Type</th>
                <th className="p-2 text-right">Amount</th><th className="p-2 text-right">Recovered</th>
                <th className="p-2 text-right">Outstanding</th><th className="p-2 text-center">Status</th>
              </tr></thead>
              <tbody>
                {allLoans.map(l => (
                  <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-2 font-bold">{formatDate(l.date)}</td>
                    <td className="p-2"><span className={`px-2 py-0.5 rounded-full text-2xs font-black ${l.type === 'Loan' ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-600'}`}>{l.type}</span></td>
                    <td className="p-2 text-right font-bold">{formatNumber(l.amount)}</td>
                    <td className="p-2 text-right text-emerald-600 font-bold">{formatNumber(l.repaymentAmount||0)}</td>
                    <td className="p-2 text-right text-rose-600 font-black">{formatNumber(l.amount - (l.repaymentAmount||0))}</td>
                    <td className="p-2 text-center"><span className={`px-2 py-0.5 rounded-full text-2xs font-black ${l.status === 'Paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{l.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoanManagement;
