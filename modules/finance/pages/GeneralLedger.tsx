/**
 * GeneralLedger.tsx — Design System v2
 *
 * UI Changes (business logic untouched):
 *  - CompactPageHeader at top with "New Entry" action (Alt+N)
 *  - Tab switcher converted from pill-buttons → compact border-b-2 tabs
 *  - Search bar moved into DataGridCard toolbar slot
 *  - min-h-[600px] → flex-1 min-h-0 (proper flex scroll — no browser scroll)
 *  - Main ledger table: DataGridCard with `children` (preserves compound row structure)
 *  - System section cards: p-3 rounded-lg (was p-6 rounded-3xl)
 *  - System sub-tables converted to DataGridCard
 *  - Alt+N → open New Entry modal
 *  - Alt+R → refreshData()
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDebounce } from '@/modules/shared/hooks/useDebounce';
import { useSupabasePage } from '@/modules/shared/hooks/useSupabasePage';
import { Company, LedgerTransaction, Account, LedgerDocType, LedgerStatus, CostCenter } from '../../shared/types';
import { FinanceService } from '../services/financeService';
import {
  Search, Plus, X, Trash2, Clock, ShieldCheck, Save, ChevronDown,
  AlertCircle, Calculator, Play, FileText, History, RotateCcw,
  CheckCircle2, Target, Filter, ArrowRight, FileClock, PenTool, BookOpen, Loader2, Building, Zap
} from 'lucide-react';
import Pagination from '../../../components/Pagination';
import { useRealtimeRefresh } from '@/modules/shared/hooks/useRealtimeRefresh';
import { CompactPageHeader } from '@/modules/shared/components/CompactPageHeader';
import { DataGridCard, GridColumn } from '@/modules/shared/components/DataGridCard';

// ── Status chip ─────────────────────────────────────────────────────
const StatusChip: React.FC<{ status: string }> = ({ status }) => (
  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
    status === 'Posted' ? 'bg-emerald-100 text-emerald-700' :
    status === 'Parked' ? 'bg-amber-100 text-amber-700'   :
                          'bg-indigo-100 text-indigo-700'
  }`}>
    {status}
  </span>
);

// ── Tab definition ──────────────────────────────────────────────────
type GLTab = 'Posted' | 'Parked' | 'System';
const GL_TABS: { id: GLTab; label: string; activeCls: string }[] = [
  { id: 'Posted', label: 'Posted',           activeCls: 'border-slate-900 text-slate-900 bg-white' },
  { id: 'Parked', label: 'Parked',           activeCls: 'border-amber-500 text-amber-700 bg-white' },
  { id: 'System', label: 'System Generated', activeCls: 'border-indigo-600 text-indigo-700 bg-white' },
];

// ── System accounts table columns ───────────────────────────────────
const ACCT_COLS: GridColumn<Account>[] = [
  {
    key: 'code', header: 'Account Code', width: '140px',
    render: (_, a) => <span className="font-black text-slate-900 tabular-nums">{a.code}</span>,
  },
  {
    key: 'name', header: 'Account Name',
    render: (_, a) => <span className="font-bold text-blue-700 uppercase text-[11px]">{a.name}</span>,
  },
  {
    key: 'id', header: 'Status', width: '80px',
    render: () => <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-black uppercase">Active</span>,
  },
];

// ── Automated posting columns ─────────────────────────────────────
type AutoPostRow = { id: string; date: string; description: string; _total: number };
const AUTO_COLS: GridColumn<AutoPostRow>[] = [
  { key: 'date',        header: 'Date',        width: '96px', render: (_, r) => <span className="text-slate-500 tabular-nums">{r.date}</span> },
  { key: 'description', header: 'Description', render: (_, r) => <span className="font-bold text-slate-900 uppercase text-[11px]">{r.description}</span> },
  { key: '_total',      header: 'Value',       align: 'right', width: '120px',
    render: (_, r) => <span className="font-black text-blue-700 tabular-nums">{(Number(r._total) || 0).toLocaleString()}</span> },
];

const GeneralLedger: React.FC<{ company: Company }> = ({ company }) => {
  const [activeTab, setActiveTab] = useState<GLTab>('Posted');
  const [accounts, setAccounts]           = useState<Account[]>([]);
  const [costCenters, setCostCenters]     = useState<CostCenter[]>([]);
  const [isModalOpen, setIsModalOpen]     = useState(false);

  const [selectedTargetCompany, setSelectedTargetCompany] = useState<Company>(company);
  const [modalAccounts, setModalAccounts]       = useState<Account[]>([]);
  const [modalCostCenters, setModalCostCenters] = useState<CostCenter[]>([]);

  const itemsPerPage = 15;

  const {
    data: transactions,
    total: totalTransactions,
    loading: isLoading,
    page: currentPage,
    setPage: setCurrentPage,
    search: searchTerm,
    setSearch: setSearchTerm,
    refresh: refreshLedger,
  } = useSupabasePage<LedgerTransaction>({
    table: 'ledger',
    company,
    pageSize: itemsPerPage,
    filters: activeTab === 'System' ? {} : { status: activeTab },
    orderBy: 'date',
    orderDesc: true,
    searchColumn: 'description',
  });

  const [editingDocId, setEditingDocId] = useState<string | null>(null);

  const initialFormState = {
    docType:     'SA' as LedgerDocType,
    docDate:     new Date().toISOString().split('T')[0],
    postDate:    new Date().toISOString().split('T')[0],
    description: '',
    referenceId: '',
    details: [
      { accountId: '', debit: 0, credit: 0, text: '', costCenterId: '' },
      { accountId: '', debit: 0, credit: 0, text: '', costCenterId: '' },
    ],
  };

  const [formData, setFormData] = useState(initialFormState);

  const { refreshKey } = useRealtimeRefresh(['ledger', 'accounts', 'cost_centers']);

  useEffect(() => { refreshData(); }, [company, refreshKey]);

  // ── Wire Alt+R and Alt+N ─────────────────────────────────────────
  useEffect(() => {
    const handleRefresh = () => refreshData();
    const handleNew     = () => { resetForm(); setIsModalOpen(true); };
    window.addEventListener('erp:refresh', handleRefresh);
    window.addEventListener('erp:new',     handleNew);
    return () => {
      window.removeEventListener('erp:refresh', handleRefresh);
      window.removeEventListener('erp:new',     handleNew);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company]);

  // ── Esc to close modal ───────────────────────────────────────────
  useEffect(() => {
    const handler = () => { if (isModalOpen) setIsModalOpen(false); };
    window.addEventListener('erp:escape', handler);
    return () => window.removeEventListener('erp:escape', handler);
  }, [isModalOpen]);

  useEffect(() => {
    if (isModalOpen) {
      const allAccounts    = FinanceService.getAccounts();
      const allCostCenters = FinanceService.getCostCenters();
      setModalAccounts(allAccounts.filter(a => a.company === selectedTargetCompany));
      setModalCostCenters(allCostCenters.filter(c => c.company === selectedTargetCompany));
    }
  }, [selectedTargetCompany, isModalOpen]);

  const refreshData = () => {
    setAccounts(FinanceService.getAccounts().filter(a => a.company === company));
    setCostCenters(FinanceService.getCostCenters().filter(cc => cc.company === company));
    refreshLedger();
  };

  const getAccountName = (id: string) => accounts.find(a => a.id === id)?.name || 'Unknown';
  const getAccountCode = (id: string) => accounts.find(a => a.id === id)?.code || '0000';
  const getCCCode      = (id: string) => costCenters.find(cc => cc.id === id)?.code || '-';

  const postingAccounts = modalAccounts.filter(a => a.level === 4 || a.level === 5);

  const paginatedTransactions = transactions;

  useEffect(() => setCurrentPage(1), [activeTab]);

  const totalDebit  = (formData.details || []).reduce((sum, d) => sum + (Number(d.debit)  || 0), 0);
  const totalCredit = (formData.details || []).reduce((sum, d) => sum + (Number(d.credit) || 0), 0);
  const isBalanced  = totalDebit === totalCredit && totalDebit > 0;

  const handleSaveDocument = async (status: LedgerStatus) => {
    if (!isBalanced) return alert('System Error: Document is not balanced.');
    const txId = editingDocId || `${formData.docType}-${Date.now().toString().slice(-6)}`;

    if (editingDocId && status === 'Posted') {
      const existingTx = transactions.find(t => t.id === editingDocId);
      if (existingTx && existingTx.status === 'Parked') {
        const allTxs = FinanceService.getLedger();
        const editedPV: LedgerTransaction = {
          id: editingDocId,
          company: selectedTargetCompany,
          docType: formData.docType, docDate: formData.docDate,
          date: formData.postDate, description: formData.description.toUpperCase(),
          referenceId: formData.referenceId, status: 'Parked' as const,
          reqId: existingTx.reqId,
          details: formData.details.map(d => ({ ...d, debit: Number(d.debit), credit: Number(d.credit) })),
        };
        const updatedTxs = allTxs.map(t => t.id === editingDocId ? editedPV : t);
        FinanceService.saveLedger(updatedTxs);
        const posted = FinanceService.postParkedPV(editingDocId);
        refreshData();
        setIsModalOpen(false);
        resetForm();
        alert(`Success: PV ${editingDocId} Posted to ${selectedTargetCompany} Ledger.${posted?.reqId ? ` Requisition ${posted.reqId} marked as Paid.` : ''}`);
        return;
      }
    }

    const tx: LedgerTransaction = {
      id: txId,
      company: selectedTargetCompany,
      docType: formData.docType, docDate: formData.docDate,
      date: formData.postDate, description: formData.description.toUpperCase(),
      referenceId: formData.referenceId, status: status,
      details: formData.details.map(d => ({ ...d, debit: Number(d.debit), credit: Number(d.credit) })),
    };

    const allTxs    = FinanceService.getLedger();
    let updatedTxs  = [...allTxs];
    if (editingDocId) updatedTxs = updatedTxs.map(t => t.id === editingDocId ? tx : t);
    else updatedTxs.push(tx);

    FinanceService.saveLedger(updatedTxs);
    refreshData();
    setIsModalOpen(false);
    resetForm();
    alert(status === 'Posted'
      ? `Success: Document ${txId} Posted to ${selectedTargetCompany} Ledger.`
      : `Document ${txId} Parked successfully.`
    );
  };

  const resetForm = () => {
    setFormData(initialFormState);
    setEditingDocId(null);
    setSelectedTargetCompany(company);
  };

  const handleEditParked = (tx: LedgerTransaction) => {
    setEditingDocId(tx.id);
    setSelectedTargetCompany(tx.company);
    setFormData({
      docType: tx.docType, docDate: tx.docDate, postDate: tx.date,
      description: tx.description, referenceId: tx.referenceId,
      details: tx.details.map(d => ({ ...d, debit: d.debit, credit: d.credit, text: d.text || '', costCenterId: d.costCenterId || '' })),
    });
    setIsModalOpen(true);
  };

  const handleDeleteParked = async (id: string) => {
    if (confirm('Delete this parked document?')) {
      const allTxs = FinanceService.getLedger();
      FinanceService.saveLedger(allTxs.filter(t => t.id !== id));
      refreshData();
    }
  };

  // ── System section derived data ──────────────────────────────────
  const systemAccounts = FinanceService.getAccounts()
    .filter(a => a.company === company && a.level === 5)
    .reverse()
    .slice(0, 10);

  const autoPostings: AutoPostRow[] = transactions
    .filter(t => (t.description||'').includes('Automated') || (t.description||'').includes('Approved') || (t.description||'').includes('PAYROLL'))
    .slice(0, 10)
    .map(tx => ({
      id:          tx.id,
      date:        tx.date,
      description: tx.description,
      _total:      (tx.details || []).reduce((sum, d) => sum + d.debit, 0),
    }));

  if (isLoading) return (
    <div className="h-full flex items-center justify-center text-slate-400">
      <Loader2 className="animate-spin mr-2" /> Accessing Ledger DB…
    </div>
  );

  const parkedCount = transactions.filter(t => t.status === 'Parked').length;

  return (
    <div className="flex flex-col h-full gap-0 animate-in fade-in duration-300">

      {/* ── Compact Page Header ─────────────────────────────────────── */}
      <CompactPageHeader
        breadcrumbs={[{ label: 'Finance (FICO)' }, { label: 'General Ledger' }]}
        title="General Ledger"
        subtitle={`${company} Unit`}
        meta={
          parkedCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200">
              <FileClock size={10} />
              {parkedCount} parked
            </span>
          ) : undefined
        }
        actions={[
          {
            label:    'New Entry',
            icon:     <Plus size={12} />,
            onClick:  () => { resetForm(); setIsModalOpen(true); },
            variant:  'primary',
            shortcut: 'Alt+N',
          },
        ]}
      />

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">

        {/* ── Tab switcher ─────────────────────────────────────────── */}
        <div className="flex border-b border-slate-200 bg-white rounded-t-lg shrink-0 overflow-hidden">
          {GL_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex items-center gap-2 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider',
                'border-b-2 transition-colors whitespace-nowrap shrink-0',
                activeTab === tab.id
                  ? tab.activeCls
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50',
              ].join(' ')}
            >
              {tab.id === 'Posted' && <BookOpen size={13} />}
              {tab.id === 'Parked' && <FileClock size={13} />}
              {tab.id === 'System' && <Zap size={13} />}
              {tab.label}
              {tab.id === 'Parked' && parkedCount > 0 && (
                <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-1.5 py-0.5 rounded-full tabular-nums">
                  {parkedCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Main Ledger Table (Posted / Parked) ──────────────────── */}
        {activeTab !== 'System' && (
          <DataGridCard
            columns={[
              { key: 'date',        header: 'Posting Date', width: '96px' },
              { key: 'id',          header: 'Doc. Number',  width: '140px' },
              { key: 'description', header: 'Narration / Details' },
              { key: '_debit',      header: 'Debit (PKR)',  align: 'right', width: '110px' },
              { key: '_credit',     header: 'Credit (PKR)', align: 'right', width: '110px' },
              { key: 'status',      header: 'Status',       align: 'center', width: '80px' },
              { key: '_action',     header: 'Action',       align: 'center', width: '90px' },
            ]}
            className="flex-1 rounded-t-none border-t-0"
            toolbar={
              <div className="relative w-72">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter documents…"
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded outline-none focus:ring-1 focus:ring-blue-400 font-medium"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            }
            emptyState={
              <span className="text-xs text-slate-400 italic">No {activeTab} documents found.</span>
            }
            footer={
              totalTransactions > itemsPerPage ? (
                <td colSpan={7} className="p-0">
                  <Pagination
                    totalItems={totalTransactions}
                    itemsPerPage={itemsPerPage}
                    currentPage={currentPage}
                    onPageChange={setCurrentPage}
                  />
                </td>
              ) : undefined
            }
          >
            {/* ── Custom compound rows (master + detail lines) ────── */}
            {paginatedTransactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-xs text-slate-400 italic">
                  No {activeTab} documents found.
                </td>
              </tr>
            ) : paginatedTransactions.map(tx => (
              <React.Fragment key={tx.id}>
                {/* Master row */}
                <tr className={`border-b border-slate-100 ${activeTab === 'Parked' ? 'bg-amber-50/40' : 'bg-slate-50/30'}`}>
                  <td className="py-1.5 px-3 font-semibold text-slate-400 text-[11px] tabular-nums">{tx.date}</td>
                  <td className="py-1.5 px-3 font-black text-blue-600 text-[11px] tabular-nums">{tx.id}</td>
                  <td className="py-1.5 px-3 font-semibold text-slate-800 uppercase text-[11px]">
                    {tx.description}
                    {activeTab === 'Parked' && (tx.reqId || tx.referenceId?.startsWith('REQ')) && (
                      <span className="ml-2 text-[9px] font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                        REQ: {tx.reqId || tx.referenceId}
                      </span>
                    )}
                  </td>
                  <td colSpan={2} />
                  <td className="py-1.5 px-3 text-center"><StatusChip status={tx.status} /></td>
                  <td className="py-1.5 px-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => handleEditParked(tx)}
                        className="bg-blue-600 text-white p-1.5 rounded hover:bg-blue-700 transition-colors"
                        title="Edit"
                      >
                        <PenTool size={11} />
                      </button>
                      <button
                        onClick={() => handleDeleteParked(tx.id)}
                        className="bg-white border border-slate-200 text-slate-400 p-1.5 rounded hover:text-rose-600 hover:border-rose-200 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Detail line rows */}
                {tx.details.map((d, i) => (
                  <tr key={`${tx.id}-${i}`} className="border-b border-slate-50 last:border-slate-200">
                    <td />
                    <td />
                    <td className="py-1 px-3 pl-8">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[10px] font-mono font-bold text-slate-400">{getAccountCode(d.accountId)}</span>
                        <span className="text-[11px] font-medium text-slate-600">{getAccountName(d.accountId)}</span>
                        {d.costCenterId && (
                          <span className="bg-indigo-50 text-indigo-700 text-[8px] font-black px-1 rounded border border-indigo-100">
                            CC: {getCCCode(d.costCenterId)}
                          </span>
                        )}
                        {d.text && (
                          <span className="text-[9px] text-slate-400 italic border-l border-slate-200 pl-2">{d.text}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-1 px-3 text-right font-black text-slate-900 text-[11px] tabular-nums">
                      {d.debit  > 0 ? d.debit.toLocaleString()  : ''}
                    </td>
                    <td className="py-1 px-3 text-right font-black text-blue-600 text-[11px] tabular-nums">
                      {d.credit > 0 ? d.credit.toLocaleString() : ''}
                    </td>
                    <td />
                    {activeTab === 'Parked' && <td />}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </DataGridCard>
        )}

        {/* ── System Generated Section ─────────────────────────────── */}
        {activeTab === 'System' && (
          <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto">
            {/* KPI strip */}
            <div className="grid grid-cols-3 gap-2 shrink-0">
              {[
                { icon: <BookOpen size={16} className="text-indigo-600" />, bg: 'bg-indigo-50', label: 'System Accounts (L5)', value: FinanceService.getAccounts().filter(a => a.company === company && a.level === 5).length },
                { icon: <Zap      size={16} className="text-emerald-600" />, bg: 'bg-emerald-50', label: 'Automated Postings', value: transactions.filter(t => (t.description||'').includes('Automated') || (t.description||'').includes('Approved')).length },
                { icon: <ShieldCheck size={16} className="text-blue-600" />, bg: 'bg-blue-50', label: 'Audit Compliance', value: '100%' },
              ].map((card, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-lg p-3 flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${card.bg} shrink-0`}>{card.icon}</div>
                  <div>
                    <p className="text-[9px] font-black uppercase text-slate-400">{card.label}</p>
                    <p className="text-xl font-black text-slate-900 tabular-nums">{card.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Two sub-tables side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
              <div className="flex flex-col min-h-0">
                <div className="flex items-center justify-between px-3 py-2 border border-slate-200 border-b-0 rounded-t-lg bg-slate-50">
                  <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider">System-Generated Level 5 Accounts</span>
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[9px] font-black uppercase">Auto-Managed</span>
                </div>
                <DataGridCard
                  columns={ACCT_COLS}
                  rows={systemAccounts}
                  getRowKey={a => a.id}
                  className="rounded-t-none border-t-0 flex-1"
                />
              </div>

              <div className="flex flex-col min-h-0">
                <div className="flex items-center justify-between px-3 py-2 border border-slate-200 border-b-0 rounded-t-lg bg-slate-50">
                  <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Recent Automated Postings</span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-black uppercase">Real-Time</span>
                </div>
                <DataGridCard
                  columns={AUTO_COLS}
                  rows={autoPostings}
                  getRowKey={r => r.id}
                  className="rounded-t-none border-t-0 flex-1"
                  emptyState={<span className="text-xs text-slate-400 italic">No automated postings found.</span>}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          GL ENTRY MODAL — full-screen form (layout preserved,
          only the modal header is cleaned up)
      ══════════════════════════════════════════════════════════════ */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[400]">
          <div className="bg-white rounded w-full max-w-6xl h-[94vh] shadow-2xl flex flex-col overflow-hidden border border-slate-300 animate-in zoom-in duration-200">

            {/* Modal header — sap-object-header kept for print compat */}
            <div className="sap-object-header flex justify-between items-start shrink-0">
              <div>
                <div className="flex items-center space-x-3 text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-2">
                  <FileText size={14} />
                  <span>Transaction: FB50 / FV50</span>
                </div>
                <h3 className="text-2xl font-black uppercase tracking-tight">
                  {editingDocId ? 'Post Parked Document' : 'Manual G/L Voucher Entry'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="hover:bg-white/10 p-2 rounded transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Form body */}
            <div className="flex-1 overflow-hidden p-6 bg-[#f3f4f5] flex flex-col">
              <div className="bg-white p-6 rounded shadow-sm border border-slate-200 mb-6 shrink-0">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-blue-600 flex items-center gap-1">
                      <Building size={10} /> Company Code
                    </label>
                    <select
                      value={selectedTargetCompany}
                      onChange={e => {
                        if (company === 'Factory') {
                          setSelectedTargetCompany(e.target.value as Company);
                          setFormData(prev => ({ ...prev, details: prev.details.map(d => ({ ...d, accountId: '', costCenterId: '' })) }));
                        }
                      }}
                      disabled={company !== 'Factory'}
                      className={`sap-input w-full font-black uppercase ${company === 'Factory' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-100 text-slate-500 cursor-not-allowed'}`}
                    >
                      <option value="GTK">GTK</option>
                      <option value="GTI">GTI</option>
                      <option value="Glassco">GlassCo</option>
                      <option value="Nippon">Nippon</option>
                      <option value="Factory">Factory</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500">Doc Type</label>
                    <select value={formData.docType} onChange={e => setFormData({ ...formData, docType: e.target.value as any })} className="sap-input w-full font-bold">
                      <option value="SA">SA - G/L Posting</option>
                      <option value="KR">KR - Vendor Invoice</option>
                      <option value="DR">DR - Cust. Invoice</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500">Post Date</label>
                    <input type="date" value={formData.postDate} onChange={e => setFormData({ ...formData, postDate: e.target.value })} className="sap-input w-full font-bold" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500">Reference</label>
                    <input type="text" value={formData.referenceId} onChange={e => setFormData({ ...formData, referenceId: e.target.value })} className="sap-input w-full font-bold uppercase" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500">Header Text</label>
                    <input type="text" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="sap-input w-full font-bold uppercase" />
                  </div>
                </div>
              </div>

              <div className="flex-1 bg-white rounded border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="overflow-x-auto h-full">
                  <table className="w-full text-left sap-table min-w-[900px]">
                    <thead className="sticky top-0 z-10">
                      <tr>
                        <th className="w-12 text-center">Pos</th>
                        <th className="w-72">G/L Account ({selectedTargetCompany})</th>
                        <th className="w-48 text-center">Cost Center</th>
                        <th>Item Text</th>
                        <th className="w-40 text-right">Debit (PKR)</th>
                        <th className="w-40 text-right">Credit (PKR)</th>
                        <th className="w-12" />
                      </tr>
                    </thead>
                    <tbody>
                      {formData.details.map((row, idx) => (
                        <tr key={idx}>
                          <td className="text-center font-bold text-slate-300">{idx + 1}</td>
                          <td>
                            <select
                              value={row.accountId}
                              onChange={e => { const next = [...formData.details]; next[idx].accountId = e.target.value; setFormData({ ...formData, details: next }); }}
                              className="sap-input w-full py-1 text-xs"
                            >
                              <option value="">-- Choose G/L --</option>
                              {postingAccounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                            </select>
                          </td>
                          <td>
                            <select
                              value={row.costCenterId}
                              onChange={e => { const next = [...formData.details]; next[idx].costCenterId = e.target.value; setFormData({ ...formData, details: next }); }}
                              className="sap-input w-full py-1 text-xs uppercase"
                            >
                              <option value="">N/A</option>
                              {modalCostCenters.map(cc => <option key={cc.id} value={cc.id}>[{cc.code}] {cc.name}</option>)}
                            </select>
                          </td>
                          <td>
                            <input
                              type="text"
                              value={row.text}
                              onChange={e => { const next = [...formData.details]; next[idx].text = e.target.value; setFormData({ ...formData, details: next }); }}
                              className="sap-input w-full py-1 text-xs"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={row.debit || ''}
                              onChange={e => { const next = [...formData.details]; next[idx].debit = Number(e.target.value); next[idx].credit = 0; setFormData({ ...formData, details: next }); }}
                              className="sap-input w-full py-1 text-right font-bold text-slate-900"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={row.credit || ''}
                              onChange={e => { const next = [...formData.details]; next[idx].credit = Number(e.target.value); next[idx].debit = 0; setFormData({ ...formData, details: next }); }}
                              className="sap-input w-full py-1 text-right font-bold text-blue-600"
                            />
                          </td>
                          <td className="text-center">
                            <button
                              onClick={() => { if (formData.details.length > 2) setFormData({ ...formData, details: formData.details.filter((_, i) => i !== idx) }); }}
                              className="text-slate-300 hover:text-rose-600 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="p-4 bg-slate-50/50">
                    <button
                      onClick={() => setFormData({ ...formData, details: [...formData.details, { accountId: '', debit: 0, credit: 0, text: '', costCenterId: '' }] })}
                      className="sap-btn-ghost flex items-center space-x-2 text-[10px]"
                    >
                      <Plus size={14} /><span>Append Line</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-8 py-4 bg-white border-t flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                <div className={`px-4 py-1.5 rounded text-[10px] font-bold uppercase border ${isBalanced ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                  Balance: {(totalDebit - totalCredit).toLocaleString()}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setIsModalOpen(false)} className="sap-btn-ghost">Cancel</button>
                <button
                  onClick={() => handleSaveDocument('Parked')}
                  disabled={!isBalanced}
                  className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-2 rounded-xl text-xs font-bold uppercase transition-all shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileClock size={14} /> Park Document
                </button>
                <button
                  onClick={() => handleSaveDocument('Posted')}
                  disabled={!isBalanced}
                  className="sap-btn-primary flex items-center gap-2 disabled:opacity-30"
                >
                  <Save size={14} /> Post to Ledger
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(GeneralLedger);
