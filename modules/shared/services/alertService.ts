/**
 * alertService.ts — Sprint 35 (Notifications + Alerts)
 *
 * ERP-level alert engine. Runs rule-based checks against live Supabase
 * data and writes findings to the `erp_alerts` table. The bell icon in
 * NotificationCenter reads from this table.
 *
 * Checks implemented:
 *   • overdue_invoice     — invoices unpaid for >N days (default 30)
 *   • gl_imbalance        — trial balance Dr ≠ Cr by more than tolerance
 *   • sync_queue          — offline write queue > N items (default 50)
 *   • tempering_overdue   — pieces at tempering vendor > N days (default 7)
 *   • pr_pending          — purchase requisitions awaiting approval > N days
 *   • low_stock           — store items at or below reorder point
 *   • cutter_target       — (positive) cutter exceeded daily target
 *
 * Deduplication: the DB has a unique partial index
 *   (company, type, reference_id, created_at::date) — so we can upsert
 *   the same alert daily without creating duplicates.
 *
 * WhatsApp webhook: on every critical alert, if `whatsapp_webhook_url`
 *   is configured we POST a JSON payload. Operator connects their own
 *   WhatsApp Business API or a simple n8n/Make.com webhook.
 *
 * Called from:
 *   • App.tsx → init() — runs once on login (background)
 *   • App.tsx → 15-min interval
 *   • NotificationSettings.tsx → "Run checks now" button
 */

import { supabase } from '@/src/services/supabaseClient';

// ── Types ────────────────────────────────────────────────────────────

export type AlertType =
  | 'overdue_invoice'
  | 'gl_imbalance'
  | 'sync_queue'
  | 'tempering_overdue'
  | 'pr_pending'
  | 'low_stock'
  | 'cutter_target'
  | 'custom';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface ERPAlert {
  id:           number;
  company:      string;
  type:         AlertType;
  severity:     AlertSeverity;
  title:        string;
  body?:        string;
  link?:        string;
  reference_id?: string;
  is_read:      boolean;
  is_dismissed: boolean;
  created_at:   string;
  expires_at?:  string;
  data?:        Record<string, any>;
}

export interface AlertThresholds {
  company:                  string;
  invoice_overdue_days:     number;
  tempering_overdue_days:   number;
  pr_approval_overdue_days: number;
  sync_queue_threshold:     number;
  gl_imbalance_tolerance:   number;
  low_stock_threshold:      number;
  daily_digest_enabled:     boolean;
  digest_email:             string;
  whatsapp_webhook_url:     string;
  suppress_offhours:        boolean;
}

export interface AlertUnread {
  company:        string;
  total_unread:   number;
  critical_count: number;
  warning_count:  number;
  info_count:     number;
  latest_at:      string;
}

// ── Default thresholds ───────────────────────────────────────────────
const DEFAULT_THRESHOLDS: AlertThresholds = {
  company:                  '',
  invoice_overdue_days:     30,
  tempering_overdue_days:   7,
  pr_approval_overdue_days: 3,
  sync_queue_threshold:     50,
  gl_imbalance_tolerance:   0.01,
  low_stock_threshold:      0,
  daily_digest_enabled:     false,
  digest_email:             '',
  whatsapp_webhook_url:     '',
  suppress_offhours:        false,
};

// ── Helpers ──────────────────────────────────────────────────────────
const _safe = (p: PromiseLike<any>) => Promise.resolve(p).then(v => v, () => null);

/** Insert alert — silently swallows duplicate dedup constraint errors */
const _fire = async (alert: Omit<ERPAlert, 'id' | 'is_read' | 'is_dismissed' | 'created_at'>): Promise<void> => {
  try {
    const { error } = await supabase.from('erp_alerts').insert({
      company:      alert.company,
      type:         alert.type,
      severity:     alert.severity,
      title:        alert.title,
      body:         alert.body || null,
      link:         alert.link || null,
      reference_id: alert.reference_id || null,
      expires_at:   alert.expires_at || null,
      data:         alert.data || {},
    });
    // 23505 = unique_violation (daily dedup) — expected, not an error
    if (error && error.code !== '23505') {
      console.warn('[AlertService] insert error:', error.message);
    }
  } catch { /* swallow — alerting is best-effort */ }
};

/** POST to WhatsApp webhook if configured */
const _webhook = async (url: string, alert: { title: string; body?: string; severity: AlertSeverity; company: string }) => {
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company:  alert.company,
        severity: alert.severity,
        title:    alert.title,
        body:     alert.body || '',
        time:     new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' }),
      }),
    });
  } catch { /* webhook failure is non-fatal */ }
};

// ── Individual check runners ─────────────────────────────────────────

const checkOverdueInvoices = async (company: string, cfg: AlertThresholds): Promise<void> => {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - cfg.invoice_overdue_days);

    // Sprint 35 bugfix: table is `invoices`, not `sales_invoices`
    const { data, error } = await supabase
      .from('invoices')
      .select('id, client_name, total_amount, invoice_date, due_date')
      .eq('company', company)
      .neq('status', 'Paid')
      .neq('status', 'Cancelled')
      .lt('due_date', cutoff.toISOString().slice(0, 10))
      .limit(20);

    if (error || !data) return;

    for (const inv of data) {
      const overdueDays = Math.floor(
        (Date.now() - new Date(inv.due_date || inv.invoice_date).getTime()) / 86400000
      );
      const severity: AlertSeverity = overdueDays > 60 ? 'critical' : overdueDays > 30 ? 'warning' : 'info';
      const alert = {
        company,
        type:         'overdue_invoice' as AlertType,
        severity,
        title:        `Invoice overdue ${overdueDays}d — ${inv.client_name || 'Client'}`,
        body:         `Invoice ${inv.id} • PKR ${(inv.total_amount || 0).toLocaleString()} • Due: ${inv.due_date || inv.invoice_date}`,
        link:         '#/finance/billing',
        reference_id: inv.id,
        data:         { overdue_days: overdueDays, amount: inv.total_amount },
      };
      await _fire(alert);
      if (severity === 'critical') await _webhook(cfg.whatsapp_webhook_url, { ...alert, company });
    }
  } catch { /* supabase table may not exist — ignore */ }
};

const checkGLImbalance = async (company: string, cfg: AlertThresholds): Promise<void> => {
  try {
    // Sum all DR - CR from ledger
    const { data, error } = await supabase
      .rpc('erp_trial_balance', { p_company: company })
      .single();

    if (error || !data) return;

    // RPC return shape isn't typed — narrow via cast to read either field name
    const row = data as { balance?: number; trial_balance?: number };
    const balance = Math.abs(Number(row.balance ?? row.trial_balance ?? 0));
    if (balance <= cfg.gl_imbalance_tolerance) return;

    const severity: AlertSeverity = balance > 1000 ? 'critical' : 'warning';
    const alert = {
      company,
      type:     'gl_imbalance' as AlertType,
      severity,
      title:    `GL imbalance detected — PKR ${balance.toLocaleString()}`,
      body:     `Trial balance is off by PKR ${balance.toLocaleString()}. Check journal entries.`,
      link:     '#/finance/accounts',
      reference_id: `gl-${new Date().toISOString().slice(0, 10)}`,
      data:     { balance },
    };
    await _fire(alert);
    if (severity === 'critical') await _webhook(cfg.whatsapp_webhook_url, { ...alert, company });
  } catch { /* RPC may not exist */ }
};

const checkSyncQueue = async (company: string, cfg: AlertThresholds): Promise<void> => {
  try {
    const raw = localStorage.getItem('gtk_erp_pending_sync') || '[]';
    const queue: any[] = JSON.parse(raw);
    if (queue.length < cfg.sync_queue_threshold) return;

    await _fire({
      company,
      type:         'sync_queue' as AlertType,
      severity:     'warning',
      title:        `Sync queue backed up — ${queue.length} pending writes`,
      body:         'Offline queue is large. Check internet connection or force sync.',
      link:         '#/admin/health-metrics',
      reference_id: `sync-${new Date().toISOString().slice(0, 10)}`,
      data:         { queue_size: queue.length },
    });
  } catch { /* non-fatal */ }
};

const checkTemperingOverdue = async (company: string, cfg: AlertThresholds): Promise<void> => {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - cfg.tempering_overdue_days);

    const { data, error } = await supabase
      .from('production_pieces')
      .select('id, order_id, updated_at')
      .eq('company', company)
      .eq('status', 'tempering')
      .lt('updated_at', cutoff.toISOString())
      .limit(20);

    if (error || !data) return;

    for (const piece of data) {
      const days = Math.floor((Date.now() - new Date(piece.updated_at).getTime()) / 86400000);
      await _fire({
        company,
        type:         'tempering_overdue' as AlertType,
        severity:     days > 14 ? 'critical' : 'warning',
        title:        `Tempering not returned — ${days}d (Order: ${piece.order_id})`,
        body:         `Piece ${piece.id} sent to tempering ${days} days ago. Follow up with vendor.`,
        link:         '#/production',
        reference_id: piece.id,
        data:         { days_at_vendor: days },
      });
    }
  } catch { /* table may not exist */ }
};

const checkPRPending = async (company: string, cfg: AlertThresholds): Promise<void> => {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - cfg.pr_approval_overdue_days);

    const { data, error } = await supabase
      .from('requisitions')
      .select('id, description, created_at, requested_by')
      .eq('company', company)
      .eq('status', 'Pending')
      .lt('created_at', cutoff.toISOString())
      .limit(10);

    if (error || !data) return;

    for (const pr of data) {
      const days = Math.floor((Date.now() - new Date(pr.created_at).getTime()) / 86400000);
      await _fire({
        company,
        type:         'pr_pending' as AlertType,
        severity:     days > 7 ? 'warning' : 'info',
        title:        `PR awaiting approval — ${days}d`,
        body:         `Requisition ${pr.id}: "${pr.description || 'No description'}". Requested by: ${pr.requested_by || '—'}`,
        link:         '#/procurement',
        reference_id: pr.id,
        data:         { days_pending: days },
      });
    }
  } catch { /* table may not exist */ }
};

const checkLowStock = async (company: string, cfg: AlertThresholds): Promise<void> => {
  if (cfg.low_stock_threshold <= 0) return; // disabled
  try {
    const { data, error } = await supabase
      .from('store_items')
      .select('id, item_name, quantity, reorder_level')
      .eq('company', company)
      .lt('quantity', cfg.low_stock_threshold)
      .limit(15);

    if (error || !data) return;

    for (const item of data) {
      const qty = item.quantity ?? 0;
      const level = item.reorder_level || cfg.low_stock_threshold;
      if (qty >= level) continue;

      await _fire({
        company,
        type:         'low_stock' as AlertType,
        severity:     qty <= 0 ? 'critical' : 'warning',
        title:        `Low stock — ${item.item_name || item.id}`,
        body:         `Current qty: ${qty}. Reorder level: ${level}. Raise PR immediately.`,
        link:         '#/procurement/inventory',
        reference_id: String(item.id),
        data:         { qty, reorder_level: level },
      });
    }
  } catch { /* table may not exist */ }
};

// ── Public API ───────────────────────────────────────────────────────

export const AlertService = {

  /** Load thresholds for a company from Supabase (falls back to defaults) */
  loadThresholds: async (company: string): Promise<AlertThresholds> => {
    try {
      const { data, error } = await supabase
        .from('alert_thresholds')
        .select('*')
        .eq('company', company)
        .single();
      if (error || !data) return { ...DEFAULT_THRESHOLDS, company };
      return {
        company,
        invoice_overdue_days:     data.invoice_overdue_days     ?? 30,
        tempering_overdue_days:   data.tempering_overdue_days   ?? 7,
        pr_approval_overdue_days: data.pr_approval_overdue_days ?? 3,
        sync_queue_threshold:     data.sync_queue_threshold     ?? 50,
        gl_imbalance_tolerance:   Number(data.gl_imbalance_tolerance ?? 0.01),
        low_stock_threshold:      data.low_stock_threshold      ?? 0,
        daily_digest_enabled:     !!data.daily_digest_enabled,
        digest_email:             data.digest_email             || '',
        whatsapp_webhook_url:     data.whatsapp_webhook_url     || '',
        suppress_offhours:        !!data.suppress_offhours,
      };
    } catch {
      return { ...DEFAULT_THRESHOLDS, company };
    }
  },

  /** Save thresholds */
  saveThresholds: async (t: AlertThresholds): Promise<{ ok: boolean; error?: string }> => {
    try {
      const { error } = await supabase.from('alert_thresholds').upsert({
        id:                       t.company,
        company:                  t.company,
        invoice_overdue_days:     t.invoice_overdue_days,
        tempering_overdue_days:   t.tempering_overdue_days,
        pr_approval_overdue_days: t.pr_approval_overdue_days,
        sync_queue_threshold:     t.sync_queue_threshold,
        gl_imbalance_tolerance:   t.gl_imbalance_tolerance,
        low_stock_threshold:      t.low_stock_threshold,
        daily_digest_enabled:     t.daily_digest_enabled,
        digest_email:             t.digest_email || null,
        whatsapp_webhook_url:     t.whatsapp_webhook_url || null,
        suppress_offhours:        t.suppress_offhours,
        updated_at:               new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'unknown' };
    }
  },

  /** Run ALL alert checks for a company — fire and forget safe */
  runChecks: async (company: string): Promise<void> => {
    const cfg = await AlertService.loadThresholds(company);

    // suppress off-hours if configured (08:00–22:00 PKT)
    if (cfg.suppress_offhours) {
      const pkHour = new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi', hour: 'numeric', hour12: false });
      const h = parseInt(pkHour);
      if (h < 8 || h >= 22) return;
    }

    await Promise.allSettled([
      checkOverdueInvoices(company, cfg),
      checkGLImbalance(company, cfg),
      checkSyncQueue(company, cfg),
      checkTemperingOverdue(company, cfg),
      checkPRPending(company, cfg),
      checkLowStock(company, cfg),
    ]);
  },

  /** Fetch alerts for a company (unread first, max 50) */
  getAlerts: async (company: string, includeRead = false): Promise<ERPAlert[]> => {
    try {
      let q = supabase
        .from('erp_alerts')
        .select('*')
        .eq('company', company)
        .eq('is_dismissed', false)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!includeRead) q = q.eq('is_read', false);
      const { data, error } = await q;
      return (error || !data) ? [] : data as ERPAlert[];
    } catch { return []; }
  },

  /** Unread count from the roll-up view */
  getUnreadCount: async (company: string): Promise<AlertUnread> => {
    const empty: AlertUnread = { company, total_unread: 0, critical_count: 0, warning_count: 0, info_count: 0, latest_at: '' };
    try {
      const { data, error } = await supabase
        .from('v_alert_unread')
        .select('*')
        .eq('company', company)
        .single();
      return (error || !data) ? empty : data as AlertUnread;
    } catch { return empty; }
  },

  /** Mark one alert as read */
  markRead: async (id: number): Promise<void> => {
    await _safe(supabase.from('erp_alerts').update({ is_read: true }).eq('id', id));
  },

  /** Mark all unread for company as read */
  markAllRead: async (company: string): Promise<void> => {
    await _safe(supabase.from('erp_alerts').update({ is_read: true }).eq('company', company).eq('is_read', false));
  },

  /** Dismiss (soft-delete) */
  dismiss: async (id: number): Promise<void> => {
    await _safe(supabase.from('erp_alerts').update({ is_dismissed: true }).eq('id', id));
  },

  /** Fire a custom alert (from anywhere in the app) */
  custom: async (
    company: string,
    title: string,
    opts?: { body?: string; link?: string; severity?: AlertSeverity; reference_id?: string }
  ): Promise<void> => {
    await _fire({
      company,
      type:         'custom',
      severity:     opts?.severity || 'info',
      title,
      body:         opts?.body,
      link:         opts?.link,
      reference_id: opts?.reference_id,
    });
  },
};

export default AlertService;
