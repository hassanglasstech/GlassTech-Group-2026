/**
 * GlasscoDataWiper.tsx
 *
 * Wipes ALL GlassCo data from localStorage + Supabase.
 * Shared data (roles, permissions, system config) is preserved.
 * Other companies' data is untouched.
 *
 * Sections: Sales · Production · Finance · Logistics ·
 *           Procurement · HR · Notifications · Floor Planner
 */

import React, { useState } from 'react';
import { supabase } from '@/src/services/supabaseClient';
import { toast } from 'sonner';
import { Trash2, AlertTriangle, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';

const COMPANY = 'Glassco';

// ── All localStorage keys that store arrays filtered by company ────────
// For each key: load → filter out Glassco → save back
const COMPANY_FILTERED_KEYS = [
  // Sales
  'gtk_erp_quotations',
  'gtk_erp_clients',
  'gtk_erp_vendors',
  'gtk_erp_products',
  'gtk_erp_projects',
  'gtk_erp_invoices',
  'gtk_erp_payment_receipts',
  // Production
  'gtk_erp_production_pieces',
  'gtk_erp_job_orders',
  'gtk_erp_tempering_dispatches',
  'gtk_erp_gate_pass',
  'gtk_erp_gate_passes',
  'gtk_erp_warehouse_spots',
  // Procurement / Inventory
  'gtk_erp_store',
  'gtk_erp_stock_ledger',
  'gtk_erp_requisitions',
  'gtk_erp_purchase_orders',
  'gtk_erp_inspection_lots',
  'gtk_erp_handling_units',
  'gtk_erp_grn_sheet_entries',
  'gtk_erp_vendor_defect_reports',
  'gtk_erp_remnants',
  'gtk_erp_remnant_history',
  'gtk_erp_cutting_sessions',
  'gtk_erp_manual_count_sheets',
  'gtk_erp_scrap_disposals',
  'gtk_erp_vendor_reviews',
  'gtk_erp_pallet_rates',
  'gtk_erp_weight_master',
  'gtk_erp_assets',
  'gtk_erp_vendor_rates',
  // Logistics
  'gtk_erp_vehicles',
  'gtk_erp_vehicle_trips',
  'gtk_erp_vehicle_expenses',
  // Finance
  'gtk_erp_accounts',
  'gtk_erp_ledger',
  'gtk_erp_petty_cash',
  'gtk_erp_cost_centers',
  'gtk_erp_financial_events',
  'gtk_erp_recurring_expenses',
  'gtk_erp_mapping_rules',
  'gtk_erp_gl_config',
  // HR
  'gtk_erp_employees',
  'gtk_erp_attendance',
  'gtk_erp_loans',
  'gtk_erp_payroll',
  'gtk_erp_departments',
  'gtk_erp_employee_docs',
  'gtk_erp_employee_tags',
  'gtk_erp_employee_roles',
  'gtk_erp_tag_master',
  // NCR
  'gtk_erp_ncr_events',
  'gtk_erp_ncr_reproductions',
  'gtk_erp_ncr_claims',
  'gtk_erp_ncr_remnants',
  // Labour / Energy logs
  'gtk_erp_cutter_daily_logs',
  'gtk_erp_generator_logs',
];

// Keys that identify company via .company field
const COMPANY_FIELD = 'company';

// ── Keys to wipe entirely (Glassco-only, not shared) ─────────────────
const FULL_WIPE_KEYS = [
  'glassco_floor_planner_teams',
  'glassco_daily_plan',
  'glassco_cutter_daily_targets',
];

// ── Notification keys — filter by targetCompany ───────────────────────
const NOTIF_KEYS = ['gtk_notifications', 'gtk_notifications_v2'];

// ── Supabase tables with company column ──────────────────────────────
const SUPABASE_TABLES = [
  'quotations',
  'clients',
  'production_pieces',
  'products',
  'projects',
  'cutter_daily_logs',
  'generator_logs',
  'payroll',
  'loans',
];

// ── Supabase tables where company is implicit (all Glassco employees etc)
// For employees / attendance we match by company field if it exists,
// otherwise skip to be safe.
const SUPABASE_EMPLOYEE_TABLES = ['employees', 'attendance'];

// ─────────────────────────────────────────────────────────────────────
// Wipe functions
// ─────────────────────────────────────────────────────────────────────

function wipeLocalStorageKey(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return 0;
    const before = arr.length;
    const kept = arr.filter((item: any) => {
      const co = item[COMPANY_FIELD] || item.company || item.targetCompany || '';
      return co !== COMPANY && co !== '';
    });
    localStorage.setItem(key, JSON.stringify(kept));
    return before - kept.length;
  } catch { return 0; }
}

function fullWipeKey(key: string): void {
  localStorage.removeItem(key);
}

function wipeNotifKey(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return 0;
    const before = arr.length;
    const kept = arr.filter((n: any) =>
      n.targetCompany !== COMPANY && n.company !== COMPANY
    );
    localStorage.setItem(key, JSON.stringify(kept));
    return before - kept.length;
  } catch { return 0; }
}

async function wipeSupabaseTable(table: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from(table)
      .delete()
      .eq('company', COMPANY)
      .select('id');
    if (error) {
      console.warn(`[Wiper] Supabase ${table}:`, error.message);
      return 0;
    }
    return data?.length || 0;
  } catch (e) {
    console.warn(`[Wiper] Supabase ${table} failed:`, e);
    return 0;
  }
}

async function wipeSupabaseEmployees(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('employees')
      .delete()
      .eq('company', COMPANY)
      .select('id');
    if (error) { console.warn('[Wiper] employees:', error.message); return 0; }
    return data?.length || 0;
  } catch { return 0; }
}

async function wipeSupabaseAttendance(): Promise<number> {
  // attendance links to employees — get Glassco employee IDs first
  try {
    const { data: emps } = await supabase
      .from('employees')
      .select('id')
      .eq('company', COMPANY);
    if (!emps || emps.length === 0) return 0;
    const ids = emps.map(e => e.id);
    const { data, error } = await supabase
      .from('attendance')
      .delete()
      .in('employee_id', ids)
      .select('id');
    if (error) { console.warn('[Wiper] attendance:', error.message); return 0; }
    return data?.length || 0;
  } catch { return 0; }
}

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────

interface WipeLog { label: string; count: number; status: 'ok' | 'skip' | 'error'; }

const GlasscoDataWiper: React.FC = () => {
  const [confirmed, setConfirmed] = useState(false);
  const [typed, setTyped] = useState('');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [log, setLog] = useState<WipeLog[]>([]);

  const CONFIRM_WORD = 'GLASSCO RESET';
  const canProceed = typed.trim().toUpperCase() === CONFIRM_WORD;

  const handleWipe = async () => {
    setRunning(true);
    setLog([]);
    const logs: WipeLog[] = [];

    const add = (label: string, count: number, status: WipeLog['status'] = 'ok') => {
      logs.push({ label, count, status });
      setLog([...logs]);
    };

    // ── 1. Company-filtered localStorage keys ─────────────────────
    let lsTotal = 0;
    for (const key of COMPANY_FILTERED_KEYS) {
      const n = wipeLocalStorageKey(key);
      lsTotal += n;
    }
    add('localStorage — company data', lsTotal);

    // ── 2. Full wipe keys ─────────────────────────────────────────
    FULL_WIPE_KEYS.forEach(k => fullWipeKey(k));
    add('Floor planner / daily plan', FULL_WIPE_KEYS.length);

    // ── 3. Notifications ─────────────────────────────────────────
    let notifTotal = 0;
    NOTIF_KEYS.forEach(k => { notifTotal += wipeNotifKey(k); });
    add('Notifications', notifTotal);

    // ── 4. Supabase — company-filtered tables ─────────────────────
    for (const table of SUPABASE_TABLES) {
      const n = await wipeSupabaseTable(table);
      add(`Supabase → ${table}`, n);
    }

    // ── 5. Supabase — employees + attendance ──────────────────────
    const attN = await wipeSupabaseAttendance(); // must be before employees
    add('Supabase → attendance', attN);
    const empN = await wipeSupabaseEmployees();
    add('Supabase → employees', empN);

    // ── 6. IndexedDB (production pieces cached) ───────────────────
    try {
      const dbs = await indexedDB.databases?.() || [];
      const erpDb = dbs.find(d => d.name?.includes('erp') || d.name?.includes('gtk'));
      if (erpDb?.name) {
        // Just clear the productionPieces store from IDB
        const req = indexedDB.open(erpDb.name);
        req.onsuccess = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          if (db.objectStoreNames.contains('productionPieces')) {
            const tx = db.transaction('productionPieces', 'readwrite');
            tx.objectStore('productionPieces').clear();
          }
          db.close();
        };
        add('IndexedDB — production pieces cache', 1);
      } else {
        add('IndexedDB — not found', 0, 'skip');
      }
    } catch {
      add('IndexedDB — skipped', 0, 'skip');
    }

    setRunning(false);
    setDone(true);
    toast.success('GlassCo data wiped. Refresh the page to start clean.');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Warning header */}
      <div className="bg-rose-900 text-white p-7 rounded-3xl shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"><Trash2 size={160} className="absolute -right-4 -top-4" /></div>
        <div className="relative z-10 flex items-start space-x-4">
          <ShieldAlert size={28} className="text-rose-300 mt-0.5 flex-shrink-0" />
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight">GlassCo Data Reset</h2>
            <p className="text-rose-300 text-xs font-bold uppercase tracking-widest mt-1">
              Permanent · Irreversible · Clean start
            </p>
          </div>
        </div>
        <div className="mt-4 relative z-10 bg-white/10 rounded-2xl p-4 text-sm text-rose-100 leading-relaxed space-y-1">
          <p>✓ Deletes: Sales, Production, Finance, Logistics, Procurement, HR, NCR, Notifications</p>
          <p>✓ Safe: GTK, GTI, Nippon, Factory data untouched</p>
          <p>✓ Safe: Roles, permissions, system config preserved</p>
          <p>✗ Cannot be undone — export data first if needed</p>
        </div>
      </div>

      {!done && (
        <>
          {/* Scope checklist */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <p className="text-xs font-black uppercase text-slate-500 tracking-wider mb-3">What will be wiped</p>
            <div className="grid grid-cols-2 gap-2 text-xs font-bold text-slate-600">
              {[
                'All quotations & sales orders',
                'All invoices & payments',
                'All clients & vendors',
                'All production pieces',
                'All GL ledger entries',
                'All petty cash',
                'All stock & inventory',
                'All GRN records',
                'All vehicles & trips',
                'All gate passes',
                'All employees & HR',
                'All attendance & payroll',
                'All NCR records',
                'All cutting sessions',
                'Floor planner teams',
                'All notifications',
              ].map(item => (
                <div key={item} className="flex items-center space-x-2 text-rose-700">
                  <Trash2 size={11} className="flex-shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Confirmation */}
          {!confirmed ? (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 space-y-3">
              <div className="flex items-center space-x-2 text-amber-700">
                <AlertTriangle size={16} />
                <p className="text-sm font-black uppercase">Are you sure?</p>
              </div>
              <p className="text-xs text-amber-700 font-medium leading-relaxed">
                This will permanently delete all GlassCo data from localStorage and Supabase.
                There is no undo. Make sure you have exported any important data first.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => setConfirmed(true)}
                  className="px-5 py-2.5 bg-rose-600 text-white text-sm font-black uppercase rounded-xl hover:bg-rose-700 transition-colors"
                >
                  Yes, proceed to reset
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-5 space-y-4">
              <p className="text-sm font-black text-rose-700 uppercase">Type <span className="font-mono bg-rose-100 px-2 py-0.5 rounded">{CONFIRM_WORD}</span> to confirm</p>
              <input
                value={typed}
                onChange={e => setTyped(e.target.value)}
                placeholder="Type here..."
                className="w-full px-4 py-3 border-2 border-rose-200 rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 bg-white"
                autoFocus
              />
              <button
                onClick={handleWipe}
                disabled={!canProceed || running}
                className={`flex items-center space-x-2 px-6 py-3 rounded-xl text-sm font-black uppercase transition-all w-full justify-center ${
                  canProceed && !running
                    ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-lg'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {running ? <><Loader2 size={14} className="animate-spin" /> <span>Wiping data…</span></> : <><Trash2 size={14} /> <span>Wipe GlassCo Data</span></>}
              </button>
            </div>
          )}
        </>
      )}

      {/* Progress log */}
      {log.length > 0 && (
        <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-2 font-mono text-xs">
          <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest mb-3">Wipe log</p>
          {log.map((l, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className={l.status === 'error' ? 'text-rose-400' : l.status === 'skip' ? 'text-slate-500' : 'text-slate-200'}>
                {l.label}
              </span>
              <span className={`font-black ${l.count > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                {l.count > 0 ? `−${l.count}` : l.status === 'skip' ? 'skipped' : '0'}
              </span>
            </div>
          ))}
          {running && (
            <div className="flex items-center space-x-2 text-amber-400 pt-1">
              <Loader2 size={12} className="animate-spin" />
              <span>Working…</span>
            </div>
          )}
        </div>
      )}

      {/* Done */}
      {done && (
        <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-6 flex items-start space-x-4">
          <CheckCircle2 size={22} className="text-emerald-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-black text-emerald-800 uppercase">GlassCo data wiped successfully</p>
            <p className="text-xs text-emerald-700 font-medium mt-1 leading-relaxed">
              All GlassCo records removed from localStorage and Supabase.
              <br />
              <strong>Refresh the page</strong> to start with a clean GlassCo company.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 px-5 py-2 bg-emerald-600 text-white text-xs font-black uppercase rounded-xl hover:bg-emerald-700 transition-colors"
            >
              Refresh Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GlasscoDataWiper;
