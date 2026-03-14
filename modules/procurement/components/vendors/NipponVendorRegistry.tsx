
import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Company, Vendor } from '@/modules/shared/types';
import { SalesService } from '@/modules/sales/services/salesService';
import { Plus, Search, MapPin, Calendar, Phone, Save, X, Edit2, Trash2, Building } from 'lucide-react';

const NipponVendorRegistry: React.FC = () => {
  const company: Company = 'Nippon';
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const initialForm: Partial<Vendor> = {
    name: '',
    nickName: '',
    address: '',
    registrationDate: new Date().toISOString().split('T')[0],
    phone: '',
    contactPerson: '',
    type: 'General'
  };

  const [formData, setFormData] = useState<Partial<Vendor>>(initialForm);

  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = () => {
    // Filter vendors specifically created for Nippon
    const all = SalesService.getVendors();
    setVendors(all.filter(v => v.company === company));
  };

  const handleSave = () => {
    if (!formData.name) return toast.error("Company Name is required.", { duration: 4000 });

    const newVendor: Vendor = {
      ...(formData as Vendor),
      id: editingId || `VEND-NIP-${Date.now()}`,
      company: 'Nippon'
    };

    const all = SalesService.getVendors();
    let updated;
    
    if (editingId) {
        updated = all.map(v => v.id === editingId ? newVendor : v);
    } else {
        updated = [...all, newVendor];
    }

    SalesService.saveVendors(updated);
    refreshData();
    handleCloseModal();
  };

  const handleDelete = (id: string) => {
    if (confirm("Delete this vendor?")) {
      const all = SalesService.getVendors();
      SalesService.saveVendors(all.filter(v => v.id !== id));
      refreshData();
    }
  };

  const handleEdit = (vendor: Vendor) => {
      setEditingId(vendor.id);
      setFormData(vendor);
      setIsModalOpen(true);
  };

  const handleCloseModal = () => {
      setIsModalOpen(false);
      setEditingId(null);
      setFormData(initialForm);
  };

  const filtered = vendors.filter(v => 
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (v.nickName && v.nickName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-4">
           <div className="p-3 bg-red-600 text-white rounded-2xl shadow-lg shadow-red-200">
               <Building size={24}/>
           </div>
           <div>
               <h2 className="text-2xl font-black uppercase text-slate-800 tracking-tight">Nippon Vendor Network</h2>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">External Partners Registry</p>
           </div>
        </div>
        <div className="flex items-center space-x-4">
            <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                    type="text" 
                    placeholder="Search Partners..." 
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border-none rounded-xl font-bold text-xs uppercase outline-none focus:ring-2 focus:ring-red-500 transition-all"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>
            <button onClick={() => setIsModalOpen(true)} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-red-600 transition-all flex items-center space-x-2">
                <Plus size={16}/> <span>Register Vendor</span>
            </button>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left sap-table">
              <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-500 tracking-widest">
                  <tr>
                      <th className="px-6 py-4 w-64">Company Name</th>
                      <th className="px-6 py-4 w-40">Nick / Alias</th>
                      <th className="px-6 py-4">Address</th>
                      <th className="px-6 py-4">Contact Info</th>
                      <th className="px-6 py-4 text-center">Since</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                  {filtered.map(v => (
                      <tr key={v.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-6 py-4">
                              <p className="font-black text-slate-800 uppercase text-xs">{v.name}</p>
                              <p className="text-[9px] font-bold text-slate-400 mt-0.5">{v.id}</p>
                          </td>
                          <td className="px-6 py-4">
                              <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-black uppercase border border-slate-200">{v.nickName || '-'}</span>
                          </td>
                          <td className="px-6 py-4">
                              <div className="flex items-start space-x-1 text-slate-500 max-w-xs">
                                  <MapPin size={12} className="shrink-0 mt-0.5"/>
                                  <span className="text-[10px] font-bold uppercase leading-tight">{v.address || 'No Address'}</span>
                              </div>
                          </td>
                          <td className="px-6 py-4">
                              <div className="space-y-0.5">
                                  <p className="text-[10px] font-bold text-slate-700 uppercase">{v.contactPerson}</p>
                                  <p className="text-[10px] font-medium text-slate-500 flex items-center space-x-1"><Phone size={10}/> <span>{v.phone}</span></p>
                              </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                              <div className="inline-flex items-center space-x-1 bg-white border rounded px-2 py-1">
                                  <Calendar size={10} className="text-slate-400"/>
                                  <span className="text-[10px] font-bold text-slate-600">{v.registrationDate}</span>
                              </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => handleEdit(v)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all"><Edit2 size={14}/></button>
                                  <button onClick={() => handleDelete(v.id)} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all"><Trash2 size={14}/></button>
                              </div>
                          </td>
                      </tr>
                  ))}
                  {filtered.length === 0 && (
                      <tr><td colSpan={6} className="px-6 py-16 text-center text-slate-300 font-black uppercase italic text-xs">No partners found in registry.</td></tr>
                  )}
              </tbody>
          </table>
      </div>

      {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[500]">
              <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in duration-200 border border-slate-300">
                  <div className="px-8 py-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                      <div>
                          <h3 className="text-xl font-black uppercase tracking-tight">{editingId ? 'Edit Partner' : 'New Registration'}</h3>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Vendor Master Data</p>
                      </div>
                      <button onClick={handleCloseModal} className="hover:bg-white/10 p-2 rounded-full transition-colors"><X size={24}/></button>
                  </div>
                  
                  <div className="p-8 bg-slate-50 space-y-6">
                      <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Company Name</label>
                          <input 
                              type="text" 
                              className="sap-input w-full font-black uppercase text-sm" 
                              value={formData.name} 
                              onChange={e => setFormData({...formData, name: e.target.value})}
                              placeholder="e.g. AL-NOOR ALUMINIUM"
                          />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Nick Name</label>
                              <input 
                                  type="text" 
                                  className="sap-input w-full font-bold uppercase text-xs" 
                                  value={formData.nickName} 
                                  onChange={e => setFormData({...formData, nickName: e.target.value})}
                                  placeholder="e.g. ANA"
                              />
                          </div>
                          <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Registration Date</label>
                              <input 
                                  type="date" 
                                  className="sap-input w-full font-bold text-xs" 
                                  value={formData.registrationDate} 
                                  onChange={e => setFormData({...formData, registrationDate: e.target.value})}
                              />
                          </div>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Address</label>
                          <textarea 
                              className="sap-input w-full font-bold uppercase text-xs h-20 resize-none" 
                              value={formData.address} 
                              onChange={e => setFormData({...formData, address: e.target.value})}
                              placeholder="Full Business Address..."
                          />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Contact Person</label>
                              <input 
                                  type="text" 
                                  className="sap-input w-full font-bold uppercase text-xs" 
                                  value={formData.contactPerson} 
                                  onChange={e => setFormData({...formData, contactPerson: e.target.value})}
                              />
                          </div>
                          <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Phone Number</label>
                              <input 
                                  type="text" 
                                  className="sap-input w-full font-bold text-xs" 
                                  value={formData.phone} 
                                  onChange={e => setFormData({...formData, phone: e.target.value})}
                              />
                          </div>
                      </div>
                  </div>

                  <div className="px-8 py-6 bg-white border-t flex justify-end space-x-3">
                      <button onClick={handleCloseModal} className="px-6 py-2 text-slate-400 font-black uppercase text-xs tracking-widest hover:text-slate-600">Discard</button>
                      <button onClick={handleSave} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-red-600 transition-all flex items-center space-x-2">
                          <Save size={16}/> <span>Save Vendor</span>
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default NipponVendorRegistry;
