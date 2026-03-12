import React, { useState, useEffect } from 'react';
import { Company } from '../../shared/types/core';
import { Requisition, RequisitionItem, StoreItem, Product, PurchaseOrder } from '../types/inventory';
import { CostCenter } from '../../finance/types/finance';
import { Vendor } from '../../sales/types/crm';
import { Project } from '../../production/types/production';
import { Employee, LoanAdvance } from '../../hr/types/hr';
import { InventoryService } from '../services/inventoryService';
import { ProductionService } from '../../production/services/productionService';
import { SalesService } from '../../sales/services/salesService';
import { FinanceService } from '../../finance/services/financeService';
import { AppService } from '../../shared/services/appService';
import { ProjectService } from '../../projects/services/projectService';
import { HRService } from '../../hr/services/hrService';
import { 
  Plus, Search, CheckCircle2, ClipboardList, ShieldCheck,
  Check, Hash, User, ShieldAlert, FileText, Save, Trash2, 
  Zap, Briefcase, Warehouse, XCircle, ArrowRight, DollarSign, Building, Folder, ShoppingCart, Truck, Tag
} from 'lucide-react';

import { useAppStore } from '../../shared/store/appStore';

import RequisitionPrint from '../components/RequisitionPrint';

const Requisitions: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [activeTab, setActiveTab] = useState<'requests' | 'approvals' | 'orders'>('requests');
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [selectedRequisitions, setSelectedRequisitions] = useState<string[]>([]);
  const [showPrintView, setShowPrintView] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loans, setLoans] = useState<LoanAdvance[]>([]);
  
  const [customSubCategories, setCustomSubCategories] = useState<Record<string, string[]>>(() => {
    const saved = localStorage.getItem('gtk_custom_sub_categories');
    return saved ? JSON.parse(saved) : {};
  });

  const CATEGORIES = ['HR', 'Production', 'Admin', 'Repair & Maintenance', 'Factory'];
  const INITIAL_SUB_CATEGORIES: Record<string, string[]> = {
    'HR': ['Loan Request', 'Salary Advance', 'Skip Installment', 'Waive Absent', 'Overtime Approval'],
    'Production': ['Material / Inventory', 'Consumables'],
    'Admin': ['General Expense', 'TA/DA', 'Fare Expense', 'Scrap'],
    'Repair & Maintenance': ['Maintenance / R&M', 'Vehicle Fuel', 'Vehicle Maintenance'],
    'Factory': ['Repair & Maintenance', 'Fuel Expense']
  };

  const getSubCategories = (cat: string) => {
    return [...(INITIAL_SUB_CATEGORIES[cat] || []), ...(customSubCategories[cat] || [])];
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingRequisition, setViewingRequisition] = useState<Requisition | null>(null);
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [isDirectPOOpen, setIsDirectPOOpen] = useState(false);
  const [selectedPrForConversion, setSelectedPrForConversion] = useState<Requisition | null>(null);
  
  const [selectedVendorForPO, setSelectedVendorForPO] = useState('');
  const [selectedProjectForPO, setSelectedProjectForPO] = useState('');
  const [selectedCostHead, setSelectedCostHead] = useState<'Glass' | 'Aluminium' | 'Hardware' | 'Installation'>('Hardware');

  const [directPoItems, setDirectPoItems] = useState<{desc: string, qty: number, rate: number, amount: number}[]>([
      { desc: '', qty: 1, rate: 0, amount: 0 }
  ]);

  const [formHeader, setFormHeader] = useState({
    headerText: '', requisitioner: '', priority: 'Normal' as any,
    category: 'Production',
    subCategory: 'Material / Inventory',
    date: new Date().toISOString().split('T')[0],
    employeeId: '', loanAmount: 0, loanPurpose: '', installments: 1,
    skipMonth: '', absentDate: '', absentReason: '',
    overtimeHours: 0, overtimeProject: '', overtimeEmployees: [] as string[],
    employeeName: '', siteName: '', from: '', to: '', amount: 0,
    vehicleType: '', vehicleNo: '', driver: '', purpose: '',
    projectOrSiteName: '', qty: 0, description: '', type: ''
  });

  const [formItems, setFormItems] = useState<RequisitionItem[]>([
    { id: '1', itemCategory: 'Standard', materialDesc: '', qty: 1, unit: 'Unit', estimatedRate: 0, deliveryDate: '', costCenter: '' }
  ]);

  useEffect(() => {
    refreshData();
  }, [company]);

  const refreshData = () => {
    const allReqs = InventoryService.getRequisitions();
    const relevantReqs = allReqs.filter(r => r && (r.company === company || r.targetCompany === company));
    
    setRequisitions(relevantReqs.sort((a,b) => b.id.localeCompare(a.id)));
    setPurchaseOrders(ProductionService.getPurchaseOrders().filter(p => p.fromCompany === company).sort((a,b) => b.date.localeCompare(a.date)));
    setStoreItems(InventoryService.getStore().filter(s => s.company === company || s.company === 'Factory'));
    setProducts(SalesService.getProducts().filter(p => p.company === company || p.company === 'Factory'));
    setCostCenters(FinanceService.getCostCenters().filter(c => c.company === company));
    setVendors(SalesService.getVendors());
    setProjects(ProjectService.getProjects().filter(p => p.company === company && p.status === 'Active'));
    setEmployees(HRService.getEmployees().filter(e => e.company === company));
    setLoans(HRService.getLoans().filter(l => l.status === 'Active'));
  };

  const addItemRow = () => {
    setFormItems([...formItems, { 
      id: Date.now().toString(), 
      itemCategory: 'Standard', materialDesc: '', qty: 1, unit: 'Unit', estimatedRate: 0, 
      deliveryDate: '', costCenter: '' 
    }]);
  };

  const removeItemRow = (id: string) => {
    if (formItems.length === 1) return;
    setFormItems(formItems.filter(item => item.id !== id));
  };

  const updateItem = (id: string, field: keyof RequisitionItem, value: any) => {
    setFormItems(formItems.map(item => {
        if (item.id !== id) return item;
        const updates: any = { [field]: value };
        if (field === 'materialDesc') {
            const product = products.find(p => p.description === value);
            if (product) {
                updates.unit = product.unit;
                updates.estimatedRate = product.costPrice || 0;
            }
        }
        return { ...item, ...updates };
    }));
  };

  const handlePostPR = () => {
    if (formHeader.category !== 'HR') {
        if (!formHeader.requisitioner || !formHeader.headerText) return alert("SAP Protocol: Requisitioner and Header Text are mandatory.");
    }
    
    const isMaterial = ['Material / Inventory', 'Maintenance / R&M', 'General Expense', 'Consumables'].includes(formHeader.subCategory);
    
    if (isMaterial) {
        if (formItems.some(i => !i.materialDesc || !i.costCenter)) return alert("Validation Error: Item Description and Cost Center are required for all line items.");
    } else if (formHeader.subCategory === 'Overtime Approval') {
        if (formHeader.overtimeEmployees.length === 0) return alert("Select at least one employee.");
        if (!formHeader.overtimeHours) return alert("Enter overtime hours.");
    } else if (formHeader.category === 'HR') {
        if (!formHeader.employeeId) return alert("Select an employee.");
        if (formHeader.subCategory === 'Loan Request' && !formHeader.loanAmount) return alert("Enter loan amount.");
        if (formHeader.subCategory === 'Waive Absent' && !formHeader.absentDate) return alert("Select date.");
    }

    let totalValue = 0;
    if (isMaterial) {
        totalValue = formItems.reduce((sum, item) => sum + (item.qty * item.estimatedRate), 0);
    } else if (formHeader.subCategory === 'Loan Request' || formHeader.subCategory === 'Salary Advance') {
        totalValue = formHeader.loanAmount;
    } else {
        totalValue = formHeader.amount;
    }

    const allReqs = InventoryService.getRequisitions().filter(Boolean);
    const prId = AppService.generateSequenceID('REQ', company, allReqs);

    const newPR: Requisition = {
      id: prId,
      company, 
      date: formHeader.date, 
      headerText: formHeader.headerText.toUpperCase(),
      requisitioner: formHeader.requisitioner, 
      priority: formHeader.priority,
      category: formHeader.category,
      subCategory: formHeader.subCategory,
      reqType: formHeader.subCategory, 
      items: isMaterial ? formItems : [], 
      totalValue, 
      status: 'Pending',
      
      // HR Fields
      employeeId: formHeader.employeeId,
      loanAmount: formHeader.loanAmount,
      loanPurpose: formHeader.loanPurpose,
      installments: formHeader.installments,
      skipMonth: formHeader.skipMonth,
      absentDate: formHeader.absentDate,
      absentReason: formHeader.absentReason,
      overtimeHours: formHeader.overtimeHours,
      overtimeProject: formHeader.overtimeProject,
      overtimeEmployees: formHeader.overtimeEmployees,

      // New Fields
      employeeName: formHeader.employeeName,
      siteName: formHeader.siteName,
      from: formHeader.from,
      to: formHeader.to,
      amount: formHeader.amount,
      vehicleType: formHeader.vehicleType,
      vehicleNo: formHeader.vehicleNo,
      driver: formHeader.driver,
      purpose: formHeader.purpose,
      projectOrSiteName: formHeader.projectOrSiteName,
      qty: formHeader.qty,
      description: formHeader.description,
      type: formHeader.type
    };
    InventoryService.saveRequisitions([...allReqs, newPR]);
    refreshData();
    setIsModalOpen(false);
    resetForm();
    alert(`Success: Requisition ${newPR.id} Created.`);
  };

  const resetForm = () => {
    setFormHeader({ 
        headerText: '', requisitioner: '', priority: 'Normal', 
        category: 'Production', subCategory: 'Material / Inventory',
        date: new Date().toISOString().split('T')[0],
        employeeId: '', loanAmount: 0, loanPurpose: '', installments: 1,
        skipMonth: '', absentDate: '', absentReason: '',
        overtimeHours: 0, overtimeProject: '', overtimeEmployees: [],
        employeeName: '', siteName: '', from: '', to: '', amount: 0,
        vehicleType: '', vehicleNo: '', driver: '', purpose: '',
        projectOrSiteName: '', qty: 0, description: '', type: ''
    });
    setFormItems([{ id: '1', itemCategory: 'Standard', materialDesc: '', qty: 1, unit: 'Unit', estimatedRate: 0, deliveryDate: '', costCenter: '' }]);
  };

  const getReleaseStrategy = (val: number) => {
      if (val > 100000) return { label: 'L2 Director', color: 'bg-purple-100 text-purple-700' };
      return { label: 'L1 Manager', color: 'bg-blue-100 text-blue-700' };
  };

  const handleApprove = (id: string) => {
    const pr = requisitions.find(r => r.id === id);
    if (!pr) return;
    const strategy = getReleaseStrategy(pr.totalValue);
    if (!confirm(`Perform ${strategy.label} Approval for PKR ${pr.totalValue.toLocaleString()}?`)) return;

    const all = InventoryService.getRequisitions().filter(Boolean);
    const updated = all.map(r => r.id === id ? { ...r, status: 'Approved' as const, approvedBy: 'Authorized User' } : r);
    InventoryService.saveRequisitions(updated);
    refreshData();
  };

  const handleDisapprove = (id: string) => {
    if (!confirm("Disapprove this requisition?")) return;
    const all = InventoryService.getRequisitions().filter(Boolean);
    const updated = all.map(r => r.id === id ? { ...r, status: 'Rejected' as const } : r);
    InventoryService.saveRequisitions(updated);
    refreshData();
  };

  const handleDelete = (id: string) => {
    if (!confirm("Are you sure you want to delete this requisition?")) return;
    const all = InventoryService.getRequisitions().filter(Boolean);
    InventoryService.saveRequisitions(all.filter(r => r.id !== id));
    refreshData();
  };

  const handleAddNewSubCategory = (cat: string) => {
    const name = prompt(`Enter new sub-category for ${cat}:`);
    if (!name) return;
    const updated = { ...customSubCategories, [cat]: [...(customSubCategories[cat] || []), name] };
    setCustomSubCategories(updated);
    localStorage.setItem('gtk_custom_sub_categories', JSON.stringify(updated));
    setFormHeader({ ...formHeader, subCategory: name });
  };

  const openConversionModal = (pr: Requisition) => {
      setSelectedPrForConversion(pr);
      setSelectedVendorForPO('');
      setSelectedProjectForPO('');
      setSelectedCostHead('Hardware'); 
      setIsConvertModalOpen(true);
  };

  const createAndPostPO = (vendor: string, project: string, category: any, amount: number, items: any[], sourcePRId?: string) => {
      const allPOs = ProductionService.getPurchaseOrders();
      const poId = AppService.generateSequenceID('PO', company, allPOs);
      const newPO: PurchaseOrder = {
          id: poId, fromCompany: company, toVendor: vendor, date: new Date().toISOString().split('T')[0],
          status: 'Sent', totalAmount: amount, category: category, projectId: project, items: items
      };
      ProductionService.savePurchaseOrders([...allPOs, newPO]);
      if (sourcePRId) {
          const allPRs = InventoryService.getRequisitions().filter(Boolean);
          const updatedPRs = allPRs.map(r => r.id === sourcePRId ? { ...r, status: 'Converted to PO' as const } : r);
          InventoryService.saveRequisitions(updatedPRs);
      }
      refreshData();
      return poId;
  };

  const handleConvertToPO = () => {
      if (!selectedPrForConversion || !selectedVendorForPO) return alert("Select a Vendor to proceed.");
      const itemsPayload = selectedPrForConversion.items.map(i => ({ description: i.materialDesc, qty: i.qty, rate: i.estimatedRate, costCenter: i.costCenter }));
      const poId = createAndPostPO(selectedVendorForPO, selectedProjectForPO, selectedCostHead, selectedPrForConversion.totalValue, itemsPayload, selectedPrForConversion.id);
      setIsConvertModalOpen(false);
      alert(`Success: Purchase Order ${poId} generated.`);
  };

  const handleCreateDirectPO = () => {
      if (!selectedVendorForPO) return alert("Select a Vendor.");
      const totalAmount = directPoItems.reduce((s, i) => s + (i.qty * i.rate), 0);
      if (totalAmount <= 0) return alert("Total amount cannot be zero.");
      const poId = createAndPostPO(selectedVendorForPO, selectedProjectForPO, selectedCostHead, totalAmount, directPoItems.map(i => ({ description: i.desc, qty: i.qty, rate: i.rate })));
      setIsDirectPOOpen(false);
      setDirectPoItems([{ desc: '', qty: 1, rate: 0, amount: 0 }]);
      alert(`Success: Direct PO ${poId} Created.`);
  };

  const updateDirectItem = (idx: number, field: string, val: any) => {
      const newItems = [...directPoItems];
      const item: any = { ...newItems[idx], [field]: val };
      item.amount = item.qty * item.rate;
      newItems[idx] = item;
      setDirectPoItems(newItems);
  };

  const toggleSelection = (id: string) => {
    if (selectedRequisitions.includes(id)) {
      setSelectedRequisitions(selectedRequisitions.filter(item => item !== id));
    } else {
      if (selectedRequisitions.length >= 4) {
        alert("You can select up to 4 requisitions for printing on one page.");
        return;
      }
      setSelectedRequisitions([...selectedRequisitions, id]);
    }
  };

  const handlePrint = () => {
    if (selectedRequisitions.length === 0) return alert("Select at least one requisition to print.");
    setShowPrintView(true);
    setTimeout(() => {
      window.print();
      setShowPrintView(false);
    }, 500);
  };

  return (
    <div className="space-y-6">
      {showPrintView && (
        <div className="fixed inset-0 bg-white z-[500] overflow-auto">
           <RequisitionPrint requisitions={requisitions.filter(r => selectedRequisitions.includes(r.id))} />
        </div>
      )}
      <div className="flex items-center space-x-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm w-fit no-print">
        <button onClick={() => setActiveTab('requests')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'requests' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
          <ClipboardList size={18} /><span>My Requisitions</span>
        </button>
        <button onClick={() => setActiveTab('approvals')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'approvals' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
          <ShieldCheck size={18} /><span>Release Strategy</span>
        </button>
        <button onClick={() => setActiveTab('orders')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'orders' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
          <ShoppingCart size={18} /><span>Purchase Orders</span>
        </button>
      </div>

      {activeTab === 'requests' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center space-x-4">
               <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><Briefcase size={24}/></div>
               <div><h3 className="text-xl font-black text-slate-800 uppercase leading-none">Internal Procurement</h3><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1.5 text-blue-500 italic">Centralized Request Center (SAP ME51N)</p></div>
            </div>
            <div className="flex space-x-3">
              {selectedRequisitions.length > 0 && (
                <button onClick={handlePrint} className="bg-slate-900 text-white px-6 py-3.5 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center space-x-2 shadow-xl hover:bg-slate-800">
                  <FileText size={18} /><span>Print Selected ({selectedRequisitions.length})</span>
                </button>
              )}
              <button onClick={() => { resetForm(); setIsModalOpen(true); }} className="bg-blue-600 text-white px-8 py-3.5 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center space-x-3 shadow-xl hover:bg-blue-700">
                <Plus size={18} /><span>Create Requisition</span>
              </button>
            </div>
          </div>
          
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left sap-table">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                <tr>
                  <th className="px-6 py-3 w-10"></th>
                  <th className="px-6 py-3">ID</th>
                  <th className="px-6 py-3">Category</th>
                  <th className="px-6 py-3">Sub-Category</th>
                  <th className="px-6 py-3">Description</th>
                  <th className="px-6 py-3">Value</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requisitions.filter(Boolean).map(r => {
                  const isSelected = selectedRequisitions.includes(r.id);
                  return (
                    <tr key={r.id} className={`hover:bg-slate-50 cursor-pointer ${isSelected ? 'bg-blue-50' : ''}`} onClick={() => setViewingRequisition(r)}>
                      <td className="px-6 py-3" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelection(r.id)} className="rounded text-blue-600" />
                      </td>
                      <td className="px-6 py-3 font-black text-blue-600">{r.id}</td>
                      <td className="px-6 py-3 text-xs font-bold uppercase text-slate-500">{r.category || 'N/A'}</td>
                      <td className="px-6 py-3 text-xs font-bold uppercase text-slate-800">{r.subCategory || r.reqType || 'N/A'}</td>
                      <td className="px-6 py-3 text-xs font-bold uppercase text-slate-600 truncate max-w-[200px]">{r.headerText}</td>
                      <td className="px-6 py-3 font-black">PKR {(r.totalValue || 0).toLocaleString()}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${r.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : r.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right space-x-2" onClick={e => e.stopPropagation()}>
                        {r.status === 'Pending' && (
                          <>
                            <button onClick={() => handleApprove(r.id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Approve"><Check size={16}/></button>
                            <button onClick={() => handleDisapprove(r.id)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg" title="Disapprove"><XCircle size={16}/></button>
                          </>
                        )}
                        <button onClick={() => handleDelete(r.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 size={16}/></button>
                        <button className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Payment Voucher"><DollarSign size={16}/></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {requisitions.length === 0 && <div className="py-20 text-center text-slate-400 font-bold uppercase italic">No requisitions found.</div>}
          </div>
        </div>
      )}

      {activeTab === 'approvals' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
              <div className="p-6 border-b bg-slate-50 flex justify-between items-center">
                  <h3 className="font-black text-slate-800 uppercase text-sm tracking-tight">Release Strategy Inbox</h3>
              </div>
              <table className="w-full text-left sap-table">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                      <tr>
                          <th className="px-6 py-3">PR Number</th>
                          <th className="px-6 py-3">Category</th>
                          <th className="px-6 py-3">Requisitioner</th>
                          <th className="px-6 py-3">Requirement</th>
                          <th className="px-6 py-3">Value (PKR)</th>
                          <th className="px-6 py-3 text-right">Action</th>
                      </tr>
                  </thead>
                  <tbody>
                      {requisitions.map(r => (
                          <tr key={r.id} className="hover:bg-slate-50">
                              <td className="px-6 py-3 font-black text-blue-600">{r.id}</td>
                              <td className="px-6 py-3">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black uppercase text-slate-400">{r.category}</span>
                                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[9px] font-black uppercase w-fit">{r.subCategory || r.reqType}</span>
                                </div>
                              </td>
                              <td className="px-6 py-3 text-xs font-bold text-slate-600 uppercase">{r.requisitioner || 'HR SYSTEM'}</td>
                              <td className="px-6 py-3 text-xs font-bold text-slate-800 uppercase">
                                {r.category === 'HR' ? `Employee: ${r.employeeId}` : r.headerText}
                              </td>
                              <td className="px-6 py-3 font-black">{(r.totalValue || 0).toLocaleString()}</td>
                              <td className="px-6 py-3 text-right">
                                  {r.status === 'Pending' && <button onClick={() => handleApprove(r.id)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-emerald-700">Release</button>}
                                  {r.status === 'Approved' && (r.subCategory === 'Material / Inventory' || r.reqType === 'Material') && <button onClick={() => openConversionModal(r)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-blue-700">Create PO</button>}
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      )}

      {activeTab === 'orders' && (
          <div className="space-y-6 animate-in fade-in duration-300">
              <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center space-x-4">
                      <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><ShoppingCart size={24}/></div>
                      <div><h3 className="text-xl font-black text-slate-800 uppercase leading-none">Purchasing Desk</h3><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1.5">Issued Orders (ME21N)</p></div>
                  </div>
                  <button onClick={() => setIsDirectPOOpen(true)} className="bg-emerald-600 text-white px-8 py-3.5 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center space-x-3 shadow-xl hover:bg-emerald-700">
                      <Plus size={18}/> <span>Create Direct PO</span>
                  </button>
              </div>
              <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
                  <table className="w-full text-left sap-table">
                      <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                          <tr>
                              <th className="px-6 py-3">PO Number</th>
                              <th className="px-6 py-3">Vendor</th>
                              <th className="px-6 py-3">Category</th>
                              <th className="px-6 py-3">Total Value</th>
                              <th className="px-6 py-3">Status</th>
                          </tr>
                      </thead>
                      <tbody>
                          {purchaseOrders.map(po => (
                              <tr key={po.id} className="hover:bg-slate-50">
                                  <td className="px-6 py-3 font-black text-blue-600">{po.id}</td>
                                  <td className="px-6 py-3 text-xs font-bold text-slate-800 uppercase">{po.toVendor}</td>
                                  <td className="px-6 py-3"><span className="px-2 py-0.5 bg-slate-100 rounded text-[9px] font-black uppercase">{po.category}</span></td>
                                  <td className="px-6 py-3 font-black">PKR {po.totalAmount.toLocaleString()}</td>
                                  <td className="px-6 py-3"><span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${po.status === 'Delivered' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{po.status}</span></td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {/* MODALS */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[400]">
           <div className="bg-white rounded-[2.5rem] w-full max-w-5xl h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-200">
              <div className="px-10 py-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center space-x-4"><div className="p-3 bg-blue-600 rounded-2xl"><Plus size={24}/></div><div><h3 className="text-2xl font-black uppercase tracking-tight">Create Requisition</h3></div></div>
                 <button onClick={() => setIsModalOpen(false)}><XCircle size={28}/></button>
              </div>
              <div className="flex-1 overflow-y-auto p-10 bg-slate-50 space-y-8">
                 <div className="bg-white p-6 rounded-3xl border shadow-sm grid grid-cols-4 gap-6">
                    <div className="col-span-1 space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Category</label>
                        <select 
                            className="sap-input w-full font-bold uppercase text-blue-600" 
                            value={formHeader.category} 
                            onChange={e => {
                                const cat = e.target.value;
                                const subs = getSubCategories(cat);
                                setFormHeader({...formHeader, category: cat, subCategory: subs[0] || ''});
                            }}
                        >
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div className="col-span-1 space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Sub-Category</label>
                        <select 
                            className="sap-input w-full font-bold uppercase text-indigo-600" 
                            value={formHeader.subCategory} 
                            onChange={e => {
                                if (e.target.value === 'ADD_NEW') {
                                    handleAddNewSubCategory(formHeader.category);
                                } else {
                                    setFormHeader({...formHeader, subCategory: e.target.value});
                                }
                            }}
                        >
                            {getSubCategories(formHeader.category).map(s => <option key={s} value={s}>{s}</option>)}
                            <option value="ADD_NEW" className="text-blue-600 font-black">+ Add New Sub-Category</option>
                        </select>
                    </div>
                    {formHeader.category !== 'HR' ? (
                        <>
                            <div className="col-span-1 space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Header Text</label><input type="text" className="sap-input w-full font-bold uppercase" value={formHeader.headerText} onChange={e => setFormHeader({...formHeader, headerText: e.target.value})} /></div>
                            <div className="col-span-1 space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Requisitioner</label><input type="text" className="sap-input w-full font-bold uppercase" value={formHeader.requisitioner} onChange={e => setFormHeader({...formHeader, requisitioner: e.target.value})} /></div>
                        </>
                    ) : (
                        <div className="col-span-1 space-y-1">
                            <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Employee ID</label>
                            <input type="text" className="sap-input w-full font-bold uppercase bg-slate-50" value={formHeader.employeeId} readOnly placeholder="Select below..." />
                        </div>
                    )}
                    <div className="col-span-1 space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Req. Date</label><input type="date" className="sap-input w-full font-bold" value={formHeader.date} onChange={e => setFormHeader({...formHeader, date: e.target.value})} /></div>
                 </div>
                 {['Material / Inventory', 'Maintenance / R&M', 'General Expense'].includes(formHeader.subCategory) ? (
                     <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
                        <div className="p-4 bg-slate-50 border-b flex justify-between items-center"><h4 className="font-black text-slate-700 uppercase text-xs">Item Overview</h4><button onClick={addItemRow} className="text-blue-600 font-bold text-xs hover:underline">+ Add Item</button></div>
                        <table className="w-full text-left sap-table">
                            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                                <tr>
                                    <th className="w-12 px-4 py-3">#</th>
                                    <th className="w-64 px-4 py-3">Description / Detail</th>
                                    <th className="w-24 px-4 py-3">Qty</th>
                                    <th className="w-24 px-4 py-3">Unit</th>
                                    <th className="w-32 px-4 py-3">Est. Rate</th>
                                    <th className="w-48 px-4 py-3">Cost Center</th>
                                    <th className="w-32 text-right px-4 py-3">Total</th>
                                    <th className="w-12 px-4 py-3"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {formItems.map((item, idx) => (
                                    <tr key={item.id}>
                                        <td className="text-center font-bold text-slate-400 px-4 py-2">{idx + 10}</td>
                                        <td className="px-4 py-2">
                                            {formHeader.subCategory === 'Material / Inventory' ? (
                                                <select className="sap-input w-full py-1 text-xs font-bold" value={item.materialDesc} onChange={e => updateItem(item.id, 'materialDesc', e.target.value)}><option value="">Select Material...</option>{products.map(p => (<option key={p.id} value={p.description}>{p.description}</option>))}<option value="Manual Input">-- Manual Input --</option></select>
                                            ) : (
                                                <input type="text" className="sap-input w-full py-1 text-xs font-bold uppercase" value={item.materialDesc} onChange={e => updateItem(item.id, 'materialDesc', e.target.value)} placeholder="Enter details..." />
                                            )}
                                        </td>
                                        <td className="px-4 py-2"><input type="number" className="sap-input w-full py-1 text-xs text-center" value={item.qty} onChange={e => updateItem(item.id, 'qty', Number(e.target.value))} /></td>
                                        <td className="px-4 py-2"><input type="text" className="sap-input w-full py-1 text-xs text-center uppercase" value={item.unit} onChange={e => updateItem(item.id, 'unit', e.target.value)} /></td>
                                        <td className="px-4 py-2"><input type="number" className="sap-input w-full py-1 text-xs text-right" value={item.estimatedRate} onChange={e => updateItem(item.id, 'estimatedRate', Number(e.target.value))} /></td>
                                        <td className="px-4 py-2"><select className="sap-input w-full py-1 text-xs font-bold uppercase" value={item.costCenter} onChange={e => updateItem(item.id, 'costCenter', e.target.value)}><option value="">-- Assign Cost Center --</option>{costCenters.map(cc => (<option key={cc.id} value={cc.code}>[{cc.code}] {cc.name}</option>))}</select></td>
                                        <td className="text-right font-black text-slate-900 px-4 py-2">{((item.qty || 0) * (item.estimatedRate || 0)).toLocaleString()}</td>
                                        <td className="text-center px-4 py-2"><button onClick={() => removeItemRow(item.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={14}/></button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                     </div>
                 ) : (
                     <div className="bg-white p-6 rounded-3xl border shadow-sm space-y-6">
                        {/* NEW FIELDS */}
                        {!['Overtime Approval', 'Loan Request', 'Salary Advance', 'Skip Installment', 'Waive Absent'].includes(formHeader.subCategory) && (
                            <div className="grid grid-cols-2 gap-6">
                                {formHeader.subCategory === 'TA/DA' && (
                                    <>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Employee Name</label><input type="text" className="sap-input w-full font-bold uppercase" value={formHeader.employeeName} onChange={e => setFormHeader({...formHeader, employeeName: e.target.value})} /></div>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Site Name</label><input type="text" className="sap-input w-full font-bold uppercase" value={formHeader.siteName} onChange={e => setFormHeader({...formHeader, siteName: e.target.value})} /></div>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">From</label><input type="text" className="sap-input w-full font-bold uppercase" value={formHeader.from} onChange={e => setFormHeader({...formHeader, from: e.target.value})} /></div>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">To</label><input type="text" className="sap-input w-full font-bold uppercase" value={formHeader.to} onChange={e => setFormHeader({...formHeader, to: e.target.value})} /></div>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Amount</label><input type="number" className="sap-input w-full font-bold" value={formHeader.amount} onChange={e => setFormHeader({...formHeader, amount: Number(e.target.value)})} /></div>
                                    </>
                                )}
                                {['Vehicle Fuel', 'Fuel Expense'].includes(formHeader.subCategory) && (
                                    <>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Vehicle Type</label><input type="text" className="sap-input w-full font-bold uppercase" value={formHeader.vehicleType} onChange={e => setFormHeader({...formHeader, vehicleType: e.target.value})} /></div>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Vehicle No</label><input type="text" className="sap-input w-full font-bold uppercase" value={formHeader.vehicleNo} onChange={e => setFormHeader({...formHeader, vehicleNo: e.target.value})} /></div>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Driver</label><input type="text" className="sap-input w-full font-bold uppercase" value={formHeader.driver} onChange={e => setFormHeader({...formHeader, driver: e.target.value})} /></div>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Amount</label><input type="number" className="sap-input w-full font-bold" value={formHeader.amount} onChange={e => setFormHeader({...formHeader, amount: Number(e.target.value)})} /></div>
                                    </>
                                )}
                                {formHeader.subCategory === 'Vehicle Maintenance' && (
                                    <>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Vehicle No</label><input type="text" className="sap-input w-full font-bold uppercase" value={formHeader.vehicleNo} onChange={e => setFormHeader({...formHeader, vehicleNo: e.target.value})} /></div>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Type</label><input type="text" className="sap-input w-full font-bold uppercase" value={formHeader.type} onChange={e => setFormHeader({...formHeader, type: e.target.value})} /></div>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Description</label><input type="text" className="sap-input w-full font-bold uppercase" value={formHeader.description} onChange={e => setFormHeader({...formHeader, description: e.target.value})} /></div>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Amount</label><input type="number" className="sap-input w-full font-bold" value={formHeader.amount} onChange={e => setFormHeader({...formHeader, amount: Number(e.target.value)})} /></div>
                                    </>
                                )}
                                {formHeader.subCategory === 'Fare Expense' && (
                                    <>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">From</label><input type="text" className="sap-input w-full font-bold uppercase" value={formHeader.from} onChange={e => setFormHeader({...formHeader, from: e.target.value})} /></div>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">To</label><input type="text" className="sap-input w-full font-bold uppercase" value={formHeader.to} onChange={e => setFormHeader({...formHeader, to: e.target.value})} /></div>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Purpose</label><input type="text" className="sap-input w-full font-bold uppercase" value={formHeader.purpose} onChange={e => setFormHeader({...formHeader, purpose: e.target.value})} /></div>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Amount</label><input type="number" className="sap-input w-full font-bold" value={formHeader.amount} onChange={e => setFormHeader({...formHeader, amount: Number(e.target.value)})} /></div>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Vehicle No</label><input type="text" className="sap-input w-full font-bold uppercase" value={formHeader.vehicleNo} onChange={e => setFormHeader({...formHeader, vehicleNo: e.target.value})} /></div>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Driver</label><input type="text" className="sap-input w-full font-bold uppercase" value={formHeader.driver} onChange={e => setFormHeader({...formHeader, driver: e.target.value})} /></div>
                                    </>
                                )}
                                {formHeader.subCategory === 'Consumables' && (
                                    <>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Description</label><input type="text" className="sap-input w-full font-bold uppercase" value={formHeader.description} onChange={e => setFormHeader({...formHeader, description: e.target.value})} list="consumable-suggestions" />
                                            <datalist id="consumable-suggestions">
                                                {Array.from(new Set(requisitions.filter(r => r.subCategory === 'Consumables').map(r => r.description))).map(d => <option key={d} value={d} />)}
                                            </datalist>
                                        </div>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Project / Site Name</label><input type="text" className="sap-input w-full font-bold uppercase" value={formHeader.projectOrSiteName} onChange={e => setFormHeader({...formHeader, projectOrSiteName: e.target.value})} /></div>
                                    </>
                                )}
                                {formHeader.subCategory === 'Scrap' && (
                                    <>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Description</label><input type="text" className="sap-input w-full font-bold uppercase" value={formHeader.description} onChange={e => setFormHeader({...formHeader, description: e.target.value})} /></div>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Qty</label><input type="number" className="sap-input w-full font-bold" value={formHeader.qty} onChange={e => setFormHeader({...formHeader, qty: Number(e.target.value)})} /></div>
                                        <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Amount</label><input type="number" className="sap-input w-full font-bold" value={formHeader.amount} onChange={e => setFormHeader({...formHeader, amount: Number(e.target.value)})} /></div>
                                    </>
                                )}
                            </div>
                        )}
                        {/* HR FORMS */}
                        {formHeader.subCategory === 'Overtime Approval' ? (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Overtime Hours</label>
                                        <input type="number" className="sap-input w-full font-bold" value={formHeader.overtimeHours} onChange={e => setFormHeader({...formHeader, overtimeHours: Number(e.target.value)})} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Project / Location</label>
                                        <input type="text" className="sap-input w-full font-bold uppercase" value={formHeader.overtimeProject} onChange={e => setFormHeader({...formHeader, overtimeProject: e.target.value})} placeholder="e.g. Site A, Factory Floor" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1 mb-2 block">Select Employees</label>
                                    <div className="grid grid-cols-3 gap-3 max-h-60 overflow-y-auto p-4 bg-slate-50 rounded-xl border">
                                        {employees.map(emp => (
                                            <label key={emp.id} className="flex items-center space-x-2 p-2 bg-white rounded border hover:border-blue-500 cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    checked={formHeader.overtimeEmployees.includes(emp.id)}
                                                    onChange={e => {
                                                        const newSelected = e.target.checked 
                                                            ? [...formHeader.overtimeEmployees, emp.id]
                                                            : formHeader.overtimeEmployees.filter(id => id !== emp.id);
                                                        setFormHeader({...formHeader, overtimeEmployees: newSelected});
                                                    }}
                                                    className="rounded text-blue-600 focus:ring-blue-500"
                                                />
                                                <div className="text-xs">
                                                    <p className="font-bold text-slate-700">{emp.personal.name}</p>
                                                    <p className="text-[10px] text-slate-400">{emp.work.designation}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-6">
                                <div className="col-span-2 md:col-span-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Select Employee</label>
                                    <select className="sap-input w-full font-bold uppercase" value={formHeader.employeeId} onChange={e => setFormHeader({...formHeader, employeeId: e.target.value})}>
                                        <option value="">-- Select Employee --</option>
                                        {employees.map(e => <option key={e.id} value={e.id}>{e.personal.name} ({e.work.designation})</option>)}
                                    </select>
                                    {formHeader.employeeId && (
                                        <div className="mt-4 p-4 bg-slate-50 rounded-xl border space-y-2">
                                            {(() => {
                                                const emp = employees.find(e => e.id === formHeader.employeeId);
                                                const empLoans = loans.filter(l => l.employeeId === formHeader.employeeId && l.status === 'Approved');
                                                const totalLoan = empLoans.reduce((sum, l) => sum + l.amount, 0);
                                                const repaid = empLoans.reduce((sum, l) => sum + l.repaymentAmount, 0);
                                                const remaining = totalLoan - repaid;
                                                const lastLoan = empLoans.sort((a,b) => b.date.localeCompare(a.date))[0];
                                                
                                                return (
                                                    <>
                                                        <div className="flex justify-between text-xs"><span className="text-slate-500">Basic Salary:</span> <span className="font-bold">PKR {emp?.salary.basic.toLocaleString()}</span></div>
                                                        <div className="flex justify-between text-xs"><span className="text-slate-500">Net Salary:</span> <span className="font-bold">PKR {(emp?.salary.basic || 0).toLocaleString()}</span></div>
                                                        <div className="border-t my-2"></div>
                                                        <div className="flex justify-between text-xs"><span className="text-slate-500">Active Loans:</span> <span className="font-bold">{empLoans.length}</span></div>
                                                        <div className="flex justify-between text-xs"><span className="text-slate-500">Total Loan Amount:</span> <span className="font-bold">PKR {totalLoan.toLocaleString()}</span></div>
                                                        <div className="flex justify-between text-xs"><span className="text-slate-500">Remaining Balance:</span> <span className="font-bold text-red-600">PKR {remaining.toLocaleString()}</span></div>
                                                        {lastLoan && (
                                                            <div className="mt-2 pt-2 border-t border-dashed">
                                                                <p className="text-[9px] font-black uppercase text-slate-400">Last Loan</p>
                                                                <div className="flex justify-between text-xs"><span className="text-slate-500">{lastLoan.date}:</span> <span className="font-bold">PKR {lastLoan.amount.toLocaleString()}</span></div>
                                                            </div>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </div>

                                <div className="col-span-2 md:col-span-1 space-y-4">
                                    {(formHeader.subCategory === 'Loan Request' || formHeader.subCategory === 'Salary Advance') && (
                                        <>
                                            <div>
                                                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Amount Required</label>
                                                <input type="number" className="sap-input w-full font-bold" value={formHeader.loanAmount} onChange={e => setFormHeader({...formHeader, loanAmount: Number(e.target.value)})} />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Purpose / Reason</label>
                                                <textarea className="sap-input w-full font-bold" rows={2} value={formHeader.loanPurpose} onChange={e => setFormHeader({...formHeader, loanPurpose: e.target.value})} />
                                            </div>
                                            {formHeader.subCategory === 'Loan Request' && (
                                                <div>
                                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Installments (Months)</label>
                                                    <input type="number" className="sap-input w-full font-bold" value={formHeader.installments} onChange={e => setFormHeader({...formHeader, installments: Number(e.target.value)})} />
                                                </div>
                                            )}
                                            {formHeader.subCategory === 'Salary Advance' && (
                                                <div className="p-3 bg-amber-50 text-amber-700 text-xs font-bold rounded-lg border border-amber-200">
                                                    Note: Advance salary is fully deducted from the upcoming salary.
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {formHeader.subCategory === 'Skip Installment' && (
                                        <div>
                                            <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Skip Month</label>
                                            <input type="month" className="sap-input w-full font-bold" value={formHeader.skipMonth} onChange={e => setFormHeader({...formHeader, skipMonth: e.target.value})} />
                                        </div>
                                    )}

                                    {formHeader.subCategory === 'Waive Absent' && (
                                        <>
                                            <div>
                                                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Absent Date</label>
                                                <input type="date" className="sap-input w-full font-bold" value={formHeader.absentDate} onChange={e => setFormHeader({...formHeader, absentDate: e.target.value})} />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Reason</label>
                                                <textarea className="sap-input w-full font-bold" rows={2} value={formHeader.absentReason} onChange={e => setFormHeader({...formHeader, absentReason: e.target.value})} />
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                     </div>
                 )}
              </div>
              <div className="px-10 py-8 bg-white border-t flex justify-end space-x-4">
                 <button onClick={() => setIsModalOpen(false)} className="px-8 py-3 text-slate-400 font-black uppercase text-xs tracking-widest">Discard</button>
                 <button onClick={handlePostPR} className="bg-slate-900 text-white px-12 py-4 rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all flex items-center space-x-3"><Save size={18}/> <span>Post Requisition</span></button>
              </div>
           </div>
        </div>
      )}

      {viewingRequisition && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[400]">
           <div className="bg-white rounded-[2.5rem] w-full max-w-3xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
              <div className="px-8 py-6 bg-slate-900 text-white flex justify-between items-center">
                 <div>
                    <h3 className="text-xl font-black uppercase tracking-tight">Requisition Details</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{viewingRequisition.id}</p>
                 </div>
                 <button onClick={() => setViewingRequisition(null)}><XCircle size={24}/></button>
              </div>
              <div className="p-8 bg-slate-50 space-y-6 max-h-[70vh] overflow-y-auto">
                 <div className="grid grid-cols-2 gap-6">
                    <div className="bg-white p-4 rounded-2xl border shadow-sm">
                        <p className="text-[10px] font-black uppercase text-slate-400 mb-2">General Info</p>
                        <div className="space-y-1">
                            <p className="text-xs font-bold text-slate-600 uppercase">Category: <span className="text-slate-900">{viewingRequisition.category}</span></p>
                            <p className="text-xs font-bold text-slate-600 uppercase">Sub-Category: <span className="text-slate-900">{viewingRequisition.subCategory}</span></p>
                            <p className="text-xs font-bold text-slate-600 uppercase">Date: <span className="text-slate-900">{viewingRequisition.date}</span></p>
                            <p className="text-xs font-bold text-slate-600 uppercase">Status: 
                                <span className={`ml-2 px-2 py-0.5 rounded text-[9px] font-black uppercase ${viewingRequisition.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : viewingRequisition.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {viewingRequisition.status}
                                </span>
                            </p>
                        </div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border shadow-sm">
                        <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Valuation</p>
                        <p className="text-2xl font-black text-slate-900">PKR {viewingRequisition.totalValue.toLocaleString()}</p>
                    </div>
                 </div>

                 {viewingRequisition.category === 'HR' ? (
                    <div className="bg-white p-6 rounded-2xl border shadow-sm space-y-4">
                        <p className="text-[10px] font-black uppercase text-slate-400">Employee Details</p>
                        <div className="grid grid-cols-2 gap-4">
                            <p className="text-xs font-bold text-slate-600 uppercase">Employee ID: <span className="text-slate-900">{viewingRequisition.employeeId}</span></p>
                            {viewingRequisition.loanAmount && <p className="text-xs font-bold text-slate-600 uppercase">Amount: <span className="text-slate-900">PKR {viewingRequisition.loanAmount.toLocaleString()}</span></p>}
                            {viewingRequisition.loanPurpose && <p className="text-xs font-bold text-slate-600 uppercase col-span-2">Purpose: <span className="text-slate-900">{viewingRequisition.loanPurpose}</span></p>}
                            {viewingRequisition.installments && <p className="text-xs font-bold text-slate-600 uppercase">Installments: <span className="text-slate-900">{viewingRequisition.installments}</span></p>}
                            {viewingRequisition.skipMonth && <p className="text-xs font-bold text-slate-600 uppercase">Skip Month: <span className="text-slate-900">{viewingRequisition.skipMonth}</span></p>}
                            {viewingRequisition.absentDate && <p className="text-xs font-bold text-slate-600 uppercase">Absent Date: <span className="text-slate-900">{viewingRequisition.absentDate}</span></p>}
                            {viewingRequisition.absentReason && <p className="text-xs font-bold text-slate-600 uppercase col-span-2">Reason: <span className="text-slate-900">{viewingRequisition.absentReason}</span></p>}
                            {viewingRequisition.overtimeHours && <p className="text-xs font-bold text-slate-600 uppercase">OT Hours: <span className="text-slate-900">{viewingRequisition.overtimeHours}</span></p>}
                            {viewingRequisition.overtimeProject && <p className="text-xs font-bold text-slate-600 uppercase">Project: <span className="text-slate-900">{viewingRequisition.overtimeProject}</span></p>}
                        </div>
                    </div>
                 ) : (
                    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                        <div className="p-4 bg-slate-50 border-b"><h4 className="font-black text-slate-700 uppercase text-xs">Item Overview</h4></div>
                        <table className="w-full text-left sap-table text-xs">
                            <thead className="bg-slate-50 border-b">
                                <tr>
                                    <th className="px-4 py-2">Description</th>
                                    <th className="px-4 py-2">Qty</th>
                                    <th className="px-4 py-2">Unit</th>
                                    <th className="px-4 py-2 text-right">Rate</th>
                                    <th className="px-4 py-2 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {viewingRequisition.items.map((item, idx) => (
                                    <tr key={idx}>
                                        <td className="px-4 py-2 font-bold uppercase">{item.materialDesc}</td>
                                        <td className="px-4 py-2">{item.qty}</td>
                                        <td className="px-4 py-2 uppercase">{item.unit}</td>
                                        <td className="px-4 py-2 text-right">{item.estimatedRate.toLocaleString()}</td>
                                        <td className="px-4 py-2 text-right font-black">{(item.qty * item.estimatedRate).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                 )}
              </div>
              <div className="px-8 py-6 bg-white border-t flex justify-end space-x-3">
                 <button onClick={() => setViewingRequisition(null)} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest">Close</button>
              </div>
           </div>
        </div>
      )}

      {/* PO Modals remain the same... */}
      {isConvertModalOpen && selectedPrForConversion && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[400]">
              <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                  <div className="px-8 py-6 bg-slate-900 text-white flex justify-between items-center shrink-0"><div><h3 className="text-xl font-black uppercase">Source of Supply</h3></div><button onClick={() => setIsConvertModalOpen(false)}><XCircle size={24}/></button></div>
                  <div className="p-8 space-y-6 bg-slate-50">
                      <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Select Vendor</label><select className="w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-bold text-sm outline-none uppercase" value={selectedVendorForPO} onChange={e => setSelectedVendorForPO(e.target.value)}><option value="">-- Choose Supplier --</option>{vendors.map(v => (<option key={v.id} value={v.name}>{v.name}</option>))}</select></div>
                          <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Budget Cost Head</label><select className="w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-bold text-sm outline-none uppercase" value={selectedCostHead} onChange={e => setSelectedCostHead(e.target.value as any)}><option value="Hardware">Hardware</option><option value="Glass">Glass</option><option value="Aluminium">Aluminium</option><option value="Installation">Installation</option></select></div>
                      </div>
                      <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100"><label className="text-[10px] font-black uppercase text-indigo-800 ml-1">Project Link</label><select className="w-full p-3 bg-white border-2 border-indigo-200 rounded-xl font-bold text-sm outline-none uppercase text-indigo-900" value={selectedProjectForPO} onChange={e => setSelectedProjectForPO(e.target.value)}><option value="">-- General Stock --</option>{projects.map(p => (<option key={p.id} value={p.id}>{p.title}</option>))}</select></div>
                  </div>
                  <div className="px-8 py-6 bg-white border-t flex justify-end space-x-3"><button onClick={() => setIsConvertModalOpen(false)} className="px-6 py-3 text-slate-400 font-black uppercase text-xs">Cancel</button><button onClick={handleConvertToPO} className="bg-emerald-600 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl">Generate PO</button></div>
              </div>
          </div>
      )}

      {isDirectPOOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[400]">
              <div className="bg-white rounded-[2.5rem] w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                  <div className="px-10 py-6 bg-emerald-600 text-white flex justify-between items-center shrink-0"><div><h3 className="text-xl font-black uppercase">Direct Purchase Order</h3></div><button onClick={() => setIsDirectPOOpen(false)}><XCircle size={24}/></button></div>
                  <div className="flex-1 overflow-y-auto p-10 bg-slate-50 space-y-6">
                      <div className="grid grid-cols-2 gap-6 bg-white p-6 rounded-2xl border shadow-sm">
                          <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Vendor</label><select className="w-full p-3 bg-slate-50 border rounded-xl font-bold uppercase outline-none" value={selectedVendorForPO} onChange={e => setSelectedVendorForPO(e.target.value)}><option value="">-- Select Vendor --</option>{vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}</select></div>
                          <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Budget Head</label><select className="w-full p-3 bg-slate-50 border rounded-xl font-bold uppercase outline-none" value={selectedCostHead} onChange={e => setSelectedCostHead(e.target.value as any)}><option value="Hardware">Hardware</option><option value="Glass">Glass</option><option value="Aluminium">Aluminium</option><option value="Installation">Installation</option></select></div>
                          <div className="col-span-2 space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Project Link (Optional)</label><select className="w-full p-3 bg-indigo-50 border border-indigo-100 rounded-xl font-bold uppercase outline-none text-indigo-800" value={selectedProjectForPO} onChange={e => setSelectedProjectForPO(e.target.value)}><option value="">-- General Stock --</option>{projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
                      </div>
                      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden"><div className="p-4 bg-slate-50 border-b flex justify-between items-center"><h4 className="font-black text-slate-700 uppercase text-xs">Line Items</h4><button onClick={() => setDirectPoItems([...directPoItems, {desc: '', qty: 1, rate: 0, amount: 0}])} className="text-emerald-600 font-bold text-xs">+ Add Item</button></div><table className="w-full text-left sap-table"><thead><tr><th className="w-10 px-4 py-3">#</th><th className="px-4 py-3">Description</th><th className="w-24 text-center px-4 py-3">Qty</th><th className="w-32 text-right px-4 py-3">Rate</th><th className="w-32 text-right px-4 py-3">Total</th><th className="w-10 px-4 py-3"></th></tr></thead><tbody>{directPoItems.map((item, idx) => (<tr key={idx}><td className="text-center font-bold text-slate-400 px-4 py-2">{idx+1}</td><td className="px-4 py-2"><input type="text" className="w-full p-1 bg-transparent font-bold outline-none uppercase" value={item.desc} onChange={e => updateDirectItem(idx, 'desc', e.target.value)} placeholder="Item Name"/></td><td className="px-4 py-2"><input type="number" className="w-full p-1 bg-transparent font-bold text-center outline-none" value={item.qty} onChange={e => updateDirectItem(idx, 'qty', Number(e.target.value))}/></td><td className="px-4 py-2"><input type="number" className="w-full p-1 bg-transparent font-bold text-right outline-none" value={item.rate} onChange={e => updateDirectItem(idx, 'rate', Number(e.target.value))}/></td><td className="text-right font-black text-slate-800 px-4 py-2">{item.amount.toLocaleString()}</td><td className="text-center px-4 py-2"><button onClick={() => { if(directPoItems.length > 1) setDirectPoItems(directPoItems.filter((_, i) => i !== idx)) }} className="text-slate-300 hover:text-red-500"><Trash2 size={14}/></button></td></tr>))}</tbody></table></div>
                  </div>
                  <div className="px-10 py-6 bg-white border-t flex justify-between items-center"><div><p className="text-[10px] font-black uppercase text-slate-400">Total Amount</p><p className="text-2xl font-black text-emerald-600">PKR {directPoItems.reduce((s, i) => s + i.amount, 0).toLocaleString()}</p></div><div className="flex space-x-3"><button onClick={() => setIsDirectPOOpen(false)} className="px-6 py-3 text-slate-400 font-bold uppercase text-xs">Cancel</button><button onClick={handleCreateDirectPO} className="bg-emerald-600 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl flex items-center space-x-2"><CheckCircle2 size={16}/> <span>Issue PO</span></button></div></div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Requisitions;
