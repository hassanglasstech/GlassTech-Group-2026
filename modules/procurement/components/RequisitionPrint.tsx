import React from 'react';
import { Requisition, Company } from '@/modules/shared/types';

interface Props {
    data: Requisition;
    company: Company;
}

const RequisitionPrint: React.FC<Props> = ({ data, company }) => {
    return (
        <div className="print-only bg-white text-black p-0 font-sans leading-tight min-h-screen flex flex-col z-[99999] fixed inset-0">
            <style>{`
                @media print {
                          table { page-break-inside: auto; }
                          thead { display: table-header-group; }
                          tr { page-break-inside: avoid; }
                    @page { size: A4; margin: 10mm 12mm; }
                    body { margin: 10mm 12mm; padding: 0; }
                    html, body { height: auto !important; overflow: visible !important; background: white !important; }
                    body * { visibility: hidden; }
                    .print-only, .print-only * { visibility: visible; }
                    .print-only { display: block !important; position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; background: white !important; z-index: 99999 !important; }
                    .print-container { width: 100% !important; padding: 15mm !important; box-sizing: border-box !important; }
                    .font-pill-req { border: 2px solid #0f172a; border-radius: 9999px; padding: 6px 50px; font-weight: 900; letter-spacing: 0.2em; color: #0f172a; display: inline-block; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            `}</style>

            <div className="print-container flex-1 flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tighter text-slate-900">GlassTech</h1>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">Internal Requisition System</p>
                    </div>
                    <div className="text-right">
                        <h2 className="text-4xl font-bold tracking-tighter text-slate-900">{company}</h2>
                    </div>
                </div>

                {/* Title */}
                <div className="flex justify-center my-6">
                    <div className="font-pill-req text-sm uppercase">I N T E R N A L &nbsp; R E Q U I S I T I O N</div>
                </div>

                {/* Info Row */}
                <div className="grid grid-cols-2 gap-10 mb-8 p-6 bg-slate-50 rounded-2xl border border-slate-200">
                    <div className="space-y-3">
                        <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Requisition Category</p><p className="text-2xl font-black text-slate-900 uppercase">{data.reqType}</p></div>
                        <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Requisitioner</p><p className="text-sm font-bold uppercase text-slate-700">{data.requisitioner}</p></div>
                    </div>
                    <div className="text-right space-y-3">
                        <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">PR Number</p><p className="text-2xl font-black text-blue-700">{data.id}</p></div>
                        <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</p><p className="text-sm font-bold uppercase text-slate-700">{data.date}</p></div>
                    </div>
                </div>

                {/* Description */}
                <div className="mb-8">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Description / Header Text</p>
                    <p className="text-sm font-bold text-slate-900 uppercase p-4 border border-slate-200 rounded-xl bg-white">{data.headerText}</p>
                </div>

                {/* Dynamic Content based on Type */}
                {data.reqType === 'Material' && data.items && data.items.length > 0 && (
                    <div className="mb-8 flex-1">
                        <table className="w-full text-left border-collapse text-xs border-2 border-black">
                            <thead className="bg-slate-50 border-b-2 border-black">
                                <tr>
                                    <th className="py-2 px-3 text-center w-12 border-r border-black">#</th>
                                    <th className="py-2 px-3 border-r border-black">Item ID</th>
                                    <th className="py-2 px-3 text-center w-24 border-r border-black">Qty</th>
                                    <th className="py-2 px-3 text-right w-32 border-r border-black">Unit Price</th>
                                    <th className="py-2 px-3 text-right w-32">Total Price</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {data.items.map((item, idx) => (
                                    <tr key={item.id} className="border-b border-black">
                                        <td className="py-2 px-3 text-center font-bold border-r border-black">{idx + 1}</td>
                                        <td className="py-2 px-3 font-black uppercase border-r border-black">{item.itemId}</td>
                                        <td className="py-2 px-3 text-center font-bold border-r border-black">{item.quantity} {item.uom}</td>
                                        <td className="py-2 px-3 text-right font-bold border-r border-black">{item.unitPrice?.toLocaleString()}</td>
                                        <td className="py-2 px-3 text-right font-black">{item.totalPrice?.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {data.reqType !== 'Material' && (
                    <div className="mb-8 grid grid-cols-2 gap-6 p-6 border-2 border-black rounded-xl">
                        {data.employeeName && (
                            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Employee</p><p className="text-lg font-black text-slate-900 uppercase">{data.employeeName}</p></div>
                        )}
                        {data.loanAmount ? (
                            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Requested Amount</p><p className="text-lg font-black text-slate-900 uppercase">PKR {data.loanAmount.toLocaleString()}</p></div>
                        ) : null}
                        {data.absentDate && (
                            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Absent Date</p><p className="text-lg font-black text-slate-900 uppercase">{data.absentDate}</p></div>
                        )}
                        {data.overtimeHours ? (
                            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Overtime Hours</p><p className="text-lg font-black text-slate-900 uppercase">{data.overtimeHours} Hours</p></div>
                        ) : null}
                    </div>
                )}

                {/* Total Value */}
                <div className="flex justify-end mb-12">
                    <div className="w-64 border-2 border-black p-4 rounded-xl bg-slate-50 text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Requisition Value</p>
                        <p className="text-2xl font-black text-slate-900">PKR {data.totalValue.toLocaleString()}</p>
                    </div>
                </div>

                {/* Footer Signatures */}
                <div className="mt-auto pt-10 grid grid-cols-3 gap-10">
                    <div className="border-t-2 border-slate-900 pt-2 text-center text-[10px] font-black uppercase text-slate-500">Prepared By</div>
                    <div className="border-t-2 border-slate-900 pt-2 text-center text-[10px] font-black uppercase text-slate-500">Department Head</div>
                    <div className="border-t-2 border-slate-900 pt-2 text-center text-[10px] font-black uppercase text-slate-900">Approved By</div>
                </div>
            </div>
        </div>
    );
};

export default RequisitionPrint;
