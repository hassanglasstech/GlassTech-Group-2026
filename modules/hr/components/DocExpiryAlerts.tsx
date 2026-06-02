import React, { useState, useEffect } from 'react';
import { EmployeeDoc, Employee } from '../types/hr';
import { EmployeeDocService, DOC_TYPE_META } from '../services/employeeDocService';
import { HRService } from '../services/hrService';
import { useAppStore } from '@/modules/shared/store/appStore';
import { AlertTriangle, Clock, CheckCircle2, FileWarning, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

const DocExpiryAlerts: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [expiring, setExpiring] = useState<(EmployeeDoc & { empName: string; empCode: string })[]>([]);
  const [expired, setExpired] = useState<(EmployeeDoc & { empName: string; empCode: string })[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlerts();
  }, [company]);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const employees = HRService.getEmployees().filter(e => e.company === company);
      const empMap = new Map(employees.map(e => [e.id, e]));
      const companyEmployeeIds = new Set(employees.map(e => e.id));

      const enrichDoc = (doc: EmployeeDoc) => {
        const emp = empMap.get(doc.employeeId);
        return { ...doc, empName: emp?.personal.name || 'Unknown', empCode: emp?.work.employeeCode || '' };
      };

      const [expiringDocs, expiredDocs] = await Promise.all([
        EmployeeDocService.getExpiring(30),
        EmployeeDocService.getExpired(),
      ]);

      setExpiring(
        expiringDocs
          .filter(d => companyEmployeeIds.has(d.employeeId))
          .map(enrichDoc)
          .sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || ''))
      );
      setExpired(
        expiredDocs
          .filter(d => companyEmployeeIds.has(d.employeeId))
          .map(enrichDoc)
          .sort((a, b) => (b.expiryDate || '').localeCompare(a.expiryDate || ''))
      );
    } catch (err) {
      console.warn('[DocAlerts] Load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center space-x-3">
        <RefreshCw size={16} className="animate-spin text-slate-400" />
        <span className="text-xs font-bold text-slate-400">Checking document status...</span>
      </div>
    );
  }

  const total = expiring.length + expired.length;
  if (total === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center space-x-3">
          <CheckCircle2 size={20} className="text-emerald-500" />
          <div>
            <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Document status</p>
            <p className="text-xs text-emerald-600 font-bold">All documents up to date</p>
          </div>
        </div>
      </div>
    );
  }

  const displayLimit = showAll ? total : 5;
  const combined = [...expired, ...expiring];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <FileWarning size={18} className={expired.length > 0 ? 'text-red-500' : 'text-amber-500'} />
          <div>
            <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Document alerts</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
              {expired.length > 0 && <span className="text-red-600">{expired.length} expired</span>}
              {expired.length > 0 && expiring.length > 0 && ' · '}
              {expiring.length > 0 && <span className="text-amber-600">{expiring.length} expiring soon</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {expired.length > 0 && <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-red-50 text-red-700 border border-red-100">{expired.length}</span>}
          {expiring.length > 0 && <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-100">{expiring.length}</span>}
        </div>
      </div>

      <div className="divide-y divide-slate-50">
        {combined.slice(0, displayLimit).map(doc => {
          const meta = DOC_TYPE_META[doc.docType];
          const isExpired = doc.status === 'expired';
          const daysLeft = doc.expiryDate ? Math.ceil((new Date(doc.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;

          return (
            <div key={doc.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
              <div className="flex items-center space-x-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${isExpired ? 'bg-red-50' : 'bg-amber-50'}`}>{meta.icon}</div>
                <div>
                  <p className="text-sm font-bold text-slate-900 leading-tight">
                    {doc.empName}<span className="text-[10px] text-slate-400 ml-2 font-bold">{doc.empCode}</span>
                  </p>
                  <p className="text-[10px] text-slate-500 font-bold">{meta.label}</p>
                </div>
              </div>
              <div className="text-right">
                {isExpired ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-red-600 uppercase"><AlertTriangle size={10} /> Expired {doc.expiryDate}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-600 uppercase"><Clock size={10} /> {daysLeft} days left</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {total > 5 && (
        <button onClick={() => setShowAll(!showAll)}
          className="w-full px-5 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1 border-t border-slate-100">
          {showAll ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show all {total} alerts</>}
        </button>
      )}
    </div>
  );
};

export default React.memo(DocExpiryAlerts);
