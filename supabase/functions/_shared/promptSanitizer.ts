// ═══════════════════════════════════════════════════════════════════
// Prompt Sanitizer (Deno) — Prevent prompt injection in Edge Functions
// Mirror of modules/factory/services/promptSanitizer.ts for server-side use.
// Applied to ALL user-generated text before Claude API in Edge Functions.
// ═══════════════════════════════════════════════════════════════════

const INJECTION_KEYWORDS = /\b(ignore|forget|system|prompt|override|instructions|jailbreak|DAN|bypass|disregard|pretend|roleplay|act\s+as)\b/gi;
const STRUCTURAL_CHARS = /[<>{}\[\]`\\]/g;
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;
const MARKDOWN_MARKERS = /\*{2,}|_{2,}|#{1,6}\s/g;
const TEMPLATE_PATTERNS = /\{\{.*?\}\}|\$\{.*?\}|<%.*?%>/g;

/**
 * Sanitize user input before sending to Claude API.
 * Max 500 characters.
 */
export function sanitizeUserInput(text: string): string {
  if (!text || typeof text !== 'string') return '';

  return text
    .replace(STRUCTURAL_CHARS, '')
    .replace(CONTROL_CHARS, '')
    .replace(MARKDOWN_MARKERS, '')
    .replace(TEMPLATE_PATTERNS, '')
    .replace(INJECTION_KEYWORDS, '[filtered]')
    .trim()
    .slice(0, 500);
}

/**
 * Sanitize database field values before interpolating into prompts.
 * Default max 120 characters.
 */
export function sanitizeDBField(text: string, maxLen = 120): string {
  if (!text || typeof text !== 'string') return '';

  return text
    .replace(STRUCTURAL_CHARS, '')
    .replace(CONTROL_CHARS, '')
    .replace(MARKDOWN_MARKERS, '')
    .replace(TEMPLATE_PATTERNS, '')
    .replace(INJECTION_KEYWORDS, '[filtered]')
    .trim()
    .slice(0, maxLen);
}
