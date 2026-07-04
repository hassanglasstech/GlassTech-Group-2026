import React, { useMemo, useState, useEffect } from 'react';
import { Quotation, Client, ProductionPiece, Product } from '../../shared/types';
import { SalesService } from '../../sales/services/salesService';
import { FinanceService } from '../../finance/services/financeService';
import { ProductionService } from '../../production/services/productionService';
import { supabase } from '../../../src/services/supabaseClient';
import { GlassCoQuotationPrint } from './prints/GlassCoQuotationPrint';
import { GlassCoSalesOrderPrint } from './prints/GlassCoSalesOrderPrint';
import { GlassCoJobCardPrint } from './prints/GlassCoJobCardPrint';

interface GlasscoPrintTemplateProps {
    printingQuote: Quotation;
    clients: Client[];
    pieces?: ProductionPiece[];
    products?: Product[];
    printMode?: 'Quotation' | 'SalesOrder' | 'JobCard';
}

const PRINT_STYLES = `
  .glassco-print-page { display: none !important; }

  @media print {
    html, body, #root, #__next, main {
      height: auto !important; min-height: auto !important; max-height: none !important;
      overflow: visible !important; position: static !important; display: block !important;
    }
    body > div, #root > div, #root > div > div, #root > div > main,
    .h-screen, .max-h-screen, .min-h-screen, .h-full,
    .overflow-hidden, .overflow-y-auto, .overflow-x-auto, .overflow-auto {
      height: auto !important; min-height: auto !important; max-height: none !important;
      overflow: visible !important; position: static !important; display: block !important;
    }
    @page { size: A4; margin: 10mm 12mm; }
    body * { visibility: hidden !important; }
    #glassco-print-root, #glassco-print-root * { visibility: visible !important; }
    .no-print, nav, aside, header, footer,
    [class*="sidebar"], [class*="topbar"], [class*="navbar"], [class*="bottom-nav"] { display: none !important; }
    #glassco-print-root {
      display: block !important; position: static !important; width: 100% !important;
      height: auto !important; overflow: visible !important; background: white !important;
    }
    #glassco-print-root .glassco-print-page {
      display: block !important; position: static !important; width: 100% !important;
      height: auto !important; overflow: visible !important; background: white !important;
    }
    #glassco-print-root .print-only, #glassco-print-root .print-container {
      position: static !important; top: auto !important; left: auto !important;
    }
    #glassco-print-root table { width: 100% !important; border-collapse: collapse !important; page-break-inside: auto !important; }
    #glassco-print-root thead { display: table-header-group !important; }
    #glassco-print-root tfoot { display: table-footer-group !important; }
    #glassco-print-root tbody { display: table-row-group !important; }
    #glassco-print-root tr { page-break-inside: avoid !important; break-inside: avoid !important; page-break-after: auto !important; }
    #glassco-print-root td, #glassco-print-root th { page-break-inside: avoid !important; break-inside: avoid !important; }
    #glassco-print-root .print-footer { break-inside: avoid !important; page-break-inside: avoid !important; }
    #glassco-print-root *, #glassco-print-root { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .bg-slate-50 { background-color: #f8fafc !important; }
    .bg-slate-100 { background-color: #f1f5f9 !important; }
    .bg-slate-200 { background-color: #e2e8f0 !important; }
    .bg-slate-900 { background-color: #0f172a !important; }
    .text-slate-400 { color: #94a3b8 !important; }
    .text-slate-500 { color: #64748b !important; }
    .text-slate-900 { color: #0f172a !important; }
    .border-slate-200 { border-color: #e2e8f0 !important; }
    .border-slate-300 { border-color: #cbd5e1 !important; }
    .font-pill-qt { border: 1.5px solid #1e293b; border-radius: 9999px; padding: 2px 30px; font-weight: 900; letter-spacing: 0.1em; }
    .font-pill-so { border: 1.5px solid #0f172a; border-radius: 9999px; padding: 2px 30px; font-weight: 900; letter-spacing: 0.1em; color: #0f172a; }
  }
`;

export const GlasscoPrintTemplate: React.FC<GlasscoPrintTemplateProps> = ({ 
    printingQuote, clients, pieces, products, printMode = 'Quotation' 
}) => {
    const clientObj = clients.find(c => c.id === printingQuote.clientId);
    const clientName = clientObj?.name || 'Unknown Client';
    // surface client address / phone / NTN on customer-facing prints
    const clientAddress = clientObj?.address || undefined;
    const clientPhone = clientObj?.phone || undefined;
    const clientNtn = clientObj?.ntn || undefined;
    const ledger = FinanceService.getLedger();
    const [fetchedPieces, setFetchedPieces] = useState<ProductionPiece[]>([]);
    const [fetchedProducts, setFetchedProducts] = useState<Product[]>(SalesService.getProducts());

    useEffect(() => {
        if (!pieces && printMode === 'JobCard') {
            const orderId = printingQuote.orderNo || printingQuote.id;
            // filter by the exact order_id. orderId is company-unique
            // (GT-SO-GLS-… vs GT-SO-GTK-…), so this cannot leak another
            // company's pieces — no cross-company contamination on the job card.
            // (Avoids .eq('company',…) which would miss legacy rows whose
            //  company column is still NULL pending the P1-14 backfill.)
            supabase.from('production_pieces').select('*').eq('order_id', orderId)
                .then(({ data, error }) => {
                    if (error) { console.warn('[GlasscoPrint] production_pieces fetch failed:', error.message); return; }
                    if (data && data.length > 0) {
                        setFetchedPieces(data.map((r) => ({
                            id: r.id, orderId: r.order_id, itemIndex: Number(r.item_index || 0),
                            specs: r.specs || '', status: r.status || 'Cut',
                            lastUpdated: r.last_updated || new Date().toISOString(),
                        })) as ProductionPiece[]);
                    }
                })
                .then(undefined, (err) => console.warn('[GlasscoPrint] pieces promise rejected:', err));
        }
        if (!products) {
            supabase.from('products').select('*')
                .then(({ data, error }) => {
                    if (error) { console.warn('[GlasscoPrint] products fetch failed:', error.message); return; }
                    if (data && data.length > 0) {
                        setFetchedProducts(data.map((r) => ({
                            ...r, serviceNick: r.service_nick, profileCode: r.profile_code,
                            sheetSize: r.sheet_size, costPrice: r.cost_price, basePrice: r.base_price,
                            glassType: r.glass_type, subCategory: r.sub_category, temperingPrice: r.tempering_price,
                            mainCategory: r.main_category, finishColor: r.finish_color,
                            modelNo: r.model_no, variants: r.variants || [],
                        })).filter((p) => (p.company || '').toLowerCase() === 'glassco'));
                    }
                })
                .then(undefined, (err) => console.warn('[GlasscoPrint] products promise rejected:', err));
        }
    }, [printingQuote.id, printMode]);

    const allPieces = useMemo(() => pieces || fetchedPieces, [pieces, fetchedPieces]);
    const allProducts = useMemo(() => products || fetchedProducts, [products, fetchedProducts]);

    let finalMode = printMode;
    if (printingQuote.status === 'Approved' && printMode !== 'JobCard') finalMode = 'SalesOrder';

    let content;
    switch(finalMode) {
        case 'SalesOrder': content = <GlassCoSalesOrderPrint quote={printingQuote} clientName={clientName} clientAddress={clientAddress} clientPhone={clientPhone} clientNtn={clientNtn} ledger={ledger} />; break;
        case 'JobCard': content = <GlassCoJobCardPrint quote={printingQuote} clientName={clientName} pieces={allPieces} products={allProducts} />; break;
        default: content = <GlassCoQuotationPrint quote={printingQuote} clientName={clientName} clientAddress={clientAddress} clientPhone={clientPhone} clientNtn={clientNtn} />;
    }

    return (
        <>
            {/* M-3: dangerouslySetInnerHTML eradicated. React's <style> element
                accepts a text child directly — no raw HTML injection required.
                PRINT_STYLES is a module-level constant defined in this file,
                so there is zero risk of XSS from external input. */}
            <style>{PRINT_STYLES}</style>
            <div id="glassco-print-root">{content}</div>
        </>
    );
};

export const PrintSummary: React.FC<{ items: any[] }> = ({ items }) => {
    const stats = items.reduce((acc, item) => {
        if (item.isSection) return acc;
        return { totalSqFt: acc.totalSqFt + (Number(item.totalSqFt) || 0), totalQty: acc.totalQty + (Number(item.qty) || 0) };
    }, { totalSqFt: 0, totalQty: 0 });
    return (
        <div className="bg-slate-900 text-white px-4 py-2 rounded-xl flex items-center space-x-4 shadow-lg border border-white/10 w-full no-print">
            <div className="flex flex-col"><span className="text-[8px] font-black uppercase text-slate-400 leading-none mb-1">Items</span><span className="text-xs font-black leading-none">{stats.totalQty}</span></div>
            <div className="h-6 w-px bg-white/10"></div>
            <div className="flex flex-col"><span className="text-[8px] font-black uppercase text-slate-400 leading-none mb-1">Total Ft²</span><span className="text-xs font-black text-blue-400 leading-none">{stats.totalSqFt.toFixed(2)}</span></div>
        </div>
    );
};
