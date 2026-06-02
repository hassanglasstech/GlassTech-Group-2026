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

  return text
    .replace(STRUCTURAL_CHARS, '')
    .replace(CONTROL_CHARS, '')
    .replace(MARKDOWN_MARKERS, '')
    .replace(TEMPLATE_PATTERNS, '')
    .replace(INJECTION_KEYWORDS, '[filtered]')
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

  return text
    .replace(STRUCTURAL_CHARS, '')
    .replace(CONTROL_CHARS, '')
    .replace(MARKDOWN_MARKERS, '')
    .replace(TEMPLATE_PATTERNS, '')
    .replace(INJECTION_KEYWORDS, '[filtered]')
    .trim()
    .slice(0, maxLen);
};
