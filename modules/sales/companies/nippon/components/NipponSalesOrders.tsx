
import React, { useState, useEffect, useMemo } from 'react';
import { Company, Quotation, Client, ProductionPiece, TemperingDispatch, PettyCashEntry } from '@/modules/shared/types';
import { SalesService } from '@/modules/sales/services/salesService';
import { ProductionService } from '@/modules/production/services/productionService';
import { useSalesOrders } from '@/modules/sales/hooks/useSalesOrders';
import { 
    ShoppingCart, X, CreditCard, Calendar, 
    Printer, ArrowLeft, CheckCircle2, Package, Filter, Receipt
} from 'lucide-react';
import { NipponPrintTemplate } from '@/modules/nippon/prints/NipponPrintTemplate';
import { UnifiedPaymentPrint } from '@/modules/finance/components/prints/UnifiedPaymentPrint';
import { toast } from 'sonner';

const NipponSalesOrders: React.FC<{ company: Company }> = ({ company }) => {
    const { 
        approvedOrders, 
        clients, 
        allPieces, 
        sortType, 
        setSortType, 
        sortedOrders, 
        refreshData, 
        getProgressStats 
    } = useSalesOrders(company);
    
    const [selectedOrder, setSelectedOrder] = useState<Quotation | null>(null);
    const [isPrinting, setIsPrinting] = useState(false);
    const [printMode, setPrintMode] = useState<'Quotation' | 'SalesOrder'>('SalesOrder');
    const [nipponPrintType, setNipponPrintType] = useState<'KinLong' | 'Glasstech' | 'General'>('Glasstech');
    
    const [printingReceipt, setPrintingReceipt] = useState<{data: PettyCashEntry, client: string} | null>(null);

    const [detailForm, setDetailForm] = useState({
        receivedAmount: 0,
        deliveryDate: ''
    });

    const handleSelectOrder = (order: Quotation) => {
        setSelectedOrder(order);
        setDetailForm({
            receivedAmount: order.receivedAmount || 0,
            deliveryDate: order.actualDeliveryDate || order.dueDate || ''
        });
    };

    const handleUpdateOrderDetails = () => {
        if (!selectedOrder) return;
        const all = SalesService.getQuotations();
        const updatedOrder = {
            ...selectedOrder,
            receivedAmount: Number(detailForm.receivedAmount),
            actualDeliveryDate: detailForm.deliveryDate
        };
        const next = all.map(q => q.id === selectedOrder.id ? updatedOrder : q);
        SalesService.saveQuotations(next);
        setSelectedOrder(updatedOrder);
        refreshData();
        toast.success("Industrial Update: Payment and Logistics data saved.");
    };

    const handlePrintOrder = () => { setPrintMode('SalesOrder'); setIsPrinting(true); setTimeout(() => { window.print(); setIsPrinting(false); }, 700); };
    const handlePrintQuotation = () => { setPrintMode('Quotation'); setIsPrinting(true); setTimeout(() => { window.print(); setIsPrinting(false); }, 700); };

    const handlePrintReceipt = () => {
        if (!selectedOrder || detailForm.receivedAmount <= 0) return;
        const client = clients.find(c => c.id === selectedOrder.clientId);
        const dummyEntry: PettyCashEntry = {
            id: `RCP-${Date.now().toString().slice(-6)}`,
            company,
            date: new Date().toISOString().split('T')[0],
            description: `Advance Payment for Order ${selectedOrder.orderNo}`,
            amount: detailForm.receivedAmount,
            type: 'Receipt',
            balance: 0,
            recordedBy: 'Sales Desk',
            status: 'Posted',
            businessTransaction: 'Customer Advance',
            referenceDoc: selectedOrder.orderNo || selectedOrder.id
        };
        setPrintingReceipt({ data: dummyEntry, client: client?.name || 'Walk-in Customer' });
        setTimeout(() => { window.print(); setPrintingReceipt(null); }, 500);
    };

    const orderValue = selectedOrder ? selectedOrder.items.reduce((s, i) => s + i.amount, 0) : 0;
    const balance = orderValue - (detailForm.receivedAmount || 0);

    return (
        <div className="space-y-6">
            {isPrinting && selectedOrder && <NipponPrintTemplate printingQuote={selectedOrder} clients={clients} printMode={printMode} printType={nipponPrintType} />}
            {printingReceipt && <UnifiedPaymentPrint data={printingReceipt.data} company={company} partyName={printingReceipt.client} />}
            {!selectedOrder ? (
                <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
                    <div className="p-6 bg-slate-50 border-b flex justify-between items-center">
                        <div className="flex items-center space-x-3"><ShoppingCart className="text-red-600" size={20}/><h3 className="font-black text-slate-800 uppercase tracking-tight text-sm">Active Sales Order Registry</h3></div>
                        <div className="flex items-center space-x-4">
                            <div className="relative"><Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} /><select className="sap-input pl-9 py-1.5 text-[10px] font-black uppercase appearance-none cursor-pointer hover:bg-slate-50 border border-slate-200 rounded-lg pr-4" value={sortType} onChange={e => setSortType(e.target.value)}><option value="date_desc">Latest First (Default)</option><option value="client">Client Name</option><option value="status_pending">Pending First</option><option value="status_completed">Completed First</option></select></div>
                            <span className="bg-red-600 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">{approvedOrders.length} Live Orders</span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left sap-table">
                            <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
                                <tr><th className="px-6 py-4">Order Ref</th><th className="px-6 py-4">Client & Project</th><th className="px-6 py-4">Booking Date</th><th className="px-6 py-4">Production Progress</th><th className="px-6 py-4 text-right">Value (PKR)</th><th className="px-6 py-4 text-center">Operation</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sortedOrders.map(order => {
                                    const stats = getProgressStats(order.orderNo);
                                    const clientName = clients.find(c => c.id === order.clientId)?.name || 'Unknown';
                                    const totalAmount = order.items.reduce((s, i) => s + (i.amount || 0), 0);
                                    return (
                                        <tr key={order.id} className="hover:bg-slate-50 group transition-all cursor-pointer" onClick={() => handleSelectOrder(order)}>
                                            <td className="px-6 py-4 font-black text-red-600 uppercase text-xs">{order.orderNo || order.id}</td>
                                            <td className="px-6 py-4"><p className="font-black text-slate-800 uppercase text-xs leading-tight">{clientName}</p><p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-1">{order.projectName || 'General Stock'}</p></td>
                                            <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">{order.date}</td>
                                            <td className="px-6 py-4 w-64"><div className="flex items-center space-x-3"><div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full transition-all duration-700 ${stats.percent === 100 ? 'bg-emerald-50' : 'bg-red-500'}`} style={{ width: `${stats.percent}%` }}/></div><span className="text-[10px] font-black text-slate-600">{stats.percent}%</span></div><p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tight">{stats.completed} / {stats.total} Pieces Dispatched</p></td>
                                            <td className="px-6 py-4 text-right font-black text-slate-900">{totalAmount.toLocaleString()}</td>
                                            <td className="px-6 py-4 text-center"><button className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest shadow hover:bg-red-600 transition-all">Open Details</button></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="animate-in slide-in-from-right duration-300 space-y-6">
                    <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center space-x-4"><button onClick={() => setSelectedOrder(null)} className="p-3 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><ArrowLeft size={24}/></button><div><div className="flex items-center space-x-2"><span className="text-[10px] font-black text-red-600 uppercase tracking-widest">{selectedOrder.orderNo}</span><span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{selectedOrder.date}</span></div><h2 className="text-2xl font-black uppercase text-slate-900 mt-1">{clients.find(c => c.id === selectedOrder.clientId)?.name}</h2><p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{selectedOrder.projectName || 'N/A Project'}</p></div></div>
                        <div className="flex items-center space-x-3">
                            <div className="flex items-center space-x-1 bg-slate-50 p-1.5 rounded-2xl border border-slate-200 mr-4">
                                {(['KinLong', 'Glasstech', 'General'] as const).map(type => (
                                    <button
                                        key={type}
                                        onClick={() => setNipponPrintType(type)}
                                        className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all ${
                                            nipponPrintType === type 
                                                ? 'bg-red-600 text-white shadow-lg shadow-red-100' 
                                                : 'text-slate-400 hover:text-slate-600'
                                        }`}
                                    >
                                        {type}
                                    </button>
                                ))}
                            </div>
                            <button onClick={handlePrintQuotation} className="bg-amber-500 text-white px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-amber-200 hover:bg-amber-600 transition-all flex items-center space-x-2"><Printer size={16}/> <span>Print Quotation</span></button>
                            <button onClick={handlePrintOrder} className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-slate-200 hover:bg-red-600 transition-all flex items-center space-x-2"><Printer size={16}/> <span>Print Sales Order</span></button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="col-span-1 space-y-6">
                            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-8">
                                <div className="flex items-center space-x-3 text-indigo-600 border-b pb-4"><CreditCard size={20}/><h3 className="font-black uppercase text-sm tracking-tight">Accounts Control</h3></div>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-end"><p className="text-[10px] font-black text-slate-400 uppercase">Total Order Value</p><p className="text-lg font-black text-slate-900">PKR {orderValue.toLocaleString()}</p></div>
                                    <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Received Payment</label><div className="flex space-x-2"><div className="relative flex-1"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-300">PKR</span><input type="number" className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xl text-emerald-600 outline-none focus:border-indigo-500 transition-all" value={detailForm.receivedAmount || ''} onChange={e => setDetailForm({...detailForm, receivedAmount: Number(e.target.value)})} placeholder="0"/></div><button onClick={handlePrintReceipt} disabled={detailForm.receivedAmount <= 0} className="bg-emerald-50 text-emerald-600 border-2 border-emerald-100 rounded-2xl px-3 hover:bg-emerald-100 transition-all disabled:opacity-50"><Receipt size={20}/></button></div></div>
                                    <div className={`p-4 rounded-2xl border flex justify-between items-center transition-all ${balance <= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}><span className="text-[10px] font-black uppercase text-slate-500">Net Balance Due:</span><span className={`text-lg font-black ${balance <= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{balance <= 0 ? 'PAID' : `PKR ${balance.toLocaleString()}`}</span></div>
                                </div>
                                <div className="space-y-4 pt-4 border-t border-slate-100"><div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-400 ml-1 flex items-center gap-1"><Calendar size={12}/> Confirm Delivery Date</label><input type="text" placeholder="e.g. 25-06-2026" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-800 outline-none focus:border-indigo-500 transition-all uppercase placeholder:text-[10px]" value={detailForm.deliveryDate} onChange={e => setDetailForm({...detailForm, deliveryDate: e.target.value})}/></div></div>
                                <button onClick={handleUpdateOrderDetails} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg hover:bg-emerald-600 transition-all flex items-center justify-center space-x-2"><CheckCircle2 size={18}/> <span>Update Order Records</span></button>
                            </div>
                        </div>
                        <div className="col-span-2"><div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full"><div className="p-6 bg-slate-50 border-b flex justify-between items-center"><div className="flex items-center space-x-3"><Package className="text-slate-500" size={20}/><h3 className="font-black text-slate-700 uppercase text-xs tracking-tight">Order Specifications</h3></div></div><div className="flex-1 overflow-y-auto"><table className="w-full text-left"><thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 border-b"><tr><th className="px-6 py-4">#</th><th className="px-6 py-4">Description</th><th className="px-6 py-4 text-center">Dimensions</th><th className="px-6 py-4 text-center">Qty</th><th className="px-6 py-4 text-right">Amount</th></tr></thead><tbody className="divide-y divide-slate-100">{selectedOrder.items.map((item, idx) => (<tr key={idx} className={item.isSection ? 'bg-slate-50/50' : 'hover:bg-slate-50'}><td className="px-6 py-4 text-[10px] font-black text-slate-300">{idx+1}</td><td className="px-6 py-4"><p className={`font-bold text-xs uppercase ${item.isSection ? 'text-red-700 font-black' : 'text-slate-800'}`}>{item.isSection ? `[SECTION] ${item.description}` : `${item.glassSize} ${item.glassType}`}</p>{!item.isSection && <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Processing: {item.selectedServices?.join(', ') || 'Standard'}</p>}</td><td className="px-6 py-4 text-center text-xs font-mono font-bold text-slate-500">{!item.isSection && `${item.inchW}.${item.sootW || 0} x ${item.inchH}.${item.sootH || 0}`}</td><td className="px-6 py-4 text-center font-black text-slate-900">{item.qty || '-'}</td><td className="px-6 py-4 text-right font-black text-slate-800">{item.amount > 0 ? item.amount.toLocaleString() : '-'}</td></tr>))}</tbody></table></div></div></div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NipponSalesOrders;
