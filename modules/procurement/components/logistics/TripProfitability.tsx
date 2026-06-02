/**
 * TripProfitability — Sprint 13
 *
 * Trip P&L card: Charge − (Fuel + Driver + Tolls + Maintenance) → Net.
 * Reads from the trip_profitability(p_dispatch_id) RPC and provides
 * inline editing of the four cost columns on tempering_dispatches.
 *
 * Used in two places:
 *   1. DispatchPlanner detail view — operations dashboard
 *   2. Per-trip drawer in any logistics module
 *
 * Auto-refreshes when the dispatchId prop changes.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/src/services/supabaseClient';
import {
  TrendingUp, TrendingDown, Wallet, Fuel, User,
  AlertCircle, Save, Loader2, Receipt,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────

interface TripPnL {
  dispatch_id:      string;
  charge:           number;
  fuel_cost:        number;
  driver_allowance: number;
  toll_charges:     number;
  maintenance_cost: number;
  total_costs:      number;
  net_profit:       number;
  margin_pct:       number;
}

interface TripProfitabilityProps {
  dispatchId:  string;
  /** Show edit controls? Default true. */
  editable?:   boolean;
  /** Compact mode for sidebar drawers. Default false. */
  compact?:    boolean;
  onSaved?:    (pnl: TripPnL) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────

const fmtPkr = (n: number): string =>
  `PKR ${Math.round(n).toLocaleString()}`;

// ── Component ─────────────────────────────────────────────────────────

const TripProfitability: React.FC<TripProfitabilityProps> = ({
  dispatchId,
  editable  = true,
  compact   = false,
  onSaved,
}) => {
  const [pnl,      setPnl]      = useState<TripPnL | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [editing,  setEditing]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // Editable cost fields
  const [fuel,    setFuel]    = useState(0);
  const [driver,  setDriver]  = useState(0);
  const [tolls,   setTolls]   = useState(0);
  const [maint,   setMaint]   = useState(0);

  // ── Fetch P&L ──────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc('trip_profitability', {
      p_dispatch_id: dispatchId,
    });
    if (error) {
      setError(error.message);
    } else if (Array.isArray(data) && data.length > 0) {
      const r = data[0] as TripPnL;
      setPnl(r);
      setFuel(r.fuel_cost);
      setDriver(r.driver_allowance);
      setTolls(r.toll_charges);
      setMaint(r.maintenance_cost);
    } else {
      setError('Trip not found');
    }
    setLoading(false);
  }, [dispatchId]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Save edits ────────────────────────────────────────────────
  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('tempering_dispatches')
      .update({
        fuel_cost:        fuel,
        driver_allowance: driver,
        toll_charges:     tolls,
        maintenance_cost: maint,
      })
      .eq('id', dispatchId);
    setSaving(false);

    if (error) {
      toast.error(`Save failed: ${error.message}`, { duration: 6000 });
      return;
    }
    toast.success('Trip costs saved');
    setEditing(false);
    await refresh();
    if (pnl) onSaved?.(pnl);
  };

  // ── Render ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-2 text-slate-500">
        <Loader2 size={16} className="animate-spin"/>
        <span className="text-sm">Loading trip P&amp;L…</span>
      </div>
    );
  }

  if (error || !pnl) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 flex items-center gap-2 text-rose-700">
        <AlertCircle size={16}/>
        <span className="text-sm">{error ?? 'No data'}</span>
      </div>
    );
  }

  const profitable = pnl.net_profit > 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className={`p-4 ${profitable ? 'bg-emerald-50' : 'bg-rose-50'}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
              <Receipt size={12}/> Trip P&amp;L
            </div>
            <div className="font-mono text-sm text-slate-600 mt-0.5">{pnl.dispatch_id}</div>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-black ${profitable ? 'text-emerald-700' : 'text-rose-700'}`}>
              {profitable ? '+' : ''}{fmtPkr(pnl.net_profit)}
            </div>
            <div className={`text-xs font-bold flex items-center gap-1 justify-end ${profitable ? 'text-emerald-600' : 'text-rose-600'}`}>
              {profitable ? <TrendingUp size={12}/> : <TrendingDown size={12}/>}
              {pnl.margin_pct}% margin
            </div>
          </div>
        </div>
      </div>

      {/* Cost breakdown */}
      <div className={`p-4 ${compact ? 'space-y-1.5' : 'space-y-2'}`}>
        <Row icon={<Wallet size={14}/>} label="Charge"          value={pnl.charge}          highlight  />

        {editing ? (
          <>
            <EditableRow icon={<Fuel size={14}/>}   label="Fuel"            value={fuel}    onChange={setFuel}   />
            <EditableRow icon={<User size={14}/>}   label="Driver"          value={driver}  onChange={setDriver} />
            <EditableRow icon={<Receipt size={14}/>}label="Tolls"           value={tolls}   onChange={setTolls}  />
            <EditableRow icon={<Wallet size={14}/>} label="Maintenance"     value={maint}   onChange={setMaint}  />
          </>
        ) : (
          <>
            <Row icon={<Fuel size={14}/>}    label="Fuel"        value={pnl.fuel_cost}        negative />
            <Row icon={<User size={14}/>}    label="Driver"      value={pnl.driver_allowance} negative />
            <Row icon={<Receipt size={14}/>} label="Tolls"       value={pnl.toll_charges}     negative />
            <Row icon={<Wallet size={14}/>}  label="Maintenance" value={pnl.maintenance_cost} negative />
          </>
        )}

        <div className="border-t border-slate-200 pt-2 mt-2">
          <Row label="Total Costs" value={pnl.total_costs} negative bold />
        </div>
      </div>

      {/* Footer actions */}
      {editable && (
        <div className="px-4 pb-4 flex justify-end gap-2">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => { setEditing(false); refresh(); }}
                disabled={saving}
                className="px-3 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="px-3 py-1.5 rounded-md text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5"
              >
                {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>}
                Save
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-blue-600 hover:bg-blue-50"
            >
              Edit costs
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────

interface RowProps {
  icon?:     React.ReactNode;
  label:     string;
  value:     number;
  negative?: boolean;
  highlight?: boolean;
  bold?:     boolean;
}
const Row: React.FC<RowProps> = ({ icon, label, value, negative, highlight, bold }) => (
  <div className="flex items-center justify-between text-sm">
    <span className="flex items-center gap-2 text-slate-600">
      {icon}
      <span className={bold ? 'font-bold' : ''}>{label}</span>
    </span>
    <span className={`font-mono ${bold ? 'font-black' : 'font-bold'} ${highlight ? 'text-emerald-700' : negative ? 'text-rose-600' : 'text-slate-700'}`}>
      {negative ? '−' : ''}{fmtPkr(Math.abs(value))}
    </span>
  </div>
);

interface EditableRowProps {
  icon:     React.ReactNode;
  label:    string;
  value:    number;
  onChange: (v: number) => void;
}
const EditableRow: React.FC<EditableRowProps> = ({ icon, label, value, onChange }) => (
  <div className="flex items-center justify-between text-sm gap-3">
    <span className="flex items-center gap-2 text-slate-600 shrink-0">
      {icon}
      {label}
    </span>
    <input
      type="number"
      min="0"
      value={value}
      onChange={e => onChange(Number(e.target.value) || 0)}
      className="w-32 px-2 py-1 rounded border border-slate-300 text-right font-mono text-sm focus:border-blue-500 focus:outline-none"
    />
  </div>
);

export default TripProfitability;
