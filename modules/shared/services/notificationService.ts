/**
 * notificationService.ts — Phase 6C
 *
 * Notification service with WhatsApp wa.me link generation.
 * Stores notifications in localStorage with full audit trail.
 * 
 * Events supported:
 *  - cutting_complete    → order ref, destination
 *  - tempering_dispatched → order ref, vendor name
 *  - tempering_returned   → order ref
 *  - delivery_dispatched  → order ref, ETA date
 *  - delivery_confirmed   → order ref
 *  - urgent_insert        → order ref, affected orders
 */

export type NotifEventType =
  | 'cutting_complete'
  | 'tempering_dispatched'
  | 'tempering_returned'
  | 'delivery_dispatched'
  | 'delivery_confirmed'
  | 'urgent_insert'
  | 'hr_approval'
  | 'custom';

export type NotifChannel = 'internal' | 'whatsapp';

export interface WANotification {
  id: string;
  createdAt: string;
  eventType: NotifEventType;
  orderRef: string;
  targetCompany: string;     // which company's panel sees this
  recipientName: string;
  recipientPhone?: string;   // +92XXXXXXXXXX format
  message: string;           // pre-filled WhatsApp message
  waLink?: string;           // wa.me URL if phone available
  isRead: boolean;
  waStatus: 'pending' | 'sent' | 'skipped';
  sentAt?: string;
  title: string;
  link?: string;             // in-app navigation link
  channel: NotifChannel;
}

const STORAGE_KEY = 'gtk_notifications_v2';
const LEGACY_KEY  = 'gtk_notifications';

// ─── helpers ─────────────────────────────────────────────────────────

const nowISO = () => new Date().toISOString();
const genId  = () => `NOTIF-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

const cleanPhone = (phone?: string): string | undefined => {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) return `92${digits.slice(1)}`;
  if (digits.startsWith('92') && digits.length === 12) return digits;
  if (digits.length === 10) return `92${digits}`;
  return undefined;
};

const buildWaLink = (phone: string | undefined, message: string): string | undefined => {
  if (!phone) return undefined;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
};

// ─── message templates ────────────────────────────────────────────────

const TEMPLATES: Record<NotifEventType, (data: Record<string, string>) => string> = {
  cutting_complete: (d) =>
    `🔷 *GlassCo Update*\nOrder *${d.orderRef}*: Cutting complete. Glass dispatching to tempering today.\n📅 ${d.date}`,

  tempering_dispatched: (d) =>
    `🚛 *GlassCo Update*\nOrder *${d.orderRef}*: Glass sent to *${d.vendor}* for tempering.\n⏱️ Expected return: ${d.eta || '2-3 working days'}`,

  tempering_returned: (d) =>
    `✅ *GlassCo Update*\nOrder *${d.orderRef}*: Tempering complete. Glass back in factory — final QC in progress.`,

  delivery_dispatched: (d) =>
    `🚚 *GlassCo Update*\nOrder *${d.orderRef}*: Dispatched for delivery.\n📅 ETA: *${d.eta || 'Today'}*\n🚛 Vehicle: ${d.vehicle || '—'}`,

  delivery_confirmed: (d) =>
    `🎉 *GlassCo Update*\nOrder *${d.orderRef}*: Delivered successfully.\nThank you for your business! 🙏`,

  urgent_insert: (d) =>
    `⚠️ *Production Alert*\nUrgent order *${d.orderRef}* inserted into today's plan.\nAffected orders: ${d.affected || 'none'}\nPlease review updated schedule.`,

  hr_approval: (d) =>
    `📋 *HR Update*: ${d.message}`,

  custom: (d) =>
    d.message,
};

// ─── core service ─────────────────────────────────────────────────────

export const NotificationService = {

  /** Load all notifications */
  getAll: (): WANotification[] => {
    try {
      // Also migrate legacy notifications
      const legacy: any[] = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
      const current: WANotification[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      
      // Migrate legacy to new format (one-time)
      const migratedIds = new Set(current.map(n => n.id));
      const migrated = legacy
        .filter((n: any) => !migratedIds.has(n.id))
        .map((n: any): WANotification => ({
          id: n.id || genId(),
          createdAt: n.date || nowISO(),
          eventType: 'hr_approval',
          orderRef: '',
          targetCompany: n.targetCompany || 'Glassco',
          recipientName: '',
          message: n.message || '',
          isRead: n.isRead || false,
          waStatus: 'skipped',
          title: n.title || 'Notification',
          link: n.link,
          channel: 'internal',
        }));

      return [...migrated, ...current].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch { return []; }
  },

  /** Get for specific company */
  getForCompany: (company: string): WANotification[] => {
    return NotificationService.getAll().filter(n => n.targetCompany === company);
  },

  /** Get unread count */
  getUnreadCount: (company: string): number => {
    return NotificationService.getForCompany(company).filter(n => !n.isRead).length;
  },

  /** Create a new notification */
  create: (params: {
    eventType: NotifEventType;
    orderRef: string;
    targetCompany: string;
    recipientName: string;
    recipientPhone?: string;
    title: string;
    templateData?: Record<string, string>;
    link?: string;
    channel?: NotifChannel;
  }): WANotification => {
    const phone = cleanPhone(params.recipientPhone);
    const templateData: Record<string, string> = { orderRef: params.orderRef, date: new Date().toLocaleDateString('en-PK'), ...params.templateData };
    const message = TEMPLATES[params.eventType]?.(templateData) || templateData.message || '';
    const waLink = phone ? buildWaLink(phone, message) : undefined;

    const notif: WANotification = {
      id: genId(),
      createdAt: nowISO(),
      eventType: params.eventType,
      orderRef: params.orderRef,
      targetCompany: params.targetCompany,
      recipientName: params.recipientName,
      recipientPhone: phone,
      message,
      waLink,
      isRead: false,
      waStatus: 'pending',
      title: params.title,
      link: params.link,
      channel: params.channel || (waLink ? 'whatsapp' : 'internal'),
    };

    const all = NotificationService.getAll();
    const updated = [notif, ...all];
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated.filter(n => n.createdAt > new Date(Date.now() - 30 * 86400000).toISOString()))); } catch {}
    return notif;
  },

  /** Mark as read */
  markRead: (id: string): void => {
    const all = NotificationService.getAll();
    const updated = all.map(n => n.id === id ? { ...n, isRead: true } : n);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
  },

  /** Mark WhatsApp as sent */
  markWASent: (id: string): void => {
    const all = NotificationService.getAll();
    const updated = all.map(n => n.id === id ? { ...n, waStatus: 'sent' as const, sentAt: nowISO(), isRead: true } : n);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
  },

  /** Mark WA as skipped */
  markWASkipped: (id: string): void => {
    const all = NotificationService.getAll();
    const updated = all.map(n => n.id === id ? { ...n, waStatus: 'skipped' as const, isRead: true } : n);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
  },

  /** Clear company notifications */
  clearCompany: (company: string): void => {
    const all = NotificationService.getAll();
    const remaining = all.filter(n => n.targetCompany !== company);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining)); } catch {}
  },

  /** Quick helpers for common events */
  notifyCuttingComplete: (orderRef: string, company: string, clientName: string, clientPhone?: string) =>
    NotificationService.create({
      eventType: 'cutting_complete', orderRef,
      targetCompany: company,
      recipientName: clientName, recipientPhone: clientPhone,
      title: `Cutting Done — ${orderRef}`,
      link: '/production',
    }),

  notifyTemperingDispatched: (orderRef: string, company: string, clientName: string, vendorName: string, clientPhone?: string) =>
    NotificationService.create({
      eventType: 'tempering_dispatched', orderRef,
      targetCompany: company,
      recipientName: clientName, recipientPhone: clientPhone,
      title: `Dispatched to ${vendorName} — ${orderRef}`,
      templateData: { vendor: vendorName },
      link: '/logistics',
    }),

  notifyDeliveryDispatched: (orderRef: string, company: string, clientName: string, eta: string, vehicle: string, clientPhone?: string) =>
    NotificationService.create({
      eventType: 'delivery_dispatched', orderRef,
      targetCompany: company,
      recipientName: clientName, recipientPhone: clientPhone,
      title: `Out for Delivery — ${orderRef}`,
      templateData: { eta, vehicle },
      link: '/logistics',
    }),

  notifyDeliveryConfirmed: (orderRef: string, company: string, clientName: string, clientPhone?: string) =>
    NotificationService.create({
      eventType: 'delivery_confirmed', orderRef,
      targetCompany: company,
      recipientName: clientName, recipientPhone: clientPhone,
      title: `Delivered ✓ — ${orderRef}`,
    }),
};

export default NotificationService;
