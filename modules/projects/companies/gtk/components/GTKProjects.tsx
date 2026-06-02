/**
 * GTKProjects.tsx — Phase 5
 * Project tracker for GTK and GTI (aluminium fabrication).
 * Uses shared ProjectPortfolio + CostControlSheet components.
 * GTK-specific: Job Order linking, profile type, section size, site address.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Company, Project, Client, PurchaseOrder } from '@/modules/shared/types';
import { ProjectService } from '@/modules/projects/services/projectService';
import { SalesService } from '@/modules/sales/services/salesService';
import { ProductionService } from '@/modules/production/services/productionService';
import { getGTKJobOrders } from '@/modules/sales/services/gtkJobOrderService';
import ProjectPortfolio from '@/modules/projects/components/ProjectPortfolio';
import CostControlSheet from '@/modules/projects/components/CostControlSheet';
import { useAuthStore } from '@/modules/auth/authStore';
import {
  Plus, X, Save, TrendingUp, TrendingDown, Package,
  Link2, CheckCircle2, Clock, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';

const fmt = (n: number) => Math.round(n).toLocaleString('en-PK');

// ── GL Cost Entry Modal ───────────────────────────────────────────────────────

const CostEntryModal: React.FC<{
  project: Project;
  company: Company;
  onClose: () => void;
  onSave: () => void;
}> = ({ project, company, onClose, onSave }) => {
  const [costType, setCostType] = useState<'Glass' | 'Aluminium' | 'Hardware' | 'Installation' | 'Other'>('Aluminium');
  const [amount,   setAmount]   = useState('');
  const [desc,     setDesc]     = useState('');

  const handlePost = () => {
    const amt = parseFloat(amount);
    if (!amt || !desc) { toast.error('Amount aur description required hai'); return; }
    ProjectService.postProjectCost({ projectId: project.id, company, costType, amount: amt, description: desc });
    onSave();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h3 className="font-black text-slate-800 text-sm uppercase">Post Project Cost</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">{project.title}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg"><X size={16}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Cost Type</label>
            <select value={costType} onChange={e => setCostType(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400">
              {['Aluminium','Glass','Hardware','Installation','Other'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Amount (PKR)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="e.g. 45000"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Description</label>
            <input value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="e.g. D2 Profile purchase — 200 RFT"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400" />
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t">
          <button onClick={onClose} className="flex-1 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50">Cancel</button>
          <button onClick={handlePost} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700">
            Post GL Entry
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Job Order Link Modal ──────────────────────────────────────────────────────

const JobOrderLinkModal: React.FC<{
  project: Project;
  company: Company;
  onClose: () => void;
  onLink: () => void;
}> = ({ project, company, onClose, onLink }) => {
  const [jobOrders, setJobOrders] = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    getGTKJobOrders(company).then(jos => { setJobOrders(jos); setLoading(false); });
  }, [company]);

  const handleLink = (joId: string) => {
    ProjectService.linkJobOrder(project.id, joId);
    onLink();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-black text-slate-800 text-sm uppercase">Link Job Order</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg"><X size={16}/></button>
        </div>
        <div className="p-2 max-h-80 overflow-y-auto">
          {loading && <div className="py-8 text-center text-slate-300 text-xs animate-pulse">Loading…</div>}
          {!loading && jobOrders.length === 0 && (
            <div className="py-8 text-center text-slate-300 text-xs">No job orders found for {company}</div>
          )}
          {!loading && jobOrders.map(jo => (
            <button key={jo.id} onClick={() => handleLink(jo.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 rounded-xl text-left transition-colors">
              <div>
                <p className="font-black text-blue-700 text-xs">{jo.id}</p>
                <p className="text-xs text-slate-600">{jo.clientName} — {jo.site}</p>
                <p className="text-[10px] text-slate-400">{jo.profileType} · {jo.totalSqft.toFixed(1)} sqft</p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${jo.status === 'Open' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                {jo.status}
              </span>
            </button>
          ))}
        </div>
        <div className="p-4 border-t">
          <button onClick={onClose} className="w-full py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50">Cancel</button>
        </div>
      </div>
    </div>
  );
};

// ── Project Detail Panel ──────────────────────────────────────────────────────

const GTKProjectDetail: React.FC<{
  project: Project;
  company: Company;
  clients: Client[];
  onClose: () => void;
  onRefresh: () => void;
}> = ({ project, company, clients, onClose, onRefresh }) => {
  const [showCostEntry,  setShowCostEntry]  = useState(false);
  const [showJobLink,    setShowJobLink]    = useState(false);
  const [finalValue,     setFinalValue]     = useState(String(project.finalSettlementValue || project.value || ''));

  const client       = clients.find(c => c.id === project.clientId);
  const totalConsumed = (project.glassConsumed || 0) + (project.aluminiumConsumed || 0) + (project.hardwareConsumed || 0) + (project.consumablesConsumed || 0) + (project.otherConsumed || 0);
  const revenue      = project.finalSettlementValue || project.value || 1;
  const profit       = revenue - totalConsumed;
  const margin       = revenue > 0 ? (profit / revenue) * 100 : 0;

  const handleComplete = async () => {
    if (!await confirmModal(`Complete project "${project.title}"?`)) return;
    ProjectService.completeProject(project.id, company, parseFloat(finalValue) || revenue);
    onRefresh();
    onClose();
  };

  const handleSaveValue = () => {
    const all = ProjectService.getProjects();
    const updated = all.map(p => p.id === project.id ? { ...p, finalSettlementValue: parseFloat(finalValue) || p.value } : p);
    ProjectService.saveProjects(updated);
    toast.success('Contract value updated');
    onRefresh();
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-40 p-4">
        <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-auto shadow-2xl">
          {/* Header */}
          <div className="flex items-start justify-between p-6 border-b bg-gradient-to-r from-slate-900 to-blue-900 rounded-t-2xl text-white">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${project.status === 'Active' ? 'bg-emerald-400 text-emerald-900' : 'bg-slate-400 text-slate-900'}`}>
                  {project.status}
                </span>
                <span className="text-blue-300 text-[10px] font-black">{project.id}</span>
                {project.manualRef && <span className="text-blue-300 text-[10px] font-black">· Ref: {project.manualRef}</span>}
              </div>
              <h3 className="font-black text-lg uppercase">{project.title}</h3>
              <p className="text-blue-200 text-xs">{client?.name || 'Unknown Client'}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg"><X size={18}/></button>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-4 gap-3 p-5 border-b bg-slate-50">
            {[
              { l: 'Contract Value', v: `₨ ${fmt(revenue)}`,        c: 'text-slate-800' },
              { l: 'Cost Consumed',  v: `₨ ${fmt(totalConsumed)}`,  c: 'text-rose-600'  },
              { l: profit >= 0 ? 'Gross Profit' : 'Loss', v: `₨ ${fmt(Math.abs(profit))}`, c: profit >= 0 ? 'text-emerald-600' : 'text-rose-600' },
              { l: 'Margin',         v: `${margin.toFixed(1)}%`,     c: margin >= 20 ? 'text-emerald-600' : margin >= 0 ? 'text-amber-600' : 'text-rose-600' },
            ].map(k => (
              <div key={k.l} className="bg-white rounded-xl border p-3">
                <p className="text-[9px] font-black text-slate-400 uppercase">{k.l}</p>
                <p className={`text-lg font-black mt-0.5 ${k.c}`}>{k.v}</p>
              </div>
            ))}
          </div>

          {/* Cost breakdown bars */}
          <div className="p-5 space-y-3 border-b">
            <h4 className="text-[9px] font-black text-slate-400 uppercase">Cost Breakdown vs Budget</h4>
            {[
              { l: 'Aluminium', budget: project.aluminiumValue || 0, actual: project.aluminiumConsumed || 0, c: 'bg-orange-500' },
              { l: 'Glass',     budget: project.glassValue || 0,     actual: project.glassConsumed || 0,     c: 'bg-blue-500'   },
              { l: 'Hardware',  budget: project.hardwareValue || 0,  actual: project.hardwareConsumed || 0,  c: 'bg-slate-600'  },
              { l: 'Install/Other', budget: project.installationValue || 0, actual: project.otherConsumed || 0, c: 'bg-purple-500' },
            ].filter(r => r.budget > 0 || r.actual > 0).map(r => {
              const pct = r.budget > 0 ? Math.min((r.actual / r.budget) * 100, 100) : 100;
              const over = r.actual > r.budget && r.budget > 0;
              return (
                <div key={r.l}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-bold text-slate-600">{r.l}</span>
                    <span className={over ? 'text-rose-600 font-black' : 'text-slate-500'}>
                      ₨ {fmt(r.actual)} / ₨ {fmt(r.budget)} {over && '⚠ Over'}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full">
                    <div className={`h-full rounded-full ${over ? 'bg-rose-500' : r.c}`} style={{ width: `${pct}%` }}/>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Timeline */}
          {(project.timeline || []).length > 0 && (
            <div className="p-5 border-b">
              <h4 className="text-[9px] font-black text-slate-400 uppercase mb-3">Activity Log</h4>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {[...(project.timeline || [])].reverse().map((t: any, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-slate-300 shrink-0 font-mono">{t.date}</span>
                    <span className={`font-medium ${t.type === 'alert' ? 'text-rose-600' : t.type === 'success' ? 'text-emerald-600' : 'text-slate-600'}`}>{t.event}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contract value edit */}
          <div className="p-5 border-b">
            <h4 className="text-[9px] font-black text-slate-400 uppercase mb-2">Contract Value</h4>
            <div className="flex gap-2">
              <input type="number" value={finalValue} onChange={e => setFinalValue(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400"
                placeholder="Final settlement amount" />
              <button onClick={handleSaveValue} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-700">
                <Save size={13}/>
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="p-5 flex gap-3 flex-wrap">
            <button onClick={() => setShowCostEntry(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700">
              <Plus size={13}/> Post Cost
            </button>
            <button onClick={() => setShowJobLink(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 text-white rounded-lg text-xs font-bold hover:bg-slate-600">
              <Link2 size={13}/> Link Job Order
            </button>
            {project.status === 'Active' && (
              <button onClick={handleComplete}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 ml-auto">
                <CheckCircle2 size={13}/> Mark Complete + Post Revenue
              </button>
            )}
          </div>
        </div>
      </div>

      {showCostEntry && (
        <CostEntryModal project={project} company={company} onClose={() => setShowCostEntry(false)} onSave={onRefresh} />
      )}
      {showJobLink && (
        <JobOrderLinkModal project={project} company={company} onClose={() => setShowJobLink(false)} onLink={onRefresh} />
      )}
    </>
  );
};

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

const GTKProjects: React.FC<{ company: Company }> = ({ company }) => {
  const [projects,       setProjects]       = useState<Project[]>([]);
  const [clients,        setClients]        = useState<Client[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [activeProject,  setActiveProject]  = useState<Project | null>(null);
  const [showDetail,     setShowDetail]     = useState(false);
  const [loading,        setLoading]        = useState(false);

  const refreshData = async () => {
    setLoading(true);
    await ProjectService.loadFromSupabase();
    setProjects(ProjectService.getProjects().filter(p => p.company === company)
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()));
    setClients(SalesService.getClients().filter(c => c.company === company));
    setPurchaseOrders(ProductionService.getPurchaseOrders().filter(p => p.fromCompany === company));
    setLoading(false);
  };

  useEffect(() => { refreshData(); }, [company]);

  const handleSelectProject = (p: Project) => {
    setActiveProject(p);
    setShowDetail(true);
  };

  // Stats
  const active    = projects.filter(p => p.status === 'Active').length;
  const completed = projects.filter(p => p.status === 'Completed').length;
  const totalRev  = projects.reduce((s, p) => s + (p.finalSettlementValue || p.value || 0), 0);

  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-blue-900 text-white p-6 rounded-[2rem] shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            
            <p className="text-[10px] text-blue-300 font-bold uppercase tracking-widest mt-0.5">
              Aluminium Fabrication · GL Integrated
            </p>
          </div>
          <div className="flex items-center gap-6 text-right">
            <div><p className="text-[9px] text-blue-300 font-black uppercase">Active</p><p className="text-2xl font-black text-blue-200">{active}</p></div>
            <div><p className="text-[9px] text-blue-300 font-black uppercase">Completed</p><p className="text-2xl font-black text-blue-200">{completed}</p></div>
            <div><p className="text-[9px] text-blue-300 font-black uppercase">Total Value</p><p className="text-2xl font-black text-emerald-300">₨ {fmt(totalRev)}</p></div>
            <button onClick={refreshData} disabled={loading}
              className="p-2 bg-white/10 rounded-xl hover:bg-white/20">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>
            </button>
          </div>
        </div>
      </div>

      {/* Project Portfolio (reuses shared component) */}
      <ProjectPortfolio
        projects={projects}
        clients={clients}
        onSelectProject={handleSelectProject}
        refreshData={refreshData}
        company={company}
      />

      {/* Detail panel */}
      {showDetail && activeProject && (
        <GTKProjectDetail
          project={activeProject}
          company={company}
          clients={clients}
          onClose={() => { setShowDetail(false); setActiveProject(null); }}
          onRefresh={() => { refreshData(); setShowDetail(false); setActiveProject(null); }}
        />
      )}
    </div>
  );
};

export default GTKProjects;
