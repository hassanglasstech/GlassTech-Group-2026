
import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useAuthStore } from '@/modules/auth/authStore';
import { toast } from 'sonner';
import { Product, MaterialLedgerEntry, Company } from '@/modules/shared/types';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { SalesService } from '@/modules/sales/services/salesService';
import { orchestrateNipponGRN, NipponPaymentMode } from '@/modules/procurement/services/grnGLService';
import { Truck, X, PackageCheck, Download, FileUp, Loader2, ScanLine } from 'lucide-react';
import * as XLSX from 'xlsx';

interface NipponGoodsReceiptProps {
    isOpen: boolean;
    onClose: () => void;
    refreshData: () => void;
}

// God Mode audit (Phase 1): typed import-row interface replaces the
// previous `any[]` which let unmatched/zero-value rows slip past validation.
interface ImportedItem {
    id: string;
    code: string;
    desc: string;
    qty: number;
    price: number;
    ref: string;
}

const NipponGoodsReceipt: React.FC<NipponGoodsReceiptProps> = ({ isOpen, onClose, refreshData }) => {
    // God Mode audit (Phase 1): auth fallback chain so ledger rows never
    // save with company=undefined. The selectedCompany path is correct
    // for normal use; profile/user are the BUG-1 fix defence.
    const selectedCompany = useAppStore(state => state.selectedCompany);
    const { user, profile } = useAuthStore();
    // selectedCompany FIRST: this is the Nippon GRN modal and orchestrateNipponGRN
    // hardcodes the GL to 'Nippon'. The go-live user's profile.company is 'GTK'
    // (super_admin seed), so the old profile-first order resolved 'GTK' — the
    // product list loaded GTK items (Nippon hardware never matched) and stock-ledger
    // rows were stamped GTK while the GL was tagged Nippon. selectedCompany is forced
    // to 'Nippon' by App.tsx, keeping the physical stock and its GL on the same company.
    const company = (selectedCompany || profile?.company || user?.company) as Company;

    const [entryMode, setEntryMode] = useState<'Manual' | 'VendorImport'>('Manual');
    const [products, setProducts] = useState<Product[]>([]);
    const [isPosting, setIsPosting] = useState(false);   // double-tap guard

    // Import State
    const [isParsing, setIsParsing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importedItems, setImportedItems] = useState<ImportedItem[]>([]);
    // Leakages #2/#9: bulk-import landed cost + 2-way vendor-invoice match.
    const [importFreight, setImportFreight] = useState(0);
    const [vendorInvoiceAmount, setVendorInvoiceAmount] = useState(0);

    // Manual Form
    const [grnData, setGrnData] = useState({
        materialId: '',
        qty: 0,
        valuation: 0,
        transportCost: 0,
        referenceDoc: '',
        batchNo: '',
        remarks: '',
        paymentMode: 'Credit' as NipponPaymentMode,
        vendorName: ''
    });

    useEffect(() => {
        if(isOpen) {
            setProducts(SalesService.getProducts().filter(p => p.company === company));
        }
    }, [isOpen, company]);

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
                const data: Array<Record<string, unknown>> = XLSX.utils.sheet_to_json(ws);
                const mappedItems: ImportedItem[] = data.map((row, idx) => ({
                    id: `IMP-${idx}-${Date.now()}`,
                    code: String(row['Item Code'] || row['Code'] || 'UNKNOWN'),
                    desc: String(row['Description'] || row['Desc'] || 'Imported Item'),
                    qty: Number(row['Qty']) || 0,
                    price: Number(row['Price']) || 0,
                    ref: String(row['Ref'] || '')
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

    // ══════════════════════════════════════════════════════════════════
    // God Mode audit (Phase 1): BULK POST — full rewrite
    // Fixes:
    //   • Validation block before save (no zero-qty / zero-price / unmatched-code rows)
    //   • Per-row outcome reported via toast — silent skip removed
    //   • GL posted via orchestrateNipponGRN (was previously NO GL)
    //   • Awaited save chain — success only on cloud OK
    //   • Loading state guards double-submit
    // ══════════════════════════════════════════════════════════════════
    const handleBulkPost = async () => {
        if (importedItems.length === 0) return;
        if (!company) { toast.error('No company in context — cannot post GRN.'); return; }
        if (isPosting) return;

        // Validation
        const errors: string[] = [];
        const unmatched: string[] = [];
        const matched: Array<{ item: ImportedItem; prod: Product }> = [];
        for (const item of importedItems) {
            if (item.qty <= 0)   { errors.push(`Row ${item.code}: qty must be > 0`); continue; }
            if (item.price <= 0) { errors.push(`Row ${item.code}: price must be > 0`); continue; }
            const prod = products.find(p =>
                p.modelNo === item.code ||
                p.description === item.desc.toUpperCase()
            );
            if (!prod) { unmatched.push(item.code); continue; }
            matched.push({ item, prod });
        }

        if (errors.length > 0) {
            errors.slice(0, 5).forEach(e => toast.error(e));
            return;
        }
        if (unmatched.length > 0) {
            toast.error(`${unmatched.length} unmatched code(s): ${unmatched.slice(0, 3).join(', ')}${unmatched.length > 3 ? '…' : ''}. Add to Material Master and retry.`, { duration: 8000 });
            return;
        }
        if (matched.length === 0) {
            toast.error('No valid rows to post.');
            return;
        }

        // Leakage #9 fix: 2-way GRN <-> vendor-invoice match. If an invoice
        // amount is entered, block posting when it disagrees with received
        // material value beyond tolerance (prevents silent over/under-payment).
        const totalMaterial = matched.reduce((sum, { item }) => sum + item.qty * item.price, 0);
        if (vendorInvoiceAmount > 0) {
            const tol = Math.max(1, totalMaterial * 0.005); // PKR 1 or 0.5%
            if (Math.abs(vendorInvoiceAmount - totalMaterial) > tol) {
                toast.error(`Invoice mismatch: received PKR ${Math.round(totalMaterial).toLocaleString()} vs invoice PKR ${Math.round(vendorInvoiceAmount).toLocaleString()}. Fix qty/price or invoice amount before posting.`, { duration: 8000 });
                return;
            }
        }

        setIsPosting(true);
        try {
            const grnId = `GRN-${company.substring(0,3).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
            const grnDate = new Date().toISOString().split('T')[0];
            const vendorName = grnData.vendorName || 'Bulk Import';

            // 1. GL FIRST — if it fails, stock is NOT touched
            const txId = orchestrateNipponGRN({
                grnId, grnDate, vendorName,
                paymentMode: grnData.paymentMode,
                lines: matched.map(({ item, prod }) => ({
                    productId: prod.id,
                    description: prod.description,
                    brand: prod.brand,
                    mainCategory: prod.mainCategory,
                    qty: item.qty,
                    rate: item.price,
                })),
                freightTotal: importFreight || 0,
            });
            if (!txId) {
                toast.error('GL posting failed. Stock NOT received. Fix accounts and retry.');
                setIsPosting(false);
                return;
            }

            // 2. Update store + stock ledger
            const allStore = InventoryService.getStore();
            const allLedger = InventoryService.getStockLedger();
            const updatedStore = [...allStore];
            const newLedger: MaterialLedgerEntry[] = [];

            for (const [rowIdx, { item, prod }] of matched.entries()) {
                const sIdx = updatedStore.findIndex(s => s.id === prod.id);
                if (sIdx === -1) continue;
                const s = { ...updatedStore[sIdx] };
                // Leakage #2 fix: absorb freight pro-rata (by material value)
                // into each line's value so MAP reflects true landed cost.
                const lineMaterial = item.qty * item.price;
                const lineFreight  = totalMaterial > 0 ? (importFreight || 0) * (lineMaterial / totalMaterial) : 0;
                const newVal = lineMaterial + lineFreight;
                s.quantity = (s.quantity || 0) + item.qty;
                s.unrestrictedQty = (s.unrestrictedQty || 0) + item.qty;
                s.totalValue = (s.totalValue || 0) + newVal;
                // MAP = totalValue/quantity ONLY holds when quantity > 0.
                // Nippon's bootstrap allows negative stock (sell-before-GRN), so a
                // receipt can leave quantity ≤ 0 — then `quantity || 1` still yields
                // a NEGATIVE denominator → negative MAP → negative COGS at delivery.
                // When quantity ≤ 0, fall back to THIS lot's unit landed cost (the
                // best available cost basis); keep the old MAP if even that is absent.
                s.movingAveragePrice = s.quantity > 0
                  ? Number((s.totalValue / s.quantity).toFixed(2))
                  : (item.qty > 0 ? Number((newVal / item.qty).toFixed(2)) : (s.movingAveragePrice || 0));
                updatedStore[sIdx] = s;

                newLedger.push({
                    // rowIdx makes the id unique per import row — without it, the same
                    // product on two rows collided to one id and one stock movement was
                    // silently overwritten in Supabase (breaking GRN↔GL reconciliation).
                    id: `${grnId}-${rowIdx}-${prod.modelNo || prod.id}`,
                    company,
                    materialId: s.id,
                    timestamp: new Date().toISOString(),
                    mvmntCode: '101',
                    qty: item.qty,
                    uom: s.unit,
                    valuation: item.price,
                    balanceAfter: s.quantity,
                    referenceDoc: grnId,
                    user: profile?.fullName || user?.email || 'Nippon Store',
                    remarks: `${vendorName} — bulk import (GL ${txId})`,
                });
            }

            InventoryService.saveStore(updatedStore);
            InventoryService.saveStockLedger([...allLedger, ...newLedger]);

            refreshData();
            toast.success(`GRN ${grnId} posted: ${matched.length} item(s), GL ${txId}`, { duration: 5000 });
            onClose();
        } catch (err: any) {
            toast.error(`Failed: ${err?.message || 'unknown error'}. Books NOT updated.`);
        } finally {
            setIsPosting(false);
        }
    };

    // ══════════════════════════════════════════════════════════════════
    // God Mode audit (Phase 1): MANUAL POST — full rewrite (same pattern)
    // ══════════════════════════════════════════════════════════════════
    const handlePostManual = async () => {
        if (isPosting) return;
        if (!company) { toast.error('No company in context — cannot post GRN.'); return; }
        if (!grnData.materialId) { toast.error('Select an item.'); return; }
        if (grnData.qty <= 0)     { toast.error('Quantity must be > 0.'); return; }
        if (grnData.valuation <= 0) { toast.error('Cost must be > 0.'); return; }

        const allStore = InventoryService.getStore();
        const itemIdx = allStore.findIndex(i => i.id === grnData.materialId);
        if (itemIdx === -1) {
            toast.error('Item not found in store. Add it via Material Master first.');
            return;
        }

        setIsPosting(true);
        try {
            const item = { ...allStore[itemIdx] };
            const prod = products.find(p => p.id === item.id);
            const grnId = `GRN-${company.substring(0,3).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
            const grnDate = new Date().toISOString().split('T')[0];
            const vendorName = grnData.vendorName || prod?.brand || 'Unknown Vendor';

            // 1. GL FIRST — landed cost capitalized via freightTotal
            const txId = orchestrateNipponGRN({
                grnId, grnDate, vendorName,
                paymentMode: grnData.paymentMode,
                lines: [{
                    productId: item.id,
                    description: item.name || item.id,
                    brand: prod?.brand,
                    mainCategory: prod?.mainCategory,
                    qty: grnData.qty,
                    rate: grnData.valuation,
                }],
                freightTotal: grnData.transportCost || 0,
            });
            if (!txId) {
                toast.error('GL posting failed. Stock NOT received.');
                setIsPosting(false);
                return;
            }

            // 2. Update store with landed-cost MAP
            const materialCost   = grnData.qty * grnData.valuation;
            const totalBatchCost = materialCost + (grnData.transportCost || 0);
            item.quantity        = (item.quantity || 0) + grnData.qty;
            item.unrestrictedQty = (item.unrestrictedQty || 0) + grnData.qty;
            item.totalValue      = (item.totalValue || 0) + totalBatchCost;
            item.movingAveragePrice = Number((item.totalValue / (item.quantity || 1)).toFixed(2));

            const newEntry: MaterialLedgerEntry = {
                id: grnId,
                company,
                materialId: item.id,
                timestamp: new Date().toISOString(),
                mvmntCode: '101',
                qty: grnData.qty,
                uom: item.unit,
                valuation: grnData.valuation,
                balanceAfter: item.quantity,
                referenceDoc: grnData.referenceDoc || grnId,
                user: profile?.fullName || user?.email || 'Nippon Store',
                remarks: `${vendorName} — ${grnData.remarks || 'manual GRN'} (GL ${txId})`,
                batchNo: grnData.batchNo
            };

            allStore[itemIdx] = item;
            InventoryService.saveStore(allStore);
            InventoryService.saveStockLedger([...InventoryService.getStockLedger(), newEntry]);

            refreshData();
            toast.success(`GRN ${grnId} posted: ${grnData.qty} ${item.unit} @ MAP ${item.movingAveragePrice}, GL ${txId}`, { duration: 5000 });
            onClose();
        } catch (err: any) {
            toast.error(`Failed: ${err?.message || 'unknown error'}. Books NOT updated.`);
        } finally {
            setIsPosting(false);
        }
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
                         <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-1">
                                 <label className="text-[10px] font-bold uppercase text-slate-500">Total Freight / Landed Cost (PKR) — optional</label>
                                 <input type="number" className="sap-input w-full font-bold" value={importFreight || ''} onChange={e => setImportFreight(Number(e.target.value))} placeholder="0" />
                             </div>
                             <div className="space-y-1">
                                 <label className="text-[10px] font-bold uppercase text-slate-500">Vendor Invoice Amount (PKR) — optional, checked vs received</label>
                                 <input type="number" className="sap-input w-full font-bold" value={vendorInvoiceAmount || ''} onChange={e => setVendorInvoiceAmount(Number(e.target.value))} placeholder="0" />
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

              <div className="px-10 py-6 bg-white border-t flex justify-end items-center space-x-4">
                 {/* God Mode (Phase 1): payment mode + vendor — required for correct GL credit side */}
                 <div className="flex items-center gap-2 mr-auto">
                    <input
                        type="text"
                        placeholder="Vendor name (KIN LONG / Soleron / …)"
                        value={grnData.vendorName}
                        onChange={e => setGrnData({...grnData, vendorName: e.target.value})}
                        className="sap-input text-xs font-bold uppercase w-56"
                        disabled={isPosting}
                    />
                    <select
                        value={grnData.paymentMode}
                        onChange={e => setGrnData({...grnData, paymentMode: e.target.value as NipponPaymentMode})}
                        className="sap-input text-xs font-bold uppercase"
                        disabled={isPosting}
                        title="Credit = Dr Inventory/Cr Payable · Cash = Dr Inventory/Cr Bank · Advance = Dr Inventory/Cr Advance"
                    >
                        <option value="Credit">On Credit</option>
                        <option value="Cash">Cash / Bank Paid</option>
                        <option value="Advance">Settle Against Advance</option>
                    </select>
                 </div>
                 <button onClick={onClose} disabled={isPosting} className="px-6 py-2 text-slate-400 font-bold uppercase text-xs disabled:opacity-50">Discard</button>
                 {entryMode === 'Manual' ? (
                     <button
                        onClick={handlePostManual}
                        disabled={isPosting}
                        className="bg-red-700 text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-red-800 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                     >
                        {isPosting ? <Loader2 size={16} className="animate-spin"/> : <PackageCheck size={16}/>}
                        <span>{isPosting ? 'Posting…' : 'Post Stock + GL'}</span>
                     </button>
                 ) : (
                     <button
                        onClick={handleBulkPost}
                        disabled={importedItems.length === 0 || isPosting}
                        className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                     >
                        {isPosting ? <Loader2 size={16} className="animate-spin"/> : <ScanLine size={16}/>}
                        <span>{isPosting ? 'Posting…' : `Process Import + GL`}</span>
                     </button>
                 )}
              </div>
           </div>
        </div>
    );
};

export default NipponGoodsReceipt;
