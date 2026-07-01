const ls  = (key: string) => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };
const PKR = (n: number)   => `PKR ${Math.round(n || 0).toLocaleString('en-PK')}`;
const daysAgo = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
const fmt = (d: string) => new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' });

export const OpsAgent = {

  // ── Stock Status ─────────────────────────────────────────────────
  stockStatus: (query?: string) => {
    const store    = ls('gtk_erp_store');
    const products = ls('gtk_erp_products');

    // Glass stock from products
    let glassItems = products.filter((p: any) => p.category === 'Glass' && p.company === 'Glassco');
    // Store items
    let storeItems = store.filter((s: any) => !s.company || s.company === 'Glassco');

    // Filter by query
    if (query) {
      const q = query.toLowerCase();
      glassItems = glassItems.filter((p: any) =>
        p.glassType?.toLowerCase().includes(q) ||
        p.thickness?.toLowerCase().includes(q) ||
        p.name?.toLowerCase().includes(q)
      );
      storeItems = storeItems.filter((s: any) =>
        s.name?.toLowerCase().includes(q) ||
        s.category?.toLowerCase().includes(q) ||
        s.materialDesc?.toLowerCase().includes(q)
      );
    }

    // Low stock alerts — below reorder point
    const lowStock = storeItems.filter((s: any) => {
      const qty = s.unrestrictedQty ?? s.quantity ?? 0;
      const reorder = s.reorderPoint ?? s.minLevel ?? 0;
      return reorder > 0 && qty <= reorder;
    });

    const lowGlass = glassItems.filter((p: any) => {
      const qty = p.stockQty ?? p.qty ?? 0;
      return qty <= 50; // less than 50 sheets
    });

    return {
      glass: {
        items: glassItems.map((p: any) => ({
          name: p.name,
          type: p.glassType,
          thickness: p.thickness,
          color: p.glassColor || 'Clear',
          stock: p.stockQty ?? p.qty ?? 0,
          unit: 'Sheets',
          rate: PKR(p.purchasePrice || 0),
        })),
        low_stock: lowGlass.length,
        total_items: glassItems.length,
      },
      store: {
        items: storeItems.slice(0, 20).map((s: any) => ({
          name: s.name || s.materialDesc,
          category: s.category,
          qty: s.unrestrictedQty ?? s.quantity ?? 0,
          unit: s.unit,
          reorder_point: s.reorderPoint ?? s.minLevel ?? 0,
          is_low: (s.unrestrictedQty ?? s.quantity ?? 0) <= (s.reorderPoint ?? s.minLevel ?? 0),
          value: PKR((s.unrestrictedQty ?? s.quantity ?? 0) * (s.movingAveragePrice || 0)),
        })),
        low_stock_count: lowStock.length,
        low_stock_items: lowStock.map((s: any) => ({
          name: s.name || s.materialDesc,
          current_qty: s.unrestrictedQty ?? s.quantity ?? 0,
          reorder_at: s.reorderPoint ?? s.minLevel ?? 0,
          unit: s.unit,
        })),
        total_items: storeItems.length,
      },
      alerts: [
        ...(lowGlass.length > 0 ? [`⚠️ ${lowGlass.length} glass items low stock`] : []),
        ...(lowStock.length > 0 ? [`⚠️ ${lowStock.length} store items below reorder point`] : []),
      ],
    };
  },

  // ── Purchase Orders ──────────────────────────────────────────────
  purchaseOrderStatus: (query?: string) => {
    const pos = ls('gtk_erp_purchase_orders');
    let filtered = pos.filter((p: any) => !p.company || p.company === 'Glassco');

    if (query?.toLowerCase().includes('pending') || query?.toLowerCase().includes('open')) {
      filtered = filtered.filter((p: any) => ['Open', 'Pending', 'Partially Received'].includes(p.status));
    } else if (query?.toLowerCase().includes('received') || query?.toLowerCase().includes('complete')) {
      filtered = filtered.filter((p: any) => ['Received', 'Completed', 'Closed'].includes(p.status));
    }

    const pending   = filtered.filter((p: any) => ['Open', 'Pending'].includes(p.status));
    const overdue   = pending.filter((p: any) => p.deliveryDate && new Date(p.deliveryDate) < new Date());
    const totalValue = pending.reduce((s: number, p: any) => s + (p.totalAmount || p.netAmount || 0), 0);

    return {
      total_pos: filtered.length,
      pending_pos: pending.length,
      overdue_pos: overdue.length,
      pending_value: PKR(totalValue),
      overdue_details: overdue.slice(0, 5).map((p: any) => ({
        id: p.id,
        vendor: p.vendorName || p.vendor,
        amount: PKR(p.totalAmount || p.netAmount || 0),
        due: fmt(p.deliveryDate),
        days_overdue: daysAgo(p.deliveryDate),
      })),
      recent: filtered.slice(0, 10).map((p: any) => ({
        id: p.id,
        vendor: p.vendorName || p.vendor,
        status: p.status,
        amount: PKR(p.totalAmount || p.netAmount || 0),
        date: fmt(p.date || p.createdAt),
        delivery: p.deliveryDate ? fmt(p.deliveryDate) : 'N/A',
      })),
      alerts: overdue.length > 0
        ? [`🔴 ${overdue.length} POs delivery overdue — vendor follow-up karo`]
        : [],
    };
  },

  // ── Vendor Summary ───────────────────────────────────────────────
  vendorSummary: (vendorName?: string) => {
    const vendors  = ls('gtk_erp_vendors');
    const pos      = ls('gtk_erp_purchase_orders');
    const payments = ls('gtk_erp_petty_cash');

    let filteredVendors = vendors.filter((v: any) => v.company === 'Glassco' || !v.company);
    if (vendorName) {
      filteredVendors = filteredVendors.filter((v: any) =>
        v.name?.toLowerCase().includes(vendorName.toLowerCase())
      );
    }

    return filteredVendors.slice(0, 10).map((v: any) => {
      const vendorPOs = pos.filter((p: any) =>
        p.vendorId === v.id || p.vendorName?.toLowerCase() === v.name?.toLowerCase()
      );
      const pendingPOs = vendorPOs.filter((p: any) => ['Open', 'Pending'].includes(p.status));
      const totalOrdered = vendorPOs.reduce((s: number, p: any) => s + (p.totalAmount || 0), 0);

      return {
        name: v.name,
        phone: v.phone || 'N/A',
        category: v.category || v.type || 'General',
        total_orders: vendorPOs.length,
        pending_orders: pendingPOs.length,
        total_ordered_value: PKR(totalOrdered),
        last_order: vendorPOs.sort((a: any, b: any) =>
          new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime()
        )[0]?.date || 'N/A',
      };
    });
  },

  // ── Delivery / Dispatch Status ───────────────────────────────────
  deliveryStatus: () => {
    const dispatches = ls('gtk_erp_tempering_dispatches');
    const gatePasses = ls('gtk_erp_gate_passes');
    const quotations = ls('gtk_erp_quotations');
    const now        = new Date();

    // Ready to dispatch — orders completed but not dispatched
    const readyToDispatch = quotations.filter((q: any) =>
      (q.status === 'Ready' || q.status === 'Completed') && !q.isAlreadyDispatched
    );

    // Recent dispatches — last 7 days
    const recentDispatches = dispatches.filter((d: any) =>
      daysAgo(d.date || d.createdAt) <= 7
    );

    // Today's dispatches
    const todayStr = now.toISOString().split('T')[0];
    const todayDispatches = dispatches.filter((d: any) =>
      (d.date || d.createdAt || '').startsWith(todayStr)
    );

    // Recent gate passes
    const recentGatePasses = gatePasses.filter((g: any) =>
      daysAgo(g.date || g.createdAt) <= 3
    );

    return {
      ready_to_dispatch: readyToDispatch.length,
      today_dispatched: todayDispatches.length,
      week_dispatched: recentDispatches.length,
      recent_gate_passes: recentGatePasses.length,
      ready_orders: readyToDispatch.slice(0, 5).map((q: any) => ({
        id: q.id,
        client: q.clientName,
        project: q.projectName,
        amount: PKR(q.totalAmount || 0),
        days_waiting: daysAgo(q.date),
      })),
      today_detail: todayDispatches.map((d: any) => ({
        client: d.clientName,
        pieces: d.pieces || d.qty,
        sqft: d.sqFt || d.totalSqFt,
        vehicle: d.vehicleNo || 'N/A',
      })),
      alerts: readyToDispatch.length > 0
        ? [`📦 ${readyToDispatch.length} orders ready for dispatch — vehicle arrange karo`]
        : [],
    };
  },

  // ── Requisitions Overview ────────────────────────────────────────
  requisitionOverview: () => {
    const reqs = ls('gtk_erp_requisitions');
    const now  = new Date();

    const pending  = reqs.filter((r: any) => r.status === 'Pending' || r.status === 'Open');
    const approved = reqs.filter((r: any) => r.status === 'Approved');
    const urgent   = pending.filter((r: any) => r.priority === 'Urgent');

    // Older than 3 days and still pending
    const stale = pending.filter((r: any) => daysAgo(r.date || r.createdAt) >= 3);

    return {
      total_pending: pending.length,
      urgent_count: urgent.length,
      approved_awaiting_po: approved.length,
      stale_3plus_days: stale.length,
      urgent_list: urgent.slice(0, 5).map((r: any) => ({
        id: r.id,
        description: r.headerText?.replace('[AGENT] ', '') || r.category,
        category: r.category,
        days_old: daysAgo(r.date || r.createdAt),
        requisitioner: r.requisitioner,
      })),
      stale_list: stale.slice(0, 5).map((r: any) => ({
        id: r.id,
        description: r.headerText?.replace('[AGENT] ', '') || r.category,
        days_old: daysAgo(r.date || r.createdAt),
        status: r.status,
      })),
      alerts: [
        ...(urgent.length > 0   ? [`🚨 ${urgent.length} URGENT requisitions pending`]      : []),
        ...(stale.length > 0    ? [`⚠️ ${stale.length} reqs 3+ din se pending — follow up`] : []),
        ...(approved.length > 0 ? [`📋 ${approved.length} approved reqs — PO banana hai`]   : []),
      ],
    };
  },

  // ── Full Ops Snapshot — owner ke liye ────────────────────────────
  opsSnapshot: () => {
    const stock    = OpsAgent.stockStatus();
    const pos      = OpsAgent.purchaseOrderStatus();
    const delivery = OpsAgent.deliveryStatus();
    const reqs     = OpsAgent.requisitionOverview();

    const allAlerts = [
      ...stock.alerts,
      ...pos.alerts,
      ...delivery.alerts,
      ...reqs.alerts,
    ];

    return {
      alerts: allAlerts,
      summary: {
        low_stock_items:       (stock.glass.low_stock || 0) + (stock.store.low_stock_count || 0),
        pending_pos:           pos.pending_pos,
        overdue_pos:           pos.overdue_pos,
        ready_to_dispatch:     delivery.ready_to_dispatch,
        pending_reqs:          reqs.total_pending,
        urgent_reqs:           reqs.urgent_count,
      },
      details: { stock, pos, delivery, reqs },
    };
  },
};
