/**
 * podService.ts — Sprint 12
 *
 * Proof-of-delivery orchestration:
 *   - Upload driver photos to Supabase Storage (`pod-evidence` bucket)
 *   - Persist customer signature
 *   - Generate + verify customer OTP via Edge Function
 *   - Mark dispatch POD-complete (writes pod_completed_at)
 *
 * The driver hits these methods from /driver/:tripId — a public route
 * gated by the dispatch_token (driver_token col on tempering_dispatches).
 */

import { supabase } from '@/src/services/supabaseClient';
import { DispatchService } from '@/modules/procurement/services/dispatchService';

// ── Types ─────────────────────────────────────────────────────────────

export type PodPhotoType = 'GATE_OUT' | 'CUSTOMER_DELIVERY' | 'DAMAGE' | 'TEMPERING_HANDOFF';

export interface PodPhoto {
  id:           number;
  dispatch_id:  string;
  photo_type:   PodPhotoType;
  storage_path: string;
  caption?:     string;
  taken_at:     string;
  taken_by?:    string;
  geo_lat?:     number;
  geo_lng?:     number;
}

export interface CustomerSignature {
  id:              number;
  dispatch_id:     string;
  customer_name:   string;
  customer_phone?: string;
  signature_data:  string;
  signed_at:       string;
}

export interface DriverDispatchView {
  id:             string;
  company:        string;
  status:         string;
  vehicleNo:      string;
  driverName:     string;
  plantName:      string;
  pieceIds:       string[];
  totalSqFt:      number;
  date:           string;
  pod_completed_at?: string;
  pod_otp_verified?: boolean;
}

interface ServiceResult<T = void> {
  data?:  T;
  error?: string;
}

// ── Internal ──────────────────────────────────────────────────────────

const BUCKET = 'pod-evidence';

function asError(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e) {
    return String((e as { message: unknown }).message);
  }
  return 'Unknown error';
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:(.+?);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  const bin  = atob(m[2]);
  const arr  = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ── Public API ────────────────────────────────────────────────────────

export const PodService = {
  /**
   * Resolve a dispatch by id + token. The /driver/:tripId page calls
   * this on mount — if the token doesn't match driver_token, returns
   * an error and the page renders an "Invalid link" state.
   */
  async getDispatchForDriver(
    dispatchId: string,
    token:      string,
  ): Promise<ServiceResult<DriverDispatchView>> {
    if (!dispatchId || !token) return { error: 'Missing dispatch id or token' };

    try {
      const { data, error } = await supabase
        .from('tempering_dispatches')
        .select('id, company, status, driver_token, pod_completed_at, pod_otp_verified, data')
        .eq('id', dispatchId)
        .single();

      if (error) return { error: error.message };
      if (!data) return { error: 'Dispatch not found' };

      type Row = {
        id: string; company: string; status: string;
        driver_token: string | null;
        pod_completed_at: string | null;
        pod_otp_verified: boolean | null;
        data: Record<string, unknown> | null;
      };
      const r = data as Row;

      if (r.driver_token !== token) {
        return { error: 'Invalid driver link — token mismatch' };
      }

      const d = (r.data ?? {}) as {
        vehicleNo?: string; driverName?: string; plantName?: string;
        pieceIds?: string[]; totalSqFt?: number; date?: string;
      };

      return {
        data: {
          id:                r.id,
          company:           r.company,
          status:            r.status,
          vehicleNo:         d.vehicleNo  ?? '',
          driverName:        d.driverName ?? '',
          plantName:         d.plantName  ?? '',
          pieceIds:          d.pieceIds   ?? [],
          totalSqFt:         d.totalSqFt  ?? 0,
          date:              d.date       ?? '',
          pod_completed_at:  r.pod_completed_at ?? undefined,
          pod_otp_verified:  r.pod_otp_verified ?? false,
        },
      };
    } catch (e) {
      return { error: asError(e) };
    }
  },

  /**
   * Upload a photo (base64 dataURL) to Supabase Storage and persist the
   * row in dispatch_photos. The bucket key encodes company + dispatch +
   * photo type so 7-year retention rules can target by prefix.
   */
  async uploadPhoto(params: {
    dispatchId:  string;
    company:     string;
    photoType:   PodPhotoType;
    dataUrl:     string;
    caption?:    string;
    takenBy?:    string;
    geo?:        { lat: number; lng: number };
  }): Promise<ServiceResult<PodPhoto>> {
    const { dispatchId, company, photoType, dataUrl, caption, takenBy, geo } = params;

    const blob = dataUrlToBlob(dataUrl);
    if (!blob) return { error: 'Invalid image data' };

    const ts   = Date.now();
    const path = `${company}/${dispatchId}/${photoType}_${ts}.jpg`;

    try {
      // 1. Storage upload
      const up = await supabase.storage.from(BUCKET).upload(path, blob, {
        cacheControl: '31536000',     // 1 year
        upsert:       false,
        contentType:  blob.type || 'image/jpeg',
      });
      if (up.error) return { error: `Storage upload failed: ${up.error.message}` };

      // 2. Row in dispatch_photos
      const ins = await supabase.from('dispatch_photos').insert({
        dispatch_id:   dispatchId,
        company,
        photo_type:    photoType,
        storage_path:  path,
        caption:       caption ?? null,
        taken_by:      takenBy ?? null,
        geo_lat:       geo?.lat ?? null,
        geo_lng:       geo?.lng ?? null,
      }).select().single();

      if (ins.error) {
        // Best-effort cleanup of the orphan blob
        await supabase.storage.from(BUCKET).remove([path]);
        return { error: `Persist failed: ${ins.error.message}` };
      }

      return { data: ins.data as PodPhoto };
    } catch (e) {
      return { error: asError(e) };
    }
  },

  /**
   * Persist a customer signature dataURL. Linked to the dispatch only;
   * downstream invoice prints can pull it via dispatch_id.
   */
  async saveSignature(params: {
    dispatchId:     string;
    company:        string;
    customerName:   string;
    customerPhone?: string;
    signatureData:  string;     // dataURL
    geo?:           { lat: number; lng: number };
  }): Promise<ServiceResult<CustomerSignature>> {
    const { dispatchId, company, customerName, customerPhone, signatureData, geo } = params;
    if (!signatureData?.startsWith('data:image/')) {
      return { error: 'Invalid signature data' };
    }
    if (!customerName?.trim()) {
      return { error: 'Customer name required' };
    }

    try {
      const { data, error } = await supabase.from('customer_signatures').insert({
        dispatch_id:     dispatchId,
        company,
        customer_name:   customerName.trim(),
        customer_phone:  customerPhone?.trim() ?? null,
        signature_data:  signatureData,
        geo_lat:         geo?.lat ?? null,
        geo_lng:         geo?.lng ?? null,
      }).select().single();

      if (error) return { error: error.message };
      return { data: data as CustomerSignature };
    } catch (e) {
      return { error: asError(e) };
    }
  },

  /**
   * Trigger the generate-delivery-otp Edge Function. The plaintext OTP
   * is sent directly to the customer; only its hash is stored.
   */
  async requestOtp(params: {
    dispatchId:     string;
    customerPhone:  string;
    channel?:       'sms' | 'whatsapp';
  }): Promise<ServiceResult<{ expires_at: string }>> {
    const { dispatchId, customerPhone, channel = 'whatsapp' } = params;

    try {
      const { data, error } = await supabase.functions.invoke('generate-delivery-otp', {
        body: {
          dispatch_id:    dispatchId,
          customer_phone: customerPhone,
          channel,
        },
      });

      if (error) return { error: error.message };
      const r = data as { ok?: boolean; expires_at?: string; channel_error?: string };
      if (!r.ok) return { error: r.channel_error ?? 'OTP send failed' };
      return { data: { expires_at: r.expires_at ?? '' } };
    } catch (e) {
      return { error: asError(e) };
    }
  },

  /**
   * Verify a 6-digit OTP entered by the driver on his phone.
   */
  async verifyOtp(params: {
    dispatchId: string;
    token:      string;
    otp:        string;
  }): Promise<ServiceResult<{ verified: boolean }>> {
    const { dispatchId, token, otp } = params;
    if (!/^\d{6}$/.test(otp)) return { error: 'OTP must be 6 digits' };

    try {
      const { data, error } = await supabase.rpc('verify_delivery_otp', {
        p_dispatch_id: dispatchId,
        p_token:       token,
        p_otp_plain:   otp,
      });
      if (error) {
        const msg = error.message ?? '';
        if (msg.includes('invalid_token'))      return { error: 'Invalid driver link' };
        if (msg.includes('no_active_otp'))      return { error: 'No active OTP — request a new one' };
        if (msg.includes('otp_expired'))        return { error: 'OTP expired — request a new one' };
        if (msg.includes('too_many_attempts'))  return { error: 'Too many wrong tries — request a new OTP' };
        return { error: msg };
      }
      return { data: { verified: !!data } };
    } catch (e) {
      return { error: asError(e) };
    }
  },

  /**
   * Mark the dispatch POD-complete. Called once driver has captured
   * gate-out photo + delivery photo + signature + verified OTP.
   *
   * Side effects:
   *   - tempering_dispatches.pod_completed_at = now()
   *   - dispatch_events row (event_type='ARRIVED' if not yet logged)
   */
  async completePod(dispatchId: string): Promise<ServiceResult<void>> {
    try {
      const { error } = await supabase
        .from('tempering_dispatches')
        .update({ pod_completed_at: new Date().toISOString() })
        .eq('id', dispatchId);
      if (error) return { error: error.message };

      // Best-effort lifecycle event — ignore failure
      await DispatchService.markArrived(dispatchId);
      return {};
    } catch (e) {
      return { error: asError(e) };
    }
  },

  /** Get all photos for a dispatch (for the office-side review UI). */
  async getPhotos(dispatchId: string): Promise<ServiceResult<PodPhoto[]>> {
    try {
      const { data, error } = await supabase
        .from('dispatch_photos')
        .select('*')
        .eq('dispatch_id', dispatchId)
        .order('taken_at', { ascending: true });
      if (error) return { error: error.message };
      return { data: (data ?? []) as PodPhoto[] };
    } catch (e) {
      return { error: asError(e) };
    }
  },

  /** Resolve a public URL for a stored photo path. */
  getPhotoUrl(storagePath: string): string {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    return data.publicUrl;
  },
};
