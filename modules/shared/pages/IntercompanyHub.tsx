
import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Company, PurchaseOrder, Project, Client } from '../types';
import { InventoryService } from '../../procurement/services/inventoryService';
import { SalesService } from '../../sales/services/salesService';
import { ProjectService } from '../../projects/services/projectService';
import { Globe, Inbox, CheckCircle2, Clock, Truck, ShieldAlert, Package, MessageCircle, FolderPlus, Folder, ArrowRight, X, RefreshCw, History, FilePlus, AlertTriangle, Search, ArrowUpRight, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAppStore } from '../store/appStore';

const IntercompanyHub: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'inbox' | 'history'>('inbox');
  const [inbox, setInbox] = useState<PurchaseOrder[]>([]);
  const [history, setHistory] = useState<PurchaseOrder[]>([]);
  
  // Project Reconciliation State
  const [isReconcileOpen, setIsReconcileOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  
  // Form State for Linking
  const [selectedExistingProjectId, setSelectedExistingProjectId] = useState('');

  useEffect(() => {
    refreshData();
  }, [company]);

  const refreshData = () => {
    const allPOs = InventoryService.getPurchaseOrders();
    const myProjects = ProjectService.getProjects().filter(p => p.company === company);
    const myClients = SalesService.getClients().filter(c => c.company === company);
    
    setProjects(myProjects);
    setClients(myClients);

    // Filter Logic
    const relevantPOs = allPOs.filter(p => p.toVendor === company || p.fromCompany === company);
    
    // Inbox: Needs Action (Incoming 'Sent' OR My Outgoing 'Sent' waiting for my approval)
    const pending = relevantPOs.filter(p => p.status === 'Sent' && p.fromCompany === company);
    
    // History: Already Processed or Incoming Orders (Vendor View)
    // Note: If I am the Vendor (receiving order), I see it in History to process production. 
    // If I am Buyer (GTK), I see approved orders here too.
    const processed = relevantPOs.filter(p => 
        (p.status !== 'Sent') || 
        (p.status === 'Sent' && p.toVendor === company) // Incoming orders for Vendor to view
    ).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    setInbox(pending);
    setHistory(processed);
  };

  const handleAcceptClick = (po: PurchaseOrder) => {
      // 1. Check if Project Name exists perfectly
      const incomingProjectName = po.projectId || ''; // PO.projectId holds the Name string temporarily
      const exactMatch = projects.find(p => p.title.toUpperCase() === incomingProjectName.toUpperCase());

      if (exactMatch) {
          // Scenario A: Exact Match Found - Auto Link
          if(confirm(`Project match found: "${exactMatch.title}".\n\nLink order and accept?`)) {
              processAcceptance(po, exactMatch.id);
          }
      } else {
          // Scenario B: No Match - Open Reconciliation Modal
          setSelectedPO(po);
          setIsReconcileOpen(true);
      }
  };

  const processAcceptance = (po: PurchaseOrder, realProjectId: string) => {
      // 1. Update PO Status and Link
      const allPOs = InventoryService.getPurchaseOrders();
      const updatedPOs = allPOs.map(p => {
          if (p.id === po.id) {
              return { 
                  ...p, 
                  status: 'Received' as const, 
                  projectId: realProjectId // Replace Name string with Real ID
              };
          }
          return p;
      });
      InventoryService.savePurchaseOrders(updatedPOs);
      
      // 2. Update Project Cost (Add PO Amount to Consumed Budget)
      const allProjects = ProjectService.getProjects();
      const project = allProjects.find(p => p.id === realProjectId);
      if (project) {
          // Determine which bucket to charge based on PO Category
          const amount = po.totalAmount || 0;
          const cat = po.category || 'Glass'; // Default to Glass if undefined

          if (cat === 'Glass') project.glassConsumed = (project.glassConsumed || 0) + amount;
          else if (cat === 'Aluminium') project.aluminiumConsumed = (project.aluminiumConsumed || 0) + amount;
          else if (cat === 'Hardware') project.hardwareConsumed = (project.hardwareConsumed || 0) + amount;
          else if (cat === 'Installation') project.otherConsumed = (project.otherConsumed || 0) + amount;
          else project.otherConsumed = (project.otherConsumed || 0) + amount;

          // Add Timeline Event
          project.timeline.push({
              date: new Date().toISOString().split('T')[0],
              event: `Intercompany PO ${po.id} Accepted. Charged ${amount.toLocaleString()} to ${cat} Budget.`,
              type: 'info'
          });
          ProjectService.saveProjects(allProjects); // Save mutation
      }

      refreshData();
      setIsReconcileOpen(false);
      toast.success("Order Accepted & Project Consumption Updated.", { duration: 3000 });
  };

  const handleConfirmReconciliation = () => {
      if (!selectedPO) return;
      if (!selectedExistingProjectId) return toast.error("Please select a project to link.", { duration: 4000 });
      
      processAcceptance(selectedPO, selectedExistingProjectId);
  };

  const updatePOStatus = (id: string, newStatus: any) => {
    const all = InventoryService.getPurchaseOrders();
    const updated = all.map(p => {
       if (p.id === id) {
          return { ...p, status: newStatus };
       }
       return p;
    });
    InventoryService.savePurchaseOrders(updated);
    refreshData();
    toast.error(`Order ${id} marked as ${newStatus}.`, { duration: 4000 });
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-xl flex items-center justify-between border border-blue-500/30 overflow-hidden relative">
         <div className="absolute top-0 right-0 p-8 opacity-10"><Globe size={160} /></div>
         <div className="relative z-10">
            <h2 className="text-3xl font-black uppercase tracking-tighter mb-2">Intercompany Operations Hub</h2>
            <p className="text-blue-400 font-bold uppercase tracking-widest text-xs">Landing Terminal for Internal Supply Chain Orders</p>
         </div>
         <div className="bg-blue-600/20 px-6 py-4 rounded-2xl border border-blue-400/30 relative z-10">
            <p className="text-[10px] font-black uppercase mb-1">Pending Actions</p>
            <p className="text-3xl font-black">{inbox.length}</p>
         </div>
      </div>

      <div className="flex space-x-1 bg-white p-1 rounded-2xl border border-slate-200 w-fit no-print shadow-sm">
          <button 
            onClick={() => setActiveTab('inbox')} 
            className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${activeTab === 'inbox' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Inbox size={16}/> <span>Pending Actions</span>
          </button>
          <button 
            onClick={() => setActiveTab('history')} 
            className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${activeTab === 'history' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <History size={16}/> <span>Order History</span>
          </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
         <div className={`px-8 py-6 border-b flex items-center space-x-3 ${activeTab === 'inbox' ? 'bg-indigo-50' : 'bg-slate-50'}`}>
            {activeTab === 'inbox' ? <RefreshCw className="text-indigo-600"/> : <History className="text-slate-600"/>}
            <h3 className="font-black uppercase tracking-tight text-slate-800">{activeTab === 'inbox' ? 'Pending Acceptances' : 'Processed Orders Registry'}</h3>
         </div>
         <div className="p-0">
            <table className="w-full text-left">
               <thead className={`text-[10px] font-black uppercase text-slate-500 tracking-widest border-b ${activeTab === 'inbox' ? 'bg-indigo-50/50' : 'bg-slate-50'}`}>
                  <tr>
                     <th className="px-8 py-4">Transaction Ref</th>
                     <th className="px-8 py-4">Linked Project</th>
                     <th className="px-8 py-4">Scope</th>
                     <th className="px-8 py-4">Status</th>
                     <th className="px-8 py-4">Date</th>
                     <th className="px-8 py-4 text-right">Operation</th>
                  </tr>
               </thead>
               <tbody className="divide-y">
                  {(activeTab === 'inbox' ? inbox : history).map(order => {
                    // Logic to determine if this is an Incoming or Outgoing(Pending) order
                    const isIncoming = order.toVendor === company;
                    const isMyDraft = order.fromCompany === company;
                    const linkedProjectName = projects.find(p => p.id === order.projectId)?.title || order.projectId;

                    return (
                    <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                       <td className="px-8 py-5">
                          <div className="flex items-center space-x-3">
                             <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border ${isMyDraft ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-slate-100 text-slate-600'}`}>
                                {isMyDraft ? order.toVendor.charAt(0) : order.fromCompany.charAt(0)}
                             </div>
                             <div>
                                <p className="font-black text-slate-900 leading-none mb-1">
                                    {isMyDraft ? `To: ${order.toVendor}` : `From: ${order.fromCompany}`}
                                </p>
                                <p className="text-[10px] text-slate-400 font-bold tracking-tighter uppercase">{order.id}</p>
                             </div>
                          </div>
                       </td>
                       <td className="px-8 py-5">
                           <div className="flex items-center space-x-2">
                               <Folder size={14} className="text-slate-400"/>
                               <span className="font-bold text-xs uppercase text-slate-700">{linkedProjectName || 'Pending Link'}</span>
                           </div>
                       </td>
                       <td className="px-8 py-5">
                          <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-black uppercase border border-blue-100">
                             {order.category}
                          </span>
                       </td>
                       <td className="px-8 py-5">
                          <div className="flex items-center space-x-2">
                             <div className={`w-2 h-2 rounded-full ${order.status === 'Sent' ? 'bg-amber-500 animate-pulse' : order.status === 'Delivered' ? 'bg-blue-500' : 'bg-emerald-500'}`}></div>
                             <span className="text-xs font-black uppercase text-slate-600">{order.status}</span>
                          </div>
                       </td>
                       <td className="px-8 py-5 text-sm font-bold text-slate-500">{order.date}</td>
                       <td className="px-8 py-5 text-right">
                          <div className="flex justify-end space-x-2">
                             {order.status === 'Sent' && isMyDraft && (
                                <button onClick={() => handleAcceptClick(order)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all flex items-center space-x-2">
                                    <RefreshCw size={14}/> <span>Review & Accept</span>
                                </button>
                             )}
                             
                             {order.status === 'Sent' && !isMyDraft && (
                                 <span className="text-[10px] font-bold text-slate-400 italic bg-slate-100 px-3 py-1 rounded-lg">Pending Partner</span>
                             )}
                             
                             {/* Vendor Actions (Incoming Orders in History) */}
                             {order.status === 'Received' && isIncoming && (
                               <button onClick={() => updatePOStatus(order.id, 'In Production')} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-all">Start Production</button>
                             )}
                             
                             {order.status === 'In Production' && isIncoming && (
                               <button onClick={() => updatePOStatus(order.id, 'Delivered')} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all">Dispatch Delivery</button>
                             )}

                             {order.status === 'Delivered' && (
                                 <span className="text-[10px] font-black text-emerald-600 uppercase flex items-center space-x-1 justify-end"><CheckCircle2 size={14}/> <span>Complete</span></span>
                             )}
                          </div>
                       </td>
                    </tr>
                  )})}
                  {(activeTab === 'inbox' ? inbox : history).length === 0 && (
                    <tr><td colSpan={6} className="px-8 py-20 text-center text-slate-300 italic font-medium">No records found in this view.</td></tr>
                  )}
               </tbody>
            </table>
         </div>
      </div>

      {/* PROJECT RECONCILIATION MODAL */}
      {isReconcileOpen && selectedPO && (
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[500]">
              <div className="bg-white rounded-[2rem] w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in duration-300 border border-slate-300">
                  <div className="px-8 py-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                      <div>
                          <h3 className="text-xl font-black uppercase">Project Alignment</h3>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Intercompany Handshake Protocol</p>
                      </div>
                      <button onClick={() => setIsReconcileOpen(false)} className="hover:bg-white/10 p-2 rounded-full transition-colors"><X size={24}/></button>
                  </div>
                  
                  <div className="p-8 space-y-6 bg-slate-50">
                      <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl">
                          <div className="flex items-center space-x-2 mb-1">
                              <AlertTriangle size={16} className="text-amber-600"/>
                              <h4 className="text-xs font-black text-amber-800 uppercase">Project Mismatch Detected</h4>
                          </div>
                          <p className="text-[10px] text-amber-700 font-bold leading-relaxed">
                              The incoming order references project <strong>"{selectedPO.projectId}"</strong>, but no exact match was found in {company}'s registry.
                          </p>
                      </div>

                      <div className="space-y-4">
                          <div className="space-y-1.5 animate-in fade-in">
                              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Select Existing Local Project</label>
                              <select 
                                className="w-full p-3 rounded-xl border border-slate-200 bg-white font-bold text-sm outline-none focus:border-blue-500"
                                value={selectedExistingProjectId}
                                onChange={(e) => setSelectedExistingProjectId(e.target.value)}
                              >
                                  <option value="">-- Choose Project --</option>
                                  {projects.map(p => (
                                      <option key={p.id} value={p.id}>{p.title}</option>
                                  ))}
                              </select>
                          </div>

                          <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start space-x-3">
                              <Info size={18} className="text-blue-600 shrink-0 mt-0.5"/>
                              <div>
                                  <p className="text-[10px] font-black text-blue-800 uppercase mb-1">Project Not Found?</p>
                                  <p className="text-[10px] text-blue-700 leading-tight">
                                      If the required project does not exist, please navigate to the <strong>Project Systems (PS)</strong> module to create it first. Then return here to link the order.
                                  </p>
                                  <button onClick={() => navigate('/projects')} className="mt-2 text-[10px] font-black uppercase text-white bg-blue-600 px-3 py-1.5 rounded-lg flex items-center space-x-1 hover:bg-blue-700 transition-colors">
                                      <span>Go to Project Systems</span> <ArrowUpRight size={10}/>
                                  </button>
                              </div>
                          </div>
                      </div>
                  </div>

                  <div className="px-8 py-6 bg-white border-t flex justify-end space-x-3">
                      <button onClick={() => setIsReconcileOpen(false)} className="px-6 py-3 text-slate-400 font-bold uppercase text-xs">Cancel</button>
                      <button onClick={handleConfirmReconciliation} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-slate-800 transition-all flex items-center space-x-2">
                          <CheckCircle2 size={16}/> <span>Confirm & Link</span>
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default IntercompanyHub;
