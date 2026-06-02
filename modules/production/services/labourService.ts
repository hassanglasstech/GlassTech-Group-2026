/**
 * labourService.ts — Stage 1B
 * Cutter Daily Productivity Log — CRUD + Analytics
 */

import { supabase } from '@/src/services/supabaseClient';

const LS_KEY = 'gtk_erp_cutter_daily_logs';

export interface CutterDailyLog {
  id: string;
  company: string;
  logDate: string;
  cutterName: string;
  employeeId: string;
  shift: 'Morning' | 'Evening' | 'Full';
  sqftProduced: number;
  piecesCut: number;
  sheetsUsed: number;
  overtimeHours: number;
  overtimeRateMultiplier: number;
  notes: string;
  enteredBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CutterMonthlySummary {
  cutterName: string;
  totalDays: number;
  totalSqft: number;
  totalPieces: number;
  totalSheets: number;
  totalOTHours: number;
  avgSqftPerDay: number;
  avgPiecesPerDay: number;
}

function genId(): string { return `CDL-${Date.now().toString(36).toUpperCase()}`; }

function toSnake(l: CutterDailyLog): Record<string, any> {
  return {
    id: l.id, company: l.company, log_date: l.logDate, cutter_name: l.cutterName,
    employee_id: l.employeeId, shift: l.shift, sqft_produced: l.sqftProduced,
    pieces_cut: l.piecesCut, sheets_used: l.sheetsUsed, overtime_hours: l.overtimeHours,
    overtime_rate_multiplier: l.overtimeRateMultiplier, notes: l.notes,
    entered_by: l.enteredBy, updated_at: new Date().toISOString(),
  };
}

function toCamel(r: any): CutterDailyLog {
  return {
    id: r.id, company: r.company, logDate: r.log_date, cutterName: r.cutter_name,
    employeeId: r.employee_id || '', shift: r.shift || 'Morning',
    sqftProduced: Number(r.sqft_produced || 0), piecesCut: Number(r.pieces_cut || 0),
    sheetsUsed: Number(r.sheets_used || 0), overtimeHours: Number(r.overtime_hours || 0),
    overtimeRateMultiplier: Number(r.overtime_rate_multiplier || 1.5),
    notes: r.notes || '', enteredBy: r.entered_by || '',
    createdAt: r.created_at || '', updatedAt: r.updated_at || '',
  };
}

function getLocal(company: string): CutterDailyLog[] {
  try { return (JSON.parse(localStorage.getItem(LS_KEY) || '[]') as CutterDailyLog[]).filter(l => l.company === company); } catch { return []; }
}
function saveLocal(logs: CutterDailyLog[]): void {
  try {
    const existing: CutterDailyLog[] = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    const companies = new Set(logs.map(l => l.company));
    localStorage.setItem(LS_KEY, JSON.stringify([...existing.filter(l => !companies.has(l.company)), ...logs]));
  } catch {}
}

export const LabourService = {
  getLogs: async (company: string): Promise<CutterDailyLog[]> => {
    try {
      const { data, error } = await supabase.from('cutter_daily_logs').select('*').eq('company', company).order('log_date', { ascending: false });
      if (error || !data) return getLocal(company).sort((a, b) => b.logDate.localeCompare(a.logDate));
      const mapped = data.map(toCamel);
      saveLocal(mapped);
      return mapped;
    } catch { return getLocal(company).sort((a, b) => b.logDate.localeCompare(a.logDate)); }
  },

  saveLog: async (log: Omit<CutterDailyLog, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<CutterDailyLog | null> => {
    const entry: CutterDailyLog = {
      ...log, id: log.id || genId(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    try {
      const { error } = await supabase.from('cutter_daily_logs').upsert(toSnake(entry), { onConflict: 'id' });
      if (error) { const local = getLocal(entry.company); const idx = local.findIndex(l => l.id === entry.id); if (idx >= 0) local[idx] = entry; else local.push(entry); saveLocal(local); }
    } catch { const local = getLocal(entry.company); local.push(entry); saveLocal(local); }
    return entry;
  },

  deleteLog: async (id: string, company: string): Promise<boolean> => {
    try { await supabase.from('cutter_daily_logs').delete().eq('id', id); } catch {}
    saveLocal(getLocal(company).filter(l => l.id !== id));
    return true;
  },

  getCutterSummary: (logs: CutterDailyLog[], month?: string): CutterMonthlySummary[] => {
    const filtered = month ? logs.filter(l => l.logDate.startsWith(month)) : logs;
    const byCutter: Record<string, CutterDailyLog[]> = {};
    filtered.forEach(l => { if (!byCutter[l.cutterName]) byCutter[l.cutterName] = []; byCutter[l.cutterName].push(l); });
    
    return Object.entries(byCutter).map(([name, entries]) => ({
      cutterName: name,
      totalDays: entries.length,
      totalSqft: entries.reduce((s, e) => s + e.sqftProduced, 0),
      totalPieces: entries.reduce((s, e) => s + e.piecesCut, 0),
      totalSheets: entries.reduce((s, e) => s + e.sheetsUsed, 0),
      totalOTHours: entries.reduce((s, e) => s + e.overtimeHours, 0),
      avgSqftPerDay: entries.length > 0 ? entries.reduce((s, e) => s + e.sqftProduced, 0) / entries.length : 0,
      avgPiecesPerDay: entries.length > 0 ? entries.reduce((s, e) => s + e.piecesCut, 0) / entries.length : 0,
    })).sort((a, b) => b.avgSqftPerDay - a.avgSqftPerDay);
  },
};
