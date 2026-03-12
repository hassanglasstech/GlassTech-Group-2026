
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { toast } from 'sonner';
import { Company, Product, StoreItem } from '@/modules/shared/types';
import { SalesService } from '@/modules/sales/services/salesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { 
  Plus, Search, Edit2, Trash2, Package, Layers, Wrench, 
  FileSpreadsheet, FileUp, Image as ImageIcon, Loader2, 
  Factory, ChevronRight, ChevronDown, Filter, Download, FileJson, 
  UploadCloud, Settings2, Flame
} from 'lucide-react';
import ProductFormModal from '@/components/product/ProductFormModal';
import * as XLSX from 'xlsx';

const GlasscoProductMaster: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [activeTab, setActiveTab] = useState<'materials' | 'rates' | 'services'>('materials');
  const [products, setProducts] = useState<Product[]>([]);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [groupByCategory, setGroupByCategory] = useState(true);
  
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refreshData();
  }, [company, activeTab]);

  const refreshData = () => {
    const allProds = SalesService.getProducts().filter(p => p.company === company);
    const allStore = InventoryService.getStore().filter(s => s.company === company);
    setProducts(allProds);
    setStoreItems(allStore);
  };

  const getStockLevel = (prodId: string) => {
      const item = storeItems.find(s => s.id === prodId);
      return item ? item.quantity : 0;
  };

  const getAvailableNicks = () => {
      const standards = ['T/G', 'Notch', 'P/E', 'P/F', 'Double Glaze', 'R/D', 'L/G'];
      const dynamic = products.filter(p => p.category === 'Service' && p.serviceNick).map(p => p.serviceNick!);
      return Array.from(new Set([...standards, ...dynamic]));
  };

  const handleSaveProduct = (product: Product, storeItemData?: Partial<StoreItem>) => {
    let updatedProducts = SalesService.getProducts();
    let updatedStore = InventoryService.getStore();

    if (editingProduct) {
        updatedProducts = updatedProducts.map(p => p.id === editingProduct.id ? product : p);
        if (storeItemData) {
            updatedStore = updatedStore.map(s => s.id === editingProduct.id ? { 
                ...s, 
                name: product.description, 
                category: storeItemData.category || s.category,
                unit: storeItemData.unit || s.unit,
                conversionFactor: storeItemData.conversionFactor || s.conversionFactor,
                movingAveragePrice: product.costPrice || s.movingAveragePrice 
            } : s);
        }
    } else {
        updatedProducts.push(product);
        if (storeItemData) {
            updatedStore.push({
                id: product.id,
                company,
                name: product.description,
                category: storeItemData.category || 'Raw',
                quantity: 0, unrestrictedQty: 0, qiQty: 0, blockedQty: 0, reservedQty: 0, consignmentQty: 0,
                unit: storeItemData.unit || 'Unit',
                altUnit: 'N/A',
                conversionFactor: storeItemData.conversionFactor || 0,
                minLevel: storeItemData.minLevel || 500,
                reorderPoint: 50,
                movingAveragePrice: product.costPrice || 0,
                totalValue: 0,
                storageBin: 'New',
                lastMovementDate: new Date().toISOString()
            });
        }
    }

    SalesService.saveProducts(updatedProducts);
    InventoryService.saveStore(updatedStore);
    refreshData();
    setIsModalOpen(false);
    toast.success(editingProduct ? "Product updated successfully" : "Product created successfully");
  };

  // Added missing openAddModal function to initialize new item creation
  const openAddModal = () => {
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  // Added missing handleEdit function to load existing item into the form
  const handleEdit = (p: Product) => {
    setEditingProduct(p);
    setIsModalOpen(true);
  };

  // --- DATA TOOLS LOGIC ---

  const handleExportJson = () => {
    const data = {
      meta: { company, timestamp: new Date().toISOString(), type: 'GlasscoMasterData' },
      products: products
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Glassco_Material_Master_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target?.result as string);
        if (!data.products || !Array.isArray(data.products)) throw new Error("Invalid structure");
        
        const otherProds = SalesService.getProducts().filter(p => p.company !== company);
        const importedProds = data.products.map((p: any) => ({ ...p, company })); // Ensure company safety
        
        SalesService.saveProducts([...otherProds, ...importedProds]);
        refreshData();
        toast.success(`Successfully imported ${importedProds.length} products from JSON.`);
      } catch (err) {
        toast.error("Error importing JSON: Ensure file is a valid Glasstech Master Data export.");
      }
    };
    reader.readAsText(file);
    if (jsonInputRef.current) jsonInputRef.current.value = '';
  };

  const handleExportExcel = () => {
    let dataToExport: any[] = [];
    
    if (activeTab === 'services') {
        dataToExport = products.filter(p => p.category === 'Service').map(p => ({
            'Service Name': p.description,
            'Quotation Nick': p.serviceNick || '',
            'Thickness Link': p.thickness || 'All',
            'Billing Unit': p.unit,
            'Factory Cost': p.costPrice || 0,
            'Sales Rate': p.basePrice || 0,
            'Vendor/Plant': p.brand || ''
        }));
    } else {
        dataToExport = products.filter(p => p.category !== 'Service').map(p => ({
            'Item ID': p.id,
            'Description': p.description,
            'Category': p.category,
            'Glass Type': p.glassType || '',
            'Sub-Category': p.subCategory || '',
            'Thickness': p.thickness || '',
            'Finish/Color': p.finishColor || '',
            'Size (Sheet)': p.sheetSize || '',
            'Unit': p.unit,
            'Purchase Cost': p.costPrice || 0,
            'Base Sales Rate': p.basePrice || 0,
            'Tempering Rate': p.temperingPrice || 0
        }));
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeTab.toUpperCase());
    XLSX.writeFile(wb, `Glassco_${activeTab}_Master_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData: any[] = XLSX.utils.sheet_to_json(ws);

        const newProducts: Product[] = rawData.map((row, idx) => {
            const commonFields = {
                id: row['Item ID'] || `ITM-${Date.now()}-${idx}`,
                company,
                description: String(row['Description'] || row['Service Name'] || 'UNNAMED').toUpperCase(),
                costPrice: Number(row['Purchase Cost'] || row['Factory Cost'] || 0),
                basePrice: Number(row['Base Sales Rate'] || row['Sales Rate'] || 0),
                unit: (row['Unit'] || row['Billing Unit'] || 'Unit') as any,
                variants: []
            };

            if (activeTab === 'services' || row['Quotation Nick']) {
                return {
                    ...commonFields,
                    category: 'Service',
                    serviceNick: row['Quotation Nick'] || row['Nick'],
                    thickness: row['Thickness Link'] || row['Thickness'],
                    brand: row['Vendor/Plant'] || row['Vendor']
                } as Product;
            } else {
                return {
                    ...commonFields,
                    category: row['Category'] || 'Glass',
                    glassType: row['Glass Type'] || 'Plain',
                    subCategory: row['Sub-Category'] || 'Standard',
                    thickness: row['Thickness'] || '',
                    finishColor: row['Finish/Color'] || row['Color'] || '',
                    sheetSize: row['Size (Sheet)'] || row['Size'] || '',
                    temperingPrice: Number(row['Tempering Rate'] || 0) || undefined
                } as Product;
            }
        });

        const otherProds = SalesService.getProducts().filter(p => p.company !== company);
        // Logic: Replace current company products or merge? User context usually implies update/replace for master lists
        SalesService.saveProducts([...otherProds, ...newProducts]);
        refreshData();
        toast.success(`Successfully loaded ${newProducts.length} items from Excel.`);
      } catch (err) {
        toast.error("Excel Import Failed: Ensure columns match the expected template.");
      }
    };
    reader.readAsBinaryString(file);
    if (excelInputRef.current) excelInputRef.current.value = '';
  };

  const updatePrice = (id: string, field: 'costPrice' | 'basePrice' | 'temperingPrice', value: number) => {
    const updated = products.map(p => p.id === id ? { ...p, [field]: value } : p);
    setProducts(updated);
    SalesService.saveProducts(SalesService.getProducts().map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleDelete = (id: string) => {
      if(confirm("Are you sure you want to delete this item?")) {
          const updated = SalesService.getProducts().filter(p => p.id !== id);
          SalesService.saveProducts(updated);
          refreshData();
          toast.success("Item deleted successfully");
      }
  };

  const filtered = useMemo(() => {
    return products
      .filter(p => {
          const matchesSearch = p.description.toLowerCase().includes(searchTerm.toLowerCase()) || p.id.toLowerCase().includes(searchTerm.toLowerCase());
          const matchesCat = catFilter === 'All' || p.glassType === catFilter;
          return matchesSearch && matchesCat;
      })
      .sort((a, b) => a.description.localeCompare(b.description));
  }, [products, searchTerm, catFilter, activeTab]);

  const renderHierarchicalItems = (items: Product[], type: 'materials' | 'rates') => {
      const categories = Array.from(new Set(items.map(i => i.category))).sort();
      
      return categories.map(cat => {
          const catItems = items.filter(i => i.category === cat);
          
          return (
              <React.Fragment key={cat}>
                  <tr className="bg-slate-800 text-white no-print">
                      <td colSpan={type === 'materials' ? 8 : 5} className="px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em]">{cat}</td>
                  </tr>

                  {cat === 'Glass' ? (
                      ['Plain', 'Color', 'Mirror', 'Fluted'].map(gType => {
                          const typeItems = catItems.filter(i => i.glassType === gType);
                          if (typeItems.length === 0) return null;

                          return (
                              <React.Fragment key={gType}>
                                  <tr className="bg-slate-200/80 no-print">
                                      <td colSpan={type === 'materials' ? 8 : 5} className="px-8 py-1.5 text-[10px] font-black uppercase text-slate-700 tracking-widest flex items-center">
                                          <ChevronRight size={12} className="mr-2"/> {gType}
                                      </td>
                                  </tr>

                                  {gType === 'Color' || gType === 'Mirror' ? (
                                      Array.from(new Set(typeItems.map(i => i.subCategory || 'Standard'))).map(sub => {
                                          const subItems = typeItems.filter(i => (i.subCategory || 'Standard') === sub);
                                          return (
                                              <React.Fragment key={sub}>
                                                  <tr className="bg-blue-50/50 no-print">
                                                      <td colSpan={type === 'materials' ? 8 : 5} className="px-12 py-1 text-[9px] font-black uppercase text-blue-600 tracking-wider">
                                                          {sub} {gType}
                                                      </td>
                                                  </tr>
                                                  {subItems.map(p => type === 'materials' ? renderMaterialRow(p) : renderRateRow(p))}
                                              </React.Fragment>
                                          );
                                      })
                                  ) : (
                                      typeItems.map(p => type === 'materials' ? renderMaterialRow(p) : renderRateRow(p))
                                  )}
                              </React.Fragment>
                          );
                      })
                  ) : (
                      catItems.map(p => type === 'materials' ? renderMaterialRow(p) : renderRateRow(p))
                  )}
              </React.Fragment>
          );
      });
  };

  const renderMaterialRow = (p: Product) => {
      const stock = getStockLevel(p.id);
      return (
          <tr key={p.id} className="hover:bg-slate-50 transition-colors text-xs">
              <td className="px-8 py-3 font-black text-blue-600 uppercase">{p.id.slice(-8)}</td>
              <td className="font-black text-slate-700 uppercase">{p.thickness || 'N/A'}</td>
              <td className="font-bold text-slate-800 uppercase">{p.glassType || p.category}</td>
              <td className="font-bold text-slate-500 text-[10px] uppercase">{p.subCategory || 'Standard'}</td>
              <td className="font-bold text-slate-500 text-[10px] uppercase">{p.finishColor || 'N/A'}</td>
              <td className="text-[10px] font-bold text-slate-600 uppercase">{p.category === 'Glass' ? (p.sheetSize || 'Standard') : p.unit}</td>
              <td className="text-right">
                  <span className={`text-sm font-black ${stock > 0 ? 'text-emerald-600' : 'text-rose-400'}`}>{stock.toLocaleString()}</span>
                  <span className="text-[9px] text-slate-400 ml-1 uppercase">{p.unit}</span>
              </td>
              <td className="pr-4">
                  <div className="flex items-center justify-end space-x-1">
                    <button onClick={() => handleEdit(p)} className="p-1.5 text-slate-400 hover:text-blue-600 bg-white border border-slate-200 rounded transition-all"><Edit2 size={12}/></button>
                    <button onClick={() => handleDelete(p.id)} className="p-1.5 text-slate-400 hover:text-red-600 bg-white border border-slate-200 rounded transition-all"><Trash2 size={12}/></button>
                  </div>
              </td>
          </tr>
      );
  };

  const renderRateRow = (p: Product) => (
      <tr key={p.id} className="hover:bg-slate-50 transition-colors">
          <td className="font-bold text-[11px] uppercase text-slate-700 pl-8 py-2">{p.description}</td>
          <td className="p-1 text-center">
              <input type="number" className="w-20 text-center bg-slate-50 border rounded py-0.5 font-black text-[10px] outline-none focus:ring-2 focus:ring-emerald-500" value={p.costPrice || 0} onChange={e => updatePrice(p.id, 'costPrice', Number(e.target.value))} />
          </td>
          <td className="p-1 text-center">
              <input type="number" className="w-20 text-center bg-white border border-blue-200 rounded py-0.5 font-black text-[10px] text-blue-700 outline-none focus:ring-2 focus:ring-blue-500" value={p.basePrice || 0} onChange={e => updatePrice(p.id, 'basePrice', Number(e.target.value))} />
          </td>
          <td className="p-1 text-center">
              {p.category === 'Glass' ? (
                <input type="number" className="w-24 text-center bg-emerald-50 border border-emerald-200 rounded py-0.5 font-black text-[10px] text-emerald-700 outline-none focus:ring-2 focus:ring-emerald-500" value={p.temperingPrice || 0} onChange={e => updatePrice(p.id, 'temperingPrice', Number(e.target.value))} placeholder="With Temp" />
              ) : (
                <span className="text-[9px] text-slate-300">N/A</span>
              )}
          </td>
          <td className="text-center">
              {p.basePrice > 0 && <span className={`text-[10px] font-black ${p.basePrice > (p.costPrice || 0) ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {((p.basePrice - (p.costPrice || 0)) / p.basePrice * 100).toFixed(1)}%
              </span>}
          </td>
      </tr>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* TOOLBAR */}
      <div className="flex flex-col lg:flex-row justify-between items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-sm w-full no-print gap-4">
        <div className="flex items-center space-x-1">
          <button onClick={() => setActiveTab('materials')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all ${activeTab === 'materials' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Layers size={16} /><span>Material Library</span>
          </button>
          <button onClick={() => setActiveTab('rates')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all ${activeTab === 'rates' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            <FileSpreadsheet size={16} /><span>Price Lists</span>
          </button>
          <button onClick={() => setActiveTab('services')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all ${activeTab === 'services' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Wrench size={16} /><span>Service Rates</span>
          </button>
        </div>

        <div className="flex items-center space-x-3 w-full lg:w-auto overflow-x-auto no-scrollbar pb-1">
           {/* HIDDEN INPUTS */}
           <input type="file" ref={jsonInputRef} className="hidden" accept=".json" onChange={handleImportJson} />
           <input type="file" ref={excelInputRef} className="hidden" accept=".xlsx,.xls" onChange={handleImportExcel} />

           <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl">
               <button onClick={handleExportJson} className="p-2 text-slate-600 hover:bg-white rounded-lg transition-all" title="Export JSON"><FileJson size={18}/></button>
               <button onClick={handleExportExcel} className="p-2 text-emerald-600 hover:bg-white rounded-lg transition-all" title="Export Excel"><FileSpreadsheet size={18}/></button>
               <div className="w-px h-6 bg-slate-200 mx-1"></div>
               <button onClick={() => jsonInputRef.current?.click()} className="p-2 text-slate-600 hover:bg-white rounded-lg transition-all" title="Import JSON"><UploadCloud size={18}/></button>
               <button onClick={() => excelInputRef.current?.click()} className="p-2 text-emerald-600 hover:bg-white rounded-lg transition-all" title="Import Excel"><FileUp size={18}/></button>
           </div>

           <div className="h-8 w-px bg-slate-200 hidden lg:block"></div>

           {company !== 'Nippon' && (
               <div className="relative shrink-0">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <select 
                    className="pl-9 pr-4 py-2 bg-slate-100 border-none rounded-xl font-bold text-xs uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                    value={catFilter}
                    onChange={e => setCatFilter(e.target.value)}
                  >
                      <option value="All">All Glass</option>
                      <option value="Plain">Plain</option>
                      <option value="Color">Color</option>
                      <option value="Mirror">Mirror</option>
                      <option value="Fluted">Fluted</option>
                  </select>
               </div>
           )}
           <div className="relative w-48 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input type="text" placeholder="Search..." className="w-full pl-9 pr-4 py-2 bg-slate-100 border-none rounded-xl font-bold text-xs uppercase focus:ring-2 focus:ring-blue-500 outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
           </div>
        </div>
      </div>

      {activeTab === 'materials' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-2">
           <div className="bg-slate-900 text-white p-8 rounded-[2rem] shadow-xl flex flex-col md:flex-row justify-between items-center relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10"><Package size={140} /></div>
              <div className="relative z-10 text-center md:text-left mb-4 md:mb-0">
                 <h2 className="text-2xl font-black uppercase tracking-tight">Material Master Data</h2>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Registry of raw glass and components</p>
              </div>
              <button onClick={openAddModal} className="bg-white text-slate-900 px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-blue-600 hover:text-white transition-all flex items-center space-x-2 relative z-10">
                 <Plus size={16}/> <span>New Material</span>
              </button>
           </div>

           <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px]">
              <table className="w-full text-left sap-table">
                 <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    <tr><th className="px-8 py-4">Serial / ID</th><th>Thick.</th><th>Type</th><th>Sub-Cat</th><th>Color</th><th>Size</th><th className="text-right">Stock</th><th className="text-right pr-8">Action</th></tr>
                 </thead>
                 <tbody className="divide-y">
                    {groupByCategory ? renderHierarchicalItems(filtered, 'materials') : filtered.map(p => renderMaterialRow(p))}
                 </tbody>
              </table>
           </div>
        </div>
      )}

      {activeTab === 'rates' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in">
           <div className="p-6 bg-slate-50 border-b flex justify-between items-center">
              <div>
                  <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm">Inventory Pricing Matrix</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Valuation controls for Quotations</p>
              </div>
              <div className="flex items-center space-x-2">
                  <label className="flex items-center space-x-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm transition-all hover:bg-slate-50">
                      <input type="checkbox" checked={groupByCategory} onChange={e => setGroupByCategory(e.target.checked)} className="form-checkbox h-3 w-3 text-blue-600 rounded focus:ring-0" />
                      <span className="text-[10px] font-black text-slate-600 uppercase">Grouped View</span>
                  </label>
              </div>
           </div>
           <div className="max-h-[600px] overflow-y-auto">
               <table className="w-full text-left sap-table">
                  <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm border-b text-[10px] font-black uppercase text-slate-500"><tr><th className="pl-8 py-4">Item Description</th><th className="w-32 text-center">Cost (PKR)</th><th className="w-32 text-center">Base (PKR)</th><th className="w-40 text-center">Temp (PKR)</th><th className="w-32 text-center">Margin %</th></tr></thead>
                  <tbody className="divide-y">
                     {groupByCategory ? renderHierarchicalItems(filtered, 'rates') : filtered.map(p => renderRateRow(p))}
                  </tbody>
               </table>
           </div>
        </div>
      )}

      {activeTab === 'services' && (
        <div className="space-y-6">
           <div className="flex justify-between items-center bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
              <div className="flex items-center space-x-4">
                  <div className="p-3 bg-indigo-100 text-indigo-700 rounded-2xl"><Wrench size={24}/></div>
                  <div>
                    <h3 className="font-black uppercase text-slate-800 tracking-tight">Processing Services Registry</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Labor and outsourcing rate control</p>
                  </div>
              </div>
              <button onClick={openAddModal} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-indigo-700 transition-all flex items-center space-x-2"><Plus size={16}/><span>Add Service</span></button>
           </div>
           <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left sap-table">
                 <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    <tr><th className="px-6 py-4">Service Name</th><th>Quotation Nick</th><th>Thickness</th><th>Unit</th><th>Cost</th><th>Sales Rate</th><th className="text-right pr-6">Actions</th></tr>
                 </thead>
                 <tbody className="divide-y">
                    {filtered.filter(p => p.category === 'Service').map(p => (
                       <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-bold text-xs uppercase text-slate-700">
                              {p.description}
                              {p.brand && (
                                  <span className="ml-2 inline-flex items-center space-x-1 bg-orange-50 text-orange-700 px-2 py-0.5 rounded text-[9px] font-black border border-orange-100 uppercase">
                                      <Factory size={10}/> <span>{p.brand}</span>
                                  </span>
                              )}
                          </td>
                          <td><span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-[10px] font-black uppercase border border-blue-100">{p.serviceNick || '-'}</span></td>
                          <td><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-black uppercase">{p.thickness || 'All'}</span></td>
                          <td><span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-black uppercase">{p.unit}</span></td>
                          <td className="font-black text-slate-400 text-xs">PKR {p.costPrice}</td>
                          <td className="font-black text-indigo-600 text-xs">PKR {p.basePrice}</td>
                          <td className="pr-6 text-right">
                              <div className="flex items-center justify-end space-x-2">
                                <button onClick={() => handleEdit(p)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100 rounded transition-all"><Edit2 size={14}/></button>
                                <button onClick={() => handleDelete(p.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 rounded transition-all"><Trash2 size={14}/></button>
                              </div>
                          </td>
                       </tr>
                    ))}
                    {filtered.filter(p => p.category === 'Service').length === 0 && (
                        <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-300 font-bold uppercase italic text-xs">No services defined in the master list.</td></tr>
                    )}
                 </tbody>
              </table>
           </div>
        </div>
      )}

      <ProductFormModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveProduct}
        editingProduct={editingProduct}
        company={company}
        existingNicks={getAvailableNicks()}
        initialMode={activeTab === 'services' ? 'Service' : 'Material'}
      />
    </div>
  );
};

export default GlasscoProductMaster;
