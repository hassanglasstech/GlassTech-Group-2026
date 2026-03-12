
import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { toast } from 'sonner';
import { Product, MaterialLedgerEntry } from '@/modules/shared/types';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { SalesService } from '@/modules/sales/services/salesService';
import { Truck, X, CheckCircle2, ClipboardList, Scale, PackageCheck, Download, FileUp, Loader2, ScanLine, Box } from 'lucide-react';
import * as XLSX from 'xlsx';

interface NipponGoodsReceiptProps {
    isOpen: boolean;
    onClose: () => void;
    refreshData: () => void;
}

const NipponGoodsReceipt: React.FC<NipponGoodsReceiptProps> = ({ isOpen, onClose, refreshData }) => {
    const company = useAppStore(state => state.selectedCompany);
    const [entryMode, setEntryMode] = useState<'Manual' | 'VendorImport'>('Manual');
    const [products, setProducts] = useState<Product[]>([]);
    
    // Import State
    const [isParsing, setIsParsing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importedItems, setImportedItems] = useState<any[]>([]);

    // Manual Form
    const [grnData, setGrnData] = useState({
        materialId: '',
        qty: 0,
        valuation: 0, 
        transportCost: 0, 
        referenceDoc: '',
        batchNo: '',
        remarks: ''
    });

    useEffect(() => {
        if(isOpen) {
            setProducts(SalesService.getProducts().filter(p => p.company === company));
        }
    }, [isOpen]);

    const handleExcelExport = () => {
        const template = [
            { 'Item Code': 'LCZS631', 'Description': 'Example Handle Black', 'Qty': 100, 'Price': 1500, 'Ref': 'INV-001' }
        ];
        const ws = XLSX.utils.json_to_sheet(template);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Nippon_GRN_Template");
        XLSX.writeFile(wb, "Nippon_Stock_In_Template.xlsx");
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
                    qty: Number(row['Qty']) || 0,
                    price: Number(row['Price']) || 0,
                    ref: row['Ref'] || ''
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
        let updatedStore = [...allStore];
        const newLedgerEntries: MaterialLedgerEntry[] = [];

        importedItems.forEach(item => {
            // Find by Model No or Description match
            const prod = products.find(p => p.modelNo === item.code || p.description === item.desc.toUpperCase());
            if (prod) {
                let storeItem = updatedStore.find(s => s.id === prod.id);
                if (storeItem) {
                    const newVal = item.qty * item.price;
                    storeItem.quantity += item.qty;
                    storeItem.unrestrictedQty += item.qty;
                    storeItem.totalValue += newVal;
                    storeItem.movingAveragePrice = storeItem.totalValue / (storeItem.quantity || 1);
                    
                    newLedgerEntries.push({ 
                        id: `GRN-${Date.now()}-${prod.modelNo}`, company, 
                        materialId: storeItem.id, timestamp: new Date().toISOString(), 
                        mvmntCode: '101', qty: item.qty, uom: storeItem.unit, 
                        valuation: item.price, balanceAfter: storeItem.quantity, 
                        referenceDoc: item.ref || 'BULK-IMPORT', 
                        user: 'System Import', remarks: `Imported via Excel` 
                    });
                }
            }
        });

        InventoryService.saveStore(updatedStore);
        InventoryService.saveStockLedger([...allLedger, ...newLedgerEntries]);
        refreshData();
        onClose();
        toast.success(`Bulk Processed: ${newLedgerEntries.length} items updated.`);
    };

    const handlePostManual = () => {
        if (!grnData.materialId || grnData.qty <= 0) {
            toast.error("Material and Quantity are required.");
            return;
        }
        const allStore = InventoryService.getStore();
        const itemIdx = allStore.findIndex(i => i.id === grnData.materialId);
        if (itemIdx === -1) {
            toast.error("Item not found in store.");
            return;
        }

        const item = { ...allStore[itemIdx] };
        const materialCost = grnData.qty * grnData.valuation;
        const totalBatchCost = materialCost + (grnData.transportCost || 0);
        
        item.quantity += grnData.qty;
        item.unrestrictedQty += grnData.qty;
        item.totalValue += totalBatchCost;
        item.movingAveragePrice = Number((item.totalValue / item.quantity).toFixed(2));

        const newEntry: MaterialLedgerEntry = { 
            id: `GRN-${Date.now().toString().slice(-6)}`, company, 
            materialId: item.id, timestamp: new Date().toISOString(), 
            mvmntCode: '101', qty: grnData.qty, uom: item.unit, 
            valuation: grnData.valuation, balanceAfter: item.quantity, 
            referenceDoc: grnData.referenceDoc, user: 'Nippon Store', 
            remarks: grnData.remarks, batchNo: grnData.batchNo 
        };

        allStore[itemIdx] = item;
        InventoryService.saveStore(allStore);
        InventoryService.saveStockLedger([...InventoryService.getStockLedger(), newEntry]);
        refreshData();
        onClose();
        toast.success(`Posted stock for ${grnData.qty} ${item.unit} successfully.`);
    };

    // Auto-fill valuation
    useEffect(() => {
        if (grnData.materialId) {
            const prod = products.find(p => p.id === grnData.materialId);
            if (prod) setGrnData(prev => ({ ...prev, valuation: prod.costPrice || 0 }));
        }
    }, [grnData.materialId]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-[400]">
           <div className="bg-white rounded-[2.5rem] w-full max-w-4xl h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-300">
              <div className="px-10 py-6 bg-red-700 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center space-x-4">
                    <div className="p-3 bg-red-800 rounded-2xl shadow-lg"><Truck size={24}/></div>
                    <div>
                       <h3 className="text-2xl font-black uppercase tracking-tight">Nippon Inbound (GRN)</h3>
                       <p className="text-[10px] text-red-200 font-bold uppercase tracking-widest mt-1">Movement 101 - Hardware Stock</p>
                    </div>
                 </div>
                 <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-full"><X size={28}/></button>
              </div>

              <div className="flex bg-slate-100 p-2 border-b">
                  <button onClick={() => setEntryMode('Manual')} className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${entryMode === 'Manual' ? 'bg-white shadow-sm text-red-700' : 'text-slate-400 hover:text-slate-600'}`}>Manual Entry</button>
                  <button onClick={() => setEntryMode('VendorImport')} className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${entryMode === 'VendorImport' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Excel Import</button>
              </div>

              <div className="flex-1 overflow-y-auto p-10 bg-slate-50">
                 {entryMode === 'Manual' ? (
                     <div className="grid grid-cols-2 gap-8">
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                            <h4 className="text-xs font-black text-slate-400 uppercase border-b pb-2">Item Details</h4>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-slate-500">Select Item</label>
                                <select className="sap-input w-full font-bold" value={grnData.materialId} onChange={e => setGrnData({...grnData, materialId: e.target.value})}>
                                    <option value="">-- Choose Hardware --</option>
                                    {products.map(p => <option key={p.id} value={p.id}>{p.modelNo} - {p.description}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-slate-500">Quantity</label>
                                    <input type="number" className="sap-input w-full font-black text-lg" value={grnData.qty || ''} onChange={e => setGrnData({...grnData, qty: Number(e.target.value)})}/>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-slate-500">Cost (PKR)</label>
                                    <input type="number" className="sap-input w-full font-black text-lg text-emerald-600" value={grnData.valuation || ''} onChange={e => setGrnData({...grnData, valuation: Number(e.target.value)})}/>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                            <h4 className="text-xs font-black text-slate-400 uppercase border-b pb-2">Reference Info</h4>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-slate-500">Ref Doc (PO/Inv)</label>
                                <input type="text" className="sap-input w-full font-bold uppercase" value={grnData.referenceDoc} onChange={e => setGrnData({...grnData, referenceDoc: e.target.value})}/>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-slate-500">Remarks</label>
                                <input type="text" className="sap-input w-full font-bold uppercase" value={grnData.remarks} onChange={e => setGrnData({...grnData, remarks: e.target.value})}/>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-slate-500">Extra Freight Cost</label>
                                <input type="number" className="sap-input w-full font-bold" value={grnData.transportCost || ''} onChange={e => setGrnData({...grnData, transportCost: Number(e.target.value)})}/>
                            </div>
                        </div>
                     </div>
                 ) : (
                     <div className="space-y-6">
                         <div className="bg-blue-50 border border-blue-200 p-6 rounded-2xl flex justify-between items-center">
                             <div>
                                 <h4 className="text-sm font-black text-blue-800 uppercase">Import Data</h4>
                                 <p className="text-xs text-blue-600">Upload Excel with Item Code, Qty, and Price.</p>
                             </div>
                             <div className="flex gap-2">
                                <button onClick={handleExcelExport} className="bg-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm flex items-center gap-2"><Download size={14}/> Template</button>
                                <div className="relative">
                                    <input type="file" ref={fileInputRef} onChange={handleExcelImport} className="hidden" accept=".xlsx" />
                                    <button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm flex items-center gap-2">
                                        {isParsing ? <Loader2 className="animate-spin" size={14}/> : <FileUp size={14}/>} Upload
                                    </button>
                                </div>
                             </div>
                         </div>
                         {importedItems.length > 0 && (
                             <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                                 <table className="w-full text-left sap-table">
                                     <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500"><tr><th className="px-4 py-2">Item Code</th><th className="px-4 py-2">Qty</th><th className="px-4 py-2">Price</th></tr></thead>
                                     <tbody className="divide-y">
                                         {importedItems.map((it, i) => (
                                             <tr key={i}><td className="px-4 py-2 font-bold text-xs">{it.code}</td><td className="px-4 py-2 text-xs">{it.qty}</td><td className="px-4 py-2 text-xs">{it.price}</td></tr>
                                         ))}
                                     </tbody>
                                 </table>
                             </div>
                         )}
                     </div>
                 )}
              </div>

              <div className="px-10 py-6 bg-white border-t flex justify-end space-x-4">
                 <button onClick={onClose} className="px-6 py-2 text-slate-400 font-bold uppercase text-xs">Discard</button>
                 {entryMode === 'Manual' ? (
                     <button onClick={handlePostManual} className="bg-red-700 text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-red-800 transition-all flex items-center gap-2"><PackageCheck size={16}/> <span>Post Stock</span></button>
                 ) : (
                     <button onClick={handleBulkPost} disabled={importedItems.length === 0} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-blue-700 transition-all flex items-center gap-2"><ScanLine size={16}/> <span>Process Import</span></button>
                 )}
              </div>
           </div>
        </div>
    );
};

export default NipponGoodsReceipt;
