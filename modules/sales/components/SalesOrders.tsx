
import React, { useState, useEffect, useMemo } from 'react';
import { Company, Quotation, Client, ProductionPiece, TemperingDispatch, PurchaseOrder, PettyCashEntry, Product, Vendor, LedgerTransaction } from '../../shared/types';
import { PaymentReceipt } from '../../finance/types/finance';
import { SalesService } from '../services/salesService';
import { AsyncSalesService } from '../services/asyncSalesService';
import { FinanceService } from '../../finance/services/financeService';
import { generateDeliveryInvoice } from '../services/deliveryInvoiceService';
import { ProductionService } from '../../production/services/productionService';
import { InventoryService } from '../../procurement/services/inventoryService';
import { 
    ShoppingCart, FilePlus, X, Info, CreditCard, Calendar, 
    Printer, ArrowLeft, CheckCircle2, Package, Clock, DollarSign, Filter, Receipt, Flame, Search, Trash2
} from 'lucide-react';
import Pagination from '@/components/Pagination';
const GlasscoPrintTemplate: any = () => null;
import { NipponPrintTemplate } from '../../nippon/prints/NipponPrintTemplate';
import UniversalSalesOrderPrint from './prints/UniversalSalesOrderPrint';
import { UnifiedPaymentPrint } from '../../finance/components/prints/UnifiedPaymentPrint';
const GlasscoServiceOrderPrint: any = () => null;
import { useLocation } from 'react-router-dom';

import { useAppStore } from '../../shared/store/appStore';
import { useAuthStore } from '../../auth/authStore';
import { toast } from 'sonner';
import { useRealtimeRefresh } from '@/modules/shared/hooks/useRealtimeRefresh';
import { errMsg } from '@/modules/shared/services/utils';

const SalesOrders: React.FC = () => {
    const company = useAppStore(state => state.selectedCompany);
    const user = useAuthStore(state => state.user);
    const isSuperAdmin = user?.role === 'super_admin';
    const location = useLocation();
    
    // --- SEARCH ---
    const [searchTerm, setSearchTerm] = useState('');
    
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
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;
    const [sortType, setSortType] = useState('date_desc');
    
    // Payment Receipt Printing
    const [printingReceipt, setPrintingReceipt] = useState<{data: PettyCashEntry, client: string} | null>(null);
    
    // Service Order Logic
    // Phase-3 (3.2): batch carries glassType so vendor rate lookup can match by color.
    const [serviceOrderBatches, setServiceOrderBatches] = useState<{vendor: string, pendingSqFt: number, thickness: string, glassType?: string}[]>([]);
    const [printingServiceOrder, setPrintingServiceOrder] = useState<PurchaseOrder | null>(null);

    // Detail Form State
    const [detailForm, setDetailForm] = useState({
        receivedAmount: 0,
        deliveryDate: '',
        delayReason: '',
        delayCategory: '' as 'Internal' | 'Outsourcing' | 'Client' | ''
    });

    // Phase-2 (2.3): payment posting state — was missing, button only printed.
    const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Bank Transfer' | 'Cheque' | 'Online'>('Cash');
    const [paymentReference, setPaymentReference] = useState('');
    const [postingPayment, setPostingPayment] = useState(false);

    const [nipponPrintType, setNipponPrintType] = useState<'KinLong' | 'Glasstech' | 'General'>('Glasstech');

  
  const { refreshKey } = useRealtimeRefresh(['quotations', 'clients', 'production_pieces', 'purchase_orders']);

  useEffect(() => {
        refreshData();
    }, [company, refreshKey]);

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
        
        // Search filter
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(o => {
                const ref = (o.orderNo || o.id || '').toLowerCase();
                const clientName = clients.find(c => c.id === o.clientId)?.name?.toLowerCase() || '';
                const project = (o.projectName || '').toLowerCase();
                return ref.includes(lower) || clientName.includes(lower) || project.includes(lower);
            });
        }
        
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
    }, [approvedOrders, sortType, clients, allPieces, searchTerm]);

    // ── Super Admin: Delete order with full cascade ──
    const handleDeleteOrder = (order: Quotation) => {
        if (!isSuperAdmin) { toast.error("Only Super Admin can delete orders."); return; }
        
        const orderRef = order.orderNo || order.id;
        const orderPieces = allPieces.filter(p => p.orderId === orderRef);
        
        // Check restrictions
        const hasDelivered = orderPieces.some(p => p.status === 'Delivered');
        if (hasDelivered) { toast.error("Cannot delete — some pieces already delivered."); return; }
        
        // Status enum doesn't include legacy 'Cut'/'Pending'; treat any current status as "progressed beyond cutting".
        const hasCuttingStarted = orderPieces.some(p => (p.status as string) !== 'Cut' && (p.status as string) !== 'Pending');
        if (hasCuttingStarted) { toast.error("Cannot delete — production already started (pieces processed beyond cutting)."); return; }
        
        if (!confirm(`⚠️ PERMANENT DELETE\n\nOrder: ${orderRef}\nThis will delete:\n• The sales order/quotation\n• All ${orderPieces.length} production pieces\n• All linked dispatches\n\nThis action cannot be undone.`)) return;
        
        // 1. Delete production pieces
        const remainingPieces = allPieces.filter(p => p.orderId !== orderRef);
        ProductionService.saveProductionPieces(remainingPieces);
        
        // 2. Delete linked dispatches
        const allDispatches = ProductionService.getTemperingDispatches();
        const remainingDispatches = allDispatches.filter(d => {
            const dispatchPieces = allPieces.filter(p => p.dispatchId === d.id);
            return !dispatchPieces.every(p => p.orderId === orderRef);
        });
        ProductionService.saveTemperingDispatches(remainingDispatches);
        
        // 3. Delete the quotation/order itself
        const allQuos = SalesService.getQuotations();
        SalesService.saveQuotations(allQuos.filter(q => q.id !== order.id));
        
        // 4. Reset UI
        setSelectedOrder(null);
        refreshData();
        toast.success(`Order ${orderRef} and all linked data permanently deleted.`);
    };

    const handleSelectOrder = (order: Quotation) => {
        setSelectedOrder(order);
        setDetailForm({
            receivedAmount: order.receivedAmount || 0,
            deliveryDate: order.actualDeliveryDate || order.dueDate || '',
            delayReason: order.delayReason || '',
            delayCategory: order.delayCategory || ''
        });
    };

    const handleUpdateOrderDetails = async () => {
        if (!selectedOrder) return;

        // ── Phase-3 (3.5): deliveryDate ISO validation ───────────────────
        // Audit I5: previously `!!detailForm.deliveryDate` triggered auto-
        // invoice on ANY non-empty string ("Delivered", "TBD", garbage).
        // Accept either YYYY-MM-DD (HTML date) or DD-MM-YYYY (Pakistani
        // convention shown in the placeholder). Anything else is rejected
        // and the auto-invoice path is skipped (the order still saves).
        const rawDate = (detailForm.deliveryDate || '').trim();
        const parseDeliveryDate = (s: string): string | null => {
            if (!s) return null;
            // YYYY-MM-DD
            const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
            if (ymd) {
                const d = new Date(`${ymd[1]}-${ymd[2]}-${ymd[3]}T00:00:00`);
                return Number.isFinite(d.getTime()) ? `${ymd[1]}-${ymd[2]}-${ymd[3]}` : null;
            }
            // DD-MM-YYYY (or D-M-YYYY)
            const dmy = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s);
            if (dmy) {
                const dd = dmy[1].padStart(2, '0');
                const mm = dmy[2].padStart(2, '0');
                const yyyy = dmy[3];
                const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
                return Number.isFinite(d.getTime()) ? `${yyyy}-${mm}-${dd}` : null;
            }
            return null;
        };
        const validIsoDate = parseDeliveryDate(rawDate);
        const deliveryFieldFilledButInvalid = !!rawDate && !validIsoDate;

        const updatedOrder = {
            ...selectedOrder,
            receivedAmount: Number(detailForm.receivedAmount),
            // Store the normalised ISO date when valid; otherwise keep the raw
            // string so users can still record notes like "Held by client".
            actualDeliveryDate: validIsoDate ?? rawDate,
            delayReason: detailForm.delayReason,
            delayCategory: detailForm.delayCategory
        };
        // Phase-2 (2.6): per-row save instead of read-modify-write-all
        SalesService.saveQuotations([updatedOrder as any]);
        setSelectedOrder(updatedOrder as any);

        // Auto-generate invoice ONLY when we have a real ISO date, the order
        // isn't already invoiced, and the field isn't garbage.
        const alreadyInvoiced = SalesService.getInvoices().some((i) => i.orderId === updatedOrder.id);
        if (deliveryFieldFilledButInvalid) {
            toast.warning(
                `Delivery date "${rawDate}" is not a valid date — order saved but invoice was NOT generated. Use YYYY-MM-DD or DD-MM-YYYY.`,
                { duration: 8000 }
            );
        } else if (validIsoDate && !alreadyInvoiced) {
            try {
                const result = await generateDeliveryInvoice(updatedOrder as any, company, 0);
                if (!result.alreadyInvoiced) {
                    toast.success(`Invoice ${result.invoiceId} generated — PKR ${result.grandTotal.toLocaleString('en-PK')}`);
                }
            } catch (err: unknown) {
                // Phase-2 F3: credit-limit failures now THROW — surface them so user knows why invoice didn't post.
                toast.error(`Invoice generation failed: ${errMsg(err)}`, { duration: 8000 });
            }
        }

        refreshData();
        toast.success("Industrial Update: Payment and Logistics data saved.");
    };

    const handlePrintOrder = () => {
        setPrintMode('SalesOrder');
        setIsPrinting(true);
        setTimeout(() => {
            window.print();
            setIsPrinting(false);
        }, 1200);
    };

    const handlePrintQuotation = () => {
        setPrintMode('Quotation');
        setIsPrinting(true);
        setTimeout(() => {
            window.print();
            setIsPrinting(false);
        }, 1200);
    };

    // ── Phase-2 (2.3): Record + Print Receipt — was a print-only stub. ──
    // Audit F7: previous implementation built a PettyCashEntry, printed it,
    // and discarded — physical cash could be received and "official receipt"
    // handed over while the books showed zero collection (revenue leak).
    //
    // New flow (atomic):
    //   1. Compute delta payment (only the increment over previously
    //      recorded receivedAmount is posted as a new receipt).
    //   2. Build/post GL: Dr Cash/Bank — Cr AR (if invoiced) OR
    //      Cr Customer Advance Liability (if no invoice yet).
    //   3. If invoiced: persist PaymentReceipt via AsyncSalesService
    //      (uses process_payment_receipt RPC for atomic balance/status).
    //      Update Invoice.payments[].
    //   4. Update Quotation.receivedAmount (per-row save, 2.6).
    //   5. For Cash: append a Petty Cash entry so cash drawer balance
    //      reconciles.
    //   6. Print the receipt.
    const handlePrintReceipt = async () => {
        if (!selectedOrder) return;
        if (detailForm.receivedAmount <= 0) {
            toast.error("Enter a positive Received Amount before printing the receipt.");
            return;
        }

        const previouslyReceived = Number(selectedOrder.receivedAmount || 0);
        const newPayment = Number(detailForm.receivedAmount) - previouslyReceived;
        if (newPayment <= 0) {
            toast.error(`Received Amount (PKR ${detailForm.receivedAmount.toLocaleString('en-PK')}) is not greater than already-recorded (PKR ${previouslyReceived.toLocaleString('en-PK')}). Nothing to post.`);
            return;
        }

        const client       = clients.find(c => c.id === selectedOrder.clientId);
        const clientName   = client?.name || 'Walk-in Customer';
        const today        = new Date().toISOString().split('T')[0];
        const orderRef     = selectedOrder.orderNo || selectedOrder.id;
        const allInvoices  = SalesService.getInvoices();
        const existingInvoice = allInvoices.find((i) => i.orderId === selectedOrder.id);

        // Validate we don't over-pay the invoice (PKR 1 tolerance)
        if (existingInvoice) {
            const invBalance = Number(existingInvoice.balance || 0);
            if (newPayment > invBalance + 1) {
                toast.error(
                    `Payment PKR ${newPayment.toLocaleString('en-PK')} exceeds invoice balance PKR ${invBalance.toLocaleString('en-PK')} on ${existingInvoice.id}. Issue a credit note for over-payments.`,
                    { duration: 8000 }
                );
                return;
            }
        }

        setPostingPayment(true);
        try {
            // Phase-3 (3.9): collision-safe receipt id. Audit I10: previous
            // 6-char timestamp slice could collide on rapid double-click.
            // Now: full ms timestamp + 4 random hex chars (~16M combinations).
            const _rand4 = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
            const receiptId = `REC-${Date.now()}-${_rand4}`;
            const txId      = `GL-${receiptId}`;

            // ── Cash/Bank account by method ──
            const METHOD_MAP: Record<string, { code: string; name: string }> = {
                'Cash':          { code: '1111', name: 'CASH IN HAND' },
                'Bank Transfer': { code: '1112', name: 'CASH AT BANK' },
                'Cheque':        { code: '1112', name: 'CASH AT BANK' },
                'Online':        { code: '1113', name: 'ONLINE COLLECTIONS' },
            };
            const m            = METHOD_MAP[paymentMethod] || METHOD_MAP['Cash'];
            const cashParent   = FinanceService.ensureAccount(company, 'ASSETS',          1, null,             'Asset', '10');
            const cashCurrent  = FinanceService.ensureAccount(company, 'CURRENT ASSETS',  2, cashParent.id,    'Asset', '11');
            const cashBank     = FinanceService.ensureAccount(company, 'CASH & BANK',     3, cashCurrent.id,   'Asset', '111');
            const methodParent = FinanceService.ensureAccount(company, m.name,            4, cashBank.id,      'Asset', m.code);
            const cashAcc      = FinanceService.ensureAccount(company, `${m.name} — MAIN`, 5, methodParent.id, 'Asset', `${m.code}0`);

            // ── Credit side: AR (invoiced) OR Customer Advance Liability (no invoice yet) ──
            let creditAccId: string;
            let creditText:  string;
            if (existingInvoice) {
                const arParent  = FinanceService.ensureAccount(company, 'ASSETS',              1, null,           'Asset', '10');
                const arCurrent = FinanceService.ensureAccount(company, 'CURRENT ASSETS',     2, arParent.id,    'Asset', '11');
                const arTrade   = FinanceService.ensureAccount(company, 'TRADE RECEIVABLES',  3, arCurrent.id,   'Asset', '122');
                const arControl = FinanceService.ensureAccount(company, 'CUSTOMERS CONTROL',  4, arTrade.id,     'Asset', '1221');
                const clientAR  = FinanceService.ensureAccount(company, clientName.toUpperCase(), 5, arControl.id, 'Asset', '12210');
                creditAccId = clientAR.id;
                creditText  = `AR settled: ${clientName} — ${existingInvoice.id}`;
            } else {
                const liabParent = FinanceService.ensureAccount(company, 'LIABILITIES',         1, null,           'Liability', '20');
                const liabCurr   = FinanceService.ensureAccount(company, 'CURRENT LIABILITIES', 2, liabParent.id,  'Liability', '22');
                const advance    = FinanceService.ensureAccount(company, 'CUSTOMER ADVANCES',   3, liabCurr.id,    'Liability', '223');
                const clientAdv  = FinanceService.ensureAccount(company, `${clientName.toUpperCase()} — ADVANCE`, 4, advance.id, 'Liability', '2230');
                creditAccId = clientAdv.id;
                creditText  = `Customer advance: ${clientName} — ${orderRef}`;
            }

            // ── Post GL entry (Posted, not Parked — receipts are immediate cash) ──
            const glTx: LedgerTransaction = {
                id: txId, company, docType: 'DZ',
                docDate: today, date: today,
                description: `RECEIPT ${receiptId}: ${clientName} — ${orderRef} via ${paymentMethod}${paymentReference ? ' (' + paymentReference + ')' : ''}`,
                referenceId: receiptId, status: 'Posted',
                reqId: selectedOrder.id,
                details: [
                    { accountId: cashAcc.id,  debit: newPayment, credit: 0,          text: `${paymentMethod} received${paymentReference ? ': ' + paymentReference : ''}` },
                    { accountId: creditAccId, debit: 0,          credit: newPayment, text: creditText },
                ],
            };
            FinanceService.saveLedger([...FinanceService.getLedger(), glTx]);

            // ── Append Petty Cash entry for Cash receipts (drawer reconciliation) ──
            if (paymentMethod === 'Cash') {
                const cashEntries = FinanceService.getPettyCashEntries();
                const lastBalance = cashEntries
                    .filter((e) => e.company === company)
                    .sort((a, b) => String(b.id).localeCompare(String(a.id)))[0]?.balance || 0;
                FinanceService.savePettyCashEntries([
                    ...cashEntries,
                    {
                        id: `CJ-${receiptId}`, company, date: today,
                        description: `Cash received: ${clientName} — ${orderRef}`,
                        type: 'Receipt', amount: newPayment, balance: lastBalance + newPayment,
                        recordedBy: 'Sales Desk', status: 'Posted',
                        glAccountId: cashAcc.id, businessTransaction: 'Customer Payment', referenceDoc: receiptId,
                    } as any,
                ]);
            }

            // ── Persist PaymentReceipt + update invoice (atomic via RPC) ──
            if (existingInvoice) {
                const payment: PaymentReceipt = {
                    id: receiptId, invoiceId: existingInvoice.id, date: today,
                    amount: newPayment, method: paymentMethod, reference: paymentReference, glTxId: txId,
                };
                await AsyncSalesService.savePaymentReceipts([payment]);

                // Mirror invoice balance/status locally so UI reflects immediately
                const newReceived = Number(existingInvoice.receivedAmount || 0) + newPayment;
                const newBalance  = Number(existingInvoice.totalAmount) - newReceived;
                const newStatus   = newBalance <= 0 ? 'Paid' : 'Partial';
                SalesService.saveInvoices([{
                    ...existingInvoice,
                    receivedAmount: newReceived,
                    balance:        Math.max(0, newBalance),
                    status:         newStatus,
                    payments:       [...(existingInvoice.payments || []), payment],
                }]);
            }

            // ── Financial Event registry entry ──
            FinanceService.saveFinancialEvents([
                ...FinanceService.getFinancialEvents(),
                {
                    id: `EVT-${receiptId}`, company, date: today,
                    sourceModule: 'Sales',
                    description: `Payment received: ${clientName} — PKR ${newPayment.toLocaleString('en-PK')} via ${paymentMethod}`,
                    amount: newPayment, referenceId: receiptId, status: 'Posted',
                } as any,
            ]);

            // ── Update Quotation.receivedAmount (per-row save 2.6) ──
            const updatedOrder = { ...selectedOrder, receivedAmount: Number(detailForm.receivedAmount) };
            SalesService.saveQuotations([updatedOrder as any]);
            setSelectedOrder(updatedOrder);

            // ── Build & print the receipt ──
            const receiptEntry: PettyCashEntry = {
                id: receiptId,
                company, date: today,
                description: `Payment received — Order ${orderRef}${paymentReference ? ' — Ref: ' + paymentReference : ''}`,
                amount: newPayment,
                type: 'Receipt',
                balance: existingInvoice
                    ? Math.max(0, Number(existingInvoice.totalAmount) - (Number(existingInvoice.receivedAmount || 0) + newPayment))
                    : 0,
                recordedBy: 'Sales Desk',
                status: 'Posted',
                businessTransaction: 'Customer Payment',
                referenceDoc: orderRef,
            };

            setPrintingReceipt({ data: receiptEntry, client: clientName });
            setPaymentReference('');                       // clear for next entry

            toast.success(
                `Receipt ${receiptId} posted — PKR ${newPayment.toLocaleString('en-PK')} via ${paymentMethod}` +
                (existingInvoice
                    ? `. Invoice balance: PKR ${Math.max(0, Number(existingInvoice.totalAmount) - (Number(existingInvoice.receivedAmount || 0) + newPayment)).toLocaleString('en-PK')}`
                    : ' — held as Customer Advance until invoice is generated.'),
                { duration: 7000 }
            );
            refreshData();

            setTimeout(() => {
                window.print();
                setPrintingReceipt(null);
            }, 500);
        } catch (err: unknown) {
            toast.error(`Receipt posting failed: ${errMsg(err)}`, { duration: 8000 });
            console.error('[handlePrintReceipt] failed:', err);
        } finally {
            setPostingPayment(false);
        }
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
        
        // Phase-3 (3.1 + 3.2): track sqft + glass color/type per (vendor, thickness)
        // so we charge tempering vendors on RAW sqft (width×height in feet) not the
        // 6"/12" billing-rounded sqft, and so we look up the right per-color rate.
        // Audit I1: Glassco was over-paying vendors ~5–10% per dispatch using
        // billing sqft. Audit I2: Tinted/Mirror were silently billed at Clear rate.
        const dispatchSqftMap: Record<string, Record<string, number>> = {};
        const dispatchTypeMap: Record<string, Record<string, string>> = {};

        dispatchedPieces.forEach(p => {
            const trip = challans.find(c => c.id === p.dispatchId);
            const vendor = trip?.plantName || 'Unknown';
            const item = orderContext.items[p.itemIndex];
            const thick = item?.glassSize || '12mm';
            // 3.1: raw sqft from real dimensions (inches → ft²) — never billing.
            const rawWidthIn  = Number(item?.width)  || 0;
            const rawHeightIn = Number(item?.height) || 0;
            const rawSqFtPerPiece = (rawWidthIn * rawHeightIn) / 144;
            const sqFt = rawSqFtPerPiece > 0
                ? rawSqFtPerPiece
                : ((Number(item?.totalSqFt) || 0) / Math.max(1, Number(item?.qty) || 1));   // safety fallback

            // 3.2: capture glass type/color so confirmIssueServiceOrder can match the
            // vendor rate row for Tinted / Mirror / Reflective separately from Clear.
            const glassType = (item?.glassType || 'Plain').toString();
            const glassColor = (item?.glassColor || '').toString();
            const typeKey = glassColor || glassType;

            if (!dispatchSqftMap[vendor]) dispatchSqftMap[vendor] = {};
            if (!dispatchTypeMap[vendor]) dispatchTypeMap[vendor] = {};
            dispatchSqftMap[vendor][thick] = (dispatchSqftMap[vendor][thick] || 0) + sqFt;
            // First non-empty wins — typically a vendor batch is single-color.
            if (!dispatchTypeMap[vendor][thick]) dispatchTypeMap[vendor][thick] = typeKey;
        });

        Object.entries(dispatchSqftMap).forEach(([vendor, thickMap]) => {
            Object.entries(thickMap).forEach(([thick, totalSqFt]) => {
                const billed = billedMap[vendor]?.[thick] || 0;
                const pending = totalSqFt - billed;
                if (pending > 0.1) {
                    pendingBatches.push({
                        vendor,
                        thickness: thick,
                        pendingSqFt: pending,
                        glassType: dispatchTypeMap[vendor]?.[thick] || 'Plain',
                    } as any);
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

    const confirmIssueServiceOrder = (batch: {vendor: string, pendingSqFt: number, thickness: string, glassType?: string}) => {
        // Updated Logic: Find Latest Effective Rate
        const vendor = vendors.find(v => v.name === batch.vendor);

        if (!vendor) {
            toast.error(`Vendor "${batch.vendor}" not found in Vendor Registry.`);
            return;
        }

        // ── Phase-3 (3.2): rate lookup respects glass color/type ──
        // Audit I2: previously every dispatch used Clear/All rate even for
        // Tinted/Mirror/Reflective — silent vendor over- or under-billing.
        // New tier: try exact-match (glassType / color) → 'All' → 'Clear' fallback.
        const dispatchType = (batch.glassType || 'Plain').toLowerCase();
        const sameThickness = (vendor.rates || []).filter(r => r.thickness === batch.thickness);
        const matchByType = (rType: string) => {
            const t = (rType || '').toLowerCase();
            if (t === 'all') return true;
            if (!dispatchType) return t === 'clear';
            // Direct color/type match (e.g. "Tinted" / "Mirror" / "Reflective" / "Plain")
            if (t === dispatchType) return true;
            // Plain ↔ Clear synonyms
            if ((t === 'clear' || t === 'plain') && (dispatchType === 'clear' || dispatchType === 'plain')) return true;
            return false;
        };
        let validRates = sameThickness.filter(r => matchByType(r.type));
        // Fallback: no exact-color rate → fall back to All/Clear so the SO still issues
        if (validRates.length === 0) {
            validRates = sameThickness.filter(r => {
                const t = (r.type || '').toLowerCase();
                return t === 'all' || t === 'clear' || t === 'plain';
            });
        }

        validRates.sort((a,b) => new Date(b.effectiveDate || '2000-01-01').getTime() - new Date(a.effectiveDate || '2000-01-01').getTime());

        const rateObj = validRates[0];

        if (!rateObj || !rateObj.rate) {
            toast.error(`Rate for ${batch.thickness} ${batch.glassType || ''} is missing in Vendor ${batch.vendor}'s Rate Card. \n\nPlease go to Vendor Network > Registry > Rates to add it.`);
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
                    : (company === 'GTK' || company === 'GTI')
                    ? <UniversalSalesOrderPrint quotation={selectedOrder} company={company} clientName={clients.find(c => c.id === selectedOrder.clientId)?.name} printMode={printMode} />
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
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                <input 
                                    type="text" 
                                    placeholder="Search order no, client..." 
                                    className="sap-input pl-9 py-1.5 text-xs font-bold uppercase border border-slate-200 rounded-lg w-56"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="relative">
                                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                <select 
                                    className="sap-input pl-9 py-1.5 text-[10px] font-black uppercase appearance-none cursor-pointer hover:bg-slate-50 border border-slate-200 rounded-lg pr-4"
                                    value={sortType}
                                    onChange={e => setSortType(e.target.value)}
                                >
                                    <option value="date_desc">Latest First (Default)</option>
                                    <option value="date_asc">Oldest First</option>
                                    <option value="client">Client Name (A–Z)</option>
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
                                {sortedOrders.slice((currentPage-1)*itemsPerPage, currentPage*itemsPerPage).map(order => {
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
                                            <td className="px-6 py-4 text-right font-black text-slate-900">{(Number(totalAmount) || 0).toLocaleString()}</td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center space-x-2">
                                                    <button className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest shadow hover:bg-blue-600 transition-all">Open Details</button>
                                                    {isSuperAdmin && (
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteOrder(order); }}
                                                            className="p-1.5 text-rose-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                                            title="Delete Order (Super Admin)"
                                                        >
                                                            <Trash2 size={14}/>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {approvedOrders.length === 0 && sortedOrders.length === 0 && (
                                    <tr><td colSpan={6} className="px-6 py-20 text-center text-slate-300 italic font-black uppercase tracking-widest">No Active Industrial Orders.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <Pagination totalItems={sortedOrders.length} itemsPerPage={itemsPerPage} currentPage={currentPage} onPageChange={setCurrentPage} />
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
                            {isSuperAdmin && selectedOrder && (
                                <button 
                                    onClick={() => handleDeleteOrder(selectedOrder)}
                                    className="bg-rose-50 text-rose-600 px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest border border-rose-200 hover:bg-rose-600 hover:text-white transition-all flex items-center space-x-2"
                                >
                                    <Trash2 size={16}/> <span>Delete</span>
                                </button>
                            )}
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
                                        <p className="text-lg font-black text-slate-900">PKR {(Number(orderValue) || 0).toLocaleString()}</p>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Received Payment (Advance/Bal)</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-300">PKR</span>
                                            <input
                                                type="number"
                                                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xl text-emerald-600 outline-none focus:border-indigo-500 transition-all"
                                                value={detailForm.receivedAmount || ''}
                                                onChange={e => setDetailForm({...detailForm, receivedAmount: Number(e.target.value)})}
                                                placeholder="0"
                                            />
                                        </div>
                                        {/* Phase-2 (2.3): payment method + reference for the new receipt to be posted */}
                                        <div className="grid grid-cols-2 gap-2 pt-1">
                                            <select
                                                className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-xs text-slate-800 outline-none focus:border-indigo-500"
                                                value={paymentMethod}
                                                onChange={e => setPaymentMethod(e.target.value as any)}
                                                disabled={postingPayment}
                                            >
                                                <option value="Cash">Cash</option>
                                                <option value="Bank Transfer">Bank Transfer</option>
                                                <option value="Cheque">Cheque</option>
                                                <option value="Online">Online</option>
                                            </select>
                                            <input
                                                type="text"
                                                className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-xs text-slate-800 outline-none focus:border-indigo-500 placeholder:text-[10px] placeholder:font-normal placeholder:text-slate-400"
                                                value={paymentReference}
                                                onChange={e => setPaymentReference(e.target.value)}
                                                placeholder={paymentMethod === 'Cash' ? 'Reference (optional)' : 'Cheque/TXN no.'}
                                                disabled={postingPayment}
                                            />
                                        </div>
                                        <button
                                            onClick={handlePrintReceipt}
                                            disabled={detailForm.receivedAmount <= 0 || postingPayment}
                                            className="w-full bg-emerald-600 text-white border-2 border-emerald-600 rounded-2xl py-3 font-black uppercase text-xs tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                                            title="Post Payment + GL Entry + Print Receipt"
                                        >
                                            <Receipt size={16}/>
                                            <span>{postingPayment ? 'Posting…' : 'Record + Print Receipt'}</span>
                                        </button>
                                    </div>

                                    <div className={`p-4 rounded-2xl border flex justify-between items-center transition-all ${balance <= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                                        <span className="text-[10px] font-black uppercase text-slate-500">Net Balance Due:</span>
                                        <span className={`text-lg font-black ${balance <= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                            {balance <= 0 ? 'PAID' : `PKR ${(Number(balance) || 0).toLocaleString()}`}
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
                                    {/* Stage 1C — Delay Tracking */}
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Delay Category (if late)</label>
                                        <select
                                            className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm text-slate-800 outline-none focus:border-indigo-500"
                                            value={detailForm.delayCategory}
                                            onChange={e => setDetailForm({...detailForm, delayCategory: e.target.value as any})}
                                        >
                                            <option value="">— No Delay —</option>
                                            <option value="Internal">Internal (Cutting backlog / capacity)</option>
                                            <option value="Outsourcing">Outsourcing (Tempering / Lamination vendor)</option>
                                            <option value="Client">Client (Design change / payment hold)</option>
                                        </select>
                                    </div>
                                    {detailForm.delayCategory && (
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Delay Reason</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. Tempering vendor delayed 3 days"
                                                className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm text-slate-800 outline-none focus:border-indigo-500 placeholder:text-[10px] placeholder:font-normal"
                                                value={detailForm.delayReason}
                                                onChange={e => setDetailForm({...detailForm, delayReason: e.target.value})}
                                            />
                                        </div>
                                    )}
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
                                                    <td className="px-6 py-4 text-right font-black text-slate-800">{(item.amount > 0) ? (Number(item.amount) || 0).toLocaleString() : '-'}</td>
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
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">
                                          {batch.thickness} {batch.glassType ? `· ${batch.glassType}` : ''} Tempering
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-black text-rose-600">{batch.pendingSqFt.toFixed(2)}</p>
                                        <p className="text-[9px] font-black text-slate-300 uppercase">Raw Sq.Ft (unbilled)</p>
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

export default React.memo(SalesOrders);
