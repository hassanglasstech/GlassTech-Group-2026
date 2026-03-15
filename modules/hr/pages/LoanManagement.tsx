
import React, { useState, useEffect, useRef } from 'react';
import { Company, Employee, LoanAdvance, Requisition } from '../../shared/types';
import { HRService } from '../services/hrService';
import { InventoryService } from '../../procurement/services/inventoryService';
import { Plus, Search, CheckCircle, Clock, Banknote, HandCoins, X, AlertCircle, FileUp, Download, Calendar, Edit2, Trash2, Fingerprint } from 'lucide-react';
import * as XLSX from 'xlsx';

import { useAppStore } from '../../shared/store/appStore';
import { toast } from 'sonner';

const LoanManagement: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loans, setLoans] = useState<LoanAdvance[]>([]);
  const [authorizedReqs, setAuthorizedReqs] = useState<Requisition[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'Loan' | 'Advance'>('Advance');
  const [editingId, setEditingId] = useState<string | null>(null);
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

  useEffect(() => {
    const emps = HRService.getEmployees().filter(e => e.company === company);
    setEmployees(emps);
    refreshData(emps);
  }, [company, selectedMonth]);

  const refreshData = (emps: Employee[]) => {
    const allLoans = HRService.getLoans();
    const filtered = allLoans.filter(l => 
      emps.some(e => e.id === l.employeeId) && 
      l.date.startsWith(selectedMonth)
    );
    setLoans(filtered);

    // Fetch Authorized Requisitions for linking
    const allReqs = InventoryService.getRequisitions().filter(Boolean);
    const relevant = allReqs.filter(r => 
      r.company === company && 
      r.status === 'Approved' && 
      (r.reqType === 'Loan' || r.reqType === 'Advance')
    );
    setAuthorizedReqs(relevant);
  };

  const handleLinkRequisition = (reqId: string) => {
      const req = authorizedReqs.find(r => r.id === reqId);
      if (req) {
          setNewLoan(prev => ({
              ...prev,
              requisitionId: req.id,
              amount: req.totalValue,
              type: req.reqType as 'Loan' | 'Advance',
              date: new Date().toISOString().split('T')[0] // Use current date for issuance
          }));
          setModalType(req.reqType as 'Loan' | 'Advance');
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

  const handleDelete = (id: string) => {
      if (confirm("Permanently delete this entry?")) {
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-6">
           <div><h3 className="text-xl font-black text-slate-800 tracking-tight leading-none">Financial Ledger</h3><p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1.5">Employee Loans & Advances</p></div>
           <div className="h-8 w-px bg-slate-100"></div>
           <div className="flex items-center space-x-4"><Calendar className="text-blue-600" size={20} /><input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="border-none font-black text-lg p-0 focus:ring-0 text-slate-800 bg-transparent outline-none" /></div>
        </div>
        <div className="flex space-x-3">
          <input type="file" ref={fileInputRef} onChange={handleImportExcel} className="hidden" accept=".xlsx, .xls" />
          <button onClick={() => fileInputRef.current?.click()} className="bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl flex items-center space-x-2 hover:bg-slate-100 transition-all font-bold text-sm border border-slate-200"><FileUp size={18} /><span>Import</span></button>
          <button onClick={handleExportExcel} className="bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl flex items-center space-x-2 hover:bg-slate-100 transition-all font-bold text-sm border border-slate-200"><Download size={18} /><span>Export</span></button>
          <button onClick={() => openNewEntryModal('Advance')} className="bg-blue-50 text-blue-700 px-5 py-2.5 rounded-xl flex items-center space-x-2 hover:bg-blue-100 font-bold text-sm border border-blue-100 transition-all"><HandCoins size={18} /><span>Advance</span></button>
          <button onClick={() => openNewEntryModal('Loan')} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl flex items-center space-x-2 hover:bg-slate-800 font-bold text-sm shadow-lg shadow-slate-200 transition-all"><Banknote size={18} /><span>Loan</span></button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-[10px] font-black uppercase text-slate-500 tracking-widest"><th className="px-8 py-5">Employee Profile</th><th className="px-6 py-5">Issuance Date</th><th className="px-6 py-5">Category</th><th className="px-6 py-5">Original Amt.</th><th className="px-6 py-5">Repay/Mo</th><th className="px-6 py-5">Status</th><th className="px-6 py-5 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loans.length > 0 ? loans.map(loan => {
              const emp = employees.find(e => e.id === loan.employeeId);
              return (
                <tr key={loan.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-8 py-4"><p className="font-bold text-slate-900 leading-tight">{emp?.personal.name}</p><p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{emp?.work.employeeCode}</p></td>
                  <td className="px-6 py-4 font-black text-slate-500 text-xs uppercase tracking-tighter">{loan.date}</td>
                  <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${loan.type === 'Loan' ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>{loan.type}</span>
                      {loan.requisitionId && <span className="ml-2 inline-flex items-center text-[8px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded border border-emerald-100"><Fingerprint size={8}/> PR LINKED</span>}
                  </td>
                  <td className="px-6 py-4 font-black text-slate-900">PKR {(Number(loan.amount) || 0).toLocaleString()}</td>
                  <td className="px-6 py-4 font-bold text-slate-600">PKR {(Number(loan.repaymentAmount) || 0).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    {loan.status === 'Active' ? 
                      <div className="flex items-center space-x-1.5 text-amber-600 font-black uppercase text-[10px] bg-amber-50 px-2 py-1 rounded-lg border border-amber-100 w-fit"><Clock size={12} /><span>Deduction Active</span></div> : 
                      <div className="flex items-center space-x-1.5 text-emerald-600 font-black uppercase text--[10px] bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 w-fit"><CheckCircle size={12} /><span>Settled</span></div>
                    }
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
              <tr><td colSpan={7} className="px-8 py-20 text-center"><div className="opacity-20 flex flex-col items-center"><HandCoins size={48} className="mb-4" /><p className="font-black uppercase tracking-[0.3em] text-xs">No records found for {new Date(selectedMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[110] animate-in zoom-in duration-200">
          <div className="bg-white rounded-[2.5rem] w-full max-w-xl shadow-2xl flex flex-col border border-white/20 overflow-hidden">
            <div className={`px-10 py-8 text-white flex justify-between items-center ${modalType === 'Loan' ? 'bg-slate-900' : 'bg-blue-600'}`}>
              <div className="flex items-center space-x-4"><div className="p-3 bg-white/10 rounded-2xl shadow-inner">{modalType === 'Loan' ? <Banknote size={28} /> : <HandCoins size={28} />}</div><div><h3 className="text-2xl font-black tracking-tighter uppercase">{editingId ? 'Edit Entry' : (modalType === 'Loan' ? 'Issuance of Loan' : 'Salary Advance')}</h3><p className="text-[10px] font-bold opacity-60 uppercase tracking-widest">Financial Ledger Entry</p></div></div>
              <button onClick={() => { setIsModalOpen(false); setEditingId(null); }} className="hover:bg-white/10 p-2 rounded-full transition-colors"><X size={24} /></button>
            </div>
            <div className="p-10 space-y-8 bg-slate-50">
              
              {!editingId && authorizedReqs.length > 0 && (
                  <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl animate-in fade-in">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700 ml-1 mb-2 block">Link Approved Request (Optional)</label>
                      <select 
                          className="w-full bg-white border border-emerald-200 p-3 rounded-xl text-xs font-bold outline-none text-emerald-900"
                          onChange={(e) => handleLinkRequisition(e.target.value)}
                          value={newLoan.requisitionId || ''}
                      >
                          <option value="">-- Direct Issuance (No Link) --</option>
                          {authorizedReqs.map(req => (
                              <option key={req.id} value={req.id}>
                                  {req.id} | {req.requisitioner} | {req.reqType?.toUpperCase() || 'N/A'} | PKR {req.totalValue?.toLocaleString() || '0'}
                              </option>
                          ))}
                      </select>
                  </div>
              )}

              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Employee Profile</label><select className="w-full bg-white border-2 border-slate-100 p-4 rounded-2xl outline-none font-bold text-slate-900 shadow-sm focus:border-blue-500 transition-all" onChange={e => setNewLoan({...newLoan, employeeId: e.target.value})} value={newLoan.employeeId} disabled={!!editingId}><option value="">Select Associate...</option>{employees.map(e => <option key={e.id} value={e.id}>{e.personal.name} ({e.work.employeeCode})</option>)}</select></div>
                <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Ledger Date</label><input type="date" className="w-full bg-white border-2 border-slate-100 p-4 rounded-2xl font-bold outline-none shadow-sm focus:border-blue-500 transition-all" value={newLoan.date} onChange={e => setNewLoan({...newLoan, date: e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Total Principal (PKR)</label><input type="number" className="w-full bg-white border-2 border-slate-100 p-4 rounded-2xl font-black text-slate-900 outline-none shadow-sm focus:border-blue-500 transition-all" value={newLoan.amount || ''} onChange={e => setNewLoan({...newLoan, amount: Number(e.target.value)})} /></div>
                {modalType === 'Loan' && (<div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Repayment/Mo (PKR)</label><input type="number" className="w-full bg-white border-2 border-slate-100 p-4 rounded-2xl font-black text-blue-600 outline-none shadow-sm focus:border-blue-500 transition-all" value={newLoan.repaymentAmount || ''} onChange={e => setNewLoan({...newLoan, repaymentAmount: Number(e.target.value)})} /></div>)}
                {modalType === 'Advance' && (<div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex items-center justify-center"><p className="text-[10px] font-black text-blue-700 uppercase">Auto-Deduct Full Amount</p></div>)}
              </div>
              <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 flex items-start space-x-4"><AlertCircle className="text-amber-500 shrink-0 mt-1" size={20} /><p className="text-[10px] font-bold text-amber-700 uppercase leading-relaxed tracking-tight">{modalType === 'Advance' ? 'Note: This advance will be deducted in full from the upcoming salary cycle.' : 'Note: Monthly repayments will be automatically deducted during the payroll generation process.'}</p></div>
            </div>
            <div className="px-10 py-8 bg-white border-t flex justify-end space-x-4">
              <button onClick={() => { setIsModalOpen(false); setEditingId(null); }} className="px-8 py-3 text-slate-400 font-black uppercase text-xs tracking-widest hover:text-slate-600">Discard</button>
              <button onClick={handleSaveLoan} className={`${modalType === 'Loan' ? 'bg-slate-900' : 'bg-blue-600'} text-white px-12 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl transition-all hover:scale-[1.02] active:scale-95`}>{editingId ? 'Update Record' : 'Post Transaction'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoanManagement;
