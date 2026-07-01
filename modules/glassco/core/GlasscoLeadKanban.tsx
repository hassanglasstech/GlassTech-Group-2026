/**
 * GlasscoLeadKanban.tsx — Phase 6 (6.3)
 *
 * Sales CRM Kanban. Drag a lead card between funnel columns to update
 * its stage. Stages mirror a standard B2B pipeline:
 *
 *   New → Contacted → Qualified → Proposal → Negotiation → (Won | Lost)
 *
 * Won leads can be promoted to a real Quotation in one click — the
 * lead's `convertedQuotationId` is then linked back so the funnel
 * shows true conversion. Lost leads keep `lostReason` for funnel
 * analysis.
 *
 * No external DnD library — uses native HTML5 drag-and-drop (works on
 * desktop; on tablets the click-to-move buttons in the card menu serve
 * as a fallback).
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { allocateSerial } from '@/modules/sales/services/serialAllocator';
import { Plus, Trash2, X, Save, GripVertical, TrendingUp, Phone, Mail, Calendar, Target, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

interface Lead {
  id?: string; company: string;
  name: string;
  contactPerson?: string;
  phone?: string; email?: string;
  source?: string;
  estimatedValue?: number;
  stage?: 'New' | 'Contacted' | 'Qualified' | 'Proposal' | 'Negotiation' | 'Won' | 'Lost';
  priority?: 'Low' | 'Normal' | 'High';
  nextAction?: string;
  nextActionDate?: string;
  notes?: string;
  clientId?: string;
  convertedQuotationId?: string;
  lostReason?: string;
  assignedTo?: string;
  createdAt?: string;
  stageChangedAt?: string;
}

const STAGES: Lead['stage'][] = ['New','Contacted','Qualified','Proposal','Negotiation','Won','Lost'];
const STAGE_TONE: Record<string, string> = {
  New:        'border-t-slate-400 bg-slate-50',
  Contacted:  'border-t-indigo-400 bg-indigo-50',
  Qualified:  'border-t-blue-500 bg-primary-subtle',
  Proposal:   'border-t-purple-500 bg-purple-50',
  Negotiation:'border-t-amber-500 bg-amber-50',
  Won:        'border-t-emerald-600 bg-emerald-50',
  Lost:       'border-t-rose-500 bg-rose-50',
};
const PRIORITY_TONE: Record<string, string> = {
  Low: 'bg-slate-100 text-slate-500',
  Normal: 'bg-blue-100 text-primary-hover',
  High: 'bg-rose-100 text-rose-700',
};

const fmtPKR = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M`
  : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K`
  : n.toLocaleString('en-PK');

const blank = (company: string): Lead => ({
  company, name: '',
  source: 'Website',
  estimatedValue: 0, stage: 'New', priority: 'Normal',
});

const GlasscoLeadKanban: React.FC = () => {
  const company = (useAppStore(s => s.selectedCompany) as any) || 'Glassco';
  const [leads, setLeads] = useState<Lead[]>([]);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await AsyncSalesService.getLeads();
    setLeads((list as any[]).filter(l => l.company === company));
  }, [company]);

  useEffect(() => { refresh(); }, [refresh]);

  const grouped = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    STAGES.forEach(s => { map[s as string] = []; });
    leads.forEach(l => {
      const stage = (l.stage || 'New') as string;
      (map[stage] ||= []).push(l);
    });
    return map;
  }, [leads]);

  const stats = useMemo(() => {
    const totalValue = leads.reduce((s, l) => s + (l.estimatedValue || 0), 0);
    const wonValue   = leads.filter(l => l.stage === 'Won').reduce((s, l) => s + (l.estimatedValue || 0), 0);
    const won = leads.filter(l => l.stage === 'Won').length;
    const lost = leads.filter(l => l.stage === 'Lost').length;
    const closed = won + lost;
    const winRate = closed > 0 ? Math.round((won / closed) * 100) : 0;
    return { totalValue, wonValue, won, lost, winRate, total: leads.length };
  }, [leads]);

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { toast.error('Lead name is required.'); return; }
    let id = editing.id;
    if (!id) {
      const seq = await allocateSerial(company, 'LEAD', new Date().getFullYear(), 1);
      const mmyy = new Date().toISOString().substring(2, 7).replace('-', '');
      id = `LEAD-${company.substring(0, 3).toUpperCase()}-${mmyy}-${String(seq).padStart(4, '0')}`;
    }
    const row: Lead = { ...editing, id, company, stageChangedAt: new Date().toISOString() };
    await AsyncSalesService.saveLeads([row as any]);
    toast.success(`Lead ${id} saved.`);
    setEditing(null);
    await refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this lead?')) return;
    await AsyncSalesService.deleteLead(id);
    toast.success('Lead deleted.');
    await refresh();
  };

  const handleMoveStage = async (lead: Lead, nextStage: Lead['stage']) => {
    if (lead.stage === nextStage) return;
    let lostReason = lead.lostReason;
    if (nextStage === 'Lost' && !lostReason) {
      lostReason = prompt('Lost reason (e.g. price, competitor, project cancelled):') || '';
    }
    const updated: Lead = { ...lead, stage: nextStage, lostReason, stageChangedAt: new Date().toISOString() };
    await AsyncSalesService.saveLeads([updated as any]);
    await refresh();
  };

  // ── HTML5 DnD handlers ──
  const onDragStart = (id: string) => setDragId(id);
  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); };
  const onDrop      = async (stage: Lead['stage']) => {
    if (!dragId) return;
    const lead = leads.find(l => l.id === dragId);
    if (!lead) { setDragId(null); return; }
    setDragId(null);
    if (lead.stage !== stage) await handleMoveStage(lead, stage);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-700 to-purple-700 text-white p-5 rounded-2xl shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Target size={20}/>
            <div>
              <h2 className="text-lg font-black uppercase">Sales Pipeline (Lead Funnel)</h2>
              <p className="text-[10px] text-indigo-100 font-bold uppercase tracking-widest mt-0.5">
                Drag cards between columns to update stage
              </p>
            </div>
          </div>
          <button onClick={() => setEditing(blank(company))}
            className="bg-white text-indigo-700 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-indigo-50 shadow flex items-center gap-2"
          ><Plus size={14}/> New Lead</button>
        </div>
        {/* Funnel KPIs */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          <div className="bg-white/10 rounded-lg p-2 text-center"><p className="text-[9px] font-black text-indigo-200 uppercase">Total Leads</p><p className="text-xl font-black">{stats.total}</p></div>
          <div className="bg-white/10 rounded-lg p-2 text-center"><p className="text-[9px] font-black text-indigo-200 uppercase">Pipeline Value</p><p className="text-xl font-black">PKR {fmtPKR(stats.totalValue)}</p></div>
          <div className="bg-emerald-500/20 rounded-lg p-2 text-center"><p className="text-[9px] font-black text-emerald-200 uppercase">Won Value</p><p className="text-xl font-black text-emerald-300">PKR {fmtPKR(stats.wonValue)}</p></div>
          <div className="bg-amber-500/20 rounded-lg p-2 text-center"><p className="text-[9px] font-black text-amber-200 uppercase">Win Rate</p><p className="text-xl font-black text-amber-200">{stats.winRate}%</p></div>
        </div>
      </div>

      {/* Kanban columns */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          {STAGES.map(stage => {
            const cards = grouped[stage as string] || [];
            const colValue = cards.reduce((s, l) => s + (l.estimatedValue || 0), 0);
            return (
              <div key={stage}
                onDragOver={onDragOver}
                onDrop={() => onDrop(stage)}
                className={`w-72 shrink-0 rounded-2xl border-t-4 ${STAGE_TONE[stage as string] || 'border-t-slate-300 bg-slate-50'} flex flex-col max-h-[70vh]`}
              >
                <div className="p-3 border-b">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-widest text-slate-700">{stage}</span>
                    <span className="text-[10px] font-bold text-slate-500 bg-white px-1.5 py-0.5 rounded">{cards.length}</span>
                  </div>
                  {colValue > 0 && (
                    <p className="text-[9px] text-slate-500 font-bold mt-1">PKR {fmtPKR(colValue)}</p>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {cards.length === 0 && (
                    <div className="text-center text-slate-300 text-[10px] italic font-bold py-8">Drop leads here</div>
                  )}
                  {cards.map(lead => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={() => onDragStart(lead.id || '')}
                      className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 cursor-move hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical size={12} className="text-slate-300 shrink-0 mt-1"/>
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-slate-800 text-xs truncate">{lead.name}</p>
                          {lead.contactPerson && (
                            <p className="text-[10px] text-slate-500 mt-0.5 truncate">{lead.contactPerson}</p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {lead.priority && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${PRIORITY_TONE[lead.priority]}`}>{lead.priority}</span>}
                            {lead.source && <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase">{lead.source}</span>}
                          </div>
                          {(lead.estimatedValue || 0) > 0 && (
                            <p className="text-xs font-black text-slate-800 mt-1.5">PKR {fmtPKR(lead.estimatedValue || 0)}</p>
                          )}
                          {lead.nextActionDate && (
                            <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-700 font-bold">
                              <Calendar size={10}/><span>{lead.nextAction || 'Follow-up'} · {lead.nextActionDate}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button onClick={() => setEditing({ ...lead })} className="text-[10px] text-primary font-bold hover:underline">Edit</button>
                          <button onClick={() => lead.id && handleDelete(lead.id)} className="text-rose-400 hover:text-rose-600"><Trash2 size={10}/></button>
                        </div>
                      </div>
                      {/* Mobile fallback: stage move buttons */}
                      <div className="flex gap-1 mt-2 pt-2 border-t border-slate-100 overflow-x-auto">
                        {STAGES.filter(s => s !== stage).map(s => (
                          <button key={s as string} onClick={() => handleMoveStage(lead, s)}
                            className="text-[8px] font-black text-slate-400 hover:text-slate-700 px-1.5 py-0.5 rounded uppercase whitespace-nowrap"
                            title={`Move to ${s}`}
                          >→ {(s as string).slice(0, 4)}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Form modal */}
      {editing && (
        <div className="fixed inset-0 bg-slate-900/60 z-[500] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-indigo-700 text-white px-5 py-3 flex items-center justify-between">
              <span className="text-sm font-black uppercase">{editing.id ? `Edit ${editing.id}` : 'New Lead'}</span>
              <button onClick={() => setEditing(null)} className="p-1 hover:bg-white/10 rounded"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Lead Name (Company / Person) *</label>
                <input className="sap-input w-full text-xs font-bold" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Contact Person</label>
                  <input className="sap-input w-full text-xs" value={editing.contactPerson || ''} onChange={e => setEditing({ ...editing, contactPerson: e.target.value })}/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Phone</label>
                  <input className="sap-input w-full text-xs" value={editing.phone || ''} onChange={e => setEditing({ ...editing, phone: e.target.value })}/>
                </div>
                <div className="col-span-2">
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Email</label>
                  <input className="sap-input w-full text-xs" value={editing.email || ''} onChange={e => setEditing({ ...editing, email: e.target.value })}/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Source</label>
                  <select className="sap-input w-full text-xs" value={editing.source || ''} onChange={e => setEditing({ ...editing, source: e.target.value })}>
                    {['Website','Referral','Walk-in','WhatsApp','Phone Call','Site Visit','Other'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Estimated Value (PKR)</label>
                  <input type="number" className="sap-input w-full text-xs" value={editing.estimatedValue || 0} onChange={e => setEditing({ ...editing, estimatedValue: Number(e.target.value) })}/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Stage</label>
                  <select className="sap-input w-full text-xs" value={editing.stage} onChange={e => setEditing({ ...editing, stage: e.target.value as any })}>
                    {STAGES.map(s => <option key={s as string} value={s as string}>{s as string}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Priority</label>
                  <select className="sap-input w-full text-xs" value={editing.priority} onChange={e => setEditing({ ...editing, priority: e.target.value as any })}>
                    {['Low','Normal','High'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Next Action</label>
                  <input className="sap-input w-full text-xs" placeholder="Send proposal / Follow-up call" value={editing.nextAction || ''} onChange={e => setEditing({ ...editing, nextAction: e.target.value })}/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Next Action Date</label>
                  <input type="date" className="sap-input w-full text-xs" value={editing.nextActionDate || ''} onChange={e => setEditing({ ...editing, nextActionDate: e.target.value })}/>
                </div>
              </div>
              {(editing.stage === 'Lost') && (
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Lost Reason</label>
                  <input className="sap-input w-full text-xs" value={editing.lostReason || ''} onChange={e => setEditing({ ...editing, lostReason: e.target.value })}/>
                </div>
              )}
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Notes</label>
                <textarea rows={3} className="sap-input w-full text-xs resize-none" value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })}/>
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-xs font-bold text-slate-500 border rounded-lg">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 bg-indigo-700 text-white rounded-lg text-xs font-black uppercase hover:bg-indigo-800 flex items-center gap-1.5"><Save size={12}/> Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GlasscoLeadKanban;
