/**
 * customerNicknames — a customer's personal product-name library (Portal task C).
 *
 * A customer can attach their OWN nickname to our product (e.g. our
 * "NIP-KL-CZS133-L55-W" → their "Bara handle"), so they order by a name they
 * remember instead of memorising codes. Stored per-user in localStorage (a
 * personal, low-stakes preference — not shared master data), keyed by the login
 * id/email so each customer keeps their own library.
 */

const keyFor = (userId: string): string => `gtk_cust_nick:${userId || 'anon'}`;

export type NicknameMap = Record<string, string>;   // productId -> nickname

export const getNicknames = (userId: string): NicknameMap => {
  try { return JSON.parse(localStorage.getItem(keyFor(userId)) || '{}') as NicknameMap; }
  catch { return {}; }
};

/** Set (or clear, when nick is blank) a product's nickname; returns the new map. */
export const setNickname = (userId: string, productId: string, nick: string): NicknameMap => {
  const all = getNicknames(userId);
  const clean = nick.trim();
  if (clean) all[productId] = clean; else delete all[productId];
  try { localStorage.setItem(keyFor(userId), JSON.stringify(all)); } catch { /* quota */ }
  return all;
};
