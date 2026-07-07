/**
 * InwardReceivePage — routed home for the receive-back + direct-delivery
 * transitions (A3, money-path). Revives the orphaned InwardAuditView by
 * mounting ProductionProvider, feeding it the ~11 context props, and rendering
 * the two modals it only sets open-flags for (Direct Delivery + Putaway/Bin).
 *
 * GL is REUSED unchanged from ProductionContext:
 *   - Receive a piece → handleInwardPiece → on the LAST piece of a tempering
 *     trip, posts tempering AP (Dr WIP 11513 / Cr AP-Tempering 22113).
 *   - Direct Site Delivery → executeDirectDelivery → posts COGS first
 *     (Dr COGS / Cr Glass Inventory at MAP) then the delivery challan.
 *
 * ⚠️ Money-path (COGS + tempering AP). Dark route (not in nav) until
 * preview-tested with a login. Do NOT promote to main blind.
 */
import React from 'react';
import { Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { X, Send, MapPin } from 'lucide-react';
import { ProductionProvider, useProductionContext } from '@/modules/production/components/ProductionContext';
import { useAuthStore } from '@/modules/auth/authStore';
import InwardAuditView from '@/modules/production/components/InwardAuditView';

const ALLOWED = new Set<string>([
  'dispatch_staff', 'glassco_supervisor', 'super_admin', 'hassan',
  'factory_manager', 'glassco_admin',
]);

const InwardReceiveContent: React.FC = () => {
  const {
    jobOrders, pieces, dispatches, clients,
    activeInwardDispatchId, setActiveInwardDispatchId,
    inwardAuditablePieces,
    selectedPiecesForDelivery, togglePieceForDelivery,
    setIsDirectDeliveryModalOpen, handleInwardPiece, openBinModal,
    // Step 3 — pay-on-collection method
    temperingPayMethod, setTemperingPayMethod,
    // Direct-delivery modal state
    isDirectDeliveryModalOpen, directDeliveryForm, setDirectDeliveryForm, executeDirectDelivery,
    // Putaway/bin modal state
    isBinModalOpen, setIsBinModalOpen, selectedPieceForBin, selectedSpotId, setSelectedSpotId, assignSpot,
  } = useProductionContext();

  const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none';

  return (
    <div className="space-y-4">
      <Toaster position="top-center" />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-black tracking-tight text-slate-800">Receive from Tempering / Inward</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Return trip select karein → pieces receive karein. Aakhri piece pe tempering AP post + foran payment settle hoti hai. Site pe seedha delivery bhi yahin se (COGS post).
          </p>
        </div>

        {/* Step 3 — pay-on-collection method for the tempering settlement */}
        <div className="shrink-0">
          <span className="mb-1 block text-2xs font-bold uppercase text-slate-500">Payment Method</span>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
            {(['Cash', 'Bank'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setTemperingPayMethod(m)}
                className={`rounded-md px-4 py-1.5 text-xs font-bold transition-colors ${
                  temperingPayMethod === m ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </header>

      <InwardAuditView
        jobOrders={jobOrders}
        pieces={pieces}
        dispatches={dispatches}
        clients={clients}
        activeInwardDispatchId={activeInwardDispatchId}
        setActiveInwardDispatchId={setActiveInwardDispatchId}
        inwardAuditablePieces={inwardAuditablePieces}
        selectedPiecesForDelivery={selectedPiecesForDelivery}
        togglePieceForDelivery={togglePieceForDelivery}
        setIsDirectDeliveryModalOpen={setIsDirectDeliveryModalOpen}
        handleInwardPiece={handleInwardPiece}
        openBinModal={openBinModal}
      />

      {/* Direct Site Delivery modal — executeDirectDelivery posts COGS. */}
      {isDirectDeliveryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-base font-black text-slate-800">Direct Site Delivery</h3>
              <button type="button" onClick={() => setIsDirectDeliveryModalOpen(false)} className="rounded-full p-1 hover:bg-slate-100"><X size={16} /></button>
            </div>
            <p className="mb-4 text-xs text-slate-500">
              {selectedPiecesForDelivery.size} pcs selected — delivery par COGS (Dr COGS / Cr Inventory) post hoga.
            </p>
            <div className="space-y-3">
              <input
                placeholder="Site / Client name"
                value={directDeliveryForm.siteName}
                onChange={e => setDirectDeliveryForm({ ...directDeliveryForm, siteName: e.target.value })}
                className={inputCls}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="Vehicle No"
                  value={directDeliveryForm.vehicleNo}
                  onChange={e => setDirectDeliveryForm({ ...directDeliveryForm, vehicleNo: e.target.value.toUpperCase() })}
                  className={`${inputCls} uppercase`}
                />
                <input
                  placeholder="Driver"
                  value={directDeliveryForm.driverName}
                  onChange={e => setDirectDeliveryForm({ ...directDeliveryForm, driverName: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setIsDirectDeliveryModalOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button
                type="button"
                onClick={() => { void executeDirectDelivery(); }}
                disabled={selectedPiecesForDelivery.size === 0}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                <Send size={13} /> Confirm Delivery
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Putaway / bin modal — assigns a warehouse spot to a received piece. */}
      {isBinModalOpen && selectedPieceForBin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-base font-black text-slate-800">Putaway — {selectedPieceForBin.id}</h3>
              <button type="button" onClick={() => setIsBinModalOpen(false)} className="rounded-full p-1 hover:bg-slate-100"><X size={16} /></button>
            </div>
            <p className="mb-4 text-xs text-slate-500">Warehouse spot assign karein (khali chhodne par default zone rehta hai).</p>
            <div className="relative">
              <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                placeholder="Spot / Bin (e.g. FG-ZONE, RACK-A1)"
                value={selectedSpotId}
                onChange={e => setSelectedSpotId(e.target.value.toUpperCase())}
                className={`${inputCls} pl-9 uppercase`}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setIsBinModalOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={assignSpot} className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800">Save spot</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const InwardReceivePage: React.FC = () => {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/" replace />;
  if (!ALLOWED.has(user.role)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-sm rounded-xl border border-slate-200 bg-white p-8 text-center shadow">
          <h2 className="mb-2 text-lg font-black text-slate-800">Restricted</h2>
          <p className="text-sm text-slate-500">Inward / Receive sirf dispatch + supervisor roles ke liye hai.</p>
        </div>
      </div>
    );
  }
  return (
    <ProductionProvider company="Glassco">
      <InwardReceiveContent />
    </ProductionProvider>
  );
};

export default InwardReceivePage;
