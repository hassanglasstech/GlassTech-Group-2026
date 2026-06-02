/**
 * IntercompanySettlement.tsx — Design System v2
 *
 * IFRS 10 / IAS 24 Intercompany Settlement Engine UI.
 * Calls SECURITY DEFINER RPCs for atomic dual-ledger GL posting.
 * Zero client-side cross-tenant writes.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/src/services/supabaseClient';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useAuthStore } from '@/modules/auth/authStore';
import { CompactPageHeader } from '@/modules/shared/components/CompactPageHeader';
import { DataGridCard, GridColumn } from '@/modules/shared/components/DataGridCard';
import {
  ArrowRightLeft, RefreshCw, Plus, RotateCcw, Building2,
  TrendingUp, TrendingDown, Minus, Banknote, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ──────────────────────────────────────────────────────────────
interface ICOBalance {
  company: string;
  total_receivable: number;
  total_payable: number;
  net_position: number;
}

interface ICOSettlement {
  id: string;
  from_company: string;
  to_company: string;
  amount: number;
  settlement_date: string;
  reference: string;
  description: string;
  method: string;
  status: 'Posted' | 'Reversed';
  settled_by: string;
  created_at: string;
}

const COMPANIES = ['GTK', 'GTI', 'Glassco', 'Nippon', 'Factory'];
const METHODS   = ['Bank Transfer', 'Cash', 'Cheque'];

// ── Component ──────────────────────────────────────────────────────────
const IntercompanySettlement: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const userEmail = useAuthStore(s => s.user?.email ?? 'system');

  const [balances, setBalances]       = useState<ICOBalance[]>([]);
  const [settlements, setSettlements] = useState<ICOSettlement[]>([]);
  const [loading, setLoading]         = useState(false);
  const [posting, setPosting]         = useState(false);

  // ── Form state ──
  const [form, setForm] = useState({
    from_company: '',
    to_company: '',
    amount: '',
    reference: '',
    description: '',
    method: 'Bank Transfer',
    date: new Date().toISOString().split('T')[0],
  });

  // ── Data loading (single batch, no N+1) ──
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [balRes, settleRes] = await Promise.all([
        supabase.from('intercompany_balances').select('*'),
        supabase.from('intercompany_settlements').select('*').order('created_at', { ascending: false }).limit(50),
      ]);
      if (balRes.data) setBalances(balRes.data as ICOBalance[]);
      if (settleRes.data) setSettlements(settleRes.data as ICOSettlement[]);
    } catch (e) {
      console.warn('[ICO Settlement] load failed:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Wire Alt+R ──
  useEffect(() => {
    const handler = () => loadData();
    window.addEventListener('erp:refresh', handler);
    return () => window.removeEventListener('erp:refresh', handler);
  }, [loadData]);

  // ── Post settlement via RPC ──
  const handlePost = async () => {
    if (!form.from_company || !form.to_company) return toast.error('Select both companies.');
    if (form.from_company === form.to_company) return toast.error('Cannot settle between same company.');
    const amt = Number(form.amount);
    if (!amt || amt <= 0) return toast.error('Amount must be greater than zero.');

    setPosting(true);
    try {
      const { data, error } = await supabase.rpc('post_intercompany_settlement', {
        p_from_company: form.from_company,
        p_to_company:   form.to_company,
        p_amount:        amt,
        p_reference:     form.reference,
        p_description:   form.description || `ICO Settlement: ${form.from_company} → ${form.to_company}`,
        p_method:        form.method,
        p_settled_by:    userEmail,
        p_date:          form.date,
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || 'RPC returned failure');

      toast.success(`Settlement posted: ${form.from_company} → ${form.to_company} PKR ${amt.toLocaleString()}`);
      setForm(f => ({ ...f, amount: '', reference: '', description: '' }));
      loadData();
    } catch (e: any) {
      toast.error('Settlement failed: ' + (e.message || 'Unknown error'));
    }
    setPosting(false);
  };

  // ── Reverse settlement via RPC ──
  const handleReverse = async (id: string) => {
    if (!confirm('Reverse this settlement? GL entries will be reversed in both company ledgers.')) return;
    try {
      const { data, error } = await supabase.rpc('reverse_intercompany_settlement', {
        p_settlement_id: id,
        p_reversed_by:   userEmail,
      });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || 'Reversal failed');
      toast.success('Settlement reversed successfully.');
      loadData();
    } catch (e: any) {
      toast.error('Reversal failed: ' + (e.message || 'Unknown error'));
    }
  };

  // ── Columns ──
  const settleColumns: GridColumn[] = [
    { key: 'id',       header: 'Settlement ID' },
    { key: 'date',     header: 'Date' },
    { key: 'from',     header: 'Payer' },
    { key: 'to',       header: 'Payee' },
    { key: 'amount',   header: 'Amount (PKR)', align: 'right' },
    { key: 'method',   header: 'Method' },
    { key: 'ref',      header: 'Reference' },
    { key: 'status',   header: 'Status', align: 'center' },
    { key: 'actions',  header: '', width: '5%' },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <CompactPageHeader
        title="Intercompany Settlements"
        subtitle="IFRS 10 / IAS 24"
        breadcrumbs={[{ label: 'Finance' }, { label: 'ICO Settlements' }]}
        actions={[
          {
            label: 'Refresh',
            icon: <RefreshCw size={12} />,
            onClick: () => window.dispatchEvent(new CustomEvent('erp:refresh')),
            variant: 'secondary',
            shortcut: 'Alt+R',
          },
        ]}
        meta={<span className="text-[10px] font-black text-slate-400 uppercase">{settlements.filter(s => s.status === 'Posted').length} Active Settlements</span>}
      />

      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 gap-4">

        {/* ── ICO Balance Cards ────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 shrink-0">
          {COMPANIES.map(co => {
            const bal = balances.find(b => b.company === co);
            const net = bal?.net_position ?? 0;
            return (
              <div key={co} className="bg-white rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Building2 size={12} className="text-slate-400" />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{co}</span>
                </div>
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[9px]">
                    <span className="text-emerald-500 font-bold flex items-center gap-0.5"><TrendingUp size={9}/>Receivable</span>
                    <span className="font-black text-slate-700">{(bal?.total_receivable ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-[9px]">
                    <span className="text-rose-500 font-bold flex items-center gap-0.5"><TrendingDown size={9}/>Payable</span>
                    <span className="font-black text-slate-700">{(bal?.total_payable ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-[10px] border-t border-slate-100 pt-0.5 mt-0.5">
                    <span className="font-black text-slate-500">Net</span>
                    <span className={`font-black ${net > 0 ? 'text-emerald-600' : net < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                      {net > 0 ? '+' : ''}{net.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Settlement Form ─────────────────────────────────────── */}
        <div className="bg-white rounded-lg border border-slate-200 p-3 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <ArrowRightLeft size={14} className="text-blue-600" />
            <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">Post New Settlement</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Payer (From)</label>
              <select className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white font-bold" value={form.from_company} onChange={e => setForm(f => ({ ...f, from_company: e.target.value }))}>
                <option value="">Select...</option>
                {COMPANIES.filter(c => c !== form.to_company).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Payee (To)</label>
              <select className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white font-bold" value={form.to_company} onChange={e => setForm(f => ({ ...f, to_company: e.target.value }))}>
                <option value="">Select...</option>
                {COMPANIES.filter(c => c !== form.from_company).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Amount (PKR)</label>
              <input type="number" min="1" className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 font-bold" placeholder="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Method</label>
              <select className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white font-bold" value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}>
                {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Date</label>
              <input type="date" className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 font-bold" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Reference</label>
              <input type="text" className="w-full text-xs border border-slate-200 rounded px-2 py-1.5" placeholder="Cheque# / Ref" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Description</label>
              <input type="text" className="w-full text-xs border border-slate-200 rounded px-2 py-1.5" placeholder="Optional note" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex items-end">
              <button onClick={handlePost} disabled={posting}
                className="w-full bg-blue-600 text-white px-3 py-1.5 rounded text-[11px] font-bold uppercase hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                <Banknote size={12} /> {posting ? 'Posting...' : 'Post Settlement'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Settlement History ───────────────────────────────────── */}
        <DataGridCard
          columns={settleColumns}
          className="flex-1"
          loading={loading}
          emptyState={<span className="text-xs text-slate-300 font-bold">No settlements recorded yet.</span>}
        >
          {settlements.map((s, ri) => (
            <tr key={s.id} className={[
              'border-b border-slate-100 last:border-0',
              ri % 2 === 1 ? 'bg-slate-50/50' : 'bg-white',
              s.status === 'Reversed' ? 'opacity-50' : '',
              'hover:bg-slate-50/70 transition-colors',
            ].join(' ')}>
              <td className="py-1.5 px-3 text-xs font-bold text-blue-600">{s.id.replace('ICO-SETTLE-', 'S-')}</td>
              <td className="py-1.5 px-3 text-xs text-slate-600">{s.settlement_date}</td>
              <td className="py-1.5 px-3 text-xs font-bold text-slate-800">{s.from_company}</td>
              <td className="py-1.5 px-3 text-xs font-bold text-slate-800">{s.to_company}</td>
              <td className="py-1.5 px-3 text-xs font-black text-right text-slate-900">PKR {Number(s.amount).toLocaleString()}</td>
              <td className="py-1.5 px-3 text-xs text-slate-600">{s.method}</td>
              <td className="py-1.5 px-3 text-xs text-slate-500">{s.reference || '—'}</td>
              <td className="py-1.5 px-3 text-center">
                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                  s.status === 'Posted' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'
                }`}>{s.status}</span>
              </td>
              <td className="py-1.5 px-3">
                {s.status === 'Posted' && (
                  <button onClick={() => handleReverse(s.id)} title="Reverse Settlement" className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors">
                    <RotateCcw size={12} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </DataGridCard>
      </div>
    </div>
  );
};

export default IntercompanySettlement;
