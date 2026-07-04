/**
 * deliveryCalcService.ts — Stage 3A/3B/3C
 * 
 * 1. Vendor TAT computation from dispatch history
 * 2. Vendor suggestion: fastest vendor for urgent orders
 * 3. Delivery promise: cutting backlog + vendor TAT = earliest date
 */

import { SalesService } from '@/modules/sales/services/salesService';
import { ProductionService } from '@/modules/production/services/productionService';
import type { TemperingDispatch, ProductionPiece } from '@/modules/production/types/production';

export interface VendorTATSummary {
  vendorId: string;
  vendorName: string;
  type: string;
  totalDispatches: number;
  completedDispatches: number;
  avgTATDays: number;
  minTATDays: number;
  maxTATDays: number;
  reliability: number; // % on-time returns
}

export interface DeliveryEstimate {
  cuttingBacklogDays: number;
  vendorTATDays: number;
  bufferDays: number;
  totalDays: number;
  earliestDate: string;
  suggestedVendor: string | null;
  notes: string[];
}

// ── Vendor TAT from dispatch data ─────────────────────────────────
export function getVendorTATSummaries(company: string): VendorTATSummary[] {
  const vendors = SalesService.getVendors().filter(v => v.company === company || !v.company);
  
  let dispatches: TemperingDispatch[] = [];
  try {
    dispatches = ProductionService.getTemperingDispatches().filter(d => d.company === company);
  } catch { dispatches = []; }

  const summaries: VendorTATSummary[] = [];

  vendors.filter(v => v.type === 'Tempering' || (v.type as string) === 'Lamination').forEach(v => {
    const vendorDisps = dispatches.filter(d =>
      String(d.plantName ?? '').toUpperCase() === (v.name ?? '').toUpperCase()
    );
    if (vendorDisps.length === 0) {
      summaries.push({
        vendorId: v.id, vendorName: v.name, type: v.type,
        totalDispatches: 0, completedDispatches: 0,
        avgTATDays: 0, minTATDays: 0, maxTATDays: 0, reliability: 0,
      });
      return;
    }

    const tatDays: number[] = [];
    vendorDisps.forEach(d => {
      if (d.expectedReturnDate && d.date) {
        const days = Math.abs(new Date(d.expectedReturnDate).getTime() - new Date(d.date).getTime()) / (1000 * 60 * 60 * 24);
        if (days > 0 && days < 60) tatDays.push(days); // exclude outliers
      }
    });

    const completed = vendorDisps.filter(d => (d.status as string) === 'Received' || (d.status as string) === 'Completed' || (d.status as string) === 'Returned').length;
    const avg = tatDays.length > 0 ? tatDays.reduce((s, d) => s + d, 0) / tatDays.length : 0;

    summaries.push({
      vendorId: v.id, vendorName: v.name, type: v.type,
      totalDispatches: vendorDisps.length,
      completedDispatches: completed,
      avgTATDays: Number(avg.toFixed(1)),
      minTATDays: tatDays.length > 0 ? Number(Math.min(...tatDays).toFixed(1)) : 0,
      maxTATDays: tatDays.length > 0 ? Number(Math.max(...tatDays).toFixed(1)) : 0,
      reliability: vendorDisps.length > 0 ? Number((completed / vendorDisps.length * 100).toFixed(0)) : 0,
    });
  });

  return summaries.sort((a, b) => a.avgTATDays - b.avgTATDays);
}

// ── Vendor suggestion for urgent orders ───────────────────────────
export function suggestVendor(company: string, serviceType?: string): { suggestion: VendorTATSummary | null; alternatives: VendorTATSummary[] } {
  const summaries = getVendorTATSummaries(company)
    .filter(s => s.totalDispatches > 0) // only vendors with history
    .filter(s => !serviceType || s.type === serviceType);

  if (summaries.length === 0) return { suggestion: null, alternatives: [] };

  // Best = lowest avg TAT with at least some reliability
  const sorted = [...summaries].sort((a, b) => a.avgTATDays - b.avgTATDays);
  return { suggestion: sorted[0], alternatives: sorted.slice(1) };
}

// ── Delivery promise calculator ───────────────────────────────────
export function calculateDeliveryPromise(params: {
  company: string;
  hasTemperingService: boolean;
  hasLaminationService: boolean;
  hasDGService: boolean;
  orderValuePKR?: number;
  dailyCuttingCapacitySqft?: number; // default ~400
}): DeliveryEstimate {
  const { company, hasTemperingService, hasLaminationService, hasDGService, orderValuePKR = 0 } = params;
  const dailyCapacity = params.dailyCuttingCapacitySqft || 400;
  const notes: string[] = [];

  // 1. Cutting backlog
  let cuttingPieces: ProductionPiece[] = [];
  try {
    // ProductionPiece type lacks `company` flat field; access via cast.
    cuttingPieces = ProductionService.getProductionPieces().filter(p => (p as unknown as { company: string }).company === company && (p.status as string) === 'Cut');
  } catch {}

  // Estimate total pending sqft in queue
  const pendingSqft = cuttingPieces.length * 8; // rough estimate: avg 8 sqft per piece
  const cuttingBacklogDays = Math.ceil(pendingSqft / dailyCapacity);
  if (cuttingBacklogDays > 3) notes.push(`Cutting queue has ${cuttingPieces.length} pending pieces`);

  // 2. Vendor TAT (take the slowest required service)
  let vendorTATDays = 0;
  let suggestedVendor: string | null = null;

  if (hasTemperingService || hasLaminationService || hasDGService) {
    const serviceType = hasTemperingService ? 'Tempering' : 'Lamination';
    const { suggestion } = suggestVendor(company, serviceType);
    if (suggestion) {
      vendorTATDays = suggestion.avgTATDays;
      suggestedVendor = suggestion.vendorName;
      notes.push(`${suggestion.vendorName}: avg ${suggestion.avgTATDays} days (${suggestion.totalDispatches} trips)`);
    } else {
      vendorTATDays = 4; // default estimate
      notes.push('No vendor history — using 4-day estimate');
    }
  }

  // 3. Buffer
  let bufferDays = 1; // minimum 1 day
  if (orderValuePKR > 300000) { bufferDays = 2; notes.push('High-value order (>3 lac) — 2-day buffer'); }
  if (hasDGService) { bufferDays += 1; notes.push('D/G service adds extra day'); }

  const totalDays = cuttingBacklogDays + vendorTATDays + bufferDays;
  const earliest = new Date();
  earliest.setDate(earliest.getDate() + totalDays);
  // Skip Fridays (weekend in Pakistan)
  let addedDays = 0;
  const resultDate = new Date();
  while (addedDays < totalDays) {
    resultDate.setDate(resultDate.getDate() + 1);
    if (resultDate.getDay() !== 5) addedDays++; // skip Friday
  }

  return {
    cuttingBacklogDays,
    vendorTATDays,
    bufferDays,
    totalDays,
    earliestDate: resultDate.toISOString().split('T')[0],
    suggestedVendor,
    notes,
  };
}
