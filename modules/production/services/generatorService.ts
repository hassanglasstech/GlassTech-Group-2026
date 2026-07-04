/**
 * generatorService.ts — Stage 1A
 * Generator Hours Log — CRUD + Monthly Analytics
 * 
 * Storage: Supabase primary, localStorage fallback
 * Key: gtk_erp_generator_logs
 */

import { supabase } from '@/src/services/supabaseClient';
import { toast } from 'sonner';

const LS_KEY = 'gtk_erp_generator_logs';

export interface GeneratorLog {
  id: string;
  company: string;
  logDate: string;           // YYYY-MM-DD
  wapdaHours: number;        // 0-24
  generatorHours: number;    // 0-24
  fuelLitresUsed: number;
  fuelRatePerLitre: number;
  fuelCost: number;          // computed
  cuttingSqftProduced: number;
  notes: string;
  enteredBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratorMonthlySummary {
  month: string;             // YYYY-MM
  totalDays: number;
  totalGeneratorHours: number;
  totalWapdaHours: number;
  totalFuelLitres: number;
  totalFuelCost: number;
  totalSqftProduced: number;
  avgCostPerSqft: number;
  avgCostPerHour: number;
  generatorPercentage: number; // % of total hours on generator
}

// ── Helpers ────────────────────────────────────────────────────────
function genId(): string {
  return `GEN-${Date.now().toString(36).toUpperCase()}`;
}

function toSnake(log: GeneratorLog): Record<string, any> {
  return {
    id: log.id,
    company: log.company,
    log_date: log.logDate,
    wapda_hours: log.wapdaHours,
    generator_hours: log.generatorHours,
    fuel_litres_used: log.fuelLitresUsed,
    fuel_rate_per_litre: log.fuelRatePerLitre,
    cutting_sqft_produced: log.cuttingSqftProduced,
    notes: log.notes,
    entered_by: log.enteredBy,
    updated_at: new Date().toISOString(),
  };
}

function toCamel(row: any): GeneratorLog {
  return {
    id: row.id,
    company: row.company,
    logDate: row.log_date,
    wapdaHours: Number(row.wapda_hours || 0),
    generatorHours: Number(row.generator_hours || 0),
    fuelLitresUsed: Number(row.fuel_litres_used || 0),
    fuelRatePerLitre: Number(row.fuel_rate_per_litre || 0),
    fuelCost: Number(row.fuel_cost || 0),
    cuttingSqftProduced: Number(row.cutting_sqft_produced || 0),
    notes: row.notes || '',
    enteredBy: row.entered_by || '',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

// ── localStorage fallback ─────────────────────────────────────────
function getLocal(company: string): GeneratorLog[] {
  try {
    const all: GeneratorLog[] = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    return all.filter(l => l.company === company);
  } catch { return []; }
}

function saveLocal(logs: GeneratorLog[]): void {
  try {
    // Merge with other companies
    const existing: GeneratorLog[] = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    const companies = new Set(logs.map(l => l.company));
    const others = existing.filter(l => !companies.has(l.company));
    localStorage.setItem(LS_KEY, JSON.stringify([...others, ...logs]));
  } catch {}
}

// ── CRUD ──────────────────────────────────────────────────────────
export const GeneratorService = {

  /** Get all logs for company, sorted newest first */
  getLogs: async (company: string): Promise<GeneratorLog[]> => {
    try {
      const { data, error } = await supabase
        .from('generator_logs')
        .select('*')
        .eq('company', company)
        .order('log_date', { ascending: false });
      
      if (error || !data) {
        return getLocal(company).sort((a, b) => b.logDate.localeCompare(a.logDate));
      }
      const mapped = data.map(toCamel);
      saveLocal(mapped); // cache
      return mapped;
    } catch {
      return getLocal(company).sort((a, b) => b.logDate.localeCompare(a.logDate));
    }
  },

  /** Save (upsert) a log entry */
  saveLog: async (log: Omit<GeneratorLog, 'id' | 'fuelCost' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<GeneratorLog | null> => {
    const entry: GeneratorLog = {
      id: log.id || genId(),
      company: log.company,
      logDate: log.logDate,
      wapdaHours: log.wapdaHours,
      generatorHours: log.generatorHours,
      fuelLitresUsed: log.fuelLitresUsed,
      fuelRatePerLitre: log.fuelRatePerLitre,
      fuelCost: log.fuelLitresUsed * log.fuelRatePerLitre,
      cuttingSqftProduced: log.cuttingSqftProduced,
      notes: log.notes,
      enteredBy: log.enteredBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const { error } = await supabase
        .from('generator_logs')
        .upsert(toSnake(entry), { onConflict: 'id' });
      
      if (error) {
        console.error('Generator log save error:', error);
        // Fallback to localStorage
        const local = getLocal(entry.company);
        const idx = local.findIndex(l => l.id === entry.id);
        if (idx >= 0) local[idx] = entry; else local.push(entry);
        saveLocal(local);
      }
      return entry;
    } catch {
      const local = getLocal(entry.company);
      const idx = local.findIndex(l => l.id === entry.id);
      if (idx >= 0) local[idx] = entry; else local.push(entry);
      saveLocal(local);
      return entry;
    }
  },

  /** Delete a log entry */
  deleteLog: async (id: string, company: string): Promise<boolean> => {
    try {
      // Scope delete to company to prevent cross-tenant log deletion.
      // The DB-level RLS (Migration 018) enforces this at the PostgreSQL level
      // as well — this is the application-layer defence-in-depth.
      const { error } = await supabase
        .from('generator_logs')
        .delete()
        .eq('id', id)
        .eq('company', company);
      if (error) console.error('Delete error:', error);
    } catch {}
    // Also clean localStorage
    const local = getLocal(company);
    saveLocal(local.filter(l => l.id !== id));
    return true;
  },

  /** Monthly summary for analytics */
  getMonthlySummary: (logs: GeneratorLog[]): GeneratorMonthlySummary[] => {
    const byMonth: Record<string, GeneratorLog[]> = {};
    logs.forEach(l => {
      const m = l.logDate.substring(0, 7); // YYYY-MM
      if (!byMonth[m]) byMonth[m] = [];
      byMonth[m].push(l);
    });

    return Object.entries(byMonth)
      .map(([month, entries]) => {
        const totalGenHrs = entries.reduce((s, e) => s + e.generatorHours, 0);
        const totalWapdaHrs = entries.reduce((s, e) => s + e.wapdaHours, 0);
        const totalFuelLtr = entries.reduce((s, e) => s + e.fuelLitresUsed, 0);
        const totalFuelCost = entries.reduce((s, e) => s + e.fuelCost, 0);
        const totalSqft = entries.reduce((s, e) => s + e.cuttingSqftProduced, 0);
        const totalHrs = totalGenHrs + totalWapdaHrs;

        return {
          month,
          totalDays: entries.length,
          totalGeneratorHours: totalGenHrs,
          totalWapdaHours: totalWapdaHrs,
          totalFuelLitres: totalFuelLtr,
          totalFuelCost: totalFuelCost,
          totalSqftProduced: totalSqft,
          avgCostPerSqft: totalSqft > 0 ? totalFuelCost / totalSqft : 0,
          avgCostPerHour: totalGenHrs > 0 ? totalFuelCost / totalGenHrs : 0,
          generatorPercentage: totalHrs > 0 ? (totalGenHrs / totalHrs) * 100 : 0,
        };
      })
      .sort((a, b) => b.month.localeCompare(a.month));
  },
};
