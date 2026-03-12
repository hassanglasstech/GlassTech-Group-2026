
import React, { useState, useEffect } from 'react';
import { Company, CostCenter } from '../../shared/types';
import { FinanceService } from '../services/financeService';
import { Plus, Search, Trash2, X, Target, Save, Info, Layers } from 'lucide-react';

const CostCenterMaster: React.FC<{ company: Company }> = ({ company }) => {
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const initialForm: Partial<CostCenter> = { code: '', name: '', department: 'Operations', manager: '', category: 'F', hierarchyArea: `${company}-PROD` };
  const [formData, setFormData] = useState<Partial<CostCenter>>(initialForm);

  useEffect(() => { refreshData(); }, [company]);

  const refreshData = () => {
    setCenters(FinanceService.getCostCenters().filter(cc => cc.company === company));
  };

  const handleSave = () => {
    if (!formData.name || !formData.code) return alert("Code and Name are mandatory SAP protocols.");
    const newCC: CostCenter = { ...(formData as CostCenter), id: `${company}-CC-${formData.code}`, company };
    FinanceService.saveCostCenters([...FinanceService.getCostCenters(), newCC]);
    refreshData();
    setIsModalOpen(false);
    setFormData(initialForm);
  };

  const handleDelete = (id: string) => {
    if (confirm("Deactivate this Cost Center?")) {
      FinanceService.saveCostCenters(FinanceService.getCostCenters().filter(cc => cc.id !== id));
      refreshData();
    }
  };

  const getCategoryLabel = (cat?: string) => {
      switch(cat) {
          case 'F': return 'Production (F)';
          case 'H': return 'Auxiliary (H)';
          case 'W': return 'Admin (W)';
          case 'V': return 'Sales (V)';
          case 'L': return 'Logistics (L)';
          default: return 'General (G)';
      }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="bg-white border border-slate-200 p-4 shadow-sm flex justify-between items-center no-print">
        <div className="flex items-center space-x-6">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Transaction: KS01 Cost Centers</h3>
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Filter centers..." className="sap-input w-full pl-9 py-1.5 text-xs font-bold" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="sap-btn-primary flex items-center space-x-2">
          <Plus size={14} /> <span>Create Cost Center</span>
        </button>
      </div>

      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left sap-table">
          <thead>
            <tr>
              <th className="w-24">Code</th>
              <th>Description / Name</th>
              <th className="w-40">Category (Cat)</th>
              <th className="w-40">Hierarchy</th>
              <th className="w-40">Responsible</th>
              <th className="w-24 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {centers.filter(cc => cc.name.includes(searchTerm.toUpperCase())).map(cc => (
              <tr key={cc.id}>
                <td className="font-mono font-black text-blue-600">{cc.code}</td>
                <td className="font-bold text-slate-800 uppercase text-xs">{cc.name}</td>
                <td><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-slate-200">{getCategoryLabel(cc.category)}</span></td>
                <td className="text-xs font-bold text-slate-500 uppercase">{cc.hierarchyArea}</td>
                <td className="text-xs font-medium text-slate-500 uppercase">{cc.manager || '-'}</td>
                <td className="text-center">
                  <button onClick={() => handleDelete(cc.id)} className="text-slate-300 hover:text-red-600"><Trash2 size={14}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[400]">
          <div className="bg-white rounded w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-300 animate-in zoom-in duration-200">
            <div className="sap-object-header flex justify-between items-start shrink-0">
               <div>
                  <div className="flex items-center space-x-3 text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-2">
                    <Target size={14}/> <span>Transaction: KS01 Control Node</span>
                  </div>
                  <h3 className="text-2xl font-bold uppercase tracking-tight">Maintain Cost Center</h3>
               </div>
               <button onClick={() => setIsModalOpen(false)} className="hover:bg-white/10 p-2 rounded transition-colors"><X size={24} /></button>
            </div>
            
            <div className="p-8 space-y-6 bg-slate-50">
               <div className="bg-white p-4 border rounded-xl flex items-start space-x-3">
                  <Info size={20} className="text-blue-600 shrink-0"/>
                  <p className="text-[10px] text-slate-500 leading-tight">
                     <strong>SAP Controlling Logic:</strong> Cost Centers accumulate costs incurred. The <strong>Category</strong> determines the functional area (e.g. Production vs Admin) for profit center analysis.
                  </p>
               </div>

               <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold uppercase text-slate-400">Cost Center Code</label>
                     <input type="text" placeholder="e.g. 1001" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} className="sap-input w-full font-black uppercase"/>
                  </div>
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold uppercase text-slate-400">CC Category</label>
                     <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value as any})} className="sap-input w-full font-bold">
                        <option value="F">F - Production</option>
                        <option value="W">W - Administration</option>
                        <option value="V">V - Sales & Dist.</option>
                        <option value="H">H - Auxiliary</option>
                        <option value="L">L - Logistics</option>
                     </select>
                  </div>
               </div>

               <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Name / Description</label>
                  <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="sap-input w-full font-bold uppercase"/>
               </div>

               <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold uppercase text-slate-400">Hierarchy Area</label>
                     <input type="text" value={formData.hierarchyArea} onChange={e => setFormData({...formData, hierarchyArea: e.target.value})} className="sap-input w-full font-bold uppercase"/>
                  </div>
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold uppercase text-slate-400">Person Responsible</label>
                     <input type="text" value={formData.manager} onChange={e => setFormData({...formData, manager: e.target.value})} className="sap-input w-full font-bold uppercase"/>
                  </div>
               </div>
            </div>

            <div className="px-8 py-4 bg-white border-t flex justify-end space-x-3 shrink-0">
               <button onClick={() => setIsModalOpen(false)} className="sap-btn-ghost">Cancel</button>
               <button onClick={handleSave} className="sap-btn-primary flex items-center space-x-2"><Save size={14}/><span>Authorize Node</span></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CostCenterMaster;
