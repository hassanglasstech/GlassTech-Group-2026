
import React, { useState, useMemo } from 'react';
import { useDebounce } from '@/modules/shared/hooks/useDebounce';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useAuthStore } from '@/modules/auth/authStore';
import { StoreItem } from '@/modules/shared/types';
import { SalesService } from '@/modules/sales/services/salesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { AlertTriangle, LayoutGrid, List, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { Search, Box, Image as ImageIcon, Filter, ClipboardCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import Pagination from '@/components/Pagination';

// Material Master v3 — supplier-aligned KinLong taxonomy (8 groups, domain order).
const MAIN_ORDER = [
    'Handles', 'Hinges & Stays', 'Locking System', 'Sliding & Lift System',
    'Profiles & Point-Fixing', 'Door Closing', 'Sealants', 'Fasteners & Consumables',
];

type StockSortKey = 'code' | 'name' | 'qty' | 'price' | 'value';

interface StockOverviewProps {
    items: StoreItem[];
    searchTerm: string;
    setSearchTerm: (val: string) => void;
    onStockUpdate?: () => void;
}

const StockOverview: React.FC<StockOverviewProps> = ({ items, searchTerm, setSearchTerm, onStockUpdate }) => {
    const company = useAppStore(state => state.selectedCompany);
    const stampUser = useAuthStore(s => s.profile?.fullName || s.profile?.email || s.user?.email || 'user');
    const [mainFilter, setMainFilter] = useState('All');
    const [subFilter, setSubFilter]   = useState('All');
    const [currentPage, setCurrentPage] = useState(1);
    // Default to grouped view for Nippon (category-rich); flat for others.
    const [viewMode, setViewMode] = useState<'flat' | 'grouped'>(company === 'Nippon' ? 'grouped' : 'flat');
    const [sortConfig, setSortConfig] = useState<{ key: StockSortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
    const [lowStockOnly, setLowStockOnly] = useState(false);
    const [needsCountOnly, setNeedsCountOnly] = useState(false);
    const itemsPerPage = 20;
    const isNippon = company === 'Nippon';

    // Inventory bootstrap: items at or below zero need a physical stock-take.
    const needsCountIds = useMemo(
        () => new Set(items.filter(i => (i.unrestrictedQty ?? i.quantity ?? 0) <= 0).map(i => i.id)),
        [items]
    );

    const handleStockTake = (item: StoreItem) => {
        const entered = window.prompt(`Stock-take — ${item.name}\n\nEnter the physical quantity on the shelf right now:`, '');
        if (entered === null) return;
        const count = Number(entered);
        if (!Number.isFinite(count) || count < 0) { toast.error('Enter a valid quantity (0 or more).'); return; }
        const { opening, sold } = InventoryService.recordStockCount(item.id, count, stampUser);
        toast.success(
            sold > 0
                ? `Opening recorded: ${opening} (counted ${count} + ${sold} already sold). On-hand set to ${count}.`
                : `On-hand set to ${count} for ${item.name}.`
        );
        onStockUpdate?.();
    };

    const requestSort = (key: StockSortKey) => {
        setSortConfig(prev => prev.key === key
            ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
            : { key, dir: 'asc' });
    };

    // Memoize product list + an id→product map (was an O(n×m) .find per row, per render).
    // Company-scoped: orphan detection gates a permanent cloud delete, so the
    // product set it's derived from must never include other companies' rows.
    const allProducts = useMemo(() => SalesService.getProducts().filter(p => p.company === company), [company, items]);
    const productMap = useMemo(() => {
        const m = new Map<string, ReturnType<typeof SalesService.getProducts>[number]>();
        for (const p of allProducts) m.set(p.id, p);
        return m;
    }, [allProducts]);

    // Orphan stock rows — a store_item with no matching product. They can't be
    // edited in Material Master, so they're cleaned (deleted) from here instead.
    const orphanIds = useMemo(
        () => items.filter(i => !productMap.has(i.id)).map(i => i.id),
        [items, productMap]
    );

    const handleDeleteOrphan = async (item: StoreItem) => {
        if (!window.confirm(`Remove "${item.name}" from stock?\n\nThis row has no product in the Material Master, so it can't be edited — only removed.`)) return;
        await InventoryService.deleteStoreItems([item.id]);
        toast.success(`Removed "${item.name}" from stock.`);
        onStockUpdate?.();
    };

    const handleCleanOrphans = async () => {
        if (!orphanIds.length) return;
        if (!window.confirm(`Remove ${orphanIds.length} orphan stock row(s)?\n\nThese have no product in the Material Master and can't be edited — only removed. Counted/real items are not affected.`)) return;
        await InventoryService.deleteStoreItems(orphanIds);
        toast.success(`Removed ${orphanIds.length} orphan stock row(s).`);
        onStockUpdate?.();
    };

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
        const ordered = new Map<string, string[]>();
        for (const m of MAIN_ORDER) if (tree.has(m)) ordered.set(m, [...tree.get(m)!].sort());
        for (const [m, subs] of tree) if (!ordered.has(m)) ordered.set(m, [...subs].sort());
        return ordered;
    }, [allProducts, company]);

    const availableSubs = useMemo(() => {
        if (mainFilter === 'All') return [];
        return categoryTree.get(mainFilter) || [];
    }, [mainFilter, categoryTree]);

    // Phase 11 — Low stock alerts.
    // For Nippon, exclude items that are simply not-yet-stocked (qty ≤ 0, in the
    // "needs count" set): a brand-new item at 0 isn't "critically low", it's setup-
    // pending. Keeps the red low-stock banner meaningful instead of screaming about
    // every un-received item. Glass keeps the full list (0 = genuine stockout there).
    const lowStockAlerts = useMemo(() => {
      const raw = InventoryService.getLowStockItems(company);
      return isNippon ? raw.filter(a => !needsCountIds.has(a.item.id)) : raw;
    }, [items, company, isNippon, needsCountIds]);
    const lowStockMap: Record<string, 'red' | 'orange'> = {};
    lowStockAlerts.forEach(a => { lowStockMap[a.item.id] = a.alertLevel; });

    // Reset pagination when any filter / sort / view changes
    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, mainFilter, subFilter, lowStockOnly, needsCountOnly, sortConfig, viewMode]);

    // Reset subFilter when mainFilter changes — a sub selected under one
    // main should not silently linger when the user switches main.
    React.useEffect(() => {
        setSubFilter('All');
    }, [mainFilter]);

    const filteredItems = useMemo(() => {
        const q = searchTerm.toLowerCase().trim();
        const result = items.filter(i => {
            const product = productMap.get(i.id);
            // Find by any handle — same coverage as the quotation picker:
            // name, id, ERP model no, item/KinLong codes, brand, nick, description.
            const haystack = [
                i.name, i.id,
                product?.name, product?.description,
                product?.modelNo, product?.itemCode, product?.profileCode,
                product?.brand,
                (product as { nickName?: string } | undefined)?.nickName,
            ].filter(Boolean).join(' ').toLowerCase();
            const matchesSearch = !q || haystack.includes(q);
            const matchesMain = mainFilter === 'All' || product?.mainCategory === mainFilter;
            const matchesSub  = subFilter  === 'All' || product?.subCategory  === subFilter;
            const matchesLow  = !lowStockOnly || !!lowStockMap[i.id];
            const matchesCount = !needsCountOnly || needsCountIds.has(i.id);
            return matchesSearch && matchesMain && matchesSub && matchesLow && matchesCount;
        });

        // Sort
        const { key, dir } = sortConfig;
        const factor = dir === 'asc' ? 1 : -1;
        const valOf = (i: StoreItem): string | number => {
            const p = productMap.get(i.id);
            switch (key) {
                case 'code':  return (p?.modelNo || i.id).toLowerCase();
                case 'qty':   return i.unrestrictedQty || 0;
                case 'price': return i.movingAveragePrice || 0;
                case 'value': return i.totalValue || 0;
                default:      return (i.name || '').toLowerCase();
            }
        };
        return result.sort((a, b) => {
            const va = valOf(a), vb = valOf(b);
            if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
            return String(va).localeCompare(String(vb)) * factor;
        });
    }, [items, searchTerm, mainFilter, subFilter, lowStockOnly, needsCountOnly, needsCountIds, sortConfig, productMap]);

    // Flat view paginates. Grouped view is a browse-by-category surface — it
    // renders the FULL filtered set so each category banner's count is truthful
    // and a category is never split across pages (the catalog is bounded ~185 rows).
    const pagedItems = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredItems.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredItems, currentPage]);

    // Total stock valuation for the current filter — what the owner most wants
    // at a glance ("what's my inventory worth"). Respects search + category filters.
    const totalValuation = useMemo(
        () => filteredItems.reduce((s, i) => s + (i.totalValue || 0), 0),
        [filteredItems]
    );
    const totalConsignment = useMemo(
        () => filteredItems.reduce((s, i) => s + (i.consignmentQty || 0), 0),
        [filteredItems]
    );

    // Group the full filtered set by main_category → sub_category (grouped view).
    const grouped = useMemo(() => {
        if (viewMode !== 'grouped') return null;
        const tree: Record<string, Record<string, StoreItem[]>> = {};
        for (const item of filteredItems) {
            const product = productMap.get(item.id);
            const main = product?.mainCategory?.trim() || 'Uncategorized';
            const sub  = product?.subCategory?.trim()  || 'General';
            if (!tree[main]) tree[main] = {};
            if (!tree[main][sub]) tree[main][sub] = [];
            tree[main][sub].push(item);
        }
        const orderedMains = [
            ...MAIN_ORDER.filter(m => m in tree),
            ...Object.keys(tree).filter(m => !MAIN_ORDER.includes(m)).sort(),
        ];
        return orderedMains.map(main => ({
            main,
            subs: Object.entries(tree[main]).sort(([a],[b]) => a.localeCompare(b)),
            total: Object.values(tree[main]).flat().length,
        }));
    }, [filteredItems, productMap, viewMode]);

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
                   {/* Needs stock-taking toggle (Nippon bootstrap) */}
                   {isNippon && needsCountIds.size > 0 && (
                       <button
                           onClick={() => setNeedsCountOnly(v => !v)}
                           title="Items at or below zero — do a physical count"
                           className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border flex items-center gap-1.5 transition-all ${needsCountOnly ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'}`}>
                           <ClipboardCheck size={13}/> {needsCountOnly ? 'Show all' : `Needs count (${needsCountIds.size})`}
                       </button>
                   )}
                   {/* Clean orphan rows (Nippon) — store rows with no product */}
                   {isNippon && orphanIds.length > 0 && (
                       <button
                           onClick={handleCleanOrphans}
                           title="Remove stock rows that have no product in the Material Master"
                           className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border flex items-center gap-1.5 transition-all bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100">
                           <Trash2 size={13}/> Clean orphans ({orphanIds.length})
                       </button>
                   )}
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
                   <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl text-xs font-black border border-emerald-100 flex items-center space-x-2" title="Total valuation of the items currently shown">
                      <span>Value: PKR {Math.round(totalValuation).toLocaleString()}</span>
                   </div>
                   {totalConsignment > 0 && (
                     <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl text-xs font-bold border border-blue-100 flex items-center space-x-2">
                        <Box size={14}/> <span>Consignment: {totalConsignment.toLocaleString()}</span>
                     </div>
                   )}
                </div>
             </div>
             
             {/* Low Stock Alert Banner — click to filter the table to low-stock items */}
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
                   <button
                     onClick={() => setLowStockOnly(v => !v)}
                     className={`text-[9px] font-black px-2.5 py-0.5 rounded-full border uppercase tracking-widest transition-all ${lowStockOnly ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-600 border-red-200 hover:bg-red-100'}`}
                   >
                     {lowStockOnly ? '✕ Show all' : `Show only low (${lowStockAlerts.length})`}
                   </button>
                 </div>
               </div>
             )}

             {/* Render a single item row — reused by flat AND grouped views */}
             {(() => {
               const renderRow = (item: StoreItem) => {
                 const product = productMap.get(item.id);
                 const nick = (product as { nickName?: string } | undefined)?.nickName || '';
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
                       {isNippon && product?.profileCode && (
                         <p className="font-mono text-[9px] text-slate-400 uppercase mt-0.5">KL: {product.profileCode}</p>
                       )}
                     </td>
                     <td className="px-6 py-4">
                       <p className="font-bold text-slate-700 text-xs uppercase">{item.name}</p>
                       {nick && <p className="text-[9px] font-bold text-amber-600 uppercase mt-0.5">≈ {nick}</p>}
                       <div className="flex gap-1 mt-1 flex-wrap">
                         {product?.mainCategory && (
                           <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[9px] font-black uppercase border border-blue-100">{product.mainCategory}</span>
                         )}
                         {product?.subCategory && (
                           <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-black uppercase">{product.subCategory}</span>
                         )}
                         {isNippon && !product && (
                           <span className="inline-block px-2 py-0.5 bg-rose-50 text-rose-600 rounded text-[9px] font-black uppercase border border-rose-100" title="This stock row has no matching product in the master">No product link</span>
                         )}
                         {isNippon && product && !product.mainCategory && (
                           <span className="inline-block px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-[9px] font-black uppercase border border-amber-100" title="Set a Material Group for this product in Material Master">No group</span>
                         )}
                       </div>
                     </td>
                     {/* Glass specs column — hidden for Nippon (the old "Status" here
                         showed an import-reconciliation artifact, not inventory data). */}
                     {!isNippon && (
                       <td className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase">
                         {(product?.finishColor || product?.direction || product?.tongueLength) ? (
                           <span>{product?.finishColor || '-'} <span className="text-slate-300">|</span> {product?.direction || '-'} <span className="text-slate-300">|</span> {product?.tongueLength || '-'}</span>
                         ) : (
                           <span className="text-slate-300">-</span>
                         )}
                       </td>
                     )}
                     {!isNippon && (
                       <td className="px-6 py-4">
                         {item.storageBin && item.storageBin !== 'MAIN' ? (
                           <span className="text-[10px] font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 uppercase">{item.storageBin}</span>
                         ) : (
                           <span className="text-[10px] text-slate-300">—</span>
                         )}
                       </td>
                     )}
                     {!isNippon && (
                       <td className="px-6 py-4 text-right">
                         {sheetCount !== null ? (
                           <span className="font-black text-slate-700 text-sm">{sheetCount}</span>
                         ) : (
                           <span className="text-[9px] text-slate-300">—</span>
                         )}
                       </td>
                     )}
                     <td className="px-6 py-4 text-right text-base">
                       <div className="flex items-center justify-end gap-2">
                         {lowStockMap[item.id] && (
                           <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${lowStockMap[item.id] === 'red' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                             {lowStockMap[item.id] === 'red' ? '⚠ Critical' : '⚡ Low'}
                           </span>
                         )}
                         <span className={`font-black ${(item.unrestrictedQty ?? 0) < 0 ? 'text-red-600' : 'text-slate-900'}`}>{(item.unrestrictedQty || 0).toLocaleString()}</span>
                         <span className="text-[10px] text-slate-400">{item.unit}</span>
                         {isNippon && (
                           <button onClick={() => handleStockTake(item)} title="Record physical stock count"
                             className="ml-1 p-1 rounded border border-amber-200 text-amber-600 hover:bg-amber-50 transition-all">
                             <ClipboardCheck size={12}/>
                           </button>
                         )}
                         {isNippon && !product && (
                           <button onClick={() => handleDeleteOrphan(item)} title="No product in Material Master — remove this stock row"
                             className="p-1 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 transition-all">
                             <Trash2 size={12}/>
                           </button>
                         )}
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

               // Sortable column header
               const sortable = (label: string, k: StockSortKey, right = false) => {
                 const active = sortConfig.key === k;
                 return (
                   <th onClick={() => requestSort(k)} className={`px-6 py-4 cursor-pointer select-none hover:text-slate-600 transition-colors ${right ? 'text-right' : ''}`} title={`Sort by ${label}`}>
                     <span className={`inline-flex items-center gap-1 ${active ? 'text-blue-600' : ''}`}>
                       {label}
                       {active ? (sortConfig.dir === 'asc' ? <ArrowUp size={10}/> : <ArrowDown size={10}/>) : <ArrowUpDown size={10} className="opacity-25"/>}
                     </span>
                   </th>
                 );
               };

               const colCount = isNippon ? 6 : 9;
               const tableHeader = (
                 <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400">
                   <tr>
                     <th className="px-6 py-4">Visual</th>
                     {sortable('Item & Code', 'code')}
                     {sortable('Description', 'name')}
                     {!isNippon && <th className="px-6 py-4">Specs (Color/Dir/Tng)</th>}
                     {!isNippon && <th className="px-6 py-4">Location</th>}
                     {!isNippon && <th className="px-6 py-4 text-right">Sheets</th>}
                     {sortable('Balance Qty', 'qty', true)}
                     {sortable('Unit Price', 'price', true)}
                     {sortable('Amount', 'value', true)}
                   </tr>
                 </thead>
               );

               if (viewMode === 'grouped' && grouped) {
                 return (
                   <>
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
                   {/* Grouped view shows the full filtered set (browse-by-category),
                       so no row pagination — category banners are the navigation. */}
                   </>
                 );
               }

               return (
                 <>
                   <div className="flex-1 overflow-x-auto">
                     <table className="w-full text-left">
                       {tableHeader}
                       <tbody className="divide-y divide-slate-100">
                         {pagedItems.map(renderRow)}
                         {pagedItems.length === 0 && (
                           <tr><td colSpan={colCount} className="text-center py-20 text-slate-300 font-bold uppercase italic">No items found matching your filters.</td></tr>
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
