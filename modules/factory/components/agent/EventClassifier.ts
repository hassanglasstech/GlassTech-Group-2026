// ═══════════════════════════════════════════════════════════════════
// EventOS — Event Classifier
// Receives staff message → extracts keywords → matches pattern library
// Falls back to Claude API for unknown events
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/src/services/supabaseClient';
import { askClaude } from '@/modules/factory/services/claudeAgentService';
import { sanitizeUserInput } from '@/modules/factory/services/promptSanitizer';
import PATTERNS from '@/modules/factory/data/patternLibrary.json';

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

// ── Entity extraction (simple regex, no ML) ──────────────────────────
const extractAmounts = (text: string): number[] => {
  const matches = text.match(/\b(\d{1,7})\b/g);
  return (matches || []).map(Number).filter(n => n > 0 && n < 10000000);
};

const extractNames = (text: string): string[] => {
  // Common Pakistani name patterns (capitalized words not in keyword lists)
  const stopWords = new Set(['hai','ka','ki','ke','ko','ne','se','mein','pe','aur','ya','nahi','karo','ho','hua','aaya','gayi','wala','abhi','aaj','kal']);
  return text.split(/\s+/).filter(w => w.length > 2 && /^[A-Z]/.test(w) && !stopWords.has(w.toLowerCase()));
};

const extractDates = (text: string): string[] => {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const dates: string[] = [];
  if (/\baaj\b|\btoday\b/i.test(text)) dates.push(today);
  if (/\bkal\b|\btomorrow\b/i.test(text)) dates.push(tomorrow);
  // Match DD/MM or DD-MM patterns
  const dateMatches = text.match(/\b(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/g);
  if (dateMatches) dates.push(...dateMatches);
  return dates;
};

// ── Keyword matching against pattern library ─────────────────────────
export const classifyEvent = async (rawMessage: string): Promise<ClassificationResult> => {
  const message = sanitizeUserInput(rawMessage);
  const lower   = message.toLowerCase();
  const words   = lower.split(/\s+/);

  // Load patterns from DB first, fall back to JSON
  let patterns: Pattern[] = PATTERNS.patterns;
  try {
    const { data } = await supabase
      .from('pattern_library')
      .select('event_id, trigger_keywords, category, label, confidence')
      .eq('active', true);
    if (data && data.length > 0) patterns = data;
  } catch {}

  // Score each pattern by keyword hits
  let bestMatch: { pattern: Pattern; hits: string[]; score: number } | null = null;

  for (const pattern of patterns) {
    const hits: string[] = [];
    for (const keyword of pattern.trigger_keywords) {
      const kwLower = keyword.toLowerCase();
      if (kwLower.includes(' ')) {
        // Multi-word keyword: check substring
        if (lower.includes(kwLower)) hits.push(keyword);
      } else {
        // Single word: check word boundary
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
    names:   extractNames(rawMessage), // Use raw for case-sensitive name detection
    dates:   extractDates(message),
    items:   [], // Will be populated by WorkflowAssembler
  };

  if (bestMatch && bestMatch.score >= 0.15) {
    const conf = Math.min(0.99, bestMatch.pattern.confidence * (0.5 + bestMatch.score * 0.5));
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

  // ── Unknown event: use Claude for best-guess classification ─────
  try {
    const claudeResponse = await askClaude(
      `Classify this Pakistani factory staff message into ONE category.
Message: "${message}"

Categories: local_purchase, attendance, grn, production_issue, quality_issue, petty_cash, dispatch, other
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
