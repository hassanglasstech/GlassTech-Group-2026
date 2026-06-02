
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Company, Employee, AttendanceRecord, AttendanceStatus, Requisition } from '../../shared/types';
import { HRService } from '../services/hrService';
import { InventoryService } from '../../procurement/services/inventoryService';
import { Save, Calendar, FileUp, Download, List, LayoutGrid, Users, Clock, AlertCircle, Edit, Check, Coffee, RefreshCw, FileJson, FileSpreadsheet, UploadCloud, FileText, Edit3, X, UserCircle2, ShieldCheck, Ban, Calculator, FileKey } from 'lucide-react';
import * as XLSX from 'xlsx';

import { useAppStore } from '../../shared/store/appStore';
import { toast } from 'sonner';
import { AttendanceOverrideService, OverrideMap } from '@/modules/hr/services/attendanceOverrideService';
import { useRealtimeRefresh } from '@/modules/shared/hooks/useRealtimeRefresh';
import IndividualAttendanceModal from '@/modules/hr/components/IndividualAttendanceModal';
import AttendanceReconciliation from './AttendanceReconciliation';

const AttendanceRegister: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [allMonthRecords, setAllMonthRecords] = useState<AttendanceRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewType, setViewType] = useState<'daily' | 'monthly' | 'summary' | 'reconcile'>('daily');
  const [isBulkEditing, setIsBulkEditing] = useState(false);
  const [individualEditEmp, setIndividualEditEmp] = useState<Employee | null>(null);
  const [bulkData, setBulkData] = useState<Record<string, Record<string, { status: AttendanceStatus, ot: number, early: number, late: number }>>>({});
  
  // Phase 3 State
  const [authorizedWaiveReqs, setAuthorizedWaiveReqs] = useState<Requisition[]>([]);
  const [authorizedSkipReqs, setAuthorizedSkipReqs] = useState<Requisition[]>([]);

  // Summary Overrides State
  const [isEditSummaryModalOpen, setIsEditSummaryModalOpen] = useState(false);
  const [editingSummary, setEditingSummary] = useState<{
      employeeId: string, 
      name: string, 
      code: string, 
      manualAbsent: number, // Raw manual absents
      lates: number, // Total Lates
      allowedAbsent: number, 
      sunday: number, 
      ot: number, 
      
      // Loan Overrides
      systemLoanDeduction: number, 
      manualLoanDeduction: number, 
      reqRef: string,
      
      hasActiveLoan?: boolean
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const excelImportRef = useRef<HTMLInputElement>(null);

  const selectedMonth = useMemo(() => {
      const parts = selectedDate.split('-');
      return `${parts[0]}-${parts[1].padStart(2, '0')}`;
  }, [selectedDate]);

  const isSelectedDateSunday = new Date(selectedDate).getDay() === 0;


  const { refreshKey } = useRealtimeRefresh(['attendance', 'employees']);

  useEffect(() => {
    refreshAllData();
  }, [company, selectedDate, viewType, refreshKey]);

  const refreshAllData = () => {
    const emps = HRService.getEmployees().filter(e => e.company === company);
    setEmployees(emps);
    
    const allAttendance = HRService.getAttendance();
    setRecords(allAttendance.filter(r => r?.date === selectedDate));
    
    const monthFiltered = allAttendance.filter(r => {
        if (!r?.date) return false;
        return r.date.startsWith(selectedMonth) && emps.some(e => e.id === r.employeeId);
    });
    setAllMonthRecords(monthFiltered);

    // Compute leave balances with carryforward
    const currentYear = new Date().getFullYear();
    const ANNUAL_ENTITLEMENT = 18;
    const balances: Record<string, number> = {};
    emps.forEach(emp => {
      const used = allAttendance.filter(r =>
        r.employeeId === emp.id && r.status === 'Leave' &&
        r.date >= `${currentYear}-01-01` && r.date <= `${currentYear}-12-31`
      ).length;
      const prevUsed = allAttendance.filter(r =>
        r.employeeId === emp.id && r.status === 'Leave' &&
        r.date >= `${currentYear-1}-01-01` && r.date <= `${currentYear-1}-12-31`
      ).length;
      const carryforward = Math.min(6, Math.max(0, ANNUAL_ENTITLEMENT - prevUsed));
      balances[emp.id] = Math.max(0, ANNUAL_ENTITLEMENT + carryforward - used);
    });
    setLeaveBalances(balances);

    // Fetch Authorized Requisitions for Phase 2/3 (HR Control)
    const allReqs = InventoryService.getRequisitions().filter(Boolean);
    setAuthorizedWaiveReqs(allReqs.filter(r => r.company === company && r.status === 'Approved' && r.reqType === 'Waive Absent'));
    setAuthorizedSkipReqs(allReqs.filter(r => r.company === company && r.status === 'Approved' && r.reqType === 'Skip Installment'));
  };

  const getDaysInMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-').map(Number);
    return new Date(year, month, 0).getDate();
  };

  const handleUpdateRecord = (empId: string, status: AttendanceStatus, late: number, early: number, ot: number) => {
    const existing = records.find(r => r.employeeId === empId);
    let newRecords: AttendanceRecord[];
    
    if (existing) {
      newRecords = records.map(r => r.employeeId === empId ? { ...r, status, lateMinutes: late, earlyMinutes: early, overtimeHours: ot } : r);
    } else {
      newRecords = [...records, { id: `ATT-${Date.now()}-${Math.random()}`, employeeId: empId, date: selectedDate, status, lateMinutes: late, earlyMinutes: early, overtimeHours: ot }];
    }
    setRecords(newRecords);
  };

  const handleSaveAll = () => {
    const allStorage = HRService.getAttendance();
    const otherDates = allStorage.filter(r => r?.date !== selectedDate);
    // Mark records as pending supervisor approval
    const markedRecords = records.map(r => ({ ...r, approvalStatus: 'pending' } as any));
    HRService.saveAttendance([...otherDates, ...markedRecords]);
    setPendingApproval(true);
    refreshAllData();
    toast.success(`Attendance saved — pending supervisor approval`);
  };

  const [pendingApproval, setPendingApproval] = useState(false);
  const [leaveBalances, setLeaveBalances] = useState<Record<string, number>>({});
  const [showSupervisorModal, setShowSupervisorModal] = useState(false);
  const [supervisorInput, setSupervisorInput] = useState('');

  const handleSupervisorApprove = () => {
    setSupervisorInput('');
    setShowSupervisorModal(true);
  };

  const confirmSupervisorApproval = () => {
    const supervisor = supervisorInput.trim();
    if (!supervisor) { toast.error('Enter supervisor name'); return; }
    const allStorage = HRService.getAttendance();
    const approved = allStorage.map(r =>
      r.date === selectedDate
        ? { ...r, approvalStatus: 'approved', approvedBy: supervisor.trim(), approvedAt: new Date().toISOString() } as any
        : r
    );
    HRService.saveAttendance(approved);
    setPendingApproval(false);
    setShowSupervisorModal(false);
    toast.success(`Attendance approved by ${supervisor}`);
  };

  const startBulkEdit = () => {
    const initialBulk: Record<string, Record<string, { status: AttendanceStatus, ot: number, early: number, late: number }>> = {};
    const numDays = getDaysInMonth(selectedMonth);
    
    employees.forEach(emp => {
      initialBulk[emp.id] = {};
      for (let day = 1; day <= numDays; day++) {
        const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
        const existing = allMonthRecords.find(r => r.employeeId === emp.id && r.date === dateStr);
        initialBulk[emp.id][dateStr] = {
          status: existing?.status || 'Present',
          ot: Number(existing?.overtimeHours || 0),
          early: Number(existing?.earlyMinutes || 0),
          late: Number(existing?.lateMinutes || 0)
        };
      }
    });
    setBulkData(initialBulk);
    setIsBulkEditing(true);
  };

  const updateBulkValue = (empId: string, dateStr: string, field: 'status' | 'ot' | 'late', value: any) => {
    setBulkData(prev => {
      const empData = prev[empId] || {};
      const currentEntry = empData[dateStr] || { status: 'Present', ot: 0, early: 0, late: 0 };
      
      let newStatus = currentEntry.status;
      if (field === 'late') {
        const val = Number(value);
        if (val > 0) newStatus = 'Late';
        else if (val === 0 && currentEntry.status === 'Late') newStatus = 'Present';
      } else if (field === 'status') {
        newStatus = value;
      }

      return {
        ...prev,
        [empId]: {
          ...empData,
          [dateStr]: {
            ...currentEntry,
            [field]: value,
            status: newStatus
          }
        }
      };
    });
  };

  const saveBulkMonthly = () => {
    const allStorage = HRService.getAttendance();
    const empIds = new Set(employees.map(e => e.id));
    const otherData = allStorage.filter(r => !r?.date?.startsWith(selectedMonth) || !empIds.has(r.employeeId));
    const newMonthlyRecords: AttendanceRecord[] = [];

    Object.entries(bulkData).forEach(([empId, dates]) => {
      Object.entries(dates).forEach(([dateStr, data]) => {
        newMonthlyRecords.push({
          id: `ATT-${empId}-${dateStr}`,
          employeeId: empId,
          date: dateStr,
          status: data.status || 'Present',
          lateMinutes: Number(data.late || 0), 
          earlyMinutes: Number(data.early || 0),
          overtimeHours: Number(data.ot || 0)
        });
      });
    });

    HRService.saveAttendance([...otherData, ...newMonthlyRecords]);
    refreshAllData();
    setIsBulkEditing(false);
    toast.success(`Monthly register for ${selectedMonth} updated.`);
  };

  const numDays = useMemo(() => getDaysInMonth(selectedMonth), [selectedMonth]);
  const daysArray = useMemo(() => Array.from({ length: numDays }, (_, i) => i + 1), [numDays]);

  const getCalculatedTotals = (empId: string) => {
      let pCount = 0;
      let aCount = 0;
      let vCount = 0; 
      let lCount = 0;
      let sCount = 0; 
      let otSum = 0;

      const summaryOverrides: OverrideMap = JSON.parse(localStorage.getItem(`gtk_erp_summary_overrides_${selectedMonth}`) || '{}');
      if (summaryOverrides[empId]) {
          const grossAbsent = Number(summaryOverrides[empId].absent || 0);
          const allowed = Number(summaryOverrides[empId].allowedAbsent || 0);
          return {
              p: 0, 
              a: Math.max(0, grossAbsent - allowed), // Net Deductible for Display
              l: summaryOverrides[empId].lates || 0, // Stored raw lates
              allowedAbsent: allowed,
              s: summaryOverrides[empId].sunday,
              ot: Number(summaryOverrides[empId].ot || 0).toFixed(1),
              
              // Loan Display Logic
              loanOverride: summaryOverrides[empId].manualLoanDeduction,
              reqRef: summaryOverrides[empId].reqRef,
              
              isManual: true
          };
      }

      daysArray.forEach(day => {
          const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
          const isSun = new Date(dateStr).getDay() === 0;
          
          let rec;
          if (isBulkEditing) {
              rec = bulkData[empId]?.[dateStr];
          } else {
              rec = allMonthRecords.find(r => r.employeeId === empId && r.date === dateStr);
          }

          let status = rec?.status;
          const ot = Number((rec as any)?.ot || (rec as any)?.overtimeHours || 0);

          if (isSun) {
              sCount++;
              const satDay = day - 1;
              const monDay = day + 1;
              if (satDay >= 1 && monDay <= numDays) {
                  const satDate = `${selectedMonth}-${String(satDay).padStart(2, '0')}`;
                  const monDate = `${selectedMonth}-${String(monDay).padStart(2, '0')}`;
                  let satRec, monRec;
                  if (isBulkEditing) {
                      satRec = bulkData[empId]?.[satDate];
                      monRec = bulkData[empId]?.[monDate];
                  } else {
                      satRec = allMonthRecords.find(r => r.employeeId === empId && r.date === satDate);
                      monRec = allMonthRecords.find(r => r.employeeId === empId && r.date === monDate);
                  }
                  if (satRec?.status === 'Absent' || monRec?.status === 'Absent') {
                      status = 'Absent';
                  }
              }
          }

          if (status === 'Present') pCount++;
          else if (status === 'Late') { pCount++; lCount++; }
          else if (status === 'Absent') aCount++;
          else if (status === 'Leave') vCount++;
          
          otSum += ot;
      });

      const penaltyDays = Math.floor(lCount / 3);
      return {
          p: Math.max(0, pCount - penaltyDays),
          a: aCount + penaltyDays,
          l: lCount,
          allowedAbsent: 0,
          s: sCount,
          ot: otSum.toFixed(1),
          loanOverride: undefined,
          reqRef: undefined,
          isManual: false
      };
  };

  const handleEditSummary = (emp: Employee) => {
      const totals = getCalculatedTotals(emp.id);
      
      const currentOverrides: OverrideMap = JSON.parse(localStorage.getItem(`gtk_erp_summary_overrides_${selectedMonth}`) || '{}');
      const saved = currentOverrides[emp.id];

      // Calculate System Loan Deduction
      const activeLoans = HRService.getLoans().filter(l => l.employeeId === emp.id && l.status === 'Active');
      const hasActiveLoan = activeLoans.length > 0;
      
      let calculatedSystemDeduction = 0;
      activeLoans.forEach(l => {
          if (l.type === 'Loan') calculatedSystemDeduction += l.repaymentAmount;
          else if (l.type === 'Advance') calculatedSystemDeduction += l.amount;
      });

      let initialManualAbsent = 0; 
      let initialLates = Number(totals.l);
      
      let initialManualLoan = saved ? (saved.manualLoanDeduction ?? calculatedSystemDeduction) : calculatedSystemDeduction;
      let initialReqRef = saved ? (saved.reqRef || '') : '';

      if (saved) {
          initialManualAbsent = saved.manualAbsent ?? 0;
          initialLates = saved.lates ?? 0;
      } else {
          const penaltyFromLates = Math.floor(initialLates / 3);
          initialManualAbsent = Math.max(0, Number(totals.a) - penaltyFromLates); 
      }

      setEditingSummary({
          employeeId: emp.id,
          name: emp?.personal?.name ?? "",
          code: emp?.work?.employeeCode ?? "",
          manualAbsent: initialManualAbsent,
          lates: initialLates,
          allowedAbsent: Number(totals.allowedAbsent || 0),
          sunday: Number(totals.s),
          ot: Number(totals.ot),
          
          systemLoanDeduction: calculatedSystemDeduction,
          manualLoanDeduction: initialManualLoan,
          reqRef: initialReqRef,
          
          hasActiveLoan
      });
      setIsEditSummaryModalOpen(true);
  };

  const applyRequisitionOverride = (reqId: string, type: 'Waive Absent' | 'Skip Installment') => {
      const req = type === 'Waive Absent' 
          ? authorizedWaiveReqs.find(r => r.id === reqId)
          : authorizedSkipReqs.find(r => r.id === reqId);
      
      if (!req || !editingSummary) return;

      if (type === 'Waive Absent') {
          // Heuristic: Check if description contains a number for days, else default to 1
          const daysMatch = req.headerText.match(/\d+/);
          const days = daysMatch ? parseInt(daysMatch[0]) : 1;
          setEditingSummary(prev => prev ? ({ ...prev, allowedAbsent: days, reqRef: req.id }) : null);
      } else if (type === 'Skip Installment') {
          setEditingSummary(prev => prev ? ({ ...prev, manualLoanDeduction: 0, reqRef: req.id }) : null);
      }
  };

  const saveManualSummary = () => {
      if (!editingSummary) return;
      
      const sandwichPenalty = editingSummary.sunday * 2;
      const latePenalty = Math.floor(editingSummary.lates / 3);
      const totalCalculatedAbsent = editingSummary.manualAbsent + sandwichPenalty + latePenalty;

      const currentOverrides: OverrideMap = JSON.parse(localStorage.getItem(`gtk_erp_summary_overrides_${selectedMonth}`) || '{}');
      
      currentOverrides[editingSummary.employeeId] = {
          absent: totalCalculatedAbsent,
          manualAbsent: editingSummary.manualAbsent,
          lates: editingSummary.lates,
          allowedAbsent: editingSummary.allowedAbsent,
          sunday: editingSummary.sunday,
          ot: editingSummary.ot,
          
          // Loan Override Data
          manualLoanDeduction: editingSummary.manualLoanDeduction,
          reqRef: editingSummary.reqRef
      };
      
      localStorage.setItem(`gtk_erp_summary_overrides_${selectedMonth}`, JSON.stringify(currentOverrides));
      // Phase 8: sync to Supabase
      if (editingSummary?.employeeId) {
        AttendanceOverrideService.save(company, selectedMonth, editingSummary.employeeId, currentOverrides[editingSummary.employeeId]).catch(() => {});
      }

      // Phase 3: Mark used requisition as Completed
      if (editingSummary.reqRef) {
          const allReqs = InventoryService.getRequisitions().filter(Boolean);
          const updatedReqs = allReqs.map(r => r.id === editingSummary.reqRef ? { ...r, status: 'Completed' as const } : r);
          InventoryService.saveRequisitions(updatedReqs);
      }

      setIsEditSummaryModalOpen(false);
      refreshAllData();
  };

  const clearSummaryOverrides = () => {
      if (confirm("Reset all manual overrides to system-calculated values for this month?")) {
          localStorage.removeItem(`gtk_erp_summary_overrides_${selectedMonth}`);
          AttendanceOverrideService.clear(company, selectedMonth).catch(() => {});
          refreshAllData();
      }
  };

  // ... (Export JSON/Excel logic remains the same)
  const handleExportJSON = () => {
    const dataStr = JSON.stringify(allMonthRecords, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Attendance_${company}_${selectedMonth}.json`;
    link.click();
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const imported: AttendanceRecord[] = JSON.parse(evt.target?.result as string);
        if (!Array.isArray(imported)) throw new Error("Invalid format");
        const allStorage = HRService.getAttendance();
        const importedKeys = new Set(imported.map(r => `${r.employeeId}_${r.date}`));
        const filteredStorage = allStorage.filter(r => !importedKeys.has(`${r.employeeId}_${r.date}`));
        HRService.saveAttendance([...filteredStorage, ...imported]);
        refreshAllData();
        toast.success(`Successfully imported ${imported.length} records.`);
      } catch (err) {
        toast.error("Error importing JSON: Invalid attendance file.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportExcel = () => {
    const header = ['Code', 'Name', ...Array.from({ length: numDays }, (_, i) => (i + 1).toString()), 'P', 'A', 'OT'];
    const rows = employees.map(emp => {
      const totals = getCalculatedTotals(emp.id);
      const dailyStatuses = Array.from({ length: numDays }, (_, i) => {
        const dateStr = `${selectedMonth}-${String(i + 1).padStart(2, '0')}`;
        const rec = allMonthRecords.find(r => r.employeeId === emp.id && r.date === dateStr);
        if (!rec) return '-';
        let char = rec.status.charAt(0);
        if (rec.overtimeHours > 0) char += `+${rec.overtimeHours}`;
        return char;
      });
      return [emp?.work?.employeeCode ?? "", emp?.personal?.name ?? "", ...dailyStatuses, totals.p, totals.a, totals.ot];
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `Attendance_${company}_${selectedMonth}.xlsx`);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        if (rows.length < 2) { toast.error('Empty file'); return; }

        const headerRow = rows[0] as string[];
        // Find day columns: columns 2..N-3 are day numbers
        // Format: [Code, Name, 1,2,...,31, P, A, OT]
        const dayStartIdx = 2;
        const dayEndIdx = headerRow.length - 3; // before P, A, OT

        const allStorage = HRService.getAttendance();
        // Remove existing records for this month + company employees
        const empIds = new Set(employees.map(e => e.id));
        const otherData = allStorage.filter(r => !(r.date?.startsWith(selectedMonth) && empIds.has(r.employeeId)));

        const newRecords: AttendanceRecord[] = [];

        for (let ri = 1; ri < rows.length; ri++) {
          const row = rows[ri];
          if (!row || !row[0]) continue;
          const code = String(row[0]).trim();
          // Normalize: '003' → matches 'GTK-003', '0114' → 'GTK-114' etc.
          const stripNum = (s: string) => s.replace(/^[A-Za-z]+-?0*/,'').replace(/^0+/,'') || '0';
          const emp = employees.find(e => {
            const ec = e.work?.employeeCode || '';
            return ec === code ||
              ec === code.replace(/^0+/,'').padStart(3,'0') ||
              stripNum(ec) === stripNum(code) ||
              e.personal?.name?.toLowerCase() === String(row[1]||'').trim().toLowerCase();
          });
          if (!emp) continue;

          for (let ci = dayStartIdx; ci <= dayEndIdx; ci++) {
            const day = Number(headerRow[ci]);
            if (isNaN(day) || day < 1 || day > 31) continue;
            const cell = String(row[ci] || '').trim();
            if (!cell || cell === '-') continue;

            const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
            const dt = new Date(dateStr);
            if (isNaN(dt.getTime())) continue;

            // Parse cell: P, A, L, V, P+2 (OT hours), etc.
            let status: AttendanceStatus = 'Present';
            let ot = 0;
            const firstChar = cell.charAt(0).toUpperCase();
            if (firstChar === 'A') status = 'Absent';
            else if (firstChar === 'L') status = 'Late';
            else if (firstChar === 'V') status = 'Leave';
            else status = 'Present';

            const otMatch = cell.match(/\+(\d+\.?\d*)/);
            if (otMatch) ot = parseFloat(otMatch[1]);

            newRecords.push({
              id: `ATT-IMP-${emp.id}-${dateStr}`,
              employeeId: emp.id,
              date: dateStr,
              status,
              lateMinutes: 0,
              earlyMinutes: 0,
              overtimeHours: ot,
            } as AttendanceRecord);
          }
        }

        HRService.saveAttendance([...otherData, ...newRecords]);
        refreshAllData();
        toast.success(`Imported ${newRecords.length} attendance records from Excel.`);
        if (excelImportRef.current) excelImportRef.current.value = '';
      } catch (err: any) {
        toast.error('Excel import failed: ' + (err.message || 'Unknown error'));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-center bg-white p-4 rounded-xl border no-print shadow-sm gap-4">
        <div className="flex items-center space-x-6 w-full lg:w-auto">
          <div className="flex items-center space-x-1 bg-slate-50 p-1 rounded-xl">
            <button onClick={() => { setViewType('daily'); setIsBulkEditing(false); }} className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${viewType === 'daily' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Daily Mark</button>
            <button onClick={() => { setViewType('monthly'); setIsBulkEditing(false); }} className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${viewType === 'monthly' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Monthly View</button>
            <button onClick={() => { setViewType('summary'); setIsBulkEditing(false); }} className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${viewType === 'summary' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Summary Input</button>
            <button onClick={() => { setViewType('reconcile'); setIsBulkEditing(false); }} className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${viewType === 'reconcile' ? 'bg-white shadow text-red-600' : 'text-slate-400 hover:text-slate-600'}`}>Reconcile</button>
          </div>
          <div className="flex items-center space-x-4">
            <Calendar className="text-blue-600" size={20} />
            <input 
                type={viewType === 'daily' ? "date" : "month"} 
                value={viewType === 'daily' ? selectedDate : selectedMonth} 
                onChange={(e) => {
                    const val = e.target.value;
                    setSelectedDate(viewType === 'daily' ? val : `${val}-01`);
                }} 
                className="border-none font-black text-lg bg-transparent focus:ring-0 outline-none w-40" 
            />
          </div>
          <button onClick={refreshAllData} className="p-2 text-slate-400 hover:text-blue-600 transition-colors" title="Sync Data"><RefreshCw size={18}/></button>
        </div>

        <div className="flex items-center space-x-2 w-full lg:w-auto overflow-x-auto no-scrollbar pb-1">
          {viewType === 'monthly' && (
            <div className="flex items-center space-x-2 border-r pr-3 mr-1">
              <input type="file" ref={jsonInputRef} onChange={handleImportJSON} className="hidden" accept=".json" />
              <input type="file" ref={excelImportRef} onChange={handleImportExcel} className="hidden" accept=".xlsx,.xls" />
              <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl">
                 <button onClick={handleExportJSON} className="p-2 text-slate-600 hover:bg-white rounded-lg transition-all" title="Backup JSON"><FileJson size={18}/></button>
                 <button onClick={handleExportExcel} className="p-2 text-emerald-600 hover:bg-white rounded-lg transition-all" title="Export Excel"><FileSpreadsheet size={18}/></button>
                 <div className="w-px h-6 bg-slate-200 mx-1"></div>
                 <button onClick={() => excelImportRef.current?.click()} className="p-2 text-blue-600 hover:bg-white rounded-lg transition-all" title="Import Excel"><FileUp size={18}/></button>
                 <button onClick={() => jsonInputRef.current?.click()} className="p-2 text-slate-600 hover:bg-white rounded-lg transition-all" title="Restore JSON"><UploadCloud size={18}/></button>
              </div>
            </div>
          )}

          {viewType === 'summary' && (
              <button onClick={clearSummaryOverrides} className="bg-slate-100 text-slate-600 px-4 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-slate-200 transition-all">Reset Monthly Overrides</button>
          )}

          {viewType === 'daily' ? (
            !isSelectedDateSunday && (
              <div className="flex items-center gap-2">
                <button onClick={handleSaveAll} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg hover:bg-blue-700 transition-all whitespace-nowrap">Save Register</button>
                {pendingApproval && (
                  <button onClick={() => setShowSupervisorModal(true)} className="bg-amber-500 text-white px-4 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-amber-600 transition-all whitespace-nowrap animate-pulse">⚠ Supervisor Approve</button>
                )}
              </div>
            )
          ) : viewType === 'monthly' ? (
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Click employee row to edit</span>
          ) : null}
        </div>
      </div>

      {viewType === 'daily' && (
        isSelectedDateSunday ? (
            <div className="bg-amber-50 p-16 text-center rounded-3xl border border-amber-200 animate-in fade-in"><Coffee size={40} className="mx-auto text-amber-600 mb-4"/><h3 className="text-2xl font-black text-amber-900 uppercase">Sunday Holiday</h3><p className="text-amber-700 font-bold text-xs uppercase mt-2">No operations scheduled for today</p></div>
        ) : (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden animate-in slide-in-from-bottom-4">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-500 tracking-widest">
                <tr><th className="px-6 py-5">Employee Registry</th><th className="px-6 py-5">Status</th><th className="px-6 py-5">Late (Mins)</th><th className="px-6 py-5">Overtime (Hrs)</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp) => {
                  const record = records.find(r => r.employeeId === emp.id);
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4"><p className="font-black text-slate-900 leading-none">{emp?.personal?.name ?? "—"}</p><p className="text-[9px] text-slate-400 font-bold uppercase mt-1">{emp?.work?.employeeCode ?? "—"}</p></td>
                      <td className="px-6 py-4">
                        <select value={record?.status || 'Present'} onChange={(e) => handleUpdateRecord(emp.id, e.target.value as any, record?.lateMinutes || 0, record?.earlyMinutes || 0, record?.overtimeHours || 0)} className="text-[10px] font-black uppercase border-2 border-slate-100 rounded-lg px-3 py-1.5 outline-none focus:border-blue-500 transition-all bg-white">
                          <option value="Present">Present</option><option value="Absent">Absent</option><option value="Late">Late</option><option value="Leave">Leave</option>
                        </select>
                      </td>
                      <td className="px-6 py-4"><input type="number" value={record?.lateMinutes || 0} onChange={(e) => handleUpdateRecord(emp.id, record?.status || 'Present', Number(e.target.value), record?.earlyMinutes || 0, record?.overtimeHours || 0)} className="w-24 border-2 border-slate-100 rounded-lg px-3 py-1.5 outline-none focus:border-blue-500 font-bold text-sm" /></td>
                      <td className="px-6 py-4"><input type="number" value={record?.overtimeHours || 0} onChange={(e) => handleUpdateRecord(emp.id, record?.status || 'Present', record?.lateMinutes || 0, record?.earlyMinutes || 0, Number(e.target.value))} className="w-24 border-2 border-slate-100 rounded-lg px-3 py-1.5 outline-none focus:border-blue-500 font-bold text-sm text-indigo-600" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ... (Monthly View remains same, omitted for brevity but should be kept if re-rendering) */}
      {viewType === 'monthly' && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden h-[70vh] animate-in fade-in">
          <div className="overflow-auto h-full scrollbar-thin">
            <table className="w-full text-left border-collapse min-w-[1800px]">
              <thead className="bg-slate-900 text-white text-[9px] font-black uppercase sticky top-0 z-30">
                <tr>
                  <th className="px-4 py-4 sticky left-0 top-0 bg-slate-900 z-40 w-56 border-r border-white/10 shadow-xl">Employee Registry</th>
                  {daysArray.map(day => {
                      const dStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
                      const isSun = new Date(dStr).getDay() === 0;
                      return <th key={day} className={`px-1.5 py-4 text-center border-r border-white/10 ${isSun ? 'bg-rose-900' : ''}`}>{day}</th>
                  })}
                  <th className="px-4 py-4 text-center bg-blue-800 sticky right-[120px] top-0 z-30 border-l border-white/10">Total P</th>
                  <th className="px-4 py-4 text-center bg-red-800 sticky right-[60px] top-0 z-30 border-l border-white/10">Total A</th>
                  <th className="px-4 py-4 text-center bg-indigo-800 sticky right-0 top-0 z-30 border-l border-white/10">Net OT (h)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp, empIdx) => {
                  const totals = getCalculatedTotals(emp.id);
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 sticky left-0 bg-white z-20 border-r shadow-lg">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-bold text-xs text-slate-800 leading-none">{emp?.personal?.name ?? "—"}</p>
                            <p className="text-[8px] text-slate-400 font-black uppercase mt-1 tracking-tighter">{emp?.work?.employeeCode ?? "—"}</p>
                          </div>
                          <button
                            onClick={() => setIndividualEditEmp(emp)}
                            className="shrink-0 px-2 py-1 text-[8px] font-black uppercase bg-blue-50 border border-blue-100 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all tracking-widest"
                            title="Edit this employee's monthly attendance"
                          >Edit</button>
                        </div>
                      </td>
                      {daysArray.map(day => {
                        const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
                        const isSun = new Date(dateStr).getDay() === 0;
                        const d = isBulkEditing ? bulkData[emp.id]?.[dateStr] : null;
                        const r = !isBulkEditing ? allMonthRecords.find(x => x.employeeId === emp.id && x.date === dateStr) : null;
                        let status = isBulkEditing ? d?.status : r?.status;
                        let ot = isBulkEditing ? d?.ot : r?.overtimeHours;
                        
                        return (
                          <td key={day} className={`px-0.5 py-1 text-center border-r border-slate-50 ${isSun ? 'bg-rose-50/30' : ''}`}>
                             {isBulkEditing ? (
                               isSun ? (
                                 <span className={`text-[10px] font-black ${status === 'Absent' ? 'text-red-600' : 'text-slate-300'}`}>{status === 'Absent' ? 'A' : 'SUN'}</span>
                               ) : (
                                 <div className="flex flex-col space-y-0.5 scale-90 items-center justify-center">
                                   <input type="text" maxLength={1} className="w-full text-[10px] p-0.5 text-center font-black border rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white" value={status === 'Present' ? 'P' : status === 'Absent' ? 'A' : status === 'Late' ? 'L' : status === 'Leave' ? 'V' : ''} onChange={e => updateBulkValue(emp.id, dateStr, 'status', getStatusFromInput(e.target.value))} />
                                   <input type="number" className="w-full text-[8px] p-0.5 text-center font-bold border rounded bg-indigo-50 outline-none" placeholder="OT" value={ot || ''} onChange={e => updateBulkValue(emp.id, dateStr, 'ot', Number(e.target.value))} />
                                 </div>
                               )
                             ) : (
                               <div className="flex flex-col items-center">
                                 <span className={`text-[10px] font-black ${status === 'Absent' ? 'text-red-600' : status === 'Late' ? 'text-amber-600' : isSun ? 'text-rose-300' : status === 'Present' ? 'text-emerald-600' : 'text-slate-200'}`}>{status ? status.charAt(0) : (isSun ? 'S' : '-')}</span>
                                 {ot > 0 && <span className="text-[7px] text-blue-600 font-bold">+{ot}</span>}
                               </div>
                             )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center font-black text-blue-700 bg-blue-50/50 text-sm sticky right-[120px] border-l border-blue-100 z-20">{totals.p}</td>
                      <td className="px-4 py-3 text-center font-black text-red-700 bg-red-50/50 text-sm sticky right-[60px] border-l border-red-100 z-20">{totals.a}</td>
                      <td className="px-4 py-3 text-center font-black text-indigo-700 bg-indigo-50/50 text-sm sticky right-0 border-l border-indigo-100 z-20">{totals.ot}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewType === 'summary' && (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden animate-in fade-in">
              <div className="p-6 border-b bg-slate-50 flex justify-between items-center">
                  <div>
                      <h3 className="text-sm font-black uppercase text-slate-800 tracking-widest">Monthly Attendance Summary</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Calculated Totals for Payroll Engine</p>
                  </div>
                  <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-100">
                          <AlertCircle size={14}/>
                          <span className="text-[10px] font-black uppercase">Manual Edits take priority over register</span>
                      </div>
                  </div>
              </div>
              <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-500 tracking-widest">
                      <tr>
                          <th className="px-6 py-5">Associate Profile</th>
                          <th className="px-6 py-5 text-center">Total Absents (Final)</th>
                          <th className="px-6 py-5 text-center">Lates Recorded</th>
                          <th className="px-6 py-5 text-center">Allowed Absents</th>
                          <th className="px-6 py-5 text-center">Sandwich Days</th>
                          <th className="px-6 py-5 text-center">Total OT Hrs</th>
                          <th className="px-6 py-5 text-center">Loan Recovery</th>
                          <th className="px-6 py-5 text-right">Actions</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {employees.map(emp => {
                          const totals = getCalculatedTotals(emp.id);
                          const hasOverride = totals.loanOverride !== undefined;
                          
                          return (
                              <tr key={emp.id} className={`hover:bg-slate-50/50 transition-colors ${totals.isManual ? 'bg-amber-50/30' : ''}`}>
                                  <td className="px-6 py-4">
                                      <div className="flex items-center space-x-3">
                                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${totals.isManual ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                              {totals.isManual ? <Edit3 size={14}/> : emp?.personal?.name?.charAt(0) ?? "?"}
                                          </div>
                                          <div>
                                              <p className="font-bold text-slate-900 leading-none">{emp?.personal?.name ?? "—"}</p>
                                              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">{emp?.work?.employeeCode ?? "—"}</p>
                                          </div>
                                      </div>
                                  </td>
                                  <td className="px-6 py-4 text-center font-black text-rose-600">{totals.a}</td>
                                  <td className="px-6 py-4 text-center font-black text-slate-500">{totals.l}</td>
                                  <td className="px-6 py-4 text-center font-black text-emerald-600">{totals.allowedAbsent || 0}</td>
                                  <td className="px-6 py-4 text-center font-black text-slate-800">{totals.s}</td>
                                  <td className="px-6 py-4 text-center font-black text-indigo-700">{totals.ot}</td>
                                  <td className="px-6 py-4 text-center">
                                      {hasOverride ? (
                                          <div className="flex flex-col items-center">
                                              <span className="text-[10px] font-black text-slate-900">{Number(totals.loanOverride).toLocaleString()}</span>
                                              <span className="text-[8px] font-bold text-blue-600 uppercase bg-blue-50 px-1 rounded">Manual</span>
                                          </div>
                                      ) : (
                                          <span className="text-[9px] text-slate-300 font-bold uppercase">System Auto</span>
                                      )}
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                      <button onClick={() => handleEditSummary(emp)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Edit size={16}/></button>
                                  </td>
                              </tr>
                          );
                      })}
                  </tbody>
              </table>
          </div>
      )}

      {individualEditEmp && (
        <IndividualAttendanceModal
          employee={individualEditEmp}
          month={selectedMonth}
          onClose={() => setIndividualEditEmp(null)}
          onSaved={() => { refreshAllData(); }}
        />
      )}

      {isEditSummaryModalOpen && editingSummary && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[500] animate-in fade-in duration-300">
              <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col border border-slate-300">
                  <div className="px-10 py-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
                      <div className="flex items-center space-x-4">
                          <div className="p-3 bg-blue-600 rounded-2xl shadow-lg"><FileText size={24}/></div>
                          <div>
                              <h3 className="text-xl font-black uppercase tracking-tight">Manual Summary Entry</h3>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Override Calculated Totals</p>
                          </div>
                      </div>
                      <button onClick={() => setIsEditSummaryModalOpen(false)} className="hover:bg-white/10 p-2 rounded-full transition-colors"><X size={24}/></button>
                  </div>
                  <div className="p-10 space-y-8 bg-slate-50 overflow-y-auto max-h-[70vh]">
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
                          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 font-black"><UserCircle2 size={24}/></div>
                          <div><p className="text-lg font-black text-slate-900 leading-none">{editingSummary.name}</p><p className="text-xs font-bold text-slate-400 uppercase tracking-tighter mt-1">{editingSummary.code} | {selectedMonth}</p></div>
                      </div>
                      
                      {/* Phase 2: Authorization Links */}
                      {(authorizedWaiveReqs.length > 0 || authorizedSkipReqs.length > 0) && (
                          <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
                              <label className="text-[10px] font-black uppercase text-emerald-800 mb-2 block flex items-center gap-1"><ShieldCheck size={10}/> Link Authorization (Seth Approved)</label>
                              <div className="grid grid-cols-2 gap-4">
                                  {authorizedWaiveReqs.length > 0 && (
                                      <select className="bg-white border border-emerald-200 rounded-lg p-2 text-[10px] font-bold text-emerald-700 outline-none" onChange={(e) => applyRequisitionOverride(e.target.value, 'Waive Absent')}>
                                          <option value="">-- Apply Waiver --</option>
                                          {authorizedWaiveReqs.map(r => <option key={r.id} value={r.id}>{r.headerText} ({r.id})</option>)}
                                      </select>
                                  )}
                                  {authorizedSkipReqs.length > 0 && (
                                      <select className="bg-white border border-emerald-200 rounded-lg p-2 text-[10px] font-bold text-emerald-700 outline-none" onChange={(e) => applyRequisitionOverride(e.target.value, 'Skip Installment')}>
                                          <option value="">-- Skip Loan --</option>
                                          {authorizedSkipReqs.map(r => <option key={r.id} value={r.id}>{r.headerText} ({r.id})</option>)}
                                      </select>
                                  )}
                              </div>
                          </div>
                      )}

                      <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Actual Manual Absents</label><input type="number" className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-lg outline-none focus:border-blue-500 transition-all text-slate-800" value={editingSummary.manualAbsent} onChange={e => setEditingSummary({...editingSummary, manualAbsent: Number(e.target.value)})} /></div>
                          <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-emerald-600 ml-1">Allowed Absents (Seth)</label><input type="number" className="w-full p-4 bg-white border-2 border-emerald-50 rounded-2xl font-black text-lg outline-none focus:border-emerald-500 transition-all text-emerald-600" value={editingSummary.allowedAbsent} onChange={e => setEditingSummary({...editingSummary, allowedAbsent: Number(e.target.value)})} /></div>
                          
                          <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-orange-600 ml-1">Sandwich Sundays (x2 Penalty)</label><input type="number" className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-lg outline-none focus:border-blue-500 transition-all text-orange-600" value={editingSummary.sunday} onChange={e => setEditingSummary({...editingSummary, sunday: Number(e.target.value)})} /></div>
                          
                          <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Total OT Hours</label><input type="number" className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-lg outline-none focus:border-blue-500 transition-all text-indigo-700" value={editingSummary.ot} onChange={e => setEditingSummary({...editingSummary, ot: Number(e.target.value)})} /></div>
                          
                          <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Total Lates</label><input type="number" className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-lg outline-none focus:border-blue-500 transition-all" value={editingSummary.lates} onChange={e => setEditingSummary({...editingSummary, lates: Number(e.target.value)})} /></div>
                          
                          <div className="space-y-1.5 opacity-60">
                              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Calculated Late Penalty</label>
                              <div className="w-full p-4 bg-slate-100 border-2 border-slate-200 rounded-2xl font-black text-lg text-rose-400 flex items-center justify-between">
                                  <span>{Math.floor(editingSummary.lates / 3)} Days</span>
                                  <Calculator size={16} className="opacity-50"/>
                              </div>
                          </div>
                      </div>

                      <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 flex items-center justify-between">
                          <p className="text-xs font-black text-rose-800 uppercase">Total Deductible Days:</p>
                          <p className="text-2xl font-black text-rose-600">
                              {Math.max(0, (editingSummary.manualAbsent + (editingSummary.sunday * 2) + Math.floor(editingSummary.lates / 3)) - editingSummary.allowedAbsent)}
                          </p>
                      </div>

                      <div className={`p-5 rounded-xl border-2 ${editingSummary.hasActiveLoan ? 'bg-white border-blue-100' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                          <div className="flex justify-between items-center mb-4">
                              <div className="flex items-center space-x-3">
                                  <Ban size={20} className={editingSummary.hasActiveLoan ? "text-blue-500" : "text-slate-400"}/>
                                  <div>
                                      <p className={`text-xs font-black uppercase ${editingSummary.hasActiveLoan ? "text-slate-800" : "text-slate-500"}`}>Loan Recovery Control</p>
                                      <p className="text-[9px] font-bold text-slate-400 uppercase">{editingSummary.hasActiveLoan ? "Set 0 to Skip Entire Deduction" : "No Active Loan"}</p>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <p className="text-[8px] font-black uppercase text-slate-400">System Calculated</p>
                                  <p className="text-sm font-black text-slate-700">{(Number(editingSummary.systemLoanDeduction) || 0).toLocaleString()}</p>
                              </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                  <label className="text-[9px] font-black uppercase text-blue-600">Authorized Repayment (PKR)</label>
                                  <input 
                                      type="number" 
                                      className="w-full p-3 bg-blue-50 border-2 border-blue-100 rounded-xl font-black text-blue-800 outline-none focus:border-blue-500"
                                      disabled={!editingSummary.hasActiveLoan}
                                      value={editingSummary.manualLoanDeduction}
                                      onChange={e => setEditingSummary({...editingSummary, manualLoanDeduction: Number(e.target.value)})}
                                  />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[9px] font-black uppercase text-slate-500 flex items-center gap-1"><FileKey size={10}/> Requisition Ref</label>
                                  <input 
                                      type="text" 
                                      placeholder="e.g. REQ-102"
                                      className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm outline-none focus:border-slate-300 uppercase"
                                      disabled={!editingSummary.hasActiveLoan}
                                      value={editingSummary.reqRef}
                                      onChange={e => setEditingSummary({...editingSummary, reqRef: e.target.value})}
                                  />
                              </div>
                          </div>
                      </div>
                  </div>
                  <div className="px-10 py-6 bg-white border-t flex justify-end space-x-4">
                      <button onClick={() => setIsEditSummaryModalOpen(false)} className="px-8 py-3 text-slate-400 font-black uppercase text-xs tracking-widest hover:text-slate-600">Discard</button>
                      <button onClick={saveManualSummary} className="bg-slate-900 text-white px-12 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-blue-600 transition-all">Confirm Totals</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

const getStatusFromInput = (input: string): AttendanceStatus => {
  const char = input.toUpperCase().trim();
  if (char === 'A') return 'Absent';
  if (char === 'L') return 'Late';
  if (char === 'V') return 'Leave';
  return 'Present';
};

export default React.memo(AttendanceRegister);
