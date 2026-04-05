import React from 'react';

interface InvoicePrintProps {
  invoice: any;
  company: string;
  onClose: () => void;
}

const SalesInvoicePrint: React.FC<InvoicePrintProps> = ({ invoice, company, onClose }) => {
  const handlePrint = () => window.print();

  const subtotal   = invoice.subtotal    || invoice.totalAmount || 0;
  const gstAmount  = invoice.gstAmount   || 0;
  const gstPercent = invoice.gstPercent  || 0;
  const discount   = invoice.discountAmount || 0;
  const grandTotal = invoice.totalAmount || 0;

  const items: any[] = invoice.items || [];
  const serviceCharges: any[] = invoice.serviceCharges || [];

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-[500] p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">

        {/* Toolbar — hidden on print */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50 no-print shrink-0">
          <span className="font-black text-slate-800 uppercase text-sm tracking-widest">Invoice Preview — {invoice.id}</span>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-5 py-2 text-slate-500 font-bold text-xs uppercase border rounded-xl hover:bg-slate-100">Close</button>
            <button onClick={handlePrint} className="px-6 py-2 bg-blue-600 text-white font-bold text-xs uppercase rounded-xl hover:bg-blue-700 shadow">Print / Save PDF</button>
          </div>
        </div>

        {/* Invoice body — scrollable */}
        <div className="flex-1 overflow-y-auto bg-slate-100 p-6">
          <div className="bg-white w-[210mm] mx-auto shadow-lg" id="invoice-print">

            <style>{`
              @media print {
                @page { size: A4 portrait; margin: 12mm; }
                body * { visibility: hidden; }
                #invoice-print, #invoice-print * { visibility: visible; }
                #invoice-print { position: fixed; left: 0; top: 0; width: 100%; }
                .no-print { display: none !important; }
              }
            `}</style>

            {/* Header */}
            <div className="flex justify-between items-start px-10 pt-10 pb-6 border-b-2 border-slate-900">
              <div>
                <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">GlassTech Group</h1>
                <p className="text-xs font-bold text-blue-700 uppercase tracking-widest">{company} Business Unit</p>
                <p className="text-xs text-slate-500 mt-1">Karachi, Pakistan</p>
              </div>
              <div className="text-right">
                <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight">TAX INVOICE</h2>
                <p className="text-sm font-black text-blue-600 mt-1">{invoice.id}</p>
                <p className="text-xs text-slate-500">Date: {invoice.date}</p>
                <p className="text-xs text-slate-500">Due: {invoice.dueDate}</p>
              </div>
            </div>

            {/* Bill To */}
            <div className="px-10 py-5 grid grid-cols-2 gap-8 border-b border-slate-200">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Bill To</p>
                <p className="font-black text-slate-900 text-sm uppercase">{invoice.clientName}</p>
                {invoice.projectName && (
                  <p className="text-xs font-bold text-slate-600 mt-0.5">Project: {invoice.projectName}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Order Reference</p>
                <p className="font-bold text-xs text-slate-700">{invoice.orderNo || invoice.orderId}</p>
                <p className="text-[9px] text-slate-400 mt-1">GL Ref: {invoice.glTxId}</p>
              </div>
            </div>

            {/* Items Table */}
            <div className="px-10 py-5">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b-2 border-slate-900">
                    <th className="text-left py-2 font-black uppercase text-[9px] tracking-widest text-slate-500">#</th>
                    <th className="text-left py-2 font-black uppercase text-[9px] tracking-widest text-slate-500">Description</th>
                    <th className="text-right py-2 font-black uppercase text-[9px] tracking-widest text-slate-500">Qty</th>
                    <th className="text-right py-2 font-black uppercase text-[9px] tracking-widest text-slate-500">Rate</th>
                    <th className="text-right py-2 font-black uppercase text-[9px] tracking-widest text-slate-500">Amount (PKR)</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item: any, idx: number) => (
                    <tr key={idx} className="border-b border-slate-100">
                      <td className="py-2 text-slate-400">{idx + 1}</td>
                      <td className="py-2 text-slate-700 font-bold">
                        {item.description || item.glassType || item.profileCode || 'Item'}
                        {(item.width || item.height) && (
                          <span className="text-[9px] text-slate-400 ml-1 font-normal">
                            {item.width}×{item.height}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right text-slate-600">{item.qty || item.quantity || 1}</td>
                      <td className="py-2 text-right text-slate-600">{(item.rate || item.unitPrice || 0).toLocaleString()}</td>
                      <td className="py-2 text-right font-black text-slate-900">{(item.amount || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                  {serviceCharges.map((sc: any, idx: number) => (
                    <tr key={'sc' + idx} className="border-b border-slate-100">
                      <td className="py-2 text-slate-400">{items.length + idx + 1}</td>
                      <td className="py-2 text-slate-700 font-bold italic">{sc.description || 'Service Charge'}</td>
                      <td className="py-2 text-right text-slate-400">—</td>
                      <td className="py-2 text-right text-slate-400">—</td>
                      <td className="py-2 text-right font-black text-slate-900">{(sc.amount || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="px-10 pb-6 flex justify-end">
              <div className="w-64 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 font-bold">Subtotal</span>
                  <span className="font-bold text-slate-700">PKR {subtotal.toLocaleString()}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500 font-bold">Discount</span>
                    <span className="font-bold text-rose-600">- PKR {discount.toLocaleString()}</span>
                  </div>
                )}
                {gstAmount > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500 font-bold">GST ({gstPercent}%)</span>
                    <span className="font-bold text-slate-700">PKR {gstAmount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between border-t-2 border-slate-900 pt-2 mt-2">
                  <span className="font-black text-sm uppercase text-slate-900">Total Due</span>
                  <span className="font-black text-sm text-slate-900">PKR {grandTotal.toLocaleString()}</span>
                </div>
                {invoice.receivedAmount > 0 && (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500 font-bold">Received</span>
                      <span className="font-bold text-emerald-600">PKR {invoice.receivedAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-1">
                      <span className="font-black text-xs uppercase text-rose-700">Balance Due</span>
                      <span className="font-black text-xs text-rose-700">PKR {invoice.balance.toLocaleString()}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Status Banner */}
            {invoice.status === 'Paid' && (
              <div className="mx-10 mb-4 bg-emerald-50 border-2 border-emerald-500 rounded-xl p-3 text-center">
                <p className="font-black text-emerald-700 uppercase tracking-widest text-sm">PAID IN FULL</p>
              </div>
            )}

            {/* Footer */}
            <div className="px-10 pb-10 pt-4 border-t border-slate-200">
              <div className="flex justify-between items-end mt-12">
                <div className="text-center">
                  <div className="border-t border-slate-400 w-40 pt-2">
                    <p className="text-[9px] font-bold uppercase text-slate-400">Received By</p>
                  </div>
                </div>
                <div className="text-center text-[9px] text-slate-400 italic">
                  <p>This is a computer-generated invoice.</p>
                  <p>GlassTech Group ERP 2026</p>
                </div>
                <div className="text-center">
                  <div className="border-t border-slate-900 w-40 pt-2">
                    <p className="text-[9px] font-black uppercase text-slate-700">Authorized Signatory</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesInvoicePrint;
