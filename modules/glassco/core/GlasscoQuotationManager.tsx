import React, { useMemo } from 'react';
import { GlasscoPrintTemplate } from '@/modules/glassco/core/GlasscoPrintTemplate';
import { GlasscoList } from '@/modules/glassco/core/GlasscoList';
import { GlasscoEditor } from '@/modules/glassco/core/GlasscoEditor';
import GlasscoEditorUnified from '@/modules/glassco/core/GlasscoEditorUnified';   // Sprint 22
import { useGlasscoQuotations } from './useGlasscoQuotations';

const GlasscoQuotationManager: React.FC = () => {
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
    handleImportExcel
  } = useGlasscoQuotations();

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
        {!isEditorOpen ? (
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
            />
        ) : null}

        {isEditorOpen && (() => {
          // Sprint 22: opt-out via ?editor=v1 (legacy). Default = new unified editor.
          const useLegacy = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('editor') === 'v1';
          const Editor = useLegacy ? GlasscoEditor : GlasscoEditorUnified;
          return (
            <div className="bg-white rounded-xl w-full shadow-sm border border-slate-200 overflow-hidden flex flex-col" style={{ minHeight: 'calc(100vh - 120px)' }}>
                <Editor
                  formData={formData} clients={clients} products={products} isMM={isMM} setIsMM={setIsMM}
                  lastSerial={lastSerial}
                  onClose={() => setIsEditorOpen(false)} onUpdateItem={updateGlassItem}
                  onAddItem={addItem} onAddSection={addSection} onDuplicateItem={duplicateItem}
                  onRemoveItem={removeItem} onSave={handleSaveQuotation}
                  onSaveWastageDecision={(dec) => setFormData(prev => ({ ...prev, wastageDecision: dec }))}
                />
            </div>
          );
        })()}
    </div>
  );
};

export default GlasscoQuotationManager;
