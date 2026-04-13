// ═══════════════════════════════════════════════════════════════════════
// Claude Agent Service — Centralized AI gateway for GlassTech ERP
// All Claude API calls route through Supabase claude-proxy Edge Function
// ═══════════════════════════════════════════════════════════════════════

import { supabase } from './supabaseClient';

// ── Types ────────────────────────────────────────────────────────────────
export interface ClaudeMessage {
  role:    'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?:   string;
  name?: string;
  input?: Record<string, any>;
  tool_use_id?: string;
  content?: string;
}

export interface ClaudeToolDef {
  name:         string;
  description:  string;
  input_schema: Record<string, any>;
}

export interface ClaudeRequestOptions {
  model?:      string;
  maxTokens?:  number;
  system?:     string;
  messages:    ClaudeMessage[];
  tools?:      ClaudeToolDef[];
  stream?:     boolean;
  agentId?:    string;  // for token tracking: 'finance', 'production', 'ops', 'master', 'adversarial', etc.
}

export interface ClaudeResponse {
  content:       ContentBlock[];
  model:         string;
  stop_reason:   string;
  usage: {
    input_tokens:  number;
    output_tokens: number;
  };
}

export interface TokenUsageEntry {
  agentId:       string;
  model:         string;
  inputTokens:   number;
  outputTokens:  number;
  totalTokens:   number;
  estimatedCost: number;
  timestamp:     string;
}

// ── Token pricing (USD per 1M tokens) ────────────────────────────────────
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.00  },
  'claude-sonnet-4-6':         { input: 3.00,  output: 15.00 },
};

// ── In-memory token usage tracker ────────────────────────────────────────
const usageLog: TokenUsageEntry[] = [];
const SESSION_USAGE = { input: 0, output: 0, cost: 0, calls: 0 };

const trackUsage = (agentId: string, model: string, input: number, output: number) => {
  const pricing = PRICING[model] || PRICING['claude-haiku-4-5-20251001'];
  const cost = (input * pricing.input + output * pricing.output) / 1_000_000;

  const entry: TokenUsageEntry = {
    agentId,
    model,
    inputTokens:   input,
    outputTokens:  output,
    totalTokens:   input + output,
    estimatedCost: cost,
    timestamp:     new Date().toISOString(),
  };
  usageLog.push(entry);

  SESSION_USAGE.input  += input;
  SESSION_USAGE.output += output;
  SESSION_USAGE.cost   += cost;
  SESSION_USAGE.calls  += 1;

  // Persist to Supabase (fire-and-forget)
  supabase.from('agent_token_usage').insert({
    agent_id:       agentId,
    model,
    input_tokens:   input,
    output_tokens:  output,
    total_tokens:   input + output,
    estimated_cost: Math.round(cost * 1_000_000) / 1_000_000,
    created_at:     entry.timestamp,
  }).then(() => {}).catch(() => {});
};

// ── Retry with exponential backoff ───────────────────────────────────────
const fetchWithRetry = async (
  url: string,
  opts: RequestInit,
  maxRetries = 3
): Promise<Response> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, opts);
      if ((response.status === 429 || response.status === 529) && attempt < maxRetries) {
        const retryAfter = response.headers.get('retry-after');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return response;
    } catch (netErr) {
      if (attempt === maxRetries) throw netErr;
      await new Promise(r => setTimeout(r, attempt * 1500));
    }
  }
  throw new Error('Max retries reached');
};

// ── Get auth header ──────────────────────────────────────────────────────
const getAuthHeader = async (): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? `Bearer ${session.access_token}`
    : `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`;
};

// ── Core: Send message to Claude via proxy ───────────────────────────────
export const callClaude = async (opts: ClaudeRequestOptions): Promise<ClaudeResponse> => {
  const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claude-proxy`;
  const auth     = await getAuthHeader();
  const model    = opts.model || 'claude-haiku-4-5-20251001';
  const agentId  = opts.agentId || 'default';

  const body: Record<string, any> = {
    model,
    max_tokens: opts.maxTokens || 1000,
    messages:   opts.messages,
  };
  if (opts.system) body.system = opts.system;
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools.map(t => ({ type: 'custom' as const, ...t }));
  }

  const res = await fetchWithRetry(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': auth,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Claude API error (${res.status}): ${errBody}`);
  }

  const data = await res.json();

  // Track token usage
  if (data.usage) {
    trackUsage(agentId, model, data.usage.input_tokens || 0, data.usage.output_tokens || 0);
  }

  return data as ClaudeResponse;
};

// ── Convenience: Get text response ───────────────────────────────────────
export const askClaude = async (
  prompt: string,
  opts?: Partial<ClaudeRequestOptions>
): Promise<string> => {
  const response = await callClaude({
    messages: [{ role: 'user', content: prompt }],
    ...opts,
  });
  const textBlock = response.content?.find(b => b.type === 'text');
  return textBlock?.text || '';
};

// ── Convenience: Chat with tool use ──────────────────────────────────────
export const chatWithTools = async (
  opts: ClaudeRequestOptions
): Promise<{
  text:      string;
  toolCalls: { id: string; name: string; params: Record<string, any> }[];
  response:  ClaudeResponse;
}> => {
  const response = await callClaude(opts);

  const toolBlocks = response.content?.filter(b => b.type === 'tool_use') || [];
  const textBlock  = response.content?.find(b => b.type === 'text');

  return {
    text:      textBlock?.text || '',
    toolCalls: toolBlocks.map(b => ({
      id:     b.id!,
      name:   b.name!,
      params: b.input || {},
    })),
    response,
  };
};

// ── Streaming support ────────────────────────────────────────────────────
export const streamClaude = async (
  opts: ClaudeRequestOptions,
  onChunk: (text: string) => void,
  onDone?: (fullText: string, response: any) => void
): Promise<void> => {
  const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claude-proxy`;
  const auth     = await getAuthHeader();
  const model    = opts.model || 'claude-haiku-4-5-20251001';
  const agentId  = opts.agentId || 'default';

  const body: Record<string, any> = {
    model,
    max_tokens: opts.maxTokens || 1000,
    messages:   opts.messages,
    stream:     true,
  };
  if (opts.system) body.system = opts.system;

  const res = await fetchWithRetry(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': auth,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Claude streaming error (${res.status}): ${errBody}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body for streaming');

  const decoder  = new TextDecoder();
  let fullText   = '';
  let inputTokens  = 0;
  let outputTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      try {
        const event = JSON.parse(data);
        if (event.type === 'content_block_delta' && event.delta?.text) {
          fullText += event.delta.text;
          onChunk(event.delta.text);
        }
        if (event.type === 'message_delta' && event.usage) {
          outputTokens = event.usage.output_tokens || 0;
        }
        if (event.type === 'message_start' && event.message?.usage) {
          inputTokens = event.message.usage.input_tokens || 0;
        }
      } catch {}
    }
  }

  trackUsage(agentId, model, inputTokens, outputTokens);
  onDone?.(fullText, { inputTokens, outputTokens });
};

// ── Token usage getters ──────────────────────────────────────────────────
export const getSessionUsage = () => ({ ...SESSION_USAGE });

export const getUsageLog = () => [...usageLog];

export const getUsageByAgent = () => {
  const byAgent: Record<string, { calls: number; tokens: number; cost: number }> = {};
  for (const entry of usageLog) {
    if (!byAgent[entry.agentId]) byAgent[entry.agentId] = { calls: 0, tokens: 0, cost: 0 };
    byAgent[entry.agentId].calls  += 1;
    byAgent[entry.agentId].tokens += entry.totalTokens;
    byAgent[entry.agentId].cost   += entry.estimatedCost;
  }
  return byAgent;
};

export const resetSessionUsage = () => {
  usageLog.length = 0;
  SESSION_USAGE.input  = 0;
  SESSION_USAGE.output = 0;
  SESSION_USAGE.cost   = 0;
  SESSION_USAGE.calls  = 0;
};
