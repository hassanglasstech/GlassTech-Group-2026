import React, { useMemo, useState, useEffect } from 'react';
import {
  Printer, X, Plus, Trash2, FileSignature,
  Search, Info, Calculator, Ruler, Layers, Box, Calendar,
  Edit2, FileCheck, Eye, Component, Anchor, PaintBucket,
  Hammer, Grid, CheckCircle2, Image as ImageIcon, MousePointer2,
  PenTool, UploadCloud, FileImage, Square, Circle, Save, RefreshCw
} from 'lucide-react';
import { useQuotations } from './useQuotations';
import { AsyncSalesService } from '../services/asyncSalesService';
import { toast } from 'sonner';
import { CompactPageHeader } from '@/modules/shared/components/CompactPageHeader';
import { DataGridCard, GridColumn } from '@/modules/shared/components/DataGridCard';

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

  // SAL-3: Credit limit guard — wraps handleSave with an AR check.
  // Queries the live outstanding AR balance for the selected client.
  // Blocks save if: outstanding_ar + new_order_net_value > client.credit_limit.
  // Fails open (allows save) when offline or credit limit is 0/unset.
  const handleSaveWithCreditCheck = async (approve: boolean) => {
    const client = clients.find(c => c.id === formData.clientId);
    const creditLimit = Number((client as any)?.creditLimit ?? (client as any)?.credit_limit ?? 0);

    if (client && creditLimit > 0) {
      try {
        const outstandingAR = await AsyncSalesService.getClientOutstandingAR(
          formData.clientId as string,
          company
        );
        const discountAmt  = Number((formData as any).discountAmount ?? 0);
        const newOrderValue = Math.max(0, subTotal - discountAmt);

        if (outstandingAR + newOrderValue > creditLimit) {
          toast.error(
            `SAL-3 Credit Limit Breach: ${client.name}'s outstanding AR ` +
            `(PKR ${outstandingAR.toLocaleString()}) + this order ` +
            `(PKR ${newOrderValue.toLocaleString()}) = ` +
            `PKR ${(outstandingAR + newOrderValue).toLocaleString()} ` +
            `exceeds credit limit PKR ${creditLimit.toLocaleString()}. ` +
            `Obtain credit manager approval before saving.`,
            { duration: 10000 }
          );
          return; // Block save
        }
      } catch (err) {
        // Network error during check — fail open (offline mode)
        console.warn('[QuotationManager] SAL-3 credit check failed — allowing save (offline):', err);
      }
    }
    handleSave(approve);
  };

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

  // ═══════════════════════════════════════════════════════════════════
  // FORM VIEW — renders as native page (not popup)
  // ═══════════════════════════════════════════════════════════════════
  if (isModalOpen) {
    return (
      <div className="space-y-6">
        {/* Header Bar */}
        <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-3">
            <button onClick={() => { setIsModalOpen(false); }} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} className="text-slate-500"/></button>
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center"><FileSignature size={20} /></div>
            <div>
              <h2 className="text-lg font-black text-slate-800 tracking-tight">{formData.id ? `Edit ${formData.id}` : 'New Quotation'}</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{company}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${formData.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{formData.status || 'Draft'}</span>
            <div className="text-xl font-black text-slate-800">Rs {(Number(subTotal) || 0).toLocaleString()}</div>
          </div>
        </div>

        {/* Form Fields */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase flex items-center"><Calendar size={14} className="mr-1"/> Date</label>
            <input disabled={isLocked} type="date" className="sap-input w-full" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase flex items-center"><Calendar size={14} className="mr-1"/> Valid Till</label>
            <input disabled={isLocked} type="date" className="sap-input w-full" value={formData.dueDate} onChange={e => setFormData({...formData, dueDate: e.target.value})} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase flex items-center"><Info size={14} className="mr-1"/> Client</label>
            <select disabled={isLocked} className="sap-input w-full" value={formData.clientId} onChange={e => setFormData({...formData, clientId: e.target.value})}>
              <option value="">Select Client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-2 md:col-span-3">
            <label className="text-xs font-black text-slate-400 uppercase flex items-center"><Layers size={14} className="mr-1"/> Project / Store Name</label>
            <input disabled={isLocked} type="text" className="sap-input w-full" placeholder="e.g. Emporium Mall Outlet" value={formData.projectName} onChange={e => setFormData({...formData, projectName: e.target.value})} />
          </div>

        </div>

        {/* Items Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <h3 className="text-sm font-black text-slate-800 uppercase flex items-center"><Box size={16} className="mr-2 text-blue-600"/> Glass Items</h3>
            {!isLocked && <button onClick={addGlassItem} className="sap-btn-light text-xs py-1.5"><Plus size={14} className="mr-1"/> Add Item</button>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left sap-table">
              <thead><tr>
                <th className="px-4 py-3 text-[10px] w-8">#</th><th className="px-4 py-3 text-[10px]">Glass</th>
                <th className="px-4 py-3 text-[10px]">Size</th><th className="px-4 py-3 text-[10px]">Qty</th>
                <th className="px-4 py-3 text-[10px]">SqFt</th><th className="px-4 py-3 text-[10px]">Rate</th>
                <th className="px-4 py-3 text-[10px]">Amount</th><th className="px-4 py-3 text-[10px] w-20">Services</th>
                <th className="px-4 py-3 text-[10px] w-12"></th>
              </tr></thead>
              <tbody>
                {(formData.items || []).map((item, idx) => (
                  <React.Fragment key={idx}>
                    <tr className={`border-t cursor-pointer hover:bg-blue-50/30 ${selectedItemIndex === idx ? 'bg-blue-50' : ''}`} onClick={() => setSelectedItemIndex(selectedItemIndex === idx ? null : idx)}>
                      <td className="px-4 py-3 font-bold text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-3"><div className="font-black text-slate-800 text-xs">{item.glassType || '—'} {item.glassThickness || ''}</div><div className="text-[10px] text-slate-500 mt-0.5">{(item.selectedServices || []).join(', ')}</div></td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-600">{item.width || 0}&#34; x {item.height || 0}&#34;</td>
                      <td className="px-4 py-3 text-xs font-black">{item.qty || 0}</td>
                      <td className="px-4 py-3 text-xs font-bold text-blue-600">{(item.totalSqFt || item.sqft || 0).toFixed(1)}</td>
                      <td className="px-4 py-3 text-xs font-bold">Rs {(item.rate || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs font-black text-emerald-700">Rs {(item.amount || 0).toLocaleString()}</td>
                      <td className="px-4 py-3">{(item.selectedServices || []).map(s => <span key={s} className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[8px] font-black uppercase rounded mr-0.5 mb-0.5">{s}</span>)}</td>
                      <td className="px-4 py-3">{!isLocked && <button onClick={e => { e.stopPropagation(); removeGlassItem(idx); }} className="text-rose-400 hover:text-rose-600"><Trash2 size={14}/></button>}</td>
                    </tr>
                    {selectedItemIndex === idx && (
                      <tr><td colSpan={9} className="p-0 border-t bg-slate-50">
                        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">Glass Type</label><select disabled={isLocked} className="sap-input w-full text-sm" value={item.glassType} onChange={e => updateGlassItem(idx, 'glassType', e.target.value)}><option value="">Select...</option>{getAvailableTypes().map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">Thickness</label><select disabled={isLocked} className="sap-input w-full text-sm" value={item.glassThickness || ''} onChange={e => updateGlassItem(idx, 'glassThickness', e.target.value)}><option value="">Select...</option>{getAvailableThicknesses().map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">Shape</label><select disabled={isLocked} className="sap-input w-full text-sm" value={item.shape || 'Rectangle'} onChange={e => updateGlassItem(idx, 'shape', e.target.value)}><option value="Rectangle">Rectangle</option><option value="Circle">Circle</option></select></div>
                              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">Qty</label><input disabled={isLocked} type="number" min="1" className="sap-input w-full text-sm" value={item.qty || ''} onChange={e => updateGlassItem(idx, 'qty', Number(e.target.value))} /></div>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">W (inch)</label><input disabled={isLocked} type="number" min="0" className="sap-input w-full text-sm" value={item.inchW || ''} onChange={e => updateGlassItem(idx, 'inchW', Number(e.target.value))} /></div>
                              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">W (soot)</label><input disabled={isLocked} type="number" min="0" max="9" className="sap-input w-full text-sm" value={item.sootW || ''} onChange={e => updateGlassItem(idx, 'sootW', Number(e.target.value))} /></div>
                              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">H (inch)</label><input disabled={isLocked} type="number" min="0" className="sap-input w-full text-sm" value={item.inchH || ''} onChange={e => updateGlassItem(idx, 'inchH', Number(e.target.value))} /></div>
                              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">H (soot)</label><input disabled={isLocked} type="number" min="0" max="9" className="sap-input w-full text-sm" value={item.sootH || ''} onChange={e => updateGlassItem(idx, 'sootH', Number(e.target.value))} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">Width (mm)</label><input disabled={isLocked} type="number" min="0" className="sap-input w-full text-sm" value={item.mmW || ''} onChange={e => updateGlassItem(idx, 'mmW', Number(e.target.value))} /></div>
                              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">Height (mm)</label><input disabled={isLocked} type="number" min="0" className="sap-input w-full text-sm" value={item.mmH || ''} onChange={e => updateGlassItem(idx, 'mmH', Number(e.target.value))} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">Rate (per sqft)</label><input disabled={isLocked} type="number" min="0" className="sap-input w-full text-sm" value={item.rate || ''} onChange={e => updateGlassItem(idx, 'rate', Number(e.target.value))} /></div>
                              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">Amount</label><div className="sap-input w-full text-sm font-black text-emerald-700 bg-emerald-50 flex items-center">Rs {(item.amount || 0).toLocaleString()}</div></div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase">Services</label>
                              <div className="flex flex-wrap gap-1.5">{serviceNicks.map(srv => {
                                const isSel = (item.selectedServices || []).includes(srv);
                                return <button key={srv} disabled={isLocked} onClick={() => { const cur = item.selectedServices || []; updateGlassItem(idx, 'selectedServices', isSel ? cur.filter(s => s !== srv) : [...cur, srv]); }} className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase border ${isSel ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'}`}>{srv}</button>;
                              })}</div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase">Design Image</label>
                              {!isLocked && <button onClick={() => { setSelectedItemIndex(idx); fileInputRef.current?.click(); }} className="flex items-center gap-1 text-[9px] font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200"><UploadCloud size={12}/> Upload</button>}
                              {item.designFile && <div className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-xl border mt-1"><div className="flex items-center space-x-2 text-sm font-medium text-slate-700"><FileImage size={16} className="text-blue-500" /><span className="truncate w-32">Attached</span></div>{!isLocked && <button onClick={() => updateGlassItem(idx, 'designFile', undefined)} className="text-rose-500 p-1 rounded"><X size={14}/></button>}</div>}
                            </div>
                          </div>
                          <div className="flex-1 bg-white border border-slate-200 rounded-xl p-6 flex items-center justify-center relative overflow-hidden">
                            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                            {item.designFile ? <img src={item.designFile} alt="Design" className="max-w-full max-h-64 object-contain relative z-10 rounded shadow-sm" /> : (
                              <div className="relative z-10 flex flex-col items-center">
                                <div className="border-4 border-blue-500/30 bg-blue-50/50 flex items-center justify-center relative" style={{ width: item.shape === 'Circle' ? '160px' : '200px', height: item.shape === 'Circle' ? '160px' : '120px', borderRadius: item.shape === 'Circle' ? '50%' : '8px' }}>
                                  <span className="text-blue-400/50 font-black text-2xl uppercase">{item.glassType}</span>
                                  {item.shape !== 'Circle' && <><div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-black text-slate-500 bg-white px-2 rounded-full shadow-sm border">{item.width}&#34;</div><div className="absolute -left-8 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-500 bg-white px-2 rounded-full shadow-sm border -rotate-90">{item.height}&#34;</div></>}
                                  {item.shape === 'Circle' && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-black text-slate-500 bg-white px-2 py-1 rounded-full shadow-sm border flex items-center gap-1"><Circle size={10}/> D {item.width}&#34;</div>}
                                </div>
                                <div className="mt-6 flex gap-2">{(item.selectedServices || []).map(s => <span key={s} className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-black uppercase rounded-md border">{s}</span>)}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>



        {/* Sticky Action Bar */}
        <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm sticky bottom-0 z-10">
          <div className="text-2xl font-black text-slate-800"><span className="text-sm text-slate-500 font-bold uppercase mr-2">Total</span>Rs {(Number(subTotal) || 0).toLocaleString()}</div>
          <div className="flex space-x-3">
            <button onClick={() => { setIsModalOpen(false); }} className="sap-btn-light">Close</button>
            {!isLocked && <button onClick={() => handleSaveWithCreditCheck(false)} className="sap-btn-light"><Save size={16} className="mr-2"/> Save Draft</button>}
            {!isLocked && <button onClick={() => handleSaveWithCreditCheck(true)} className="sap-btn-primary bg-emerald-600 hover:bg-emerald-700"><FileCheck size={16} className="mr-2"/> Approve</button>}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // LIST VIEW
  // ═══════════════════════════════════════════════════════════════════
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
                    <td className="py-4 text-right font-black text-slate-800">Rs {(Number(item.amount) || 0).toLocaleString()}</td>
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

      <div className="flex-1 flex flex-col min-h-0">
        <CompactPageHeader
          title="Quotation Manager"
          subtitle={company}
          breadcrumbs={[{ label: 'Sales' }, { label: 'Quotations' }]}
          actions={[
            { label: 'New Quotation', icon: <Plus size={12} />, onClick: () => { setFormData(initialQuotation); setIsModalOpen(true); }, variant: 'primary', shortcut: 'Alt+N' },
            { label: 'Refresh', icon: <RefreshCw size={12} />, onClick: () => window.dispatchEvent(new CustomEvent('erp:refresh')), variant: 'ghost', shortcut: 'Alt+R' },
          ]}
          meta={<span className="text-[10px] font-black text-slate-400 uppercase">{filteredQuotations.length} Quotes</span>}
        />

        <div className="flex-1 flex flex-col min-h-0 p-4">
          <DataGridCard
            columns={[
              { key: 'id', header: 'Quote ID' },
              { key: 'date', header: 'Date' },
              { key: 'client', header: 'Client' },
              { key: 'project', header: 'Project' },
              { key: 'amount', header: 'Amount', align: 'right' },
              { key: 'status', header: 'Status', align: 'center' },
              { key: 'actions', header: 'Actions', align: 'center' },
            ]}
            className="flex-1"
            toolbar={
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                <input type="text" placeholder="Search quotes..." className="w-full pl-8 pr-3 py-1.5 text-xs font-bold border border-slate-200 rounded bg-white focus:outline-none focus:border-blue-300" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
            }
            emptyState={<span className="text-xs text-slate-300 font-bold">No quotations found</span>}
          >
            {filteredQuotations.map((q, ri) => (
              <tr key={q.id} className={[
                'border-b border-slate-100 last:border-0',
                ri % 2 === 1 ? 'bg-slate-50/50' : 'bg-white',
                'hover:bg-slate-50/70 transition-colors',
              ].join(' ')}>
                <td className="py-1.5 px-3 font-bold text-blue-600 text-xs">{q.id}</td>
                <td className="py-1.5 px-3 text-xs text-slate-600">{q.date}</td>
                <td className="py-1.5 px-3 text-xs font-bold text-slate-800">{clients.find(c => c.id === q.clientId)?.name}</td>
                <td className="py-1.5 px-3 text-xs text-slate-600">{q.projectName}</td>
                <td className="py-1.5 px-3 text-right text-xs font-black text-slate-800">
                  Rs {q.items.reduce((s, i) => s + i.amount, 0).toLocaleString()}
                </td>
                <td className="py-1.5 px-3 text-center">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                    q.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>{q.status}</span>
                </td>
                <td className="py-1.5 px-3">
                  <div className="flex justify-center space-x-1">
                    <button onClick={() => { setFormData(q); setIsModalOpen(true); }} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit2 size={14} /></button>
                    <button onClick={() => { setPrintingQuote(q); setTimeout(() => { window.print(); setPrintingQuote(null); }, 500); }} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"><Printer size={14} /></button>
                    <button onClick={() => handleDelete(q.id)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </DataGridCard>
        </div>
      </div>
    </div>
  );
};

export default QuotationManager;
