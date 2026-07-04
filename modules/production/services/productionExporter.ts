/**
 * productionExporter.ts — Phase 6 (6.7)
 *
 * Excel export helpers for the Glassco production module. Sales already
 * has comprehensive exports; production was Excel-blind. These helpers
 * mirror the sales pattern (xlsx → file download) so ops can grab a
 * spreadsheet for any of the four key registers without leaving the page.
 *
 * Exports provided:
 *   exportProductionPieces(pieces, jobOrders, clients)   — every piece w/ status
 *   exportTemperingDispatches(dispatches, pieces)        — vendor dispatch register
 *   exportNCRRegister(ncrEvents)                         — defect / NCR log
 *   exportMRPResults(mrpRows, label)                     — MRP requirements snapshot
 *
 * All output is a single `.xlsx` file with sensible column headers and
 * `Glassco_<register>_<YYYY-MM-DD>.xlsx` naming.
 */

import * as XLSX from 'xlsx';
import { ProductionPiece, Quotation, TemperingDispatch } from '@/modules/shared/types';
import { Client } from '@/modules/sales/types/crm';
import { NCREvent } from '@/modules/production/types/ncr';

// ── Internal helpers ────────────────────────────────────────────────────
const _today = () => new Date().toISOString().split('T')[0];

const _writeWorkbook = (rows: any[], sheetName: string, fileName: string) => {
  const ws = XLSX.utils.json_to_sheet(rows);
  // Auto-fit column widths (very rough — uses header length)
  const widths = Object.keys(rows[0] || {}).map(k => ({ wch: Math.max(12, k.length + 2) }));
  (ws as any)['!cols'] = widths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
};

// ── 1. Production pieces ────────────────────────────────────────────────
//
// an explicit `company` filter is now mandatory. Without
// it, an operator scoped to Glassco could accidentally export GTK / GTI
// pieces that bled in via a parent component pulling `getProductionPieces()`
// without a filter. The function signature is backward-compatible — when
// `company` is omitted, behaviour is unchanged but a console.warn fires
// so callers in code-review can be flagged.
export function exportProductionPieces(
  pieces: ProductionPiece[],
  jobOrders: Quotation[],
  clients: Client[],
  scopeLabel: string = 'all',
  company?: string
): void {
  if (!pieces || pieces.length === 0) {
    throw new Error('No production pieces to export.');
  }
  if (!company) {
    console.warn('[productionExporter] exportProductionPieces called without `company` — cross-company leak risk. Pass the active company.');
  }
  const filtered = company
    ? pieces.filter((p: any) => {
        // Pieces don't have a flat `company` column yet (see CLAUDE.md WIP),
        // so we infer from orderId prefix: GLS=Glassco, GTK=GTK, GTI=GTI.
        const orderId = String((p as any).orderId || '');
        if (company === 'Glassco') return orderId.includes('GLS');
        if (company === 'GTK')     return orderId.includes('GTK');
        if (company === 'GTI')     return orderId.includes('GTI');
        if (company === 'Nippon')  return orderId.includes('NIP');
        return (p as any).company === company;
      })
    : pieces;
  if (filtered.length === 0) {
    throw new Error(`No production pieces to export for company "${company || 'all'}".`);
  }
  const rows = filtered.map((p: any) => {
    const order = jobOrders.find((j: any) => j.orderNo === p.orderId || j.id === p.orderId);
    const client = order ? clients.find((c: any) => c.id === order.clientId) : null;
    const item = order?.items?.[Number(p.itemIndex || 0)] || {};
    return {
      'Piece ID':        p.id || '',
      'Order Ref':       p.orderId || '',
      'Client':          client?.name || '—',
      'Project':         order?.projectName || '—',
      'Item Index':      Number(p.itemIndex || 0) + 1,
      'Glass Type':      (item as any).glassType || '',
      'Thickness':       (item as any).glassSize || '',
      'Width (in)':      (item as any).width || '',
      'Height (in)':     (item as any).height || '',
      'Services':        ((item as any).selectedServices || []).join(', '),
      'Status':          p.status || '',
      'Dispatch ID':     (p as any).dispatchId || '',
      'Spot':            (p as any).spotId || '',
      'Last Updated':    (p as any).lastUpdated || '',
    };
  });
  _writeWorkbook(rows, 'Production Pieces', `Glassco_Pieces_${scopeLabel}_${_today()}.xlsx`);
}

// ── 2. Tempering dispatches (vendor PO register) ────────────────────────
export function exportTemperingDispatches(
  dispatches: TemperingDispatch[],
  pieces: ProductionPiece[]
): void {
  if (!dispatches || dispatches.length === 0) {
    throw new Error('No dispatches to export.');
  }
  const rows = dispatches.map((d: any) => {
    const dispatchPieces = pieces.filter((p: any) => p.dispatchId === d.id);
    const orderRefs = Array.from(new Set(dispatchPieces.map((p: any) => p.orderId))).join(', ');
    return {
      'Dispatch ID':       d.id || '',
      'Date':              d.date || '',
      'Plant / Vendor':    d.plantName || '',
      'Vehicle No':        d.vehicleNo || '',
      'Driver':            d.driverName || '',
      'Service Type':      d.serviceType || '',
      'Pieces':            dispatchPieces.length,
      'Total SqFt':        Number(d.totalSqFt || 0).toFixed(2),
      'Charges/SqFt':      Number(d.chargesPerSqFt || 0).toFixed(2),
      'Total Charges':     Number(d.totalCharges || 0).toFixed(2),
      'Status':            d.status || '',
      'Order Refs':        orderRefs,
      'Acknowledged At':   d.deliveryAcknowledgedAt || '',
      'Acknowledged By':   d.deliverySignatory || '',
    };
  });
  _writeWorkbook(rows, 'Dispatches', `Glassco_Dispatches_${_today()}.xlsx`);
}

// ── 3. NCR register ─────────────────────────────────────────────────────
export function exportNCRRegister(ncrEvents: NCREvent[]): void {
  if (!ncrEvents || ncrEvents.length === 0) {
    throw new Error('No NCR events to export.');
  }
  const rows = ncrEvents.map((n: any) => ({
    'NCR ID':            n.id || '',
    'Date Reported':     n.reportedAt || n.date || '',
    'Stage':             n.stage || '',
    'Cause':             n.cause || '',
    'Action':            n.action || '',
    'Status':            n.status || '',
    'Piece ID':          n.pieceId || '',
    'Job Order':         n.jobOrderId || '',
    'Glass Type':        n.glassType || '',
    'Thickness':         n.thickness || '',
    'SqFt Lost':         Number(n.sqftLost || 0).toFixed(2),
    'Estimated Value':   Number(n.estimatedValue || 0).toFixed(2),
    'Vendor (claim)':    n.vendorName || '',
    'Purchase Ref':      n.purchaseRef || '',
    'Reported By':       n.reportedBy || '',
    'Closed At':         n.closedAt || '',
    'Closed By':         n.closedBy || '',
    'Description':       n.description || '',
    'Notes':             n.notes || '',
  }));
  _writeWorkbook(rows, 'NCR Register', `Glassco_NCR_${_today()}.xlsx`);
}

// ── 4. MRP requirements snapshot ────────────────────────────────────────
// `mrpRows` is whatever shape the MRP service computes — accepts any[]
// to keep this exporter coupling-free. Caller decides the column set.
export function exportMRPResults(mrpRows: any[], label: string = 'snapshot'): void {
  if (!mrpRows || mrpRows.length === 0) {
    throw new Error('No MRP rows to export.');
  }
  // Flatten any nested object/array fields to JSON strings so xlsx accepts them
  const flat = mrpRows.map(row => {
    const out: any = {};
    for (const k of Object.keys(row)) {
      const v = (row as any)[k];
      if (v === null || v === undefined) out[k] = '';
      else if (typeof v === 'object') out[k] = JSON.stringify(v);
      else out[k] = v;
    }
    return out;
  });
  _writeWorkbook(flat, 'MRP', `Glassco_MRP_${label}_${_today()}.xlsx`);
}
