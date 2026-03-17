import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Requisition, RequisitionItem, Product, CostCenter } from '@/modules/shared/types';
import { FinanceService } from '@/modules/finance/services/financeService';
import { X, Save, Plus, Trash2, Package, Calculator, Calendar, User, Info, Zap, AlertTriangle, CheckCircle2, BookOpen } from 'lucide-react';

interface Props {
  formData: Partial<Requisition>;
  onClose: () => void;
  onSave: (data: Requisition) => void;
  products: Product[];
  costCenters: CostCenter[];
}

const GL_CATEGORIES = [
  'Raw Material',
  'Factory Utilities',
  'Repair & Maintenance',
  'Admin / Office',
  'Selling & Dist.',
  'Employee Loan',
  'Procurement / Other',
] as const;

export const RequisitionEditor: React.FC<Props> = ({
  formData: initialData,
  onClose,
  onSave,
  products,
  costCenters,
}) => {
  const [data, setData] = useState<Partial<Requisition>>(initialData);
  const [glHint, setGlHint] = useState<{ debitCode: string; debitName: string; creditCode: string; creditName: string } | null>(null);
  const [ccSpend, setCcSpend] = useState<{ posted: number; parked: number; total: number } | null>(null);

  // Resolve GL hint whenever category changes
  useEffect(() => {
    const category = data.category || 'Procurement / Other';
    const company = data.company || 'Glassco';
    const resolved = FinanceService.resolveGLMapping(company as any, category);
    setGlHint(resolved);
  }, [data.category, data.company]);

  // Fetch cost center spend whenever primary cost center changes
  useEffect(() => {
    const primaryCC = data.items?.[0]?.costCenter;
    if (!primaryCC || !data.company) { setCcSpend(null); return; }
    const spend = FinanceService.getCostCenterSpend(data.company as any, primaryCC);
    setCcSpend(spend);
  }, [data.items, data.company]);

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
    setData(prev => ({ ...prev, items: [...(prev.items || []), newItem] }));
  };

  const handleUpdateItem = (index: number, field: keyof RequisitionItem, value: any) => {
    const nextItems = [...(data.items || [])];
    nextItems[index] = { ...nextItems[index], [field]: value };
    const total = nextItems.reduce((sum, item) => sum + (item.qty * item.estimatedRate), 0);
    setData(prev => ({ ...prev, items: nextItems, totalValue: total, estimatedAmount: total }));
  };

  const handleRemoveItem = (index: number) => {
    const nextItems = [...(data.items || [])];
    nextItems.splice(index, 1);
    const total = nextItems.reduce((sum, item) => sum + (item.qty * item.estimatedRate), 0);
    setData(prev => ({ ...prev, items: nextItems, totalValue: total, estimatedAmount: total }));
  };

  const handleFinalSave = (status: 'Draft' | 'Pending') => {
    if (!data.headerText) return toast.error('Header description is required', { duration: 4000 });
    if (!data.items || data.items.length === 0) return toast.error('At least one item is required', { duration: 4000 });
    onSave({ ...data, status, estimatedAmount: data.totalValue } as Requisition);
  };

  const requiresPayment = data.requiresCashPayment ?? false;
  const primaryCC = costCenters.find(cc => cc.id === data.items?.[0]?.costCenter);

  return (
    <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-500 flex flex-col h-[calc(100vh-12rem)]">
      {/* Header */}
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

      <div className="flex-1 overflow-y-auto p-8 space-y-6 no-scrollbar bg-slate-50/50">

        {/* ── Row 1: General + Requisitioner + GL Hint ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* General Info */}
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
                  <input type="date" className="sap-input w-full pl-9 text-xs font-bold" value={data.date}
                    onChange={(e) => setData({ ...data, date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Priority</label>
                <select className="sap-input w-full text-xs font-bold" value={data.priority}
                  onChange={(e) => setData({ ...data, priority: e.target.value as any })}>
                  <option value="Normal">Normal</option>
                  <option value="Urgent">Urgent</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>
            {/* GL Category */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Expense Category</label>
              <select className="sap-input w-full text-xs font-bold" value={data.category || ''}
                onChange={(e) => setData({ ...data, category: e.target.value })}>
                <option value="">— Select category —</option>
                {GL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Requisitioner + Payment */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center space-x-2 mb-2">
              <User size={14} className="text-blue-500" />
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Requisitioner & Payment</span>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Requested By</label>
              <input type="text" className="sap-input w-full font-bold text-xs" value={data.requisitioner}
                onChange={(e) => setData({ ...data, requisitioner: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Reference ID</label>
              <input type="text" className="sap-input w-full font-mono text-xs font-black text-blue-600 bg-blue-50/50"
                value={data.id} readOnly />
            </div>
            {/* Cash Payment toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div>
                <p className="text-[10px] font-black uppercase text-slate-500">Requires Cash Payment?</p>
                <p className="text-[9px] text-slate-400">Auto-creates Parked PV on approval</p>
              </div>
              <button
                onClick={() => setData({ ...data, requiresCashPayment: !requiresPayment, paymentStatus: !requiresPayment ? 'Pending' : 'Not Required' })}
                className={`w-12 h-6 rounded-full transition-colors relative ${requiresPayment ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${requiresPayment ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {requiresPayment && (
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Estimated Amount (PKR)</label>
                <input type="number" className="sap-input w-full text-xs font-black text-emerald-700 text-right"
                  value={data.estimatedAmount || data.totalValue || ''}
                  onChange={(e) => setData({ ...data, estimatedAmount: Number(e.target.value) })} />
              </div>
            )}
          </div>

          {/* GL Hint Panel */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center space-x-2 mb-2">
              <BookOpen size={14} className="text-purple-500" />
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">GL Account Hint</span>
            </div>
            {glHint ? (
              <div className="space-y-3">
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-3">
                  <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-1">Debit (Expense)</p>
                  <p className="text-xs font-black text-rose-700">{glHint.debitCode}</p>
                  <p className="text-[10px] text-rose-600 font-bold">{glHint.debitName}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                  <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Credit (Cash out)</p>
                  <p className="text-xs font-black text-emerald-700">{glHint.creditCode}</p>
                  <p className="text-[10px] text-emerald-600 font-bold">{glHint.creditName}</p>
                </div>
                <p className="text-[9px] text-slate-400 text-center">Finance can adjust before posting</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-28 text-slate-300">
                <Zap size={24} className="mb-2" />
                <p className="text-[10px] font-bold uppercase">Select category above</p>
              </div>
            )}

            {/* Cost Center spend this month */}
            {ccSpend !== null && primaryCC && (
              <div className="border-t border-slate-100 pt-3 mt-2">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  {primaryCC.name} — This Month
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-center">
                    <p className="text-[9px] text-slate-400">Posted</p>
                    <p className="text-xs font-black text-slate-700">{ccSpend.posted.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] text-amber-500">Parked</p>
                    <p className="text-xs font-black text-amber-600">{ccSpend.parked.toLocaleString()}</p>
                  </div>
                </div>
                <div className="mt-2 text-center">
                  <p className="text-[9px] text-slate-500">Total committed</p>
                  <p className="text-sm font-black text-slate-800">PKR {ccSpend.total.toLocaleString()}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Row 2: Total ── */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-emerald-50 p-3 rounded-xl">
              <Calculator size={20} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Estimated Total Value</p>
              <h3 className="text-2xl font-black text-slate-800">
                PKR {(data.totalValue || 0).toLocaleString()}
              </h3>
            </div>
          </div>
          {requiresPayment && (
            <div className="flex items-center space-x-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2">
              <AlertTriangle size={14} className="text-amber-500" />
              <p className="text-xs font-bold text-amber-700">Parked PV will be auto-created on MD approval</p>
            </div>
          )}
        </div>

        {/* ── Row 3: Items Table ── */}
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
                  <th className="px-4 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest">Material / Description</th>
                  <th className="px-4 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest w-20">Qty</th>
                  <th className="px-4 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest w-24">Unit</th>
                  <th className="px-4 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest w-32">Est. Rate</th>
                  <th className="px-4 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest w-28">Amount</th>
                  <th className="px-4 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest w-36">Deliv. Date</th>
                  <th className="px-4 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest w-40">Cost Center</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.items?.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-4 py-3">
                      <input type="text" className="sap-input w-full text-xs font-bold uppercase"
                        placeholder="Material name or description..."
                        value={item.materialDesc}
                        onChange={(e) => handleUpdateItem(idx, 'materialDesc', e.target.value)} />
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" className="sap-input w-full text-xs font-black text-center"
                        value={item.qty} onChange={(e) => handleUpdateItem(idx, 'qty', Number(e.target.value))} />
                    </td>
                    <td className="px-4 py-3">
                      <select className="sap-input w-full text-xs font-bold" value={item.unit}
                        onChange={(e) => handleUpdateItem(idx, 'unit', e.target.value)}>
                        <option>Unit</option><option>KG</option><option>Mtr</option><option>SqFt</option>
                        <option>Sheet</option><option>PCS</option><option>Ltr</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" className="sap-input w-full text-xs font-black text-right"
                        value={item.estimatedRate}
                        onChange={(e) => handleUpdateItem(idx, 'estimatedRate', Number(e.target.value))} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-black text-emerald-700">
                        {(item.qty * item.estimatedRate).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <input type="date" className="sap-input w-full text-xs font-bold" value={item.deliveryDate}
                        onChange={(e) => handleUpdateItem(idx, 'deliveryDate', e.target.value)} />
                    </td>
                    <td className="px-4 py-3">
                      <select className="sap-input w-full text-xs font-bold" value={item.costCenter}
                        onChange={(e) => handleUpdateItem(idx, 'costCenter', e.target.value)}>
                        <option value="">— Cost Center —</option>
                        {costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleRemoveItem(idx)} className="text-slate-300 hover:text-rose-500 transition-colors p-1">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {(!data.items || data.items.length === 0) && (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-slate-400 italic text-xs font-bold">
                      No items added yet. Click "Add Material" to begin.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-8 py-5 bg-white border-t border-slate-200 flex justify-between items-center shrink-0">
        <div className="flex items-center space-x-2 text-slate-400">
          <CheckCircle2 size={14} className="text-purple-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-purple-500">
            On approval → Parked PV created → Finance reviews → Posts to GL
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={onClose} className="sap-btn-ghost px-8">Discard</button>
          <button onClick={() => handleFinalSave('Draft')}
            className="bg-slate-100 text-slate-700 px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-200 transition-all">
            Save Draft
          </button>
          <button onClick={() => handleFinalSave('Pending')}
            className="sap-btn-primary px-10 flex items-center space-x-2 shadow-xl shadow-blue-200">
            <Save size={16} />
            <span>Submit for Approval</span>
          </button>
        </div>
      </div>
    </div>
  );
};
