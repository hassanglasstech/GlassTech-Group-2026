/**
 * NotificationCenter.tsx — Sprint 35 (upgraded)
 *
 * Two-tab panel in the top-bar bell:
 *   TAB 1 — ERP Alerts  (Supabase erp_alerts, rule-based, severity badges)
 *   TAB 2 — WhatsApp    (localStorage WANotifications, existing behaviour)
 *
 * Bell badge shows:
 *   • Red  + count  → ERP critical alerts exist
 *   • Blue + count  → combined WA unread + ERP total unread
 *   • Green dot     → WA pending (no unread)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bell, X, CheckCircle2, AlertCircle, Truck, Scissors,
  Flame, Package, MessageCircle, Clock, Eye, SkipForward,
  Info, Trash2, CreditCard, RefreshCw, ClipboardList,
  AlertTriangle, CheckCheck, Scale, ChevronRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { NotificationService, WANotification, NotifEventType } from '../services/notificationService';
import { AlertService, ERPAlert, AlertUnread, AlertSeverity, AlertType } from '../services/alertService';

// ─────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────

const timeAgo = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// ─────────────────────────────────────────────────────────────────────
// ERP Alert tab config
// ─────────────────────────────────────────────────────────────────────

const SEV: Record<AlertSeverity, { rowBg: string; badge: string; dot: string; border: string }> = {
  critical: {
    rowBg:  'bg-red-50/40',
    badge:  'bg-red-100 text-red-700',
    dot:    'bg-red-500',
    border: 'border-l-2 border-red-400',
  },
  warning: {
    rowBg:  'bg-amber-50/40',
    badge:  'bg-amber-100 text-amber-700',
    dot:    'bg-amber-500',
    border: 'border-l-2 border-amber-400',
  },
  info: {
    rowBg:  'bg-blue-50/20',
    badge:  'bg-blue-100 text-blue-700',
    dot:    'bg-blue-400',
    border: 'border-l-2 border-blue-300',
  },
};

const TYPE_ICON: Record<AlertType, React.ReactNode> = {
  overdue_invoice:   <CreditCard   size={13} className="text-rose-500"    />,
  gl_imbalance:      <Scale        size={13} className="text-orange-500"  />,
  sync_queue:        <RefreshCw    size={13} className="text-blue-500"    />,
  tempering_overdue: <Flame        size={13} className="text-orange-500"  />,
  pr_pending:        <ClipboardList size={13} className="text-violet-500" />,
  low_stock:         <Package      size={13} className="text-amber-500"   />,
  cutter_target:     <Scissors     size={13} className="text-emerald-500" />,
  custom:            <Info         size={13} className="text-slate-400"   />,
};

const TYPE_LABEL: Record<AlertType, string> = {
  overdue_invoice:   'Overdue Invoice',
  gl_imbalance:      'GL Imbalance',
  sync_queue:        'Sync Queue',
  tempering_overdue: 'Tempering',
  pr_pending:        'PR Pending',
  low_stock:         'Low Stock',
  cutter_target:     'Cutter Target',
  custom:            'Alert',
};

// ─────────────────────────────────────────────────────────────────────
// ERP Alert card
// ─────────────────────────────────────────────────────────────────────

interface ERPAlertCardProps {
  alert:      ERPAlert;
  onMarkRead: (id: number) => void;
  onDismiss:  (id: number) => void;
  onNavigate: (link: string) => void;
}

const ERPAlertCard: React.FC<ERPAlertCardProps> = ({ alert, onMarkRead, onDismiss, onNavigate }) => {
  const s  = SEV[alert.severity];
  const ic = TYPE_ICON[alert.type] || <Info size={13} className="text-slate-400" />;

  return (
    <div className={`px-3 py-2.5 border-b border-slate-100 transition-colors hover:bg-slate-50/60 ${s.rowBg} ${s.border}`}>
      <div className="flex items-start gap-2.5">
        {/* Type icon */}
        <div className="mt-0.5 flex-shrink-0">{ic}</div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          {/* Top row: title + unread dot */}
          <div className="flex items-start justify-between gap-1.5 mb-0.5">
            <p className="text-[11px] font-black text-slate-800 leading-tight line-clamp-2">
              {alert.title}
            </p>
            {!alert.is_read && (
              <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-0.5 ${s.dot}`} />
            )}
          </div>

          {/* Body text */}
          {alert.body && (
            <p className="text-[10px] text-slate-500 leading-relaxed mb-1.5 line-clamp-2">
              {alert.body}
            </p>
          )}

          {/* Meta row */}
          <div className="flex items-center justify-between flex-wrap gap-1">
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-bold text-slate-400 flex items-center gap-0.5">
                <Clock size={8} /> {timeAgo(alert.created_at)}
              </span>
              <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full ${s.badge}`}>
                {alert.severity}
              </span>
              <span className="text-[8px] font-bold text-slate-400 uppercase">
                {TYPE_LABEL[alert.type] || alert.type}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 mt-2">
            {/* View / mark read */}
            {alert.link ? (
              <button
                onClick={() => { onMarkRead(alert.id); onNavigate(alert.link!); }}
                className="flex items-center gap-1 px-2 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-bold uppercase hover:bg-blue-100 transition-colors"
              >
                <ChevronRight size={9} />
                <span>View</span>
              </button>
            ) : !alert.is_read ? (
              <button
                onClick={() => onMarkRead(alert.id)}
                className="flex items-center gap-1 px-2 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-bold uppercase hover:bg-slate-200 transition-colors"
              >
                <Eye size={9} />
                <span>Mark read</span>
              </button>
            ) : null}

            {/* Dismiss */}
            <button
              onClick={() => onDismiss(alert.id)}
              className="flex items-center gap-1 px-2 py-1.5 bg-slate-50 text-slate-400 rounded-lg text-[9px] font-bold uppercase hover:bg-red-50 hover:text-red-500 transition-colors"
            >
              <X size={9} />
              <span>Dismiss</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// WA notification tab helpers (unchanged from Phase 6C)
// ─────────────────────────────────────────────────────────────────────

const EVENT_ICONS: Record<NotifEventType, React.ReactNode> = {
  cutting_complete:     <Scissors size={14} className="text-blue-500" />,
  tempering_dispatched: <Truck size={14} className="text-violet-500" />,
  tempering_returned:   <Flame size={14} className="text-orange-500" />,
  delivery_dispatched:  <Truck size={14} className="text-emerald-500" />,
  delivery_confirmed:   <CheckCircle2 size={14} className="text-emerald-600" />,
  urgent_insert:        <AlertCircle size={14} className="text-rose-500" />,
  hr_approval:          <Info size={14} className="text-blue-400" />,
  custom:               <Package size={14} className="text-slate-400" />,
};

const WA_STATUS_BADGE = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
  sent:    { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Sent ✓' },
  skipped: { bg: 'bg-slate-100', text: 'text-slate-500', label: 'Skipped' },
};

interface NotifCardProps {
  notif:       WANotification;
  onMarkRead:  (id: string) => void;
  onWASent:    (id: string) => void;
  onWASkipped: (id: string) => void;
  onNavigate:  (notif: WANotification) => void;
}

const NotifCard: React.FC<NotifCardProps> = ({ notif, onMarkRead, onWASent, onWASkipped, onNavigate }) => {
  const waBadge = WA_STATUS_BADGE[notif.waStatus];
  const hasWA   = !!notif.waLink;

  return (
    <div className={`px-4 py-3 border-b border-slate-100 transition-colors hover:bg-slate-50/50 ${!notif.isRead ? 'bg-blue-50/20' : ''}`}>
      <div className="flex items-start space-x-3">
        <div className="mt-0.5 flex-shrink-0">
          {EVENT_ICONS[notif.eventType] || <Info size={14} className="text-slate-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <p className="text-[11px] font-black text-slate-800 uppercase leading-tight truncate">
              {notif.title}
            </p>
            {!notif.isRead && <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1" />}
          </div>
          {notif.orderRef && (
            <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{notif.orderRef}</p>
          )}
          <p className="text-[10px] text-slate-500 leading-relaxed mb-2 line-clamp-2">{notif.message}</p>
          <div className="flex items-center justify-between flex-wrap gap-y-1.5">
            <div className="flex items-center space-x-2">
              <span className="text-[8px] font-bold text-slate-400 flex items-center gap-0.5">
                <Clock size={8} /> {timeAgo(notif.createdAt)}
              </span>
              {notif.recipientName && (
                <span className="text-[8px] font-bold text-slate-400">→ {notif.recipientName}</span>
              )}
            </div>
            <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full ${waBadge.bg} ${waBadge.text}`}>
              {waBadge.label}
            </span>
          </div>
          <div className="flex items-center space-x-1.5 mt-2.5 flex-wrap gap-y-1">
            {hasWA && notif.waStatus === 'pending' && (
              <a
                href={notif.waLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onWASent(notif.id)}
                className="flex items-center space-x-1 px-2.5 py-1.5 bg-green-500 text-white rounded-lg text-[9px] font-black uppercase hover:bg-green-600 transition-colors"
              >
                <MessageCircle size={10} />
                <span>Send WhatsApp</span>
              </a>
            )}
            {hasWA && notif.waStatus === 'pending' && (
              <button
                onClick={() => onWASkipped(notif.id)}
                className="flex items-center space-x-1 px-2 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-bold uppercase hover:bg-slate-200 transition-colors"
              >
                <SkipForward size={9} />
                <span>Skip</span>
              </button>
            )}
            {!notif.isRead && (
              <button
                onClick={() => { onMarkRead(notif.id); onNavigate(notif); }}
                className="flex items-center space-x-1 px-2 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-bold uppercase hover:bg-blue-100 transition-colors"
              >
                <Eye size={9} />
                <span>View</span>
              </button>
            )}
            {hasWA && notif.waStatus === 'sent' && (
              <a
                href={notif.waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1 px-2 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-bold uppercase hover:bg-slate-200 transition-colors"
              >
                <MessageCircle size={9} />
                <span>Resend</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Main NotificationCenter
// ─────────────────────────────────────────────────────────────────────

type TabId = 'erp' | 'wa';

const NotificationCenter: React.FC = () => {
  const navigate          = useNavigate();
  const { selectedCompany } = useAppStore();

  const [isOpen, setIsOpen]             = useState(false);
  const [activeTab, setActiveTab]       = useState<TabId>('erp');

  // WA notifications (localStorage)
  const [notifications, setNotifications] = useState<WANotification[]>([]);
  const [waFilter, setWaFilter]           = useState<'all' | 'pending_wa' | 'unread'>('all');

  // ERP alerts (Supabase)
  const [erpAlerts, setErpAlerts]   = useState<ERPAlert[]>([]);
  const [erpUnread, setErpUnread]   = useState<AlertUnread>({
    company: '', total_unread: 0, critical_count: 0, warning_count: 0, info_count: 0, latest_at: '',
  });
  const [erpLoading, setErpLoading] = useState(false);
  const [erpFilter, setErpFilter]   = useState<'all' | 'critical' | 'warning' | 'info'>('all');

  // ── Reload WA ───────────────────────────────────────────────────
  const reloadWA = useCallback(() => {
    setNotifications(NotificationService.getForCompany(selectedCompany));
  }, [selectedCompany]);

  // ── Reload ERP ──────────────────────────────────────────────────
  const reloadERP = useCallback(async () => {
    setErpLoading(true);
    try {
      const [alerts, unread] = await Promise.all([
        AlertService.getAlerts(selectedCompany, true),   // include read so "all" tab shows history
        AlertService.getUnreadCount(selectedCompany),
      ]);
      setErpAlerts(alerts);
      setErpUnread(unread);
    } catch { /* non-fatal */ }
    finally { setErpLoading(false); }
  }, [selectedCompany]);

  // ── Polling ─────────────────────────────────────────────────────
  useEffect(() => {
    reloadWA();
    reloadERP();
    const waInterval  = setInterval(reloadWA,  8_000);
    const erpInterval = setInterval(reloadERP, 15_000);
    return () => { clearInterval(waInterval); clearInterval(erpInterval); };
  }, [reloadWA, reloadERP]);

  // ── Derived counts ───────────────────────────────────────────────
  const waUnread   = notifications.filter(n => !n.isRead).length;
  const pendingWA  = notifications.filter(n => n.waLink && n.waStatus === 'pending').length;
  const totalBadge = erpUnread.total_unread + waUnread;
  const isCritical = erpUnread.critical_count > 0;

  // ── WA handlers ──────────────────────────────────────────────────
  const waFiltered = notifications.filter(n => {
    if (waFilter === 'pending_wa') return !!n.waLink && n.waStatus === 'pending';
    if (waFilter === 'unread')     return !n.isRead;
    return true;
  });

  const handleMarkReadWA  = (id: string) => { NotificationService.markRead(id);      reloadWA(); };
  const handleWASent      = (id: string) => { NotificationService.markWASent(id);    reloadWA(); };
  const handleWASkipped   = (id: string) => { NotificationService.markWASkipped(id); reloadWA(); };
  const handleNavigateWA  = (notif: WANotification) => {
    if (notif.link) { navigate(notif.link); setIsOpen(false); }
  };
  const handleClearAllWA  = () => { NotificationService.clearCompany(selectedCompany); reloadWA(); };

  // ── ERP handlers ─────────────────────────────────────────────────
  const erpFiltered = erpAlerts.filter(a => {
    if (a.is_dismissed) return false;
    if (erpFilter !== 'all') return a.severity === erpFilter;
    return true;
  });

  const handleMarkReadERP = async (id: number) => {
    await AlertService.markRead(id);
    reloadERP();
  };
  const handleDismissERP  = async (id: number) => {
    await AlertService.dismiss(id);
    reloadERP();
  };
  const handleMarkAllReadERP = async () => {
    await AlertService.markAllRead(selectedCompany);
    reloadERP();
  };
  const handleNavigateERP = (link: string) => {
    // strip leading # if present (hash router)
    const path = link.replace(/^#/, '');
    navigate(path);
    setIsOpen(false);
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="relative">
      {/* ── Bell button ── */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="hover:bg-white/10 p-2 rounded-full relative transition-colors"
        aria-label="Notifications"
      >
        <Bell size={18} className="text-white" />

        {/* Badge: critical → red, else blue */}
        {totalBadge > 0 && (
          <span className={`absolute top-1.5 right-1.5 w-4 h-4 rounded-full border-2 border-[#354a5f] flex items-center justify-center text-[8px] font-black text-white ${isCritical ? 'bg-rose-500' : 'bg-blue-500'}`}>
            {totalBadge > 9 ? '9+' : totalBadge}
          </span>
        )}

        {/* Green dot: WA pending, no unread */}
        {totalBadge === 0 && pendingWA > 0 && (
          <span className="absolute top-1.5 right-1.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#354a5f]" />
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[90]" onClick={() => setIsOpen(false)} />

          {/* Panel */}
          <div className="absolute right-0 mt-2 w-[420px] bg-white rounded-2xl shadow-2xl border border-slate-200 z-[100] overflow-hidden animate-in slide-in-from-top-2 duration-200">

            {/* ── Header ── */}
            <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
              <div>
                <h4 className="font-black uppercase text-[10px] text-slate-600 tracking-widest">
                  Notifications
                </h4>
                <p className="text-[9px] text-slate-400 font-bold mt-0.5">
                  {erpUnread.critical_count > 0 && (
                    <span className="text-rose-500 font-black">{erpUnread.critical_count} critical · </span>
                  )}
                  {erpUnread.total_unread} ERP unread · {waUnread} WA unread
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <X size={14} className="text-slate-500" />
                </button>
              </div>
            </div>

            {/* ── Main tabs ── */}
            <div className="flex border-b border-slate-200 bg-white">
              <button
                onClick={() => setActiveTab('erp')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[9px] font-black uppercase tracking-wider transition-colors ${activeTab === 'erp' ? 'text-blue-700 bg-blue-50 border-b-2 border-blue-600' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                <AlertTriangle size={10} />
                ERP Alerts
                {erpUnread.total_unread > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black ${isCritical ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                    {erpUnread.total_unread}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('wa')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[9px] font-black uppercase tracking-wider transition-colors ${activeTab === 'wa' ? 'text-green-700 bg-green-50 border-b-2 border-green-600' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                <MessageCircle size={10} />
                WhatsApp
                {waUnread > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black bg-blue-100 text-blue-700">
                    {waUnread}
                  </span>
                )}
                {pendingWA > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black bg-green-100 text-green-700">
                    {pendingWA} WA
                  </span>
                )}
              </button>
            </div>

            {/* ══════════════════════ ERP ALERTS TAB ══════════════════════ */}
            {activeTab === 'erp' && (
              <>
                {/* Sub-filter + actions */}
                <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100 bg-white flex-wrap">
                  {(['all', 'critical', 'warning', 'info'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setErpFilter(f)}
                      className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase transition-colors ${erpFilter === f
                        ? f === 'critical' ? 'bg-red-100 text-red-700'
                          : f === 'warning' ? 'bg-amber-100 text-amber-700'
                          : f === 'info'    ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-200 text-slate-700'
                        : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      {f === 'all'
                        ? `All (${erpAlerts.filter(a => !a.is_dismissed).length})`
                        : f === 'critical' ? `Critical (${erpUnread.critical_count})`
                        : f === 'warning'  ? `Warning (${erpUnread.warning_count})`
                        : `Info (${erpUnread.info_count})`}
                    </button>
                  ))}

                  {/* Spacer */}
                  <div className="flex-1" />

                  {erpUnread.total_unread > 0 && (
                    <button
                      onClick={handleMarkAllReadERP}
                      className="flex items-center gap-1 px-2 py-1 text-[8px] font-black text-blue-600 hover:bg-blue-50 rounded-lg uppercase transition-colors"
                    >
                      <CheckCheck size={9} />
                      All read
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="max-h-[440px] overflow-y-auto">
                  {erpLoading && erpAlerts.length === 0 ? (
                    <div className="p-8 text-center">
                      <RefreshCw size={22} className="mx-auto text-slate-200 animate-spin mb-2" />
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Loading alerts…</p>
                    </div>
                  ) : erpFiltered.length === 0 ? (
                    <div className="p-10 text-center">
                      <CheckCircle2 size={28} className="mx-auto text-emerald-200 mb-3" />
                      <p className="text-[10px] font-bold text-slate-400 uppercase">
                        {erpFilter !== 'all' ? `No ${erpFilter} alerts` : 'No active alerts'}
                      </p>
                      <p className="text-[9px] text-slate-300 mt-1">All clear for {selectedCompany}</p>
                    </div>
                  ) : (
                    erpFiltered.map(alert => (
                      <ERPAlertCard
                        key={alert.id}
                        alert={alert}
                        onMarkRead={handleMarkReadERP}
                        onDismiss={handleDismissERP}
                        onNavigate={handleNavigateERP}
                      />
                    ))
                  )}
                </div>

                {/* Footer */}
                <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <p className="text-[8px] text-slate-400 font-bold">
                    Refreshes every 15s · <span className="text-blue-500 cursor-pointer hover:underline" onClick={reloadERP}>Refresh now</span>
                  </p>
                  <button
                    onClick={() => { navigate('/admin/alert-settings'); setIsOpen(false); }}
                    className="text-[8px] font-black text-blue-600 hover:text-blue-800 uppercase"
                  >
                    Settings →
                  </button>
                </div>
              </>
            )}

            {/* ══════════════════════ WA TAB ══════════════════════════════ */}
            {activeTab === 'wa' && (
              <>
                {/* Sub-filter */}
                <div className="flex border-b border-slate-100 bg-white">
                  {(['all', 'unread', 'pending_wa'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setWaFilter(f)}
                      className={`flex-1 py-2 text-[9px] font-black uppercase tracking-wider transition-colors ${waFilter === f ? 'text-blue-700 bg-blue-50 border-b-2 border-blue-600' : 'text-slate-400 hover:bg-slate-50'}`}
                    >
                      {f === 'all'        ? `All (${notifications.length})`
                       : f === 'unread'   ? `Unread (${waUnread})`
                       : `WA (${pendingWA})`}
                    </button>
                  ))}
                </div>

                {/* List */}
                <div className="max-h-[440px] overflow-y-auto">
                  {waFiltered.length === 0 ? (
                    <div className="p-10 text-center">
                      <Bell size={28} className="mx-auto text-slate-200 mb-3" />
                      <p className="text-[10px] font-bold text-slate-400 uppercase">
                        {waFilter === 'pending_wa' ? 'No pending WhatsApp messages'
                         : waFilter === 'unread'   ? 'All caught up!'
                         : 'No notifications'}
                      </p>
                    </div>
                  ) : (
                    waFiltered.map(n => (
                      <NotifCard
                        key={n.id}
                        notif={n}
                        onMarkRead={handleMarkReadWA}
                        onWASent={handleWASent}
                        onWASkipped={handleWASkipped}
                        onNavigate={handleNavigateWA}
                      />
                    ))
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-t border-slate-100">
                  {pendingWA > 0 ? (
                    <p className="text-[9px] font-bold text-green-700 flex items-center gap-1">
                      <MessageCircle size={10} />
                      {pendingWA} message{pendingWA !== 1 ? 's' : ''} ready via WhatsApp
                    </p>
                  ) : (
                    <span />
                  )}
                  {notifications.length > 0 && (
                    <button
                      onClick={handleClearAllWA}
                      className="flex items-center gap-1 text-[9px] font-black text-rose-500 hover:text-rose-700 uppercase px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors"
                    >
                      <Trash2 size={10} />
                      Clear all
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationCenter;
