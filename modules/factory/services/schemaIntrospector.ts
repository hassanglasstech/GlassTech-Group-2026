// ═══════════════════════════════════════════════════════════════════
// Schema Introspector — auto-generates query tools from Supabase schema
// Caches schema for 10 minutes. Generates get_{table} tool per table.
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/src/services/supabaseClient';
import type { ClaudeToolDef } from './claudeAgentService';

interface TableSchema {
  table_name: string;
  columns:    { name: string; type: string }[];
}

// ── Schema cache (10 min TTL) ────────────────────────────────────────
let _schemaCache: TableSchema[] | null = null;
let _toolsCache: ClaudeToolDef[] | null = null;
let _cacheExpiry = 0;

// Tables to skip (system/internal)
const SKIP_TABLES = new Set([
  'agent_audit_log', 'agent_api_calls', 'agent_rate_limits', 'agent_rate_config',
  'agent_execution_log', 'agent_sessions', 'anomaly_log', 'anomaly_thresholds',
  'audit_log', 'erp_backups', 'erp_config', 'agent_actions',
]);

// ── Load schema from Supabase information_schema ─────────────────────
export const loadSchema = async (): Promise<TableSchema[]> => {
  if (_schemaCache && Date.now() < _cacheExpiry) return _schemaCache;

  try {
    const { data, error } = await supabase.rpc('get_public_schema').select('*');

    // Fallback: direct query if RPC doesn't exist
    if (error || !data) {
      const { data: cols } = await supabase
        .from('information_schema.columns' as any)
        .select('table_name, column_name, data_type')
        .eq('table_schema', 'public')
        .order('table_name')
        .order('ordinal_position');

      if (!cols) {
        // Final fallback: use known tables from localStorage keys
        return getFallbackSchema();
      }

      const grouped: Record<string, TableSchema> = {};
      (cols as any[]).forEach((c: any) => {
        if (!grouped[c.table_name]) grouped[c.table_name] = { table_name: c.table_name, columns: [] };
        grouped[c.table_name].columns.push({ name: c.column_name, type: c.data_type });
      });
      _schemaCache = Object.values(grouped).filter(t => !SKIP_TABLES.has(t.table_name));
      _cacheExpiry = Date.now() + 10 * 60 * 1000;
      return _schemaCache;
    }
  } catch {
    return getFallbackSchema();
  }

  return getFallbackSchema();
};

// ── Fallback: known tables from localStorage ─────────────────────────
const getFallbackSchema = (): TableSchema[] => {
  const known: TableSchema[] = [
    { table_name: 'employees', columns: [{ name: 'id', type: 'text' }, { name: 'company', type: 'text' }, { name: 'data', type: 'jsonb' }] },
    { table_name: 'quotations', columns: [{ name: 'id', type: 'text' }, { name: 'company', type: 'text' }, { name: 'client_name', type: 'text' }, { name: 'status', type: 'text' }, { name: 'total_amount', type: 'numeric' }] },
    { table_name: 'invoices', columns: [{ name: 'id', type: 'text' }, { name: 'company', type: 'text' }, { name: 'client_name', type: 'text' }, { name: 'status', type: 'text' }, { name: 'total_amount', type: 'numeric' }] },
    { table_name: 'requisitions', columns: [{ name: 'id', type: 'text' }, { name: 'company', type: 'text' }, { name: 'status', type: 'text' }, { name: 'priority', type: 'text' }] },
    { table_name: 'vendors', columns: [{ name: 'id', type: 'text' }, { name: 'company', type: 'text' }, { name: 'name', type: 'text' }] },
    { table_name: 'clients', columns: [{ name: 'id', type: 'text' }, { name: 'company', type: 'text' }, { name: 'name', type: 'text' }] },
    { table_name: 'products', columns: [{ name: 'id', type: 'text' }, { name: 'company', type: 'text' }, { name: 'name', type: 'text' }] },
    { table_name: 'purchase_orders', columns: [{ name: 'id', type: 'text' }, { name: 'company', type: 'text' }, { name: 'status', type: 'text' }] },
    { table_name: 'production_pieces', columns: [{ name: 'id', type: 'text' }, { name: 'company', type: 'text' }, { name: 'status', type: 'text' }] },
    { table_name: 'factory_events', columns: [{ name: 'id', type: 'text' }, { name: 'sector', type: 'text' }, { name: 'event_type', type: 'text' }, { name: 'priority', type: 'text' }, { name: 'status', type: 'text' }] },
    { table_name: 'attendance', columns: [{ name: 'id', type: 'text' }, { name: 'company', type: 'text' }, { name: 'date', type: 'text' }] },
    { table_name: 'payroll', columns: [{ name: 'id', type: 'text' }, { name: 'company', type: 'text' }] },
    { table_name: 'petty_cash', columns: [{ name: 'id', type: 'text' }, { name: 'company', type: 'text' }, { name: 'amount', type: 'numeric' }, { name: 'type', type: 'text' }] },
    { table_name: 'loans', columns: [{ name: 'id', type: 'text' }, { name: 'company', type: 'text' }] },
  ];
  _schemaCache = known;
  _cacheExpiry = Date.now() + 10 * 60 * 1000;
  return known;
};

// ── Generate Claude tool definitions from schema ─────────────────────
export const generateSchemaTools = async (): Promise<ClaudeToolDef[]> => {
  if (_toolsCache && Date.now() < _cacheExpiry) return _toolsCache;

  const schema = await loadSchema();
  const tools: ClaudeToolDef[] = [];

  for (const table of schema) {
    if (SKIP_TABLES.has(table.table_name)) continue;

    const colList = table.columns.map(c => c.name).join(', ');
    tools.push({
      name:        `db_${table.table_name}`,
      description: `Fetch records from ${table.table_name}. Columns: ${colList}`,
      input_schema: {
        type: 'object',
        properties: {
          company: { type: 'string', description: 'Filter by company name (GlassCo, Glassco, GTK, etc.)' },
          limit:   { type: 'number', description: 'Max records to return (default 20)' },
          search:  { type: 'string', description: 'Search in text columns' },
          status:  { type: 'string', description: 'Filter by status column if exists' },
        },
        required: [],
      },
    });
  }

  _toolsCache = tools;
  return tools;
};

// ── Execute a schema-generated tool ──────────────────────────────────
export const executeSchemaQuery = async (
  toolName: string,
  params: Record<string, any>
): Promise<any> => {
  // Extract table name from tool name: db_{table_name}
  const tableName = toolName.replace(/^db_/, '');
  const limit = params.limit || 20;

  console.log(`[SchemaIntrospector] Querying ${tableName}`, params);

  try {
    let query = supabase.from(tableName).select('*').limit(limit);

    // Apply company filter
    if (params.company) {
      query = query.or(`company.eq.${params.company},company.eq.${params.company.toLowerCase()},company.eq.${params.company.charAt(0).toUpperCase() + params.company.slice(1)}`);
    }

    // Apply status filter
    if (params.status) {
      query = query.eq('status', params.status);
    }

    // Apply search (ilike on common text columns)
    if (params.search) {
      query = query.or(`name.ilike.%${params.search}%,client_name.ilike.%${params.search}%,description.ilike.%${params.search}%`);
    }

    const { data, error, count } = await query.order('created_at', { ascending: false });

    if (error) {
      console.warn(`[SchemaIntrospector] Query error on ${tableName}:`, error.message);

      // Fallback to localStorage
      const lsKey = `gtk_erp_${tableName}`;
      const lsData = JSON.parse(localStorage.getItem(lsKey) || '[]');
      let filtered = lsData;
      if (params.company) filtered = filtered.filter((r: any) => (r.company || '').toLowerCase().includes(params.company.toLowerCase()));
      if (params.search) {
        const s = params.search.toLowerCase();
        filtered = filtered.filter((r: any) => JSON.stringify(r).toLowerCase().includes(s));
      }
      return { source: 'localStorage', table: tableName, count: filtered.length, records: filtered.slice(0, limit) };
    }

    return { source: 'supabase', table: tableName, count: (data || []).length, records: (data || []).slice(0, limit) };
  } catch (err) {
    return { error: `Query failed: ${String(err)}`, table: tableName };
  }
};
