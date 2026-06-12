
import React from 'react';
import { Product, StoreItem } from '@/modules/shared/types';
import { SalesService } from '@/modules/sales/services/salesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { Database, RefreshCw, AlertTriangle, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';
import { KINLONG_MASTER_V3 } from '@/modules/sales/companies/nippon/data/kinlongMasterV3';

// Material Master v3.0 — supplier-aligned KinLong catalogue (124 products, 8 groups).
// Single source of truth lives in kinlongMasterV3.ts (auto-generated from the
// FINAL xlsx). Dual coding: modelNo = ERP Model No, profileCode = KinLong Doc Code.
const KINLONG_DATA = KINLONG_MASTER_V3;

const statusBadge = (s: string): string => {
    if (s === 'Exact Match') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (s === 'Near-Match')  return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-blue-50 text-blue-700 border-blue-200'; // ERP Only
};

const NipponKinLongSeeder: React.FC = () => {
    const handleResetAndSeed = async () => {
        if (!await confirmModal(`CRITICAL ACTION: This will DELETE all existing 'Nippon' items from the Product Master and replace them with the ${KINLONG_DATA.length} KinLong-aligned items (Material Master v3.0).\n\nAre you sure you want to proceed?`)) return;

        // 1. Get Current Products
        const allProducts = SalesService.getProducts();

        // 2. Filter OUT Nippon Products (Preserve GTK, GTI, etc.)
        const preservedProducts = allProducts.filter(p => p.company !== 'Nippon');

        // 3. Create New Nippon Products from the v3 master
        const newNipponProducts: Product[] = KINLONG_DATA.map((item): Product => ({
            id: item.id,
            company: 'Nippon',
            category: 'Hardware',
            description: item.description,
            modelNo: item.modelNo,            // ERP Model No
            profileCode: item.profileCode,    // KinLong Doc Code
            brand: item.brand,
            mainCategory: item.mainCategory,   // Material Group (8-group taxonomy)
            subCategory: item.subCategory,     // Sub-Group
            costPrice: item.costPrice,
            basePrice: item.basePrice,
            unit: item.unit as any,
            finishColor: item.finishColor,
            material: item.material,
            tongueLength: item.tongueLength,
            spindleLength: item.spindleLength,
            direction: item.direction,
            subDescription: item.subDescription,
            technicalSpecs: item.technicalSpecs, // carries matchStatus + extra specs
            variants: [],
        }));

        // 4. Save Combined List
        SalesService.saveProducts([...preservedProducts, ...newNipponProducts]);

        // 5. Also Initialize Store Items for them (Zero Stock)
        const allStore = InventoryService.getStore();
        const preservedStore = allStore.filter(s => s.company !== 'Nippon');

        const newStoreItems: StoreItem[] = newNipponProducts.map(p => ({
            id: p.id,
            company: 'Nippon',
            name: p.description,
            category: p.category as any,
            quantity: 0, unrestrictedQty: 0, qiQty: 0, blockedQty: 0, reservedQty: 0, consignmentQty: 0,
            unit: p.unit,
            minLevel: 10, reorderPoint: 5, movingAveragePrice: p.costPrice || 0, totalValue: 0,
            storageBin: 'New', lastMovementDate: new Date().toISOString()
        }));

        InventoryService.saveStore([...preservedStore, ...newStoreItems]);

        toast.success(`Nippon Item Master reset and populated with ${newNipponProducts.length} KinLong items (v3.0).`);
        // Force refresh via window reload
        setTimeout(() => window.location.reload(), 1500);
    };

    const handleExportCatalog = () => {
        const exportData = KINLONG_DATA.map(item => ({
            'ERP Model No': item.modelNo,
            'KinLong Doc Code': item.profileCode,
            'Description': item.description,
            'Brand': item.brand,
            'Material Group': item.mainCategory,
            'Sub-Group': item.subCategory,
            'Unit': item.unit,
            'Cost (PKR)': item.costPrice,
            'Sales (PKR)': item.basePrice,
            'Finish': item.finishColor || '-',
            'Material': item.material || '-',
            'Status': item.matchStatus,
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "KinLong_Master_v3");
        XLSX.writeFile(wb, "Nippon_KinLong_Master_v3.xlsx");
    };

    // Group counts for the summary strip
    const groupCounts = KINLONG_DATA.reduce<Record<string, number>>((acc, item) => {
        acc[item.mainCategory] = (acc[item.mainCategory] || 0) + 1;
        return acc;
    }, {});

    return (
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-10 animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h2 className="text-3xl font-black uppercase text-slate-800 tracking-tight">Kin Long Data Import</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Nippon Hardware · Material Master v3.0</p>
                </div>
                <div className="flex items-center space-x-3">
                    <button onClick={handleExportCatalog} className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-xs font-bold uppercase flex items-center space-x-2 hover:bg-slate-50 transition-all shadow-sm">
                        <Download size={16}/> <span>Export List</span>
                    </button>
                    <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center space-x-2 border border-blue-100">
                        <Database size={16}/> <span>System Utility</span>
                    </div>
                </div>
            </div>

            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 mb-8">
                <div className="flex items-start space-x-4">
                    <AlertTriangle className="text-amber-500 shrink-0" size={24}/>
                    <div>
                        <h4 className="text-sm font-black text-slate-800 uppercase mb-1">Overwrite Warning</h4>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            This action <strong>initializes</strong> the Nippon catalogue. It permanently removes any
                            existing products linked to the 'Nippon' company and replaces them with the supplier-aligned
                            KinLong master ({KINLONG_DATA.length} SKUs across 8 material groups).
                            <br/><br/>
                            <strong>Dual coding:</strong> each item carries both an ERP Model No and the KinLong Doc Code
                            seen on supplier quotations — GRN matches by KinLong code, posts by ERP code.
                        </p>
                    </div>
                </div>
            </div>

            {/* Group summary strip */}
            <div className="flex flex-wrap gap-2 mb-6">
                {Object.entries(groupCounts).map(([g, n]) => (
                    <span key={g} className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-[10px] font-black uppercase text-slate-600 tracking-wide">
                        {g} · {n}
                    </span>
                ))}
            </div>

            <div className="space-y-4">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-2">Preview Data ({KINLONG_DATA.length} Items)</h4>
                <div className="h-64 overflow-y-auto border rounded-xl">
                    <table className="w-full text-left sap-table">
                        <thead className="bg-slate-100 text-[9px] font-black uppercase text-slate-500 sticky top-0">
                            <tr>
                                <th className="px-4 py-2">ERP Model</th>
                                <th className="px-4 py-2">KinLong Code</th>
                                <th className="px-4 py-2">Description</th>
                                <th className="px-4 py-2">Group</th>
                                <th className="px-4 py-2">Status</th>
                                <th className="px-4 py-2 text-right">Rate (PKR)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {KINLONG_DATA.map((item, i) => (
                                <tr key={i} className="hover:bg-slate-50 border-b border-slate-50">
                                    <td className="px-4 py-2 text-xs font-black text-blue-600">{item.modelNo}</td>
                                    <td className="px-4 py-2 text-[10px] font-mono font-bold text-indigo-500">{item.profileCode || '-'}</td>
                                    <td className="px-4 py-2 text-[10px] font-bold text-slate-700">{item.description}</td>
                                    <td className="px-4 py-2 text-[10px] uppercase text-slate-500">{item.mainCategory}</td>
                                    <td className="px-4 py-2">
                                        <span className={`px-2 py-0.5 rounded border text-[8px] font-black uppercase ${statusBadge(item.matchStatus)}`}>{item.matchStatus}</span>
                                    </td>
                                    <td className="px-4 py-2 text-[10px] font-black text-right">{item.costPrice?.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="mt-8 pt-8 border-t flex justify-end">
                <button
                    onClick={handleResetAndSeed}
                    className="bg-slate-900 hover:bg-emerald-600 text-white px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl transition-all flex items-center space-x-3 active:scale-95"
                >
                    <RefreshCw size={18}/> <span>Reset & Import Data</span>
                </button>
            </div>
        </div>
    );
};

export default NipponKinLongSeeder;
