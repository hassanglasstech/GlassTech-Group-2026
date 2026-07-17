/**
 * intercompanyOrderService — Intercompany P2 (the order-time mirror).
 *
 * When a GTK/GTI project raises a material demand on Glassco (glass) or Nippon
 * (hardware), this creates the corresponding **Sales Order inside the supplier
 * company at order time** — not at invoice time — so the supplier can plan / cut
 * / pick immediately. The one order renders two ways:
 *   • Seller (Glassco/Nippon): a normal Approved Sales Order (Sales + Store queue).
 *   • Buyer (GTK): a Project Purchase (tagged sourceProjectId), reconciled in the
 *     Intercompany Hub.
 *
 * It does NOT post GL or decrement stock — that happens at the supplier's normal
 * issue/delivery (COGS at delivery = IFRS; project-tagged IC finance is P4).
 *
 * The buyer is a **customer with a transfer-price list** in the supplier company
 * (IC-P1). ensureBuyerCustomer upserts a stable IC customer row, preserving any
 * assigned priceListId so its agreed rates keep applying.
 */

import { Company } from '@/modules/shared/types/core';
import { Client, Quotation, QuotationItem } from '@/modules/shared/types';
import { AsyncSalesService } from './asyncSalesService';
import { SalesService } from './salesService';
import { ProjectService } from '@/modules/projects/services/projectService';
import { pushCrossCompanyNotif } from '@/modules/shared/services/crossCompanyNotifService';
import { Logger } from '@/modules/shared/services/logger';

export interface ICOrderLine {
  productRef?: string;   // supplier Product.id (when picked from the master)
  code?: string;         // visible item code
  description: string;
  unit: string;          // PCS / SET / sqft …
  qty: number;
  rate: number;          // agreed transfer price (PKR per unit)
}

export interface RaiseICOrderParams {
  supplierCompany: Company;   // Glassco | Nippon (the seller)
  buyerCompany: Company;      // GTK | GTI (the project owner)
  projectId?: string;
  projectTitle?: string;
  lines: ICOrderLine[];
  actor?: string;
}

/** Stable id for the "buyer company as a customer" row inside a supplier company. */
export const icCustomerId = (buyer: Company): string => `IC-CUST-${buyer}`;

/**
 * Ensure the buyer company exists as a customer in the supplier company. Reads the
 * all-company local cache to preserve an existing row's fields (esp. priceListId,
 * so its assigned transfer-price list survives), then upserts.
 */
export const ensureBuyerCustomer = async (supplierCompany: Company, buyerCompany: Company): Promise<Client> => {
  const id = icCustomerId(buyerCompany);
  const existing = SalesService.getClients().find(c => c.company === supplierCompany && c.id === id);
  const client: Client = existing
    ? { ...existing, mirrorCompany: buyerCompany }
    : {
        id, company: supplierCompany, name: buyerCompany,
        contactPerson: 'Group Procurement', email: '', phone: '', address: '', ntn: '',
        creditLimit: 0, status: 'Active', createdAt: new Date().toISOString(),
        mirrorCompany: buyerCompany,
      };
  await AsyncSalesService.saveClients([client]);
  return client;
};

const two = (n: number): string => String(n).padStart(2, '0');

/** Raise an intercompany Sales Order in the supplier company (order-time mirror). */
export const raiseIntercompanyOrder = async (
  params: RaiseICOrderParams,
): Promise<{ orderId?: string; orderNo?: string; error?: string }> => {
  const { supplierCompany, buyerCompany, projectId, projectTitle, lines, actor } = params;
  try {
    const clean = lines.filter(l => l.description?.trim() && Number(l.qty) > 0);
    if (clean.length === 0) return { error: 'Add at least one material line (description + qty).' };

    const client = await ensureBuyerCustomer(supplierCompany, buyerCompany);

    const items: QuotationItem[] = clean.map((l, i) => ({
      id: `ICL-${Date.now()}-${i}`,
      description: l.description,
      locationCode: l.code || '',
      productRef: l.productRef,
      glazingSpecs: '',
      glassSize: l.unit || 'PCS',
      qty: Number(l.qty) || 0,
      width: 0, height: 0, totalSqFt: 0,
      pricePerUnit: Number(l.rate) || 0,
      amount: (Number(l.qty) || 0) * (Number(l.rate) || 0),
    }));

    const now = new Date();
    const stamp = `${two(now.getMonth() + 1)}${String(now.getFullYear()).slice(-2)}`;
    const seq = `${now.getTime()}`.slice(-5);
    const id = `ICO-${supplierCompany.slice(0, 3).toUpperCase()}-${stamp}-${seq}`;
    const orderNo = `ICO-${buyerCompany}-${stamp}-${seq}`;
    const total = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);

    const quo: Quotation = {
      id,
      orderNo,
      company: supplierCompany,
      date: now.toISOString().split('T')[0],
      clientId: client.id,
      architect: '',
      site: '',
      subject: `Intercompany order — ${buyerCompany}${projectTitle ? ` · ${projectTitle}` : ''}`,
      projectName: projectTitle || '',
      items,
      serviceCharges: [],
      discountPercent: 0,
      discountAmount: 0,
      glassDiscountPercent: 0,
      status: 'Approved',
      receivedAmount: 0,
      // IC-P2 tags — one order, two lenses.
      intercompany: true,
      sourceCompany: buyerCompany,
      sourceProjectId: projectId,
      sourceProjectTitle: projectTitle,
    };

    const res = await AsyncSalesService.saveQuotations([quo]);
    if (res?.error) return { error: res.error };

    // IC-P3: order-time real-time push to the supplier so they see the demand
    // instantly (in addition to it appearing in their Sales + Store queue).
    try {
      await pushCrossCompanyNotif({
        targetCompany: supplierCompany,
        fromCompany: buyerCompany,
        title: `New IC order — ${orderNo}`,
        message: `${buyerCompany} raised ${items.length} line${items.length === 1 ? '' : 's'} · PKR ${total.toLocaleString()}${projectTitle ? ` · ${projectTitle}` : ''}. Now in your Sales & Store queue.`,
        type: 'general',
        referenceId: id,
        link: '#/store-issue',
      });
    } catch { /* non-fatal */ }

    // Record the demand on the buyer's project timeline (best-effort).
    if (projectId) {
      try {
        ProjectService.addMilestone(projectId, {
          event: `IC order ${orderNo} raised on ${supplierCompany} — PKR ${total.toLocaleString()} (${items.length} line${items.length === 1 ? '' : 's'}).`,
          type: 'info',
        });
      } catch { /* project may live in another cache slice — non-fatal */ }
    }

    Logger.action('SALES', 'IC_ORDER_RAISED',
      `${orderNo} ${buyerCompany}→${supplierCompany} total=${total}`,
      { referenceId: id, amount: total, extra: { supplierCompany, buyerCompany, projectId, actor } });

    return { orderId: id, orderNo };
  } catch (err) {
    Logger.error('IntercompanyOrder', 'raiseIntercompanyOrder failed', err);
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
};

/**
 * IC-P3 live status handshake — the supplier pushes each fulfilment state change
 * (Picked / Delivered / …) back to the buyer company so its project/procurement
 * timeline updates in real time. No-op for non-intercompany orders.
 */
export const notifyBuyerOfStatus = async (params: {
  order: Quotation; status: string; note?: string; actor?: string;
}): Promise<void> => {
  const { order, status, note, actor } = params;
  if (!order.intercompany || !order.sourceCompany) return;
  try {
    await pushCrossCompanyNotif({
      targetCompany: order.sourceCompany,
      fromCompany: order.company,
      title: `IC ${order.orderNo || order.id} — ${status}`,
      message: `${order.company} marked it ${status}${order.sourceProjectTitle ? ` · ${order.sourceProjectTitle}` : ''}${note ? ` — ${note}` : ''}${actor ? ` · ${actor}` : ''}.`,
      type: 'general',
      referenceId: order.id,
      link: '#/hub',
    });
  } catch { /* non-fatal */ }
};
