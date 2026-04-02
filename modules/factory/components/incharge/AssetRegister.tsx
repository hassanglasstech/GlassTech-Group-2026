import React, { useEffect, useState } from 'react';
import {
  Plus, Loader2, Search, ChevronDown, X, CheckCircle2, Wrench, XCircle, Trash2
} from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';

// ── Types ─────────────────────────────────────────────────────────────
type AssetStatus   = 'Active' | 'Maintenance' | 'Inactive' | 'Disposed';
type AssetCategory = 'Machine' | 'Table' | 'Tool' | 'Vehicle' | 'Furniture' | 'Other';
type Company       = 'GlassCo' | 'GTK' | 'GTI' | 'Factory' | 'Nippon';

interface Asset {
  id: string;
  company: Company;
  category: AssetCategory;
  name: string;
  model?: string;
  serial_no?: string;
  location?: string;
  status: AssetStatus;
  purchased_on?: string;
  purchase_cost: number;
  notes?: string;
  created_at: string;
}

const COMPANIES: Company[]       = ['GlassCo', 'GTK', 'GTI', 'Factory', 'Nippon'];
const CATEGORIES: AssetCategory[] = ['Machine', 'Table', 'Tool', 'Vehicle', 'Furniture', 'Other'];
const STATUSES: AssetStatus[]    = ['Active', 'Maintenance', 'Inactive', 'Disposed'];

const STATUS_STYLE: Record<AssetStatus, string> = {
  Active:      'bg-green-500/20 text-green-400 border-green-500/30',
  Maintenance: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Inactive:    'bg-slate-500/20 text-slate-400 border-slate-500/30',
  Disposed:    'bg-red-500/20 text-red-400 border-red-500/30',
};

const EMPTY: Omit<Asset, 'id' | 'created_at'> = {
  company: 'Factory', category: 'Machine', name: '',
  model: '', serial_no: '', location: '', status: 'Active',
  purchased_on: '', purchase_cost: 0, notes: '',
};

// ── Component ─────────────────────────────────────────────────────────
const AssetRegister: React.FC = () => {
  const [assets, setAssets]       = useState<Asset[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterCo, setFilterCo]   = useState<Company | 'All'>('All');
  const [filterCat, setFilterCat] = useState<AssetCategory | 'All'>('All');
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({ ...EMPTY });
  const [saving, setSaving]       = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('factory_assets')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setAssets(data as Asset[]);
    setLoading(false);
  };

  const filtered = assets.filter(a => {
    const matchCo  = filterCo  === 'All' || a.company  === filterCo;
    const matchCat = filterCat === 'All' || a.category === filterCat;
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase())
      || a.model?.toLowerCase().includes(search.toLowerCase())
      || a.serial_no?.toLowerCase().includes(search.toLowerCase());
    return matchCo && matchCat && matchSearch;
  });

  const openAdd = () => { setForm({ ...EMPTY }); setEditId(null); setShowForm(true); };
  const openEdit = (a: Asset) => {
    setForm({ company: a.company, category: a.category, name: a.name, model: a.model ?? '',
      serial_no: a.serial_no ?? '', location: a.location ?? '', status: a.status,
      purchased_on: a.purchased_on ?? '', purchase_cost: a.purchase_cost, notes: a.notes ?? '' });
    setEditId(a.id); setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = { ...form, updated_at: new Date().toISOString() };
    if (editId) {
      await supabase.from('factory_assets').update(payload).eq('id', editId);
    } else {
      await supabase.from('factory_assets').insert({ ...payload, created_at: new Date().toISOString() });
    }
    await load();
    setShowForm(false);
    setSaving(false);
  };

  const updateStatus = async (id: string, status: AssetStatus) => {
    await supabase.from('factory_assets').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    setAssets(prev => prev.map(a => a.id === id ? { ...a, status } : a));
  };

  // KPIs
  const active      = assets.filter(a => a.status === 'Active').length;
  const maintenance = assets.filter(a => a.status === 'Maintenance').length;

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Asset Register</h2>
          <p className="text-xs text-slate-500 mt-0.5">Machines · Tables · Tools · Vehicles</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-white text-slate-900 font-bold text-xs px-4 py-2 rounded-xl hover:bg-slate-100 transition-all">
          <Plus size={14} /> Add Asset
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-white">{assets.length}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Total</div>
        </div>
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-green-400">{active}</div>
          <div className="text-[10px] text-green-400 uppercase tracking-widest mt-0.5">Active</div>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-yellow-400">{maintenance}</div>
          <div className="text-[10px] text-yellow-400 uppercase tracking-widest mt-0.5">Maintenance</div>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 bg-slate-800 rounded-xl px-3 py-2">
          <Search size={14} className="text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search assets..."
            className="flex-1 bg-transparent text-white text-sm placeholder-slate-500 outline-none" />
        </div>
        <div className="flex gap-2">
          <select value={filterCo} onChange={e => setFilterCo(e.target.value as Company | 'All')}
            className="flex-1 bg-slate-800 text-white text-xs rounded-xl px-3 py-2 outline-none">
            <option value="All">All Companies</option>
            {COMPANIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value as AssetCategory | 'All')}
            className="flex-1 bg-slate-800 text-white text-xs rounded-xl px-3 py-2 outline-none">
            <option value="All">All Categories</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white">{editId ? 'Edit Asset' : 'Add Asset'}</span>
            <button onClick={() => setShowForm(false)}><X size={16} className="text-slate-400" /></button>
          </div>

          {[
            { label: 'Name *', key: 'name', type: 'text', placeholder: 'e.g. Cutting Table #3' },
            { label: 'Model', key: 'model', type: 'text', placeholder: 'Model number' },
            { label: 'Serial No', key: 'serial_no', type: 'text', placeholder: 'Serial number' },
            { label: 'Location', key: 'location', type: 'text', placeholder: 'e.g. Production Floor' },
            { label: 'Purchase Cost (PKR)', key: 'purchase_cost', type: 'number', placeholder: '0' },
            { label: 'Purchased On', key: 'purchased_on', type: 'date', placeholder: '' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs text-slate-400 mb-1 block">{f.label}</label>
              <input type={f.type} placeholder={f.placeholder}
                value={(form as any)[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20" />
            </div>
          ))}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Company</label>
              <select value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value as Company }))}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none">
                {COMPANIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Category</label>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value as AssetCategory }))}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Status</label>
            <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as AssetStatus }))}
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none">
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={2} className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none resize-none" />
          </div>

          <button onClick={save} disabled={saving || !form.name.trim()}
            className="w-full bg-white text-slate-900 font-black py-3 rounded-xl text-sm uppercase tracking-wider hover:bg-slate-100 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : editId ? 'Update' : 'Save Asset'}
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">No assets found</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(asset => (
            <div key={asset.id} className="bg-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white text-sm">{asset.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {asset.category} · {asset.company}
                    {asset.location && ` · ${asset.location}`}
                  </div>
                  {asset.model && <div className="text-xs text-slate-600 mt-0.5">{asset.model} {asset.serial_no && `· SN: ${asset.serial_no}`}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_STYLE[asset.status]}`}>
                    {asset.status}
                  </span>
                  <button onClick={() => openEdit(asset)} className="text-slate-500 hover:text-white transition-colors">
                    <Wrench size={13} />
                  </button>
                </div>
              </div>

              {/* Quick status change */}
              <div className="flex gap-1">
                {STATUSES.filter(s => s !== asset.status).map(s => (
                  <button key={s} onClick={() => updateStatus(asset.id, s)}
                    className="text-[10px] px-2 py-1 rounded-lg bg-slate-700 text-slate-400 hover:bg-slate-600 transition-all">
                    → {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AssetRegister;
