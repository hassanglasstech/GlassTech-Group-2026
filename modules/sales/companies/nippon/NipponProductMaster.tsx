
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Product, StoreItem } from '@/modules/shared/types';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { useAuthStore } from '@/modules/auth/authStore';
import { getBrandNick } from '@/modules/shared/utils/brandUtils';
import { ProductImage } from '@/modules/shared/components/ProductImage';
import {
  Plus, Search, Edit2, Trash2, Package, Filter, Download,
  FileJson, UploadCloud, Printer, Layers,
  Image as ImageIcon, Wrench, ChevronDown, ArrowUp, ArrowDown, ArrowUpDown,
  ChevronLeft, ChevronRight, RefreshCw, ImageOff, MoreHorizontal, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { bumpImageCacheToken } from '@/modules/shared/utils/imageCache';
import { findSimilarProducts, similarityMessage } from '@/modules/shared/utils/productSimilarity';
import { withoutVariantParents } from '@/modules/nippon/utils/variantGrouping';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';
import NipponProductForm from '@/modules/nippon/components/NipponProductForm';
import NipponDirectImporter from './components/NipponDirectImporter';
import NipponSetBuilder from '@/modules/nippon/components/NipponSetBuilder';
import NipponPriceLists from './NipponPriceLists';
import { useRealtimeRefresh } from '@/modules/shared/hooks/useRealtimeRefresh';
import * as XLSX from 'xlsx';

const NipponProductMaster: React.FC = () => {
  const company = 'Nippon';
  const stampUser = useAuthStore(s => s.profile?.fullName || s.profile?.email || s.user?.email || 'user');
  // Remember the registry view (page + search + filters + sort) for this tab session,
  // so a refresh — or navigating away and coming back — returns to the SAME page/
  // filter instead of resetting to page 1.
  const VIEW_KEY = 'nippon_registry_view';
  const _view0 = (() => { try { return JSON.parse(sessionStorage.getItem(VIEW_KEY) || '{}'); } catch { return {}; } })();
  const [products, setProducts] = useState<Product[]>([]);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>(_view0.searchTerm || '');
  const [catFilter, setCatFilter] = useState<string>(_view0.catFilter || 'All');
  const [subFilter, setSubFilter] = useState<string>(_view0.subFilter || 'All');
  const [imageFilter, setImageFilter] = useState<'all' | 'has' | 'missing'>(_view0.imageFilter || 'all');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [variantParent, setVariantParent] = useState<Product | null>(null);   // "Add variant" source
  const [activeTab, setActiveTab] = useState<'list' | 'direct' | 'pricing' | 'sets'>('list');
  // Sorting — click any column header to sort; click again to flip direction.
  type SortKey = 'profileCode' | 'modelNo' | 'description' | 'mainCategory' | 'brand' | 'basePrice' | 'stock';
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>(_view0.sortConfig || { key: 'profileCode', dir: 'asc' });
  const [currentPage, setCurrentPage] = useState<number>(_view0.currentPage || 1);
  const itemsPerPage = 25;
  const [showTools, setShowTools] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [qa, setQa] = useState({ code: '', description: '', unit: 'PCS', price: '' });

  const jsonInputRef = useRef<HTMLInputElement>(null);

  const requestSort = (key: SortKey) => {
    setSortConfig(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' });
  };
  // Reset sub-filter when main category changes; reset page on any filter/sort change.
  // Skip the FIRST run of each so a restored view (from sessionStorage) survives mount.
  const _skipSubReset = useRef(true);
  useEffect(() => {
    if (_skipSubReset.current) { _skipSubReset.current = false; return; }
    setSubFilter('All');
  }, [catFilter]);
  const _skipPageReset = useRef(true);
  useEffect(() => {
    if (_skipPageReset.current) { _skipPageReset.current = false; return; }
    setCurrentPage(1);
  }, [searchTerm, catFilter, subFilter, imageFilter, sortConfig]);
  // Persist the view so a refresh / navigate-back returns to the same page + filters.
  useEffect(() => {
    try {
      sessionStorage.setItem(VIEW_KEY, JSON.stringify({ searchTerm, catFilter, subFilter, imageFilter, sortConfig, currentPage }));
    } catch { /* sessionStorage unavailable — non-fatal */ }
  }, [searchTerm, catFilter, subFilter, imageFilter, sortConfig, currentPage]);

  // Sortable column header — click to sort, click again to flip.
  const Th = ({ label, k, right }: { label: string; k?: SortKey; right?: boolean }) => {
    if (!k) return <th className={right ? 'text-right' : undefined}>{label}</th>;
    const active = sortConfig.key === k;
    return (
      <th
        onClick={() => requestSort(k)}
        className={`cursor-pointer select-none hover:text-slate-600 transition-colors ${right ? 'text-right' : ''}`}
        title={`Sort by ${label}`}
      >
        <span className={`inline-flex items-center gap-1 ${right ? 'justify-end' : ''} ${active ? 'text-red-600' : ''}`}>
          {label}
          {active ? (sortConfig.dir === 'asc' ? <ArrowUp size={10}/> : <ArrowDown size={10}/>) : <ArrowUpDown size={10} className="opacity-25"/>}
        </span>
      </th>
    );
  };

  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = async () => {
    const allProds = (await AsyncSalesService.getProducts()).filter(p => p.company === company);
    const allStore = InventoryService.getStore().filter(s => s.company === company);
    setProducts(allProds);
    setStoreItems(allStore);
  };

  // Real-time: if ANOTHER user adds/deletes/edits a product, refresh this list
  // immediately (no manual page refresh) and tell the user what changed.
  const { refreshKey, lastEventType } = useRealtimeRefresh('products');
  useEffect(() => {
    if (refreshKey === 0) return;   // skip the initial mount value
    refreshData();
    const verb = lastEventType === 'INSERT' ? 'added a product' : lastEventType === 'DELETE' ? 'deleted a product' : 'updated a product';
    toast.info(`Another user ${verb} — the list has been refreshed.`, { id: 'products-realtime', duration: 5000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const getStockLevel = (prodId: string) => {
      const item = storeItems.find(s => s.id === prodId);
      return item ? item.quantity : 0;
  };

  const handleSaveProduct = async (product: Product, storeItemData?: Partial<StoreItem>) => {
    // Duplicate-code guard for NEW items (editing keeps its frozen id). Matches the
    // bare-code id, any legacy NIP- id, and profileCode so a code is never reused.
    if (!editingProduct) {
      const idU = (product.id || '').toUpperCase();
      const dup = products.some(p =>
        p.id === product.id || p.id === `NIP-${idU}` ||
        (p.profileCode || '').toUpperCase() === idU);
      if (dup) {
        toast.error(`Code "${product.id}" already exists. Use a different supplier code, or add it as a variant.`);
        return;   // form's finally resets Saving; modal stays open so the user can fix the code
      }
    }
    // Soft duplicate warning (ERP-wide): a similar code / name already exists.
    const sims = findSimilarProducts(product, products, { selfId: editingProduct?.id });
    if (sims.length) {
      const ok = await confirmModal(similarityMessage(product, sims));
      if (!ok) return;   // user chose not to create a possible duplicate
    }
    // Only the changed/new product is upserted (saveProducts merges by id) — no
    // full re-fetch + re-upsert of the whole ~150-row catalog on every save.
    let updatedStore = InventoryService.getStore();

    if (editingProduct) {
        updatedStore = updatedStore.map(s => s.id === editingProduct.id ? {
            ...s,
            name: product.description,
            category: product.category as any,
            unit: product.unit,
            movingAveragePrice: product.costPrice || s.movingAveragePrice
        } : s);
    } else {
        updatedStore.push({
            id: product.id,
            company,
            name: product.description,
            category: product.category as any,
            quantity: 0, unrestrictedQty: 0, qiQty: 0, blockedQty: 0, reservedQty: 0, consignmentQty: 0,
            unit: product.unit,
            minLevel: 10,
            reorderPoint: 5,
            movingAveragePrice: product.costPrice || 0,
            totalValue: 0,
            storageBin: 'New',
            lastMovementDate: new Date().toISOString()
        });
    }

    // Handle Set Components Inventory Tracking
    if (product.isSet && product.setComponents) {
        product.setComponents.forEach(comp => {
            const compStoreId = `${product.id}-SUB-${comp.id.split('-').pop()}`;
            const existingComp = updatedStore.find(s => s.id === compStoreId);
            
            if (!existingComp) {
                updatedStore.push({
                    id: compStoreId,
                    company,
                    name: `[SUB] ${product.description} - ${comp.description}`,
                    category: product.category as any,
                    quantity: 0, unrestrictedQty: 0, qiQty: 0, blockedQty: 0, reservedQty: 0, consignmentQty: 0,
                    unit: comp.unit,
                    minLevel: 5,
                    reorderPoint: 2,
                    movingAveragePrice: 0,
                    totalValue: 0,
                    storageBin: 'SET-COMP',
                    lastMovementDate: new Date().toISOString()
                });
            } else {
                existingComp.name = `[SUB] ${product.description} - ${comp.description}`;
                existingComp.unit = comp.unit;
            }
        });
    }

    try {
      const res = await AsyncSalesService.saveProducts([product]);
      InventoryService.saveStore(updatedStore);
      await refreshData();
      setIsModalOpen(false);
      if (res.error) return;   // saveProducts already showed the cloud-fail toast
      toast.success(editingProduct ? `Updated: ${product.description}` : `Added: ${product.description}`);
    } catch (err) {
      toast.error(`Save failed: ${(err as Error)?.message || 'unknown'}`);
    }
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setVariantParent(null);
    setIsModalOpen(true);
  };

  // Batch variant save — one saveProducts + one store save + one refresh for all
  // N variants (e.g. lengths 10/12/14). Each gets its own zero-stock store row
  // (MAP = its cost). Mirrors handleSaveProduct's store-row shape.
  const handleSaveVariants = async (list: Product[]) => {
    if (!list.length) return;
    const store = InventoryService.getStore();
    list.forEach(product => {
      store.push({
        id: product.id, company, name: product.description,
        category: product.category as StoreItem['category'],
        quantity: 0, unrestrictedQty: 0, qiQty: 0, blockedQty: 0, reservedQty: 0, consignmentQty: 0,
        unit: product.unit, minLevel: 10, reorderPoint: 5,
        movingAveragePrice: product.costPrice || 0, totalValue: 0,
        storageBin: 'New', lastMovementDate: new Date().toISOString(),
      });
    });
    try {
      const res = await AsyncSalesService.saveProducts(list);
      InventoryService.saveStore(store);
      await refreshData();
      setIsModalOpen(false);
      setVariantParent(null);
      if (res.error) return;
      toast.success(`Added ${list.length} variant${list.length > 1 ? 's' : ''}.`);
    } catch (err) {
      toast.error(`Save failed: ${(err as Error)?.message || 'unknown'}`);
    }
  };

  // Inline quick-add — fast single-item entry without the full form. Captures the
  // essentials (code, description, unit, price); details/image can be edited later.
  const handleQuickAdd = async () => {
    const code = qa.code.trim();
    const desc = qa.description.trim();
    if (!code || !desc) { toast.error('Item Code and Description are required.'); return; }
    const codeU = code.toUpperCase();
    const id = codeU;   // Item Code = the supplier/mfr code itself (no prefix)
    // Dedupe: match the new bare-code id, any legacy NIP- id, and profileCode.
    if (products.some(p => p.id === codeU || p.id === `NIP-${codeU}` || (p.profileCode || '').toUpperCase() === codeU)) {
      toast.error(`"${code}" already exists.`); return;
    }
    const product = {
      id, company: 'Nippon', category: 'Hardware',
      description: desc.toUpperCase(), profileCode: codeU,
      modelNo: '', brand: '', mainCategory: '', subCategory: '',
      unit: qa.unit, costPrice: 0, basePrice: Number(qa.price) || 0,
      imageUrl: '', variants: [], technicalSpecs: {},
    } as unknown as Product;
    // Soft duplicate warning (ERP-wide): similar code / name already exists.
    const sims = findSimilarProducts(product, products);
    if (sims.length) {
      const ok = await confirmModal(similarityMessage(product, sims));
      if (!ok) return;
    }
    const store = InventoryService.getStore();
    store.push({
      id: product.id, company, name: product.description, category: 'Hardware' as StoreItem['category'],
      quantity: 0, unrestrictedQty: 0, qiQty: 0, blockedQty: 0, reservedQty: 0, consignmentQty: 0,
      unit: product.unit, minLevel: 10, reorderPoint: 5, movingAveragePrice: 0,
      totalValue: 0, storageBin: 'Quick Add', lastMovementDate: new Date().toISOString(),
    });
    try {
      const res = await AsyncSalesService.saveProducts([product]);
      InventoryService.saveStore(store);
      await refreshData();
      if (res.error) return;   // keep the form filled so the user can retry
      toast.success(`Added: ${product.description}`);
      setQa({ code: '', description: '', unit: qa.unit, price: '' });
    } catch (err) {
      toast.error(`Add failed: ${(err as Error)?.message || 'unknown'}`);
    }
  };

  const handleEdit = (p: Product) => {
    setVariantParent(null);
    setEditingProduct(p);
    setIsModalOpen(true);
  };

  // Add a colour/direction/size variant: open a NEW product pre-filled from this
  // parent (form sets variantOf = parent.id on save). Variant is its own stockable row.
  const handleAddVariant = (p: Product) => {
    setEditingProduct(null);
    setVariantParent(p);
    setIsModalOpen(true);
  };

  // Remove a deleted product's stock row(s) too — a product delete must not
  // leave an orphan store row (it keeps showing in Stock and corrupts inventory
  // valuation, IAS 2: stock ⊆ product, no orphans). Includes set-component
  // sub-rows (id-SUB-*). Returns the on-hand qty that was removed (for warning).
  const purgeStoreRows = async (productIds: string[]): Promise<number> => {
    const store = InventoryService.getStore();
    const idSet = new Set(productIds);
    const rows = store.filter(s => idSet.has(s.id) || productIds.some(pid => s.id.startsWith(`${pid}-SUB-`)));
    if (!rows.length) return 0;
    const onHand = rows.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
    await InventoryService.deleteStoreItems(rows.map(s => s.id));
    return onHand;
  };

  // P0-5 (referential integrity / IAS-audit): a product referenced by a saved
  // quotation/order/invoice must NOT be silently hard-deleted — it would orphan
  // that history (broken reprints, lost audit trail).
  //
  // But "referenced" is not one thing. A LIVE document (approved, invoiced,
  // delivered, paid) is real trading history and must never lose its lines. An
  // abandoned DRAFT or a rejected/void test document is not history — refusing
  // to clean up junk because a scratch quote once touched it is how a catalogue
  // fills with items nobody can remove. So: report exactly which documents hold
  // the product, block on live ones, and let the user decide about drafts.
  //
  // Also counts SET membership: a product inside a set is referenced too, and
  // deleting it would leave the set quoting contents that no longer exist.
  const LIVE_STATUSES = new Set<string>(['Approved', 'Delivered', 'Invoiced', 'Partial Payment', 'Paid']);

  interface ProductRef { label: string; live: boolean }

  const findProductReferences = async (p: Product | undefined, id: string): Promise<{
    docs: ProductRef[];
    sets: Product[];
  }> => {
    const codes = new Set([id, p?.modelNo, p?.profileCode].filter(Boolean).map(s => String(s).toUpperCase()));
    const hit = (items?: Array<{ productRef?: string; locationCode?: string; setComponents?: Array<{ productId?: string }> }>) =>
      (items || []).some(it =>
        [it.productRef, it.locationCode].filter(Boolean).some(r => codes.has(String(r).toUpperCase()))
        // a set line delivers its components, so it references them too
        || (it.setComponents || []).some(c => c.productId && codes.has(String(c.productId).toUpperCase())));

    const [qs, invs] = await Promise.all([AsyncSalesService.getQuotations(), AsyncSalesService.getInvoices()]);
    type Doc = { company?: string; status?: string; quoteNumber?: string; invoiceNumber?: string; id?: string;
                 items?: Array<{ productRef?: string; locationCode?: string; setComponents?: Array<{ productId?: string }> }> };
    const collect = (rows: unknown[], kind: string): ProductRef[] =>
      (rows as Doc[])
        .filter(x => x.company === company && hit(x.items))
        .map(x => ({
          label: `${kind} ${x.quoteNumber || x.invoiceNumber || x.id || '?'} (${x.status || 'Draft'})`,
          live: LIVE_STATUSES.has(String(x.status || '')),
        }));

    return {
      docs: [...collect(qs, 'Quotation'), ...collect(invs, 'Invoice')],
      sets: products.filter(s => s.isSet && (s.setComponents || []).some(c => c.productId === id)),
    };
  };

  const handleDelete = async (id: string) => {
      const prod = products.find(p => p.id === id);
      const { docs, sets } = await findProductReferences(prod, id);

      // A set that contains this item would start quoting a phantom component.
      // Always block: the fix is to edit the set, which the user can do himself.
      if (sets.length) {
        toast.error(
          `Can't delete — this item is inside ${sets.length} set(s): ${sets.map(s => s.description).join(', ')}. ` +
          `Remove it from the set(s) first (Sets tab).`,
          { duration: 9000 },
        );
        return;
      }

      const live = docs.filter(d => d.live);
      if (live.length) {
        toast.error(
          `Can't delete — this product is on ${live.length} live document(s): ${live.slice(0, 3).map(d => d.label).join(', ')}` +
          `${live.length > 3 ? ` +${live.length - 3} more` : ''}. Deleting would orphan real trading history.`,
          { duration: 10000 },
        );
        return;
      }

      // Only drafts / rejected / void reference it — deletable, but say so plainly.
      if (docs.length) {
        const ok = await confirmModal(
          `This product appears on ${docs.length} unconfirmed document(s):\n\n` +
          docs.slice(0, 8).map(d => `  • ${d.label}`).join('\n') +
          (docs.length > 8 ? `\n  • …and ${docs.length - 8} more` : '') +
          `\n\nNone of them is approved or invoiced, so no trading history is lost — but those lines will print with a code that no longer exists in the catalogue.\n\nDelete the product anyway?`,
        );
        if (!ok) return;
      }

      const row = storeItems.find(s => s.id === id);
      const onHand = Number(row?.quantity) || 0;
      const warn = onHand > 0
        ? `\n\n⚠ This item still has ${onHand} on-hand — deleting removes that stock too. Write it off first if you need the value recorded.`
        : '';
      if (await confirmModal(`Delete this hardware item? It will be removed from both the catalogue and Stock.${warn}`)) {
          try {
              // Real cloud+local delete. Previously this upserted the filtered array,
              // which never removed the row from the cloud table → the product came
              // back on the next refresh.
              const { error } = await AsyncSalesService.deleteProduct(id);
              if (error) {
                  toast.error(`Delete failed — product still in cloud: ${error}`);
                  return;
              }
              const removedQty = await purgeStoreRows([id]);   // no orphan stock row left behind
              await refreshData();
              toast.success(removedQty > 0 ? `Product deleted (${removedQty} on-hand removed from Stock).` : 'Product deleted.');
          } catch (err) {
              toast.error(`Delete failed: ${(err as Error)?.message || 'unknown'}`);
          }
      }
  };

  // Reconciliation sweep — remove EMPTY stock rows whose product no longer exists
  // (orphans left by earlier deletes/dedupes). Rows that still hold on-hand qty
  // are KEPT and flagged for manual review/write-off (never silently dropped).
  const handleCleanOrphanStock = async () => {
    const store = InventoryService.getStore().filter(s => s.company === company);
    const liveIds = new Set(products.map(p => p.id));
    const orphans = store.filter(s => {
      const parentId = s.id.includes('-SUB-') ? s.id.split('-SUB-')[0] : s.id;
      return !liveIds.has(parentId) && !liveIds.has(s.id);
    });
    if (!orphans.length) { toast.info('No orphan stock — the product and stock lists are in sync.'); return; }
    const isEmpty = (s: StoreItem) => (Number(s.quantity) || 0) === 0 && (Number(s.unrestrictedQty) || 0) === 0 && (Number(s.reservedQty) || 0) === 0;
    const empty = orphans.filter(isEmpty);
    const nonEmpty = orphans.filter(s => !isEmpty(s));
    const msg = `Found ${orphans.length} stock row(s) with no matching product.\n\n` +
      `• ${empty.length} empty (qty 0) — safe to remove.\n` +
      (nonEmpty.length ? `• ${nonEmpty.length} still have on-hand qty — KEPT for review/write-off: ${nonEmpty.slice(0, 5).map(s => s.name).join(', ')}${nonEmpty.length > 5 ? '…' : ''}\n` : '') +
      `\nRemove the ${empty.length} empty orphan row(s) now?`;
    if (!(await confirmModal(msg))) return;
    if (empty.length) await InventoryService.deleteStoreItems(empty.map(s => s.id));
    await refreshData();
    toast.success(`Removed ${empty.length} empty orphan stock row(s).${nonEmpty.length ? ` ${nonEmpty.length} with stock kept for review.` : ''}`);
  };

  // Remove duplicate products (grouped by model no, else description|brand). Keeps
  // the most complete of each group (has image + most non-empty fields); removes the
  // rest. Stock rows are left untouched. Variants (distinct modelNo) are NOT merged.
  const handleDedupe = async () => {
      // P0-4 (God-mode audit): the old body upserted survivors but NEVER deleted
      // the losing duplicates (upsert doesn't remove omitted rows), so duplicates
      // silently returned on the next refresh while the toast claimed "Removed N".
      // Disabled until rebuilt as a real merge (repoint quotation/stock references
      // to the survivor + transfer stock, then archive the losers) so it can't
      // lose history. Use per-row delete for now.
      toast.warning('Remove Duplicates is temporarily disabled — the old tool did not actually delete duplicates (they came back on refresh). A safe merge tool is being built. Use per-row delete for now.', { duration: 9000 });
  };

  // #4 — record a physical opening-balance count for a product, stamped with
  // date/time/user. Corrects the bootstrap negative once the item is stock-taken.
  const handleSetOpeningBalance = async (p: Product) => {
    const cur = storeItems.find(s => s.id === p.id);
    const entry = window.prompt(`Opening balance (counted qty) for ${p.description}:`, String(Math.max(0, cur?.unrestrictedQty ?? 0)));
    if (entry === null) return;
    const qty = Number(entry);
    if (!isFinite(qty) || qty < 0) { toast.error('Enter a valid quantity (0 or more).'); return; }
    // If there's no store row yet, create a zero row first so the shared
    // recordStockCount engine (which writes the material-ledger trail) can set it.
    const store = InventoryService.getStore();
    if (!store.some(s => s.id === p.id)) {
      store.push({ id: p.id, company, name: p.description, category: (p.category as any) || 'Hardware',
        quantity: 0, unrestrictedQty: 0, qiQty: 0, blockedQty: 0, reservedQty: 0, consignmentQty: 0,
        unit: p.unit, minLevel: 10, reorderPoint: 5, movingAveragePrice: p.costPrice || 0, totalValue: 0,
        storageBin: 'Opening', lastMovementDate: new Date().toISOString() } as StoreItem);
      InventoryService.saveStore(store);
    }
    try {
      // One opening-balance engine, shared with the Stock tab's stock-take —
      // writes store qty + a material-ledger entry (mvmnt 561) + OB stamp.
      const { opening, sold } = InventoryService.recordStockCount(p.id, qty, stampUser);
      await refreshData();
      toast.success(sold > 0
        ? `Opening ${opening} recorded (counted ${qty} + ${sold} already sold) · ${stampUser}`
        : `Opening balance ${qty} recorded for ${p.description} · ${stampUser}`);
    } catch (err) {
      toast.error(`Save failed: ${(err as Error)?.message || 'unknown'}`);
    }
  };

  // #6 — build negative inventory from committed Nippon quotations (bootstrap
  // before stock-taking). Idempotent: SETS each un-counted item's position to the
  // quotation-derived negative; NEVER touches rows already stock-taken
  // (openingBalanceAt set) or holding real received stock (qty > 0).
  const handleBuildStockFromQuotations = async () => {
    const quotes = (await AsyncSalesService.getQuotations())
      .filter(q => q.company === company && ['Approved', 'Invoiced', 'Partial Payment', 'Paid'].includes(q.status as string));
    const soldById = new Map<string, number>();
    quotes.forEach(q => (q.items || []).forEach(item => {
      if (item.isSection) return;
      const matched = products.find(p =>
        (item.productRef && p.id === item.productRef) ||
        (item.locationCode && (p.id === item.locationCode || p.modelNo === item.locationCode || p.profileCode === item.locationCode)));
      const refId = matched?.id || item.productRef || item.locationCode;
      if (!refId) return;
      soldById.set(refId, (soldById.get(refId) || 0) + (Number(item.qty) || 0));
    }));
    if (soldById.size === 0) { toast.info('No sold items found in Nippon quotations.'); return; }

    const store = InventoryService.getStore();
    let applied = 0, skipped = 0;
    soldById.forEach((sold, id) => {
      const idx = store.findIndex(s => s.id === id);
      const row = idx !== -1 ? store[idx] : undefined;
      if (row?.openingBalanceAt) { skipped++; return; }                 // already stock-taken → respect it
      if (row && (row.unrestrictedQty || 0) > 0) { skipped++; return; } // has real received stock → don't wipe
      const prod = products.find(p => p.id === id);
      const nowIso = new Date().toISOString();
      if (idx !== -1) {
        store[idx] = { ...store[idx], quantity: -sold, unrestrictedQty: -sold, lastMovementDate: nowIso };
      } else {
        store.push({ id, company, name: prod?.description || id, category: (prod?.category as any) || 'Hardware',
          quantity: -sold, unrestrictedQty: -sold, qiQty: 0, blockedQty: 0, reservedQty: 0, consignmentQty: 0,
          unit: (prod?.unit || 'PCS') as any, minLevel: 10, reorderPoint: 5,
          movingAveragePrice: prod?.costPrice || 0, totalValue: 0, storageBin: 'Bootstrap', lastMovementDate: nowIso } as StoreItem);
      }
      applied++;
    });
    if (applied === 0) { toast.info(`Nothing to set — ${skipped} item(s) already counted or in stock.`); return; }
    if (!confirm(`Set ${applied} product(s) to negative stock from ${quotes.length} committed quotation(s)?\n(${skipped} skipped — already counted / in stock.)\nThey will show "opening balance pending" until you stock-take.`)) return;
    try {
      InventoryService.saveStore(store);
      await refreshData();
      toast.success(`Set ${applied} product(s) to quotation-derived negative stock. Enter opening balances to correct.`);
    } catch (err) {
      toast.error(`Build failed: ${(err as Error)?.message || 'unknown'}`);
    }
  };

  // --- DATA TOOLS ---

  const handleExportJson = () => {
    const data = {
      meta: { company, timestamp: new Date().toISOString(), type: 'NipponProductMaster' },
      products: products
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Nippon_Master_Backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = JSON.parse(evt.target?.result as string) as { products?: Array<Record<string, unknown>> };
        if (!data.products || !Array.isArray(data.products)) throw new Error("Invalid structure");

        const otherProds = (await AsyncSalesService.getProducts()).filter(p => p.company !== company);
        const importedProds = data.products.map((p) => ({ ...p, company: 'Nippon' })) as unknown as Product[];

        const res = await AsyncSalesService.saveProducts([...otherProds, ...importedProds]);
        await refreshData();
        if (res.error) { toast.error('Restore saved locally but cloud sync failed — will retry on reconnect.'); return; }
        toast.success(`Restored ${importedProds.length} products from JSON backup.`);
      } catch (err) {
        toast.error('Error importing JSON. Ensure the file is a valid Nippon product backup.');
      }
    };
    reader.readAsText(file);
  };

  // ── Category-wise Excel Export (Phase 5 prep) ─────────────────────
  // Multi-sheet workbook: Summary + one sheet per Main Category.
  // Sheet names sanitised to Excel's 31-char limit; falls back to
  // "Uncategorised" when a product has no mainCategory.
  const handleExportCategoryWise = () => {
    try {
      if (!products.length) {
        toast.error('No products to export.');
        return;
      }

      // Group by mainCategory
      const groups: Record<string, Product[]> = {};
      for (const p of products) {
        const key = (p.mainCategory || '').trim() || 'Uncategorised';
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
      }

      const wb = XLSX.utils.book_new();

      // Sanitiser for Excel sheet names: max 31 chars, no \ / ? * [ ] :
      const sheetName = (name: string): string => {
        const cleaned = name.replace(/[\\/?*[\]:]/g, '').trim() || 'Sheet';
        return cleaned.length > 31 ? cleaned.slice(0, 31) : cleaned;
      };

      // ── Summary sheet (first) ─────────────────────────────────────
      const summaryRows = Object.entries(groups)
        .map(([cat, items]) => {
          // Count the variants, not the grouping parent — otherwise a profile
          // sold in 3 lengths inflates its category by a 4th phantom product.
          const counted = withoutVariantParents(items);
          const subs = new Set(counted.map(p => p.subCategory || '').filter(Boolean));
          const brands = new Set(counted.map(p => p.brand || '').filter(Boolean));
          const prices = counted.map(p => p.basePrice || 0).filter(v => v > 0);
          const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
          return {
            'Main Category': cat,
            'Products': counted.length,
            'Sub Categories': subs.size,
            'Brands': brands.size,
            'With Image': counted.filter(p => p.imageUrl).length,
            'Avg Sales Price (PKR)': Math.round(avg),
          };
        })
        .sort((a, b) => b.Products - a.Products);
      const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
      summaryWs['!cols'] = [
        { wch: 32 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 20 }
      ];
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

      // ── One sheet per Main Category ──────────────────────────────
      const sortedGroups = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
      for (const [cat, items] of sortedGroups) {
        // Sort items within sheet by sub-category then description
        items.sort((a, b) => {
          const subA = (a.subCategory || '').localeCompare(b.subCategory || '');
          if (subA !== 0) return subA;
          return (a.description || '').localeCompare(b.description || '');
        });
        const rows = items.map(p => ({
          'Internal ID': p.profileCode || '',
          'Model No': p.modelNo || '',
          'Description': p.description,
          'Brand': p.brand || '',
          'Sub Category': p.subCategory || '',
          'Unit': p.unit,
          'Cost Price': p.costPrice || 0,
          'Sales Price': p.basePrice || 0,
          'Finish': p.finishColor || '',
          'Material': p.material || '',
          'Direction': p.direction || '',
          'Size': p.tongueLength || '',
          'Spindle Length': p.spindleLength || '',
          'Has Image': p.imageUrl ? 'Yes' : 'No',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [
          { wch: 18 }, { wch: 18 }, { wch: 32 }, { wch: 14 },
          { wch: 22 }, { wch: 8 }, { wch: 12 }, { wch: 12 },
          { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 10 },
          { wch: 14 }, { wch: 10 },
        ];
        // Freeze header row
        ws['!freeze'] = { xSplit: 0, ySplit: 1 };
        XLSX.utils.book_append_sheet(wb, ws, sheetName(cat));
      }

      const fileName = `Nippon_Products_ByCategory_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success(`Exported ${products.length} products across ${sortedGroups.length} categories.`);
    } catch (err) {
      console.error('[NipponProductMaster] Category export failed:', err);
      toast.error('Export failed. Check console for details.');
    }
  };

  // Export whatever is currently showing (respects search + cat + image filters)
  const handleExportFiltered = () => {
    if (filtered.length === 0) { toast.error('No products to export.'); return; }
    const label =
      imageFilter === 'missing' ? 'Missing_Images' :
      imageFilter === 'has'     ? 'Has_Images'     : 'All';
    const rows = filtered.map(p => ({
      'ID':              p.id,
      'Internal Code':   p.profileCode || '',
      'Model No':        p.modelNo || '',
      'Description':     p.description,
      'Brand':           p.brand || '',
      'Main Category':   p.mainCategory || '',
      'Sub Category':    p.subCategory || '',
      'Unit':            p.unit,
      'Cost Price':      p.costPrice || 0,
      'Sales Price':     p.basePrice || 0,
      'Finish':          p.finishColor || '',
      'Material':        p.material || '',
      'Direction':       p.direction || '',
      'Has Image':       p.imageUrl ? 'Yes' : 'No',
      'Image URL':       p.imageUrl || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      {wch:28},{wch:18},{wch:18},{wch:36},{wch:14},
      {wch:22},{wch:22},{wch:8},{wch:12},{wch:12},
      {wch:12},{wch:16},{wch:10},{wch:10},{wch:55},
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    XLSX.writeFile(wb, `Nippon_${label}_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success(`Exported ${filtered.length} products.`);
  };

  // Category filter dropdown values derived from real data — not the
  // legacy "Hardware/Accessory/Consumable" trio that didn't match the
  // actual Window/Door/Sliding taxonomy in the master.
  const realCategories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      const v = (p.mainCategory || p.category || '').trim();
      if (v) set.add(v);
    }
    return [...set].sort();
  }, [products]);

  // Sub-categories available under the currently selected main category.
  const availableSubs = useMemo(() => {
    if (catFilter === 'All') return [] as string[];
    const set = new Set<string>();
    for (const p of products) {
      if ((p.mainCategory || p.category) === catFilter && p.subCategory?.trim()) {
        set.add(p.subCategory.trim());
      }
    }
    return [...set].sort();
  }, [products, catFilter]);

  const missingImgCount = useMemo(() => products.filter(p => !p.imageUrl).length, [products]);
  const hasImgCount     = useMemo(() => products.filter(p => !!p.imageUrl).length, [products]);
  // Only show the Nick column if at least one item actually has a nickname —
  // otherwise it's a column of dashes eating width.
  const anyNick = useMemo(() => products.some(p => !!(p as { nickName?: string }).nickName), [products]);

  // Duplicate detection — count how many products share the same code / name, so
  // a "dup" badge can flag them. Combined with sorting by Code (or Name), copies
  // and mistakes line up next to each other.
  const dupCodeMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of products) { const c = (p.profileCode || p.modelNo || '').trim().toUpperCase(); if (c) m[c] = (m[c] || 0) + 1; }
    return m;
  }, [products]);
  const dupNameMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of products) { const n = (p.description || '').toLowerCase().replace(/[^a-z0-9]/g, ''); if (n) m[n] = (m[n] || 0) + 1; }
    return m;
  }, [products]);
  const dupBadge = (p: Product) => {
    const c = (p.profileCode || p.modelNo || '').trim().toUpperCase();
    const n = (p.description || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (c && dupCodeMap[c] > 1) return { cls: 'text-red-600 bg-red-50 border-red-200', label: 'dup code' };
    if (n && dupNameMap[n] > 1) return { cls: 'text-amber-600 bg-amber-50 border-amber-100', label: 'same name' };
    return null;
  };

  // P1-11 (variant feature B — visibility): count children per parent so the
  // registry can show a "N variants" badge on a parent and a "↳ parent-code" chip
  // on each variant. Makes the variantOf relationship visible without changing
  // the flat list / pagination.
  const variantChildCount = useMemo(() => {
    const m: Record<string, number> = {};
    products.forEach(p => { if (p.variantOf) m[p.variantOf] = (m[p.variantOf] || 0) + 1; });
    return m;
  }, [products]);
  const variantBadge = (p: Product): { kind: 'parent' | 'child'; label: string } | null => {
    if (p.variantOf) {
      const parent = products.find(pp => pp.id === p.variantOf);
      const pc = parent?.profileCode || parent?.modelNo || p.variantOf;
      return { kind: 'child', label: `↳ ${pc}` };
    }
    const n = variantChildCount[p.id] || 0;
    return n > 0 ? { kind: 'parent', label: `${n} variant${n > 1 ? 's' : ''}` } : null;
  };
  const variantBadgeEl = (p: Product) => {
    const v = variantBadge(p);
    if (!v) return null;
    return (
      <span className={`text-[8px] font-black uppercase border rounded px-1 py-0.5 ${v.kind === 'parent' ? 'text-indigo-600 bg-indigo-50 border-indigo-200' : 'text-slate-500 bg-slate-50 border-slate-200'}`}>
        {v.label}
      </span>
    );
  };

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    const result = products.filter(p => {
      // Search across description, ERP model, KinLong code, nick name, sub-group, brand.
      const haystack = [
        p.description, p.modelNo, p.profileCode,
        (p as { nickName?: string }).nickName, p.subCategory, p.brand,
      ].filter(Boolean).join(' ').toLowerCase();
      const matchesSearch = !q || haystack.includes(q);
      const matchesCat = catFilter === 'All' || p.mainCategory === catFilter || p.category === catFilter;
      const matchesSub = subFilter === 'All' || p.subCategory === subFilter;
      const matchesImg =
        imageFilter === 'all' ? true :
        imageFilter === 'has' ? !!p.imageUrl :
        /* missing */           !p.imageUrl;
      return matchesSearch && matchesCat && matchesSub && matchesImg;
    });

    const { key, dir } = sortConfig;
    const factor = dir === 'asc' ? 1 : -1;
    const valOf = (p: Product): string | number =>
      key === 'basePrice' ? (p.basePrice || 0) :
      key === 'stock'     ? getStockLevel(p.id) :
      ((p[key as keyof Product] as string) || '').toString().toLowerCase();
    return result.sort((a, b) => {
      const va = valOf(a), vb = valOf(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
      return String(va).localeCompare(String(vb)) * factor;
    });
  }, [products, searchTerm, catFilter, subFilter, imageFilter, sortConfig, storeItems]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, currentPage]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  // If a restored page is now beyond the list (data shrank), clamp — but only
  // once products have loaded, so we don't reset to page 1 during the async load.
  useEffect(() => {
    if (products.length > 0 && currentPage > totalPages) setCurrentPage(totalPages);
  }, [products.length, totalPages, currentPage]);

  // Numbered page list with ellipsis gaps (1 2 … 5 6 7 … 24). ≤7 pages = all shown.
  const pageList = useMemo<(number | 'gap')[]>(() => {
    const t = totalPages, c = currentPage;
    if (t <= 7) return Array.from({ length: t }, (_, i) => i + 1);
    const keep = new Set<number>([1, 2, t - 1, t, c - 1, c, c + 1]);
    const nums = [...keep].filter(n => n >= 1 && n <= t).sort((a, b) => a - b);
    const out: (number | 'gap')[] = [];
    let prev = 0;
    for (const n of nums) { if (n - prev > 1) out.push('gap'); out.push(n); prev = n; }
    return out;
  }, [totalPages, currentPage]);

  // Reusable numbered pager — rendered at BOTH the top and bottom of the table.
  const renderPager = (pos: 'top' | 'bottom') => (
    <div className={`flex flex-wrap items-center justify-between gap-2 px-6 py-3 no-print bg-slate-50/40 ${pos === 'top' ? 'border-b border-slate-100' : 'border-t border-slate-100'}`}>
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        {filtered.length} item{filtered.length !== 1 ? 's' : ''} · showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filtered.length)}
      </span>
      <div className="flex items-center gap-1">
        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
          className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 disabled:opacity-30 hover:bg-slate-50 transition-all"><ChevronLeft size={14}/></button>
        {pageList.map((n, i) => n === 'gap'
          ? <span key={`g${i}`} className="px-1.5 text-slate-300 text-xs select-none">…</span>
          : <button key={n} onClick={() => setCurrentPage(n)}
              className={`min-w-[2rem] px-2 py-1.5 rounded-lg text-[11px] font-black transition-all ${n === currentPage ? 'bg-red-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{n}</button>)}
        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
          className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 disabled:opacity-30 hover:bg-slate-50 transition-all"><ChevronRight size={14}/></button>
      </div>
    </div>
  );

  // ── Bulk multi-select (manage many products at once) ────────────────────
  const pageAllSelected = paginated.length > 0 && paginated.every(p => selectedIds.has(p.id));
  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const toggleSelectAllPage = () => setSelectedIds(prev => {
    const n = new Set(prev);
    if (pageAllSelected) paginated.forEach(p => n.delete(p.id));
    else paginated.forEach(p => n.add(p.id));
    return n;
  });
  const clearSelection = () => setSelectedIds(new Set());
  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!(await confirmModal(`Delete ${ids.length} product(s)? This removes them from the cloud as well.`))) return;
    let ok = 0, fail = 0, blocked = 0;
    const deletedIds: string[] = [];
    for (const id of ids) {
      // P0-5: never hard-delete a product with real trading history. Bulk stays
      // stricter than the single-row delete — it keeps anything referenced at
      // all, because there is no per-item dialog here to judge a draft on.
      const { docs, sets } = await findProductReferences(products.find(p => p.id === id), id);
      if (docs.length || sets.length) { blocked++; continue; }
      const { error } = await AsyncSalesService.deleteProduct(id);
      if (error) fail++; else { ok++; deletedIds.push(id); }
    }
    if (deletedIds.length) await purgeStoreRows(deletedIds);   // no orphan stock rows
    clearSelection();
    await refreshData();
    const blockedMsg = blocked ? ` · ${blocked} kept (used on saved documents)` : '';
    if (fail) toast.error(`${ok} deleted · ${fail} failed (still in cloud)${blockedMsg}.`);
    else toast.success(`${ok} product(s) deleted${blockedMsg}.`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* TABS */}
      <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-2xl w-fit no-print">
        <button 
          onClick={() => setActiveTab('list')}
          className={`px-6 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all ${activeTab === 'list' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
        >
          Material Registry
        </button>
        <button
          onClick={() => setActiveTab('direct')}
          className={`px-6 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all ${activeTab === 'direct' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
        >
          Bulk Import
        </button>
        <button
          onClick={() => setActiveTab('sets')}
          className={`px-6 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all ${activeTab === 'sets' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
        >
          Sets
        </button>
        <button
          onClick={() => setActiveTab('pricing')}
          className={`px-6 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all ${activeTab === 'pricing' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
        >
          Price Lists
        </button>
        {/* Catalogue is a full builder page (branding + PDF) — a tab that routes there. */}
        <a
          href="#/nippon/catalogue"
          title="Open Catalogue Builder (PDF + Branding)"
          className="px-6 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all text-slate-400 hover:text-blue-600 flex items-center gap-1.5"
        >
          <Printer size={12}/> Catalogue
        </a>
      </div>

      {activeTab === 'pricing' ? (
        <NipponPriceLists />
      ) : activeTab === 'sets' ? (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <NipponSetBuilder products={products} onChanged={refreshData} />
        </div>
      ) : activeTab === 'direct' ? (
        <NipponDirectImporter onComplete={() => {
          setActiveTab('list');
          refreshData();
        }} />
      ) : (
        <>
      {/* TOOLBAR — title lives in the tab pill above, so the bar is actions-only */}
      <div className="flex flex-col lg:flex-row lg:justify-end items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-sm w-full no-print gap-4">
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto pb-1">
           {/* HIDDEN INPUTS */}
           <input type="file" ref={jsonInputRef} className="hidden" accept=".json" onChange={handleImportJson} />

           {/* Data tools — grouped into one menu to declutter the toolbar */}
           <div className="relative shrink-0">
               <button onClick={() => setShowTools(v => !v)} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all">
                   <Wrench size={14}/> Data &amp; Admin <ChevronDown size={12} className={showTools ? 'rotate-180 transition-transform' : 'transition-transform'}/>
               </button>
               {showTools && (
                   <>
                     <div className="fixed inset-0 z-10" onClick={() => setShowTools(false)} />
                     <div className="absolute left-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-20 py-1.5 animate-in fade-in zoom-in duration-150">
                         <div className="px-4 pt-1 pb-1 text-[9px] font-black uppercase tracking-widest text-slate-300">Export / Backup</div>
                         {[
                           { label: 'Backup (JSON)',          icon: FileJson,        on: handleExportJson },
                           { label: 'Export by Category',     icon: Layers,          on: handleExportCategoryWise },
                           // After replacing a picture in the product-images bucket, the URL is
                           // unchanged so browsers keep the OLD one. Bump the cache token → every
                           // product image re-fetches fresh (then caches again). Refresh so the
                           // new token applies immediately in this view.
                           { label: 'Refresh Images (after re-upload)', icon: RefreshCw, on: () => { bumpImageCacheToken(); refreshData(); toast.success('Product images refreshed — new pictures will now load.'); } },
                         ].map(({ label, icon: Icon, on }) => (
                           <button key={label} onClick={() => { setShowTools(false); on(); }} className="w-full flex items-center gap-2.5 px-4 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition-all">
                               <Icon size={14} className="text-slate-400"/> {label}
                           </button>
                         ))}
                         <div className="my-1 border-t border-slate-100" />
                         <div className="px-4 pt-1 pb-1 text-[9px] font-black uppercase tracking-widest text-rose-300 flex items-center gap-1"><AlertTriangle size={10} /> Admin · careful</div>
                         {[
                           { label: 'Restore (JSON)',              icon: UploadCloud, on: () => jsonInputRef.current?.click(),   confirm: 'Restore products from a JSON backup? Existing products with the same code can be overwritten.' },
                           { label: 'Remove Duplicates',           icon: Wrench,      on: handleDedupe,                          confirm: 'Remove duplicate products? Duplicate rows will be permanently deleted.' },
                           { label: 'Clean Orphan Stock',          icon: Layers,      on: handleCleanOrphanStock,                confirm: null },
                           { label: 'Build Stock from Quotations', icon: Layers,      on: handleBuildStockFromQuotations,        confirm: 'Rebuild stock levels from quotations? On-hand stock will be recomputed.' },
                         ].map(({ label, icon: Icon, on, confirm: msg }) => (
                           <button key={label} onClick={() => { setShowTools(false); if (!msg || window.confirm(msg)) on(); }} className="w-full flex items-center gap-2.5 px-4 py-2 text-[11px] font-bold text-rose-600 hover:bg-rose-50 transition-all">
                               <Icon size={14} className="text-rose-400"/> {label}
                           </button>
                         ))}
                     </div>
                   </>
               )}
           </div>

           <div className="h-8 w-px bg-slate-200 hidden lg:block mx-2"></div>

           <div className="relative shrink-0">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <select
                className="pl-9 pr-4 py-2 bg-slate-100 border-none rounded-xl font-bold text-xs uppercase focus:ring-2 focus:ring-red-500 outline-none"
                value={catFilter}
                onChange={e => setCatFilter(e.target.value)}
              >
                  <option value="All">All Categories</option>
                  {realCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
           </div>

           {/* Cascading sub-group filter (only when a category is chosen) */}
           {catFilter !== 'All' && availableSubs.length > 0 && (
              <div className="relative shrink-0">
                 <select
                   className="pl-3 pr-4 py-2 bg-slate-100 border-none rounded-xl font-bold text-xs uppercase focus:ring-2 focus:ring-red-500 outline-none"
                   value={subFilter}
                   onChange={e => setSubFilter(e.target.value)}
                 >
                     <option value="All">All Sub-Groups</option>
                     {availableSubs.map(sg => <option key={sg} value={sg}>{sg}</option>)}
                 </select>
              </div>
           )}

           {/* Image filter — quick audit of products missing images */}
           <div className="flex items-center bg-slate-100 p-1 rounded-xl shrink-0">
             <button
               onClick={() => setImageFilter('all')}
               className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${imageFilter === 'all' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400'}`}
             >All</button>
             <button
               onClick={() => setImageFilter('has')}
               className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1 ${imageFilter === 'has' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-400'}`}
             >
               <ImageIcon size={10} /> {hasImgCount}
             </button>
             <button
               onClick={() => setImageFilter('missing')}
               className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1 ${imageFilter === 'missing' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400'}`}
             >
               <ImageOff size={10} /> {missingImgCount}
             </button>
           </div>
           
           {/* Sort order — pick an order to make duplicates / mistakes line up.
               (Column headers still sort too; this is the explicit control.) */}
           <div className="flex items-center gap-1 shrink-0">
              <select
                value={sortConfig.key}
                onChange={e => setSortConfig(s => ({ key: e.target.value as SortKey, dir: s.dir }))}
                className="pl-3 pr-6 py-2 bg-slate-100 border-none rounded-xl font-bold text-xs uppercase focus:ring-2 focus:ring-red-500 outline-none cursor-pointer"
                title="Sort products — pick an order to spot duplicates / mistakes easily"
              >
                <option value="profileCode">Sort · Code</option>
                <option value="description">Sort · Name</option>
                <option value="brand">Sort · Brand</option>
                <option value="mainCategory">Sort · Category</option>
                <option value="basePrice">Sort · Price</option>
                <option value="stock">Sort · Stock</option>
              </select>
              <button
                onClick={() => setSortConfig(s => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))}
                title={sortConfig.dir === 'asc' ? 'Ascending — click for descending' : 'Descending — click for ascending'}
                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-500 transition-all">
                {sortConfig.dir === 'asc' ? <ArrowUp size={14}/> : <ArrowDown size={14}/>}
              </button>
           </div>

           <div className="relative w-48 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input type="text" placeholder="Name / code / nick…" className="w-full pl-9 pr-4 py-2 bg-slate-100 border-none rounded-xl font-bold text-xs uppercase focus:ring-2 focus:ring-red-500 outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
           </div>

           <button
             onClick={handleExportFiltered}
             className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-sm transition-all shrink-0"
             title={`Export current view (${filtered.length} products)`}
           >
             <Download size={14}/>
             <span>Export{imageFilter !== 'all' ? ` (${filtered.length})` : ''}</span>
           </button>

           {/* One primary Add control — full form via the button, fast inline
               entry via the caret (Quick Add). */}
           <div className="flex items-stretch shrink-0 rounded-xl overflow-hidden shadow-xl">
             <button onClick={openAddModal} className="bg-slate-900 text-white px-5 py-2.5 font-black uppercase text-xs tracking-widest hover:bg-red-600 transition-all flex items-center gap-2">
                 <Plus size={16}/> <span>Add Item</span>
             </button>
             <button onClick={() => setQuickAddOpen(v => !v)} title="Quick Add — fast single-item entry"
               className={`px-2.5 border-l border-white/20 flex items-center transition-all ${quickAddOpen ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white hover:bg-red-600'}`}>
                 <ChevronDown size={16} className={quickAddOpen ? 'rotate-180 transition-transform' : 'transition-transform'}/>
             </button>
           </div>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-2.5 no-print animate-in fade-in slide-in-from-top-1 duration-150">
          <span className="text-xs font-black uppercase tracking-widest text-red-700">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2">
            <button onClick={bulkDelete} className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-sm transition-all">
              <Trash2 size={13}/> Delete Selected
            </button>
            <button onClick={clearSelection} className="px-3 py-2 bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all">
              Clear
            </button>
          </div>
        </div>
      )}

      {quickAddOpen && (
        <div className="flex flex-wrap items-end gap-2 bg-emerald-50/60 border border-emerald-200 rounded-2xl px-4 py-3 no-print animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex flex-col">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Supplier Code *</label>
            <input value={qa.code} onChange={e => setQa(q => ({ ...q, code: e.target.value }))}
              placeholder="e.g. CZS133 or CZS133-BK"
              title="Supplier / manufacturer code + optional variant suffix (e.g. -BK black, -L left)"
              className="w-44 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono uppercase focus:ring-2 focus:ring-emerald-500 outline-none" />
          </div>
          <div className="flex flex-col flex-1 min-w-[180px]">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Description *</label>
            <input value={qa.description} onChange={e => setQa(q => ({ ...q, description: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') handleQuickAdd(); }}
              placeholder="Product description — press Enter to add"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs uppercase focus:ring-2 focus:ring-emerald-500 outline-none" />
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Unit</label>
            <select value={qa.unit} onChange={e => setQa(q => ({ ...q, unit: e.target.value }))}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold uppercase focus:ring-2 focus:ring-emerald-500 outline-none">
              {['PCS', 'SET', 'ROLL', 'MTR', 'KG', 'BOX', 'PKT'].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Unit Price</label>
            <input type="number" value={qa.price} onChange={e => setQa(q => ({ ...q, price: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') handleQuickAdd(); }}
              placeholder="0"
              className="w-24 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-right tabular-nums focus:ring-2 focus:ring-emerald-500 outline-none" />
          </div>
          <button onClick={handleQuickAdd}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-black uppercase text-[10px] tracking-widest shadow-sm transition-all">Add</button>
          <button onClick={() => setQuickAddOpen(false)}
            className="px-3 py-2 text-slate-400 hover:text-slate-600 text-[10px] font-black uppercase tracking-widest transition-all">Close</button>
        </div>
      )}

      {(
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px] no-print">
              {/* Top pager — same numbered control as the footer (industry-standard). */}
              {filtered.length > 0 && totalPages > 1 && renderPager('top')}
              {/* DESKTOP — table (horizontal scroll only on md+, never on phone) */}
              <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[880px] text-left sap-table">
                  <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    <tr>
                        <th className="pl-4 pr-1 w-8">
                          <input type="checkbox" checked={pageAllSelected} onChange={toggleSelectAllPage}
                            className="w-3.5 h-3.5 rounded border-slate-300 accent-red-600 cursor-pointer align-middle" title="Select all on this page" />
                        </th>
                        <th className="px-6 py-4 cursor-pointer select-none hover:text-slate-600" onClick={() => requestSort('profileCode')} title="Sort by Supplier / Mfr Code">
                          <span className={`inline-flex items-center gap-1 ${sortConfig.key === 'profileCode' ? 'text-red-600' : ''}`}>Supplier Code {sortConfig.key === 'profileCode' ? (sortConfig.dir === 'asc' ? <ArrowUp size={10}/> : <ArrowDown size={10}/>) : <ArrowUpDown size={10} className="opacity-25"/>}</span>
                        </th>
                        <Th label="Image" />
                        <Th label="Description" k="description" />
                        {anyNick && <Th label="Nick" />}
                        <Th label="Brand" />
                        <Th label="Unit Price" k="basePrice" right />
                        <Th label="Stock" k="stock" right />
                        <th className="text-right pr-6 sticky right-0 bg-slate-50 z-10">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {paginated.map(p => {
                        const stock = getStockLevel(p.id);
                        const nick = (p as { nickName?: string }).nickName || '';
                        return (
                            <tr key={p.id} className={`hover:bg-slate-50 transition-colors text-[13px] group ${selectedIds.has(p.id) ? 'bg-red-50/60' : ''}`}>
                                <td className="pl-4 pr-1 w-8">
                                  <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)}
                                    className="w-3.5 h-3.5 rounded border-slate-300 accent-red-600 cursor-pointer align-middle" />
                                </td>
                                <td className="px-6 py-3 font-mono font-bold text-slate-600 uppercase">
                                    <span className="block max-w-[150px] truncate" title={p.profileCode || p.modelNo || ''}>{p.profileCode || p.modelNo || '—'}</span>
                                </td>
                                <td className="py-3">
                                    <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center">
                                        <ProductImage id={p.id} code={p.modelNo || p.profileCode} url={p.imageUrl} alt={p.description} className="w-full h-full object-cover" iconSize={16} />
                                    </div>
                                </td>
                                <td className="font-bold text-slate-800 uppercase w-full">
                                    <div className="flex flex-col">
                                        <span className="flex items-center gap-1.5 flex-wrap">
                                            {p.description}
                                            {(() => { const b = dupBadge(p); return b
                                                ? <span className={`text-[8px] font-black uppercase border rounded px-1 py-0.5 ${b.cls}`}>{b.label}</span>
                                                : null; })()}
                                            {variantBadgeEl(p)}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-medium normal-case truncate">
                                            {[p.mainCategory, p.subCategory].filter(Boolean).join(' · ') || '—'}
                                        </span>
                                    </div>
                                </td>
                                {anyNick && (
                                <td className="text-[10px] uppercase">
                                    {nick
                                        ? <span className="font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 whitespace-nowrap">{nick}</span>
                                        : <span className="text-slate-300">-</span>}
                                </td>
                                )}
                                <td className="font-bold text-slate-500 text-[11px] uppercase">{getBrandNick(p.brand || '-')}</td>
                                <td className="text-right font-bold text-slate-700 whitespace-nowrap tabular-nums">{p.basePrice?.toLocaleString()}</td>
                                <td className="text-right">
                                    <span className={`text-sm font-black ${stock > 0 ? 'text-emerald-600' : stock < 0 ? 'text-rose-500' : 'text-slate-300'}`}>{(Number(stock) || 0).toLocaleString()}</span>
                                    <span className="text-[9px] text-slate-400 ml-1 uppercase">{p.unit}</span>
                                    {(() => {
                                        const row = storeItems.find(s => s.id === p.id);
                                        const obPending = (Number(stock) || 0) < 0 && !row?.openingBalanceAt;
                                        if (!obPending) return null;
                                        return (
                                            <div className="mt-1">
                                                <button onClick={() => handleSetOpeningBalance(p)} title="No stock-take yet — enter opening balance (stamped)"
                                                    className="text-[8px] font-black uppercase text-rose-600 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5 hover:bg-rose-100 transition-all">
                                                    <AlertTriangle size={9} className="inline-block align-[-1px] mr-0.5" /> OB pending · set
                                                </button>
                                            </div>
                                        );
                                    })()}
                                </td>
                                <td className="pr-6 text-right sticky right-0 bg-white group-hover:bg-slate-50 transition-colors">
                                    {/* Actions reveal on row hover (focus-within keeps them keyboard-reachable);
                                        a faint ⋯ hints they're there until you hover. */}
                                    <div className="relative flex items-center justify-end h-6">
                                        <span className="text-slate-300 group-hover:opacity-0 transition-opacity select-none flex items-center"><MoreHorizontal size={14} /></span>
                                        <div className="absolute right-0 flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                            <button onClick={() => handleAddVariant(p)} title="Add colour/direction variant" className="p-1.5 text-slate-400 hover:text-amber-600 bg-white border border-slate-200 rounded transition-all"><Layers size={12}/></button>
                                            <button onClick={() => handleEdit(p)} title="Edit" className="p-1.5 text-slate-400 hover:text-blue-600 bg-white border border-slate-200 rounded transition-all"><Edit2 size={12}/></button>
                                            <button onClick={() => handleDelete(p.id)} title="Delete" className="p-1.5 text-slate-400 hover:text-red-600 bg-white border border-slate-200 rounded transition-all"><Trash2 size={12}/></button>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                  </tbody>
              </table>
              </div>

              {/* MOBILE — card list (the wide table is unusable at phone width) */}
              <div className="md:hidden divide-y divide-slate-100">
                {paginated.map(p => {
                  const stock = getStockLevel(p.id);
                  const nick = (p as { nickName?: string }).nickName || '';
                  const code = p.profileCode || p.modelNo || '—';
                  return (
                    <div key={p.id} className={`flex items-start gap-3 p-3 ${selectedIds.has(p.id) ? 'bg-red-50/60' : ''}`}>
                      <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)}
                        className="mt-1 w-4 h-4 rounded border-slate-300 accent-red-600 cursor-pointer shrink-0" />
                      <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center shrink-0">
                        <ProductImage id={p.id} code={p.modelNo || p.profileCode} url={p.imageUrl} alt={p.description} className="w-full h-full object-cover" iconSize={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-[11px] font-bold text-slate-500 uppercase truncate" title={code}>{code}</p>
                        <p className="font-bold text-[13px] text-slate-800 uppercase leading-tight flex items-center gap-1.5 flex-wrap">
                          {p.description}
                          {(() => { const b = dupBadge(p); return b
                            ? <span className={`text-[8px] font-black uppercase border rounded px-1 py-0.5 shrink-0 ${b.cls}`}>{b.label}</span>
                            : null; })()}
                          {variantBadgeEl(p)}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">{[p.mainCategory, p.subCategory].filter(Boolean).join(' · ') || '—'}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {nick && <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 uppercase">{nick}</span>}
                          <span className="text-[10px] font-bold text-slate-500 uppercase">{getBrandNick(p.brand || '-')}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-[13px] font-black text-slate-700 tabular-nums">{p.basePrice?.toLocaleString()}</span>
                          <span className={`text-[12px] font-black ${stock > 0 ? 'text-emerald-600' : stock < 0 ? 'text-rose-500' : 'text-slate-300'}`}>{(Number(stock) || 0).toLocaleString()} <span className="text-[9px] text-slate-400 uppercase">{p.unit}</span></span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <button onClick={() => handleEdit(p)} title="Edit" className="p-2 text-slate-400 hover:text-blue-600 bg-white border border-slate-200 rounded"><Edit2 size={14}/></button>
                        <button onClick={() => handleAddVariant(p)} title="Add variant" className="p-2 text-slate-400 hover:text-amber-600 bg-white border border-slate-200 rounded"><Layers size={14}/></button>
                        <button onClick={() => handleDelete(p.id)} title="Delete" className="p-2 text-slate-400 hover:text-red-600 bg-white border border-slate-200 rounded"><Trash2 size={14}/></button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filtered.length === 0 && (
                  <div className="p-20 text-center text-slate-300 font-black uppercase italic text-xs tracking-widest">
                      <Package size={48} className="mx-auto mb-4 opacity-10"/>
                      No hardware items found in selection.
                  </div>
              )}
              {/* Pagination footer — numbered pager */}
              {filtered.length > 0 && renderPager('bottom')}
          </div>
      )}
      </>
    )}

    <NipponProductForm
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setVariantParent(null); }}
        onSave={handleSaveProduct}
        onSaveMany={handleSaveVariants}
        editingProduct={editingProduct}
        variantOf={variantParent}
        allProducts={products}
      />
    </div>
  );
};

export default NipponProductMaster;
