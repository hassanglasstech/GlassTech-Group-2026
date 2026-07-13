import React, { useMemo, useEffect, useState, lazy, Suspense } from 'react';
import { GlasscoPrintTemplate } from '@/modules/glassco/core/GlasscoPrintTemplate';
import { GlasscoList, EMPTY_QUOTE_FILTERS, type QuoteFilters } from '@/modules/glassco/core/GlasscoList';
import { GlasscoEditor } from '@/modules/glassco/core/GlasscoEditor';
import { useGlasscoQuotations } from './useGlasscoQuotations';
import { Sparkles, Loader2 } from 'lucide-react';
import { Quotation } from '@/modules/shared/types';
// guard the lazy agent chunk so a failed dynamic import can't crash the list.
import { ModuleErrorBoundary } from '@/modules/shared/components/ErrorBoundary';

// Lazy-load the agent chat (keeps initial bundle small)
const QuotationAgentChat = lazy(() =>
  import('@/modules/glassco/components/agent/QuotationAgentChat')
);

const GlasscoQuotationManager: React.FC = () => {
  const [agentOpen, setAgentOpen] = useState(false);
  const {
    quotations,
    isLoading,
    clients,
    products,
    isEditorOpen,
    setIsEditorOpen,
    searchTerm,
    setSearchTerm,
    sortType,
    setSortType,
    printingQuote,
    printMode,
    isMM,
    setIsMM,
    formData,
    setFormData,
    lastSerial,
    handleSaveQuotation,
    updateGlassItem,
    addItem,
    addSection,
    duplicateItem,
    removeItem,
    handlePrintRequest,
    handleDeleteQuotation,
    handleBulkMarkSent,
    handleBulkDelete,
    handleExportExcel,
    handleExportJson,
    handleBulkExportJson,
    handleBulkExportExcel,
    handleImportJson,
    handleImportExcel,
    // Phase-6 (6.6) — quotation state machine handlers
    handleMarkSent,
    handleReject,
    handleMarkLost,
    handleReopen,
    activePriceListName,
    repriceAllItems,
  } = useGlasscoQuotations();

  // status / date-range / value-range filter state (applied below).
  const [filters, setFilters] = useState<QuoteFilters>(EMPTY_QUOTE_FILTERS);

  // Open a quotation produced by the agent in the manual editor
  const handleAgentOpenEditor = (q: Partial<Quotation>) => {
    setFormData({
      id: undefined,
      date: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      clientId: q.clientId || '',  // P3-12: clientId is a Quotation field — no cast needed
      projectName: q.projectName || '',
      architect: q.architect || '',
      site: q.site || '',
      subject: q.subject || '',
      items: q.items || [],
      serviceCharges: q.serviceCharges || [],
      discountPercent: q.discountPercent || 0,
      discountAmount: q.discountAmount || 0,
      status: 'Draft',
      isAlreadyDispatched: false,
    });
    setAgentOpen(false);
    setIsEditorOpen(true);
  };

  // Pick up replacement order pre-fill from NCR module
  useEffect(() => {
    const raw = localStorage.getItem('glassco_replacement_prefill');
    if (raw) {
      try {
        // parse + apply the prefill BEFORE clearing localStorage. If
        // JSON.parse threw while the key was already removed, the replacement
        // prefill was lost forever. Now the key is only removed after the
        // editor has been populated successfully.
        const prefill = JSON.parse(raw);
        setFormData({
          id: undefined,
          date: new Date().toISOString().split('T')[0],
          dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          clientId: '',
          projectName: prefill.projectName || '',
          items: [],
          status: 'Draft',
          isAlreadyDispatched: false,
          discountPercent: 0,
          discountAmount: 0,
          orderType: prefill.orderType || 'Replacement',
          originalOrderRef: prefill.originalOrderRef || '',
          replacementReason: prefill.replacementReason || 'Customer Breakage',
          costBearer: prefill.costBearer || 'Customer',
        } as Partial<Quotation> & Record<string, unknown>);
        setIsEditorOpen(true);
        localStorage.removeItem('glassco_replacement_prefill');
      } catch {}
    }
  }, []);

  const filteredQuotations = useMemo(() => {
    let result = [...quotations];
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(q =>
        q.id.toLowerCase().includes(lower) ||
        (q.projectName && q.projectName.toLowerCase().includes(lower)) ||
        clients.find(c => c.id === q.clientId)?.name.toLowerCase().includes(lower)
      );
    }

    // status / date-range / value-range filters. An undefined status
    // renders as "Draft" in the list, so it matches a Draft filter too.
    if (filters.status)   result = result.filter(q => (q.status || 'Draft') === filters.status);
    if (filters.dateFrom) result = result.filter(q => (q.date || '') >= filters.dateFrom);
    if (filters.dateTo)   result = result.filter(q => (q.date || '') <= filters.dateTo);
    const minV = filters.minValue !== '' ? Number(filters.minValue) : null;
    const maxV = filters.maxValue !== '' ? Number(filters.maxValue) : null;
    const valueOf = (q: Quotation) => q.items?.reduce((s, i) => s + (i.amount || 0), 0) || 0;
    if (minV !== null && !Number.isNaN(minV)) result = result.filter(q => valueOf(q) >= minV);
    if (maxV !== null && !Number.isNaN(maxV)) result = result.filter(q => valueOf(q) <= maxV);

    if (sortType === 'date_desc') result.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (sortType === 'date_asc') result.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (sortType === 'client') result.sort((a,b) => {
        const nameA = clients.find(c => c.id === a.clientId)?.name || '';
        const nameB = clients.find(c => c.id === b.clientId)?.name || '';
        return nameA.localeCompare(nameB);
    });
    // the toolbar dropdown offers "Ref #: Newest/Oldest" (order_desc /
    // order_asc) but the sort had no branch for them — selecting either did
    // nothing. Sort by the trailing numeric serial of orderNo/id.
    const refSeq = (q: Quotation) =>
      parseInt((q.orderNo || q.id || '').replace(/[^0-9]/g, '').slice(-4) || '0', 10);
    if (sortType === 'order_desc') result.sort((a, b) => refSeq(b) - refSeq(a));
    if (sortType === 'order_asc')  result.sort((a, b) => refSeq(a) - refSeq(b));

    return result;
  }, [quotations, searchTerm, clients, sortType, filters]);

  return (
    <div className="space-y-6">
        {printingQuote && <GlasscoPrintTemplate printingQuote={printingQuote} clients={clients} printMode={printMode} />}

        {/* ── AI Agent panel (full-screen overlay over list) ── */}
        {agentOpen && !isEditorOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setAgentOpen(false); }}
          >
            <div className="w-full max-w-2xl h-[85vh]">
              {/* ModuleErrorBoundary catches a failed chunk load (or a
                  runtime crash inside the agent) so the quotation list survives. */}
              <ModuleErrorBoundary moduleName="AI Quotation Agent">
                <Suspense fallback={
                  <div className="h-full bg-slate-900 rounded-card flex items-center justify-center">
                    <Loader2 size={24} className="animate-spin text-cyan-400" />
                  </div>
                }>
                  <QuotationAgentChat
                    company="Glassco"
                    onClose={() => setAgentOpen(false)}
                    onOpenEditor={handleAgentOpenEditor}
                  />
                </Suspense>
              </ModuleErrorBoundary>
            </div>
          </div>
        )}

        {!isEditorOpen ? (
          <div className="space-y-4">
            {/* ── AI Agent button banner ── */}
            {!agentOpen && (
              <button
                onClick={() => setAgentOpen(true)}
                className="w-full flex items-center gap-3 bg-gradient-to-r from-slate-800 to-slate-800 hover:from-cyan-950 hover:to-slate-800 border border-slate-600 hover:border-cyan-500/50 rounded-2xl px-5 py-3.5 transition-all group"
              >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-md group-hover:shadow-cyan-500/25 transition-shadow flex-shrink-0">
                  <Sparkles size={16} className="text-white" />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white">AI Quotation Agent</div>
                  <div className="text-2xs text-slate-400">
                    "Ali Builders ka 6mm tempered quotation banao — 10 pcs 48×60"" → Agent builds it instantly
                  </div>
                </div>
                <span className="text-2xs text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 rounded-full whitespace-nowrap">
                  Try AI →
                </span>
              </button>
            )}

            <GlasscoList
              quotations={filteredQuotations}
              isLoading={isLoading}
              clients={clients}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              sortType={sortType}
              setSortType={setSortType}
              filters={filters}
              setFilters={setFilters}
              onNew={() => {
                  setFormData({
                    id: undefined,
                    date: new Date().toISOString().split('T')[0],
                    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    clientId: '',
                    projectName: '',
                    items: [],
                    status: 'Draft',
                    isAlreadyDispatched: false,
                    discountPercent: 0,
                    discountAmount: 0
                  });
                  setIsEditorOpen(true);
              }}
              onEdit={(q) => { setFormData(q); setIsEditorOpen(true); }}
              onPrint={(q) => handlePrintRequest(q, 'Quotation')}
              onPrintJobCard={(q) => handlePrintRequest(q, 'JobCard')}
              onApprove={(q) => handleSaveQuotation('approve', q)}
              onDelete={handleDeleteQuotation}
              onBulkMarkSent={handleBulkMarkSent}
              onBulkDelete={handleBulkDelete}
              onExport={handleExportExcel}
              onExportJson={handleExportJson}
              onBulkExportJson={handleBulkExportJson}
              onBulkExportExcel={handleBulkExportExcel}
              onImportJson={handleImportJson}
              onImportExcel={handleImportExcel}
              onMarkSent={handleMarkSent}
              onReject={handleReject}
              onMarkLost={handleMarkLost}
              onReopen={handleReopen}
            />
          </div>
        ) : null}

        {isEditorOpen && (
            // inline minHeight → Tailwind arbitrary value class min-h-[calc(100vh-120px)]
            <div className="bg-white rounded-xl w-full shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[calc(100vh-120px)]">
                <GlasscoEditor
                  formData={formData} clients={clients} products={products} isMM={isMM} setIsMM={setIsMM}
                  lastSerial={lastSerial}
                  onClose={() => setIsEditorOpen(false)} onUpdateItem={updateGlassItem}
                  onAddItem={addItem} onAddSection={addSection} onDuplicateItem={duplicateItem}
                  onRemoveItem={removeItem} onSave={handleSaveQuotation}
                  onSaveWastageDecision={(dec) => setFormData(prev => ({ ...prev, wastageDecision: dec as Quotation['wastageDecision'] }))}
                  activePriceListName={activePriceListName} onRepriceItems={repriceAllItems}
                />
            </div>
        )}
    </div>
  );
};

export default GlasscoQuotationManager;
