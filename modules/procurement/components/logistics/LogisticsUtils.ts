
export const isInternal = (loc?: string) => {
    if (!loc) return false;
    const internalKeywords = ['GTK', 'GTI', 'GLASSCO', 'NIPPON', 'FACTORY', 'WAREHOUSE'];
    return internalKeywords.some(k => loc.toUpperCase().includes(k));
};

export const getClientName = (orderId: string, jobOrders: any[], clients: any[]) => {
    const order = jobOrders.find(o => o.orderNo === orderId);
    return clients.find(c => c.id === order?.clientId)?.name || 'Walk-in Partner';
};
