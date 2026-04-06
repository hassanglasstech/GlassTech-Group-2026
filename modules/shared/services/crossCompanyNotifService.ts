/**
 * crossCompanyNotifService.ts — C-03 Fix
 *
 * Replaces direct localStorage writes for cross-company notifications
 * with Supabase-primary storage so approvals are visible across devices.
 *
 * Table: cross_company_notifications
 * Fallback: localStorage (gtk_notifications) for offline mode
 */

import { supabase } from '@/src/services/supabaseClient';
import { toast }    from 'sonner';

export interface CrossCompanyNotification {
  id:            string;
  targetCompany: string;   // which company sees it
  fromCompany:   string;   // which company sent it
  title:         string;
  message:       string;
  isRead:        boolean;
  date:          string;   // ISO
  link?:         string;
  type:          'requisition_submitted' | 'requisition_approved' | 'requisition_rejected' | 'general';
  referenceId?:  string;   // PR id
}

const LS_KEY = 'gtk_cross_company_notifs';

// ── Local fallback helpers ────────────────────────────────────────────────────
const getLocal  = (): CrossCompanyNotification[] => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
};
const saveLocal = (d: CrossCompanyNotification[]) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch {}
};

// ── Push a notification — Supabase primary, localStorage fallback ─────────────
export async function pushCrossCompanyNotif(
  notif: Omit<CrossCompanyNotification, 'id' | 'isRead' | 'date'>
): Promise<void> {
  const full: CrossCompanyNotification = {
    ...notif,
    id:     `CCN-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
    isRead: false,
    date:   new Date().toISOString(),
  };

  // Always save locally first
  saveLocal([...getLocal(), full]);

  // Push to Supabase
  try {
    const { error } = await supabase.from('cross_company_notifications').insert({
      id:             full.id,
      target_company: full.targetCompany,
      from_company:   full.fromCompany,
      title:          full.title,
      message:        full.message,
      is_read:        false,
      type:           full.type,
      reference_id:   full.referenceId || null,
      link:           full.link        || null,
      created_at:     full.date,
    });
    if (error) {
      console.warn('[CrossCompanyNotif] Supabase push failed (offline?):', error.message);
    }
  } catch (e) {
    console.warn('[CrossCompanyNotif] Supabase unavailable — saved locally only.');
  }
}

// ── Get notifications for a company — Supabase primary ───────────────────────
export async function getCrossCompanyNotifs(
  targetCompany: string
): Promise<CrossCompanyNotification[]> {
  try {
    const { data, error } = await supabase
      .from('cross_company_notifications')
      .select('*')
      .eq('target_company', targetCompany)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data?.length) {
      const mapped: CrossCompanyNotification[] = data.map((r: any) => ({
        id:            r.id,
        targetCompany: r.target_company,
        fromCompany:   r.from_company,
        title:         r.title,
        message:       r.message,
        isRead:        r.is_read,
        date:          r.created_at,
        link:          r.link,
        type:          r.type,
        referenceId:   r.reference_id,
      }));
      // Update local cache
      const others = getLocal().filter(n => n.targetCompany !== targetCompany);
      saveLocal([...others, ...mapped]);
      return mapped;
    }
  } catch {}

  // Fallback to localStorage
  return getLocal().filter(n => n.targetCompany === targetCompany);
}

// ── Mark as read ──────────────────────────────────────────────────────────────
export async function markCrossCompanyNotifRead(id: string): Promise<void> {
  // Local
  saveLocal(getLocal().map(n => n.id === id ? { ...n, isRead: true } : n));
  // Supabase
  try {
    await supabase.from('cross_company_notifications')
      .update({ is_read: true })
      .eq('id', id);
  } catch {}
}

// ── Unread count for a company ────────────────────────────────────────────────
export function getCrossCompanyUnreadCount(targetCompany: string): number {
  return getLocal().filter(n => n.targetCompany === targetCompany && !n.isRead).length;
}
