
import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Company, GLConfiguration, Account } from '../../shared/types';
import { FinanceService } from '../services/financeService';
import { Save, Plus, Trash2, ArrowRight } from 'lucide-react';

const GLConfigurationPage: React.FC<{ company: Company }> = ({ company }) => {
  const [configs, setConfigs] = useState<GLConfiguration[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [newConfig, setNewConfig] = useState<Partial<GLConfiguration>>({ eventType: 'Sale', subType: '', debitAccountId: '', creditAccountId: '' });

  useEffect(() => {
    refreshData();
  }, [company]);

  const refreshData = () => {
    setConfigs(FinanceService.getGLConfig().filter(c => c.company === company));
    setAccounts(FinanceService.getAccounts().filter(a => a.company === company && a.level === 5));
  };

  const handleSave = () => {
    if (!newConfig.subType || !newConfig.debitAccountId || !newConfig.creditAccountId) {
      return toast.error("All fields are required.", { duration: 4000 });
    }
    const config: GLConfiguration = {
      id: `GLC-${Date.now()}`,
      company,
      eventType: newConfig.eventType as any,
      subType: newConfig.subType!.toUpperCase(),
      debitAccountId: newConfig.debitAccountId!,
      creditAccountId: newConfig.creditAccountId!
    };
    FinanceService.saveGLConfig([...FinanceService.getGLConfig(), config]);
    refreshData();
    setNewConfig({ eventType: 'Sale', subType: '', debitAccountId: '', creditAccountId: '' });
  };

  const handleDelete = (id: string) => {
    if (confirm("Delete this rule?")) {
      FinanceService.saveGLConfig(FinanceService.getGLConfig().filter(c => c.id !== id));
      refreshData();
    }
  };

  const getAccountName = (id: string) => {
    const acc = accounts.find(a => a.id === id);
    return acc ? `[${acc.code}] ${acc.name}` : 'Unknown';
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-slate-900 text-white p-8 rounded-[2rem] shadow-xl">
        <h2 className="text-2xl font-black uppercase tracking-tight">GL Automation Rules</h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Configure System Event Mappings</p>
      </div>

      <div className="bg-white p-6 rounded-2xl border shadow-sm space-y-4">
        <h3 className="font-bold text-slate-700 uppercase text-xs">Create New Rule</h3>
        <div className="grid grid-cols-4 gap-4">
          <select 
            className="sap-input font-bold"
            value={newConfig.eventType}
            onChange={e => setNewConfig({ ...newConfig, eventType: e.target.value as any })}
          >
            <option value="Sale">Sale Invoice</option>
            <option value="Purchase">Purchase (Material)</option>
            <option value="Expense">General Expense</option>
            <option value="Trip">Logistics Trip</option>
            <option value="Payroll">Payroll Posting</option>
          </select>
          <input 
            type="text" 
            placeholder="Sub-Type (e.g. Raw Glass / Fuel)" 
            className="sap-input font-bold uppercase"
            value={newConfig.subType}
            onChange={e => setNewConfig({ ...newConfig, subType: e.target.value })}
          />
          <select 
            className="sap-input font-bold"
            value={newConfig.debitAccountId}
            onChange={e => setNewConfig({ ...newConfig, debitAccountId: e.target.value })}
          >
            <option value="">-- Select Debit Account --</option>
            {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
          </select>
          <select 
            className="sap-input font-bold"
            value={newConfig.creditAccountId}
            onChange={e => setNewConfig({ ...newConfig, creditAccountId: e.target.value })}
          >
            <option value="">-- Select Credit Account --</option>
            {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
          </select>
        </div>
        <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold text-xs uppercase flex items-center space-x-2 ml-auto">
          <Plus size={14} /> <span>Add Rule</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <table className="w-full text-left sap-table">
          <thead>
            <tr>
              <th>Event Type</th>
              <th>Sub-Scenario</th>
              <th>Debit Account (Receiver)</th>
              <th>Credit Account (Giver)</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {configs.map(c => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td><span className="bg-slate-100 px-2 py-1 rounded text-[10px] font-black uppercase">{c.eventType}</span></td>
                <td className="font-bold text-xs uppercase text-slate-700">{c.subType}</td>
                <td className="text-emerald-700 font-bold text-xs">{getAccountName(c.debitAccountId)}</td>
                <td className="text-rose-700 font-bold text-xs">{getAccountName(c.creditAccountId)}</td>
                <td className="text-right">
                  <button onClick={() => handleDelete(c.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
            {configs.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-slate-300 italic font-bold uppercase text-xs">No automation rules configured.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default GLConfigurationPage;
