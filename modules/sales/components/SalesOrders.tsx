
import React, { useState, useEffect, useMemo } from 'react';
import { Company, Quotation, Client, ProductionPiece, TemperingDispatch, PurchaseOrder, PettyCashEntry, Product, Vendor } from '../../shared/types';
import { SalesService } from '../services/salesService';
import { ProductionService } from '../../production/services/productionService';
import { InventoryService } from '../../procurement/services/inventoryService';
import { 
    ShoppingCart, FilePlus, X, Info, CreditCard, Calendar, 
    Printer, ArrowLeft, CheckCircle2, Package, Clock, DollarSign, Filter, Receipt, Flame
} from 'lucide-react';
import { GlasscoPrintTemplate } from '../../glassco/core/GlasscoPrintTemplate';
import { NipponPrintTemplate } from '../../nippon/prints/NipponPrintTemplate';
import { UnifiedPaymentPrint } from '../../finance/components/prints/UnifiedPaymentPrint';
import { GlasscoServiceOrderPrint } from '../../glassco/core/prints/GlasscoServiceOrderPrint';
import { useLocation } from 'react-router-dom';

import { useAppStore } from '../../shared/store/appStore';
import { toast } from 'sonner';

const SalesOrders: React.FC = () => {
    const company = useAppStore(state => state.selectedCompany);
    const location = useLocation();
    
    // --- AUTOMATED SERVICE ORDER QUEUE ---
    const [autoServiceQueue, setAutoServiceQueue] = useState<string[]>([]);
    const [isAutoProcessing, setIsAutoProcessing] = useState(false);
    
    // Data State
    const [approvedOrders, setApprovedOrders] = useState<Quotation[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [allPieces, setAllPieces] = useState<ProductionPiece[]>([]);
    const [challans, setChallans] = useState<TemperingDispatch[]>([]);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    
    // UI State
    const [selectedOrder, setSelectedOrder] = useState<Quotation | null>(null);
    const [isPOModalOpen, setIsPOModalOpen] = useState(false);
    const [isServiceOrderModalOpen, setIsServiceOrderModalOpen] = useState(false);
    const [selectedChallanId, setSelectedChallanId] = useState('');
    const [isPrinting, setIsPrinting] = useState(false);
    const [printMode, setPrintMode] = useState<'Quotation' | 'SalesOrder'>('SalesOrder');
    const [sortType, setSortType] = useState('date_desc');
    
    // Payment Receipt Printing
    const [printingReceipt, setPrintingReceipt] = useState<{data: PettyCashEntry, client: string} | null>(null);
    
    // Service Order Logic
    const [serviceOrderBatches, setServiceOrderBatches] = useState<{vendor: string, pendingSqFt: number, thickness: string}[]>([]);
    const [printingServiceOrder, setPrintingServiceOrder] = useState<PurchaseOrder | null>(null);

    // Detail Form State
    const [detailForm, setDetailForm] = useState({
        receivedAmount: 0,
        deliveryDate: ''
    });

    const [nipponPrintType, setNipponPrintType] = useState<'KinLong' | 'Glasstech' | 'General'>('Glasstech');

    useEffect(() => {
        refreshData();
    }, [company]);

    // Handle Incoming Queue from Router (Logistics Module)
    useEffect(() => {
        if(location.state?.serviceOrderQueue && Array.isArray(location.state.serviceOrderQueue)) {
            const queue = location.state.serviceOrderQueue;
            if(queue.length > 0) {
                setAutoServiceQueue(queue);
                setIsAutoProcessing(true);
                // Clear state to prevent re-trigger on refresh is handled by browser, but we can manage local state
                window.history.replaceState({}, document.title);
            }
        }
    }, [location]);

    // Automated Queue Processor
    useEffect(() => {
        if (isAutoProcessing && autoServiceQueue.length > 0 && !selectedOrder && !isServiceOrderModalOpen && approvedOrders.length > 0) {
            const nextOrderId = autoServiceQueue[0];
            const targetOrder = approvedOrders.find(o => o.orderNo === nextOrderId);
            
            if (targetOrder) {
                handleSelectOrder(targetOrder);
                // Allow a brief render cycle for state to settle before popping the modal
                setTimeout(() => {
                   prepareServiceOrder(targetOrder); 
                }, 300);
            } else {
                // Order not found (maybe archived or data mismatch), skip
                setAutoServiceQueue(prev => prev.slice(1));
            }
        } else if (isAutoProcessing && autoServiceQueue.length === 0 && !selectedOrder) {
             setIsAutoProcessing(false);
             toast.success("All queued Service Orders have been processed.");
        }
    }, [isAutoProcessing, autoServiceQueue, selectedOrder, isServiceOrderModalOpen, approvedOrders]);

    const refreshData = () => {
        const allQuos = SalesService.getQuotations();
        const quos = allQuos.filter(q => 
            q.company === company && 
            (q.status || '').toUpperCase() === 'APPROVED'
        );
        
        setApprovedOrders(quos);
        setClients(SalesService.getClients().filter(c => c.company === company));
        setAllPieces(ProductionService.getProductionPieces());
        setChallans(ProductionService.getTemperingDispatches().filter(d => d.company === company || d.company === 'Factory'));
        setVendors(SalesService.getVendors());
    };

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
        if (stats.percent === 100) return 2; // Completed
        if (stats.percent > 0) return 1; // WIP
        return 0; // Pending
    };

    const sortedOrders = useMemo(() => {
        let result = [...approvedOrders];
        
        if (sortType === 'date_desc') {
            result.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        } else if (sortType === 'date_asc') {
            result.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        } else if (sortType === 'client') {
            result.sort((a,b) => {
                const nameA = clients.find(c => c.id === a.clientId)?.name || '';
                const nameB = clients.find(c => c.id === b.clientId)?.name || '';
                return nameA.localeCompare(nameB);
            });
        } else if (sortType === 'status_pending') {
            result.sort((a,b) => getOrderStatusScore(a.orderNo) - getOrderStatusScore(b.orderNo));
        } else if (sortType === 'status_completed') {
            result.sort((a,b) => getOrderStatusScore(b.orderNo) - getOrderStatusScore(a.orderNo));
        }
        
        return result;
    }, [approvedOrders, sortType, clients, allPieces]);

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

    const handlePrintOrder = () => {
        setPrintMode('SalesOrder');
        setIsPrinting(true);
        setTimeout(() => {
            window.print();
            setIsPrinting(false);
        }, 700);
    };

    const handlePrintQuotation = () => {
        setPrintMode('Quotation');
        setIsPrinting(true);
        setTimeout(() => {
            window.print();
            setIsPrinting(false);
        }, 700);
    };

    const handlePrintReceipt = () => {
        if (!selectedOrder || detailForm.receivedAmount <= 0) {
            toast.error("No received amount to print.");
            return;
        }
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
        setTimeout(() => {
            window.print();
            setPrintingReceipt(null);
        }, 500);
    };

    // --- SERVICE ORDER LOGIC ---
    const prepareServiceOrder = (orderContext = selectedOrder) => {
        if (!orderContext) return;
        
        // 1. Get all pieces for this order that need Tempering
        const temperingPieces = allPieces.filter(p => {
            if (p.orderId !== orderContext.orderNo) return false;
            const item = orderContext.items[p.itemIndex];
            const services = item?.selectedServices || [];
            return services.includes('T/G') || services.includes('Tempered') || item?.glassType === 'Tempered';
        });

        if (temperingPieces.length === 0 && !isAutoProcessing) {
            toast.error("No items in this order require Tempering.");
            return;
        }

        // 2. Identify Dispatched Batches (External)
        const dispatchedPieces = temperingPieces.filter(p => {
            if (!p.dispatchId) return false;
            const trip = challans.find(c => c.id === p.dispatchId);
            return trip && trip.serviceType === 'Tempering' && !['GTK','GTI','GLASSCO','FACTORY'].some(k => trip.plantName.toUpperCase().includes(k)); 
        });

        if (dispatchedPieces.length === 0 && !isAutoProcessing) {
            toast.error("No pieces have been dispatched to external tempering vendors yet.");
            return;
        }
        if (dispatchedPieces.length === 0 && isAutoProcessing) {
             // Auto-skip if no dispatched pieces found
             setAutoServiceQueue(prev => prev.slice(1));
             setSelectedOrder(null);
             return;
        }

        // 3. Check Billed
        const existingPOs = ProductionService.getPurchaseOrders().filter(po => 
            po.projectId === orderContext.orderNo && po.category === 'Tempering'
        );
        
        const billedMap: Record<string, Record<string, number>> = {};
        existingPOs.forEach(po => {
            const vendor = po.toVendor;
            if (!billedMap[vendor]) billedMap[vendor] = {};
            po.items.forEach(i => {
                const thickMatch = i.description?.match(/(\d+mm)/);
                if (thickMatch) {
                    const thick = thickMatch[1];
                    billedMap[vendor][thick] = (billedMap[vendor][thick] || 0) + (i.qty || 0);
                }
            });
        });

        // 4. Calculate Pending
        const pendingBatches: {vendor: string, pendingSqFt: number, thickness: string}[] = [];
        const dispatchMap: Record<string, Record<string, number>> = {};
        
        dispatchedPieces.forEach(p => {
            const trip = challans.find(c => c.id === p.dispatchId);
            const vendor = trip?.plantName || 'Unknown';
            const item = orderContext.items[p.itemIndex];
            const thick = item?.glassSize || '12mm'; 
            const sqFt = item?.totalSqFt / (item?.qty || 1); 

            if (!dispatchMap[vendor]) dispatchMap[vendor] = {};
            dispatchMap[vendor][thick] = (dispatchMap[vendor][thick] || 0) + sqFt;
        });

        Object.entries(dispatchMap).forEach(([vendor, thickMap]) => {
            Object.entries(thickMap).forEach(([thick, totalSqFt]) => {
                const billed = billedMap[vendor]?.[thick] || 0;
                const pending = totalSqFt - billed;
                if (pending > 0.1) { 
                    pendingBatches.push({ vendor, thickness: thick, pendingSqFt: pending });
                }
            });
        });

        if (pendingBatches.length === 0) {
             if(isAutoProcessing) {
                 setAutoServiceQueue(prev => prev.slice(1));
                 setSelectedOrder(null);
             } else {
                 toast.info("All dispatched pieces have already been issued a Service Order.");
             }
             return;
        }
        
        setServiceOrderBatches(pendingBatches);
        setIsServiceOrderModalOpen(true);
    };

    const confirmIssueServiceOrder = (batch: {vendor: string, pendingSqFt: number, thickness: string}) => {
        // Updated Logic: Find Latest Effective Rate
        const vendor = vendors.find(v => v.name === batch.vendor);
        
        if (!vendor) {
            toast.error(`Vendor "${batch.vendor}" not found in Vendor Registry.`);
            return;
        }
        
        const validRates = (vendor.rates || []).filter(r => 
            r.thickness === batch.thickness && 
            (r.type === 'All' || r.type === 'Clear')
        );

        validRates.sort((a,b) => new Date(b.effectiveDate || '2000-01-01').getTime() - new Date(a.effectiveDate || '2000-01-01').getTime());
        
        const rateObj = validRates[0]; 
        
        if (!rateObj || !rateObj.rate) {
            toast.error(`Rate for ${batch.thickness} is missing in Vendor ${batch.vendor}'s Rate Card. \n\nPlease go to Vendor Network > Registry > Rates to add it.`);
            return;
        }

        const amount = Math.round(batch.pendingSqFt * rateObj.rate);
        
        const newPO: PurchaseOrder = {
            id: `SO-SVC-${Date.now().toString().slice(-6)}`,
            fromCompany: company,
            toVendor: batch.vendor,
            date: new Date().toISOString().split('T')[0],
            status: 'Sent',
            totalAmount: amount,
            category: 'Tempering', // IMPORTANT for filter
            projectId: selectedOrder?.orderNo, // Link to Sales Order
            items: [{
                description: `${batch.thickness} Tempering Service`,
                qty: Number(batch.pendingSqFt.toFixed(2)), 
                rate: rateObj.rate,
                costCenter: 'Cost of Sales'
            }]
        };

        const allPOs = ProductionService.getPurchaseOrders();
        ProductionService.savePurchaseOrders([...allPOs, newPO]);
        
        setIsServiceOrderModalOpen(false);
        setPrintingServiceOrder(newPO);
        
        setTimeout(() => {
            window.print();
            setPrintingServiceOrder(null);
            
            // AUTOMATION: Move to next order if queue is active
            if(isAutoProcessing) {
                // Check if there are other pending batches for THIS order first?
                // For simplicity, we assume one batch processed per modal interaction, 
                // but if multiple batches existed, we might want to stay.
                // However, current UI prompts list all batches.
                // If user selects one, we close modal.
                
                // If there are other batches remaining for this order, we re-open?
                // Better approach: If auto-processing, we assume user might want to process all.
                // But simplified: Close current order, move to next. 
                // If user wants to process multiple batches for same order, they'd have to do it manually or we re-trigger.
                
                // Let's assume one major batch per order for now, or user will re-click if prompted again.
                // Moving to next order in queue:
                setAutoServiceQueue(prev => prev.slice(1));
                setSelectedOrder(null);
            }
        }, 500);
    };

    const orderValue = selectedOrder ? selectedOrder.items.reduce((s, i) => s + i.amount, 0) : 0;
    const balance = orderValue - (detailForm.receivedAmount || 0);
    const hasTempering = selectedOrder?.items.some(i => i.selectedServices?.includes('T/G') || i.glassType === 'Tempered');

    return (
        <div className="space-y-6">
            {/* Print Mode Overlays */}
            {isPrinting && selectedOrder && (
                company === 'Nippon' 
                    ? <NipponPrintTemplate printingQuote={selectedOrder} clients={clients} printMode={printMode} printType={nipponPrintType} />
                    : <GlasscoPrintTemplate printingQuote={selectedOrder} clients={clients} printMode={printMode} />
            )}
            
            {printingReceipt && (
                <UnifiedPaymentPrint 
                    data={printingReceipt.data} 
                    company={company} 
                    partyName={printingReceipt.client} 
                />
            )}

            {printingServiceOrder && (
                <GlasscoServiceOrderPrint po={printingServiceOrder} />
            )}
            
            {/* Queue Indicator */}
            {isAutoProcessing && autoServiceQueue.length > 0 && (
                <div className="bg-indigo-600 text-white p-3 text-center font-bold text-xs uppercase animate-pulse fixed top-0 left-0 right-0 z-[1000] shadow-xl">
                    ⚠️ Processing Automation Active: {autoServiceQueue.length} Orders Pending Service Generation...
                </div>
            )}

            {!selectedOrder ? (
                <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
                    <div className="p-6 bg-slate-50 border-b flex justify-between items-center">
                        <div className="flex items-center space-x-3">
                            <ShoppingCart className="text-blue-600" size={20}/>
                            <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm">Active Sales Order Registry</h3>
                        </div>
                        <div className="flex items-center space-x-4">
                            <div className="relative">
                                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                <select 
                                    className="sap-input pl-9 py-1.5 text-[10px] font-black uppercase appearance-none cursor-pointer hover:bg-slate-50 border border-slate-200 rounded-lg pr-4"
                                    value={sortType}
                                    onChange={e => setSortType(e.target.value)}
                                >
                                    <option value="date_desc">Latest First (Default)</option>
                                    <option value="client">Client Name</option>
                                    <option value="status_pending">Pending First</option>
                                    <option value="status_completed">Completed First</option>
                                </select>
                            </div>
                            <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                                {approvedOrders.length} Live Orders
                            </span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left sap-table">
                            <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
                                <tr>
                                    <th className="px-6 py-4">Order Ref</th>
                                    <th className="px-6 py-4">Client & Project</th>
                                    <th className="px-6 py-4">Booking Date</th>
                                    <th className="px-6 py-4">Production Progress</th>
                                    <th className="px-6 py-4 text-right">Value (PKR)</th>
                                    <th className="px-6 py-4 text-center">Operation</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sortedOrders.map(order => {
                                    const stats = getProgressStats(order.orderNo);
                                    const clientName = clients.find(c => c.id === order.clientId)?.name || 'Unknown';
                                    const totalAmount = order.items.reduce((s, i) => s + (i.amount || 0), 0);
                                    
                                    return (
                                        <tr key={order.id} className="hover:bg-slate-50 group transition-all cursor-pointer" onClick={() => handleSelectOrder(order)}>
                                            <td className="px-6 py-4 font-black text-blue-600 uppercase text-xs">{order.orderNo || order.id}</td>
                                            <td className="px-6 py-4">
                                                <p className="font-black text-slate-800 uppercase text-xs leading-tight">{clientName}</p>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-1">{order.projectName || 'General Stock'}</p>
                                            </td>
                                            <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">{order.date}</td>
                                            <td className="px-6 py-4 w-64">
                                                <div className="flex items-center space-x-3">
                                                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                        <div 
                                                            className={`h-full transition-all duration-700 ${stats.percent === 100 ? 'bg-emerald-50' : 'bg-blue-500'}`} 
                                                            style={{ width: `${stats.percent}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-[10px] font-black text-slate-600">{stats.percent}%</span>
                                                </div>
                                                <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tight">{stats.completed} / {stats.total} Pieces Dispatched</p>
                                            </td>
                                            <td className="px-6 py-4 text-right font-black text-slate-900">{totalAmount.toLocaleString()}</td>
                                            <td className="px-6 py-4 text-center">
                                                <button className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest shadow hover:bg-blue-600 transition-all">Open Details</button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {approvedOrders.length === 0 && (
                                    <tr><td colSpan={6} className="px-6 py-20 text-center text-slate-300 italic font-black uppercase tracking-widest">No Active Industrial Orders.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="animate-in slide-in-from-right duration-300 space-y-6">
                    {/* Detail Workspace Header */}
                    <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center space-x-4">
                            <button onClick={() => setSelectedOrder(null)} className="p-3 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                                <ArrowLeft size={24}/>
                            </button>
                            <div>
                                <div className="flex items-center space-x-2">
                                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{selectedOrder.orderNo}</span>
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{selectedOrder.date}</span>
                                </div>
                                <h2 className="text-2xl font-black uppercase text-slate-900 mt-1">{clients.find(c => c.id === selectedOrder.clientId)?.name}</h2>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{selectedOrder.projectName || 'N/A Project'}</p>
                            </div>
                        </div>
                        <div className="flex items-center space-x-3">
                            {company === 'Nippon' && (
                                <div className="flex items-center space-x-1 bg-slate-50 p-1.5 rounded-2xl border border-slate-200 mr-4">
                                    {(['KinLong', 'Glasstech', 'General'] as const).map(type => (
                                        <button
                                            key={type}
                                            onClick={() => setNipponPrintType(type)}
                                            className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all ${
                                                nipponPrintType === type 
                                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' 
                                                    : 'text-slate-400 hover:text-slate-600'
                                            }`}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {hasTempering && (
                                <button 
                                    onClick={() => prepareServiceOrder()}
                                    className="bg-rose-50 text-rose-700 px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest border border-rose-100 hover:bg-rose-100 transition-all flex items-center space-x-2"
                                >
                                    <Flame size={16}/> <span>Issue Service Order</span>
                                </button>
                            )}
                            <button 
                                onClick={handlePrintQuotation}
                                className="bg-amber-500 text-white px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-amber-200 hover:bg-amber-600 transition-all flex items-center space-x-2"
                            >
                                <Printer size={16}/> <span>Print Quotation</span>
                            </button>
                            <button 
                                onClick={handlePrintOrder}
                                className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-slate-200 hover:bg-blue-600 transition-all flex items-center space-x-2"
                            >
                                <Printer size={16}/> <span>Print Sales Order</span>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Financial Detail Control */}
                        <div className="col-span-1 space-y-6">
                            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-8">
                                <div className="flex items-center space-x-3 text-indigo-600 border-b pb-4">
                                    <CreditCard size={20}/>
                                    <h3 className="font-black uppercase text-sm tracking-tight">Accounts Control</h3>
                                </div>
                                
                                <div className="space-y-4">
                                    <div className="flex justify-between items-end">
                                        <p className="text-[10px] font-black text-slate-400 uppercase">Total Order Value</p>
                                        <p className="text-lg font-black text-slate-900">PKR {orderValue.toLocaleString()}</p>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Received Payment (Advance/Bal)</label>
                                        <div className="flex space-x-2">
                                            <div className="relative flex-1">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-300">PKR</span>
                                                <input 
                                                    type="number" 
                                                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xl text-emerald-600 outline-none focus:border-indigo-500 transition-all"
                                                    value={detailForm.receivedAmount || ''}
                                                    onChange={e => setDetailForm({...detailForm, receivedAmount: Number(e.target.value)})}
                                                    placeholder="0"
                                                />
                                            </div>
                                            <button 
                                                onClick={handlePrintReceipt}
                                                disabled={detailForm.receivedAmount <= 0}
                                                className="bg-emerald-50 text-emerald-600 border-2 border-emerald-100 rounded-2xl px-3 hover:bg-emerald-100 transition-all disabled:opacity-50"
                                                title="Print Official Receipt"
                                            >
                                                <Receipt size={20}/>
                                            </button>
                                        </div>
                                    </div>

                                    <div className={`p-4 rounded-2xl border flex justify-between items-center transition-all ${balance <= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                                        <span className="text-[10px] font-black uppercase text-slate-500">Net Balance Due:</span>
                                        <span className={`text-lg font-black ${balance <= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                            {balance <= 0 ? 'PAID' : `PKR ${balance.toLocaleString()}`}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-4 pt-4 border-t border-slate-100">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1 flex items-center gap-1">
                                            <Calendar size={12}/> Confirm Delivery Date
                                        </label>
                                        <input 
                                            type="text" 
                                            placeholder="e.g. 25-06-2026 or Delivered"
                                            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-800 outline-none focus:border-indigo-500 transition-all uppercase placeholder:text-[10px] placeholder:font-normal"
                                            value={detailForm.deliveryDate}
                                            onChange={e => setDetailForm({...detailForm, deliveryDate: e.target.value})}
                                        />
                                    </div>
                                </div>

                                <button 
                                    onClick={handleUpdateOrderDetails}
                                    className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg hover:bg-emerald-600 transition-all flex items-center justify-center space-x-2"
                                >
                                    <CheckCircle2 size={18}/> <span>Update Order Records</span>
                                </button>
                            </div>
                        </div>

                        {/* Order Item Manifest */}
                        <div className="col-span-2">
                            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
                                <div className="p-6 bg-slate-50 border-b flex justify-between items-center">
                                    <div className="flex items-center space-x-3">
                                        <Package className="text-slate-500" size={20}/>
                                        <h3 className="font-black text-slate-700 uppercase text-xs tracking-tight">Order Specifications</h3>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 border-b">
                                            <tr>
                                                <th className="px-6 py-4">#</th>
                                                <th className="px-6 py-4">Description</th>
                                                <th className="px-6 py-4 text-center">Dimensions</th>
                                                <th className="px-6 py-4 text-center">Qty</th>
                                                <th className="px-6 py-4 text-right">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {selectedOrder.items.map((item, idx) => (
                                                <tr key={idx} className={item.isSection ? 'bg-slate-50/50' : 'hover:bg-slate-50'}>
                                                    <td className="px-6 py-4 text-[10px] font-black text-slate-300">{idx+1}</td>
                                                    <td className="px-6 py-4">
                                                        <p className={`font-bold text-xs uppercase ${item.isSection ? 'text-blue-700 font-black' : 'text-slate-800'}`}>
                                                            {item.isSection ? `[SECTION] ${item.description}` : `${item.glassSize} ${item.glassType}`}
                                                        </p>
                                                        {!item.isSection && <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Processing: {item.selectedServices?.join(', ') || 'Standard'}</p>}
                                                    </td>
                                                    <td className="px-6 py-4 text-center text-xs font-mono font-bold text-slate-500">
                                                        {!item.isSection && `${item.inchW}.${item.sootW || 0} x ${item.inchH}.${item.sootH || 0}`}
                                                    </td>
                                                    <td className="px-6 py-4 text-center font-black text-slate-900">{item.qty || '-'}</td>
                                                    <td className="px-6 py-4 text-right font-black text-slate-800">{item.amount > 0 ? item.amount.toLocaleString() : '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Service Order Selection Modal */}
            {isServiceOrderModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[500]">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in duration-200 border border-slate-300">
                        <div className="px-8 py-6 bg-rose-600 text-white flex justify-between items-center shrink-0">
                            <div><h3 className="text-xl font-black uppercase">Issue Service Order</h3><p className="text-[10px] font-bold text-rose-100 uppercase tracking-widest mt-1">Vendor Billing Generation</p></div>
                            <button onClick={() => setIsServiceOrderModalOpen(false)}><X size={24}/></button>
                        </div>
                        <div className="p-8 bg-slate-50 space-y-4">
                            <p className="text-xs text-slate-500 font-bold uppercase">Select Pending Batch to Issue PO:</p>
                            {serviceOrderBatches.map((batch, idx) => (
                                <div key={idx} className="bg-white p-4 rounded-xl border hover:border-rose-300 cursor-pointer shadow-sm flex justify-between items-center" onClick={() => confirmIssueServiceOrder(batch)}>
                                    <div>
                                        <h4 className="font-black text-slate-800 uppercase">{batch.vendor}</h4>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">{batch.thickness} Tempering</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-black text-rose-600">{batch.pendingSqFt.toFixed(2)}</p>
                                        <p className="text-[9px] font-black text-slate-300 uppercase">Unbilled Sq.Ft</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SalesOrders;
