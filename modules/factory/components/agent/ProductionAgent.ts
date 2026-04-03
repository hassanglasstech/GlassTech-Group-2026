const ls = (key: string) => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };

const formatPKR  = (n: number) => `PKR ${n.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
const formatDate = (d: string) => new Date(d).toLocaleDateString('en-PK', { day:'2-digit', month:'short' });
const daysSince  = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

// ── Production Agent ──────────────────────────────────────────────────
export const ProductionAgent = {

  // Active Job Orders — floor pe kya chal raha hai
  activeJobOrders: () => {
    const jobs = ls('gtk_erp_job_orders');
    const active = jobs.filter((j: any) =>
      ['In Production', 'Cutting', 'Active', 'Pending', 'In Progress'].includes(j.status)
    ).map((j: any) => ({
      id: j.id,
      order_no: j.orderNo || j.id,
      client: j.clientName,
      project: j.projectName,
      status: j.status,
      total_pieces: j.items?.reduce((s: number, i: any) => s + (i.qty || 0), 0) || 0,
      total_sqft: j.items?.reduce((s: number, i: any) => s + (i.totalSqFt || 0), 0) || 0,
      date: formatDate(j.date),
      days_old: daysSince(j.date),
      amount: formatPKR(j.totalAmount || 0),
    })).sort((a: any, b: any) => b.days_old - a.days_old);

    return {
      active_count: active.length,
      total_pieces: active.reduce((s: number, j: any) => s + j.total_pieces, 0),
      oldest_job: active[0] || null,
      jobs: active,
    };
  },

  // Pending / Stuck Jobs — 3+ din se pending
  stuckJobs: (days = 3) => {
    const jobs = ls('gtk_erp_job_orders');
    const stuck = jobs.filter((j: any) => {
      const isActive = ['In Production', 'Pending', 'Active', 'Cutting'].includes(j.status);
      return isActive && daysSince(j.date) >= days;
    }).map((j: any) => ({
      id: j.id,
      order_no: j.orderNo || j.id,
      client: j.clientName,
      status: j.status,
      days_pending: daysSince(j.date),
      amount: formatPKR(j.totalAmount || 0),
    }));

    return {
      stuck_count: stuck.length,
      jobs: stuck.sort((a: any, b: any) => b.days_pending - a.days_pending),
      alert: stuck.length > 0
        ? `⚠️ ${stuck.length} jobs ${days}+ din se pending hain`
        : '✅ Koi job stuck nahi',
    };
  },

  // NCR / Breakage Summary
  ncrSummary: (query?: string) => {
    const ncr = ls('gtk_erp_ncr_events');
    const now = new Date();

    let filtered = ncr;
    if (query?.toLowerCase().includes('aaj') || query?.toLowerCase().includes('today')) {
      const today = now.toISOString().split('T')[0];
      filtered = ncr.filter((n: any) => n.date === today || n.createdAt?.startsWith(today));
    } else if (query?.toLowerCase().includes('is hafte') || query?.toLowerCase().includes('week')) {
      const from = new Date(now); from.setDate(now.getDate() - 7);
      filtered = ncr.filter((n: any) => new Date(n.date || n.createdAt) >= from);
    } else if (query?.toLowerCase().includes('is mahine') || query?.toLowerCase().includes('month')) {
      filtered = ncr.filter((n: any) => {
        const d = new Date(n.date || n.createdAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
    }

    const totalSheets  = filtered.reduce((s: number, n: any) => s + (n.qty || n.sheets || 1), 0);
    const totalSqFt    = filtered.reduce((s: number, n: any) => s + (n.sqFt || n.totalSqFt || 0), 0);
    const totalLoss    = filtered.reduce((s: number, n: any) => s + (n.glLoss || n.costImpact || 0), 0);

    // Group by reason
    const byReason: Record<string, number> = {};
    filtered.forEach((n: any) => {
      const r = n.reason || n.defectType || 'Unknown';
      byReason[r] = (byReason[r] || 0) + 1;
    });

    // Group by cutter
    const byCutter: Record<string, { count: number; sheets: number }> = {};
    filtered.forEach((n: any) => {
      const c = n.cutter || n.cutterName || n.recordedBy || 'Unknown';
      if (!byCutter[c]) byCutter[c] = { count: 0, sheets: 0 };
      byCutter[c].count++;
      byCutter[c].sheets += n.qty || 1;
    });

    return {
      total_events: filtered.length,
      total_sheets_broken: totalSheets,
      total_sqft_lost: Math.round(totalSqFt * 100) / 100,
      total_loss_pkr: totalLoss,
      formatted_loss: formatPKR(totalLoss),
      by_reason: byReason,
      by_cutter: byCutter,
      top_reason: Object.entries(byReason).sort((a,b) => b[1]-a[1])[0]?.[0] || 'N/A',
      worst_cutter: Object.entries(byCutter).sort((a,b) => b[1].count-a[1].count)[0]?.[0] || 'N/A',
    };
  },

  // Cutting Sessions — aaj kya kita gaya
  cuttingSessions: (query?: string) => {
    const sessions = ls('gtk_erp_cutting_sessions');
    const today = new Date().toISOString().split('T')[0];

    let filtered = sessions;
    if (!query || query.toLowerCase().includes('aaj') || query.toLowerCase().includes('today')) {
      filtered = sessions.filter((s: any) => s.date === today || s.createdAt?.startsWith(today));
    }

    const totalSheets = filtered.reduce((s: number, cs: any) => s + (cs.sheetsTotal || cs.totalSheets || 0), 0);
    const totalSqFt   = filtered.reduce((s: number, cs: any) => s + (cs.sqFt || cs.totalSqFt || 0), 0);

    return {
      sessions_count: filtered.length,
      total_sheets_cut: totalSheets,
      total_sqft: Math.round(totalSqFt * 100) / 100,
      sessions: filtered.map((s: any) => ({
        id: s.id,
        cutter: s.cutterName || s.cutter,
        table: s.tableNo || s.table,
        job: s.jobOrderId || s.orderId,
        sheets: s.sheetsTotal || s.totalSheets,
        sqft: s.sqFt || s.totalSqFt,
        shift: s.shift || 'Day',
        date: s.date,
      })),
    };
  },

  // Dispatch Status — kya dispatch hua, kya pending
  dispatchStatus: () => {
    const dispatches = ls('gtk_erp_tempering_dispatches');
    const jobs = ls('gtk_erp_job_orders');

    const pendingDispatch = jobs.filter((j: any) =>
      j.status === 'Ready' || j.status === 'Completed' && !j.isAlreadyDispatched
    );

    const recentDispatches = dispatches
      .filter((d: any) => daysSince(d.date || d.createdAt) <= 7)
      .map((d: any) => ({
        id: d.id,
        client: d.clientName,
        date: formatDate(d.date || d.createdAt),
        pieces: d.pieces || d.qty,
        sqft: d.sqFt || d.totalSqFt,
      }));

    return {
      pending_dispatch: pendingDispatch.length,
      recent_dispatches_7days: recentDispatches.length,
      pending_jobs: pendingDispatch.map((j: any) => ({
        id: j.id, client: j.clientName, project: j.projectName, date: formatDate(j.date),
      })),
      recent: recentDispatches,
    };
  },

  // Full Floor Status — owner ke liye ek nazar mein sab
  floorStatus: () => {
    const active   = ProductionAgent.activeJobOrders();
    const stuck    = ProductionAgent.stuckJobs(3);
    const ncr      = ProductionAgent.ncrSummary('is hafte');
    const cutting  = ProductionAgent.cuttingSessions('aaj');
    const dispatch = ProductionAgent.dispatchStatus();

    const alerts: string[] = [];
    if (stuck.stuck_count > 0) alerts.push(`⚠️ ${stuck.stuck_count} jobs 3+ din se pending`);
    if (ncr.total_events > 5) alerts.push(`🔴 Is hafte ${ncr.total_events} NCR events — ${ncr.formatted_loss} loss`);
    if (dispatch.pending_dispatch > 0) alerts.push(`📦 ${dispatch.pending_dispatch} orders dispatch ke liye ready hain`);

    return {
      alerts,
      active_jobs: active.active_count,
      aaj_cutting: cutting.total_sheets_cut,
      is_hafte_ncr: ncr.total_events,
      pending_dispatch: dispatch.pending_dispatch,
      details: { active, stuck, ncr, cutting, dispatch },
    };
  },
};
