
import React, { useState, useMemo } from 'react';
import { useDebounce } from '@/modules/shared/hooks/useDebounce';
import { useAppStore } from '@/modules/shared/store/appStore';
import { StoreItem } from '@/modules/shared/types';
import { SalesService } from '@/modules/sales/services/salesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { AlertTriangle, LayoutGrid, List } from 'lucide-react';
import { Search, Box, Image as ImageIcon, Filter } from 'lucide-react';
import Pagination from '@/components/Pagination';

interface StockOverviewProps {
    items: StoreItem[];
    searchTerm: string;
    setSearchTerm: (val: string) => void;
}

const StockOverview: React.FC<StockOverviewProps> = ({ items, searchTerm, setSearchTerm }) => {
    const company = useAppStore(state => state.selectedCompany);
    const [mainFilter, setMainFilter] = useState('All');
    const [subFilter, setSubFilter]   = useState('All');
    const [currentPage, setCurrentPage] = useState(1);
    // Default to grouped view for Nippon (category-rich); flat for others.
    const [viewMode, setViewMode] = useState<'flat' | 'grouped'>(company === 'Nippon' ? 'grouped' : 'flat');
    const itemsPerPage = 20;

    const allProducts = SalesService.getProducts();

    // Category tree — derived from actual products so the dropdowns always
    // reflect what's in the database, not a hardcoded list. Falls back to
    // a sensible default ordering when alphabetic doesn't match the
    // domain hierarchy (Window → Door → Sliding first).
    const categoryTree = useMemo(() => {
        const tree = new Map<string, Set<string>>();
        const companyProducts = allProducts.filter(p => p.company === company);
        for (const p of companyProducts) {
            const main = p.mainCategory?.trim();
            const sub  = p.subCategory?.trim();
            if (!main) continue;
            if (!tree.has(main)) tree.set(main, new Set());
            if (sub) tree.get(main)!.add(sub);
        }
        const MAIN_ORDER = [
            'Window Hardware', 'Door Hardware', 'Sliding Hardware',
            'Profile & Frame Hardware', 'Silicon & Sealants',
            'Mesh & Screens', 'Fasteners & Consumables',
        ];
        const ordered = new Map<string, string[]>();
        for (const m of MAIN_ORDER) if (tree.has(m)) ordered.set(m, [...tree.get(m)!].sort());
        for (const [m, subs] of tree) if (!ordered.has(m)) ordered.set(m, [...subs].sort());
        return ordered;
    }, [allProducts, company]);

    const availableSubs = useMemo(() => {
        if (mainFilter === 'All') return [];
        return categoryTree.get(mainFilter) || [];
    }, [mainFilter, categoryTree]);

    // Phase 11 — Low stock alerts
    const lowStockAlerts = useMemo(() =>
      InventoryService.getLowStockItems(company),
    [items, company]);
    const lowStockMap: Record<string, 'red' | 'orange'> = {};
    lowStockAlerts.forEach(a => { lowStockMap[a.item.id] = a.alertLevel; });

    // Reset pagination when filter changes
    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, mainFilter, subFilter]);

    // Reset subFilter when mainFilter changes — a sub selected under one
    // main should not silently linger when the user switches main.
    React.useEffect(() => {
        setSubFilter('All');
    }, [mainFilter]);

    const filteredItems = useMemo(() => {
        return items.filter(i => {
            const product = allProducts.find(p => p.id === i.id);
            const matchesSearch = i.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesMain = mainFilter === 'All' || product?.mainCategory === mainFilter;
            const matchesSub  = subFilter  === 'All' || product?.subCategory  === subFilter;
            return matchesSearch && matchesMain && matchesSub;
        });
    }, [items, searchTerm, mainFilter, subFilter, allProducts]);

    const paginatedItems = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredItems.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredItems, currentPage]);

    // Group items by main_category → sub_category for the grouped view.
    // Falls back to "Uncategorized" when product or category is missing.
    const grouped = useMemo(() => {
        if (viewMode !== 'grouped') return null;
        const tree: Record<string, Record<string, StoreItem[]>> = {};
        for (const item of filteredItems) {
            const product = allProducts.find(p => p.id === item.id);
            const main = product?.mainCategory?.trim() || 'Uncategorized';
            const sub  = product?.subCategory?.trim()  || 'General';
            if (!tree[main]) tree[main] = {};
            if (!tree[main][sub]) tree[main][sub] = [];
            tree[main][sub].push(item);
        }
        // Order using the same MAIN_ORDER as categoryTree
        const MAIN_ORDER = [
            'Window Hardware', 'Door Hardware', 'Sliding Hardware',
            'Profile & Frame Hardware', 'Silicon & Sealants',
            'Mesh & Screens', 'Fasteners & Consumables',
        ];
        const orderedMains = [
            ...MAIN_ORDER.filter(m => m in tree),
            ...Object.keys(tree).filter(m => !MAIN_ORDER.includes(m)).sort(),
        ];
        return orderedMains.map(main => ({
            main,
            subs: Object.entries(tree[main]).sort(([a],[b]) => a.localeCompare(b)),
            total: Object.values(tree[main]).flat().length,
        }));
    }, [filteredItems, allProducts, viewMode]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[600px]">
             <div className="p-8 border-b flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center space-x-4">
                    <div className="relative w-80">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input type="text" placeholder="Filter Inventory..." className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </div>
                    {/* Nippon — Cascading Main → Sub Category filters,
                        driven by actual product taxonomy (Window/Door/Sliding/etc.) */}
                    {company === 'Nippon' && (
                        <>
                            <div className="relative">
                                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <select
                                    className="pl-10 pr-8 py-3 bg-white border border-slate-200 rounded-xl font-bold text-xs uppercase outline-none cursor-pointer hover:border-blue-300 transition-all appearance-none"
                                    value={mainFilter}
                                    onChange={(e) => setMainFilter(e.target.value)}
                                >
                                    <option value="All">All Categories</option>
                                    {[...categoryTree.keys()].map(main => (
                                        <option key={main} value={main}>{main}</option>
                                    ))}
                                </select>
                            </div>
                            {mainFilter !== 'All' && availableSubs.length > 0 && (
                                <div className="relative">
                                    <select
                                        className="pl-4 pr-8 py-3 bg-white border border-slate-200 rounded-xl font-bold text-xs uppercase outline-none cursor-pointer hover:border-blue-300 transition-all appearance-none"
                                        value={subFilter}
                                        onChange={(e) => setSubFilter(e.target.value)}
                                    >
                                        <option value="All">All Sub-Types</option>
                                        {availableSubs.map(sub => (
                                            <option key={sub} value={sub}>{sub}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </>
                    )}
                </div>
                <div className="flex items-center space-x-3">
                   {/* View mode toggle (Nippon) */}
                   {company === 'Nippon' && (
                       <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
                           <button onClick={() => setViewMode('flat')}
                               title="Flat list view"
                               className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${viewMode === 'flat' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                               <List size={13}/> List
                           </button>
                           <button onClick={() => setViewMode('grouped')}
                               title="Group by category"
                               className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${viewMode === 'grouped' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                               <LayoutGrid size={13}/> Grouped
                           </button>
                       </div>
                   )}
                   <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl text-xs font-bold border border-blue-100 flex items-center space-x-2">
                      <Box size={14}/> <span>Consignment: {items.reduce((s,i) => s+(i.consignmentQty || 0), 0)}</span>
                   </div>
                </div>
             </div>
             
             {/* Low Stock Alert Banner */}
             {lowStockAlerts.length > 0 && (
               <div className="px-6 py-3 bg-red-50 border-b border-red-100 flex items-center gap-3">
                 <AlertTriangle size={15} className="text-red-500 shrink-0"/>
                 <div className="flex items-center gap-3 flex-wrap">
                   <span className="text-xs font-black text-red-700 uppercase">
                     {lowStockAlerts.filter(a => a.alertLevel === 'red').length} Critical · {lowStockAlerts.filter(a => a.alertLevel === 'orange').length} Low
                   </span>
                   {lowStockAlerts.slice(0,5).map(a => (
                     <span key={a.item.id} className={`text-[9px] font-black px-2 py-0.5 rounded-full ${a.alertLevel === 'red' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                       {a.item.name.slice(0,20)} — {a.unrestrictedQty.toFixed(0)} {a.item.unit}
                     </span>
                   ))}
                   {lowStockAlerts.length > 5 && <span className="text-[9px] text-red-400 font-bold">+{lowStockAlerts.length - 5} more</span>}
                 </div>
               </div>
             )}

             {/* Render a single item row — reused by flat AND grouped views */}
             {(() => {
               const renderRow = (item: StoreItem) => {
                 const product = allProducts.find(p => p.id === item.id);
                 const hasImportSpecs = product && (product.finishColor || product.direction || product.tongueLength);
                 const currencySymbol = 'PKR';
                 const sqftPerSheet = product?.sheetSize ? (() => {
                   const [w, h] = (product.sheetSize || '').split('x').map(Number);
                   return w && h ? Number(((w * h) / 144).toFixed(3)) : 0;
                 })() : 0;
                 const sheetCount = sqftPerSheet > 0 ? Math.round((item.unrestrictedQty || 0) / sqftPerSheet) : null;

                 return (
                   <tr key={item.id} className="hover:bg-slate-50 group">
                     <td className="px-6 py-4">
                       {product?.imageUrl ? (
                         <img src={product.imageUrl} alt="img" className="w-10 h-10 rounded border object-cover"/>
                       ) : (
                         <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center text-slate-300"><ImageIcon size={16}/></div>
                       )}
                     </td>
                     <td className="px-6 py-4">
                       <p className="font-black text-blue-600 text-xs uppercase">{product?.modelNo || item.id}</p>
                     </td>
                     <td className="px-6 py-4">
                       <p className="font-bold text-slate-700 text-xs uppercase">{item.name}</p>
                       <div className="flex gap-1 mt-1 flex-wrap">
                         {product?.mainCategory && (
                           <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[9px] font-black uppercase border border-blue-100">{product.mainCategory}</span>
                         )}
                         {product?.subCategory && (
                           <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-black uppercase">{product.subCategory}</span>
                         )}
                       </div>
                     </td>
                     <td className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase">
                       {hasImportSpecs ? (
                         <span>{product?.finishColor || '-'} <span className="text-slate-300">|</span> {product?.direction || '-'} <span className="text-slate-300">|</span> {product?.tongueLength || '-'}</span>
                       ) : (
                         <span className="text-slate-300">-</span>
                       )}
                     </td>
                     <td className="px-6 py-4">
                       {item.storageBin && item.storageBin !== 'MAIN' ? (
                         <span className="text-[10px] font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 uppercase">{item.storageBin}</span>
                       ) : (
                         <span className="text-[10px] text-slate-300">—</span>
                       )}
                     </td>
                     <td className="px-6 py-4 text-right">
                       {sheetCount !== null ? (
                         <span className="font-black text-slate-700 text-sm">{sheetCount}</span>
                       ) : (
                         <span className="text-[9px] text-slate-300">—</span>
                       )}
                     </td>
                     <td className="px-6 py-4 text-right font-black text-slate-900 text-base">
                       <div className="flex items-center justify-end gap-2">
                         {lowStockMap[item.id] && (
                           <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${lowStockMap[item.id] === 'red' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                             {lowStockMap[item.id] === 'red' ? '⚠ Critical' : '⚡ Low'}
                           </span>
                         )}
                         {(item.unrestrictedQty || 0).toLocaleString()} <span className="text-[10px] text-slate-400">{item.unit}</span>
                       </div>
                     </td>
                     <td className="px-6 py-4 text-right">
                       <p className="text-xs font-black text-emerald-600">{currencySymbol} {(item.movingAveragePrice || 0).toLocaleString()}</p>
                     </td>
                     <td className="px-6 py-4 text-right">
                       <p className="text-xs font-black text-blue-700">{currencySymbol} {(item.totalValue || 0).toLocaleString()}</p>
                     </td>
                   </tr>
                 );
               };

               const tableHeader = (
                 <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400">
                   <tr>
                     <th className="px-6 py-4">Visual</th>
                     <th className="px-6 py-4">Item & Code</th>
                     <th className="px-6 py-4">Description</th>
                     <th className="px-6 py-4">Specs (Color/Dir/Tng)</th>
                     <th className="px-6 py-4">Location</th>
                     <th className="px-6 py-4 text-right">Sheets</th>
                     <th className="px-6 py-4 text-right">Balance Qty</th>
                     <th className="px-6 py-4 text-right">Unit Price</th>
                     <th className="px-6 py-4 text-right">Amount</th>
                   </tr>
                 </thead>
               );

               if (viewMode === 'grouped' && grouped) {
                 return (
                   <div className="flex-1 overflow-x-auto">
                     {grouped.length === 0 && (
                       <div className="py-20 text-center text-slate-300 font-bold uppercase italic">No items found matching your filters.</div>
                     )}
                     {grouped.map(g => (
                       <div key={g.main} className="border-b border-slate-100">
                         {/* Main category banner */}
                         <div className="bg-blue-50 px-6 py-3 border-b border-blue-100 flex items-center justify-between">
                           <h3 className="font-black text-blue-800 text-sm uppercase tracking-widest">{g.main}</h3>
                           <span className="text-[10px] font-bold text-blue-600 uppercase">{g.total} items</span>
                         </div>
                         {g.subs.map(([sub, subItems]) => (
                           <div key={sub}>
                             {/* Sub-category banner */}
                             <div className="bg-slate-50/80 px-6 py-2 border-b border-slate-100">
                               <h4 className="text-[11px] font-black text-slate-600 uppercase">{sub} <span className="text-slate-400 font-bold">· {subItems.length}</span></h4>
                             </div>
                             <table className="w-full text-left">
                               {tableHeader}
                               <tbody className="divide-y divide-slate-100">
                                 {subItems.map(renderRow)}
                               </tbody>
                             </table>
                           </div>
                         ))}
                       </div>
                     ))}
                   </div>
                 );
               }

               return (
                 <>
                   <div className="flex-1 overflow-x-auto">
                     <table className="w-full text-left">
                       {tableHeader}
                       <tbody className="divide-y divide-slate-100">
                         {paginatedItems.map(renderRow)}
                         {paginatedItems.length === 0 && (
                           <tr><td colSpan={9} className="text-center py-20 text-slate-300 font-bold uppercase italic">No items found matching your filters.</td></tr>
                         )}
                       </tbody>
                     </table>
                   </div>
                   <Pagination
                     totalItems={filteredItems.length}
                     itemsPerPage={itemsPerPage}
                     currentPage={currentPage}
                     onPageChange={setCurrentPage}
                   />
                 </>
               );
             })()}
          </div>
        </div>
    );
};

export default React.memo(StockOverview);
