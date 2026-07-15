/**
 * productSimilarity — ERP-wide "you may be adding a duplicate" detector.
 *
 * When a product is saved, we warn (not block) if another product in the same
 * company has the SAME or a CLOSE-MATCH code, or the SAME / near-identical name.
 * Pure functions so they can be unit-tested and reused by every product form
 * (Nippon / Glassco / GTK-GTI). The UI decides how to surface the result
 * (confirmModal "save anyway?").
 */

export interface ProductLike {
  id: string;
  description?: string;
  profileCode?: string;
  modelNo?: string;
  itemCode?: string;
  company?: string;
}

export type SimilarReason = 'same-code' | 'near-code' | 'same-name' | 'near-name';

export interface SimilarMatch {
  product: ProductLike;
  reason: SimilarReason;
}

const REASON_RANK: Record<SimilarReason, number> = {
  'same-code': 0, 'near-code': 1, 'same-name': 2, 'near-name': 3,
};

export const normCode = (s?: string): string => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const normName = (s?: string): string => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Classic Levenshtein edit distance (small strings — codes/names). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const cur = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      cur[j + 1] = Math.min(cur[j] + 1, prev[j + 1] + 1, prev[j] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

function codesOf(p: ProductLike): string[] {
  return [p.profileCode, p.modelNo, p.itemCode].map(normCode).filter(Boolean);
}

/**
 * Find products similar to `candidate`. Same-company set should be passed in
 * (caller already has it). Excludes the candidate itself (by id) and `selfId`
 * (the row being edited). Returns up to `limit` matches, best (most certain) first.
 */
export function findSimilarProducts(
  candidate: ProductLike,
  existing: ProductLike[],
  opts?: { selfId?: string; limit?: number },
): SimilarMatch[] {
  const selfId = opts?.selfId;
  const limit = opts?.limit ?? 6;
  const cCodes = codesOf(candidate);
  const cName = normName(candidate.description);
  const out: SimilarMatch[] = [];
  const seen = new Set<string>();

  for (const p of existing) {
    if (!p || !p.id) continue;
    if (p.id === candidate.id || p.id === selfId) continue;
    if (seen.has(p.id)) continue;

    const pCodes = codesOf(p);
    let reason: SimilarReason | null = null;

    // ── Code match (strongest signal) ──────────────────────────────────
    outer:
    for (const cc of cCodes) {
      for (const pc of pCodes) {
        if (!cc || !pc) continue;
        if (cc === pc) { reason = 'same-code'; break outer; }
        // near = one edit apart on codes of a meaningful length (typo / decimal)
        if (cc.length >= 4 && pc.length >= 4 && levenshtein(cc, pc) <= 1) {
          reason = 'near-code'; // keep scanning in case an exact match appears
        }
      }
    }

    // ── Name match (only if no code match already) ─────────────────────
    const pn = normName(p.description);
    if (!reason && cName && pn) {
      if (cName === pn) reason = 'same-name';
      else {
        const maxLen = Math.max(cName.length, pn.length);
        // near-name: within ~15% edits, but never for very short names
        if (maxLen >= 6 && levenshtein(cName, pn) <= Math.max(1, Math.floor(maxLen * 0.15))) {
          reason = 'near-name';
        }
      }
    }

    if (reason) { out.push({ product: p, reason }); seen.add(p.id); }
  }

  return out.sort((a, b) => REASON_RANK[a.reason] - REASON_RANK[b.reason]).slice(0, limit);
}

const REASON_LABEL: Record<SimilarReason, string> = {
  'same-code': 'same code',
  'near-code': 'almost-same code',
  'same-name': 'same name',
  'near-name': 'almost-same name',
};

/** Human message for confirmModal("...save anyway?"). */
export function similarityMessage(candidate: ProductLike, matches: SimilarMatch[]): string {
  const lines = matches.map(m => {
    const code = (m.product.profileCode || m.product.modelNo || m.product.id || '').toUpperCase();
    const name = m.product.description || '(no name)';
    return `• ${code} — ${name}  [${REASON_LABEL[m.reason]}]`;
  });
  const many = matches.length > 1;
  return (
    `${matches.length} existing product${many ? 's' : ''} look${many ? '' : 's'} similar to this one:\n\n` +
    `${lines.join('\n')}\n\n` +
    `This may be a duplicate. Save anyway?`
  );
}
