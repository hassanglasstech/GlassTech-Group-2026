import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSupabasePage } from '@/modules/shared/hooks/useSupabasePage';
import Pagination from '../../../components/Pagination';
import { Company } from '../../shared/types/core';
import { RequisitionStatus } from '../../shared/constants';
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
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Plus, Search, CheckCircle2, ClipboardList, ShieldCheck,
  Check, Hash, User, ShieldAlert, FileText, Save, Trash2, 
  Zap, Briefcase, Warehouse, XCircle, ArrowRight, DollarSign, Building, Folder, ShoppingCart, Truck, Tag,
  BookOpen, Banknote, AlertTriangle, ChevronDown, ChevronUp, X, Calculator, AlertCircle,
  Printer, Send, Building2, Package
} from 'lucide-react';

import { toast } from 'sonner';
import { supabase } from '@/src/services/supabaseClient';

// ── Config helpers (replaces localStorage for custom_sub_categories) ──
const loadConfig = async (company: string, key: string) => {
  try {
    const { data } = await supabase.from('erp_config').select('value').eq('id', `${company}_${key}`).single();
    return data?.value ?? null;
  } catch { return null; }
};
const saveConfig = async (company: string, key: string, value: any) => {
  try {
    await supabase.from('erp_config').upsert([{ id: `${company}_${key}`, company, key, value, updated_at: new Date().toISOString() }], { onConflict: 'id' });
  } catch {}
  localStorage.setItem(`${company}_${key}`, JSON.stringify(value)); // keep LS as cache
};
import { pushCrossCompanyNotif } from '@/modules/shared/services/crossCompanyNotifService';
import { SyncService } from '@/src/services/SyncService';
import { useAppStore } from '../../shared/store/appStore';

import RequisitionPrint from '@/components/RequisitionPrint';
import { useRealtimeRefresh } from '@/modules/shared/hooks/useRealtimeRefresh';

// ─── GL Impact Preview Panel (merged from Glassco) ────────────────────────
const GLPreviewPanel: React.FC<{ company: string; subCategory: string; amount: number; paymentMode?: string }> = ({ company, subCategory, amount, paymentMode }) => {
  const gl = FinanceService.resolveSubcategoryGL?.(company as any, subCategory, paymentMode);
  if (!gl) return (
    <div className="flex flex-col items-center justify-center h-20 text-slate-300">
      <Zap size={20} className="mb-1" />
      <p className="text-[10px] font-bold uppercase">No GL mapping</p>
    </div>
  );
  return (
    <div className="space-y-2">
      <div className="bg-rose-50 border border-rose-100 rounded-xl p-2.5">
        <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-0.5">Debit</p>
        <p className="text-xs font-black text-rose-700">{gl.debitCode} — {gl.debitName}</p>
        {amount > 0 && <p className="text-[10px] font-bold text-rose-600">PKR {amount.toLocaleString()}</p>}
      </div>
      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2.5">
        <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-0.5">Credit</p>
        <p className="text-xs font-black text-emerald-700">{gl.creditCode} — {gl.creditName}</p>
        {amount > 0 && <p className="text-[10px] font-bold text-emerald-600">PKR {amount.toLocaleString()}</p>}
      </div>
      <p className="text-[9px] text-slate-400 text-center">Auto-posted on approval</p>
    </div>
  );
};

// ─── Cost Center Spend Panel (merged from Glassco) ────────────────────────
const CostCenterSpendPanel: React.FC<{ company: string; costCenterId: string; newAmount: number }> = ({ company, costCenterId, newAmount }) => {
  const spend = costCenterId ? FinanceService.getCostCenterSpend(company as any, costCenterId) : null;
  if (!spend || !costCenterId) return (
    <div className="flex items-center gap-2 text-slate-400 p-2">
      <AlertTriangle size={14} />
      <p className="text-xs font-bold">No cost center assigned</p>
    </div>
  );
  return (
    <div className="space-y-2">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Cost Center — This Month</p>
      <div className="flex justify-between text-xs"><span className="text-slate-500 font-bold">Posted</span><span className="font-black text-slate-700">PKR {spend.posted.toLocaleString()}</span></div>
      <div className="flex justify-between text-xs"><span className="text-amber-500 font-bold">Parked</span><span className="font-black text-amber-600">PKR {spend.parked.toLocaleString()}</span></div>
      <div className="border-t border-slate-100 pt-1 flex justify-between text-xs"><span className="text-slate-600 font-bold">Committed</span><span className="font-black text-slate-800">PKR {spend.total.toLocaleString()}</span></div>
      {newAmount > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 flex justify-between text-xs">
          <span className="text-blue-600 font-bold">If approved</span>
          <span className="font-black text-blue-800">PKR {(spend.total + newAmount).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
};

// ─── Inline Approval Panel with GL + Reject (merged from Glassco) ─────────
const InlineApprovalPanel: React.FC<{
  r: any; company: string;
  onApprove: () => void; onReject: (reason: string) => void; onClose: () => void;
}> = ({ r, company, onApprove, onReject, onClose }) => {
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const amount = r.estimatedAmount ?? r.totalValue ?? r.loanAmount ?? 0;
  const primaryCC = r.items?.[0]?.costCenter;

  return (
    <tr><td colSpan={10} className="px-6 pb-4">
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 animate-in slide-in-from-top-2 duration-200">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase text-slate-600 tracking-widest">MD Review — {r.id}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border p-4 space-y-2">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Summary</p>
            <div className="flex justify-between text-xs"><span className="text-slate-500 font-bold">Category</span><span className="font-black">{r.category || '—'}</span></div>
            <div className="flex justify-between text-xs"><span className="text-slate-500 font-bold">Sub-Cat</span><span className="font-black">{r.subCategory || r.reqType || '—'}</span></div>
            {(r as any).paymentMode && <div className="flex justify-between text-xs"><span className="text-slate-500 font-bold">Payment</span><span className="font-black text-emerald-600">{(r as any).paymentMode}</span></div>}
            {(r as any).materialType && (r as any).materialType !== 'General' && <div className="flex justify-between text-xs"><span className="text-slate-500 font-bold">Material Type</span><span className="font-black text-orange-600">{(r as any).materialType}</span></div>}
            <div className="flex justify-between text-xs"><span className="text-slate-500 font-bold">By</span><span className="font-black">{r.requisitioner || 'HR'}</span></div>
            <div className="border-t pt-1 flex justify-between text-xs"><span className="text-slate-500 font-bold">Value</span><span className="font-black text-emerald-700">PKR {amount.toLocaleString()}</span></div>
            {r.requiresCashPayment && <p className="text-[9px] font-bold text-purple-600 flex items-center gap-1"><Banknote size={10}/>Parked PV auto-created</p>}
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2 flex items-center gap-1"><BookOpen size={10}/> GL Impact</p>
            <GLPreviewPanel company={r.company || company} subCategory={r.subCategory || r.reqType || ''} amount={amount} paymentMode={(r as any).paymentMode} />
          </div>
          <div className="bg-white rounded-xl border p-4">
            <CostCenterSpendPanel company={r.company || company} costCenterId={primaryCC || ''} newAmount={amount} />
          </div>
        </div>
        {r.items && r.items.length > 0 && (
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-left"><thead><tr className="bg-slate-50 border-b">
              <th className="px-4 py-2 text-[9px] font-black uppercase text-slate-400">Material</th>
              <th className="px-4 py-2 text-[9px] font-black uppercase text-slate-400 w-16 text-center">Qty</th>
              <th className="px-4 py-2 text-[9px] font-black uppercase text-slate-400 w-28 text-right">Amount</th>
            </tr></thead><tbody className="divide-y divide-slate-50">
              {r.items.map((item: any, idx: number) => (
                <tr key={idx}><td className="px-4 py-2 text-xs font-bold uppercase">{item.materialDesc || '—'}</td><td className="px-4 py-2 text-xs text-center">{item.qty}</td><td className="px-4 py-2 text-xs font-black text-emerald-700 text-right">{(item.qty * item.estimatedRate).toLocaleString()}</td></tr>
              ))}
            </tbody></table>
          </div>
        )}
        {showReject && (
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Rejection Reason (required)</label>
            <textarea rows={2} className="sap-input w-full text-xs font-bold resize-none" placeholder="State the reason..." value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
          </div>
        )}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
          {!showReject ? (<>
            <button onClick={() => setShowReject(true)} className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-rose-200 text-rose-600 text-xs font-black uppercase hover:bg-rose-50"><XCircle size={14}/> Reject</button>
            <button onClick={onApprove} className="flex items-center gap-2 px-8 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase hover:bg-emerald-700 shadow-lg shadow-emerald-200"><CheckCircle2 size={14}/> Approve{r.requiresCashPayment && <span className="ml-1 opacity-75">+ PV</span>}</button>
          </>) : (<>
            <button onClick={() => setShowReject(false)} className="px-6 py-2.5 rounded-xl border text-slate-500 text-xs font-black uppercase hover:bg-slate-50">Cancel</button>
            <button disabled={!rejectReason.trim()} onClick={() => { if (rejectReason.trim()) onReject(rejectReason); }} className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-black uppercase hover:bg-rose-700 disabled:opacity-40"><XCircle size={14}/> Confirm Reject</button>
          </>)}
        </div>
      </div>
    </td></tr>
  );
};

const Requisitions: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'requests' | 'approvals' | 'orders'>('requests');
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

  // ── Server-side pagination for requisitions ───────────────────────
  const REQ_PAGE_SIZE = 20;
  const {
    data: requisitions,
    total: totalRequisitions,
    loading: reqLoading,
    page: reqPage,
    setPage: setReqPage,
    search: reqSearch,
    setSearch: setReqSearch,
    refresh: refreshRequisitions,
  } = useSupabasePage({
    table: 'requisitions',
    company,
    pageSize: REQ_PAGE_SIZE,
    orderBy: 'updated_at',
    orderDesc: true,
    searchColumn: 'description',
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  const [customSubCategories, setCustomSubCategories] = useState<Record<string, string[]>>(() => {
    const saved = localStorage.getItem('gtk_custom_sub_categories');
    return saved ? JSON.parse(saved) : {};
  });

  const CATEGORIES = ['HR', 'Production', 'Store Purchase', 'Admin', 'Repair & Maintenance', 'Factory'];
  const INITIAL_SUB_CATEGORIES: Record<string, string[]> = {
    'HR': ['Loan Request', 'Salary Advance', 'Skip Installment', 'Waive Absent', 'Overtime Approval'],
    'Production': ['Material / Inventory', 'Consumables'],
    'Store Purchase': [
      'BOM Hardware',           // wheels, hinges, handles, connectors, gaskets, EPDM, spiders, patch fittings
      'Aluminium Profiles',     // D2, D3, D65, D32, system profiles
      'Consumables',            // screws, drill bits, blades, sealant, rivets, masking tape
      'Glass Purchase',         // glass for GTK projects
      'Tool Purchase',          // new tools — pliers, screwdrivers, grinders, drills
      'Tool Replacement',       // replacing damaged/lost tools
      'Machine Parts',          // blade, motor, bearing for cutting machine, grinder
    ],
    'Admin': ['General Expense', 'TA/DA', 'Fare Expense', 'Scrap'],
    'Repair & Maintenance': ['Maintenance / R&M', 'Vehicle Fuel', 'Vehicle Maintenance'],
    'Factory': ['Repair & Maintenance', 'Fuel Expense']
  };

  // ── Material Type tag — for reporting which type of spend ──────────
  const MATERIAL_TYPES = ['BOM Component', 'Consumable', 'Returnable Tool', 'Capital Asset', 'Profile', 'General'];

  // ── Payment Modes — determines GL credit account ──────────────────
  const PAYMENT_MODES = ['Cash', 'Petty Cash', 'Personal Account', 'Bank Transfer'];

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

  // Direct PO — glass-aware line items
  const blankPoLine = () => ({
    id: `L${Date.now()}${Math.random().toString(36).slice(2,4)}`,
    desc: '', qty: 0, rate: 0, amount: 0,
    // glass fields
    searchQuery: '', showSuggestions: false,
    productId: '', category: '', subCategory: '', thickness: '', sheetSize: '',
    sqftPerSheet: 0, totalSqft: 0, freightPKR: 0, lastMAP: 0, stockOnHand: 0, remarks: '',
  });
  const [directPoItems, setDirectPoItems] = useState<any[]>(() => Array.from({length:5}, blankPoLine));
  const [poDate, setPoDate] = useState(new Date().toISOString().split('T')[0]);
  const [poDelivDate, setPoDelivDate] = useState('');
  const [poPayTerms, setPoPayTerms] = useState('30 Days Net');
  const [poRemarks, setPoRemarks] = useState('');
  const [poPrintData, setPoPrintData] = useState<any>(null);
  const suggRefs = useRef<Record<string,HTMLDivElement|null>>({});

  const [formHeader, setFormHeader] = useState({
    headerText: '', requisitioner: '', priority: 'Normal' as any,
    category: 'Production',
    subCategory: 'Material / Inventory',
    paymentMode: 'Cash' as string,
    materialType: 'General' as string,
    projectId: '' as string,
    date: new Date().toISOString().split('T')[0],
    employeeId: '', loanAmount: 0, loanPurpose: '', installments: 1,
    skipMonth: '', absentDate: '', absentReason: '',
    overtimeHours: 0, overtimeProject: '', overtimeEmployees: [] as string[],
    employeeName: '', siteName: '', from: '', to: '', amount: 0,
    vehicleType: '', vehicleNo: '', driver: '', purpose: '',
    projectOrSiteName: '', qty: 0, description: '', type: '',
    requiresCashPayment: false
  });

  const [formItems, setFormItems] = useState<RequisitionItem[]>([
    { id: '1', itemCategory: 'Standard', materialDesc: '', qty: 1, unit: 'Unit', estimatedRate: 0, deliveryDate: '', costCenter: '' }
  ]);


  const { refreshKey } = useRealtimeRefresh(['requisitions', 'store_items', 'purchase_orders', 'employees']);

  useEffect(() => {
    refreshData();
  }, [company, refreshKey]);

  useEffect(() => {
    const reqId = searchParams.get('id');
    if (reqId) {
      const found = requisitions.find(r => r.id === reqId);
      if (found) {
        setViewingRequisition(found);
        if (found.status === 'Pending') setActiveTab('approvals');
      }
    }
  }, [searchParams, requisitions]);

  const refreshData = () => {
    refreshRequisitions(); // reload from Supabase
    setPurchaseOrders(ProductionService.getPurchaseOrders().filter(p => p.fromCompany === company).sort((a,b) => b.date.localeCompare(a.date)));

    setTimeout(() => {
      setStoreItems(InventoryService.getStore().filter(s => s.company === company || s.company === 'Factory'));
      setProducts(SalesService.getProducts().filter(p => p.company === company || p.company === 'Factory'));
      setCostCenters(FinanceService.getCostCenters().filter(c => c.company === company));
      setVendors(SalesService.getVendors().filter((v:any) => !v.company || v.company === company));
    }, 0);

    setEmployees(HRService.getEmployees().filter(e => e.company === company));
    setLoans(HRService.getLoans().filter(l => l.status === 'Active'));
    setTimeout(() => {
      setProjects(ProjectService.getProjects().filter(p => p.company === company && p.status === 'Active'));
    }, 50);
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

  const handlePostPR = async () => {
    if (formHeader.category !== 'HR') {
        if (!formHeader.requisitioner || !formHeader.headerText) return toast.error("SAP Protocol: Requisitioner and Header Text are mandatory.", { duration: 4000 });
    }
    
    const isMaterial = ['Material / Inventory', 'Maintenance / R&M', 'General Expense', 'Consumables', 'BOM Hardware', 'Aluminium Profiles', 'Glass Purchase', 'Tool Purchase', 'Tool Replacement', 'Machine Parts'].includes(formHeader.subCategory);
    
    if (isMaterial) {
        if (formItems.some(i => !i.materialDesc || !i.costCenter)) return toast.error("Validation Error: Item Description and Cost Center are required for all line items.", { duration: 4000 });
    } else if (formHeader.subCategory === 'Overtime Approval') {
        if (formHeader.overtimeEmployees.length === 0) return toast.error("Select at least one employee.", { duration: 4000 });
        if (!formHeader.overtimeHours) return toast.error("Enter overtime hours.", { duration: 4000 });
    } else if (formHeader.category === 'HR') {
        if (!formHeader.employeeId) return toast.error("Select an employee.", { duration: 4000 });
        if (formHeader.subCategory === 'Loan Request' && !formHeader.loanAmount) return toast.error("Enter loan amount.", { duration: 4000 });
        if (formHeader.subCategory === 'Waive Absent' && !formHeader.absentDate) return toast.error("Select date.", { duration: 4000 });
    }

    let totalValue = 0;
    if (isMaterial) {
        totalValue = formItems.reduce((sum, item) => sum + (item.qty * item.estimatedRate), 0);
    } else if (formHeader.subCategory === 'Loan Request' || formHeader.subCategory === 'Salary Advance') {
        totalValue = formHeader.loanAmount;
    } else {
        totalValue = formHeader.amount;
    }

    // Phase-7 (P4-6): zero-value PR guard. Audit RC-19: previously a PR with
    // 0 total could be saved (e.g. all rates left at 0), polluting the
    // approval queue and creating a PKR 0 PV when approved. HR-category
    // exempt (Waive Absent / Loan Request initial draft can be 0 by design
    // — they're set later in the workflow).
    if (formHeader.category !== 'HR' && totalValue <= 0) {
      return toast.error(
        'Validation Error: Total value must be > 0. Add line items with quantities and rates, or set the requested amount.',
        { duration: 5000 }
      );
    }

    const allReqs = InventoryService.getRequisitions().filter(Boolean);
    const prId = AppService.generateSequenceID('REQ', company, allReqs);

    const newPR: Requisition = {
      id: prId,
      company, 
      targetCompany: company === 'Factory' ? undefined : 'Factory',
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
      paymentMode: formHeader.paymentMode,
      materialType: formHeader.materialType,
      projectOrSiteName: formHeader.projectOrSiteName || (formHeader.projectId ? projects.find(p => p.id === formHeader.projectId)?.title : ''),
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
      employeeName: formHeader.employeeName,
      siteName: formHeader.siteName,
      from: formHeader.from,
      to: formHeader.to,
      amount: formHeader.amount,
      vehicleType: formHeader.vehicleType,
      vehicleNo: formHeader.vehicleNo,
      driver: formHeader.driver,
      purpose: formHeader.purpose,
      projectId: formHeader.projectId || undefined,
      qty: formHeader.qty,
      description: formHeader.description,
      type: formHeader.type,
      requiresCashPayment: formHeader.requiresCashPayment,
      paymentStatus: formHeader.requiresCashPayment ? 'Pending' : 'Not Required'
    };

    InventoryService.saveRequisitions([...allReqs, newPR]);
    
    // NEW NOTIFICATION SYSTEM: Send to Factory
    if (company !== 'Factory') {
      const notification = {
          id: Date.now().toString(),
          targetCompany: 'Factory',
          title: `New Requisition from ${company}`,
          message: `PR #${newPR.id} needs approval. Value: PKR ${newPR.totalValue}`,
          isRead: false,
          date: new Date().toISOString(),
          link: `/requisitions?id=${newPR.id}`
      };
      await pushCrossCompanyNotif({
          targetCompany: 'Factory',
          fromCompany:   company,
          title:         notification.title,
          message:       notification.message,
          type:          'requisition_submitted',
          referenceId:   newPR.id,
          link:          notification.link,
        });
    }

    refreshData();
    setIsModalOpen(false);
    resetForm();
    toast.success(`Success: Requisition ${newPR.id} Created and Sent to Factory.`, { duration: 4000 });
  };

  const resetForm = () => {
    setFormHeader({ 
        headerText: '', requisitioner: '', priority: 'Normal', 
        category: 'Production', subCategory: 'Material / Inventory',
        paymentMode: 'Cash', materialType: 'General', projectId: '',
        date: new Date().toISOString().split('T')[0],
        employeeId: '', loanAmount: 0, loanPurpose: '', installments: 1,
        skipMonth: '', absentDate: '', absentReason: '',
        overtimeHours: 0, overtimeProject: '', overtimeEmployees: [],
        employeeName: '', siteName: '', from: '', to: '', amount: 0,
        vehicleType: '', vehicleNo: '', driver: '', purpose: '',
        projectOrSiteName: '', qty: 0, description: '', type: '',
        requiresCashPayment: false
    });
    setFormItems([{ id: '1', itemCategory: 'Standard', materialDesc: '', qty: 1, unit: 'Unit', estimatedRate: 0, deliveryDate: '', costCenter: '' }]);
  };

  const getReleaseStrategy = (val: number) => {
      if (val > 100000) return { label: 'L2 Director', color: 'bg-purple-100 text-purple-700' };
      return { label: 'L1 Manager', color: 'bg-blue-100 text-blue-700' };
  };

  // ─── APPROVE: Single Parked PV → Finance reviews & posts ─────────────
  const handleApprove = async (id: string) => {
    const pr = requisitions.find(r => r.id === id);
    if (!pr) return;

    // Phase-7 (P4-1): zero-value PR guard. Audit RC-15: previously a PR with
    // totalValue===0 (empty items, or all rates=0) would be approved and a
    // PKR 0 Parked PV created → cluttered ledger + meaningless audit trail.
    const prAmount = (pr as any).totalValue || (pr as any).loanAmount || (pr as any).amount || 0;
    if (prAmount <= 0) {
      toast.error(`Cannot approve PR ${id}: total value is PKR 0. Edit the PR with a non-zero amount first.`, { duration: 6000 });
      return;
    }

    const approvedPr = { ...pr, status: 'Approved' as const, approvedBy: 'MD', paymentStatus: 'Pending' as const };

    // ── Phase-7 (P4-2): atomic approval. Audit RC-16: previously the
    // try/catch swallowed PV creation failures and STILL marked the PR as
    // Approved → orphan Approved PR with no GL entry, breaking the audit
    // chain. Now PV creation must succeed before the PR status changes.
    let pv: any;
    try {
      pv = FinanceService.createParkedPV(approvedPr);
      approvedPr.paymentRef = pv.id;
    } catch (e: any) {
      console.error('PV creation failed:', e);
      toast.error(`Approval blocked: Parked PV creation failed (${e?.message?.slice(0,60) || 'unknown'}). PR remains Pending — fix and retry.`, { duration: 7000 });
      return; // abort: PR stays Pending, no ledger touch
    }

    const all = InventoryService.getRequisitions().filter(Boolean);
    const updated = all.map(r => r.id === id ? approvedPr : r);
    InventoryService.saveRequisitions(updated);
    SyncService.markDirty('requisitions');
    SyncService.markDirty('ledger');

    // Phase-7 (P5-2): auto-apply Overtime Approval to attendance.
    // Audit RC-21: previously an approved Overtime PR went to a Parked PV
    // but the OT hours never reached attendance/payroll → payroll computed
    // OT only from manually-entered attendance, ignoring approved PRs.
    let otApplied = 0;
    if (pr.subCategory === 'Overtime Approval') {
      const otHours = Number((pr as any).overtimeHours) || 0;
      const otEmpIds: string[] = ((pr as any).overtimeEmployees || []).filter(Boolean);
      const otDate = (pr as any).date || new Date().toISOString().split('T')[0];

      if (otHours > 0 && otEmpIds.length > 0) {
        try {
          const allAtt = HRService.getAttendance();
          const updatedAtt = [...allAtt];
          for (const empId of otEmpIds) {
            const idx = updatedAtt.findIndex((r: any) => r.employeeId === empId && r.date === otDate);
            if (idx >= 0) {
              updatedAtt[idx] = { ...updatedAtt[idx], overtimeHours: (Number(updatedAtt[idx].overtimeHours) || 0) + otHours };
            } else {
              updatedAtt.push({
                id: `ATT-OT-${empId}-${otDate}-${Date.now()}`,
                employeeId: empId, date: otDate,
                status: 'Present', lateMinutes: 0, earlyMinutes: 0,
                overtimeHours: otHours,
              } as any);
            }
            otApplied++;
          }
          await HRService.saveAttendance(updatedAtt);
        } catch (e: any) {
          console.warn('[OT Approval] Could not push OT to attendance:', e?.message);
          toast.error(`OT PR approved but attendance update failed: ${e?.message?.slice(0,60)}`, { duration: 5000 });
        }
      }
    }

    const otNote = otApplied > 0 ? ` | OT applied to ${otApplied} employees on ${(pr as any).date}` : '';
    toast.success(`Approved ✓ Parked PV ${pv.id} created — Finance must review & post${otNote}`, { duration: 6000 });

    // Send notification back to Branch
    if (company === 'Factory' && pr.company !== 'Factory') {
        const notification = {
            id: Date.now().toString(),
            targetCompany: pr.company,
            title: `Requisition Approved!`,
            message: `Factory approved PR #${pr.id}. Parked PV created — Finance will review & post.`,
            isRead: false,
            date: new Date().toISOString(),
            link: `/requisitions?id=${pr.id}`
        };
        await pushCrossCompanyNotif({
          targetCompany: pr.company,
          fromCompany:   'Factory',
          title:         notification.title,
          message:       notification.message,
          type:          'requisition_approved',
          referenceId:   pr.id,
          link:          notification.link,
        });
    }

    refreshData();
    setExpandedId(null);
  };

  // ─── REJECT with Reason (merged from Glassco) ─────────────────────────
  const handleDisapprove = (id: string, reason?: string) => {
    const finalReason = reason || window.prompt("Rejection reason (required):");
    if (!finalReason || !finalReason.trim()) {
      toast.error("Rejection reason is required.", { duration: 3000 });
      return;
    }
    const all = InventoryService.getRequisitions().filter(Boolean);
    const updated = all.map(r => r.id === id ? { ...r, status: 'Rejected' as const, approvedBy: 'MD', headerText: `${r.headerText} [REJECTED: ${finalReason}]` } : r);
    InventoryService.saveRequisitions(updated);
    refreshData();
    setExpandedId(null);
    toast.error(`Requisition ${id} rejected: ${finalReason}`, { duration: 4000 });
  };

  const handleDelete = (id: string) => {
    // Phase-7 (P4-3): block delete when PR is downstream-bound. Audit RC-17:
    // previously deleting an Approved PR left an orphan Parked PV in the
    // ledger (pv.reqId points to a PR that no longer exists). Likewise
    // 'Converted to PO' would orphan the PO. Now we hard-block.
    const pr = InventoryService.getRequisitions().find((r: any) => r.id === id);
    if (!pr) return;
    if (pr.status === 'Approved' || pr.status === 'Converted to PO' || pr.status === 'Paid') {
      toast.error(
        `Cannot delete PR ${id}: status is "${pr.status}". Downstream records exist (Parked PV / PO / Payment). ` +
        `If you really need to remove this, void the PV first via Finance, then retry.`,
        { duration: 7000 }
      );
      return;
    }
    if (!confirm(`Delete requisition ${id}? This cannot be undone.`)) return;
    const all = InventoryService.getRequisitions().filter(Boolean);
    InventoryService.saveRequisitions(all.filter(r => r.id !== id));
    refreshData();
    toast.success(`Requisition ${id} deleted.`, { duration: 3000 });
  };

  // handlePaymentVoucher REMOVED — Parked PV is created on approval.
  // Finance team reviews & posts via General Ledger > Parked tab.
  // When Finance posts the Parked PV, the GL entry goes live.

  const handleAddNewSubCategory = (cat: string) => {
    const name = window.prompt(`Enter new sub-category for ${cat}:`);
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
          status: 'Sent', totalAmount: amount, category: category, projectId: project, items: items,
          reqId: sourcePRId || undefined
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
      if (!selectedPrForConversion || !selectedVendorForPO) return toast.error("Select a Vendor to proceed.", { duration: 4000 });
      const itemsPayload = selectedPrForConversion.items.map(i => ({ description: i.materialDesc, qty: i.qty, rate: i.estimatedRate, costCenter: i.costCenter }));
      const poId = createAndPostPO(selectedVendorForPO, selectedProjectForPO, selectedCostHead, selectedPrForConversion.totalValue, itemsPayload, selectedPrForConversion.id);
      setIsConvertModalOpen(false);
      toast.error(`Success: Purchase Order ${poId} generated.`, { duration: 4000 });
  };

  // ── Direct PO: glass catalogue + search ───────────────────────────────
  const glassVendors = useMemo(() =>
    vendors.filter((v:any) => (v.type === 'Glass' || v.type === 'Supplier') && (!v.company || v.company === company)), [vendors, company]);
  const transportVendorsList = useMemo(() =>
    vendors.filter((v:any) => v.type === 'Transport'), [vendors]);

  const glassCatalogue = useMemo(() => {
    const items: any[] = [];
    const seen = new Set<string>();
    const storeItems = InventoryService.getStore().filter((s:any) => s.company === company);
    SalesService.getProducts()
      .filter((p:any) => (p.company === company || !p.company) && (p.category === 'Glass' || p.glassType) && p.thickness && p.sheetSize)
      .forEach((p:any) => {
        const key = `${p.glassType||p.category}-${p.subCategory||'Std'}-${p.thickness}-${p.sheetSize}`;
        if (seen.has(key)) return; seen.add(key);
        const store = storeItems.find((s:any) => s.id === p.id);
        items.push({ key, label: [p.glassType||p.category, p.subCategory||'', p.thickness, p.sheetSize+'"'].filter(Boolean).join(' ').trim(),
          category: p.glassType||p.category||'Plain', subCategory: p.subCategory||'Standard',
          thickness: p.thickness, sheetSize: p.sheetSize, productId: p.id,
          lastMAP: store?.movingAveragePrice||p.costPrice||0, stockOnHand: store?.unrestrictedQty||0, source:'master' });
      });
    InventoryService.getStockLedger()
      .filter((e:any) => e.company === company && e.mvmntCode === '101' && e.sheetTagMeta)
      .forEach((e:any) => {
        const meta = e.sheetTagMeta; const cat = e.glassCategory||'Plain';
        if (!meta?.thickness||!meta?.sheetSize) return;
        const key = `hist-${cat}-${meta.thickness}-${meta.sheetSize}`;
        if (seen.has(key)) return; seen.add(key);
        const store = storeItems.find((s:any) => s.id === e.materialId);
        items.push({ key, label: `${cat} ${meta.thickness} ${meta.sheetSize}"`,
          category: cat, subCategory:'Standard', thickness: meta.thickness, sheetSize: meta.sheetSize,
          productId: e.materialId, lastMAP: store?.movingAveragePrice||e.valuation||0,
          stockOnHand: store?.unrestrictedQty||0, source:'stock' });
      });
    return items;
  }, [company, vendors]);

  const getPoSuggestions = (query: string) => {
    if (!query.trim()) return glassCatalogue.slice(0,12);
    const tokens = query.toLowerCase().replace(/['"]/g,'').split(/\s+/).filter(Boolean);
    return glassCatalogue.filter((item:any) => {
      const hay = [item.label,item.category,item.subCategory,item.thickness,item.sheetSize].join(' ').toLowerCase();
      return tokens.every((t:string) => hay.includes(t));
    }).slice(0,10);
  };

  const sqftOf = (size: string) => { const [w,h] = size.split('x').map(Number); return w&&h ? Number(((w*h)/144).toFixed(3)) : 0; };

  const updatePoLine = (id: string, patch: any) => {
    setDirectPoItems(prev => prev.map((l:any) => {
      if (l.id !== id) return l;
      const u = { ...l, ...patch };
      const spf = sqftOf(u.sheetSize)||u.sqftPerSheet||0;
      const totalSqft = Number((u.qty * spf).toFixed(2));
      const amount = Number((totalSqft * u.rate + (u.freightPKR||0)).toFixed(2));
      return { ...u, sqftPerSheet: spf, totalSqft, amount };
    }));
  };

  const pickPoSuggestion = (lineId: string, s: any) => {
    setDirectPoItems(prev => prev.map((l:any) => {
      if (l.id !== lineId) return l;
      const spf = sqftOf(s.sheetSize);
      const totalSqft = Number((l.qty * spf).toFixed(2));
      const amount = Number((totalSqft * (l.rate||s.lastMAP) + (l.freightPKR||0)).toFixed(2));
      return { ...l, searchQuery: s.label, showSuggestions: false, productId: s.productId,
        desc: s.label, category: s.category, subCategory: s.subCategory,
        thickness: s.thickness, sheetSize: s.sheetSize, sqftPerSheet: spf,
        totalSqft, lastMAP: s.lastMAP, stockOnHand: s.stockOnHand,
        rate: l.rate > 0 ? l.rate : s.lastMAP, amount };
    }));
  };

  const handleCreateDirectPO = () => {
      if (!selectedVendorForPO) return toast.error('Select a Vendor.', { duration: 4000 });
      const filledLines = directPoItems.filter((l:any) => l.qty > 0 && l.rate > 0);
      if (!filledLines.length) return toast.error('At least one line with qty and rate required.', { duration: 4000 });
      const totalAmount = filledLines.reduce((s:number, l:any) => s + l.amount, 0);
      const totalSheets = filledLines.reduce((s:number, l:any) => s + l.qty, 0);
      const totalFreight = filledLines.reduce((s:number, l:any) => s + (l.freightPKR||0), 0);
      const vendor = vendors.find((v:any) => v.name === selectedVendorForPO || v.id === selectedVendorForPO);

      // Build PO ID using PO date
      const d = poDate ? new Date(poDate) : new Date();
      const pfx = `PO-GLS-${String(d.getMonth()+1).padStart(2,'0')}${String(d.getFullYear()).slice(-2)}-`;
      const allPOs = ProductionService.getPurchaseOrders();
      const nums = allPOs.filter((p:any)=>p.id?.startsWith(pfx)).map((p:any)=>parseInt(p.id.replace(pfx,''))||0);
      const poId = `${pfx}${String(nums.length ? Math.max(...nums)+1 : 1).padStart(3,'0')}`;

      const newPO: any = {
        id: poId, fromCompany: company,
        toVendor: vendor?.name || selectedVendorForPO,
        date: poDate, status: 'Sent', totalAmount, category: 'Glass',
        matchStatus: 'Pending',
        vendorId: vendor?.id || selectedVendorForPO,
        deliveryDate: poDelivDate, payTerms: poPayTerms,
        headerRemarks: poRemarks, totalSheets, totalFreight,
        items: filledLines.map((l:any) => ({
          description: l.desc || `${l.category} ${l.thickness} ${l.sheetSize}"`,
          qty: l.totalSqft || l.qty, rate: l.rate, costCenter: 'STORE',
          specs: JSON.stringify({
            category: l.category, subCategory: l.subCategory,
            thickness: l.thickness, sheetSize: l.sheetSize,
            sheetCount: l.qty, sqftPerSheet: l.sqftPerSheet,
            freightPKR: l.freightPKR||0, lineTotal: l.amount, remarks: l.remarks||'',
          }),
        })),
      };

      ProductionService.savePurchaseOrders([...allPOs, newPO]);
      refreshData();
      setIsDirectPOOpen(false);
      setDirectPoItems(Array.from({length:5}, blankPoLine));
      setPoDate(new Date().toISOString().split('T')[0]);
      setPoDelivDate(''); setPoRemarks('');
      toast.success(`PO ${poId} created successfully.`, { duration: 4000 });
      setTimeout(() => setPoPrintData(newPO), 300);
  };

  const updateDirectItem = (idx: number, field: string, val: any) => {
      // kept for backward compat — glass lines use updatePoLine instead
      const newItems = [...directPoItems];
      const item: any = { ...newItems[idx], [field]: val };
      item.amount = (item.qty||0) * (item.rate||0);
      newItems[idx] = item;
      setDirectPoItems(newItems);
  };

  const toggleSelection = (id: string) => {
    if (selectedRequisitions.includes(id)) {
      setSelectedRequisitions(selectedRequisitions.filter(item => item !== id));
    } else {
      if (selectedRequisitions.length >= 4) {
        toast.error("You can select up to 4 requisitions for printing on one page.", { duration: 4000 });
        return;
      }
      setSelectedRequisitions([...selectedRequisitions, id]);
    }
  };

  const handlePrint = () => {
    if (selectedRequisitions.length === 0) return toast.error("Select at least one requisition to print.", { duration: 4000 });
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
                      <td className="px-6 py-3 text-xs font-bold uppercase text-slate-800">{r?.subCategory || r?.reqType || 'N/A'}</td>
                      <td className="px-6 py-3 text-xs font-bold uppercase text-slate-600 truncate max-w-[200px]">{r.headerText}</td>
                      <td className="px-6 py-3 font-black">PKR {(r.totalValue || 0).toLocaleString()}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${r.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : r.status === 'Rejected' ? 'bg-red-100 text-red-700' : r.status === 'Paid' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right space-x-2" onClick={e => e.stopPropagation()}>
                        {r.status === 'Pending' && company === 'Factory' && (
                          <>
                            <button onClick={() => handleApprove(r.id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Approve"><Check size={16}/></button>
                            <button onClick={() => handleDisapprove(r.id)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg" title="Disapprove"><XCircle size={16}/></button>
                          </>
                        )}
                        <button onClick={() => handleDelete(r.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 size={16}/></button>
                        {r.status === 'Approved' && r.paymentRef && (
                          <span className="text-[9px] font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded-lg" title={`Parked PV: ${r.paymentRef} — Finance will post via GL`}>{r.paymentRef}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {requisitions.length === 0 && !reqLoading && <div className="py-20 text-center text-slate-400 font-bold uppercase italic">No requisitions found.</div>}
          <Pagination
            totalItems={totalRequisitions}
            itemsPerPage={REQ_PAGE_SIZE}
            currentPage={reqPage}
            onPageChange={setReqPage}
          />
          </div>
        </div>
      )}

      {activeTab === 'approvals' && (
          <div className="space-y-4 animate-in fade-in duration-300">
              {requisitions.filter(r => r.status === 'Pending').length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 flex items-center gap-3">
                  <AlertCircle size={16} className="text-amber-500 shrink-0" />
                  <p className="text-xs font-bold text-amber-700">{requisitions.filter(r => r.status === 'Pending').length} requisition(s) awaiting MD approval — click a row to review GL impact</p>
                </div>
              )}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b bg-slate-50 flex justify-between items-center">
                  <h3 className="font-black text-slate-800 uppercase text-sm tracking-tight">Release Strategy Inbox</h3>
              </div>
              <table className="w-full text-left sap-table">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                      <tr>
                          <th className="px-6 py-3">PR Number</th>
                          <th className="px-6 py-3">Date</th>
                          <th className="px-6 py-3">Category</th>
                          <th className="px-6 py-3">Requisitioner</th>
                          <th className="px-6 py-3">Requirement</th>
                          <th className="px-6 py-3">Value (PKR)</th>
                          <th className="px-6 py-3 text-center">Status</th>
                          <th className="px-6 py-3">Linked Req</th>
                          <th className="px-6 py-3 text-right">Action</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {requisitions.map(r => (
                          <React.Fragment key={r.id}>
                          <tr 
                            className={`group transition-colors cursor-pointer ${expandedId === r.id ? 'bg-blue-50/60' : r.status === 'Pending' ? 'hover:bg-amber-50/40' : 'hover:bg-slate-50/50'}`}
                            onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                          >
                              <td className="px-6 py-3">
                                <div className="flex items-center gap-2">
                                  {expandedId === r.id ? <ChevronUp size={14} className="text-blue-500"/> : <ChevronDown size={14} className="text-slate-300"/>}
                                  <span className="font-black text-blue-600">{r.id}</span>
                                </div>
                              </td>
                              <td className="px-6 py-3 text-xs text-slate-500 font-bold">{r.date || '—'}</td>
                              <td className="px-6 py-3">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black uppercase text-slate-400">{r.category}</span>
                                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[9px] font-black uppercase w-fit">{r?.subCategory || r?.reqType || "N/A"}</span>
                                </div>
                              </td>
                              <td className="px-6 py-3 text-xs font-bold text-slate-600 uppercase">{r.requisitioner || 'HR SYSTEM'}</td>
                              <td className="px-6 py-3 text-xs font-bold text-slate-800 uppercase">
                                {r.category === 'HR' ? `Employee: ${r.employeeId}` : r.headerText}
                              </td>
                              <td className="px-6 py-3 font-black">{(r.totalValue || 0).toLocaleString()}{r.requiresCashPayment && <span className="ml-1 text-[9px] text-purple-500 font-bold">PV</span>}</td>
                              <td className="px-6 py-3 text-center">
                                <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase border ${r.status === 'Approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : r.status === 'Rejected' ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>{r.status}</span>
                              </td>
                              <td className="px-6 py-3">
                                {(r as any).paymentRef ? (
                                  <span className="text-[9px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">{(r as any).paymentRef}</span>
                                ) : (r as any).sourceEventId || (r as any).source_event_id ? (
                                  <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">Event: {((r as any).sourceEventId || (r as any).source_event_id || '').slice(0, 12)}</span>
                                ) : (
                                  <span className="text-[9px] text-slate-300">—</span>
                                )}
                              </td>
                              <td className="px-6 py-3 text-right" onClick={e => e.stopPropagation()}>
                                  {r.status === 'Pending' && company === 'Factory' && <button onClick={() => handleApprove(r.id)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-emerald-700">Release</button>}
                                  {r.status === 'Approved' && (r.subCategory === 'Material / Inventory' || r.reqType === 'Material') && <button onClick={() => openConversionModal(r)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-blue-700">Create PO</button>}
                              </td>
                          </tr>
                          {expandedId === r.id && r.status === 'Pending' && (
                            <InlineApprovalPanel r={r} company={company} onApprove={() => handleApprove(r.id)} onReject={(reason) => handleDisapprove(r.id, reason)} onClose={() => setExpandedId(null)} />
                          )}
                          {expandedId === r.id && r.status !== 'Pending' && (
                            <tr><td colSpan={10} className="px-6 pb-4">
                              <div className="bg-slate-50 border rounded-2xl p-5 space-y-3 animate-in slide-in-from-top-2 duration-200">
                                <div className="flex items-center justify-between">
                                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Detail — {r.status}</p>
                                  <button onClick={() => setExpandedId(null)} className="text-slate-400 hover:text-slate-600"><X size={14}/></button>
                                </div>
                                {r.approvedBy && <p className="text-xs text-slate-600 font-bold">{r.status === 'Approved' ? '✓ Approved' : '✗ Rejected'} by {r.approvedBy}</p>}
                                {r.paymentRef && <p className="text-xs font-bold text-purple-600">PV Ref: {r.paymentRef}</p>}
                              </div>
                            </td></tr>
                          )}
                          </React.Fragment>
                      ))}
                  </tbody>
              </table>
          </div>
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
                                  <td className="px-6 py-3">
                                <div className="flex flex-col gap-0.5">
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase w-fit ${po.status === 'Delivered' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{po.status}</span>
                                  {(po as any).isIntercompany && <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-blue-100 text-blue-600 w-fit">ICO</span>}
                                  {(po as any).currentEta && (po as any).originalEta && (po as any).currentEta > (po as any).originalEta && (
                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-rose-100 text-rose-600 w-fit flex items-center gap-0.5" title={(po as any).etaRevisionReason || 'No reason provided'}>
                                      ETA Revised: {(po as any).currentEta} ({(po as any).etaRevisionReason || 'N/A'})
                                    </span>
                                  )}
                                  {(po as any).currentEta && !((po as any).currentEta > (po as any).originalEta) && (po as any).isIntercompany && (
                                    <span className="text-[8px] text-slate-400 font-bold">ETA: {(po as any).currentEta}</span>
                                  )}
                                </div>
                              </td>
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

                 {/* ── Store Purchase: Payment Mode + Material Type + Project ──────── */}
                 {formHeader.category !== 'HR' && (
                 <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Payment Mode</label>
                      <select className="sap-input w-full font-bold uppercase text-emerald-600" value={formHeader.paymentMode} onChange={e => setFormHeader({...formHeader, paymentMode: e.target.value})}>
                        {PAYMENT_MODES.map(pm => <option key={pm} value={pm}>{pm}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Material Type</label>
                      <select className="sap-input w-full font-bold uppercase text-orange-600" value={formHeader.materialType} onChange={e => setFormHeader({...formHeader, materialType: e.target.value})}>
                        {MATERIAL_TYPES.map(mt => <option key={mt} value={mt}>{mt}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Project / Job Link</label>
                      <select className="sap-input w-full font-bold uppercase text-blue-600" value={formHeader.projectId} onChange={e => setFormHeader({...formHeader, projectId: e.target.value})}>
                        <option value="">— General Stock —</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                      </select>
                    </div>
                 </div>
                 )}

                 {/* ── GL Preview + Cash Payment + Cost Center (merged from Glassco) ── */}
                 <div className="grid grid-cols-3 gap-6">
                    <div className="bg-white p-5 rounded-3xl border shadow-sm">
                      <div className="flex items-center space-x-2 mb-3">
                        <BookOpen size={14} className="text-purple-500" />
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">GL Account Preview</span>
                      </div>
                      <GLPreviewPanel company={company} subCategory={formHeader.subCategory} paymentMode={formHeader.paymentMode} amount={(() => {
                        const isMat = ['Material / Inventory', 'Maintenance / R&M', 'General Expense', 'Consumables', 'BOM Hardware', 'Aluminium Profiles', 'Glass Purchase', 'Tool Purchase', 'Tool Replacement', 'Machine Parts'].includes(formHeader.subCategory);
                        if (isMat) return formItems.reduce((s, i) => s + (i.qty * i.estimatedRate), 0);
                        if (['Loan Request', 'Salary Advance'].includes(formHeader.subCategory)) return formHeader.loanAmount;
                        return formHeader.amount;
                      })()} />
                    </div>
                    <div className="bg-white p-5 rounded-3xl border shadow-sm space-y-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <Calculator size={14} className="text-emerald-500" />
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Valuation</span>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-400">Estimated Total</p>
                        <h3 className="text-2xl font-black text-slate-800">PKR {(() => {
                          const isMat = ['Material / Inventory', 'Maintenance / R&M', 'General Expense', 'Consumables', 'BOM Hardware', 'Aluminium Profiles', 'Glass Purchase', 'Tool Purchase', 'Tool Replacement', 'Machine Parts'].includes(formHeader.subCategory);
                          if (isMat) return formItems.reduce((s, i) => s + (i.qty * i.estimatedRate), 0);
                          if (['Loan Request', 'Salary Advance'].includes(formHeader.subCategory)) return formHeader.loanAmount;
                          return formHeader.amount;
                        })().toLocaleString()}</h3>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-500">Payment: {formHeader.paymentMode}</p>
                          <p className="text-[9px] text-slate-400">Auto-creates Parked PV on approval</p>
                        </div>
                        <button onClick={() => setFormHeader({...formHeader, requiresCashPayment: !formHeader.requiresCashPayment})}
                          className={`w-12 h-6 rounded-full transition-colors relative ${formHeader.requiresCashPayment ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${formHeader.requiresCashPayment ? 'translate-x-6' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                    </div>
                    <div className="bg-white p-5 rounded-3xl border shadow-sm">
                      <div className="flex items-center space-x-2 mb-3">
                        <Building size={14} className="text-blue-500" />
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Budget Check</span>
                      </div>
                      <CostCenterSpendPanel company={company} costCenterId={formItems[0]?.costCenter || ''} newAmount={(() => {
                        const isMat = ['Material / Inventory', 'Maintenance / R&M', 'General Expense', 'Consumables', 'BOM Hardware', 'Aluminium Profiles', 'Glass Purchase', 'Tool Purchase', 'Tool Replacement', 'Machine Parts'].includes(formHeader.subCategory);
                        if (isMat) return formItems.reduce((s, i) => s + (i.qty * i.estimatedRate), 0);
                        if (['Loan Request', 'Salary Advance'].includes(formHeader.subCategory)) return formHeader.loanAmount;
                        return formHeader.amount;
                      })()} />
                    </div>
                 </div>

                 {['Material / Inventory', 'Maintenance / R&M', 'General Expense', 'BOM Hardware', 'Aluminium Profiles', 'Consumables', 'Glass Purchase', 'Tool Purchase', 'Tool Replacement', 'Machine Parts'].includes(formHeader.subCategory) ? (
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
                                                    <p className="font-bold text-slate-700">{emp?.personal?.name || ""}</p>
                                                    <p className="text-[10px] text-slate-400">{emp?.work?.designation || ""}</p>
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
                                        {employees.map(e => <option key={e.id} value={e.id}>{e?.personal?.name || "Unknown"} ({e?.work?.designation || ""})</option>)}
                                    </select>
                                    {formHeader.employeeId && (
                                        <div className="mt-4 p-4 bg-slate-50 rounded-xl border space-y-2">
                                            {(() => {
                                                const emp = employees.find(e => e.id === formHeader.employeeId);
                                                const empLoans = loans.filter(l => l.employeeId === formHeader.employeeId && l.status === 'Active');
                                                const totalLoan = empLoans.reduce((sum, l) => sum + l.amount, 0);
                                                const repaid = empLoans.reduce((sum, l) => sum + l.repaymentAmount, 0);
                                                const remaining = totalLoan - repaid;
                                                const lastLoan = empLoans.sort((a,b) => b.date.localeCompare(a.date))[0];
                                                
                                                return (
                                                    <>
                                                        <div className="flex justify-between text-xs"><span className="text-slate-500">Basic Salary:</span> <span className="font-bold">PKR {(emp?.salary?.basic || 0).toLocaleString()}</span></div>
                                                        <div className="flex justify-between text-xs"><span className="text-slate-500">Net Salary:</span> <span className="font-bold">PKR {(emp?.salary?.basic || 0).toLocaleString()}</span></div>
                                                        <div className="border-t my-2"></div>
                                                        <div className="flex justify-between text-xs"><span className="text-slate-500">Active Loans:</span> <span className="font-bold">{empLoans.length}</span></div>
                                                        <div className="flex justify-between text-xs"><span className="text-slate-500">Total Loan Amount:</span> <span className="font-bold">PKR {totalLoan.toLocaleString()}</span></div>
                                                        <div className="flex justify-between text-xs"><span className="text-slate-500">Remaining Balance:</span> <span className="font-bold text-red-600">PKR {remaining.toLocaleString()}</span></div>
                                                        {lastLoan && (
                                                            <div className="mt-2 pt-2 border-t border-dashed">
                                                                <p className="text-[9px] font-black uppercase text-slate-400">Last Loan</p>
                                                                <div className="flex justify-between text-xs"><span className="text-slate-500">{lastLoan.date}:</span> <span className="font-bold">PKR {(lastLoan?.amount || 0).toLocaleString()}</span></div>
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
              <div className="px-10 py-8 bg-white border-t flex justify-between items-center">
                 <div className="flex items-center space-x-2 text-slate-400">
                    <CheckCircle2 size={14} className="text-purple-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-purple-500">
                      Submit → MD Approval → GL Auto-Post{formHeader.requiresCashPayment ? ' → Parked PV → Finance Posts' : ''}
                    </span>
                 </div>
                 <div className="flex space-x-4">
                    <button onClick={() => setIsModalOpen(false)} className="px-8 py-3 text-slate-400 font-black uppercase text-xs tracking-widest">Discard</button>
                    <button onClick={handlePostPR} className="bg-slate-900 text-white px-12 py-4 rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all flex items-center space-x-3"><Save size={18}/> <span>Post Requisition</span></button>
                 </div>
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
                 <div className="grid grid-cols-3 gap-6">
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
                            {viewingRequisition.approvedBy && <p className="text-xs font-bold text-slate-600 uppercase">By: <span className="text-slate-900">{viewingRequisition.approvedBy}</span></p>}
                        </div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border shadow-sm">
                        <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Valuation</p>
                        <p className="text-2xl font-black text-slate-900">PKR {viewingRequisition.totalValue.toLocaleString()}</p>
                        {viewingRequisition.requiresCashPayment && (
                          <div className="mt-2 flex items-center gap-1">
                            <Banknote size={12} className="text-purple-500" />
                            <p className="text-[10px] font-bold text-purple-600">PV: {viewingRequisition.paymentStatus}{viewingRequisition.paymentRef ? ` • ${viewingRequisition.paymentRef}` : ''}</p>
                          </div>
                        )}
                    </div>
                    <div className="bg-white p-4 rounded-2xl border shadow-sm">
                        <p className="text-[10px] font-black uppercase text-slate-400 mb-2 flex items-center gap-1"><BookOpen size={10} /> GL Impact</p>
                        <GLPreviewPanel company={viewingRequisition.company || company} subCategory={viewingRequisition.subCategory || ''} amount={viewingRequisition.totalValue} paymentMode={(viewingRequisition as any).paymentMode} />
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

      {/* ── Direct PO Modal — Glass smart search ──────────────────────── */}
      {isDirectPOOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[400]">
          <div className="bg-white rounded-[2rem] w-full max-w-5xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-200">

            {/* Header */}
            <div className="px-8 py-5 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-600 rounded-xl"><Package size={18}/></div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight">Glass Purchase Order</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Direct PO · Glass items only</p>
                </div>
              </div>
              <button onClick={() => setIsDirectPOOpen(false)} className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center"><XCircle size={20}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-7 bg-slate-50 space-y-5">

              {/* PO Header fields */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center gap-2 pb-4 border-b mb-4">
                  <Building2 size={15} className="text-blue-600"/>
                  <span className="text-xs font-black uppercase tracking-widest">PO Details</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400">Glass Vendor *</label>
                    <select className="sap-input w-full font-bold" value={selectedVendorForPO} onChange={e => setSelectedVendorForPO(e.target.value)}>
                      <option value="">— Select Glass Vendor —</option>
                      {glassVendors.map((v:any) => <option key={v.id} value={v.name}>{v.name}</option>)}
                      {glassVendors.length === 0 && <option disabled value=''>No Glass vendors — add in Vendor Hub (type = Glass)</option>}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400">PO Date</label>
                    <input type="date" className="sap-input w-full" value={poDate} onChange={e => setPoDate(e.target.value)}/>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400">Expected Delivery</label>
                    <input type="date" className="sap-input w-full" value={poDelivDate} onChange={e => setPoDelivDate(e.target.value)}/>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400">Payment Terms</label>
                    <select className="sap-input w-full font-bold" value={poPayTerms} onChange={e => setPoPayTerms(e.target.value)}>
                      {['Cash','7 Days Net','15 Days Net','30 Days Net','45 Days Net','60 Days Net','Against Delivery'].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400">Project (Optional)</label>
                    <select className="sap-input w-full font-bold" value={selectedProjectForPO} onChange={e => setSelectedProjectForPO(e.target.value)}>
                      <option value="">— General Stock —</option>
                      {projects.map((p:any) => <option key={p.id} value={p.id}>{p.title}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400">Remarks</label>
                    <input type="text" className="sap-input w-full uppercase" placeholder="Special instructions…" value={poRemarks} onChange={e => setPoRemarks(e.target.value)}/>
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center justify-between pb-3 border-b mb-3">
                  <div>
                    <span className="text-xs font-black uppercase tracking-widest">Line Items</span>
                    <span className="text-[9px] text-slate-400 font-bold ml-3">Type anything — "5mm", "plain 84", "mirror 6mm"</span>
                  </div>
                  <button onClick={() => setDirectPoItems((prev:any) => [...prev, blankPoLine()])}
                    className="flex items-center gap-1 bg-emerald-600 text-white px-3 py-1.5 rounded-xl font-black text-xs hover:bg-emerald-700">
                    <Plus size={12}/> Add Line
                  </button>
                </div>

                {/* Column labels */}
                <div className="grid text-[9px] font-black uppercase text-slate-400 mb-1.5 px-1 gap-2"
                  style={{gridTemplateColumns:'1fr 80px 68px 86px 82px 86px 28px'}}>
                  <span>Glass Specification</span>
                  <span className="text-right">Sheets</span>
                  <span className="text-right">SqFt</span>
                  <span className="text-right">Rate/sqft</span>
                  <span className="text-right">Freight</span>
                  <span className="text-right">Total</span>
                  <span></span>
                </div>

                <div className="space-y-2">
                  {directPoItems.map((line:any, idx:number) => {
                    const suggs = getPoSuggestions(line.searchQuery||'');
                    const isFilled = line.qty > 0;
                    return (
                      <div key={line.id||idx}
                        ref={(el:any) => { suggRefs.current[line.id||idx] = el; }}
                        className={`rounded-xl border transition-colors ${isFilled ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-100 bg-slate-50/40'}`}>
                        <div className="p-2.5 grid gap-2 items-start" style={{gridTemplateColumns:'1fr 80px 68px 86px 82px 86px 28px'}}>

                          {/* Search */}
                          <div className="relative">
                            <div className="flex items-center gap-1.5 mb-1 min-h-[16px]">
                              <span className="text-[9px] font-black text-slate-400">#{idx+1}</span>
                              {line.thickness && <span className="text-[9px] font-black text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">{line.category} · {line.thickness} · {line.sheetSize}"</span>}
                              {line.stockOnHand > 0 && <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{Number(line.stockOnHand).toFixed(0)} sqft stock</span>}
                            </div>
                            <input type="text" className="sap-input w-full text-xs font-bold"
                              placeholder="e.g. plain 5mm, mirror 84x144, 6mm clear…"
                              value={line.searchQuery||''} autoComplete="off"
                              onChange={(e:any) => updatePoLine(line.id, {searchQuery: e.target.value, showSuggestions: true})}
                              onFocus={() => updatePoLine(line.id, {showSuggestions: true})}/>
                            {line.showSuggestions && (
                              <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
                                {suggs.length === 0
                                  ? <div className="px-3 py-2.5 text-[10px] text-slate-400 italic">No matches in Product Master or GRN history</div>
                                  : suggs.map((s:any) => (
                                    <button key={s.key} className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-slate-50 last:border-0 flex items-center justify-between"
                                      onMouseDown={(e:any) => { e.preventDefault(); pickPoSuggestion(line.id, s); }}>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-slate-800 uppercase">{s.label}</span>
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${s.source==='master' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>{s.source==='master' ? 'Master' : 'History'}</span>
                                      </div>
                                      <div className="text-right text-[9px] ml-3">
                                        {s.lastMAP > 0 && <div className="font-black text-emerald-700">MAP {s.lastMAP.toFixed(0)}</div>}
                                        {s.stockOnHand > 0 && <div className="text-slate-400">{s.stockOnHand.toFixed(0)} sqft</div>}
                                      </div>
                                    </button>
                                  ))
                                }
                              </div>
                            )}
                          </div>

                          {/* Sheets */}
                          <input type="number" min="0" className="sap-input text-xs font-black text-right mt-[16px]" placeholder="0"
                            value={line.qty||''} onChange={(e:any) => updatePoLine(line.id, {qty: Number(e.target.value)})}/>

                          {/* SqFt computed */}
                          <div className={`sap-input text-xs font-black text-right mt-[16px] cursor-not-allowed ${line.totalSqft > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-300'}`}>
                            {line.totalSqft > 0 ? line.totalSqft.toFixed(1) : '—'}
                          </div>

                          {/* Rate */}
                          <div className="mt-[16px]">
                            {line.lastMAP > 0 && <div className="text-[8px] font-bold text-emerald-600 text-right mb-0.5">MAP {line.lastMAP.toFixed(0)}</div>}
                            <input type="number" min="0" className={`sap-input text-xs font-black text-right w-full ${!line.lastMAP ? 'mt-[12px]' : ''}`}
                              placeholder="0.00" value={line.rate||''}
                              onChange={(e:any) => updatePoLine(line.id, {rate: Number(e.target.value)})}/>
                          </div>

                          {/* Freight */}
                          <input type="number" min="0" className="sap-input text-xs font-bold text-right text-blue-600 mt-[16px]" placeholder="0"
                            value={line.freightPKR||''} onChange={(e:any) => updatePoLine(line.id, {freightPKR: Number(e.target.value)})}/>

                          {/* Total */}
                          <div className={`text-sm font-black text-right pr-1 mt-[16px] ${line.amount > 0 ? 'text-emerald-700' : 'text-slate-200'}`}>
                            {line.amount > 0 ? Math.round(line.amount).toLocaleString() : '—'}
                          </div>

                          {/* Remove */}
                          <button onClick={() => directPoItems.length > 1 && setDirectPoItems((prev:any) => prev.filter((_:any,i:number) => i !== idx))}
                            className={`w-6 h-6 rounded-lg flex items-center justify-center mt-[16px] ${directPoItems.length > 1 ? 'text-red-300 hover:text-red-600 hover:bg-red-50' : 'text-slate-100 cursor-not-allowed'}`}>
                            <Trash2 size={11}/>
                          </button>
                        </div>
                        {isFilled && (
                          <div className="px-2.5 pb-2.5 flex items-center gap-2">
                            <span className="text-[9px] font-black uppercase text-slate-400 shrink-0">Note:</span>
                            <input type="text" className="sap-input text-[11px] flex-1 py-1" placeholder="Batch, colour, special note…"
                              value={line.remarks||''} onChange={(e:any) => updatePoLine(line.id, {remarks: e.target.value})}/>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Summary */}
                <div className="mt-4 pt-4 border-t flex justify-between items-center">
                  <div className="flex gap-4 text-xs">
                    <span className="font-bold text-slate-500">Lines: <span className="font-black text-slate-800">{directPoItems.filter((l:any)=>l.qty>0).length}/{directPoItems.length}</span></span>
                    <span className="font-bold text-slate-500">Sheets: <span className="font-black text-slate-800">{directPoItems.filter((l:any)=>l.qty>0).reduce((s:number,l:any)=>s+l.qty,0)}</span></span>
                    <span className="font-bold text-slate-500">SqFt: <span className="font-black text-slate-800">{directPoItems.reduce((s:number,l:any)=>s+(l.totalSqft||0),0).toFixed(1)}</span></span>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] font-black uppercase text-slate-400">Grand Total</div>
                    <div className="text-xl font-black text-emerald-700">PKR {Math.round(directPoItems.reduce((s:number,l:any)=>s+(l.amount||0),0)).toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-7 py-5 bg-white border-t flex justify-between items-center shrink-0">
              <button onClick={() => setIsDirectPOOpen(false)} className="px-6 py-2.5 text-slate-400 font-black uppercase text-xs tracking-widest hover:text-slate-700">Cancel</button>
              <button onClick={handleCreateDirectPO}
                className="bg-blue-600 text-white px-10 py-3 rounded-2xl font-black uppercase text-xs shadow-xl flex items-center gap-2 hover:bg-blue-700">
                <Send size={15}/> Issue PO + Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PO Print overlay ──────────────────────────────────────────────── */}
      {poPrintData && (
        <div className="fixed inset-0 bg-slate-900/80 flex items-start justify-center z-[500] overflow-y-auto py-6 px-4">
          <div className="bg-white w-[794px] shadow-2xl rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3 bg-slate-900 text-white">
              <span className="text-sm font-black uppercase">PO Print Preview — {poPrintData.id}</span>
              <div className="flex gap-3">
                <button onClick={() => window.print()} className="flex items-center gap-2 bg-blue-600 px-4 py-1.5 rounded-lg text-xs font-black uppercase hover:bg-blue-700"><Printer size={14}/> Print</button>
                <button onClick={() => setPoPrintData(null)} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20"><X size={16}/></button>
              </div>
            </div>
            <div className="p-10 text-black" style={{fontFamily:'Arial,sans-serif',minHeight:'257mm'}}>
              <div className="flex justify-between items-start pb-5 mb-6" style={{borderBottom:'3px solid #0f172a'}}>
                <div>
                  <div style={{fontSize:22,fontWeight:900,textTransform:'uppercase',color:'#0f172a'}}>GlassTech Group</div>
                  <div style={{fontSize:12,fontWeight:700,color:'#64748b',marginTop:2}}>GlassCo Pvt. Ltd. — Karachi, Pakistan</div>
                  <div style={{marginTop:10,display:'inline-block',background:'#1d4ed8',color:'#fff',fontSize:11,fontWeight:900,textTransform:'uppercase',padding:'3px 12px',borderRadius:4}}>Purchase Order</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:20,fontWeight:900,fontFamily:'monospace',color:'#0f172a'}}>{poPrintData.id}</div>
                  <div style={{fontSize:11,color:'#64748b',marginTop:3,fontWeight:700}}>Date: {poPrintData.date}</div>
                  {poPrintData.deliveryDate && <div style={{fontSize:11,color:'#dc2626',fontWeight:700,marginTop:2}}>Delivery By: {poPrintData.deliveryDate}</div>}
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20}}>
                <div style={{border:'1px solid #e2e8f0',borderRadius:6,padding:12}}>
                  <div style={{fontSize:9,fontWeight:900,textTransform:'uppercase',color:'#94a3b8',marginBottom:6}}>Vendor / Supplier</div>
                  <div style={{fontSize:14,fontWeight:900,textTransform:'uppercase'}}>{poPrintData.toVendor}</div>
                </div>
                <div style={{border:'1px solid #e2e8f0',borderRadius:6,padding:12}}>
                  <div style={{fontSize:9,fontWeight:900,textTransform:'uppercase',color:'#94a3b8',marginBottom:6}}>Order Details</div>
                  <div style={{fontSize:11,fontWeight:700}}>Payment: {poPrintData.payTerms||'—'}</div>
                  <div style={{fontSize:11,fontWeight:700,marginTop:3}}>Total Sheets: {poPrintData.totalSheets||'—'}</div>
                  {poPrintData.headerRemarks && <div style={{fontSize:10,color:'#64748b',marginTop:4,fontStyle:'italic'}}>{poPrintData.headerRemarks}</div>}
                </div>
              </div>
              <table style={{width:'100%',borderCollapse:'collapse',marginBottom:20,fontSize:11}}>
                <thead>
                  <tr style={{background:'#0f172a',color:'#fff'}}>
                    {['#','Description','Thick','Size','Sheets','SqFt','Rate/SqFt','Freight','Total'].map((h,i) => (
                      <th key={h} style={{padding:'7px 8px',fontWeight:900,textTransform:'uppercase',fontSize:9,textAlign:['Sheets','SqFt','Rate/SqFt','Freight','Total'].includes(h)?'right':'left',width:i===0?24:undefined}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {poPrintData.items.map((item:any,i:number) => {
                    let m:any={};try{m=JSON.parse(item.specs||'{}')}catch{}
                    return (
                      <tr key={i} style={{background:i%2===0?'#fff':'#f8fafc',borderBottom:'0.5px solid #e2e8f0'}}>
                        <td style={{padding:'7px 8px',color:'#94a3b8',fontWeight:700}}>{i+1}</td>
                        <td style={{padding:'7px 8px',fontWeight:900,textTransform:'uppercase'}}>{item.description}{m.remarks&&<div style={{fontSize:9,color:'#64748b',fontStyle:'italic',marginTop:1}}>{m.remarks}</div>}</td>
                        <td style={{padding:'7px 8px',fontWeight:700,textAlign:'center'}}>{m.thickness||'—'}</td>
                        <td style={{padding:'7px 8px',fontWeight:700,textAlign:'center'}}>{m.sheetSize?m.sheetSize+'"':'—'}</td>
                        <td style={{padding:'7px 8px',fontWeight:900,textAlign:'right'}}>{m.sheetCount||'—'}</td>
                        <td style={{padding:'7px 8px',textAlign:'right'}}>{Number(item.qty||0).toFixed(1)}</td>
                        <td style={{padding:'7px 8px',textAlign:'right',fontWeight:700}}>PKR {(item.rate||0).toLocaleString()}</td>
                        <td style={{padding:'7px 8px',textAlign:'right',color:'#1d4ed8'}}>PKR {(m.freightPKR||0).toLocaleString()}</td>
                        <td style={{padding:'7px 8px',textAlign:'right',fontWeight:900,color:'#059669'}}>PKR {Math.round(m.lineTotal||0).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{borderTop:'2px solid #0f172a',background:'#f8fafc'}}>
                    <td colSpan={10} style={{padding:'9px 8px',textAlign:'right',fontWeight:900,textTransform:'uppercase',fontSize:11,color:'#475569'}}>Grand Total</td>
                    <td style={{padding:'9px 8px',textAlign:'right',fontWeight:900,fontSize:14,color:'#059669'}}>PKR {Math.round(poPrintData.totalAmount).toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:40,marginTop:50}}>
                {['Prepared By','Approved By','Vendor Acknowledgement'].map(label=>(
                  <div key={label} style={{borderTop:'2px solid #0f172a',paddingTop:8}}>
                    <div style={{fontSize:9,fontWeight:900,textTransform:'uppercase',color:'#64748b'}}>{label}</div>
                    <div style={{marginTop:30,fontSize:9,color:'#cbd5e1'}}>Signature / Stamp</div>
                  </div>
                ))}
              </div>
              <div style={{marginTop:30,paddingTop:10,borderTop:'0.5px solid #e2e8f0',display:'flex',justifyContent:'space-between',fontSize:9,color:'#94a3b8',fontWeight:700}}>
                <span>GlassTech Group — GlassCo Pvt. Ltd. | Karachi, Pakistan</span>
                <span>Printed: {new Date().toLocaleDateString('en-PK',{day:'2-digit',month:'short',year:'numeric'})}</span>
              </div>
            </div>
          </div>
          <style>{`@media print { .no-print{display:none!important;} @page{size:A4 portrait;margin:12mm;} }`}</style>
        </div>
      )}
    </div>
  );
};

export default React.memo(Requisitions);
