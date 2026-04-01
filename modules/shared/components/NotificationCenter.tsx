/**
 * NotificationCenter.tsx — Phase 6C (upgraded)
 *
 * Replaces basic NotificationCenter with full WhatsApp notification support:
 * - Bell icon with unread badge (existing)
 * - Per-notification "Send via WhatsApp" button → opens wa.me link
 * - "Mark Skipped" option
 * - Status badges: pending / sent / skipped
 * - Event type icons (cutting, tempering, delivery, etc.)
 * - Notification log (last 30 days)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Bell, X, CheckCircle2, AlertCircle, Truck, Scissors,
         Flame, Package, MessageCircle, Clock, Eye, SkipForward,
         Info, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { NotificationService, WANotification, NotifEventType } from '../services/notificationService';

// ─────────────────────────────────────────────────────────────────────
// Helpers
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
// Single notification card
// ─────────────────────────────────────────────────────────────────────

interface NotifCardProps {
  notif: WANotification;
  onMarkRead: (id: string) => void;
  onWASent: (id: string) => void;
  onWASkipped: (id: string) => void;
  onNavigate: (notif: WANotification) => void;
}

const NotifCard: React.FC<NotifCardProps> = ({ notif, onMarkRead, onWASent, onWASkipped, onNavigate }) => {
  const waBadge = WA_STATUS_BADGE[notif.waStatus];
  const hasWA = !!notif.waLink;

  return (
    <div className={`px-4 py-3 border-b border-slate-100 transition-colors hover:bg-slate-50/50 ${!notif.isRead ? 'bg-blue-50/20' : ''}`}>
      <div className="flex items-start space-x-3">
        {/* Icon */}
        <div className="mt-0.5 flex-shrink-0">
          {EVENT_ICONS[notif.eventType] || <Info size={14} className="text-slate-400" />}
        </div>

        {/* Content */}
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

          {/* Meta row */}
          <div className="flex items-center justify-between flex-wrap gap-y-1.5">
            <div className="flex items-center space-x-2">
              <span className="text-[8px] font-bold text-slate-400 flex items-center gap-0.5">
                <Clock size={8} /> {timeAgo(notif.createdAt)}
              </span>
              {notif.recipientName && (
                <span className="text-[8px] font-bold text-slate-400">→ {notif.recipientName}</span>
              )}
            </div>

            {/* WA Status badge */}
            <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full ${waBadge.bg} ${waBadge.text}`}>
              {waBadge.label}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center space-x-1.5 mt-2.5 flex-wrap gap-y-1">
            {/* WhatsApp send */}
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

            {/* Skip WA */}
            {hasWA && notif.waStatus === 'pending' && (
              <button
                onClick={() => onWASkipped(notif.id)}
                className="flex items-center space-x-1 px-2 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-bold uppercase hover:bg-slate-200 transition-colors"
              >
                <SkipForward size={9} />
                <span>Skip</span>
              </button>
            )}

            {/* Mark read + navigate */}
            {!notif.isRead && (
              <button
                onClick={() => { onMarkRead(notif.id); onNavigate(notif); }}
                className="flex items-center space-x-1 px-2 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-bold uppercase hover:bg-blue-100 transition-colors"
              >
                <Eye size={9} />
                <span>View</span>
              </button>
            )}

            {/* Re-send WA if already sent */}
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

const NotificationCenter: React.FC = () => {
  const navigate = useNavigate();
  const { selectedCompany } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<WANotification[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'pending_wa' | 'unread'>('all');

  const reload = useCallback(() => {
    setNotifications(NotificationService.getForCompany(selectedCompany));
  }, [selectedCompany]);

  useEffect(() => {
    reload();
    const interval = setInterval(reload, 8000);
    return () => clearInterval(interval);
  }, [reload]);

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const pendingWA = notifications.filter(n => n.waLink && n.waStatus === 'pending').length;

  const filtered = notifications.filter(n => {
    if (filterType === 'pending_wa') return !!n.waLink && n.waStatus === 'pending';
    if (filterType === 'unread') return !n.isRead;
    return true;
  });

  const handleMarkRead = (id: string) => {
    NotificationService.markRead(id);
    reload();
  };

  const handleWASent = (id: string) => {
    NotificationService.markWASent(id);
    reload();
  };

  const handleWASkipped = (id: string) => {
    NotificationService.markWASkipped(id);
    reload();
  };

  const handleNavigate = (notif: WANotification) => {
    if (notif.link) { navigate(notif.link); setIsOpen(false); }
  };

  const handleClearAll = () => {
    NotificationService.clearCompany(selectedCompany);
    reload();
  };

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="hover:bg-white/10 p-2 rounded-full relative transition-colors"
        aria-label="Notifications"
      >
        <Bell size={18} className="text-white" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-rose-500 rounded-full border-2 border-[#354a5f] flex items-center justify-center text-[8px] font-black text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
        {pendingWA > 0 && unreadCount === 0 && (
          <span className="absolute top-1.5 right-1.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#354a5f]" />
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-[100] overflow-hidden animate-in slide-in-from-top-2 duration-200">
            {/* Header */}
            <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
              <div>
                <h4 className="font-black uppercase text-[10px] text-slate-600 tracking-widest">Notifications</h4>
                <p className="text-[9px] text-slate-400 font-bold mt-0.5">
                  {unreadCount} unread · {pendingWA} WhatsApp pending
                </p>
              </div>
              <div className="flex items-center space-x-2">
                {notifications.length > 0 && (
                  <button onClick={handleClearAll}
                    className="flex items-center space-x-1 text-[9px] font-black text-rose-500 hover:text-rose-700 uppercase px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors">
                    <Trash2 size={10} />
                    <span>Clear</span>
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors">
                  <X size={14} className="text-slate-500" />
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex border-b border-slate-100 bg-white">
              {(['all', 'unread', 'pending_wa'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilterType(f)}
                  className={`flex-1 py-2 text-[9px] font-black uppercase tracking-wider transition-colors ${filterType === f ? 'text-blue-700 bg-blue-50 border-b-2 border-blue-600' : 'text-slate-400 hover:bg-slate-50'}`}
                >
                  {f === 'all' ? `All (${notifications.length})` : f === 'unread' ? `Unread (${unreadCount})` : `WA (${pendingWA})`}
                </button>
              ))}
            </div>

            {/* List */}
            <div className="max-h-[480px] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-10 text-center">
                  <Bell size={28} className="mx-auto text-slate-200 mb-3" />
                  <p className="text-[10px] font-bold text-slate-400 uppercase">
                    {filterType === 'pending_wa' ? 'No pending WhatsApp messages' :
                     filterType === 'unread' ? 'All caught up!' : 'No notifications'}
                  </p>
                </div>
              ) : (
                filtered.map(n => (
                  <NotifCard
                    key={n.id}
                    notif={n}
                    onMarkRead={handleMarkRead}
                    onWASent={handleWASent}
                    onWASkipped={handleWASkipped}
                    onNavigate={handleNavigate}
                  />
                ))
              )}
            </div>

            {/* Footer hint */}
            {pendingWA > 0 && (
              <div className="px-4 py-2.5 bg-green-50 border-t border-green-100">
                <p className="text-[9px] font-bold text-green-700 flex items-center gap-1">
                  <MessageCircle size={10} />
                  {pendingWA} message{pendingWA !== 1 ? 's' : ''} ready to send via WhatsApp
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationCenter;
