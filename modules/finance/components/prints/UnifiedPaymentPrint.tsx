
import React from 'react';
import { PettyCashEntry, Company } from '../../../shared/types';

interface Props {
    data: PettyCashEntry;
    company: Company;
    partyName?: string; // Name of Client, Vendor, or Employee
}

export const UnifiedPaymentPrint: React.FC<Props> = ({ data, company, partyName }) => {
    const isReceipt = data.type === 'Receipt';
    const title = isReceipt ? 'OFFICIAL RECEIPT' : 'PAYMENT VOUCHER';
    const themeColor = isReceipt ? 'text-blue-700' : 'text-rose-700';
    const borderColor = isReceipt ? 'border-blue-700' : 'border-rose-700';

    return (
        <div className="print-only bg-white text-black p-0 font-sans leading-tight min-h-screen flex flex-col">
            <style>{`
                @media screen {
                    .print-only { display: none !important; }
                }
                @media print {
                    @page { size: A4; margin: 0; }
                    body { margin: 0; padding: 0; }
                    html, body { height: auto !important; overflow: visible !important; background: white !important; }
                    .print-only { 
                        display: block !important; 
                        position: absolute !important;
                        top: 0 !important;
                        left: 0 !important; 
                        width: 100% !important;
                        background: white !important;
                        z-index: 99999 !important;
                    }
                    @media print {
                        .print-only {
                            position: static !important;
                            width: 100% !important;
                        }
                        html, body { height: auto !important; overflow: visible !important; }
                    }
                    .print-container { 
                        width: 100% !important; 
                        padding: 15mm !important; 
                        box-sizing: border-box !important;
                    }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { padding: 8px; border: 1px solid #cbd5e1; }
                    .font-pill { 
                        border: 2px solid #0f172a; 
                        border-radius: 9999px; 
                        padding: 6px 40px; 
                        font-weight: 900; 
                        letter-spacing: 0.2em; 
                        text-transform: uppercase;
                    }
                }
            `}</style>
            
            <div className="print-container flex flex-col h-full">
                {/* Header */}
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tighter text-slate-900">GlassTech</h1>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">Enterprise Resource Planning</p>
                        <p className="text-[9px] font-medium text-slate-400">KORANGI INDUSTRIAL AREA, KARACHI.</p>
                    </div>
                    <div className="text-right">
                        <h2 className={`text-4xl font-bold tracking-tighter ${themeColor} uppercase`}>{company}</h2>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">Finance Department</p>
                        <p className="text-[9px] font-bold text-slate-800">Generated: {new Date().toLocaleString()}</p>
                    </div>
                </div>

                {/* Title Pill */}
                <div className="flex justify-center my-8">
                    <div className="font-pill text-sm text-slate-900">
                        {title}
                    </div>
                </div>

                {/* Transaction Metadata */}
                <div className="flex justify-between mb-8 text-[11px] border border-slate-300 p-4 rounded-xl bg-slate-50">
                    <div className="space-y-2 w-1/2 border-r border-slate-300 pr-4">
                        <div className="flex justify-between">
                            <span className="text-slate-500 font-bold uppercase tracking-wider">{isReceipt ? 'Received From' : 'Paid To'}:</span>
                            <span className="font-black text-slate-900 text-sm">{partyName || 'General Cashier'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500 font-bold uppercase tracking-wider">Transaction Type:</span>
                            <span className="font-bold text-slate-900 uppercase">{data.businessTransaction || 'Manual Entry'}</span>
                        </div>
                    </div>
                    <div className="space-y-2 w-1/2 pl-4 text-right">
                        <div className="flex justify-end space-x-4">
                            <span className="text-slate-500 font-bold uppercase tracking-wider">Document Ref:</span>
                            <span className={`font-black ${themeColor}`}>{data.id}</span>
                        </div>
                        <div className="flex justify-end space-x-4">
                            <span className="text-slate-500 font-bold uppercase tracking-wider">Posting Date:</span>
                            <span className="font-bold text-slate-900">{data.date}</span>
                        </div>
                        {data.referenceDoc && (
                            <div className="flex justify-end space-x-4">
                                <span className="text-slate-500 font-bold uppercase tracking-wider">Linked Order/Bill:</span>
                                <span className="font-bold text-slate-900">{data.referenceDoc}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Financial Table */}
                <div className="flex-1">
                    <table className="w-full text-left">
                        <thead className="bg-slate-100 text-[10px] font-black uppercase text-slate-600">
                            <tr>
                                <th className="text-center w-16">Sr #</th>
                                <th>Description / Narrative</th>
                                <th className="text-center w-32">G/L Code</th>
                                <th className="text-right w-40">Amount (PKR)</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs">
                            <tr>
                                <td className="text-center font-bold text-slate-500">01</td>
                                <td className="font-bold text-slate-800 uppercase py-4">
                                    {data.description}
                                    <div className="mt-2 text-[10px] text-slate-500 font-normal italic">
                                        {data.costCenterId ? `Cost Center: ${data.costCenterId}` : ''}
                                    </div>
                                </td>
                                <td className="text-center font-mono font-bold text-slate-600">{data.glAccountId || '-'}</td>
                                <td className="text-right font-black text-lg">{data.amount.toLocaleString()}</td>
                            </tr>
                            {/* Filler rows to push footer down if needed, or keep compact */}
                        </tbody>
                        <tfoot className={`bg-slate-50 border-t-2 ${borderColor}`}>
                            <tr>
                                <td colSpan={3} className="text-right font-black uppercase text-[10px] tracking-widest py-3">Total Amount</td>
                                <td className={`text-right font-black text-xl ${themeColor} py-3`}>{data.amount.toLocaleString()}</td>
                            </tr>
                        </tfoot>
                    </table>

                    <div className="mt-4 p-4 border border-dashed border-slate-300 rounded bg-slate-50">
                        <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Amount in Words:</p>
                        <p className="text-xs font-black text-slate-800 italic uppercase">
                            {/* Placeholder for number-to-words logic */}
                            PKR {data.amount.toLocaleString()} Only
                        </p>
                    </div>
                </div>

                {/* Footer / Signatures */}
                <div className="mt-20 border-t-2 border-slate-900 pt-8 mb-8">
                    <div className="grid grid-cols-3 gap-12 text-center">
                        <div className="flex flex-col items-center">
                            <div className="h-10 w-40 border-b border-slate-400 mb-2"></div>
                            <p className="text-[10px] font-black uppercase text-slate-500">Prepared By</p>
                            <p className="text-[9px] font-bold">{data.recordedBy || 'System User'}</p>
                        </div>
                        <div className="flex flex-col items-center">
                            <div className="h-10 w-40 border-b border-slate-400 mb-2"></div>
                            <p className="text-[10px] font-black uppercase text-slate-500">Approved By</p>
                            <p className="text-[9px] font-bold">Finance Manager</p>
                        </div>
                        <div className="flex flex-col items-center">
                            <div className="h-10 w-40 border-b border-slate-400 mb-2"></div>
                            <p className="text-[10px] font-black uppercase text-slate-500">{isReceipt ? 'Received By' : 'Received By (Payee)'}</p>
                            <p className="text-[9px] font-bold">{partyName || 'Signature'}</p>
                        </div>
                    </div>
                </div>

                <div className="text-center border-t border-slate-200 pt-2">
                    <p className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-300 italic">
                        System Generated Financial Instrument. Valid with Stamp/Signature.
                    </p>
                </div>
            </div>
        </div>
    );
};
