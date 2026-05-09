/**
 * CutterWorkbench.tsx — Sprint 6
 *
 * Mobile-first dedicated page for the cutter role. Replaces nested-tab
 * production-floor navigation with a single-screen workflow tuned for
 * a semi-literate operator on a 375 px phone, single-thumb usable.
 *
 * 3-button design (all ≥ 60×60 px):
 *   📋 ENTER SHEET NUMBER  → autocomplete drawer (consume_grn_sheet RPC)
 *   ➕ ADD PIECE           → increments session piece count
 *   ✓  END SESSION          → close active session (with scrap entry)
 *
 * Undo stack: keeps last 3 actions; each is reversible within 30 s.
 * Roman Urdu mode toggle: button labels switch to local language.
 *
 * Single-user / single-company assumption (glassco_cutter role).
 * Route gating happens in App.tsx (Sprint 6 part 2).
 *
 * Data:
 *   • Active session loaded from InventoryService.getCuttingSessions()
 *     filtered by cutter + status='Open'.
 *   • Sheet autocomplete from InventoryService.getAvailableSheetsForCompany.
 *   • Sheet consumption goes through InventoryService.consumeSheet
 *     (Sprint 0 — calls consume_grn_sheet RPC server-side).
 *   • Pieces are tracked locally on the session object; written back via
 *     InventoryService.upsertCuttingSession.
 */

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/modules/auth/authStore';
import { useAppStore } from '@/modules/shared/store/appStore';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { ProductionService } from '@/modules/production/services/productionService';
import { CuttingSession, GRNSheetEntry } from '@/modules/procurement/types/inventory';
import { JobOrder } from '@/modules/production/types/production';
import { toast } from 'sonner';
import {
  ScanLine, Plus, Square, Search, X, CheckCircle2, AlertTriangle,
  Globe, Undo2, Play, Hash, Package, Clock, Target,
} from 'lucide-react';

// ── i18n ─────────────────────────────────────────────────────────────────
type Lang = 'en' | 'ur';
const T: Record<Lang, Record<string, string>> = {
  en: {
    title:           'Cutter Workbench',
    today:           'Today',
    sqftToday:       "Today's SqFt",
    activeSession:   'Active Session',
    duration:        'Duration',
    sheets:          'Sheets',
    pieces:          'Pieces',
    enterSheet:      'Enter Sheet Number',
    addPiece:        'Add Piece',
    endSession:      'End Session',
    startSession:    'Start Session',
    selectJob:       'Select Job Order',
    selectCutter:    'Cutter Name',
    estWastage:      'Estimated Wastage %',
    scrapSqft:       'Scrap SqFt',
    scrapWeight:     'Scrap Weight (kg)',
    actualWastage:   'Actual Wastage %',
    confirm:         'Confirm',
    cancel:          'Cancel',
    save:            'Save',
    recent:          'Recent (last 5)',
    undo:            'Undo last',
    undoLeft:        's left',
    sheetSearch:     'Type sheet number…',
    noSheets:        'No matching sheets.',
    sheetConsumed:   'Sheet already consumed.',
    sheetAdded:      'Sheet added',
    pieceAdded:      'Piece logged',
    sessionEnded:    'Session closed',
    sessionStarted:  'Session started',
    chooseJobFirst:  'Choose a job first',
    noActiveSession: 'No active session — start one to begin cutting.',
    actionUndone:    'Action undone',
    nothingToUndo:   'Nothing to undo (or 30 s window expired).',
  },
  ur: {
    title:           'Cutter Workbench',
    today:           'Aaj',
    sqftToday:       'Aaj ke SqFt',
    activeSession:   'Active Session',
    duration:        'Waqt',
    sheets:          'Sheets',
    pieces:          'Pieces',
    enterSheet:      'Sheet Number Likhein',
    addPiece:        'Piece Add Karein',
    endSession:      'Session Khatam',
    startSession:    'Session Shuru',
    selectJob:       'Job Order Chunein',
    selectCutter:    'Cutter ka Naam',
    estWastage:      'Anumaani Wastage %',
    scrapSqft:       'Scrap SqFt',
    scrapWeight:     'Scrap Wazan (kg)',
    actualWastage:   'Asli Wastage %',
    confirm:         'Tasdeeq',
    cancel:          'Mansookh',
    save:            'Save',
    recent:          'Recent (akhri 5)',
    undo:            'Wapas Karein',
    undoLeft:        's baki',
    sheetSearch:     'Sheet number type karein…',
    noSheets:        'Koi sheet nahi mili.',
    sheetConsumed:   'Yeh sheet pehle hi use ho chuki hai.',
    sheetAdded:      'Sheet add ho gayi',
    pieceAdded:      'Piece log ho gaya',
    sessionEnded:    'Session khatam ho gaya',
    sessionStarted:  'Session shuru ho gaya',
    chooseJobFirst:  'Pehle Job Order chunein',
    noActiveSession: 'Koi session active nahi — naya session shuru karein.',
    actionUndone:    'Action wapas kar diya',
    nothingToUndo:   'Wapas karne ko kuch nahi (ya 30 s ka waqt guzar gaya).',
  },
};

// ── Undo stack types ────────────────────────────────────────────────────
type UndoAction =
  | { kind: 'addSheet'; tagId: string; at: number }
  | { kind: 'addPiece'; at: number }
  | { kind: 'startSession'; sessionId: string; at: number };

const UNDO_WINDOW_MS = 30_000;
const UNDO_STACK_MAX = 3;

// ── Helpers ──────────────────────────────────────────────────────────────
const fmtDuration = (startIso: string): string => {
  const ms = Date.now() - new Date(startIso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
};

// ════════════════════════════════════════════════════════════════════════
const CutterWorkbench: React.FC = () => {
  const user = useAuthStore(s => s.user);
  const profile = useAuthStore(s => s.profile);
  const company = (useAppStore(s => s.selectedCompany) as string) || 'Glassco';

  // Role gate — additional client-side check on top of route gate.
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== 'glassco_cutter' && user.role !== 'super_admin' && user.role !== 'owner' && user.role !== 'hassan' && user.role !== 'glassco_admin') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="text-center">
          <AlertTriangle size={36} className="mx-auto text-amber-500 mb-3"/>
          <p className="text-sm font-bold text-slate-700">Cutter Workbench is for the Cutter role.</p>
          <p className="text-xs text-slate-400 mt-2">Your role: <span className="font-mono">{user.role}</span></p>
        </div>
      </div>
    );
  }

  const cutterName = profile?.fullName || user.email || 'Cutter';

  // ── State ────────────────────────────────────────────────────────────
  const [lang, setLang]   = useState<Lang>(() => (localStorage.getItem('cutter_lang') as Lang) || 'en');
  const [tick, setTick]   = useState(0);                           // re-render every 5 s for duration + undo countdown
  const [activeSession, setActiveSession] = useState<CuttingSession | null>(null);
  const [showSheetDrawer, setShowSheetDrawer] = useState(false);
  const [sheetSearch, setSheetSearch] = useState('');
  const [showStartForm, setShowStartForm] = useState(false);
  const [startForm, setStartForm] = useState({ jobOrderId: '', estimatedWastagePct: 12 });
  const [showEndForm, setShowEndForm] = useState(false);
  const [endForm, setEndForm] = useState({ scrapSqft: 0, scrapWeightKg: 0, actualWastagePct: 0 });
  const undoStack = useRef<UndoAction[]>([]);
  const sheetInputRef = useRef<HTMLInputElement>(null);

  const t = T[lang];

  // 5-second tick to refresh duration + undo countdown
  useEffect(() => {
    const id = setInterval(() => setTick(x => x + 1), 5000);
    return () => clearInterval(id);
  }, []);

  // Persist language choice
  useEffect(() => { localStorage.setItem('cutter_lang', lang); }, [lang]);

  // ── Load active session for this cutter ──────────────────────────────
  const loadSession = useCallback(() => {
    const all = InventoryService.getCuttingSessions();
    const open = all.find(s => s.cutterName === cutterName && s.status === 'Open' && s.company === company);
    setActiveSession(open || null);
  }, [cutterName, company]);

  useEffect(() => { loadSession(); }, [loadSession, tick]);

  // ── Job orders for the start form ────────────────────────────────────
  const eligibleJobs: JobOrder[] = useMemo(() => {
    return ProductionService.getJobOrders().filter((j: any) =>
      (j.company === company || j.fromCompany === company) &&
      !['Completed', 'Cancelled', 'Delivered'].includes(j.status)
    ).sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
  }, [company, tick]);

  // ── Available sheets for consumption ─────────────────────────────────
  const availableSheets: GRNSheetEntry[] = useMemo(() => {
    return InventoryService.getAvailableSheetsForCompany(company);
  }, [company, tick]);

  const filteredSheets = useMemo(() => {
    const q = sheetSearch.trim().toUpperCase();
    if (!q) return availableSheets.slice(0, 30);
    return availableSheets.filter(s =>
      s.tagId.toUpperCase().includes(q) ||
      (s.sheetSize || '').includes(q) ||
      (s.thickness || '').includes(q)
    ).slice(0, 30);
  }, [availableSheets, sheetSearch]);

  // ── Today's sqft (cumulative across cutter's closed sessions today) ──
  const sqftToday = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const all = InventoryService.getCuttingSessions();
    let sum = 0;
    all.forEach(s => {
      if (s.cutterName !== cutterName) return;
      if (!s.startTime || !s.startTime.startsWith(today)) return;
      // approx sqft = (sheets × sqft/sheet) − scrap
      const sheetSqft = (s.sheetsScanned || []).reduce((acc, sc) => {
        const ge = availableSheets.find(g => g.tagId === sc.tagId);
        return acc + (ge?.sqftPerSheet || 0);
      }, 0);
      sum += Math.max(0, sheetSqft - (s.scrapSqft || 0));
    });
    return Math.round(sum);
  }, [cutterName, availableSheets, tick]);

  const recentScans = useMemo(() => {
    if (!activeSession) return [];
    return [...(activeSession.sheetsScanned || [])].reverse().slice(0, 5);
  }, [activeSession, tick]);

  // ── Undo stack helpers ────────────────────────────────────────────────
  const pushUndo = (a: UndoAction) => {
    undoStack.current.push(a);
    if (undoStack.current.length > UNDO_STACK_MAX) {
      undoStack.current.shift();
    }
  };
  const lastUndoable = (): UndoAction | null => {
    const top = undoStack.current[undoStack.current.length - 1];
    if (!top) return null;
    if (Date.now() - top.at > UNDO_WINDOW_MS) return null;
    return top;
  };
  const undoSecondsLeft = (): number => {
    const top = lastUndoable();
    if (!top) return 0;
    return Math.max(0, Math.ceil((UNDO_WINDOW_MS - (Date.now() - top.at)) / 1000));
  };

  // ── ACTION: Start session ─────────────────────────────────────────────
  const handleStartSession = () => {
    if (!startForm.jobOrderId) { toast.error(t.chooseJobFirst); return; }
    const job = eligibleJobs.find(j => j.id === startForm.jobOrderId);
    if (!job) return;
    const session: CuttingSession = {
      id: `CS-${(company as string).substring(0, 3).toUpperCase()}-${Date.now().toString().slice(-6)}`,
      company: company as any,
      jobOrderId: startForm.jobOrderId,
      cutterId: user.id || cutterName,
      cutterName,
      startTime: new Date().toISOString(),
      status: 'Open',
      sheetsScanned: [],
      piecesProduced: 0,
      remnantsCreated: [],
      scrapSqft: 0,
      scrapWeightKg: 0,
      estimatedWastagePct: startForm.estimatedWastagePct,
    };
    const all = InventoryService.getCuttingSessions();
    InventoryService.saveCuttingSessions([...all, session]);
    setActiveSession(session);
    setShowStartForm(false);
    setStartForm({ jobOrderId: '', estimatedWastagePct: 12 });
    pushUndo({ kind: 'startSession', sessionId: session.id, at: Date.now() });
    toast.success(t.sessionStarted);
  };

  // ── ACTION: Enter sheet number (open drawer) ─────────────────────────
  const handleOpenSheetDrawer = () => {
    if (!activeSession) {
      toast.error(t.noActiveSession);
      return;
    }
    setShowSheetDrawer(true);
    setSheetSearch('');
    setTimeout(() => sheetInputRef.current?.focus(), 100);
  };

  const handleSelectSheet = async (sheet: GRNSheetEntry) => {
    if (!activeSession) return;
    if (sheet.consumedInSessionId) {
      toast.error(t.sheetConsumed);
      return;
    }

    // Atomic consume via Sprint-0 RPC. Returns row on success or error message.
    const { error } = await InventoryService.consumeSheet(
      sheet.tagId,
      activeSession.id,
      company,
      cutterName
    );
    if (error) {
      toast.error(`${t.sheetConsumed} (${error})`);
      return;
    }

    // Add scan record + persist updated session locally
    const updated: CuttingSession = {
      ...activeSession,
      sheetsScanned: [
        ...(activeSession.sheetsScanned || []),
        {
          tagId: sheet.tagId,
          scannedAt: new Date().toISOString(),
          isDefective: sheet.status === 'Defective' || sheet.status === 'Broken',
        },
      ],
    };
    InventoryService.upsertCuttingSession(updated);
    setActiveSession(updated);
    setShowSheetDrawer(false);
    setSheetSearch('');
    pushUndo({ kind: 'addSheet', tagId: sheet.tagId, at: Date.now() });
    toast.success(`${t.sheetAdded}: ${sheet.tagId}`);
  };

  // ── ACTION: Add piece ─────────────────────────────────────────────────
  const handleAddPiece = () => {
    if (!activeSession) {
      toast.error(t.noActiveSession);
      return;
    }
    const updated: CuttingSession = {
      ...activeSession,
      piecesProduced: (activeSession.piecesProduced || 0) + 1,
    };
    InventoryService.upsertCuttingSession(updated);
    setActiveSession(updated);
    pushUndo({ kind: 'addPiece', at: Date.now() });
    toast.success(t.pieceAdded);
  };

  // ── ACTION: End session ───────────────────────────────────────────────
  const handleEndSession = () => {
    if (!activeSession) return;
    const sheetSqft = (activeSession.sheetsScanned || []).reduce((acc, sc) => {
      const ge = availableSheets.find(g => g.tagId === sc.tagId);
      return acc + (ge?.sqftPerSheet || 0);
    }, 0);
    setEndForm({
      scrapSqft: 0,
      scrapWeightKg: 0,
      actualWastagePct: sheetSqft > 0
        ? Number(Math.min(99, Math.max(0, activeSession.estimatedWastagePct || 0)).toFixed(1))
        : 0,
    });
    setShowEndForm(true);
  };

  const confirmEndSession = () => {
    if (!activeSession) return;
    const variance = endForm.actualWastagePct - (activeSession.estimatedWastagePct || 0);
    const updated: CuttingSession = {
      ...activeSession,
      status: 'Closed',
      endTime: new Date().toISOString(),
      scrapSqft: endForm.scrapSqft,
      scrapWeightKg: endForm.scrapWeightKg,
      actualWastagePct: endForm.actualWastagePct,
      wastageVariancePct: variance,
      supervisorSignOff: Math.abs(variance) > 5 ? 'PENDING' : undefined,
    };
    InventoryService.upsertCuttingSession(updated);
    setActiveSession(null);
    setShowEndForm(false);
    undoStack.current = []; // clear undo on session close — irreversible
    if (Math.abs(variance) > 5) {
      toast.warning(`${t.sessionEnded} — variance ${variance > 0 ? '+' : ''}${variance.toFixed(1)}% (supervisor sign-off pending)`);
    } else {
      toast.success(t.sessionEnded);
    }
  };

  // ── ACTION: Undo last ─────────────────────────────────────────────────
  const handleUndo = () => {
    const last = lastUndoable();
    if (!last) {
      toast.error(t.nothingToUndo);
      return;
    }
    if (!activeSession && last.kind !== 'startSession') return;

    if (last.kind === 'addPiece' && activeSession) {
      const updated: CuttingSession = {
        ...activeSession,
        piecesProduced: Math.max(0, (activeSession.piecesProduced || 0) - 1),
      };
      InventoryService.upsertCuttingSession(updated);
      setActiveSession(updated);
    } else if (last.kind === 'addSheet' && activeSession) {
      // Remove the last scan; can't easily un-consume the GRN entry
      // server-side, so we just unhook it from this session locally.
      // (A real DB-side reverse would need a separate `release_grn_sheet`
      //  RPC — Sprint 8 candidate.)
      const updated: CuttingSession = {
        ...activeSession,
        sheetsScanned: (activeSession.sheetsScanned || []).filter(s => s.tagId !== last.tagId),
      };
      InventoryService.upsertCuttingSession(updated);
      setActiveSession(updated);
    } else if (last.kind === 'startSession') {
      // Hard-delete the session if it's still empty + freshly started.
      const all = InventoryService.getCuttingSessions();
      const session = all.find(s => s.id === last.sessionId);
      if (session && (session.sheetsScanned || []).length === 0 && (session.piecesProduced || 0) === 0) {
        InventoryService.saveCuttingSessions(all.filter(s => s.id !== last.sessionId));
        setActiveSession(null);
      } else {
        toast.error('Cannot undo session start — work has been logged.');
        return;
      }
    }
    undoStack.current.pop();
    toast.success(t.actionUndone);
  };

  const undoSec = undoSecondsLeft();
  const hasUndo = undoSec > 0;

  // ── Render ────────────────────────────────────────────────────────────
  // Mobile-first; all interactive surfaces ≥ 60×60 px; font ≥ 16 px.
  return (
    <div className="min-h-screen bg-slate-50 pb-32" style={{ fontSize: 16 }}>
      {/* Sticky header */}
      <header className="sticky top-0 z-30 bg-slate-900 text-white px-4 py-3 shadow">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] text-slate-300 font-bold uppercase tracking-widest">{t.title}</p>
            <p className="text-base font-black truncate">{cutterName}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[11px] text-slate-300 font-bold uppercase">{t.sqftToday}</p>
            <p className="text-xl font-black text-emerald-400">{sqftToday}</p>
          </div>
          <button
            onClick={() => setLang(lang === 'en' ? 'ur' : 'en')}
            className="ml-2 shrink-0 bg-white/10 hover:bg-white/20 text-white rounded-xl px-3 py-2 text-[12px] font-black flex items-center gap-1"
            title="Toggle Urdu / English"
            aria-label="Toggle language"
          >
            <Globe size={14}/> {lang === 'en' ? 'اردو' : 'EN'}
          </button>
        </div>
      </header>

      {/* Active session card */}
      <div className="px-4 py-4">
        {activeSession ? (
          <div className="bg-white rounded-2xl border-2 border-emerald-200 shadow p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="text-[11px] font-black text-emerald-700 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/>{t.activeSession}
                </p>
                <p className="text-sm font-black text-slate-800 truncate font-mono">{activeSession.id}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] font-black text-slate-400 uppercase">{t.duration}</p>
                <p className="text-lg font-black text-slate-800 flex items-center gap-1"><Clock size={14}/>{fmtDuration(activeSession.startTime)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-slate-50 rounded-xl py-2">
                <p className="text-[10px] font-black text-slate-400 uppercase">{t.sheets}</p>
                <p className="text-2xl font-black text-slate-800">{(activeSession.sheetsScanned || []).length}</p>
              </div>
              <div className="bg-slate-50 rounded-xl py-2">
                <p className="text-[10px] font-black text-slate-400 uppercase">{t.pieces}</p>
                <p className="text-2xl font-black text-slate-800">{activeSession.piecesProduced || 0}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center">
            <Target size={28} className="mx-auto text-slate-300 mb-2"/>
            <p className="text-sm font-bold text-slate-500">{t.noActiveSession}</p>
          </div>
        )}
      </div>

      {/* 3 main action buttons — 60×60+ , single-thumb */}
      <div className="px-4 space-y-3">
        {activeSession ? (
          <>
            <button
              onClick={handleOpenSheetDrawer}
              className="w-full min-h-[60px] bg-blue-600 active:bg-blue-700 text-white rounded-2xl shadow-lg flex items-center gap-3 px-5 py-4 text-base font-black uppercase tracking-wider"
            >
              <ScanLine size={24}/> <span className="text-left flex-1">{t.enterSheet}</span> <span className="text-[11px] opacity-70">*</span>
            </button>
            <button
              onClick={handleAddPiece}
              className="w-full min-h-[60px] bg-emerald-600 active:bg-emerald-700 text-white rounded-2xl shadow-lg flex items-center gap-3 px-5 py-4 text-base font-black uppercase tracking-wider"
            >
              <Plus size={24}/> <span className="text-left flex-1">{t.addPiece}</span>
            </button>
            <button
              onClick={handleEndSession}
              className="w-full min-h-[60px] bg-rose-600 active:bg-rose-700 text-white rounded-2xl shadow-lg flex items-center gap-3 px-5 py-4 text-base font-black uppercase tracking-wider"
            >
              <Square size={24}/> <span className="text-left flex-1">{t.endSession}</span>
            </button>
          </>
        ) : (
          <button
            onClick={() => setShowStartForm(true)}
            className="w-full min-h-[60px] bg-emerald-600 active:bg-emerald-700 text-white rounded-2xl shadow-lg flex items-center gap-3 px-5 py-4 text-base font-black uppercase tracking-wider"
          >
            <Play size={24}/> <span className="text-left flex-1">{t.startSession}</span>
          </button>
        )}

        {/* Undo last (30s window) */}
        {hasUndo && (
          <button
            onClick={handleUndo}
            className="w-full min-h-[48px] bg-amber-50 active:bg-amber-100 text-amber-800 border-2 border-amber-200 rounded-2xl flex items-center justify-center gap-2 px-4 py-3 text-sm font-black uppercase"
          >
            <Undo2 size={18}/> {t.undo} <span className="text-xs opacity-70">({undoSec}{t.undoLeft})</span>
          </button>
        )}
      </div>

      {/* Recent activity */}
      {activeSession && recentScans.length > 0 && (
        <div className="px-4 mt-5">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">{t.recent}</p>
          <div className="space-y-2">
            {recentScans.map((scan, i) => {
              const ge = availableSheets.find(g => g.tagId === scan.tagId);
              return (
                <div key={`${scan.tagId}-${i}`} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${scan.isDefective ? 'bg-amber-50 border border-amber-200' : 'bg-white border border-slate-200'}`}>
                  {scan.isDefective ? <AlertTriangle size={16} className="text-amber-500 shrink-0"/> : <CheckCircle2 size={16} className="text-emerald-500 shrink-0"/>}
                  <div className="min-w-0 flex-1">
                    <p className="font-mono font-black text-sm text-slate-800 truncate">{scan.tagId}</p>
                    <p className="text-[11px] text-slate-500 font-bold">{ge?.thickness || ''} · {(ge?.sqftPerSheet || 0).toFixed(1)} sqft</p>
                  </div>
                  <span className="text-[11px] text-slate-400 font-bold shrink-0">{new Date(scan.scannedAt).toLocaleTimeString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Sheet drawer (autocomplete) ── */}
      {showSheetDrawer && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-end" onClick={() => setShowSheetDrawer(false)}>
          <div className="w-full bg-white rounded-t-3xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <p className="text-base font-black uppercase">{t.enterSheet}</p>
              <button onClick={() => setShowSheetDrawer(false)} className="p-2 hover:bg-slate-100 rounded-full" aria-label="Close"><X size={20}/></button>
            </div>
            <div className="px-5 py-3 border-b">
              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"/>
                <input
                  ref={sheetInputRef}
                  type="text"
                  className="w-full pl-12 pr-4 py-4 text-base font-mono font-bold uppercase border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none"
                  placeholder={t.sheetSearch}
                  value={sheetSearch}
                  onChange={e => setSheetSearch(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="overflow-y-auto p-3 space-y-2">
              {filteredSheets.length === 0 && (
                <p className="text-center text-slate-300 italic py-8 text-sm font-bold">{t.noSheets}</p>
              )}
              {filteredSheets.map(s => (
                <button
                  key={s.tagId}
                  onClick={() => handleSelectSheet(s)}
                  className={`w-full min-h-[64px] flex items-center gap-3 px-4 py-3 rounded-xl border-2 ${s.status === 'OK' ? 'bg-white border-slate-200 active:bg-slate-100' : 'bg-amber-50 border-amber-200 active:bg-amber-100'}`}
                >
                  <Hash size={18} className={s.status === 'OK' ? 'text-blue-500' : 'text-amber-600'}/>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="font-mono font-black text-sm text-slate-800 truncate">{s.tagId}</p>
                    <p className="text-[11px] text-slate-500 font-bold">{s.thickness} · {s.sheetSize} · {s.sqftPerSheet.toFixed(1)} sqft</p>
                  </div>
                  {s.status !== 'OK' && (
                    <span className="text-[10px] font-black text-amber-700 bg-amber-100 px-2 py-1 rounded shrink-0 uppercase">{s.status}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Start session form ── */}
      {showStartForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-end" onClick={() => setShowStartForm(false)}>
          <div className="w-full bg-white rounded-t-3xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <p className="text-base font-black uppercase">{t.startSession}</p>
            <div>
              <label className="text-xs font-black uppercase text-slate-500 block mb-1">{t.selectJob} *</label>
              <select className="w-full px-4 py-4 text-base border-2 border-slate-200 rounded-xl font-bold" value={startForm.jobOrderId} onChange={e => setStartForm(p => ({ ...p, jobOrderId: e.target.value }))}>
                <option value="">— {t.selectJob} —</option>
                {eligibleJobs.map((j: any) => (
                  <option key={j.id} value={j.id}>{j.orderNo || j.id} — {j.projectName || j.subject || 'No name'}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-black uppercase text-slate-500 block mb-1">{t.estWastage}</label>
              <input
                type="number" min={0} max={50} step={0.5}
                className="w-full px-4 py-4 text-base border-2 border-slate-200 rounded-xl font-bold"
                value={startForm.estimatedWastagePct}
                onChange={e => setStartForm(p => ({ ...p, estimatedWastagePct: Number(e.target.value) }))}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowStartForm(false)} className="flex-1 min-h-[56px] border-2 border-slate-200 rounded-xl text-base font-black text-slate-600 uppercase">{t.cancel}</button>
              <button onClick={handleStartSession} className="flex-1 min-h-[56px] bg-emerald-600 text-white rounded-xl text-base font-black uppercase active:bg-emerald-700">{t.confirm}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── End session form ── */}
      {showEndForm && activeSession && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-end" onClick={() => setShowEndForm(false)}>
          <div className="w-full bg-white rounded-t-3xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <p className="text-base font-black uppercase">{t.endSession} — {activeSession.id}</p>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-slate-50 rounded-xl py-2"><p className="text-[10px] font-black text-slate-400 uppercase">{t.sheets}</p><p className="text-xl font-black">{(activeSession.sheetsScanned || []).length}</p></div>
              <div className="bg-slate-50 rounded-xl py-2"><p className="text-[10px] font-black text-slate-400 uppercase">{t.pieces}</p><p className="text-xl font-black">{activeSession.piecesProduced || 0}</p></div>
            </div>
            <div>
              <label className="text-xs font-black uppercase text-slate-500 block mb-1">{t.scrapSqft} *</label>
              <input type="number" min={0} step={0.1}
                className="w-full px-4 py-4 text-base border-2 border-slate-200 rounded-xl font-bold"
                value={endForm.scrapSqft || ''}
                onChange={e => setEndForm(p => ({ ...p, scrapSqft: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-xs font-black uppercase text-slate-500 block mb-1">{t.scrapWeight}</label>
              <input type="number" min={0} step={0.1}
                className="w-full px-4 py-4 text-base border-2 border-slate-200 rounded-xl font-bold"
                value={endForm.scrapWeightKg || ''}
                onChange={e => setEndForm(p => ({ ...p, scrapWeightKg: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-xs font-black uppercase text-slate-500 block mb-1">{t.actualWastage}</label>
              <input type="number" min={0} max={99} step={0.1}
                className="w-full px-4 py-4 text-base border-2 border-slate-200 rounded-xl font-bold"
                value={endForm.actualWastagePct || ''}
                onChange={e => setEndForm(p => ({ ...p, actualWastagePct: Number(e.target.value) }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowEndForm(false)} className="flex-1 min-h-[56px] border-2 border-slate-200 rounded-xl text-base font-black text-slate-600 uppercase">{t.cancel}</button>
              <button onClick={confirmEndSession} className="flex-1 min-h-[56px] bg-rose-600 text-white rounded-xl text-base font-black uppercase active:bg-rose-700">{t.confirm}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CutterWorkbench;
