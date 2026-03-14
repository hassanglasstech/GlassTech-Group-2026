import React, { useState } from 'react';
import { toast } from 'sonner';
import { Requisition, RequisitionItem, Product, CostCenter } from '@/modules/shared/types';
import { X, Save, Plus, Trash2, Package, Calculator, Calendar, User, Info } from 'lucide-react';

interface Props {
  formData: Partial<Requisition>;
  onClose: () => void;
  onSave: (data: Requisition) => void;
  products: Product[];
  costCenters: CostCenter[];
}

export const RequisitionEditor: React.FC<Props> = ({
  formData: initialData,
  onClose,
  onSave,
  products,
  costCenters
}) => {
  const [data, setData] = useState<Partial<Requisition>>(initialData);

  const handleAddItem = () => {
    const newItem: RequisitionItem = {
      id: `ITEM-${Date.now()}`,
      itemCategory: 'Raw',
      materialDesc: '',
      qty: 1,
      unit: 'Unit',
      estimatedRate: 0,
      deliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      costCenter: costCenters[0]?.id || ''
    };
    setData(prev => ({
      ...prev,
      items: [...(prev.items || []), newItem]
    }));
  };

  const handleUpdateItem = (index: number, field: keyof RequisitionItem, value: any) => {
    const nextItems = [...(data.items || [])];
    nextItems[index] = { ...nextItems[index], [field]: value };
    
    // Recalculate total value
    const total = nextItems.reduce((sum, item) => sum + (item.qty * item.estimatedRate), 0);
    
    setData(prev => ({
      ...prev,
      items: nextItems,
      totalValue: total
    }));
  };

  const handleRemoveItem = (index: number) => {
    const nextItems = [...(data.items || [])];
    nextItems.splice(index, 1);
    const total = nextItems.reduce((sum, item) => sum + (item.qty * item.estimatedRate), 0);
    setData(prev => ({ ...prev, items: nextItems, totalValue: total }));
  };

  const handleFinalSave = (status: 'Draft' | 'Pending') => {
    if (!data.headerText) return toast.error('Header text is required', { duration: 4000 });
    if (!data.items || data.items.length === 0) return toast.error('At least one item is required', { duration: 4000 });
    
    onSave({
      ...data,
      status
    } as Requisition);
  };

  return (
    <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-500 flex flex-col h-[calc(100vh-12rem)]">
      {/* SAP Header */}
      <div className="sap-object-header flex justify-between items-center shrink-0 px-8 py-6">
        <div className="flex items-center space-x-4">
          <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
            <Package size={24} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight text-white">
              {data.id?.startsWith('PR-') ? 'Create Purchase Requisition' : 'Edit Requisition'}
            </h2>
            <p className="text-[10px] font-bold text-blue-200 uppercase tracking-widest mt-1">
              Transaction: ME51N | Internal Supply Request
            </p>
          </div>
        </div>
        <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-full transition-colors text-white">
          <X size={28} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar bg-slate-50/50">
        {/* Header Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center space-x-2 mb-2">
              <Info size={14} className="text-blue-500" />
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">General Info</span>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Header Description</label>
              <input 
                type="text" 
                className="sap-input w-full font-bold text-xs"
                placeholder="e.g. Monthly Hardware Procurement"
                value={data.headerText}
                onChange={(e) => setData({ ...data, headerText: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Date</label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="date" 
                    className="sap-input w-full pl-9 text-xs font-bold"
                    value={data.date}
                    onChange={(e) => setData({ ...data, date: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Priority</label>
                <select 
                  className="sap-input w-full text-xs font-bold"
                  value={data.priority}
                  onChange={(e) => setData({ ...data, priority: e.target.value as any })}
                >
                  <option value="Normal">Normal</option>
                  <option value="Urgent">Urgent</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center space-x-2 mb-2">
              <User size={14} className="text-blue-500" />
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Requisitioner</span>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Requested By</label>
              <input 
                type="text" 
                className="sap-input w-full font-bold text-xs"
                value={data.requisitioner}
                onChange={(e) => setData({ ...data, requisitioner: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Reference ID</label>
              <input 
                type="text" 
                className="sap-input w-full font-mono text-xs font-black text-blue-600 bg-blue-50/50"
                value={data.id}
                readOnly
              />
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-center items-center text-center">
            <div className="bg-emerald-50 p-4 rounded-full mb-4">
              <Calculator size={32} className="text-emerald-600" />
            </div>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Estimated Total Value</p>
            <h3 className="text-3xl font-black text-slate-800 tracking-tight">
              {data.totalValue?.toLocaleString()} <span className="text-xs text-slate-400">PKR</span>
            </h3>
          </div>
        </div>

        {/* Items Section */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Line Items</h3>
            <button onClick={handleAddItem} className="sap-btn-ghost text-blue-600 flex items-center space-x-2 py-1">
              <Plus size={14} />
              <span>Add Material</span>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest">Material Description</th>
                  <th className="px-6 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest w-24">Qty</th>
                  <th className="px-6 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest w-24">Unit</th>
                  <th className="px-6 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest w-32">Est. Rate</th>
                  <th className="px-6 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest w-40">Deliv. Date</th>
                  <th className="px-6 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest w-40">Cost Center</th>
                  <th className="px-6 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.items?.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-6 py-3">
                      <input 
                        type="text" 
                        className="sap-input w-full text-xs font-bold uppercase"
                        placeholder="Material name or description..."
                        value={item.materialDesc}
                        onChange={(e) => handleUpdateItem(idx, 'materialDesc', e.target.value)}
                      />
                    </td>
                    <td className="px-6 py-3">
                      <input 
                        type="number" 
                        className="sap-input w-full text-xs font-black text-center"
                        value={item.qty}
                        onChange={(e) => handleUpdateItem(idx, 'qty', Number(e.target.value))}
                      />
                    </td>
                    <td className="px-6 py-3">
                      <select 
                        className="sap-input w-full text-xs font-bold"
                        value={item.unit}
                        onChange={(e) => handleUpdateItem(idx, 'unit', e.target.value)}
                      >
                        <option>Unit</option><option>KG</option><option>Mtr</option><option>SqFt</option><option>Sheet</option><option>PCS</option>
                      </select>
                    </td>
                    <td className="px-6 py-3">
                      <input 
                        type="number" 
                        className="sap-input w-full text-xs font-black text-emerald-600 text-right"
                        value={item.estimatedRate}
                        onChange={(e) => handleUpdateItem(idx, 'estimatedRate', Number(e.target.value))}
                      />
                    </td>
                    <td className="px-6 py-3">
                      <input 
                        type="date" 
                        className="sap-input w-full text-xs font-bold"
                        value={item.deliveryDate}
                        onChange={(e) => handleUpdateItem(idx, 'deliveryDate', e.target.value)}
                      />
                    </td>
                    <td className="px-6 py-3">
                      <select 
                        className="sap-input w-full text-xs font-bold"
                        value={item.costCenter}
                        onChange={(e) => handleUpdateItem(idx, 'costCenter', e.target.value)}
                      >
                        {costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                      </select>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button onClick={() => handleRemoveItem(idx)} className="text-slate-300 hover:text-rose-500 transition-colors p-1">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {(!data.items || data.items.length === 0) && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-slate-400 italic text-xs font-bold">
                      No items added yet. Click "Add Material" to begin.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-8 py-6 bg-white border-t border-slate-200 flex justify-between items-center shrink-0">
        <div className="flex items-center space-x-2 text-slate-400">
          <Info size={14} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Drafts are saved locally until submitted for approval</span>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={onClose} className="sap-btn-ghost px-8">Discard</button>
          <button onClick={() => handleFinalSave('Draft')} className="bg-slate-100 text-slate-700 px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-200 transition-all">Save Draft</button>
          <button onClick={() => handleFinalSave('Pending')} className="sap-btn-primary px-10 flex items-center space-x-2 shadow-xl shadow-blue-200">
            <Save size={16} />
            <span>Submit for Approval</span>
          </button>
        </div>
      </div>
    </div>
  );
};
