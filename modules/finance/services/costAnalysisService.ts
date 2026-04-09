/**
 * costAnalysisService.ts — Stage 4A/4B/4C
 * True Cost per SqFt, Job Profitability, Rate Adequacy
 */

import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { SalesService } from '@/modules/sales/services/salesService';
import { ProductionService } from '@/modules/production/services/productionService';
import { FinanceService } from '@/modules/finance/services/financeService';

// ── Types ─────────────────────────────────────────────────────────
export interface TrueCostPerSqft {
  glassType: string;
  thickness: string;
  materialMAP: number;        // Moving Average Price per sqft
  wastageAllocation: number;  // wastage % applied
  energyCost: number;         // generator fuel per sqft
  labourCost: number;         // wages / sqft produced
  outsourcingCost: number;    // tempering/lamination per sqft
  freightCost: number;        // inward + outward freight per sqft
  totalCost: number;
  currentSellingRate: number;
  margin: number;             // selling - cost
  marginPct: number;
  isLossMaking: boolean;
}

export interface JobProfitability {
  orderId: string;
  orderNo: string;
  clientName: string;
  projectName: string;
  date: string;
  revenue: number;
  materialCost: number;
  labourCost: number;
  energyCost: number;
  outsourcingCost: number;
  freightCost: number;
  totalCost: number;
  profit: number;
  profitPct: number;
  isLossMaking: boolean;
  status: string;
}

export interface DeliveryKPI {
  totalOrders: number;
  ordersWithDelivery: number;
  onTimeCount: number;
  lateCount: number;
  onTimePct: number;
  avgDelayDays: number;
  delayByCategory: { category: string; count: number; pct: number }[];
  monthlyTrend: { month: string; onTimePct: number; total: number }[];
}

// ── Helpers ───────────────────────────────────────────────────────
function getGeneratorLogs(company: string): any[] {
  // Read from localStorage cache (populated by GeneratorService.getLogs Supabase fetch)
  try { return JSON.parse(localStorage.getItem('gtk_erp_generator_logs') || '[]').filter((l: any) => l.company === company); } catch { return []; }
}
function getLabourLogs(company: string): any[] {
  // Read from localStorage cache (populated by LabourService.getLogs Supabase fetch)
  try { return JSON.parse(localStorage.getItem('gtk_erp_cutter_daily_logs') || '[]').filter((l: any) => l.company === company); } catch { return []; }
}
// NOTE: These caches are populated by GeneratorService.getLogs() and LabourService.getLogs()
// which fetch from Supabase and write-through to localStorage. Call those services
// on module mount to ensure fresh data before calling costAnalysis functions.

// ══════════════════════════════════════════════════════════════════
// 4A: TRUE COST PER SQFT
// ══════════════════════════════════════════════════════════════════
export function calculateTrueCostPerSqft(company: string): TrueCostPerSqft[] {
  const store = InventoryService.getStore().filter(i => i.company === company && i.category === 'Raw');
  const genLogs = getGeneratorLogs(company);
  const labourLogs = getLabourLogs(company);
  const sessions = InventoryService.getCuttingSessions().filter(s => s.company === company);
  const dispatches = ProductionService.getTemperingDispatches().filter(d => d.company === company);

  // Compute averages
  const totalGenFuelCost = genLogs.reduce((s: number, l: any) => s + (l.fuelLitresUsed * l.fuelRatePerLitre || l.fuelCost || 0), 0);
  const totalGenSqft = genLogs.reduce((s: number, l: any) => s + (l.cuttingSqftProduced || 0), 0);
  const energyPerSqft = totalGenSqft > 0 ? totalGenFuelCost / totalGenSqft : 0;

  const totalLabourSqft = labourLogs.reduce((s: number, l: any) => s + (l.sqftProduced || 0), 0);
  const estimatedMonthlyWages = 150000; // rough estimate — 5 cutters × 30K
  const labourDays = new Set(labourLogs.map((l: any) => l.logDate)).size;
  const labourPerSqft = totalLabourSqft > 0 ? (estimatedMonthlyWages * (labourDays / 26)) / totalLabourSqft : 0;

  const avgWastagePct = sessions.length > 0
    ? sessions.reduce((s, cs) => s + (cs.estimatedWastagePct || 0), 0) / sessions.length
    : 12; // default 12%

  const totalDispatchSqft = dispatches.reduce((s, d) => s + d.totalSqFt, 0);
  const totalDispatchCharges = dispatches.reduce((s, d) => s + (d.totalCharges || 0), 0);
  const outsourcingPerSqft = totalDispatchSqft > 0 ? totalDispatchCharges / totalDispatchSqft : 0;

  // Build per-thickness analysis
  const results: TrueCostPerSqft[] = [];
  const grouped: Record<string, typeof store> = {};
  store.forEach(item => {
    const key = item.name.replace(/\d+x\d+/g, '').trim();
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });

  Object.entries(grouped).forEach(([nameKey, items]) => {
    const thicknessMatch = nameKey.match(/(\d+(?:\.\d+)?)\s*mm/i);
    const thickness = thicknessMatch ? `${thicknessMatch[1]}mm` : 'Unknown';
    let glassType = 'Plain';
    const lower = nameKey.toLowerCase();
    if (lower.includes('mirror')) glassType = 'Mirror';
    else if (lower.includes('tint') || lower.includes('color')) glassType = 'Tinted';

    const avgMAP = items.reduce((s, i) => s + i.movingAveragePrice, 0) / items.length;
    const wastageAlloc = avgMAP * (avgWastagePct / 100);
    const totalCost = avgMAP + wastageAlloc + energyPerSqft + labourPerSqft + outsourcingPerSqft;

    // Estimate selling rate from quotations
    const quotations = SalesService.getQuotations().filter(q => q.company === company);
    let sellingRate = 0;
    let rateCount = 0;
    quotations.forEach(q => {
      (q.items || []).forEach((item: any) => {
        const itemThk = item.glassThickness || item.thickness || '';
        if (itemThk.includes(thickness.replace('mm', ''))) {
          const sqft = (item.totalSqFt || item.sqft || 0);
          if (sqft > 0 && item.amount > 0) {
            sellingRate += item.amount / sqft;
            rateCount++;
          }
        }
      });
    });
    const avgSellingRate = rateCount > 0 ? sellingRate / rateCount : 0;
    const margin = avgSellingRate - totalCost;

    results.push({
      glassType, thickness, materialMAP: avgMAP, wastageAllocation: wastageAlloc,
      energyCost: energyPerSqft, labourCost: labourPerSqft,
      outsourcingCost: outsourcingPerSqft, freightCost: 0,
      totalCost: Number(totalCost.toFixed(2)),
      currentSellingRate: Number(avgSellingRate.toFixed(2)),
      margin: Number(margin.toFixed(2)),
      marginPct: avgSellingRate > 0 ? Number((margin / avgSellingRate * 100).toFixed(1)) : 0,
      isLossMaking: margin < 0 && avgSellingRate > 0,
    });
  });

  return results.sort((a, b) => a.marginPct - b.marginPct);
}

// ══════════════════════════════════════════════════════════════════
// 4B: JOB PROFITABILITY
// ══════════════════════════════════════════════════════════════════
export function calculateJobProfitability(company: string): JobProfitability[] {
  const quotations = SalesService.getQuotations().filter(q => q.company === company && q.status !== 'Draft');
  const clients    = SalesService.getClients();
  const invoices   = SalesService.getInvoices().filter((i: any) => i.company === company);
  const dispatches = ProductionService.getTemperingDispatches().filter(d => d.company === company);
  const costData   = calculateTrueCostPerSqft(company);

  // Average cost factors
  const avgEnergy = costData.length > 0 ? costData.reduce((s, c) => s + c.energyCost, 0) / costData.length : 0;
  const avgLabour = costData.length > 0 ? costData.reduce((s, c) => s + c.labourCost, 0) / costData.length : 0;

  return quotations.map(q => {
    const client = clients.find(c => c.id === q.clientId);

    // Prefer actual invoice amount (post-discount, post-revision) over quotation estimate
    const invoice = invoices.find((i: any) => i.orderId === q.id);
    const revenue = invoice
      ? invoice.totalAmount
      : (q.items || []).reduce((s: number, i: any) => s + (i.amount || 0), 0);
    const totalSqft = (q.items || []).reduce((s: number, i: any) => s + (i.totalSqFt || i.sqft || 0), 0);

    // Material cost from MAP
    const materialCost = (q.items || []).reduce((s: number, item: any) => {
      const matching = costData.find(c => {
        const thk = item.glassThickness || item.thickness || '';
        return thk.includes(c.thickness.replace('mm', ''));
      });
      const sqft = item.totalSqFt || item.sqft || 0;
      return s + (matching ? matching.materialMAP * sqft : 0);
    }, 0);

    const labourCost = totalSqft * avgLabour;
    const energyCost = totalSqft * avgEnergy;

    // Outsourcing from dispatches
    const jobDispatches = dispatches.filter(d => d.pieceIds?.some(pid => pid.includes(q.orderNo || q.id)));
    const outsourcingCost = jobDispatches.reduce((s, d) => s + (d.totalCharges || 0), 0);

    // Sum raw floating-point values first — no intermediate rounding.
    // Math.round() applied ONCE at the final P&L level only to avoid
    // double-rounding drift where rounded(a) + rounded(b) ≠ rounded(a+b).
    const totalCostRaw = materialCost + labourCost + energyCost + outsourcingCost;
    const profitRaw    = revenue - totalCostRaw;

    return {
      orderId: q.id, orderNo: q.orderNo || q.id,
      clientName: client?.name || q.clientId,
      projectName: q.projectName || '',
      date: q.date, revenue,
      materialCost,    // raw float — display layer formats as needed
      labourCost,      // raw float
      energyCost,      // raw float
      outsourcingCost, // raw float
      freightCost: 0,
      totalCost: Math.round(totalCostRaw),   // single round at P&L boundary
      profit:    Math.round(profitRaw),       // single round at P&L boundary
      profitPct: revenue > 0 ? Number((profitRaw / revenue * 100).toFixed(1)) : 0,
      isLossMaking: profitRaw < 0 && revenue > 0,
      status: q.status,
    };
  }).sort((a, b) => a.profitPct - b.profitPct);
}

// ══════════════════════════════════════════════════════════════════
// 4D: DELIVERY PERFORMANCE KPIs
// ══════════════════════════════════════════════════════════════════
export function calculateDeliveryKPIs(company: string): DeliveryKPI {
  const quotations = SalesService.getQuotations().filter(q => q.company === company);
  const withDelivery = quotations.filter(q => q.actualDeliveryDate && q.dueDate);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  let onTime = 0, late = 0, totalDelay = 0;
  const delayCats: Record<string, number> = { Internal: 0, Outsourcing: 0, Client: 0, Unknown: 0 };

  withDelivery.forEach(q => {
    const due = new Date(q.dueDate!);
    const actual = new Date(q.actualDeliveryDate!);
    if (actual <= due) { onTime++; }
    else {
      late++;
      const delayDays = Math.ceil((actual.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      totalDelay += delayDays;
      const cat = (q as any).delayCategory || 'Unknown';
      delayCats[cat] = (delayCats[cat] || 0) + 1;
    }
  });

  const total = withDelivery.length;
  const delayByCategory = Object.entries(delayCats).filter(([, c]) => c > 0).map(([cat, count]) => ({
    category: cat, count, pct: total > 0 ? Number((count / total * 100).toFixed(0)) : 0,
  }));

  // Monthly trend
  const byMonth: Record<string, { onTime: number; total: number }> = {};
  withDelivery.forEach(q => {
    const m = q.dueDate!.substring(0, 7);
    if (!byMonth[m]) byMonth[m] = { onTime: 0, total: 0 };
    byMonth[m].total++;
    const due = new Date(q.dueDate!);
    const actual = new Date(q.actualDeliveryDate!);
    if (actual <= due) byMonth[m].onTime++;
  });
  const monthlyTrend = Object.entries(byMonth).sort().map(([m, d]) => ({
    month: MONTHS[parseInt(m.split('-')[1]) - 1] + ' ' + m.split('-')[0].slice(2),
    onTimePct: d.total > 0 ? Number((d.onTime / d.total * 100).toFixed(0)) : 0,
    total: d.total,
  }));

  return {
    totalOrders: quotations.length,
    ordersWithDelivery: total,
    onTimeCount: onTime, lateCount: late,
    onTimePct: total > 0 ? Number((onTime / total * 100).toFixed(0)) : 0,
    avgDelayDays: late > 0 ? Number((totalDelay / late).toFixed(1)) : 0,
    delayByCategory, monthlyTrend,
  };
}
