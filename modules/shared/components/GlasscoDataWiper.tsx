/**
 * GlasscoDataWiper.tsx
 *
 * Wipes GlassCo transactional data. Master/setup data preserved by default.
 * Optional: also wipe master data via checkboxes.
 */

import React, { useState } from 'react';
import { supabase } from '@/src/services/supabaseClient';
import { toast } from 'sonner';
import { Trash2, ShieldAlert, CheckCircle2, Loader2, Shield } from 'lucide-react';

const COMPANY = 'Glassco';
const CONFIRM_WORD = 'GLASSCO RESET';

// ── TRANSACTIONAL — always wiped ──────────────────────────────────────
const TRANSACTIONAL_KEYS = [
  'gtk_erp_quotations', 'gtk_erp_projects', 'gtk_erp_invoices', 'gtk_erp_payment_receipts',
  'gtk_erp_production_pieces', 'gtk_erp_job_orders', 'gtk_erp_tempering_dispatches',
  'gtk_erp_gate_pass', 'gtk_erp_gate_passes',
  'gtk_erp_stock_ledger', 'gtk_erp_requisitions', 'gtk_erp_purchase_orders',
  'gtk_erp_inspection_lots', 'gtk_erp_handling_units', 'gtk_erp_grn_sheet_entries',
  'gtk_erp_vendor_defect_reports', 'gtk_erp_remnants', 'gtk_erp_remnant_history',
  'gtk_erp_cutting_sessions', 'gtk_erp_manual_count_sheets', 'gtk_erp_scrap_disposals',
  'gtk_erp_vendor_reviews', 'gtk_erp_vehicle_trips', 'gtk_erp_vehicle_expenses',
  'gtk_erp_ledger', 'gtk_erp_petty_cash', 'gtk_erp_financial_events',
  'gtk_erp_attendance', 'gtk_erp_loans', 'gtk_erp_payroll', 'gtk_erp_employee_docs',
  'gtk_erp_ncr_events', 'gtk_erp_ncr_reproductions', 'gtk_erp_ncr_claims', 'gtk_erp_ncr_remnants',
  'gtk_erp_cutter_daily_logs', 'gtk_erp_generator_logs',
];

// ── MASTER / SETUP — preserved by default, optional delete ───────────
const MASTER_GROUPS: { id: string; label: string; keys: string[] }[] = [
  {
    id: 'clients_vendors',
    label: 'Clients & Vendors',
    keys: ['gtk_erp_clients', 'gtk_erp_vendors', 'gtk_erp_vendor_rates'],
  },
  {
    id: 'material',
    label: 'Product & glass type definitions (descriptions only — quantities always zeroed)',
    keys: ['gtk_erp_products', 'gtk_erp_weight_master', 'gtk_erp_pallet_rates'],
  },
  {
    id: 'finance_master',
    label: 'Chart of Accounts, cost centers & GL config',
    keys: ['gtk_erp_accounts', 'gtk_erp_cost_centers', 'gtk_erp_mapping_rules', 'gtk_erp_gl_config', 'gtk_erp_recurring_expenses'],
  },
  {
    id: 'hr_master',
    label: 'Employees, departments & tags',
    keys: ['gtk_erp_employees', 'gtk_erp_departments', 'gtk_erp_tag_master', 'gtk_erp_employee_tags', 'gtk_erp_employee_roles'],
  },
  {
    id: 'logistics_master',
    label: 'Vehicles & warehouse bins',
    keys: ['gtk_erp_vehicles', 'gtk_erp_warehouse_spots'],
  },
  {
    id: 'assets',
    label: 'Fixed assets register',
    keys: ['gtk_erp_assets'],
  },
];

const FULL_WIPE_KEYS = ['glassco_floor_planner_teams', 'glassco_daily_plan', 'glassco_cutter_daily_targets'];
const NOTIF_KEYS = ['gtk_notifications', 'gtk_notifications_v2'];
const SUPABASE_TRANSACTIONAL = ['quotations', 'projects', 'cutter_daily_logs', 'generator_logs', 'payroll', 'loans'];
const SUPABASE_MASTER_EMPLOYEES = { id: 'hr_master', tables: ['employees'] };
const SUPABASE_MASTER_CLIENTS = { id: 'clients_vendors', tables: ['clients', 'products'] };

// ── Helpers ───────────────────────────────────────────────────────────

function filterKey(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return 0;
    const kept = arr.filter((item: any) => {
      const co = item.company || item.targetCompany || '';
      return co !== COMPANY && co !== '';
    });
    localStorage.setItem(key, JSON.stringify(kept));
    return arr.length - kept.length;
  } catch { return 0; }
}

function removeKey(key: string): void { localStorage.removeItem(key); }

function filterNotif(key: string): number {
  try {
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(arr)) return 0;
    const kept = arr.filter((n: any) => n.targetCompany !== COMPANY && n.company !== COMPANY);
    localStorage.setItem(key, JSON.stringify(kept));
    return arr.length - kept.length;
  } catch { return 0; }
}

async function sbDelete(table: string): Promise<number> {
  try {
    const { data, error } = await supabase.from(table).delete().eq('company', COMPANY).select('id');
    if (error) { console.warn(`[Wiper] ${table}:`, error.message); return 0; }
    return data?.length || 0;
  } catch { return 0; }
}

async function sbDeleteProductionPieces(): Promise<number> {
  // production_pieces has no company column — delete via order_id match
  try {
    // Get all order IDs belonging to Glassco from localStorage
    const quotations = JSON.parse(localStorage.getItem('gtk_erp_quotations') || '[]');
    // Also check Supabase quotations table directly
    const { data: sbQuotes } = await supabase.from('quotations').select('id, order_no').eq('company', COMPANY);
    const sbIds = (sbQuotes || []).flatMap((q: any) => [q.id, q.order_no].filter(Boolean));
    const lsIds = (Array.isArray(quotations) ? quotations : [])
      .filter((q: any) => q.company === COMPANY)
      .flatMap((q: any) => [q.id, q.orderNo, q.order_no].filter(Boolean));
    const allOrderIds = [...new Set([...sbIds, ...lsIds])];

    if (allOrderIds.length === 0) {
      // Fallback: get all pieces and delete ones whose order_id starts with Glassco pattern
      const { data: allPieces } = await supabase.from('production_pieces').select('id, order_id');
      const glasscoPattern = /^(QT-GLS|SO-GLS|DRF-GLS)/i;
      const toDelete = (allPieces || []).filter((p: any) => glasscoPattern.test(p.order_id || '')).map((p: any) => p.id);
      if (toDelete.length === 0) return 0;
      const { data } = await supabase.from('production_pieces').delete().in('id', toDelete).select('id');
      return data?.length || 0;
    }

    const { data } = await supabase.from('production_pieces').delete().in('order_id', allOrderIds).select('id');
    return data?.length || 0;
  } catch (e) {
    console.warn('[Wiper] production_pieces:', e);
    return 0;
  }
}

async function sbDeleteAttendance(): Promise<number> {
  try {
    const { data: emps } = await supabase.from('employees').select('id').eq('company', COMPANY);
    if (!emps?.length) return 0;
    const { data } = await supabase.from('attendance').delete().in('employee_id', emps.map(e => e.id)).select('id');
    return data?.length || 0;
  } catch { return 0; }
}

// ── Component ─────────────────────────────────────────────────────────

interface Log { label: string; count: number; type: 'wipe' | 'skip'; }

const GlasscoDataWiper: React.FC = () => {
  const [typed, setTyped]               = useState('');
  const [confirmed, setConfirmed]       = useState(false);
  const [masterToDelete, setMasterToDelete] = useState<Set<string>>(new Set());
  const [running, setRunning]           = useState(false);
  const [done, setDone]                 = useState(false);
  const [log, setLog]                   = useState<Log[]>([]);

  const canProceed = typed.trim().toUpperCase() === CONFIRM_WORD;

  const toggleMaster = (id: string) => {
    setMasterToDelete(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleWipe = async () => {
    setRunning(true);
    const logs: Log[] = [];
    const add = (label: string, count: number, type: Log['type'] = 'wipe') => {
      logs.push({ label, count, type });
      setLog([...logs]);
    };

    // 1. Transactional keys
    let n = 0;
    TRANSACTIONAL_KEYS.forEach(k => { n += filterKey(k); });
    add('Transactional records (orders, GL, NCR, logs…)', n);

    // 1b. Zero out stock quantities in store (keep item definitions, reset qty to 0)
    // This keeps material master intact but removes GRN-posted stock
    try {
      const store = JSON.parse(localStorage.getItem('gtk_erp_store') || '[]');
      if (Array.isArray(store)) {
        const zeroed = store.map((item: any) => {
          if (item.company !== COMPANY) return item;
          return { ...item, quantity: 0, unrestrictedQty: 0, qiQty: 0, blockedQty: 0,
            reservedQty: 0, consignmentQty: 0, totalValue: 0, lastMovementDate: '' };
        });
        localStorage.setItem('gtk_erp_store', JSON.stringify(zeroed));
        const count = zeroed.filter((i: any) => i.company === COMPANY).length;
        add('Stock quantities zeroed (item definitions kept)', count);
      }
    } catch { add('Stock quantity reset', 0, 'skip'); }

    // 2. Phase-specific keys
    FULL_WIPE_KEYS.forEach(removeKey);
    add('Floor planner & daily plan', FULL_WIPE_KEYS.length);

    // 3. Notifications
    let nf = 0;
    NOTIF_KEYS.forEach(k => { nf += filterNotif(k); });
    add('Notifications', nf);

    // 4. Optional master data
    for (const grp of MASTER_GROUPS) {
      if (masterToDelete.has(grp.id)) {
        let mn = 0;
        grp.keys.forEach(k => { mn += filterKey(k); });
        add(`Master: ${grp.label}`, mn);
      } else {
        add(`Master: ${grp.label}`, 0, 'skip');
      }
    }

    // 5. Supabase transactional
    for (const t of SUPABASE_TRANSACTIONAL) {
      const sn = await sbDelete(t);
      add(`Supabase → ${t}`, sn);
    }

    // 5b. Supabase production_pieces (special — no company column)
    const ppN = await sbDeleteProductionPieces();
    add('Supabase → production_pieces', ppN);

    // 6. Supabase attendance (before employees)
    const an = await sbDeleteAttendance();
    add('Supabase → attendance', an);

    // 7. Supabase master (if selected)
    if (masterToDelete.has('hr_master')) {
      const en = await sbDelete('employees');
      add('Supabase → employees', en);
    }
    if (masterToDelete.has('clients_vendors')) {
      for (const t of ['clients', 'products']) {
        const cn = await sbDelete(t);
        add(`Supabase → ${t}`, cn);
      }
    }

    // 8. IndexedDB cache
    try {
      const dbs = await indexedDB.databases?.() || [];
      const erpDb = dbs.find(d => d.name?.includes('erp') || d.name?.includes('gtk'));
      if (erpDb?.name) {
        const req = indexedDB.open(erpDb.name);
        req.onsuccess = (e: any) => {
          const db = e.target.result;
          if (db.objectStoreNames.contains('productionPieces')) {
            db.transaction('productionPieces', 'readwrite').objectStore('productionPieces').clear();
          }
          db.close();
        };
        add('IndexedDB cache', 1);
      }
    } catch { add('IndexedDB', 0, 'skip'); }

    setRunning(false);
    setDone(true);
    toast.success('GlassCo data wiped. Refresh to start clean.');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-in fade-in duration-300">

      {/* Header */}
      <div className="bg-rose-900 text-white p-7 rounded-3xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"><Trash2 size={140} className="absolute -right-4 -top-4" /></div>
        <div className="relative z-10 flex items-start space-x-4">
          <ShieldAlert size={26} className="text-rose-300 mt-0.5 flex-shrink-0" />
          <div>
            <h2 className="text-xl font-black uppercase">GlassCo Data Reset</h2>
            <p className="text-rose-300 text-[10px] font-bold uppercase tracking-widest mt-1">Clean start · Transactional data wiped · Master data optional</p>
          </div>
        </div>
        <div className="mt-4 relative z-10 bg-white/10 rounded-2xl p-4 text-sm text-rose-100 space-y-1">
          <p>✓ GTK, GTI, Nippon, Factory — untouched</p>
          <p>✓ Roles, permissions, system config — preserved</p>
          <p>✗ Cannot be undone — no backup restore exists here</p>
        </div>
      </div>

      {!done && (
        <>
          {/* Always wiped section */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center space-x-2 mb-3">
              <Trash2 size={14} className="text-rose-500" />
              <p className="text-xs font-black uppercase text-slate-600 tracking-wider">Always wiped (transactional)</p>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-rose-700 font-medium">
              {[
                'All quotations & job orders','All invoices & payments',
                'All production pieces','All GL ledger entries',
                'All GRN records & sheet tags','Stock quantities zeroed (definitions kept)',
                'All remants & cutting sessions','All petty cash entries',
                'All attendance & payroll','All NCR events & claims',
                'All dispatch challans','All vehicle trips',
                'All labour & generator logs','Notifications',
              ].map(t => <div key={t} className="flex items-center gap-1.5"><span className="text-rose-400">−</span>{t}</div>)}
            </div>
          </div>

          {/* Master data section */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center space-x-2 mb-1">
              <Shield size={14} className="text-emerald-600" />
              <p className="text-xs font-black uppercase text-slate-600 tracking-wider">Master / setup data — preserved by default</p>
            </div>
            <p className="text-[10px] text-slate-400 font-medium mb-3">Tick only if you want to delete these too</p>
            <div className="space-y-2">
              {MASTER_GROUPS.map(grp => (
                <label key={grp.id} className={`flex items-center space-x-3 p-3 rounded-xl border cursor-pointer transition-all ${masterToDelete.has(grp.id) ? 'border-rose-300 bg-rose-50' : 'border-slate-100 hover:bg-slate-50'}`}>
                  <input
                    type="checkbox"
                    checked={masterToDelete.has(grp.id)}
                    onChange={() => toggleMaster(grp.id)}
                    className="w-4 h-4 accent-rose-600"
                  />
                  <div>
                    <p className={`text-xs font-bold ${masterToDelete.has(grp.id) ? 'text-rose-700' : 'text-slate-700'}`}>{grp.label}</p>
                    <p className="text-[9px] text-slate-400">{grp.keys.map(k => k.replace('gtk_erp_', '')).join(', ')}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Confirm */}
          {!confirmed ? (
            <button
              onClick={() => setConfirmed(true)}
              className="w-full py-3 bg-rose-600 text-white text-sm font-black uppercase rounded-2xl hover:bg-rose-700 transition-colors"
            >
              Proceed to confirm
            </button>
          ) : (
            <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-5 space-y-3">
              <p className="text-sm font-black text-rose-700">
                Type <span className="font-mono bg-rose-100 px-2 py-0.5 rounded">{CONFIRM_WORD}</span> to confirm
              </p>
              <input
                value={typed}
                onChange={e => setTyped(e.target.value)}
                placeholder="Type here…"
                className="w-full px-4 py-3 border-2 border-rose-200 rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 bg-white"
                autoFocus
              />
              <button
                onClick={handleWipe}
                disabled={!canProceed || running}
                className={`flex items-center justify-center space-x-2 w-full py-3 rounded-xl text-sm font-black uppercase transition-all ${canProceed && !running ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-md' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
              >
                {running
                  ? <><Loader2 size={14} className="animate-spin" /><span>Wiping…</span></>
                  : <><Trash2 size={14} /><span>Wipe GlassCo Data</span></>
                }
              </button>
            </div>
          )}
        </>
      )}

      {/* Log */}
      {log.length > 0 && (
        <div className="bg-slate-900 text-white rounded-2xl p-5 font-mono text-xs space-y-1.5">
          <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Wipe log</p>
          {log.map((l, i) => (
            <div key={i} className="flex justify-between">
              <span className={l.type === 'skip' ? 'text-slate-500' : 'text-slate-200'}>{l.label}</span>
              <span className={l.type === 'skip' ? 'text-slate-600' : l.count > 0 ? 'text-emerald-400 font-black' : 'text-slate-500'}>
                {l.type === 'skip' ? 'preserved' : l.count > 0 ? `−${l.count}` : '0'}
              </span>
            </div>
          ))}
          {running && <div className="flex items-center gap-2 text-amber-400 pt-1"><Loader2 size={11} className="animate-spin" /><span>Working…</span></div>}
        </div>
      )}

      {/* Done */}
      {done && (
        <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-6 flex items-start space-x-4">
          <CheckCircle2 size={22} className="text-emerald-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-black text-emerald-800 uppercase">Done — GlassCo wiped</p>
            <p className="text-xs text-emerald-700 font-medium mt-1">Refresh the page to start clean.</p>
            <button onClick={() => window.location.reload()} className="mt-3 px-5 py-2 bg-emerald-600 text-white text-xs font-black uppercase rounded-xl hover:bg-emerald-700">
              Refresh Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GlasscoDataWiper;
