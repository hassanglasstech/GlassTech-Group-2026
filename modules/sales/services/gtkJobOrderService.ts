/**
 * gtkJobOrderService.ts — Phase 2 Migration
 * SUPABASE-PRIMARY. Sequence counter = max from DB (atomic, no localStorage).
 * job_orders table used for all reads/writes.
 */

import { Company } from '@/modules/shared/types/core';
import { ProductionService } from '@/modules/production/services/productionService';
import { SalesService } from '@/modules/sales/services/salesService';
import { GTKQuoteHeader, GTKQuoteItem, GTKQuoteOption } from '@/modules/sales/companies/gtk/gtkQuotationTypes';
import { WINDOW_TYPES, GLASS_SPECS } from '@/modules/sales/companies/gtk/gtkQuotationConstants';
import { supabase } from '@/src/services/supabaseClient';
import { Logger } from '@/modules/shared/services/logger';

export interface GTKBOMLine {
  description:  string;
  qty:          number;
  unit:         'RFT' | 'SqFt' | 'PCS' | 'Set';
  glassSpec?:   string;
  widthMM?:     number;
  heightMM?:    number;
}

export interface GTKJobOrder {
  id:             string;
  company:        Company;
  quotationRef:   string;
  clientName:     string;
  site:           string;
  date:           string;
  profileType:    string;
  sectionSize:    string;
  color:          string;
  optionLabel:    string;
  status:         'Open' | 'In Progress' | 'Completed' | 'Cancelled';
  items:          GTKJobOrderItem[];
  bom:            GTKBOMLine[];
  totalSqft:      number;
  totalGlassSqft: number;
  totalAlumRFT:   number;
  createdAt:      string;
}

export interface GTKJobOrderItem {
  serial:     string;
  windowType: string;
  floor:      string;
  location:   string;
  qty:        number;
  widthMM:    number;
  heightMM:   number;
  glassSpec:  string;
  glassSqft:  number;
  alumRFT:    number;
  netting:    string;
  notes:      string;
}

const LS_KEY = 'gtk_erp_gtk_job_orders';
const getLocal  = (): GTKJobOrder[] => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } };
const saveLocal = (d: GTKJobOrder[]) => { try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch {} };

// ── Atomic sequence number from Supabase ─────────────────────────────
// Reads max existing JO number for this company+year from job_orders table
// Falls back to localStorage counter if Supabase unavailable
const nextJobOrderNo = async (company: Company): Promise<string> => {
  const year = new Date().getFullYear();
  const prefix = `JO-${company.substring(0, 3).toUpperCase()}-${year}-`;

  try {
    const { data } = await supabase
      .from('job_orders')
      .select('id')
      .eq('company', company)
      .like('id', `${prefix}%`)
      .order('id', { ascending: false })
      .limit(1);

    let nextSeq = 1;
    if (data && data.length > 0) {
      const lastId  = data[0].id as string;
      const lastSeq = parseInt(lastId.replace(prefix, ''), 10);
      if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
    }
    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  } catch {
    // Fallback: localStorage counter
    const lsKey = `gtk_erp_jo_seq_${company}_${year}`;
    const seq = parseInt(localStorage.getItem(lsKey) || '0', 10) + 1;
    localStorage.setItem(lsKey, String(seq));
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }
};

// ── BOM explosion (unchanged logic) ──────────────────────────────────
const explodeBOM = (item: GTKQuoteItem): GTKBOMLine[] => {
  const lines: GTKBOMLine[] = [];
  const wt    = WINDOW_TYPES.find(w => w.id === item.windowTypeId);
  const isRFT = wt?.pricingUnit === 'rft';
  const qty   = item.qty || 1;
  const wMM   = Math.round(item.widthFt  * 304.8);
  const hMM   = Math.round(item.heightFt * 304.8);
  const sqft  = item.totalSqft;

  if (!isRFT && wMM > 0 && hMM > 0) {
    const perimeterFt = (2 * (wMM + hMM)) / 304.8;
    lines.push({ description: `${item.profile} Profile — ${wt?.label || item.windowTypeId}`, qty: Math.ceil(perimeterFt * qty * 1.05), unit: 'RFT' });
  }
  if (!isRFT && sqft > 0) {
    const gs         = GLASS_SPECS.find(g => g.id === item.glassSpecId);
    const glassLabel = item.glassSpecId === 'custom' ? item.customGlassLabel : gs?.abbr || item.glassSpecId;
    lines.push({ description: `Glass — ${glassLabel}`, qty: Math.ceil(sqft * 1.08), unit: 'SqFt', glassSpec: glassLabel, widthMM: wMM, heightMM: hMM });
  }
  lines.push({ description: `Hardware Set — ${wt?.label || item.windowTypeId}`, qty, unit: 'Set' });
  if (item.netting && item.netting !== 'none' && !isRFT && sqft > 0) {
    lines.push({ description: item.netting === 'zigzag' ? 'Zigzag Wire Mesh' : 'HD Steel Mesh', qty: Math.ceil(sqft * qty * 1.05), unit: 'SqFt' });
  }
  return lines;
};

// ── Convert quotation → job order ────────────────────────────────────
export async function convertQuotationToJobOrder(
  header: GTKQuoteHeader,
  option: GTKQuoteOption,
  company: Company = 'GTK'
): Promise<GTKJobOrder> {
  const joId  = await nextJobOrderNo(company);
  const today = new Date().toISOString().split('T')[0];

  const joItems: GTKJobOrderItem[] = option.items.map((item, idx) => {
    const wt      = WINDOW_TYPES.find(w => w.id === item.windowTypeId);
    const isRFT   = wt?.pricingUnit === 'rft';
    const wMM     = Math.round(item.widthFt  * 304.8);
    const hMM     = Math.round(item.heightFt * 304.8);
    const qty     = item.qty || 1;
    const sqft    = item.totalSqft;
    const gs      = GLASS_SPECS.find(g => g.id === item.glassSpecId);
    const glassSpec = item.glassSpecId === 'custom' ? item.customGlassLabel : gs?.abbr || item.glassSpecId;
    const alumRFT   = isRFT ? item.widthFt * qty : Math.ceil((2 * (wMM + hMM)) / 304.8 * qty * 1.05);
    const glassSqft = isRFT ? 0 : Math.ceil(sqft * 1.08);
    return { serial: item.serialNo || String(idx + 1), windowType: wt?.label || item.windowTypeId, floor: item.floor, location: item.location, qty, widthMM: wMM, heightMM: hMM, glassSpec, glassSqft, alumRFT, netting: item.netting, notes: item.notes };
  });

  const allBOM = option.items.flatMap(item => explodeBOM(item));
  const mergedBOM: GTKBOMLine[] = [];
  for (const line of allBOM) {
    const ex = mergedBOM.find(l => l.description === line.description);
    if (ex) ex.qty += line.qty; else mergedBOM.push({ ...line });
  }

  const jobOrder: GTKJobOrder = {
    id: joId, company,
    quotationRef: header.refNo, clientName: header.clientName, site: header.site,
    date: today, profileType: option.profileType || header.profileType,
    sectionSize: option.sectionSize || header.sectionSize, color: header.color,
    optionLabel: option.label, status: 'Open', items: joItems, bom: mergedBOM,
    totalSqft: option.totalSqft,
    totalGlassSqft: joItems.reduce((s, i) => s + i.glassSqft, 0),
    totalAlumRFT:   joItems.reduce((s, i) => s + i.alumRFT,   0),
    createdAt: new Date().toISOString(),
  };

  // ── Supabase PRIMARY write ────────────────────────────────────────
  try {
    // Save job order
    const { error: joErr } = await supabase.from('job_orders').upsert([{
      id: joId, company, data: jobOrder, updated_at: new Date().toISOString(),
    }]);
    if (joErr) Logger.warn('GTKJobOrder', 'job_orders upsert failed', joErr);

    // Save production pieces
    const pieces = option.items.flatMap(item => {
      const qty = item.qty || 1;
      const wt  = WINDOW_TYPES.find(w => w.id === item.windowTypeId);
      return Array.from({ length: qty }, (_, i) => ({
        id:           `${joId}-${item.id}-${i + 1}`,
        order_id:     joId,
        item_index:   option.items.indexOf(item),
        specs:        [wt?.label || item.windowTypeId, item.location, item.floor, `${Math.round(item.widthFt * 304.8)}×${Math.round(item.heightFt * 304.8)}mm`].filter(Boolean).join(' | '),
        status:       'Pending',
        last_updated: new Date().toISOString(),
      }));
    });
    const { error: pErr } = await supabase.from('production_pieces').upsert(pieces);
    if (pErr) Logger.warn('GTKJobOrder', 'production_pieces upsert failed', pErr);
  } catch (e) {
    Logger.warn('GTKJobOrder', 'Supabase push failed — saved locally only', e);
  }

  // Local cache
  const local = getLocal();
  local.unshift(jobOrder);
  saveLocal(local);

  return jobOrder;
}

// ── Load job orders — SUPABASE FIRST ─────────────────────────────────
export const getGTKJobOrders = async (company: Company = 'GTK'): Promise<GTKJobOrder[]> => {
  try {
    const { data, error } = await supabase
      .from('job_orders')
      .select('*')
      .eq('company', company)
      .order('created_at', { ascending: false });

    if (error || !data) return getLocal().filter(jo => jo.company === company);

    const mapped: GTKJobOrder[] = data.map((r) => ({ ...r.data, id: r.id, company: r.company }));
    saveLocal([...mapped, ...getLocal().filter(jo => jo.company !== company)]);
    return mapped;
  } catch {
    return getLocal().filter(jo => jo.company === company);
  }
};

// ── Update job order status ───────────────────────────────────────────
export const updateJobOrderStatus = async (id: string, status: GTKJobOrder['status']): Promise<void> => {
  const local = getLocal();
  const idx   = local.findIndex(jo => jo.id === id);
  if (idx !== -1) { local[idx].status = status; saveLocal(local); }
  try {
    const row = local[idx] ? { ...local[idx], status } : { status };
    await supabase.from('job_orders').update({ data: row, updated_at: new Date().toISOString() }).eq('id', id);
  } catch (e) {
    Logger.warn('GTKJobOrder', 'Status update Supabase failed', e);
  }
};
