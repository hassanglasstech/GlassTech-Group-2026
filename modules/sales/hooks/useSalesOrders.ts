import { useState, useEffect, useMemo } from 'react';
import { Company, Quotation, Client, ProductionPiece } from '@/modules/shared/types';
import { SalesService } from '@/modules/sales/services/salesService';
import { ProductionService } from '@/modules/production/services/productionService';

export const useSalesOrders = (company: Company) => {
    const [approvedOrders, setApprovedOrders] = useState<Quotation[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [allPieces, setAllPieces] = useState<ProductionPiece[]>([]);
    const [sortType, setSortType] = useState('date_desc');

    const refreshData = () => {
        const allQuos = SalesService.getQuotations();
        const quos = allQuos.filter(q => 
            q.company === company && 
            (q.status || '').toUpperCase() === 'APPROVED'
        );
        
        setApprovedOrders(quos);
        setClients(SalesService.getClients().filter(c => c.company === company));
        setAllPieces(ProductionService.getProductionPieces());
    };

    useEffect(() => {
        refreshData();
    }, [company]);

    const getProgressStats = (orderNo?: string) => {
        if (!orderNo) return { percent: 0, completed: 0, total: 0 };
        const pieces = allPieces.filter(p => p.orderId === orderNo);
        if (pieces.length === 0) return { percent: 0, completed: 0, total: 0 };
        const completed = pieces.filter(p => p.status === 'Delivered' || p.status === 'Tempered').length;
        return {
            percent: Math.round((completed / pieces.length) * 100),
            completed,
            total: pieces.length
        };
    };

    const getOrderStatusScore = (orderNo?: string) => {
        const stats = getProgressStats(orderNo);
        if (stats.percent === 100) return 2;
        if (stats.percent > 0) return 1;
        return 0;
    };

    const sortedOrders = useMemo(() => {
        let result = [...approvedOrders];
        if (sortType === 'date_desc') result.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        else if (sortType === 'date_asc') result.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        else if (sortType === 'client') result.sort((a,b) => (clients.find(c => c.id === a.clientId)?.name || '').localeCompare(clients.find(c => c.id === b.clientId)?.name || ''));
        else if (sortType === 'status_pending') result.sort((a,b) => getOrderStatusScore(a.orderNo) - getOrderStatusScore(b.orderNo));
        else if (sortType === 'status_completed') result.sort((a,b) => getOrderStatusScore(b.orderNo) - getOrderStatusScore(a.orderNo));
        return result;
    }, [approvedOrders, sortType, clients, allPieces]);

    return {
        approvedOrders,
        clients,
        allPieces,
        sortType,
        setSortType,
        sortedOrders,
        refreshData,
        getProgressStats
    };
};
