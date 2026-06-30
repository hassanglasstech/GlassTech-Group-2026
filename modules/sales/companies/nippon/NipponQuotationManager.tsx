import React, { useMemo } from 'react';
import { Product, Quotation, QuotationItem } from '@/modules/shared/types';
import { NipponPrintTemplate } from '@/modules/nippon/prints/NipponPrintTemplate';
import { SharedQuotationList } from '@/modules/sales/components/SharedQuotationList';
import { getBrandNick } from '@/modules/shared/utils/brandUtils';
import {
  Printer, X, Plus, Trash2, FileSignature,
  Search, Calendar, Edit2, FileCheck, Eye, Save, ArrowLeft, Layers, Copy
} from 'lucide-react';
import { useNipponQuotations } from './useNipponQuotations';

const NipponQuotationManager: React.FC = () => {
  const [nipponPrintType, setNipponPrintType] = React.useState<'KinLong' | 'Glasstech' | 'General'>('Glasstech');
  const {
    quotations,
    clients,
    products,
    storeItems,
    view,
    setView,
    searchTerm,
    setSearchTerm,
    printingQuote,
    setPrintingQuote,
    activeDropdown,
    setActiveDropdown,
    dropdownRef,
    formData,
    setFormData,
    subTotal,
    lastSerial,
    handleAddSection,
    handleAddItem,
    pendingSetSuggestion,
    setPendingSetSuggestion,
    addFullSet,
    updateItem,
    handleRemoveItem,
    handleDuplicateItem,
    handleSave,
    handleDelete,
    selectProduct,
    initialQuotation,
    isSaving,
  } = useNipponQuotations();

  const isLocked = formData.status === 'Approved';

  const filteredQuotations = useMemo(() => {
    let result = [...quotations];
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(q =>
        q.id.toLowerCase().includes(lower) ||
        (q.projectName || '').toLowerCase().includes(lower) ||
        clients.find(c => c.id === q.clientId)?.name.toLowerCase().includes(lower)
      );
    }
    return result;
  }, [quotations, searchTerm, clients]);

  const getProductSpecs = (p: Product) => {
    const specs = [
      p.thickness,
      p.sheetSize,
      p.finishColor,
      p.material,
      p.glassType,
      p.subCategory,
      p.modelNo,
      p.direction,
      p.tongueLength,
      p.spindleLength,
      p.profileRole,
      p.systemSubClass,
      ...(p.technicalSpecs ? Object.values(p.technicalSpecs) : [])
    ].filter(Boolean).join(' | ');
    return specs;
  };

  const handleAddSetComponents = () => {
    if (!pendingSetSuggestion) return;
    const idx = pendingSetSuggestion.index;
    const comps = pendingSetSuggestion.remainingComponents;
    const newLines = comps.map((c, ci) => {
      const matchProd = products.find((p) =>
        p.id === c.id || p.description.toUpperCase() === c.description.toUpperCase()
      );
      const qtyPerSet = c.qtyPerSet || 1;
      return {
        id: `SET-ADD-${Date.now()}-${ci}`,
        description: matchProd ? matchProd.description : c.description,
        locationCode: matchProd?.profileCode || '',
        glazingSpecs: matchProd?.brand || '',
        glassSize: c.unit || 'PCS',
        qty: qtyPerSet,
        width: 0, height: 0, totalSqFt: 0,
        pricePerUnit: matchProd?.basePrice || 0,
        amount: qtyPerSet * (matchProd?.basePrice || 0),
        isSetMember: true,
        setId: pendingSetSuggestion.setProduct.id,
      } as QuotationItem;
    });
    setFormData((prev: Partial<Quotation>) => {
      const next = [...(prev.items || [])];
      next.splice(idx + 1, 0, ...newLines);
      return { ...prev, items: next };
    });
    setPendingSetSuggestion(null);
  };

  return (
    <div className="space-y-6">
      {printingQuote && <NipponPrintTemplate printingQuote={printingQuote} clients={clients} printType={nipponPrintType} products={products} />}

      <div className="no-print bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="bg-blue-600 p-2 rounded-lg text-white">
            <Printer size={20} />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Print Settings</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Select header format for Nippon Hardware</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {(['KinLong', 'Glasstech', 'General'] as const).map(type => (
            <button
              key={type}
              onClick={() => setNipponPrintType(type)}
              className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${
                nipponPrintType === type 
                  ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200' 
                  : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'
              }`}
            >
              {type === 'KinLong' ? 'Kin Long' : type === 'Glasstech' ? 'Glasstech' : 'General'}
            </button>
          ))}
        </div>
      </div>

      {view === 'list' ? (
        <SharedQuotationList 
          companyName="Nippon"
          quotations={filteredQuotations} 
          clients={clients} 
          searchTerm={searchTerm} 
          setSearchTerm={setSearchTerm} 
          onNew={() => { setFormData(initialQuotation); setView('edit'); }} 
          onEdit={(q) => { setFormData(q); setView('edit'); }} 
          onPrint={(q) => {
            setPrintingQuote(q);
            setTimeout(() => {
              // Blank the document title during print so the browser's print header
              // doesn't show "Glasstech ERP 2026" above the document. Restored after.
              const prevTitle = document.title;
              document.title = ' ';
              window.print();
              document.title = prevTitle;
              setPrintingQuote(null);
            }, 500);
          }}
          onApprove={(q) => handleSave(true, q)}
          onDelete={handleDelete}
        />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-1 min-h-[600px]">
            {/* Editor Header — compact so the items table gets more vertical room */}
            <div className="bg-slate-900 text-white px-4 py-2 flex justify-between items-center shrink-0">
                <div className="flex items-center space-x-3">
                  <button onClick={() => setView('list')} className="p-1.5 hover:bg-slate-800 rounded-full transition-colors">
                    <ArrowLeft size={16} />
                  </button>
                  <h2 className="text-sm font-bold flex items-center gap-1.5">
                    <span className="text-blue-400">NIPPON</span>
                    <span className="text-slate-300 font-medium">·</span>
                    <span>Quotation Editor</span>
                  </h2>
                </div>
                <div className="flex items-center space-x-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase ${formData.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {formData.status || 'Draft'}
                  </span>
                </div>
            </div>
            
            <div className="flex-1 overflow-hidden p-3 bg-slate-50/50 flex flex-col space-y-2">
              {/* Header Fields — tighter padding so items table gets more room */}
              <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Client</label>
                  <select disabled={isLocked} className="sap-input w-full font-bold" value={formData.clientId} onChange={e => setFormData({...formData, clientId: e.target.value})}>
                    <option value="">Select Client...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400">Project / Store</label><input disabled={isLocked} type="text" className="sap-input w-full font-bold" value={formData.projectName} onChange={e => setFormData({...formData, projectName: e.target.value})} /></div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 flex justify-between">
                    <span>Serial No</span>
                    <span className="text-blue-500 lowercase font-medium">Last: {lastSerial}</span>
                  </label>
                  <input 
                    disabled={isLocked} 
                    type="text" 
                    placeholder="e.g. 0001"
                    className={`sap-input w-full font-black ${quotations.some(q => q.company === 'Nippon' && q.manualSerial === formData.manualSerial && q.id !== formData.id) ? 'border-red-500 text-red-600' : 'text-blue-600'}`} 
                    value={formData.manualSerial || ''} 
                    onChange={e => setFormData({...formData, manualSerial: e.target.value})} 
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400">Date</label><input disabled={isLocked} type="date" className="sap-input w-full font-bold" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} /></div>
                  <div className="space-y-1"><label className="text-[10px] font-black uppercase text-rose-500">Valid Till</label><input disabled={isLocked} type="date" className="sap-input w-full font-bold text-rose-600" value={formData.dueDate} onChange={e => setFormData({...formData, dueDate: e.target.value})} /></div>
                </div>
              </div>

              {/* Items Grid */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left sap-table relative">
                    <thead className="sticky top-0 bg-white z-10 shadow-sm">
                    <tr>
                      <th className="w-10 text-center">#</th>
                      <th className="w-32">Item Code</th>
                      <th className="w-[300px]">Item Name</th>
                      <th className="w-32">Brand</th>
                      <th className="w-20 text-center">Unit</th>
                      <th className="w-20 text-center">Qty</th>
                      <th className="w-28 text-right">Rate</th>
                      <th className="w-28 text-right">Total</th>
                      <th className="w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-xs font-medium">
                    {formData.items?.map((item, idx) => (
                      <tr key={idx} className={
                        item.isSetHeader
                          ? "bg-amber-50 border-l-4 border-amber-400"
                          : (item as any).isSetMember
                          ? "bg-amber-50/30 pl-4"
                          : item.isSection
                          ? "bg-slate-100/80"
                          : "hover:bg-slate-50"
                      }>
                        <td className="text-center text-slate-300 font-bold">
                          {item.isSetHeader
                            ? <span className="text-[9px] text-amber-400 font-black uppercase">SET</span>
                            : (item.isSection && !item.isSetHeader)
                            ? ''
                            : (() => {
                                // Count only non-section, non-setHeader items before this index
                                const serialNo = formData.items!.slice(0, idx).filter(
                                  (i: QuotationItem) => !i.isSection && !i.isSetHeader
                                ).length + 1;
                                return serialNo;
                              })()
                          }
                        </td>
                        {item.isSection ? (
                          <td colSpan={7} className="py-2">
                            {item.isSetHeader ? (
                              <div className="flex items-center space-x-2">
                                <span className="bg-amber-500 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest">SET</span>
                                <span className="font-black uppercase tracking-widest text-amber-800 text-xs">{item.description}</span>
                                {!isLocked && (
                                  <button onClick={() => { const next = [...(formData.items||[])]; next.splice(idx,1); }} className="ml-auto text-[10px] text-rose-400 hover:text-rose-600 font-bold">Remove Set Header</button>
                                )}
                              </div>
                            ) : (
                              <input 
                                readOnly={isLocked} 
                                type="text" 
                                placeholder="Section Heading..." 
                                className="w-full bg-transparent border-none outline-none font-black uppercase tracking-widest text-slate-700 italic placeholder:text-slate-300" 
                                value={item.description} 
                                onChange={e => updateItem(idx, 'description', e.target.value)} 
                              />
                            )}
                          </td>
                        ) : (
                          <>
                            <td className="w-32">
                                <input readOnly={isLocked} type="text" placeholder="Code" className="sap-input w-full py-1 text-xs font-mono font-bold text-blue-600 uppercase" value={item.locationCode || ''} onChange={e => updateItem(idx, 'locationCode', e.target.value)} />
                            </td>
                            <td className="relative w-[300px]">
                               <textarea 
                                 readOnly={isLocked} 
                                 placeholder="Search Product..." 
                                 className="sap-input w-full py-1 text-xs font-bold uppercase resize-none" 
                                 rows={2}
                                 value={item.description} 
                                 onChange={e => {
                                   updateItem(idx, 'description', e.target.value);
                                   setActiveDropdown(idx);
                                 }}
                                 onFocus={() => setActiveDropdown(idx)}
                               />
                               {activeDropdown === idx && !isLocked && (() => {
                                 // Stock-driven dropdown — show actual store_items, enrich
                                 // each row with matching product metadata (specs, brand,
                                 // image) when one exists. Items that have a stock row
                                 // but no master-catalog product still appear.
                                 const q = (item.description || '').toLowerCase();
                                 // Source from the PRODUCT master (every product searchable by
                                 // name / ERP code / KinLong code / nick — even with no stock row).
                                 // Stock qty is joined from store_items just for display.
                                 const storeById = new Map(storeItems.map(s => [s.id, s]));
                                 const matches = products.filter(p => {
                                   const haystack = [
                                     p.description, p.name, p.modelNo, p.itemCode, p.profileCode, p.brand,
                                     (p as { nickName?: string }).nickName,
                                   ].filter(Boolean).join(' ').toLowerCase();
                                   return !q || haystack.includes(q);
                                 }).slice(0, 60);
                                 return (
                                   <div ref={dropdownRef} className="absolute z-50 w-[360px] mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-[420px] overflow-y-auto">
                                     {matches.map(p => {
                                       const s = storeById.get(p.id);
                                       const available = s?.unrestrictedQty ?? 0;
                                       const total = s?.quantity ?? 0;
                                       const displayName = p.description || p.name || p.id;
                                       const code = p.modelNo || p.itemCode || p.profileCode || p.id;
                                       const unit = p.unit || s?.unit || 'PCS';
                                       const price = p.price || p.basePrice || s?.movingAveragePrice || 0;
                                       const brand = p.brand || '';
                                       return (
                                         <div
                                           key={p.id}
                                           className="px-3 py-1.5 hover:bg-blue-50 cursor-pointer border-b border-slate-50 last:border-0"
                                           onClick={() => {
                                             selectProduct(idx, p);
                                             setActiveDropdown(null);
                                           }}
                                         >
                                           <div className="flex items-center justify-between gap-2">
                                             <div className="font-bold text-slate-800 uppercase text-xs leading-tight truncate">{displayName}</div>
                                             {brand && (
                                               <span className="shrink-0 text-[8px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                                                 {getBrandNick(brand)}
                                               </span>
                                             )}
                                           </div>
                                           <div className="text-[9px] text-slate-400 font-medium mt-0.5 truncate">{getProductSpecs(p)}</div>
                                           <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                                             <div className="flex items-center gap-2">
                                               <span className="font-mono font-bold text-blue-600">{code}</span>
                                               <span className={`text-[9px] font-black ${available > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                 {available}/{total} {unit}
                                               </span>
                                             </div>
                                             <span className="font-black text-slate-700">Rs {price.toLocaleString()}/{unit}</span>
                                           </div>
                                         </div>
                                       );
                                     })}
                                     {matches.length === 0 && (
                                       <div className="px-3 py-4 text-center text-slate-400 text-xs">
                                         {products.length === 0 ? 'No products loaded — check sync' : 'No matching products'}
                                       </div>
                                     )}
                                   </div>
                                 );
                               })()}
                            </td>
                            <td className="w-32">
                                <input readOnly={isLocked} type="text" placeholder="Brand" className="sap-input w-full py-1 text-xs font-bold uppercase" value={item.glazingSpecs || ''} onChange={e => updateItem(idx, 'glazingSpecs', e.target.value)} />
                            </td>
                            <td className="w-20">
                                <input readOnly={isLocked} type="text" placeholder="Unit" className="sap-input w-full py-1 text-center text-xs font-bold uppercase" value={item.glassSize || ''} onChange={e => updateItem(idx, 'glassSize', e.target.value)} />
                            </td>
                            <td className="w-20">
                                <input readOnly={isLocked} type="number" className="sap-input w-full py-1 text-center text-xs font-bold" value={item.qty || ''} onChange={e => updateItem(idx, 'qty', Number(e.target.value))} />
                            </td>
                            <td className="w-28">
                                <input readOnly={isLocked} type="number" className="sap-input w-full py-1 text-right text-xs font-bold text-blue-600" value={item.pricePerUnit || ''} onChange={e => updateItem(idx, 'pricePerUnit', Number(e.target.value))} />
                            </td>
                            <td className="w-28 text-right font-black text-slate-800 pr-4">
                                {(item.amount || 0).toLocaleString()}
                            </td>
                          </>
                        )}
                        <td className="w-12 text-center">
                            {!isLocked && (
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => {
                                  const title = prompt("Enter Section Heading:");
                                  if (title !== null) handleAddSection(title, idx);
                                }} className="text-slate-400 hover:text-emerald-600" title="Add Section Below"><Layers size={14}/></button>
                                <button onClick={() => handleDuplicateItem(idx)} className="text-slate-400 hover:text-blue-600" title="Duplicate Row"><Copy size={14}/></button>
                                <button onClick={() => handleRemoveItem(idx)} className="text-slate-400 hover:text-red-500" title="Remove Row"><Trash2 size={14}/></button>
                              </div>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                
                {/* Footer Controls — compact so more rows / dropdown space fit above */}
                <div className="bg-slate-50 px-4 py-2 border-t border-slate-200 flex flex-col space-y-2 shrink-0">
                  {/* Totals Row */}
                  <div className="flex justify-end items-center space-x-8">
                    <div className="flex items-center space-x-2">
                        <label className="text-[10px] font-black uppercase text-slate-400">Discount %</label>
                        <input disabled={isLocked} type="number" className="sap-input w-20 text-right font-bold text-rose-600 py-1" value={formData.discountPercent || ''} onChange={e => {
                            const pct = Number(e.target.value);
                            setFormData({...formData, discountPercent: pct, discountAmount: subTotal * (pct/100)});
                        }} />
                    </div>
                    <div className="flex items-center space-x-2">
                        <label className="text-[10px] font-black uppercase text-slate-400">Discount Rs</label>
                        <input disabled={isLocked} type="number" className="sap-input w-24 text-right font-bold text-rose-600 py-1" value={formData.discountAmount || ''} onChange={e => {
                            const amt = Number(e.target.value);
                            setFormData({...formData, discountAmount: amt, discountPercent: subTotal > 0 ? Number(((amt/subTotal)*100).toFixed(2)) : 0});
                        }} />
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-black uppercase text-slate-400">Net Total</div>
                      <div className="text-xl font-black text-slate-800 leading-none mt-1">Rs {(subTotal - (formData.discountAmount || 0)).toLocaleString()}</div>
                    </div>
                  </div>

                  {/* Buttons Row */}
                  <div className="flex justify-between items-center">
                    <div className="flex space-x-2">
                      <button
                        disabled={isLocked}
                        onClick={() => handleAddItem()}
                        className={`text-[10px] py-1.5 px-4 flex items-center space-x-2 shadow-md font-black uppercase tracking-widest transition-all rounded-lg ${isLocked ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-100'}`}
                      >
                        <Plus size={14}/> <span>Add New Line</span>
                      </button>
                      <button 
                        disabled={isLocked} 
                        onClick={() => {
                          const title = prompt("Enter Section Heading:");
                          if (title !== null) handleAddSection(title);
                        }} 
                        className={`text-[10px] py-2.5 px-6 flex items-center space-x-2 shadow-sm font-black uppercase tracking-widest transition-all rounded-lg border ${isLocked ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                      >
                        <Layers size={16}/> <span>Add New Section</span>
                      </button>
                    </div>

                    <div className="flex items-center space-x-3">
                      <button
                        disabled={isLocked || isSaving}
                        onClick={() => handleSave(false)}
                        className={`text-[10px] py-2.5 px-6 flex items-center space-x-2 shadow-sm font-black uppercase tracking-widest transition-all rounded-lg border ${(isLocked || isSaving) ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                      >
                        <Save size={16}/> <span>{isSaving ? 'Saving…' : 'Save Draft'}</span>
                      </button>
                      <button
                        disabled={isLocked || isSaving}
                        onClick={() => handleSave(false)}
                        className={`text-[10px] py-2.5 px-6 flex items-center space-x-2 shadow-sm font-black uppercase tracking-widest transition-all rounded-lg border ${(isLocked || isSaving) ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed' : 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100'}`}
                      >
                        <Save size={16}/> <span>{isSaving ? 'Saving…' : 'Save Quotation'}</span>
                      </button>
                      <button
                        disabled={isLocked || isSaving}
                        onClick={() => handleSave(true)}
                        className={`text-[10px] py-2.5 px-8 flex items-center space-x-2 shadow-xl font-black uppercase tracking-widest transition-all rounded-lg ${(isLocked || isSaving) ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100'}`}
                      >
                        <FileCheck size={16}/> <span>{isSaving ? 'Approving…' : 'Approve Order'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
           SET SUGGESTION MODAL — appears when set product selected
      ══════════════════════════════════════════════════════════ */}
      {pendingSetSuggestion && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[500]">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in duration-200">
            <div className="bg-amber-600 text-white px-7 py-5">
              <h4 className="font-black uppercase tracking-tight text-base">Set Product Detected</h4>
              <p className="text-[10px] text-amber-100 mt-0.5 font-bold uppercase">
                {pendingSetSuggestion.setProduct.description}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 font-medium">This product is part of a set with {pendingSetSuggestion.remainingComponents.length} components:</p>
              <div className="bg-slate-50 rounded-xl p-3 space-y-1.5 border border-slate-200">
                {pendingSetSuggestion.remainingComponents.map((c, ci) => (
                  <div key={ci} className="flex justify-between text-xs">
                    <span className="font-bold text-slate-800 uppercase">{c.description}</span>
                    <span className="text-slate-500 font-medium">{c.qtyPerSet} {c.unit}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 pt-2">
                <button
                  onClick={() => setPendingSetSuggestion(null)}
                  className="col-span-1 py-2.5 text-xs font-bold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors uppercase"
                >
                  This Item Only
                </button>
                <button
                  onClick={handleAddSetComponents}
                  className="col-span-1 py-2.5 text-xs font-bold text-blue-700 border border-blue-200 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors uppercase"
                >
                  Add Other Items
                </button>
                <button
                  onClick={() => addFullSet(pendingSetSuggestion.index, pendingSetSuggestion.setProduct, products)}
                  className="col-span-1 py-2.5 text-xs font-bold text-white bg-amber-600 rounded-xl hover:bg-amber-700 transition-colors uppercase shadow-md"
                >
                  Add Full Set
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NipponQuotationManager;
