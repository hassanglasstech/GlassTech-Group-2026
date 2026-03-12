import React, { useState, useMemo } from 'react';
import { StoreItem } from '@/modules/shared/types';
import { SalesService } from '@/modules/sales/services/salesService';
import { Search, Box, Image as ImageIcon, Filter } from 'lucide-react';
import Pagination from '@/components/Pagination';

interface StockOverviewProps {
    items: StoreItem[];
    searchTerm: string;
    setSearchTerm: (val: string) => void;
}

const StockOverview: React.FC<StockOverviewProps> = ({ items, searchTerm, setSearchTerm }) => {
    const [typeFilter, setTypeFilter] = useState('All');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;
    
    const allProducts = SalesService.getProducts();

    // Reset pagination when filter changes
    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, typeFilter]);

    const filteredItems = useMemo(() => {
        return items.filter(i => {
            const product = allProducts.find(p => p.id === i.id);
            const matchesSearch = i.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesType = typeFilter === 'All' || product?.subCategory === typeFilter;
            return matchesSearch && matchesType;
        });
    }, [items, searchTerm, typeFilter, allProducts]);

    const paginatedItems = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredItems.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredItems, currentPage]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[600px]">
             <div className="p-8 border-b flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center space-x-4">
                    <div className="relative w-80">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input type="text" placeholder="Filter Inventory..." className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </div>
                    {/* Nippon Specific Filter */}
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <select 
                            className="pl-10 pr-8 py-3 bg-white border border-slate-200 rounded-xl font-bold text-xs uppercase outline-none cursor-pointer hover:border-blue-300 transition-all appearance-none"
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                        >
                            <option value="All">All Types</option>
                            <option value="Handle">Handles</option>
                            <option value="Hinge">Hinges</option>
                            <option value="Lock">Locks</option>
                            <option value="Roller">Rollers</option>
                            <option value="Spider Fitting">Spiders</option>
                            <option value="Mesh">Meshes</option>
                            <option value="Accessory">Accessories</option>
                        </select>
                    </div>
                </div>
                <div className="flex space-x-4">
                   <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl text-xs font-bold border border-blue-100 flex items-center space-x-2">
                      <Box size={14}/> <span>Consignment: {items.reduce((s,i) => s+(i.consignmentQty || 0), 0)}</span>
                   </div>
                </div>
             </div>
             
             <div className="flex-1 overflow-x-auto">
                 <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400">
                       <tr>
                          <th className="px-6 py-4">Visual</th>
                          <th className="px-6 py-4">Item & Code</th>
                          <th className="px-6 py-4">Description</th>
                          <th className="px-6 py-4">Specs (Color/Dir/Tng)</th>
                          <th className="px-6 py-4 text-right">Balance Qty</th>
                          <th className="px-6 py-4 text-right">Unit Price</th>
                          <th className="px-6 py-4 text-right">Amount</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {paginatedItems.map(item => {
                         const product = allProducts.find(p => p.id === item.id);
                         const hasImportSpecs = product && (product.finishColor || product.direction || product.tongueLength);
                         const currencySymbol = '¥';
                         
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
                               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{item.storageBin}</p>
                            </td>
                            <td className="px-6 py-4">
                                <p className="font-bold text-slate-700 text-xs uppercase">{item.name}</p>
                                {product?.subCategory && (
                                    <span className="inline-block mt-1 px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-black uppercase">{product.subCategory}</span>
                                )}
                            </td>
                            <td className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase">
                                {hasImportSpecs ? (
                                    <span>{product?.finishColor || '-'} <span className="text-slate-300">|</span> {product?.direction || '-'} <span className="text-slate-300">|</span> {product?.tongueLength || '-'}</span>
                                ) : (
                                    <span className="text-slate-300">-</span>
                                )}
                            </td>
                            <td className="px-6 py-4 text-right font-black text-slate-900 text-base">{(item.unrestrictedQty || 0).toLocaleString()} <span className="text-[10px] text-slate-400">{item.unit}</span></td>
                            <td className="px-6 py-4 text-right">
                               <p className="text-xs font-black text-emerald-600">{currencySymbol} {(item.movingAveragePrice || 0).toLocaleString()}</p>
                            </td>
                            <td className="px-6 py-4 text-right">
                               <p className="text-xs font-black text-blue-700">{currencySymbol} {(item.totalValue || 0).toLocaleString()}</p>
                            </td>
                         </tr>
                       )})}
                       {paginatedItems.length === 0 && (
                           <tr><td colSpan={7} className="text-center py-20 text-slate-300 font-bold uppercase italic">No items found matching your filters.</td></tr>
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
          </div>
        </div>
    );
};

export default StockOverview;
