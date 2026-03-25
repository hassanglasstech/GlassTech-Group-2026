import React, { useMemo, useState, useEffect } from 'react';
import { Quotation, Client, ProductionPiece, Product } from '../../shared/types';
import { SalesService } from '../../sales/services/salesService';
import { FinanceService } from '../../finance/services/financeService';
import { ProductionService } from '../../production/services/productionService';
import { supabase } from '../../../src/services/supabaseClient';
import { GlassCoQuotationPrint } from './prints/GlassCoQuotationPrint';
import { GlassCoSalesOrderPrint } from './prints/GlassCoSalesOrderPrint';
import { GlassCoJobCardPrint } from './prints/GlassCoJobCardPrint';
import './GlasscoPrintTemplate.css';

interface GlasscoPrintTemplateProps {
    printingQuote: Quotation;
    clients: Client[];
    pieces?: ProductionPiece[];
    products?: Product[];
    printMode?: 'Quotation' | 'SalesOrder' | 'JobCard';
}

export const GlasscoPrintTemplate: React.FC<GlasscoPrintTemplateProps> = ({ 
    printingQuote, 
    clients, 
    pieces,
    products,
    printMode = 'Quotation' 
}) => {
    const clientName = clients.find(c => c.id === printingQuote.clientId)?.name || 'Unknown Client';
    const ledger = FinanceService.getLedger();

    const [fetchedPieces, setFetchedPieces] = useState<ProductionPiece[]>([]);
    const [fetchedProducts, setFetchedProducts] = useState<Product[]>(SalesService.getProducts());

    useEffect(() => {
        // Load pieces from Supabase for JobCard
        if (!pieces && printMode === 'JobCard') {
            const orderId = printingQuote.orderNo || printingQuote.id;
            supabase.from('production_pieces')
                .select('*')
                .or(`order_id.eq.${orderId}`)
                .then(({ data }) => {
                    if (data && data.length > 0) {
                        const mapped = data.map((r: any) => ({
                            id: r.id,
                            orderId: r.order_id,
                            itemIndex: Number(r.item_index || 0),
                            specs: r.specs || '',
                            status: r.status || 'Cut',
                            lastUpdated: r.last_updated || new Date().toISOString(),
                        })) as ProductionPiece[];
                        setFetchedPieces(mapped);
                    }
                });
        }
        // Load products
        if (!products) {
            supabase.from('products').select('*')
                .then(({ data }) => {
                    if (data && data.length > 0) {
                        const mapped = data.map((r: any) => ({
                            ...r,
                            serviceNick: r.service_nick, profileCode: r.profile_code,
                            sheetSize: r.sheet_size, costPrice: r.cost_price,
                            basePrice: r.base_price, glassType: r.glass_type,
                            subCategory: r.sub_category, temperingPrice: r.tempering_price,
                            mainCategory: r.main_category, finishColor: r.finish_color,
                            modelNo: r.model_no, variants: r.variants || [],
                        }));
                        setFetchedProducts(mapped.filter((p: any) => p.company === 'Glassco' || p.company === 'GlassCo'));
                    }
                });
        }
    }, [printingQuote.id, printMode]);

    const allPieces = useMemo(() => pieces || fetchedPieces, [pieces, fetchedPieces]);
    const allProducts = useMemo(() => products || fetchedProducts, [products, fetchedProducts]);

    // Determine final mode based on input and status
    let finalMode = printMode;

    switch(finalMode) {
        case 'SalesOrder':
            return <GlassCoSalesOrderPrint quote={printingQuote} clientName={clientName} ledger={ledger} />;
        case 'JobCard':
            return <GlassCoJobCardPrint quote={printingQuote} clientName={clientName} pieces={allPieces} products={allProducts} />;
        case 'Quotation':
        default:
            return <GlassCoQuotationPrint quote={printingQuote} clientName={clientName} />;
    }
};

export const PrintSummary: React.FC<{ items: any[] }> = ({ items }) => {
    const stats = items.reduce((acc, item) => {
        if (item.isSection) return acc;
        return { 
            totalSqFt: acc.totalSqFt + (Number(item.totalSqFt) || 0), 
            totalQty: acc.totalQty + (Number(item.qty) || 0) 
        };
    }, { totalSqFt: 0, totalQty: 0 });

    return (
        <div className="bg-slate-900 text-white px-4 py-2 rounded-xl flex items-center space-x-4 shadow-lg border border-white/10 w-full no-print">
            <div className="flex flex-col">
                <span className="text-[8px] font-black uppercase text-slate-400 leading-none mb-1">Items</span>
                <span className="text-xs font-black leading-none">{stats.totalQty}</span>
            </div>
            <div className="h-6 w-px bg-white/10"></div>
            <div className="flex flex-col">
                <span className="text-[8px] font-black uppercase text-slate-400 leading-none mb-1">Total Ft²</span>
                <span className="text-xs font-black text-blue-400 leading-none">{stats.totalSqFt.toFixed(2)}</span>
            </div>
        </div>
    );
};
