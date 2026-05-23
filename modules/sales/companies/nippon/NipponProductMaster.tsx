
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Product, StoreItem } from '@/modules/shared/types';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { getBrandNick } from '@/modules/shared/utils/brandUtils';
import { 
  Plus, Search, Edit2, Trash2, Package, Filter, Download, Box, 
  FileJson, FileSpreadsheet, FileUp, UploadCloud, LayoutGrid, List, Printer
} from 'lucide-react';
import NipponProductForm from '@/modules/nippon/components/NipponProductForm';
import NipponSmartImporter from './components/NipponSmartImporter';
import NipponDirectImporter from './components/NipponDirectImporter';
import { NipponCatalogPrint } from '@/modules/nippon/prints/NipponCatalogPrint';
import * as XLSX from 'xlsx';

const NipponProductMaster: React.FC = () => {
  const company = 'Nippon';
  const [products, setProducts] = useState<Product[]>([]);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'catalog'>('table');
  const [activeTab, setActiveTab] = useState<'list' | 'import' | 'direct'>('list');
  const [isPrintingCatalog, setIsPrintingCatalog] = useState(false);

  const jsonInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = async () => {
    const allProds = (await AsyncSalesService.getProducts()).filter(p => p.company === company);
    const allStore = InventoryService.getStore().filter(s => s.company === company);
    setProducts(allProds);
    setStoreItems(allStore);
  };

  const getStockLevel = (prodId: string) => {
      const item = storeItems.find(s => s.id === prodId);
      return item ? item.quantity : 0;
  };

  const handleSaveProduct = async (product: Product, storeItemData?: Partial<StoreItem>) => {
    let updatedProducts = await AsyncSalesService.getProducts();
    let updatedStore = InventoryService.getStore();

    if (editingProduct) {
        updatedProducts = updatedProducts.map(p => p.id === editingProduct.id ? product : p);
        updatedStore = updatedStore.map(s => s.id === editingProduct.id ? { 
            ...s, 
            name: product.description, 
            category: product.category as any,
            unit: product.unit,
            movingAveragePrice: product.costPrice || s.movingAveragePrice 
        } : s);
    } else {
        updatedProducts.push(product);
        updatedStore.push({
            id: product.id,
            company,
            name: product.description,
            category: product.category as any,
            quantity: 0, unrestrictedQty: 0, qiQty: 0, blockedQty: 0, reservedQty: 0, consignmentQty: 0,
            unit: product.unit,
            minLevel: 10,
            reorderPoint: 5,
            movingAveragePrice: product.costPrice || 0,
            totalValue: 0,
            storageBin: 'New',
            lastMovementDate: new Date().toISOString()
        });
    }

    // Handle Set Components Inventory Tracking
    if (product.isSet && product.setComponents) {
        product.setComponents.forEach(comp => {
            const compStoreId = `${product.id}-SUB-${comp.id.split('-').pop()}`;
            const existingComp = updatedStore.find(s => s.id === compStoreId);
            
            if (!existingComp) {
                updatedStore.push({
                    id: compStoreId,
                    company,
                    name: `[SUB] ${product.description} - ${comp.description}`,
                    category: product.category as any,
                    quantity: 0, unrestrictedQty: 0, qiQty: 0, blockedQty: 0, reservedQty: 0, consignmentQty: 0,
                    unit: comp.unit,
                    minLevel: 5,
                    reorderPoint: 2,
                    movingAveragePrice: 0,
                    totalValue: 0,
                    storageBin: 'SET-COMP',
                    lastMovementDate: new Date().toISOString()
                });
            } else {
                existingComp.name = `[SUB] ${product.description} - ${comp.description}`;
                existingComp.unit = comp.unit;
            }
        });
    }

    await AsyncSalesService.saveProducts(updatedProducts);
    InventoryService.saveStore(updatedStore);
    await refreshData();
    setIsModalOpen(false);
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  const handleEdit = (p: Product) => {
    setEditingProduct(p);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
      if(confirm("Delete this hardware item? Stock history will be preserved but item will be hidden.")) {
          const updated = (await AsyncSalesService.getProducts()).filter(p => p.id !== id);
          await AsyncSalesService.saveProducts(updated);
          await refreshData();
      }
  };

  // --- DATA TOOLS ---

  const handleExportJson = () => {
    const data = {
      meta: { company, timestamp: new Date().toISOString(), type: 'NipponProductMaster' },
      products: products
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Nippon_Master_Backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = JSON.parse(evt.target?.result as string) as { products?: Array<Record<string, unknown>> };
        if (!data.products || !Array.isArray(data.products)) throw new Error("Invalid structure");

        const otherProds = (await AsyncSalesService.getProducts()).filter(p => p.company !== company);
        const importedProds = data.products.map((p) => ({ ...p, company: 'Nippon' })) as unknown as Product[];
        
        await AsyncSalesService.saveProducts([...otherProds, ...importedProds]);
        await refreshData();
        alert(`Imported ${importedProds.length} products from JSON.`);
      } catch (err) {
        alert("Error importing JSON. Ensure file is a valid Nippon product export.");
      }
    };
    reader.readAsText(file);
  };

  const handleExportExcel = () => {
      // Define Template Column Names
      const dataToExport = products.map(p => ({
          'Internal ID': p.profileCode || '',
          'Model No': p.modelNo || '',
          'Description': p.description,
          'Brand': p.brand || '',
          'Main Category': p.mainCategory || '',
          'Sub Category': p.subCategory || '',
          'Unit': p.unit,
          'Cost Price': p.costPrice || 0,
          'Sales Price': p.basePrice || 0,
          'Finish': p.finishColor || '',
          'Material': p.material || '',
          'Direction': p.direction || '',
          'Size': p.tongueLength || '',
          'Spindle Length': p.spindleLength || ''
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "NipponMaster");
      XLSX.writeFile(wb, `Nippon_Catalog_Template_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData: any[] = XLSX.utils.sheet_to_json(ws);

        const newProducts: Product[] = rawData.map((row, idx) => ({
            id: `NIP-${row['Model No'] || Date.now()}-${idx}`,
            company: 'Nippon',
            description: String(row['Description'] || 'UNNAMED').toUpperCase(),
            modelNo: String(row['Model No'] || '').toUpperCase(),
            brand: String(row['Brand'] || '').toUpperCase(),
            profileCode: String(row['Internal ID'] || '').toUpperCase(),
            mainCategory: String(row['Main Category'] || '').toUpperCase(),
            subCategory: String(row['Sub Category'] || '').toUpperCase(),
            category: 'Hardware', // Default category for Nippon
            unit: (row['Unit'] || 'PCS') as any,
            costPrice: Number(row['Cost Price'] || 0),
            basePrice: Number(row['Sales Price'] || 0),
            finishColor: row['Finish'] || '',
            material: row['Material'] || '',
            direction: row['Direction'] || '',
            tongueLength: row['Size'] || '',
            spindleLength: row['Spindle Length'] || '',
            variants: []
        }));

        const otherProds = (await AsyncSalesService.getProducts()).filter(p => p.company !== company);
        await AsyncSalesService.saveProducts([...otherProds, ...newProducts]);
        await refreshData();
        alert(`Loaded ${newProducts.length} items from Excel.`);
      } catch (err) {
        alert("Excel Import Failed. Ensure column names match the template headers.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handlePrintCatalog = () => {
    setIsPrintingCatalog(true);
    setTimeout(() => {
      window.print();
      setIsPrintingCatalog(false);
    }, 500);
  };

  const filtered = useMemo(() => {
    return products
      .filter(p => {
          const matchesSearch = p.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                String(p.modelNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                                String(p.profileCode || '').toLowerCase().includes(searchTerm.toLowerCase());
          const matchesCat = catFilter === 'All' || p.category === catFilter;
          return matchesSearch && matchesCat;
      })
      .sort((a, b) => a.description.localeCompare(b.description));
  }, [products, searchTerm, catFilter]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* TABS */}
      <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-2xl w-fit no-print">
        <button 
          onClick={() => setActiveTab('list')}
          className={`px-6 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all ${activeTab === 'list' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
        >
          Material Registry
        </button>
        <button
          onClick={() => setActiveTab('direct')}
          className={`px-6 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all ${activeTab === 'direct' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
        >
          Bulk Import
        </button>
      </div>

      {activeTab === 'direct' ? (
        <NipponDirectImporter onComplete={() => {
          setActiveTab('list');
          refreshData();
        }} />
      ) : (
        <>
          {/* CATALOG PRINT VIEW */}
      {isPrintingCatalog && (
        <div className="hidden print:block">
          <NipponCatalogPrint products={filtered} />
        </div>
      )}

      {/* TOOLBAR */}
      <div className="flex flex-col lg:flex-row justify-between items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-sm w-full no-print gap-4">
        <div className="flex items-center space-x-3">
           <div className="p-2 bg-red-600 rounded-lg text-white shadow-inner"><Box size={20}/></div>
           <div>
               <h3 className="font-black text-slate-800 uppercase tracking-tight">Material Registry</h3>
           </div>
        </div>

        <div className="flex items-center space-x-2 w-full lg:w-auto overflow-x-auto no-scrollbar pb-1">
           {/* HIDDEN INPUTS */}
           <input type="file" ref={jsonInputRef} className="hidden" accept=".json" onChange={handleImportJson} />
           <input type="file" ref={excelInputRef} className="hidden" accept=".xlsx,.xls" onChange={handleImportExcel} />

           <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl">
               <button onClick={handleExportJson} className="p-2 text-slate-600 hover:bg-white rounded-lg transition-all" title="Backup JSON"><FileJson size={18}/></button>
               <button onClick={handleExportExcel} className="p-2 text-emerald-600 hover:bg-white rounded-lg transition-all" title="Export Template/Excel"><FileSpreadsheet size={18}/></button>
               <div className="w-px h-6 bg-slate-200 mx-1"></div>
               <button onClick={() => jsonInputRef.current?.click()} className="p-2 text-slate-600 hover:bg-white rounded-lg transition-all" title="Restore JSON"><UploadCloud size={18}/></button>
               <button onClick={() => excelInputRef.current?.click()} className="p-2 text-emerald-600 hover:bg-white rounded-lg transition-all" title="Import Excel"><FileUp size={18}/></button>
           </div>

           <div className="h-8 w-px bg-slate-200 hidden lg:block mx-2"></div>

           <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl mr-2">
               <button 
                   onClick={() => setViewMode('table')} 
                   className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                   title="Table View"
               >
                   <List size={18}/>
               </button>
               <button 
                   onClick={() => setViewMode('catalog')} 
                   className={`p-2 rounded-lg transition-all ${viewMode === 'catalog' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                   title="Catalog View"
               >
                   <LayoutGrid size={18}/>
               </button>
           </div>

           <button 
               onClick={handlePrintCatalog}
               className="p-2.5 text-slate-600 hover:bg-slate-100 rounded-xl transition-all mr-2"
               title="Print Catalog"
           >
               <Printer size={18}/>
           </button>

           <div className="relative shrink-0">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <select 
                className="pl-9 pr-4 py-2 bg-slate-100 border-none rounded-xl font-bold text-xs uppercase focus:ring-2 focus:ring-red-500 outline-none"
                value={catFilter}
                onChange={e => setCatFilter(e.target.value)}
              >
                  <option value="All">All Groups</option>
                  <option value="Hardware">Hardware</option>
                  <option value="Accessory">Accessory</option>
                  <option value="Consumable">Consumable</option>
              </select>
           </div>
           
           <div className="relative w-48 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input type="text" placeholder="Search..." className="w-full pl-9 pr-4 py-2 bg-slate-100 border-none rounded-xl font-bold text-xs uppercase focus:ring-2 focus:ring-red-500 outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
           </div>

           <button onClick={openAddModal} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-red-600 transition-all flex items-center space-x-2">
               <Plus size={16}/> <span>Add Item</span>
           </button>
        </div>
      </div>

      {viewMode === 'table' ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px] no-print">
              <table className="w-full text-left sap-table">
                  <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    <tr>
                        <th className="px-6 py-4">Internal ID</th>
                        <th>Image</th>
                        <th>System</th>
                        <th>Model No</th>
                        <th>Description</th>
                        <th>Brand</th>
                        <th>Color</th>
                        <th>Material</th>
                        <th>Dir</th>
                        <th>Size</th>
                        <th>Spindle</th>
                        <th>Category</th>
                        <th className="text-right">Unit Price</th>
                        <th className="text-right">Stock</th>
                        <th className="text-right pr-6">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map(p => {
                        const stock = getStockLevel(p.id);
                        return (
                            <tr key={p.id} className="hover:bg-slate-50 transition-colors text-xs group">
                                <td className="px-6 py-3 font-mono font-bold text-slate-400 uppercase">{p.profileCode || '-'}</td>
                                <td className="py-3">
                                    <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center">
                                        {p.imageUrl ? (
                                            <img src={p.imageUrl} alt={p.description} className="w-full h-full object-cover" />
                                        ) : (
                                            <Package size={16} className="text-slate-300" />
                                        )}
                                    </div>
                                </td>
                                <td className="font-black text-slate-500 uppercase">
                                    <span className={`px-2 py-0.5 rounded border text-[9px] ${
                                        p.mainCategory === 'Aluminium Products' ? 'bg-blue-50 text-blue-700 border-blue-100' : 
                                        p.mainCategory === 'UPVC' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                                        p.mainCategory === 'Steel Mesh' ? 'bg-slate-100 text-slate-700 border-slate-200' :
                                        p.mainCategory === 'Silicon' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                        'bg-slate-50 text-slate-500'
                                    }`}>
                                        {p.mainCategory || 'Generic'}
                                    </span>
                                </td>
                                <td className="font-black text-blue-600 uppercase">{p.modelNo || '-'}</td>
                                <td className="font-bold text-slate-800 uppercase">
                                    <div className="flex flex-col">
                                        <span>{p.description}</span>
                                        {p.subCategory && <span className="text-[9px] text-slate-400 font-medium">TYPE: {p.subCategory}</span>}
                                    </div>
                                </td>
                                <td className="font-bold text-slate-500 text-[10px] uppercase">{getBrandNick(p.brand || '-')}</td>
                                <td className="font-medium text-slate-500 text-[10px] uppercase">{p.finishColor || '-'}</td>
                                <td className="font-medium text-slate-500 text-[10px] uppercase">{p.material || '-'}</td>
                                <td className="font-medium text-slate-500 text-[10px] uppercase">{p.direction || '-'}</td>
                                <td className="font-medium text-slate-500 text-[10px] uppercase">{p.tongueLength || p.thickness || '-'}</td>
                                <td className="font-medium text-slate-500 text-[10px] uppercase">{p.spindleLength || '-'}</td>
                                <td className="font-bold text-slate-500 text-[10px] uppercase"><span className="bg-slate-100 px-2 py-0.5 rounded border">{p.category}</span></td>
                                <td className="text-right font-bold text-slate-700 whitespace-nowrap">PKR {p.basePrice?.toLocaleString()}</td>
                                <td className="text-right">
                                    <span className={`text-sm font-black ${stock > 0 ? 'text-emerald-600' : 'text-rose-400'}`}>{(Number(stock) || 0).toLocaleString()}</span>
                                    <span className="text-[9px] text-slate-400 ml-1 uppercase">{p.unit}</span>
                                </td>
                                <td className="pr-6 text-right">
                                    <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => handleEdit(p)} className="p-1.5 text-slate-400 hover:text-blue-600 bg-white border border-slate-200 rounded transition-all"><Edit2 size={12}/></button>
                                        <button onClick={() => handleDelete(p.id)} className="p-1.5 text-slate-400 hover:text-red-600 bg-white border border-slate-200 rounded transition-all"><Trash2 size={12}/></button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                  </tbody>
              </table>
              {filtered.length === 0 && (
                  <div className="p-20 text-center text-slate-300 font-black uppercase italic text-xs tracking-widest">
                      <Package size={48} className="mx-auto mb-4 opacity-10"/>
                      No hardware items found in selection.
                  </div>
              )}
          </div>
      ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 no-print">
              {filtered.map(p => (
                  <div key={p.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden group hover:shadow-xl transition-all flex flex-col">
                      <div className="aspect-square bg-slate-50 relative overflow-hidden flex items-center justify-center">
                          {p.imageUrl ? (
                              <img src={p.imageUrl} alt={p.description} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                          ) : (
                              <Package size={48} className="text-slate-200" />
                          )}
                          <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleEdit(p)} className="p-2 bg-white/90 backdrop-blur shadow-lg rounded-xl text-blue-600 hover:bg-blue-600 hover:text-white transition-all"><Edit2 size={16}/></button>
                              <button onClick={() => handleDelete(p.id)} className="p-2 bg-white/90 backdrop-blur shadow-lg rounded-xl text-red-600 hover:bg-red-600 hover:text-white transition-all"><Trash2 size={16}/></button>
                          </div>
                          <div className="absolute bottom-3 left-3">
                              <span className="px-2 py-1 bg-slate-900/80 backdrop-blur text-white text-[9px] font-black uppercase rounded-lg tracking-widest">
                                  {p.modelNo || 'No Code'}
                              </span>
                          </div>
                      </div>
                      <div className="p-4 flex-1 flex flex-col">
                          <div className="mb-2">
                              <h4 className="font-black text-slate-800 uppercase text-xs line-clamp-2 leading-tight h-8">{p.description}</h4>
                              <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{getBrandNick(p.brand || 'Generic')}</p>
                          </div>
                          <div className="mt-auto pt-3 border-t border-slate-100 flex justify-between items-end">
                              <div>
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Unit Price</p>
                                  <p className="font-black text-slate-900 text-sm">PKR {p.basePrice?.toLocaleString()}</p>
                              </div>
                              <div className="text-right">
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Stock</p>
                                  <p className={`font-black text-sm ${getStockLevel(p.id) > 0 ? 'text-emerald-600' : 'text-rose-400'}`}>
                                      {getStockLevel(p.id)} <span className="text-[9px]">{p.unit}</span>
                                  </p>
                              </div>
                          </div>
                      </div>
                  </div>
              ))}
              {filtered.length === 0 && (
                  <div className="col-span-full p-20 text-center text-slate-300 font-black uppercase italic text-xs tracking-widest">
                      <Package size={48} className="mx-auto mb-4 opacity-10"/>
                      No hardware items found in selection.
                  </div>
              )}
          </div>
        )}
      </>
    )}

    <NipponProductForm 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveProduct}
        editingProduct={editingProduct}
      />
    </div>
  );
};

export default NipponProductMaster;
