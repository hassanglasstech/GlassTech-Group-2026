/**
 * demandService.ts — Phase 3: SCM Intelligence
 *
 * 1. getDemandForecast()  — next 3 months demand based on order history
 * 2. getEOQSuggestions()  — Economic Order Quantity per inventory item
 */

import { ProductionService } from '@/modules/production/services/productionService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { Company } from '@/modules/shared/types/core';

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Types ──────────────────────────────────────────────────────────────────

export interface MonthlyDemand {
  month:        string;   // YYYY-MM
  orderCount:   number;
  totalSqft:    number;
  totalRevenue: number;
}

export interface DemandForecast {
  itemName:       string;
  category:       string;
  avgMonthlyQty:  number;   // 3-month rolling average
  forecastMonth1: number;   // next month forecast
  forecastMonth2: number;   // month after
  forecastMonth3: number;   // month after that
  trend:          'UP' | 'DOWN' | 'STABLE';
  trendPct:       number;   // % change last 3 months
  currentStock:   number;
  stockMonths:    number;   // how many months stock will last
  reorderPoint:   number;
  needsReorder:   boolean;
}

export interface EOQResult {
  itemId:         string;
  itemName:       string;
  category:       string;
  annualDemand:   number;    // units per year
  orderingCost:   number;    // PKR per order (estimated)
  holdingCost:    number;    // PKR per unit per year (estimated as 20% of unit cost)
  unitCost:       number;    // MAP
  eoq:            number;    // Economic Order Quantity
  currentStock:   number;
  reorderPoint:   number;
  ordersPerYear:  number;    // how many times to order per year
  totalAnnualCost:number;    // ordering cost + holding cost at EOQ
}

// ── Helpers ────────────────────────────────────────────────────────────────

function lastNMonths(n: number): string[] {
  const months: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }
  return months;
}

function nextNMonths(n: number): string[] {
  const months: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    months.push(d.toISOString().slice(0, 7));
  }
  return months;
}

// ── Service ────────────────────────────────────────────────────────────────

export const DemandService = {

  // ── 1. Order-based Demand Forecast ─────────────────────────────────────
  // Uses job order history to project next 3 months order volume
  getOrderForecast(company: Company): {
    historical: MonthlyDemand[];
    forecast:   MonthlyDemand[];
    avgOrdersPerMonth: number;
    avgSqftPerMonth: number;
    trend: 'UP' | 'DOWN' | 'STABLE';
  } {
    const last6 = lastNMonths(6);
    const orders = ProductionService.getJobOrders().filter((o: any) =>
      o.company === company && o.status !== 'Draft' && o.status !== 'Rejected'
    );

    // Build monthly history
    const historical: MonthlyDemand[] = last6.map(mon => {
      const monthOrders = orders.filter((o: any) => (o.date || '').startsWith(mon));
      const sqft = monthOrders.reduce((s: number, o: any) =>
        s + (o.items || []).reduce((si: number, i: any) => si + (i.totalSqFt || 0), 0), 0
      );
      const revenue = monthOrders.reduce((s: number, o: any) => {
        const g = (o.items || []).reduce((si: number, i: any) => si + (i.amount || 0), 0);
        const svc = (o.serviceCharges || []).reduce((si: number, c: any) => si + (c.amount || 0), 0);
        return s + g + svc;
      }, 0);
      return { month: mon, orderCount: monthOrders.length, totalSqft: round2(sqft), totalRevenue: Math.round(revenue) };
    });

    // 3-month rolling average for forecast
    const last3 = historical.slice(-3);
    const avgOrders = last3.reduce((s, m) => s + m.orderCount, 0) / 3;
    const avgSqft   = last3.reduce((s, m) => s + m.totalSqft, 0) / 3;
    const avgRevenue= last3.reduce((s, m) => s + m.totalRevenue, 0) / 3;

    // Trend: compare last month to 3-month avg
    const lastMonth = historical[historical.length - 1];
    const trendDelta = avgOrders > 0 ? (lastMonth.orderCount - avgOrders) / avgOrders * 100 : 0;
    const trend: 'UP' | 'DOWN' | 'STABLE' =
      trendDelta > 10 ? 'UP' : trendDelta < -10 ? 'DOWN' : 'STABLE';

    // Simple linear projection: apply trend to forecast
    const trendFactor = trend === 'UP' ? 1.05 : trend === 'DOWN' ? 0.95 : 1.0;
    const next3 = nextNMonths(3);
    const forecast: MonthlyDemand[] = next3.map((mon, i) => ({
      month:        mon,
      orderCount:   Math.round(avgOrders * Math.pow(trendFactor, i + 1)),
      totalSqft:    round2(avgSqft * Math.pow(trendFactor, i + 1)),
      totalRevenue: Math.round(avgRevenue * Math.pow(trendFactor, i + 1)),
    }));

    return {
      historical,
      forecast,
      avgOrdersPerMonth: round2(avgOrders),
      avgSqftPerMonth:   round2(avgSqft),
      trend,
    };
  },

  // ── 2. Inventory Demand Forecast per Item ──────────────────────────────
  getDemandForecast(company: Company): DemandForecast[] {
    const store = InventoryService.getStore().filter(
      (s: any) => s.company === company && s.category !== 'Service'
    );

    const last6 = lastNMonths(6);
    const pos = InventoryService.getPurchaseOrders
      ? InventoryService.getPurchaseOrders().filter((p: any) => p.fromCompany === company)
      : [];

    return store.map((item: any) => {
      // Get monthly GRN quantities as proxy for demand
      const monthlyQtys: number[] = last6.map(mon => {
        const monthPOs = pos.filter((p: any) =>
          (p.toVendor || '') &&
          (p.date || '').startsWith(mon) &&
          (p.items || []).some((i: any) =>
            (i.description || '').toLowerCase().includes((item.name || '').toLowerCase().slice(0, 6))
          )
        );
        return monthPOs.reduce((s: number, p: any) => s + (p.grnQty || 0), 0);
      });

      const avg3 = monthlyQtys.slice(-3).reduce((s, q) => s + q, 0) / 3;
      const avg6 = monthlyQtys.reduce((s, q) => s + q, 0) / 6;

      const trendDelta = avg6 > 0 ? (avg3 - avg6) / avg6 * 100 : 0;
      const trend: DemandForecast['trend'] =
        trendDelta > 10 ? 'UP' : trendDelta < -10 ? 'DOWN' : 'STABLE';

      const trendFactor = trend === 'UP' ? 1.05 : trend === 'DOWN' ? 0.95 : 1.0;
      const forecast1 = round2(avg3 * trendFactor);
      const forecast2 = round2(avg3 * trendFactor * trendFactor);
      const forecast3 = round2(avg3 * Math.pow(trendFactor, 3));

      const stockMonths = avg3 > 0 ? round2(item.quantity / avg3) : 99;

      return {
        itemName:       item.name,
        category:       item.category,
        avgMonthlyQty:  round2(avg3),
        forecastMonth1: forecast1,
        forecastMonth2: forecast2,
        forecastMonth3: forecast3,
        trend,
        trendPct:       round2(trendDelta),
        currentStock:   item.quantity,
        stockMonths,
        reorderPoint:   item.reorderPoint || 0,
        needsReorder:   item.quantity <= (item.reorderPoint || 0),
      };
    }).filter(f => f.avgMonthlyQty > 0 || f.currentStock > 0)
      .sort((a, b) => (a.needsReorder ? 0 : 1) - (b.needsReorder ? 0 : 1));
  },

  // ── 3. EOQ Suggestions ─────────────────────────────────────────────────
  // EOQ = sqrt(2 × D × S / H)
  // D = annual demand, S = ordering cost per order, H = holding cost per unit per year
  getEOQSuggestions(company: Company): EOQResult[] {
    const store = InventoryService.getStore().filter(
      (s: any) => s.company === company && s.category !== 'Service' && s.movingAveragePrice > 0
    );

    const ORDERING_COST = 2500; // PKR per order (admin + paperwork estimate)
    const HOLDING_RATE  = 0.20; // 20% of unit cost per year (storage + opportunity cost)

    const demandForecasts = DemandService.getDemandForecast(company);

    return store.map((item: any) => {
      const forecast = demandForecasts.find(f => f.itemName === item.name);
      const annualDemand = (forecast?.avgMonthlyQty || 0) * 12;

      const unitCost      = item.movingAveragePrice || 0;
      const holdingCost   = unitCost * HOLDING_RATE;
      const eoq = annualDemand > 0 && holdingCost > 0
        ? Math.round(Math.sqrt((2 * annualDemand * ORDERING_COST) / holdingCost))
        : 0;

      const ordersPerYear = eoq > 0 ? round2(annualDemand / eoq) : 0;
      const totalAnnualCost = eoq > 0
        ? Math.round((annualDemand / eoq) * ORDERING_COST + (eoq / 2) * holdingCost)
        : 0;

      return {
        itemId:         item.id,
        itemName:       item.name,
        category:       item.category,
        annualDemand:   round2(annualDemand),
        orderingCost:   ORDERING_COST,
        holdingCost:    round2(holdingCost),
        unitCost,
        eoq,
        currentStock:   item.quantity,
        reorderPoint:   item.reorderPoint || 0,
        ordersPerYear,
        totalAnnualCost,
      };
    }).filter(e => e.annualDemand > 0)
      .sort((a, b) => b.annualDemand - a.annualDemand);
  },
};
