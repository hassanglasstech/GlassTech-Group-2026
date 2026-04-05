import React, { useState, useEffect } from 'react';
import { Company, Client } from '../../shared/types';
import { AsyncSalesService } from '../services/asyncSalesService';
import { UserPlus, Search, Edit2, Trash2, X, Building, Phone, Save, Briefcase, FileText } from 'lucide-react';
import { useAppStore } from '../../shared/store/appStore';
import { toast } from 'sonner';
import { useRealtimeRefresh } from '@/modules/shared/hooks/useRealtimeRefresh';
import ClientStatementModal from '../components/prints/ClientStatementModal';

const PKR = (n: number) => `PKR ${Math.round(n || 0).toLocaleString('en-PK')}`;
const ClientMaster: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [clients, setClients] = useState<Client[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statementClient, setStatementClient] = useState<Client | null>(null);
  
  const initialForm: Partial<Client> = {
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    ntn: '',
    creditLimit: 0,
    status: 'Active'
  };

  const [formData, setFormData] = useState<Partial<Client>>(initialForm);

  const { refreshKey } = useRealtimeRefresh(['clients']);

  useEffect(() => {
    refreshData();
  }, [company, refreshKey]);

  const refreshData = async () => {
    const all = await AsyncSalesService.getClients();
    setClients(all.filter(c => c.company === company));
  };

  const handleSave = async () => {
    if (!formData.name || !formData.phone) {
      toast.error("Business Partner Name and Phone are required.");
      return;
    }

    const newClient: Client = {
      ...(formData as Client),
      id: `BP-${Date.now().toString().slice(-6)}`,
      company,
      createdAt: new Date().toISOString()
    };

    const all = await AsyncSalesService.getClients();
    await AsyncSalesService.saveClients([...all, newClient]);
    toast.success("Business Partner created and synced to cloud.");
    refreshData();
    setIsModalOpen(false);
    setFormData(initialForm);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Delete this Business Partner profile?")) {
      const all = await AsyncSalesService.getClients();
      await AsyncSalesService.saveClients(all.filter(c => c.id !== id));
      refreshData();
      toast.success("Business Partner profile deleted.");
    }
  };

  const filtered = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.ntn.includes(searchTerm)
  );

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="bg-white border border-slate-200 p-4 shadow-sm flex justify-between items-center no-print">
        <div className="flex items-center space-x-6">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Transaction: BP_MAINT</h3>
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search Business Partner..." 
              className="sap-input w-full pl-9 py-1.5 text-xs font-bold"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="sap-btn-primary flex items-center space-x-2">
          <UserPlus size={14} /> <span>Create BP</span>
        </button>
      </div>

      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left sap-table">
          <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 tracking-widest">
            <tr>
              <th className="px-4 py-3 w-64">Business Partner</th>
              <th className="px-4 py-3">Contact Person</th>
              <th className="px-4 py-3">NTN / Tax ID</th>
              <th className="px-4 py-3">Credit Limit</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-center w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? filtered.map((client) => (
              <tr key={client.id} className="group hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-600 font-bold border border-slate-200">
                      <Building size={16} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 leading-tight">{client.name}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{client.id}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="text-xs font-bold text-slate-700 uppercase">{client.contactPerson}</p>
                  <p className="text-[10px] text-slate-400 flex items-center space-x-1"><Phone size={10} /> <span>{client.phone}</span></p>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-mono font-bold text-slate-600">{client.ntn || 'UNREGISTERED'}</span>
                </td>
                <td className="px-4 py-3">
                  <p className="text-xs font-black text-blue-600">PKR {(Number(client.creditLimit) || 0).toLocaleString()}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${client.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {client.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex justify-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="text-slate-400 hover:text-blue-600"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(client.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                    <button onClick={() => setStatementClient(client)} className="text-slate-400 hover:text-blue-600" title="AR Statement"><FileText size={14} /></button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-300 italic font-bold uppercase">No Business Partners registered under {company}.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {statementClient && (
        <ClientStatementModal
          clientId={statementClient.id}
          clientName={statementClient.name}
          company={company}
          onClose={() => setStatementClient(null)}
        />
      )}

      {isModalOpen && (<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[500]"><div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-200">
        <div className="p-8 grid grid-cols-2 gap-8 bg-slate-50">
          <div className="space-y-6">
            <h4 className="text-xs font-bold uppercase text-slate-500 tracking-widest border-b pb-2">General Data</h4>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-500">Partner Name / Company</label>
              <input type="text" className="sap-input w-full font-bold uppercase" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-500">Contact Person</label>
              <input type="text" className="sap-input w-full font-bold uppercase" value={formData.contactPerson} onChange={e => setFormData({...formData, contactPerson: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-500">Phone</label>
                <input type="text" className="sap-input w-full font-bold" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-500">Email</label>
                <input type="email" className="sap-input w-full font-bold lowercase" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <h4 className="text-xs font-bold uppercase text-slate-500 tracking-widest border-b pb-2">Financial Control</h4>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-500">NTN / Tax Number</label>
              <input type="text" className="sap-input w-full font-mono font-bold" value={formData.ntn} onChange={e => setFormData({...formData, ntn: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-500">Credit Limit (PKR)</label>
              <input type="number" className="sap-input w-full font-black text-blue-600" value={formData.creditLimit} onChange={e => setFormData({...formData, creditLimit: Number(e.target.value)})} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-500">Billing Address</label>
              <textarea className="sap-input w-full h-24 font-medium uppercase text-xs" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
            </div>
          </div>
        </div>
        <div className="px-8 py-4 bg-white border-t flex justify-end space-x-3">
          <button onClick={() => setIsModalOpen(false)} className="sap-btn-ghost">Discard</button>
          <button onClick={handleSave} className="sap-btn-primary flex items-center space-x-2"><Save size={14} /><span>Create Partner</span></button>
        </div>
      </div></div>)}
    </div>
  );
};

export default ClientMaster;
