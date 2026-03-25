import React, { useState } from 'react';
import { useProductionContext } from '@/modules/production/components/ProductionContext';
import AnalyticsView from '@/modules/production/components/AnalyticsView';
import { ShieldAlert, PackageCheck, Ban, BarChart3, ChevronLeft, User, LayoutGrid, X, AlertTriangle } from 'lucide-react';
import JobCard from '@/modules/production/components/sub/JobCard';
import { NCRService } from '@/modules/production/services/ncrService';
import { toast } from 'sonner';

// ── QC Fail Codes ────────────────────────────────────────────────────
const FAULT_CODES = [
  { code: 'QC-01', desc: 'Edge Chip / Rough Edge' },
  { code: 'QC-02', desc: 'Surface Scratch' },
  { code: 'QC-03', desc: 'Incorrect Dimensions' },
  { code: 'QC-04', desc: 'Hole / Notch Position Error' },
  { code: 'QC-05', desc: 'Glass Breakage' },
  { code: 'QC-06', desc: 'Tempering Defect (Optical)' },
  { code: 'QC-07', desc: 'Coating / Film Defect' },
  { code: 'QC-08', desc: 'Wrong Glass Type / Spec' },
  { code: 'QC-09', desc: 'Stain / Contamination' },
  { code: 'QC-10', desc: 'Other (specify in notes)' },
];

// ── QC Fail Modal ────────────────────────────────────────────────────
const QCFailModal: React.FC<{
  piece: any;
  company: string;
  onConfirm: (faultCode: string, faultDesc: string, notes: string, createNCR: boolean) => void;
  onCancel: () => void;
}> = ({ piece, company, onConfirm, onCancel }) => {
  const [faultCode, setFaultCode] = useState('QC-05');
  const [notes, setNotes] = useState('');
  const [createNCR, setCreateNCR] = useState(false);

  const selected = FAULT_CODES.find(f => f.code === faultCode);

  const handleConfirm = () => {
    if (!notes.trim() && faultCode === 'QC-10') {
      toast.error('Notes required for QC-10 Other.'); return;
    }
    onConfirm(faultCode, selected?.desc || '', notes, createNCR);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[600] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="bg-rose-600 text-white p-5 rounded-t-2xl flex items-center justify-between">
          <div>
            <h3 className="text-base font-black uppercase">QC Fail — {piece.id}</h3>
            <p className="text-xs text-rose-200 mt-0.5">{piece.specs}</p>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-white/10 rounded-full"><X size={18}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-black text-slate-600 uppercase mb-2 block">Fault Code *</label>
            <div className="grid grid-cols-2 gap-2">
              {FAULT_CODES.map(f => (
                <button
                  key={f.code}
                  onClick={() => setFaultCode(f.code)}
                  className={`p-2.5 rounded-xl border-2 text-left transition-all ${
                    faultCode === f.code
                      ? 'border-rose-500 bg-rose-50'
                      : 'border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <span className={`text-[10px] font-black block ${faultCode === f.code ? 'text-rose-700' : 'text-slate-500'}`}>{f.code}</span>
                  <span className={`text-[10px] font-bold ${faultCode === f.code ? 'text-rose-600' : 'text-slate-400'}`}>{f.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-black text-slate-600 uppercase mb-1 block">Supervisor Notes</label>
            <textarea
              rows={2}
              className="sap-input w-full resize-none"
              placeholder="Describe the defect in detail..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
          {faultCode === 'QC-05' && (
            <label className="flex items-center gap-2 bg-amber-50 rounded-xl p-3 border border-amber-100 cursor-pointer">
              <input type="checkbox" checked={createNCR} onChange={e => setCreateNCR(e.target.checked)} className="rounded"/>
              <div>
                <span className="text-xs font-black text-amber-800">Create NCR + Reproduction Order</span>
                <p className="text-[9px] text-amber-600 mt-0.5">Glass broken — raise NCR and queue for re-cutting</p>
              </div>
            </label>
          )}
        </div>
        <div className="p-5 border-t border-slate-100 flex justify-end gap-3">
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
    pieces, jobOrders, spots, company,
    selectedJobId, setSelectedJobId, getJobDetails,
    handleUpdatePieceStatus, setSelectedPieceForFault, analyticsData,
    openBinModal
  } = useProductionContext();

  const [activeSubTab, setActiveSubTab] = useState<'qc' | 'finished_goods' | 'faults' | 'analytics'>('qc');
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
        const relevantPieces = (pieces || []).filter(p => p.orderId === selectedJobId && filterFn(p));
        if (!jobData) return null;
        return (
            <div className="space-y-4">
                <button onClick={() => setSelectedJobId(null)} className="flex items-center space-x-2 text-slate-500 hover:text-slate-900 transition-colors"><ChevronLeft size={16}/><span className="text-xs font-black uppercase">Back</span></button>
                <JobCard job={jobData.job} pieces={relevantPieces} onSelectJob={() => {}} isSelected={true} clients={[]} />
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
    const filteredJobs = (jobOrders || []).filter(j => (pieces || []).some(p => p.orderId === j.orderNo && filterFn(p)));
    if (filteredJobs.length === 0) return <div className="py-20 text-center text-slate-300 font-black uppercase text-xs italic">No pieces in this stage.</div>;
    return (
        <div className="space-y-3">
            {filteredJobs.map(j => {
                const jobPieces = (pieces || []).filter(p => p.orderId === j.orderNo && filterFn(p));
                const jobData = getJobDetails(j.orderNo || j.id, filterFn);
                if (!jobData) return null;
                return (
                    <div key={j.id}>
                        <JobCard job={jobData.job} pieces={jobPieces} onSelectJob={setSelectedJobId} isSelected={false} clients={[]}/>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-3 pl-2">
                            {jobPieces.map(p => (
                                <div key={p.id} className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm space-y-2">
                                    <div className="flex justify-between items-start">
                                        <span className="font-black text-blue-600 text-xs">{p.id}</span>
                                        <button onClick={() => openBinModal(p)} className="text-[9px] font-bold text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">BIN</button>
                                    </div>
                                    <p className="text-[10px] text-slate-400 leading-tight truncate">{p.specs}</p>
                                    {renderAction(p)}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
  };

  return (
    <div className="space-y-6">
        <div className="flex space-x-1 bg-white p-1 rounded-2xl border shadow-sm w-fit overflow-x-auto no-print">
            <button onClick={() => setActiveSubTab('qc')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeSubTab === 'qc' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><ShieldAlert size={16} className="inline mr-2"/> Quality Hub</button>
            <button onClick={() => setActiveSubTab('finished_goods')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeSubTab === 'finished_goods' ? 'bg-emerald-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><PackageCheck size={16} className="inline mr-2"/> Finished Goods</button>
            <button onClick={() => setActiveSubTab('faults')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeSubTab === 'faults' ? 'bg-rose-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><Ban size={16} className="inline mr-2"/> Fault Ledger</button>
            <button onClick={() => setActiveSubTab('analytics')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeSubTab === 'analytics' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><BarChart3 size={16} className="inline mr-2"/> Analytics</button>
        </div>

        {activeSubTab === 'qc' && (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
                {!selectedJobId && <div className="bg-emerald-600 text-white p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden"><div className="absolute top-0 right-0 p-8 opacity-10"><ShieldAlert size={120} /></div><div><h2 className="text-2xl font-black uppercase">Quality Control Hub</h2><p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest mt-1">Inspection & Grading</p></div></div>}
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

        {activeSubTab === 'finished_goods' && (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
                {!selectedJobId && <div className="bg-emerald-800 text-white p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden"><div className="absolute top-0 right-0 p-8 opacity-10"><PackageCheck size={120} /></div><div><h2 className="text-2xl font-black uppercase">Finished Goods</h2><p className="text-[10px] font-bold text-emerald-200 uppercase tracking-widest mt-1">Ready for Site Delivery</p></div></div>}
                {renderGrid(
                    (p) => p.status === 'Ready to Dispatch' && !p.dispatchId,
                    (p) => <div className="text-center text-[10px] font-bold text-emerald-600">Ready for Site</div>
                )}
            </div>
        )}

        {activeSubTab === 'faults' && (
            <div className="space-y-6 animate-in slide-in-from-bottom duration-300">
                <div className="bg-rose-900 text-white p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden"><div className="absolute top-0 right-0 p-8 opacity-10"><Ban size={120} /></div><div><h2 className="text-2xl font-black uppercase">Industrial Fault Ledger</h2><p className="text-[10px] font-bold text-rose-300 uppercase tracking-widest mt-1">QC Failed Pieces</p></div></div>
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
    </div>
  );
};

export default DispatchView;
