/**
 * scmService.ts — Phase 1: SCM Data Layer
 *
 * Three functions:
 * 1. getVendorScorecard()  — on-time rate, quality rejection %, avg lead time
 * 2. getReorderAlerts()    — items at or below reorder point
 * 3. recordLeadTime()      — called when GRN is posted against a PO
 *
 * Reads from existing:
 *   InventoryService (store items, POs, GRNs)
 *   SalesService (vendors)
 */

import { InventoryService } from './inventoryService';
import { SalesService } from '@/modules/sales/services/salesService';
import { Company } from '@/modules/shared/types/core';
import { Vendor } from '@/modules/sales/types/crm';
import { toast } from 'sonner';

// ── Types ──────────────────────────────────────────────────────────────────

export interface VendorScorecard {
  vendorId:          string;
  vendorName:        string;
  vendorType:        string;
  totalPOs:          number;
  avgLeadDays:       number;    // average actual lead time
  expectedLeadDays:  number;    // agreed/expected
  onTimePct:         number;    // % of deliveries on time
  avgRejectionPct:   number;    // average quality rejection %
  lastDeliveryDate:  string;
  overallScore:      number;    // 0-100 composite
  rating:            'A' | 'B' | 'C' | 'D'; // A=excellent, D=poor
}

export interface ReorderAlert {
  itemId:         string;
  itemName:       string;
  category:       string;
  company:        Company;
  currentQty:     number;
  reorderPoint:   number;
  minLevel:       number;
  shortfall:      number;       // reorderPoint - currentQty
  lastVendor?:    string;       // last vendor who supplied this item
  suggestedPOQty: number;       // simple suggestion: reorderPoint × 2
  urgency:        'CRITICAL' | 'LOW';  // CRITICAL = below minLevel
}

export interface LeadTimeRecord {
  poId:      string;
  poDate:    string;
  grnDate:   string;
  leadDays:  number;
  onTime:    boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.max(0, Math.round(Math.abs(b - a) / 86400000));
}

function calcOverallScore(onTimePct: number, rejectionPct: number): number {
  // 60% weight on on-time, 40% weight on quality
  const onTimeScore  = onTimePct;
  const qualityScore = Math.max(0, 100 - rejectionPct * 5); // 1% rejection = 5 point deduction
  return Math.round(onTimeScore * 0.6 + qualityScore * 0.4);
}

function scoreToRating(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

// ── 1. Vendor Scorecard ────────────────────────────────────────────────────

export const SCMService = {

  getVendorScorecard(company: Company): VendorScorecard[] {
    const vendors = SalesService.getVendors
      ? SalesService.getVendors().filter((v: Vendor) => !v.company || v.company === company)
      : [];

    const pos = InventoryService.getPurchaseOrders
      ? InventoryService.getPurchaseOrders().filter(
          (po: any) => po.fromCompany === company && po.status !== 'Draft'
        )
      : [];

    return vendors.map((vendor: Vendor) => {
      const vendorPOs = pos.filter((po: any) => po.toVendor === vendor.id || po.toVendor === vendor.name);

      // Lead time analysis from leadTimeHistory
      const ltHistory = vendor.leadTimeHistory || [];
      const avgLeadDays = ltHistory.length > 0
        ? Math.round(ltHistory.reduce((s, h) => s + h.leadDays, 0) / ltHistory.length)
        : 0;
      const onTimePct = ltHistory.length > 0
        ? Math.round((ltHistory.filter(h => h.onTime).length / ltHistory.length) * 100)
        : 0;

      // Quality analysis from qualityRejectionHistory
      const qHistory = vendor.qualityRejectionHistory || [];
      const avgRejectionPct = qHistory.length > 0
        ? Math.round(
            qHistory.reduce((s, h) => s + h.rejectionPct, 0) / qHistory.length * 10
          ) / 10
        : 0;

      // Last delivery date from POs
      const lastPO = vendorPOs.sort((a: any, b: any) =>
        (b.grnDate || b.date || '').localeCompare(a.grnDate || a.date || '')
      )[0];

      const overallScore = calcOverallScore(onTimePct, avgRejectionPct);

      return {
        vendorId:         vendor.id,
        vendorName:       vendor.name,
        vendorType:       vendor.type,
        totalPOs:         vendorPOs.length,
        avgLeadDays,
        expectedLeadDays: vendor.expectedLeadDays || 0,
        onTimePct,
        avgRejectionPct,
        lastDeliveryDate: lastPO?.grnDate || lastPO?.date || '—',
        overallScore,
        rating:           scoreToRating(overallScore),
      };
    }).filter(v => v.totalPOs > 0)
      .sort((a, b) => b.overallScore - a.overallScore);
  },

  // ── 2. Reorder Alerts ──────────────────────────────────────────────────
  getReorderAlerts(company: Company): ReorderAlert[] {
    const items = InventoryService.getStore().filter(
      (item: any) => item.company === company &&
                     item.category !== 'Service' &&
                     item.quantity <= item.reorderPoint
    );

    const pos = InventoryService.getPurchaseOrders
      ? InventoryService.getPurchaseOrders()
      : [];

    return items.map((item: any): ReorderAlert => {
      // Find last vendor who supplied this item
      const lastPO = pos
        .filter((po: any) =>
          po.fromCompany === company &&
          po.items?.some((i: any) =>
            (i.description || '').toLowerCase().includes((item.name || '').toLowerCase().slice(0, 8))
          )
        )
        .sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''))
        [0];

      return {
        itemId:         item.id,
        itemName:       item.name,
        category:       item.category,
        company:        item.company,
        currentQty:     item.quantity,
        reorderPoint:   item.reorderPoint || 0,
        minLevel:       item.minLevel || 0,
        shortfall:      Math.max(0, (item.reorderPoint || 0) - item.quantity),
        lastVendor:     lastPO?.toVendor || undefined,
        suggestedPOQty: (item.reorderPoint || 0) * 2,
        urgency:        item.quantity <= (item.minLevel || 0) ? 'CRITICAL' : 'LOW',
      };
    }).sort((a, b) => {
      // CRITICAL first, then by shortfall amount
      if (a.urgency !== b.urgency) return a.urgency === 'CRITICAL' ? -1 : 1;
      return b.shortfall - a.shortfall;
    });
  },

  // ── 3. Record Lead Time (call when GRN is posted) ──────────────────────
  recordLeadTime(
    company: Company,
    vendorId: string,
    poId: string,
    poDate: string,
    grnDate: string,
    totalSheets: number,
    rejectedSheets: number
  ): void {
    try {
      const vendors  = SalesService.getVendors ? SalesService.getVendors() : [];
      const vendorIdx = vendors.findIndex((v: Vendor) => v.id === vendorId);
      if (vendorIdx === -1) return;

      const vendor = { ...vendors[vendorIdx] };
      const leadDays = daysBetween(poDate, grnDate);
      const onTime   = vendor.expectedLeadDays
        ? leadDays <= vendor.expectedLeadDays
        : true; // if no expected set, default to on-time

      // Append lead time record
      const ltRecord: NonNullable<Vendor['leadTimeHistory']>[0] = {
        poId, poDate, grnDate, leadDays, onTime,
      };
      vendor.leadTimeHistory = [...(vendor.leadTimeHistory || []), ltRecord].slice(-24); // keep last 24

      // Append quality record if sheets provided
      if (totalSheets > 0) {
        const rejPct = Math.round((rejectedSheets / totalSheets) * 1000) / 10;
        const qRecord: NonNullable<Vendor['qualityRejectionHistory']>[0] = {
          grnId:          `${poId}-GRN`,
          date:           grnDate,
          totalSheets,
          rejectedSheets,
          rejectionPct:   rejPct,
        };
        vendor.qualityRejectionHistory = [
          ...(vendor.qualityRejectionHistory || []),
          qRecord,
        ].slice(-24);
      }

      vendors[vendorIdx] = vendor;
      if (SalesService.saveVendors) SalesService.saveVendors(vendors);
      toast.success(`Lead time recorded: ${leadDays} days — ${onTime ? 'On Time' : 'Late'}`);
    } catch (e) {
      console.error('[SCMService] recordLeadTime failed', e);
    }
  },

  // ── Summary for SCM dashboard widget ──────────────────────────────────
  getSummary(company: Company): {
    totalVendors: number;
    aRatedVendors: number;
    dRatedVendors: number;
    criticalReorders: number;
    lowReorders: number;
  } {
    const scorecards = SCMService.getVendorScorecard(company);
    const alerts     = SCMService.getReorderAlerts(company);

    return {
      totalVendors:    scorecards.length,
      aRatedVendors:   scorecards.filter(s => s.rating === 'A').length,
      dRatedVendors:   scorecards.filter(s => s.rating === 'D').length,
      criticalReorders:alerts.filter(a => a.urgency === 'CRITICAL').length,
      lowReorders:     alerts.filter(a => a.urgency === 'LOW').length,
    };
  },
};
