// ── NCR Service — Glass Breakage Management ──────────────────────────
import { safeParse, safeSave } from '@/modules/shared/services/utils';
import { SyncService } from '@/src/services/SyncService';
import { FinanceService } from '@/modules/finance/services/financeService';
import { ProductionService } from './productionService';
import { Logger } from '@/modules/shared/services/logger';
import type { NCREvent, NCRReproduction, NCRVendorClaim, BreakageRemnant } from '../types/ncr';

const KEYS = {
  NCR_EVENTS:     'gtk_erp_ncr_events',
  REPRODUCTIONS:  'gtk_erp_ncr_reproductions',
  VENDOR_CLAIMS:  'gtk_erp_ncr_claims',
  REMNANTS:       'gtk_erp_ncr_remnants',
};

// ── ID Generators ────────────────────────────────────────────────────
const genNcrId = (): string => {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const seq = String(Date.now()).slice(-4);
  return `NCR-${date}-${seq}`;
};
const genReprId  = () => `REPR-${Date.now().toString().slice(-6)}`;
const genClaimId = () => `CLM-${Date.now().toString().slice(-6)}`;
const genRemnantId = () => `RMT-${Date.now().toString().slice(-6)}`;

// ── CRUD ─────────────────────────────────────────────────────────────
export const NCRService = {

  // ── NCR Events ──────────────────────────────────────────────────────
  getNCREvents: (): NCREvent[] => safeParse(KEYS.NCR_EVENTS),
  saveNCREvents: (data: NCREvent[]) => {
    safeSave(KEYS.NCR_EVENTS, data);
    SyncService.markDirty('ncr_events');
  },

  getNCRByCompany: (company: string): NCREvent[] =>
    NCRService.getNCREvents().filter(e => e.company === company),

  getNCRByPiece: (pieceId: string): NCREvent | undefined =>
    NCRService.getNCREvents().find(e => e.pieceId === pieceId),

  getNCRByJob: (jobOrderId: string): NCREvent[] =>
    NCRService.getNCREvents().filter(e => e.jobOrderId === jobOrderId),

  // ── Create NCR ───────────────────────────────────────────────────────
  createNCR: (data: Omit<NCREvent, 'id' | 'reportedAt' | 'status'>): NCREvent => {
    const ncr: NCREvent = {
      ...data,
      id: genNcrId(),
      reportedAt: new Date().toISOString(),
      status: data.action === 'Reproduce' ? 'Reproduce-Pending'
            : data.action === 'Vendor-Claim' ? 'Claim-Pending'
            : 'Open',
    };

    // 1. Save NCR
    const all = NCRService.getNCREvents();
    NCRService.saveNCREvents([...all, ncr]);

    // 2. Mark piece as Broken
    if (data.pieceId) {
      const pieces = ProductionService.getProductionPieces();
      const updated = pieces.map(p =>
        p.id === data.pieceId
          ? { ...p, status: 'Broken' as const, lastUpdated: new Date().toISOString() }
          : p
      );
      ProductionService.saveProductionPieces(updated);
    }

    // 3. Auto GL write-off entry (Dispose action)
    if (data.action === 'Dispose' && data.estimatedValue > 0) {
      NCRService._postWriteOffGL(ncr);
    }

    // 4. If Vendor Claim — auto create claim record
    if (data.action === 'Vendor-Claim' && data.vendorId) {
      NCRService.createVendorClaim({
        ncrId: ncr.id,
        company: ncr.company,
        vendorId: ncr.vendorId!,
        vendorName: ncr.vendorName || '',
        claimDate: new Date().toISOString().split('T')[0],
        claimAmount: ncr.estimatedValue,
        description: `Breakage claim — ${ncr.id}: ${ncr.description}`,
        photos: ncr.photos,
        purchaseRef: ncr.purchaseRef,
        status: 'Draft',
      });
    }

    // 5. If Reproduce — create reproduction order
    if (data.action === 'Reproduce' && data.jobOrderId !== undefined) {
      NCRService.createReproduction({
        ncrId: ncr.id,
        company: ncr.company,
        jobOrderId: ncr.jobOrderId!,
        itemIndex: ncr.itemIndex ?? 0,
        originalPieceId: ncr.pieceId,
        priority: 'High',
        status: 'Queued',
        extraCost: 0,
      });
    }

    Logger.action('Production', 'NCR_CREATED', `NCR ${ncr.id} — ${data.cause} — PKR ${data.estimatedValue}`);
    return ncr;
  },

  // ── Update NCR status ────────────────────────────────────────────────
  updateNCR: (id: string, updates: Partial<NCREvent>): void => {
    const all = NCRService.getNCREvents();
    const updated = all.map(e => e.id === id ? { ...e, ...updates } : e);
    NCRService.saveNCREvents(updated);
  },

  closeNCR: (id: string, closedBy: string): void => {
    NCRService.updateNCR(id, {
      status: 'Closed',
      closedAt: new Date().toISOString(),
      closedBy,
    });
  },

  // ── Reproductions ────────────────────────────────────────────────────
  getReproductions: (): NCRReproduction[] => safeParse(KEYS.REPRODUCTIONS),
  saveReproductions: (data: NCRReproduction[]) => {
    safeSave(KEYS.REPRODUCTIONS, data);
    SyncService.markDirty('ncr_reproductions');
  },

  getReproductionsByCompany: (company: string): NCRReproduction[] =>
    NCRService.getReproductions().filter(r => r.company === company),

  createReproduction: (data: Omit<NCRReproduction, 'id' | 'createdAt'>): NCRReproduction => {
    const repr: NCRReproduction = {
      ...data,
      id: genReprId(),
      createdAt: new Date().toISOString(),
    };
    const all = NCRService.getReproductions();
    NCRService.saveReproductions([...all, repr]);
    Logger.action('Production', 'REPR_CREATED', `Reproduction ${repr.id} for NCR ${data.ncrId}`);
    return repr;
  },

  // When reproduction is done — link new piece, update NCR
  completeReproduction: (reprId: string, newPieceId: string): void => {
    const reprs = NCRService.getReproductions();
    const repr = reprs.find(r => r.id === reprId);
    if (!repr) return;

    // Update reproduction
    const updatedReprs = reprs.map(r =>
      r.id === reprId
        ? { ...r, status: 'Completed' as const, newPieceId, completedAt: new Date().toISOString() }
        : r
    );
    NCRService.saveReproductions(updatedReprs);

    // Update NCR
    NCRService.updateNCR(repr.ncrId, { status: 'Reproduce-Done' });

    Logger.action('Production', 'REPR_COMPLETED', `Reproduction ${reprId} → Piece ${newPieceId}`);
  },

  // ── Vendor Claims ────────────────────────────────────────────────────
  getVendorClaims: (): NCRVendorClaim[] => safeParse(KEYS.VENDOR_CLAIMS),
  saveVendorClaims: (data: NCRVendorClaim[]) => {
    safeSave(KEYS.VENDOR_CLAIMS, data);
    SyncService.markDirty('ncr_claims');
  },

  getVendorClaimsByCompany: (company: string): NCRVendorClaim[] =>
    NCRService.getVendorClaims().filter(c => c.company === company),

  createVendorClaim: (data: Omit<NCRVendorClaim, 'id'>): NCRVendorClaim => {
    const claim: NCRVendorClaim = { ...data, id: genClaimId() };
    const all = NCRService.getVendorClaims();
    NCRService.saveVendorClaims([...all, claim]);
    return claim;
  },

  submitClaim: (claimId: string): void => {
    const claims = NCRService.getVendorClaims();
    const updated = claims.map(c =>
      c.id === claimId ? { ...c, status: 'Submitted' as const } : c
    );
    NCRService.saveVendorClaims(updated);
  },

  settleClaim: (claimId: string, settledAmount: number, company: string): void => {
    const claims = NCRService.getVendorClaims();
    const claim = claims.find(c => c.id === claimId);
    if (!claim) return;

    const today = new Date().toISOString().split('T')[0];
    const updated = claims.map(c =>
      c.id === claimId
        ? { ...c, status: 'Settled' as const, settledAmount, settledDate: today }
        : c
    );
    NCRService.saveVendorClaims(updated);

    // GL — Vendor Claim Recovery entry
    if (settledAmount > 0) {
      const accs = FinanceService.getAccounts().filter(a => a.company === company);
      const cashAcc = accs.find(a => a.code?.startsWith('1001') || a.name?.toLowerCase().includes('cash'));
      const claimAcc = accs.find(a => a.name?.toLowerCase().includes('vendor claim') || a.name?.toLowerCase().includes('receivable'));

      if (cashAcc && claimAcc) {
        const all = FinanceService.getLedger();
        FinanceService.saveLedger([...all, {
          id: `GL-CLM-${claimId}`,
          company,
          docType: 'JV',
          docDate: today,
          date: today,
          description: `Vendor Claim Settled — ${claim.vendorName} — ${claimId}`,
          referenceId: claimId,
          status: 'Posted',
          details: [
            { accountId: cashAcc.id, debit: settledAmount, credit: 0, text: 'Claim recovery received' },
            { accountId: claimAcc.id, debit: 0, credit: settledAmount, text: `Vendor: ${claim.vendorName}` },
          ],
        } as any]);
        SyncService.markDirty('ledger');
      }
    }

    // Update linked NCR
    NCRService.updateNCR(claim.ncrId, { status: 'Claim-Settled' });
    Logger.action('Finance', 'CLAIM_SETTLED', `Claim ${claimId} settled PKR ${settledAmount}`);
  },

  // ── Remnants ─────────────────────────────────────────────────────────
  getRemnants: (): BreakageRemnant[] => safeParse(KEYS.REMNANTS),
  saveRemnants: (data: BreakageRemnant[]) => {
    safeSave(KEYS.REMNANTS, data);
    SyncService.markDirty('ncr_remnants');
  },

  addRemnant: (data: Omit<BreakageRemnant, 'id'>): BreakageRemnant => {
    const remnant: BreakageRemnant = { ...data, id: genRemnantId() };
    NCRService.saveRemnants([...NCRService.getRemnants(), remnant]);
    return remnant;
  },

  // ── GL Write-off (internal) ──────────────────────────────────────────
  _postWriteOffGL: (ncr: NCREvent): void => {
    try {
      const company = ncr.company as any;
      const accs = FinanceService.getAccounts().filter(a => a.company === company);
      const today = new Date().toISOString().split('T')[0];

      // Ensure write-off account exists
      const assets = FinanceService.ensureAccount(company, 'ASSETS', 1, null, 'Asset', '10');
      const inventory = FinanceService.ensureAccount(company, 'INVENTORY', 2, assets.id, 'Asset', '13');
      const glassInv = FinanceService.ensureAccount(company, 'GLASS INVENTORY', 3, inventory.id, 'Asset', '131');
      const wip = FinanceService.ensureAccount(company, 'WIP GLASS', 4, glassInv.id, 'Asset', '1311');

      const expenses = FinanceService.ensureAccount(company, 'EXPENSES', 1, null, 'Expense', '50');
      const prodCost = FinanceService.ensureAccount(company, 'PRODUCTION COSTS', 2, expenses.id, 'Expense', '51');
      const breakageLoss = FinanceService.ensureAccount(company, 'GLASS BREAKAGE LOSS', 3, prodCost.id, 'Expense', '511');

      const all = FinanceService.getLedger();
      const entry = {
        id: `GL-NCR-${ncr.id}`,
        company,
        docType: 'JV',
        docDate: today,
        date: today,
        description: `Glass Breakage Write-off — ${ncr.id} — ${ncr.stage}`,
        referenceId: ncr.id,
        status: 'Posted',
        details: [
          { accountId: breakageLoss.id, debit: ncr.estimatedValue, credit: 0, text: `Breakage: ${ncr.description}` },
          { accountId: wip.id, debit: 0, credit: ncr.estimatedValue, text: `WIP reduction — ${ncr.sqftLost} sqft` },
        ],
      };
      FinanceService.saveLedger([...all, entry as any]);
      SyncService.markDirty('ledger');

      // Update NCR with GL reference
      NCRService.updateNCR(ncr.id, { glEntryId: entry.id });
    } catch (e) {
      console.warn('[NCR] GL write-off failed:', e);
    }
  },

  // ── KPI Calculations ─────────────────────────────────────────────────
  getKPIs: (company: string, month?: string) => {
    const ncrs = NCRService.getNCRByCompany(company);
    const filtered = month
      ? ncrs.filter(e => e.reportedAt.startsWith(month))
      : ncrs;

    const totalPieces = ProductionService.getProductionPieces()
      .filter(p => (p as any).company === company).length;

    const totalBroken = filtered.length;
    const totalLoss = filtered.reduce((s, e) => s + e.estimatedValue, 0);
    const totalSqftLost = filtered.reduce((s, e) => s + e.sqftLost, 0);

    const reproduced = filtered.filter(e => e.action === 'Reproduce').length;
    const claimed = filtered.filter(e => e.action === 'Vendor-Claim').length;
    const disposed = filtered.filter(e => e.action === 'Dispose').length;

    const byStage = filtered.reduce((acc, e) => {
      acc[e.stage] = (acc[e.stage] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byCause = filtered.reduce((acc, e) => {
      acc[e.cause] = (acc[e.cause] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topCause = Object.entries(byCause).sort((a, b) => b[1] - a[1])[0];
    const topStage = Object.entries(byStage).sort((a, b) => b[1] - a[1])[0];

    const breakageRate = totalPieces > 0 ? ((totalBroken / totalPieces) * 100).toFixed(2) : '0.00';

    // Claim recovery
    const claims = NCRService.getVendorClaims().filter(c => c.company === company);
    const totalClaimed = claims.reduce((s, c) => s + c.claimAmount, 0);
    const totalRecovered = claims.filter(c => c.status === 'Settled')
      .reduce((s, c) => s + (c.settledAmount || 0), 0);
    const recoveryRate = totalClaimed > 0
      ? ((totalRecovered / totalClaimed) * 100).toFixed(1)
      : '0.0';

    return {
      totalBroken,
      totalLoss,
      totalSqftLost: +totalSqftLost.toFixed(2),
      breakageRate: +breakageRate,
      reproduced,
      claimed,
      disposed,
      byStage,
      byCause,
      topCause: topCause?.[0] || 'N/A',
      topStage: topStage?.[0] || 'N/A',
      totalClaimed,
      totalRecovered,
      recoveryRate: +recoveryRate,
    };
  },
};
