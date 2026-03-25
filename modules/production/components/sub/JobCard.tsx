import React from 'react';
import { ProductionPiece, Quotation, WarehouseSpot } from '@/modules/shared/types';
import { MapPin } from 'lucide-react';

interface JobCardProps {
  piece: ProductionPiece;
  jobOrder?: Quotation;
  spot?: WarehouseSpot;
  onBinClick: (e: React.MouseEvent) => void;
  actionRenderer: () => React.ReactNode;
}

const JobCard: React.FC<JobCardProps> = ({ piece, jobOrder, spot, onBinClick, actionRenderer }) => {
  const item = jobOrder?.items[piece.itemIndex];
  const displayId = piece.id;

  return (
    <div className="bg-white p-3 sm:p-4 rounded-xl border-2 shadow-sm relative group transition-all flex flex-col justify-between text-center border-slate-200 hover:border-blue-300 active:scale-[0.98]">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-black uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{displayId}</span>
        <button
          onClick={onBinClick}
          className={`flex items-center space-x-1 px-2 py-1 rounded text-[10px] font-black uppercase min-h-[32px] ${
            piece.spotId ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400'
          }`}
        >
          <MapPin size={10} /><span>{piece.spotId ? (spot?.code || 'BIN') : 'Bin'}</span>
        </button>
      </div>

      <div className="my-3">
        {item && (
          <p className="text-2xl sm:text-3xl font-black leading-none mb-2 text-slate-800">
            {(item.inputUnit === 'MM' || item.mmW || item.mmH) ? (
              <>{item.mmW || Math.round((item.width || 0) * 25.4)}<span className="text-base text-slate-400 mx-1">x</span>{item.mmH || Math.round((item.height || 0) * 25.4)}<span className="text-xs text-slate-400 ml-1">mm</span></>
            ) : (
              <>{item.inchW}{item.sootW ? <span className="text-lg">.{item.sootW}</span> : ''}<span className="text-base text-slate-400 mx-1">x</span>{item.inchH}{item.sootH ? <span className="text-lg">.{item.sootH}</span> : ''}</>
            )}
          </p>
        )}
        <p className="text-[10px] font-bold text-slate-500 uppercase leading-tight">{piece.specs}</p>
        {(item?.selectedServices && item.selectedServices.length > 0) && (
          <div className="flex flex-wrap justify-center gap-1 mt-2">
            {item.selectedServices.map(s => (
              <span key={s} className="px-2 py-0.5 bg-orange-50 text-orange-700 text-[9px] font-bold rounded border border-orange-100 uppercase">{s}</span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-auto pt-2">{actionRenderer()}</div>
    </div>
  );
};

export default JobCard;
