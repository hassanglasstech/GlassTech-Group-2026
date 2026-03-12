import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { toast } from 'sonner';
import { Company, Product, MaterialLedgerEntry, MvmntCode } from '@/modules/shared/types';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { SalesService } from '@/modules/sales/services/salesService';
import { Truck, X, Layers, CheckCircle2, ClipboardList, Scale, PackageCheck, Globe, DollarSign, FileUp, Image as ImageIcon, ScanLine, Loader2, FileSearch, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface GoodsReceiptMIGOProps {
    company: Company;
    products: Product[];
    isOpen: boolean;
    onClose: () => void;
    refreshData: () => void;
}

const GoodsReceiptMIGO: React.FC<Omit<GoodsReceiptMIGOProps, 'company'>> = ({ products, isOpen, onClose, refreshData }) => {
    const company = useAppStore(state => state.selectedCompany);
    const [entryMode, setEntryMode] = useState<'Manual' | 'VendorImport'>('Manual');
    // Default to General for Nippon, Glass for others
    const [migoMode, setMigoMode] = useState<'Glass' | 'General'>(company === 'Nippon' ? 'General' : 'Glass');
    const [isImportMode, setIsImportMode] = useState(false);
    
    // Vendor Import State
    const [isParsing, setIsParsing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importedItems, setImportedItems] = useState<any[]>([]);

    const [grnSelection, setGrnSelection] = useState({
        category: 'Plain', // Matches Plain, Color, Mirror, Fluted
        subCategory: 'Standard',
        color: 'N/A',
        thickness: '5mm',
        sheetSize: ''
    });
    
    const [migoData, setMigoData] = useState({
        mvmntCode: '101' as MvmntCode,
        materialId: '',
        qty: 0,
        qtyMode: 'Sheets' as 'SqFt' | 'Sheets',
        valuation: 0, 
        transportCost: 0, 
        referenceDoc: '',
        storageBin: '',
        batchNo: '',
        remarks: '',
        huId: '',
        currency: 'USD',
        exchangeRate: 278.50,
        foreignRate: 0,
        totalDuty: 0
    });

    // Reset mode when company changes if modal is persistent or re-used
    useEffect(() => {
        setMigoMode(company === 'Nippon' ? 'General' : 'Glass');
    }, [company]);

    const isMirror = grnSelection.category === 'Mirror';
    const isColor = grnSelection.category === 'Color';
    const isPlain = grnSelection.category === 'Plain';
    const isFluted = grnSelection.category === 'Fluted';

    const uniqueCategories = ['Plain', 'Color', 'Mirror', 'Fluted'];
  
    const availableSubCategories = useMemo(() => {
        if (isMirror) return ['Belgium', 'CFG', 'Euro Grey', 'Brown'];
        if (isColor) return ['One Side', 'Tinted'];
        return ['Standard'];
    }, [grnSelection.category]);

    const availableColors = useMemo(() => {
        if (isColor) {
            if (grnSelection.subCategory === 'One Side') return ['Imported Grey', 'Brown'];
            if (grnSelection.subCategory === 'Tinted') return ['Brown', 'Grey'];
        }
        return ['N/A'];
    }, [grnSelection.category, grnSelection.subCategory]);

    const uniqueThicknesses = useMemo(() => {
        const filtered = products.filter(p => 
            p.glassType === grnSelection.category && 
            (p.subCategory === grnSelection.subCategory || (availableSubCategories.length === 1 && p.subCategory === 'Standard'))
        );
        const thicknesses = Array.from(new Set(filtered.map(p => p.thickness).filter(Boolean)));
        return thicknesses.length > 0 ? thicknesses : ['5mm', '6mm', '8mm', '10mm', '12mm', '19mm'];
    }, [grnSelection.category, grnSelection.subCategory, products]);

    const generalProducts = useMemo(() => {
        return products.filter(p => p.category !== 'Glass' && p.category !== 'Service');
    }, [products]);

    // Auto-Select Material ID (Glass)
    useEffect(() => {
        if (migoMode === 'Glass' && migoData.mvmntCode === '101' && grnSelection.category && grnSelection.thickness && grnSelection.sheetSize) {
           const matchedProduct = products.find(p => 
              p.glassType === grnSelection.category && 
              (p.subCategory === grnSelection.subCategory || (availableSubCategories.length === 1 && p.subCategory === 'Standard')) &&
              p.thickness === grnSelection.thickness &&
              p.sheetSize === grnSelection.sheetSize &&
              (isColor ? p.finishColor === grnSelection.color : true)
           );
           if (matchedProduct) {
              setMigoData(prev => ({ ...prev, materialId: matchedProduct.id }));
           } else {
              setMigoData(prev => ({ ...prev, materialId: '' }));
           }
        }
    }, [grnSelection, products, migoData.mvmntCode, migoMode]);

    // Auto-fill valuation for General Items
    useEffect(() => {
        if (migoMode === 'General' && migoData.materialId && !isImportMode) {
            const prod = products.find(p => p.id === migoData.materialId);
            if (prod && prod.costPrice) {
                setMigoData(prev => ({ ...prev, valuation: prod.costPrice || 0 }));
            }
        }
    }, [migoMode, migoData.materialId, products, isImportMode]);

    // Auto-Calculate Valuation when Import Params Change
    useEffect(() => {
        if (isImportMode) {
            const basePKR = (migoData.foreignRate || 0) * (migoData.exchangeRate || 1);
            const dutyPerUnit = migoData.qty > 0 ? (migoData.totalDuty / migoData.qty) : 0;
            const finalVal = basePKR + dutyPerUnit;
            setMigoData(prev => ({ ...prev, valuation: Number(finalVal.toFixed(2)) }));
        }
    }, [isImportMode, migoData.foreignRate, migoData.exchangeRate, migoData.totalDuty, migoData.qty]);

    const handleExcelExport = () => {
        const template = [
            { 'Item Code': 'LCZS631', 'Description': 'Example Handle Black', 'Qty': 100, 'Price (RMB)': 15.50, 'Color': 'Black', 'Direction': 'Right', 'Tongue Length': '55mm' }
        ];
        const ws = XLSX.utils.json_to_sheet(template);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Import Template");
        XLSX.writeFile(wb, "Nippon_Stock_Import_Template.xlsx");
    };

    const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsParsing(true);
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const data: any[] = XLSX.utils.sheet_to_json(ws);
                const mappedItems = data.map((row, idx) => ({
                    id: `IMP-${idx}-${Date.now()}`,
                    code: row['Item Code'] || row['Code'] || 'UNKNOWN',
                    desc: row['Description'] || row['Desc'] || 'Imported Item',
                    qty: Number(row['Qty']) || Number(row['Quantity']) || 0,
                    price: Number(row['Price (RMB)']) || Number(row['Price']) || 0,
                    color: row['Color'] || '',
                    direction: row['Direction'] || '',
                    tongueLength: row['Tongue Length'] || '',
                    img: 'https://placehold.co/50x50/f1f5f9/334155?text=Img',
                    status: 'Ready'
                }));
                setImportedItems(mappedItems);
                setIsParsing(false);
                toast.success(`Successfully parsed ${mappedItems.length} items from Excel.`);
            } catch (error) {
                toast.error("Error parsing Excel file.");
                setIsParsing(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleBulkPost = () => {
        if (importedItems.length === 0) return;
        const allStore = InventoryService.getStore();
        const allLedger = InventoryService.getStockLedger();
        const allProducts = SalesService.getProducts();
        const newLedgerEntries: MaterialLedgerEntry[] = [];
        let updatedStore = [...allStore];
        let updatedProducts = [...allProducts];

        importedItems.forEach(item => {
            let prod = updatedProducts.find(p => p.modelNo === item.code);
            let storeItem = updatedStore.find(s => s.id === prod?.id);
            if (!prod) {
                const newId = `IMP-${item.code}-${Date.now()}`;
                prod = { id: newId, company, category: 'Hardware', description: item.desc.toUpperCase(), basePrice: 0, costPrice: item.price, unit: 'PCS' as any, variants: [], modelNo: item.code, brand: 'NIPPON IMPORT', finishColor: item.color, direction: item.direction, tongueLength: item.tongueLength };
                updatedProducts.push(prod);
                storeItem = { id: newId, company, name: prod.description, category: 'Hardware', quantity: 0, unrestrictedQty: 0, qiQty: 0, blockedQty: 0, reservedQty: 0, consignmentQty: 0, unit: 'PCS', minLevel: 100, reorderPoint: 50, movingAveragePrice: 0, totalValue: 0, storageBin: 'INVOICE-IMPORT', lastMovementDate: new Date().toISOString() };
                updatedStore.push(storeItem);
            }
            if (storeItem) {
                const newVal = item.qty * item.price;
                storeItem.quantity += item.qty;
                storeItem.unrestrictedQty += item.qty;
                storeItem.totalValue += newVal;
                storeItem.movingAveragePrice = storeItem.totalValue / storeItem.quantity;
                newLedgerEntries.push({ id: `GRN-${Date.now()}-${item.code}`, company, materialId: storeItem.id, timestamp: new Date().toISOString(), mvmntCode: '101', qty: item.qty, uom: 'PCS', valuation: item.price, balanceAfter: storeItem.quantity, referenceDoc: 'BULK-IMPORT', user: 'Auto Import', remarks: `Excel Import: ${item.desc}` });
            }
        });

        SalesService.saveProducts(updatedProducts);
        InventoryService.saveStore(updatedStore);
        InventoryService.saveStockLedger([...allLedger, ...newLedgerEntries]);
        refreshData();
        onClose();
        toast.success(`Successfully imported and posted ${importedItems.length} items.`);
    };

    const handleMigoPost = () => {
        if (!migoData.materialId || migoData.qty <= 0) {
            toast.error("Validation Failed: Material and Quantity are required.");
            return;
        }
        const allStore = InventoryService.getStore();
        const itemIdx = allStore.findIndex(i => i.id === migoData.materialId);
        const prod = products.find(p => p.id === migoData.materialId);
        let item = itemIdx !== -1 ? { ...allStore[itemIdx] } : null;
        if (!item && prod) {
            item = { id: prod.id, company, name: prod.description, category: (prod.category as any) || 'Raw', quantity: 0, unrestrictedQty: 0, qiQty: 0, blockedQty: 0, reservedQty: 0, consignmentQty: 0, unit: prod.unit || 'Unit', minLevel: 0, reorderPoint: 0, movingAveragePrice: 0, totalValue: 0, storageBin: 'New', lastMovementDate: new Date().toISOString() }
        }
        if (!item) {
            toast.error("Material Master mismatch.");
            return;
        }
        
        let finalQty = migoData.qty;
        let sheetCount = 0;
        if (migoMode === 'Glass') {
            let sqFtPerSheet = item.conversionFactor || 0;
            if (sqFtPerSheet === 0 && grnSelection.sheetSize) {
                const [w, h] = grnSelection.sheetSize.split('x').map(Number);
                if (w && h) sqFtPerSheet = (w * h) / 144;
            }
            if (migoData.qtyMode === 'Sheets') {
                if (sqFtPerSheet === 0) {
                    toast.error("Sheet size missing in Master Data.");
                    return;
                }
                sheetCount = migoData.qty;
                finalQty = Number((migoData.qty * sqFtPerSheet).toFixed(2));
            } else {
                if (sqFtPerSheet > 0) sheetCount = Number((migoData.qty / sqFtPerSheet).toFixed(1));
            }
            item.conversionFactor = sqFtPerSheet;
        }
    
        const transportCost = Number(migoData.transportCost || 0);
        const materialCost = finalQty * (migoData.valuation || 0);
        const totalBatchCost = materialCost + transportCost;
        const newTotalValue = item.totalValue + totalBatchCost;
        const newTotalQty = item.quantity + finalQty;
        item.quantity = newTotalQty;
        item.unrestrictedQty += finalQty;
        item.totalValue = newTotalValue;
        item.movingAveragePrice = Number((newTotalValue / newTotalQty).toFixed(2));
        
        const newEntry: MaterialLedgerEntry = { id: `MAT-${Date.now().toString().slice(-6)}`, company, materialId: item.id, timestamp: new Date().toISOString(), mvmntCode: '101', qty: finalQty, uom: item.unit, valuation: item.movingAveragePrice, balanceAfter: item.quantity, referenceDoc: migoData.referenceDoc, user: 'Admin Store', batchNo: migoData.batchNo, storageBin: migoData.storageBin || item.storageBin, remarks: migoData.remarks };
        if (itemIdx !== -1) allStore[itemIdx] = item; else allStore.push(item);
        InventoryService.saveStore(allStore);
        InventoryService.saveStockLedger([...InventoryService.getStockLedger(), newEntry]);
        refreshData();
        onClose();
        toast.success(`Posted GRN for ${finalQty} ${item.unit} successfully.`);
    };

    let currentTotalQty = migoData.qty;
    if (migoMode === 'Glass' && migoData.qtyMode === 'Sheets' && grnSelection.sheetSize) {
        const [w, h] = grnSelection.sheetSize.split('x').map(Number);
        currentTotalQty = ((w * h) / 144) * migoData.qty;
    }
    const currentMaterialCost = currentTotalQty * migoData.valuation;
    const currentTotalCost = currentMaterialCost + (migoData.transportCost || 0);
    const currentLandedRate = currentTotalQty > 0 ? currentTotalCost / currentTotalQty : 0;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-[400]">
           <div className="bg-white rounded-[2.5rem] w-full max-w-5xl h-[94vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-300">
              <div className="px-10 py-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center space-x-6">
                    <div className="p-4 bg-emerald-600 rounded-2xl shadow-lg"><Truck size={28}/></div>
                    <div>
                       <h3 className="text-2xl font-black uppercase tracking-tight leading-none">Goods Receipt Note (GRN)</h3>
                       <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1.5 italic">Transaction: MIGO | Movement 101</p>
                    </div>
                 </div>
                 <button onClick={onClose} className="w-12 h-12 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center transition-all"><X size={28}/></button>
              </div>

              <div className="flex bg-slate-100 p-2 border-b">
                  <button onClick={() => setEntryMode('Manual')} className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${entryMode === 'Manual' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>Manual Entry</button>
                  <button onClick={() => setEntryMode('VendorImport')} className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${entryMode === 'VendorImport' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Bulk Import (Excel)</button>
              </div>

              <div className="flex-1 overflow-y-auto p-10 bg-slate-50 space-y-8">
                 {entryMode === 'VendorImport' ? (
                     <div className="space-y-6">
                         <div className="bg-blue-600 text-white p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden">
                             <div className="relative z-10"><h2 className="text-xl font-black uppercase">Bulk Stock Import</h2><p className="text-[10px] font-bold text-blue-200 uppercase mt-1">Nippon / Hardware Logistics</p></div>
                             <div className="flex items-center space-x-3 relative z-10">
                                 <button onClick={handleExcelExport} className="bg-white/10 text-white px-4 py-3 rounded-xl font-bold uppercase text-xs flex items-center space-x-2"><Download size={16}/> <span>Template</span></button>
                                 <div className="relative"><input type="file" ref={fileInputRef} onChange={handleExcelImport} className="hidden" accept=".xlsx, .xls" /><button onClick={() => fileInputRef.current?.click()} className="bg-white text-blue-700 px-6 py-3 rounded-xl font-black uppercase text-xs shadow-lg flex items-center space-x-2">{isParsing ? <Loader2 className="animate-spin" size={16}/> : <FileUp size={16}/>} <span>{isParsing ? 'Reading...' : 'Upload Excel'}</span></button></div>
                             </div>
                             <FileSearch size={160} className="absolute -bottom-4 -right-4 text-blue-500 opacity-20"/>
                         </div>
                         {importedItems.length > 0 && (
                             <div className="bg-white rounded-3xl border shadow-sm overflow-hidden animate-in fade-in">
                                 <div className="p-4 bg-emerald-50 border-b border-emerald-100 flex items-center space-x-2"><CheckCircle2 size={16} className="text-emerald-600"/><span className="text-xs font-bold text-emerald-800 uppercase">Items Ready: {importedItems.length}</span></div>
                                 <table className="w-full text-left sap-table">
                                     <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400"><tr><th>Code</th><th>Description</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Total</th></tr></thead>
                                     <tbody className="divide-y">{importedItems.map((item, i) => (<tr key={i}><td className="px-4 py-3 font-black text-blue-600">{item.code}</td><td className="px-4 py-3 text-xs font-bold uppercase">{item.desc}</td><td className="px-4 py-3 text-right font-bold">{item.qty}</td><td className="px-4 py-3 text-right">{item.price}</td><td className="px-4 py-3 text-right font-black">{(item.qty * item.price).toLocaleString()}</td></tr>))}</tbody>
                                 </table>
                             </div>
                         )}
                     </div>
                 ) : (
                     <div className="grid grid-cols-12 gap-8">
                        <div className="col-span-7 space-y-6">
                            <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                            <div className="flex items-center justify-between border-b pb-4">
                                <div className="flex items-center space-x-3"><Layers size={18} className="text-blue-600"/><h4 className="text-sm font-black uppercase tracking-widest">Item Selection</h4></div>
                                {company !== 'Nippon' && (
                                    <div className="flex bg-slate-100 p-1 rounded-lg">
                                        <button onClick={() => setMigoMode('Glass')} className={`px-3 py-1 text-[10px] font-black uppercase rounded-md transition-all ${migoMode === 'Glass' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}>Glass Sheet</button>
                                        <button onClick={() => setMigoMode('General')} className={`px-3 py-1 text-[10px] font-black uppercase rounded-md transition-all ${migoMode === 'General' ? 'bg-white shadow text-orange-600' : 'text-slate-400'}`}>General Item</button>
                                    </div>
                                )}
                            </div>
                            
                            {migoMode === 'Glass' ? (
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-400">Category</label><select className="sap-input w-full font-bold" value={grnSelection.category} onChange={(e) => setGrnSelection({...grnSelection, category: e.target.value, subCategory: (e.target.value === 'Mirror' ? 'Belgium' : 'Standard'), color: 'N/A', thickness: '5mm', sheetSize: ''})}>{uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                    <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-400">Sub-Category</label><select disabled={isPlain || isFluted} className="sap-input w-full font-bold" value={grnSelection.subCategory} onChange={(e) => setGrnSelection({...grnSelection, subCategory: e.target.value, color: 'N/A', sheetSize: ''})}>{availableSubCategories.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                                    <div className={`space-y-1.5 transition-opacity ${!isColor ? 'opacity-30' : ''}`}><label className="text-[10px] font-black uppercase text-slate-400">Glass Color</label><select disabled={!isColor} className="sap-input w-full font-bold" value={grnSelection.color} onChange={(e) => setGrnSelection({...grnSelection, color: e.target.value, sheetSize: ''})}>{availableColors.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                    <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-400">Thickness</label><select className="sap-input w-full font-bold" value={grnSelection.thickness} onChange={(e) => setGrnSelection({...grnSelection, thickness: e.target.value, sheetSize: ''})}>{uniqueThicknesses.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                    
                                    <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-400">Width (In)</label><select className="sap-input w-full font-bold" value={grnSelection.sheetSize.split('x')[0]} onChange={(e) => { const w = e.target.value; const h = grnSelection.sheetSize.split('x')[1] || '144'; setGrnSelection({...grnSelection, sheetSize: w ? `${w}x${h}` : ''}); }}><option value="">-</option><option value="84">84"</option><option value="96">96"</option></select></div>
                                    <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-400">Height (In)</label><select className="sap-input w-full font-bold" value={grnSelection.sheetSize.split('x')[1]} onChange={(e) => { const h = e.target.value; const w = grnSelection.sheetSize.split('x')[0] || '84'; setGrnSelection({...grnSelection, sheetSize: h ? `${w}x${h}` : ''}); }}><option value="">-</option><option value="144">144"</option></select></div>
                                </div>
                            ) : (
                                <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-400">Select Item</label><select className="sap-input w-full font-bold" value={migoData.materialId} onChange={(e) => setMigoData({...migoData, materialId: e.target.value})}><option value="">-- Choose from Master Data --</option>{generalProducts.map(p => (<option key={p.id} value={p.id}>{p.description} ({p.unit})</option>))}</select></div>
                            )}

                            {migoData.materialId && (
                                <div className={`p-4 border rounded-2xl flex items-center space-x-2 ${migoMode === 'Glass' ? 'bg-emerald-50 border-emerald-100' : 'bg-orange-50 border-orange-100'}`}>
                                    <CheckCircle2 size={16} className={migoMode === 'Glass' ? 'text-emerald-600' : 'text-orange-600'}/><span className={`text-xs font-black uppercase ${migoMode === 'Glass' ? 'text-emerald-800' : 'text-orange-800'}`}>ID: {migoData.materialId} | Matched</span>
                                </div>
                            )}
                            </section>
                            <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6"><div className="flex items-center space-x-3 pb-4 border-b"><ClipboardList size={18} className="text-indigo-600"/><h4 className="text-sm font-black uppercase tracking-widest">Document Header</h4></div><div className="grid grid-cols-2 gap-4"><div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-400">Reference</label><input type="text" placeholder="PO / Invoice Ref" value={migoData.referenceDoc} onChange={e => setMigoData({...migoData, referenceDoc: e.target.value})} className="sap-input w-full font-bold uppercase"/></div><div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-400">Remarks</label><input type="text" value={migoData.remarks} onChange={e => setMigoData({...migoData, remarks: e.target.value})} className="sap-input w-full font-bold uppercase"/></div></div></section>
                        </div>

                        <div className="col-span-5 space-y-6">
                        <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 h-full flex flex-col justify-center">
                            <div className="flex items-center justify-between pb-4 border-b"><div className="flex items-center space-x-3"><Scale size={18} className="text-amber-600"/><h4 className="text-sm font-black uppercase tracking-widest">Valuation</h4></div><button onClick={() => setIsImportMode(!isImportMode)} className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase border ${isImportMode ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-400'}`}>{isImportMode ? 'Import Mode' : 'Local Purchase'}</button></div>
                            <div className="space-y-4">
                                <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-400">Quantity ({migoData.qtyMode})</label><div className="relative"><input type="number" className="w-full p-4 bg-slate-50 border rounded-2xl font-black text-3xl text-center text-slate-800" value={migoData.qty || ''} onChange={e => setMigoData({...migoData, qty: Number(e.target.value)})} /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 uppercase">{migoData.qtyMode}</span></div></div>
                                {migoMode === 'Glass' && (
                                    <div className="flex bg-slate-100 p-1 rounded-lg"><button onClick={() => setMigoData({...migoData, qtyMode: 'Sheets'})} className={`flex-1 py-1 rounded text-[10px] font-black uppercase ${migoData.qtyMode === 'Sheets' ? 'bg-white text-blue-600 shadow' : 'text-slate-400'}`}>Sheets</button><button onClick={() => setMigoData({...migoData, qtyMode: 'SqFt'})} className={`flex-1 py-1 rounded text-[10px] font-black uppercase ${migoData.qtyMode === 'SqFt' ? 'bg-white text-blue-600 shadow' : 'text-slate-400'}`}>SqFt</button></div>
                                )}
                                {isImportMode ? (
                                    <div className="space-y-3 bg-purple-50 p-4 rounded-2xl border border-purple-100">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1"><label className="text-[10px] font-black uppercase text-purple-700">Currency</label><select className="w-full p-2 rounded-lg font-bold text-xs" value={migoData.currency} onChange={e => setMigoData({...migoData, currency: e.target.value})}><option>USD</option><option>RMB</option></select></div>
                                            <div className="space-y-1"><label className="text-[10px] font-black uppercase text-purple-700">Rate</label><input type="number" className="w-full p-2 rounded-lg font-bold text-xs" value={migoData.exchangeRate} onChange={e => setMigoData({...migoData, exchangeRate: Number(e.target.value)})} /></div>
                                        </div>
                                        <div className="space-y-1"><label className="text-[10px] font-black uppercase text-purple-700">Foreign Unit Price</label><input type="number" className="w-full p-2 rounded-lg font-bold text-sm" value={migoData.foreignRate || ''} onChange={e => setMigoData({...migoData, foreignRate: Number(e.target.value)})} /></div>
                                        <div className="space-y-1"><label className="text-[10px] font-black uppercase text-purple-700">Duty / Clearing</label><input type="number" className="w-full p-2 rounded-lg font-bold text-sm" value={migoData.totalDuty || ''} onChange={e => setMigoData({...migoData, totalDuty: Number(e.target.value)})} /></div>
                                    </div>
                                ) : (
                                    <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-400">Unit Cost (PKR)</label><input type="number" className="w-full p-3 bg-white border-2 border-emerald-100 rounded-xl font-black text-xl text-center text-emerald-600" value={migoData.valuation || ''} onChange={e => setMigoData({...migoData, valuation: Number(e.target.value)})} /></div>
                                )}
                                <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-400 flex items-center space-x-1"><Truck size={10}/> <span>Freight</span></label><input type="number" className="w-full p-3 bg-white border rounded-xl font-black text-xl text-center text-blue-600" value={migoData.transportCost || ''} onChange={e => setMigoData({...migoData, transportCost: Number(e.target.value)})} /></div>
                                <div className="bg-slate-50 p-4 rounded-2xl space-y-2 border">
                                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-slate-500 uppercase">Landed Rate</span><span className="text-sm font-black text-slate-800">{currentLandedRate.toFixed(2)} / Unit</span></div>
                                    <div className="flex justify-between items-center border-t pt-2"><span className="text-xs font-bold text-slate-500 uppercase">Total Value</span><span className="text-2xl font-black text-emerald-700">PKR {Math.round(currentTotalCost).toLocaleString()}</span></div>
                                </div>
                            </div>
                        </section>
                        </div>
                     </div>
                 )}
              </div>

              <div className="px-10 py-8 bg-white border-t flex justify-end space-x-4 shrink-0">
                 <button onClick={onClose} className="px-8 py-3 text-slate-400 font-black uppercase text-xs tracking-widest">Discard</button>
                 {entryMode === 'VendorImport' ? (
                     <button onClick={handleBulkPost} disabled={importedItems.length === 0} className="bg-blue-600 text-white px-16 py-4 rounded-2xl font-black uppercase text-xs shadow-2xl flex items-center space-x-4"><ScanLine size={20}/> <span>Bulk Post</span></button>
                 ) : (
                     <button onClick={handleMigoPost} className="bg-slate-900 text-white px-16 py-4 rounded-2xl font-black uppercase text-xs shadow-2xl flex items-center space-x-4"><PackageCheck size={20}/> <span>Post GRN</span></button>
                 )}
              </div>
           </div>
        </div>
    );
};

export default GoodsReceiptMIGO;
