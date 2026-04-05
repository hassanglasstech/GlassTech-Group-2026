/**
 * caIntegrityService.ts — Phase 1: CA Accounting Integrity Layer
 *
 * Two functions:
 * 1. getUnbilledRevenue()     — orders dispatched but not yet invoiced
 * 2. getThreeWayMatchStatus() — PO vs GRN vs Invoice discrepancies
 *
 * Reads from existing:
 *   ProductionService (job orders / quotations)
 *   AsyncSalesService / SalesService (invoices)
 *   InventoryService (purchase orders)
 */

import { ProductionService } from '@/modules/production/services/productionService';
import { SalesService } from '@/modules/sales/services/salesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { Company } from '@/modules/shared/types/core';

// ── Types ──────────────────────────────────────────────────────────────────

export interface UnbilledItem {
  orderId:       string;
  orderNo:       string;
  clientId:      string;
  clientName?:   string;
  company:       Company;
  orderDate:     string;
  deliveryDate:  string;   // actualDeliveryDate from quotation
  estimatedValue:number;   // total from quotation items
  status:        string;   // current order status
  daysSinceDelivery: number;
  urgency:       'HIGH' | 'MEDIUM' | 'LOW'; // HIGH = >30 days unbilled
}

export interface ThreeWayMatchResult {
  poId:          string;
  poDate:        string;
  vendorName:    string;
  company:       Company;
  poAmount:      number;
  grnRef:        string;
  grnQty?:       number;
  invoiceRef?:   string;
  invoiceAmount: number;
  variance:      number;    // invoiceAmount - poAmount
  variancePct:   number;
  matchStatus:   'MATCHED' | 'OVER_BILLED' | 'UNDER_BILLED' | 'NO_INVOICE' | 'NO_GRN';
}

// ── Helpers ────────────────────────────────────────────────────────────────

function daysSince(dateStr: string): number {
  if (!dateStr) return 0;
  return Math.max(0, Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 86400000
  ));
}

function calcOrderValue(order: any): number {
  // Sum items total from quotation
  const items = order.items || [];
  return items.reduce((sum: number, item: any) => {
    const qty   = item.qty || item.quantity || 1;
    const rate  = item.rate || item.unitPrice || 0;
    const sqft  = item.totalSqFt || item.sqft || 0;
    // Use sqft × rate if available, else qty × rate
    if (sqft > 0 && rate > 0) return sum + sqft * rate;
    if (qty > 0  && rate > 0) return sum + qty * rate;
    return sum + (item.amount || item.total || 0);
  }, 0);
}

// ── Service ────────────────────────────────────────────────────────────────

export const CAIntegrityService = {

  // ── 1. Unbilled Revenue ──────────────────────────────────────────────────
  //
  // Logic: A job order is "unbilled" when:
  //   - It has been dispatched/delivered (isAlreadyDispatched = true
  //     OR actualDeliveryDate exists OR status = Approved/Sent/Partial)
  //   - It does NOT have an invoiceNo assigned yet
  //   - Company matches
  //
  getUnbilledRevenue(company: Company): UnbilledItem[] {
    const orders  = ProductionService.getJobOrders().filter(
      (o: any) => o.company === company
    );
    const invoices = SalesService.getInvoices
      ? SalesService.getInvoices().filter((inv: any) => inv.company === company)
      : [];

    // Build set of invoiced order IDs
    const invoicedOrderIds = new Set<string>(
      invoices.map((inv: any) => inv.orderId || inv.order_id || '')
    );

    const clients = SalesService.getClients
      ? SalesService.getClients().filter((c: any) => c.company === company)
      : [];

    return orders
      .filter((order: any) => {
        const isDelivered   = order.isAlreadyDispatched === true ||
                              !!order.actualDeliveryDate ||
                              ['Approved', 'Partial Payment'].includes(order.status || '');
        const hasInvoice    = !!order.invoiceNo || invoicedOrderIds.has(order.id);
        return isDelivered && !hasInvoice;
      })
      .map((order: any) => {
        const deliveryDate = order.actualDeliveryDate || order.dueDate || order.date || '';
        const days         = daysSince(deliveryDate);
        const client       = clients.find((c: any) => c.id === order.clientId);

        return {
          orderId:           order.id,
          orderNo:           order.orderNo || order.manualSerial || order.id,
          clientId:          order.clientId,
          clientName:        client?.name || order.architect || '—',
          company,
          orderDate:         order.date || '',
          deliveryDate,
          estimatedValue:    calcOrderValue(order),
          status:            order.status || '',
          daysSinceDelivery: days,
          urgency:           days > 30 ? 'HIGH' : days > 14 ? 'MEDIUM' : 'LOW',
        };
      })
      .sort((a, b) => b.daysSinceDelivery - a.daysSinceDelivery); // oldest first
  },

  // ── 2. Three-Way Match Status ────────────────────────────────────────────
  //
  // Logic: For each PO that has a grnRef, find matching invoice.
  //   PO amount vs Invoice amount — flag variances > 1%.
  //   PO with no GRN = still open.
  //   PO with GRN but no invoice = awaiting invoice (common gap).
  //
  getThreeWayMatchStatus(company: Company): ThreeWayMatchResult[] {
    const pos = (InventoryService.getPurchaseOrders
      ? InventoryService.getPurchaseOrders()
      : []
    ).filter((po: any) =>
      po.fromCompany === company &&
      ['Approved', 'Partially Received', 'Fully Received'].includes(po.status || '')
    );

    const invoices = SalesService.getInvoices
      ? SalesService.getInvoices().filter((inv: any) => inv.company === company)
      : [];

    return pos.map((po: any) => {
      const poAmount = po.totalAmount || 0;

      // Find matching vendor invoice by PO reference
      const matchedInvoice = invoices.find((inv: any) =>
        inv.orderId === po.id ||
        (inv.orderNo || '').includes(po.id) ||
        (po.invoiceRef && inv.id === po.invoiceRef)
      );

      const grnRef      = po.grnRef || '';
      const hasGRN      = !!grnRef;
      const invoiceAmount = matchedInvoice?.totalAmount || 0;
      const variance    = invoiceAmount - poAmount;
      const variancePct = poAmount > 0
        ? Math.round((Math.abs(variance) / poAmount) * 1000) / 10
        : 0;

      let matchStatus: ThreeWayMatchResult['matchStatus'];
      if (!hasGRN) {
        matchStatus = 'NO_GRN';
      } else if (!matchedInvoice) {
        matchStatus = 'NO_INVOICE';
      } else if (Math.abs(variancePct) <= 1) {
        matchStatus = 'MATCHED';
      } else if (variance > 0) {
        matchStatus = 'OVER_BILLED';
      } else {
        matchStatus = 'UNDER_BILLED';
      }

      return {
        poId:          po.id,
        poDate:        po.date || '',
        vendorName:    po.toVendor || '',
        company,
        poAmount,
        grnRef,
        grnQty:        po.grnQty,
        invoiceRef:    matchedInvoice?.id,
        invoiceAmount,
        variance,
        variancePct,
        matchStatus,
      };
    }).sort((a, b) => {
      // Sort: OVER_BILLED first, then NO_INVOICE, then others
      const order = { OVER_BILLED: 0, NO_INVOICE: 1, UNDER_BILLED: 2, NO_GRN: 3, MATCHED: 4 };
      return (order[a.matchStatus] || 99) - (order[b.matchStatus] || 99);
    });
  },

  // ── Summary for CA dashboard widget ────────────────────────────────────
  getSummary(company: Company): {
    unbilledCount:     number;
    unbilledHighCount: number;
    totalUnbilledValue:number;
    matchedPOs:        number;
    overBilledPOs:     number;
    noInvoicePOs:      number;
  } {
    const unbilled = CAIntegrityService.getUnbilledRevenue(company);
    const matching = CAIntegrityService.getThreeWayMatchStatus(company);

    return {
      unbilledCount:      unbilled.length,
      unbilledHighCount:  unbilled.filter(u => u.urgency === 'HIGH').length,
      totalUnbilledValue: unbilled.reduce((s, u) => s + u.estimatedValue, 0),
      matchedPOs:         matching.filter(m => m.matchStatus === 'MATCHED').length,
      overBilledPOs:      matching.filter(m => m.matchStatus === 'OVER_BILLED').length,
      noInvoicePOs:       matching.filter(m => m.matchStatus === 'NO_INVOICE').length,
    };
  },
};
