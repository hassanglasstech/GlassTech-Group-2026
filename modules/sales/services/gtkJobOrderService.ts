/**
 * gtkJobOrderService.ts — Phase 5
 *
 * Converts an approved GTK quotation into a Job Order visible in production.
 * - Generates a JO-GTK-YYYY-XXXX sequential number
 * - Explodes BOM: calculates aluminium profile RFT and glass sqft per item
 * - Writes to production_pieces + job_orders tables
 * - Updates quotation status → Approved
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
  id:           string;        // JO-GTK-2026-0001
  company:      Company;
  quotationRef: string;        // refNo from header
  clientName:   string;
  site:         string;
  date:         string;
  profileType:  string;
  sectionSize:  string;
  color:        string;
  optionLabel:  string;
  status:       'Open' | 'In Progress' | 'Completed' | 'Cancelled';
  items:        GTKJobOrderItem[];
  bom:          GTKBOMLine[];
  totalSqft:    number;
  totalGlassSqft: number;
  totalAlumRFT: number;
  createdAt:    string;
}

export interface GTKJobOrderItem {
  serial:       string;
  windowType:   string;
  floor:        string;
  location:     string;
  qty:          number;
  widthMM:      number;
  heightMM:     number;
  glassSpec:    string;
  glassSqft:    number;
  alumRFT:      number;
  netting:      string;
  notes:        string;
}

const JO_SEQ_KEY = (company: Company) => `gtk_erp_jo_seq_${company}_${new Date().getFullYear()}`;

const nextJobOrderNo = (company: Company): string => {
  const year = new Date().getFullYear();
  const key = JO_SEQ_KEY(company);
  const seq = parseInt(localStorage.getItem(key) || '0', 10) + 1;
  localStorage.setItem(key, String(seq));
  return `JO-${company.substring(0, 3).toUpperCase()}-${year}-${String(seq).padStart(4, '0')}`;
};

// ── BOM explosion per item ────────────────────────────────────────────
const explodeBOM = (item: GTKQuoteItem): GTKBOMLine[] => {
  const lines: GTKBOMLine[] = [];
  const wt = WINDOW_TYPES.find(w => w.id === item.windowTypeId);
  const isRFT = wt?.pricingUnit === 'rft';
  const qty = item.qty || 1;
  const wMM = Math.round(item.widthFt * 304.8);
  const hMM = Math.round(item.heightFt * 304.8);
  const sqft = item.totalSqft;

  // ── Aluminium profiles (perimeter-based estimate) ─────────────────
  if (!isRFT && wMM > 0 && hMM > 0) {
    const perimeterMM = 2 * (wMM + hMM);
    const perimeterFt = perimeterMM / 304.8;
    const alumRFT = Math.ceil(perimeterFt * qty * 1.05); // 5% wastage
    lines.push({
      description: `${item.profile} Profile — ${wt?.label || item.windowTypeId}`,
      qty: alumRFT,
      unit: 'RFT',
    });
  }

  // ── Glass ─────────────────────────────────────────────────────────
  if (!isRFT && sqft > 0) {
    const gs = GLASS_SPECS.find(g => g.id === item.glassSpecId);
    const glassLabel = item.glassSpecId === 'custom'
      ? item.customGlassLabel
      : gs?.abbr || item.glassSpecId;
    lines.push({
      description: `Glass — ${glassLabel}`,
      qty: Math.ceil(sqft * 1.08), // 8% wastage
      unit: 'SqFt',
      glassSpec: glassLabel,
      widthMM: wMM,
      heightMM: hMM,
    });
  }

  // ── Hardware set ──────────────────────────────────────────────────
  lines.push({
    description: `Hardware Set — ${wt?.label || item.windowTypeId}`,
    qty: qty,
    unit: 'Set',
  });

  // ── Netting ───────────────────────────────────────────────────────
  if (item.netting && item.netting !== 'none' && !isRFT && sqft > 0) {
    const nettingLabel = item.netting === 'zigzag' ? 'Zigzag Wire Mesh' : 'HD Steel Mesh';
    lines.push({
      description: nettingLabel,
      qty: Math.ceil(sqft * qty * 1.05),
      unit: 'SqFt',
    });
  }

  return lines;
};

// ── Main conversion function ──────────────────────────────────────────
export async function convertQuotationToJobOrder(
  header: GTKQuoteHeader,
  option: GTKQuoteOption,
  company: Company = 'GTK'
): Promise<GTKJobOrder> {
  const joId = nextJobOrderNo(company);
  const today = new Date().toISOString().split('T')[0];

  // ── Build job order items ─────────────────────────────────────────
  const joItems: GTKJobOrderItem[] = option.items.map((item, idx) => {
    const wt = WINDOW_TYPES.find(w => w.id === item.windowTypeId);
    const isRFT = wt?.pricingUnit === 'rft';
    const wMM = Math.round(item.widthFt * 304.8);
    const hMM = Math.round(item.heightFt * 304.8);
    const qty = item.qty || 1;
    const sqft = item.totalSqft;
    const gs = GLASS_SPECS.find(g => g.id === item.glassSpecId);
    const glassSpec = item.glassSpecId === 'custom'
      ? item.customGlassLabel
      : gs?.abbr || item.glassSpecId;

    const perimeterFt = isRFT ? 0 : (2 * (wMM + hMM)) / 304.8;
    const alumRFT = isRFT ? item.widthFt * qty : Math.ceil(perimeterFt * qty * 1.05);
    const glassSqft = isRFT ? 0 : Math.ceil(sqft * 1.08);

    return {
      serial:     item.serialNo || String(idx + 1),
      windowType: wt?.label || item.windowTypeId,
      floor:      item.floor,
      location:   item.location,
      qty,
      widthMM:    wMM,
      heightMM:   hMM,
      glassSpec,
      glassSqft,
      alumRFT,
      netting:    item.netting,
      notes:      item.notes,
    };
  });

  // ── Aggregate BOM ─────────────────────────────────────────────────
  const allBOMLines: GTKBOMLine[] = option.items.flatMap(item => explodeBOM(item));

  // Merge same-description lines
  const mergedBOM: GTKBOMLine[] = [];
  for (const line of allBOMLines) {
    const existing = mergedBOM.find(l => l.description === line.description);
    if (existing) {
      existing.qty += line.qty;
    } else {
      mergedBOM.push({ ...line });
    }
  }

  const totalGlassSqft = joItems.reduce((s, i) => s + i.glassSqft, 0);
  const totalAlumRFT   = joItems.reduce((s, i) => s + i.alumRFT, 0);

  const jobOrder: GTKJobOrder = {
    id: joId, company,
    quotationRef: header.refNo,
    clientName: header.clientName,
    site: header.site,
    date: today,
    profileType: option.profileType || header.profileType,
    sectionSize: option.sectionSize || header.sectionSize,
    color: header.color,
    optionLabel: option.label,
    status: 'Open',
    items: joItems,
    bom: mergedBOM,
    totalSqft: option.totalSqft,
    totalGlassSqft,
    totalAlumRFT,
    createdAt: new Date().toISOString(),
  };

  // ── Persist to localStorage + Supabase ────────────────────────────
  const existing: GTKJobOrder[] = JSON.parse(localStorage.getItem('gtk_erp_gtk_job_orders') || '[]');
  existing.push(jobOrder);
  localStorage.setItem('gtk_erp_gtk_job_orders', JSON.stringify(existing));

  // Save to production_pieces (one per item×qty for production tracking)
  try {
    const pieces = option.items.flatMap(item => {
      const qty = item.qty || 1;
      const wt = WINDOW_TYPES.find(w => w.id === item.windowTypeId);
      return Array.from({ length: qty }, (_, pieceIdx) => ({
        id: `${joId}-${item.id}-${pieceIdx + 1}`,
        order_id: joId,
        item_index: option.items.indexOf(item),
        specs: [
          wt?.label || item.windowTypeId,
          item.location,
          item.floor,
          `${Math.round(item.widthFt * 304.8)}×${Math.round(item.heightFt * 304.8)}mm`,
        ].filter(Boolean).join(' | '),
        status: 'Pending',
        last_updated: new Date().toISOString(),
      }));
    });

    const { error } = await supabase.from('production_pieces').upsert(pieces);
    if (error) Logger.warn('GTKJobOrder', 'Production pieces upsert failed', error);

    // Save job order to job_orders table
    const { error: joErr } = await supabase.from('job_orders').upsert([{
      id: joId,
      company,
      data: jobOrder,
      updated_at: new Date().toISOString(),
    }]);
    if (joErr) Logger.warn('GTKJobOrder', 'Job orders upsert failed', joErr);

  } catch (e) {
    Logger.warn('GTKJobOrder', 'Supabase push failed — saved locally', e);
  }

  return jobOrder;
}

// ── Load all job orders for a company ────────────────────────────────
export const getGTKJobOrders = (company: Company = 'GTK'): GTKJobOrder[] => {
  try {
    const all: GTKJobOrder[] = JSON.parse(localStorage.getItem('gtk_erp_gtk_job_orders') || '[]');
    return all.filter(jo => jo.company === company).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
};
