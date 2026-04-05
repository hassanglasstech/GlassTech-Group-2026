import React, { useState, useEffect, useRef } from 'react';
import { useDebounce } from '@/modules/shared/hooks/useDebounce';
import { Plus, Search, Wrench, Package, Truck, Monitor, Edit2, Trash2, X, Save, Clock, BarChart3, Download, Upload, FileDown, Zap } from 'lucide-react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { toast } from 'sonner';
import { FinanceService } from '@/modules/finance/services/financeService';
import * as XLSX from 'xlsx';
import { SyncService } from '@/src/services/SyncService';
import { useRealtimeRefresh } from '@/modules/shared/hooks/useRealtimeRefresh';

// ── Types ─────────────────────────────────────────────────────────────
type AssetCategory = 'Machinery' | 'Vehicle' | 'Tool' | 'Furniture' | 'IT Equipment' | 'Other';
type AssetStatus = 'Active' | 'Under Maintenance' | 'Disposed' | 'Idle';

interface MaintenanceLog {
  id: string;
  date: string;
  description: string;
  cost: number;
  vendor: string;
  nextDueDate?: string;
  performedBy: string;
}

interface Asset {
  id: string;
  company: string;
  name: string;
  category: AssetCategory;
  serialNo: string;
  purchaseDate: string;
  purchaseCost: number;
  usefulLife: number; // years
  status: AssetStatus;
  location: string;
  assignedTo: string;
  depreciationMethod: 'Straight Line' | 'Declining Balance';
  maintenanceLogs: MaintenanceLog[];
  notes: string;
}

const ASSET_KEY = 'gtk_erp_assets';

const safeParse = (key: string): any[] => {
  try {
    const item = localStorage.getItem(key);
    if (!item) return [];
    const parsed = JSON.parse(item);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

const CATEGORIES: AssetCategory[] = ['Machinery', 'Vehicle', 'Tool', 'Furniture', 'IT Equipment', 'Other'];
const STATUSES: AssetStatus[] = ['Active', 'Under Maintenance', 'Disposed', 'Idle'];

const getCategoryIcon = (cat: AssetCategory) => {
  switch(cat) {
    case 'Machinery': return <Package size={16} className="text-orange-600" />;
    case 'Vehicle': return <Truck size={16} className="text-blue-600" />;
    case 'Tool': return <Wrench size={16} className="text-slate-600" />;
    case 'IT Equipment': return <Monitor size={16} className="text-purple-600" />;
    default: return <Package size={16} className="text-slate-500" />;
  }
};

const getStatusColor = (status: AssetStatus) => {
  switch(status) {
    case 'Active': return 'bg-emerald-100 text-emerald-700';
    case 'Under Maintenance': return 'bg-amber-100 text-amber-700';
    case 'Disposed': return 'bg-rose-100 text-rose-700';
    case 'Idle': return 'bg-slate-100 text-slate-600';
  }
};

// ── Depreciation Calculator ────────────────────────────────────────────
const calculateDepreciation = (asset: Asset) => {
  const purchaseDate = new Date(asset.purchaseDate);
  const today = new Date();
  const yearsElapsed = (today.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
  const annualDep = asset.purchaseCost / asset.usefulLife;
  const accumulated = Math.min(annualDep * yearsElapsed, asset.purchaseCost);
  const netBookValue = Math.max(asset.purchaseCost - accumulated, 0);
  return { annualDep, accumulated, netBookValue, yearsElapsed };
};

// ── Main Component ─────────────────────────────────────────────────────
const AssetManagement: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [depRunning, setDepRunning] = useState(false);


  const { refreshKey } = useRealtimeRefresh(['assets']);

  useEffect(() => {
    const all = safeParse(ASSET_KEY).filter((a: Asset) => a.company === company);
    setAssets(all);
  }, [company, refreshKey]);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [activeTab, setActiveTab] = useState<'register' | 'maintenance' | 'summary'>('register');

  // Modals
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  const emptyAsset: Partial<Asset> = {
    company, name: '', category: 'Machinery', serialNo: '', 
    purchaseDate: new Date().toISOString().split('T')[0],
    purchaseCost: 0, usefulLife: 5, status: 'Active',
    location: '', assignedTo: '', depreciationMethod: 'Straight Line',
    maintenanceLogs: [], notes: ''
  };
  const [assetForm, setAssetForm] = useState<Partial<Asset>>(emptyAsset);

  const emptyLog: Partial<MaintenanceLog> = {
    date: new Date().toISOString().split('T')[0],
    description: '', cost: 0, vendor: '', performedBy: '', nextDueDate: ''
  };
  const [logForm, setLogForm] = useState<Partial<MaintenanceLog>>(emptyLog);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Export Functions ────────────────────────────────────────────────
  const handleExportExcel = () => {
    const rows = assets.map(a => ({
      ID: a.id, Company: a.company, Name: a.name, Category: a.category,
      SerialNo: a.serialNo, PurchaseDate: a.purchaseDate, PurchaseCost: a.purchaseCost,
      UsefulLife: a.usefulLife, Status: a.status, Location: a.location,
      AssignedTo: a.assignedTo, DepreciationMethod: a.depreciationMethod, Notes: a.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Assets');

    // Maintenance logs on separate sheet
    const logs = assets.flatMap(a => a.maintenanceLogs.map(l => ({
      AssetID: a.id, AssetName: a.name, LogID: l.id,
      Date: l.date, Description: l.description, Cost: l.cost,
      Vendor: l.vendor, PerformedBy: l.performedBy, NextDueDate: l.nextDueDate || '',
    })));
    if (logs.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(logs);
      XLSX.utils.book_append_sheet(wb, ws2, 'Maintenance Logs');
    }
    XLSX.writeFile(wb, `${company}_Assets_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast.success('Excel exported');
  };

  const handleExportJSON = () => {
    const json = JSON.stringify(assets, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${company}_Assets_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('JSON exported');
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);
        const imported: Asset[] = rows.map((row, i) => ({
          id: row.ID || `AST-IMP-${Date.now()}-${i}`,
          company,
          name: row.Name || '',
          category: (row.Category as AssetCategory) || 'Other',
          serialNo: row.SerialNo || '',
          purchaseDate: row.PurchaseDate || new Date().toISOString().split('T')[0],
          purchaseCost: Number(row.PurchaseCost) || 0,
          usefulLife: Number(row.UsefulLife) || 5,
          status: (row.Status as AssetStatus) || 'Active',
          location: row.Location || '',
          assignedTo: row.AssignedTo || '',
          depreciationMethod: row.DepreciationMethod || 'Straight Line',
          maintenanceLogs: [],
          notes: row.Notes || '',
        }));
        const merged = [...assets.filter(a => !imported.find(i => i.id === a.id)), ...imported];
        saveAssets(merged);
        toast.success(`${imported.length} assets imported`);
      } catch {
        toast.error('Import failed — check file format');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const saveAssets = (data: Asset[]) => {
    const all = safeParse(ASSET_KEY);
    const others = all.filter((a: Asset) => a.company !== company);
    localStorage.setItem(ASSET_KEY, JSON.stringify([...others, ...data]));
    SyncService.markDirty('assets');
    setAssets(data);
  };

  const handleSaveAsset = () => {
    if (!assetForm.name) return toast.error('Asset name required');
    const all = [...assets];
    if (editingAsset) {
      const idx = all.findIndex(a => a.id === editingAsset.id);
      all[idx] = { ...editingAsset, ...assetForm } as Asset;
    } else {
      all.push({ ...assetForm, id: `AST-${Date.now()}`, company, maintenanceLogs: [] } as Asset);
    }
    saveAssets(all);
    setIsAssetModalOpen(false);
    setEditingAsset(null);
    setAssetForm(emptyAsset);
    toast.success('Asset saved');
  };

  const handleSaveLog = () => {
    if (!selectedAsset || !logForm.description) return toast.error('Description required');
    const log: MaintenanceLog = { ...logForm, id: `LOG-${Date.now()}` } as MaintenanceLog;
    const updated = assets.map(a => a.id === selectedAsset.id
      ? { ...a, maintenanceLogs: [...a.maintenanceLogs, log], status: 'Active' as AssetStatus }
      : a
    );
    saveAssets(updated);
    setIsMaintenanceModalOpen(false);
    setLogForm(emptyLog);
    toast.success('Maintenance log added');
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this asset?')) return;
    saveAssets(assets.filter(a => a.id !== id));
    toast.success('Asset deleted');
  };

  const filtered = assets.filter(a =>
    (filterCategory === 'All' || a.category === filterCategory) &&
    (filterStatus === 'All' || a.status === filterStatus) &&
    (a.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
     a.serialNo.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
     a.location.toLowerCase().includes(debouncedSearchTerm.toLowerCase()))
  );

  // Summary stats
  const totalCost = assets.reduce((s, a) => s + a.purchaseCost, 0);
  const totalNBV = assets.reduce((s, a) => s + calculateDepreciation(a).netBookValue, 0);
  const underMaintenance = assets.filter(a => a.status === 'Under Maintenance').length;
  const allLogs = assets.flatMap(a => a.maintenanceLogs.map(l => ({ ...l, assetName: a.name, assetId: a.id })));
  const totalMaintenanceCost = allLogs.reduce((s, l) => s + l.cost, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
        <div>
          
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{company} — Fixed Assets & Tools Register</p>
        </div>
        <div className="flex items-center space-x-2">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleImportExcel} className="hidden"/>
          <button onClick={() => fileInputRef.current?.click()}
            className="border border-slate-200 bg-white text-slate-600 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 flex items-center space-x-2">
            <Upload size={14}/><span>Import Excel</span>
          </button>
          <button onClick={handleExportExcel}
            className="border border-slate-200 bg-white text-slate-600 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 flex items-center space-x-2">
            <Download size={14}/><span>Excel</span>
          </button>
          <button onClick={handleExportJSON}
            className="border border-slate-200 bg-white text-slate-600 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 flex items-center space-x-2">
            <FileDown size={14}/><span>JSON</span>
          </button>
          <button onClick={() => { setEditingAsset(null); setAssetForm({...emptyAsset, company}); setIsAssetModalOpen(true); }}
            className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-blue-600 transition-all flex items-center space-x-2">
            <Plus size={14}/><span>Add Asset</span>
          </button>
          <button
            disabled={depRunning}
            onClick={async () => {
              setDepRunning(true);
              try {
                const month = new Date().toISOString().slice(0, 7); // YYYY-MM
                const result = FinanceService.postDepreciation(company, month);
                if (result.posted === 0 && result.skipped > 0) {
                  toast.info(`Depreciation already posted for ${month} — ${result.skipped} assets skipped`);
                } else if (result.posted === 0) {
                  toast.warning('No active assets found for depreciation');
                } else {
                  toast.success(`Depreciation posted — ${result.posted} assets | ${month}`);
                }
              } catch (e) {
                toast.error('Depreciation posting failed');
              } finally {
                setDepRunning(false);
              }
            }}
            className="bg-amber-600 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-amber-700 transition-all flex items-center space-x-2 disabled:opacity-50">
            <Zap size={14}/><span>{depRunning ? 'Posting…' : 'Run Depreciation'}</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Assets', value: assets.length, color: 'text-slate-800' },
          { label: 'Total Cost', value: `PKR ${totalCost.toLocaleString()}`, color: 'text-blue-600' },
          { label: 'Net Book Value', value: `PKR ${Math.round(totalNBV).toLocaleString()}`, color: 'text-emerald-600' },
          { label: 'Under Maintenance', value: underMaintenance, color: 'text-amber-600' },
        ].map(s => (
          <div key={s.label} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{s.label}</p>
            <p className={`text-xl font-black mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm w-fit">
        {(['register', 'maintenance', 'summary'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg font-bold text-xs uppercase tracking-wide transition-all ${activeTab === tab ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            {tab === 'register' ? 'Asset Register' : tab === 'maintenance' ? 'Maintenance Log' : 'Depreciation'}
          </button>
        ))}
      </div>

      {/* Filters */}
      {activeTab === 'register' && (
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
            <input type="text" placeholder="Search assets..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 w-64"/>
          </div>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500">
            <option value="All">All Categories</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500">
            <option value="All">All Statuses</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      )}

      {/* Asset Register Tab */}
      {activeTab === 'register' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-500 tracking-widest">
              <tr>
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Purchase Cost</th>
                <th className="px-4 py-3">Net Book Value</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Maintenance</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-16 text-center text-slate-300 font-black uppercase text-xs">No assets found</td></tr>
              ) : filtered.map(asset => {
                const dep = calculateDepreciation(asset);
                const lastLog = asset.maintenanceLogs.slice(-1)[0];
                return (
                  <tr key={asset.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        {getCategoryIcon(asset.category)}
                        <div>
                          <p className="font-bold text-slate-900 text-xs">{asset.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{asset.serialNo || asset.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className="text-[10px] font-black uppercase text-slate-600">{asset.category}</span></td>
                    <td className="px-4 py-3"><span className="text-xs font-bold text-slate-600">{asset.location || '—'}</span></td>
                    <td className="px-4 py-3"><span className="text-xs font-black text-slate-800">PKR {asset.purchaseCost.toLocaleString()}</span></td>
                    <td className="px-4 py-3"><span className="text-xs font-black text-emerald-600">PKR {Math.round(dep.netBookValue).toLocaleString()}</span></td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${getStatusColor(asset.status)}`}>{asset.status}</span></td>
                    <td className="px-4 py-3">
                      {lastLog ? (
                        <div>
                          <p className="text-[10px] font-bold text-slate-600">{lastLog.date}</p>
                          {lastLog.nextDueDate && <p className="text-[9px] font-bold text-amber-600">Next: {lastLog.nextDueDate}</p>}
                        </div>
                      ) : <span className="text-[10px] text-slate-300 font-bold">No records</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setSelectedAsset(asset); setIsMaintenanceModalOpen(true); }}
                          className="p-1.5 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg" title="Add Maintenance Log">
                          <Wrench size={13}/>
                        </button>
                        <button onClick={() => { setEditingAsset(asset); setAssetForm(asset); setIsAssetModalOpen(true); }}
                          className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg">
                          <Edit2 size={13}/>
                        </button>
                        <button onClick={() => handleDelete(asset.id)}
                          className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg">
                          <Trash2 size={13}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Maintenance Log Tab */}
      {activeTab === 'maintenance' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-500 tracking-widest">
              <tr>
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">Performed By</th>
                <th className="px-4 py-3">Cost</th>
                <th className="px-4 py-3">Next Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allLogs.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-16 text-center text-slate-300 font-black uppercase text-xs">No maintenance records</td></tr>
              ) : allLogs.sort((a, b) => b.date.localeCompare(a.date)).map(log => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3"><span className="text-xs font-black text-slate-800">{log.assetName}</span></td>
                  <td className="px-4 py-3"><span className="text-xs font-bold text-slate-500">{log.date}</span></td>
                  <td className="px-4 py-3"><span className="text-xs font-bold text-slate-700">{log.description}</span></td>
                  <td className="px-4 py-3"><span className="text-xs font-bold text-slate-600">{log.vendor || '—'}</span></td>
                  <td className="px-4 py-3"><span className="text-xs font-bold text-slate-600">{log.performedBy || '—'}</span></td>
                  <td className="px-4 py-3"><span className="text-xs font-black text-rose-600">PKR {log.cost.toLocaleString()}</span></td>
                  <td className="px-4 py-3">{log.nextDueDate ? <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded">{log.nextDueDate}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {allLogs.length > 0 && (
            <div className="px-4 py-3 bg-slate-50 border-t flex justify-end">
              <span className="text-xs font-black text-rose-600">Total Maintenance Cost: PKR {totalMaintenanceCost.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}

      {/* Depreciation Tab */}
      {activeTab === 'summary' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-500 tracking-widest">
              <tr>
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3">Purchase Cost</th>
                <th className="px-4 py-3">Useful Life</th>
                <th className="px-4 py-3">Annual Dep.</th>
                <th className="px-4 py-3">Accumulated Dep.</th>
                <th className="px-4 py-3">Net Book Value</th>
                <th className="px-4 py-3">Method</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assets.filter(a => a.status !== 'Disposed').map(asset => {
                const dep = calculateDepreciation(asset);
                return (
                  <tr key={asset.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="text-xs font-black text-slate-800">{asset.name}</p>
                      <p className="text-[10px] text-slate-400">{asset.category}</p>
                    </td>
                    <td className="px-4 py-3"><span className="text-xs font-bold">PKR {asset.purchaseCost.toLocaleString()}</span></td>
                    <td className="px-4 py-3"><span className="text-xs font-bold">{asset.usefulLife} yrs</span></td>
                    <td className="px-4 py-3"><span className="text-xs font-bold text-amber-600">PKR {Math.round(dep.annualDep).toLocaleString()}</span></td>
                    <td className="px-4 py-3"><span className="text-xs font-bold text-rose-600">PKR {Math.round(dep.accumulated).toLocaleString()}</span></td>
                    <td className="px-4 py-3"><span className="text-xs font-black text-emerald-600">PKR {Math.round(dep.netBookValue).toLocaleString()}</span></td>
                    <td className="px-4 py-3"><span className="text-[10px] font-bold text-slate-500">{asset.depreciationMethod}</span></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 border-t">
              <tr>
                <td className="px-4 py-3 text-xs font-black text-slate-700" colSpan={4}>TOTALS</td>
                <td className="px-4 py-3 text-xs font-black text-rose-600">PKR {Math.round(assets.reduce((s,a) => s + calculateDepreciation(a).accumulated, 0)).toLocaleString()}</td>
                <td className="px-4 py-3 text-xs font-black text-emerald-600">PKR {Math.round(totalNBV).toLocaleString()}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Asset Modal */}
      {isAssetModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[500]">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col border border-slate-200">
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center shrink-0 rounded-t-2xl">
              <h3 className="font-black uppercase tracking-widest text-sm">{editingAsset ? 'Edit Asset' : 'Register New Asset'}</h3>
              <button onClick={() => setIsAssetModalOpen(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
            </div>
            <div className="overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1"><label className="text-[10px] font-black uppercase text-slate-500">Asset Name</label>
                  <input type="text" className="sap-input w-full font-bold" value={assetForm.name || ''} onChange={e => setAssetForm({...assetForm, name: e.target.value})} placeholder="e.g. CNC Machine #3"/></div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-500">Category</label>
                  <select className="sap-input w-full font-bold" value={assetForm.category} onChange={e => setAssetForm({...assetForm, category: e.target.value as AssetCategory})}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-500">Status</label>
                  <select className="sap-input w-full font-bold" value={assetForm.status} onChange={e => setAssetForm({...assetForm, status: e.target.value as AssetStatus})}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-500">Serial No.</label>
                  <input type="text" className="sap-input w-full font-mono font-bold" value={assetForm.serialNo || ''} onChange={e => setAssetForm({...assetForm, serialNo: e.target.value})} placeholder="SN-XXXXX"/></div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-500">Location</label>
                  <input type="text" className="sap-input w-full font-bold" value={assetForm.location || ''} onChange={e => setAssetForm({...assetForm, location: e.target.value})} placeholder="e.g. Factory Floor A"/></div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-500">Purchase Date</label>
                  <input type="date" className="sap-input w-full font-bold" value={assetForm.purchaseDate || ''} onChange={e => setAssetForm({...assetForm, purchaseDate: e.target.value})}/></div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-500">Purchase Cost (PKR)</label>
                  <input type="number" className="sap-input w-full font-black text-blue-600" value={assetForm.purchaseCost || ''} onChange={e => setAssetForm({...assetForm, purchaseCost: Number(e.target.value)})}/></div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-500">Useful Life (Years)</label>
                  <input type="number" className="sap-input w-full font-bold" value={assetForm.usefulLife || ''} onChange={e => setAssetForm({...assetForm, usefulLife: Number(e.target.value)})}/></div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-500">Depreciation Method</label>
                  <select className="sap-input w-full font-bold" value={assetForm.depreciationMethod} onChange={e => setAssetForm({...assetForm, depreciationMethod: e.target.value as any})}>
                    <option>Straight Line</option><option>Declining Balance</option></select></div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-500">Assigned To</label>
                  <input type="text" className="sap-input w-full font-bold" value={assetForm.assignedTo || ''} onChange={e => setAssetForm({...assetForm, assignedTo: e.target.value})} placeholder="Department or Person"/></div>
                <div className="col-span-2 space-y-1"><label className="text-[10px] font-black uppercase text-slate-500">Notes</label>
                  <textarea className="sap-input w-full h-16 font-bold" value={assetForm.notes || ''} onChange={e => setAssetForm({...assetForm, notes: e.target.value})} placeholder="Any additional notes..."/></div>
              </div>
            </div>
            <div className="px-6 py-4 bg-white border-t flex justify-end space-x-3 shrink-0 rounded-b-2xl">
              <button onClick={() => setIsAssetModalOpen(false)} className="sap-btn-ghost">Cancel</button>
              <button onClick={handleSaveAsset} className="sap-btn-primary flex items-center space-x-2"><Save size={14}/><span>Save Asset</span></button>
            </div>
          </div>
        </div>
      )}

      {/* Maintenance Log Modal */}
      {isMaintenanceModalOpen && selectedAsset && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[500]">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col border border-slate-200 max-h-[90vh]">
            <div className="px-6 py-4 bg-amber-600 text-white flex justify-between items-center shrink-0 rounded-t-2xl">
              <div>
                <h3 className="font-black uppercase tracking-widest text-sm">Add Maintenance Log</h3>
                <p className="text-[10px] font-bold text-amber-200 mt-0.5">{selectedAsset.name}</p>
              </div>
              <button onClick={() => setIsMaintenanceModalOpen(false)} className="text-amber-200 hover:text-white"><X size={20}/></button>
            </div>
            <div className="overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-500">Date</label>
                  <input type="date" className="sap-input w-full font-bold" value={logForm.date || ''} onChange={e => setLogForm({...logForm, date: e.target.value})}/></div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-500">Cost (PKR)</label>
                  <input type="number" className="sap-input w-full font-black text-rose-600" value={logForm.cost || ''} onChange={e => setLogForm({...logForm, cost: Number(e.target.value)})}/></div>
                <div className="col-span-2 space-y-1"><label className="text-[10px] font-black uppercase text-slate-500">Description</label>
                  <input type="text" className="sap-input w-full font-bold" value={logForm.description || ''} onChange={e => setLogForm({...logForm, description: e.target.value})} placeholder="e.g. Oil change, belt replacement..."/></div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-500">Vendor / Service Provider</label>
                  <input type="text" className="sap-input w-full font-bold" value={logForm.vendor || ''} onChange={e => setLogForm({...logForm, vendor: e.target.value})}/></div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-500">Performed By</label>
                  <input type="text" className="sap-input w-full font-bold" value={logForm.performedBy || ''} onChange={e => setLogForm({...logForm, performedBy: e.target.value})}/></div>
                <div className="col-span-2 space-y-1"><label className="text-[10px] font-black uppercase text-slate-500">Next Maintenance Due Date</label>
                  <input type="date" className="sap-input w-full font-bold" value={logForm.nextDueDate || ''} onChange={e => setLogForm({...logForm, nextDueDate: e.target.value})}/></div>
              </div>
            </div>
            <div className="px-6 py-4 bg-white border-t flex justify-end space-x-3 shrink-0 rounded-b-2xl">
              <button onClick={() => setIsMaintenanceModalOpen(false)} className="sap-btn-ghost">Cancel</button>
              <button onClick={handleSaveLog} className="bg-amber-600 text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-amber-700 flex items-center space-x-2"><Save size={14}/><span>Save Log</span></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(AssetManagement);
