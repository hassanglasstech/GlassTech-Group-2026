
import React from 'react';
import { Quotation, Client, ProductionPiece, Product } from '../../shared/types';
import { NipponQuotationPrint } from './NipponQuotationPrint';
import { NipponSalesOrderPrint } from './NipponSalesOrderPrint';
import { NipponJobCardPrint } from './NipponJobCardPrint';
import { SalesService } from '../../sales/services/salesService';

interface Props {
    printingQuote: Quotation;
    clients: Client[];
    pieces?: ProductionPiece[];
    products?: Product[];
    printMode?: 'Quotation' | 'SalesOrder' | 'JobCard';
    printType?: 'KinLong' | 'Glasstech' | 'General';
}

export const NipponPrintTemplate: React.FC<Props> = ({ 
    printingQuote, 
    clients, 
    pieces,
    products,
    printMode = 'Quotation',
    printType = 'Glasstech'
}) => {
    const clientName = clients.find(c => c.id === printingQuote.clientId)?.name || 'Unknown Client';

    // Product master carries the image_url the prints resolve. Some callers (e.g.
    // the Sales-Order print path in SalesOrders.tsx) don't pass it — fall back to
    // the local product cache so images resolve on every print path.
    const prods = (products && products.length)
        ? products
        : SalesService.getProducts().filter(p => p.company === printingQuote.company);

    // Determine final mode based on input and status
    let finalMode = printMode;
    if (printingQuote.status === 'Approved' && printMode !== 'JobCard') {
        finalMode = 'SalesOrder';
    }

    switch(finalMode) {
        case 'SalesOrder':
            return <NipponSalesOrderPrint quote={printingQuote} clientName={clientName} printType={printType} products={prods} />;
        case 'JobCard':
            return <NipponJobCardPrint quote={printingQuote} clientName={clientName} pieces={pieces || []} products={prods} />;
        case 'Quotation':
        default:
            return <NipponQuotationPrint quote={printingQuote} clientName={clientName} printType={printType} products={prods} />;
    }
};
