import React, { useMemo } from 'react';
import { 
  Printer, X, Plus, Trash2, FileSignature, 
  Search, Info, Calculator, Ruler, Layers, Box, Calendar,
  Edit2, FileCheck, Eye, Component, Anchor, PaintBucket,
  Hammer, Grid, CheckCircle2, Image as ImageIcon, MousePointer2,
  PenTool, UploadCloud, FileImage, Square, Circle, Save
} from 'lucide-react';
import { useQuotations } from './useQuotations';

const QuotationManager: React.FC = () => {
  const {
    company,
    quotations,
    clients,
    isModalOpen,
    setIsModalOpen,
    searchTerm,
    setSearchTerm,
    printingQuote,
    setPrintingQuote,
    modalTab,
    setModalTab,
    selectedItemIndex,
    setSelectedItemIndex,
    fileInputRef,
    formData,
    setFormData,
    initialQuotation,
    getAvailableThicknesses,
    getAvailableTypes,
    serviceNicks,
    updateGlassItem,
    addGlassItem,
    removeGlassItem,
    handleSave,
    handleDelete,
    handleFileUpload
  } = useQuotations();

  const isLocked = formData.status === 'Approved';
  const subTotal = formData.items?.reduce((s, i) => s + i.amount, 0) || 0;

  const filteredQuotations = useMemo(() => {
    let result = [...quotations];
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(q => 
        q.id.toLowerCase().includes(lower) || 
        q.projectName.toLowerCase().includes(lower) ||
        clients.find(c => c.id === q.clientId)?.name.toLowerCase().includes(lower)
      );
    }
    return result;
  }, [quotations, searchTerm, clients]);

  return (
    <div className="space-y-6">
      {printingQuote && (
        <div className="fixed inset-0 bg-white z-50 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto border border-slate-200 p-12 shadow-2xl bg-white relative">
            <button onClick={() => setPrintingQuote(null)} className="absolute top-4 right-4 p-2 bg-rose-100 text-rose-600 rounded-full hover:bg-rose-200 print:hidden"><X size={20}/></button>
            <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-8">
              <div>
                <h1 className="text-4xl font-black text-slate-900 tracking-tight uppercase">{company}</h1>
                <p className="text-slate-500 font-medium mt-1">Commercial Quotation</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-slate-800">{printingQuote.id}</div>
                <div className="text-sm text-slate-500 font-medium mt-1">Date: {printingQuote.date}</div>
                <div className="text-sm text-slate-500 font-medium">Valid Till: {printingQuote.dueDate}</div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-12 mb-10">
              <div>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Bill To</h3>
                <div className="text-lg font-bold text-slate-800">{clients.find(c => c.id === printingQuote.clientId)?.name}</div>
                <div className="text-sm text-slate-600 mt-1">Project: {printingQuote.projectName}</div>
              </div>
            </div>

            <table className="w-full text-left mb-10">
              <thead>
                <tr className="border-b-2 border-slate-800">
                  <th className="py-3 text-sm font-black text-slate-800 uppercase">Description</th>
                  <th className="py-3 text-sm font-black text-slate-800 uppercase text-center">Specs</th>
                  <th className="py-3 text-sm font-black text-slate-800 uppercase text-center">Qty</th>
                  <th className="py-3 text-sm font-black text-slate-800 uppercase text-right">Rate</th>
                  <th className="py-3 text-sm font-black text-slate-800 uppercase text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {printingQuote.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-4">
                      <div className="font-bold text-slate-800">{item.description || 'Glass Panel'}</div>
                      <div className="text-xs text-slate-500 mt-1">{item.width}″ × {item.height}″</div>
                    </td>
                    <td className="py-4 text-center">
                      <div className="text-sm font-medium text-slate-800">{item.glassSize} {item.glassType}</div>
                      <div className="text-xs text-slate-500 mt-1">{(item.selectedServices || []).join(', ')}</div>
                    </td>
                    <td className="py-4 text-center font-bold text-slate-800">{item.qty}</td>
                    <td className="py-4 text-right font-medium text-slate-600">Rs {item.pricePerUnit}</td>
                    <td className="py-4 text-right font-black text-slate-800">Rs {item.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end border-t-2 border-slate-800 pt-6">
              <div className="w-64">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold text-slate-600">Subtotal</span>
                  <span className="text-lg font-black text-slate-800">Rs {printingQuote.items.reduce((s, i) => s + i.amount, 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-xl mt-4 pt-4 border-t border-slate-200">
                  <span className="font-black text-slate-900">Total</span>
                  <span className="font-black text-blue-600">Rs {printingQuote.items.reduce((s, i) => s + i.amount, 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Quotations</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Manage commercial quotes and estimates</p>
        </div>
        <button onClick={() => { setFormData(initialQuotation); setIsModalOpen(true); }} className="sap-btn-primary">
          <Plus size={18} className="mr-2" /> New Quotation
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search quotes..." 
              className="sap-input pl-10 w-full bg-white"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <table className="w-full text-left sap-table">
          <thead>
            <tr>
              <th>Quote ID</th>
              <th>Date</th>
              <th>Client</th>
              <th>Project</th>
              <th className="text-right">Amount</th>
              <th className="text-center">Status</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredQuotations.map(q => (
              <tr key={q.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="font-bold text-blue-600">{q.id}</td>
                <td className="font-medium text-slate-600">{q.date}</td>
                <td className="font-bold text-slate-800">{clients.find(c => c.id === q.clientId)?.name}</td>
                <td className="font-medium text-slate-600">{q.projectName}</td>
                <td className="text-right font-black text-slate-800">
                  Rs {q.items.reduce((s, i) => s + i.amount, 0).toLocaleString()}
                </td>
                <td className="text-center">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    q.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {q.status}
                  </span>
                </td>
                <td>
                  <div className="flex justify-center space-x-2">
                    <button onClick={() => { setFormData(q); setIsModalOpen(true); }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 size={16} /></button>
                    <button onClick={() => { setPrintingQuote(q); setTimeout(() => { window.print(); setPrintingQuote(null); }, 500); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Printer size={16} /></button>
                    <button onClick={() => handleDelete(q.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredQuotations.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                  No quotations found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <FileSignature size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-800 tracking-tight">
                    {formData.id ? `Edit ${formData.id}` : 'New Quotation'}
                  </h2>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{company}</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  formData.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {formData.status || 'Draft'}
                </span>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-200 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center"><Calendar size={14} className="mr-1"/> Date</label>
                  <input disabled={isLocked} type="date" className="sap-input w-full" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center"><Calendar size={14} className="mr-1"/> Valid Till</label>
                  <input disabled={isLocked} type="date" className="sap-input w-full" value={formData.dueDate} onChange={e => setFormData({...formData, dueDate: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center"><Info size={14} className="mr-1"/> Client</label>
                  <select disabled={isLocked} className="sap-input w-full" value={formData.clientId} onChange={e => setFormData({...formData, clientId: e.target.value})}>
                    <option value="">Select Client...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2 md:col-span-3">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center"><Layers size={14} className="mr-1"/> Project / Store Name</label>
                  <input disabled={isLocked} type="text" className="sap-input w-full" placeholder="e.g. Emporium Mall Outlet" value={formData.projectName} onChange={e => setFormData({...formData, projectName: e.target.value})} />
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center"><Box size={16} className="mr-2 text-blue-600"/> Glass Items</h3>
                  {!isLocked && <button onClick={addGlassItem} className="sap-btn-light text-xs py-1.5"><Plus size={14} className="mr-1"/> Add Item</button>}
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left sap-table">
                    <thead>
                      <tr>
                        <th className="w-12 text-center">#</th>
                        <th className="w-48">Description</th>
                        <th className="w-32">Type</th>
                        <th className="w-24">Thick</th>
                        <th className="w-48">Services</th>
                        <th className="w-20 text-center">W (in)</th>
                        <th className="w-20 text-center">H (in)</th>
                        <th className="w-20 text-center">Qty</th>
                        <th className="w-24 text-right">SqFt</th>
                        <th className="w-24 text-right">Rate</th>
                        <th className="w-28 text-right">Amount</th>
                        <th className="w-16 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {formData.items?.map((item, idx) => (
                        <React.Fragment key={idx}>
                          <tr className={`hover:bg-slate-50 transition-colors ${selectedItemIndex === idx ? 'bg-blue-50/50' : ''}`} onClick={() => setSelectedItemIndex(idx)}>
                            <td className="text-center font-bold text-slate-400">{idx + 1}</td>
                            <td><input disabled={isLocked} type="text" className="sap-input w-full py-1 text-sm font-bold" value={item.description} onChange={e => updateGlassItem(idx, 'description', e.target.value)} placeholder="Location/Desc" /></td>
                            <td>
                              <select disabled={isLocked} className="sap-input w-full py-1 text-sm font-bold text-blue-600" value={item.glassType} onChange={e => updateGlassItem(idx, 'glassType', e.target.value)}>
                                {getAvailableTypes().map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </td>
                            <td>
                              <select disabled={isLocked} className="sap-input w-full py-1 text-sm font-bold text-indigo-600" value={item.glassSize} onChange={e => updateGlassItem(idx, 'glassSize', e.target.value)}>
                                {getAvailableThicknesses().map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </td>
                            <td>
                              <div className="flex flex-wrap gap-1">
                                {serviceNicks.map(srv => {
                                  if (item.glassType === 'Mirror' && srv === 'T/G') return null;
                                  const isSelected = (item.selectedServices || []).includes(srv);
                                  return (
                                    <button
                                      key={srv}
                                      disabled={isLocked}
                                      onClick={() => {
                                        const current = item.selectedServices || [];
                                        updateGlassItem(idx, 'selectedServices', isSelected ? current.filter(s => s !== srv) : [...current, srv]);
                                      }}
                                      className={`px-2 py-0.5 text-[10px] font-black uppercase rounded-full transition-colors ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                                    >
                                      {srv}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                            <td>
                              <div className="flex items-center space-x-1">
                                <input disabled={isLocked} type="number" className="sap-input w-12 py-1 text-center font-bold" value={item.inchW || ''} onChange={e => updateGlassItem(idx, 'inchW', Number(e.target.value))} placeholder="in" />
                                <input disabled={isLocked} type="number" className="sap-input w-10 py-1 text-center text-xs text-slate-500" value={item.sootW || ''} onChange={e => updateGlassItem(idx, 'sootW', Number(e.target.value))} placeholder="st" />
                              </div>
                            </td>
                            <td>
                              <div className="flex items-center space-x-1">
                                <input disabled={isLocked} type="number" className="sap-input w-12 py-1 text-center font-bold" value={item.inchH || ''} onChange={e => updateGlassItem(idx, 'inchH', Number(e.target.value))} placeholder="in" />
                                <input disabled={isLocked} type="number" className="sap-input w-10 py-1 text-center text-xs text-slate-500" value={item.sootH || ''} onChange={e => updateGlassItem(idx, 'sootH', Number(e.target.value))} placeholder="st" />
                              </div>
                            </td>
                            <td><input disabled={isLocked} type="number" className="sap-input w-full py-1 text-center font-bold" value={item.qty || ''} onChange={e => updateGlassItem(idx, 'qty', Number(e.target.value))} /></td>
                            <td className="text-right font-bold text-slate-600 bg-slate-50">{item.totalSqFt?.toFixed(2)}</td>
                            <td><input disabled={isLocked} type="number" className="sap-input w-full py-1 text-right font-bold text-emerald-600" value={item.pricePerUnit || ''} onChange={e => updateGlassItem(idx, 'pricePerUnit', Number(e.target.value))} /></td>
                            <td className="text-right font-black text-slate-800 bg-slate-50">{(item.amount || 0).toLocaleString()}</td>
                            <td className="text-center">
                              {!isLocked && <button onClick={() => removeGlassItem(idx)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={14} /></button>}
                            </td>
                          </tr>
                          
                          {/* Expanded Details for Selected Item */}
                          {selectedItemIndex === idx && (
                            <tr className="bg-blue-50/30 border-b-2 border-blue-100">
                              <td colSpan={12} className="p-4">
                                <div className="flex space-x-6">
                                  <div className="w-64 shrink-0">
                                    <div className="flex space-x-2 mb-4">
                                      <button onClick={() => setModalTab('items')} className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-lg transition-colors ${modalTab === 'items' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>Details</button>
                                      <button onClick={() => setModalTab('design')} className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-lg transition-colors ${modalTab === 'design' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>Design</button>
                                      <button onClick={() => setModalTab('upload')} className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-lg transition-colors ${modalTab === 'upload' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>File</button>
                                    </div>
                                    
                                    {modalTab === 'items' && (
                                      <div className="space-y-3">
                                        <div>
                                          <label className="text-[10px] font-black text-slate-400 uppercase">Location Code</label>
                                          <input disabled={isLocked} type="text" className="sap-input w-full py-1 text-sm font-mono" value={item.locationCode || ''} onChange={e => updateGlassItem(idx, 'locationCode', e.target.value)} placeholder="e.g. W1, D2" />
                                        </div>
                                        <div>
                                          <label className="text-[10px] font-black text-slate-400 uppercase">Glazing Specs</label>
                                          <textarea disabled={isLocked} className="sap-input w-full py-1 text-sm h-20 resize-none" value={item.glazingSpecs || ''} onChange={e => updateGlassItem(idx, 'glazingSpecs', e.target.value)} placeholder="Additional notes..." />
                                        </div>
                                      </div>
                                    )}

                                    {modalTab === 'design' && (
                                      <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-2">
                                          <button disabled={isLocked} onClick={() => updateGlassItem(idx, 'shape', 'Rectangle')} className={`py-2 flex flex-col items-center justify-center rounded-lg border ${item.shape === 'Rectangle' || !item.shape ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-200 bg-white text-slate-400'}`}><Square size={24} className="mb-1"/><span className="text-[10px] font-bold uppercase">Rect</span></button>
                                          <button disabled={isLocked} onClick={() => updateGlassItem(idx, 'shape', 'Circle')} className={`py-2 flex flex-col items-center justify-center rounded-lg border ${item.shape === 'Circle' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-200 bg-white text-slate-400'}`}><Circle size={24} className="mb-1"/><span className="text-[10px] font-bold uppercase">Circle</span></button>
                                        </div>
                                        <div>
                                          <label className="text-[10px] font-black text-slate-400 uppercase">Cutouts</label>
                                          <input disabled={isLocked} type="number" className="sap-input w-full py-1 text-sm" value={item.cutouts || ''} onChange={e => updateGlassItem(idx, 'cutouts', Number(e.target.value))} placeholder="0" />
                                        </div>
                                        <div>
                                          <label className="text-[10px] font-black text-slate-400 uppercase">Holes</label>
                                          <input disabled={isLocked} type="number" className="sap-input w-full py-1 text-sm" value={item.holes || ''} onChange={e => updateGlassItem(idx, 'holes', Number(e.target.value))} placeholder="0" />
                                        </div>
                                      </div>
                                    )}

                                    {modalTab === 'upload' && (
                                      <div className="space-y-4">
                                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*,.pdf" onChange={handleFileUpload} disabled={isLocked} />
                                        <button disabled={isLocked} onClick={() => fileInputRef.current?.click()} className="w-full py-8 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50 transition-all">
                                          <UploadCloud size={32} className="mb-2" />
                                          <span className="text-xs font-bold uppercase">Upload Drawing</span>
                                        </button>
                                        {item.designFile && (
                                          <div className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-lg">
                                            <div className="flex items-center space-x-2 text-sm font-medium text-slate-700">
                                              <FileImage size={16} className="text-blue-500" />
                                              <span className="truncate w-32">Attached File</span>
                                            </div>
                                            {!isLocked && <button onClick={() => updateGlassItem(idx, 'designFile', undefined)} className="text-rose-500 hover:bg-rose-50 p-1 rounded"><X size={14}/></button>}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex-1 bg-white border border-slate-200 rounded-xl p-6 flex items-center justify-center relative overflow-hidden">
                                    <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                                    
                                    {item.designFile ? (
                                      <img src={item.designFile} alt="Design" className="max-w-full max-h-64 object-contain relative z-10 rounded shadow-sm" />
                                    ) : (
                                      <div className="relative z-10 flex flex-col items-center">
                                        <div 
                                          className={`border-4 border-blue-500/30 bg-blue-50/50 flex items-center justify-center relative transition-all duration-500`}
                                          style={{
                                            width: item.shape === 'Circle' ? '160px' : '200px',
                                            height: item.shape === 'Circle' ? '160px' : '120px',
                                            borderRadius: item.shape === 'Circle' ? '50%' : '8px'
                                          }}
                                        >
                                          <span className="text-blue-400/50 font-black text-2xl uppercase tracking-widest">{item.glassType}</span>
                                          
                                          {/* Dimension Labels */}
                                          {item.shape !== 'Circle' && (
                                            <>
                                              <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-black text-slate-500 bg-white px-2 rounded-full shadow-sm border border-slate-100">{item.width}″</div>
                                              <div className="absolute -left-8 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-500 bg-white px-2 rounded-full shadow-sm border border-slate-100 -rotate-90">{item.height}″</div>
                                            </>
                                          )}
                                          {item.shape === 'Circle' && (
                                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-black text-slate-500 bg-white px-2 py-1 rounded-full shadow-sm border border-slate-100 flex items-center gap-1">
                                              <Circle size={10}/> ⌀ {item.width}″
                                            </div>
                                          )}
                                        </div>
                                        <div className="mt-6 flex gap-2">
                                          {(item.selectedServices || []).map(s => (
                                            <span key={s} className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-black uppercase rounded-md border border-slate-200">{s}</span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
              <div className="text-2xl font-black text-slate-800 tracking-tight">
                <span className="text-sm text-slate-500 font-bold uppercase mr-2">Total</span>
                Rs {subTotal.toLocaleString()}
              </div>
              <div className="flex space-x-3">
                {!isLocked && <button onClick={() => handleSave(false)} className="sap-btn-light"><Save size={16} className="mr-2"/> Save Draft</button>}
                {!isLocked && <button onClick={() => handleSave(true)} className="sap-btn-primary bg-emerald-600 hover:bg-emerald-700"><FileCheck size={16} className="mr-2"/> Approve Quotation</button>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuotationManager;
