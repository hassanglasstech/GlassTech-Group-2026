import React, { useState, useEffect, useMemo } from 'react';
import { ProductionService } from '@/modules/production/services/productionService';
import { NCRService } from '@/modules/production/services/ncrService';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { AlertTriangle, CheckCircle2, Clock, Package, Truck, TrendingUp, RefreshCw } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────
interface CompanyStat {
  name: string;
  code: string;
  color: string;
  activeOrders: number;
  cutting: number;
  processing: number;
  readyDispatch: number;
  delivered: number;
  ncrToday: number;
  onTrackPct: number;
}

interface Alert {
  id: string;
  type: 'urgent' | 'warn' | 'ok';
  company: string;
  title: string;
  sub: string;
  time: string;
}

// ── Inline styles ─────────────────────────────────────────────────────
const css = `
  .fm-wrap {
    font-family: -apple-system, 'Segoe UI', sans-serif;
    background: #f8fafc;
    min-height: 100%;
    padding: 0;
  }

  /* Header */
  .fm-header {
    background: #ffffff;
    border-bottom: 1px solid #e2e8f0;
    padding: 16px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .fm-header-left { display: flex; flex-direction: column; gap: 2px; }
  .fm-header-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: #94a3b8;
  }
  .fm-header-title { font-size: 18px; font-weight: 800; color: #0f172a; }
  .fm-header-right { display: flex; align-items: center; gap: 12px; }

  .fm-refresh-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    color: #475569;
    cursor: pointer;
    font-family: inherit;
    transition: all .15s;
  }
  .fm-refresh-btn:hover { background: #e2e8f0; color: #1e293b; }
  .fm-refresh-btn.spinning svg { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .fm-time {
    font-size: 11px;
    color: #94a3b8;
    font-variant-numeric: tabular-nums;
  }

  /* Body */
  .fm-body { padding: 20px 24px; max-width: 1400px; margin: 0 auto; }

  /* KPI row */
  .fm-kpi-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 20px;
  }
  .fm-kpi {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-top: 3px solid;
    padding: 16px 18px;
  }
  .fm-kpi-num {
    font-size: 34px;
    font-weight: 800;
    line-height: 1;
    margin-bottom: 4px;
  }
  .fm-kpi-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: #94a3b8;
  }

  /* Two column layout */
  .fm-two-col {
    display: grid;
    grid-template-columns: 1fr 340px;
    gap: 16px;
    margin-bottom: 16px;
  }

  /* Section header */
  .fm-sec-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: #94a3b8;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .fm-sec-label::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #e2e8f0;
  }

  /* Company cards */
  .fm-company-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 16px;
  }
  .fm-co-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-top: 3px solid;
    padding: 16px 18px;
  }
  .fm-co-name {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .15em;
    text-transform: uppercase;
    margin-bottom: 14px;
  }
  .fm-co-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 7px;
    font-size: 12px;
  }
  .fm-co-row-label { color: #64748b; }
  .fm-co-row-val { font-weight: 700; color: #0f172a; }
  .fm-co-row-val.red { color: #dc2626; }
  .fm-co-row-val.green { color: #059669; }
  .fm-co-row-val.amber { color: #d97706; }
  .fm-co-bar-bg {
    height: 4px;
    background: #f1f5f9;
    border-radius: 2px;
    margin-top: 10px;
    overflow: hidden;
  }
  .fm-co-bar-fill {
    height: 100%;
    border-radius: 2px;
    transition: width .6s ease;
  }
  .fm-co-bar-label {
    font-size: 10px;
    color: #94a3b8;
    margin-top: 4px;
  }

  /* Piece status table */
  .fm-table-wrap {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    overflow: hidden;
    margin-bottom: 16px;
  }
  .fm-table { width: 100%; border-collapse: collapse; }
  .fm-table th {
    background: #0f172a;
    color: #ffffff;
    padding: 10px 14px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
    text-align: left;
  }
  .fm-table td {
    padding: 10px 14px;
    font-size: 12px;
    border-bottom: 1px solid #f1f5f9;
    color: #374151;
    vertical-align: middle;
  }
  .fm-table tr:last-child td { border-bottom: none; }
  .fm-table tr:hover td { background: #f8fafc; }

  /* Status pill */
  .fm-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .04em;
    text-transform: uppercase;
  }
  .pill-green { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
  .pill-amber { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
  .pill-red   { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
  .pill-blue  { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
  .pill-gray  { background: #f9fafb; color: #6b7280; border: 1px solid #e5e7eb; }

  /* Live dot */
  .live-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    margin-right: 5px;
    flex-shrink: 0;
  }
  .dot-green { background: #10b981; animation: ldPulse 2s infinite; }
  .dot-amber { background: #f59e0b; }
  .dot-red   { background: #ef4444; animation: ldPulse 1s infinite; }
  @keyframes ldPulse { 0%,100%{opacity:1} 50%{opacity:.35} }

  /* Progress bar inline */
  .fm-prog {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .fm-prog-bar {
    width: 80px;
    height: 4px;
    background: #f1f5f9;
    border-radius: 2px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .fm-prog-fill { height: 100%; border-radius: 2px; }
  .fm-prog-label { font-size: 11px; color: #94a3b8; }

  /* Alerts panel */
  .fm-alerts-panel {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    overflow: hidden;
  }
  .fm-alert-item {
    padding: 12px 16px;
    border-left: 3px solid;
    border-bottom: 1px solid #f1f5f9;
    transition: background .12s;
    cursor: default;
  }
  .fm-alert-item:last-child { border-bottom: none; }
  .fm-alert-item:hover { background: #f8fafc; }
  .fm-alert-item.urg { border-left-color: #dc2626; }
  .fm-alert-item.warn { border-left-color: #f59e0b; }
  .fm-alert-item.ok { border-left-color: #10b981; }
  .fm-alert-title { font-size: 12px; font-weight: 700; color: #111827; margin-bottom: 3px; }
  .fm-alert-sub { font-size: 11px; color: #6b7280; }
  .fm-alert-time {
    font-size: 10px;
    color: #94a3b8;
    margin-top: 4px;
    font-variant-numeric: tabular-nums;
  }

  .fm-empty {
    padding: 28px 16px;
    text-align: center;
    font-size: 12px;
    color: #94a3b8;
  }

  /* Responsive */
  @media (max-width: 900px) {
    .fm-kpi-row { grid-template-columns: 1fr 1fr; }
    .fm-company-grid { grid-template-columns: 1fr; }
    .fm-two-col { grid-template-columns: 1fr; }
  }
`;

// ── Helper ────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split('T')[0];

const COMPANIES: { name: string; code: string; color: string; orderPrefix: string }[] = [
  { name: 'GlassCo', code: 'Glassco', color: '#2563eb', orderPrefix: 'GLS' },
  { name: 'GTK',     code: 'GTK',     color: '#7c3aed', orderPrefix: 'GTK' },
  { name: 'GTI',     code: 'GTI',     color: '#0891b2', orderPrefix: 'GTI' },
];

// ── Main Component ────────────────────────────────────────────────────
const FactoryManagerDashboard: React.FC = () => {
  const [pieces, setPieces]     = useState<any[]>([]);
  const [orders, setOrders]     = useState<any[]>([]);
  const [clients, setClients]   = useState<any[]>([]);
  const [ncrs, setNcrs]         = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  const load = async () => {
    setRefreshing(true);
    try {
      const [p, q, c, n] = await Promise.all([
        Promise.resolve(ProductionService.getProductionPieces()),
        AsyncSalesService.getQuotations(),
        AsyncSalesService.getClients(),
        Promise.resolve(NCRService.getNCREvents()),
      ]);
      setPieces(p);
      setOrders(q.filter((q: any) => q.status === 'Approved'));
      setClients(c);
      setNcrs(n);
      setLastUpdated(new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      console.error('[FactoryManagerDashboard] load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── Per-company stats ────────────────────────────────────────────────
  const companyStats = useMemo((): CompanyStat[] => {
    const today = todayStr();
    return COMPANIES.map(co => {
      const coOrders = orders.filter((o: any) => o.company === co.code);
      const coOrderIds = new Set(coOrders.map((o: any) => o.orderNo || o.id));
      const coPieces = pieces.filter((p: any) => coOrderIds.has(p.orderId));

      const cutting    = coPieces.filter(p => p.status === 'Cut' || p.status === 'QC-Pending').length;
      const processing = coPieces.filter(p => p.status === 'Tempering' || p.status === 'Service-Pending').length;
      const ready      = coPieces.filter(p => p.status === 'QC-Passed' || p.status === 'Ready to Dispatch').length;
      const delivered  = coPieces.filter(p => p.status === 'Delivered').length;
      const total      = coPieces.length || 1;
      const onTrack    = delivered + ready;

      const ncrToday = ncrs.filter((n: any) =>
        n.company === co.code &&
        (n.createdAt || n.date || '').startsWith(today)
      ).length;

      return {
        name: co.name,
        code: co.code,
        color: co.color,
        activeOrders: coOrders.length,
        cutting,
        processing,
        readyDispatch: ready,
        delivered,
        ncrToday,
        onTrackPct: Math.round((onTrack / total) * 100),
      };
    });
  }, [pieces, orders, ncrs]);

  // ── Global KPIs ──────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalOrders   = companyStats.reduce((s, c) => s + c.activeOrders, 0);
    const readyDispatch = companyStats.reduce((s, c) => s + c.readyDispatch, 0);
    const ncrToday      = companyStats.reduce((s, c) => s + c.ncrToday, 0);
    const cutting       = companyStats.reduce((s, c) => s + c.cutting, 0);
    return { totalOrders, readyDispatch, ncrToday, cutting };
  }, [companyStats]);

  // ── Order table rows ─────────────────────────────────────────────────
  const orderRows = useMemo(() => {
    return orders.slice(0, 12).map((o: any) => {
      const co = COMPANIES.find(c => c.code === o.company);
      const client = clients.find((c: any) => c.id === o.clientId);
      const orderPieces = pieces.filter(p => p.orderId === (o.orderNo || o.id));
      const total    = orderPieces.length;
      const done     = orderPieces.filter(p => p.status === 'Delivered').length;
      const ready    = orderPieces.filter(p => p.status === 'QC-Passed' || p.status === 'Ready to Dispatch').length;
      const cutting  = orderPieces.filter(p => p.status === 'Cut' || p.status === 'QC-Pending').length;
      const pct      = total > 0 ? Math.round(((done + ready) / total) * 100) : 0;

      let statusLabel = 'Pending';
      let statusClass = 'pill-gray';
      if (done === total && total > 0)  { statusLabel = 'Delivered'; statusClass = 'pill-green'; }
      else if (ready > 0)               { statusLabel = 'Ready'; statusClass = 'pill-green'; }
      else if (cutting > 0)             { statusLabel = 'Cutting'; statusClass = 'pill-amber'; }

      return { o, co, client, pct, statusLabel, statusClass, total, done };
    });
  }, [orders, pieces, clients]);

  // ── Alerts ───────────────────────────────────────────────────────────
  const alerts = useMemo((): Alert[] => {
    const list: Alert[] = [];
    const today = todayStr();

    // NCR alerts
    ncrs.filter((n: any) => (n.createdAt || n.date || '').startsWith(today))
      .slice(0, 4)
      .forEach((n: any) => {
        list.push({
          id: n.id,
          type: 'urgent',
          company: n.company,
          title: `NCR — ${n.company} · ${n.pieceId || ''}`,
          sub: n.defectDescription || n.description || 'Breakage reported',
          time: n.createdAt ? new Date(n.createdAt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) : 'Today',
        });
      });

    // Ready dispatch alerts
    companyStats.forEach(co => {
      if (co.readyDispatch > 0) {
        list.push({
          id: `ready-${co.code}`,
          type: 'ok',
          company: co.name,
          title: `${co.readyDispatch} order${co.readyDispatch > 1 ? 's' : ''} ready — ${co.name}`,
          sub: 'QC passed · Awaiting dispatch',
          time: 'Now',
        });
      }
    });

    // Cutting backlog warnings
    companyStats.forEach(co => {
      if (co.cutting > 20) {
        list.push({
          id: `cutting-${co.code}`,
          type: 'warn',
          company: co.name,
          title: `High cutting backlog — ${co.name}`,
          sub: `${co.cutting} pieces pending on cutting floor`,
          time: 'Now',
        });
      }
    });

    return list.sort((a, b) => {
      const order = { urgent: 0, warn: 1, ok: 2 };
      return order[a.type] - order[b.type];
    });
  }, [ncrs, companyStats]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: '#94a3b8', gap: '10px' }}>
        <RefreshCw size={16} style={{ animation: 'spin .8s linear infinite' }}/>
        Loading dashboard...
        <style>{`.fm-wrap { font-family: -apple-system, 'Segoe UI', sans-serif; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="fm-wrap">
      <style>{css}</style>

      {/* ── Header ── */}
      <div className="fm-header">
        <div className="fm-header-left">
          <div className="fm-header-label">Factory Manager · Live View</div>
          <div className="fm-header-title">Production Dashboard — All Companies</div>
        </div>
        <div className="fm-header-right">
          {lastUpdated && <span className="fm-time">Updated {lastUpdated}</span>}
          <button
            className={`fm-refresh-btn${refreshing ? ' spinning' : ''}`}
            onClick={load}
          >
            <RefreshCw size={13}/>
            Refresh
          </button>
        </div>
      </div>

      <div className="fm-body">

        {/* ── Global KPIs ── */}
        <div className="fm-kpi-row">
          <div className="fm-kpi" style={{ borderTopColor: '#2563eb' }}>
            <div className="fm-kpi-num" style={{ color: '#2563eb' }}>{kpis.totalOrders}</div>
            <div className="fm-kpi-label">Active Orders · All Co.</div>
          </div>
          <div className="fm-kpi" style={{ borderTopColor: '#d97706' }}>
            <div className="fm-kpi-num" style={{ color: '#d97706' }}>{kpis.cutting}</div>
            <div className="fm-kpi-label">Pieces on Cutting Floor</div>
          </div>
          <div className="fm-kpi" style={{ borderTopColor: '#059669' }}>
            <div className="fm-kpi-num" style={{ color: '#059669' }}>{kpis.readyDispatch}</div>
            <div className="fm-kpi-label">Ready for Dispatch</div>
          </div>
          <div className="fm-kpi" style={{ borderTopColor: kpis.ncrToday > 0 ? '#dc2626' : '#e2e8f0' }}>
            <div className="fm-kpi-num" style={{ color: kpis.ncrToday > 0 ? '#dc2626' : '#94a3b8' }}>{kpis.ncrToday}</div>
            <div className="fm-kpi-label">NCR / Breakage Today</div>
          </div>
        </div>

        {/* ── Company cards ── */}
        <div className="fm-sec-label">Company-wise Status</div>
        <div className="fm-company-grid">
          {companyStats.map(co => (
            <div key={co.code} className="fm-co-card" style={{ borderTopColor: co.color }}>
              <div className="fm-co-name" style={{ color: co.color }}>{co.name}</div>
              <div className="fm-co-row">
                <span className="fm-co-row-label">Active orders</span>
                <span className="fm-co-row-val">{co.activeOrders}</span>
              </div>
              <div className="fm-co-row">
                <span className="fm-co-row-label">Cutting</span>
                <span className={`fm-co-row-val${co.cutting > 0 ? ' amber' : ''}`}>{co.cutting} pcs</span>
              </div>
              <div className="fm-co-row">
                <span className="fm-co-row-label">Ready dispatch</span>
                <span className={`fm-co-row-val${co.readyDispatch > 0 ? ' green' : ''}`}>{co.readyDispatch}</span>
              </div>
              <div className="fm-co-row">
                <span className="fm-co-row-label">NCR today</span>
                <span className={`fm-co-row-val${co.ncrToday > 0 ? ' red' : ''}`}>{co.ncrToday}</span>
              </div>
              <div className="fm-co-bar-bg">
                <div
                  className="fm-co-bar-fill"
                  style={{ width: `${co.onTrackPct}%`, background: co.color }}
                />
              </div>
              <div className="fm-co-bar-label">{co.onTrackPct}% pieces delivered or ready</div>
            </div>
          ))}
        </div>

        {/* ── Two column: Orders table + Alerts ── */}
        <div className="fm-two-col">

          {/* Orders table */}
          <div>
            <div className="fm-sec-label">Active Orders — All Companies</div>
            <div className="fm-table-wrap">
              <table className="fm-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Client</th>
                    <th>Co.</th>
                    <th>Status</th>
                    <th>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {orderRows.length === 0 ? (
                    <tr><td colSpan={5} className="fm-empty">No active orders</td></tr>
                  ) : orderRows.map(({ o, co, client, pct, statusLabel, statusClass, total, done }) => (
                    <tr key={o.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '11px', color: co?.color || '#374151', fontWeight: 600 }}>
                        {o.orderNo || o.id}
                      </td>
                      <td style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {client?.name || o.projectName || '—'}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: '10px', fontWeight: 700, color: co?.color || '#374151' }}>
                          {o.company}
                        </span>
                      </td>
                      <td>
                        <span className={`fm-pill ${statusClass}`}>{statusLabel}</span>
                      </td>
                      <td>
                        <div className="fm-prog">
                          <div className="fm-prog-bar">
                            <div
                              className="fm-prog-fill"
                              style={{ width: `${pct}%`, background: pct === 100 ? '#059669' : '#2563eb' }}
                            />
                          </div>
                          <span className="fm-prog-label">{done}/{total}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Alerts */}
          <div>
            <div className="fm-sec-label">Live Alerts</div>
            <div className="fm-alerts-panel">
              {alerts.length === 0 ? (
                <div className="fm-empty">
                  <CheckCircle2 size={24} style={{ color: '#a7f3d0', marginBottom: '8px' }}/>
                  <div>No alerts — all clear</div>
                </div>
              ) : alerts.map(a => (
                <div key={a.id} className={`fm-alert-item ${a.type}`}>
                  <div className="fm-alert-title">
                    {a.type === 'urgent' && '⚠ '}
                    {a.type === 'warn'   && '⏰ '}
                    {a.type === 'ok'     && '✓ '}
                    {a.title}
                  </div>
                  <div className="fm-alert-sub">{a.sub}</div>
                  <div className="fm-alert-time">{a.time}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default FactoryManagerDashboard;
