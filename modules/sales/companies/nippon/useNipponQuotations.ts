import { useState, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { Company, Client, Quotation, QuotationItem, Product } from '@/modules/shared/types';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { StoreItem, ProductComponent } from '@/modules/procurement/types/inventory';
import { Logger } from '@/modules/shared/services/logger';
import { nipponImageUrl } from '@/modules/shared/components/ProductImage';
import { issueNipponOrder } from './nipponFulfilmentService';
import { NipponPriceList, resolveClientRate } from './nipponPricing';

// TEMP (inventory module not live yet): stock balances are still 0 because GRN /
// opening-balance intake isn't wired, so a hard stock gate blocks every approval.
// While false, approval proceeds on zero/short stock (stock is clamped at 0, never
// negative) and the user just gets a non-blocking heads-up. Flip to `true` once
// inventory go-live so over-selling is blocked again.
const ENFORCE_STOCK_ON_APPROVE = false;

export const useNipponQuotations = () => {
  const company: Company = 'Nippon';
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [priceLists, setPriceLists] = useState<NipponPriceList[]>([]);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [printingQuote, setPrintingQuote] = useState<Quotation | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const initialQuotation: Partial<Quotation> = {
    date: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    clientId: '',
    projectName: '',
    items: [],
    status: 'Draft',
    discountPercent: 0,
    discountAmount: 0,
  };

  const [formData, setFormData] = useState<Partial<Quotation>>(initialQuotation);

  const subTotal = formData.items?.reduce((s, i) => s + i.amount, 0) || 0;

  const lastSerial = useMemo(() => {
    const all = quotations.filter(q => q.company === company && q.manualSerial);
    if (all.length === 0) return '0000';
    const sorted = all.sort((a, b) => b.date.localeCompare(a.date) || (b.manualSerial || '').localeCompare(a.manualSerial || ''));
    return sorted[0].manualSerial;
  }, [quotations]);

  useEffect(() => {
    refreshData();
    
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const refreshData = async () => {
    const all = await AsyncSalesService.getQuotations();
    // Keep approved orders in the list too — they become Sales Orders and the user
    // needs to find, re-print (Sales Order layout) and track them by serial. The
    // list already badges status and hides Edit/Approve/Delete for approved rows.
    setQuotations(all.filter(q => q.company === company).sort((a,b) => b.id.localeCompare(a.id)));
    
    const allClients = await AsyncSalesService.getClients();
    setClients(allClients.filter(c => c.company === company));
    
    const allProducts = await AsyncSalesService.getProducts();
    setProducts(allProducts.filter(p => p.company === company));

    // IC-P1: customer / transfer-price lists — used to auto-apply a linked
    // customer's negotiated rate over the product-master rate.
    const allLists = await AsyncSalesService.getPriceLists();
    setPriceLists((allLists as unknown as NipponPriceList[]).filter(l => l.company === company));

    // Pull stock from Supabase first (async); fall back to localStorage in the
    // service. Filter to Nippon defensively in case authStore.company is empty.
    const allStore = await InventoryService.getStoreAsync();
    setStoreItems(allStore.filter(s => !s.company || s.company === company));
  };

  const handleAddSection = (title?: string, index?: number) => {
    setFormData(prev => {
      const newItems = [...(prev.items || [])];
      const newSection: QuotationItem = { 
        id: `SEC-${Date.now()}`, 
        isSection: true, 
        description: title || '', 
        qty: 0, width: 0, height: 0, totalSqFt: 0, pricePerUnit: 0, amount: 0, locationCode: '', glazingSpecs: '' 
      };
      if (index !== undefined) {
        newItems.splice(index + 1, 0, newSection);
      } else {
        newItems.push(newSection);
      }
      return { ...prev, items: newItems };
    });
  };

  const handleAddItem = (index?: number) => {
    const newItem: QuotationItem = {
      id: `ITM-${Date.now()}`, 
      description: '', 
      locationCode: '', 
      glazingSpecs: '', // Brand
      glassSize: 'PCS', 
      qty: 1, 
      width: 0, height: 0, totalSqFt: 0,
      pricePerUnit: 0, 
      amount: 0, 
    };
    setFormData(prev => {
      const newItems = [...(prev.items || [])];
      if (index !== undefined) {
        newItems.splice(index + 1, 0, newItem);
      } else {
        newItems.push(newItem);
      }
      return { ...prev, items: newItems };
    });
  };

  const updateItem = (index: number, field: string, value: unknown) => {
    setFormData(prev => {
      const next = [...(prev.items || [])];
      const item = { ...next[index], [field]: value };
      
      if (!item.isSection) {
        // If description is updated, we might be selecting a product
        // But we handle explicit selection in the UI for better control.
        // A per-line sample is free → amount forced to 0.
        item.amount = item.isSample ? 0 : (Number(item.qty) || 0) * (Number(item.pricePerUnit) || 0);
      }
      
      next[index] = item;
      return { ...prev, items: next };
    });
    // ── Set suggestion: if product is part of a set, prompt user ──
    // `prod` was orphaned from an earlier refactor — would have crashed at
    // runtime as ReferenceError. Resolve from the value when the field
    // looks like a product selection; bail out otherwise.
    const maybeProduct = (field === 'productId' || field === 'product') ? value : null;
    const prod = maybeProduct as Product | null;
    if (prod && prod.isSet && prod.setComponents && prod.setComponents.length > 0) {
      setPendingSetSuggestion({
        index,
        setProduct: prod,
        remainingComponents: prod.setComponents,
      });
    }
  };

  // ── Set suggestion state ───────────────────────────────────────────
  const [pendingSetSuggestion, setPendingSetSuggestion] = useState<{
    index: number;
    setProduct: Product;
    remainingComponents: ProductComponent[];
  } | null>(null);

  const addFullSet = (index: number, setProduct: Product, allProducts: Product[]) => {
    // Find all products that belong to this set (by setId / profileCode match)
    const setMembers = allProducts.filter(p =>
      p.setId === setProduct.id || p.id === setProduct.id ||
      ((setProduct.setComponents as Array<{ id?: string; description?: string }> | undefined) || []).some((c) => c.id === p.id || c.description === p.description)
    );
    setFormData(prev => {
      const newItems = [...(prev.items || [])];
      const setHeading = {
        id: `SET-HDR-${Date.now()}`,
        description: `${setProduct.description} (SET)`,
        isSection: true,
        qty: 0, width: 0, height: 0, totalSqFt: 0,
        pricePerUnit: 0, amount: 0,
        locationCode: '', glazingSpecs: '', glassSize: '',
        isSetHeader: true,
        setId: setProduct.id,
      };
      // Replace current line with set header + members
      const memberItems = setMembers.map((mp: Product, mi: number) => ({
        id: `SET-ITM-${Date.now()}-${mi}`,
        description: mp.description,
        locationCode: mp.profileCode || '',
        glazingSpecs: mp.brand || '',
        glassSize: mp.unit || 'PCS',
        qty: 1,
        width: 0, height: 0, totalSqFt: 0,
        pricePerUnit: mp.basePrice || 0,
        amount: mp.basePrice || 0,
        attachedImage: mp.imageUrl || nipponImageUrl(mp.modelNo || mp.profileCode),
        setId: setProduct.id,
        isSetMember: true,
      }));
      newItems.splice(index, 1, setHeading, ...memberItems);
      return { ...prev, items: newItems };
    });
    setPendingSetSuggestion(null);
  };

  const selectProduct = (index: number, prod: Product) => {
    setFormData(prev => {
      const next = [...(prev.items || [])];
      const item = { ...next[index] };
      
      const specs = [
        prod.thickness,
        prod.sheetSize,
        prod.finishColor,
        prod.material,
        prod.glassType,
        prod.subCategory,
        prod.modelNo,
        prod.direction,
        prod.tongueLength,
        prod.spindleLength,
        prod.profileRole,
        prod.systemSubClass,
        ...(prod.technicalSpecs ? Object.values(prod.technicalSpecs) : [])
      ].filter(Boolean).join(' | ');

      // Nippon: clean description only — no specs in parens, no internal ID prefix.
      // locationCode = modelNo (visible item code on print/editor).
      // productRef  = prod.id  (internal ID used for inventory decrement — never shown).
      let desc = prod.description || prod.name || '';
      if (prod.isSet && prod.setComponents && prod.setComponents.length > 0) {
          const compNames = (prod.setComponents as Array<{ description?: string; qtyPerSet?: number; unit?: string }>).map((c) => `${c.description} (${c.qtyPerSet} ${c.unit})`).join(', ');
          desc += `\n[Includes: ${compNames}]`;
      }

      item.description = desc;
      // Show the same code the dropdown showed: ERP model no first, then the
      // KinLong/item code, then the id. Was modelNo-only, so it came up blank
      // for store rows whose product wasn't matched (stub) or had no modelNo.
      item.locationCode = prod.modelNo || prod.itemCode || prod.profileCode || prod.id || '';
      item.productRef   = prod.id;
      // IC-P1: if the selected customer has an assigned price list with a
      // negotiated rate for this product, it wins over the master rate.
      const custRate = resolveClientRate(prev.clientId, priceLists)(prod.id);
      item.pricePerUnit = (custRate !== undefined && custRate > 0)
        ? custRate
        : (prod.price || prod.basePrice || 0);
      item.glassSize = prod.unit || 'PCS';
      item.glazingSpecs = prod.brand || ''; // Brand
      item.amount = (Number(item.qty) || 1) * (Number(item.pricePerUnit) || 0);
      // Fall back to the bucket URL derived from the code (NIP-KL-<code>.png) so
      // images print even when the product's image_url field is blank — same
      // convention the Material Master uses via <ProductImage>.
      item.attachedImage = prod.imageUrl || prod.image || nipponImageUrl(prod.modelNo || prod.profileCode);
      
      next[index] = item;
      return { ...prev, items: next };
    });
  };

  // IC-P1: set the order's customer AND re-price existing lines from that
  // customer's assigned price list. Only fires on an explicit customer change
  // (wired to the client <select>), so opening a saved order never re-prices it.
  // Manual per-line rate edits made afterwards are preserved.
  const applyClientPricing = (clientId: string) => {
    const resolver = resolveClientRate(clientId, priceLists);
    setFormData(prev => {
      const items = (prev.items || []).map(it => {
        if (it.isSection || it.isSample || !it.productRef) return it;
        const r = resolver(it.productRef);
        if (r === undefined || r <= 0) return it;
        return { ...it, pricePerUnit: r, amount: (Number(it.qty) || 0) * r };
      });
      return { ...prev, clientId, items };
    });
  };

  // Mark/unmark a single line as a free sample. When on, amount → 0 (given free)
  // while the price stays visible; when off, amount recomputes from qty × price.
  const toggleItemSample = (index: number) => {
    setFormData(prev => {
      const next = [...(prev.items || [])];
      const cur = next[index];
      if (!cur || cur.isSection) return prev;
      const isSample = !cur.isSample;
      next[index] = {
        ...cur,
        isSample,
        amount: isSample ? 0 : (Number(cur.qty) || 0) * (Number(cur.pricePerUnit) || 0),
      };
      return { ...prev, items: next };
    });
  };

  const handleRemoveItem = (index: number) => {
    setFormData(prev => {
      const next = [...(prev.items || [])];
      next.splice(index, 1);
      return { ...prev, items: next };
    });
  };

  const handleDuplicateItem = (index: number) => {
    setFormData(prev => {
      const next = [...(prev.items || [])];
      const original = next[index];
      const copy = { ...original, id: `ITM-DUP-${Date.now()}-${index}` };
      next.splice(index + 1, 0, copy);
      return { ...prev, items: next };
    });
  };

  const handleSave = async (approve: boolean, quoteOverride?: Partial<Quotation>, revise = false) => {
    if (isSaving) return;

    // Approve-from-list passes the row explicitly via quoteOverride. Without it,
    // the list button did `setFormData(q); handleSave(true)` — but setFormData is
    // an async React setter, so handleSave read the STALE formData closure (usually
    // the empty initial quote). That fired a misleading "Client is required" error
    // or, if a prior quote was loaded, approved the WRONG quote. Prefer the override.
    const src = quoteOverride ?? formData;

    // required-field + business validation
    if (!src.clientId) return toast.error("Client is required.");
    if (!src.manualSerial) return toast.error("Serial Number is required.");

    const lineItems = (src.items || []).filter(i => !i.isSection);
    if (lineItems.length === 0) return toast.error("Add at least one item before saving.");

    const itemsSubtotal = lineItems.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    if (itemsSubtotal <= 0) return toast.error("Quotation total must be greater than zero.");

    // block edit-after-approval to prevent inventory double-decrement.
    // Once approved, the quote becomes a Sales Order — edits must go through
    // credit notes / amendments, not direct re-save.
    if (src.status === 'Approved' && !revise) {
      return toast.error("This is a Sales Order — use Edit / Revise on the Sales Orders tab to amend it.");
    }

    setIsSaving(true);
    try {
      // Pre-flight stock check (over-sell guard): validate availability BEFORE
      // persisting the approval. Previously the quote was saved as 'Approved' in
      // the cloud and only THEN did saveStore throw InsufficientStockError —
      // leaving an approved Sales Order with stock never decremented plus a
      // cryptic "Save failed" the solo user could not act on. Block up-front
      // with a clear, actionable message instead.
      if (approve) {
        const stock = InventoryService.getStore();
        const shortfalls: string[] = [];
        lineItems.forEach(item => {
          const si = stock.find(s => s.id === (item.productRef || item.locationCode));
          if (!si) return; // unmatched (service / set) lines are not stock-controlled here
          const available = (si.unrestrictedQty ?? si.quantity ?? 0);
          const need = Number(item.qty) || 0;
          if (available < need) {
            shortfalls.push(`• ${item.description || si.name || si.id}: need ${need}, have ${available}`);
          }
        });
        if (shortfalls.length > 0) {
          if (ENFORCE_STOCK_ON_APPROVE) {
            // Inventory live → block over-selling up-front with an actionable message.
            toast.error(`Not enough stock to approve — receive via Hardware GRN first:\n${shortfalls.join('\n')}`);
            return;
          }
          // Inventory not live yet → let the Sales Order through, just warn.
          toast.warning(`Sales Order created with a stock shortfall (inventory pending). Receive via Hardware GRN later:\n${shortfalls.join('\n')}`);
        }
      }

      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yy = String(now.getFullYear()).slice(-2);
      const mmyy = `${mm}${yy}`;

      const all = await AsyncSalesService.getQuotations();

      const isDuplicate = all.some(q =>
          q.company === company &&
          q.manualSerial === src.manualSerial &&
          q.id !== src.id
      );
      if (isDuplicate) {
        toast.error(`Serial Number ${src.manualSerial} is already used.`);
        return;
      }

      let finalId = src.id;
      if (!finalId) finalId = `QT-${mmyy}-${src.manualSerial}`;

      // Revision: editing an existing Sales Order keeps its Approved status and
      // stamps an -R<n> marker on the ref so a revised order is identifiable at a
      // glance. No stock re-decrement (that happened at first approval).
      const baseRef = (src.orderNo || `SO-${mmyy}-${src.manualSerial}`).replace(/-R\d+$/, '');
      const prevRev = (src.orderNo || '').match(/-R(\d+)$/);
      const revisedRef = `${baseRef}-R${prevRev ? Number(prevRev[1]) + 1 : 1}`;

      const nowIso = now.toISOString();
      const finalQuo: Quotation = {
        ...(src as Quotation),
        id: finalId!,
        company,
        status: (revise || approve) ? 'Approved' : 'Draft',
        orderNo: revise ? revisedRef : (approve ? `SO-${mmyy}-${src.manualSerial}` : undefined),
        // Customer-portal lifecycle stamps (ride in the data jsonb). quotedAt is
        // set the first time the desk saves a customer query as a real quotation —
        // that's the "Quoted" milestone the customer sees (and unlocks their PDF).
        // approvedAt is the "Approved" milestone. Both preserved once set.
        quotedAt: src.customerPlaced ? (src.quotedAt || nowIso) : src.quotedAt,
        approvedAt: (approve || revise) ? (src.approvedAt || nowIso) : src.approvedAt,
      };

      // The quotations→clients FK rejects the insert unless a client row with THIS
      // exact client_id exists in the cloud. That breaks when the quote references
      // a client that never synced OR whose id drifted (stale reference). Guarantee
      // the row exists BEFORE the quote: look the client up in the fresh cloud∪local
      // set, and if it truly isn't there, synthesise a minimal client from the
      // quote's own clientId/clientName so the sale is never blocked on a cryptic FK.
      if (src.clientId) {
        const freshClients = await AsyncSalesService.getClients();
        const found = freshClients.find(c => c.id === src.clientId)
                   || clients.find(c => c.id === src.clientId);
        const clientRow: Client = found
          ? { ...found, company }
          : {
              id: src.clientId, company, name: (src as { clientName?: string }).clientName || src.clientId,
              contactPerson: '', email: '', phone: '', address: '', ntn: '',
              creditLimit: 0, status: 'Active', createdAt: new Date().toISOString(),
            } as Client;
        const cliRes = await AsyncSalesService.saveClients([clientRow]);
        if (cliRes?.error) {
          // The quotation FK (fk_quotations_client) needs this parent in the
          // cloud first. Surface the real cause here instead of the cryptic FK
          // error the child save would otherwise throw.
          toast.error(`Customer could not be saved to cloud — order not saved. ${cliRes.error}`, { duration: 9000 });
          return;
        }
      }

      // Persist the quote, then decrement inventory ONLY on a confirmed cloud
      // save. saveQuotations now reports cloud failures instead of swallowing them
      // — if the cloud write fails (FK / RLS / offline) we must NOT touch stock,
      // or we get "stock minus but order not saved".
      const saveRes = await AsyncSalesService.saveQuotations([...all.filter(x => x.id !== finalQuo.id), finalQuo]);
      if (saveRes?.error) {
        toast.error(`Order NOT saved to cloud — inventory left unchanged. ${saveRes.error}`, { duration: 9000 });
        return;
      }

      if (approve) {
        const currentStore = InventoryService.getStore();
        const updatedStore = [...currentStore];
        const uncostedItems: string[] = [];   // names sold with no product-master cost

        finalQuo.items.forEach(item => {
          if (item.isSection) return;
          // Resolve the REAL product id. productRef should hold it, but a manually
          // typed line only carries locationCode (the visible code) — match that
          // back to a product so we decrement the existing seeded row
          // (id = NIP-KL-…) instead of creating an orphan row keyed by the bare
          // code, which would otherwise show up under "Uncategorized" in stock.
          const matched = products.find(p =>
            (item.productRef && p.id === item.productRef) ||
            (item.locationCode && (p.id === item.locationCode || p.modelNo === item.locationCode || p.profileCode === item.locationCode))
          );
          const refId = matched?.id || item.productRef || item.locationCode;
          if (!refId) return;
          const storeIdx = updatedStore.findIndex(s => s.id === refId);
          const need = Number(item.qty) || 0;
          if (storeIdx !== -1) {
            // EPIC 1 — approve = RESERVE, not physical issue. Move qty from
            // available (unrestrictedQty) into reservedQty; the physical on-hand
            // (quantity) stays until the store issues it (issueOrder). This keeps
            // inventory on the books until delivery (IFRS: relieve at control
            // transfer) and gives the store a real "pending issue" queue.
            // Available may go negative (Nippon oversell) → signals "receive/GRN".
            updatedStore[storeIdx] = {
              ...updatedStore[storeIdx],
              reservedQty: (updatedStore[storeIdx].reservedQty || 0) + need,
              unrestrictedQty: (updatedStore[storeIdx].unrestrictedQty || 0) - need,
              lastMovementDate: new Date().toISOString(),
            };
          } else {
            // No stock row yet → create one at negative qty (keyed by the real
            // product id when matched) so it shows in "Needs stock-taking".
            // seed MAP from the product-master COST (matched.costPrice) —
            // NOT item.pricePerUnit (the SELLING price). Seeding the selling price
            // made delivery COGS == revenue (0 gross profit) and drove inventory
            // 11514 negative by the full sale value. No cost on the product yet →
            // seed 0 and flag it (warning after the loop) so it's stock-taken +
            // costed; COGS books 0 on these lines until the real GRN cost lands.
            const seedCost = Number(matched?.costPrice) || 0;
            if (seedCost <= 0) uncostedItems.push(matched?.description || item.description || refId);
            updatedStore.push({
              id: refId,
              company,
              name: matched?.description || item.description || refId,
              category: (matched?.category as string) || 'Hardware',
              // Reserved against an item with no on-hand → physical 0, available
              // negative (oversold, needs GRN), reservation records the commitment.
              quantity: 0, unrestrictedQty: -need,
              qiQty: 0, blockedQty: 0, reservedQty: need, consignmentQty: 0,
              unit: (matched?.unit || item.glassSize || 'PCS') as StoreItem['unit'],
              minLevel: 10, reorderPoint: 5,
              movingAveragePrice: seedCost,
              totalValue: 0, storageBin: 'New',
              lastMovementDate: new Date().toISOString(),
            } as StoreItem);
          }
        });
        if (uncostedItems.length > 0) {
          // warn (never BLOCK — Nippon deliberately oversells) so the user
          // stock-takes + sets a cost. COGS on these lines books 0 until then.
          toast.warning(
            `${uncostedItems.length} item(s) sold with no cost in the product master — COGS booked at 0. Stock-take + set a cost so profit is correct: ${uncostedItems.slice(0, 3).join(', ')}${uncostedItems.length > 3 ? '…' : ''}`,
            { duration: 8000 },
          );
        }
        InventoryService.saveStore(updatedStore);
      }

      Logger.action('SALES', revise ? 'NIPPON_ORDER_REVISED' : approve ? 'NIPPON_QUOTE_APPROVED' : 'NIPPON_QUOTE_SAVED',
        `${finalQuo.id} → ${finalQuo.orderNo || '-'} (${company}) total=${itemsSubtotal}`,
        { referenceId: finalQuo.id, amount: itemsSubtotal, extra: { company } });
      toast.success(revise ? `Sales Order revised → ${finalQuo.orderNo}` : approve ? `Sales Order ${finalQuo.orderNo} created.` : 'Quotation saved.');

      await refreshData();
      setView('list');
    } catch (err) {
      Logger.error('NipponQuotations', 'handleSave failed', err);
      toast.error(`Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // EPIC 2 (store issue): the store physically issues an approved order — shared
  // logic lives in nipponFulfilmentService so the dedicated store screen reuses it.
  const issueOrder = async (orderId: string) => {
    const res = await issueNipponOrder(orderId);
    if (res.error) { toast.error(`Issue failed — ${res.error}`, { duration: 9000 }); return; }
    if (res.invoiceId) {
      toast.success(`Goods issued — ${res.orderNo} delivered · invoice ${res.invoiceId} posted.`);
    } else if (res.invoiceError) {
      toast.warning(`Goods issued — ${res.orderNo} delivered, but invoice failed: ${res.invoiceError}`, { duration: 9000 });
    } else {
      toast.success(`Goods issued — ${res.orderNo} marked Delivered.`);
    }
    await refreshData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this quotation?")) return;
    try {
      // Use the real per-row delete (cloud + local). Previously this upserted the
      // filtered array, which never removed the row from the cloud table, so the
      // deleted quotation reappeared on the next refresh (cloud read).
      const { error } = await AsyncSalesService.deleteQuotation(id);
      if (error) {
        toast.error(`Delete failed — quotation still in cloud: ${error}`);
        return;
      }
      Logger.action('SALES', 'NIPPON_QUOTE_DELETED', `${id} (${company})`,
        { referenceId: id, extra: { company } });
      toast.success('Quotation deleted.');
      await refreshData();
    } catch (err) {
      Logger.error('NipponQuotations', 'handleDelete failed', err);
      toast.error(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Void a Sales Order: return the stock it consumed at approval, then mark the
  // order 'Void' (kept for audit — not deleted). Blocked once invoiced/paid (use a
  // Credit Note there). Idempotent-ish: guarded against re-voiding.
  const handleVoid = async (id: string) => {
    const order = quotations.find(q => q.id === id);
    if (!order) return;
    if (order.status === 'Void') return toast.error('Order is already void.');
    if (['Invoiced', 'Partial Payment', 'Paid'].includes(order.status as string)) {
      return toast.error('This order is already invoiced/paid — reverse it with a Credit Note, not Void.');
    }
    if (!confirm(`Void Sales Order ${order.orderNo || id}? The stock it consumed will be returned to inventory.`)) return;
    try {
      // Persist the Void to the cloud FIRST, then return stock only on a confirmed
      // save. If we return stock before the cloud write and that write fails, the
      // order stays 'Approved' in the cloud while stock was already returned
      // locally → the next refresh re-shows it Approved → a second Void doubles the
      // stock return. Save-first mirrors the approve flow (stock only after cloud OK).
      const voidRes = await AsyncSalesService.saveQuotations([{ ...order, status: 'Void' as const }]);
      if (voidRes?.error) {
        toast.error(`Void NOT saved to cloud — stock left unchanged. ${voidRes.error}`, { duration: 9000 });
        return;
      }
      // Reverse the approval stock decrement (add each line's qty back).
      const store = InventoryService.getStore();
      (order.items || []).forEach(item => {
        if (item.isSection) return;
        const matched = products.find(p =>
          (item.productRef && p.id === item.productRef) ||
          (item.locationCode && (p.id === item.locationCode || p.modelNo === item.locationCode || p.profileCode === item.locationCode)));
        const refId = matched?.id || item.productRef || item.locationCode;
        if (!refId) return;
        const idx = store.findIndex(s => s.id === refId);
        if (idx === -1) return;
        const qty = Number(item.qty) || 0;
        store[idx] = {
          ...store[idx],
          unrestrictedQty: (store[idx].unrestrictedQty || 0) + qty,
          quantity: (store[idx].quantity || 0) + qty,
          lastMovementDate: new Date().toISOString(),
        };
      });
      InventoryService.saveStore(store);
      Logger.action('SALES', 'NIPPON_ORDER_VOIDED', `${order.orderNo || id} (${company})`,
        { referenceId: id, extra: { company } });
      toast.success('Sales Order voided · stock returned to inventory.');
      await refreshData();
    } catch (err) {
      Logger.error('NipponQuotations', 'handleVoid failed', err);
      toast.error(`Void failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return {
    quotations,
    clients,
    products,
    storeItems,
    view,
    setView,
    searchTerm,
    setSearchTerm,
    printingQuote,
    setPrintingQuote,
    activeDropdown,
    setActiveDropdown,
    dropdownRef,
    formData,
    setFormData,
    subTotal,
    lastSerial,
    handleAddSection,
    handleAddItem,
    pendingSetSuggestion,
    setPendingSetSuggestion,
    addFullSet,
    updateItem,
    applyClientPricing,
    toggleItemSample,
    handleRemoveItem,
    handleDuplicateItem,
    handleSave,
    handleDelete,
    handleVoid,
    issueOrder,
    refreshData,
    selectProduct,
    initialQuotation,
    isSaving,
  };
};
