/**
 * jobPLService.ts -- Financial Layer Phase 4
 *
 * Job-level P&L per sales order:
 *   Revenue:  glass + service charges - discount
 *   Material: glass sqft x MAP from store
 *   Service:  tempering/hardware POs linked to order
 *   Overhead: overhead rate x sqft (from overheadService)
 *   Labour:   direct labour cost (petty cash labour entries)
 *   Profit:   Revenue - Material - Service - Overhead - Labour
 */

import { ProductionService } from '@/modules/production/services/productionService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { SalesService } from '@/modules/sales/services/salesService';
import { FinanceService } from './financeService';
import { Company } from '@/modules/shared/types/core';

const round2 = (n: number) => Math.round(n * 100) / 100;
const curMonth = () => new Date().toISOString().slice(0, 7);

// ── Types ──────────────────────────────────────────────────────────────────

export interface JobPL {
  orderId:       string;
  orderNo:       string;
  clientId:      string;
  clientName:    string;
  date:          string;
  status:        string;
  company:       Company;

  // Revenue
  glassRevenue:  number;
  serviceRevenue:number;
  discount:      number;
  totalRevenue:  number;

  // Costs
  materialCost:  number;  // sqft x MAP
  serviceCost:   number;  // linked POs (tempering, hardware)
  overheadCost:  number;  // overhead rate x sqft
  labourCost:    number;  // estimated (5% of revenue if no direct data)

  totalCost:     number;
  grossProfit:   number;
  marginPct:     number;

  // Metrics
  totalSqft:     number;
  revenuePerSqft:number;
  costPerSqft:   number;
  profitPerSqft: number;

  rating: 'A' | 'B' | 'C' | 'D';  // A>=30%, B>=20%, C>=10%, D<10%
  invoiced: boolean;
}

export interface JobPLSummary {
  company:        Company;
  month:          string;
  totalOrders:    number;
  totalRevenue:   number;
  totalCost:      number;
  totalProfit:    number;
  avgMargin:      number;
  totalSqft:      number;
  revenuePerSqft: number;
  costPerSqft:    number;
  byRating: { A: number; B: number; C: number; D: number };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getGlassMAP(company: Company): number {
  const store = InventoryService.getStore().filter(
    (s: any) => s.company === company && s.category === 'Raw'
  );
  if (store.length === 0) return 0;
  const totalValue = store.reduce((s: number, i: any) => s + (i.totalValue || 0), 0);
  const totalQty   = store.reduce((s: number, i: any) => s + (i.quantity || 1), 0);
  return totalValue > 0 && totalQty > 0 ? round2(totalValue / totalQty) : 0;
}

function getOrderRevenue(order: any): { glass: number; service: number; discount: number } {
  const glass   = (order.items || []).reduce((s: number, i: any) => s + (i.amount || 0), 0);
  const service = (order.serviceCharges || []).reduce((s: number, c: any) => s + (c.amount || 0), 0);
  const discount = order.discountAmount || (glass * (order.discountPercent || 0) / 100);
  return { glass, service, discount };
}

function getOrderSqft(order: any): number {
  return (order.items || []).reduce((s: number, i: any) => s + (i.totalSqFt || 0), 0);
}

function getServicePOsForOrder(company: Company, orderId: string): number {
  const pos = ProductionService.getPurchaseOrders
    ? ProductionService.getPurchaseOrders().filter((p: any) =>
        p.fromCompany === company &&
        ['Tempering', 'Hardware', 'Installation'].includes(p.category || '') &&
        (p.orderId === orderId || p.projectId === orderId)
      )
    : [];
  return pos.reduce((s: number, p: any) => s + (p.totalAmount || 0), 0);
}

// Overhead rate: PKR per sqft (standard 18 or from overheadService if available)
const STANDARD_OVERHEAD_RATE = 18;

// ── Service ────────────────────────────────────────────────────────────────

export const JobPLService = {

  getJobPL(company: Company, month?: string, limit = 50): JobPL[] {
    const mon    = month || curMonth();
    const orders = ProductionService.getJobOrders().filter((o: any) =>
      o.company === company &&
      !['Draft', 'Rejected'].includes(o.status || '') &&
      (month ? (o.date || '').startsWith(mon) : true)
    ).slice(0, limit);

    const glassMAP = getGlassMAP(company);
    const clients  = SalesService.getClients
      ? SalesService.getClients().filter((c: any) => c.company === company)
      : [];

    return orders.map((order: any): JobPL => {
      const rev     = getOrderRevenue(order);
      const sqft    = getOrderSqft(order);
      const sqftBase = Math.max(sqft, 0.1);

      const glassRevenue  = rev.glass;
      const serviceRevenue= rev.service;
      const discount      = rev.discount;
      const totalRevenue  = glassRevenue + serviceRevenue - discount;

      // Material: sqft x MAP (glass cost is primary material)
      const materialCost = round2(sqft * glassMAP);

      // Service: linked POs (tempering, hardware)
      const serviceCost  = getServicePOsForOrder(company, order.id);

      // Overhead: standard rate per sqft
      const overheadCost = round2(sqft * STANDARD_OVERHEAD_RATE);

      // Labour: if no direct data, estimate 5% of glass revenue
      const labourCost   = round2(totalRevenue * 0.05);

      const totalCost    = materialCost + serviceCost + overheadCost + labourCost;
      const grossProfit  = totalRevenue - totalCost;
      const marginPct    = totalRevenue > 0 ? round2(grossProfit / totalRevenue * 100) : 0;

      const client = clients.find((c: any) => c.id === order.clientId);

      return {
        orderId:       order.id,
        orderNo:       order.orderNo || order.manualSerial || order.id,
        clientId:      order.clientId,
        clientName:    client?.name || order.architect || 'Unknown',
        date:          order.date || '',
        status:        order.status || '',
        company,

        glassRevenue:  round2(glassRevenue),
        serviceRevenue:round2(serviceRevenue),
        discount:      round2(discount),
        totalRevenue:  round2(totalRevenue),

        materialCost,
        serviceCost,
        overheadCost,
        labourCost,
        totalCost:     round2(totalCost),
        grossProfit:   round2(grossProfit),
        marginPct,

        totalSqft:      round2(sqft),
        revenuePerSqft: round2(totalRevenue / sqftBase),
        costPerSqft:    round2(totalCost / sqftBase),
        profitPerSqft:  round2(grossProfit / sqftBase),

        rating: marginPct >= 30 ? 'A' : marginPct >= 20 ? 'B' : marginPct >= 10 ? 'C' : 'D',
        invoiced: !!order.invoiceNo,
      };
    }).sort((a, b) => b.grossProfit - a.grossProfit);
  },

  getSummary(company: Company, month?: string): JobPLSummary {
    const jobs  = JobPLService.getJobPL(company, month);
    const mon   = month || curMonth();
    const sqftBase = Math.max(jobs.reduce((s, j) => s + j.totalSqft, 0), 1);

    const totalRevenue = jobs.reduce((s, j) => s + j.totalRevenue, 0);
    const totalCost    = jobs.reduce((s, j) => s + j.totalCost, 0);
    const totalProfit  = jobs.reduce((s, j) => s + j.grossProfit, 0);

    return {
      company,
      month:          mon,
      totalOrders:    jobs.length,
      totalRevenue:   round2(totalRevenue),
      totalCost:      round2(totalCost),
      totalProfit:    round2(totalProfit),
      avgMargin:      totalRevenue > 0 ? round2(totalProfit / totalRevenue * 100) : 0,
      totalSqft:      round2(jobs.reduce((s, j) => s + j.totalSqft, 0)),
      revenuePerSqft: round2(totalRevenue / sqftBase),
      costPerSqft:    round2(totalCost / sqftBase),
      byRating: {
        A: jobs.filter(j => j.rating === 'A').length,
        B: jobs.filter(j => j.rating === 'B').length,
        C: jobs.filter(j => j.rating === 'C').length,
        D: jobs.filter(j => j.rating === 'D').length,
      },
    };
  },
};
