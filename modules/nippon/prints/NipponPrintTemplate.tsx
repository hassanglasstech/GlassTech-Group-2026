
import React from 'react';
import { Quotation, Client, ProductionPiece, Product } from '../../shared/types';
import { NipponQuotationPrint } from './NipponQuotationPrint';
import { NipponSalesOrderPrint } from './NipponSalesOrderPrint';
import { NipponJobCardPrint } from './NipponJobCardPrint';

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

    // Determine final mode based on input and status
    let finalMode = printMode;
    if (printingQuote.status === 'Approved' && printMode !== 'JobCard') {
        finalMode = 'SalesOrder';
    }

    switch(finalMode) {
        case 'SalesOrder':
            return <NipponSalesOrderPrint quote={printingQuote} clientName={clientName} printType={printType} products={products} />;
        case 'JobCard':
            return <NipponJobCardPrint quote={printingQuote} clientName={clientName} pieces={pieces || []} products={products || []} />;
        case 'Quotation':
        default:
            return <NipponQuotationPrint quote={printingQuote} clientName={clientName} printType={printType} products={products} />;
    }
};
