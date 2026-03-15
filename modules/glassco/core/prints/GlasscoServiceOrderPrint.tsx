import React, { useMemo } from 'react';
import { PurchaseOrder } from '@/modules/procurement/types/inventory';

interface Props {
    po: PurchaseOrder;
}

export const GlasscoServiceOrderPrint: React.FC<Props> = ({ po }) => {
    
    const summary = useMemo(() => {
        return {
            totalQty: po.items.reduce((acc, i) => acc + (i.qty || 0), 0),
            totalSqFt: po.items.reduce((acc, i) => acc + (i.sqFt || 0), 0),
            totalAmount: po.totalAmount
        };
    }, [po.items]);

    return (
        <div className="print-only bg-white text-black p-0 font-sans leading-tight min-h-screen flex flex-col">
            <style>{`
                @media screen { .print-only { display: none !important; } }
                @media print {
                    @page { size: A4; margin: 0; }
                    body { margin: 0; padding: 0; }
                    html, body { height: auto !important; overflow: visible !important; background: white !important; }
                    /* HIDE EVERYTHING ELSE */
                    body * { visibility: hidden; }
                    /* SHOW PRINT CONTAINER */
                    .print-only, .print-only * { visibility: visible; }
                    .print-only { 
                        display: block !important; 
                        position: absolute !important; 
                        top: 0 !important; 
                        left: 0 !important; 
                        width: 100% !important; 
                        background: white !important; 
                        z-index: 99999 !important; 
                    }
                    .print-container { width: 100% !important; padding: 15mm !important; box-sizing: border-box !important; }
                    .font-pill-service { border: 2px solid #e11d48; border-radius: 9999px; padding: 6px 50px; font-weight: 900; letter-spacing: 0.2em; color: #e11d48; }
                    .page-break-before { page-break-before: always; }
                }
            `}</style>
            
            <div className="print-container">
                {/* Header */}
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tighter text-slate-900">GlassTech</h1>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">Complete Architectural Glass Solutions</p>
                    </div>
                    <div className="text-right">
                        <h2 className="text-4xl font-bold tracking-tighter text-slate-900">GlassCo</h2>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">GLASS PROCESSING UNIT</p>
                    </div>
                </div>

                {/* Title */}
                <div className="flex justify-center my-6">
                    <div className="font-pill-service text-sm uppercase">S E R V I C E &nbsp; O R D E R</div>
                </div>

                {/* Info Row */}
                <div className="flex justify-between mb-6 text-[10px]">
                    <div className="space-y-1">
                        <p className="text-slate-400 font-bold uppercase tracking-tighter">SERVICE PROVIDER:</p>
                        <h3 className="text-2xl font-black text-slate-900 leading-none uppercase">{po.toVendor}</h3>
                        <p className="text-rose-600 font-black uppercase">Category: {po.category}</p>
                    </div>
                    <div className="text-right space-y-1">
                        <div className="flex justify-end space-x-2"><span className="text-slate-400 font-bold uppercase">PO REF:</span><span className="text-blue-700 font-black">{po.id}</span></div>
                        <div className="flex justify-end space-x-2"><span className="text-slate-400 font-bold uppercase">DATE:</span><span className="font-black text-slate-700">{po.date}</span></div>
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 mt-4">
                    {(() => {
                        // Group items by orderId
                        const groupedItems: { orderId: string, items: any[] }[] = [];
                        const orderMap = new Map<string, any[]>();
                        
                        po.items.forEach(item => {
                            const oId = item.orderId || 'General';
                            if (!orderMap.has(oId)) {
                                orderMap.set(oId, []);
                            }
                            orderMap.get(oId)!.push(item);
                        });

                        // Sort order IDs ascending
                        const sortedOrderIds = Array.from(orderMap.keys()).sort();
                        sortedOrderIds.forEach(oId => {
                            groupedItems.push({ orderId: oId, items: orderMap.get(oId)! });
                        });

                        return (
                            <table className="w-full text-left border-collapse text-[10px]">
                                <thead>
                                    <tr className="bg-slate-50 border-y border-slate-300 text-[9px] font-black uppercase tracking-widest text-slate-600">
                                        <th className="py-2.5 px-2 text-center w-10">S.No</th>
                                        <th className="py-2.5 px-2">Work Description / Size</th>
                                        <th className="py-2.5 px-2 text-center w-24">Qty</th>
                                        <th className="py-2.5 px-2 text-center w-24">Sq.Ft</th>
                                        <th className="py-2.5 px-2 text-right w-24">Rate</th>
                                        <th className="py-2.5 px-2 text-right w-28">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {groupedItems.map((group, groupIdx) => (
                                        <React.Fragment key={groupIdx}>
                                            {/* Order Header Row */}
                                            <tr className="bg-slate-100/50 border-y-2 border-slate-300">
                                                <td colSpan={6} className="py-2 px-4 font-black text-rose-700 uppercase tracking-widest text-[10px]">
                                                    Sales Order Ref: {group.orderId}
                                                </td>
                                            </tr>
                                            {/* Order Items */}
                                            {group.items.map((item, idx) => (
                                                <tr key={`${groupIdx}-${idx}`}>
                                                    <td className="py-2 px-2 text-center text-slate-400 font-bold">{idx + 1}</td>
                                                    <td className="py-2 px-2 font-bold text-slate-800 uppercase">{item.description}</td>
                                                    <td className="py-2 px-2 text-center font-black text-slate-900">{item.qty}</td>
                                                    <td className="py-2 px-2 text-center font-bold text-slate-500">{item.sqFt || '0.00'}</td>
                                                    <td className="py-2 px-2 text-right font-bold text-slate-600">{item.rate?.toLocaleString()}</td>
                                                    <td className="py-2 px-2 text-right font-black text-slate-900">{((item.sqFt || 0) * (item.rate || 0)).toLocaleString()}</td>
                                                </tr>
                                            ))}
                                            {/* Spacer Row */}
                                            {groupIdx < groupedItems.length - 1 && (
                                                <tr>
                                                    <td colSpan={6} className="py-3 border-none"></td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                                <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                                    <tr>
                                        <td colSpan={2} className="py-3 px-2 text-right font-black uppercase tracking-widest text-xs">Total Payable</td>
                                        <td className="py-3 px-2 text-center font-black text-sm">{summary.totalQty}</td>
                                        <td className="py-3 px-2 text-center font-black text-sm">{summary.totalSqFt.toFixed(2)}</td>
                                        <td></td>
                                        <td className="py-3 px-2 text-right font-black text-sm text-rose-600">PKR {(Number(summary.totalAmount) || 0).toLocaleString()}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        );
                    })()}
                </div>

                {/* Footer */}
                <div className="mt-20 grid grid-cols-3 gap-10">
                    <div className="border-t-2 border-slate-900 pt-2 text-center text-[9px] font-black uppercase text-slate-400">Production Mgr</div>
                    <div className="border-t-2 border-slate-900 pt-2 text-center text-[9px] font-black uppercase text-slate-400">Accounts Check</div>
                    <div className="border-t-2 border-slate-900 pt-2 text-center text-[9px] font-black uppercase text-slate-900 font-black">Vendor Acknowledgment</div>
                </div>
            </div>
        </div>
    );
};
