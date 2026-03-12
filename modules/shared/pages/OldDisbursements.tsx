
import React, { useState, useEffect } from 'react';
import { Company, Employee, Payroll } from '../types';
import { HRService } from '../../hr/services/hrService';
import { Calendar, Save, History, Search, Filter, Layers } from 'lucide-react';

import { useAppStore } from '../store/appStore';
import { toast } from 'sonner';

const OldDisbursements: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [manualData, setManualData] = useState<Record<string, { salary: number; ot: number }>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentMode, setPaymentMode] = useState<'Combined' | 'Salary' | 'OT'>('Combined');

  useEffect(() => {
    const emps = HRService.getEmployees().filter(e => e.company === company);
    setEmployees(emps);
    
    // Check if payroll already exists for this month to pre-fill
    const existing = HRService.getPayroll().filter(p => p.month === selectedMonth);
    const initialData: Record<string, { salary: number; ot: number }> = {};
    
    emps.forEach(emp => {
      const p = existing.find(x => x.employeeId === emp.id);
      initialData[emp.id] = {
        salary: p ? (p.netSalary - (p.isOvertimePaid ? p.overtimePay : 0)) : 0,
        ot: p ? p.overtimePay : 0
      };
    });
    setManualData(initialData);
  }, [company, selectedMonth]);

  const handleUpdate = (empId: string, field: 'salary' | 'ot', value: string) => {
    const num = Number(value) || 0;
    setManualData(prev => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        [field]: num
      }
    }));
  };

  const handleSaveAll = () => {
    const allPayroll = HRService.getPayroll();
    const otherMonthPayroll = allPayroll.filter(p => p.month !== selectedMonth || !employees.some(e => e.id === p.employeeId));
    
    const newRecords: Payroll[] = employees.map(emp => {
      const data = manualData[emp.id] || { salary: 0, ot: 0 };
      const existing = allPayroll.find(p => p.employeeId === emp.id && p.month === selectedMonth);

      // Depending on mode, we might want to strictly save only what is enabled, 
      // but usually preserving existing data is safer. 
      // However, if the user explicitly zeroes it out in the UI, it saves as 0.
      
      return {
        id: existing?.id || `PAY-OLD-${emp.id}-${selectedMonth}`,
        employeeId: emp.id,
        month: selectedMonth,
        basicPay: existing?.basicPay || 0,
        allowances: existing?.allowances || 0,
        overtimePay: data.ot,
        overtimeHours: existing?.overtimeHours || 0,
        earlyDeductionHours: 0,
        lateDeduction: existing?.lateDeduction || 0,
        absentDeduction: existing?.absentDeduction || 0,
        loanDeduction: existing?.loanDeduction || 0,
        advanceDeduction: existing?.advanceDeduction || 0,
        netSalary: data.salary + data.ot,
        absentDates: existing?.absentDates || [],
        lateDates: existing?.lateDates || [],
        loanRepayments: existing?.loanRepayments || [],
        isSalaryPaid: true, // Since we are entering old "disbursements"
        isOvertimePaid: data.ot > 0
      };
    });

    HRService.savePayroll([...otherMonthPayroll, ...newRecords]);
    toast.success(`Success: Historical records for ${selectedMonth} have been updated.`);
  };

  const filteredEmployees = employees.filter(e => 
    e.personal.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    e.work.employeeCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-center bg-white p-5 rounded-2xl border border-slate-200 shadow-sm no-print gap-4">
        <div className="flex items-center space-x-6 w-full lg:w-auto">
          <div className="flex items-center space-x-4">
            <History className="text-blue-600" />
            <div>
              <h3 className="text-sm font-black uppercase text-slate-800">Old Disbursement Entry</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Manual Data Entry for History</p>
            </div>
          </div>
          <div className="h-8 w-px bg-slate-200 hidden lg:block"></div>
          <div className="flex items-center space-x-4">
            <Calendar className="text-slate-400" size={18} />
            <input 
              type="month" 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)} 
              className="border-none font-black text-lg p-0 focus:ring-0 text-slate-800 bg-transparent" 
            />
          </div>
        </div>
        
        <div className="flex flex-col lg:flex-row items-center gap-4 w-full lg:w-auto">
          {/* Mode Switcher */}
          <div className="flex bg-slate-100 p-1 rounded-xl w-full lg:w-auto">
             <button 
                onClick={() => setPaymentMode('Combined')}
                className={`flex-1 lg:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${paymentMode === 'Combined' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
             >
                Salary + OT
             </button>
             <button 
                onClick={() => setPaymentMode('Salary')}
                className={`flex-1 lg:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${paymentMode === 'Salary' ? 'bg-white shadow text-emerald-600' : 'text-slate-500'}`}
             >
                Salary Only
             </button>
             <button 
                onClick={() => setPaymentMode('OT')}
                className={`flex-1 lg:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${paymentMode === 'OT' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}
             >
                OT Only
             </button>
          </div>

          <div className="relative w-full lg:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search Employee..." 
              className="sap-input w-full pl-9 py-1.5 text-xs font-bold" 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
            />
          </div>
          <button 
            onClick={handleSaveAll} 
            className="bg-blue-600 text-white px-8 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg hover:bg-blue-700 transition-all flex items-center space-x-2 w-full lg:w-auto justify-center"
          >
            <Save size={16} /> <span>Save Data</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden no-print">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 tracking-widest">
            <tr>
              <th className="px-8 py-5">Employee Registry</th>
              <th className="px-6 py-5">Salary Paid (Net)</th>
              <th className="px-6 py-5">OT Paid (Amount)</th>
              <th className="px-6 py-5">Total Disbursement</th>
              <th className="px-6 py-5 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredEmployees.map(emp => {
              const data = manualData[emp.id] || { salary: 0, ot: 0 };
              const isSalaryDisabled = paymentMode === 'OT';
              const isOtDisabled = paymentMode === 'Salary';

              return (
                <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-8 py-4">
                    <p className="font-bold text-slate-900 leading-tight">{emp.personal.name}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{emp.work.employeeCode}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`relative transition-opacity ${isSalaryDisabled ? 'opacity-30' : 'opacity-100'}`}>
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-300">PKR</span>
                      <input 
                        type="number" 
                        disabled={isSalaryDisabled}
                        className={`w-40 pl-10 p-2 border border-slate-200 rounded-lg font-black text-sm outline-none focus:border-blue-500 focus:bg-white transition-all ${isSalaryDisabled ? 'bg-slate-50 cursor-not-allowed' : 'bg-slate-50'}`}
                        value={data.salary || ''}
                        onChange={e => handleUpdate(emp.id, 'salary', e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`relative transition-opacity ${isOtDisabled ? 'opacity-30' : 'opacity-100'}`}>
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-300">PKR</span>
                      <input 
                        type="number" 
                        disabled={isOtDisabled}
                        className={`w-40 pl-10 p-2 border border-slate-200 rounded-lg font-black text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all text-indigo-600 ${isOtDisabled ? 'bg-slate-50 cursor-not-allowed' : 'bg-slate-50'}`}
                        value={data.ot || ''}
                        onChange={e => handleUpdate(emp.id, 'ot', e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-base font-black text-slate-900">PKR {(data.salary + data.ot).toLocaleString()}</p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black uppercase border border-emerald-200">
                      Historical Entry
                    </span>
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

export default OldDisbursements;
