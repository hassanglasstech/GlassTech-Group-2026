/**
 * FinancialRegistry.tsx — Design System v2
 *
 * UI Changes (business logic untouched):
 *  - Replaced bg-slate-900 rounded-[2rem] oval header → CompactPageHeader
 *  - Replaced raw <table px-6 py-4> → DataGridCard (py-1.5 px-3 density)
 *  - Cleaned modal: removed rounded-[2.5rem], dark bg-slate-900 header → border-b header
 *  - Alt+R wired via erp:refresh CustomEvent → refreshData()
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Company, FinancialEvent, Account, LedgerTransaction, CostCenter } from '../../shared/types';
import { FinanceService } from '../services/financeService';
import {
  Inbox, Search, CheckCircle2, Ban,
  Settings, AlertCircle, Save, BookOpen, Clock, Zap, X
} from 'lucide-react';
import { useAppStore } from '../../shared/store/appStore';
import { toast } from 'sonner';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';
import { CompactPageHeader } from '@/modules/shared/components/CompactPageHeader';
import { DataGridCard, GridColumn } from '@/modules/shared/components/DataGridCard';

// ── Source module badge ───────────────────────────────────────────────
const SOURCE_CLS: Record<string, string> = {
  Inventory: 'bg-orange-50 text-orange-700 border-orange-200',
  PettyCash:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  Sales:      'bg-blue-50 text-blue-700 border-blue-200',
  HR:         'bg-purple-50 text-purple-700 border-purple-200',
};

const FinancialRegistry: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [events, setEvents]             = useState<FinancialEvent[]>([]);
  const [accounts, setAccounts]         = useState<Account[]>([]);
  const [costCenters, setCostCenters]   = useState<CostCenter[]>([]);
  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [searchTerm, setSearchTerm]     = useState('');

  const [selectedEvent, setSelectedEvent] = useState<FinancialEvent | null>(null);

  const [mappingForm, setMappingForm] = useState({
    debitAccountId:  '',
    creditAccountId: '',
    costCenterId:    '',
    saveRule:        false,
  });

  useEffect(() => { refreshData(); }, [company]);

  // ── Wire Alt+R global shortcut ────────────────────────────────────
  useEffect(() => {
    const handler = () => refreshData();
    window.addEventListener('erp:refresh', handler);
    return () => window.removeEventListener('erp:refresh', handler);
  }, [company]);

  const refreshData = () => {
    setEvents(
      FinanceService.getFinancialEvents()
        .filter(e => e.company === company && e.status === 'Pending')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    );
    setAccounts(FinanceService.getAccounts().filter(a => a.company === company && (a.level === 4 || a.level === 5)));
    setCostCenters(FinanceService.getCostCenters().filter(cc => cc.company === company));
  };

  const handleOpenMap = (event: FinancialEvent) => {
    setSelectedEvent(event);
    setMappingForm({
      debitAccountId:  event.suggestedGlId || '',
      creditAccountId: '',
      costCenterId:    '',
      saveRule:        false,
    });
    setIsModalOpen(true);
  };

  const handlePost = () => {
    if (!selectedEvent) return;
    if (!mappingForm.debitAccountId || !mappingForm.creditAccountId) {
      toast.error('Debit and Credit accounts are required.');
      return;
    }

    const txId = `REG-${Date.now().toString().slice(-6)}`;
    const tx: LedgerTransaction = {
      id: txId,
      company,
      docType: 'SA',
      docDate: selectedEvent.date,
      date: new Date().toISOString().split('T')[0],
      description: `REGISTRY: ${selectedEvent.description}`,
      referenceId: selectedEvent.referenceId || selectedEvent.id,
      status: 'Posted',
      details: [
        { accountId: mappingForm.debitAccountId,  debit: selectedEvent.amount, credit: 0, text: selectedEvent.description, costCenterId: mappingForm.costCenterId },
        { accountId: mappingForm.creditAccountId, debit: 0, credit: selectedEvent.amount, text: 'Contra Entry' },
      ],
    };

    FinanceService.recordTransaction(tx);

    const allEvents = FinanceService.getFinancialEvents();
    const updatedEvents = allEvents.map(e =>
      e.id === selectedEvent.id ? { ...e, status: 'Posted' as const } : e
    );
    FinanceService.saveFinancialEvents(updatedEvents);

    if (mappingForm.saveRule) {
      const rule = {
        id: `RULE-${Date.now()}`,
        company,
        keyword:          selectedEvent.description.split(' ')[0],
        targetGlId:       mappingForm.debitAccountId,
        targetCostCenterId: mappingForm.costCenterId,
      };
      FinanceService.saveMappingRules([...FinanceService.getMappingRules(), rule]);
    }

    refreshData();
    setIsModalOpen(false);
    toast.success('Event Posted Successfully.');
  };

  const handleIgnore = async (id: string) => {
    if (!await confirmModal('Remove this event from registry? It will not be posted.')) return;
    const allEvents = FinanceService.getFinancialEvents();
    const updatedEvents = allEvents.map(e =>
      e.id === id ? { ...e, status: 'Ignored' as const } : e
    );
    FinanceService.saveFinancialEvents(updatedEvents);
    refreshData();
  };

  const filteredEvents = events.filter(e =>
    e.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ── Column definitions (inside component — need handler closures) ──
  const REGISTRY_COLS: GridColumn<FinancialEvent>[] = useMemo(() => [
    {
      key: 'date', header: 'Date', width: '96px',
      render: (_, e) => (
        <span className="font-semibold text-slate-500 tabular-nums text-[11px]">{e.date}</span>
      ),
    },
    {
      key: 'sourceModule', header: 'Source', width: '100px',
      render: (_, e) => (
        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${SOURCE_CLS[e.sourceModule] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
          {e.sourceModule}
        </span>
      ),
    },
    {
      key: 'description', header: 'Description / Narrative',
      render: (_, e) => (
        <span className="font-semibold text-slate-800 uppercase text-[11px]">{e.description}</span>
      ),
    },
    {
      key: 'amount', header: 'Amount (PKR)', align: 'right', width: '130px',
      render: (_, e) => (
        <span className="font-black text-slate-900 tabular-nums">{(e.amount || 0).toLocaleString()}</span>
      ),
    },
    {
      key: 'id', header: 'Smart Action', width: '150px',
      render: (_, e) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleOpenMap(e)}
            className="inline-flex items-center gap-1 bg-blue-600 text-white px-2.5 py-1 rounded text-[10px] font-black uppercase hover:bg-blue-700 transition-colors"
          >
            {e.suggestedGlId && <Zap size={9} className="text-yellow-300 fill-current shrink-0" />}
            Map & Post
          </button>
          <button
            onClick={() => handleIgnore(e.id)}
            className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors rounded"
            title="Ignore event"
          >
            <Ban size={13} />
          </button>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [events]); // re-create when events change (closures over handlers)

  return (
    <div className="flex flex-col h-full gap-0 animate-in fade-in duration-300">

      {/* ── Compact Header ──────────────────────────────────────────── */}
      <CompactPageHeader
        breadcrumbs={[{ label: 'Finance' }, { label: 'Event Registry' }]}
        title="Event Registry"
        subtitle="Pending Operational Transactions"
        meta={
          events.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200">
              <Inbox size={10} />
              {events.length} pending
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 size={10} />
              All cleared
            </span>
          )
        }
        actions={[
          {
            label:    'Refresh',
            icon:     <Settings size={12} />,
            onClick:  refreshData,
            shortcut: 'Alt+R',
            variant:  'secondary',
          },
        ]}
      />

      {/* ── Main grid ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 p-4">
        <DataGridCard
          columns={REGISTRY_COLS}
          rows={filteredEvents}
          getRowKey={e => e.id}
          className="flex-1"
          toolbar={
            <div className="relative w-64">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search unposted items…"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded outline-none focus:ring-1 focus:ring-blue-400 font-medium"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          }
          emptyState={
            <div className="flex flex-col items-center gap-2 py-4">
              <CheckCircle2 size={28} className="text-emerald-400" />
              <p className="text-xs font-bold text-emerald-700">All financial events are cleared</p>
              <p className="text-[10px] text-slate-400">No items pending GL mapping</p>
            </div>
          }
        />
      </div>

      {/* ── Map & Post modal ─────────────────────────────────────────── */}
      {isModalOpen && selectedEvent && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[500]">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in duration-200">

            {/* Modal header — clean, no dark background */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Post Financial Event</h3>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">Assign GL Accounts</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 hover:bg-slate-100 rounded transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            {/* Event summary strip */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-0.5">Event Detail</p>
                  <p className="text-xs font-bold text-slate-900 uppercase">{selectedEvent.description}</p>
                </div>
                <div className="text-right">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${SOURCE_CLS[selectedEvent.sourceModule] ?? ''}`}>
                    {selectedEvent.sourceModule}
                  </span>
                  <p className="text-base font-black text-blue-700 tabular-nums mt-1">
                    PKR {(selectedEvent.amount || 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500">Debit Account (Expense / Asset)</label>
                <select
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-bold text-xs outline-none focus:ring-1 focus:ring-blue-500"
                  value={mappingForm.debitAccountId}
                  onChange={e => setMappingForm({ ...mappingForm, debitAccountId: e.target.value })}
                >
                  <option value="">-- Select GL Account --</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500">Credit Account (Source / Liability)</label>
                <select
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-bold text-xs outline-none focus:ring-1 focus:ring-blue-500"
                  value={mappingForm.creditAccountId}
                  onChange={e => setMappingForm({ ...mappingForm, creditAccountId: e.target.value })}
                >
                  <option value="">-- Select GL Account --</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500">Cost Center (Optional)</label>
                <select
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-bold text-xs outline-none focus:ring-1 focus:ring-blue-500 uppercase"
                  value={mappingForm.costCenterId}
                  onChange={e => setMappingForm({ ...mappingForm, costCenterId: e.target.value })}
                >
                  <option value="">-- No Assignment --</option>
                  {costCenters.map(cc => <option key={cc.id} value={cc.id}>[{cc.code}] {cc.name}</option>)}
                </select>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={mappingForm.saveRule}
                  onChange={e => setMappingForm({ ...mappingForm, saveRule: e.target.checked })}
                />
                <span className="text-xs font-semibold text-slate-700">Remember this mapping for future events</span>
              </label>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-500 font-bold uppercase text-[11px] hover:text-slate-700 transition-colors">
                Cancel
              </button>
              <button
                onClick={handlePost}
                className="inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-2 rounded-lg font-black uppercase text-[11px] tracking-wide shadow hover:bg-emerald-700 transition-colors"
              >
                <Save size={13} /> Post to Ledger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialRegistry;
