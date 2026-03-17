
import React, { useState, useMemo, useEffect } from 'react';
import { Project, Client, LedgerTransaction } from '../../shared/types';
import { ProjectService } from '../services/projectService';
import { SidePanel } from '@/modules/shared/components/SidePanel';
import { FinanceService } from '../../finance/services/financeService';
import { Plus, Save, Activity, Layout, PenTool, Hash, Box, Hammer, AlertTriangle, Wallet } from 'lucide-react';

interface ProjectPortfolioProps {
    projects: Project[];
    clients: Client[];
    onSelectProject: (p: Project) => void;
    refreshData: () => void;
    company: string;
}

const ProjectPortfolio: React.FC<ProjectPortfolioProps> = ({ projects, clients, onSelectProject, refreshData, company }) => {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [clientSearch, setClientSearch] = useState('');
    const [ledger, setLedger] = useState<LedgerTransaction[]>([]);
    const [newProjectForm, setNewProjectForm] = useState({
        title: '', clientId: '', manualRef: '',
        quotationDate: new Date().toISOString().split('T')[0],
        startDate: new Date().toISOString().split('T')[0],
        deliveryDate: '',
        glassValue: 0, aluminiumValue: 0, hardwareValue: 0, installationValue: 0, consumablesValue: 0, finalSettlementValue: 0
    });

    useEffect(() => {
        const fetchLedger = async () => {
            const ledgerData = FinanceService.getLedger();
            setLedger(ledgerData);
        };
        fetchLedger();
    }, [projects]);

    const handleCreateProject = () => {
        if(!newProjectForm.title) return alert("Project Title is required.");
        
        // Resolve Client from Search
        const matchedClient = clients.find(c => c.name.toLowerCase() === clientSearch.toLowerCase());
        if (!matchedClient) return alert("Invalid Client: Please select a registered client from the list.");
        
        const totalBudget = (Number(newProjectForm.glassValue) || 0) + (Number(newProjectForm.aluminiumValue) || 0) + (Number(newProjectForm.hardwareValue) || 0) + (Number(newProjectForm.installationValue) || 0) + (Number(newProjectForm.consumablesValue) || 0);
        // Use user input for Final Value, otherwise default to budget sum
        const doneValue = Number(newProjectForm.finalSettlementValue) || totalBudget;
  
        const newProj: Project = {
            id: `PROJ-${Date.now()}`,
            quotationId: '', 
            company: company as any,
            clientId: matchedClient.id,
            title: newProjectForm.title.toUpperCase(),
            status: 'Active',
            startDate: newProjectForm.startDate,
            value: totalBudget, 
            finalSettlementValue: doneValue,
            manualRef: newProjectForm.manualRef.toUpperCase(),
            quotationDate: newProjectForm.quotationDate,
            deliveryDate: newProjectForm.deliveryDate,
            glassValue: Number(newProjectForm.glassValue),
            aluminiumValue: Number(newProjectForm.aluminiumValue),
            hardwareValue: Number(newProjectForm.hardwareValue),
            installationValue: Number(newProjectForm.installationValue),
            consumablesValue: Number(newProjectForm.consumablesValue),
            glassConsumed: 0, aluminiumConsumed: 0, hardwareConsumed: 0, otherConsumed: 0, consumablesConsumed: 0,
            timeline: [{ date: new Date().toISOString().split('T')[0], event: 'Project Created (Cost Control Active)', type: 'info' }]
        };
  
        ProjectService.saveProjects([...ProjectService.getProjects(), newProj]);
        refreshData();
        setIsCreateOpen(false);
        setClientSearch('');
        setNewProjectForm({ title: '', clientId: '', manualRef: '', quotationDate: new Date().toISOString().split('T')[0], startDate: new Date().toISOString().split('T')[0], deliveryDate: '', glassValue: 0, aluminiumValue: 0, hardwareValue: 0, installationValue: 0, consumablesValue: 0, finalSettlementValue: 0 });
    };

    const CostProgressBar = ({ label, budget, actual, colorClass }: { label: string, budget: number, actual: number, colorClass: string }) => {
        if (budget <= 0 && actual <= 0) return null;
        const percentage = budget > 0 ? Math.min((actual / budget) * 100, 100) : (actual > 0 ? 100 : 0);
        const isOverBudget = actual > budget && budget > 0;
        let barColor = colorClass.replace('text-', 'bg-');
        if (isOverBudget) barColor = 'bg-rose-500'; else if (percentage > 80) barColor = 'bg-amber-500';
  
        return (
            <div className="space-y-1 mb-3">
                <div className="flex justify-between items-end text-[10px] uppercase font-bold">
                    <span className={isOverBudget ? 'text-rose-600' : 'text-slate-500'}>{label}</span>
                    <div className="text-right"><span className={`${isOverBudget ? 'text-rose-600' : 'text-slate-800'}`}>{actual.toLocaleString()}</span><span className="text-slate-400 mx-1">/</span><span className="text-slate-400">{budget.toLocaleString()}</span></div>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex"><div className={`h-full transition-all duration-500 ${barColor}`} style={{ width: `${percentage}%` }}></div></div>
            </div>
        );
    };

    const getReceivedAmount = (project: Project) => {
        // Scan ledger for receipts (DZ/CJ) referencing this project
        const relevantTxs = ledger.filter(t => 
            (t.docType === 'DZ' || t.docType === 'CJ' || t.docType === 'SA') && 
            t.status === 'Posted' &&
            (t.description.includes(project.title.toUpperCase()) || (project.manualRef && t.description.includes(project.manualRef)) || t.referenceId === project.id)
        );
        
        // Sum the credits in these transactions. Since receipts usually Credit Customer/Project Revenue account.
        // We sum all credit lines to avoid double counting if multiple lines.
        // Assuming balanced transaction, sum of credits = transaction value.
        // NOTE: This is an estimation based on description matching.
        return relevantTxs.reduce((sum, tx) => {
            // Only count if it looks like a receipt (Credit > 0)
            const creditSum = tx.details.reduce((s, d) => s + d.credit, 0);
            return sum + creditSum;
        }, 0);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border shadow-sm no-print">
                <div className="flex items-center space-x-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Activity size={20}/></div>
                    <div><h3 className="font-bold text-slate-700 uppercase">Project Cost Control</h3><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Budget vs Actual Analysis</p></div>
                </div>
                <button onClick={() => setIsCreateOpen(true)} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest flex items-center space-x-2 shadow-lg hover:bg-blue-600 transition-all"><Plus size={16} /> <span>New Project Budget</span></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map(p => {
                    const totalConsumed = (p.glassConsumed || 0) + (p.aluminiumConsumed || 0) + (p.hardwareConsumed || 0) + (p.consumablesConsumed || 0) + (p.otherConsumed || 0);
                    const revenue = p.finalSettlementValue || p.value || 1;
                    const margin = ((revenue - totalConsumed) / revenue) * 100;
                    const received = getReceivedAmount(p);
                    
                    return (
                        <div key={p.id} onClick={() => onSelectProject(p)} className="bg-white p-6 rounded-[2rem] border shadow-sm hover:shadow-xl hover:border-blue-300 transition-all cursor-pointer group flex flex-col justify-between h-full">
                            <div>
                                <div className="flex justify-between items-start mb-4">
                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${p.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{p.status}</span>
                                    <div className="text-right"><p className="text-[10px] font-bold text-slate-400">{p.id}</p>{p.manualRef && <p className="text-[9px] font-black text-blue-600 uppercase">Ref: {p.manualRef}</p>}</div>
                                </div>
                                <div className="mb-6"><h4 className="font-black text-lg text-slate-800 uppercase leading-tight mb-1 truncate">{p.title}</h4><p className="text-xs text-blue-600 font-bold uppercase">{clients.find(c => c.id === p.clientId)?.name || 'Unknown'}</p></div>
                                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-4 pointer-events-none">
                                    <div className="flex justify-between items-center mb-4 border-b border-slate-200 pb-2">
                                        <span className="text-[10px] font-black uppercase text-slate-500">Financial Health</span>
                                        <span className={`text-xs font-black ${margin < 15 ? 'text-rose-600' : 'text-emerald-600'}`}>{margin.toFixed(1)}% Margin</span>
                                    </div>
                                    <CostProgressBar label="Glass" budget={p.glassValue || 0} actual={p.glassConsumed || 0} colorClass="text-blue-500" />
                                    <CostProgressBar label="Aluminium" budget={p.aluminiumValue || 0} actual={p.aluminiumConsumed || 0} colorClass="text-orange-500" />
                                    <CostProgressBar label="Hardware" budget={p.hardwareValue || 0} actual={p.hardwareConsumed || 0} colorClass="text-slate-600" />
                                    <CostProgressBar label="Consumables" budget={p.consumablesValue || 0} actual={p.consumablesConsumed || 0} colorClass="text-teal-500" />
                                    <CostProgressBar label="Install/Other" budget={p.installationValue || 0} actual={p.otherConsumed || 0} colorClass="text-purple-500" />
                                </div>
                            </div>
                            <div className="space-y-3 pt-4 border-t border-slate-100">
                                <div className="grid grid-cols-2 gap-4">
                                    <div><p className="text-[9px] font-black text-slate-400 uppercase">Consumed Cost</p><p className="text-lg font-black text-rose-600">PKR {totalConsumed.toLocaleString()}</p></div>
                                    <div className="text-right">
                                        <p className="text-[9px] font-black text-slate-400 uppercase flex items-center justify-end gap-1"><Wallet size={10}/> Received</p>
                                        <p className="text-lg font-black text-emerald-600">PKR {received.toLocaleString()}</p>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center bg-slate-100 p-2 rounded-lg">
                                    <span className="text-[10px] font-black text-slate-500 uppercase">Contract Value</span>
                                    <span className="text-sm font-black text-slate-900">PKR {revenue.toLocaleString()}</span>
                                </div>
                                {totalConsumed > revenue && <div className="bg-rose-50 border border-rose-100 p-2 rounded-lg flex items-center justify-center gap-2 text-rose-700"><AlertTriangle size={12}/><span className="text-[10px] font-black uppercase">Loss Alert</span></div>}
                            </div>
                        </div>
                    );
                })}
            </div>

            <SidePanel isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="New Project" width="xl">
          <div className="p-6">                        <div className="px-8 py-6 bg-slate-900 text-white border-b flex justify-between items-center shrink-0">
                            <div><h3 className="font-black uppercase text-xl">Project Budget Initiation</h3><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Cost Center Setup</p></div>
                            <button onClick={() => setIsCreateOpen(false)}><Plus size={24} className="rotate-45"/></button>
                        </div>
                        <div className="p-8 space-y-8 overflow-y-auto bg-slate-50">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2"><label className="text-[10px] font-black uppercase text-slate-500 ml-1">Project Title</label><input type="text" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold uppercase" value={newProjectForm.title} onChange={e => setNewProjectForm({...newProjectForm, title: e.target.value})} /></div>
                                
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Client (Search)</label>
                                    <input 
                                        list="clientOptions" 
                                        className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm" 
                                        value={clientSearch} 
                                        onChange={e => setClientSearch(e.target.value)} 
                                        placeholder="Type to search..."
                                    />
                                    <datalist id="clientOptions">
                                        {clients.map(c => <option key={c.id} value={c.name} />)}
                                    </datalist>
                                </div>
                                
                                <div><label className="text-[10px] font-black uppercase text-slate-500 ml-1">Manual Ref</label><input type="text" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold uppercase" value={newProjectForm.manualRef} onChange={e => setNewProjectForm({...newProjectForm, manualRef: e.target.value})} /></div>
                                
                                <div className="col-span-2">
                                    <label className="text-[10px] font-black uppercase text-emerald-600 ml-1">Total Project Value (Contract Price)</label>
                                    <input 
                                        type="number" 
                                        className="w-full p-3 bg-emerald-50 border border-emerald-200 rounded-xl font-black text-emerald-800 text-lg" 
                                        value={newProjectForm.finalSettlementValue || ''} 
                                        onChange={e => setNewProjectForm({...newProjectForm, finalSettlementValue: Number(e.target.value)})} 
                                        placeholder="Enter Final Settlement Amount"
                                    />
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                {[{l:'Glass Budget',i:Layout,k:'glassValue'}, {l:'Aluminium Budget',i:PenTool,k:'aluminiumValue'}, {l:'Hardware Budget',i:Hash,k:'hardwareValue'}, {l:'Consumables Budget',i:Box,k:'consumablesValue'}, {l:'Installation Budget',i:Hammer,k:'installationValue'}].map((f:any) => (
                                    <div key={f.k}>
                                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1 flex items-center gap-1"><f.i size={10}/> {f.l}</label>
                                        <input type="number" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-800" value={newProjectForm[f.k as keyof typeof newProjectForm]} onChange={e => setNewProjectForm({...newProjectForm, [f.k]: Number(e.target.value)})} placeholder="0"/>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="px-8 py-6 bg-white border-t flex justify-end space-x-3 shrink-0"><button onClick={() => setIsCreateOpen(false)} className="px-6 py-2 text-slate-400 font-bold uppercase text-xs">Cancel</button><button onClick={handleCreateProject} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-blue-600 transition-all flex items-center space-x-2"><Save size={14}/> <span>Activate</span></button></div>
                    </div>
        </SidePanel>
        </div>
    );
};

export default ProjectPortfolio;
