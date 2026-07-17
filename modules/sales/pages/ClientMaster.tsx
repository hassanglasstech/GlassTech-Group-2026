import React, { useState, useEffect } from 'react';
import { Company, Client } from '../../shared/types';
import { AsyncSalesService } from '../services/asyncSalesService';
import { UserPlus, Search, Edit2, Trash2, X, Building, Phone, Save, Briefcase, FileText } from 'lucide-react';
import { useAppStore } from '../../shared/store/appStore';
import { toast } from 'sonner';
import { useRealtimeRefresh } from '@/modules/shared/hooks/useRealtimeRefresh';
import ClientStatementModal from '../components/prints/ClientStatementModal';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';

const PKR = (n: number) => `PKR ${Math.round(n || 0).toLocaleString('en-PK')}`;
const ClientMaster: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [clients, setClients] = useState<Client[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
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
    status: 'Active',
    mirrorCompany: null,  // Sprint 2 — explicit IC mirror FK
    preferredPrintType: 'KinLong',  // Nippon — default print header (KinLong)
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

  const handleEdit = (client: Client) => {
    setFormData({
      name: client.name,
      contactPerson: client.contactPerson,
      email: client.email,
      phone: client.phone,
      address: client.address,
      ntn: client.ntn,
      creditLimit: client.creditLimit,
      status: client.status,
      mirrorCompany: client.mirrorCompany ?? null,
      preferredPrintType: client.preferredPrintType ?? 'KinLong',
    });
    setEditingId(client.id);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData(initialForm);
  };

  const handleSave = async () => {
    if (!formData.name?.trim() || !formData.phone?.trim()) {
      toast.error("Business Partner Name and Phone are required.");
      return;
    }
    if (isSaving) return;
    setIsSaving(true);
    try {
      const all = await AsyncSalesService.getClients();
      let res: { error?: string };
      if (editingId) {
        const updated = all.map(c => c.id === editingId
          ? { ...c, ...formData, company } as Client
          : c);
        res = await AsyncSalesService.saveClients(updated);
      } else {
        const newClient: Client = {
          ...(formData as Client),
          id: `BP-${Date.now().toString().slice(-6)}`,
          company,
          createdAt: new Date().toISOString()
        };
        res = await AsyncSalesService.saveClients([...all, newClient]);
      }
      if (res.error) {
        toast.error(`Not saved to cloud: ${res.error}`);
        return;
      }
      toast.success(editingId ? "Business Partner updated." : "Business Partner created.");
      refreshData();
      closeModal();
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (await confirmModal("Delete this Business Partner profile?")) {
      try {
        // Per-row cloud delete. The old path upserted the filtered array, which
        // never removed the row from the cloud table → the "deleted" client
        // reappeared on the next refresh (green toast, but still there).
        const { error } = await AsyncSalesService.deleteClient(id);
        if (error) {
          toast.error(`Delete failed — profile still in cloud: ${error}`);
          return;
        }
        refreshData();
        toast.success("Business Partner profile deleted.");
      } catch (err) {
        toast.error(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
  };

  const filtered = clients.filter(c =>
    (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.ntn || '').includes(searchTerm)
  );

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="sales-page-head no-print">
        <div className="flex items-center space-x-6">
          <div>
            <h2 className="sales-page-title">Business Partners</h2>
            <p className="sales-page-sub">Customers &amp; clients — {company}</p>
          </div>
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

      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-x-auto">
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
                    <button onClick={() => handleEdit(client)} aria-label="Edit Business Partner" className="text-slate-400 hover:text-blue-600" title="Edit"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(client.id)} aria-label="Delete Business Partner" title="Delete" className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                    <button onClick={() => setStatementClient(client)} aria-label="View AR Statement" className="text-slate-400 hover:text-blue-600" title="AR Statement"><FileText size={14} /></button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={6} className="sales-empty">{searchTerm ? `No business partners match “${searchTerm}”.` : `No business partners under ${company} yet — click “Create BP” to add one.`}</td>
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
              <label className="text-[10px] font-bold uppercase text-slate-500">Partner Name / Company <span className="text-red-500">*</span></label>
              <input type="text" className="sap-input w-full font-bold uppercase" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-500">Contact Person</label>
              <input type="text" className="sap-input w-full font-bold uppercase" value={formData.contactPerson} onChange={e => setFormData({...formData, contactPerson: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-500">Phone <span className="text-red-500">*</span></label>
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
            {/* Sprint 2 — IC mirror FK. Replaces regex-on-name lookup. */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-500">
                Intercompany Mirror
                <span className="ml-1 text-slate-400 normal-case font-medium">— posts BILL on selected company's books at invoice time</span>
              </label>
              <select
                className="sap-input w-full font-bold"
                value={formData.mirrorCompany ?? ''}
                onChange={e => setFormData({
                  ...formData,
                  mirrorCompany: (e.target.value || null) as Client['mirrorCompany'],
                })}
              >
                <option value="">— None (no IC mirror) —</option>
                <option value="GTK">GTK — GlassTech Karachi</option>
                <option value="GTI">GTI — GlassTech Industries</option>
                <option value="Glassco">Glassco</option>
                <option value="Nippon">Nippon</option>
                <option value="Factory">Factory Ops</option>
              </select>
            </div>
            {/* Nippon — the customer's preferred print header; overrides the default
                on their quotes, and printing with another header prompts a warning. */}
            {company === 'Nippon' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-500">
                  Preferred Print
                  <span className="ml-1 text-slate-400 normal-case font-medium">— header used on this customer's quotes / orders</span>
                </label>
                <select
                  className="sap-input w-full font-bold"
                  value={formData.preferredPrintType ?? 'KinLong'}
                  onChange={e => setFormData({ ...formData, preferredPrintType: e.target.value as Client['preferredPrintType'] })}
                >
                  <option value="KinLong">Kin Long</option>
                  <option value="Glasstech">Glasstech</option>
                  <option value="General">General</option>
                </select>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-500">Billing Address</label>
              <textarea className="sap-input w-full h-24 font-medium uppercase text-xs" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
            </div>
          </div>
        </div>
        <div className="px-8 py-4 bg-white border-t flex justify-end space-x-3">
          <button onClick={closeModal} className="sap-btn-ghost" disabled={isSaving}>Discard</button>
          <button onClick={handleSave} disabled={isSaving} className="sap-btn-primary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"><Save size={14} /><span>{isSaving ? 'Saving…' : editingId ? 'Update Partner' : 'Create Partner'}</span></button>
        </div>
      </div></div>)}
    </div>
  );
};

export default ClientMaster;
