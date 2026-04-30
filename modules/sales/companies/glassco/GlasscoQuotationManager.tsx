import React, { useMemo, useEffect, useState, lazy, Suspense } from 'react';
import { GlasscoPrintTemplate } from '@/modules/glassco/core/GlasscoPrintTemplate';
import { GlasscoList } from '@/modules/glassco/core/GlasscoList';
import { GlasscoEditor } from '@/modules/glassco/core/GlasscoEditor';
import { useGlasscoQuotations } from './useGlasscoQuotations';
import { Sparkles, Loader2 } from 'lucide-react';
import { Quotation } from '@/modules/shared/types';

// Lazy-load the agent chat (keeps initial bundle small)
const QuotationAgentChat = lazy(() =>
  import('@/modules/glassco/components/agent/QuotationAgentChat')
);

const GlasscoQuotationManager: React.FC = () => {
  const [agentOpen, setAgentOpen] = useState(false);
  const {
    quotations,
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
  } = useGlasscoQuotations();

  // Open a quotation produced by the agent in the manual editor
  const handleAgentOpenEditor = (q: Partial<Quotation>) => {
    setFormData({
      id: undefined,
      date: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      clientId: (q as any).clientId || '',
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
    const raw = localStorage.getItem('gtk_replacement_prefill');
    if (raw) {
      try {
        const prefill = JSON.parse(raw);
        localStorage.removeItem('gtk_replacement_prefill');
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
        } as any);
        setIsEditorOpen(true);
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
    
    if (sortType === 'date_desc') result.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (sortType === 'date_asc') result.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (sortType === 'client') result.sort((a,b) => {
        const nameA = clients.find(c => c.id === a.clientId)?.name || '';
        const nameB = clients.find(c => c.id === b.clientId)?.name || '';
        return nameA.localeCompare(nameB);
    });
    
    return result;
  }, [quotations, searchTerm, clients, sortType]);

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
              <Suspense fallback={
                <div className="h-full bg-slate-900 rounded-2xl flex items-center justify-center">
                  <Loader2 size={24} className="animate-spin text-cyan-400" />
                </div>
              }>
                <QuotationAgentChat
                  company="Glassco"
                  onClose={() => setAgentOpen(false)}
                  onOpenEditor={handleAgentOpenEditor}
                />
              </Suspense>
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
                  <div className="text-[10px] text-slate-400">
                    "Ali Builders ka 6mm tempered quotation banao — 10 pcs 48×60"" → Agent builds it instantly
                  </div>
                </div>
                <span className="text-[10px] text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 rounded-full whitespace-nowrap">
                  Try AI →
                </span>
              </button>
            )}

            <GlasscoList
              quotations={filteredQuotations}
              clients={clients}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              sortType={sortType}
              setSortType={setSortType}
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
          <div className="bg-white rounded-xl w-full shadow-sm border border-slate-200 overflow-hidden flex flex-col" style={{ minHeight: 'calc(100vh - 120px)' }}>
              <GlasscoEditor
                formData={formData} clients={clients} products={products} isMM={isMM} setIsMM={setIsMM}
                lastSerial={lastSerial}
                onClose={() => setIsEditorOpen(false)} onUpdateItem={updateGlassItem}
                onAddItem={addItem} onAddSection={addSection} onDuplicateItem={duplicateItem}
                onRemoveItem={removeItem} onSave={handleSaveQuotation}
                onSaveWastageDecision={(dec) => setFormData(prev => ({ ...prev, wastageDecision: dec }))}
              />
          </div>
        )}
    </div>
  );
};

export default GlasscoQuotationManager;
