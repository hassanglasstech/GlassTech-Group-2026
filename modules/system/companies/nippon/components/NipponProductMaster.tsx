
import React, { useState, useMemo } from 'react';
import { Company, Product } from '@/modules/shared/types';
import { SalesService } from '@/modules/sales/services/salesService';
import { 
  Layout, Plus, Trash2, Edit2, 
  Layers, PenTool, Weight, Coins, X, Anchor, PaintBucket, Wrench,
  PanelTop, DoorOpen, Grid3X3, ArrowRight, ScanBarcode, Box
} from 'lucide-react';
import { toast } from 'sonner';

const NipponProductMaster: React.FC<{ company: Company }> = ({ company }) => {
  const [navSection, setNavSection] = useState<'Window' | 'Door' | 'Facade' | 'Other'>('Window');
  const [activeTab, setActiveTab] = useState<'Systems' | 'Glass' | 'Hardware' | 'Finish' | 'Accessory'>('Systems');
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);
  
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [profileForm, setProfileForm] = useState({
    system: '', 
    type: 'Non-Thermal' as 'Thermal' | 'Non-Thermal', 
    application: 'Window' as 'Window' | 'Door' | 'Facade' | 'Other', 
    role: 'Frame' as 'Frame' | 'Sash' | 'Mullion' | 'Bead' | 'Interlock' | 'Screen' | 'Adaptor',
    name: '',
    gtCode: '',
    jmCode: '', 
    weight: '',
    length: 16,
    rate: ''
  });

  const [glassForm, setGlassForm] = useState({ name: '', type: 'Tempered', thickness: '6mm', rate: '' });
  const [generalForm, setGeneralForm] = useState({ name: '', brand: '', rate: '', unit: 'Set' });

  React.useEffect(() => {
    refreshData();
  }, [company]);

  const refreshData = () => {
    setProducts(SalesService.getProducts().filter(p => p.company === company));
  };

  const systems = useMemo(() => {
    const validProfiles = products.filter(p => 
      p.category === 'Profile' && 
      (p.subCategory === navSection || (!p.subCategory && navSection === 'Window'))
    );
    const sysNames = new Set(validProfiles.map(p => p.serviceNick).filter(Boolean));
    return Array.from(sysNames) as string[];
  }, [products, navSection]);

  const filteredItems = useMemo(() => {
    if (activeTab === 'Systems') {
        return products.filter(p => 
            p.category === 'Profile' && 
            p.serviceNick === selectedSystem &&
            (p.subCategory === navSection || (!p.subCategory && navSection === 'Window'))
        );
    }
    if (activeTab === 'Glass') return products.filter(p => p.category === 'Glass');
    return products.filter(p => p.category === activeTab);
  }, [products, activeTab, selectedSystem, navSection]);

  const handleSaveItem = () => {
    let newProduct: Product;
    const commonId = editingId || `${activeTab.substring(0,3).toUpperCase()}-${Date.now()}`;

    if (activeTab === 'Systems') {
        if (!profileForm.system || !profileForm.name || !profileForm.weight) return toast.error("Required fields missing");
        newProduct = {
            id: commonId, company, category: 'Profile',
            description: profileForm.name.toUpperCase(),
            serviceNick: profileForm.system.toUpperCase(),
            subCategory: profileForm.application,
            systemSubClass: profileForm.type,
            profileRole: profileForm.role,
            profileCode: profileForm.gtCode.toUpperCase(),
            modelNo: profileForm.jmCode.toUpperCase(),
            thickness: profileForm.weight,
            sheetSize: profileForm.length.toString(),
            costPrice: Number(profileForm.rate), basePrice: 0, unit: 'KG', variants: []
        };
    } else if (activeTab === 'Glass') {
        if (!glassForm.name || !glassForm.rate) return toast.error("Required fields missing");
        newProduct = {
            id: commonId, company, category: 'Glass',
            description: glassForm.name.toUpperCase(),
            thickness: glassForm.thickness, glassType: glassForm.type as any,
            costPrice: Number(glassForm.rate), basePrice: Number(glassForm.rate), unit: 'SqFt', variants: []
        };
    } else {
        if (!generalForm.name || !generalForm.rate) return toast.error("Required fields missing");
        newProduct = {
            id: commonId, company, category: activeTab,
            description: generalForm.name.toUpperCase(),
            brand: generalForm.brand,
            costPrice: Number(generalForm.rate), basePrice: Number(generalForm.rate),
            unit: activeTab === 'Finish' ? 'KG' : activeTab === 'Accessory' ? 'RunningFt' : 'Set', variants: []
        };
    }

    let updated = [...SalesService.getProducts()];
    if (editingId) updated = updated.map(p => p.id === editingId ? newProduct : p);
    else updated.push(newProduct);
    
    SalesService.saveProducts(updated);
    refreshData();
    setIsModalOpen(false);
    resetForms();
    toast.success("Item saved successfully");
  };

  const deleteProduct = (id: string) => {
    if (confirm("Delete this item?")) {
      SalesService.saveProducts(SalesService.getProducts().filter(p => p.id !== id));
      refreshData();
      toast.success("Item deleted");
    }
  };

  const resetForms = () => {
    setEditingId(null);
    setProfileForm({ system: selectedSystem || '', type: 'Non-Thermal', application: navSection, role: 'Frame', name: '', gtCode: '', jmCode: '', weight: '', length: 16, rate: '' });
    setGlassForm({ name: '', type: 'Tempered', thickness: '6mm', rate: '' });
    setGeneralForm({ name: '', brand: '', rate: '', unit: 'Set' });
  };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    if (activeTab === 'Systems') {
      setProfileForm({ system: p.serviceNick || '', type: p.systemSubClass || 'Non-Thermal', application: (p.subCategory as any) || 'Window', role: p.profileRole || 'Frame', name: p.description, gtCode: p.profileCode || '', jmCode: p.modelNo || '', weight: p.thickness || '', length: Number(p.sheetSize) || 16, rate: p.costPrice?.toString() || '' });
    } else if (activeTab === 'Glass') {
      setGlassForm({ name: p.description, type: p.glassType || 'Tempered', thickness: p.thickness || '6mm', rate: p.costPrice?.toString() || '' });
    } else {
      setGeneralForm({ name: p.description, brand: p.brand || '', rate: p.costPrice?.toString() || '', unit: p.unit });
    }
    setIsModalOpen(true);
  };

  const getSystemCategory = (systemName: string) => products.find(p => p.serviceNick === systemName)?.systemSubClass || 'Non-Thermal';

  const menuItems = [
      { id: 'Systems', label: 'Aluminium', icon: Layout, sub: 'Profile Systems' },
      { id: 'Glass', label: 'Glazing', icon: Layers, sub: 'Glass Library' },
      { id: 'Hardware', label: 'Hardware', icon: Anchor, sub: 'Kits & Locks' },
      { id: 'Finish', label: 'Finishes', icon: PaintBucket, sub: 'Powder/Anodized' },
      { id: 'Accessory', label: 'Accessory', icon: Wrench, sub: 'Rubber/Sealant' },
  ];

  const appNavItems = [
      { id: 'Window', label: 'Windows', icon: PanelTop },
      { id: 'Door', label: 'Doors', icon: DoorOpen },
      { id: 'Facade', label: 'Facades', icon: Grid3X3 },
  ];

  return (
    <div className="flex h-[calc(100vh-100px)] gap-6 animate-in fade-in duration-300">
      <div className="w-64 flex flex-col space-y-2 shrink-0">
        {menuItems.map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id as any)} className={`p-4 rounded-2xl text-left border-2 transition-all flex items-center gap-3 ${activeTab === item.id ? 'bg-red-800 text-white border-red-800 shadow-lg' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            <item.icon size={20} className={activeTab === item.id ? 'text-red-400' : 'text-slate-400'} />
            <div><span className="block text-xs font-black uppercase tracking-wider">{item.label}</span><span className={`text-[10px] font-medium ${activeTab === item.id ? 'opacity-80' : 'opacity-60'}`}>{item.sub}</span></div>
            </button>
        ))}
        {activeTab === 'Systems' && (
          <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden flex-1">
            <div className="p-2 border-b grid grid-cols-3 gap-1">{appNavItems.map(nav => (<button key={nav.id} onClick={() => { setNavSection(nav.id as any); setSelectedSystem(null); }} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all ${navSection === nav.id ? 'bg-red-50 text-red-600' : 'text-slate-400 hover:bg-slate-50'}`}><nav.icon size={16} /><span className="text-[8px] font-black uppercase mt-1">{nav.label}</span></button>))}</div>
            <div className="p-4 bg-slate-50 border-b border-slate-100 font-black text-[10px] uppercase text-slate-400 tracking-widest">{navSection} Systems</div>
            <div className="flex-1 overflow-y-auto p-2 space-y-4">
              {['Thermal', 'Non-Thermal'].map(subClass => {
                  const subSystems = systems.filter(s => getSystemCategory(s) === subClass);
                  if (subSystems.length === 0) return null;
                  return (
                      <div key={subClass}><p className="px-2 text-[9px] font-black uppercase text-red-400 mb-1">{subClass}</p>{subSystems.map(s => (<button key={s} onClick={() => setSelectedSystem(s)} className={`w-full text-left px-4 py-2 mb-1 rounded-lg text-xs font-bold transition-all ${selectedSystem === s ? 'bg-red-500 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}>{s}</button>))}</div>
                  )
              })}
            </div>
            <div className="p-2 border-t"><button onClick={() => { setSelectedSystem(''); setIsModalOpen(true); }} className="w-full py-2 border-2 border-dashed border-slate-300 rounded-xl text-slate-400 font-bold text-xs uppercase hover:border-red-400 hover:text-red-500 transition-all">+ New System</button></div>
          </div>
        )}
      </div>

      <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="px-8 py-6 border-b flex justify-between items-center bg-slate-50/50">
          <div><h2 className="text-2xl font-black uppercase text-slate-800">{activeTab === 'Systems' ? (selectedSystem || 'Select System') : `${activeTab} Master`}</h2><div className="flex items-center space-x-2 mt-1">{activeTab === 'Systems' && selectedSystem && (<span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[9px] font-black uppercase">{getSystemCategory(selectedSystem)}</span>)}<p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Manage Costing & Recipe Data</p></div></div>
          <button onClick={() => { resetForms(); setIsModalOpen(true); }} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-black uppercase text-xs tracking-widest flex items-center gap-2 shadow-xl hover:bg-red-600 transition-all" disabled={activeTab === 'Systems' && !selectedSystem && systems.length > 0}><Plus size={16}/> <span>Add {activeTab} Item</span></button>
        </div>
        <div className="flex-1 overflow-y-auto p-0">
          {(activeTab === 'Systems' && !selectedSystem) ? (<div className="flex flex-col items-center justify-center h-full text-slate-300"><Layout size={64} className="mb-4 opacity-20"/><p className="font-black uppercase tracking-widest text-xs">Select a System from Sidebar</p></div>) : (
            <table className="w-full text-left sap-table"><thead className="bg-white sticky top-0 z-10 text-[10px] uppercase font-black text-slate-400 tracking-widest"><tr>{activeTab === 'Systems' && <th className="px-8 py-4 w-24">Role</th>}<th className="px-8 py-4">Item Description</th>{activeTab === 'Systems' && <th className="px-8 py-4 text-center">GT Code</th>}{activeTab === 'Systems' && <th className="px-8 py-4 text-center">JM Code</th>}{activeTab === 'Systems' && <th className="px-8 py-4 text-center">Weight</th>}{activeTab === 'Glass' && <th className="px-8 py-4 text-center">Thickness</th>}{['Hardware','Finish','Accessory'].includes(activeTab) && <th className="px-8 py-4 text-center">Unit</th>}<th className="px-8 py-4 text-right">Cost Rate</th><th className="px-8 py-4 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredItems.map(p => (<tr key={p.id} className="hover:bg-slate-50 group transition-colors">{activeTab === 'Systems' && (<td className="px-8 py-4"><span className="text-[9px] font-black uppercase bg-slate-100 px-2 py-1 rounded text-slate-500">{p.profileRole || 'Part'}</span></td>)}<td className="px-8 py-4"><span className="font-bold text-slate-700 uppercase text-sm">{p.description}</span> {p.brand && <span className="text-[10px] text-slate-400 font-bold ml-2">({p.brand})</span>}</td>{activeTab === 'Systems' && <td className="px-8 py-4 text-center font-mono text-xs font-bold text-red-600">{p.profileCode || '-'}</td>}{activeTab === 'Systems' && <td className="px-8 py-4 text-center font-mono text-xs font-bold text-orange-600">{p.modelNo || '-'}</td>}{activeTab === 'Systems' && <td className="px-8 py-4 text-center"><span className="bg-red-50 text-red-700 px-3 py-1 rounded font-black text-xs">{p.thickness}</span></td>}{activeTab === 'Glass' && <td className="px-8 py-4 text-center font-black text-slate-600 text-xs">{p.thickness}</td>}{['Hardware','Finish','Accessory'].includes(activeTab) && <td className="px-8 py-4 text-center font-black text-slate-400 text-xs uppercase">{p.unit}</td>}<td className="px-8 py-4 text-right font-black text-slate-800">{p.costPrice}</td><td className="px-8 py-4 text-right"><div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => openEdit(p)} className="p-2 bg-white border rounded hover:text-red-600 hover:border-red-200"><Edit2 size={14}/></button><button onClick={() => deleteProduct(p.id)} className="p-2 bg-white border rounded hover:text-red-600 hover:border-red-200"><Trash2 size={14}/></button></div></td></tr>))}</tbody></table>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-8 py-6 bg-slate-900 text-white flex justify-between items-center shrink-0"><h3 className="font-black uppercase text-lg">{editingId ? 'Edit Item' : `New ${activeTab} Item`}</h3><button onClick={() => setIsModalOpen(false)}><X size={24}/></button></div>
            <div className="p-8 space-y-6 overflow-y-auto">
              {activeTab === 'Systems' ? (
                <>
                  <div className="grid grid-cols-2 gap-4"><div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400">Application</label><select className="sap-input w-full font-bold" value={profileForm.application} onChange={e => setProfileForm({...profileForm, application: e.target.value as any})}><option value="Window">Window</option><option value="Door">Door</option><option value="Facade">Facade</option></select></div><div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400">System Class</label><select className="sap-input w-full font-bold" value={profileForm.type} onChange={e => setProfileForm({...profileForm, type: e.target.value as any})}><option value="Non-Thermal">Non-Thermal</option><option value="Thermal">Thermal</option></select></div></div>
                  <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400">System Name</label><input type="text" list="sysList" className="w-full p-3 bg-slate-50 border rounded-xl font-bold uppercase" value={profileForm.system} onChange={e => setProfileForm({...profileForm, system: e.target.value})}/><datalist id="sysList">{systems.map(s => <option key={s} value={s}/>)}</datalist></div>
                  <div className="bg-slate-100 p-4 rounded-xl space-y-4"><div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400">Profile Role</label><select className="sap-input w-full font-bold" value={profileForm.role} onChange={e => setProfileForm({...profileForm, role: e.target.value as any})}><option value="Frame">Main Frame</option><option value="Sash">Sash / Leaf</option><option value="Mullion">Mullion / Transom</option><option value="Interlock">Interlock</option><option value="Bead">Glazing Bead</option><option value="Screen">Fly Screen</option><option value="Adaptor">Adaptor</option></select></div><div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400">Profile Name</label><input type="text" className="w-full p-3 bg-white border rounded-xl font-bold uppercase" value={profileForm.name} onChange={e => setProfileForm({...profileForm, name: e.target.value})}/></div></div>
                  <div className="grid grid-cols-2 gap-4"><div className="space-y-1"><label className="text-[10px] font-black uppercase text-red-500">GTK Code</label><div className="relative"><ScanBarcode size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400"/><input type="text" className="w-full pl-9 p-3 bg-red-50 border rounded-xl font-bold text-red-700 uppercase" value={profileForm.gtCode} onChange={e => setProfileForm({...profileForm, gtCode: e.target.value})}/></div></div><div className="space-y-1"><label className="text-[10px] font-black uppercase text-orange-500">JM Code</label><div className="relative"><Box size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400"/><input type="text" className="w-full pl-9 p-3 bg-orange-50 border rounded-xl font-bold text-orange-700 uppercase" value={profileForm.jmCode} onChange={e => setProfileForm({...profileForm, jmCode: e.target.value})}/></div></div></div>
                  <div className="grid grid-cols-2 gap-4"><div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400">Weight (Kg/Ft)</label><div className="relative"><Weight size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input type="number" step="0.001" className="w-full pl-9 p-3 bg-slate-50 border rounded-xl font-black text-slate-700" value={profileForm.weight} onChange={e => setProfileForm({...profileForm, weight: e.target.value})}/></div></div><div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400">Length (Ft)</label><input type="number" className="w-full p-3 bg-slate-50 border rounded-xl font-bold" value={profileForm.length} onChange={e => setProfileForm({...profileForm, length: Number(e.target.value)})}/></div></div>
                  <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400">Base Rate</label><div className="relative"><Coins size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500"/><input type="number" className="w-full pl-9 p-3 bg-slate-50 border rounded-xl font-black text-emerald-600" value={profileForm.rate} onChange={e => setProfileForm({...profileForm, rate: e.target.value})}/></div></div>
                </>
              ) : activeTab === 'Glass' ? (
                <>
                  <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400">Glass Description</label><input type="text" className="w-full p-3 bg-slate-50 border rounded-xl font-bold uppercase" value={glassForm.name} onChange={e => setGlassForm({...glassForm, name: e.target.value})}/></div>
                  <div className="grid grid-cols-2 gap-4"><div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400">Type</label><select className="w-full p-3 bg-slate-50 border rounded-xl font-bold" value={glassForm.type} onChange={e => setGlassForm({...glassForm, type: e.target.value})}><option>Tempered</option><option>Annealed</option><option>Laminated</option><option>Double Glazed</option></select></div><div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400">Thickness</label><select className="w-full p-3 bg-slate-50 border rounded-xl font-bold" value={glassForm.thickness} onChange={e => setGlassForm({...glassForm, thickness: e.target.value})}><option>5mm</option><option>6mm</option><option>8mm</option><option>10mm</option><option>12mm</option><option>DG Unit</option></select></div></div>
                  <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400">Rate</label><input type="number" className="w-full p-3 bg-slate-50 border rounded-xl font-black text-blue-600" value={glassForm.rate} onChange={e => setGlassForm({...glassForm, rate: e.target.value})}/></div>
                </>
              ) : (
                <>
                  <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400">Item Description</label><input type="text" className="w-full p-3 bg-slate-50 border rounded-xl font-bold uppercase" value={generalForm.name} onChange={e => setGeneralForm({...generalForm, name: e.target.value})}/></div>
                  {activeTab === 'Hardware' && <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400">Brand / Make</label><input type="text" className="w-full p-3 bg-slate-50 border rounded-xl font-bold uppercase" value={generalForm.brand} onChange={e => setGeneralForm({...generalForm, brand: e.target.value})}/></div>}
                  <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400">Cost Rate</label><div className="relative"><Coins size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500"/><input type="number" className="w-full pl-9 p-3 bg-slate-50 border rounded-xl font-black text-emerald-600" value={generalForm.rate} onChange={e => setGeneralForm({...generalForm, rate: e.target.value})}/></div></div>
                </>
              )}
            </div>
            <div className="p-6 border-t flex justify-end gap-3 shrink-0"><button onClick={() => setIsModalOpen(false)} className="px-6 py-2 rounded-xl text-slate-500 font-bold hover:bg-slate-100">Cancel</button><button onClick={handleSaveItem} className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black uppercase shadow-lg hover:bg-red-600 transition-all">Save Item</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NipponProductMaster;
