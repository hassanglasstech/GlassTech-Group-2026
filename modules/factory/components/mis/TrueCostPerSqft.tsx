import React, { useEffect, useState, useMemo } from 'react';
import {
  Calculator, RefreshCw, Loader2, TrendingUp,
  TrendingDown, AlertTriangle, Info
} from 'lucide-react';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { GeneratorService } from '@/modules/production/services/generatorService';
import { LabourService } from '@/modules/production/services/labourService';
import { SalesService } from '@/modules/sales/services/salesService';
import { ProductionService } from '@/modules/production/services/productionService';
import { FinanceService } from '@/modules/finance/services/financeService';

// ── Helpers ───────────────────────────────────────────────────────────
const fmt = (n: number) =>
  Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` :
  Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1)}K` :
  n.toFixed(2);

const thisMonthStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

interface CostBreakdown {
  label:       string;
  amount:      number;
  perSqft:     number;
  pct:         number;
  color:       string;
  description: string;
}

interface CostSnapshot {
  period:         string;
  totalSqft:      number;
  totalRevenue:   number;
  revenuePerSqft: number;
  components:     CostBreakdown[];
  totalCost:      number;
  costPerSqft:    number;
  marginPerSqft:  number;
  marginPct:      number;
}

// ── Component ─────────────────────────────────────────────────────────
const TrueCostPerSqft: React.FC = () => {
  const [snapshot, setSnapshot]   = useState<CostSnapshot | null>(null);
  const [loading, setLoading]     = useState(true);
  const [period, setPeriod]       = useState<'month' | 'all'>('month');
  const [showInfo, setShowInfo]   = useState(false);

  useEffect(() => { load(); }, [period]);

  const load = async () => {
    setLoading(true);
    try {
      // A-02: Refresh generator + labour caches from Supabase before computing
      await Promise.all([
        GeneratorService.getLogs('Glassco').catch(() => []),
        LabourService.getLogs('Glassco').catch(() => []),
      ]);
      const month = thisMonthStr();

      // ── Revenue & Sqft from quotations ────────────────────────────
      const quotations = SalesService.getQuotations().filter((q: any) =>
        q.company === 'Glassco' &&
        q.status !== 'Draft' &&
        (period === 'all' || q.date?.startsWith(month))
      );

      const totalRevenue = quotations.reduce((s: number, q: any) => {
        const glassRev  = q.items?.reduce((si: number, i: any) => si + (i.amount || 0), 0) ?? 0;
        const discount  = q.discountAmount || (glassRev * (q.discountPercent || 0) / 100);
        const serviceRev = q.serviceCharges?.reduce((si: number, c: any) => si + (c.amount || 0), 0) ?? 0;
        return s + glassRev - discount + serviceRev;
      }, 0);

      const totalSqft = quotations.reduce((s: number, q: any) =>
        s + (q.items?.reduce((si: number, i: any) => si + (i.totalSqFt || 0), 0) ?? 0), 0
      );

      // ── Glass Material Cost from POs ─────────────────────────────
      const pos = InventoryService.getPurchaseOrders().filter((p: any) =>
        p.fromCompany === 'Glassco' &&
        (p.category === 'Glass' || !p.category) &&
        (period === 'all' || p.date?.startsWith(month))
      );
      const glassMaterialCost = pos.reduce((s: number, p: any) => s + (p.totalAmount || 0), 0);

      // Freight from POs
      const freightCost = pos.reduce((s: number, p: any) => s + (p.totalFreight || 0), 0);

      // ── Service / Tempering cost from POs ────────────────────────
      const servicePOs = InventoryService.getPurchaseOrders().filter((p: any) =>
        p.fromCompany === 'Glassco' &&
        ['Tempering', 'Installation', 'Hardware'].includes(p.category || '') &&
        (period === 'all' || p.date?.startsWith(month))
      );
      const serviceCost = servicePOs.reduce((s: number, p: any) => s + (p.totalAmount || 0), 0);

      // ── Labour from payroll ───────────────────────────────────────
      // Estimate: petty cash entries for labour/wages category
      const petty = FinanceService.getPettyCashEntries().filter((p: any) =>
        p.company === 'Glassco' &&
        (period === 'all' || p.date?.startsWith(month))
      );
      const labourCost = petty
        .filter((p: any) =>
          (p.category || '').toLowerCase().includes('labour') ||
          (p.category || '').toLowerCase().includes('wage') ||
          (p.description || '').toLowerCase().includes('labour')
        )
        .reduce((s: number, p: any) => s + (p.amount || 0), 0);

      // ── Overhead ─────────────────────────────────────────────────
      const overheadCost = petty
        .filter((p: any) =>
          !(p.category || '').toLowerCase().includes('labour') &&
          !(p.category || '').toLowerCase().includes('wage')
        )
        .reduce((s: number, p: any) => s + (p.amount || 0), 0);

      // ── Waste/breakage ────────────────────────────────────────────
      const pieces = ProductionService.getProductionPieces();
      const brokenPieces = pieces.filter(p =>
        (p as any).company === 'Glassco' || true
      ).filter(p => p.status === 'Broken');
      // Rough waste cost: broken pieces * avg glass cost per piece
      const avgPieceValue = totalSqft > 0 && glassMaterialCost > 0
        ? glassMaterialCost / Math.max(pieces.length, 1)
        : 0;
      const wasteCost = brokenPieces.length * avgPieceValue;

      // ── Total cost & per sqft ─────────────────────────────────────
      const totalCost = glassMaterialCost + freightCost + serviceCost + labourCost + overheadCost + wasteCost;
      const sqftBase  = Math.max(totalSqft, 1);

      const components: CostBreakdown[] = [
        { label: 'Glass Material', amount: glassMaterialCost, perSqft: glassMaterialCost / sqftBase, pct: totalCost > 0 ? (glassMaterialCost / totalCost) * 100 : 0, color: 'bg-blue-500', description: 'PO values for glass purchases' },
        { label: 'Freight / Inward', amount: freightCost,    perSqft: freightCost    / sqftBase, pct: totalCost > 0 ? (freightCost    / totalCost) * 100 : 0, color: 'bg-purple-500', description: 'Transport & delivery charges' },
        { label: 'Tempering / Services', amount: serviceCost, perSqft: serviceCost  / sqftBase, pct: totalCost > 0 ? (serviceCost   / totalCost) * 100 : 0, color: 'bg-cyan-500',   description: 'Outsourced processing costs' },
        { label: 'Labour',           amount: labourCost,      perSqft: labourCost    / sqftBase, pct: totalCost > 0 ? (labourCost    / totalCost) * 100 : 0, color: 'bg-green-500', description: 'Wages & direct labour from petty cash' },
        { label: 'Overhead',         amount: overheadCost,    perSqft: overheadCost  / sqftBase, pct: totalCost > 0 ? (overheadCost  / totalCost) * 100 : 0, color: 'bg-orange-500', description: 'Utilities, admin, miscellaneous' },
        { label: 'Waste / Breakage', amount: wasteCost,       perSqft: wasteCost     / sqftBase, pct: totalCost > 0 ? (wasteCost     / totalCost) * 100 : 0, color: 'bg-red-500',   description: `${brokenPieces.length} broken pieces (estimated)` },
      ].filter(c => c.amount > 0);

      setSnapshot({
        period:         period === 'month' ? month : 'All Time',
        totalSqft:      parseFloat(totalSqft.toFixed(1)),
        totalRevenue,
        revenuePerSqft: totalRevenue / sqftBase,
        components,
        totalCost,
        costPerSqft:    totalCost / sqftBase,
        marginPerSqft:  (totalRevenue - totalCost) / sqftBase,
        marginPct:      totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0,
      });
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">True Cost / Sqft</h2>
          <p className="text-xs text-slate-500 mt-0.5">GlassCo · Component breakdown</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowInfo(!showInfo)} className="text-slate-400 hover:text-white transition-colors">
            <Info size={16} />
          </button>
          <button onClick={load} className="text-slate-400 hover:text-white transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Info box */}
      {showInfo && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-xs text-blue-300 space-y-1">
          <div className="font-bold">How this works:</div>
          <div>• Glass cost pulled from GlassCo POs</div>
          <div>• Labour pulled from petty cash (wage/labour entries)</div>
          <div>• Overhead = remaining petty cash</div>
          <div>• Waste estimated from broken pieces count</div>
          <div>• Wire actual GRN landed cost for exact figures</div>
        </div>
      )}

      {/* Period toggle */}
      <div className="flex gap-2 bg-slate-800 p-1 rounded-xl">
        {(['month', 'all'] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
              ${period === p ? 'bg-white text-slate-900' : 'text-slate-400'}`}>
            {p === 'month' ? 'This Month' : 'All Time'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
      ) : !snapshot ? (
        <div className="text-center py-16 text-slate-500 text-sm">Data load failed</div>
      ) : (
        <>
          {/* Hero metric */}
          <div className="bg-slate-800 rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-2xl font-black text-white">
                  {snapshot.costPerSqft.toFixed(0)}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Cost/sqft</div>
              </div>
              <div>
                <div className="text-2xl font-black text-green-400">
                  {snapshot.revenuePerSqft.toFixed(0)}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Rev/sqft</div>
              </div>
              <div>
                <div className={`text-2xl font-black ${snapshot.marginPerSqft >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {snapshot.marginPerSqft.toFixed(0)}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Margin/sqft</div>
              </div>
            </div>

            {/* Stacked bar */}
            <div>
              <div className="flex items-center gap-1 h-4 rounded-full overflow-hidden">
                {snapshot.components.map(c => (
                  <div key={c.label} className={`h-full ${c.color} transition-all`}
                    style={{ width: `${c.pct}%` }} title={`${c.label}: ${c.pct.toFixed(1)}%`} />
                ))}
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                <span>PKR {fmt(snapshot.totalCost)} total cost</span>
                <span>{snapshot.totalSqft} sqft</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Overall Margin</span>
              <span className={`text-sm font-black ${snapshot.marginPct >= 20 ? 'text-green-400' : snapshot.marginPct >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                {snapshot.marginPct.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Component breakdown */}
          <div className="space-y-2">
            <div className="text-xs text-slate-500 uppercase tracking-widest">Cost Components</div>
            {snapshot.components.map(c => (
              <div key={c.label} className="bg-slate-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${c.color} shrink-0`} />
                    <span className="font-bold text-white text-sm">{c.label}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-white text-sm">PKR {c.perSqft.toFixed(0)}/sqft</div>
                    <div className="text-[10px] text-slate-500">{c.pct.toFixed(1)}% of cost</div>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div className={`h-full ${c.color} rounded-full transition-all`} style={{ width: `${c.pct}%` }} />
                </div>
                <div className="text-[10px] text-slate-500">{c.description} · PKR {fmt(c.amount)} total</div>
              </div>
            ))}
          </div>

          {snapshot.components.length === 0 && (
            <div className="text-center py-12 text-slate-500 text-sm">
              Koi PO/petty cash data nahi is period mein
            </div>
          )}

          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 text-xs text-yellow-400">
            ⚠️ Estimated figures. Actual landed cost integration (GRN-based) gives exact numbers.
          </div>
        </>
      )}
    </div>
  );
};

export default TrueCostPerSqft;
