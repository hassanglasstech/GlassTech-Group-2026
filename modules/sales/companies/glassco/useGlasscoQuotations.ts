import { useState, useEffect, useMemo } from 'react';
import { Company, Client, Quotation, QuotationItem, Product, ProductionPiece, PieceStatus } from '@/modules/shared/types';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { allocateSerial } from '@/modules/sales/services/serialAllocator';
import { toast } from 'sonner';
import { ProductionService } from '@/modules/production/services/productionService';
import { calculateAutoRate, calculateLineItemTotal } from '@/modules/glassco/core/GlasscoUtils';
import * as XLSX from 'xlsx';

export const useGlasscoQuotations = () => {
  const company = 'Glassco';
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [allQuotations, setAllQuotations] = useState<Quotation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortType, setSortType] = useState('date_desc');
  const [printingQuote, setPrintingQuote] = useState<Quotation | null>(null);
  const [printMode, setPrintMode] = useState<'Quotation' | 'SalesOrder' | 'JobCard'>('Quotation');
  const [isMM, setIsMM] = useState(false);

  const initialQuotation: Partial<Quotation> = {
    date: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    clientId: '',
    projectName: '',
    items: [],
    status: 'Draft',
    isAlreadyDispatched: false,
    discountPercent: 0,
    discountAmount: 0
  };

  const [formData, setFormData] = useState<Partial<Quotation>>(initialQuotation);

  useEffect(() => { refreshData(); }, []);

  const lastSerial = useMemo(() => {
      const all = allQuotations.filter(q => q.company === company);
      let max = 0;
      all.forEach(q => {
          const refId = q.orderNo || q.id;
          // Only count formal IDs (GT-QUT / GT-SO or legacy QT / SO) for the main serial count
          if (!refId || refId.startsWith('DRF-')) return;
          const parts = refId.split('-');
          const num = parseInt(parts[parts.length - 1]);
          // Strictly formal range: below 9000
          if (!isNaN(num) && num > max && num < 9000) max = num;
      });
      return max || 2522;
  }, [allQuotations]);

  const refreshData = async () => {
    const all = await AsyncSalesService.getQuotations();
    setAllQuotations(all);

    const drafts = all.filter(q => {
        if (q.company !== company) return false;
        if (q.status === 'Approved') return false;
        if (q.orderNo) return false;
        return true;
    });
    setQuotations(drafts);
    
    const allClients = await AsyncSalesService.getClients();
    setClients(allClients.filter(c => c.company === company));
    
    const allProducts = await AsyncSalesService.getProducts();
    setProducts(allProducts.filter(p => p.company === company));
  };

  const handleSaveQuotation = async (action: 'draft' | 'save' | 'approve', directData?: Quotation) => {
    const dataToSave = directData || formData;
    if (!dataToSave.clientId) { toast.error("Client is required.", { duration: 4000 }); return; }

    // Validation: formal save/approve requires non-empty items + positive total
    if (action === 'save' || action === 'approve') {
      const nonSectionItems = (dataToSave.items || []).filter((i: any) => !i.isSection);
      if (nonSectionItems.length === 0) {
        toast.error("At least one line item is required before saving.", { duration: 4000 });
        return;
      }
      const totalAmount = nonSectionItems.reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);
      if (totalAmount <= 0) {
        toast.error("Quotation total must be greater than 0.", { duration: 4000 });
        return;
      }

      // ── Phase-2 (2.2): SAL-3 credit limit guard for Glassco quotation save ──
      // Audit F4: this guard existed in the generic QuotationManager but was
      // never wired into Glassco's save path. A defaulting client could
      // accumulate unlimited orders. Now blocks save on Approve when:
      //   outstanding AR + this quotation grand total > client.creditLimit
      if (action === 'approve') {
        const clientList = await AsyncSalesService.getClients();
        const clientRow: any = clientList.find((c: any) => c.id === dataToSave.clientId && c.company === company);
        const creditLimit = Number(clientRow?.creditLimit ?? 0);
        if (creditLimit > 0) {
          const subtotal = (dataToSave.items || [])
            .filter((i: any) => !i.isSection)
            .reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);
          const discount = Number(dataToSave.discountAmount || 0)
            + (subtotal * (Number(dataToSave.discountPercent || 0) / 100));
          const newOrderValue = Math.max(0, subtotal - discount);
          const outstanding = await AsyncSalesService.getClientOutstandingAR(dataToSave.clientId, company);
          if (outstanding + newOrderValue > creditLimit) {
            toast.error(
              `Credit limit exceeded for ${clientRow?.name || dataToSave.clientId}: ` +
              `outstanding PKR ${outstanding.toLocaleString('en-PK')} + new order PKR ${newOrderValue.toLocaleString('en-PK')} ` +
              `= PKR ${(outstanding + newOrderValue).toLocaleString('en-PK')} > limit PKR ${creditLimit.toLocaleString('en-PK')}. ` +
              `Increase the limit in Client Master or collect outstanding balance first.`,
              { duration: 10000 }
            );
            return;
          }
        }
      }
    }

    const originalId = dataToSave.id;
    let finalId = originalId;

    const dateParts = (dataToSave.date || new Date().toISOString().split('T')[0]).split('-');
    const mmyy = `${dateParts[1]}${dateParts[0].slice(-2)}`;
    const year = parseInt(dateParts[0], 10) || new Date().getFullYear();

    const hasFormalId = finalId && (finalId.startsWith('GT-QUT-') || finalId.startsWith('GT-SO-') || finalId.startsWith('QT-') || finalId.startsWith('SO-'));
    const hasDraftId = finalId && finalId.startsWith('DRF-');

    // ── Phase-2 (2.5): atomic serial allocation via Postgres allocate_serial RPC ──
    // RC-1 fix: parallel approves no longer compute the same maxSeq+1 from
    // a stale local snapshot. Falls back to local counter when offline.
    if (action === 'draft') {
        if (!hasFormalId && !hasDraftId) {
            const seq = await allocateSerial(company, 'DRF', year, 9026);
            finalId = `DRF-GLS-${mmyy}-${String(seq).padStart(4, '0')}`;
        }
    }
    else if (action === 'save' || action === 'approve') {
        if (!hasFormalId) {
            const docType = action === 'approve' ? 'GT-SO' : 'GT-QUT';
            const seq = await allocateSerial(company, docType, year, 2523);
            const prefix = action === 'approve' ? 'GT-SO-GLS' : 'GT-QUT-GLS';
            finalId = `${prefix}-${mmyy}-${String(seq).padStart(4, '0')}`;
        } else if (action === 'approve' && finalId && (finalId.startsWith('GT-QUT-') || finalId.startsWith('QT-'))) {
            // Transitioning existing QUT to SO: keep the same number (just swap prefix)
            finalId = finalId.replace('GT-QUT-', 'GT-SO-').replace('QT-', 'GT-SO-');
        }
    }

    let finalOrderNo = dataToSave.orderNo;
    if (action === 'approve') {
        const today = new Date().toISOString().split('T')[0];
        if (dataToSave.dueDate && dataToSave.dueDate < today) {
            toast.error(`Quotation expired on ${dataToSave.dueDate}. Update due date or get manager approval before converting to order.`);
            return;
        }
        finalOrderNo = (finalId || '').replace('GT-QUT-', 'GT-SO-').replace('QT-', 'GT-SO-');
    }

    const finalQuo: Quotation = {
        ...(dataToSave as Quotation),
        id: finalId!,
        company,
        status: action === 'approve' ? 'Approved' : 'Draft',
        orderNo: finalOrderNo
    };

    // ── Phase-2 (2.4 + 2.6): SAVE QUOTATION FIRST, THEN PIECES ───────────
    // Audit B1: previous code saved pieces synchronously BEFORE the
    // quotation was persisted, then MFG-1 ghost-order rejection silently
    // dropped the pieces. Order: persist quotation → cleanup old id →
    // (only if approve) build & save pieces with rollback on failure.
    try {
      // 2.6: pass ONLY the row being changed (per-row merge save)
      await AsyncSalesService.saveQuotations([finalQuo]);

      // Cleanup obsolete id rows when DRF/QT transitions to a new id
      if (originalId && originalId !== finalId) {
        await AsyncSalesService.deleteQuotation(originalId);
      }
      if (finalOrderNo && finalOrderNo !== finalId) {
        // Drop any stale row keyed on the old orderNo (rare — defensive)
        const existing = await AsyncSalesService.getQuotations();
        const dup = existing.find(x => x.orderNo === finalOrderNo && x.id !== finalId && x.id !== originalId);
        if (dup) await AsyncSalesService.deleteQuotation(dup.id);
      }
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message || 'unknown error'}`, { duration: 8000 });
      return;
    }

    // 2.4: pieces save AFTER quotation is in Supabase — MFG-1 ghost-order
    // check now passes because the order id exists. Wrap in try/catch so
    // a piece-save failure rolls the order back to Draft (not silently lost).
    if (action === 'approve') {
      try {
        const currentPieces = ProductionService.getProductionPieces();
        const orderRef = finalOrderNo || finalId || '';
        const numericOnly = orderRef.replace(/[^0-9]/g, '');
        const numericPart = numericOnly.slice(-4) || orderRef.slice(-4) || '0000';

        const newPieces: ProductionPiece[] = [];
        let globalSerialCounter = 1;
        finalQuo.items.forEach((item, idx) => {
            if (item.isSection) return;
            for (let i = 0; i < item.qty; i++) {
                newPieces.push({
                    id: `${numericPart}/${globalSerialCounter}`,
                    orderId: finalOrderNo!,
                    itemIndex: idx,
                    specs: `${item.width}x${item.height} ${item.glassSize || '5mm'} ${item.glassType || 'Plain'}`,
                    status: (finalQuo.isAlreadyDispatched ? 'Delivered' : 'Cut') as any,
                    lastUpdated: new Date().toISOString(), isRevised: false
                });
                globalSerialCounter++;
            }
        });
        const others = currentPieces.filter(p => !p.id.startsWith(`${numericPart}/`));
        await ProductionService.saveProductionPieces([...others, ...newPieces]);
      } catch (pieceErr: any) {
        // Roll back: revert the order to Draft so the user can fix and retry.
        toast.error(
          `Order ${finalOrderNo} saved but production pieces failed: ${pieceErr?.message || 'unknown error'}. ` +
          `Order rolled back to Draft — review and re-approve.`,
          { duration: 12000 }
        );
        try {
          await AsyncSalesService.saveQuotations([{ ...finalQuo, status: 'Draft' as any, orderNo: undefined as any }]);
        } catch { /* swallow rollback errors — user already notified */ }
        return;
      }
    }

    setFormData(finalQuo);

    // Always close editor and return to list after save
    setIsEditorOpen(false);
    setTimeout(() => refreshData(), 200);

    if (action === 'approve') {
        toast.success(`Approved as ${finalOrderNo}`, { duration: 3000 });
    } else if (action === 'draft') {
        toast.success(`Draft saved: ${finalId}`, { duration: 3000 });
    } else {
        toast.success(`Quotation saved: ${finalId}`, { duration: 3000 });
    }
  };

  const updateGlassItem = async (index: number, field: string, value: any) => {
    if (formData.status === 'Approved' && index !== -1) return;

    if (index === -1) {
        setFormData(prev => ({ ...prev, [field]: value }));
        return;
    }

    const nextItems = [...(formData.items || [])];
    const item = { ...nextItems[index] };
    
    (item as any)[field] = value;

    if (['glassSize', 'glassType', 'subCategory', 'glassColor', 'selectedServices'].includes(field)) {
        item.pricePerUnit = calculateAutoRate(
            item.glassSize || '5mm', 
            item.glassType || 'Plain', 
            item.subCategory || 'Standard', 
            item.selectedServices || [], 
            products,
            item.glassColor
        );
    }

    if (isMM) {
        if (field === 'mmW' || field === 'mmH') {
            item.width = (Number(item.mmW) || 0) / 25.4;
            item.height = (Number(item.mmH) || 0) / 25.4;
        }
    } else {
        if (['inchW', 'sootW', 'inchH', 'sootH'].includes(field)) {
            item.width = (Number(item.inchW) || 0) + ((Number(item.sootW) || 0) / 8);
            item.height = (Number(item.inchH) || 0) + ((Number(item.sootH) || 0) / 8);
        }
    }

    const { totalSqFt, amount, aptCharges, notchCharges } = calculateLineItemTotal(item, products);
    item.totalSqFt = totalSqFt;
    item.amount = amount;
    (item as any).aptCharges = aptCharges || 0;
    (item as any).notchCharges = notchCharges || 0;

    nextItems[index] = item;
    setFormData(prev => ({ ...prev, items: nextItems }));
  };

  const makeBlankItem = (ts: number = Date.now()): QuotationItem => ({
    id: `ITM-${ts}`, description: '', qty: 1, inchW: 0, sootW: 0, inchH: 0, sootH: 0, mmW: 0, mmH: 0,
    width: 0, height: 0, glassSize: '5mm', glassType: 'Plain', subCategory: 'Standard', selectedServices: [],
    totalSqFt: 0, pricePerUnit: calculateAutoRate('5mm', 'Plain', 'Standard', [], products), amount: 0,
    locationCode: '', glazingSpecs: '', inputUnit: isMM ? 'MM' : 'Inch'
  });

  const DEFAULT_ROW_COUNT = 7;

  const addItem = () => {
    const newItem = makeBlankItem();
    setFormData(prev => ({ ...prev, items: [...(prev.items || []), newItem] }));
  };

  const addSection = () => {
      setFormData(prev => ({ ...prev, items: [...(prev.items || []), { id: `SEC-${Date.now()}`, isSection: true, description: '', qty: 0, width: 0, height: 0, totalSqFt: 0, pricePerUnit: 0, amount: 0, locationCode: '', glazingSpecs: '' }] }));
  };

  const duplicateItem = (idx: number) => {
      setFormData(prev => {
          const next = [...(prev.items || [])];
          const original = next[idx];
          const copy = { ...original, id: `ITM-DUP-${Date.now()}-${idx}`, isRevised: false };
          next.splice(idx + 1, 0, copy);
          return { ...prev, items: next };
      });
  };

  const removeItem = (idx: number) => {
    setFormData(prev => {
        const next = [...(prev.items || [])];
        next.splice(idx, 1);
        return { ...prev, items: next };
    });
  };

  const handlePrintRequest = (q: Quotation, mode: 'Quotation' | 'SalesOrder' | 'JobCard') => {
      setPrintMode(mode);
      setPrintingQuote(q);
      const delay = mode === 'JobCard' ? 2500 : 800;
      setTimeout(() => { window.print(); setPrintingQuote(null); }, delay);
  };

  const handleDeleteQuotation = async (id: string) => {
      if (confirm("Delete? ID will not be reused.")) {
          // Phase-2 (2.6): per-row delete (was full-table overwrite, race-prone).
          await AsyncSalesService.deleteQuotation(id);
          await refreshData();
      }
  };

  const handleExportExcel = (q: Quotation) => {
    const clientName = clients.find(c => c.id === q.clientId)?.name || 'Unknown';
    
    const metadata = [
      ['QUOTATION DETAILS'],
      ['Reference ID', q.orderNo || q.id],
      ['Client', clientName],
      ['Project', q.projectName],
      ['Date', q.date],
      ['Valid Till', q.dueDate],
      ['Status', q.status],
      ['Discount %', q.discountPercent || 0],
      ['Discount Amt', q.discountAmount || 0],
      []
    ];

    const headers = ['#', 'Description', 'Glass Type', 'Sub Category', 'Thickness', 'Color', 'Services', 'Width (Inch)', 'Soot W', 'Height (Inch)', 'Soot H', 'Qty', 'SqFt', 'Rate', 'Amount'];
    
    const itemsData = (q.items || []).map((item, idx) => {
      if (item.isSection) {
        return ['SECTION', item.description, '', '', '', '', '', '', '', '', '', '', '', '', ''];
      }
      return [
        idx + 1,
        item.description,
        item.glassType,
        item.subCategory,
        item.glassSize,
        item.glassColor,
        (item.selectedServices || []).join(', '),
        item.inchW,
        item.sootW,
        item.inchH,
        item.sootH,
        item.qty,
        item.totalSqFt?.toFixed(2),
        item.pricePerUnit,
        item.amount
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([...metadata, headers, ...itemsData]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Quotation");
    XLSX.writeFile(wb, `${q.id}_${clientName}.xlsx`);
  };

  const handleExportJson = (q: Quotation) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(q, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${q.id}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleBulkExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(quotations, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `Glassco_Bulk_Export_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleBulkExportExcel = () => {
    const data: any[] = [];
    quotations.forEach(q => {
      const clientName = clients.find(c => c.id === q.clientId)?.name || 'Unknown';
      q.items.forEach(item => {
        data.push({
          'Quote ID': q.id,
          'Client': clientName,
          'Date': q.date,
          'Status': q.status,
          'Is Section': item.isSection ? 'Yes' : 'No',
          'Description': item.description,
          'Glass Type': item.glassType,
          'Thickness': item.glassSize,
          'Width': item.width,
          'Height': item.height,
          'Qty': item.qty,
          'SqFt': item.totalSqFt,
          'Rate': item.pricePerUnit,
          'Amount': item.amount
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bulk_Quotations");
    XLSX.writeFile(wb, `Glassco_Bulk_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImportJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        const all = await AsyncSalesService.getQuotations();
        const existingIds = new Set(all.map(q => q.id));
        const toInsert: Quotation[] = [];

        if (Array.isArray(data)) {
          data.forEach((q: Quotation) => {
            if (!existingIds.has(q.id)) toInsert.push({ ...q, company });
          });
        } else {
          if (existingIds.has(data.id)) {
            toast.error("Quotation with this ID already exists.", { duration: 4000 });
            return;
          }
          toInsert.push({ ...data, company });
        }

        // Phase-2 (2.6): per-row save — passes only NEW rows, no full overwrite.
        if (toInsert.length > 0) await AsyncSalesService.saveQuotations(toInsert);
        await refreshData();
        toast.success(`Imported ${toInsert.length} quotation(s).`, { duration: 3000 });
      } catch (err) {
        toast.error("Invalid JSON file", { duration: 4000 });
      }
    };
    reader.readAsText(file);
  };

  const handleImportExcel = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        
        const refId = firstSheet['B2']?.v;
        const clientName = firstSheet['B3']?.v;
        const projectName = firstSheet['B4']?.v;
        const date = firstSheet['B5']?.v;

        const rows = XLSX.utils.sheet_to_json(firstSheet, { range: 10 }) as any[];

        const items: QuotationItem[] = rows.map((row, idx) => {
          const isSection = row['#'] === 'SECTION';
          return {
            id: `ITM-IMP-${Date.now()}-${idx}`,
            description: row['Description'] || '',
            isSection,
            glassType: row['Glass Type'] || 'Plain',
            subCategory: row['Sub Category'] || 'Standard',
            glassSize: row['Thickness'] || '5mm',
            glassColor: row['Color'] || 'Clear',
            selectedServices: row['Services'] ? row['Services'].split(',').map((s: string) => s.trim()) : [],
            inchW: Number(row['Width (Inch)']) || 0,
            sootW: Number(row['Soot W']) || 0,
            inchH: Number(row['Height (Inch)']) || 0,
            sootH: Number(row['Soot H']) || 0,
            qty: Number(row['Qty']) || 0,
            totalSqFt: Number(row['SqFt']) || 0,
            pricePerUnit: Number(row['Rate']) || 0,
            amount: Number(row['Amount']) || 0,
            width: (Number(row['Width (Inch)']) || 0) + ((Number(row['Soot W']) || 0) / 8),
            height: (Number(row['Height (Inch)']) || 0) + ((Number(row['Soot H']) || 0) / 8),
            mmW: 0, mmH: 0, locationCode: '', glazingSpecs: ''
          };
        });

        const client = clients.find(c => c.name.toLowerCase() === String(clientName || '').toLowerCase());

        const newQuo: Quotation = {
          ...initialQuotation as Quotation,
          id: refId || `QT-IMP-${Date.now()}`,
          clientId: client?.id || '',
          projectName: projectName || '',
          date: date || new Date().toISOString().split('T')[0],
          company,
          items,
          status: 'Draft'
        };

        const all = await AsyncSalesService.getQuotations();
        if (all.some(q => q.id === newQuo.id)) {
            newQuo.id = `QT-IMP-${Date.now()}`;
        }

        // Phase-2 (2.6): per-row save — only the new row, not the whole table.
        await AsyncSalesService.saveQuotations([newQuo]);
        await refreshData();
        toast.success("Excel Quotation Imported as Draft", { duration: 3000 });
      } catch (err) {
        toast.error("Error reading Excel file", { duration: 4000 });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return {
    quotations,
    clients,
    products,
    isEditorOpen,
    setIsEditorOpen,
    searchTerm,
    setSearchTerm,
    sortType,
    setSortType,
    printingQuote,
    printMode,
    isMM,
    setIsMM,
    formData,
    setFormData,
    lastSerial,
    refreshData,
    handleSaveQuotation,
    updateGlassItem,
    addItem,
    addSection,
    duplicateItem,
    removeItem,
    handlePrintRequest,
    handleDeleteQuotation,
    handleExportExcel,
    handleExportJson,
    handleBulkExportJson,
    handleBulkExportExcel,
    handleImportJson,
    handleImportExcel
  };
};
