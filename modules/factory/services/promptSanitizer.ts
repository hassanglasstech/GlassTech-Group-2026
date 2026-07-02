// ═══════════════════════════════════════════════════════════════════════
// Prompt Sanitizer — Prevent prompt injection in all Claude API calls
// Applied to ALL user-generated text and DB-sourced fields BEFORE
// they are interpolated into Claude system/user prompts.
// ═══════════════════════════════════════════════════════════════════════

// Keywords commonly used in prompt injection attacks
const INJECTION_KEYWORDS = /\b(ignore|forget|system|prompt|override|instructions|jailbreak|DAN|bypass|disregard|pretend|roleplay|act\s+as)\b/gi;

// Structural characters used to break out of prompt templates
const STRUCTURAL_CHARS = /[<>{}\[\]`\\]/g;

// Control characters (null bytes, escape sequences, etc.)
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

// Markdown emphasis markers that could alter prompt parsing
const MARKDOWN_MARKERS = /\*{2,}|_{2,}|#{1,6}\s/g;

// Common template injection patterns
const TEMPLATE_PATTERNS = /\{\{.*?\}\}|\$\{.*?\}|<%.*?%>/g;

/**
 * Sanitize user input before sending to Claude API.
 * Use for: chat messages, search queries, any direct user text.
 * Max 500 characters.
 */
export const sanitizeUserInput = (text: string): string => {
  if (!text || typeof text !== 'string') return '';

  // ORDER MATTERS (audit #13 fix). The previous order stripped structural
  // chars FIRST, which (a) removed the braces TEMPLATE_PATTERNS needs, so
  // `${...}` survived, and (b) GLUED tokens like `[INST]forget` into
  // `INSTforget`, defeating the `\bforget\b` keyword filter — a real
  // prompt-injection bypass. Fix: run CONTROL/TEMPLATE/MARKDOWN, then replace
  // structural chars with a SPACE (never empty — prevents gluing), THEN run
  // the keyword filter LAST so its `[filtered]` marker survives intact.
  return text
    .replace(CONTROL_CHARS, '')
    .replace(TEMPLATE_PATTERNS, '')
    .replace(MARKDOWN_MARKERS, '')
    .replace(STRUCTURAL_CHARS, ' ')
    .replace(INJECTION_KEYWORDS, '[filtered]')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, 500);
};

/**
 * Sanitize database field values before interpolating into prompts.
 * Use for: vendor names, client names, project names, event types —
 * any DB value that gets placed inside a Claude prompt string.
 * Default max 120 characters.
 */
export const sanitizeDBField = (text: string, maxLen = 120): string => {
  if (!text || typeof text !== 'string') return '';

  // Same order fix as sanitizeUserInput (audit #13): structural chars → SPACE
  // (never empty, prevents token-gluing), keyword filter LAST so `[filtered]`
  // survives and nothing sneaks past a broken word boundary.
  return text
    .replace(CONTROL_CHARS, '')
    .replace(TEMPLATE_PATTERNS, '')
    .replace(MARKDOWN_MARKERS, '')
    .replace(STRUCTURAL_CHARS, ' ')
    .replace(INJECTION_KEYWORDS, '[filtered]')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, maxLen);
};
