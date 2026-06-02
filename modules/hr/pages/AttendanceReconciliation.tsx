/**
 * AttendanceReconciliation
 * Compares machine data vs manual register vs ERP records
 * Shows mismatches, lets HR resolve with one click
 */
import React, { useState } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { HRService } from '@/modules/hr/services/hrService';
import { AlertTriangle, Check, X, ChevronRight, RefreshCw, Upload } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface ReconRecord {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  date: string;
  machine?: { in?: string; out?: string };
  manual?: { in?: string; out?: string };
  erp?: { status: string; lateMinutes: number; overtimeHours: number };
  mismatch: boolean;
  mismatchType: string[];
}

const parseTime = (t: string | undefined) => {
  if (!t || t === '--:--') return null;
  return t.trim();
};

const AttendanceReconciliation: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const [records, setRecords] = useState<ReconRecord[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [machineLoaded, setMachineLoaded] = useState(false);
  const [filter, setFilter] = useState<'all' | 'mismatch'>('mismatch');

  const employees = HRService.getEmployees().filter(e => e.company === company);

  const handleMachineUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        // Parse machine export: same format as ERP export
        // [Code, Name, 1,2,...,31, P, A, OT]
        const header = rows[0] as string[];
        const erpAtt = HRService.getAttendance();
        const recons: ReconRecord[] = [];

        for (let ri = 1; ri < rows.length; ri++) {
          const row = rows[ri];
          if (!row?.[0]) continue;
          const code = String(row[0]).trim();
          const stripNum = (s: string) => s.replace(/^[A-Za-z]+-?0*/,'').replace(/^0+/,'') || '0';
          const emp = employees.find(e => {
            const ec = e.work?.employeeCode || '';
            return ec === code || stripNum(ec) === stripNum(code) ||
              e.personal?.name?.toLowerCase() === String(row[1]||'').trim().toLowerCase();
          });
          if (!emp) continue;

          for (let ci = 2; ci < header.length - 3; ci++) {
            const day = Number(header[ci]);
            if (isNaN(day) || day < 1 || day > 31) continue;
            const dateStr = `${month}-${String(day).padStart(2,'0')}`;
            const machineCell = String(row[ci] || '').trim();

            const erpRec = erpAtt.find(r => r.employeeId === emp.id && r.date === dateStr);
            const machinePresent = machineCell && machineCell !== '-' && machineCell !== 'A';
            const erpPresent = erpRec?.status === 'Present' || erpRec?.status === 'Late';

            const mismatches: string[] = [];
            if (machinePresent && !erpPresent) mismatches.push('Machine=P, ERP=A');
            if (!machinePresent && erpPresent) mismatches.push('Machine=A, ERP=P');

            if (mismatches.length || erpRec) {
              recons.push({
                employeeId: emp.id,
                employeeName: emp.personal.name,
                employeeCode: emp.work.employeeCode,
                date: dateStr,
                machine: machinePresent ? { in: machineCell } : undefined,
                erp: erpRec ? { status: erpRec.status, lateMinutes: erpRec.lateMinutes, overtimeHours: erpRec.overtimeHours } : undefined,
                mismatch: mismatches.length > 0,
                mismatchType: mismatches,
              });
            }
          }
        }

        setRecords(recons);
        setMachineLoaded(true);
        const mismatches = recons.filter(r => r.mismatch).length;
        toast.success(`Reconciliation complete — ${mismatches} mismatches found`);
      } catch(err: any) {
        toast.error('Failed to parse machine file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const resolveMismatch = (rec: ReconRecord, useSource: 'machine' | 'erp') => {
    const allAtt = HRService.getAttendance();
    if (useSource === 'machine' && rec.machine) {
      // Accept machine data — mark as Present
      const updated = allAtt.map(r =>
        r.employeeId === rec.employeeId && r.date === rec.date
          ? { ...r, status: 'Present' as const }
          : r
      );
      if (!allAtt.find(r => r.employeeId === rec.employeeId && r.date === rec.date)) {
        updated.push({ id: `ATT-RECON-${rec.employeeId}-${rec.date}`, employeeId: rec.employeeId, date: rec.date, status: 'Present', lateMinutes: 0, earlyMinutes: 0, overtimeHours: 0 });
      }
      HRService.saveAttendance(updated);
    } else if (useSource === 'erp' && !rec.machine) {
      // Keep ERP as-is — mark resolved
    }
    setRecords(prev => prev.map(r =>
      r.employeeId === rec.employeeId && r.date === rec.date
        ? { ...r, mismatch: false, mismatchType: ['Resolved'] }
        : r
    ));
    toast.success(`${rec.date} — ${rec.employeeName} resolved`);
  };

  const resolveAll = (useSource: 'machine') => {
    const mismatches = records.filter(r => r.mismatch && r.machine && r.mismatchType.includes('Machine=P, ERP=A'));
    mismatches.forEach(r => resolveMismatch(r, useSource));
    toast.success(`Resolved ${mismatches.length} machine=P records`);
  };

  const displayed = filter === 'mismatch' ? records.filter(r => r.mismatch) : records;
  const mismatchCount = records.filter(r => r.mismatch).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <RefreshCw className="text-blue-600" size={20}/>
          <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">Attendance Reconciliation</h3>
          {machineLoaded && <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${mismatchCount > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{mismatchCount} mismatches</span>}
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="bg-slate-50 border border-slate-200 p-2 rounded-xl text-sm font-bold outline-none"/>
          <label className="bg-blue-600 text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest cursor-pointer flex items-center gap-2 hover:bg-blue-700">
            <Upload size={14}/> Upload Machine File
            <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleMachineUpload}/>
          </label>
        </div>
      </div>

      {!machineLoaded ? (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
          <RefreshCw size={32} className="mx-auto mb-2 text-blue-400"/>
          <p className="font-black text-blue-700 text-sm">Upload machine attendance export to compare with ERP records</p>
          <p className="text-blue-500 text-xs mt-1">Same format as ERP export: Code | Name | 1..31 | P | A | OT</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <button onClick={() => setFilter('mismatch')} className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${filter === 'mismatch' ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-500'}`}>Mismatches Only ({mismatchCount})</button>
            <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${filter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>All ({records.length})</button>
            {mismatchCount > 0 && (
              <button onClick={() => resolveAll('machine')} className="ml-auto px-3 py-1.5 rounded-lg text-xs font-black uppercase bg-emerald-600 text-white hover:bg-emerald-700">Accept All Machine=P</button>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-800 text-white">
                <tr>
                  <th className="p-3 text-left">Employee</th>
                  <th className="p-3 text-left">Date</th>
                  <th className="p-3 text-center">Machine</th>
                  <th className="p-3 text-center">ERP</th>
                  <th className="p-3 text-center">Mismatch</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayed.slice(0, 100).map((rec, i) => (
                  <tr key={i} className={rec.mismatch ? 'bg-red-50' : 'hover:bg-slate-50'}>
                    <td className="p-3">
                      <p className="font-black text-slate-900">{rec.employeeName}</p>
                      <p className="text-[9px] text-slate-400 font-bold">{rec.employeeCode}</p>
                    </td>
                    <td className="p-3 font-bold text-slate-600">{rec.date}</td>
                    <td className="p-3 text-center">
                      {rec.machine ? <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-black rounded border border-emerald-200">P</span> : <span className="px-2 py-0.5 bg-slate-100 text-slate-400 font-black rounded">A</span>}
                    </td>
                    <td className="p-3 text-center">
                      {rec.erp ? <span className={`px-2 py-0.5 font-black rounded border ${rec.erp.status === 'Present' || rec.erp.status === 'Late' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{rec.erp.status.charAt(0)}</span> : <span className="px-2 py-0.5 bg-slate-100 text-slate-400 font-black rounded">—</span>}
                    </td>
                    <td className="p-3 text-center">
                      {rec.mismatch ? <span className="text-red-600 font-black text-[10px]">{rec.mismatchType.join(', ')}</span> : <span className="text-emerald-600 font-black text-[10px]">✓ Match</span>}
                    </td>
                    <td className="p-3 text-center">
                      {rec.mismatch && (
                        <div className="flex items-center justify-center gap-1">
                          {rec.machine && <button onClick={() => resolveMismatch(rec, 'machine')} title="Accept machine data" className="p-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"><Check size={12}/></button>}
                          <button onClick={() => setRecords(prev => prev.map(r => r.employeeId === rec.employeeId && r.date === rec.date ? {...r, mismatch: false, mismatchType: ['Ignored']} : r))} title="Ignore" className="p-1.5 bg-slate-50 text-slate-400 rounded hover:bg-slate-100"><X size={12}/></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {displayed.length > 100 && <p className="p-3 text-center text-xs text-slate-400 font-bold">Showing 100 of {displayed.length}</p>}
          </div>
        </>
      )}
    </div>
  );
};

export default AttendanceReconciliation;
