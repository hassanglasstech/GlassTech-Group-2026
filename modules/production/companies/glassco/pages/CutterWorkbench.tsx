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
import { deriveServiceBuckets } from '../serviceRouting';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { ProductionService } from '@/modules/production/services/productionService';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { HRService } from '@/modules/hr/services/hrService';
import { CuttingSession, GRNSheetEntry } from '@/modules/procurement/types/inventory';
import { JobOrder } from '@/modules/production/types/production';
import { toast } from 'sonner';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';
import {
  ScanLine, Plus, Square, Search, X, CheckCircle2, AlertTriangle,
  Globe, Undo2, Play, Hash, Clock, Target, Loader2, Eye, History, Scissors,
  Ban, Image as ImageIcon,
} from 'lucide-react';
import { ProductionPiece, QuotationItem } from '@/modules/shared/types';
import { CutPlanTab } from '@/modules/production/companies/glassco/components/workbench/CutPlanTab';
import { supabase } from '@/src/services/supabaseClient';

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

  const actorName = profile?.fullName || user?.email || 'Cutter';   // logged-in user (audit actor)
  const isPrivileged = ['super_admin', 'owner', 'hassan', 'glassco_admin'].includes(user?.role || '');
  const [actAsCutter, setActAsCutter] = useState('');
  // Effective cutter — a privileged user (super_admin) can record on behalf of a
  // cutter (labour not on the app yet). All queue/attribution/session logic uses
  // this; the audit actor (p_changed_by) stays the real logged-in user.
  const cutterName = isPrivileged && actAsCutter ? actAsCutter : actorName;

  // Cutter identity is cross-source: a job's assignedCutter is the HR employee
  // name (employees.personal.name) while cutterName is the auth profile.fullName
  // / email. Normalize (trim + case-insensitive) so a trivial spelling/whitespace
  // difference doesn't hide a cutter's own queue. Empty never matches a name.
  const sameName = (a?: string, b?: string): boolean => {
    const x = (a || '').trim().toLowerCase();
    const y = (b || '').trim().toLowerCase();
    return x !== '' && x === y;
  };

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
  // Cloud-backed: the old ProductionService.getJobOrders() read a localStorage
  // store that is empty on a fresh route, so the cutter couldn't pick a job and
  // could not start a session. Load active orders from the cloud, and warm the
  // session + sheet caches so the sync getters below have data.
  const [jobs, setJobs] = useState<JobOrder[]>([]);
  const [pieces, setPieces] = useState<ProductionPiece[]>([]);
  const [cutting, setCutting] = useState<string | null>(null);
  const [assigningRecut, setAssigningRecut] = useState<string | null>(null);
  const [planJob, setPlanJob] = useState<string | null>(null);   // orderId whose cut plan is open
  const [imageJob, setImageJob] = useState<string | null>(null); // orderId whose design images are open
  const [breaking, setBreaking] = useState<string | null>(null); // piece id being marked broken
  const [hrCutters, setHrCutters] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [ords, pcs] = await Promise.all([
          AsyncSalesService.getQuotations(),
          ProductionService.getProductionPiecesAsync(),
          InventoryService.getCuttingSessionsAsync(),
          InventoryService.getGRNSheetEntriesAsync(),
        ]);
        if (!alive) return;
        setJobs(ords as JobOrder[]);
        setPieces(pcs);
        setTick(x => x + 1); // re-read the now-warm session/sheet caches
      } catch {
        if (alive) { setJobs(ProductionService.getJobOrders()); setPieces(ProductionService.getProductionPieces()); }
      }
      // Privileged users get the "act as cutter" picker — list HR cutters
      // (tagged "Cutter"/"Senior Cutter", with a legacy designation fallback).
      if (isPrivileged) {
        try {
          await HRService.loadCache();
          if (!alive) return;
          setHrCutters(HRService.getCutterNames(company));
        } catch { /* picker stays empty */ }
      }
    })();
    return () => { alive = false; };
  }, [company, isPrivileged]);

  const eligibleJobs: JobOrder[] = useMemo(() => {
    const ACTIVE = ['Approved', 'Invoiced', 'Partial Payment'];
    return jobs.filter((j: any) =>
      (!j.company || j.company === company) && ACTIVE.includes(j.status)
    ).sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
  }, [jobs, company]);

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

  // ── Cut Queue — pieces this cutter must cut ──
  //   Pending-Cut: explicit per-piece assignedCutter wins; '' = supervisor pool
  //   (not mine); undefined = inherit the job-level assignment. Plus recut pieces
  //   (QC-Failed + Recut) that the supervisor has EXPLICITLY re-assigned to me
  //   from the pool (D3) — recuts never inherit the job-level cutter.
  const cutQueue = useMemo(() => {
    const refs = new Set<string>();
    jobs.forEach(j => {
      if (sameName(j.assignedCutter, cutterName)) {
        if (j.orderNo) refs.add(j.orderNo);
        if (j.id) refs.add(j.id);
      }
    });
    return pieces.filter(p => {
      if (p.status === 'QC-Failed' && p.fault?.disposal === 'Recut') return sameName(p.assignedCutter, cutterName);
      if (p.status !== 'Pending-Cut') return false;
      if (p.assignedCutter === '') return false;                       // explicit pool (recut cleared)
      if (p.assignedCutter) return sameName(p.assignedCutter, cutterName);   // explicit per-piece
      return refs.has(p.orderId);                                      // inherit job-level
    });
  }, [jobs, pieces, cutterName]);

  const cutQueueByJob = useMemo(() => {
    const m = new Map<string, ProductionPiece[]>();
    cutQueue.forEach(p => { const arr = m.get(p.orderId) || []; arr.push(p); m.set(p.orderId, arr); });
    return [...m.entries()];
  }, [cutQueue]);

  // ── Queue summary + per-piece size + per-job due (so the cutter's LIST says
  //    at a glance: how much work, how much glass, how much time is left) ──
  type JobDueLike = { dueDate?: string; items?: Array<{ width?: number | string; height?: number | string }> };
  const jobFor = useCallback((orderId: string): (JobOrder & JobDueLike) | undefined =>
    jobs.find(j => (j as JobOrder & { orderNo?: string }).orderNo === orderId || j.id === orderId) as (JobOrder & JobDueLike) | undefined,
  [jobs]);
  const daysLeftOf = (orderId: string): number | null => {
    const due = jobFor(orderId)?.dueDate; if (!due) return null;
    const d = new Date(due).getTime(); if (isNaN(d)) return null;
    return Math.round((d - Date.now()) / 86400000);
  };
  const sizeOf = (p: ProductionPiece): string => {
    const it = jobFor(p.orderId)?.items?.[p.itemIndex];
    const w = Number(it?.width) || 0, h = Number(it?.height) || 0;
    return (w || h) ? `${w}" × ${h}"` : '';
  };
  const queueStats = useMemo(() => {
    const sqft = Math.round(cutQueue.reduce((s, p) => s + (Number(p.sqft ?? p.totalSqFt) || 0), 0));
    let nextDue: number | null = null;
    cutQueueByJob.forEach(([orderId]) => {
      const dl = daysLeftOf(orderId);
      if (dl !== null && (nextDue === null || dl < nextDue)) nextDue = dl;
    });
    return { pcs: cutQueue.length, sqft, nextDue };
  }, [cutQueue, cutQueueByJob, jobs]);
  const dueTone = (dl: number | null): string =>
    dl === null ? 'text-slate-400' : dl < 0 ? 'text-rose-600' : dl <= 1 ? 'text-amber-600' : 'text-slate-500';
  const dueText = (dl: number | null): string =>
    dl === null ? 'no due' : dl < 0 ? `${-dl}d late` : dl === 0 ? 'due today' : `${dl}d left`;

  // ── My cuts today (D1) — pieces this cutter is CREDITED for today (cutBy),
  //    regardless of who keyed them. So even while the supervisor records on the
  //    cutter's behalf, the cutter sees their own work; `assignedBy` (when ≠ the
  //    cutter) tells them it was logged by someone else. Recent-first. ──
  const myCutsToday = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return pieces
      .filter(p => sameName(p.cutBy, cutterName) && (p.cutAt || '').startsWith(today))
      .sort((a, b) => (b.cutAt || '').localeCompare(a.cutAt || ''))
      .slice(0, 20);
  }, [pieces, cutterName]);

  // ── Recut pool (D3) — QC-Failed pieces marked Recut that are NOT yet assigned
  //    to a cutter. The supervisor redistributes these; a recut never auto-returns
  //    to the cutter who made it (its per-piece cutter was cleared on QC-fail). ──
  const recutPool = useMemo(() =>
    pieces.filter(p => p.status === 'QC-Failed' && p.fault?.disposal === 'Recut' && !p.assignedCutter),
  [pieces]);

  // ── Allotment roster (privileged) — every cutter + their still-to-cut count ─
  // Lets the recorder see ALL cutters and how many Pending-Cut pieces are
  // allotted to each (jobs assigned to them). Unassigned Pending-Cut pieces are
  // shown as a "pool" so partial / not-yet-assigned work stays visible.
  const allotment = useMemo(() => {
    const refsByCutter = new Map<string, Set<string>>();
    jobs.forEach(j => {
      if (!j.assignedCutter) return;
      const set = refsByCutter.get(j.assignedCutter) || new Set<string>();
      if (j.orderNo) set.add(j.orderNo);
      if (j.id) set.add(j.id);
      refsByCutter.set(j.assignedCutter, set);
    });
    const counts = new Map<string, number>();
    let unassigned = 0;
    pieces.forEach(p => {
      if (p.status !== 'Pending-Cut') return;
      let matched = false;
      refsByCutter.forEach((refs, cutter) => {
        if (refs.has(p.orderId)) { counts.set(cutter, (counts.get(cutter) || 0) + 1); matched = true; }
      });
      if (!matched) unassigned += 1;
    });
    const names = [...new Set([...hrCutters, ...refsByCutter.keys()])].sort((a, b) => a.localeCompare(b));
    return { rows: names.map(n => ({ name: n, pending: counts.get(n) || 0 })), unassigned };
  }, [jobs, pieces, hrCutters]);

  // Cut one piece: Pending-Cut → Cut + cutBy/cutAt, via the atomic RPC.
  // D1 (supervisor-logs-on-behalf): the piece is CREDITED to cutterName (cutBy),
  // while assignedBy records the actual operator who keyed it — so the entry
  // surfaces on the cutter's own account, and the board can show "logged by X"
  // for anything the cutter did not enter themselves.
  const cutPiece = async (piece: ProductionPiece): Promise<void> => {
    setCutting(piece.id);
    const nowIso = new Date().toISOString();
    const onBehalf = actorName !== cutterName;
    const attribution = onBehalf ? { assignedBy: actorName, assignedAt: nowIso } : {};
    try {
      const { error } = await supabase.rpc('update_piece_status_atomic', {
        p_piece_id:   piece.id,
        p_new_status: 'Cut',
        p_changed_by: actorName,
        p_reason:     onBehalf ? `recorded by ${actorName}` : null,
        p_extra:      { cutBy: cutterName, cutAt: nowIso, ...attribution },
      });
      if (error) {
        toast.error(`Cut failed: ${error.message}`, { duration: 7000 });
        setCutting(null);
        return;
      }
      setPieces(prev => prev.map(p => p.id === piece.id ? { ...p, status: 'Cut' as const, cutBy: cutterName, cutAt: nowIso, ...attribution } : p));
      toast.success(onBehalf ? `Piece ${piece.id} cut — credited to ${cutterName}` : `Piece ${piece.id} cut`);

      // Auto-route the freshly-cut piece into the workflow so it does not sit at
      // 'Cut': to the Service Floor (Service-Pending + pendingServices) if the
      // order line needs services, else straight to QC-Pending. Best-effort — if
      // this second hop fails the piece stays 'Cut' and can be advanced later.
      const order = jobs.find(j => j.orderNo === piece.orderId || j.id === piece.orderId);
      const buckets = deriveServiceBuckets(order?.items?.[piece.itemIndex]);
      const routed = buckets.length > 0 ? 'Service-Pending' : 'QC-Pending';
      try {
        const { error: routeErr } = await supabase.rpc('update_piece_status_atomic', {
          p_piece_id:   piece.id,
          p_new_status: routed,
          p_changed_by: actorName,
          p_reason:     'auto-route after cut',
          p_extra:      buckets.length > 0 ? { pendingServices: buckets } : {},
        });
        if (!routeErr) {
          setPieces(prev => prev.map(p => p.id === piece.id
            ? { ...p, status: routed as ProductionPiece['status'], ...(buckets.length > 0 ? { pendingServices: buckets } : {}) }
            : p));
        }
      } catch { /* stays 'Cut' — advance from QC/board later */ }
    } catch (e) {
      toast.error(`Cut error: ${e instanceof Error ? e.message : 'unknown'}`, { duration: 7000 });
    }
    setCutting(null);
  };

  // Break a piece during cutting (glass shattered on the table). Pending-Cut →
  // Broken (universal transition). Records who broke it + the size on the piece
  // data. A replacement is re-generated for the order (Generate pieces backfills
  // the shortfall) — Broken is terminal, so the count drops out of the cut queue.
  const breakPiece = async (piece: ProductionPiece): Promise<void> => {
    if (!(await confirmModal(`Mark ${piece.id} as BROKEN?\n\n${piece.specs || ''}\n\nIt leaves the cut queue. Re-generate the job's pieces to cut a replacement.`))) return;
    setBreaking(piece.id);
    const nowIso = new Date().toISOString();
    try {
      const { error } = await supabase.rpc('update_piece_status_atomic', {
        p_piece_id:   piece.id,
        p_new_status: 'Broken',
        p_changed_by: actorName,
        p_reason:     `broken at cutting by ${cutterName}`,
        p_extra:      { brokenBy: cutterName, brokenAt: nowIso, brokenSpecs: piece.specs || '' },
      });
      if (error) { toast.error(`Break failed: ${error.message}`, { duration: 8000 }); setBreaking(null); return; }
      setPieces(prev => prev.map(p => p.id === piece.id ? { ...p, status: 'Broken' as const } : p));
      toast.success(`${piece.id} marked broken`);
    } catch (e) {
      toast.error(`Break error: ${e instanceof Error ? e.message : 'unknown'}`, { duration: 8000 });
    }
    setBreaking(null);
  };

  // D3 — supervisor redistributes a recut-pool piece to a cutter. Reuses the
  // same-status reassign (QC-Failed → QC-Failed no-op carries the per-piece
  // assignedCutter in data); the cutter then re-cuts it via the normal Cut path.
  const assignRecut = async (piece: ProductionPiece, toCutter: string): Promise<void> => {
    if (!toCutter) return;
    setAssigningRecut(piece.id);
    try {
      const { moved, failed, error } = await ProductionService.reassignRemainingPieces([piece], undefined, toCutter, actorName);
      if (moved > 0) {
        setPieces(prev => prev.map(p => p.id === piece.id ? { ...p, assignedCutter: toCutter } : p));
        toast.success(`Recut ${piece.id} → ${toCutter}`);
      } else {
        toast.error(`Could not assign recut${error ? `: ${error}` : failed ? ` (${failed} failed)` : ''}`, { duration: 9000 });
      }
    } catch (e) {
      toast.error(`Recut assignment failed: ${e instanceof Error ? e.message : 'unknown error'}`, { duration: 9000 });
    }
    setAssigningRecut(null);
  };

  // Role gate — placed AFTER all hooks so hook order stays stable across renders
  // (react-hooks/rules-of-hooks). Client-side check on top of the route gate.
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
    <div className="min-h-screen bg-slate-50 pb-32 max-w-3xl md:max-w-4xl mx-auto md:border-x md:border-slate-200 md:shadow-sm" style={{ fontSize: 16 }}>
      {/* Sticky header */}
      <header className="sticky top-0 z-30 bg-slate-900 text-white px-4 py-3 shadow">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-2xs text-slate-300 font-bold uppercase tracking-widest">{t.title}</p>
            <p className="text-base font-black truncate">{cutterName}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xs text-slate-300 font-bold uppercase">{t.sqftToday}</p>
            <p className="text-xl font-black text-emerald-400">{sqftToday}</p>
          </div>
          <button
            onClick={() => setLang(lang === 'en' ? 'ur' : 'en')}
            className="ml-2 shrink-0 bg-white/10 hover:bg-white/20 text-white rounded-xl px-3 py-2 text-label font-black flex items-center gap-1"
            title="Toggle Urdu / English"
            aria-label="Toggle language"
          >
            <Globe size={14}/> {lang === 'en' ? 'اردو' : 'EN'}
          </button>
        </div>
      </header>

      {/* Act-as-cutter (privileged) — record on behalf of a cutter while labour is not yet on the app */}
      {isPrivileged && (
        <div className="px-4 pt-3">
          <div className="bg-indigo-50 border border-indigo-200 rounded-card p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xs font-black uppercase tracking-widest text-indigo-700 inline-flex items-center gap-1"><Eye size={12}/> Act as cutter</span>
              <select value={actAsCutter} onChange={e => setActAsCutter(e.target.value)}
                className="sap-input px-2 py-1 text-sm rounded-control border border-indigo-200 flex-1 min-w-[10rem]">
                <option value="">— Myself ({actorName}) —</option>
                {allotment.rows.map(r => (
                  <option key={r.name} value={r.name}>{r.name}{r.pending ? ` — ${r.pending} to cut` : ''}</option>
                ))}
              </select>
              {actAsCutter && <span className="text-2xs font-black text-indigo-700">Recording as {actAsCutter}</span>}
            </div>
            {/* Roster: all cutters + their allotted (Pending-Cut) pieces; click to switch */}
            {allotment.rows.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {allotment.rows.map(r => (
                  <button key={r.name} onClick={() => setActAsCutter(r.name)}
                    className={`text-2xs font-black px-2 py-1 rounded-full border inline-flex items-center gap-1 ${actAsCutter === r.name ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-100'}`}>
                    {r.name} <span className="opacity-70">· {r.pending}</span>
                  </button>
                ))}
                {allotment.unassigned > 0 && (
                  <span className="text-2xs font-black px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200" title="Pending-Cut pieces not yet assigned to any cutter — assign on the Job Orders screen">
                    Pool (unassigned) · {allotment.unassigned}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recut pool (D3) — supervisor redistributes QC-rejected pieces to a cutter */}
      {isPrivileged && recutPool.length > 0 && (
        <div className="px-4 pt-3">
          <div className="bg-rose-50 border border-rose-200 rounded-card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xs font-black uppercase tracking-widest text-rose-700 inline-flex items-center gap-1"><AlertTriangle size={12}/> Recut Pool — reassign rejected pieces</span>
              <span className="text-2xs font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">{recutPool.length}</span>
            </div>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {recutPool.map(p => {
                const prev = p.prevCutters?.[p.prevCutters.length - 1];
                return (
                  <div key={p.id} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-rose-100">
                    <div className="min-w-0 flex-1">
                      <p className="text-label font-black text-slate-800 font-mono truncate">{p.id}</p>
                      <p className="text-2xs text-slate-500 truncate">{p.specs}</p>
                      <p className="text-2xs font-bold text-rose-600 truncate">{p.fault?.description || 'Recut'}{prev ? ` · was ${prev}` : ''}</p>
                    </div>
                    <select
                      defaultValue=""
                      disabled={assigningRecut === p.id}
                      onChange={e => assignRecut(p, e.target.value)}
                      className="sap-input px-2 py-1 text-2xs rounded-control border border-rose-200 w-32 shrink-0 disabled:opacity-50"
                    >
                      <option value="">Assign to…</option>
                      {hrCutters.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    {assigningRecut === p.id && <Loader2 size={14} className="animate-spin text-rose-400 shrink-0"/>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Active session card */}
      <div className="px-4 py-4">
        {activeSession ? (
          <div className="bg-white rounded-card border-2 border-emerald-200 shadow p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="text-2xs font-black text-emerald-700 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/>{t.activeSession}
                </p>
                <p className="text-sm font-black text-slate-800 truncate font-mono">{activeSession.id}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xs font-black text-slate-400 uppercase">{t.duration}</p>
                <p className="text-lg font-black text-slate-800 flex items-center gap-1"><Clock size={14}/>{fmtDuration(activeSession.startTime)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-slate-50 rounded-xl py-2">
                <p className="text-2xs font-black text-slate-400 uppercase">{t.sheets}</p>
                <p className="text-2xl font-black text-slate-800">{(activeSession.sheetsScanned || []).length}</p>
              </div>
              <div className="bg-slate-50 rounded-xl py-2">
                <p className="text-2xs font-black text-slate-400 uppercase">{t.pieces}</p>
                <p className="text-2xl font-black text-slate-800">{activeSession.piecesProduced || 0}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-card border-2 border-dashed border-slate-200">
            <EmptyState
              icon={<Target size={22}/>}
              title={t.noActiveSession}
              compact
            />
          </div>
        )}
      </div>

      {/* Cut Queue — Pending-Cut pieces from jobs assigned to this cutter */}
      <div className="px-4 pb-1">
        <div className="bg-white rounded-card border-2 border-slate-200 shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-2xs font-black uppercase tracking-widest text-slate-600 flex items-center gap-1.5"><ScanLine size={14}/> My Cut Queue</p>
          </div>
          {/* At-a-glance: how many pieces, how much glass, how much time is left */}
          {cutQueue.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-slate-50 rounded-xl py-2 text-center">
                <p className="text-xl font-black text-slate-800 tabular-nums leading-none">{queueStats.pcs}</p>
                <p className="text-2xs font-bold text-slate-400 uppercase mt-1">pcs to cut</p>
              </div>
              <div className="bg-slate-50 rounded-xl py-2 text-center">
                <p className="text-xl font-black text-slate-800 tabular-nums leading-none">{queueStats.sqft}</p>
                <p className="text-2xs font-bold text-slate-400 uppercase mt-1">sqft</p>
              </div>
              <div className={`rounded-xl py-2 text-center ${queueStats.nextDue !== null && queueStats.nextDue < 0 ? 'bg-rose-50' : queueStats.nextDue !== null && queueStats.nextDue <= 1 ? 'bg-amber-50' : 'bg-slate-50'}`}>
                <p className={`text-sm font-black tabular-nums leading-none mt-1 ${dueTone(queueStats.nextDue)}`}>{dueText(queueStats.nextDue)}</p>
                <p className="text-2xs font-bold text-slate-400 uppercase mt-1.5">next due</p>
              </div>
            </div>
          )}
          {cutQueue.length === 0 ? (() => {
            const totalPC = pieces.filter(p => p.status === 'Pending-Cut').length;
            const assignedOther = pieces.filter(p => p.status === 'Pending-Cut' && p.assignedCutter && !sameName(p.assignedCutter, cutterName)).length;
            return (
              <div className="py-4 text-center space-y-1.5">
                {isPrivileged && !actAsCutter ? (
                  <p className="text-label text-slate-500 font-bold">Pick a cutter in &ldquo;Act as cutter&rdquo; above to see their queue.</p>
                ) : totalPC === 0 ? (
                  <p className="text-label text-slate-400 font-bold">No orders are pending cut yet. Approve an order (that creates the cut pieces), then the <span className="text-slate-600">Cutting Supervisor</span> assigns them.</p>
                ) : (
                  <p className="text-label text-slate-400 font-bold">Nothing assigned to you. <span className="text-slate-600 font-black">{totalPC}</span> piece(s) are pending cut{assignedOther > 0 ? ` (${assignedOther} assigned to others)` : ''} — the <span className="text-slate-600">Cutting Supervisor</span> assigns cutting work.</p>
                )}
                <p className="text-2xs text-slate-300 font-bold">data loaded — pieces: {pieces.length} · orders: {jobs.length}{cutterName ? ` · you: ${cutterName}` : ''}</p>
              </div>
            );
          })() : (
            <div className="space-y-4 max-h-[55vh] overflow-y-auto">
              {cutQueueByJob.map(([orderId, list]) => {
                const job = jobs.find(j => j.orderNo === orderId || j.id === orderId);
                return (
                  <div key={orderId}>
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <p className="text-label font-black text-slate-700 truncate">#{(job?.orderNo || orderId).replace(/\s+/g, '').slice(-4)}{job?.projectName ? ` · ${job.projectName}` : ''}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        {(job?.items || []).some(it => !it.isSection && (it.designFile || it.attachedImage)) && (
                          <button onClick={() => setImageJob(orderId)}
                            className="text-2xs font-black uppercase text-violet-700 bg-violet-50 active:bg-violet-100 rounded-control px-2 py-1 inline-flex items-center gap-1 min-h-[32px]">
                            <ImageIcon size={12} /> Image
                          </button>
                        )}
                        <button onClick={() => setPlanJob(orderId)}
                          className="text-2xs font-black uppercase text-blue-700 bg-blue-50 active:bg-blue-100 rounded-control px-2 py-1 inline-flex items-center gap-1 min-h-[32px]">
                          <Scissors size={12} /> Plan
                        </button>
                        <span className="text-2xs font-bold flex items-center gap-2">
                          <span className="text-slate-400">{list.length} to cut</span>
                          <span className={dueTone(daysLeftOf(orderId))}>· {dueText(daysLeftOf(orderId))}</span>
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {list.map(p => (
                        <div key={p.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${p.status === 'QC-Failed' ? 'bg-rose-50 border border-rose-200' : 'bg-slate-50'}`}>
                          <div className="min-w-0 flex-1">
                            <p className="text-label font-black text-slate-800 font-mono truncate">{p.id}</p>
                            <p className="text-2xs text-slate-500 truncate">{p.specs}{sizeOf(p) ? ` · ${sizeOf(p)}` : ''}</p>
                            {p.status === 'QC-Failed' ? (
                              <p className="text-2xs font-black text-rose-600 truncate inline-flex items-center gap-1">
                                <AlertTriangle size={9}/> RECUT{p.fault?.description ? ` · ${p.fault.description}` : ''}
                              </p>
                            ) : (p.prevCutters?.length ?? 0) > 0 && (
                              <p className="text-2xs font-bold text-indigo-600 truncate inline-flex items-center gap-1">
                                <History size={9}/> reassigned to you from {p.prevCutters![p.prevCutters!.length - 1]}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => cutPiece(p)}
                              disabled={cutting === p.id || breaking === p.id}
                              className={`min-h-[44px] disabled:opacity-50 text-white rounded-xl px-4 py-2 text-label font-black uppercase flex items-center gap-1.5 ${p.status === 'QC-Failed' ? 'bg-rose-600 active:bg-rose-700' : 'bg-emerald-600 active:bg-emerald-700'}`}
                            >
                              {cutting === p.id ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>} {p.status === 'QC-Failed' ? 'Recut' : 'Cut'}
                            </button>
                            <button
                              onClick={() => breakPiece(p)}
                              disabled={breaking === p.id || cutting === p.id}
                              title="Mark broken (glass shattered while cutting)"
                              className="min-h-[44px] w-11 disabled:opacity-50 text-rose-600 bg-rose-50 active:bg-rose-100 border border-rose-200 rounded-xl flex items-center justify-center"
                            >
                              {breaking === p.id ? <Loader2 size={16} className="animate-spin"/> : <Ban size={16}/>}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* My Cuts Today (D1) — the cutter's credited completed work. Visible even
          when the supervisor recorded on their behalf; "logged by X" marks those. */}
      {myCutsToday.length > 0 && (
        <div className="px-4 pb-1 mt-3">
          <div className="bg-white rounded-card border-2 border-slate-200 shadow p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-2xs font-black uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                <CheckCircle2 size={14}/> {actAsCutter ? `${cutterName}'s Cuts Today` : 'My Cuts Today'}
              </p>
              <span className="text-2xs font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{myCutsToday.length}</span>
            </div>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {myCutsToday.map(p => {
                const loggedByOther = p.assignedBy && p.assignedBy !== cutterName;
                return (
                  <div key={p.id} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                    <CheckCircle2 size={15} className="text-emerald-500 shrink-0"/>
                    <div className="min-w-0 flex-1">
                      <p className="text-label font-black text-slate-800 font-mono truncate">{p.id}</p>
                      <p className="text-2xs text-slate-500 truncate">{p.specs}</p>
                      {loggedByOther && (
                        <p className="text-2xs font-bold text-indigo-600 truncate inline-flex items-center gap-1">
                          <Eye size={9}/> logged by {p.assignedBy}
                        </p>
                      )}
                    </div>
                    {p.cutAt && <span className="text-2xs font-bold text-slate-400 shrink-0 tabular-nums">{new Date(p.cutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3 main action buttons — 60×60+ , single-thumb */}
      <div className="px-4 space-y-3">
        {activeSession ? (
          <>
            <button
              onClick={handleOpenSheetDrawer}
              className="w-full min-h-[60px] bg-blue-600 active:bg-blue-700 text-white rounded-2xl shadow-lg flex items-center gap-3 px-5 py-4 text-base font-black uppercase tracking-wider"
            >
              <ScanLine size={24}/> <span className="text-left flex-1">{t.enterSheet}</span> <span className="text-2xs opacity-70">*</span>
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
          <p className="text-2xs font-black text-slate-500 uppercase tracking-widest mb-2">{t.recent}</p>
          <div className="space-y-2">
            {recentScans.map((scan, i) => {
              const ge = availableSheets.find(g => g.tagId === scan.tagId);
              return (
                <div key={`${scan.tagId}-${i}`} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${scan.isDefective ? 'bg-amber-50 border border-amber-200' : 'bg-white border border-slate-200'}`}>
                  {scan.isDefective ? <AlertTriangle size={16} className="text-amber-500 shrink-0"/> : <CheckCircle2 size={16} className="text-emerald-500 shrink-0"/>}
                  <div className="min-w-0 flex-1">
                    <p className="font-mono font-black text-sm text-slate-800 truncate">{scan.tagId}</p>
                    <p className="text-2xs text-slate-500 font-bold">{ge?.thickness || ''} · {(ge?.sqftPerSheet || 0).toFixed(1)} sqft</p>
                  </div>
                  <span className="text-2xs text-slate-400 font-bold shrink-0">{new Date(scan.scannedAt).toLocaleTimeString()}</span>
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
                <EmptyState icon={<Search size={22}/>} title={t.noSheets} compact />
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
                    <p className="text-2xs text-slate-500 font-bold">{s.thickness} · {s.sheetSize} · {s.sqftPerSheet.toFixed(1)} sqft</p>
                  </div>
                  {s.status !== 'OK' && (
                    <span className="text-2xs font-black text-amber-700 bg-amber-100 px-2 py-1 rounded shrink-0 uppercase">{s.status}</span>
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
              <div className="bg-slate-50 rounded-xl py-2"><p className="text-2xs font-black text-slate-400 uppercase">{t.sheets}</p><p className="text-xl font-black">{(activeSession.sheetsScanned || []).length}</p></div>
              <div className="bg-slate-50 rounded-xl py-2"><p className="text-2xs font-black text-slate-400 uppercase">{t.pieces}</p><p className="text-xl font-black">{activeSession.piecesProduced || 0}</p></div>
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

      {/* ── Cut Plan drawer (per job) ── */}
      {planJob && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-end" onClick={() => setPlanJob(null)}>
          <div className="w-full bg-white rounded-t-3xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
              <p className="text-base font-black uppercase">Cut Plan — #{planJob.replace(/\s+/g, '').slice(-4)}</p>
              <button onClick={() => setPlanJob(null)} className="p-2 hover:bg-slate-100 rounded-full" aria-label="Close"><X size={20} /></button>
            </div>
            <div className="p-4">
              <CutPlanTab items={(jobFor(planJob)?.items || []) as unknown as QuotationItem[]} />
            </div>
          </div>
        </div>
      )}

      {/* ── Design images drawer (per job) — the cutter sees what to cut ── */}
      {imageJob && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-end" onClick={() => setImageJob(null)}>
          <div className="w-full bg-white rounded-t-3xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
              <p className="text-base font-black uppercase">Design Images — #{imageJob.replace(/\s+/g, '').slice(-4)}</p>
              <button onClick={() => setImageJob(null)} className="p-2 hover:bg-slate-100 rounded-full" aria-label="Close"><X size={20} /></button>
            </div>
            <div className="p-4">
              {(() => {
                const imgs = (jobFor(imageJob)?.items || [])
                  .filter(it => !it.isSection && (it.designFile || it.attachedImage))
                  .map((it, i) => ({ src: (it.designFile || it.attachedImage) as string, label: it.description || `Item ${i + 1}` }));
                if (imgs.length === 0) return <EmptyState icon={<ImageIcon size={22} />} title="No images on this job" description="Design images attached to the order appear here." compact />;
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {imgs.map((im, i) => (
                      <figure key={i} className="bg-white rounded-card border-2 border-slate-200 shadow-sm overflow-hidden">
                        <img src={im.src} alt={im.label} className="w-full max-h-[70vh] object-contain bg-slate-50" />
                        <figcaption className="text-2xs font-bold text-slate-500 px-3 py-2 truncate">{im.label}</figcaption>
                      </figure>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CutterWorkbench;
