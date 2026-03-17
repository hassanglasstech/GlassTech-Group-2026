
import React, { useState, useEffect, useMemo } from 'react';
import { Company, Account, LedgerTransaction } from '@/modules/shared/types';
import { FinanceService } from '@/modules/finance/services/financeService';
import { SidePanel } from '@/modules/shared/components/SidePanel';
import { 
  ChevronRight, ChevronDown, Folder, FileText, Plus, X, 
  Landmark, Search, LayoutList, Briefcase, Wallet, PieChart, 
  TrendingUp, TrendingDown, Trash2, Save, Info, ShieldAlert, Calculator, Edit2, FileUp, FileDown, RotateCcw
} from 'lucide-react';
import * as XLSX from 'xlsx';

const ChartOfAccounts: React.FC<{ company: Company }> = ({ company }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  
  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isOBModalOpen, setIsOBModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | 'All'>('All');
  
  // Add State
  const [addSelections, setAddSelections] = useState({ l1: '', l2: '', l3: '', l4: '' });
  const [newAccName, setNewAccName] = useState('');
  const [newAccCode, setNewAccCode] = useState('');
  
  // Delete State
  const [delSelections, setDelSelections] = useState({ l1: '', l2: '', l3: '', l4: '', l5: '' });

  // Edit State
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');

  // Opening Balance State
  const [obEntries, setObEntries] = useState<Record<string, { debit: number, credit: number }>>({});

  useEffect(() => { refreshData(); }, [company]);

  const refreshData = () => {
    const data = FinanceService.getAccounts().filter(a => a.company === company);
    setAccounts(data);
    const topLevels = data.filter(a => a.level === 1).map(a => a.id);
    setExpandedIds(new Set(topLevels));
  };

  const handleRestoreDefaults = () => {
    if (!confirm("This will merge missing 5-Level COA accounts into your current list. Continue?")) return;
    FinanceService.seedDefaultCOA();
    refreshData();
    alert("5-Level COA accounts have been merged.");
  };

  const handleClearAndReseed = () => {
    if (!confirm("CRITICAL: This will DELETE ALL existing accounts and re-seed the default 5-Level COA. This cannot be undone. Continue?")) return;
    FinanceService.saveAccounts([]); // Clear
    FinanceService.seedDefaultCOA(); // Seed
    refreshData();
    alert("Chart of Accounts has been completely reset to 5-Level defaults.");
  };

  const loadOpeningBalances = () => {
    // Fetch existing OB transaction for this company
    const ledger = FinanceService.getLedger();
    const existingOB = ledger.find(t => t.company === company && t.docType === 'OB');
    
    const initialMap: Record<string, { debit: number, credit: number }> = {};
    
    // Pre-fill with existing data if available
    if (existingOB) {
        existingOB.details.forEach(d => {
            initialMap[d.accountId] = { debit: d.debit, credit: d.credit };
        });
    }
    
    setObEntries(initialMap);
    setIsOBModalOpen(true);
  };

  const handleSaveOpeningBalances = () => {
    let totalDebit = 0;
    let totalCredit = 0;
    const details: any[] = [];

    Object.entries(obEntries).forEach(([accId, val]) => {
        const entry = val as { debit: number; credit: number };
        const d = Number(entry.debit) || 0;
        const c = Number(entry.credit) || 0;
        if (d > 0 || c > 0) {
            details.push({
                accountId: accId,
                debit: d,
                credit: c,
                text: 'Opening Balance 2026'
            });
            totalDebit += d;
            totalCredit += c;
        }
    });

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return alert(`Imbalance Error!\nTotal Debit: ${totalDebit}\nTotal Credit: ${totalCredit}\nDifference: ${totalDebit - totalCredit}`);
    }

    // 1. Remove ANY existing OB for this company (to overwrite)
    const allLedger = FinanceService.getLedger();
    const cleanedLedger = allLedger.filter(t => !(t.company === company && t.docType === 'OB'));

    if (details.length > 0) {
        const obTransaction: LedgerTransaction = {
            id: `OB-2026-${company}`,
            company,
            docType: 'OB',
            docDate: '2026-01-01',
            date: '2026-01-01',
            description: 'OPENING BALANCES FY-2026',
            referenceId: 'SYSTEM-INIT',
            status: 'Posted',
            details: details
        };
        cleanedLedger.push(obTransaction);
    }

    FinanceService.saveLedger(cleanedLedger);
    setIsOBModalOpen(false);
    alert("Opening Balances Posted Successfully.");
  };

  const updateOBEntry = (accId: string, field: 'debit' | 'credit', value: string) => {
      setObEntries(prev => ({
          ...prev,
          [accId]: {
              ...prev[accId],
              [field]: Number(value) || 0,
              // If entering debit, clear credit and vice versa (usually)
              [field === 'debit' ? 'credit' : 'debit']: 0
          }
      }));
  };

  const categories = [
    { name: 'All', icon: LayoutList, color: 'text-slate-600' },
    { name: 'Asset', icon: Briefcase, color: 'text-blue-600' },
    { name: 'Liability', icon: Wallet, color: 'text-orange-600' },
    { name: 'Equity', icon: PieChart, color: 'text-purple-600' },
    { name: 'Revenue', icon: TrendingUp, color: 'text-emerald-600' },
    { name: 'Expense', icon: TrendingDown, color: 'text-rose-600' },
  ];

  const filteredAccounts = useMemo(() => {
    let result = accounts;
    if (activeCategory !== 'All') result = result.filter(a => a.type === activeCategory);
    if (searchQuery) {
      result = result.filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.code.includes(searchQuery));
    }
    return result;
  }, [accounts, activeCategory, searchQuery]);

  const add_l1List = accounts.filter(a => a.level === 1);
  const add_l2List = accounts.filter(a => a.level === 2 && a.parentId === addSelections.l1);
  const add_l3List = accounts.filter(a => a.level === 3 && a.parentId === addSelections.l2);
  const add_l4List = accounts.filter(a => a.level === 4 && a.parentId === addSelections.l3);

  const del_l1List = accounts.filter(a => a.level === 1);
  const del_l2List = accounts.filter(a => a.level === 2 && a.parentId === delSelections.l1);
  const del_l3List = accounts.filter(a => a.level === 3 && a.parentId === delSelections.l2);
  const del_l4List = accounts.filter(a => a.level === 4 && a.parentId === delSelections.l3);
  const del_l5List = accounts.filter(a => a.level === 5 && a.parentId === delSelections.l4);

  const toggleExpand = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedIds(next);
  };

  const handleSaveAccount = () => {
    if (!newAccName) return alert("Account name is required.");
    let finalParentId = addSelections.l4 || addSelections.l3 || addSelections.l2 || addSelections.l1;
    let finalLevel = addSelections.l4 ? 5 : addSelections.l3 ? 4 : addSelections.l2 ? 3 : 2;

    const parent = accounts.find(a => a.id === finalParentId);
    if (!parent) return alert("Select a valid parent category.");

    const newAcc: Account = {
      id: `${company}-ACC-${Date.now()}`,
      company,
      code: newAccCode || `${parent.code}${Math.floor(Math.random() * 90) + 10}`,
      name: newAccName,
      level: finalLevel as any,
      parentId: finalParentId,
      type: parent.type
    };

    FinanceService.saveAccounts([...FinanceService.getAccounts(), newAcc]);
    refreshData();
    setIsAddModalOpen(false);
    setAddSelections({ l1: '', l2: '', l3: '', l4: '' });
    setNewAccName('');
    setNewAccCode('');
  };

  const handleProcessDelete = () => {
    // Allows deletion at ANY level selected (L5 down to L1)
    let targetId = delSelections.l5 || delSelections.l4 || delSelections.l3 || delSelections.l2 || delSelections.l1;
    
    if (!targetId) return alert("Select a node to delete.");
    
    // Safety check: Cannot delete if it has children
    if (accounts.some(a => a.parentId === targetId)) {
        return alert("Constraint Error: This node has sub-accounts. Please delete all children first.");
    }
    
    if (!window.confirm(`CRITICAL: Confirm permanent deletion of this account?`)) return;
    
    FinanceService.saveAccounts(FinanceService.getAccounts().filter(a => a.id !== targetId));
    refreshData();
    setIsDeleteModalOpen(false);
    setDelSelections({ l1: '', l2: '', l3: '', l4: '', l5: '' });
  };

  const handleExport = () => {
    // Export to JSON
    const jsonFileName = `ChartOfAccounts_${company}_${new Date().toISOString().split('T')[0]}.json`;
    const jsonContent = JSON.stringify(accounts, null, 2);
    const jsonBlob = new Blob([jsonContent], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement('a');
    jsonLink.href = jsonUrl;
    jsonLink.download = jsonFileName;
    document.body.appendChild(jsonLink);
    jsonLink.click();
    document.body.removeChild(jsonLink);
    URL.revokeObjectURL(jsonUrl);

    // Export to Excel
    const excelFileName = `ChartOfAccounts_${company}_${new Date().toISOString().split('T')[0]}.xlsx`;
    const ws_data = [
      ["ID", "Company", "Code", "Name", "Level", "Parent ID", "Type"],
      ...accounts.map(acc => [
        acc.id,
        acc.company,
        acc.code,
        acc.name,
        acc.level,
        acc.parentId,
        acc.type
      ])
    ];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ChartOfAccounts");
    XLSX.writeFile(wb, excelFileName);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        if (file.name.endsWith('.json')) {
          const importedAccounts: Account[] = JSON.parse(content);
          // Basic validation for imported accounts
          if (!Array.isArray(importedAccounts) || !importedAccounts.every(a => a.id && a.company && a.name && a.code && a.level && a.type)) {
            throw new Error('Invalid JSON format for accounts.');
          }
          // Filter to only import accounts for the current company
          const currentCompanyAccounts = importedAccounts.filter(a => a.company === company);
          // Merge with existing accounts, avoiding duplicates by ID
          const existingAccounts = FinanceService.getAccounts().filter(a => a.company !== company);
          FinanceService.saveAccounts([...existingAccounts, ...currentCompanyAccounts]);
          refreshData();
          alert('Accounts imported successfully from JSON!');
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          const workbook = XLSX.read(content, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(worksheet) as any[];

          const importedAccounts: Account[] = json.map(row => ({
            id: row.ID || `ACC-${Date.now()}-${Math.random()}`,
            company: row.Company || company,
            code: String(row.Code),
            name: String(row.Name),
            level: Number(row.Level) as Account['level'],
            parentId: row['Parent ID'] || null,
            type: row.Type as any,
          }));

          // Filter to only import accounts for the current company
          const currentCompanyAccounts = importedAccounts.filter(a => a.company === company);
          // Merge with existing accounts, avoiding duplicates by ID
          const existingAccounts = FinanceService.getAccounts().filter(a => a.company !== company);
          FinanceService.saveAccounts([...existingAccounts, ...currentCompanyAccounts]);
          refreshData();
          alert('Accounts imported successfully from Excel!');
        } else {
          alert('Unsupported file type. Please upload a JSON or Excel file.');
        }
      } catch (error: any) {
        alert(`Error importing file: ${error.message}`);
        console.error("Import error:", error);
      }
    };

    if (file.name.endsWith('.json')) {
      reader.readAsText(file);
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.readAsBinaryString(file);
    } else {
      alert('Unsupported file type. Please upload a JSON or Excel file.');
    }
  };

  const handleEditClick = (acc: Account, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingAccount(acc);
    setEditName(acc.name);
    setEditCode(acc.code);
    setIsEditModalOpen(true);
  };

  const handleUpdateAccount = () => {
    if (!editingAccount || !editName) return alert("Account Name is required.");
    
    const updated = { ...editingAccount, name: editName, code: editCode };
    const all = FinanceService.getAccounts();
    const newAccounts = all.map(a => a.id === editingAccount.id ? updated : a);
    
    FinanceService.saveAccounts(newAccounts);
    refreshData();
    setIsEditModalOpen(false);
  };

  const renderNode = (parentId: string | null, level: number) => {
    const children = filteredAccounts.filter(a => a.parentId === parentId);
    if (children.length === 0 && level > 1) return null;

    return (
      <div className={`relative ${level > 1 ? 'ml-6 border-l border-slate-200' : ''}`}>
        {children.sort((a,b) => a.code.localeCompare(b.code)).map(acc => (
          <div key={acc.id} className="relative">
            <div className="py-0.5">
              <div 
                className={`flex items-center group cursor-pointer hover:bg-slate-100 p-2 rounded transition-all ${expandedIds.has(acc.id) ? 'bg-slate-50' : ''}`}
                onClick={() => toggleExpand(acc.id)}
              >
                <div className="w-6 flex items-center justify-center">
                  {accounts.some(a => a.parentId === acc.id) ? (
                    expandedIds.has(acc.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                  ) : <div className={`w-1.5 h-1.5 rounded-full ${acc.level === 5 ? 'bg-blue-600' : 'bg-slate-300'}`}></div>}
                </div>
                <div className="flex items-center space-x-3 flex-1 overflow-hidden">
                  <span className="text-[10px] font-mono font-bold text-slate-400 w-20 shrink-0">{acc.code}</span>
                  <span className={`text-sm truncate ${acc.level === 1 ? 'font-bold uppercase text-slate-900' : acc.level === 5 ? 'font-medium text-blue-700' : 'text-slate-700'}`}>
                    {acc.name}
                  </span>
                  
                  {/* Edit Button - Visible on Hover */}
                  <button 
                    onClick={(e) => handleEditClick(acc, e)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all ml-2"
                    title="Modify Account"
                  >
                    <Edit2 size={12} />
                  </button>

                  <span className="ml-auto text-[9px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 uppercase bg-slate-200 px-2 py-0.5 rounded">Level {acc.level}</span>
                </div>
              </div>
              {expandedIds.has(acc.id) && renderNode(acc.id, level + 1)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // OB Calculation for Modal
  const obTotalDr = Object.values(obEntries).reduce((s: number, x: { debit: number; credit: number }) => s + (Number(x.debit) || 0), 0);
  const obTotalCr = Object.values(obEntries).reduce((s: number, x: { debit: number; credit: number }) => s + (Number(x.credit) || 0), 0);
  const obDiff = Number(obTotalDr) - Number(obTotalCr);

  return (
    <div className="flex bg-white border border-slate-200 shadow-sm min-h-[700px] animate-in fade-in duration-300">
      <div className="w-64 border-r bg-[#f7f9fa] p-4 shrink-0 no-print">
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 px-2">Account Types</h4>
        <div className="space-y-1">
          {categories.map(cat => (
            <button
              key={cat.name}
              onClick={() => setActiveCategory(cat.name)}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded text-sm font-medium transition-all ${activeCategory === cat.name ? 'bg-white shadow-sm border border-slate-200 text-blue-600 font-bold' : 'text-slate-600 hover:bg-white/50'}`}
            >
              <cat.icon size={16} className={cat.color} />
              <span>{cat.name}s</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-6 border-b flex justify-between items-center bg-white sticky top-0 z-10">
          <div className="flex items-center space-x-6 flex-1 max-w-2xl">
            <h3 className="text-lg font-bold text-slate-800 uppercase tracking-tight whitespace-nowrap">Transaction: OB_COA_MAINT</h3>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input type="text" placeholder="Search account hierarchy..." className="sap-input w-full pl-9 py-1.5 text-xs font-bold" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center space-x-2">
             <button onClick={loadOpeningBalances} className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-2 rounded font-bold text-xs hover:bg-emerald-100 flex items-center space-x-2 transition-all"><Calculator size={14}/><span>Set Opening Balances</span></button>
             <button onClick={handleRestoreDefaults} className="bg-blue-50 text-blue-700 border border-blue-200 px-4 py-2 rounded font-bold text-xs hover:bg-blue-100 flex items-center space-x-2 transition-all"><ShieldAlert size={14}/><span>Restore 5-Level COA</span></button>
             <button onClick={handleClearAndReseed} className="bg-rose-50 text-rose-700 border border-rose-200 px-4 py-2 rounded font-bold text-xs hover:bg-rose-100 flex items-center space-x-2 transition-all"><RotateCcw size={14}/><span>Clear & Re-seed</span></button>
             <input type="file" id="import-accounts-input" style={{ display: 'none' }} onChange={handleImport} accept=".json,.xlsx,.xls" />
             <button onClick={() => document.getElementById('import-accounts-input')?.click()} className="sap-btn-ghost flex items-center space-x-2"><FileUp size={14}/><span>Import</span></button>
             <button onClick={handleExport} className="sap-btn-ghost flex items-center space-x-2"><FileDown size={14}/><span>Export</span></button>
             <button onClick={() => setIsDeleteModalOpen(true)} className="sap-btn-ghost text-rose-600 border-rose-200 hover:bg-rose-50 flex items-center space-x-2"><Trash2 size={14}/><span>Delete Node</span></button>
             <button onClick={() => setIsAddModalOpen(true)} className="sap-btn-primary flex items-center space-x-2"><Plus size={14} /><span>New Account</span></button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-8">
          {renderNode(null, 1)}
        </div>
      </div>

      {/* OPENING BALANCES MODAL */}
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="p-6 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-[500]">
           <div className="bg-white rounded w-full max-w-5xl h-[90vh] shadow-2xl flex flex-col overflow-hidden border border-slate-300">
              <div className="px-10 py-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div>
                    <h3 className="text-2xl font-black uppercase tracking-tight">System Opening Balances</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Double Entry Initialization | Level 5 Accounts</p>
                 </div>
                 <button onClick={() => setIsOBModalOpen(false)} className="hover:bg-white/10 p-2 rounded transition-colors"><X size={24} /></button>
              </div>

              <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
                 <table className="w-full bg-white shadow-sm border text-left">
                    <thead className="bg-slate-100 text-[10px] font-black uppercase text-slate-500 sticky top-0 z-10">
                       <tr>
                          <th className="p-3 border-b">Account Code</th>
                          <th className="p-3 border-b">Account Title</th>
                          <th className="p-3 border-b text-right w-40">Debit (PKR)</th>
                          <th className="p-3 border-b text-right w-40">Credit (PKR)</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y text-xs font-bold text-slate-700">
                       {accounts.filter(a => a.level === 5).sort((a,b) => a.code.localeCompare(b.code)).map(acc => (
                          <tr key={acc.id} className="hover:bg-blue-50/50">
                             <td className="p-3 font-mono text-slate-400">{acc.code}</td>
                             <td className="p-3">{acc.name}</td>
                             <td className="p-2 text-right">
                                <input 
                                  type="number" 
                                  className="w-full text-right p-2 border rounded bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" 
                                  value={obEntries[acc.id]?.debit || ''}
                                  onChange={e => updateOBEntry(acc.id, 'debit', e.target.value)}
                                  placeholder="0"
                                />
                             </td>
                             <td className="p-2 text-right">
                                <input 
                                  type="number" 
                                  className="w-full text-right p-2 border rounded bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" 
                                  value={obEntries[acc.id]?.credit || ''}
                                  onChange={e => updateOBEntry(acc.id, 'credit', e.target.value)}
                                  placeholder="0"
                                />
                             </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>

              <div className="px-10 py-6 bg-white border-t flex justify-between items-center shrink-0">
                 <div className="flex items-center space-x-8 text-sm">
                    <div>
                       <span className="text-[10px] font-black uppercase text-slate-400 block">Total Debit</span>
                       <span className="font-black text-slate-900">{obTotalDr.toLocaleString()}</span>
                    </div>
                    <div>
                       <span className="text-[10px] font-black uppercase text-slate-400 block">Total Credit</span>
                       <span className="font-black text-slate-900">{obTotalCr.toLocaleString()}</span>
                    </div>
                    <div className={`px-4 py-2 rounded border ${obDiff === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                       <span className="text-[10px] font-black uppercase block">Difference</span>
                       <span className="font-black">{obDiff.toLocaleString()}</span>
                    </div>
                 </div>
                 <div className="flex space-x-3">
                    <button onClick={() => setIsOBModalOpen(false)} className="sap-btn-ghost">Cancel</button>
                    <button onClick={handleSaveOpeningBalances} disabled={Math.abs(obDiff) > 0.01} className="sap-btn-primary disabled:opacity-50 disabled:cursor-not-allowed">Post Balances</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* ADD MODAL */}
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="p-6 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[400]">
          <div className="bg-white rounded w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-300 animate-in zoom-in duration-200">
            <div className="sap-object-header flex justify-between items-start shrink-0">
               <div>
                  <div className="flex items-center space-x-3 text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-2">
                    <Landmark size={14}/> <span>Transaction: FSS0 Account Create</span>
                  </div>
                  <h3 className="text-2xl font-bold uppercase tracking-tight">Financial Node Maintenance</h3>
               </div>
               <button onClick={() => setIsAddModalOpen(false)} className="hover:bg-white/10 p-2 rounded transition-colors"><X size={24} /></button>
            </div>
            
            <div className="p-8 space-y-6 bg-slate-50 flex-1 overflow-y-auto">
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold uppercase text-slate-500">Level 1: Account Class</label>
                     <select value={addSelections.l1} onChange={e => setAddSelections({ l1: e.target.value, l2: '', l3: '', l4: '' })} className="sap-input w-full font-bold">
                        <option value="">Select Class...</option>
                        {add_l1List.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                     </select>
                  </div>
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold uppercase text-slate-500">Level 2: IFRS Group</label>
                     <select disabled={!addSelections.l1} value={addSelections.l2} onChange={e => setAddSelections({ ...addSelections, l2: e.target.value, l3: '', l4: '' })} className="sap-input w-full font-bold">
                        <option value="">Select Group...</option>
                        {add_l2List.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                     </select>
                  </div>
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold uppercase text-slate-500">Level 3: Control Account</label>
                     <select disabled={!addSelections.l2} value={addSelections.l3} onChange={e => setAddSelections({ ...addSelections, l3: e.target.value, l4: '' })} className="sap-input w-full font-bold">
                        <option value="">Select Control...</option>
                        {add_l3List.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                     </select>
                  </div>
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold uppercase text-slate-500">Level 4: Sub-Ledger</label>
                     <select disabled={!addSelections.l3} value={addSelections.l4} onChange={e => setAddSelections({ ...addSelections, l4: e.target.value })} className="sap-input w-full font-bold">
                        <option value="">Select Sub-Ledger (Optional)...</option>
                        {add_l4List.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                     </select>
                  </div>
               </div>

               <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-start space-x-3">
                  <Info size={20} className="text-blue-600 shrink-0"/>
                  <p className="text-xs text-blue-800 leading-tight">
                     <strong>Hierarchy Logic:</strong> Selecting a Level 4 parent will create a Level 5 (Transaction) account. Selecting Level 3 will create Level 4, and so on.
                  </p>
               </div>

               <div className="space-y-4 pt-4 border-t border-slate-200">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-slate-500">New Account Description</label>
                      <input type="text" placeholder="e.g. Furnace A" value={newAccName} onChange={e => setNewAccName(e.target.value)} className="sap-input w-full font-bold" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-slate-500">Manual G/L Code</label>
                      <input type="text" placeholder="Auto if blank" value={newAccCode} onChange={e => setNewAccCode(e.target.value)} className="sap-input w-full font-mono font-bold text-blue-600" />
                    </div>
                  </div>
               </div>
            </div>

            <div className="px-8 py-4 bg-white border-t flex justify-end space-x-3 shrink-0">
               <button onClick={() => setIsAddModalOpen(false)} className="sap-btn-ghost">Cancel</button>
               <button onClick={handleSaveAccount} disabled={!addSelections.l1 || !newAccName} className="sap-btn-primary disabled:opacity-30">Save Account</button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {isEditModalOpen && editingAccount && (
        <SidePanel isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Account" width="md">
          <div className="bg-white rounded w-full max-w-lg shadow-2xl overflow-hidden flex flex-col border border-slate-300 animate-in zoom-in duration-200">
            <div className="bg-slate-900 px-8 py-6 text-white flex justify-between items-center shrink-0">
               <div className="flex items-center space-x-3">
                  <Edit2 size={20}/>
                  <h3 className="text-xl font-bold uppercase tracking-tight">Edit Account</h3>
               </div>
               <button onClick={() => setIsEditModalOpen(false)}><X size={24}/></button>
            </div>
            
            <div className="p-8 space-y-6 bg-slate-50">
               <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl">
                  <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1">Hierarchy Context</p>
                  <p className="text-sm font-bold text-slate-800">Level {editingAccount.level} Node</p>
               </div>

               <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Account Description</label>
                  <input 
                    type="text" 
                    value={editName} 
                    onChange={e => setEditName(e.target.value)} 
                    className="sap-input w-full font-bold"
                  />
               </div>

               <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-500">G/L Code</label>
                  <input 
                    type="text" 
                    value={editCode} 
                    onChange={e => setEditCode(e.target.value)} 
                    className="sap-input w-full font-mono font-bold text-blue-600"
                  />
               </div>
            </div>

            <div className="px-8 py-4 bg-white border-t flex justify-end space-x-3 shrink-0">
               <button onClick={() => setIsEditModalOpen(false)} className="sap-btn-ghost">Cancel</button>
               <button onClick={handleUpdateAccount} className="sap-btn-primary">Update Account</button>
            </div>
          </div>
        </SidePanel>

      {/* DELETE MODAL (UPDATED 5-LEVEL SUPPORT) */}
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="p-6 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[400]">
          <div className="bg-white rounded w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-300 animate-in zoom-in duration-200">
            <div className="bg-[#bb0000] p-6 text-white flex justify-between items-center shrink-0">
               <div className="flex items-center space-x-3">
                  <Trash2 size={24}/>
                  <h3 className="text-xl font-bold uppercase">Decommission Node</h3>
               </div>
               <button onClick={() => setIsDeleteModalOpen(false)}><X size={24}/></button>
            </div>
            
            <div className="p-8 space-y-6 bg-slate-50 flex-1 overflow-y-auto">
               <div className="bg-rose-50 p-4 border border-rose-100 rounded-xl flex items-start space-x-3">
                  <ShieldAlert size={20} className="text-rose-600 shrink-0"/>
                  <p className="text-xs text-rose-800 leading-tight">
                     <strong>Safety Protocol:</strong> You can only delete accounts that have <u>no sub-accounts</u> or children nodes. Please delete from the bottom (Level 5) up.
                  </p>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold uppercase text-slate-500">Level 1: Account Class</label>
                     <select value={delSelections.l1} onChange={e => setDelSelections({ l1: e.target.value, l2: '', l3: '', l4: '', l5: '' })} className="sap-input w-full font-bold">
                        <option value="">Select Class...</option>
                        {del_l1List.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                     </select>
                  </div>
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold uppercase text-slate-500">Level 2: Group</label>
                     <select disabled={!delSelections.l1} value={delSelections.l2} onChange={e => setDelSelections({ ...delSelections, l2: e.target.value, l3: '', l4: '', l5: '' })} className="sap-input w-full font-bold">
                        <option value="">Select Group (Target?)...</option>
                        {del_l2List.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                     </select>
                  </div>
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold uppercase text-slate-500">Level 3: Control</label>
                     <select disabled={!delSelections.l2} value={delSelections.l3} onChange={e => setDelSelections({ ...delSelections, l3: e.target.value, l4: '', l5: '' })} className="sap-input w-full font-bold">
                        <option value="">Select Control (Target?)...</option>
                        {del_l3List.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                     </select>
                  </div>
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold uppercase text-slate-500">Level 4: Sub-Ledger</label>
                     <select disabled={!delSelections.l3} value={delSelections.l4} onChange={e => setDelSelections({ ...delSelections, l4: e.target.value, l5: '' })} className="sap-input w-full font-bold">
                        <option value="">Select Sub-Ledger (Target?)...</option>
                        {del_l4List.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                     </select>
                  </div>
                  <div className="space-y-1 col-span-2">
                     <label className="text-[10px] font-bold uppercase text-slate-500">Level 5: Transaction</label>
                     <select disabled={!delSelections.l4} value={delSelections.l5} onChange={e => setDelSelections({ ...delSelections, l5: e.target.value })} className="sap-input w-full font-bold">
                        <option value="">Select Transaction Acc (Target?)...</option>
                        {del_l5List.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                     </select>
                  </div>
               </div>
            </div>

            <div className="px-8 py-4 bg-white border-t flex justify-end space-x-3 shrink-0">
               <button onClick={() => setIsDeleteModalOpen(false)} className="sap-btn-ghost">Cancel</button>
               <button 
                 onClick={handleProcessDelete} 
                 disabled={!delSelections.l1} 
                 className="bg-[#bb0000] text-white px-6 py-2 rounded font-bold text-sm hover:bg-[#a00000] disabled:opacity-30 flex items-center space-x-2"
               >
                 <Trash2 size={16}/> <span>Confirm Delete</span>
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChartOfAccounts;
