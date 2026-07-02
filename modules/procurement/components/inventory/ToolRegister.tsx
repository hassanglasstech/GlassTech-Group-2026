/**
 * ToolRegister.tsx — Session 4
 * Tool tracking: Register, Assign, Return, Write-off
 * Covers: Hand tools, Power tools, Measuring, Installer kits
 * GL: Purchase → 12113 Fab Tools | Write-off → Dr 56113 / Cr 12113
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { toast } from 'sonner';
import { safeParse, safeSave } from '@/modules/shared/services/utils';
import { SyncService } from '@/src/services/SyncService';
import { FinanceService } from '@/modules/finance/services/financeService';
import { HRService } from '@/modules/hr/services/hrService';
import { useRealtimeRefresh } from '@/modules/shared/hooks/useRealtimeRefresh';
import {
  Tool, ToolCategory, ToolStatus, ToolCondition, ToolHistoryEntry,
  ToolService
} from '@/modules/procurement/services/toolService';
import {
  Plus, Search, Wrench, UserCircle, ArrowLeftRight, AlertTriangle,
  Trash2, X, CheckCircle2, Package, Shield, Filter,
  ChevronDown, ChevronUp, Edit2, RotateCcw, XCircle
} from 'lucide-react';

// ── Using shared types from toolService.ts ───────────────────────────

// ── Storage via ToolService ──────────────────────────────────────────
const getTools = ToolService.getTools;
const saveTools = ToolService.saveTools;

// ── Constants ────────────────────────────────────────────────────────
const CATEGORIES: ToolCategory[] = ['Hand Tool', 'Power Tool', 'Measuring', 'Cutting', 'Safety', 'Installer Kit'];
const CONDITIONS: ToolCondition[] = ['New', 'Good', 'Fair', 'Poor', 'Broken'];
const STATUS_COLORS: Record<ToolStatus, string> = {
  'Available':   'bg-emerald-100 text-emerald-700',
  'Assigned':    'bg-blue-100 text-blue-700',
  'Maintenance': 'bg-amber-100 text-amber-700',
  'Lost':        'bg-red-100 text-red-700',
  'Damaged':     'bg-orange-100 text-orange-700',
  'Written Off': 'bg-slate-100 text-slate-500',
};

// ═══════════════════════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════════════════════

const ToolRegister: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [tools, setTools] = useState<Tool[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [activeView, setActiveView] = useState<'list' | 'kits'>('list');

  // Modals
  const [showRegister, setShowRegister] = useState(false);
  const [showAssign, setShowAssign] = useState<Tool | null>(null);
  const [showReturn, setShowReturn] = useState<Tool | null>(null);
  const [showWriteOff, setShowWriteOff] = useState<Tool | null>(null);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  // Employees for assignment
  const [employees, setEmployees] = useState<any[]>([]);


  const { refreshKey } = useRealtimeRefresh(['store_items', 'requisitions']);

  useEffect(() => {
    setTools(getTools().filter(t => t.company === company));
    try {
      setEmployees(HRService.getEmployees().filter(e => e.company === company && !['resigned', 'terminated'].includes(e.work?.status || '')));
    } catch { setEmployees([]); }
  }, [company, refreshKey]);

  const refresh = () => setTools(getTools().filter(t => t.company === company));

  // ── Filtered list ───────────────────────────────────────────────────
  const filteredTools = useMemo(() => {
    return tools.filter(t => {
      if (filterCategory !== 'All' && t.category !== filterCategory) return false;
      if (filterStatus !== 'All' && t.status !== filterStatus) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q) ||
               (t.assignedTo || '').toLowerCase().includes(q) || (t.brand || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [tools, searchTerm, filterCategory, filterStatus]);

  // ── Stats ───────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: tools.length,
    available: tools.filter(t => t.status === 'Available').length,
    assigned: tools.filter(t => t.status === 'Assigned').length,
    lost: tools.filter(t => t.status === 'Lost' || t.status === 'Damaged').length,
    totalValue: tools.filter(t => t.status !== 'Written Off').reduce((s, t) => s + t.purchaseCost, 0),
  }), [tools]);

  // ── Installer kits view ─────────────────────────────────────────────
  const installerKits = useMemo(() => {
    const assigned = tools.filter(t => t.status === 'Assigned' && t.assignedTo);
    const map: Record<string, Tool[]> = {};
    for (const t of assigned) {
      const key = t.assignedTo!;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [tools]);

  // ═══════════════════════════════════════════════════════════════════
  //  ACTIONS
  // ═══════════════════════════════════════════════════════════════════

  // ── Register New Tool ──────────────────────────────────────────────
  const [regForm, setRegForm] = useState({
    name: '', category: 'Hand Tool' as ToolCategory, brand: '', model: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    purchaseCost: 0, storageBin: 'GTK-TOOL-STORE', qty: 1,
  });

  const handleRegister = () => {
    if (!regForm.name) return toast.error('Tool name is required');
    const all = getTools();
    const existingCount = all.filter(t => t.company === company).length;

    const newTools: Tool[] = [];
    for (let i = 0; i < regForm.qty; i++) {
      const seqNo = String(existingCount + i + 1).padStart(3, '0');
      const toolId = `TOOL-${company.slice(0,3)}-${seqNo}`;

      newTools.push({
        id: toolId, company,
        name: regForm.name.toUpperCase(),
        category: regForm.category,
        brand: regForm.brand || undefined,
        model: regForm.model || undefined,
        purchaseDate: regForm.purchaseDate,
        purchaseCost: regForm.purchaseCost,
        currentCondition: 'New',
        status: 'Available',
        storageBin: regForm.storageBin,
        history: [{
          date: new Date().toISOString(),
          action: 'Registered',
          details: `Registered. Cost: PKR ${regForm.purchaseCost}. Category: ${regForm.category}`,
          by: 'System',
        }],
      });
    }

    saveTools([...all, ...newTools]);
    toast.success(`${newTools.length} tool(s) registered: ${newTools.map(t => t.id).join(', ')}`);
    setShowRegister(false);
    setRegForm({ name: '', category: 'Hand Tool', brand: '', model: '',
      purchaseDate: new Date().toISOString().split('T')[0], purchaseCost: 0,
      storageBin: 'GTK-TOOL-STORE', qty: 1 });
    refresh();
  };

  // ── Assign Tool ────────────────────────────────────────────────────
  const [assignForm, setAssignForm] = useState({ to: '', project: '' });

  const handleAssign = () => {
    if (!showAssign || !assignForm.to) return toast.error('Select who to assign');
    const all = getTools();
    const idx = all.findIndex(t => t.id === showAssign.id);
    if (idx === -1) return;

    all[idx] = {
      ...all[idx],
      status: 'Assigned',
      assignedTo: assignForm.to,
      assignedDate: new Date().toISOString().split('T')[0],
      assignedProject: assignForm.project || undefined,
      history: [...all[idx].history, {
        date: new Date().toISOString(),
        action: 'Assigned',
        details: `Assigned to ${assignForm.to}${assignForm.project ? ` for project: ${assignForm.project}` : ''}`,
        by: 'System',
      }],
    };

    saveTools(all);
    toast.success(`${showAssign.name} assigned to ${assignForm.to}`);
    setShowAssign(null);
    setAssignForm({ to: '', project: '' });
    refresh();
  };

  // ── Return Tool ────────────────────────────────────────────────────
  const [returnCondition, setReturnCondition] = useState<ToolCondition>('Good');

  const handleReturn = () => {
    if (!showReturn) return;
    const all = getTools();
    const idx = all.findIndex(t => t.id === showReturn.id);
    if (idx === -1) return;

    all[idx] = {
      ...all[idx],
      status: returnCondition === 'Broken' ? 'Damaged' : 'Available',
      currentCondition: returnCondition,
      assignedTo: undefined,
      assignedDate: undefined,
      assignedProject: undefined,
      history: [...all[idx].history, {
        date: new Date().toISOString(),
        action: 'Returned',
        details: `Returned by ${showReturn.assignedTo}. Condition: ${returnCondition}`,
        by: 'System',
      }],
    };

    saveTools(all);
    toast.success(`${showReturn.name} returned. Condition: ${returnCondition}`);
    setShowReturn(null);
    setReturnCondition('Good');
    refresh();
  };

  // ── Write Off Tool ─────────────────────────────────────────────────
  const [writeOffReason, setWriteOffReason] = useState('');

  const handleWriteOff = () => {
    if (!showWriteOff || !writeOffReason) return toast.error('Write-off reason is required');
    const all = getTools();
    const idx = all.findIndex(t => t.id === showWriteOff.id);
    if (idx === -1) return;

    const tool = all[idx];
    const today = new Date().toISOString().split('T')[0];

    // GL Entry: Dr 56113 Inventory Write-Off / Cr 12113 Fab Tools
    let glId = '';
    if (tool.purchaseCost > 0) {
      try {
        const glTx = {
          id: `GL-WO-${tool.id}`,
          company,
          docType: 'JV' as const,
          docDate: today,
          date: today,
          description: `TOOL WRITE-OFF: ${tool.name} (${tool.id}) — ${writeOffReason}`.toUpperCase(),
          referenceId: tool.id,
          status: 'Parked' as const,
          details: [
            { accountId: `${company}-56113`, debit: tool.purchaseCost, credit: 0, text: 'Tool Write-off Expense' },
            { accountId: `${company}-12113`, debit: 0, credit: tool.purchaseCost, text: 'Fab Tools & Equipment' },
          ],
        };
        const allGL = FinanceService.getLedger();
        allGL.push(glTx as any);
        FinanceService.saveLedger(allGL);
        SyncService.markDirty('ledger');
        glId = glTx.id;
      } catch (e) {
        console.error('GL write-off failed:', e);
      }
    }

    all[idx] = {
      ...tool,
      status: 'Written Off',
      currentCondition: 'Broken',
      writeOffDate: today,
      writeOffReason,
      writeOffGlId: glId || undefined,
      assignedTo: undefined,
      assignedDate: undefined,
      assignedProject: undefined,
      history: [...tool.history, {
        date: new Date().toISOString(),
        action: 'Written Off',
        details: `Written off: ${writeOffReason}. Cost: PKR ${tool.purchaseCost}${glId ? `. GL: ${glId}` : ''}`,
        by: 'System',
      }],
    };

    saveTools(all);
    toast.success(`${tool.name} written off.${glId ? ' Parked GL entry created.' : ''}`);
    setShowWriteOff(null);
    setWriteOffReason('');
    refresh();
  };

  // ═══════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* ── Stats Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl border p-5">
          <p className="text-[10px] font-black uppercase text-slate-400">Total Tools</p>
          <p className="text-2xl font-black text-slate-800">{stats.total}</p>
        </div>
        <div className="bg-white rounded-2xl border p-5">
          <p className="text-[10px] font-black uppercase text-emerald-500">Available</p>
          <p className="text-2xl font-black text-emerald-600">{stats.available}</p>
        </div>
        <div className="bg-white rounded-2xl border p-5">
          <p className="text-[10px] font-black uppercase text-blue-500">Assigned</p>
          <p className="text-2xl font-black text-blue-600">{stats.assigned}</p>
        </div>
        <div className="bg-white rounded-2xl border p-5">
          <p className="text-[10px] font-black uppercase text-red-500">Lost / Damaged</p>
          <p className="text-2xl font-black text-red-600">{stats.lost}</p>
        </div>
        <div className="bg-white rounded-2xl border p-5">
          <p className="text-[10px] font-black uppercase text-slate-400">Asset Value</p>
          <p className="text-2xl font-black text-slate-800">PKR {stats.totalValue.toLocaleString()}</p>
        </div>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input type="text" placeholder="Search tools, IDs, assigned to..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <select className="px-3 py-2.5 bg-slate-50 border rounded-xl text-xs font-bold"
          value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="All">All Categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="px-3 py-2.5 bg-slate-50 border rounded-xl text-xs font-bold"
          value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="All">All Status</option>
          <option>Available</option><option>Assigned</option>
          <option>Maintenance</option><option>Lost</option><option>Damaged</option><option>Written Off</option>
        </select>
        <button onClick={() => setActiveView(activeView === 'list' ? 'kits' : 'list')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold border ${activeView === 'kits' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'text-slate-500'}`}>
          {activeView === 'kits' ? 'Installer Kits' : 'Show Kits'}
        </button>
        <button onClick={() => setShowRegister(true)}
          className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center space-x-2">
          <Plus size={14} /><span>Register Tool</span>
        </button>
      </div>

      {/* ═══ LIST VIEW ═══════════════════════════════════════════════ */}
      {activeView === 'list' && (
        <div className="bg-white rounded-2xl border overflow-hidden">
          {filteredTools.length === 0 ? (
            <div className="p-12 text-center">
              <Wrench size={40} className="mx-auto text-slate-200 mb-3" />
              <p className="text-sm font-bold text-slate-400">No tools registered yet</p>
              <p className="text-xs text-slate-300 mt-1">Click "Register Tool" to start tracking</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    <th className="px-4 py-3 text-left">Tool ID</th>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-center">Condition</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-left">Assigned To</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                    <th className="px-4 py-3 text-center w-40">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTools.map(tool => (
                    <React.Fragment key={tool.id}>
                      <tr className="border-b border-slate-50 hover:bg-blue-50/30 cursor-pointer"
                        onClick={() => setExpandedTool(expandedTool === tool.id ? null : tool.id)}>
                        <td className="px-4 py-3 font-black text-blue-600">{tool.id}</td>
                        <td className="px-4 py-3 font-bold text-slate-800">
                          {tool.name}
                          {tool.brand && <span className="text-slate-400 ml-1">({tool.brand})</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 bg-slate-100 rounded-full text-[9px] font-black text-slate-600">{tool.category}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-[9px] font-black ${
                            tool.currentCondition === 'New' || tool.currentCondition === 'Good' ? 'text-emerald-600' :
                            tool.currentCondition === 'Fair' ? 'text-amber-600' : 'text-red-600'
                          }`}>{tool.currentCondition}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${STATUS_COLORS[tool.status]}`}>
                            {tool.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-600">{tool.assignedTo || '—'}</td>
                        <td className="px-4 py-3 text-right font-bold">PKR {tool.purchaseCost.toLocaleString()}</td>
                        <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center space-x-1">
                            {tool.status === 'Available' && (
                              <button onClick={() => { setShowAssign(tool); setAssignForm({ to: '', project: '' }); }}
                                className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg" title="Assign">
                                <UserCircle size={14} />
                              </button>
                            )}
                            {tool.status === 'Assigned' && (
                              <button onClick={() => { setShowReturn(tool); setReturnCondition('Good'); }}
                                className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg" title="Return">
                                <RotateCcw size={14} />
                              </button>
                            )}
                            {(tool.status === 'Available' || tool.status === 'Damaged' || tool.status === 'Lost') && (
                              <button onClick={() => { setShowWriteOff(tool); setWriteOffReason(''); }}
                                className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg" title="Write Off">
                                <XCircle size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Expanded: History */}
                      {expandedTool === tool.id && (
                        <tr><td colSpan={8} className="bg-slate-50 px-6 py-4">
                          <p className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest">History</p>
                          <div className="space-y-1.5">
                            {tool.history.slice().reverse().map((h, i) => (
                              <div key={i} className="flex items-center space-x-3 text-xs">
                                <span className="text-slate-400 font-bold w-20 shrink-0">{h.date.split('T')[0]}</span>
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black ${
                                  h.action === 'Assigned' ? 'bg-blue-100 text-blue-700' :
                                  h.action === 'Returned' ? 'bg-emerald-100 text-emerald-700' :
                                  h.action === 'Written Off' ? 'bg-red-100 text-red-700' :
                                  'bg-slate-100 text-slate-600'
                                }`}>{h.action}</span>
                                <span className="text-slate-600 font-medium">{h.details}</span>
                              </div>
                            ))}
                          </div>
                        </td></tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ INSTALLER KITS VIEW ═════════════════════════════════════ */}
      {activeView === 'kits' && (
        <div className="space-y-4">
          {installerKits.length === 0 ? (
            <div className="bg-white rounded-2xl border p-12 text-center">
              <Shield size={40} className="mx-auto text-slate-200 mb-3" />
              <p className="text-sm font-bold text-slate-400">No tools assigned to anyone yet</p>
            </div>
          ) : (
            installerKits.map(([person, personTools]) => (
              <div key={person} className="bg-white rounded-2xl border overflow-hidden">
                <div className="px-6 py-4 bg-slate-50 border-b flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-blue-100 rounded-xl"><UserCircle size={18} className="text-blue-600" /></div>
                    <div>
                      <h3 className="text-sm font-black uppercase text-slate-800">{person}</h3>
                      <p className="text-[10px] font-bold text-slate-400">{personTools.length} tools assigned</p>
                    </div>
                  </div>
                  <p className="text-sm font-black text-slate-600">
                    PKR {personTools.reduce((s, t) => s + t.purchaseCost, 0).toLocaleString()}
                  </p>
                </div>
                <div className="divide-y divide-slate-50">
                  {personTools.map(t => (
                    <div key={t.id} className="px-6 py-3 flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <Wrench size={14} className="text-slate-400" />
                        <span className="text-xs font-bold text-slate-800">{t.name}</span>
                        <span className="text-[9px] font-bold text-slate-400">{t.id}</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        {t.assignedProject && (
                          <span className="text-[9px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded">{t.assignedProject}</span>
                        )}
                        <span className="text-[9px] text-slate-400 font-bold">Since {t.assignedDate}</span>
                        <button onClick={() => { setShowReturn(t); setReturnCondition('Good'); }}
                          className="p-1 text-emerald-500 hover:bg-emerald-50 rounded" title="Return">
                          <RotateCcw size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ═══ REGISTER MODAL ══════════════════════════════════════════ */}
      {showRegister && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-xl shadow-2xl overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Wrench size={18} /><h3 className="text-sm font-black uppercase tracking-wide">Register New Tool</h3>
              </div>
              <button onClick={() => setShowRegister(false)} className="p-1 hover:bg-white/10 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Tool Name</label>
                  <input type="text" className="sap-input w-full font-bold uppercase" placeholder="e.g. BOSCH GRINDER 4 INCH"
                    value={regForm.name} onChange={e => setRegForm({...regForm, name: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Category</label>
                  <select className="sap-input w-full font-bold" value={regForm.category}
                    onChange={e => setRegForm({...regForm, category: e.target.value as ToolCategory})}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Brand</label>
                  <input type="text" className="sap-input w-full font-bold" placeholder="Optional"
                    value={regForm.brand} onChange={e => setRegForm({...regForm, brand: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Purchase Date</label>
                  <input type="date" className="sap-input w-full font-bold"
                    value={regForm.purchaseDate} onChange={e => setRegForm({...regForm, purchaseDate: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Cost (PKR)</label>
                  <input type="number" className="sap-input w-full font-bold"
                    value={regForm.purchaseCost || ''} onChange={e => setRegForm({...regForm, purchaseCost: Number(e.target.value)})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Quantity</label>
                  <input type="number" className="sap-input w-full font-bold" min={1}
                    value={regForm.qty} onChange={e => setRegForm({...regForm, qty: Math.max(1, Number(e.target.value))})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Storage Location</label>
                  <input type="text" className="sap-input w-full font-bold"
                    value={regForm.storageBin} onChange={e => setRegForm({...regForm, storageBin: e.target.value})} />
                </div>
              </div>
              <button onClick={handleRegister}
                className="w-full py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center space-x-2">
                <CheckCircle2 size={16} /><span>Register {regForm.qty > 1 ? `${regForm.qty} Tools` : 'Tool'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ASSIGN MODAL ════════════════════════════════════════════ */}
      {showAssign && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-blue-600 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <UserCircle size={18} /><h3 className="text-sm font-black uppercase">Assign: {showAssign.name}</h3>
              </div>
              <button onClick={() => setShowAssign(null)} className="p-1 hover:bg-white/10 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Assign To</label>
                <select className="sap-input w-full font-bold uppercase" value={assignForm.to}
                  onChange={e => setAssignForm({...assignForm, to: e.target.value})}>
                  <option value="">— Select Worker —</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.name || emp.id}>{emp.name || emp.id} — {emp.designation || emp.department || ''}</option>
                  ))}
                  <option value="__OTHER__">Other (type name)</option>
                </select>
                {assignForm.to === '__OTHER__' && (
                  <input type="text" className="sap-input w-full font-bold uppercase mt-2" placeholder="Enter name"
                    onChange={e => setAssignForm({...assignForm, to: e.target.value})} />
                )}
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Project / Site (optional)</label>
                <input type="text" className="sap-input w-full font-bold uppercase" placeholder="e.g. DEFENCE PHASE 5"
                  value={assignForm.project} onChange={e => setAssignForm({...assignForm, project: e.target.value})} />
              </div>
              <button onClick={handleAssign}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 flex items-center justify-center space-x-2">
                <CheckCircle2 size={16} /><span>Assign Tool</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ RETURN MODAL ════════════════════════════════════════════ */}
      {showReturn && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-emerald-600 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <RotateCcw size={18} /><h3 className="text-sm font-black uppercase">Return: {showReturn.name}</h3>
              </div>
              <button onClick={() => setShowReturn(null)} className="p-1 hover:bg-white/10 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500 font-bold">Assigned to: <span className="text-slate-800">{showReturn.assignedTo}</span></p>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Return Condition</label>
                <select className="sap-input w-full font-bold" value={returnCondition}
                  onChange={e => setReturnCondition(e.target.value as ToolCondition)}>
                  {CONDITIONS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              {returnCondition === 'Broken' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-[10px] font-black text-red-600">Tool will be marked as DAMAGED. You can write it off from the main list.</p>
                </div>
              )}
              <button onClick={handleReturn}
                className="w-full py-3 bg-emerald-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-emerald-700 flex items-center justify-center space-x-2">
                <CheckCircle2 size={16} /><span>Confirm Return</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ WRITE-OFF MODAL ═════════════════════════════════════════ */}
      {showWriteOff && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-red-600 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <XCircle size={18} /><h3 className="text-sm font-black uppercase">Write Off: {showWriteOff.name}</h3>
              </div>
              <button onClick={() => setShowWriteOff(null)} className="p-1 hover:bg-white/10 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
                <p className="text-xs font-bold text-red-700">This action is permanent. Tool value will be expensed.</p>
                <p className="text-xs text-red-600">
                  GL Entry: Dr 56113 Inventory Write-Off / Cr 12113 Fab Tools — PKR {showWriteOff.purchaseCost.toLocaleString()}
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Write-off Reason (required)</label>
                <select className="sap-input w-full font-bold" value={writeOffReason}
                  onChange={e => setWriteOffReason(e.target.value)}>
                  <option value="">— Select Reason —</option>
                  <option>Lost on site</option>
                  <option>Stolen</option>
                  <option>Beyond repair</option>
                  <option>Normal wear and tear</option>
                  <option>Worker negligence</option>
                  <option>Accident/breakage</option>
                  <option>Other</option>
                </select>
              </div>
              <button onClick={handleWriteOff}
                disabled={!writeOffReason}
                className="w-full py-3 bg-red-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-red-700 disabled:opacity-50 flex items-center justify-center space-x-2">
                <AlertTriangle size={16} /><span>Confirm Write-Off</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolRegister;
