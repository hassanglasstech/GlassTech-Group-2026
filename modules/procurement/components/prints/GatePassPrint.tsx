import React from 'react';
import type { Company, TemperingDispatch, ProductionPiece } from '@/modules/shared/types';

interface Props {
  dispatch: TemperingDispatch;
  pieces: ProductionPiece[];
  company: Company;
}

/**
 * GatePassPrint — reusable A4 gate pass. Extracted verbatim (behaviour-neutral)
 * from the inline template in DispatchPlanner so the Tempering Dispatch-Out
 * screen can print a gate pass without duplicating markup. Self-contained
 * @media-print CSS (isolates itself via the `.print-only` visibility toggle) —
 * mount ONE print component at a time before window.print().
 */
export const GatePassPrint: React.FC<Props> = ({ dispatch, pieces, company }) => {
  const allGatePassPieces = pieces.filter(p => p.dispatchId === dispatch.id);
  const MAX_ROWS = 25;
  const chunks: ProductionPiece[][] = [];
  let currentChunk: ProductionPiece[] = [];
  allGatePassPieces.forEach((p, index) => {
    currentChunk.push(p);
    if (currentChunk.length === MAX_ROWS && index < allGatePassPieces.length - 1) {
      chunks.push(currentChunk);
      currentChunk = [];
    }
  });
  if (currentChunk.length > 0) chunks.push(currentChunk);

  return (
    <div className="print-only bg-white text-black p-0 font-sans leading-tight min-h-screen flex flex-col">
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm 12mm; }
          body { margin: 10mm 12mm; padding: 0; }
          html, body { height: auto !important; overflow: visible !important; background: white !important; }
          body * { visibility: hidden; }
          .print-only, .print-only * { visibility: visible; }
          .print-only { display: block !important; position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; background: white !important; z-index: 99999 !important; }
          .print-container { width: 100% !important; padding: 8mm !important; box-sizing: border-box !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .bg-slate-50 { background-color: #f8fafc !important; }
          .bg-slate-100 { background-color: #f1f5f9 !important; }
          table { page-break-inside: auto; width: 100%; border-collapse: collapse; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          .page-break-before { page-break-before: always; }
        }
        .font-pill-gp { border: 2px solid #0f172a; border-radius: 9999px; padding: 6px 50px; font-weight: 900; letter-spacing: 0.2em; color: #0f172a; }
      `}</style>

      <div className="print-container">
        <div className="mb-6 pb-4 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold tracking-tighter text-slate-900">GlassTech</h1>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">Security &amp; Gate Division</p>
          </div>
          <div className="text-right">
            <h2 className="text-4xl font-bold tracking-tighter text-slate-900">{company}</h2>
          </div>
        </div>

        <div className="flex justify-center my-6">
          <div className="font-pill-gp text-sm uppercase">G A T E &nbsp; P A S S</div>
        </div>

        <div className="grid grid-cols-2 gap-10 mb-8 p-6 bg-slate-50 rounded-2xl border">
          <div className="space-y-3">
            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Authorized Transport</p><p className="text-2xl font-black text-slate-900">{dispatch.vehicleNo}</p></div>
            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Driver Identity</p><p className="text-sm font-bold uppercase text-slate-700">{dispatch.driverName}</p></div>
          </div>
          <div className="text-right space-y-3">
            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pass Registry ID</p><p className="text-2xl font-black text-blue-700">GP-{dispatch.id.slice(-6)}</p></div>
            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vendor / Plant</p><p className="text-sm font-bold uppercase text-slate-700">{dispatch.plantName}</p></div>
          </div>
        </div>

        <div className="mb-10 flex-1">
          <h3 className="text-[10px] font-black uppercase text-slate-900 mb-4 border-b-2 border-slate-900 pb-2 tracking-widest">Consolidated Material Load Summary</h3>
          {chunks.map((chunk, chunkIdx) => (
            <div key={chunkIdx} className={chunkIdx > 0 ? 'page-break-before mt-8' : ''}>
              <table className="w-full text-left text-[10px] border border-slate-300">
                <thead className="bg-slate-100 font-black">
                  <tr className="border-b border-slate-300">
                    <th className="w-10 border-r p-2 text-center">Sr.</th>
                    <th className="border-r p-2">Material / Piece Description</th>
                    <th className="border-r p-2">Ref Order</th>
                    <th className="p-2 text-center w-16">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {chunk.map((p, idx) => (
                    <tr key={p.id} className="border-b border-slate-200">
                      <td className="border-r p-2 text-center font-bold text-slate-400">{chunkIdx * MAX_ROWS + idx + 1}</td>
                      <td className="border-r p-2 font-bold uppercase text-slate-800">{p.specs || p.id}</td>
                      <td className="border-r p-2 uppercase text-blue-600 font-black">{p.orderId}</td>
                      <td className="p-2 text-center font-black">1</td>
                    </tr>
                  ))}
                </tbody>
                {chunkIdx === chunks.length - 1 && (
                  <tfoot className="bg-slate-50 font-black">
                    <tr>
                      <td colSpan={3} className="p-2 text-right uppercase tracking-widest">Total Manifest Units:</td>
                      <td className="p-2 text-center bg-slate-900 text-white text-sm">{allGatePassPieces.length}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          ))}
        </div>

        <div className="mt-auto grid grid-cols-3 gap-10 text-center break-inside-avoid">
          <div className="border-t-2 border-slate-900 pt-2"><p className="text-[10px] font-black uppercase text-slate-400">Security Officer</p></div>
          <div className="border-t-2 border-slate-900 pt-2"><p className="text-[10px] font-black uppercase text-slate-400">Store Incharge</p></div>
          <div className="border-t-2 border-slate-900 pt-2"><p className="text-[10px] font-black uppercase text-slate-900">Carrier Dispatch</p></div>
        </div>
      </div>
    </div>
  );
};

export default GatePassPrint;
