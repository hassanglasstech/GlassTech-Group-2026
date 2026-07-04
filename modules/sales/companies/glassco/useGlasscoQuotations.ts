import { useState, useEffect, useMemo } from 'react';
// P3-05: dropped unused `Company` and `PieceStatus` imports (never referenced).
import { Client, Quotation, QuotationItem, Product, ProductionPiece } from '@/modules/shared/types';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { allocateSerial } from '@/modules/sales/services/serialAllocator';
import { toast } from 'sonner';
import { ProductionService } from '@/modules/production/services/productionService';
import { calculateAutoRate, calculateLineItemTotal } from '@/modules/glassco/core/GlasscoUtils';
import { errMsg } from '@/modules/shared/services/utils';
import { Logger } from '@/modules/shared/services/logger';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';
import * as XLSX from 'xlsx';

// P1-22: narrow shape for the Excel import rows (was `as any[]`). Mismatched
// column headers now surface as typed `undefined` rather than silently
// populating QuotationItem with NaN/empty values.
interface ExcelImportRow {
  '#'?: string | number;
  Description?: string;
  'Glass Type'?: string;
  'Sub Category'?: string;
  Thickness?: string;
  Color?: string;
  Services?: string;
  'Width (Inch)'?: string | number;
  'Soot W'?: string | number;
  'Height (Inch)'?: string | number;
  'Soot H'?: string | number;
  Qty?: string | number;
  SqFt?: string | number;
  Rate?: string | number;
  Amount?: string | number;
}

export const useGlasscoQuotations = () => {
  const company = 'Glassco';
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [allQuotations, setAllQuotations] = useState<Quotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
    setIsLoading(true);
    try {
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

      // Phase-6 (6.6): auto-expire any Draft/Sent quotation past dueDate.
      // Fire-and-forget so refresh isn't blocked.
      // P2-02: log unexpected rejections instead of swallowing silently.
      _autoExpire(all).catch((e: unknown) => Logger.error('Sales', 'Glassco auto-expire rejected', e));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveQuotation = async (action: 'draft' | 'save' | 'approve', directData?: Quotation): Promise<void> => {
    // P2-05: this hook is Glassco-only. A directData passed from elsewhere could
    // carry a non-Glassco company and leak a row into the wrong company. Force
    // company = 'Glassco' before any validation or save.
    const dataToSave: Partial<Quotation> = { ...(directData || formData), company };
    if (!dataToSave.clientId) { toast.error("Client is required.", { duration: 4000 }); return; }

    // Validation: formal save/approve requires non-empty items + positive total
    if (action === 'save' || action === 'approve') {
      const nonSectionItems = (dataToSave.items || []).filter((i) => !i.isSection);
      if (nonSectionItems.length === 0) {
        toast.error("At least one line item is required before saving.", { duration: 4000 });
        return;
      }
      const totalAmount = nonSectionItems.reduce((s: number, i) => s + (Number(i.amount) || 0), 0);
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
        const clientRow = clientList.find((c) => c.id === dataToSave.clientId && c.company === company);
        const creditLimit = Number(clientRow?.creditLimit ?? 0);
        if (creditLimit > 0) {
          const subtotal = (dataToSave.items || [])
            .filter((i) => !i.isSection)
            .reduce((s: number, i) => s + (Number(i.amount) || 0), 0);
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
    // P2-01: capture the pre-approve status + orderNo so a piece-save failure
    // can fully restore the draft (id + orderNo + status) instead of leaving an
    // orphaned formal GT-SO row behind.
    const originalOrderNo = dataToSave.orderNo;
    const originalStatus = dataToSave.status;
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

    // P1-10: guarantee the minted Sales Order id is GLOBALLY UNIQUE. The two
    // approve paths draw GT-SO ids from overlapping serial sources — a
    // direct-approved Draft allocates a FRESH GT-SO serial (seed 2523) while a
    // converted GT-QUT KEEPS its QUT serial (also seeded 2523) — so both can mint
    // GT-SO-GLS-<mmyy>-2523 in the same month, and the quotations upsert
    // (onConflict:'id') would then SILENTLY OVERWRITE the earlier sales order (a
    // lost financial document). Keep the QUT->SO number when it is free
    // (traceability); if the minted id already belongs to a DIFFERENT document,
    // allocate a fresh GT-SO serial until it is unique.
    if (action === 'approve' && finalId && finalId.startsWith('GT-SO-')) {
        try {
            const _existingQuos = await AsyncSalesService.getQuotations();
            const _clashes = (id: string) => _existingQuos.some(q => q.id === id && q.id !== originalId);
            let _guard = 0;
            while (_clashes(finalId!) && _guard < 50) {
                const _seq = await allocateSerial(company, 'GT-SO', year, 2523);
                finalId = `GT-SO-GLS-${mmyy}-${String(_seq).padStart(4, '0')}`;
                _guard++;
            }
        } catch { /* offline / read failed — keep finalId (best-effort uniqueness) */ }
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
    } catch (e: unknown) {
      toast.error(`Save failed: ${errMsg(e)}`, { duration: 8000 });
      return;
    }

    // 2.4: pieces save AFTER quotation is in Supabase — MFG-1 ghost-order
    // check now passes because the order id exists. Wrap in try/catch so
    // a piece-save failure rolls the order back to Draft (not silently lost).
    if (action === 'approve') {
      try {
        const currentPieces = ProductionService.getProductionPieces();
        const orderRef = finalOrderNo || finalId || '';

        // ── P1-25: collision-safe, company-scoped piece-id prefix ──
        // Previously the prefix was just the last-4 numeric digits, so two
        // orders from different months with the same trailing serial (e.g.
        // GT-SO-GLS-0626-2523 vs GT-SO-GLS-0126-2523) both produced `GLS-2523`
        // → new piece IDs collided and a re-approve overwrote the other
        // order's pieces (upsert onConflict: 'id'). Include the full MMYY+seq
        // segment so piece IDs are globally unique across months/orders.
        const segMatch = orderRef.match(/GLS-(\d{4})-(\d+)$/);
        const piecePrefix = segMatch
          ? `GLS-${segMatch[1]}-${segMatch[2].slice(-4)}`
          : `GLS-${orderRef.replace(/[^A-Z0-9]/gi, '-').slice(-12) || '0000'}`;

        // ── Phase-3 (3.3): preserve in-progress pieces on re-approve ──
        // Audit I3: previous `currentPieces.filter(p => !p.id.startsWith(...))`
        // wiped Tempered / Delivered / QC-Passed pieces. Now: scoped by
        // orderId (canonical), preserve non-Cut pieces first, fill the
        // shortfall with new Cut pieces.
        const piecesForThisOrder = currentPieces.filter(p => p.orderId === finalOrderNo);
        const otherOrderPieces  = currentPieces.filter(p => p.orderId !== finalOrderNo);

        const existingByIdx: Record<number, ProductionPiece[]> = {};
        piecesForThisOrder.forEach(p => {
          const idx = Number(p.itemIndex ?? 0);
          (existingByIdx[idx] ||= []).push(p);
        });

        const newOrderPieces: ProductionPiece[] = [];
        let globalSerialCounter = 1;

        finalQuo.items.forEach((item, idx) => {
          if (item.isSection) return;
          const desired = Number(item.qty) || 0;

          // Sort: non-Cut (in-progress, valuable) first → consumed first
          // Not-yet-started pieces (Pending-Cut pool or just-Cut) are the least
          // valuable to preserve on re-approve — sort them last.
          const notStarted = (s: string) => s === 'Cut' || s === 'Pending-Cut';
          const existing = (existingByIdx[idx] || []).slice().sort((a, b) => {
            const aLow = notStarted(a.status);
            const bLow = notStarted(b.status);
            return aLow === bLow ? 0 : (aLow ? 1 : -1);
          });

          // Preserve up to `desired` existing pieces (priority: in-progress)
          const preserved = existing.slice(0, desired);
          preserved.forEach(p => {
            newOrderPieces.push(p);
            // Track highest serial so new pieces don't collide
            const m = (p.id || '').match(/\/(\d+)$/);
            if (m) {
              const n = parseInt(m[1], 10);
              if (Number.isFinite(n) && n >= globalSerialCounter) globalSerialCounter = n + 1;
            }
          });

          // Create new pieces for the shortfall in the 'Pending-Cut' pool
          // (083_cutter_workflow): the assigned cutter moves each Pending-Cut
          // piece → 'Cut'. Already-dispatched legacy orders skip straight to
          // Delivered as before.
          const shortfall = Math.max(0, desired - preserved.length);
          for (let i = 0; i < shortfall; i++) {
            newOrderPieces.push({
              id: `${piecePrefix}/${globalSerialCounter}`,
              orderId: finalOrderNo!,
              itemIndex: idx,
              specs: `${item.width}x${item.height} ${item.glassSize || '5mm'} ${item.glassType || 'Plain'}`,
              status: (finalQuo.isAlreadyDispatched ? 'Delivered' : 'Pending-Cut') as any,
              lastUpdated: new Date().toISOString(), isRevised: false,
              company,                                       // P1-11: stamp owning company at creation
              serviceOnly: (item as any).serviceOnly || false, // client-supplied glass → no glass COGS at delivery
            });
            globalSerialCounter++;
          }
        });

        // Detect orphaned pieces (item removed or qty reduced) — preserve them
        // and warn the user, never silently delete production work in flight.
        const keptIds = new Set(newOrderPieces.map(p => p.id));
        const orphaned = piecesForThisOrder.filter(p => !keptIds.has(p.id));
        if (orphaned.length > 0) {
          toast.warning(
            `${orphaned.length} production piece(s) for ${finalOrderNo} no longer match the quotation (item removed or qty reduced). Preserved — review in Production module.`,
            { duration: 9000 }
          );
          newOrderPieces.push(...orphaned);
        }

        // MFG-1 scope fix: the order (finalOrderNo) was just persisted above via
        // saveQuotations, so it is known-valid; and otherOrderPieces are already-
        // persisted pieces of PRIOR orders that we only re-save to preserve them.
        // Re-validating the whole array let a single stale prior order (whose
        // quotation was since deleted) throw GhostOrderError and roll THIS order
        // back to Draft. Pass [] so no false-positive ghost-check runs here.
        await ProductionService.saveProductionPieces(
          [...otherOrderPieces, ...newOrderPieces],
          { validateOrderIds: [] },
        );
      } catch (pieceErr: unknown) {
        // Roll back: revert the order to Draft so the user can fix and retry.
        toast.error(
          `Order ${finalOrderNo} saved but production pieces failed: ${errMsg(pieceErr)}. ` +
          `Order rolled back to Draft — review and re-approve.`,
          { duration: 12000 }
        );
        try {
          // P2-01: restore the row under its ORIGINAL draft id/orderNo/status.
          // When approve minted a new formal id (finalId !== originalId), the
          // original draft row was already deleted above — re-persist it under
          // originalId and remove the orphaned formal row so no ghost GT-SO id
          // is left lingering as a Draft.
          const restored: Quotation = {
            ...finalQuo,
            id: originalId || finalQuo.id,
            status: (originalStatus || 'Draft'),
            orderNo: originalOrderNo,
          };
          await AsyncSalesService.saveQuotations([restored]);
          if (finalId && finalId !== restored.id) {
            await AsyncSalesService.deleteQuotation(finalId);
          }
        } catch { /* swallow rollback errors — user already notified */ }
        return;
      }
    }

    setFormData(finalQuo);

    // Always close editor and return to list after save
    setIsEditorOpen(false);
    // P2-34: refreshData is async — await it directly instead of a 200ms
    // setTimeout race (the timeout could fire before Supabase had committed).
    await refreshData();

    if (action === 'approve') {
        // P1-flow: approving moves the record out of the quotation list into
        // Sales Orders. Tell the user where it went + offer a one-click jump
        // (tabs are URL-driven, so setting the hash switches tabs).
        toast.success(`Approved as ${finalOrderNo}`, {
            description: 'A Sales Order was created — find it in the Sales Orders tab.',
            action: { label: 'View Orders', onClick: () => { window.location.hash = '#/sales?tab=orders'; } },
            duration: 6000,
        });
    } else if (action === 'draft') {
        toast.success(`Draft saved: ${finalId}`, { duration: 3000 });
    } else {
        toast.success(`Quotation saved: ${finalId}`, { duration: 3000 });
    }
  };

  const updateGlassItem = async (index: number, field: string, value: unknown) => {
    if (formData.status === 'Approved' && index !== -1) return;

    if (index === -1) {
        setFormData(prev => ({ ...prev, [field]: value }));
        return;
    }

    const nextItems = [...(formData.items || [])];
    const item = { ...nextItems[index] };
    
    (item as any)[field] = value;

    if (['glassSize', 'glassType', 'subCategory', 'glassColor', 'selectedServices', 'serviceOnly'].includes(field)) {
        item.pricePerUnit = calculateAutoRate(
            item.glassSize || '5mm',
            item.glassType || 'Plain',
            item.subCategory || 'Standard',
            item.selectedServices || [],
            products,
            item.glassColor,
            (item as any).serviceOnly           // SERVICE ONLY → glass base rate excluded
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
    width: 0, height: 0, glassSize: '5mm', glassType: 'Plain', subCategory: 'Standard', selectedServices: [], serviceOnly: false,
    totalSqFt: 0, pricePerUnit: calculateAutoRate('5mm', 'Plain', 'Standard', [], products), amount: 0,
    locationCode: '', glazingSpecs: '', inputUnit: isMM ? 'MM' : 'Inch'
  });

  // P3-02: removed unused DEFAULT_ROW_COUNT constant.

  // P3-04: explicit return types on trivial handlers.
  const addItem = (): void => {
    const newItem = makeBlankItem();
    setFormData(prev => ({ ...prev, items: [...(prev.items || []), newItem] }));
  };

  const addSection = (): void => {
      setFormData(prev => ({ ...prev, items: [...(prev.items || []), { id: `SEC-${Date.now()}`, isSection: true, description: '', qty: 0, width: 0, height: 0, totalSqFt: 0, pricePerUnit: 0, amount: 0, locationCode: '', glazingSpecs: '' }] }));
  };

  const duplicateItem = (idx: number): void => {
      setFormData(prev => {
          const next = [...(prev.items || [])];
          const original = next[idx];
          const copy = { ...original, id: `ITM-DUP-${Date.now()}-${idx}`, isRevised: false };
          next.splice(idx + 1, 0, copy);
          return { ...prev, items: next };
      });
  };

  const removeItem = (idx: number): void => {
    setFormData(prev => {
        const next = [...(prev.items || [])];
        next.splice(idx, 1);
        return { ...prev, items: next };
    });
  };

  const handlePrintRequest = (q: Quotation, mode: 'Quotation' | 'SalesOrder' | 'JobCard'): void => {
      setPrintMode(mode);
      setPrintingQuote(q);
      // P3-03: prefer the onafterprint event to clear the print state (fires
      // when the print dialog closes), with the fixed timeout only as a
      // fallback in case onafterprint never fires (some embedded browsers).
      const delay = mode === 'JobCard' ? 2500 : 800;
      let cleared = false;
      const clear = () => {
        if (cleared) return;
        cleared = true;
        window.removeEventListener('afterprint', clear);
        setPrintingQuote(null);
      };
      window.addEventListener('afterprint', clear);
      setTimeout(() => {
        window.print();
        // Fallback safety net — onafterprint should normally have fired first.
        setTimeout(clear, 1500);
      }, delay);
  };

  const handleDeleteQuotation = async (id: string): Promise<void> => {
      if (await confirmModal("Delete this quotation? The ID will not be reused.")) {
          // P2-21: wrap the async delete + refresh so a failed delete surfaces a
          // toast instead of an unhandled rejection.
          try {
            // Phase-2 (2.6): per-row delete (was full-table overwrite, race-prone).
            await AsyncSalesService.deleteQuotation(id);
            await refreshData();
          } catch (e: unknown) {
            toast.error(`Delete failed: ${errMsg(e)}`, { duration: 6000 });
          }
      }
  };

  // ── P3: bulk actions over selected quotations ─────────────────────────
  // One confirm / toast / refresh instead of looping the per-row handlers
  // (which would spam N dialogs and trigger N refreshes).
  const handleBulkMarkSent = async (ids: string[]): Promise<void> => {
    const sendable = quotations.filter(q => ids.includes(q.id) && q.status === 'Draft');
    if (sendable.length === 0) { toast.error('Select Draft quotation(s) to mark Sent.'); return; }
    const now = new Date().toISOString();
    try {
      await AsyncSalesService.saveQuotations(
        sendable.map(q => ({ ...q, status: 'Sent', statusChangedAt: now }) as Quotation & Record<string, unknown>)
      );
      toast.success(`${sendable.length} quotation(s) marked Sent.`, { duration: 3000 });
      await refreshData();
    } catch (e: unknown) { toast.error(`Bulk update failed: ${errMsg(e)}`); }
  };

  const handleBulkDelete = async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    if (!await confirmModal(`Delete ${ids.length} quotation(s)? IDs will not be reused.`)) return;
    try {
      for (const id of ids) await AsyncSalesService.deleteQuotation(id);
      toast.success(`${ids.length} quotation(s) deleted.`, { duration: 3000 });
      await refreshData();
    } catch (e: unknown) { toast.error(`Bulk delete failed: ${errMsg(e)}`); }
  };

  // ── Phase-6 (6.6): Quotation status state machine ─────────────────────
  // Audit B6: status type allowed Sent / Rejected / Lost / Expired but UI
  // never set them. Pipeline analytics (win rate, conversion, sent vs lost)
  // were unmeasurable. These handlers + GlasscoList buttons close the loop.
  // Per-row save (2.6 pattern) — never overwrite the full table.
  const _transitionStatus = async (q: Quotation, next: 'Sent' | 'Rejected' | 'Lost' | 'Draft' | 'Expired', reason?: string): Promise<void> => {
    const updated: Quotation & Record<string, unknown> = { ...q, status: next };
    if (reason) updated.statusReason = reason;
    updated.statusChangedAt = new Date().toISOString();
    try {
      await AsyncSalesService.saveQuotations([updated]);
      toast.success(`${q.id} → ${next}`, { duration: 3000 });
      await refreshData();
    } catch (e: unknown) {
      toast.error(`Status update failed: ${errMsg(e)}`);
    }
  };

  const handleMarkSent = (q: Quotation): Promise<void> | undefined => {
    if (q.status !== 'Draft') { toast.error("Only Draft quotations can be marked Sent."); return; }
    return _transitionStatus(q, 'Sent');
  };

  const handleReject = (q: Quotation): Promise<void> | undefined => {
    if (q.status === 'Approved' || q.status === 'Invoiced') {
      toast.error("Approved / Invoiced quotations cannot be rejected — issue Credit Note or Void instead.");
      return;
    }
    // P2-16: no styled text-prompt modal exists (ConfirmDialog is confirm-only),
    // so keep window.prompt but treat Cancel (null) as "abort the transition"
    // instead of silently rejecting with an empty reason.
    const reason = prompt('Reject reason (optional):');
    if (reason === null) return;
    return _transitionStatus(q, 'Rejected', reason);
  };

  const handleMarkLost = (q: Quotation): Promise<void> | undefined => {
    if (q.status === 'Approved' || q.status === 'Invoiced' || q.status === 'Paid') {
      toast.error("Won / Invoiced / Paid quotations cannot be marked Lost.");
      return;
    }
    // P2-16: keep window.prompt (no styled prompt modal available) but abort
    // the transition when the user cancels (null) rather than marking Lost with
    // an empty reason.
    const reason = prompt('Lost reason (e.g. price, competitor, project cancelled):');
    if (reason === null) return;
    return _transitionStatus(q, 'Lost', reason);
  };

  const handleReopen = (q: Quotation): Promise<void> | undefined => {
    if (q.status !== 'Rejected' && q.status !== 'Lost' && q.status !== 'Expired') {
      toast.error("Only Rejected / Lost / Expired quotations can be reopened to Draft.");
      return;
    }
    return _transitionStatus(q, 'Draft');
  };

  // Auto-expire: non-terminal quotations past dueDate get flipped to Expired.
  // Runs once per refreshData. Idempotent — only touches Draft/Sent rows.
  const _autoExpire = async (all: Quotation[]): Promise<void> => {
    const today = new Date().toISOString().split('T')[0];
    const candidates = all.filter(q =>
      q.company === company &&
      (q.status === 'Draft' || q.status === 'Sent') &&
      q.dueDate && q.dueDate < today
    );
    if (candidates.length === 0) return;
    // P3-06: was `...(q as any)` — use a typed intersection so the extra
    // statusReason/statusChangedAt fields are allowed without `any`.
    const expired: (Quotation & Record<string, unknown>)[] = candidates.map(q => ({
      ...q,
      status: 'Expired',
      statusReason: 'Auto-expired (dueDate passed)',
      statusChangedAt: new Date().toISOString(),
    }));
    try {
      await AsyncSalesService.saveQuotations(expired);
      toast.info(`${expired.length} quotation(s) auto-expired (past due date).`, { duration: 5000 });
    } catch (e: unknown) {
      // P2-02: was a silent empty catch — surface the failure via Logger so a
      // broken auto-expire is visible (ops can still mark expired manually).
      Logger.error('Sales', 'Glassco auto-expire failed', e);
    }
  };

  const handleExportExcel = (q: Quotation): void => {
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

  const handleExportJson = (q: Quotation): void => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(q, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${q.id}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleBulkExportJson = (): void => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(quotations, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `Glassco_Bulk_Export_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleBulkExportExcel = (): void => {
    const data: Record<string, unknown>[] = [];
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

  const handleImportJson = (file: File): void => {
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

  const handleImportExcel = (file: File): void => {
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

        const rows = XLSX.utils.sheet_to_json<ExcelImportRow>(firstSheet, { range: 10 });

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
    isLoading,
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
    handleBulkMarkSent,
    handleBulkDelete,
    handleExportExcel,
    handleExportJson,
    handleBulkExportJson,
    handleBulkExportExcel,
    handleImportJson,
    handleImportExcel,
    // Phase-6 (6.6) — quotation state machine
    handleMarkSent,
    handleReject,
    handleMarkLost,
    handleReopen,
  };
};
