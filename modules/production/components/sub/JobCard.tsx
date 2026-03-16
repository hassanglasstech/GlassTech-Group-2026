
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
  
  // Clean Display ID: Extract the base numeric sequence (e.g., 2307) and the piece number
  // Format: OrderNumeric/PieceNumber
  const displayId = piece.id;

  return (
    <div className={`bg-white p-4 rounded-xl border-2 shadow-sm relative group transition-all flex flex-col justify-between text-center border-slate-200 hover:border-blue-300`}>
       <div className="flex justify-between items-start mb-2">
          <div className="flex flex-col items-start">
             <span className="text-xs font-black uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{displayId}</span>
          </div>
          <button onClick={onBinClick} className={`flex items-center space-x-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${piece.spotId ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400'}`}>
             <MapPin size={8}/> <span>{piece.spotId ? (spot?.code || 'BIN') : 'Bin'}</span>
          </button>
       </div>
       
       <div className="my-4">
           {item && (
                <p className={`text-3xl font-black leading-none mb-2 text-slate-800`}>
                    {item.inchW}{item.sootW ? <span className="text-xl">.{item.sootW}</span> : ''} 
                    <span className="text-lg text-slate-400 mx-1">x</span> 
                    {item.inchH}{item.sootH ? <span className="text-xl">.{item.sootH}</span> : ''}
                </p>
           )}
           <p className="text-[10px] font-bold text-slate-500 uppercase leading-tight">{piece.specs}</p>
           {(item?.selectedServices && item.selectedServices.length > 0) && (
               <div className="flex flex-wrap justify-center gap-1 mt-3">
                   {item.selectedServices.map(s => <span key={s} className="px-2 py-0.5 bg-orange-50 text-orange-700 text-[9px] font-bold rounded border border-orange-100 uppercase">{s}</span>)}
               </div>
           )}
       </div>
       
       <div className="mt-auto pt-2">
        {actionRenderer()}
       </div>
    </div>
  );
};

export default JobCard;
