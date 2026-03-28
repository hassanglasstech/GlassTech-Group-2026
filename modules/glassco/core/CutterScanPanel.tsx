/**
 * CutterScanPanel.tsx — Phase 5
 *
 * Cutter's active work interface:
 * - Select job order → see 2D cutting plan
 * - Scan sheet tag before cutting
 * - System detects missed/late scans → NCR-CUT auto-generated
 * - Defective sheet → per-piece defect check prompt
 * - Session tracking (CuttingSession)
 * - Wastage recording on session close
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { toast } from 'sonner';
import { ProductionService } from '@/modules/production/services/productionService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { NCRService } from '@/modules/production/services/ncrService';
import { CuttingSession, GRNSheetEntry } from '@/modules/procurement/types/inventory';
import { JobOrder } from '@/modules/production/types/production';
import CuttingDiagram, { buildPackingPiecesFromQuotation } from '@/modules/glassco/core/CuttingDiagram';
import {
  ScanLine, AlertTriangle, CheckCircle2, Clock, X,
  Package, Scissors, ChevronDown, ChevronRight,
  Play, Square, Tag, Info
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────
interface ScanRecord {
  tagId: string;
  scannedAt: string;
  jobId: string;
  isDefective: boolean;
  lateOrMissed: boolean;
  pieceDefectAssessments?: { pieceNo: number; hasDefect: boolean | null }[];
}

interface ActiveSession {
  sessionId: string;
  jobId: string;
  jobLabel: string;
  startTime: string;
  scans: ScanRecord[];
  piecesLogged: number;
  remnantsCreated: string[];
  scrapSqft: number;
}

// ── NCR generator for cutter ──────────────────────────────────────────────
function raiseCutterNCR(
  company: string,
  type: 'MISSED' | 'LATE',
  jobId: string,
  tagId: string,
  cutterName: string
) {
  const desc = type === 'MISSED'
    ? `Sheet ${tagId} was NOT scanned before first piece cut in Job ${jobId}`
    : `Sheet ${tagId} was scanned AFTER first piece cut in Job ${jobId}`;

  try {
    NCRService.createNCR({
      company,
      stage: 'Cutting',
      cause: 'BR-01-Operator-Error',
      description: desc,
      reportedBy: cutterName || 'System',
      sqftLost: 0,
      glassType: '',
      thickness: '',
      estimatedValue: 0,
      action: 'Dispose',
      notes: `NCR-CUT: ${type} scan. Job: ${jobId}, Tag: ${tagId}`,
    } as any);
    toast.warning(`NCR-CUT raised: ${type === 'MISSED' ? 'Missed' : 'Late'} scan — ${tagId}`, { duration: 5000 });
  } catch (e) {
    console.warn('[CutterScan] NCR creation failed:', e);
  }
}

// ══════════════════════════════════════════════════════════════════════════
const CutterScanPanel: React.FC = () => {
  const company    = useAppStore(s => s.selectedCompany);
  const cutterName = useAppStore(s => (s as any).currentUser?.name || 'Cutter');

  const [activeSession, setActiveSession]         = useState<ActiveSession | null>(null);
  const [scanInput, setScanInput]                 = useState('');
  const [showDiagram, setShowDiagram]             = useState(false);
  const [selectedJobId, setSelectedJobId]         = useState('');
  const [expandedAlerts, setExpandedAlerts]       = useState(false);
  const [defectPrompt, setDefectPrompt]           = useState<{
    tagId: string; isDefective: boolean;
    pieces: { pieceNo: number; desc: string }[];
    assessments: { pieceNo: number; hasDefect: boolean | null }[];
  } | null>(null);
  const [scrapInput, setScrapInput]               = useState(0);
  const [showCloseConfirm, setShowCloseConfirm]   = useState(false);

  const scanRef = useRef<HTMLInputElement>(null);

  // ── Data ─────────────────────────────────────────────────────────────
  const openJobs: JobOrder[] = useMemo(() =>
    ProductionService.getJobOrders().filter((j: any) =>
      (j.company === company || j.fromCompany === company) &&
      !['Completed', 'Cancelled', 'Delivered'].includes(j.status)
    ).sort((a: any, b: any) => (b.date || '').localeCompare(a.date || '')),
  [company, activeSession]);

  const selectedJob = useMemo(() =>
    openJobs.find(j => j.id === (activeSession?.jobId || selectedJobId)),
  [openJobs, activeSession, selectedJobId]);

  const pieces = useMemo(() =>
    selectedJob ? buildPackingPiecesFromQuotation(selectedJob.items || []) : [],
  [selectedJob]);

  // Sheet entries from GRN — for defective check
  const sheetDb: Record<string, GRNSheetEntry> = useMemo(() => {
    const entries = InventoryService.getGRNSheetEntries()
      .filter(e => e.company === company);
    const map: Record<string, GRNSheetEntry> = {};
    entries.forEach(e => { map[e.tagId] = e; });
    return map;
  }, [company]);

  // Missed scan alerts across all open sessions
  const missedAlerts = useMemo(() => {
    if (!activeSession) return [];
    const sessionScannedTags = new Set(activeSession.scans.map(s => s.tagId));
    return activeSession.scans.filter(s => s.lateOrMissed);
  }, [activeSession]);

  // ── Start session ─────────────────────────────────────────────────────
  const handleStartSession = () => {
    if (!selectedJobId) { toast.error('Select a job order first'); return; }
    const job = openJobs.find(j => j.id === selectedJobId);
    if (!job) return;

    const sessionId = `CS-${company}-${String(Date.now()).slice(-8)}`;
    const session: ActiveSession = {
      sessionId, jobId: selectedJobId,
      jobLabel: (job as any).orderNo || job.id,
      startTime: new Date().toISOString(),
      scans: [], piecesLogged: 0,
      remnantsCreated: [], scrapSqft: 0,
    };
    setActiveSession(session);
    setShowDiagram(true);
    setTimeout(() => scanRef.current?.focus(), 300);
    toast.success(`Session started — Job ${session.jobLabel}`);
  };

  // ── Process scan ──────────────────────────────────────────────────────
  const handleScan = () => {
    const tagId = scanInput.trim().toUpperCase();
    if (!tagId || !activeSession) return;

    setScanInput('');

    // Check if already scanned in this session
    if (activeSession.scans.find(s => s.tagId === tagId)) {
      toast.warning(`${tagId} already scanned in this session`);
      return;
    }

    // Lookup in GRN sheet entries
    const sheetEntry = sheetDb[tagId];
    const isDefective = sheetEntry?.status === 'Defective' || sheetEntry?.status === 'Broken';

    // Late scan check: if piecesLogged > 0 and this is the FIRST scan on a new sheet
    // (heuristic: any scan after first piece without prior scan = late)
    const isFirstScanForSession = activeSession.scans.length === 0;
    const isLate = !isFirstScanForSession && activeSession.piecesLogged > activeSession.scans.length;

    if (isLate) {
      raiseCutterNCR(company, 'LATE', activeSession.jobId, tagId, cutterName);
    }

    const scan: ScanRecord = {
      tagId,
      scannedAt: new Date().toISOString(),
      jobId: activeSession.jobId,
      isDefective,
      lateOrMissed: isLate,
    };

    const updatedSession = {
      ...activeSession,
      scans: [...activeSession.scans, scan],
      piecesLogged: activeSession.piecesLogged + 1,
    };
    setActiveSession(updatedSession);

    // Save to inventory service
    const csRecord: CuttingSession = {
      id: activeSession.sessionId,
      company,
      jobOrderId: activeSession.jobId,
      cutterId: cutterName,
      cutterName,
      startTime: activeSession.startTime,
      status: 'Open',
      sheetsScanned: updatedSession.scans.map(s => ({
        tagId: s.tagId,
        scannedAt: s.scannedAt,
        isDefective: s.isDefective,
        lateOrMissed: s.lateOrMissed,
      })),
      piecesProduced: updatedSession.piecesLogged,
      remnantsCreated: updatedSession.remnantsCreated,
      scrapSqft: updatedSession.scrapSqft,
      scrapWeightKg: 0,
      estimatedWastagePct: 0,
    };
    InventoryService.upsertCuttingSession(csRecord);

    // Defective sheet → show per-piece prompt
    if (isDefective) {
      const pieceList = pieces.map((p, i) => ({
        pieceNo: p.pieceNo,
        desc: `#${p.pieceNo} — ${p.widthInch.toFixed(1)}"×${p.heightInch.toFixed(1)}" (${p.description || ''})`,
      }));
      setDefectPrompt({
        tagId, isDefective: true, pieces: pieceList,
        assessments: pieceList.map(p => ({ pieceNo: p.pieceNo, hasDefect: null })),
      });
      toast.warning(`Defective sheet scanned — please assess each piece`, { duration: 4000 });
    } else {
      toast.success(`✓ ${tagId} scanned${isLate ? ' (LATE — NCR raised)' : ''}`, { duration: 2000 });
      scanRef.current?.focus();
    }
  };

  // ── Missed scan alert (called when user logs first piece without scan) ──
  const handleLogPieceWithoutScan = () => {
    if (!activeSession) return;
    const lastScanCount = activeSession.scans.length;
    const lastLoggedCount = activeSession.piecesLogged;

    // If pieces logged > scans → someone cut without scanning
    if (lastLoggedCount >= lastScanCount) {
      const fakeTagId = `UNKNOWN-${Date.now()}`;
      raiseCutterNCR(company, 'MISSED', activeSession.jobId, fakeTagId, cutterName);
      toast.error('MISSED SCAN — NCR-CUT raised. Please scan sheet tag.', { duration: 6000 });
    }

    setActiveSession(prev => prev ? { ...prev, piecesLogged: prev.piecesLogged + 1 } : null);
    scanRef.current?.focus();
  };

  // ── Defect assessment submit ──────────────────────────────────────────
  const handleDefectAssessmentSubmit = () => {
    if (!defectPrompt || !activeSession) return;

    const allAnswered = defectPrompt.assessments.every(a => a.hasDefect !== null);
    if (!allAnswered) { toast.error('Mark each piece as defect Yes/No'); return; }

    // Update scan record with assessments
    const updatedScans = activeSession.scans.map(s =>
      s.tagId === defectPrompt.tagId
        ? { ...s, pieceDefectAssessments: defectPrompt.assessments }
        : s
    );
    setActiveSession(prev => prev ? { ...prev, scans: updatedScans } : null);
    setDefectPrompt(null);

    const defectPieces = defectPrompt.assessments.filter(a => a.hasDefect).length;
    if (defectPieces > 0) {
      toast.warning(`${defectPieces} piece(s) marked as having defect — QC will verify`, { duration: 4000 });
    } else {
      toast.success('All pieces marked clean — QC random check may still apply', { duration: 3000 });
    }
    scanRef.current?.focus();
  };

  // ── Close session ──────────────────────────────────────────────────────
  const handleCloseSession = () => {
    if (!activeSession) return;

    const endTime = new Date().toISOString();
    const csRecord: CuttingSession = {
      id: activeSession.sessionId,
      company,
      jobOrderId: activeSession.jobId,
      cutterId: cutterName,
      cutterName,
      startTime: activeSession.startTime,
      endTime,
      status: 'Closed',
      sheetsScanned: activeSession.scans.map(s => ({
        tagId: s.tagId, scannedAt: s.scannedAt,
        isDefective: s.isDefective, lateOrMissed: s.lateOrMissed,
      })),
      piecesProduced: activeSession.piecesLogged,
      remnantsCreated: activeSession.remnantsCreated,
      scrapSqft,
      scrapWeightKg: 0,
      estimatedWastagePct: 0,
    };
    InventoryService.upsertCuttingSession(csRecord);

    toast.success(`Session closed — ${activeSession.scans.length} sheets, ${scrapInput.toFixed(1)} sqft scrap recorded`);
    setActiveSession(null);
    setScrapInput(0);
    setShowCloseConfirm(false);
    setShowDiagram(false);
    setSelectedJobId('');
  };

  const scrapInput2 = activeSession?.scrapSqft || 0;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Defective piece prompt modal ── */}
      {defectPrompt && (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-[500] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-4 bg-amber-500 text-white rounded-t-2xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18}/>
                <span className="font-black uppercase text-sm">Defective Sheet — Piece Assessment</span>
              </div>
              <span className="text-[10px] font-bold bg-white/20 px-2 py-1 rounded">{defectPrompt.tagId}</span>
            </div>

            <div className="p-5">
              <p className="text-xs text-slate-600 font-bold mb-4">
                This sheet is marked <span className="text-amber-600">DEFECTIVE</span> in system.
                Mark each piece: does the defect fall in that piece area?
              </p>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {defectPrompt.assessments.map((a, i) => (
                  <div key={a.pieceNo}
                    className={`flex items-center justify-between p-3 rounded-xl border ${a.hasDefect === true ? 'bg-red-50 border-red-200' : a.hasDefect === false ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                    <span className="text-xs font-bold text-slate-700">
                      {defectPrompt.pieces[i]?.desc}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDefectPrompt(prev => prev ? { ...prev, assessments: prev.assessments.map(x => x.pieceNo === a.pieceNo ? { ...x, hasDefect: true } : x) } : null)}
                        className={`text-[10px] font-black px-3 py-1.5 rounded-lg border ${a.hasDefect === true ? 'bg-red-500 text-white border-red-500' : 'border-red-200 text-red-600 hover:bg-red-50'}`}>
                        YES — Defect Here
                      </button>
                      <button
                        onClick={() => setDefectPrompt(prev => prev ? { ...prev, assessments: prev.assessments.map(x => x.pieceNo === a.pieceNo ? { ...x, hasDefect: false } : x) } : null)}
                        className={`text-[10px] font-black px-3 py-1.5 rounded-lg border ${a.hasDefect === false ? 'bg-emerald-500 text-white border-emerald-500' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}>
                        NO — Clean
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-[10px] text-amber-700 font-bold">
                  QC will independently verify your assessment. If QC finds a defect you marked clean,
                  an NCR will be raised for both cutter and QC.
                </p>
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => { setDefectPrompt(null); scanRef.current?.focus(); }}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50">
                  Skip Assessment
                </button>
                <button onClick={handleDefectAssessmentSubmit}
                  className="px-6 py-2 bg-amber-500 text-white rounded-xl text-xs font-black uppercase hover:bg-amber-600">
                  Submit Assessment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Close session confirm ── */}
      {showCloseConfirm && activeSession && (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-[500] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-sm font-black uppercase text-slate-800 mb-4">Close Cutting Session</h3>
            <div className="space-y-3 mb-5">
              <div className="bg-slate-50 rounded-xl p-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-slate-400 font-bold">Job:</span> <span className="font-black">{activeSession.jobLabel}</span></div>
                  <div><span className="text-slate-400 font-bold">Sheets:</span> <span className="font-black">{activeSession.scans.length}</span></div>
                  <div><span className="text-slate-400 font-bold">Pieces:</span> <span className="font-black">{activeSession.piecesLogged}</span></div>
                  <div><span className="text-slate-400 font-bold">Alerts:</span> <span className={`font-black ${missedAlerts.length > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{missedAlerts.length}</span></div>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Scrap SqFt (from this session)</label>
                <input type="number" min="0" step="0.1"
                  className="sap-input w-full font-bold"
                  placeholder="Enter total scrap sqft from cutting"
                  value={scrapInput || ''}
                  onChange={e => setScrapInput(Number(e.target.value))}/>
                <p className="text-[9px] text-slate-400">Include all offcuts below remnant threshold</p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowCloseConfirm(false)}
                className="px-5 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-500">
                Cancel
              </button>
              <button onClick={handleCloseSession}
                className="px-6 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase hover:bg-red-700">
                Close Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main panel ── */}
      {!activeSession ? (
        // ── No active session — job selector ──
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-3 pb-4 border-b mb-5">
            <div className="p-2.5 bg-slate-900 rounded-xl"><Scissors size={16} className="text-white"/></div>
            <div>
              <h3 className="text-sm font-black uppercase">Cutter Workstation</h3>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">Select job → scan sheet tag before cutting</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 mb-1.5 block">Select Job Order</label>
              <select className="sap-input w-full font-bold" value={selectedJobId} onChange={e => setSelectedJobId(e.target.value)}>
                <option value="">— Select Job Order —</option>
                {openJobs.map(j => (
                  <option key={j.id} value={j.id}>
                    {(j as any).orderNo || j.id} — {(j as any).clientName || (j as any).projectName || ''}
                  </option>
                ))}
              </select>
            </div>

            {selectedJob && pieces.length > 0 && (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Job Summary</p>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div><span className="text-slate-400">Pieces:</span> <span className="font-black">{pieces.reduce((s, p) => s + p.qty, 0)}</span></div>
                  <div><span className="text-slate-400">Types:</span> <span className="font-black">{pieces.length}</span></div>
                  <div><span className="text-slate-400">Date:</span> <span className="font-black">{(selectedJob as any).date}</span></div>
                </div>
                <button onClick={() => setShowDiagram(!showDiagram)}
                  className="mt-3 flex items-center gap-1.5 text-[10px] font-bold text-blue-600 hover:underline">
                  {showDiagram ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
                  {showDiagram ? 'Hide' : 'Preview'} 2D Cutting Plan
                </button>
                {showDiagram && (
                  <div className="mt-3">
                    <CuttingDiagram
                      pieces={pieces}
                      sheetWidthInch={84} sheetHeightInch={144}
                      glassType={pieces[0]?.glassType}
                    />
                  </div>
                )}
              </div>
            )}

            <button onClick={handleStartSession} disabled={!selectedJobId}
              className={`w-full py-3 rounded-2xl text-sm font-black uppercase flex items-center justify-center gap-2 ${selectedJobId ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}>
              <Play size={16}/> Start Cutting Session
            </button>
          </div>
        </div>

      ) : (
        // ── Active session ──
        <div className="space-y-4">

          {/* Session header */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse"/>
              <div>
                <div className="text-sm font-black uppercase">Active Session — Job {activeSession.jobLabel}</div>
                <div className="text-[10px] text-slate-400 font-bold mt-0.5">
                  Started: {new Date(activeSession.startTime).toLocaleTimeString()} ·
                  {activeSession.scans.length} sheets · {activeSession.piecesLogged} pieces
                </div>
              </div>
            </div>
            <button onClick={() => setShowCloseConfirm(true)}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase px-4 py-2 rounded-xl">
              <Square size={12}/> Close Session
            </button>
          </div>

          {/* Missed scan alerts */}
          {missedAlerts.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <button onClick={() => setExpandedAlerts(!expandedAlerts)}
                className="flex items-center gap-2 w-full text-left">
                <AlertTriangle size={15} className="text-red-500 shrink-0"/>
                <span className="text-xs font-black uppercase text-red-700">
                  {missedAlerts.length} Late/Missed Scan NCR(s) This Session
                </span>
                {expandedAlerts ? <ChevronDown size={13} className="ml-auto text-red-400"/> : <ChevronRight size={13} className="ml-auto text-red-400"/>}
              </button>
              {expandedAlerts && (
                <div className="mt-3 space-y-1.5">
                  {missedAlerts.map(a => (
                    <div key={a.tagId} className="flex items-center gap-2 text-[10px] text-red-700 bg-red-100 rounded-lg px-3 py-2">
                      <Tag size={10}/>
                      <span className="font-mono font-bold">{a.tagId}</span>
                      <span className="text-red-500">— {a.lateOrMissed ? 'LATE scan' : 'MISSED'}</span>
                      <span className="text-red-400 ml-auto">{new Date(a.scannedAt).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Scan input */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-3 pb-4 border-b mb-4">
              <ScanLine size={16} className="text-blue-600"/>
              <div>
                <h3 className="text-xs font-black uppercase">Scan Sheet Tag</h3>
                <p className="text-[9px] text-slate-400 font-bold mt-0.5">
                  Scan or type tag ID before cutting each sheet
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <input
                ref={scanRef}
                type="text"
                className="sap-input flex-1 font-mono font-bold text-sm uppercase"
                placeholder="GLS-5MM-0326-001-01"
                value={scanInput}
                onChange={e => setScanInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleScan()}
                autoComplete="off"
                autoFocus
              />
              <button onClick={handleScan}
                className="bg-blue-700 text-white px-6 py-2.5 rounded-xl font-black uppercase text-xs hover:bg-blue-800 flex items-center gap-2">
                <ScanLine size={14}/> Scan
              </button>
            </div>

            {/* Alert: log piece without scan button */}
            <div className="mt-3 flex items-center gap-3">
              <Info size={12} className="text-slate-400 shrink-0"/>
              <p className="text-[9px] text-slate-400 font-bold">
                If you cut without scanning, tap below — this will raise an NCR-CUT alert.
              </p>
              <button onClick={handleLogPieceWithoutScan}
                className="text-[9px] font-black text-red-500 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-50 shrink-0">
                Log piece (no scan)
              </button>
            </div>
          </div>

          {/* Scan log */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-xs font-black uppercase text-slate-700 mb-3">
              Scanned Sheets ({activeSession.scans.length})
            </h3>
            {activeSession.scans.length === 0 ? (
              <p className="text-[10px] text-slate-400 italic">No sheets scanned yet — scan first sheet before cutting</p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {[...activeSession.scans].reverse().map((scan, i) => (
                  <div key={scan.tagId}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl ${scan.lateOrMissed ? 'bg-red-50 border border-red-100' : scan.isDefective ? 'bg-amber-50 border border-amber-100' : 'bg-emerald-50 border border-emerald-100'}`}>
                    {scan.lateOrMissed
                      ? <AlertTriangle size={12} className="text-red-500 shrink-0"/>
                      : scan.isDefective
                        ? <AlertTriangle size={12} className="text-amber-500 shrink-0"/>
                        : <CheckCircle2 size={12} className="text-emerald-500 shrink-0"/>
                    }
                    <span className="font-mono font-bold text-xs text-slate-800">{scan.tagId}</span>
                    {scan.isDefective && <span className="text-[9px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">DEFECTIVE</span>}
                    {scan.lateOrMissed && <span className="text-[9px] font-black text-red-700 bg-red-100 px-1.5 py-0.5 rounded">NCR-CUT</span>}
                    {scan.pieceDefectAssessments && (
                      <span className="text-[9px] text-slate-400 font-bold">
                        {scan.pieceDefectAssessments.filter(a => a.hasDefect).length} defect piece(s)
                      </span>
                    )}
                    <span className="text-[9px] text-slate-400 ml-auto font-bold">
                      {new Date(scan.scannedAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2D diagram toggle */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <button onClick={() => setShowDiagram(!showDiagram)}
              className="flex items-center gap-2 text-xs font-bold text-blue-600 hover:underline">
              {showDiagram ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
              {showDiagram ? 'Hide' : 'Show'} 2D Cutting Plan
            </button>
            {showDiagram && pieces.length > 0 && (
              <div className="mt-4">
                <CuttingDiagram
                  pieces={pieces}
                  sheetWidthInch={84} sheetHeightInch={144}
                  glassType={pieces[0]?.glassType}
                  jobOrderId={activeSession.jobId}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CutterScanPanel;
