// ═══════════════════════════════════════════════════════════════════
// Rate Limiter — Configurable per-user Claude API rate limiting
// Limits loaded from agent_rate_config table (not hardcoded).
// Used by claude-proxy Edge Function.
// ═══════════════════════════════════════════════════════════════════

interface RateLimitResult {
  allowed:     boolean;
  retryAfter?: number;    // seconds
  reason?:     string;
}

interface RateLimitConfig {
  max_per_minute: number;
  max_per_hour:   number;
}

// Default fallback if DB config not available
const DEFAULT_CONFIG: RateLimitConfig = { max_per_minute: 10, max_per_hour: 100 };

// Cache config for 5 minutes to avoid DB hits on every request
let cachedConfig: RateLimitConfig | null = null;
let cacheExpiry = 0;

async function loadConfig(supabase: any): Promise<RateLimitConfig> {
  const now = Date.now();
  if (cachedConfig && now < cacheExpiry) return cachedConfig;

  try {
    const { data } = await supabase
      .from('agent_rate_config')
      .select('max_per_minute, max_per_hour')
      .eq('config_key', 'claude_proxy')
      .single();

    if (data) {
      cachedConfig = {
        max_per_minute: data.max_per_minute ?? DEFAULT_CONFIG.max_per_minute,
        max_per_hour:   data.max_per_hour ?? DEFAULT_CONFIG.max_per_hour,
      };
    } else {
      cachedConfig = DEFAULT_CONFIG;
    }
  } catch {
    cachedConfig = DEFAULT_CONFIG;
  }

  cacheExpiry = now + 5 * 60 * 1000; // 5 min cache
  return cachedConfig;
}

/**
 * Check if user is within rate limits.
 * Queries agent_rate_limits table with sliding window.
 * Inserts a new row on success for tracking.
 */
export async function checkRateLimit(
  userId: string,
  supabase: any
): Promise<RateLimitResult> {
  const config  = await loadConfig(supabase);
  const now     = new Date();
  const hourAgo = new Date(now.getTime() - 3600000).toISOString();
  const minAgo  = new Date(now.getTime() - 60000).toISOString();

  const [hourRes, minRes] = await Promise.all([
    supabase.from('agent_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', hourAgo),
    supabase.from('agent_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', minAgo),
  ]);

  const hourCount = hourRes.count ?? 0;
  const minCount  = minRes.count ?? 0;

  if (minCount >= config.max_per_minute) {
    return { allowed: false, retryAfter: 60, reason: `${config.max_per_minute} calls/minute limit` };
  }
  if (hourCount >= config.max_per_hour) {
    return { allowed: false, retryAfter: 3600, reason: `${config.max_per_hour} calls/hour limit` };
  }

  // Log this call
  await supabase.from('agent_rate_limits')
    .insert({ user_id: userId, created_at: now.toISOString() })
    .catch(() => {});

  return { allowed: true };
}
