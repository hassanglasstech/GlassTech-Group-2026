
import React, { useState, useEffect, useRef } from 'react';
import { Employee, AttendanceRecord, LoanAdvance, Payroll, LedgerTransaction, Company } from '@/modules/shared/types';
import { HRService } from '@/modules/hr/services/hrService';
import { FinanceService } from '@/modules/finance/services/financeService';
import { CreditCard, Printer, Eye, X, Calculator, Calendar, FileUp, Download, ArrowLeft, CheckCircle2, ShieldCheck, BarChart3, FileText, Info, Check, AlertCircle, Building2, User, Ban, ShieldCheck as Shield, Send, Landmark } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { useRealtimeRefresh } from '@/modules/shared/hooks/useRealtimeRefresh';

const PayrollManagement: React.FC<{ company: Company }> = ({ company }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [payrolls, setPayrolls] = useState<(Payroll & { isSalaryPaid?: boolean, isOvertimePaid?: boolean, allowedAbsentCount?: number, loanWaived?: boolean })[]>([]);
  const [selectedSlip, setSelectedSlip] = useState<Payroll | null>(null);
  const [showSummaryReport, setShowSummaryReport] = useState(false);
  const [showAllSlipsPrint, setShowAllSlipsPrint] = useState(false);
  const [viewTab, setViewTab] = useState<'cumulative' | 'salary' | 'overtime'>('cumulative');


  const { refreshKey } = useRealtimeRefresh(['payroll', 'employees', 'attendance', 'loans']);

  useEffect(() => {
    const emps = HRService.getEmployees().filter(e => e.company === company);
    setEmployees(emps);
    generatePayrolls(emps);
  }, [company, selectedMonth, refreshKey]);

  const generatePayrolls = (emps: Employee[]) => {
    const attendance = HRService.getAttendance();
    const loans = HRService.getLoans();
    const daysInMonth = 30; 
    const existingPayrolls = HRService.getPayroll().filter(p => p?.month === selectedMonth);
    const [year, monthNum] = selectedMonth.split('-').map(Number);
    const actualDaysInMonth = new Date(year, monthNum, 0).getDate();

    // Fetch Manual Summary Overrides from Attendance Module (Phase 2 Linkage)
    const summaryOverrides = JSON.parse(localStorage.getItem(`gtk_summary_overrides_${selectedMonth}`) || '{}');

    const newPayrolls = emps.map(emp => {
      const empAttendance = attendance.filter(a => a?.employeeId === emp.id && a?.date?.startsWith(selectedMonth));
      const empLoans = loans.filter(l => l?.employeeId === emp.id && l.status === 'Active');
      
      const override = summaryOverrides[emp.id];
      
      let finalAbsentCount = 0;
      let rawOtHours = 0;
      let manualLatePenalty = 0;
      let allowedAbsentCount = 0;
      let skipLoan = false;
      let manualLoanDeductionAmount = -1; // -1 means no override

      if (override) {
          // Priority 1: Use Manual Summary Inputs (Phase 2 Overrides)
          allowedAbsentCount = Number(override.allowedAbsent || 0);
          const totalDaysOff = Number(override.absent || 0);
          finalAbsentCount = Math.max(0, totalDaysOff - allowedAbsentCount);
          rawOtHours = Number(override.ot || 0);
          
          if (override.manualLoanDeduction !== undefined && override.manualLoanDeduction !== null) {
              manualLoanDeductionAmount = Number(override.manualLoanDeduction);
              if (manualLoanDeductionAmount === 0) skipLoan = true;
          }
          
          manualLatePenalty = 0; 
      } else {
          // Priority 2: Automatic Register Calculation
          const absentRecords = empAttendance.filter(a => a?.status === 'Absent');
          const lateRecords = empAttendance.filter(a => a?.status === 'Late' || (a?.lateMinutes || 0) > 0);
          
          const extraSandwichSundays: string[] = [];
          for (let d = 1; d <= actualDaysInMonth; d++) {
              const dateStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
              const dateObj = new Date(dateStr);
              if (dateObj.getDay() === 0) {
                  const satDate = `${selectedMonth}-${String(d - 1).padStart(2, '0')}`;
                  const monDate = `${selectedMonth}-${String(d + 1).padStart(2, '0')}`;
                  const isSatAbsent = empAttendance.find(a => a.date === satDate && a.status === 'Absent');
                  const isMonAbsent = empAttendance.find(a => a.date === monDate && a.status === 'Absent');
                  if (isSatAbsent || isMonAbsent) {
                      if (!empAttendance.find(a => a.date === dateStr && a.status === 'Absent')) {
                          extraSandwichSundays.push(dateStr);
                      }
                  }
              }
          }

          finalAbsentCount = absentRecords.length + extraSandwichSundays.length;
          rawOtHours = empAttendance.reduce((acc, curr) => acc + (Number(curr?.overtimeHours) || 0), 0);
          manualLatePenalty = Math.floor(lateRecords.length / 3);
      }

      const totalAllowances = (emp?.salary?.houseRent || 0) + (emp?.salary?.conveyance || 0) + (emp?.salary?.specialAllowance || 0);
      const grossSalary = (emp?.salary?.basic || 0) + totalAllowances;
      const dayRate = grossSalary / daysInMonth;
      const hourlyRate = dayRate / 8;
      
      const absentDeduction = finalAbsentCount * dayRate;
      const latePenaltyAmount = manualLatePenalty * dayRate;
      
      const finalOvertimePay = rawOtHours * (hourlyRate * 1.5);
      
      let monthlyLoanDeduction = 0;
      let monthlyAdvanceDeduction = 0;

      if (manualLoanDeductionAmount >= 0) {
          monthlyLoanDeduction = manualLoanDeductionAmount;
          monthlyAdvanceDeduction = 0;
      } else {
          // Filter out loans that are skipped for this month
          const activeLoansThisMonth = empLoans.filter(l => l.skipMonth !== selectedMonth);
          
          monthlyLoanDeduction = activeLoansThisMonth.filter(l => l.type === 'Loan').reduce((acc, curr) => acc + (curr.repaymentAmount || 0), 0);
          monthlyAdvanceDeduction = activeLoansThisMonth.filter(l => l.type === 'Advance').reduce((acc, curr) => acc + (curr.amount || 0), 0);
      }
      
      const existing = existingPayrolls.find(ep => ep.employeeId === emp.id);

      return {
        id: existing?.id || `PAY-${emp.id}-${selectedMonth}`,
        employeeId: emp.id,
        month: selectedMonth,
        basicPay: emp?.salary?.basic || 0,
        allowances: totalAllowances,
        overtimePay: Math.round(finalOvertimePay),
        overtimeHours: rawOtHours,
        earlyDeductionHours: 0,
        lateDeduction: Math.round(latePenaltyAmount), 
        absentDeduction: Math.round(absentDeduction),
        loanDeduction: monthlyLoanDeduction,
        advanceDeduction: monthlyAdvanceDeduction,
        netSalary: Math.round(Math.max(0, grossSalary + finalOvertimePay - absentDeduction - latePenaltyAmount - monthlyLoanDeduction - monthlyAdvanceDeduction)),
        absentDates: override ? [] : empAttendance.filter(a => a.status === 'Absent').map(a => a.date),
        lateDates: empAttendance.filter(a => a.status === 'Late').map(a => ({ date: a.date, minutes: a.lateMinutes })),
        loanRepayments: empLoans.map(l => ({ date: l.date, amount: l.type === 'Advance' ? l.amount : l.repaymentAmount, type: l.type })),
        isSalaryPaid: (existing as any)?.isSalaryPaid || false,
        isOvertimePaid: (existing as any)?.isOvertimePaid || false,
        allowedAbsentCount,
        loanWaived: skipLoan
      };
    });
    
    setPayrolls(newPayrolls);
    HRService.savePayroll(newPayrolls);
  };

  const summary = payrolls.reduce((acc, p) => {
    const totalDeds = (p?.absentDeduction || 0) + (p?.lateDeduction || 0) + (p?.loanDeduction || 0) + (p?.advanceDeduction || 0);
    const salaryOnly = ((p?.basicPay || 0) + (p?.allowances || 0)) - totalDeds;
    const otOnly = p?.overtimePay || 0;
    return {
      totalBasic: acc.totalBasic + (p?.basicPay || 0), totalAllowances: acc.totalAllowances + (p?.allowances || 0), totalOTAmount: acc.totalOTAmount + otOnly, totalOTHours: acc.totalOTHours + (p?.overtimeHours || 0),
      totalDeductionsCombined: acc.totalDeductionsCombined + totalDeds, totalNetDisbursable: acc.totalNetDisbursable + salaryOnly + otOnly, totalPaidDisbursement: acc.totalPaidDisbursement + (p?.isSalaryPaid ? salaryOnly : 0) + (p?.isOvertimePaid ? otOnly : 0),
      totalPureSalary: acc.totalPureSalary + salaryOnly, totalPaidSalary: acc.totalPaidSalary + (p?.isSalaryPaid ? salaryOnly : 0), totalPaidOT: acc.totalPaidOT + (p?.isOvertimePaid ? otOnly : 0),
      totalLoanRecovery: acc.totalLoanRecovery + (p?.loanDeduction || 0) + (p?.advanceDeduction || 0)
    };
  }, { totalBasic: 0, totalAllowances: 0, totalOTAmount: 0, totalOTHours: 0, totalDeductionsCombined: 0, totalNetDisbursable: 0, totalPaidDisbursement: 0, totalPureSalary: 0, totalPaidSalary: 0, totalPaidOT: 0, totalLoanRecovery: 0 });

  // --- PHASE 3: AUTOMATED LEDGER POSTING (Enhanced: Full Breakdown) ---
  const handlePostPayrollToLedger = async () => {
      const monthName = new Date(selectedMonth).toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!confirm(`Generate Ledger Entry for ${monthName} Payroll?\n\nTotal Payable: PKR ${summary.totalNetDisbursable.toLocaleString()}`)) return;

      const txId = `PAY-JV-${selectedMonth.replace('-','')}`;
      
      // Check if already posted
      const existingLedger = FinanceService.getLedger();
      if (existingLedger.some(t => t.id === txId)) {
        return toast.error(`Payroll JV for ${monthName} already posted (${txId}).`);
      }

      // Find GL Accounts
      const allAccounts = FinanceService.getAccounts().filter(a => a.company === company);
      const findAcc = (keyword: string, type: string) => allAccounts.find(a => a.name.toUpperCase().includes(keyword) && a.type === type);

      const salaryExpAcc   = findAcc('SALARIES', 'Expense')   || findAcc('SALARY', 'Expense')   || { id: 'SAL-EXP', name: 'Salaries Expense' };
      const allowanceAcc   = findAcc('ALLOWANCE', 'Expense')  || salaryExpAcc;
      const overtimeAcc    = findAcc('OVERTIME', 'Expense')   || salaryExpAcc;
      const payableAcc     = findAcc('PAYABLE', 'Liability')  || findAcc('SALARIES', 'Liability') || { id: 'SAL-PAY', name: 'Salaries Payable' };
      const staffLoanAcc   = findAcc('LOAN', 'Asset')         || findAcc('ADVANCE', 'Asset')      || { id: 'STAFF-LOAN', name: 'Staff Loans' };

      // Build detailed GL lines
      const details: { accountId: string; debit: number; credit: number; text: string; costCenterId?: string }[] = [];

      // DEBIT SIDE: Expense breakdowns
      const totalBasic      = payrolls.reduce((s, p) => s + p.basicPay, 0);
      const totalAllowances = payrolls.reduce((s, p) => s + p.allowances, 0);
      const totalOvertime   = payrolls.reduce((s, p) => s + p.overtimePay, 0);

      if (totalBasic > 0)      details.push({ accountId: salaryExpAcc.id, debit: totalBasic, credit: 0, text: `Basic Salary — ${monthName}` });
      if (totalAllowances > 0) details.push({ accountId: allowanceAcc.id, debit: totalAllowances, credit: 0, text: `Allowances — ${monthName}` });
      if (totalOvertime > 0)   details.push({ accountId: overtimeAcc.id, debit: totalOvertime, credit: 0, text: `Overtime — ${monthName}` });

      // CREDIT SIDE: Net payable + deductions recovered
      const totalAbsentDed = payrolls.reduce((s, p) => s + p.absentDeduction, 0);
      const totalLateDed   = payrolls.reduce((s, p) => s + p.lateDeduction, 0);
      const totalLoanRec   = payrolls.reduce((s, p) => s + p.loanDeduction + p.advanceDeduction, 0);
      const totalNetPay    = summary.totalNetDisbursable;

      if (totalNetPay > 0)   details.push({ accountId: payableAcc.id, debit: 0, credit: totalNetPay, text: `Net Payable — ${monthName}` });
      if (totalLoanRec > 0)  details.push({ accountId: staffLoanAcc.id, debit: 0, credit: totalLoanRec, text: `Loan/Advance Recovery — ${monthName}` });

      // Absent & Late deductions reduce the expense (contra), but since they're already netted
      // in netSalary, the above lines are balanced. Add note-only if significant.
      
      const transaction: LedgerTransaction = {
          id: txId, company, docType: 'SA',
          docDate: new Date().toISOString().split('T')[0],
          date: new Date().toISOString().split('T')[0],
          description: `PAYROLL: ${monthName.toUpperCase()} — ${payrolls.length} employees`,
          referenceId: selectedMonth,
          status: 'Posted',
          details
      };

      FinanceService.recordTransaction(transaction);

      // ── Update Loan Balances in HR ──
      if (totalLoanRec > 0) {
        const allLoans = HRService.getLoans();
        const updatedLoans = allLoans.map(loan => {
          if (loan.status !== 'Active') return loan;
          const payroll = payrolls.find(p => p.employeeId === loan.employeeId);
          if (!payroll) return loan;
          const deduction = loan.type === 'Advance' ? payroll.advanceDeduction : payroll.loanDeduction;
          if (deduction <= 0) return loan;
          const newRepaid = (loan.repaymentAmount || 0) + deduction;
          const isFullyPaid = newRepaid >= loan.amount;
          return { ...loan, repaymentAmount: newRepaid, status: isFullyPaid ? 'Completed' as const : loan.status };
        });
        HRService.saveLoans(updatedLoans);
      }

      toast.success(`Payroll JV ${txId} posted — Basic: ${totalBasic.toLocaleString()}, Allow: ${totalAllowances.toLocaleString()}, OT: ${totalOvertime.toLocaleString()}, Loan Rec: ${totalLoanRec.toLocaleString()}`);
  };

  const renderSlip = (pay: any) => {
    const emp = employees.find(e => e.id === pay.employeeId);
    if (!emp) return null;
    const totalEarnings = pay.basicPay + pay.allowances + pay.overtimePay;
    const totalDeductions = pay.absentDeduction + pay.lateDeduction + pay.loanDeduction + pay.advanceDeduction;
    return (
        <div key={pay.id} className="print:block p-8 bg-white border-2 border-slate-900 rounded-3xl mb-8 font-sans text-xs w-[210mm] min-h-[148mm] mx-auto overflow-hidden">
            <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-6">
                <div>
                    <h1 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Glasstech ERP 2026</h1>
                    <p className="font-bold text-blue-600 uppercase tracking-widest">{company} GROUP BUSINESS UNIT</p>
                </div>
                <div className="text-right">
                    <h2 className="text-xl font-black uppercase tracking-widest text-slate-800">Payslip</h2>
                    <p className="font-black text-rose-600 uppercase">{new Date(pay.month + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-10 mb-8 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="space-y-1">
                    <p className="font-bold uppercase text-slate-400 text-[8px]">Employee Identification</p>
                    <p className="text-lg font-black text-slate-900 leading-none">{emp?.personal?.name ?? "—"}</p>
                    <p className="text-[10px] font-bold text-blue-700 uppercase">{emp?.work?.employeeCode ?? "—"} | {emp?.work?.designation ?? "—"}</p>
                    <p className="text-[10px] font-medium text-slate-500">{emp.work.department}</p>
                </div>
                <div className="text-right space-y-1">
                    <p className="font-bold uppercase text-slate-400 text-[8px]">Payroll Summary</p>
                    <p className="text-lg font-black text-slate-900">PKR {pay.netSalary.toLocaleString()}</p>
                    <p className="text-[9px] font-bold uppercase bg-slate-900 text-white px-2 py-0.5 rounded-full inline-block">Net Payable</p>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-12">
                <div className="space-y-4">
                    <h3 className="font-black uppercase border-b-2 border-emerald-600 text-emerald-700 pb-1 text-[10px]">Earnings (PKR)</h3>
                    <div className="space-y-2">
                        <div className="flex justify-between"><span>Basic Salary</span><span className="font-black">{pay.basicPay.toLocaleString()}</span></div>
                        <div className="flex justify-between"><span>Allowances</span><span className="font-black">{pay.allowances.toLocaleString()}</span></div>
                        <div className="flex justify-between text-indigo-600 font-bold"><span>Overtime ({pay.overtimeHours}h)</span><span className="font-black">{pay.overtimePay.toLocaleString()}</span></div>
                        <div className="flex justify-between border-t-2 border-slate-100 pt-2 font-black text-slate-900 text-sm"><span>Gross Earnings</span><span>{(Number(totalEarnings) || 0).toLocaleString()}</span></div>
                    </div>
                </div>
                <div className="space-y-4">
                    <h3 className="font-black uppercase border-b-2 border-rose-600 text-rose-700 pb-1 text-[10px]">Deductions (PKR)</h3>
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span>Absent / LWP Days {pay.allowedAbsentCount > 0 && <span className="text-[8px] text-emerald-600 font-bold">({pay.allowedAbsentCount} Allowed)</span>}</span>
                            <span className="font-black">{pay.absentDeduction.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between"><span>Late Penalty</span><span className="font-black">{pay.lateDeduction.toLocaleString()}</span></div>
                        <div className="flex justify-between text-rose-500">
                            <span>Loan/Adv Recovery {pay.loanWaived && <span className="text-[8px] font-black uppercase text-rose-600 ml-1">(Seth Waived)</span>}</span>
                            <span className="font-black">{(pay.loanDeduction + pay.advanceDeduction).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between border-t-2 border-slate-100 pt-2 font-black text-slate-900 text-sm"><span>Total Recoveries</span><span>{(Number(totalDeductions) || 0).toLocaleString()}</span></div>
                    </div>
                </div>
            </div>
            <div className="mt-12 flex justify-between items-end">
                <div className="text-center w-40 border-t border-slate-300 pt-2">
                    <p className="text-[9px] font-bold uppercase text-slate-400">Employee Signature</p>
                </div>
                <div className="text-[8px] italic text-slate-400">
                    System generated record. {pay.loanWaived && "Note: Loan recovery waived by management for this cycle."}
                </div>
                <div className="text-center w-40 border-t border-slate-300 pt-2">
                    <p className="text-[9px] font-bold uppercase text-slate-900">Authorized Officer</p>
                </div>
            </div>
        </div>
    );
  };

  const handlePrintAll = () => {
    setShowAllSlipsPrint(true);
    setTimeout(() => { window.print(); setShowAllSlipsPrint(false); }, 500);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 no-print">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden ring-2 ring-blue-50"><div className="absolute top-0 right-0 w-1 bg-blue-500 h-full"></div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Total Package</span><span className="text-2xl font-black text-slate-900 leading-none">PKR {summary.totalNetDisbursable.toLocaleString()}</span><div className="flex justify-between mt-2 pt-2 border-t border-slate-50"><div className="text-[9px] font-black"><span className="text-emerald-500">PAID:</span> {summary.totalPaidDisbursement.toLocaleString()}</div><div className="text-[9px] font-black"><span className="text-rose-500">BAL:</span> {(summary.totalNetDisbursable - summary.totalPaidDisbursement).toLocaleString()}</div></div></div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><span className="text-[10px] font-black text-blue-400 uppercase tracking-widest block mb-1">Pure Salary</span><span className="text-2xl font-black text-slate-900 leading-none">PKR {summary.totalPureSalary.toLocaleString()}</span><div className="text-[9px] font-bold text-emerald-600 mt-1 uppercase">Paid: {summary.totalPaidSalary.toLocaleString()}</div></div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-1">Total OT Wages</span><span className="text-2xl font-black text-indigo-600 leading-none">PKR {summary.totalOTAmount.toLocaleString()}</span><div className="text-[9px] font-bold text-indigo-600 mt-1 uppercase">Paid: {summary.totalPaidOT.toLocaleString()}</div></div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><span className="text-[10px] font-black text-rose-400 uppercase tracking-widest block mb-1">Total Recoveries</span><span className="text-2xl font-black text-rose-600 leading-none">PKR {summary.totalDeductionsCombined.toLocaleString()}</span></div>
      </div>

      <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-slate-200 shadow-sm no-print">
        <div className="flex items-center space-x-6">
           <div className="flex items-center space-x-4"><Calendar className="text-blue-600" /><input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="border-none font-black text-xl p-0 focus:ring-0 text-slate-800 bg-transparent outline-none" /></div>
           <div className="h-8 w-px bg-slate-200"></div>
           <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl">
             <button onClick={() => setViewTab('cumulative')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${viewTab === 'cumulative' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>Cumulative View</button>
             <button onClick={() => setViewTab('salary')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${viewTab === 'salary' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Salary Breakdown</button>
             <button onClick={() => setViewTab('overtime')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${viewTab === 'overtime' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Overtime Detail</button>
           </div>
        </div>
        <div className="flex space-x-3">
          <button onClick={handlePrintAll} className="bg-slate-100 text-slate-700 px-4 py-2.5 rounded-xl flex items-center space-x-2 font-bold text-sm hover:bg-slate-200 transition-all"><Printer size={18} /><span>Print Slips</span></button>
          <button onClick={handlePostPayrollToLedger} className="bg-slate-900 text-white px-4 py-2.5 rounded-xl flex items-center space-x-2 font-bold text-sm shadow-xl hover:bg-slate-800 transition-all"><Landmark size={18} /><span>Post to Ledger</span></button>
          <button onClick={() => generatePayrolls(employees)} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold flex items-center space-x-2 shadow-lg hover:bg-blue-700 transition-all"><Calculator size={18} /><span>Run Engine</span></button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden no-print">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 tracking-widest">
            {viewTab === 'cumulative' ? (
              <tr><th className="px-6 py-5">Employee Registry</th><th className="px-6 py-5 text-right">Gross Salary</th><th className="px-6 py-5 text-right">Salary Deds (Abs/Lat)</th><th className="px-6 py-5 text-right">Financial Deds (Loan/Adv)</th><th className="px-6 py-5 text-right">OT Amount</th><th className="px-6 py-5 text-right">Total Payable</th><th className="px-6 py-5 text-center">Slip</th></tr>
            ) : viewTab === 'salary' ? (
              <tr><th className="px-6 py-5">Employee Registry</th><th className="px-6 py-5 text-right">Basic Pay</th><th className="px-6 py-5 text-right">Allowances</th><th className="px-6 py-5 text-right">Gross Salary</th><th className="px-6 py-5 text-center">Slip</th></tr>
            ) : (
              <tr><th className="px-6 py-5">Employee Registry</th><th className="px-6 py-5 text-center">OT Hours</th><th className="px-6 py-5 text-right">Hourly Rate (x1.5)</th><th className="px-6 py-5 text-right">Total OT Wage</th><th className="px-6 py-5 text-center">Slip</th></tr>
            )}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payrolls.map(pay => {
              const emp = employees.find(e => e.id === pay.employeeId);
              const grossSalary = pay.basicPay + pay.allowances;
              const salaryDeds = pay.absentDeduction + pay.lateDeduction;
              const financialDeds = pay.loanDeduction + pay.advanceDeduction;
              const hourlyRate = Math.round((grossSalary / 30) / 8);
              
              return (
                <tr key={pay.id} className="hover:bg-slate-50/50 transition-colors text-sm">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-black text-xs">{emp?.personal.name.charAt(0)}</div>
                        <div>
                            <p className="font-bold text-slate-900 leading-tight">{emp?.personal.name}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{emp?.work.employeeCode}</p>
                        </div>
                    </div>
                  </td>
                  
                  {viewTab === 'cumulative' && (
                    <>
                      <td className="px-6 py-4 text-right font-bold text-slate-600">{(Number(grossSalary) || 0).toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-bold text-rose-400">
                        <div className="flex flex-col items-end">
                            <span>-{(Number(salaryDeds) || 0).toLocaleString()}</span>
                            {pay.allowedAbsentCount! > 0 && <span className="text-[8px] text-emerald-600 font-black uppercase">Seth Allowed: {pay.allowedAbsentCount} Days</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-rose-600">
                        <div className="flex flex-col items-end">
                            <span className={pay.loanWaived ? 'line-through opacity-30' : ''}>-{(Number(financialDeds) || 0).toLocaleString()}</span>
                            {pay.loanWaived && <span className="text-[8px] text-rose-500 font-black uppercase flex items-center gap-1"><Ban size={8}/> Seth Waived</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-indigo-600">{pay.overtimePay.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-black text-blue-800 text-base">PKR {pay.netSalary.toLocaleString()}</td>
                    </>
                  )}
                  {viewTab === 'salary' && (
                    <>
                      <td className="px-6 py-4 text-right font-bold text-slate-600">{pay.basicPay.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-600">{pay.allowances.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-black text-blue-800">{(Number(grossSalary) || 0).toLocaleString()}</td>
                    </>
                  )}
                  {viewTab === 'overtime' && (
                    <>
                      <td className="px-6 py-4 text-center font-black text-slate-700">{pay.overtimeHours} h</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-400">{Math.round(hourlyRate * 1.5).toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-black text-indigo-700 text-base">PKR {pay.overtimePay.toLocaleString()}</td>
                    </>
                  )}
                  
                  <td className="px-6 py-4 text-center"><button onClick={() => setSelectedSlip(pay)} className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><Printer size={18} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedSlip && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-[200] no-print">
            <div className="bg-white rounded-[2rem] w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden border border-slate-300">
                <div className="px-10 py-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center space-x-4"><div className="p-3 bg-blue-600 rounded-2xl"><User size={24}/></div><div><h3 className="text-xl font-black uppercase">Review Pay Slip</h3><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Financial Disbursement Approval</p></div></div>
                    <button onClick={() => setSelectedSlip(null)} className="hover:bg-white/10 p-2 rounded-full transition-colors"><X size={24}/></button>
                </div>
                <div className="flex-1 overflow-y-auto bg-slate-100 p-10">
                    <div className="bg-white shadow-2xl rounded-[2rem] overflow-hidden transform scale-95 origin-top">
                        {renderSlip(selectedSlip)}
                    </div>
                </div>
                <div className="px-10 py-6 bg-white border-t flex justify-end space-x-4 shrink-0">
                    <button onClick={() => setSelectedSlip(null)} className="px-8 py-3 text-slate-400 font-black uppercase text-xs">Close</button>
                    <button onClick={() => window.print()} className="bg-blue-600 text-white px-12 py-3 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl flex items-center space-x-3 hover:bg-blue-700"><Printer size={18}/> <span>Print Slip</span></button>
                </div>
            </div>
        </div>
      )}

      {showAllSlipsPrint && (
        <div className="hidden print:block fixed inset-0 bg-white z-[9999]">
            {payrolls.map(p => renderSlip(p))}
        </div>
      )}
    </div>
  );
};

export default React.memo(PayrollManagement);
