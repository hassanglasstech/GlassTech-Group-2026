import { supabase } from '@/src/services/supabaseClient';
import { callClaude } from '@/modules/factory/services/claudeAgentService';
import { sanitizeUserInput, sanitizeDBField } from '@/modules/factory/services/promptSanitizer';

// ── Embedding via Claude API (free with Max plan) ─────────────────────
// Using Claude's text generation to create semantic summaries,
// then storing as searchable text. Full vector embeddings require
// OpenAI API key — gracefully degrades to text search if not available.

interface SemanticRecord {
  table_name:   string;
  record_id:    string;
  company:      string;
  summary:      string;
  semantic_tags: string[];
  entities:     Record<string, any>;
  risk_flags:   string[];
}

// ── Build semantic summary for a record ──────────────────────────────
export const buildSummary = async (
  tableName: string,
  record: Record<string, any>
): Promise<SemanticRecord | null> => {
  try {
    let summary    = '';
    let tags:   string[] = [];
    let entities: Record<string, any> = {};
    let risks:  string[] = [];

    // Rule-based semantic extraction (no API needed for basics)
    if (tableName === 'quotations' || tableName === 'gtk_erp_quotations') {
      summary  = `Sales order ${record.id} for ${record.clientId || 'unknown client'} — ${record.projectName || record.subject || ''} — PKR ${(record.grandTotal || 0).toLocaleString()}`;
      tags     = ['sales', 'quotation'];
      entities = { client: record.clientId, amount: record.grandTotal, date: record.date, status: record.status };
      if ((record.grandTotal || 0) > 500000) risks.push('high_value');
      if (record.status === 'Overdue')       risks.push('overdue');
    }
    else if (tableName === 'purchase_orders' || tableName === 'gtk_erp_purchase_orders') {
      summary  = `PO from ${record.vendorName || record.vendor} — PKR ${(record.total || 0).toLocaleString()} — status: ${record.status}`;
      tags     = ['procurement', 'purchase_order', record.vendorName?.toLowerCase().replace(/\s/g, '_') || 'vendor'];
      entities = { vendor: record.vendorName, amount: record.total, date: record.date, status: record.status };
      if (record.status === 'Overdue') risks.push('overdue');
    }
    else if (tableName === 'ledger' || tableName === 'gtk_erp_ledger') {
      summary  = `GL entry: ${record.description || record.docType} — PKR ${(record.details?.[0]?.debit || record.details?.[0]?.credit || 0).toLocaleString()}`;
      tags     = ['finance', 'gl_entry', record.docType?.toLowerCase() || 'transaction'];
      entities = { type: record.docType, date: record.date, amount: record.details?.[0]?.debit || record.details?.[0]?.credit };
    }
    else if (tableName === 'factory_events') {
      summary  = `Factory event: ${record.event_type} in ${record.sector} — ${record.priority} priority — ${record.status}`;
      tags     = ['factory', record.sector?.toLowerCase() || 'operations', record.event_type?.toLowerCase().replace(/\s/g, '_') || 'event'];
      entities = { sector: record.sector, type: record.event_type, priority: record.priority };
      if (record.priority === 'Urgent') risks.push('urgent');
    }
    else {
      summary = `${tableName} record: ${JSON.stringify(record).slice(0, 100)}`;
      tags    = [tableName];
    }

    return {
      table_name:    tableName,
      record_id:     record.id,
      company:       record.company || 'Glassco',
      summary,
      semantic_tags: tags,
      entities,
      risk_flags:    risks,
    };
  } catch {
    return null;
  }
};

// ── Store semantic record ─────────────────────────────────────────────
export const storeSemanticRecord = async (rec: SemanticRecord): Promise<void> => {
  await supabase.from('transaction_semantics').upsert({
    table_name:    rec.table_name,
    record_id:     rec.record_id,
    company:       rec.company,
    summary:       rec.summary,
    semantic_tags: rec.semantic_tags,
    entities:      rec.entities,
    risk_flags:    rec.risk_flags,
    created_at:    new Date().toISOString(),
  }, { onConflict: 'table_name,record_id' });
};

// ── Semantic search (text-based, no vector needed) ────────────────────
export const semanticSearch = async (
  query: string,
  company = 'Glassco',
  limit  = 8
): Promise<any[]> => {
  const words   = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const results: any[] = [];

  // Search summaries
  for (const word of words.slice(0, 3)) {
    const { data } = await supabase
      .from('transaction_semantics')
      .select('*')
      .eq('company', company)
      .ilike('summary', `%${word}%`)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (data) results.push(...data);
  }

  // Deduplicate by id
  const seen = new Set<string>();
  return results.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; }).slice(0, limit);
};

// ── Log causal chain ──────────────────────────────────────────────────
export const logCausalChain = async (
  triggerTable: string,
  triggerId:    string,
  triggerEvent: string,
  impactTable:  string,
  impactId:     string,
  impactType:   string,
  impactAmount: number
): Promise<void> => {
  await supabase.from('causal_chains').insert({
    trigger_table: triggerTable,
    trigger_id:    triggerId,
    trigger_event: triggerEvent,
    impact_table:  impactTable,
    impact_id:     impactId,
    impact_type:   impactType,
    impact_amount: impactAmount,
    resolved:      false,
    created_at:    new Date().toISOString(),
  });
};

// ── Log market intelligence ───────────────────────────────────────────
export const logMarketIntel = async (
  content: string,
  source:  string,
  topic?:  string
): Promise<void> => {
  // Auto-detect topic
  const c = content.toLowerCase();
  const detectedTopic = topic ||
    (c.includes('rate') || c.includes('price') || c.includes('cost') ? 'pricing' :
     c.includes('supply') || c.includes('stock') || c.includes('rok') ? 'supply' :
     c.includes('competitor') || c.includes('glass') ? 'competition' : 'general');

  await supabase.from('market_intelligence').insert({
    source,
    content,
    topic:      detectedTopic,
    confidence: 80,
    actioned:   false,
    created_at: new Date().toISOString(),
  });
};

// ── Get narrative for a topic ─────────────────────────────────────────
export const getNarrativeForTopic = async (topic: string): Promise<string> => {
  const safeTopic = sanitizeUserInput(topic);
  const { data } = await supabase
    .from('market_intelligence')
    .select('content, created_at, topic')
    .ilike('content', `%${safeTopic}%`)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!data || data.length === 0) return `No intelligence found for "${topic}".`;

  const intel = data.map((d: any) =>
    `[${new Date(d.created_at).toLocaleDateString('en-PK')}] ${sanitizeDBField(d.content, 300)}`
  ).join('\n');

  const d = await callClaude({
    model:     'claude-haiku-4-5-20251001',
    maxTokens: 200,
    system:    'Summarize market intelligence for a Pakistani glass/aluminium business owner. Be concise and actionable. Urdu/English mix ok.',
    messages:  [{ role: 'user', content: `Summarize this intelligence:\n${intel}` }],
    agentId:   'semantic-narrative',
  });
  return d.content?.[0]?.text || intel;
};
