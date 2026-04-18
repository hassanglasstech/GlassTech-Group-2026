import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Company, Quotation, Client, ProductionPiece, PieceStatus, TemperingDispatch, GatePass, WarehouseSpot, PieceFault } from '@/modules/shared/types';
import { ProductionService } from '@/modules/production/services/productionService';
import { SalesService } from '@/modules/sales/services/salesService';
import { postTemperingInwardGL, postDeliveryCOGS } from '@/modules/procurement/services/glasscoGLService';
import { Loader2 } from 'lucide-react';

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

  handleUpdatePieceStatus: (id: string, status: PieceStatus, extra?: Partial<ProductionPiece>) => void;
  handleCuttingOutput: (piece: ProductionPiece) => void;
  handleInwardPiece: (pieceId: string) => void;
  togglePieceToDispatch: (pieceId: string) => void;
  loadAllPiecesToDispatch: (pieceIds: string[]) => void;
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
    // Show all active job orders — Approved, Invoiced, Partial Payment
    const ACTIVE_STATUSES = ['Approved', 'Invoiced', 'Partial Payment', 'approved', 'invoiced'];
    const allQuotes = SalesService.getQuotations();
    const companyJobs = allQuotes.filter(q => {
      const qCompany = q.company || (q as any).data?.company;
      const qStatus = q.status || (q as any).data?.status;
      return (qCompany === company) && ACTIVE_STATUSES.includes(qStatus);
    });
    setJobOrders(companyJobs);
    setClients(SalesService.getClients().filter(c => c.company === company));
    setDispatches(ProductionService.getTemperingDispatches().filter(d => d.company === company || d.company === 'Factory'));
    setGatePasses(ProductionService.getGatePasses().filter(g => g.company === company));
    setSpots(ProductionService.getWarehouseSpots().filter(s => s.company === company));
    setIsLoading(false);
  };

  const handleUpdatePieceStatus = (id: string, status: PieceStatus, extra: Partial<ProductionPiece> = {}) => {
    setPieces(prev => {
        const updated = prev.map(p => p.id === id ? { ...p, ...extra, status, lastUpdated: new Date().toISOString() } : p);
        ProductionService.getProductionPiecesAsync().then(all => {
            const newAll = all.map(p => p.id === id ? { ...p, ...extra, status, lastUpdated: new Date().toISOString() } : p);
            ProductionService.saveProductionPieces(newAll);
        });
        return updated;
    });
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

  // Batch load multiple pieces to active dispatch at once
  const loadAllPiecesToDispatch = (pieceIds: string[]) => {
    if (!activeDispatchIdForLoading) return toast.error("Choose a Trip first.", { duration: 4000 });
    const targetTrip = dispatches.find(d => d.id === activeDispatchIdForLoading);
    if (!targetTrip) return;

    const allPcs = ProductionService.getProductionPieces();
    const updatedPcs = allPcs.map(p => {
      if (pieceIds.includes(p.id) && p.dispatchId !== activeDispatchIdForLoading) {
        return { ...p, dispatchId: activeDispatchIdForLoading, lastUpdated: new Date().toISOString() };
      }
      return p;
    });
    ProductionService.saveProductionPieces(updatedPcs);
    setPieces(updatedPcs.filter(p => p.company === company));

    const newPieceIds = [...new Set([...targetTrip.pieceIds, ...pieceIds])];
    const updDisp = dispatches.map(d => d.id === activeDispatchIdForLoading ? { ...d, pieceIds: newPieceIds } : d);
    ProductionService.saveTemperingDispatches(updDisp);
    setDispatches(updDisp);
    toast.success(`${pieceIds.length} pieces loaded to ${targetTrip.plantName}`);
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
            const updatedDispatches = dispatches.map(d => d.id === activeInwardDispatchId ? { ...d, receivedPieceIds: [...currentReceived, pieceId] } : d);
            ProductionService.saveTemperingDispatches(updatedDispatches);
            setDispatches(updatedDispatches);

            // ── Tempering GL on LAST piece received ─────────────────
            // Rate is computed per-piece per-mm from vendor's price list.
            // If dispatch has per-mm custom rates (rateOverrides), pass them in.
            // Old flat chargesPerSqFt is no longer used — rates differ by mm.
            const allReceived = [...currentReceived, pieceId];
            const allPieceIds = inwardDispatch.pieceIds || [];
            const isComplete  = allPieceIds.every(id => allReceived.includes(id));
            if (isComplete) {
              postTemperingInwardGL({
                company:       company as any,
                dispatchId:    activeInwardDispatchId,
                vendorName:    inwardDispatch.plantName || 'Tempering Vendor',
                date:          new Date().toISOString().split('T')[0],
                pieceIds:      allPieceIds,
                // Use rates snapshotted at dispatch creation (dispatch.ratesByMm).
                // Falls back to {} — getVendorRatesByMm() in GL service will then
                // read the vendor's current live rates as fallback.
                rateOverrides: inwardDispatch.ratesByMm ?? {},
              });
            }
        }
    }
  };

  const togglePieceForDelivery = (pieceId: string) => {
    const next = new Set(selectedPiecesForDelivery);
    if (next.has(pieceId)) next.delete(pieceId); else next.add(pieceId);
    setSelectedPiecesForDelivery(next);
  };

  const executeDirectDelivery = () => {
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

    ProductionService.saveTemperingDispatches([...dispatches, newChallan]);
    
    const deliveredPieceIds = Array.from(selectedPiecesForDelivery);
    ProductionService.getProductionPiecesAsync().then(allPieces => {
        const updatedPieces = allPieces.map(p => selectedPiecesForDelivery.has(p.id) ? { ...p, status: 'Delivered' as PieceStatus, dispatchId: newChallan.id } : p);
        ProductionService.saveProductionPieces(updatedPieces);

        // ── Post COGS: Dr COGS / Cr Glass Inventory at MAP ──────────
        postDeliveryCOGS({
          company: company as any,
          invoiceId: newChallan.id,
          orderId: directDeliveryForm.siteName,
          pieceIds: deliveredPieceIds,
          date: new Date().toISOString().split('T')[0],
          clientName: directDeliveryForm.siteName,
        });

        refreshData();
    });

    setIsDirectDeliveryModalOpen(false);
    setSelectedPiecesForDelivery(new Set());
    setDirectDeliveryForm({ vehicleNo: '', driverName: '', siteName: '' });
    toast.error(`Direct Delivery Challan ${newChallan.id} Created. Pieces marked Delivered.`, { duration: 4000 });
  };

  const handleRecordFault = () => {
    if (!selectedPieceForFault) return;
    const fault: PieceFault = { id: `FLT-${Date.now()}`, description: faultForm.description, reportedAt: new Date().toISOString(), disposal: faultForm.disposal };

    if (faultForm.disposal === 'Recut') {
      ProductionService.getProductionPiecesAsync().then(all => {
          const nextId = `${selectedPieceForFault.orderId}/R${all.filter(p => p.orderId === selectedPieceForFault.orderId).length + 1}`;
          const replacement: ProductionPiece = { ...selectedPieceForFault, id: nextId, status: 'Cut', lastUpdated: new Date().toISOString(), fault: undefined, dispatchId: undefined, receivedAtGateId: undefined };
          const updatedList = all.map(p => p.id === selectedPieceForFault.id ? { ...p, status: 'Returned' as PieceStatus, fault } : p);
          ProductionService.saveProductionPieces([...updatedList, replacement]);
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
