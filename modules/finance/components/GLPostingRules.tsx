/**
 * GLPostingRules.tsx — Phase 3 (FC-04)
 *
 * Makes GL posting rules visible and editable without code changes.
 * Reads from / writes to gl_posting_rules table in Supabase.
 *
 * Replaces hardcoded account maps in financeService.ts SUBCAT_GL_MAP
 * with a DB-backed config the owner/accountant can update.
 */

import React, { useState, useEffect } from 'react';
import { Company } from '@/modules/shared/types/core';
import { FinanceService } from '@/modules/finance/services/financeService';
import { supabase } from '@/src/services/supabaseClient';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';
import { Settings2, Save, RotateCcw, Plus, Trash2, Info } from 'lucide-react';
import { toast } from 'sonner';

interface Props { company: Company; }

export interface PostingRule {
  id:           string;
  company:      Company;
  rule_key:     string;   // e.g. "GRN_INVENTORY" or "SALARY"
  description:  string;
  debit_code:   string;
  debit_name:   string;
  credit_code:  string;
  credit_name:  string;
  doc_type:     string;   // PV / JV / SA / KR / RV
  is_active:    boolean;
  updated_at?:  string;
}

// ── Built-in rules (seed) — mirrors financeService hardcoded maps ─────────────
const SEED_RULES: Omit<PostingRule, 'id' | 'updated_at'>[] = [
  {
    company: 'GTK' as Company,
    rule_key: 'GRN_INVENTORY',
    description: 'GRN Post — Stock receipt from vendor',
    debit_code: '11511', debit_name: 'Inventory — Raw Materials',
    credit_code: '21151', credit_name: 'GR/IR Clearing — Materials',
    doc_type: 'KR', is_active: true,
  },
  {
    company: 'GTK' as Company,
    rule_key: 'SALARY_POSTING',
    description: 'Monthly Payroll — Salary expense',
    debit_code: '51111', debit_name: 'Salaries & Wages',
    credit_code: '22111', credit_name: 'Salaries Payable',
    doc_type: 'PV', is_active: true,
  },
  {
    company: 'GTK' as Company,
    rule_key: 'SALES_INVOICE',
    description: 'Sales Invoice — AR + Revenue',
    debit_code: '12210', debit_name: 'Trade Receivables — Customers',
    credit_code: '41110', credit_name: 'Sales Revenue',
    doc_type: 'DR', is_active: true,
  },
  {
    company: 'GTK' as Company,
    rule_key: 'CREDIT_NOTE',
    description: 'Credit Note — Revenue reversal',
    debit_code: '41110', debit_name: 'Sales Revenue',
    credit_code: '12210', credit_name: 'Trade Receivables — Customers',
    doc_type: 'RV', is_active: true,
  },
  {
    company: 'Glassco' as Company,
    rule_key: 'GRN_GLASS',
    description: 'GlassCo GRN — Float glass inward',
    debit_code: '11511', debit_name: 'Glass Inventory — Raw',
    credit_code: '21151', credit_name: 'GR/IR Clearing — Glass',
    doc_type: 'KR', is_active: true,
  },
  {
    company: 'Glassco' as Company,
    rule_key: 'NCR_BREAKAGE',
    description: 'NCR Glass Breakage write-off',
    debit_code: '56113', debit_name: 'Glass Breakage & Write-off',
    credit_code: '11511', credit_name: 'Glass Inventory — Raw',
    doc_type: 'JV', is_active: true,
  },
];

const LS_KEY = (co: Company) => `gtk_erp_gl_posting_rules_${co}`;
const getRulesLocal = (co: Company): PostingRule[] => {
  try { return JSON.parse(localStorage.getItem(LS_KEY(co)) || '[]'); } catch { return []; }
};
const saveRulesLocal = (co: Company, d: PostingRule[]) =>
  localStorage.setItem(LS_KEY(co), JSON.stringify(d));

const DOC_TYPES = ['PV', 'JV', 'SA', 'KR', 'DR', 'RV', 'DZ', 'KZ'];

const GLPostingRules: React.FC<Props> = ({ company }) => {
  const [rules,    setRules]    = useState<PostingRule[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [draft,    setDraft]    = useState<Partial<PostingRule>>({});
  const [showAdd,  setShowAdd]  = useState(false);

  const load = async () => {
    setLoading(true);
    // Try Supabase first
    try {
      const { data, error } = await supabase
        .from('gl_posting_rules')
        .select('*')
        .eq('company', company)
        .order('rule_key');
      if (!error && data?.length) {
        setRules(data as PostingRule[]);
        saveRulesLocal(company, data as PostingRule[]);
        setLoading(false);
        setAccounts(FinanceService.getAccounts().filter((a: any) => a.company === company));
        return;
      }
    } catch {}
    // Fallback: localStorage + seed
    const local = getRulesLocal(company);
    if (local.length) {
      setRules(local);
    } else {
      const seeded = SEED_RULES
        .filter(r => r.company === company)
        .map(r => ({ ...r, id: `PR-${r.rule_key}-${company}` }));
      setRules(seeded as PostingRule[]);
      saveRulesLocal(company, seeded as PostingRule[]);
    }
    setAccounts(FinanceService.getAccounts().filter((a: any) => a.company === company));
    setLoading(false);
  };

  useEffect(() => { load(); }, [company]);

  const saveRule = async (rule: PostingRule) => {
    setSaving(true);
    const updated = { ...rule, updated_at: new Date().toISOString() };
    try {
      const { error } = await supabase
        .from('gl_posting_rules')
        .upsert(updated, { onConflict: 'id' });
      if (error) throw error;
    } catch {
      toast.warning('Saved locally — Supabase sync pending (run migration_006 first).');
    }
    const newRules = rules.map(r => r.id === updated.id ? updated : r);
    setRules(newRules);
    saveRulesLocal(company, newRules);
    setEditId(null);
    setSaving(false);
    toast.success(`Rule "${rule.rule_key}" saved.`);
  };

  const addRule = async () => {
    if (!draft.rule_key || !draft.debit_code || !draft.credit_code) {
      toast.error('Fill rule key, debit code, and credit code.'); return;
    }
    const newRule: PostingRule = {
      id:          `PR-${draft.rule_key}-${company}-${Date.now()}`,
      company,
      rule_key:    draft.rule_key!,
      description: draft.description || '',
      debit_code:  draft.debit_code!,
      debit_name:  draft.debit_name || '',
      credit_code: draft.credit_code!,
      credit_name: draft.credit_name || '',
      doc_type:    draft.doc_type || 'JV',
      is_active:   true,
    };
    await saveRule(newRule);
    setRules(prev => [...prev, newRule]);
    setShowAdd(false);
    setDraft({});
  };

  const deleteRule = async (rule: PostingRule) => {
    const ok = await confirmModal(`Delete rule "${rule.rule_key}"? This will not affect existing GL entries.`);
    if (!ok) return;
    try { await supabase.from('gl_posting_rules').delete().eq('id', rule.id); } catch {}
    const newRules = rules.filter(r => r.id !== rule.id);
    setRules(newRules);
    saveRulesLocal(company, newRules);
    toast.success('Rule deleted.');
  };

  const accountOptions = accounts.map((a: any) => ({
    id: a.id, code: a.code || '', name: a.name || '',
  })).sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      {/* Header */}
      <div className="bg-indigo-700 text-white p-6 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings2 size={20}/>
          <div>
            <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">
              {company} — GL Posting Rules
            </p>
            <p className="font-black text-lg">{rules.length} rules configured</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => load()} className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl">
            <RotateCcw size={16}/>
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white text-indigo-700 rounded-xl font-black uppercase text-xs hover:bg-indigo-50 shadow"
          >
            <Plus size={14}/> Add Rule
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Info size={16} className="text-blue-600 shrink-0 mt-0.5"/>
        <p className="text-xs text-blue-700">
          These rules control which GL accounts are debited/credited for each transaction type.
          Run <code className="bg-blue-100 px-1 rounded font-mono">migration_006_gl_posting_rules.sql</code> in Supabase
          to persist changes across all devices.
        </p>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white border-2 border-indigo-300 rounded-2xl p-6 space-y-4">
          <p className="font-black uppercase text-slate-700 text-sm">New Posting Rule</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Rule Key *</label>
              <input value={draft.rule_key || ''} onChange={e => setDraft(d => ({...d, rule_key: e.target.value.toUpperCase().replace(/\s/g,'_')}))} className="sap-input w-full font-mono" placeholder="e.g. FREIGHT_EXPENSE"/>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Doc Type</label>
              <select value={draft.doc_type || 'JV'} onChange={e => setDraft(d => ({...d, doc_type: e.target.value}))} className="sap-input w-full font-bold">
                {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Description</label>
              <input value={draft.description || ''} onChange={e => setDraft(d => ({...d, description: e.target.value}))} className="sap-input w-full" placeholder="Human readable description"/>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Debit Account Code *</label>
              <input value={draft.debit_code || ''} onChange={e => setDraft(d => ({...d, debit_code: e.target.value}))} className="sap-input w-full font-mono" placeholder="e.g. 51214"/>
              <input value={draft.debit_name || ''} onChange={e => setDraft(d => ({...d, debit_name: e.target.value}))} className="sap-input w-full text-xs mt-1" placeholder="Account name"/>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Credit Account Code *</label>
              <input value={draft.credit_code || ''} onChange={e => setDraft(d => ({...d, credit_code: e.target.value}))} className="sap-input w-full font-mono" placeholder="e.g. 11112"/>
              <input value={draft.credit_name || ''} onChange={e => setDraft(d => ({...d, credit_name: e.target.value}))} className="sap-input w-full text-xs mt-1" placeholder="Account name"/>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => { setShowAdd(false); setDraft({}); }} className="flex-1 py-2 border rounded-xl text-slate-500 font-black uppercase text-xs">Cancel</button>
            <button onClick={addRule} className="flex-1 py-2 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs hover:bg-indigo-700">Add Rule</button>
          </div>
        </div>
      )}

      {/* Rules table */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 animate-pulse font-black uppercase text-xs">Loading rules…</div>
      ) : (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <table className="w-full sap-table">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left">Rule Key</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-left">Doc</th>
                <th className="px-4 py-3 text-left">Debit Account</th>
                <th className="px-4 py-3 text-left">Credit Account</th>
                <th className="px-4 py-3 text-center">Active</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => (
                <tr key={rule.id}>
                  {editId === rule.id ? (
                    <td colSpan={7} className="px-4 py-4">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Description</label>
                          <input value={draft.description ?? rule.description} onChange={e => setDraft(d => ({...d, description: e.target.value}))} className="sap-input w-full text-xs"/>
                        </div>
                        <div>
                          <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Debit Code</label>
                          <input value={draft.debit_code ?? rule.debit_code} onChange={e => setDraft(d => ({...d, debit_code: e.target.value}))} className="sap-input w-full font-mono text-xs"/>
                        </div>
                        <div>
                          <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Credit Code</label>
                          <input value={draft.credit_code ?? rule.credit_code} onChange={e => setDraft(d => ({...d, credit_code: e.target.value}))} className="sap-input w-full font-mono text-xs"/>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => { setEditId(null); setDraft({}); }} className="px-4 py-1.5 border rounded-lg text-xs font-black text-slate-500">Cancel</button>
                        <button onClick={() => saveRule({ ...rule, ...draft as Partial<PostingRule> })} disabled={saving} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-black flex items-center gap-1"><Save size={12}/> Save</button>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-mono font-black text-indigo-700 text-xs">{rule.rule_key}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{rule.description || '—'}</td>
                      <td className="px-4 py-3"><span className="text-[9px] font-black px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-mono">{rule.doc_type}</span></td>
                      <td className="px-4 py-3 font-mono text-xs text-emerald-700 font-black">{rule.debit_code} <span className="text-slate-400 font-normal">{rule.debit_name}</span></td>
                      <td className="px-4 py-3 font-mono text-xs text-rose-700 font-black">{rule.credit_code} <span className="text-slate-400 font-normal">{rule.credit_name}</span></td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${rule.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                          {rule.is_active ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setEditId(rule.id); setDraft({}); }} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Settings2 size={14}/></button>
                          <button onClick={() => deleteRule(rule)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={14}/></button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {rules.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-slate-300 italic text-sm">No rules configured. Add rules above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default GLPostingRules;
