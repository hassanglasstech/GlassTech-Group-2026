import React, { useState } from 'react';
import { useProductionContext } from '@/modules/production/components/ProductionContext';
import AnalyticsView from '@/modules/production/components/AnalyticsView';
import QCCheckPanel from '@/modules/glassco/core/QCCheckPanel';                     // Phase-4 (4.2)
import QCDefectPicker, { QCDefectSelection } from '@/modules/glassco/core/QCDefectPicker';   // Sprint 7
import { QC_DEFECT_CODE_MAP } from '@/modules/production/constants/qcCodes';                  // Sprint 7
import { exportTemperingDispatches, exportProductionPieces } from '@/modules/production/services/productionExporter';  // Phase-6 (6.7)
import { ShieldAlert, PackageCheck, Ban, BarChart3, ChevronLeft, User, LayoutGrid, X, AlertTriangle, ShieldCheck, FileSpreadsheet } from 'lucide-react';
import { NCRService } from '@/modules/production/services/ncrService';
import { ProductionService } from '@/modules/production/services/productionService';
import { toast } from 'sonner';

// ── QC Fail Modal — Sprint 7: now uses canonical QC_DEFECT_CODES + searchable picker
const QCFailModal: React.FC<{
  piece: any;
  company: string;
  onConfirm: (faultCode: string, faultDesc: string, notes: string, createNCR: boolean) => void;
  onCancel: () => void;
}> = ({ piece, onConfirm, onCancel }) => {
  // Sprint 7 — single state object for the picker; default to "Crack"
  // (most-common breakage code) so a fail can be confirmed in one tap.
  const [defect, setDefect] = useState<QCDefectSelection>({ code: 'QC-05' });
  const [createNCR, setCreateNCR] = useState(false);

  const handleConfirm = () => {
    if (!defect.code) { toast.error('Pick a defect code.'); return; }
    const meta = QC_DEFECT_CODE_MAP[defect.code];
    // Sprint 7 — "Other" requires a comment per canonical metadata.
    if (meta?.requiresComment && !(defect.comment || '').trim()) {
      toast.error('Comment required for this defect code.');
      return;
    }
    if (meta?.needsMeasurement && !(defect.measurement || '').trim()) {
      toast.error('Measurement required for this defect code.');
      return;
    }
    const combinedNotes = [defect.comment, defect.measurement && `Measured: ${defect.measurement}`]
      .filter(Boolean).join(' · ');
    onConfirm(defect.code, meta?.label || '', combinedNotes, createNCR);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[600] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-rose-600 text-white p-5 rounded-t-2xl flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-black uppercase truncate">QC Fail — {piece.id}</h3>
            <p className="text-xs text-rose-200 mt-0.5 truncate">{piece.specs}</p>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-white/10 rounded-full shrink-0"><X size={18}/></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Sprint 7 — searchable picker replaces the 2-column grid */}
          <QCDefectPicker value={defect} onChange={setDefect} alwaysShowComment />
          {/* Glass-breakage NCR shortcut — only relevant for QC-05 (Crack) */}
          {defect.code === 'QC-05' && (
            <label className="flex items-center gap-2 bg-amber-50 rounded-xl p-3 border border-amber-100 cursor-pointer">
              <input type="checkbox" checked={createNCR} onChange={e => setCreateNCR(e.target.checked)} className="rounded"/>
              <div>
                <span className="text-xs font-black text-amber-800">Create NCR + Reproduction Order</span>
                <p className="text-[9px] text-amber-600 mt-0.5">Glass cracked — raise NCR and queue for re-cutting</p>
              </div>
            </label>
          )}
        </div>
        <div className="p-5 border-t border-slate-100 flex justify-end gap-3 shrink-0">
          <button onClick={onCancel} className="sap-btn-ghost">Cancel</button>
          <button onClick={handleConfirm} className="flex items-center gap-2 bg-rose-600 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase hover:bg-rose-700">
            <AlertTriangle size={14}/> Confirm Fail
          </button>
        </div>
      </div>
    </div>
  );
};

const DispatchView: React.FC = () => {
  const {
    pieces, jobOrders, spots, company, clients, dispatches,
    selectedJobId, setSelectedJobId, getJobDetails,
    handleUpdatePieceStatus, setSelectedPieceForFault, analyticsData,
    openBinModal
  } = useProductionContext();

  // Phase-6 (6.7) — Excel export handlers
  const handleExportFinishedGoods = () => {
    try {
      const fg = pieces.filter(p => p.status === 'Ready to Dispatch' || p.status === 'Delivered');
      if (fg.length === 0) { toast.error('No finished-goods pieces to export.'); return; }
      exportProductionPieces(fg, jobOrders, clients, 'finished-goods');
      toast.success(`Exported ${fg.length} pieces.`);
    } catch (e: any) { toast.error(e?.message || 'Export failed.'); }
  };
  const handleExportDispatches = () => {
    try {
      const list = (dispatches || []).filter((d: any) => d.company === company || d.company === 'Factory');
      if (list.length === 0) { toast.error('No dispatches to export.'); return; }
      exportTemperingDispatches(list, pieces);
      toast.success(`Exported ${list.length} dispatches.`);
    } catch (e: any) { toast.error(e?.message || 'Export failed.'); }
  };

  const [activeSubTab, setActiveSubTab] = React.useState<'qc' | 'blind_qc' | 'finished_goods' | 'faults' | 'analytics'>('qc');

  // ── BA-03: Delivery Acknowledgment ─────────────────────────────────────
  const [ackingDispatchId, setAckingDispatchId] = React.useState<string | null>(null);
  const [ackSignatory,     setAckSignatory]     = React.useState('');
  const [ackNotes,         setAckNotes]         = React.useState('');

  const handleDeliveryAck = (dispatchId: string) => {
    if (!ackSignatory.trim()) { toast.error('Enter client signatory name.'); return; }
    const all = ProductionService.getTemperingDispatches();
    const updated = all.map((d: any) =>
      d.id === dispatchId
        ? {
            ...d,
            deliveryAcknowledgedAt: new Date().toISOString(),
            deliveryAcknowledgedBy: 'Staff',
            deliverySignatory:      ackSignatory,
            deliveryAckNotes:       ackNotes,
          }
        : d
    );
    ProductionService.saveTemperingDispatches(updated);
    toast.success(`Delivery acknowledged by ${ackSignatory}.`);
    setAckingDispatchId(null);
    setAckSignatory(''); setAckNotes('');
  };

  useState<'qc' | 'finished_goods' | 'faults' | 'analytics'>('qc');
  const [failingPiece, setFailingPiece] = useState<any>(null);

  const handleQCFail = (piece: any) => setFailingPiece(piece);

  const confirmQCFail = (faultCode: string, faultDesc: string, notes: string, createNCR: boolean) => {
    if (!failingPiece) return;
    // Update piece status with fault info
    handleUpdatePieceStatus(failingPiece.id, 'QC-Failed', {
      fault: {
        id: `F-${Date.now()}`,
        description: `${faultCode} — ${faultDesc}${notes ? ': ' + notes : ''}`,
        reportedAt: new Date().toISOString(),
        disposal: 'None',
      }
    });
    // If broken glass — auto NCR
    if (createNCR && faultCode === 'QC-05') {
      const job = jobOrders.find(j => j.orderNo === failingPiece.orderId);
      NCRService.createNCR({
        company,
        pieceId: failingPiece.id,
        jobOrderId: failingPiece.orderId,
        itemIndex: failingPiece.itemIndex,
        stage: 'Cutting',
        cause: 'BR-06-Edge-Damage',
        description: `QC Fail: ${faultCode} — ${faultDesc}. ${notes}`,
        reportedBy: 'QC Supervisor',
        sqftLost: 0,
        glassType: failingPiece.specs,
        estimatedValue: 0,
        action: 'Reproduce',
      });
      toast.success(`NCR created — piece queued for reproduction.`);
    }
    setFailingPiece(null);
    toast.error(`Piece ${failingPiece.id} marked QC-Failed: ${faultCode}`);
  };

  const renderGrid = (filterFn: (p: any) => boolean, renderAction: (p: any) => React.ReactNode) => {
    if (selectedJobId) {
        const jobData = getJobDetails(selectedJobId, filterFn);
        const relevantPieces = (pieces || []).filter(p => p?.orderId === selectedJobId && filterFn(p));
        if (!jobData || relevantPieces.length === 0) { setSelectedJobId(null); return null; }
        
        return (
            <div className="space-y-4">
                <div className="bg-white p-4 rounded-2xl border shadow-sm flex items-center space-x-4">
                    <button onClick={() => setSelectedJobId(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><ChevronLeft size={20}/></button>
                    <div>
                        <h3 className="text-lg font-black text-slate-800 uppercase">{jobData.projectName || 'Standard Order'}</h3>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{jobData.clientName} | {selectedJobId}</p>
                    </div>
                    <div className="ml-auto flex items-center space-x-4 text-right">
                        <div><p className="text-[9px] font-black text-slate-400 uppercase">Qty</p><p className="text-lg font-black">{jobData.pendingQty}</p></div>
                        <div><p className="text-[9px] font-black text-slate-400 uppercase">Ft²</p><p className="text-lg font-black">{jobData.pendingSqFt}</p></div>
                    </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {relevantPieces.map(p => (
                        <div key={p.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-3">
                            <div className="flex justify-between items-start">
                                <span className="font-black text-blue-600 text-sm">{p.id}</span>
                                <button onClick={() => openBinModal(p)} className="text-[9px] font-bold text-slate-400 border border-slate-200 rounded px-1.5 py-0.5 hover:border-slate-400">BIN</button>
                            </div>
                            <p className="text-xs text-slate-500 leading-tight">{p.specs}</p>
                            {renderAction(p)}
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    
    // Group view — list unique order IDs that have matching pieces
    const uniqueOrderIds = Array.from(new Set((pieces || []).filter(p => p && filterFn(p)).map(p => p.orderId)));
    if (uniqueOrderIds.length === 0) return <div className="py-20 text-center text-slate-300 font-black uppercase text-xs italic">No pieces in this stage.</div>;
    
    // Sort latest first
    const sortedOrderIds = [...uniqueOrderIds].sort((a, b) => {
        const jobA = jobOrders.find(j => j?.orderNo === a);
        const jobB = jobOrders.find(j => j?.orderNo === b);
        return (jobB?.date ? new Date(jobB.date).getTime() : 0) - (jobA?.date ? new Date(jobA.date).getTime() : 0);
    });
    
    return (
        <div className="space-y-4">
            {sortedOrderIds.map(orderId => {
                const jobPieces = (pieces || []).filter(p => p?.orderId === orderId && filterFn(p));
                if (jobPieces.length === 0) return null;
                const jobData = getJobDetails(orderId, filterFn);
                
                return (
                    <div key={orderId} onClick={() => setSelectedJobId(orderId)} className="bg-white p-5 rounded-2xl border-2 border-slate-200 shadow-sm cursor-pointer hover:border-blue-400 hover:shadow-lg transition-all">
                        <div className="flex justify-between items-center">
                            <div>
                                <h4 className="font-black text-slate-800 uppercase text-sm">{jobData?.projectName || 'Standard Order'}</h4>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{jobData?.clientName || 'Unknown'} | {orderId}</p>
                            </div>
                            <div className="flex items-center space-x-4 text-right">
                                <div><p className="text-[9px] font-black text-slate-400 uppercase">Pieces</p><p className="text-lg font-black text-slate-800">{jobPieces.length}</p></div>
                                <span className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full text-[10px] font-black uppercase">{jobData?.totalProgress || 0}%</span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
  };

  return (
    <div className="space-y-6">
        <div className="flex justify-between items-center gap-3 no-print">
            <div className="flex space-x-1 bg-white p-1 rounded-2xl border shadow-sm w-fit overflow-x-auto">
                <button onClick={() => setActiveSubTab('qc')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeSubTab === 'qc' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><ShieldAlert size={16} className="inline mr-2"/> Quality Hub</button>
                {/* Phase-4 (4.2) — Blind QC: random 10% mandatory + cutter assessment hidden until submit */}
                <button onClick={() => setActiveSubTab('blind_qc')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeSubTab === 'blind_qc' ? 'bg-emerald-700 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><ShieldCheck size={16} className="inline mr-2"/> Blind QC</button>
                <button onClick={() => setActiveSubTab('finished_goods')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeSubTab === 'finished_goods' ? 'bg-emerald-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><PackageCheck size={16} className="inline mr-2"/> Finished Goods</button>
                <button onClick={() => setActiveSubTab('faults')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeSubTab === 'faults' ? 'bg-rose-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><Ban size={16} className="inline mr-2"/> Fault Ledger</button>
                <button onClick={() => setActiveSubTab('analytics')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeSubTab === 'analytics' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><BarChart3 size={16} className="inline mr-2"/> Analytics</button>
            </div>
            {/* Phase-6 (6.7) — Excel exports */}
            <div className="flex gap-2">
                {activeSubTab === 'finished_goods' && (
                    <button onClick={handleExportFinishedGoods} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-700 flex items-center gap-2 shadow-sm" title="Export Finished Goods to Excel">
                        <FileSpreadsheet size={14}/> Export FG
                    </button>
                )}
                <button onClick={handleExportDispatches} className="bg-slate-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-slate-900 flex items-center gap-2 shadow-sm" title="Export Tempering Dispatch Register">
                    <FileSpreadsheet size={14}/> Dispatch Register
                </button>
            </div>
        </div>

        {activeSubTab === 'qc' && (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
                {!selectedJobId && <div className="bg-emerald-600 text-white p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden"><div className="absolute top-0 right-0 p-8 opacity-10"><ShieldAlert size={120} /></div></div>}
                {renderGrid(
                    (p) => p.status === 'QC-Pending',
                    (p) => (
                        <div className="flex space-x-2">
                            <button onClick={() => handleUpdatePieceStatus(p.id, 'QC-Passed')} className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase hover:bg-emerald-700">Pass</button>
                            <button onClick={() => handleQCFail(p)} className="flex-1 py-2 bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase hover:bg-rose-700">Fail</button>
                        </div>
                    )
                )}
            </div>
        )}

        {/* Phase-4 (4.2) — Blind QC panel: random 10% mandatory + defective-sheet pieces */}
        {activeSubTab === 'blind_qc' && (
            <div className="animate-in fade-in slide-in-from-right duration-300">
                <QCCheckPanel
                    pieces={pieces}
                    jobOrders={jobOrders}
                    handleUpdatePieceStatus={(id, status, extra) =>
                        handleUpdatePieceStatus(id, status as any, extra)
                    }
                />
            </div>
        )}

        {activeSubTab === 'finished_goods' && (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
                {!selectedJobId && <div className="bg-emerald-800 text-white p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden"><div className="absolute top-0 right-0 p-8 opacity-10"><PackageCheck size={120} /></div></div>}
                {renderGrid(
                    (p) => p.status === 'Ready to Dispatch' && !p.dispatchId,
                    (p) => <div className="text-center text-[10px] font-bold text-emerald-600">Ready for Site</div>
                )}
            </div>
        )}

        {activeSubTab === 'faults' && (
            <div className="space-y-6 animate-in slide-in-from-bottom duration-300">
                <div className="bg-rose-900 text-white p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden"><div className="absolute top-0 right-0 p-8 opacity-10"><Ban size={120} /></div></div>
                <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
                    <table className="w-full text-left sap-table">
                        <thead><tr><th>Piece ID</th><th>Specs</th><th>Fault</th><th>Status</th><th>Action</th></tr></thead>
                        <tbody>
                            {(pieces || []).filter(p => p.status === 'QC-Failed' || p.fault).map(p => (
                                <tr key={p.id}>
                                    <td className="font-black text-rose-600">{p.id}</td>
                                    <td className="text-xs text-slate-500">{p.specs}</td>
                                    <td className="text-xs font-bold text-slate-700">{p.fault?.description || '—'}</td>
                                    <td><span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">{p.status}</span></td>
                                    <td><button onClick={() => setSelectedPieceForFault(p)} className="px-4 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-[10px] font-black uppercase hover:bg-rose-600 hover:text-white transition-all">Details</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {activeSubTab === 'analytics' && <AnalyticsView analyticsData={analyticsData} />}

        {failingPiece && (
          <QCFailModal
            piece={failingPiece}
            company={company}
            onConfirm={confirmQCFail}
            onCancel={() => setFailingPiece(null)}
          />
        )}

      {/* BA-03: Delivery Acknowledgment Modal */}
      {ackingDispatchId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[500] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="bg-emerald-700 text-white px-6 py-4 font-black uppercase text-sm tracking-widest">
              Confirm Delivery Acknowledgment
            </div>
            <div className="p-6 space-y-4 bg-slate-50">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Client Signatory Name *</label>
                <input
                  value={ackSignatory}
                  onChange={e => setAckSignatory(e.target.value)}
                  placeholder="Person who received the delivery"
                  className="sap-input w-full font-bold"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Notes (optional)</label>
                <input
                  value={ackNotes}
                  onChange={e => setAckNotes(e.target.value)}
                  placeholder="Any delivery remarks"
                  className="sap-input w-full"
                />
              </div>
              <p className="text-xs text-slate-400">
                Dispatch: <span className="font-mono font-black">{ackingDispatchId}</span>
              </p>
            </div>
            <div className="px-6 py-4 bg-white border-t flex gap-3">
              <button onClick={() => { setAckingDispatchId(null); setAckSignatory(''); setAckNotes(''); }}
                className="flex-1 py-2 border rounded-xl font-black uppercase text-xs text-slate-500">
                Cancel
              </button>
              <button onClick={() => handleDeliveryAck(ackingDispatchId)}
                className="flex-1 py-2 bg-emerald-600 text-white rounded-xl font-black uppercase text-xs hover:bg-emerald-700">
                Confirm Ack
              </button>
            </div>
          </div>
        </div>
      )}
    </div>


  );
};

export default DispatchView;
