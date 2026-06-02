/**
 * DriverScreen — Sprint 12
 *
 * Public, mobile-first POD page. Reached via tokenised link sent to
 * the driver over WhatsApp/SMS:
 *
 *   /#/driver/{dispatchId}?t={token}
 *
 * No app login. Token is verified against tempering_dispatches.driver_token.
 *
 * Driver flow (top to bottom — single scrolling page):
 *   1. Trip header (vehicle, destination, piece count)
 *   2. Gate-out photo (loaded truck before exit)   [optional]
 *   3. Delivery photo (glass at customer site)
 *   4. Customer name + phone
 *   5. Customer signature pad
 *   6. Request + verify OTP (customer side proof)
 *   7. Submit → POD complete
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { toast, Toaster } from 'sonner';
import {
  Truck, MapPin, Package, ShieldCheck, Camera,
  Loader2, CheckCircle2, AlertTriangle, Phone, RefreshCw,
} from 'lucide-react';
import SignaturePad   from '@/src/components/SignaturePad';
import PhotoCapture   from '@/src/components/PhotoCapture';
import { PodService, DriverDispatchView } from '@/modules/sales/services/podService';
import { useDriverGeoEmitter } from '@/src/hooks/useDriverGeoEmitter';   // Sprint 14

// ── Helpers ───────────────────────────────────────────────────────────

function tryGetGeo(): Promise<{ lat: number; lng: number } | undefined> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(undefined);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      ()  => resolve(undefined),
      { timeout: 4000, maximumAge: 60_000 },
    );
  });
}

// ── Component ─────────────────────────────────────────────────────────

const DriverScreen: React.FC = () => {
  const { tripId = '' }     = useParams<{ tripId: string }>();
  const [params]            = useSearchParams();
  const token               = params.get('t') ?? '';

  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [dispatch, setDispatch] = useState<DriverDispatchView | null>(null);

  // Form state
  const [gateOutPhoto,    setGateOutPhoto]    = useState('');
  const [deliveryPhoto,   setDeliveryPhoto]   = useState('');
  const [customerName,    setCustomerName]    = useState('');
  const [customerPhone,   setCustomerPhone]   = useState('');
  const [signature,       setSignature]       = useState('');
  const [otp,             setOtp]             = useState('');
  const [otpRequested,    setOtpRequested]    = useState(false);
  const [otpVerified,     setOtpVerified]     = useState(false);
  const [submitting,      setSubmitting]      = useState(false);
  const [requestingOtp,   setRequestingOtp]   = useState(false);
  const [completed,       setCompleted]       = useState(false);

  // ── Sprint 14: Emit driver GPS while POD is in progress ────────
  useDriverGeoEmitter({
    vehicleId: dispatch?.vehicleNo ?? '',
    tripId:    dispatch?.id,
    token,
    enabled:   !!dispatch && !completed,
  });

  // ── Initial fetch ────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await PodService.getDispatchForDriver(tripId, token);
      if (!alive) return;
      if (r.error || !r.data) {
        setError(r.error ?? 'Could not load dispatch');
      } else {
        setDispatch(r.data);
        setOtpVerified(!!r.data.pod_otp_verified);
        setCompleted(!!r.data.pod_completed_at);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [tripId, token]);

  // ── Actions ──────────────────────────────────────────────────────
  const requestOtp = useCallback(async () => {
    if (!dispatch || !customerPhone) {
      toast.error('Enter customer phone first');
      return;
    }
    setRequestingOtp(true);
    const r = await PodService.requestOtp({
      dispatchId:    dispatch.id,
      customerPhone,
      channel:       'whatsapp',
    });
    setRequestingOtp(false);
    if (r.error) {
      toast.error(r.error, { duration: 6000 });
      return;
    }
    setOtpRequested(true);
    toast.success('OTP sent to customer — ask them to share the code', { duration: 6000 });
  }, [dispatch, customerPhone]);

  const verifyOtp = useCallback(async () => {
    if (!dispatch || !/^\d{6}$/.test(otp)) {
      toast.error('Enter the 6-digit OTP');
      return;
    }
    const r = await PodService.verifyOtp({
      dispatchId: dispatch.id,
      token,
      otp,
    });
    if (r.error) {
      toast.error(r.error, { duration: 6000 });
      return;
    }
    if (r.data?.verified) {
      setOtpVerified(true);
      toast.success('OTP verified — ready to submit', { duration: 4000 });
    } else {
      toast.error('Wrong OTP — try again');
    }
  }, [dispatch, otp, token]);

  const submit = useCallback(async () => {
    if (!dispatch) return;
    if (!deliveryPhoto)   { toast.error('Take delivery photo');           return; }
    if (!customerName)    { toast.error('Enter customer name');           return; }
    if (!signature)       { toast.error('Customer signature required');   return; }
    if (!otpVerified)     { toast.error('Verify OTP first');              return; }

    setSubmitting(true);
    const geo = await tryGetGeo();

    try {
      // 1. Gate-out photo (optional)
      if (gateOutPhoto) {
        const r1 = await PodService.uploadPhoto({
          dispatchId: dispatch.id,
          company:    dispatch.company,
          photoType:  'GATE_OUT',
          dataUrl:    gateOutPhoto,
          takenBy:    dispatch.driverName,
          geo,
        });
        if (r1.error) throw new Error(`Gate-out photo: ${r1.error}`);
      }

      // 2. Delivery photo
      const r2 = await PodService.uploadPhoto({
        dispatchId: dispatch.id,
        company:    dispatch.company,
        photoType:  'CUSTOMER_DELIVERY',
        dataUrl:    deliveryPhoto,
        takenBy:    dispatch.driverName,
        geo,
      });
      if (r2.error) throw new Error(`Delivery photo: ${r2.error}`);

      // 3. Signature
      const r3 = await PodService.saveSignature({
        dispatchId:    dispatch.id,
        company:       dispatch.company,
        customerName,
        customerPhone,
        signatureData: signature,
        geo,
      });
      if (r3.error) throw new Error(`Signature: ${r3.error}`);

      // 4. Mark POD complete
      const r4 = await PodService.completePod(dispatch.id);
      if (r4.error) throw new Error(`Complete: ${r4.error}`);

      setCompleted(true);
      toast.success('POD submitted — thank you!', { duration: 6000 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg, { duration: 9000 });
    } finally {
      setSubmitting(false);
    }
  }, [dispatch, gateOutPhoto, deliveryPhoto, customerName, customerPhone, signature, otpVerified]);

  // ── Render: loading / error states ───────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <Loader2 className="animate-spin" size={32}/>
          <span className="text-sm font-medium">Loading delivery…</span>
        </div>
      </div>
    );
  }

  if (error || !dispatch) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-6 max-w-sm text-center">
          <AlertTriangle className="text-rose-500 mx-auto mb-3" size={40}/>
          <h1 className="text-lg font-black text-slate-900 mb-1">Cannot open delivery</h1>
          <p className="text-sm text-slate-600">{error ?? 'Unknown error'}</p>
          <p className="text-xs text-slate-400 mt-3">
            If you got this link from GlassTech and it's not working, ask dispatch to resend.
          </p>
        </div>
      </div>
    );
  }

  // ── Render: completed state ──────────────────────────────────────
  if (completed) {
    return (
      <div className="min-h-screen bg-emerald-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm text-center">
          <CheckCircle2 className="text-emerald-500 mx-auto mb-4" size={56}/>
          <h1 className="text-xl font-black text-slate-900 mb-2">POD Submitted</h1>
          <p className="text-sm text-slate-600">
            Delivery <span className="font-mono font-bold">{dispatch.id}</span> is closed.
          </p>
          <p className="text-xs text-slate-400 mt-4">You can close this page now.</p>
        </div>
      </div>
    );
  }

  // ── Render: main flow ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Toaster position="top-center" />

      {/* Header */}
      <header className="bg-gradient-to-br from-blue-700 to-blue-900 text-white p-5 shadow-lg sticky top-0 z-10">
        <div className="flex items-center gap-2 mb-1">
          <Truck size={18}/>
          <span className="text-xs font-bold uppercase tracking-wider opacity-80">GlassTech Delivery</span>
        </div>
        <h1 className="text-xl font-black">{dispatch.id}</h1>
        <div className="text-xs opacity-90 mt-1 flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1"><MapPin size={12}/>{dispatch.plantName || '—'}</span>
          <span className="flex items-center gap-1"><Package size={12}/>{dispatch.pieceIds.length} pcs · {dispatch.totalSqFt.toFixed(0)} sqft</span>
        </div>
      </header>

      <div className="max-w-md mx-auto p-4 space-y-5">

        {/* 1. Gate-out photo (optional) */}
        <Section title="1. Gate-Out Photo" subtitle="Optional — loaded truck at gate">
          <PhotoCapture
            label="Photo of loaded truck"
            onChange={setGateOutPhoto}
          />
        </Section>

        {/* 2. Delivery photo */}
        <Section title="2. Delivery Photo" subtitle="Required — glass at customer site" required>
          <PhotoCapture
            label="Photo of delivered glass"
            onChange={setDeliveryPhoto}
          />
        </Section>

        {/* 3. Customer details */}
        <Section title="3. Customer Details" required>
          <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
            Name <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="Person receiving delivery"
            className="w-full px-3 py-2.5 rounded-lg border-2 border-slate-200 focus:border-blue-500 focus:outline-none text-sm"
          />
          <label className="block text-xs font-bold uppercase text-slate-500 mb-1 mt-3">
            Phone (for OTP)
          </label>
          <div className="flex gap-2">
            <input
              type="tel"
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              placeholder="+923001234567"
              className="flex-1 px-3 py-2.5 rounded-lg border-2 border-slate-200 focus:border-blue-500 focus:outline-none text-sm font-mono"
            />
            <a
              href={`tel:${customerPhone}`}
              className={`px-3 py-2.5 rounded-lg ${customerPhone ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400 pointer-events-none'} flex items-center`}
              aria-label="Call customer"
            >
              <Phone size={16}/>
            </a>
          </div>
        </Section>

        {/* 4. Signature */}
        <Section title="4. Customer Signature" required>
          <SignaturePad onChange={setSignature} height={180}/>
        </Section>

        {/* 5. OTP verification */}
        <Section title="5. Verify Customer OTP" subtitle="Sent to customer phone" required>
          {!otpRequested && !otpVerified && (
            <button
              type="button"
              onClick={requestOtp}
              disabled={requestingOtp || !customerPhone}
              className="w-full px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-sm flex items-center justify-center gap-2"
            >
              {requestingOtp ? <><Loader2 size={16} className="animate-spin"/> Sending…</>
                             : <><RefreshCw size={14}/> Send OTP to customer</>}
            </button>
          )}

          {otpRequested && !otpVerified && (
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-2">
                6-digit code from customer
              </label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  className="flex-1 px-4 py-3 rounded-lg border-2 border-slate-200 focus:border-blue-500 focus:outline-none text-2xl font-mono font-black tracking-[0.4em] text-center"
                />
                <button
                  type="button"
                  onClick={verifyOtp}
                  disabled={otp.length !== 6}
                  className="px-5 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white font-bold text-sm"
                >
                  Verify
                </button>
              </div>
              <button
                type="button"
                onClick={requestOtp}
                disabled={requestingOtp}
                className="text-xs text-slate-500 mt-2 underline"
              >
                Resend OTP
              </button>
            </div>
          )}

          {otpVerified && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={20}/>
              <span className="font-bold text-sm">OTP verified</span>
            </div>
          )}
        </Section>

        {/* Submit */}
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !deliveryPhoto || !customerName || !signature || !otpVerified}
          className="w-full mt-6 px-5 py-4 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 hover:from-emerald-600 hover:to-emerald-800 disabled:from-slate-300 disabled:to-slate-400 text-white font-black text-base flex items-center justify-center gap-2 shadow-lg"
        >
          {submitting ? <><Loader2 size={20} className="animate-spin"/> Submitting…</>
                       : <><ShieldCheck size={20}/> Submit POD</>}
        </button>

        <p className="text-center text-[10px] text-slate-400 mt-2">
          GlassTech ERP — secure delivery confirmation
        </p>
      </div>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────

const Section: React.FC<{
  title:    string;
  subtitle?: string;
  required?: boolean;
  children: React.ReactNode;
}> = ({ title, subtitle, required, children }) => (
  <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">
        {title}
        {required && <span className="text-rose-500 ml-1">*</span>}
      </h2>
      {subtitle && <span className="text-[10px] text-slate-400">{subtitle}</span>}
    </div>
    {children}
  </section>
);

export default DriverScreen;
