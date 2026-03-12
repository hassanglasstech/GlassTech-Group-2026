import React, { useState } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { toast } from 'sonner';
import { Company, StoreItem, CostCenter, Project, MaterialLedgerEntry } from '@/modules/shared/types';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { ProjectService } from '@/modules/projects/services/projectService';
import { FinanceService } from '@/modules/finance/services/financeService';
import { PackageCheck, ArrowUpRight, Folder, UserCircle } from 'lucide-react';

interface GoodsIssueProps {
    company: Company;
    items: StoreItem[];
    costCenters: CostCenter[];
    projects: Project[];
    ledger: MaterialLedgerEntry[];
    refreshData: () => void;
}

const GoodsIssue: React.FC<Omit<GoodsIssueProps, 'company'>> = ({ items, costCenters, projects, ledger, refreshData }) => {
    const company = useAppStore(state => state.selectedCompany);
    const [issueData, setIssueData] = useState({
        materialId: '',
        qty: 0,
        costCenterId: '',
        projectId: '', 
        recipient: '',
        remarks: ''
    });

    const handlePostIssuance = () => {
        if (!issueData.materialId || !issueData.costCenterId || issueData.qty <= 0) {
            toast.error("All fields are required for issuance.");
            return;
        }
        
        const itemIdx = items.findIndex(i => i.id === issueData.materialId);
        if (itemIdx === -1) {
            toast.error("Item not found in store.");
            return;
        }
        
        const item = { ...items[itemIdx] };
        
        if (item.unrestrictedQty < issueData.qty) {
            toast.error(`Insufficient Stock! Available: ${item.unrestrictedQty} ${item.unit}`);
            return;
        }
  
        // Calculate Value of Consumed Goods (at Moving Average Price)
        const consumedValue = issueData.qty * item.movingAveragePrice;
  
        // Update Stock
        item.quantity -= issueData.qty;
        item.unrestrictedQty -= issueData.qty;
        item.totalValue -= consumedValue;
        
        // Update DB
        const updatedStore = [...InventoryService.getStore().filter(i => i.id !== item.id), item];
        InventoryService.saveStore(updatedStore);
  
        // --- PHASE 1: PROJECT ACTUAL COST UPDATE ---
        if (issueData.projectId) {
            const allProjects = ProjectService.getProjects();
            const targetProj = allProjects.find(p => p.id === issueData.projectId);
            
            if (targetProj) {
                // Determine category for cost allocation
                // Comment: Fix type mismatch by casting category to string for 'Glass' comparison
                if ((item.category as string) === 'Glass') {
                    targetProj.glassConsumed = (targetProj.glassConsumed || 0) + consumedValue;
                } else if (item.category === 'Profile' || item.name.includes('ALUMINIUM') || item.name.includes('PROFILE')) {
                    targetProj.aluminiumConsumed = (targetProj.aluminiumConsumed || 0) + consumedValue;
                } else if (item.category === 'Hardware') {
                    targetProj.hardwareConsumed = (targetProj.hardwareConsumed || 0) + consumedValue;
                } else {
                    targetProj.otherConsumed = (targetProj.otherConsumed || 0) + consumedValue;
                }
  
                // Log Timeline
                targetProj.timeline.push({
                    date: new Date().toISOString().split('T')[0],
                    event: `Material Issued: ${item.name} (${issueData.qty} ${item.unit}) - Cost: ${Math.round(consumedValue)}`,
                    type: 'info'
                });
  
                // Save Project
                const updatedProjects = allProjects.map(p => p.id === targetProj.id ? targetProj : p);
                ProjectService.saveProjects(updatedProjects);
            }
        }
  
        // Ledger Entry (Movement 201 - Consumption for Cost Center)
        const selectedCC = costCenters.find(c => c.id === issueData.costCenterId);
        const selectedProject = projects.find(p => p.id === issueData.projectId);
        const docId = `GI-${Date.now().toString().slice(-6)}`;
        
        const newEntry: MaterialLedgerEntry = {
            id: docId,
            company,
            materialId: item.id,
            timestamp: new Date().toISOString(),
            mvmntCode: '201', // Consumption for Cost Center
            qty: -issueData.qty, // Negative for Issue
            uom: item.unit,
            valuation: item.movingAveragePrice,
            balanceAfter: item.quantity,
            referenceDoc: `CC-${selectedCC?.code}`,
            user: issueData.recipient || 'Store Keeper',
            remarks: `Issued to ${selectedCC?.name}${selectedProject ? ` [Prj: ${selectedProject.title}]` : ''}. ${issueData.remarks}`,
            storageBin: item.storageBin,
            projectId: issueData.projectId
        };
  
        InventoryService.saveStockLedger([...InventoryService.getStockLedger(), newEntry]);
        
        // *** NEW FINANCIAL EVENT LOGGING ***
        // Create a pending event in the Financial Registry for this consumption
        if (consumedValue > 0) {
            const events = FinanceService.getFinancialEvents();
            FinanceService.saveFinancialEvents([...events, {
                id: `EVT-${Date.now()}`,
                company,
                date: new Date().toISOString().split('T')[0],
                sourceModule: 'Inventory',
                description: `Consumption: ${item.name} for ${selectedCC?.name}`,
                amount: consumedValue,
                referenceId: docId,
                status: 'Pending'
            }]);
        }
  
        refreshData();
        setIssueData({ materialId: '', qty: 0, costCenterId: '', projectId: '', recipient: '', remarks: '' });
        toast.success(`${issueData.qty} ${item.unit} issued to ${selectedCC?.name}.\nCost Allocated to Project: ${selectedProject ? selectedProject.title : 'None'}.`);
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 animate-in slide-in-from-right duration-300">
            <div className="col-span-1 md:col-span-8 bg-white rounded-[2rem] border border-slate-200 shadow-sm p-8 space-y-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-black uppercase text-slate-900">Internal Goods Issue</h2>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Issue stock to production or consumption (Mvmnt 201/261)</p>
                    </div>
                    <div className="p-4 bg-rose-50 rounded-2xl">
                        <ArrowUpRight size={24} className="text-rose-600"/>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Select Item to Issue</label>
                        <select 
                            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-rose-500 transition-all"
                            value={issueData.materialId}
                            onChange={e => setIssueData({...issueData, materialId: e.target.value})}
                        >
                            <option value="">-- Choose Store Item --</option>
                            {items.map(i => (
                                <option key={i.id} value={i.id}>{i.name} (Avl: {i.unrestrictedQty} {i.unit})</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Quantity to Issue</label>
                        <input 
                            type="number" 
                            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-lg text-rose-600 outline-none focus:border-rose-500 transition-all"
                            value={issueData.qty || ''}
                            onChange={e => setIssueData({...issueData, qty: Number(e.target.value)})}
                            placeholder="0.00"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Cost Center (Department)</label>
                        <select 
                            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-rose-500 transition-all uppercase"
                            value={issueData.costCenterId}
                            onChange={e => setIssueData({...issueData, costCenterId: e.target.value})}
                        >
                            <option value="">-- Select Dept --</option>
                            {costCenters.map(c => (
                                <option key={c.id} value={c.id}>[{c.code}] {c.name}</option>
                            ))}
                        </select>
                    </div>
                    
                    {/* PHASE 1: PROJECT LINKAGE */}
                    <div className="space-y-1.5 animate-in fade-in">
                        <label className="text-[10px] font-black uppercase text-indigo-600 ml-1 flex items-center gap-1"><Folder size={10}/> <span>Project Link (Optional)</span></label>
                        <select 
                            className="w-full p-4 bg-indigo-50 border-2 border-indigo-100 rounded-2xl font-bold text-sm outline-none focus:border-indigo-500 transition-all uppercase text-indigo-900"
                            value={issueData.projectId}
                            onChange={e => setIssueData({...issueData, projectId: e.target.value})}
                        >
                            <option value="">-- Consumable / No Project --</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.title}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Recipient Name</label>
                        <div className="relative">
                            <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                            <input 
                                type="text" 
                                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-rose-500 transition-all uppercase"
                                value={issueData.recipient}
                                onChange={e => setIssueData({...issueData, recipient: e.target.value})}
                                placeholder="e.g. ALI AHMED"
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Remarks / Reference</label>
                        <input 
                            type="text" 
                            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-rose-500 transition-all uppercase"
                            value={issueData.remarks}
                            onChange={e => setIssueData({...issueData, remarks: e.target.value})}
                            placeholder="e.g. FOR MAINTENANCE"
                        />
                    </div>
                </div>

                <button 
                    onClick={handlePostIssuance}
                    className="w-full bg-rose-600 hover:bg-rose-700 text-white py-4 rounded-2xl font-black uppercase text-sm tracking-widest shadow-xl shadow-rose-200 transition-all active:scale-95 flex items-center justify-center space-x-3"
                >
                    <PackageCheck size={20}/> <span>Post Goods Issue</span>
                </button>
            </div>

            <div className="col-span-1 md:col-span-4 bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="p-6 bg-slate-50 border-b">
                    <h3 className="font-black uppercase text-slate-700 text-sm">Recent Issuances</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[600px]">
                    {ledger.filter(l => l.mvmntCode === '201').slice(0, 10).map(l => {
                        const linkedProject = projects.find(p => p.id === l.projectId);
                        const item = items.find(i => i.id === l.materialId);
                        return (
                        <div key={l.id} className="p-4 border rounded-xl bg-white hover:border-rose-200 transition-all">
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-[10px] font-black text-rose-600 uppercase">GI {l.id}</span>
                                <span className="text-[9px] font-bold text-slate-400">{l.timestamp.split('T')[0]}</span>
                            </div>
                            <p className="text-xs font-bold text-slate-800 uppercase mb-1">{item?.name || l.materialId}</p>
                            {linkedProject && (
                                <div className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[9px] font-black uppercase mb-2 border border-indigo-100">
                                    Proj: {linkedProject.title}
                                </div>
                            )}
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">{l.referenceDoc}</span>
                                <span className="text-sm font-black text-rose-700">{Math.abs(l.qty)} <span className="text-[9px] font-bold">{l.uom}</span></span>
                            </div>
                        </div>
                    )})}
                    {ledger.filter(l => l.mvmntCode === '201').length === 0 && (
                        <div className="text-center py-10 text-slate-300 font-bold uppercase text-xs italic">No recent issuances.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GoodsIssue;
