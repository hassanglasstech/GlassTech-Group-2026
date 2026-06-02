/**
 * intelligenceService.ts — Phase 3: CMA Intelligence Layer
 *
 * Three functions:
 * 1. getClientProfitability()   — revenue vs cost per client
 * 2. getOverheadAbsorptionRate() — actual overhead vs absorbed overhead
 * 3. getCostPerSqft()           — true cost breakdown per sqft (GlassCo)
 */

import { SalesService } from '@/modules/sales/services/salesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { ProductionService } from '@/modules/production/services/productionService';
import { FinanceService } from './financeService';
import { Company } from '@/modules/shared/types/core';

const round2 = (n: number) => Math.round(n * 100) / 100;
const curMonth = () => new Date().toISOString().slice(0, 7);

// ── Types ──────────────────────────────────────────────────────────────────

export interface ClientProfitability {
  clientId:       string;
  clientName:     string;
  orderCount:     number;
  totalRevenue:   number;
  totalSqft:      number;
  estGlassCost:   number;   // from MAP × sqft
  estServiceCost: number;   // from POs (tempering etc.)
  estOverhead:    number;   // overhead rate × sqft
  grossProfit:    number;
  marginPct:      number;
  revenuePerSqft: number;
  costPerSqft:    number;
  profitPerSqft:  number;
  rating:         'A' | 'B' | 'C' | 'D'; // A=margin>30%, D=margin<10%
}

export interface OverheadRate {
  period:           string;
  totalOverhead:    number;   // actual overhead costs collected
  totalSqftProduced:number;
  ratePerSqft:      number;   // actual overhead / actual sqft
  standardRate:     number;   // configured standard (default PKR 18 if not set)
  absorbedOverhead: number;   // standard rate × actual sqft
  variance:         number;   // absorbed - actual (positive = over-absorbed)
  variancePct:      number;
  status:           'OVER_ABSORBED' | 'UNDER_ABSORBED' | 'ON_TARGET';
}

export interface CostPerSqftBreakdown {
  period:       string;
  totalSqft:    number;
  components: {
    label:        string;
    amount:       number;
    perSqft:      number;
    pct:          number;
  }[];
  totalCost:    number;
  costPerSqft:  number;
  revenue:      number;
  revenuePerSqft:number;
  marginPerSqft: number;
  marginPct:    number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getOrderRevenue(order: any): number {
  const glass   = (order.items || []).reduce((s: number, i: any) => s + (i.amount || 0), 0);
  const disc    = order.discountAmount || (glass * (order.discountPercent || 0) / 100);
  const service = (order.serviceCharges || []).reduce((s: number, c: any) => s + (c.amount || 0), 0);
  return glass - disc + service;
}

function getOrderSqft(order: any): number {
  return (order.items || []).reduce((s: number, i: any) => s + (i.totalSqFt || 0), 0);
}

// ── Service ────────────────────────────────────────────────────────────────

export const IntelligenceService = {

  // ── 1. Client Profitability ───────────────────────────────────────────
  getClientProfitability(company: Company, months?: number): ClientProfitability[] {
    const cutoff = months
      ? new Date(Date.now() - months * 30 * 86400000).toISOString().slice(0, 10)
      : undefined;

    const orders = ProductionService.getJobOrders().filter((o: any) =>
      o.company === company &&
      o.status !== 'Draft' &&
      o.status !== 'Rejected' &&
      (!cutoff || (o.date || '') >= cutoff)
    );

    const clients = SalesService.getClients
      ? SalesService.getClients().filter((c: any) => c.company === company)
      : [];

    const store = InventoryService.getStore().filter((s: any) => s.company === company);
    const glassMAP = store.find((s: any) =>
      s.category === 'Raw' && (s.name || '').toLowerCase().includes('glass')
    )?.movingAveragePrice || 0;

    // Overhead rate (PKR/sqft) from GL if available, else default
    const overheadRate = 18; // will be replaced by actual in getOverheadAbsorptionRate

    // Group by client
    const map: Record<string, {
      orders: any[];
      revenue: number;
      sqft: number;
    }> = {};

    orders.forEach((o: any) => {
      const cid = o.clientId || 'unknown';
      if (!map[cid]) map[cid] = { orders: [], revenue: 0, sqft: 0 };
      map[cid].orders.push(o);
      map[cid].revenue += getOrderRevenue(o);
      map[cid].sqft    += getOrderSqft(o);
    });

    return Object.entries(map).map(([clientId, data]) => {
      const client = clients.find((c: any) => c.id === clientId);
      const estGlassCost   = data.sqft * glassMAP;
      const estServiceCost = data.revenue * 0.12; // ~12% service cost ratio
      const estOverhead    = data.sqft * overheadRate;
      const totalCost      = estGlassCost + estServiceCost + estOverhead;
      const grossProfit    = data.revenue - totalCost;
      const marginPct      = data.revenue > 0 ? round2(grossProfit / data.revenue * 100) : 0;
      const sqft           = Math.max(data.sqft, 1);

      return {
        clientId,
        clientName:     client?.name || clientId,
        orderCount:     data.orders.length,
        totalRevenue:   Math.round(data.revenue),
        totalSqft:      round2(data.sqft),
        estGlassCost:   Math.round(estGlassCost),
        estServiceCost: Math.round(estServiceCost),
        estOverhead:    Math.round(estOverhead),
        grossProfit:    Math.round(grossProfit),
        marginPct,
        revenuePerSqft: round2(data.revenue / sqft),
        costPerSqft:    round2(totalCost / sqft),
        profitPerSqft:  round2(grossProfit / sqft),
        rating: marginPct >= 30 ? 'A' : marginPct >= 20 ? 'B' : marginPct >= 10 ? 'C' : 'D',
      };
    }).sort((a, b) => b.grossProfit - a.grossProfit);
  },

  // ── 2. Overhead Absorption Rate ────────────────────────────────────────
  getOverheadAbsorptionRate(company: Company, month?: string): OverheadRate {
    const mon = month || curMonth();

    // Actual overhead = petty cash entries (non-labour) + GL overhead account entries
    const petty = FinanceService.getPettyCashEntries().filter(p =>
      p.company === company &&
      p.type === 'Payment' &&
      p.status === 'Posted' &&
      p.date.startsWith(mon)
    );

    const labourKeywords = ['labour', 'wage', 'salary'];
    const overhead = petty.filter(p =>
      !labourKeywords.some(k =>
        (p.description || '').toLowerCase().includes(k) ||
        (p.businessTransaction || '').toLowerCase().includes(k)
      )
    );
    const totalOverhead = overhead.reduce((s, p) => s + p.amount, 0);

    // Sqft produced this month from production pieces
    const pieces = ProductionService.getProductionPieces().filter((p: any) =>
      (p.company === company || !p.company) &&
      (p.createdAt || p.date || '').startsWith(mon) &&
      p.status !== 'Broken'
    );

    // Estimate sqft from pieces (each piece ~2-5 sqft average)
    const totalSqftProduced = pieces.length * 3.5; // rough estimate
    const sqftBase = Math.max(totalSqftProduced, 1);

    const ratePerSqft   = round2(totalOverhead / sqftBase);
    const standardRate  = 18; // PKR 18/sqft standard
    const absorbedOverhead = standardRate * sqftBase;
    const variance      = Math.round(absorbedOverhead - totalOverhead);
    const variancePct   = totalOverhead > 0 ? round2(variance / totalOverhead * 100) : 0;

    return {
      period: mon,
      totalOverhead:     Math.round(totalOverhead),
      totalSqftProduced: round2(sqftBase),
      ratePerSqft,
      standardRate,
      absorbedOverhead:  Math.round(absorbedOverhead),
      variance,
      variancePct,
      status: Math.abs(variancePct) <= 5
        ? 'ON_TARGET'
        : variance > 0 ? 'OVER_ABSORBED' : 'UNDER_ABSORBED',
    };
  },

  // ── 3. True Cost per Sqft Breakdown ────────────────────────────────────
  getCostPerSqft(company: Company, period: 'month' | 'all' = 'month'): CostPerSqftBreakdown {
    const mon = curMonth();
    const filter = (date: string) => period === 'all' || (date || '').startsWith(mon);

    const orders = ProductionService.getJobOrders().filter((o: any) =>
      o.company === company && o.status !== 'Draft' && filter(o.date || '')
    );

    const revenue  = orders.reduce((s: number, o: any) => s + getOrderRevenue(o), 0);
    const totalSqft= orders.reduce((s: number, o: any) => s + getOrderSqft(o), 0);
    const sqftBase = Math.max(totalSqft, 1);

    // Material cost from POs
    const pos = InventoryService.getPurchaseOrders
      ? InventoryService.getPurchaseOrders().filter((p: any) =>
          p.fromCompany === company &&
          ['Glass', undefined, null, ''].includes(p.category) &&
          filter(p.date || '')
        )
      : [];
    const glassCost   = pos.reduce((s: number, p: any) => s + (p.totalAmount || 0), 0);
    const freightCost = pos.reduce((s: number, p: any) => s + (p.totalFreight || 0), 0);

    // Tempering/service POs
    const servicePOs = InventoryService.getPurchaseOrders
      ? InventoryService.getPurchaseOrders().filter((p: any) =>
          p.fromCompany === company &&
          ['Tempering', 'Hardware'].includes(p.category || '') &&
          filter(p.date || '')
        )
      : [];
    const serviceCost = servicePOs.reduce((s: number, p: any) => s + (p.totalAmount || 0), 0);

    // Overhead from petty cash
    const petty = FinanceService.getPettyCashEntries().filter(p =>
      p.company === company && p.type === 'Payment' && p.status === 'Posted' && filter(p.date)
    );
    const labourKw = ['labour','wage'];
    const labourCost   = petty.filter(p => labourKw.some(k => (p.description||'').toLowerCase().includes(k))).reduce((s,p)=>s+p.amount,0);
    const overheadCost = petty.filter(p => !labourKw.some(k => (p.description||'').toLowerCase().includes(k))).reduce((s,p)=>s+p.amount,0);

    const totalCost = glassCost + freightCost + serviceCost + labourCost + overheadCost;

    const components = [
      { label: 'Glass Material',  amount: glassCost,    perSqft: round2(glassCost / sqftBase),    pct: totalCost > 0 ? round2(glassCost / totalCost * 100) : 0 },
      { label: 'Inward Freight',  amount: freightCost,  perSqft: round2(freightCost / sqftBase),  pct: totalCost > 0 ? round2(freightCost / totalCost * 100) : 0 },
      { label: 'Tempering / SVC', amount: serviceCost,  perSqft: round2(serviceCost / sqftBase),  pct: totalCost > 0 ? round2(serviceCost / totalCost * 100) : 0 },
      { label: 'Direct Labour',   amount: labourCost,   perSqft: round2(labourCost / sqftBase),   pct: totalCost > 0 ? round2(labourCost / totalCost * 100) : 0 },
      { label: 'Factory Overhead',amount: overheadCost, perSqft: round2(overheadCost / sqftBase), pct: totalCost > 0 ? round2(overheadCost / totalCost * 100) : 0 },
    ].filter(c => c.amount > 0);

    return {
      period:          period === 'month' ? mon : 'All Time',
      totalSqft:       round2(totalSqft),
      components,
      totalCost:       Math.round(totalCost),
      costPerSqft:     round2(totalCost / sqftBase),
      revenue:         Math.round(revenue),
      revenuePerSqft:  round2(revenue / sqftBase),
      marginPerSqft:   round2((revenue - totalCost) / sqftBase),
      marginPct:       revenue > 0 ? round2((revenue - totalCost) / revenue * 100) : 0,
    };
  },
};
