/**
 * WebAuthn Hook — Fingerprint / Face ID / PIN
 * Falls back gracefully if device doesn't support it
 */

const WEBAUTHN_KEY = 'gt_webauthn_cred';  // credential id stored locally
const REMEMBER_KEY = 'gt_remember_token';  // fallback 30-day token
const REMEMBER_EXP = 'gt_remember_exp';
const DEVICE_PIN_KEY = 'gt_device_pin';    // hashed device PIN (no-biometric fallback)

// ── Check WebAuthn support ────────────────────────────────────────────
export const isWebAuthnSupported = (): boolean => {
  return !!(
    window.PublicKeyCredential &&
    typeof window.PublicKeyCredential === 'function'
  );
};

// ── Check if device has biometric/PIN capability ──────────────────────
export const isPlatformAuthenticatorAvailable = async (): Promise<boolean> => {
  if (!isWebAuthnSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
};

// ── Register device (after first login) ──────────────────────────────
export const registerDevice = async (userId: string, userEmail: string): Promise<boolean> => {
  if (!isWebAuthnSupported()) return false;
  try {
    // Random challenge
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const userId8 = new TextEncoder().encode(userId.slice(0, 32));

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'Glasstech ERP', id: window.location.hostname },
        user: {
          id: userId8,
          name: userEmail,
          displayName: userEmail.split('@')[0],
        },
        pubKeyCredParams: [
          { alg: -7,   type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // device-bound only
          userVerification: 'required',         // PIN or biometric required
          requireResidentKey: true,
        },
        timeout: 60000,
        attestation: 'none',
      },
    }) as PublicKeyCredential | null;

    if (!credential) return false;

    // Save credential ID locally
    const credId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
    localStorage.setItem(WEBAUTHN_KEY, JSON.stringify({ credId, userId }));
    return true;

  } catch (err: any) {
    console.warn('[WebAuthn] Register failed:', err.message);
    return false;
  }
};

// ── Authenticate with device (fingerprint/PIN) ────────────────────────
export const authenticateDevice = async (): Promise<{ success: boolean; userId?: string }> => {
  if (!isWebAuthnSupported()) return { success: false };

  const saved = localStorage.getItem(WEBAUTHN_KEY);
  if (!saved) return { success: false };

  try {
    const { credId, userId } = JSON.parse(saved);
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const credIdBytes = Uint8Array.from(atob(credId), c => c.charCodeAt(0));

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        timeout: 60000,
        allowCredentials: [{
          id: credIdBytes,
          type: 'public-key',
          transports: ['internal'],
        }],
        userVerification: 'required',
        rpId: window.location.hostname,
      },
    });

    if (!assertion) return { success: false };
    return { success: true, userId };

  } catch (err: any) {
    console.warn('[WebAuthn] Auth failed:', err.message);
    return { success: false };
  }
};

// ── Clear device registration ─────────────────────────────────────────
export const clearDeviceAuth = () => {
  localStorage.removeItem(WEBAUTHN_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  localStorage.removeItem(REMEMBER_EXP);
  localStorage.removeItem(DEVICE_PIN_KEY);
};

// ── Device PIN (no-biometric fallback) ────────────────────────────────
// A device-local unlock gate over the already-persisted Supabase session —
// same threat model as the remember token (trusted device), but the secret is
// SHA-256 hashed with a per-device salt instead of stored in the clear. It does
// NOT replace Supabase auth; if the session has expired the caller still falls
// back to a fresh email login. A worker sets it once (after the magic-link
// login) so they unlock with a PIN instead of re-doing the email round-trip.
const sha256Hex = async (s: string): Promise<string> => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
};

export const saveDevicePin = async (userId: string, pin: string): Promise<boolean> => {
  if (!/^\d{4,6}$/.test(pin)) return false;                       // 4–6 digit PIN
  const saltBytes = crypto.getRandomValues(new Uint8Array(12));
  const salt = btoa(String.fromCharCode(...saltBytes));
  const hash = await sha256Hex(salt + ':' + pin);
  localStorage.setItem(DEVICE_PIN_KEY, JSON.stringify({ userId, salt, hash }));
  return true;
};

export const verifyDevicePin = async (pin: string): Promise<{ valid: boolean; userId?: string }> => {
  const raw = localStorage.getItem(DEVICE_PIN_KEY);
  if (!raw) return { valid: false };
  try {
    const { userId, salt, hash } = JSON.parse(raw);
    const check = await sha256Hex(salt + ':' + pin);
    return check === hash ? { valid: true, userId } : { valid: false };
  } catch {
    return { valid: false };
  }
};

export const hasDevicePin = (): boolean => !!localStorage.getItem(DEVICE_PIN_KEY);

// ── Remember Device fallback (30 days) ───────────────────────────────
export const saveRememberToken = (userId: string) => {
  const token = btoa(userId + ':' + Date.now() + ':' + Math.random());
  const exp   = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  localStorage.setItem(REMEMBER_KEY, JSON.stringify({ token, userId }));
  localStorage.setItem(REMEMBER_EXP, String(exp));
};

export const checkRememberToken = (): { valid: boolean; userId?: string } => {
  const stored = localStorage.getItem(REMEMBER_KEY);
  const exp    = localStorage.getItem(REMEMBER_EXP);
  if (!stored || !exp) return { valid: false };
  if (Date.now() > Number(exp)) {
    clearDeviceAuth();
    return { valid: false };
  }
  try {
    const { userId } = JSON.parse(stored);
    return { valid: true, userId };
  } catch {
    return { valid: false };
  }
};

export const hasDeviceRegistered = (): boolean => {
  return !!localStorage.getItem(WEBAUTHN_KEY);
};

export const hasRememberToken = (): boolean => {
  const { valid } = checkRememberToken();
  return valid;
};
