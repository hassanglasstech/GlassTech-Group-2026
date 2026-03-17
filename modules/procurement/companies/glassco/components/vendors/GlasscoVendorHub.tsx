import React, { useState, useEffect } from 'react';
import { Company, TemperingDispatch, ProductionPiece, PieceFault, Vendor, Quotation, VendorRate } from '../../../../../shared/types';
import { ProductionService } from '../../../../../production/services/productionService';
import { SalesService } from '../../../../../sales/services/salesService';
import { 
  LayoutGrid, List, Plus, X, Save, Trash2, Edit, Truck, Layers, Flame, Calculator, CheckCircle2, Ban, Clock, Globe, Filter, Search, Phone, Receipt, Calendar
} from 'lucide-react';
import SupplyChainDashboard from '../../../../components/vendors/SupplyChainDashboard';
import { SidePanel } from '@/modules/shared/components/SidePanel';

interface GlasscoVendorHubProps {
    company: Company;
}

const GlasscoVendorHub: React.FC<GlasscoVendorHubProps> = ({ company }) => {
  const [viewMode, setViewMode] = useState<'dashboard' | 'registry'>('dashboard');
  const [activeTab, setActiveTab] = useState<'Tempering' | 'Glass' | 'Transport'>('Tempering');
  const [activeVendor, setActiveVendor] = useState<string | null>(null);
  
  const [dispatches, setDispatches] = useState<TemperingDispatch[]>([]);
  const [pieces, setPieces] = useState<ProductionPiece[]>([]);
  const [jobOrders, setJobOrders] = useState<Quotation[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  
  const [reconcileTripId, setReconcileTripId] = useState<string | null>(null);
  const [returnDates, setReturnDates] = useState<Record<string, string>>({});
  
  const [isAddVendorOpen, setIsAddVendorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newVendorForm, setNewVendorForm] = useState<Partial<Vendor>>({ name: '', type: 'Tempering', contactPerson: '', phone: '', vehicles: [] });
  const [newVehicleInput, setNewVehicleInput] = useState('');
  
  // Rate Card State
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  const [selectedVendorForRates, setSelectedVendorForRates] = useState<Vendor | null>(null);
  const [newRateForm, setNewRateForm] = useState<Partial<VendorRate>>({ 
      thickness: '12mm', 
      type: 'All', 
      rate: 0,
      effectiveDate: new Date().toISOString().split('T')[0] 
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [registryFilter, setRegistryFilter] = useState<string>('All');

  useEffect(() => {
    refreshData();
  }, [company]);

  const refreshData = () => {
    setDispatches(ProductionService.getTemperingDispatches().filter(d => d.company === company || d.company === 'Factory'));
    setPieces(ProductionService.getProductionPieces());
    setJobOrders(SalesService.getQuotations());
    setVendors(SalesService.getVendors());
  };

  const handleUpdateReturnDate = (dispatchId: string, date: string) => {
    setReturnDates(prev => ({ ...prev, [dispatchId]: date }));
  };

  const handleReconcilePiece = (pieceId: string, action: 'OK' | 'BROKEN' | 'LOST') => {
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) return;

    let newStatus = piece.status;
    let faultData: PieceFault | undefined = undefined;

    if (action === 'OK') {
        newStatus = 'Tempered'; 
    } else {
        const isVendorFault = window.confirm("Is this a VENDOR FAULT? \n\nClick OK to charge vendor (Debit Note).\nClick Cancel for Internal/Unknown fault.");
        const description = isVendorFault ? `[VENDOR FAULT] ${action} at Plant` : `[INTERNAL] ${action} reported during Recv`;
        const estArea = 5; 
        const cost = isVendorFault ? (estArea * 450) : 0; 

        newStatus = action === 'BROKEN' ? 'Broken' : 'QC-Failed'; 
        faultData = {
            id: `FLT-${Date.now()}`,
            description,
            reportedAt: new Date().toISOString(),
            disposal: 'Recut',
            costImpact: cost
        };
    }

    const updatedPieces = pieces.map(p => p.id === pieceId ? { ...p, status: newStatus as any, fault: faultData, lastUpdated: new Date().toISOString() } : p);
    ProductionService.saveProductionPieces(updatedPieces);
    setPieces(updatedPieces);
  };

  const getBatchCostAnalysis = (dispatchId: string | null) => {
      if (!dispatchId) return { totalSqFt: 0, vendorCost: 0, transportCost: 0, transportAllocated: 0, totalRate: 0 };
      
      const trip = dispatches.find(d => d.id === dispatchId);
      if (!trip) return { totalSqFt: 0, vendorCost: 0, transportCost: 0, transportAllocated: 0, totalRate: 0 };

      const batchPieces = pieces.filter(p => p.dispatchId === dispatchId);
      const totalSqFt = batchPieces.reduce((sum, p) => {
          const order = jobOrders.find(j => j.orderNo === p.orderId);
          if (!order) return sum;
          const item = order.items[p.itemIndex];
          if (!item) return sum;
          return sum + (item.totalSqFt / (item.qty || 1));
      }, 0);

      const vendorRate = trip.chargesPerSqFt || 40;
      const transportCost = trip.totalCharges || 0;
      const transportAllocated = totalSqFt > 0 ? (transportCost / totalSqFt) : 0;
      const totalRate = vendorRate + transportAllocated;

      return {
          totalSqFt: Number(totalSqFt.toFixed(2)),
          vendorCost: vendorRate,
          transportCost,
          transportAllocated: Number(transportAllocated.toFixed(2)),
          totalRate: Number(totalRate.toFixed(2))
      };
  };

  const handleSaveVendor = () => {
      if (!newVendorForm.name) return alert("Vendor Name is required");
      
      let updatedVendors = [...vendors];
      if (editingId) {
          updatedVendors = updatedVendors.map(v => v.id === editingId ? { ...v, ...newVendorForm } as Vendor : v);
      } else {
          updatedVendors.push({ ...newVendorForm as Vendor, id: `VEND-${Date.now()}` });
      }

      SalesService.saveVendors(updatedVendors);
      setVendors(updatedVendors);
      setIsAddVendorOpen(false);
      setNewVendorForm({ name: '', type: 'Tempering', contactPerson: '', phone: '', vehicles: [] });
      setNewVehicleInput('');
      setEditingId(null);
  };

  const openAddModal = (vendor?: Vendor) => {
      if (vendor) {
          const isGhost = vendor.id.startsWith('SYS-');
          setEditingId(isGhost ? null : vendor.id);
          setNewVendorForm({
              name: vendor.name,
              type: vendor.type,
              contactPerson: vendor.contactPerson === '-' ? '' : vendor.contactPerson,
              phone: vendor.phone === '-' ? '' : vendor.phone,
              vehicles: vendor.vehicles || []
          });
      } else {
          setEditingId(null);
          setNewVendorForm({ name: '', type: 'Tempering', contactPerson: '', phone: '', vehicles: [] });
      }
      setIsAddVendorOpen(true);
  };

  // --- RATE CARD LOGIC ---
  const openRateModal = (vendor: Vendor) => {
      setSelectedVendorForRates(vendor);
      setNewRateForm({ 
          thickness: '12mm', 
          type: 'All', 
          rate: 0, 
          effectiveDate: new Date().toISOString().split('T')[0] 
      });
      setIsRateModalOpen(true);
  };

  const handleAddRate = () => {
      if (!selectedVendorForRates || !newRateForm.rate) return;
      const updatedRates = [...(selectedVendorForRates.rates || [])];
      
      // We do NOT overwrite anymore, we append new historical record.
      // Filter logic in SalesOrder will pick the latest date.
      updatedRates.push({
          id: `RATE-${Date.now()}`,
          thickness: newRateForm.thickness || '12mm',
          type: newRateForm.type || 'All',
          rate: Number(newRateForm.rate),
          effectiveDate: newRateForm.effectiveDate || new Date().toISOString().split('T')[0]
      });

      const updatedVendor = { ...selectedVendorForRates, rates: updatedRates };
      const all = SalesService.getVendors();
      const nextVendors = all.map(v => v.id === selectedVendorForRates.id ? updatedVendor : v);
      
      SalesService.saveVendors(nextVendors);
      setVendors(nextVendors);
      setSelectedVendorForRates(updatedVendor);
      setNewRateForm({ ...newRateForm, rate: 0 }); // Reset rate but keep thickness
  };

  const handleDeleteRate = (rateId: string) => {
      if (!selectedVendorForRates) return;
      const updatedRates = (selectedVendorForRates.rates || []).filter(r => r.id !== rateId);
      const updatedVendor = { ...selectedVendorForRates, rates: updatedRates };
      const all = SalesService.getVendors();
      const nextVendors = all.map(v => v.id === selectedVendorForRates.id ? updatedVendor : v);
      
      SalesService.saveVendors(nextVendors);
      setVendors(nextVendors);
      setSelectedVendorForRates(updatedVendor);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-1 rounded-2xl border border-slate-200 shadow-sm w-fit no-print">
        <button onClick={() => { setViewMode('dashboard'); setActiveVendor(null); }} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${viewMode === 'dashboard' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
            <LayoutGrid size={16} /><span>Command Center</span>
        </button>
        <button onClick={() => { setViewMode('registry'); setActiveVendor(null); }} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${viewMode === 'registry' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
            <List size={16} /><span>Vendor Registry</span>
        </button>
      </div>

      {viewMode === 'dashboard' ? (
          <SupplyChainDashboard 
              company={company}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              activeVendor={activeVendor}
              setActiveVendor={setActiveVendor}
              vendors={vendors}
              dispatches={dispatches}
              pieces={pieces}
              onReconcile={setReconcileTripId}
              onUpdateReturnDate={handleUpdateReturnDate}
              returnDates={returnDates}
          />
      ) : (
          <div className="space-y-4 animate-in fade-in duration-300">
              <div className="bg-white border border-slate-200 p-4 shadow-sm flex justify-between items-center rounded-xl">
                <div className="flex items-center space-x-4">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest hidden md:block">Master Data: BP_VENDOR</h3>
                    <div className="flex items-center space-x-2">
                        <Filter size={14} className="text-slate-400"/>
                        <select value={registryFilter} onChange={(e) => setRegistryFilter(e.target.value)} className="sap-input font-bold text-xs py-1.5 outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="All">All Categories</option>
                            <option value="Tempering">Tempering Partners</option>
                            <option value="Glass">Glass Suppliers</option>
                            <option value="Transport">Logistics & Transport</option>
                        </select>
                    </div>
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input type="text" placeholder="Search Vendor Registry..." className="sap-input w-full pl-9 py-1.5 text-xs font-bold" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}/>
                    </div>
                </div>
                <button onClick={() => openAddModal()} className="sap-btn-primary flex items-center space-x-2"><Plus size={14} /> <span>Create New Vendor</span></button>
              </div>
              <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-left sap-table">
                      <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                          <tr>
                              <th className="px-4 py-3 w-64">Vendor Profile</th>
                              <th className="px-4 py-3">Service Type</th>
                              <th className="px-4 py-3">Contact Person</th>
                              <th className="px-4 py-3">Contact Number</th>
                              <th className="px-4 py-3">Fleet</th>
                              <th className="px-4 py-3 text-center w-40">Actions</th>
                          </tr>
                      </thead>
                      <tbody>
                          {vendors.filter(v => (registryFilter === 'All' || v.type === registryFilter) && v.name.toLowerCase().includes(searchTerm.toLowerCase())).map(v => (
                              <tr key={v.id} className="group hover:bg-slate-50 transition-colors">
                                  <td className="px-4 py-3"><div className="flex items-center space-x-3"><div className={`w-8 h-8 rounded flex items-center justify-center font-bold border border-slate-200 bg-slate-100 text-slate-600`}>{v.type === 'Transport' ? <Truck size={16}/> : v.type === 'Glass' ? <Layers size={16}/> : <Flame size={16}/>}</div><div><p className="font-bold leading-tight uppercase text-xs text-slate-900">{v.name}</p><p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{v.id}</p></div></div></td>
                                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${v.type === 'Transport' ? 'bg-slate-900 text-white' : v.type === 'Glass' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>{v.type}</span></td>
                                  <td className="px-4 py-3"><p className="text-xs font-bold text-slate-700 uppercase">{v.contactPerson || '-'}</p></td>
                                  <td className="px-4 py-3"><div className="flex items-center space-x-1 text-slate-500"><Phone size={12}/><span className="text-xs font-bold font-mono">{v.phone || '-'}</span></div></td>
                                  <td className="px-4 py-3">{v.type === 'Transport' ? <span className="text-[10px] font-bold text-blue-600 uppercase bg-blue-50 px-2 py-0.5 rounded">{v.vehicles?.length || 0} Vehicles</span> : <span className="text-[10px] text-slate-400 font-bold">N/A</span>}</td>
                                  <td className="px-4 py-3 text-center">
                                      <div className="flex justify-center space-x-2">
                                          {v.type === 'Tempering' && (
                                              <button onClick={() => openRateModal(v)} className="p-1.5 text-orange-600 bg-orange-50 hover:bg-orange-100 rounded transition-colors" title="Manage Rates"><Receipt size={16}/></button>
                                          )}
                                          <button onClick={() => openAddModal(v)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit size={16} /></button>
                                          <button onClick={() => { if(confirm("Delete?")) { const u = vendors.filter(x => x.id !== v.id); SalesService.saveVendors(u); setVendors(u); }}} className="p-1.5 rounded transition-colors text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={16} /></button>
                                      </div>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {isAddVendorOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[500]">
           <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in duration-200 border border-slate-300">
              <div className="sap-object-header flex justify-between items-center shrink-0">
                 <div><h3 className="text-2xl font-bold uppercase tracking-tight">{editingId ? 'Edit Vendor Profile' : 'Onboard New Vendor'}</h3></div>
                 <button onClick={() => setIsAddVendorOpen(false)} className="hover:bg-white/10 p-2 rounded transition-colors"><X size={24}/></button>
              </div>
              <div className="p-8 space-y-6 bg-slate-50">
                 <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Vendor Name</label><input type="text" value={newVendorForm.name} onChange={e => setNewVendorForm({...newVendorForm, name: e.target.value})} className="sap-input w-full font-black uppercase" /></div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Type</label><select value={newVendorForm.type} onChange={e => setNewVendorForm({...newVendorForm, type: e.target.value as any})} className="sap-input w-full font-bold"><option value="Tempering">Tempering</option><option value="Glass">Glass</option><option value="Transport">Transport</option></select></div>
                    <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Phone</label><input type="text" value={newVendorForm.phone} onChange={e => setNewVendorForm({...newVendorForm, phone: e.target.value})} className="sap-input w-full font-bold" /></div>
                 </div>
                 <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Contact Person</label><input type="text" value={newVendorForm.contactPerson} onChange={e => setNewVendorForm({...newVendorForm, contactPerson: e.target.value})} className="sap-input w-full font-bold uppercase" /></div>
                 {newVendorForm.type === 'Transport' && (
                     <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                         <label className="text-[10px] font-black uppercase text-blue-700 ml-1 mb-2 block">Register Vehicles</label>
                         <div className="flex space-x-2 mb-2"><input type="text" placeholder="e.g. LEA-9988" value={newVehicleInput} onChange={e => setNewVehicleInput(e.target.value)} className="flex-1 p-2 border rounded-lg text-sm font-bold uppercase" /><button onClick={() => { if(newVehicleInput) { setNewVendorForm({...newVendorForm, vehicles: [...(newVendorForm.vehicles || []), newVehicleInput]}); setNewVehicleInput(''); } }} className="bg-blue-600 text-white px-4 rounded-lg font-bold text-xs">Add</button></div>
                         <div className="flex flex-wrap gap-2">{newVendorForm.vehicles?.map((v, i) => (<span key={i} className="bg-white border border-blue-200 text-blue-800 px-2 py-1 rounded text-[10px] font-bold uppercase flex items-center space-x-1"><span>{v}</span><button onClick={() => { const next = [...(newVendorForm.vehicles || [])]; next.splice(i, 1); setNewVendorForm({...newVendorForm, vehicles: next}); }}><X size={10}/></button></span>))}</div>
                     </div>
                 )}
              </div>
              <div className="px-8 py-4 bg-white border-t flex justify-end space-x-3 shrink-0">
                 <button onClick={() => setIsAddVendorOpen(false)} className="sap-btn-ghost">Cancel</button>
                 <button onClick={handleSaveVendor} className="sap-btn-primary flex items-center space-x-2"><Save size={14} /> <span>Save Vendor</span></button>
              </div>
           </div>
        </div>
      )}

      {/* RATE CARD MODAL */}
      {isRateModalOpen && selectedVendorForRates && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[500]">
              <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in duration-200 border border-slate-300">
                  <div className="px-8 py-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                      <div>
                          <h3 className="text-xl font-black uppercase tracking-tight">Rate Card History</h3>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{selectedVendorForRates.name}</p>
                      </div>
                      <button onClick={() => setIsRateModalOpen(false)} className="hover:bg-white/10 p-2 rounded-full"><X size={24}/></button>
                  </div>
                  
                  <div className="p-6 bg-slate-50 space-y-6">
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                          <h4 className="text-[10px] font-black uppercase text-slate-400 mb-2">New Rate Entry</h4>
                          <div className="flex gap-2">
                              <select className="sap-input font-bold" value={newRateForm.thickness} onChange={e => setNewRateForm({...newRateForm, thickness: e.target.value})}>
                                  <option>5mm</option><option>6mm</option><option>8mm</option><option>10mm</option><option>12mm</option><option>19mm</option>
                              </select>
                              <select className="sap-input font-bold" value={newRateForm.type} onChange={e => setNewRateForm({...newRateForm, type: e.target.value})}>
                                  <option value="All">All Types</option>
                                  <option value="Clear">Clear</option>
                                  <option value="Tinted">Tinted</option>
                                  <option value="Reflective">Reflective</option>
                                  <option value="Low-E">Low-E</option>
                              </select>
                              <div className="relative flex-1">
                                  <input type="number" className="sap-input w-full font-black text-emerald-600" placeholder="Rate" value={newRateForm.rate || ''} onChange={e => setNewRateForm({...newRateForm, rate: Number(e.target.value)})}/>
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">/SqFt</span>
                              </div>
                          </div>
                          <div className="flex gap-2 mt-2">
                              <div className="relative flex-1">
                                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
                                  <input 
                                      type="date" 
                                      className="sap-input w-full pl-9 font-bold text-xs" 
                                      value={newRateForm.effectiveDate} 
                                      onChange={e => setNewRateForm({...newRateForm, effectiveDate: e.target.value})}
                                  />
                              </div>
                              <button onClick={handleAddRate} className="bg-slate-900 text-white px-4 rounded-lg text-xs font-bold uppercase"><Plus size={16}/></button>
                          </div>
                      </div>

                      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden max-h-60 overflow-y-auto">
                          <table className="w-full text-left text-xs">
                              <thead className="bg-slate-50 font-black text-slate-500 uppercase sticky top-0">
                                  <tr>
                                      <th className="px-4 py-2">Eff. Date</th>
                                      <th className="px-4 py-2">Thickness</th>
                                      <th className="px-4 py-2">Type</th>
                                      <th className="px-4 py-2 text-right">Rate (PKR)</th>
                                      <th className="w-10"></th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y">
                                  {(selectedVendorForRates.rates || [])
                                    .sort((a,b) => new Date(b.effectiveDate || '2000-01-01').getTime() - new Date(a.effectiveDate || '2000-01-01').getTime())
                                    .map(r => (
                                      <tr key={r.id} className="hover:bg-slate-50">
                                          <td className="px-4 py-2 font-mono text-slate-500 text-[10px]">{r.effectiveDate || '-'}</td>
                                          <td className="px-4 py-2 font-bold">{r.thickness}</td>
                                          <td className="px-4 py-2 text-slate-600 uppercase text-[10px]">{r.type}</td>
                                          <td className="px-4 py-2 text-right font-black text-emerald-600">{r.rate}</td>
                                          <td className="text-center">
                                              <button onClick={() => handleDeleteRate(r.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={14}/></button>
                                          </td>
                                      </tr>
                                  ))}
                                  {(!selectedVendorForRates.rates || selectedVendorForRates.rates.length === 0) && (
                                      <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 italic font-bold">No rates defined.</td></tr>
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {reconcileTripId && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-[500]">
           <div className="bg-white rounded-[2.5rem] w-full max-w-5xl h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-200">
              <div className="px-10 py-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center space-x-4"><div className="p-3 bg-blue-600 rounded-2xl shadow-lg"><Calculator size={24}/></div><div><h3 className="text-2xl font-black uppercase tracking-tight">Service Cost Engine</h3><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Reconciliation & Cost Allocation</p></div></div>
                 <button onClick={() => setReconcileTripId(null)} className="hover:bg-white/10 p-2 rounded-full transition-colors"><X size={28}/></button>
              </div>
              <div className="flex-1 overflow-y-auto p-10 bg-slate-50">
                 {(() => {
                        const costData = getBatchCostAnalysis(reconcileTripId);
                        return (
                            <div className="bg-white p-8 rounded-[2rem] border border-blue-200 shadow-md mb-8">
                                <div className="grid grid-cols-4 gap-8">
                                    <div><p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Vendor Rate</p><p className="text-2xl font-black text-slate-800">{costData.vendorCost} <span className="text-[10px]">PKR</span></p></div>
                                    <div><p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Trip Fare</p><p className="text-2xl font-black text-slate-800">{(costData.transportCost || 0).toLocaleString()} <span className="text-[10px]">PKR</span></p></div>
                                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex flex-col justify-center items-center text-center -my-4"><p className="text-[9px] font-black uppercase text-emerald-600 tracking-widest mb-1">Net Landed Cost</p><p className="text-3xl font-black text-emerald-700">{costData.totalRate}</p><p className="text-[9px] font-bold uppercase text-emerald-600">PKR Per SqFt</p></div>
                                </div>
                            </div>
                        );
                    })()}
                 <div className="space-y-4">
                    <h4 className="text-xs font-black uppercase text-slate-500 ml-2">Manifest Checklist</h4>
                    {pieces.filter(p => p.dispatchId === reconcileTripId).map(p => (
                       <div key={p.id} className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between shadow-sm group hover:border-blue-300 transition-all">
                          <div className="flex items-center space-x-4">
                             <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${['Tempered', 'QC-Passed'].includes(p.status) ? 'bg-emerald-100 text-emerald-700' : p.status === 'Broken' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>{p.status === 'Tempered' ? <CheckCircle2 size={18}/> : p.status === 'Broken' ? <Ban size={18}/> : <Clock size={18}/>}</div>
                             <div><p className="font-black text-sm text-slate-900">{p.id}</p><p className="text-[10px] font-bold text-slate-400 uppercase">{p.specs}</p></div>
                          </div>
                          <div className="flex items-center space-x-2"><button onClick={() => handleReconcilePiece(p.id, 'OK')} className="px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-xl text-[10px] font-black uppercase transition-all">Received OK</button><button onClick={() => handleReconcilePiece(p.id, 'BROKEN')} className="px-4 py-2 bg-rose-50 text-rose-700 hover:bg-rose-600 hover:text-white rounded-xl text-[10px] font-black uppercase transition-all">Broken</button><button onClick={() => handleReconcilePiece(p.id, 'LOST')} className="px-4 py-2 bg-slate-100 text-slate-600 hover:bg-slate-800 hover:text-white rounded-xl text-[10px] font-black uppercase transition-all">Lost</button></div>
                       </div>
                    ))}
                 </div>
              </div>
              <div className="px-10 py-8 bg-white border-t flex justify-end"><button onClick={() => setReconcileTripId(null)} className="bg-slate-900 text-white px-12 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-blue-600 transition-all">Finish Audit</button></div>
           </div>
        </div>
      )}
    </div>
  );
};

export default GlasscoVendorHub;
