/**
 * QCWorkbench.tsx — Sprint 7
 *
 * Mobile-first dedicated QC inspection page. Companion to Sprint 6's
 * CutterWorkbench. Surfaces the QC-Pending queue as a single linear
 * card stream tuned for a phone or tablet on the shop floor.
 *
 * Workflow per piece:
 *   • Header shows piece id, glass type / thickness, mandatory tag
 *   • PASS button (60×60+) → status QC-Passed
 *   • FAIL button → expands defect picker (canonical Sprint-7 codes)
 *   • Cutter assessment hidden by default ("blind check" — see banner)
 *
 * Re-uses:
 *   • QC_DEFECT_CODE_MAP / QCDefectPicker — Sprint 7
 *   • QCBlindCheckIntro — Sprint 7
 *   • Existing NCRService.createNCR + ProductionContext.handleUpdatePieceStatus
 *
 * Role gate: dispatch_staff / glassco_supervisor / super_admin / owner /
 * hassan / glassco_admin. Matches CutterWorkbench gating pattern.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/modules/auth/authStore';
import { useAppStore } from '@/modules/shared/store/appStore';
import { ProductionService } from '@/modules/production/services/productionService';
import { SalesService } from '@/modules/sales/services/salesService';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { NCRService } from '@/modules/production/services/ncrService';
import { ProductionPiece, PieceStatus } from '@/modules/shared/types';
import { Quotation } from '@/modules/shared/types';
import { QC_DEFECT_CODE_MAP } from '@/modules/production/constants/qcCodes';
import QCDefectPicker, { QCDefectSelection } from '@/modules/glassco/core/QCDefectPicker';
import QCBlindCheckIntro from '@/modules/glassco/core/QCBlindCheckIntro';
import { supabase } from '@/src/services/supabaseClient';
import { toast } from 'sonner';
import { KpiTile, KpiRow } from '@/modules/shared/components/KpiTile';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import Pagination from '@/components/Pagination';
import {
  CheckCircle2, X, AlertTriangle, Filter, RefreshCw, Eye,
  Globe, Search, ClipboardCheck,
} from 'lucide-react';

type Lang = 'en' | 'ur';
const T: Record<Lang, Record<string, string>> = {
  en: {
    title:        'QC Workbench',
    pending:      'Pending',
    mandatory:    'Mandatory',
    pass:         'PASS',
    fail:         'FAIL',
    passed:       'QC Passed',
    failed:       'QC Failed',
    confirm:      'Confirm Fail',
    cancel:       'Cancel',
    revealCutter: 'Reveal cutter assessment',
    cutterClean:  'Cutter said: clean',
    cutterDefect: 'Cutter said: defect here',
    cutterNone:   'Cutter did not assess',
    noPending:    'No pieces pending QC.',
    filterAll:    'All',
    filterMand:   'Mandatory',
    pickCode:     'Pick a defect code first.',
    needsMeas:    'Measurement required.',
    needsComment: 'Comment required for this code.',
    refresh:      'Refresh',
    search:       'Search piece id / order / specs',
  },
  ur: {
    title:        'QC Workbench',
    pending:      'Pending',
    mandatory:    'Zaroori',
    pass:         'PASS',
    fail:         'FAIL',
    passed:       'Pass ho gaya',
    failed:       'Fail kar diya',
    confirm:      'Tasdeeq Fail',
    cancel:       'Mansookh',
    revealCutter: 'Cutter ki rai dekhein',
    cutterClean:  'Cutter ne kaha: saaf',
    cutterDefect: 'Cutter ne kaha: yahan defect',
    cutterNone:   'Cutter ne assess nahi kiya',
    noPending:    'Koi piece pending nahi.',
    filterAll:    'Sab',
    filterMand:   'Zaroori',
    pickCode:     'Pehle defect code chunein.',
    needsMeas:    'Measurement zaroori hai.',
    needsComment: 'Comment zaroori hai is code ke liye.',
    refresh:      'Refresh',
    search:       'Piece id / order / specs search karein',
  },
};

interface QCItem {
  piece:                ProductionPiece;
  order?:               Quotation | undefined;
  size:                 string;
  thickness:            string;
  isMandatory:          boolean;
  isFromDefectiveSheet: boolean;
  cutterMarkedDefect:   boolean | null;
  needsHole:            boolean;
  needsNotch:           boolean;
}

const QCWorkbench: React.FC = () => {
  const user    = useAuthStore(s => s.user);
  const profile = useAuthStore(s => s.profile);
  const company = (useAppStore(s => s.selectedCompany) as string) || 'Glassco';

  const qcUser = profile?.fullName || user?.email || 'QC';

  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('qc_lang') as Lang) || 'en');
  const [tick, setTick] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'mandatory'>('all');
  const [selectedFor, setSelectedFor] = useState<string | null>(null);   // piece id whose Fail form is expanded
  const [defect, setDefect] = useState<QCDefectSelection>({ code: null });
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());   // bulk QC-pass selection
  const [bulkBusy, setBulkBusy] = useState(false);

  const t = T[lang];
  useEffect(() => { localStorage.setItem('qc_lang', lang); }, [lang]);

  // ── Data load ────────────────────────────────────────────────────────
  const refreshKey = useCallback(() => setTick(x => x + 1), []);

  // Cloud-backed load. The sync getters (getProductionPieces / SalesService.
  // getQuotations) read only the localStorage cache, which is empty on a fresh
  // route — so the QC-Pending queue showed nothing. Use the async loaders.
  const [allPieces, setAllPieces] = useState<ProductionPiece[]>([]);
  const [jobOrders, setJobOrders] = useState<Quotation[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [pcs, ords] = await Promise.all([
          ProductionService.getProductionPiecesAsync(),
          AsyncSalesService.getQuotations(),
        ]);
        if (!alive) return;
        setAllPieces(pcs);
        setJobOrders(ords.filter(q => !q.company || q.company === company));
      } catch {
        if (!alive) return;
        setAllPieces(ProductionService.getProductionPieces());
        setJobOrders(SalesService.getQuotations().filter(q => q.company === company));
      }
    })();
    return () => { alive = false; };
  }, [company, tick]);

  const items = useMemo<QCItem[]>(() => {
    const pending = allPieces.filter(p => p.status === 'QC-Pending');
    // Random 10% mandatory (deterministic per-tick to avoid card jumping)
    const sampleSize = Math.max(1, Math.round(pending.length * 0.1));
    const sampleIds = new Set(
      [...pending].sort((a, b) => a.id.localeCompare(b.id)).slice(0, sampleSize).map(p => p.id)
    );

    return pending.map(p => {
      const order = jobOrders.find(j => j.orderNo === p.orderId || j.id === p.orderId);
      const item: any = order?.items?.[Number((p as any).itemIndex || 0)];
      const services: string[] = item?.selectedServices || [];
      const needsHole = services.includes('Holes') || !!(item?.holes?.length);
      const needsNotch = services.includes('Notch') || services.includes('Notching');
      // Cutter defect assessment captured when sheet was scanned defective.
      // Sheets / sessions live in InventoryService — we don't load them here
      // for the mobile workbench (kept lightweight); blind reveal reads it
      // on demand only when a piece is from a defective sheet.
      const isFromDefective = false;
      return {
        piece: p,
        order,
        size: item ? `${item.inchW || item.mmW || '?'}"×${item.inchH || item.mmH || '?'}"` : (p.specs || '').slice(0, 24),
        thickness: item?.glassSize || '',
        isMandatory: sampleIds.has(p.id) || isFromDefective,
        isFromDefectiveSheet: isFromDefective,
        cutterMarkedDefect: null,
        needsHole,
        needsNotch,
      };
    });
  }, [allPieces, jobOrders]);

  const filtered = useMemo(() => {
    let list = items;
    if (filter === 'mandatory') list = list.filter(i => i.isMandatory);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(i =>
        i.piece.id.toLowerCase().includes(q) ||
        i.piece.orderId.toLowerCase().includes(q) ||
        (i.piece.specs || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, filter, search]);

  // client-side pagination of the QC queue so the card stream stays light
  // at real volume. Pagination renders nothing when there is ≤1 page, so small
  // queues are unchanged. Reset to page 1 on filter/search; clamp if the queue
  // shrinks (pieces get processed out of QC-Pending).
  const QC_PAGE_SIZE = 25;
  const [qcPage, setQcPage] = useState(1);
  useEffect(() => { setQcPage(1); }, [filter, search]);
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filtered.length / QC_PAGE_SIZE));
    if (qcPage > maxPage) setQcPage(maxPage);
  }, [filtered.length, qcPage]);
  const paged = useMemo(
    () => filtered.slice((qcPage - 1) * QC_PAGE_SIZE, qcPage * QC_PAGE_SIZE),
    [filtered, qcPage],
  );

  // Guards placed after hooks to keep hook order stable (react-hooks/rules-of-hooks)
  if (!user) return <Navigate to="/" replace/>;
  const ALLOWED_ROLES = new Set(['dispatch_staff', 'glassco_supervisor', 'super_admin', 'owner', 'hassan', 'glassco_admin']);
  if (!ALLOWED_ROLES.has(user.role || '')) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="text-center">
          <AlertTriangle size={36} className="mx-auto text-amber-500 mb-3"/>
          <p className="text-sm font-bold text-slate-700">QC Workbench is for QC / Dispatch staff.</p>
          <p className="text-xs text-slate-400 mt-2">Your role: <span className="font-mono">{user.role}</span></p>
        </div>
      </div>
    );
  }

  // ── Atomic status update via Sprint-5 RPC ────────────────────────────
  const updateStatusAtomic = async (pieceId: string, nextStatus: PieceStatus, extra: any = {}) => {
    try {
      const { error } = await supabase.rpc('update_piece_status_atomic', {
        p_piece_id:   pieceId,
        p_new_status: nextStatus,
        p_changed_by: qcUser,
        p_reason:     null,
        p_extra:      extra,
      });
      if (error) {
        toast.error(`Server rejected: ${error.message}`, { duration: 8000 });
        return false;
      }
    } catch (e: any) {
      console.warn('[QCWorkbench] RPC failed (kept local):', e?.message);
    }
    // Mirror locally so the UI updates without waiting for refresh
    const all = ProductionService.getProductionPieces();
    ProductionService.saveProductionPiecesBg(
      all.map(p => p.id === pieceId
        ? { ...p, ...extra, status: nextStatus, lastUpdated: new Date().toISOString() }
        : p)
    );
    refreshKey();
    return true;
  };

  // ── Actions ──────────────────────────────────────────────────────────
  const handlePass = async (it: QCItem) => {
    const ok = await updateStatusAtomic(it.piece.id, 'QC-Passed' as PieceStatus);
    if (ok) toast.success(`${it.piece.id} → ${t.passed}`);
  };

  // ── Bulk QC-pass — reuses the per-piece atomic RPC, mirrors once ──────
  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const selectAllOnPage = () => setSelected(prev => {
    const next = new Set(prev);
    const allSel = paged.length > 0 && paged.every(it => next.has(it.piece.id));
    paged.forEach(it => { if (allSel) next.delete(it.piece.id); else next.add(it.piece.id); });
    return next;
  });

  const handleBulkPass = async () => {
    const ids = [...selected].filter(id => allPieces.some(p => p.id === id && p.status === 'QC-Pending'));
    if (ids.length === 0) { toast.error('No valid QC-Pending pieces selected.'); return; }
    setBulkBusy(true);
    try {
      const results = await Promise.all(ids.map(async (id) => {
        try {
          const { error } = await supabase.rpc('update_piece_status_atomic', {
            p_piece_id: id, p_new_status: 'QC-Passed', p_changed_by: qcUser, p_reason: null, p_extra: {},
          });
          return { id, ok: !error };
        } catch { return { id, ok: false }; }
      }));
      const passed = new Set(results.filter(r => r.ok).map(r => r.id));
      const failedCount = results.length - passed.size;
      // one local mirror for every passed piece (avoids per-call re-save races)
      const all = ProductionService.getProductionPieces();
      ProductionService.saveProductionPiecesBg(
        all.map(p => passed.has(p.id)
          ? { ...p, status: 'QC-Passed' as PieceStatus, lastUpdated: new Date().toISOString() }
          : p),
      );
      setSelected(new Set());
      refreshKey();
      if (passed.size) toast.success(`${passed.size} pieces → ${t.passed}${failedCount ? ` · ${failedCount} rejected` : ''}`);
      else toast.error(`Bulk pass rejected for all ${failedCount} pieces.`);
    } finally {
      setBulkBusy(false);
    }
  };

  const openFailFor = (it: QCItem) => {
    setSelectedFor(it.piece.id);
    setDefect({ code: null });
  };

  const cancelFail = () => {
    setSelectedFor(null);
    setDefect({ code: null });
  };

  const submitFail = async (it: QCItem) => {
    if (!defect.code) { toast.error(t.pickCode); return; }
    const meta = QC_DEFECT_CODE_MAP[defect.code];
    if (meta?.requiresComment && !(defect.comment || '').trim()) { toast.error(t.needsComment); return; }
    if (meta?.needsMeasurement && !(defect.measurement || '').trim()) { toast.error(t.needsMeas); return; }

    const ok = await updateStatusAtomic(it.piece.id, 'QC-Failed' as PieceStatus, {
      fault: {
        id: `F-${Date.now()}`,
        description: `${defect.code} — ${meta?.label || ''}${defect.comment ? ': ' + defect.comment : ''}${defect.measurement ? ' · Measured: ' + defect.measurement : ''}`,
        reportedAt: new Date().toISOString(),
        disposal: 'Recut',
      },
    });
    if (!ok) return;

    // Auto NCR for critical (Crack) — mirrors DispatchView legacy behavior.
    if (defect.code === 'QC-05') {
      try {
        NCRService.createNCR({
          company:        company as any,
          pieceId:        it.piece.id,
          jobOrderId:     it.piece.orderId,
          itemIndex:      it.piece.itemIndex,
          stage:          'Cutting',
          cause:          'BR-06-Edge-Damage',
          description:    `QC Fail: ${defect.code} — ${meta?.label}. ${defect.comment || ''}`,
          reportedBy:     qcUser,
          sqftLost:       0,
          glassType:      it.piece.specs || '',
          thickness:      it.thickness,
          estimatedValue: 0,
          action:         'Reproduce',
        } as any);
      } catch (e: any) {
        toast.warning(`Piece marked failed but NCR creation failed: ${e?.message}`);
      }
    }

    toast.error(`${it.piece.id} → ${t.failed} (${defect.code})`);
    cancelFail();
  };

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 pb-32" style={{ fontSize: 16 }}>
      {/* Sticky header */}
      <header className="sticky top-0 z-30 bg-emerald-700 text-white px-4 py-3 shadow">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-label text-emerald-200 font-bold uppercase tracking-widest">{t.title}</p>
            <p className="text-base font-black truncate">{qcUser}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={refreshKey} className="bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2 text-xs font-black flex items-center gap-1" aria-label="Refresh">
              <RefreshCw size={14}/> {t.refresh}
            </button>
            <button onClick={() => setLang(lang === 'en' ? 'ur' : 'en')} className="bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2 text-xs font-black flex items-center gap-1" title="Toggle language">
              <Globe size={14}/> {lang === 'en' ? 'اردو' : 'EN'}
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-4">
        {/* Tutorial banner — shows once per user */}
        <QCBlindCheckIntro userId={user.id}/>

        {/* KPI strip */}
        <KpiRow className="lg:grid-cols-2">
          <KpiTile label={t.pending} value={items.length} icon={<ClipboardCheck size={16} />} tone="neutral" />
          <KpiTile label={t.mandatory} value={items.filter(i => i.isMandatory).length} icon={<Filter size={16} />} tone="warning" />
        </KpiRow>

        {/* Filter + search */}
        <div className="flex gap-2">
          <button onClick={() => setFilter('all')} className={`flex-1 min-h-[44px] text-xs font-black uppercase rounded-xl border-2 ${filter === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-600'}`}>
            {t.filterAll} ({items.length})
          </button>
          <button onClick={() => setFilter('mandatory')} className={`flex-1 min-h-[44px] text-xs font-black uppercase rounded-xl border-2 ${filter === 'mandatory' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white border-amber-200 text-amber-700'}`}>
            <Filter size={12} className="inline mr-1"/> {t.filterMand} ({items.filter(i => i.isMandatory).length})
          </button>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300"/>
          <input
            type="text"
            placeholder={t.search}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-3 text-sm border-2 border-slate-200 rounded-xl font-bold focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {/* Card list */}
        {filtered.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-card">
            <EmptyState icon={<CheckCircle2 size={22} />} title={t.noPending} />
          </div>
        ) : (
          <>
          {/* Bulk select-all on the current page */}
          <div className="flex items-center justify-between bg-white border-2 border-slate-200 rounded-xl px-3 py-2">
            <label className="flex items-center gap-2.5 text-xs font-black text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={paged.length > 0 && paged.every(it => selected.has(it.piece.id))}
                onChange={selectAllOnPage}
                className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              Select all on page ({paged.length})
            </label>
            {selected.size > 0 && (
              <button onClick={() => setSelected(new Set())} className="text-xs font-black text-slate-400 hover:text-slate-600 uppercase">Clear</button>
            )}
          </div>
          <div className="space-y-3">
            {paged.map(it => {
              const isExpanded = selectedFor === it.piece.id;
              const isRevealed = revealed.has(it.piece.id);
              return (
                <div key={it.piece.id} className={`bg-white rounded-card border-2 shadow-sm overflow-hidden ${it.isMandatory ? 'border-amber-300' : 'border-slate-200'}`}>
                  {/* Header */}
                  <div className={`px-4 py-3 border-b ${it.isMandatory ? 'bg-amber-50' : 'bg-slate-50'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={selected.has(it.piece.id)}
                          onChange={() => toggleSelect(it.piece.id)}
                          className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                          aria-label={`Select ${it.piece.id}`}
                        />
                        <p className="font-mono font-black text-sm text-slate-800 truncate">{it.piece.id}</p>
                      </div>
                      {it.isMandatory && <span className="text-2xs font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full uppercase">{t.mandatory}</span>}
                    </div>
                    <p className="text-label text-slate-500 font-bold mt-0.5 truncate">{it.size} · {it.thickness} · {it.piece.orderId}</p>
                  </div>

                  {/* Decision buttons */}
                  {!isExpanded ? (
                    <div className="p-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handlePass(it)}
                        className="min-h-[60px] bg-emerald-600 active:bg-emerald-700 text-white rounded-xl font-black uppercase text-sm tracking-wider flex items-center justify-center gap-2 shadow"
                      >
                        <CheckCircle2 size={18}/> {t.pass}
                      </button>
                      <button
                        onClick={() => openFailFor(it)}
                        className="min-h-[60px] bg-rose-600 active:bg-rose-700 text-white rounded-xl font-black uppercase text-sm tracking-wider flex items-center justify-center gap-2 shadow"
                      >
                        <X size={18}/> {t.fail}
                      </button>
                    </div>
                  ) : (
                    /* Fail form */
                    <div className="p-4 space-y-4">
                      <QCDefectPicker value={defect} onChange={setDefect} alwaysShowComment compact={false}/>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={cancelFail} className="min-h-[52px] border-2 border-slate-200 rounded-xl text-sm font-black text-slate-600 uppercase">{t.cancel}</button>
                        <button onClick={() => submitFail(it)} className="min-h-[52px] bg-rose-600 text-white rounded-xl text-sm font-black uppercase active:bg-rose-700">
                          <AlertTriangle size={14} className="inline mr-1"/> {t.confirm}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Cutter assessment reveal (defective-sheet pieces only) */}
                  {it.isFromDefectiveSheet && (
                    <div className="px-4 pb-3">
                      {!isRevealed ? (
                        <button onClick={() => setRevealed(prev => new Set([...prev, it.piece.id]))}
                          className="w-full min-h-[44px] text-xs font-black text-slate-500 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center gap-2"
                        >
                          <Eye size={12}/> {t.revealCutter}
                        </button>
                      ) : (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-black text-slate-700">
                          {it.cutterMarkedDefect === true  ? `⚠ ${t.cutterDefect}`
                            : it.cutterMarkedDefect === false ? `✓ ${t.cutterClean}`
                            : t.cutterNone}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Pagination totalItems={filtered.length} itemsPerPage={QC_PAGE_SIZE} currentPage={qcPage} onPageChange={setQcPage} />
          </>
        )}
      </div>

      {/* Sticky bulk-pass action bar — appears when pieces are selected */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t-2 border-emerald-200 shadow-2xl px-4 py-3 no-print">
          <div className="flex items-center gap-3 max-w-3xl mx-auto">
            <span className="text-sm font-black text-slate-700">
              <span className="text-emerald-600">{selected.size}</span> selected
            </span>
            <button onClick={() => setSelected(new Set())} className="text-xs font-black text-slate-400 hover:text-slate-600 uppercase">Clear</button>
            <button
              onClick={handleBulkPass}
              disabled={bulkBusy}
              className="ml-auto min-h-[48px] px-6 bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-black uppercase text-sm tracking-wider flex items-center gap-2 shadow"
            >
              <CheckCircle2 size={18}/> {bulkBusy ? '…' : `${t.pass} ${selected.size}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default QCWorkbench;
