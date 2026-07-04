/**
 * mrpService.ts — Phase 1: Material Requirements Planning
 *
 * Reads approved orders → calculates glass required by type+thickness →
 * compares vs live stock → outputs shortage / surplus per material.
 * Also backward-schedules latest cutting start date from due date.
 */

import { SalesService } from '@/modules/sales/services/salesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { ProductionService } from '@/modules/production/services/productionService';

// ── Types ────────────────────────────────────────────────────────────

export interface MRPRequirement {
  materialKey: string;          // e.g. "6mm-Plain"
  thickness: string;            // e.g. "6mm"
  glassType: string;            // e.g. "Plain"
  totalSqftRequired: number;    // gross — before wastage
  wastageBuffer: number;        // % to add (from historical or default)
  grossSqftWithWastage: number; // what to actually consume
  stockAvailable: number;       // unrestrictedQty in store
  shortage: number;             // max(0, gross - stock)
  surplus: number;              // max(0, stock - gross)
  status: 'ok' | 'shortage' | 'surplus';
  ordersContributing: { orderId: string; orderRef: string; sqft: number; dueDate: string }[];
}

export interface MRPSchedule {
  orderId: string;
  orderRef: string;
  clientName: string;
  dueDate: string;
  totalSqft: number;
  latestCuttingStart: string;   // backward scheduled
  daysUntilDue: number;
  daysUntilStart: number;
  isUrgent: boolean;            // start within 2 days
  isOverdue: boolean;
  glassBreakdown: { key: string; sqft: number }[];
}

export interface MRPResult {
  runAt: string;
  company: string;
  requirements: MRPRequirement[];
  schedule: MRPSchedule[];
  totalShortages: number;
  totalOrders: number;
  ordersAtRisk: number;         // orders with shortage on required material
}

// ── Constants ────────────────────────────────────────────────────────

const DEFAULT_WASTAGE: Record<string, number> = {
  Plain: 12, Color: 14, Mirror: 15, Frosted: 14, Tinted: 14,
  Laminated: 16, default: 12,
};

const LEAD_TIME_DAYS = {
  cutting: 1,
  services: 1,
  tempering: 3,
  buffer: 1,
};

// ── Helpers ──────────────────────────────────────────────────────────

function today(): Date { return new Date(); }

function addWorkingDays(date: Date, days: number): Date {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 5) added++; // skip Friday (Pakistan)
  }
  return d;
}

function subtractWorkingDays(date: Date, days: number): string {
  const d = new Date(date);
  let subtracted = 0;
  while (subtracted < days) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() !== 5) subtracted++;
  }
  return d.toISOString().split('T')[0];
}

function daysUntil(dateStr: string): number {
  if (!dateStr) return 999;
  return Math.ceil((new Date(dateStr).getTime() - today().getTime()) / 86400000);
}

function parseThickness(item: any): string {
  const candidates = [
    item.glassThickness, item.thickness,
    (item.glassType || '').match(/(\d+mm)/i)?.[1],
    (item.glazingSpecs || '').match(/(\d+mm)/i)?.[1],
    (item.specs || '').match(/(\d+mm)/i)?.[1],
  ];
  for (const c of candidates) {
    if (c && /\d+mm/i.test(c)) return c.toLowerCase().replace(' ', '');
  }
  return '6mm'; // default
}

function parseGlassType(item: any): string {
  const t = (item.glassType || item.subCategory || '').trim();
  if (!t) return 'Plain';
  if (t.toLowerCase().includes('mirror')) return 'Mirror';
  if (t.toLowerCase().includes('color') || t.toLowerCase().includes('tint')) return 'Tinted';
  if (t.toLowerCase().includes('frost') || t.toLowerCase().includes('acid')) return 'Frosted';
  return t || 'Plain';
}

// ── Historical wastage avg from cutting sessions ──────────────────────

function getHistoricalWastage(company: string, glassType: string): number {
  try {
    const sessions = InventoryService.getCuttingSessions()
      .filter((s: any) => s.company === company && s.status === 'Closed' && s.actualWastagePct != null);
    if (sessions.length < 3) return DEFAULT_WASTAGE[glassType] || DEFAULT_WASTAGE.default;
    const avg = sessions.reduce((sum: number, s: any) => sum + (s.actualWastagePct || 0), 0) / sessions.length;
    return Number(avg.toFixed(1));
  } catch {
    return DEFAULT_WASTAGE[glassType] || DEFAULT_WASTAGE.default;
  }
}

// ── Main MRP run ──────────────────────────────────────────────────────

export function runMRP(company: string): MRPResult {
  const allQuotations = SalesService.getQuotations()
    .filter((q: any) => q.company === company && ['Approved', 'Invoiced'].includes(q.status));
  const allClients = SalesService.getClients();
  const allPieces = ProductionService.getProductionPieces();
  const storeItems = InventoryService.getStore()
    .filter((i: any) => i.company === company && i.category === 'Raw');

  // ── Stock map: "6mm-Plain" → sqft available ──────────────────────
  const stockMap: Record<string, number> = {};
  storeItems.forEach((item: any) => {
    const name = item.name || '';
    const thkMatch = name.match(/(\d+(?:\.\d+)?)mm/i);
    const thickness = thkMatch ? `${thkMatch[1]}mm` : '?';
    let glassType = 'Plain';
    const lower = name.toLowerCase();
    if (lower.includes('mirror')) glassType = 'Mirror';
    else if (lower.includes('tint') || lower.includes('bronze') || lower.includes('grey') || lower.includes('green')) glassType = 'Tinted';
    else if (lower.includes('frost') || lower.includes('acid')) glassType = 'Frosted';
    const key = `${thickness}-${glassType}`;
    const qty = item.unrestrictedQty || item.quantity || 0;
    // Convert sheets to sqft
    const sizeMatch = name.match(/(\d+)\s*x\s*(\d+)/i);
    const sheetSqft = sizeMatch ? (Number(sizeMatch[1]) * Number(sizeMatch[2])) / 144 : 42;
    stockMap[key] = (stockMap[key] || 0) + (qty * sheetSqft);
  });

  // ── Requirements map ─────────────────────────────────────────────
  const reqMap: Record<string, {
    sqft: number;
    orders: MRPRequirement['ordersContributing'];
    glassType: string;
    thickness: string;
  }> = {};

  // ── Schedule list ────────────────────────────────────────────────
  const schedule: MRPSchedule[] = [];

  allQuotations.forEach((q: any) => {
    const client = allClients.find((c: any) => c.id === q.clientId);
    const orderPieces = allPieces.filter(
      (p: any) => p.orderId === q.id || p.orderId === q.orderNo
    );

    // Only include orders not yet fully delivered
    const allDelivered = orderPieces.length > 0 && orderPieces.every((p: any) => p.status === 'Delivered');
    if (allDelivered) return;

    const dueDate = q.dueDate || q.reqDate || '';
    const due = daysUntil(dueDate);
    const totalLeadDays = LEAD_TIME_DAYS.cutting + LEAD_TIME_DAYS.services + LEAD_TIME_DAYS.tempering + LEAD_TIME_DAYS.buffer;
    const latestStart = dueDate ? subtractWorkingDays(new Date(dueDate), totalLeadDays) : '';
    const daysToStart = latestStart ? daysUntil(latestStart) : 999;

    const glassBreakdown: MRPSchedule['glassBreakdown'] = [];
    let orderTotalSqft = 0;

    (q.items || []).forEach((item: any) => {
      if (item.isSection) return;
      const sqft = item.totalSqFt || 0;
      if (sqft <= 0) return;
      const thickness = parseThickness(item);
      const glassType = parseGlassType(item);
      const key = `${thickness}-${glassType}`;

      if (!reqMap[key]) {
        reqMap[key] = { sqft: 0, orders: [], glassType, thickness };
      }
      reqMap[key].sqft += sqft;
      const existing = reqMap[key].orders.find(o => o.orderId === (q.orderNo || q.id));
      if (existing) { existing.sqft += sqft; }
      else {
        reqMap[key].orders.push({
          orderId: q.id,
          orderRef: q.orderNo || q.id,
          sqft,
          dueDate,
        });
      }

      glassBreakdown.push({ key, sqft });
      orderTotalSqft += sqft;
    });

    schedule.push({
      orderId: q.id,
      orderRef: q.orderNo || q.id,
      clientName: client?.name || q.clientId || '—',
      dueDate,
      totalSqft: orderTotalSqft,
      latestCuttingStart: latestStart,
      daysUntilDue: due,
      daysUntilStart: daysToStart,
      isUrgent: daysToStart <= 2 && daysToStart > -1,
      isOverdue: daysToStart < 0,
      glassBreakdown,
    });
  });

  // Sort schedule by due date
  schedule.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  // ── Build requirements with shortage calc ────────────────────────
  const requirements: MRPRequirement[] = Object.entries(reqMap).map(([key, data]): MRPRequirement => {
    const wastage = getHistoricalWastage(company, data.glassType);
    const gross = Number((data.sqft * (1 + wastage / 100)).toFixed(1));
    const stock = stockMap[key] || 0;
    const shortage = Math.max(0, Number((gross - stock).toFixed(1)));
    const surplus = Math.max(0, Number((stock - gross).toFixed(1)));
    return {
      materialKey: key,
      thickness: data.thickness,
      glassType: data.glassType,
      totalSqftRequired: Number(data.sqft.toFixed(1)),
      wastageBuffer: wastage,
      grossSqftWithWastage: gross,
      stockAvailable: Number(stock.toFixed(1)),
      shortage,
      surplus,
      status: shortage > 0 ? 'shortage' : surplus > 5 ? 'surplus' : 'ok',
      ordersContributing: data.orders,
    };
  }).sort((a, b) => b.shortage - a.shortage);

  // Orders at risk = orders that need a material with shortage
  const shortageKeys = new Set(requirements.filter(r => r.shortage > 0).map(r => r.materialKey));
  const ordersAtRisk = schedule.filter(s =>
    s.glassBreakdown.some(g => shortageKeys.has(g.key))
  ).length;

  return {
    runAt: new Date().toISOString(),
    company,
    requirements,
    schedule,
    totalShortages: requirements.filter(r => r.shortage > 0).length,
    totalOrders: schedule.length,
    ordersAtRisk,
  };
}
