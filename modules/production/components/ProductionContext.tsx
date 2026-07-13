import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Company, Quotation, Client, ProductionPiece, PieceStatus, TemperingDispatch, GatePass, WarehouseSpot, PieceFault } from '@/modules/shared/types';
import { ProductionService } from '@/modules/production/services/productionService';
import { SalesService } from '@/modules/sales/services/salesService';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { postTemperingInwardGL, postDeliveryCOGS } from '@/modules/procurement/services/glasscoGLService';
import { FinanceService } from '@/modules/finance/services/financeService';                    // Step 3 — pay-on-collection settlement
import { TemperingCommitmentService } from '@/modules/finance/services/temperingCommitmentService'; // Step 3 — settle commitment
import { supabase } from '@/src/services/supabaseClient';                       // Sprint 5
import { useAuthStore } from '@/modules/auth/authStore';                       // Sprint 5
import { dispatchPieceStatusEvent } from '@/modules/production/hooks/useProductionRealtime'; // Sprint 10
import { Loader2 } from 'lucide-react';
import {
  UNIVERSAL_TRANSITIONS,
  PIECE_TRANSITIONS,
  isTransitionAllowed,
} from '@/modules/production/services/pieceStatusMachine';

// ── Phase-7 (B5): Piece status state-machine ──────────────────────────
// The transition rules now live in a pure module so they can be unit-tested
// against the REAL table without loading this whole component tree. Re-exported
// here for back-compat with any existing importers.
// See: modules/production/services/pieceStatusMachine.ts (+ its .test.ts).
export { UNIVERSAL_TRANSITIONS, PIECE_TRANSITIONS, isTransitionAllowed };

interface ProductionContextType {
  company: Company;
  pieces: ProductionPiece[];
  jobOrders: Quotation[];
  clients: Client[];
  dispatches: TemperingDispatch[];
  gatePasses: GatePass[];
  spots: WarehouseSpot[];
  refreshData: () => void;
  isLoading: boolean;
  
  selectedJobId: string | null;
  setSelectedJobId: (id: string | null) => void;
  selectedClientFilter: string;
  setSelectedClientFilter: (id: string) => void;
  filterDate: string;
  setFilterDate: (date: string) => void;

  activeDispatchIdForLoading: string;
  setActiveDispatchIdForLoading: (id: string) => void;
  activeInwardDispatchId: string;
  setActiveInwardDispatchId: (id: string) => void;
  // Step 3 — pay-on-collection: how the tempering AP is settled at receive.
  temperingPayMethod: 'Cash' | 'Bank';
  setTemperingPayMethod: (m: 'Cash' | 'Bank') => void;

  handleUpdatePieceStatus: (id: string, status: PieceStatus, extra?: Partial<ProductionPiece>) => Promise<void>;
  handleCuttingOutput: (piece: ProductionPiece) => void;
  handleInwardPiece: (pieceId: string) => void;
  togglePieceToDispatch: (pieceId: string) => void;
  loadAllPiecesToDispatch: (pieceIds: string[]) => Promise<void>;
  togglePieceForDelivery: (pieceId: string) => void;
  executeDirectDelivery: () => void;
  handleRecordFault: () => void;
  
  isBinModalOpen: boolean;
  setIsBinModalOpen: (val: boolean) => void;
  openBinModal: (piece: ProductionPiece) => void;
  selectedPieceForBin: ProductionPiece | null;
  assignSpot: () => void;
  selectedSpotId: string;
  setSelectedSpotId: (val: string) => void;

  isDirectDeliveryModalOpen: boolean;
  setIsDirectDeliveryModalOpen: (val: boolean) => void;
  directDeliveryForm: { vehicleNo: string, driverName: string, siteName: string };
  setDirectDeliveryForm: (val: any) => void;
  selectedPiecesForDelivery: Set<string>;

  selectedPieceForFault: ProductionPiece | null;
  setSelectedPieceForFault: (p: ProductionPiece | null) => void;
  faultForm: { description: string, disposal: 'Recut' | 'Accepted' };
  setFaultForm: (val: any) => void;

  inwardAuditablePieces: ProductionPiece[];
  analyticsData: any;
  getJobDetails: (jobId: string, statusFilter: (p: ProductionPiece) => boolean) => any;
}

const ProductionContext = createContext<ProductionContextType | undefined>(undefined);

export const ProductionProvider: React.FC<{ company: Company, children: React.ReactNode }> = ({ company, children }) => {
  const [pieces, setPieces] = useState<ProductionPiece[]>([]);
  const [jobOrders, setJobOrders] = useState<Quotation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [dispatches, setDispatches] = useState<TemperingDispatch[]>([]);
  const [gatePasses, setGatePasses] = useState<GatePass[]>([]);
  const [spots, setSpots] = useState<WarehouseSpot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>('');
  const [filterDate, setFilterDate] = useState<string>('');

  const [activeDispatchIdForLoading, setActiveDispatchIdForLoading] = useState<string>('');
  const [activeInwardDispatchId, setActiveInwardDispatchId] = useState<string>('');
  const [temperingPayMethod, setTemperingPayMethod] = useState<'Cash' | 'Bank'>('Cash');

  const [isBinModalOpen, setIsBinModalOpen] = useState(false);
  const [selectedPieceForBin, setSelectedPieceForBin] = useState<ProductionPiece | null>(null);
  const [selectedSpotId, setSelectedSpotId] = useState('');

  const [isDirectDeliveryModalOpen, setIsDirectDeliveryModalOpen] = useState(false);
  const [selectedPiecesForDelivery, setSelectedPiecesForDelivery] = useState<Set<string>>(new Set());
  const [directDeliveryForm, setDirectDeliveryForm] = useState({ vehicleNo: '', driverName: '', siteName: '' });

  const [selectedPieceForFault, setSelectedPieceForFault] = useState<ProductionPiece | null>(null);
  const [faultForm, setFaultForm] = useState({ description: '', disposal: 'Recut' as any });

  useEffect(() => {
    refreshData();
    setSelectedJobId(null);
  }, [company]);

  const refreshData = async () => {
    setIsLoading(true);
    const allPieces = await ProductionService.getProductionPiecesAsync();
    
    let companyCode = company as string;
    if (company === 'Glassco') companyCode = 'GLS';
    else if ((company as string) === 'Nippon') companyCode = 'NIP';
    else if ((company as string) === 'Factory') companyCode = ''; 

    const companyPieces = (company as string) === 'Factory' 
      ? allPieces 
      : allPieces.filter(p => p && p.orderId?.includes(companyCode));

    setPieces(companyPieces);
    // Show all active job orders — Approved, Invoiced, Partial Payment.
    // Cloud-backed loaders (scoped to the active company) — NOT the sync
    // SalesService cache getters, which are empty on a fresh route and left
    // the Job filters, client names and glass specs blank until a manual sync.
    const ACTIVE_STATUSES = ['Approved', 'Invoiced', 'Partial Payment', 'approved', 'invoiced'];
    try {
      const [allQuotes, allClients] = await Promise.all([
        AsyncSalesService.getQuotations(),
        AsyncSalesService.getClients(),
      ]);
      const companyJobs = allQuotes.filter(q => {
        const qCompany = q.company || (q as any).data?.company;
        const qStatus = q.status || (q as any).data?.status;
        return (!qCompany || qCompany === company) && ACTIVE_STATUSES.includes(qStatus);
      });
      setJobOrders(companyJobs);
      setClients(allClients.filter(c => !c.company || c.company === company));
    } catch {
      // Offline / cloud error — fall back to whatever the local cache has.
      const cachedQuotes = SalesService.getQuotations();
      setJobOrders(cachedQuotes.filter(q => {
        const qCompany = q.company || (q as any).data?.company;
        const qStatus = q.status || (q as any).data?.status;
        return (qCompany === company) && ACTIVE_STATUSES.includes(qStatus);
      }));
      setClients(SalesService.getClients().filter(c => c.company === company));
    }
    setDispatches(ProductionService.getTemperingDispatches().filter(d => d.company === company || d.company === 'Factory'));
    setGatePasses(ProductionService.getGatePasses().filter(g => g.company === company));
    setSpots(ProductionService.getWarehouseSpots().filter(s => s.company === company));
    setIsLoading(false);
  };

  // ── Sprint 5 (P0 fix) — atomic piece status update via Postgres RPC. ───
  // Audit defects addressed:
  //   #1 P0: previous code used `getPiecesAsync().then(saveAll)` — non-
  //          awaited, racy. Two fast clicks could lose the second update.
  //   #3 P1: NCR could resurrect a Delivered piece because the client-side
  //          state-machine guard was per-pieces snapshot. The RPC enforces
  //          the same map server-side using SELECT … FOR UPDATE.
  //   #5 P1: Hold state asymmetry — exits were unrestricted. The RPC
  //          captures `holdFrom` on entry and rejects exits to anywhere
  //          else (besides universal Broken/Returned/Hold).
  //
  // Client still does an optimistic update for snappy UX + a quick local
  // transition guard (so the obvious "Cut → Dispatched" gets a toast
  // immediately without a round-trip). On RPC failure we revert.
  const handleUpdatePieceStatus = async (id: string, status: PieceStatus, extra: Partial<ProductionPiece> = {}) => {
    const current = pieces.find(p => p.id === id);
    if (!current) return;

    // Client-side transition guard (mirrors RPC) — fast feedback path.
    const fromStatus = current.status as PieceStatus;
    if (fromStatus === 'Hold') {
      // Hold→origin only (or universal). Mirror of RPC hold check.
      const hf = (current as any).holdFrom as PieceStatus | undefined;
      const isUniversal = UNIVERSAL_TRANSITIONS.includes(status);
      if (!isUniversal && hf && status !== hf) {
        toast.error(
          `Hold exit blocked: ${id} was held from "${hf}" — it can only return to "${hf}" (or Broken/Returned).`,
          { duration: 8000 }
        );
        return;
      }
    } else if (!isTransitionAllowed(fromStatus, status)) {
      toast.error(
        `Illegal status change: ${id} is "${current.status}" → "${status}". ` +
        `Allowed next steps: ${[...(PIECE_TRANSITIONS[fromStatus] || []), ...UNIVERSAL_TRANSITIONS].join(', ') || '(terminal)'}`,
        { duration: 8000 }
      );
      return;
    }

    // Optimistic UI: patch local state immediately so the operator sees
    // the change without waiting for the network round-trip.
    const optimistic: Partial<ProductionPiece> = {
      ...extra,
      status,
      lastUpdated: new Date().toISOString(),
    };
    if (status === 'Hold' && fromStatus !== 'Hold') {
      (optimistic as any).holdFrom = fromStatus;
    } else if (fromStatus === 'Hold' && status !== 'Hold') {
      (optimistic as any).holdFrom = undefined;
    }
    setPieces(prev => prev.map(p => p.id === id ? { ...p, ...optimistic } as ProductionPiece : p));

    // Atomic server-side update — locks the row, validates again, increments
    // version, audit-trail trigger captures before/after automatically.
    try {
      const actor = useAuthStore.getState().profile?.email
                  ?? useAuthStore.getState().user?.email
                  ?? 'system';
      const { error } = await supabase.rpc('update_piece_status_atomic', {
        p_piece_id:   id,
        p_new_status: status,
        p_changed_by: actor,
        p_reason:     null,
        p_extra:      extra as any,
      });
      if (error) {
        // Revert optimistic update + surface server-side reason.
        setPieces(prev => prev.map(p => p.id === id ? current : p));
        const msg = error.message || '';
        if (msg.includes('invalid_hold_exit')) {
          toast.error(`Hold exit rejected by server: ${msg}`, { duration: 9000 });
        } else if (msg.includes('invalid_transition')) {
          toast.error(`Server rejected status transition: ${msg}`, { duration: 9000 });
        } else if (msg.includes('piece_not_found')) {
          toast.error(`Piece ${id} not found in cloud — refresh and retry.`, { duration: 9000 });
        } else {
          toast.error(`Atomic status update failed: ${msg}`, { duration: 9000 });
        }
        return;
      }
      // RPC committed. Mirror to localStorage for synchronous reads.
      ProductionService.getProductionPiecesAsync().then(all => {
        const newAll = all.map(p => p.id === id ? { ...p, ...optimistic } as ProductionPiece : p);
        ProductionService.saveProductionPiecesBg(newAll);
      });
      // Sprint 10 — fire cross-team toast on the same device
      dispatchPieceStatusEvent(id, status, company);
    } catch (e: any) {
      // Network exception — keep optimistic update locally; offline-queue
      // will catch the cloud delta on reconnect.
      console.warn('[update_piece_status_atomic] network exception (kept local):', e?.message);
      ProductionService.getProductionPiecesAsync().then(all => {
        const newAll = all.map(p => p.id === id ? { ...p, ...optimistic } as ProductionPiece : p);
        ProductionService.saveProductionPiecesBg(newAll);
      });
    }
  };

  const handleCuttingOutput = (piece: ProductionPiece) => {
      const order = jobOrders.find(j => j.orderNo === piece.orderId);
      const item = order?.items[piece.itemIndex];
      const services: string[] = [];
      const s = item?.selectedServices || [];
      
      // Map to 4 logic categories
      if (s.includes('P/E') || s.includes('P/F')) services.push('Polishing');
      if (s.includes('R/D')) services.push('Grinding');
      if (s.includes('Notch')) services.push('Notching');
      if (item?.holes && item.holes.length > 0) services.push('Holes');

      if (services.length > 0) {
          handleUpdatePieceStatus(piece.id, 'Service-Pending', { pendingServices: services });
      } else {
          handleUpdatePieceStatus(piece.id, 'QC-Pending');
      }
  };

  const openBinModal = (piece: ProductionPiece) => {
    setSelectedPieceForBin(piece);
    setSelectedSpotId(piece.spotId || '');
    setIsBinModalOpen(true);
  };

  const assignSpot = () => {
    if (!selectedPieceForBin) return;
    handleUpdatePieceStatus(selectedPieceForBin.id, selectedPieceForBin.status, { spotId: selectedSpotId });
    setIsBinModalOpen(false);
    setSelectedPieceForBin(null);
  };

  const togglePieceToDispatch = (pieceId: string) => {
    if (!activeDispatchIdForLoading) return toast.error("Selection Error: Choose an active Trip ID first.", { duration: 4000 });
    const targetTrip = dispatches.find(d => d.id === activeDispatchIdForLoading);
    if (!targetTrip) return;

    const targetPiece = pieces.find(p => p.id === pieceId);
    if (!targetPiece) return;

    const isAlreadyIn = targetPiece.dispatchId === activeDispatchIdForLoading;
    const isRemoteLoad = targetTrip.originLocation && targetTrip.originLocation !== 'Factory';
    const isSiteDelivery = targetTrip.serviceType === 'Site Delivery';
    
    let newStatus: PieceStatus;
    if (isAlreadyIn) {
        newStatus = isRemoteLoad ? 'Dispatched' : 'QC-Passed';
        if (isSiteDelivery) newStatus = 'Ready to Dispatch';
        if (!isSiteDelivery && !isRemoteLoad && targetTrip.serviceType !== 'Tempering') newStatus = 'Tempered';
    } else {
        if (isRemoteLoad) newStatus = 'Dispatched'; 
        else newStatus = isSiteDelivery ? 'Ready to Dispatch' : 'QC-Passed';
    }
    const newDispatchId = isAlreadyIn ? undefined : activeDispatchIdForLoading;
    
    handleUpdatePieceStatus(pieceId, newStatus, { dispatchId: newDispatchId });

    const updatedDispatches = dispatches.map(d => {
      if (d.id === activeDispatchIdForLoading) {
        const pIds = isAlreadyIn ? d.pieceIds.filter(id => id !== pieceId) : [...d.pieceIds, pieceId];
        return { ...d, pieceIds: pIds };
      }
      return d;
    });
    ProductionService.saveTemperingDispatches(updatedDispatches);
    setDispatches(updatedDispatches);
  };

  // ── Sprint 5 (P1 fix) — atomic batch dispatch via Postgres RPC. ───
  // Audit defect #4: previous code did getPieces → mutate-all → saveAll
  // which is non-atomic — two operators dispatching the same piece
  // into different trips simultaneously could both succeed. The RPC
  // takes a SELECT … FOR UPDATE on each piece + the dispatch row, so
  // the second batch waits and then sees the first one's changes
  // (rejecting any piece already in another active dispatch).
  const loadAllPiecesToDispatch = async (pieceIds: string[]) => {
    if (!activeDispatchIdForLoading) {
      toast.error("Choose a Trip first.", { duration: 4000 });
      return;
    }
    const targetTrip = dispatches.find(d => d.id === activeDispatchIdForLoading);
    if (!targetTrip) return;
    if (pieceIds.length === 0) {
      toast.warning('No pieces selected to load.');
      return;
    }

    const actor = useAuthStore.getState().profile?.email
                ?? useAuthStore.getState().user?.email
                ?? 'system';

    try {
      const { data, error } = await supabase.rpc('load_pieces_to_dispatch_atomic', {
        p_dispatch_id: activeDispatchIdForLoading,
        p_piece_ids:   pieceIds,
        p_changed_by:  actor,
      });
      if (error) {
        const msg = error.message || '';
        if (msg.includes('piece_already_dispatched')) {
          toast.error(`Batch rejected — at least one piece is already in another dispatch: ${msg}`, { duration: 10000 });
        } else if (msg.includes('piece_not_dispatchable')) {
          toast.error(`Batch rejected — piece status not eligible for dispatch: ${msg}`, { duration: 10000 });
        } else if (msg.includes('piece_not_found')) {
          toast.error(`Batch rejected — piece not found: ${msg}. Refresh and retry.`, { duration: 10000 });
        } else if (msg.includes('dispatch_not_found')) {
          toast.error(`Trip ${activeDispatchIdForLoading} not found in cloud.`, { duration: 8000 });
        } else {
          toast.error(`Atomic batch dispatch failed: ${msg}`, { duration: 10000 });
        }
        return; // RPC rolled back — no local mutation either
      }

      // RPC committed. Mirror to local state + localStorage.
      const allPcs = ProductionService.getProductionPieces();
      const updatedPcs = allPcs.map(p => {
        if (pieceIds.includes(p.id) && p.dispatchId !== activeDispatchIdForLoading) {
          return {
            ...p,
            dispatchId: activeDispatchIdForLoading,
            status: 'Dispatched' as PieceStatus,
            lastUpdated: new Date().toISOString(),
          };
        }
        return p;
      });
      ProductionService.saveProductionPiecesBg(updatedPcs);
      setPieces(updatedPcs.filter(p => (p as any).company === company));

      const newPieceIds = [...new Set([...targetTrip.pieceIds, ...pieceIds])];
      const updDisp = dispatches.map(d => d.id === activeDispatchIdForLoading ? { ...d, pieceIds: newPieceIds } : d);
      ProductionService.saveTemperingDispatches(updDisp);
      setDispatches(updDisp);

      const result: any = data || {};
      const added = result.added ?? pieceIds.length;
      const skipped = result.skipped ?? 0;
      toast.success(
        `${added} pieces loaded to ${targetTrip.plantName}${skipped > 0 ? ` (${skipped} already there)` : ''}`,
        { duration: 4000 }
      );
    } catch (e: any) {
      toast.error(`Network error during batch dispatch: ${e?.message || 'unknown'}`, { duration: 8000 });
    }
  };

  const handleInwardPiece = (pieceId: string) => {
    if (!activeInwardDispatchId) return toast.error("Audit Error: Select an Inward Dispatch Trip first.", { duration: 4000 });
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) return;

    const order = jobOrders.find(j => j.orderNo === piece.orderId);
    const item = order?.items[piece.itemIndex];
    const services = item?.selectedServices || [];
    const glassType = item?.glassType || '';

    const needsLam = services.includes('Lamination') || services.includes('Laminated') || glassType === 'Laminated';
    const needsDG = services.includes('Double Glaze') || services.includes('Double Glazed') || services.includes('D/G');

    let newStatus: PieceStatus = 'Ready to Dispatch'; 
    let newSpot = 'FG-ZONE';

    if (needsLam || needsDG) {
        newStatus = 'Tempered'; 
        newSpot = 'WIP-ZONE';
    }

    handleUpdatePieceStatus(pieceId, newStatus, { dispatchId: undefined, spotId: newSpot });
    
    const inwardDispatch = dispatches.find(d => d.id === activeInwardDispatchId);
    if (inwardDispatch) {
        const currentReceived = inwardDispatch.receivedPieceIds || [];
        if (!currentReceived.includes(pieceId)) {
            const allReceived = [...currentReceived, pieceId];
            const allPieceIds = inwardDispatch.pieceIds || [];
            const isComplete  = allPieceIds.every(id => allReceived.includes(id));
            // Stamp the batch's ACTUAL return date once every piece is back — this
            // is what drops it out of the Out-at-Service pool (Phase 1). Keep the
            // first stamped value across any later partial re-receive.
            const returnStamp = new Date().toISOString().split('T')[0];
            const updatedDispatches = dispatches.map(d => d.id === activeInwardDispatchId
              ? { ...d, receivedPieceIds: allReceived, ...(isComplete && !d.actualReturnDate ? { actualReturnDate: returnStamp } : {}) }
              : d);
            ProductionService.saveTemperingDispatches(updatedDispatches);
            setDispatches(updatedDispatches);

            // ── Tempering GL on LAST piece received ─────────────────
            // Rate is computed per-piece per-mm from vendor's price list.
            // If dispatch has per-mm custom rates (rateOverrides), pass them in.
            // Old flat chargesPerSqFt is no longer used — rates differ by mm.
            if (isComplete) {
              const payDate = new Date().toISOString().split('T')[0];
              const apAmount = postTemperingInwardGL({
                company:       company as any,
                dispatchId:    activeInwardDispatchId,
                vendorName:    inwardDispatch.plantName || 'Tempering Vendor',
                date:          payDate,
                pieceIds:      allPieceIds,
                // Use rates snapshotted at dispatch creation (dispatch.ratesByMm).
                // Falls back to {} — getVendorRatesByMm() in GL service will then
                // read the vendor's current live rates as fallback.
                rateOverrides: inwardDispatch.ratesByMm ?? {},
              });

              // ── Step 3: pay-on-collection settlement ────────────────────
              // Owner-confirmed CASH-ON-COLLECTION (not an advance, not credit):
              // immediately settle the tempering AP just posted —
              //   Dr AP-Tempering 22113 / Cr Cash 11111 (or Bank 1112).
              // Idempotency: apAmount>0 only on the FIRST post (postTemperingInwardGL
              // is idempotent on GL-TEMP-{id}); plus a deterministic ledger check on
              // referenceId===dispatchId (belt-and-suspenders vs a double settlement).
              if (apAmount > 0) {
                const dispId = activeInwardDispatchId;
                const alreadySettled = FinanceService.getLedger().some(
                  (t: any) => t.docType === 'PV' && t.referenceId === dispId,
                );
                if (!alreadySettled) {
                  try {
                    const actor = useAuthStore.getState().profile?.email
                      ?? useAuthStore.getState().user?.email ?? 'system';
                    const pv = FinanceService.postVendorPaymentGL({
                      company:       company as any,
                      vendorName:    inwardDispatch.plantName || 'Tempering Vendor',
                      amount:        apAmount,
                      paymentDate:   payDate,
                      paidBy:        temperingPayMethod,
                      apAccountCode: '22113',          // P1 — MUST match the inward AP, else settles the wrong payable
                      invoiceRef:    dispId,
                      createdBy:     actor,
                    });
                    TemperingCommitmentService.settle(dispId, pv.id);
                    toast.success(
                      `Tempering paid (${temperingPayMethod}) — ${inwardDispatch.plantName}: PKR ${apAmount.toLocaleString('en-PK')}`,
                      { duration: 5000 },
                    );
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    toast.error(
                      `AP posted but payment settlement failed (${msg}). Vendor payment manually settle karein.`,
                      { duration: 9000 },
                    );
                  }
                }
              }
            }
        }
    }
  };

  const togglePieceForDelivery = (pieceId: string) => {
    const next = new Set(selectedPiecesForDelivery);
    if (next.has(pieceId)) next.delete(pieceId); else next.add(pieceId);
    setSelectedPiecesForDelivery(next);
  };

  const executeDirectDelivery = async () => {
    if (!directDeliveryForm.vehicleNo || !directDeliveryForm.siteName) return toast.error("Validation: Vehicle and Site Name required.", { duration: 4000 });
    if (selectedPiecesForDelivery.size === 0) return toast.error("No pieces selected.", { duration: 4000 });

    const newChallan: TemperingDispatch = {
      id: company === 'Glassco'
        ? (() => {
            const _now = new Date();
            const _mmyy = `${(_now.getMonth() + 1).toString().padStart(2, '0')}${_now.getFullYear().toString().slice(-2)}`;
            const _dcKey = `gtk_last_seq_Glassco_DC`;
            let _lastSeq = parseInt(localStorage.getItem(_dcKey) || '9000', 10);
            if (_lastSeq < 9000) _lastSeq = 9000;
            dispatches.forEach(d => {
              if (d.id && typeof d.id === 'string' && d.id.includes('-GLS-')) {
                const parts = d.id.split('-');
                const seq = parseInt(parts[parts.length - 1], 10);
                if (!isNaN(seq) && seq >= 9000 && seq > _lastSeq) _lastSeq = seq;
              }
            });
            const _nextSeq = _lastSeq + 1;
            try { localStorage.setItem(_dcKey, _nextSeq.toString()); } catch {}
            return `GT-DC-GLS-${_mmyy}-${_nextSeq.toString().padStart(4, '0')}`;
          })()
        : `CHL-SITE-${Date.now().toString().slice(-5)}`,
      company,
      date: new Date().toISOString().split('T')[0],
      plantName: directDeliveryForm.siteName.toUpperCase(),
      vehicleNo: directDeliveryForm.vehicleNo.toUpperCase(),
      driverName: directDeliveryForm.driverName.toUpperCase(),
      serviceType: 'Site Delivery',
      pieceIds: Array.from(selectedPiecesForDelivery),
      totalSqFt: 0,
      status: 'Dispatched',
      chargesPerSqFt: 0,
      totalCharges: 0
    };

    const deliveredPieceIds = Array.from(selectedPiecesForDelivery);

    // ── Post COGS FIRST (Dr COGS / Cr Glass Inventory at MAP) ──────────
    // Money-path fix: previously the GL post sat inside an un-awaited .then()
    // AFTER pieces were marked Delivered + saved, and a GL failure (imbalance /
    // closed period / missing account) was swallowed — leaving pieces Delivered
    // with NO COGS journal (COGS understated, inventory overstated) while the
    // user saw a success toast. Now COGS posts up front; if it throws, nothing
    // is committed and the user is told.
    try {
      postDeliveryCOGS({
        company: company as any,
        invoiceId: newChallan.id,
        orderId: directDeliveryForm.siteName,
        pieceIds: deliveredPieceIds,
        date: new Date().toISOString().split('T')[0],
        clientName: directDeliveryForm.siteName,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Delivery blocked — COGS GL post failed (${msg}). Nothing was committed; fix and retry.`, { duration: 8000 });
      return;
    }

    // ── GL committed — persist the challan + mark pieces Delivered ──
    ProductionService.saveTemperingDispatches([...dispatches, newChallan]);
    const _allPieces = await ProductionService.getProductionPiecesAsync();
    const updatedPieces = _allPieces.map(p => selectedPiecesForDelivery.has(p.id) ? { ...p, status: 'Delivered' as PieceStatus, dispatchId: newChallan.id } : p);
    ProductionService.saveProductionPiecesBg(updatedPieces);
    refreshData();

    setIsDirectDeliveryModalOpen(false);
    setSelectedPiecesForDelivery(new Set());
    setDirectDeliveryForm({ vehicleNo: '', driverName: '', siteName: '' });
    toast.success(`Direct Delivery Challan ${newChallan.id} created — pieces Delivered, COGS posted.`, { duration: 4000 });
  };

  const handleRecordFault = () => {
    if (!selectedPieceForFault) return;
    const fault: PieceFault = { id: `FLT-${Date.now()}`, description: faultForm.description, reportedAt: new Date().toISOString(), disposal: faultForm.disposal };

    if (faultForm.disposal === 'Recut') {
      ProductionService.getProductionPiecesAsync().then(all => {
          const nextId = `${selectedPieceForFault.orderId}/R${all.filter(p => p.orderId === selectedPieceForFault.orderId).length + 1}`;
          const replacement: ProductionPiece = { ...selectedPieceForFault, id: nextId, status: 'Cut', lastUpdated: new Date().toISOString(), fault: undefined, dispatchId: undefined, receivedAtGateId: undefined };
          const updatedList = all.map(p => p.id === selectedPieceForFault.id ? { ...p, status: 'Returned' as PieceStatus, fault } : p);
          ProductionService.saveProductionPiecesBg([...updatedList, replacement]);
          refreshData();
      });
    } else {
      handleUpdatePieceStatus(selectedPieceForFault.id, 'Delivered', { fault });
    }
    setSelectedPieceForFault(null);
    setFaultForm({ description: '', disposal: 'Recut' });
    toast.success("Quality Fault Decision Recorded.", { duration: 3000 });
  };

  const inwardAuditablePieces = useMemo(() => {
    if (!activeInwardDispatchId) return [];
    const inwardTrip = dispatches.find(d => d.id === activeInwardDispatchId);
    if (!inwardTrip || !inwardTrip.pickLocation) return [];
    return pieces.filter(p => {
      if (p.status !== 'Dispatched') return false;
      const outgoingTrip = dispatches.find(d => d.id === p.dispatchId);
      if (outgoingTrip && outgoingTrip.plantName?.includes(inwardTrip.pickLocation!)) return true;
      return false;
    });
  }, [pieces, activeInwardDispatchId, dispatches]);

  const analyticsData = useMemo(() => {
    const total = pieces.length || 1;
    const cut = pieces.filter(p => p.status === 'Cut' || p.status === 'QC-Pending' || p.status === 'Service-Pending').length;
    const qcPassed = pieces.filter(p => p.status === 'QC-Passed' || p.status === 'Ready to Dispatch').length;
    const tempered = pieces.filter(p => p.status === 'Tempered').length;
    const delivered = pieces.filter(p => p.status === 'Delivered').length;
    const defects = pieces.filter(p => p.status === 'Returned' || p.status === 'QC-Failed' || p.status === 'Broken').length;
    const typeMap: Record<string, number> = {};
    pieces.forEach(p => { const type = p.specs?.split('(')[0].split('|')[1]?.trim() || 'Unknown'; typeMap[type] = (typeMap[type] || 0) + 1; });
    const sortedTypes = Object.entries(typeMap).sort((a,b) => b[1] - a[1]).slice(0, 5);
    return { total, cut, qcPassed, tempered, delivered, defects, sortedTypes };
  }, [pieces]);

  const getJobDetails = (jobId: string, statusFilter: (p: ProductionPiece) => boolean) => {
     const job = jobOrders.find(j => j.orderNo === jobId);
     const client = clients.find(c => c.id === job?.clientId);
     const jobPieces = pieces.filter(p => p.orderId === jobId);
     const pendingPieces = jobPieces.filter(statusFilter);
     const totalSqFt = pendingPieces.reduce((acc, p) => {
        const item = job?.items[p.itemIndex];
        const area = item ? ((item.width * item.height) / 144) : 0;
        return acc + area;
     }, 0);
     const completed = jobPieces.filter(p => p.status === 'Delivered').length; 
     const progress = Math.round((completed / (jobPieces.length || 1)) * 100);
     return { clientName: client?.name || 'Unknown', projectName: job?.projectName || 'Standard Order', pendingQty: pendingPieces.length, pendingSqFt: totalSqFt.toFixed(2), totalProgress: progress };
  };

  if (isLoading) return <div className="h-full flex items-center justify-center"><Loader2 size={48} className="animate-spin text-blue-600"/></div>;

  return (
    <ProductionContext.Provider value={{
      company, pieces, jobOrders, clients, dispatches, gatePasses, spots, refreshData, isLoading,
      selectedJobId, setSelectedJobId, selectedClientFilter, setSelectedClientFilter, filterDate, setFilterDate,
      activeDispatchIdForLoading, setActiveDispatchIdForLoading, activeInwardDispatchId, setActiveInwardDispatchId,
      temperingPayMethod, setTemperingPayMethod,
      handleUpdatePieceStatus, handleCuttingOutput, handleInwardPiece, togglePieceToDispatch, loadAllPiecesToDispatch, togglePieceForDelivery, executeDirectDelivery, handleRecordFault,
      isBinModalOpen, setIsBinModalOpen, openBinModal, selectedPieceForBin, assignSpot, selectedSpotId, setSelectedSpotId,
      isDirectDeliveryModalOpen, setIsDirectDeliveryModalOpen, directDeliveryForm, setDirectDeliveryForm, selectedPiecesForDelivery,
      selectedPieceForFault, setSelectedPieceForFault, faultForm, setFaultForm,
      inwardAuditablePieces, analyticsData, getJobDetails
    }}>
      {children}
    </ProductionContext.Provider>
  );
};

export const useProductionContext = () => {
  const context = useContext(ProductionContext);
  if (!context) throw new Error("useProductionContext must be used within a ProductionProvider");
  return context;
};
