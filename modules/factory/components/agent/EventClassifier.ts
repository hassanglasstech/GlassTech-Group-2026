// ═══════════════════════════════════════════════════════════════════
// EventOS — Event Classifier
// Loads patterns from Supabase (5-min cache), falls back to JSON.
// Matches messages → increments times_used → Claude fallback.
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/src/services/supabaseClient';
import { askClaude } from '@/modules/factory/services/claudeAgentService';
import { sanitizeUserInput } from '@/modules/factory/services/promptSanitizer';
import FALLBACK_PATTERNS from '@/modules/factory/data/patternLibrary.json';

// ── Types ────────────────────────────────────────────────────────────
export interface ClassificationResult {
  matched:      boolean;
  pattern_id:   string | null;
  label:        string;
  category:     string;
  confidence:   number;
  keywords_hit: string[];
  extracted: {
    amounts:  number[];
    names:    string[];
    dates:    string[];
    items:    string[];
  };
  reasoning:    string;
}

interface Pattern {
  event_id:         string;
  trigger_keywords: string[];
  category:         string;
  label:            string;
  confidence:       number;
}

// ── Pattern cache (5-minute TTL) ─────────────────────────────────────
let _patternCache: Pattern[] | null = null;
let _cacheExpiry = 0;

const loadPatterns = async (): Promise<Pattern[]> => {
  if (_patternCache && Date.now() < _cacheExpiry) return _patternCache;

  try {
    const { data } = await supabase
      .from('pattern_library')
      .select('event_id, trigger_keywords, category, label, confidence')
      .eq('active', true)
      .order('confidence', { ascending: false });

    if (data && data.length > 0) {
      _patternCache = data;
      _cacheExpiry = Date.now() + 5 * 60 * 1000; // 5 min
      return _patternCache;
    }
  } catch {}

  // Fallback to JSON
  _patternCache = FALLBACK_PATTERNS.patterns;
  _cacheExpiry = Date.now() + 60 * 1000; // 1 min for fallback
  return _patternCache;
};

// Force refresh (call after pattern CRUD)
export const refreshPatternCache = () => { _patternCache = null; _cacheExpiry = 0; };

// ── Increment times_used on match (fire-and-forget) ──────────────────
const incrementUsage = (eventId: string) => {
  supabase.rpc('increment_pattern_usage', { p_event_id: eventId })
    .then(() => {}, () => {
      // Fallback: direct update if RPC doesn't exist
      supabase.from('pattern_library')
        .update({ updated_at: new Date().toISOString() })
        .eq('event_id', eventId)
        .then(() => {}, () => {});
    });
  // Simple fallback: just update
  supabase.from('pattern_library')
    .select('times_used')
    .eq('event_id', eventId)
    .single()
    .then(({ data }) => {
      if (data) {
        supabase.from('pattern_library')
          .update({ times_used: (data.times_used || 0) + 1, updated_at: new Date().toISOString() })
          .eq('event_id', eventId)
          .then(() => {}, () => {});
      }
    }, () => {});
};

// ── Entity extraction (simple regex, no ML) ──────────────────────────
const extractAmounts = (text: string): number[] => {
  const matches = text.match(/\b(\d{1,7})\b/g);
  return (matches || []).map(Number).filter(n => n > 0 && n < 10000000);
};

const extractNames = (text: string): string[] => {
  const stopWords = new Set(['hai','ka','ki','ke','ko','ne','se','mein','pe','aur','ya','nahi','karo','ho','hua','aaya','gayi','wala','abhi','aaj','kal']);
  return text.split(/\s+/).filter(w => w.length > 2 && /^[A-Z]/.test(w) && !stopWords.has(w.toLowerCase()));
};

const extractDates = (text: string): string[] => {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const dates: string[] = [];
  if (/\baaj\b|\btoday\b/i.test(text)) dates.push(today);
  if (/\bkal\b|\btomorrow\b/i.test(text)) dates.push(tomorrow);
  const dateMatches = text.match(/\b(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/g);
  if (dateMatches) dates.push(...dateMatches);
  return dates;
};

// ── Main classifier ──────────────────────────────────────────────────
export const classifyEvent = async (rawMessage: string): Promise<ClassificationResult> => {
  const message = sanitizeUserInput(rawMessage);
  const lower   = message.toLowerCase();
  const words   = lower.split(/\s+/);

  const patterns = await loadPatterns();

  // Score each pattern by keyword hits
  let bestMatch: { pattern: Pattern; hits: string[]; score: number } | null = null;

  for (const pattern of patterns) {
    const hits: string[] = [];
    for (const keyword of pattern.trigger_keywords) {
      const kwLower = keyword.toLowerCase();
      if (kwLower.includes(' ')) {
        if (lower.includes(kwLower)) hits.push(keyword);
      } else {
        if (words.includes(kwLower)) hits.push(keyword);
      }
    }

    if (hits.length > 0) {
      const score = hits.length / pattern.trigger_keywords.length;
      if (!bestMatch || score > bestMatch.score || (score === bestMatch.score && pattern.confidence > bestMatch.pattern.confidence)) {
        bestMatch = { pattern, hits, score };
      }
    }
  }

  const extracted = {
    amounts: extractAmounts(message),
    names:   extractNames(rawMessage),
    dates:   extractDates(message),
    items:   [],
  };

  if (bestMatch && bestMatch.score >= 0.15) {
    const conf = Math.min(0.99, bestMatch.pattern.confidence * (0.5 + bestMatch.score * 0.5));

    // Increment usage counter
    incrementUsage(bestMatch.pattern.event_id);

    return {
      matched:      true,
      pattern_id:   bestMatch.pattern.event_id,
      label:        bestMatch.pattern.label,
      category:     bestMatch.pattern.category,
      confidence:   Math.round(conf * 100) / 100,
      keywords_hit: bestMatch.hits,
      extracted,
      reasoning:    `Matched ${bestMatch.hits.length} keywords: ${bestMatch.hits.join(', ')}`,
    };
  }

  // ── Unknown event: Claude fallback ─────────────────────────────
  try {
    const claudeResponse = await askClaude(
      `Classify this Pakistani factory staff message into ONE category.
Message: "${message}"

Categories: local_purchase, attendance, grn_inward, production_table_assign, ncr_breakage, cash_expense, delivery_update, vendor_payment, other
Reply with JSON only: { "category": "...", "label": "Short label", "reasoning": "1 sentence why" }`,
      { agentId: 'event-classifier', maxTokens: 100 }
    );

    const parsed = JSON.parse(claudeResponse.replace(/```json|```/g, '').trim());
    return {
      matched:      false,
      pattern_id:   null,
      label:        parsed.label || 'Unknown Event',
      category:     parsed.category || 'other',
      confidence:   0.50,
      keywords_hit: [],
      extracted,
      reasoning:    parsed.reasoning || 'Classified by AI — no pattern match',
    };
  } catch {
    return {
      matched:      false,
      pattern_id:   null,
      label:        'Unknown Event',
      category:     'other',
      confidence:   0.30,
      keywords_hit: [],
      extracted,
      reasoning:    'No pattern match and AI classification failed',
    };
  }
};

// ═══════════════════════════════════════════════════════════════════════
// PATTERN CRUD — Save/update patterns from ChatWidget
// ═══════════════════════════════════════════════════════════════════════

export const saveNewPattern = async (pattern: {
  event_id:         string;
  trigger_keywords: string[];
  category:         string;
  label:            string;
  modules_involved: string[];
  workflow_steps:   any[];
  company?:         string;
}): Promise<boolean> => {
  const { error } = await supabase.from('pattern_library').upsert({
    event_id:         pattern.event_id,
    trigger_keywords: pattern.trigger_keywords,
    category:         pattern.category,
    label:            pattern.label,
    color:            '#3B82F6',
    modules_involved: pattern.modules_involved,
    workflow_steps:   pattern.workflow_steps,
    confidence:       0.50,
    defined_by:       'owner',
    company:          pattern.company || 'Glassco',
    is_global:        false,
    active:           true,
    times_used:       0,
    updated_at:       new Date().toISOString(),
  }, { onConflict: 'event_id' });

  if (!error) refreshPatternCache();
  return !error;
};

export const updatePatternConfidence = async (
  eventId: string,
  delta: number // +0.01 for correct, -0.02 for wrong
): Promise<void> => {
  const { data } = await supabase
    .from('pattern_library')
    .select('confidence')
    .eq('event_id', eventId)
    .single();

  if (data) {
    const newConf = Math.max(0.30, Math.min(0.99, (data.confidence || 0.5) + delta));
    await supabase.from('pattern_library')
      .update({ confidence: newConf, updated_at: new Date().toISOString() })
      .eq('event_id', eventId);
    refreshPatternCache();
  }
};

export const getPatternStats = async (): Promise<{
  total: number;
  topUsed: { event_id: string; label: string; times_used: number }[];
}> => {
  const { data } = await supabase
    .from('pattern_library')
    .select('event_id, label, times_used')
    .eq('active', true)
    .order('times_used', { ascending: false })
    .limit(10);

  return {
    total: (data || []).length,
    topUsed: (data || []).map((d: any) => ({ event_id: d.event_id, label: d.label, times_used: d.times_used })),
  };
};
