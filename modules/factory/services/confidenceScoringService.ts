// ═══════════════════════════════════════════════════════════════════
// Confidence Scoring Service — Statistical confidence without ML
// Updates confidence based on outcomes, applies decay, enforces thresholds
// ═══════════════════════════════════════════════════════════════════

import { getDecisionAccuracy, getSimilarDecisions } from './decisionMemoryService';

// ── Configuration ────────────────────────────────────────────────────
const LEARNING_RATE = 0.20;
const GOOD_OUTCOME_IMPACT  = +0.10;
const BAD_OUTCOME_IMPACT   = -0.15;
const DECAY_FACTOR_90_DAYS = 0.95;  // 5% decay after 90 days unused
const OVERRIDE_PENALTY     = 0.80;  // 20% penalty after 3+ overrides

// ── Thresholds ───────────────────────────────────────────────────────
export const CONFIDENCE_THRESHOLDS = {
  AUTONOMOUS: 0.85,  // Agent decides, owner notified after
  RECOMMEND:  0.60,  // Agent recommends, owner approves
  ESCALATE:   0.60,  // Below this: escalate to owner with reasoning
};

// ── Initial confidence based on data availability ────────────────────
export const getInitialConfidence = (params: {
  hasHistory:       boolean;   // Any past decisions for this type?
  historyCount:     number;    // How many past decisions?
  isHardRule:       boolean;   // Hard rule = always 1.0
  isNewEntity:      boolean;   // First time seeing this client/vendor?
}): number => {
  if (params.isHardRule) return 1.0;
  if (!params.hasHistory || params.historyCount === 0) {
    return params.isNewEntity ? 0.50 : 0.55;
  }
  // Scale: 0.55 at 1 decision → 0.75 at 10 → 0.85 at 30+
  return Math.min(0.90, 0.55 + Math.log10(params.historyCount + 1) * 0.20);
};

// ── Update confidence after outcome ──────────────────────────────────
export const updateConfidence = (
  currentConfidence: number,
  goodOutcome:       boolean,
): number => {
  const impact = goodOutcome ? GOOD_OUTCOME_IMPACT : BAD_OUTCOME_IMPACT;
  const delta  = impact * LEARNING_RATE;
  const next   = currentConfidence + delta;
  // Clamp between 0.30 and 0.99
  return Math.max(0.30, Math.min(0.99, Math.round(next * 1000) / 1000));
};

// ── Apply decay for unused rules/patterns ────────────────────────────
export const applyDecay = (
  confidence:    number,
  daysSinceUsed: number,
  overrideCount: number,
): number => {
  let decayed = confidence;

  // Time decay: 5% per 90-day period
  if (daysSinceUsed > 90) {
    const periods = Math.floor(daysSinceUsed / 90);
    decayed *= Math.pow(DECAY_FACTOR_90_DAYS, periods);
  }

  // Override penalty: 20% if overridden 3+ times
  if (overrideCount >= 3) {
    decayed *= OVERRIDE_PENALTY;
  }

  return Math.max(0.30, Math.round(decayed * 1000) / 1000);
};

// ── Compute confidence for a new decision ────────────────────────────
export const computeDecisionConfidence = async (
  agentType:    string,
  decisionType: string,
  contextKey?:  string, // e.g., client name for client-specific scoring
): Promise<{
  confidence: number;
  basis:      string;
  accuracy:   { total: number; correct: number; accuracy: number };
  maturity:   'new' | 'learning' | 'competent' | 'expert';
}> => {
  const accuracy = await getDecisionAccuracy(agentType, decisionType);
  const recent   = await getSimilarDecisions(agentType, decisionType, 5);

  // Base confidence from accuracy
  let confidence = getInitialConfidence({
    hasHistory:   accuracy.total > 0,
    historyCount: accuracy.total,
    isHardRule:   false,
    isNewEntity:  !contextKey,
  });

  // If we have outcomes, blend with actual accuracy
  if (accuracy.total >= 5) {
    confidence = confidence * 0.3 + accuracy.accuracy * 0.7;
  } else if (accuracy.total >= 2) {
    confidence = confidence * 0.5 + accuracy.accuracy * 0.5;
  }

  // Check for recent overrides (lower confidence if owner keeps disagreeing)
  const recentOverrides = recent.filter(d => d.owner_feedback === 'overridden').length;
  if (recentOverrides >= 2) {
    confidence = applyDecay(confidence, 0, recentOverrides);
  }

  // Maturity level
  const maturity = accuracy.total < 5 ? 'new'
    : accuracy.total < 20 ? 'learning'
    : accuracy.total < 50 ? 'competent'
    : 'expert';

  const basis = accuracy.total === 0
    ? 'No prior decisions — using initial estimate'
    : `Based on ${accuracy.total} past decisions (${Math.round(accuracy.accuracy * 100)}% accurate)`;

  return {
    confidence: Math.round(confidence * 1000) / 1000,
    basis,
    accuracy,
    maturity,
  };
};

// ── Determine action level based on confidence ───────────────────────
export const getActionLevel = (confidence: number): 'autonomous' | 'recommend' | 'escalate' => {
  if (confidence >= CONFIDENCE_THRESHOLDS.AUTONOMOUS) return 'autonomous';
  if (confidence >= CONFIDENCE_THRESHOLDS.RECOMMEND)  return 'recommend';
  return 'escalate';
};
