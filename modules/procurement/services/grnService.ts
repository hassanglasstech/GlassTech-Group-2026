/**
 * grnService.ts — GlassCo Goods Receipt Note Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles the COMPLETE GRN workflow for GlassCo (local domestic purchase):
 *
 *  STEP 1  GRN Post      → Material Ledger + StoreItem + GL auto-entry
 *  STEP 2  Freight Post  → Separate GL entry (Dr Inventory / Cr Payable-Transport)
 *  STEP 3  Defect Return → Partial stock reversal + GL reversal + image refs stored
 *  STEP 4  Reversal      → Full GRN reversal (Movement 102) with audit trail
 *
 * IFRS COMPLIANCE:
 *  IAS 2.10  — Cost includes purchase price + freight (directly attributable costs)
 *  IAS 2.36  — Inventory write-down on defect return
 *  IAS 1.38  — Each transaction immutable; reversals are new entries
 *  IFRS SME  — Double-entry enforced: every post = balanced Dr/Cr journal
 *
 * GL ACCOUNTS USED (GlassCo COA):
 *  Dr  11511  Float Glass — Clear (Raw Glass Inventory)
 *  Dr  11512  Float Glass — Tinted
 *  Dr  11513  Float Glass — Reflective
 *  Dr  11514  Laminated Glass Stock
 *  Dr  11515  Frosted / Decorative Glass
 *  Dr  56113  Glass Breakage & Write-off (defect expense)
 *  Cr  21151  GR/IR — Glass Material     (clearing — cleared on invoice match)
 *  Cr  21152  GR/IR — Freight & Transport  (clearing — cleared on freight invoice)
 *  [21111 Payable is hit only when invoice is registered in ThreeWayMatching]
 */

import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { FinanceService } from '@/modules/finance/services/financeService';
import { MaterialLedgerEntry, StoreItem } from '@/modules/procurement/types/inventory';
import { LedgerTransaction } from '@/modules/finance/types/finance';
import { Company } from '@/modules/shared/types/core';
import { generateSheetTags } from '@/modules/procurement/components/inventory/GoodsReceiptMIGO';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GRNPostInput {
  company: Company;
  vendorId: string;
  vendorName: string;
  referenceDoc: string;        // PO number / vendor challan
  glassCategory: string;       // Plain | Color | Mirror | Fluted
  thickness: string;           // 5mm | 6mm etc
  sheetSize: string;           // 84x144
  sheetCount: number;          // number of sheets received
  sqftPerSheet: number;        // pre-calculated
  unitCostPKR: number;         // cost per sqft
  freightPKR: number;          // total freight for this GRN
  storageBin: string;
  batchNo: string;
  remarks: string;
  postedBy: string;
  // Optional links
  poId?: string;
  transportVendorId?: string;
  transportVendorName?: string;
}

export interface GRNDefectInput {
  grnId: string;               // original GRN entry ID
  company: Company;
  defectSheets: number;
  defectSqft: number;
  defectDescription: string;
  imageRefs: string[];         // array of base64 or URLs for defect images
  vendorId: string;
  vendorName: string;
  returnedBy: string;
}

export interface GRNReversalInput {
  grnId: string;
  company: Company;
  reason: string;
  reversedBy: string;
}

export interface GRNPostResult {
  grnId: string;               // e.g. GRN-GLASSCO-0326-001
  materialLedgerEntryId: string;
  glJournalId: string;
  freightJournalId?: string;
  totalSqft: number;
  totalCost: number;
  sheetTags: string[];
  mapAfter: number;            // new moving average price
}

// ── GRN ID Sequence ───────────────────────────────────────────────────────────

/**
 * Generates sequential GRN ID: GRN-GLASSCO-MMYY-NNN
 * Scans existing ledger to find highest sequence for current month.
 */
function generateGRNId(company: Company, ledger: MaterialLedgerEntry[]): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  const prefix = `GRN-${company.toUpperCase()}-${mm}${yy}-`;

  const existing = ledger
    .filter(e => e.referenceDoc?.startsWith(prefix))
    .map(e => {
      const seq = parseInt(e.referenceDoc?.replace(prefix, '') || '0');
      return isNaN(seq) ? 0 : seq;
    });

  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

// ── GL Account Resolver ───────────────────────────────────────────────────────

/**
 * Maps glass category to GlassCo COA inventory account code.
 * Falls back to 11511 (Float Glass — Clear) for unknown categories.
 */
function resolveInventoryAccount(
  company: Company,
  glassCategory: string
): { id: string; code: string; name: string } | null {
  const accounts = FinanceService.getAccounts().filter(a => a.company === company);

  const categoryMap: Record<string, string[]> = {
    'Plain':   ['11511', 'Float Glass — Clear'],
    'Clear':   ['11511', 'Float Glass — Clear'],
    'Color':   ['11512', 'Float Glass — Tinted'],
    'Tinted':  ['11512', 'Float Glass — Tinted'],
    'Reflective': ['11513', 'Float Glass — Reflective'],
    'Mirror':  ['11513', 'Float Glass — Reflective'],
    'Laminated': ['11514', 'Laminated Glass Stock'],
    'Double Glazed': ['11514', 'Laminated Glass Stock'],
    'Frosted': ['11515', 'Frosted / Decorative Glass'],
    'Fluted':  ['11515', 'Frosted / Decorative Glass'],
  };

  const [targetCode] = categoryMap[glassCategory] ?? ['11511', 'Float Glass — Clear'];
  const acc = accounts.find(a => a.code === targetCode);
  return acc ? { id: acc.id, code: acc.code, name: acc.name } : null;
}

function resolveAccount(company: Company, code: string) {
  return FinanceService.getAccounts().find(a => a.company === company && a.code === code) ?? null;
}

// ── STEP 1 + 2: Post GRN ─────────────────────────────────────────────────────

export const GRNService = {

  /**
   * POST GRN
   * Creates:
   *  1. MaterialLedgerEntry (Movement 101)
   *  2. GL Journal KR: Dr Inventory Cr Payable-Vendor  (material cost)
   *  3. GL Journal KR: Dr Inventory Cr Payable-Transport (freight capitalized into inventory per IAS 2.10)
   *  4. Sheet tags per sheet
   *  5. Updates StoreItem balance + MAP
   */
  postGRN(input: GRNPostInput): GRNPostResult {
    const {
      company, vendorId, vendorName, referenceDoc,
      glassCategory, thickness, sheetSize,
      sheetCount, sqftPerSheet, unitCostPKR, freightPKR,
      storageBin, batchNo, remarks, postedBy,
      poId, transportVendorId, transportVendorName
    } = input;

    const allLedger = InventoryService.getStockLedger();
    const allStore  = InventoryService.getStore();

    // ── Calculations ─────────────────────────────────────────────────────────
    const totalSqft       = Number((sheetCount * sqftPerSheet).toFixed(2));
    const materialCost    = Number((totalSqft * unitCostPKR).toFixed(2));
    const freightPerSqft  = totalSqft > 0 ? freightPKR / totalSqft : 0;
    // IAS 2.10: freight capitalised into inventory — landed cost per sqft
    const landedUnitCost  = Number((unitCostPKR + freightPerSqft).toFixed(4));
    const totalCost       = materialCost + freightPKR;

    // ── GRN ID ────────────────────────────────────────────────────────────────
    const grnId = generateGRNId(company, allLedger);

    // ── Find/create StoreItem ─────────────────────────────────────────────────
    // materialId = product ID — use existing store item or reference doc
    // We use grnId as materialId reference for new items
    // In practice, materialId comes from Product Master (product.id)
    // Here we keep compatible with existing GoodsReceiptMIGO pattern
    const storeIdx = allStore.findIndex(
      s => s.company === company &&
           s.name?.toUpperCase().includes(glassCategory.toUpperCase()) &&
           s.name?.toUpperCase().includes(thickness.toUpperCase())
    );

    let store: StoreItem;
    let isNewStore = false;
    if (storeIdx !== -1) {
      store = { ...allStore[storeIdx] };
    } else {
      isNewStore = true;
      store = {
        id: `STORE-${company}-${glassCategory.toUpperCase()}-${thickness.toUpperCase()}`.replace(/\s/g, '-'),
        company,
        name: `Float Glass ${glassCategory} ${thickness}`.toUpperCase(),
        category: 'Raw',
        quantity: 0,
        unrestrictedQty: 0,
        qiQty: 0,
        blockedQty: 0,
        reservedQty: 0,
        consignmentQty: 0,
        unit: 'SqFt',
        conversionFactor: sqftPerSheet,
        minLevel: 0,
        reorderPoint: 0,
        movingAveragePrice: 0,
        totalValue: 0,
        storageBin: storageBin || 'MAIN-STORE',
        lastMovementDate: new Date().toISOString(),
      };
    }

    // ── Moving Average Price (IAS 2 — MAP method) ─────────────────────────────
    const prevValue   = store.totalValue;
    const prevQty     = store.quantity;
    const newTotalVal = prevValue + totalCost;
    const newTotalQty = prevQty + totalSqft;
    const newMAP      = Number((newTotalVal / newTotalQty).toFixed(4));

    store.quantity        = newTotalQty;
    store.unrestrictedQty = store.unrestrictedQty + totalSqft;
    store.totalValue      = newTotalVal;
    store.movingAveragePrice = newMAP;
    store.lastMovementDate   = new Date().toISOString();
    if (sqftPerSheet > 0) store.conversionFactor = sqftPerSheet;

    // ── Sheet Tags ────────────────────────────────────────────────────────────
    const now = new Date();
    const mmYY = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getFullYear()).slice(-2)}`;
    const existingBatches = allLedger.filter(
      e => e.materialId === store.id && e.mvmntCode === '101' && e.sheetTags && e.sheetTags[0]?.includes(`-${mmYY}-`)
    ).length;
    const batchSeq = String(existingBatches + 1).padStart(3, '0');
    const sheetTags = generateSheetTags(thickness, sheetCount, batchSeq);

    // ── Material Ledger Entry ─────────────────────────────────────────────────
    const matLedgerEntry: MaterialLedgerEntry = {
      id: `${grnId}-ML`,
      company,
      materialId: store.id,
      timestamp: new Date().toISOString(),
      mvmntCode: '101',
      qty: totalSqft,
      uom: 'SqFt',
      valuation: newMAP,
      balanceAfter: store.quantity,
      referenceDoc: grnId,
      user: postedBy,
      remarks: remarks || `GRN: ${sheetCount} sheets × ${sheetSize}" ${glassCategory} ${thickness}`,
      storageBin: storageBin || store.storageBin,
      batchNo: batchNo || batchSeq,
      sheetTags,
      sheetTagMeta: {
        thickness,
        sheetSize,
        vendorName,
        grnRef: grnId,
        grnDate: now.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
        batchSeq,
      },
      // Extended audit fields
      ...(poId && { huId: poId }),            // reuse huId for PO link (or add poId to type)
    } as MaterialLedgerEntry & { vendorId: string; vendorName: string; poId?: string };

    // Inject vendor on entry (type extended)
    (matLedgerEntry as any).vendorId   = vendorId;
    (matLedgerEntry as any).vendorName = vendorName;
    (matLedgerEntry as any).poId       = poId;
    (matLedgerEntry as any).sheetCount = sheetCount;
    (matLedgerEntry as any).landedUnitCost = landedUnitCost;
    (matLedgerEntry as any).freightPKR = freightPKR;

    // ── GL Entries ────────────────────────────────────────────────────────────
    const today = now.toISOString().split('T')[0];
    const invAcc  = resolveInventoryAccount(company, glassCategory);
    // vendAcc (21111) not used at GRN — payable created at invoice stage in ThreeWayMatching
    const tranAcc = resolveAccount(company, '21113'); // kept for reference

    const glJournalId = `KR-${grnId}`;
    let freightJournalId: string | undefined;

    // Journal 1 — GRN Material Cost
    // Dr Inventory (asset up) / Cr GR/IR Clearing (suspense — NOT payable yet)
    // Payable is only created when vendor invoice arrives (ThreeWayMatching → handleRegisterInvoice)
    const grirAcc = resolveAccount(company, '21151'); // GR/IR — Glass Material
    if (invAcc && grirAcc) {
      const matJournal: LedgerTransaction = {
        id: glJournalId,
        company,
        docType: 'WE', // WE = Goods Receipt in SAP convention
        docDate: today,
        date: today,
        description: `GRN — ${vendorName} | ${grnId} | ${sheetCount} sheets ${thickness} ${glassCategory}`,
        referenceId: grnId,
        status: 'Posted',
        details: [
          {
            accountId: invAcc.id,
            debit: materialCost,
            credit: 0,
            text: `${sheetCount} sheets ${glassCategory} ${thickness} ${sheetSize}" @ PKR ${unitCostPKR}/sqft`,
          },
          {
            accountId: grirAcc.id,
            debit: 0,
            credit: materialCost,
            text: `GR/IR clearing: ${vendorName} — ${grnId} (clear on invoice)`,
          },
        ],
        reqId: poId,
      };
      FinanceService.recordTransaction(matJournal);
    }

    // Journal 2 — Freight capitalised to Inventory (IAS 2.10)
    // Dr Inventory / Cr GR/IR Freight Clearing
    // When freight vendor invoice arrives, Dr GR/IR-Freight / Cr 21113 Other Vendors Payable
    const grirFrtAcc = resolveAccount(company, '21152'); // GR/IR — Freight & Transport
    if (freightPKR > 0 && invAcc && grirFrtAcc) {
      freightJournalId = `WE-${grnId}-FRT`;
      const freightJournal: LedgerTransaction = {
        id: freightJournalId,
        company,
        docType: 'WE',
        docDate: today,
        date: today,
        description: `GRN Freight — Capitalised | ${grnId} | ${transportVendorName || 'Freight'}`,
        referenceId: grnId,
        status: 'Posted',
        details: [
          {
            accountId: invAcc.id,
            debit: freightPKR,
            credit: 0,
            text: `Freight capitalised: ${totalSqft} sqft @ PKR ${freightPerSqft.toFixed(2)}/sqft`,
          },
          {
            accountId: grirFrtAcc.id,
            debit: 0,
            credit: freightPKR,
            text: `GR/IR freight clearing: ${transportVendorName || 'Freight Vendor'} — ${grnId}`,
          },
        ],
      };
      FinanceService.recordTransaction(freightJournal);
    }

    // ── Persist ───────────────────────────────────────────────────────────────
    const updatedStore = isNewStore
      ? [...allStore, store]
      : allStore.map(s => s.id === store.id ? store : s);

    InventoryService.saveStore(updatedStore);
    InventoryService.saveStockLedger([...allLedger, matLedgerEntry]);

    return {
      grnId,
      materialLedgerEntryId: matLedgerEntry.id,
      glJournalId,
      freightJournalId,
      totalSqft,
      totalCost,
      sheetTags,
      mapAfter: newMAP,
    };
  },

  // ────────────────────────────────────────────────────────────────────────────
  // STEP 3: Defect Return
  // Creates Movement 122 (return to vendor) + Dr Vendor-Claim / Cr Inventory
  // Images stored as base64 refs in the ledger entry for vendor dispute package
  // ────────────────────────────────────────────────────────────────────────────
  postDefectReturn(input: GRNDefectInput): { returnId: string; glJournalId: string } {
    const {
      grnId, company, defectSheets, defectSqft,
      defectDescription, imageRefs, vendorId, vendorName, returnedBy
    } = input;

    const allLedger = InventoryService.getStockLedger();
    const allStore  = InventoryService.getStore();

    // Find original GRN entry
    const originalEntry = allLedger.find(e => e.referenceDoc === grnId && e.mvmntCode === '101');
    if (!originalEntry) throw new Error(`GRN ${grnId} not found in Material Ledger`);

    const storeIdx = allStore.findIndex(s => s.id === originalEntry.materialId);
    if (storeIdx === -1) throw new Error(`Store item not found for ${originalEntry.materialId}`);

    const store = { ...allStore[storeIdx] };
    const currentMAP = store.movingAveragePrice;

    // Deduct defect qty from store
    const returnValue  = Number((defectSqft * currentMAP).toFixed(2));
    store.quantity        = Math.max(0, store.quantity - defectSqft);
    store.unrestrictedQty = Math.max(0, store.unrestrictedQty - defectSqft);
    store.totalValue      = Math.max(0, store.totalValue - returnValue);
    store.lastMovementDate = new Date().toISOString();
    // MAP unchanged on return (IAS 2 — MAP doesn't change on same-cost return)

    const today    = new Date().toISOString().split('T')[0];
    const returnId = `RET-${grnId}-${Date.now().toString().slice(-4)}`;

    // Material Ledger: Movement 122 — Return to Vendor
    const returnEntry: MaterialLedgerEntry = {
      id: `${returnId}-ML`,
      company,
      materialId: store.id,
      timestamp: new Date().toISOString(),
      mvmntCode: '201' as any,  // closest available; ideally 122
      qty: -defectSqft,         // negative = outward
      uom: 'SqFt',
      valuation: currentMAP,
      balanceAfter: store.quantity,
      referenceDoc: returnId,
      user: returnedBy,
      remarks: `DEFECT RETURN: ${defectSheets} sheets — ${defectDescription} | Orig GRN: ${grnId}`,
      storageBin: store.storageBin,
    } as MaterialLedgerEntry;

    // Store image refs & vendor claim data on entry
    (returnEntry as any).defectSheets    = defectSheets;
    (returnEntry as any).defectSqft      = defectSqft;
    (returnEntry as any).defectImages    = imageRefs;   // base64 / URLs
    (returnEntry as any).vendorId        = vendorId;
    (returnEntry as any).vendorName      = vendorName;
    (returnEntry as any).originalGrnId   = grnId;
    (returnEntry as any).isDefectReturn  = true;

    // GL: Dr Vendor-Claim Receivable / Cr Inventory
    // (Debit: 11411 Advance — Glass Vendors as vendor claim asset, Credit: inventory)
    const invAcc   = resolveInventoryAccount(company, (originalEntry as any).glassCategory || 'Plain');
    const claimAcc = resolveAccount(company, '11411'); // Advance — Glass Vendors (vendor claim)

    const glJournalId = `KR-${returnId}`;
    if (invAcc && claimAcc) {
      const returnJournal: LedgerTransaction = {
        id: glJournalId,
        company,
        docType: 'KR',
        docDate: today,
        date: today,
        description: `Defect Return — ${vendorName} | ${returnId} | Orig: ${grnId}`,
        referenceId: returnId,
        status: 'Posted',
        details: [
          {
            accountId: claimAcc.id,
            debit: returnValue,
            credit: 0,
            text: `Vendor claim: ${defectSheets} defect sheets — ${defectDescription}`,
          },
          {
            accountId: invAcc.id,
            debit: 0,
            credit: returnValue,
            text: `Inventory reduction: ${defectSqft.toFixed(2)} sqft @ MAP ${currentMAP.toFixed(2)}`,
          },
        ],
      };
      FinanceService.recordTransaction(returnJournal);
    }

    // Persist
    allStore[storeIdx] = store;
    InventoryService.saveStore(allStore);
    InventoryService.saveStockLedger([...allLedger, returnEntry]);

    return { returnId, glJournalId };
  },

  // ────────────────────────────────────────────────────────────────────────────
  // STEP 4: Full GRN Reversal (Movement 102)
  // IAS 1.38: Creates NEW reversal entry, does not delete original
  // ────────────────────────────────────────────────────────────────────────────
  reverseGRN(input: GRNReversalInput): { reversalId: string; glJournalId: string } {
    const { grnId, company, reason, reversedBy } = input;

    const allLedger = InventoryService.getStockLedger();
    const allStore  = InventoryService.getStore();

    const original = allLedger.find(e => e.referenceDoc === grnId && e.mvmntCode === '101');
    if (!original) throw new Error(`Cannot reverse: GRN ${grnId} not found`);

    // Check not already reversed
    const alreadyReversed = allLedger.some(e => (e as any).reversalOf === grnId);
    if (alreadyReversed) throw new Error(`GRN ${grnId} already reversed`);

    const storeIdx = allStore.findIndex(s => s.id === original.materialId);
    if (storeIdx === -1) throw new Error(`Store item not found`);

    const store = { ...allStore[storeIdx] };
    const qtyToReverse   = original.qty;
    const valueToReverse = qtyToReverse * original.valuation;

    store.quantity        = Math.max(0, store.quantity - qtyToReverse);
    store.unrestrictedQty = Math.max(0, store.unrestrictedQty - qtyToReverse);
    store.totalValue      = Math.max(0, store.totalValue - valueToReverse);
    if (store.quantity > 0) {
      store.movingAveragePrice = store.totalValue / store.quantity;
    }
    store.lastMovementDate = new Date().toISOString();

    const today      = new Date().toISOString().split('T')[0];
    const reversalId = `REV-${grnId}`;

    // Material Ledger reversal entry
    const reversalEntry: MaterialLedgerEntry = {
      id: `${reversalId}-ML`,
      company,
      materialId: store.id,
      timestamp: new Date().toISOString(),
      mvmntCode: '101' as any,  // will show as 102 via flag
      qty: -qtyToReverse,
      uom: original.uom,
      valuation: original.valuation,
      balanceAfter: store.quantity,
      referenceDoc: reversalId,
      user: reversedBy,
      remarks: `REVERSAL of ${grnId}: ${reason}`,
      storageBin: store.storageBin,
    };
    (reversalEntry as any).reversalOf   = grnId;
    (reversalEntry as any).isReversal   = true;
    (reversalEntry as any).reversalReason = reason;

    // GL reversal: Dr GR/IR Clearing / Cr Inventory
    // Reverses the original GRN posting (Dr Inventory / Cr GR/IR)
    const invAcc   = resolveInventoryAccount(company, 'Plain'); // fallback
    const grirAcc2 = resolveAccount(company, '21151'); // GR/IR — Glass Material
    const glJournalId = `WE-${reversalId}`;

    if (invAcc && grirAcc2) {
      const revJournal: LedgerTransaction = {
        id: glJournalId,
        company,
        docType: 'WA', // WA = Goods Issue/reversal
        docDate: today,
        date: today,
        description: `GRN REVERSAL: ${grnId} — ${reason}`,
        referenceId: reversalId,
        status: 'Posted',
        details: [
          {
            accountId: grirAcc2.id,
            debit: valueToReverse,
            credit: 0,
            text: `Reverse GR/IR clearing: ${grnId}`,
          },
          {
            accountId: invAcc.id,
            debit: 0,
            credit: valueToReverse,
            text: `Reverse inventory: ${qtyToReverse.toFixed(2)} sqft`,
          },
        ],
      };
      FinanceService.recordTransaction(revJournal);
    }

    allStore[storeIdx] = store;
    InventoryService.saveStore(allStore);
    InventoryService.saveStockLedger([...allLedger, reversalEntry]);

    return { reversalId, glJournalId };
  },

  // ────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────────────

  /** Get all GRN entries for GlassCo with extended vendor/defect data */
  getGRNHistory(company: Company): any[] {
    return InventoryService.getStockLedger()
      .filter(e => e.company === company && e.referenceDoc?.startsWith('GRN-'))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  },

  /** Get all defect return entries */
  getDefectReturns(company: Company): any[] {
    return InventoryService.getStockLedger()
      .filter(e => e.company === company && (e as any).isDefectReturn === true)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  },

  /** Check if a GRN has been reversed */
  isGRNReversed(grnId: string): boolean {
    return InventoryService.getStockLedger().some(e => (e as any).reversalOf === grnId);
  },

  /** Validate GRN can be posted: checks vendor, qty, accounts exist */
  validateGRN(input: GRNPostInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.vendorId)             errors.push('Vendor is required');
    if (!input.referenceDoc)         errors.push('PO / Challan reference required');
    if (input.sheetCount <= 0)       errors.push('Sheet count must be > 0');
    if (input.sqftPerSheet <= 0)     errors.push('Sheet size (sqft) must be > 0');
    if (input.unitCostPKR <= 0)      errors.push('Unit cost must be > 0');
    if (!input.thickness)            errors.push('Thickness is required');
    if (!input.sheetSize)            errors.push('Sheet size is required');

    // Check GL accounts exist
    const invAcc  = resolveInventoryAccount(input.company, input.glassCategory);
    const vendAcc = resolveAccount(input.company, '21111');
    const grirCheck = resolveAccount(input.company, '21151');
    if (!invAcc)    errors.push('Inventory GL account not found in COA — check GlassCo COA setup');
    if (!grirCheck) errors.push('GR/IR Clearing GL (21151) not found — run COA seed or check coa.glassco.ts');

    return { valid: errors.length === 0, errors };
  },
};
