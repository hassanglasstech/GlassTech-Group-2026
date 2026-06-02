/**
 * csvImportService.ts — Sprint 30
 *
 * Generic CSV parsing + validation + batched upsert for the bulk-import wizards.
 * Uses the xlsx package (already a dependency) so we get CSV + Excel parsing for free.
 *
 * Usage pattern:
 *   const { rows, errors } = parseCSV(file, schema);
 *   if (errors.length === 0) await batchUpsert('clients', rows, { ... });
 */

import * as XLSX from 'xlsx';
import { supabase } from '@/src/services/supabaseClient';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ColumnSpec {
  csvHeader:  string;           // header text in the file
  field:      string;           // target field name in the DB row
  required?:  boolean;
  type?:      'text' | 'number' | 'date' | 'boolean';
  transform?: (raw: string) => unknown;
}

export interface ParseError {
  row:    number;               // 1-indexed (matches Excel row number)
  field?: string;
  error:  string;
}

export interface ParseResult<T> {
  rows:   T[];
  errors: ParseError[];
  total:  number;
}

// ── 1. Read file → 2D array of strings ───────────────────────────────────────
export const readFileAsRows = async (file: File): Promise<string[][]> => {
  const buf = await file.arrayBuffer();
  const wb  = XLSX.read(buf, { type: 'array' });
  const ws  = wb.Sheets[wb.SheetNames[0]];
  // header:1 returns arrays of strings; defval:'' keeps empty cells as ''
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as string[][];
};

// ── 2. Parse + validate against a schema ─────────────────────────────────────
export const parseCSV = async <T extends Record<string, unknown>>(
  file:    File,
  schema:  ColumnSpec[],
  context: { company: string },
): Promise<ParseResult<T>> => {
  const raw = await readFileAsRows(file);

  if (raw.length === 0) {
    return { rows: [], errors: [{ row: 0, error: 'File is empty' }], total: 0 };
  }

  const headers = (raw[0] ?? []).map(h => String(h ?? '').trim());

  // Map csvHeader → column index
  const colIndex = new Map<string, number>();
  schema.forEach(s => {
    const idx = headers.findIndex(h => h.toLowerCase() === s.csvHeader.toLowerCase());
    if (idx >= 0) colIndex.set(s.field, idx);
  });

  // Check required headers
  const missingHeaders = schema
    .filter(s => s.required && !colIndex.has(s.field))
    .map(s => s.csvHeader);
  if (missingHeaders.length > 0) {
    return {
      rows:   [],
      errors: [{ row: 1, error: `Missing required columns: ${missingHeaders.join(', ')}` }],
      total:  0,
    };
  }

  const rows:   T[]          = [];
  const errors: ParseError[] = [];

  for (let r = 1; r < raw.length; r++) {
    const rawRow = raw[r];
    // Skip totally blank rows
    if (!rawRow || rawRow.every(c => !String(c ?? '').trim())) continue;

    const obj: Record<string, unknown> = { company: context.company };
    let rowHasError = false;

    for (const spec of schema) {
      const idx = colIndex.get(spec.field);
      const cell = idx !== undefined ? String(rawRow[idx] ?? '').trim() : '';

      if (spec.required && !cell) {
        errors.push({ row: r + 1, field: spec.field, error: `${spec.csvHeader} is required` });
        rowHasError = true;
        continue;
      }

      if (!cell) {
        obj[spec.field] = null;
        continue;
      }

      try {
        switch (spec.type) {
          case 'number': {
            const n = Number(cell.replace(/,/g, ''));
            if (Number.isNaN(n)) throw new Error(`${spec.csvHeader} must be a number`);
            obj[spec.field] = n;
            break;
          }
          case 'date': {
            const d = new Date(cell);
            if (Number.isNaN(d.getTime())) throw new Error(`${spec.csvHeader} invalid date`);
            obj[spec.field] = d.toISOString().slice(0, 10);
            break;
          }
          case 'boolean': {
            obj[spec.field] = /^(true|yes|1|y)$/i.test(cell);
            break;
          }
          default:
            obj[spec.field] = spec.transform ? spec.transform(cell) : cell;
        }
      } catch (e) {
        errors.push({ row: r + 1, field: spec.field, error: (e as Error).message });
        rowHasError = true;
      }
    }

    if (!rowHasError) rows.push(obj as T);
  }

  return { rows, errors, total: raw.length - 1 };
};

// ── 3. Batched upsert (chunks of 100) ────────────────────────────────────────
export const batchUpsert = async <T extends Record<string, unknown>>(
  table:    string,
  rows:     T[],
  options:  { onConflict?: string; chunkSize?: number } = {},
): Promise<{ succeeded: number; failed: number; errors: ParseError[] }> => {
  const chunkSize = options.chunkSize ?? 100;
  let succeeded = 0;
  let failed    = 0;
  const errors: ParseError[] = [];

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const q = supabase.from(table).upsert(chunk, {
      onConflict:        options.onConflict,
      ignoreDuplicates:  false,
    });
    const { error } = await q;

    if (error) {
      failed += chunk.length;
      errors.push({ row: i + 2, error: error.message });
    } else {
      succeeded += chunk.length;
    }
  }
  return { succeeded, failed, errors };
};

// ── 4. Generate a template CSV from a schema (for download) ──────────────────
export const generateTemplate = (schema: ColumnSpec[], sampleRow?: Record<string, string>): Blob => {
  const headers = schema.map(s => s.csvHeader);
  const sample  = sampleRow
    ? schema.map(s => sampleRow[s.field] ?? '')
    : schema.map(s => s.required ? `<${s.csvHeader}>` : '');

  const csv = [headers.join(','), sample.join(',')].join('\n');
  return new Blob([csv], { type: 'text/csv;charset=utf-8' });
};

export const downloadTemplate = (filename: string, schema: ColumnSpec[], sampleRow?: Record<string, string>): void => {
  const blob = generateTemplate(schema, sampleRow);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
