
import React, { useState } from 'react';
import { Company, Product, StoreItem } from '@/modules/shared/types';
import { SalesService } from '@/modules/sales/services/salesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { Database, RefreshCw, AlertTriangle, Layers, Info, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';

const KINLONG_DATA: Partial<Product>[] = [
    // 1. HANDLES
    { modelNo: 'LCZS631', description: 'KIN LONG HANDLE (LEFT/RIGHT)', finishColor: 'Black & White', costPrice: 2100, category: 'Hardware', brand: 'Kin Long', unit: 'PCS', tongueLength: '55mm' },
    { modelNo: 'CZS133', description: 'KIN LONG HANDLE', finishColor: 'Black & White', costPrice: 2100, category: 'Hardware', brand: 'Kin Long', unit: 'PCS', tongueLength: '55mm' },
    { modelNo: 'CZS332', description: 'KIN LONG HANDLE (ADJUSTABLE)', finishColor: 'Black', direction: 'Right', costPrice: 2100, category: 'Hardware', brand: 'Kin Long', unit: 'PCS', tongueLength: '55mm' },
    { modelNo: 'CZS116AS', description: 'KIN LONG HANDLE (SPRING BOLT)', finishColor: 'Black', costPrice: 3000, category: 'Hardware', brand: 'Kin Long', unit: 'PCS', tongueLength: '54mm (Bolt)' },
    { modelNo: 'CZS160A', description: 'KIN LONG HANDLE', finishColor: 'Black & White', costPrice: 2500, category: 'Hardware', brand: 'Kin Long', unit: 'PCS', tongueLength: '55mm' },
    { modelNo: 'LCZS770', description: 'KIN LONG HANDLE', finishColor: 'Black & White', direction: 'Left/Right', costPrice: 1050, category: 'Hardware', brand: 'Kin Long', unit: 'PCS' },
    
    // 2. DOOR HANDLES
    { modelNo: 'MZS208C', description: 'DOOR HANDLE SET (W/ MSD35/I)', finishColor: 'Black & White', costPrice: 8500, category: 'Hardware', brand: 'Kin Long', unit: 'Set' },
    { modelNo: 'MZS220C', description: 'DOOR HANDLE SET (W/ MSD35/II)', finishColor: 'Black & White', costPrice: 7000, category: 'Hardware', brand: 'Kin Long', unit: 'Set' },
    { modelNo: 'MZS3208C', description: 'DOOR HANDLE SET', costPrice: 0, category: 'Hardware', brand: 'Kin Long', unit: 'Set' },
    { modelNo: 'Z201', description: 'LIFT & SLIDE HANDLE', finishColor: 'Black', costPrice: 0, category: 'Hardware', brand: 'Kin Long', unit: 'PCS' },

    // 3. HINGES & PIVOTS
    { modelNo: 'J5C', description: 'PIVOT HINGE (110KG)', material: 'Alum+SS', costPrice: 1500, category: 'Hardware', brand: 'Kin Long', unit: 'PCS' },
    { modelNo: 'T-MJ35', description: 'PIVOT HINGE (150KG)', material: 'Alum+SS', costPrice: 2050, category: 'Hardware', brand: 'Kin Long', unit: 'PCS' },
    { modelNo: 'LCJ13', description: 'WINDOW HINGE (55KG)', finishColor: 'Black', costPrice: 700, category: 'Hardware', brand: 'Kin Long', unit: 'PCS' },

    // 4. LOCKS & SOCKETS
    { modelNo: 'MCX320A', description: 'DOOR SOCKET / FLUSH BOLT (300MM)', material: 'Zinc+SS', costPrice: 950, category: 'Hardware', brand: 'Kin Long', unit: 'PCS' },
    { modelNo: 'TLS22HS', description: 'SLIDING LOCK W/ HOOK (TLS22-6)', finishColor: 'Black', costPrice: 1250, category: 'Hardware', brand: 'Kin Long', unit: 'PCS' },
    { modelNo: 'TLS21HS', description: 'SLIDING LOCK W/ HOOK (TLS12-6)', finishColor: 'Black', costPrice: 1700, category: 'Hardware', brand: 'Kin Long', unit: 'PCS' },
    { modelNo: 'CDG2370', description: 'TRANSMITTER LOCK (LIFT & SLIDE)', costPrice: 0, category: 'Hardware', brand: 'Kin Long', unit: 'PCS' },

    // 5. ROLLERS
    { modelNo: 'CML35G19', description: 'DOUBLE ROLLER (80KG)', material: 'Carbon Steel', costPrice: 650, category: 'Hardware', brand: 'Kin Long', unit: 'PCS' },
    { modelNo: 'H50B', description: 'FRONT ROLLER (LIFT & SLIDE)', material: 'Zinc Alloy', costPrice: 0, category: 'Hardware', brand: 'Kin Long', unit: 'PCS' },
    { modelNo: 'H52A', description: 'BACK ROLLER (LIFT & SLIDE)', material: 'Zinc Alloy', costPrice: 0, category: 'Hardware', brand: 'Kin Long', unit: 'PCS' },

    // 6. FRICTION STAYS (SS304)
    { modelNo: 'HC320-16', description: 'FRICTION STAY 16" (NO GROOVE)', material: 'SS304', costPrice: 1440, category: 'Hardware', brand: 'Kin Long', unit: 'Pair' },
    { modelNo: 'HC320-18', description: 'FRICTION STAY 18" (NO GROOVE)', material: 'SS304', costPrice: 1620, category: 'Hardware', brand: 'Kin Long', unit: 'Pair' },
    { modelNo: 'HCC40A-12', description: 'FRICTION STAY 12" (C GROOVE)', material: 'SS304', costPrice: 1080, category: 'Hardware', brand: 'Kin Long', unit: 'Pair' },
    { modelNo: 'HCC40A-14', description: 'FRICTION STAY 14" (C GROOVE)', material: 'SS304', costPrice: 1260, category: 'Hardware', brand: 'Kin Long', unit: 'Pair' },
    { modelNo: 'HCC40A-16', description: 'FRICTION STAY 16" (C GROOVE)', material: 'SS304', costPrice: 1440, category: 'Hardware', brand: 'Kin Long', unit: 'Pair' },

    // 7. SPIDERS & FITTINGS
    { modelNo: 'A250A4', description: '4-WAY SPIDER SET', finishColor: 'Satin', costPrice: 24000, category: 'Hardware', brand: 'Kin Long', unit: 'Set' },
    { modelNo: 'A250A2', description: '2-WAY SPIDER SET (90 DEG)', finishColor: 'Satin', costPrice: 14000, category: 'Hardware', brand: 'Kin Long', unit: 'Set' },
    { modelNo: 'A250A1', description: '1-WAY LONG SPIDER SET', finishColor: 'Satin', costPrice: 10000, category: 'Hardware', brand: 'Kin Long', unit: 'Set' },
    { modelNo: 'ATF11X', description: 'ROUTEL / CONNECTOR', finishColor: 'Satin', costPrice: 0, category: 'Hardware', brand: 'Kin Long', unit: 'PCS' },

    // 8. MESH
    { modelNo: 'GTSSM0.6', description: 'SS MESH 0.6MM', finishColor: 'Black', costPrice: 95000, category: 'Hardware', brand: 'Kin Long', unit: 'Roll' },
    { modelNo: 'GTSSM1', description: 'SS MESH 1.0MM', finishColor: 'Black', costPrice: 142500, category: 'Hardware', brand: 'Kin Long', unit: 'Roll' },
    { modelNo: 'GTSSM1.2', description: 'SS MESH 1.2MM', finishColor: 'Black', costPrice: 190000, category: 'Hardware', brand: 'Kin Long', unit: 'Roll' },
    { modelNo: 'GTSSM1.5', description: 'SS MESH 1.5MM', finishColor: 'Black', costPrice: 285000, category: 'Hardware', brand: 'Kin Long', unit: 'Roll' },

    // 9. ACCESSORIES
    { modelNo: 'LDG-194', description: 'INSULATION CONNECTING ROD', costPrice: 80, category: 'Accessory', brand: 'Kin Long', unit: 'RunningFt' },
    { modelNo: 'ZCD75X40', description: 'MAIN TRANSMISSION ROD (40MM)', material: 'SS+Zinc', costPrice: 0, category: 'Hardware', brand: 'Kin Long', unit: 'PCS' },
    { modelNo: 'HDS8', description: 'ACTIVE LOCK POINT', material: 'Zinc Alloy', costPrice: 0, category: 'Hardware', brand: 'Kin Long', unit: 'PCS' },
    { modelNo: 'SK51', description: 'LOCKING PLATE', material: 'SS', costPrice: 0, category: 'Hardware', brand: 'Kin Long', unit: 'PCS' },
    { modelNo: 'ZA1-6A', description: 'LOCKING PLATE', material: 'Zinc', costPrice: 0, category: 'Hardware', brand: 'Kin Long', unit: 'PCS' },
    { modelNo: 'CDG2370-06', description: 'SUPPORTING SOCKET', material: 'Aluminum', costPrice: 0, category: 'Accessory', brand: 'Kin Long', unit: 'PCS' },
    { modelNo: 'CDG2370-05', description: 'SUPPORTING BLOCK', material: 'Aluminum', costPrice: 0, category: 'Accessory', brand: 'Kin Long', unit: 'PCS' },
    { modelNo: 'H50-20', description: 'CUSHION BLOCK', finishColor: 'Black', costPrice: 0, category: 'Accessory', brand: 'Kin Long', unit: 'PCS' },
    { modelNo: 'H52-12', description: 'SUPPORTING BLOCK', costPrice: 0, category: 'Accessory', brand: 'Kin Long', unit: 'PCS' },
    { modelNo: 'T-FK-D', description: 'ANTI-STRIKE BLOCK', material: 'Polyamide', costPrice: 0, category: 'Accessory', brand: 'Kin Long', unit: 'PCS' },
    { modelNo: 'H52-13', description: 'WATER CAP', costPrice: 0, category: 'Accessory', brand: 'Kin Long', unit: 'PCS' },
];

const NipponKinLongSeeder: React.FC = () => {
    const handleResetAndSeed = async () => {
        if (!await confirmModal("CRITICAL ACTION: This will DELETE all existing 'Nippon' items from the Product Master and replace them with the 45+ Kin Long items extracted from the documents.\n\nAre you sure you want to proceed?")) return;

        // 1. Get Current Products
        const allProducts = SalesService.getProducts();
        
        // 2. Filter OUT Nippon Products (Preserve GTK, GTI, etc.)
        const preservedProducts = allProducts.filter(p => p.company !== 'Nippon');

        // 3. Create New Nippon Products
        const newNipponProducts: Product[] = KINLONG_DATA.map((item, index) => ({
            id: `KL-${item.modelNo}-${index}`,
            company: 'Nippon',
            category: item.category as any,
            description: item.description!,
            modelNo: item.modelNo,
            brand: 'Kin Long',
            costPrice: item.costPrice,
            basePrice: item.costPrice, // Default Sales Price = Cost Price
            unit: item.unit as any,
            finishColor: item.finishColor,
            material: item.material,
            tongueLength: item.tongueLength,
            direction: item.direction,
            variants: []
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

        toast.success("Nippon Item Master has been reset and populated with Kin Long data.");
        // Force refresh via window reload
        setTimeout(() => window.location.reload(), 1500);
    };

    const handleExportCatalog = () => {
        const exportData = KINLONG_DATA.map(item => ({
            'Model No': item.modelNo,
            'Description': item.description,
            'Category': item.category,
            'Brand': item.brand,
            'Unit': item.unit,
            'Cost Price': item.costPrice,
            'Finish': item.finishColor || '-',
            'Material': item.material || '-'
        }));
        
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "KinLong_Catalog");
        XLSX.writeFile(wb, "Nippon_KinLong_Master_List.xlsx");
    };

    return (
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-10 animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h2 className="text-3xl font-black uppercase text-slate-800 tracking-tight">Kin Long Data Import</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Nippon Hardware Division Setup</p>
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
                            This action is designed to <strong>initialize</strong> the Nippon inventory system. 
                            It will permanently remove any existing products linked to the 'Nippon' company and replace them with the standardized Kin Long catalog (45+ SKUs).
                            <br/><br/>
                            <strong>Includes:</strong> Handles, Hinges, Rollers, Friction Stays, Spider Fittings, Meshes, and Accessories.
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-2">Preview Data ({KINLONG_DATA.length} Items)</h4>
                <div className="h-64 overflow-y-auto border rounded-xl">
                    <table className="w-full text-left sap-table">
                        <thead className="bg-slate-100 text-[9px] font-black uppercase text-slate-500 sticky top-0">
                            <tr>
                                <th className="px-4 py-2">Model</th>
                                <th className="px-4 py-2">Description</th>
                                <th className="px-4 py-2">Category</th>
                                <th className="px-4 py-2 text-right">Rate (PKR)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {KINLONG_DATA.map((item, i) => (
                                <tr key={i} className="hover:bg-slate-50 border-b border-slate-50">
                                    <td className="px-4 py-2 text-xs font-black text-blue-600">{item.modelNo}</td>
                                    <td className="px-4 py-2 text-[10px] font-bold text-slate-700">{item.description}</td>
                                    <td className="px-4 py-2 text-[10px] uppercase text-slate-500">{item.category}</td>
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
