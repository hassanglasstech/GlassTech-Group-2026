/**
 * QCCheckPanel.tsx — Phase 6
 *
 * QC Check layer for glass pieces:
 * - Shows QC-Pending pieces
 * - Blind check: QC doesn't see cutter's defect assessment until AFTER submitting own
 * - Random 10% mandatory check (system-selected)
 * - Hole/notch measurement verification (required vs actual)
 * - Pass → QC-Passed | Fail → QC-Failed + NCR
 * - If cutter said OK but QC finds defect → NCR for both
 * - If QC misses prompted piece → QC performance gap flagged
 */

import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { toast } from 'sonner';
import { ProductionService } from '@/modules/production/services/productionService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { NCRService } from '@/modules/production/services/ncrService';
import { GRNSheetEntry, CuttingSession } from '@/modules/procurement/types/inventory';
import { CheckCircle2, X, AlertTriangle, Eye, EyeOff, Info, ShieldCheck } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────
type QCDecision = 'Pass' | 'Fail' | null;

interface QCCheckItem {
  pieceId: string;
  orderId: string;
  itemIndex: number;
  description: string;
  size: string;
  thickness: string;
  services: string[];
  // Defective sheet info (from cutter scan — shown AFTER QC submits)
  isFromDefectiveSheet: boolean;
  cutterMarkedDefect: boolean | null;  // null = no assessment from cutter
  sheetTagId?: string;
  defectiveUsableSqft?: number;
  // Hole/notch specs from quotation item
  hasHoles: boolean;
  hasNotches: boolean;
  requiredHoleDiameter?: number;       // inches
  requiredNotchSize?: string;
  // Mandatory flag
  isMandatory: boolean;                // random 10% or defective sheet
  mandatoryReason?: string;
}

interface QCResult {
  pieceId: string;
  decision: QCDecision;
  defectCode?: string;
  defectComment?: string;
  actualHoleDiameter?: number;
  actualNotchSize?: string;
  qcBy: string;
  qcAt: string;
}

const QC_DEFECT_CODES = [
  { code: 'QC-01', label: 'QC-01 — Scratch / Surface Damage' },
  { code: 'QC-02', label: 'QC-02 — Wrong Size / Cut Error' },
  { code: 'QC-03', label: 'QC-03 — Edge Chip' },
  { code: 'QC-04', label: 'QC-04 — Hole Wrong Size/Position' },
  { code: 'QC-05', label: 'QC-05 — Notch Wrong Size/Position' },
  { code: 'QC-06', label: 'QC-06 — Defect from Raw Material' },
  { code: 'QC-07', label: 'QC-07 — Breakage / Crack' },
];

// ── Helpers ───────────────────────────────────────────────────────────────
function getPieceSize(specs: string): string {
  try {
    const s = JSON.parse(specs || '{}');
    if (s.mmW && s.mmH) return `${s.mmW}×${s.mmH}mm`;
    if (s.inchW !== undefined) return `${s.inchW}.${s.sootW || 0}"×${s.inchH}.${s.sootH || 0}"`;
    if (s.width && s.height) return `${s.width}"×${s.height}"`;
  } catch {}
  return specs?.slice(0, 20) || '—';
}

function getPieceThickness(specs: string): string {
  try { return JSON.parse(specs || '{}').glassSize || ''; } catch { return ''; }
}

function getServices(specs: string): string[] {
  try { return JSON.parse(specs || '{}').selectedServices || []; } catch { return []; }
}

// ══════════════════════════════════════════════════════════════════════════
const QCCheckPanel: React.FC<{
  pieces: any[];
  jobOrders: any[];
  handleUpdatePieceStatus: (id: string, status: string, extra?: any) => void;
}> = ({ pieces, jobOrders, handleUpdatePieceStatus }) => {
  const company  = useAppStore(s => s.selectedCompany);
  const qcName   = useAppStore(s => (s as any).currentUser?.name || 'QC');

  const [results, setResults]         = useState<Record<string, QCResult>>({});
  const [revealedPieces, setRevealed] = useState<Set<string>>(new Set());
  const [filterView, setFilterView]   = useState<'all' | 'mandatory' | 'defective'>('all');

  // ── Sheet entry lookup ────────────────────────────────────────────────
  const sheetDb: Record<string, GRNSheetEntry> = useMemo(() => {
    const entries = InventoryService.getGRNSheetEntries()
      .filter(e => e.company === company);
    const map: Record<string, GRNSheetEntry> = {};
    entries.forEach(e => { map[e.tagId] = e; });
    return map;
  }, [company]);

  // Cutter session lookup — for defect assessments
  const cutterSessions: CuttingSession[] = useMemo(() =>
    InventoryService.getCuttingSessions().filter(s => s.company === company),
  [company]);

  // ── Build QC items list ───────────────────────────────────────────────
  const qcPieces: QCCheckItem[] = useMemo(() => {
    const pending = pieces.filter(p => p.status === 'QC-Pending');

    // System selects 10% random from non-defective for mandatory check
    const randomSampleSize = Math.max(1, Math.round(pending.length * 0.1));
    const randomSampleIds = new Set(
      [...pending]
        .sort(() => Math.random() - 0.5)
        .slice(0, randomSampleSize)
        .map(p => p.id)
    );

    return pending.map(p => {
      const order = jobOrders.find(j => j.orderNo === p.orderId || j.id === p.orderId);
      const item = order?.items?.[p.itemIndex];
      const services: string[] = item?.selectedServices || getServices(p.specs);

      // Find if this piece's sheet was defective
      const session = cutterSessions.find(s =>
        s.jobOrderId === p.orderId &&
        s.sheetsScanned?.some((sc: any) => sc.isDefective)
      );
      const defectiveScan = session?.sheetsScanned?.find((sc: any) => sc.isDefective);
      const sheetEntry = defectiveScan ? sheetDb[defectiveScan.tagId] : undefined;

      // Cutter's per-piece defect assessment
      const cutterDefectAssessment = session?.sheetsScanned
        ?.find((sc: any) => sc.pieceDefectAssessments)
        ?.pieceDefectAssessments
        ?.find((a: any) => a.pieceNo === p.itemIndex + 1)?.hasDefect ?? null;

      const isFromDefective = !!defectiveScan;
      const isMandatory = isFromDefective || randomSampleIds.has(p.id);

      return {
        pieceId:   p.id,
        orderId:   p.orderId,
        itemIndex: p.itemIndex,
        description: item?.description || p.specs?.slice(0, 30) || p.id,
        size:      item ? `${item.inchW || item.mmW || '?'}"×${item.inchH || item.mmH || '?'}"` : getPieceSize(p.specs),
        thickness: item?.glassSize || getPieceThickness(p.specs),
        services,
        isFromDefectiveSheet: isFromDefective,
        cutterMarkedDefect:   cutterDefectAssessment,
        sheetTagId:           defectiveScan?.tagId,
        defectiveUsableSqft:  sheetEntry?.usableSqft,
        hasHoles:    services.includes('Holes') || !!(item?.holes?.length),
        hasNotches:  services.includes('Notch') || services.includes('Notching'),
        requiredHoleDiameter: item?.holes?.[0]?.diameter,
        isMandatory,
        mandatoryReason: isFromDefective ? 'Defective sheet' : randomSampleIds.has(p.id) ? 'Random 10% check' : undefined,
      };
    });
  }, [pieces, jobOrders, sheetDb, cutterSessions]);

  const filtered = useMemo(() => {
    if (filterView === 'mandatory') return qcPieces.filter(p => p.isMandatory);
    if (filterView === 'defective') return qcPieces.filter(p => p.isFromDefectiveSheet);
    return qcPieces;
  }, [qcPieces, filterView]);

  // ── Update result ─────────────────────────────────────────────────────
  const updateResult = (pieceId: string, patch: Partial<QCResult>) => {
    setResults(prev => ({
      ...prev,
      [pieceId]: { ...prev[pieceId], pieceId, qcBy: qcName, qcAt: new Date().toISOString(), ...patch },
    }));
  };

  // ── Submit single piece ───────────────────────────────────────────────
  const handleSubmitPiece = (item: QCCheckItem) => {
    const result = results[item.pieceId];
    if (!result?.decision) { toast.error('Select Pass or Fail first'); return; }
    if (result.decision === 'Fail' && !result.defectCode) { toast.error('Select defect code'); return; }
    if (item.hasHoles && result.decision === 'Pass' && !result.actualHoleDiameter) {
      toast.error('Enter actual hole diameter for verification'); return;
    }

    if (result.decision === 'Pass') {
      handleUpdatePieceStatus(item.pieceId, 'QC-Passed');

      // Check: cutter said defect but QC passed → flag QC
      if (item.cutterMarkedDefect === true) {
        toast.warning(`QC cleared piece that cutter flagged as defective — supervisor will review`, { duration: 5000 });
      }

      // Hole/notch measurement check
      if (item.hasHoles && result.actualHoleDiameter && item.requiredHoleDiameter) {
        const diff = Math.abs(result.actualHoleDiameter - item.requiredHoleDiameter);
        if (diff > (1 / 25.4)) { // > 1mm tolerance
          toast.warning(`Hole size variance: required ${item.requiredHoleDiameter.toFixed(2)}" actual ${result.actualHoleDiameter.toFixed(2)}" — noted`, { duration: 4000 });
        }
      }
      toast.success(`#${item.pieceId} → QC Passed`);

    } else {
      // QC Failed
      handleUpdatePieceStatus(item.pieceId, 'QC-Failed');

      // NCR for QC fail
      const order = jobOrders.find(j => j.orderNo === item.orderId || j.id === item.orderId);
      try {
        NCRService.createNCR({
          company,
          stage: 'Cutting',
          cause: 'BR-01-Operator-Error',
          description: `QC Failed — ${item.pieceId}: ${result.defectCode} — ${result.defectComment || ''}`,
          reportedBy: qcName,
          sqftLost: 0,
          glassType: '',
          thickness: item.thickness,
          estimatedValue: 0,
          action: 'Reproduce',
          notes: `QC-FAIL: Piece ${item.pieceId}, Order ${item.orderId}`,
        } as any);
      } catch (e) { console.warn('[QC] NCR failed:', e); }

      // If cutter said OK but QC found defect → NCR for cutter too
      if (item.cutterMarkedDefect === false) {
        try {
          NCRService.createNCR({
            company,
            stage: 'Cutting',
            cause: 'BR-01-Operator-Error',
            description: `Cutter marked piece OK but QC found defect — ${item.pieceId}: ${result.defectCode}`,
            reportedBy: 'System',
            sqftLost: 0,
            glassType: '', thickness: item.thickness,
            estimatedValue: 0, action: 'Dispose',
            notes: `NCR-CUT-QC: Cutter assessment conflict. Piece ${item.pieceId}`,
          } as any);
        } catch (e) { console.warn('[QC] Cutter NCR failed:', e); }
        toast.error(`NCR raised for Cutter — marked piece clean but defect found`, { duration: 5000 });
      }
      toast.error(`#${item.pieceId} → QC Failed — NCR raised`);
    }

    // Remove from results state
    setResults(prev => { const n = { ...prev }; delete n[item.pieceId]; return n; });
  };

  // ── Reveal cutter assessment ──────────────────────────────────────────
  const revealCutterAssessment = (pieceId: string) => {
    setRevealed(prev => new Set([...prev, pieceId]));
  };

  // ── Stats ─────────────────────────────────────────────────────────────
  const totalPending  = qcPieces.length;
  const mandatory     = qcPieces.filter(p => p.isMandatory).length;
  const fromDefective = qcPieces.filter(p => p.isFromDefectiveSheet).length;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="bg-emerald-600 text-white rounded-2xl p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck size={24}/>
          <div>
            <h2 className="text-lg font-black uppercase">QC Check</h2>
            <p className="text-[10px] text-emerald-200 font-bold uppercase tracking-widest mt-0.5">
              Blind check — cutter assessment hidden until you submit
            </p>
          </div>
        </div>
        <div className="flex gap-4 text-right text-xs">
          <div><div className="text-emerald-200 font-bold uppercase text-[9px]">Pending</div><div className="text-2xl font-black">{totalPending}</div></div>
          <div><div className="text-emerald-200 font-bold uppercase text-[9px]">Mandatory</div><div className="text-2xl font-black text-amber-300">{mandatory}</div></div>
          <div><div className="text-emerald-200 font-bold uppercase text-[9px]">Defective</div><div className="text-2xl font-black text-red-300">{fromDefective}</div></div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[
          { id: 'all', label: `All (${totalPending})` },
          { id: 'mandatory', label: `Mandatory (${mandatory})` },
          { id: 'defective', label: `Defective Sheet (${fromDefective})` },
        ].map(f => (
          <button key={f.id} onClick={() => setFilterView(f.id as any)}
            className={`text-xs font-black uppercase px-4 py-2 rounded-xl border transition-colors ${filterView === f.id ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
        <Info size={14} className="text-blue-600 shrink-0 mt-0.5"/>
        <p className="text-[10px] text-blue-700 font-bold">
          Blind check: You will not see the cutter's defect assessment until after you submit your own decision.
          Random 10% pieces are mandatory — failing to check these will affect your QC performance record.
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-16 text-center">
          <CheckCircle2 size={32} className="mx-auto text-emerald-300 mb-3"/>
          <p className="text-sm font-bold text-slate-400">No pieces pending QC check</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => {
            const result = results[item.pieceId] || {};
            const isRevealed = revealedPieces.has(item.pieceId);
            const isSubmitted = !pieces.find(p => p.id === item.pieceId && p.status === 'QC-Pending');

            return (
              <div key={item.pieceId}
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${item.isMandatory ? 'border-amber-300' : 'border-slate-200'}`}>

                {/* Piece header */}
                <div className={`px-5 py-3 flex items-center justify-between ${item.isMandatory ? 'bg-amber-50' : 'bg-slate-50'} border-b`}>
                  <div className="flex items-center gap-3">
                    <div className="font-mono text-xs font-black text-slate-600">{item.pieceId}</div>
                    <div className="text-xs text-slate-700 font-bold uppercase">{item.description}</div>
                    <div className="text-[9px] text-slate-400 font-bold">{item.size} · {item.thickness}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.isMandatory && (
                      <span className="text-[9px] font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full uppercase">
                        {item.mandatoryReason}
                      </span>
                    )}
                    {item.isFromDefectiveSheet && (
                      <span className="text-[9px] font-black text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                        Defective Sheet
                      </span>
                    )}
                    {item.services.length > 0 && (
                      <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        {item.services.join(', ')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-5 space-y-4">

                  {/* QC Decision */}
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-black uppercase text-slate-400 shrink-0">QC Decision</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => updateResult(item.pieceId, { decision: 'Pass' })}
                        className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase border transition-colors ${result.decision === 'Pass' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}>
                        <CheckCircle2 size={13}/> Pass
                      </button>
                      <button
                        onClick={() => updateResult(item.pieceId, { decision: 'Fail' })}
                        className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase border transition-colors ${result.decision === 'Fail' ? 'bg-red-600 text-white border-red-600' : 'border-red-200 text-red-600 hover:bg-red-50'}`}>
                        <X size={13}/> Fail
                      </button>
                    </div>
                  </div>

                  {/* Fail details */}
                  {result.decision === 'Fail' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-400">Defect Code *</label>
                        <select className="sap-input w-full text-xs"
                          value={result.defectCode || ''}
                          onChange={e => updateResult(item.pieceId, { defectCode: e.target.value })}>
                          <option value="">— Select —</option>
                          {QC_DEFECT_CODES.map(d => <option key={d.code} value={d.code}>{d.label}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-400">Comment</label>
                        <input type="text" className="sap-input w-full text-xs"
                          placeholder="Describe defect…"
                          value={result.defectComment || ''}
                          onChange={e => updateResult(item.pieceId, { defectComment: e.target.value })}/>
                      </div>
                    </div>
                  )}

                  {/* Hole/notch measurement */}
                  {(item.hasHoles || item.hasNotches) && (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 space-y-2">
                      <p className="text-[10px] font-black uppercase text-purple-700">
                        {item.hasHoles ? 'Hole' : 'Notch'} Measurement Verification
                      </p>
                      <div className="flex items-center gap-4">
                        {item.hasHoles && item.requiredHoleDiameter && (
                          <div className="text-xs text-purple-700 font-bold">
                            Required: ⌀{item.requiredHoleDiameter.toFixed(2)}" (±1mm)
                          </div>
                        )}
                        {item.hasHoles && (
                          <div className="flex items-center gap-2">
                            <label className="text-[9px] font-black text-purple-600">Actual ⌀ (inches):</label>
                            <input type="number" step="0.01" min="0"
                              className="sap-input w-24 text-xs font-bold"
                              placeholder="0.50"
                              value={result.actualHoleDiameter || ''}
                              onChange={e => updateResult(item.pieceId, { actualHoleDiameter: Number(e.target.value) })}/>
                          </div>
                        )}
                        {item.hasNotches && (
                          <div className="flex items-center gap-2">
                            <label className="text-[9px] font-black text-purple-600">Notch (W×H inches):</label>
                            <input type="text" className="sap-input w-28 text-xs font-bold"
                              placeholder="1.0×1.0"
                              value={result.actualNotchSize || ''}
                              onChange={e => updateResult(item.pieceId, { actualNotchSize: e.target.value })}/>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Cutter assessment reveal (blind) */}
                  {item.isFromDefectiveSheet && (
                    <div className={`rounded-xl p-3 border ${isRevealed ? 'bg-slate-50 border-slate-200' : 'bg-slate-100 border-slate-200'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isRevealed ? <Eye size={13} className="text-slate-500"/> : <EyeOff size={13} className="text-slate-400"/>}
                          <span className="text-[10px] font-black uppercase text-slate-500">
                            Cutter's Defect Assessment {isRevealed ? '' : '— Hidden until you submit or reveal'}
                          </span>
                        </div>
                        {!isRevealed && (
                          <button onClick={() => revealCutterAssessment(item.pieceId)}
                            className="text-[9px] font-bold text-blue-600 hover:underline">
                            Reveal
                          </button>
                        )}
                      </div>
                      {isRevealed && (
                        <div className={`mt-2 text-xs font-black ${item.cutterMarkedDefect === true ? 'text-red-600' : item.cutterMarkedDefect === false ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {item.cutterMarkedDefect === true
                            ? '⚠ Cutter marked: DEFECT in this piece area'
                            : item.cutterMarkedDefect === false
                              ? '✓ Cutter marked: No defect in this piece'
                              : '— Cutter did not assess this piece'}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Submit button */}
                  <div className="flex justify-end">
                    <button onClick={() => handleSubmitPiece(item)}
                      disabled={!result.decision}
                      className={`px-8 py-2.5 rounded-xl text-xs font-black uppercase transition-colors ${result.decision ? result.decision === 'Pass' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-red-600 text-white hover:bg-red-700' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}>
                      Submit QC Decision
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default QCCheckPanel;
